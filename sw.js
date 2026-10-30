/* Offline map downloads and refreshes are explicit. */
importScripts('./offline-manifest.js');
const catalog = self.OFFLINE_MANIFEST;
const prefix = `maplearn:${self.registration.scope}:`;
const shellName = `${prefix}shell:${catalog.version}`;
const absolute = path => new URL(path, self.registration.scope).href;
const mapName = map => `${prefix}map:${map.id}:${map.version}`;
const marker = absolute('__offline_complete__');
const catalogMarker = absolute('__offline_catalog__');
const pending = new Map();
const saved = new Map();
const available = new Map(catalog.maps.map(map => [map.id, map]));
let checking, lastCheck = 0;

function acceptCatalog(remote) {
  for (const map of remote.maps ?? []) {
    const known = catalog.maps.find(entry => entry.id === map.id);
    // Updates may replace bytes, never add arbitrary URLs to this worker's cache.
    if (!known || JSON.stringify(map.files) !== JSON.stringify(known.files) ||
        !/^[a-f0-9]{20}$/.test(map.version) || !Number.isFinite(map.bytes) ||
        !map.files.every(path => /^[a-f0-9]{64}$/.test(map.fileHashes?.[path]))) continue;
    available.set(map.id, map);
  }
}

async function complete(map, name = mapName(map)) {
  if (!(await caches.has(name))) return false;
  const cache = await caches.open(name);
  return !!(await cache.match(marker)) &&
    (await Promise.all(map.files.map(path => cache.match(absolute(path))))).every(Boolean);
}

async function findSaved(map) {
  const names = (await caches.keys()).filter(name => name.startsWith(`${prefix}map:${map.id}:`));
  const candidates = [];
  for (const name of names) {
    if (!(await complete(map, name))) continue;
    const response = await (await caches.open(name)).match(marker);
    let savedAt = 0;
    try { savedAt = (await response.json()).savedAt || 0; } catch { /* Legacy 'ready' marker. */ }
    candidates.push({ name, savedAt });
  }
  // Most recently saved wins, including after a worker restart or shell update.
  // Prefer the current version when migrating legacy markers without timestamps.
  candidates.sort((a, b) => b.savedAt - a.savedAt ||
    Number(b.name === mapName(available.get(map.id))) - Number(a.name === mapName(available.get(map.id))));
  if (candidates.length) { saved.set(map.id, candidates[0].name); return true; }
  saved.delete(map.id);
  return false;
}

async function checkCatalog(force = false) {
  if (checking) return checking;
  if (!force && Date.now() - lastCheck < 60000) return;
  lastCheck = Date.now();
  checking = (async () => {
    try {
      const response = await fetch(absolute('offline-catalog.json'), { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok || response.redirected) return;
      acceptCatalog(await response.json());
      // Remember known updates when the worker restarts or the connection drops.
      await (await caches.open(shellName)).put(catalogMarker,
        new Response(JSON.stringify({ maps: [...available.values()] })));
    } catch { /* An unavailable server must not hide or invalidate saved maps. */ }
  })();
  try { await checking; } finally { checking = null; }
}

async function status(map) {
  const ready = await findSaved(map);
  const latest = available.get(map.id);
  return { id: map.id, bytes: latest.bytes, saved: ready,
    updateAvailable: ready && saved.get(map.id) !== mapName(latest) };
}

async function notifyClients(id) {
  for (const client of await self.clients.matchAll()) client.postMessage({ type: 'offline-map-changed', id });
}

async function saveMap(map, progress = () => {}) {
  if (pending.has(map.id)) return pending.get(map.id);
  const job = (async () => {
    const name = mapName(map);
    if (await complete(map)) {
      await (await caches.open(name)).put(marker, new Response(JSON.stringify({ savedAt: Date.now() })));
      saved.set(map.id, name);
      await notifyClients(map.id);
      return;
    }
    try {
      const cache = await caches.open(name);
      for (const [index, path] of map.files.entries()) {
        progress({ done: index, total: map.files.length });
        const url = new URL(absolute(path));
        url.searchParams.set('v', map.fileHashes[path]);
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
        if (!response.ok || response.redirected) throw new Error('A map file could not be downloaded.');
        const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
        const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (hash !== map.fileHashes[path]) throw new Error('Map files changed during download.');
        await cache.put(absolute(path), response);
      }
      // Commit only a complete, validated bundle. Keep the previous copy on failure.
      await cache.put(marker, new Response(JSON.stringify({ savedAt: Date.now() })));
      saved.set(map.id, name);
      await notifyClients(map.id);
    } catch (error) {
      await caches.delete(name);
      await findSaved(map);
      throw error;
    }
  })();
  pending.set(map.id, job);
  try { await job; } finally { pending.delete(map.id); }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(shellName);
    await shell.addAll(catalog.shell.map(path => new Request(absolute(path), { cache: 'reload' })));
  })());
  // Interface updates take over after existing tabs close. Maps refresh on request.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await initialized;
    await Promise.all(catalog.maps.map(findSaved));
    const keep = new Set([shellName, ...saved.values()]);
    for (const name of await caches.keys()) {
      if (name.startsWith(prefix) && !keep.has(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

const initialized = (async () => {
  const response = await (await caches.open(shellName)).match(catalogMarker);
  if (response) { try { acceptCatalog(await response.json()); } catch { /* Ignore invalid metadata. */ } }
  await Promise.all(catalog.maps.map(findSaved));
})();
const shellURLs = new Set(catalog.shell.map(absolute));
const mapURLs = new Map(catalog.maps.flatMap(map => map.files.map(path => [absolute(path), map])));

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const home = url.origin === new URL(self.registration.scope).origin &&
    [new URL(self.registration.scope).pathname, new URL(absolute('index.html')).pathname].includes(url.pathname);
  if ((request.mode === 'navigate' && home) || shellURLs.has(request.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(shellName);
      return await cache.match(home && request.mode === 'navigate' ? absolute('index.html') : request) || fetch(request);
    })());
    return;
  }
  const map = mapURLs.get(request.url);
  if (map) {
    event.respondWith((async () => {
      await initialized;
      if (saved.has(map.id)) {
        const cache = await caches.open(saved.get(map.id));
        const response = await cache.match(request);
        if (response) return response;
        saved.delete(map.id);
      }
      return fetch(request);
    })());
  }
});

self.addEventListener('message', event => {
  const port = event.ports[0];
  if (!port) return;
  const reply = data => port.postMessage(data);
  event.waitUntil((async () => {
    try {
      await initialized;
      const { action, id } = event.data ?? {};
      if (action === 'status' || action === 'check') {
        if (action === 'check') await checkCatalog();
        reply({ result: await Promise.all(catalog.maps.map(status)) });
        return;
      }
      const known = catalog.maps.find(map => map.id === id);
      if (!known) throw new Error('Unknown map.');
      if (action === 'download' || action === 'refresh') {
        await checkCatalog(true);
        await saveMap(available.get(id), progress => reply({ progress }));
      } else if (action === 'remove') {
        if (pending.has(id)) { try { await pending.get(id); } catch { /* Remove the remaining saved copy. */ } }
        for (const name of await caches.keys()) {
          if (name.startsWith(`${prefix}map:${id}:`)) await caches.delete(name);
        }
        saved.delete(id);
        await notifyClients(id);
      } else throw new Error('Unknown action.');
      reply({ result: await status(known) });
    } catch (error) {
      reply({ error: error.name === 'QuotaExceededError'
        ? 'Not enough storage. Remove a download and try again.'
        : 'Download unavailable. Check your connection and try again.' });
    }
  })());
});
