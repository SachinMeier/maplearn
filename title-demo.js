import { MapViewport } from './viewport.js';
import { RegionTitles } from './region-titles.js';

const $ = id => document.getElementById(id);
const frame = [-80, -40, 1260, 1100];
let viewport, svg, regions, manifest, activeCode, hoverCode, titles;
function highlight(code) {
  activeCode = code;
  $('department-picker').value = code ?? '';
  updateEmphasis();
}
function updateEmphasis() {
  svg.querySelectorAll('.is-active').forEach(el => el.classList.remove('is-active'));
  for (const code of new Set([activeCode, hoverCode].filter(Boolean))) {
    svg.querySelector(`[data-country="${code}"]`)?.classList.add('is-active');
    svg.querySelectorAll(`[data-title-for="${code}"]`).forEach(el => el.classList.add('is-active'));
  }
  updateVisibility();
}
function updateVisibility() {
  if (!titles) return;
  titles.enabled = $('show-titles').checked;
  titles.always = $('small-titles').value === 'always';
  titles.preference = Number($('title-size').value);
  titles.interact(hoverCode || activeCode);
}
function renderTitles() {
  titles = new RegionTitles(svg, regions, {
    layerClass: 'demo-titles', overlay: $('hover-title'),
    onUpdate: (visible, total) => { $('demo-status').textContent = `${visible} / ${total} titles visible`; },
  });
  titles.showAll(regions.map(r => r.code));
  updateEmphasis();
}
async function start() {
  try {
    const responses = await Promise.all([
      fetch('../assets/maps/french-departments.svg'), fetch('../assets/maps/french-departments.manifest.json'),
    ]);
    if (responses.some(r => !r.ok)) throw new Error('Map files unavailable');
    const [source, metadata] = await Promise.all([responses[0].text(), responses[1].json()]);
    manifest = metadata;
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid map SVG');
    svg = document.importNode(doc.documentElement, true);
    svg.querySelectorAll('title').forEach(el => el.remove());
    svg.setAttribute('viewBox', frame.join(' '));
    svg.setAttribute('role', 'group');
    svg.setAttribute('tabindex', '0');
    svg.setAttribute('aria-label', 'French departments with experimental titles');
    $('demo-map').append(svg);
    regions = Object.entries(manifest.regions).map(([code, region]) => {
      const element = svg.querySelector(`[data-country="${code}"]`);
      element.setAttribute('tabindex', '0');
      element.setAttribute('role', 'button');
      element.setAttribute('aria-label', region.name);
      return { ...region, code, element };
    });
    await document.fonts.ready;
    renderTitles();
    viewport = new MapViewport(svg, highlight);
    updateVisibility();
    for (const region of [...regions].sort((a, b) => a.name.localeCompare(b.name, 'fr'))) {
      const option = document.createElement('option');
      option.value = region.code; option.textContent = `${region.name} (${region.code})`;
      $('department-picker').append(option);
    }
    $('department-picker').disabled = false;
    $('reset-view').disabled = false;
    $('demo-map').setAttribute('aria-busy', 'false');
    svg.addEventListener('focusin', event => {
      const code = event.target.closest('[data-country]')?.dataset.country;
      if (code) highlight(code);
    });
    svg.addEventListener('pointermove', event => {
      if (event.buttons) { if (hoverCode) { hoverCode = null; updateEmphasis(); } return; }
      if (event.pointerType !== 'mouse') return;
      const code = event.target.closest('[data-country]')?.dataset.country;
      if (code !== hoverCode) { hoverCode = code; updateEmphasis(); }
    });
    svg.addEventListener('pointerleave', () => { hoverCode = null; updateEmphasis(); });
  } catch (error) {
    console.error(error);
    $('demo-error').hidden = false;
    $('demo-status').textContent = 'Map unavailable';
    $('demo-map').setAttribute('aria-busy', 'false');
  }
}
$('show-titles').addEventListener('change', updateVisibility);
$('small-titles').addEventListener('change', updateVisibility);
$('title-size').addEventListener('input', () => {
  $('size-value').value = $('title-size').value;
  updateVisibility();
});
$('reset-view').addEventListener('click', () => { hoverCode = null; viewport?.reset(); highlight(null); });
$('department-picker').addEventListener('change', () => {
  const code = $('department-picker').value;
  highlight(code);
  if (code) viewport.focus(svg.querySelector(`[data-country="${code}"]`));
});
$('demo-reload').addEventListener('click', () => location.reload());
window.addEventListener('pagehide', () => {
  viewport?.destroy(); titles?.destroy();
});
start();
