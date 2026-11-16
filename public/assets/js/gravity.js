// Search as gravity (DESIGN.md, "Search"): on a galaxy, the files a search finds lift off the planets
// they are on and settle round the void, each as the small face the planets wear in their belts. The
// planets they came from stay lit and the rest step back. Clearing the search sends every file home.
// The galaxy fetches this file the first time someone searches on it (`gravity()` in views/galaxy.js);
// search.js says what was found (`show`) and when it is over (`clear`).

import { fileFace } from './planets.js';
import { theSky } from './sky.js';
import { DUR, EASE, EASE_GLIDE, EASE_LEAVE, STAGGER, h, reducedMotion } from './util.js';
import { sound } from './sound.js';

const SVG = 'http://www.w3.org/2000/svg';
// How many fly at most (the rest stay a press away, under "+N more"), on a computer and on a phone.
export const CAP = { wide: 12, narrow: 8 };
// The ring sits just inside the rim of the void's cage, in multiples of the radius of its light (the
// cage reaches 2.5: CAGE in voidart.js).
const RING = 2.1;
// A flight bends this much to one side (a share of the way), and starts this small.
const BEND = 0.18;
const SMALL = 0.35;
// The sky's stars lean in this much (the void swallowing a file leans them 0.8).
const LEAN = 0.5;

const nameOf = (b) => b.title || (b.kind === 'text' ? (b.content || '').replace(/\s+/g, ' ').trim().slice(0, 40) : b.fileName) || 'Untitled';
const and = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

export class Gravity {
  // host (from the galaxy): layer and scene (elements), center() and hole() of the void (the
  // point on the screen, the radius of its dark), narrow(), planets() (a Map of id → planet
  // element), star(id) (one of your stars, if it is one), mine.
  constructor(host) {
    this.host = host;
    this.faces = new Map();
    this.blocks = [];
    this.active = false;
    this.el = h('div', { class: 'gx-found', role: 'group', 'aria-label': 'What the search found' });
    this.gone = h('div', { class: 'gx-found', 'aria-hidden': 'true', inert: '' });
    this.more = h('button', { type: 'button', class: 'btn btn-quiet btn-small gx-found-more', hidden: true, onclick: () => this.onMore?.() });
    this.lines = document.createElementNS(SVG, 'svg');
    this.lines.setAttribute('class', 'gx-found-lines');
    this.lines.setAttribute('aria-hidden', 'true');
    host.layer.append(this.gone, this.el);
    host.scene.insertBefore(this.lines, host.scene.firstChild);
    this.el.addEventListener('keydown', (e) => this.step(e));
    this.el.addEventListener('pointerover', (e) => this.light(e.target.closest?.('.gx-found-file')));
    this.el.addEventListener('pointerleave', () => this.light(document.activeElement?.closest?.('.gx-found-file')));
    this.el.addEventListener('focusin', (e) => this.light(e.target.closest?.('.gx-found-file')));
    this.el.addEventListener('focusout', (e) => { if (!this.el.contains(e.relatedTarget)) this.light(null); });
  }

  // What was found: `blocks` fly (at most CAP of them); `planets` stay lit too (planets found by their
  // names, and those holding found files that didn't fly); `more` is the words for the button that
  // opens the rest, or null.
  show(blocks, { planets = [], more = null, open, onMore } = {}) {
    const first = !this.active;
    this.active = true;
    this.open = open;
    this.onMore = onMore;
    this.blocks = blocks;
    const { scene } = this.host;
    scene.classList.add('is-seeking');
    const lit = new Set(planets);
    for (const b of blocks) for (const id of b.on || []) lit.add(id);
    for (const [id, el] of this.host.planets()) el.classList.toggle('is-found', lit.has(id));

    const want = new Set(blocks.map((b) => b.id));
    for (const [id, face] of [...this.faces]) {
      if (want.has(id)) continue;
      this.faces.delete(id);
      this.leave(face);
    }
    const fresh = [];
    for (const b of blocks) {
      let face = this.faces.get(b.id);
      if (face) face.block = b;
      else {
        face = this.face(b);
        this.faces.set(b.id, face);
        fresh.push(face);
      }
    }
    this.more.textContent = more || '';
    this.more.hidden = !more;
    this.place();   // before the new ones are on the page, so they don't slide to their places
    this.el.replaceChildren(...blocks.map((b) => this.faces.get(b.id)), this.more);
    for (const face of fresh) this.host.star(face.block.id)?.classList.add('is-lifted');
    if (!reducedMotion()) {
      fresh.forEach((face, i) => this.arrive(face, Math.min(i, 14) * STAGGER));
      // The sky feels the pull once, as the first files come in.
      if (first && fresh.length) {
        const c = this.host.center();
        theSky()?.pull(c.x, c.y, { strength: LEAN, radius: this.host.hole() * 4, duration: DUR.grand });
      }
    }
  }

  // Every file goes home, all together, and the planets come back up.
  clear() {
    if (!this.active) return;
    this.active = false;
    for (const face of this.faces.values()) this.leave(face);
    this.faces.clear();
    this.blocks = [];
    this.more.hidden = true;
    this.light(null);
    this.host.scene.classList.remove('is-seeking');
    for (const el of this.host.planets().values()) el.classList.remove('is-found');
  }

  // The files found, in the order they sit round the void (for the file view's arrows).
  list() {
    return this.active ? this.blocks : null;
  }

  // Where each file sits: evenly round the void, clockwise from the top.
  place() {
    const n = this.blocks.length;
    const r = this.host.hole() * RING;
    this.el.style.setProperty('--chip', `${this.host.chip()}px`);
    this.blocks.forEach((b, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const face = this.faces.get(b.id);
      face.at = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      face.style.setProperty('--x', `${face.at.x.toFixed(1)}px`);
      face.style.setProperty('--y', `${face.at.y.toFixed(1)}px`);
    });
    this.more.style.setProperty('--y', `${Math.round(r + this.host.chip())}px`);
  }

  face(b) {
    const name = nameOf(b);
    const where = and((b.on || []).map((id) => this.host.planets().get(id)?.planet?.title).filter(Boolean));
    const tip = where ? `${name} · ${where}` : this.host.mine && !(b.on || []).length ? `${name} · a star` : name;
    const el = h('button', {
      type: 'button', class: 'star gx-found-file is-near', 'aria-label': tip,
      dataset: { id: b.id, vt: `b-${b.id}`, tip, tipNow: '', tipAt: 'above' },
    }, fileFace(b));
    el.block = b;
    el.addEventListener('click', () => this.open?.(el.block));
    return el;
  }

  // Where a file comes from (and goes back to): the first of its planets on this galaxy, else its
  // own place as a star; a point on the screen, or null when it has neither (it fades in place).
  origin(b) {
    for (const id of b.on || []) {
      const el = this.host.planets().get(id);
      if (el) return el.center();
    }
    const star = this.host.star(b.id);
    if (star) {
      const r = star.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  }

  // From its spot, how far away it starts (or ends): the way to where it comes from.
  away(face) {
    const from = this.origin(face.block);
    if (!from) return null;
    const c = this.host.center();
    return { x: from.x - c.x - face.at.x, y: from.y - c.y - face.at.y };
  }

  // Lifting off its planet and gliding to the void on a gentle curve.
  arrive(face, delay) {
    setTimeout(() => sound('found'), delay + (reducedMotion() ? 0 : DUR.scene * 0.8));   // a glass note as each settles
    const d = this.away(face);
    if (!d) {
      face.animate([{ opacity: 0, transform: `scale(${SMALL})` }, { opacity: 1, transform: 'none' }],
        { duration: DUR.arrive, delay, easing: EASE, fill: 'backwards' });
      return;
    }
    // a quadratic curve from the planet (d) to the spot (0), bending to one side half way
    const mid = { x: d.x / 2 - d.y * BEND, y: d.y / 2 + d.x * BEND };
    const frames = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const u = 1 - t;
      const x = u * u * d.x + 2 * u * t * mid.x;
      const y = u * u * d.y + 2 * u * t * mid.y;
      return { offset: t, opacity: Math.min(1, t * 3), transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(SMALL + (1 - SMALL) * t).toFixed(3)})` };
    });
    face.animate(frames, { duration: DUR.scene, delay, easing: EASE_GLIDE, fill: 'backwards' });
  }

  // Going home: the arriving played backwards, over --dur-change on --ease-leave.
  leave(face) {
    const d = this.away(face);
    const star = this.host.star(face.block.id);
    this.gone.append(face);
    star?.classList.remove('is-lifted');
    if (reducedMotion()) { face.remove(); return; }
    const end = d ? `translate(${d.x.toFixed(1)}px, ${d.y.toFixed(1)}px) scale(${SMALL})` : `scale(${SMALL})`;
    face.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: end }], { duration: DUR.change, easing: EASE_LEAVE, fill: 'forwards' })
      .finished.then(() => face.remove(), () => face.remove());
  }

  // The file pointed at or reached by keyboard: a faint line back to each of its planets.
  light(face) {
    this.lines.replaceChildren();
    this.lines.classList.toggle('is-on', !!face);
    if (!face?.block) return;
    const s = this.host.scene.getBoundingClientRect();
    const r = face.getBoundingClientRect();
    const a = { x: r.left + r.width / 2 - s.left, y: r.top + r.height / 2 - s.top };
    for (const id of face.block.on || []) {
      const el = this.host.planets().get(id);
      if (!el) continue;
      const c = el.center();
      const b = { x: c.x - s.left, y: c.y - s.top };
      const m = { x: (a.x + b.x) / 2 - (b.y - a.y) * BEND, y: (a.y + b.y) / 2 + (b.x - a.x) * BEND };
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${m.x.toFixed(1)},${m.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`);
      this.lines.append(path);
    }
  }

  // The arrow keys go round the files.
  step(e) {
    const by = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!by || e.metaKey || e.ctrlKey || e.altKey) return;
    const list = this.blocks.map((b) => this.faces.get(b.id));
    const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    list[(i + by + list.length) % list.length].focus();
  }

  destroy() {
    this.el.remove();
    this.gone.remove();
    this.lines.remove();
  }
}
