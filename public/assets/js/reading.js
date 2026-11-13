// Reading mode: a planet kept as a bookshelf. Like list mode, it isn't a
// setting to go looking for: a planet offers it once books are what it holds
// (shelf_signs in mutt/books.py), and its switch lives in the planet's •••
// menu after that.
//
// Every EPUB and PDF on the planet stands on the shelf by its cover, with how
// far you've read. Anything else on the planet stays below as files.

import { blockContextMenu } from './actions.js';
import { api } from './api.js';
import { nav } from './nav.js';
import { openReader } from './reader.js';
import { openContextMenu, sectionHead } from './ui.js';
import { contextKey } from './uploads.js';
import { DUR, EASE, EASE_LEAVE, STAGGER, bus, h, reducedMotion, seeded, timeAgo } from './util.js';

const moving = () => !reducedMotion();

export const isBookBlock = (b) => !!b && (b.ext === 'epub' || b.mime === 'application/epub+zip' || b.kind === 'pdf');

// Covers for books that came without one: cloth colours, set like a jacket.
const CLOTHS = ['#7a2e2a', '#2c4a6e', '#3d5a3a', '#6b4a2b', '#4b3a63', '#7b5a1f', '#2f5d5d', '#5b2a44', '#33363d', '#8a4b2a'];

function madeCover(title, author) {
  const tone = CLOTHS[Math.floor(seeded(title || 'book')() * CLOTHS.length) % CLOTHS.length];
  return h('span', { class: 'rp-made', style: { '--cloth': tone } },
    h('span', { class: 'rp-made-title' }, title || 'Untitled'),
    author ? h('span', { class: 'rp-made-by' }, author) : null);
}

const pct = (p) => Math.max(1, Math.round(p * 100));

function stateText(b) {
  if (b.percent >= 0.995) return 'Finished';
  if (b.percent > 0) return `${pct(b.percent)}%`;
  return b.format === 'pdf' && !b.converted ? 'PDF' : 'New';
}

export class ShelfView {
  constructor({ drawer, blocks, editable, makeCollection, onChange }) {
    this.drawer = drawer;
    this.blocks = blocks;
    this.editable = editable;
    this.onChange = onChange;
    this.info = new Map();
    this.ctx = { drawerId: drawer.id };

    this.collection = makeCollection(blocks.filter((b) => !isBookBlock(b)), {
      onChange: () => this.changed(),
      empty: editable ? null : '',
    });
    this.now = h('section', { class: 'rp-now', hidden: true, 'aria-label': 'Continue reading' });
    this.shelf = h('div', { class: 'rp-shelf', role: 'list' });
    this.head = sectionHead('Books');
    this.count = this.head.fact;
    this.othersHead = sectionHead('Other files').el;
    this.el = h('div', { class: 'rp' },
      this.now,
      h('div', { class: 'rp-shelf-wrap' },
        this.head.el,
        this.shelf),
      h('div', { class: 'rp-others' }, this.othersHead, this.collection.el));
    this.render({ entrance: true });
    this.refresh();

    this.off = [
      bus.on('upload:done', (item) => {
        if (contextKey(item.ctx) !== contextKey(this.ctx) || !isBookBlock(item.block)) return;
        // The files grid takes every upload first; books move up to the shelf.
        setTimeout(() => {
          this.collection.drop(item.block.id);
          this.add(item.block);
        });
      }),
      bus.on('block:deleted', ({ id }) => this.removeBook(id)),
      bus.on('block:disconnected', ({ block, drawerId }) => { if (drawerId === drawer.id) this.removeBook(block.id); }),
      bus.on('block:connected', ({ block, drawerId }) => {
        if (drawerId !== drawer.id || !isBookBlock(block)) return;
        setTimeout(() => { this.collection.drop(block.id); this.add(block); });
      }),
      bus.on('block:changed', (b) => {
        const i = this.books().findIndex((x) => x.id === b.id);
        if (i < 0) return;
        Object.assign(this.blocks.find((x) => x.id === b.id), b);
        this.render();
      }),
    ];
  }

  books() { return this.blocks.filter(isBookBlock); }

  list() { return [...this.books(), ...this.collection.list()]; }

  changed() {
    this.blocks = [...this.books(), ...this.collection.blocks];
    this.othersHead.hidden = !this.collection.blocks.length;
    this.onChange?.(this.blocks);
  }

  async refresh() {
    try {
      const { books } = await api.get(`/api/drawers/${this.drawer.id}/shelf`);
      for (const b of books) this.info.set(b.id, b);
      this.render();
    } catch { /* covers and titles from the files will do */ }
  }

  add(block) {
    if (!this.blocks.some((b) => b.id === block.id)) this.blocks.unshift(block);
    this.changed();
    this.render({ born: block.id });
    this.refresh();
  }

  removeBook(id) {
    if (!this.books().some((b) => b.id === id)) return;
    this.blocks = this.blocks.filter((b) => b.id !== id);
    this.info.delete(id);
    const el = this.shelf.querySelector(`[data-id="${CSS.escape(id)}"]`);
    const done = () => { this.changed(); this.render(); };
    if (el && moving()) el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.92)' }], { duration: DUR.change, easing: EASE_LEAVE }).finished.then(done, done);
    else done();
  }

  view(block) {
    const i = this.info.get(block.id) || {};
    return {
      id: block.id,
      title: i.title || block.title || block.fileName || 'Untitled',
      author: i.author || block.meta?.book?.author || block.meta?.media?.author || '',
      cover: i.cover || block.thumb || null,
      percent: i.percent || 0,
      readAt: i.readAt || null,
      format: i.format || (block.kind === 'pdf' ? 'pdf' : 'epub'),
      converted: !!i.converted,
      block,
    };
  }

  coverEl(v, big = false) {
    return h('span', { class: `rp-cover${big ? ' is-big' : ''}`, dataset: { vt: big ? null : `book-${v.id}` } },
      v.cover ? h('img', { src: v.cover, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' }) : madeCover(v.title, v.author),
      h('span', { class: 'rp-spine', 'aria-hidden': 'true' }));
  }

  render({ entrance = false, born = null } = {}) {
    const books = this.books().map((b) => this.view(b));
    this.count.textContent = books.length ? String(books.length) : '';
    this.othersHead.hidden = !this.collection.blocks.length;
    this.el.querySelector('.rp-others').hidden = !this.editable && !this.collection.blocks.length;

    // The one you're in the middle of, up top.
    const current = books.filter((b) => b.readAt && b.percent < 0.995).sort((a, b) => b.readAt - a.readAt)[0];
    if (current) {
      const bar = h('span', { class: 'rp-bar' }, h('i', { style: { width: `${Math.round(current.percent * 100)}%` } }));
      this.now.replaceChildren(h('button', { type: 'button', class: 'rp-now-card fglass', onclick: () => this.read(current) },
        this.coverEl(current, true),
        h('span', { class: 'rp-now-text' },
          h('span', { class: 'rp-now-label' }, 'Continue reading'),
          h('span', { class: 'rp-now-title' }, current.title),
          current.author ? h('span', { class: 'rp-now-by' }, current.author) : null,
          bar,
          h('span', { class: 'rp-now-meta' }, `${pct(current.percent)}% · read ${timeAgo(current.readAt)}`),
          h('span', { class: 'btn btn-main rp-now-go' }, 'Continue'))));
      this.now.hidden = false;
    } else {
      this.now.hidden = true;
    }

    const cards = books.map((v) => {
      const el = h('div', { class: 'rp-book', role: 'listitem', dataset: { id: v.id } },
        h('button', { type: 'button', class: 'rp-open', 'aria-label': `Read ${v.title}`, onclick: () => this.read(v) },
          this.coverEl(v),
          v.percent > 0 ? h('span', { class: 'rp-prog', 'aria-hidden': 'true' }, h('i', { style: { width: `${Math.round(v.percent * 100)}%` } })) : null),
        h('p', { class: 'rp-name', title: v.title }, v.title),
        // the author, with one fact beside them: how far through, New, PDF
        h('p', { class: 'rp-cap' },
          v.author ? h('span', { class: 'rp-by' }, v.author) : null,
          h('span', { class: `rp-state${v.percent >= 0.995 ? ' is-done' : ''}` }, stateText(v))));
      el.addEventListener('contextmenu', (e) => this.context(e, el, v));
      return el;
    });
    if (!cards.length) {
      cards.push(h('p', { class: 'rp-empty' }, this.editable ? 'No books here yet. Drop an EPUB or a PDF on this page to add one.' : 'No books here yet.'));
    }
    this.shelf.replaceChildren(...cards);
    if (moving() && (entrance || born)) {
      [...this.shelf.children].forEach((el, i) => {
        if (born && el.dataset.id !== born) return;
        el.animate([{ opacity: 0, transform: 'translateY(14px) scale(0.97)' }, { opacity: 1, transform: 'none' }],
          { duration: DUR.arrive, delay: born ? 0 : Math.min(i, 14) * STAGGER, easing: EASE, fill: 'backwards' });
      });
    }
  }

  read(v) {
    openReader(v.id, {
      title: v.title,
      cover: v.cover,
      onClose: ({ percent }) => {
        const info = this.info.get(v.id) || {};
        this.info.set(v.id, { ...info, percent, readAt: Date.now() });
        this.render();
        this.refresh();
      },
    });
  }

  context(e, el, v) {
    e.preventDefault();
    const read = { icon: 'book', label: 'Read', run: () => this.read(v) };
    const asFile = { icon: 'files', label: 'Open as a file', run: () => nav.openBlock(v.id) };
    if (v.block.mine) blockContextMenu(e, el, v.block, { drawer: this.drawer, open: () => this.read(v), extra: [asFile] });
    else openContextMenu(e, [read, asFile], { title: v.title, target: el });
  }

  dropTarget() { return this.collection.dropTarget(); }

  pasteText(text) { this.collection.pasteText(text); }

  destroy() {
    this.off.forEach((off) => off());
    this.collection.destroy();
  }
}
