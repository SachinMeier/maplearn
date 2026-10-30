import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { writeOfflineManifest } from '../scripts/offline-manifest.mjs';
import { maps } from '../maps.js';

test('catalogs are deterministic; only a changed map receives a new content version', async () => {
  const directory = await mkdtemp(`${tmpdir()}/maplearn-catalog-`);
  const root = pathToFileURL(`${directory}/`);
  try {
    const files = ['index.html', 'styles.css', 'sw.js', 'assets/icons.svg', 'assets/globe.svg', 'favicon.ico', 'site.webmanifest',
      ...[16, 32, 48, 180, 192, 512].map(size => `assets/favicons/icon-${size}.png`),
      ...maps.flatMap(map => [map.svg, map.countries, map.svg.replace('.svg', '.manifest.json'), `assets/maps/${map.id}.thumbnail.svg`])];
    for (const file of files) {
      await mkdir(dirname(new URL(file, root).pathname), { recursive: true });
      await writeFile(new URL(file, root), file);
    }
    await writeOfflineManifest(root);
    const first = await readFile(new URL('offline-catalog.json', root), 'utf8');
    const shell = await readFile(new URL('offline-manifest.js', root), 'utf8');
    await writeOfflineManifest(root);
    assert.equal(await readFile(new URL('offline-catalog.json', root), 'utf8'), first);
    assert.equal(await readFile(new URL('offline-manifest.js', root), 'utf8'), shell);
    await writeFile(new URL(maps[0].svg, root), 'changed geometry');
    await writeOfflineManifest(root);
    const before = JSON.parse(first).maps;
    const after = JSON.parse(await readFile(new URL('offline-catalog.json', root), 'utf8')).maps;
    assert.notEqual(after[0].version, before[0].version);
    assert.notEqual(await readFile(new URL('offline-manifest.js', root), 'utf8'), shell);
    assert.deepEqual(after.slice(1), before.slice(1));
    assert.equal(after[0].fileHashes[maps[0].svg.replace(/^\.\//, '')], createHash('sha256').update('changed geometry').digest('hex'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
