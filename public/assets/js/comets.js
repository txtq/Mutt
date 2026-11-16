// Comets (DESIGN.md "Comets"): a note of yours with a day still ahead in it
// crosses your own sky. Its journey runs from the day the note was added to its
// day: it falls in from the edge of the galaxy toward the void along a comet's
// own path (a parabola with the void at its focus), swings round the void on
// the day (closest at the note's time), and leaves on the far side over two
// days. As the day nears it grows and heats up: cool pale dust, then amber,
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
import { DUR, bus, debounce, h, seeded, sharpness, touchScreen } from './util.js';
import { evenPoints, DOT } from './voidmake.js';
import { planetTone } from './planets.js';

const TAU = Math.PI * 2;
const DAY = 86400000;
const MOST = 5;          // comets at once on a computer, the nearest days first
const MOST_PHONE = 3;
const AFTER = 2;         // days it takes to leave after its day
const PATH = 21;         // how far out along its parabola a journey starts (the path's shape, not days)
const URGENT = 72;       // hours: within these it heats up however long its journey
const NAMED = 3;         // days: this close, its tag shows beside it without pointing at it
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

// How far along its journey it is now, and how hot.
function journey(c, now) {
  const due = c.at;
  // dealt with: it swings round the void and leaves on the far side
  if (c.done) {
    const after = (now - c.done) / DAY;
    if (after > AFTER) return null;
    const k = clamp(after / AFTER);
    return { due, t: k * PATH * 0.35, p: 1, heat: 1 - k * 0.6, fade: 1 - k * k, after, waiting: false };
  }
  // its time has come and it hasn't been dealt with: it waits at its closest, burning
  if (now >= due) return { due, t: 0, p: 1, heat: 1, fade: 1, after: 0, waiting: true };
  const from = Math.min(c.from || due - DAY, due - 60000);
  const p = clamp((now - from) / (due - from));
  const urgent = clamp(1 - (due - now) / (URGENT * 3600000));
  return { due, t: -PATH * (1 - p), p, heat: clamp(Math.max(p ** 2, urgent)), fade: 1, after: -1, waiting: false };
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

// The box a comet needs round its head, in points.
function reach(cm) {
  const pad = cm.coma * 3 + 10;
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
  stippled(out, box, dpr, (x) => coma(x, cm, cm.coma * 0.45, ink.white, mix(core, ink.hot, heat * 0.6), s), 4, 1.25);
  // the bright point at its heart, solid, so it reads as a star
  out.setTransform(dpr, 0, 0, dpr, -box.x0 * dpr, -box.y0 * dpr);
  out.fillStyle = inked(ink.white, 0.9);
  out.beginPath(); out.arc(cm.x, cm.y, 0.55 + 0.5 * cm.near, 0, TAU); out.fill();
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
    const live = this.list
      .map((c) => ({ c, j: journey(c, now) }))
      .filter(({ j }) => j)
      .sort((a, b) => (b.j.waiting - a.j.waiting) || (a.j.after > 0) - (b.j.after > 0) || a.j.due - b.j.due)
      .slice(0, narrow ? MOST_PHONE : MOST);
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
    const heads = [];
    const tagged = [];
    const keep = new Set();
    for (const { c, j } of live) {
      keep.add(c.id);
      const R = seeded(`comet:${c.id}`);
      const turn = R() < 0.5 ? -1 : 1;
      const base = R() * TAU;
      // the way in that keeps clear of planets, today and over the rest of its fall
      let best = null;
      for (let k = 0; k < 48 && !(best && best.score < 0.1); k++) {
        const phi = base + (k ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 24) : 0);
        let score = k * 0.05;
        for (const tt of [j.t, j.t * 0.6, j.t * 0.3, 0]) {
          const o = orbit(tt, { q, edge, phi, aspect, turn });
          const x = cx + o.x, y = cy + o.y;
          const now2 = tt === j.t;
          for (const r of rects) if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) score += now2 ? 10 : 2;
          if (now2) {
            for (const hd of heads) if (Math.hypot(hd.x - x, hd.y - y) < 70) score += 4;
            if (x < 16 || x > width - 16 || y < top + 24 || y > height - 40) score += 20;
          }
        }
        if (!best || score < best.score) best = { score, phi };
      }
      const o = orbit(j.t, { q, edge, phi: best.phi, aspect, turn });
      const x = cx + o.x, y = cy + o.y;
      heads.push({ x, y });
      const ul = Math.hypot(o.x, o.y) || 1;
      const ux = o.x / ul, uy = o.y / ul;
      // the dust lags behind the way it's going
      let sx = -(o.mx - (o.mx * ux + o.my * uy) * ux), sy = -(o.my - (o.mx * ux + o.my * uy) * uy);
      const sl = Math.hypot(sx, sy) || 1; sx /= sl; sy /= sl;
      const near = j.after >= 0 ? 1 - j.after / AFTER * 0.5 : j.p;
      const planet = planets.get(c.planet);
      const cm = {
        x, y, ux, uy, sx, sy, near, heat: j.heat, seed: c.id,
        len: 5 + (maxLen - 5) * near ** 1.5, coma: 2 + (maxComa - 2) * near,
        col: planet ? hexRgb(planetTone(planet).tone) : inks().dust,
      };
      tagged.push(this.show(c, cm, j, now));
    }
    // tags: the ones always shown first, nearest day first, then those shown only when pointed at
    const clear = rects.map((r) => ({ ...r }));
    // and the loose stars round the void (their places are from the void's centre)
    for (const star of page.starsEl?.children || []) {
      if (!star.at) continue;
      const r = (page.m?.chip || 24) / 2 + 4;
      clear.push({ x0: cx + star.at.x - r, x1: cx + star.at.x + r, y0: cy + star.at.y - r, y1: cy + star.at.y + r });
    }
    // a phone has room for one tag of its own: the nearest day's
    const named = tagged.filter((t) => (t.j.after < 0 ? (t.j.due - now) / DAY < NAMED : t.j.after < 1)).slice(0, narrow ? 1 : MOST);
    for (const t of tagged) t.always = named.includes(t);
    for (const t of [...named, ...tagged.filter((t) => !t.always)]) this.tag(t.el, t.cm, t.j, t.title, t.words, now, clear, t.always);
    for (const [id, el] of this.els) {
      if (keep.has(id)) continue;
      el.paint.remove(); el.hit.remove(); el.tag?.remove(); el.lead?.remove();
      this.els.delete(id);
    }
  }

  show(c, cm, j, now) {
    let el = this.els.get(c.id);
    if (!el) {
      const hit = h('button', { type: 'button', class: 'gx-comet-hit' });
      // With a finger there's no pointing: the first tap shows what it is, the next opens it.
      hit.addEventListener('click', () => {
        if (touchScreen() && !el.tag?.classList.contains('is-shown') && !el.tag?.classList.contains('is-lit')) {
          this.els.forEach((o) => o !== el && [o.paint, o.tag, o.lead].forEach((x) => x?.classList.remove('is-lit')));
          [el.paint, el.tag, el.lead].forEach((x) => x?.classList.add('is-lit'));
          return;
        }
        openComet(el.c);
      });
      hit.addEventListener('contextmenu', (e) => this.menu(e, el.c, hit));
      const lit = (on) => [el.paint, el.tag, el.lead].forEach((x) => x?.classList.toggle('is-lit', on));
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
      el.box = paintComet(el.paint, cm);
      const { x0, y0, x1, y1 } = el.box;
      Object.assign(el.paint.style, { width: `${x1 - x0}px`, height: `${y1 - y0}px`, transform: `translate(${x0}px, ${y0}px)` });
    }
    el.paint.style.opacity = j.fade < 1 ? j.fade.toFixed(2) : '';
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

  // Its tag: what the note is for and when, joined to its head by a dotted line in the comet's own
  // colour. Shown by itself within a few days of its day; otherwise while it's pointed at or focused.
  // It goes where it covers least: not the void and its stars, a planet or its name, another tag
  // or its own tail; first choice is the side of its head away from its dust.
  tag(el, cm, j, title, words, now, clear, always) {
    if (!el.tag) {
      el.tagName = h('span', { class: 'gx-comet-tag-name' });
      el.tagWhen = h('span', { class: 'gx-comet-tag-when' });
      el.tag = h('span', { class: 'gx-comet-tag', 'aria-hidden': 'true' }, el.tagName, el.tagWhen);
      el.lead = h('i', { class: 'gx-comet-lead', 'aria-hidden': 'true' });
      this.hitsEl.prepend(el.lead, el.tag);
    }
    el.tagName.textContent = title.length > 32 ? `${title.slice(0, 30)}…` : title;
    el.tagWhen.textContent = words.split(' · ')[0];
    const { width, height, viewH, cx, cy } = this.page.size;
    const top0 = height - viewH;
    const onScreen = cm.x > 4 && cm.x < width - 4 && cm.y > top0 + 4 && cm.y < height - 4;
    let shown = onScreen && always;
    el.tag.hidden = el.lead.hidden = !onScreen;
    if (!onScreen) {
      el.tag.classList.remove('is-shown');
      el.lead.classList.remove('is-shown');
      return;
    }
    const tint = mix(heated(mix(inks().dust, cm.col, 0.3), cm.heat), inks().white, 0.2);
    el.tag.style.setProperty('--comet-ink', inked(tint));
    el.lead.style.setProperty('--comet-ink', inked(tint, 0.8));
    el.tag.classList.remove('is-right');
    const w = el.tag.offsetWidth, tall = el.tag.offsetHeight;
    const { rx, ry } = this.page.inner;
    const inVoid = (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
    const tail = [0.15, 0.3, 0.45, 0.6, 0.8].map((k) => [cm.x + cm.ux * cm.len * k, cm.y + cm.uy * cm.len * k]);
    const away = Math.atan2(-cm.sy, -cm.sx);
    let best = null;
    for (let k = 0; k < 16; k++) {
      const a = away + (k % 8 ? (k % 2 ? 1 : -1) * Math.ceil((k % 8) / 2) * (Math.PI / 4) : 0);
      const off = cm.coma * 2 + (k < 8 ? 22 : 44);
      const ox = Math.cos(a), oy = Math.sin(a);
      const px = cm.x + ox * off, py = cm.y + oy * off;
      const want = { x: ox > 0.3 ? px : ox < -0.3 ? px - w : px - w / 2, y: oy > 0.3 ? py : oy < -0.3 ? py - tall : py - tall / 2 };
      const left = clamp(want.x, 8, width - w - 8), top = clamp(want.y, top0 + 8, height - tall - 8);
      const box = { x0: left - 4, y0: top - 2, x1: left + w + 4, y1: top + tall + 2 };
      const hits = (b) => Math.max(0, Math.min(box.x1, b.x1) - Math.max(box.x0, b.x0)) * Math.max(0, Math.min(box.y1, b.y1) - Math.max(box.y0, b.y0));
      let score = (k % 8) * 40 + (k >= 8 ? 200 : 0) + Math.hypot(left - want.x, top - want.y) * 20;
      for (const b of clear) score += hits(b) * 4;
      for (const [x, y] of tail) if (x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1) score += 600;
      for (const [x, y] of [[box.x0, box.y0], [box.x1, box.y0], [box.x0, box.y1], [box.x1, box.y1], [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2]]) if (inVoid(x, y)) score += 900;
      if (!best || score < best.score) best = { score, left, top, ox, oy, box, over: score - (k % 8) * 40 - (k >= 8 ? 200 : 0) >= 900 };
    }
    const { left, top, ox, oy, box } = best;
    // on a phone the void's middle is the add button: a tag that only fits over it waits to be tapped
    if (best.over && this.page.m?.narrow) shown = false;
    el.tag.classList.toggle('is-shown', shown);
    el.lead.classList.toggle('is-shown', shown);
    el.tag.classList.toggle('is-over', best.over);
    if (shown) clear.push(box);
    const right = ox < -0.3;
    el.tag.classList.toggle('is-right', right);
    el.tag.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
    // the line: from just off its head to the nearest corner of the name's first line
    const side = Math.abs(ox) > 0.3;
    const ax = side ? (right ? left + w + 4 : left - 4) : left + w / 2;
    const ay = side ? top + tall * 0.3 : oy > 0 ? top - 3 : top + tall + 3;
    const start = cm.coma * 1.4 + 3;
    const sx = cm.x + Math.cos(Math.atan2(ay - cm.y, ax - cm.x)) * start, sy = cm.y + Math.sin(Math.atan2(ay - cm.y, ax - cm.x)) * start;
    const len = Math.hypot(ax - sx, ay - sy);
    Object.assign(el.lead.style, { width: `${len.toFixed(1)}px`, transform: `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) rotate(${Math.atan2(ay - sy, ax - sx).toFixed(3)}rad)` });
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
