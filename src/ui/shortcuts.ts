/**
 * Atajos globales configurables: registro de acciones, captura de teclas,
 * persistencia en localStorage y editor visual accesible.
 */

import { h, isEditableTarget, openModal } from './components.js';

export interface ShortcutAction {
  id: string;
  label: string;
  group: string;
  defaultKey: string;
  action: () => void;
}

type Bindings = Record<string, string>;

const STORAGE_KEY = 'audiolad.shortcuts.v1';

export function normalizeKey(event: KeyboardEvent): string | null {
  const key = event.key;
  if (key === 'Meta' || key === 'Control' || key === 'Alt' || key === 'Shift') return null;
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push('mod');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  let base = key.toLowerCase();
  if (key === ' ') base = 'space';
  else if (key === 'Escape') base = 'escape';
  else if (key === 'ArrowUp') base = 'up';
  else if (key === 'ArrowDown') base = 'down';
  else if (key === 'ArrowLeft') base = 'left';
  else if (key === 'ArrowRight') base = 'right';
  else if (key === '?') base = '/';
  else if (event.code === 'Slash') base = '/';
  else if (event.code === 'Comma') base = ',';
  else if (event.code === 'Period') base = '.';
  else if (event.code === 'Backslash') base = '\\';
  return [...parts, base].join('+');
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

export function formatCombo(combo: string): string {
  return combo
    .split('+')
    .map((part) => {
      if (part === 'mod') return IS_MAC ? '⌘' : 'Ctrl';
      if (part === 'alt') return IS_MAC ? '⌥' : 'Alt';
      if (part === 'shift') return IS_MAC ? '⇧' : 'Shift';
      if (part === 'space') return 'Espacio';
      if (part === 'escape') return 'Esc';
      if (part === 'up') return '↑';
      if (part === 'down') return '↓';
      if (part === 'left') return '←';
      if (part === 'right') return '→';
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join(' + ');
}

export class ShortcutManager {
  private readonly bindings: Bindings;
  private readonly byId = new Map<string, ShortcutAction>();

  constructor(private readonly actions: ShortcutAction[]) {
    for (const action of actions) this.byId.set(action.id, action);
    this.bindings = this.load();
  }

  get all(): ShortcutAction[] {
    return this.actions;
  }

  bindingFor(id: string): string {
    const action = this.byId.get(id);
    return this.bindings[id] ?? action?.defaultKey ?? '';
  }

  handle(event: KeyboardEvent): boolean {
    if (isEditableTarget(event.target)) {
      const combo = normalizeKey(event);
      if (!combo || !combo.includes('mod')) return false;
    }
    const combo = normalizeKey(event);
    if (!combo) return false;
    for (const action of this.actions) {
      if (this.bindingFor(action.id) !== combo) continue;
      event.preventDefault();
      event.stopPropagation();
      action.action();
      return true;
    }
    return false;
  }

  setBinding(id: string, combo: string): void {
    for (const key of Object.keys(this.bindings)) {
      if (this.bindings[key] === combo) delete this.bindings[key];
    }
    this.bindings[id] = combo;
    this.persist();
  }

  reset(): void {
    for (const key of Object.keys(this.bindings)) delete this.bindings[key];
    this.persist();
  }

  openEditor(toast: (message: string, kind?: 'info' | 'error' | 'ok') => void): void {
    const modal = openModal({ title: 'Atajos de teclado', className: 'shortcuts-modal' });
    const render = (): void => {
      modal.body.textContent = '';
      modal.body.appendChild(
        h('p', { className: 'modal-hint', text: 'Pulsa «Cambiar» y después la combinación que quieras usar. Se guarda en este navegador.' }),
      );
      const groups = new Map<string, ShortcutAction[]>();
      for (const action of this.actions) {
        const list = groups.get(action.group) ?? [];
        list.push(action);
        groups.set(action.group, list);
      }
      for (const [group, list] of groups) {
        modal.body.appendChild(h('h3', { className: 'shortcut-group', text: group }));
        const table = h('div', { className: 'shortcut-rows' });
        for (const action of list) {
          const row = h('div', { className: 'shortcut-row' });
          row.appendChild(h('span', { className: 'shortcut-label', text: action.label }));
          const kbd = h('kbd', { className: 'shortcut-kbd', text: formatCombo(this.bindingFor(action.id)) });
          const change = h('button', { className: 'btn btn-ghost btn-mini', text: 'Cambiar' });
          change.type = 'button';
          change.addEventListener('click', () => {
            change.textContent = 'Pulsa una tecla…';
            change.classList.add('capturing');
            const capture = (event: KeyboardEvent): void => {
              event.preventDefault();
              event.stopPropagation();
              if (event.key === 'Escape') {
                document.removeEventListener('keydown', capture, true);
                render();
                return;
              }
              const combo = normalizeKey(event);
              if (!combo) return;
              document.removeEventListener('keydown', capture, true);
              this.setBinding(action.id, combo);
              toast(`Atajo de «${action.label}» actualizado.`, 'ok');
              render();
            };
            document.addEventListener('keydown', capture, true);
          });
          row.append(kbd, change);
          table.appendChild(row);
        }
        modal.body.appendChild(table);
      }

      const fixed = h('div', { className: 'shortcut-fixed' });
      fixed.append(
        h('h3', { className: 'shortcut-group', text: 'Cabina (fijos)' }),
        h('p', { className: 'modal-hint', text: 'Q / P: play deck A/B · Espacio: deck activo · 1–8: hot cues · A S D F G H: sampler.' }),
      );
      modal.body.appendChild(fixed);

      const footer = h('div', { className: 'modal-actions' });
      const reset = h('button', { className: 'btn btn-ghost btn-mini', text: 'Restablecer todo' });
      reset.type = 'button';
      reset.addEventListener('click', () => {
        this.reset();
        toast('Atajos restablecidos.', 'ok');
        render();
      });
      const close = h('button', { className: 'btn btn-primary btn-mini', text: 'Listo' });
      close.type = 'button';
      close.addEventListener('click', () => modal.close());
      footer.append(reset, close);
      modal.body.appendChild(footer);
    };
    render();
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
    } catch {
      /* sin persistencia */
    }
  }

  private load(): Bindings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return {};
      const result: Bindings = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string') result[key] = value;
      }
      return result;
    } catch {
      return {};
    }
  }
}
