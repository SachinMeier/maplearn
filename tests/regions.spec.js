import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { maps } from '../maps.js';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url)));
const continentMaps = maps.filter(m => m.id !== 'world' && m.microstates !== false);
const manifests = Object.fromEntries(continentMaps.map(m => [m.id, read(`assets/maps/${m.id}.manifest.json`)]));

for (const map of continentMaps) test(`${map.name}: home option, every native hit target, filtering, reveal, and retry`, async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: map.name, exact: true }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  const manifest = manifests[map.id], total = Object.keys(manifest.countries).length;
  await expect(page.locator('#progress')).toHaveText(`0 / ${total}`);
  await expect(page).toHaveTitle(`${map.name} · Maps`);
  await expect(page.locator('[data-wrap-offset], [data-world-base]')).toHaveCount(0);
  await expect(page.locator('#load-error')).toBeHidden();
  // Native screen-space hit testing after camera focus catches projection,
  // date-line translation, cropped reveal boxes, and small-island errors.
  await page.keyboard.press('Tab');
  const failures = await page.evaluate(manifest => {
    const failures = [];
    for (const [code, c] of Object.entries(manifest.countries)) {
      const region = document.querySelector(`[data-country="${code}"]`);
      region.focus();
      const screen = new DOMPoint(...c.anchor).matrixTransform(region.ownerSVGElement.getScreenCTM());
      const actual = document.elementFromPoint(screen.x, screen.y)?.closest('[data-country]')?.dataset.country;
      if (actual !== code) failures.push({ code, actual, x: screen.x, y: screen.y });
    }
    return failures;
  }, manifest);
  expect(failures).toEqual([]);
  // Click the actual target at its geographic anchor after zooming and dragging.
  const name = await page.locator('#country-name').textContent();
  const current = Object.values(manifest.countries).find(c => c.name === name);
  await page.locator(`[data-country="${current.code}"]`).focus();
  const getPoint = () => page.locator(`[data-country="${current.code}"]`).evaluate((region, anchor) => {
    const p = new DOMPoint(...anchor).matrixTransform(region.ownerSVGElement.getScreenCTM());
    return { x: p.x, y: p.y };
  }, current.anchor);
  let point = await getPoint();
  // Zoom around the target: a center-based keyboard zoom can legitimately move
  // an edge country offscreen when a finite camera cannot center that country.
  const beforeZoom = await page.locator('#map-surface > svg').getAttribute('viewBox');
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, -160);
  await expect(page.locator('#map-surface > svg')).not.toHaveAttribute('viewBox', beforeZoom);
  point = await getPoint();
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 20, point.y + 20, { steps: 3 }); await page.mouse.up();
  await expect(page.locator('#progress')).toHaveText(`0 / ${total}`);
  point = await getPoint();
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#progress')).toHaveText(`1 / ${total}`);
  await page.locator('#country-pill').click();
  await expect(page.locator('#progress')).toHaveText(`2 / ${total}`);
  await expect(page.locator('#country-pill')).toBeEnabled();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.locator('#menu-title')).toHaveText(map.name);
  await page.reload();
  await expect(page.locator('#progress')).toHaveText(`0 / ${total}`);
  await page.goto(`/#/${map.id}?microstates=0`);
  const filtered = Object.values(manifest.countries).filter(c => !c.microstate);
  await expect(page.locator('#progress')).toHaveText(`0 / ${filtered.length}`);
  await expect(page.locator('[data-country]')).toHaveCount(filtered.length);
  expect(errors).toEqual([]);
});

test('touch pinch and single-finger pan stay within the regional frame without guessing', async ({ page, context, isMobile }) => {
  test.skip(!isMobile, 'Touch interaction');
  await page.goto('/#/oceania?microstates=1');
  await expect(page.locator('#progress')).toHaveText('0 / 28');
  const session = await context.newCDPSession(page);
  const send = (type, touchPoints) => session.send('Input.dispatchTouchEvent', { type, touchPoints });
  const svg = page.locator('#map-surface > svg');
  const initial = await svg.getAttribute('viewBox');
  await send('touchStart', [{ x: 150, y: 300, id: 1 }, { x: 240, y: 400, id: 2 }]);
  await send('touchMove', [{ x: 60, y: 200, id: 1 }, { x: 330, y: 500, id: 2 }]);
  await send('touchEnd', []);
  await expect(svg).not.toHaveAttribute('viewBox', initial);
  for (let i = 0; i < 6; i++) {
    await send('touchStart', [{ x: 300, y: 500, id: 1 }]);
    await send('touchMove', [{ x: 50, y: 200, id: 1 }]);
    await send('touchEnd', []);
  }
  const actual = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  const [x, y, width, height] = manifests.oceania.viewBox;
  expect(actual[0]).toBeGreaterThanOrEqual(x - .001);
  expect(actual[0] + actual[2]).toBeLessThanOrEqual(x + width + .001);
  // A tall phone can still fit the whole map vertically after this pinch.
  if (actual[3] < height) {
    expect(actual[1]).toBeGreaterThanOrEqual(y - .001);
    expect(actual[1] + actual[3]).toBeLessThanOrEqual(y + height + .001);
  } else expect(actual[1] + actual[3] / 2).toBeCloseTo(y + height / 2, 2);
  await expect(page.locator('#progress')).toHaveText('0 / 28');
  await expect(page.locator('#menu-incorrect')).toHaveText('0');
});

test('finite maps stop at every edge, reverse drags immediately, and center when fully visible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/oceania?microstates=1');
  await expect(page.locator('#progress')).toHaveText('0 / 28');
  const svg = page.locator('#map-surface > svg');
  const view = () => svg.evaluate(el => {
    const b = el.viewBox.baseVal; return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
  const initial = await view();
  for (const key of ['a', 'd', 'w', 's']) {
    await page.keyboard.press(key);
    expect(await view()).toEqual(initial);
  }
  await svg.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('+');
  const [x, y, width, height] = manifests.oceania.viewBox;
  for (const [key, axis, edge] of [['a', 'x', x], ['d', 'x', x + width], ['w', 'y', y], ['s', 'y', y + height]]) {
    await svg.evaluate((el, key) => {
      for (let i = 0; i < 150; i++) el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }, key);
    const b = await view();
    expect(key === 'd' ? b.x + b.width : key === 's' ? b.y + b.height : b[axis]).toBeCloseTo(edge, 2);
  }
  const size = page.viewportSize();
  await page.mouse.move(size.width / 2, size.height / 2); await page.mouse.down();
  await page.mouse.move(size.width / 2 - 100, size.height / 2 - 100, { steps: 3 });
  const clamped = await view();
  await page.mouse.move(size.width / 2 - 80, size.height / 2 - 80);
  const reversed = await view();
  expect(reversed.x).toBeLessThan(clamped.x);
  expect(reversed.y).toBeLessThan(clamped.y);
  await page.mouse.up();
  await page.keyboard.press('0');
  expect(await view()).toEqual(initial);
  await page.setViewportSize({ width: 1800, height: 500 });
  await expect.poll(async () => (await view()).width).not.toBe(initial.width);
  const resized = await view();
  expect(resized.x + resized.width / 2).toBeCloseTo(x + width / 2, 2);
  expect(resized.y + resized.height / 2).toBeCloseTo(y + height / 2, 2);
});

test('regional completion retries the same map, and switching maps keeps separate rosters', async ({ page }) => {
  await page.route('**/assets/maps/oceania.countries.json', async route => {
    const response = await route.fetch();
    await route.fulfill({ json: (await response.json()).filter(c => ['PF', 'PN'].includes(c.code)) });
  });
  await page.goto('/#/oceania?microstates=1');
  await expect(page.locator('#progress')).toHaveText('0 / 2');
  for (let i = 0; i < 2; i++) {
    const name = await page.locator('#country-name').textContent();
    await page.getByRole('button', { name, exact: true }).press('Enter');
  }
  await expect(page.locator('#complete-dialog')).toBeVisible();
  await expect(page.locator('#final-correct')).toHaveText('2');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('#progress')).toHaveText('0 / 2');
  await page.evaluate(() => { location.hash = '/europe?microstates=0'; });
  await expect(page).toHaveTitle('Europe · Maps');
  await expect(page.locator('[data-country="PN"]')).toHaveCount(0);
  await expect(page.locator('[data-country="VA"]')).toHaveCount(1);
  await page.evaluate(() => { location.hash = '/oceania?microstates=1'; });
  await expect(page.locator('#progress')).toHaveText('0 / 2');
});
