// Constellations: a few of your stars (files on no planet) joined in your sky,
// with a name. A light way to group files without making a planet
// (DESIGN.md "Constellations"). Carry one star onto another and they join;
// the figure leaves the cluster round the void and takes a place of its own
// among the planets, its stars joined by faint wisps of print, its name
// under it. Only its owner ever sees it. The files stay stars until it
// becomes a planet, which it offers to do once it holds ENOUGH.
//
// The galaxy page (views/galaxy.js) hands this the layout: each figure is
// laid out like a small planet (`items`), and its stars are placed from the
// spot it gets (`place`).

import { api } from './api.js';
import { modeOffer } from './offers.js';
import { openMenu, openPopover, toast } from './ui.js';
import { DUR, EASE_GLIDE, EASE_LEAVE, h, plural, reducedMotion, seeded } from './util.js';
import { wisp } from './uvweb.js';

export const ENOUGH = 4;            // stars before it offers to become a planet (the user's pick)
const NAME = 'Constellation';       // what one left unnamed is called
const SHADES = [0.1, 0.2, 0.34, 0.52];
const GAP = 4;                      // between a star's edge and the wisp leaving it

// Where each of n stars sits in a figure, from the constellation's own seed: a
// chain that bends gently and now and then branches, the way constellations
// are drawn. A star added keeps the others where they were. `room` caps how
// wide and tall it may grow (stars then sit closer, never touching).
export function figureOf(id, n, m, room) {
  const rand = seeded(`sky:${id}`);
  const d = m.chip * 2.9;
  const pts = [{ x: 0, y: 0, a: rand() * Math.PI * 2 }];
  const links = [];
  for (let k = 1; k < n; k++) {
    const from = k >= 3 && rand() < 0.3 ? Math.floor(rand() * (k - 1)) : k - 1;
    const p = pts[from];
    const bend = (rand() - 0.5) * 2.2;
    let q = null;
    for (let t = 0; t < 16 && !q; t++) {
      const a = p.a + bend + (t ? (t % 2 ? 1 : -1) * Math.ceil(t / 2) * 0.45 : 0);
      const c = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.78, a };
      if (pts.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > d * 0.82)) q = c;
    }
    pts.push(q || { x: p.x + d, y: p.y + d * 0.4, a: p.a });
    links.push([from, k]);
  }
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  // Too big for the room: drawn closer together, never so close that the wisps between them go.
  const k = Math.max(Math.min(1, (room.w - m.chip) / Math.max(1, x1 - x0), (room.h - m.chip) / Math.max(1, y1 - y0)), (m.chip * 2.2) / d);
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  return {
    w: (x1 - x0) * k + m.chip,
    h: (y1 - y0) * k + m.chip,
    at: pts.map((p) => ({ x: (p.x - mx) * k, y: (p.y - my) * k })),
    links,
  };
}

export class Sky {
  // `galaxy` is the page: it lays things out (layout), knows the stars'
  // elements (starsEl) and refreshes itself (refresh).
  constructor(galaxy, list) {
    this.g = galaxy;
    this.figs = new Map();        // constellation id → its figure's elements and shape
    this.el = h('div', { class: 'gx-sky' });
    // its name, and its stars (which live with the other stars), light it
    for (const layer of [this.el, galaxy.starsEl]) {
      layer.addEventListener('pointerover', (e) => this.light(this.figAt(e.target)));
      layer.addEventListener('pointerleave', () => this.light(null));
      layer.addEventListener('focusin', (e) => this.light(this.figAt(e.target)));
      layer.addEventListener('focusout', (e) => { if (!layer.contains(e.relatedTarget)) this.light(null); });
    }
    this.set(list);
  }

  set(list) {
    this.list = list || [];
    this.of = new Map();
    for (const c of this.list) for (const id of c.stars) this.of.set(id, c);
    for (const [id, fig] of this.figs) {
      if (this.list.some((c) => c.id === id)) continue;
      fig.root.remove();
      this.figs.delete(id);
    }
    for (const c of this.list) {
      let fig = this.figs.get(c.id);
      if (!fig) {
        const canvas = h('canvas', { class: 'gx-fig-lines', width: 0, height: 0, 'aria-hidden': 'true' });
        const name = h('span', { class: 'planet-name' });
        const meta = h('span', { class: 'planet-meta' });
        const label = h('button', { type: 'button', class: 'gx-fig-name', 'aria-haspopup': 'menu' }, name, meta);
        label.addEventListener('click', () => this.menu(this.byId(c.id), label));
        label.addEventListener('contextmenu', (e) => { e.preventDefault(); this.menu(this.byId(c.id), label); });
        const root = h('div', { class: 'gx-fig is-new', dataset: { id: c.id } }, canvas, label);
        fig = { root, canvas, label, name, meta, key: '' };
        this.figs.set(c.id, fig);
        this.el.append(root);
      }
      fig.name.textContent = c.title || NAME;
      fig.meta.textContent = plural(c.stars.length, 'star');
      fig.label.setAttribute('aria-label', `${c.title || NAME}, a constellation of ${plural(c.stars.length, 'star')}`);
    }
  }

  byId(id) { return this.list.find((c) => c.id === id) || null; }
  has(blockId) { return this.of.has(blockId); }
  figAt(node) {
    const star = node?.closest?.('.star[data-id]');
    return star ? this.of.get(star.dataset.id)?.id || null : node?.closest?.('.gx-fig')?.dataset.id || null;
  }

  // Each constellation as the layout sees it: a small planet with no files of its own.
  items(m, width) {
    const room = { w: m.narrow ? width - 48 : Math.max(m.wide * 3, 420), h: m.narrow ? 240 : 320 };
    return this.list.map((c) => {
      const shape = figureOf(c.id, c.stars.length, m, room);
      return { id: `sky:${c.id}`, sky: c, shape, count: 0, x: null, y: null };
    });
  }

  // Put each figure where the layout put it; gives where each of its stars goes.
  place(items, spots) {
    const at = new Map();
    items.forEach((item, i) => {
      const spot = spots[i];
      const fig = this.figs.get(item.sky.id);
      if (!spot || !fig) return;
      const { shape } = item;
      fig.shape = shape;
      fig.spot = spot;
      item.sky.stars.forEach((id, k) => at.set(id, { x: spot.x + shape.at[k].x, y: spot.y + shape.at[k].y }));
      // a new figure appears where it is; one that moves glides with its stars
      if (!fig.placed) fig.root.style.transition = 'none';
      fig.root.style.transform = `translate(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px)`;
      if (!fig.placed) { void fig.root.offsetWidth; fig.root.style.transition = ''; fig.placed = true; }
      fig.label.style.top = `${(shape.h / 2 + 10).toFixed(1)}px`;
      const key = `${item.sky.stars.join(',')}|${shape.w.toFixed(1)}|${shape.h.toFixed(1)}`;
      if (key !== fig.key) {
        const was = fig.key;
        fig.key = key;
        this.paint(item.sky.id);
        // A new shape: its wisps come in once the stars have glided to it.
        if (was && !reducedMotion()) fig.canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.move, delay: DUR.scene, fill: 'backwards' });
      }
    });
    return at;
  }

  // Its wisps, on one canvas only as big as the figure (DESIGN.md "What Mutt may cost").
  paint(id) {
    const fig = this.figs.get(id);
    const c = this.byId(id);
    if (!fig?.shape || !c) return;
    const { shape } = fig;
    const lit = this.litId === id;
    const pad = 12;
    const W = shape.w + pad * 2;
    const H = shape.h + pad * 2;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const canvas = fig.canvas;
    const pw = Math.round(W * dpr);
    const ph = Math.round(H * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    Object.assign(canvas.style, { left: `${-W / 2}px`, top: `${-H / 2}px`, width: `${W}px`, height: `${H}px` });
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, (W / 2) * dpr, (H / 2) * dpr);
    ctx.clearRect(-W / 2, -H / 2, W, H);
    const root = getComputedStyle(document.documentElement);
    ctx.fillStyle = root.getPropertyValue(lit ? '--thread-on' : '--thread').trim();
    const r = this.g.m.chip / 2 + GAP;
    const size = 1 / dpr + 0.3;
    const buckets = SHADES.map(() => []);
    const dot = (x, y, b) => buckets[Math.max(0, Math.min(SHADES.length - 1, Math.round(b * (SHADES.length - 1))))].push(x, y);
    for (const [i, j] of shape.links) {
      const a = shape.at[i];
      const b = shape.at[j];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len <= r * 2 + 4) continue;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const s = { x: a.x + ux * r, y: a.y + uy * r };
      const e = { x: b.x - ux * r, y: b.y - uy * r };
      // the faintest of bows, so it reads as drifting dust and not a ruled line
      const rand = seeded(`sky:${id}:${c.stars[i]}:${c.stars[j]}`);
      const bow = (rand() - 0.5) * len * 0.16;
      const mid = { x: (s.x + e.x) / 2 - uy * bow, y: (s.y + e.y) / 2 + ux * bow };
      wisp(dot, rand, s, mid, e, { strands: 3, width: 1.7, spread: 4, haze: 0.6 });
    }
    buckets.forEach((pts, b) => {
      ctx.globalAlpha = Math.min(1, SHADES[b] * (lit ? 2.3 : 1.5));
      for (let n = 0; n < pts.length; n += 2) ctx.fillRect(pts[n], pts[n + 1], size, size);
    });
    ctx.globalAlpha = 1;
  }

  // A figure pointed at (or one of its stars, or its name) paints its wisps stronger.
  light(id) {
    id ||= this.offer ? this.offer.id : null;   // the one being offered stays lit
    if (id === this.litId) return;
    const was = this.litId;
    this.litId = id;
    if (was) this.paint(was);
    if (id) this.paint(id);
  }

  // ------------------------------------------------------------ joining

  // What a star being carried over another one says, for the label above it.
  joinWords(dragged, target) {
    const into = this.of.get(target);
    if (into && into === this.of.get(dragged)) return null;
    return into ? `Join ${into.title || NAME}` : 'New constellation';
  }

  // `blockId` carried onto `targetId`: into the target's constellation, or a new
  // one of the two. `at` is where it was let go, in the galaxy's own pixels.
  async join(blockId, targetId, at) {
    const into = this.of.get(targetId);
    if (blockId === targetId || (into && into === this.of.get(blockId))) return false;
    if (at) this.g.holdStar(blockId, at);
    try {
      const res = into
        ? await api.post(`/api/constellations/${into.id}/stars`, { block: blockId })
        : await api.post('/api/constellations', { stars: [targetId, blockId] });
      this.set(res.constellations);
      this.g.layout();
      const c = this.byId(res.constellation.id);
      if (!into) this.askName(c, { first: true });
      else this.maybeOffer(c);
      return c;
    } catch (err) {
      toast(err.message);
      this.g.layout();
      return false;
    }
  }

  // Is `at` (the galaxy's own pixels) over a star's own figure? Let go there, it stays.
  inFigure(blockId, at) {
    const c = this.of.get(blockId);
    const fig = c && this.figs.get(c.id);
    if (!fig?.spot) return false;
    const pad = this.g.m.chip;
    return Math.abs(at.x - fig.spot.x) < fig.shape.w / 2 + pad && Math.abs(at.y - fig.spot.y) < fig.shape.h / 2 + pad;
  }

  // A star let go in the open sky leaves its constellation.
  async takeOut(blockId, at) {
    const c = this.of.get(blockId);
    if (!c) return false;
    if (at) this.g.holdStar(blockId, at);
    const before = { title: c.title, stars: [...c.stars] };
    try {
      const res = await api.del(`/api/constellations/${c.id}/stars/${blockId}`);
      this.set(res.constellations);
      this.g.layout();
      toast(`Taken out of ${c.title || NAME}`, { action: { label: 'Undo', run: () => this.bringBack(c.id, before, blockId) } });
    } catch (err) {
      toast(err.message);
    }
    return true;
  }

  // Undo: back into the same constellation, or the whole one made again if it ended.
  async bringBack(id, before, blockId) {
    try {
      const res = this.byId(id) && blockId
        ? await api.post(`/api/constellations/${id}/stars`, { block: blockId })
        : await api.post('/api/constellations', { stars: before.stars.filter((s) => this.g.isStar(s)), title: before.title });
      this.set(res.constellations);
      this.g.layout();
    } catch (err) {
      toast(err.message);
    }
  }

  async breakUp(c) {
    const before = { title: c.title, stars: [...c.stars] };
    try {
      const res = await api.del(`/api/constellations/${c.id}`);
      this.set(res.constellations);
      this.g.layout();
      toast(`${c.title || NAME} broken up`, { action: { label: 'Undo', run: () => this.bringBack(c.id, before) } });
    } catch (err) {
      toast(err.message);
    }
  }

  // ------------------------------------------------------------ its name

  // The small panel that names it: opened by itself when two stars first join,
  // and from its menu. Left empty, it is called "Constellation".
  askName(c, { first = false } = {}) {
    const fig = c && this.figs.get(c.id);
    if (!fig) return;
    const input = h('input', {
      class: 'field', type: 'text', maxlength: 80, value: first || c.title === NAME ? '' : c.title,
      placeholder: NAME, 'aria-label': 'Name', autocomplete: 'off', spellcheck: 'true',
    });
    const done = h('button', { type: 'submit', class: 'btn btn-main btn-small' }, first ? 'Name it' : 'Rename');
    const form = h('form', { class: 'parts-stack gx-fig-namer' },
      h('label', { class: 'liv-label' }, first ? 'Name this constellation' : 'Rename'), input, h('div', { class: 'gx-fig-namer-btns' }, done));
    let saved = false;
    const save = async () => {
      if (saved) return;
      saved = true;
      const title = input.value.trim() || NAME;
      if (title === c.title) return;
      try {
        const res = await api.patch(`/api/constellations/${c.id}`, { title });
        this.list = this.list.map((x) => (x.id === c.id ? res.constellation : x));
        this.set(this.list);
      } catch (err) {
        toast(err.message);
      }
    };
    const pop = openPopover(fig.label, form, { className: 'pop-panel', width: 280, onClose: () => { if (!first) return; save(); } });
    form.addEventListener('submit', (e) => { e.preventDefault(); save(); pop.close(); });
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
  }

  menu(c, anchor) {
    if (!c) return;
    const n = c.stars.length;
    openMenu(anchor, [
      { icon: 'edit', label: 'Rename', run: () => this.askName(c) },
      n >= 2 ? { icon: 'planet', label: 'Make it a planet', run: () => this.becomePlanet(c) } : null,
      '-',
      { icon: 'close', label: 'Break up', run: () => this.breakUp(c) },
    ]);
  }

  // ------------------------------------------------------------ becoming a planet

  // Offered once a constellation holds enough, one at a time, never again once
  // waved away (its menu still has "Make it a planet").
  maybeOffer(c = this.list.find((x) => x.stars.length >= ENOUGH && !x.dismissed)) {
    if (!c || c.stars.length < ENOUGH || c.dismissed || this.offer) return;
    const fig = this.figs.get(c.id);
    if (!fig?.spot) return;
    const holder = h('div', { class: 'gx-fig-offer' });
    const offer = modeOffer({
      drawing: 'sky',
      title: 'This constellation could be a planet',
      signs: [`${plural(c.stars.length, 'star')} joined as ${c.title || NAME}.`],
      note: 'Its files go onto a new planet of the same name, where this constellation is. Nothing is lost.',
      accept: 'Make it a planet',
      busy: 'Making a planet…',
      onAccept: async () => { await this.becomePlanet(c, offer); return true; },
      onDecline: async () => {
        this.offer = null;
        c.dismissed = true;
        holder.remove();
        this.light(null);
        try { await api.patch(`/api/constellations/${c.id}`, { dismissed: true }); } catch (err) { toast(err.message); }
      },
    });
    this.offer = { id: c.id, holder, el: offer };
    // At the foot of the screen, with its constellation's wisps lit so it's plain which one it means.
    this.g.el.append(holder);
    offer.show(holder);
    this.light(c.id);
  }

  async becomePlanet(c, offer = null) {
    const fig = this.figs.get(c.id);
    const spot = fig?.spot;
    // On a galaxy arranged by hand the planet takes the constellation's place.
    const xy = spot && this.g.data.planets.some((p) => p.x != null && p.y != null) ? this.g.layoutPoint(spot) : {};
    const gather = this.gather(c);
    try {
      const res = await api.post(`/api/constellations/${c.id}/planet`, xy);
      offer?.fade();
      await gather;
      this.offer?.holder.remove();
      this.offer = null;
      this.set(res.constellations);
      await this.g.refresh();
      toast(`${res.drawer.title} is a planet now`);
    } catch (err) {
      toast(err.message);
      this.g.layout();
    }
  }

  // Its stars draw together into one point, where the planet will be born.
  gather(c) {
    const fig = this.figs.get(c.id);
    if (!fig?.spot || reducedMotion()) return Promise.resolve();
    const { x, y } = fig.spot;
    const moves = c.stars.map((id) => this.g.starsEl.querySelector(`.star[data-id="${CSS.escape(id)}"]`)).filter(Boolean).map((el) =>
      el.animate([{ transform: el.style.transform, opacity: 1 }, { transform: `translate(${x}px, ${y}px) scale(0.3)`, opacity: 0 }],
        { duration: DUR.scene, easing: EASE_GLIDE, fill: 'forwards' }).finished.catch(() => {}));
    moves.push(fig.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.change, easing: EASE_LEAVE, fill: 'forwards' }).finished.catch(() => {}));
    return Promise.all(moves);
  }

  // ------------------------------------------------------------ the keyboard

  // "Join with another star" in a star's menu: it lifts, the arrow keys go from
  // star to star, Enter joins, Escape stops. A click on a star joins too.
  pick(blockId) {
    this.stopPicking();
    const all = () => [...this.g.starsEl.querySelectorAll('.star[data-id]')];
    const self = all().find((el) => el.dataset.id === blockId);
    if (!self) return;
    self.classList.add('is-picking');
    let on = null;
    const aim = (el) => {
      on?.classList.remove('is-target');
      on = el;
      if (!el) return;
      el.classList.add('is-target');
      el.focus({ preventScroll: false });
    };
    const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    // The nearest star that way (within a wide cone), or the nearest at all.
    const step = (dx, dy) => {
      const from = centre(on || self);
      let best = null;
      let bestD = Infinity;
      for (const el of all()) {
        if (el === self || el === on) continue;
        const p = centre(el);
        const vx = p.x - from.x;
        const vy = p.y - from.y;
        const along = vx * dx + vy * dy;
        if (along <= 0) continue;
        const d = Math.hypot(vx, vy) + Math.abs(vx * dy - vy * dx) * 1.5;
        if (d < bestD) { bestD = d; best = el; }
      }
      if (best) aim(best);
    };
    const keys = (e) => {
      const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (dirs[e.key]) { e.preventDefault(); e.stopPropagation(); step(...dirs[e.key]); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.stopPicking(self); return; }
      if ((e.key === 'Enter' || e.key === ' ') && on) { e.preventDefault(); e.stopPropagation(); finish(on); }
    };
    const click = (e) => {
      const el = e.target.closest?.('.star[data-id]');
      e.preventDefault();
      e.stopImmediatePropagation();
      if (el && el !== self) finish(el);
      else this.stopPicking(self);
    };
    const finish = async (el) => {
      this.stopPicking();
      const c = await this.join(blockId, el.dataset.id, null);
      if (c && c.stars.length > 2) toast(`Joined ${c.title || NAME}`);
    };
    document.addEventListener('keydown', keys, true);
    document.addEventListener('click', click, true);
    this.picking = () => {
      document.removeEventListener('keydown', keys, true);
      document.removeEventListener('click', click, true);
      self.classList.remove('is-picking');
      on?.classList.remove('is-target');
    };
    toast('Pick a star to join it with: the arrow keys move, Enter joins, Escape stops.');
    step(1, 0);
    if (!on) step(-1, 0);
  }

  stopPicking(back = null) {
    this.picking?.();
    this.picking = null;
    back?.focus({ preventScroll: true });
  }

  destroy() {
    this.stopPicking();
    this.offer?.holder.remove();
    this.offer = null;
  }
}
