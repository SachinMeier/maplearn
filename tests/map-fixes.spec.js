import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const countries = JSON.parse(readFileSync(new URL('../data/countries.json', import.meta.url)));
const manifest = JSON.parse(readFileSync(new URL('../assets/maps/world.manifest.json', import.meta.url)));

test('all excluded territories retain geometry and sovereign answers work', async ({ page }) => {
  await page.goto('/#/world?microstates=0');
  await expect(page.locator('#progress')).toHaveText('0 / 202');
  for (const c of countries.filter(c => c.microstate)) {
    await expect(page.locator(`[data-territory="${c.code}"] .region-fill`)).toHaveCount(1);
    await expect(page.locator(`[data-country="${c.code}"]`)).toHaveCount(0);
  }
  for (const [territory, owner] of [['GF', 'FR'], ['GL', 'DK'], ['PR', 'US'], ['AI', 'GB'], ['MO', 'CN']]) {
    expect(await page.locator(`[data-territory="${territory}"]`).evaluate(el => el.closest('[data-country]').dataset.country)).toBe(owner);
  }
  const nativeOwners = await page.evaluate(manifest => {
    const svg = document.querySelector('#map-surface > svg');
    return ['GF', 'GL', 'PR', 'AI', 'MO'].map(code => {
      const [x, y] = manifest.countries[code].anchor;
      svg.setAttribute('viewBox', `${x - 20} ${y - 20} 40 40`);
      const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
      return document.elementFromPoint(p.x, p.y)?.closest('[data-country]')?.dataset.country;
    });
  }, manifest);
  expect(nativeOwners).toEqual(['FR', 'DK', 'US', 'GB', 'CN']);
  await page.goto('/#/south-america?microstates=0');
  await expect(page.locator('#progress')).toHaveText('0 / 12');
  await expect(page.locator('[data-territory="GF"]')).toHaveClass('context-land');
});

test('pointer and double clicks do not produce SVG focus rectangles', async ({ page }) => {
  await page.goto('/#/world?microstates=1');
  await expect(page.locator('#progress')).toHaveText('0 / 250');
  const fiji = page.locator('[data-country="FJ"]');
  await fiji.focus();
  await expect(fiji).toHaveCSS('outline-style', 'none');
  const result = await fiji.evaluate(el => {
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    const force = new MouseEvent('webkitmouseforcewillbegin', { bubbles: true, cancelable: true });
    el.dispatchEvent(force);
    return { forcePrevented: force.defaultPrevented, styles: [...el.ownerSVGElement.querySelectorAll('*')].every(n => getComputedStyle(n).outlineStyle === 'none') };
  });
  expect(result).toEqual({ forcePrevented: true, styles: true });
});
