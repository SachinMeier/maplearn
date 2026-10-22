import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { maps } from '../maps.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url)));
const areaMaps = maps.filter(map => !map.solvedTownLabels);
for (const map of areaMaps) {
  const roster = read(map.countries);
  test(`${map.name}: only completed answers get stable fitted titles, including reveal all and retry`, async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/#/${map.id}?microstates=1`);
    await expect(page.locator('#progress')).toHaveText(`0 / ${roster.length}`);
    await expect(page.locator('[data-title-for]')).toHaveCount(0);
    const name = await page.locator('#country-name').textContent();
    const target = page.locator('#map-surface').getByRole('button', { name, exact: true });
    const code = await target.getAttribute('data-country');
    await page.locator(`[data-country]:not([data-country="${code}"])`).first().press('Enter');
    await expect(page.locator('[data-title-for]')).toHaveCount(0);
    await target.press('Enter');
    await expect(page.locator('[data-title-for]')).toHaveCount(1);
    await expect(page.locator(`[data-title-for="${code}"] text`)).toHaveAttribute('aria-label', name);
    await target.press('Enter');
    await expect(page.locator('#menu-incorrect')).toHaveText('1');
    const revealName = await page.locator('#country-name').textContent();
    await page.locator('#country-pill').click();
    await expect(page.locator('[data-title-for]')).toHaveCount(2);
    expect(await page.locator('.region-title').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')))).toContain(revealName);
    await expect(page.locator('#country-pill')).toBeEnabled();
    await page.locator('#menu-button').click(); await page.locator('#menu-reveal-all').click();
    await expect(page.locator('#complete-dialog')).toBeVisible();
    await expect(page.locator('[data-title-for]')).toHaveCount(roster.length);
    expect(await page.locator('.region-title').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')).sort()))
      .toEqual(roster.map(r => r.name).sort());
    await page.locator('#complete-close').click();
    const violations = await page.evaluate(() => {
      window.auditTitles = () => {
        const bad = [], root = document.querySelector('#map-surface > svg');
        for (const label of document.querySelectorAll('[data-title-for]')) {
          // At subpixel sizes Chrome rounds invisible glyph metrics to a whole
          // screen pixel. Audit ink when it is actually shown, including after zoom.
          if (label.dataset.placement === 'callout' || getComputedStyle(label).visibility === 'hidden' || +label.style.opacity === 0) continue;
          const path = root.querySelector(`[data-country="${label.dataset.titleFor}"] path.region-fill`);
          for (const span of label.querySelectorAll('tspan')) {
            const b = span.getBBox(), matrix = root.getScreenCTM().inverse().multiply(span.getScreenCTM());
            for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) {
              const p = new DOMPoint(b.x + b.width * i / 2, b.y + b.height * j / 2).matrixTransform(matrix);
              if (!path.isPointInFill(p)) bad.push(label.dataset.titleFor);
            }
          }
        }
        return [...new Set(bad)];
      };
      window.titleSnapshot = [...document.querySelectorAll('[data-title-for]')].map(node => ({ node, html: node.innerHTML, box: node.dataset.labelBox }));
      return window.auditTitles();
    });
    expect(violations).toEqual([]);
    await page.locator('#map-surface > svg').press('+');
    await page.locator('#map-surface > svg').press('+');
    expect(await page.evaluate(() => window.auditTitles())).toEqual([]);
    expect(await page.evaluate(() => window.titleSnapshot.every(p => p.node.isConnected && p.node.innerHTML === p.html && p.node.dataset.labelBox === p.box))).toBe(true);
    await expect(page.locator('.region-titles rect, .region-titles path')).toHaveCount(0);
    await page.locator('#menu-button').click(); await page.reload();
    await expect(page.locator('#progress')).toHaveText(`0 / ${roster.length}`);
    await expect(page.locator('[data-title-for]')).toHaveCount(0);
    await expect(page.locator('.map-title-callout')).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test('small completed titles use one hover/tap callout, never disclose unchecked names, and become inline on zoom', async ({ page, isMobile }) => {
  const manifest = read('assets/maps/french-departments.manifest.json');
  // Keep Paris first in this deterministic two-department game.
  await page.addInitScript(() => { Math.random = () => .999; });
  await page.route('**/french-departments.countries.json', route => route.fulfill({ json: [
    { code: '75', name: 'Paris', microstate: false }, { code: '33', name: 'Gironde', microstate: false },
  ] }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/french-departments');
  await expect(page.locator('#progress')).toHaveText('0 / 2');
  const paris = page.locator('[data-country="75"]');
  const point = await paris.evaluate((el, anchor) => {
    const p = new DOMPoint(...anchor).matrixTransform(el.ownerSVGElement.getScreenCTM()); return { x: p.x, y: p.y };
  }, manifest.regions['75'].anchor);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator('.map-title-callout')).toBeHidden();
  // Correct click checks Paris but leaves the map at overview scale.
  if (isMobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  await expect(page.locator('#progress')).toHaveText('1 / 2');
  // Inspect the now-completed shape without adding a mistake.
  if (isMobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.move(point.x + .1, point.y);
  await expect(page.locator('.map-title-callout')).toBeVisible();
  await expect(page.locator('.map-title-name')).toHaveText('Paris');
  await expect(page.locator('[data-title-for="75"]')).toBeHidden();
  await expect(page.locator('#menu-incorrect')).toHaveText('0');
  await expect(page.locator('[data-title-for="33"]')).toHaveCount(0);
  await paris.focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('+');
  await expect(page.locator('[data-title-for="75"]')).toBeVisible();
  await expect(page.locator('.map-title-callout')).toBeHidden();
});

test('wrapped copies reference the live solved-title layer and filtering omits excluded names', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/world?microstates=0');
  await expect(page.locator('#progress')).toHaveText('0 / 202');
  await page.locator('#menu-button').click(); await page.locator('#menu-reveal-all').click();
  await expect(page.locator('#complete-dialog')).toBeVisible();
  const id = await page.locator('.region-titles').getAttribute('id');
  for (const offset of [-1, 1]) await expect(page.locator(`[data-wrap-offset="${offset}"] use[href="#${id}"]`)).toHaveCount(1);
  await expect(page.locator('[data-title-for="AI"]')).toHaveCount(0);
  await expect(page.locator('[data-title-for="VA"]')).toHaveCount(1);
});
