// Offline generation from pinned, public-domain Natural Earth snapshots.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import clipping from 'polygon-clipping';
import { topology } from 'topojson-server';
import { mesh } from 'topojson-client';

const root = new URL('../', import.meta.url);
const id = 'europe-rivers';
const extent = [-12, 35, 45, 71.5];
const [west, south, east, north] = extent;
const crop = [[[west, south], [east, south], [east, north], [west, north], [west, south]]];
const round = n => +n.toFixed(3);
const escape = s => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const lines = g => g.type === 'LineString' ? [g.coordinates] : g.coordinates;
const polygons = g => g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
const bounds = ps => {
  const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
};
const sources = [
  { file: 'assets/maps/sources/ne_10m_admin_0_map_units.v5.1.2.geojson.gz', sha256: '57da82be755f4afccd8f3b14251bb2752f5df1395f47d2d86f817470c4a48862', layer: 'ne_10m_admin_0_map_units' },
  { file: 'assets/maps/sources/ne_10m_rivers_lake_centerlines.v5.1.2.geojson.gz', sha256: 'bb854a900ecbd3b408df46d5e16e3e0f974ba55993f9d8b5c26e855273c0905a', layer: 'ne_10m_rivers_lake_centerlines' },
  { file: 'assets/maps/sources/ne_10m_rivers_europe.v5.1.2.geojson.gz', sha256: '90712202ac46985812e90840df9acd5101599a9c649868d5bc55ee96c2fedd4c', layer: 'ne_10m_rivers_europe' },
];
const data = await Promise.all(sources.map(async s => {
  s.url = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/${s.layer}.geojson`;
  const raw = gunzipSync(await readFile(new URL(s.file, root)));
  assert.equal(createHash('sha256').update(raw).digest('hex'), s.sha256);
  return JSON.parse(raw).features;
}));

// A balanced learning selection, not a ranking of Europe's 31 longest rivers.
// Combine international names, lake centerlines, and named supplements.
const definitions = [
  ['shannon', 'Shannon', ['Shannon']],
  ['thames', 'Thames', ['Thames']],
  ['severn', 'Severn', ['Severn']],
  ['loire', 'Loire', ['Loire']],
  ['seine', 'Seine', ['Seine']],
  ['somme', 'Somme', ['Somme']],
  ['garonne', 'Garonne', ['Garonne']],
  ['rhone', 'Rhône', ['Rhône', 'Rhne']],
  ['rhine', 'Rhine', ['Rhine', 'Rhein', 'Rhin', 'Waal', 'Nederrijn', 'Lek']],
  ['meuse', 'Meuse', ['Maas']],
  ['elbe', 'Elbe', ['Elbe']],
  ['oder', 'Oder', ['Oder']],
  ['vistula', 'Vistula', ['Vistula']],
  ['danube', 'Danube', ['Danube', 'Donau', 'Bratul Chillia', 'Bratul Sulina', 'Bratul Sfintu Gheorghe']],
  ['po', 'Po', ['Po']],
  ['tiber', 'Tiber', ['Tevere']],
  ['douro', 'Douro', ['Duero']],
  ['tagus', 'Tagus', ['Tajo', 'Tejo']],
  ['guadiana', 'Guadiana', ['Guadiana']],
  ['guadalquivir', 'Guadalquivir', ['Guadalquivir']],
  ['ebro', 'Ebro', ['Ebro']],
  ['dnieper', 'Dnieper (Dnipro)', ['Dnipro', 'Dnepre', 'Dnepr']],
  ['dniester', 'Dniester', ['Dniester']],
  ['don', 'Don', ['Don']],
  ['volga', 'Volga (upper course)', ['Volga']],
  ['daugava', 'Daugava', ['Daugava']],
  ['neva', 'Neva', ['Neva']],
  ['glomma', 'Glomma', ['Glomma']],
  ['sava', 'Sava', ['Sava']],
  ['kemijoki', 'Kemijoki', ['Kemijoki']],
  ['dalalven', 'Dalälven', ['Dalälven']],
];
assert.equal(definitions.length, 31);

// Liang–Barsky clipping keeps open paths open; never close a river or draw
// an artificial segment along the eastern edge of the frame.
function clipLine(ps) {
  const result = [];
  let current;
  for (let i = 1; i < ps.length; i++) {
    const [x, y] = ps[i - 1], [ex, ey] = ps[i], dx = ex - x, dy = ey - y;
    let low = 0, high = 1, rejected = false;
    for (const [p, q] of [[-dx, x - west], [dx, east - x], [-dy, y - south], [dy, north - y]]) {
      if (p === 0) { if (q < 0) rejected = true; continue; }
      const t = q / p;
      if (p < 0) low = Math.max(low, t); else high = Math.min(high, t);
    }
    if (rejected || low > high) { current = null; continue; }
    const a = [x + dx * low, y + dy * low], b = [x + dx * high, y + dy * high];
    if (!current || Math.hypot(current.at(-1)[0] - a[0], current.at(-1)[1] - a[1]) > 1e-8) {
      current = [a]; result.push(current);
    }
    current.push(b);
  }
  return result;
}

// Albers equal-area: a less stretched European outline than a world projection.
const rad = Math.PI / 180;
const n = (Math.sin(43 * rad) + Math.sin(62 * rad)) / 2;
const c = Math.cos(43 * rad) ** 2 + 2 * n * Math.sin(43 * rad);
const albers = ([lon, lat]) => {
  const rho = Math.sqrt(c - 2 * n * Math.sin(lat * rad)) / n;
  return [rho * Math.sin(n * (lon - 15) * rad), rho * Math.cos(n * (lon - 15) * rad)];
};
const boundary = [];
for (let lon = west; lon <= east; lon += .25) boundary.push([lon, south], [lon, north]);
for (let lat = south; lat <= north; lat += .25) boundary.push([west, lat], [east, lat]);
const frame = bounds(boundary.map(albers));
const scale = 1380 / frame[2];
const viewBox = [0, 0, 1420, round(frame[3] * scale + 40)];
const project = p => { const xy = albers(p); return [round(20 + (xy[0] - frame[0]) * scale), round(20 + (xy[1] - frame[1]) * scale)]; };
const path = ps => 'M' + ps.map(p => project(p).join(',')).join('L');

const land = data[0].flatMap(f => {
  if (f.properties.ADM0_A3 === 'ISL') return [];
  const kept = polygons(f.geometry).filter(p => p[0].some(([x, y]) => x >= west && x <= east && y >= south && y <= north));
  if (!kept.length) return [];
  const coordinates = clipping.intersection(kept, crop);
  if (!coordinates.length) return [];
  return [{ type: 'Feature', properties: { code: f.properties.ADM0_A3 }, geometry: { type: 'MultiPolygon', coordinates } }];
});
const topo = topology({ land: { type: 'FeatureCollection', features: land } });
// One shared mesh, excluding internal map-unit boundaries and the crop edges.
const borders = mesh(topo, topo.objects.land, (a, b) => a === b || a.properties.code !== b.properties.code).coordinates;
const borderSegments = [];
for (const ps of borders) {
  let line;
  for (let i = 1; i < ps.length; i++) {
    const a = ps[i - 1], b = ps[i];
    if ([west, east].some(x => a[0] === x && b[0] === x) || [south, north].some(y => a[1] === y && b[1] === y)) { line = null; continue; }
    if (!line) { line = [a]; borderSegments.push(line); }
    line.push(b);
  }
}

const rivers = definitions.map(([code, name, names]) => {
  const selected = data.slice(1).flatMap((features, index) => features.filter(f => names.includes(f.properties.name)).map(f => ({ f, source: index + 1 })));
  const geometry = selected.flatMap(({ f }) => lines(f.geometry).flatMap(clipLine))
    .filter(ps => ps.length > 1 && (code !== 'volga' || ps.some(p => p[1] > 55)));
  // The lower Volga briefly re-enters the eastern frame near Volgograd.
  // Exclude those disconnected southern fragments from the upper-course target.
  assert(geometry.length, `Missing geometry for ${name}`);
  const projected = geometry.map(ps => ps.map(project));
  const lengths = projected.map(ps => ps.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - ps[i][0], p[1] - ps[i][1]), 0));
  const main = projected[lengths.indexOf(Math.max(...lengths))];
  const focusBox = bounds(projected.flat()).map(round);
  return { code, name, geometry, d: geometry.map(path).join(''), focusBox,
    anchor: main[Math.floor(main.length / 2)], vertices: projected.flat().length,
    sources: selected.map(({ f, source }) => ({ source, name: f.properties.name, riverNumber: f.properties.rivernum, type: f.properties.featurecla })) };
});

const style = `<style>
.river-map{background:#b5d7e3}
.river-map .context-land{fill:#dfd7c3;stroke:none;fill-rule:evenodd;pointer-events:none}
.river-map .border-mesh{fill:none;stroke:#444b48;stroke-width:.65;vector-effect:non-scaling-stroke;pointer-events:none;stroke-linejoin:round}
.river-map .river-region{fill:none!important;stroke:#147bb6;cursor:pointer}
.river-map .river-line,.river-map .river-hit{fill:none;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.river-map .river-line{stroke:inherit;stroke-width:3;pointer-events:stroke;transition:stroke 180ms ease}
.river-map .river-hit{stroke:transparent;stroke-width:13;pointer-events:stroke}
.river-map .river-region.solved{stroke:#164968}
.river-map .river-region.solved .river-line{stroke-width:4.5}
.river-map .river-region:focus-visible .river-line{stroke:#00a7e0;stroke-width:5}
@media(hover:hover){.river-map .river-region:hover .river-line{stroke:#00a7e0;stroke-width:4.5}}
</style>`;
const context = land.map(f => `<path class="context-land" data-context="${f.properties.code}" d="${polygons(f.geometry).map(p => p.map(r => path(r) + 'Z').join('')).join('')}"/>`).join('\n');
const borderPath = borderSegments.map(path).join('');
const description = '31 selected major European rivers, from Ireland to western Russia. Iceland excluded. National borders are context, not quiz targets. Volga is shown only within the eastern crop. Natural Earth 1:10m, public domain. River strokes and invisible tap targets are enlarged for play, not true river widths.';
const header = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}" class="geographic-map river-map" aria-label="European Rivers map" data-projection="Albers equal-area"><title>European Rivers</title><desc>${description}</desc>`;
const svg = [header, style, '<g aria-hidden="true" pointer-events="none">', context, `<path class="border-mesh" d="${borderPath}"/>`, '</g>',
  ...rivers.map(r => `<g data-country="${r.code}" class="map-region river-region" data-focus-box="${r.focusBox.join(' ')}"><title>${escape(r.name)}</title><path class="river-hit" d="${r.d}"/><path class="river-line" d="${r.d}"/></g>`), '</svg>\n'].join('\n');
// Only the menu preview is simplified; playable coastlines retain source detail.
const simplify = ps => ps.filter((_, i) => i === 0 || i === ps.length - 1 || i % Math.max(1, Math.floor(ps.length / 40)) === 0);
const thumbnailContext = land.map(f => `<path class="context-land" d="${polygons(f.geometry).map(p => p.map(r => path(simplify(r)) + 'Z').join('')).join('')}"/>`).join('\n');
const thumbnail = [header, style, thumbnailContext,
  `<path class="border-mesh" d="${borderSegments.map(ps => path(simplify(ps))).join('')}"/>`, ...rivers.map(r => `<path class="river-line" style="stroke-width:1" stroke="#147bb6" d="${r.geometry.map(ps => path(simplify(ps))).join('')}"/>`), '</svg>\n'].join('\n');
const manifest = { id, title: 'European Rivers', attribution: 'Made with Natural Earth', license: 'Public domain', sources,
  extent, projection: 'Albers equal-area (15° E; 43°/62° N)', viewBox, wrapping: false,
  note: description, selection: 'Geographically balanced major rivers, not a length ranking.',
  stats: { playable: rivers.length, vertices: rivers.reduce((s, r) => s + r.vertices, 0), svgBytes: Buffer.byteLength(svg) },
  regions: Object.fromEntries(rivers.map(({ code, name, focusBox, anchor, vertices, sources }) => [code, { name, focusBox, anchor, vertices, sources }])) };
for (const [suffix, content] of [['svg', svg], ['thumbnail.svg', thumbnail], ['manifest.json', JSON.stringify(manifest, null, 2) + '\n'],
  ['countries.json', JSON.stringify(rivers.map(({ code, name }) => ({ code, name, microstate: false })), null, 2) + '\n']]) {
  await writeFile(new URL(`assets/maps/${id}.${suffix}`, root), content);
}
console.log(id, manifest.stats);
