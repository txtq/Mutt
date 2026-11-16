// Board: a planet arranged by hand, as a free surface (DESIGN.md "Board").
// A planet mode (modes.js, mutt/modes.py read_board), offered once a planet's
// owner keeps moving its files by hand. Each file sits where its owner put
// it, at the size they chose, with the board's own words and faint lines of
// dust (the threads' print) between them, on a field of dots that moves with
// the board. Only the owner arranges it; anyone who can see the planet can
// move about it and open its files.
//
// Where things sit is kept on the server (GET/PUT /api/drawers/<id>/board)
// in board units: at 100% one unit is one pixel, and a file in the grid is
// 220 wide.
//
// Made for Safari on a phone: only the things near the screen are on the
// page (`show`), the lines are painted into one canvas only as big as they
// reach, and again only when an end moves or the zoom settles, and the dots
// are a background the browser draws. Nothing moves at rest.

import { blockContextMenu, moveBlock, openSave, watchPreview } from './actions.js';
import { api } from './api.js';
import { renderCell, renderPending, updatePending } from './cells.js';
import { entryCell } from './entry.js';
import { icon } from './icons.js';
import { imageSrc, displayTitle } from './kinds.js';
import { nav } from './nav.js';
import { confirmDialog, openContextMenu, openPopover, toast } from './ui.js';
import { addFiles, contextKey, pendingFor } from './uploads.js';
import { DUR, EASE, EASE_GLIDE, EASE_LEAVE, STAGGER, bus, h, named, personLabel, reducedMotion, seeded, sharpness, uid } from './util.js';
import { wisp } from './uvweb.js';

const UNIT = 220;            // a file's width in the grid
const GAP = 24;              // between files in the grid
const FRAME = UNIT * 5 / 4;  // the grid's frame, four wide to five tall
const COLS = 4;
const MIN_W = 64;
const MAX_W = 1600;
const MIN_H = 48;
const WORDS_W = 440;         // how wide new words may run before they wrap
const SNAP = 6;              // screen pixels: an edge this close lines up
const Z_MIN = 0.15;
const Z_MAX = 2.5;
const DOT = 24;              // the dots' spacing at 100%
const HOLD = 380;            // a finger held this long picks a thing up (the grid's)
const NUDGE = 8;             // an arrow key moves a thing this far (Shift: six times)
const PAINT_MOST = 4e6;      // the lines' canvas never holds more pixels than this
// How strong the lines' dots are, dimmest to brightest (as the threads': the dots, never their size, make it brighter)
const LINE_SHADES = [0.12, 0.24, 0.4, 0.6];

const moving = () => !reducedMotion();
const isWords = (id) => String(id).startsWith('w-');
const isPending = (id) => String(id).startsWith('up-');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// A file with a shape of its own keeps it on the board: its height follows its width.
function ratioOf(block) {
  if (block.kind === 'link' || !(block.width > 0 && block.height > 0)) return null;
  return imageSrc(block) || (block.kind === 'video' && block.file) ? block.width / block.height : null;
}

// Where each file sits in the grid now, on screen, so the board loosens from there (modes.js start).
const LABEL_ROOM = 56;        // a group's heading and the space under it

// What a file is, in the words a new board's groups use, in the order they come.
const KIND_GROUPS = [['Pictures', ['image']], ['Videos', ['video']], ['Notes', ['text']], ['Links', ['link']],
  ['Sound', ['audio']], ['Files', ['pdf', 'doc', 'code', 'archive', 'other']]];

// A new board's groups: the planet's subjects when it has two or more clear
// ones (the rest under "Everything else"), else what kind each file is.
function groupsOf(blocks, subjects) {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const out = [];
  if (subjects.length > 1) {
    for (const g of subjects) {
      const list = g.ids.map((id) => byId.get(id)).filter(Boolean);
      list.forEach((b) => byId.delete(b.id));
      if (list.length) out.push({ name: g.name, blocks: list });
    }
    const rest = blocks.filter((b) => byId.has(b.id));
    if (rest.length) out.push({ name: 'Everything else', blocks: rest });
    // in the planet's own order inside each group
    const at = new Map(blocks.map((b, i) => [b.id, i]));
    out.forEach((g) => g.blocks.sort((a, b) => at.get(a.id) - at.get(b.id)));
    if (out.length > 1) return out;
  }
  for (const [name, kinds] of KIND_GROUPS) {
    const list = blocks.filter((b) => kinds.includes(b.kind) || (name === 'Files' && !KIND_GROUPS.some(([, k]) => k.includes(b.kind))));
    if (list.length) out.push({ name, blocks: list });
  }
  return out.length ? out : [{ name: '', blocks }];
}

// How big a file starts on a new board: a picture keeps its shape (a tall one
// no taller than the grid's frame), a short note is short, a long one the frame.
function sizeFor(b) {
  const r = ratioOf(b);
  if (r) return r >= UNIT / FRAME ? { w: UNIT, h: null } : { w: Math.round(FRAME * r), h: null };
  if (b.kind === 'text') {
    const n = (b.content || '').length;
    return { w: UNIT, h: n <= 60 ? 132 : n <= 240 ? UNIT : FRAME };
  }
  return { w: UNIT, h: b.kind === 'link' ? FRAME : UNIT };
}

export function gridRects() {
  const out = new Map();
  for (const cell of document.querySelectorAll('.liv-body .grid > .cell[data-id]')) {
    const r = (cell.querySelector('.face-shape, .cell-fill > .face') || cell.querySelector('.cell-box'))?.getBoundingClientRect();
    if (r && r.width && r.bottom > 0 && r.top < innerHeight) out.set(cell.dataset.id, r);
  }
  return out;
}

// The order a board reads in: rows from the top, each left to right. A thing
// joins a row when its top is above the middle of the row's first thing.
function readingOrder(items) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && it.y < row.y + row.h / 2) row.items.push(it);
    else rows.push({ y: it.y, h: Math.max(1, it.hh), items: [it] });
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.x - b.x));
}

export class BoardView {
  // editable: the owner, who arranges it. adds: can add files (the owner, or anyone on a planet others can add to).
  // from: where each file sat in the grid on screen, when the board was just switched on.
  constructor({ drawer, blocks, editable, adds, targets, onChange, from = null }) {
    this.drawer = drawer;
    this.editable = editable;
    this.adds = adds;
    this.targets = targets;
    this.onChange = onChange;
    this.from = from;
    this.ctx = { drawerId: drawer.id };
    this.blocks = new Map(blocks.map((b) => [b.id, b]));
    this.items = new Map();     // id -> { id, x, y, w, h, z, words, style, block, el }
    this.lines = [];            // [[a, b]], a before b
    this.view = { x: 0, y: 0, z: 1 };
    this.size = { w: 0, h: 0 };
    this.top = 0;               // the highest z so far
    this.out = { items: new Set(), gone: new Set(), join: [], part: [] };
    this.pointers = new Map();
    this.gesture = null;
    this.chosen = null;         // the thing last picked up: it keeps its grip and its name showing
    this.focusId = null;        // the one thing Tab lands on (the rest are tabindex -1)
    this.joining = null;        // the id a line is being drawn from
    this.ready = false;

    this.ground = h('div', { class: 'bd-ground', 'aria-hidden': 'true' });
    this.nearGround = h('div', { class: 'bd-ground is-near', 'aria-hidden': 'true' });
    this.canvas = h('canvas', { class: 'bd-lines', 'aria-hidden': 'true' });
    this.world = h('div', { class: 'bd-world' }, this.canvas);
    this.guideV = h('div', { class: 'bd-guide is-v', 'aria-hidden': 'true' });
    this.guideH = h('div', { class: 'bd-guide is-h', 'aria-hidden': 'true' });
    this.zoomFact = h('button', { type: 'button', class: 'btn btn-quiet btn-small bd-zoom', title: 'Fit everything', 'aria-label': 'Fit everything', onclick: () => this.fit({ glide: true }) }, '100%');
    const round = (name, label, run) => h('button', { type: 'button', class: 'btn btn-quiet btn-round', 'aria-label': label, title: label, onclick: run }, icon(name));
    this.tools = h('div', { class: 'bd-tools' },
      round('minus', 'Zoom out', () => this.zoomBy(1 / 1.25)),
      this.zoomFact,
      round('plus', 'Zoom in', () => this.zoomBy(1.25)),
      editable || adds ? h('span', { class: 'bd-sep', 'aria-hidden': 'true' }) : null,
      editable ? h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => this.addWords() }, icon('textbox'), 'Words') : null,
      adds ? (this.addBtn = h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => this.openAdd() }, icon('plus'), 'Add')) : null);
    this.joinWords = h('span', { class: 'bd-join-words' }, 'Pick what to join it to');
    this.joinBar = h('div', { class: 'bd-tools bd-joinbar', hidden: true },
      this.joinWords,
      h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => this.stopJoin() }, 'Cancel'));
    this.bar = h('div', { class: 'bd-bar bar-glass' }, this.tools, this.joinBar);
    this.emptyHint = h('p', { class: 'bd-empty', hidden: true }, editable ? 'Nothing here yet. Add files, or write a few words.' : 'Nothing on this board yet.');
    this.el = h('section', { class: `bd${editable ? ' is-mine' : ''}`, 'aria-label': 'Board', 'aria-roledescription': 'board' },
      this.ground, this.nearGround, this.world, this.guideV, this.guideH, this.emptyHint, this.bar);

    this.listen();
    this.load();
    this.off = [
      bus.on('upload:add', (item) => this.mine(item) && this.addPending(item)),
      bus.on('upload:progress', (item) => this.mine(item) && this.updatePendingItem(item)),
      bus.on('upload:fail', (item) => this.mine(item) && this.updatePendingItem(item)),
      bus.on('upload:done', (item) => this.mine(item) && this.arrived(item.key, item.block)),
      bus.on('block:changed', (b) => this.patch(b)),
      bus.on('block:deleted', ({ id }) => this.remove(id)),
      bus.on('block:connected', ({ block, drawerId }) => { if (drawerId === drawer.id) this.connected(block); else this.patch(block); }),
      bus.on('block:disconnected', ({ block, drawerId }) => { if (drawerId === drawer.id) this.remove(block.id); else this.patch(block); }),
    ];
  }

  mine(item) { return contextKey(item.ctx) === contextKey(this.ctx); }

  // ------------------------------------------------------------ loading

  async load() {
    let saved = { items: [], lines: [] };
    try { saved = await api.get(`/api/drawers/${this.drawer.id}/board${this.editable ? '?arrange=1' : ''}`); } catch { /* laid out afresh below */ }
    const placed = new Map(saved.items.map((s) => [s.id, s]));
    const files = [...this.blocks.values()];
    const fresh = !saved.items.some((s) => !isWords(s.id));
    for (const s of saved.items) {
      if (isWords(s.id)) this.items.set(s.id, { ...s, h: null });
      else if (this.blocks.has(s.id)) this.items.set(s.id, { ...s, block: this.blocks.get(s.id) });
      this.top = Math.max(this.top, s.z || 0);
    }
    this.lines = saved.lines || [];
    const loose = files.filter((b) => !placed.has(b.id));
    if (fresh) this.arrange(loose, saved.groups || []);
    else this.layBelow(loose);
    for (const b of loose) this.dirty(b.id);
    for (const it of this.pendingNow()) this.addPending(it);
    this.ready = true;
    this.focusId = this.order()[0]?.id || null;
    if (this.from) scrollTo({ top: 0 });
    this.measure();
    if (!this.restoreView()) this.fit();
    this.show({ entrance: true });
    this.emptyHint.hidden = this.items.size > 0;
    if (this.editable) this.flushSoon();
  }

  pendingNow() { return this.adds ? pendingFor(this.ctx) : []; }

  // A new board, laid out so it reads at a glance and is easy to change: the
  // files gathered into groups (by subject when the planet has clear ones,
  // else by kind), each under a heading that is the board's own words (so
  // it can be changed or taken away), in even columns with even gaps, groups
  // side by side as far as the window allows and then on the next row.
  arrange(blocks, subjects = []) {
    if (!blocks.length) return;
    const groups = groupsOf(blocks, subjects);
    const labelled = groups.length > 1;
    const step = UNIT + GAP;
    const across = clamp(Math.floor((innerWidth - 96) / step), 2, 6);   // columns a row of groups may take
    let x = 0;
    let y = 0;
    let used = 0;
    let rowH = 0;
    for (const g of groups) {
      const cols = Math.min(across, clamp(Math.ceil(Math.sqrt(g.blocks.length)), 1, 4));
      if (used && used + cols > across) { x = 0; y += rowH + GAP * 3; used = 0; rowH = 0; }
      let top = y;
      if (labelled) {
        const it = { id: `w-${uid()}`, words: g.name, style: 'heading', x: x - 8, y, w: WORDS_W, h: null, z: ++this.top };
        this.items.set(it.id, it);
        this.dirty(it.id);
        top += LABEL_ROOM;
      }
      const depth = Array(cols).fill(top);
      for (const b of g.blocks) {
        const c = depth.indexOf(Math.min(...depth));
        const size = sizeFor(b);
        const left = x + c * step + (UNIT - size.w) / 2;
        this.items.set(b.id, { id: b.id, block: b, z: ++this.top, x: left, y: depth[c], ...size });
        depth[c] += (size.h ?? size.w / ratioOf(b)) + GAP;
      }
      rowH = Math.max(rowH, Math.max(...depth) - GAP - y);
      x += cols * step + GAP * 2;
      used += cols;
    }
  }

  // A file in a grid frame whose corner is x, y: a picture keeps its shape in the middle of it.
  inFrame(block, x, y) {
    const r = ratioOf(block);
    if (!r) return { x, y, w: UNIT, h: FRAME };
    if (r >= UNIT / FRAME) return { x, y: y + (FRAME - UNIT / r) / 2, w: UNIT, h: null };
    const w = FRAME * r;
    return { x: x + (UNIT - w) / 2, y, w, h: null };
  }

  // Files that came from elsewhere (autosort, another planet, someone else on
  // a planet others can add to) wait in a tidy row under everything.
  layBelow(blocks) {
    if (!blocks.length) return;
    const box = this.bounds();
    const left = box ? box.x : 0;
    const top = box ? box.y + box.h + GAP * 3 : 0;
    const across = Math.max(COLS, Math.floor((box ? box.w : 0) / (UNIT + GAP)));
    blocks.forEach((b, i) => {
      this.items.set(b.id, { id: b.id, block: b, z: ++this.top, ...this.inFrame(b, left + (i % across) * (UNIT + GAP), top + Math.floor(i / across) * (FRAME + GAP)) });
    });
  }

  // ------------------------------------------------------------ sizes and places

  heightOf(it) {
    if (it.block) {
      const r = ratioOf(it.block);
      if (r) return it.w / r;
    }
    if (isWords(it.id)) return it.el ? it.el.offsetHeight : it.mh || 40;
    return it.h || it.w * 5 / 4;
  }

  widthOf(it) { return isWords(it.id) ? (it.el ? it.el.offsetWidth : it.mw || it.w) : it.w; }

  rect(it) { return { x: it.x, y: it.y, w: this.widthOf(it), h: this.heightOf(it) }; }

  bounds(list = [...this.items.values()]) {
    if (!list.length) return null;
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const it of list) {
      const r = this.rect(it);
      x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  order() {
    return readingOrder([...this.items.values()].filter((it) => !isPending(it.id)).map((it) => ({ ...this.rect(it), hh: this.heightOf(it), it })))
      .map((r) => r.it);
  }

  // The planet's files in the board's order (the file view's arrows walk them).
  list() { return this.order().filter((it) => it.block).map((it) => it.block); }

  // ------------------------------------------------------------ the view: where you are and how close

  // The board fills the page from under the planet's header to the foot of the window.
  measure() {
    if (!this.el.isConnected) return;
    // the whole width of the window, so files reach its edges and are never cut off inside the page
    const holder = this.el.parentElement.getBoundingClientRect();
    const across = document.documentElement.clientWidth;
    if (Math.round(holder.left) !== -Math.round(parseFloat(this.el.style.marginLeft) || 0) || this.el.style.width !== `${across}px`) {
      this.el.style.marginLeft = `${-Math.round(holder.left)}px`;
      this.el.style.width = `${across}px`;
    }
    const top = this.el.getBoundingClientRect().top + scrollY;
    const want = Math.max(300, Math.round((visualViewport?.height || innerHeight) - top - 12));
    if (Math.abs(this.el.offsetHeight - want) > 1) this.el.style.height = `${want}px`;
    this.size = { w: this.el.clientWidth, h: this.el.clientHeight };
  }

  setView(next, { remember = true } = {}) {
    const z = clamp(next.z, Z_MIN, Z_MAX);
    this.view = { x: next.x, y: next.y, z };
    this.world.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${z})`;
    this.el.style.setProperty('--z', z);
    let step = DOT * z;
    while (step < 12) step *= 2;
    for (const g of [this.ground, this.nearGround]) {
      g.style.backgroundSize = `${step}px ${step}px`;
      g.style.backgroundPosition = `${this.view.x}px ${this.view.y}px`;
    }
    this.zoomFact.textContent = `${Math.round(z * 100)}%`;
    this.showSoon();
    if (Math.abs(Math.log(z / (this.paintedAt || z))) > 0.25) this.paintLater();
    if (remember) this.rememberSoon();
  }

  rememberSoon() {
    clearTimeout(this.rememberTimer);
    this.rememberTimer = setTimeout(() => {
      try { localStorage.setItem(`mutt:board:${this.drawer.id}`, JSON.stringify(this.view)); } catch { /* a convenience */ }
    }, DUR.move);
  }

  restoreView() {
    try {
      const v = JSON.parse(localStorage.getItem(`mutt:board:${this.drawer.id}`) || 'null');
      if (v && [v.x, v.y, v.z].every(Number.isFinite) && !this.from) { this.setView(v, { remember: false }); return true; }
    } catch { /* fit instead */ }
    return false;
  }

  // Everything in sight, at no more than 100%.
  fit({ glide = false } = {}) {
    const box = this.bounds();
    const { w, h: hh } = this.size;
    if (!box || !w) { this.setView({ x: 48, y: 48, z: 1 }, { remember: false }); return; }
    const pad = w < 640 ? 16 : 48;
    const room = { w: w - pad * 2, h: hh - pad * 2 - 56 };
    const z = clamp(Math.min(room.w / box.w, room.h / box.h, 1), Z_MIN, 1);
    // across, in the middle; down, from the top, as the files sat on the page before
    const to = { z, x: (w - box.w * z) / 2 - box.x * z, y: pad - box.y * z };
    if (glide) this.glideTo(to); else this.setView(to, { remember: false });
  }

  glideTo(to) {
    if (!moving()) { this.setView(to); return; }
    const from = { ...this.view };
    const start = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    cancelAnimationFrame(this.glideFrame);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / DUR.move);
      const k = ease(t);
      // zoom in steps that feel even: through the scale, not the number
      const z = from.z * (to.z / from.z) ** k;
      this.setView({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z });
      if (t < 1) this.glideFrame = requestAnimationFrame(tick);
    };
    this.glideFrame = requestAnimationFrame(tick);
  }

  zoomAt(z, px, py, from = this.view) {
    const k = clamp(z, Z_MIN, Z_MAX) / from.z;
    this.setView({ z: from.z * k, x: px - (px - from.x) * k, y: py - (py - from.y) * k });
  }

  zoomBy(k) {
    const { w, h: hh } = this.size;
    const z = clamp(this.view.z * k, Z_MIN, Z_MAX);
    const r = z / this.view.z;
    this.glideTo({ z, x: w / 2 - (w / 2 - this.view.x) * r, y: hh / 2 - (hh / 2 - this.view.y) * r });
  }

  // A point on the screen, in board units.
  toBoard(cx, cy) {
    const r = this.el.getBoundingClientRect();
    return { x: (cx - r.left - this.view.x) / this.view.z, y: (cy - r.top - this.view.y) / this.view.z };
  }

  middle() {
    const { w, h: hh } = this.size;
    return { x: (w / 2 - this.view.x) / this.view.z, y: (hh / 2 - 28 - this.view.y) / this.view.z };
  }

  // Bring a thing into sight (Tab, a new thing) without moving more than needed.
  reveal(it) {
    const r = this.rect(it);
    const { w, h: hh } = this.size;
    const z = this.view.z;
    const sx = this.view.x + r.x * z;
    const sy = this.view.y + r.y * z;
    const pad = 24;
    let dx = 0; let dy = 0;
    if (sx < pad) dx = pad - sx; else if (sx + r.w * z > w - pad) dx = Math.max(pad - sx, w - pad - (sx + r.w * z));
    if (sy < pad) dy = pad - sy; else if (sy + r.h * z > hh - 72) dy = Math.max(pad - sy, hh - 72 - (sy + r.h * z));
    if (dx || dy) this.glideTo({ ...this.view, x: this.view.x + dx, y: this.view.y + dy });
  }

  // ------------------------------------------------------------ what's on the page

  showSoon() {
    if (this.showFrame) return;
    this.showFrame = requestAnimationFrame(() => { this.showFrame = 0; this.show(); });
  }

  // Build the things within a screen of the view, let go of those well past it.
  show({ entrance = false } = {}) {
    if (!this.ready) return;
    const { x, y, z } = this.view;
    const { w, h: hh } = this.size;
    const near = { x0: (-x - w) / z, y0: (-y - hh) / z, x1: (2 * w - x) / z, y1: (2 * hh - y) / z };
    const far = { x0: (-x - 2 * w) / z, y0: (-y - 2 * hh) / z, x1: (3 * w - x) / z, y1: (3 * hh - y) / z };
    const meets = (r, a) => r.x < a.x1 && r.x + r.w > a.x0 && r.y < a.y1 && r.y + r.h > a.y0;
    const born = [];
    for (const it of this.items.values()) {
      const r = this.rect(it);
      if (!it.el && meets(r, near)) { this.build(it); born.push(it); }
      else if (it.el && !meets(r, far) && it.id !== this.focusId && it !== this.gesture?.it && !it.editing) this.unbuild(it);
    }
    const stop = this.focusId && this.items.get(this.focusId);
    if (stop && !stop.el) this.build(stop);
    if (entrance) this.arrive(born);
    if (this.linesDirty || entrance) this.paintLines();
  }

  build(it) {
    let inner;
    if (isWords(it.id)) {
      inner = h('div', { class: `bd-words is-${it.style || 'heading'}`, 'data-placeholder': 'A few words' }, it.words || '');
    } else if (isPending(it.id)) {
      inner = renderPending(it.pending);
    } else {
      inner = renderCell(it.block, { actions: false });
      inner.removeAttribute('tabindex');
    }
    it.el = h('div', {
      class: `bd-item${isWords(it.id) ? ' is-words' : ' is-file'}${it === this.chosen ? ' is-chosen' : ''}`,
      dataset: { id: it.id },
      tabindex: it.id === this.focusId ? '0' : '-1',
      role: isWords(it.id) ? 'note' : 'link',
      'aria-label': isWords(it.id) ? it.words || 'Words' : displayTitle(it.block || {}) || 'File',
    }, inner, this.editable && !isPending(it.id) ? h('span', { class: 'bd-grip', 'aria-hidden': 'true' }) : null,
    // the board's own words can always be taken away: a small round button at their corner
    this.editable && isWords(it.id) ? h('button', {
      type: 'button', class: 'btn btn-round btn-small bd-drop', tabindex: '-1', 'aria-label': 'Take the words away', title: 'Take the words away',
      // pressed while the words are being written: let go of the writing first, then take them away
      onpointerdown: (e) => e.preventDefault(),
      onclick: (e) => {
        e.stopPropagation();
        if (it.editing) it.el?.querySelector('.bd-words')?.blur();
        if (this.items.get(it.id) === it) this.dropWords(it);
      },
    }, icon('trash', 12)) : null);
    this.place(it);
    this.world.append(it.el);
    if (isWords(it.id)) { it.mh = it.el.offsetHeight; it.mw = it.el.offsetWidth; }
  }

  unbuild(it) {
    // a picture let go of is a picture Safari can let go of too
    it.el.querySelectorAll('img').forEach((img) => { img.src = ''; });
    it.el.remove();
    it.el = null;
  }

  place(it) {
    if (!it.el) return;
    const s = it.el.style;
    s.left = `${it.x}px`;
    s.top = `${it.y}px`;
    s.zIndex = String(Math.max(0, Math.round(it.z || 0)));
    if (isWords(it.id)) { s.maxWidth = `${it.w}px`; return; }
    s.width = `${it.w}px`;
    s.height = `${this.heightOf(it)}px`;
  }

  arrive(list) {
    if (!moving() || !list.length) return;
    if (this.from) {
      // just switched on: each file glides from where it sat in the grid to its place on the board
      const from = this.from;
      this.from = null;
      for (const it of list) {
        const was = from.get(it.id);
        if (!was || !it.el) continue;
        const now = it.el.getBoundingClientRect();
        if (!now.width) continue;
        const k = was.width / now.width;
        it.el.animate([
          { transform: `translate(${(was.left - now.left) / this.view.z}px, ${(was.top - now.top) / this.view.z}px) scale(${k})`, transformOrigin: '0 0' },
          { transform: 'none', transformOrigin: '0 0' },
        ], { duration: DUR.scene, easing: EASE_GLIDE });
      }
      return;
    }
    // opened again: what's in sight arrives, in the board's order, one step apart
    const shown = new Set(list);
    this.order().filter((it) => shown.has(it) && this.inSight(it)).forEach((it, i) => {
      const cell = it.el.querySelector('.cell');
      if (cell) { cell.style.setProperty('--i', String(Math.min(i, 14))); cell.classList.add('reveal'); }
      else it.el.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }],
        { duration: DUR.arrive, easing: EASE, delay: Math.min(i, 14) * STAGGER, fill: 'backwards' });
    });
  }

  inSight(it) {
    const r = this.rect(it);
    const { x, y, z } = this.view;
    return r.x * z + x < this.size.w && (r.x + r.w) * z + x > 0 && r.y * z + y < this.size.h && (r.y + r.h) * z + y > 0;
  }

  // ------------------------------------------------------------ the lines between things

  paintLater() {
    clearTimeout(this.paintTimer);
    this.paintTimer = setTimeout(() => this.paintLines(), DUR.move);
  }

  markLines(id) {
    if (!this.lines.some(([a, b]) => a === id || b === id)) return;
    this.linesDirty = true;
    this.showSoon();
  }

  // From the edge of one thing to the edge of the other, bent a little, the same way each time.
  curveOf(a, b) {
    const A = this.rect(a);
    const B = this.rect(b);
    const ca = { x: A.x + A.w / 2, y: A.y + A.h / 2 };
    const cb = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
    const dx = cb.x - ca.x;
    const dy = cb.y - ca.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return null;
    const ux = dx / len;
    const uy = dy / len;
    const edge = (r) => Math.min(Math.abs(ux) > 1e-6 ? r.w / 2 / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? r.h / 2 / Math.abs(uy) : Infinity);
    // a little off each edge; next-door neighbours (24 apart) still get a short tuft
    const ta = edge(A) + 4;
    const tb = len - edge(B) - 4;
    if (tb - ta < 6) return null;
    const s = { x: ca.x + ux * ta, y: ca.y + uy * ta };
    const e = { x: ca.x + ux * tb, y: ca.y + uy * tb };
    const bend = (seeded(`${a.id}|${b.id}`)() < 0.5 ? -1 : 1) * (tb - ta) * 0.12;
    const c = { x: (s.x + e.x) / 2 - uy * bend, y: (s.y + e.y) / 2 + ux * bend };
    return { s, c, e };
  }

  paintLines() {
    this.linesDirty = false;
    const canvas = this.canvas;
    const curves = [];
    for (const [a, b] of this.lines) {
      const A = this.items.get(a);
      const B = this.items.get(b);
      const curve = A && B && this.curveOf(A, B);
      if (curve) curves.push({ key: `${a}|${b}`, curve });
    }
    if (this.joining && this.joinAt) {
      const A = this.items.get(this.joining);
      if (A) {
        const r = this.rect(A);
        const s = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
        const e = this.joinAt;
        curves.push({ key: 'joining', curve: { s, c: { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 }, e } });
      }
    }
    this.curves = curves;
    if (!curves.length) { canvas.width = canvas.height = 0; return; }
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const { curve } of curves) {
      for (const p of [curve.s, curve.c, curve.e]) {
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
    }
    const pad = 24;
    x0 = Math.floor(x0 - pad); y0 = Math.floor(y0 - pad);
    const W = Math.ceil(x1 + pad) - x0;
    const H = Math.ceil(y1 + pad) - y0;
    const dpr = sharpness();
    // as sharp as the screen at this zoom, and never a huge canvas (Safari keeps all of it)
    const d = Math.min(dpr * this.view.z, Math.sqrt(PAINT_MOST / (W * H)));
    this.paintedAt = this.view.z;
    const pw = Math.max(1, Math.round(W * d));
    const ph = Math.max(1, Math.round(H * d));
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    Object.assign(canvas.style, { left: `${x0}px`, top: `${y0}px`, width: `${W}px`, height: `${H}px` });
    const ctx = canvas.getContext('2d');
    ctx.setTransform(d, 0, 0, d, -x0 * d, -y0 * d);
    ctx.clearRect(x0, y0, W, H);
    ctx.fillStyle = named('--thread');
    // a dot is the threads' size on the screen, whatever the zoom
    const size = (1 / dpr + 0.35) / this.view.z;
    for (const { key, curve } of curves) {
      const buckets = LINE_SHADES.map(() => []);
      wisp((x, y, k) => buckets[clamp(Math.round(k * (LINE_SHADES.length - 1)), 0, LINE_SHADES.length - 1)].push(x, y),
        seeded(`board:${key}`), curve.s, curve.c, curve.e, { strands: 3, width: 2.1, spread: 8, haze: 0.7 });
      buckets.forEach((pts, k) => {
        ctx.globalAlpha = LINE_SHADES[k];
        for (let n = 0; n < pts.length; n += 2) ctx.fillRect(pts[n], pts[n + 1], size, size);
      });
    }
    ctx.globalAlpha = 1;
  }

  // The line under a point on the board, if any.
  lineAt(p) {
    const reach = 12 / this.view.z;
    for (const { key, curve } of this.curves || []) {
      if (key === 'joining') continue;
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const x = (1 - t) * (1 - t) * curve.s.x + 2 * (1 - t) * t * curve.c.x + t * t * curve.e.x;
        const y = (1 - t) * (1 - t) * curve.s.y + 2 * (1 - t) * t * curve.c.y + t * t * curve.e.y;
        if (Math.hypot(p.x - x, p.y - y) < reach) return key.split('|');
      }
    }
    return null;
  }

  startJoin(id) {
    this.joining = id;
    this.joinAt = null;
    this.el.classList.add('is-joining');
    this.tools.hidden = true;
    this.joinBar.hidden = false;
    this.joinBar.querySelector('button').focus({ preventScroll: true });
  }

  stopJoin() {
    if (!this.joining) return;
    const from = this.joining;
    this.joining = null;
    this.joinAt = null;
    this.el.classList.remove('is-joining');
    this.tools.hidden = false;
    this.joinBar.hidden = true;
    this.paintLines();
    this.items.get(from)?.el?.focus({ preventScroll: true });
  }

  join(a, b) {
    this.stopJoin();
    if (a === b) return;
    const pair = [a, b].sort();
    if (this.lines.some(([x, y]) => x === pair[0] && y === pair[1])) { toast('Those are joined already'); return; }
    this.lines.push(pair);
    this.out.join.push(pair);
    this.flushSoon();
    this.paintLines();
    toast('Joined', { action: { label: 'Undo', run: () => this.part(pair, { quiet: true }) } });
  }

  part(pair, { quiet = false } = {}) {
    const [a, b] = [...pair].sort();
    this.lines = this.lines.filter(([x, y]) => !(x === a && y === b));
    this.out.part.push([a, b]);
    this.flushSoon();
    this.paintLines();
    if (!quiet) toast('Line taken away', { action: { label: 'Undo', run: () => { this.lines.push([a, b]); this.out.join.push([a, b]); this.flushSoon(); this.paintLines(); } } });
  }

  linesOf(id) { return this.lines.filter(([a, b]) => a === id || b === id); }

  // ------------------------------------------------------------ saving

  dirty(id) { if (this.editable) this.out.items.add(id); }

  flushSoon() {
    if (!this.editable) return;
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), DUR.arrive);
  }

  async flush() {
    clearTimeout(this.flushTimer);
    const { items, gone, join, part } = this.out;
    if (!items.size && !gone.size && !join.length && !part.length) return;
    this.out = { items: new Set(), gone: new Set(), join: [], part: [] };
    const body = {
      items: [...items].map((id) => this.items.get(id)).filter((it) => it && !isPending(it.id)).map((it) => {
        const one = { id: it.id, x: Math.round(it.x), y: Math.round(it.y), w: Math.round(it.w), h: it.h == null || isWords(it.id) || ratioOf(it.block || {}) ? null : Math.round(it.h), z: it.z || 0 };
        if (isWords(it.id)) Object.assign(one, { words: it.words || '', style: it.style || 'heading' });
        return one;
      }),
      gone: [...gone], join, part,
    };
    try {
      await api.put(`/api/drawers/${this.drawer.id}/board`, body);
    } catch (err) {
      toast(err.message);
    }
  }

  // Show as files again: the grid takes the board's order.
  async keepOrder() {
    await this.flush();
    try { await api.put(`/api/drawers/${this.drawer.id}/order`, { ids: this.list().map((b) => b.id) }); } catch { /* the grid keeps its old order */ }
  }

  // ------------------------------------------------------------ files coming and going

  changed() {
    this.emptyHint.hidden = this.items.size > 0;
    this.onChange?.([...this.blocks.values()]);
  }

  // Where new things go: where they were dropped, else the middle of the view; several in a row.
  landing(i = 0) {
    const at = this.dropAt || this.middle();
    return { x: at.x - UNIT / 2 + i * (UNIT + GAP) * 0.5, y: at.y - FRAME / 2 + i * GAP };
  }

  addPending(item) {
    if (!this.ready || this.items.has(item.key)) return;
    const n = [...this.items.keys()].filter(isPending).length;
    const at = this.landing(n);
    const it = { id: item.key, pending: item, x: at.x, y: at.y, w: UNIT, h: FRAME, z: ++this.top };
    this.items.set(item.key, it);
    this.emptyHint.hidden = true;
    this.build(it);
  }

  updatePendingItem(item) {
    const it = this.items.get(item.key);
    const cell = it?.el?.querySelector('.cell');
    if (cell) updatePending(cell, item);
  }

  arrived(key, block) {
    const was = this.items.get(key);
    if (was) { if (was.el) was.el.remove(); this.items.delete(key); }
    if (!block || this.items.has(block.id)) { this.changed(); return; }
    watchPreview(block);
    this.blocks.set(block.id, block);
    const at = was ? { x: was.x, y: was.y } : this.landing();
    const it = { id: block.id, block, z: ++this.top, ...this.inFrame(block, at.x, at.y) };
    this.items.set(block.id, it);
    this.build(it);
    this.dirty(block.id);
    this.flushSoon();
    this.dropAt = [...this.items.keys()].some(isPending) ? this.dropAt : null;
    this.changed();
  }

  connected(block) {
    if (this.blocks.has(block.id)) { this.patch(block); return; }
    this.blocks.set(block.id, block);
    if (!this.ready) return;
    this.layBelow([block]);
    this.dirty(block.id);
    this.flushSoon();
    this.show();
    this.changed();
  }

  patch(block) {
    const old = this.blocks.get(block.id);
    if (!old) return;
    const next = { ...old, ...block };
    this.blocks.set(block.id, next);
    const it = this.items.get(block.id);
    if (!it) return;
    it.block = next;
    if (it.el) {
      const focused = it.el.contains(document.activeElement);
      this.unbuild(it);
      this.build(it);
      if (focused) it.el.focus({ preventScroll: true });
    }
  }

  // A file taken off the planet or deleted leaves the board; its place is kept for if it comes back.
  remove(id) {
    if (!this.blocks.has(id)) return;
    this.blocks.delete(id);
    const it = this.items.get(id);
    this.items.delete(id);
    if (this.chosen === it) this.chosen = null;
    if (it?.el) {
      const el = it.el;
      if (moving()) el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.94)' }], { duration: DUR.change, easing: EASE_LEAVE }).finished.then(() => el.remove(), () => el.remove());
      else el.remove();
    }
    this.paintLines();
    this.changed();
  }

  // ------------------------------------------------------------ adding

  openAdd() {
    if (this.addPop) { this.addPop.close(); return; }
    const entry = entryCell({
      onText: (text) => { this.addPop?.close(); this.addText(text); },
      onFiles: (files) => { this.addPop?.close(); this.dropAt = null; addFiles(files, this.ctx); },
    });
    this.addPop = openPopover(this.addBtn, h('div', { class: 'bd-add' }, entry), {
      align: 'start', className: 'pop-panel bd-add-pop', width: 320, onClose: () => { this.addPop = null; },
    });
    requestAnimationFrame(() => entry.querySelector('textarea')?.focus());
  }

  async addText(text) {
    const key = `up-${uid()}`;
    const item = { key, text, link: /^https?:\/\/\S+$/i.test(text.trim()), name: '', status: 'uploading', progress: 0.6, ctx: this.ctx };
    this.addPending(item);
    try {
      const { block } = await api.post('/api/blocks', { content: text, drawer: this.drawer.id });
      this.arrived(key, block);
    } catch (err) {
      this.arrived(key, null);
      toast(err.message);
    }
  }

  dropTarget() {
    if (!this.adds) return null;
    return {
      label: `Drop to add to ${this.drawer.title}`,
      el: this.el,
      over: (e) => { this.dropAt = this.toBoard(e.clientX, e.clientY); return `Drop to add to ${this.drawer.title}`; },
      drop: (files, e) => {
        if (e && Number.isFinite(e.clientX)) this.dropAt = this.toBoard(e.clientX, e.clientY);
        addFiles(files, this.ctx);
      },
    };
  }

  pasteText(text) {
    if (!this.adds) return;
    this.dropAt = null;
    this.addText(text);
  }

  // ------------------------------------------------------------ words

  addWords(at = null) {
    if (!this.editable) return;
    const p = at || this.middle();
    const it = { id: `w-${uid()}`, words: '', style: 'heading', x: p.x - 40, y: p.y - 20, w: WORDS_W, h: null, z: ++this.top };
    this.items.set(it.id, it);
    this.emptyHint.hidden = true;
    this.build(it);
    if (moving()) it.el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: DUR.arrive, easing: EASE });
    this.edit(it, { fresh: true });
  }

  edit(it, { fresh = false } = {}) {
    if (!this.editable || !it.el) return;
    const words = it.el.querySelector('.bd-words');
    it.editing = true;
    it.el.classList.add('is-editing');
    words.contentEditable = 'plaintext-only';
    if (words.contentEditable !== 'plaintext-only') words.contentEditable = 'true';
    words.spellcheck = true;
    words.focus({ preventScroll: true });
    const sel = getSelection();
    sel.selectAllChildren(words);
    if (!fresh) sel.collapseToEnd();
    const before = it.words || '';
    const done = (keep = true) => {
      words.removeEventListener('blur', blur);
      words.removeEventListener('keydown', keys);
      words.contentEditable = 'false';
      it.editing = false;
      it.el?.classList.remove('is-editing');
      const text = keep ? words.textContent.replace(/\s+$/, '').slice(0, 300) : before;
      words.textContent = text;
      if (!text.trim()) { this.dropWords(it, { quiet: fresh || !before }); return; }
      if (text !== before) { it.words = text; this.dirty(it.id); this.flushSoon(); }
      it.el?.setAttribute('aria-label', text);
      it.mh = it.el?.offsetHeight;
      it.mw = it.el?.offsetWidth;
      this.markLines(it.id);
    };
    const blur = () => done(true);
    const keys = (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); done(true); it.el?.focus({ preventScroll: true }); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(!fresh || !!words.textContent.trim()); it.el?.focus({ preventScroll: true }); }
      e.stopPropagation();
    };
    words.addEventListener('blur', blur);
    words.addEventListener('keydown', keys);
  }

  dropWords(it, { quiet = false } = {}) {
    const lines = this.linesOf(it.id);
    this.items.delete(it.id);
    it.el?.remove();
    it.el = null;
    this.lines = this.lines.filter((l) => !lines.includes(l));
    if (this.focusId === it.id) this.focusId = null;
    this.paintLines();
    this.changed();
    if (!it.words) return;   // never saved: nothing to take away
    this.out.gone.add(it.id);
    this.flushSoon();
    if (quiet) return;
    toast('Words taken away', {
      action: {
        label: 'Undo',
        run: () => {
          this.out.gone.delete(it.id);
          this.items.set(it.id, it);
          this.build(it);
          this.dirty(it.id);
          for (const l of lines) { this.lines.push(l); this.out.join.push(l); }
          this.flushSoon();
          this.paintLines();
          this.changed();
        },
      },
    });
  }

  // ------------------------------------------------------------ menus

  menu(e, it) {
    const target = it.el;
    const front = { icon: 'up', label: 'Bring to front', run: () => { it.z = ++this.top; this.place(it); this.dirty(it.id); this.flushSoon(); } };
    const lines = this.linesOf(it.id);
    const joins = this.editable ? [
      { icon: 'link', label: 'Join with a line', run: () => this.startJoin(it.id) },
      lines.length ? { icon: 'close', label: lines.length === 1 ? 'Take its line away' : 'Take its lines away', run: () => { for (const l of lines) this.part(l, { quiet: true }); toast(lines.length === 1 ? 'Line taken away' : 'Lines taken away', { action: { label: 'Undo', run: () => { for (const l of lines) { this.lines.push(l); this.out.join.push(l); } this.flushSoon(); this.paintLines(); } } }); } } : null,
      front,
    ].filter(Boolean) : [];
    if (isWords(it.id)) {
      if (!this.editable) return;
      openContextMenu(e, [
        { icon: 'edit', label: 'Change the words', run: () => this.edit(it) },
        { icon: it.style === 'label' ? 'heading' : 'type', label: it.style === 'label' ? 'Make it a heading' : 'Make it a label', run: () => { it.style = it.style === 'label' ? 'heading' : 'label'; this.unbuild(it); this.build(it); this.dirty(it.id); this.flushSoon(); this.markLines(it.id); } },
        ...joins,
        '-',
        { icon: 'trash', label: 'Take the words away', danger: true, run: () => this.dropWords(it) },
      ], { title: it.words || 'Words', target });
      return;
    }
    const block = it.block;
    if (!block) return;
    const open = () => this.open(it);
    if (block.mine === false || !this.editable) {
      openContextMenu(e, [
        { icon: 'open', label: 'Open', run: open },
        block.mine === false ? { icon: 'onto', label: 'Save…', run: () => openSave(target, block, { align: 'end' }) } : null,
        ...(this.editable ? ['-', ...joins] : []),
        this.editable && block.mine === false ? '-' : null,
        this.editable && block.mine === false ? { icon: 'takeoff', label: `Remove ${block.ownerName || `@${block.owner}`}’s file`, danger: true, run: () => this.takeOut(block) } : null,
      ], { title: block.title || undefined, target });
      return;
    }
    const worlds = (this.targets?.() || []).map((t) => ({ title: t.title, dot: t.dot, planet: t.planet, move: () => this.moveTo(t, it) }));
    blockContextMenu(e, target, block, { drawer: this.drawer, open, worlds, extra: joins });
  }

  async takeOut(block) {
    const ok = await confirmDialog({ title: 'Take it out?', message: `It stays with ${personLabel(block.owner, block.ownerName)}.`, confirm: 'Remove', danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/blocks/${block.id}/connections/${this.drawer.id}`);
      this.remove(block.id);
      toast('Removed');
    } catch (err) { toast(err.message); }
  }

  open(it) {
    if (it.block) nav.openBlock(it.block.id);
  }

  // A file carried onto one of the worlds in the header moves there.
  async moveTo(target, it) {
    const block = it.block;
    try {
      target.el?.gulp?.();
      await moveBlock(block, this.drawer, { ...target, onBack: target.onBack });
      target.onMoved?.();
    } catch (err) { toast(err.message); }
  }

  targetAt(cx, cy) {
    let best = null;
    let bestD = Infinity;
    for (const t of this.gesture?.worlds || []) {
      const c = t.measure();
      const d = Math.hypot(cx - c.x, cy - c.y);
      if (d < c.r * 1.25 + 14 && d < bestD) { best = t; bestD = d; }
    }
    return best;
  }

  // ------------------------------------------------------------ choosing and the keyboard

  choose(it) {
    if (this.chosen === it) return;
    this.chosen?.el?.classList.remove('is-chosen');
    this.chosen = it;
    it?.el?.classList.add('is-chosen');
  }

  // Only one thing is a Tab stop at a time; Tab itself walks the board's order.
  focusOn(it) {
    if (!it) return;
    if (!it.el) this.build(it);
    const old = this.focusId && this.items.get(this.focusId);
    if (old?.el) old.el.tabIndex = -1;
    this.focusId = it.id;
    it.el.tabIndex = 0;
    it.el.focus({ preventScroll: true });
    this.reveal(it);
  }

  keydown(e) {
    const el = e.target.closest?.('.bd-item');
    if (e.key === 'Escape') {
      if (this.joining) { e.preventDefault(); e.stopPropagation(); this.stopJoin(); return; }
      if (this.chosen) { this.choose(null); return; }
    }
    if (!el || e.target.isContentEditable) return;
    const it = this.items.get(el.dataset.id);
    if (!it) return;
    if (e.key === 'Tab') {
      const list = this.order();
      const i = list.indexOf(it) + (e.shiftKey ? -1 : 1);
      if (i < 0 || i >= list.length) return;   // out of the board, to the bar or before it
      e.preventDefault();
      this.focusOn(list[i]);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (this.joining) { this.join(this.joining, it.id); return; }
      if (isWords(it.id)) this.edit(it); else this.open(it);
      return;
    }
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      this.menu({ clientX: r.left + 12, clientY: r.top + 12, preventDefault() {} }, it);
      return;
    }
    if (!this.editable) return;
    const step = e.shiftKey ? NUDGE * 6 : NUDGE;
    const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (arrows[e.key]) {
      e.preventDefault();
      it.x += arrows[e.key][0];
      it.y += arrows[e.key][1];
      this.moved(it);
      this.reveal(it);
      return;
    }
    const grow = { '-': 1 / 1.1, _: 1 / 1.1, '=': 1.1, '+': 1.1, '[': 1 / 1.1, ']': 1.1 }[e.key];
    if (grow) {
      e.preventDefault();
      this.resize(it, it.w * grow, it.h ? it.h * grow : null);
      this.dirty(it.id);
      this.flushSoon();
    }
    if (isWords(it.id) && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); this.dropWords(it); }
  }

  moved(it) {
    this.place(it);
    this.markLines(it.id);
    this.dirty(it.id);
    this.flushSoon();
  }

  resize(it, w, hh) {
    it.w = clamp(w, MIN_W, MAX_W);
    if (hh != null && !ratioOf(it.block || {}) && !isWords(it.id)) it.h = clamp(hh, MIN_H, MAX_W * 2);
    this.place(it);
    if (isWords(it.id)) { it.mh = it.el?.offsetHeight; it.mw = it.el?.offsetWidth; }
    this.markLines(it.id);
  }

  // ------------------------------------------------------------ pointing, carrying, moving about

  listen() {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('lostpointercapture', (e) => { if (this.pointers.has(e.pointerId)) this.up(e, true); });
    el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    // Safari's own pinch on a trackpad (and on a phone, where the fingers do it below)
    let start = null;
    el.addEventListener('gesturestart', (e) => { e.preventDefault(); start = { ...this.view, x0: e.clientX, y0: e.clientY }; });
    el.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      if (!start || this.pointers.size > 1) return;
      const r = el.getBoundingClientRect();
      this.zoomAt(start.z * e.scale, start.x0 - r.left, start.y0 - r.top, start);
    });
    el.addEventListener('gestureend', (e) => { e.preventDefault(); start = null; });
    el.addEventListener('dblclick', (e) => {
      if (!this.editable || e.target.closest('.bd-bar')) return;
      const item = e.target.closest('.bd-item');
      if (item && isWords(item.dataset.id)) { this.edit(this.items.get(item.dataset.id)); return; }
      if (!item) this.addWords(this.toBoard(e.clientX, e.clientY));
    });
    el.addEventListener('contextmenu', (e) => {
      const item = e.target.closest('.bd-item');
      if (!item || e.target.isContentEditable) { if (!e.target.closest('.bd-bar')) e.preventDefault(); return; }
      const it = this.items.get(item.dataset.id);
      if (it && !isPending(it.id) && !this.gesture) this.menu(e, it);
      else e.preventDefault();
    });
    el.addEventListener('keydown', (e) => this.keydown(e));
    el.addEventListener('focusin', (e) => {
      const item = e.target.closest?.('.bd-item');
      if (item && item.dataset.id !== this.focusId) {
        const old = this.focusId && this.items.get(this.focusId);
        if (old?.el) old.el.tabIndex = -1;
        this.focusId = item.dataset.id;
        item.tabIndex = 0;
      }
    });
    this.resized = () => { this.measure(); this.showSoon(); };
    addEventListener('resize', this.resized);
    visualViewport?.addEventListener('resize', this.resized);
    // measured on the next frame: measuring sizes the board, which would wake this again at once
    this.watch = new ResizeObserver(() => requestAnimationFrame(() => {
      if (!this.el.isConnected) return;
      const was = this.size.w;
      this.measure();
      if (!was && this.size.w && this.ready && !this.restoreView()) this.fit();
      this.showSoon();
    }));
    this.watch.observe(el);
  }

  down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.bd-bar, button, a, input, textarea') || e.target.isContentEditable) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { this.el.setPointerCapture(e.pointerId); } catch { /* already gone */ }
    if (this.pointers.size === 2) { this.startPinch(); return; }
    if (this.pointers.size > 2) return;
    cancelAnimationFrame(this.glideFrame);
    const touch = e.pointerType !== 'mouse';
    const itemEl = e.target.closest('.bd-item');
    const it = itemEl && this.items.get(itemEl.dataset.id);
    const g = { kind: 'press', it, touch, sx: e.clientX, sy: e.clientY, view: { ...this.view }, id: e.pointerId };
    if (!touch) e.preventDefault();
    if (it && this.editable && !isPending(it.id) && e.target.closest('.bd-grip')) {
      Object.assign(g, { kind: 'resize', w: it.w, h: this.heightOf(it) });
      this.choose(it);
    } else if (it && this.editable && !isPending(it.id) && touch && !this.joining) {
      g.hold = setTimeout(() => { if (this.gesture === g && g.kind === 'press') { this.lift(g); navigator.vibrate?.(8); } }, HOLD);
    }
    this.gesture = g;
  }

  lift(g) {
    const it = g.it;
    g.kind = 'carry';
    g.x = it.x;
    g.y = it.y;
    g.moved = false;
    g.worlds = this.targets?.() || [];
    it.z = ++this.top;
    this.place(it);
    it.el?.classList.add('is-lifted');
    this.el.classList.add('is-carrying');
    this.choose(it);
    // the others' edges and middles, to line up with
    const others = [...this.items.values()].filter((o) => o !== it && o.el).map((o) => this.rect(o));
    g.xs = others.flatMap((r) => [r.x, r.x + r.w / 2, r.x + r.w]);
    g.ys = others.flatMap((r) => [r.y, r.y + r.h / 2, r.y + r.h]);
  }

  move(e) {
    if (!this.pointers.has(e.pointerId)) {
      if (this.joining && e.pointerType === 'mouse') { this.joinAt = this.toBoard(e.clientX, e.clientY); this.paintLinesSoon(); }
      return;
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = this.gesture;
    if (!g) return;
    if (g.kind === 'pinch') { this.pinch(); return; }
    if (g.id !== e.pointerId) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (g.kind === 'press') {
      const far = Math.hypot(dx, dy) > (g.touch ? 10 : 4);
      if (!far) return;
      clearTimeout(g.hold);
      if (g.it && this.editable && !g.touch && !isPending(g.it.id) && !this.joining) this.lift(g);
      else g.kind = 'pan';
    }
    if (g.kind === 'pan') {
      this.setView({ ...this.view, x: g.view.x + dx, y: g.view.y + dy });
      return;
    }
    const z = this.view.z;
    if (g.kind === 'resize') {
      const it = g.it;
      const w = g.w + dx / z;
      this.resize(it, w, g.h + dy / z);
      return;
    }
    if (g.kind === 'carry') {
      g.moved = true;
      const over = this.targetAt(e.clientX, e.clientY);
      if (over !== g.over) {
        g.over?.el.classList.remove('is-target');
        over?.el.classList.add('is-target');
        g.over = over;
        g.it.el?.classList.toggle('is-over-target', !!over);
      }
      const it = g.it;
      const r = this.rect(it);
      let nx = g.x + dx / z;
      let ny = g.y + dy / z;
      // a soft snap: within a few pixels of another thing's edge or middle, it lines up
      const reach = SNAP / z;
      const snap = (pos, size, lines) => {
        let best = null;
        for (const at of [pos, pos + size / 2, pos + size]) {
          for (const line of lines) {
            const d = line - at;
            if (Math.abs(d) < reach && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line };
          }
        }
        return best;
      };
      const sx = e.altKey ? null : snap(nx, r.w, g.xs);
      const sy = e.altKey ? null : snap(ny, r.h, g.ys);
      if (sx) nx += sx.d;
      if (sy) ny += sy.d;
      this.guideV.classList.toggle('is-on', !!sx && !over);
      this.guideH.classList.toggle('is-on', !!sy && !over);
      if (sx) this.guideV.style.transform = `translateX(${this.view.x + sx.line * z}px)`;
      if (sy) this.guideH.style.transform = `translateY(${this.view.y + sy.line * z}px)`;
      it.x = nx;
      it.y = ny;
      this.place(it);
      this.markLines(it.id);
      const box = this.el.getBoundingClientRect();
      this.nearGround.style.setProperty('--hx', `${e.clientX - box.left}px`);
      this.nearGround.style.setProperty('--hy', `${e.clientY - box.top}px`);
      // near the board's edge it moves about to keep the thing in sight
      if (!e.rolling) this.edgeRoll(e);
    }
  }

  // Carried near an edge, the board slides the other way, so a thing can be taken anywhere.
  edgeRoll(e) {
    const g = this.gesture;
    const r = this.el.getBoundingClientRect();
    const edge = 40;
    const vx = e.clientX < r.left + edge ? 1 : e.clientX > r.right - edge ? -1 : 0;
    const vy = e.clientY < r.top + edge ? 1 : e.clientY > r.bottom - edge ? -1 : 0;
    g.roll = vx || vy ? { vx, vy, clientX: e.clientX, clientY: e.clientY, altKey: e.altKey } : null;
    if (g.roll && !this.rollFrame) this.rollFrame = requestAnimationFrame(() => this.rollStep(g));
  }

  rollStep(g) {
    this.rollFrame = 0;
    if (this.gesture !== g || g.kind !== 'carry' || !g.roll) return;
    const speed = 8;
    const { vx, vy } = g.roll;
    this.setView({ ...this.view, x: this.view.x + vx * speed, y: this.view.y + vy * speed });
    g.sx += vx * speed;
    g.sy += vy * speed;
    this.move({ ...g.roll, pointerId: g.id, rolling: true });
    this.rollFrame = requestAnimationFrame(() => this.rollStep(g));
  }

  paintLinesSoon() {
    if (this.lineFrame) return;
    this.lineFrame = requestAnimationFrame(() => { this.lineFrame = 0; this.paintLines(); });
  }

  up(e, cancelled = false) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (!g) return;
    if (g.kind === 'pinch') {
      if (this.pointers.size === 0) this.gesture = null;
      return;
    }
    if (g.id !== e.pointerId) return;
    this.gesture = null;
    clearTimeout(g.hold);
    cancelAnimationFrame(this.rollFrame);
    this.rollFrame = 0;
    this.guideV.classList.remove('is-on');
    this.guideH.classList.remove('is-on');
    this.el.classList.remove('is-carrying');
    if (cancelled && g.kind === 'press') return;
    if (g.kind === 'press') { this.tap(e, g); return; }
    if (g.kind === 'resize') { this.dirty(g.it.id); this.flushSoon(); return; }
    if (g.kind === 'carry') {
      const it = g.it;
      it.el?.classList.remove('is-lifted', 'is-over-target');
      if (g.over) {
        g.over.el.classList.remove('is-target');
        it.x = g.x; it.y = g.y;   // it keeps its place here, for if it comes back
        this.place(it);
        this.moveTo(g.over, it);
        return;
      }
      // held and let go without moving: its menu
      if (!g.moved && g.touch) { this.menu({ clientX: e.clientX, clientY: e.clientY, preventDefault() {} }, it); return; }
      this.moved(it);
    }
  }

  tap(e, g) {
    const it = g.it;
    if (this.joining) {
      if (it && !isPending(it.id)) this.join(this.joining, it.id);
      else this.stopJoin();
      return;
    }
    if (!it) {
      this.choose(null);
      const line = this.editable && this.lineAt(this.toBoard(e.clientX, e.clientY));
      if (line) openContextMenu({ clientX: e.clientX, clientY: e.clientY, preventDefault() {} }, [
        { icon: 'close', label: 'Take the line away', run: () => this.part(line) },
      ], { title: 'Line' });
      return;
    }
    if (isPending(it.id)) return;
    if (isWords(it.id)) {
      if (g.touch && this.editable) this.edit(it);
      else { this.choose(it); this.focusOn(it); }
      return;
    }
    this.open(it);
  }

  startPinch() {
    const g = this.gesture;
    if (g) {
      clearTimeout(g.hold);
      if (g.kind === 'carry') { g.it.el?.classList.remove('is-lifted'); this.moved(g.it); }
    }
    const [a, b] = [...this.pointers.values()];
    const r = this.el.getBoundingClientRect();
    this.gesture = {
      kind: 'pinch', view: { ...this.view },
      d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top,
    };
  }

  pinch() {
    const g = this.gesture;
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;
    const r = this.el.getBoundingClientRect();
    const k = Math.hypot(a.x - b.x, a.y - b.y) / g.d;
    const cx = (a.x + b.x) / 2 - r.left;
    const cy = (a.y + b.y) / 2 - r.top;
    // two fingers zoom about where they started and carry the board along as they move
    const z = clamp(g.view.z * k, Z_MIN, Z_MAX);
    const s = z / g.view.z;
    this.setView({ z, x: cx - (g.cx - g.view.x) * s, y: cy - (g.cy - g.view.y) * s });
  }

  wheel(e) {
    e.preventDefault();
    const r = this.el.getBoundingClientRect();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.size.h : 1;
    if (e.ctrlKey || e.metaKey) {
      // a trackpad's pinch comes as many small steps; a mouse wheel's notch as one big one, held to about a third
      this.zoomAt(this.view.z * Math.exp(-clamp(e.deltaY * unit, -30, 30) * 0.01), e.clientX - r.left, e.clientY - r.top);
      return;
    }
    const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit;
    const dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit;
    this.setView({ ...this.view, x: this.view.x - dx, y: this.view.y - dy });
  }

  // ------------------------------------------------------------

  destroy() {
    this.flush();
    this.off.forEach((off) => off());
    removeEventListener('resize', this.resized);
    visualViewport?.removeEventListener('resize', this.resized);
    this.watch.disconnect();
    this.addPop?.close();
    cancelAnimationFrame(this.glideFrame);
    cancelAnimationFrame(this.rollFrame);
    clearTimeout(this.paintTimer);
    clearTimeout(this.rememberTimer);
  }
}
