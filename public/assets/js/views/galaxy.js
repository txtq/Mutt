// Your galaxy: the main page. Planets (your drawers) circle a black hole
// that everything new goes in through; loose files drift further down as
// stars. Swipe sideways (or use the arrows and dots) to visit other people's
// galaxies, and Community at the end.

import { blockMenu, openConnect } from '../actions.js';
import { api, session } from '../api.js';
import { blackHole } from '../blackhole.js';
import { draggable } from '../drag.js';
import { arcTo, burst, center, chipFrom, float, shockwave, spiralInto } from '../fx.js';
import { nav } from '../nav.js';
import { generateIcon, renderIcon } from '../pixel.js';
import { STAR_COLORS, glyph, planetEl, planetSize, starIcon } from '../planets.js';
import { updatePrefs } from '../theme.js';
import { openDialog, pinField, toast } from '../ui.js';
import { addFiles } from '../uploads.js';
import { bus, debounce, h, isEditable, reducedMotion, seeded, wait } from '../util.js';
import { viewerOpen } from '../viewer.js';

// Files made this visit, parked by the black hole until they find a planet.
const fresh = new Set();
// Set just before sliding to a neighbour, so the next galaxy comes in from that side.
let entering = 0;
let order = null;

export async function galaxyOrder(force = false) {
  if (!order || force) order = (await api.get('/api/galaxies')).galaxies;
  return order;
}

const galaxyUrl = (g) => (g.community ? '/community' : g.you ? '/' : `/g/${g.username}`);

function excerpt(text, n = 90) {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

const starTitle = (b) => b.title || (b.kind === 'text' ? excerpt(b.content || '', 40) : b.fileName) || 'Untitled';

// ---------------------------------------------------------------- swiping between galaxies

function pager(index, list, slide) {
  const dots = h('nav', { class: 'gx-dots', 'aria-label': 'Galaxies' },
    list.map((g, i) => h('button', {
      type: 'button', class: `gx-dot${i === index ? ' is-on' : ''}${g.community ? ' is-community' : ''}`,
      title: g.community ? 'Community' : g.you ? 'Your galaxy' : `@${g.username}`,
      'aria-label': g.community ? 'Community' : g.you ? 'Your galaxy' : `@${g.username}’s galaxy`,
      'aria-current': i === index ? 'page' : null,
      onclick: () => i !== index && slide(i),
    })));
  const arrow = (dir) => {
    const g = list[index + dir];
    if (!g) return null;
    return h('button', {
      type: 'button', class: `gx-arrow gx-arrow-${dir < 0 ? 'prev' : 'next'}`,
      'aria-label': g.community ? 'Community' : g.you ? 'Your galaxy' : `@${g.username}’s galaxy`,
      onclick: () => slide(index + dir),
    }, glyph('chevron', 14), h('span', { class: 'gx-arrow-name' }, g.community ? 'Community' : g.you ? 'You' : `@${g.username}`));
  };
  return { dots, prev: arrow(-1), next: arrow(1) };
}

// Drag the empty sky sideways to go to the next galaxy over.
function swipeable(surface, moving, { canGo, go }) {
  surface.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.planet, .star, .bh, .sun, button, a, input, textarea, .gx-stars-head')) return;
    const start = { x: e.clientX, y: e.clientY, t: performance.now() };
    let dx = 0;
    let mode = null;
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!mode) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
        if (mode === 'x') document.body.classList.add('is-swiping');
      }
      if (mode !== 'x') return;
      const dir = dx < 0 ? 1 : -1;
      const pull = canGo(dir) ? dx : dx * 0.25; // rubber band at the ends
      moving.style.transform = `perspective(1600px) translateX(${pull}px) rotateY(${(-pull / innerWidth) * 10}deg)`;
      moving.style.opacity = String(1 - Math.min(0.5, Math.abs(pull) / innerWidth));
    };
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      document.body.classList.remove('is-swiping');
      if (mode !== 'x') return;
      const dir = dx < 0 ? 1 : -1;
      const fast = Math.abs(dx) / (performance.now() - start.t) > 0.6;
      if (canGo(dir) && (Math.abs(dx) > innerWidth * 0.2 || (fast && Math.abs(dx) > 40))) go(dir);
      else {
        moving.animate([{ transform: moving.style.transform, opacity: moving.style.opacity }, { transform: 'none', opacity: 1 }],
          { duration: 480, easing: 'cubic-bezier(0.34, 1.3, 0.64, 1)' });
        moving.style.transform = '';
        moving.style.opacity = '';
      }
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  });
}

async function slideAway(el, dir) {
  entering = dir;
  if (reducedMotion()) return;
  const from = el.style.transform || 'none';
  await el.animate([
    { transform: from, opacity: el.style.opacity || 1 },
    { transform: `perspective(1600px) translateX(${-dir * innerWidth * 0.7}px) rotateY(${dir * 14}deg) scale(0.92)`, opacity: 0 },
  ], { duration: 380, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' }).finished.catch(() => {});
}

function playEntrance(moving, planets, core) {
  if (reducedMotion()) { entering = 0; return; }
  const dir = entering;
  entering = 0;
  if (dir) {
    moving.animate([
      { transform: `perspective(1600px) translateX(${dir * innerWidth * 0.6}px) rotateY(${-dir * 14}deg) scale(0.94)`, opacity: 0 },
      { transform: 'none', opacity: 1 },
    ], { duration: 620, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
  }
  core?.animate([{ transform: 'scale(0.3)', opacity: 0, filter: 'blur(8px)' }, { transform: 'none', opacity: 1, filter: 'none' }],
    { duration: 900, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
  planets.forEach((p, i) => {
    p.body.animate([
      { transform: 'scale(0.15)', opacity: 0, filter: 'blur(6px)' },
      { transform: 'scale(1.06)', opacity: 1, filter: 'none', offset: 0.7 },
      { transform: 'none', opacity: 1 },
    ], { duration: 900, delay: 120 + i * 55, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' });
  });
}

// ---------------------------------------------------------------- layout: planets on orbits

function perimeter(rx, ry) {
  return Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
}

// Rings of planets around the middle, inner rings first. Wide screens get
// flat ellipses; tall ones grow downwards and the page scrolls.
function arrange(planets, width, viewH, coreR) {
  const narrow = width < 640;
  const scale = narrow ? 0.7 : width < 1000 ? 0.85 : 1;
  const sizes = planets.map((p) => planetSize(p.count, scale));
  const big = Math.max(56, ...sizes);
  const labelRoom = 46;
  const margin = 14 + big / 2;
  const aspect = Math.max(0.5, Math.min(1.35, (viewH / width) * 0.95));
  const step = big + labelRoom + (narrow ? 10 : 26);
  // The first orbit has to clear the hole's glowing disk sideways, and above
  // and below it the planets' labels and the hole's own "Add".
  const rxMin = coreR * 1.6 + big / 2 + (narrow ? 12 : 24);
  const ryMin = coreR + big / 2 + labelRoom + (narrow ? 16 : 30);
  let r = Math.max(coreR + big / 2 + (narrow ? 34 : 54), Math.min(width, viewH) * 0.3);
  const rings = [];
  let i = 0;
  while (i < planets.length) {
    const k = rings.length;
    const rx = Math.min(Math.max(r, rxMin + k * step), width / 2 - margin);
    const ry = Math.max(r * aspect, ryMin + k * step);
    const room = Math.max(3, Math.floor(perimeter(rx, ry) / (big + (narrow ? 24 : 44))));
    const n = Math.min(room, planets.length - i);
    rings.push({ rx, ry, start: i, n });
    i += n;
    r += step;
  }
  const outer = rings.length ? rings[rings.length - 1].ry : coreR;
  const height = Math.max(viewH, outer * 2 + big + labelRoom * 2 + 40);
  const cx = width / 2;
  const cy = height / 2;
  const spots = [];
  rings.forEach((ring, k) => {
    const offset = -Math.PI / 2 + k * 0.7 + (ring.n % 2 ? 0 : Math.PI / ring.n / 2);
    for (let j = 0; j < ring.n; j++) {
      const a = offset + (j / ring.n) * Math.PI * 2;
      spots.push({ x: cx + Math.cos(a) * ring.rx, y: cy + Math.sin(a) * ring.ry, size: sizes[ring.start + j] });
    }
  });
  return { spots, rings, cx, cy, height, scale };
}

function orbitsSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'gx-orbits');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

function drawOrbits(svg, { rings, cx, cy, height }, width) {
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.replaceChildren(...rings.map((ring, k) => {
    const e = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    e.setAttribute('cx', cx);
    e.setAttribute('cy', cy);
    e.setAttribute('rx', ring.rx);
    e.setAttribute('ry', ring.ry);
    e.setAttribute('pathLength', '100');
    e.style.setProperty('--k', k);
    return e;
  }));
}

// ---------------------------------------------------------------- someone else's middle

function sunCore(username) {
  const el = h('div', { class: 'sun' },
    h('span', { class: 'sun-rays' }),
    h('span', { class: 'sun-ball' }, h('span', { class: 'planet-gloss' })),
    h('span', { class: 'sun-name' }, `@${username}`));
  return el;
}

// ---------------------------------------------------------------- the page

function starPeek(block) {
  if (block.thumb) return h('span', { class: 'star-peek star-peek-img' }, h('img', { alt: '', 'data-src': block.thumb }));
  const text = block.kind === 'text' ? block.content : block.meta?.description || block.fileName || block.title;
  return h('span', { class: 'star-peek' }, h('span', null, excerpt(text || '', 140)));
}

function ghostFor(block) {
  const g = h('div', { class: 'star-ghost' }, starIcon(block.kind, 40));
  g.style.setProperty('--star', STAR_COLORS[block.kind] || STAR_COLORS.other);
  return g;
}

function cometFor(block, from, to) {
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  const el = h('div', { class: 'comet', style: { '--star': STAR_COLORS[block.kind] || STAR_COLORS.other, '--angle': `${angle}deg` } },
    h('span', { class: 'comet-tail' }), starIcon(block.kind, 26));
  return el;
}

class Galaxy {
  constructor(data, list) {
    this.data = data;
    this.mine = !!data.user.you;
    this.owner = data.user.username;
    this.planetEls = new Map();
    this.stars = data.stars || [];
    this.list = list;
    this.index = this.mine ? list.findIndex((g) => g.you) : list.findIndex((g) => g.username === this.owner);
    this.off = [];

    this.field = h('div', { class: 'gx-field' });
    this.orbits = orbitsSvg();
    if (this.mine) {
      this.hole = blackHole({
        autosort: !!session.prefs.autosort,
        onAutosort: (on) => updatePrefs({ autosort: on }),
        onText: (text, from, sort) => this.addText(text, from, sort),
        onFiles: (files, from, sort) => this.addFiles(files, from, sort),
      });
      this.coreEl = this.hole.el;
    } else {
      this.coreEl = sunCore(this.owner);
    }
    this.coreWrap = h('div', { class: 'gx-core' }, this.coreEl);
    this.freshEl = h('div', { class: 'gx-fresh' });
    this.hint = h('p', { class: 'gx-hint' });
    this.sky = h('section', { class: 'gx-sky', 'aria-label': this.mine ? 'Your planets' : `@${this.owner}’s planets` },
      this.orbits, this.coreWrap, this.field, this.freshEl, this.hint);

    if (this.mine) {
      this.starGrid = h('div', { class: 'gx-starfield' });
      this.starCount = h('span', { class: 'gx-stars-n' });
      this.starsEmpty = h('p', { class: 'gx-stars-empty' }, 'No loose stars. Everything has a planet.');
      this.starsSection = h('section', { class: 'gx-stars', 'aria-label': 'Stars' },
        h('header', { class: 'gx-stars-head' },
          h('h2', { class: 'gx-stars-title' }, glyph('star', 12), h('span', null, 'Stars'), this.starCount),
          h('p', { class: 'gx-stars-sub' }, 'Loose files. Drag one onto a planet, or back into the black hole to sort it.')),
        this.starGrid, this.starsEmpty);
      this.dock = h('div', { class: 'gx-dock', 'aria-hidden': 'true' });
    }

    this.moving = h('div', { class: 'gx-moving' }, this.sky, this.starsSection || null);
    const { dots, prev, next } = pager(this.index, list, (i) => this.slide(i));
    this.el = h('div', { class: 'galaxy' }, dots, prev, next, this.moving, this.dock || null);
    swipeable(this.sky, this.moving, {
      canGo: (dir) => !!this.list[this.index + dir],
      go: (dir) => this.slide(this.index + dir),
    });

    for (const p of data.planets) this.addPlanet(p);
    if (this.mine) this.renderStars();
    this.layout();
    this.setHint();

    this.relayout = debounce(() => this.layout(), 120);
    addEventListener('resize', this.relayout);
    this.refresh = debounce(() => this.reload(), 450);
    if (this.mine) this.listen();
  }

  // ------------------------------------------------------------ planets

  addPlanet(planet, { born = false } = {}) {
    const el = planetEl(planet);
    el.ball.dataset.vt = `planet-${planet.id}`;
    if (planet.locked) {
      el.addEventListener('click', (e) => { e.preventDefault(); this.unlock(); });
    }
    this.planetEls.set(planet.id, el);
    this.field.append(el);
    if (born && !reducedMotion()) {
      el.body.animate([
        { transform: 'scale(0)', filter: 'brightness(3) blur(4px)' },
        { transform: 'scale(1.25)', filter: 'brightness(1.6)', offset: 0.55 },
        { transform: 'none', filter: 'none' },
      ], { duration: 900, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }
    return el;
  }

  layout() {
    const width = this.sky.clientWidth || innerWidth;
    const viewH = innerHeight - 34;
    const coreR = width < 640 ? 54 : 74;
    const planets = this.data.planets;
    const plan = arrange(planets, width, viewH, coreR);
    this.sky.style.height = `${plan.height}px`;
    this.coreWrap.style.transform = `translate(${plan.cx}px, ${plan.cy}px)`;
    this.center = { x: plan.cx, y: plan.cy };
    drawOrbits(this.orbits, plan, width);
    planets.forEach((p, i) => {
      const el = this.planetEls.get(p.id);
      const spot = plan.spots[i];
      if (!el || !spot) return;
      el.update(p, { size: spot.size });
      el.style.transform = `translate(${spot.x}px, ${spot.y}px)`;
    });
    this.placeFresh();
    // Only glide between spots once the first arrangement has landed.
    if (!this.field.classList.contains('is-live')) requestAnimationFrame(() => requestAnimationFrame(() => this.field.classList.add('is-live')));
  }

  setHint() {
    if (this.mine) {
      const empty = !this.data.planets.length && !this.stars.length;
      this.hint.textContent = empty ? 'Your galaxy is empty. Click the black hole to put something in.' : '';
    } else if (!this.data.planets.length) {
      this.hint.textContent = `@${this.owner} hasn’t shared any planets yet.`;
    } else if (this.data.planets.some((p) => p.locked) && !this.data.unlocked) {
      this.hint.replaceChildren(
        h('button', { type: 'button', class: 'vbtn vbtn-glass', onclick: () => this.unlock() }, glyph('lock', 12), h('span', null, `Enter @${this.owner}’s code to see the locked planets`)));
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
      el.animate([{ transform: el.style.transform, opacity: 1 }, { transform: `${el.style.transform} scale(0)`, opacity: 0 }], { duration: 500, easing: 'ease-in' })
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

  async unlock() {
    const msg = h('p', { class: 'dialog-msg' });
    const field = pinField({
      autocomplete: 'off',
      label: `${this.owner}'s code`,
      onComplete: async (pin) => {
        msg.textContent = '';
        field.state('busy');
        try {
          const data = await api.post(`/api/galaxy/${encodeURIComponent(this.owner)}/unlock`, { pin });
          field.state('ok');
          await wait(380);
          dialog.close();
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
      title: `@${this.owner}’s code`,
      className: 'dialog-code',
      body: h('div', { class: 'pin-dialog' }, h('p', { class: 'dialog-text' }, 'Their locked planets open for you for 12 hours.'), field.el, msg),
    });
    setTimeout(() => field.focus(), 60);
  }

  // ------------------------------------------------------------ stars

  starEl(block) {
    const label = starTitle(block);
    const rand = seeded(block.id);
    const el = h('button', {
      type: 'button', class: 'star', dataset: { id: block.id, kind: block.kind }, 'aria-label': `${label} (star)`,
      style: { '--jx': `${Math.round((rand() - 0.5) * 18)}px`, '--jy': `${Math.round((rand() - 0.5) * 22)}px`, '--tw': `${(3 + rand() * 4).toFixed(1)}s`, '--twd': `${(-rand() * 6).toFixed(1)}s`, '--star': STAR_COLORS[block.kind] || STAR_COLORS.other },
    }, h('span', { class: 'star-glow' }), starIcon(block.kind, 30), h('span', { class: 'star-name' }, label), starPeek(block));
    el.block = block;
    el.addEventListener('click', () => nav.openBlock(block.id));
    el.addEventListener('pointerenter', () => {
      const img = el.querySelector('img[data-src]');
      if (img) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
    });
    el.addEventListener('contextmenu', (e) => {
      if (document.body.classList.contains('is-carrying')) return;
      e.preventDefault();
      blockMenu(el, el.block, { open: () => nav.openBlock(block.id) });
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'm' || (e.key === 'Enter' && e.shiftKey)) { e.preventDefault(); openConnect(el, el.block); }
    });
    draggable(el, {
      ghost: () => ghostFor(el.block),
      targets: () => this.targets(),
      onStart: () => this.showDock(),
      onEnd: () => this.hideDock(),
      onDrop: (target, ghost) => this.dropStar(el.block, target, ghost),
    });
    return el;
  }

  renderStars() {
    const have = new Map([...this.starGrid.children].map((el) => [el.dataset.id, el]));
    const next = [];
    for (const block of this.stars) {
      let el = have.get(block.id);
      if (el) { el.block = block; have.delete(block.id); } else { el = this.starEl(block); el.classList.add('is-new'); }
      next.push(el);
    }
    for (const el of have.values()) el.remove();
    this.starGrid.replaceChildren(...next);
    this.starCount.textContent = this.stars.length ? String(this.stars.length) : '';
    this.starsEmpty.hidden = this.stars.length > 0;
    this.renderFresh();
  }

  // New stars wait by the black hole, ready to be dragged off.
  renderFresh() {
    if (!this.mine) return;
    const ids = this.stars.filter((b) => fresh.has(b.id)).slice(0, 8);
    for (const id of [...fresh]) if (!this.stars.some((b) => b.id === id)) fresh.delete(id);
    const have = new Map([...this.freshEl.children].map((el) => [el.dataset.id, el]));
    const next = ids.map((block) => {
      const el = have.get(block.id) || this.freshStar(block);
      have.delete(block.id);
      return el;
    });
    for (const el of have.values()) el.remove();
    this.freshEl.replaceChildren(...next);
    this.placeFresh();
  }

  freshStar(block) {
    const el = this.starEl(block);
    el.classList.add('star-fresh');
    el.querySelector('.star-name').textContent = 'new';
    return el;
  }

  placeFresh() {
    if (!this.center) return;
    const kids = [...this.freshEl.children];
    const narrow = innerWidth < 640;
    kids.forEach((el, i) => {
      const a = -Math.PI * 0.82 + i * 0.52;
      const rx = narrow ? 84 : 118;
      const ry = narrow ? 92 : 104;
      el.style.transform = `translate(${this.center.x + Math.cos(a) * rx}px, ${this.center.y + Math.sin(a) * ry}px)`;
    });
  }

  targets() {
    const list = [];
    const fromDock = this.dock?.classList.contains('is-on');
    for (const [id, el] of this.planetEls) {
      if (el.planet.locked) continue;
      list.push({ kind: 'planet', id, el, measure: () => el.center() });
    }
    if (fromDock) {
      for (const el of this.dock.children) {
        list.push({ kind: 'planet', id: el.dataset.id, el, dock: true, measure: () => {
          const r = el.querySelector('.planet-ball').getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
        } });
      }
    }
    if (this.hole) {
      list.push({ kind: 'hole', el: this.hole.el, measure: () => ({ ...this.hole.center(), r: 46 }), onHover: (on) => this.hole.hover(on) });
    }
    return list;
  }

  // Dragging a star from far down the page: your planets line up along the bottom.
  showDock() {
    if (!this.dock || !this.data.planets.length) return;
    if (this.sky.getBoundingClientRect().bottom > innerHeight * 0.55) return;
    this.dock.replaceChildren(...this.data.planets.filter((p) => !p.locked).map((p) => {
      const el = planetEl(p, { size: 44, href: null });
      el.classList.add('planet-mini');
      return el;
    }));
    this.dock.classList.add('is-on');
  }

  hideDock() {
    this.dock?.classList.remove('is-on');
  }

  async dropStar(block, target, ghost) {
    const at = target.measure();
    const color = STAR_COLORS[block.kind] || STAR_COLORS.other;
    if (target.kind === 'hole') {
      await spiralInto(ghost, center(ghost.getBoundingClientRect()), at, { duration: 900 });
      this.hole.gulp();
      try {
        const res = await api.post(`/api/blocks/${block.id}/autosort`, { icon: generateIcon() });
        this.forgetStar(block.id);
        await this.launch(res.block, res.sortedInto);
        bus.emit('block:connected', { block: res.block, drawerId: res.sortedInto.planet.id });
      } catch (err) {
        toast(err.message);
      }
      return;
    }
    const planetEl = this.planetEls.get(target.id);
    await spiralInto(ghost, center(ghost.getBoundingClientRect()), at, { duration: 620, turns: 0.6 });
    (target.dock ? target.el : planetEl)?.gulp?.();
    burst(at, { color, count: 8, reach: 28 });
    try {
      const res = await api.post(`/api/blocks/${block.id}/connections`, { drawer: target.id });
      this.forgetStar(block.id);
      planetEl?.bump(1);
      planetEl?.gulp();
      toast(`Moved to ${planetEl?.planet.title || 'a planet'}`);
      bus.emit('block:connected', { block: res.block, drawerId: target.id });
      this.refresh();
    } catch (err) {
      toast(err.message);
    }
  }

  forgetStar(id) {
    fresh.delete(id);
    const all = [...this.starGrid.querySelectorAll(`.star[data-id="${CSS.escape(id)}"]`), ...this.freshEl.querySelectorAll(`.star[data-id="${CSS.escape(id)}"]`)];
    this.stars = this.stars.filter((b) => b.id !== id);
    for (const el of all) el.classList.add('is-leaving');
    setTimeout(() => this.renderStars(), all.length && !reducedMotion() ? 380 : 0);
  }

  // ------------------------------------------------------------ putting things in

  async addText(text, from, sort) {
    const isLink = /^https?:\/\/\S+$/i.test(text.trim());
    const chip = chipFrom(from, h('span', { class: `fx-chip-text${isLink ? ' is-link' : ''}` }, excerpt(text, 70)));
    const request = api.post('/api/blocks', { content: text, autosort: sort, icon: sort ? generateIcon() : undefined });
    await spiralInto(chip, center(chip.getBoundingClientRect()), this.hole.center());
    this.hole.gulp();
    this.hole.setLabel(isLink ? 'Looking…' : 'Add');
    try {
      const { block, sortedInto } = await request;
      if (session.stats) session.stats.files += 1;
      bus.emit('stats:changed', session.stats);
      if (sortedInto) await this.launch(block, sortedInto);
      else await this.birth(block);
    } catch (err) {
      toast(err.message);
      this.hole.focusText(text);
    } finally {
      this.hole.setLabel('Add');
    }
  }

  addFiles(files, from, sort) {
    if (!files.length) return;
    const start = from ? center(from) : this.hole.center();
    files.slice(0, 6).forEach((file, i) => {
      setTimeout(() => {
        const icon = file.type.startsWith('image/') && file.size < 20e6
          ? h('img', { src: URL.createObjectURL(file), alt: '' })
          : h('span', { class: 'fx-chip-text' }, file.name);
        const chip = float(h('div', { class: 'fx-chip fx-chip-file' }, icon), start);
        spiralInto(chip, start, this.hole.center(), { duration: 950 + i * 40 }).then(() => this.hole.gulp());
      }, i * 140);
    });
    addFiles(files, { galaxy: true, autosort: sort, icon: sort ? generateIcon() : null });
  }

  // Into a planet straight from the sky (files dropped on it).
  addFilesTo(planetId, files, at) {
    const el = this.planetEls.get(planetId);
    if (!el) return;
    files.slice(0, 6).forEach((file, i) => {
      setTimeout(() => {
        const chip = float(h('div', { class: 'fx-chip fx-chip-file' }, h('span', { class: 'fx-chip-text' }, file.name)), at);
        spiralInto(chip, at, el.center(), { duration: 700, turns: 0.6 }).then(() => el.gulp());
      }, i * 120);
    });
    addFiles(files, { drawerId: planetId });
  }

  // A star is born: out of the black hole and into orbit beside it.
  async birth(block) {
    fresh.add(block.id);
    if (!this.stars.some((b) => b.id === block.id)) this.stars.unshift(block);
    const from = this.hole.center();
    const color = STAR_COLORS[block.kind] || STAR_COLORS.other;
    burst(from, { color, count: 12, reach: 44 });
    shockwave(from, { size: 90, color });
    this.renderStars();
    const slot = this.freshEl.querySelector(`.star[data-id="${CSS.escape(block.id)}"]`);
    if (!slot || reducedMotion()) { this.setHint(); return; }
    slot.classList.add('is-arriving');
    const to = center(slot.querySelector('.star-icon').getBoundingClientRect());
    await arcTo(float(ghostFor(block), from), from, to, { duration: 900, lift: 0.55, startScale: 0.1, endScale: 0.75, spin: 360 });
    slot.classList.remove('is-arriving');
    slot.classList.add('is-born');
    burst(to, { color, count: 6, reach: 18 });
    this.setHint();
  }

  // A comet out of the black hole to the planet it was sorted onto.
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
    const color = STAR_COLORS[block.kind] || STAR_COLORS.other;
    burst(from, { color, count: 10, reach: 36 });
    await arcTo(float(cometFor(block, from, to), from), from, to, { duration: 1000, lift: 0.28, startScale: 0.3, endScale: 0.35 });
    el.gulp();
    el.bump(1);
    burst(to, { color, count: 10, reach: 34 });
    toast(created ? `New planet: ${planet.title}` : `Sorted into ${planet.title}`);
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
      if (d < c.r * 1.3 + 18 && (!best || d < best.d)) best = { id, el, d };
    }
    return best;
  }

  dropTarget() {
    if (!this.mine) return { label: 'You can only add to your own galaxy' };
    return {
      overlay: false,
      over: (e) => {
        const found = this.hit(e.clientX, e.clientY);
        for (const el of this.planetEls.values()) el.classList.toggle('is-target', el === found?.el);
        this.hole.hover(!found);
      },
      leave: () => {
        for (const el of this.planetEls.values()) el.classList.remove('is-target');
        this.hole.hover(false);
      },
      drop: (files, e) => {
        const found = e ? this.hit(e.clientX, e.clientY) : null;
        for (const el of this.planetEls.values()) el.classList.remove('is-target');
        this.hole.hover(false);
        if (found) this.addFilesTo(found.id, files, { x: e.clientX, y: e.clientY });
        else this.addFiles(files, e ? new DOMRect(e.clientX - 20, e.clientY - 20, 40, 40) : null, this.hole.autosort());
      },
    };
  }

  // ------------------------------------------------------------ keeping up with changes elsewhere

  listen() {
    this.off.push(
      bus.on('upload:done', (item) => {
        if (item.ctx.galaxy) {
          if (item.sortedInto) this.launch(item.block, item.sortedInto);
          else this.birth(item.block);
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

  // ------------------------------------------------------------ moving between galaxies

  async slide(i) {
    const g = this.list[i];
    if (!g || this.sliding) return;
    this.sliding = true;
    await slideAway(this.moving, i > this.index ? 1 : -1);
    nav.go(galaxyUrl(g), { motion: 'none' });
  }

  keys = (e) => {
    if (isEditable(document.activeElement) || viewerOpen() || document.querySelector('.scrim, .sheet.is-open') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowLeft' && this.list[this.index - 1]) { e.preventDefault(); this.slide(this.index - 1); }
    if (e.key === 'ArrowRight' && this.list[this.index + 1]) { e.preventDefault(); this.slide(this.index + 1); }
  };

  inst() {
    return {
      el: this.el,
      title: this.mine ? 'Your galaxy' : `@${this.owner}’s galaxy`,
      chrome: 'galaxy',
      who: { username: this.owner, you: this.mine },
      list: () => this.stars,
      dropTarget: () => this.dropTarget(),
      pasteText: (text) => this.hole?.focusText(text),
      mounted: () => {
        this.layout();
        addEventListener('keydown', this.keys);
        playEntrance(this.moving, [...this.planetEls.values()], this.coreEl);
      },
      destroy: () => {
        removeEventListener('resize', this.relayout);
        removeEventListener('keydown', this.keys);
        this.off.forEach((off) => off());
      },
    };
  }
}

export const galaxyView = {
  async load([username]) {
    const mine = !username || username === session.user.username;
    const [data, list] = await Promise.all([
      api.get(mine ? '/api/galaxy' : `/api/galaxy/${encodeURIComponent(username)}`),
      galaxyOrder(true),
    ]);
    if (!mine && !list.some((g) => g.username === data.user.username)) {
      list.push({ username: data.user.username, you: false, planets: data.planets.length, critters: [] });
    }
    return { data, list: [...list, { community: true }] };
  },

  create(params, { data, list }) {
    if (data.user.you && params[0]) queueMicrotask(() => nav.go('/', { replace: true }));
    if (data.stats) session.stats = data.stats;
    return new Galaxy(data, list).inst();
  },
};

// The last page over: Community, still being built.
export const communityView = {
  async load() {
    const list = await galaxyOrder(true);
    return { list: [...list, { community: true }] };
  },

  create(params, { list }) {
    const index = list.length - 1;
    const moving = h('div', { class: 'gx-moving' });
    const slide = async (i) => {
      await slideAway(moving, i > index ? 1 : -1);
      nav.go(galaxyUrl(list[i]), { motion: 'none' });
    };
    const { dots, prev } = pager(index, list, slide);
    const scene = h('section', { class: 'gx-sky gx-construction' },
      h('div', { class: 'cx-scene' },
        h('div', { class: 'cx-planet' },
          h('span', { class: 'cx-scaffold' }),
          h('span', { class: 'cx-ball' }, h('span', { class: 'planet-gloss' })),
          h('span', { class: 'cx-crane' }, h('span', { class: 'cx-hook' }, renderIcon(generateIcon(seeded('builder')), { size: 22 })))),
        h('h1', { class: 'cx-title' }, 'Community'),
        h('p', { class: 'cx-sub' }, 'Under construction. Soon: planets everyone can add to, and a sky of things people share.'),
        h('div', { class: 'cx-tape', 'aria-hidden': 'true' })));
    moving.append(scene);
    swipeable(scene, moving, { canGo: (dir) => !!list[index + dir], go: (dir) => slide(index + dir) });
    const keys = (e) => {
      if (isEditable(document.activeElement) || document.querySelector('.scrim, .sheet.is-open')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); slide(index - 1); }
    };
    return {
      el: h('div', { class: 'galaxy' }, dots, prev, moving),
      title: 'Community',
      chrome: 'galaxy',
      who: { community: true },
      mounted: () => { addEventListener('keydown', keys); playEntrance(moving, [], scene.querySelector('.cx-scene')); },
      destroy: () => removeEventListener('keydown', keys),
    };
  },
};
