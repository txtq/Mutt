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
if (appSky) tell('sky.fresh');

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

// ---------------------------------------------------------------- the void

// Stands in for voidart.js's void: the same doors, each one passed on to the app, which draws it.
// What the page itself needs to know (how wide the light is, for laying things round it) is still
// worked out here, with voidart.js's own sums.
let voids = 0;
export function remoteVoid({ openMin = 2.2, openCage = 1.32, haloReach = 0 } = {}) {
  const id = `v${++voids}`;
  const el = h('div', { class: 'void-art is-in', 'aria-hidden': 'true' });
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - (1 - t) ** 3;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  let R = 80;
  let wanted = false;
  const wide = { from: 0, to: 0, start: 0 };
  const open = { o: 0, from: 0, to: 0, start: -1e9, dur: 900 };
  const running = () => wanted && !document.hidden && root.dataset.motion !== 'off';
  const openR = (now) => lerp(wide.from, wide.to, easeOut(clamp((now - wide.start) / 450)));
  const openness = (now) => {
    const t = clamp((now - open.start) / open.dur);
    open.o = lerp(open.from, open.to, open.to > open.from ? easeOut(t) : easeInOut(t));
  };
  const say = (op, more = {}) => tell('sky.void', { id, op, ...more });
  // Where it is on the screen, at rest (never while the galaxy is zooming or a page is changing).
  // On a galaxy the galaxy's own layout says where it is (`appScene`, below); anywhere else it is measured.
  let byScene = false;
  let placed = '';
  const place = () => {
    if (byScene || !el.isConnected || root.dataset.vt || document.querySelector('.world.is-zooming')) return;
    const r = el.getBoundingClientRect();
    const at = `${r.x + r.width / 2},${r.y + r.height / 2}`;
    if (at === placed) return;
    placed = at;
    say('at', { x: r.x + r.width / 2, y: r.y + r.height / 2 });
  };
  const soon = () => { if (!byScene) requestAnimationFrame(place); };
  addEventListener('scroll', soon, { passive: true });
  el.appVoid = { id, byScene() { byScene = true; } };
  return {
    el,
    place,
    copyTo() {},
    resize(r, w, hgt) {
      R = r;
      el.style.width = `${Math.round(w)}px`;
      el.style.height = `${Math.round(hgt)}px`;
      say('size', { r, w: Math.round(w), h: Math.round(hgt), openMin, openCage, haloReach });
      soon();
    },
    setOpen(to, r) {
      const now = performance.now();
      if (r != null && r !== wide.to) {
        wide.from = open.o > 0.01 ? openR(now) : r;
        wide.to = r;
        wide.start = running() ? now : -1e9;
      }
      openness(now);
      say('open', { to, r: r ?? null });
      if (to === open.to && open.o === to) return;
      open.from = open.o;
      open.to = to;
      open.start = running() ? now : -1e9;
      open.dur = Math.max(1, to ? 800 : 500);
    },
    ready: () => true,
    radius() {
      const now = performance.now();
      openness(now);
      return lerp(R * 0.9, Math.max(openR(now), R * openMin), open.o);
    },
    hungry(on) { say('hungry', { on }); },
    gulp() { say('gulp'); },
    listen(on) { say('listen', { on }); },
    loudness(x) { say('loud', { x }); },
    play() { wanted = true; say('play', { on: true }); soon(); },
    pause() { wanted = false; say('play', { on: false }); },
    destroy() { wanted = false; removeEventListener('scroll', soon); say('gone'); },
  };
}

// ---------------------------------------------------------------- the planets

// A colour the stylesheet understands, as [r, g, b] from 0 to 1.
let probe = null;
function colourOf(text) {
  if (!text) return null;
  if (text[0] === '#') return channels(text);
  probe ||= document.body.appendChild(h('i', { style: { display: 'none' } }));
  probe.style.color = text;
  return channels(getComputedStyle(probe).color);
}

// Stands in for a planet's or a moon's painter (planets.js `makeGlobe`): the same doors, and nothing
// painted here. It draws the same numbers from the planet's id as makeGlobe does, in the same order,
// so the app shows the face, the turn and the weather the website would.
export function remoteGlobe(canvas, rand, rate, id) {
  const period = (40 + rand() * 35) * 1000;
  const offset = rand() * period;
  const seed = [rand() * 97, rand() * 97, rand() * 97];
  const say = (op, more = {}) => tell('sky.world', { id, op, ...more });
  say('made', { period, offset, seed, rate, origin: performance.timeOrigin });
  let css = 0;
  let tex = null;
  let texVersion = -1;
  let use = 0.5;
  let liftEnds = 0;
  let dressed = '';
  let stated = '';
  const globe = {
    canvas,
    remote: true,
    born: performance.now(),
    setSize(next) { if (next !== css) { css = next; say('size', { s: next }); } },
    setWorld(next) { if (next.use != null) use = next.use; say('world', next); },
    setTexture(next) {
      if (next === tex && next.version === texVersion) return;
      tex = next;
      texVersion = next.version;
      // a map with nothing on it (a moon, an empty planet before its files come) needs no picture sent
      say('files', { url: next.canvas && next.canvas.width > 8 ? next.canvas.toDataURL('image/png') : null });
    },
    // its rings' colour and, for a shared planet, the colour of the one it is shared with
    dress(light, twin) {
      const key = `${light}|${twin}`;
      if (key === dressed) return;
      dressed = key;
      say('dress', { light: colourOf(light), twin: colourOf(twin) });
    },
    draw() {},
    setVisible() {},
    nudge() { say('nudge'); },
    point(on) { say('point', { on }); },
    state(flags) { const key = JSON.stringify(flags); if (key !== stated) { stated = key; say('state', flags); } },
    flare() { say('flare'); },
    wakeUp(to = 1) {
      if (liftEnds > performance.now() || use >= to) return;
      liftEnds = performance.now() + (use < 0.385 ? 2500 : 1500);
      use = to;
      say('wake', { to });
    },
    lifting: () => liftEnds > performance.now(),
    // the app follows the hand itself once it is told the globe has been taken hold of
    grab() { say('grab'); },
    drag() {},
    release(t, cancelled = false) { say('release', { cancelled }); },
    step: () => false,
    // a moon's way round its planet (planets.js `makeOrbit`), and now and then where the page has it
    orbit(o, host) { say('orbit', { host, slot: o.slot, radius: o.radius, tilt: o.tilt, speed: o.speed, phase: o.phase, rate: o.rate, t: performance.now() }); },
    phase(o) { say('phase', { phase: o.phase, rate: o.rate, t: performance.now() }); },
  };
  canvas.globe = globe;
  return globe;
}

// Where everything on a galaxy rests, said once each time the galaxy lays itself out (views/galaxy.js
// `layout`). Places are the galaxy's own: points from its top left corner; `top` is where that corner
// is on the screen.
export function appScene(g) {
  if (!g) { tell('sky.scene', { gone: true }); return; }
  const { width, height, viewH, bar, cx, cy } = g.size;
  g.void.art.appVoid?.byScene();
  if (!g.appWatch) {
    // a search dims every planet that holds nothing found: said by each planet when the scene's own state changes
    g.appWatch = new MutationObserver(() => { for (const el of g.planetEls.values()) el.appState?.(); });
    g.appWatch.observe(g.scene, { attributes: true, attributeFilter: ['class'] });
  }
  tell('sky.scene', {
    width, height, viewH, bar, cx, cy,
    top: Math.max(bar - scrollY, bar + viewH - height),
    travel: g.travel,
    live: g.scene.classList.contains('is-live'),
    // laid out before it is on the page (it is about to arrive by a journey): the app keeps it out of sight until then
    waiting: !g.el.isConnected,
    void: g.void.art.appVoid?.id || null,
    planets: g.data.planets.map((p) => {
      g.planetEls.get(p.id)?.appState?.();
      const spot = g.spots.get(p.id);
      const el = g.planetEls.get(p.id);
      if (!spot || !el) return null;
      return { id: p.id, x: cx + spot.x, y: cy + spot.y, s: spot.size, moons: (el.moonEls?.() || []).map((m) => m.dataset.id) };
    }).filter(Boolean),
  });
}

// Planets keep their picture out in the universe (planets.js `holdPlanets`), and moons stop while something is carried.
export function appHeld(on) { tell('sky.held', { on }); }
if (appSky) {
  let carrying = false;
  const look = () => {
    const now = document.body.classList.contains('is-carrying');
    if (now !== carrying) { carrying = now; tell('sky.carrying', { on: now }); }
  };
  const start = () => new MutationObserver(look).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  if (document.body) start(); else addEventListener('DOMContentLoaded', start);
}

// The pull back to the universe (views/galaxy.js `track`): only where the page has been scrolled to is
// said; the app runs the same spring toward it on its own clock. And the two facts the pull back turns
// on: how small this galaxy ends up on the map, and the point everything shrinks about.
let zoomSaid = '';
export function appZoom(g, goal, jump) {
  const facts = g.uv ? `${g.uv.k},${g.uv.F.x},${g.uv.F.y}` : '';
  if (facts && facts !== g.appUv) { g.appUv = facts; tell('sky.universe', { k: g.uv.k, x: g.uv.F.x, y: g.uv.F.y }); }
  const key = `${goal}|${g.carriedTo != null}|${jump}`;
  if (key === zoomSaid) return;
  zoomSaid = key;
  tell('sky.zoom', { goal, carried: g.carriedTo != null, jump });
}

// The galaxy arriving (views/galaxy.js `entrance`), and a planet's journey to its page and back
// (router.js): the page says when it starts and where it ends, and only fades meanwhile.
export function appArrive() { tell('sky.arrive'); }
export function appJourney(facts) { tell('sky.journey', facts); }
// A thing's middle and width on the screen.
export function spotOf(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2, r.width];
}
