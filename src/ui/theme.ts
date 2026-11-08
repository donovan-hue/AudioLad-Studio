/** Tema claro/oscuro reales: dos sistemas visuales completos sobre CSS vars. */
import { icon } from './icons.js';
export type Theme = 'dark' | 'light';

const KEY = 'musical-system.theme';

export function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* sin localStorage: tema por defecto */
  }
  return 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* persistencia no disponible */
  }
}

export function installThemeToggle(button: HTMLButtonElement, toast: (msg: string) => void): void {
  let theme = loadTheme();
  applyTheme(theme);
  const paint = (): void => {
    button.innerHTML = `${icon(theme === 'dark' ? 'sun' : 'moon', 18)}<span>${theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>`;
    button.setAttribute('aria-label', 'Cambiar entre modo claro y oscuro');
  };
  paint();
  button.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme);
    paint();
    toast(`Modo ${theme === 'dark' ? 'oscuro' : 'claro'} activado.`);
  });
}
