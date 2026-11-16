// The commonplace book: a planet kept for quotes. It isn't a setting to go
// looking for: a planet offers it once quotes are most of what it holds
// (read_commonplace in mutt/modes.py, mutt/quotes.py), and its switch lives in
// the planet's ••• menu after that. Fetched only when a planet uses it, with
// quotes.css.
//
// Every quote is a card on a wall, its words in the book face and who said it
// and where from beneath, read out of the note by the server each time (the
// notes themselves never change). "By who" gathers them under each person.
// The slideshow shows one at a time, large, in a room of its own. Anything on
// the planet that isn't a quote stays below as files.

import { blockContextMenu } from './actions.js';
import { api } from './api.js';
import { entryCell } from './entry.js';
import { icon } from './icons.js';
import { nav } from './nav.js';
import { canTransition, transition } from './transitions.js';
import { enterRoom, leaveRoom, openContextMenu, sectionHead, segmented, toast } from './ui.js';
import { addFiles } from './uploads.js';
import { BEAT, DUR, EASE, EASE_LEAVE, STAGGER, bus, debounce, h, named, paperFaces, plural, reducedMotion } from './util.js';

const moving = () => !reducedMotion();

// How long a quote stays in the slideshow before the next (tokens.css).
const PACE = (() => { const v = named('--slide-pace'); return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000; })() || BEAT.rest;

// Wider walls hold more columns; a phone holds one.
const columnsFor = (width) => (width >= 900 ? 3 : width >= 540 ? 2 : 1);

// About how tall a card will be, to lay the wall out before it's drawn:
// the line height and the width of a letter at each of the three sizes.
const SIZES = { 1: [26, 9.4], 2: [24, 7.6], 3: [22, 6.7] };
function guessHeight(q, width) {
  const [line, letter] = SIZES[q.size] || SIZES[2];
  const perLine = Math.max(12, (width - 40) / letter);
  const lines = q.words.split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(part.length / perLine)), 0);
  return lines * line + (q.who || q.source ? 52 : 28) + 34;
}

// Split cards between columns, each into the shortest so far, so the wall
// reads across in order and its foot stays nearly level.
function pack(items, n, width) {
  const cols = Array.from({ length: n }, () => ({ els: [], height: 0 }));
  for (const { el, height } of items) {
    const col = cols.reduce((a, b) => (b.height < a.height - 1 ? b : a));
    col.els.push(el);
    col.height += height + 24;
  }
  return cols.map((c) => h('div', { class: 'qw-col' }, c.els));
}

// Who said it, and where from.
function creditEl(q, { who = true, cls = 'qw' } = {}) {
  const name = who && q.who;
  if (!name && !q.source) return null;
  return h('span', { class: `${cls}-by` },
    name ? h('span', { class: `${cls}-who` }, q.who) : null,
    q.source ? h('span', { class: `${cls}-src` }, q.source) : null);
}

// The words, with the opening mark hung in the margin.
const wordsEl = (q, cls) => h('span', { class: `${cls}-words` },
  h('span', { class: `${cls}-hang`, 'aria-hidden': 'true' }, '“'), q.words, h('span', { 'aria-hidden': 'true' }, '”'));

const whoKey = (q) => (q.who || '').trim().toLowerCase();

export class QuoteWall {
  constructor({ drawer, blocks, editable, makeCollection, onChange, onShow }) {
    paperFaces();
    this.drawer = drawer;
    this.blocks = blocks.slice();
    this.editable = editable;
    this.onChange = onChange;
    this.onShow = onShow;
    this.quotes = [];
    this.read = false;
    this.show = drawer.modes?.commonplace?.show === 'who' ? 'who' : 'all';
    this.ctx = { drawerId: drawer.id };
    this.drawn = new Set();

    // Files that aren't quotes stay below. Until the notes are read, only what
    // isn't a note goes there.
    this.collection = makeCollection(this.blocks.filter((b) => b.kind !== 'text'), {
      onChange: () => this.changed(),
      entry: false,
      empty: '',
    });

    this.seg = segmented([{ value: 'all', label: 'All' }, { value: 'who', label: 'By who' }], this.show,
      (v) => this.setShow(v), { label: 'Show the quotes' });
    this.playBtn = h('button', { type: 'button', class: 'btn btn-small', onclick: () => this.slideshow() }, icon('play'), 'Slideshow');
    this.head = sectionHead('Quotes', { tools: [this.seg.el, this.playBtn] });
    this.wall = h('div', { class: 'qw-wall', 'aria-busy': 'true' });
    this.othersHead = sectionHead('Other files').el;
    this.others = h('div', { class: 'qw-others' }, this.othersHead, this.collection.el);

    // The add box, for a quote and who said it (Shift-Return for a new line).
    this.adder = null;
    if (editable || drawer.community) {
      const cell = entryCell({ onText: (text) => this.addText(text), onFiles: (files) => addFiles(files, this.ctx) });
      const box = cell.querySelector('.entry');
      const area = box.querySelector('textarea');
      area.placeholder = 'Add a quote';
      area.setAttribute('aria-label', 'Add a quote');
      this.adder = h('div', { class: 'qw-add' }, box);
    }

    this.el = h('div', { class: 'qw' }, h('div', { class: 'qw-book' }, this.head.el, this.wall), this.others);
    this.width = 0;
    this.render();
    this.refresh({ entrance: true });

    // A wall that gets wider or narrower takes more or fewer columns (on the next frame, outside the observer).
    this.resize = new ResizeObserver(() => requestAnimationFrame(() => {
      const w = this.wall.clientWidth;
      if (w && this.width && columnsFor(w) !== columnsFor(this.width)) this.render();
      else if (w) this.width = w;
    }));
    this.resize.observe(this.wall);

    const soon = debounce(() => this.refresh(), 250);
    const here = (id) => this.blocks.some((b) => b.id === id);
    this.off = [
      bus.on('block:deleted', ({ id }) => this.forget(id)),
      bus.on('block:disconnected', ({ block, drawerId }) => { if (drawerId === drawer.id) this.forget(block.id); }),
      bus.on('block:connected', ({ block, drawerId }) => {
        if (drawerId !== drawer.id) return;
        if (!here(block.id)) this.blocks.unshift(block);
        if (block.kind === 'text') soon();
      }),
      bus.on('block:changed', (b) => {
        const known = this.blocks.find((x) => x.id === b.id);
        if (!known) return;
        Object.assign(known, b);
        if (known.kind === 'text') soon();
      }),
      bus.on('upload:done', (item) => {
        if (item.ctx?.drawerId !== drawer.id || !item.block || here(item.block.id)) return;
        this.blocks.unshift(item.block);
        if (item.block.kind === 'text') soon();
      }),
    ];
  }

  // ------------------------------------------------------------ what's here

  blockOf(id) { return this.blocks.find((b) => b.id === id); }

  quoteBlocks() { return this.quotes.map((q) => this.blockOf(q.id)).filter(Boolean); }

  list() {
    if (!this.read) return this.blocks.slice();
    const shown = new Set(this.quotes.map((q) => q.id));
    const rest = this.collection.list().filter((b) => !shown.has(b.id));
    return [...this.quoteBlocks(), ...rest];
  }

  changed() {
    for (const b of this.collection.blocks) if (!this.blockOf(b.id)) this.blocks.push(b);
    this.othersHead.hidden = !this.collection.blocks.length;
    this.others.hidden = !this.collection.blocks.length;
    this.onChange?.(this.list());
  }

  // What the server reads each note as, now.
  async refresh({ entrance = false } = {}) {
    let quotes;
    try {
      ({ quotes } = await api.get(`/api/drawers/${this.drawer.id}/quotes`));
    } catch {
      if (!this.read) { this.read = true; this.sync(); this.render(); }
      return;
    }
    // The book face, before the cards are set in it (but never long).
    await Promise.race([document.fonts?.load('italic 400 20px Newsreader').catch(() => {}), new Promise((r) => setTimeout(r, DUR.scene))]);
    if (!this.el.isConnected && !entrance) return;
    const before = new Set(this.quotes.map((q) => q.id));
    this.quotes = quotes;
    this.read = true;
    this.sync();
    const born = entrance ? null : new Set(quotes.filter((q) => !before.has(q.id)).map((q) => q.id));
    this.render({ entrance, born });
    this.changed();
  }

  // Notes that became quotes leave the files below; ones that stopped being quotes join them.
  sync() {
    const ids = new Set(this.quotes.map((q) => q.id));
    for (const id of ids) if (this.collection.blocks.some((b) => b.id === id)) this.collection.drop(id);
    const below = new Set(this.collection.blocks.map((b) => b.id));
    const add = this.blocks.filter((b) => !ids.has(b.id) && !below.has(b.id) && !String(b.id).startsWith('tmp-'));
    if (add.length) {
      this.collection.blocks.push(...add);
      this.collection.render('flip');
    }
  }

  forget(id) {
    if (!this.blockOf(id)) return;
    this.blocks = this.blocks.filter((b) => b.id !== id);
    const had = this.quotes.some((q) => q.id === id);
    this.quotes = this.quotes.filter((q) => q.id !== id);
    if (!had) { this.changed(); return; }
    const el = this.wall.querySelector(`[data-id="${CSS.escape(id)}"]`);
    const done = () => { this.render(); this.changed(); };
    if (el && moving()) {
      el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.97)' }], { duration: DUR.change, easing: EASE_LEAVE, fill: 'forwards' }).finished.then(done, done);
    } else done();
  }

  async addText(text) {
    try {
      const { block } = await api.post('/api/blocks', { content: text, drawer: this.drawer.id });
      if (!this.blockOf(block.id)) this.blocks.unshift(block);
      await this.refresh();
      if (!this.quotes.some((q) => q.id === block.id)) toast('Added below with the other files. Put “— and a name” after a quote to set it on the wall.');
    } catch (err) {
      const area = this.adder?.querySelector('textarea');
      if (area && !area.value) { area.value = text; area.dispatchEvent(new Event('input')); }
      toast(err.message);
    }
  }

  setShow(value) {
    if (value === this.show) return;
    this.show = value;
    this.seg.set(value);
    this.render({ entrance: true });
    if (this.editable) this.onShow?.(value);
  }

  // The order the cards are in on the page, which the slideshow follows.
  ordered() {
    if (this.show !== 'who') return this.quotes;
    return this.groups().flatMap((g) => g.quotes);
  }

  // Each person's quotes under their name, most quoted first; quotes with no one named last.
  groups() {
    const by = new Map();
    for (const q of this.quotes) {
      const key = whoKey(q);
      if (!by.has(key)) by.set(key, { name: q.who || 'No one named', quotes: [] });
      by.get(key).quotes.push(q);
    }
    return [...by.entries()]
      .sort(([ka, a], [kb, b]) => (!ka) - (!kb) || b.quotes.length - a.quotes.length || a.name.localeCompare(b.name))
      .map(([, g]) => g);
  }

  // ------------------------------------------------------------ drawing

  card(q, { who = true } = {}) {
    const block = this.blockOf(q.id);
    const el = h('button', {
      type: 'button',
      class: `qw-card fglass is-s${q.size}`,
      dataset: { id: q.id },
      'aria-label': `${q.words.slice(0, 80)}${q.who ? `, ${q.who}` : ''}. Show in the slideshow`,
      onclick: () => this.slideshow(q.id, { play: false }),
    }, wordsEl(q, 'qw'), creditEl(q, { who }));
    el.addEventListener('contextmenu', (e) => this.context(e, el, q, block));
    return el;
  }

  columns(quotes, width, { who = true, first = null } = {}) {
    const n = columnsFor(width);
    const colWidth = (width - 24 * (n - 1)) / n;
    const items = quotes.map((q) => ({ el: this.card(q, { who }), height: guessHeight(q, colWidth) }));
    if (first) items.unshift({ el: first, height: 168 });
    return h('div', { class: 'qw-grid', style: { '--qw-cols': n } }, pack(items, n, colWidth));
  }

  render({ entrance = false, born = null } = {}) {
    const width = this.wall.clientWidth || this.el.clientWidth || 960;
    this.width = width;
    const count = this.quotes.length;
    const people = new Set(this.quotes.map(whoKey).filter(Boolean)).size;
    this.head.fact.textContent = !this.read ? '' : people ? `${count} · ${plural(people, 'person', 'people')}` : String(count);
    this.seg.el.hidden = !people;
    this.playBtn.hidden = !count;
    this.playBtn.disabled = !count;
    this.wall.setAttribute('aria-busy', String(!this.read));

    let parts;
    if (!this.read) {
      parts = this.adder ? [this.columns([], width, { first: this.adder })] : [];
    } else if (!count && !this.adder) {
      parts = [h('p', { class: 'qw-empty' }, 'No quotes here yet.')];
    } else if (this.show === 'who' && people) {
      // Each person's quotes stand together under their name, and the groups are packed like cards.
      const n = columnsFor(width);
      const colWidth = (width - 24 * (n - 1)) / n;
      const items = this.groups().map((g) => ({
        el: h('section', { class: 'qw-group', 'aria-label': g.name },
          sectionHead(g.name, { fact: String(g.quotes.length) }).el,
          h('div', { class: 'qw-col' }, g.quotes.map((q) => this.card(q, { who: false })))),
        height: 44 + g.quotes.reduce((sum, q) => sum + guessHeight({ ...q, who: '' }, colWidth) + 24, 0),
      }));
      if (this.adder) items.unshift({ el: this.adder, height: 168 });
      parts = [h('div', { class: 'qw-grid', style: { '--qw-cols': n } }, pack(items, n, colWidth))];
    } else {
      parts = [this.columns(this.quotes, width, { first: this.adder })];
    }
    const hadFocus = this.adder?.contains(document.activeElement);
    this.wall.replaceChildren(...parts);
    if (hadFocus) this.adder.querySelector('textarea')?.focus({ preventScroll: true });

    if (!moving() || !(entrance || born?.size)) return;
    // Cards arrive in reading order: each slides up while its words fade in.
    const cards = [...this.wall.querySelectorAll('.qw-card')]
      .filter((el) => !born || born.has(el.dataset.id))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    cards.forEach((el, i) => {
      const delay = Math.min(i, 14) * STAGGER;
      el.animate([{ transform: 'translateY(16px)' }, { transform: 'none' }], { duration: DUR.arrive, delay, easing: EASE, fill: 'backwards' });
      for (const part of el.children) {
        part.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.arrive, delay: delay + STAGGER, easing: EASE, fill: 'backwards' });
      }
    });
  }

  context(e, el, q, block) {
    e.preventDefault();
    const show = { icon: 'play', label: 'Show in the slideshow', run: () => this.slideshow(q.id, { play: false }) };
    const open = () => nav.openBlock(q.id);
    if (block?.mine !== false && this.editable && block) blockContextMenu(e, el, block, { drawer: this.drawer, open, extra: [show] });
    else openContextMenu(e, [show, { icon: 'open', label: 'Open as a file', run: open }], { title: q.words.slice(0, 40), target: el });
  }

  // ------------------------------------------------------------ one at a time

  slideshow(startId = null, { play = true } = {}) {
    const list = this.ordered();
    if (!list.length) return;
    openSlideshow(list, { start: Math.max(0, list.findIndex((q) => q.id === startId)), play, title: this.drawer.title });
  }

  dropTarget() { return this.collection.dropTarget(); }

  pasteText(text) {
    const area = this.adder?.querySelector('textarea');
    if (!area) return;
    area.value = text;
    area.dispatchEvent(new Event('input'));
    area.focus();
  }

  destroy() {
    this.off.forEach((off) => off());
    this.resize.disconnect();
    this.collection.destroy();
    closeSlideshow?.({ instant: true });   // the page went (Back): its slideshow goes with it
  }
}

let closeSlideshow = null;

// ------------------------------------------------------------ the slideshow

// One quote at a time, large on the sky, in a room of its own. Playing, it
// moves on by itself and Mutt's bar steps back until the pointer moves.
function openSlideshow(quotes, { start = 0, play = true, title = '' } = {}) {
  let order = quotes.slice();
  let at = start;
  let playing = play;
  let shuffled = false;
  let timer = null;
  let idle = null;
  let lock = null;

  const words = h('blockquote', { class: 'qs-words' });
  const by = h('figcaption', { class: 'qs-by' });
  const figure = h('figure', { class: 'qs-quote' }, words, by);
  const stage = h('div', { class: 'qs-stage', 'aria-live': 'polite' }, figure);
  const where = h('span', { class: 'qs-where' });
  const round = (name, label, run) => h('button', { type: 'button', class: 'btn btn-quiet btn-round', 'aria-label': label, title: label, onclick: run }, icon(name));
  const prev = round('chevron-left', 'Previous quote', () => go(-1));
  const next = round('chevron-right', 'Next quote', () => go(1));
  const playBtn = round('play', 'Play', () => setPlaying(!playing));
  const shuffleBtn = round('shuffle', 'Shuffle', () => setShuffle(!shuffled));
  shuffleBtn.setAttribute('aria-pressed', 'false');
  const bar = h('div', { class: 'qs-bar bar-glass' }, prev, where, next, h('span', { class: 'qs-sep', 'aria-hidden': 'true' }), playBtn, shuffleBtn);
  const closeBtn = h('button', { type: 'button', class: 'btn btn-quiet qs-close', onclick: () => close() }, 'Close');
  const el = h('div', { class: 'qs room', role: 'dialog', 'aria-modal': 'true', 'aria-label': title ? `${title}, one at a time` : 'Slideshow' },
    h('header', { class: 'qs-top' }, closeBtn), stage, h('footer', { class: 'qs-foot' }, bar));

  const draw = () => {
    const q = order[at];
    words.replaceChildren(...wordsEl(q, 'qs').childNodes);
    words.className = `qs-words is-s${q.size}`;
    by.replaceChildren(...(creditEl(q, { cls: 'qs' })?.childNodes || []));
    by.hidden = !by.childNodes.length;
    where.textContent = `${at + 1} / ${order.length}`;
    const one = order.length < 2;
    prev.disabled = next.disabled = one;
  };

  // The quote showing fades away and the next one comes up into its place.
  let turning = null;
  const turnTo = async (i) => {
    if (i === at) return;
    at = i;
    const mine = (turning = {});
    if (moving()) {
      await figure.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.change, easing: EASE_LEAVE, fill: 'forwards' }).finished.catch(() => {});
      if (turning !== mine) return;
      draw();
      figure.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: DUR.arrive, easing: EASE, fill: 'forwards' });
    } else draw();
  };
  const go = (dir) => {
    if (order.length < 2) return;
    turnTo((at + dir + order.length) % order.length);
    schedule();
  };

  const schedule = () => {
    clearTimeout(timer);
    if (playing && order.length > 1 && document.visibilityState === 'visible') timer = setTimeout(() => go(1), PACE);
  };
  const keepAwake = async () => {
    if (!playing || document.visibilityState !== 'visible' || !el.isConnected) return;
    try { lock = await navigator.wakeLock?.request('screen'); } catch { lock = null; }
  };
  const letSleep = () => { lock?.release?.().catch(() => {}); lock = null; };
  const setPlaying = (on) => {
    playing = on;
    playBtn.replaceChildren(icon(on ? 'pause' : 'play'));
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    playBtn.title = on ? 'Pause' : 'Play';
    if (on) keepAwake(); else letSleep();
    schedule();
    wake();
  };
  const setShuffle = (on) => {
    shuffled = on;
    shuffleBtn.setAttribute('aria-pressed', String(on));
    shuffleBtn.classList.toggle('is-on', on);
    const current = order[at];
    if (on) {
      const rest = quotes.filter((q) => q !== current);
      for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
      order = [current, ...rest];
    } else order = quotes.slice();
    at = order.indexOf(current);
    draw();
    schedule();
  };

  // While it plays, Mutt's bar and Close step back after a moment of stillness.
  const wake = () => {
    el.classList.remove('is-still');
    clearTimeout(idle);
    if (playing) idle = setTimeout(() => el.classList.add('is-still'), BEAT.slow);
  };
  el.addEventListener('pointermove', wake);
  el.addEventListener('pointerdown', wake);

  // A swipe on a touch screen turns the page.
  let from = null;
  stage.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') from = { x: e.clientX, y: e.clientY }; });
  stage.addEventListener('pointerup', (e) => {
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    from = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  });

  const onKey = (e) => {
    if (document.querySelector('.pop:not(.is-leaving), .scrim')) return;
    wake();
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    if (e.key === ' ' && !e.target.closest?.('button')) { e.preventDefault(); setPlaying(!playing); }
  };
  const onVisible = () => { schedule(); keepAwake(); };

  function close({ instant = false } = {}) {
    if (closeSlideshow !== close) return;
    closeSlideshow = null;
    clearTimeout(timer);
    clearTimeout(idle);
    letSleep();
    removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onVisible);
    const done = () => { el.remove(); leaveRoom(); };
    if (!instant && canTransition()) transition(done, { type: 'room', before: () => [], after: () => [] });
    else done();
  }

  closeSlideshow = close;
  addEventListener('keydown', onKey, true);
  document.addEventListener('visibilitychange', onVisible);
  const mount = () => {
    document.body.append(el);
    enterRoom();
    draw();
    setPlaying(playing);
    (playing ? playBtn : next).focus({ preventScroll: true });
  };
  if (canTransition()) transition(mount, { type: 'room', before: () => [], after: () => [] });
  else mount();
}
