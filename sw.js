/* Offline downloads are explicit; simply playing a map does not save it. */
importScripts('./offline-manifest.js');
const catalog = self.OFFLINE_MANIFEST;
const prefix = `maplearn:${self.registration.scope}:`;
const shellName = `${prefix}shell:${catalog.version}`;
const absolute = path => new URL(path, self.registration.scope).href;
const mapName = map => `${prefix}map:${map.id}:${map.version}`;
const marker = absolute('__offline_complete__');
const pending = new Map();
const saved = new Map();

async function complete(map, name = mapName(map)) {
  if (!(await caches.has(name))) return false;
  const cache = await caches.open(name);
  return !!(await cache.match(marker)) &&
    (await Promise.all(map.files.map(path => cache.match(absolute(path))))).every(Boolean);
}

async function findSaved(map) {
  const names = [mapName(map), ...(await caches.keys()).filter(name =>
    name.startsWith(`${prefix}map:${map.id}:`) && name !== mapName(map)).reverse()];
  for (const name of names) {
    if (await complete(map, name)) { saved.set(map.id, name); return true; }
  }
  saved.delete(map.id);
  return false;
}

async function saveMap(map, progress = () => {}) {
  if (pending.has(map.id)) return pending.get(map.id);
  const job = (async () => {
    if (await complete(map)) { saved.set(map.id, mapName(map)); return; }
    const name = mapName(map);
    try {
      const cache = await caches.open(name);
      for (const [index, path] of map.files.entries()) {
        progress({ done: index, total: map.files.length });
        const response = await fetch(absolute(path), { cache: 'reload', signal: AbortSignal.timeout(60000) });
        if (!response.ok || response.redirected) throw new Error('A map file could not be downloaded.');
        await cache.put(absolute(path), response);
      }
      await cache.put(marker, new Response('ready'));
      saved.set(map.id, name);
    } catch (error) {
      await caches.delete(name);
      saved.delete(map.id);
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
    // Refresh previously downloaded maps before an update can replace the
    // working offline version. Failed updates leave the active worker intact.
    const names = await caches.keys();
    for (const map of catalog.maps) {
      const previous = names.filter(name => name.startsWith(`${prefix}map:${map.id}:`));
      for (const name of previous) {
        if (await (await caches.open(name)).match(marker)) { await saveMap(map); break; }
      }
    }
  })());
  // No skipWaiting: an update takes over after existing tabs close.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await initialized;
    // A user may download a map while this update is waiting in another tab.
    // Retain that complete copy even if its content version is older.
    await Promise.all(catalog.maps.map(findSaved));
    const keep = new Set([shellName, ...saved.values()]);
    for (const name of await caches.keys()) {
      if (name.startsWith(prefix) && !keep.has(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

// Rebuild the in-memory index whenever the browser restarts the worker.
const initialized = Promise.all(catalog.maps.map(findSaved));
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
      if (action === 'status') {
        const maps = await Promise.all(catalog.maps.map(async map => {
          const ready = await findSaved(map);
          return { id: map.id, bytes: map.bytes, saved: ready };
        }));
        reply({ result: maps });
        return;
      }
      const map = catalog.maps.find(map => map.id === id);
      if (!map) throw new Error('Unknown map.');
      if (action === 'download') {
        await saveMap(map, progress => reply({ progress }));
      } else if (action === 'remove') {
        if (pending.has(id)) await pending.get(id);
        for (const name of await caches.keys()) {
          if (name.startsWith(`${prefix}map:${map.id}:`)) await caches.delete(name);
        }
        saved.delete(id);
      } else throw new Error('Unknown action.');
      reply({ result: { saved: saved.has(id) } });
    } catch (error) {
      reply({ error: error.name === 'QuotaExceededError'
        ? 'Not enough storage. Remove a download and try again.'
        : 'Download unavailable. Check your connection and try again.' });
    }
  })());
});
