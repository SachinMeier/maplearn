import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { project } from '../scripts/projection.mjs';
const manifest = JSON.parse(readFileSync(new URL('../assets/maps/world-waters.manifest.json',import.meta.url)));
const roster = Object.entries(manifest.regions);

test('water menu skips microstates, every target receives real pointer hits, colors and retry', async ({page,isMobile}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror', e=>errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button',{name:'World Oceans & Seas',exact:true}).click();
  await expect(page.locator('#setup-dialog')).not.toBeVisible();
  await expect(page.locator('#progress')).toHaveText(`0 / ${roster.length}`);
  await expect(page.locator('#map-surface > svg')).toHaveAttribute('data-wrap-width','3600');
  await page.keyboard.press('Tab');
  const failures=await page.evaluate(regions=>{
    const bad=[];
    for(const [code,entry] of Object.entries(regions)) {
      const region=document.querySelector(`[data-country="${code}"]`);region.focus();
      const svg=region.ownerSVGElement,v=svg.viewBox.baseVal;
      const x=entry.anchor[0]+Math.round((v.x+v.width/2-entry.anchor[0])/3600)*3600;
      const p=new DOMPoint(x,entry.anchor[1]).matrixTransform(svg.getScreenCTM());
      const hit=document.elementFromPoint(p.x,p.y)?.closest('[data-country],[data-wrap-country]');
      if((hit?.dataset.country??hit?.dataset.wrapCountry)!==code)bad.push({code,hit:hit?.outerHTML.slice(0,100)});
    }
    return bad;
  },manifest.regions);
  expect(failures).toEqual([]);
  // Each answer is clicked at its actual map-space anchor after camera focusing.
  for(let i=0;i<roster.length;i++) {
    const name=await page.locator('#country-name').textContent();
    const [code,entry]=roster.find(([,e])=>e.name===name);
    const region=page.locator(`[data-country="${code}"]`);
    await page.keyboard.press('Tab');await region.focus();
    const point=await region.evaluate((el,anchor)=>{
      const svg=el.ownerSVGElement,v=svg.viewBox.baseVal;
      const x=anchor[0]+Math.round((v.x+v.width/2-anchor[0])/3600)*3600;
      const p=new DOMPoint(x,anchor[1]).matrixTransform(svg.getScreenCTM());return {x:p.x,y:p.y};
    },entry.anchor);
    if(isMobile) await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
    await expect(page.locator('#progress')).toHaveText(`${i+1} / ${roster.length}`);
    expect(await region.evaluate(el=>getComputedStyle(el).fill)).toBe('rgb(40, 104, 144)');
  }
  await expect(page.getByRole('heading',{name:'Congratulations'})).toBeVisible();
  await expect(page.locator('#final-incorrect')).toHaveText('0');
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(page.locator('#progress')).toHaveText(`0 / ${roster.length}`);
  await page.locator('#country-pill').click();
  await expect(page.locator('#menu-reveals')).toHaveText('1');
  await expect(page.locator('#country-pill')).toBeEnabled();
  await page.getByRole('button',{name:'Open menu'}).click();
  await expect(page.locator('#menu-title')).toHaveText('World Oceans & Seas');
  await page.getByRole('link',{name:'Home',exact:true}).click();
  await expect(page.locator('#home')).toBeVisible();
  expect(errors).toEqual([]);
});

test('geographic samples, both Pacific halves, and excluded lakes',async({page})=>{
  await page.goto('/#/world-waters');
  await expect(page.locator('#progress')).toHaveText(`0 / ${roster.length}`);
  const samples=[[-140,20,'pacific'],[170,0,'pacific'],[-30,25,'atlantic'],[80,-20,'indian'],[0,-65,'southern'],[0,85,'arctic'],[51,42,'caspian'],[51,38,'caspian'],[-87,44,null],[30,0,null],[38,20,'red-sea'],[16,43,'adriatic'],[32,43,'black-sea'],[-85,25,'mexico'],[135,40,'japan'],[150,55,'okhotsk'],[125,39.5,'yellow-sea'],[124,35,'yellow-sea'],[-80,53,'james-bay'],
    // Both northern Yellow Sea arms are included in the same target.
    [120,38.7,'yellow-sea'],[121,40.3,'yellow-sea'],[124,38,'yellow-sea'],
    // Requested replacement and removed target fall into their proper regions.
    [98.5,6.2,'malacca'],[100,4.5,'malacca'],[103.59,1.20,'south-china'],
    [162.36,55.77,'pacific'],
    // Pacific coast from Mexico through Central America; neither basin may
    // acquire offshore wedges through a shortcut across the land divide.
    [-99,15,'pacific'],[-96,14,'pacific'],[-93,14,'pacific'],[-90,12,'pacific'],
    [-85,8,'pacific'],[-81,7,'pacific'],[-96,22,'mexico'],[-84,17,'caribbean'],
    // Gulf of Venezuela and its connected Maracaibo basin share one answer.
    [-71.5,11.3,'caribbean'],[-71.5,10,'caribbean'],[-71.6,10.5,'caribbean'],
    // Aegean and its Sea of Crete subdivision are separate from Mediterranean.
    [25,39,'aegean'],[25,36,'aegean'],[29,33,'mediterranean'],
    // White Sea: both sides of the Arctic Circle, including the southern bays.
    [36,65.5,'arctic'],[39,65,'arctic'],[37,64.3,'arctic'],[34,66.5,'arctic'],
    [41,68,'arctic'],[5,64,'atlantic'],
    // Gulf of Aden, its western passage, and the adjacent Arabian Sea.
    [49.55,12.9,'aden'],[45,12.5,'aden'],[43.4,12.5,'aden'],
    [43.3,12.6,'red-sea'],[60,15,'arabian'],
    // Coastal bays/straits must not leak into the fallback Pacific polygon.
    [110,20.15,'south-china'], // Qiongzhou Strait, north of Hainan
    [109.05,1.35,'south-china'],[109.3,1.75,'south-china'],
    [103.5,4.2,'south-china'],[110.3,1.8,'south-china'],[115.2,5,'south-china'],
    [103.5,-0.7,'south-china'],[104.4,-1.2,'south-china'],
    [119.2,34.75,'yellow-sea'],[120.3,36.25,'yellow-sea'],
    [120.75,36.6,'yellow-sea'],[121.55,36.8,'yellow-sea'],
    [132.65,35.35,'japan'],[135.65,35.5,'japan'],
    [137.25,37.4,'japan'],[139.55,38.55,'japan'],
    [121.5,30.5,'east-china'],[121.6,31.7,'east-china'],
    [125,29,'east-china'],[119.5,24,'east-china'],
    // Preserve the Pacific-facing side of Japan and the seas east of Borneo.
    [139.8,35.1,'pacific'],[120,7,'pacific'],[123,3,'pacific'],
    // Eastern Adriatic bays and island channels must not fall into Atlantic.
    [13.7,45.55,'adriatic'],[14.55,45.3,'adriatic'],
    [14.85,44.6,'adriatic'],[15.2,44.35,'adriatic'],
    [15.6,43.85,'adriatic'],[16.4,43.55,'adriatic'],
    [18.65,42.45,'adriatic'],[18.7,42.4,'adriatic'],
    [19.5,41.25,'adriatic'],[19.55,41.6,'adriatic'],
    // The coastal repair must preserve the adjacent Ionian Sea and land.
    [19,39,'ionian'],[16,45,null],
  ].map(([lon,lat,code])=>({point:project([lon,lat]),code}));
  const failures=await page.evaluate(samples=>{
    const regions=[...document.querySelectorAll('[data-country]')];const bad=[];
    for(const {point,code} of samples){const p=new DOMPoint(...point);const matches=regions.filter(r=>[...r.querySelectorAll('.region-fill,.hit-area')].some(path=>path.isPointInFill(p))).map(r=>r.dataset.country);if(code? matches.length!==1||matches[0]!==code:matches.length)bad.push({point,code,matches});}
    return bad;
  },samples);
  expect(failures).toEqual([]);
});
