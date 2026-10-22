// Kept separate so concurrent continent additions do not replace these options.
export const usNycMaps = [
  ['us-states', 'U.S. States', 'state'],
  ['nyc-manhattan', 'Manhattan Neighborhoods', 'neighborhood'],
  ['nyc-brooklyn', 'Brooklyn Neighborhoods', 'neighborhood'],
  ['nyc-queens', 'Queens Neighborhoods', 'neighborhood'],
].map(([id, name, unit]) => ({
  id, name, unit, category: 'us', microstates: false,
  svg: `./assets/maps/${id}.svg`, countries: `./assets/maps/${id}.countries.json`,
  credit: unit === 'neighborhood' ? 'Approximate neighborhood boundaries · Chris Whong / Zillow · CC BY-SA 4.0' : 'U.S. Census Bureau · 50 states',
  creditUrl: unit === 'neighborhood' ? './assets/maps/us-nyc-sources.html' : 'https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/State_County/MapServer/7',
}));
