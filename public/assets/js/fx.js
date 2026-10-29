// Motion for things moving through space: spiralling into a black hole,
// arcing across the sky, little bursts of light where they land.

import { h, reducedMotion } from './util.js';

const layer = () => document.querySelector('.fx-layer') || document.body.appendChild(h('div', { class: 'fx-layer', 'aria-hidden': 'true' }));

const center = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

// Put an element in the effects layer, centred on a point.
export function float(el, at) {
  el.classList.add('fx-float');
  el.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -50%)`;
  layer().append(el);
  return el;
}

export function chipFrom(rect, content, className = '') {
  const chip = h('div', { class: `fx-chip ${className}` }, content);
  return float(chip, center(rect));
}

// Down the drain: an orbit that tightens and speeds up, flattened toward
// the plane of the accretion disk, stretching a little at the end.
export async function spiralInto(el, from, to, { duration = 1050, turns = 1.15 } = {}) {
  if (reducedMotion()) { el.remove(); return; }
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  const r0 = Math.hypot(dx, dy) || 1;
  const a0 = Math.atan2(dy, dx);
  const frames = [];
  const steps = 36;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const e = t ** 1.7;
    const r = r0 * (1 - e);
    const a = a0 + turns * Math.PI * 2 * e;
    const flat = 1 - 0.55 * e;
    const x = to.x + Math.cos(a) * r;
    const y = to.y + Math.sin(a) * r * flat;
    const scale = Math.max(0.04, 1 - 0.96 * e);
    const stretch = 1 + 0.9 * e * e;
    frames.push({
      transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${(a * 180) / Math.PI + 90}deg) scale(${scale / Math.sqrt(stretch)}, ${scale * stretch})`,
      opacity: t < 0.82 ? 1 : Math.max(0, (1 - t) / 0.18),
      filter: `brightness(${1 + e * 1.4}) blur(${e * e * 1.5}px)`,
    });
  }
  await el.animate(frames, { duration, easing: 'linear', fill: 'forwards' }).finished.catch(() => {});
  el.remove();
}

// A curved flight from one point to another (a comet, a star finding home).
export async function arcTo(el, from, to, { duration = 900, lift = 0.35, startScale = 0.2, endScale = 1, spin = 0, keep = false } = {}) {
  if (reducedMotion()) {
    if (!keep) el.remove();
    else el.style.transform = `translate(${to.x}px, ${to.y}px) translate(-50%, -50%) scale(${endScale})`;
    return;
  }
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - dist * lift };
  const frames = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const e = 1 - (1 - t) ** 3;
    const x = (1 - e) ** 2 * from.x + 2 * (1 - e) * e * mid.x + e * e * to.x;
    const y = (1 - e) ** 2 * from.y + 2 * (1 - e) * e * mid.y + e * e * to.y;
    const pop = t < 0.18 ? startScale + (1.35 - startScale) * (t / 0.18) : 1.35 + (endScale - 1.35) * ((t - 0.18) / 0.82);
    frames.push({ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${spin * e}deg) scale(${pop})` });
  }
  await el.animate(frames, { duration, easing: 'linear', fill: 'forwards' }).finished.catch(() => {});
  if (!keep) el.remove();
}

// Specks of light thrown out from a point.
export function burst(at, { color = '#ffffff', count = 10, reach = 34 } = {}) {
  if (reducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const dot = float(h('span', { class: 'fx-spark', style: { background: color } }), at);
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
    const dist = reach * (0.6 + Math.random() * 0.7);
    dot.animate([
      { transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%) scale(1)`, opacity: 1 },
      { transform: `translate(${at.x + Math.cos(angle) * dist}px, ${at.y + Math.sin(angle) * dist}px) translate(-50%, -50%) scale(0.2)`, opacity: 0 },
    ], { duration: 600 + Math.random() * 400, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }).finished.then(() => dot.remove(), () => dot.remove());
  }
}

// A ring of light spreading out (something just fell in, or was born).
export function shockwave(at, { size = 120, color = 'rgba(160, 200, 255, 0.7)', duration = 900 } = {}) {
  if (reducedMotion()) return;
  const ring = float(h('span', { class: 'fx-ring', style: { width: `${size}px`, height: `${size}px`, '--ring': color } }), at);
  ring.animate([
    { transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%) scale(0.35)`, opacity: 0.9 },
    { transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%) scale(2.4)`, opacity: 0 },
  ], { duration, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }).finished.then(() => ring.remove(), () => ring.remove());
}

export { center };
