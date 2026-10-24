// Shared-element page transitions (View Transitions API), plus FLIP helpers.
//
// Any element with data-vt="…" that is on screen before and after a change
// morphs into its counterpart: drawer card → drawer header, block → viewer,
// drawer row → grid.

import { EASE, inViewport, reducedMotion } from './util.js';

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
export async function transition(update, { type = 'page', before = visibleShared, after = visibleShared } = {}) {
  if (!canTransition()) {
    await update();
    return;
  }
  const root = document.documentElement;
  clearNames();
  applyNames(before());
  root.dataset.vt = type;
  let vt;
  try {
    vt = document.startViewTransition(async () => {
      clearNames();
      await update();
      const pairs = after();
      applyNames(pairs);
      await settleImages(pairs);
    });
    vt.ready.catch(() => {});
    await vt.updateCallbackDone.catch(() => {});
    await vt.finished.catch(() => {});
  } finally {
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

export function glide(rects, { duration = 560, easing = EASE } = {}) {
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
