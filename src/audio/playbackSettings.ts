/**
 * Preferencias de reproducción globales: shuffle, repeat, crossfade,
 * normalización, velocidad, keylock y EQ master de 10 bandas.
 */

export type RepeatMode = 'off' | 'all' | 'one';

export interface PlaybackSettings {
  shuffle: boolean;
  repeat: RepeatMode;
  /** Segundos de crossfade automático entre pistas de la cola (0 = corte). */
  crossfadeSec: number;
  /** Normalización de sonoridad por pista. */
  normalize: boolean;
  /** Multiplicador global de velocidad (0.5–2). */
  speed: number;
  /** Keylock: conserva el tono al cambiar la velocidad (si el navegador lo soporta). */
  keylock: boolean;
  /** Ganancias del EQ master en dB (10 bandas). */
  masterEq: number[];
}

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_MIN_DB = -12;
export const EQ_MAX_DB = 12;
export const TARGET_LUFS = -14;

export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
  shuffle: false,
  repeat: 'off',
  crossfadeSec: 0,
  normalize: true,
  speed: 1,
  keylock: false,
  masterEq: EQ_FREQUENCIES.map(() => 0),
};

const KEY = 'audiolad.playback.v1';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizePlaybackSettings(raw: unknown): PlaybackSettings {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<PlaybackSettings>;
  const repeat: RepeatMode = source.repeat === 'all' || source.repeat === 'one' ? source.repeat : 'off';
  const eqSource = Array.isArray(source.masterEq) ? source.masterEq : [];
  const masterEq = EQ_FREQUENCIES.map((_, index) => {
    const value = eqSource[index];
    return typeof value === 'number' && Number.isFinite(value) ? clamp(value, EQ_MIN_DB, EQ_MAX_DB) : 0;
  });
  return {
    shuffle: source.shuffle === true,
    repeat,
    crossfadeSec: typeof source.crossfadeSec === 'number' && Number.isFinite(source.crossfadeSec)
      ? clamp(source.crossfadeSec, 0, 12)
      : 0,
    normalize: source.normalize !== false,
    speed: typeof source.speed === 'number' && Number.isFinite(source.speed) ? clamp(source.speed, 0.5, 2) : 1,
    keylock: source.keylock === true,
    masterEq,
  };
}

export function loadPlaybackSettings(): PlaybackSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return normalizePlaybackSettings(raw ? (JSON.parse(raw) as unknown) : null);
  } catch {
    return normalizePlaybackSettings(null);
  }
}

export function savePlaybackSettings(settings: PlaybackSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* sin persistencia */
  }
}
