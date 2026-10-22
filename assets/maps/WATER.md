# World Oceans & Seas

Play locally at `http://127.0.0.1:4173/#/world-waters`, or choose **Water → World Oceans & Seas** on the home screen. The map has 37 questions and uses the same Miller cylindrical projection, zooming, horizontal wrapping, pointer hit testing, scoring, reveal, completion, and retry as the world country map. There is no microstate setup for water.

Unsolved water is light blue; solved and revealed water is dark blue. Land is muted tan. The geographic polygons have no strokes of their own: a separate, noninteractive TopoJSON mesh draws each shared border once. Enlarged strait and canal targets have dashed outlines. Those outlines intentionally include some surrounding land/water; the narrow target takes pointer priority within them. They are not hydrographic limits. Canals have schematic centerlines through their enlarged targets.

## Roster decisions

The original list is retained with these adjustments:

- `Bering Sea/Straight` becomes two questions: **Bering Sea** and **Bering Strait**.
- **Sea of Okhotsk** is retained. **Gulf of Kamchatka** is not a separate question; its water is grouped with the Pacific Ocean.
- The two northern arms, **Bohai** and **Korea Bay**, are folded into the **Yellow Sea** as one target, including their detailed shorelines. Neither is a separate question. **Sea of Japan** remains a separate target east of Korea.
- `St James Bay` becomes **James Bay**.
- **Strait of Malacca** replaces Singapore Strait as a question. Singapore Strait is grouped with the South China Sea, with no separate enlarged target. Other straits include **Strait of Hormuz**, **Strait of Magellan**, and **Strait of Gibraltar**.
- **South China Sea** includes [Qiongzhou Strait between Hainan and mainland China](https://www.esa.int/ESA_Multimedia/Images/2024/07/Earth_from_Space_Hainan_Strait), plus the coastal bays of Malaysia, eastern Sumatra, western Borneo, Vietnam, and southern China. Inland catchment masks close gaps between the coarse label boundaries and detailed coastlines.
- **East China Sea** is included as a major sea, grouping Taiwan Strait, Hangzhou Bay, the Yangtze estuary, and Korea Strait. Yellow Sea and Sea of Japan retain priority at their shared limits; their coastal bays are also enclosed to prevent Pacific slivers. The Pacific-facing coast of Japan and the Sulu/Celebes seas remain under the Pacific question.
- **Southern Ocean**, **Mediterranean Sea**, and **Caribbean Sea** complete the major water bodies without expanding to a fine-grained global sea catalog.
- **Gulf of Aden** is a separate question, including the Bab el Mandeb passage at its western entrance.
- **Aegean Sea** is a separate requested question, with the Sea of Crete grouped into it rather than the Mediterranean.
- **Adriatic Sea** includes the full eastern coastline's bays and island channels, including Kotor and the Albanian coast. Inland catchment masks prevent coarse source edges from leaving Atlantic pockets, while preserving the detailed shoreline and the existing southern sea limit.
- **Suez Canal** and **Panama Canal** are included as requested, with enlarged targets.
- The connected **Maracaibo basin** is grouped with the Caribbean Sea, following the requested correction; it is not a separate lake question. The Atlantic/Pacific divider follows the continental interior through Mexico and Central America so the Pacific coast cannot be assigned to the Atlantic.
- **Caspian Sea is included** as an explicit requested exception to the no-lakes roster, with its connected Garabogaz lagoon grouped into the same answer. The full detailed basin is allocated to this target, so coastal strips cannot fall through to an ocean. No additional lake dataset is loaded.

The full machine-readable roster is `world-waters.countries.json`. The historical `countries` filename and `data-country` attributes are an interface to the existing generic quiz engine; every entry here is a water region.

## Data and geographic limits

Made with Natural Earth. Both archived inputs are from repository release **v5.1.2**, public domain:

- [1:10 million ocean geometry](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-ocean/), exact snapshot `sources/ne_10m_ocean.v5.1.2.geojson.gz`.
- [Marine geographic regions](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-physical-labels/), exact snapshot `sources/ne_10m_geography_marine_polys.v5.1.2.geojson.gz`.
- [Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/).

The detailed ocean polygons supply coastlines and islands. Named seas use Natural Earth's approximate marine label polygons, intersected with the detailed ocean. Natural Earth explicitly cautions that its physical region limits are approximate. Coarser coastal edges can leave narrow strips assigned to the parent ocean; curated inland catchments repair the requested East Asian coastal areas while the detailed ocean geometry preserves the actual shorelines. These are educational regions, not legal maritime boundaries or navigation charts.

The generator gives nested targets priority: James Bay is separate from Hudson Bay, and Adriatic/Ionian/Aegean Seas from the Mediterranean. Bohai and Korea Bay are merged into the Yellow Sea. Some unasked subdivisions are merged into their named parent sea; the explicit lists are in `scripts/generate-water.mjs`. All remaining marine water is assigned to one of the five ocean questions. Broad open-ocean divisions use 60°S, 20°E south of Africa, 146.9°E south of Tasmania, 67.3°W south of Cape Horn, and the Arctic Circle in the north, extended south to include the entire White Sea and its bays in the Arctic Ocean. These are deliberately simplified quiz conventions. The five oceans are each one question, including both date-line halves of the Pacific. The White Sea remains part of the Arctic question rather than becoming an additional target.

Bering Strait and Strait of Hormuz use hand-curated approximate masks because the source does not provide separate polygons for them. The canal routes are hand-curated schematic centerlines. The [Marine Regions Hormuz entry](https://marineregions.org/gazetteer.php?id=24076&p=details) and [Panama Canal Authority](https://pancanal.com/en) provide geographic reference context.

`world-waters.manifest.json` records input URLs and SHA-256 checksums, source names, interior anchors, reveal bounds, and which regions have artificial targets. Coastlines are not simplified for gameplay; shared projected coordinates are rounded to three decimals. Only the small menu thumbnail is simplified.

## Reproduce and validate

From the repository root:

```sh
npm run maps:water
npx playwright test tests/water.spec.js --workers=2
```

Generation is offline and uses the pinned bundled snapshots. It writes the SVG, roster, manifest, and thumbnail. It does not edit the shared menu or other maps. Browser tests cover desktop mouse/mobile touch clicks at every target's interior anchor, completion, dark-blue solved colors, retry, reveal, direct entry, menu navigation, Pacific points on both sides of the date line, known water locations, and excluded lake/land locations. Source limits remain approximate; these tests verify the game and geometry, not hydrographic authority.
