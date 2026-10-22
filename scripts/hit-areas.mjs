import clipping from 'polygon-clipping';
import polylabel from 'polylabel';

export function bounds(points) {
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const p of points) { x = Math.min(x, p[0]); y = Math.min(y, p[1]); right = Math.max(right, p[0]); bottom = Math.max(bottom, p[1]); }
  return [x, y, right - x, bottom - y];
}
const overlaps = (a, b) => a[0] <= b[0] + b[2] && b[0] <= a[0] + a[2] && a[1] <= b[1] + b[3] && b[1] <= a[1] + a[3];
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function contains([x, y], polygon) {
  let inside = false;
  for (const ring of polygon) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function hull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = points => {
    const out = [];
    for (const p of points) {
      while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
function paddedHull(points, padding) {
  const outer = hull(points);
  // Minkowski sum with a 32-sided disc gives rounded ends and follows the
  // orientation of long islands instead of using axis-aligned rectangles.
  const padded = hull(outer.flatMap(([x, y]) => Array.from({ length: 32 }, (_, i) => {
    const angle = i * Math.PI / 16;
    return [x + padding * Math.cos(angle), y + padding * Math.sin(angle)];
  })));
  return [[...padded, padded[0]]];
}
function clusters(polygons) {
  const boxes = polygons.map(p => bounds(p[0]));
  const parent = polygons.map((_, i) => i);
  const root = i => parent[i] === i ? i : (parent[i] = root(parent[i]));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const gap = Math.hypot(Math.max(0, a[0] - b[0] - b[2], b[0] - a[0] - a[2]),
      Math.max(0, a[1] - b[1] - b[3], b[1] - a[1] - a[3]));
    // Join neighboring islands into one envelope, but never bridge oceans or
    // the world-map seam for widely separated possessions.
    if (gap <= 45) parent[root(j)] = root(i);
  }
  const groups = new Map();
  polygons.forEach((p, i) => { const key = root(i); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(...p[0]); });
  return [...groups.values()];
}
export function buildHitAreas(entries, { worldWidth, worldHeight } = {}) {
  const small = entries.filter(e => e.playable && e.mainArea < 180);
  // These countries are large enough to select using their actual land shapes.
  const withoutPadding = new Set(['LB', 'PS', 'CY', 'QA', 'TL', 'XK']);
  const targets = small.filter(e => !withoutPadding.has(e.owner));
  const land = small.flatMap(e => e.polygons.map(polygon => ({ owner: e.owner, polygon, box: bounds(polygon[0]) })));
  const finished = [];
  for (const e of [...targets].sort((a, b) => a.area - b.area || a.owner.localeCompare(b.owner))) {
    const nearest = Math.min(...small.filter(o => o !== e).map(o => Math.hypot(e.anchor[0] - o.anchor[0], e.anchor[1] - o.anchor[1])));
    const padding = Math.min(4, nearest * .3);
    const groups = clusters(e.polygons);
    const envelopes = groups.map(points => paddedHull(points, padding));
    let shape = clipping.union(...envelopes);
    if (worldWidth) {
      // Move overflow to the opposite tile edge before allocating padding.
      const shift = dx => shape.map(p => p.map(r => r.map(([x, y]) => [x + dx, y])));
      shape = clipping.intersection(clipping.union(shape, shift(-worldWidth), shift(worldWidth)),
        [[[0, 0], [worldWidth, 0], [worldWidth, worldHeight], [0, worldHeight], [0, 0]]]);
    }
    const box = bounds(shape.flatMap(p => p[0]));
    // Keep the entire country's land, but reserve every other small country's
    // actual land before allocating padding. Prior targets get deterministic
    // priority in overlaps, so no click depends on SVG document order.
    const exclusions = land.filter(p => p.owner !== e.owner && overlaps(box, p.box)).map(p => p.polygon);
    for (const other of finished) if (overlaps(box, other.box)) exclusions.push(other.shape);
    if (exclusions.length) shape = clipping.difference(shape, ...exclusions);
    const main = shape.find(p => contains(e.anchor, p));
    if (!main) throw new Error(`Missing hit target at ${e.owner}`);
    const interior = polylabel(main, .001);
    e.hit = { type: 'outline', padding, clusters: groups.length, polygons: shape,
      minTargetWidth: 2 * interior.distance };
    e.focus = bounds(main[0]);
    finished.push({ shape, box });
  }
  return targets;
}
