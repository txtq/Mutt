// List mode: a planet shown as a list you tick, type into, reorder and tidy.
// It isn't a setting you go looking for: a planet only offers it once it's
// being used as a list (see list_signs in mutt/sorting.py), and its options
// live in the planet's ••• menu after that.
//
// Every item is a file on the planet: typed items are short notes, and other
// files show as a row with their picture and name. Ticks are kept per planet.

import { blockContextMenu, deleteBlock } from './actions.js';
import { api } from './api.js';
import { nav } from './nav.js';
import { openContextMenu, openDialog, openPopover, segmented, toast } from './ui.js';
import { addFiles, contextKey } from './uploads.js';
import { EASE, autosize, bus, h, plural, reducedMotion } from './util.js';

export const LIST_TYPES = [
  { value: 'check', label: 'Checklist' },
  { value: 'bullet', label: 'Bullets' },
  { value: 'number', label: 'Numbers' },
  { value: 'plain', label: 'Plain' },
];
export const MARKERS = [
  { value: 'dot', label: '•', name: 'Dots' },
  { value: 'dash', label: '–', name: 'Dashes' },
  { value: 'arrow', label: '→', name: 'Arrows' },
  { value: 'star', label: '*', name: 'Asterisks' },
  { value: 'circle', label: '○', name: 'Circles' },
  { value: 'square', label: '▪', name: 'Squares' },
];
export const LIMITS = [60, 120, 200, 400];
export const LIST_DEFAULTS = { type: 'check', marker: 'dot', limit: 120, doneLast: true };

// An inked tick, drawn like a pen stroke that runs past the box's corner.
const CHECK_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.2 10.6c1.5 1.3 2.8 2.9 4 4.9C11.3 9.4 15.4 3.9 22.6-2.2"/></svg>';
const moving = () => !reducedMotion();
const NEAR = 0.8; // show what's left once an item is this far to its limit

// ------------------------------------------------------------ motion

// Move children to their new places smoothly: measure, change, then glide
// each from where it was.
function flip(container, change, { duration = 460 } = {}) {
  const before = new Map([...container.children].map((el) => [el, el.getBoundingClientRect()]));
  change();
  if (!moving()) return;
  for (const el of container.children) {
    const was = before.get(el);
    if (!was) continue;
    const now = el.getBoundingClientRect();
    const dy = was.top - now.top;
    if (Math.abs(dy) < 0.5) continue;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration, easing: EASE });
  }
}

function grow(el, { delay = 0 } = {}) {
  if (!moving()) return;
  const height = el.getBoundingClientRect().height;
  el.animate([
    { height: '0px', opacity: 0, transform: 'translateY(-8px) scale(0.985)' },
    { height: `${height}px`, opacity: 1, transform: 'none' },
  ], { duration: 420, delay, easing: EASE, fill: 'backwards' });
}

async function shrink(el) {
  if (moving()) {
    const height = el.getBoundingClientRect().height;
    el.style.overflow = 'hidden';
    el.style.pointerEvents = 'none';
    await el.animate([
      { height: `${height}px`, opacity: 1, transform: 'none' },
      { height: '0px', opacity: 0, transform: 'translateX(24px) scale(0.98)' },
    ], { duration: 300, easing: EASE, fill: 'forwards' }).finished.catch(() => {});
  }
  el.remove();
}

function nudge(el) {
  if (!moving()) return;
  el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(3px)' },
    { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }], { duration: 260, easing: 'ease-out' });
}

const tmpId = () => `tmp-${Math.random().toString(36).slice(2)}`;
const isTmp = (id) => String(id).startsWith('tmp-');
const textOf = (block) => (block.kind === 'text' ? block.content || '' : block.title || block.fileName || block.content || '');

// ------------------------------------------------------------ the list

export class ListView {
  // editable: you can add, edit, tick, reorder and remove (your planet).
  // targets(): moons (or a moon's planet) an item can be moved to from its right-click menu.
  constructor({ drawer, blocks, editable, options = {}, onChange, onOptions, targets }) {
    this.drawer = drawer;
    this.targets = targets;
    this.blocks = blocks.slice();
    this.editable = editable;
    this.opts = { ...LIST_DEFAULTS, ...options };
    this.onChange = onChange;
    this.rows = new Map();
    this.saving = new Map();
    this.queue = Promise.resolve();

    this.ol = h('ol', { class: 'lm-items' });
    this.countEl = h('span', { class: 'lm-count' });
    this.fill = h('i');
    this.bar = h('span', { class: 'lm-bar', 'aria-hidden': 'true' }, this.fill);
    this.clearBtn = editable ? h('button', { type: 'button', class: 'lm-clear', onclick: () => this.clearTicked() }, 'Clear ticked') : null;
    this.optsBtn = editable && onOptions
      ? h('button', { type: 'button', class: 'lm-opts', 'aria-label': 'List options', title: 'List options', 'aria-haspopup': 'dialog' }, h('i'), h('i'), h('i'))
      : null;
    this.optsBtn?.addEventListener('click', () => onOptions(this.optsBtn));
    this.head = h('div', { class: 'lm-head' }, this.bar, this.countEl, h('span', { class: 'lm-gap' }), this.clearBtn, this.optsBtn);
    this.divider = h('li', { class: 'lm-divider', role: 'presentation' }, h('span', null, 'Ticked'));

    if (editable) {
      this.input = h('textarea', { class: 'lm-input', rows: 1, placeholder: 'Add an item', 'aria-label': 'Add an item', enterkeyhint: 'enter' });
      this.left = h('span', { class: 'lm-left', 'aria-live': 'polite' });
      this.adder = h('div', { class: 'lm-new' }, h('span', { class: 'lm-plus', 'aria-hidden': 'true' }), this.input, this.left);
      this.wireAdder();
    }
    this.el = h('section', { class: 'lm', 'aria-label': `${drawer.title}, as a list` }, this.head, this.adder || null, this.ol);
    if (editable) this.el.dataset.editable = '';
    this.ol.addEventListener('contextmenu', (e) => this.context(e));
    // A right-press anywhere on an item only opens its menu: it doesn't focus
    // the text or pick a word (a Mac picks one under the pointer).
    this.ol.addEventListener('mousedown', (e) => {
      if ((e.button === 2 || (e.button === 0 && e.ctrlKey)) && e.target.closest?.('.lm-item')) e.preventDefault();
    });
    this.applyOptions();
    this.render({ entrance: true });

    this.off = [
      bus.on('upload:done', (item) => {
        if (item.block && contextKey(item.ctx) === contextKey({ drawerId: this.drawer.id })) this.arrive(item.block);
      }),
      bus.on('block:changed', (b) => {
        const i = this.blocks.findIndex((x) => x.id === b.id);
        if (i < 0) return;
        this.blocks[i] = { ...this.blocks[i], ...b, checked: this.blocks[i].checked };
        const li = this.rows.get(b.id);
        if (li && !li.contains(document.activeElement)) this.replaceRow(b.id);
      }),
      bus.on('block:deleted', ({ id }) => this.forget(id)),
      bus.on('block:connected', (e) => { if (e.drawerId === this.drawer.id && e.block) this.arrive(e.block); }),
      bus.on('block:disconnected', (e) => { if (e.drawerId === this.drawer.id && e.block) this.forget(e.block.id); }),
    ];
  }

  // ------------------------------------------------------------ options

  setOptions(opts) {
    const old = this.opts;
    this.opts = { ...this.opts, ...opts };
    this.applyOptions();
    if (old.type !== this.opts.type) {
      this.render();
      this.swapMarks();
    } else if (old.marker !== this.opts.marker) {
      this.swapMarks();
    }
    if (old.type === this.opts.type && old.doneLast !== this.opts.doneLast) this.arrange();
    for (const li of this.rows.values()) {
      const text = li.querySelector('textarea.lm-text');
      if (text) text.maxLength = Math.max(this.opts.limit, text.value.length);
    }
    this.counter(this.input, this.left);
  }

  applyOptions() {
    this.el.dataset.type = this.opts.type;
    this.el.dataset.marker = this.opts.marker;
    if (this.input) this.input.maxLength = this.opts.limit;
    this.updateCount();
  }

  swapMarks() {
    if (!moving()) return;
    this.ol.querySelectorAll('.lm-mark').forEach((m, i) => m.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 240, delay: Math.min(i, 12) * 14, easing: 'ease-out', fill: 'backwards' }));
  }

  // ------------------------------------------------------------ drawing

  ticking() { return this.opts.type === 'check'; }

  order() {
    if (!this.ticking() || !this.opts.doneLast) return this.blocks;
    return [...this.blocks.filter((b) => !b.checked), ...this.blocks.filter((b) => b.checked)];
  }

  render({ entrance = false } = {}) {
    this.rows.clear();
    const items = [];
    const order = this.order();
    for (const block of order) {
      const li = this.row(block);
      this.rows.set(block.id, li);
      items.push(li);
    }
    this.ol.replaceChildren(...items);
    this.placeDivider();
    if (entrance && moving()) {
      items.slice(0, 24).forEach((li, i) => li.animate(
        [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
        { duration: 480, delay: 60 + i * 28, easing: EASE, fill: 'backwards' }));
    }
    this.updateCount();
  }

  // Put rows in display order, gliding.
  arrange() {
    flip(this.ol, () => {
      for (const block of this.order()) {
        const li = this.rows.get(block.id);
        if (li) this.ol.append(li);
      }
      this.placeDivider();
    });
  }

  placeDivider() {
    const firstTicked = this.ticking() && this.opts.doneLast ? this.order().find((b) => b.checked) : null;
    const hasOpen = this.blocks.some((b) => !b.checked);
    if (firstTicked && hasOpen) this.ol.insertBefore(this.divider, this.rows.get(firstTicked.id));
    else this.divider.remove();
  }

  row(block) {
    const li = h('li', { class: 'lm-item', 'data-id': block.id });
    li.classList.toggle('is-done', !!block.checked && this.ticking());
    const grip = this.editable ? h('span', { class: 'lm-grip', 'aria-hidden': 'true', title: 'Drag to move' }) : null;
    grip?.addEventListener('pointerdown', (e) => this.drag(e, li));
    const remove = this.editable && block.mine !== false
      ? h('button', { type: 'button', class: 'lm-x', 'aria-label': 'Remove', title: 'Remove', onclick: () => this.remove(block.id) })
      : null;
    li.append(h('div', { class: 'lm-row' }, grip, this.markEl(block), this.bodyEl(block), remove));
    return li;
  }

  replaceRow(id) {
    const old = this.rows.get(id);
    if (!old) return;
    const li = this.row(this.find(id));
    old.replaceWith(li);
    this.rows.set(id, li);
  }

  markEl(block) {
    if (this.ticking()) {
      const box = h('button', {
        type: 'button', class: 'lm-mark lm-box', role: 'checkbox',
        'aria-checked': String(!!block.checked), 'aria-label': `Tick off ${textOf(block).slice(0, 60)}`,
        disabled: !this.editable,
      });
      box.innerHTML = CHECK_SVG;
      box.addEventListener('click', () => this.toggle(block.id));
      return box;
    }
    return h('span', { class: 'lm-mark', 'aria-hidden': 'true' });
  }

  bodyEl(block) {
    if (block.kind === 'text') {
      if (!this.editable || block.mine === false) return h('div', { class: 'lm-text is-static' }, block.content);
      const text = h('textarea', { class: 'lm-text', rows: 1, value: block.content, 'aria-label': 'Item', spellcheck: 'true', enterkeyhint: 'enter' });
      text.maxLength = Math.max(this.opts.limit, (block.content || '').length);
      const left = h('span', { class: 'lm-left' });
      if (block.blank) {
        this.guard(text, left);
        text.addEventListener('input', () => this.counter(text, left));
      } else {
        this.wireItem(block.id, text, left);
      }
      requestAnimationFrame(() => autosize(text));
      return h('div', { class: 'lm-edit' }, text, left);
    }
    const thumb = block.thumb
      ? h('img', { class: 'lm-thumb', src: block.thumb, alt: '', loading: 'lazy', decoding: 'async' })
      : h('span', { class: 'lm-thumb lm-kind' }, (block.ext || block.kind || '').slice(0, 4).toUpperCase());
    const name = textOf(block);
    const sub = block.kind === 'link' ? (block.meta?.domain || '') : '';
    return h('button', { type: 'button', class: 'lm-file', onclick: () => nav.openBlock(block.id) },
      thumb, h('span', { class: 'lm-file-name' }, name), sub ? h('span', { class: 'lm-file-sub' }, sub) : null);
  }

  updateCount() {
    if (!this.countEl) return;
    const total = this.blocks.length;
    const done = this.blocks.filter((b) => b.checked).length;
    // Just how many items; the thin line on top shows how much is ticked.
    this.countEl.textContent = total ? plural(total, 'item') : 'Nothing on it yet';
    if (this.ticking()) this.fill.style.transform = `scaleX(${total ? done / total : 0})`;
    this.lastDone = done;
    this.bar.hidden = !this.ticking();
    if (this.clearBtn) this.clearBtn.hidden = !this.ticking() || !done;
    this.onChange?.(this.blocks);
  }

  find(id) { return this.blocks.find((b) => b.id === id); }

  // ------------------------------------------------------------ typing

  counter(text, left) {
    if (!text || !left) return;
    const limit = this.opts.limit;
    const n = text.value.length;
    const near = n >= limit * NEAR;
    left.textContent = near ? String(limit - n) : '';
    left.classList.toggle('is-near', near);
    left.classList.toggle('is-full', n >= limit);
  }

  guard(text, left) {
    // Typing past the limit gives a little shake rather than silently stopping.
    text.addEventListener('beforeinput', (e) => {
      if (e.inputType.startsWith('insert') && e.inputType !== 'insertLineBreak' && text.value.length >= text.maxLength
          && text.selectionStart === text.selectionEnd) nudge(left.parentElement || text);
    });
  }

  wireAdder() {
    const { input, left } = this;
    autosize(input);
    this.guard(input, left);
    input.addEventListener('input', () => this.counter(input, left));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && input.selectionStart === input.value.length) {
        const first = this.order()[0];
        if (first) { e.preventDefault(); this.focusItem(first.id, 'end'); }
      } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        const value = input.value.trim();
        if (!value) return;
        input.value = '';
        input.dispatchEvent(new Event('input'));
        this.add([value]);
      }
    });
    input.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text/plain') || '';
      if (!text.includes('\n')) return;
      e.preventDefault();
      this.pasteText(text);
    });
  }

  wireItem(id, text, left) {
    this.guard(text, left);
    text.addEventListener('input', () => this.counter(text, left));
    text.addEventListener('keydown', (e) => {
      const at = text.selectionStart;
      const atEnd = at === text.value.length && text.selectionEnd === at;
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        // Like a notes app: Enter breaks the line into a new item below.
        e.preventDefault();
        const rest = text.value.slice(text.selectionEnd).trim();
        text.value = text.value.slice(0, at).trimEnd();
        this.commit(id, text);
        this.add([rest], { after: id, focus: true, caretStart: true });
      } else if (e.key === 'Backspace' && at === 0 && text.selectionEnd === 0 && !text.value) {
        e.preventDefault();
        const prev = this.neighbour(id, -1);
        this.remove(id, { quiet: true });
        if (prev) this.focusItem(prev, 'end');
        else this.input?.focus();
      } else if (e.key === 'ArrowUp' && at === 0 && text.selectionEnd === 0) {
        const prev = this.neighbour(id, -1);
        e.preventDefault();
        if (prev) this.focusItem(prev, 'end');
        else this.input?.focus();
      } else if (e.key === 'ArrowDown' && atEnd) {
        const next = this.neighbour(id, 1);
        if (next) { e.preventDefault(); this.focusItem(next, 'end'); }
      } else if (e.key === 'Escape') {
        text.value = this.find(id)?.content || '';
        text.blur();
      }
    });
    text.addEventListener('paste', (e) => {
      const pasted = e.clipboardData?.getData('text/plain') || '';
      if (!pasted.includes('\n')) return;
      e.preventDefault();
      const lines = pasted.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      text.setRangeText(lines.shift() || '', text.selectionStart, text.selectionEnd, 'end');
      this.commit(id, text);
      this.add(lines, { after: id });
    });
    text.addEventListener('blur', () => this.commit(id, text));
  }

  neighbour(id, step) {
    const ids = this.order().map((b) => b.id);
    const i = ids.indexOf(id);
    return ids[i + step] || null;
  }

  focusItem(id, where = 'end') {
    const text = id && this.rows.get(id)?.querySelector('textarea.lm-text');
    if (!text) return;
    text.focus();
    const at = where === 'start' ? 0 : text.value.length;
    text.setSelectionRange(at, at);
  }

  async commit(id, text) {
    const block = this.find(id);
    if (!block || isTmp(id)) return;
    const value = text.value.replace(/\s*\n\s*/g, ' ').trim();
    autosize(text);
    if (value === (block.content || '').trim()) return;
    if (!value) { this.remove(id, { quiet: true }); return; }
    const before = block.content;
    block.content = value;
    try {
      const { block: saved } = await api.patch(`/api/blocks/${id}`, { content: value });
      Object.assign(block, saved, { checked: block.checked });
    } catch (err) {
      block.content = before;
      if (document.activeElement !== text) text.value = before;
      toast(err.message);
    }
  }

  // ------------------------------------------------------------ adding

  pasteText(text) {
    const lines = String(text).split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•·–]|\d+[.)]|\[[ xX]?\])\s+/, '').trim()).filter(Boolean);
    if (lines.length) this.add(lines);
  }

  // The row just above one in the list's saved order: new rows are saved
  // after it (or at the top when there's none).
  above(block) {
    return this.blocks[this.blocks.indexOf(block) - 1]?.id || null;
  }

  // The real id for a row, once a row still being saved has one.
  async anchorOf(id) {
    if (!id) return null;
    if (isTmp(id)) id = await (this.saving.get(id) || Promise.resolve(null)).catch(() => null);
    return id && this.find(id) ? id : null;
  }

  // Save a new row's words as a note on the planet, after another row or at
  // the top. Saves go one after another, so quick adds keep their order.
  save(temp, content, afterId) {
    const waitTurn = this.queue;
    const job = (async () => {
      await waitTurn;
      const after = await this.anchorOf(afterId);
      const body = { content, drawer: this.drawer.id };
      if (after) body.after = after;
      const { block } = await api.post('/api/blocks', body);
      if (!this.find(temp.id)) {
        // Removed while it was being saved.
        api.del(`/api/blocks/${block.id}`).catch(() => {});
        return null;
      }
      this.swapId(temp.id, { ...block, checked: temp.checked || null });
      return block.id;
    })();
    this.saving.set(temp.id, job);
    this.queue = job.catch(() => {});
    job.catch((err) => { this.forget(temp.id); toast(err.message); })
      .finally(() => setTimeout(() => this.saving.delete(temp.id), 0));
    return job;
  }

  // Items in order, each placed after the one before (the first at the top,
  // just under the add box, unless given a row to follow). Rows appear at
  // once; saving happens behind them.
  add(texts, { after = null, focus = false, caretStart = false } = {}) {
    let prev = after;
    let first = true;
    for (const raw of texts) {
      const content = raw.replace(/\s*\n\s*/g, ' ').slice(0, Math.max(this.opts.limit, 1)).trim();
      if (!content) {
        // An empty new line: a row to type in, saved once it has words.
        if (focus && first) this.blankAfter(prev);
        continue;
      }
      const temp = { id: tmpId(), kind: 'text', content, mine: true, checked: null, pending: true };
      this.insertBlock(temp, prev);
      if (focus && first) this.focusItem(temp.id, caretStart ? 'start' : 'end');
      this.save(temp, content, this.above(temp));
      prev = temp.id;
      first = false;
    }
  }

  // An empty row to type the next item into. It becomes a real item once it
  // has words (Enter keeps it and opens another below at once); left empty,
  // it folds away.
  blankAfter(prevId) {
    const temp = { id: tmpId(), kind: 'text', content: '', mine: true, checked: null, blank: true };
    this.insertBlock(temp, prevId);
    const li = this.rows.get(temp.id);
    const text = li?.querySelector('textarea.lm-text');
    if (!text) return;
    text.focus();
    let settled = false;
    const keep = (andNext) => {
      if (settled) return;
      settled = true;
      const value = text.value.replace(/\s*\n\s*/g, ' ').trim();
      if (!value) {
        this.forget(temp.id);
        if (andNext) this.input?.focus();
        return;
      }
      temp.content = value;
      temp.blank = false;
      temp.pending = true;
      li.classList.add('is-pending');
      this.save(temp, value, this.above(temp));
      if (andNext) this.blankAfter(temp.id);
    };
    text.addEventListener('blur', () => keep(false));
    text.addEventListener('keydown', (e) => {
      if (settled) return;
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); keep(true); }
      else if (e.key === 'Escape') { text.value = ''; text.blur(); }
      else if (e.key === 'Backspace' && !text.value) {
        e.preventDefault();
        settled = true;
        this.forget(temp.id);
        if (prevId) this.focusItem(prevId, 'end');
        else this.input?.focus();
      } else if (e.key === 'ArrowUp' && text.selectionStart === 0) {
        e.preventDefault();
        if (prevId) this.focusItem(prevId, 'end');
        else this.input?.focus();
      }
    });
  }

  // Put a block in the list after another, before another, or at the top.
  insertBlock(block, after, { before = null } = {}) {
    const at = after ? this.blocks.findIndex((b) => b.id === after) : -1;
    const ahead = before ? this.blocks.findIndex((b) => b.id === before) : -1;
    const i = at >= 0 ? at + 1 : ahead >= 0 ? ahead : 0;
    this.blocks.splice(i, 0, block);
    const li = this.row(block);
    if (block.pending) li.classList.add('is-pending');
    this.rows.set(block.id, li);
    flip(this.ol, () => {
      const order = this.order();
      const next = order.slice(order.indexOf(block) + 1).map((b) => this.rows.get(b.id)).find((r) => r && r.parentNode === this.ol);
      this.ol.insertBefore(li, next || null);
      this.placeDivider();
    });
    grow(li);
    this.updateCount();
  }

  swapId(tempId, block) {
    const i = this.blocks.findIndex((b) => b.id === tempId);
    if (i < 0) return;
    const temp = this.blocks[i];
    const li = this.rows.get(tempId);
    const text = li?.querySelector('textarea.lm-text');
    // Keep whatever was typed into the row while it was saving.
    const typed = text ? text.value : null;
    const focused = !!text && document.activeElement === text;
    const sel = focused ? [text.selectionStart, text.selectionEnd] : null;
    this.blocks[i] = { ...block, checked: temp.checked };
    this.rows.delete(tempId);
    if (li) {
      const fresh = this.row(this.blocks[i]);
      li.replaceWith(fresh);
      this.rows.set(block.id, fresh);
      const t = fresh.querySelector('textarea.lm-text');
      if (t && typed !== null && typed !== t.value) {
        t.value = typed;
        if (!focused) this.commit(block.id, t);
      }
      if (t && focused) { t.focus(); t.setSelectionRange(...sel); }
    }
    this.updateCount();
  }

  // Something added to the planet another way (a dropped file, say) joins
  // the list at the top, like a typed item.
  arrive(block) {
    if (this.find(block.id)) return;
    this.insertBlock({ ...block, checked: null }, null);
  }

  forget(id) {
    const i = this.blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    this.blocks.splice(i, 1);
    const li = this.rows.get(id);
    this.rows.delete(id);
    if (li) {
      // Rows below slide up as this one folds away.
      shrink(li).then(() => this.placeDivider());
    }
    this.updateCount();
  }

  // ------------------------------------------------------------ ticking

  async toggle(id) {
    const block = this.find(id);
    if (!block || !this.editable || block.pending) return;
    const was = block.checked;
    block.checked = was ? null : Date.now();
    this.paintTick(id);
    this.updateCount();
    clearTimeout(this.sinkTimer);
    if (this.opts.doneLast) this.sinkTimer = setTimeout(() => this.arrange(), was ? 160 : 520);
    try {
      await api.post(`/api/drawers/${this.drawer.id}/check`, { block: id, checked: !was });
    } catch (err) {
      block.checked = was;
      this.paintTick(id);
      this.updateCount();
      this.arrange();
      toast(err.message);
    }
  }

  paintTick(id) {
    const li = this.rows.get(id);
    const block = this.find(id);
    if (!li || !block) return;
    li.classList.toggle('is-done', !!block.checked);
    const box = li.querySelector('.lm-box');
    if (box) {
      box.setAttribute('aria-checked', String(!!block.checked));
    }
  }

  // ------------------------------------------------------------ right-click

  context(e) {
    if (e.pointerType === 'touch' || this.el.classList.contains('is-dragging')) return;
    const li = e.target.closest?.('.lm-item[data-id]');
    if (!li) return;
    const block = this.find(li.dataset.id);
    if (!block || isTmp(block.id) || block.pending) return;
    const id = block.id;
    const open = () => nav.openBlock(id);
    if (!this.editable || block.mine === false) {
      openContextMenu(e, [
        { label: 'Open', run: open },
        block.kind === 'text' && { label: 'Copy text', run: () => navigator.clipboard.writeText(block.content).then(() => toast('Text copied')) },
      ], { target: li });
      return;
    }
    const text = li.querySelector('textarea.lm-text');
    const extra = [
      this.ticking() && { label: block.checked ? 'Untick' : 'Tick off', run: () => this.toggle(id) },
      text && { label: 'Edit', run: () => { text.focus(); text.setSelectionRange(text.value.length, text.value.length); } },
    ].filter(Boolean);
    const worlds = (this.targets?.() || []).map((t) => ({ title: t.title, dot: t.dot, planet: t.planet, move: () => this.moveTo(t, id) }));
    const only = this.leaving(block).only;
    blockContextMenu(e, li, block, {
      drawer: this.drawer, open, worlds, extra,
      remove: () => this.remove(id, { keep: true }),
      // A note made just for this list goes with Undo, like its ×; anything else asks first.
      del: () => (only ? this.remove(id) : deleteBlock(block)),
    });
  }

  // Send an item to a moon (or back to a moon's planet). Undo brings it back to its place.
  async moveTo(target, id) {
    const block = this.find(id);
    if (!block || isTmp(id)) return;
    const gone = { ...this.leaving(block), only: false };
    this.forget(id);
    target.el?.gulp?.();
    try {
      const res = await api.post(`/api/blocks/${id}/connections`, { drawer: target.id });
      bus.emit('block:connected', { block: res.block, drawerId: target.id, connections: res.connections });
      const out = await api.del(`/api/blocks/${id}/connections/${this.drawer.id}`);
      gone.position = out.position ?? null;
      target.onMoved?.();
      toast(`Moved to ${target.title}`, {
        action: {
          label: 'Undo',
          run: async () => {
            await this.restore([gone]);
            const left = await api.del(`/api/blocks/${id}/connections/${target.id}`);
            bus.emit('block:disconnected', { block: left.block, drawerId: target.id, connections: left.connections });
            target.onBack?.();
          },
        },
      });
    } catch (err) {
      toast(err.message);
      if (!this.find(id)) this.restoreLocal(block, gone.prevId);
    }
  }

  // ------------------------------------------------------------ removing

  // keep: only take it off this planet, even a note made just for it (it becomes a star).
  async remove(id, { quiet = false, keep = false } = {}) {
    const block = this.find(id);
    if (!block) return;
    if (isTmp(id)) { this.forget(id); return; }
    const gone = this.leaving(block);
    if (keep) gone.only = false;
    this.forget(id);
    try {
      await this.takeAway(gone);
      if (quiet && !block.content) return;
      toast(gone.only ? 'Item removed' : 'Taken off this list', {
        action: { label: 'Undo', run: () => this.restore([gone]) },
      });
    } catch (err) {
      toast(err.message);
      this.restoreLocal(block, gone.prevId);
    }
  }

  restoreLocal(block, prevId) {
    this.insertBlock(block, prevId);
  }

  // What Undo needs to put an item back: its neighbours in the list's own
  // order (the server's) and, once it's gone, where it sat on the server.
  leaving(block) {
    const order = this.blocks;
    const i = order.indexOf(block);
    const near = (step) => {
      for (let j = i + step; j >= 0 && j < order.length; j += step) if (!isTmp(order[j].id)) return order[j].id;
      return null;
    };
    return {
      block, prevId: near(-1), nextId: near(1), position: null,
      // A note made for this list goes for good; a file that's elsewhere too just leaves this planet.
      only: block.kind === 'text' && block.mine !== false && (block.connectionCount ?? 1) <= 1,
    };
  }

  async takeAway(g) {
    if (g.only) {
      const res = await api.del(`/api/blocks/${g.block.id}`);
      g.position = res.positions?.[this.drawer.id] ?? null;
      bus.emit('block:deleted', { id: g.block.id });
    } else {
      ({ position: g.position } = await api.del(`/api/blocks/${g.block.id}/connections/${this.drawer.id}`));
    }
  }

  // Undo. Each item goes back where it was, both on screen and on the server.
  // A note made again gets a new id, so later items placed beside it look it up.
  async restore(gone) {
    const renamed = new Map();
    const here = (id) => {
      const now = renamed.get(id) || id;
      return now && this.find(now) ? now : null;
    };
    let failed = null;
    for (const { block, prevId, nextId, only, position } of gone) {
      try {
        let back;
        if (only) {
          const body = { content: block.content, drawer: this.drawer.id };
          if (typeof position === 'number') body.position = position;
          else if (here(prevId)) body.after = here(prevId);
          ({ block: back } = await api.post('/api/blocks', body));
          renamed.set(block.id, back.id);
        } else {
          const body = { drawer: this.drawer.id };
          if (typeof position === 'number') body.position = position;
          ({ block: back } = await api.post(`/api/blocks/${block.id}/connections`, body));
        }
        if (block.checked) await api.post(`/api/drawers/${this.drawer.id}/check`, { block: back.id, checked: true });
        if (this.find(back.id)) continue; // already back (arrived another way)
        const item = { ...block, ...back, checked: block.checked };
        if (here(prevId)) this.insertBlock(item, here(prevId));
        else if (here(nextId)) this.insertBlock(item, null, { before: here(nextId) });
        else this.insertBlock(item, null);
      } catch (err) {
        failed = err;
      }
    }
    if (failed) throw failed;
  }

  async clearTicked() {
    const ticked = this.blocks.filter((b) => b.checked);
    if (!ticked.length) return;
    // In list order, so each goes back beside the one before it.
    const gone = ticked.map((block) => this.leaving(block));
    // Fold them away one after another, quickly.
    ticked.forEach((b, i) => setTimeout(() => this.forget(b.id), Math.min(i, 10) * 40));
    const done = [];
    for (const g of gone) {
      try {
        await this.takeAway(g);
        done.push(g);
      } catch (err) {
        toast(err.message);
      }
    }
    if (!done.length) return;
    toast(`Cleared ${plural(done.length, 'ticked item')}`, { action: { label: 'Undo', run: () => this.restore(done) } });
  }

  // ------------------------------------------------------------ reordering

  drag(e, li) {
    if (e.button > 0) return;
    e.preventDefault();
    const grip = e.currentTarget;
    const id = li.dataset.id;
    const block = this.find(id);
    if (!block || block.pending) return;
    // Only among the items of its own part (open or ticked).
    const split = this.ticking() && this.opts.doneLast;
    const peers = [...this.ol.querySelectorAll(':scope > .lm-item')]
      .filter((x) => !split || !!this.find(x.dataset.id)?.checked === !!block.checked);
    const rects = peers.map((x) => x.getBoundingClientRect());
    const start = peers.indexOf(li);
    const gap = peers.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0;
    const step = rects[start].height + gap;
    const y0 = e.clientY;
    let target = start;
    grip.setPointerCapture(e.pointerId);
    li.classList.add('is-lifted');
    this.el.classList.add('is-dragging');
    for (const p of peers) if (p !== li) p.style.transition = `transform 260ms ${EASE}`;

    const move = (ev) => {
      const dy = ev.clientY - y0;
      li.style.transform = `translateY(${dy}px) scale(1.02)`;
      const centre = rects[start].top + rects[start].height / 2 + dy;
      target = Math.max(0, Math.min(peers.length - 1, peers.reduce((n, p, j) => (p !== li && centre > rects[j].top + rects[j].height / 2 ? n + 1 : n), 0)));
      peers.forEach((p, j) => {
        if (p === li) return;
        let shift = 0;
        if (j > start && j <= target) shift = -step;
        else if (j < start && j >= target) shift = step;
        p.style.transform = shift ? `translateY(${shift}px)` : '';
      });
      // Near the edges, scroll along.
      const edge = 70;
      if (ev.clientY < edge) scrollBy(0, -8);
      else if (ev.clientY > innerHeight - edge) scrollBy(0, 8);
    };
    const end = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', end);
      grip.removeEventListener('pointercancel', end);
      const from = li.getBoundingClientRect();
      for (const p of peers) { p.style.transition = ''; p.style.transform = ''; }
      li.style.transform = '';
      li.classList.remove('is-lifted');
      this.el.classList.remove('is-dragging');
      if (target !== start) {
        const ref = peers[target];
        if (target > start) ref.after(li);
        else ref.before(li);
      }
      // Settle from where it was let go.
      const to = li.getBoundingClientRect();
      if (moving()) li.animate([{ transform: `translateY(${from.top - to.top}px) scale(1.02)` }, { transform: 'none' }], { duration: 380, easing: EASE });
      if (target !== start) this.saveOrder();
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  async saveOrder() {
    const shown = [...this.ol.querySelectorAll(':scope > .lm-item')].map((x) => x.dataset.id);
    const byId = new Map(this.blocks.map((b) => [b.id, b]));
    this.blocks = shown.map((id) => byId.get(id)).filter(Boolean);
    const ids = this.blocks.map((b) => b.id).filter((id) => !isTmp(id));
    try {
      await api.put(`/api/drawers/${this.drawer.id}/order`, { ids });
    } catch (err) {
      toast(err.message);
    }
  }

  // ------------------------------------------------------------ the page

  dropTarget() {
    if (!this.editable) return null;
    return { label: `Drop into ${this.drawer.title}`, drop: (files) => files.length && addFiles(files, { drawerId: this.drawer.id }) };
  }

  focus() { this.input?.focus(); }

  destroy() {
    clearTimeout(this.sinkTimer);
    this.off.forEach((off) => off());
  }
}

// ------------------------------------------------------------ the offer

// Said once, quietly, in place: what we noticed, and the choice.
export function listOffer({ signs, split, onAccept, onDecline }) {
  const accept = h('button', { type: 'button', class: 'vbtn vbtn-blue' }, 'Make it a list');
  const decline = h('button', { type: 'button', class: 'vbtn vbtn-glass' }, 'Not now');
  const note = split?.length
    ? h('p', { class: 'lm-offer-note' }, split.length === 1
      ? 'The note written as a list will become one item per line.'
      : `The ${split.length} notes written as lists will become one item per line.`)
    : null;
  const el = h('div', { class: 'lm-offer', role: 'region', 'aria-label': 'This planet looks like a list' },
    h('span', { class: 'lm-offer-icon', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('div', { class: 'lm-offer-text' },
      h('p', { class: 'lm-offer-title' }, 'This planet looks like a list'),
      h('ul', { class: 'lm-offer-signs' }, signs.map((s) => h('li', null, s))),
      note),
    h('div', { class: 'lm-offer-btns' }, decline, accept));
  const close = async () => { await shrink(el); };
  accept.addEventListener('click', async () => {
    accept.disabled = decline.disabled = true;
    accept.textContent = 'Making it a list…';
    const ok = await onAccept();
    if (ok === false) { accept.disabled = decline.disabled = false; accept.textContent = 'Make it a list'; return; }
    close();
  });
  decline.addEventListener('click', () => { close(); onDecline(); });
  if (moving()) {
    requestAnimationFrame(() => el.animate([{ opacity: 0, transform: 'translateY(-8px) scale(0.99)' }, { opacity: 1, transform: 'none' }],
      { duration: 520, easing: EASE }));
  }
  return el;
}

// ------------------------------------------------------------ options

// Next to the list's own ⋯ button when given one (anchor), else as a dialog.
export function listSettings({ options, onChange, onTurnOff, anchor, onClose }) {
  let opts = { ...LIST_DEFAULTS, ...options };
  const preview = h('ol', { class: 'lm lm-preview', 'aria-hidden': 'true' });
  const samples = ['Oat milk', 'Call the plumber', 'A very long thing that keeps going and going'];
  const paint = () => {
    preview.dataset.type = opts.type;
    preview.dataset.marker = opts.marker;
    preview.replaceChildren(...samples.map((s, i) => {
      const li = h('li', { class: `lm-item${opts.type === 'check' && i === 1 ? ' is-done' : ''}` });
      const mark = opts.type === 'check' ? h('span', { class: 'lm-mark lm-box', 'aria-checked': String(i === 1) }) : h('span', { class: 'lm-mark' });
      if (opts.type === 'check') mark.innerHTML = CHECK_SVG;
      const text = s.length > opts.limit ? `${s.slice(0, opts.limit - 1)}…` : s;
      li.append(h('div', { class: 'lm-row' }, mark, h('div', { class: 'lm-text is-static' }, text)));
      return li;
    }));
    markerRow.hidden = opts.type !== 'bullet';
    doneRow.hidden = opts.type !== 'check';
  };
  const set = (patch) => { opts = { ...opts, ...patch }; paint(); onChange(patch); };

  const type = segmented(LIST_TYPES, opts.type, (v) => { type.set(v); set({ type: v }); }, { className: 'lm-seg', label: 'Kind of list' });
  const marker = segmented(MARKERS.map((m) => ({ value: m.value, label: m.label })), opts.marker,
    (v) => { marker.set(v); set({ marker: v }); }, { className: 'lm-seg lm-seg-marks', label: 'Bullet marks' });
  // Each choice shows the very mark the list draws.
  marker.el.querySelectorAll('button').forEach((b, i) => {
    const m = MARKERS[i];
    if (!m) return;
    b.title = m.name;
    b.setAttribute('aria-label', m.name);
    b.firstElementChild?.replaceChildren(h('i', { class: 'lm-swatch', 'data-marker': m.value }));
  });
  const done = segmented([{ value: 'down', label: 'Sink to the bottom' }, { value: 'stay', label: 'Stay put' }],
    opts.doneLast ? 'down' : 'stay', (v) => { done.set(v); set({ doneLast: v === 'down' }); }, { className: 'lm-seg', label: 'Ticked items' });
  const limit = segmented(LIMITS.map((n) => ({ value: String(n), label: String(n) })), String(opts.limit),
    (v) => { limit.set(v); set({ limit: Number(v) }); }, { className: 'lm-seg', label: 'Longest item, in characters' });

  const markerRow = h('div', { class: 'lm-set' }, h('p', { class: 'liv-label' }, 'Bullet marks'), marker.el);
  const doneRow = h('div', { class: 'lm-set' }, h('p', { class: 'liv-label' }, 'Ticked items'), done.el);
  const off = h('button', { type: 'button', class: 'vbtn vbtn-glass lm-off' }, 'Show as files again');
  // Beside the list, the list itself shows each change; a dialog needs a sample.
  const body = h('div', { class: 'lm-settings' },
    anchor ? null : preview,
    h('div', { class: 'lm-set' }, h('p', { class: 'liv-label' }, 'Kind of list'), type.el),
    markerRow, doneRow,
    h('div', { class: 'lm-set' }, h('p', { class: 'liv-label' }, 'Longest item'), limit.el,
      h('p', { class: 'lm-hint' }, 'Characters per item. Longer items you already have stay as they are.')),
    off);
  paint();
  const panel = anchor
    ? openPopover(anchor, h('div', null, h('p', { class: 'lm-pop-title' }, 'List options'), body),
      { align: 'end', className: 'pop-list', width: 360, onClose })
    : openDialog({ title: 'List', body, className: 'dialog-list', onClose });
  off.addEventListener('click', () => { panel.close(); onTurnOff(); });
  return panel;
}

