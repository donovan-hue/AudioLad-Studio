/**
 * Letras LRC con vista sincronizada. Acepta timestamps [mm:ss.xx] y texto plano.
 */

import { h, openModal } from './components.js';

export interface LyricLine {
  time: number | null;
  text: string;
}

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

export function parseLyrics(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const times: number[] = [];
    let match: RegExpExecArray | null;
    TIME_TAG.lastIndex = 0;
    while ((match = TIME_TAG.exec(rawLine)) !== null) {
      const minutes = Number(match[1] ?? 0);
      const seconds = Number(match[2] ?? 0);
      const fraction = match[3] ? Number(`0.${match[3].padEnd(2, '0').slice(0, 2)}`) : 0;
      times.push(minutes * 60 + seconds + fraction);
    }
    const text = rawLine.replace(TIME_TAG, '').trim();
    if (!text) continue;
    // Líneas de metadatos LRC ([ar:], [ti:], [offset:]…) no son letra.
    if (times.length === 0 && /^\[[a-z]+:[^\]]*\]$/i.test(text)) continue;
    if (times.length === 0) lines.push({ time: null, text });
    else for (const time of times) lines.push({ time, text });
  }
  return lines.sort((a, b) => (a.time ?? Number.POSITIVE_INFINITY) - (b.time ?? Number.POSITIVE_INFINITY));
}

export function openLyricsPanel(raw: string, title: string, getPosition: () => number): void {
  const lines = parseLyrics(raw);
  const synced = lines.some((line) => line.time !== null);
  let timer = 0;
  const modal = openModal({ title: `Letra · ${title}`, className: 'lyrics-modal', onClose: () => window.clearInterval(timer) });
  const list = h('div', { className: 'lyrics-lines', attrs: { role: 'list' } });
  const nodes: HTMLElement[] = [];
  for (const line of lines) {
    const row = h('p', { className: 'lyrics-line', text: line.text });
    row.setAttribute('role', 'listitem');
    list.appendChild(row);
    nodes.push(row);
  }
  if (lines.length === 0) list.appendChild(h('p', { className: 'lyrics-empty', text: 'Esta pista no tiene letra guardada.' }));
  modal.body.appendChild(
    h('p', {
      className: 'modal-hint',
      text: synced ? 'Sincronizada con la reproducción (LRC).' : 'Texto plano (sin marcas de tiempo).',
    }),
  );
  modal.body.appendChild(list);
  if (synced) {
    let active = -1;
    timer = window.setInterval(() => {
      const position = getPosition();
      let next = -1;
      for (let i = 0; i < lines.length; i += 1) {
        if ((lines[i]?.time ?? Number.POSITIVE_INFINITY) <= position) next = i;
      }
      if (next === active) return;
      nodes[active]?.classList.remove('active');
      active = next;
      const node = nodes[active];
      if (node) {
        node.classList.add('active');
        node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 200);
    window.setTimeout(() => {
      const first = nodes.find((node) => node.getBoundingClientRect().top >= 0);
      first?.scrollIntoView({ block: 'center' });
    }, 50);
  }
}
