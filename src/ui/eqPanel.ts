/**
 * Panel de EQ master de 10 bandas + normalización de sonoridad.
 * Los cambios se aplican en vivo al bus principal.
 */

import { EQ_FREQUENCIES, TARGET_LUFS } from '../audio/playbackSettings.js';
import { h, openModal } from './components.js';

export interface EqPanelOptions {
  gains: readonly number[];
  normalize: boolean;
  onGains(gains: number[]): void;
  onNormalize(enabled: boolean): void;
}

const PRESETS: { name: string; gains: number[] }[] = [
  { name: 'Plano', gains: EQ_FREQUENCIES.map(() => 0) },
  { name: 'Club', gains: [4, 3, 1.5, 0, -1, -0.5, 1, 2, 2.5, 1.5] },
  { name: 'Graves', gains: [7, 6, 4, 2, 0, -1, -1.5, -1, 0, 0] },
  { name: 'Voz', gains: [-3, -2, -1, 1, 3, 4, 3.5, 2, 0, -1] },
  { name: 'Nítido', gains: [-1, 0, 0.5, 1, 1.5, 2, 3, 4, 4.5, 3] },
];

export function openEqPanel(options: EqPanelOptions): void {
  const modal = openModal({ title: 'Ecualizador master', className: 'eq-modal' });
  const gains = [...options.gains];
  let normalize = options.normalize;

  const hint = h('p', {
    className: 'modal-hint',
    text: `10 bandas sobre el bus principal · normalización a ${TARGET_LUFS} LUFS · los cambios se guardan al instante.`,
  });

  const presetRow = h('div', { className: 'eq-presets' });
  const rows = h('div', { className: 'eq-bands' });
  const values: HTMLElement[] = [];
  const inputs: HTMLInputElement[] = [];

  const paint = (): void => {
    inputs.forEach((input, index) => {
      input.value = String(gains[index] ?? 0);
      const label = values[index];
      if (label) label.textContent = formatDb(gains[index] ?? 0);
    });
  };

  EQ_FREQUENCIES.forEach((frequency, index) => {
    const row = h('label', { className: 'eq-band' });
    row.appendChild(h('span', { className: 'eq-freq', text: frequency >= 1000 ? `${frequency / 1000}k` : String(frequency) }));
    const input = h('input', {
      className: 'eq-slider',
      attrs: { type: 'range', min: -12, max: 12, step: 0.5, value: gains[index] ?? 0, 'aria-label': `${frequency} Hz` },
    });
    input.addEventListener('input', () => {
      gains[index] = Number(input.value);
      const label = values[index];
      if (label) label.textContent = formatDb(gains[index] ?? 0);
      options.onGains([...gains]);
    });
    const value = h('span', { className: 'eq-value', text: formatDb(gains[index] ?? 0) });
    values.push(value);
    inputs.push(input);
    row.append(input, value);
    rows.appendChild(row);
  });

  for (const preset of PRESETS) {
    const button = h('button', { className: 'chip', text: preset.name });
    button.type = 'button';
    button.addEventListener('click', () => {
      preset.gains.forEach((value, index) => {
        gains[index] = value;
      });
      paint();
      options.onGains([...gains]);
    });
    presetRow.appendChild(button);
  }

  const normalizeRow = h('label', { className: 'eq-normalize' });
  const normalizeInput = h('input', { attrs: { type: 'checkbox' } });
  normalizeInput.checked = normalize;
  normalizeInput.addEventListener('change', () => {
    normalize = normalizeInput.checked;
    options.onNormalize(normalize);
  });
  normalizeRow.append(
    normalizeInput,
    h('span', {
      text: `Normalizar volumen (${TARGET_LUFS} LUFS, máx. ±12 dB)`,
    }),
  );

  const actions = h('div', { className: 'modal-actions' });
  const reset = h('button', { className: 'btn btn-ghost btn-mini', text: 'Restablecer EQ' });
  reset.type = 'button';
  reset.addEventListener('click', () => {
    gains.fill(0);
    paint();
    options.onGains([...gains]);
  });
  const close = h('button', { className: 'btn btn-primary btn-mini', text: 'Listo' });
  close.type = 'button';
  close.addEventListener('click', () => modal.close());
  actions.append(reset, close);

  modal.body.append(hint, presetRow, rows, normalizeRow, actions);
}

function formatDb(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`;
}
