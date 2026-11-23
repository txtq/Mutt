// Comets (DESIGN.md "Comets"): a note of yours with a day still ahead in it
// crosses your own sky. Its journey runs from the day the note was added to its
// day: it falls in from the edge of the galaxy toward the void along a comet's
// own path (a parabola with the void at its focus), closest to the void on
// the day (at the note's time), and waits there, burning, until it is dealt
// with. Ticked off or done, it catches fire, falls into the void and is gone
// (burn). As the day nears it grows and heats up: cool pale dust, then amber,
// then ember red. Its tails always point away from the void.
//
// It is print, like the void: every part of it is a soft shape punched through
// the void's own tile of evenly laid dots, so brighter and hotter is more dots,
// never a glow. Each comet is one small canvas, only as big as the comet,
// painted when the galaxy is laid out and never again until something changes;
// nothing moves at rest. Only the owner sees them (GET /api/comets).

import { api } from './api.js';
import { openContextMenu } from './ui.js';
import { cometName, cometRows, cometWhen, openComet } from './remind.js';
import { icon } from './icons.js';
import { DUR, EASE_LEAVE, bus, covered, debounce, h, reducedMotion, seeded, sharpness, touchScreen } from './util.js';
import { burst } from './fx.js';
import { evenPoints, DOT } from './voidmake.js';
import { planetTone } from './planets.js';

const TAU = Math.PI * 2;
const DAY = 86400000;
const TAGS = 5;          // tags shown by themselves at once on a computer (every comet is drawn; the user: "all comets should show up")
const PATH = 21;         // how far out along its parabola a journey starts (the path's shape, not days)
const URGENT = 72;       // hours: within these it heats up however long its journey
const SOON = 7;          // days: from this close it grows toward its full size, however new
const NAMED = 3;         // days: this close, its tag shows beside it without pointing at it
const LEAST = 0.3;       // however far off its day, it is never smaller than this (0 to 1): a comet a week or more away still shows as a shooting star, not a speck
const burnt = new Set();   // comets already burnt up into the void on this visit, so each burns once
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
// a colour from one of the inks below (never typed by hand), at an opacity
const inked = (c, a = 1) => `color(srgb ${(c[0] / 255).toFixed(3)} ${(c[1] / 255).toFixed(3)} ${(c[2] / 255).toFixed(3)} / ${Math.max(0, Math.min(1, a)).toFixed(3)})`;

// The inks, read from tokens.css once (DESIGN.md "Colour").
let INK = null;
function inks() {
  if (INK) return INK;
  const root = getComputedStyle(document.documentElement);
  const read = (name) => {
    const v = root.getPropertyValue(name).trim();
    const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(v);
    if (m) return [1, 2, 3].map((i) => parseInt(m[i], 16));
    const n = v.match(/[\d.]+/g);
    return n ? n.slice(0, 3).map(Number) : [255, 255, 255];
  };
  INK = { white: read('--star-white'), dust: read('--thread-on'), cool: read('--star-blue'), warm: read('--star-amber'), hot: read('--comet-ember') };
  return INK;
}

// ------------------------------------------------------------------ where it is

// A parabola with the void at its focus, squashed to the galaxy's oval. t < 0
// before the day (t = -PATH at the start of its journey), 0 on the day, > 0 after.
function orbit(t, { q, edge, phi, aspect, turn }) {
  const wEdge = Math.sqrt(Math.max(1.2, edge / q) - 1);
  const T = PATH / (wEdge + wEdge ** 3 / 3);
  const at = (tt) => {
    const goal = tt / T;
    let w = goal;
    for (let i = 0; i < 24; i++) w -= (w + w ** 3 / 3 - goal) / (1 + w * w);
    const r = q * (1 + w * w);
    const a = 2 * Math.atan(w) * turn + phi;
    return [Math.cos(a) * r * aspect, Math.sin(a) * r];
  };
  const [x, y] = at(t);
  const [nx, ny] = at(t + 0.05);
  return { x, y, mx: nx - x, my: ny - y };
}

// How far along its journey it is now, and how hot (one dealt with is not on a journey: it burns up).
function journey(c, now) {
  const due = c.at;
  // its time has come and it hasn't been dealt with: it waits at its closest, burning
  if (now >= due) return { due, t: 0, p: 1, heat: 1, after: 0, waiting: true };
  const from = Math.min(c.from || due - DAY, due - 60000);
  const p = clamp((now - from) / (due - from));
  const urgent = clamp(1 - (due - now) / (URGENT * 3600000));
  // how big it shows: how far along its journey, or how soon its day is, whichever is more
  // (a comet made today for tomorrow is close already, not a speck far out)
  const soon = clamp(1 - (due - now) / (SOON * DAY));
  return { due, t: -PATH * (1 - p), p, soon, heat: clamp(Math.max(p ** 2, urgent)), after: -1, waiting: false };
}

// ------------------------------------------------------------------ the print

let tiles = new Map();
function tile(dpr, density = 1) {
  const key = `${dpr}:${density}`;
  if (tiles.has(key)) return tiles.get(key);
  const PT = 48;
  const size = Math.round(PT * dpr);
  const k = size / PT;
  const grow = Math.max(1, 1.5 / dpr);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = inked(inks().white);
  const rand = seeded(`comet-dots:${density}`);
  for (const [px, py] of evenPoints(PT, (DOT.gap * grow) / density, rand)) {
    const r = (DOT.small + rand() ** 2 * (DOT.large - DOT.small)) * k * grow;
    for (const ox of [0, -size, size]) {
      for (const oy of [0, -size, size]) {
        x.beginPath(); x.arc(px * k + ox, py * k + oy, r, 0, TAU); x.fill();
      }
    }
  }
  tiles.set(key, c);
  return c;
}

// A soft shape punched through the dot tile and laid on with 'lighter', so where
// two layers meet the dots add up. The tile is pinned to the page, so the dots
// keep their places wherever the comet is (as the void's do).
function stippled(out, box, dpr, draw, shift, density = 1) {
  const c = document.createElement('canvas');
  c.width = out.canvas.width; c.height = out.canvas.height;
  const x = c.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, -box.x0 * dpr, -box.y0 * dpr);
  draw(x);
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'destination-in';
  const pat = x.createPattern(tile(dpr, density), 'repeat');
  pat.setTransform(new DOMMatrix().translate(((shift * 13.7) % 48) * dpr - box.x0 * dpr, ((shift * 29.3) % 48) * dpr - box.y0 * dpr));
  x.fillStyle = pat;
  x.fillRect(0, 0, c.width, c.height);
  out.globalCompositeOperation = 'lighter';
  out.drawImage(c, 0, 0);
  out.globalCompositeOperation = 'source-over';
}

// The straight tail: streaks of gas pointing straight away from the void.
function ionTail(x, cm, ink, strength) {
  const R = seeded(`ion:${cm.seed}`);
  for (let i = 0; i < 10; i++) {
    const spread = (R() - 0.5) * 0.16 * (1 - 0.4 * cm.near);
    const ca = Math.cos(spread), sa = Math.sin(spread);
    const ux = cm.ux * ca - cm.uy * sa, uy = cm.ux * sa + cm.uy * ca;
    const L = cm.len * (0.55 + R() * 0.6) * (i === 0 ? 1.15 : 1);
    const ex = cm.x + ux * L, ey = cm.y + uy * L;
    const kink = (R() - 0.5) * L * 0.08;
    const g = x.createLinearGradient(cm.x, cm.y, ex, ey);
    const a = strength * (0.5 + R() * 0.5) * (i === 0 ? 1.3 : 1);
    g.addColorStop(0, inked(ink, Math.min(1, a)));
    g.addColorStop(0.45, inked(ink, a * 0.7));
    g.addColorStop(1, inked(ink, 0));
    x.strokeStyle = g;
    x.lineWidth = (0.5 + R() * 1.1) * (0.6 + 0.6 * cm.near);
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(cm.x + ux * cm.coma * 0.3, cm.y + uy * cm.coma * 0.3);
    x.quadraticCurveTo(cm.x + ux * L * 0.55 - uy * kink, cm.y + uy * L * 0.55 + ux * kink, ex, ey);
    x.stroke();
  }
}

// The dust tail: a broad fan curving away behind the comet's path, brightest on
// its leading edge, with a few faint bands across it.
function dustTail(x, cm, ink, strength) {
  const R = seeded(`dust:${cm.seed}`);
  const strokes = 56;
  for (let i = 0; i < strokes; i++) {
    const k = i / (strokes - 1);
    const lean = 0.75 * (0.12 + k * 0.88);
    const L = cm.len * (0.95 - 0.38 * k) * (0.92 + R() * 0.16);
    const ex = cm.x + (cm.ux * (1 - lean * 0.25) + cm.sx * lean) * L;
    const ey = cm.y + (cm.uy * (1 - lean * 0.25) + cm.sy * lean) * L;
    const band = 0.7 + 0.3 * Math.sin(k * TAU * 3.2 + 0.6);
    const a = strength * band * (0.16 + 0.32 * (1 - k) ** 2);
    const g = x.createLinearGradient(cm.x, cm.y, ex, ey);
    g.addColorStop(0, inked(ink, Math.min(1, a * 1.5)));
    g.addColorStop(0.25, inked(ink, a));
    g.addColorStop(0.7, inked(ink, a * 0.35));
    g.addColorStop(1, inked(ink, 0));
    x.strokeStyle = g;
    x.lineWidth = (2 + k * 5) * (0.55 + 0.6 * cm.near);
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(cm.x, cm.y);
    x.quadraticCurveTo(cm.x + cm.ux * L * 0.45 + cm.sx * L * lean * 0.15, cm.y + cm.uy * L * 0.45 + cm.sy * L * lean * 0.15, ex, ey);
    x.stroke();
  }
}

// The head: a hood of light that opens into the tail.
function coma(x, cm, r, core, ink, strength) {
  x.save();
  x.translate(cm.x + cm.ux * r * 0.35, cm.y + cm.uy * r * 0.35);
  x.rotate(Math.atan2(cm.uy, cm.ux));
  x.scale(1.25, 1);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, r * 2.4);
  g.addColorStop(0, inked(core, strength));
  g.addColorStop(0.14, inked(mix(core, ink, 0.4), strength * 0.85));
  g.addColorStop(0.4, inked(ink, strength * 0.6));
  g.addColorStop(0.7, inked(ink, strength * 0.22));
  g.addColorStop(1, inked(ink, 0));
  x.fillStyle = g;
  x.beginPath(); x.arc(0, 0, r * 2.4, 0, TAU); x.fill();
  x.restore();
}

// Cool far out; amber as the day nears; ember red at the end (heat 0 to 1).
function heated(c, heat) {
  const ink = inks();
  return heat < 0.55 ? mix(c, ink.warm, heat / 0.55) : mix(ink.warm, ink.hot, (heat - 0.55) / 0.45);
}

// The streak: what makes it a shooting star. A clean wedge of light from the head, wide as the head
// and drawn to a point, hot at the head and gone by two thirds of the tail, with a fine bright
// thread down its middle that runs further. Crisp, not print, so it reads at once.
function streak(x, cm, ink, core, strength) {
  const nx = -cm.uy, ny = cm.ux;
  const L = cm.len * 0.7, w = cm.coma * 0.75;
  const ex = cm.x + cm.ux * L, ey = cm.y + cm.uy * L;
  const g = x.createLinearGradient(cm.x, cm.y, ex, ey);
  g.addColorStop(0, inked(core, 0.9 * strength));
  g.addColorStop(0.18, inked(ink, 0.55 * strength));
  g.addColorStop(0.6, inked(ink, 0.14 * strength));
  g.addColorStop(1, inked(ink, 0));
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(cm.x + nx * w, cm.y + ny * w);
  x.quadraticCurveTo(cm.x + cm.ux * L * 0.3 + nx * w * 0.6, cm.y + cm.uy * L * 0.3 + ny * w * 0.6, ex, ey);
  x.quadraticCurveTo(cm.x + cm.ux * L * 0.3 - nx * w * 0.6, cm.y + cm.uy * L * 0.3 - ny * w * 0.6, cm.x - nx * w, cm.y - ny * w);
  x.arc(cm.x, cm.y, w, Math.atan2(-ny, -nx), Math.atan2(ny, nx), cm.ux * ny - cm.uy * nx > 0);
  x.fill();
  const L2 = cm.len * 0.95;
  const t = x.createLinearGradient(cm.x, cm.y, cm.x + cm.ux * L2, cm.y + cm.uy * L2);
  t.addColorStop(0, inked(core, strength));
  t.addColorStop(0.35, inked(core, 0.45 * strength));
  t.addColorStop(1, inked(core, 0));
  x.strokeStyle = t;
  x.lineWidth = 0.6 + 0.5 * cm.near;
  x.lineCap = 'round';
  x.beginPath(); x.moveTo(cm.x, cm.y); x.lineTo(cm.x + cm.ux * L2, cm.y + cm.uy * L2); x.stroke();
}

// The head's glint, the sky's own flare (sky.js flarePicture): a white-hot core, a soft halo and four
// arms, the long pair across its path, with red and blue pulled a little apart like an old lens.
function glint(x, cm, tint, strength) {
  const arm = glintReach(cm);
  const across = Math.atan2(cm.uy, cm.ux) + Math.PI / 2 + 0.18;
  x.save();
  x.globalCompositeOperation = 'lighter';
  for (const [dx, keep] of [[0.9, [1, 0.25, 0.25]], [0, [0.5, 1, 0.5]], [-0.9, [0.25, 0.25, 1]]]) {
    const col = (a) => inked(tint.map((v, i) => v * keep[i]), a * strength);
    x.save();
    x.translate(cm.x + dx * cm.uy, cm.y - dx * cm.ux);
    const halo = x.createRadialGradient(0, 0, 0, 0, 0, cm.coma * 2.2);
    halo.addColorStop(0, col(0.45)); halo.addColorStop(0.35, col(0.14)); halo.addColorStop(1, col(0));
    x.fillStyle = halo;
    x.beginPath(); x.arc(0, 0, cm.coma * 2.2, 0, TAU); x.fill();
    const size = 1.2 + cm.coma * 0.32;
    const core = x.createRadialGradient(0, 0, 0, 0, 0, size);
    core.addColorStop(0, col(1)); core.addColorStop(0.5, col(0.5)); core.addColorStop(1, col(0));
    x.fillStyle = core;
    x.beginPath(); x.arc(0, 0, size, 0, TAU); x.fill();
    x.rotate(across);
    for (const [reach, turn] of [[arm, 0], [arm * 0.55, Math.PI / 2]]) {
      x.save();
      x.rotate(turn);
      const a = x.createLinearGradient(-reach, 0, reach, 0);
      a.addColorStop(0, col(0)); a.addColorStop(0.38, col(0.22)); a.addColorStop(0.5, col(1)); a.addColorStop(0.62, col(0.22)); a.addColorStop(1, col(0));
      x.fillStyle = a;
      x.fillRect(-reach, -0.6, reach * 2, 1.2);
      x.restore();
    }
    x.restore();
  }
  x.restore();
}
const glintReach = (cm) => 8 + cm.coma * 3.2;

// The box a comet needs round its head, in points.
function reach(cm) {
  const pad = Math.max(cm.coma * 3, glintReach(cm)) + 10;
  const tx = cm.x + cm.ux * cm.len * 1.25, ty = cm.y + cm.uy * cm.len * 1.25;
  const fx = cm.x + (cm.ux + cm.sx * 0.9) * cm.len, fy = cm.y + (cm.uy + cm.sy * 0.9) * cm.len;
  return {
    x0: Math.floor(Math.min(cm.x, tx, fx) - pad), y0: Math.floor(Math.min(cm.y, ty, fy) - pad),
    x1: Math.ceil(Math.max(cm.x, tx, fx) + pad), y1: Math.ceil(Math.max(cm.y, ty, fy) + pad),
  };
}

// Paint one comet onto its own canvas (sized here to its box).
export function paintComet(canvas, cm) {
  const ink = inks();
  const box = reach(cm);
  const dpr = sharpness();
  canvas.width = Math.ceil((box.x1 - box.x0) * dpr);
  canvas.height = Math.ceil((box.y1 - box.y0) * dpr);
  const out = canvas.getContext('2d');
  out.clearRect(0, 0, canvas.width, canvas.height);
  const heat = cm.heat;
  const s = (0.4 + 0.6 * cm.near) * (1 + 0.25 * heat);
  // Cool pale dust far out; amber as the day nears; ember red at the end.
  const toward = (c) => heated(c, heat);
  const tint = mix(ink.dust, cm.col, 0.45);
  const dust = toward(mix(ink.dust, cm.col, 0.3));
  const ion = heat < 0.55 ? mix(mix(ink.cool, ink.white, 0.35), ink.warm, heat / 0.55 * 0.8) : mix(ink.warm, ink.hot, (heat - 0.55) / 0.45 * 0.7);
  const head = toward(tint);
  const core = mix(ink.white, ink.warm, heat * 0.35);
  stippled(out, box, dpr, (x) => dustTail(x, cm, dust, s), 1);
  stippled(out, box, dpr, (x) => ionTail(x, cm, ion, s * 1.05), 2);
  stippled(out, box, dpr, (x) => coma(x, cm, cm.coma, core, head, s), 3);
  // then what makes it a shooting star, crisp over the print: the streak and the glint at its head
  out.setTransform(dpr, 0, 0, dpr, -box.x0 * dpr, -box.y0 * dpr);
  out.globalCompositeOperation = 'lighter';
  streak(out, cm, mix(head, ion, 0.4), core, 0.55 + 0.45 * cm.near);
  out.globalCompositeOperation = 'source-over';
  glint(out, cm, mix(ink.white, head, 0.25 + 0.35 * heat), 0.75 + 0.25 * cm.near);
  out.setTransform(1, 0, 0, 1, 0, 0);
  return box;
}

// ------------------------------------------------------------------ the comets in a galaxy

export class Comets {
  // page: the galaxy page (views/galaxy.js); it calls place() whenever it lays itself out.
  constructor(page) {
    this.page = page;
    this.list = [];
    this.els = new Map();
    this.paintEl = h('div', { class: 'gx-comets', 'aria-hidden': 'true' });
    this.hitsEl = h('div', { class: 'gx-comet-hits', role: 'group', 'aria-label': 'Comets: your reminders' });
    this.refresh = debounce(() => this.load(), 600);
    const changed = () => this.refresh();
    this.off = ['block:changed', 'block:deleted', 'block:connected', 'block:disconnected', 'upload:done', 'comet:changed']
      .map((name) => bus.on(name, changed));
    // Done here (its card's tick box, its menu, its note): it burns up now, not after the next look
    this.off.push(bus.on('comet:done', (id) => {
      const c = this.list.find((x) => x.id === id);
      if (c && !c.done) { c.done = Date.now(); this.place(); }
    }));
    // Days pass while a page stays open: look again now and then (nothing runs between).
    this.clock = setInterval(() => this.place(), 30 * 60000);
  }

  async load() {
    try {
      const got = await api.get(`/api/comets?tz=${-new Date().getTimezoneOffset()}`);
      if (!this.page.el.isConnected && this.loaded) return;
      this.list = got.comets || [];
      this.loaded = true;
      this.place();
    } catch { /* no comets, then */ }
  }

  // Where each shows today, and its picture if that changed.
  place() {
    const page = this.page;
    if (!page.size || !page.inner) return;
    const now = Date.now();
    const { cx, cy, width, height, viewH } = page.size;
    const narrow = !!page.m?.narrow;
    const top = height - viewH;
    // one ticked off or done is drawn once more, where it was, to burn up into the void
    const had = new Set(this.els.keys());
    const live = this.list
      .map((c) => {
        if (!c.done) { burnt.delete(c.id); return { c, j: journey(c, now) }; }   // back again (Undo): it may burn again
        return { c, j: burnt.has(c.id) ? null : journey({ ...c, done: null }, now), burn: true };
      })
      .filter(({ j }) => j)
      .sort((a, b) => (b.j.waiting - a.j.waiting) || a.j.due - b.j.due);
    const aspect = clamp(page.inner.rx / Math.max(1, page.inner.ry), 0.8, 2.2);
    const q = Math.min(page.inner.ry * (narrow ? 1.0 : 1.04), (width / 2 - 28) / aspect, viewH / 2 - 28);
    const edge = Math.max(q * 1.8, Math.min(viewH / 2 - 16, (width / 2 - 16) / aspect));
    const pad = narrow ? 14 : 16;
    // each planet, and under it its name and count, which are wider than a small planet
    const rects = [...(page.spots?.values() || [])].flatMap((s) => {
      const half = Math.max(s.size / 2, 56);
      return [
        { x0: cx + s.x - s.size / 2 - pad, x1: cx + s.x + s.size / 2 + pad, y0: cy + s.y - s.size / 2 - pad, y1: cy + s.y + s.size / 2 },
        { x0: cx + s.x - half - pad, x1: cx + s.x + half + pad, y0: cy + s.y + s.size / 2, y1: cy + s.y + s.size / 2 + 56 },
      ];
    });
    const planets = new Map((page.data.planets || []).map((p) => [p.id, p]));
    const maxLen = narrow ? 90 : 190;
    const maxComa = narrow ? 7 : 11;
    const heads = [];     // every comet placed so far: its head and points along its tail
    const tagged = [];
    const keep = new Set();
    // the loose stars round the void (their places are from the void's centre)
    const starAt = [...(page.starsEl?.children || [])].filter((st) => st.at).map((st) => ({ x: cx + st.at.x, y: cy + st.at.y }));
    const { rx, ry } = page.inner;
    // How much open sky there is round a point, in pixels (less than nothing inside something):
    // away from planets and their names, the void, the loose stars, the other comets and the edges.
    const room = (x, y) => {
      let d = 200;
      for (const r of rects) {
        const dx = Math.max(r.x0 - x, 0, x - r.x1), dy = Math.max(r.y0 - y, 0, y - r.y1);
        d = Math.min(d, dx || dy ? Math.hypot(dx, dy) : -Math.min(x - r.x0, r.x1 - x, y - r.y0, r.y1 - y));
      }
      d = Math.min(d, (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry));
      for (const st of starAt) d = Math.min(d, Math.hypot(st.x - x, st.y - y) - 16);
      for (const p of heads) d = Math.min(d, Math.hypot(p.x - x, p.y - y) - p.r);
      return Math.min(d, x - 16, width - 16 - x, y - (top + 24), height - 40 - y);
    };
    const burning = [];
    for (const { c, j, burn } of live) {
      keep.add(c.id);
      const R = seeded(`comet:${c.id}`);
      const turn = R() < 0.5 ? -1 : 1;
      const base = R() * TAU;
      const near = j.waiting ? 1 : Math.max(j.p, j.soon, LEAST);
      const len = 5 + (maxLen - 5) * near ** 1.5;
      // the way in that puts it, head and tail, in the most open sky (the user: "use blank space to
      // place comets instead of putting them in crowded areas"); its own seed only breaks a tie
      // and how far out its journey starts: the galaxy's edge, or a little inside it where the edge is crowded
      let best = null;
      for (const [si, scale] of [1, 0.88, 0.76].entries()) {
        for (let k = 0; k < 72; k++) {
          const phi = base + k * (TAU / 72);
          const o = orbit(j.t, { q, edge: edge * scale, phi, aspect, turn });
          const x = cx + o.x, y = cy + o.y;
          const ul = Math.hypot(o.x, o.y) || 1;
          // the streak must stay clear too, nearly as much as the head: a shooting star across a planet reads as a mistake
          const along = (k) => room(x + o.x / ul * len * k, y + o.y / ul * len * k);
          const score = Math.min(room(x, y), along(0.25) + 8, along(0.5) + 14, along(0.75) + 20, along(1) + 28) - Math.min(k, 72 - k) * 0.02 - si * 8;
          if (!best || score > best.score) best = { score, phi, scale };
        }
      }
      const o = orbit(j.t, { q, edge: edge * best.scale, phi: best.phi, aspect, turn });
      const x = cx + o.x, y = cy + o.y;
      const ul = Math.hypot(o.x, o.y) || 1;
      const ux = o.x / ul, uy = o.y / ul;
      heads.push({ x, y, r: 70, id: c.id }, { x: x + ux * len * 0.5, y: y + uy * len * 0.5, r: 40, id: c.id }, { x: x + ux * len, y: y + uy * len, r: 30, id: c.id });
      // the dust lags behind the way it's going
      let sx = -(o.mx - (o.mx * ux + o.my * uy) * ux), sy = -(o.my - (o.mx * ux + o.my * uy) * uy);
      const sl = Math.hypot(sx, sy) || 1; sx /= sl; sy /= sl;
      const planet = planets.get(c.planet);
      const cm = {
        x, y, ux, uy, sx, sy, near, heat: j.heat, seed: c.id,
        len, coma: 2 + (maxComa - 2) * near,
        col: planet ? hexRgb(planetTone(planet).tone) : inks().dust,
      };
      const shown = this.show(c, cm, j, now);
      if (burn) burning.push(c.id);
      else tagged.push(shown);
    }
    // tags: the ones always shown first, nearest day first, then those shown only when pointed at;
    // each keeps a little way off planets, names, stars and every comet (heads and tails)
    const clear = rects.map((r) => ({ x0: r.x0 - 8, x1: r.x1 + 8, y0: r.y0 - 8, y1: r.y1 + 8, real: r }));
    const sr = (page.m?.chip || 24) / 2 + 10;
    for (const st of starAt) clear.push({ x0: st.x - sr, x1: st.x + sr, y0: st.y - sr, y1: st.y + sr });
    // the notes under the clock (comments, comets reminding you) lie over the sky: a tag never goes under one
    const origin = this.hitsEl.getBoundingClientRect();
    for (const n of document.querySelectorAll('.cn-notes .cn-note')) {
      const r = n.getBoundingClientRect();
      if (!r.height) continue;
      const box = { x0: r.left - origin.left, x1: r.right - origin.left, y0: r.top - origin.top, y1: r.bottom - origin.top };
      clear.push({ x0: box.x0 - 8, x1: box.x1 + 8, y0: box.y0 - 8, y1: box.y1 + 8, real: box });
    }
    for (const p of heads) { const r = p.r * 0.25; clear.push({ x0: p.x - r, x1: p.x + r, y0: p.y - r, y1: p.y + r, id: p.id }); }
    // a phone has room for one tag of its own: the nearest day's
    const named = tagged.filter((t) => (t.j.after < 0 ? (t.j.due - now) / DAY < NAMED : t.j.after < 1)).slice(0, narrow ? 1 : TAGS);
    for (const t of tagged) t.always = named.includes(t);
    for (const t of [...named, ...tagged.filter((t) => !t.always)]) this.tag(t.el, t.cm, t.j, t.title, t.words, now, clear, t.always);
    for (const [id, el] of this.els) {
      if (keep.has(id)) continue;
      el.paint.remove(); el.hit.remove(); el.tag?.remove();
      this.els.delete(id);
    }
    // one that wasn't in the sky yet (ticked off on its list a moment ago) shows first, then burns
    for (const id of burning) this.burn(id, !had.has(id));
  }

  // Done or ticked off: it catches fire, falls into the void, and the void gulps it (DESIGN.md "Comets").
  // Behind a room (its note opened over the sky) it waits until the sky can be seen again.
  async burn(id, fresh) {
    const el = this.els.get(id);
    if (!el) return;
    burnt.add(id);
    this.els.delete(id);
    el.hit.remove();
    el.tag?.classList.remove('is-shown', 'is-lit');
    setTimeout(() => el.tag?.remove(), DUR.change);
    let wait = fresh;
    if (covered()) {
      wait = true;
      await new Promise((done) => {
        const mo = new MutationObserver(() => { if (!covered()) { mo.disconnect(); done(); } });
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      });
    }
    if (wait) await new Promise((done) => setTimeout(done, DUR.scene));
    if (!this.paintEl.isConnected || reducedMotion() || !this.page.size) { el.paint.remove(); return; }
    // catching fire: painted again at its full heat, sparks thrown off its head
    const cm = { ...el.cm, heat: 1 };
    this.fit(el, paintComet(el.paint, cm));
    const { x0, y0 } = el.box;
    const { cx, cy } = this.page.size;
    const at = this.paintEl.getBoundingClientRect();
    burst({ x: at.left + cm.x, y: at.top + cm.y }, { color: inked(inks().hot), count: 12, reach: 28 });
    // then down into the void, quickening and shrinking, brightest as it goes in; its tails still point away
    const step = (k, opacity, glow) => ({
      offset: k, opacity, filter: `brightness(${glow})`,
      transform: `translate(${x0 + (cx - cm.x) * k}px, ${y0 + (cy - cm.y) * k}px) scale(${1 - 0.9 * k})`,
    });
    Object.assign(el.paint.style, { transformOrigin: `${cm.x - x0}px ${cm.y - y0}px`, opacity: '' });
    await el.paint.animate([step(0, 1, 1), step(0.7, 1, 1.5), step(1, 0, 1.8)], { duration: DUR.scene, easing: EASE_LEAVE, fill: 'forwards' })
      .finished.catch(() => {});
    el.paint.remove();
    if (this.paintEl.isConnected) this.page.hole?.gulp?.();
  }

  // The canvas set where its picture says.
  fit(el, box) {
    el.box = box;
    const { x0, y0, x1, y1 } = box;
    Object.assign(el.paint.style, { width: `${x1 - x0}px`, height: `${y1 - y0}px`, transform: `translate(${x0}px, ${y0}px)` });
  }

  show(c, cm, j, now) {
    let el = this.els.get(c.id);
    if (!el) {
      const hit = h('button', { type: 'button', class: 'gx-comet-hit' });
      // With a finger there's no pointing: the first tap shows what it is, the next opens it.
      hit.addEventListener('click', () => {
        if (touchScreen() && !el.tag?.classList.contains('is-shown') && !el.tag?.classList.contains('is-lit')) {
          this.els.forEach((o) => o !== el && [o.paint, o.tag].forEach((x) => x?.classList.remove('is-lit')));
          [el.paint, el.tag].forEach((x) => x?.classList.add('is-lit'));
          return;
        }
        openComet(el.c, hit);
      });
      hit.addEventListener('contextmenu', (e) => this.menu(e, el.c, hit));
      const lit = (on) => [el.paint, el.tag].forEach((x) => x?.classList.toggle('is-lit', on));
      hit.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && lit(true));
      hit.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && lit(false));
      hit.addEventListener('focus', () => hit.matches(':focus-visible') && lit(true));
      hit.addEventListener('blur', () => lit(false));
      el = { paint: h('canvas', { class: 'gx-comet' }), hit, key: '' };
      this.els.set(c.id, el);
      this.paintEl.append(el.paint);
      this.hitsEl.append(hit);
    }
    el.c = c;
    const words = j.waiting ? `${cometWhen(c, now).split(' · ')[0]} · now` : cometWhen(c, now);
    const name = cometName(c);
    const title = name.length > 60 ? `${name.slice(0, 58)}…` : name;
    el.hit.setAttribute('aria-label', `${title}, ${words}`);
    // painted again only when it has visibly changed
    const key = [cm.x, cm.y, cm.len, cm.coma, cm.heat * 20, cm.ux * 50, cm.uy * 50].map((v) => Math.round(v)).join(',') + sharpness();
    if (key !== el.key) {
      el.key = key;
      this.fit(el, paintComet(el.paint, cm));
    }
    el.cm = cm;
    // what you point at or tap: the head and the first part of its tail
    const fat = touchScreen() ? 40 : 30;
    const long = Math.max(fat, cm.coma * 2 + cm.len * 0.5);
    const angle = Math.atan2(cm.uy, cm.ux);
    Object.assign(el.hit.style, {
      width: `${long + fat / 2}px`, height: `${fat}px`,
      transform: `translate(${cm.x}px, ${cm.y}px) rotate(${angle.toFixed(3)}rad) translate(${-fat / 2}px, ${-fat / 2}px)`,
    });
    return { el, cm, j, title, words };
  }

  // Its tag, a caption like a planet's: what it's for and when, snug beside its head (no line to it).
  // Shown by itself within a few days of its day; otherwise while it's pointed at or focused.
  // It goes where it covers least: not the void and its stars, a planet or its name, another tag,
  // its own head or its tail; first choice is the side of its head away from its dust.
  tag(el, cm, j, title, words, now, clear, always) {
    if (!el.tag) {
      el.tagText = h('span', { class: 'gx-comet-tag-text' });
      el.tagName = h('span', { class: 'gx-comet-tag-name' }, el.tagText);
      el.tagWords = h('span');
      el.tagWhen = h('span', { class: 'gx-comet-tag-when' }, icon('date', 12), el.tagWords);
      el.tag = h('span', { class: 'gx-comet-tag', 'aria-hidden': 'true' }, el.tagName, el.tagWhen);
      this.hitsEl.prepend(el.tag);
    }
    el.tagText.textContent = title.length > 32 ? `${title.slice(0, 30)}…` : title;
    el.tagWords.textContent = words.split(' · ')[0];
    const { width, height, viewH, cx, cy } = this.page.size;
    const top0 = height - viewH;
    const onScreen = cm.x > 4 && cm.x < width - 4 && cm.y > top0 + 4 && cm.y < height - 4;
    let shown = onScreen && always;
    el.tag.hidden = !onScreen;
    if (!onScreen) {
      el.tag.classList.remove('is-shown');
      return;
    }
    const tint = mix(heated(mix(inks().dust, cm.col, 0.3), cm.heat), inks().white, 0.2);
    el.tag.style.setProperty('--comet-ink', inked(tint));
    el.tag.classList.remove('is-right');
    const w = el.tag.offsetWidth, tall = el.tag.offsetHeight;
    const { rx, ry } = this.page.inner;
    const inVoid = (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
    // along its streak, closely: a crisp line through words is worse than print dust
    const tail = Array.from({ length: 18 }, (_, i) => 0.05 + i * 0.05).map((k) => [cm.x + cm.ux * cm.len * k, cm.y + cm.uy * cm.len * k]);
    const away = Math.atan2(-cm.sy, -cm.sx);
    const glow = cm.coma * 1.6 + 4;
    const own = { x0: cm.x - glow, x1: cm.x + glow, y0: cm.y - glow, y1: cm.y + glow };
    let best = null;
    // three rings round its head, near first: a tag goes a little farther rather than sit on something,
    // but never so far that it no longer reads as the comet's (there's no line to it)
    for (let k = 0; k < 24; k++) {
      const a = away + (k % 8 ? (k % 2 ? 1 : -1) * Math.ceil((k % 8) / 2) * (Math.PI / 4) : 0);
      const off = glow + [6, 18, 34][Math.floor(k / 8)];
      const ox = Math.cos(a), oy = Math.sin(a);
      const px = cm.x + ox * off, py = cm.y + oy * off;
      // above or below, it reaches out on the side away from its streak
      const want = { x: ox > 0.3 ? px : ox < -0.3 ? px - w : px - w * (cm.ux < -0.3 ? 0.12 : cm.ux > 0.3 ? 0.88 : 0.5), y: oy > 0.3 ? py : oy < -0.3 ? py - tall : py - tall / 2 };
      const left = clamp(want.x, 8, width - w - 8), top = clamp(want.y, top0 + 8, height - tall - 8);
      const box = { x0: left - 4, y0: top - 2, x1: left + w + 4, y1: top + tall + 2 };
      const hits = (b) => Math.max(0, Math.min(box.x1, b.x1) - Math.max(box.x0, b.x0)) * Math.max(0, Math.min(box.y1, b.y1) - Math.max(box.y0, b.y0));
      const cost = (k % 8) * 30 + Math.floor(k / 8) * 160;
      let score = cost + Math.hypot(left - want.x, top - want.y) * 20;
      for (const b of clear) if (b.id !== el.c.id) score += hits(b) * 6 + (b.real ? hits(b.real) * 12 : 0);   // its own head and tail are judged below; truly covering a planet or a name costs most
      score += hits(own) * 12;
      for (const [x, y] of tail) if (x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1) score += 1500;
      let onVoid = false;
      for (const [x, y] of [[box.x0, box.y0], [box.x1, box.y0], [box.x0, box.y1], [box.x1, box.y1], [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2]]) if (inVoid(x, y)) { score += 900; onVoid = true; }
      // whether it truly sits on the void or a planet, not only comes near one
      const over = onVoid || clear.some((b) => b.real && hits(b.real) > 120);
      if (!best || score < best.score) best = { score, left, top, ox, oy, box, over };
    }
    const { left, top, ox, box } = best;
    // on a phone the void's middle is the add button: a tag that only fits over it waits to be tapped
    if (best.over && this.page.m?.narrow) shown = false;
    el.tag.classList.toggle('is-shown', shown);
    if (shown) clear.push(box);
    const right = ox < -0.3;
    el.tag.classList.toggle('is-right', right);
    el.tag.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
  }

  menu(e, c, hit) {
    openContextMenu(e, cometRows(c), { title: `Comet: ${cometName(c).slice(0, 50)}`, target: hit });
  }

  destroy() {
    clearInterval(this.clock);
    for (const off of this.off) off?.();
  }
}

function hexRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : inks().dust;
}
