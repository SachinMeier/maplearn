# Maps

A static geography game. No runtime dependencies or backend. The optional build
checks JavaScript syntax and copies the static site into `dist/` for deployment.

## Run

```sh
npm run dev
```

Open http://127.0.0.1:4173. Serve the project directory; ES modules and data fetches require HTTP rather than opening `index.html` as a file. All asset URLs are relative, including under a repository subpath. Navigation uses hashes.

## Offline map downloads

Each map card has a **Download** button and its approximate uncompressed size.
Wait for **Available offline**, then reopen the same address in the same browser
without a connection. Downloads include that map's SVG, roster, and label data;
the shared interface and thumbnails are saved automatically. **Remove** deletes
only that map's offline copy. Playing a map does not automatically save it.

Downloads have no scheduled expiry. Browser site-data clearing, private browsing,
or storage eviction can remove them; the app requests persistent storage when a
map is downloaded, but browsers may decline it. HTTPS or localhost is required.
External links and the temporary title demo are not included in offline saving.

The build generates `offline-manifest.js` from the current assets with content
versions and sizes. `npm run dev` generates it before starting the local server;
restart that command after editing assets to refresh the offline version.
Updates prepare the new interface and refresh previously downloaded maps before
activation; failed updates retain the working version. Close all site tabs and
reopen to activate an installed update. No map is marked ready until all its
files are saved. Run `npx playwright test tests/offline.spec.js` to verify all
maps in a new offline tab, scoring/retry, selective saving, failures, and removal.

## World map

The game loads `assets/maps/world.svg`, a detailed rectangular Miller cylindrical map generated once from Natural Earth's public-domain 1:10 million map units. All 250 playable codes have actual geographic polygons. The SVG retains the source detail without simplification, uses a single shared border mesh, and supplies padded dashed hit outlines for 89 small countries and territories. It is about 18.0 MB uncompressed (6.2 MB with gzip).

The map wraps horizontally: pan east from Kamchatka into Alaska and keep going. The asset is fetched once. `wrapped-map.js` adds two reusable neighboring sets of SVG `<use>` references, sharing the central source geometry and country state. The camera recycles its horizontal position, so panning never appends more maps or accumulates coordinates. At most three world positions exist; offscreen neighbors are hidden. The zoom-out limit exposes at most 1.8 world widths, including on ultrawide displays.

`data/countries.json` is a snapshot of the code, name, and microstate fields from the sibling `gquiz/data/countries.json`. Its 250 entries include 48 flagged microstates/territories. The flags are preserved verbatim; Vatican City, Monaco, Singapore, and Andorra remain included when filtering. This is a local copy so the projects can be served independently.

See [the map asset notes](assets/maps/README.md) for source provenance, country-code mappings, geographic limitations, and the offline regeneration procedure.

## Continent maps

The home menu also offers North America, South America, Europe, Africa, Asia, and Oceania, each with a geographic thumbnail and the same microstate choice, guessing, reveal, scoring, and retry behavior. Direct links use `#/north-america`, `#/south-america`, `#/europe`, `#/africa`, `#/asia`, and `#/oceania` (optionally followed by `?microstates=0` or `1`). Only the selected map's SVG and roster are loaded; each is cached for subsequent rounds.

Regional assets reuse the world SVG's detailed polygons, small-country hit outlines, and shared border mesh. They do not wrap. Panning stops at their rectangular frame in both directions; an axis stays centered while its entire frame fits onscreen. Asia and Oceania join geometry across the date line into a single continuous view, and North America retains the western Aleutians.

Europe shows Russia west of an approximate Ural-range crop. Asia includes all Russia, including Kaliningrad and the easternmost islands. Oceania includes Indonesia and Timor-Leste, Australia, New Zealand, and the Pacific countries and territories through French Polynesia and all Pitcairn island components. It excludes Hawaii, Taiwan, Christmas Island, Cocos (Keeling), and Antarctic/Indian Ocean territories. Only the Pacific components of the U.S. Minor Outlying Islands appear. Hawaii remains part of the U.S. on North America and World.

The regional lists are stored explicitly in `data/regions.json`. They start from GeoLearn's continent assignments, with Russia also in Asia, Indonesia and Timor-Leste also in Oceania, and South Georgia and the South Sandwich Islands assigned to South America. Cyprus follows GeoLearn's Europe assignment, while Turkey and the Caucasus countries follow its Asia assignment. Country names and microstate flags always come from the existing world roster. Non-roster countries are omitted from each regional map.

Run `npm run maps:regions` to regenerate all six regions, in menu order, from the existing world SVG. `npm run maps:generate` rebuilds the world first, then the six regions. Each region has an SVG, a playable roster, a manifest with source checksum and reveal anchors, and a lightweight thumbnail. Playable geometry is never simplified; only thumbnails are reduced.

Run `npm run maps:thumbnails` to refresh just the six continent previews and the oceans preview. Continent previews include the shared country-border mesh; ocean coastlines use distance-based simplification to retain corners and avoid diagonal shortcuts. These previews are also refreshed by their respective map generators.

## European rivers

**European Rivers** appears in **Other** at `#/europe-rivers`. It has 31
selectable blue river paths over a muted national-border map, from Ireland to
western Russia, excluding Iceland. The Volga target covers its upper course
within this frame. This is a geographically balanced selection of major rivers,
not a ranking by length. Solved rivers become thicker and dark blue.

The invisible tap corridor follows each river and stays 13 screen pixels wide
as the map zooms. Countries and borders do not accept guesses. The existing
reveal, reveal-all, score, retry, keyboard, pinch, and pan controls apply.
Run `npm run maps:rivers` to rebuild from the archived Natural Earth snapshots.
See [the river map notes](assets/maps/EUROPE-RIVERS.md) for the roster and sources.

## French departments

The home menu offers **French Departments** at `#/french-departments`: 101
departments, including five overseas departments in unlabeled insets around
metropolitan France. Corsica remains in geographic position. It uses the same
zoom, guessing, reveal, scoring, and retry controls, without a microstate prompt.
Generate its local assets with `npm run maps:france`; see
[the French map notes](assets/maps/FRANCE.md) for source attribution, projection,
license, and verification details.

## Indian states

The home menu offers **Indian States** at `#/indian-states`:
28 states and 8 union territories, including Telangana, separate Jammu and
Kashmir and Ladakh, and the merged Dadra and Nagar Haveli and Daman and Diu.
It uses the existing zoom, pan, guessing, reveal, scoring, and retry controls.
Seven small regions have dashed click circles. The islands remain in their
geographic positions, and no microstate prompt is shown.

Generate its local assets with `npm run maps:india`; see
[the Indian map notes](assets/maps/INDIA.md) for provenance, licensing, and tests.

## Chinese provinces

**Chinese Provinces** appears in **Other** at `#/chinese-provinces`. It includes
33 province-level divisions: 22 provinces, five autonomous regions, four
municipalities, Hong Kong, and Macao. Taiwan is absent from both the geometry
and the quiz roster. Small divisions have nonoverlapping dashed click circles.
The existing guessing, reveal, titles, zoom, pan, scoring, and retry controls apply.

Regenerate offline with `npm run maps:china`. See [the Chinese map notes](assets/maps/CHINA.md)
for source provenance, the full roster, and verification details.

## Completed-region titles

Area maps use the fitted title strategy from the France experiment. Correct
answers, individual reveals, and **Reveal all** add names to checked regions;
unchecked regions have no visible titles or hover-name callouts. Retry and map
switching clear the titles. Massachusetts towns keep their existing point labels.

`region-titles.js` shares the placement engine with the demo. Each name is laid
out once when checked, with fixed position and wrapping, continuous sizing while
zooming, and a smooth fade for small text. Tiny regions and targets without an
area use one connected pill on hover, focus, or tapping a checked target. Tapping
a checked region inspects its name without recording a wrong guess. Readable
inline titles never get a duplicate pill. Labels do not intercept map clicks.
Wrapped world copies reference the same live title layer, and filtered regions
never receive titles. Water-map names use white text against completed blue water.

Run `npx playwright test tests/region-titles.spec.js` for checks across every
map, including completion visibility, native text containment at overview and
zoom, stable nodes/wrapping, small-name interaction, filtering, and retry.

## Temporary title experiment

Open `title-demo/` from the home page to test settings with every department
name available immediately. All 101 names receive an interior position and fixed line wrapping
once at load time, shrinking each initial layout until its full rectangle fits
inside its department. Zoom, pan, resize, and text-size changes retain those
positions, line breaks, and DOM nodes.

Camera updates apply continuous SVG scaling around each title's fixed center.
A smooth saturation curve approaches an 18-screen-pixel font size without
rounded font steps, delayed layout rebuilds, or abrupt wrapping changes.
Names fade in between 3 and 6 screen pixels in the default **Zoom or hover**
mode. **All fitting titles** bypasses that fade, and **Show titles** controls
both the map titles and the temporary callout.

Hovering a hidden or faint name shows one readable pill with a connector to
its department's interior anchor; tapping/selecting supports the same behavior
without a mouse. Its inline name is suppressed while that pill is shown. The
pill disappears when the inline name becomes fully readable, and visible
names never receive a duplicate. Callout placement stays within the map viewport
and favors positions that cover less existing text. The ordinary map titles
remain plain text with no borders or outlines. **Fit map** restores the overview.

The demo controls live in `title-demo/index.html`, `title-demo.css`, and
`title-demo.js`, with tests in `tests/title-demo.spec.js`. Gameplay and the demo
share `region-titles.js` and `title-placement.js`; retain those shared modules
when removing the demo and its `title-demo-link` home card.

## Massachusetts towns

**Massachusetts Towns** is in the U.S. menu at `#/massachusetts-towns`.
Its 64 town and city targets include Milton, Braintree, Norfolk, Wellesley,
Lexington, Concord (Massachusetts), and Hull. Dashed circles surround town hall
locations from [MassGIS](https://www.mass.gov/info-details/massgis-data-town-and-city-halls)
over the existing Census state geometry, including Cape Cod, Martha's Vineyard,
Nantucket, and surrounding states. These circles are enlarged click targets,
not municipal boundaries. Every circle has a radius of 12 map units, so nearby
town targets can overlap. In an overlap, the circle drawn on top receives the tap;
the exposed portion of either circle remains clickable.
Names stay hidden until a correct guess or reveal checks off the town. Checked
towns turn green and show their names near their circles, with placement
chosen to avoid other labels and circles. Curated placements in `maps.js`
reserve space first: Brockton, Bridgewater, Lexington, Tewksbury, Reading, and Newburyport
below; Salisbury and Cambridge above; Chicopee and North Adams right; Northampton left; Springfield below-right;
Agawam below-left. These adjacent labels do not need connectors.
Longer names wrap; crowded labels have
a short leader. Labels remain attached while panning and zooming, cap smoothly
at 16 screen pixels, and never intercept clicks. Retry clears them.
Automatic town reveals ease in and out over 1.1 seconds and stop at 3× the
overview zoom, preserving surrounding geography. The revealed name remains
until the movement finishes, with a short pause before the next prompt.
Manual zoom remains unrestricted by this automatic framing cap. Map-specific
`focus` settings in `maps.js` override the shared viewport defaults; other maps
retain their existing reveal behavior. Reduced-motion preferences skip animation.

The roster is curated in `data/massachusetts-towns.json`. Barnstable's town hall
is in Hyannis; Salisbury represents the municipality containing Salisbury Beach.
Island municipalities Tisbury and Edgartown represent locations on Martha's
Vineyard, rather than treating the entire island as a town.
The archived MassGIS snapshot and Census source checksums are recorded in
`assets/maps/massachusetts-towns.manifest.json`. Regenerate entirely offline
with `npm run maps:massachusetts`. No additional runtime services are needed.

## Map asset contract

1. Add a trusted local SVG and its country roster, then register their relative paths in `maps.js`.
2. Give the root a `viewBox` covering the entire map. Omit `data-placeholder="true"` to remove the placeholder note.
3. Wrap each country's geometry in `<g data-country="XX">`, using the uppercase codes in the country data. Keep coordinates in the root SVG coordinate system (bake transforms into paths). Each playable code must have geometry; missing countries produce an error instead of an unwinnable game.
4. Give filled geometry the `region-fill` class. For shared borders, use a separate, noninteractive border mesh (`pointer-events="none"`) and override region strokes so borders are drawn once. Group islands with the main region. Set `data-border-owners="XX YY"` on each mesh path so filtering can remove coastlines belonging only to hidden regions. A `context-` owner identifies noninteractive land.
5. Put optional padded fill paths with class `hit-area` inside the matching country group, plus noninteractive dashed `hit-outline` paths for their outlines. The native SVG hit test and common camera keep these aligned at every zoom. Avoid overlapping hit areas; their document order determines which receives a tap.
6. Do not add visible country labels to the real map. Accessible names and keyboard controls are supplied from the manifest.
7. Set `data-focus-box="x y width height"` on country groups to frame their main landmass or small-region hit outline during reveals. Without this, the camera uses the entire group's bounding box, which may span the world for island groups and countries crossing the antimeridian.
8. For a rectangular repeatable map, set `data-wrap-width` to the exact tile width. Match land on the left/right edges, omit artificial seam strokes, and keep padding inside the tile by transferring overflow to the opposite side. Use self-contained geometry CSS selectors such as `.map-region` so styles also apply in `<use>` instances.

The original tile fixture remains available through `npm run placeholder`; the game no longer loads it. Regenerate the real asset offline with `npm ci && npm run maps:generate`. These packages are development tools only; gameplay has no runtime dependencies or build requirement.

## Controls and scores

- Tap/click a region to guess. Each incorrect region tap counts as a mistake, including a previously completed region. Ocean/background clicks are ignored.
- Click the country pill or choose **Reveal** in the menu to fill and center the current country. Reveals count separately from correct guesses.
- Drag to pan; pinch or wheel to zoom. World wraps continuously east/west; continent maps stop at their frame. **Reset Zoom** in the menu restores the starting view. Drags, pinches, and canceled touches do not submit guesses. World reveals and keyboard focus move to the nearest repeated position.
- Keyboard: WASD to pan (works without focusing the map), or arrow keys while the map has focus. Tab to regions, Enter/Space to guess, +/− to zoom, 0 to fit. Focusing a region brings it into view. Dialogs contain focus; Escape closes setup and menu. WASD shortcuts pause while typing or using a dialog.
- Retry starts a fresh shuffled game with the same filter. The filter preference persists when browser storage is available. Reload starts a new round.

## Verify

```sh
npm ci
npm test
npx playwright install chromium
npm run test:smoke
npm run test:browser
```

Tests cover scoring, canonical filtering, completion, retry, load recovery, zoom/pan hit testing, resize, and mobile touch gestures. Asset tests check roster coverage, the source checksum, nonoverlapping hit outlines, matching date-line cuts, and every individual boundary segment: one border stroke with coordinates exactly matching adjacent fills, with no artificial seam strokes. Wrapping tests cover native clicks on repeated Alaska, synchronized solved state, continuous seam drags, nearest-copy reveals, ultrawide resizing, and fixed instance/download counts after hundreds of pan steps in both directions. Browser tests use shortened country responses for completion and selected wrapping scenarios; production has no test bypass.

Browser tests automatically build the site and serve `dist/` on port 4174, so
they exercise the deployment artifact. The development server can keep running
on port 4173. To preview the build manually, run `npm run build && npm run preview`.

Regional tests additionally cover every roster and native country hit target on desktop and mobile, Pacific island retention, all-Russia coverage, unique shared borders, finite pan limits, immediate reversal at an edge, resize/reset, completion, and switching between maps.

## GitHub Pages

`.github/workflows/ci-pages.yml` runs only on pushes. It runs the fast game/asset
tests, checks JavaScript syntax, builds the static site, and runs six Chromium
smoke checks across desktop and mobile: the main game flow, load recovery, and
opening a map without the microstate prompt. Passing runs on the repository's
default branch deploy that same `dist/` artifact to GitHub Pages. Other branches
are tested but never deployed; pull requests do not trigger another run.

The exhaustive browser suite runs only when manually requested: in GitHub
Actions choose **Full regression tests (manual) → Run workflow**, or run
`npm run test:browser` locally. The manual workflow never deploys and uploads
failure traces for debugging. Map assets are already generated and are not
rebuilt or downloaded during deployment. The build excludes the map-generation
source datasets and includes the standalone title-demo page.

One-time setup after pushing this project to a GitHub repository:

1. In **Settings → Pages**, set **Source** to **GitHub Actions**.
2. Set **Custom domain** to `maps.pirategames.org`.
3. At your DNS provider, set the `maps` CNAME record to `<owner>.github.io`
   (the GitHub user or organization that owns the repository; no repository path).
4. Enable **Enforce HTTPS** once GitHub has provisioned the certificate.
5. Push to the default branch to run **Test and deploy Pages**.

The repository's `CNAME` is copied into the build to record the intended domain.
GitHub Actions deployments require the domain setting above even with that file;
see [GitHub's custom-domain documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
