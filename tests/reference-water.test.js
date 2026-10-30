import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { project } from '../scripts/projection.mjs';
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const json = name => JSON.parse(read(name));

test('reference rivers, lakes and context stay separate from quiz answers', () => {
  const expected = {
    'north-america': ['Ohio', 'Mississippi', 'Missouri', 'Snake', 'Rio Grande', 'Red River', 'Savannah', 'Balsas', 'Santiago'],
    'south-america': ['Amazon', 'Ucayali', 'Marañón', 'Rio Negro', 'Madeira', 'Tapajós', 'Xingu'],
    asia: ['Yangtze', 'Yellow', 'Pearl (Xi)', 'Ganges', 'Indus', 'Mekong'],
    'massachusetts-towns': ['Charles River', 'Neponset River', 'Connecticut River', 'Housatonic River', 'Merrimack River'],
  };
  for (const [id, rivers] of Object.entries(expected)) {
    const svg = read(`assets/maps/${id}.svg`);
    for (const name of rivers) assert(svg.includes(`data-river="${name}"`), name);
    assert(svg.includes('class="reference-water" aria-hidden="true" pointer-events="none"'));
  }
  const svg = read('assets/maps/north-america.svg');
  const snake = svg.match(/data-river="Snake" d="([^"]+)"/)[1];
  const snakePoints = [...snake.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(m => [+m[1], +m[2]]);
  assert(snakePoints.length > 500, 'Snake includes its river course, not only lake centerlines');
  assert(Math.min(...snakePoints.map(p => p[0])) < project([-119, 0])[0], 'Snake reaches its Columbia confluence');
  assert(snakePoints.every(p => p[1] > project([0, 47])[1]), 'Exclude the unrelated Canadian Snake River');
  for (const name of ['Superior', 'Michigan', 'Huron', 'Erie', 'Ontario']) assert(svg.includes(`data-lake="${name}"`));
  for (const code of ['CO', 'VE', 'GY', 'SR', 'GF', 'BR']) {
    assert(svg.includes(`data-context="${code}"`));
    assert(!svg.includes(`data-country="${code}"`));
  }
});

test('every continental country exists on the world map; questioned borders retain source vertices', () => {
  const world = read('assets/maps/world.svg'), asia = read('assets/maps/asia.svg');
  const worldCodes = new Set([...world.matchAll(/data-country="([A-Z]{2})"/g)].map(m => m[1]));
  for (const { codes } of json('data/regions.json')) for (const code of codes) assert(worldCodes.has(code), code);
  const manifest = json('assets/maps/world.manifest.json');
  const raw = gunzipSync(readFileSync(new URL(`../${manifest.source.file}`, import.meta.url)));
  assert.equal(createHash('sha256').update(raw).digest('hex'), manifest.source.sha256);
  const features = JSON.parse(raw).features;
  for (const code of ['TJ', 'SY', 'JO']) {
    const fill = svg => svg.match(new RegExp(`<g data-country="${code}"[^>]*>(.*?)</g>`))[1].match(/class="region-fill" d="([^"]+)"/)[1];
    const points = svg => new Set([...fill(svg).matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(m => `${+m[1]},${+m[2]}`));
    const worldPoints = points(world);
    assert.deepEqual(points(asia), worldPoints, `${code}: Asia does not distort or omit world vertices`);
    for (const f of features.filter(f => f.properties.ISO_A2_EH === code)) {
      const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const point of polygons.flat(2)) {
        const key = project(point).map(n => +n.toFixed(3)).join(',');
        assert(worldPoints.has(key), `${code}: missing source vertex ${key}`);
      }
    }
  }
});
