// Offline French department assets, using an archived official boundary snapshot.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { topology } from 'topojson-server';
import polylabel from 'polylabel';
import polygonClipping from 'polygon-clipping';

const root = new URL('../', import.meta.url);
const round = n => +n.toFixed(3);
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const polygons = geometry => geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
const points = features => features.flatMap(f => polygons(f.geometry).flat(2));
const bounds = ps => {
  const b = ps.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
  return [b[0], b[1], b[2] - b[0], b[3] - b[1]];
};
const area = ring => Math.abs(ring.reduce((a, p, i) => {
  const q = ring[(i + 1) % ring.length]; return a + p[0] * q[1] - q[0] * p[1];
}, 0) / 2);
const line = ps => 'M' + ps.map(p => p.join(',')).join('L');
const walk = (arcs, visit) => typeof arcs === 'number' ? visit(arcs < 0 ? ~arcs : arcs) : arcs.forEach(a => walk(a, visit));
const source = {
  file: 'assets/maps/sources/france-departements-2026-100m.geojson.gz',
  sha256: 'e236204431730cdfe103efea54497896b874c3451efc663a4d4fdcbc831f9e0b',
  url: 'https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/2026/geojson/departements-100m.geojson.gz',
  attribution: 'data.gouv.fr / Etalab, Contours administratifs 2026, derived from IGN Admin Express; 100 m generalization',
  license: 'ODbL 1.0 — https://opendatacommons.org/licenses/odbl/1-0/',
  modifications: 'Department selection, Gironde estuary water subtraction using BD TOPAGE, projection, overseas inset placement, coordinate rounding, shared-border topology, SVG and thumbnail conversion. The archived sources and offline generator accompany these derived assets.',
};
const raw = gunzipSync(await readFile(new URL(source.file, root)));
assert.equal(createHash('sha256').update(raw).digest('hex'), source.sha256, 'Source checksum changed');
const hydrography = {
  attribution: 'IGN / OFB, BD TOPAGE, distributed by Sandre / Eaufrance',
  url: 'https://services.sandre.eaufrance.fr/geo/topage',
  retrieved: '2026-10-21',
  license: 'Licence Ouverte 2.0 — https://www.etalab.gouv.fr/licence-ouverte-open-licence/',
  sources: [
    { file: 'assets/maps/sources/france-topage-rivers.geojson.gz', sha256: 'c128268ce77e9a89f33535d430b203051e1314c30367c04034063e1a1c33df32', layer: 'CoursEau_FXX' },
    { file: 'assets/maps/sources/france-topage-gironde-water.geojson.gz', sha256: 'fa513edb8fdbe12f115587e1049569f76c2533ac80229f7af7fe107b23678515', layer: 'SurfaceElementaire_FXX' },
  ],
  rivers: ['Somme', 'Marne', 'Loire', 'Seine', 'Rhône', 'Garonne', 'Dordogne'],
  waterClipBounds: [-1.3, 44.78, -0.35, 45.7],
};
const [riverSource, waterSource] = await Promise.all(hydrography.sources.map(async s => {
  const raw = gunzipSync(await readFile(new URL(s.file, root)));
  assert.equal(createHash('sha256').update(raw).digest('hex'), s.sha256, 'Hydrography checksum changed');
  return JSON.parse(raw).features;
}));
const overseas = ['971', '972', '973', '974', '976'];
// Whole-department bands, following the displayed map rather than overseas
// longitude. The blue edge follows Calvados → Orne → Sarthe → Indre-et-Loire
// → Vienne → Haute-Vienne → Dordogne, then the southwestern departments.
const tricolor = {
  blue: { fill: '#24479c', title: '#ffffff', codes: '14 16 17 22 24 29 32 33 35 37 40 44 47 49 50 53 56 61 64 65 72 79 85 86 87 971 972 973'.split(' ') },
  white: { fill: '#f5f4ee', title: '#172a2f' },
  red: { fill: '#c93d49', title: '#ffffff', codes: '01 04 05 06 07 08 13 21 25 26 30 38 39 52 54 55 57 67 68 69 70 71 73 74 83 84 88 90 2A 2B 974 976'.split(' ') },
};
const checkedBand = code => tricolor.blue.codes.includes(code) ? 'blue' : tricolor.red.codes.includes(code) ? 'red' : 'white';
// The distribution also includes COMs; only the 96 metropolitan departments
// and five DROMs belong to this quiz. Keep the source's departmental geography
// (including Rhône with Lyon, and the separate Corsican/Alsatian departments).
const departments = JSON.parse(raw).features.filter(f => f.properties.code.length === 2 || overseas.includes(f.properties.code));
assert.equal(departments.length, 101);
for (const f of departments) f.properties = { code: f.properties.code, name: f.properties.nom, playable: true };
// Spherical Albers equal-area; each inset has its own central meridian/parallels.
function albers(center, parallels) {
  const rad = Math.PI / 180;
  const n = (Math.sin(parallels[0] * rad) + Math.sin(parallels[1] * rad)) / 2;
  const c = Math.cos(parallels[0] * rad) ** 2 + 2 * n * Math.sin(parallels[0] * rad);
  return ([longitude, latitude]) => {
    let delta = longitude - center;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    const r = Math.sqrt(c - 2 * n * Math.sin(latitude * rad)) / n;
    return [r * Math.sin(n * delta * rad), r * Math.cos(n * delta * rad)];
  };
}
function fit(features, project, frame) {
  const b = bounds(points(features).map(project));
  const scale = Math.min(frame[2] / b[2], frame[3] / b[3]);
  return p => {
    const xy = project(p);
    return [frame[0] + (frame[2] - b[2] * scale) / 2 + (xy[0] - b[0]) * scale,
      frame[1] + (frame[3] - b[3] * scale) / 2 + (xy[1] - b[1]) * scale].map(round);
  };
}
function projectFeatures(features, project) {
  return features.map(f => ({ type: 'Feature', properties: f.properties,
    geometry: { type: 'MultiPolygon', coordinates: polygons(f.geometry).map(p => p.map(r => r.map(project))) } }));
}

const style = `<style>.geographic-map{background:#b5d7e3}.map-region{fill:var(--land,#e1d2b1)}.region-fill{fill:inherit;stroke:none!important;fill-rule:evenodd}.context-land{fill:#c8c4b6;stroke:none!important;fill-rule:evenodd;pointer-events:none}.map-region.solved{fill:var(--solved,#a7cba0)}.border-mesh{fill:none;stroke:#000;stroke-width:.65;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;pointer-events:none}.inset-frame{fill:none;stroke:#587b87;stroke-width:.6;vector-effect:non-scaling-stroke;pointer-events:none}.map-region:focus-visible .region-fill{filter:brightness(1.18)}@media(hover:hover){.map-region:hover .region-fill{filter:brightness(1.12)}}</style>`;

async function emit({ id, title, features, source, viewBox, projection, note, insets, rivers, decoration = '' }) {
  // Fills and the single border mesh derive from the SAME projected topology.
  // Coordinates are rounded before topology construction, never separately per edge.
  const topo = topology({ regions: { type: 'FeatureCollection', features } });
  const owners = topo.arcs.map(() => new Set());
  const ring = (refs, preview = false) => refs.flatMap((ref, i) => {
    let ps = topo.arcs[ref < 0 ? ~ref : ref];
    if (preview && ps.length > 8) {
      const step = Math.ceil(ps.length / 24);
      ps = ps.filter((_, j) => j % step === 0 || j === ps.length - 1);
    }
    if (ref < 0) ps = [...ps].reverse();
    return i ? ps.slice(1) : ps;
  });
  const entries = topo.objects.regions.geometries.map(g => {
    const ps = g.arcs.map(p => p.map(r => ring(r)));
    const areas = ps.map(p => area(p[0]) - p.slice(1).reduce((s, r) => s + area(r), 0));
    const main = ps[areas.indexOf(Math.max(...areas))];
    walk(g.arcs, i => owners[i].add(g.properties.code));
    return { ...g.properties, arcs: g.arcs, polygons: ps, anchor: polylabel(main, .001).slice(0, 2).map(round),
      focusBox: bounds(main[0]).map(round), area: areas.reduce((a, b) => a + b, 0) };
  });
  entries.sort((a, b) => a.code.localeCompare(b.code));
  const roster = entries.filter(e => e.playable).map(e => ({ code: e.code, name: e.name, microstate: false }));
  assert(roster.length > 0);
  assert.equal(new Set(entries.map(e => e.code)).size, entries.length);
  const fillPath = (e, preview = false) => e.arcs.map(p => p.map(r => line(ring(r, preview)) + 'Z').join('')).join('');
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}" class="geographic-map" aria-label="${escape(title)} map" data-projection="${escape(projection)}">`,
    `<title>${escape(title)}</title><desc>${escape(source.attribution + '. ' + source.license + '. ' + (source.modifications ?? '') + ' ' + note + ' Hydrography: ' + hydrography.attribution + '. ' + hydrography.license)}</desc>`, style];
  for (const e of entries) {
    const d = fillPath(e);
    const band = checkedBand(e.code), colors = tricolor[band];
    parts.push(e.playable
      ? `<g data-country="${e.code}" class="map-region" data-checked-band="${band}" style="--solved:${colors.fill}" data-solved-title-color="${colors.title}" data-focus-box="${e.focusBox.join(' ')}"><title>${escape(e.name)}</title><path class="region-fill" id="france-land-${e.code}" d="${d}"/></g>`
      : `<path class="context-land" data-context="${e.code}" d="${d}"><title>${escape(e.name)}</title></path>`);
  }
  const borders = new Map();
  for (let i = 0; i < owners.length; i++) {
    const key = [...owners[i]].sort().join(' ');
    if (!borders.has(key)) borders.set(key, []);
    borders.get(key).push(i);
  }
  parts.push('<g class="borders" aria-hidden="true" pointer-events="none">');
  for (const [key, ids] of [...borders].sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(`<path class="border-mesh" data-border-owners="${key}" d="${ids.map(i => line(topo.arcs[i])).join('')}"/>`);
  }
  // Decorative rivers never capture department pointer events. Clip to the
  // metropolitan footprint so international reaches do not float in the ocean.
  const riverLayer = `<g class="rivers" clip-path="url(#france-river-clip)" aria-hidden="true" pointer-events="none" fill="none" stroke="#438aa7" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">${rivers.map(r => `<path data-river="${escape(r.name)}" vector-effect="non-scaling-stroke" d="${r.d}"/>`).join('')}</g>`;
  const riverClip = `<defs><clipPath id="france-river-clip">${entries.filter(e => e.code.length === 2).map(e => `<use href="#france-land-${e.code}" clip-rule="evenodd"/>`).join('')}</clipPath></defs>`;
  parts.push('</g>', riverClip, riverLayer, decoration, '</svg>\n');
  const svg = parts.join('\n');
  const manifest = { id, title, source, hydrography, tricolor, projection, viewBox, wrapping: false, coordinateDecimals: 3, simplification: false, note, insets,
    stats: { playable: roster.length, context: entries.length - roster.length, arcs: topo.arcs.length,
      sharedArcs: owners.filter(s => s.size === 2).length, vertices: topo.arcs.reduce((s, a) => s + a.length, 0), svgBytes: Buffer.byteLength(svg) },
    regions: Object.fromEntries(entries.map(e => [e.code, { name: e.name, playable: e.playable, anchor: e.anchor, focusBox: e.focusBox, polygons: e.polygons.length, checkedBand: checkedBand(e.code) }])) };
  const thumb = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}"><title>${escape(title)}</title><desc>${escape(source.attribution + '. ' + source.license + '. ' + (source.modifications ?? '') + ' Hydrography: ' + hydrography.attribution + '. ' + hydrography.license + '. Preview geometry simplified.')}</desc>`,
    ...entries.map(e => `<path id="france-land-${e.code}" fill="${e.playable ? '#e1d2b1' : '#c8c4b6'}" fill-rule="evenodd" stroke="#364747" stroke-width=".35" vector-effect="non-scaling-stroke" d="${fillPath(e, true)}"/>`), riverClip,
    rivers.reduce((layer, r) => layer.replace(r.d, r.previewD), riverLayer).replace('stroke-width="1.25"', 'stroke-width=".6"'), '</svg>\n'].join('\n');
  await writeFile(new URL(`assets/maps/${id}.svg`, root), svg);
  await writeFile(new URL(`assets/maps/${id}.manifest.json`, root), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(new URL(`assets/maps/${id}.thumbnail.svg`, root), thumb);
  await writeFile(new URL(`assets/maps/${id}.countries.json`, root), JSON.stringify(roster, null, 2) + '\n');
  console.log(id, manifest.stats);
}


const mainland = departments.filter(f => f.properties.code.length === 2);
const insets = [
  { code: '971', frame: [10, 490, 165, 150], center: -61.5, latitude: 16.2 },
  { code: '972', frame: [10, 660, 165, 150], center: -61, latitude: 14.6 },
  { code: '973', frame: [10, 830, 165, 150], center: -53, latitude: 4 },
  { code: '976', frame: [915, 40, 165, 150], center: 45.2, latitude: -12.8 },
  { code: '974', frame: [915, 210, 165, 150], center: 55.5, latitude: -21.1 },
];
const projectMainland = fit(mainland, albers(3, [44, 49]), [80, 20, 930, 970]);
// Administrative boundaries include estuarine water. Remove the sourced water
// footprint BEFORE topology/anchors are built, preserving islands and real hits.
const [west, south, east, north] = hydrography.waterClipBounds;
const water = polygonClipping.intersection(polygonClipping.union(...waterSource.map(f => polygons(f.geometry))),
  [[[[west, south], [east, south], [east, north], [west, north], [west, south]]]]);
const coastalMainland = mainland.map(f => ['17', '33'].includes(f.properties.code)
  ? { ...f, geometry: { type: 'MultiPolygon', coordinates: polygonClipping.difference(polygons(f.geometry), water) } } : f);
const features = projectFeatures(coastalMainland, projectMainland);
const riverNames = new Map([
  ['01C0000002000824194', 'Somme'], ['01C0000002000818638', 'Somme'],
  ['03C0000002000815787', 'Marne'], ['04C0000002000808543', 'Loire'],
  ['03C0000002000844903', 'Seine'], ['06C0000002000804457', 'Rhône'],
  ['06C0000002000805250', 'Rhône'], ['05C0000002000894629', 'Garonne'], ['05C0000002000831663', 'Dordogne'],
]);
const rivers = hydrography.rivers.map(name => {
  const paths = riverSource.filter(f => riverNames.get(f.properties.CdOH) === name)
    .flatMap(f => f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates)
    .map(ps => ps.map(projectMainland));
  return { name, d: paths.map(line).join(''),
    previewD: paths.map(ps => line(ps.filter((_, i) => i % 8 === 0 || i === ps.length - 1))).join('') };
});
for (const inset of insets) {
  const selected = departments.filter(f => f.properties.code === inset.code);
  const [x, y, w, h] = inset.frame;
  // Local equirectangular projection, north up, independently fitted per inset.
  const project = ([lon, lat]) => [(lon - inset.center) * Math.cos(inset.latitude * Math.PI / 180), -lat];
  features.push(...projectFeatures(selected, fit(selected, project, [x + 12, y + 12, w - 24, h - 24])));
}
await emit({ id: 'french-departments', title: 'French Departments', source, features, rivers,
  viewBox: [0, 0, 1100, 1020], projection: 'Albers equal-area (3° E; 44°/49° N), local overseas insets', insets,
  note: '101 departments: 96 metropolitan and five overseas. Corsica remains in geographic position. Overseas departments use independent scales in unlabeled insets. No other overseas collectivities are included.',
  decoration: '<g aria-hidden="true" pointer-events="none">' + insets.map(({ frame: [x, y, w, h] }) =>
    `<rect class="inset-frame" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>`).join('') + '</g>',
});
