/**
 * Página de Inicio: hero editorial, sigue escuchando, favoritas, playlists,
 * álbumes y novedades de la biblioteca local.
 */

import type { HistoryEvent, Playlist, TrackMeta } from '../library/library.js';
import type { Route } from './router.js';
import { formatKey } from '../audio/key.js';
import { formatTime } from '../util/format.js';
import { artwork, emptyState, h, iconButton, sectionHeader } from './components.js';
import { icon } from './icons.js';

export interface HomeCallbacks {
  onPlayTrack(trackId: string): void;
  onPreview(trackId: string): void;
  onEnqueue(trackId: string): void;
  onToggleFavorite(trackId: string): void;
  onOpenPlaylist(playlistId: string): void;
  onNavigate(route: Route): void;
  onImport(): void;
}

export class HomeView {
  readonly el: HTMLElement;

  constructor(private readonly cb: HomeCallbacks) {
    this.el = h('div', { className: 'home-view' });
  }

  render(tracks: readonly TrackMeta[], playlists: readonly Playlist[], events: readonly HistoryEvent[]): void {
    this.el.textContent = '';
    this.el.appendChild(this.hero(tracks, playlists));

    const continueTracks = this.recentTracks(events, tracks);
    if (continueTracks.length > 0) {
      this.el.appendChild(this.trackSection('Sigue escuchando', continueTracks, { name: 'library' }));
    }

    const favorites = tracks.filter((track) => track.favorite).slice(0, 8);
    if (favorites.length > 0) {
      this.el.appendChild(this.trackSection('Tus favoritas', favorites, { name: 'library' }));
    }

    if (playlists.length > 0) {
      const section = h('section', { className: 'home-section' });
      section.appendChild(
        sectionHeader('Tus playlists', {
          label: 'Ver biblioteca',
          onClick: () => this.cb.onNavigate({ name: 'library' }),
        }),
      );
      const row = h('div', { className: 'media-row' });
      for (const playlist of playlists.slice(0, 8)) {
        row.appendChild(this.playlistCard(playlist, tracks));
      }
      section.appendChild(row);
      this.el.appendChild(section);
    }

    const albums = this.albumGroups(tracks).slice(0, 8);
    if (albums.length > 0) {
      const section = h('section', { className: 'home-section' });
      section.appendChild(sectionHeader('Álbumes en tu biblioteca'));
      const row = h('div', { className: 'media-row' });
      for (const album of albums) {
        row.appendChild(this.albumCard(album));
      }
      section.appendChild(row);
      this.el.appendChild(section);
    }

    const recent = [...tracks].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 8);
    if (recent.length > 0) {
      this.el.appendChild(this.trackSection('Añadido recientemente', recent, { name: 'library' }));
    }

    const mixable = tracks
      .filter((track) => track.hasAudio && track.bpm !== null)
      .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
      .slice(0, 8);
    if (mixable.length > 0) {
      this.el.appendChild(this.trackSection('Listo para mezclar', mixable, { name: 'cabina' }));
    }

    if (tracks.length === 0) {
      const section = h('section', { className: 'home-section' });
      section.appendChild(
        emptyState(
          'music',
          'Tu biblioteca está vacía',
          'Importa audio local, convierte una URL o trae metadatos de Spotify para empezar.',
        ),
      );
      const cta = h('button', { className: 'btn btn-primary' });
      cta.type = 'button';
      cta.innerHTML = `${icon('import', 18)}<span>Importar audio</span>`;
      cta.addEventListener('click', () => this.cb.onImport());
      section.appendChild(cta);
      this.el.appendChild(section);
    }
  }

  private hero(tracks: readonly TrackMeta[], playlists: readonly Playlist[]): HTMLElement {
    const hour = new Date().getHours();
    const greeting = hour < 6 ? 'Buenas noches' : hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
    const hero = h('section', { className: 'home-hero' });
    const copy = h('div', { className: 'home-hero-copy' });
    copy.append(
      h('span', { className: 'home-eyebrow', text: 'Tu cabina, tu biblioteca' }),
      h('h1', { className: 'home-title', text: greeting }),
      h('p', { className: 'home-subtitle', text: 'Mezcla, descubre y organiza tu música sin salir del navegador.' }),
    );
    const stats = h('div', { className: 'home-stats' });
    stats.append(
      stat(String(tracks.length), 'pistas'),
      stat(String(playlists.length), 'playlists'),
      stat(String(tracks.filter((track) => track.favorite).length), 'favoritas'),
    );
    const actions = h('div', { className: 'home-actions' });
    const mix = h('button', { className: 'btn btn-primary' });
    mix.type = 'button';
    mix.innerHTML = `${icon('deck', 18)}<span>Abrir cabina</span>`;
    mix.addEventListener('click', () => this.cb.onNavigate({ name: 'cabina' }));
    const importBtn = h('button', { className: 'btn btn-ghost' });
    importBtn.type = 'button';
    importBtn.innerHTML = `${icon('import', 18)}<span>Importar audio</span>`;
    importBtn.addEventListener('click', () => this.cb.onImport());
    actions.append(mix, importBtn);
    copy.append(stats, actions);

    const feature = tracks.find((track) => track.artwork) ?? tracks[0];
    const art = h('div', { className: 'home-hero-art' });
    if (feature) {
      art.appendChild(artwork(feature.artwork, feature.title, 'hero-artwork'));
      art.appendChild(h('span', { className: 'hero-art-glow' }));
    } else {
      const placeholder = h('div', { className: 'hero-artwork hero-artwork-empty' });
      placeholder.innerHTML = icon('disc', 96);
      art.appendChild(placeholder);
      art.appendChild(h('span', { className: 'hero-art-glow' }));
    }
    hero.append(copy, art);
    return hero;
  }

  private trackSection(title: string, tracks: readonly TrackMeta[], route: Route): HTMLElement {
    const section = h('section', { className: 'home-section' });
    section.appendChild(sectionHeader(title, { label: 'Ver todo', onClick: () => this.cb.onNavigate(route) }));
    const row = h('div', { className: 'media-row' });
    for (const track of tracks) row.appendChild(this.trackCard(track));
    section.appendChild(row);
    return section;
  }

  private trackCard(track: TrackMeta): HTMLElement {
    const card = h('article', { className: 'media-card' });
    const cover = h('div', { className: 'media-cover' });
    cover.appendChild(artwork(track.artwork, track.title, 'media-artwork'));
    const play = iconButton('play', `Reproducir ${track.title}`, 'media-play', 20);
    play.addEventListener('click', (event) => {
      event.stopPropagation();
      this.cb.onPlayTrack(track.id);
    });
    cover.appendChild(play);
    const info = h('div', { className: 'media-info' });
    const title = h('button', { className: 'media-title', text: track.title, title: track.title });
    title.type = 'button';
    title.addEventListener('click', (event) => {
      event.stopPropagation();
      this.cb.onPreview(track.id);
    });
    info.append(
      title,
      h('span', { className: 'media-subtitle', text: track.artist }),
      h('span', {
        className: 'media-meta',
        text: [track.bpm ? `${track.bpm.toFixed(1)} BPM` : null, formatKey(track.key), formatTime(track.durationSec)]
          .filter(Boolean)
          .join(' · '),
      }),
    );
    const actions = h('div', { className: 'media-actions' });
    const fav = iconButton(track.favorite ? 'heartFilled' : 'heart', track.favorite ? 'Quitar de favoritas' : 'Añadir a favoritas', 'btn btn-mini icon-btn');
    fav.addEventListener('click', (event) => {
      event.stopPropagation();
      this.cb.onToggleFavorite(track.id);
    });
    const queue = iconButton('plus', 'Añadir a la cola', 'btn btn-mini icon-btn');
    queue.addEventListener('click', (event) => {
      event.stopPropagation();
      this.cb.onEnqueue(track.id);
    });
    actions.append(fav, queue);
    info.appendChild(actions);

    card.append(cover, info);
    card.addEventListener('dblclick', () => this.cb.onPreview(track.id));
    return card;
  }

  private playlistCard(playlist: Playlist, tracks: readonly TrackMeta[]): HTMLElement {
    const card = h('article', { className: 'media-card playlist-card' });
    const cover = h('div', { className: 'media-cover' });
    const first = tracks.find((track) => playlist.trackIds.includes(track.id));
    cover.appendChild(artwork(playlist.coverUrl ?? first?.artwork, playlist.name, 'media-artwork'));
    const play = iconButton('play', `Abrir ${playlist.name}`, 'media-play', 20);
    play.addEventListener('click', (event) => {
      event.stopPropagation();
      this.cb.onOpenPlaylist(playlist.id);
    });
    cover.appendChild(play);
    const info = h('div', { className: 'media-info' });
    const title = h('button', { className: 'media-title', text: playlist.name, title: playlist.name });
    title.type = 'button';
    title.addEventListener('click', () => this.cb.onOpenPlaylist(playlist.id));
    info.append(title, h('span', { className: 'media-subtitle', text: `${playlist.trackIds.length} pistas` }));
    card.append(cover, info);
    card.addEventListener('dblclick', () => this.cb.onOpenPlaylist(playlist.id));
    return card;
  }

  private albumCard(album: { name: string; tracks: TrackMeta[] }): HTMLElement {
    const card = h('article', { className: 'media-card' });
    const cover = h('div', { className: 'media-cover' });
    cover.appendChild(artwork(album.tracks[0]?.artwork, album.name, 'media-artwork'));
    const play = iconButton('play', `Reproducir ${album.name}`, 'media-play', 20);
    play.addEventListener('click', (event) => {
      event.stopPropagation();
      const first = album.tracks.find((track) => track.hasAudio);
      if (first) this.cb.onPlayTrack(first.id);
    });
    cover.appendChild(play);
    const info = h('div', { className: 'media-info' });
    const title = h('button', { className: 'media-title', text: album.name, title: album.name });
    title.type = 'button';
    title.addEventListener('click', () => this.cb.onNavigate({ name: 'album', album: album.name }));
    info.append(title, h('span', { className: 'media-subtitle', text: album.tracks[0]?.artist ?? 'Varios artistas' }));
    card.append(cover, info);
    card.addEventListener('dblclick', () => this.cb.onNavigate({ name: 'album', album: album.name }));
    return card;
  }

  private recentTracks(events: readonly HistoryEvent[], tracks: readonly TrackMeta[]): TrackMeta[] {
    const seen = new Set<string>();
    const result: TrackMeta[] = [];
    const ordered = [...events]
      .filter((event): event is Extract<HistoryEvent, { type: 'played' }> => event.type === 'played')
      .sort((a, b) => b.at.localeCompare(a.at));
    for (const event of ordered) {
      if (seen.has(event.trackId)) continue;
      const track = tracks.find((item) => item.id === event.trackId);
      if (!track) continue;
      seen.add(event.trackId);
      result.push(track);
      if (result.length === 8) break;
    }
    return result;
  }

  private albumGroups(tracks: readonly TrackMeta[]): { name: string; tracks: TrackMeta[] }[] {
    const map = new Map<string, TrackMeta[]>();
    for (const track of tracks) {
      const album = track.album.trim();
      if (!album) continue;
      const list = map.get(album) ?? [];
      list.push(track);
      map.set(album, list);
    }
    return [...map.entries()]
      .map(([name, list]) => ({ name, tracks: list }))
      .sort((a, b) => b.tracks.length - a.tracks.length);
  }
}

function stat(value: string, label: string): HTMLElement {
  const node = h('div', { className: 'home-stat' });
  node.append(h('b', { text: value }), h('span', { text: label }));
  return node;
}
