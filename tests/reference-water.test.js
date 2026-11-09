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
    'north-america': ['Ohio', 'Mississippi', 'Missouri', 'Snake', 'Rio Grande', 'Red River', 'Hudson', 'Savannah', 'Balsas', 'Santiago',
      'Yukon', 'Mackenzie', 'Slave', 'Peace', 'Fraser', 'Columbia', 'North Saskatchewan',
      'South Saskatchewan', 'Saskatchewan', 'Nelson', 'Severn', 'Albany', 'Great Whale',
      'La Grande', 'Ottawa', 'St. Lawrence'],
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


test('Canadian reference rivers retain their complete source courses without namesakes', () => {
  const ids = { Yukon: 53, Mackenzie: 34, Slave: 39, Peace: 33, Fraser: 187,
    Columbia: 64, 'North Saskatchewan': 117, 'South Saskatchewan': 266,
    Saskatchewan: 112, Nelson: 275, Severn: 378, Albany: 243,
    'Great Whale': 591, 'La Grande': 109, Ottawa: 206, 'St. Lawrence': 23 };
  const source = JSON.parse(gunzipSync(readFileSync(new URL('../assets/maps/sources/ne_10m_rivers_lake_centerlines.v5.1.2.geojson.gz', import.meta.url))));
  const svg = read('assets/maps/north-america.svg');
  const paths = new Map([...svg.matchAll(/data-river="([^"]+)" d="([^"]+)"/g)].map(m => [m[1], m[2]]));
  for (const [name, id] of Object.entries(ids)) {
    const expected = new Set(source.features.filter(f => f.properties.rivernum === id)
      .flatMap(f => f.geometry.coordinates.flat())
      .map(p => project(p).map(n => +n.toFixed(6)).join(',')));
    assert(expected.size > 10, `${name}: source course exists`);
    const actual = new Set([...paths.get(name).matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(m => `${+m[1]},${+m[2]}`));
    assert.deepEqual(actual, expected, `${name}: preserve every river and lake-centerline vertex`);
  }
});

for (const [id, names] of Object.entries({
  'chinese-provinces': ['Yangtze', 'Yellow', 'Pearl', 'Heilongjiang (Amur)', 'Songhua', 'Tarim'],
  'indian-states': ['Ganges', 'Brahmaputra', 'Indus', 'Godavari', 'Krishna', 'Narmada'],
})) test(`${id}: six reference rivers use the existing frame and remain separate from quiz regions`, () => {
  const svg = read(`assets/maps/${id}.svg`);
  const thumbnail = read(`assets/maps/${id}.thumbnail.svg`);
  const manifest = json(`assets/maps/${id}.manifest.json`);
  assert.deepEqual(manifest.referenceWater.rivers, names);
  assert(manifest.referenceWater.clippedToLand);
  assert(svg.includes('class="reference-water" aria-hidden="true" pointer-events="none"'));
  assert(!svg.includes('<clipPath'), 'Clipping is computed offline, not on every camera movement');
  const paths = [...svg.matchAll(/data-river="([^"]+)" d="([^"]+)"/g)];
  assert.deepEqual(paths.map(m => m[1]), names);
  const [x, y, w, h] = manifest.viewBox;
  for (const [, name, d] of paths) {
    assert(thumbnail.includes(`data-river="${name}"`));
    const points = [...d.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)];
    assert(points.length > 50, `${name}: detailed geographic course`);
    for (const [, px, py] of points) assert(+px >= x && +px <= x + w && +py >= y && +py <= y + h);
  }
  for (const source of manifest.referenceWater.sources) {
    const raw = gunzipSync(readFileSync(new URL(`../${source.file}`, import.meta.url)));
    assert.equal(createHash('sha256').update(raw).digest('hex'), source.sha256);
  }
});

test('land clipping trims foreign reaches, holes and gaps between islands', async () => {
  const { landLineClipper } = await import('../scripts/reference-water.mjs');
  const clip = landLineClipper([
    [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]],
    [[[12, 4], [14, 4], [14, 6], [12, 6], [12, 4]]],
  ]);
  assert.equal(clip([[[-2, 5], [16, 5]]]), 'M0,5L3,5M7,5L10,5M12,5L14,5');
  assert.equal(clip([[[1, 1], [2, 2]], [[15, 15], [20, 20]]]), 'M1,1L2,2');
});
