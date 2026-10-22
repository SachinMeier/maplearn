// Menu artwork only: preserve the playable geometry and simplify by distance,
// rather than dropping every Nth vertex (which can cut across entire coastlines).
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { project, worldWidth, worldHeight } from './projection.mjs';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const line = points => 'M' + points.map(p => p.map(n => +n.toFixed(2)).join(',')).join('L');

function simplify(points, tolerance) {
  if (points.length <= 3) return points;
  const keep = new Set([0, points.length - 1]);
  const pending = [[0, points.length - 1]];
  while (pending.length) {
    const [first, last] = pending.pop(), a = points[first], b = points[last];
    const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
    let max = tolerance * tolerance, furthest = -1;
    for (let i = first + 1; i < last; i++) {
      const p = points[i];
      const t = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2)) : 0;
      const distance = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
      if (distance > max) { max = distance; furthest = i; }
    }
    if (furthest !== -1) { keep.add(furthest); pending.push([first, furthest], [furthest, last]); }
  }
  return [...keep].sort((a, b) => a - b).map(i => points[i]);
}

function simplifyPath(d, tolerance) {
  return [...d.matchAll(/M([^MZ]+)(Z?)/g)].map(([, coordinates, close]) => {
    const points = coordinates.split('L').map(p => p.split(',').map(Number));
    return line(simplify(points, tolerance)) + close;
  }).join('');
}

export async function generateRegionThumbnails() {
  const definitions = JSON.parse(await read('data/regions.json'));
  for (const { id, name } of definitions) {
    const svg = await read(`assets/maps/${id}.svg`);
    const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
    const tolerance = Math.max(...viewBox.split(' ').map(Number).slice(2)) / 2400;
    const land = [...svg.matchAll(/<path class="region-fill" d="([^"]+)"/g)]
      .map(([, d]) => simplifyPath(d, tolerance)).join('');
    // Use the shared mesh so coastlines and country borders are drawn once.
    // It also omits artificial crop edges and enlarged gameplay hit targets.
    const borders = [...svg.matchAll(/<path class="border-mesh"[^>]* d="([^"]+)"/g)]
      .map(([, d]) => simplifyPath(d, tolerance)).join('');
    const thumbnail = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><title>${name}</title><style>@media(max-width:120px){.borders{stroke-width:.45}}</style><path fill="#e1d2b1" fill-rule="evenodd" d="${land}"/><path class="borders" fill="none" stroke="#172126" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" d="${borders}"/></svg>\n`;
    await writeFile(new URL(`assets/maps/${id}.thumbnail.svg`, root), thumbnail);
    console.log(`${name} thumbnail: ${Buffer.byteLength(thumbnail)} bytes`);
  }
}

export async function generateWaterThumbnail() {
  const raw = gunzipSync(await readFile(new URL('assets/maps/sources/ne_10m_ocean.v5.1.2.geojson.gz', root)));
  assert.equal(createHash('sha256').update(raw).digest('hex'), 'f9696a1337c746a0f6c8c13bc60d0f230d2ef8d105198d5657726c8f8e763fc2');
  const { geometry } = JSON.parse(raw).features[0];
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const water = polygons.map(polygon => polygon.map(ring =>
    line(simplify(ring.map(project), worldWidth / 3000)) + 'Z').join('')).join('');
  const thumbnail = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${worldWidth} ${worldHeight}"><title>World Oceans &amp; Seas</title><desc>Natural Earth ocean coastlines in the game's Miller cylindrical projection.</desc><rect width="${worldWidth}" height="${worldHeight}" fill="#e1d2b1"/><path d="${water}" fill="#286890" fill-rule="evenodd" stroke="#172f3c" stroke-width=".6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>\n`;
  await writeFile(new URL('assets/maps/world-waters.thumbnail.svg', root), thumbnail);
  console.log(`Oceans thumbnail: ${Buffer.byteLength(thumbnail)} bytes`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await generateRegionThumbnails();
  await generateWaterThumbnail();
}
