// One-time, offline asset generation. Nothing in this file ships to the browser.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { topology } from 'topojson-server';
import { mergeArcs } from 'topojson-client';
import polylabel from 'polylabel';
import { buildHitAreas } from './hit-areas.mjs';
import { project, worldWidth, worldHeight, latitudeLimit } from './projection.mjs';

const root = new URL('../', import.meta.url);
const sourcePath = 'assets/maps/sources/ne_10m_admin_0_map_units.v5.1.2.geojson.gz';
const raw = gunzipSync(await readFile(new URL(sourcePath, root)));
assert.equal(createHash('sha256').update(raw).digest('hex'), '57da82be755f4afccd8f3b14251bb2752f5df1395f47d2d86f817470c4a48862', 'Unexpected source snapshot');
const source = JSON.parse(raw);
const sourceVertices = source.features.reduce((sum, f) => sum +
  (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
    .reduce((n, polygon) => n + polygon.reduce((m, ring) => m + ring.length, 0), 0), 0);
const countries = JSON.parse(await readFile(new URL('data/countries.json', root)));
const canonical = new Map(countries.map(c => [c.code, c]));
const overrides = { NJM: 'SJ', SOL: 'SO', CYN: 'CY', KNX: 'KR', KNZ: 'KP' };
const mappings = [];
for (const f of source.features) {
  const p = f.properties;
  const code = p.ADM0_A3 === 'UMI' ? 'UM' : overrides[p.GU_A3] ?? p.ISO_A2_EH;
  // Retain non-roster areas as neutral, noninteractive land, without inventing assignments.
  const owner = canonical.has(code) ? code : `context-${p.GU_A3}`;
  mappings.push({ unit: p.GU_A3, name: p.NAME, sourceCode: p.ISO_A2_EH, owner });
  f.properties = { owner };
}
const topo = topology({ land: source }); // No simplification or geographic quantization.
const groups = new Map();
for (const g of topo.objects.land.geometries) {
  const owner = g.properties.owner;
  if (!groups.has(owner)) groups.set(owner, []);
  groups.get(owner).push(g);
}
assert.deepEqual(countries.filter(c => !groups.has(c.code)), [], 'Every playable code needs real geometry');

const round = n => +n.toFixed(3);
// Natural Earth has sub-0.002-degree differences where opposite date-line
// cuts meet. Align in geographic degrees before projecting.
const seamPoints = topo.arcs.flat().filter(p => Math.abs(p[0]) === 180).sort((a, b) => a[1] - b[1]);
for (let start = 0; start < seamPoints.length;) {
  let end = start + 1;
  while (end < seamPoints.length && seamPoints[end][1] - seamPoints[start][1] <= .002) end++;
  const y = (seamPoints[start][1] + seamPoints[end - 1][1]) / 2;
  for (let i = start; i < end; i++) seamPoints[i][1] = y;
  start = end;
}
// Project each shared arc ONCE. Fills and borders reuse these exact coordinates.
topo.arcs = topo.arcs.map(arc => arc.map(p => project(p).map(round)));
const owners = topo.arcs.map(() => new Set());
const walk = (a, visit) => typeof a === 'number' ? visit(a < 0 ? ~a : a) : a.forEach(x => walk(x, visit));
const ringPoints = ring => ring.flatMap((ref, i) => {
  const points = ref < 0 ? [...topo.arcs[~ref]].reverse() : topo.arcs[ref];
  return i ? points.slice(1) : points;
});
const line = points => 'M' + points.map(p => p.join(',')).join('L');
const isSeam = (a, b) => a[0] === b[0] && (a[0] === 0 || a[0] === 3600);
const isPolarCut = (a, b) => a[1] === b[1] && (a[1] === 0 || a[1] === worldHeight);
const outline = points => {
  let path = '', drawing = false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (isSeam(a, b) || isPolarCut(a, b)) { drawing = false; continue; }
    if (!drawing) path += 'M' + a.join(',');
    path += 'L' + b.join(','); drawing = true;
  }
  return path;
};
const ringArea = ring => Math.abs(ring.reduce((a, p, i) => {
  const q = ring[(i + 1) % ring.length]; return a + p[0] * q[1] - q[0] * p[1];
}, 0) / 2);
const bounds = points => {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y].map(round);
};
const entries = [];
for (const [owner, geometries] of groups) {
  const merged = mergeArcs(topo, geometries);
  walk(merged.arcs, id => owners[id].add(owner));
  const polygons = merged.arcs.map(p => p.map(ringPoints));
  const areas = polygons.map(p => ringArea(p[0]) - p.slice(1).reduce((a, r) => a + ringArea(r), 0));
  const largest = areas.indexOf(Math.max(...areas));
  const main = polygons[largest];
  const anchor = polylabel(main, .001).slice(0, 2).map(round);
  entries.push({ owner, playable: canonical.has(owner), geometry: merged, polygons, area: areas.reduce((a, b) => a + b, 0),
    mainArea: areas[largest], anchor, focus: bounds(main[0]), hit: null });
}
const small = buildHitAreas(entries, { worldWidth, worldHeight });
const borders = new Map();
let sharedArcs = 0, exteriorArcs = 0, dissolvedArcs = 0;
for (let id = 0; id < topo.arcs.length; id++) {
  const codes = [...owners[id]].sort();
  assert(codes.length <= 2, `Arc ${id} has more than two owners`);
  if (!codes.length) { dissolvedArcs++; continue; }
  codes.length === 2 ? sharedArcs++ : exteriorArcs++;
  const key = codes.join(' ');
  if (!borders.has(key)) borders.set(key, []);
  borders.get(key).push(id);
}
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const fillPath = e => e.polygons.map(p => p.map(r => line(r) + 'Z').join('')).join('');
const parts = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${worldWidth} ${worldHeight}" class="geographic-map" aria-label="World country map" data-projection="Miller cylindrical" data-wrap-width="${worldWidth}">`,
  '<title>World country map</title>',
  '<desc>Made with Natural Earth, public domain, 1:10 million map units, repository release 5.1.2. Country fills and a single shared border mesh use identical coordinates. Dashed padded outlines are click targets, not geographic boundaries.</desc>',
  '<style>.geographic-map{background:#b5d7e3}.map-region{fill:var(--land,#e1d2b1)}.region-fill{fill:inherit;stroke:none!important;fill-rule:evenodd}.context-land{fill:#c8c4b6;stroke:none;pointer-events:none}.map-region.solved{fill:var(--solved,#a7cba0)}.border-mesh{fill:none;stroke:#000;stroke-width:.65;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;pointer-events:none}.hit-area{fill:inherit;fill-opacity:.25;stroke:none!important;pointer-events:fill}.hit-outline{fill:none;stroke:#000;stroke-width:.8;stroke-dasharray:2 2;vector-effect:non-scaling-stroke;pointer-events:none}.map-region:focus-visible .region-fill{filter:brightness(1.18)}@media(hover:hover){.map-region:hover .region-fill,.map-region.wrap-hover .region-fill{filter:brightness(1.12)}}</style>',
];
entries.sort((a, b) => b.area - a.area || a.owner.localeCompare(b.owner));
for (const e of entries) {
  if (!canonical.has(e.owner)) {
    parts.push(`<path class="context-land" data-context="${e.owner}" d="${fillPath(e)}"/>`);
    continue;
  }
  parts.push(`<g data-country="${e.owner}" class="map-region" data-focus-box="${e.focus.join(' ')}"><title>${escape(canonical.get(e.owner).name)}</title>${e.hit ? `<path class="hit-area" fill-rule="evenodd" data-min-target-width="${e.hit.minTargetWidth}" d="${fillPath(e.hit)}"/><path class="hit-outline" d="${e.hit.polygons.map(p => p.map(outline).join('')).join('')}"/>` : ''}<path class="region-fill" d="${fillPath(e)}"/></g>`);
}
parts.push('<g class="borders" aria-hidden="true" pointer-events="none">');
for (const [key, ids] of [...borders].sort(([a], [b]) => a.localeCompare(b))) {
  parts.push(`<path class="border-mesh" data-border-owners="${key}" d="${ids.map(id => outline(topo.arcs[id])).join('')}"/>`);
}
parts.push('</g></svg>\n');
const svg = parts.join('\n');
const manifest = {
  source: { url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_map_units.geojson',
    file: sourcePath, sha256: createHash('sha256').update(raw).digest('hex'), license: 'Public domain',
    scale: '1:10,000,000 (10m means ten million, not ten metres)', repositoryRelease: '5.1.2' },
  projection: 'Miller cylindrical', viewBox: [0, 0, worldWidth, worldHeight], wrapWidth: worldWidth, latitudeLimit,
  seamSnapToleranceDegrees: .002, coordinateDecimals: 3, simplification: false,
  stats: { sourceFeatures: source.features.length, sourceVertices, topologyVertices: topo.arcs.reduce((a, arc) => a + arc.length, 0),
    countries: countries.length, hitAreas: small.length, sharedArcs, exteriorArcs, dissolvedArcs,
    svgBytes: Buffer.byteLength(svg), gzipBytes: gzipSync(svg).length },
  countries: Object.fromEntries(entries.filter(e => canonical.has(e.owner)).map(e => [e.owner, {
    name: canonical.get(e.owner).name, microstate: canonical.get(e.owner).microstate,
    polygons: e.polygons.length, anchor: e.anchor, focusBox: e.focus, hitArea: e.hit,
    // Libya's widest interior point is east of its visual center.
    ...(e.owner === 'LY' ? { titleAnchor: [round(e.focus[0] + e.focus[2] / 2), e.anchor[1]] } : {}),
  }])),
  mappings,
};
await writeFile(new URL('assets/maps/world.svg', root), svg);
await writeFile(new URL('assets/maps/world.manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
console.log(manifest.stats);
await import('./generate-world-thumbnail.mjs');
