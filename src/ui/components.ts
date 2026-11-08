/**
 * Sistema de componentes mínimo: helpers de DOM, botones con icono,
 * tarjetas, encabezados de sección, estados vacíos y modales accesibles.
 * Todas las vistas nuevas se construyen con estas piezas.
 */

import { icon, type IconName } from './icons.js';

type Attrs = {
  className?: string;
  text?: string;
  title?: string;
  attrs?: Record<string, string | boolean | number>;
  children?: (Node | string)[];
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: Attrs = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.title) node.title = options.title;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      if (value === false) continue;
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of options.children ?? []) {
    node.append(child);
  }
  return node;
}

export function iconButton(
  name: IconName,
  label: string,
  className = 'btn btn-mini icon-btn',
  size = 18,
): HTMLButtonElement {
  const button = h('button', { className, title: label });
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.innerHTML = icon(name, size);
  return button;
}

export function actionButton(
  name: IconName,
  label: string,
  className = 'btn',
  size = 18,
): HTMLButtonElement {
  const button = iconButton(name, label, className, size);
  button.innerHTML = `${icon(name, size)}<span>${label}</span>`;
  return button;
}

export function sectionHeader(
  title: string,
  action?: { label: string; onClick: () => void },
): HTMLElement {
  const header = h('div', { className: 'section-head' });
  header.appendChild(h('h2', { className: 'section-title', text: title }));
  if (action) {
    const button = h('button', { className: 'btn btn-ghost btn-mini', text: action.label });
    button.type = 'button';
    button.addEventListener('click', action.onClick);
    header.appendChild(button);
  }
  return header;
}

export function emptyState(name: IconName, title: string, text: string): HTMLElement {
  const wrap = h('div', { className: 'empty-state' });
  const render = h('span', { className: 'empty-state-icon' });
  render.innerHTML = icon(name, 34);
  wrap.append(render, h('b', { text: title }), h('p', { text }));
  return wrap;
}

export function artwork(
  src: string | undefined,
  title: string,
  className = 'artwork',
): HTMLElement {
  if (src) {
    const img = h('img', { className, attrs: { src, alt: '', loading: 'lazy' } });
    return img;
  }
  const fallback = h('span', { className: `${className} artwork-empty`, text: title.charAt(0).toUpperCase() || '♪' });
  return fallback;
}

export function setText(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

export function setWidth(node: HTMLElement, percent: number): void {
  const value = `${Math.max(0, Math.min(100, percent))}%`;
  if (node.style.width !== value) node.style.width = value;
}

interface ModalOptions {
  title: string;
  className?: string;
  onClose?: () => void;
}

export interface ModalHandle {
  root: HTMLElement;
  body: HTMLElement;
  close(): void;
}

/** Modal con overlay, cierre por Escape y foco inicial controlado. */
export function openModal(options: ModalOptions): ModalHandle {
  const root = h('div', { className: `modal-overlay ${options.className ?? ''}`.trim() });
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', options.title);

  const panel = h('div', { className: 'modal-panel' });
  const head = h('div', { className: 'modal-head' });
  head.appendChild(h('h2', { className: 'modal-title', text: options.title }));
  const closeButton = iconButton('close', 'Cerrar', 'btn btn-mini icon-btn');
  head.appendChild(closeButton);

  const body = h('div', { className: 'modal-body' });
  panel.append(head, body);
  root.appendChild(panel);
  document.body.appendChild(root);

  const previousFocus = document.activeElement as HTMLElement | null;
  const close = (): void => {
    root.remove();
    document.removeEventListener('keydown', onKey, true);
    options.onClose?.();
    previousFocus?.focus();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  closeButton.addEventListener('click', close);
  root.addEventListener('click', (event) => {
    if (event.target === root) close();
  });
  document.addEventListener('keydown', onKey, true);
  (panel.querySelector('button') as HTMLButtonElement | null)?.focus();

  return { root, body, close };
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
