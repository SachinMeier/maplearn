# Chinese Provinces

Local route: `#/chinese-provinces`. The map has 33 playable province-level
divisions, with Taiwan excluded from the source selection, geometry, and roster.

- Provinces (22): Anhui, Fujian, Gansu, Guangdong, Guizhou, Hainan, Hebei,
  Heilongjiang, Henan, Hubei, Hunan, Jiangsu, Jiangxi, Jilin, Liaoning, Qinghai,
  Shaanxi, Shandong, Shanxi, Sichuan, Yunnan, Zhejiang.
- Autonomous regions (5): Guangxi, Inner Mongolia, Ningxia, Tibet, Xinjiang.
- Municipalities (4): Beijing, Chongqing, Shanghai, Tianjin.
- Special administrative regions (2): Hong Kong, Macao.

## Source and reproduction

Made with [Natural Earth Admin 1 states and provinces](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/),
[repository release v5.1.2](https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2).
The data is [public domain](https://www.naturalearthdata.com/about/terms-of-use/).
The manifest records the exact upstream URL, its SHA-256, and the SHA-256 of the
bundled gzip archive's uncompressed GeoJSON.

The archive retains all 51 source features whose `adm0_a3` is `CHN`, `HKG`, or
`MAC`, without changing their properties or coordinates. It uses compact UTF-8
JSON serialization with a trailing newline. No `TWN` features are selected.
Hong Kong's 18 district features dissolve into one target without internal
district borders. The source's separate Paracel Islands feature is grouped with
Hainan. All other source boundaries follow this release's cartographic
conventions; this is not an updated survey of disputed boundaries.

The generator uses Albers equal-area projection (central meridian 105° E,
standard parallels 25° and 47° N), fitted to a 1400 × 1100 canvas. Islands remain
in geographic position. The gameplay geometry is not simplified; coordinates
are rounded to three decimals and zero-length edges are removed. Fills and
shared borders use the same topology, with each edge stroked once.
Only the home-menu thumbnail is simplified.

Beijing, Tianjin, Shanghai, Hong Kong, and Macao receive dashed click circles.
Circle radii are capped at 12 map units and 42% of the nearest other small
target's anchor distance, keeping the circles separate. They are assisted
click targets, not administrative boundaries. Zoom allows precise selection.

```sh
npm run maps:china
node --test tests/china.test.js
npx playwright test tests/china.spec.js
```

The generator verifies the pinned source checksum and all 33 codes. Asset tests
check the complete roster, exclusion of Taiwan, circle separation, and exactly
one matching border stroke for every fill edge. Browser tests exercise the menu,
native hit testing on every region, a complete round with zoom and pan, mobile
taps, reveals, scoring, and retry. `scripts/admin-map.mjs` shares the renderer
with the Indian States map.
