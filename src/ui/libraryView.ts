import type { DeckId } from '../audio/deck.js';
import type { Playlist, TrackMeta } from '../library/library.js';
import type { SmartPlaylist, SmartField, SmartOp } from '../library/smart.js';
import { SMART_FIELDS, FIELD_LABELS, opsForField, evaluateSmart } from '../library/smart.js';
import { formatBpm, formatTime } from '../util/format.js';
import { formatKey } from '../audio/key.js';
import { describeQuality } from '../util/quality.js';
import type { MatchCandidate } from './convertApi.js';
import { icon } from './icons.js';
import { h, openModal } from './components.js';

export type LibrarySort = 'added' | 'title' | 'artist' | 'bpm' | 'duration' | 'plays' | 'lastPlayed';
export type SourceFilter = 'all' | 'import' | 'convert' | 'spotify' | 'match';

export interface LibraryCallbacks {
  onImportFiles(files: File[]): void;
  onLoadToDeck(trackId: string, deckId: DeckId): void;
  /** Previsualizar (reproducción previa real con HTMLAudio). */
  onPreview(trackId: string): void;
  onRemoveTrack(trackId: string): void;
  onToggleFavorite(trackId: string): void;
  onEnqueue(trackId: string): void;
  onPlayNext(trackId: string): void;
  onOpenAlbum(album: string): void;
  onOpenArtist(artist: string): void;
  onSetPlaylistCover(playlistId: string, dataUrl: string | null): void;
  onReorderPlaylist(playlistId: string, fromId: string, toId: string): void;
  onDownloadPlaylist(playlistId: string): void;
  onBatchMetadata(trackIds: string[], patch: Partial<Pick<TrackMeta, 'artist' | 'album' | 'genre' | 'tags' | 'lyrics'>>): void;
  /** Enriquecer con MusicBrainz (búsqueda por título + artista, el usuario elige). */
  onEnrich(trackId: string): void;
  onExportBundle(): void;
  onImportBundle(files: File[]): void;
  onOpenTrash(): void;
  onCreatePlaylist(name: string): void;
  onDeletePlaylist(playlistId: string): void;
  onAddToPlaylist(playlistId: string, trackId: string): void;
  onRemoveFromPlaylist(playlistId: string, trackId: string): void;
  onMove(playlistId: string, trackId: string, delta: -1 | 1): void;
  /** Edición real de metadatos. */
  onUpdateMetadata(trackId: string, patch: Partial<Pick<TrackMeta, 'title' | 'artist' | 'album' | 'genre' | 'date' | 'trackNumber' | 'tags' | 'lyrics'>>): void;
  onSetArtwork(trackId: string, dataUrl: string | null): void;
  /** Re-análisis real (decode → picos → BPM → tonalidad). */
  onReanalyze(trackId: string): void;
  /** Acciones por lotes. */
  onBatchToDeck(deckId: DeckId, trackIds: string[]): void;
  onBatchToPlaylist(playlistId: string, trackIds: string[]): void;
  onBatchReanalyze(trackIds: string[]): void;
  onBatchRemove(trackIds: string[]): void;
  /** Spotify: importar metadatos de una playlist (legítimo, sin audio). */
  onImportSpotify(url: string): void;
  /** Buscar candidatos de fuente de audio para una pista solo-metadatos. */
  onFindSources(trackId: string): void;
  /** El usuario elige explícitamente la fuente (sin sustituciones automáticas). */
  onPickSource(trackId: string, url: string): void;
  /** Portabilidad de metadatos. */
  onExportLibrary(): void;
  onImportLibraryJson(file: File): void;
  /** Playlists inteligentes (especificaciones evaluadas al vuelo). */
  onCreateSmart(spec: SmartPlaylist): void;
  onDeleteSmart(id: string): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, text: string, title?: string): HTMLButtonElement {
  const btn = el('button', className, text);
  if (title) btn.title = title;
  return btn;
}

const SOURCE_LABELS: Record<TrackMeta['origin'] extends undefined ? never : NonNullable<TrackMeta['origin']>['type'], string> = {
  import: 'Archivo',
  convert: 'URL',
  spotify: 'Spotify',
  match: 'Fuente',
};

function analysisCell(track: TrackMeta): { text: string; className: string; title: string } {
  if (!track.hasAudio) return { text: '—', className: 'analysis-none', title: 'Pista solo de metadatos: necesita una fuente de audio autorizada.' };
  switch (track.analysis) {
    case 'complete':
      return {
        text: '✓',
        className: 'analysis-ok',
        title: `Análisis completo${track.bpm ? ` · ${track.bpm.toFixed(1)} BPM` : ''}${track.key ? ` · ${formatKey(track.key)}` : ''}`,
      };
    case 'partial':
      return { text: '◐', className: 'analysis-partial', title: 'Análisis parcial: faltan BPM o tonalidad. Usa ↻ para re-analizar.' };
    case 'failed':
      return { text: '✗ ERROR', className: 'analysis-error', title: track.analysisError ?? 'El análisis falló.' };
    default:
      return { text: 'PENDIENTE', className: 'analysis-pending', title: 'Pendiente de análisis (usa ↻ Re-analizar).' };
  }
}

/** Resalta coincidencias sin usar innerHTML con datos del usuario. */
function appendHighlighted(parent: HTMLElement, text: string, query: string): void {
  if (!query) {
    parent.appendChild(document.createTextNode(text));
    return;
  }
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  let index = lower.indexOf(needle);
  if (index < 0) {
    parent.appendChild(document.createTextNode(text));
    return;
  }
  let cursor = 0;
  while (index >= 0) {
    if (index > cursor) parent.appendChild(document.createTextNode(text.slice(cursor, index)));
    const mark = document.createElement('mark');
    mark.className = 'search-hit';
    mark.textContent = text.slice(index, index + needle.length);
    parent.appendChild(mark);
    cursor = index + needle.length;
    index = lower.indexOf(needle, cursor);
  }
  if (cursor < text.length) parent.appendChild(document.createTextNode(text.slice(cursor)));
}

/** Distancia de Levenshtein acotada (búsqueda tolerante a errores). */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (a.length < b.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return true;
}

function fuzzyMatch(fields: readonly string[], query: string): boolean {
  if (!query) return true;
  const tokens = query.split(/\s+/).filter(Boolean);
  const haystack = fields.join(' ').toLowerCase();
  return tokens.every((token) => {
    if (haystack.includes(token)) return true;
    if (token.length < 3) return false;
    return haystack.split(/[^a-z0-9áéíóúüñ]+/i).some((word) => word.length >= 3 && withinOneEdit(word.toLowerCase(), token));
  });
}

/** Tabla de biblioteca: búsqueda, filtros, orden, multiselección, calidad, análisis, playlists e inteligentes. */
export class LibraryView {
  readonly el: HTMLElement;
  private readonly cb: LibraryCallbacks;
  private readonly fileInput: HTMLInputElement;
  private readonly dirInput: HTMLInputElement;
  private readonly bundleInput: HTMLInputElement;
  private readonly tracksWrap: HTMLElement;
  private virtualActive = false;
  private virtualTracks: TrackMeta[] = [];
  private virtualFrame = 0;
  private lastFilterKey = '';
  private readonly libJsonInput: HTMLInputElement;
  private readonly tableBody: HTMLElement;
  private readonly playlistList: HTMLElement;
  private readonly playlistTracks: HTMLElement;
  private readonly playlistTitle: HTMLElement;
  private readonly emptyRow: HTMLElement;
  private readonly backendBadge: HTMLElement;
  private readonly searchInput: HTMLInputElement;
  private readonly sortSelect: HTMLSelectElement;
  private readonly favOnly: HTMLInputElement;
  private readonly sourceSelect: HTMLSelectElement;
  private readonly batchBar: HTMLElement;
  private readonly batchCount: HTMLElement;
  private readonly spotifyInput: HTMLInputElement;
  private readonly smartList: HTMLElement;
  private readonly smartField: HTMLSelectElement;
  private readonly smartOp: HTMLSelectElement;
  private readonly matchPanel: HTMLElement;
  private readonly matchList: HTMLElement;
  private readonly matchTitle: HTMLElement;
  private readonly browseGrid: HTMLElement;
  private readonly genreSelect: HTMLSelectElement;
  private readonly formatSelect: HTMLSelectElement;
  private readonly tagList: HTMLDataListElement;

  private tracks: readonly TrackMeta[] = [];
  private playlists: readonly Playlist[] = [];
  private smartPlaylists: readonly SmartPlaylist[] = [];
  private activePlaylistId: string | null = null;
  private activeSmartId: string | null = null;
  private selectedTrackId: string | null = null;
  private readonly checkedIds = new Set<string>();
  private loadedDeckIds: Record<DeckId, string | null> = { A: null, B: null };
  private queueIds: readonly string[] = [];
  private previewingId: string | null = null;
  private editingId: string | null = null;
  private browseMode: 'tracks' | 'albums' | 'artists' | 'genres' | 'folders' = 'tracks';
  private dragTrackId: string | null = null;

  constructor(cb: LibraryCallbacks) {
    this.cb = cb;
    this.el = el('div', 'library-view panel-view');
    this.el.innerHTML = `
      <div class="lib-head">
        <input class="lib-search" type="search" placeholder="Buscar título, artista, álbum, género…" aria-label="Buscar en la biblioteca">
        <label class="lib-fav"><input class="lib-fav-only" type="checkbox" aria-label="Mostrar solo favoritas"> ★</label>
        <label class="lib-src">Fuente
          <select class="lib-src-select" aria-label="Filtrar por fuente">
            <option value="all">Todas</option>
            <option value="import">Archivo</option>
            <option value="convert">URL</option>
            <option value="spotify">Spotify</option>
            <option value="match">Fuente elegida</option>
          </select>
        </label>
        <label class="lib-sort">Orden
          <select class="lib-sort-select" aria-label="Ordenar por">
            <option value="added">Recientes</option>
            <option value="title">Título</option>
            <option value="artist">Artista</option>
            <option value="bpm">BPM</option>
            <option value="duration">Duración</option>
            <option value="plays">Más reproducidas</option>
            <option value="lastPlayed">Última reproducción</option>
          </select>
        </label>
        <label class="lib-genre">Género
          <select class="lib-genre-select" aria-label="Filtrar por género">
            <option value="all">Todos</option>
          </select>
        </label>
        <label class="lib-format">Formato
          <select class="lib-format-select" aria-label="Filtrar por formato">
            <option value="all">Todos</option>
          </select>
        </label>
        <span class="backend-badge"></span>
        <button class="btn btn-import" aria-label="Importar archivos de audio">${icon('import', 16)}<span>Importar audio…</span></button>
        <input class="file-input" type="file" multiple hidden accept="audio/*,.mp3,.wav,.ogg,.oga,.opus,.m4a,.flac,.aac,.aif,.aiff,.webm">
        <button class="btn btn-mini btn-import-dir" title="Importar una carpeta completa (conserva subcarpetas)">${icon('folder', 15)}<span>Carpeta…</span></button>
        <input class="dir-input" type="file" multiple hidden>
        <button class="btn btn-mini btn-export-bundle" title="Exportar biblioteca completa con audio (ZIP)">${icon('download', 15)}<span>Exportar</span></button>
        <button class="btn btn-mini btn-import-bundle" title="Importar biblioteca completa desde un ZIP">${icon('upload', 15)}<span>Importar</span></button>
        <input class="bundle-input" type="file" accept=".zip,application/zip" hidden>
        <button class="btn btn-mini btn-trash" title="Papelera: restaurar o vaciar">${icon('trash', 15)}<span>Papelera</span></button>
        <button class="btn btn-mini lib-export" title="Descargar metadatos (JSON) para mover la biblioteca">${icon('download', 15)}<span>Metadatos</span></button>
        <button class="btn btn-mini lib-import-json" title="Fusionar metadatos desde JSON">${icon('upload', 15)}<span>JSON</span></button>
        <input class="lib-json-input" type="file" hidden accept="application/json,.json">
      </div>
      <div class="lib-browse-bar" role="group" aria-label="Vistas de la biblioteca">
        <button class="chip active" data-browse="tracks">Pistas</button>
        <button class="chip" data-browse="albums">Álbumes</button>
        <button class="chip" data-browse="artists">Artistas</button>
        <button class="chip" data-browse="genres">Géneros</button>
        <button class="chip" data-browse="folders">Carpetas</button>
      </div>
      <div class="library-browse" hidden></div>
      <div class="lib-spotify">
        <span class="lib-spotify-hint">Playlists de Spotify: se importan como <b>metadatos</b> (API oficial). Cada pista queda “pendiente de fuente de audio autorizada”.</span>
        <input class="spotify-url" type="text" placeholder="https://open.spotify.com/playlist/…" spellcheck="false" aria-label="URL de playlist de Spotify">
        <button class="btn btn-mini spotify-import">Importar metadatos</button>
      </div>
      <div class="batch-bar" hidden>
        <span class="batch-count"></span>
        <button class="btn btn-mini batch-deck-a">→ A</button>
        <button class="btn btn-mini batch-deck-b">→ B</button>
        <button class="btn btn-mini batch-playlist" title="Añadir todas a la playlist activa">＋ Playlist</button>
        <button class="btn btn-mini batch-metadata" title="Editar metadatos en lote">${icon('edit', 15)}<span>Metadatos</span></button>
        <button class="btn btn-mini batch-reanalyze" title="Re-analizar (BPM, tonalidad, waveform)">${icon('refresh', 15)}<span>Re-analizar</span></button>
        <button class="btn btn-mini batch-remove">${icon('close', 15)}<span>Quitar</span></button>
        <button class="btn btn-mini batch-clear">Deselegir</button>
      </div>
      <div class="match-panel" hidden>
        <div class="match-head">
          <span class="match-title"></span>
          <button class="btn btn-mini match-close" aria-label="Cerrar">${icon('close', 15)}</button>
        </div>
        <p class="match-hint">Candidatos reales: elige la fuente exacta (no se sustituyen versiones automáticamente).</p>
        <ul class="match-list"></ul>
      </div>
      <div class="lib-body">
        <div class="tracks-wrap">
          <table class="tracks">
            <thead>
              <tr>
                <th class="th-check"><input class="check-all" type="checkbox" aria-label="Seleccionar todas"></th>
                <th></th><th></th><th data-sort="title">Título</th><th>Tonalidad</th><th data-sort="bpm">BPM</th><th class="th-lufs">LUFS</th><th>Género</th>
                <th data-sort="duration">Dur.</th><th>Calidad</th><th>Fuente</th><th>Análisis</th><th class="th-actions">Acciones</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
          <div class="empty-row"></div>
        </div>
        <datalist class="lib-tag-list" id="lib-tag-list"></datalist>
        <aside class="playlists">
          <h3>Playlists</h3>
          <div class="playlist-create">
            <input class="playlist-name" type="text" placeholder="Nombre de playlist" maxlength="60">
            <button class="btn btn-mini playlist-create-btn">Crear</button>
          </div>
          <ul class="playlist-list"></ul>
          <div class="playlist-detail">
            <div class="playlist-detail-head">
              <img class="playlist-cover" hidden alt="">
              <span class="playlist-title">Sin playlist</span>
              <button class="btn btn-mini playlist-cover-btn" disabled title="Subir una portada" aria-label="Subir portada de la playlist">${icon('upload', 14)}</button>
              <input class="playlist-cover-input" type="file" accept="image/*" hidden>
              <button class="btn btn-mini playlist-download" disabled title="Descargar el audio de esta playlist" aria-label="Descargar playlist">${icon('download', 14)}</button>
              <button class="btn btn-mini playlist-add" disabled title="Añadir las pistas elegidas">＋ Añadir</button>
              <button class="btn btn-mini playlist-delete" aria-label="Eliminar playlist" disabled>${icon('trash', 15)}</button>
            </div>
            <ul class="playlist-tracks"></ul>
          </div>
          <h3>Inteligentes</h3>
          <div class="smart-create">
            <input class="smart-name" type="text" placeholder="Nombre" maxlength="60">
            <select class="smart-field" aria-label="Campo"></select>
            <select class="smart-op" aria-label="Operador"></select>
            <input class="smart-value" type="text" placeholder="valor">
            <button class="btn btn-mini smart-create-btn" title="Crear playlist inteligente" aria-label="Crear playlist inteligente">${icon('sparkles', 15)}</button>
          </div>
          <ul class="smart-list"></ul>
        </aside>
      </div>
    `;
    this.tableBody = this.el.querySelector('.tracks tbody') as HTMLTableSectionElement;
    this.playlistList = this.el.querySelector('.playlist-list') as HTMLUListElement;
    this.playlistTracks = this.el.querySelector('.playlist-tracks') as HTMLUListElement;
    this.playlistTitle = this.el.querySelector('.playlist-title') as HTMLElement;
    this.emptyRow = this.el.querySelector('.empty-row') as HTMLElement;
    this.backendBadge = this.el.querySelector('.backend-badge') as HTMLElement;
    this.searchInput = this.el.querySelector('.lib-search') as HTMLInputElement;
    this.sortSelect = this.el.querySelector('.lib-sort-select') as HTMLSelectElement;
    this.favOnly = this.el.querySelector('.lib-fav-only') as HTMLInputElement;
    this.sourceSelect = this.el.querySelector('.lib-src-select') as HTMLSelectElement;
    this.batchBar = this.el.querySelector('.batch-bar') as HTMLElement;
    this.batchCount = this.el.querySelector('.batch-count') as HTMLElement;
    this.spotifyInput = this.el.querySelector('.spotify-url') as HTMLInputElement;
    this.smartList = this.el.querySelector('.smart-list') as HTMLUListElement;
    this.smartField = this.el.querySelector('.smart-field') as HTMLSelectElement;
    this.smartOp = this.el.querySelector('.smart-op') as HTMLSelectElement;
    this.matchPanel = this.el.querySelector('.match-panel') as HTMLElement;
    this.matchList = this.el.querySelector('.match-list') as HTMLUListElement;
    this.matchTitle = this.el.querySelector('.match-title') as HTMLElement;
    this.browseGrid = this.el.querySelector('.library-browse') as HTMLElement;
    this.genreSelect = this.el.querySelector('.lib-genre-select') as HTMLSelectElement;
    this.formatSelect = this.el.querySelector('.lib-format-select') as HTMLSelectElement;
    this.tagList = this.el.querySelector('.lib-tag-list') as HTMLDataListElement;
    this.fileInput = this.el.querySelector('.file-input') as HTMLInputElement;
    this.dirInput = this.el.querySelector('.dir-input') as HTMLInputElement;
    this.bundleInput = this.el.querySelector('.bundle-input') as HTMLInputElement;
    (this.el.querySelector('.btn-export-bundle') as HTMLButtonElement).addEventListener('click', () => this.cb.onExportBundle());
    (this.el.querySelector('.btn-import-bundle') as HTMLButtonElement).addEventListener('click', () => this.bundleInput.click());
    (this.el.querySelector('.btn-trash') as HTMLButtonElement).addEventListener('click', () => this.cb.onOpenTrash());
    this.bundleInput.addEventListener('change', () => {
      const files = [...(this.bundleInput.files ?? [])];
      this.bundleInput.value = '';
      if (files.length > 0) this.cb.onImportBundle(files);
    });
    this.tracksWrap = this.el.querySelector('.tracks-wrap') as HTMLElement;
    this.tracksWrap.addEventListener('scroll', () => {
      if (!this.virtualActive || this.virtualFrame) return;
      this.virtualFrame = window.requestAnimationFrame(() => {
        this.virtualFrame = 0;
        this.renderVirtualRows();
      });
    });
    this.libJsonInput = this.el.querySelector('.lib-json-input') as HTMLInputElement;

    // ---------- Eventos ----------
    this.searchInput.addEventListener('input', () => this.renderTracks());
    this.sortSelect.addEventListener('change', () => this.renderTracks());
    this.favOnly.addEventListener('change', () => this.renderTracks());
    this.sourceSelect.addEventListener('change', () => this.renderTracks());
    this.genreSelect.addEventListener('change', () => this.renderTracks());
    this.formatSelect.addEventListener('change', () => this.renderTracks());
    for (const button of this.el.querySelectorAll<HTMLButtonElement>('[data-browse]')) {
      button.addEventListener('click', () => {
        this.browseMode = (button.dataset.browse ?? 'tracks') as typeof this.browseMode;
        for (const other of this.el.querySelectorAll<HTMLButtonElement>('[data-browse]')) {
          other.classList.toggle('active', other === button);
        }
        this.renderTracks();
      });
    }
    for (const header of this.el.querySelectorAll<HTMLElement>('th[data-sort]')) {
      header.addEventListener('click', () => {
        this.sortSelect.value = header.dataset.sort ?? 'added';
        this.renderTracks();
      });
    }

    const importBtn = this.el.querySelector('.btn-import') as HTMLButtonElement;
    importBtn.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', () => {
      const files = [...(this.fileInput.files ?? [])];
      this.fileInput.value = '';
      if (files.length > 0) this.cb.onImportFiles(files);
    });
    this.dirInput.webkitdirectory = true;
    (this.el.querySelector('.btn-import-dir') as HTMLButtonElement).addEventListener('click', () => this.dirInput.click());
    this.dirInput.addEventListener('change', () => {
      const files = [...(this.dirInput.files ?? [])].filter((file) => file.type.startsWith('audio/') || /\.(mp3|wav|ogg|oga|opus|m4a|flac|aac|aif|aiff|webm)$/i.test(file.name));
      this.dirInput.value = '';
      if (files.length > 0) this.cb.onImportFiles(files);
    });

    (this.el.querySelector('.lib-export') as HTMLButtonElement).addEventListener('click', () => this.cb.onExportLibrary());
    (this.el.querySelector('.lib-import-json') as HTMLButtonElement).addEventListener('click', () => this.libJsonInput.click());
    this.libJsonInput.addEventListener('change', () => {
      const file = this.libJsonInput.files?.[0];
      this.libJsonInput.value = '';
      if (file) this.cb.onImportLibraryJson(file);
    });

    (this.el.querySelector('.spotify-import') as HTMLButtonElement).addEventListener('click', () => {
      const url = this.spotifyInput.value.trim();
      if (url.length === 0) return;
      this.spotifyInput.value = '';
      this.cb.onImportSpotify(url);
    });
    this.spotifyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') (this.el.querySelector('.spotify-import') as HTMLButtonElement).click();
    });

    (this.el.querySelector('.match-close') as HTMLButtonElement).addEventListener('click', () => {
      this.matchPanel.hidden = true;
    });

    const nameInput = this.el.querySelector('.playlist-name') as HTMLInputElement;
    const submitPlaylist = (): void => {
      const name = nameInput.value.trim();
      if (name.length === 0) return;
      nameInput.value = '';
      this.cb.onCreatePlaylist(name);
    };
    (this.el.querySelector('.playlist-create-btn') as HTMLButtonElement).addEventListener('click', submitPlaylist);
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitPlaylist();
    });
    const coverInput = this.el.querySelector('.playlist-cover-input') as HTMLInputElement;
    (this.el.querySelector('.playlist-cover-btn') as HTMLButtonElement).addEventListener('click', () => coverInput.click());
    coverInput.addEventListener('change', () => {
      const file = coverInput.files?.[0];
      coverInput.value = '';
      if (!file || !this.activePlaylistId) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') this.cb.onSetPlaylistCover(this.activePlaylistId as string, reader.result);
      };
      reader.readAsDataURL(file);
    });
    (this.el.querySelector('.playlist-download') as HTMLButtonElement).addEventListener('click', () => {
      if (this.activePlaylistId) this.cb.onDownloadPlaylist(this.activePlaylistId);
    });
    (this.el.querySelector('.playlist-add') as HTMLButtonElement).addEventListener('click', () => {
      if (!this.activePlaylistId) return;
      const ids = this.checkedIds.size > 0 ? [...this.checkedIds] : this.selectedTrackId ? [this.selectedTrackId] : [];
      if (ids.length === 0) return;
      for (const id of ids) this.cb.onAddToPlaylist(this.activePlaylistId, id);
    });


    // Smart: campos + operadores válidos (sin reglas inventadas).
    for (const field of SMART_FIELDS) {
      const option = el('option', '', FIELD_LABELS[field]);
      (option as HTMLOptionElement).value = field;
      this.smartField.appendChild(option);
    }
    const refreshOps = (): void => {
      this.smartOp.textContent = '';
      for (const op of opsForField(this.smartField.value as SmartField)) {
        const option = el('option', '', { contains: 'contiene', equals: '=', gte: '≥', lte: '≤' }[op]);
        (option as HTMLOptionElement).value = op;
        this.smartOp.appendChild(option);
      }
    };
    this.smartField.addEventListener('change', refreshOps);
    refreshOps();
    (this.el.querySelector('.smart-create-btn') as HTMLButtonElement).addEventListener('click', () => {
      const name = (this.el.querySelector('.smart-name') as HTMLInputElement).value.trim();
      const value = (this.el.querySelector('.smart-value') as HTMLInputElement).value.trim();
      if (name.length === 0 || value.length === 0) return;
      const spec: SmartPlaylist = {
        id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        match: 'all',
        rules: [{ field: this.smartField.value as SmartField, op: this.smartOp.value as SmartOp, value }],
      };
      (this.el.querySelector('.smart-name') as HTMLInputElement).value = '';
      (this.el.querySelector('.smart-value') as HTMLInputElement).value = '';
      this.cb.onCreateSmart(spec);
    });

    // Batch bar
    const batch = (selector: string, fn: () => void): void => {
      (this.el.querySelector(selector) as HTMLButtonElement).addEventListener('click', fn);
    };
    batch('.batch-deck-a', () => this.withChecked((ids) => this.cb.onBatchToDeck('A', ids)));
    batch('.batch-deck-b', () => this.withChecked((ids) => this.cb.onBatchToDeck('B', ids)));
    batch('.batch-playlist', () => {
      if (!this.activePlaylistId) {
        this.el.dispatchEvent(new CustomEvent('libtoast', { detail: 'Crea o selecciona una playlist primero.' }));
        return;
      }
      this.withChecked((ids) => this.cb.onBatchToPlaylist(this.activePlaylistId as string, ids));
    });
    batch('.batch-metadata', () => this.withChecked((ids) => this.openBatchMetadata(ids)));
    batch('.batch-reanalyze', () => this.withChecked((ids) => this.cb.onBatchReanalyze(ids)));
    batch('.batch-remove', () => this.withChecked((ids) => this.cb.onBatchRemove(ids)));
    batch('.batch-clear', () => {
      this.checkedIds.clear();
      this.renderTracks();
    });
    (this.el.querySelector('.check-all') as HTMLInputElement).addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      for (const track of this.visibleTracks()) {
        if (checked) this.checkedIds.add(track.id);
        else this.checkedIds.delete(track.id);
      }
      this.renderTracks();
    });
  }

  private withChecked(fn: (ids: string[]) => void): void {
    const ids = [...this.checkedIds];
    if (ids.length === 0) return;
    fn(ids);
  }

  setBackend(kind: string): void {
    this.backendBadge.textContent =
      kind === 'opfs' ? 'OPFS' : kind === 'indexeddb' ? 'IndexedDB' : 'memoria';
  }

  setLoadedDecks(loaded: Record<DeckId, string | null>): void {
    this.loadedDeckIds = loaded;
    this.renderTracks();
  }

  setQueue(ids: readonly string[]): void {
    this.queueIds = ids;
    this.renderTracks();
  }

  setPreview(trackId: string | null): void {
    this.previewingId = trackId;
    this.renderTracks();
  }

  /** Deep link: abre una playlist concreta desde #/playlist/:id. */
  openPlaylist(playlistId: string): void {
    if (!this.playlists.some((playlist) => playlist.id === playlistId)) return;
    this.activePlaylistId = playlistId;
    this.activeSmartId = null;
    this.renderPlaylists();
    this.renderSmart();
  }

  /** Filtro rápido de favoritas desde la barra lateral. */
  showFavoritesOnly(): void {
    this.favOnly.checked = true;
    this.renderTracks();
  }

  focusSearch(): void {
    this.searchInput.focus();
    this.searchInput.select();
  }

  /** Abre el selector de archivos (acción global / importar). */
  pickFiles(): void {
    this.fileInput.click();
  }

  focusNewPlaylist(): void {
    (this.el.querySelector('.playlist-name') as HTMLInputElement | null)?.focus();
  }

  /** Muestra los candidatos reales para una pista solo-metadatos. */
  showCandidates(trackId: string, candidates: MatchCandidate[]): void {
    this.matchPanel.hidden = false;
    this.matchTitle.textContent = 'Fuentes candidatas';
    this.matchList.textContent = '';
    if (candidates.length === 0) {
      this.matchList.appendChild(el('li', '', 'Sin resultados.'));
      return;
    }
    for (const candidate of candidates) {
      const li = el('li', 'match-item');
      const label = el('span', 'match-label', `${candidate.title}${candidate.uploader ? ` · ${candidate.uploader}` : ''}${candidate.durationSec ? ` · ${formatTime(candidate.durationSec)}` : ''}`);
      const use = button('btn btn-mini', 'Usar esta', 'Traer este audio exacto a la biblioteca');
      use.addEventListener('click', () => {
        this.matchPanel.hidden = true;
        this.cb.onPickSource(trackId, candidate.url);
      });
      li.append(label, use);
      this.matchList.appendChild(li);
    }
  }

  showMatchError(message: string, detail?: string): void {
    this.matchPanel.hidden = false;
    this.matchTitle.textContent = 'Búsqueda de fuente';
    this.matchList.textContent = '';
    const li = el('li', 'match-item match-error');
    li.textContent = detail ? `${message} — ${detail}` : message;
    this.matchList.appendChild(li);
  }

  render(
    tracks: readonly TrackMeta[],
    playlists: readonly Playlist[],
    smartPlaylists: readonly SmartPlaylist[],
  ): void {
    this.tracks = tracks;
    this.playlists = playlists;
    this.smartPlaylists = smartPlaylists;
    if (this.activePlaylistId && !playlists.some((p) => p.id === this.activePlaylistId)) this.activePlaylistId = null;
    if (this.activeSmartId && !smartPlaylists.some((p) => p.id === this.activeSmartId)) this.activeSmartId = null;
    this.renderTracks();
    this.renderPlaylists();
    this.renderSmart();
  }

  private visibleTracks(): TrackMeta[] {
    const query = this.searchInput.value.trim();
    let list = [...this.tracks];
    if (query) {
      list = list.filter((t) =>
        fuzzyMatch(
          [t.title, t.artist, t.album, t.genre ?? '', t.fileName, t.spotifyId ?? '', t.folder ?? '', (t.tags ?? []).join(' ')],
          query,
        ),
      );
    }
    if (this.favOnly.checked) list = list.filter((t) => t.favorite);
    const src = this.sourceSelect.value as SourceFilter;
    if (src !== 'all') list = list.filter((t) => (t.origin?.type ?? 'import') === src);
    const genre = this.genreSelect.value;
    if (genre !== 'all') list = list.filter((t) => (t.genre ?? '') === genre);
    const format = this.formatSelect.value;
    if (format !== 'all') list = list.filter((t) => (t.quality?.format ?? 'desconocido') === format);
    const sort = this.sortSelect.value as LibrarySort;
    switch (sort) {
      case 'title':
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'artist':
        list.sort((a, b) => a.artist.localeCompare(b.artist));
        break;
      case 'bpm':
        list.sort((a, b) => (a.bpm ?? 9999) - (b.bpm ?? 9999));
        break;
      case 'duration':
        list.sort((a, b) => a.durationSec - b.durationSec);
        break;
      case 'plays':
        list.sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
        break;
      case 'lastPlayed':
        list.sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''));
        break;
      default:
        list.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    }
    return list;
  }

  private populateFilters(): void {
    const genres = [...new Set(this.tracks.map((t) => t.genre ?? '').filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const formats = [...new Set(this.tracks.map((t) => t.quality?.format ?? 'desconocido'))].sort();
    const fill = (select: HTMLSelectElement, values: string[], allLabel: string): void => {
      const current = select.value;
      select.textContent = '';
      const all = document.createElement('option');
      all.value = 'all';
      all.textContent = allLabel;
      select.appendChild(all);
      for (const value of values) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      }
      select.value = values.includes(current) ? current : 'all';
    };
    fill(this.genreSelect, genres, 'Todos');
    fill(this.formatSelect, formats, 'Todos');
    this.tagList.textContent = '';
    for (const tag of [...new Set(this.tracks.flatMap((t) => t.tags ?? []))].sort()) {
      const option = document.createElement('option');
      option.value = tag;
      this.tagList.appendChild(option);
    }
  }

  private renderBrowse(): void {
    this.browseGrid.textContent = '';
    const groups = new Map<string, TrackMeta[]>();
    const keyOf = (track: TrackMeta): string => {
      switch (this.browseMode) {
        case 'albums':
          return track.album || 'Sin álbum';
        case 'artists':
          return track.artist || 'Desconocido';
        case 'genres':
          return track.genre || 'Sin género';
        case 'folders':
          return track.folder || 'Sin carpeta';
        default:
          return '';
      }
    };
    for (const track of this.tracks) {
      const key = keyOf(track);
      const bucket = groups.get(key);
      if (bucket) bucket.push(track);
      else groups.set(key, [track]);
    }
    for (const [name, tracks] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const card = h('button', { className: 'browse-card', attrs: { type: 'button' } });
      const artwork = tracks.find((t) => t.artwork)?.artwork;
      if (artwork) {
        const image = document.createElement('img');
        image.className = 'browse-art';
        image.alt = '';
        image.src = artwork;
        card.appendChild(image);
      } else {
        card.appendChild(h('span', { className: 'browse-art browse-art-empty', text: name.slice(0, 1).toUpperCase() }));
      }
      card.append(
        h('strong', { className: 'browse-name', text: name }),
        h('small', { className: 'browse-count', text: `${tracks.length} pistas` }),
      );
      card.addEventListener('click', () => {
        if (this.browseMode === 'albums') this.cb.onOpenAlbum(name);
        else if (this.browseMode === 'artists') this.cb.onOpenArtist(name);
        else {
          this.searchInput.value = this.browseMode === 'genres' ? name : '';
          if (this.browseMode === 'genres') this.genreSelect.value = name;
          this.browseMode = 'tracks';
          for (const other of this.el.querySelectorAll<HTMLButtonElement>('[data-browse]')) {
            other.classList.toggle('active', other.dataset.browse === 'tracks');
          }
          this.renderTracks();
        }
      });
      this.browseGrid.appendChild(card);
    }
  }

  private openBatchMetadata(ids: string[]): void {
    const modal = openModal({ title: `Editar ${ids.length} pistas`, className: 'batch-metadata-modal' });
    const fields: { key: 'artist' | 'album' | 'genre' | 'tags' | 'lyrics'; label: string; placeholder: string }[] = [
      { key: 'artist', label: 'Artista', placeholder: 'Dejar vacío = no cambiar' },
      { key: 'album', label: 'Álbum', placeholder: 'Dejar vacío = no cambiar' },
      { key: 'genre', label: 'Género', placeholder: 'Dejar vacío = no cambiar' },
      { key: 'tags', label: 'Etiquetas (separadas por comas)', placeholder: 'club, peak time' },
      { key: 'lyrics', label: 'Letras (LRC o texto)', placeholder: 'Opcional' },
    ];
    const inputs = new Map<string, HTMLInputElement>();
    for (const field of fields) {
      const label = h('label', { className: 'meta-row' });
      label.appendChild(h('span', { text: field.label }));
      const input = h('input', {
        attrs: { type: 'text', placeholder: field.placeholder, list: field.key === 'tags' ? 'lib-tag-list' : '' },
      });
      inputs.set(field.key, input);
      label.appendChild(input);
      modal.body.appendChild(label);
    }
    const actions = h('div', { className: 'modal-actions' });
    const apply = h('button', { className: 'btn btn-primary btn-mini', text: 'Aplicar cambios' });
    apply.type = 'button';
    apply.addEventListener('click', () => {
      const patch: Partial<Pick<TrackMeta, 'artist' | 'album' | 'genre' | 'tags' | 'lyrics'>> = {};
      const artist = inputs.get('artist')?.value.trim();
      const album = inputs.get('album')?.value.trim();
      const genre = inputs.get('genre')?.value.trim();
      const tags = inputs.get('tags')?.value.trim();
      const lyrics = inputs.get('lyrics')?.value.trim();
      if (artist) patch.artist = artist;
      if (album) patch.album = album;
      if (genre) patch.genre = genre;
      if (tags) patch.tags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
      if (lyrics) patch.lyrics = lyrics;
      if (Object.keys(patch).length === 0) {
        modal.close();
        return;
      }
      this.cb.onBatchMetadata(ids, patch);
      modal.close();
    });
    actions.appendChild(apply);
    modal.body.appendChild(actions);
  }

  private renderTracks(): void {
    this.populateFilters();
    const tracksWrap = this.el.querySelector<HTMLElement>('.tracks-wrap');
    const browsing = this.browseMode !== 'tracks';
    if (tracksWrap) tracksWrap.hidden = browsing;
    this.browseGrid.hidden = !browsing;
    if (browsing) {
      this.emptyRow.style.display = 'none';
      this.renderBrowse();
      return;
    }
    this.tableBody.textContent = '';
    const visible = this.visibleTracks();
    const filterKey = [
      this.searchInput.value,
      this.genreSelect.value,
      this.formatSelect.value,
      this.sourceSelect.value,
      String(this.favOnly.checked),
      this.sortSelect.value,
    ].join('|');
    if (filterKey !== this.lastFilterKey) {
      this.lastFilterKey = filterKey;
      if (this.virtualActive) this.tracksWrap.scrollTop = 0;
    }
    this.emptyRow.style.display = this.tracks.length === 0 ? 'block' : 'none';
    if (this.tracks.length > 0 && visible.length === 0) {
      this.emptyRow.textContent = 'Ninguna pista coincide con la búsqueda.';
      this.emptyRow.style.display = 'block';
    } else {
      this.emptyRow.textContent = 'Aún no hay pistas. Importa audio, convierte una URL o importa metadatos de Spotify.';
    }

    // Barra de acciones por lotes.
    this.batchBar.hidden = this.checkedIds.size === 0;
    this.batchCount.textContent = `${this.checkedIds.size} elegidas`;

    if (visible.length > 300 && !this.editingId) {
      this.virtualActive = true;
      this.virtualTracks = visible;
      this.renderVirtualRows();
    } else {
      this.virtualActive = false;
      this.virtualTracks = [];
      const fragment = document.createDocumentFragment();
      for (const track of visible) fragment.appendChild(this.buildRow(track));
      this.tableBody.appendChild(fragment);
    }
  }

  /** Ventana de filas: sólo se pinta lo visible (+ margen) con espaciadores. */
  private renderVirtualRows(): void {
    const total = this.virtualTracks.length;
    if (total === 0) {
      this.tableBody.textContent = '';
      return;
    }
    const rowHeight = 46;
    const overscan = 8;
    const top = this.tracksWrap.scrollTop;
    const viewport = this.tracksWrap.clientHeight || 640;
    const start = Math.max(0, Math.floor(top / rowHeight) - overscan);
    const end = Math.min(total, Math.ceil((top + viewport) / rowHeight) + overscan);
    const spacer = (height: number): HTMLTableRowElement => {
      const row = document.createElement('tr');
      row.className = 'virtual-spacer';
      row.setAttribute('aria-hidden', 'true');
      const cell = document.createElement('td');
      cell.colSpan = 13;
      cell.style.height = `${Math.max(0, height)}px`;
      row.appendChild(cell);
      return row;
    };
    const fragment = document.createDocumentFragment();
    if (start > 0) fragment.appendChild(spacer(start * rowHeight));
    for (let index = start; index < end; index += 1) {
      const track = this.virtualTracks[index];
      if (track) fragment.appendChild(this.buildRow(track));
    }
    if (end < total) fragment.appendChild(spacer((total - end) * rowHeight));
    this.tableBody.replaceChildren(fragment);
  }

  /** Construye una fila; aislado para poder virtualizar la tabla. */
  private buildRow(track: TrackMeta): HTMLTableRowElement {
    const query = this.searchInput.value.trim();
    const row = el('tr');
    row.className = `${track.id === this.selectedTrackId ? 'selected' : ''} ${track.hasAudio ? '' : 'no-audio'}`;
    row.tabIndex = 0;
    row.draggable = true;
    row.setAttribute('aria-label', `${track.title} de ${track.artist}`);
    row.addEventListener('dragstart', (event) => {
      this.dragTrackId = track.id;
      event.dataTransfer?.setData('application/x-audiolad-track', track.id);
      event.dataTransfer?.setData('text/plain', track.title);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
    });
    row.addEventListener('dragend', () => {
      this.dragTrackId = null;
    });

    // Selección múltiple
    const checkTd = el('td', 'td-check');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = this.checkedIds.has(track.id);
    check.setAttribute('aria-label', `Elegir ${track.title}`);
    check.addEventListener('click', (e) => e.stopPropagation());
    check.addEventListener('change', () => {
      if (check.checked) this.checkedIds.add(track.id);
      else this.checkedIds.delete(track.id);
      this.batchBar.hidden = this.checkedIds.size === 0;
      this.batchCount.textContent = `${this.checkedIds.size} elegidas`;
    });
    checkTd.appendChild(check);
    row.appendChild(checkTd);


  const select = (): void => {
    this.selectedTrackId = track.id;
    this.renderTracks();
    this.renderPlaylists();
  };
  row.addEventListener('click', select);
  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') select();
    if (e.key === ' ') {
      e.preventDefault();
      if (track.hasAudio) this.cb.onPreview(track.id);
    }
  });
  row.addEventListener('dblclick', () => {
    if (track.hasAudio) this.cb.onPreview(track.id);
  });

  // Favorito
  const favTd = el('td', 'td-fav');
  const favBtn = button('btn btn-mini fav-btn', track.favorite ? '★' : '☆', track.favorite ? 'Quitar de favoritas' : 'Marcar como favorita');
  favBtn.classList.toggle('active', !!track.favorite);
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    this.cb.onToggleFavorite(track.id);
  });
  favTd.appendChild(favBtn);
  row.appendChild(favTd);

  // Artwork
  const artTd = el('td', 'td-art');
  if (track.artwork) {
    const img = document.createElement('img');
    img.src = track.artwork;
    img.alt = '';
    img.className = 'lib-artwork';
    artTd.appendChild(img);
  } else {
    artTd.appendChild(el('span', 'lib-artwork lib-artwork-empty', track.title.charAt(0).toUpperCase()));
  }
  row.appendChild(artTd);

  // Título (+ edición inline)
  const titleTd = el('td', 'td-title');
  if (this.editingId === track.id) {
    titleTd.appendChild(this.buildEditor(track));
  } else {
    const titleB = el('b');
    appendHighlighted(titleB, track.hasAudio ? track.title : `${track.title} · (pendiente de audio)`, query);
    titleTd.appendChild(titleB);
    const artistSmall = el('small', 'td-artist');
    appendHighlighted(artistSmall, track.artist, query);
    titleTd.appendChild(artistSmall);
    titleTd.title = `${track.fileName}${track.album ? ` · ${track.album}` : ''}${track.date ? ` · ${track.date}` : ''}${track.trackNumber ? ` · pista ${track.trackNumber}` : ''} · importada ${track.addedAt.slice(0, 10)} · ${track.playCount ?? 0} reproducciones · id ${track.id}`;
  }
  row.appendChild(titleTd);

  row.appendChild(el('td', 'td-key', formatKey(track.key)));
  row.appendChild(el('td', 'td-bpm', track.hasAudio ? `${formatBpm(track.bpm)}${track.bpm ? bpmBadge(track.bpmSource) : ''}` : '—'));
  row.appendChild(el('td', 'td-lufs', track.loudnessLufs != null && Number.isFinite(track.loudnessLufs) ? track.loudnessLufs.toFixed(1) : '—'));
  row.appendChild(el('td', 'td-genre', track.genre ?? ''));
  row.appendChild(el('td', '', formatTime(track.durationSec)));
  row.appendChild(el('td', 'td-quality', describeQuality(track.quality)));

  // Fuente
  const originType = track.origin?.type ?? 'import';
  const srcTd = el('td', 'td-src');
  const srcBadge = el('span', `src-badge src-${originType}`, SOURCE_LABELS[originType]);
  if (track.origin?.sourceUrl) srcBadge.title = track.origin.sourceUrl;
  srcTd.appendChild(srcBadge);
  row.appendChild(srcTd);

  // Estado de análisis (real)
  const analysis = analysisCell(track);
  const anTd = el('td', `td-analysis ${analysis.className}`, analysis.text);
  anTd.title = analysis.title;
  row.appendChild(anTd);

  // Acciones
  const actions = el('td', 'td-actions');
  if (!track.hasAudio) {
    const findBtn = button('btn btn-mini find-src', '', 'Buscar fuente de audio autorizada (tú eliges la versión)');
    findBtn.innerHTML = `${icon('search', 14)}<span>Fuente…</span>`;
    findBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cb.onFindSources(track.id);
    });
    actions.appendChild(findBtn);
  } else {
    const previewBtn = button('btn btn-mini preview-btn', this.previewingId === track.id ? '⏸' : '▶', 'Reproducción previa');
    previewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cb.onPreview(track.id);
    });
    actions.appendChild(previewBtn);

    for (const deckId of ['A', 'B'] as const) {
      const btn = button(`btn btn-mini load-${deckId.toLowerCase()}`, `→ ${deckId}`, `Cargar en Deck ${deckId}`);
      if (this.loadedDeckIds[deckId] === track.id) btn.classList.add('active');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cb.onLoadToDeck(track.id, deckId);
      });
      actions.appendChild(btn);
    }

    const enrichBtn = button('btn btn-mini enrich-btn', 'MB', 'Buscar en MusicBrainz (título, artista, álbum, portada)');
    enrichBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cb.onEnrich(track.id);
    });
    actions.appendChild(enrichBtn);

    const reBtn = button('btn btn-mini reanalyze-btn', '↻', 'Re-analizar (BPM, tonalidad, waveform)');
    reBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cb.onReanalyze(track.id);
    });
    actions.appendChild(reBtn);
  }

  const editBtn = button('btn btn-mini edit-btn', '✎', 'Editar metadatos');
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    this.editingId = this.editingId === track.id ? null : track.id;
    this.renderTracks();
  });
  actions.appendChild(editBtn);

  const nextBtn = button('btn btn-mini play-next-btn', '⏭', 'Reproducir a continuación');
  nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    this.cb.onPlayNext(track.id);
  });
  actions.appendChild(nextBtn);

  const inQueue = this.queueIds.includes(track.id);
  const queueBtn = button('btn btn-mini queue-btn', inQueue ? '✓ Cola' : '＋ Cola', inQueue ? 'Ya está en la cola' : 'Añadir a la cola');
  queueBtn.disabled = inQueue;
  queueBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    this.cb.onEnqueue(track.id);
  });
  actions.appendChild(queueBtn);

  const removeBtn = button('btn btn-mini track-remove', '✕', 'Quitar de la biblioteca');
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    this.cb.onRemoveTrack(track.id);
  });
  actions.appendChild(removeBtn);
    row.appendChild(actions);
    return row;
  }

  /** Editor inline de metadatos reales (guarda en la biblioteca persistida). */
  private buildEditor(track: TrackMeta): HTMLElement {
    const wrap = el('div', 'meta-editor');
    const fields: { key: keyof TrackMeta; label: string }[] = [
      { key: 'title', label: 'Título' },
      { key: 'artist', label: 'Artista' },
      { key: 'album', label: 'Álbum' },
      { key: 'genre', label: 'Género' },
      { key: 'date', label: 'Año' },
      { key: 'trackNumber', label: 'Nº' },
      { key: 'tags', label: 'Etiquetas' },
    ];
    const inputs = new Map<keyof TrackMeta, HTMLInputElement>();
    for (const { key, label } of fields) {
      const row = el('label', 'meta-row');
      row.appendChild(el('span', '', label));
      const input = document.createElement('input');
      input.type = 'text';
      input.value = Array.isArray(track[key]) ? (track[key] as string[]).join(', ') : String(track[key] ?? '');
      inputs.set(key, input);
      row.appendChild(input);
      wrap.appendChild(row);
    }
    const lyricsRow = el('label', 'meta-row');
    lyricsRow.appendChild(el('span', '', 'Letra (LRC)'));
    const lyrics = document.createElement('textarea');
    lyrics.rows = 3;
    lyrics.placeholder = '[00:12.00] Primera línea… o texto plano';
    lyrics.value = track.lyrics ?? '';
    lyricsRow.appendChild(lyrics);
    wrap.appendChild(lyricsRow);

    const artRow = el('label', 'meta-row');
    artRow.appendChild(el('span', '', 'Portada'));
    const artInput = document.createElement('input');
    artInput.type = 'file';
    artInput.accept = 'image/*';
    artInput.className = 'meta-art-input';
    artInput.addEventListener('change', () => {
      const file = artInput.files?.[0];
      artInput.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => this.cb.onSetArtwork(track.id, String(reader.result));
      reader.readAsDataURL(file);
    });
    artRow.appendChild(artInput);
    if (track.artwork) {
      const removeArt = button('btn btn-mini', 'Quitar portada', 'Volver a la portada embebida o vacía');
      removeArt.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cb.onSetArtwork(track.id, null);
      });
      artRow.appendChild(removeArt);
    }
    wrap.appendChild(artRow);

    const controls = el('div', 'meta-controls');
    const save = button('btn btn-mini', '✓ Guardar', 'Guardar metadatos');
    save.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.cb.onUpdateMetadata(track.id, {
        title: inputs.get('title')!.value.trim() || track.title,
        artist: inputs.get('artist')!.value.trim(),
        album: inputs.get('album')!.value.trim(),
        genre: inputs.get('genre')!.value.trim(),
        date: inputs.get('date')!.value.trim(),
        trackNumber: inputs.get('trackNumber')!.value.trim(),
        tags: inputs.get('tags')!.value.split(',').map((t) => t.trim()).filter((t) => t.length > 0),
        lyrics: lyrics.value.trim() || undefined,
      });
      this.editingId = null;
    });
    const cancel = button('btn btn-mini', '✕', 'Cancelar');
    cancel.addEventListener('click', (e) => {
      e.stopPropagation();
      this.editingId = null;
      this.renderTracks();
    });
    controls.append(save, cancel);
    wrap.appendChild(controls);
    return wrap;
  }

  private renderPlaylists(): void {
    this.playlistList.textContent = '';
    for (const playlist of this.playlists) {
      const li = el('li', playlist.id === this.activePlaylistId ? 'active' : '');
      const label = el('span', '', `${playlist.name} (${playlist.trackIds.length})`);
      label.addEventListener('click', () => {
        this.activePlaylistId = playlist.id;
        this.activeSmartId = null;
        this.renderPlaylists();
        this.renderSmart();
      });
      li.appendChild(label);
      this.playlistList.appendChild(li);
    }

    const active = this.playlists.find((p) => p.id === this.activePlaylistId) ?? null;
    const activeSmart = this.smartPlaylists.find((p) => p.id === this.activeSmartId) ?? null;
    this.playlistTitle.textContent = active ? active.name : activeSmart ? activeSmart.name : 'Sin playlist';
    const cover = this.el.querySelector('.playlist-cover') as HTMLImageElement;
    if (active?.coverUrl) {
      cover.src = active.coverUrl;
      cover.hidden = false;
    } else {
      cover.hidden = true;
      cover.removeAttribute('src');
    }
    const addBtn = this.el.querySelector('.playlist-add') as HTMLButtonElement;
    const deleteBtn = this.el.querySelector('.playlist-delete') as HTMLButtonElement;
    const coverBtn = this.el.querySelector('.playlist-cover-btn') as HTMLButtonElement;
    const downloadBtn = this.el.querySelector('.playlist-download') as HTMLButtonElement;
    coverBtn.disabled = !active;
    downloadBtn.disabled = !active || active.trackIds.length === 0;
    addBtn.disabled = !active;
    deleteBtn.disabled = !active && !activeSmart;
    if (activeSmart && !active) {
      deleteBtn.onclick = () => this.cb.onDeleteSmart(activeSmart.id);
    } else {
      deleteBtn.onclick = () => {
        if (this.activePlaylistId) this.cb.onDeletePlaylist(this.activePlaylistId);
      };
    }

    this.playlistTracks.textContent = '';
    if (activeSmart && !active) {
      // Vista viva: evaluada SIEMPRE contra la biblioteca actual.
      const matches = evaluateSmart(activeSmart, this.tracks);
      if (matches.length === 0) {
        this.playlistTracks.appendChild(el('li', '', 'Ninguna pista cumple las reglas ahora mismo.'));
        return;
      }
      matches.forEach((track, index) => {
        const li = el('li');
        li.appendChild(el('span', 'pt-name', `${String(index + 1).padStart(2, '0')} — ${track.artist} — ${track.title}`));
        const controls = el('span', 'pt-controls');
        for (const deckId of ['A', 'B'] as const) {
          if (!track.hasAudio) continue;
          const btn = button('btn btn-mini', `→ ${deckId}`, `Cargar en Deck ${deckId}`);
          btn.addEventListener('click', () => this.cb.onLoadToDeck(track.id, deckId));
          controls.appendChild(btn);
        }
        li.appendChild(controls);
        this.playlistTracks.appendChild(li);
      });
      return;
    }
    if (!active) return;

    // Playlist real: colección de referencias numeradas, cada una reproducible individual.
    active.trackIds.forEach((trackId, index) => {
      const track = this.tracks.find((t) => t.id === trackId);
      const li = el('li');
      li.appendChild(
        el(
          'span',
          'pt-name',
          track
            ? `${String(index + 1).padStart(2, '0')} — ${track.artist} — ${track.title}${track.hasAudio ? '' : ' · sin audio'}`
            : `(referencia eliminada)`,
        ),
      );
      li.draggable = true;
      li.addEventListener('dragstart', (event) => {
        this.dragTrackId = trackId;
        event.dataTransfer?.setData('application/x-audiolad-playlist-track', trackId);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      });
      li.addEventListener('dragover', (event) => {
        if (this.dragTrackId && this.dragTrackId !== trackId) event.preventDefault();
      });
      li.addEventListener('drop', (event) => {
        const fromId = this.dragTrackId ?? event.dataTransfer?.getData('application/x-audiolad-playlist-track');
        this.dragTrackId = null;
        if (fromId && fromId !== trackId && active.id) {
          event.preventDefault();
          this.cb.onReorderPlaylist(active.id, fromId, trackId);
        }
      });
      const controls = el('span', 'pt-controls');
      if (track?.hasAudio) {
        const preview = button('btn btn-mini', this.previewingId === track.id ? '⏸' : '▶', 'Reproducir este elemento');
        preview.addEventListener('click', () => this.cb.onPreview(track.id));
        controls.appendChild(preview);
        const reBtn = button('btn btn-mini', '↻', 'Analizar este elemento (BPM, tonalidad, waveform)');
        reBtn.addEventListener('click', () => this.cb.onReanalyze(track.id));
        controls.appendChild(reBtn);
        for (const deckId of ['A', 'B'] as const) {
          const btn = button('btn btn-mini', `→ ${deckId}`, `Cargar en Deck ${deckId}`);
          btn.addEventListener('click', () => this.cb.onLoadToDeck(track.id, deckId));
          controls.appendChild(btn);
        }
      }
      const up = button('btn btn-mini', '↑', 'Subir');
      up.disabled = index === 0;
      up.addEventListener('click', () => this.cb.onMove(active.id, trackId, -1));
      const down = button('btn btn-mini', '↓', 'Bajar');
      down.disabled = index === active.trackIds.length - 1;
      down.addEventListener('click', () => this.cb.onMove(active.id, trackId, 1));
      const remove = button('btn btn-mini', '✕', 'Quitar de la playlist (la pista física no se borra)');
      remove.addEventListener('click', () => this.cb.onRemoveFromPlaylist(active.id, trackId));
      controls.append(up, down, remove);
      li.appendChild(controls);
      this.playlistTracks.appendChild(li);
    });
  }

  private renderSmart(): void {
    this.smartList.textContent = '';
    for (const smart of this.smartPlaylists) {
      const count = evaluateSmart(smart, this.tracks).length;
      const li = el('li', smart.id === this.activeSmartId ? 'active' : '');
      const label = el('span', '', `${smart.name} (${count})`);
      label.insertAdjacentHTML('afterbegin', `${icon('sparkles', 13)} `);
      label.addEventListener('click', () => {
        this.activeSmartId = smart.id;
        this.activePlaylistId = null;
        this.renderPlaylists();
        this.renderSmart();
      });
      li.appendChild(label);
      this.smartList.appendChild(li);
    }
  }
}

function bpmBadge(source: string): string {
  return { tag: ' TAG', estimated: ' EST', manual: ' MAN' }[source] ?? '';
}
