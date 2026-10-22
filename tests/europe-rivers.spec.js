import { test, expect } from '@playwright/test';

test('European Rivers appears under Other and countries are noninteractive context', { tag: '@smoke' }, async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('#other-options #europe-rivers-button')).toBeVisible();
  await page.locator('#europe-rivers-button').click();
  await expect(page.locator('#progress')).toHaveText('0 / 31');
  await expect(page.locator('#setup-dialog')).not.toBeVisible();
  await expect(page.locator('#map-surface [data-country]')).toHaveCount(31);
  await expect(page.locator('#map-surface title, #map-surface text')).toHaveCount(0);
  const styles = await page.evaluate(() => {
    const svg = document.querySelector('#map-surface svg');
    return {
      context: [...svg.querySelectorAll('.context-land, .border-mesh')].every(e => getComputedStyle(e).pointerEvents === 'none'),
      visible: getComputedStyle(svg.querySelector('.river-line')).stroke,
      lineWidth: parseFloat(getComputedStyle(svg.querySelector('.river-line')).strokeWidth),
      hitWidth: parseFloat(getComputedStyle(svg.querySelector('.river-hit')).strokeWidth),
    };
  });
  expect(styles.context).toBe(true);
  expect(styles.visible).toBe('rgb(20, 123, 182)');
  expect(styles.hitWidth).toBeGreaterThan(styles.lineWidth);
  await page.screenshot({ path: testInfo.outputPath('europe-rivers.png') });
});

test('all 31 rivers accept pointer guesses after zoom/pan, with mistakes, reveal and retry', async ({ page, isMobile }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/europe-rivers');
  await expect(page.locator('#progress')).toHaveText('0 / 31');
  const name = await page.locator('#country-name').textContent();
  const wrongCode = await page.locator('.river-region').evaluateAll((rs, name) => rs.find(r => r.getAttribute('aria-label') !== name).dataset.country, name);
  await page.locator(`[data-country="${wrongCode}"]`).press('Enter');
  await expect(page.locator('#menu-incorrect')).toHaveText('1');
  for (let i = 0; i < 31; i++) {
    const targetName = await page.locator('#country-name').textContent();
    const target = page.locator('#map-surface').getByRole('button', { name: targetName, exact: true });
    // Keyboard focus uses the same automatic camera framing as Reveal.
    await page.keyboard.press('Tab');
    await target.focus();
    await page.keyboard.press('+');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    const point = await target.evaluate(region => {
      const line = region.querySelector('.river-line');
      const svg = region.ownerSVGElement;
      const matrix = svg.getScreenCTM();
      // Pick a real, unobstructed point on the rendered curve, not its box center.
      for (const fraction of [.5, .35, .65, .2, .8, .1, .9]) {
        const p = line.getPointAtLength(line.getTotalLength() * fraction).matrixTransform(matrix);
        // Touchscreen.tap rounds to CSS pixels. Validate the actual tap point,
        // including nearby pixels when rounding lands beside a narrow river.
        for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const x = Math.round(p.x) + dx, y = Math.round(p.y) + dy;
          if (document.elementFromPoint(x, y)?.closest('[data-country]') === region) return { x, y };
        }
      }
      return null;
    });
    expect(point, `No reachable point for ${targetName}`).not.toBeNull();
    if (isMobile) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await expect(target).toHaveClass(/solved/);
    await expect(page.locator('#progress')).toHaveText(`${i + 1} / 31`);
  }
  await expect(page.locator('#complete-dialog')).toBeVisible();
  await expect(page.locator('#final-correct')).toHaveText('31');
  await expect(page.locator('#final-incorrect')).toHaveText('1');
  await page.locator('#retry-button').click();
  await expect(page.locator('#progress')).toHaveText('0 / 31');
  await page.locator('#country-pill').click();
  await expect(page.locator('#progress')).toHaveText('1 / 31');
  await expect(page.locator('#country-pill')).toBeEnabled();
  await page.locator('#menu-button').click();
  await expect(page.locator('#menu-reveals')).toHaveText('1');
  await page.locator('#menu-reveal-all').click();
  await expect(page.locator('#complete-dialog')).toBeVisible();
  await expect(page.locator('#final-reveals')).toHaveText('31');
  expect(errors).toEqual([]);
});
