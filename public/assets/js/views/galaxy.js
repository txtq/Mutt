// Your galaxy: the main page. A void sits in the middle, and everything new
// goes in through it. Loose files (stars) settle in a cluster round its edge;
// planets (your drawers) are scattered further out, each one showing the
// files on it. Keep scrolling down and the galaxy shrinks away into the
// universe, where everyone else's galaxies are.

import { blockContextMenu, openConnect, sortedToast } from '../actions.js';
import { api, session } from '../api.js';
import { blackHole, stillVoid } from '../blackhole.js';
import { draggable, movable } from '../drag.js';
import { arcTo, burst, center, chipFrom, float, spiralInto } from '../fx.js';
import { nav } from '../nav.js';
import { fileFace, holdPlanets, orbitReach, planetEl, planetSize, worldPicture } from '../planets.js';
import { together } from '../planetgl.js';
import { theSky } from '../sky.js';
import { updatePrefs } from '../theme.js';
import { openContextMenu, openDialog, pinField, toast } from '../ui.js';
import { askThen } from './planet.js';
import { addFiles, withinLimit } from '../uploads.js';
import { DUR, EASE, EASE_GLIDE, EASE_LEAVE, STAGGER, bus, debounce, h, isEditable, personLabel, plural, reducedMotion, seeded, sharpness, touchScreen, wait } from '../util.js';
import { beads, beadsRun, paintWeb, wisp } from '../uvweb.js';
import { REACH, voidRadius } from '../voidart.js';
import { icon } from '../icons.js';
import { Sky } from '../constellations.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const STAR_CAP = 240;
// A phone shows the newest stars round its void and keeps the rest behind "+N":
// three dozen cards in the dust would bury it.
const STAR_CAP_PHONE = 18;
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
  // radius of the dark itself; on a phone it shrinks less than the planets, being the heart of the page
  const hole = Math.round(voidRadius(width, viewH) * (narrow ? Math.max(z, 0.8 * shortness(viewH)) : z));
  return {
    narrow,
    z,
    viewH,
    // a phone's planets are a little smaller than a computer's, not much: they are what you came for
    scale: (narrow ? 0.86 : mid ? 0.86 : 1) * z,
    hole,
    // The glow round it: a tall oval.
    rx: hole * REACH.x,
    ry: hole * REACH.y,
    // a star is something to tap on a phone, so it keeps a fingertip's size
    chip: narrow ? 36 : Math.round(38 * Math.max(z, 0.8)),
    cell: narrow ? 44 : Math.round(47 * Math.max(z, 0.8)),
    // Room round each planet, and across for its name, which stays one size.
    gap: Math.round((narrow ? 10 : 22) * z),
    wide: Math.round((narrow ? 104 : 140) * Math.max(z, 0.8)),
  };
}

// A galaxy fits the screen: when its planets would run past the bottom (or
// can't all find a place on the orbits round the void), everything is drawn
// smaller until they do, and no smaller. `place(m)` lays it out and says
// how tall it came out. Past the smallest size, the page scrolls. `hold`
// keeps a size as it is (while you arrange your planets).
const Z_MIN = 0.42;
// A phone stops shrinking sooner and scrolls instead: past this its planets
// would be too small to see or tap. A shorter phone (an SE) may go a little
// smaller, so a galaxy of a few rows still fits its screen.
const Z_PHONE = 0.66;
const shortness = (viewH) => clamp(viewH / 800, 0.62, 1);
const phoneLeast = (viewH) => Z_PHONE * shortness(viewH);

// Out in the universe each void draws this much smaller beside its planets.
const VOID_UV = 0.5;
// Following the scroll out to the universe (track, snap, carry):
const SETTLES = 6.6;      // a spring of stiffness w is within a hundredth of its goal after 6.6 / w seconds
const CRAWL = 0.25;       // slower than this many pixels a millisecond, a scroll is running out
const LET_GO = DUR.quick;       // this long without a scroll, well on your way: you have let go
const LET_GO_BACK = DUR.arrive; // not yet on your way: it waits longer before taking you back
function fitted(width, viewH, place, hold = 0) {
  if (hold) {
    const m = metrics(width, viewH, hold);
    return { m, ...place(m) };
  }
  const fits = (o) => o.content <= viewH && !o.cramped;
  let m = metrics(width, viewH);
  let out = place(m);
  if (fits(out)) return { m, ...out };
  // Step down until it fits (a phone's rows reflow as things shrink, so it
  // steps gently)...
  let over = 1;
  const least = m.narrow ? phoneLeast(viewH) : Z_MIN;
  for (let i = 0; i < 30 && !fits(out) && m.z > least; i++) {
    over = m.z;
    m = metrics(width, viewH, Math.max(least, m.z * (m.narrow ? 0.97 : Math.min(0.96, (viewH / out.content) ** 1.2))));
    out = place(m);
  }
  if (!fits(out)) return { m, ...out };
  // ...then close in on the largest size that fits, so it never shrinks
  // further than it has to.
  let under = m.z;
  for (let i = 0; i < 5 && over - under > 0.008; i++) {
    const mm = metrics(width, viewH, (over + under) / 2);
    const o = place(mm);
    if (fits(o)) { under = mm.z; m = mm; out = o; } else over = mm.z;
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
// A planet with moons needs room for their orbits too.
// A full planet's rings reach well past its sides.
const footprint = (s, m, p) => (p?.shape ? Math.max(p.shape.w, m.wide) : Math.max(s * ((p?.count || 0) >= 10 ? 1.6 : 1), m.wide, p ? orbitReach(p, s) * 2 : 0));
// The room a planet and its name take up, round (x, y).
const box = (x, y, s, w) => ({ x0: x - w / 2, x1: x + w / 2, y0: y - s / 2 - 8, y1: y + s / 2 + 50 });

// The nearest spot to `at` where a planet clears the void, the stars round
// it, the screen's sides and every rect in `taken`.
function nearestFree(at, s, m, taken, inner, room, p) {
  const w = footprint(s, m, p);
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

// ---------------------------------------------------------------- orbits

// Planets live on orbits: rounded rings round the void, from snug against
// its dust out to the edges of the screen. Left to themselves they spread
// evenly round the closest orbit that holds them all; picked up, they snap
// onto a free place on one of them (or facing another planet across the
// void), so the galaxy always looks arranged.
const ORBITS = [0, 0.25, 0.5, 0.75, 1];
const ORBIT_P = 2.6; // between an oval (2) and a rounded box: it follows the screen's corners
const RING_N = 480;
// A planet's middle, name and all, sits this far below its globe's middle
// (see box()), and reaches this far above and below it.
const LIFT = 21;
const halfTall = (s) => s / 2 + 29;
const spow = (v, e) => Math.sign(v) * Math.abs(v) ** e;

// The room planets have round the void (at 0, 0): the screen, less a margin.
function frameOf(width, m) {
  const p = pads(m);
  const half = width / 2 - (m.narrow ? 8 : 28);
  const Y = m.viewH / 2 - Math.max(p.top, p.bottom);
  return { x0: -half, x1: half, y0: -Y, y1: Y };
}

const inFrame = (r, fr) => r.x0 >= fr.x0 - 0.5 && r.x1 <= fr.x1 + 0.5 && r.y0 >= fr.y0 - 0.5 && r.y1 <= fr.y1 + 0.5;

// How big the innermost and outermost orbits are, from the largest planet
// (so every planet fits on every orbit) and the room in the frame.
function orbitShape(planets, sizes, inner, m, fr) {
  let hw = m.wide / 2;
  let hh = halfTall(planetSize(0, m.scale));
  planets.forEach((p, i) => {
    hw = Math.max(hw, footprint(sizes[i], m, p) / 2);
    hh = Math.max(hh, halfTall(sizes[i]));
  });
  const half = Math.min(-fr.x0, fr.x1);
  const Y = Math.min(-fr.y0, fr.y1);
  const aIn = inner.rx + m.gap + hw;
  const aOut = Math.max(aIn, half - hw);
  const bOut = Math.max(0, Y - hh);
  const bIn = Math.min(inner.ry + m.gap + hh, bOut);
  return { aIn, aOut, bIn, bOut, hw, hh };
}

// One orbit, `t` of the way out, as points going round clockwise from the
// bottom (so the first and last planets mirror each other across the top).
const UNIT = Array.from({ length: RING_N }, (_, k) => {
  const th = Math.PI / 2 + (k / RING_N) * Math.PI * 2;
  return { x: spow(Math.cos(th), 2 / ORBIT_P), y: spow(Math.sin(th), 2 / ORBIT_P) };
});
function ring(t, sh) {
  sh.rings ||= new Map();
  if (sh.rings.has(t)) return sh.rings.get(t);
  const A = sh.aIn + (sh.aOut - sh.aIn) * t;
  const B = sh.bIn + (sh.bOut - sh.bIn) * t;
  const pts = UNIT.map((u, k) => ({ x: A * u.x, y: B * u.y, k }));
  pts.forEach((p, k) => {
    const q = pts[(k + 1) % RING_N];
    const d = Math.hypot(q.x - p.x, q.y - p.y) || 1e-6;
    Object.assign(p, { ds: d, tx: (q.x - p.x) / d, ty: (q.y - p.y) / d });
  });
  const R = { t, A, B, pts };
  sh.rings.set(t, R);
  return R;
}

// A planet whose middle (name and all) is at an orbit's point.
function spotOn(pt, s, w) {
  const x = pt.x;
  const y = pt.y - LIFT;
  return { x, y, rect: box(x, y, s, w) };
}

const fitsAt = (rect, inner, fr) => inFrame(rect, fr) && !ovalHitsRect(inner.rx, inner.ry, rect);

// Spread planets evenly along the parts of an orbit where they fit, each
// given room for its width (along the top) or height (down the sides).
// (Where the largest planet fits is worked out once per orbit.)
function openArc(R, sh, inner, fr) {
  if (R.arc) return R.arc;
  const open = R.pts.filter((pt) => fitsAt({ x0: pt.x - sh.hw, x1: pt.x + sh.hw, y0: pt.y - sh.hh, y1: pt.y + sh.hh }, inner, fr));
  const marks = [];
  let L = 0;
  open.forEach((pt, j) => {
    marks.push(L);
    const next = open[(j + 1) % open.length];
    if (next.k === (pt.k + 1) % RING_N) L += pt.ds;
  });
  R.arc = { open, marks, L };
  return R.arc;
}

function spread(R, sh, items, inner, fr, gap) {
  const n = items.length;
  if (!n) return [];
  const { open, marks, L } = openArc(R, sh, inner, fr);
  if (!open.length) return null;
  const at = (u) => {
    let lo = 0;
    let hi = open.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (marks[mid] <= u) lo = mid; else hi = mid - 1;
    }
    return open[lo];
  };
  // Laid round from the bottom, the planets mirror each other left and
  // right, an odd one out at the top. When the void leaves no room at the
  // top, an odd number is laid round from the left instead: they mirror
  // top and bottom, the odd one out at the right (where a lone one goes).
  const where = (k) => marks[open.findIndex((pt) => pt.k >= k)] ?? 0;
  const topOpen = open.some((pt) => pt.k === RING_N / 2);
  const u0 = n % 2 && (!topOpen || n === 1) ? where(RING_N / 4) : 0;
  let need = items.map((it) => (it.w + it.s + 58) / 2 + gap);
  let pts = [];
  for (let pass = 0; pass < 3; pass++) {
    const total = need.reduce((a, b) => a + b, 0);
    if (total > L) return null;
    const slack = (L - total) / n;
    let u = u0;
    pts = items.map((it, j) => {
      const c = (u + (need[j] + slack) / 2) % L;
      u += need[j] + slack;
      return at(c);
    });
    // Each place is as wide as an average planet needs there, so they're
    // evenly spaced whatever their sizes (the check after makes sure the
    // big ones still clear their neighbours).
    const aw = items.reduce((t, it) => t + it.w, 0) / n;
    const ah = items.reduce((t, it) => t + it.s + 58, 0) / n;
    need = pts.map((pt) => Math.abs(pt.tx) * aw + Math.abs(pt.ty) * ah + gap);
  }
  return pts;
}

// Tidy: the planets spread round one orbit, as close in as will hold them
// all; if none can, two orbits (or three), the first-made planets inside.
// Gives null when they can't all fit on screen at this size.
function orbitLayout(planets, sizes, inner, m, fr, sh) {
  const items = planets.map((p, i) => ({ i, s: sizes[i], w: footprint(sizes[i], m, p) }));
  const n = items.length;
  const tryRings = (groups) => {
    const out = [];
    for (const g of groups) {
      const pts = spread(ring(g.t, sh), sh, g.items, inner, fr, m.gap);
      if (!pts) return null;
      g.items.forEach((it, j) => { out[it.i] = { ...spotOn(pts[j], it.s, it.w), size: it.s }; });
    }
    for (let a = 0; a < n; a++) {
      if (!fitsAt(out[a].rect, inner, fr)) return null;
      for (let b = a + 1; b < n; b++) if (overlaps(out[a].rect, out[b].rect, m.gap)) return null;
    }
    return out;
  };
  for (const t of ORBITS) {
    const out = tryRings([{ t, items }]);
    if (out) return out;
  }
  const reach = (t) => { const R = ring(t, sh); return R.A + R.B; };
  for (const ts of [[0, 1], [0.25, 1], [0, 0.75], [0, 0.5, 1]]) {
    const total = ts.reduce((a, t) => a + reach(t), 0);
    // Shares in proportion to each orbit's length, then a little either
    // way; even numbers first, since they mirror across the void.
    const base = ts.map((t) => Math.round((n * reach(t)) / total));
    const tries = [0, -1, 1, -2, 2, -3, 3].map((d) => {
      const counts = base.slice();
      counts[0] += d;
      counts[counts.length - 1] = n - counts.slice(0, -1).reduce((a, b) => a + b, 0);
      return { counts, odd: counts.filter((c) => c % 2).length };
    }).filter((c) => c.counts.every((x) => x >= 1)).sort((a, b) => a.odd - b.odd);
    for (const { counts } of tries) {
      let k = 0;
      const out = tryRings(ts.map((t, j) => ({ t, items: items.slice(k, (k += counts[j])) })));
      if (out) return out;
    }
  }
  return null;
}

// Too many planets for the orbits: an even grid of places filling the
// frame, the ones nearest the void taken, planets going round clockwise
// from the top in the order they were made. Only once the galaxy is
// already drawn small (below GRID_Z), so the orbits get every chance first.
const GRID_Z = 0.62;
function gridLayout(planets, sizes, inner, m, fr) {
  const items = planets.map((p, i) => ({ i, s: sizes[i], w: footprint(sizes[i], m, p) }));
  const hw = Math.max(...items.map((it) => it.w)) / 2;
  const hh = Math.max(...items.map((it) => halfTall(it.s)));
  const cw = hw * 2 + m.gap;
  const ch = hh * 2 + m.gap;
  const cols = Math.floor((fr.x1 - fr.x0 + m.gap) / cw);
  const rowsN = Math.floor((fr.y1 - fr.y0 + m.gap) / ch);
  const cells = [];
  for (let r = 0; r < rowsN; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * cw;
      const y = (r - (rowsN - 1) / 2) * ch;
      if (ovalHitsRect(inner.rx, inner.ry, { x0: x - hw, x1: x + hw, y0: y - hh, y1: y + hh })) continue;
      cells.push({ x, y, d: (x / inner.rx) ** 2 + (y / inner.ry) ** 2 + Math.abs(x) * 1e-6 });
    }
  }
  if (cells.length < items.length) return null;
  const turn = (p) => (Math.atan2(p.x, -p.y) + Math.PI * 2) % (Math.PI * 2);
  const chosen = cells.sort((a, b) => a.d - b.d).slice(0, items.length).sort((a, b) => turn(a) - turn(b));
  return items.map((it, j) => ({ ...spotOn(chosen[j], it.s, it.w), size: it.s }));
}

// Every free place on the orbits for a planet of size `s` (`w` across):
// clear of the void, the frame and the `taken` rects. Places straight
// across the void from another planet, and the tops, sides and corners of
// each orbit, are marked `nice`; they pull a dragged planet in.
function openSpots(s, w, sh, taken, inner, fr, m, mirrorOf = []) {
  const out = [];
  const free = (rect) => fitsAt(rect, inner, fr) && !taken.some((o) => overlaps(o, rect, m.gap));
  for (const t of ORBITS) {
    const R = ring(t, sh);
    for (let k = 0; k < RING_N; k += 2) {
      const spot = spotOn(R.pts[k], s, w);
      if (free(spot.rect)) out.push({ ...spot, ring: R, nice: k % (RING_N / 8) === 0 });
    }
  }
  for (const o of mirrorOf) {
    const mid = { x: o.x, y: o.y + LIFT };
    for (const p of [{ x: -mid.x, y: mid.y }, { x: mid.x, y: -mid.y }, { x: -mid.x, y: -mid.y }]) {
      const spot = spotOn(p, s, w);
      if (free(spot.rect)) out.push({ ...spot, nice: true });
    }
  }
  return out;
}

// The place a dragged planet will land: the nearest free one, unless one
// that looks right (facing another planet, the top or a side of an orbit,
// or back where it was) is nearly as near.
function snapTo(list, at) {
  let best = null;
  let near = Infinity;
  let nice = null;
  let niceNear = Infinity;
  for (const o of list) {
    const d = Math.hypot(o.x - at.x, o.y - at.y);
    if (d < near) { near = d; best = o; }
    if ((o.nice || o.here) && d < niceNear) { niceNear = d; nice = o; }
  }
  return nice && niceNear < near + 30 ? nice : best;
}

// Planets: the ones you've put somewhere stay there. On a narrow screen the
// arrangement is drawn in from the sides and stretched taller, and any that
// end up on top of each other (or of the stars, which grow) settle into the
// nearest free spot. When none have been put anywhere, they're spread round
// the orbits (see orbitLayout()); a new one among placed ones takes the
// roomiest free place on the closest orbit. Only when nothing fits are they
// scattered outward along a loose spiral, clear of everything before them.
function scatter(planets, width, inner, m) {
  const tall = inner.ry / inner.rx;
  const half = width / 2 - (m.narrow ? 8 : 28);
  const ax = m.narrow ? 1 : 1.32;
  const ay = m.narrow ? 1 : 0.78;
  const pad = m.gap;
  // a constellation (constellations.js) is laid out as a small planet as tall as its figure
  const sizes = planets.map((p) => (p.shape ? p.shape.h : planetSize(p.count, m.scale)));
  let fx = 1;
  planets.forEach((p, i) => {
    if (!placed(p) || !p.x) return;
    const room = Math.max(0, half - footprint(sizes[i], m, p) / 2);
    fx = Math.min(fx, room / Math.abs(p.x * m.scale));
  });
  const stretch = 1 / Math.sqrt(Math.max(fx, 0.1));
  if (m.narrow) return { ...rows(planets, sizes, width, inner, m), fx, stretch };
  const fr = frameOf(width, m);
  const shape = orbitShape(planets, sizes, inner, m, fr);
  if (planets.length && !planets.some(placed)) {
    const tidy = orbitLayout(planets, sizes, inner, m, fr, shape) || (m.z <= GRID_Z ? gridLayout(planets, sizes, inner, m, fr) : null);
    if (tidy) return { spots: tidy, rects: tidy.map((s) => s.rect), fx, stretch, shape };
  }
  // Cramped: some planet had nowhere on the orbits (draw smaller, if it can).
  let cramped = false;
  const rects = [];
  const spots = planets.map((p, i) => {
    if (!placed(p)) return null;
    const s = sizes[i];
    const room = Math.max(0, half - footprint(s, m, p) / 2);
    const spot = nearestFree({ x: p.x * m.scale * fx, y: p.y * m.scale * stretch }, s, m, rects, inner, room, p);
    rects.push(spot.rect);
    return { ...spot, size: s };
  });
  planets.forEach((p, i) => {
    if (spots[i] || !planets.some(placed)) return;
    const s = sizes[i];
    const open = openSpots(s, footprint(s, m, p), shape, rects, inner, fr, m);
    if (!open.length) return;
    // The closest orbit with room, at its roomiest place.
    const t = Math.min(...open.map((o) => o.ring?.t ?? 1));
    let best = null;
    let most = -1;
    for (const o of open) {
      if (o.ring?.t !== t) continue;
      const room = Math.min(...rects.map((r) => Math.hypot(o.x - (r.x0 + r.x1) / 2, o.y - (r.y0 + r.y1) / 2)), 1e9);
      if (room > most) { most = room; best = o; }
    }
    rects.push(best.rect);
    spots[i] = { x: best.x, y: best.y, rect: best.rect, size: s };
  });
  planets.forEach((p, i) => {
    if (spots[i]) return;
    cramped = true;
    const s = sizes[i];
    const w = footprint(s, m, p);
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
  return { spots, rects, fx, stretch, shape, cramped: cramped && m.z > Z_MIN };
}

// Room kept above and below a galaxy: on a phone the bottom keeps clear of
// the "Universe" button, and the top of a new comment's note (`m.room`, your
// own galaxy only: commentnotes.js says how tall it is).
function pads(m) {
  if (m.narrow) return { top: Math.round(20 * Math.max(m.z, 0.6)) + (m.room || 0), bottom: 64 };
  const pad = Math.round(56 * Math.max(m.z, 0.6));
  return { top: pad, bottom: pad };
}

// On a phone there's no room beside the void, so planets sit in loose rows
// above and below it. Where you've put a planet decides its side and its
// place in the order (top to bottom, then left to right); the rest fill
// whichever side is shorter. Rows spread out to use the screen's height.
function rows(planets, sizes, width, inner, m) {
  const W = width - 16;
  const wide = (i) => footprint(sizes[i], m, planets[i]);
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
  const height = (row) => tall(Math.max(...row.map((i) => sizes[i])));
  const stack = (list) => list.reduce((t, r) => t + height(r) + m.gap, 0);
  const p = pads(m);
  // A galaxy taller than the screen keeps its void on the first screen: only
  // as many rows above it as leave its dust in sight. The rest come just
  // below it, in the same order.
  if (stack(pack(sides.top)) + stack(pack(sides.bottom)) + inner.ry * 2 + p.top + p.bottom > m.viewH) {
    const room = m.viewH - p.top - inner.ry * 2 - p.bottom;
    let k = 0;
    while (k < sides.top.length && stack(pack(sides.top.slice(k))) > room) k++;
    sides.bottom.unshift(...sides.top.splice(0, k));
  }
  const top = pack(sides.top);
  const bottom = pack(sides.bottom);
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
    const { spots, rects, cramped } = scatter(planets, width, inner, m);
    return { spots, cramped, ...extent(rects, inner, viewH, m) };
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
  const ey = Math.max(-top, bottom);
  // On a computer the void keeps to the middle of the screen whenever the
  // planets leave it room to, so it doesn't wander as they're moved.
  const cy = !m.narrow && ey * 2 + pad.top + pad.bottom <= viewH ? viewH / 2 : pad.top - top + (height - content) / 2;
  return { content, height, ex: reach + 12, ey: ey + 12, cy };
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
  if (g.locked) meta.push(h('span', { class: 'uvg-locks' }, icon('lock', 12), `${g.locked} locked`));
  else if (g.open) meta.push(h('span', null, `· ${plural(g.files, 'file')}`));
  else if (g.private) meta.push(h('span', null, '· private'));
  const sys = h('span', { class: 'uvg-sys' }, h('span', { class: 'uvg-center' },
    here ? null : h('span', { class: 'uvg-core', style: { '--r': `${(m.hole * REACH.y * 1.05 * VOID_UV).toFixed(1)}px` } }),
    worlds));
  const el = h('button', {
    type: 'button',
    class: `uvg${g.you ? ' is-you' : ''}${here ? ' is-here' : ''}`,
    dataset: { user: g.username },
    style: { left: `${-ex}px`, top: `${-ey}px`, width: `${ex * 2}px`, height: `${ey * 2}px` },
    'aria-label': g.you ? 'Your galaxy' : `${g.name || `@${g.username}`}’s galaxy`,
  },
  sys,
  h('span', { class: 'uvg-label' },
    h('span', { class: 'uvg-name' }, g.you ? 'You' : g.name || `@${g.username}`),
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
function universeLayout(plans, home, width, viewH, names, near = [], pairs = []) {
  // Names stay one size however far out, so the spacing keeps room for
  // them at the scale the map is drawn at: look for the largest scale at
  // which the map, names and all, still fits the screen.
  const size = width < 640 ? LABEL.narrow : LABEL.wide;
  const at = (k) => spreadUniverse(plans, home, width, viewH, { x: size.x / k, y: size.y / k }, names, near, pairs);
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

// The map: galaxies in loose rows, centred like lines of a poem, with yours
// in the middle of the middle row. The galaxies you visit and save files
// from (`near`, from the server) take the places closest round yours, the
// strongest pull nearest. Galaxies that share files (`pairs`: { i, j, n })
// are then seated beside those they share with (`seat`); everyone else fills
// the places left A to Z in reading order, and sharers are drawn a little
// closer where there's room (`gather`). Each row is as tall as its tallest
// galaxy and its name; the number of rows is whichever fits this screen's
// shape best, so nobody is drawn smaller than they need to be.
function spreadUniverse(plans, home, width, viewH, label, names = [], near = [], pairs = []) {
  const n = plans.length;
  const narrow = width < 640;
  // A phone has little room to spare; a computer keeps space round the map.
  const fill = narrow ? 0.95 : 0.78;
  const room = { x: (width - (narrow ? 120 : 80)) * fill, y: (viewH - (narrow ? 136 : 150)) * fill };
  const wide = (i) => Math.max(plans[i].ex * 2, label.x);
  const tall = (i) => plans[i].ey * 2 + label.y;
  const typical = (f) => plans.map((_, i) => f(i)).sort((a, b) => a - b)[n >> 1] || 0;
  const gx = typical(wide) * 0.28;
  const gy = typical((i) => plans[i].ey * 2) * 0.22;
  const others = plans.map((_, i) => i).filter((i) => i !== home)
    .sort((a, b) => String(names[a] || '').localeCompare(String(names[b] || '')) || a - b);
  const pull = (i) => near[i] || 0;
  const close = others.filter((i) => pull(i) > 0).sort((a, b) => pull(b) - pull(a));
  // Where each galaxy in the rows sits on the map.
  const place = (grid) => {
    const spots = plans.map(() => ({ x: 0, y: 0 }));
    let y = -(grid.reduce((t, row) => t + Math.max(...row.map(tall)), 0) + gy * (grid.length - 1)) / 2;
    for (const row of grid) {
      const top = Math.max(...row.map((i) => plans[i].ey));
      const W = row.reduce((t, i) => t + wide(i), 0) + gx * (row.length - 1);
      let x = -W / 2;
      for (const i of row) {
        spots[i] = { x: x + wide(i) / 2, y: y + top };
        x += wide(i) + gx;
      }
      y += Math.max(...row.map(tall)) + gy;
    }
    return spots;
  };
  // Rows of `per` galaxies, yours in the middle one.
  const build = (per) => {
    const count = Math.ceil(n / per);
    const sizes = Array.from({ length: count }, (_, r) => (r < count - 1 ? per : n - per * (count - 1)));
    const mid = (count - 1) >> 1;
    const grid = sizes.map((len, r) => Array.from({ length: len }, (_, c) => (r === mid && c === (len - 1) >> 1 ? home : null)));
    const queue = others.slice();
    if (close.length) {
      // The places nearest yours on the map go to the strongest pulls
      // (measured with everyone seated A to Z, since a place's spot depends
      // on the galaxies in its row).
      const cells = [];
      grid.forEach((row, r) => row.forEach((v, c) => { if (v == null) cells.push({ r, c }); }));
      others.forEach((g, i) => { grid[cells[i].r][cells[i].c] = g; });
      const spots = place(grid);
      const at = spots[home];
      const far = (cell) => { const s = spots[grid[cell.r][cell.c]]; return Math.hypot(s.x - at.x, s.y - at.y); };
      const order = cells.map((cell, i) => ({ i, d: far(cell) })).sort((a, b) => a.d - b.d || a.i - b.i);
      cells.forEach((cell) => { grid[cell.r][cell.c] = null; });
      close.forEach((g, j) => { const cell = cells[order[j].i]; grid[cell.r][cell.c] = g; queue.splice(queue.indexOf(g), 1); });
    }
    seat(grid, queue, home, pairs);
    for (const row of grid) row.forEach((v, c) => { if (v == null) row[c] = queue.shift(); });
    return grid;
  };
  const measure = (grid) => {
    const W = Math.max(...grid.map((row) => row.reduce((t, i) => t + wide(i), 0) + gx * (row.length - 1)));
    const H = grid.reduce((t, row) => t + Math.max(...row.map(tall)), 0) + gy * (grid.length - 1);
    return { W, H, k: Math.min(room.x / W, room.y / H) };
  };
  let grid = [[home]];
  let size = measure(grid);
  for (let per = 1; per <= n; per++) {
    const g = build(per);
    const s = measure(g);
    if (per === 1 || s.k > size.k * 1.001) { grid = g; size = s; }
  }
  const spots = place(grid);
  gather(spots, pairs, home, (i) => ({ w: wide(i), top: plans[i].ey, bottom: plans[i].ey + label.y }), Math.min(gx, gy) * 0.5);
  // Fit the whole map, centred below the heading, with room round it for
  // the names, which stay one size however far out.
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  spots.forEach((s, i) => {
    const half = Math.max(plans[i].ex, label.x / 2);
    x0 = Math.min(x0, s.x - half); x1 = Math.max(x1, s.x + half);
    y0 = Math.min(y0, s.y - plans[i].ey); y1 = Math.max(y1, s.y + plans[i].ey + label.y);
  });
  const k = clamp(Math.min(room.x / (x1 - x0), room.y / (y1 - y0)), K_MIN, K_MAX);
  const mid = { x: width / 2 - k * (x0 + x1) / 2, y: viewH / 2 + 10 - k * (y0 + y1) / 2 };
  return { spots, k, mid };
}

// Galaxies that share files sit side by side. Starting from yours, the one
// sharing most with those already seated takes the free place nearest them
// (weighted by how much they share); a group that shares nothing with yours
// starts at the first free place in reading order. Taken from `queue`, so the
// rest still fill in A to Z.
function seat(grid, queue, home, pairs) {
  if (!pairs.length) return;
  const at = new Map();
  grid.forEach((row, r) => row.forEach((v, c) => { if (v != null) at.set(v, { r, c }); }));
  const pos = ({ r, c }) => ({ x: c - (grid[r].length - 1) / 2, y: r });
  const share = (i) => pairs.filter((p) => p.i === i || p.j === i).map((p) => ({ other: p.i === i ? p.j : p.i, n: p.n }));
  const free = () => grid.flatMap((row, r) => row.map((v, c) => (v == null ? { r, c } : null))).filter(Boolean);
  const linked = queue.filter((i) => i !== home && share(i).length);
  while (linked.length) {
    // the one that shares most with those already seated (A to Z on a tie: `linked` keeps that order)
    let best = 0;
    let most = -1;
    linked.forEach((i, k) => {
      const n = share(i).reduce((t, s) => t + (at.has(s.other) ? s.n : 0), 0);
      if (n > most) { most = n; best = k; }
    });
    const i = linked.splice(best, 1)[0];
    const spots = free();
    if (!spots.length) break;
    let cell = spots[0];
    if (most > 0) {
      let cost = Infinity;
      for (const f of spots) {
        const p = pos(f);
        const d = share(i).reduce((t, s) => {
          const o = at.get(s.other);
          return o ? t + s.n * Math.hypot(p.x - pos(o).x, p.y - pos(o).y) : t;
        }, 0);
        if (d < cost - 1e-6) { cost = d; cell = f; }
      }
    }
    grid[cell.r][cell.c] = i;
    at.set(i, cell);
    queue.splice(queue.indexOf(i), 1);
  }
}

// Then each pair is drawn a little closer, a few times over, as long as it
// lands clear of every other galaxy and its name. Yours stays put, so the
// map is the same wherever you zoom out from.
function gather(spots, pairs, home, box, pad) {
  const rect = (i, s = spots[i]) => {
    const b = box(i);
    return { x0: s.x - b.w / 2, x1: s.x + b.w / 2, y0: s.y - b.top, y1: s.y + b.bottom };
  };
  const clearOf = (i, s) => spots.every((_, j) => j === i || !overlaps(rect(i, s), rect(j), pad));
  for (let round = 0; round < 4; round++) {
    for (const { i, j, n } of pairs) {
      const a = spots[i];
      const b = spots[j];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < 1) continue;
      // the more they share, the closer (up to a fifth of the way each round)
      const pull = d * Math.min(0.2, 0.08 + 0.03 * n);
      const ux = (b.x - a.x) / d;
      const uy = (b.y - a.y) / d;
      for (const [k, dir] of [[i, 1], [j, -1]]) {
        if (k === home) continue;
        const share = i === home || j === home ? 1 : 0.5;
        const next = { x: spots[k].x + ux * pull * share * dir, y: spots[k].y + uy * pull * share * dir };
        if (clearOf(k, next)) spots[k] = next;
      }
    }
  }
}

// ---------------------------------------------------------------- threads

// A thread between two planets that share files: a gentle curve that bows
// away from the void (so it never crosses it), from the edge of one globe to
// the edge of the other. `a` and `b` are { x, y, r } in the scene; `v` is the
// void's middle and `inner` the oval round it that planets keep clear of.
const THREAD_GAP = 6;
// How strong the wisps' dots are, dimmest to brightest (the dots, never their size, make it brighter)
const WISP_SHADES = [0.1, 0.2, 0.34, 0.52];
const THREAD_NOTE = 20;
function threadCurve(a, b, v, inner, frame) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < a.r + b.r + THREAD_GAP * 3) return null;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // How far to bow toward one side (sign 1 or -1) before the curve's middle (halfway to its
  // control point) clears the void, kept inside the page; `clear` says whether it got there.
  const bow = (sign) => {
    const nx = (-dy / len) * sign;
    const ny = (dx / len) * sign;
    const at = (bend) => ({ x: mx + (nx * bend) / 2, y: my + (ny * bend) / 2 });
    const free = (q) => ((q.x - v.x) / inner.rx) ** 2 + ((q.y - v.y) / inner.ry) ** 2 >= 1.15;
    const inside = (q) => q.x >= frame.x0 && q.x <= frame.x1 && q.y >= frame.y0 && q.y <= frame.y1;
    let bend = len * 0.14;
    for (let i = 0; i < 40 && !free(at(bend)); i++) {
      if (!inside(at(bend + len * 0.06))) break;
      bend += len * 0.06;
    }
    return { nx, ny, bend, clear: free(at(bend)) };
  };
  // the side that clears the void with the least bow; one that can't (a planet above the void
  // and one below it on a phone) passes behind the void, which is drawn over the threads
  const sides = [bow(1), bow(-1)].sort((p, q) => (q.clear - p.clear) || (p.bend - q.bend));
  const { nx, ny, bend } = sides[0];
  const c = { x: mx + nx * bend, y: my + ny * bend };
  const edge = (p) => {
    const ux = c.x - p.x;
    const uy = c.y - p.y;
    const l = Math.hypot(ux, uy) || 1;
    return { x: p.x + (ux / l) * (p.r + THREAD_GAP), y: p.y + (uy / l) * (p.r + THREAD_GAP) };
  };
  const s = edge(a);
  const e = edge(b);
  // the count sits just off the curve's middle, on the outside of the bow, clear of its dots
  return { s, c, e, mid: { x: (s.x + 2 * c.x + e.x) / 4 + nx * THREAD_NOTE, y: (s.y + 2 * c.y + e.y) / 4 + ny * THREAD_NOTE } };
}

// ---------------------------------------------------------------- the page

class Galaxy {
  constructor(data, list, links = []) {
    this.data = data;
    this.mine = !!data.user.you;
    this.owner = data.user.username;
    this.ownerName = data.user.name || null;   // the name they gave, if any
    this.planetEls = new Map();
    this.stars = data.stars || [];
    this.showAll = false;
    this.list = list || [ownEntry(data)];
    // Galaxies that share files ({ a, b, n } by username): drawn closer, with a thread between.
    this.links = links;
    // Already here when the page opens out in the universe.
    this.uvLoading = list ? Promise.resolve() : null;
    this.off = [];
    this.p = 0;

    // ------------------------------------------------------------ the galaxy
    this.field = h('div', { class: 'gx-field' });
    this.starsEl = h('div', { class: 'gx-stars', 'aria-label': 'Stars' });
    // Constellations: stars joined in your sky (only on your own galaxy, like the stars).
    this.sky = this.mine ? new Sky(this, data.constellations) : null;
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
      this.void = stillVoid(this.ownerName || `@${this.owner}`);
    }
    this.coreEl = this.void.el;
    this.art = h('div', { class: 'gx-art' }, this.void.art);
    this.coreWrap = h('div', { class: 'gx-core' }, this.sky?.el, this.starsEl, this.coreEl);
    this.hint = h('p', { class: 'gx-hint' });
    // While you move a planet: the orbit it will land on, and where.
    this.guide = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.guide.setAttribute('class', 'gx-guide');
    this.guide.setAttribute('aria-hidden', 'true');
    this.guidePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.guide.append(this.guidePath);
    this.ghost = h('div', { class: 'gx-ghost', 'aria-hidden': 'true' });
    // Threads between planets that share files, behind the planets, and how
    // many files each one carries (shown while a planet at one end is pointed at).
    this.threadsEl = h('canvas', { class: 'gx-threads', width: 0, height: 0, 'aria-hidden': 'true' });
    this.threadNotes = h('div', { class: 'gx-thread-notes', 'aria-hidden': 'true' });
    this.threadEls = new Map();
    this.scene = h('div', { class: 'gx-scene' }, this.threadsEl, this.art, this.guide, this.ghost, this.field, this.threadNotes, this.coreWrap, this.hint);
    const lightFrom = (e) => this.lightThreads(e.target.closest?.('.planet')?.planet?.id || null);
    this.field.addEventListener('pointerover', lightFrom);
    this.field.addEventListener('focusin', lightFrom);
    this.field.addEventListener('pointerleave', () => this.lightThreads(null));
    this.field.addEventListener('focusout', (e) => { if (!this.field.contains(e.relatedTarget)) this.lightThreads(null); });
    this.stage = h('section', { class: 'gx', 'aria-label': this.mine ? 'Your galaxy' : `${this.shownName()}’s galaxy` }, this.scene);
    this.pointer = null;
    this.stage.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') this.nearStars({ x: e.clientX, y: e.clientY }); });
    this.stage.addEventListener('pointerleave', () => this.nearStars(null));

    // ------------------------------------------------------------ the universe below
    this.uvField = h('div', { class: 'uv-field' });
    this.uvScene = h('div', { class: 'uv-scene' }, this.uvField);
    this.uvNear = h('div', { class: 'uv-near' });
    this.uvStage = h('section', { class: 'uv-stage', 'aria-label': 'Universe' },
      // The bar already says "Universe", so the page doesn't say it again.
      h('header', { class: 'uv-head' },
        h('p', { class: 'uv-sub' }, 'Everyone’s galaxies. Open one to look around.')),
      this.uvScene, this.uvNear);
    // The cosmic web, far behind everything.
    // the web's picture and the beads that travel it share one box, so they move as one
    this.webCanvas = h('canvas');
    this.webBeads = h('span', { class: 'uv-beads' });
    this.web = h('div', { class: 'uv-web', 'aria-hidden': 'true' }, this.webCanvas, this.webBeads);
    this.webLayer = h('div', { class: 'uv-web-layer' }, this.web);
    this.near = [];
    this.runway = h('div', { class: 'uv-runway' }, this.uvStage);
    this.cue = h('button', { type: 'button', class: 'gx-cue', onclick: () => this.goOut() }, h('span', null, 'Universe'), icon('down', 12));
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
      const now = performance.now();
      // how fast the page is being scrolled, in pixels a millisecond (0 for the page's own jump)
      const speed = this.carried ? 0 : Math.abs(scrollY - this.lastY) / Math.max(1, now - (this.scrolledAt || now - 16));
      this.scrolledAt = now;
      if (scrollY !== this.lastY && !this.carried) this.heading = scrollY > this.lastY ? 1 : -1;
      this.carried = false;
      this.lastY = scrollY;
      cancelAnimationFrame(this.scrollFrame);
      this.scrollFrame = requestAnimationFrame(() => this.track());
      clearTimeout(this.snapTimer);
      // Well on your way and slowing to a crawl (a trackpad's glide running out): it carries you the
      // rest now, without first coming to a stop. Otherwise it waits to see you have let go.
      const p = this.goalNow();
      const onward = this.heading > 0 ? p > 0.4 : p < 0.6;
      this.crawl = onward && speed < CRAWL ? (this.crawl || 0) + 1 : 0;
      if (this.crawl >= 3) this.snap();
      else this.snapTimer = setTimeout(() => this.snap(), onward ? LET_GO : LET_GO_BACK);
    };
    if (this.mine) this.listen();
  }

  // ------------------------------------------------------------ planets

  addPlanet(planet, { born = false } = {}) {
    const el = planetEl(planet, { orbit: true });
    el.body.dataset.vt = `planet-${planet.id}`;
    if (planet.private) {
      el.addEventListener('click', (e) => { e.preventDefault(); toast(`${this.fullName()} keeps this planet private.`); });
    }
    else if (planet.locked) {
      el.addEventListener('click', (e) => { e.preventDefault(); this.unlock(el.planet); });
    }
    else if (this.mine) this.makeMovable(el);
    if (!planet.private && !planet.locked) {
      // Right-click: what you can do with this planet. Its kind, colour, a moon and deleting it are
      // done on its own page, so those open it and carry on there (askThen in views/planet.js).
      el.addEventListener('contextmenu', (e) => {
        if (document.body.classList.contains('is-carrying') || el.classList.contains('is-moving') || this.p > 0.02) return;
        const now = el.planet;
        const open = () => nav.go(`/p/${now.id}`);
        const there = (what) => () => { askThen(now.id, what); open(); };
        openContextMenu(e, [
          { icon: 'open', label: 'Open', run: open },
          ...(this.mine ? [
            { icon: 'planet', label: 'Planet type…', run: there('look') },
            { icon: 'colour', label: 'Planet colour…', run: there('colour') },
            (now.moons || []).length < 8 ? { icon: 'moon', label: 'Add a moon…', run: there('moon') } : null,
            '-',
            { icon: 'trash', label: 'Delete planet…', danger: true, run: there('remove') },
          ] : []),
        ], { title: now.title, target: el });
      });
    }
    this.planetEls.set(planet.id, el);
    this.field.append(el);
    if (born && !reducedMotion()) {
      el.body.animate([
        { transform: 'scale(0.2)', opacity: 0 },
        { transform: 'none', opacity: 1 },
      ], { duration: DUR.scene, easing: EASE });
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
    let open = [];
    let snap = null;
    let swap = null;   // the planet under the one being carried: let go there and the two change places
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
        snap = null;
        swap = null;
        open = this.m.narrow ? [] : this.openFor(el.planet);
        el.classList.add('is-moving');
        this.followThreads();
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
        // Carried over another planet: the two will change places. Its place is shown as the
        // landing spot, and it lights as a planet does when something is about to land on it.
        const over = this.planetOver(el.planet, at);
        if (over !== swap) {
          this.planetEls.get(swap?.id)?.classList.remove('is-target');
          swap = over;
          this.planetEls.get(swap?.id)?.classList.add('is-target');
          snap = null;
          if (swap) this.showGuide(this.spots.get(swap.id), planetSize(el.planet.count, this.m.scale));
          else if (!open.length) this.hideGuide();
        }
        if (!swap && open.length) {
          const next = snapTo(open, at);
          if (next !== snap) this.showGuide((snap = next), planetSize(el.planet.count, this.m.scale));
        }
      },
      onEnd: (pointer, cancelled) => {
        this.hideGuide();
        const other = swap;
        this.planetEls.get(other?.id)?.classList.remove('is-target');
        swap = null;
        if (cancelled) { el.classList.remove('is-moving'); this.layout(); return; }
        if (other) { this.place(el.planet, this.spots.get(other.id), el, true, { planet: other, at: this.spots.get(el.planet.id) }); return; }
        if (snap) this.place(el.planet, snap, el, true);
        else this.place(el.planet, at, el);
      },
    });
    el.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!e.shiftKey || !step || this.p > 0.02) return;
      e.preventDefault();
      const spot = this.spots.get(el.planet.id);
      if (!spot) return;
      if (this.m.narrow) { this.place(el.planet, { x: spot.x + step[0] * 24, y: spot.y + step[1] * 24 }); return; }
      // The next place along on the orbits that way.
      let best = null;
      let far = Infinity;
      for (const o of this.openFor(el.planet)) {
        const dx = o.x - spot.x;
        const dy = o.y - spot.y;
        const along = dx * step[0] + dy * step[1];
        const d = along + Math.abs(dx * step[1] - dy * step[0]) * 2;
        if (along > 12 && d < far) { far = d; best = o; }
      }
      if (best) this.place(el.planet, best, null, true);
    });
  }

  // The planet the one being carried is over, if any: its middle is within the other's globe.
  planetOver(planet, at) {
    let best = null;
    let near = Infinity;
    for (const p of this.data.planets) {
      const spot = this.spots.get(p.id);
      if (p.id === planet.id || !spot || p.private) continue;
      const d = Math.hypot(spot.x - at.x, spot.y - at.y);
      if (d < (spot.size || planetSize(p.count, this.m.scale)) * 0.5 && d < near) { near = d; best = p; }
    }
    return best;
  }

  // Where a planet you're holding could go: the free places on the orbits,
  // across the void from the others, and where it was.
  openFor(planet) {
    const m = this.m;
    const s = planetSize(planet.count, m.scale);
    const others = [...this.spots].filter(([id, spot]) => id !== planet.id && spot).map(([, spot]) => spot);
    const p = pads(m);
    const half = this.size.width / 2 - 28;
    const fr = { x0: -half, x1: half, y0: -this.size.cy + p.top, y1: this.size.height - this.size.cy - p.bottom };
    const list = openSpots(s, footprint(s, m, planet), this.shape, others.map((o) => o.rect), this.inner, fr, m, others);
    const here = this.spots.get(planet.id);
    if (here) list.push({ x: here.x, y: here.y, rect: here.rect, here: true });
    return list;
  }

  showGuide(spot, s) {
    const { cx, cy, width, height } = this.size;
    // It appears where it lands, then slides between places.
    const first = !this.ghost.classList.contains('is-on');
    if (first) this.ghost.style.transition = `opacity ${DUR.change}ms`;
    Object.assign(this.ghost.style, { width: `${s}px`, height: `${s}px`, transform: `translate(${(cx + spot.x - s / 2).toFixed(1)}px, ${(cy + spot.y - s / 2).toFixed(1)}px)` });
    this.ghost.classList.add('is-on');
    if (first) requestAnimationFrame(() => { this.ghost.style.transition = ''; });
    this.guide.setAttribute('viewBox', `0 0 ${width} ${height}`);
    if (spot.ring) {
      // Drawn through the planets' globes, which sit above their middles.
      const pts = spot.ring.pts.filter((_, k) => k % 4 === 0);
      this.guidePath.setAttribute('d', `M${pts.map((pt) => `${(cx + pt.x).toFixed(1)} ${(cy + pt.y - LIFT).toFixed(1)}`).join('L')}Z`);
      this.guide.classList.add('is-on');
    } else this.guide.classList.remove('is-on');
  }

  hideGuide() {
    this.ghost.classList.remove('is-on');
    this.guide.classList.remove('is-on');
  }

  // Where a planet dropped at `at` ends up: there, or the nearest free spot.
  freeSpot(planet, at) {
    const m = this.m;
    const s = planetSize(planet.count, m.scale);
    const room = Math.max(0, this.size.width / 2 - (m.narrow ? 8 : 28) - footprint(s, m, planet) / 2);
    const others = [...this.spots].filter(([id, spot]) => id !== planet.id && spot).map(([, spot]) => spot.rect);
    return nearestFree(at, s, m, others, this.inner, room, planet);
  }

  // Put a planet down and remember where. The first time, every planet's
  // spot is saved, so none of the others wander off later.
  // `also` moves a second planet in the same go ({ planet, at }): two planets changing places.
  async place(planet, at, el = null, exact = false, also = null) {
    const spot = exact ? at : this.freeSpot(planet, at);
    const going = new Map([[planet.id, spot]]);
    if (also?.at) going.set(also.planet.id, also.at);
    const unit = (x, y) => ({ x: Math.round((x / (this.m.scale * this.fx)) * 10) / 10, y: Math.round((y / (this.m.scale * this.stretch)) * 10) / 10 });
    const first = !this.data.planets.some(placed);
    const list = first
      ? this.data.planets.map((p) => {
        const s = going.get(p.id) || this.spots.get(p.id);
        return { id: p.id, ...unit(s.x, s.y) };
      })
      : [...going].map(([id, s]) => ({ id, ...unit(s.x, s.y) }));
    const before = new Map(this.data.planets.map((p) => [p.id, { x: p.x, y: p.y }]));
    for (const s of list) {
      const p = this.data.planets.find((q) => q.id === s.id);
      if (p) Object.assign(p, { x: s.x, y: s.y });
    }
    el?.classList.remove('is-moving');
    // Arranging never resizes the galaxy under you.
    this.held = { z: this.m.z, width: this.size.width, viewH: this.size.viewH };
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
    const held = this.held;
    const hold = held && held.width === width && held.viewH === viewH && this.data.planets.every(placed) ? held.z : 0;
    if (!hold) this.held = null;
    this.laidRoom = this.mine ? this.notesRoom || 0 : 0;
    const { m, starAt, inner, figs, spots, fx, stretch, shape, ...home } = fitted(width, viewH, (m) => {
      m.room = this.laidRoom;
      const { spots: starAt, outer } = starSpots([...this.starsEl.children].filter((el) => !this.sky?.has(el.dataset.id)).length, m, width);
      // Planets keep clear of the dust and of the stars caught in it. The
      // dust fades out well before its edge, so they may sit on its rim.
      const gap = m.narrow ? 10 : 18;
      const inner = { rx: Math.max(outer.x, m.rx * 0.72) + gap, ry: Math.max(outer.y, m.ry * 0.72) + gap };
      const figs = this.sky ? this.sky.items(m, width) : [];
      const laid = scatter(figs.length ? [...this.data.planets, ...figs] : this.data.planets, width, inner, m);
      return { starAt, inner, figs, ...laid, ...extent(laid.rects, inner, viewH, m) };
    }, hold);
    this.m = m;
    this.shape = shape;
    this.inner = inner;
    this.fx = fx;
    this.stretch = stretch;
    this.spots = new Map(this.data.planets.map((p, i) => [p.id, spots[i]]));
    // a constellation's place is kept with the planets', so a planet being moved keeps clear of it
    const figSpots = spots.slice(this.data.planets.length);
    figs.forEach((f, i) => this.spots.set(f.id, figSpots[i]));

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
    const inFig = this.sky ? this.sky.place(figs, figSpots) : new Map();
    let loose = 0;
    const els = [...this.starsEl.children];
    const ats = els.map((el) => (this.sky?.of.get(el.dataset.id) ? inFig.get(el.dataset.id) : starAt[loose++]));
    // Each star is lit from the void (--out: the way away from it), dimmer
    // further out (--near), and tilted a little, always the same way for the same file.
    const reach = ats.map((at) => (at ? Math.hypot(at.x, at.y) : 0));
    const shownAt = reach.filter((r, i) => ats[i]);
    const lo = Math.min(...shownAt), span = Math.max(...shownAt) - lo || 1;
    els.forEach((el, i) => {
      const sky = this.sky?.of.get(el.dataset.id);
      const at = ats[i];
      el.at = at;
      if (sky) el.setAttribute('aria-description', `In the constellation ${sky.title}`);
      else el.removeAttribute('aria-description');
      if (!at) return;
      el.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`;
      el.style.setProperty('--near', (1 - (reach[i] - lo) / span).toFixed(2));
      el.style.setProperty('--out', `${(Math.atan2(at.x, -at.y) * 180 / Math.PI).toFixed(0)}deg`);
      if (el.block) el.style.setProperty('--tilt', `${((seeded(el.block.id)() - 0.5) * 18).toFixed(1)}deg`);
    });
    this.nearStars(this.pointer);

    this.starsEl.style.setProperty('--chip', `${m.chip}px`);
    this.found?.place();

    // The runway below: how far you scroll to get out to the universe.
    this.travel = Math.round(Math.max(1000, viewH * 2.2));
    this.runway.style.height = `${this.travel + viewH}px`;
    this.runway.style.marginTop = `${-viewH}px`;
    this.uvStage.style.height = `${viewH}px`;
    this.placeUniverse(width, viewH, m, home);
    this.track(true);
    // Threads follow the planets as they glide to their new places.
    this.followThreads(this.scene.classList.contains('is-live') ? DUR.scene + DUR.quick : 0);
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
      this.hint.textContent = `${this.fullName()} hasn’t shared any planets yet.`;
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
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.change, easing: EASE_LEAVE })
        .finished.then(() => el.remove(), () => el.remove());
    }
    if (this.mine) {
      this.stars = data.stars;
      this.sky?.set(data.constellations);
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

  // A locked planet opens with its own code, which its owner gives out
  // (never their sign-in code). Their other planets with the same code open too.
  // Someone's own name, if they gave one; else their @username.
  shownName() { return this.ownerName || `@${this.owner}`; }
  // On their own in a sentence: "Bob Ray (@bob)".
  fullName() { return personLabel(this.owner, this.ownerName); }

  async unlock(planet, owner = this.owner) {
    const shown = owner === this.owner ? this.fullName() : `@${owner}`;
    if (!planet.hasCode) { toast(`${shown} hasn’t given this planet a code yet.`); return; }
    const msg = h('p', { class: 'dialog-msg' });
    const field = pinField({
      autocomplete: 'off',
      label: 'Planet code',
      onComplete: async (pin) => {
        msg.textContent = '';
        field.state('busy');
        try {
          const data = await api.post(`/api/galaxy/${encodeURIComponent(owner)}/unlock`, { pin, drawer: planet.id });
          field.state('ok');
          await wait(380);
          dialog.close();
          const opened = new Set(data.opened || []);
          for (const el of this.planetEls.values()) if (opened.has(el.planet.id)) el.classList.add('is-thawing');
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
      title: `“${planet.title}” is locked`,
      className: 'dialog-code',
      body: h('div', { class: 'pin-dialog' }, h('p', { class: 'dialog-text' }, `Enter the code ${shown} gave you. It stays open for you for 12 hours.`), field.el, msg),
    });
    setTimeout(() => field.focus(), 60);
  }

  // ------------------------------------------------------------ threads

  // Where a planet is drawn right now (mid-glide, or being carried), in the scene.
  planetAt(id) {
    const el = this.planetEls.get(id);
    const spot = this.spots?.get(id);
    if (!el || !spot) return null;
    const t = getComputedStyle(el).transform;
    const m = t && t !== 'none' ? new DOMMatrixReadOnly(t) : null;
    return { x: m ? m.e : this.size.cx + spot.x, y: m ? m.f : this.size.cy + spot.y, r: (spot.size || el.offsetWidth) / 2 };
  }

  // Wisps of print between planets that share files: faint at rest, brighter
  // while a planet at one end is pointed at (DESIGN.md "Threads").
  drawThreads() {
    if (!this.size || !this.spots) return;
    const { width, height, cx, cy } = this.size;
    const wanted = new Set();
    const told = new Map();
    this.threadCurves = [];
    for (const t of this.data.threads || []) {
      const a = this.planetAt(t.a);
      const b = this.planetAt(t.b);
      if (!a || !b) continue;
      const key = `${t.a}:${t.b}`;
      const curve = threadCurve(a, b, { x: cx, y: cy }, this.inner, { x0: 12, x1: width - 12, y0: 12, y1: height - 12 });
      if (!curve) continue;
      wanted.add(key);
      this.threadCurves.push({ key, t, curve });
      let note = this.threadEls.get(key);
      if (!note) {
        note = h('span', { class: 'gx-thread-note' });
        this.threadEls.set(key, note);
        this.threadNotes.append(note);
      }
      // (this runs every picture while planets glide: only what changed is written)
      if (note.dataset.a !== t.a) note.dataset.a = t.a;
      if (note.dataset.b !== t.b) note.dataset.b = t.b;
      const says = plural(t.n, 'file');
      if (note.textContent !== says) note.textContent = says;
      note.classList.toggle('is-on', !!this.litId && (t.a === this.litId || t.b === this.litId));
      const move = `translate(${curve.mid.x.toFixed(1)}px, ${curve.mid.y.toFixed(1)}px)`;
      if (note.style.transform !== move) note.style.transform = move;
      for (const [me, other] of [[t.a, t.b], [t.b, t.a]]) {
        const name = this.data.planets.find((p) => p.id === other)?.title;
        if (name) told.set(me, [...(told.get(me) || []), `${plural(t.n, 'file')} with ${name}`]);
      }
    }
    for (const [key, note] of this.threadEls) {
      if (wanted.has(key)) continue;
      note.remove();
      this.threadEls.delete(key);
    }
    // Said to a screen reader on the planet itself, since the threads are only painted.
    for (const [id, el] of this.planetEls) {
      const says = told.get(id);
      const text = says ? `Shares ${says.join(', ')}` : null;
      if (el.getAttribute('aria-description') === text) continue;
      if (text) el.setAttribute('aria-description', text);
      else el.removeAttribute('aria-description');
    }
    // the wisps are painted again only when an end has moved
    const at = this.threadCurves.map(({ curve }) => `${curve.s.x.toFixed(1)},${curve.s.y.toFixed(1)},${curve.e.x.toFixed(1)},${curve.e.y.toFixed(1)}`).join(' ');
    const still = at === this.threadsAt;
    this.threadsAt = at;
    if (!still) this.paintThreads();
    return !still;
  }

  // The wisps, on one canvas only as big as they reach (DESIGN.md "What Mutt may cost").
  // Each is laid out from its own seed, so it is the same wisp however its planets move.
  paintThreads() {
    const canvas = this.threadsEl;
    const list = this.threadCurves || [];
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const { curve } of list) {
      for (const p of [curve.s, curve.c, curve.e]) {
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
    }
    if (!list.length) { canvas.width = canvas.height = 0; return; }
    const pad = 24;
    x0 = Math.floor(x0 - pad); y0 = Math.floor(y0 - pad);
    const W = Math.ceil(x1 + pad) - x0;
    const H = Math.ceil(y1 + pad) - y0;
    const dpr = sharpness();
    const pw = Math.round(W * dpr);
    const ph = Math.round(H * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    Object.assign(canvas.style, { left: `${x0}px`, top: `${y0}px`, width: `${W}px`, height: `${H}px` });
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
    ctx.clearRect(x0, y0, W, H);
    const root = getComputedStyle(document.documentElement);
    const ink = { rest: root.getPropertyValue('--thread').trim(), lit: root.getPropertyValue('--thread-on').trim() };
    const size = 1 / dpr + 0.35;
    for (const { key, t, curve } of list) {
      const lit = !!this.litId && (t.a === this.litId || t.b === this.litId);
      const buckets = WISP_SHADES.map(() => []);
      wisp((x, y, b) => buckets[Math.max(0, Math.min(WISP_SHADES.length - 1, Math.round(b * (WISP_SHADES.length - 1))))].push(x, y),
        seeded(`thread:${key}`), curve.s, curve.c, curve.e,
        { strands: t.n >= 4 ? 4 : 3, width: 1.8 + Math.min(1.6, t.n * 0.35), spread: 7 + Math.min(6, t.n * 1.5), haze: 0.7 });
      ctx.fillStyle = lit ? ink.lit : ink.rest;
      buckets.forEach((pts, b) => {
        ctx.globalAlpha = Math.min(1, WISP_SHADES[b] * (lit ? 1.8 : 1));
        for (let n = 0; n < pts.length; n += 2) ctx.fillRect(pts[n], pts[n + 1], size, size);
      });
    }
    ctx.globalAlpha = 1;
  }

  // Redraw the threads now, and every picture for `ms` (planets gliding) or
  // while a planet is being carried. Nothing runs when nothing moves.
  followThreads(ms = 0) {
    cancelAnimationFrame(this.threadFrame);
    if (!(this.data.threads || []).length && !this.threadEls.size) return;
    const start = performance.now();
    const until = start + ms;
    let calm = 0;
    this.threadsAt = null;
    const tick = () => {
      if (!this.el.isConnected) return;
      // a few pictures with no planet moved and nothing carried: they have landed
      // (a glide starts slowly, so only after its first moments)
      calm = this.drawThreads() || performance.now() - start < DUR.quick ? 0 : calm + 1;
      const carried = this.field.querySelector('.planet.is-moving');
      if (carried || (performance.now() < until && calm < 3)) this.threadFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  lightThreads(id) {
    if (id === this.litId) return;
    this.litId = id;
    for (const note of this.threadEls.values()) note.classList.toggle('is-on', !!id && (note.dataset.a === id || note.dataset.b === id));
    this.paintThreads();
  }

  // ------------------------------------------------------------ stars

  shownStars() {
    const cap = innerWidth < 640 ? STAR_CAP_PHONE : STAR_CAP;
    return this.showAll || this.stars.length <= cap ? this.stars : this.stars.slice(0, cap - 1);
  }

  // With a mouse, stars rest as points of light and open into their cards as
  // the pointer comes near: within three chips, and back to a point past four.
  nearStars(at) {
    this.pointer = at;
    if (this.nearFrame) return;
    this.nearFrame = requestAnimationFrame(() => {
      this.nearFrame = 0;
      const at = this.pointer;
      const carrying = document.body.classList.contains('is-carrying');
      // (out towards the universe the galaxy is shrunk, and they all rest)
      const o = at && !carrying && this.p < 0.02 ? this.starsEl.getBoundingClientRect() : null;
      const chip = this.m?.chip || 38;
      for (const el of this.starsEl.children) {
        let near = false;
        if (o && el.at) {
          const d = Math.hypot(at.x - o.left - el.at.x, at.y - o.top - el.at.y);
          near = d < chip * (el.classList.contains('is-near') ? 4 : 3);
        }
        if (near !== el.classList.contains('is-near')) el.classList.toggle('is-near', near);
      }
    });
  }

  starEl(block) {
    const label = starTitle(block);
    const el = h('button', {
      type: 'button', class: 'star', 'aria-label': `${label} (star)`,
      dataset: { id: block.id, kind: block.kind, tip: label, tipNow: '', tipAt: 'above' },
    }, fileFace(block));
    el.block = block;
    el.addEventListener('click', () => nav.openBlock(block.id));
    el.addEventListener('contextmenu', (e) => {
      if (document.body.classList.contains('is-carrying')) return;
      blockContextMenu(e, el, el.block, { open: () => nav.openBlock(block.id), extra: this.skyItems(el.block) });
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'm' || (e.key === 'Enter' && e.shiftKey)) { e.preventDefault(); openConnect(el, el.block); }
    });
    draggable(el, {
      ghost: () => h('div', { class: 'star-ghost' }, fileFace(el.block)),
      targets: () => this.targets(el.block),
      onDrop: (target, ghost) => this.dropStar(el.block, target, ghost),
      // let go in the open sky, a star in a constellation leaves it
      onLoose: (ghost) => this.sky?.has(el.block.id) && this.looseStar(el.block, ghost),
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

  targets(carried = null) {
    const list = [];
    // Another star: the two join into a constellation (constellations.js).
    if (carried && this.sky) {
      for (const el of this.starsEl.querySelectorAll('.star[data-id]')) {
        const id = el.dataset.id;
        if (id === carried.id) continue;
        list.push({
          kind: 'star', id, el, reach: 8,
          measure: () => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; },
          onHover: (on) => this.joinLabel(on ? el : null, on ? this.sky.joinWords(carried.id, id) : null),
        });
      }
    }
    for (const [id, el] of this.planetEls) {
      if (el.planet.locked) continue;
      list.push({ kind: 'planet', id, el, measure: () => el.center() });
      for (const moon of el.moonEls()) {
        if (!moon.moon.locked) list.push({ kind: 'moon', id: moon.moon.id, el: moon, planet: el, measure: () => moon.center() });
      }
    }
    if (this.hole) {
      list.push({ kind: 'hole', el: this.hole.el, measure: () => ({ ...this.hole.center(), r: this.hole.radius() }), onHover: (on) => this.hole.hover(on) });
    }
    return list;
  }

  async dropStar(block, target, ghost) {
    const at = target.measure();
    if (target.kind === 'star') {
      const done = await this.sky.join(block.id, target.id, this.local(ghost));
      ghost.remove();
      if (!done) this.layout();
      return;
    }
    if (target.kind === 'hole') {
      await spiralInto(ghost, center(ghost.getBoundingClientRect()), at, { duration: DUR.scene });
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
    const el = target.kind === 'moon' ? target.el : this.planetEls.get(target.id);
    await spiralInto(ghost, center(ghost.getBoundingClientRect()), at, { duration: DUR.scene, turns: 0.5 });
    el?.gulp();
    try {
      const res = await api.post(`/api/blocks/${block.id}/connections`, { drawer: target.id });
      this.forgetStar(block.id);
      if (target.kind === 'moon') toast(`Moved to ${el.moon.title}`);
      else {
        el?.bump(1);
        toast(`Moved to ${el?.planet.title || 'a planet'}`);
      }
      bus.emit('block:connected', { block: res.block, drawerId: target.id });
      this.refresh();
    } catch (err) {
      toast(err.message);
    }
  }

  // ------------------------------------------------------------ constellations (constellations.js)

  // The menu rows a star gets for its constellation.
  skyItems(block) {
    if (!this.sky) return [];
    const c = this.sky.of.get(block.id);
    return [
      { icon: 'star', label: 'Join with another star', run: () => this.sky.pick(block.id) },
      c ? { icon: 'minus', label: `Take out of ${c.title}`, run: () => this.sky.takeOut(block.id) } : null,
    ].filter(Boolean);
  }

  async looseStar(block, ghost) {
    const at = this.local(ghost);
    if (this.sky.inFigure(block.id, at)) return false;
    await this.sky.takeOut(block.id, at);
    ghost.remove();
    return true;
  }

  // Where something on screen is, in the galaxy's own pixels round the void.
  local(node) {
    const r = node.getBoundingClientRect();
    const c = this.coreWrap.getBoundingClientRect();
    return { x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top };
  }

  // A star put down at `at` at once, to glide from there to where the layout puts it.
  holdStar(id, at) {
    const el = this.starsEl.querySelector(`.star[data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    el.style.transition = 'none';
    el.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`;
    void el.offsetWidth;
    el.style.transition = '';
  }

  isStar(id) { return this.stars.some((b) => b.id === id); }

  // A place in the galaxy as a planet's saved place (see place()).
  layoutPoint(spot) {
    return { x: Math.round((spot.x / (this.m.scale * this.fx)) * 10) / 10, y: Math.round((spot.y / (this.m.scale * this.stretch)) * 10) / 10 };
  }

  // What will happen if the carried star is let go here: the shared tooltip's label, over the star.
  joinLabel(el, words) {
    if (!el || !words) { this.joinTip?.classList.remove('is-on'); return; }
    this.joinTip ||= document.body.appendChild(h('div', { class: 'tooltip gx-join-tip', role: 'status' }));
    this.joinTip.replaceChildren(h('span', { class: 'tooltip-text' }, words));
    const r = el.getBoundingClientRect();
    const w = this.joinTip.offsetWidth;
    const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    this.joinTip.style.transform = `translate(${Math.round(x)}px, ${Math.round(r.top - 14 - this.joinTip.offsetHeight)}px)`;
    this.joinTip.classList.add('is-on');
  }

  forgetStar(id) {
    const el = this.starsEl.querySelector(`.star[data-id="${CSS.escape(id)}"]`);
    this.stars = this.stars.filter((b) => b.id !== id);
    el?.classList.add('is-leaving');
    setTimeout(() => { this.renderStars(); this.layout(); }, el && !reducedMotion() ? DUR.change : 0);
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
        spiralInto(chip, start, this.hole.center(), { duration: DUR.scene + i * STAGGER }).then(() => this.hole.gulp());
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
    const el = this.planetEls.get(planetId)
      || [...this.planetEls.values()].flatMap((p) => p.moonEls()).find((m) => m.moon.id === planetId);
    files = withinLimit(files);
    if (!el || !files.length) return;
    files.slice(0, 6).forEach((file, i) => {
      setTimeout(() => {
        const chip = float(h('div', { class: 'fx-chip fx-chip-file' }, h('span', { class: 'fx-chip-text' }, file.name)), at);
        spiralInto(chip, at, el.center(), { duration: DUR.scene, turns: 0.5 }).then(() => el.gulp());
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
    ], { duration: DUR.scene, easing: EASE });
  }

  // Out of the void to the planet it went onto: the file itself, flying.
  async launch(block, { planet, created, or }, { sorted = false } = {}) {
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
    await arcTo(chip, from, to, { duration: DUR.scene, lift: 0.22, startScale: 0.4, endScale: 0.3 });
    el.gulp();
    el.bump(1);
    burst(to, { color: 'rgba(255,255,255,0.8)', count: 5, reach: 20 });
    if (sorted) sortedToast(block, { planet, created, or });
    else toast(created ? `New planet: ${planet.title}` : `Added to ${planet.title}`);
    this.setHint();
    this.refresh();
  }

  // ------------------------------------------------------------ files dragged in from your computer

  hit(x, y) {
    let best = null;
    // A moon close by wins over its bigger planet.
    for (const el of this.planetEls.values()) {
      for (const moon of el.moonEls()) {
        if (moon.moon.locked) continue;
        const c = moon.center();
        const d = Math.hypot(x - c.x, y - c.y);
        if (d < c.r * 1.3 + 8 && (!best || d < best.d)) best = { id: moon.moon.id, el: moon, d };
      }
    }
    if (best) return best;
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
      label: 'Drop into the void',
      lit: (on) => this.hole.ring(on),
      over: (e) => {
        const found = this.hole.isOpen() ? null : this.hit(e.clientX, e.clientY);
        for (const el of this.planetEls.values()) {
          el.classList.toggle('is-target', el === found?.el);
          for (const moon of el.moonEls()) moon.classList.toggle('is-target', moon === found?.el);
        }
        this.hole.hover(!found);
        const name = found && (found.el.moon || found.el.planet)?.title;
        return found ? (name ? `Drop onto ${name}` : 'Drop onto this planet') : 'Drop into the void';
      },
      leave: () => {
        for (const el of this.planetEls.values()) {
          el.classList.remove('is-target');
          for (const moon of el.moonEls()) moon.classList.remove('is-target');
        }
        this.hole.hover(false);
      },
      drop: (files, e) => {
        const open = this.hole.isOpen();
        const found = e && !open ? this.hit(e.clientX, e.clientY) : null;
        for (const el of this.planetEls.values()) {
          el.classList.remove('is-target');
          for (const moon of el.moonEls()) moon.classList.remove('is-target');
        }
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
      // A phone's comment note: the planets make room under it, and close up when it goes
      // (not while out in the universe; the next layout catches up).
      bus.on('notes:room', (px) => {
        this.notesRoom = px;
        if (this.size?.width < 640 && px !== this.laidRoom && this.p < 0.02) this.layout();
      }),
    );
  }

  // ------------------------------------------------------------ out to the universe and back

  // A still picture of this page's void, for the galaxies out there. Taken
  // whenever the void is drawn closed, so it matches. Turning the picture
  // into an image is slow, so it's only taken again when the void's size
  // changes, not every time the page lays itself out; and the browser is
  // asked to do the turning in its own time, so the page never waits for it.
  snapVoid(m) {
    if (this.hole?.isOpen()) return;
    // Not drawn yet (its cells and dots are still being worked out): look again shortly.
    if (!this.void.ready()) {
      clearTimeout(this.snapSoon);
      this.snapSoon = setTimeout(() => { if (this.el.isConnected) this.snapVoid(this.m || m); }, 160);
      return;
    }
    if (!parseFloat(this.void.art.style.width)) return;
    const dpr = sharpness();
    const r = m.hole * REACH.y * 1.05;
    const key = `${r}×${dpr}`;
    if (key === this.voidKey) return;
    this.voidKey = key;
    const out = document.createElement('canvas');
    out.width = out.height = Math.min(360, Math.round(r * 2 * dpr));
    this.void.copyTo(out, r);
    out.css = r;
    this.voidPic = out;
    out.toBlob((blob) => {
      if (!blob || this.voidPic !== out || !this.el.isConnected) return;
      if (this.voidUrl) URL.revokeObjectURL(this.voidUrl);
      this.voidUrl = URL.createObjectURL(blob);
      this.uvStage.style.setProperty('--void-pic', `url(${this.voidUrl})`);
      this.uvStage.classList.add('has-void');
    });
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
    this.uvLoading ||= api.get('/api/galaxies').then(({ galaxies, links }) => {
      if (!this.el.isConnected) return;
      this.list = withOwner(galaxies, this.data);
      this.links = links || [];
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
    // The void's still picture is only needed out in the universe: taken at once if you are
    // already out there, and otherwise when the page next has nothing to do.
    if (this.p > 0.02 || !window.requestIdleCallback) this.snapVoid(m);
    else { cancelIdleCallback(this.snapIdle); this.snapIdle = requestIdleCallback(() => { if (this.el.isConnected) this.snapVoid(this.m || m); }, { timeout: 4000 }); }
    this.renderUniverse(width, viewH);
    const plans = this.uvEls.map((el, i) => (i === this.homeAt ? home : el.plan));
    const here = this.uvEls[this.homeAt];
    Object.assign(here.plan, home);
    Object.assign(here.style, { left: `${-home.ex}px`, top: `${-home.ey}px`, width: `${home.ex * 2}px`, height: `${home.ey * 2}px` });
    // The map is always laid out round you, whoever's page this is, so it's
    // the same map wherever you zoom out from.
    const you = this.list.findIndex((g) => g.you);
    const index = new Map(this.list.map((g, i) => [g.username, i]));
    const pairs = (this.links || []).map((l) => ({ i: index.get(l.a), j: index.get(l.b), n: l.n }))
      .filter((p) => p.i != null && p.j != null && p.i !== p.j);
    const { spots, k, mid } = universeLayout(plans, you < 0 ? this.homeAt : you, width, viewH, this.list.map((g) => g.name || g.username),
      this.list.map((g) => g.near || 0), pairs);
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
    const webKey = `${width}×${viewH}:${nodes.map((n) => `${Math.round(n.x)},${Math.round(n.y)}`).join(';')}:${pairs.map((p) => `${p.i}-${p.j}-${p.n}`).join(',')}`;
    if (webKey !== this.webKey) {
      this.webKey = webKey;
      const M = 1.4;
      const W = width * M;
      const H = viewH * M;
      const off = { x: (width - W) / 2, y: (viewH - H) / 2 };
      const threads = paintWeb(this.webCanvas, W, H, nodes.map((n) => ({ ...n, x: n.x - off.x, y: n.y - off.y })), session.user?.username || this.owner, pairs);
      this.webBeads.dataset.run = this.p > 0.02 ? 'yes' : 'no';
      beads(this.webBeads, threads, reducedMotion());
      Object.assign(this.web.style, { left: `${off.x}px`, top: `${off.y}px`, width: `${W}px`, height: `${H}px`, transformOrigin: `${(F.x - off.x).toFixed(1)}px ${(F.y - off.y).toFixed(1)}px` });
    }
  }

  // Scroll position → how far out we are (0 here, 1 in the universe).
  goalNow() {
    if (!this.size) return 0;
    const { height, viewH } = this.size;
    // The page can stop a fraction of a pixel short of its end (on many
    // screens it does), and that's still all the way out.
    const raw = (scrollY - (height - viewH)) / this.travel;
    return clamp(raw > 1 - 2 / this.travel ? 1 : raw);
  }

  // The picture follows the scroll on a spring, so its speed changes gently as well as its place:
  // a flick or a notch of the wheel never kicks it, and when it carries on by itself (snap) it
  // leaves at the speed it already had. The spring is tight while you scroll (it settles in
  // --dur-arrive) and slow when the trip is its own (--dur-grand, a set piece). DESIGN.md "Motion".
  track(jump = false) {
    if (!this.size) return;
    const goal = this.goalNow();
    this.goal = goal;
    const now = performance.now();
    const dt = this.tickAt ? Math.min(64, now - this.tickAt) : 16;
    // carried: the page jumped to an end and the picture is gliding there by itself
    if (this.carriedTo != null && Math.abs(goal - this.carriedTo) > 0.02) this.carriedTo = null;
    let p = goal;
    let v = 0;
    if (!jump && !this.jump && !reducedMotion()) {
      const w = SETTLES / (Math.max(100, this.carriedTo != null ? DUR.grand : DUR.arrive) / 1000);
      p = this.p;
      v = this.speed || 0;
      const steps = Math.ceil(dt / 8);
      const h = dt / steps / 1000;
      for (let i = 0; i < steps; i++) {
        v += (w * w * (goal - p) - 2 * w * v) * h;
        p += v * h;
      }
      if (p <= 0 || p >= 1) { p = clamp(p); if (p === goal) v = 0; }
      if (Math.abs(goal - p) < 0.0008 && Math.abs(v) < 0.004) { p = goal; v = 0; }
    }
    this.speed = v;
    this.jump = false;
    this.render(p);
    if (p !== goal) {
      this.tickAt = now;
      cancelAnimationFrame(this.scrollFrame);
      this.scrollFrame = requestAnimationFrame(() => this.track());
    } else {
      this.tickAt = 0;
      this.carriedTo = null;
    }
  }

  render(p) {
    this.p = p;
    // The universe's beads rest while it is out of sight.
    if ((p > 0.02) !== this.beadsOn) { this.beadsOn = p > 0.02; beadsRun(this.webBeads, this.beadsOn); }
    if (p > 0.02 && !this.voidPic && this.m) this.snapVoid(this.m);
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
    // On a galaxy taller than the screen it waits for the end, not over the planets.
    const below = this.size ? this.size.height - this.size.viewH - scrollY : 0;
    const cue = (1 - clamp(p * 5)) * (1 - clamp((below - 8) / 40));
    this.cue.style.opacity = cue.toFixed(3);
    this.cue.style.pointerEvents = cue < 0.5 ? 'none' : '';
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
    this.carry(out ? start + this.travel : start, out ? 1 : 0);
  }

  // The rest of a trip, made by the picture itself. The page's own scroll goes straight to the end:
  // nothing on screen follows it but the picture (track), which glides there on its slow spring
  // from the speed it had. The browser's own smooth scroll is not used: it starts from a
  // standstill, and that pause was the roughness.
  carry(top, to) {
    this.crawl = 0;
    clearTimeout(this.snapTimer);
    this.carriedTo = to;
    if (Math.abs(scrollY - top) > 0.5) { this.carried = true; scrollTo({ top, behavior: 'instant' }); }
    cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = requestAnimationFrame(() => this.track());
  }

  goOut(instant = false) {
    if (!this.size) return;
    const top = this.size.height - this.size.viewH + this.travel;
    if (instant || reducedMotion()) { if (instant) this.jump = true; scrollTo({ top, behavior: 'instant' }); return; }
    this.carry(top, 1);
  }

  goHome() {
    if (reducedMotion() || !this.size || this.p <= 0.01) { scrollTo({ top: 0, behavior: reducedMotion() ? 'instant' : 'smooth' }); return; }
    // back to the galaxy: the picture glides in, and the page is already there
    this.carry(this.size.height - this.size.viewH, 0);
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
    handoff = { data, list: this.list, links: this.links };
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
    ], { duration, easing: EASE_GLIDE, fill: 'forwards' });
    el.querySelector('.uvg-core')?.animate([{ transform: 'none' }, { transform: `scale(${1 / VOID_UV})` }],
      { duration, easing: EASE_GLIDE, fill: 'forwards' });
    const fade = { duration: duration * 0.55, easing: EASE_LEAVE, fill: 'forwards' };
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
    this.coreEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.scene, delay: DUR.move, fill: 'backwards' });
    this.void.art.animate([{ transform: 'translate(-50%, -50%) scale(0.7)', opacity: 0 }, { transform: 'translate(-50%, -50%)', opacity: 1 }],
      { duration: DUR.grand, easing: EASE });
    this.starsEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.scene, delay: DUR.change, fill: 'backwards' });
    this.sky?.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.scene, delay: DUR.change, fill: 'backwards' });
    this.threadsEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.scene, delay: DUR.move + Math.min(this.planetEls.size, 14) * STAGGER, fill: 'backwards' });
    [...this.planetEls.values()].forEach((p, i) => {
      p.body.animate([
        { transform: 'scale(0.85)', opacity: 0 },
        { transform: 'none', opacity: 1 },
      ], { duration: DUR.scene, delay: DUR.quick + Math.min(i, 14) * STAGGER, easing: EASE, fill: 'backwards' });
    });
  }

  // Search as gravity (gravity.js): fetched the first time someone searches on this galaxy.
  gravity() {
    this.foundLoad ||= import('../gravity.js').then(({ Gravity }) => {
      if (!this.el.isConnected) return null;
      this.found = new Gravity({
        layer: this.coreWrap,
        scene: this.scene,
        mine: this.mine,
        center: () => this.void.center(),
        hole: () => this.void.radius(),
        chip: () => this.m.cell,
        narrow: () => this.m.narrow,
        planets: () => this.planetEls,
        star: (id) => (this.mine ? this.starsEl.querySelector(`.star[data-id="${CSS.escape(id)}"]`) : null),
      });
      return this.found;
    });
    return this.foundLoad;
  }

  inst() {
    return {
      el: this.el,
      title: this.mine ? 'Your galaxy' : `${this.shownName()}’s galaxy`,
      chrome: 'galaxy',
      who: { username: this.owner, name: this.ownerName, you: this.mine },
      home: !this.mine,
      goHome: this.mine ? () => this.goHome() : () => this.back(),
      // the file view's arrows walk through what a search found, while it is round the void
      list: () => this.found?.list() || this.stars,
      // search (search.js) gathers what it finds here, unless you are out in the universe
      seek: {
        mine: this.mine,
        owner: this.owner,
        name: this.ownerName,
        away: () => this.p > 0.02,
        home: () => (this.mine ? this.goHome() : nav.go('/')),
        gravity: () => this.gravity(),
        gathered: () => !!this.found?.active,
      },
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
        // A constellation that holds enough offers to become a planet, once the page is up.
        if (this.sky) setTimeout(() => { if (this.live && this.p < 0.02) this.sky.maybeOffer(); }, DUR.move);
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
        cancelAnimationFrame(this.threadFrame);
        cancelAnimationFrame(this.nearFrame);
        clearTimeout(this.snapTimer);
        this.off.forEach((off) => off());
        this.diving = false;
        this.live = false;
        this.sky?.destroy();
        this.joinTip?.remove();
        theSky()?.setLens(null);
        this.void.destroy();
        this.found?.destroy();
        theSky()?.setNight(0);
        holdPlanets(false);
        bus.emit('universe', false);
      },
    };
  }
}

// The galaxy on this page, as the universe lists it.
const ownEntry = (data) => ({ username: data.user.username, name: data.user.name || null, you: !!data.user.you, planets: data.planets.length, open: data.planets.length, files: 0, worlds: [] });

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
  return { data, list: everyone && withOwner(everyone.galaxies, data), links: everyone?.links || [] };
}

export const galaxyView = {
  load: ([username]) => loadGalaxy(username, false),

  create(params, { data, list, links }) {
    if (data.user.you && params[0]) queueMicrotask(() => nav.go('/', { replace: true }));
    if (data.stats) session.stats = data.stats;
    return new Galaxy(data, list, links).inst();
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
