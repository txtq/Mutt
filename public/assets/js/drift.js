// Calm at rest (DESIGN.md, principle 8): the files on a planet only float.
// The one box being pointed at leans a little toward the pointer, like a pane
// of glass tipped by a fingertip, and settles back when the pointer leaves.
// No other box moves. The lean follows the pointer with an eased chase, timed
// by the clock so it feels the same at any frame rate, and sleeps once every
// box has settled. Only for a mouse or trackpad, and off when motion is
// turned down.
//
// The lean (--mx/--my, -1…1, measured across the box) is written on that box
// alone, never on the page around it. (The two are registered in galaxy.css
// so they stop at the box.)

import { reducedMotion } from './util.js';

const FOLLOW_MS = 260; // how long the lean takes to catch most of the way up
const BOX = '.cell-fill, .dk-paper';   // what leans: a file box's face, a page on a documents desk
const HOLDER = '.cell, .dk-grid [data-id]';   // pointing anywhere on these leans the box inside

export function drift(el) {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  // Every box that is leaning or still settling back: box -> where it is and where it's headed.
  const moving = new Map();
  let over = null;
  let raf = 0;
  let last = 0;

  const write = (box, s) => {
    box.style.setProperty('--mx', s.x.toFixed(4));
    box.style.setProperty('--my', s.y.toFixed(4));
  };
  const step = (now) => {
    const dt = Math.min(64, now - (last || now));
    last = now;
    const k = 1 - Math.exp(-dt / (FOLLOW_MS / 3));
    for (const [box, s] of moving) {
      if (!box.isConnected) { moving.delete(box); continue; }
      s.x += (s.tx - s.x) * k;
      s.y += (s.ty - s.y) * k;
      const settled = Math.abs(s.tx - s.x) < 0.0015 && Math.abs(s.ty - s.y) < 0.0015;
      if (settled) { s.x = s.tx; s.y = s.ty; }
      write(box, s);
      // back at rest: leave nothing behind on the box
      if (settled && !s.tx && !s.ty && box !== over) {
        box.style.removeProperty('--mx');
        box.style.removeProperty('--my');
        moving.delete(box);
      }
    }
    const busy = [...moving.values()].some((s) => s.x !== s.tx || s.y !== s.ty);
    if (busy) raf = requestAnimationFrame(step);
    else { raf = 0; last = 0; }
  };
  const aim = (box, tx, ty) => {
    let s = moving.get(box);
    if (!s) moving.set(box, s = { x: 0, y: 0, tx: 0, ty: 0 });
    s.tx = tx; s.ty = ty;
    if (!raf) raf = requestAnimationFrame(step);
  };
  const rest = () => {
    if (over) aim(over, 0, 0);
    over = null;
  };
  const boxAt = (target) => {
    if (!(target instanceof Element) || !el.contains(target)) return null;
    const direct = target.closest(BOX);
    if (direct) return direct;
    return target.closest(HOLDER)?.querySelector(BOX) || null;
  };
  const move = (e) => {
    if (!fine.matches || e.pointerType === 'touch' || reducedMotion()) { rest(); return; }
    // Pressed (dragging a file, selecting text): hold still.
    if (e.buttons) return;
    const box = boxAt(e.target);
    if (box !== over) rest();
    if (!box) return;
    over = box;
    const r = box.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    aim(box, clamp(((e.clientX - r.left) / r.width) * 2 - 1), clamp(((e.clientY - r.top) / r.height) * 2 - 1));
  };
  const root = document.documentElement;

  addEventListener('pointermove', move, { passive: true });
  root.addEventListener('pointerleave', rest);
  addEventListener('blur', rest);
  return () => {
    cancelAnimationFrame(raf);
    for (const box of moving.keys()) { box.style.removeProperty('--mx'); box.style.removeProperty('--my'); }
    moving.clear();
    over = null;
    removeEventListener('pointermove', move);
    root.removeEventListener('pointerleave', rest);
    removeEventListener('blur', rest);
  };
}
