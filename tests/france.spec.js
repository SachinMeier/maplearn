import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { maps } from '../maps.js';

test('Gironde water is open through the estuary and rivers do not intercept land guesses', async ({ page }) => {
  await page.goto('/#/french-departments');
  await expect(page.locator('#progress')).toHaveText('0 / 101');
  const result = await page.evaluate(() => {
    const svg = document.querySelector('#map-surface > svg');
    svg.setAttribute('viewBox', '300 550 70 100');
    const fills = [...svg.querySelectorAll('.region-fill')];
    // Independent geographic probes projected into the fixed Albers frame:
    // (-.94,45.5), (-.74,45.3), (-.7,45.15), (-.625,45.05), (-.54,44.9).
    // From the mouth upstream past the confluence to the Garonne near Bordeaux.
    const water = [[318.553,571.997], [330.385,590.748], [332.296,604.468], [336.669,613.757], [341.498,627.603]];
    const waterHits = water.map(p => fills.some(f => f.isPointInFill(new DOMPoint(...p))));
    const banks = [[329.318,599.784], [334.766,606.4]].map(p =>
      fills.find(f => f.isPointInFill(new DOMPoint(...p)))?.closest('[data-country]').dataset.country);
    // Test an actual rendered river point in the interior of a department.
    svg.setAttribute('viewBox', '0 0 1100 1020');
    const river = svg.querySelector('[data-river="Marne"]');
    const p = river.getPointAtLength(river.getTotalLength() * .4);
    const expected = fills.find(f => f.isPointInFill(p))?.closest('[data-country]').dataset.country;
    const screen = p.matrixTransform(svg.getScreenCTM());
    const actual = document.elementFromPoint(screen.x, screen.y)?.closest('[data-country]')?.dataset.country;
    return { waterHits, banks, expected, actual, pointerEvents: getComputedStyle(river).pointerEvents };
  });
  expect(result.waterHits).toEqual([false, false, false, false, false]);
  expect(result.banks).toEqual(['33', '33']);
  expect(result.expected).toBeTruthy();
  expect(result.actual).toBe(result.expected);
  expect(result.pointerEvents).toBe('none');
});

for (const map of maps.filter(m => m.id === 'french-departments')) {
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

test('all five overseas insets accept zoomed pointer guesses and finish a round', async ({ page, isMobile }) => {
  const roster = JSON.parse(readFileSync(new URL('../assets/maps/french-departments.countries.json', import.meta.url))).filter(r => r.code.length === 3);
  const manifest = JSON.parse(readFileSync(new URL('../assets/maps/french-departments.manifest.json', import.meta.url)));
  await page.route('**/french-departments.countries.json', route => route.fulfill({ json: roster }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/french-departments?microstates=0');
  await expect(page.locator('#progress')).toHaveText('0 / 5');
  await expect(page.locator('#map-surface text')).toHaveCount(0);
  await page.keyboard.press('Tab');
  for (let i = 0; i < 5; i++) {
    const name = await page.locator('#country-name').textContent();
    const target = page.locator('#map-surface').getByRole('button', { name, exact: true });
    const code = await target.getAttribute('data-country');
    await page.keyboard.press('Tab');
    await target.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    const p = await target.evaluate((region, anchor) => {
      const point = new DOMPoint(...anchor).matrixTransform(region.ownerSVGElement.getScreenCTM());
      return { x: point.x, y: point.y };
    }, manifest.regions[code].anchor);
    if (isMobile) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
    await expect(target).toHaveClass(/solved/);
  }
  await expect(page.locator('#complete-dialog')).toBeVisible();
  await expect(page.locator('#final-correct')).toHaveText('5');
});
