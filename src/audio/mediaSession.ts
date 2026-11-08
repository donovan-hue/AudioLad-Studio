/**
 * Integración con la Media Session API: metadatos, controles del sistema y
 * posición de reproducción (pantalla de bloqueo, teclas multimedia).
 */

export interface SessionTrack {
  title: string;
  artist: string;
  album: string;
  artwork?: string;
  duration: number;
}

export interface SessionHandlers {
  play(): void;
  pause(): void;
  stop(): void;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
}

export function mediaSessionAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
}

export function updateSessionTrack(track: SessionTrack | null): void {
  if (!mediaSessionAvailable()) return;
  if (!track) {
    navigator.mediaSession.metadata = null;
    return;
  }
  const artwork = track.artwork
    ? [{ src: track.artwork, sizes: '96x96', type: 'image/jpeg' }]
    : [];
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork,
  });
}

export function updateSessionState(playing: boolean, position: number, duration: number, rate = 1): void {
  if (!mediaSessionAvailable()) return;
  navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  if (duration > 0 && Number.isFinite(position)) {
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(duration, Math.max(0, position)),
        playbackRate: Math.min(2, Math.max(0.5, rate)),
      });
    } catch {
      /* position state no soportado */
    }
  }
}

export function bindSessionHandlers(handlers: SessionHandlers): void {
  if (!mediaSessionAvailable()) return;
  const set = (action: MediaSessionAction, fn: MediaSessionActionHandler | null): void => {
    try {
      navigator.mediaSession.setActionHandler(action, fn);
    } catch {
      /* acción no soportada */
    }
  };
  set('play', () => handlers.play());
  set('pause', () => handlers.pause());
  set('stop', () => handlers.stop());
  set('nexttrack', () => handlers.next());
  set('previoustrack', () => handlers.previous());
  set('seekto', (details) => {
    if (typeof details.seekTime === 'number') handlers.seek(details.seekTime);
  });
  set('seekforward', () => handlers.seek(Number.NaN));
  set('seekbackward', () => handlers.seek(Number.NaN));
}
