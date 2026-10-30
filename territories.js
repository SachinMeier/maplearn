// Dependencies retain their real geography when omitted from the quiz.
// Free-associated states and Antarctica stay neutral rather than implying sovereignty.
export const territoryOwners = {
  AI: 'GB', AS: 'US', AW: 'NL', AX: 'FI', BL: 'FR', BM: 'GB', BQ: 'NL',
  BV: 'NO', CC: 'AU', CW: 'NL', CX: 'AU', FK: 'GB', FO: 'DK', GF: 'FR',
  GI: 'GB', GL: 'DK', GP: 'FR', GS: 'GB', GU: 'US', HM: 'AU', IO: 'GB',
  KY: 'GB', MF: 'FR', MO: 'CN', MP: 'US', MQ: 'FR', MS: 'GB', NC: 'FR',
  NF: 'AU', PF: 'FR', PM: 'FR', PN: 'GB', PR: 'US', RE: 'FR', SH: 'GB',
  SJ: 'NO', SX: 'NL', TC: 'GB', TF: 'FR', TK: 'NZ', UM: 'US', VG: 'GB',
  VI: 'US', WF: 'FR', YT: 'FR',
};

export function retainTerritories(svg, countries, includeMicrostates) {
  if (includeMicrostates) return;
  const playable = new Set(countries.filter(c => !c.microstate).map(c => c.code));
  for (const country of countries.filter(c => c.microstate)) {
    const region = svg.querySelector(`[data-country="${country.code}"]`);
    if (!region) continue;
    const owner = territoryOwners[country.code];
    const parent = playable.has(owner) && svg.querySelector(`[data-country="${owner}"]`);
    region.dataset.territory = country.code;
    region.removeAttribute('data-country');
    region.removeAttribute('data-focus-box');
    region.removeAttribute('class');
    // Artificial targets must never obscure a retained country's coastline.
    region.querySelectorAll('.hit-area, .hit-outline').forEach(node => node.remove());
    if (parent) parent.append(region);
    else {
      region.setAttribute('class', 'context-land');
      region.setAttribute('aria-hidden', 'true');
      region.setAttribute('pointer-events', 'none');
    }
  }
}
