import { describe, expect, it } from 'vitest';
import type { TrackMeta } from '../src/library/library.js';
import {
  camelotCode,
  camelotDistance,
  dailyMixes,
  energyOf,
  listeningStats,
  moodOf,
  newArrivals,
  nextSuggestions,
  radioFrom,
  similarity,
  wrappedSummary,
} from '../src/library/discovery.js';

function track(id: string, overrides: Partial<TrackMeta> = {}): TrackMeta {
  return {
    id,
    addedAt: new Date().toISOString(),
    fileName: `${id}.mp3`,
    title: id,
    artist: 'Artista',
    album: '',
    bpm: 124,
    bpmSource: 'estimated',
    durationSec: 180,
    sizeBytes: 1000,
    peaks: [0.2, 0.6],
    hasAudio: true,
    analysis: 'complete',
    key: { tonic: 'A', mode: 'minor', label: 'Am', confidence: 0.8 },
    genre: 'House',
    loudnessLufs: -9,
    playCount: 0,
    ...overrides,
  };
}

describe('Camelot', () => {
  it('mapea tonalidades a la rueda', () => {
    expect(camelotCode({ tonic: 'A', mode: 'minor', label: 'Am', confidence: 1 })).toBe('8A');
    expect(camelotCode({ tonic: 'C', mode: 'major', label: 'C', confidence: 1 })).toBe('8B');
    expect(camelotCode({ tonic: 'F#', mode: 'minor', label: 'F#m', confidence: 1 })).toBe('11A');
    expect(camelotCode(null)).toBeNull();
  });

  it('considera compatibles misma rueda y vecinas', () => {
    expect(camelotDistance('8A', '8A')).toBe(0);
    expect(camelotDistance('8A', '8B')).toBeLessThan(0.5);
    expect(camelotDistance('8A', '9A')).toBeLessThan(0.3);
    expect(camelotDistance('8A', '2A')).toBeGreaterThan(0.5);
  });
});

describe('similitud y energía', () => {
  const seed = track('seed', { bpm: 124, key: { tonic: 'A', mode: 'minor', label: 'Am', confidence: 1 }, genre: 'House' });
  it('prefiere BPM y tonalidad compatibles', () => {
    const close = track('close', { bpm: 126, key: { tonic: 'A', mode: 'minor', label: 'Am', confidence: 1 } });
    const far = track('far', { bpm: 90, key: { tonic: 'C', mode: 'major', label: 'C', confidence: 1 }, genre: 'Ambient' });
    expect(similarity(seed, close).score).toBeGreaterThan(similarity(seed, far).score);
    expect(similarity(seed, close).reasons.join(' ')).toMatch(/BPM|8A/);
  });

  it('calcula energía y estado de ánimo de forma monótona', () => {
    expect(energyOf(track('fast', { bpm: 170, loudnessLufs: -5 }))).toBeGreaterThan(
      energyOf(track('slow', { bpm: 80, loudnessLufs: -20 })),
    );
    expect(moodOf(track('chill', { bpm: 80, loudnessLufs: -18 }))).toBe('relajado');
    expect(moodOf(track('peak', { bpm: 174, loudnessLufs: -6 }))).toBe('oscuro');
  });
});

describe('radio y mezclas', () => {
  const tracks = Array.from({ length: 30 }, (_, index) =>
    track(`t${index}`, {
      bpm: 120 + (index % 8),
      genre: index % 2 === 0 ? 'House' : 'Techno',
      playCount: index % 4,
      addedAt: new Date(Date.now() - index * 86_400_000).toISOString(),
    }),
  );

  it('encadena sin repetir y respeta el límite', () => {
    const radio = radioFrom(tracks[0]!, tracks, 12);
    expect(radio).toHaveLength(12);
    expect(new Set(radio.map((entry) => entry.id)).size).toBe(12);
  });

  it('genera mezclas diarias estables y no vacías', () => {
    const date = new Date(2026, 10, 8);
    const first = dailyMixes(tracks, date);
    const second = dailyMixes(tracks, date);
    expect(first.length).toBeGreaterThan(0);
    expect(first.map((mix) => mix.trackIds)).toEqual(second.map((mix) => mix.trackIds));
    expect(first.every((mix) => mix.trackIds.length > 0)).toBe(true);
  });

  it('sugiere la siguiente pista excluyendo descartadas', () => {
    const dismissed = new Set(['t1', 't2']);
    const suggestions = nextSuggestions(tracks[0]!, tracks, new Set(['t0']), dismissed, 3);
    expect(suggestions).toHaveLength(3);
    expect(suggestions.every((entry) => !dismissed.has(entry.track.id))).toBe(true);
  });
});

describe('estadísticas y wrapped', () => {
  const tracks = [
    track('a', { artist: 'Uno', genre: 'House', playCount: 5, durationSec: 120 }),
    track('b', { artist: 'Dos', genre: 'Techno', playCount: 2, durationSec: 180 }),
    track('c', { artist: 'Uno', genre: 'House', playCount: 1, durationSec: 60 }),
  ];
  const events = [
    { type: 'played' as const, trackId: 'a', deck: 'A' as const, at: '2026-03-01T20:00:00.000Z', seconds: 120 },
    { type: 'played' as const, trackId: 'a', deck: 'B' as const, at: '2026-03-02T20:00:00.000Z', seconds: 120 },
    { type: 'played' as const, trackId: 'b', deck: 'A' as const, at: '2025-12-31T20:00:00.000Z', seconds: 180 },
  ];

  it('resume la escucha y los gustos', () => {
    const stats = listeningStats(tracks, events);
    expect(stats.totalTracks).toBe(3);
    expect(stats.totalPlays).toBe(8);
    expect(stats.minutes).toBe(17);
    expect(stats.uniqueArtists).toBe(2);
    expect(stats.topArtists[0]?.name).toBe('Uno');
    expect(stats.topGenres[0]?.name).toBe('House');
  });

  it('construye el resumen anual solo con el año pedido', () => {
    const wrapped = wrappedSummary(tracks, events, 2026);
    expect(wrapped.year).toBe(2026);
    expect(wrapped.plays).toBe(2);
    expect(wrapped.minutes).toBe(4);
    expect(wrapped.topTracks[0]?.name).toMatch(/Uno — a/);
    expect(wrapped.personality).toMatch(/house/i);
  });

  it('detecta novedades recientes', () => {
    const now = Date.parse('2026-11-08T00:00:00.000Z');
    const arrivals = newArrivals(
      [track('nuevo', { addedAt: '2026-11-01T00:00:00.000Z' }), track('viejo', { addedAt: '2026-01-01T00:00:00.000Z' })],
      30,
      now,
    );
    expect(arrivals.map((entry) => entry.id)).toEqual(['nuevo']);
  });
});

describe('rutas de descubrimiento', () => {
  it('reconoce #/discover y la genera de vuelta', async () => {
    const { parseRoute, routeToHash } = await import('../src/ui/router.js');
    expect(parseRoute('#/discover')).toEqual({ name: 'discover' });
    expect(routeToHash({ name: 'discover' })).toBe('#/discover');
  });
});
