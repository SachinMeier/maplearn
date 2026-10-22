import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { maps } from '../maps.js';

test('all 36 regions accept zoomed and panned pointer guesses and complete a round', async ({ page, isMobile }) => {
  const manifest = JSON.parse(readFileSync(new URL('../assets/maps/indian-states.manifest.json', import.meta.url)));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/indian-states?microstates=0');
  await expect(page.locator('#progress')).toHaveText('0 / 36');
  await page.keyboard.press('Tab');
  for (let i = 0; i < 36; i++) {
    const name = await page.locator('#country-name').textContent();
    const target = page.locator('#map-surface').getByRole('button', { name, exact: true });
    const code = await target.getAttribute('data-country');
    await page.keyboard.press('Tab');
    await target.focus();
    await page.keyboard.press('+');
    const region = manifest.regions[code];
    const anchor = [...region.anchor];
    // Exercise the added circle, including its part outside the tiny land fill.
    if (region.hitArea) anchor[0] += 11;
    // Pan toward the interior of the screen: a fixed rightward pan can move a
    // western coastal anchor entirely offscreen in a narrow mobile viewport.
    const direction = await target.evaluate((el, p) => {
      const xy = new DOMPoint(...p).matrixTransform(el.ownerSVGElement.getScreenCTM());
      return xy.x < innerWidth / 2 ? 'ArrowLeft' : 'ArrowRight';
    }, anchor);
    await page.keyboard.press(direction);
    const vertical = await target.evaluate((el, p) => {
      const { y } = new DOMPoint(...p).matrixTransform(el.ownerSVGElement.getScreenCTM());
      return y < 160 ? { key: 'ArrowUp', count: Math.ceil((160 - y) / 70) }
        : { key: 'ArrowDown', count: Math.max(0, Math.ceil((y - innerHeight + 100) / 70)) };
    }, anchor);
    for (let step = 0; step < vertical.count; step++) await page.keyboard.press(vertical.key);
    const point = await target.evaluate((el, p) => {
      const xy = new DOMPoint(...p).matrixTransform(el.ownerSVGElement.getScreenCTM());
      return { x: xy.x, y: xy.y, hit: document.elementFromPoint(xy.x, xy.y)?.closest('[data-country]')?.dataset.country };
    }, anchor);
    expect(point.hit, `${code} at ${point.x},${point.y}`).toBe(code);
    if (isMobile) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await expect(target).toHaveClass(/solved/);
    await expect(page.locator('#progress')).toHaveText(`${i + 1} / 36`);
  }
  await expect(page.locator('#complete-dialog')).toBeVisible();
  await expect(page.locator('#final-correct')).toHaveText('36');
  await expect(page.locator('#final-incorrect')).toHaveText('0');
  await expect(page.locator('#final-reveals')).toHaveText('0');
  await page.locator('#retry-button').click();
  await expect(page.locator('#progress')).toHaveText('0 / 36');
});

for (const map of maps.filter(m => m.id === 'indian-states')) {
  const manifest = JSON.parse(readFileSync(new URL(`../assets/maps/${map.id}.manifest.json`, import.meta.url)));
  const total = manifest.stats.playable;
  test(`${map.name}: menu, every native target, pointer scoring, reveal, and retry`, async ({ page, isMobile }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator(`#${map.id}-button`).click();
    await expect(page.locator('#setup-dialog')).not.toBeVisible();
    await expect(page.locator('#progress')).toHaveText(`0 / ${total}`);
    await expect(page.locator('#menu-title')).toHaveText(map.name);
    await expect(page).toHaveTitle(`${map.name} · Maps`);
    expect(await page.locator('#map-surface > svg').getAttribute('data-wrap-width')).toBeNull();
    await page.keyboard.press('Tab');
    const failures = await page.evaluate(regions => {
      const bad = [];
      for (const [code, item] of Object.entries(regions)) {
        if (!item.playable) continue;
        const region = document.querySelector(`[data-country="${code}"]`);
        region.focus();
        const point = new DOMPoint(...item.anchor).matrixTransform(region.ownerSVGElement.getScreenCTM());
        const hit = document.elementFromPoint(point.x, point.y)?.closest('[data-country]');
        if (hit?.dataset.country !== code) bad.push({ code, actual: hit?.dataset.country, point: [point.x, point.y] });
        if (!region.querySelector('.region-fill').isPointInFill(new DOMPoint(...item.anchor))) bad.push({ code, outsideFill: true });
        if (getComputedStyle(region.querySelector('.region-fill')).stroke !== 'none') bad.push({ code, strokedFill: true });
      }
      return bad;
    }, manifest.regions);
    expect(failures).toEqual([]);
    const targetName = await page.locator('#country-name').textContent();
    const target = page.locator('#map-surface').getByRole('button', { name: targetName, exact: true });
    const code = await target.getAttribute('data-country');
    const wrong = page.locator(`[data-country]:not([data-country="${code}"])`).first();
    await wrong.press('Enter');
    await expect(page.locator('#menu-incorrect')).toHaveText('1');
    await target.focus();
    const point = await target.evaluate((region, anchor) => {
      const p = new DOMPoint(...anchor).matrixTransform(region.ownerSVGElement.getScreenCTM());
      return { x: p.x, y: p.y };
    }, manifest.regions[code].anchor);
    if (isMobile) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await expect(page.locator('#progress')).toHaveText(`1 / ${total}`);
    await expect(target).toHaveClass(/solved/);
    await page.locator('#country-pill').click();
    await expect(page.locator('#progress')).toHaveText(`2 / ${total}`);
    await expect(page.locator('#country-pill')).toBeEnabled();
    await page.locator('#menu-button').click();
    await expect(page.locator('#map-credit')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('#progress')).toHaveText(`0 / ${total}`);
    await expect(page.locator('#menu-incorrect')).toHaveText('0');
    expect(errors).toEqual([]);
  });
}
