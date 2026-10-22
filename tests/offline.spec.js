import { test, expect } from '@playwright/test';
import { maps } from '../maps.js';

test.use({ serviceWorkers: 'allow' });
const download = (page, id) => page.locator(`[data-download-map="${id}"]`);
const status = (page, id) => page.locator(`#download-status-${id}`);

async function openHome(page) {
  await page.goto('/');
  await expect(download(page, 'nyc-manhattan')).toBeEnabled({ timeout: 20000 });
}

test('each map downloads separately and survives a new offline tab with playable quizzes', async ({ page, context }) => {
  test.setTimeout(180000);
  await openHome(page);
  for (const map of maps) {
    await download(page, map.id).click();
    await expect(status(page, map.id)).toHaveText('✓ Available offline', { timeout: 30000 });
    await expect(page.locator('#home')).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  }
  await page.close();
  await context.setOffline(true);
  const offline = await context.newPage();
  await offline.goto('/');
  for (const map of maps) {
    await expect(status(offline, map.id)).toHaveText('✓ Available offline');
    await offline.goto(`/#/${map.id}?microstates=1`);
    await expect(offline.locator('#country-name')).not.toHaveText('Loading…', { timeout: 20000 });
    await expect(offline.locator('#load-error')).toBeHidden();
    const name = await offline.locator('#country-name').textContent();
    await offline.locator('#map-surface').getByRole('button', { name, exact: true }).first().press('Enter');
    await expect(offline.locator('#menu-correct')).toHaveText('1');
    await offline.getByRole('button', { name: 'Open menu' }).click();
    await offline.getByRole('button', { name: 'Reveal all', exact: true }).click();
    await expect(offline.locator('#complete-dialog')).toBeVisible();
    await offline.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(offline.locator('#menu-correct')).toHaveText('0');
  }
  await offline.goto('/');
  await download(offline, 'nyc-manhattan').click();
  await expect(status(offline, 'nyc-manhattan')).not.toContainText('Available offline');
  await offline.reload();
  await expect(download(offline, 'nyc-manhattan')).toHaveText('↓ Download');
  await expect(status(offline, 'nyc-brooklyn')).toHaveText('✓ Available offline');
  await offline.goto('/#/nyc-manhattan');
  await expect(offline.locator('#load-error')).toBeVisible();
});

test('failed download is retryable and never marked saved; unselected maps stay uncached', async ({ page, context }) => {
  await openHome(page);
  await context.setOffline(true);
  await download(page, 'nyc-manhattan').click();
  await expect(download(page, 'nyc-manhattan')).toHaveText('Retry');
  await expect(status(page, 'nyc-manhattan')).toContainText('Check your connection');
  expect(await page.evaluate(async () => (await caches.keys()).filter(key => key.includes(':map:')))).toEqual([]);
  await context.setOffline(false);
  await download(page, 'nyc-manhattan').click();
  await expect(status(page, 'nyc-manhattan')).toHaveText('✓ Available offline');
  const cached = await page.evaluate(async () => (await caches.keys()).filter(key => key.includes(':map:')));
  expect(cached).toHaveLength(1);
  expect(cached[0]).toContain(':map:nyc-manhattan:');
  await page.reload();
  await expect(status(page, 'nyc-manhattan')).toHaveText('✓ Available offline');
  await context.setOffline(true);
  await page.goto('/#/nyc-brooklyn');
  await expect(page.locator('#load-error')).toBeVisible();
});

test('storage failure after a partial write cleans up and allows retry', async ({ page, context }) => {
  await openHome(page);
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(() => {
    const original = Cache.prototype.put;
    let writes = 0;
    Cache.prototype.put = function (...args) {
      if (++writes === 2) {
        Cache.prototype.put = original;
        throw new DOMException('Test storage exhaustion', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  await download(page, 'nyc-manhattan').click();
  await expect(status(page, 'nyc-manhattan')).toContainText('Not enough storage');
  expect(await page.evaluate(async () => (await caches.keys()).filter(key => key.includes(':map:')))).toEqual([]);
  await download(page, 'nyc-manhattan').click();
  await expect(status(page, 'nyc-manhattan')).toHaveText('✓ Available offline');
});

test('subpath updates preserve offline downloads, including changes while an update waits', async ({ page, context }) => {
  test.setTimeout(60000);
  const { createServer } = await import('node:http');
  const { readFile } = await import('node:fs/promises');
  let release = 1, fail = false;
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname.replace(/^\/nested\/maps\//, '') || 'index.html';
      if (fail && path === 'assets/maps/nyc-manhattan.manifest.json') {
        res.writeHead(503); res.end('Temporarily unavailable'); return;
      }
      let body = await readFile(new URL(`../dist/${path}`, import.meta.url));
      if (path === 'sw.js') body = `${body}\n// test release ${release}\n`;
      if (path === 'offline-manifest.js' && release > 1) {
        body = `${body}\nself.OFFLINE_MANIFEST.version += '-2';\nself.OFFLINE_MANIFEST.maps.forEach(map => map.version += '-2');`;
      }
      const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' :
        path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.json') ? 'application/json' : 'text/html';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/nested/maps/`;
  const update = () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration.update();
    const worker = registration.installing;
    if (worker && !['installed', 'redundant'].includes(worker.state)) {
      await new Promise(resolve => worker.addEventListener('statechange', () => {
        if (['installed', 'redundant'].includes(worker.state)) resolve();
      }));
    }
    return { state: worker?.state, waiting: !!registration.waiting };
  });
  try {
    await page.goto(base);
    for (const id of ['nyc-manhattan', 'nyc-brooklyn']) {
      await expect(download(page, id)).toBeEnabled();
      await download(page, id).click();
      await expect(status(page, id)).toHaveText('✓ Available offline');
    }
    release = 2; fail = true;
    expect(await update()).toEqual({ state: 'redundant', waiting: false });
    await context.setOffline(true);
    await page.goto(`${base}#/nyc-manhattan`);
    await expect(page.locator('#progress')).toHaveText('0 / 64');
    await context.setOffline(false);
    await page.goto(base);
    fail = false;
    expect(await update()).toEqual({ state: 'installed', waiting: true });
    // Downloads and removals performed in the old tab must survive activation.
    await download(page, 'nyc-manhattan').click();
    await expect(download(page, 'nyc-manhattan')).toHaveText('↓ Download');
    await download(page, 'nyc-queens').click();
    await expect(status(page, 'nyc-queens')).toHaveText('✓ Available offline');
    await page.close();
    await context.setOffline(true);
    const reopened = await context.newPage();
    await reopened.goto(base);
    await expect(download(reopened, 'nyc-manhattan')).toHaveText('↓ Download');
    await expect(status(reopened, 'nyc-brooklyn')).toHaveText('✓ Available offline');
    await expect(status(reopened, 'nyc-queens')).toHaveText('✓ Available offline');
    await reopened.goto(`${base}#/nyc-queens`);
    await expect(reopened.locator('#load-error')).toBeHidden();
    await expect(reopened.locator('#country-name')).not.toHaveText('Loading…');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
