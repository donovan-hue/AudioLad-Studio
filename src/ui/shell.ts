/**
 * Shell de la aplicación: barra lateral fija, topbar, stack de páginas,
 * panel lateral de cola y barra persistente «Ahora suena».
 */

import type { Playlist } from '../library/library.js';
import type { Route, ToolId } from './router.js';
import { icon, type IconName } from './icons.js';
import { h, iconButton } from './components.js';

export interface ShellElements {
  root: HTMLElement;
  sidebar: HTMLElement;
  sidebarBackdrop: HTMLElement;
  menuButton: HTMLButtonElement;
  backButton: HTMLButtonElement;
  forwardButton: HTMLButtonElement;
  searchButton: HTMLButtonElement;
  notificationButton: HTMLButtonElement;
  notificationBadge: HTMLElement;
  themeButton: HTMLButtonElement;
  pages: {
    home: HTMLElement;
    discover: HTMLElement;
    search: HTMLElement;
    library: HTMLElement;
    collection: HTMLElement;
    cabina: HTMLElement;
    tool: HTMLElement;
  };
  toolTitle: HTMLElement;
  queueBody: HTMLElement;
  queueDrawer: HTMLElement;
  queueBackdrop: HTMLElement;
  queueClose: HTMLButtonElement;
  nowPlaying: HTMLElement;
  toasts: HTMLElement;
  notificationPanel: HTMLElement;
}

const NAV: { icon: IconName; label: string; route: Route }[] = [
  { icon: 'home', label: 'Inicio', route: { name: 'home' } },
  { icon: 'sparkles', label: 'Descubrir', route: { name: 'discover' } },
  { icon: 'search', label: 'Buscar', route: { name: 'search' } },
  { icon: 'library', label: 'Tu biblioteca', route: { name: 'library' } },
  { icon: 'deck', label: 'Cabina DJ', route: { name: 'cabina' } },
  { icon: 'queue', label: 'Cola', route: { name: 'queue' } },
];

const TOOLS: { icon: IconName; label: string; id: ToolId }[] = [
  { icon: 'sampler', label: 'Sampler', id: 'sampler' },
  { icon: 'recorder', label: 'Grabadora', id: 'recorder' },
  { icon: 'history', label: 'Historial', id: 'history' },
  { icon: 'link', label: 'Fuentes (URL)', id: 'sources' },
  { icon: 'import', label: 'Lotes', id: 'imports' },
  { icon: 'settings', label: 'Configuración', id: 'settings' },
  { icon: 'help', label: 'Ayuda', id: 'help' },
];

export class Shell {
  readonly el: ShellElements;
  private readonly sideNavButtons: HTMLButtonElement[] = [];
  private readonly sideToolButtons: HTMLButtonElement[] = [];
  private readonly playlistList: HTMLElement;
  private readonly favoritesButton: HTMLButtonElement;
  private readonly newPlaylistButton: HTMLButtonElement;
  private readonly backendBadge: HTMLElement;
  private readonly importButton: HTMLButtonElement;
  private onNewPlaylist: (() => void) | null = null;
  private onImport: (() => void) | null = null;
  private onFavorites: (() => void) | null = null;

  constructor(onNavigate: (route: Route) => void) {
    const root = h('div', { className: 'app-shell' });

    // ---------- Sidebar ----------
    const sidebar = h('aside', { className: 'sidebar', attrs: { 'aria-label': 'Navegación principal' } });
    const brand = h('a', { className: 'brand', attrs: { href: '#/' } });
    const brandMark = h('span', { className: 'brand-mark' });
    brandMark.innerHTML = icon('waveform', 22);
    brand.append(brandMark, h('span', { className: 'brand-name', text: 'AudioLad Studio' }));
    brand.addEventListener('click', (event) => {
      event.preventDefault();
      onNavigate({ name: 'home' });
    });

    const nav = h('nav', { className: 'side-nav' });
    for (const item of NAV) {
      const button = h('button', { className: 'side-link', title: item.label });
      button.type = 'button';
      button.innerHTML = `${icon(item.icon, 20)}<span>${item.label}</span>`;
      button.addEventListener('click', () => {
        onNavigate(item.route);
        this.closeMobile();
      });
      nav.appendChild(button);
      this.sideNavButtons.push(button);
    }

    const scroll = h('div', { className: 'side-scroll' });
    const musicSection = h('div', { className: 'side-section' });
    musicSection.appendChild(h('h3', { className: 'side-heading', text: 'Tu música' }));

    this.favoritesButton = h('button', { className: 'side-link side-sublink' });
    this.favoritesButton.type = 'button';
    this.favoritesButton.innerHTML = `${icon('heart', 18)}<span>Favoritas</span>`;
    this.favoritesButton.addEventListener('click', () => this.onFavorites?.());
    musicSection.appendChild(this.favoritesButton);

    this.playlistList = h('div', { className: 'side-playlists' });
    musicSection.appendChild(this.playlistList);

    this.newPlaylistButton = h('button', { className: 'side-link side-sublink side-new' });
    this.newPlaylistButton.type = 'button';
    this.newPlaylistButton.innerHTML = `${icon('plus', 18)}<span>Nueva playlist</span>`;
    this.newPlaylistButton.addEventListener('click', () => this.onNewPlaylist?.());
    musicSection.appendChild(this.newPlaylistButton);

    const toolsSection = h('div', { className: 'side-section' });
    toolsSection.appendChild(h('h3', { className: 'side-heading', text: 'Herramientas' }));
    for (const tool of TOOLS) {
      const button = h('button', { className: 'side-link side-sublink', title: tool.label });
      button.type = 'button';
      button.innerHTML = `${icon(tool.icon, 18)}<span>${tool.label}</span>`;
      button.addEventListener('click', () => {
        onNavigate({ name: 'tool', id: tool.id });
        this.closeMobile();
      });
      toolsSection.appendChild(button);
      this.sideToolButtons.push(button);
    }

    scroll.append(musicSection, toolsSection);
    const footer = h('div', { className: 'side-footer' });
    this.backendBadge = h('span', { className: 'side-backend', text: 'almacenamiento…' });
    this.importButton = h('button', { className: 'btn btn-primary side-import' });
    this.importButton.type = 'button';
    this.importButton.innerHTML = `${icon('import', 18)}<span>Importar audio</span>`;
    this.importButton.addEventListener('click', () => this.onImport?.());
    footer.append(this.backendBadge, this.importButton);
    sidebar.append(brand, nav, scroll, footer);

    const sidebarBackdrop = h('div', { className: 'sidebar-backdrop' });

    // ---------- Topbar ----------
    const main = h('div', { className: 'shell-main' });
    const topbar = h('header', { className: 'app-topbar' });
    const menuButton = iconButton('menu', 'Abrir menú', 'btn btn-mini icon-btn menu-btn');
    const backButton = iconButton('chevronLeft', 'Atrás', 'btn btn-mini icon-btn nav-btn');
    const forwardButton = iconButton('chevronRight', 'Adelante', 'btn btn-mini icon-btn nav-btn');
    const historyNav = h('div', { className: 'history-nav' });
    historyNav.append(backButton, forwardButton);

    const searchButton = h('button', { className: 'global-search', attrs: { type: 'button', 'aria-label': 'Buscar en la biblioteca' } });
    searchButton.innerHTML = `${icon('search', 18)}<span class="global-search-text">Buscar pistas, artistas, álbumes…</span><kbd>⌘K</kbd>`;
    searchButton.addEventListener('click', () => onNavigate({ name: 'search' }));

    const actions = h('div', { className: 'topbar-actions' });
    const notificationButton = h('button', { className: 'btn btn-mini icon-btn notification-btn', attrs: { type: 'button', 'aria-label': 'Notificaciones' } });
    notificationButton.innerHTML = icon('bell', 19);
    const notificationBadge = h('span', { className: 'notification-badge', attrs: { hidden: true } });
    notificationButton.appendChild(notificationBadge);
    const themeButton = h('button', { className: 'btn btn-mini icon-btn theme-toggle', attrs: { type: 'button', 'aria-label': 'Cambiar tema' } });
    actions.append(notificationButton, themeButton);
    topbar.append(menuButton, historyNav, searchButton, h('span', { className: 'spacer' }), actions);

    // ---------- Páginas ----------
    const viewStack = h('div', { className: 'view-stack' });
    const makePage = (name: string): HTMLElement => {
      const page = h('section', { className: 'app-page', attrs: { 'data-page': name } });
      page.hidden = true;
      viewStack.appendChild(page);
      return page;
    };
    const pages = {
      home: makePage('home'),
      discover: makePage('discover'),
      search: makePage('search'),
      library: makePage('library'),
      collection: makePage('collection'),
      cabina: makePage('cabina'),
      tool: makePage('tool'),
    };
    const toolHeader = h('div', { className: 'page-header' });
    const toolTitle = h('h1', { className: 'page-title', text: 'Herramientas' });
    toolHeader.appendChild(toolTitle);
    pages.tool.appendChild(toolHeader);
    const toolSlot = h('div', { className: 'tool-slot' });
    pages.tool.appendChild(toolSlot);

    main.append(topbar, viewStack);
    viewStack.id = 'main-content';
    viewStack.tabIndex = -1;
    const skipLink = h('a', { className: 'skip-link', text: 'Saltar al contenido principal' });
    skipLink.href = '#main-content';
    root.append(skipLink, sidebar, sidebarBackdrop, main);

    // ---------- Cola lateral ----------
    const queueDrawer = h('aside', { className: 'queue-drawer', attrs: { 'aria-label': 'A continuación', 'aria-hidden': 'true' } });
    const queueHead = h('div', { className: 'queue-drawer-head' });
    queueHead.append(
      h('h2', { className: 'queue-drawer-title', text: 'A continuación' }),
      iconButton('close', 'Cerrar cola', 'btn btn-mini icon-btn queue-close'),
    );
    const queueBody = h('div', { className: 'queue-drawer-body' });
    queueDrawer.append(queueHead, queueBody);
    const queueBackdrop = h('div', { className: 'queue-backdrop' });
    const queueClose = queueHead.querySelector('.queue-close') as HTMLButtonElement;
    root.append(queueDrawer, queueBackdrop);

    // ---------- Ahora suena ----------
    const nowPlaying = h('footer', { className: 'now-playing', attrs: { 'aria-label': 'Ahora suena' } });
    root.appendChild(nowPlaying);

    // ---------- Toasts y notificaciones ----------
    const toasts = h('div', { className: 'toasts' });
    const notificationPanel = h('aside', {
      className: 'notification-panel',
      attrs: { 'aria-label': 'Centro de notificaciones', hidden: true },
    });
    root.append(toasts, notificationPanel);

    this.el = {
      root,
      sidebar,
      sidebarBackdrop,
      menuButton,
      backButton,
      forwardButton,
      searchButton,
      notificationButton,
      notificationBadge,
      themeButton,
      pages,
      toolTitle,
      queueBody,
      queueDrawer,
      queueBackdrop,
      queueClose,
      nowPlaying,
      toasts,
      notificationPanel,
    };
    this.toolSlot = toolSlot;
  }

  readonly toolSlot: HTMLElement;

  setHandlers(handlers: {
    onNewPlaylist?: () => void;
    onImport?: () => void;
    onFavorites?: () => void;
  }): void {
    this.onNewPlaylist = handlers.onNewPlaylist ?? null;
    this.onImport = handlers.onImport ?? null;
    this.onFavorites = handlers.onFavorites ?? null;
  }

  setBackend(kind: string): void {
    this.backendBadge.textContent = kind === 'opfs' ? 'OPFS' : kind === 'indexeddb' ? 'IndexedDB' : 'memoria';
    this.backendBadge.title = `Almacenamiento: ${kind}`;
  }

  renderPlaylists(playlists: readonly Playlist[], activeId: string | null): void {
    this.playlistList.textContent = '';
    if (playlists.length === 0) {
      this.playlistList.appendChild(h('p', { className: 'side-empty', text: 'Aún no hay playlists.' }));
      return;
    }
    for (const playlist of playlists) {
      const button = h('button', { className: `side-playlist${playlist.id === activeId ? ' active' : ''}` });
      button.type = 'button';
      button.title = playlist.name;
      button.insertAdjacentHTML('afterbegin', icon('list', 16));
      button.append(
        h('span', { text: playlist.name }),
        h('small', { text: String(playlist.trackIds.length) }),
      );
      button.addEventListener('click', () => {
        window.location.hash = `#/playlist/${encodeURIComponent(playlist.id)}`;
        this.closeMobile();
      });
      this.playlistList.appendChild(button);
    }
  }

  setActive(route: Route): void {
    const active = (button: HTMLButtonElement, on: boolean): void => {
      button.classList.toggle('active', on);
      button.setAttribute('aria-current', on ? 'page' : 'false');
    };
    const searchActive = route.name === 'search' || route.name === 'album' || route.name === 'artist';
    const libraryActive = route.name === 'library' || route.name === 'playlist';
    const states = [
      route.name === 'home',
      route.name === 'discover',
      searchActive,
      libraryActive,
      route.name === 'cabina',
      route.name === 'queue',
    ];
    this.sideNavButtons.forEach((button, index) => active(button, states[index] === true));
    this.sideToolButtons.forEach((button, index) => active(button, route.name === 'tool' && TOOLS[index]?.id === route.id));
    this.favoritesButton.classList.remove('active');
    this.playlistList.querySelectorAll('.side-playlist').forEach((node) => node.classList.remove('active'));
  }

  showPage(name: keyof ShellElements['pages']): void {
    for (const [key, page] of Object.entries(this.el.pages)) {
      page.hidden = key !== name;
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  openMobile(): void {
    this.el.sidebar.classList.add('open');
    this.el.sidebarBackdrop.classList.add('visible');
  }

  closeMobile(): void {
    this.el.sidebar.classList.remove('open');
    this.el.sidebarBackdrop.classList.remove('visible');
  }

  toggleMobile(): void {
    if (this.el.sidebar.classList.contains('open')) this.closeMobile();
    else this.openMobile();
  }

  openQueue(): void {
    this.el.queueDrawer.classList.add('open');
    this.el.queueDrawer.setAttribute('aria-hidden', 'false');
    this.el.queueBackdrop.classList.add('visible');
  }

  closeQueue(): void {
    this.el.queueDrawer.classList.remove('open');
    this.el.queueDrawer.setAttribute('aria-hidden', 'true');
    this.el.queueBackdrop.classList.remove('visible');
  }

  get queueIsOpen(): boolean {
    return this.el.queueDrawer.classList.contains('open');
  }
}

export function createShell(onNavigate: (route: Route) => void): Shell {
  return new Shell(onNavigate);
}
