import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { maps } from '../maps.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const manifest = JSON.parse(read('assets/maps/europe-rivers.manifest.json'));
const roster = JSON.parse(read('assets/maps/europe-rivers.countries.json'));
const svg = read('assets/maps/europe-rivers.svg').toString();

test('European Rivers has 31 river targets in Other and reproducible public-domain sources', () => {
  const map = maps.find(m => m.id === 'europe-rivers');
  assert.equal(map.category, 'other');
  assert.equal(map.unit, 'river');
  assert.equal(map.microstates, false);
  assert.equal(roster.length, 31);
  const codes = [...svg.matchAll(/data-country="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(codes, roster.map(r => r.code));
  assert.equal(new Set(codes).size, 31);
  for (const s of manifest.sources) {
    assert.equal(createHash('sha256').update(gunzipSync(read(s.file))).digest('hex'), s.sha256);
  }
  assert(!svg.includes('NaN'));
  assert(!svg.includes('data-wrap-width'));
  assert(!svg.includes('data-context="ISL"'));
  assert(svg.includes('data-context="IRL"'));
  assert(svg.includes('data-context="RUS"'));
  assert.match(roster.find(r => r.code === 'volga').name, /upper course/);
});

test('rivers are open strokes with matching tap geometry, and Europe is north-up', () => {
  for (const [, code, content] of svg.matchAll(/<g data-country="([^"]+)"[^>]*>(.*?)<\/g>/g)) {
    const hit = content.match(/class="river-hit" d="([^"]+)"/)[1];
    const visible = content.match(/class="river-line" d="([^"]+)"/)[1];
    assert.equal(hit, visible);
    assert(!visible.includes('Z'), `${code} must not close into a polygon`);
    assert(manifest.regions[code].vertices > 10);
    const [x, y, w, h] = manifest.regions[code].focusBox;
    assert(x >= 0 && y >= 0 && w > 0 && h > 0);
    assert(x + w <= manifest.viewBox[2] && y + h <= manifest.viewBox[3]);
  }
  const r = manifest.regions;
  assert(r.kemijoki.anchor[1] < r.danube.anchor[1]);
  assert(r.thames.anchor[1] < r.tagus.anchor[1]);
  assert(r.shannon.anchor[0] < r.volga.anchor[0]);
  assert(r.danube.focusBox[2] > r.thames.focusBox[2]);
});
