// Temporary hit-test fixture, deliberately not geographic artwork.
import { readFile, writeFile } from 'node:fs/promises';
const countries = JSON.parse(await readFile(new URL('../data/countries.json', import.meta.url)));
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const columns = 20, size = 60, rows = Math.ceil(countries.length / columns);
const tiles = countries.map((country, index) => {
  const x = (index % columns) * size, y = Math.floor(index / columns) * size;
  return `<g data-country="${country.code}" aria-label="${escape(country.name)}"><title>${escape(country.name)}</title><rect class="region-fill" x="${x + 4}" y="${y + 4}" width="52" height="52" rx="4"/><text class="placeholder-label" x="${x + 30}" y="${y + 30}">${country.code}</text></g>`;
}).join('\n');
await writeFile(new URL('../assets/world-placeholder.svg', import.meta.url), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${columns * size} ${rows * size}" aria-label="World placeholder: country code tiles" data-placeholder="true">\n${tiles}\n</svg>\n`);
