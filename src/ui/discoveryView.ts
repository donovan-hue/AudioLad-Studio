/**
 * Página Descubrir: mezclas diarias, radio local, sugerencias por deck,
 * energía/estado de ánimo, novedades, estadísticas y resumen anual.
 * Todo el cálculo ocurre en el navegador; no se envía nada a la nube.
 */

import type { HistoryEvent, TrackMeta } from '../library/library.js';
import type { RecommendationEvent } from '../library/recommendations.js';
import type { DeckId } from '../audio/deck.js';
import {
  MOODS,
  camelotCode,
  dailyMixes,
  energyOf,
  listeningStats,
  moodOf,
  newArrivals,
  nextSuggestions,
  wrappedSummary,
  type DailyMix,
  type Mood,
  type Suggestion,
} from '../library/discovery.js';
import { artwork, emptyState, h, openModal, sectionHeader } from './components.js';
import { icon } from './icons.js';

export interface DiscoveryCallbacks {
  onPlay(trackId: string): void;
  onEnqueue(trackId: string): void;
  onLoadToDeck(trackId: string, deckId: DeckId): void;
  onPlayMix(trackIds: string[], name: string): void;
  onStartRadio(seedId: string): void;
  onRecommendation(event: Omit<RecommendationEvent, 'at'>): void;
}

export interface DiscoveryState {
  tracks: readonly TrackMeta[];
  events: readonly HistoryEvent[];
  loaded: Partial<Record<DeckId, TrackMeta>>;
  history: readonly RecommendationEvent[];
}

export class DiscoveryView {
  readonly el: HTMLElement;
  private state: DiscoveryState = { tracks: [], events: [], loaded: {}, history: [] };
  private mood: Mood | 'todas' = 'todas';
  private dismissed = new Set<string>();

  constructor(private readonly cb: DiscoveryCallbacks) {
    this.el = h('div', { className: 'discovery-view' });
  }

  render(state: DiscoveryState): void {
    this.state = state;
    for (const event of state.history) {
      if (event.action === 'dismissed') this.dismissed.add(event.trackId);
    }
    this.el.textContent = '';
    if (state.tracks.length === 0) {
      this.el.appendChild(
        emptyState('sparkles', 'Todavía no hay nada que descubrir', 'Importa audio y aquí aparecerán mezclas, radio y sugerencias calculadas en tu navegador.'),
      );
      return;
    }
    this.el.appendChild(this.hero());
    const affinity = this.affinitySection();
    if (affinity) this.el.appendChild(affinity);
    const mixes = dailyMixes(state.tracks);
    if (mixes.length > 0) this.el.appendChild(this.mixesSection(mixes));
    this.el.appendChild(this.deckSection());
    this.el.appendChild(this.radioSection());
    this.el.appendChild(this.moodSection());
    this.el.appendChild(this.arrivalsSection());
    this.el.appendChild(this.statsSection());
    this.el.appendChild(this.historySection());
  }

  private hero(): HTMLElement {
    const hero = h('section', { className: 'discovery-hero' });
    const copy = h('div', { className: 'discovery-hero-copy' });
    copy.append(
      h('span', { className: 'home-eyebrow', text: 'Sin nube · sin cuentas' }),
      h('h1', { className: 'page-title', text: 'Descubrir' }),
      h('p', {
        className: 'home-subtitle',
        text: 'Mezclas, radio y recomendaciones calculadas con tu biblioteca local: BPM, tonalidad Camelot, género, energía y lo que ya has escuchado.',
      }),
    );
    const badge = h('span', { className: 'discovery-local-badge' });
    badge.innerHTML = `${icon('check', 14)}<span>100 % local</span>`;
    copy.appendChild(badge);
    hero.appendChild(copy);
    return hero;
  }

  private mixesSection(mixes: DailyMix[]): HTMLElement {
    const section = h('section', { className: 'home-section' });
    section.appendChild(sectionHeader('Mezclas diarias', { label: 'Se renuevan cada día' }));
    const row = h('div', { className: 'mix-row' });
    for (const mix of mixes) {
      const tracks = mix.trackIds.map((id) => this.state.tracks.find((track) => track.id === id)).filter((track): track is TrackMeta => !!track);
      const first = tracks[0];
      const card = h('article', { className: 'mix-card' });
      const art = h('button', {
        className: 'mix-art',
        attrs: { type: 'button', 'aria-label': `Reproducir ${mix.name}` },
      });
      art.appendChild(artwork(first?.artwork, mix.name, 'mix-artwork'));
      art.appendChild(h('span', { className: 'mix-play' }));
      art.querySelector('.mix-play')!.innerHTML = icon('play', 18);
      card.appendChild(art);
      card.append(
        h('strong', { className: 'mix-name', text: mix.name }),
        h('small', { className: 'mix-desc', text: mix.description }),
      );
      const play = h('button', { className: 'btn btn-primary btn-mini', text: 'Reproducir mezcla', attrs: { type: 'button' } });
      play.addEventListener('click', () => this.cb.onPlayMix(mix.trackIds, mix.name));
      card.appendChild(play);
      // El propio botón de portada inicia la mezcla.
      row.appendChild(card);
    }
    section.appendChild(row);
    return section;
  }

  private affinitySection(): HTMLElement | null {
    const seed =
      [...this.state.tracks]
        .filter((track) => track.hasAudio)
        .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.playCount ?? 0) - (a.playCount ?? 0))[0] ?? null;
    if (!seed) return null;
    const suggestions = nextSuggestions(seed, this.state.tracks, new Set([seed.id]), this.dismissed, 6);
    if (suggestions.length === 0) return null;
    const section = h('section', { className: 'home-section' });
    section.appendChild(
      sectionHeader(`Afines a ${seed.artist} — ${seed.title}`, {
        label: 'Por BPM · tonalidad Camelot · género · energía',
      }),
    );
    const grid = h('div', { className: 'suggest-grid' });
    const column = h('div', { className: 'suggest-column affinity-column' });
    for (const suggestion of suggestions) column.appendChild(this.suggestionRow(suggestion, null, 'similar'));
    grid.appendChild(column);
    section.appendChild(grid);
    return section;
  }

  private deckSection(): HTMLElement {
    const section = h('section', { className: 'home-section' });
    section.appendChild(sectionHeader('Siguiente para cada deck', { label: 'Sugerencias armónicas' }));
    const grid = h('div', { className: 'suggest-grid' });
    for (const deckId of ['A', 'B'] as const) {
      const seed = this.state.loaded[deckId];
      const column = h('div', { className: 'suggest-column' });
      const head = h('div', { className: 'suggest-head' });
      head.append(
        h('span', { className: `deck-pill deck-pill-${deckId.toLowerCase()}`, text: `Deck ${deckId}` }),
        h('span', {
          className: 'suggest-seed',
          text: seed ? `${seed.artist} — ${seed.title}${camelotCode(seed.key) ? ` · ${camelotCode(seed.key)}` : ''}` : 'Sin pista cargada',
        }),
      );
      column.appendChild(head);
      if (!seed) {
        column.appendChild(h('p', { className: 'modal-hint', text: 'Carga una pista en la cabina para recibir la siguiente sugerencia.' }));
        grid.appendChild(column);
        continue;
      }
      const suggestions = nextSuggestions(seed, this.state.tracks, new Set([seed.id]), this.dismissed, 3);
      if (suggestions.length === 0) {
        column.appendChild(h('p', { className: 'modal-hint', text: 'No hay más pistas compatibles en la biblioteca.' }));
      }
      for (const suggestion of suggestions) column.appendChild(this.suggestionRow(suggestion, deckId, 'next'));
      grid.appendChild(column);
    }
    section.appendChild(grid);
    return section;
  }

  private suggestionRow(suggestion: Suggestion, deckId: DeckId | null, kind: RecommendationEvent['kind']): HTMLElement {
    const track = suggestion.track;
    const row = h('div', { className: 'suggest-row' });
    row.appendChild(artwork(track.artwork, track.title, 'suggest-art'));
    const info = h('div', { className: 'suggest-info' });
    info.append(
      h('strong', { text: track.title }),
      h('small', { text: `${track.artist}${track.bpm ? ` · ${Math.round(track.bpm)} BPM` : ''}` }),
    );
    const reasons = h('span', { className: 'suggest-reasons' });
    const camelot = camelotCode(track.key);
    if (camelot) reasons.appendChild(h('span', { className: 'reason-chip harmonic', text: camelot }));
    for (const reason of suggestion.reasons.slice(0, 2)) reasons.appendChild(h('span', { className: 'reason-chip', text: reason }));
    info.appendChild(reasons);
    row.appendChild(info);
    const actions = h('div', { className: 'suggest-actions' });
    const play = h('button', { className: 'btn btn-mini', text: '▶', attrs: { type: 'button', title: 'Reproducir y aceptar' } });
    const seedId = deckId ? this.state.loaded[deckId]?.id : undefined;
    play.addEventListener('click', () => {
      this.cb.onRecommendation({ trackId: track.id, seedId, kind, action: 'accepted' });
      this.dismissed.delete(track.id);
      this.cb.onPlay(track.id);
    });
    const dismiss = h('button', { className: 'btn btn-mini icon-btn', attrs: { type: 'button', title: 'Descartar', 'aria-label': `Descartar ${track.title}` } });
    dismiss.innerHTML = icon('close', 13);
    dismiss.addEventListener('click', () => {
      this.cb.onRecommendation({ trackId: track.id, seedId, kind, action: 'dismissed' });
      this.dismissed.add(track.id);
      row.remove();
    });
    if (deckId) {
      const load = h('button', { className: 'btn btn-mini', text: `→ ${deckId}`, attrs: { type: 'button', title: `Cargar en Deck ${deckId}` } });
      load.addEventListener('click', () => {
        this.cb.onRecommendation({ trackId: track.id, seedId, kind, action: 'accepted' });
        this.dismissed.delete(track.id);
        this.cb.onLoadToDeck(track.id, deckId);
      });
      actions.append(play, load, dismiss);
    } else {
      actions.append(play, dismiss);
    }
    row.appendChild(actions);
    return row;
  }

  private radioSection(): HTMLElement {
    const section = h('section', { className: 'home-section' });
    section.appendChild(sectionHeader('Radio infinita', { label: 'Cadena de similitud' }));
    const controls = h('div', { className: 'radio-controls' });
    const select = document.createElement('select');
    select.className = 'radio-seed';
    select.setAttribute('aria-label', 'Pista semilla de la radio');
    for (const track of [...this.state.tracks].filter((entry) => entry.hasAudio).sort((a, b) => a.title.localeCompare(b.title))) {
      const option = document.createElement('option');
      option.value = track.id;
      option.textContent = `${track.artist} — ${track.title}`;
      select.appendChild(option);
    }
    const preferred = this.state.loaded.A?.id ?? this.state.loaded.B?.id;
    if (preferred) select.value = preferred;
    const start = h('button', { className: 'btn btn-primary', text: 'Iniciar radio', attrs: { type: 'button' } });
    start.addEventListener('click', () => this.cb.onStartRadio(select.value));
    controls.append(select, start);
    section.appendChild(controls);
    section.appendChild(h('p', { className: 'modal-hint', text: 'Cada pista se elige por cercanía de BPM, compatibilidad Camelot y género; nunca repite.' }));
    return section;
  }

  private moodSection(): HTMLElement {
    const section = h('section', { className: 'home-section' });
    section.appendChild(sectionHeader('Explorar por energía y ánimo', { label: 'Calculado con BPM, loudness y tonalidad' }));
    const chips = h('div', { className: 'mood-chips' });
    const options: (Mood | 'todas')[] = ['todas', ...MOODS];
    for (const mood of options) {
      const chip = h('button', {
        className: `chip ${this.mood === mood ? 'active' : ''}`,
        text: mood === 'todas' ? 'Todas' : mood.charAt(0).toUpperCase() + mood.slice(1),
        attrs: { type: 'button' },
      });
      chip.addEventListener('click', () => {
        this.mood = mood;
        this.render(this.state);
      });
      chips.appendChild(chip);
    }
    section.appendChild(chips);
    const filtered = (this.mood === 'todas' ? this.state.tracks : this.state.tracks.filter((track) => moodOf(track) === this.mood))
      .filter((track) => track.hasAudio)
      .sort((a, b) => energyOf(b) - energyOf(a))
      .slice(0, 12);
    const grid = h('div', { className: 'discovery-track-grid' });
    for (const track of filtered) grid.appendChild(this.trackCard(track));
    if (filtered.length === 0) grid.appendChild(h('p', { className: 'modal-hint', text: 'Ninguna pista encaja en este ánimo todavía.' }));
    section.appendChild(grid);
    return section;
  }

  private trackCard(track: TrackMeta): HTMLElement {
    const card = h('article', { className: 'discovery-track' });
    card.appendChild(artwork(track.artwork, track.title, 'discovery-art'));
    const info = h('div', { className: 'discovery-track-info' });
    info.append(h('strong', { text: track.title }), h('small', { text: track.artist }));
    const meta = h('span', { className: 'discovery-track-meta' });
    if (track.bpm) meta.appendChild(h('span', { className: 'reason-chip', text: `${Math.round(track.bpm)} BPM` }));
    const camelot = camelotCode(track.key);
    if (camelot) meta.appendChild(h('span', { className: 'reason-chip harmonic', text: camelot }));
    meta.appendChild(h('span', { className: 'reason-chip', text: moodOf(track) }));
    info.appendChild(meta);
    card.appendChild(info);
    const play = h('button', { className: 'btn btn-mini', text: '▶', attrs: { type: 'button', title: `Reproducir ${track.title}` } });
    play.addEventListener('click', () => this.cb.onPlay(track.id));
    const queue = h('button', { className: 'btn btn-mini', text: '＋', attrs: { type: 'button', title: 'Añadir a la cola' } });
    queue.addEventListener('click', () => this.cb.onEnqueue(track.id));
    card.append(play, queue);
    return card;
  }

  private arrivalsSection(): HTMLElement {
    const section = h('section', { className: 'home-section' });
    const arrivals = newArrivals(this.state.tracks, 30).slice(0, 10);
    section.appendChild(sectionHeader('Novedades de tu biblioteca', { label: 'Últimos 30 días' }));
    if (arrivals.length === 0) {
      section.appendChild(h('p', { className: 'modal-hint', text: 'Sin incorporaciones en los últimos 30 días.' }));
      return section;
    }
    const grid = h('div', { className: 'discovery-track-grid' });
    for (const track of arrivals) grid.appendChild(this.trackCard(track));
    section.appendChild(grid);
    return section;
  }

  private statsSection(): HTMLElement {
    const stats = listeningStats(this.state.tracks, this.state.events);
    const section = h('section', { className: 'home-section' });
    section.appendChild(sectionHeader('Estadísticas de escucha', { label: 'Datos reales de tu biblioteca' }));
    const grid = h('div', { className: 'stats-grid' });
    const cards: [string, string][] = [
      [String(stats.totalTracks), 'pistas'],
      [String(stats.totalPlays), 'reproducciones'],
      [stats.minutes >= 60 ? `${(stats.minutes / 60).toFixed(1)} h` : `${stats.minutes} min`, 'escuchadas'],
      [String(stats.uniqueArtists), 'artistas'],
      [String(stats.uniqueGenres), 'géneros'],
      [stats.averageBpm ? `${stats.averageBpm}` : '—', 'BPM medio'],
    ];
    for (const [value, label] of cards) {
      const card = h('div', { className: 'stat-card' });
      card.append(h('strong', { text: value }), h('span', { text: label }));
      grid.appendChild(card);
    }
    section.appendChild(grid);
    const tops = h('div', { className: 'top-lists' });
    tops.append(
      this.topList('Artistas', stats.topArtists),
      this.topList('Géneros', stats.topGenres),
      this.topList('Rueda Camelot', stats.topKeys),
    );
    section.appendChild(tops);
    const wrapped = h('button', { className: 'btn btn-ghost', text: 'Ver mi resumen del año', attrs: { type: 'button' } });
    wrapped.addEventListener('click', () => this.showWrapped());
    section.appendChild(wrapped);
    return section;
  }

  private topList(title: string, entries: { name: string; count: number }[]): HTMLElement {
    const box = h('div', { className: 'top-list' });
    box.appendChild(h('h4', { text: title }));
    if (entries.length === 0) box.appendChild(h('p', { className: 'modal-hint', text: 'Sin datos suficientes.' }));
    const list = document.createElement('ol');
    for (const entry of entries) {
      const item = document.createElement('li');
      item.append(h('span', { text: entry.name }), h('b', { text: String(entry.count) }));
      list.appendChild(item);
    }
    box.appendChild(list);
    return box;
  }

  private showWrapped(): void {
    const year = new Date().getFullYear();
    const summary = wrappedSummary(this.state.tracks, this.state.events, year);
    const modal = openModal({ title: `Tu ${year} en AudioLad`, className: 'wrapped-modal' });
    const hero = h('div', { className: 'wrapped-hero' });
    hero.append(
      h('span', { className: 'home-eyebrow', text: summary.personality }),
      h('strong', { className: 'wrapped-minutes', text: summary.minutes >= 60 ? `${(summary.minutes / 60).toFixed(1)} h` : `${summary.minutes} min` }),
      h('span', { text: `${summary.plays} reproducciones · ${summary.topArtists.length} artistas en el podio` }),
    );
    modal.body.appendChild(hero);
    for (const [title, entries] of [
      ['Pistas más escuchadas', summary.topTracks],
      ['Artistas', summary.topArtists],
      ['Géneros', summary.topGenres],
      ['Rueda Camelot', summary.topKeys],
    ] as const) {
      modal.body.appendChild(this.topList(title, entries));
    }
  }

  private historySection(): HTMLElement {
    const section = h('section', { className: 'home-section' });
    const accepted = this.state.history.filter((event) => event.action === 'accepted').length;
    const dismissed = this.state.history.filter((event) => event.action === 'dismissed').length;
    section.appendChild(sectionHeader('Recomendaciones', { label: `${accepted} aceptadas · ${dismissed} descartadas` }));
    if (this.state.history.length === 0) {
      section.appendChild(h('p', { className: 'modal-hint', text: 'Aún no has aceptado ni descartado recomendaciones.' }));
      return section;
    }
    const list = h('div', { className: 'rec-history' });
    for (const event of this.state.history.slice(0, 8)) {
      const track = this.state.tracks.find((entry) => entry.id === event.trackId);
      const row = h('div', { className: 'rec-row' });
      const copy = h('div', { className: 'rec-copy' });
      copy.append(
        h('strong', { text: track ? `${track.artist} — ${track.title}` : 'Pista eliminada' }),
        h('small', { text: `${event.kind} · ${event.at.slice(0, 10)}` }),
      );
      row.append(
        h('span', {
          className: `rec-action rec-${event.action}`,
          text: event.action === 'accepted' ? '✓' : '✕',
        }),
        copy,
      );
      list.appendChild(row);
    }
    section.appendChild(list);
    return section;
  }
}
