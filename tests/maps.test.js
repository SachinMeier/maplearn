import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import clipping from 'polygon-clipping';
import { bounds } from '../scripts/hit-areas.mjs';
import { project, worldHeight } from '../scripts/projection.mjs';

const svg = readFileSync(new URL('../assets/maps/world.svg', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../assets/maps/world.manifest.json', import.meta.url)));
const countries = JSON.parse(readFileSync(new URL('../data/countries.json', import.meta.url)));

test('world asset covers the canonical roster with real polygons and the original filter flags', () => {
  const codes = [...svg.matchAll(/<g data-country="([A-Z]{2})"/g)].map(m => m[1]);
  assert.deepEqual(codes.sort(), countries.map(c => c.code).sort());
  for (const c of countries) {
    assert.equal(manifest.countries[c.code].microstate, c.microstate);
    assert(manifest.countries[c.code].polygons > 0);
    assert(manifest.countries[c.code].focusBox.every(Number.isFinite));
  }
  assert(!svg.includes('data-placeholder'));
  assert(!/<(?:script|image|use|text)\b/.test(svg));
  assert(svg.includes('stroke:none!important'));
});

test('every geographic edge is drawn exactly once and uses the exact fill coordinates', () => {
  const edges = new Map();
  const add = (a, b, kind) => {
    if (a === b) return;
    const key = a < b ? `${a} ${b}` : `${b} ${a}`;
    if (!edges.has(key)) edges.set(key, [0, 0]);
    edges.get(key)[kind]++;
  };
  for (const match of svg.matchAll(/<path class="(region-fill|context-land|border-mesh)"[^>]* d="([^"]+)"/g)) {
    let start, previous;
    const kind = match[1] === 'border-mesh' ? 1 : 0;
    for (const command of match[2].matchAll(/([MLZ])([\d.,-]*)/g)) {
      if (command[1] === 'M') start = previous = command[2];
      else if (command[1] === 'L') { add(previous, command[2], kind); previous = command[2]; }
      else add(previous, start, kind);
    }
  }
  let shared = 0;
  assert(edges.size > 400000, 'Retain the detailed source geometry');
  for (const [key, [fills, strokes]] of edges) {
    assert(fills === 1 || fills === 2, `Invalid fill adjacency at ${key}: ${fills}`);
    const [a, b] = key.split(' ').map(p => p.split(',').map(Number));
    const seam = a[0] === b[0] && (a[0] === 0 || a[0] === manifest.wrapWidth);
    const polarCut = a[1] === b[1] && (a[1] === 0 || a[1] === manifest.viewBox[3]);
    assert.equal(strokes, seam || polarCut ? 0 : 1, `Missing, doubled, or artificial cut border at ${key}`);
    if (fills === 2) shared++;
  }
  assert(shared > 50000, 'Adjacent countries must share exact boundary segments');
});

test('rectangular world has matching date-line cuts and no hit targets outside the repeat tile', () => {
  assert.equal(manifest.projection, 'Miller cylindrical');
  assert.deepEqual(manifest.viewBox, [0, 0, 3600, worldHeight]);
  assert.equal(manifest.wrapWidth, 3600);
  assert(svg.includes('data-wrap-width="3600"'));
  // Match cut segments by latitude and country across the two tile edges.
  const left = [], right = [];
  for (const match of svg.matchAll(/<g data-country="([A-Z]{2})"[^>]*>(.*?)<\/g>/g)) {
    const path = match[2].match(/<path class="region-fill" d="([^"]+)"/)[1];
    for (const ring of path.split('Z').filter(Boolean)) {
      const points = ring.slice(1).split('L').map(p => p.split(',').map(Number));
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (a[0] !== b[0] || a[1] === b[1]) continue;
        const key = `${match[1]}:${Math.min(a[1], b[1])}:${Math.max(a[1], b[1])}`;
        if (a[0] === 0) left.push(key);
        if (a[0] === 3600) right.push(key);
      }
    }
  }
  assert(left.length > 0);
  const mergeIntervals = values => {
    const merged = [];
    const intervals = values.map(value => { const [code, low, high] = value.split(':'); return [code, +low, +high]; });
    intervals.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
    for (const interval of intervals) {
      const previous = merged.at(-1);
      if (previous && previous[0] === interval[0] && previous[2] === interval[1]) previous[2] = interval[2];
      else merged.push(interval);
    }
    return merged;
  };
  assert.deepEqual(mergeIntervals(left), mergeIntervals(right));
  for (const c of Object.values(manifest.countries)) for (const p of c.hitArea?.polygons ?? []) for (const ring of p) for (const [x, y] of ring) {
    assert(x >= 0 && x <= 3600 && y >= 0 && y <= worldHeight);
  }
  for (const code of ['LB', 'PS', 'CY', 'QA', 'TL', 'XK']) assert.equal(manifest.countries[code].hitArea, null);
});

test('Miller includes both poles and moderates Mercator vertical stretching', () => {
  assert.deepEqual(project([0, 0]), [1800, worldHeight / 2]);
  assert(Math.abs(project([-180, 90])[1]) < .001);
  assert(Math.abs(project([180, -90])[1] - worldHeight) < .001);
  assert(worldHeight > 1800 && worldHeight < 3600);
  for (const latitude of [30, 60, 80]) {
    const height = worldHeight / 2 - project([0, latitude])[1];
    const mercator = 1800 / Math.PI * Math.asinh(Math.tan(latitude * Math.PI / 180));
    assert(height > latitude * 10 && height < mercator);
    assert(Math.abs(project([0, -latitude])[1] - worldHeight / 2 - height) < 1e-9);
  }
});

const polygonArea = polygons => polygons.reduce((total, polygon) => total + polygon.reduce((sum, ring, i) => {
  const area = Math.abs(ring.reduce((a, p, j) => {
    const q = ring[(j + 1) % ring.length]; return a + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2);
  return sum + (i ? -area : area);
}, 0), 0);

test('padded hit outlines do not overlap one another', () => {
  const hits = Object.entries(manifest.countries).filter(([, c]) => c.hitArea);
  const boxes = hits.map(([, c]) => bounds(c.hitArea.polygons.flatMap(p => p[0])));
  for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) {
    const [a, ca] = hits[i], [b, cb] = hits[j];
    const x = boxes[i], y = boxes[j];
    if (x[0] > y[0] + y[2] || y[0] > x[0] + x[2] || x[1] > y[1] + y[3] || y[1] > x[1] + x[3]) continue;
    assert(polygonArea(clipping.intersection(ca.hitArea.polygons, cb.hitArea.polygons)) < 1e-7, `${a} and ${b} overlap`);
  }
  for (const code of ['VA', 'MC', 'SG', 'AD']) assert(manifest.countries[code].hitArea);
});

test('each padded outline encloses all land, including both ends of long island chains', () => {
  for (const match of svg.matchAll(/<g data-country="([A-Z]{2})"[^>]*>(.*?)<\/g>/g)) {
    const code = match[1], hit = manifest.countries[code].hitArea;
    if (!hit) continue;
    const path = match[2].match(/<path class="region-fill" d="([^"]+)"/)[1];
    const rings = path.split('Z').filter(Boolean).map(ring => ring.slice(1).split('L').map(point => point.split(',').map(Number)));
    for (const ring of rings) {
      assert(polygonArea(clipping.difference([ring], hit.polygons)) < 1e-6, `Uncovered land in ${code}`);
    }
  }
  for (const code of ['MV', 'BS', 'GM', 'NC']) {
    const hit = manifest.countries[code].hitArea;
    assert.equal(hit.type, 'outline');
    assert.equal(hit.polygons.length, 1, `${code} should have one continuous outline`);
  }
});

test('the archived source matches its recorded checksum', () => {
  const source = gunzipSync(readFileSync(new URL(`../${manifest.source.file}`, import.meta.url)));
  assert.equal(createHash('sha256').update(source).digest('hex'), manifest.source.sha256);
});
