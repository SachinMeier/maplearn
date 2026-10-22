import { usNycMaps } from './us-nyc-maps.js';

export const maps = [
  ['world', 'World'],
  ['north-america', 'North America'],
  ['south-america', 'South America'],
  ['europe', 'Europe'],
  ['africa', 'Africa'],
  ['asia', 'Asia'],
  ['oceania', 'Oceania'],
].map(([id, name]) => ({ id, name, category: 'continents', svg: `./assets/maps/${id}.svg`,
  countries: id === 'world' ? './data/countries.json' : `./assets/maps/${id}.countries.json` }));

maps.push({ id: 'world-waters', name: 'World Oceans & Seas', category: 'water', unit: 'water region', microstates: false,
  credit: 'Made with Natural Earth · approximate sea limits; dashed outlines are enlarged click targets',
  creditUrl: 'https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-physical-labels/',
  svg: './assets/maps/world-waters.svg', countries: './assets/maps/world-waters.countries.json' });

maps.push(...usNycMaps);

maps.push({ id: 'europe-rivers', name: 'European Rivers', category: 'other', unit: 'river', microstates: false,
  focus: { duration: 650, maxZoom: 5, smooth: true },
  credit: 'Made with Natural Earth · 31 major rivers · Volga shown in part · river lines have enlarged tap targets',
  creditUrl: 'https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-rivers-lake-centerlines/',
  svg: './assets/maps/europe-rivers.svg', countries: './assets/maps/europe-rivers.countries.json' });

maps.push({ id: 'massachusetts-towns', name: 'Massachusetts Towns', category: 'us', unit: 'town', microstates: false,
  focus: { duration: 1100, maxZoom: 3, smooth: true },
  solvedTownLabels: true,
  townLabelPositions: {
    'MA-BROCKTON': 'below', 'MA-BRIDGEWATER': 'below',
    'MA-LEXINGTON': 'below', 'MA-TEWKSBURY': 'below', 'MA-READING': 'below',
    'MA-CHICOPEE': 'right', 'MA-SPRINGFIELD': 'below-right', 'MA-AGAWAM': 'below-left',
    'MA-NORTH-ADAMS': 'right', 'MA-NORTHAMPTON': 'left',
    'MA-NEWBURYPORT': 'below', 'MA-SALISBURY': 'above', 'MA-CAMBRIDGE': { side: 'above', offsetX: 24 },
  },
  credit: 'MassGIS town hall locations · U.S. Census Bureau state boundaries · dashed circles are town targets, not boundaries',
  creditUrl: 'https://www.mass.gov/info-details/massgis-data-town-and-city-halls',
  svg: './assets/maps/massachusetts-towns.svg', countries: './assets/maps/massachusetts-towns.countries.json' });

maps.push({ id: 'french-departments', name: 'French Departments', unit: 'department', microstates: false,
  credit: 'Boundaries: Etalab / IGN · ODbL 1.0. Rivers: IGN / OFB / Sandre, BD TOPAGE · Licence Ouverte 2.0',
  creditUrl: 'https://www.data.gouv.fr/datasets/contours-administratifs',
  svg: './assets/maps/french-departments.svg', countries: './assets/maps/french-departments.countries.json' });

maps.push({ id: 'indian-states', name: 'Indian States', unit: 'state or union territory', microstates: false,
  credit: 'DataMeet / Election Commission of India via geoBoundaries · CC BY 2.5 IN · dashed circles enlarge small targets',
  creditUrl: 'https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/',
  svg: './assets/maps/indian-states.svg', countries: './assets/maps/indian-states.countries.json' });

maps.push({ id: 'chinese-provinces', name: 'Chinese Provinces', unit: 'province-level division', microstates: false,
  credit: 'Made with Natural Earth · 33 province-level divisions, excluding Taiwan · dashed circles enlarge small targets',
  creditUrl: 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/',
  svg: './assets/maps/chinese-provinces.svg', countries: './assets/maps/chinese-provinces.countries.json' });
