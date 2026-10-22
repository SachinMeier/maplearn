// Offline generation: Natural Earth coastlines + curated, disjoint quiz regions.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import clipping from 'polygon-clipping';
import polylabel from 'polylabel';
import { topology } from 'topojson-server';
import { mesh } from 'topojson-client';
import { project, worldWidth, worldHeight } from './projection.mjs';
import { bounds } from './hit-areas.mjs';
import { generateWaterThumbnail } from './generate-thumbnails.mjs';

const root = new URL('../', import.meta.url);
const sources = [];
async function source(layer, checksum) {
  const file = `assets/maps/sources/ne_10m_${layer}.v5.1.2.geojson.gz`;
  const raw = gunzipSync(await readFile(new URL(file, root)));
  assert.equal(createHash('sha256').update(raw).digest('hex'), checksum);
  sources.push({ file, sha256: checksum, license: 'Public domain', url: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_${layer}.geojson` });
  return JSON.parse(raw);
}
const marine = await source('geography_marine_polys', '53f865e8ffa966cdd402145c82c5cd14ee7ce974cd0eb9a3f59f03a4cfd2d66c');
const ocean = await source('ocean', 'f9696a1337c746a0f6c8c13bc60d0f230d2ef8d105198d5657726c8f8e763fc2');
const round = n => +n.toFixed(3);
const polygons = g => g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
// Align the two cylindrical cuts, including the marine source's 179.999897°
// vertices. Otherwise a hairline of the parent ocean leaks along the seam.
const seam = [...marine.features, ...ocean.features].flatMap(f=>polygons(f.geometry).flat(2))
  .filter(p=>Math.abs(p[0])>=179.999).sort((a,b)=>a[1]-b[1]);
for(let i=0;i<seam.length;){let j=i+1;while(j<seam.length&&seam[j][1]-seam[i][1]<=.002)j++;
  const y=(seam[i][1]+seam[j-1][1])/2;
  for(let k=i;k<j;k++){seam[k][0]=Math.sign(seam[k][0])*180;seam[k][1]=y;}i=j;}
const shape = points => [[points.concat([points[0]])]];
const rectangle = (w,s,e,n) => shape([[w,s],[e,s],[e,n],[w,n]]);
const named = (...names) => clipping.union(...names.map(name => {
  const f = marine.features.find(f => f.properties.name === name);
  assert(f, `Missing marine source ${name}`);
  return polygons(f.geometry);
}));
const specs = [];
function sea(code, name, names = [name], extra = {}) { specs.push({code, name, names, ...extra}); }
// Small/nested targets are allocated first, so a click can belong to only one answer.
sea('bering-strait','Bering Strait',[], {mask:rectangle(-170.5,65.4,-167.3,66.35), padded:true});
sea('hormuz','Strait of Hormuz',[], {mask:shape([[55.8,26.2],[56.5,25.9],[57.1,26.3],[57.1,27.3],[55.8,27.3]]), padded:true});
sea('gibraltar','Strait of Gibraltar',undefined,{padded:true});
sea('malacca','Strait of Malacca');
sea('magellan','Strait of Magellan',['Estrecho de Magellanes'],{padded:true});
sea('james-bay','James Bay');
// Include the entire detailed inland basin and its connected lagoon under one
// answer. The enclosing mask prevents coastal slivers falling into an ocean.
sea('caspian','Caspian Sea',['Caspian Sea','Garabogaz Bay'], {extension:rectangle(46,35,56,48)});
sea('azov','Sea of Azov');
sea('adriatic','Adriatic Sea',undefined, {
  // Enclose the eastern Adriatic's inlets and island channels inland of the
  // coarse label boundary. The detailed ocean layer preserves the shoreline;
  // both rectangles end inside land or the existing Adriatic sea mask.
  extension:clipping.union(rectangle(13,42,21,47),rectangle(19,40,21,42)),
});
sea('ionian','Ionian Sea');
sea('aegean','Aegean Sea',['Aegean Sea','Sea of Crete']);
sea('english-channel','English Channel');
sea('aden','Gulf of Aden',['Gulf of Aden','Bab el Mandeb']);
sea('arabian','Arabian Sea');
sea('bengal','Bay of Bengal');
sea('red-sea','Red Sea',['Red Sea','Gulf of Suez','Gulf of Aqaba']);
sea('black-sea','Black Sea',['Black Sea','Sea of Marmara','Bosporus','Dardanelles']);
sea('north-sea','North Sea',['North Sea','Waddenzee','Skagerrak']);
sea('baltic','Baltic Sea',['Baltic Sea','Gulf of Bothnia','Gulf of Finland','Gulf of Riga','Kattegat','Øresund','Mecklenburger Bucht']);
sea('persian-gulf','Persian Gulf');
sea('south-china','South China Sea',['South China Sea','Gulf of Tonkin','Gulf of Thailand','Strait of Singapore','Qiongzhou Strait'], {
  // Carry the label mask inland along the mainland and western Borneo.
  // The ocean intersection still supplies every coastline/island; these
  // catchments close bays and coastal slivers without buffering open-sea limits.
  extension:clipping.union(
    shape([[103.85,1.2],[103,2.5],[101.8,4.5],[101,6],[100,7],[99.5,9],
      [99,11],[99,14],[104,15],[107,20],[106,24],[117,24],[117,23],
      [111,18],[105,8],[105,1]]),
    rectangle(108,18.5,111,21.5),
    shape([[108,-1],[111,-1],[112,1],[114,3],[116,5],[116.8,6.7],
      [116.3,7],[114,5],[108,3]]),
    rectangle(103.5,1.1,104.3,1.7),
    rectangle(103,-1.5,105,1)),
});
sea('mexico','Gulf of Mexico',['Gulf of Mexico','Bahía de Campeche']);
sea('bering-sea','Bering Sea',['Bering Sea','Bristol Bay','Norton Sound','Gulf of Anadyr\'']);
sea('okhotsk','Sea of Okhotsk',['Sea of Okhotsk','Shelikhova Gulf','Gulf of Sakhalin','Uda Bay']);
sea('yellow-sea','Yellow Sea',['Yellow Sea','Bo Hai'], {
  // Both northern arms (Bohai and Korea Bay) form one answer. Enclose their
  // detailed shorelines too, avoiding parent-ocean strips between source masks.
  extension:clipping.union(rectangle(117,37.5,126,41.5),
    shape([[120.8,32.2],[119,33],[118,37],[121,39],[122,38],[121,35],[122,33]])),
});
sea('hudson','Hudson Bay',['Hudson Bay','Foxe Basin']);
sea('japan','Sea of Japan',['Sea of Japan','East Korea Bay','Tatar Strait'], {
  extension:clipping.union(
    // Stay on the Sea of Japan side of Honshu's inland divide.
    shape([[131,34.5],[132,34.7],[134,35.2],[135,35],[136,35.3],
      [137,36.3],[138.6,36.8],[139.6,38],[140.5,39.5],[140.6,41.2],
      [139.5,41.5],[138,40],[136,38],[133,36],[131,35]]),
    shape([[128,37],[129,35.8],[130,36],[131,39],[129,42],[127,41],[127,39]])),
});
sea('east-china','East China Sea',['East China Sea','Taiwan Strait','Hangzhou Bay','Yangtze River','Korea Strait'], {
  extension:clipping.union(
    // Mainland coastal catchment, with the north/south ends inside land.
    shape([[117.4,23.8],[117.4,26],[119,29],[120,32],[121.8,32],
      [123,31.5],[123,29],[121,26],[119,24.5]]),
    // Korea's southern bays belong with the Korea Strait, rather than Pacific.
    shape([[126,34],[126.2,35],[128.5,35.5],[129.6,36],[130,35.5],[128,33.5]])),
});

sea('mediterranean','Mediterranean Sea',['Mediterranean Sea','Alboran Sea','Balearic Sea','Ligurian Sea','Tyrrhenian Sea','Gulf of Sidra','Gulf of Gabès','Golfe du Lion']);
// The connected Maracaibo basin is grouped with the Caribbean, not a separate
// lake question. Its source polygon otherwise falls through to the Atlantic.
sea('caribbean','Caribbean Sea',['Caribbean Sea','Gulf of Honduras','Golfo de Urabá','Lago de Maracaibo'], {
  // Enclose the whole inlet, including the detailed shoreline outside the
  // coarser marine-label polygon. The extension meets only land/Caribbean water.
  extension: rectangle(-72.3,8.8,-70.8,11.5),
});

// Natural Earth's ocean layer includes the requested Caspian basin and lagoon.
// No additional lake dataset is loaded.
const water = polygons(ocean.features[0].geometry);
const allocated = [];
const entries = [];
for (const spec of specs) {
  const sourceMask = spec.mask ?? named(...spec.names);
  const mask = spec.extension ? clipping.union(sourceMask,spec.extension) : sourceMask;
  const exclusive = allocated.length ? clipping.difference(mask, ...allocated) : mask;
  const geometry = clipping.intersection(water, exclusive);
  assert(geometry.length, `Empty region ${spec.name}`);
  allocated.push(mask);
  entries.push({...spec, geometry});
  console.log(`Allocated ${spec.name}`);
}
let remaining = clipping.difference(water, ...allocated);
// Broad ocean divisions cross land where possible. Only the open-water sections
// matter: 60°S, Cape Agulhas (20°E), Tasmania (146.9°E), Cape Horn (67.3°W).
const basins = [
  ['southern','Southern Ocean',rectangle(-180,-90,180,-60)],
  // The White Sea extends south of the Arctic Circle. Enclose its detailed
  // shoreline as well as the source label area, so none falls into the Atlantic.
  ['arctic','Arctic Ocean',clipping.union(rectangle(-180,66.562,180,90),
    named('White Sea'),rectangle(31,63,45,67)),['White Sea']],
  ['indian','Indian Ocean',shape([[20,-60],[146.9,-60],[146.9,-40],[130,-12],[105,-5],[99,8],[99,30],[45,35],[35,30],[20,30]])],
  // Follow the continental interior through Mexico and the Central American
  // isthmus. A straight shortcut crosses the Pacific off southern Mexico.
  ['atlantic','Atlantic Ocean',shape([[-67.3,-60],[20,-60],[20,30],[45,35],[45,66.562],
    [-100,66.562],[-100,25],[-99,20],[-97,18],[-94.5,17.5],[-92,16.5],
    [-90.5,15.2],[-88.8,14.5],[-86.5,13.3],[-85.2,11.8],[-84,10.1],
    [-83,9.2],[-82,8.7],[-81.2,8.5],[-80.6,8.6],[-80,9.05],[-79.5,9.2],
    [-78.5,9.1],[-77.5,8],[-76.5,6],[-75,1],[-70,-20],[-67.3,-56]])],
  ['pacific','Pacific Ocean',rectangle(-180,-90,180,90)],
];
for (const [code,name,mask,names = []] of basins) {
  const geometry=clipping.intersection(remaining,mask);
  remaining=clipping.difference(remaining,mask);
  entries.push({code,name,geometry,names});
  console.log(`Allocated ${name}`);
}
assert.equal(remaining.length,0,'All marine water must be allocated');
const area = ring => Math.abs(ring.reduce((a,p,i)=>{const q=ring[(i+1)%ring.length];return a+p[0]*q[1]-q[0]*p[1]},0)/2);
const path = ps => ps.map(p=>p.map(r=>'M'+r.map(p=>p.join(',')).join('L')+'Z').join('')).join('');
// Project shared vertices identically. Topology makes a single border mesh.
for (const e of entries) {
  e.geometry=e.geometry.map(p=>p.map(r=>r.map(p=>project(p).map(round))));
  const main = [...e.geometry].sort((a,b)=>area(b[0])-area(a[0]))[0];
  e.anchor=polylabel(main,.001).slice(0,2).map(round);
  e.focusBox=bounds(main[0]).map(round);
  if(e.padded) {
    // Explicitly artificial envelopes: enlarged on land too, like small islands.
    const b=e.focusBox, cx=b[0]+b[2]/2,cy=b[1]+b[3]/2;
    const rx=Math.max(6,b[2]/2+3),ry=Math.max(6,b[3]/2+3);
    const ring=Array.from({length:64},(_,i)=>[round(cx+rx*Math.cos(i*Math.PI/32)),round(cy+ry*Math.sin(i*Math.PI/32))]);
    e.hit=shape(ring);e.focusBox=[cx-rx,cy-ry,rx*2,ry*2].map(round);
  }
}
const topo=topology({regions:{type:'GeometryCollection',geometries:entries.map(e=>({type:'MultiPolygon',coordinates:e.geometry}))}});
const borders=mesh(topo).coordinates;
const drawnEdges = new Set();
function outline(points) {
  let s='', drawing=false;
  for(let i=1;i<points.length;i++) {
    const a=points[i-1], b=points[i], aa=a.join(','), bb=b.join(',');
    const cut=(a[0]===b[0]&&(a[0]===0||a[0]===worldWidth))||(a[1]===b[1]&&(a[1]===0||a[1]===worldHeight));
    const key=aa<bb?`${aa} ${bb}`:`${bb} ${aa}`;
    // Rounding can collapse a microscopic coastal sliver onto its neighbor.
    if(cut||aa===bb||drawnEdges.has(key)){drawing=false;continue;}
    drawnEdges.add(key);
    if(!drawing)s+='M'+aa;
    s+='L'+bb; drawing=true;
  }
  return s;
}
const canals = [
  {code:'suez',name:'Suez Canal',route:[[32.3,31.27],[32.31,30.91],[32.34,30.6],[32.49,30.36],[32.57,30.05],[32.58,29.93]]},
  {code:'panama',name:'Panama Canal',route:[[-79.92,9.38],[-79.92,9.28],[-79.85,9.18],[-79.77,9.12],[-79.69,9.12],[-79.65,9.04],[-79.59,8.99],[-79.55,8.93]]},
];
for(const e of canals){e.route=e.route.map(p=>project(p).map(round));const b=bounds(e.route);const cx=b[0]+b[2]/2,cy=b[1]+b[3]/2;const rx=Math.max(6,b[2]/2+3),ry=Math.max(6,b[3]/2+3);e.hit=shape(Array.from({length:64},(_,i)=>[round(cx+rx*Math.cos(i*Math.PI/32)),round(cy+ry*Math.sin(i*Math.PI/32))]));e.anchor=[round(cx),round(cy)];e.focusBox=[cx-rx,cy-ry,rx*2,ry*2].map(round);entries.push(e);}
const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;');
const parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${worldWidth} ${worldHeight}" class="geographic-map water-map" data-wrap-width="${worldWidth}" data-projection="Miller cylindrical" aria-label="World Oceans and Seas">`,
'<title>World Oceans &amp; Seas</title><desc>Made with Natural Earth (public domain). Curated educational water regions with approximate sea limits, detailed coastlines, and enlarged dashed targets for narrow straits and canals. Caspian Sea included; no other standalone lake questions. Canal centerlines are schematic, not navigation charts.</desc>',
`<style>.water-map{background:#b5d7e3;--land:#b5d7e3;--solved:#286890}.water-region{fill:#b5d7e3!important;filter:none!important}.water-region.solved,.water-region.revealed{fill:#286890!important}.water-region .region-fill{fill:inherit;stroke:none!important;fill-rule:evenodd}.water-region .hit-area{fill:inherit!important;fill-opacity:.35;stroke:none!important;pointer-events:fill}.water-hit-outline{fill:none;stroke:#172f3c;stroke-width:.85;stroke-dasharray:3 3;vector-effect:non-scaling-stroke;pointer-events:none}.water-borders{fill:none;stroke:#111;stroke-width:.65;vector-effect:non-scaling-stroke;pointer-events:none}.water-canal{fill:none;stroke:#467c99;stroke-width:1.7;vector-effect:non-scaling-stroke;pointer-events:stroke}.water-region.solved .water-canal{stroke:#183e5f}.water-region:focus-visible .region-fill,.water-region:focus-visible .hit-area{filter:brightness(1.2)}@media(hover:hover){.water-region:hover .region-fill,.water-region.wrap-hover .region-fill{filter:brightness(1.14)}}</style>`,
`<rect width="${worldWidth}" height="${worldHeight}" fill="#c8c4b6" pointer-events="none"/>`];
// Entire tile is muted land; the exact ocean polygons cut every coast/island out.
for(const e of [...entries].sort((a,b)=>Number(!!a.hit)-Number(!!b.hit))) {
 parts.push(`<g data-country="${e.code}" class="map-region water-region" data-focus-box="${e.focusBox.join(' ')}"><title>${escape(e.name)}</title>${e.hit?`<path class="hit-area" data-min-target-width="12" d="${path(e.hit)}"/><path class="water-hit-outline" d="${path(e.hit)}"/>`:''}${e.geometry?`<path class="region-fill" d="${path(e.geometry)}"/>`:`<path class="water-canal" d="M${e.route.map(p=>p.join(',')).join('L')}"/>`}</g>`);
}
parts.push(`<path class="water-borders" d="${borders.map(outline).join('')}"/></svg>\n`);
const svg=parts.join('\n');
const roster=entries.map(({code,name})=>({code,name,microstate:false}));
await writeFile(new URL('assets/maps/world-waters.svg',root),svg);
await writeFile(new URL('assets/maps/world-waters.countries.json',root),JSON.stringify(roster,null,2)+'\n');
await writeFile(new URL('assets/maps/world-waters.manifest.json',root),JSON.stringify({sources,projection:'Miller cylindrical',viewBox:[0,0,worldWidth,worldHeight],wrapWidth:worldWidth,notes:['Caspian Sea included by request; no other standalone lake questions. Connected Maracaibo basin grouped with the Caribbean.','Natural Earth marine label limits are approximate. Detailed ocean geometry supplies coastlines.','Small straits and canals use artificial dashed click envelopes. Canal routes are schematic.','Sub-seas omitted from the roster are grouped with their named sea or parent ocean.'],regions:Object.fromEntries(entries.map(e=>[e.code,{name:e.name,anchor:e.anchor,focusBox:e.focusBox,sourceNames:e.names??[],artificialTarget:!!e.hit,schematic:!!e.route}]))},null,2)+'\n');
await generateWaterThumbnail();
console.log(`Wrote ${roster.length} targets; ${svg.length} SVG bytes.`);
