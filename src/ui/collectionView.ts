/**
 * Página de álbum / artista: hero, acciones, listado de pistas y álbumes.
 * Se enlaza directamente desde rutas #/album/… y #/artist/….
 */

import type { DeckId } from '../audio/deck.js';
import type { TrackMeta } from '../library/library.js';
import type { Route } from './router.js';
import { formatKey } from '../audio/key.js';
import { formatTime } from '../util/format.js';
import { artwork, emptyState, h, iconButton, sectionHeader } from './components.js';
import { icon } from './icons.js';

export type CollectionKind = 'album' | 'artist';

export interface CollectionCallbacks {
  onPlayTrack(trackId: string): void;
  onPreview(trackId: string): void;
  onLoadToDeck(trackId: string, deck: DeckId): void;
  onEnqueue(trackId: string): void;
  onToggleFavorite(trackId: string): void;
  onShare(route: Route): void;
  onNavigate(route: Route): void;
}

export class CollectionView {
  readonly el: HTMLElement;

  constructor(private readonly cb: CollectionCallbacks) {
    this.el = h('div', { className: 'collection-view' });
  }

  render(kind: CollectionKind, name: string, tracks: readonly TrackMeta[]): void {
    this.el.textContent = '';
    const list = kind === 'album' ? tracks.filter((track) => track.album === name) : tracks.filter((track) => track.artist === name);
    const sorted = [...list].sort((a, b) => {
      if (kind === 'album') return (a.trackNumber ?? '999').localeCompare(b.trackNumber ?? '999', undefined, { numeric: true });
      return (a.album || a.title).localeCompare(b.album || b.title);
    });

    if (sorted.length === 0) {
      this.el.appendChild(emptyState('disc', 'Colección vacía', `No hay pistas para «${name}».`));
      return;
    }

    this.el.appendChild(this.hero(kind, name, sorted));
    if (kind === 'artist') {
      const albums = groupAlbums(sorted);
      if (albums.length > 0) {
        const section = h('section', { className: 'collection-section' });
        section.appendChild(sectionHeader('Álbumes'));
        const row = h('div', { className: 'media-row' });
        for (const album of albums) {
          const card = h('article', { className: 'media-card' });
          const cover = h('div', { className: 'media-cover' });
          cover.appendChild(artwork(album.tracks[0]?.artwork, album.name, 'media-artwork'));
          const play = iconButton('play', `Abrir ${album.name}`, 'media-play', 20);
          play.addEventListener('click', (event) => {
            event.stopPropagation();
            this.cb.onNavigate({ name: 'album', album: album.name });
          });
          cover.appendChild(play);
          const info = h('div', { className: 'media-info' });
          const title = h('button', { className: 'media-title', text: album.name });
          title.type = 'button';
          title.addEventListener('click', () => this.cb.onNavigate({ name: 'album', album: album.name }));
          info.append(title, h('span', { className: 'media-subtitle', text: `${album.tracks.length} pistas` }));
          card.append(cover, info);
          row.appendChild(card);
        }
        section.appendChild(row);
        this.el.appendChild(section);
      }
    }

    const section = h('section', { className: 'collection-section' });
    section.appendChild(sectionHeader(kind === 'album' ? 'Pistas' : 'Todas las pistas'));
    const table = h('div', { className: 'collection-tracks' });
    sorted.forEach((track, index) => table.appendChild(this.row(track, index)));
    section.appendChild(table);
    this.el.appendChild(section);
  }

  private hero(kind: CollectionKind, name: string, tracks: readonly TrackMeta[]): HTMLElement {
    const hero = h('section', { className: 'collection-hero' });
    const cover = h('div', { className: 'collection-cover' });
    const art = artwork(tracks[0]?.artwork, name, 'collection-artwork');
    if (kind === 'artist' && !tracks[0]?.artwork) {
      art.textContent = '';
      art.innerHTML = icon('headphones', 72);
    }
    cover.appendChild(art);
    const info = h('div', { className: 'collection-info' });
    const total = tracks.reduce((sum, track) => sum + track.durationSec, 0);
    info.append(
      h('span', { className: 'collection-kind', text: kind === 'album' ? 'Álbum' : 'Artista' }),
      h('h1', { className: 'collection-title', text: name }),
      h('p', {
        className: 'collection-meta',
        text: [tracks[0]?.artist, `${tracks.length} pistas`, formatTime(total)].filter(Boolean).join(' · '),
      }),
    );
    const actions = h('div', { className: 'collection-actions' });
    const play = h('button', { className: 'btn btn-primary' });
    play.type = 'button';
    play.innerHTML = `${icon('play', 18)}<span>Reproducir</span>`;
    play.addEventListener('click', () => {
      const first = tracks.find((track) => track.hasAudio);
      if (first) this.cb.onPlayTrack(first.id);
    });
    const enqueue = h('button', { className: 'btn btn-ghost' });
    enqueue.type = 'button';
    enqueue.innerHTML = `${icon('plus', 18)}<span>Encolar todo</span>`;
    enqueue.addEventListener('click', () => {
      for (const track of tracks) this.cb.onEnqueue(track.id);
    });
    const share = iconButton('link', 'Copiar enlace', 'btn btn-mini icon-btn');
    share.addEventListener('click', () => this.cb.onShare(kind === 'album' ? { name: 'album', album: name } : { name: 'artist', artist: name }));
    actions.append(play, enqueue, share);
    info.appendChild(actions);
    hero.append(cover, info);
    return hero;
  }

  private row(track: TrackMeta, index: number): HTMLElement {
    const row = h('div', { className: 'collection-row' });
    row.appendChild(h('span', { className: 'collection-index', text: String(index + 1).padStart(2, '0') }));
    row.appendChild(artwork(track.artwork, track.title, 'collection-row-art'));
    const main = h('div', { className: 'collection-row-main' });
    const title = h('button', { className: 'collection-row-title', text: track.title });
    title.type = 'button';
    title.addEventListener('click', () => this.cb.onPreview(track.id));
    main.append(title, h('span', { className: 'collection-row-sub', text: track.artist }));
    row.appendChild(main);
    row.appendChild(h('span', { className: 'collection-row-meta', text: `${formatKey(track.key)} · ${track.bpm ? `${track.bpm.toFixed(1)} BPM` : '—'}` }));
    row.appendChild(h('span', { className: 'collection-row-time', text: formatTime(track.durationSec) }));
    const actions = h('div', { className: 'collection-row-actions' });
    const play = iconButton('play', 'Reproducir', 'btn btn-mini icon-btn');
    play.addEventListener('click', () => this.cb.onPlayTrack(track.id));
    const fav = iconButton(track.favorite ? 'heartFilled' : 'heart', 'Favorita', 'btn btn-mini icon-btn');
    fav.addEventListener('click', () => this.cb.onToggleFavorite(track.id));
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
    return row;
  }
}

function groupAlbums(tracks: readonly TrackMeta[]): { name: string; tracks: TrackMeta[] }[] {
  const map = new Map<string, TrackMeta[]>();
  for (const track of tracks) {
    const name = track.album.trim();
    if (!name) continue;
    const list = map.get(name) ?? [];
    list.push(track);
    map.set(name, list);
  }
  return [...map.entries()].map(([name, list]) => ({ name, tracks: list }));
}
