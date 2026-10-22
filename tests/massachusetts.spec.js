import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../assets/maps/massachusetts-towns.manifest.json', import.meta.url)));
const roster = JSON.parse(readFileSync(new URL('../assets/maps/massachusetts-towns.countries.json', import.meta.url)));

test('Reveal all checks and labels every Massachusetts town from partial and fresh rounds', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#/massachusetts-towns');
  await expect(page.locator('#progress')).toHaveText('0 / 64');
  const current = page.locator('#map-surface').getByRole('button', {
    name: await page.locator('#country-name').textContent(), exact: true,
  });
  await current.press('Enter');
  await expect(page.locator('#progress')).toHaveText('1 / 64');
  await page.locator('#country-pill').click();
  await expect(page.locator('#country-pill')).toBeEnabled();
  await page.locator('#menu-button').click();
  await page.getByRole('button', { name: 'Reveal all', exact: true }).click();
  await expect(page.locator('#progress')).toHaveText('64 / 64');
  await expect(page.locator('[data-country].solved')).toHaveCount(64);
  await expect(page.locator('[data-town-label]')).toHaveCount(64);
  await expect(page.locator('#final-correct')).toHaveText('1');
  await expect(page.locator('#final-reveals')).toHaveText('63');
  await expect(page.locator('#complete-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close completion', exact: true }).click();
  await expect(page.locator('#complete-dialog')).not.toBeVisible();
  for (const town of roster) await expect(page.locator(`[data-town-label="${town.code}"] text`)).toHaveText(town.name);
  await page.locator('#menu-button').click();
  await expect(page.locator('#menu-reveal-all')).toBeDisabled();
  await page.reload();
  await expect(page.locator('#progress')).toHaveText('0 / 64');
  await expect(page.locator('[data-town-label]')).toHaveCount(0);
  await page.locator('#menu-button').click();
  await page.getByRole('button', { name: 'Reveal all', exact: true }).click();
  await expect(page.locator('#progress')).toHaveText('64 / 64');
  await expect(page.locator('[data-country].revealed')).toHaveCount(64);
  await expect(page.locator('[data-town-label]')).toHaveCount(64);
  await expect(page.locator('#final-reveals')).toHaveText('64');
  expect(errors).toEqual([]);
});

test('reveals ease into a wider view and keep the answer visible until the camera settles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install({ time: new Date('2026-10-21T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-21T12:00:01Z'));
  await page.route('**/massachusetts-towns.countries.json', route => route.fulfill({ json: roster.filter(t => ['Milton', 'Hull'].includes(t.name)) }));
  await page.goto('/#/massachusetts-towns');
  await expect(page.locator('#progress')).toHaveText('0 / 2');
  await page.clock.runFor(50);
  const svg = page.locator('#map-surface > svg');
  const width = () => svg.evaluate(el => el.viewBox.baseVal.width);
  const overviewWidth = await width();
  const name = await page.locator('#country-name').textContent();
  await page.locator('#country-pill').click();
  await page.clock.runFor(150);
  expect(overviewWidth / await width()).toBeGreaterThan(1);
  expect(overviewWidth / await width()).toBeLessThan(1.15);
  await page.clock.runFor(650);
  expect(overviewWidth / await width()).toBeLessThan(3);
  await expect(page.locator('#country-name')).toHaveText(name);
  await expect(page.locator('#country-pill')).toBeDisabled();
  await page.clock.runFor(400);
  expect(overviewWidth / await width()).toBeCloseTo(3, 3);
  await expect(page.locator('#country-name')).toHaveText(name);
  await page.clock.runFor(400);
  await expect(page.locator('#country-pill')).toBeEnabled();
  await expect(page.locator('#country-name')).not.toHaveText(name);
  // The automatic cap does not restrict manual zoom; the next reveal restores context.
  await svg.press('+');
  expect(overviewWidth / await width()).toBeGreaterThan(3);
  await page.locator('#country-pill').click();
  await page.clock.runFor(1600);
  expect(overviewWidth / await width()).toBeCloseTo(3, 3);
  await expect(page.locator('#complete-dialog')).toBeVisible();
});

test('reduced motion skips the reveal animation while retaining the wider framing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/massachusetts-towns');
  await expect(page.locator('#progress')).toHaveText('0 / 64');
  const svg = page.locator('#map-surface > svg');
  const overviewWidth = await svg.evaluate(el => el.viewBox.baseVal.width);
  await page.locator('#country-pill').click();
  const revealedWidth = await svg.evaluate(el => el.viewBox.baseVal.width);
  expect(overviewWidth / revealedWidth).toBeCloseTo(3, 3);
  await expect(page.locator('#country-pill')).toBeEnabled();
});

test('Massachusetts menu, all 64 native circle targets, scoring, reveal, and retry', async ({ page, isMobile }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('#massachusetts-towns-button').click();
  await expect(page.locator('#progress')).toHaveText('0 / 64');
  await expect(page.locator('#setup-dialog')).not.toBeVisible();
  await expect(page.locator('#map-surface text, #map-surface title')).toHaveCount(0);
  const failures = await page.evaluate(regions => {
    const bad = [];
    for (const [code, town] of Object.entries(regions)) {
      const region = document.querySelector(`[data-country="${code}"]`);
      region.focus();
      // Equal-size circles may overlap. Every town must retain an exposed target.
      const offsets = [[0, 0], ...Array.from({ length: 16 }, (_, i) =>
        [Math.cos(i * Math.PI / 8) * town.radius * .8, Math.sin(i * Math.PI / 8) * town.radius * .8])];
      const reachable = offsets.some(([dx, dy]) => {
        const point = new DOMPoint(town.anchor[0] + dx, town.anchor[1] + dy).matrixTransform(region.ownerSVGElement.getScreenCTM());
        const hit = document.elementFromPoint(point.x, point.y)?.closest('[data-country]');
        return hit?.dataset.country === code;
      });
      if (!reachable) bad.push({ code, obscured: true });
      if (getComputedStyle(region.querySelector('.hit-area')).strokeDasharray === 'none') bad.push({ code, noDashes: true });
    }
    return bad;
  }, manifest.regions);
  expect(failures).toEqual([]);
  const target = page.locator('#map-surface').getByRole('button', { name: await page.locator('#country-name').textContent(), exact: true });
  const code = await target.getAttribute('data-country');
  await page.locator(`[data-country]:not([data-country="${code}"])`).first().press('Enter');
  await expect(page.locator('#menu-incorrect')).toHaveText('1');
  await expect(page.locator('[data-town-label]')).toHaveCount(0);
  await target.focus();
  await page.keyboard.press('+');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  const point = await target.evaluate(region => {
    const circle = region.querySelector('.hit-area');
    const box = circle.getBoundingClientRect();
    const inverse = circle.getScreenCTM().inverse();
    // Nearby town circles can overlap. Search the whole exposed circle, not
    // just one ring, and check integer coordinates used by touchscreen taps.
    for (let y = Math.ceil(box.top); y <= Math.floor(box.bottom); y++) {
      for (let x = Math.ceil(box.left); x <= Math.floor(box.right); x++) {
        if (circle.isPointInFill(new DOMPoint(x, y).matrixTransform(inverse))
          && document.elementFromPoint(x, y)?.closest('[data-country]') === region) return { x, y };
      }
    }
    throw new Error('Town has no exposed click target');
  });
  if (isMobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await expect(target).toHaveClass(/solved/);
  await expect(page.locator('#progress')).toHaveText('1 / 64');
  await expect(page.locator('[data-town-label]')).toHaveCount(1);
  await expect(page.locator(`[data-town-label="${code}"] text`)).toHaveText(manifest.regions[code].name);
  await expect(target.locator('.hit-area')).toHaveCSS('fill', 'rgb(167, 203, 160)');
  const revealName = await page.locator('#country-name').textContent();
  await page.locator('#country-pill').click();
  await expect(page.locator('#progress')).toHaveText('2 / 64');
  await expect(page.locator('[data-town-label]')).toHaveCount(2);
  await expect(page.locator('[data-town-label] text').filter({ hasText: revealName })).toHaveCount(1);
  await expect(page.locator('#country-pill')).toBeEnabled();
  await page.locator('#menu-button').click();
  await expect(page.locator('#map-credit')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#progress')).toHaveText('0 / 64');
  await expect(page.locator('#menu-incorrect')).toHaveText('0');
  await expect(page.locator('[data-town-label]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('completed town labels retain curated positions and do not intercept map clicks', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/massachusetts-towns');
  await expect(page.locator('#progress')).toHaveText('0 / 64');
  await page.evaluate(() => {
    for (let i = 0; i < 64; i++) {
      const name = document.querySelector('#country-name').textContent;
      const region = [...document.querySelectorAll('[data-country]')].find(el => el.getAttribute('aria-label') === name);
      region.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
  });
  await expect(page.locator('[data-town-label]')).toHaveCount(64);
  expect(await page.locator('.town-leader').count()).toBeGreaterThan(0);
  for (const [code, side] of Object.entries({
    'MA-BROCKTON': 'below', 'MA-BRIDGEWATER': 'below', 'MA-LEXINGTON': 'below',
    'MA-TEWKSBURY': 'below', 'MA-READING': 'below', 'MA-CHICOPEE': 'right',
    'MA-SPRINGFIELD': 'below-right', 'MA-AGAWAM': 'below-left', 'MA-NORTH-ADAMS': 'right', 'MA-NORTHAMPTON': 'left',
    'MA-NEWBURYPORT': 'below', 'MA-SALISBURY': 'above', 'MA-CAMBRIDGE': 'above',
  })) {
    await expect(page.locator(`[data-town-label="${code}"]`)).toHaveAttribute('data-placement', side);
    await expect(page.locator(`[data-town-label="${code}"] .town-leader`)).toHaveCount(0);
  }
  await expect(page.locator('#complete-dialog')).toBeVisible();
  const check = () => page.evaluate(() => {
    const labels = [...document.querySelectorAll('[data-town-label]')];
    const errors = [];
    for (const [index, label] of labels.entries()) {
      const text = label.querySelector('text');
      const a = text.getBoundingClientRect();
      const circle = document.querySelector(`[data-country="${label.dataset.townLabel}"] .hit-area`).getBoundingClientRect();
      const side = label.dataset.placement;
      if (side === 'above' && a.bottom > circle.top || side === 'below' && a.top < circle.bottom
        || side === 'right' && a.left < circle.right || side === 'left' && a.right > circle.left
        || side === 'below-right' && (a.left < circle.x + circle.width / 2 || a.top < circle.y + circle.height / 2)
        || side === 'below-left' && (a.right > circle.x + circle.width / 2 || a.top < circle.y + circle.height / 2))
        errors.push('Wrong side: ' + label.dataset.townLabel);
      if (getComputedStyle(text).pointerEvents !== 'none') errors.push('Label blocks clicks');
      const leader = label.querySelector('.town-leader');
      if (leader) {
        const target = document.querySelector(`[data-country="${label.dataset.townLabel}"] .hit-area`);
        const start = leader.getPointAtLength(0), end = leader.getPointAtLength(leader.getTotalLength());
        const rx = start.x - target.cx.baseVal.value, ry = start.y - target.cy.baseVal.value;
        const dx = end.x - start.x, dy = end.y - start.y;
        const radius = target.r.baseVal.value;
        if (Math.abs(Math.hypot(rx, ry) - radius) > .001) errors.push('Leader misses circle: ' + label.dataset.townLabel);
        // The tangent is (-ry, rx); its dot product with the leader must be zero.
        if (Math.abs(-ry * dx + rx * dy) / (radius * Math.hypot(dx, dy)) > .0001)
          errors.push('Leader is not perpendicular to tangent: ' + label.dataset.townLabel);
        if (rx * dx + ry * dy <= 0) errors.push('Leader points into circle: ' + label.dataset.townLabel);
      }
      for (const other of labels.slice(index + 1)) {
        const b = other.querySelector('text').getBoundingClientRect();
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) errors.push(`${label.dataset.townLabel} overlaps ${other.dataset.townLabel}`);
      }
    }
    return errors;
  });
  expect(await check()).toEqual([]);
  // Close only the completion overlay to inspect the finished map's camera.
  await page.locator('#complete-dialog').evaluate(dialog => dialog.close());
  await page.locator('[data-country="MA-MILTON"]').focus();
  expect(await check()).toEqual([]);
  await page.locator('#map-surface > svg').press('+');
  await page.keyboard.press('ArrowLeft');
  expect(await check()).toEqual([]);
  await page.locator('#menu-button').click();
  await page.locator('#menu-dialog').getByRole('link', { name: 'Home', exact: true }).click();
  await page.locator('#massachusetts-towns-button').click();
  await expect(page.locator('[data-town-label]')).toHaveCount(0);
});

test('curated town labels stay separate with wider system fonts', async ({ page }) => {
  await page.route('**/town-labels.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replaceAll('system-ui', 'Verdana') });
  });
  await page.goto('/#/massachusetts-towns');
  await expect(page.locator('#progress')).toHaveText('0 / 64');
  await page.locator('#menu-button').click();
  await page.locator('#menu-reveal-all').click();
  await expect(page.locator('[data-town-label]')).toHaveCount(64);
  const overlaps = await page.locator('[data-town-label]').evaluateAll(labels => {
    const overlaps = [];
    labels.forEach((label, i) => {
      const a = label.querySelector('text').getBoundingClientRect();
      for (const other of labels.slice(i + 1)) {
        const b = other.querySelector('text').getBoundingClientRect();
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)
          overlaps.push(`${label.dataset.townLabel}/${other.dataset.townLabel}`);
      }
    });
    return overlaps;
  });
  expect(overlaps).toEqual([]);
  await expect(page.locator('[data-town-label="MA-CAMBRIDGE"]')).toHaveAttribute('data-placement', 'above');
  await expect(page.locator('[data-town-label="MA-LEXINGTON"]')).toHaveAttribute('data-placement', 'below');
});

test('all seven requested towns can finish a round with the microstate preference off', async ({ page, isMobile }) => {
  const requested = new Set(['Milton', 'Braintree', 'Norfolk', 'Wellesley', 'Lexington', 'Concord', 'Hull']);
  await page.route('**/massachusetts-towns.countries.json', route => route.fulfill({ json: roster.filter(t => requested.has(t.name)) }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/massachusetts-towns?microstates=0');
  await expect(page.locator('#progress')).toHaveText('0 / 7');
  for (let i = 0; i < 7; i++) {
    const target = page.locator('#map-surface').getByRole('button', { name: await page.locator('#country-name').textContent(), exact: true });
    await target.focus();
    const point = await target.locator('.hit-area').evaluate(circle => {
      const p = new DOMPoint(circle.cx.baseVal.value, circle.cy.baseVal.value).matrixTransform(circle.getScreenCTM());
      return { x: p.x, y: p.y };
    });
    if (isMobile) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await expect(target).toHaveClass(/solved/);
  }
  await expect(page.locator('#complete-dialog')).toBeVisible();
  await expect(page.locator('#final-correct')).toHaveText('7');
  await expect(page.locator('#final-incorrect')).toHaveText('0');
});
