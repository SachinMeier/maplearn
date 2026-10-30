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
    ['Snake', ['Snake']], ['Rio Grande', ['Rio Grande']], ['Red River', ['Red', 'Prairie Dog Town Fork Red']],
    ['Savannah', ['Savannah']], ['Balsas', ['Balsas']], ['Santiago', ['Ro Grande de Santiago']],
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
  for (const [name, aliases] of regional[id]) {
    // Natural Earth labels the Snake's river segments 'Columbia'; rivernum 103
    // links those segments to its correctly named lake centerlines.
    const features = riverData.features.filter(f => name === 'Snake'
      ? f.properties.rivernum === 103 : aliases.includes(f.properties.name)).filter(f => {
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
