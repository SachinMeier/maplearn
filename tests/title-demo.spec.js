import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync(new URL('../assets/maps/french-departments.manifest.json', import.meta.url)));
const title = (page, code) => page.locator(`.title-label[data-title-for="${code}"]`);

async function audit(page) {
  return page.evaluate(() => {
    const errors = [], rectangles = [];
    for (const label of document.querySelectorAll('.title-label')) {
      const code = label.dataset.titleFor;
      const path = document.querySelector(`#demo-map > svg [data-country="${code}"] .region-fill`);
      const root = path.ownerSVGElement;
      for (const span of label.querySelectorAll('tspan')) {
        const b = span.getBBox();
        const matrix = root.getScreenCTM().inverse().multiply(span.getScreenCTM());
        const low = new DOMPoint(b.x, b.y).matrixTransform(matrix);
        const high = new DOMPoint(b.x + b.width, b.y + b.height).matrixTransform(matrix);
        const [x, y, w, h] = [low.x, low.y, high.x - low.x, high.y - low.y];
        for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
          if (!path.isPointInFill(new DOMPoint(x + i * w / 4, y + j * h / 4))) errors.push(`${code} text outside region`);
        }
        for (const [other, a, c, width, height] of rectangles) {
          if (other !== code && x < a + width && x + w > a && y < c + height && y + h > c) errors.push(`${code}/${other} overlap`);
        }
        rectangles.push([code, x, y, w, h]);
      }
    }
    return [...new Set(errors)];
  });
}
async function ready(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/title-demo/');
  await expect(page.locator('#department-picker')).toBeEnabled();
}

test('all names stay inside their regions at every text size, with no outlines or quiz labels', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await ready(page);
  await expect(page.locator('#department-picker')).toBeEnabled();
  await expect(page.locator('.department-title')).toHaveCount(101);
  expect(await page.locator('.department-title').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')).sort()))
    .toEqual(Object.values(manifest.regions).map(r => r.name).sort());
  await expect(page.locator('#hover-title')).toBeHidden();
  await page.locator('#small-titles').selectOption('always');
  await expect(page.locator('#demo-status')).toHaveText('101 / 101 titles visible');
  for (const size of ['10', '11', '12', '13', '14', '15', '16', '17', '18']) {
    await page.locator('#title-size').fill(size);
    await expect(page.locator('#size-value')).toHaveText(size);
    expect(await audit(page)).toEqual([]);
  }
  expect(await page.locator('.department-title, .department-title tspan').evaluateAll(nodes => [...new Set(nodes.map(n => getComputedStyle(n).stroke))])).toEqual(['none']);
  await expect(page.locator('.demo-titles rect, .demo-titles path')).toHaveCount(0);
  await page.locator('#show-titles').uncheck();
  await expect(page.locator('.demo-titles')).toBeHidden();
  await expect(page.locator('#hover-title')).toBeHidden();
  await page.locator('#show-titles').check();
  await page.goto('/#/french-departments');
  await expect(page.locator('#progress')).toHaveText('0 / 101');
  await expect(page.locator('#map-surface text')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('one connected pill appears only for a hidden title on hover or tap', async ({ page, isMobile }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await ready(page);
  await expect(title(page, '75')).toBeHidden();
  const point = await page.locator('#demo-map > svg [data-country="75"]').evaluate((r, anchor) => {
    const p = new DOMPoint(...anchor).matrixTransform(r.ownerSVGElement.getScreenCTM());
    return { x: p.x, y: p.y };
  }, manifest.regions['75'].anchor);
  if (isMobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.move(point.x, point.y);
  await expect(page.locator('#hover-title')).toBeVisible();
  await expect(page.locator('#hover-title-name')).toHaveText('Paris');
  await expect(title(page, '75')).toBeHidden();
  const endpoint = await page.locator('#hover-title-anchor').evaluate(circle => {
    const r = circle.ownerSVGElement.getBoundingClientRect();
    return { x: +circle.getAttribute('cx') + r.left, y: +circle.getAttribute('cy') + r.top };
  });
  expect(endpoint.x).toBeCloseTo(point.x, 1); expect(endpoint.y).toBeCloseTo(point.y, 1);
  const pill = await page.locator('#hover-title-name').boundingBox();
  const map = await page.locator('#demo-map').boundingBox();
  expect(pill.x).toBeGreaterThanOrEqual(map.x);
  expect(pill.x + pill.width).toBeLessThanOrEqual(map.x + map.width);
  expect(pill.y).toBeGreaterThanOrEqual(map.y);
  expect(pill.y + pill.height).toBeLessThanOrEqual(map.y + map.height);
  await page.locator('#show-titles').uncheck(); await expect(page.locator('#hover-title')).toBeHidden();
  await page.locator('#show-titles').check();
  await page.mouse.move(0, 0); await page.locator('#reset-view').click();
  await expect(page.locator('#hover-title')).toBeHidden();
  await page.locator('#department-picker').selectOption('75');
  await page.locator('#demo-map > svg').focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('+');
  await expect(title(page, '75')).toBeVisible();
  await expect(page.locator('#hover-title')).toBeHidden();
  expect(await audit(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('zoom and size controls preserve nodes, centers and wrapping while scaling continuously', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    window.labelNodes = [...document.querySelectorAll('.title-label')];
    window.labelMarkup = window.labelNodes.map(n => n.innerHTML);
    window.labelBoxes = window.labelNodes.map(n => n.dataset.labelBox);
  });
  await page.locator('#demo-map > svg').focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('+');
  const samples = await page.evaluate(async () => {
    const root = document.querySelector('#demo-map > svg');
    const text = document.querySelector('.department-title');
    const values = [];
    for (let i = 0; i < 12; i++) {
      const b = root.viewBox.baseVal;
      root.setAttribute('viewBox', `${b.x + b.width * .0005} ${b.y + b.height * .0005} ${b.width * .999} ${b.height * .999}`);
      await new Promise(requestAnimationFrame);
      values.push({ factor: text.getScreenCTM().a / root.getScreenCTM().a,
        pixels: +text.getAttribute('font-size') * text.getScreenCTM().a });
    }
    return values;
  });
  for (let i = 1; i < samples.length; i++) {
    expect(samples[i].factor).toBeLessThan(samples[i - 1].factor);
    expect(samples[i - 1].factor - samples[i].factor).toBeLessThan(.01);
    expect(samples[i].pixels).toBeLessThanOrEqual(18.001);
  }
  await page.locator('#title-size').fill('16');
  await page.locator('#reset-view').click();
  expect(await page.evaluate(() => window.labelNodes.every((node, i) =>
    node === document.querySelectorAll('.title-label')[i] && node.innerHTML === window.labelMarkup[i]
    && node.dataset.labelBox === window.labelBoxes[i]))).toBe(true);
  expect(await audit(page)).toEqual([]);
});
