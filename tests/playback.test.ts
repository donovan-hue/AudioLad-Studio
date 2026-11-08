import { describe, expect, it } from 'vitest';
import { integratedLoudness, normalizationGainDb } from '../src/audio/loudness';
import { DEFAULT_PLAYBACK_SETTINGS, normalizePlaybackSettings } from '../src/audio/playbackSettings';
import { audioBufferToWav } from '../src/audio/exportAudio';

function tone(amplitude: number, seconds = 1, sampleRate = 48000): Float32Array {
  const data = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * amplitude;
  }
  return data;
}

describe('sonoridad (LUFS aproximados)', () => {
  it('el silencio no tiene sonoridad integrada', () => {
    expect(integratedLoudness(new Float32Array(48000), 48000)).toBe(-Infinity);
  });

  it('una señal más fuerte mide más LUFS', () => {
    const quiet = integratedLoudness(tone(0.05), 48000);
    const loud = integratedLoudness(tone(0.5), 48000);
    expect(Number.isFinite(quiet)).toBe(true);
    expect(loud).toBeGreaterThan(quiet + 15);
  });

  it('calcula la ganancia de normalización con límite ±12 dB', () => {
    expect(normalizationGainDb(-14)).toBe(0);
    expect(normalizationGainDb(-20)).toBeCloseTo(6, 5);
    expect(normalizationGainDb(-2)).toBe(-12);
    expect(normalizationGainDb(-60)).toBe(12);
    expect(normalizationGainDb(null)).toBe(0);
    expect(normalizationGainDb(-Infinity)).toBe(0);
  });
});

describe('preferencias de reproducción', () => {
  it('usa valores por defecto seguros', () => {
    expect(normalizePlaybackSettings(null)).toEqual(DEFAULT_PLAYBACK_SETTINGS);
  });

  it('recorta valores fuera de rango y valida el EQ', () => {
    const settings = normalizePlaybackSettings({
      shuffle: true,
      repeat: 'one',
      crossfadeSec: 99,
      speed: 9,
      normalize: false,
      masterEq: [20, -99, 3, 'x', null, 1, 2, 3, 4, 5],
    });
    expect(settings.shuffle).toBe(true);
    expect(settings.repeat).toBe('one');
    expect(settings.crossfadeSec).toBe(12);
    expect(settings.speed).toBe(2);
    expect(settings.normalize).toBe(false);
    expect(settings.masterEq[0]).toBe(12);
    expect(settings.masterEq[1]).toBe(-12);
    expect(settings.masterEq[2]).toBe(3);
    expect(settings.masterEq[3]).toBe(0);
    expect(settings.masterEq).toHaveLength(10);
  });
});

describe('exportación WAV', () => {
  it('genera una cabecera RIFF/WAVE válida con PCM 16-bit', async () => {
    const buffer = {
      numberOfChannels: 2,
      sampleRate: 48000,
      length: 480,
      duration: 0.01,
      getChannelData: (channel: number) => tone(0.25, 0.01).map((value) => value * (channel === 0 ? 1 : 0.5)),
    } as unknown as AudioBuffer;
    const blob = audioBufferToWav(buffer);
    expect(blob.type).toBe('audio/wav');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = (offset: number, length: number): string => String.fromCharCode(...bytes.slice(offset, offset + length));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(text(12, 4)).toBe('fmt ');
    expect(text(36, 4)).toBe('data');
    expect(bytes.byteLength).toBe(44 + 480 * 2 * 2);
  });
});
