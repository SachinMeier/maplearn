import { addDownloadControl, initializeDownloads } from './offline.js';
import { Game } from './game.js';
import { MapViewport } from './viewport.js';
import { maps } from './maps.js';
import { TownLabels } from './town-labels.js';
import { RegionTitles } from './region-titles.js';

const $ = id => document.getElementById(id);
let game, viewport, townLabels, regionTitles;
let selectedMap = maps[0];
const mapCache = new Map();
let includeMicrostates = true;
let locked = false, generation = 0, toastTimer, advanceTimer;
let completionShown = false;
let regions = new Map();

try { includeMicrostates = localStorage.getItem('maplearn.includeMicrostates') !== 'false'; } catch { /* Storage is optional. */ }

function closeDialogs() { document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); }
function clearFeedback() {
  clearTimeout(toastTimer); clearTimeout(advanceTimer);
  $('toast').className = 'toast'; $('toast').textContent = '';
}
function showToast(result) {
  clearTimeout(toastTimer);
  $('toast').textContent = result === 'correct' ? 'Correct' : 'Incorrect';
  $('toast').className = `toast visible ${result}`;
  toastTimer = setTimeout(() => { $('toast').classList.remove('visible'); }, 2000);
}
function updateScores() {
  $('progress').textContent = `${game.completed.size} / ${game.total}`;
  for (const kind of ['correct', 'incorrect', 'reveals']) {
    $(`menu-${kind}`).textContent = game[kind];
    $(`final-${kind}`).textContent = game[kind];
  }
}
function updatePrompt() {
  updateScores();
  $('country-name').textContent = game.current?.name ?? 'Complete';
  $('country-pill').disabled = locked || game.done;
  $('menu-reveal').disabled = locked || game.done;
  $('menu-reveal-all').disabled = locked || game.done;
  $('country-pill').setAttribute('aria-label', game.current ? `Reveal ${game.current.name}` : 'Map complete');
  $('game-announcement').textContent = game.current ? `${game.current.name}. ${game.completed.size} of ${game.total}.` : 'Map complete.';
  if (game.done && !completionShown) {
    completionShown = true;
    closeDialogs(); $('complete-dialog').showModal();
  }
}
function mark(code, result, updateTitles = true) {
  for (const region of regions.get(code) ?? []) {
    region.classList.add('solved');
    if (result === 'revealed') region.classList.add('revealed');
  }
  townLabels?.show(code);
  regionTitles?.show(code, updateTitles);
}
function guess(code) {
  if (!game || locked || document.querySelector('dialog[open]')) return;
  // Checked shapes are now also an exploration affordance, especially for
  // small names on touch screens. Inspecting one must not count as a mistake.
  if (game.completed.has(code)) { regionTitles?.interact(code); return; }
  const result = game.guess(code);
  if (result === 'ignored') return;
  if (result === 'correct') mark(code, result);
  showToast(result);
  updatePrompt();
}
function reveal() {
  if (!game || locked || game.done) return;
  clearFeedback();
  locked = true;
  const code = game.reveal();
  const focusDuration = viewport.focus(regions.get(code)[0]);
  mark(code, 'revealed');
  updateScores();
  $('country-pill').disabled = true;
  $('menu-reveal').disabled = true;
  $('menu-reveal-all').disabled = true;
  const currentGeneration = generation;
  advanceTimer = setTimeout(() => {
    if (generation !== currentGeneration) return;
    locked = false;
    updatePrompt();
  }, Math.max(700, focusDuration + 350));
}

function revealAll() {
  if (!game || locked || game.done) return;
  clearFeedback();
  for (const code of game.revealAll()) mark(code, 'revealed', false);
  regionTitles?.update();
  viewport.reset();
  updatePrompt();
}
function closeCompletion() {
  $('complete-dialog').close();
  $('menu-button').focus({ preventScroll: true });
}

async function startGame() {
  const map = selectedMap;
  const currentGeneration = ++generation;
  closeDialogs(); clearFeedback(); viewport?.destroy(); viewport = null;
  townLabels?.destroy(); townLabels = null;
  regionTitles?.destroy(); regionTitles = null;
  game = null; locked = true; completionShown = false;
  $('home').hidden = true; $('game').hidden = false;
  $('map-surface').replaceChildren(); $('load-error').hidden = true;
  $('country-name').textContent = 'Loading…'; $('progress').textContent = '0 / 0';
  $('country-pill').disabled = true; $('menu-reveal').disabled = true;
  $('menu-reveal-all').disabled = true;
  $('map-note').hidden = true;
  document.title = `${map.name} · Maps`;
  $('menu-title').textContent = map.name;
  $('country-pill').title = `Reveal ${map.unit ?? 'country'}`;
  $('reveal-hint').textContent = `Reveal and check off the current ${map.unit ?? 'country'}.`;
  $('game').setAttribute('aria-label', `${map.name} map game`);
  try {
    if (!mapCache.has(map.id)) {
      const responses = await Promise.all([fetch(map.countries), fetch(map.svg), fetch(map.svg.replace('.svg', '.manifest.json'))]);
      if (responses.some(response => !response.ok)) throw new Error('Map files unavailable');
      const [countries, mapSource, manifest] = await Promise.all([responses[0].json(), responses[1].text(), responses[2].json()]);
      mapCache.set(map.id, { countries, mapSource, manifest });
    }
    if (generation !== currentGeneration) return;
    const { countries, mapSource, manifest } = mapCache.get(map.id);
    const doc = new DOMParser().parseFromString(mapSource, 'image/svg+xml');
    if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('Invalid map SVG');
    const svg = document.importNode(doc.documentElement, true);
    // Native SVG tooltips would disclose the quiz answers on hover.
    // Accessible region names are assigned separately below.
    svg.querySelectorAll('title').forEach(title => title.remove());
    svg.querySelectorAll('[title]').forEach(element => element.removeAttribute('title'));
    svg.removeAttribute('title');
    svg.setAttribute('tabindex', '0');
    svg.setAttribute('role', 'group');
    regions = new Map();
    const lookup = new Map(countries.map(country => [country.code, country]));
    for (const region of svg.querySelectorAll('[data-country]')) {
      const country = lookup.get(region.dataset.country);
      if (!country || (!includeMicrostates && country.microstate)) { region.remove(); continue; }
      region.setAttribute('role', 'button'); region.setAttribute('tabindex', '0');
      region.setAttribute('aria-label', country.name);
      const entries = regions.get(country.code) ?? [];
      entries.push(region); regions.set(country.code, entries);
    }
    // Keep a shared border when either adjacent region remains visible. Coastlines
    // belonging only to filtered territories disappear with their country fills.
    for (const border of svg.querySelectorAll('[data-border-owners]')) {
      const visible = border.dataset.borderOwners.split(' ').some(code => code.startsWith('context-') || regions.has(code));
      if (!visible) border.remove();
    }
    game = new Game(countries, includeMicrostates);
    if (game.countries.some(country => !regions.has(country.code))) throw new Error('Missing country geometry');
    $('map-surface').append(svg);
    $('map-note').hidden = svg.dataset.placeholder !== 'true';
    await document.fonts.ready;
    if (generation !== currentGeneration) return;
    if (!map.solvedTownLabels) {
      const metadata = manifest.regions ?? manifest.countries;
      regionTitles = new RegionTitles(svg, game.countries.map(country => ({
        ...metadata[country.code], ...country, element: regions.get(country.code)[0],
      })), { unit: Math.max(manifest.viewBox[2], manifest.viewBox[3]) / 1100 });
    }
    // Construct titles before wrapping: the neighboring worlds then reference
    // this same live layer, including labels added later by guesses/reveals.
    viewport = new MapViewport(svg, guess, map.focus);
    if (map.solvedTownLabels) townLabels = new TownLabels(svg, map.townLabelPositions);
    locked = false;
    updatePrompt();
    $('country-pill').focus({ preventScroll: true });
  } catch (error) {
    if (generation !== currentGeneration) return;
    console.error(error);
    mapCache.delete(map.id);
    game = null;
    $('country-name').textContent = map.name;
    $('load-error').hidden = false;
  }
}
function navigate() {
  const [path, query = ''] = location.hash.slice(1).split('?');
  const map = maps.find(map => path === `/${map.id}`);
  if (map) {
    selectedMap = map;
    const preference = new URLSearchParams(query).get('microstates');
    if (preference !== null) includeMicrostates = preference !== '0';
    startGame();
  } else {
    generation++; clearFeedback(); closeDialogs(); viewport?.destroy(); viewport = null; game = null;
    townLabels?.destroy(); townLabels = null;
    regionTitles?.destroy(); regionTitles = null;
    $('map-surface').replaceChildren();
    $('game').hidden = true; $('home').hidden = false;
    document.title = 'Maps';
    if (path) $('world-button').focus({ preventScroll: true });
  }
}
function chooseMicrostates(value) {
  includeMicrostates = value;
  try { localStorage.setItem('maplearn.includeMicrostates', String(value)); } catch { /* Storage is optional. */ }
  $('setup-dialog').close();
  location.hash = `/${selectedMap.id}?microstates=${value ? '1' : '0'}`;
}
for (const map of maps) {
  const button = document.createElement('button');
  button.id = `${map.id}-button`;
  button.className = 'map-card';
  button.innerHTML = `<span class="thumbnail"><img src="assets/maps/${map.id}.thumbnail.svg" alt="" loading="lazy"></span><span class="card-name">${map.name}</span><svg class="arrow" aria-hidden="true"><use href="assets/icons.svg#arrow"/></svg>`;
  button.addEventListener('click', () => {
    selectedMap = map;
    if (map.microstates === false) { location.hash = `/${map.id}`; return; }
    $('setup-dialog').showModal();
    $(includeMicrostates ? 'with-microstates' : 'without-microstates').focus();
  });
  const section = map.id === 'world' ? 'world' : ['continents', 'us'].includes(map.category) ? map.category : 'other';
  const card = document.createElement('div');
  card.className = 'map-download-card';
  card.append(button);
  addDownloadControl(card, map);
  const options = $(`${section}-options`);
  options.insertBefore(card, options.querySelector('.geolearn-card'));
}
$('with-microstates').addEventListener('click', () => chooseMicrostates(true));
$('without-microstates').addEventListener('click', () => chooseMicrostates(false));
$('country-pill').addEventListener('click', reveal);
$('menu-button').addEventListener('click', () => $('menu-dialog').showModal());
$('menu-reveal').addEventListener('click', () => { $('menu-dialog').close(); reveal(); });
$('menu-reveal-all').addEventListener('click', () => { $('menu-dialog').close(); revealAll(); });
$('retry-button').addEventListener('click', startGame);
$('reload-button').addEventListener('click', startGame);
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', event => {
    if (dialog.id === 'complete-dialog' || event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
}
$('complete-close').addEventListener('click', closeCompletion);
$('complete-dialog').addEventListener('cancel', event => { event.preventDefault(); closeCompletion(); });
window.addEventListener('hashchange', navigate);
navigate();

initializeDownloads();
