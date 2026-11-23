// The page's half of the sky the Mutt browser draws. The Mutt browser is a Mac app that holds these
// same screens inside it; there, when its choice "Who draws the sky" is the app, the app draws the
// sky, the void, the planets and the dust between them itself, under this page, and moves them on
// its own clock. This page still works out what there is and where it rests, and says so here,
// once, when that changes. It never says where a moving thing is.
//
// Nothing in this file runs in an ordinary browser: every part below is only made when `appSky`
// (app.js) is true, which it never is outside the app.

import { app, appSky, tell } from './app.js';
import { h, onMotionChange } from './util.js';

export { appSky };

const root = document.documentElement;

// A colour as the browser reports it (a hex, rgb() or color()), as [r, g, b] from 0 to 1.
function channels(text) {
  const t = text.trim();
  if (t[0] === '#') {
    const n = parseInt(t.length < 6 ? t.slice(1).replace(/./g, '$&$&') : t.slice(1, 7), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const parts = (t.match(/-?[\d.]+(?:e-?\d+)?/g) || [1, 1, 1]).slice(0, 3).map(Number);
  return t.startsWith('color(') ? parts : parts.map((v) => v / 255);
}

// ---------------------------------------------------------------- the sky

// Stands in for sky.js's sky: the same four doors, and nothing painted here.
export function remoteSky() {
  const el = h('div', { class: 'sky', 'aria-hidden': 'true' });
  // The sky's colours as they will be once any change has settled (the app eases to them itself):
  // read from a plain element, where the stylesheet's own easing of them doesn't reach.
  const probe = h('i', { style: { display: 'none' } });
  el.append(probe);
  let first = true;
  const say = () => {
    const style = getComputedStyle(probe.isConnected ? probe : root);
    tell('sky.is', {
      motion: app.still ? 'off' : (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : root.dataset.motion || 'fluid'),
      colours: ['--sky-top', '--sky-deep', '--sky-mid', '--sky-low'].map((name) => channels(style.getPropertyValue(name))),
      atOnce: first,
    });
    first = false;
  };
  requestAnimationFrame(say);
  onMotionChange(say);
  new MutationObserver(say).observe(root, { attributes: true, attributeFilter: ['data-sky'] });
  let night = 0;
  let scrolled = -1;
  let waiting = false;
  addEventListener('scroll', () => {
    if (waiting) return;
    waiting = true;
    requestAnimationFrame(() => { waiting = false; if (scrollY !== scrolled) { scrolled = scrollY; tell('sky.scroll', { y: scrollY }); } });
  }, { passive: true });
  return {
    el,
    // The app knows where its own void is; the page only says whether the sky should bend round it.
    setLens(fn) { tell('sky.lens', { on: !!fn }); },
    setNight(v) { if (Math.abs(v - night) < 0.002 && v !== 0 && v !== 1) return; night = v; tell('sky.night', { v }); },
    pull(x, y, { strength = 1, radius = 360, duration = 1300 } = {}) { tell('sky.pull', { x, y, strength, radius, duration }); },
  };
}
