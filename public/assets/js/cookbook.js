// Cookbook mode: a planet kept as a recipe box. Like list and reading mode it
// isn't a setting to go looking for: a planet offers it once recipes are what
// it holds (recipes.signs in mutt/recipes.py), and its switch lives in the
// planet's ••• menu after that.
//
// Every recipe note and recipe link on the planet is an index card standing
// in a tin box, behind a tabbed divider for its chapter. A card opens big:
// the dish photo clipped to its corner, servings that scale the amounts, a
// switch between metric and US measures, and a cooking mode that keeps the
// screen on and goes one step at a time. Anything else on the planet stays
// below as files.

import { deleteBlock } from './actions.js';
import { convertible, convertText, fraction, showLine, splitLine, systemOf } from './amounts.js';
import { api } from './api.js';
import { nav } from './nav.js';
import { openContextMenu, openDialog, openMenu, segmented, toast } from './ui.js';
import { addFiles } from './uploads.js';
import { EASE, autosize, bus, debounce, h, isEditable, reducedMotion } from './util.js';

const moving = () => !reducedMotion();
const OTHER = 'Everything else';

// Per device: which measures you like to see.
const SETTINGS_KEY = 'mutt:cookbook';
function loadSettings() {
  try { return { units: 'as', ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { units: 'as' }; }
}
function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* fine */ }
}

const minutes = (m) => {
  if (!m) return '';
  if (m < 60) return `${m} min`;
  const hrs = Math.floor(m / 60);
  return m % 60 ? `${hrs} hr ${m % 60} min` : `${hrs} hr`;
};

const isHeading = (line) => /:\s*$/.test(line) && line.length < 60;

function servesText(r, n = r.serves) {
  if (!n) return '';
  return r.makes ? `Makes ${n} ${r.makes}` : `Serves ${n}`;
}

function detailsText(r) {
  return [servesText(r), r.prep || r.cook ? minutes((r.prep || 0) + (r.cook || 0)) : ''].filter(Boolean).join(' · ');
}

// ------------------------------------------------------------ the box

// "Bananas, butter, sugar, egg…": what goes in, for the card's face.
function ingredientNames(r) {
  const names = (r.ingredients || []).filter((l) => !isHeading(l))
    .map((l) => splitLine(l)[1].replace(/^(?:of\s+)/i, '').split(/[,(;]/)[0].trim()).filter(Boolean);
  if (!names.length) return '';
  const text = names.slice(0, 6).join(', ');
  return (text.charAt(0).toUpperCase() + text.slice(1)) + (names.length > 6 ? '…' : '');
}

// The front's lettering: RECIPES between two pairs of lightning strokes.
function letters() {
  const NS = 'http://www.w3.org/2000/svg';
  const bolt = (flip) => {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 120 40');
    svg.setAttribute('class', `cb-bolt${flip ? ' is-flip' : ''}`);
    for (const d of ['M2 20 L58 9 L52 17 L118 4', 'M2 20 L58 31 L52 23 L118 36']) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    return svg;
  };
  return h('span', { class: 'cb-letters' }, bolt(false), h('span', { class: 'cb-word' }, 'Recipes'), bolt(true));
}

export class RecipeBoxView {
  constructor({ drawer, blocks, editable, makeCollection, onChange, box = null }) {
    this.drawer = drawer;
    this.editable = editable;
    this.onChange = onChange;
    this.blocks = blocks;
    this.recipes = new Map();
    this.chapters = [];
    this.photos = new Set();
    this.held = new Map(); // block objects for the cards and photos, out of the files grid

    // Until the server says, the cards are the files that already carry one.
    const guess = new Set();
    for (const b of blocks) {
      if (b.meta?.recipe) {
        guess.add(b.id);
        if (b.meta.recipe.photo) guess.add(b.meta.recipe.photo);
      }
    }
    for (const b of blocks) if (guess.has(b.id)) this.held.set(b.id, b);
    this.collection = makeCollection(blocks.filter((b) => !guess.has(b.id)), {
      onChange: () => { this.changed(); this.refreshSoon(); },
      empty: editable ? null : '',
    });

    // A recipe box seen from the front, open: its lid stands up behind with
    // a label, the cards stand in rows with chapter tabs between them, and
    // the front is lettered "Recipes". Other files on the planet stay out of
    // sight here; "Show as files again" brings them back.
    this.count = h('span', { class: 'cb-label-count' });
    this.newBtn = editable ? h('button', { type: 'button', class: 'vbtn vbtn-glass cb-new', onclick: () => this.newCard() }, '+ New card') : null;
    this.stack = h('div', { class: 'cb-stack', role: 'list', 'aria-label': 'Recipe cards' });
    this.inside = h('div', { class: 'cb-inside' }, this.stack);
    this.boxEl = h('div', { class: 'cb-box' },
      h('div', { class: 'cb-back fglass' },
        h('div', { class: 'cb-label' },
          h('span', { class: 'cb-label-small' }, 'The recipes of'),
          h('span', { class: 'cb-label-title' }, drawer.title),
          this.count),
        this.newBtn),
      this.inside,
      h('div', { class: 'cb-front fglass', 'aria-hidden': 'true' }, letters()));
    this.isOpen = true;
    this.el = h('div', { class: 'cb' }, this.boxEl);

    this.refreshSoon = debounce(() => this.refresh(), 400);
    if (box) this.take(box, { entrance: true });
    else { this.render({ entrance: true }); this.refresh({ entrance: true }); }

    this.off = [
      bus.on('block:deleted', ({ id }) => this.forget(id)),
      bus.on('block:disconnected', ({ block, drawerId }) => { if (drawerId === drawer.id) this.forget(block.id); }),
      bus.on('block:connected', ({ drawerId }) => { if (drawerId === drawer.id) this.refreshSoon(); }),
      bus.on('block:changed', (b) => { if (this.recipes.has(b.id) || this.photos.has(b.id)) this.refreshSoon(); }),
    ];
  }

  list() { return [...this.held.values(), ...this.collection.list()]; }


  changed() {
    this.blocks = this.list();
    this.onChange?.(this.blocks);
  }

  async refresh(opts = {}) {
    try {
      this.take(await api.get(`/api/drawers/${this.drawer.id}/recipes`), opts);
    } catch { /* the cards already shown will do */ }
  }

  // The server's reading of the box: which files are cards, which are dish photos.
  take(box, opts = {}) {
    this.recipes = new Map(box.recipes.map((r) => [r.id, r]));
    this.chapters = box.chapters;
    this.photos = new Set(box.photos);
    const keep = new Set([...this.recipes.keys(), ...this.photos]);
    for (const b of [...this.collection.blocks]) {
      if (keep.has(b.id)) { this.held.set(b.id, b); this.collection.drop(b.id); }
    }
    // A note no longer written as a recipe goes back to the files.
    for (const [id, b] of [...this.held]) {
      if (!keep.has(id)) {
        this.held.delete(id);
        this.collection.blocks.unshift(b);
        this.collection.render('flip');
      }
    }
    this.changed();
    this.render(opts);
    this.card?.sync();
  }

  forget(id) {
    const had = this.recipes.has(id) || this.photos.has(id);
    this.held.delete(id);
    if (!had) return;
    if (this.recipes.has(id)) {
      this.recipes.delete(id);
      this.card?.gone(id);
    }
    const el = this.stack.querySelector(`[data-id="${CSS.escape(id)}"]`);
    const done = () => { this.changed(); this.refresh(); };
    if (el && moving()) el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-30px) rotate(-2deg)' }], { duration: 320, easing: 'ease-in', fill: 'forwards' }).finished.then(done, done);
    else done();
  }

  // Cards in the order they stand in the box: chapter by chapter, A to Z.
  ordered() {
    const out = [];
    for (const ch of this.chapters) {
      out.push(...[...this.recipes.values()].filter((r) => r.chapter === ch));
    }
    for (const r of this.recipes.values()) if (!out.includes(r)) out.push(r);
    return out;
  }

  render({ entrance = false, born = null } = {}) {
    const all = this.ordered();
    this.count.textContent = all.length ? `${all.length} ${all.length === 1 ? 'recipe' : 'recipes'}` : 'No recipes yet';
    const parts = [];
    let tabAt = 0;
    for (const ch of this.chapters) {
      const cards = all.filter((r) => r.chapter === ch);
      if (!cards.length) continue;
      parts.push(this.divider(ch, cards.length, tabAt++));
      for (const r of cards) parts.push(this.top(r));
    }
    if (!all.length) {
      parts.push(h('div', { class: 'cb-empty' },
        h('p', { class: 'cb-empty-title' }, 'No recipes in the box yet.'),
        h('p', null, this.editable ? 'Make a new card, or add a note written as a recipe or a link to a recipe page.' : 'Nothing here yet.')));
    }
    this.stack.replaceChildren(...parts);
    if (moving() && (entrance || born)) {
      [...this.stack.children].forEach((el, i) => {
        if (born && el.dataset.id !== born) return;
        el.animate([{ opacity: 0, transform: 'translateY(26px)' }, { opacity: 1, transform: 'none' }],
          { duration: 560, delay: born ? 80 : Math.min(i, 16) * 35, easing: EASE, fill: 'backwards' });
      });
    }
  }

  divider(name, n, i) {
    const tab = h('button', { type: 'button', class: 'cb-tab', title: this.editable ? `${name} (double-click to rename)` : name, onclick: () => this.flickTo(name) },
      h('span', { class: 'cb-tab-name' }, name), h('span', { class: 'cb-tab-n' }, String(n)));
    const el = h('div', { class: 'cb-divider', role: 'listitem', dataset: { ch: name }, style: { '--tab': i % 4 } }, tab);
    if (this.editable) {
      tab.addEventListener('dblclick', () => this.renameChapter(name));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openContextMenu(e, [{ label: 'Rename chapter…', run: () => this.renameChapter(name) }], { title: name, target: el });
      });
    }
    return el;
  }

  top(r) {
    const pic = r.photo?.thumb || r.cover;
    const el = h('div', { class: 'cb-top', role: 'listitem', dataset: { id: r.id } },
      h('button', { type: 'button', class: 'cb-top-btn fglass', 'aria-label': `Open ${r.title}`, onclick: () => this.open(r.id) },
        h('span', { class: 'cb-top-text' },
          h('span', { class: 'cb-top-title' }, r.title),
          h('span', { class: 'cb-top-meta' }, detailsText(r) || (r.kind === 'link' && r.site ? `From ${r.site}` : ' ')),
          h('span', { class: 'cb-top-ings' }, ingredientNames(r))),
        pic ? h('span', { class: 'cb-top-pic' },
          h('img', { src: pic, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' }),
          steam()) : null));
    el.addEventListener('contextmenu', (e) => this.context(e, el, r));
    return el;
  }

  flickTo(name) {
    const el = this.stack.querySelector(`.cb-divider[data-ch="${CSS.escape(name)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: moving() ? 'smooth' : 'auto', block: 'start' });
    if (moving()) el.animate([{ transform: 'none' }, { transform: 'translateY(-8px)' }, { transform: 'none' }], { duration: 520, easing: EASE });
  }

  context(e, el, r) {
    e.preventDefault();
    const items = [{ label: 'Open card', run: () => this.open(r.id) },
      { label: 'Start cooking', run: () => cook(r, this.scaleOf(r), loadSettings().units) }];
    if (r.mine && this.editable) {
      items.push('-', { label: 'Edit card', run: () => this.open(r.id, { edit: true }) },
        { label: 'Move to chapter…', run: () => this.moveMenu(el, r) },
        { label: 'Open as a file', run: () => nav.openBlock(r.id) },
        '-', { label: r.kind === 'link' ? 'Delete link…' : 'Delete recipe…', danger: true, run: () => this.remove(r) });
    } else {
      items.push({ label: 'Open as a file', run: () => nav.openBlock(r.id) });
    }
    openContextMenu(e, items, { title: r.title, target: el });
  }

  scaleOf(r) {
    this.scales = this.scales || new Map();
    return this.scales.get(r.id) ?? (r.serves || 1);
  }

  open(id, { edit = false } = {}) {
    const from = this.stack.querySelector(`.cb-top[data-id="${CSS.escape(id)}"]`);
    if (this.card) this.card.show(id, { edit });
    else this.card = new CardView(this, id, { from, edit, onClose: () => { this.card = null; } });
  }

  // ------------------------------------------------------------ changing cards

  async save(id, patch) {
    try {
      const { recipe, block } = await api.put(`/api/blocks/${id}/recipe`, patch);
      this.recipes.set(id, recipe);
      if (this.held.has(id)) Object.assign(this.held.get(id), block);
      if (!this.chapters.includes(recipe.chapter)) this.chapters.splice(Math.max(0, this.chapters.length - (this.chapters.at(-1) === OTHER ? 1 : 0)), 0, recipe.chapter);
      this.render();
      this.refreshSoon();
      return recipe;
    } catch (err) {
      toast(err.message);
      return null;
    }
  }

  async newCard() {
    try {
      const { recipe, block } = await api.post(`/api/drawers/${this.drawer.id}/recipes`, {});
      this.held.set(block.id, block);
      this.recipes.set(recipe.id, recipe);
      if (!this.chapters.includes(recipe.chapter)) this.chapters.push(recipe.chapter);
      this.changed();
      this.render({ born: recipe.id });
      this.open(recipe.id, { edit: true });
    } catch (err) {
      toast(err.message);
    }
  }

  async remove(r) {
    const block = this.held.get(r.id) || { id: r.id, connectionCount: 1 };
    if (await deleteBlock(block)) this.forget(r.id);
  }

  moveMenu(anchor, r, onMoved) {
    const names = [...new Set([...this.chapters, 'Breakfast', 'Mains', 'Baking', 'Desserts', OTHER])];
    openMenu(anchor, [
      ...names.map((name) => ({ label: name, hint: name === r.chapter ? 'here now' : null, run: async () => {
        if (name === r.chapter) return;
        const saved = await this.save(r.id, { chapter: name });
        if (saved) { toast(`Moved to ${name}`); onMoved?.(saved); }
      } })),
      '-',
      { label: 'New chapter…', run: async () => {
        const name = await askName('New chapter', '', 'Make it');
        if (!name) return;
        const saved = await this.save(r.id, { chapter: name });
        if (saved) { toast(`Moved to ${name}`); onMoved?.(saved); }
      } },
    ], { align: 'end' });
  }

  async renameChapter(name) {
    const next = await askName('Rename chapter', name, 'Rename');
    if (!next || next === name) return;
    try {
      this.take(await api.post(`/api/drawers/${this.drawer.id}/chapters`, { from: name, to: next }));
    } catch (err) {
      toast(err.message);
    }
  }

  // A picture for a card: one already on the planet, or a new one.
  async uploadPhoto(id, file) {
    const [item] = addFiles([file], { drawerId: this.drawer.id });
    if (!item) return null;
    this.photos.add('pending');
    const block = await new Promise((resolve) => {
      const offs = [
        bus.on('upload:done', (it) => { if (it.key === item.key) { offs.forEach((o) => o()); resolve(it.block); } }),
        bus.on('upload:fail', (it) => { if (it.key === item.key) { offs.forEach((o) => o()); resolve(null); } }),
      ];
    });
    this.photos.delete('pending');
    if (!block) { toast('That photo couldn’t be added.'); return null; }
    // It stays a file on the planet, but behind its card rather than among the files.
    setTimeout(() => {
      const b = this.collection.blocks.find((x) => x.id === block.id) || block;
      this.held.set(block.id, b);
      this.collection.drop(block.id);
      this.changed();
    });
    this.photos.add(block.id);
    return this.save(id, { photo: block.id });
  }

  pictures() {
    return this.list().filter((b) => b.kind === 'image' && (b.thumb || b.file));
  }

  dropTarget() { return this.collection.dropTarget(); }

  pasteText(text) { this.collection.pasteText(text); }

  destroy() {
    this.off.forEach((off) => off());
    this.card?.close({ instant: true });
    this.collection.destroy();
  }
}

function askName(title, value, confirm) {
  return new Promise((resolve) => {
    let result = null;
    const input = h('input', { class: 'field cb-name-field', value, maxlength: 40, autofocus: true, 'aria-label': 'Chapter name' });
    const go = () => { result = input.value.trim() || null; dialog.close(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    const body = h('div', null, input,
      h('div', { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { type: 'button', class: 'btn btn-dark', onclick: go }, confirm)));
    const dialog = openDialog({ title, body, onClose: () => resolve(result) });
    requestAnimationFrame(() => { input.focus(); input.select(); });
  });
}

// ------------------------------------------------------------ one card, open

// Layers this module opens, so Escape and the arrow keys go to the top one.
const layers = [];
addEventListener('keydown', (e) => {
  const top = layers.at(-1);
  if (!top) return;
  // A menu or dialog on top has the keys first.
  if (document.querySelector('.pop:not(.is-leaving), .scrim')) return;
  top.key(e);
}, true);

// lock: the page behind can't scroll (cooking mode covers the screen).
function layer(obj, { lock = false } = {}) {
  layers.push(obj);
  if (lock) document.documentElement.classList.add('cb-locked');
  return () => {
    layers.splice(layers.indexOf(obj), 1);
    if (!layers.some((l) => l.lock)) document.documentElement.classList.remove('cb-locked');
  };
}

// A card pulled up out of the box: it opens in the page, above the box,
// as wide as the planet's header, and the box moves down to make room.
class CardView {
  constructor(box, id, { from, edit, onClose }) {
    this.box = box;
    this.onClose = onClose;
    this.settings = loadSettings();

    this.prevBtn = h('button', { type: 'button', class: 'vbtn vbtn-glass vbtn-round cbc-btn cbc-round', 'aria-label': 'Previous card', title: 'Previous card', onclick: () => this.step(-1) }, arrow(-1));
    this.nextBtn = h('button', { type: 'button', class: 'vbtn vbtn-glass vbtn-round cbc-btn cbc-round', 'aria-label': 'Next card', title: 'Next card', onclick: () => this.step(1) }, arrow(1));
    this.where = h('span', { class: 'cbc-where' });
    this.navEl = h('span', { class: 'cbc-navs' }, this.prevBtn, this.where, this.nextBtn);
    this.closeBtn = h('button', { type: 'button', class: 'vbtn vbtn-glass vbtn-round cbc-btn cbc-round', 'aria-label': 'Put the card back', title: 'Put it back', onclick: () => this.close() }, closeIcon());
    this.sheet = h('div', { class: 'cbc-wrap' });
    this.el = h('section', { class: 'cbp', 'aria-label': 'Recipe card' }, this.sheet);
    box.el.insertBefore(this.el, box.boxEl);
    this.unlayer = layer(this);
    this.show(id, { edit, from });
    this.wireSwipe();
  }

  get recipe() { return this.box.recipes.get(this.id); }

  key(e) {
    const inside = this.el.contains(document.activeElement) || document.activeElement === document.body;
    if (e.key === 'Escape') {
      if (!inside) return;
      e.preventDefault();
      e.stopPropagation();
      if (this.zoomed) { this.zoomed.remove(); this.zoomed = null; return; }
      if (this.editor && isEditable(document.activeElement)) { document.activeElement.blur(); return; }
      this.close();
      return;
    }
    if (this.editor || isEditable(document.activeElement) || !inside) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); this.step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); }
  }

  // Which card in the box is out (its place is left as a faint gap).
  markOut() {
    for (const el of this.box.stack.querySelectorAll('.cb-top')) el.classList.toggle('is-out', el.dataset.id === this.id && !this.closing);
  }

  show(id, { edit = false, from = null, dir = 0 } = {}) {
    const first = !this.id;
    const before = this.el.getBoundingClientRect().height;
    this.id = id;
    this.editor = null;
    const r = this.recipe;
    if (!r) { this.close(); return; }
    const card = this.build(r, edit && r.mine && this.box.editable);
    const old = this.cardEl;
    this.cardEl = card;
    this.sheet.append(card);
    this.navState();
    this.markOut();
    const after = this.el.getBoundingClientRect().height;
    if (old) {
      if (moving() && dir) {
        old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 8}%) scale(0.98)` }],
          { duration: 260, easing: 'ease-in', fill: 'forwards' }).finished.then(() => old.remove(), () => old.remove());
        card.animate([{ opacity: 0, transform: `translateX(${dir * 8}%) scale(0.98)` }, { opacity: 1, transform: 'none' }],
          { duration: 480, delay: 90, easing: EASE, fill: 'backwards' });
        this.el.animate([{ height: `${before}px` }, { height: `${after}px` }], { duration: 480, easing: EASE });
      } else old.remove();
    } else if (first) {
      if (moving()) {
        // It rises out of the box from where it stood, and the box slides down.
        this.el.animate([{ height: '0px', marginBottom: '0px' }, { height: `${after}px` }], { duration: 640, easing: EASE });
        const start = from?.getBoundingClientRect();
        const end = card.getBoundingClientRect();
        const dy = start ? Math.max(60, start.top - end.top) : 60;
        card.animate([
          { opacity: 0, transform: `translateY(${Math.min(dy, 420)}px) scale(0.96)` },
          { opacity: 1, offset: 0.5 },
          { opacity: 1, transform: 'none' },
        ], { duration: 720, easing: EASE });
      }
      const top = this.el.getBoundingClientRect().top;
      if (top < 60 || top > innerHeight * 0.5) {
        setTimeout(() => this.el.scrollIntoView({ behavior: moving() ? 'smooth' : 'auto', block: 'start' }), moving() ? 60 : 0);
      }
    }
    if (edit) requestAnimationFrame(() => card.querySelector('.cbe-title')?.focus({ preventScroll: true }));
    else if (!first) requestAnimationFrame(() => this.closeBtn.focus({ preventScroll: true }));
  }

  // The box changed underneath (a save, a refresh): redraw unless typing.
  sync() {
    if (!this.recipe) { this.close(); return; }
    this.navState();
    if (this.editor) return;
    const fresh = this.build(this.recipe, false);
    this.cardEl.replaceWith(fresh);
    this.cardEl = fresh;
  }

  gone(id) { if (id === this.id) this.close(); }

  navState() {
    const all = this.box.ordered();
    const i = all.findIndex((r) => r.id === this.id);
    this.prevBtn.disabled = i <= 0;
    this.nextBtn.disabled = i < 0 || i >= all.length - 1;
    this.where.textContent = all.length > 1 ? `${i + 1} of ${all.length}` : '';
  }

  step(dir) {
    if (this.editor) return;
    const all = this.box.ordered();
    const i = all.findIndex((r) => r.id === this.id);
    const next = all[i + dir];
    if (next) this.show(next.id, { dir });
  }

  wireSwipe() {
    let start = null;
    this.sheet.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || this.editor || isEditable(e.target)) return;
      start = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    this.sheet.addEventListener('pointerup', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) this.step(dx < 0 ? 1 : -1);
    });
    this.sheet.addEventListener('pointercancel', () => { start = null; });
  }

  scale() { return this.box.scaleOf(this.recipe); }

  setScale(n) {
    this.box.scales = this.box.scales || new Map();
    this.box.scales.set(this.id, n);
    this.sync();
  }

  // ------------------------------------------------------------ the card itself

  build(r, editing) {
    return editing ? this.buildEditor(r) : this.buildView(r);
  }

  buildView(r) {
    const mine = r.mine && this.box.editable;
    const units = this.settings.units;
    const base = r.serves || 1;
    const now = this.scale();
    const factor = now / base;

    const tools = h('div', { class: 'cbc-tools' },
      h('span', { class: 'cbc-chapter' }, r.chapter),
      this.navEl,
      h('span', { class: 'cbc-gap' }),
      (r.steps.length ? h('button', { type: 'button', class: 'vbtn vbtn-blue cbc-btn cbc-cook', onclick: () => cook(r, now, units) }, potIcon(), h('span', { class: 'cbc-long' }, 'Start cooking'), h('span', { class: 'cbc-short' }, 'Cook')) : null),
      mine ? h('button', { type: 'button', class: 'vbtn vbtn-glass cbc-btn', onclick: () => this.edit() }, 'Edit') : null,
      mine ? h('button', { type: 'button', class: 'vbtn vbtn-glass vbtn-round cbc-btn cbc-round', 'aria-label': 'More', onclick: (e) => this.more(e.currentTarget) }, '•••') : null,
      this.closeBtn);

    // Servings: − 4 + scales every amount. Without a number, a plain ×1.
    const less = h('button', { type: 'button', class: 'cbc-step', 'aria-label': 'Fewer', disabled: now <= (r.serves ? 1 : 0.5) }, '−');
    const more = h('button', { type: 'button', class: 'cbc-step', 'aria-label': 'More', disabled: now >= (r.serves ? 99 : 8) }, '+');
    const steps = [0.5, 1, 1.5, 2, 3, 4, 6, 8];
    less.addEventListener('click', () => this.setScale(r.serves ? now - 1 : steps[Math.max(0, steps.indexOf(now) - 1)] ?? 1));
    more.addEventListener('click', () => this.setScale(r.serves ? now + 1 : steps[Math.min(steps.length - 1, steps.indexOf(now) + 1)] ?? 1));
    const scaler = h('div', { class: `cbc-scaler${now !== base ? ' is-scaled' : ''}` },
      less,
      h('span', { class: 'cbc-serves', 'aria-live': 'polite' }, r.serves ? servesText(r, now) : `×${fraction(now)}`),
      more,
      now !== base ? h('button', { type: 'button', class: 'cbc-reset', onclick: () => this.setScale(base) }, 'as written') : null);

    const canConvert = convertible(r.ingredients, r.steps);
    const written = systemOf(r.ingredients);
    const unitSeg = canConvert ? segmented([
      { value: 'as', label: 'As written' },
      { value: 'metric', label: 'Metric' },
      { value: 'us', label: 'US' },
    ], units, (v) => { this.settings.units = v; saveSettings(this.settings); this.sync(); }, { className: 'cbc-units', label: 'Measures' }) : null;
    if (unitSeg && written) unitSeg.el.title = `Written in ${written === 'us' ? 'US' : 'metric'} measures`;

    const details = h('div', { class: 'cbc-details' },
      scaler,
      r.prep ? h('span', { class: 'cbc-time' }, h('b', null, 'Prep'), ' ', minutes(r.prep)) : null,
      r.cook ? h('span', { class: 'cbc-time' }, h('b', null, 'Cook'), ' ', minutes(r.cook)) : null,
      unitSeg?.el);

    const ingredients = r.ingredients.length ? h('ul', { class: 'cbc-ings' }, r.ingredients.map((line) => {
      if (isHeading(line)) return h('li', { class: 'cbc-sub' }, line.replace(/:\s*$/, ''));
      const shown = showLine(line, factor, units);
      return h('li', null, shown.amount ? h('b', { class: 'cbc-amt' }, shown.amount) : null, shown.amount ? ' ' : null, shown.rest);
    })) : h('p', { class: 'cbc-none' }, mine ? 'No ingredients yet.' : 'No ingredients written down.');

    let n = 0;
    const method = r.steps.length ? h('ol', { class: 'cbc-steps' }, r.steps.map((step) => {
      if (isHeading(step)) return h('li', { class: 'cbc-sub' }, step.replace(/:\s*$/, ''));
      n++;
      return h('li', { dataset: { n } }, convertText(step, units));
    })) : h('p', { class: 'cbc-none' }, mine ? 'No method yet.' : 'No method written down.');

    const empty = !r.ingredients.length && !r.steps.length;
    const card = h('article', { class: `cbc fglass${r.photo || r.cover || mine ? ' has-photo' : ''}` },
      tools,
      h('div', { class: 'cbc-head' },
        h('h2', { class: 'cbc-title' }, r.title),
        details),
      this.photoEl(r, mine),
      empty && r.kind === 'link' ? h('p', { class: 'cbc-unread' }, mine
        ? 'Mutt couldn’t read the recipe on this page. Edit the card to write it in.'
        : 'This card is a link to a recipe page.') : null,
      h('div', { class: 'cbc-cols' },
        h('section', { class: 'cbc-col cbc-col-ings' }, h('h3', null, 'Ingredients'), ingredients),
        h('section', { class: 'cbc-col cbc-col-steps' }, h('h3', null, 'Method'), method)),
      r.notes ? h('div', { class: 'cbc-notes' }, h('h3', null, 'Notes'), h('p', null, r.notes)) : null,
      r.source ? h('p', { class: 'cbc-source' }, 'From ', h('a', { href: r.source, target: '_blank', rel: 'noopener noreferrer' }, r.site || r.source), ' ↗') : null);
    if (mine) this.photoDrops(card, r);
    return card;
  }

  // The dish photo, clipped to the card's corner.
  photoEl(r, mine) {
    const src = r.photo?.thumb || r.cover;
    if (!src) {
      if (!mine) return null;
      return h('button', { type: 'button', class: 'cbc-photo is-empty', onclick: (e) => this.photoMenu(e.currentTarget, r) },
        cameraIcon(), h('span', null, 'Add a photo of the finished dish'));
    }
    const img = h('img', { src, alt: `${r.title}`, decoding: 'async', draggable: 'false' });
    const el = h('button', { type: 'button', class: 'cbc-photo', 'aria-label': mine ? 'Photo options' : 'Look closer',
      onclick: (e) => (mine ? this.photoMenu(e.currentTarget, r) : this.zoom(r)) },
    img);
    return el;
  }

  photoMenu(anchor, r) {
    const has = !!(r.photo || r.cover);
    const pics = this.box.pictures().filter((b) => b.id !== r.photo?.id);
    openMenu(anchor, [
      has ? { label: 'Look closer', run: () => this.zoom(r) } : null,
      { label: has ? 'Upload a new photo…' : 'Upload a photo…', run: () => this.pickFile(r) },
      pics.length ? { label: 'Choose from this planet…', run: () => this.choosePhoto(r, pics) } : null,
      r.photo ? '-' : null,
      r.photo ? { label: 'Take the photo off', run: () => this.box.save(r.id, { photo: null }) } : null,
    ].filter(Boolean), { align: 'end' });
  }

  pickFile(r) {
    const input = h('input', { type: 'file', accept: 'image/*', hidden: true });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (file) this.usePhoto(r, file);
    });
    document.body.append(input);
    input.click();
  }

  async usePhoto(r, file) {
    if (!/^image\//.test(file.type)) { toast('That isn’t a picture.'); return; }
    // Shown straight away; saved once it's up.
    const slot = this.cardEl.querySelector('.cbc-photo');
    const url = URL.createObjectURL(file);
    if (slot) {
      slot.classList.remove('is-empty');
      slot.classList.add('is-loading');
      slot.replaceChildren(h('img', { src: url, alt: '' }));
      this.cardEl.classList.add('has-photo');
    }
    const saved = await this.box.uploadPhoto(r.id, file);
    URL.revokeObjectURL(url);
    if (saved) toast('Photo added');
    else this.sync();
  }

  photoDrops(card, r) {
    card.addEventListener('dragover', (e) => {
      if (![...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) return;
      e.preventDefault();
      e.stopPropagation();
      card.classList.add('is-dropping');
    });
    card.addEventListener('dragleave', (e) => { if (!card.contains(e.relatedTarget)) card.classList.remove('is-dropping'); });
    card.addEventListener('drop', (e) => {
      const file = [...(e.dataTransfer?.files || [])].find((f) => /^image\//.test(f.type));
      card.classList.remove('is-dropping');
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      this.usePhoto(r, file);
    });
  }

  choosePhoto(r, pics) {
    const grid = h('div', { class: 'cb-pick' }, pics.map((b) => h('button', {
      type: 'button', class: 'cb-pick-one', 'aria-label': b.title || 'Picture',
      onclick: async () => { dialog.close(); this.box.photos.add(b.id); if (await this.box.save(r.id, { photo: b.id })) toast('Photo added'); },
    }, h('img', { src: b.thumb || b.file, alt: '', loading: 'lazy' }))));
    const dialog = openDialog({ title: 'Choose a photo', body: h('div', null, grid), className: 'cb-pick-dialog' });
  }

  zoom(r) {
    const src = r.photo?.file || r.photo?.thumb || r.cover;
    if (!src) return;
    this.zoomed?.remove();
    const el = h('div', { class: 'cb-zoom', onclick: () => { el.remove(); this.zoomed = null; } }, h('img', { src, alt: r.title }));
    this.zoomed = el;
    document.body.append(el);
    if (moving()) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' });
  }

  more(anchor) {
    const r = this.recipe;
    openMenu(anchor, [
      { label: 'Move to chapter…', run: () => this.box.moveMenu(anchor, r) },
      { label: 'Open as a file', run: () => { this.close({ instant: true }); nav.openBlock(r.id); } },
      '-',
      { label: r.kind === 'link' ? 'Delete link…' : 'Delete recipe…', danger: true, run: () => this.box.remove(r) },
    ], { align: 'end' });
  }

  // ------------------------------------------------------------ editing

  edit() {
    const r = this.recipe;
    const card = this.buildEditor(r);
    this.cardEl.replaceWith(card);
    this.cardEl = card;
    requestAnimationFrame(() => card.querySelector('.cbe-title')?.focus());
  }

  buildEditor(r) {
    const field = (props) => h('input', { class: 'cbe-field', autocomplete: 'off', ...props });
    const title = field({ class: 'cbe-field cbe-title', value: r.title === 'New recipe' ? '' : r.title, placeholder: 'Name of the dish', maxlength: 200, 'aria-label': 'Name' });
    const serves = field({ type: 'number', min: 1, max: 500, inputmode: 'numeric', value: r.serves ?? '', placeholder: '4', class: 'cbe-field cbe-num', 'aria-label': 'Serves' });
    const makes = field({ value: r.makes, placeholder: 'people', maxlength: 40, class: 'cbe-field cbe-makes', 'aria-label': 'Makes what (leave empty for people)' });
    const prep = field({ type: 'number', min: 1, max: 4320, inputmode: 'numeric', value: r.prep ?? '', placeholder: '–', class: 'cbe-field cbe-num', 'aria-label': 'Prep minutes' });
    const cookF = field({ type: 'number', min: 1, max: 4320, inputmode: 'numeric', value: r.cook ?? '', placeholder: '–', class: 'cbe-field cbe-num', 'aria-label': 'Cook minutes' });
    const listId = `cb-ch-${Math.random().toString(36).slice(2, 7)}`;
    const chapter = field({ value: r.chapter, maxlength: 40, list: listId, class: 'cbe-field cbe-chapter', 'aria-label': 'Chapter' });
    const chapters = h('datalist', { id: listId }, [...new Set([...this.box.chapters, 'Breakfast', 'Starters & snacks', 'Soups & salads', 'Mains', 'Sides', 'Sauces & basics', 'Baking', 'Desserts', 'Drinks', OTHER])]
      .map((c) => h('option', { value: c })));

    // Ingredients: an amount box and a words box per line.
    const ings = h('div', { class: 'cbe-rows cbe-ings' });
    const ingRow = (line = '') => {
      const [amt, rest] = isHeading(line) ? ['', line] : splitLine(line);
      const a = field({ class: 'cbe-field cbe-amt', value: amt, placeholder: '200 g', 'aria-label': 'Amount' });
      const w = field({ class: 'cbe-field cbe-what', value: rest, placeholder: 'flour (or “For the sauce:”)', 'aria-label': 'Ingredient' });
      const row = h('div', { class: 'cbe-row' }, a, w, rowX(() => drop(row, ings)));
      w.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); const next = ingRow(); row.after(next); next.querySelector('.cbe-amt').focus(); }
        if (e.key === 'Backspace' && !w.value && !a.value && ings.children.length > 1) { e.preventDefault(); const prev = row.previousElementSibling; drop(row, ings); prev?.querySelector('.cbe-what')?.focus(); }
      });
      a.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); w.focus(); } });
      // Pasting a whole list makes one row per line.
      w.addEventListener('paste', (e) => {
        const text = e.clipboardData?.getData('text') || '';
        const lines = text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, '').trim()).filter(Boolean);
        if (lines.length < 2) return;
        e.preventDefault();
        let at = row;
        if (!a.value && !w.value) { const [x, y] = splitLine(lines.shift()); a.value = x; w.value = y; }
        for (const l of lines) { const next = ingRow(l); at.after(next); at = next; }
      });
      return row;
    };
    for (const line of r.ingredients.length ? r.ingredients : ['']) ings.append(ingRow(line));
    const addIng = h('button', { type: 'button', class: 'cbe-add', onclick: () => { const row = ingRow(); ings.append(row); row.querySelector('.cbe-amt').focus(); } }, '+ Add an ingredient');

    // The method: one box per step, numbered.
    const steps = h('ol', { class: 'cbe-rows cbe-steps' });
    const stepRow = (text = '') => {
      const t = h('textarea', { class: 'cbe-field cbe-step', rows: 1, placeholder: 'What to do next', 'aria-label': 'Step' });
      t.value = text;
      const row = h('li', { class: 'cbe-row' }, t, rowX(() => drop(row, steps)));
      autosize(t);
      t.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); const next = stepRow(); row.after(next); next.querySelector('textarea').focus(); }
        if (e.key === 'Backspace' && !t.value && steps.children.length > 1) { e.preventDefault(); const prev = row.previousElementSibling; drop(row, steps); prev?.querySelector('textarea')?.focus(); }
      });
      t.addEventListener('paste', (e) => {
        const text = e.clipboardData?.getData('text') || '';
        const parts = text.split(/\r?\n+/).map((l) => l.replace(/^\s*(?:step\s*)?\d+\s*[.):]\s*/i, '').trim()).filter(Boolean);
        if (parts.length < 2) return;
        e.preventDefault();
        let at = row;
        if (!t.value) t.value = parts.shift();
        for (const p of parts) { const next = stepRow(p); at.after(next); at = next; }
      });
      return row;
    };
    for (const s of r.steps.length ? r.steps : ['']) steps.append(stepRow(s));
    const addStep = h('button', { type: 'button', class: 'cbe-add', onclick: () => { const row = stepRow(); steps.append(row); row.querySelector('textarea').focus(); } }, '+ Add a step');

    const notes = h('textarea', { class: 'cbe-field cbe-notes', rows: 2, placeholder: 'Notes: what you’d change, what it goes with…', 'aria-label': 'Notes', maxlength: 4000 });
    notes.value = r.notes;
    autosize(notes);

    const save = h('button', { type: 'button', class: 'vbtn vbtn-blue cbe-save' }, 'Save card');
    const cancel = h('button', { type: 'button', class: 'vbtn vbtn-glass cbc-btn' }, 'Cancel');
    const collect = () => {
      const num = (el) => (el.value.trim() ? Math.round(+el.value) || null : null);
      return {
        title: title.value.trim() || 'Untitled recipe',
        serves: num(serves),
        makes: makes.value.trim(),
        prep: num(prep),
        cook: num(cookF),
        chapter: chapter.value.trim() || OTHER,
        ingredients: [...ings.children].map((row) => {
          const [a, w] = row.querySelectorAll('input');
          return [a.value.trim(), w.value.trim()].filter(Boolean).join(' ');
        }).filter(Boolean),
        steps: [...steps.querySelectorAll('textarea')].map((t) => t.value.trim()).filter(Boolean),
        notes: notes.value.trim(),
      };
    };
    const done = async () => {
      save.disabled = true;
      save.textContent = 'Saving…';
      const patch = collect();
      if (patch.chapter === r.chapter) delete patch.chapter;
      const saved = await this.box.save(r.id, patch);
      if (!saved) { save.disabled = false; save.textContent = 'Save card'; return; }
      this.editor = null;
      this.sync();
    };
    save.addEventListener('click', done);
    cancel.addEventListener('click', () => { this.editor = null; this.sync(); });

    const card = h('article', { class: 'cbc fglass is-editing has-photo' },
      h('div', { class: 'cbc-tools' },
        h('span', { class: 'cbc-chapter' }, 'Editing'),
        h('span', { class: 'cbc-gap' }),
        cancel, save, this.closeBtn),
      h('div', { class: 'cbc-head' },
        title,
        h('div', { class: 'cbe-details' },
          h('label', { class: 'cbe-lab' }, h('span', null, 'Serves / makes'), serves, makes),
          h('label', { class: 'cbe-lab' }, h('span', null, 'Prep'), prep, h('span', { class: 'cbe-unit' }, 'min')),
          h('label', { class: 'cbe-lab' }, h('span', null, 'Cook'), cookF, h('span', { class: 'cbe-unit' }, 'min')),
          h('label', { class: 'cbe-lab' }, h('span', null, 'Chapter'), chapter, chapters))),
      this.photoEl(r, true),
      h('div', { class: 'cbc-cols' },
        h('section', { class: 'cbc-col cbc-col-ings' }, h('h3', null, 'Ingredients'), ings, addIng),
        h('section', { class: 'cbc-col cbc-col-steps' }, h('h3', null, 'Method'), steps, addStep)),
      h('div', { class: 'cbc-notes' }, h('h3', null, 'Notes'), notes));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); done(); }
    });
    this.photoDrops(card, r);
    this.editor = { collect, done };
    return card;
  }

  async close({ instant = false } = {}) {
    if (this.closing) return;
    // Putting a card back while editing keeps what was typed.
    if (this.editor) {
      const r = this.recipe;
      const patch = this.editor.collect();
      if (patch.chapter === r?.chapter) delete patch.chapter;
      const same = r && ['title', 'serves', 'makes', 'prep', 'cook', 'notes'].every((k) => (patch[k] ?? '') === (r[k] ?? '') || (k === 'title' && r.title === 'New recipe' && patch.title === 'Untitled recipe'))
        && JSON.stringify(patch.ingredients) === JSON.stringify(r.ingredients) && JSON.stringify(patch.steps) === JSON.stringify(r.steps) && !patch.chapter;
      if (!same) this.box.save(this.id, patch);
      this.editor = null;
    }
    this.closing = true;
    this.unlayer();
    this.zoomed?.remove();
    this.markOut();
    const back = this.box.stack.querySelector(`.cb-top[data-id="${CSS.escape(this.id)}"]`);
    const done = () => { this.el.remove(); this.onClose?.(); };
    if (!instant && moving()) {
      const height = this.el.getBoundingClientRect().height;
      this.cardEl.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(40px) scale(0.97)' }], { duration: 340, easing: 'ease-in', fill: 'forwards' });
      this.el.animate([{ height: `${height}px` }, { height: '0px', marginBottom: '0px' }], { duration: 460, delay: 120, easing: 'cubic-bezier(0.5, 0, 0.2, 1)', fill: 'forwards' })
        .finished.then(done, done);
      back?.animate([{ transform: 'translateY(-14px)' }, { transform: 'none' }], { duration: 620, delay: 380, easing: EASE });
    } else done();
    back?.querySelector('button')?.focus({ preventScroll: true });
  }
}

function rowX(run) {
  return h('button', { type: 'button', class: 'cbe-x', 'aria-label': 'Remove', tabindex: '-1', onclick: run }, '×');
}

function drop(row, list) {
  if (list.children.length <= 1) {
    row.querySelectorAll('input, textarea').forEach((f) => { f.value = ''; });
    return;
  }
  row.remove();
}

// ------------------------------------------------------------ cooking mode

// One step at a time, big, with the screen kept on and the ingredients to tick off.
function cook(r, serves, units) {
  const base = r.serves || 1;
  const factor = serves / base;
  // Section names in the method ("For the sauce:") label the step after them.
  const steps = [];
  let section = '';
  for (const s of r.steps) {
    if (isHeading(s)) { section = s.replace(/:\s*$/, ''); continue; }
    steps.push({ text: convertText(s, units), section });
    section = '';
  }
  if (!steps.length) return;
  let at = 0;
  const used = new Set();

  const stepNo = h('p', { class: 'cbk-no' });
  const sectionEl = h('p', { class: 'cbk-section' });
  const text = h('p', { class: 'cbk-text' });
  const dots = h('div', { class: 'cbk-dots', 'aria-hidden': 'true' }, steps.map(() => h('i')));
  const back = h('button', { type: 'button', class: 'vbtn vbtn-glass cbk-back' }, 'Back');
  const next = h('button', { type: 'button', class: 'vbtn vbtn-blue cbk-next' }, 'Next');
  const awake = h('p', { class: 'cbk-awake' });

  const ingItems = r.ingredients.map((line, i) => {
    if (isHeading(line)) return h('li', { class: 'cbk-sub' }, line.replace(/:\s*$/, ''));
    const shown = showLine(line, factor, units);
    const li = h('li', null, h('button', { type: 'button', class: 'cbk-ing', 'aria-pressed': 'false' },
      h('span', { class: 'cbk-tick', 'aria-hidden': 'true' }),
      h('span', null, shown.amount ? h('b', null, shown.amount) : null, shown.amount ? ' ' : null, shown.rest)));
    li.firstChild.addEventListener('click', () => {
      used.has(i) ? used.delete(i) : used.add(i);
      li.classList.toggle('is-used', used.has(i));
      li.firstChild.setAttribute('aria-pressed', String(used.has(i)));
    });
    return li;
  });
  const ingList = h('ul', { class: 'cbk-ings' }, ingItems);
  const ingToggle = h('button', { type: 'button', class: 'vbtn vbtn-glass cbk-ing-toggle', 'aria-expanded': 'false' }, `Ingredients (${r.ingredients.filter((l) => !isHeading(l)).length})`);
  const side = h('aside', { class: 'cbk-side' }, h('h3', null, 'Ingredients'), r.serves ? h('p', { class: 'cbk-serves' }, servesText(r, serves)) : null, ingList);
  ingToggle.addEventListener('click', () => {
    const open = el.classList.toggle('is-ings');
    ingToggle.setAttribute('aria-expanded', String(open));
  });

  const close = () => {
    unlayer();
    release();
    document.removeEventListener('visibilitychange', wake);
    const done = () => el.remove();
    if (moving()) el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).finished.then(done, done);
    else done();
  };
  const closeBtn = h('button', { type: 'button', class: 'vbtn vbtn-glass vbtn-round cbc-btn cbk-close', 'aria-label': 'Stop cooking', onclick: close }, closeIcon());
  const main = h('main', { class: 'cbk-main' }, stepNo, sectionEl, text);
  const el = h('div', { class: 'cbk', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Cooking ${r.title}` },
    h('header', { class: 'cbk-head' }, h('h2', { class: 'cbk-title' }, r.title), ingToggle, closeBtn),
    side, main,
    h('footer', { class: 'cbk-foot' }, back, dots, next),
    awake);

  const show = (dir = 0) => {
    const s = steps[at];
    stepNo.textContent = `Step ${at + 1} of ${steps.length}`;
    sectionEl.textContent = s.section;
    sectionEl.hidden = !s.section;
    text.textContent = s.text;
    back.disabled = at === 0;
    next.textContent = at === steps.length - 1 ? 'Done' : 'Next';
    [...dots.children].forEach((d, i) => d.classList.toggle('is-on', i <= at));
    if (dir && moving()) {
      main.animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE });
    }
  };
  const go = (dir) => {
    if (dir > 0 && at === steps.length - 1) { close(); toast('Enjoy it'); return; }
    const to = Math.max(0, Math.min(steps.length - 1, at + dir));
    if (to === at) return;
    at = to;
    show(dir);
  };
  back.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));

  let start = null;
  main.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') start = { x: e.clientX, y: e.clientY }; });
  main.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  });

  // Keep the screen on while cooking.
  let lock = null;
  const wake = async () => {
    if (document.visibilityState !== 'visible' || !el.isConnected) return;
    try {
      lock = await navigator.wakeLock?.request('screen');
      awake.textContent = lock ? 'The screen stays on while you cook.' : '';
    } catch { awake.textContent = ''; }
  };
  const release = () => { lock?.release?.().catch(() => {}); lock = null; };
  document.addEventListener('visibilitychange', wake);

  const unlayer = layer({
    lock: true,
    key: (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        if (e.target.closest?.('button') && e.key !== 'ArrowRight') return;
        e.preventDefault(); go(1);
      }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    },
  }, { lock: true });
  document.body.append(el);
  show();
  wake();
  if (moving()) el.animate([{ opacity: 0, transform: 'scale(1.02)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE });
  requestAnimationFrame(() => next.focus({ preventScroll: true }));
}

// ------------------------------------------------------------ the offer

// Said once, quietly, in place: what we noticed, and the choice.
export function cookbookOffer({ signs, onAccept, onDecline }) {
  const accept = h('button', { type: 'button', class: 'vbtn vbtn-blue' }, 'Make it a cookbook');
  const decline = h('button', { type: 'button', class: 'vbtn vbtn-glass' }, 'Not now');
  const el = h('div', { class: 'lm-offer cb-offer', role: 'region', 'aria-label': 'This planet looks like a cookbook' },
    h('span', { class: 'cb-offer-icon', 'aria-hidden': 'true' }, h('i'), h('i')),
    h('div', { class: 'lm-offer-text' },
      h('p', { class: 'lm-offer-title' }, 'This planet looks like a cookbook'),
      h('ul', { class: 'lm-offer-signs' }, signs.map((s) => h('li', null, s))),
      h('p', { class: 'lm-offer-note' }, 'Recipes become index cards in a recipe box, sorted into chapters. Each card has the amounts (scaled for however many you’re cooking for, in metric or US), the method, your notes and a photo of the finished dish, and a cooking mode that goes one step at a time.')),
    h('div', { class: 'lm-offer-btns' }, decline, accept));
  const close = async () => {
    if (moving()) {
      const height = el.getBoundingClientRect().height;
      await el.animate([{ opacity: 1, height: `${height}px` }, { opacity: 0, height: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px' }],
        { duration: 320, easing: EASE, fill: 'forwards' }).finished.catch(() => {});
    }
    el.remove();
  };
  accept.addEventListener('click', async () => {
    accept.disabled = decline.disabled = true;
    accept.textContent = 'Reading the recipes…';
    const ok = await onAccept();
    if (ok === false) { accept.disabled = decline.disabled = false; accept.textContent = 'Make it a cookbook'; return; }
    close();
  });
  decline.addEventListener('click', () => { close(); onDecline(); });
  if (moving()) {
    requestAnimationFrame(() => el.animate([{ opacity: 0, transform: 'translateY(-8px) scale(0.99)' }, { opacity: 1, transform: 'none' }],
      { duration: 520, easing: EASE }));
  }
  return el;
}

// ------------------------------------------------------------ little drawings

const svg = (d, size = 16, extra = '') => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  return s;
};
// Steam over a dish: three soft wisps that rise and fade (CSS moves them).
function steam() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', 'cb-steam');
  s.setAttribute('viewBox', '0 0 60 40');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ['M14 38c-5-7 5-11 0-18s4-11 1-18', 'M30 38c-5-7 5-11 0-18s4-11 1-18', 'M46 38c-5-7 5-11 0-18s4-11 1-18']
    .map((d, i) => `<path d="${d}" style="--i:${i}"/>`).join('');
  return s;
}

const arrow = (dir) => svg(dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7', 22);
const closeIcon = () => svg('M6 6l12 12M18 6L6 18', 16);
const potIcon = () => svg('M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM2 10h20M9 6c0-1 1-1.5 1-2.5M14 6c0-1 1-1.5 1-2.5', 16);
const cameraIcon = () => svg('M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 26);

