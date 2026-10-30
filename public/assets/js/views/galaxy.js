// Your galaxy: the main page. A void sits in the middle, and everything new
// goes in through it. Loose files (stars) settle in a cluster round its edge;
// planets (your drawers) are scattered further out, each one showing the
// files on it. Keep scrolling down and the galaxy shrinks away into the
// universe, where everyone else's galaxies are.

import { blockMenu, openConnect } from '../actions.js';
import { api, session } from '../api.js';
import { blackHole, stillVoid } from '../blackhole.js';
import { draggable, movable } from '../drag.js';
import { arcTo, burst, center, chipFrom, float, spiralInto } from '../fx.js';
import { nav } from '../nav.js';
import { fileFace, glyph, holdPlanets, planetEl, planetSize, worldPicture } from '../planets.js';
import { theSky } from '../sky.js';
import { updatePrefs } from '../theme.js';
import { openDialog, pinField, toast } from '../ui.js';
import { addFiles } from '../uploads.js';
import { bus, debounce, h, isEditable, plural, reducedMotion, seeded, wait } from '../util.js';
import { REACH, voidRadius } from '../voidart.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const STAR_CAP = 240;
// Set by /universe, so the page opens already scrolled out.
let startOut = false;

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => t * t * (3 - 2 * t);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function excerpt(text, n = 90) {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

const starTitle = (b) => b.title || (b.kind === 'text' ? excerpt(b.content || '', 40) : b.fileName) || 'Untitled';

function metrics(width, viewH) {
  const narrow = width < 640;
  const mid = width < 1000;
  const hole = voidRadius(width, viewH); // radius of the dark itself
  return {
    narrow,
    scale: narrow ? 0.72 : mid ? 0.86 : 1,
    hole,
    // The glow round it: a tall oval.
    rx: hole * REACH.x,
    ry: hole * REACH.y,
    chip: narrow ? 30 : 38,
    cell: narrow ? 37 : 47,
  };
}

// ---------------------------------------------------------------- layout

// Stars: a sunflower spiral in the dust round the void, newest closest in,
// starting just outside the dark's ragged edge and stretched tall like the dust.
const TALL = REACH.y / REACH.x;
function starSpots(n, m) {
  const r0 = m.hole * 2.25 + m.chip / 2;
  const spots = [];
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(r0 * r0 + (i * m.cell * m.cell) / (Math.PI * TALL));
    const a = i * GOLDEN - Math.PI / 2;
    spots.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * TALL });
  }
  const outer = n ? Math.sqrt(r0 * r0 + (n * m.cell * m.cell) / (Math.PI * TALL)) + m.chip / 2 : 0;
  return { spots, outer };
}

// Does a rectangle reach into the oval (rx × ry) round the middle?
function ovalHitsRect(rx, ry, rect) {
  const x = clamp(0, rect.x0, rect.x1);
  const y = clamp(0, rect.y0, rect.y1);
  return (x / rx) ** 2 + (y / ry) ** 2 < 1;
}

const overlaps = (a, b, pad) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;

const placed = (p) => p.x != null && p.y != null;
const footprint = (s, m) => Math.max(s, m.narrow ? 104 : 140);
// The room a planet and its name take up, round (x, y).
const box = (x, y, s, w) => ({ x0: x - w / 2, x1: x + w / 2, y0: y - s / 2 - 8, y1: y + s / 2 + 50 });

// The nearest spot to `at` where a planet clears the void, the stars round
// it, the screen's sides and every rect in `taken`.
function nearestFree(at, s, m, taken, inner, room) {
  const w = footprint(s, m);
  const pad = m.narrow ? 10 : 22;
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
  const pad = m.narrow ? 10 : 22;
  const sizes = planets.map((p) => planetSize(p.count, m.scale));
  let fx = 1;
  planets.forEach((p, i) => {
    if (!placed(p) || !p.x) return;
    const room = Math.max(0, half - footprint(sizes[i], m) / 2);
    fx = Math.min(fx, room / Math.abs(p.x * m.scale));
  });
  const stretch = 1 / Math.sqrt(Math.max(fx, 0.1));
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

// ---------------------------------------------------------------- the universe

// Someone's galaxy in miniature: their planets laid out just as their own
// page lays them out on a desktop screen, shrunk to fit `size`.
const MINI = { width: 1280, height: 800 };
// The box each one sits in is wide, like the galaxies themselves.
const MINI_TALL = 0.66;
function miniGalaxy(g, size) {
  const m = metrics(MINI.width, MINI.height);
  const inner = { rx: m.rx * 0.72 + 18, ry: m.ry * 0.72 + 18 };
  const planets = (g.worlds || []).map((w) => ({ id: w.id, count: w.n, x: w.x, y: w.y }));
  const { spots } = scatter(planets, MINI.width, inner, m);
  // One scale for everyone (about a screen's worth), so galaxies compare
  // honestly; only a big spread-out one shrinks a little more to fit.
  let rx = MINI.width * 0.42;
  let ry = MINI.height * 0.42;
  for (const sp of spots) {
    rx = Math.max(rx, Math.abs(sp.x) + sp.size / 2);
    ry = Math.max(ry, Math.abs(sp.y) + sp.size / 2);
  }
  const k = Math.min((size / 2) / rx, (size * MINI_TALL / 2) / ry);
  const worlds = (g.worlds || []).map((w, i) => {
    const sp = spots[i];
    const dot = worldPicture(w, Math.max(7, sp.size * k));
    dot.style.transform = `translate(${(sp.x * k).toFixed(1)}px, ${(sp.y * k).toFixed(1)}px)`;
    return dot;
  });
  const meta = g.locked
    ? [glyph('lock', 10), h('span', null, plural(g.planets, 'planet'))]
    : [h('span', null, `${plural(g.open, 'planet')} · ${plural(g.files, 'file')}`)];
  const el = h('button', {
    type: 'button',
    class: `uvg${g.you ? ' is-you' : ''}${g.locked ? ' is-locked' : ''}`,
    dataset: { user: g.username },
    style: { '--core': `${(m.hole * 2 * k).toFixed(1)}px` },
    'aria-label': g.you ? 'Your galaxy' : `@${g.username}’s galaxy${g.locked ? ' (locked)' : ''}`,
  },
  h('span', { class: 'uvg-sys' },
    h('span', { class: 'uvg-disk' }, h('span', { class: 'uvg-spin' }, worlds)),
    h('span', { class: 'uvg-core' })),
  h('span', { class: 'uvg-name' }, g.you ? 'You' : `@${g.username}`),
  h('span', { class: 'uvg-meta' }, meta));
  el.galaxy = g;
  return el;
}

function universeLayout(list, width, height, m) {
  const size = m.narrow ? 150 : 210;
  // Spread to the screen's shape: wide on a desktop, tall on a phone.
  const wide = clamp(Math.sqrt(width / height), 0.62, 1.5);
  const spots = list.map((g, i) => {
    if (i === 0) return { x: 0, y: 0 };
    const r = size * 0.62 * Math.sqrt(i + 0.35);
    const a = i * GOLDEN - Math.PI / 2;
    return { x: Math.cos(a) * r * wide, y: Math.sin(a) * r / wide };
  });
  // Nudge apart any that crowd each other. Each one is a box with its
  // name underneath, so they need more room up and down than across.
  const across = size * 1.06;
  const down = size * MINI_TALL + 46;
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const dx = spots[j].x - spots[i].x;
        const dy = spots[j].y - spots[i].y;
        const ox = across - Math.abs(dx);
        const oy = down - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // Slide apart along whichever way is the shorter way out.
        const move = ox / across < oy / down
          ? { x: (dx < 0 ? -ox : ox) / 2, y: 0 }
          : { x: 0, y: (dy < 0 ? -oy : oy) / 2 };
        const k = i === 0 ? 2 : 1;
        spots[j].x += move.x * k; spots[j].y += move.y * k;
        if (i) { spots[i].x -= move.x; spots[i].y -= move.y; }
      }
    }
    if (!moved) break;
  }
  const ext = spots.reduce((acc, s) => ({ x: Math.max(acc.x, Math.abs(s.x)), y: Math.max(acc.y, Math.abs(s.y)) }), { x: 0, y: 0 });
  const fit = clamp(Math.min((width / 2 - 12) / (ext.x + size * 0.54), (height / 2 - 60) / (ext.y + size * MINI_TALL / 2 + 46)), 0.4, 1);
  return { size, spots, fit };
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
    this.list = list;
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
    this.uvStage = h('section', { class: 'uv-stage', 'aria-label': 'Universe' },
      h('header', { class: 'uv-head' },
        h('h2', { class: 'uv-title' }, 'Universe'),
        h('p', { class: 'uv-sub' }, 'Everyone’s galaxies. Open one to look around.')),
      this.uvScene);
    this.runway = h('div', { class: 'uv-runway' }, this.uvStage);
    this.cue = h('button', { type: 'button', class: 'gx-cue', onclick: () => this.goOut() }, h('span', null, 'Universe'), glyph('down', 12));
    this.el = h('div', { class: 'world' }, this.stage, this.runway, this.cue);

    for (const p of data.planets) this.addPlanet(p);
    this.renderStars();
    this.renderUniverse();
    this.layout();
    this.setHint();

    this.relayout = debounce(() => this.layout(), 120);
    this.refresh = debounce(() => this.reload(), 450);
    this.lastY = 0;
    this.onScroll = () => {
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
    el.ball.dataset.vt = `planet-${planet.id}`;
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
    let grab = null;
    let at = null;
    let shown = null;
    const toScene = (pointer) => {
      const r = this.scene.getBoundingClientRect();
      return { x: pointer.x - r.left - this.size.cx, y: pointer.y - r.top - this.size.cy };
    };
    movable(el, {
      enabled: () => this.p < 0.02 && !!this.spots?.get(el.planet.id),
      limits: () => ({ top: 0, bottom: Math.max(0, this.size.height - this.size.viewH) }),
      onStart: (pointer) => {
        const spot = this.spots.get(el.planet.id);
        const p = toScene(pointer);
        grab = { x: p.x - spot.x, y: p.y - spot.y };
        at = { x: spot.x, y: spot.y };
        shown = { ...at };
        el.classList.add('is-moving');
      },
      onMove: (pointer) => {
        const p = toScene(pointer);
        const half = this.size.width / 2;
        at = { x: clamp(p.x - grab.x, -half, half), y: p.y - grab.y };
        // A little behind the pointer, as if it has some weight.
        const k = reducedMotion() ? 1 : 0.3;
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
    const m = metrics(width, viewH);
    this.m = m;
    const { spots: starAt, outer } = starSpots(this.starsEl.children.length, m);
    // Planets keep clear of the dust and of the stars caught in it. The
    // dust fades out well before its edge, so they may sit on its rim.
    const gap = m.narrow ? 10 : 18;
    const inner = { rx: Math.max(outer, m.rx * 0.72) + gap, ry: Math.max(outer * TALL, m.ry * 0.72) + gap };
    const { spots, rects, fx, stretch } = scatter(this.data.planets, width, inner, m);
    this.inner = inner;
    this.fx = fx;
    this.stretch = stretch;
    this.spots = new Map(this.data.planets.map((p, i) => [p.id, spots[i]]));

    let top = -inner.ry;
    let bottom = inner.ry;
    for (const r of rects) { top = Math.min(top, r.y0); bottom = Math.max(bottom, r.y1); }
    const pad = m.narrow ? 36 : 56;
    const content = bottom - top + pad * 2;
    const height = Math.max(viewH, content);
    const cx = width / 2;
    const cy = pad - top + (height - content) / 2;
    this.size = { width, height, viewH, bar, cx, cy };

    this.scene.style.height = `${height}px`;
    this.stage.style.height = `${height}px`;
    this.stage.style.top = `${bar + viewH - height}px`;
    this.coreWrap.style.transform = `translate(${cx}px, ${cy}px)`;
    this.art.style.transform = `translate(${cx}px, ${cy}px)`;
    // The canvas covers the page's width and a bit more than a screen tall.
    this.void.size(m.hole, width + 40, Math.max(viewH * 1.5, m.ry * 2.6));
    this.scene.style.transformOrigin = `${cx}px ${cy}px`;
    this.data.planets.forEach((p, i) => {
      const el = this.planetEls.get(p.id);
      const spot = spots[i];
      if (!el || !spot) return;
      el.update(p, { size: spot.size });
      if (el.classList.contains('is-moving')) return;
      el.style.transform = `translate(${cx + spot.x}px, ${cy + spot.y}px)`;
    });
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
    this.placeUniverse(width, viewH, m);
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
      this.hint.textContent = empty ? 'Your galaxy is empty. Click the void to put something in.' : '';
    } else if (!this.data.planets.length) {
      this.hint.textContent = `@${this.owner} hasn’t shared any planets yet.`;
    } else if (this.data.planets.some((p) => p.locked) && !this.data.unlocked) {
      this.hint.replaceChildren(
        h('button', { type: 'button', class: 'vbtn', onclick: () => this.unlock() }, glyph('lock', 12), h('span', null, `Enter @${this.owner}’s code to see the locked planets`)));
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
        await this.launch(res.block, res.sortedInto);
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
      if (sortedInto) await this.launch(block, sortedInto);
      else if (planet) await this.launch(block, { planet: { ...planet, count: (planet.count || 0) + 1, previews: [block, ...(planet.previews || [])] }, created: planet.isNew });
      else await this.birth(block);
    } catch (err) {
      toast(err.message);
      this.hole.focusText(text);
    } finally {
      this.hole.setLabel('Add');
    }
  }

  async addFiles(files, from, dest) {
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
    if (!el) return;
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
  async launch(block, { planet, created }) {
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
    toast(created ? `New planet: ${planet.title}` : `Added to ${planet.title}`);
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
          if (item.sortedInto) this.launch(item.block, item.sortedInto);
          else if (item.ctx.drawerId) {
            const p = this.data.planets.find((x) => x.id === item.ctx.drawerId);
            if (p) this.launch(item.block, { planet: { ...p, count: (p.count || 0) + 1, previews: [item.block, ...(p.previews || [])] }, created: false });
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

  renderUniverse(size = this.uvSize || 210) {
    this.uvSize = size;
    this.uvEls = this.list.map((g) => {
      const el = miniGalaxy(g, size);
      el.addEventListener('click', () => this.visit(g, el));
      return el;
    });
    this.uvField.replaceChildren(...this.uvEls);
  }

  placeUniverse(width, viewH, m) {
    const plan = universeLayout(this.list, width, viewH, m);
    if (plan.size !== this.uvSize) this.renderUniverse(plan.size);
    this.uvEls.forEach((el, i) => {
      el.style.setProperty('--m', `${plan.size}px`);
      el.style.setProperty('--mh', `${Math.round(plan.size * MINI_TALL)}px`);
      el.style.transform = `translate(${plan.spots[i].x}px, ${plan.spots[i].y}px)`;
    });
    this.uvField.style.transform = `scale(${plan.fit})`;
    // Where this galaxy sits out there (yours is in the middle).
    const i = Math.max(0, this.list.findIndex((g) => (this.mine ? g.you : g.username === this.owner)));
    const spot = plan.spots[i] || { x: 0, y: 0 };
    this.home = { x: spot.x * plan.fit, y: spot.y * plan.fit + 24, size: plan.size * plan.fit };
    this.uvScene.style.transformOrigin = `calc(50% + ${this.home.x}px) calc(50% + ${this.home.y}px)`;
    // The others arrive nearest first, so the universe opens out round you.
    const far = Math.max(1, ...plan.spots.map((s) => Math.hypot(s.x - spot.x, s.y - spot.y)));
    this.uvRank = plan.spots.map((s) => Math.hypot(s.x - spot.x, s.y - spot.y) / far);
  }

  // Scroll position → how far out we are (0 here, 1 in the universe). The
  // picture follows the scroll with a little weight, so it glides rather
  // than stepping with each notch of the wheel.
  track(jump = false) {
    if (!this.size) return;
    const { height, viewH } = this.size;
    const goal = clamp((scrollY - (height - viewH)) / this.travel);
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
    const { height, viewH, width, cy, cx } = this.size;
    this.p = p;
    const e = easeInOut(p);
    // The galaxy leans back, turns away and shrinks into its place among
    // the others. It starts slowly, so the first bit of scrolling just
    // pulls the camera back.
    const span = Math.max(width, height) * 0.92;
    const k = 1 - (1 - (this.home.size * 1.1) / span) * e;
    const dx = (width / 2 + this.home.x - cx) * e;
    const dy = (viewH / 2 + this.home.y - (viewH - height + cy)) * e;
    const lean = 38 * Math.sin(Math.PI * Math.min(1, p * 1.25));
    this.scene.style.transform = p
      ? `translate(${dx}px, ${dy}px) perspective(${Math.round(span * 1.4)}px) rotateX(${lean.toFixed(2)}deg) rotate(${(-30 * e).toFixed(2)}deg) scale(${k})`
      : '';
    this.scene.style.opacity = p ? String(1 - smooth(clamp((e - 0.6) / 0.35))) : '';
    // The universe swings in from very close.
    const z = 3.6 - 2.6 * e;
    this.uvScene.style.transform = `rotate(${(24 * (1 - e)).toFixed(2)}deg) scale(${z})`;
    this.uvStage.style.opacity = String(smooth(clamp((e - 0.25) / 0.3)));
    this.uvEls.forEach((el, i) => {
      const t = smooth(clamp((e - 0.55 - (this.uvRank?.[i] || 0) * 0.25) / 0.2));
      el.style.opacity = t === 1 ? '' : String(t);
      el.style.scale = t === 1 ? '' : String(0.55 + 0.45 * t);
    });
    this.cue.style.opacity = String(1 - clamp(p * 5));
    this.cue.style.pointerEvents = p > 0.1 ? 'none' : '';
    const out = p > 0.5;
    if (out !== this.out) {
      this.out = out;
      this.el.classList.toggle('is-out', out);
      if (out && !isEditable(document.activeElement)) this.hole?.close();
      bus.emit('universe', out);
    }
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

  async visit(g, el) {
    const here = this.mine ? g.you : g.username === this.owner;
    if (here) { this.goHome(); return; }
    const go = async () => {
      if (!reducedMotion()) {
        const r = el.getBoundingClientRect();
        const s = this.uvStage.getBoundingClientRect();
        this.uvScene.style.transformOrigin = `${r.left + r.width / 2 - s.left}px ${r.top + r.height / 2 - s.top}px`;
        await this.uvScene.animate([
          { transform: this.uvScene.style.transform || 'none', opacity: 1 },
          { transform: 'scale(3.2)', opacity: 0 },
        ], { duration: 520, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' }).finished.catch(() => {});
      }
      nav.go(g.you ? '/' : `/g/${g.username}`, { motion: 'none' });
    };
    if (g.locked) this.unlock(g.username, go);
    else go();
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
      goHome: this.mine ? () => this.goHome() : null,
      list: () => this.stars,
      dropTarget: () => this.dropTarget(),
      pasteText: (text) => { if (this.p < 0.5) this.hole?.focusText(text); },
      mounted: () => {
        this.layout();
        addEventListener('resize', this.relayout);
        addEventListener('scroll', this.onScroll, { passive: true });
        theSky()?.setLens(() => {
          if (this.p > 0.02 || !this.el.isConnected) return null;
          return { ...this.void.center(), r: this.void.radius() };
        });
        if (startOut) { startOut = false; requestAnimationFrame(() => this.goOut(true)); }
        this.entrance();
      },
      destroy: () => {
        removeEventListener('resize', this.relayout);
        removeEventListener('scroll', this.onScroll);
        clearTimeout(this.snapTimer);
        this.off.forEach((off) => off());
        theSky()?.setLens(null);
        this.void.destroy();
        theSky()?.setNight(0);
        holdPlanets(false);
        bus.emit('universe', false);
      },
    };
  }
}

export const galaxyView = {
  async load([username]) {
    const mine = !username || username === session.user.username;
    const [data, { galaxies }] = await Promise.all([
      api.get(mine ? '/api/galaxy' : `/api/galaxy/${encodeURIComponent(username)}`),
      api.get('/api/galaxies'),
    ]);
    if (!mine && !galaxies.some((g) => g.username === data.user.username)) {
      galaxies.push({ username: data.user.username, you: false, planets: data.planets.length, open: data.planets.length, files: 0, worlds: [] });
    }
    return { data, list: galaxies };
  },

  create(params, { data, list }) {
    if (data.user.you && params[0]) queueMicrotask(() => nav.go('/', { replace: true }));
    if (data.stats) session.stats = data.stats;
    return new Galaxy(data, list).inst();
  },
};

// The universe is your galaxy, scrolled all the way out.
export const universeView = {
  load: () => galaxyView.load([]),
  create(params, loaded) {
    startOut = true;
    return galaxyView.create([], loaded);
  },
};
