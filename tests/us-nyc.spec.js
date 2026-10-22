import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { usNycMaps } from '../us-nyc-maps.js';

for (const map of usNycMaps) {
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
    const getPoint = () => target.evaluate((region, anchor) => {
      const p = new DOMPoint(...anchor).matrixTransform(region.ownerSVGElement.getScreenCTM());
      return { x: p.x, y: p.y };
    }, manifest.regions[code].anchor);
    // Center-based zoom can move edge neighborhoods outside the finite frame.
    // Zoom at the target so the subsequent native click stays on screen.
    let point = await getPoint();
    const svg = page.locator('#map-surface > svg');
    const beforeZoom = await svg.getAttribute('viewBox');
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, -160);
    await expect(svg).not.toHaveAttribute('viewBox', beforeZoom);
    point = await getPoint();
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

test('state and neighborhood switches preserve separate rosters and ignore the world microstate preference', async ({ page }) => {
  await page.goto('/#/us-states?microstates=0');
  await expect(page.locator('#progress')).toHaveText('0 / 50');
  await page.locator('#menu-button').click();
  await page.locator('#menu-dialog').getByRole('link', { name: 'Home', exact: true }).click();
  await page.locator('#nyc-manhattan-button').click();
  await expect(page.locator('#progress')).toHaveText('0 / 64');
  await expect(page.locator('[data-country="CA"]')).toHaveCount(0);
  await expect(page.locator('[data-country="noho-manhattan"]')).toHaveCount(1);
});
