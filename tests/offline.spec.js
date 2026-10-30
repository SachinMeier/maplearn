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
    await expect(status(page, map.id)).toHaveText('Saved', { timeout: 30000 });
    await expect(page.locator('#home')).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  }
  await page.close();
  await context.setOffline(true);
  const offline = await context.newPage();
  await offline.goto('/');
  for (const map of maps) {
    await expect(status(offline, map.id)).toHaveText('Saved');
    await offline.goto(`/#/${map.id}?microstates=1`);
    await expect(offline.locator('#country-name')).not.toHaveText('Loading…', { timeout: 20000 });
    await expect(offline.locator('#load-error')).toBeHidden();
    const name = await offline.locator('#country-name').textContent();
    await offline.locator('#map-surface').getByRole('button', { name, exact: true }).first().press('Enter');
    await expect(offline.locator('#menu-correct')).toHaveText('1');
    expect(await offline.locator('#menu-button use').evaluate(el => el.getBBox().width)).toBeGreaterThan(0);
    await offline.getByRole('button', { name: 'Open menu' }).click();
    await offline.getByRole('button', { name: 'Reveal all', exact: true }).click();
    await expect(offline.locator('#complete-dialog')).toBeVisible();
    expect(await offline.locator('#complete-close use').evaluate(el => el.getBBox().width)).toBeGreaterThan(0);
    await offline.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(offline.locator('#menu-correct')).toHaveText('0');
  }
  await offline.goto('/');
  await offline.locator('#nyc-manhattan-button').hover();
  await download(offline, 'nyc-manhattan').click();
  await expect(status(offline, 'nyc-manhattan')).not.toContainText('Saved');
  await offline.reload();
  await expect(download(offline, 'nyc-manhattan')).toHaveText('↓ Download');
  await expect(status(offline, 'nyc-brooklyn')).toHaveText('Saved');
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
  await expect(status(page, 'nyc-manhattan')).toHaveText('Saved');
  const cached = await page.evaluate(async () => (await caches.keys()).filter(key => key.includes(':map:')));
  expect(cached).toHaveLength(1);
  expect(cached[0]).toContain(':map:nyc-manhattan:');
  await page.reload();
  await expect(status(page, 'nyc-manhattan')).toHaveText('Saved');
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
  await expect(status(page, 'nyc-manhattan')).toHaveText('Saved');
});

test('version checks offer explicit refresh, validate all files, and preserve saved maps across app updates', async ({ page, context }, testInfo) => {
  test.setTimeout(90000);
  const { createServer } = await import('node:http');
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  let release = 1, fail = false, corrupt = false;
  const catalog = JSON.parse(await readFile(new URL('../dist/offline-catalog.json', import.meta.url)));
  const id = 'nyc-manhattan';
  const original = catalog.maps.find(map => map.id === id);
  const updatedFiles = new Map();
  for (const path of original.files) {
    let body = await readFile(new URL(`../dist/${path}`, import.meta.url));
    if (path.endsWith('.countries.json')) {
      const roster = JSON.parse(body);
      roster.forEach(country => { country.name = `Updated ${country.name}`; });
      body = Buffer.from(JSON.stringify(roster));
    }
    updatedFiles.set(path, body);
  }
  const hash = createHash('sha256');
  for (const [path, body] of updatedFiles) hash.update(path).update(body);
  const updated = { ...original, version: hash.digest('hex').slice(0, 20),
    bytes: [...updatedFiles.values()].reduce((sum, body) => sum + body.length, 0),
    fileHashes: Object.fromEntries([...updatedFiles].map(([path, body]) => [path, createHash('sha256').update(body).digest('hex')])) };
  const manifest = (await readFile(new URL('../dist/offline-manifest.js', import.meta.url), 'utf8'));
  const requests = [];
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname.replace(/^\/nested\/maps\//, '') || 'index.html';
      requests.push(path);
      if (fail && path === `assets/maps/${id}.manifest.json`) {
        res.writeHead(503); res.end('Temporarily unavailable'); return;
      }
      let body;
      if (path === 'offline-catalog.json') body = JSON.stringify({ maps: catalog.maps.map(map => release > 1 && map.id === id ? updated : map) });
      else if (path === 'offline-manifest.js') body = release > 1
        ? `${manifest}\nself.OFFLINE_MANIFEST.version += '-2';\nself.OFFLINE_MANIFEST.maps = ${JSON.stringify(catalog.maps.map(map => map.id === id ? updated : map))};`
        : manifest;
      else if (release > 1 && updatedFiles.has(path)) {
        body = updatedFiles.get(path);
        if (corrupt && path.endsWith('.countries.json')) body = Buffer.from('[]');
      } else body = await readFile(new URL(`../dist/${path}`, import.meta.url));
      if (path === 'sw.js') body = `${body}\n// test release ${release}\n`;
      const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' :
        path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.json') ? 'application/json' : 'text/html';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/nested/maps/`;
  const refreshButton = page.locator(`[data-refresh-map="${id}"]`);
  const check = async () => {
    // Advance the catalog check window without making the test wait a minute.
    await context.serviceWorkers()[0].evaluate(() => { lastCheck = 0; });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
  };
  try {
    await page.goto(base);
    for (const mapId of [id, 'nyc-brooklyn']) {
      await expect(download(page, mapId)).toBeEnabled();
      await download(page, mapId).click();
      await expect(status(page, mapId)).toHaveText('Saved');
    }
    await expect(refreshButton).toBeHidden();
    // Populate the in-memory gameplay cache before refreshing this map.
    await page.goto(`${base}#/${id}`);
    await expect(page.locator('#progress')).toHaveText('0 / 64');
    await page.evaluate(() => { location.hash = '/'; });
    release = 2;
    requests.length = 0;
    await check();
    await expect(refreshButton).toBeVisible();
    const card = page.locator(`#${id}-button`).locator('..');
    await card.hover();
    await card.screenshot({ path: testInfo.outputPath('refresh-card.png') });
    expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(requests.filter(path => original.files.includes(path))).toEqual([]);
    await expect(status(page, id)).toHaveText('Saved');
    // Both a network failure and a successful response with wrong bytes retain v1.
    for (const mode of ['network', 'checksum']) {
      fail = mode === 'network'; corrupt = mode === 'checksum';
      await refreshButton.click();
      await expect(page.locator(`#${id}-button`).locator('..').locator('.download-message')).toContainText('Saved copy kept');
      await expect(refreshButton).toBeEnabled();
      const roster = await page.evaluate(async path => (await fetch(path)).json(), `assets/maps/${id}.countries.json`);
      expect(roster[0].name).not.toContain('Updated');
      const cachesNow = await page.evaluate(async () => (await caches.keys()).filter(key => key.includes(':map:nyc-manhattan:')));
      expect(cachesNow).toHaveLength(1);
      expect(cachesNow[0]).toContain(original.version);
    }
    fail = corrupt = false;
    await refreshButton.click();
    await expect(refreshButton).toBeHidden();
    await expect(status(page, id)).toHaveText('Saved');
    // Same-tab navigation uses refreshed data without a browser reload.
    await page.evaluate(() => { location.hash = '/nyc-manhattan'; });
    await expect(page.locator('#country-name')).toHaveText(/^Updated /);
    await page.evaluate(() => { location.hash = '/'; });
    // Interface update installs without silently fetching all saved maps.
    requests.length = 0;
    const update = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
      const installing = registration.installing;
      if (installing && !['installed', 'redundant'].includes(installing.state)) {
        await new Promise(resolve => installing.addEventListener('statechange', () => {
          if (['installed', 'redundant'].includes(installing.state)) resolve();
        }));
      }
      return { waiting: !!registration.waiting };
    });
    expect(update.waiting).toBe(true);
    expect(requests.filter(path => catalog.maps.some(map => map.files.includes(path)))).toEqual([]);
    // Changes while the interface update waits survive its eventual activation.
    await page.locator('#nyc-brooklyn-button').hover();
    await download(page, 'nyc-brooklyn').click();
    await expect(download(page, 'nyc-brooklyn')).toHaveText('↓ Download');
    await download(page, 'nyc-queens').click();
    await expect(status(page, 'nyc-queens')).toHaveText('Saved');
    await page.close();
    await context.setOffline(true);
    const reopened = await context.newPage();
    await reopened.goto(base);
    await expect(status(reopened, id)).toHaveText('Saved');
    await expect(download(reopened, 'nyc-brooklyn')).toHaveText('↓ Download');
    await expect(status(reopened, 'nyc-queens')).toHaveText('Saved');
    await expect(reopened.locator(`[data-refresh-map="${id}"]`)).toBeHidden();
    await reopened.goto(`${base}#/${id}`);
    await expect(reopened.locator('#country-name')).toHaveText(/^Updated /);
    expect(await reopened.locator('#menu-button use').evaluate(el => el.getBBox().width)).toBeGreaterThan(0);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('Saved is prominent; Remove appears on hover, keyboard focus, and touch', async ({ page, isMobile }) => {
  await openHome(page);
  const id = 'nyc-manhattan';
  await download(page, id).click();
  await expect(status(page, id)).toHaveText('Saved');
  await expect(status(page, id).locator('.saved-check')).toBeVisible();
  await page.locator('#home h1').click();
  if (!isMobile) {
    await expect(download(page, id)).toHaveCSS('opacity', '0');
    await page.locator(`#${id}-button`).hover();
    await expect(download(page, id)).toHaveCSS('opacity', '1');
    await page.locator('#home h1').hover();
    await download(page, id).focus();
  }
  await expect(download(page, id)).toHaveCSS('opacity', '1');
  await expect(download(page, id)).toHaveCSS('color', 'rgb(255, 157, 165)');
  await expect(download(page, id)).toHaveCSS('border-top-color', 'rgb(175, 89, 99)');
});
