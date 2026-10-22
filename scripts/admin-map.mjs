// Shared offline renderer for province/state maps with a single border mesh.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { topology } from 'topojson-server';
import polylabel from 'polylabel';

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
export async function readSource(source) {
  const raw = gunzipSync(await readFile(new URL(source.file, root)));
  assert.equal(createHash('sha256').update(raw).digest('hex'), source.sha256, 'Source checksum changed');
  return JSON.parse(raw).features;
}

// Spherical Albers equal-area; each inset has its own central meridian/parallels.
export function albers(center, parallels) {
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
export function fit(features, project, frame) {
  const b = bounds(points(features).map(project));
  const scale = Math.min(frame[2] / b[2], frame[3] / b[3]);
  return p => {
    const xy = project(p);
    return [frame[0] + (frame[2] - b[2] * scale) / 2 + (xy[0] - b[0]) * scale,
      frame[1] + (frame[3] - b[3] * scale) / 2 + (xy[1] - b[1]) * scale].map(round);
  };
}
export function projectFeatures(features, project) {
  // Rounding very short source segments can produce zero-length edges or
  // A-B-A spikes. Remove those before topology so no border is stroked twice.
  const cleanRing = ring => {
    const stack = [];
    const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
    for (const p of ring.slice(0, -1).map(project)) {
      if (same(stack.at(-1), p)) continue;
      if (same(stack.at(-2), p)) stack.pop();
      else stack.push(p);
    }
    while (stack.length > 2 && same(stack.at(-1), stack[1])) { stack.pop(); stack.shift(); }
    while (stack.length > 2 && same(stack.at(-2), stack[0])) stack.splice(-2);
    if (stack.length) stack.push(stack[0]);
    return stack;
  };
  return features.map(f => ({ type: 'Feature', properties: f.properties,
    geometry: { type: 'MultiPolygon', coordinates: polygons(f.geometry).map(p => p.map(cleanRing))
      .filter(p => p[0].length >= 4 && area(p[0]) > 0)
      .map(p => [p[0], ...p.slice(1).filter(r => r.length >= 4 && area(r) > 0)]) } }));
}

const style = `<style>.geographic-map{background:#b5d7e3}.map-region{fill:var(--land,#e1d2b1)}.region-fill{fill:inherit;stroke:none!important;fill-rule:evenodd}.context-land{fill:#c8c4b6;stroke:none!important;fill-rule:evenodd;pointer-events:none}.context-land[data-context-type="park"]{fill:#a7cba0}.map-region.solved{fill:var(--solved,#a7cba0)}.border-mesh{fill:none;stroke:#000;stroke-width:.65;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;pointer-events:none}.map-region:focus-visible .region-fill{filter:brightness(1.18)}@media(hover:hover){.map-region:hover .region-fill{filter:brightness(1.12)}}</style>`;

export async function emit({ id, title, features, source, viewBox, projection, note, smallCodes = [], hitRadius = 12, solvedColor, solvedTitleColor }) {
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
  const small = new Set(smallCodes);
  for (const e of entries) {
    const radius = typeof hitRadius === 'function' ? hitRadius(e, entries) : hitRadius;
    e.hitArea = small.has(e.code) ? { type: 'circle', center: e.anchor, radius } : null;
    if (e.hitArea) {
      const [x, y, w, h] = e.focusBox, [cx, cy] = e.anchor;
      const left = Math.min(x, cx - radius), top = Math.min(y, cy - radius);
      e.focusBox = [left, top, Math.max(x + w, cx + radius) - left, Math.max(y + h, cy + radius) - top].map(round);
    }
  }
  entries.sort((a, b) => a.code.localeCompare(b.code));
  const roster = entries.map(e => ({ code: e.code, name: e.name, kind: e.kind, microstate: false }));
  assert(roster.length > 0);
  assert.equal(new Set(entries.map(e => e.code)).size, entries.length);
  const fillPath = (e, preview = false) => e.arcs.map(p => p.map(r => line(ring(r, preview)) + 'Z').join('')).join('');
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}" class="geographic-map"${solvedColor ? ` style="--solved:${escape(solvedColor)}"` : ''} aria-label="${escape(title)} map" data-projection="${escape(projection)}">`,
    `<title>${escape(title)}</title><desc>${escape(source.attribution + '. ' + source.license + '. ' + (source.modifications ?? '') + ' ' + note)}</desc>`, style,
    '<style>.hit-area{fill:inherit;fill-opacity:.28;stroke:#000;stroke-width:.8;stroke-dasharray:3 3;vector-effect:non-scaling-stroke;pointer-events:all}.map-region:focus-visible .hit-area{fill-opacity:.55}@media(hover:hover){.map-region:hover .hit-area{filter:brightness(1.12)}}</style>'];
  // Small-region circles intentionally extend over neighboring land, like the
  // other maps' assisted targets. Paint them last so their whole disc is usable.
  for (const e of [...entries].sort((a, b) => Number(Boolean(a.hitArea)) - Number(Boolean(b.hitArea)))) {
    const d = fillPath(e);
    const hit = e.hitArea ? `<circle class="hit-area" cx="${e.anchor[0]}" cy="${e.anchor[1]}" r="${e.hitArea.radius}"/>` : '';
    parts.push(`<g data-country="${e.code}" class="map-region"${solvedTitleColor ? ` data-solved-title-color="${escape(solvedTitleColor)}"` : ''} data-focus-box="${e.focusBox.join(' ')}"><title>${escape(e.name)}</title>${hit}<path class="region-fill" d="${d}"/></g>`);
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
    regions: Object.fromEntries(entries.map(e => [e.code, { name: e.name, kind: e.kind, playable: e.playable, anchor: e.anchor, focusBox: e.focusBox, polygons: e.polygons.length, hitArea: e.hitArea }])) };
  const thumb = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}"><title>${escape(title)}</title><desc>${escape(source.attribution + '. ' + source.license + '. ' + (source.modifications ?? '') + ' Preview geometry simplified.')}</desc>`,
    ...entries.map(e => `<path fill="${e.playable ? '#e1d2b1' : e.park ? '#a7cba0' : '#c8c4b6'}" fill-rule="evenodd" stroke="#364747" stroke-width=".35" vector-effect="non-scaling-stroke" d="${fillPath(e, true)}"/>`), '</svg>\n'].join('\n');
  await writeFile(new URL(`assets/maps/${id}.svg`, root), svg);
  await writeFile(new URL(`assets/maps/${id}.manifest.json`, root), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(new URL(`assets/maps/${id}.thumbnail.svg`, root), thumb);
  await writeFile(new URL(`assets/maps/${id}.countries.json`, root), JSON.stringify(roster, null, 2) + '\n');
  console.log(id, manifest.stats);
}
