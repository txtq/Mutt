// The one way anything in Mutt makes a sound (DESIGN.md "Sound"):
//
//   import { sound } from './sound.js';
//   sound('land', { note: look });      // a name from SOUNDS in soundbank.js, never a sound of its own
//
// This file is small and always loaded; the sounds themselves (`soundbank.js`) are fetched the
// first time Sound is on and someone taps. A call is always safe: it does nothing while Sound is
// off, before the first tap (browsers allow sound only after one), in a tab that isn't showing,
// while a song or video plays in Mutt, or in the first second of a page.
//
// There is one sound clock for the whole app, shared with the music (`audio()`), so starting it
// is paid once. On Apple devices it is an "ambient" sound: it mixes with whatever else is playing
// (your own music or a podcast keeps going) and the silent switch silences it.

import { DUR } from './util.js';

let ctx = null;
let bank = null;
let made = null;   // soundbank.js, once fetched
let woke = 0;   // when a tap or key last woke the clock
let musicOn = false;
let rest = 0;
let windy = false;
const born = performance.now();
const root = document.documentElement;

export const soundOn = () => root.dataset.sound !== 'off';

// The shared sound clock, made on the first call (call it from inside a tap or key the first time).
export function audio() {
  if (ctx) return ctx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch {}
  ctx = new Ctx();
  return ctx;
}

// Whether something in Mutt is playing its own sound right now (a song, a video with sound).
function mediaPlaying() {
  for (const m of document.querySelectorAll('audio, video')) {
    if (!m.paused && !m.muted && m.volume > 0 && !m.ended) return true;
  }
  return false;
}

function quiet() {
  // A clock still waking from a tap a moment ago is fine (the sound plays as it wakes); one that
  // has been resting since long before is not (the sound would come out later, out of place).
  const awake = ctx?.state === 'running' || (ctx?.state === 'suspended' && performance.now() - woke < 400);
  return !soundOn() || !bank || document.hidden || !awake || performance.now() - born < 1000 || mediaPlaying();
}

export function sound(name, opts) {
  if (quiet()) return;
  bank.ask(name, opts);
  restLater();
}

// With no music playing, the clock rests after a quiet while (a running one keeps a phone's sound
// awake and costs battery); the next tap wakes it again.
function restLater() {
  clearTimeout(rest);
  rest = setTimeout(() => { if (!musicOn && !windy && ctx?.state === 'running') ctx.suspend(); }, 15000);
}

// The music says whether it is playing (music.js), so the clock never rests under it.
export function musicPlays(on) {
  musicOn = on;
  if (!on) restLater();
}

// The one sound that lasts (the universe's wind), at a level from 0 to 1.
export function holdSound(name, level) {
  if (!bank) return;
  const l = quiet() ? 0 : level;
  windy = l > 0.01;
  bank.hold(name, l);
  restLater();
}

// Let the sound clock rest when nothing needs it (the music asks before it stops it).
export function mayRest() {
  return !soundOn() || document.hidden;
}

function wake() {
  if (!soundOn()) return;
  const c = audio();
  if (!c) return;
  woke = performance.now();
  if (c.state !== 'running') c.resume().catch(() => {});
  restLater();
  if (!bank && made) bank = made.makeBank(c, made.makeOut(c).input, { dur: DUR });
  else if (!made) fetchBank();
}

let fetching = null;
function fetchBank() {
  fetching ||= import('./soundbank.js').then((m) => { made = m; if (ctx) wake(); }).catch(() => { fetching = null; });
}

// A plain press of anything pressable makes the `press` sound, and a touch of a file box, a planet,
// a star or a link the softer `touch`, unless what it did asked for a sound of its own (that one
// wins: one press, one sound). Asked a moment later, so the press's own sound has been asked first.
const PRESSABLE = 'button, [role="button"], [role="menuitem"], [role="tab"], [role="option"], a.btn, summary';
const TOUCHABLE = '.cell, .planet, .star, a[href]:not(.btn)';
const TYPED = 'textarea, [contenteditable="true"], input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="number"]';
let pressed = 0;   // when a pointer last went down
let tabbed = 0;    // when Tab was last pressed

export function startSound() {
  if (!(window.AudioContext || window.webkitAudioContext)) return;
  // Fetched once the page is up, so the first tap already has its sound.
  const early = () => { if (soundOn()) fetchBank(); };
  if (window.requestIdleCallback) requestIdleCallback(early, { timeout: 3000 }); else setTimeout(early, 1000);
  // Browsers let a page make sound only after a tap or a key: the sound clock starts (or wakes)
  // on each, cheaply, so it is running by the time anything a tap started asks for a sound.
  addEventListener('pointerdown', wake, { capture: true });
  addEventListener('keydown', wake, { capture: true });
  addEventListener('pointerdown', () => { pressed = performance.now(); }, { capture: true });
  addEventListener('keydown', (e) => { if (e.key === 'Tab') tabbed = performance.now(); }, { capture: true });
  addEventListener('click', (e) => {
    const el = e.target.closest?.(`${PRESSABLE}, ${TOUCHABLE}`);
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[data-quiet]')) return;
    const name = el.matches(TOUCHABLE) ? 'touch' : 'press';
    setTimeout(() => sound(name), 0);
  }, { capture: true });
  // Tab moving on ticks; a text box taken with a tap seats with a small click (never while typing).
  addEventListener('focusin', (e) => {
    const el = e.target;
    const now = performance.now();
    if (now - tabbed < 150) sound('focus');
    else if (now - pressed < 600 && el.matches?.(TYPED) && !el.classList.contains('pin-input')) sound('field');
  }, { capture: true });
  // A switch or tick box (plain boxes in the page: DESIGN.md "Switch", "Tick box").
  addEventListener('change', (e) => {
    const box = e.target;
    if (box?.type === 'checkbox' && box.closest?.('.switch, .tick')) sound(box.checked ? 'on' : 'off');
  }, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { bank?.hold('wind', 0); if (!musicOn && ctx.state === 'running') ctx.suspend(); }
  });
  // Switched off: let go of the wind at once.
  new MutationObserver(() => { if (soundOn()) fetchBank(); else bank?.hold('wind', 0); })
    .observe(root, { attributes: true, attributeFilter: ['data-sound'] });
}

// What played lately, newest last (for the checks in tests/browser.py).
export const soundsHeard = () => [...(bank?.heard || [])];
