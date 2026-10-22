# European Rivers

Local game route: `#/europe-rivers`, in the home page's **Other** section.

The 31 targets are Shannon, Thames, Severn, Loire, Seine, Somme, Garonne, Rhône,
Rhine, Meuse, Elbe, Oder, Vistula, Danube, Po, Tiber, Douro, Tagus,
Guadiana, Guadalquivir, Ebro, Dnieper (Dnipro), Dniester, Don, Volga
(upper course), Daugava, Neva, Glomma, Sava, Kemijoki, and Dalälven.
This selection balances familiar major rivers and geographic coverage. It is
not a list of Europe's 31 longest rivers.

## Sources and geography

All geometry comes from Natural Earth's public-domain 1:10m data, pinned to
the `v5.1.2` repository tag. Compressed source snapshots live in `sources/`;
the manifest records source URLs and SHA-256 checksums of decompressed data.

- `ne_10m_admin_0_map_units`: land and national borders.
- `ne_10m_rivers_lake_centerlines`: rivers and connecting lake segments.
- `ne_10m_rivers_europe`: supplementary European river reaches.

[Natural Earth's river documentation](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-rivers-lake-centerlines/)
explains the generalized geometry, lake centerlines, European supplement,
and public-domain terms. These are cartographic river centerlines, not
surveyed banks or exact river widths. Small headwater and estuary gaps in the
source are not filled with invented geometry.

The geographic frame is 12° W–45° E, 35° N–71.5° N. It includes Ireland,
Moscow, Iberia, the Mediterranean peninsulas, and Scandinavia. Iceland is
excluded. The Volga is intentionally partial; disconnected lower-course
fragments that re-enter the crop near Volgograd are excluded. The map uses
Albers equal-area with a 15° E central meridian and 43°/62° N standard parallels.
Crop edges are not drawn as political borders.

International names are combined into one target (for example Tajo/Tejo and
Rhein/Rhin/Rhine). Named Rhine distributaries and the main Danube delta
branches belong to their parent river target. Source segment identities are
recorded per target in the manifest. No unrelated tributaries are added.

## Interaction and generation

Blue open paths are the targets; the land and shared border mesh are
noninteractive. Each path has an identical transparent 13-pixel stroke for
easier taps. SVG `vector-effect` keeps the visible and clickable strokes usable
at every zoom. Close corridors can overlap at confluences; the topmost path
wins, and zooming separates nearby courses. Solved rivers become darker and
thicker. Reveal frames the river's geographic bounds, capped at 5× zoom.

```sh
npm run maps:rivers
node --test tests/europe-rivers.test.js
npx playwright test tests/europe-rivers.spec.js
```

Generation is offline and deterministic. Full map geometry retains source
vertices except for clipping and three-decimal projected coordinate rounding;
only menu thumbnails are simplified. Tests check the 31 targets, source
checksums, north-up framing, open path/hit agreement, and actual pointer
guesses on every river after zooming/panning on desktop and mobile. They also
exercise scoring, reveal, reveal-all, completion, retry, and menu placement.
