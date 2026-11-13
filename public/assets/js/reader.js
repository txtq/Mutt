// The reader: a book laid out in pages that fit the screen, turned by tap,
// swipe, arrow keys or the wheel. Two pages side by side on wide screens.
// Remembers where you are, and keeps your highlights, notes and bookmarks.
//
// EPUBs come one chapter at a time from the server (/api/books/<id>/part/...),
// and only safe elements are kept from them. PDFs either show their printed
// pages, or, once turned into reading format (pdfbook.js), flow like an EPUB.
//
// Places in a book are "<chapter>:<character>" (a highlight is
// "<chapter>:<start>-<end>"), counted over the chapter's text, so they stay
// put whatever the font size or screen. A PDF's pages are "p:<page>".

import { api } from './api.js';
import { loadPdfjs } from './pdfjs.js';
import { NoText, outlineOf, pdfToBook } from './pdfbook.js';
import { segmented, stepper, toast } from './ui.js';
import { DUR, EASE, EASE_LEAVE, debounce, h, paperFaces, plural, reducedMotion } from './util.js';
import { icon as draw } from './icons.js';

const THEMES = [
  { value: 'night', label: 'Night' },
  { value: 'quiet', label: 'Quiet' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'paper', label: 'Paper' },
];
const FONTS = [{ value: 'serif', label: 'Serif' }, { value: 'sans', label: 'Sans' }];
const SIZES = [14, 15, 16, 17, 18, 19, 20, 22, 24, 27, 30];
const SPACINGS = [{ value: 'tight', label: 'Tight' }, { value: 'normal', label: 'Normal' }, { value: 'loose', label: 'Loose' }];
const COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'];
const DEFAULTS = { theme: 'night', font: 'serif', size: 4, spacing: 'normal', justify: true, pages: 1 };

// Two pages side by side need a wide screen; then it's the reader's choice.
const roomForTwo = (W, H) => W >= 960 && W > H * 1.15;
const KEY = 'mutt:reader';

const moving = () => !reducedMotion();

function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* fine */ }
}
function remember(name, value) {
  try { if (value == null) localStorage.removeItem(name); else localStorage.setItem(name, value); } catch { /* fine */ }
}
function recall(name) {
  try { return localStorage.getItem(name); } catch { return null; }
}

// An icon from the one set (icons.js). 20 in the bar, 16 everywhere else.
const icon = (name, size = 16) => h('span', { class: 'rd-ic' }, draw(name, size));

// ------------------------------------------------------------ keeping what's safe in a book

const KEEP = new Set(('p div span section article aside header footer h1 h2 h3 h4 h5 h6 blockquote em i b strong u s '
  + 'sub sup small br hr ul ol li dl dt dd table thead tbody tfoot tr td th caption figure figcaption img a pre code '
  + 'cite q abbr del ins mark big center nav main').split(' '));
const DROP = new Set('script style link meta title head iframe object embed form input button select textarea noscript template audio video canvas math'.split(' '));
const RENAME = { center: 'div', big: 'span', nav: 'div', main: 'div', mark: 'span' };

const enc = (path) => path.split('/').map(encodeURIComponent).join('/');
function resolve(base, rel) {
  try {
    const u = new URL(rel, `http://book/${enc(base)}`);
    return { path: decodeURIComponent(u.pathname.slice(1)), hash: decodeURIComponent(u.hash.slice(1)) };
  } catch {
    return null;
  }
}

function sanitize(root, { base, part, ch }) {
  const out = document.createDocumentFragment();
  const walk = (node, into) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) { into.append(child.data); continue; }
      if (child.nodeType !== 1) continue;
      const tag = child.localName.toLowerCase();
      if (DROP.has(tag)) continue;
      if (tag === 'svg') {
        const image = child.querySelector('image');
        const href = image && (image.getAttribute('href') || image.getAttribute('xlink:href') || image.getAttributeNS('http://www.w3.org/1999/xlink', 'href'));
        const src = href && resolve(base, href);
        if (src) into.append(h('img', { class: 'rd-img rd-full', src: part(src.path), alt: '' }));
        continue;
      }
      if (tag === 'img' || tag === 'image') {
        const src = resolve(base, child.getAttribute('src') || child.getAttribute('href') || '');
        if (src?.path) into.append(h('img', { class: 'rd-img', src: part(src.path), alt: child.getAttribute('alt') || '', loading: 'eager' }));
        continue;
      }
      if (!KEEP.has(tag)) { walk(child, into); continue; }
      const el = document.createElement(RENAME[tag] || tag);
      const id = child.getAttribute('id') || child.getAttribute('name');
      if (id) { el.id = `rd-${ch}-${id}`; el.dataset.anchor = id; }
      if (tag === 'a') {
        const href = child.getAttribute('href') || child.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
        if (href && /^(https?:|mailto:)/i.test(href)) {
          el.href = href; el.target = '_blank'; el.rel = 'noopener noreferrer';
        } else if (href) {
          const to = resolve(base, href);
          if (to) { el.href = '#'; el.dataset.go = `${to.path}#${to.hash}`; }
        }
        const type = [...child.attributes].find((a) => a.localName === 'type')?.value || '';
        if (/noteref/.test(type)) el.classList.add('rd-noteref');
      }
      if (tag === 'td' || tag === 'th') {
        for (const a of ['colspan', 'rowspan']) if (child.getAttribute(a)) el.setAttribute(a, child.getAttribute(a));
      }
      if (tag === 'ol' && child.getAttribute('start')) el.setAttribute('start', child.getAttribute('start'));
      const align = (child.getAttribute('style') || '').match(/text-align\s*:\s*(center|right|left|justify)/i)?.[1]
        || child.getAttribute('align');
      if (align && /^(center|right)$/i.test(align)) el.style.textAlign = align.toLowerCase();
      if (tag === 'center') el.style.textAlign = 'center';
      walk(child, el);
      into.append(el);
    }
  };
  walk(root, out);
  return out;
}

// ------------------------------------------------------------ where the chapters come from

class EpubSource {
  constructor(book) {
    this.book = book;
    this.part = (path) => `/api/books/${book.id}/part/${enc(path)}`;
    const firstTitle = new Map();
    for (const t of book.toc || []) if (!firstTitle.has(t.href)) firstTitle.set(t.href, t.title);
    this.chapters = book.spine.map((s, i) => ({ href: s.href, chars: Math.max(1, s.chars), title: firstTitle.get(s.href) || null, i }));
    let last = null;
    for (const c of this.chapters) { if (c.title) last = c.title; else c.title = last; }
    const index = new Map(this.chapters.map((c) => [c.href, c.i]));
    this.indexOf = (path) => index.get(path);
    this.toc = (book.toc || []).map((t) => ({ title: t.title, level: t.level, ch: index.get(t.href), anchor: t.anchor }))
      .filter((t) => t.ch != null);
    if (!this.toc.length) this.toc = this.chapters.filter((c) => c.chars > 400).map((c, n) => ({ title: c.title || `Part ${n + 1}`, level: 0, ch: c.i }));
    this.cache = new Map();
  }

  async load(i) {
    const c = this.chapters[i];
    if (!this.cache.has(i)) {
      this.cache.set(i, fetch(this.part(c.href), { credentials: 'same-origin' }).then((r) => {
        if (!r.ok) throw new Error('This chapter couldn’t be opened.');
        return r.text();
      }));
      if (this.cache.size > 6) this.cache.delete(this.cache.keys().next().value);
    }
    let text;
    try { text = await this.cache.get(i); } catch (err) { this.cache.delete(i); throw err; }
    const parser = new DOMParser();
    let doc = parser.parseFromString(text, 'application/xhtml+xml');
    if (doc.querySelector('parsererror') || !doc.body) doc = parser.parseFromString(text, 'text/html');
    return sanitize(doc.body || doc.documentElement, { base: c.href, part: this.part, ch: i });
  }
}

class TextSource {
  constructor(data) {
    this.chapters = data.chapters.map((c, i) => ({
      title: c.title, i, blocks: c.blocks, chars: Math.max(1, c.blocks.reduce((n, b) => n + (b.x || '').length, 0)),
    }));
    this.toc = this.chapters.map((c) => ({ title: c.title, level: 0, ch: c.i }));
    this.indexOf = () => undefined;
  }

  async load(i) {
    const frag = document.createDocumentFragment();
    for (const b of this.chapters[i].blocks) {
      const tag = b.t === 'h1' ? 'h1' : b.t === 'h2' ? 'h2' : b.t === 'h3' ? 'h3' : 'p';
      const el = h(tag, b.t === 'small' ? { class: 'rd-small' } : null, b.x || '');
      frag.append(el);
    }
    return frag;
  }
}

// ------------------------------------------------------------ the reader

let openOne = null;

export async function openReader(blockId, opts = {}) {
  if (openOne) await openOne.close();
  openOne = new Reader(blockId, opts);
  return openOne.open();
}

class Reader {
  constructor(id, { onClose, title, cover } = {}) {
    this.id = id;
    this.onClose = onClose;
    this.settings = loadSettings();
    this.marks = [];
    this.page = 0;
    this.pages = 1;
    this.ch = 0;
    this.off = [];
    this.saveSoon = debounce(() => this.saveProgress(), 900);
    this.hint = { title, cover };
  }

  // -------------------------------------------------------- the frame

  build() {
    this.title = h('p', { class: 'rd-title' }, this.hint.title || '');
    this.author = h('p', { class: 'rd-author' });
    const btn = (name, label, run, extra = {}) => h('button', { type: 'button', class: 'btn btn-quiet btn-round btn-large rd-btn', 'aria-label': label, title: label, onclick: run, ...extra }, icon(name, 20));
    this.markBtn = btn('bookmark', 'Bookmark this page', () => this.toggleBookmark(), { 'aria-pressed': 'false' });
    this.typeBtn = btn('type', 'Text and page', () => this.togglePanel('type'), { 'aria-expanded': 'false' });
    this.tocBtn = btn('bullets', 'Contents, bookmarks and highlights', () => this.togglePanel('toc'), { 'aria-expanded': 'false' });
    this.top = h('header', { class: 'rd-top' },
      btn('close', 'Close the book', () => this.close()),
      this.tocBtn,
      h('div', { class: 'rd-heading' }, this.title, this.author),
      this.typeBtn, this.markBtn);

    this.flow = h('div', { class: 'rd-flow', lang: document.documentElement.lang || navigator.language || 'en' });
    this.viewEl = h('div', { class: 'rd-view' }, this.flow);
    this.ribbon = h('span', { class: 'rd-ribbon', 'aria-hidden': 'true' });
    this.stage = h('div', { class: 'rd-stage' }, this.viewEl, this.ribbon);
    this.chLabel = h('span', { class: 'rd-foot-ch' });
    this.leftLabel = h('span', { class: 'rd-foot-left' });
    this.pctLabel = h('span', { class: 'rd-foot-pct' });
    this.scrub = h('input', { class: 'rd-scrub', type: 'range', min: '0', max: '1000', value: '0', 'aria-label': 'How far through the book' });
    this.scrubTip = h('span', { class: 'rd-scrub-tip' });
    this.foot = h('footer', { class: 'rd-foot' },
      h('div', { class: 'rd-scrub-row' }, this.scrub, this.scrubTip),
      h('div', { class: 'rd-foot-row' }, this.chLabel, this.pctLabel, this.leftLabel));
    this.backBtn = h('button', { type: 'button', class: 'rd-backto', hidden: true, onclick: () => this.goBack() }, icon('back'), 'Back');
    this.panelEl = h('div', { class: 'rd-panel', hidden: true });
    this.popEl = h('div', { class: 'rd-pop', hidden: true, role: 'toolbar', 'aria-label': 'Highlight' });
    this.cardEl = h('div', { class: 'rd-card', hidden: true });
    this.loading = h('div', { class: 'rd-loading' }, h('span', { class: 'rd-spin' }));

    this.el = h('div', { class: 'rd room is-chrome', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Reader' },
      this.top, this.stage, this.foot, this.backBtn, this.panelEl, this.popEl, this.cardEl, this.loading);
    this.applySettings();
  }

  async open() {
    paperFaces();
    this.build();
    this.prevFocus = document.activeElement;
    document.body.append(this.el);
    document.documentElement.classList.add('is-reading');
    if (moving()) this.el.animate([{ opacity: 0, transform: 'scale(1.015)' }, { opacity: 1, transform: 'none' }], { duration: DUR.move, easing: EASE });
    this.wire();
    try {
      const data = await api.get(`/api/books/${this.id}`);
      this.book = data.book;
      this.marks = data.marks || [];
      this.progress = data.progress;
      this.title.textContent = this.book.title || 'Untitled';
      this.author.textContent = this.book.author || '';
      this.el.setAttribute('aria-label', this.book.title || 'Reader');
      if (this.book.format === 'epub') {
        this.source = new EpubSource(this.book);
        this.flow.dir = this.book.dir || 'ltr';
        if (this.book.language) this.flow.lang = this.book.language;
        await this.startFlow();
      } else if (this.book.converted && recall(`mutt:pages:${this.id}`) !== '1') {
        await this.startText();
      } else if (this.book.mine && !this.book.converted && recall(`mutt:pages:${this.id}`) !== '1') {
        this.pdfChoice();
      } else {
        await this.startPages();
      }
    } catch (err) {
      this.fail(err.message || 'This book couldn’t be opened.');
    }
    return this;
  }

  fail(message) {
    this.loading.hidden = true;
    this.showCard(h('div', null,
      h('p', { class: 'rd-card-title' }, 'This book couldn’t be opened'),
      h('p', { class: 'rd-card-text' }, message),
      h('div', { class: 'rd-card-btns' }, h('button', { type: 'button', class: 'btn', onclick: () => this.close() }, 'Close'))));
  }

  showCard(content) {
    this.cardEl.replaceChildren(content);
    this.cardEl.hidden = false;
    if (moving()) this.cardEl.animate([{ opacity: 0, transform: 'translate(-50%, -46%) scale(0.98)' }, { opacity: 1, transform: 'translate(-50%, -50%)' }], { duration: DUR.arrive, easing: EASE });
  }

  hideCard() { this.cardEl.hidden = true; }

  wire() {
    const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); this.off.push(() => target.removeEventListener(type, fn, opts)); };
    on(window, 'keydown', (e) => this.key(e), true);
    on(window, 'resize', debounce(() => this.relayout(), 140));
    on(this.stage, 'click', (e) => this.tap(e));
    on(this.stage, 'pointerdown', (e) => this.swipeStart(e));
    on(this.stage, 'wheel', (e) => this.wheel(e), { passive: false });
    on(document, 'selectionchange', debounce(() => this.selectionChanged(), 220));
    on(this.stage, 'pointerup', () => setTimeout(() => this.selectionChanged(), 10));
    on(this.scrub, 'input', () => this.scrubbing());
    on(this.scrub, 'change', () => this.scrubbed());
    on(this.el, 'pointerdown', (e) => {
      this.justClosed = false;
      if (!this.popEl.hidden && !this.popEl.contains(e.target) && !e.target.closest('.rd-hl')) { this.hidePop(); this.justClosed = true; }
      if (!this.panelEl.hidden && !this.panelEl.contains(e.target) && !e.target.closest('.rd-top')) { this.closePanel(); this.justClosed = true; }
    });
  }

  async close() {
    if (this.closing) return;
    this.closing = true;
    await Promise.race([this.saveProgress(), new Promise((r) => setTimeout(r, 1500))]);
    this.off.forEach((off) => off());
    this.pdf?.destroy?.();
    if (moving()) await this.el.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(1.01)' }], { duration: DUR.change, easing: EASE_LEAVE, fill: 'forwards' }).finished.catch(() => {});
    this.el.remove();
    document.documentElement.classList.remove('is-reading');
    if (openOne === this) openOne = null;
    this.prevFocus?.focus?.({ preventScroll: true });
    this.onClose?.({ percent: this.lastPercent ?? this.progress?.percent ?? 0, id: this.id });
  }

  key(e) {
    if (e.target.closest?.('textarea, input:not([type=range])')) {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); e.target.blur(); }
      return;
    }
    const rtl = this.flow.dir === 'rtl';
    if (e.key === 'Escape') {
      e.stopPropagation(); e.preventDefault();
      if (!this.popEl.hidden) this.hidePop();
      else if (!this.panelEl.hidden) this.closePanel();
      else this.close();
      return;
    }
    if (!this.ready || !this.panelEl.hidden) return;
    const fwd = ['PageDown', ' '].includes(e.key) || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
    const back = ['PageUp'].includes(e.key) || e.key === (rtl ? 'ArrowRight' : 'ArrowLeft') || (e.key === ' ' && e.shiftKey);
    if (fwd || back) {
      e.preventDefault(); e.stopPropagation();
      if (back) this.prev(); else this.next();
    }
  }

  // -------------------------------------------------------- settings

  applySettings() {
    const s = this.settings;
    this.el.dataset.theme = s.theme;
    this.el.dataset.font = s.font;
    this.el.dataset.spacing = s.spacing;
    this.el.classList.toggle('is-justified', !!s.justify);
    this.el.style.setProperty('--rd-size', `${SIZES[Math.max(0, Math.min(SIZES.length - 1, s.size))]}px`);
  }

  change(patch) {
    const keep = this.ready && this.mode === 'flow' ? this.place() : null;
    Object.assign(this.settings, patch);
    saveSettings(this.settings);
    this.applySettings();
    if (keep) this.relayout(keep.off);
    else if (this.mode === 'pages') this.relayout();
  }

  // -------------------------------------------------------- panels: text settings, contents

  togglePanel(kind) {
    if (!this.panelEl.hidden && this.panelKind === kind) { this.closePanel(); return; }
    this.hidePop();
    this.panelKind = kind;
    this.panelEl.dataset.kind = kind;
    this.panelEl.replaceChildren(kind === 'type' ? this.typePanel() : this.tocPanel());
    this.panelEl.hidden = false;
    this.typeBtn.setAttribute('aria-expanded', String(kind === 'type'));
    this.tocBtn.setAttribute('aria-expanded', String(kind === 'toc'));
    if (moving()) {
      const from = kind === 'toc' ? 'translateX(-14px)' : 'translateY(-8px)';
      this.panelEl.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }], { duration: DUR.move, easing: EASE });
    }
  }

  closePanel() {
    if (this.panelEl.hidden) return;
    this.panelEl.hidden = true;
    this.typeBtn.setAttribute('aria-expanded', 'false');
    this.tocBtn.setAttribute('aria-expanded', 'false');
  }

  typePanel() {
    const s = this.settings;
    const row = (label, ...kids) => h('div', { class: 'rd-set' }, h('p', { class: 'rd-set-label' }, label), ...kids);
    const choices = (list, value, pick, cls = '') => {
      const wrap = h('div', { class: `rd-choices ${cls}`, role: 'radiogroup' });
      for (const o of list) {
        const b = h('button', { type: 'button', role: 'radio', class: 'rd-choice', 'aria-checked': String(o.value === value), dataset: { value: o.value } }, o.label);
        b.addEventListener('click', () => {
          wrap.querySelectorAll('.rd-choice').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
          pick(o.value);
        });
        wrap.append(b);
      }
      return wrap;
    };
    const themes = h('div', { class: 'rd-themes', role: 'radiogroup', 'aria-label': 'Page colour' },
      THEMES.map((t) => {
        const b = h('button', { type: 'button', role: 'radio', class: 'rd-theme', 'aria-checked': String(t.value === s.theme), dataset: { theme: t.value } },
          h('span', { class: 'rd-theme-aa' }, 'Aa'), h('span', { class: 'rd-theme-name' }, t.label));
        b.addEventListener('click', () => {
          themes.querySelectorAll('.rd-theme').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
          this.change({ theme: t.value });
        });
        return b;
      }));
    const size = row('Text size', stepper({
      value: Math.max(0, Math.min(SIZES.length - 1, s.size)), min: 0, max: SIZES.length - 1, format: (i) => String(SIZES[i]),
      label: 'Text size', less: 'Smaller text', more: 'Bigger text', onChange: (i) => this.change({ size: i }),
    }).el);
    const flowOnly = this.mode !== 'pages';
    const pdfSwitch = this.book?.format === 'pdf' ? h('button', {
      type: 'button', class: 'btn rd-switch',
      onclick: () => { this.closePanel(); if (this.mode === 'pages') this.toText(); else this.toPages(); },
    }, this.mode === 'pages' ? (this.book.converted ? 'Read in reading format' : 'Turn into reading format…') : 'Show the printed pages') : null;
    return h('div', { class: 'rd-type' },
      flowOnly ? size : null,
      row('Page', themes),
      flowOnly ? row('Typeface', choices(FONTS, s.font, (v) => this.change({ font: v }))) : null,
      flowOnly ? row('Line spacing', choices(SPACINGS, s.spacing, (v) => this.change({ spacing: v }))) : null,
      roomForTwo(this.stage.clientWidth, this.stage.clientHeight)
        ? row('Pages', choices([{ value: '1', label: 'One' }, { value: '2', label: 'Two' }], String(s.pages), (v) => this.change({ pages: Number(v) })))
        : null,
      flowOnly ? row('Edges', choices([{ value: 'on', label: 'Justified' }, { value: 'off', label: 'Ragged' }], s.justify ? 'on' : 'off', (v) => this.change({ justify: v === 'on' }))) : null,
      this.book?.format === 'pdf' && (this.book.mine || this.book.converted) ? pdfSwitch : null);
  }

  tocPanel() {
    const tabs = [{ value: 'toc', label: 'Contents' }, { value: 'bookmark', label: 'Bookmarks' }, { value: 'highlight', label: 'Highlights' }];
    this.tocTab ||= 'toc';
    const body = h('div', { class: 'rd-list-wrap' });
    const picker = segmented(tabs, this.tocTab, (value) => { this.tocTab = value; picker.set(value); fill(); }, { tabs: true, className: 'rd-tabs', label: 'Show' });
    const bar = picker.el;
    const fill = () => {
      if (this.tocTab === 'toc') body.replaceChildren(this.contentsList());
      else body.replaceChildren(this.marksList(this.tocTab));
    };
    fill();
    const head = h('div', { class: 'rd-panel-head' },
      this.book?.cover ? h('img', { class: 'rd-panel-cover', src: this.book.cover, alt: '' }) : null,
      h('div', null, h('p', { class: 'rd-panel-title' }, this.book?.title || ''), h('p', { class: 'rd-panel-author' }, this.book?.author || ''),
        h('p', { class: 'rd-panel-pct' }, `${Math.round((this.lastPercent || 0) * 100)}% read`)));
    return h('div', { class: 'rd-toc' }, head, bar, body);
  }

  contentsList() {
    const items = this.mode === 'pages' ? (this.outline || []).map((o) => ({ title: o.title, level: 0, page: o.page })) : (this.source?.toc || []);
    if (!items.length) return h('p', { class: 'rd-empty' }, 'This book has no contents list.');
    const current = this.mode === 'pages' ? null : this.ch;
    let lastHere = -1;
    items.forEach((t, i) => { if (this.mode === 'pages' ? t.page <= this.page : t.ch <= current) lastHere = i; });
    const list = h('ol', { class: 'rd-list' }, items.map((t, i) => h('li', null,
      h('button', {
        type: 'button', class: `rd-row${i === lastHere ? ' is-here' : ''}`, style: { '--lvl': String(Math.min(3, t.level || 0)) },
        onclick: () => { this.closePanel(); this.remember(); if (this.mode === 'pages') this.showPage(t.page); else this.showChapter(t.ch, { anchor: t.anchor }); },
      }, h('span', { class: 'rd-row-title' }, t.title)))));
    requestAnimationFrame(() => list.querySelector('.is-here')?.scrollIntoView({ block: 'center' }));
    return list;
  }

  chapterTitle(ch) {
    if (this.mode === 'pages') return null;
    return this.source?.chapters[ch]?.title || null;
  }

  marksList(kind) {
    const marks = this.marks.filter((m) => m.kind === kind && (this.mode === 'pages') === m.loc.startsWith('p:'))
      .sort((a, b) => a.percent - b.percent);
    if (!marks.length) {
      return h('p', { class: 'rd-empty' }, kind === 'bookmark'
        ? 'No bookmarks yet. Tap the ribbon at the top to mark a page.'
        : 'No highlights yet. Select some words to highlight them.');
    }
    return h('ul', { class: 'rd-list' }, marks.map((m) => {
      const where = m.loc.startsWith('p:') ? `Page ${Number(m.loc.slice(2)) + 1}` : this.chapterTitle(Number(m.loc.split(':')[0])) || '';
      const del = h('button', { type: 'button', class: 'btn btn-quiet btn-round rd-row-del', 'aria-label': 'Remove', title: 'Remove' }, icon('trash'));
      const row = h('li', { class: 'rd-mark-row' },
        h('button', { type: 'button', class: 'rd-row', dataset: { color: m.color || '' }, onclick: () => { this.closePanel(); this.remember(); this.goToLoc(m.loc); } },
          kind === 'highlight' ? h('span', { class: 'rd-swatch', dataset: { color: m.color } }) : icon('bookmark'),
          h('span', { class: 'rd-row-body' },
            h('span', { class: 'rd-row-text' }, m.text || where || 'A page'),
            m.note ? h('span', { class: 'rd-row-note' }, m.note) : null,
            h('span', { class: 'rd-row-meta' }, [where, `${Math.round(m.percent * 100)}%`].filter(Boolean).join(' · ')))),
        del);
      del.addEventListener('click', async () => {
        await this.removeMark(m);
        row.remove();
      });
      return row;
    }));
  }

  // -------------------------------------------------------- flowing books (EPUB, PDF in reading format)

  async startFlow() {
    this.mode = 'flow';
    this.el.dataset.mode = 'flow';
    const chars = this.source.chapters.map((c) => c.chars);
    this.before = [];
    let n = 0;
    for (const c of chars) { this.before.push(n); n += c; }
    this.total = n || 1;
    const loc = this.progress?.loc && !this.progress.loc.startsWith('p:') ? this.progress.loc : null;
    let [ch, off] = loc ? loc.split(':').map(Number) : [0, 0];
    // Coming from the printed pages: about as far through.
    const from = !loc && this.progress?.percent ? this.chapterAt(this.progress.percent) : null;
    if (from) ch = from.ch;
    await this.showChapter(Math.min(this.source.chapters.length - 1, ch || 0), { at: off || 0 });
    if (from) this.goPage(this.pageOf(Math.round(from.into * this.chLen)), { animate: false });
    this.loading.hidden = true;
    this.ready = true;
    this.el.classList.add('is-ready');
    // Show the frame a moment, then get out of the way.
    this.chromeTimer = setTimeout(() => this.chrome(false), 1600);
  }

  async startText() {
    this.loading.hidden = false;
    const data = await fetch(`/api/books/${this.id}/text`, { credentials: 'same-origin' }).then((r) => {
      if (!r.ok) throw new Error('This book’s reading format couldn’t be opened.');
      return r.json();
    });
    this.source = new TextSource(data);
    if (!this.book.author && data.author) this.author.textContent = data.author;
    await this.startFlow();
  }

  layout() {
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    const phone = W < 620;
    const spread = roomForTwo(W, H) && this.settings.pages === 2;
    const side = phone ? 22 : spread ? 64 : 48;
    const gap = spread ? 96 : side * 2;
    const avail = W - side * 2;
    const pair = spread ? 2 : 1;
    const pageW = Math.floor(Math.min(spread ? 540 : 680, (avail - (pair - 1) * gap) / pair));
    const viewW = pair * pageW + (pair - 1) * gap;
    // A chapter that's only a picture (a cover) gets the whole spread.
    const cols = this.solo ? 1 : pair;
    const colW = this.solo ? viewW : pageW;
    const top = phone ? 66 : 80; // below the bar, which always stays
    const bottom = phone ? 46 : 60;
    const viewH = Math.max(160, H - top - bottom);
    Object.assign(this.viewEl.style, { width: `${viewW}px`, height: `${viewH}px`, top: `${top}px`, left: `${Math.round((W - viewW) / 2)}px` });
    this.flow.style.columnCount = String(cols);
    this.flow.style.columnGap = `${gap}px`;
    this.flow.style.setProperty('--rd-h', `${viewH}px`);
    this.el.classList.toggle('is-spread', spread);
    this.el.style.setProperty('--rd-vw', `${viewW}px`);
    this.geo = { cols, colW, gap, viewW, viewH, step: viewW + gap };
  }

  paginate() {
    const { cols, colW, gap } = this.geo;
    const width = this.flow.scrollWidth;
    const columns = Math.max(1, Math.round((width + gap) / (colW + gap)));
    this.pages = Math.max(1, Math.ceil(columns / cols));
    this.texts = null;
  }

  async showChapter(i, { at = 0, anchor = null, end = false, dir = 0 } = {}) {
    const token = (this.loadToken = (this.loadToken || 0) + 1);
    let frag;
    try {
      frag = await this.source.load(i);
    } catch (err) {
      toast(err.message);
      return;
    }
    if (token !== this.loadToken) return;
    this.flow.replaceChildren(frag);
    this.ch = i;
    this.chLen = this.textLength();
    this.solo = this.chLen < 30 && !!this.flow.querySelector('img');
    this.layout();
    this.paintMarks();
    for (const img of this.flow.querySelectorAll('img')) {
      if (!img.complete) img.addEventListener('load', this.imgSoon ||= debounce(() => this.relayout(), 120), { once: true });
    }
    await document.fonts?.ready;
    this.paginate();
    let page = 0;
    if (end) page = this.pages - 1;
    else if (anchor) {
      const el = this.flow.querySelector(`[data-anchor="${CSS.escape(anchor)}"]`);
      if (el) page = this.pageOfElement(el);
    } else if (at) page = this.pageOf(at);
    this.goPage(page, { animate: false });
    if (dir && moving()) {
      this.flow.animate([{ opacity: 0, translate: `${dir * 36}px 0` }, { opacity: 1, translate: '0 0' }], { duration: DUR.move, easing: EASE });
    }
  }

  relayout(keepOff) {
    if (!this.ready && keepOff == null) return;
    if (this.mode === 'pages') { this.layoutPages(); this.showPage(this.page, { animate: false }); return; }
    const off = keepOff ?? this.place().off;
    this.layout();
    this.paginate();
    this.goPage(this.pageOf(off), { animate: false });
  }

  // All the text nodes in this chapter, with where each one starts.
  textIndex() {
    if (this.texts) return this.texts;
    const nodes = [];
    const walker = document.createTreeWalker(this.flow, NodeFilter.SHOW_TEXT);
    let n = 0;
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      nodes.push({ node: t, start: n, seen: /\S/.test(t.data) });
      n += t.data.length;
    }
    this.texts = { nodes, length: n };
    return this.texts;
  }

  textLength() { this.texts = null; return this.textIndex().length; }

  // How many characters of the chapter come before this point.
  offsetOf(node, offset) {
    const r = document.createRange();
    r.setStart(this.flow, 0);
    try { r.setEnd(node, offset); } catch { return 0; }
    return r.toString().length;
  }

  pointAt(off) {
    const { nodes } = this.textIndex();
    let lo = 0;
    let hi = nodes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (nodes[mid].start <= off) lo = mid; else hi = mid - 1;
    }
    const x = nodes[lo];
    if (!x) return null;
    return { node: x.node, offset: Math.max(0, Math.min(x.node.data.length, off - x.start)), i: lo };
  }

  // Where (in the flow, before it's moved) a character sits: its column's left edge.
  charX(node, i) {
    const r = document.createRange();
    const len = node.data.length;
    if (!len) return null;
    const at = Math.min(i, len - 1);
    r.setStart(node, at);
    r.setEnd(node, at + 1);
    const rects = r.getClientRects();
    const rect = rects[rects.length - 1] || r.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return null;
    const base = this.flow.getBoundingClientRect();
    return this.flow.dir === 'rtl' ? base.right - rect.right : rect.left - base.left;
  }

  pageOfX(x) {
    const { colW, gap, cols } = this.geo;
    const col = Math.floor((x + 2) / (colW + gap));
    return Math.max(0, Math.min(this.pages - 1, Math.floor(col / cols)));
  }

  pageOf(off) {
    const p = this.pointAt(off);
    if (!p) return 0;
    const { nodes } = this.textIndex();
    for (let i = p.i; i < nodes.length; i++) {
      const x = this.charX(nodes[i].node, i === p.i ? p.offset : 0);
      if (x != null) return this.pageOfX(x);
    }
    return 0;
  }

  pageOfElement(el) {
    const base = this.flow.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return this.pageOfX(this.flow.dir === 'rtl' ? base.right - r.right : r.left - base.left);
  }

  // The first character on a page.
  startOf(page) {
    const { nodes, length } = this.textIndex();
    const seen = nodes.filter((x) => x.seen);
    if (!seen.length) return 0;
    const pageAt = (x, i) => { const px = this.charX(x.node, i); return px == null ? null : this.pageOfX(px); };
    // The first node that reaches this page...
    let lo = 0;
    let hi = seen.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const endPage = pageAt(seen[mid], seen[mid].node.data.length - 1);
      if (endPage == null || endPage < page) lo = mid + 1; else hi = mid;
    }
    const x = seen[lo];
    // ...and its first character that's on it.
    let a = 0;
    let b = x.node.data.length - 1;
    while (a < b) {
      const mid = (a + b) >> 1;
      const p = pageAt(x, mid);
      if (p == null || p < page) a = mid + 1; else b = mid;
    }
    return Math.min(length, x.start + a);
  }

  place() {
    if (this.mode === 'pages') return { loc: `p:${this.page}`, percent: this.pdfPages > 1 ? this.page / (this.pdfPages - 1) : 1 };
    const off = this.startOf(this.page);
    const len = this.chLen || 1;
    const chars = this.source.chapters[this.ch].chars;
    const atEnd = this.ch === this.source.chapters.length - 1 && this.page === this.pages - 1;
    const percent = atEnd ? 1 : Math.min(0.999, (this.before[this.ch] + (off / len) * chars) / this.total);
    return { loc: `${this.ch}:${off}`, off, percent };
  }

  goPage(page, { animate = true } = {}) {
    this.page = Math.max(0, Math.min(this.pages - 1, page));
    const x = this.page * this.geo.step * (this.flow.dir === 'rtl' ? 1 : -1);
    const to = `translate3d(${x}px, 0, 0)`;
    if (animate && moving()) {
      const from = getComputedStyle(this.flow).transform;
      this.flow.style.transform = to;
      this.flow.animate([{ transform: from === 'none' ? 'none' : from }, { transform: to }], { duration: DUR.move, easing: EASE });
    } else {
      this.flow.style.transform = to;
    }
    this.afterTurn();
  }

  afterTurn() {
    const place = this.place();
    this.lastPercent = place.percent;
    this.here = place;
    if (this.mode === 'flow') {
      const left = this.pages - 1 - this.page;
      this.leftLabel.textContent = left === 0 ? (this.ch === this.source.chapters.length - 1 ? 'Last page' : 'Last page in chapter')
        : `${plural(left, 'page')} left in chapter`;
      this.chLabel.textContent = this.chapterTitle(this.ch) || '';
    } else {
      this.leftLabel.textContent = `${this.page + 1} of ${this.pdfPages}`;
      this.chLabel.textContent = '';
    }
    this.pctLabel.textContent = `${Math.round(place.percent * 100)}%`;
    if (!this.scrubbingNow) this.scrub.value = String(Math.round(place.percent * 1000));
    this.paintBookmark();
    this.saveSoon();
  }

  async next() {
    this.hidePop();
    if (this.mode === 'pages') return this.showPage(this.page + this.pageStep());
    if (this.page < this.pages - 1) { this.goPage(this.page + 1); this.chrome(false); return; }
    if (this.ch < this.source.chapters.length - 1) { await this.showChapter(this.ch + 1, { dir: this.flow.dir === 'rtl' ? -1 : 1 }); this.chrome(false); return; }
    this.nudge(1);
  }

  async prev() {
    this.hidePop();
    if (this.mode === 'pages') return this.showPage(this.page - this.pageStep());
    if (this.page > 0) { this.goPage(this.page - 1); return; }
    if (this.ch > 0) { await this.showChapter(this.ch - 1, { end: true, dir: this.flow.dir === 'rtl' ? 1 : -1 }); return; }
    this.nudge(-1);
  }

  nudge(dir) {
    if (!moving()) return;
    const target = this.mode === 'pages' ? this.sheetEl : this.flow;
    target?.animate([{ translate: '0 0' }, { translate: `${-dir * 14}px 0` }, { translate: '0 0' }], { duration: DUR.move, easing: EASE, composite: 'add' });
    if (dir > 0 && this.lastPercent >= 1) toast('That’s the end of the book');
  }

  chrome(show) {
    clearTimeout(this.chromeTimer);
    this.el.classList.toggle('is-chrome', show);
    if (!show) this.closePanel();
  }

  tap(e) {
    if (!this.ready || this.swiped || this.justClosed) { this.swiped = false; this.justClosed = false; return; }
    const link = e.target.closest('a[data-go]');
    if (link) { e.preventDefault(); this.follow(link.dataset.go); return; }
    if (e.target.closest('a[href]')) return;
    const hl = e.target.closest('.rd-hl');
    if (hl && getSelection().isCollapsed) { this.openMarkPop(hl.dataset.id, hl); return; }
    if (!getSelection().isCollapsed) return;
    if (!this.popEl.hidden) { this.hidePop(); return; }
    const r = this.stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const rtl = this.flow.dir === 'rtl';
    if (x < 0.28) { if (rtl) this.next(); else this.prev(); }
    else if (x > 0.72) { if (rtl) this.prev(); else this.next(); }
    else this.chrome(!this.el.classList.contains('is-chrome'));
  }

  swipeStart(e) {
    if (e.pointerType !== 'touch' || !this.ready || e.target.closest('.rd-hl, a')) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const t0 = performance.now();
    let dragging = false;
    const target = this.mode === 'pages' ? this.sheetEl : this.flow;
    const base = this.mode === 'pages' ? 0 : -this.page * this.geo.step * (this.flow.dir === 'rtl' ? -1 : 1);
    const move = (ev) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (!dragging && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3 && getSelection().isCollapsed) dragging = true;
      if (dragging && target) target.style.transform = `translate3d(${base + dx}px, 0, 0)`;
    };
    const up = (ev) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      if (!dragging) return;
      this.swiped = true;
      setTimeout(() => { this.swiped = false; }, 400);
      const dx = ev.clientX - x0;
      const fast = Math.abs(dx) / (performance.now() - t0) > 0.45;
      const rtl = this.flow.dir === 'rtl';
      if ((dx < -60 || (fast && dx < -20))) { if (rtl) this.prev(); else this.next(); }
      else if (dx > 60 || (fast && dx > 20)) { if (rtl) this.next(); else this.prev(); }
      else if (this.mode === 'pages') this.showPage(this.page, { animate: false });
      else this.goPage(this.page);
      if (this.mode === 'pages' && target) target.style.transform = '';
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  }

  wheel(e) {
    if (!this.ready || !this.panelEl.hidden) return;
    e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (performance.now() < (this.wheelQuiet || 0)) { this.wheelAcc = 0; return; }
    this.wheelAcc = (this.wheelAcc || 0) + d;
    if (Math.abs(this.wheelAcc) > 50) {
      if (this.wheelAcc > 0) this.next(); else this.prev();
      this.wheelAcc = 0;
      this.wheelQuiet = performance.now() + 450;
    }
  }

  // A link inside the book: go there, with a way back.
  async follow(go) {
    const [path, hash] = go.split('#');
    const ch = this.source?.indexOf(path);
    if (ch == null) return;
    this.remember();
    await this.showChapter(ch, { anchor: hash || null });
  }

  remember() {
    if (!this.here) return;
    this.backTo = this.here.loc;
    this.backBtn.hidden = false;
    clearTimeout(this.backTimer);
    this.backTimer = setTimeout(() => { this.backBtn.hidden = true; }, 30000);
  }

  goBack() {
    this.backBtn.hidden = true;
    if (this.backTo) this.goToLoc(this.backTo);
    this.backTo = null;
  }

  async goToLoc(loc) {
    if (loc.startsWith('p:')) { if (this.mode === 'pages') this.showPage(Number(loc.slice(2))); return; }
    if (this.mode !== 'flow') return;
    const [ch, rest] = loc.split(':');
    const off = Number(String(rest).split('-')[0]) || 0;
    if (Number(ch) === this.ch) this.goPage(this.pageOf(off), { animate: false });
    else await this.showChapter(Number(ch), { at: off });
  }

  scrubbing() {
    this.scrubbingNow = true;
    const p = Number(this.scrub.value) / 1000;
    if (this.mode === 'pages') { this.scrubTip.textContent = `Page ${Math.round(p * (this.pdfPages - 1)) + 1}`; return; }
    const { ch } = this.chapterAt(p);
    this.scrubTip.textContent = `${this.chapterTitle(ch) || `Part ${ch + 1}`} · ${Math.round(p * 100)}%`;
  }

  chapterAt(p) {
    const want = p * this.total;
    let ch = 0;
    for (let i = 0; i < this.before.length; i++) if (this.before[i] <= want) ch = i;
    const into = Math.max(0, Math.min(1, (want - this.before[ch]) / this.source.chapters[ch].chars));
    return { ch, into };
  }

  async scrubbed() {
    this.scrubbingNow = false;
    this.scrubTip.textContent = '';
    const p = Number(this.scrub.value) / 1000;
    this.remember();
    if (this.mode === 'pages') { this.showPage(Math.round(p * (this.pdfPages - 1))); return; }
    const { ch, into } = this.chapterAt(p);
    if (ch === this.ch) this.goPage(this.pageOf(Math.round(into * this.chLen)), { animate: false });
    else {
      await this.showChapter(ch);
      this.goPage(this.pageOf(Math.round(into * this.chLen)), { animate: false });
    }
  }

  async saveProgress() {
    if (!this.ready || !this.here) return;
    const { loc, percent } = this.here;
    if (this.progress?.loc === loc) return;
    this.progress = { loc, percent };
    try { await api.put(`/api/books/${this.id}/progress`, { loc, percent }); } catch { /* next turn tries again */ this.progress = null; }
  }

  // -------------------------------------------------------- highlights

  paintMarks() {
    for (const m of this.marks) {
      if (m.kind !== 'highlight' || m.loc.startsWith('p:')) continue;
      const [ch, span] = m.loc.split(':');
      if (Number(ch) !== this.ch) continue;
      const [a, b] = span.split('-').map(Number);
      this.wrap(a, b, m);
    }
    this.texts = null;
  }

  wrap(a, b, mark) {
    const { nodes } = this.textIndex();
    const parts = [];
    for (const x of nodes) {
      const end = x.start + x.node.data.length;
      if (end <= a || x.start >= b) continue;
      if (!x.seen && !/\S/.test(x.node.data)) continue;
      parts.push([x.node, Math.max(0, a - x.start), Math.min(x.node.data.length, b - x.start)]);
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      let [node, s, e] = parts[i];
      if (node.parentNode?.closest?.('.rd-flow') == null) continue;
      if (s > 0) { node = node.splitText(s); e -= s; }
      if (e < node.data.length) node.splitText(e);
      const el = h('mark', { class: 'rd-hl', dataset: { id: mark.id, color: mark.color || 'yellow' } });
      if (mark.note) el.classList.add('has-note');
      node.parentNode.insertBefore(el, node);
      el.append(node);
    }
    this.texts = null;
  }

  unwrap(id) {
    for (const el of this.flow.querySelectorAll(`.rd-hl[data-id="${CSS.escape(id)}"]`)) {
      const parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      el.remove();
      parent.normalize();
    }
    this.texts = null;
  }

  selectionChanged() {
    if (!this.ready || this.mode !== 'flow') return;
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) { if (this.popKind === 'new') this.hidePop(); return; }
    const range = sel.getRangeAt(0);
    if (!this.flow.contains(range.commonAncestorContainer)) return;
    const text = range.toString().trim();
    if (!text) return;
    this.openNewPop(range);
  }

  rangeSpan(range) {
    const a = this.offsetOf(range.startContainer, range.startOffset);
    const b = this.offsetOf(range.endContainer, range.endOffset);
    return [Math.min(a, b), Math.max(a, b)];
  }

  placePop(rect) {
    const pop = this.popEl;
    pop.hidden = false;
    const r = this.el.getBoundingClientRect();
    const w = pop.offsetWidth;
    const hgt = pop.offsetHeight;
    let x = rect.left + rect.width / 2 - w / 2;
    x = Math.max(10, Math.min(r.width - w - 10, x));
    let y = rect.top - hgt - 12;
    let below = false;
    if (y < 56) { y = rect.bottom + 12; below = true; }
    pop.style.left = `${x}px`;
    pop.style.top = `${Math.min(r.height - hgt - 10, y)}px`;
    pop.classList.toggle('is-below', below);
    if (moving()) pop.animate([{ opacity: 0, transform: `translateY(${below ? -4 : 4}px) scale(0.96)` }, { opacity: 1, transform: 'none' }], { duration: DUR.change, easing: EASE });
  }

  colorRow(active, pick) {
    return h('div', { class: 'rd-colors' },
      [...COLORS, 'underline'].map((c) => h('button', {
        type: 'button', class: `swatch rd-color${c === active ? ' is-on' : ''}`, dataset: { color: c },
        'aria-label': c === 'underline' ? 'Underline' : `Highlight ${c}`, title: c === 'underline' ? 'Underline' : c[0].toUpperCase() + c.slice(1),
        onclick: () => pick(c),
      }, c === 'underline' ? icon('underline') : null)));
  }

  openNewPop(range) {
    this.popKind = 'new';
    const span = this.rangeSpan(range);
    const text = range.toString().replace(/\s+/g, ' ').trim();
    const rects = range.getClientRects();
    const rect = rects[0] || range.getBoundingClientRect();
    this.popEl.replaceChildren(
      this.colorRow(null, (c) => this.addHighlight(span, text, c)),
      h('span', { class: 'rd-pop-sep' }),
      h('button', { type: 'button', class: 'btn btn-quiet btn-small rd-pop-btn', onclick: () => this.addHighlight(span, text, 'yellow', { note: true }) }, icon('note'), 'Note'),
      h('button', { type: 'button', class: 'btn btn-quiet btn-small rd-pop-btn', onclick: () => { navigator.clipboard?.writeText(text).then(() => toast('Copied')); getSelection().removeAllRanges(); this.hidePop(); } }, icon('copy'), 'Copy'));
    this.placePop(rect);
  }

  openMarkPop(id, el) {
    const mark = this.marks.find((m) => m.id === id);
    if (!mark) return;
    this.popKind = 'mark';
    const rect = el.getBoundingClientRect();
    const note = h('textarea', { class: 'field rd-note', rows: '3', placeholder: 'Add a note', maxlength: '4000' });
    note.value = mark.note || '';
    const noteWrap = h('div', { class: 'rd-note-wrap', hidden: !mark.note }, note);
    const saveNote = debounce(() => this.updateMark(mark, { note: note.value }), 600);
    note.addEventListener('input', saveNote);
    this.popEl.replaceChildren(h('div', { class: 'rd-pop-main' },
      this.colorRow(mark.color, (c) => this.updateMark(mark, { color: c })),
      h('span', { class: 'rd-pop-sep' }),
      h('button', { type: 'button', class: 'btn btn-quiet btn-small rd-pop-btn', onclick: () => { noteWrap.hidden = false; note.focus(); } }, icon('note'), mark.note ? 'Note' : 'Add note'),
      h('button', { type: 'button', class: 'btn btn-quiet btn-small rd-pop-btn', onclick: () => { navigator.clipboard?.writeText(mark.text).then(() => toast('Copied')); this.hidePop(); } }, icon('copy'), 'Copy'),
      h('button', { type: 'button', class: 'btn btn-quiet btn-small btn-round rd-pop-btn is-danger', 'aria-label': 'Remove highlight', title: 'Remove highlight', onclick: () => { this.hidePop(); this.removeMark(mark, { undo: true }); } }, icon('trash'))),
    noteWrap);
    this.placePop(rect);
  }

  hidePop() {
    if (this.popEl.hidden) return;
    this.popEl.hidden = true;
    this.popKind = null;
  }

  async addHighlight([a, b], text, color, { note = false } = {}) {
    getSelection().removeAllRanges();
    this.hidePop();
    const percent = Math.min(0.999, (this.before[this.ch] + (a / (this.chLen || 1)) * this.source.chapters[this.ch].chars) / this.total);
    const temp = { id: `tmp-${Date.now()}`, kind: 'highlight', loc: `${this.ch}:${a}-${b}`, text: text.slice(0, 4000), color, note: '', percent };
    this.marks.push(temp);
    this.wrap(a, b, temp);
    const els = [...this.flow.querySelectorAll(`.rd-hl[data-id="${temp.id}"]`)];
    if (moving()) els.forEach((el) => el.animate([{ backgroundSize: '0% 100%' }, { backgroundSize: '100% 100%' }], { duration: DUR.move, easing: EASE }));
    try {
      const { mark } = await api.post(`/api/books/${this.id}/marks`, { kind: 'highlight', loc: temp.loc, text: temp.text, color, percent });
      Object.assign(temp, mark);
      els.forEach((el) => { el.dataset.id = mark.id; });
      if (note && els[0]) this.openMarkPop(mark.id, els[0]);
      if (note) this.popEl.querySelector('.rd-note-wrap')?.removeAttribute('hidden');
      if (note) this.popEl.querySelector('.rd-note')?.focus();
    } catch (err) {
      this.marks = this.marks.filter((m) => m !== temp);
      this.unwrap(temp.id);
      toast(err.message);
    }
  }

  async updateMark(mark, patch) {
    const before = { color: mark.color, note: mark.note };
    Object.assign(mark, patch);
    for (const el of this.flow.querySelectorAll(`.rd-hl[data-id="${CSS.escape(mark.id)}"]`)) {
      el.dataset.color = mark.color;
      el.classList.toggle('has-note', !!mark.note);
    }
    this.popEl.querySelectorAll('.rd-color').forEach((b) => b.classList.toggle('is-on', b.dataset.color === mark.color));
    try {
      await api.patch(`/api/books/${this.id}/marks/${mark.id}`, patch);
    } catch (err) {
      Object.assign(mark, before);
      toast(err.message);
    }
  }

  async removeMark(mark, { undo = false } = {}) {
    this.marks = this.marks.filter((m) => m !== mark);
    if (mark.kind === 'highlight') this.unwrap(mark.id);
    this.paintBookmark();
    try {
      await api.del(`/api/books/${this.id}/marks/${mark.id}`);
      if (undo) {
        toast('Highlight removed', {
          action: {
            label: 'Undo',
            run: async () => {
              const { mark: back } = await api.post(`/api/books/${this.id}/marks`, { kind: mark.kind, loc: mark.loc, text: mark.text, color: mark.color, note: mark.note, percent: mark.percent });
              this.marks.push(back);
              const [ch, span] = back.loc.split(':');
              if (Number(ch) === this.ch && this.mode === 'flow') { const [a, b] = span.split('-').map(Number); this.wrap(a, b, back); }
            },
          },
        });
      }
    } catch (err) {
      this.marks.push(mark);
      toast(err.message);
    }
  }

  // -------------------------------------------------------- bookmarks

  pageBookmark() {
    if (!this.here) return null;
    if (this.mode === 'pages') {
      const shown = new Set(Array.from({ length: this.pageStep() }, (_, i) => `p:${this.page + i}`));
      return this.marks.find((m) => m.kind === 'bookmark' && shown.has(m.loc)) || null;
    }
    const start = this.here.off;
    const end = this.page < this.pages - 1 ? this.startOf(this.page + 1) : Infinity;
    return this.marks.find((m) => {
      if (m.kind !== 'bookmark' || m.loc.startsWith('p:')) return false;
      const [ch, off] = m.loc.split(':').map(Number);
      return ch === this.ch && off >= start && off < end;
    }) || null;
  }

  paintBookmark() {
    const on = !!this.pageBookmark();
    this.markBtn.setAttribute('aria-pressed', String(on));
    this.markBtn.title = on ? 'Remove this bookmark' : 'Bookmark this page';
    if (on !== this.ribbon.classList.contains('is-on')) {
      this.ribbon.classList.toggle('is-on', on);
      if (on && moving()) this.ribbon.animate([{ transform: 'translateY(-100%)' }, { transform: 'none' }], { duration: DUR.move, easing: EASE });
    }
  }

  async toggleBookmark() {
    if (!this.ready) return;
    const existing = this.pageBookmark();
    if (existing) { await this.removeMark(existing); return; }
    const { loc, percent } = this.here;
    let text = '';
    if (this.mode === 'flow') {
      const p = this.pointAt(this.here.off);
      text = p ? p.node.data.slice(p.offset, p.offset + 140).replace(/\s+/g, ' ').trim() : '';
      if (text.length < 40) text = this.flow.textContent.slice(this.here.off, this.here.off + 140).replace(/\s+/g, ' ').trim();
    }
    const temp = { id: `tmp-${Date.now()}`, kind: 'bookmark', loc, percent, text, note: '' };
    this.marks.push(temp);
    this.paintBookmark();
    try {
      const { mark } = await api.post(`/api/books/${this.id}/marks`, { kind: 'bookmark', loc, percent, text });
      Object.assign(temp, mark);
    } catch (err) {
      this.marks = this.marks.filter((m) => m !== temp);
      this.paintBookmark();
      toast(err.message);
    }
  }

  // -------------------------------------------------------- PDFs: printed pages, or reading format

  pdfChoice() {
    this.loading.hidden = true;
    const pages = this.book.pages ? ` Its ${this.book.pages} pages` : ' Its pages';
    const go = h('button', { type: 'button', class: 'btn btn-main' }, 'Turn into reading format');
    const asIs = h('button', { type: 'button', class: 'btn' }, 'Read the printed pages');
    go.addEventListener('click', () => this.convert());
    asIs.addEventListener('click', () => { this.hideCard(); remember(`mutt:pages:${this.id}`, '1'); this.startPages(); });
    this.showCard(h('div', null,
      this.book.cover ? h('img', { class: 'rd-card-cover', src: this.book.cover, alt: '' }) : null,
      h('p', { class: 'rd-card-title' }, 'This book is a PDF'),
      h('p', { class: 'rd-card-text' }, `${pages} are laid out for print. Mutt can turn it into reading format: text that flows to fit your screen, in the type and size you like, with highlights and notes.`),
      h('p', { class: 'rd-card-hint' }, 'Pictures and the printed layout stay in the original, which you can still open.'),
      h('div', { class: 'rd-card-btns' }, asIs, go)));
  }

  async convert() {
    const bar = h('span', { class: 'rd-bar-fill' });
    const label = h('p', { class: 'rd-card-text' }, 'Reading the pages…');
    const stop = h('button', { type: 'button', class: 'btn' }, 'Stop');
    const ctrl = new AbortController();
    stop.addEventListener('click', () => ctrl.abort());
    this.showCard(h('div', null,
      h('p', { class: 'rd-card-title' }, 'Turning it into reading format'),
      label,
      h('div', { class: 'rd-bar' }, bar),
      h('div', { class: 'rd-card-btns' }, stop)));
    try {
      const book = await pdfToBook(this.book.file, {
        signal: ctrl.signal,
        onProgress: (p) => {
          bar.style.width = `${Math.round(p * 100)}%`;
          if (this.book.pages) label.textContent = `Reading page ${Math.max(1, Math.round(p * this.book.pages))} of ${this.book.pages}…`;
        },
      });
      label.textContent = 'Saving…';
      const res = await fetch(`/api/books/${this.id}/text`, {
        method: 'PUT', credentials: 'same-origin', headers: { 'X-Mutt': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(book),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'It couldn’t be saved.');
      this.book.converted = true;
      remember(`mutt:pages:${this.id}`, null);
      this.hideCard();
      this.source = new TextSource(book);
      if (!this.book.author && book.author) this.author.textContent = book.author;
      this.teardownPages();
      this.keepPlace();
      await this.startFlow();
      toast(`Ready to read: ${plural(book.chapters.length, 'chapter')}`);
    } catch (err) {
      if (err.name === 'AbortError') { this.pdfChoice(); return; }
      const msg = err instanceof NoText ? err.message : (err.message || 'It couldn’t be turned into reading format.');
      const asIs = h('button', { type: 'button', class: 'btn btn-main', onclick: () => { this.hideCard(); remember(`mutt:pages:${this.id}`, '1'); this.startPages(); } }, 'Read the printed pages');
      this.showCard(h('div', null,
        h('p', { class: 'rd-card-title' }, 'It couldn’t be turned into reading format'),
        h('p', { class: 'rd-card-text' }, msg),
        h('div', { class: 'rd-card-btns' }, h('button', { type: 'button', class: 'btn', onclick: () => this.close() }, 'Close'), asIs)));
    }
  }

  async toText() {
    if (this.book.converted) {
      remember(`mutt:pages:${this.id}`, null);
      this.teardownPages();
      this.ready = false;
      this.loading.hidden = false;
      this.keepPlace();
      await this.startText();
    } else if (this.book.mine) {
      this.ready = false;
      this.convert();
    }
  }

  async toPages() {
    remember(`mutt:pages:${this.id}`, '1');
    this.ready = false;
    this.flow.replaceChildren();
    this.keepPlace();
    await this.startPages();
  }

  // Switching between printed pages and reading format: keep how far through.
  keepPlace() {
    if (this.here) this.progress = { loc: null, percent: this.here.percent };
  }

  teardownPages() {
    this.sheetEl?.remove();
    this.sheetEl = null;
    this.viewEl.hidden = false;
  }

  pageStep() { return this.el.classList.contains('is-spread') ? 2 : 1; }

  async startPages() {
    this.mode = 'pages';
    this.el.dataset.mode = 'pages';
    this.loading.hidden = false;
    try {
      const pdfjs = await loadPdfjs();
      this.pdf = await pdfjs.getDocument({ url: this.book.file, isEvalSupported: false, withCredentials: true }).promise;
    } catch {
      this.fail('The PDF couldn’t be read.');
      return;
    }
    this.pdfPages = this.pdf.numPages;
    this.outline = await outlineOf(this.pdf);
    this.viewEl.hidden = true;
    this.sheetEl = h('div', { class: 'rd-sheet' });
    this.stage.prepend(this.sheetEl);
    this.layoutPages();
    const loc = this.progress?.loc?.startsWith('p:') ? Number(this.progress.loc.slice(2))
      : Math.round((this.progress?.percent || 0) * (this.pdfPages - 1));
    await this.showPage(loc, { animate: false });
    this.loading.hidden = true;
    this.ready = true;
    this.el.classList.add('is-ready');
    this.chromeTimer = setTimeout(() => this.chrome(false), 1600);
  }

  layoutPages() {
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    this.el.classList.toggle('is-spread', roomForTwo(W, H) && this.settings.pages === 2);
    this.geo = { W, H };
  }

  async showPage(n, { animate = true } = {}) {
    const step = this.pageStep();
    let first = Math.max(0, Math.min(this.pdfPages - 1, n));
    if (step === 2) first = first === 0 ? 0 : first - ((first - 1) % 2); // the cover alone, then pairs
    const dir = Math.sign(first - this.page);
    this.page = first;
    const count = step === 2 && first > 0 ? Math.min(2, this.pdfPages - first) : 1;
    const token = (this.pageToken = (this.pageToken || 0) + 1);
    const { W, H } = this.geo;
    const pad = W < 620 ? 10 : 28;
    const top = W < 620 ? 58 : 66;
    const canvases = [];
    for (let i = 0; i < count; i++) {
      const page = await this.pdf.getPage(first + i + 1);
      if (token !== this.pageToken) return;
      const vp1 = page.getViewport({ scale: 1 });
      const scale = Math.min((W - pad * 2) / (vp1.width * count), (H - top - 52) / vp1.height);
      const dpr = Math.min(2, devicePixelRatio || 1);
      const vp = page.getViewport({ scale: scale * dpr });
      const canvas = h('canvas', { class: 'rd-pdfpage', width: Math.floor(vp.width), height: Math.floor(vp.height) });
      canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
      canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      if (token !== this.pageToken) return;
      canvases.push(canvas);
    }
    this.sheetEl.replaceChildren(...canvases);
    this.sheetEl.style.transform = '';
    if (animate && dir && moving()) {
      this.sheetEl.animate([{ opacity: 0.2, transform: `translateX(${dir * 40}px)` }, { opacity: 1, transform: 'none' }], { duration: DUR.move, easing: EASE });
    }
    this.afterTurn();
  }
}

export { outlineOf };
