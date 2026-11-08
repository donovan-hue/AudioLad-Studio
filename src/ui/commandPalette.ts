/**
 * Command palette (Ctrl/⌘ + K): acceso instantáneo a navegación, transporte,
 * importación, tema y atajos. Navegable con teclado.
 */

import { h } from './components.js';
import { icon, type IconName } from './icons.js';

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  icon: IconName;
  hint?: string;
  keywords?: string;
  run: () => void;
}

export class CommandPalette {
  private commands: PaletteCommand[] = [];
  private overlay: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private filtered: PaletteCommand[] = [];
  private activeIndex = 0;

  constructor(commands: PaletteCommand[]) {
    this.commands = commands;
  }

  get isOpen(): boolean {
    return this.overlay !== null;
  }

  setCommands(commands: PaletteCommand[]): void {
    this.commands = commands;
  }

  open(): void {
    if (this.overlay) return;
    const overlay = h('div', { className: 'palette-overlay', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paleta de comandos' } });
    const panel = h('div', { className: 'palette-panel' });
    const searchWrap = h('div', { className: 'palette-search' });
    searchWrap.innerHTML = icon('search', 20);
    const input = h('input', {
      className: 'palette-input',
      attrs: {
        type: 'text',
        placeholder: 'Buscar comandos…',
        'aria-label': 'Buscar comandos',
        autocomplete: 'off',
        spellcheck: 'false',
      },
    });
    const esc = h('kbd', { text: 'Esc' });
    searchWrap.append(input, esc);
    const listEl = h('div', { className: 'palette-list', attrs: { role: 'listbox' } });
    const foot = h('div', { className: 'palette-foot' });
    foot.innerHTML = '<span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>↵</kbd> ejecutar</span><span><kbd>Esc</kbd> cerrar</span>';
    panel.append(searchWrap, listEl, foot);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    this.overlay = overlay;
    this.listEl = listEl;

    input.addEventListener('input', () => this.render(input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.move(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.move(-1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        this.runActive();
      }
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) this.close();
    });
    overlay.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const focusables = [input, ...panel.querySelectorAll<HTMLElement>('.palette-item')];
      if (focusables.length === 0) return;
      const index = focusables.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? index - 1 : index + 1;
      event.preventDefault();
      focusables[(next + focusables.length) % focusables.length]?.focus();
    });
    document.addEventListener('keydown', this.escapeHandler, true);

    this.render('');
    input.focus();
  }

  close(): void {
    this.overlay?.remove();
    this.overlay = null;
    this.listEl = null;
    document.removeEventListener('keydown', this.escapeHandler, true);
  }

  private escapeHandler = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' || (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      this.close();
    }
  };

  private render(query: string): void {
    if (!this.listEl) return;
    const needle = query.trim().toLowerCase();
    this.filtered = this.commands.filter((command) => {
      if (!needle) return true;
      const haystack = `${command.label} ${command.group} ${command.keywords ?? ''}`.toLowerCase();
      return needle.split(/\s+/).every((part) => haystack.includes(part));
    });
    this.activeIndex = 0;
    this.listEl.textContent = '';
    if (this.filtered.length === 0) {
      this.listEl.appendChild(h('p', { className: 'palette-empty', text: 'Sin comandos que coincidan.' }));
      return;
    }
    let lastGroup = '';
    this.filtered.forEach((command, index) => {
      if (command.group !== lastGroup) {
        lastGroup = command.group;
        this.listEl!.appendChild(h('div', { className: 'palette-group', text: command.group }));
      }
      const row = h('button', {
        className: `palette-item${index === 0 ? ' active' : ''}`,
        attrs: { type: 'button', role: 'option' },
      });
      const iconWrap = h('span', { className: 'palette-icon' });
      iconWrap.innerHTML = icon(command.icon, 18);
      row.append(iconWrap, h('span', { className: 'palette-label', text: command.label }));
      if (command.hint) row.appendChild(h('kbd', { className: 'palette-hint', text: command.hint }));
      row.addEventListener('click', () => {
        this.close();
        command.run();
      });
      row.addEventListener('mousemove', () => this.setActive(index));
      this.listEl!.appendChild(row);
    });
  }

  private move(delta: number): void {
    if (this.filtered.length === 0) return;
    const next = (this.activeIndex + delta + this.filtered.length) % this.filtered.length;
    this.setActive(next);
  }

  private setActive(index: number): void {
    this.activeIndex = index;
    const rows = this.listEl?.querySelectorAll('.palette-item');
    rows?.forEach((row, i) => row.classList.toggle('active', i === index));
    (rows?.[index] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }

  private runActive(): void {
    const command = this.filtered[this.activeIndex];
    if (!command) return;
    this.close();
    command.run();
  }
}
