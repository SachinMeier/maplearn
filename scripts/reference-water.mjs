// Geographic reference layers share the map's projection and crop pipeline.
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
export async function readReferenceSource(file, checksum) {
  const raw = gunzipSync(await readFile(new URL(file, root)));
  const sha256 = createHash('sha256').update(raw).digest('hex');
  if (checksum) assert.equal(sha256, checksum);
  return { features: JSON.parse(raw).features, source: { file, sha256,
    ...(file.includes('ne_10m_') ? { license: 'Public domain', url: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/${file.split('/').at(-1).replace('.v5.1.2.geojson.gz', '.geojson')}` } : {}) } };
}
export const referenceStyle = '<style>.reference-river{fill:none;stroke:#70afca;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;pointer-events:none}.reference-lake{fill:#b5d7e3;stroke:#70afca;stroke-width:.5;vector-effect:non-scaling-stroke;pointer-events:none;fill-rule:evenodd}</style>';
export const riverLines = f => f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
const regional = {
  'north-america': [
    ['Ohio', ['Ohio']], ['Mississippi', ['Mississippi']], ['Missouri', ['Missouri']],
    ['Snake', ['Snake'], 103], ['Rio Grande', ['Rio Grande']], ['Red River', ['Red', 'Prairie Dog Town Fork Red']],
    ['Hudson', ['Hudson'], 326], ['Savannah', ['Savannah']], ['Balsas', ['Balsas']], ['Santiago', ['Ro Grande de Santiago']],
    // River IDs keep Canadian names distinct from namesakes elsewhere, and
    // distinguish the Columbia proper (64) from the mislabeled Snake (103).
    ['Yukon', ['Yukon'], 53], ['Mackenzie', ['Mackenzie'], 34],
    ['Slave', ['Slave'], 39], ['Peace', ['Peace'], 33],
    ['Fraser', ['Fraser'], 187], ['Columbia', ['Columbia'], 64],
    ['North Saskatchewan', ['North Saskatchewan'], 117],
    ['South Saskatchewan', ['South Saskatchewan'], 266],
    ['Saskatchewan', ['Saskatchewan'], 112], ['Nelson', ['Nelson'], 275],
    ['Severn', ['Severn'], 378], ['Albany', ['Albany'], 243],
    ['Great Whale', ['Grande Rivire de la Baleine'], 591],
    ['La Grande', ['La Grande'], 109], ['Ottawa', ['Ottawa'], 206],
    ['St. Lawrence', ['St. Lawrence'], 23],
  ],
  'south-america': [
    ['Amazon', ['Amazonas']], ['Ucayali', ['Ucayali']], ['Marañón', ['Marañón']],
    ['Rio Negro', ['Negro']], ['Madeira', ['Madeira']], ['Tapajós', ['Tapajós']], ['Xingu', ['Xingu']],
  ],
  asia: [
    ['Yangtze', ['Yangtze', 'Chang Jiang', 'Jinsha']], ['Yellow', ['Huang']], ['Pearl (Xi)', ['Xi', 'Xun', 'Hongshui', 'Nanpan']],
    ['Ganges', ['Ganges']], ['Indus', ['Indus']], ['Mekong', ['Mekong']],
  ],
};
export async function regionalReferenceWater(id, project, crop, cropLines, path) {
  if (!regional[id]) return { svg: '', rivers: [], lakes: [], sources: [] };
  const riverData = await readReferenceSource('assets/maps/sources/ne_10m_rivers_lake_centerlines.v5.1.2.geojson.gz', 'bb854a900ecbd3b408df46d5e16e3e0f974ba55993f9d8b5c26e855273c0905a');
  const sources = [riverData.source], rivers = [], lakes = [], output = [referenceStyle];
  for (const [name, aliases, riverId] of regional[id]) {
    // Natural Earth labels the Snake's river segments 'Columbia'; rivernum 103
    // links those segments to its correctly named lake centerlines.
    const features = riverData.features.filter(f => riverId !== undefined
      ? f.properties.rivernum === riverId : aliases.includes(f.properties.name)).filter(f => {
      const [lon, lat] = riverLines(f)[0][0];
      // Disambiguate the Red River of the South and Amazon's Rio Negro.
      return name === 'Red River' ? lat < 37 : name === 'Rio Negro' ? lat > -5 : true;
    });
    const d = cropLines(features.flatMap(riverLines).map(line => line.map(project)));
    assert(d, `Missing reference river: ${id}/${name}`);
    rivers.push(name);
    output.push(`<path class="reference-river" data-river="${name}" d="${d}"/>`);
  }
  if (id === 'north-america') {
    const data = await readReferenceSource('assets/maps/sources/ne_10m_lakes.v5.1.2.geojson.gz', '2d036f53dedec578001c5c30c2959ee7d4eebc1306900fa4367c49929ec8f2d9');
    sources.push(data.source);
    for (const name of ['Superior', 'Michigan', 'Huron', 'Erie', 'Ontario']) {
      const features = data.features.filter(f => f.properties.name === `Lake ${name}`);
      assert(features.length, `Missing lake ${name}`);
      const polygons = features.flatMap(f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
      lakes.push(name);
      output.push(`<path class="reference-lake" data-lake="${name}" d="${path(crop(polygons.map(p => p.map(r => r.map(project)))))}"/>`);
    }
  }
  return { svg: `<g class="reference-water" aria-hidden="true" pointer-events="none">${output.join('\n')}</g>`, rivers, lakes, sources };
}

// Province/state maps use their own fitted projection. River IDs include the
// named upstream reaches and lake centerlines of each selected main course.
const administrativeRivers = {
  'chinese-provinces': [
    ['Yangtze', [1, 18, 15, 13, 11]], ['Yellow', [66, 95]],
    ['Pearl', [96, 149, 147, 128]], ['Heilongjiang (Amur)', [93, 72]],
    ['Songhua', [366, 646, 967]], ['Tarim', [349]],
  ],
  'indian-states': [
    ['Ganges', [55]], ['Brahmaputra', [51]], ['Indus', [56]],
    ['Godavari', [179]], ['Krishna', [279]], ['Narmada', [308]],
  ],
};
export async function administrativeReferenceWater(id, project) {
  const data = await readReferenceSource('assets/maps/sources/ne_10m_rivers_lake_centerlines.v5.1.2.geojson.gz', 'bb854a900ecbd3b408df46d5e16e3e0f974ba55993f9d8b5c26e855273c0905a');
  const paths = administrativeRivers[id].map(([name, ids]) => {
    const features = data.features.filter(f => ids.includes(f.properties.rivernum));
    for (const riverId of ids) assert(features.some(f => f.properties.rivernum === riverId), `${name}: missing source reach ${riverId}`);
    const lines = features.flatMap(riverLines).map(points => points.map(project));
    assert(lines.length, `${id}: missing river ${name}`);
    return { name, lines };
  });
  const sources = [data.source], lakePaths = [];
  if (id === 'chinese-provinces') {
    const source = JSON.parse(await readFile(new URL('assets/maps/sources/taitema-lake-2022.source.json', root), 'utf8'));
    const lake = await readReferenceSource(source.file, source.sha256);
    sources.push(source);
    lakePaths.push({ name: 'Taitema Lake', year: 2022, polygons: lake.features.flatMap(f =>
      (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
        .map(p => p.map(r => r.map(project)))) });
  }
  return { paths, lakePaths, rivers: paths.map(p => p.name), sources, clippedToLand: true };
}

// Index country-outline edges by horizontal band so detailed borders are clipped
// once at build time, rather than asking the browser to union huge SVG masks.
export function landLineClipper(polygons) {
  const bands = new Map(), bandHeight = 10;
  const band = y => Math.floor(y / bandHeight);
  for (const ring of polygons.flat()) for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const edge = { a, b, minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]) };
    for (let row = band(Math.min(a[1], b[1])); row <= band(Math.max(a[1], b[1])); row++) {
      if (!bands.has(row)) bands.set(row, []);
      bands.get(row).push(edge);
    }
  }
  const inside = ([x, y]) => {
    let odd = false;
    for (const { a, b } of bands.get(band(y)) ?? []) {
      if ((a[1] > y) !== (b[1] > y) && x < a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])) odd = !odd;
    }
    return odd;
  };
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const coordinate = p => p.map(n => +n.toFixed(3)).join(',');
  return lines => {
    let d = '';
    for (const line of lines) {
      let previous;
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i], v = [b[0] - a[0], b[1] - a[1]], ts = [0, 1];
        const candidates = new Set();
        for (let row = band(Math.min(a[1], b[1])); row <= band(Math.max(a[1], b[1])); row++) {
          for (const edge of bands.get(row) ?? []) if (edge.maxX >= Math.min(a[0], b[0]) && edge.minX <= Math.max(a[0], b[0])) candidates.add(edge);
        }
        for (const edge of candidates) {
          const w = [edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]], den = cross(v, w);
          if (Math.abs(den) < 1e-12) continue;
          const delta = [edge.a[0] - a[0], edge.a[1] - a[1]];
          const t = cross(delta, w) / den, u = cross(delta, v) / den;
          if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
        }
        ts.sort((a, b) => a - b);
        const at = t => [a[0] + v[0] * t, a[1] + v[1] * t];
        for (let j = 1; j < ts.length; j++) {
          if (!inside(at((ts[j - 1] + ts[j]) / 2))) { previous = null; continue; }
          const start = coordinate(at(ts[j - 1])), end = coordinate(at(ts[j]));
          if (start === end) continue;
          if (previous !== start) d += 'M' + start;
          d += 'L' + end;
          previous = end;
        }
      }
    }
    return d;
  };
}
