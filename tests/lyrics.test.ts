import { describe, expect, it } from 'vitest';
import { parseLyrics } from '../src/ui/lyrics.js';
import { audioFingerprint, fingerprintSimilarity } from '../src/audio/fingerprint.js';

describe('letras LRC', () => {
  it('parsea timestamps, varias marcas por línea y ordena', () => {
    const lines = parseLyrics('[00:12.50]Hola\n[00:05.00]Antes\n[01:02.25][00:20.00]Coro\n\n[ar:Artista]');
    expect(lines.map((line) => line.text)).toEqual(['Antes', 'Hola', 'Coro', 'Coro']);
    expect(lines[0]?.time).toBe(5);
    expect(lines[1]?.time).toBeCloseTo(12.5, 5);
    expect(lines[2]?.time).toBe(20);
    expect(lines[3]?.time).toBeCloseTo(62.25, 5);
  });

  it('acepta texto plano sin tiempos', () => {
    const lines = parseLyrics('Línea uno\nLínea dos');
    expect(lines.every((line) => line.time === null)).toBe(true);
    expect(lines).toHaveLength(2);
  });
});

describe('huella acústica', () => {
  it('es determinista y compara señales', () => {
    const sampleRate = 8000;
    const sine = (freq: number): Float32Array =>
      Float32Array.from({ length: 16000 }, (_, index) => Math.sin((2 * Math.PI * freq * index) / sampleRate) * 0.6);
    const a = audioFingerprint(sine(220), sampleRate);
    const b = audioFingerprint(sine(220), sampleRate);
    const c = audioFingerprint(sine(1800), sampleRate);
    expect(a).toHaveLength(64);
    expect(a).toBe(b);
    expect(fingerprintSimilarity(a, b)).toBe(1);
    expect(fingerprintSimilarity(a, c)).toBeLessThan(1);
    expect(fingerprintSimilarity('', a)).toBe(0);
  });
});
