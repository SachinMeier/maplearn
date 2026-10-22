# U.S. states and NYC neighborhood maps

The four options are registered in `us-nyc-maps.js`, imported by the shared `maps.js` registry. This keeps the additions separate from continent and water options. Each uses the existing game, score handling, zoom, reveal, bounded panning, and pointer hit testing. No microstate prompt is shown for these maps.

| Asset | Playable regions | Muted context regions |
| --- | ---: | ---: |
| `us-states.svg` | 50 | 0 |
| `nyc-manhattan.svg` | 68 | 6 |
| `nyc-brooklyn.svg` | 77 | 4 |
| `nyc-queens.svg` | 97 | 6 |

Each map has a `.countries.json` roster (the existing game's schema), `.manifest.json` provenance/geometry file, and `.thumbnail.svg` preview. Generated SVGs are self-contained and retain usable colors when opened directly. The game fetches only the selected SVG and roster; thumbnails use reduced detail.

## U.S. source and projection

[U.S. Census Bureau, 2024 generalized states at 1:500,000](https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/State_County/MapServer/7). This is public-domain U.S. federal geographic data. The exact GeoJSON query is in the manifest, archived as `sources/us-states-census-2024.geojson.gz`.

SHA-256 of uncompressed GeoJSON: `3c426c67e70afe5b79aa9896bfae96f94027565dd5728c6c54f30f55f5dc19db`.

All 50 states are included. Washington, D.C. and territories are excluded. The contiguous states use spherical Albers equal-area with central meridian −96° and standard parallels 29.5°/45.5°. Alaska uses −154°, 55°/65°; Hawaii uses −157°, 8°/18°. Alaska and Hawaii are positioned below the contiguous states at independent scales. Longitudes are normalized around each projection's central meridian to retain the Aleutian Islands across the antimeridian. All source islands, including the Northwestern Hawaiian Islands, are retained. Reveal focuses the largest land polygon; users can zoom into the inset.

## NYC source, conventions, and license

[Chris Whong / NYC Neighborhood Boundaries contributors](https://github.com/chriswhong/nyc-neighborhood-boundaries/tree/a14c924b16ce659d034ab15a8f45229b05a1f1f5), derived from Zillow's 2017 neighborhood boundaries. Source commit: `a14c924b16ce659d034ab15a8f45229b05a1f1f5`. The exact combined distribution is archived in `sources/nyc-colloquial-neighborhoods.geojson.gz`.

SHA-256 of uncompressed GeoJSON: `c79fc3f434c229b0b57de1554f4220ec27bc1e4db04e4de2518ae7a2ce2877b0`.

The user selected smaller colloquial neighborhoods. These maps do **not** use Neighborhood Tabulation Areas. The source has both neighborhoods and overlapping sub-neighborhoods. We merge duplicate slugs (two Warnerville records), then allocate sub-neighborhoods before parents, from smaller to larger area with a stable slug tie-break. Already allocated areas are removed from subsequent shapes, so Alphabet City and East Village, for example, remain separate clickable answers. Parent names apply to their remaining areas. Park context starts green; other nonresidential context remains gray. Neighborhoods with “Park” in their names remain normal quiz targets. All distinct source neighborhood names in the three boroughs are included except the explicit nonresidential context list and four omitted Manhattan enclaves: Astor Row Houses, Striver’s Row, Tudor City, and Little Australia. These four are excluded before partitioning; their areas stay with the surrounding neighborhoods, preserving continuous coverage. The source's Roosevelt Island emoji is removed and Alphabet City's capitalization is normalized. Marble Hill remains part of Manhattan.

These are approximate, nonofficial interpretations. Nested neighborhood names cannot all retain their entire overlapping extents in a single-choice quiz. This partition convention is described in the map's accessible description and the linked in-game source note. Some source boundaries and coastlines are coarser than city survey data; no block-level survey accuracy is claimed.

**The NYC SVG maps, thumbnails, rosters, and geometry manifests are adaptations licensed CC BY-SA 4.0.** Credit: Chris Whong / NYC Neighborhood Boundaries contributors, derived from Zillow. [License](https://creativecommons.org/licenses/by-sa/4.0/); [archived source notice](sources/nyc-colloquial-LICENSE.md). Changes: borough extraction, duplicate merging, overlap partition, nonresidential classification, shared-edge alignment, local equirectangular projection at 40.73° N, coordinate rounding, SVG/thumbnail conversion. These notices are also embedded in each SVG and linked from each neighborhood game's menu. This asset license does not relicense unrelated application code or Census/world assets.

## Geometry construction and verification

All maps use polygon fills without strokes and one shared black border mesh derived from the same TopoJSON topology. Hover and solved colors therefore cannot double a border. Coordinates are rounded to three SVG decimal places. No line simplification is applied to the playable SVGs; preview thumbnails alone are reduced.

NYC boolean subtraction creates tiny numerical slivers. The generator snaps points within .015 SVG unit, inserts near-collinear junctions within .002 SVG unit, removes zero-width spikes and residual rings below .05 square SVG unit, unions each cleaned feature, and repeats noding. This is a subpixel topology cleanup, not an accuracy claim about colloquial boundaries. The SVG tests audit the actual output: every nonzero fill segment has one or two owners and exactly one matching border stroke. Browser tests check the interior anchor of every target against native hit testing, plus desktop clicks, mobile taps, scores, reveal, retry, and switching maps.

Reproduce offline from the project root:

```sh
npm run maps:us-nyc
node --test tests/us-nyc.test.js
npx playwright test tests/us-nyc.spec.js --workers=2
```

The generator checks the archived sources' checksums and needs no network. It changes only these four maps and their derived assets. Use the normal `npm run dev` server for local previews.
