import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { maps } from '../maps.js';
const root=new URL('../',import.meta.url);
const svg=readFileSync(new URL('assets/maps/world-waters.svg',root),'utf8');
const manifest=JSON.parse(readFileSync(new URL('assets/maps/world-waters.manifest.json',root)));
const roster=JSON.parse(readFileSync(new URL('assets/maps/world-waters.countries.json',root)));

test('water roster is complete, source snapshots are pinned, and menu registration is unique',()=>{
  assert.equal(roster.length,37);
  assert(roster.every(r=>r.microstate===false));
  assert(!roster.some(r=>/lake/i.test(r.name)));
  assert.equal(roster.find(r=>r.code==='caspian')?.name,'Caspian Sea');
  assert.equal(roster.find(r=>r.code==='aegean')?.name,'Aegean Sea');
  assert.equal(roster.find(r=>r.code==='malacca')?.name,'Strait of Malacca');
  assert.equal(roster.find(r=>r.code==='okhotsk')?.name,'Sea of Okhotsk');
  assert.equal(roster.find(r=>r.code==='aden')?.name,'Gulf of Aden');
  assert.equal(roster.find(r=>r.code==='east-china')?.name,'East China Sea');
  for(const code of ['singapore','kamchatka-gulf','korea-bay'])assert(!roster.some(r=>r.code===code));
  const codes=[...svg.matchAll(/<g data-country="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(codes.sort(),roster.map(r=>r.code).sort());
  assert.equal(maps.filter(m=>m.id==='world-waters').length,1);
  assert.equal(maps.find(m=>m.id==='world-waters').microstates,false);
  for(const s of manifest.sources)assert.equal(createHash('sha256').update(gunzipSync(readFileSync(new URL(s.file,root)))).digest('hex'),s.sha256);
  for(const r of Object.values(manifest.regions))assert(r.anchor.every(Number.isFinite)&&r.focusBox.every(Number.isFinite));
  for(const code of ['suez','panama','hormuz','magellan','gibraltar','bering-strait'])assert(manifest.regions[code].artificialTarget);
});

test('water coastlines and shared limits have one border stroke; cylindrical cuts have none',()=>{
  const edges=new Map();
  const add=(a,b,kind)=>{
    if(a===b)return;
    const key=a<b?`${a} ${b}`:`${b} ${a}`;
    if(!edges.has(key))edges.set(key,[0,0]);
    edges.get(key)[kind]++;
  };
  for(const m of svg.matchAll(/<path class="(region-fill|water-borders)"[^>]* d="([^"]+)"/g)){
    let start,previous;
    const kind=m[1]==='water-borders'?1:0;
    for(const c of m[2].matchAll(/([MLZ])([\d.,-]*)/g)){
      if(c[1]==='M')start=previous=c[2];
      else if(c[1]==='L'){add(previous,c[2],kind);previous=c[2];}
      else add(previous,start,kind);
    }
  }
  assert(edges.size>400000,'Retain detailed coastal geometry');
  for(const [key,[fills,strokes]] of edges){
    const [a,b]=key.split(' ').map(p=>p.split(',').map(Number));
    const cut=(a[0]===b[0]&&(a[0]===0||a[0]===manifest.wrapWidth))||(a[1]===b[1]&&(a[1]===0||a[1]===manifest.viewBox[3]));
    assert(fills>0,`Border without fill: ${key}`);
    assert.equal(strokes,cut?0:1,`Missing or doubled border: ${key}`);
  }
});
