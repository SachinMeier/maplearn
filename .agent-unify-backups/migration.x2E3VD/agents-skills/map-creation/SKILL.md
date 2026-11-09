---
name: map-creation
description: Create or update maps in this repo using its existing SVG geometry, interactions, and labeling conventions.
---

# Map creation

- Create high-fidelity SVG maps with zoom/pan and clickable regions; preserve detailed coastlines and shared boundaries. Reuse `viewport.js` and existing map generators.
- Always retain the current projection: Miller cylindrical from `scripts/projection.mjs` for world maps and their crops; preserve the existing generator's projection for regional maps (including France, China, and NYC).
- Reuse microregion examples in `scripts/hit-areas.mjs` and `scripts/admin-map.mjs`: dashed, lightly filled enlarged click targets that preserve real geometry.
- Reuse `region-titles.js` and `title-placement.js` for title labeling, zoom behavior, and tiny-region callouts.
- Default to tan `#e1d2b1` for lines and blue `#b5d7e3` for oceans. Honor user-specified alternatives; follow existing France/China solved colors, ocean-map colors, and Manhattan park colors where applicable. Existing land fill also uses this tan.
- Only full-world maps (including World Oceans & Seas) wrap horizontally, using `wrapped-map.js`. Regional, country, and city maps do not wrap: they are not full globes/cylinders.

All file paths above are relative to the repository root.
