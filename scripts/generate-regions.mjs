// Derive finite regional maps from the checked world SVG, without resampling
// coastlines or independently rebuilding neighboring country boundaries.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import clipping from 'polygon-clipping';
import polylabel from 'polylabel';
import { bounds } from './hit-areas.mjs';
import { project, worldWidth } from './projection.mjs';
import { generateRegionThumbnails } from './generate-thumbnails.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const world = await read('assets/maps/world.svg');
const worldManifest = JSON.parse(await read('assets/maps/world.manifest.json'));
const countries = JSON.parse(await read('data/countries.json'));
const definitions = JSON.parse(await read('data/regions.json'));
const source = { file: 'assets/maps/world.svg', sha256: createHash('sha256').update(world).digest('hex') };
const style = world.match(/<style>.*?<\/style>/s)[0];
const round = n => +n.toFixed(6);
const line = points => 'M' + points.map(p => p.map(round).join(',')).join('L');
const path = polygons => polygons.map(p => p.map(r => line(r) + 'Z').join('')).join('');
const lines = d => [...d.matchAll(/M([^MZ]+)/g)].map(m => m[1].split('L').map(p => p.split(',').map(Number)));
const area = r => r.reduce((sum, p, i) => {
  const q = r[(i + 1) % r.length]; return sum + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;
function polygons(d) {
  const result = [];
  for (const ring of lines(d)) {
    if (area(ring) > 0) result.push([ring]);
    else { assert(result.length, 'Hole without exterior'); result.at(-1).push(ring); }
  }
  return result;
}
const regions = new Map([...world.matchAll(/<g data-country="([A-Z]{2})"[^>]*>(.*?)<\/g>/g)].map(([, code, content]) => {
  const fill = content.match(/<path class="region-fill" d="([^"]+)"/)[1];
  const hit = content.match(/<path class="hit-area"[^>]*data-min-target-width="([^"]+)" d="([^"]+)"/);
  return [code, { title: content.match(/<title>.*?<\/title>/)[0], land: polygons(fill),
    hit: worldManifest.countries[code].hitArea?.polygons ?? [],
    minTargetWidth: hit ? Number(hit[1]) : null,
    outline: hit ? lines(content.match(/<path class="hit-outline" d="([^"]+)"/)[1]) : [] }];
}));
const borders = [...world.matchAll(/<path class="border-mesh" data-border-owners="([^"]+)" d="([^"]+)"/g)]
  .map(([, owners, d]) => ({ owners: owners.split(' '), lines: lines(d) }));
const inside = ([x, y], ring) => {
  let found = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) found = !found;
  }
  return found;
};
const intersects = (a, b) => a[0] <= b[0] + b[2] && b[0] <= a[0] + a[2] && a[1] <= b[1] + b[3] && b[1] <= a[1] + a[3];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];

// Clip open border/hit-outline segments, never drawing the artificial crop edge.
function clipLine(points, ring) {
  let d = '', previous;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], v = [b[0] - a[0], b[1] - a[1]], ts = [0, 1];
    for (let j = 1; j < ring.length; j++) {
      const c = ring[j - 1], e = ring[j], w = [e[0] - c[0], e[1] - c[1]], den = cross(v, w);
      if (Math.abs(den) < 1e-12) continue;
      const delta = [c[0] - a[0], c[1] - a[1]], t = cross(delta, w) / den, u = cross(delta, v) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
    ts.sort((a, b) => a - b);
    const at = t => [a[0] + v[0] * t, a[1] + v[1] * t];
    for (let j = 1; j < ts.length; j++) {
      if (!inside(at((ts[j - 1] + ts[j]) / 2), ring)) { previous = null; continue; }
      const start = at(ts[j - 1]).map(round).join(','), end = at(ts[j]).map(round).join(',');
      if (start === end) continue;
      if (previous !== start) d += 'M' + start;
      d += 'L' + end; previous = end;
    }
  }
  return d;
}

for (const definition of definitions) {
  const { id, name, codes, extent: [west, south, east, north] } = definition;
  const [x, y] = project([west, north]), [right, bottom] = project([east, south]);
  const viewBox = [x, y, right - x, bottom - y].map(round);
  // A cartographic approximation following the Ural range; this is a crop,
  // not a political border. The northern extension retains European Arctic land.
  const urals = [[70, 83], [70, 73], [67, 69], [65, 66], [60, 63], [59, 59], [59, 55], [58, 51], [58, 33]];
  const mask = id === 'europe'
    ? [[west, north], ...urals, [west, south], [west, north]].map(project)
    : [[x, y], [right, y], [right, bottom], [x, bottom], [x, y]];
  function crop(polys) {
    const result = [];
    for (const dx of [-worldWidth, 0, worldWidth]) for (const polygon of polys) {
      const shifted = polygon.map(r => r.map(([px, py]) => [px + dx, py]));
      if (!intersects(bounds(shifted[0]), viewBox)) continue;
      // Preserve untouched coordinates verbatim; only crop crossing polygons.
      result.push(...(shifted[0].every(p => inside(p, mask)) ? [shifted] : clipping.intersection([shifted], [mask])));
    }
    return result;
  }
  function cropLines(input) {
    let d = '';
    for (const dx of [-worldWidth, 0, worldWidth]) for (const points of input) {
      const shifted = points.map(([px, py]) => [px + dx, py]);
      if (intersects(bounds(shifted), viewBox)) d += clipLine(shifted, mask);
    }
    return d;
  }
  const roster = countries.filter(c => codes.includes(c.code));
  assert.equal(roster.length, codes.length, `${id}: unknown/duplicate country`);
  const manifest = { id, name, source, projection: 'Miller cylindrical', viewBox, extent: definition.extent,
    wrapWidth: null, cropBoundary: id === 'europe' ? urals : null, countries: {} };
  const output = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}" class="geographic-map" aria-label="${name} country map" data-projection="Miller cylindrical">`,
    `<title>${name} country map</title>`,
    '<desc>Derived from the World map. Made with Natural Earth, public domain. Dashed outlines are click targets. Map edges are crops, not political boundaries.</desc>', style];
  // Retain world draw order, with small padded targets above large countries.
  for (const [code, entry] of regions) {
    if (!codes.includes(code)) continue;
    const land = crop(entry.land), hit = crop(entry.hit);
    assert(land.length, `${id}: no geometry for ${code}`);
    const main = land.reduce((a, b) => Math.abs(area(a[0])) > Math.abs(area(b[0])) ? a : b);
    const anchor = polylabel(main, .001).slice(0, 2);
    const focusShape = hit.find(p => inside(anchor, p[0])) ?? main;
    const focusBox = bounds(focusShape[0]).map(round);
    const fill = path(land);
    output.push(`<g data-country="${code}" class="map-region" data-focus-box="${focusBox.join(' ')}">${entry.title}${hit.length ? `<path class="hit-area" fill-rule="evenodd" data-min-target-width="${entry.minTargetWidth}" d="${path(hit)}"/><path class="hit-outline" d="${cropLines(entry.outline)}"/>` : ''}<path class="region-fill" d="${fill}"/></g>`);
    const country = roster.find(c => c.code === code);
    manifest.countries[code] = { ...country, anchor: anchor.map(round), focusBox, polygons: land.length };
  }
  output.push('<g class="borders" aria-hidden="true" pointer-events="none">');
  for (const border of borders) {
    const owners = border.owners.filter(code => codes.includes(code));
    if (!owners.length) continue;
    const d = cropLines(border.lines);
    if (d) output.push(`<path class="border-mesh" data-border-owners="${owners.join(' ')}" d="${d}"/>`);
  }
  output.push('</g></svg>\n');
  await writeFile(new URL(`assets/maps/${id}.svg`, root), output.join('\n'));
  await writeFile(new URL(`assets/maps/${id}.manifest.json`, root), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(new URL(`assets/maps/${id}.countries.json`, root), JSON.stringify(roster, null, 2) + '\n');
  console.log(`${name}: ${roster.length} countries/territories, ${(Buffer.byteLength(output.join('\n')) / 1e6).toFixed(2)} MB`);
}
await generateRegionThumbnails();
