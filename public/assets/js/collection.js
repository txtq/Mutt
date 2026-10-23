// A set of blocks with the auto-sort tool on top: filter chips by kind (or
// file type), and a Grid ⇄ Bundles switch that sorts everything into boards.

import { blockMenu, openConnect } from './actions.js';
import { api } from './api.js';
import { miniFace } from './cells.js';
import { entryCell } from './entry.js';
import { Grid } from './grid.js';
import { KINDS, KIND_LABEL, countKinds, imageSrc } from './kinds.js';
import { nav } from './nav.js';
import { transition } from './transitions.js';
import { toast } from './ui.js';
import { addFiles, contextKey, pendingFor, retry } from './uploads.js';
import { bus, h, plural, uid } from './util.js';

const isUrl = (s) => /^https?:\/\/\S+$/i.test(s.trim());

// ---------------------------------------------------------------- sliding-pill control

export function segmented(options, active, onPick, { className = '' } = {}) {
  const ind = h('span', { class: 'seg-ind', 'aria-hidden': 'true' });
  const el = h('div', { class: `seg ${className}`, role: 'tablist' }, ind);
  const buttons = new Map();
  let current = active;
  const place = () => {
    const btn = buttons.get(current);
    if (!btn || !btn.offsetWidth) { ind.style.opacity = '0'; return; }
    ind.style.opacity = '1';
    ind.style.width = `${btn.offsetWidth}px`;
    ind.style.transform = `translateX(${btn.offsetLeft}px)`;
  };
  const set = (value, animate = true) => {
    current = value;
    for (const [v, b] of buttons) b.setAttribute('aria-selected', v === value);
    el.classList.toggle('is-instant', !animate);
    requestAnimationFrame(place);
  };
  // Re-measure when it first appears on the page or fonts change its size.
  new ResizeObserver(() => {
    el.classList.add('is-instant');
    place();
  }).observe(el);
  const render = (opts, value) => {
    for (const b of buttons.values()) b.remove();
    buttons.clear();
    for (const o of opts) {
      const b = h('button', { type: 'button', role: 'tab', class: 'seg-btn', onclick: () => onPick(o.value) },
        h('span', null, o.label), o.count != null ? h('span', { class: 'seg-n' }, o.count) : null);
      buttons.set(o.value, b);
      el.append(b);
    }
    set(value, false);
  };
  render(options, active);
  return { el, set, render };
}

// ---------------------------------------------------------------- bundle boards

export function pickCovers(blocks, n = 3) {
  const visual = blocks.filter((b) => imageSrc(b) || (b.kind === 'video' && b.file));
  const rest = blocks.filter((b) => !visual.includes(b));
  return [...visual, ...rest].slice(0, n);
}

export function board({ kind, count, covers, href, label }) {
  const tiles = [0, 1, 2].map((i) => {
    const block = covers[i];
    const tile = h('div', { class: 'tile' });
    if (block) {
      const face = miniFace(block);
      face.dataset.vt = `b-${block.id}`;
      tile.append(face);
    }
    return tile;
  });
  const el = h('a', { class: 'board', href, dataset: { kind } },
    h('div', { class: `board-cover covers-${Math.min(3, covers.length)}` }, tiles),
    h('div', { class: 'board-name' }, label || KIND_LABEL[kind]),
    h('div', { class: 'board-meta' }, plural(count, 'block')));
  el.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    nav.go(href);
  });
  return el;
}

export function boardsFor(blocks, hrefFor) {
  const byKind = {};
  for (const b of blocks) (byKind[b.kind] ||= []).push(b);
  return KINDS.filter((k) => byKind[k]).map((kind) =>
    board({ kind, count: byKind[kind].length, covers: pickCovers(byKind[kind]), href: hrefFor(kind) }));
}

// ---------------------------------------------------------------- collection

export class Collection {
  constructor({ blocks, url, drawer = null, entry = false, sortable = false, chips = 'kind', modes = false, empty, extras = null, onChange } = {}) {
    this.blocks = blocks;
    this.drawer = drawer;
    this.ctx = drawer ? { drawerId: drawer.id } : {};
    this.chipsMode = chips;
    this.modes = modes;
    this.sortableBase = sortable;
    this.onChange = onChange;
    this.removedAt = new Map();
    this.readUrl(url);

    this.entry = entry ? entryCell({
      onText: (text) => this.addText(text),
      onFiles: (files) => this.addFiles(files),
    }) : null;
    this.grid = new Grid({
      entry: this.entry,
      sortable: this.isSortable(),
      onOpen: (id) => nav.openBlock(id),
      onAction: (act, id, btn) => this.action(act, id, btn),
      onReorder: (ids) => this.saveOrder(ids),
      empty,
    });

    this.chips = chips ? segmented(this.chipOptions(), this.filter || '', (v) => this.pickFilter(v), { className: 'chips' }) : null;
    this.modeSeg = modes ? segmented([{ value: 'grid', label: 'Grid' }, { value: 'bundles', label: 'Bundles' }], this.mode, (v) => this.pickMode(v), { className: 'modes' }) : null;
    this.toolbar = h('div', { class: 'toolbar' },
      h('div', { class: 'toolbar-left' }, this.chips?.el),
      h('div', { class: 'toolbar-right' }, extras, this.modeSeg?.el));
    this.body = h('div', { class: 'collection-body' });
    this.el = h('div', { class: 'collection' }, this.toolbar, this.body);

    this.renderBody('reveal');
    for (const item of pendingFor(this.ctx)) this.grid.addPending(item);

    this.off = [
      bus.on('block:changed', (b) => this.patch(b)),
      bus.on('block:deleted', ({ id }) => this.drop(id)),
      bus.on('block:connected', (e) => this.connected(e)),
      bus.on('block:disconnected', (e) => this.disconnected(e)),
      bus.on('upload:add', (item) => this.mine(item) && this.mode === 'grid' && this.grid.addPending(item)),
      bus.on('upload:progress', (item) => this.mine(item) && this.grid.updatePending(item)),
      bus.on('upload:fail', (item) => this.mine(item) && this.grid.updatePending(item)),
      bus.on('upload:done', (item) => this.mine(item) && this.arrived(item.key, item.block)),
    ];
  }

  readUrl(url) {
    const param = this.chipsMode === 'ext' ? 'ext' : 'bundle';
    this.filter = url.searchParams.get(param) || null;
    this.mode = this.modes && url.searchParams.get('view') === 'bundles' ? 'bundles' : 'grid';
  }

  isSortable() {
    return this.sortableBase && !this.filter;
  }

  mine(item) {
    return contextKey(item.ctx) === contextKey(this.ctx);
  }

  matches(block) {
    if (!this.filter) return true;
    return this.chipsMode === 'ext' ? (block.ext || '') === this.filter : block.kind === this.filter;
  }

  visible() {
    return this.blocks.filter((b) => this.matches(b));
  }

  list() {
    return this.mode === 'grid' ? this.visible() : this.blocks;
  }

  chipOptions() {
    if (this.chipsMode === 'ext') {
      const counts = {};
      for (const b of this.blocks) counts[b.ext || ''] = (counts[b.ext || ''] || 0) + 1;
      const exts = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
      if (exts.length < 2) return [];
      return [{ value: '', label: 'All', count: this.blocks.length },
        ...exts.map((e) => ({ value: e, label: e ? e.toUpperCase() : 'Other', count: counts[e] }))];
    }
    const counts = countKinds(this.blocks);
    return [{ value: '', label: 'All', count: this.blocks.length },
      ...KINDS.filter((k) => counts[k]).map((k) => ({ value: k, label: KIND_LABEL[k], count: counts[k] }))];
  }

  refreshCounts() {
    if (this.chips) {
      const options = this.chipOptions();
      if (this.filter && !options.some((o) => o.value === this.filter)) options.push({ value: this.filter, label: KIND_LABEL[this.filter] || this.filter.toUpperCase(), count: 0 });
      this.chips.render(options, this.mode === 'grid' ? this.filter || '' : null);
    }
    if (this.mode === 'bundles') this.renderBoards();
    this.onChange?.(this.blocks);
  }

  renderBody(animate) {
    if (this.mode === 'bundles') {
      this.renderBoards();
      this.body.replaceChildren(this.boards);
      this.chips?.set(null, false);
    } else {
      this.grid.sortable = this.isSortable();
      this.grid.set(this.visible(), { animate });
      this.body.replaceChildren(this.grid.el);
    }
    this.toolbar.classList.toggle('is-bundles', this.mode === 'bundles');
  }

  renderBoards() {
    const base = nav.current();
    const hrefFor = (kind) => {
      const u = new URL(base);
      u.searchParams.delete('view');
      u.searchParams.delete('b');
      u.searchParams.set('bundle', kind);
      return u.pathname + u.search;
    };
    const boards = boardsFor(this.blocks, hrefFor);
    if (!this.boards) this.boards = h('div', { class: 'grid grid-boards' });
    this.boards.replaceChildren(...(boards.length ? boards : [h('div', { class: 'grid-empty' }, 'Nothing to sort yet.')]));
    boards.forEach((b, i) => { b.style.setProperty('--i', i); b.classList.add('reveal'); });
  }

  pickFilter(value) {
    const u = nav.current();
    u.searchParams.delete('view');
    u.searchParams.delete('b');
    const param = this.chipsMode === 'ext' ? 'ext' : 'bundle';
    if (value) u.searchParams.set(param, value);
    else u.searchParams.delete(param);
    nav.go(u.pathname + u.search, { replace: true });
  }

  pickMode(mode) {
    const u = nav.current();
    u.searchParams.delete('b');
    if (mode === 'bundles') { u.searchParams.set('view', 'bundles'); u.searchParams.delete('bundle'); }
    else u.searchParams.delete('view');
    nav.go(u.pathname + u.search, { replace: true });
  }

  // Called by the router when only the query changed.
  async update(url) {
    const prevMode = this.mode;
    const prevFilter = this.filter;
    this.readUrl(url);
    if (prevMode === this.mode && prevFilter === this.filter) return true;
    this.modeSeg?.set(this.mode);
    if (prevMode !== this.mode) {
      await transition(() => {
        this.renderBody(false);
        this.chips?.set(this.mode === 'grid' ? this.filter || '' : null, false);
      }, { type: 'mode' });
    } else {
      this.chips?.set(this.filter || '');
      this.grid.sortable = this.isSortable();
      this.grid.set(this.visible(), { animate: 'flip' });
    }
    return true;
  }

  // ------------------------------------------------------------ adding

  addFiles(files) {
    if (!files.length) return;
    if (this.mode !== 'grid') this.pickMode('grid');
    addFiles(files, this.ctx);
  }

  async addText(text) {
    const item = { key: `up-${uid()}`, text, link: isUrl(text), name: isUrl(text) ? text.trim() : '', status: 'uploading', progress: 0.6 };
    this.grid.addPending(item);
    try {
      const { block } = await api.post('/api/blocks', { content: text, drawer: this.drawer?.id });
      this.arrived(item.key, block);
    } catch (err) {
      this.grid.resolve(item.key, null, { keep: false });
      this.entry?.focusText(text);
      toast(err.message);
    }
  }

  arrived(key, block) {
    if (!block) return;
    if (!this.blocks.some((b) => b.id === block.id)) this.blocks.unshift(block);
    const fits = this.matches(block) && this.mode === 'grid';
    this.grid.resolve(key, block, { keep: fits });
    if (!fits) {
      toast(`Added to ${KIND_LABEL[block.kind]}`, { action: { label: 'Show', run: () => this.pickFilter(this.chipsMode === 'ext' ? block.ext : block.kind) } });
    }
    // Uploads finish in any order; once a batch lands, keep the order on screen.
    if (this.drawer && this.isSortable() && this.mode === 'grid' && !this.grid.el.querySelector(':scope > .cell.is-pending')) {
      const keys = this.grid.keys();
      if (keys.length === this.blocks.length) this.saveOrder(keys);
    }
    this.refreshCounts();
  }

  // ------------------------------------------------------------ reacting to edits elsewhere

  patch(block) {
    const i = this.blocks.findIndex((b) => b.id === block.id);
    if (i < 0) return;
    this.blocks[i] = { ...this.blocks[i], ...block };
    this.grid.update(this.blocks[i]);
  }

  drop(id) {
    const i = this.blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    this.blocks.splice(i, 1);
    this.grid.remove(id);
    this.refreshCounts();
  }

  connected({ block, drawerId }) {
    const i = this.blocks.findIndex((b) => b.id === block.id);
    if (i >= 0) { this.patch(block); return; }
    if (!this.drawer || drawerId !== this.drawer.id) return;
    const at = Math.min(this.removedAt.get(block.id) ?? 0, this.blocks.length);
    this.blocks.splice(at, 0, block);
    this.removedAt.delete(block.id);
    if (this.mode === 'grid') this.grid.set(this.visible(), { animate: 'flip' });
    this.refreshCounts();
  }

  disconnected({ block, drawerId }) {
    if (this.drawer && drawerId === this.drawer.id) {
      const i = this.blocks.findIndex((b) => b.id === block.id);
      if (i >= 0) this.removedAt.set(block.id, i);
      this.drop(block.id);
    } else this.patch(block);
  }

  // ------------------------------------------------------------ cell actions

  action(act, id, btn) {
    if (act === 'retry') { retry(id); return; }
    const block = this.blocks.find((b) => b.id === id);
    if (!block) return;
    if (act === 'connect') openConnect(btn, block, { align: 'start' });
    if (act === 'more') blockMenu(btn, block, { drawer: this.drawer, open: () => nav.openBlock(id) });
  }

  async saveOrder(ids) {
    const index = new Map(ids.map((id, i) => [id, i]));
    this.blocks.sort((a, b) => (index.get(a.id) ?? 1e9) - (index.get(b.id) ?? 1e9));
    try {
      await api.put(`/api/drawers/${this.drawer.id}/order`, { ids });
    } catch (err) {
      toast(err.message);
    }
  }

  dropTarget() {
    return {
      label: this.drawer ? `Drop to add to ${this.drawer.title}` : 'Drop to add',
      drop: (files) => this.addFiles(files),
    };
  }

  pasteText(text) {
    if (this.entry && this.mode === 'grid') this.entry.focusText(text);
  }

  destroy() {
    this.off.forEach((off) => off());
  }
}

