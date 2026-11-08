/**
 * Huella acústica ligera (256 bits) para detectar duplicados difusos:
 * energía por 8 bandas logarítmicas × 32 ventanas temporales, umbralizada
 * contra la mediana. No sustituye a un fingerprint comercial, pero es local,
 * determinista y suficiente para avisar de versiones casi idénticas.
 */

const BANDS = 8;
const WINDOWS = 32;
const BITS = BANDS * WINDOWS;

function goertzel(data: Float32Array, start: number, length: number, frequency: number, sampleRate: number): number {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let s1 = 0;
  let s2 = 0;
  const end = Math.min(data.length, start + length);
  for (let i = start; i < end; i += 1) {
    const current = data[i]! + coeff * s1 - s2;
    s2 = s1;
    s1 = current;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

export function audioFingerprint(mono: Float32Array, sampleRate: number): string {
  if (mono.length === 0 || sampleRate <= 0) return '';
  const windowSize = Math.min(8192, Math.max(1024, Math.floor(mono.length / WINDOWS)));
  const frequencies = Array.from({ length: BANDS }, (_, index) => 80 * Math.pow(8000 / 80, index / (BANDS - 1)));
  const bits: number[] = [];
  for (let window = 0; window < WINDOWS; window += 1) {
    const start = Math.floor((window * (mono.length - windowSize)) / Math.max(1, WINDOWS - 1));
    const energies = frequencies.map((frequency) => Math.log1p(goertzel(mono, start, windowSize, frequency, sampleRate)));
    const sorted = [...energies].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    for (const energy of energies) bits.push(energy > median ? 1 : 0);
  }
  let hex = '';
  for (let i = 0; i < BITS; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4; j += 1) nibble = (nibble << 1) | (bits[i + j] ?? 0);
    hex += nibble.toString(16);
  }
  return hex;
}

/** Similitud 0..1 por bits coincidentes; 1 = huellas idénticas. */
export function fingerprintSimilarity(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 0;
  let same = 0;
  for (let i = 0; i < a.length; i += 1) {
    const xor = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    same += 4 - (xor.toString(2).match(/1/g)?.length ?? 0);
  }
  return same / (a.length * 4);
}
