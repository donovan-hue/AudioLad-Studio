/**
 * Restauración de sesión: qué pista estaba en cada deck y en qué posición.
 * No reanuda audio automáticamente (los navegadores lo bloquean sin gesto).
 */

export interface DeckSession {
  trackId: string;
  position: number;
  bpm: number | null;
  bpmSource: 'tag' | 'estimated' | 'manual';
}

export interface SessionSnapshot {
  decks: { A: DeckSession | null; B: DeckSession | null };
  savedAt: string;
}

const KEY = 'audiolad.session.v1';

export function saveSession(snapshot: SessionSnapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    /* sin persistencia */
  }
}

export function loadSession(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionSnapshot>;
    if (!parsed || typeof parsed !== 'object' || !parsed.decks) return null;
    const deck = (value: unknown): DeckSession | null => {
      if (!value || typeof value !== 'object') return null;
      const item = value as Partial<DeckSession>;
      if (typeof item.trackId !== 'string' || typeof item.position !== 'number') return null;
      return {
        trackId: item.trackId,
        position: Math.max(0, item.position),
        bpm: typeof item.bpm === 'number' ? item.bpm : null,
        bpmSource: item.bpmSource === 'manual' || item.bpmSource === 'tag' ? item.bpmSource : 'estimated',
      };
    };
    return {
      decks: { A: deck(parsed.decks.A), B: deck(parsed.decks.B) },
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* sin persistencia */
  }
}
