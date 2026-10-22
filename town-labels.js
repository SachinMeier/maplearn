// Names appear only after a town is checked. Labels share the SVG camera and
// never receive pointer events, so they cannot obscure a town's click target.
const ns = 'http://www.w3.org/2000/svg';
const node = (tag, attrs = {}) => {
  const el = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
};
const intersection = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

export class TownLabels {
  constructor(svg, preferredPositions = {}) {
    this.svg = svg;
    this.labels = new Map();
    this.layer = node('g', { class: 'town-labels', 'pointer-events': 'none', 'aria-hidden': 'true' });
    svg.append(this.layer);
    const size = 12;
    const context = document.createElement('canvas').getContext('2d');
    context.font = `600 ${size}px system-ui`;
    const towns = [...svg.querySelectorAll('[data-country]')].map(region => {
      const circle = region.querySelector('circle.hit-area');
      return { code: region.dataset.country, name: region.getAttribute('aria-label'),
        x: circle.cx.baseVal.value, y: circle.cy.baseVal.value, radius: circle.r.baseVal.value };
    });
    const occupied = [];
    // Reserve the curated positions first, then the densest neighborhoods.
    // All towns reserve space up front,
    // keeping labels stable regardless of solve order or camera movement.
    const density = town => towns.filter(other => Math.hypot(town.x - other.x, town.y - other.y) < 80).length;
    towns.sort((a, b) => Number(Boolean(preferredPositions[b.code])) - Number(Boolean(preferredPositions[a.code]))
      || density(b) - density(a) || a.y - b.y || a.code.localeCompare(b.code));
    this.placements = new Map();
    for (const town of towns) {
      const lines = town.name.split(' ');
      const width = Math.max(...lines.map(line => context.measureText(line).width)) + 6;
      const height = lines.length * size * 1.15 + 4;
      const candidates = [];
      const preference = preferredPositions[town.code];
      const preferred = typeof preference === 'string' ? preference : preference?.side;
      if (preferred) {
        const gap = preference.gap ?? 5, diagonal = town.radius / Math.SQRT2 + gap;
        const positions = {
          above: [town.x - width / 2, town.y - town.radius - gap - height],
          below: [town.x - width / 2, town.y + town.radius + gap],
          right: [town.x + town.radius + gap, town.y - height / 2],
          left: [town.x - town.radius - gap - width, town.y - height / 2],
          'below-right': [town.x + diagonal, town.y + diagonal],
          'below-left': [town.x - diagonal - width, town.y + diagonal],
        };
        const [x, y] = positions[preferred];
        candidates.push({ box: { x: x + (preference.offsetX ?? 0), y, width, height }, side: preferred, row: 0, shift: 0, score: -Infinity });
      }
      for (let row = 0; row < 3; row++) for (const side of ['above', 'below']) for (const shift of [0, -width * .45, width * .45]) {
        const gap = 5 + row * (height + 3);
        const box = { x: town.x - width / 2 + shift,
          y: side === 'above' ? town.y - town.radius - gap - height : town.y + town.radius + gap,
          width, height };
        const labelOverlap = occupied.reduce((sum, other) => sum + intersection(box, other), 0);
        const circleOverlap = towns.reduce((sum, other) => sum + intersection(box,
          { x: other.x - other.radius - 2, y: other.y - other.radius - 2,
            width: other.radius * 2 + 4, height: other.radius * 2 + 4 }), 0);
        candidates.push({ box, side, row, shift, score: labelOverlap * 10000 + circleOverlap * 100 + gap + Math.abs(shift) * .6 });
      }
      candidates.sort((a, b) => a.score - b.score);
      const placement = { ...town, ...candidates[0], lines, size };
      const { box, side } = placement;
      // Scale text around its near edge so adjacent side/diagonal labels stay
      // close to their own circles at every zoom level.
      placement.labelAnchor = [
        side === 'right' || side === 'below-right' ? box.x
          : side === 'left' || side === 'below-left' ? box.x + box.width : box.x + box.width / 2,
        side === 'above' ? box.y + box.height
          : side === 'left' || side === 'right' ? box.y + box.height / 2 : box.y,
      ];
      occupied.push(placement.box);
      this.placements.set(town.code, placement);
    }
    this.observer = new MutationObserver(() => this.resize());
    this.observer.observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
  }

  show(code) {
    if (this.labels.has(code)) return;
    const placement = this.placements.get(code);
    if (!placement) return;
    const { box, lines, size, side, x, y, radius } = placement;
    const label = node('g', { 'data-town-label': code, 'data-placement': side,
      'data-label-box': [box.x, box.y, box.width, box.height].join(' ') });
    const ink = node('g');
    const text = node('text', { class: 'town-name', 'text-anchor': 'middle',
      'font-family': 'system-ui', 'font-weight': 600, 'font-size': size, fill: '#18251c',
      stroke: '#f8efd9', 'stroke-width': 3, 'stroke-linejoin': 'round', 'paint-order': 'stroke fill' });
    lines.forEach((line, index) => {
      const span = node('tspan', { x: box.x + box.width / 2, y: box.y + 2 + size * .85 + index * size * 1.15 });
      span.textContent = line + (index < lines.length - 1 ? ' ' : '');
      text.append(span);
    });
    // A short leader clarifies association when a crowded label has
    // to sit farther from its circle. It does not add another selectable area.
    if (placement.row > 0 || Math.abs(placement.shift) > radius / 2) {
      const [endX, endY] = placement.labelAnchor;
      const dx = endX - x, dy = endY - y;
      const distance = Math.hypot(dx, dy);
      // Intersect the center-to-label ray with the circle. The leader follows
      // its radius, meeting the circumference perpendicular to its tangent.
      const startX = x + radius * dx / distance;
      const startY = y + radius * dy / distance;
      label.append(node('path', { class: 'town-leader', d: `M${startX},${startY}L${endX},${endY}`,
        fill: 'none', stroke: '#526050', 'stroke-width': .6, 'vector-effect': 'non-scaling-stroke' }));
    }
    ink.append(text); label.append(ink); this.layer.append(label);
    this.labels.set(code, { ink, placement });
    this.resize();
  }

  resize() {
    const scale = this.svg.getScreenCTM()?.a;
    if (!scale) return;
    for (const { ink, placement: { labelAnchor, size } } of this.labels.values()) {
      // Shrink smoothly toward a 16px screen-size cap while retaining the
      // original anchor and reserved space. No jumping between above/below.
      const factor = 1 / Math.pow(1 + (size * scale / 16) ** 4, .25);
      const [x, y] = labelAnchor;
      ink.setAttribute('transform', `translate(${x} ${y}) scale(${factor}) translate(${-x} ${-y})`);
    }
  }

  destroy() { this.observer.disconnect(); this.layer.remove(); }
}
