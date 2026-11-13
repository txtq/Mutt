// The four-wide block grid: keyed cells, gliding reflow, drag to reorder.

import { renderCell, renderDivider, renderPending, updatePending } from './cells.js';
import { glide, measure } from './transitions.js';
import { DUR, EASE, EASE_LEAVE, STAGGER, h, inViewport, reducedMotion } from './util.js';

const nearby = (els) => [...els].filter((el) => el.isConnected && inViewport(el, 300));

// A cell's way in or out: it slides while its glass fades and its words go in
// or out of focus. The fade and blur go on the parts, never on the cell, since
// either one on the cell stops the frosted glass inside it from frosting (it
// would show clear, then snap to frost at the end).
const GLASS = '.face-text, .face-file, .face-link, .entry';
function shift(el, { into = true, duration = 700, delay = 0, easing = EASE, fill = into ? 'backwards' : 'forwards', moved = 'translateY(14px)' } = {}) {
  const ends = (a, b) => (into ? [a, b] : [b, a]);
  const opts = { duration, delay, easing, fill };
  const anim = el.animate(ends({ transform: moved }, { transform: 'none' }), opts);
  for (const part of el.querySelectorAll(`.face, .entry, .cell-cap, .cell-progress`)) part.animate(ends({ opacity: 0 }, { opacity: 1 }), { ...opts, duration: duration * 0.85 });
  for (const part of el.querySelectorAll(`:is(${GLASS}) > *, .face-img, .cell-cap`)) part.animate(ends({ filter: 'blur(8px)' }, { filter: 'blur(0)' }), opts);
  return anim;
}

export class Grid {
  // targets(): worlds a file can be dragged onto ([{ el, id, measure() → { x, y, r } }]);
  // onDropTo(target, id) is called instead of reordering when one is let go over.
  constructor({ entry = null, sortable = false, onOpen, onAction, onReorder, onContext, targets, onDropTo, empty } = {}) {
    this.el = h('div', { class: 'grid' });
    this.entry = entry;
    if (entry) this.el.append(entry);
    this.cells = new Map();
    this.sortable = sortable;
    this.renderOpts = {};
    this.onOpen = onOpen;
    this.onAction = onAction;
    this.onReorder = onReorder;
    this.targets = targets;
    this.onDropTo = onDropTo;
    this.emptyEl = empty ? h('div', { class: 'grid-empty' }, empty) : null;
    this.drag = null;
    this.suppressClick = false;

    this.el.addEventListener('click', (e) => this.handleClick(e));
    this.el.addEventListener('keydown', (e) => {
      const cell = e.target.closest?.('.cell[data-id]');
      if (cell && e.target === cell && e.key === 'Enter') this.onOpen?.(cell.dataset.id, cell);
    });
    // Right-click a file for its menu (a phone's long press is the drag instead).
    this.el.addEventListener('contextmenu', (e) => {
      if (!onContext || this.drag || e.pointerType === 'touch') return;
      const cell = e.target.closest?.('.cell[data-id]');
      if (!cell || cell === this.entry || cell.classList.contains('is-pending')) return;
      onContext(e, cell.dataset.id, cell);
    });
    // …and pressing for it doesn't select the note's text (a Mac picks a word).
    this.el.addEventListener('mousedown', (e) => {
      if (!onContext || !(e.button === 2 || (e.button === 0 && e.ctrlKey))) return;
      const cell = e.target.closest?.('.cell[data-id]');
      if (cell && cell !== this.entry) e.preventDefault();
    });
    this.el.addEventListener('pointerdown', (e) => this.pointerDown(e));
    // The browser's own drag-and-drop would cancel ours halfway (pointercancel).
    this.el.addEventListener('dragstart', (e) => { if (this.sortable && !e.target.closest?.('.cell-entry')) e.preventDefault(); });
  }

  handleClick(e) {
    if (this.suppressClick) {
      this.suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.target.closest('a[href]')) return;
    const cell = e.target.closest('.cell');
    if (!cell || cell === this.entry) return;
    const btn = e.target.closest('[data-act]');
    if (btn) {
      e.stopPropagation();
      this.onAction?.(btn.dataset.act, cell.dataset.id || cell.dataset.key, btn, cell);
      return;
    }
    if (cell.dataset.id) this.onOpen?.(cell.dataset.id, cell);
  }

  get sortable() {
    return this._sortable;
  }

  set sortable(value) {
    this._sortable = !!value;
    this.el.classList.toggle('is-sortable', this._sortable);
  }

  keys() {
    return [...this.el.querySelectorAll(':scope > .cell[data-id]')].map((el) => el.dataset.id);
  }

  cellFor(id) {
    return this.cells.get(id);
  }

  // items are files, or { divider, id, label } section labels.
  // animate: 'reveal' (staggered entrance), 'flip' (glide to new places), or false.
  set(items, { animate = 'reveal' } = {}) {
    const flip = animate === 'flip' && !reducedMotion();
    const before = flip ? measure(nearby(this.cells.values())) : null;
    const gridBox = this.el.getBoundingClientRect();
    const next = new Map();
    const ordered = [];
    for (const item of items) {
      let el = this.cells.get(item.id);
      if (!el) {
        el = item.divider ? renderDivider(item) : renderCell(item, this.renderOpts);
        el.classList.add('is-new');
      }
      next.set(item.id, el);
      ordered.push(el);
    }
    for (const [key, el] of this.cells) {
      if (key.startsWith('up-')) { next.set(key, el); continue; }
      if (next.has(key)) continue;
      if (flip && before.has(el)) this.fadeAway(el, before.get(el), gridBox);
      else el.remove();
    }
    const pending = [...this.el.querySelectorAll(':scope > .cell.is-pending')];
    this.place([...pending, ...ordered]);
    this.cells = next;

    if (flip) {
      glide(before);
      let i = 0;
      for (const el of ordered) {
        if (!el.classList.contains('is-new')) continue;
        el.classList.remove('is-new');
        if (inViewport(el)) {
          shift(el, { duration: DUR.arrive, delay: STAGGER + Math.min(i++, 14) * STAGGER });
        }
      }
    } else {
      ordered.forEach((el, i) => {
        el.classList.remove('is-new');
        if (animate === 'reveal') {
          el.style.setProperty('--i', Math.min(i + (this.entry ? 1 : 0), 16));
          el.classList.add('reveal');
        }
      });
      if (animate === 'reveal' && this.entry) this.entry.classList.add('reveal');
    }
    this.syncEmpty();
  }

  place(desired) {
    let ref = this.entry ? this.entry.nextElementSibling : this.el.firstElementChild;
    for (const el of desired) {
      if (el === ref) { ref = ref.nextElementSibling; continue; }
      this.el.insertBefore(el, ref);
    }
  }

  fadeAway(el, rect, gridBox) {
    delete el.dataset.id;
    el.querySelectorAll('[data-vt]').forEach((n) => delete n.dataset.vt);
    el.classList.add('is-ghosting');
    Object.assign(el.style, {
      position: 'absolute', left: `${rect.left - gridBox.left}px`, top: `${rect.top - gridBox.top}px`,
      width: `${rect.width}px`, pointerEvents: 'none', zIndex: 0,
    });
    this.el.append(el);
    shift(el, { into: false, duration: DUR.change, easing: EASE_LEAVE, moved: 'translateY(10px)' })
      .finished.then(() => el.remove(), () => el.remove());
  }

  insertFirst(el, key) {
    const before = measure(nearby(this.el.querySelectorAll(':scope > .cell:not(.is-ghosting)')));
    this.place([el]);
    if (key) this.cells.set(key, el);
    glide(before);
    if (!reducedMotion()) {
      shift(el);
    }
    this.syncEmpty();
  }

  addPending(item) {
    const el = renderPending(item);
    this.insertFirst(el, item.key);
    return el;
  }

  updatePending(item) {
    const el = this.cells.get(item.key);
    if (el) updatePending(el, item);
  }

  // Swap a placeholder for the finished block, keeping the local preview on
  // screen until the real image has loaded so nothing flickers.
  resolve(key, block, { keep = true } = {}) {
    const old = this.cells.get(key);
    this.cells.delete(key);
    if (!old) return null;
    if (!keep) { this.remove(null, old); return null; }
    const cell = renderCell(block);
    const oldImg = old.querySelector('img.face');
    const newImg = cell.querySelector('img.face');
    if (oldImg && newImg && oldImg.complete && oldImg.naturalWidth) {
      const real = newImg.src;
      newImg.src = oldImg.src;
      newImg.classList.add('is-loaded');
      const pre = new Image();
      pre.onload = () => { newImg.src = real; };
      pre.src = real;
    }
    old.replaceWith(cell);
    this.cells.set(block.id, cell);
    if (!reducedMotion()) cell.animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: DUR.move, easing: 'ease' });
    return cell;
  }

  update(block) {
    const old = this.cells.get(block.id);
    if (!old) return;
    const cell = renderCell(block);
    old.replaceWith(cell);
    this.cells.set(block.id, cell);
  }

  remove(id, el = this.cells.get(id)) {
    if (!el) return;
    if (id) this.cells.delete(id);
    const others = measure(nearby(this.el.querySelectorAll(':scope > .cell:not(.is-ghosting)')));
    others.delete(el);
    if (inViewport(el) && !reducedMotion()) this.fadeAway(el, el.getBoundingClientRect(), this.el.getBoundingClientRect());
    else el.remove();
    glide(others);
    this.syncEmpty();
  }

  syncEmpty() {
    if (!this.emptyEl) return;
    const has = this.el.querySelector(':scope > .cell:not(.is-ghosting):not(.cell-entry)');
    if (has) this.emptyEl.remove();
    else if (!this.emptyEl.isConnected) this.el.append(this.emptyEl);
  }

  // ------------------------------------------------------------ reordering

  pointerDown(e) {
    if (!this.sortable || e.button !== 0) return;
    const cell = e.target.closest('.cell[data-id]');
    if (!cell || e.target.closest('button, a, input, textarea, [contenteditable]')) return;
    const start = { x: e.clientX, y: e.clientY };
    const touch = e.pointerType !== 'mouse';
    // No text selection or native image drag while pressing on a file; clicks still open it.
    if (!touch) e.preventDefault();
    let started = false;
    let timer = null;
    const move = (ev) => {
      if (started) { this.dragMove(ev); return; }
      const dist = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
      if (touch) { if (dist > 10) cleanup(); return; }
      if (dist > 6) { started = true; this.dragStart(cell, ev, start); }
    };
    // Settle on wherever the pointer is let go, even if no move event reached there.
    const up = (ev) => {
      cleanup();
      if (!started) return;
      if (ev.type === 'pointerup') this.dragMove(ev);
      this.dragEnd();
    };
    const cleanup = () => {
      clearTimeout(timer);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    if (touch) {
      timer = setTimeout(() => {
        started = true;
        this.dragStart(cell, e, start);
        navigator.vibrate?.(8);
      }, 380);
    }
  }

  dragStart(cell, ev, start) {
    const rect = cell.getBoundingClientRect();
    const ghost = cell.cloneNode(true);
    ghost.querySelectorAll('[data-vt]').forEach((n) => delete n.dataset.vt);
    ghost.classList.add('cell-ghost');
    ghost.classList.remove('reveal');
    ghost.style.width = `${rect.width}px`;
    document.body.append(ghost);
    cell.classList.add('is-placeholder');
    document.body.classList.add('is-dragging');
    // Mid-drag the page doesn't scroll, and a phone doesn't open its long-press menu.
    const blockTouch = (te) => te.preventDefault();
    addEventListener('touchmove', blockTouch, { passive: false });
    addEventListener('contextmenu', blockTouch);
    this.drag = {
      cell, ghost, blockTouch,
      dx: start.x - rect.left, dy: start.y - rect.top,
      x: ev.clientX, y: ev.clientY,
      initial: this.keys().join(','),
      list: this.targets?.() || [],
      over: null,
    };
    // Lifts on top of wherever it's carried ('add'), so it follows the
    // pointer from the start instead of sitting still until the lift ends.
    ghost.animate([{ transform: `scale(${1 / 1.035})` }, { transform: 'scale(1)' }], { duration: DUR.change, easing: EASE, composite: 'add' });
    this.dragMove(ev);
    this.scrollLoop();
  }

  ghostTransform(scale = 1.035) {
    const d = this.drag;
    // Shrunk over a world, it stays under the pointer where it was picked up.
    const k = scale < 1 ? scale : 1;
    return `translate(${d.x - d.dx * k}px, ${d.y - d.dy * k}px) scale(${scale})`;
  }

  dragMove(ev) {
    const d = this.drag;
    if (!d) return;
    if (ev) { d.x = ev.clientX; d.y = ev.clientY; }
    const over = this.targetAt(d.x, d.y);
    if (over !== d.over) {
      d.over?.el.classList.remove('is-target');
      over?.el.classList.add('is-target');
      d.over = over;
      d.ghost.classList.toggle('is-over-target', !!over);
    }
    d.ghost.style.transform = this.ghostTransform(over ? 0.6 : 1.035);
    if (!over) this.reposition();
  }

  // The world (a moon, or the planet) under the pointer, if any.
  targetAt(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const t of this.drag?.list || []) {
      const c = t.measure();
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < c.r * 1.25 + 14 && d < bestD) { best = t; bestD = d; }
    }
    return best;
  }

  reposition() {
    const d = this.drag;
    const items = [...this.el.children].filter((el) => el.classList.contains('cell') && !el.classList.contains('is-ghosting'));
    const first = items[0];
    if (!first) return;
    const style = getComputedStyle(this.el);
    const cols = style.gridTemplateColumns.split(' ').length;
    const colGap = parseFloat(style.columnGap) || 0;
    const rowGap = parseFloat(style.rowGap) || 0;
    const step = items[cols] ? items[cols].offsetTop - first.offsetTop : first.offsetHeight + rowGap;
    const box = this.el.getBoundingClientRect();
    const col = Math.max(0, Math.min(cols - 1, Math.floor((d.x - box.left) / (first.offsetWidth + colGap))));
    const row = Math.max(0, Math.floor((d.y - box.top) / step));
    const minIndex = items.findIndex((el) => el.dataset.id);
    const slot = Math.max(minIndex, Math.min(items.length - 1, row * cols + col));
    const current = items.indexOf(d.cell);
    if (slot === current || slot < 0) return;
    const target = items[slot];
    const rects = measure(nearby(items));
    if (slot > current) target.after(d.cell);
    else target.before(d.cell);
    glide(rects, { duration: DUR.arrive });
  }

  scrollLoop(now, last) {
    const d = this.drag;
    if (!d) return;
    const edge = 90;
    let speed = 0;
    if (d.over) speed = 0;
    else if (d.y < edge) speed = -((edge - d.y) / edge) * 18;
    else if (d.y > innerHeight - edge) speed = ((d.y - (innerHeight - edge)) / edge) * 18;
    if (speed) {
      // speed is per 60th of a second, so a 120 Hz screen doesn't scroll twice as fast
      scrollBy(0, speed * (last ? Math.min(now - last, 50) / 16.7 : 1));
      this.reposition();
    }
    d.raf = requestAnimationFrame((t) => this.scrollLoop(t, now));
  }

  dragEnd() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    cancelAnimationFrame(d.raf);
    removeEventListener('touchmove', d.blockTouch);
    removeEventListener('contextmenu', d.blockTouch);
    document.body.classList.remove('is-dragging');
    this.suppressClick = true;
    setTimeout(() => { this.suppressClick = false; }, 60);
    if (d.over) {
      // Let go over a moon (or the planet): it shrinks into that world.
      const target = d.over;
      target.el.classList.remove('is-target');
      const c = target.measure();
      const done = () => d.ghost.remove();
      d.cell.classList.remove('is-placeholder');
      if (reducedMotion()) done();
      else {
        const w = d.ghost.offsetWidth;
        const hgt = d.ghost.offsetHeight;
        d.ghost.animate(
          [{ transform: d.ghost.style.transform, opacity: 1 },
            { transform: `translate(${c.x - w * 0.05}px, ${c.y - hgt * 0.05}px) scale(0.1)`, opacity: 0 }],
          { duration: DUR.change, easing: EASE_LEAVE, fill: 'forwards' },
        ).finished.then(done, done);
      }
      this.onDropTo?.(target, d.cell.dataset.id);
      return;
    }
    const to = d.cell.getBoundingClientRect();
    const finish = () => {
      d.ghost.remove();
      d.cell.classList.remove('is-placeholder');
    };
    if (reducedMotion()) finish();
    else {
      d.ghost.animate(
        [{ transform: d.ghost.style.transform }, { transform: `translate(${to.left}px, ${to.top}px) scale(1)` }],
        { duration: DUR.move, easing: EASE, fill: 'forwards' },
      ).finished.then(finish, finish);
    }
    const keys = this.keys();
    if (keys.join(',') !== d.initial) this.onReorder?.(keys);
  }
}
