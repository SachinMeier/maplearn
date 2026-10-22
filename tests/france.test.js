import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { maps } from '../maps.js';


const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const expected = { 'french-departments': 101 };
for (const map of maps.filter(m => m.id === 'french-departments')) {
  const svg = read(`assets/maps/${map.id}.svg`);
  const roster = JSON.parse(read(`assets/maps/${map.id}.countries.json`));
  const manifest = JSON.parse(read(`assets/maps/${map.id}.manifest.json`));
  test(`${map.id}: correct roster, reproducible source, and unique menu option`, () => {
    assert.equal(roster.length, expected[map.id]);
    assert.equal(maps.filter(m => m.id === map.id).length, 1);
    assert.equal(map.microstates, false);
    assert(roster.every(r => r.microstate === false));
    const ids = [...svg.matchAll(/data-country="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(ids.sort(), roster.map(r => r.code).sort());
    assert.equal(new Set(ids).size, ids.length);
    assert(!svg.includes('data-wrap-width'));
    assert(!svg.includes('NaN'));
    assert(svg.includes('stroke:none!important'));
    for (const r of roster) {
      const region = manifest.regions[r.code];
      assert(region.playable && region.polygons > 0);
      assert(region.anchor.every(Number.isFinite));
      assert(region.focusBox.every(Number.isFinite));
    }
    const raw = gunzipSync(readFileSync(new URL('../' + manifest.source.file, import.meta.url)));
    assert.equal(createHash('sha256').update(raw).digest('hex'), manifest.source.sha256);
  });
  test(`${map.id}: every fill edge has exactly one matching border stroke`, () => {
    const edges = new Map();
    const add = (a, b, kind) => {
      if (a === b) return;
      const key = [a, b].sort().join(' ');
      if (!edges.has(key)) edges.set(key, [0, 0]);
      edges.get(key)[kind]++;
    };
    for (const m of svg.matchAll(/<path class="(region-fill|context-land|border-mesh)"[^>]* d="([^"]+)"/g)) {
      let start, prev;
      const kind = m[1] === 'border-mesh' ? 1 : 0;
      for (const c of m[2].matchAll(/([MLZ])([\d.,-]*)/g)) {
        if (c[1] === 'M') start = prev = c[2];
        else if (c[1] === 'L') { add(prev, c[2], kind); prev = c[2]; }
        else add(prev, start, kind);
      }
    }
    let shared = 0;
    for (const [key, [fills, borders]] of edges) {
      assert(fills === 1 || fills === 2, `Invalid adjacency at ${key}: ${fills}`);
      assert.equal(borders, 1, `Doubled/missing border at ${key}`);
      if (fills === 2) shared++;
    }
    assert(shared > 100, 'Neighbors must share geographic segments');
  });
}

test('French roster and unlabeled overseas frames retain all departments and exclude collectivities', () => {
  const roster = JSON.parse(read('assets/maps/french-departments.countries.json'));
  const manifest = JSON.parse(read('assets/maps/french-departments.manifest.json'));
  const svg = read('assets/maps/french-departments.svg');
  const expected = [...Array.from({ length: 95 }, (_, i) => String(i + 1).padStart(2, '0')).filter(c => c !== '20'), '2A', '2B', '971', '972', '973', '974', '976'];
  assert.deepEqual(roster.map(r => r.code).sort(), expected.sort());
  assert(!/<text\b/.test(svg), 'No visible labels or inset copy');
  assert.equal((svg.match(/<rect class="inset-frame"/g) ?? []).length, 5);
  for (const { code, frame: [x, y, w, h] } of manifest.insets) {
    const [left, top, width, height] = manifest.regions[code].focusBox;
    assert(left > x && top > y && left + width < x + w && top + height < y + h);
  }
});

test('French hydrography has seven sourced, noninteractive river paths and pinned water geometry', () => {
  const svg = read('assets/maps/french-departments.svg');
  const { hydrography } = JSON.parse(read('assets/maps/french-departments.manifest.json'));
  assert.deepEqual([...svg.matchAll(/data-river="([^"]+)"/g)].map(m => m[1]),
    ['Somme', 'Marne', 'Loire', 'Seine', 'Rhône', 'Garonne', 'Dordogne']);
  assert.match(svg, /class="rivers"[^>]*clip-path="url\(#france-river-clip\)"[^>]*pointer-events="none"/);
  assert.equal((svg.match(/<use href="#france-land-/g) ?? []).length, 96);
  for (const s of hydrography.sources) {
    const raw = gunzipSync(readFileSync(new URL('../' + s.file, import.meta.url)));
    assert.equal(createHash('sha256').update(raw).digest('hex'), s.sha256);
    assert(JSON.parse(raw).features.length > 0);
  }
});
