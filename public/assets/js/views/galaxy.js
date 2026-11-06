// Your galaxy: the main page. A void sits in the middle, and everything new
// goes in through it. Loose files (stars) settle in a cluster round its edge;
// planets (your drawers) are scattered further out, each one showing the
// files on it. Keep scrolling down and the galaxy shrinks away into the
// universe, where everyone else's galaxies are.

import { blockMenu, openConnect, sortedToast } from '../actions.js';
import { api, session } from '../api.js';
import { blackHole, stillVoid } from '../blackhole.js';
import { draggable, movable } from '../drag.js';
import { arcTo, burst, center, chipFrom, float, spiralInto } from '../fx.js';
import { nav } from '../nav.js';
import { fileFace, glyph, holdPlanets, planetEl, planetSize, worldPicture } from '../planets.js';
import { together } from '../planetgl.js';
import { theSky } from '../sky.js';
import { updatePrefs } from '../theme.js';
import { openDialog, pinField, toast } from '../ui.js';
import { addFiles, withinLimit } from '../uploads.js';
import { bus, debounce, h, isEditable, plural, reducedMotion, seeded, touchScreen, wait } from '../util.js';
import { paintWeb } from '../uvweb.js';
import { REACH, voidRadius } from '../voidart.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const STAR_CAP = 240;
// Set by /universe, so the page opens already scrolled out.
let startOut = false;
// Set when the camera dived in from the universe, so the page doesn't play
// its entrance on top.
let arriving = false;
// Your galaxy and the universe, already fetched, for when someone else's
// page hands the universe over to yours (see toMine()).
let handoff = null;

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => t * t * (3 - 2 * t);

function excerpt(text, n = 90) {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

const starTitle = (b) => b.title || (b.kind === 'text' ? excerpt(b.content || '', 40) : b.fileName) || 'Untitled';

// `z` shrinks the void, planets and stars together so a full galaxy fits
// the screen (see fitted()).
function metrics(width, viewH, z = 1) {
  const narrow = width < 640;
  const mid = width < 1000;
  const hole = Math.round(voidRadius(width, viewH) * z); // radius of the dark itself
  return {
    narrow,
    z,
    viewH,
    scale: (narrow ? 0.72 : mid ? 0.86 : 1) * z,
    hole,
    // The glow round it: a tall oval.
    rx: hole * REACH.x,
    ry: hole * REACH.y,
    chip: Math.round((narrow ? 30 : 38) * Math.max(z, 0.75)),
    cell: Math.round((narrow ? 37 : 47) * Math.max(z, 0.75)),
    // Room round each planet, and across for its name, which stays one size.
    gap: Math.round((narrow ? 10 : 22) * z),
    wide: Math.round((narrow ? 104 : 140) * Math.max(z, 0.8)),
  };
}

// A galaxy fits the screen: when its planets would run past the bottom,
// everything is drawn smaller until they don't. `place(m)` lays it out and
// says how tall it came out. Past the smallest size, the page scrolls.
const Z_MIN = 0.42;

// Out in the universe each void draws this much smaller beside its planets.
const VOID_UV = 0.5;
function fitted(width, viewH, place) {
  let m = metrics(width, viewH);
  let out = place(m);
  // A phone's rows reflow as things shrink, so it steps down gently and
  // stops at the largest size that fits.
  for (let i = 0; i < 30 && out.content > viewH && m.z > Z_MIN; i++) {
    m = metrics(width, viewH, Math.max(Z_MIN, m.z * (m.narrow ? 0.97 : Math.min(0.96, (viewH / out.content) ** 1.2))));
    out = place(m);
  }
  return { m, ...out };
}

// ---------------------------------------------------------------- layout

// Stars: a sunflower spiral in the dust round the void, newest closest in,
// starting just outside the cage of strands round the light.
const TALL = REACH.y / REACH.x;
function starSpots(n, m, width) {
  const r0 = m.hole * 2.75 + m.chip / 2;
  const outer = n ? Math.sqrt(r0 * r0 + (n * m.cell * m.cell) / (Math.PI * TALL)) + m.chip / 2 : 0;
  // On a narrow screen the spiral is squeezed to fit the width and grows
  // taller instead, so no star hangs off the side.
  const room = width / 2 - 10;
  const squeeze = outer > room ? room / outer : 1;
  const spots = [];
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(r0 * r0 + (i * m.cell * m.cell) / (Math.PI * TALL));
    const a = i * GOLDEN - Math.PI / 2;
    spots.push({ x: Math.cos(a) * r * squeeze, y: (Math.sin(a) * r * TALL) / squeeze });
  }
  return { spots, outer: { x: outer * squeeze, y: (outer * TALL) / squeeze } };
}

// Does a rectangle reach into the oval (rx × ry) round the middle?
function ovalHitsRect(rx, ry, rect) {
  const x = clamp(0, rect.x0, rect.x1);
  const y = clamp(0, rect.y0, rect.y1);
  return (x / rx) ** 2 + (y / ry) ** 2 < 1;
}

const overlaps = (a, b, pad) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;

const placed = (p) => p.x != null && p.y != null;
const footprint = (s, m) => Math.max(s, m.wide);
// The room a planet and its name take up, round (x, y).
const box = (x, y, s, w) => ({ x0: x - w / 2, x1: x + w / 2, y0: y - s / 2 - 8, y1: y + s / 2 + 50 });

// The nearest spot to `at` where a planet clears the void, the stars round
// it, the screen's sides and every rect in `taken`.
function nearestFree(at, s, m, taken, inner, room) {
  const w = footprint(s, m);
  const pad = m.gap;
  const x0 = clamp(at.x, -room, room);
  for (let tries = 0, a = Math.atan2(at.y, at.x), d = 0; tries < 1500; tries++, a += 0.45, d += 1.6) {
    const x = clamp(x0 + Math.cos(a) * d, -room, room);
    const y = at.y + Math.sin(a) * d;
    const rect = box(x, y, s, w);
    if (!ovalHitsRect(inner.rx, inner.ry, rect) && !taken.some((o) => overlaps(o, rect, pad))) return { x, y, rect };
  }
  return { x: x0, y: at.y, rect: box(x0, at.y, s, w) };
}

// Planets: the ones you've put somewhere stay there. On a narrow screen the
// arrangement is drawn in from the sides and stretched taller, and any that
// end up on top of each other (or of the stars, which grow) settle into the
// nearest free spot. The rest are scattered outward in the order they were
// made, each one nudged along a loose spiral until it sits clear of the void,
// the stars and every planet (and name) before it.
function scatter(planets, width, inner, m) {
  const tall = inner.ry / inner.rx;
  const half = width / 2 - (m.narrow ? 8 : 28);
  const ax = m.narrow ? 1 : 1.32;
  const ay = m.narrow ? 1 : 0.78;
  const pad = m.gap;
  const sizes = planets.map((p) => planetSize(p.count, m.scale));
  let fx = 1;
  planets.forEach((p, i) => {
    if (!placed(p) || !p.x) return;
    const room = Math.max(0, half - footprint(sizes[i], m) / 2);
    fx = Math.min(fx, room / Math.abs(p.x * m.scale));
  });
  const stretch = 1 / Math.sqrt(Math.max(fx, 0.1));
  if (m.narrow) return { ...rows(planets, sizes, width, inner, m), fx, stretch };
  const rects = [];
  const spots = planets.map((p, i) => {
    if (!placed(p)) return null;
    const s = sizes[i];
    const room = Math.max(0, half - footprint(s, m) / 2);
    const spot = nearestFree({ x: p.x * m.scale * fx, y: p.y * m.scale * stretch }, s, m, rects, inner, room);
    rects.push(spot.rect);
    return { ...spot, size: s };
  });
  planets.forEach((p, i) => {
    if (spots[i]) return;
    const s = sizes[i];
    const w = footprint(s, m);
    const rand = seeded(`spot:${p.id}`);
    let a = i * GOLDEN * 1.7 - Math.PI * 0.62 + (rand() - 0.5) * 0.7;
    let d = inner.rx + s / 2 + 8 + rand() * 40;
    let x = 0;
    let y = 0;
    let rect = null;
    for (let tries = 0; tries < 900; tries++) {
      x = Math.cos(a) * d * ax;
      y = Math.sin(a) * d * ay * tall;
      if (Math.abs(x) + w / 2 > half) x = Math.sign(x) * Math.max(0, half - w / 2);
      rect = box(x, y, s, w);
      if (!ovalHitsRect(inner.rx, inner.ry, rect) && !rects.some((o) => overlaps(o, rect, pad))) break;
      a += 0.17;
      d += 3;
    }
    rects.push(rect);
    spots[i] = { x, y, size: s, rect };
  });
  return { spots, rects, fx, stretch };
}

// Room kept above and below a galaxy: on a phone the bottom keeps clear of
// the "Universe" button.
function pads(m) {
  if (m.narrow) return { top: Math.round(20 * Math.max(m.z, 0.6)), bottom: 64 };
  const pad = Math.round(56 * Math.max(m.z, 0.6));
  return { top: pad, bottom: pad };
}

// On a phone there's no room beside the void, so planets sit in loose rows
// above and below it. Where you've put a planet decides its side and its
// place in the order (top to bottom, then left to right); the rest fill
// whichever side is shorter. Rows spread out to use the screen's height.
function rows(planets, sizes, width, inner, m) {
  const W = width - 16;
  // A full planet's rings reach well past its sides.
  const wide = (i) => Math.max(footprint(sizes[i], m), sizes[i] * ((planets[i].count || 0) >= 10 ? 1.6 : 1));
  const tall = (s) => s + 58; // a planet with its name under it
  const sides = { top: [], bottom: [] };
  const order = planets.map((p, i) => i);
  order.filter((i) => placed(planets[i]))
    .sort((a, b) => planets[a].y - planets[b].y || planets[a].x - planets[b].x)
    .forEach((i) => sides[planets[i].y < 0 ? 'top' : 'bottom'].push(i));
  const load = (list) => list.reduce((t, i) => t + wide(i) * tall(sizes[i]), 0);
  for (const i of order) {
    if (placed(planets[i])) continue;
    if (load(sides.top) <= load(sides.bottom)) sides.top.unshift(i);
    else sides.bottom.push(i);
  }
  // Pack each side into rows that fit the width.
  const pack = (list) => {
    const out = [];
    for (const i of list) {
      const row = out[out.length - 1];
      const used = row ? row.reduce((t, j) => t + wide(j) + m.gap, 0) : Infinity;
      if (used + wide(i) <= W) row.push(i);
      else out.push([i]);
    }
    // Within a row, the ones you've put somewhere keep their left-to-right order.
    for (const row of out) {
      const slots = row.map((i, k) => k).filter((k) => placed(planets[row[k]]));
      const sorted = slots.map((k) => row[k]).sort((x, y) => planets[x].x - planets[y].x);
      slots.forEach((k, n) => { row[k] = sorted[n]; });
    }
    return out;
  };
  const top = pack(sides.top);
  const bottom = pack(sides.bottom);
  const height = (row) => tall(Math.max(...row.map((i) => sizes[i])));
  const spots = [];
  // A row's planets spread across the width, its top edge at y0.
  const lay = (row, y0, k) => {
    const S = Math.max(...row.map((i) => sizes[i]));
    const free = Math.max(0, W - row.reduce((t, i) => t + wide(i), 0));
    const step = free / (row.length + 1);
    // Every other row leans a little to one side, so it isn't a grid.
    let x = -W / 2 + step + (row.length > 1 ? 0 : (k % 2 ? 1 : -1) * Math.min(step * 0.4, W * 0.12));
    for (const i of row) {
      const s = sizes[i];
      const w = wide(i);
      const rand = seeded(`row:${planets[i].id}`);
      const y = y0 + 8 + S / 2 + (rand() - 0.5) * (S - s);
      const cx = x + w / 2 + (rand() - 0.5) * step * 0.5;
      spots[i] = { x: cx, y, size: s, rect: box(cx, y, s, w) };
      x += w + step;
    }
  };
  // The row next to the void tucks into the empty corners round it, as far
  // as its planets clear the void and its stars.
  const sink = (row, y0, dir, k) => {
    let d = 0;
    for (; d < inner.ry; d += 2) {
      lay(row, y0 + dir * (d + 2), k);
      if (row.some((i) => ovalHitsRect(inner.rx, inner.ry, spots[i].rect))) break;
    }
    return d;
  };
  const sinkTop = top.length ? sink(top[top.length - 1], -inner.ry - height(top[top.length - 1]), 1, 0) : 0;
  const sinkBottom = bottom.length ? sink(bottom[0], inner.ry, -1, top.length) : 0;
  // Spare height goes evenly between the rows and the void, up to a point.
  const p = pads(m);
  const used = [...top, ...bottom].reduce((t, r) => t + height(r), 0) + inner.ry * 2 - sinkTop - sinkBottom;
  const gaps = top.length + bottom.length;
  const spare = gaps ? clamp((m.viewH - p.top - p.bottom - used) / gaps, m.gap, m.viewH * 0.07) : 0;
  let y = -inner.ry + sinkTop;
  top.slice().reverse().forEach((row, k) => { y -= spare + height(row); lay(row, y, k); });
  y = inner.ry - sinkBottom;
  bottom.forEach((row, k) => { y += spare; lay(row, y, k + top.length); y += height(row); });
  return { spots, rects: spots.map((s) => s.rect) };
}

// ---------------------------------------------------------------- the universe

// The universe is one big map with every galaxy on it at its true size: the
// size its own page draws it on this screen. Zooming out is a camera pulling
// back from yours, so nothing is swapped on the way.

// Someone's galaxy as their page lays it out on this screen (they have no
// stars here: those are only on their owner's own page).
function galaxyPlan(g, width, viewH) {
  const planets = (g.worlds || []).map((w) => ({ id: w.id, count: w.n, x: w.x, y: w.y }));
  return fitted(width, viewH, (m) => {
    const gap = m.narrow ? 10 : 18;
    const inner = { rx: m.rx * 0.72 + gap, ry: m.ry * 0.72 + gap };
    const { spots, rects } = scatter(planets, width, inner, m);
    return { spots, ...extent(rects, inner, viewH, m) };
  });
}

// How far a galaxy reaches round its void, and where its page puts the void.
function extent(rects, inner, viewH, m) {
  let top = -inner.ry;
  let bottom = inner.ry;
  let reach = inner.rx;
  for (const r of rects) {
    top = Math.min(top, r.y0);
    bottom = Math.max(bottom, r.y1);
    reach = Math.max(reach, -r.x0, r.x1);
  }
  const pad = pads(m);
  const content = bottom - top + pad.top + pad.bottom;
  const height = Math.max(viewH, content);
  return { content, height, ex: reach + 12, ey: Math.max(-top, bottom) + 12, cy: pad.top - top + (height - content) / 2 };
}

// A galaxy on the map: its void and its planets, painted once and held
// still. `here` is the one whose page this is: the live galaxy shows
// through, so only its name and a place to click are drawn.
function miniGalaxy(g, plan, here) {
  const { ex, ey, m } = plan;
  const res = Math.min(1, (devicePixelRatio || 1) * 0.6);
  const worlds = here ? [] : (g.worlds || []).map((w, i) => {
    const sp = plan.spots[i];
    const dot = worldPicture(w, sp.size, res);
    dot.style.transform = `translate(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px)`;
    dot.at = sp;
    return dot;
  });
  const meta = [h('span', null, plural(g.planets, 'planet'))];
  if (g.locked) meta.push(h('span', { class: 'uvg-locks' }, glyph('lock', 10), `${g.locked} locked`));
  else if (g.planets) meta.push(h('span', null, `· ${plural(g.files, 'file')}`));
  const sys = h('span', { class: 'uvg-sys' }, h('span', { class: 'uvg-center' },
    here ? null : h('span', { class: 'uvg-core', style: { '--r': `${(m.hole * REACH.y * 1.05 * VOID_UV).toFixed(1)}px` } }),
    worlds));
  const el = h('button', {
    type: 'button',
    class: `uvg${g.you ? ' is-you' : ''}${here ? ' is-here' : ''}`,
    dataset: { user: g.username },
    style: { left: `${-ex}px`, top: `${-ey}px`, width: `${ex * 2}px`, height: `${ey * 2}px` },
    'aria-label': g.you ? 'Your galaxy' : `@${g.username}’s galaxy`,
  },
  sys,
  h('span', { class: 'uvg-label' },
    h('span', { class: 'uvg-name' }, g.you ? 'You' : `@${g.username}`),
    h('span', { class: 'uvg-meta' }, meta)));
  el.galaxy = g;
  el.plan = plan;
  el.sys = sys;
  el.worlds = worlds;
  return el;
}

// A soft, out-of-focus copy of a galaxy, for when it passes close to the
// camera: painted tiny and stretched, which blurs it for free.
function blurCopy(el, voidPic) {
  const { ex, ey } = el.plan;
  const q = 0.07;
  const canvas = h('canvas', { class: 'uvg-blur', width: Math.max(8, Math.round(ex * 2 * q)), height: Math.max(8, Math.round(ey * 2 * q)), 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d');
  if ('filter' in ctx) ctx.filter = 'blur(1.2px)';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(canvas.width / (ex * 2), canvas.height / (ey * 2));
  if (voidPic) {
    const r = voidPic.css;
    ctx.drawImage(voidPic, -r, -r, r * 2, r * 2);
  }
  for (const dot of el.worlds) {
    const { x, y, size } = dot.at;
    const map = dot.querySelector('canvas');
    if (map) ctx.drawImage(map, x - size / 2, y - size / 2, size, size);
    else {
      ctx.fillStyle = dot.style.getPropertyValue('--c') || '#7a8ab0';
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return canvas;
}

// Where every galaxy sits on the map, round yours (`home`), and how far the
// camera pulls back to fit them all on screen.
function universeLayout(plans, home, width, viewH) {
  // Names stay one size however far out, so the spacing keeps room for
  // them at the scale the map is drawn at: look for the largest scale at
  // which the map, names and all, still fits the screen.
  const size = width < 640 ? LABEL.narrow : LABEL.wide;
  const at = (k) => spreadUniverse(plans, home, width, viewH, { x: size.x / k, y: size.y / k });
  let lo = K_MIN;
  let hi = K_MAX;
  let best = at(lo);
  for (let i = 0; i < 8; i++) {
    const k = (lo + hi) / 2;
    const out = at(k);
    if (out.k >= k) { lo = k; best = out; } else hi = k;
  }
  return best;
}

const K_MIN = 0.03;
const K_MAX = 0.34;

// A galaxy's name and counts under it, in screen pixels (a phone shows
// only the name).
const LABEL = { wide: { x: 150, y: 46 }, narrow: { x: 96, y: 26 } };

function spreadUniverse(plans, home, width, viewH, label) {
  const avg = plans.reduce((s, p) => s + p.ex, 0) / Math.max(1, plans.length);
  // Spread to the screen's shape: wide on a desktop, tall on a phone.
  const wide = clamp(Math.sqrt(width / viewH), 0.62, 1.5);
  const order = plans.map((_, i) => i).sort((a, b) => (a === home ? -1 : b === home ? 1 : a - b));
  const spots = plans.map(() => ({ x: 0, y: 0 }));
  order.forEach((i, n) => {
    if (!n) return;
    const r = avg * 1.5 * Math.sqrt(n + 0.35);
    const a = n * GOLDEN - Math.PI / 2;
    spots[i] = { x: Math.cos(a) * r * wide, y: Math.sin(a) * r / wide };
  });
  // Nudge apart any that crowd each other, leaving room for the names.
  for (let pass = 0; pass < 120; pass++) {
    let moved = false;
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const across = Math.max((plans[i].ex + plans[j].ex) * 1.3, label.x);
        const down = Math.max((plans[i].ey + plans[j].ey) * 1.42, plans[i].ey + plans[j].ey + label.y);
        const dx = spots[j].x - spots[i].x;
        const dy = spots[j].y - spots[i].y;
        const ox = across - Math.abs(dx);
        const oy = down - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // Slide apart along whichever way is the shorter way out; the home
        // galaxy stays put.
        // (on a tall screen they'd rather stack than sit side by side)
        const move = ox / across < (oy / down) * Math.min(1, wide)
          ? { x: (dx < 0 ? -ox : ox) / 2, y: 0 }
          : { x: 0, y: (dy < 0 ? -oy : oy) / 2 };
        const kj = i === home ? 2 : j === home ? 0 : 1;
        const ki = j === home ? 2 : i === home ? 0 : 1;
        spots[j].x += move.x * kj; spots[j].y += move.y * kj;
        spots[i].x -= move.x * ki; spots[i].y -= move.y * ki;
      }
    }
    if (!moved) break;
  }
  // Fit the whole map, centred below the heading, with room round it for
  // the names, which stay one size however far out.
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  spots.forEach((s, i) => {
    const half = Math.max(plans[i].ex, label.x / 2);
    x0 = Math.min(x0, s.x - half); x1 = Math.max(x1, s.x + half);
    y0 = Math.min(y0, s.y - plans[i].ey); y1 = Math.max(y1, s.y + plans[i].ey + label.y);
  });
  // A phone has little room to spare; a computer keeps space round the map.
  const narrow = width < 640;
  const fill = narrow ? 0.95 : 0.78;
  const room = { x: (width - (narrow ? 120 : 80)) * fill, y: (viewH - (narrow ? 136 : 150)) * fill };
  const k = clamp(Math.min(room.x / (x1 - x0), room.y / (y1 - y0)), K_MIN, K_MAX);
  const mid = { x: width / 2 - k * (x0 + x1) / 2, y: viewH / 2 + 10 - k * (y0 + y1) / 2 };
  return { spots, k, mid };
}

// ---------------------------------------------------------------- the page

class Galaxy {
  constructor(data, list) {
    this.data = data;
    this.mine = !!data.user.you;
    this.owner = data.user.username;
    this.planetEls = new Map();
    this.stars = data.stars || [];
    this.showAll = false;
    this.list = list || [ownEntry(data)];
    // Already here when the page opens out in the universe.
    this.uvLoading = list ? Promise.resolve() : null;
    this.off = [];
    this.p = 0;

    // ------------------------------------------------------------ the galaxy
    this.field = h('div', { class: 'gx-field' });
    this.starsEl = h('div', { class: 'gx-stars', 'aria-label': 'Stars' });
    if (this.mine) {
      this.hole = blackHole({
        planets: () => this.data.planets,
        mode: session.prefs.autosort ? 'sort' : 'star',
        onMode: (mode) => {
          if ((mode === 'sort' || mode === 'star') && (mode === 'sort') !== !!session.prefs.autosort) updatePrefs({ autosort: mode === 'sort' });
        },
        onText: (text, from, dest) => this.addText(text, from, dest),
        onFiles: (files, from, dest) => this.addFiles(files, from, dest),
        onToggle: (open) => this.holdStill(open),
      });
      this.void = this.hole;
    } else {
      this.void = stillVoid(`@${this.owner}`);
    }
    this.coreEl = this.void.el;
    this.art = h('div', { class: 'gx-art' }, this.void.art);
    this.coreWrap = h('div', { class: 'gx-core' }, this.starsEl, this.coreEl);
    this.hint = h('p', { class: 'gx-hint' });
    this.scene = h('div', { class: 'gx-scene' }, this.art, this.field, this.coreWrap, this.hint);
    this.stage = h('section', { class: 'gx', 'aria-label': this.mine ? 'Your galaxy' : `@${this.owner}’s galaxy` }, this.scene);

    // ------------------------------------------------------------ the universe below
    this.uvField = h('div', { class: 'uv-field' });
    this.uvScene = h('div', { class: 'uv-scene' }, this.uvField);
    this.uvNear = h('div', { class: 'uv-near' });
    this.uvStage = h('section', { class: 'uv-stage', 'aria-label': 'Universe' },
      h('header', { class: 'uv-head' },
        h('h2', { class: 'uv-title' }, 'Universe'),
        h('p', { class: 'uv-sub' }, 'Everyone’s galaxies. Open one to look around.')),
      this.uvScene, this.uvNear);
    // The cosmic web, far behind everything.
    this.web = h('canvas', { class: 'uv-web', 'aria-hidden': 'true' });
    this.webLayer = h('div', { class: 'uv-web-layer' }, this.web);
    this.near = [];
    this.runway = h('div', { class: 'uv-runway' }, this.uvStage);
    this.cue = h('button', { type: 'button', class: 'gx-cue', onclick: () => this.goOut() }, h('span', null, 'Universe'), glyph('down', 12));
    this.el = h('div', { class: 'world' }, this.webLayer, this.stage, this.runway, this.cue);

    together(() => { for (const p of data.planets) this.addPlanet(p); });
    this.renderStars();
    this.layout();
    this.setHint();

    // On a phone, the address bar sliding in and out as you scroll changes
    // the height a little. Laying out again then would resize the void and
    // send every planet gliding mid-scroll, so only a real resize does.
    // Nor does a keyboard coming up while you write in the void.
    this.relayout = debounce(() => {
      if (!this.el.isConnected) return; // the page went while it waited
      const s = this.size;
      const same = s && (this.stage.clientWidth || innerWidth) === s.width;
      if (same && touchScreen() && (this.hole?.isOpen() || Math.abs(innerHeight - this.barHeight() - s.viewH) < 160)) return;
      this.layout();
    }, 120);
    this.refresh = debounce(() => this.reload(), 450);
    this.lastY = 0;
    this.onScroll = () => {
      if (this.heldAt != null) return;
      if (!this.uvLoading) this.loadUniverse();
      if (scrollY !== this.lastY) this.heading = scrollY > this.lastY ? 1 : -1;
      this.lastY = scrollY;
      cancelAnimationFrame(this.scrollFrame);
      this.scrollFrame = requestAnimationFrame(() => this.track());
      clearTimeout(this.snapTimer);
      this.snapTimer = setTimeout(() => this.snap(), 450);
    };
    if (this.mine) this.listen();
  }

  // ------------------------------------------------------------ planets

  addPlanet(planet, { born = false } = {}) {
    const el = planetEl(planet, { peek: true });
    el.body.dataset.vt = `planet-${planet.id}`;
    if (planet.locked) {
      el.addEventListener('click', (e) => { e.preventDefault(); this.unlock(); });
    }
    else if (this.mine) this.makeMovable(el);
    this.planetEls.set(planet.id, el);
    this.field.append(el);
    if (born && !reducedMotion()) {
      el.body.animate([
        { transform: 'scale(0.2)', opacity: 0 },
        { transform: 'none', opacity: 1 },
      ], { duration: 900, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }
    return el;
  }

  // ------------------------------------------------------------ arranging planets

  // Your own planets can be picked up and put somewhere else. Everyone who
  // opens your galaxy sees them where you left them.
  makeMovable(el) {
    el.classList.add('is-movable');
    let grab = null;
    let at = null;
    let shown = null;
    const toScene = (pointer) => {
      const r = this.scene.getBoundingClientRect();
      return { x: pointer.x - r.left - this.size.cx, y: pointer.y - r.top - this.size.cy };
    };
    movable(el, {
      enabled: () => this.p < 0.02 && !!this.spots?.get(el.planet.id),
      // With a mouse the globe itself spins (planets.js), so it's carried by its name.
      from: (e) => e.pointerType !== 'mouse' || !el.ball.contains(e.target),
      limits: () => ({ top: 0, bottom: Math.max(0, this.size.height - this.size.viewH) }),
      onStart: (pointer) => {
        const spot = this.spots.get(el.planet.id);
        const p = toScene(pointer);
        grab = { x: p.x - spot.x, y: p.y - spot.y };
        at = { x: spot.x, y: spot.y };
        shown = { ...at };
        el.classList.add('is-moving');
      },
      onMove: (pointer, dt) => {
        const p = toScene(pointer);
        const half = this.size.width / 2;
        at = { x: clamp(p.x - grab.x, -half, half), y: p.y - grab.y };
        // A little behind the pointer, as if it has some weight (timed, so
        // it's the same weight on a 120 Hz screen).
        const k = reducedMotion() ? 1 : 1 - Math.exp(-dt / 47);
        shown = { x: shown.x + (at.x - shown.x) * k, y: shown.y + (at.y - shown.y) * k };
        el.style.transform = `translate(${this.size.cx + shown.x}px, ${this.size.cy + shown.y}px)`;
      },
      onEnd: (pointer, cancelled) => {
        if (cancelled) { el.classList.remove('is-moving'); this.layout(); return; }
        this.place(el.planet, at, el);
      },
    });
    el.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!e.shiftKey || !step || this.p > 0.02) return;
      e.preventDefault();
      const spot = this.spots.get(el.planet.id);
      if (spot) this.place(el.planet, { x: spot.x + step[0] * 24, y: spot.y + step[1] * 24 });
    });
  }

  // Where a planet dropped at `at` ends up: there, or the nearest free spot.
  freeSpot(planet, at) {
    const m = this.m;
    const s = planetSize(planet.count, m.scale);
    const room = Math.max(0, this.size.width / 2 - (m.narrow ? 8 : 28) - footprint(s, m) / 2);
    const others = [...this.spots].filter(([id, spot]) => id !== planet.id && spot).map(([, spot]) => spot.rect);
    return nearestFree(at, s, m, others, this.inner, room);
  }

  // Put a planet down and remember where. The first time, every planet's
  // spot is saved, so none of the others wander off later.
  async place(planet, at, el = null) {
    const spot = this.freeSpot(planet, at);
    const unit = (x, y) => ({ x: Math.round((x / (this.m.scale * this.fx)) * 10) / 10, y: Math.round((y / (this.m.scale * this.stretch)) * 10) / 10 });
    const first = !this.data.planets.some(placed);
    const list = first
      ? this.data.planets.map((p) => {
        const s = p.id === planet.id ? spot : this.spots.get(p.id);
        return { id: p.id, ...unit(s.x, s.y) };
      })
      : [{ id: planet.id, ...unit(spot.x, spot.y) }];
    const before = new Map(this.data.planets.map((p) => [p.id, { x: p.x, y: p.y }]));
    for (const s of list) {
      const p = this.data.planets.find((q) => q.id === s.id);
      if (p) Object.assign(p, { x: s.x, y: s.y });
    }
    el?.classList.remove('is-moving');
    this.layout();
    try {
      await api.put('/api/galaxy/layout', { planets: list });
    } catch (err) {
      toast(err.message);
      for (const p of this.data.planets) Object.assign(p, before.get(p.id));
      this.layout();
    }
  }

  layout() {
    const width = this.stage.clientWidth || innerWidth;
    const bar = this.barHeight();
    const viewH = innerHeight - bar;
    const { m, starAt, inner, spots, fx, stretch, ...home } = fitted(width, viewH, (m) => {
      const { spots: starAt, outer } = starSpots(this.starsEl.children.length, m, width);
      // Planets keep clear of the dust and of the stars caught in it. The
      // dust fades out well before its edge, so they may sit on its rim.
      const gap = m.narrow ? 10 : 18;
      const inner = { rx: Math.max(outer.x, m.rx * 0.72) + gap, ry: Math.max(outer.y, m.ry * 0.72) + gap };
      const laid = scatter(this.data.planets, width, inner, m);
      return { starAt, inner, ...laid, ...extent(laid.rects, inner, viewH, m) };
    });
    this.m = m;
    this.inner = inner;
    this.fx = fx;
    this.stretch = stretch;
    this.spots = new Map(this.data.planets.map((p, i) => [p.id, spots[i]]));

    const { height, cy } = home;
    const cx = width / 2;
    this.size = { width, height, viewH, bar, cx, cy };

    this.scene.style.height = `${height}px`;
    this.stage.style.height = `${height}px`;
    this.stage.style.top = `${bar + viewH - height}px`;
    this.coreWrap.style.transform = `translate(${cx}px, ${cy}px)`;
    this.art.style.transform = `translate(${cx}px, ${cy}px)`;
    // The canvas covers the page's width and a bit more than a screen tall.
    this.void.size(m.hole, width + 40, Math.max(viewH * 1.5, m.ry * 2.6));
    together(() => this.data.planets.forEach((p, i) => {
      const el = this.planetEls.get(p.id);
      const spot = spots[i];
      if (!el || !spot) return;
      el.update(p, { size: spot.size });
      if (el.classList.contains('is-moving')) return;
      el.style.transform = `translate(${cx + spot.x}px, ${cy + spot.y}px)`;
    }));
    [...this.starsEl.children].forEach((el, i) => {
      const at = starAt[i];
      if (at) el.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`;
    });
    this.starsEl.style.setProperty('--chip', `${m.chip}px`);

    // The runway below: how far you scroll to get out to the universe.
    this.travel = Math.round(Math.max(1000, viewH * 2.2));
    this.runway.style.height = `${this.travel + viewH}px`;
    this.runway.style.marginTop = `${-viewH}px`;
    this.uvStage.style.height = `${viewH}px`;
    this.placeUniverse(width, viewH, m, home);
    this.track(true);
    // Only glide between spots once the first arrangement has landed.
    if (!this.scene.classList.contains('is-live')) requestAnimationFrame(() => requestAnimationFrame(() => this.scene.classList.add('is-live')));
  }

  barHeight() {
    return document.querySelector('.sb')?.offsetHeight || 34;
  }

  setHint() {
    if (this.mine) {
      const empty = !this.data.planets.length && !this.stars.length;
      this.hint.textContent = empty ? `Your galaxy is empty. ${touchScreen() ? 'Tap' : 'Click'} the void to put something in.` : '';
    } else if (!this.data.planets.length) {
      this.hint.textContent = `@${this.owner} hasn’t shared any planets yet.`;
    } else this.hint.textContent = '';
    this.hint.hidden = !this.hint.textContent && !this.hint.children.length;
  }

  // Bring planets and stars up to date without rebuilding the page.
  apply(data) {
    const known = new Set(this.planetEls.keys());
    this.data = data;
    for (const p of data.planets) {
      if (known.has(p.id)) known.delete(p.id);
      else this.addPlanet(p, { born: true });
    }
    for (const id of known) {
      const el = this.planetEls.get(id);
      this.planetEls.delete(id);
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: 'ease-in' })
        .finished.then(() => el.remove(), () => el.remove());
    }
    if (this.mine) {
      this.stars = data.stars;
      this.renderStars();
      if (data.stats) session.stats = data.stats;
      bus.emit('stats:changed', session.stats);
    }
    this.layout();
    this.setHint();
  }

  async reload() {
    try {
      const data = await api.get(this.mine ? '/api/galaxy' : `/api/galaxy/${encodeURIComponent(this.owner)}`);
      if (this.el.isConnected) this.apply(data);
    } catch { /* the next change will try again */ }
  }

  setPlanet(planet) {
    const i = this.data.planets.findIndex((p) => p.id === planet.id);
    if (i >= 0) this.data.planets[i] = { ...this.data.planets[i], ...planet };
    else this.data.planets.push(planet);
  }

  async unlock(owner = this.owner, after = null) {
    const msg = h('p', { class: 'dialog-msg' });
    const field = pinField({
      autocomplete: 'off',
      label: `${owner}'s code`,
      onComplete: async (pin) => {
        msg.textContent = '';
        field.state('busy');
        try {
          const data = await api.post(`/api/galaxy/${encodeURIComponent(owner)}/unlock`, { pin });
          field.state('ok');
          await wait(380);
          dialog.close();
          if (after) { after(); return; }
          for (const el of this.planetEls.values()) if (el.planet.locked) el.classList.add('is-thawing');
          await wait(reducedMotion() ? 0 : 420);
          this.apply(data);
          for (const el of this.planetEls.values()) el.classList.remove('is-thawing');
        } catch (err) {
          field.state('error');
          msg.textContent = err.message;
          await wait(420);
          field.state('');
          field.clear();
          field.focus();
        }
      },
    });
    const dialog = openDialog({
      title: `@${owner}’s code`,
      className: 'dialog-code',
      body: h('div', { class: 'pin-dialog' }, h('p', { class: 'dialog-text' }, 'Their locked planets open for you for 12 hours.'), field.el, msg),
    });
    setTimeout(() => field.focus(), 60);
  }

  // ------------------------------------------------------------ stars

  shownStars() {
    return this.showAll || this.stars.length <= STAR_CAP ? this.stars : this.stars.slice(0, STAR_CAP - 1);
  }

  starEl(block) {
    const label = starTitle(block);
    const el = h('button', {
      type: 'button', class: 'star', dataset: { id: block.id, kind: block.kind }, 'aria-label': `${label} (star)`,
    }, fileFace(block), h('span', { class: 'star-tip' }, label));
    el.block = block;
    el.addEventListener('click', () => nav.openBlock(block.id));
    el.addEventListener('contextmenu', (e) => {
      if (document.body.classList.contains('is-carrying')) return;
      e.preventDefault();
      blockMenu(el, el.block, { open: () => nav.openBlock(block.id) });
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'm' || (e.key === 'Enter' && e.shiftKey)) { e.preventDefault(); openConnect(el, el.block); }
    });
    draggable(el, {
      ghost: () => h('div', { class: 'star-ghost' }, fileFace(el.block)),
      targets: () => this.targets(),
      onDrop: (target, ghost) => this.dropStar(el.block, target, ghost),
    });
    return el;
  }

  renderStars() {
    if (!this.mine) return;
    const have = new Map([...this.starsEl.querySelectorAll('.star[data-id]')].map((el) => [el.dataset.id, el]));
    const next = [];
    const shown = this.shownStars();
    for (const block of shown) {
      let el = have.get(block.id);
      if (el && (el.block.thumb !== block.thumb || el.block.title !== block.title)) {
        const swap = this.starEl(block);
        swap.style.transform = el.style.transform;
        el = swap;
      } else if (el) {
        el.block = block;
      } else {
        el = this.starEl(block);
        el.classList.add('is-new');
      }
      have.delete(block.id);
      next.push(el);
    }
    const more = this.stars.length - shown.length;
    if (more) {
      next.push(h('button', {
        type: 'button', class: 'star star-more', 'aria-label': `Show ${more} more stars`,
        onclick: () => { this.showAll = true; this.renderStars(); this.layout(); },
      }, h('span', null, `+${more}`)));
    }
    this.starsEl.replaceChildren(...next);
  }

  targets() {
    const list = [];
    for (const [id, el] of this.planetEls) {
      if (el.planet.locked) continue;
      list.push({ kind: 'planet', id, el, measure: () => el.center() });
    }
    if (this.hole) {
      list.push({ kind: 'hole', el: this.hole.el, measure: () => ({ ...this.hole.center(), r: this.hole.radius() }), onHover: (on) => this.hole.hover(on) });
    }
    return list;
  }

  async dropStar(block, target, ghost) {
    const at = target.measure();
    if (target.kind === 'hole') {
      await spiralInto(ghost, center(ghost.getBoundingClientRect()), at, { duration: 900 });
      this.hole.gulp();
      try {
        const res = await api.post(`/api/blocks/${block.id}/autosort`, {});
        this.forgetStar(block.id);
        await this.launch(res.block, res.sortedInto, { sorted: true });
        bus.emit('block:connected', { block: res.block, drawerId: res.sortedInto.planet.id });
      } catch (err) {
        toast(err.message);
      }
      return;
    }
    const el = this.planetEls.get(target.id);
    await spiralInto(ghost, center(ghost.getBoundingClientRect()), at, { duration: 620, turns: 0.5 });
    el?.gulp();
    try {
      const res = await api.post(`/api/blocks/${block.id}/connections`, { drawer: target.id });
      this.forgetStar(block.id);
      el?.bump(1);
      toast(`Moved to ${el?.planet.title || 'a planet'}`);
      bus.emit('block:connected', { block: res.block, drawerId: target.id });
      this.refresh();
    } catch (err) {
      toast(err.message);
    }
  }

  forgetStar(id) {
    const el = this.starsEl.querySelector(`.star[data-id="${CSS.escape(id)}"]`);
    this.stars = this.stars.filter((b) => b.id !== id);
    el?.classList.add('is-leaving');
    setTimeout(() => { this.renderStars(); this.layout(); }, el && !reducedMotion() ? 320 : 0);
  }

  // ------------------------------------------------------------ putting things in

  // The planet a new thing is headed for, made first if it's new.
  async target(dest) {
    if (dest.mode === 'planet') return this.data.planets.find((p) => p.id === dest.planetId) || null;
    if (dest.mode === 'new') {
      const { drawer } = await api.post('/api/drawers', { title: dest.title });
      return { ...drawer, count: 0, previews: [], mine: true, isNew: true };
    }
    return null;
  }

  async addText(text, from, dest) {
    const isLink = /^https?:\/\/\S+$/i.test(text.trim());
    const chip = chipFrom(from, h('span', { class: `fx-chip-text${isLink ? ' is-link' : ''}` }, excerpt(text, 70)), 'fx-paper');
    const sort = dest.mode === 'sort';
    const request = (async () => {
      const planet = await this.target(dest);
      const res = await api.post('/api/blocks', { content: text, autosort: sort, drawer: planet?.id });
      return { ...res, planet };
    })();
    await spiralInto(chip, center(chip.getBoundingClientRect()), this.hole.center());
    this.hole.gulp();
    this.hole.setLabel(isLink ? 'Looking…' : 'Add');
    try {
      const { block, sortedInto, planet } = await request;
      if (session.stats) session.stats.files += 1;
      bus.emit('stats:changed', session.stats);
      if (sortedInto) await this.launch(block, sortedInto, { sorted: true });
      else if (planet) await this.launch(block, { planet: { ...planet, count: (planet.count || 0) + 1, previews: [block, ...(planet.previews || [])], recent: [block, ...(planet.recent || [])] }, created: planet.isNew });
      else await this.birth(block);
    } catch (err) {
      toast(err.message);
      this.hole.focusText(text);
    } finally {
      this.hole.setLabel('Add');
    }
  }

  async addFiles(files, from, dest) {
    files = withinLimit(files);
    if (!files.length) return;
    const start = from ? center(from) : this.hole.center();
    files.slice(0, 6).forEach((file, i) => {
      setTimeout(() => {
        const face = file.type.startsWith('image/') && file.size < 20e6
          ? h('img', { src: URL.createObjectURL(file), alt: '' })
          : h('span', { class: 'fx-chip-text' }, file.name);
        const chip = float(h('div', { class: 'fx-chip fx-chip-file' }, face), start);
        spiralInto(chip, start, this.hole.center(), { duration: 950 + i * 40 }).then(() => this.hole.gulp());
      }, i * 140);
    });
    const sort = dest.mode === 'sort';
    let planet = null;
    try {
      planet = await this.target(dest);
    } catch (err) {
      toast(err.message);
      return;
    }
    if (planet?.isNew) {
      this.setPlanet(planet);
      this.addPlanet(planet, { born: true });
      this.layout();
      toast(`New planet: ${planet.title}`);
    }
    addFiles(files, { galaxy: true, drawerId: planet?.id || null, autosort: sort });
  }

  // Into a planet straight from the sky (files dropped on it).
  addFilesTo(planetId, files, at) {
    const el = this.planetEls.get(planetId);
    files = withinLimit(files);
    if (!el || !files.length) return;
    files.slice(0, 6).forEach((file, i) => {
      setTimeout(() => {
        const chip = float(h('div', { class: 'fx-chip fx-chip-file' }, h('span', { class: 'fx-chip-text' }, file.name)), at);
        spiralInto(chip, at, el.center(), { duration: 700, turns: 0.5 }).then(() => el.gulp());
      }, i * 120);
    });
    addFiles(files, { drawerId: planetId });
  }

  // A new star: up out of the void and into the cluster round it.
  async birth(block) {
    if (!this.stars.some((b) => b.id === block.id)) this.stars.unshift(block);
    this.renderStars();
    this.layout();
    this.setHint();
    const el = this.starsEl.querySelector(`.star[data-id="${CSS.escape(block.id)}"]`);
    if (!el || reducedMotion()) return;
    el.classList.remove('is-new');
    const to = el.style.transform;
    el.animate([
      { transform: 'translate(0px, 0px) scale(0.1)', opacity: 0 },
      { transform: `${to} scale(1.2)`, opacity: 1, offset: 0.7 },
      { transform: `${to} scale(1)`, opacity: 1 },
    ], { duration: 900, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
  }

  // Out of the void to the planet it went onto: the file itself, flying.
  async launch(block, { planet, created }, { sorted = false } = {}) {
    this.setPlanet(planet);
    let el = this.planetEls.get(planet.id);
    if (!el) {
      el = this.addPlanet(planet, { born: true });
      this.layout();
      await wait(reducedMotion() ? 0 : 520);
    } else {
      this.layout();
    }
    const from = this.hole.center();
    const to = el.center();
    const chip = float(h('div', { class: 'fx-file' }, fileFace(block)), from);
    await arcTo(chip, from, to, { duration: 950, lift: 0.22, startScale: 0.4, endScale: 0.3 });
    el.gulp();
    el.bump(1);
    burst(to, { color: 'rgba(255,255,255,0.8)', count: 5, reach: 20 });
    if (sorted) sortedToast(block, { planet, created });
    else toast(created ? `New planet: ${planet.title}` : `Added to ${planet.title}`);
    this.setHint();
    this.refresh();
  }

  // ------------------------------------------------------------ files dragged in from your computer

  hit(x, y) {
    let best = null;
    for (const [id, el] of this.planetEls) {
      if (el.planet.locked) continue;
      const c = el.center();
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < c.r * 1.2 + 14 && (!best || d < best.d)) best = { id, el, d };
    }
    return best;
  }

  dropTarget() {
    if (!this.mine || this.p > 0.5) return { label: this.mine ? 'Scroll back up to your galaxy to add files' : 'You can only add to your own galaxy' };
    return {
      overlay: false,
      over: (e) => {
        const found = this.hole.isOpen() ? null : this.hit(e.clientX, e.clientY);
        for (const el of this.planetEls.values()) el.classList.toggle('is-target', el === found?.el);
        this.hole.hover(!found);
      },
      leave: () => {
        for (const el of this.planetEls.values()) el.classList.remove('is-target');
        this.hole.hover(false);
      },
      drop: (files, e) => {
        const open = this.hole.isOpen();
        const found = e && !open ? this.hit(e.clientX, e.clientY) : null;
        for (const el of this.planetEls.values()) el.classList.remove('is-target');
        this.hole.hover(false);
        // With the box open, files go wherever the box says.
        if (open) this.hole.takeFiles(files, e ? new DOMRect(e.clientX - 20, e.clientY - 20, 40, 40) : null);
        else if (found) this.addFilesTo(found.id, files, { x: e.clientX, y: e.clientY });
        else this.addFiles(files, e ? new DOMRect(e.clientX - 20, e.clientY - 20, 40, 40) : null, { mode: this.hole.mode() === 'sort' ? 'sort' : 'star' });
      },
    };
  }

  // ------------------------------------------------------------ keeping up with changes elsewhere

  listen() {
    this.off.push(
      bus.on('upload:done', (item) => {
        if (item.ctx.galaxy) {
          if (item.sortedInto) this.launch(item.block, item.sortedInto, { sorted: true });
          else if (item.ctx.drawerId) {
            const p = this.data.planets.find((x) => x.id === item.ctx.drawerId);
            if (p) this.launch(item.block, { planet: { ...p, count: (p.count || 0) + 1, previews: [item.block, ...(p.previews || [])], recent: [item.block, ...(p.recent || [])] }, created: false });
          } else this.birth(item.block);
        } else if (item.ctx.drawerId && this.planetEls.has(item.ctx.drawerId)) {
          this.planetEls.get(item.ctx.drawerId).bump(1);
          this.refresh();
        }
      }),
      bus.on('block:deleted', ({ id }) => { if (this.stars.some((b) => b.id === id)) this.forgetStar(id); this.refresh(); }),
      bus.on('block:connected', () => this.refresh()),
      bus.on('block:disconnected', () => this.refresh()),
      bus.on('block:changed', (b) => {
        const i = this.stars.findIndex((s) => s.id === b.id);
        if (i >= 0) this.stars[i] = { ...this.stars[i], ...b };
      }),
      bus.on('drawer:changed', () => this.refresh()),
    );
  }

  // ------------------------------------------------------------ out to the universe and back

  // A still picture of this page's void, for the galaxies out there. Taken
  // whenever the void is drawn closed, so it matches. Turning the picture
  // into an image is slow, so it's only taken again when the void's size
  // changes, not every time the page lays itself out.
  snapVoid(m) {
    if (this.hole?.isOpen()) return;
    const src = this.void.art;
    const css = parseFloat(src.style.width);
    if (!src.width || !css) return;
    const dpr = src.width / css;
    const r = m.hole * REACH.y * 1.05;
    const key = `${r}×${dpr}`;
    if (key === this.voidKey) return;
    this.voidKey = key;
    const out = document.createElement('canvas');
    out.width = out.height = Math.min(360, Math.round(r * 2 * dpr));
    out.getContext('2d').drawImage(src, src.width / 2 - r * dpr, src.height / 2 - r * dpr, r * 2 * dpr, r * 2 * dpr, 0, 0, out.width, out.height);
    out.css = r;
    this.voidPic = out;
    this.uvStage.style.setProperty('--void-pic', `url(${out.toDataURL()})`);
    this.uvStage.classList.add('has-void');
  }

  // Each galaxy drawn at its true size for this screen. Only redrawn when
  // the screen's size changes, since painting the planets takes a moment.
  renderUniverse(width, viewH) {
    const key = `${width}×${viewH}`;
    if (key === this.uvKey) return;
    this.uvKey = key;
    this.homeAt = Math.max(0, this.list.findIndex((g) => (this.mine ? g.you : g.username === this.owner)));
    together(() => {
      this.uvEls = this.list.map((g, i) => {
        const el = miniGalaxy(g, galaxyPlan(g, width, viewH), i === this.homeAt);
        el.addEventListener('click', () => this.visit(g, el));
        return el;
      });
    });
    // The nearest few pass close by the camera on the way out.
    this.uvNear.replaceChildren();
    this.near = [];
    this.uvField.replaceChildren(...this.uvEls);
  }

  // Everyone's galaxies load once the page is up: when it has a quiet
  // moment, or as soon as you start scrolling out, whichever comes first.
  // Until then the universe holds only this one.
  loadUniverse() {
    this.uvLoading ||= api.get('/api/galaxies').then(({ galaxies }) => {
      if (!this.el.isConnected) return;
      this.list = withOwner(galaxies, this.data);
      this.uvKey = null;
      if (this.size && this.homePlan) {
        this.placeUniverse(this.size.width, this.size.viewH, this.m, this.homePlan);
        this.render(this.p);
      }
    }).catch(() => { this.uvLoading = null; });
    return this.uvLoading;
  }

  placeUniverse(width, viewH, m, home) {
    this.homePlan = home;
    this.snapVoid(m);
    this.renderUniverse(width, viewH);
    const plans = this.uvEls.map((el, i) => (i === this.homeAt ? home : el.plan));
    const here = this.uvEls[this.homeAt];
    Object.assign(here.plan, home);
    Object.assign(here.style, { left: `${-home.ex}px`, top: `${-home.ey}px`, width: `${home.ex * 2}px`, height: `${home.ey * 2}px` });
    // The map is always laid out round you, whoever's page this is, so it's
    // the same map wherever you zoom out from.
    const you = this.list.findIndex((g) => g.you);
    const { spots, k, mid } = universeLayout(plans, you < 0 ? this.homeAt : you, width, viewH);
    const { height, cx, cy } = this.size;
    // Everything zooms about one point, F, chosen so that at the end the map
    // sits fitted on screen: a map point P ends at mid + k·P. At the start
    // this galaxy is where its page draws it, at full size.
    const at = { x: cx, y: viewH - height + cy };
    const S = spots[this.homeAt];
    const F = { x: (mid.x - k * at.x + k * S.x) / (1 - k), y: (mid.y - k * at.y + k * S.y) / (1 - k) };
    this.uv = { k, mid, F, at, S, spots };
    this.uvField.style.transform = `translate(${(at.x - S.x).toFixed(1)}px, ${(at.y - S.y).toFixed(1)}px)`;
    this.uvScene.style.transformOrigin = `${F.x.toFixed(1)}px ${F.y.toFixed(1)}px`;
    this.scene.style.transformOrigin = `${F.x.toFixed(1)}px ${(F.y - (viewH - height)).toFixed(1)}px`;
    this.uvEls.forEach((el, i) => {
      el.style.transform = `translate(${spots[i].x.toFixed(1)}px, ${spots[i].y.toFixed(1)}px)`;
    });

    // The nearest few start out between you and the camera, just past the
    // edges of the screen, big and out of focus, and settle into their
    // places as the camera pulls back past them.
    const want = reducedMotion() ? 0 : m.narrow ? 2 : 4;
    const near = this.uvEls.map((el, i) => i)
      .filter((i) => i !== this.homeAt && this.uvEls[i].worlds.length)
      .sort((a, b) => Math.hypot(spots[a].x - S.x, spots[a].y - S.y) - Math.hypot(spots[b].x - S.x, spots[b].y - S.y))
      .slice(0, want);
    for (const n of this.near) if (!near.includes(n.i)) { n.el.style.transform = `translate(${spots[n.i].x.toFixed(1)}px, ${spots[n.i].y.toFixed(1)}px)`; n.el.sys.style.opacity = ''; n.blur.remove(); this.uvField.append(n.el); }
    const centre = { x: width / 2, y: viewH / 2 };
    this.near = near.map((i, j) => {
      const el = this.uvEls[i];
      const old = this.near.find((n) => n.i === i);
      const blur = old?.blur || blurCopy(el, this.voidPic);
      if (!old) { el.append(blur); this.uvNear.append(el); }
      el.style.transform = '';
      const end = { x: mid.x + k * spots[i].x, y: mid.y + k * spots[i].y };
      let dir = { x: end.x - centre.x, y: end.y - centre.y };
      const len = Math.hypot(dir.x, dir.y) || 1;
      dir = len > 1 ? { x: dir.x / len, y: dir.y / len } : { x: Math.cos(j * 2.4), y: Math.sin(j * 2.4) };
      const s0 = 1.25 + 0.12 * j;
      // Just past the edge, so its near side is where the screen ends.
      const edge = Math.min(Math.abs(dir.x) > 1e-3 ? width / 2 / Math.abs(dir.x) : Infinity, Math.abs(dir.y) > 1e-3 ? viewH / 2 / Math.abs(dir.y) : Infinity);
      const reach = Math.abs(dir.x) * el.plan.ex + Math.abs(dir.y) * el.plan.ey;
      const start = { x: centre.x + dir.x * (edge + reach * s0 * 0.7), y: centre.y + dir.y * (edge + reach * s0 * 0.7) };
      return { i, el, blur, s0, start, from: 0.04 + 0.06 * j, to: 0.62 + 0.07 * j, map: { x: at.x + spots[i].x - S.x, y: at.y + spots[i].y - S.y } };
    });

    // The web behind, drawn as it looks once you're all the way out.
    const nodes = spots.map((s, i) => ({ x: mid.x + k * s.x, y: mid.y + k * s.y, r: k * Math.max(plans[i].ex, plans[i].ey) * 0.8 }));
    const webKey = `${width}×${viewH}:${nodes.map((n) => `${Math.round(n.x)},${Math.round(n.y)}`).join(';')}`;
    if (webKey !== this.webKey) {
      this.webKey = webKey;
      const M = 1.4;
      const W = width * M;
      const H = viewH * M;
      const off = { x: (width - W) / 2, y: (viewH - H) / 2 };
      paintWeb(this.web, W, H, nodes.map((n) => ({ ...n, x: n.x - off.x, y: n.y - off.y })), session.user?.username || this.owner);
      Object.assign(this.web.style, { left: `${off.x}px`, top: `${off.y}px`, width: `${W}px`, height: `${H}px`, transformOrigin: `${(F.x - off.x).toFixed(1)}px ${(F.y - off.y).toFixed(1)}px` });
    }
  }

  // Scroll position → how far out we are (0 here, 1 in the universe). The
  // picture follows the scroll with a little weight, so it glides rather
  // than stepping with each notch of the wheel.
  track(jump = false) {
    if (!this.size) return;
    const { height, viewH } = this.size;
    // The page can stop a fraction of a pixel short of its end (on many
    // screens it does), and that's still all the way out.
    const raw = (scrollY - (height - viewH)) / this.travel;
    const goal = clamp(raw > 1 - 2 / this.travel ? 1 : raw);
    this.goal = goal;
    const now = performance.now();
    const dt = this.tickAt ? Math.min(64, now - this.tickAt) : 16;
    let p = goal;
    if (!jump && !this.jump && !reducedMotion()) {
      p = this.p + (goal - this.p) * (1 - Math.exp(-dt / 140));
      if (Math.abs(goal - p) < 0.0008) p = goal;
    }
    this.jump = false;
    this.render(p);
    if (p !== goal) {
      this.tickAt = now;
      cancelAnimationFrame(this.scrollFrame);
      this.scrollFrame = requestAnimationFrame(() => this.track());
    } else {
      this.tickAt = 0;
    }
  }

  render(p) {
    this.p = p;
    // An even pull back: each bit of scrolling shrinks things by the same
    // ratio, only softened at the very start and end.
    const e = 0.4 * p + 0.6 * smooth(p);
    const { k: kEnd, F } = this.uv;
    const k = kEnd ** e;
    // This galaxy and the map round it shrink as one, about F.
    this.scene.style.transform = p ? `scale(${k.toFixed(5)})` : '';
    this.uvScene.style.transform = `scale(${k.toFixed(5)})`;
    this.uvStage.style.opacity = String(smooth(clamp(e / 0.05)));
    // This galaxy's void shrinks to match the others' on the way out.
    const { cx, cy } = this.size;
    const vs = 1 - (1 - VOID_UV) * smooth(clamp(e / 0.7));
    this.art.style.transform = `translate(${cx}px, ${cy}px)${vs < 1 ? ` scale(${vs.toFixed(4)})` : ''}`;
    // The ones passing close by: bigger than the map, sliding in from the
    // edges and sharpening as they settle into place.
    for (const n of this.near) {
      const u = smooth(clamp((e - n.from) / (n.to - n.from)));
      const s = Math.exp((1 - u) * Math.log(n.s0) + u * Math.log(k));
      const w = Math.abs(n.s0 - k) > 1e-4 ? (n.s0 - s) / (n.s0 - k) : u;
      const q = { x: F.x + k * (n.map.x - F.x), y: F.y + k * (n.map.y - F.y) };
      const x = n.start.x + (q.x - n.start.x) * w;
      const y = n.start.y + (q.y - n.start.y) * w;
      n.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(5)})`;
      const soft = smooth(clamp((s / k - 1.05) / 0.5));
      const shown = smooth(clamp(u / 0.12)) * (u > 0 ? 1 : 0);
      n.el.sys.style.opacity = (shown * (1 - soft)).toFixed(3);
      n.blur.style.opacity = (shown * soft * 0.9).toFixed(3);
      n.el.style.visibility = shown ? '' : 'hidden';
    }
    // The web is further off, so it moves more slowly.
    this.web.style.transform = `scale(${((k / kEnd) ** 0.45).toFixed(4)})`;
    this.webLayer.style.opacity = String(smooth(clamp((e - 0.12) / 0.5)));
    // Names stay a readable size, and come in once everyone's in place.
    const lab = smooth(clamp((e - 0.74) / 0.2));
    this.uvStage.style.setProperty('--lab', lab.toFixed(3));
    this.uvStage.style.setProperty('--head', smooth(clamp((e - 0.55) / 0.3)).toFixed(3));
    if (lab) this.uvStage.style.setProperty('--ik', (1 / k).toFixed(3));
    this.el.classList.toggle('is-far', k < 0.55);
    this.cue.style.opacity = String(1 - clamp(p * 5));
    this.cue.style.pointerEvents = p > 0.1 ? 'none' : '';
    const out = p > 0.5;
    if (out !== this.out) {
      this.out = out;
      this.el.classList.toggle('is-out', out);
      if (out && !isEditable(document.activeElement)) this.hole?.close();
      if (out && !this.mine && this.live) this.fetchMine();
      // Back in from the universe, you're home: say so, so a refresh or
      // coming back to this page doesn't open it zoomed out again.
      if (!out && this.mine && this.live && location.pathname === '/universe') nav.rename('/');
      bus.emit('universe', out);
    }
    if (p >= 0.99 && !this.mine && this.live) this.toMine();
    // Once it starts to zoom, the planets and the black hole hold still
    // (keeping their picture), so each frame only moves finished layers.
    const moving = p > 0.01;
    if (moving !== this.moving) {
      this.moving = moving;
      this.el.classList.toggle('is-zooming', moving);
      holdPlanets(moving);
      if (moving) this.void.pause();
      else this.void.play();
    }
    theSky()?.setNight(e);
  }

  // While the void is open, a phone keyboard scrolls the page to show what
  // you're typing. That isn't a trip out to the universe, so the picture
  // holds still, and the page goes back to where it was once you're done.
  holdStill(on) {
    if (on) { if (touchScreen()) this.heldAt = scrollY; return; }
    const y = this.heldAt;
    this.heldAt = null;
    if (y != null && Math.abs(scrollY - y) > 1) scrollTo(0, y);
  }

  // Let go between the two and it carries on the way you were going.
  snap() {
    const p = this.goal ?? this.p;
    if (!this.size || p <= 0.01 || p >= 0.99 || reducedMotion()) return;
    // Typing (a phone keyboard can scroll the page): leave it where it is.
    if (this.hole?.isOpen() || isEditable(document.activeElement)) return;
    const start = this.size.height - this.size.viewH;
    // Only a nudge: it finishes the trip once you're well on your way.
    const out = this.heading > 0 ? p > 0.4 : p > 0.6;
    scrollTo({ top: out ? start + this.travel : start, behavior: 'smooth' });
  }

  goOut(instant = false) {
    if (!this.size) return;
    if (instant) this.jump = true;
    scrollTo({ top: this.size.height - this.size.viewH + this.travel, behavior: instant || reducedMotion() ? 'auto' : 'smooth' });
  }

  goHome() {
    scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  // Out in the universe from someone else's galaxy, the page quietly becomes
  // yours, scrolled all the way out, so zooming back in always lands home.
  // The map is the same on both, so nothing moves when it swaps.
  async toMine() {
    if (this.swapping || this.diving) return;
    this.swapping = true;
    const data = await this.fetchMine();
    if (!data || !this.el.isConnected || this.p < 0.99 || this.diving) {
      // Not ready, or you've started back in: try again next time out.
      if (!data) this.mineData = null;
      this.swapping = false;
      return;
    }
    handoff = { data, list: this.list };
    nav.go('/universe', { replace: true, motion: 'none' });
  }

  // Your galaxy, fetched ahead (as this page opens, and again on the way
  // out if it's been a while), so the handover doesn't wait on it.
  fetchMine() {
    if (!this.mineData || performance.now() - this.mineAt > 30000) {
      this.mineAt = performance.now();
      this.mineData = api.get('/api/galaxy').catch(() => null);
    }
    return this.mineData;
  }

  // The corner arrow on someone else's galaxy: the camera pulls back into
  // the universe, where the page becomes yours (toMine()). Pressed again
  // before that, it flies you home.
  async back() {
    if (this.p < 0.5) { this.goOut(); return; }
    if (!this.uvLoading) this.loadUniverse();
    await this.uvLoading;
    const at = this.list.findIndex((g) => g.you);
    if (at < 0 || !this.uvEls[at]) { nav.go('/'); return; }
    this.visit(this.list[at], this.uvEls[at]);
  }

  // Anyone's galaxy opens; a code is only asked for on a locked planet.
  async visit(g, el) {
    const here = this.mine ? g.you : g.username === this.owner;
    if (here) { this.goHome(); return; }
    if (this.diving) return;
    this.diving = true;
    if (!reducedMotion()) await this.dive(el);
    arriving = true;
    nav.go(g.you ? '/' : `/g/${g.username}`, { motion: 'none' });
  }

  // The camera dives into a galaxy until it's the size its page draws it,
  // right where its page will put it, so the page takes over without a jump.
  async dive(el) {
    const stage = this.uvStage.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const g = { x: box.left + box.width / 2 - stage.left, y: box.top + box.height / 2 - stage.top };
    const z = (el.plan.ex * 2) / box.width;
    const worldTop = this.el.getBoundingClientRect().top + scrollY;
    const to = { x: this.size.width / 2, y: worldTop + el.plan.cy - stage.top };
    el.classList.add('is-target');
    this.uvStage.classList.add('is-diving');
    this.uvStage.style.transformOrigin = `${g.x.toFixed(1)}px ${g.y.toFixed(1)}px`;
    const duration = 950;
    const anim = this.uvStage.animate([
      { transform: 'none' },
      { transform: `translate(${(to.x - g.x).toFixed(1)}px, ${(to.y - g.y).toFixed(1)}px) scale(${z.toFixed(4)})` },
    ], { duration, easing: 'cubic-bezier(0.55, 0, 0.25, 1)', fill: 'forwards' });
    el.querySelector('.uvg-core')?.animate([{ transform: 'none' }, { transform: `scale(${1 / VOID_UV})` }],
      { duration, easing: 'cubic-bezier(0.55, 0, 0.25, 1)', fill: 'forwards' });
    const fade = { duration: duration * 0.55, easing: 'ease-in', fill: 'forwards' };
    this.stage.animate([{ opacity: 1 }, { opacity: 0 }], fade);
    this.webLayer.animate([{ opacity: getComputedStyle(this.webLayer).opacity }, { opacity: 0 }], fade);
    // The sky comes back from the dark as you arrive.
    const start = performance.now();
    const night = () => {
      const t = clamp((performance.now() - start) / duration);
      theSky()?.setNight(1 - smooth(t));
      if (t < 1 && this.diving) requestAnimationFrame(night);
    };
    requestAnimationFrame(night);
    await anim.finished.catch(() => {});
  }

  entrance() {
    if (reducedMotion()) return;
    this.coreEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 300, fill: 'backwards' });
    this.void.art.animate([{ transform: 'translate(-50%, -50%) scale(0.7)', opacity: 0 }, { transform: 'translate(-50%, -50%)', opacity: 1 }],
      { duration: 1200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    this.starsEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 200, fill: 'backwards' });
    [...this.planetEls.values()].forEach((p, i) => {
      p.body.animate([
        { transform: 'scale(0.85)', opacity: 0 },
        { transform: 'none', opacity: 1 },
      ], { duration: 800, delay: 120 + i * 50, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' });
    });
  }

  inst() {
    return {
      el: this.el,
      title: this.mine ? 'Your galaxy' : `@${this.owner}’s galaxy`,
      chrome: 'galaxy',
      who: { username: this.owner, you: this.mine },
      home: !this.mine,
      goHome: this.mine ? () => this.goHome() : () => this.back(),
      list: () => this.stars,
      dropTarget: () => this.dropTarget(),
      pasteText: (text) => { if (this.p < 0.5) this.hole?.focusText(text); },
      mounted: ({ moved = false } = {}) => {
        this.layout();
        addEventListener('resize', this.relayout);
        addEventListener('scroll', this.onScroll, { passive: true });
        theSky()?.setLens(() => {
          if (this.p > 0.02 || !this.el.isConnected) return null;
          return { ...this.void.center(), r: this.void.radius() };
        });
        // Straight out, before anything is drawn, so a handover from
        // someone else's universe doesn't flash your galaxy up close.
        if (startOut) { startOut = false; this.goOut(true); this.track(true); }
        // Only now does the scroll say where you are on this page (before,
        // it was the old page's, then the top while it was put in place).
        this.live = true;
        if (arriving) {
          // The planets' names come in gently after the camera's dive.
          this.el.classList.add('is-far');
          requestAnimationFrame(() => requestAnimationFrame(() => this.el.classList.remove('is-far')));
        } else if (!moved) this.entrance();
        arriving = false;
        if (!this.mine) this.fetchMine();
        if (!this.uvLoading) {
          if (window.requestIdleCallback) requestIdleCallback(() => this.loadUniverse(), { timeout: 2000 });
          else setTimeout(() => this.loadUniverse(), 800);
        }
      },
      destroy: () => {
        removeEventListener('resize', this.relayout);
        removeEventListener('scroll', this.onScroll);
        // A glide still under way would carry on after the page has gone,
        // waking its void and dimming the sky over the next page.
        cancelAnimationFrame(this.scrollFrame);
        clearTimeout(this.snapTimer);
        this.off.forEach((off) => off());
        this.diving = false;
        this.live = false;
        theSky()?.setLens(null);
        this.void.destroy();
        theSky()?.setNight(0);
        holdPlanets(false);
        bus.emit('universe', false);
      },
    };
  }
}

// The galaxy on this page, as the universe lists it.
const ownEntry = (data) => ({ username: data.user.username, you: !!data.user.you, planets: data.planets.length, open: data.planets.length, files: 0, worlds: [] });

// Everyone's galaxies, with the one on this page among them.
function withOwner(galaxies, data) {
  if (!data.user.you && !galaxies.some((g) => g.username === data.user.username)) galaxies.push(ownEntry(data));
  return galaxies;
}

// The universe below waits until the page is up (loadUniverse()), unless
// the page opens out there.
async function loadGalaxy(username, universe) {
  const mine = !username || username === session.user.username;
  const [data, everyone] = await Promise.all([
    api.get(mine ? '/api/galaxy' : `/api/galaxy/${encodeURIComponent(username)}`),
    universe ? api.get('/api/galaxies') : null,
  ]);
  return { data, list: everyone && withOwner(everyone.galaxies, data) };
}

export const galaxyView = {
  load: ([username]) => loadGalaxy(username, false),

  create(params, { data, list }) {
    if (data.user.you && params[0]) queueMicrotask(() => nav.go('/', { replace: true }));
    if (data.stats) session.stats = data.stats;
    return new Galaxy(data, list).inst();
  },
};

// The universe is your galaxy, scrolled all the way out.
export const universeView = {
  load: () => {
    const ready = handoff;
    handoff = null;
    return ready || loadGalaxy(null, true);
  },
  create(params, loaded) {
    startOut = true;
    return galaxyView.create([], loaded);
  },
};
