# French departments

`french-departments.svg` provides 101 playable departments: 96 metropolitan
departments (including both Corsican departments) and Guadeloupe, Martinique,
Guyane, La Réunion, and Mayotte. Names and department codes come from the source.
Other overseas collectivities are excluded. The source's departmental geography
is retained, including Rhône with Lyon and separate Bas-Rhin and Haut-Rhin,
with estuarine water removed from Gironde and Charente-Maritime as described below.

Metropolitan France uses spherical Albers equal-area (central meridian 3° E,
standard parallels 44° and 49° N). Corsica stays in its geographic position.
The five overseas departments occupy separate, north-up, unlabeled frames around
France, each fitted at an independent scale. There are no visible labels or
scale disclaimers. Small metropolitan departments remain in place and can be
selected by zooming; keyboard focus and reveal frame each department.

Checked departments form whole-department blue, white, and red bands. The blue
edge follows Calvados, Orne, Sarthe, Indre-et-Loire, Vienne, Haute-Vienne, and
Dordogne, continuing south through Lot-et-Garonne, Gers, and Hautes-Pyrénées.
The left overseas insets (Guadeloupe, Martinique, Guyane) are blue; the right
insets (Mayotte, La Réunion) and Corsica are red. The generator records the exact
assignments and palette in the manifest. Correct answers and both reveal actions
use these colors; unchecked departments remain tan. Checked titles are white on
blue/red and dark on the white band.

## Source and license

- [data.gouv.fr / Etalab, Contours administratifs](https://www.data.gouv.fr/datasets/contours-administratifs), derived from IGN Admin Express for metropolitan France and the DROMs.
- [2026 GeoJSON, generalized at 100 m](https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/2026/geojson/departements-100m.geojson.gz), downloaded 2026-10-21 UTC.
- Local archive: `sources/france-departements-2026-100m.geojson.gz`.
- Uncompressed SHA-256: `e236204431730cdfe103efea54497896b874c3451efc663a4d4fdcbc831f9e0b`.
- Dataset license: [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/), as declared by the publisher. The archived database and derived department data are supplied under ODbL 1.0. The SVG and thumbnail are produced from that database; attribution is embedded in both and linked from the game menu. This notice does not change the license of unrelated application code or assets.

The generator selects departments, projects and rounds coordinates to three SVG
decimal places, builds topology, and emits the SVG, roster, manifest and preview.
It applies no further simplification to playable geometry. Only the thumbnail
reduces boundary and river vertices. Fills and borders use the same topology; each shared edge is
drawn once. The manifest records source provenance, inset frames, focus boxes,
and interior anchors. All assets and the source archive are local; gameplay
requires no external requests.

## Rivers and Gironde shoreline

The map includes the Somme, Marne, Loire, Seine, Rhône (including the Petit Rhône
delta branch), Garonne, and Dordogne. These are decorative blue centerlines,
clipped to metropolitan land, with no visible names or pointer targets. Both the
quiz and the title demo load the same map. River bends retain the downloaded
detail; their stroke stays readable while zooming.

Hydrography comes from **IGN / OFB, BD TOPAGE, distributed by Sandre / Eaufrance**,
under [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/).
See the publisher's [river dataset](https://www.data.gouv.fr/datasets/cours-deau-metropole-2026-bd-topage-r)
and [BD TOPAGE catalog](https://www.data.gouv.fr/datasets/bd-topage-r-metropole-2026).
The selected features were downloaded from the live
[Sandre WFS](https://services.sandre.eaufrance.fr/geo/topage?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities)
on 2026-10-21 UTC. The local snapshots, rather than that changing service, are
the inputs to every rebuild. Original Sandre identifiers and properties are retained.

- `sources/france-topage-rivers.geojson.gz`: nine features from `sa:CoursEau_FXX`, grouped into seven rivers. Somme uses its river and canalized main course. The generator lists the exact retained identifiers; unrelated namesakes and lateral canals are excluded.
- Uncompressed SHA-256: `c128268ce77e9a89f33535d430b203051e1314c30367c04034063e1a1c33df32`.
- `sources/france-topage-gironde-water.geojson.gz`: 18 water surfaces from `sa:SurfaceElementaire_FXX`: the two estuary surfaces belonging to plan d'eau `05P0000002292062751`, its side channel `05S0000002292062695`, and 15 lower Garonne/Dordogne water surfaces.
- Uncompressed SHA-256: `fa513edb8fdbe12f115587e1049569f76c2533ac80229f7af7fe107b23678515`.

Retrieval used WFS 2.0 `GetFeature`, `outputFormat=application/json; subtype=geojson`
and `srsName=EPSG:4326` (GeoJSON longitude/latitude). Rivers were retrieved with
an OGC `PropertyIsLike` filter on `TopoOH` for the seven names, then curated by
identifier. Water surfaces were retrieved with
`BBOX=44.75,-1.25,45.7,-0.35,EPSG:4326` (WFS latitude/longitude order), then
selected by the identifiers retained in the archive. Both responses were checked
against `numberMatched` to ensure they were not truncated.

Administrative boundaries can include estuarine water. The generator unions
these water surfaces, clips them to longitude −1.3…−0.35 and latitude
44.78…45.7, and subtracts them from departments 17 and 33 before projection and
topology construction. This opens the Gironde estuary through the confluence and
lower tributaries, preserving source islands and preventing water clicks from
counting as department guesses. Upstream, narrow rivers continue as centerlines.
This is a geographic context layer, not a comprehensive hydrographic chart.

## Reproduce and verify

```sh
npm run maps:france
node --test tests/france.test.js
npx playwright test tests/france.spec.js tests/title-demo.spec.js --workers=2
```

Generation is offline and checks the archived source checksum. Tests verify the
complete department roster, single shared borders, unlabeled inset placement,
native hit testing for all 101 departments, desktop/mobile guessing, reveal,
retry, and completion with all five overseas departments. Hydrography checks cover
source hashes, the seven rivers, water/land probes along the estuary, and pointer
events passing through river lines. The title-demo checks also verify that labels
still fit the corrected geography and scale continuously.

Local preview: `http://127.0.0.1:4173/#/french-departments` after `npm run dev`.
