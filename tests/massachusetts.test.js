import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { maps } from '../maps.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const svg = read('assets/maps/massachusetts-towns.svg');
const manifest = JSON.parse(read('assets/maps/massachusetts-towns.manifest.json'));
const roster = JSON.parse(read('assets/maps/massachusetts-towns.countries.json'));

test('Massachusetts includes the requested towns and one circle per playable municipality', () => {
  const map = maps.filter(m => m.id === 'massachusetts-towns');
  assert.equal(map.length, 1);
  assert.equal(map[0].microstates, false);
  assert.equal(roster.length, 64);
  for (const name of ['Milton', 'Braintree', 'Norfolk', 'Wellesley', 'Lexington', 'Concord', 'Hull']) {
    assert(roster.some(t => t.name === name), `Missing ${name}`);
  }
  assert.deepEqual([...svg.matchAll(/data-country="([^"]+)"/g)].map(m => m[1]).sort(), roster.map(t => t.code).sort());
  assert.equal([...svg.matchAll(/<circle class="hit-area"/g)].length, 64);
  assert(roster.every(t => !t.microstate));
  assert(!/<text\b|NaN|data-wrap-width/.test(svg));
  assert(svg.includes('stroke-dasharray:3 3'));
});

test('town circles have a uniform radius and remain centered on their source locations', () => {
  const towns = Object.values(manifest.regions);
  const [west, , , north] = manifest.geographicBounds;
  for (const a of towns) {
    const [lon, lat] = a.coordinates;
    assert(lon >= -73.51 && lon <= -69.9 && lat >= 41.2 && lat <= 42.9);
    const expected = [(lon - west) * Math.cos(42.2 * Math.PI / 180) * 470, (north - lat) * 470];
    assert(Math.hypot(a.anchor[0] - expected[0], a.anchor[1] - expected[1]) < .001);
    assert.equal(a.radius, 12);
    assert(a.focusBox.every(Number.isFinite));
  }
  assert(manifest.regions['MA-CONCORD'].coordinates[1] < 42.5, 'Concord must be in MA, not NH');
});

test('archived geographic sources match checksums', () => {
  for (const s of Object.values(manifest.sources)) {
    const raw = gunzipSync(readFileSync(new URL('../' + s.file, import.meta.url)));
    assert.equal(createHash('sha256').update(raw).digest('hex'), s.sha256);
  }
});
