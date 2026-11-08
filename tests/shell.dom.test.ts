// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';

const tick = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const sideLink = (label: string): HTMLButtonElement => {
  const button = [...document.querySelectorAll<HTMLButtonElement>('.side-link, .side-playlist')].find((node) =>
    (node.textContent ?? '').includes(label),
  );
  if (!button) throw new Error(`No side link: ${label}`);
  return button;
};
const activePage = (): string | undefined =>
  [...document.querySelectorAll<HTMLElement>('.app-page')].find((page) => !page.hidden)?.dataset.page;

beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  window.requestAnimationFrame = () => 0;
  window.scrollTo = () => undefined;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await import('../src/main.js');
  await tick(80);
});

describe('shell', () => {
  it('boots', () => {
    expect(document.querySelector('.app-shell')).toBeTruthy();
    expect(document.querySelectorAll('.sidebar .side-link').length).toBeGreaterThan(5);
    expect(document.querySelector('.now-playing .np-inner')).toBeTruthy();
    expect(activePage()).toBe('home');
  });

  it('navigates between pages', async () => {
    sideLink('Tu biblioteca').click();
    await tick();
    expect(activePage()).toBe('library');
    expect((document.querySelector('.side-link.active')?.textContent ?? '')).toContain('Tu biblioteca');

    sideLink('Buscar').click();
    await tick();
    expect(activePage()).toBe('search');
    expect(document.activeElement?.classList.contains('search-input')).toBe(true);

    sideLink('Cabina DJ').click();
    await tick();
    expect(activePage()).toBe('cabina');

    sideLink('Configuración').click();
    await tick();
    expect(activePage()).toBe('tool');
    expect(document.querySelector('.settings-view')?.hasAttribute('hidden')).toBe(false);
  });

  it('opens the command palette', async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    await tick(0);
    const overlay = document.querySelector('.palette-overlay');
    expect(overlay).toBeTruthy();
    const input = document.querySelector<HTMLInputElement>('.palette-input')!;
    input.value = 'config';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelectorAll('.palette-item').length).toBeGreaterThan(0);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(0);
    expect(document.querySelector('.palette-overlay')).toBeNull();
  });

  it('opens and closes the queue drawer', async () => {
    sideLink('Cola').click();
    await tick();
    expect(document.querySelector('.queue-drawer')?.classList.contains('open')).toBe(true);
    (document.querySelector('.queue-close') as HTMLButtonElement).click();
    await tick();
    expect(document.querySelector('.queue-drawer')?.classList.contains('open')).toBe(false);
    expect(activePage()).toBe('home');
  });

  it('opens notifications and shortcuts', async () => {
    (document.querySelector('.notification-btn') as HTMLButtonElement).click();
    await tick(0);
    expect(document.querySelector('.notification-panel')?.hasAttribute('hidden')).toBe(false);
    (document.querySelector('.notification-panel .btn[aria-label="Cerrar notificaciones"]') as HTMLButtonElement).click();
    await tick(0);
    expect(document.querySelector('.notification-panel')?.hasAttribute('hidden')).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', code: 'Slash', ctrlKey: true, shiftKey: true, bubbles: true }));
    await tick(0);
    expect(document.querySelector('.shortcuts-modal')).toBeTruthy();
    (document.querySelector('.shortcuts-modal .modal-head .btn') as HTMLButtonElement).click();
    await tick(0);
    expect(document.querySelector('.shortcuts-modal')).toBeNull();
  });


  it('expone los controles de reproducción global', async () => {
    const shuffle = document.querySelector<HTMLButtonElement>('.np-mode[aria-label*="aleatorio"]');
    expect(shuffle).toBeTruthy();
    shuffle!.click();
    await tick(0);
    expect(JSON.parse(localStorage.getItem('audiolad.playback.v1') ?? '{}').shuffle).toBe(true);
    shuffle!.click();

    const repeat = document.querySelector<HTMLButtonElement>('.np-mode[aria-label="Repetir"]');
    expect(repeat).toBeTruthy();
    repeat!.click();
    await tick(0);
    expect(JSON.parse(localStorage.getItem('audiolad.playback.v1') ?? '{}').repeat).toBe('all');

    const speed = document.querySelector<HTMLSelectElement>('.np-speed');
    expect(speed).toBeTruthy();
    speed!.value = '1.5';
    speed!.dispatchEvent(new Event('change', { bubbles: true }));

    const extras = [...document.querySelectorAll<HTMLButtonElement>('.np-extra')];
    expect(extras.length).toBe(2);
    extras[0]!.click();
    await tick(0);
    expect(document.querySelector('.eq-modal')).toBeTruthy();
    (document.querySelector('.eq-modal .modal-head .btn') as HTMLButtonElement).click();
    await tick(0);
    expect(document.querySelector('.eq-modal')).toBeNull();

    extras[1]!.click();
    await tick(0);
    expect(document.querySelector('.sleep-modal')).toBeTruthy();
    (document.querySelector('.sleep-modal .modal-head .btn') as HTMLButtonElement).click();
    await tick(0);
    expect(document.querySelector('.sleep-modal')).toBeNull();
  });

  it('muestra los ajustes de crossfade y normalización', async () => {
    sideLink('Configuración').click();
    await tick();
    const crossfade = document.querySelector<HTMLInputElement>('.settings-crossfade');
    const normalize = document.querySelector<HTMLInputElement>('.settings-normalize');
    expect(crossfade).toBeTruthy();
    expect(normalize).toBeTruthy();
    crossfade!.value = '4';
    crossfade!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelector('.crossfade-val')?.textContent).toBe('4 s');
    normalize!.checked = false;
    normalize!.dispatchEvent(new Event('change', { bubbles: true }));
  });
  it('toggles theme and follows deep links', async () => {
    const before = document.documentElement.dataset.theme;
    (document.querySelector('.theme-toggle') as HTMLButtonElement).click();
    expect(document.documentElement.dataset.theme).not.toBe(before);

    window.location.hash = '#/album/Album%20inexistente';
    await tick(60);
    expect(activePage()).toBe('collection');
    expect(document.querySelector('.collection-view .empty-state')).toBeTruthy();

    window.location.hash = '#/playlist/nope';
    await tick(60);
    expect(activePage()).toBe('library');

    window.location.hash = '#/herramientas/sampler';
    await tick(60);
    expect(activePage()).toBe('tool');
    expect(document.querySelector('.sampler-view')?.hasAttribute('hidden')).toBe(false);
  });
});
