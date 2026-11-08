// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';

beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  window.requestAnimationFrame = () => 0;
  window.scrollTo = () => undefined;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await import('../src/main.js');
  await new Promise((resolve) => setTimeout(resolve, 100));
});

describe('accesibilidad', () => {
  it('no tiene violaciones serious/critical en la vista inicial', async () => {
    const results = await axe.run(document.body, {
      rules: {
        'color-contrast': { enabled: false },
        'landmark-one-main': { enabled: false },
      },
    });
    const severe = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    for (const violation of severe) {
      for (const node of violation.nodes) {
        console.log(violation.id, node.target, node.html);
      }
    }
    expect(severe.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
