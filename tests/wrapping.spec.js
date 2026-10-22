import { test, expect } from '@playwright/test';
import { project, worldHeight } from '../scripts/projection.mjs';

async function start(page, first = 'US') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => { Math.random = () => .999; });
  if (first) await page.route('**/data/countries.json', async route => {
    const response = await route.fetch(), data = await response.json();
    const codes = [first, ...['US', 'RU', 'FJ'].filter(code => code !== first)];
    await route.fulfill({ json: codes.map(code => data.find(c => c.code === code)) });
  });
  await page.goto('/#/world');
  await expect(page.locator('#progress')).toHaveText(`0 / ${first ? 3 : 250}`);
}
async function panTo(page, x, y, zoomSteps = 0) {
  return page.locator('#map-surface > svg').evaluate((svg, { x, y, zoomSteps }) => {
    const key = key => svg.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    for (let i = 0; i < zoomSteps; i++) key('+');
    const box = svg.viewBox.baseVal;
    const step = 70 * box.width / svg.getBoundingClientRect().width;
    const deltaX = ((x - (box.x + box.width / 2) + 5400) % 3600) - 1800;
    const deltaY = y - (box.y + box.height / 2);
    for (let i = 0; i < Math.round(Math.abs(deltaX) / step); i++) key(deltaX > 0 ? 'ArrowRight' : 'ArrowLeft');
    for (let i = 0; i < Math.round(Math.abs(deltaY) / step); i++) key(deltaY > 0 ? 'ArrowDown' : 'ArrowUp');
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width };
  }, { x, y, zoomSteps });
}

test('Alaska in the repeated world is clickable and shares solved state', async ({ page, isMobile }) => {
  await start(page);
  await panTo(page, ...project([170, 60]), 2);
  const point = await page.locator('#map-surface > svg').evaluate((svg, [x, y]) => {
    // Interior Alaska at 160 W, 65 N, in the eastern repeat past Kamchatka.
    const p = new DOMPoint(x + 3600, y).matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y, code: document.elementFromPoint(p.x, p.y)?.dataset.wrapCountry };
  }, project([-160, 65]));
  expect(point.code).toBe('US');
  if (!isMobile) {
    await page.mouse.move(point.x, point.y);
    await expect(page.locator('[data-country="US"]')).toHaveClass(/wrap-hover/);
  }
  if (isMobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await expect(page.locator('#progress')).toHaveText('1 / 3');
  await expect(page.locator('[data-country="US"]')).toHaveClass(/solved/);
  const sourceID = await page.locator('[data-country="US"]').getAttribute('id');
  for (const offset of [-1, 1]) {
    await expect(page.locator(`[data-wrap-offset="${offset}"] [data-wrap-country="US"]`)).toHaveAttribute('href', `#${sourceID}`);
  }
  // A second tap inspects the checked region without recording a mistake.
  if (isMobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await expect(page.locator('#menu-incorrect')).toHaveText('0');
});

test('continuous seam drag and many circuits retain a fixed number of SVG instances', async ({ page, context, isMobile }) => {
  const downloads = [];
  page.on('request', request => { if (request.url().endsWith('/assets/maps/world.svg')) downloads.push(request.url()); });
  await start(page, null);
  const before = await panTo(page, ...project([170, 50]), 1);
  const svg = page.locator('#map-surface > svg');
  const rect = await svg.boundingBox();
  const a = { x: rect.width * .8, y: rect.height * .6 };
  const b = { x: rect.width * .2, y: a.y };
  if (isMobile) {
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }] });
    for (let i = 1; i <= 12; i++) await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * i / 12, y: a.y, id: 1 }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 12 }); await page.mouse.up();
  }
  const after = await svg.evaluate(svg => svg.viewBox.baseVal.x + svg.viewBox.baseVal.width / 2);
  expect(after).toBeCloseTo((before.x + before.width * .6) % 3600, 1);
  await expect(page.locator('#progress')).toHaveText('0 / 250');
  await expect(page.locator('#menu-incorrect')).toHaveText('0');
  const result = await svg.evaluate(svg => {
    const count = () => ({ nodes: svg.querySelectorAll('*').length, paths: svg.querySelectorAll('path').length, copies: svg.querySelectorAll('[data-wrap-offset]').length });
    const original = count();
    for (const key of ['ArrowRight', 'ArrowLeft']) for (let i = 0; i < 600; i++) {
      svg.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      const box = svg.viewBox.baseVal, center = box.x + box.width / 2;
      if (center < 0 || center >= 3600) throw Error('Camera escaped the recycled world');
    }
    return { original, final: count(), copiedPaths: svg.querySelectorAll('[data-wrap-offset] path').length };
  });
  expect(result.final).toEqual(result.original);
  expect(result.final.copies).toBe(2);
  expect(result.copiedPaths).toBe(0);
  expect(downloads).toHaveLength(1);
});

test('reveal across the seam, resize and reset keep repeats bounded', async ({ page }) => {
  await start(page, 'FJ');
  await panTo(page, ...project([-176, -15]), 4);
  await page.locator('#country-pill').click();
  await expect(page.locator('#progress')).toHaveText('1 / 3');
  await expect(page.locator('[data-country="FJ"]')).toHaveClass(/revealed/);
  await expect(page.locator('#country-pill')).toBeEnabled();
  await page.setViewportSize({ width: 2600, height: 500 });
  await page.locator('#map-surface > svg').press('0');
  const box = await page.locator('#map-surface > svg').evaluate(svg => {
    const b = svg.viewBox.baseVal;
    return { x: b.x, right: b.x + b.width, width: b.width };
  });
  expect(box.width).toBeLessThanOrEqual(6480.001);
  expect(box.x).toBeGreaterThanOrEqual(-3600);
  expect(box.right).toBeLessThanOrEqual(7200);
  await expect(page.locator('[data-wrap-offset]')).toHaveCount(2);
});

test('southern pan limit keeps Antarctica against the screen bottom through zoom and resize', async ({ page, isMobile }) => {
  await start(page, null);
  const svg = page.locator('#map-surface > svg');
  const bottom = () => svg.evaluate(el => el.viewBox.baseVal.y + el.viewBox.baseVal.height);
  const panSouth = () => svg.evaluate(el => {
    for (let i = 0; i < 200; i++) el.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
  });
  await panSouth();
  expect(await bottom()).toBeCloseTo(worldHeight, 2);
  await svg.dispatchEvent('keydown', { key: '+' });
  await svg.dispatchEvent('keydown', { key: '+' });
  await panSouth();
  expect(await bottom()).toBeCloseTo(worldHeight, 2);
  if (!isMobile) {
    const rect = await svg.boundingBox();
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x, y - 100, { steps: 5 });
    expect(await bottom()).toBeCloseTo(worldHeight, 2);
    await page.mouse.move(x, y - 80);
    expect(await bottom()).toBeLessThan(worldHeight - 1);
    await page.mouse.up();
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await svg.dispatchEvent('keydown', { key: '0' });
  await panSouth();
  expect(await bottom()).toBeCloseTo(worldHeight, 2);
  await expect(page.locator('#progress')).toHaveText('0 / 250');
  await expect(page.locator('#menu-incorrect')).toHaveText('0');
});
