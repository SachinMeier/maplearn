// Offline, reproducible state and NYC neighborhood assets. No network at runtime.
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
const sources = {
  states: {
    file: 'assets/maps/sources/us-states-census-2024.geojson.gz',
    sha256: '3c426c67e70afe5b79aa9896bfae96f94027565dd5728c6c54f30f55f5dc19db',
    url: 'https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/State_County/MapServer/7/query?where=1%3D1&outFields=STATE%2CSTUSAB%2CNAME&outSR=4326&returnGeometry=true&f=geojson',
    attribution: 'U.S. Census Bureau, 2024 generalized state boundaries, 1:500,000',
    license: 'U.S. federal government public-domain geographic data',
  },
  nyc: {
    file: 'assets/maps/sources/nyc-colloquial-neighborhoods.geojson.gz',
    sha256: 'c79fc3f434c229b0b57de1554f4220ec27bc1e4db04e4de2518ae7a2ce2877b0',
    url: 'https://raw.githubusercontent.com/chriswhong/nyc-neighborhood-boundaries/a14c924b16ce659d034ab15a8f45229b05a1f1f5/dist/nyc-neighborhood-boundaries.geojson',
    attribution: 'Chris Whong / NYC Neighborhood Boundaries contributors, derived from Zillow (2017); commit a14c924b16ce659d034ab15a8f45229b05a1f1f5',
    license: 'CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0/',
    modifications: 'Borough extraction, duplicate merging, nonresidential context classification, overlap partition (smaller sub-neighborhoods first), shared-edge noding, projection, rounding, SVG and thumbnail conversion. Derived NYC map assets are CC BY-SA 4.0.',
  },
};
async function readSource(source) {
  const raw = gunzipSync(await readFile(new URL(source.file, root)));
  assert.equal(createHash('sha256').update(raw).digest('hex'), source.sha256, 'Source checksum changed');
  return JSON.parse(raw).features;
}

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

const style = `<style>.geographic-map{background:#b5d7e3}.map-region{fill:var(--land,#e1d2b1)}.region-fill{fill:inherit;stroke:none!important;fill-rule:evenodd}.context-land{fill:#c8c4b6;stroke:none!important;fill-rule:evenodd;pointer-events:none}.context-land[data-context-type="park"]{fill:#a7cba0}.map-region.solved{fill:var(--solved,#a7cba0)}.border-mesh{fill:none;stroke:#000;stroke-width:.65;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;pointer-events:none}.map-region:focus-visible .region-fill{filter:brightness(1.18)}@media(hover:hover){.map-region:hover .region-fill{filter:brightness(1.12)}}</style>`;

async function emit({ id, title, features, source, viewBox, projection, note }) {
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
    `<title>${escape(title)}</title><desc>${escape(source.attribution + '. ' + source.license + '. ' + (source.modifications ?? '') + ' ' + note)}</desc>`, style];
  for (const e of entries) {
    const d = fillPath(e);
    parts.push(e.playable
      ? `<g data-country="${e.code}" class="map-region" data-focus-box="${e.focusBox.join(' ')}"><title>${escape(e.name)}</title><path class="region-fill" d="${d}"/></g>`
      : `<path class="context-land" data-context="${e.code}" data-context-type="${e.park ? 'park' : 'other'}" d="${d}"><title>${escape(e.name)}</title></path>`);
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
  parts.push('</g>', '</svg>\n');
  const svg = parts.join('\n');
  const manifest = { id, title, source, projection, viewBox, wrapping: false, coordinateDecimals: 3, simplification: false, note,
    stats: { playable: roster.length, context: entries.length - roster.length, arcs: topo.arcs.length,
      sharedArcs: owners.filter(s => s.size === 2).length, vertices: topo.arcs.reduce((s, a) => s + a.length, 0), svgBytes: Buffer.byteLength(svg) },
    regions: Object.fromEntries(entries.map(e => [e.code, { name: e.name, playable: e.playable, park: Boolean(e.park), anchor: e.anchor, focusBox: e.focusBox, polygons: e.polygons.length }])) };
  const thumb = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}"><title>${escape(title)}</title><desc>${escape(source.attribution + '. ' + source.license + '. ' + (source.modifications ?? '') + ' Preview geometry simplified.')}</desc>`,
    ...entries.map(e => `<path fill="${e.playable ? '#e1d2b1' : e.park ? '#a7cba0' : '#c8c4b6'}" fill-rule="evenodd" stroke="#364747" stroke-width=".35" vector-effect="non-scaling-stroke" d="${fillPath(e, true)}"/>`), '</svg>\n'].join('\n');
  await writeFile(new URL(`assets/maps/${id}.svg`, root), svg);
  await writeFile(new URL(`assets/maps/${id}.manifest.json`, root), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(new URL(`assets/maps/${id}.thumbnail.svg`, root), thumb);
  await writeFile(new URL(`assets/maps/${id}.countries.json`, root), JSON.stringify(roster, null, 2) + '\n');
  console.log(id, manifest.stats);
}

const states = (await readSource(sources.states)).filter(f => +f.properties.STATE < 60 && f.properties.STUSAB !== 'DC');
assert.equal(states.length, 50);
for (const f of states) f.properties = { code: f.properties.STUSAB, name: f.properties.NAME, playable: true };
const contiguous = states.filter(f => !['AK', 'HI'].includes(f.properties.code));
const alaska = states.filter(f => f.properties.code === 'AK');
const hawaii = states.filter(f => f.properties.code === 'HI');
const stateFeatures = [
  ...projectFeatures(contiguous, fit(contiguous, albers(-96, [29.5, 45.5]), [20, 20, 1160, 650])),
  ...projectFeatures(alaska, fit(alaska, albers(-154, [55, 65]), [20, 520, 300, 195])),
  ...projectFeatures(hawaii, fit(hawaii, albers(-157, [8, 18]), [250, 535, 245, 165])),
];
await emit({ id: 'us-states', title: 'U.S. States', features: stateFeatures, source: sources.states, viewBox: [0, 0, 1200, 760],
  projection: 'Albers equal-area',
  note: 'All 50 states; Washington, D.C. and territories are excluded. All source islands are retained. Borders are drawn once.' });


const nyc = await readSource(sources.nyc);
const contextNames = new Set(['Central Park', 'Ellis Island', 'Governors Island', 'Liberty Island', 'Mill Rock Park',
  'Randals-Wards Island', 'Floyd Bennett Field', 'Green-Wood Cemetery', 'Prospect Park', 'West Jamaica Bay Islands',
  'East Jamaica Bay Islands', 'Flushing Meadows Corona Park', 'Fort Tilden', 'Jacob Riis Park',
  'John F. Kennedy International Airport', 'La Guardia Airport']);

// Explicit park areas only: neighborhoods such as Park Slope remain quiz targets.
const parkNames = new Set(['Central Park', 'Mill Rock Park', 'Randals-Wards Island', 'Governors Island',
  'Prospect Park', 'Floyd Bennett Field', 'Flushing Meadows Corona Park', 'Fort Tilden', 'Jacob Riis Park']);

// Insert shared junctions into long neighboring segments before topology. This
// handles a sub-neighborhood boundary ending in the middle of a parent's edge.
// The maximum near-collinear adjustment is .002 SVG unit (well below a pixel).
function nodeEdges(features) {
  const grid = new Map(), cell = 12, unique = new Map();
  const snapGrid = new Map(), tolerance = .015;
  for (const p of points(features).sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    p[0] = round(p[0]); p[1] = round(p[1]);
    const cx = Math.floor(p[0] / tolerance), cy = Math.floor(p[1] / tolerance);
    let match;
    for (let x = cx - 1; x <= cx + 1 && !match; x++) for (let y = cy - 1; y <= cy + 1 && !match; y++) {
      match = (snapGrid.get(`${x},${y}`) ?? []).find(q => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tolerance);
    }
    if (match) { p[0] = match[0]; p[1] = match[1]; }
    else {
      const key = `${cx},${cy}`;
      if (!snapGrid.has(key)) snapGrid.set(key, []);
      snapGrid.get(key).push([...p]);
    }
    unique.set(p.join(','), p);
  }
  for (const p of unique.values()) {
    const key = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(p);
  }
  for (const f of features) for (const polygon of f.geometry.coordinates) for (let r = 0; r < polygon.length; r++) {
    const old = polygon[r], next = [];
    for (let i = 1; i < old.length; i++) {
      const a = old[i - 1], b = old[i], dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
      if (!length2) continue;
      const inserted = [];
      for (let x = Math.floor((Math.min(a[0], b[0]) - .002) / cell); x <= Math.floor((Math.max(a[0], b[0]) + .002) / cell); x++) {
        for (let y = Math.floor((Math.min(a[1], b[1]) - .002) / cell); y <= Math.floor((Math.max(a[1], b[1]) + .002) / cell); y++) {
          for (const p of grid.get(`${x},${y}`) ?? []) {
            const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2;
            if (t > 1e-8 && t < 1 - 1e-8 && Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / Math.sqrt(length2) <= .002) inserted.push({ p, t });
          }
        }
      }
      next.push(a, ...inserted.sort((a, b) => a.t - b.t).map(v => v.p));
    }
    if (next.length) next.push(next[0]);
    polygon[r] = next;
  }
  // Rounding can collapse residual sub-centimetre slivers into zero-width
  // spikes. Remove those spikes and zero-area rings, retaining real polygons.
  const cleanRing = ring => {
    const stack = [];
    const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
    for (const p of ring.slice(0, -1)) {
      if (same(stack.at(-1), p)) continue;
      if (same(stack.at(-2), p)) stack.pop();
      else stack.push(p);
    }
    while (stack.length > 2 && same(stack.at(-1), stack[1])) { stack.pop(); stack.shift(); }
    while (stack.length > 2 && same(stack.at(-2), stack[0])) stack.splice(-2);
    if (stack.length) stack.push(stack[0]);
    return stack;
  };
  for (const f of features) {
    f.geometry.coordinates = f.geometry.coordinates.map(p => p.map(cleanRing))
      .filter(p => p[0].length >= 4 && area(p[0]) > .05)
      .map(p => [p[0], ...p.slice(1).filter(r => r.length >= 4 && area(r) > .05)]);
    assert(f.geometry.coordinates.length, `No area after noding: ${f.properties.name}`);
  }
  return features;
}

function partition(features) {
  // Merge duplicate source slugs (Warnerville has two source records).
  const byCode = new Map();
  for (const f of features) {
    const previous = byCode.get(f.properties.code);
    if (previous) previous.geometry.coordinates = polygonClipping.union(previous.geometry.coordinates, f.geometry.coordinates);
    else byCode.set(f.properties.code, f);
  }
  const entries = [...byCode.values()];
  const size = f => polygons(f.geometry).reduce((s, p) => s + area(p[0]) - p.slice(1).reduce((s, r) => s + area(r), 0), 0);
  entries.sort((a, b) => Number(a.properties.kind !== 'sub-neighborhood') - Number(b.properties.kind !== 'sub-neighborhood') || size(a) - size(b) || a.properties.code.localeCompare(b.properties.code));
  const allocated = [];
  const result = [];
  for (const f of entries) {
    const original = f.geometry.coordinates;
    const shape = allocated.length ? polygonClipping.difference(original, ...allocated) : original;
    if (!shape.length) throw new Error(`Fully covered neighborhood: ${f.properties.name}`);
    f.geometry.coordinates = shape;
    allocated.push(original);
    result.push(f);
  }
  nodeEdges(result);
  for (const f of result) f.geometry.coordinates = polygonClipping.union(f.geometry.coordinates);
  return nodeEdges(result);
}
// Omit these small enclaves before partitioning so their land stays with the
// surrounding source neighborhoods instead of leaving holes in the map.
const omittedNeighborhoods = new Set(['astor-row-houses-manhattan', 'strivers-row-manhattan',
  'tudor-city-manhattan', 'little-australia-manhattan']);
for (const borough of ['Manhattan', 'Brooklyn', 'Queens']) {
  const features = nyc.filter(f => f.properties.borough === borough.toLowerCase() && !omittedNeighborhoods.has(f.properties.slug));
  for (const f of features) {
    const p = f.properties, playable = !contextNames.has(p.name);
    const name = p.name.replace(' 🚡', '').replace('Alphabet city', 'Alphabet City').replace('Randals-Wards Island', 'Randalls and Wards Islands');
    f.properties = { code: (playable ? '' : 'context-') + p.slug, name, playable, park: !playable && parkNames.has(p.name), kind: p.kind };
  }
  // Local equirectangular with true scale at NYC latitude; north remains up.
  const project = ([lon, lat]) => [lon * Math.cos(40.73 * Math.PI / 180), -lat];
  const b = bounds(points(features).map(project));
  const height = 1200, width = round(1160 * b[2] / b[3] + 40);
  await emit({ id: `nyc-${borough.toLowerCase()}`, title: `${borough} Neighborhoods`,
    features: partition(projectFeatures(features, fit(features, project, [20, 20, width - 40, height - 40]))),
    source: sources.nyc, viewBox: [0, 0, width, height], projection: 'Local equirectangular, standard parallel 40.73° N',
    note: 'Approximate colloquial boundaries, not official districts. Sub-neighborhoods take precedence over overlapping parent neighborhoods; the parent label applies to its remaining area. Parks start green; other nonresidential areas are muted context. Every playable area is distinct. Derived map licensed CC BY-SA 4.0.' });
}
