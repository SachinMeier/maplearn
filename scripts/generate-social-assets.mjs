// Reuse the playable world's projection and shared borders for share artwork.
// Run explicitly; generated assets are checked in, so builds need no browser.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { simplifyPath } from './generate-thumbnails.mjs';

const root = new URL('../', import.meta.url);
const svg = await readFile(new URL('assets/maps/world.svg', root), 'utf8');
const geometry = className => [...svg.matchAll(new RegExp(`<path class="${className}"[^>]* d="([^"]+)"`, 'g'))]
  .map(([, d]) => simplifyPath(d, 2)).join('');
const land = geometry('region-fill');
const borders = geometry('border-mesh');
if (!land || !borders) throw new Error('World artwork requires land and shared borders.');
await mkdir(new URL('assets/social/', root), { recursive: true });
await mkdir(new URL('assets/favicons/', root), { recursive: true });

const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<title>Maps — Learn the world, one place at a time.</title>
<desc>Stylized Natural Earth world map in the game's Miller projection, with bold country borders. Polar edges are cropped for the landscape preview.</desc>
<defs>
  <radialGradient id="ocean"><stop stop-color="#234453"/><stop offset="1" stop-color="#101720"/></radialGradient>
  <linearGradient id="land" x2="0.3" y2="1"><stop stop-color="#f0e2c4"/><stop offset="1" stop-color="#c6b58e"/></linearGradient>
</defs>
<rect width="1200" height="630" fill="url(#ocean)"/>
<g fill="none" stroke="#b7d9cc" stroke-opacity=".06">
  ${Array.from({ length: 15 }, (_, i) => `<path d="M${40 + i * 80} 130V560"/>`).join('')}
  ${Array.from({ length: 6 }, (_, i) => `<path d="M40 ${150 + i * 80}H1160"/>`).join('')}
</g>
<g fill="none" stroke="#b7d9cc" stroke-width="2.5">
  <circle cx="65" cy="65" r="20"/><ellipse cx="65" cy="65" rx="8" ry="20"/><path d="M45 65h40"/>
</g>
<text x="104" y="81" fill="#f5f0e6" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="700" letter-spacing="-1.5">Maps</text>
<text x="1150" y="72" text-anchor="end" fill="#b7d9cc" font-family="Arial, Helvetica, sans-serif" font-size="19">Learn the world, one place at a time.</text>
<svg x="40" y="122" width="1120" height="436" viewBox="0 80 3600 1910" preserveAspectRatio="xMidYMid meet">
  <path fill="#060e14" fill-opacity=".55" fill-rule="evenodd" transform="translate(0 16)" d="${land}"/>
  <path fill="url(#land)" fill-rule="evenodd" d="${land}"/>
  <path fill="none" stroke="#233638" stroke-width="1.25" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" d="${borders}"/>
</svg>
<path d="M50 581H1150" stroke="#b7d9cc" stroke-opacity=".2"/>
<text x="50" y="610" fill="#b7d9cc" font-family="Arial, Helvetica, sans-serif" font-size="15" letter-spacing="2">EXPLORE · LEARN · PLAY</text>
<text x="1150" y="610" text-anchor="end" fill="#9aaeb5" font-family="Arial, Helvetica, sans-serif" font-size="15">maps.pirategames.org</text>
</svg>\n`;
await writeFile(new URL('assets/social/world.svg', root), artwork);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const render = async (source, width, height, path) => {
    await page.setViewportSize({ width, height });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}svg{display:block;width:100%;height:100%}</style>${source}`);
    await page.screenshot({ path: new URL(path, root).pathname, omitBackground: true });
  };
  await render(artwork, 1200, 630, 'assets/social/world.png');
  const icon = await readFile(new URL('assets/globe.svg', root), 'utf8');
  for (const size of [16, 32, 48, 180, 192, 512]) {
    await render(icon, size, size, `assets/favicons/icon-${size}.png`);
  }
  // ICO supports embedded PNG images; include multiple native favicon sizes.
  const sizes = [16, 32, 48];
  const images = await Promise.all(sizes.map(size => readFile(new URL(`assets/favicons/icon-${size}.png`, root))));
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  images.forEach((image, i) => {
    const entry = 6 + i * 16;
    header[entry] = sizes[i]; header[entry + 1] = sizes[i];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  await writeFile(new URL('favicon.ico', root), Buffer.concat([header, ...images]));
} finally {
  await browser.close();
}
console.log('Generated world share artwork and globe favicons.');
