/**
 * Router por hash: rutas reales, deep links compartibles y navegación
 * atrás/adelante del navegador. Sin dependencias.
 */

export type ToolId =
  | 'sampler'
  | 'recorder'
  | 'history'
  | 'sources'
  | 'imports'
  | 'settings'
  | 'help';

export type Route =
  | { name: 'home' }
  | { name: 'search' }
  | { name: 'library' }
  | { name: 'playlist'; id: string }
  | { name: 'album'; album: string }
  | { name: 'artist'; artist: string }
  | { name: 'cabina' }
  | { name: 'queue' }
  | { name: 'tool'; id: ToolId }
  | { name: 'notfound'; path: string };

const TOOL_IDS: readonly ToolId[] = ['sampler', 'recorder', 'history', 'sources', 'imports', 'settings', 'help'];

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  const parts = path.split('/').filter((part) => part.length > 0);
  if (parts.length === 0) return { name: 'home' };
  const [head, ...rest] = parts;
  switch (head) {
    case 'search':
      return { name: 'search' };
    case 'library':
      return { name: 'library' };
    case 'playlist':
      return rest[0] ? { name: 'playlist', id: safeDecode(rest[0]) } : { name: 'library' };
    case 'album':
      return rest[0] ? { name: 'album', album: safeDecode(rest.slice(0).join('/')) } : { name: 'search' };
    case 'artist':
      return rest[0] ? { name: 'artist', artist: safeDecode(rest.slice(0).join('/')) } : { name: 'search' };
    case 'cabina':
      return { name: 'cabina' };
    case 'queue':
      return { name: 'queue' };
    case 'herramientas':
    case 'tools': {
      const id = rest[0] as ToolId | undefined;
      return id && TOOL_IDS.includes(id) ? { name: 'tool', id } : { name: 'home' };
    }
    default:
      return { name: 'notfound', path };
  }
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'search':
      return '#/search';
    case 'library':
      return '#/library';
    case 'playlist':
      return `#/playlist/${encodeURIComponent(route.id)}`;
    case 'album':
      return `#/album/${encodeURIComponent(route.album)}`;
    case 'artist':
      return `#/artist/${encodeURIComponent(route.artist)}`;
    case 'cabina':
      return '#/cabina';
    case 'queue':
      return '#/queue';
    case 'tool':
      return `#/herramientas/${route.id}`;
    case 'notfound':
      return `#${route.path}`;
  }
}

export class Router {
  private onChange: ((route: Route) => void) | null = null;
  private listening = false;

  current(): Route {
    return parseRoute(window.location.hash);
  }

  start(onChange: (route: Route) => void): void {
    this.onChange = onChange;
    if (!this.listening) {
      window.addEventListener('hashchange', () => {
        this.onChange?.(this.current());
      });
      this.listening = true;
    }
    if (!window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`);
    }
    onChange(this.current());
  }

  navigate(route: Route): void {
    const hash = routeToHash(route);
    if (window.location.hash === hash) {
      this.onChange?.(route);
      return;
    }
    window.location.hash = hash;
  }

  back(): void {
    window.history.back();
  }

  forward(): void {
    window.history.forward();
  }

  /** URL absoluta de la ruta actual (para compartir / deep link). */
  shareUrl(route: Route = this.current()): string {
    return `${window.location.origin}${window.location.pathname}${window.location.search}${routeToHash(route)}`;
  }
}
