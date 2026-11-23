// A PROOF, from the first build chat of the Mutt browser (2026-11-23). Fetched only inside the app,
// and only when the app's hidden choice "Who draws the sky" is set to the app.
//
// The app draws the sky, a stand-in void and one stand-in planet itself, under this page. This file
// is the page's side: it stops the page painting those, and tells the app where they are. Its one
// purpose was to measure whether the two layers can be kept together; the app's second build chat
// replaces it with the real thing.

import { app, tell } from './app.js';

export function startAppSky() {
  const root = document.documentElement;
  root.classList.add('app-sky');
  const checking = app.check === 'sky';
  let told = '';
  let travelling = false;
  let last = null;     // where the planet last was: [centre x, centre y, radius]

  const place = (el) => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width / 2]; };
  const shown = (el) => el && el.getClientRects().length > 0;

  // The one planet the app draws: the check names it; otherwise the first.
  function planet() {
    const id = window.__appSkyPlanet;
    const body = id ? document.querySelector(`[data-vt="planet-${id}"]`) : document.querySelector('a.planet .planet-body');
    if (body && !body.classList.contains('app-draws')) {
      body.classList.add('app-draws');
      if (checking) body.querySelector('.planet-ball')?.append(Object.assign(document.createElement('i'), { className: 'app-mark' }));
    }
    return body;
  }

  // A page change carries the planet across on the browser's own clock. The page can't see where
  // it is on the way, so it tells the app where it starts, where it ends, how long and on which
  // curve, and when it began; the app travels its planet by the same rule.
  async function journey(body) {
    travelling = true;
    const to = place(body);
    const from = last || to;
    const group = document.getAnimations().find((a) => a.effect?.pseudoElement?.startsWith('::view-transition-group(planet-'));
    let ms = 0; let curve = null; let into = 0;
    if (group) {
      await group.ready.catch(() => {});
      const timing = group.effect.getComputedTiming();
      ms = Number(timing.duration) || 0;
      into = Number(group.currentTime) || 0;
      curve = (String(group.effect.getTiming().easing).match(/-?[\d.]+/g) || []).slice(0, 4).map(Number);
    }
    if (ms) tell('sky.journey', { from, to, ms, curve: curve?.length === 4 ? curve : null, began: performance.timeOrigin + performance.now() - into, found: !!group });
    else tell('sky.frame', { hole: null, planet: [...to, 1] });
    last = to;
  }

  function frame() {
    requestAnimationFrame(frame);
    const body = planet();
    if (root.dataset.vt) {
      if (!travelling && body && document.getAnimations().some((a) => a.effect?.pseudoElement?.startsWith('::view-transition-'))) journey(body);
      return;
    }
    if (travelling) { travelling = false; tell('sky.journey', null); told = ''; }
    const hole = document.querySelector('.void');
    const at = shown(hole) ? place(hole) : null;     // the void's strands reach half as far again as its own box
    const data = { hole: at ? [at[0], at[1], at[2] * 1.5, 1] : null, planet: shown(body) ? [...place(body), 1] : null };
    if (data.planet) last = data.planet.slice(0, 3);
    const s = JSON.stringify(data);
    if (s !== told) { told = s; tell('sky.frame', data); }
  }
  requestAnimationFrame(frame);
}
