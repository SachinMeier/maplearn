import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { maps } from '../maps.js';
import { project } from '../scripts/projection.mjs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const json = name => JSON.parse(read(name));
const canonical = json('data/countries.json');
const definitions = json('data/regions.json');
const world = read('assets/maps/world.svg');
const worldHash = createHash('sha256').update(world).digest('hex');
const group = (svg, code) => svg.match(new RegExp(`<g data-country="${code}"[^>]*>(.*?)</g>`))[1];
const land = (svg, code) => group(svg, code).match(/class="region-fill" d="([^"]+)"/)[1];

for (const definition of definitions) test(`${definition.name}: roster, finite frame, source fidelity, and unique borders`, () => {
  const { id, codes } = definition;
  const svg = read(`assets/maps/${id}.svg`), manifest = json(`assets/maps/${id}.manifest.json`);
  const roster = json(`assets/maps/${id}.countries.json`);
  assert(maps.some(m => m.id === id));
  assert.deepEqual(roster, canonical.filter(c => codes.includes(c.code)));
  assert.deepEqual([...svg.matchAll(/data-country="([A-Z]{2})"/g)].map(m => m[1]).sort(), codes);
  assert.equal(manifest.source.sha256, worldHash);
  assert(!svg.includes('data-wrap-width'));
  assert(!/<(?:use|image|script)\b/.test(svg));
  const [x, y, w, h] = manifest.viewBox;
  for (const match of svg.matchAll(/ d="([^"]+)"/g)) for (const point of match[1].matchAll(/[ML]([\d.-]+),([\d.-]+)/g)) {
    const px = +point[1], py = +point[2];
    assert(px >= x - .00001 && px <= x + w + .00001 && py >= y - .00001 && py <= y + h + .00001, `${id}: geometry outside frame`);
  }
  const segments = new Set();
  for (const match of svg.matchAll(/data-border-owners="([^"]+)" d="([^"]+)"/g)) {
    assert(match[1].split(' ').every(code => codes.includes(code)));
    let previous;
    for (const [, command, p] of match[2].matchAll(/([ML])([\d.,-]+)/g)) {
      if (command === 'L' && p !== previous) {
        const key = [previous, p].sort().join(' ');
        assert(!segments.has(key), `${id}: doubled border ${key}`);
        segments.add(key);
      }
      previous = p;
    }
  }
  assert(segments.size > 10000, 'Detailed world coastlines retained');
  for (const c of Object.values(manifest.countries)) {
    assert(c.polygons > 0);
    assert(c.focusBox.every(Number.isFinite));
    assert(c.anchor[0] >= x && c.anchor[0] <= x + w);
    assert(c.anchor[1] >= y && c.anchor[1] <= y + h);
  }
});

test('Oceania covers the Pacific across the date line without excluded islands', () => {
  const codes = definitions.find(m => m.id === 'oceania').codes;
  for (const code of ['ID', 'TL', 'PF', 'PN', 'KI', 'FJ', 'AS', 'WS', 'GU', 'MP', 'UM', 'CK', 'NU', 'TK', 'WF', 'MH', 'FM', 'PW']) assert(codes.includes(code), code);
  for (const code of ['US', 'TW', 'CX', 'CC', 'AQ', 'BV', 'HM', 'TF']) assert(!codes.includes(code), code);
  const svg = read('assets/maps/oceania.svg');
  for (const code of ['PF', 'PN', 'KI', 'FJ', 'NZ']) {
    assert.equal(land(svg, code).match(/M/g).length, land(world, code).match(/M/g).length, `All ${code} island rings retained`);
    assert.equal(land(svg, code).match(/L/g).length, land(world, code).match(/L/g).length, `All ${code} coastline vertices retained`);
  }
  const manifest = json('assets/maps/oceania.manifest.json');
  assert(manifest.countries.PN.anchor[0] > 3600, 'Pitcairn is east of the date line in one continuous Pacific view');
});

test('Asia retains all Russia geometry; Europe cuts it at the Urals', () => {
  const asia = read('assets/maps/asia.svg'), europe = read('assets/maps/europe.svg');
  assert.equal(land(asia, 'RU').match(/L/g).length, land(world, 'RU').match(/L/g).length);
  assert.equal(land(asia, 'RU').match(/M/g).length, land(world, 'RU').match(/M/g).length);
  const xs = [...land(europe, 'RU').matchAll(/[ML]([\d.-]+),/g)].map(m => +m[1]);
  assert(Math.max(...xs) <= project([70, 0])[0]);
  assert(land(europe, 'RU').length < land(asia, 'RU').length / 2);
});
