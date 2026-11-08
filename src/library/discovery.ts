/**
 * Descubrimiento 100 % local: similitud por BPM/tonalidad/género, Camelot,
 * energía/estado de ánimo, mezclas diarias, radio encadenada, estadísticas y
 * resumen anual. Todo funciones puras sobre la biblioteca; sin red.
 */

import type { HistoryEvent, TrackMeta } from './library.js';
import type { KeyInfo } from '../audio/key.js';

export type Mood = 'relajado' | 'melódico' | 'energético' | 'oscuro' | 'festivo';

export const MOODS: readonly Mood[] = ['relajado', 'melódico', 'energético', 'oscuro', 'festivo'];

export interface Suggestion {
  track: TrackMeta;
  score: number;
  reasons: string[];
}

export interface DailyMix {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
}

export interface TopEntry {
  name: string;
  count: number;
}

export interface ListeningStats {
  totalTracks: number;
  totalPlays: number;
  minutes: number;
  uniqueArtists: number;
  uniqueGenres: number;
  favorites: number;
  averageBpm: number | null;
  topArtists: TopEntry[];
  topGenres: TopEntry[];
  topKeys: TopEntry[];
}

export interface WrappedSummary {
  year: number;
  minutes: number;
  plays: number;
  topTracks: TopEntry[];
  topArtists: TopEntry[];
  topGenres: TopEntry[];
  topKeys: TopEntry[];
  personality: string;
}

const CAMELOT_MAJOR: Record<string, number> = {
  C: 8, 'C#': 3, D: 10, 'D#': 5, E: 12, F: 7, 'F#': 2, G: 9, 'G#': 4, A: 11, 'A#': 6, B: 1,
};
const CAMELOT_MINOR: Record<string, number> = {
  C: 5, 'C#': 12, D: 7, 'D#': 2, E: 9, F: 4, 'F#': 11, G: 6, 'G#': 1, A: 8, 'A#': 3, B: 10,
};

export function camelotCode(key: KeyInfo | null | undefined): string | null {
  if (!key) return null;
  const table = key.mode === 'major' ? CAMELOT_MAJOR : CAMELOT_MINOR;
  const wheel = table[key.tonic];
  if (!wheel) return null;
  return `${wheel}${key.mode === 'major' ? 'B' : 'A'}`;
}

export function camelotDistance(a: string | null, b: string | null): number {
  if (!a || !b) return 0.5;
  const parse = (code: string): { wheel: number; letter: string } | null => {
    const match = /^(\d{1,2})([AB])$/.exec(code);
    return match ? { wheel: Number(match[1]), letter: match[2]! } : null;
  };
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return 0.5;
  if (left.letter === right.letter) {
    const diff = Math.abs(left.wheel - right.wheel);
    const circular = Math.min(diff, 12 - diff);
    return circular === 0 ? 0 : circular === 1 ? 0.15 : circular === 2 ? 0.45 : 1;
  }
  const sameWheel = left.wheel === right.wheel;
  return sameWheel ? 0.35 : 0.8;
}

export function harmonicScore(a: string | null, b: string | null): number {
  return 1 - camelotDistance(a, b);
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

/** Energía 0..1 derivada de BPM y loudness reales (sin etiquetas inventadas). */
export function energyOf(track: TrackMeta): number {
  const bpm = track.bpm && track.bpm > 0 ? clamp((track.bpm - 70) / 110) : 0.5;
  const loud = track.loudnessLufs != null && Number.isFinite(track.loudnessLufs) ? clamp((track.loudnessLufs + 26) / 20) : 0.5;
  return clamp(bpm * 0.65 + loud * 0.35);
}

export function moodOf(track: TrackMeta): Mood {
  const energy = energyOf(track);
  const minor = track.key?.mode === 'minor';
  if (energy < 0.34) return 'relajado';
  if (energy > 0.78) return minor ? 'oscuro' : 'festivo';
  if (minor) return 'oscuro';
  if (energy > 0.56) return 'energético';
  return 'melódico';
}

export function bpmDistance(a: number | null | undefined, b: number | null | undefined): number {
  if (!a || !b || a <= 0 || b <= 0) return 0.5;
  return clamp(Math.abs(a - b) / Math.max(a, b) / 0.12);
}

function tagOverlap(a: readonly string[] | undefined, b: readonly string[] | undefined): number {
  if (!a?.length || !b?.length) return 0;
  const left = new Set(a);
  const right = new Set(b);
  let shared = 0;
  for (const tag of left) if (right.has(tag)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

/** Similitud 0..1 con razones legibles para la UI. */
export function similarity(seed: TrackMeta, candidate: TrackMeta): { score: number; reasons: string[] } {
  if (seed.id === candidate.id) return { score: 0, reasons: [] };
  const reasons: string[] = [];
  const bpm = 1 - bpmDistance(seed.bpm, candidate.bpm);
  if (seed.bpm && candidate.bpm && Math.abs(seed.bpm - candidate.bpm) <= Math.max(2, seed.bpm * 0.03)) {
    reasons.push(`BPM ${Math.round(candidate.bpm)}`);
  }
  const seedCamelot = camelotCode(seed.key);
  const candidateCamelot = camelotCode(candidate.key);
  const harmonic = harmonicScore(seedCamelot, candidateCamelot);
  if (seedCamelot && candidateCamelot && harmonic >= 0.6) reasons.push(`${seedCamelot} → ${candidateCamelot}`);
  const genre = seed.genre && candidate.genre && seed.genre.toLowerCase() === candidate.genre.toLowerCase() ? 1 : 0;
  if (genre) reasons.push(seed.genre!);
  const tags = tagOverlap(seed.tags, candidate.tags);
  if (tags > 0) reasons.push('etiquetas en común');
  const energy = 1 - Math.abs(energyOf(seed) - energyOf(candidate));
  if (energy > 0.85) reasons.push('energía parecida');
  const sameArtistPenalty = seed.artist && candidate.artist && seed.artist.toLowerCase() === candidate.artist.toLowerCase() ? 0.06 : 0;
  const score = clamp(bpm * 0.34 + harmonic * 0.26 + genre * 0.2 + tags * 0.1 + energy * 0.1 - sameArtistPenalty);
  if (reasons.length === 0) reasons.push('afinidad local');
  return { score, reasons };
}

export interface SimilarOptions {
  limit?: number;
  exclude?: ReadonlySet<string>;
  minScore?: number;
}

export function similarTracks(seed: TrackMeta, tracks: readonly TrackMeta[], options: SimilarOptions = {}): Suggestion[] {
  const limit = options.limit ?? 8;
  const minScore = options.minScore ?? 0;
  return tracks
    .filter((track) => track.hasAudio && track.id !== seed.id && !options.exclude?.has(track.id))
    .map((track) => {
      const result = similarity(seed, track);
      return { track, score: result.score, reasons: result.reasons };
    })
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score || a.track.title.localeCompare(b.track.title))
    .slice(0, limit);
}

/** Radio infinita: cadena de similitud con memoria para no repetir ni estancarse. */
export function radioFrom(seed: TrackMeta, tracks: readonly TrackMeta[], count = 20): TrackMeta[] {
  const queue: TrackMeta[] = [seed];
  const used = new Set([seed.id]);
  while (queue.length < count) {
    const last = queue[queue.length - 1]!;
    const candidates = similarTracks(last, tracks, { limit: 6, exclude: used });
    const fallback = tracks.find((track) => track.hasAudio && !used.has(track.id));
    const next = candidates[0]?.track ?? fallback;
    if (!next) break;
    queue.push(next);
    used.add(next.id);
  }
  return queue;
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let state = seed || 1;
  for (let i = result.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

function dateSeed(date: Date): number {
  return Number(`${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`);
}

export function dailyMixes(tracks: readonly TrackMeta[], date = new Date()): DailyMix[] {
  const playable = tracks.filter((track) => track.hasAudio);
  if (playable.length === 0) return [];
  const seed = dateSeed(date);
  const shuffled = seededShuffle(playable, seed);
  const byPlays = [...playable].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));

  const today = [...byPlays.slice(0, 10), ...shuffled].filter((track, index, list) => list.findIndex((t) => t.id === track.id) === index).slice(0, 20);
  const energy = [...playable].filter((track) => energyOf(track) >= 0.58).sort((a, b) => energyOf(b) - energyOf(a)).slice(0, 20);
  const anchor = byPlays[0] ?? shuffled[0]!;
  const harmonic = radioFrom(anchor, playable, 20);
  const fresh = [...playable].sort((a, b) => (a.playCount ?? 0) - (b.playCount ?? 0) || b.addedAt.localeCompare(a.addedAt)).slice(0, 20);

  const mixes: DailyMix[] = [
    { id: 'daily-today', name: 'Mezcla diaria', description: `Lo que más suena hoy · ${today.length} pistas`, trackIds: today.map((t) => t.id) },
    { id: 'daily-energy', name: 'Pico de energía', description: 'BPM y loudness altos, sin inventar etiquetas', trackIds: energy.map((t) => t.id) },
    { id: 'daily-harmonic', name: `Cadena armónica · ${anchor.artist}`, description: 'Transiciones compatibles desde tu pista fuerte', trackIds: harmonic.map((t) => t.id) },
    { id: 'daily-fresh', name: 'Descubrimiento local', description: 'Pistas que has escuchado menos', trackIds: fresh.map((t) => t.id) },
  ];
  return mixes.filter((mix) => mix.trackIds.length > 0);
}

export function nextSuggestions(
  seed: TrackMeta | null | undefined,
  tracks: readonly TrackMeta[],
  exclude: ReadonlySet<string> = new Set(),
  dismissed: ReadonlySet<string> = new Set(),
  limit = 3,
): Suggestion[] {
  if (!seed) return [];
  const blocked = new Set([...exclude, ...dismissed, seed.id]);
  return similarTracks(seed, tracks, { limit, exclude: blocked });
}

export function newArrivals(tracks: readonly TrackMeta[], days = 30, now = Date.now()): TrackMeta[] {
  const cutoff = now - days * 86_400_000;
  return tracks
    .filter((track) => {
      const added = Date.parse(track.addedAt);
      return Number.isFinite(added) && added >= cutoff;
    })
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export function tracksByMood(tracks: readonly TrackMeta[], mood: Mood | 'todas'): TrackMeta[] {
  return mood === 'todas' ? [...tracks] : tracks.filter((track) => moodOf(track) === mood);
}

function topCounts(values: readonly string[], limit = 5): TopEntry[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function playsOf(track: TrackMeta): number {
  return Math.max(0, track.playCount ?? 0);
}

export function listeningStats(tracks: readonly TrackMeta[], events: readonly HistoryEvent[] = []): ListeningStats {
  const playedEvents = events.filter((event): event is Extract<HistoryEvent, { type: 'played' }> => event.type === 'played');
  const totalPlays = tracks.reduce((sum, track) => sum + playsOf(track), 0) || playedEvents.length;
  const secondsFromCounts = tracks.reduce((sum, track) => sum + track.durationSec * playsOf(track), 0);
  const secondsFromEvents = playedEvents.reduce((sum, event) => sum + (event.seconds || 0), 0);
  const minutes = Math.round((secondsFromCounts || secondsFromEvents) / 60);
  const artists = new Set(tracks.map((track) => track.artist).filter(Boolean));
  const genres = new Set(tracks.map((track) => track.genre ?? '').filter(Boolean));
  const bpms = tracks.map((track) => track.bpm).filter((bpm): bpm is number => typeof bpm === 'number' && bpm > 0);
  const weightedArtists = tracks.flatMap((track) => Array.from({ length: Math.max(1, playsOf(track)) }, () => track.artist));
  const weightedGenres = tracks.flatMap((track) => Array.from({ length: Math.max(1, playsOf(track)) }, () => track.genre ?? ''));
  const weightedKeys = tracks.flatMap((track) => Array.from({ length: Math.max(1, playsOf(track)) }, () => camelotCode(track.key) ?? ''));
  return {
    totalTracks: tracks.length,
    totalPlays,
    minutes,
    uniqueArtists: artists.size,
    uniqueGenres: genres.size,
    favorites: tracks.filter((track) => track.favorite).length,
    averageBpm: bpms.length > 0 ? Math.round((bpms.reduce((sum, bpm) => sum + bpm, 0) / bpms.length) * 10) / 10 : null,
    topArtists: topCounts(weightedArtists),
    topGenres: topCounts(weightedGenres),
    topKeys: topCounts(weightedKeys),
  };
}

export function wrappedSummary(tracks: readonly TrackMeta[], events: readonly HistoryEvent[], year: number): WrappedSummary {
  const played = events.filter(
    (event): event is Extract<HistoryEvent, { type: 'played' }> =>
      event.type === 'played' && new Date(event.at).getFullYear() === year,
  );
  const playCounts = new Map<string, number>();
  for (const event of played) playCounts.set(event.trackId, (playCounts.get(event.trackId) ?? 0) + 1);
  const base = tracks.map((track) => ({ track, count: playCounts.get(track.id) ?? playsOf(track) })).filter((entry) => entry.count > 0);
  const topTracks = base
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((entry) => ({ name: `${entry.track.artist} — ${entry.track.title}`, count: entry.count }));
  const stats = listeningStats(tracks, events);
  const seconds = played.reduce((sum, event) => sum + (event.seconds || 0), 0);
  const minutes = seconds > 0 ? Math.round(seconds / 60) : stats.minutes;
  const genre = stats.topGenres[0]?.name;
  const key = stats.topKeys[0]?.name;
  const personality = genre
    ? `Selector de ${genre.toLowerCase()}${key ? ` · rueda ${key}` : ''}`
    : 'Coleccionista local';
  return {
    year,
    minutes,
    plays: played.length || stats.totalPlays,
    topTracks,
    topArtists: stats.topArtists,
    topGenres: stats.topGenres,
    topKeys: stats.topKeys,
    personality,
  };
}
