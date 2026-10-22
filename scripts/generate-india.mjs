// Offline India state/union territory assets from pinned geoBoundaries data.
import assert from 'node:assert/strict';
import { readSource, albers, fit, projectFeatures, emit } from './admin-map.mjs';

const source = {
  file: 'assets/maps/sources/india-geoboundaries-9469f09.geojson.gz',
  sha256: '47aa0acb6f69868daee49143276f3ce323f18905ba7d38d0a86816b405028736',
  url: 'https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/IND/ADM1/geoBoundaries-IND-ADM1.geojson',
  attribution: 'DataMeet India community / Election Commission of India, via geoBoundaries gbOpen IND ADM1 (9469f09)',
  license: 'CC BY 2.5 IN — https://creativecommons.org/licenses/by/2.5/in/',
  modifications: 'English display names, Albers projection, coordinate rounding, shared-border SVG and thumbnail conversion, and enlarged click circles for small regions.',
};


const names = {
  AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar',
  CT: 'Chhattisgarh', GA: 'Goa', GJ: 'Gujarat', HR: 'Haryana', HP: 'Himachal Pradesh',
  JH: 'Jharkhand', KA: 'Karnataka', KL: 'Kerala', MP: 'Madhya Pradesh', MH: 'Maharashtra',
  MN: 'Manipur', ML: 'Meghalaya', MZ: 'Mizoram', NL: 'Nagaland', OR: 'Odisha', PB: 'Punjab',
  RJ: 'Rajasthan', SK: 'Sikkim', TN: 'Tamil Nadu', TG: 'Telangana', TR: 'Tripura',
  UP: 'Uttar Pradesh', UT: 'Uttarakhand', WB: 'West Bengal',
  AN: 'Andaman and Nicobar Islands', CH: 'Chandigarh',
  DH: 'Dadra and Nagar Haveli and Daman and Diu', DL: 'Delhi', JK: 'Jammu and Kashmir',
  LA: 'Ladakh', LD: 'Lakshadweep', PY: 'Puducherry',
};
const territories = new Set(['AN', 'CH', 'DH', 'DL', 'JK', 'LA', 'LD', 'PY']);
const features = await readSource(source);
assert.equal(features.length, 36);
assert.deepEqual(features.map(f => f.properties.shapeISO.slice(3)).sort(), Object.keys(names).sort());
for (const f of features) {
  const code = f.properties.shapeISO.slice(3);
  f.properties = { code: `IN-${code}`, name: names[code], playable: true,
    kind: territories.has(code) ? 'union territory' : 'state' };
}
const projection = albers(82, [12, 32]);
await emit({ id: 'indian-states', title: 'Indian States',
  features: projectFeatures(features, fit(features, projection, [20, 20, 1060, 1160])),
  source, smallCodes: ['IN-CH', 'IN-DH', 'IN-DL', 'IN-GA', 'IN-LD', 'IN-PY', 'IN-SK'], viewBox: [0, 0, 1100, 1200], projection: 'Albers equal-area, central meridian 82° E, standard parallels 12° and 32° N',
  note: '28 states and 8 union territories. Islands remain in geographic position. Dashed circles enlarge small targets. Boundaries follow the source and do not resolve territorial disputes.' });
