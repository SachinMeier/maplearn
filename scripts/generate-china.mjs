// Offline province-level map, explicitly excluding all Taiwan source features.
import assert from 'node:assert/strict';
import { topology } from 'topojson-server';
import { merge } from 'topojson-client';
import { readSource, albers, fit, projectFeatures, emit } from './admin-map.mjs';

const source = {
  file: 'assets/maps/sources/china-admin1-natural-earth-v5.1.2.geojson.gz',
  sha256: 'aa315610acf793f25db4b178b528a5840f4c4f4f95f02bcd8b8acb625ca91239',
  url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson',
  upstreamSha256: '22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5',
  selection: 'Unmodified features with adm0_a3 in CHN, HKG, MAC; compact JSON serialization. No TWN features.',
  attribution: 'Made with Natural Earth · Admin 1 states and provinces, repository release v5.1.2',
  license: 'Public domain — https://www.naturalearthdata.com/about/terms-of-use/',
  modifications: 'Hong Kong districts dissolved; source Paracel Islands grouped with Hainan; English names; Albers projection; coordinate rounding; shared-border SVG; simplified thumbnail; small-target circles.',
};
const names = {
  AH: 'Anhui', BJ: 'Beijing', CQ: 'Chongqing', FJ: 'Fujian', GS: 'Gansu',
  GD: 'Guangdong', GX: 'Guangxi', GZ: 'Guizhou', HI: 'Hainan', HE: 'Hebei',
  HL: 'Heilongjiang', HA: 'Henan', HB: 'Hubei', HN: 'Hunan', JS: 'Jiangsu',
  JX: 'Jiangxi', JL: 'Jilin', LN: 'Liaoning', NM: 'Inner Mongolia', NX: 'Ningxia',
  QH: 'Qinghai', SN: 'Shaanxi', SD: 'Shandong', SH: 'Shanghai', SX: 'Shanxi',
  SC: 'Sichuan', TJ: 'Tianjin', XZ: 'Tibet', XJ: 'Xinjiang', YN: 'Yunnan',
  ZJ: 'Zhejiang', HK: 'Hong Kong', MO: 'Macao',
};
const autonomous = new Set(['GX', 'NM', 'NX', 'XZ', 'XJ']);
const municipalities = new Set(['BJ', 'CQ', 'SH', 'TJ']);
const special = new Set(['HK', 'MO']);
const features = await readSource(source);
assert.equal(features.length, 51);
for (const f of features) {
  const p = f.properties;
  assert(['CHN', 'HKG', 'MAC'].includes(p.adm0_a3));
  const suffix = p.adm0_a3 === 'HKG' ? 'HK' : p.adm0_a3 === 'MAC' ? 'MO'
    : p.iso_3166_2 === 'CN-X01~' ? 'HI' : p.iso_3166_2.slice(3);
  assert(names[suffix], `Unmapped region: ${p.name}`);
  f.properties = { code: `CN-${suffix}`, name: names[suffix], playable: true,
    kind: autonomous.has(suffix) ? 'autonomous region' : municipalities.has(suffix) ? 'municipality'
      : special.has(suffix) ? 'special administrative region' : 'province' };
}
const topo = topology({ regions: { type: 'FeatureCollection', features } });
const groups = new Map();
for (const g of topo.objects.regions.geometries) {
  if (!groups.has(g.properties.code)) groups.set(g.properties.code, []);
  groups.get(g.properties.code).push(g);
}
assert.deepEqual([...groups.keys()].sort(), Object.keys(names).map(n => `CN-${n}`).sort());
const dissolved = [...groups.values()].map(gs => ({ type: 'Feature', properties: gs[0].properties,
  geometry: merge(topo, gs) }));
const projection = albers(105, [25, 47]);
const smallCodes = ['CN-BJ', 'CN-TJ', 'CN-SH', 'CN-HK', 'CN-MO'];
await emit({ id: 'chinese-provinces', title: 'Chinese Provinces',
  solvedColor: '#de2910', solvedTitleColor: '#fff',
  features: projectFeatures(dissolved, fit(dissolved, projection, [24, 24, 1352, 1052])),
  source, viewBox: [0, 0, 1400, 1100],
  projection: 'Albers equal-area, central meridian 105° E, standard parallels 25° and 47° N',
  smallCodes,
  hitRadius: (entry, entries) => {
    const nearest = Math.min(...entries.filter(e => e.code !== entry.code && smallCodes.includes(e.code))
      .map(e => Math.hypot(e.anchor[0] - entry.anchor[0], e.anchor[1] - entry.anchor[1])));
    return +Math.min(12, nearest * .42).toFixed(3);
  },
  note: '33 province-level divisions: 22 provinces, five autonomous regions, four municipalities, and Hong Kong and Macao. Taiwan is excluded from both geometry and roster. Islands remain in geographic position. Dashed circles enlarge small targets. Boundaries follow Natural Earth’s release conventions.' });
