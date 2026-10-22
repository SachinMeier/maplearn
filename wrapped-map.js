const NS = 'http://www.w3.org/2000/svg';
let sequence = 0;

export const wrapX = (x, width) => ((x % width) + width) % width;
export const nearestX = (x, center, width) => x + Math.round((center - x) / width) * width;

// Geometry stays in one source tree. Two sets of SVG <use> references supply
// neighboring worlds; there are no cloned path strings or additional fetches.
export class WrappedMap {
  constructor(svg, width) {
    this.svg = svg;
    this.width = width;
    this.regions = new Map();
    const prefix = `world-${++sequence}`;
    this.base = document.createElementNS(NS, 'g');
    this.base.dataset.worldBase = '';
    for (const child of [...svg.children]) {
      if (!['g', 'path', 'rect', 'circle'].includes(child.localName)) continue;
      child.id ||= `${prefix}-${this.base.children.length}`;
      this.base.append(child);
      if (child.dataset.country) this.regions.set(child.dataset.country, child);
    }
    svg.append(this.base);
    this.copies = [-1, 1].map(offset => {
      const group = document.createElementNS(NS, 'g');
      group.dataset.wrapOffset = String(offset);
      group.setAttribute('transform', `translate(${offset * width} 0)`);
      group.setAttribute('aria-hidden', 'true');
      for (const source of this.base.children) {
        const use = document.createElementNS(NS, 'use');
        use.setAttribute('href', `#${source.id}`);
        use.setAttribute('focusable', 'false');
        use.setAttribute('tabindex', '-1');
        if (source.dataset.country) use.dataset.wrapCountry = source.dataset.country;
        group.append(use);
      }
      svg.append(group);
      return group;
    });
  }
  update(left, right) {
    for (const group of this.copies) {
      const x = Number(group.dataset.wrapOffset) * this.width;
      group.style.display = right > x && left < x + this.width ? '' : 'none';
    }
  }
  region(element) {
    const node = element?.closest('[data-wrap-country], [data-country]');
    return node && this.svg.contains(node)
      ? this.regions.get(node.dataset.wrapCountry ?? node.dataset.country) : null;
  }
  hover(element) {
    const region = this.region(element);
    if (region === this.hovered) return;
    this.hovered?.classList.remove('wrap-hover');
    this.hovered = region;
    region?.classList.add('wrap-hover');
  }
  destroy() {
    this.hover(null);
    this.copies.forEach(group => group.remove());
    this.base.replaceWith(...this.base.childNodes);
  }
}
