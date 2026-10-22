import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const mapManifest = JSON.parse(readFileSync(new URL('../assets/maps/world.manifest.json', import.meta.url)));

// A multipart country's bounding-box center may be in the ocean. Use a checked
// interior point and the SVG's real screen transform for mouse and touch tests.
async function hitPoint(region) {
  const code = await region.getAttribute('data-country');
  return region.evaluate((el, anchor) => {
    const svg = el.ownerSVGElement, box = svg.viewBox.baseVal, width = Number(svg.dataset.wrapWidth);
    const x = anchor[0] + (width ? Math.round((box.x + box.width / 2 - anchor[0]) / width) * width : 0);
    const p = new DOMPoint(x, anchor[1]).matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y };
  }, mapManifest.countries[code].anchor);
}
async function clickRegion(page, region) {
  const p = await hitPoint(region); await page.mouse.click(p.x, p.y);
}

async function start(page, microstates = false) {
  await page.goto('/');
  await page.getByRole('button', { name: 'World', exact: true }).click();
  await page.getByRole('button', { name: microstates ? 'Yes' : 'No', exact: true }).click();
  await expect(page.locator('#progress')).toHaveText(`0 / ${microstates ? 250 : 202}`);
  await expect(page.locator('#map-surface title, #map-surface [title]')).toHaveCount(0);
}
async function target(page) {
  const name = await page.locator('#country-name').textContent();
  return page.locator('#map-surface').getByRole('button', { name, exact: true });
}

test('home, microstate preference, guess scoring, reveal, menu, and retry', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await expect(page.locator('[data-country="AI"]')).toHaveCount(0);
  await expect(page.locator('[data-country="VA"]')).toHaveCount(1);
  const correct = await target(page);
  const code = await correct.getAttribute('data-country');
  const wrong = page.locator(`[data-country]:not([data-country="${code}"])`).first();
  await wrong.press('Enter'); await wrong.press('Enter'); await wrong.press('Enter');
  await expect(page.locator('#toast')).toHaveText('Incorrect');
  await expect(page.locator('#menu-incorrect')).toHaveText('3');
  await correct.press('Enter');
  await expect(page.locator('#progress')).toHaveText('1 / 202');
  await expect(correct).toHaveClass(/solved/);
  await expect(page.locator('#toast')).toHaveText('Correct');
  await page.locator('#country-pill').click();
  await expect(page.locator('#progress')).toHaveText('2 / 202');
  await expect(page.locator('#country-pill')).toBeEnabled();
  await expect(page.locator('#menu-reveals')).toHaveText('1');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.locator('#menu-dialog').getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
  await expect(page.locator('#menu-dialog').getByRole('button', { name: 'Reset Zoom', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#progress')).toHaveText('0 / 202');
  await expect(page.locator('#menu-incorrect')).toHaveText('0');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.getByRole('link', { name: /GeoLearn/ })).toHaveAttribute('target', '_blank');
  expect(errors).toEqual([]);
});

test('pointer hit testing after zoom and drag; dragging does not guess', async ({ page }) => {
  await start(page, true);
  const correct = await target(page);
  await page.keyboard.press('Tab');
  await correct.focus(); // Keyboard focus brings a region into view.
  await page.waitForTimeout(400);
  await page.keyboard.press('+');
  const initial = await page.locator('#map-surface > svg').getAttribute('viewBox');
  const { x, y } = await hitPoint(correct);
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 40, y + 30, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('#progress')).toHaveText('0 / 250');
  await expect(page.locator('#menu-incorrect')).toHaveText('0');
  expect(await page.locator('#map-surface > svg').getAttribute('viewBox')).not.toBe(initial);
  await clickRegion(page, correct);
  await expect(page.locator('#progress')).toHaveText('1 / 250');
  await page.locator('#map-surface > svg').press('0');
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 600, height: 800 });
  await page.keyboard.press('Tab');
  const next = await target(page); await next.focus(); await page.waitForTimeout(400);
  await clickRegion(page, next);
  await expect(page.locator('#progress')).toHaveText('2 / 250');
});

test('completion totals and retry with a small test map', async ({ page }) => {
  await page.route('**/data/countries.json', async route => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ json: data.filter(country => ['AD', 'AE', 'AF'].includes(country.code)) });
  });
  await page.goto('/#/world');
  await expect(page.locator('#progress')).toHaveText('0 / 3');
  await (await target(page)).press('Enter');
  await page.locator('#country-pill').click();
  await expect(page.locator('#country-pill')).toBeEnabled();
  await (await target(page)).press('Enter');
  await expect(page.getByRole('heading', { name: 'Congratulations' })).toBeVisible();
  await expect(page.locator('#final-correct')).toHaveText('2');
  await expect(page.locator('#final-incorrect')).toHaveText('0');
  await expect(page.locator('#final-reveals')).toHaveText('1');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('#progress')).toHaveText('0 / 3');
  await expect(page.locator('#complete-dialog')).not.toBeVisible();
});

test('touch pinch and canceled touch never submit guesses', async ({ page, context, isMobile }) => {
  test.skip(!isMobile, 'Touch interaction');
  await start(page, true);
  const session = await context.newCDPSession(page);
  const send = (type, points) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const before = await page.locator('#map-surface > svg').getAttribute('viewBox');
  await send('touchStart', [{ x: 150, y: 360, id: 1 }, { x: 240, y: 440, id: 2 }]);
  await send('touchMove', [{ x: 90, y: 300, id: 1 }, { x: 300, y: 500, id: 2 }]);
  await send('touchEnd', []);
  await expect(page.locator('#progress')).toHaveText('0 / 250');
  await expect(page.locator('#menu-incorrect')).toHaveText('0');
  expect(await page.locator('#map-surface > svg').getAttribute('viewBox')).not.toBe(before);
  // Switch back to keyboard modality so focus intentionally centers the target.
  await page.keyboard.press('Tab');
  const correct = await target(page); await correct.focus(); await page.waitForTimeout(400);
  const point = { ...await hitPoint(correct), id: 1 };
  await send('touchStart', [point]); await send('touchCancel', []);
  await expect(page.locator('#progress')).toHaveText('0 / 250');
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('#progress')).toHaveText('1 / 250');
});

test('reveal all preserves scores and completion can close for map exploration', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/data/countries.json', async route => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ json: data.filter(country => ['AD', 'AE', 'AF', 'AL'].includes(country.code)) });
  });
  await page.goto('/#/world');
  await expect(page.locator('#progress')).toHaveText('0 / 4');
  const correct = await target(page);
  const code = await correct.getAttribute('data-country');
  await page.locator(`[data-country]:not([data-country="${code}"])`).first().press('Enter');
  await correct.press('Enter');
  // Revisiting a checked region is label exploration, not another guess.
  await correct.press('Enter');
  await page.locator('#country-pill').click();
  await expect(page.locator('#country-pill')).toBeEnabled();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Reveal all', exact: true }).click();
  await expect(page.locator('#complete-dialog')).toBeVisible();
  await expect(page.locator('#progress')).toHaveText('4 / 4');
  await expect(page.locator('#final-correct')).toHaveText('1');
  await expect(page.locator('#final-incorrect')).toHaveText('1');
  await expect(page.locator('#final-reveals')).toHaveText('3');
  await expect(page.locator('[data-country].solved')).toHaveCount(4);
  await expect(page.locator('[data-country].revealed')).toHaveCount(3);
  await page.getByRole('button', { name: 'Close completion' }).click();
  await expect(page.locator('#complete-dialog')).not.toBeVisible();
  await expect(page.locator('#menu-button')).toBeFocused();
  const svg = page.locator('#map-surface > svg');
  const before = await svg.getAttribute('viewBox');
  await svg.press('+');
  await expect(svg).not.toHaveAttribute('viewBox', before);
  await correct.press('Enter');
  await expect(page.locator('#complete-dialog')).not.toBeVisible();
  await expect(page.locator('#menu-incorrect')).toHaveText('1');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.locator('#menu-reveal-all')).toBeDisabled();
  await page.reload();
  await expect(page.locator('#progress')).toHaveText('0 / 4');
  await expect(page.locator('#menu-reveals')).toHaveText('0');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Reveal all', exact: true }).click();
  await expect(page.locator('#complete-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#complete-dialog')).not.toBeVisible();
  await expect(page.locator('#progress')).toHaveText('4 / 4');
});

test('load failure offers retry and home', async ({ page }) => {
  await page.route('**/assets/maps/world.svg', route => route.fulfill({ status: 503, body: '' }));
  await page.goto('/#/world');
  await expect(page.locator('#load-error')).toBeVisible();
  await page.unroute('**/assets/maps/world.svg');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#progress')).toHaveText('0 / 250');
});

test('all real country targets align with native hit testing and filtered coastlines disappear', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/world?microstates=1');
  await expect(page.locator('#progress')).toHaveText('0 / 250');
  const failures = await page.evaluate(manifest => {
    const bad = [];
    for (const [code, country] of Object.entries(manifest.countries)) {
      const region = document.querySelector(`[data-country="${code}"]`);
      region.focus();
      const svg = region.ownerSVGElement, box = svg.viewBox.baseVal, width = Number(svg.dataset.wrapWidth);
      const x = country.anchor[0] + Math.round((box.x + box.width / 2 - country.anchor[0]) / width) * width;
      const point = new DOMPoint(x, country.anchor[1]).matrixTransform(svg.getScreenCTM());
      const hit = document.elementFromPoint(point.x, point.y)?.closest('[data-country], [data-wrap-country]');
      const actual = hit?.dataset.country ?? hit?.dataset.wrapCountry;
      if (actual !== code) bad.push({ expected: code, actual });
      if (getComputedStyle(region.querySelector('.region-fill')).stroke !== 'none') bad.push({ strokedCountry: code });
    }
    return bad;
  }, mapManifest);
  expect(failures).toEqual([]);
  await page.goto('/#/world?microstates=0');
  await expect(page.locator('#progress')).toHaveText('0 / 202');
  expect(await page.locator('[data-border-owners]').evaluateAll(paths => paths.filter(path =>
    path.dataset.borderOwners.split(' ').every(code => !code.startsWith('context-') &&
      !document.querySelector(`[data-country="${code}"]`))).length)).toBe(0);
});

test('a long dashed outline receives clicks near both ends of the island chain', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/world?microstates=1');
  await expect(page.locator('#progress')).toHaveText('0 / 250');
  const results = await page.locator('[data-country="MV"]').evaluate(region => {
    region.focus();
    const hit = region.querySelector('.hit-area');
    const land = region.querySelector('.region-fill');
    const box = hit.getBBox();
    const points = [];
    for (const fromBottom of [false, true]) {
      let found;
      for (let row = 1; row <= 10 && !found; row++) for (let col = 1; col < 20 && !found; col++) {
        const point = new DOMPoint(box.x + box.width * col / 20,
          box.y + box.height * (fromBottom ? 1 - row / 100 : row / 100));
        if (hit.isPointInFill(point) && !land.isPointInFill(point)) found = point;
      }
      if (!found) { points.push(null); continue; }
      const svg = region.ownerSVGElement, view = svg.viewBox.baseVal, width = Number(svg.dataset.wrapWidth);
      found.x += Math.round((view.x + view.width / 2 - found.x) / width) * width;
      const screen = found.matrixTransform(svg.getScreenCTM());
      const element = document.elementFromPoint(screen.x, screen.y)?.closest('[data-country], [data-wrap-country]');
      points.push(element?.dataset.country ?? element?.dataset.wrapCountry);
    }
    return points;
  });
  expect(results).toEqual(['MV', 'MV']);
});
