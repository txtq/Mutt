// The files on a planet hang in front of it like panes of glass: they lean a
// little toward the pointer, nearer ones more than farther ones (--depth in
// galaxy.css). This follows the pointer with an eased chase, timed by the
// clock so it feels the same at any frame rate, and sleeps once it settles.
// Only for a mouse or trackpad, and off when motion is turned down.
//
// The lean (--mx/--my, -1…1) is written on each box that's on screen, not on
// the page around them: a value set on the page would make the browser work
// out every element inside it again on every frame, boxes far down the page
// included. (The two are registered in galaxy.css so they stop at the box.)

import { reducedMotion } from './util.js';

const FOLLOW_MS = 260; // how long the lean takes to catch most of the way up
const BOX = '.cell-fill, .dk-paper';   // file boxes, and the pages on a documents desk

export function drift(el) {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let tx = 0, ty = 0, x = 0, y = 0, raf = 0, last = 0;

  // The boxes on screen (or about to be).
  const shown = new Set();
  const lean = (box) => {
    box.style.setProperty('--mx', x.toFixed(4));
    box.style.setProperty('--my', y.toFixed(4));
  };
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { shown.add(e.target); lean(e.target); }
      else {
        shown.delete(e.target);
        if (!e.target.isConnected) seen.unobserve(e.target);
      }
    }
  }, { rootMargin: '160px' });
  // Boxes come and go as files are added, moved and taken off.
  const watch = () => { for (const box of el.querySelectorAll(BOX)) seen.observe(box); };
  const grown = new MutationObserver(watch);
  grown.observe(el, { childList: true, subtree: true });
  watch();

  const write = () => {
    for (const box of shown) {
      if (box.isConnected) lean(box);
      else shown.delete(box);
    }
  };
  const step = (now) => {
    const dt = Math.min(64, now - (last || now));
    last = now;
    const k = 1 - Math.exp(-dt / (FOLLOW_MS / 3));
    x += (tx - x) * k;
    y += (ty - y) * k;
    if (Math.abs(tx - x) < 0.0015 && Math.abs(ty - y) < 0.0015) {
      x = tx; y = ty; raf = 0; last = 0;
    } else {
      raf = requestAnimationFrame(step);
    }
    write();
  };
  const aim = (nx, ny) => {
    tx = nx; ty = ny;
    if (!raf) raf = requestAnimationFrame(step);
  };
  const move = (e) => {
    if (!fine.matches || e.pointerType === 'touch' || reducedMotion()) return;
    // Pressed (dragging a file, selecting text): hold still.
    if (e.buttons) return;
    aim((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  };
  const rest = () => aim(0, 0);
  const root = document.documentElement;

  addEventListener('pointermove', move, { passive: true });
  root.addEventListener('pointerleave', rest);
  addEventListener('blur', rest);
  return () => {
    cancelAnimationFrame(raf);
    seen.disconnect();
    grown.disconnect();
    shown.clear();
    removeEventListener('pointermove', move);
    root.removeEventListener('pointerleave', rest);
    removeEventListener('blur', rest);
  };
}
