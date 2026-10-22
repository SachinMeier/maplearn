# Map assets

`world.svg` is the ready-to-use, locally served game asset. `world.manifest.json` records the source checksum, code mappings, country anchors, reveal bounds, hit outlines, and geometry statistics. No map processing is needed at runtime.

## Source and license

- [Natural Earth 1:10 million Admin 0 map units](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-details/), from [repository release v5.1.2](https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2). This is the repository release; the map-units download page identifies the layer as version 5.1.1.
- [Exact GeoJSON source](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_map_units.geojson), archived losslessly in `sources/ne_10m_admin_0_map_units.v5.1.2.geojson.gz`.
- SHA-256 of the uncompressed source: `57da82be755f4afccd8f3b14251bb2752f5df1395f47d2d86f817470c4a48862`.
- Natural Earth's geographic data is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). Attribution: “Made with Natural Earth.” No Figma-derived artwork is incorporated.

The source has 298 map units and 552,828 ring vertices, including repeated shared-border vertices. Its map units preserve separately playable territories such as French Guiana, Guadeloupe, Svalbard, and the U.S. Minor Outlying Islands. An ordinary sovereign-country dataset would merge many of these into their parent countries.

## Border construction

1. Match source units to the existing `data/countries.json` roster, preserving all microstate flags.
2. Build a TopoJSON topology without simplification or coordinate quantization. Miller cylindrical includes the full latitude range, so no polar clipping is needed and Antarctica is retained in full.
3. Align date-line cut vertices within 0.002° latitude before projection to close tiny source mismatches. Project each shared arc exactly once using [Miller cylindrical](https://proj.org/en/stable/operations/projections/mill.html): `x = (longitude + 180) × 10`, `y = height / 2 − (2250 / π) × asinh(tan(0.8 × latitude × π / 180))`. Round coordinates to three decimal places on a 3600 × 2639.516 canvas, without side margins. Neighbors reuse identical projected points, in opposite directions where necessary. Vertical stretching falls between equirectangular and Mercator, balancing country proportions and polar enlargement.
4. Dissolve units assigned to the same country, removing 23 internal arcs, including the internal constituent-country boundaries of Great Britain.
5. Emit country polygons with no stroke. Emit remaining geographic edges once in a separate, noninteractive border layer, omitting artificial edges along the date-line cut and polar frame edges. There are 415 shared arcs and 4,270 exterior arcs before omitting cut segments; an arc contains many line segments.

Hover, keyboard focus, and solved colors change the fills without changing the shared black border layer. Country polygons and hit outlines are in root SVG coordinates, with no transforms or independent image scaling. Native SVG hit testing uses the same camera as rendering.

Border paths are grouped by their adjacent owners. When a territory is filtered out, its standalone coastline disappears too; an edge shared with a visible neighbor remains. The map's CSS explicitly overrides the game's old per-country strokes, including focus strokes.

The segment audit in `tests/maps.test.js` checks the generated SVG itself: each nonzero fill edge has one or two adjacent fills and exactly one border stroke with the same endpoints, except date-line cut and polar frame edges, which must have no stroke. It also verifies matching country/latitude intervals at the left and right cuts. This verifies the generated geometry; it is not an independent survey of the source's geographic accuracy.

## Horizontal wrapping and resource bounds

The root declares `data-wrap-width="3600"`. At runtime, `wrapped-map.js` retains one original geometry tree and creates two neighboring groups at −3600 and +3600. Each neighboring country is an SVG `<use>` reference to its original group. Context land and the border mesh are referenced too. SVG instance rendering has a cost, but the large path strings are not appended to the public DOM again, and no additional SVG downloads occur.

The camera normalizes its x coordinate into `[0, 3600)` whenever it crosses a seam, adjusting the in-progress drag origin by the same offset. Thus three world positions suffice indefinitely. Offscreen neighbor groups are hidden. Minimum zoom limits the visible width to 1.8 worlds even on ultrawide windows. Vertical panning stops at the map edges; the poles do not repeat vertically. At the southern limit Antarctica sits flush with the viewport bottom. If the viewport is taller than the whole map at the current zoom, the map stays bottom-aligned, placing extra space above it.

Native hit testing returns the repeated country's `<use>` element; `data-wrap-country` resolves it to the one canonical country group. This shares scores, solved/revealed colors, and hover across all instances. Only original country groups participate in keyboard navigation; neighboring groups are hidden from accessibility traversal. Reveal/focus/reset choose the nearest equivalent horizontal position, avoiding a full-world jump across the seam.

Country and geometry CSS use selectors that work inside SVG instance trees. Arbitrary ancestor selectors outside a referenced group do not reliably style its instances. Padding overflow is transferred to the opposite tile edge; artificial seam segments are omitted from both geographic borders and dashed hit outlines. The underlying hit fill remains closed and clickable.

## Countries, islands, and hit outlines

All 250 roster entries have actual polygons. None is substituted with an artificial-only guess target. Islands remain grouped with their country.

The source's `ISO_A2_EH` field supplies most codes. Explicit mappings are:

| Source unit | Game code | Reason |
| --- | --- | --- |
| All units with `ADM0_A3=UMI` | `UM` | Source labels the nine minor outlying islands `US`; the game lists them separately. |
| Jan Mayen (`NJM`) | `SJ` | Pair with Svalbard under the roster's Svalbard and Jan Mayen entry. |
| Somaliland (`SOL`) | `SO` | The roster has Somalia and no separate Somaliland entry. |
| Northern Cyprus (`CYN`) | `CY` | The roster has a single Cyprus entry. |
| Southern/northern Korean DMZ (`KNX`/`KNZ`) | `KR`/`KP` | Include each source segment with its adjacent Korea. |

All other source units without a roster code remain muted, noninteractive context land. This includes the Cyprus buffer zone and British sovereign bases, Siachen, Bir Tawil, and some disputed reefs. They do not become new questions. The manifest lists every source-to-output assignment, including these areas.

Countries whose largest polygon occupies less than 180 square SVG units receive a padded dashed outline, except Lebanon, Palestine, Cyprus, Qatar, Timor-Leste, and Kosovo, which use their actual land shapes only. This applies to 89 countries and territories in the Miller cylindrical projection. Each outline encloses the entire land geometry, including both ends of elongated islands. Neighboring islands are grouped using a maximum 45-SVG-unit gap between their bounding boxes, then surrounded by one rounded convex envelope. The Maldives, Bahamas, New Caledonia, and Gambia each have a single continuous outline. Far-flung island groups keep separate envelopes rather than connecting across oceans. Envelopes meeting a tile edge continue on the opposite side.

Padding is at most 4 SVG units, reduced to 30% of the nearest small-country anchor distance in dense areas. Overlapping envelopes belonging to the same country are merged. Other small countries' real land is reserved, then overlaps with already allocated hit outlines are clipped away in deterministic order, smallest land area first. This preserves every country's actual geometry and makes the resulting hit interiors disjoint. Hit-area generation does not alter the underlying coastlines or shared borders.

Dashed outlines are artificial click targets, not territorial boundaries. They can include water or neighboring larger-country land, as the previous circular targets did. Only their interiors receive pointer hits; their decorative strokes cannot steal a neighboring click. Outlines render beneath their own country's opaque land fill. They scale with the map, so zooming remains necessary on mobile.

Reveal bounds frame the outline component containing the main country's anchor. The camera accepts arbitrary hit paths and frames long outlines without cropping their ends. It permits up to 512× zoom relative to the fitted view, increasing zoom for tiny targets where needed while keeping the outline in frame. All outlying geometry remains playable.

## Fidelity and geographic conventions

The source detail is retained without line simplification. “10m” means **1:10 million scale**, not ten-metre resolution. It is suitable for country-scale zooming, not street-level or cadastral use. Ordinary coordinate rounding introduces less than 0.001 SVG unit of point error; date-line cut vertices additionally use a 0.002-degree latitude alignment tolerance before projection. Shared boundaries still use exactly identical coordinates. Miller cylindrical keeps horizontal wrapping while reducing Mercator's polar enlargement and the original equirectangular map's vertical compression. It is neither conformal nor equal-area. Both poles fit within the map, retaining the full source latitude range.

The SVG is about 18.0 MB uncompressed (6.2 MB compressed with gzip). The size is intentional for this high-fidelity pass. Python's development server serves it uncompressed. Source archives and the manifest are not requested by the game.

Natural Earth's source boundaries reflect its release's cartographic/de facto conventions; the generator does not update disputes to the present day. For example, the source assigns Crimea to Russia. Kosovo, Taiwan, Palestine, and Western Sahara remain separate roster entries. Inland water is represented only as present in the map-unit polygons; no separate lake layer was added. Antarctica remains playable with its full source geometry. Antimeridian-split polygons are preserved.

## Reproduce and verify

From the repository root:

```sh
npm ci
npm run maps:generate
npm test
npm run test:browser
```

Generation reads only the bundled source snapshot and the canonical roster. It needs no network after development dependencies are installed. Dependency versions are pinned in `package-lock.json`. The generator fails on an unexpected source checksum or missing roster geometry. Repeated generation produces identical SVG and manifest bytes.

To replace the geographic source later, update the pinned source, checksum, explicit mappings, and provenance together, then rerun the geometry and browser checks. Do not independently simplify neighboring country paths.

## Supplied alternatives reviewed

- The supplied `ASIA.svg` has 127 paths and no country IDs. It uses individual white strokes around black shapes.
- The supplied `EUROPE.svg` has 622 paths, 394 uses, and 255 masks. Its IDs identify stroke masks rather than countries. Reusing it would require identifying countries and reconstructing a shared topology.
- [Wikimedia BlankMap-World.svg](https://commons.wikimedia.org/wiki/File:BlankMap-World.svg) has useful country groupings and tiny-country circles, but its existing country/coastline strokes and CSS-based dispute handling still need normalization. A geographic source is easier to audit and reuse for future regional maps.
- The linked Figma community file could not be inspected through the available fetch tool. No assumptions about its actual geometry or license were used.

## Regional derivatives

`scripts/generate-regions.mjs` reads the finished world SVG and its manifest, then generates North America, South America, Europe, Africa, Asia, and Oceania sequentially. Definitions and geographic frames live in `data/regions.json`. Each output includes `.svg`, `.countries.json`, `.manifest.json`, and `.thumbnail.svg` files. The manifest records the SHA-256 of the exact world SVG used. Run `npm run maps:regions` without rebuilding the world, or `npm run maps:generate` for both steps.

The generator preserves world fill rings (including holes), border coordinates, hit outlines, and draw order. It selects the region's country groups and clips only at the geographic frame. Open border lines are clipped independently so crop edges do not become false political boundaries. Only borders owned by a playable country are retained. Country names and microstate flags come from `data/countries.json`.

Geometry on either side of the world date line is translated by one world width where necessary, with the translation baked into its coordinates. Thus Asia and Oceania are continuous maps across 180°, and the western Aleutians stay beside Alaska. There are no runtime repetitions or `data-wrap-width` attributes on regional maps. Reveal anchors and focus boxes are recomputed from each resulting country's main landmass and corresponding hit area. Native SVG hit testing continues to use the same coordinate system as the camera.

Europe's eastern crop follows an approximate Ural-range polyline from 70°E in the Arctic through 67°E/69°N, 65°E/66°N, 60°E/63°N, 59°E/59–55°N, and 58°E/51°N, extending south beyond Russia. This is a framing convention, not a surveyed mountain boundary or a new political border. Asia retains the entire Russia geometry, including both sides of the date line and Kaliningrad.

Oceania covers 94°E through 239°E (121°W), from 31°N to 56°S. It includes Indonesia and Timor-Leste, all Pacific countries and territories in the roster, French Polynesia, and every Pitcairn component including Ducie. Hawaii and other U.S. country geometry are absent, as are Taiwan, Christmas Island, Cocos (Keeling), and Antarctic territories. The U.S. Minor Outlying Islands entry retains its Pacific geometry; Caribbean Navassa lies outside the frame. Australia and New Zealand retain their southern island groups. South Georgia and the South Sandwich Islands appear in South America.

Regional tests check rosters, source checksums, coordinate bounds, absence of wrapping, unique border segments, Pacific island rings, full Russia coastline retention in Asia, and every country's native hit target on desktop and mobile. Thumbnails alone use reduced rings to keep the home menu lightweight; full game assets retain the world's coastline detail.
