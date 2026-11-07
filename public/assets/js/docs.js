// Mutt documents: a planet kept as a writing desk. Like list mode and
// reading mode, it isn't a setting to go looking for. A planet offers it once
// it holds writing (doc_signs in mutt/documents.py), and a note offers it
// while you're writing one that's grown past what fits in a note.
//
// On the desk, every text file stands as a page, showing how it starts
// (poems set as poems). Open one and it fills the screen in the editor
// (doceditor.js). Anything else on the planet stays below as files.

import { blockContextMenu } from './actions.js';
import { api } from './api.js';
import { cleanHtml, escapeHtml, fromMarkdown } from './docformat.js';
import { openContextMenu, openMenu, toast } from './ui.js';
import { EASE, bus, h, plural, reducedMotion, timeAgo } from './util.js';

const moving = () => !reducedMotion();

// Longer than this and a note is more than a note (mutt/documents.py NOTE_FITS).
export const NOTE_FITS = 1000;

export const isDocBlock = (b) => !!b && b.kind === 'text';

const titleOf = (b) => {
  if (b.title?.trim()) return b.title.trim();
  const first = ((b.content || '').split('\n').find((l) => l.trim()) || '').replace(/^#+\s*|[*_~`>]/g, '').trim();
  // A first line that's a whole paragraph: its first sentence, or its first words.
  const sentence = /^(.{12,70}?[.!?])(\s|$)/.exec(first);
  const cut = sentence ? sentence[1] : first.length > 60 ? `${first.slice(0, 56).replace(/\s+\S*$/, '')}…` : first;
  return cut || 'Untitled document';
};
export const docTitle = titleOf;

const wordsIn = (text) => ((text || '').match(/\S+/g) || []).length;

// The width, in pixels, of the page a preview draws before it's scaled to its card.
const PRINT_W = 440;

// Ways to order the desk. The owner's choice is kept with the planet.
const SORTS = {
  edited: { label: 'Last edited', by: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) },
  newest: { label: 'Newest', by: (a, b) => (b.createdAt || 0) - (a.createdAt || 0) },
  oldest: { label: 'Oldest', by: (a, b) => (a.createdAt || 0) - (b.createdAt || 0) },
  name: { label: 'Name', by: (a, b) => titleOf(a).localeCompare(titleOf(b), undefined, { numeric: true, sensitivity: 'base' }) },
  longest: { label: 'Longest', by: (a, b) => wordsIn(b.content) - wordsIn(a.content) },
  shortest: { label: 'Shortest', by: (a, b) => wordsIn(a.content) - wordsIn(b.content) },
};

export class DeskView {
  constructor({ drawer, blocks, editable, makeCollection, onChange, onOpen, onNew, onSort }) {
    this.drawer = drawer;
    this.sort = SORTS[drawer.modes?.documents?.sort] ? drawer.modes.documents.sort : 'edited';
    this.onSort = onSort;
    this.blocks = blocks;
    this.editable = editable;
    this.onChange = onChange;
    this.onOpen = onOpen;
    this.onNew = onNew;
    this.info = new Map();

    this.collection = makeCollection(blocks.filter((b) => !isDocBlock(b)), {
      onChange: () => this.changed(),
      entry: false,
      empty: '',
    });
    this.now = h('section', { class: 'dk-now', hidden: true, 'aria-label': 'Continue writing' });
    this.grid = h('div', { class: 'dk-grid', role: 'list' });
    this.count = h('span', { class: 'dk-count' });
    this.newBtn = editable ? h('button', { type: 'button', class: 'vbtn vbtn-glass dk-new' }, h('span', { 'aria-hidden': 'true' }, '+'), 'New document') : null;
    this.newBtn?.addEventListener('click', () => this.onNew?.());
    this.sortBtn = h('button', { type: 'button', class: 'dk-sort', 'aria-haspopup': 'menu' });
    this.sortBtn.addEventListener('click', () => this.sortMenu());
    this.othersHead = h('h3', { class: 'dk-head dk-others-head' }, 'Other files');
    this.others = h('div', { class: 'dk-others' }, this.othersHead, this.collection.el);
    this.el = h('div', { class: 'dk' },
      this.now,
      h('div', { class: 'dk-desk' },
        h('div', { class: 'dk-bar' }, h('h3', { class: 'dk-head' }, 'Documents', this.count),
          h('div', { class: 'dk-bar-end' }, this.sortBtn, this.newBtn)),
        this.grid),
      this.others);

    // Each page shows its document at the size of a real page, scaled to the card.
    this.sizer = new ResizeObserver(() => this.fit());
    this.sizer.observe(this.grid);
    this.render({ entrance: true });
    this.refresh();

    this.off = [
      bus.on('block:deleted', ({ id }) => this.remove(id)),
      bus.on('block:disconnected', ({ block, drawerId }) => { if (drawerId === drawer.id) this.remove(block.id); }),
      bus.on('block:connected', ({ block, drawerId }) => {
        if (drawerId !== drawer.id || !isDocBlock(block)) return;
        setTimeout(() => { this.collection.drop?.(block.id); this.add(block); });
      }),
      bus.on('block:changed', (b) => {
        const mine = this.blocks.find((x) => x.id === b.id);
        if (!mine) return;
        Object.assign(mine, b);
        this.info.delete(b.id);
        this.render();
        this.refreshSoon();
      }),
    ];
  }

  docs() { return this.blocks.filter(isDocBlock); }

  list() { return [...this.docs(), ...this.collection.list()]; }

  // For the editor's side list.
  summaries() {
    return this.sorted().map((b) => ({ id: b.id, title: titleOf(b), words: wordsIn(b.content) }));
  }

  sorted() { return [...this.docs()].sort(SORTS[this.sort].by); }

  sortMenu() {
    openMenu(this.sortBtn, Object.entries(SORTS).map(([key, { label }]) => ({
      label, hint: key === this.sort ? '✓' : null, run: () => this.setSort(key),
    })), { className: 'dk-sort-menu' });
  }

  setSort(key) {
    if (key === this.sort) return;
    this.sort = key;
    this.render({ reorder: true });
    // Visitors can sort for themselves; only the owner's choice is kept.
    if (this.editable) this.onSort?.(key);
  }

  changed() {
    this.blocks = [...this.docs(), ...this.collection.blocks];
    this.others.hidden = !this.collection.blocks.length;
    this.onChange?.(this.blocks);
  }

  refreshSoon() {
    clearTimeout(this.soon);
    this.soon = setTimeout(() => this.refresh(), 400);
  }

  async refresh() {
    try {
      const { docs } = await api.get(`/api/drawers/${this.drawer.id}/docs`);
      for (const d of docs) this.info.set(d.id, d);
      this.render();
    } catch { /* the notes' own words will do */ }
  }

  add(block) {
    if (!this.blocks.some((b) => b.id === block.id)) this.blocks.unshift(block);
    this.changed();
    this.render({ born: block.id });
    this.refreshSoon();
  }

  remove(id) {
    if (!this.docs().some((b) => b.id === id)) return;
    this.blocks = this.blocks.filter((b) => b.id !== id);
    this.info.delete(id);
    const el = this.grid.querySelector(`[data-id="${CSS.escape(id)}"]`);
    const done = () => { this.changed(); this.render(); };
    if (el && moving()) el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.94)' }], { duration: 220, easing: 'ease-in' }).finished.then(done, done);
    else done();
  }

  fit() {
    const card = this.grid.querySelector('.dk-paper');
    if (!card) return;
    this.grid.style.setProperty('--k', String(card.clientWidth / PRINT_W));
    const big = this.now.querySelector('.dk-paper');
    if (big) this.now.style.setProperty('--k', String(big.clientWidth / PRINT_W));
  }

  paper(b) {
    const i = this.info.get(b.id) || {};
    let html = i.html || fromMarkdown((b.content || '').slice(0, 4000));
    if (i.poem && b.title && !/^\s*<(h[1-3]|p class="title")/.test(html)) html = `<h2>${escapeHtml(b.title)}</h2>${html}`;
    return h('span', { class: `dk-paper${i.poem ? ' is-poem' : ''}`, dataset: { font: i.font || 'serif' }, 'aria-hidden': 'true' },
      h('span', { class: 'dk-print', html: cleanHtml(html, { own: true }) }));
  }

  render({ entrance = false, born = null, reorder = false } = {}) {
    const docs = this.sorted();
    this.sortBtn.replaceChildren(h('span', { class: 'dk-sort-label' }, 'Sort'), SORTS[this.sort].label);
    this.sortBtn.hidden = docs.length < 2;
    // Where each page was, so a new order glides into place.
    const before = reorder && moving()
      ? new Map([...this.grid.children].map((el) => [el.dataset.id, el.getBoundingClientRect()]))
      : null;
    const total = docs.reduce((a, b) => a + wordsIn(b.content), 0);
    this.count.textContent = docs.length ? `${docs.length} · ${plural(total, 'word')}` : '';
    this.others.hidden = !this.collection.blocks.length;

    // The one you were last writing, up top.
    const recent = docs.length > 2 ? [...docs].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] : null;
    if (recent && this.editable) {
      this.now.replaceChildren(h('button', { type: 'button', class: 'dk-now-card fglass', onclick: () => this.onOpen(recent.id) },
        this.paper(recent),
        h('span', { class: 'dk-now-text' },
          h('span', { class: 'dk-now-label' }, 'Continue writing'),
          h('span', { class: 'dk-now-title' }, titleOf(recent)),
          h('span', { class: 'dk-now-meta' }, `${plural(wordsIn(recent.content), 'word')} · edited ${timeAgo(recent.updatedAt)}`)),
        h('span', { class: 'vbtn vbtn-blue dk-now-go' }, 'Continue')));
      this.now.hidden = false;
    } else {
      this.now.hidden = true;
    }

    const cards = docs.map((b) => {
      const i = this.info.get(b.id) || {};
      const el = h('div', { class: 'dk-doc', role: 'listitem', dataset: { id: b.id } },
        h('button', { type: 'button', class: 'dk-open', 'aria-label': `Open ${titleOf(b)}`, onclick: () => this.onOpen(b.id) },
          this.paper(b),
          i.comments ? h('span', { class: 'dk-badge', title: plural(i.comments, 'open comment') }, String(i.comments)) : null),
        h('p', { class: 'dk-name', title: titleOf(b) }, titleOf(b)),
        h('p', { class: 'dk-meta' }, `${i.poem ? 'Poem · ' : ''}${plural(wordsIn(b.content), 'word')} · ${timeAgo(b.updatedAt)}`));
      el.addEventListener('contextmenu', (e) => this.context(e, el, b));
      return el;
    });
    if (!cards.length) cards.push(h('p', { class: 'dk-empty' }, this.editable ? 'No documents here yet.' : 'No documents here yet.'));
    this.grid.replaceChildren(...cards);
    requestAnimationFrame(() => this.fit());
    if (before) {
      for (const el of this.grid.children) {
        const was = before.get(el.dataset.id);
        if (!was) continue;
        const now = el.getBoundingClientRect();
        const dx = was.left - now.left;
        const dy = was.top - now.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 520, easing: EASE });
      }
    }
    if (moving() && (entrance || born)) {
      [...this.grid.children].forEach((el, n) => {
        if (born && el.dataset.id !== born) return;
        el.animate([{ opacity: 0, transform: 'translateY(14px) scale(0.97)' }, { opacity: 1, transform: 'none' }],
          { duration: 520, delay: born ? 0 : Math.min(n, 12) * 40, easing: EASE, fill: 'backwards' });
      });
    }
  }

  context(e, el, b) {
    e.preventDefault();
    const open = () => this.onOpen(b.id);
    if (b.mine !== false) blockContextMenu(e, el, b, { drawer: this.drawer, open });
    else openContextMenu(e, [{ label: 'Open', run: open }], { title: titleOf(b), target: el });
  }

  dropTarget() { return this.collection.dropTarget(); }

  async pasteText(text) {
    if (!this.editable || !text.trim()) return;
    try {
      const { block } = await api.post('/api/blocks', { content: text, drawer: this.drawer.id });
      this.add(block);
      toast('Added as a document');
    } catch (err) { toast(err.message); }
  }

  destroy() {
    this.sizer.disconnect();
    this.off.forEach((off) => off());
    this.collection.destroy();
  }
}

// ------------------------------------------------------------ the offer

export function deskOffer({ signs, onAccept, onDecline }) {
  const accept = h('button', { type: 'button', class: 'vbtn vbtn-blue' }, 'Open it in Mutt Documents');
  const decline = h('button', { type: 'button', class: 'vbtn vbtn-glass' }, 'Not now');
  const el = h('div', { class: 'lm-offer dk-offer', role: 'region', 'aria-label': 'This planet looks like writing' },
    h('span', { class: 'dk-offer-icon', 'aria-hidden': 'true' }, h('i'), h('i')),
    h('div', { class: 'lm-offer-text' },
      h('p', { class: 'lm-offer-title' }, 'This planet looks like writing'),
      h('ul', { class: 'lm-offer-signs' }, signs.map((s) => h('li', null, s))),
      h('p', { class: 'lm-offer-note' }, 'Its notes become documents on paper pages, with headings, page setup, comments, versions, and downloads as PDF or Word. Poems are set as poems.')),
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
    accept.textContent = 'Opening…';
    const ok = await onAccept();
    if (ok === false) { accept.disabled = decline.disabled = false; accept.textContent = 'Open it in Mutt Documents'; return; }
    close();
  });
  decline.addEventListener('click', () => { close(); onDecline(); });
  if (moving()) requestAnimationFrame(() => el.animate([{ opacity: 0, transform: 'translateY(-8px) scale(0.99)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: EASE }));
  return el;
}

// ------------------------------------------------------------ while you're writing a note

// A quiet line under a note that's grown past what a note holds.
export function writingHint(text, onOpen) {
  const btn = h('button', { type: 'button', class: 'dk-hint-btn' }, text);
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => { e.stopPropagation(); onOpen(); });
  const el = h('div', { class: 'dk-hint', hidden: true }, h('span', null, 'Long for a note.'), btn);
  let shown = false;
  el.check = (value) => {
    const on = (value || '').trim().length >= NOTE_FITS;
    if (on === shown) return;
    shown = on;
    el.hidden = !on;
    if (on && moving()) el.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EASE });
  };
  return el;
}
