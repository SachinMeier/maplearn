import { readGeometry, placeTitles, titleScale, titleOpacity } from './title-placement.js';
import { nearestX } from './wrapped-map.js';

const ns = 'http://www.w3.org/2000/svg';
const node = (tag, attrs = {}) => {
  const element = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
};

// Each completed region gets one permanent layout. Only its transform and
// opacity change with the camera; unknown answers never enter the title layer.
export class RegionTitles {
  constructor(svg, regions, { unit = 1, layerClass = '', overlay, onUpdate = () => {} } = {}) {
    this.svg = svg;
    this.container = svg.parentElement;
    this.regions = new Map(regions.map(r => [r.code, r]));
    this.placements = new Map();
    this.unit = unit;
    this.enabled = true;
    this.always = false;
    this.preference = 12 * unit;
    this.onUpdate = onUpdate;
    this.layer = node('g', { class: `region-titles ${layerClass}`, 'pointer-events': 'none', 'aria-hidden': 'true' });
    svg.append(this.layer);
    this.ownsOverlay = !overlay;
    this.overlay = overlay ?? document.createElement('div');
    this.overlay.classList.add('map-title-callout');
    this.overlay.hidden = true;
    if (!overlay) {
      this.overlay.innerHTML = '<svg aria-hidden="true"><path/><circle r="2.5"/></svg><div role="status"></div>';
      this.container.append(this.overlay);
    }
    this.pill = this.overlay.querySelector('div');
    this.pill.classList.add('map-title-name');
    this.link = this.overlay.querySelector('path');
    this.dot = this.overlay.querySelector('circle');
    this.context = document.createElement('canvas').getContext('2d');
    this.context.font = `600 ${18 * unit}px system-ui`;
    this.abort = new AbortController();
    const listen = (type, fn) => svg.addEventListener(type, fn, { signal: this.abort.signal });
    const codeAt = element => element?.closest('[data-country], [data-wrap-country]')?.dataset;
    listen('pointermove', event => {
      if (event.pointerType !== 'mouse') return;
      const data = !event.buttons && codeAt(event.target);
      const code = data?.country ?? data?.wrapCountry;
      if (this.hover !== code) { this.hover = code; this.update(); }
    });
    listen('pointerleave', () => { this.hover = null; this.update(); });
    listen('focusin', event => {
      this.active = codeAt(event.target)?.country;
      this.update();
    });
    listen('focusout', () => { this.active = null; this.update(); });
    this.observer = new MutationObserver(() => this.update());
    this.observer.observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
    this.resizeObserver = new ResizeObserver(() => this.update());
    this.resizeObserver.observe(svg);
  }

  show(code, update = true) {
    if (this.placements.has(code)) return;
    const region = this.regions.get(code);
    if (!region) return;
    const path = region.element.querySelector('path.region-fill');
    // Artificial water targets have no physical surface in which to fit text.
    // Keep their names in the same on-demand callout used for tiny islands.
    const placement = path ? placeTitles([{ ...region, geometry: readGeometry(path) }], {
      size: 18 * this.unit, measure: text => this.context.measureText(text).width,
    })[0] : { ...region, kind: 'callout', size: 0, lines: [],
      box: { x: region.anchor[0], y: region.anchor[1], width: 0, height: 0 } };
    const { box, size, lines } = placement;
    const label = node('g', { class: 'title-label title-inside', 'data-title-for': code,
      'data-label-box': [box.x, box.y, box.width, box.height].join(' '), 'data-placement': placement.kind });
    const ink = node('g', { transform: `translate(${box.x + box.width / 2} ${box.y + box.height / 2}) scale(${size / 18})` });
    const text = node('text', { class: 'region-title department-title', 'font-size': 18, 'aria-label': placement.name });
    // Inline paint/font properties also survive SVG <use> shadow trees in the
    // neighboring world copies (ancestor-based CSS does not always cross them).
    const solvedColor = region.element.classList.contains('solved') && region.element.dataset.solvedTitleColor;
    text.style.cssText = `font-family:system-ui,sans-serif;font-weight:600;text-anchor:middle;stroke:none;fill:${solvedColor || (this.svg.classList.contains('water-map') ? '#fff' : '#172a2f')}`;
    lines.forEach((line, i) => {
      const span = node('tspan', { x: 0, y: (i - (lines.length - 1) / 2) * 18 * 1.15 + 18 * .34 });
      span.textContent = line;
      text.append(span);
    });
    ink.append(text); label.append(ink); this.layer.append(label);
    placement.element = label;
    this.placements.set(code, placement);
    if (update) this.update();
  }

  showAll(codes) { for (const code of codes) this.show(code, false); this.update(); }
  interact(code) { this.active = code; this.update(); }

  update() {
    const matrix = this.svg.getScreenCTM();
    if (!matrix) return;
    const scale = matrix.a;
    const interaction = this.hover || this.active;
    let visible = 0;
    for (const placement of this.placements.values()) {
      const { box, element, size } = placement;
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      const factor = titleScale(size, scale, this.preference);
      const opacity = placement.kind === 'callout' ? 0 : this.always ? 1 : titleOpacity(size * factor * scale);
      placement.factor = factor;
      placement.opacity = opacity;
      element.setAttribute('transform', `translate(${cx} ${cy}) scale(${factor}) translate(${-cx} ${-cy})`);
      element.style.opacity = opacity;
      const shown = opacity > 0 && !(placement.code === interaction && opacity < .999);
      element.style.visibility = shown ? 'visible' : 'hidden';
      element.dataset.zoomHidden = String(!shown);
      if (shown) visible++;
    }
    this.layer.style.display = this.enabled ? '' : 'none';
    this.updateCallout(this.enabled ? interaction : null, matrix);
    this.onUpdate(this.enabled ? visible : 0, this.placements.size);
  }

  updateCallout(code, matrix) {
    const placement = this.placements.get(code);
    this.overlay.hidden = !placement || placement.opacity >= .999;
    if (this.overlay.hidden) return;
    const bounds = this.container.getBoundingClientRect();
    const view = this.svg.viewBox.baseVal;
    const wrap = Number(this.svg.dataset.wrapWidth);
    const shift = x => wrap ? nearestX(x, view.x + view.width / 2, wrap) : x;
    const point = new DOMPoint(shift(placement.anchor[0]), placement.anchor[1]).matrixTransform(matrix);
    const x = point.x - bounds.left, y = point.y - bounds.top;
    if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) { this.overlay.hidden = true; return; }
    this.pill.textContent = placement.name;
    this.overlay.dataset.titleCode = code;
    const w = this.pill.offsetWidth, h = this.pill.offsetHeight, gap = 22;
    const positions = [[x + gap, y - h - gap], [x - w - gap, y - h - gap],
      [x + gap, y + gap], [x - w - gap, y + gap], [x - w / 2, y - h - gap], [x - w / 2, y + gap]];
    const occupied = [...this.placements.values()].filter(p => p.opacity > 0 && p.code !== code).map(p => {
      const center = new DOMPoint(shift(p.box.x + p.box.width / 2), p.box.y + p.box.height / 2).matrixTransform(matrix);
      const width = p.box.width * matrix.a * p.factor, height = p.box.height * matrix.a * p.factor;
      return { x: center.x - bounds.left - width / 2, y: center.y - bounds.top - height / 2, width, height };
    });
    const candidates = positions.map(([left, top]) => {
      left = Math.max(8, Math.min(bounds.width - w - 8, left));
      top = Math.max(8, Math.min(bounds.height - h - 8, top));
      const overlap = occupied.reduce((sum, b) => sum + Math.max(0, Math.min(left + w, b.x + b.width) - Math.max(left, b.x))
        * Math.max(0, Math.min(top + h, b.y + b.height) - Math.max(top, b.y)), 0);
      return { left, top, score: overlap * 10 + Math.hypot(left + w / 2 - x, top + h / 2 - y) };
    }).sort((a, b) => a.score - b.score);
    const { left, top } = candidates[0];
    this.pill.style.left = `${left}px`; this.pill.style.top = `${top}px`;
    const endX = Math.max(left, Math.min(left + w, x)), endY = Math.max(top, Math.min(top + h, y));
    this.link.setAttribute('d', `M${x},${y}L${endX},${endY}`);
    this.dot.setAttribute('cx', x); this.dot.setAttribute('cy', y);
  }

  destroy() {
    this.abort.abort(); this.observer.disconnect(); this.resizeObserver.disconnect();
    this.layer.remove();
    if (this.ownsOverlay) this.overlay.remove(); else this.overlay.hidden = true;
  }
}
