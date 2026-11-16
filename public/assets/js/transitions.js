// Shared-element page transitions (View Transitions API), plus FLIP helpers.
//
// Any element with data-vt="…" that is on screen before and after a change
// morphs into its counterpart: drawer card → drawer header, block → viewer,
// drawer row → grid.

import { DUR, EASE, inViewport, reducedMotion } from './util.js';

const MAX_SHARED = 40;
let named = [];

export const canTransition = () => !!document.startViewTransition && !reducedMotion() && document.visibilityState === 'visible';

function clearNames() {
  for (const el of named) el.style.viewTransitionName = '';
  named = [];
}

function applyNames(pairs) {
  const used = new Set();
  for (const [el, name] of pairs) {
    if (named.length >= MAX_SHARED) break;
    if (!name || used.has(name)) continue;
    used.add(name);
    el.style.viewTransitionName = name;
    named.push(el);
  }
}

export function visibleShared(root = document.getElementById('view')) {
  if (!root) return [];
  return [...root.querySelectorAll('[data-vt]')]
    .filter((el) => inViewport(el))
    .map((el) => [el, el.dataset.vt]);
}

async function settleImages(pairs, timeout = 180) {
  const images = pairs.map(([el]) => el).flatMap((el) => el.tagName === 'IMG' ? [el] : [...el.querySelectorAll('img')]);
  if (!images.length) return;
  await Promise.race([
    Promise.all(images.map((img) => (img.complete ? null : img.decode().catch(() => null)))),
    new Promise((resolve) => setTimeout(resolve, timeout)),
  ]);
}

// `before` / `after` return [element, name] pairs to morph between.
// Something that should happen as the movement itself starts (a sound, DESIGN.md "Sound"): during
// a page change that is when the new page is ready and begins to move, which can be a while after
// it was asked for; otherwise it is now.
let starting = null;
export function whenMoving(fn) {
  if (starting) starting.push(fn);
  else fn();
}

export async function transition(update, { type = 'page', before = visibleShared, after = visibleShared, moving } = {}) {
  if (!canTransition()) {
    moving?.();
    await update();
    return;
  }
  const root = document.documentElement;
  clearNames();
  applyNames(before());
  root.dataset.vt = type;
  let vt;
  const waiting = (starting = moving ? [moving] : []);
  const go = () => { if (starting === waiting) starting = null; waiting.splice(0).forEach((fn) => fn()); };
  try {
    vt = document.startViewTransition(async () => {
      clearNames();
      await update();
      const pairs = after();
      applyNames(pairs);
      await settleImages(pairs);
    });
    vt.ready.then(go, go);
    await vt.updateCallbackDone.catch(() => {});
    await vt.finished.catch(() => {});
  } finally {
    go();
    clearNames();
    if (root.dataset.vt === type) delete root.dataset.vt;
  }
}

// FLIP: measure, mutate, then glide everything from where it was.
export function measure(elements) {
  const rects = new Map();
  for (const el of elements) rects.set(el, el.getBoundingClientRect());
  return rects;
}

export function glide(rects, { duration = DUR.arrive, easing = EASE } = {}) {
  if (reducedMotion()) return;
  for (const [el, first] of rects) {
    if (!el.isConnected) continue;
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
      { duration, easing, composite: 'add' },
    );
  }
}
