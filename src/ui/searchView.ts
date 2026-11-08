/**
 * Búsqueda global: pistas, álbumes, artistas y playlists, con filtros,
 * búsquedas recientes persistidas y resultados accionables.
 */

import type { DeckId } from '../audio/deck.js';
import type { Playlist, TrackMeta } from '../library/library.js';
import type { Route } from './router.js';
import { formatKey } from '../audio/key.js';
import { formatTime } from '../util/format.js';
import { artwork, emptyState, h, iconButton, sectionHeader } from './components.js';
import { icon } from './icons.js';

type Filter = 'all' | 'tracks' | 'albums' | 'artists' | 'playlists';

export interface SearchCallbacks {
  onPlayTrack(trackId: string): void;
  onPreview(trackId: string): void;
  onLoadToDeck(trackId: string, deck: DeckId): void;
  onEnqueue(trackId: string): void;
  onToggleFavorite(trackId: string): void;
  onOpenPlaylist(playlistId: string): void;
  onNavigate(route: Route): void;
  onImport(): void;
}

const RECENT_KEY = 'audiolad.searches.v1';

export class SearchView {
  readonly el: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly chips: HTMLElement;
  private readonly results: HTMLElement;
  private tracks: readonly TrackMeta[] = [];
  private playlists: readonly Playlist[] = [];
  private filter: Filter = 'all';
  private query = '';
  private recent: string[] = loadRecent();

  constructor(private readonly cb: SearchCallbacks) {
    this.el = h('div', { className: 'search-view' });
    const head = h('div', { className: 'search-head' });
    const field = h('label', { className: 'search-field' });
    const searchIcon = h('span', { className: 'search-field-icon' });
    searchIcon.innerHTML = icon('search', 20);
    this.input = h('input', {
      className: 'search-input',
      attrs: { type: 'search', placeholder: '¿Qué quieres escuchar?', 'aria-label': 'Buscar en toda la biblioteca', autocomplete: 'off' },
    });
    field.append(searchIcon, this.input);
    this.chips = h('div', { className: 'search-chips', attrs: { role: 'tablist', 'aria-label': 'Filtrar resultados' } });
    head.append(field, this.chips);
    this.results = h('div', { className: 'search-results' });
    this.el.append(head, this.results);

    this.input.addEventListener('input', () => {
      this.query = this.input.value;
      this.renderResults();
    });
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && this.query.trim()) this.remember(this.query.trim());
    });

    const filters: { id: Filter; label: string }[] = [
      { id: 'all', label: 'Todo' },
      { id: 'tracks', label: 'Pistas' },
      { id: 'albums', label: 'Álbumes' },
      { id: 'artists', label: 'Artistas' },
      { id: 'playlists', label: 'Playlists' },
    ];
    for (const filter of filters) {
      const chip = h('button', { className: `chip${filter.id === 'all' ? ' active' : ''}`, text: filter.label });
      chip.type = 'button';
      chip.setAttribute('role', 'tab');
      chip.setAttribute('aria-selected', String(filter.id === 'all'));
      chip.addEventListener('click', () => {
        this.filter = filter.id;
        this.chips.querySelectorAll('.chip').forEach((node, index) => {
          node.classList.toggle('active', filters[index]?.id === filter.id);
          node.setAttribute('aria-selected', String(filters[index]?.id === filter.id));
        });
        this.renderResults();
      });
      this.chips.appendChild(chip);
    }
    this.renderResults();
  }

  focus(): void {
    this.input.focus();
    this.input.select();
  }

  render(tracks: readonly TrackMeta[], playlists: readonly Playlist[]): void {
    this.tracks = tracks;
    this.playlists = playlists;
    this.renderResults();
  }

  private renderResults(): void {
    this.results.textContent = '';
    const query = this.query.trim();
    if (!query) {
      this.renderExplore();
      return;
    }
    const needle = query.toLowerCase();
    const match = (value: string | undefined): boolean => (value ?? '').toLowerCase().includes(needle);
    const tracks = this.tracks.filter(
      (track) =>
        match(track.title) ||
        match(track.artist) ||
        match(track.album) ||
        match(track.genre) ||
        (track.tags ?? []).some(match),
    );
    const playlists = this.playlists.filter((playlist) => match(playlist.name));
    const albumMap = new Map<string, TrackMeta[]>();
    for (const track of this.tracks) {
      if (!track.album.trim() || !match(track.album)) continue;
      const list = albumMap.get(track.album) ?? [];
      list.push(track);
      albumMap.set(track.album, list);
    }
    const artistMap = new Map<string, TrackMeta[]>();
    for (const track of this.tracks) {
      if (!track.artist.trim() || !match(track.artist)) continue;
      const list = artistMap.get(track.artist) ?? [];
      list.push(track);
      artistMap.set(track.artist, list);
    }

    const total = tracks.length + playlists.length + albumMap.size + artistMap.size;
    if (total === 0) {
      this.results.appendChild(
        emptyState('search', 'Sin resultados', `No encontramos nada para «${query}». Prueba con otro título, artista o género.`),
      );
      return;
    }

    if (this.filter === 'all' && tracks[0]) {
      this.results.appendChild(this.topResult(tracks[0]));
    }

    if ((this.filter === 'all' || this.filter === 'tracks') && tracks.length > 0) {
      const section = h('section', { className: 'search-section' });
      section.appendChild(sectionHeader('Pistas'));
      const list = h('div', { className: 'track-list' });
      for (const track of tracks.slice(0, 12)) list.appendChild(this.trackRow(track));
      section.appendChild(list);
      this.results.appendChild(section);
    }

    if ((this.filter === 'all' || this.filter === 'albums') && albumMap.size > 0) {
      const section = h('section', { className: 'search-section' });
      section.appendChild(sectionHeader('Álbumes'));
      const row = h('div', { className: 'media-row' });
      for (const [name, list] of [...albumMap.entries()].slice(0, 8)) {
        row.appendChild(this.collectionCard('disc', name, list[0]?.artist ?? 'Varios artistas', list[0]?.artwork, () =>
          this.cb.onNavigate({ name: 'album', album: name }),
        ));
      }
      section.appendChild(row);
      this.results.appendChild(section);
    }

    if ((this.filter === 'all' || this.filter === 'artists') && artistMap.size > 0) {
      const section = h('section', { className: 'search-section' });
      section.appendChild(sectionHeader('Artistas'));
      const row = h('div', { className: 'media-row' });
      for (const [name, list] of [...artistMap.entries()].slice(0, 8)) {
        row.appendChild(this.collectionCard('headphones', name, `${list.length} pistas`, list[0]?.artwork, () =>
          this.cb.onNavigate({ name: 'artist', artist: name }),
        ));
      }
      section.appendChild(row);
      this.results.appendChild(section);
    }

    if ((this.filter === 'all' || this.filter === 'playlists') && playlists.length > 0) {
      const section = h('section', { className: 'search-section' });
      section.appendChild(sectionHeader('Playlists'));
      const row = h('div', { className: 'media-row' });
      for (const playlist of playlists.slice(0, 8)) {
        const first = this.tracks.find((track) => playlist.trackIds.includes(track.id));
        row.appendChild(
          this.collectionCard('list', playlist.name, `${playlist.trackIds.length} pistas`, playlist.coverUrl ?? first?.artwork, () =>
            this.cb.onOpenPlaylist(playlist.id),
          ),
        );
      }
      section.appendChild(row);
      this.results.appendChild(section);
    }

  }

  private topResult(track: TrackMeta): HTMLElement {
    const section = h('section', { className: 'search-section' });
    section.appendChild(sectionHeader('Resultado principal'));
    const card = h('article', { className: 'top-result' });
    card.appendChild(artwork(track.artwork, track.title, 'top-result-art'));
    const info = h('div', { className: 'top-result-info' });
    info.append(
      h('h3', { className: 'top-result-title', text: track.title }),
      h('p', { className: 'top-result-sub', text: `${track.artist}${track.album ? ` · ${track.album}` : ''}` }),
    );
    const play = iconButton('play', `Reproducir ${track.title}`, 'media-play top-result-play', 22);
    play.addEventListener('click', () => this.cb.onPlayTrack(track.id));
    info.appendChild(play);
    card.append(info);
    section.appendChild(card);
    return section;
  }

  private trackRow(track: TrackMeta): HTMLElement {
    const row = h('div', { className: 'track-row' });
    row.appendChild(artwork(track.artwork, track.title, 'track-row-art'));
    const main = h('div', { className: 'track-row-main' });
    const title = h('button', { className: 'track-row-title', text: track.title });
    title.type = 'button';
    title.addEventListener('click', () => this.cb.onPreview(track.id));
    main.append(title, h('span', { className: 'track-row-sub', text: track.artist }));
    row.appendChild(main);
    row.appendChild(h('span', { className: 'track-row-album', text: track.album }));
    row.appendChild(h('span', { className: 'track-row-meta', text: `${formatKey(track.key)} · ${track.bpm ? `${track.bpm.toFixed(1)} BPM` : '—'}` }));
    row.appendChild(h('span', { className: 'track-row-time', text: formatTime(track.durationSec) }));

    const actions = h('div', { className: 'track-row-actions' });
    const fav = iconButton(track.favorite ? 'heartFilled' : 'heart', track.favorite ? 'Quitar de favoritas' : 'Añadir a favoritas', 'btn btn-mini icon-btn');
    fav.addEventListener('click', () => this.cb.onToggleFavorite(track.id));
    const play = iconButton('play', 'Reproducir', 'btn btn-mini icon-btn');
    play.addEventListener('click', () => this.cb.onPlayTrack(track.id));
    const queue = iconButton('plus', 'Añadir a la cola', 'btn btn-mini icon-btn');
    queue.addEventListener('click', () => this.cb.onEnqueue(track.id));
    const toA = h('button', { className: 'btn btn-mini', text: 'A' });
    toA.type = 'button';
    toA.title = 'Cargar en Deck A';
    toA.addEventListener('click', () => this.cb.onLoadToDeck(track.id, 'A'));
    const toB = h('button', { className: 'btn btn-mini', text: 'B' });
    toB.type = 'button';
    toB.title = 'Cargar en Deck B';
    toB.addEventListener('click', () => this.cb.onLoadToDeck(track.id, 'B'));
    actions.append(fav, play, queue, toA, toB);
    row.appendChild(actions);

    const favIcon = row.querySelector('.icon-heart') ?? row.querySelector('.icon-heartFilled');
    favIcon?.classList.toggle('is-fav', !!track.favorite);
    return row;
  }

  private collectionCard(
    iconName: 'disc' | 'headphones' | 'list',
    title: string,
    subtitle: string,
    art: string | undefined,
    onClick: () => void,
  ): HTMLElement {
    const card = h('article', { className: 'media-card' });
    const cover = h('div', { className: 'media-cover' });
    if (iconName === 'list' && !art) {
      const placeholder = h('div', { className: 'media-artwork collection-placeholder' });
      placeholder.innerHTML = icon('list', 44);
      cover.appendChild(placeholder);
    } else {
      cover.appendChild(artwork(art, title, 'media-artwork'));
    }
    const info = h('div', { className: 'media-info' });
    const name = h('button', { className: 'media-title', text: title, title });
    name.type = 'button';
    name.addEventListener('click', onClick);
    info.append(name, h('span', { className: 'media-subtitle', text: subtitle }));
    card.append(cover, info);
    card.addEventListener('dblclick', onClick);
    return card;
  }

  private renderExplore(): void {
    if (this.recent.length > 0) {
      const section = h('section', { className: 'search-section' });
      section.appendChild(
        sectionHeader('Búsquedas recientes', {
          label: 'Limpiar',
          onClick: () => {
            this.recent = [];
            saveRecent(this.recent);
            this.renderResults();
          },
        }),
      );
      const row = h('div', { className: 'chip-row' });
      for (const term of this.recent) {
        const chip = h('button', { className: 'chip chip-lg', text: term });
        chip.type = 'button';
        chip.addEventListener('click', () => {
          this.input.value = term;
          this.query = term;
          this.renderResults();
        });
        row.appendChild(chip);
      }
      section.appendChild(row);
      this.results.appendChild(section);
    }

    const artists = groupBy(this.tracks, (track) => track.artist).slice(0, 8);
    if (artists.length > 0) {
      const section = h('section', { className: 'search-section' });
      section.appendChild(sectionHeader('Tus artistas'));
      const row = h('div', { className: 'media-row' });
      for (const [name, list] of artists) {
        row.appendChild(
          this.collectionCard('headphones', name, `${list.length} pistas`, list[0]?.artwork, () =>
            this.cb.onNavigate({ name: 'artist', artist: name }),
          ),
        );
      }
      section.appendChild(row);
      this.results.appendChild(section);
    }

    const albums = groupBy(this.tracks.filter((track) => track.album.trim()), (track) => track.album).slice(0, 8);
    if (albums.length > 0) {
      const section = h('section', { className: 'search-section' });
      section.appendChild(sectionHeader('Álbumes'));
      const row = h('div', { className: 'media-row' });
      for (const [name, list] of albums) {
        row.appendChild(
          this.collectionCard('disc', name, list[0]?.artist ?? 'Varios artistas', list[0]?.artwork, () =>
            this.cb.onNavigate({ name: 'album', album: name }),
          ),
        );
      }
      section.appendChild(row);
      this.results.appendChild(section);
    }

    if (this.tracks.length === 0) {
      this.results.appendChild(
        emptyState('music', 'Nada que explorar todavía', 'Importa tu primera pista para ver artistas, álbumes y playlists aquí.'),
      );
    }
  }

  private remember(term: string): void {
    const clean = term.trim();
    if (!clean) return;
    this.recent = [clean, ...this.recent.filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
    saveRecent(this.recent);
  }
}

function groupBy(tracks: readonly TrackMeta[], key: (track: TrackMeta) => string): [string, TrackMeta[]][] {
  const map = new Map<string, TrackMeta[]>();
  for (const track of tracks) {
    const value = key(track);
    if (!value.trim()) continue;
    const list = map.get(value) ?? [];
    list.push(track);
    map.set(value, list);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecent(items: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items));
  } catch {
    /* sin persistencia */
  }
}
