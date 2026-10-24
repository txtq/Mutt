// A set of files shown in the grid, kept in sync with uploads, edits made
// elsewhere, and (in Everything) the chosen sort.

import { blockMenu, openConnect, openSave } from './actions.js';
import { api } from './api.js';
import { entryCell } from './entry.js';
import { Grid } from './grid.js';
import { SORTS, arrange, ensureLooks } from './look.js';
import { nav } from './nav.js';
import { sparkle } from './theme.js';
import { toast } from './ui.js';
import { addFiles, contextKey, pendingFor, retry } from './uploads.js';
import { bus, debounce, uid } from './util.js';

const isUrl = (s) => /^https?:\/\/\S+$/i.test(s.trim());

export class Collection {
  // sort: 'manual' keeps the given order (drawers); anything else is a SORTS value.
  // share: files added here go straight to the community. keep: which files belong here.
  constructor({ blocks, drawer = null, entry = false, sortable = false, sort = 'manual', readOnly = false, share = false, keep, empty, onChange } = {}) {
    this.blocks = blocks;
    this.drawer = drawer;
    this.ctx = drawer ? { drawerId: drawer.id } : share ? { share: true } : {};
    this.keep = keep || (() => true);
    this.sort = sort;
    this.readOnly = readOnly;
    this.onChange = onChange;
    this.removedAt = new Map();

    this.entry = entry && !readOnly ? entryCell({
      onText: (text) => this.addText(text),
      onFiles: (files) => this.addFiles(files),
    }) : null;
    this.grid = new Grid({
      entry: this.entry,
      sortable: sortable && !readOnly,
      onOpen: (id) => nav.openBlock(id),
      onAction: (act, id, btn) => this.action(act, id, btn),
      onReorder: (ids) => this.saveOrder(ids),
      empty,
    });
    this.el = this.grid.el;
    this.render('reveal');
    if (!readOnly) for (const item of pendingFor(this.ctx)) this.grid.addPending(item);

    this.resort = debounce(() => this.render('flip'), 300);
    this.off = readOnly && !share ? [] : [
      bus.on('block:changed', (b) => this.patch(b)),
      bus.on('block:deleted', ({ id }) => this.drop(id)),
      bus.on('block:connected', (e) => this.connected(e)),
      bus.on('block:disconnected', (e) => this.disconnected(e)),
      bus.on('upload:add', (item) => this.mine(item) && this.grid.addPending(item)),
      bus.on('upload:progress', (item) => this.mine(item) && this.grid.updatePending(item)),
      bus.on('upload:fail', (item) => this.mine(item) && this.grid.updatePending(item)),
      bus.on('upload:done', (item) => this.mine(item) && this.arrived(item.key, item.block)),
    ];
    // Saving someone's file (from the viewer) flips its pill here too.
    this.off.push(bus.on('block:saved', ({ id }) => {
      const block = this.blocks.find((b) => b.id === id);
      if (block) { block.saved = true; this.grid.update(block); }
    }));
    this.measureLooks();
  }

  mine(item) {
    return contextKey(item.ctx) === contextKey(this.ctx);
  }

  items() {
    return this.sort === 'manual' ? this.blocks : arrange(this.blocks, this.sort);
  }

  list() {
    return this.items().filter((item) => !item.divider);
  }

  render(animate) {
    // Grouped sorts read top to bottom by section, so the add box steps aside.
    this.grid.el.classList.toggle('is-grouped', this.sort === 'vibes' || this.sort === 'format');
    this.grid.set(this.items(), { animate });
  }

  setSort(mode) {
    if (mode === this.sort) return;
    this.sort = mode;
    this.render('flip');
    this.measureLooks();
  }

  // Colour and vibe sorts need every picture measured; do any missing ones.
  measureLooks() {
    if (this.readOnly || !SORTS.find((s) => s.value === this.sort)?.looks) return;
    ensureLooks(this.blocks, () => this.resort());
  }

  // ------------------------------------------------------------ adding

  addFiles(files) {
    if (files.length) addFiles(files, this.ctx);
  }

  async addText(text) {
    const item = { key: `up-${uid()}`, text, link: isUrl(text), name: isUrl(text) ? text.trim() : '', status: 'uploading', progress: 0.6 };
    this.grid.addPending(item);
    try {
      const { block } = await api.post('/api/blocks', { content: text, drawer: this.drawer?.id, share: !!this.ctx.share });
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
    const cell = this.grid.resolve(key, block);
    if (cell) sparkle(cell);
    else this.render('flip');
    if (this.sort !== 'manual' && this.sort !== 'new') this.resort();
    if (this.sort === 'color' || this.sort === 'vibes') this.measureLooks();
    // Uploads finish in any order; once a batch lands, keep the order on screen.
    if (this.drawer && this.grid.sortable && !this.grid.el.querySelector(':scope > .cell.is-pending')) {
      const keys = this.grid.keys();
      if (keys.length === this.blocks.length) this.saveOrder(keys);
    }
    this.onChange?.(this.blocks);
  }

  // ------------------------------------------------------------ reacting to edits elsewhere

  patch(block) {
    const i = this.blocks.findIndex((b) => b.id === block.id);
    if (i < 0) {
      // e.g. a file just shared, seen from the community feed
      if (this.ctx.share && this.keep(block)) {
        this.blocks.unshift(block);
        this.render('flip');
        this.onChange?.(this.blocks);
      }
      return;
    }
    const next = { ...this.blocks[i], ...block };
    if (!this.keep(next)) { this.drop(block.id); return; }
    this.blocks[i] = next;
    this.grid.update(this.blocks[i]);
  }

  drop(id) {
    const i = this.blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    this.blocks.splice(i, 1);
    this.grid.remove(id);
    if (this.sort === 'vibes' || this.sort === 'format') this.resort();
    this.onChange?.(this.blocks);
  }

  connected({ block, drawerId }) {
    const i = this.blocks.findIndex((b) => b.id === block.id);
    if (i >= 0) { this.patch(block); return; }
    if (!this.drawer || drawerId !== this.drawer.id) return;
    const at = Math.min(this.removedAt.get(block.id) ?? 0, this.blocks.length);
    this.blocks.splice(at, 0, block);
    this.removedAt.delete(block.id);
    this.render('flip');
    this.onChange?.(this.blocks);
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
    if (act === 'save') {
      openSave(btn, block, { onSaved: () => this.grid.update(block) });
      return;
    }
    if (this.readOnly) return;
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
    if (this.readOnly) return null;
    return {
      label: this.drawer ? `Drop into ${this.drawer.title}` : this.ctx.share ? 'Drop to share' : 'Drop to add',
      drop: (files) => this.addFiles(files),
    };
  }

  pasteText(text) {
    this.entry?.focusText(text);
  }

  destroy() {
    this.off.forEach((off) => off());
  }
}
