import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { maps } from '../maps.js';


const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const expected = { 'chinese-provinces': 33 };
for (const map of maps.filter(m => m.id === 'chinese-provinces')) {
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


test('China has exactly 33 province-level divisions, excluding Taiwan, and disjoint small targets', () => {
  const roster = JSON.parse(read('assets/maps/chinese-provinces.countries.json'));
  const manifest = JSON.parse(read('assets/maps/chinese-provinces.manifest.json'));
  const svg = read('assets/maps/chinese-provinces.svg');
  const expected = {
    province: ['Anhui', 'Fujian', 'Gansu', 'Guangdong', 'Guizhou', 'Hainan', 'Hebei',
      'Heilongjiang', 'Henan', 'Hubei', 'Hunan', 'Jiangsu', 'Jiangxi', 'Jilin', 'Liaoning',
      'Qinghai', 'Shaanxi', 'Shandong', 'Shanxi', 'Sichuan', 'Yunnan', 'Zhejiang'],
    'autonomous region': ['Guangxi', 'Inner Mongolia', 'Ningxia', 'Tibet', 'Xinjiang'],
    municipality: ['Beijing', 'Chongqing', 'Shanghai', 'Tianjin'],
    'special administrative region': ['Hong Kong', 'Macao'],
  };
  for (const [kind, names] of Object.entries(expected)) {
    assert.deepEqual(roster.filter(r => r.kind === kind).map(r => r.name).sort(), names.sort());
  }
  assert.equal(roster.length, 33);
  assert(!roster.some(r => /Taiwan|TW/i.test(r.name + r.code)));
  const source = JSON.parse(gunzipSync(readFileSync(new URL('../' + manifest.source.file, import.meta.url))));
  assert(source.features.every(f => ['CHN', 'HKG', 'MAC'].includes(f.properties.adm0_a3)));
  assert(!/<(?:text|image|script)\b/.test(svg));
  const small = Object.values(manifest.regions).filter(r => r.hitArea);
  assert.equal(small.length, 5);
  for (const r of small) {
    assert.deepEqual(r.hitArea.center, r.anchor);
    assert(r.hitArea.radius > 0 && r.hitArea.radius <= 12);
    for (const other of small) if (r !== other) {
      assert(Math.hypot(r.anchor[0] - other.anchor[0], r.anchor[1] - other.anchor[1]) >
        r.hitArea.radius + other.hitArea.radius, 'Click circles must not overlap');
    }
  }
  assert(manifest.stats.vertices > 30000, 'Keep detailed source geometry');
});
