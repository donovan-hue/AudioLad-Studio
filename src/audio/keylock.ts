/**
 * Keylock por AudioWorklet: mantiene el tono original mientras el deck cambia
 * de tempo, con un pitch-shifter granular de 4 granos y baja latencia (~43 ms).
 *
 * Cadena: fadeGain → KeylockNode.input → (worklet | bypass) → KeylockNode.output.
 * A ratio 1 el worklet se puentea para no añadir latencia ni coloración.
 */

const PROCESSOR = `
class KeylockProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ratio', defaultValue: 1, minValue: 0.5, maxValue: 2 }];
  }
  constructor() {
    super();
    this.ring = [];
    this.write = 0;
    this.grains = [];
    this.spawn = 0;
    this.next = 0;
    this.ratio = 1;
  }
  ensureChannels(count) {
    if (this.ring.length === count) return;
    this.ring = [];
    for (let ch = 0; ch < count; ch += 1) this.ring.push(new Float32Array(32768));
    this.grains = [];
    for (let i = 0; i < 4; i += 1) this.grains.push({ start: -1, age: 0 });
    this.write = 0;
  }
  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const channels = Math.min(2, Math.max(1, input ? input.length : 1));
    this.ensureChannels(channels);
    const frames = output[0].length;
    const ratio = params.ratio[0] || 1;
    const inv = 1 / ratio;
    const size = 32768;
    const GRAIN = 1024;
    const HOP = 256;
    const LATENCY = 2048;

    for (let i = 0; i < frames; i += 1) {
      for (let ch = 0; ch < channels; ch += 1) {
        this.ring[ch][this.write] = input && input[ch] ? input[ch][i] : 0;
      }
      if (this.spawn <= 0) {
        const grain = this.grains[this.next];
        grain.start = this.write - LATENCY;
        grain.age = 0;
        this.next = (this.next + 1) % this.grains.length;
        this.spawn = HOP;
      }
      this.spawn -= 1;

      for (let ch = 0; ch < channels; ch += 1) {
        let sum = 0;
        let weight = 0;
        const ring = this.ring[ch];
        for (let g = 0; g < this.grains.length; g += 1) {
          const grain = this.grains[g];
          if (grain.start < 0 || grain.age >= GRAIN) continue;
          const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * grain.age) / GRAIN);
          const pos = grain.start + grain.age * inv;
          const base = Math.floor(pos);
          const frac = pos - base;
          const indexA = ((base % size) + size) % size;
          const indexB = (indexA + 1) % size;
          sum += (ring[indexA] + (ring[indexB] - ring[indexA]) * frac) * w;
          weight += w;
        }
        output[ch][i] = weight > 0.0001 ? sum / weight : 0;
      }
      for (let g = 0; g < this.grains.length; g += 1) {
        if (this.grains[g].start >= 0) this.grains[g].age += 1;
      }
      this.write = (this.write + 1) % size;
    }
    this.ratio = ratio;
    return true;
  }
}
registerProcessor('audiolad-keylock', KeylockProcessor);
`;

export class KeylockNode {
  readonly input: GainNode;
  readonly output: GainNode;
  private node: AudioWorkletNode | null = null;
  private param: AudioParam | null = null;
  private loaded = false;
  private loading: Promise<boolean> | null = null;
  private active = false;
  private ratio = 1;
  private enabled = false;

  constructor(private readonly ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.input.connect(this.output);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get isActive(): boolean {
    return this.active;
  }

  async enable(): Promise<boolean> {
    this.enabled = true;
    if (!this.loaded) {
      this.loading ??= this.load();
      const ok = await this.loading;
      if (!ok) {
        this.enabled = false;
        return false;
      }
    }
    this.apply();
    return true;
  }

  disable(): void {
    this.enabled = false;
    this.bypass();
  }

  setRatio(ratio: number): void {
    this.ratio = Math.min(2, Math.max(0.5, ratio));
    if (this.param) this.param.setTargetAtTime(this.ratio, this.ctx.currentTime, 0.01);
    if (!this.enabled) return;
    if (Math.abs(this.ratio - 1) < 0.004) this.bypass();
    else this.apply();
  }

  private async load(): Promise<boolean> {
    if (!this.ctx.audioWorklet) return false;
    try {
      const url = URL.createObjectURL(new Blob([PROCESSOR], { type: 'text/javascript' }));
      try {
        await this.ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const node = new AudioWorkletNode(this.ctx, 'audiolad-keylock', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
      });
      this.node = node;
      this.param = node.parameters.get('ratio') ?? null;
      if (this.param) this.param.value = this.ratio;
      this.loaded = true;
      return true;
    } catch {
      this.node = null;
      this.param = null;
      return false;
    }
  }

  private apply(): void {
    if (!this.node || this.active) return;
    this.input.disconnect();
    this.input.connect(this.node);
    this.node.connect(this.output);
    this.active = true;
  }

  private bypass(): void {
    if (!this.active) return;
    if (this.node) {
      try {
        this.node.disconnect();
      } catch {
        /* desconectado */
      }
    }
    this.input.disconnect();
    this.input.connect(this.output);
    this.active = false;
  }
}
