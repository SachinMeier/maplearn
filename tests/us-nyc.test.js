import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { maps } from '../maps.js';
import { usNycMaps } from '../us-nyc-maps.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const expected = { 'us-states': 50, 'nyc-manhattan': 64, 'nyc-brooklyn': 77, 'nyc-queens': 97 };
for (const map of usNycMaps) {
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

test('NYC uses distinct colloquial neighborhoods and retains nonresidential context', () => {
  const manhattan = JSON.parse(read('assets/maps/nyc-manhattan.countries.json')).map(r => r.name);
  for (const name of ['SoHo', 'NoHo', 'Nolita', 'West Village', "Hell's Kitchen", 'Murray Hill', 'Marble Hill']) assert(manhattan.includes(name));
  assert(!manhattan.includes('Central Park'));
  for (const name of ['Astor Row Houses', "Striver's Row", 'Tudor City', 'Little Australia']) assert(!manhattan.includes(name));
  const queens = JSON.parse(read('assets/maps/nyc-queens.countries.json')).map(r => r.name);
  assert.equal(queens.filter(n => n === 'Warnerville').length, 1);
  assert(queens.includes('Jamaica Estates'));
  assert(!queens.includes('John F. Kennedy International Airport'));
});
