// Offline Massachusetts town microregions. All geometry uses the same projection
// and SVG camera; no geocoder or map service is needed during play.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { topology } from 'topojson-server';
import { feature } from 'topojson-client';
import clipping from 'polygon-clipping';

const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const round = n => +n.toFixed(3);
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const polygons = g => g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
const line = points => 'M' + points.map(p => p.join(',')).join('L');
const path = g => polygons(g).map(p => p.map(r => line(r) + 'Z').join('')).join('');
const sourceStates = (await read('assets/maps/us-states.manifest.json')).source;
const sourceTowns = {
  file: 'assets/maps/sources/massachusetts-town-halls-massgis.geojson.gz',
  sha256: '5722beddb828ed296047f51ad41d582fa64ac3649c159184c8f3a9af7e09cc22',
  url: 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Town_and_City_Halls/FeatureServer/0/query?where=1%3D1&outFields=NAME%2CCITY&outSR=4326&returnGeometry=true&orderByFields=CITY&f=geojson',
  documentation: 'https://www.mass.gov/info-details/massgis-data-town-and-city-halls',
  attribution: 'MassGIS; Massachusetts Emergency Management Agency GIS Program with Regional Planning Agencies',
  retrieved: '2026-10-21',
  note: 'Town and city hall points stand in for town centers. Circles are enlarged quiz targets, not municipal boundaries.',
};
async function source(s) {
  const raw = gunzipSync(await readFile(new URL(s.file, root)));
  assert.equal(createHash('sha256').update(raw).digest('hex'), s.sha256, 'Source checksum changed');
  return JSON.parse(raw).features;
}
const states = await source(sourceStates);
const halls = await source(sourceTowns);
const names = await read('data/massachusetts-towns.json');
assert.equal(new Set(names).size, names.length);

// North-up local equirectangular projection, true scale at 42.2° N.
// Tight geographic bounds include all Massachusetts islands and nearby states.
const extent = [-73.65, 41.17, -69.85, 43.04];
const scale = 470, cosine = Math.cos(42.2 * Math.PI / 180);
const project = ([lon, lat]) => [round((lon - extent[0]) * cosine * scale), round((extent[3] - lat) * scale)];
const [width, height] = project([extent[2], extent[1]]);
const viewBox = [0, 0, width, height];
const clip = [[[extent[0], extent[1]], [extent[2], extent[1]], [extent[2], extent[3]], [extent[0], extent[3]], [extent[0], extent[1]]]];
const neighbors = new Set(['MA', 'NY', 'VT', 'NH', 'ME', 'CT', 'RI']);
const features = states.filter(f => neighbors.has(f.properties.STUSAB)).map(f => ({
  type: 'Feature', properties: { code: f.properties.STUSAB, name: f.properties.NAME },
  geometry: { type: 'MultiPolygon', coordinates: clipping.intersection(polygons(f.geometry), clip)
    .map(p => p.map(r => r.map(project))) },
})).filter(f => f.geometry.coordinates.length);
const topo = topology({ states: { type: 'FeatureCollection', features } });
const land = feature(topo, topo.objects.states).features;
// Shared arcs are drawn once, separately from unstroked land fills.
const border = topo.arcs.map(arc => line(arc)).join('');
const towns = names.map(name => {
  const matches = halls.filter(f => f.properties.CITY === name.toUpperCase());
  assert.equal(matches.length, 1, `Expected one town hall for ${name}`);
  const coordinates = matches[0].geometry.coordinates;
  return { code: `MA-${name.toUpperCase().replaceAll(' ', '-')}`, name, coordinates, anchor: project(coordinates) };
}).sort((a, b) => a.name.localeCompare(b.name));
for (const town of towns) {
  // Uniform town targets; nearby circles intentionally overlap.
  town.radius = 12;
  const [x, y] = town.anchor, r = town.radius;
  town.focusBox = [x - r, y - r, r * 2, r * 2].map(round);
  assert(x - r > 0 && y - r > 0 && x + r < width && y + r < height);
}

const id = 'massachusetts-towns', title = 'Massachusetts Towns';
const note = `${towns.length} cities and towns, including the seven requested additions. Town hall locations represent each municipality; dashed circles are clickable microregions, not town boundaries. Barnstable is represented by its town hall in Hyannis. Salisbury represents the municipality containing Salisbury Beach. Concord is in Massachusetts. All islands remain in geographic position.`;
const desc = `${sourceStates.attribution}. ${sourceTowns.attribution}. ${note}`;
const style = `<style>
.massachusetts-map{background:#b5d7e3}
.massachusetts-map .state-land{fill:#c8c4b6;stroke:none!important;fill-rule:evenodd;pointer-events:none}
.massachusetts-map .state-land[data-state="MA"]{fill:var(--land,#e1d2b1)}
.massachusetts-map .border-mesh{fill:none;stroke:#151a1b;stroke-width:.8;stroke-linejoin:round;vector-effect:non-scaling-stroke;pointer-events:none}
.massachusetts-map .hit-area{fill:#f7ecd2;fill-opacity:.55;stroke:#151a1b;stroke-width:1;stroke-dasharray:3 3;vector-effect:non-scaling-stroke;cursor:pointer}
.massachusetts-map .town-dot{fill:#79603a;stroke:none!important;pointer-events:none}
.massachusetts-map .solved .hit-area{fill:var(--solved,#a7cba0);fill-opacity:1}
.massachusetts-map .solved .town-dot{fill:#39733a}
.massachusetts-map .map-region:focus-visible .hit-area{stroke:#00517a;stroke-width:2}
@media(hover:hover){.massachusetts-map .map-region:hover .hit-area{filter:brightness(1.15)}}
</style>`;
const background = land.map(f => `<path class="state-land" data-state="${f.properties.code}" d="${path(f.geometry)}"/>`).join('\n')
  + `\n<path class="border-mesh" d="${border}"/>`;
const circles = towns.map(t => {
  const [x, y] = t.anchor;
  return `<g data-country="${t.code}" class="map-region" data-focus-box="${t.focusBox.join(' ')}"><title>${escape(t.name)}</title><circle class="hit-area" cx="${x}" cy="${y}" r="${t.radius}"/><circle class="town-dot region-fill" cx="${x}" cy="${y}" r="2.1"/></g>`;
}).join('\n');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}" class="geographic-map massachusetts-map" aria-label="${title} map"><title>${title}</title><desc>${escape(desc)}</desc>${style}\n${background}\n${circles}\n</svg>\n`;
const thumbnail = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}"><title>${title}</title><desc>${escape(desc)}</desc>
${land.map(f => `<path fill="${f.properties.code === 'MA' ? '#e1d2b1' : '#c8c4b6'}" stroke="#364747" stroke-width="1.5" fill-rule="evenodd" d="${path(f.geometry)}"/>`).join('\n')}
${towns.map(t => `<circle cx="${t.anchor[0]}" cy="${t.anchor[1]}" r="${t.radius}" fill="#79603a" fill-opacity=".6"/>`).join('\n')}
</svg>\n`;
const manifest = { id, title, sources: { states: sourceStates, towns: sourceTowns },
  projection: 'Local equirectangular, standard parallel 42.2° N', geographicBounds: extent, viewBox, wrapping: false,
  note, stats: { playable: towns.length, contextStates: land.length, arcs: topo.arcs.length, svgBytes: Buffer.byteLength(svg) },
  regions: Object.fromEntries(towns.map(t => [t.code, { name: t.name, playable: true, coordinates: t.coordinates,
    anchor: t.anchor, radius: t.radius, focusBox: t.focusBox }])),
};
for (const [suffix, content] of [
  ['svg', svg], ['thumbnail.svg', thumbnail], ['manifest.json', JSON.stringify(manifest, null, 2) + '\n'],
  ['countries.json', JSON.stringify(towns.map(t => ({ code: t.code, name: t.name, microstate: false })), null, 2) + '\n'],
]) await writeFile(new URL(`assets/maps/${id}.${suffix}`, root), content);
console.log(id, manifest.stats);
