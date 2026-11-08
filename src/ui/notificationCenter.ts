/**
 * Centro de actividad: unifica los toasts con un historial persistente de
 * notificaciones, con contador de no leídas y acciones de limpieza.
 */

import type { ToastKind } from './toast.js';
import { icon } from './icons.js';
import { h, iconButton } from './components.js';

interface NotificationItem {
  id: string;
  message: string;
  kind: ToastKind;
  at: string;
  read: boolean;
}

const STORAGE_KEY = 'audiolad.notifications.v1';
const MAX_ITEMS = 40;

export class NotificationCenter {
  private items: NotificationItem[] = [];
  private readonly listEl: HTMLElement;
  private readonly emptyEl: HTMLElement;
  private readonly badge: HTMLElement;
  private open = false;

  constructor(
    private readonly button: HTMLButtonElement,
    private readonly panel: HTMLElement,
    badge: HTMLElement,
  ) {
    this.badge = badge;
    this.items = this.load();

    const head = h('div', { className: 'notification-head' });
    head.appendChild(h('h2', { className: 'notification-title', text: 'Notificaciones' }));
    const actions = h('div', { className: 'notification-actions' });
    const markAll = h('button', { className: 'btn btn-ghost btn-mini', text: 'Marcar leídas' });
    markAll.type = 'button';
    markAll.addEventListener('click', () => this.markAllRead());
    const clear = iconButton('trash', 'Vaciar notificaciones', 'btn btn-mini icon-btn');
    clear.addEventListener('click', () => this.clear());
    const close = iconButton('close', 'Cerrar notificaciones', 'btn btn-mini icon-btn');
    close.addEventListener('click', () => this.close());
    actions.append(markAll, clear, close);
    head.appendChild(actions);

    this.listEl = h('ul', { className: 'notification-list' });
    this.emptyEl = h('p', { className: 'notification-empty', text: 'Sin notificaciones por ahora.' });
    this.panel.append(head, this.emptyEl, this.listEl);

    this.button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggle();
    });
    this.panel.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('click', () => this.close());
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.close();
    });
    this.render();
  }

  push(message: string, kind: ToastKind = 'info'): void {
    const item: NotificationItem = {
      id: `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      message,
      kind,
      at: new Date().toISOString(),
      read: false,
    };
    this.items = [item, ...this.items].slice(0, MAX_ITEMS);
    this.persist();
    this.render();
  }

  toggle(): void {
    if (this.open) this.close();
    else this.openPanel();
  }

  openPanel(): void {
    this.open = true;
    this.panel.hidden = false;
    this.panel.classList.add('open');
    this.button.setAttribute('aria-expanded', 'true');
    this.render();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.panel.hidden = true;
    this.panel.classList.remove('open');
    this.button.setAttribute('aria-expanded', 'false');
  }

  markAllRead(): void {
    this.items = this.items.map((item) => ({ ...item, read: true }));
    this.persist();
    this.render();
  }

  clear(): void {
    this.items = [];
    this.persist();
    this.render();
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    } catch {
      /* sin localStorage: solo memoria */
    }
  }

  private load(): NotificationItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is NotificationItem => {
        const value = item as Partial<NotificationItem>;
        return typeof value.id === 'string' && typeof value.message === 'string' && typeof value.at === 'string';
      });
    } catch {
      return [];
    }
  }

  private render(): void {
    const unread = this.items.filter((item) => !item.read).length;
    this.badge.hidden = unread === 0;
    this.badge.textContent = unread > 9 ? '9+' : String(unread);
    this.button.setAttribute('aria-label', `${unread} notificaciones sin leer`);
    this.emptyEl.hidden = this.items.length > 0;
    this.listEl.textContent = '';

    for (const item of this.items) {
      const li = h('li', { className: `notification-item ${item.read ? 'read' : 'unread'} kind-${item.kind}` });
      const dot = h('span', { className: 'notification-dot' });
      dot.innerHTML = icon(item.kind === 'error' ? 'close' : item.kind === 'ok' ? 'check' : 'bell', 15);
      const body = h('div', { className: 'notification-body' });
      body.append(
        h('p', { className: 'notification-message', text: item.message }),
        h('small', { className: 'notification-time', text: relativeTime(item.at) }),
      );
      li.append(dot, body);
      li.addEventListener('click', () => {
        item.read = true;
        this.persist();
        this.render();
      });
      this.listEl.appendChild(li);
    }
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}
