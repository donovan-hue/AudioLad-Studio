/**
 * Medición de sonoridad integrada (aproximación EBU R128 / LUFS).
 * Filtro K-weighting (high-shelf + high-pass) y compuertas absoluta/relativa.
 * Es una estimación honesta para normalizar pistas, no un medidor certificado.
 */

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

// Coeficientes K-weighting de referencia a 48 kHz (BS.1770-4).
const SHELF: Biquad = {
  b0: 1.53512485958697,
  b1: -2.69169618940638,
  b2: 1.19839281085285,
  a1: -1.69065929318241,
  a2: 0.73248077421585,
};
const HIGHPASS: Biquad = {
  b0: 1,
  b1: -2,
  b2: 1,
  a1: -1.99004745483398,
  a2: 0.99007225036621,
};

function applyBiquad(input: Float32Array, coeff: Biquad): Float32Array {
  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i += 1) {
    const x0 = input[i]!;
    const y0 = coeff.b0 * x0 + coeff.b1 * x1 + coeff.b2 * x2 - coeff.a1 * y1 - coeff.a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

function meanSquare(input: Float32Array, from: number, to: number): number {
  let sum = 0;
  const end = Math.min(input.length, to);
  for (let i = from; i < end; i += 1) {
    const value = input[i]!;
    sum += value * value;
  }
  const count = Math.max(1, end - from);
  return sum / count;
}

function loudnessOfBlock(ms: number): number {
  return -0.691 + 10 * Math.log10(Math.max(1e-12, ms));
}

/** Devuelve LUFS integrados (puede ser -Infinity en silencio total). */
export function integratedLoudness(mono: Float32Array, sampleRate: number): number {
  if (mono.length === 0 || sampleRate <= 0) return -Infinity;
  const weighted = applyBiquad(applyBiquad(mono, SHELF), HIGHPASS);
  const blockSize = Math.max(1, Math.round(sampleRate * 0.4));
  const hop = Math.max(1, Math.round(blockSize / 4));
  const blocks: number[] = [];
  for (let start = 0; start + blockSize <= weighted.length; start += hop) {
    blocks.push(loudnessOfBlock(meanSquare(weighted, start, start + blockSize)));
  }
  if (blocks.length === 0) blocks.push(loudnessOfBlock(meanSquare(weighted, 0, weighted.length)));

  const gatedAbsolute = blocks.filter((value) => value > -70);
  if (gatedAbsolute.length === 0) return -Infinity;
  const absoluteMean = gatedAbsolute.reduce((sum, value) => sum + Math.pow(10, value / 10), 0) / gatedAbsolute.length;
  const relativeGate = -0.691 + 10 * Math.log10(absoluteMean) - 10;
  const gated = gatedAbsolute.filter((value) => value > relativeGate);
  const mean = (gated.length > 0 ? gated : gatedAbsolute).reduce((sum, value) => sum + Math.pow(10, value / 10), 0) /
    (gated.length > 0 ? gated.length : gatedAbsolute.length);
  return -0.691 + 10 * Math.log10(Math.max(1e-12, mean));
}

/** Ganancia (dB) que lleva una pista al objetivo, con límite de seguridad. */
export function normalizationGainDb(lufs: number | null | undefined, target = -14, maxDb = 12): number {
  if (lufs === null || lufs === undefined || !Number.isFinite(lufs) || lufs <= -70) return 0;
  return Math.min(maxDb, Math.max(-maxDb, target - lufs));
}
