// The page's half of the void as the Mutt browser opens it. The Mutt browser is a Mac app that holds
// these same screens inside it; there, when the app draws the sky, it also draws the void opened: the
// plus becomes the place you write, and what is found gathers round it (the app's Void/ folder).
// Everything that is decided stays here: what keeping does (the add box's own Add: a star, Autosort
// or a planet), where it can go, and what a search finds (search's own question, gravity.js's ring).
//
// Nothing in this file runs in an ordinary browser: `appDesk` is only called when `appSky` (app.js)
// is true, which it never is outside the app.

import { api } from './api.js';
import { app, hear, tell } from './app.js';
import { nav } from './nav.js';
import { openMenu } from './ui.js';
import { DUR, h } from './util.js';

let here = null;       // the galaxy on show, when it is your own
let asked = 0;         // the latest search, so a slow answer never undoes a newer one
let field = 0;         // how far the app's open light reaches (its clean middle), or 0 while it is closed
let wanted = null;     // asked for from another page: opened once your galaxy is back ('keep' or 'find')

// Found files sit just outside the open light's clean middle, in its thinning dots.
const RING = 1.28;

const toNow = (g) => {
  const at = g.hole.places();
  const planet = at.planetId ? at.planets.find((p) => p.id === at.planetId) : null;
  return { mode: at.mode, label: planet ? planet.title : at.mode === 'sort' ? 'Autosort' : 'Star', colour: planet?.icon?.c || null };
};

// What the galaxy gives its void (blackhole.js `desk`): told when it opens and closes.
export function appDesk(g) {
  here = g;
  // A press anywhere but in the light, on a found file or on something of Mutt's own over it, leaves.
  const outside = (e) => {
    if (e.target.closest?.('.gx-found, .toast, .scrim, .pop, .sheet, .dialog')) return;
    const c = g.hole.center();
    if (Math.hypot(e.clientX - c.x, e.clientY - c.y) <= field * 1.12) return;
    g.hole.close();
  };
  if (wanted) {
    const end = wanted;
    wanted = null;
    setTimeout(() => { if (here === g && g.el.isConnected) g.hole.open({ end }); }, DUR.scene);
  }
  return {
    opened(how) {
      document.addEventListener('pointerdown', outside, true);
      // while the launch plays, the app's planets are on the move and the page's own words for them step out of the way
      if (how.launch) {
        const gx = g.hole.el.closest('.gx');
        gx?.classList.add('is-launching');
        setTimeout(() => gx?.classList.remove('is-launching'), DUR.grand);
      }
      tell('void.open', { end: how.end || 'keep', text: how.text ?? null, launch: !!how.launch, to: toNow(g) });
    },
    closed(kept) {
      document.removeEventListener('pointerdown', outside, true);
      clear(g);
      tell('void.closed', { kept: !!kept });
    },
    // the one word under the plus ("Add", or "Looking…" while a link is read)
    label(text) { tell('void.label', { text }); },
  };
}
export function appDeskGone(g) {
  if (here !== g) return;
  here = null;
  tell('void.gone');
}
// How far out found files sit while the app's light is open (gravity.js asks the galaxy for the void's size), or 0.
export const appRing = () => field * RING;

function clear(g) {
  asked += 1;
  field = 0;
  g.found?.clear();
}

// Scrolling up at the top of your galaxy is the way into search: the app plays its launch and opens the void to find.
let pulled = 0;
let pulledAt = 0;
let launching = false;
export function appLaunch() {
  if (launching) return;
  launching = true;
  addEventListener('wheel', (e) => {
    const g = here;
    if (!g || !g.el?.isConnected || !g.el.contains(e.target) || g.hole.isOpen() || scrollY > 0 || g.p > 0.02 || e.ctrlKey) return;
    if (document.querySelector('.scrim:not(.is-leaving), .pop:not(.is-leaving), .room, .sheet.is-open')) return;   // something is open over the galaxy (ui.js `topLayer`)
    const now = performance.now();
    if (now - pulledAt > 400) pulled = 0;
    pulledAt = now;
    pulled = e.deltaY < 0 ? pulled - e.deltaY : 0;
    // each launch has the sound of the movement it is: a sweep that settles, a dive, a pull away
    if (pulled > 90) { pulled = 0; g.hole.open({ end: 'find', launch: true, sound: { through: 'dive', rise: 'surface' }[app.choices.launch] || 'search' }); }
  }, { passive: true });
}

// ---------------------------------------------------------------- what the app asks

// Keep what was written, as the add box would. `box` is where the words were on the screen.
hear('void.keep', ({ text, box }) => (here ? here.hole.keepText(text, new DOMRect(box[0], box[1], box[2], box[3])) : false));
// Escape, or a press outside.
hear('void.leave', () => { here?.hole.close(); });
// The places it can go, as Mutt's own menu, opened where the app's word for it is.
hear('void.to', ({ x, y }) => {
  const g = here;
  if (!g) return;
  const at = g.hole.places();
  const spot = h('i', { style: { position: 'fixed', left: `${x}px`, top: `${y}px`, width: '1px', height: '1px' } });
  document.body.append(spot);
  const pick = (mode, planet) => () => { g.hole.setPlace(mode, planet); tell('void.to', toNow(g)); };
  const pop = openMenu(spot, [
    { label: 'Star', on: at.mode === 'star', run: pick('star') },
    { label: 'Autosort', on: at.mode === 'sort', run: pick('sort') },
    at.planets.length ? '-' : null,
    ...at.planets.map((p) => ({ label: p.title, on: at.mode === 'planet' && at.planetId === p.id, run: pick('planet', p.id) })),
  ], { onClose: () => { spot.remove(); tell('void.menu', { on: false }); } });
  tell('void.menu', { on: true });
  return !!pop;
});
// What you have typed so far, to find: your own files that match lift off their planets and settle
// round the void, as search gathers them. `r` is how far out the app's light reaches. Answers with how
// many were found, and which of them sit on planets kept with someone else.
hear('void.find', async ({ q, r }) => {
  const g = here;
  if (!g) return null;
  const mine = ++asked;
  field = r || field;
  const words = String(q || '').trim();
  if (!words) { g.found?.clear(); return { files: 0, more: 0 }; }
  let data;
  try { data = await api.get(`/api/search?q=${encodeURIComponent(words)}&limit=24`); } catch (e) { return null; }
  if (mine !== asked || here !== g) return null;
  const grav = await g.gravity();
  if (!grav || mine !== asked) return null;
  const cap = g.m.narrow ? 8 : 12;
  const all = data.blocks || [];
  const shown = all.slice(0, cap);
  const rest = all.length - shown.length;
  grav.show(shown, {
    planets: [...(data.drawers || []).map((d) => d.id), ...all.slice(cap).flatMap((b) => b.on || [])],
    more: rest > 0 ? (data.more ? `More than ${rest}` : `+${rest} more`) : null,
    open: (b) => nav.openBlock(b.id),
    onMore: () => {},
  });
  const kept = new Set(g.data.planets.filter((p) => (p.keepers || []).length > 1).map((p) => p.id));
  return { files: shown.length, more: rest, shared: shown.filter((b) => (b.on || []).some((id) => kept.has(id))).length, planets: (data.drawers || []).length };
});
// The light's size changed (it grew a line, or narrowed to the one line after Find).
hear('void.field', ({ r }) => { field = r || 0; if (here?.found?.active) here.found.place(); });
hear('void.clear', () => { asked += 1; here?.found?.clear(); });
// The keys that jump to the void, from anywhere: to keep, or to find. From another page, home first.
hear('void.jump', ({ end }) => {
  if (here) { if (!here.hole.isOpen()) { if (here.p > 0.02) here.goHome?.(); here.hole.open({ end, sound: end === 'find' ? 'search' : 'swoop' }); } return true; }
  wanted = end;
  nav.go('/');
  return true;
});
// The keyboard goes from the app's line to the first found file (the down arrow), and comes back.
hear('void.first', () => {
  const first = here?.found?.el.querySelector('.gx-found-file');
  first?.focus();
  return !!first;
});
