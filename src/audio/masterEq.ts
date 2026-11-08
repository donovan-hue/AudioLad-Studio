/**
 * EQ master de 10 bandas (31 Hz–16 kHz) sobre el bus principal.
 * Las bandas extremas usan shelving; el resto, peaking con Q musical.
 */

import { EQ_FREQUENCIES } from './playbackSettings.js';

export class MasterEq {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly filters: BiquadFilterNode[];

  constructor(ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.filters = EQ_FREQUENCIES.map((frequency, index) => {
      const filter = ctx.createBiquadFilter();
      filter.type = index === 0 ? 'lowshelf' : index === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
      filter.frequency.value = frequency;
      filter.Q.value = 1.05;
      filter.gain.value = 0;
      return filter;
    });
    let previous: AudioNode = this.input;
    for (const filter of this.filters) {
      previous.connect(filter);
      previous = filter;
    }
    previous.connect(this.output);
  }

  setGains(gains: readonly number[]): void {
    this.filters.forEach((filter, index) => {
      const value = gains[index];
      if (typeof value === 'number' && Number.isFinite(value)) {
        filter.gain.setTargetAtTime(Math.min(12, Math.max(-12, value)), filter.context.currentTime, 0.04);
      }
    });
  }

  get gains(): number[] {
    return this.filters.map((filter) => filter.gain.value);
  }
}
