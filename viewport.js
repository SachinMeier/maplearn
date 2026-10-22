// The SVG itself handles hit testing; all regions and hit areas share this camera.
import { WrappedMap, wrapX, nearestX } from './wrapped-map.js';

export class MapViewport {
  constructor(svg, onGuess, focusOptions = {}) {
    this.svg = svg;
    this.onGuess = onGuess;
    // Map-specific automatic framing; manual zoom keeps its full range.
    this.focusOptions = { duration: 320, maxZoom: 512, smooth: false, ...focusOptions };
    const box = svg.viewBox.baseVal;
    this.bounds = { x: box.x, y: box.y, width: box.width, height: box.height };
    const wrapWidth = Number(svg.dataset.wrapWidth);
    this.wrapping = wrapWidth > 0 ? new WrappedMap(svg, wrapWidth) : null;
    this.camera = { x: box.x + box.width / 2, y: box.y + box.height / 2, scale: 1 };
    this.pointers = new Map();
    this.abort = new AbortController();
    this.frame = 0;
    const listen = (type, callback, options = {}) => svg.addEventListener(type, callback, { ...options, signal: this.abort.signal });
    listen('pointerdown', event => this.down(event));
    listen('pointermove', event => this.move(event));
    listen('pointerup', event => this.up(event));
    listen('pointercancel', event => this.cancel(event));
    listen('lostpointercapture', event => this.cancel(event));
    listen('pointerleave', () => this.wrapping?.hover(null));
    listen('wheel', event => {
      event.preventDefault();
      this.stop();
      this.zoom(Math.exp(-event.deltaY * (event.deltaMode === 1 ? .04 : .002)), event.clientX, event.clientY);
    }, { passive: false });
    listen('keydown', event => {
      const region = event.target.closest('[data-country]');
      if (region && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        this.onGuess(region.dataset.country);
      } else if (event.key === '+' || event.key === '=') { event.preventDefault(); this.zoom(1.5); }
      else if (event.key === '-') { event.preventDefault(); this.zoom(1 / 1.5); }
      else if (event.key === '0') { event.preventDefault(); this.reset(); }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); this.stop();
        this.camera.x += (event.key === 'ArrowRight' ? 70 : event.key === 'ArrowLeft' ? -70 : 0) / this.camera.scale;
        this.camera.y += (event.key === 'ArrowDown' ? 70 : event.key === 'ArrowUp' ? -70 : 0) / this.camera.scale;
        this.render();
      }
    });
    // Letter shortcuts work immediately, even before the map has focus.
    document.addEventListener('keydown', event => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (event.target.isContentEditable || event.target.closest('input, textarea, select, [role="textbox"]')) return;
      if (document.querySelector('dialog[open]') || !svg.getClientRects().length) return;
      const direction = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] }[event.key.toLowerCase()];
      if (!direction) return;
      event.preventDefault();
      this.stop();
      this.camera.x += direction[0] * 70 / this.camera.scale;
      this.camera.y += direction[1] * 70 / this.camera.scale;
      this.render();
    }, { signal: this.abort.signal });
    listen('focusin', event => {
      const region = event.target.closest('[data-country]');
      if (region && region.matches(':focus-visible')) this.focus(region);
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(svg);
    this.resize();
  }
  stop() { cancelAnimationFrame(this.frame); this.frame = 0; }
  resize() {
    this.stop();
    const ratio = this.baseScale ? this.camera.scale / this.baseScale : 1;
    this.rect = this.svg.getBoundingClientRect();
    if (!this.rect.width || !this.rect.height) return;
    this.baseScale = Math.min(this.rect.width / (this.bounds.width + 80), this.rect.height / (this.bounds.height + 180));
    // Even an ultrawide window may expose at most 1.8 worlds at once, so the
    // central world plus its two neighbors always cover the horizontal view.
    if (this.wrapping) this.baseScale = Math.max(this.baseScale, this.rect.width / (this.wrapping.width * 1.8));
    this.camera.scale = this.baseScale * ratio;
    this.render();
  }
  render() {
    const { width, height } = this.rect;
    const camera = this.camera;
    const w = width / camera.scale;
    const h = height / camera.scale;
    const previousX = camera.x, previousY = camera.y;
    if (this.wrapping) {
      const x = wrapX(camera.x, this.wrapping.width);
      const shift = camera.x - x;
      camera.x = x;
      // Keep an in-progress drag continuous when the camera crosses a seam.
      if (this.origin) this.origin.x -= shift;
      this.wrapping.update(x - w / 2, x + w / 2);
    } else {
      // A finite map stays centered on an axis until it overflows that axis.
      // Once zoomed in, its visible edge stops exactly at the regional frame.
      camera.x = w >= this.bounds.width ? this.bounds.x + this.bounds.width / 2
        : Math.max(this.bounds.x + w / 2, Math.min(this.bounds.x + this.bounds.width - w / 2, camera.x));
      if (this.origin) this.origin.x += camera.x - previousX;
    }
    const bottomLimit = this.bounds.y + this.bounds.height - h / 2;
    // Clamp the visible bottom edge, not the camera center. When the whole
    // map fits vertically, anchor it to the bottom rather than exposing space
    // below Antarctica. Any extra viewport height stays above the map.
    camera.y = !this.wrapping && h >= this.bounds.height ? this.bounds.y + this.bounds.height / 2
      : Math.min(bottomLimit, Math.max(this.bounds.y + h / 2, camera.y));
    // Discard overshoot so reversing a drag moves immediately at the limit.
    if (this.origin) this.origin.y += camera.y - previousY;
    this.svg.setAttribute('viewBox', `${camera.x - w / 2} ${camera.y - h / 2} ${w} ${h}`);
  }
  zoom(factor, clientX, clientY) {
    this.stop();
    const dx = (clientX ?? (this.rect.left + this.rect.width / 2)) - this.rect.left - this.rect.width / 2;
    const dy = (clientY ?? (this.rect.top + this.rect.height / 2)) - this.rect.top - this.rect.height / 2;
    const old = this.camera.scale;
    const scale = Math.max(this.baseScale, Math.min(this.baseScale * 512, old * factor));
    this.camera.x += dx / old - dx / scale;
    this.camera.y += dy / old - dy / scale;
    this.camera.scale = scale;
    this.render();
  }
  animate(target, { duration = 320, smooth = false } = {}) {
    this.stop();
    if (this.wrapping) target = { ...target, x: nearestX(target.x, this.camera.x, this.wrapping.width) };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { this.camera = target; this.render(); return 0; }
    const start = { ...this.camera };
    const time = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - time) / duration);
      // Smoothstep starts and ends at rest, avoiding an initial camera lurch.
      const ease = smooth ? t * t * (3 - 2 * t) : 1 - (1 - t) ** 3;
      for (const key of ['x', 'y', 'scale']) this.camera[key] = start[key] + (target[key] - start[key]) * ease;
      // Equal proportional zoom steps feel steadier than equal scale steps.
      if (smooth) this.camera.scale = start.scale * (target.scale / start.scale) ** ease;
      this.render();
      if (t < 1) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
    return duration;
  }
  reset() {
    this.animate({ x: this.bounds.x + this.bounds.width / 2, y: this.bounds.y + this.bounds.height / 2, scale: this.baseScale });
  }
  focus(region) {
    // A country's largest landmass avoids framing the whole world for countries
    // with overseas islands or geometry on both sides of the antimeridian.
    const focus = region.dataset.focusBox?.split(' ').map(Number);
    const box = focus?.length === 4 && focus.every(Number.isFinite)
      ? { x: focus[0], y: focus[1], width: focus[2], height: focus[3] }
      : region.getBBox();
    let scale = Math.max(this.baseScale, Math.min(this.baseScale * 12, this.rect.width / (box.width * 3), this.rect.height / (box.height * 4)));
    const hitArea = region.querySelector('.hit-area');
    if (hitArea) {
      const targetWidth = Number(hitArea.dataset.minTargetWidth) || hitArea.getBBox().width;
      // Preserve usable padding for tiny targets without cropping long outlines.
      const fit = Math.min(this.rect.width / (box.width * 1.5), this.rect.height / (box.height * 1.5));
      scale = Math.min(this.baseScale * 512, fit, Math.max(scale, 24 / targetWidth));
    }
    // Apply the cap after tiny-target padding so it cannot force a town close-up.
    scale = Math.min(scale, this.baseScale * this.focusOptions.maxZoom);
    return this.animate({ x: box.x + box.width / 2, y: box.y + box.height / 2, scale }, this.focusOptions);
  }
  point(event) { return { x: event.clientX, y: event.clientY }; }
  down(event) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    this.stop();
    this.svg.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, this.point(event));
    if (this.pointers.size === 1) {
      this.start = this.point(event);
      this.origin = { ...this.camera };
      this.moved = false;
      this.multitouch = false;
    } else { this.multitouch = true; this.moved = true; }
  }
  move(event) {
    if (!this.pointers.has(event.pointerId)) {
      if (event.pointerType === 'mouse') this.wrapping?.hover(event.target);
      return;
    }
    const before = [...this.pointers.values()];
    this.pointers.set(event.pointerId, this.point(event));
    const after = [...this.pointers.values()];
    if (after.length >= 2) {
      const distance = points => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const midpoint = points => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
      const a = midpoint(before), b = midpoint(after);
      this.zoom(distance(after) / Math.max(1, distance(before)), a.x, a.y);
      this.camera.x -= (b.x - a.x) / this.camera.scale;
      this.camera.y -= (b.y - a.y) / this.camera.scale;
      this.render();
    } else {
      const dx = event.clientX - this.start.x, dy = event.clientY - this.start.y;
      if (Math.hypot(dx, dy) > 8) this.moved = true;
      if (this.moved) {
        this.camera.x = this.origin.x - dx / this.camera.scale;
        this.camera.y = this.origin.y - dy / this.camera.scale;
        this.render();
      }
    }
    this.svg.parentElement.classList.toggle('dragging', this.moved);
  }
  up(event) {
    if (!this.pointers.has(event.pointerId)) return;
    const isTap = !this.moved && !this.multitouch && Math.hypot(event.clientX - this.start.x, event.clientY - this.start.y) <= 8;
    this.cancel(event);
    if (isTap) {
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const region = this.wrapping ? this.wrapping.region(hit) : hit?.closest('[data-country]');
      if (region && this.svg.contains(region)) this.onGuess(region.dataset.country);
    }
  }
  cancel(event) {
    this.pointers.delete(event.pointerId);
    if (this.svg.hasPointerCapture(event.pointerId)) this.svg.releasePointerCapture(event.pointerId);
    if (this.pointers.size === 1) {
      this.start = [...this.pointers.values()][0];
      this.origin = { ...this.camera };
    }
    if (!this.pointers.size) this.svg.parentElement.classList.remove('dragging');
  }
  destroy() { this.stop(); this.abort.abort(); this.observer.disconnect(); this.pointers.clear(); this.wrapping?.destroy(); }
}
