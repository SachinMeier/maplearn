// Small menu artwork from the same Natural Earth source as the playable map.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { topology } from 'topojson-server';
import { merge } from 'topojson-client';
import { project, worldWidth, worldHeight } from './projection.mjs';

const root = new URL('../', import.meta.url);
const raw = gunzipSync(await readFile(new URL('assets/maps/sources/ne_10m_admin_0_map_units.v5.1.2.geojson.gz', root)));
assert.equal(createHash('sha256').update(raw).digest('hex'), '57da82be755f4afccd8f3b14251bb2752f5df1395f47d2d86f817470c4a48862');
const topo = topology({ land: JSON.parse(raw) });
// Dissolve country borders to keep continent silhouettes legible at 66px.
const land = merge(topo, topo.objects.land.geometries);
const area = ring => Math.abs(ring.reduce((sum, p, i) => {
  const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1];
}, 0) / 2);
function simplify(points, tolerance = 5) {
  if (points.length <= 3) return points;
  const keep = new Set([0, points.length - 1]), pending = [[0, points.length - 1]];
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
const rings = land.coordinates.map(p => p.map(r => r.map(project)))
  .filter(p => area(p[0]) >= 500)
  .flatMap(p => [p[0], ...p.slice(1).filter(r => area(r) >= 500)])
  .map(r => simplify(r)).filter(r => r.length >= 4);
const d = rings.map(r => 'M' + r.map(p => p.map(n => +n.toFixed(1)).join(',')).join('L') + 'Z').join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -60 ${worldWidth + 120} ${worldHeight + 120}"><title>World map</title><desc>Made with Natural Earth, public domain. Simplified continent silhouettes in the game's Miller cylindrical projection.</desc><path fill="#e1d2b1" fill-rule="evenodd" stroke="#536559" stroke-width=".35" vector-effect="non-scaling-stroke" stroke-linejoin="round" d="${d}"/></svg>\n`;
await writeFile(new URL('assets/maps/world.thumbnail.svg', root), svg);
console.log(`World thumbnail: ${Buffer.byteLength(svg)} bytes`);
