# Indian States

`indian-states.svg` contains 28 states and 8 union territories. Each is a single
quiz target, including disconnected parts of Puducherry, the merged Dadra and
Nagar Haveli and Daman and Diu, and island groups. Jammu and Kashmir and Ladakh
are separate targets; Telangana is separate from Andhra Pradesh.

The map uses spherical Albers equal-area, central meridian 82° E and standard
parallels 12° and 32° N. All islands remain in their geographic positions.
There are no visible names. Goa, Sikkim, Delhi, Chandigarh, Puducherry,
Lakshadweep, and Dadra and Nagar Haveli and Daman and Diu have translucent dashed
circles around an interior point of their largest polygon. These circles are
artificial click targets and intentionally take priority over adjacent land
inside the circle. All actual land components remain clickable as well.

## Source and license

- [geoBoundaries gbOpen IND ADM1 metadata](https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/).
- Publisher attribution: DataMeet India community / Election Commission of India,
  distributed through geoBoundaries, boundary ID `IND-ADM1-1811400`.
- [Pinned full-resolution GeoJSON](https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/IND/ADM1/geoBoundaries-IND-ADM1.geojson), commit `9469f09`, downloaded 2026-10-21 UTC.
- Local archive: `sources/india-geoboundaries-9469f09.geojson.gz`.
- Uncompressed SHA-256: `47aa0acb6f69868daee49143276f3ce323f18905ba7d38d0a86816b405028736`.
- [Creative Commons Attribution 2.5 India](https://creativecommons.org/licenses/by/2.5/in/),
  as declared by the publisher. Source attribution and the license are embedded
  in both SVGs and linked from the game menu.

The upstream metadata's year field says 2011, although its actual 36 features
include the later Telangana, Ladakh, and merged union territory divisions.
This is a pinned community dataset, not a claim of survey currency. Boundary
and disputed-territory depictions are retained from the source; the map does
not resolve territorial claims. English display names are normalized; internal
region codes preserve the source's identifiers (including CT, OR, TG, and UT).

The generator verifies the archive checksum and complete roster, projects the
full geometry, rounds to three SVG decimals, and removes zero-length edges and
zero-area spikes introduced by rounding. No geographic simplification is
applied to the playable map. Fills and borders derive from the same topology,
and each shared edge is drawn once. Only the thumbnail reduces vertices.
The manifest records anchors, focus boxes, target circles, and provenance.
All gameplay assets and regeneration inputs are local.

## Reproduce and verify

```sh
npm run maps:india
node --test tests/india.test.js
npx playwright test tests/india.spec.js --workers=2
```

Tests check all 36 names and types, source integrity, one stroke per geographic
edge, small target separation, native hit testing for every region, mouse/touch
guesses after zoom and pan, completion, reveal, scoring, and retry.

Local preview: `http://127.0.0.1:4173/#/indian-states` after `npm run dev`.
