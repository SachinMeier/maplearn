// All measurements use map coordinates, so labels and region polygons share
// the same zoom/pan transform in both gameplay and the title experiment.
export const overlaps = (a, b, gap = 0) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
  && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;

export function readGeometry(path) {
  const rings = path.getAttribute('d').split('Z').filter(Boolean).map(r =>
    r.slice(1).split('L').map(p => p.split(',').map(Number)));
  const edges = rings.flatMap(r => r.map((p, i) => [p, r[(i + 1) % r.length]]));
  const box = path.getBBox();
  return { rings, edges, box };
}
export function contains(geometry, [x, y]) {
  const b = geometry.box;
  if (x < b.x || x > b.x + b.width || y < b.y || y > b.y + b.height) return false;
  let inside = false;
  for (const [[ax, ay], [bx, by]] of geometry.edges) {
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}
// Liang–Barsky segment/rectangle intersection also catches narrow bays and
// holes that a corners-only containment check would miss.
export function crossesBox([a, b], box) {
  let low = 0, high = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - box.x, box.x + box.width - a[0], a[1] - box.y, box.y + box.height - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) low = Math.max(low, t); else high = Math.min(high, t);
      if (low > high) return false;
    }
  }
  return true;
}
export function fitsInside(geometry, box) {
  const b = geometry.box;
  if (box.x < b.x || box.y < b.y || box.x + box.width > b.x + b.width || box.y + box.height > b.y + b.height) return false;
  if (!contains(geometry, [box.x + box.width / 2, box.y + box.height / 2])) return false;
  return !geometry.edges.some(edge => crossesBox(edge, box));
}
const centered = (point, width, height) => ({ x: point[0] - width / 2, y: point[1] - height / 2, width, height });

function textLayouts(name, measure, size) {
  // Preserve accents, apostrophes and hyphens. A hyphen stays on the preceding
  // line, and rejoining lines recovers the full name without abbreviations.
  const tokens = name.match(/[^\s-]+-?|[^\s]+/g);
  const join = parts => parts.reduce((text, part) => text + (text && !text.endsWith('-') ? ' ' : '') + part, '');
  const choices = [];
  function split(start, lines) {
    if (start === tokens.length) {
      const widths = lines.map(measure);
      // Reserve extra vertical room for font ascent/descent and mobile SVG
      // text metrics; line spacing and the visible glyphs can remain compact.
      choices.push({ lines, widths, size, width: Math.max(...widths) + size / 2, height: lines.length * size * 1.15 + size * 11 / 15,
        balance: Math.max(...widths) - Math.min(...widths) });
      return;
    }
    if (lines.length === 3) return;
    for (let end = start + 1; end <= tokens.length; end++) split(end, [...lines, join(tokens.slice(start, end))]);
  }
  split(0, []);
  return [1, 2, 3].flatMap(count => choices.filter(c => c.lines.length === count)
    .sort((a, b) => a.width - b.width || a.balance - b.balance).slice(0, 3));
}
function interiorPlacement(region, layouts) {
  const [x, y, w, h] = region.focusBox;
  const candidates = [region.anchor];
  const step = Math.max(.25, Math.min(w, h) / 12);
  for (let px = x + step / 2; px < x + w; px += step) {
    for (let py = y + step / 2; py < y + h; py += step) candidates.push([px, py]);
  }
  candidates.sort((a, b) => Math.hypot(a[0] - region.anchor[0], a[1] - region.anchor[1])
    - Math.hypot(b[0] - region.anchor[0], b[1] - region.anchor[1]));
  let best;
  for (const layout of layouts) {
    if (layout.width > w || layout.height > h) continue;
    for (const point of candidates) {
      const box = centered(point, layout.width, layout.height);
      const lineBoxes = layout.widths.map((width, i) => ({ x: point[0] - (width + layout.size / 2) / 2,
        y: box.y + layout.size / 6 + i * layout.size * 1.15, width: width + layout.size / 2, height: layout.size * 1.55 }));
      // The whole rectangle must fit: every smaller centered version then
      // stays inside, including across concave coastlines during smooth zoom.
      if (!fitsInside(region.geometry, box)) continue;
      const score = Math.hypot(point[0] - region.anchor[0], point[1] - region.anchor[1]) + layout.lines.length * 5;
      if (!best || score < best.score) best = { ...layout, box, lineBoxes, score, kind: 'inside' };
      break;
    }
  }
  return best;
}

export function placeTitles(regions, { size, measure }) {
  return regions.map(region => {
    region = { ...region, anchor: region.titleAnchor ?? region.anchor };
    let inside;
    // Solve once, including tiny regions, at each region's usable size.
    // Camera updates subsequently scale this fixed layout, never rewrap it.
    for (let fitSize = size; fitSize >= .02 && !inside; fitSize *= .8) {
      const layouts = textLayouts(region.name, text => measure(text) * fitSize / size, fitSize);
      inside = interiorPlacement(region, layouts);
    }
    // Extremely small islands can be smaller than a useful fitting rectangle.
    // They retain an anchored callout instead of failing the entire map.
    inside ??= { kind: 'callout', size: 0, lines: [],
      box: { x: region.anchor[0], y: region.anchor[1], width: 0, height: 0 } };
    return { ...inside, code: region.code, name: region.name, anchor: region.anchor };
  });
}

export function titleScale(size, cameraScale, preference) {
  const ratio = Math.min(1, preference / size);
  // Smooth saturation rather than quantized font steps or a hard size cap.
  return ratio / Math.pow(1 + Math.pow(size * ratio * cameraScale / 18, 4), .25);
}
export function titleOpacity(screenSize) {
  const t = Math.max(0, Math.min(1, (screenSize - 3) / 3));
  return t * t * (3 - 2 * t);
}
