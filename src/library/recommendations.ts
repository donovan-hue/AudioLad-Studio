/** Historial local de recomendaciones aceptadas/descartadas (sin nube). */

export type RecommendationAction = 'accepted' | 'dismissed';

export interface RecommendationEvent {
  trackId: string;
  seedId?: string;
  kind: 'similar' | 'radio' | 'mix' | 'next';
  action: RecommendationAction;
  at: string;
}

const KEY = 'audiolad.recommendations.v1';
const MAX = 200;

export function loadRecommendationHistory(): RecommendationEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is RecommendationEvent => {
      const event = item as Partial<RecommendationEvent>;
      return (
        typeof event.trackId === 'string' &&
        (event.action === 'accepted' || event.action === 'dismissed') &&
        typeof event.at === 'string' &&
        (event.kind === 'similar' || event.kind === 'radio' || event.kind === 'mix' || event.kind === 'next')
      );
    });
  } catch {
    return [];
  }
}

export function saveRecommendationHistory(events: readonly RecommendationEvent[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(events.slice(0, MAX)));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

export function recordRecommendation(
  events: readonly RecommendationEvent[],
  event: Omit<RecommendationEvent, 'at'>,
): RecommendationEvent[] {
  const next = [{ ...event, at: new Date().toISOString() }, ...events].slice(0, MAX);
  saveRecommendationHistory(next);
  return next;
}

export function dismissedIds(events: readonly RecommendationEvent[]): Set<string> {
  return new Set(events.filter((event) => event.action === 'dismissed').map((event) => event.trackId));
}
