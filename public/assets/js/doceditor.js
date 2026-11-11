// Mutt documents: the editor. A note opened as a document fills the screen as
// paper pages hung in the night sky over its planet: a slim frosted toolbar
// above, the outline on the left when asked for, comments in the right margin.
// The page lifts off the desk to open and settles back onto it to close.
//
// Like the rest of Mutt, its tools wait until they're wanted: select words
// and a formatting bubble rises beside them, type "/" on an empty line for
// things to insert, and once you're writing steadily the bars fade back.
//
// The pages are one editable flow. While you write, it's measured and pushed
// apart where a page ends (`paginate`): a block that would cross the bottom
// margin moves to the next page, and a long paragraph is split between its
// lines by a small gap that isn't part of the document (`.de-gap`). Because
// those gaps come and go, the editor keeps its own undo history (snapshots of
// the clean HTML and where the caret was) instead of the browser's.

import { api, sendFile, session } from './api.js';
import { MARGIN_PT, PAGE_SIZES, cleanCopy, cleanHtml, escapeHtml, fromMarkdown, looksLikePoem, toMarkdown } from './docformat.js';
import { docTitle } from './docs.js';
import { exportDocx, exportMarkdown, exportPdf, exportText, pdfMissing, printDoc } from './docexport.js';
import { confirmDialog, openDialog, openMenu, openPopover, segmented, toast } from './ui.js';
import { EASE, bus, debounce, h, plural, reducedMotion, timeAgo } from './util.js';

const moving = () => !reducedMotion();
const PX = 96 / 72;            // screen pixels per point
const GAP = 26;                // between pages on the desk
const SAVE_AFTER = 900;
const GLIDE = 'cubic-bezier(0.32, 0.72, 0, 1)';   // the page's flight to and from the desk
const QUIET_AFTER = 7000;      // steady typing for this long, and the bars fade back
const QUIET_KEYS = 30;

const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const ICONS = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  side: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/>'),
  undo: svg('<path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.5h9.5a5 5 0 0 1 0 10H12"/>'),
  redo: svg('<path d="M15 7l4.5 4.5L15 16"/><path d="M19 11.5H9.5a5 5 0 0 0 0 10H12"/>'),
  bold: svg('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>'),
  italic: svg('<path d="M14 5h-4M14 19h-4M13.5 5l-3 14"/>'),
  underline: svg('<path d="M7 4v7a5 5 0 0 0 10 0V4M5.5 20h13"/>'),
  strike: svg('<path d="M4.5 12h15M16 7.5a4 3 0 0 0-4-2.5c-2.6 0-4 1.3-4 3 0 3.5 8 2.5 8 7 0 1.8-1.7 3-4 3a4.4 3.4 0 0 1-4.3-2.5"/>'),
  color: svg('<path d="M6.5 16L12 4l5.5 12M8.4 12h7.2"/><path class="de-ic-bar" d="M4 20h16"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  comment: svg('<path d="M5 5h14v10H10l-4 4v-4H5z"/>'),
  left: svg('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
  center: svg('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
  right: svg('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
  justify: svg('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>'),
  bullets: svg('<circle cx="5" cy="7" r="1.2"/><circle cx="5" cy="12" r="1.2"/><circle cx="5" cy="17" r="1.2"/><path d="M9 7h11M9 12h11M9 17h11"/>'),
  numbers: svg('<path d="M4 5.5h1.5V10M4 10h3M4 14.5c0-1 2.8-1 2.8.3 0 1.1-2.8 2-2.8 3.2h3"/><path d="M10 7h10M10 12h10M10 17h10"/>'),
  check: svg('<rect x="3.5" y="4.5" width="5" height="5" rx="1"/><path d="M4.5 16.5l1.5 1.5 2.5-3"/><path d="M11 7h9M11 16.5h9"/>'),
  outdent: svg('<path d="M4 5h16M11 10h9M11 14h9M4 19h16M7.5 9.5L4.5 12l3 2.5"/>'),
  indent: svg('<path d="M4 5h16M11 10h9M11 14h9M4 19h16M4.5 9.5l3 2.5-3 2.5"/>'),
  spacing: svg('<path d="M11 6h9M11 12h9M11 18h9M5.5 5v14M3.5 7l2-2 2 2M3.5 17l2 2 2-2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  clear: svg('<path d="M6 5h11M11.5 5L8 19M4 15l7 6M11 15l-7 6"/>'),
  history: svg('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9M12 8v4.5l3 2"/>'),
  download: svg('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>'),
  more: svg('<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  up: svg('<path d="M6 15l6-6 6 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  done: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  type: svg('<path d="M3.5 18L8.5 6l5 12M5.2 14h6.6"/><path d="M20.5 18v-6.2a2.6 2.6 0 0 0-5.2 0M20.5 15.2a2.6 2.8 0 1 1-5.2 0 2.6 2.8 0 0 1 5.2 0z"/>'),
  mark: svg('<path d="M14.5 4.5l5 5L10 19H5v-5z"/><path d="M12 7l5 5"/><path class="de-ic-mark" d="M3.5 21.5h17"/>'),
  heading: svg('<path d="M5 5v14M14 5v14M5 12h9M18 10.5l2-1.5v10"/>'),
  quote: svg('<path d="M5 7v10M9.5 8.5h10M9.5 12h10M9.5 15.5h6"/>'),
  table: svg('<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 10h17M3.5 14.5h17M9.5 5v14M15 5v14"/>'),
  picture: svg('<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4.5 17l5-4.5 3.5 3 3-2.5 4 3.5"/>'),
  line: svg('<path d="M4 12h16"/>'),
  pagebreak: svg('<path d="M6 3.5v5h12v-5M6 20.5v-5h12v5M3.5 12h2M8 12h2.5M13.5 12H16M18.5 12h2"/>'),
  code: svg('<path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5"/>'),
  page: svg('<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4"/>'),
};
const icon = (name) => h('span', { class: 'de-ic', html: ICONS[name] });

const FONT_LABELS = { serif: 'Serif', sans: 'Sans', mono: 'Mono', type: 'Typewriter' };
const STYLE_LABELS = { p: 'Normal text', title: 'Title', subtitle: 'Subtitle', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', quote: 'Quote', pre: 'Code' };
const INKS = ['#1d1b18', '#5c5852', '#9a948a', '#b3261e', '#c45a16', '#9a6b00', '#2e7d32', '#00796b', '#1f5fbf', '#5b3cc4', '#8e2a72'];
const MARKS = ['#fff1a8', '#d7f5c3', '#cfe6ff', '#ffd6e5', '#e6dbff', '#ffe0c2'];
const SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 24];

let fontsAsked = false;
function loadFonts() {
  if (fontsAsked) return;
  fontsAsked = true;
  document.head.append(h('link', {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700&family=Courier+Prime:ital,wght@0,400;0,700;1,400;1,700&display=swap',
  }));
}

// ------------------------------------------------------------ places in the text

// A place in the document as one number, so it survives the page gaps coming
// and going (and an undo putting the HTML back).
const BLOCKISH = /^(P|H[1-6]|LI|BLOCKQUOTE|PRE|TR|TD|TH|DIV|FIGURE|FIGCAPTION|UL|OL|TABLE)$/;
const SOLID = /^(BR|IMG|HR)$/;

function posOf(root, container, offset) {
  let pos = 0;
  let found = null;
  const visit = (node) => {
    if (found !== null) return;
    if (node.nodeType === 3) {
      if (node === container) { found = pos + offset; return; }
      pos += node.length;
      return;
    }
    if (node.nodeType !== 1 || node.classList.contains('de-gap')) return;
    if (node !== root && BLOCKISH.test(node.tagName)) pos += 1;
    if (SOLID.test(node.tagName)) { pos += 1; return; }
    const kids = node.childNodes;
    for (let i = 0; i < kids.length; i++) {
      if (node === container && i === offset) { found = pos; return; }
      visit(kids[i]);
      if (found !== null) return;
    }
    if (node === container) found = pos;
  };
  visit(root);
  return found ?? pos;
}

function pointAt(root, pos) {
  let left = pos;
  let result = null;
  let last = null;
  const visit = (node) => {
    if (result) return;
    if (node.nodeType === 3) {
      last = [node, node.length];
      if (left <= node.length) result = [node, left];
      else left -= node.length;
      return;
    }
    if (node.nodeType !== 1 || node.classList.contains('de-gap')) return;
    if (node !== root && BLOCKISH.test(node.tagName)) left -= 1;
    if (SOLID.test(node.tagName)) {
      const i = [...node.parentNode.childNodes].indexOf(node);
      if (left <= 0) { result = [node.parentNode, i]; return; }
      left -= 1;
      last = [node.parentNode, i + 1];
      return;
    }
    if (left < 0) { result = [node, 0]; return; }
    for (const kid of node.childNodes) { visit(kid); if (result) return; }
    if (left === 0 && !result && node !== root) result = [node, node.childNodes.length];
  };
  visit(root);
  return result || last || [root, root.childNodes.length];
}

// The words of the document as one string, with a map back to its text.
function textIndex(root) {
  const nodes = [];
  let text = '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest('.de-gap') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push({ node: n, start: text.length });
    text += n.data;
  }
  const at = (i, end = false) => {
    let lo = 0;
    let hi = nodes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (nodes[mid].start < i || (!end && nodes[mid].start === i)) lo = mid; else hi = mid - 1;
    }
    const n = nodes[lo];
    return n ? [n.node, Math.min(n.node.length, i - n.start)] : [root, 0];
  };
  const range = (from, to) => {
    const r = document.createRange();
    r.setStart(...at(from));
    r.setEnd(...at(to, true));
    return r;
  };
  return { text, range };
}

const words = (text) => (text.match(/\S+/g) || []).length;

// ------------------------------------------------------------ the editor

let openOne = null;

export async function openDocEditor(id, opts = {}) {
  if (openOne) {
    if (openOne.id === id) return openOne;
    await openOne.close({ switching: true });
  }
  openOne = new DocEditor(id, opts);
  await openOne.open();
  return openOne;
}

export const docEditorOpen = () => openOne;

class DocEditor {
  constructor(id, { drawer = null, onClose, fresh = false, card = null } = {}) {
    this.id = id;
    this.drawer = drawer;
    this.onClose = onClose;
    this.fresh = fresh;
    this.cardOf = card;          // (id) => this document's page on the desk, if it's there
    this.sheetCount = 0;
    this.run = { from: 0, last: 0, keys: 0 };
    this.off = [];
    this.history = [];
    this.at = -1;
    this.comments = [];
    this.showDone = false;
    this.dirty = false;
    this.typed = false;
    this.saveSoon = debounce(() => this.save(), SAVE_AFTER);
    this.layoutSoon = debounce(() => this.layout(), 70);
    this.recordSoon = debounce(() => this.record(), 650);
    this.marksSoon = debounce(() => this.paintMarks(), 120);
  }

  // -------------------------------------------------------- building

  build() {
    const btn = (name, label, run, extra = {}) => {
      const b = h('button', { type: 'button', class: 'de-btn', 'aria-label': label, title: label, ...extra }, icon(name));
      b.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') e.preventDefault(); });
      b.addEventListener('click', (e) => run(e, b));
      return b;
    };
    this.btn = btn;

    // Top: back to the planet, the name, how it's saved, and the document's tools.
    this.titleIn = h('input', { class: 'de-name', type: 'text', maxlength: '200', placeholder: 'Untitled document', 'aria-label': 'Document name', spellcheck: 'false' });
    this.status = h('span', { class: 'de-status', 'aria-live': 'polite' });
    this.commentsBtn = btn('comment', 'Comments', () => this.togglePanel('comments'));
    this.commentsCount = h('span', { class: 'de-count' });
    this.commentsBtn.append(this.commentsCount);
    const back = h('button', { type: 'button', class: 'de-back', 'aria-label': this.drawer ? `Back to ${this.drawer.title}` : 'Close the document' },
      icon('back'), this.drawer ? h('span', { class: 'de-back-name' }, this.drawer.title) : h('span', { class: 'de-back-name' }, 'Close'));
    back.addEventListener('click', () => this.close());
    this.sideBtn = btn('side', 'Outline', () => this.toggleSide());
    this.historyBtn = btn('history', 'Version history', () => this.togglePanel('history'));
    this.downloadBtn = btn('download', 'Download', (e, b) => this.downloadMenu(b));
    this.moreBtn = btn('more', 'More', (e, b) => this.moreMenu(b));
    this.top = h('header', { class: 'de-top' },
      back, this.sideBtn,
      h('div', { class: 'de-heading' }, this.titleIn),
      h('div', { class: 'de-top-tools' }, this.status, this.commentsBtn, this.historyBtn, this.downloadBtn, this.moreBtn));

    this.tools = h('div', { class: 'de-tools fglass', role: 'toolbar', 'aria-label': 'Formatting' });
    this.flow = h('div', { class: 'de-flow', spellcheck: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Document' });
    this.sheets = h('div', { class: 'de-sheets', 'aria-hidden': 'true' });
    this.stack = h('div', { class: 'de-stack' }, this.sheets, this.flow);
    this.rail = h('div', { class: 'de-rail', 'aria-label': 'Comments' });
    this.canvas = h('div', { class: 'de-canvas' }, this.stack, this.rail);
    this.desk = h('div', { class: 'de-desk' }, this.canvas);

    this.side = h('aside', { class: 'de-side fglass', 'aria-label': 'Outline' });
    this.panel = h('aside', { class: 'de-panel fglass', hidden: true });
    this.findBar = h('div', { class: 'de-find fglass', hidden: true, role: 'search' });
    this.selBar = h('div', { class: 'de-selbar', hidden: true, role: 'toolbar', 'aria-label': 'Selected words' });
    this.slash = h('div', { class: 'de-slash fglass', hidden: true, role: 'listbox', 'aria-label': 'Insert' });
    // A point for menus to hang from when they belong to a place in the text.
    this.spot = h('span', { class: 'de-spot', 'aria-hidden': 'true' });
    // The night behind the pages: the galaxy's own sky, and the planet's edge below.
    this.bg = h('div', { class: 'de-bg', 'aria-hidden': 'true' }, h('i', { class: 'de-limb' }));
    this.banner = h('div', { class: 'de-banner fglass', hidden: true });
    this.countBtn = h('button', { type: 'button', class: 'de-wc' });
    this.countBtn.addEventListener('click', () => this.countDetails());
    this.loading = h('div', { class: 'de-loading' }, h('span', { class: 'de-spin' }));

    this.el = h('div', { class: 'de', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Document' },
      this.bg, this.top, this.tools,
      h('div', { class: 'de-main' }, this.side, this.desk, this.panel),
      this.findBar, this.banner, this.selBar, this.slash, this.spot, this.countBtn, this.loading);
  }

  async open() {
    loadFonts();
    this.build();
    this.prevFocus = document.activeElement;
    document.body.append(this.el);
    document.documentElement.classList.add('is-writing');
    const card = this.cardOf?.(this.id) || null;
    if (moving()) {
      // The sky dims, then the bars drop in one after another. Each fades by
      // itself, so the glass keeps its frost all the way through.
      const drop = (el, delay) => el.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay, easing: EASE, fill: 'backwards' });
      this.bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 520, easing: 'ease-out' });
      this.bg.firstChild.animate([{ transform: 'translate(-50%, 70px)' }, { transform: 'translate(-50%, 0)' }], { duration: 1100, easing: EASE });
      drop(this.top, 140);
      drop(this.tools, 210);
      this.countBtn.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 420, easing: EASE, fill: 'backwards' });
    }
    try {
      const data = await api.get(`/api/docs/${this.id}`);
      this.block = data.block;
      this.doc = data.doc;
      this.mine = data.doc.mine;
      this.comments = data.comments || [];
      this.settings = { ...data.doc.settings };
      this.titleIn.value = this.block.title || '';
      this.titleIn.placeholder = docTitle({ ...this.block, title: '' });
      this.titleIn.readOnly = !this.mine;
      const html = data.doc.html || fromMarkdown(this.block.content || '');
      this.flow.innerHTML = cleanHtml(html, { own: true });
      if (!this.flow.firstChild) this.flow.append(h('p', null, h('br')));
      this.flow.contentEditable = this.mine ? 'true' : 'false';
      this.el.classList.toggle('is-reading-only', !this.mine);
      this.historyBtn.hidden = !this.mine;
      this.buildTools();
      this.applySettings();
      this.renderSide();
      this.wire();
      this.record();
      this.setStatus(this.mine ? `Saved ${timeAgo(this.doc.savedAt)}` : `@${this.block.owner}’s document`);
      await document.fonts?.ready;
      this.layout();
      this.loading.hidden = true;
      this.arrive(card);
      this.settled = true;
      if (this.mine) {
        const end = this.fresh || !this.block.content?.trim();
        this.flow.focus({ preventScroll: true });
        if (end) this.placeCaret(posOf(this.flow, this.flow, this.flow.childNodes.length));
        else this.placeCaret(0);
      }
    } catch (err) {
      this.loading.hidden = true;
      this.desk.replaceChildren(h('div', { class: 'de-fail' },
        h('p', { class: 'de-fail-title' }, 'This document couldn’t be opened'),
        h('p', null, err.message || ''),
        h('button', { type: 'button', class: 'vbtn vbtn-glass', onclick: () => this.close() }, 'Close')));
    }
    return this;
  }

  // -------------------------------------------------------- the toolbar

  buildTools() {
    if (!this.mine) { this.tools.hidden = true; return; }
    const b = this.btn;
    const sep = () => h('span', { class: 'de-sep' });
    const pick = (cls, label, run) => {
      const el = h('button', { type: 'button', class: `de-pick ${cls}`, title: label, 'aria-label': label, 'aria-haspopup': 'menu' });
      el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') e.preventDefault(); });
      el.addEventListener('click', () => run(el));
      return el;
    };
    this.styleBtn = pick('de-pick-style', 'Text style', (el) => this.styleMenu(el));
    this.toggles = {
      bold: b('bold', 'Bold (⌘B)', () => this.exec('bold')),
      italic: b('italic', 'Italic (⌘I)', () => this.exec('italic')),
      underline: b('underline', 'Underline (⌘U)', () => this.exec('underline')),
    };
    this.typeBtn = b('type', 'Type, colour and spacing', (e, el) => this.typePanel(el), { 'aria-haspopup': 'dialog' });
    this.contextTools = h('span', { class: 'de-context' });
    // Only what's reached for all the time. Typeface, size, colour, alignment
    // and spacing are one panel (Aa); links and comments come up beside the
    // words you select; a table's or a picture's tools show while you're in one.
    this.tools.append(
      b('undo', 'Undo (⌘Z)', () => this.undo()), b('redo', 'Redo (⇧⌘Z)', () => this.redo()), sep(),
      this.styleBtn, sep(),
      ...Object.values(this.toggles), sep(),
      b('bullets', 'Bulleted list', () => this.list('ul')), b('numbers', 'Numbered list', () => this.list('ol')), b('check', 'Checklist', () => this.list('check')), sep(),
      b('plus', 'Insert (or type / on an empty line)', (e, el) => this.insertMenu(el)), this.typeBtn,
      this.contextTools);
  }

  // What the toolbar shows for where the caret is.
  syncTools() {
    if (!this.mine || !this.styleBtn) return;
    const block = this.blockAtCaret();
    this.styleBtn.textContent = STYLE_LABELS[this.styleOf(block)] || 'Normal text';
    const sel = getSelection();
    const anchor = sel.anchorNode?.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
    for (const [cmd, el] of Object.entries(this.toggles)) el.classList.toggle('is-on', this.state(cmd));
    // Tools that only make sense where you are: in a table, or on a picture.
    const cell = anchor?.closest?.('td, th');
    const picked = this.flow.querySelector('img.is-picked');
    const key = cell && this.flow.contains(cell) ? 'table' : picked ? 'img' : '';
    if (this.contextTools.dataset.key === key) return;
    this.contextTools.dataset.key = key;
    const word = (label, run, title = label) => {
      const el = h('button', { type: 'button', class: 'de-word', title }, label);
      el.addEventListener('pointerdown', (e) => e.preventDefault());
      el.addEventListener('click', run);
      return el;
    };
    if (key === 'table') {
      this.contextTools.replaceChildren(h('span', { class: 'de-sep' }), h('span', { class: 'de-ctx-label' }, 'Table'),
        word('+ Row', () => this.tableEdit('row-below'), 'Add a row below'),
        word('+ Column', () => this.tableEdit('col-right'), 'Add a column to the right'),
        word('− Row', () => this.tableEdit('row-del'), 'Delete this row'),
        word('− Column', () => this.tableEdit('col-del'), 'Delete this column'),
        word('Delete table', () => this.tableEdit('table-del')));
    } else if (key === 'img') {
      this.contextTools.replaceChildren(h('span', { class: 'de-sep' }), h('span', { class: 'de-ctx-label' }, 'Picture'),
        ...[['S', 33], ['M', 50], ['L', 75], ['Full', 100]].map(([l, w]) => word(l, () => this.sizePicture(w), `${w}% wide`)),
        word('Delete', () => this.deletePicture()));
    } else {
      this.contextTools.replaceChildren();
    }
    if (key && moving()) {
      [...this.contextTools.children].forEach((el, n) => el.animate([{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, delay: n * 24, easing: EASE, fill: 'backwards' }));
      this.contextTools.lastChild?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }

  state(cmd) {
    try { return document.queryCommandState(cmd); } catch { return false; }
  }

  // What the words at the caret are set in.
  typeAt() {
    const sel = getSelection();
    const node = sel.anchorNode && this.inFlow(sel.anchorNode) ? sel.anchorNode : this.range?.startContainer;
    const at = node ? (node.nodeType === 3 ? node.parentElement : node) : null;
    const block = this.blockAtCaret();
    if (!at || !this.flow.contains(at)) return { font: this.settings.font, size: this.settings.size, align: 'left' };
    const cs = getComputedStyle(at);
    const fam = cs.fontFamily || '';
    const align = block ? getComputedStyle(block).textAlign : 'left';
    return {
      font: /Courier Prime/.test(fam) ? 'type' : /Mono/.test(fam) ? 'mono' : /Red Hat Text/.test(fam) ? 'sans' : 'serif',
      size: Math.round(parseFloat(cs.fontSize) / PX),
      align: align === 'start' ? 'left' : align,
    };
  }

  // -------------------------------------------------------- settings and pages

  applySettings() {
    const s = this.settings;
    const poem = s.layout === 'poem' || (s.layout === 'auto' && (this.doc.reads === 'poem' || (!this.doc.reads && looksLikePoem(this.flow))));
    this.flow.classList.toggle('is-poem', poem);
    this.nameOnPage();
    this.flow.dataset.font = s.font;
    this.flow.style.setProperty('--de-size', `${s.size * PX}px`);
    this.flow.style.setProperty('--de-lh', String(poem ? Math.max(1.5, s.spacing * 1.25) : s.spacing * 1.25));
    this.el.dataset.view = s.view;
    this.layout();
  }

  dims() {
    const s = this.settings;
    const [wPt, hPt] = PAGE_SIZES[s.page] || PAGE_SIZES.a4;
    const room = this.desk.clientWidth - (innerWidth < 700 ? 16 : 64);
    const W = Math.round(wPt * PX);
    const scale = Math.min(1, room / W);
    const fit = Math.round(W * scale);
    const m = (MARGIN_PT[s.margins] || 72) * PX * (scale < 1 ? Math.max(0.3, scale * 0.8) : 1);
    return { W: fit, H: Math.round(hPt * PX * scale), mx: Math.round(m), mt: Math.round(m), mb: Math.round(m) };
  }

  clearGaps() {
    for (const gap of this.flow.querySelectorAll('.de-gap')) {
      const parent = gap.parentNode;
      gap.remove();
      parent?.normalize();
    }
    for (const el of this.flow.querySelectorAll('[data-push]')) {
      el.style.removeProperty('margin-top');
      el.style.removeProperty('height');
      el.removeAttribute('data-push');
      if (!el.getAttribute('style')) el.removeAttribute('style');
    }
  }

  layout() {
    if (!this.settings || this.composing) return;
    const d = this.dims();
    this.d = d;
    this.stack.style.width = `${d.W}px`;
    this.flow.style.padding = `${d.mt}px ${d.mx}px ${d.mb}px`;
    this.layoutPoem(d);
    this.clearGaps();
    let pages = 1;
    if (this.settings.view === 'pages') pages = this.paginate(d);
    const total = this.settings.view === 'pages' ? pages * d.H + (pages - 1) * GAP : Math.max(d.H, this.flow.scrollHeight);
    this.flow.style.minHeight = `${total}px`;
    this.pages = pages;
    this.drawSheets(d, pages, total);
    this.updateCount();
    this.renderOutline();
    this.marksSoon();
  }

  // A poem sits as one block in the middle of the page, its lines as written.
  layoutPoem(d) {
    if (!this.flow.classList.contains('is-poem')) { this.flow.style.removeProperty('--poem-in'); return; }
    this.flow.classList.add('is-measuring');
    let longest = 0;
    for (const el of this.flow.children) {
      if (el.tagName === 'P' || el.tagName === 'BLOCKQUOTE') longest = Math.max(longest, el.getBoundingClientRect().width);
    }
    this.flow.classList.remove('is-measuring');
    const inner = d.W - d.mx * 2;
    this.flow.style.setProperty('--poem-in', `${Math.max(0, Math.min(inner * 0.4, (inner - longest) / 2))}px`);
  }

  paginate(d) {
    const pitch = d.H + GAP;
    const bottom = (p) => p * pitch + d.H - d.mb;
    const top = (p) => p * pitch + d.mt;
    const base = this.flow.getBoundingClientRect().top;
    const rel = (el) => { const r = el.getBoundingClientRect(); return { top: r.top - base, bottom: r.bottom - base, height: r.height }; };
    const push = (el, to) => {
      for (let i = 0; i < 3; i++) {
        const now = rel(el).top;
        const by = to - now;
        if (Math.abs(by) < 0.5) return;
        const m = parseFloat(getComputedStyle(el).marginTop) || 0;
        el.style.marginTop = `${Math.max(0, m + by)}px`;
        el.dataset.push = '';
      }
    };
    let p = 0;
    for (const el of [...this.flow.children]) {
      if (el.classList.contains('pb')) {
        const r = rel(el);
        el.style.height = `${Math.max(0, top(p + 1) - r.top)}px`;
        el.dataset.push = '';
        p++;
        continue;
      }
      for (let guard = 0; guard < 400; guard++) {
        const r = rel(el);
        if (r.bottom <= bottom(p) + 0.5 || r.height === 0) break;
        if (r.top >= bottom(p) - 1) {
          if (r.top < top(p + 1)) push(el, top(p + 1));
          p++;
          continue;
        }
        if (!/^(TABLE|FIGURE|HR|IMG)$/.test(el.tagName) && !(el.tagName === 'P' && el.querySelector('img') && !el.textContent.trim())
            && this.split(el, bottom(p), top(p + 1), base)) { p++; continue; }
        if (r.height > d.H - d.mt - d.mb || r.top <= top(p) + 1) {
          while (r.bottom > bottom(p)) p++;
          break;
        }
        push(el, top(p + 1));
        p++;
      }
    }
    const last = this.flow.lastElementChild;
    if (last) { const r = rel(last); while (r.bottom > bottom(p) + 0.5) p++; }
    return p + 1;
  }

  // Split a block where its line crosses the page's bottom margin.
  split(el, limit, next, base) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.length) continue;
      range.selectNodeContents(node);
      const whole = range.getBoundingClientRect();
      if (whole.bottom - base <= limit + 0.5) continue;
      for (let i = 0; i < node.length; i++) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rects = range.getClientRects();
        if (!rects.length) continue;
        const cr = rects[rects.length - 1];
        if (cr.bottom - base <= limit + 0.5 || !cr.height) continue;
        const inner = node.parentElement.closest('p, li, h1, h2, h3, h4, blockquote, pre, div, td') || el;
        const lh = parseFloat(getComputedStyle(inner).lineHeight) || cr.height;
        const lead = Math.max(0, (lh - cr.height) / 2);
        const lineTop = cr.top - base - lead;
        // The first line of an inner block (a list item, a quote's paragraph): move the block itself.
        const before = document.createRange();
        before.setStart(inner, 0);
        before.setEnd(node, i);
        if (!before.toString().trim()) {
          if (inner === el) return false;
          const m = parseFloat(getComputedStyle(inner).marginTop) || 0;
          inner.style.marginTop = `${m + (next - lineTop)}px`;
          inner.dataset.push = '';
          return true;
        }
        const gap = h('span', { class: 'de-gap', contenteditable: 'false' });
        const after = i > 0 ? node.splitText(i) : node;
        after.parentNode.insertBefore(gap, after);
        gap.style.height = `${Math.max(0, next - lineTop)}px`;
        return true;
      }
    }
    return false;
  }

  drawSheets(d, pages, total) {
    const s = this.settings;
    const sheets = [];
    const n = s.view === 'pages' ? pages : 1;
    for (let i = 0; i < n; i++) {
      const sheet = h('div', { class: 'de-sheet', style: { top: `${i * (d.H + GAP)}px`, height: `${s.view === 'pages' ? d.H : total}px` } });
      const mark = (cls, text) => h('span', { class: cls, style: { '--m': `${d.mx}px`, '--mt': `${d.mt}px` } }, text);
      if (s.header) sheet.append(mark('de-sheet-head', s.header));
      if (s.view === 'pages' && (s.footer || s.numbers !== 'off')) {
        sheet.append(h('span', { class: `de-sheet-foot is-${s.numbers}`, style: { '--m': `${d.mx}px`, '--mb': `${d.mb}px` } },
          h('span', null, s.footer || ''), s.numbers !== 'off' ? h('span', { class: 'de-num' }, String(i + 1)) : null));
      }
      sheets.push(sheet);
    }
    this.sheets.replaceChildren(...sheets);
    this.stack.style.height = `${total}px`;
    // A new page slides out from under the one before it.
    if (this.settled && moving() && n > this.sheetCount && !this.previewing) {
      sheets.slice(this.sheetCount).forEach((sheet, i) => {
        sheet.animate([{ transform: `translateY(${-(GAP + 46)}px) scale(0.985)` }, { transform: 'none' }], { duration: 640, delay: i * 60, easing: EASE, fill: 'backwards' });
        sheet.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: i * 60, fill: 'backwards' });
      });
    }
    this.sheetCount = n;
  }

  // -------------------------------------------------------- to and from the desk

  // Where the page-shaped window of the stack that's on screen sits, and how
  // to map it onto `card` (this document's page on the planet's desk).
  flight(card) {
    const c = card.getBoundingClientRect();
    const st = this.stack.getBoundingClientRect();
    if (!c.width || !st.width || c.bottom < 0 || c.top > innerHeight || c.right < 0 || c.left > innerWidth) return null;
    const desk = this.desk.getBoundingClientRect();
    const k = c.width / st.width;
    const winTop = Math.max(0, desk.top - st.top);
    const winH = Math.min(st.height - winTop, c.height / k);
    const below = Math.max(0, st.height - winTop - winH);
    return {
      c, k,
      small: { transform: `translate(${c.left - st.left}px, ${c.top - st.top - k * winTop}px) scale(${k})`, clipPath: `inset(${winTop}px 0px ${below}px 0px round ${7 / k}px)` },
      big: { transform: 'translate(0px, 0px) scale(1)', clipPath: 'inset(-90px -90px -90px -90px round 10px)' },
      ghostBig: `translate(${st.left - c.left}px, ${st.top + winTop - c.top}px) scale(${1 / k})`,
    };
  }

  // The desk's own little page, laid over the real one so the words cross-fade.
  ghostOf(card, f) {
    const ghost = card.cloneNode(true);
    ghost.classList.add('de-ghost');
    Object.assign(ghost.style, { left: `${f.c.left}px`, top: `${f.c.top}px`, width: `${f.c.width}px`, height: `${f.c.height}px`, opacity: '' });
    for (const v of ['--k', '--pc']) ghost.style.setProperty(v, getComputedStyle(card).getPropertyValue(v));
    this.el.append(ghost);
    return ghost;
  }

  // Opening: the page lifts off the desk and grows into the sheet. With no
  // page to lift (a reload, a link), it rises into place.
  arrive(card) {
    if (!moving()) return;
    const f = card?.isConnected ? this.flight(card) : null;
    if (!f) {
      this.stack.animate([{ opacity: 0, transform: 'translateY(34px) scale(0.985)' }, { opacity: 1, transform: 'none' }], { duration: 720, easing: EASE });
      return;
    }
    const ghost = this.ghostOf(card, f);
    card.style.opacity = '0';
    this.el.classList.add('is-flying');
    const opts = { duration: 760, easing: GLIDE };
    // The little page's words fade off the paper, then the real ones fade on,
    // so the two sizes of type are never seen together.
    ghost.animate([{ transform: 'none' }, { transform: f.ghostBig }], opts);
    ghost.firstElementChild?.animate([{ opacity: 1 }, { opacity: 0, offset: 0.2 }, { opacity: 0 }], { duration: 760 });
    ghost.animate([{ opacity: 1 }, { opacity: 1, offset: 0.2 }, { opacity: 0, offset: 0.36 }, { opacity: 0 }], { duration: 760 });
    this.flow.animate([{ opacity: 0 }, { opacity: 0, offset: 0.24 }, { opacity: 1, offset: 0.62 }, { opacity: 1 }], { duration: 760 });
    this.stack.animate([f.small, f.big], opts).finished.catch(() => {}).then(() => {
      ghost.remove();
      this.el.classList.remove('is-flying');
    });
  }

  // Closing: back down onto its place on the desk, if that's in sight.
  async depart() {
    if (!moving()) return;
    this.el.classList.add('is-closing');
    const card = this.cardOf?.(this.id);
    // Let the page out from behind the bars without losing how far it's scrolled.
    const scrolled = this.desk.scrollTop;
    this.el.classList.add('is-flying');
    this.canvas.style.marginTop = `${-scrolled}px`;
    const f = card?.isConnected && this.d ? this.flight(card) : null;
    if (!f) {
      await this.stack.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(26px) scale(0.985)' }], { duration: 300, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }).finished.catch(() => {});
      return;
    }
    const ghost = this.ghostOf(card, f);
    card.style.opacity = '0';
    const opts = { duration: 620, easing: GLIDE, fill: 'forwards' };
    ghost.animate([{ transform: f.ghostBig }, { transform: 'none' }], opts);
    ghost.firstElementChild?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration: 620, fill: 'forwards' });
    ghost.animate([{ opacity: 0 }, { opacity: 0, offset: 0.2 }, { opacity: 1, offset: 0.42 }, { opacity: 1 }], { duration: 620, fill: 'forwards' });
    this.flow.animate([{ opacity: 1 }, { opacity: 0, offset: 0.3 }, { opacity: 0 }], { duration: 620, fill: 'forwards' });
    await this.stack.animate([f.big, f.small], opts).finished.catch(() => {});
    card.style.opacity = '';
  }

  // -------------------------------------------------------- caret and selection

  inFlow(node) { return node && this.flow.contains(node.nodeType === 3 ? node.parentNode : node); }

  remember() {
    const sel = getSelection();
    if (sel.rangeCount && this.inFlow(sel.anchorNode)) this.range = sel.getRangeAt(0).cloneRange();
  }

  restore() {
    if (!this.range || !this.flow.contains(this.range.startContainer)) return;
    const sel = getSelection();
    if (document.activeElement !== this.flow) this.flow.focus({ preventScroll: true });
    sel.removeAllRanges();
    sel.addRange(this.range);
  }

  caret() {
    const sel = getSelection();
    if (!sel.rangeCount || !this.inFlow(sel.anchorNode)) return null;
    const r = sel.getRangeAt(0);
    return { start: posOf(this.flow, r.startContainer, r.startOffset), end: posOf(this.flow, r.endContainer, r.endOffset) };
  }

  placeCaret(start, end = start) {
    const r = document.createRange();
    try {
      r.setStart(...pointAt(this.flow, start));
      r.setEnd(...pointAt(this.flow, end));
    } catch { return; }
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    this.range = r.cloneRange();
  }

  blockAtCaret() {
    const sel = getSelection();
    const node = sel.anchorNode && this.inFlow(sel.anchorNode) ? sel.anchorNode : this.range?.startContainer;
    if (!node) return null;
    let el = node.nodeType === 3 ? node.parentElement : node;
    while (el && el.parentElement !== this.flow && el !== this.flow) {
      if (el.tagName === 'LI' || el.tagName === 'TD' || el.tagName === 'TH') return el;
      el = el.parentElement;
    }
    return el === this.flow ? null : el;
  }

  styleOf(block) {
    if (!block) return 'p';
    if (block.classList.contains('title')) return 'title';
    if (block.classList.contains('subtitle')) return 'subtitle';
    const tag = block.tagName.toLowerCase();
    if (/^h[1-3]$/.test(tag)) return tag;
    if (tag === 'h4') return 'h3';
    if (tag === 'blockquote') return 'quote';
    if (tag === 'pre') return 'pre';
    return 'p';
  }

  // The top-level blocks the selection touches.
  selectedBlocks() {
    this.restore();
    const r = this.range;
    if (!r) return [];
    const top = (node) => {
      let el = node.nodeType === 3 ? node.parentNode : node;
      if (el === this.flow) el = this.flow.childNodes[Math.min(r.startOffset, this.flow.childNodes.length - 1)];
      while (el && el.parentNode !== this.flow) el = el.parentNode;
      return el;
    };
    const first = top(r.startContainer);
    const last = top(r.endContainer);
    const out = [];
    for (let el = first; el; el = el.nextElementSibling) {
      out.push(el);
      if (el === last) break;
    }
    return out.filter((el) => el.nodeType === 1);
  }

  // -------------------------------------------------------- changing it

  exec(cmd, value = null) {
    this.restore();
    this.record();
    try { document.execCommand('styleWithCSS', false, cmd !== 'bold' && cmd !== 'italic' && cmd !== 'underline' && cmd !== 'strikeThrough'); } catch { /* fine */ }
    document.execCommand(cmd, false, value);
    this.changed({ now: true });
  }

  setStyle(kind) {
    const where = this.caret();
    const blocks = this.selectedBlocks();
    if (!blocks.length) return;
    this.record();
    for (const el of blocks) {
      if (/^(UL|OL|TABLE|HR|FIGURE)$/.test(el.tagName) || el.classList.contains('pb')) continue;
      const tag = kind === 'title' || kind === 'subtitle' ? 'p' : kind === 'quote' ? 'blockquote' : kind;
      const next = document.createElement(tag);
      const align = el.style.textAlign;
      if (align) next.style.textAlign = align;
      if (el.style.marginLeft && tag === 'p') next.style.marginLeft = el.style.marginLeft;
      if (kind === 'title' || kind === 'subtitle') next.className = kind;
      if (tag === 'pre') next.textContent = el.innerText;
      else if (el.tagName === 'PRE') next.innerHTML = escapeHtml(el.textContent).replace(/\n/g, '<br>');
      else next.append(...el.childNodes);
      if (!next.firstChild) next.append(h('br'));
      el.replaceWith(next);
    }
    if (where) this.placeCaret(where.start, where.end);
    this.changed({ now: true });
  }

  align(side) { this.exec(`justify${side}`); }

  list(kind) {
    this.restore();
    const inList = this.blockAtCaret()?.closest('ul, ol');
    if (kind === 'check') {
      if (inList?.classList.contains('check')) { this.exec('insertUnorderedList'); return; }
      if (inList?.tagName === 'UL') { this.record(); inList.classList.add('check'); this.changed({ now: true }); return; }
      this.exec(inList?.tagName === 'OL' ? 'insertOrderedList' : 'insertUnorderedList');
      if (inList?.tagName === 'OL') this.exec('insertUnorderedList');
      this.blockAtCaret()?.closest('ul')?.classList.add('check');
      this.changed({ now: true });
      return;
    }
    if (kind === 'ul' && inList?.classList.contains('check')) { this.record(); inList.classList.remove('check'); this.changed({ now: true }); return; }
    this.exec(kind === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
  }

  indent(dir) {
    this.restore();
    if (this.blockAtCaret()?.closest('li')) { this.exec(dir > 0 ? 'indent' : 'outdent'); return; }
    this.record();
    for (const el of this.selectedBlocks()) {
      if (/^(UL|OL|TABLE|HR)$/.test(el.tagName)) continue;
      const now = parseFloat(el.style.marginLeft) || 0;
      const next = Math.max(0, Math.min(288, now + dir * 36));
      if (next) el.style.marginLeft = `${next}px`; else el.style.removeProperty('margin-left');
      if (!el.getAttribute('style')) el.removeAttribute('style');
    }
    this.changed({ now: true });
  }

  clearFormat() {
    this.exec('removeFormat');
    this.setStyle('p');
  }

  insertHtml(html) {
    this.restore();
    this.record();
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const blocky = [...tpl.content.children].some((n) => /^(P|H[1-6]|UL|OL|TABLE|BLOCKQUOTE|PRE|HR|DIV|FIGURE)$/.test(n.tagName));
    const sel = getSelection();
    const r = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (!blocky || !r || !this.inFlow(r.startContainer)) {
      document.execCommand('insertHTML', false, html);
      this.changed({ now: true });
      return;
    }
    // Blocks go between the two halves of the block the caret is in, so a
    // pasted paragraph never merges into the heading (or list) around it.
    r.deleteContents();
    let top = r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer;
    if (top === this.flow) top = this.flow.childNodes[r.startOffset] || null;
    while (top && top.parentElement !== this.flow) top = top.parentElement;
    const nodes = [...tpl.content.childNodes];
    const last = nodes[nodes.length - 1];
    const solid = (el) => el && (el.textContent.replace(/​/g, '').trim() || el.querySelector?.('img, table, hr'));
    if (!top) {
      this.flow.append(tpl.content);
    } else {
      const tail = document.createRange();
      tail.setStart(r.startContainer, r.startOffset);
      tail.setEnd(top, top.childNodes.length);
      const rest = top.cloneNode(false);
      rest.append(tail.extractContents());
      if (solid(top)) top.after(tpl.content); else top.replaceWith(tpl.content);
      if (solid(rest)) last.after(rest);
    }
    const into = last.nodeType === 1 && !/^(HR|TABLE|DIV)$/.test(last.tagName) ? last : last.nextSibling || last;
    const c = document.createRange();
    c.selectNodeContents(into);
    c.collapse(false);
    sel.removeAllRanges();
    sel.addRange(c);
    this.changed({ now: true });
  }

  // -------------------------------------------------------- menus

  styleMenu(anchor) {
    const current = this.styleOf(this.blockAtCaret());
    openMenu(anchor, Object.entries(STYLE_LABELS).map(([k, label]) => ({
      label, hint: k === current ? '✓' : null, run: () => this.setStyle(k === 'quote' ? 'quote' : k),
    })), { className: 'de-menu de-style-menu' });
  }

  sizeSelection(pt) {
    this.exec('fontSize', '7');
    for (const el of this.flow.querySelectorAll('[style*="xxx-large"], font[size="7"]')) {
      if (el.tagName === 'FONT') {
        const span = h('span', { style: { 'font-size': `${pt}pt` } });
        span.append(...el.childNodes);
        el.replaceWith(span);
      } else el.style.fontSize = `${pt}pt`;
    }
    this.changed({ now: true });
  }

  // Aa: how the words look. It changes the selected words, or the whole
  // document when nothing's selected, and says which.
  typePanel(anchor) {
    this.remember();
    const body = h('div', { class: 'de-aa' });
    body.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') e.preventDefault(); });
    const row = (label, ...kids) => h('div', { class: 'de-aa-row' }, h('span', { class: 'de-aa-label' }, label), h('div', { class: 'de-aa-ctl' }, ...kids));
    const opt = (label, on, run, extra = {}) => h('button', { type: 'button', class: `de-aa-opt${on ? ' is-on' : ''}`, 'aria-pressed': String(!!on), onclick: () => { run(); draw(); }, ...extra }, label);
    const ic = (name, label, on, run) => opt(icon(name), on, run, { 'aria-label': label, title: label });
    const swatch = (c, run, label, cls = '') => h('button', { type: 'button', class: `de-swatch ${cls}`, style: { '--c': c }, 'aria-label': label, title: label, onclick: () => { run(); draw(); } });
    const spaceBlocks = (v) => {
      this.restore();
      this.record();
      for (const el of this.selectedBlocks()) {
        if (/^(TABLE|HR)$/.test(el.tagName)) continue;
        if (v === this.settings.spacing) el.style.removeProperty('line-height'); else el.style.lineHeight = String(v);
        if (!el.getAttribute('style')) el.removeAttribute('style');
      }
      this.changed({ now: true });
    };
    const draw = () => {
      const some = !(this.range?.collapsed ?? true);
      const now = this.typeAt();
      const block = this.blockAtCaret();
      const lh = block?.style.lineHeight ? Number(block.style.lineHeight) : this.settings.spacing;
      const at = SIZES.indexOf(now.size);
      const step = (dir) => {
        const next = SIZES[at < 0 ? SIZES.findIndex((n) => n >= now.size) + (dir > 0 ? 0 : -1) : at + dir];
        if (!next) return;
        if (some) this.sizeSelection(next); else this.setSettings({ size: next });
      };
      body.replaceChildren(
        row('Typeface', h('div', { class: 'de-aa-seg' }, Object.entries(FONT_LABELS).map(([k, label]) =>
          opt(label, now.font === k, () => (some ? this.exec('fontName', k) : this.setSettings({ font: k })), { dataset: { font: k } })))),
        row('Size', h('div', { class: 'de-aa-step' },
          ic('line', 'Smaller', false, () => step(-1)), h('span', { class: 'de-aa-num' }, String(now.size)), ic('plus', 'Bigger', false, () => step(1))),
          h('div', { class: 'de-aa-seg de-aa-end' },
            ic('strike', 'Strikethrough', this.state('strikeThrough'), () => this.exec('strikeThrough')),
            ic('clear', 'Clear formatting (⌘\\)', false, () => this.clearFormat()))),
        row('Colour', h('div', { class: 'de-swatches' }, INKS.slice(0, 11).map((c, i) => swatch(c, () => this.exec('foreColor', c), i ? c : 'Ink')))),
        row('Highlight', h('div', { class: 'de-swatches' },
          MARKS.map((c) => swatch(c, () => this.exec('hiliteColor', c), c)),
          swatch('transparent', () => this.exec('hiliteColor', 'transparent'), 'No highlight', 'is-none'))),
        h('div', { class: 'de-aa-rule' }),
        row('Align', h('div', { class: 'de-aa-seg' },
          ...[['left', 'Left', 'Align left'], ['center', 'Center', 'Centre'], ['right', 'Right', 'Align right'], ['justify', 'Full', 'Justify']]
            .map(([k, cmd, label]) => ic(k, label, now.align === k, () => this.align(cmd)))),
          h('div', { class: 'de-aa-seg de-aa-end' },
            ic('outdent', 'Less indent', false, () => this.indent(-1)), ic('indent', 'More indent', false, () => this.indent(1)))),
        row('Spacing', h('div', { class: 'de-aa-seg' }, [[1, 'Single'], [1.15, '1.15'], [1.5, '1.5'], [2, 'Double']].map(([v, label]) =>
          opt(label, lh === v, () => (some ? spaceBlocks(v) : this.setSettings({ spacing: v })))))),
        h('div', { class: 'de-aa-foot' },
          h('span', null, some ? 'Changes the selected words' : 'Typeface, size and spacing change the whole document'),
          h('button', { type: 'button', class: 'de-word', onclick: () => { pop.close(); this.pageSetup(); } }, 'Page setup…')));
    };
    draw();
    this.typeBtn.classList.add('is-on');
    const pop = openPopover(anchor, body, { className: 'de-pop de-aa-pop', align: 'end', onClose: () => this.typeBtn.classList.remove('is-on') });
  }

  insertMenu(anchor) {
    this.remember();
    openMenu(anchor, [
      { label: 'Picture…', run: () => this.pickPicture() },
      { label: 'Table', run: () => this.insertTable() },
      { label: 'Link…', hint: '⌘K', run: () => this.linkBox(anchor) },
      { label: 'Line', run: () => this.insertHtml('<hr><p><br></p>') },
      { label: 'Page break', hint: '⌘↵', run: () => this.pageBreak() },
    ], { className: 'de-menu' });
  }

  insertTable(rows = 3, cols = 3) {
    const row = `<tr>${'<td><br></td>'.repeat(cols)}</tr>`;
    this.insertHtml(`<table><tbody>${row.repeat(rows)}</tbody></table><p><br></p>`);
  }

  pageBreak() { this.insertHtml('<div class="pb" contenteditable="false"></div><p><br></p>'); }

  tableEdit(what) {
    this.restore();
    const cell = this.blockAtCaret()?.closest('td, th');
    if (!cell) return;
    const tr = cell.parentElement;
    const table = cell.closest('table');
    const col = [...tr.children].indexOf(cell);
    this.record();
    if (what === 'row-below') {
      const next = tr.cloneNode(false);
      for (let i = 0; i < tr.children.length; i++) next.append(h('td', null, h('br')));
      tr.after(next);
    } else if (what === 'col-right') {
      for (const row of table.querySelectorAll('tr')) row.children[col]?.after(h(row.children[col]?.tagName === 'TH' ? 'th' : 'td', null, h('br')));
    } else if (what === 'row-del') {
      if (table.querySelectorAll('tr').length > 1) tr.remove(); else table.remove();
    } else if (what === 'col-del') {
      if (tr.children.length > 1) for (const row of table.querySelectorAll('tr')) row.children[col]?.remove();
      else table.remove();
    } else if (what === 'table-del') {
      table.remove();
    }
    this.contextTools.dataset.key = '-';
    this.changed({ now: true });
  }

  // -------------------------------------------------------- links

  linkBox(anchor, existing = null) {
    this.remember();
    const a = existing || this.blockAtCaret() && (getSelection().anchorNode?.parentElement?.closest('a'));
    const input = h('input', { class: 'input de-link-in', type: 'url', placeholder: 'https://…', value: a?.getAttribute('href') || '', 'aria-label': 'Link address' });
    const apply = () => {
      let url = input.value.trim();
      pop.close();
      if (!url) return;
      if (!/^(https?:|mailto:|#)/i.test(url)) url = `https://${url}`;
      if (a) { this.record(); a.setAttribute('href', url); a.target = '_blank'; a.rel = 'noopener noreferrer'; this.changed({ now: true }); return; }
      this.restore();
      if (this.range?.collapsed) this.insertHtml(`<a href="${escapeHtml(url).replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>&nbsp;`);
      else this.exec('createLink', url);
      for (const link of this.flow.querySelectorAll('a:not([target])')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    const body = h('div', { class: 'de-link' }, input,
      h('div', { class: 'de-link-btns' },
        a ? h('a', { class: 'vbtn vbtn-glass', href: a.getAttribute('href'), target: '_blank', rel: 'noopener noreferrer' }, 'Open') : null,
        a ? h('button', { type: 'button', class: 'vbtn vbtn-glass', onclick: () => {
          pop.close(); this.record();
          a.replaceWith(...a.childNodes);
          this.changed({ now: true });
        } }, 'Remove') : null,
        h('button', { type: 'button', class: 'vbtn vbtn-blue', onclick: apply }, a ? 'Save' : 'Add link')));
    const pop = openPopover(anchor, body, { className: 'de-pop', width: 320 });
    setTimeout(() => input.focus(), 30);
  }

  // -------------------------------------------------------- pictures

  pickPicture() {
    const picker = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true, hidden: true });
    picker.addEventListener('change', () => { this.addPictures([...picker.files]); picker.remove(); });
    document.body.append(picker);
    picker.click();
  }

  async shrink(file) {
    if (file.type === 'image/gif' && file.size < 4e6) return file;
    const bitmap = await createImageBitmap(file);
    const max = 2000;
    if (bitmap.width <= max && bitmap.height <= max && file.size < 2.5e6) { bitmap.close?.(); return file; }
    const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = h('canvas', { width: Math.round(bitmap.width * k), height: Math.round(bitmap.height * k) });
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    return new Promise((r) => canvas.toBlob(r, type, 0.88));
  }

  async addPictures(files) {
    const pics = files.filter((f) => /^image\/(png|jpeg|webp|gif)$/.test(f.type));
    if (!pics.length) return;
    this.setStatus('Adding picture…');
    for (const f of pics) {
      try {
        const blob = await this.shrink(f);
        const { src } = await sendFile(`/api/docs/${this.id}/img`, blob, { type: blob.type || f.type });
        this.insertHtml(`<img src="${src}" alt="">`);
      } catch (err) {
        toast(err.message || 'That picture couldn’t be added.');
      }
    }
    for (const img of this.flow.querySelectorAll('img')) if (!img.complete) img.addEventListener('load', () => this.layoutSoon(), { once: true });
  }

  pickImage(img) {
    for (const el of this.flow.querySelectorAll('img.is-picked')) if (el !== img) el.classList.remove('is-picked');
    img?.classList.add('is-picked');
    if (img) {
      const r = document.createRange();
      r.selectNode(img);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      this.range = r.cloneRange();
    }
    this.syncTools();
  }

  sizePicture(w) {
    const img = this.flow.querySelector('img.is-picked');
    if (!img) return;
    this.record();
    if (w === 100) img.style.width = '100%'; else img.style.width = `${w}%`;
    this.changed({ now: true });
  }

  deletePicture() {
    const img = this.flow.querySelector('img.is-picked');
    if (!img) return;
    this.record();
    img.remove();
    this.changed({ now: true });
  }

  // -------------------------------------------------------- undo

  snapshot() {
    return cleanHtml(cleanCopy(this.flow).innerHTML, { own: true });
  }

  record() {
    if (!this.mine || this.previewing) return;
    const html = this.snapshot();
    const sel = this.caret();
    const last = this.history[this.at];
    if (last && last.html === html) { if (sel) last.sel = sel; return; }
    this.history.splice(this.at + 1);
    this.history.push({ html, sel });
    if (this.history.length > 300) this.history.shift();
    this.at = this.history.length - 1;
  }

  applyState(state) {
    this.flow.innerHTML = state.html || '<p><br></p>';
    this.layout();
    if (state.sel) this.placeCaret(state.sel.start, state.sel.end);
    this.changed({ record: false });
  }

  undo() {
    if (!this.mine) return;
    this.record();
    if (this.at <= 0) return;
    this.at--;
    this.applyState(this.history[this.at]);
  }

  redo() {
    if (!this.mine || this.at >= this.history.length - 1) return;
    this.at++;
    this.applyState(this.history[this.at]);
  }

  // -------------------------------------------------------- typing

  changed({ now = false, record = true } = {}) {
    this.dirty = true;
    this.typed = true;
    this.setStatus('Editing…');
    if (record) { if (now) this.record(); else this.recordSoon(); }
    this.saveSoon();
    this.layoutSoon();
    this.syncTools();
    this.poemSoon ||= debounce(() => this.checkPoem(), 700);
    this.poemSoon();
  }

  // A poem with no heading of its own shows its name above it (drawn, not part of the text).
  nameOnPage() {
    const name = this.flow.classList.contains('is-poem') ? this.titleIn.value.trim() : '';
    if ((this.flow.dataset.name || '') === name) return false;
    if (name) this.flow.dataset.name = name; else delete this.flow.dataset.name;
    return true;
  }

  // Once someone writes, what's on the page decides whether it's set as a poem.
  checkPoem() {
    if (!this.flow || this.settings.layout !== 'auto') return;
    this.doc.reads = null;
    if (looksLikePoem(this.flow) !== this.flow.classList.contains('is-poem')) this.applySettings();
  }

  wire() {
    const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); this.off.push(() => target.removeEventListener(type, fn, opts)); };
    on(window, 'keydown', (e) => this.key(e), true);
    on(window, 'resize', debounce(() => this.layout(), 120));
    on(document, 'selectionchange', () => {
      this.remember();
      this.syncToolsSoon ||= debounce(() => { this.syncTools(); this.selectionBar(); }, 80);
      this.syncToolsSoon();
      if (this.slashFor && this.blockAtCaret() !== this.slashFor.block) this.closeSlash();
    });
    on(window, 'pagehide', () => { if (this.dirty) this.save(); });
    on(this.titleIn, 'input', () => {
      if (this.nameOnPage()) this.layoutSoon();
      this.dirty = true; this.typed = true; this.setStatus('Editing…'); this.saveSoon(); });
    on(this.titleIn, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.flow.focus(); } });
    on(this.desk, 'scroll', () => { this.selectionBar(); this.closeSlash(); });
    // A click on the paper outside the words puts the caret at the nearest end.
    on(this.stack, 'mousedown', (e) => {
      if (!this.mine || e.target !== this.stack && !e.target.closest('.de-sheet')) return;
      e.preventDefault();
      this.flow.focus({ preventScroll: true });
      const r = this.flow.getBoundingClientRect();
      this.placeCaret(e.clientY > r.top + this.flow.scrollHeight / 2 ? posOf(this.flow, this.flow, this.flow.childNodes.length) : 0);
    });
    on(this.flow, 'click', (e) => {
      const img = e.target.closest('img');
      if (this.mine) this.pickImage(img && this.flow.contains(img) ? img : null);
      const a = e.target.closest('a[href]');
      if (a && (!this.mine || e.metaKey || e.ctrlKey)) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); return; }
      if (a && this.mine && getSelection().isCollapsed) this.linkBox(a, a);
      // A checklist's box: tick it.
      const li = e.target.closest('ul.check > li');
      if (li && this.mine && e.clientX < li.getBoundingClientRect().left + 4) {
        this.record();
        li.toggleAttribute('data-done');
        this.changed({ now: true });
      }
    });
    on(this.flow, 'compositionstart', () => { this.composing = true; });
    on(this.flow, 'compositionend', () => { this.composing = false; this.changed(); });
    on(this.flow, 'beforeinput', (e) => {
      if (e.inputType === 'historyUndo') { e.preventDefault(); this.undo(); return; }
      if (e.inputType === 'historyRedo') { e.preventDefault(); this.redo(); return; }
      // Type a word at a time into the undo history; anything else is a step of its own.
      const typing = e.inputType === 'insertText' && e.data && !/\s/.test(e.data);
      if (!typing || this.lastInput !== 'typing') this.record();
      this.lastInput = typing ? 'typing' : e.inputType;
    });
    on(this.flow, 'input', (e) => {
      if (e.inputType === 'insertText' && e.data === ' ') this.autoformat();
      if (e.inputType === 'insertText' && e.data && '"\'-.'.includes(e.data)) this.smarten(e.data);
      this.changed();
      this.slashCheck();
      if (e.inputType === 'insertText' || e.inputType === 'insertParagraph') this.typing(); else this.wake();
    });
    // Anything but writing brings the bars back.
    let far = null;
    on(this.el, 'pointermove', (e) => {
      if (!this.quiet || e.pointerType === 'touch') return;
      far ||= { x: e.clientX, y: e.clientY };
      if (Math.hypot(e.clientX - far.x, e.clientY - far.y) > 14) { far = null; this.wake(); }
    });
    on(this.el, 'pointerdown', (e) => { far = null; if (!this.flow.contains(e.target) || e.pointerType !== 'touch') this.wake(); if (!this.slash.contains(e.target)) this.closeSlash(); });
    on(this.flow, 'blur', () => { this.wake(); this.closeSlash(); });
    on(this.flow, 'paste', (e) => this.paste(e));
    on(this.flow, 'drop', (e) => {
      const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
      if (!files.length || !this.mine) return;
      e.preventDefault();
      e.stopPropagation();
      const r = document.caretRangeFromPoint?.(e.clientX, e.clientY);
      if (r) { getSelection().removeAllRanges(); getSelection().addRange(r); this.range = r; }
      this.addPictures(files);
    });
    on(this.flow, 'dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
    on(this.el, 'dragover', (e) => e.preventDefault());
    on(this.el, 'drop', (e) => e.preventDefault());
  }

  // "# " makes a heading, "- " a list, "1. " a numbered one, "> " a quote, "[] " a checklist.
  autoformat() {
    const block = this.blockAtCaret();
    if (!block || block.tagName !== 'P' || block.classList.length) return;
    const sel = getSelection();
    const text = block.textContent.replace(/ /g, ' ');
    const r = sel.getRangeAt(0);
    const before = document.createRange();
    before.setStart(block, 0);
    before.setEnd(r.startContainer, r.startOffset);
    const lead = before.toString().replace(/ /g, ' ');
    if (lead !== text.slice(0, lead.length)) return;
    const m = /^(#{1,3}|[-*]|1[.)]|>|\[\]|\[ \])\s$/.exec(lead);
    if (!m) return;
    this.record();
    // Take the marks away, then turn the block.
    for (let i = 0; i < lead.length; i++) document.execCommand('delete', false);
    const mark = m[1];
    if (mark.startsWith('#')) this.setStyle(`h${mark.length}`);
    else if (mark === '>') this.setStyle('quote');
    else if (mark === '-' || mark === '*') this.list('ul');
    else if (/^1/.test(mark)) this.list('ol');
    else this.list('check');
  }

  paste(e) {
    if (!this.mine) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); this.addPictures(files); return; }
    const html = e.clipboardData?.getData('text/html');
    const text = e.clipboardData?.getData('text/plain') || '';
    e.preventDefault();
    if (getSelection().anchorNode?.parentElement?.closest('pre')) { this.record(); document.execCommand('insertText', false, text); this.changed({ now: true }); return; }
    let out;
    if (html) {
      out = cleanHtml(html.replace(/<!--[\s\S]*?-->/g, ''))
        .replace(/>\s+</g, '><');
      const box = document.createElement('div');
      box.innerHTML = out;
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!n.parentElement.closest('pre')) n.data = n.data.replace(/[\t\n\r ]+/g, ' ');
      out = box.innerHTML;
    } else if (/\n/.test(text.trim())) {
      out = text.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
    } else {
      this.record();
      document.execCommand('insertText', false, text);
      this.changed({ now: true });
      return;
    }
    this.insertHtml(out);
  }

  key(e) {
    if (!this.el.isConnected) return;
    const mod = e.metaKey || e.ctrlKey;
    const inFlow = this.flow.contains(document.activeElement) || document.activeElement === this.flow;
    const k = e.key.toLowerCase();
    if (this.slashFor && !mod) {
      const n = this.slashFor.items.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); this.slashMove((this.slashFor.at + (e.key === 'ArrowDown' ? 1 : n - 1)) % n); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); this.slashPick(); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.closeSlash(); return; }
    }
    if (e.key === 'Escape') {
      if (document.querySelector('.pop, .scrim')) return;
      e.stopPropagation();
      e.preventDefault();
      if (this.quiet) { this.wake(); return; }
      if (!this.findBar.hidden) { this.closeFind(); return; }
      if (!this.panel.hidden) { this.closePanel(); return; }
      if (this.previewing) { this.endPreview(); return; }
      if (inFlow) { this.flow.blur(); return; }
      this.close();
      return;
    }
    if (document.querySelector('.scrim')) return;
    if (mod && k === 'f') { e.preventDefault(); e.stopPropagation(); this.openFind(false); return; }
    if (mod && (k === 'h' || (e.shiftKey && k === 'f'))) { e.preventDefault(); e.stopPropagation(); this.openFind(true); return; }
    if (mod && k === 's') { e.preventDefault(); e.stopPropagation(); this.save(); return; }
    if (mod && k === 'p') { e.preventDefault(); e.stopPropagation(); this.print(); return; }
    if (!inFlow || !this.mine) return;
    if (mod && k === 'z') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); e.stopPropagation(); this.redo(); return; }
    if (mod && k === 'k') { e.preventDefault(); e.stopPropagation(); const sr = getSelection().rangeCount ? getSelection().getRangeAt(0).getBoundingClientRect() : null; this.linkBox(sr && (sr.width || sr.height) ? this.spotAt(sr) : this.typeBtn); return; }
    if (mod && e.altKey && (k === 'm' || e.code === 'KeyM')) { e.preventDefault(); this.startComment(); return; }
    if (mod && e.altKey && /^Digit[0-3]$/.test(e.code)) { e.preventDefault(); this.setStyle(e.code === 'Digit0' ? 'p' : `h${e.code.slice(-1)}`); return; }
    if (mod && e.shiftKey && (e.code === 'Digit7' || e.code === 'Digit8' || e.code === 'Digit9')) { e.preventDefault(); this.list(e.code === 'Digit7' ? 'ol' : e.code === 'Digit8' ? 'ul' : 'check'); return; }
    if (mod && e.shiftKey && ['l', 'e', 'r', 'j'].includes(k)) { e.preventDefault(); this.align({ l: 'Left', e: 'Center', r: 'Right', j: 'Full' }[k]); return; }
    if (mod && e.key === '\\') { e.preventDefault(); this.clearFormat(); return; }
    if (mod && e.key === 'Enter') { e.preventDefault(); this.pageBreak(); return; }
    if ((e.key === 'Backspace' || e.key === 'Delete') && !mod) this.clearGapsNear(e.key);
    if (e.key === 'Tab') {
      const cell = this.blockAtCaret()?.closest('td, th');
      if (cell) {
        e.preventDefault();
        const cells = [...cell.closest('table').querySelectorAll('td, th')];
        let next = cells[cells.indexOf(cell) + (e.shiftKey ? -1 : 1)];
        if (!next && !e.shiftKey) { this.tableEdit('row-below'); next = cell.closest('tr').nextElementSibling?.firstElementChild; }
        if (next) { const r = document.createRange(); r.selectNodeContents(next); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); }
        return;
      }
      e.preventDefault();
      if (this.blockAtCaret()?.closest('li')) this.indent(e.shiftKey ? -1 : 1);
      else if (!e.shiftKey) { this.record(); document.execCommand('insertText', false, '\t'); }
      return;
    }
    // In a poem, Enter starts a new line in the stanza; Enter on an empty line starts a new stanza.
    if (e.key === 'Enter' && !e.shiftKey && this.flow.classList.contains('is-poem')) {
      const block = this.blockAtCaret();
      if (!block || block.tagName !== 'P') return;
      const sel = getSelection();
      const r = sel.getRangeAt(0);
      const before = document.createRange();
      before.setStart(block, 0);
      before.setEnd(r.startContainer, r.startOffset);
      const lines = before.toString().split('\n');
      const prevBr = (() => {
        const frag = before.cloneContents();
        const last = frag.lastChild;
        return !before.toString().length || (last && last.nodeName === 'BR') || /\n$/.test(before.toString());
      })();
      e.preventDefault();
      this.record();
      if (prevBr && lines.length) {
        document.execCommand('delete', false);
        document.execCommand('insertParagraph', false);
      } else {
        document.execCommand('insertLineBreak', false);
      }
      this.changed({ now: true });
    }
  }

  // Backspace and Delete go through a page gap as if it weren't there.
  clearGapsNear(which) {
    const sel = getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const node = sel.anchorNode;
    const el = node?.nodeType === 3 ? node : node?.childNodes[sel.anchorOffset] || node;
    const sib = which === 'Backspace'
      ? (node?.nodeType === 3 && sel.anchorOffset === 0 ? node.previousSibling : node?.nodeType === 1 ? node.childNodes[sel.anchorOffset - 1] : null)
      : (node?.nodeType === 3 && sel.anchorOffset === node.length ? node.nextSibling : null);
    const block = this.blockAtCaret();
    const blockSib = which === 'Backspace' ? block?.previousElementSibling : block?.nextElementSibling;
    if (sib?.classList?.contains('de-gap')) sib.remove();
    if (block?.dataset.push !== undefined && which === 'Backspace') { block.style.removeProperty('margin-top'); block.removeAttribute('data-push'); }
    if (blockSib?.dataset?.push !== undefined && which === 'Delete') { blockSib.style.removeProperty('margin-top'); blockSib.removeAttribute('data-push'); }
    void el;
  }

  // -------------------------------------------------------- saving

  setStatus(text) { this.status.textContent = text; }

  async save() {
    if (!this.mine || !this.dirty || this.previewing) return;
    if (this.saving) { this.again = true; return; }
    this.saving = true;
    this.dirty = false;
    const copy = cleanCopy(this.flow);
    const body = { html: cleanHtml(copy.innerHTML, { own: true }), text: toMarkdown(copy) || ' ', title: this.titleIn.value.trim() };
    this.setStatus('Saving…');
    try {
      const res = await api.put(`/api/docs/${this.id}`, body);
      this.block = res.block;
      this.doc = { ...this.doc, savedAt: res.doc.savedAt };
      this.setStatus('Saved');
      bus.emit('block:changed', res.block);
    } catch (err) {
      this.dirty = true;
      this.setStatus(err.status === 0 ? 'Not saved: offline' : 'Not saved');
      if (err.status !== 0) toast(err.message);
      clearTimeout(this.retry);
      this.retry = setTimeout(() => this.save(), 5000);
    } finally {
      this.saving = false;
      if (this.again) { this.again = false; this.save(); }
    }
  }

  async setSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    this.applySettings();
    try {
      const res = await api.put(`/api/docs/${this.id}`, { settings: patch });
      this.settings = { ...res.doc.settings };
      this.doc.reads = res.doc.reads;
      bus.emit('block:changed', res.block);
    } catch (err) {
      toast(err.message);
    }
  }

  // -------------------------------------------------------- the left side

  toggleSide() {
    this.el.classList.toggle('has-side');
    this.renderSide();
    setTimeout(() => this.layout(), 340);
  }

  // Each document stands on its own: the side panel holds only its outline,
  // and it opens only when asked for.
  renderSide() {
    this.outline = h('nav', { class: 'de-outline', 'aria-label': 'Outline' });
    this.side.replaceChildren(h('p', { class: 'de-side-label' }, 'Outline'), this.outline);
    this.renderOutline();
  }

  renderOutline() {
    if (!this.outline) return;
    const heads = [...this.flow.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > p.title')].filter((el) => el.textContent.trim());
    this.outline.replaceChildren(...(heads.length ? heads.map((el) => {
      const lvl = el.classList.contains('title') ? 0 : Number(el.tagName[1]);
      const b = h('button', { type: 'button', class: `de-out is-l${lvl}` }, el.textContent.trim());
      b.addEventListener('click', () => this.scrollTo(el));
      return b;
    }) : [h('p', { class: 'de-side-hint' }, 'Headings you add show up here.')]));
  }

  scrollTo(el, rect = null) {
    const r = rect || el.getBoundingClientRect();
    const d = this.desk.getBoundingClientRect();
    this.desk.scrollTo({ top: this.desk.scrollTop + r.top - d.top - 90, behavior: moving() ? 'smooth' : 'auto' });
  }

  // -------------------------------------------------------- counting

  updateCount() {
    const text = cleanCopy(this.flow).innerText ?? '';
    this.wordCount = words(this.flow.innerText || '');
    void text;
    const pages = this.settings.view === 'pages' ? ` · ${plural(this.pages || 1, 'page')}` : '';
    this.countBtn.textContent = `${plural(this.wordCount, 'word')}${pages}`;
  }

  countDetails() {
    const text = (this.flow.innerText || '').replace(/ /g, ' ');
    const sel = getSelection();
    const selected = sel.rangeCount && this.inFlow(sel.anchorNode) && !sel.isCollapsed ? sel.toString() : '';
    const rows = [
      ['Words', words(text)],
      ['Characters', text.replace(/\n/g, '').length],
      ['Characters without spaces', text.replace(/\s/g, '').length],
      ['Paragraphs', text.split(/\n+/).filter((l) => l.trim()).length],
      ['Pages', this.pages || 1],
      ['Reading time', `${Math.max(1, Math.round(words(text) / 230))} min`],
    ];
    if (selected) rows.unshift(['Selected words', words(selected)]);
    openDialog({
      title: 'Word count',
      body: h('dl', { class: 'de-counts' }, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, typeof v === 'number' ? v.toLocaleString() : v)])),
    });
  }

  // -------------------------------------------------------- page setup

  pageSetup() {
    const s = this.settings;
    const row = (label, ctl) => h('div', { class: 'de-set-row' }, h('span', { class: 'de-set-label' }, label), ctl);
    const seg = (opts, value, key, parse = (v) => v) => segmented(opts.map(([v, label]) => ({ value: String(v), label })), String(value),
      (v) => { segEls[key].set(v); this.setSettings({ [key]: parse(v) }); }, { className: 'de-seg', label: key }).el;
    const segEls = {};
    const mk = (key, opts, parse) => {
      const ctl = segmented(opts.map(([v, label]) => ({ value: String(v), label })), String(s[key]),
        (v) => { ctl.set(v); this.setSettings({ [key]: parse ? parse(v) : v }); }, { className: 'de-seg', label: key });
      segEls[key] = ctl;
      return ctl.el;
    };
    void seg;
    const text = (key, placeholder) => {
      const input = h('input', { class: 'input', type: 'text', maxlength: '200', value: s[key] || '', placeholder });
      input.addEventListener('change', () => this.setSettings({ [key]: input.value.trim() }));
      return input;
    };
    const size = h('select', { class: 'input de-select', 'aria-label': 'Text size' },
      SIZES.map((n) => h('option', { value: String(n), selected: n === s.size }, `${n} pt`)));
    size.addEventListener('change', () => this.setSettings({ size: Number(size.value) }));
    openDialog({
      title: 'Page setup',
      className: 'dialog-wide de-setup',
      body: h('div', { class: 'de-set' },
        row('Page', mk('page', [['a4', 'A4'], ['letter', 'Letter']])),
        row('Margins', mk('margins', [['narrow', 'Narrow'], ['normal', 'Normal'], ['wide', 'Wide']])),
        row('Show as', mk('view', [['pages', 'Pages'], ['flow', 'One long page']])),
        row('Typeface', mk('font', Object.entries(FONT_LABELS))),
        row('Text size', size),
        row('Line spacing', mk('spacing', [[1, 'Single'], [1.15, '1.15'], [1.5, '1.5'], [2, 'Double']], Number)),
        row('Set as', mk('layout', [['auto', 'Auto'], ['prose', 'Prose'], ['poem', 'Poem']])),
        row('Page numbers', mk('numbers', [['off', 'None'], ['center', 'Centre'], ['right', 'Right']])),
        row('Header', text('header', 'Nothing at the top')),
        row('Footer', text('footer', 'Nothing at the bottom'))),
    });
  }

  // -------------------------------------------------------- menus at the top

  downloadMenu(anchor) {
    openMenu(anchor, [
      { label: 'PDF', hint: '.pdf', run: () => this.download('pdf') },
      { label: 'Word', hint: '.docx', run: () => this.download('docx') },
      { label: 'Markdown', hint: '.md', run: () => exportMarkdown(this.flow, this.nameNow()) },
      { label: 'Plain text', hint: '.txt', run: () => exportText(this.flow, this.nameNow()) },
      '-',
      { label: 'Print…', hint: '⌘P', run: () => this.print() },
    ], { align: 'end', className: 'de-menu' });
  }

  nameNow() {
    return this.titleIn.value.trim() || docTitle({ ...this.block, title: '', content: toMarkdown(cleanCopy(this.flow)) });
  }

  async download(kind) {
    const opts = { title: this.nameNow(), named: this.titleIn.value.trim(), settings: this.settings, author: this.block.owner || session.user?.username };
    this.setStatus(kind === 'pdf' ? 'Making the PDF…' : 'Making the Word file…');
    try {
      if (kind === 'pdf') {
        if (pdfMissing(this.flow) > 0) {
          toast('This document has letters a plain PDF can’t hold, so it opens in the print view. Choose “Save as PDF” there.');
          this.print();
        } else await exportPdf(this.flow, opts);
      } else await exportDocx(this.flow, opts);
      this.setStatus('Downloaded');
    } catch (err) {
      this.setStatus('');
      toast(err.message || 'That couldn’t be made.');
    }
  }

  print() { printDoc(this.flow, { title: this.titleIn.value.trim(), settings: this.settings }); }

  moreMenu(anchor) {
    openMenu(anchor, [
      this.mine ? { label: 'Page setup…', run: () => this.pageSetup() } : null,
      { label: 'Find', hint: '⌘F', run: () => this.openFind(false) },
      this.mine ? { label: 'Find and replace', hint: '⌘⇧H', run: () => this.openFind(true) } : null,
      { label: 'Word count', run: () => this.countDetails() },
      this.mine ? { label: 'Version history', run: () => this.togglePanel('history') } : null,
    ].filter(Boolean), { align: 'end', className: 'de-menu' });
  }

  // -------------------------------------------------------- find and replace

  openFind(replace) {
    this.findBar.hidden = false;
    this.findBar.classList.toggle('is-replace', replace && this.mine);
    if (!this.findIn) {
      this.findIn = h('input', { class: 'de-find-in', type: 'search', placeholder: 'Find in document', 'aria-label': 'Find' });
      this.replaceIn = h('input', { class: 'de-find-in de-replace-in', type: 'text', placeholder: 'Replace with', 'aria-label': 'Replace with' });
      this.findCount = h('span', { class: 'de-find-count' });
      const b = this.btn;
      const word = (label, run) => h('button', { type: 'button', class: 'de-word', onclick: run }, label);
      this.findIn.addEventListener('input', () => { this.findAt = 0; this.find(); });
      this.findIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.findStep(e.shiftKey ? -1 : 1); } });
      this.replaceIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.replaceOne(); } });
      this.findBar.append(
        h('div', { class: 'de-find-row' }, this.findIn, this.findCount, b('up', 'Previous', () => this.findStep(-1)), b('down', 'Next', () => this.findStep(1)), b('close', 'Close', () => this.closeFind())),
        h('div', { class: 'de-find-row de-replace-row' }, this.replaceIn, word('Replace', () => this.replaceOne()), word('Replace all', () => this.replaceAll())));
    }
    const sel = getSelection().toString();
    if (sel && sel.length < 80 && !sel.includes('\n')) this.findIn.value = sel;
    this.findIn.focus();
    this.findIn.select();
    this.find();
  }

  closeFind() {
    this.findBar.hidden = true;
    CSS.highlights?.delete('de-find');
    CSS.highlights?.delete('de-find-on');
    this.flow.focus({ preventScroll: true });
  }

  matches() {
    const q = this.findIn?.value || '';
    if (!q) return [];
    const { text, range } = textIndex(this.flow);
    const out = [];
    const hay = text.toLowerCase();
    const needle = q.toLowerCase();
    for (let i = hay.indexOf(needle); i >= 0 && out.length < 2000; i = hay.indexOf(needle, i + needle.length)) out.push(range(i, i + needle.length));
    return out;
  }

  find() {
    this.found = this.matches();
    this.findAt = Math.min(this.findAt || 0, Math.max(0, this.found.length - 1));
    this.findCount.textContent = this.findIn.value ? (this.found.length ? `${this.findAt + 1} of ${this.found.length}` : 'None') : '';
    if (window.Highlight && CSS.highlights) {
      CSS.highlights.set('de-find', new Highlight(...this.found));
      if (this.found[this.findAt]) CSS.highlights.set('de-find-on', new Highlight(this.found[this.findAt]));
      else CSS.highlights.delete('de-find-on');
    }
  }

  findStep(dir) {
    if (!this.found?.length) return;
    this.findAt = (this.findAt + dir + this.found.length) % this.found.length;
    this.find();
    const r = this.found[this.findAt];
    this.scrollTo(null, r.getBoundingClientRect());
    if (!window.Highlight) { getSelection().removeAllRanges(); getSelection().addRange(r); }
  }

  replaceOne() {
    if (!this.mine || !this.found?.length) return;
    const r = this.found[this.findAt];
    this.record();
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    document.execCommand('insertText', false, this.replaceIn.value);
    this.changed({ now: true });
    this.find();
  }

  replaceAll() {
    if (!this.mine) return;
    const found = this.matches();
    if (!found.length) return;
    this.record();
    for (const r of found.reverse()) {
      r.deleteContents();
      if (this.replaceIn.value) r.insertNode(document.createTextNode(this.replaceIn.value));
    }
    this.flow.normalize();
    this.changed({ now: true });
    toast(`Replaced ${plural(found.length, 'time')}`);
    this.find();
  }

  // -------------------------------------------------------- comments

  // Select some words and a small bubble rises beside them: the formatting
  // you'd reach for, a link, a highlight, and a comment. Someone reading
  // another person's document gets only Comment.
  selectionBar() {
    const sel = getSelection();
    const hide = () => { this.selBar.hidden = true; };
    if (!sel.rangeCount || sel.isCollapsed || !this.inFlow(sel.anchorNode) || !this.inFlow(sel.focusNode) || this.previewing || this.closing) { hide(); return; }
    if (!sel.toString().trim()) { hide(); return; }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (!r.width && !r.height) { hide(); return; }
    if (!this.selBar.firstChild) {
      const tap = (el, run) => {
        el.addEventListener('pointerdown', (e) => e.preventDefault());
        el.addEventListener('click', run);
        return el;
      };
      const b = (name, label, run) => tap(h('button', { type: 'button', class: 'de-bub', 'aria-label': label, title: label }, icon(name)), run);
      this.bubToggles = this.mine ? {
        bold: b('bold', 'Bold', () => { this.exec('bold'); this.selectionBar(); }),
        italic: b('italic', 'Italic', () => { this.exec('italic'); this.selectionBar(); }),
        underline: b('underline', 'Underline', () => { this.exec('underline'); this.selectionBar(); }),
      } : {};
      this.markBtn = this.mine ? b('mark', 'Highlight', () => { this.exec('hiliteColor', this.marked() ? 'transparent' : MARKS[0]); this.selectionBar(); }) : null;
      const comment = tap(h('button', { type: 'button', class: 'de-bub de-bub-word' }, icon('comment'), 'Comment'), () => this.startComment());
      this.selBar.append(h('div', { class: 'de-bubble' }, ...[
        ...Object.values(this.bubToggles),
        this.mine ? b('link', 'Link (⌘K)', () => this.linkBox(this.spotAt(sel.getRangeAt(0).getBoundingClientRect()))) : null,
        this.markBtn,
        this.mine ? h('span', { class: 'de-sep' }) : null,
        comment].filter(Boolean)));
    }
    for (const [cmd, el] of Object.entries(this.bubToggles)) el.classList.toggle('is-on', this.state(cmd));
    this.markBtn?.classList.toggle('is-on', this.marked());
    const was = this.selBar.hidden;
    this.selBar.hidden = false;
    const w = this.selBar.offsetWidth || 110;
    const floor = this.desk.getBoundingClientRect().top + 6;
    const above = r.top - 48 >= floor;
    this.selBar.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    this.selBar.style.top = `${above ? r.top - 48 : Math.min(innerHeight - 52, r.bottom + 10)}px`;
    if (was && moving()) {
      this.selBar.firstChild.animate([{ opacity: 0, transform: `translateY(${above ? 8 : -8}px) scale(0.92)` }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(0.2, 1.3, 0.4, 1)' });
    }
  }

  // Whether the selected words (the first of them) carry a highlight.
  marked() {
    const sel = getSelection();
    if (!sel.rangeCount) return false;
    const r = sel.getRangeAt(0);
    const walker = document.createTreeWalker(r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    let node = r.startContainer.nodeType === 3 && r.startOffset < r.startContainer.length ? r.startContainer : null;
    for (let n = node ? null : walker.nextNode(); n && !node; n = walker.nextNode()) {
      if (n.length && r.comparePoint(n, n.length) >= 0 && r.comparePoint(n, 0) <= 0 && r.intersectsNode(n) && !(n === r.startContainer)) node = n;
    }
    for (let el = node?.parentElement; el && el !== this.flow; el = el.parentElement) {
      const bg = el.style?.backgroundColor;
      if (bg && bg !== 'transparent' && !/rgba\(0, 0, 0, 0\)/.test(bg)) return true;
    }
    return false;
  }

  // Put the hanging point at a place on screen, and hand it back as an anchor.
  spotAt(rect) {
    Object.assign(this.spot.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${Math.max(1, rect.width)}px`, height: `${Math.max(1, rect.height)}px` });
    return this.spot;
  }

  // -------------------------------------------------------- "/" on an empty line

  slashItems() {
    return [
      { icon: 'heading', label: 'Heading', hint: 'Big', words: 'h1 title', run: () => this.setStyle('h1') },
      { icon: 'heading', label: 'Subheading', hint: 'Medium', words: 'h2', run: () => this.setStyle('h2') },
      { icon: 'heading', label: 'Small heading', hint: 'Small', words: 'h3', run: () => this.setStyle('h3') },
      { icon: 'bullets', label: 'Bulleted list', words: 'bullets points ul', run: () => this.list('ul') },
      { icon: 'numbers', label: 'Numbered list', words: 'ol steps 123', run: () => this.list('ol') },
      { icon: 'check', label: 'Checklist', words: 'todo tasks tick boxes', run: () => this.list('check') },
      { icon: 'quote', label: 'Quote', words: 'blockquote', run: () => this.setStyle('quote') },
      { icon: 'table', label: 'Table', words: 'grid rows columns', run: () => this.insertTable() },
      { icon: 'picture', label: 'Picture', words: 'image photo', run: () => this.pickPicture() },
      { icon: 'line', label: 'Line', words: 'rule divider hr separator', run: () => this.insertHtml('<hr><p><br></p>') },
      { icon: 'pagebreak', label: 'Page break', words: 'new page', run: () => this.pageBreak() },
      { icon: 'code', label: 'Code', words: 'pre monospace', run: () => this.setStyle('pre') },
    ];
  }

  // Called as you type: a line that is only "/" (and the start of a word) opens it.
  slashCheck() {
    const block = this.mine && getSelection().isCollapsed ? this.blockAtCaret() : null;
    const m = block && block.tagName === 'P' && !block.classList.length && block.parentElement === this.flow
      ? /^\/([\p{L}\d ]{0,14})$/u.exec(block.textContent.replace(/\u200b/g, '')) : null;
    if (!m) { this.closeSlash(); return; }
    const q = m[1].trim().toLowerCase();
    const items = this.slashItems().filter((it) => !q || `${it.label} ${it.words}`.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || it.label.toLowerCase().startsWith(q));
    if (!items.length) { this.closeSlash(); return; }
    const fresh = this.slash.hidden;
    this.slashFor = { block, items, at: fresh ? 0 : Math.min(this.slashFor?.at || 0, items.length - 1) };
    this.slash.replaceChildren(h('p', { class: 'de-slash-label' }, 'Insert'), ...items.map((it, n) => {
      const row = h('button', { type: 'button', class: 'de-slash-item', role: 'option' }, icon(it.icon), h('span', null, it.label), it.hint ? h('span', { class: 'de-slash-hint' }, it.hint) : null);
      row.addEventListener('pointerdown', (e) => e.preventDefault());
      row.addEventListener('pointermove', () => this.slashMove(n, { scroll: false }));
      row.addEventListener('click', () => this.slashPick(n));
      return row;
    }));
    this.slash.hidden = false;
    const r = block.getBoundingClientRect();
    const line = parseFloat(getComputedStyle(block).lineHeight) || 24;
    const hgt = this.slash.offsetHeight;
    const up = r.top + line + 6 + hgt > innerHeight - 10 && r.top - hgt - 6 > 60;
    this.slash.style.left = `${Math.max(8, Math.min(innerWidth - this.slash.offsetWidth - 8, r.left - 6))}px`;
    this.slash.style.top = `${up ? r.top - hgt - 6 : r.top + line + 6}px`;
    this.slash.style.transformOrigin = up ? '18px 100%' : '18px 0';
    this.slashMove(this.slashFor.at);
    if (fresh && moving()) {
      this.slash.animate([{ transform: 'scale(0.94)' }, { transform: 'none' }], { duration: 340, easing: 'cubic-bezier(0.2, 1.25, 0.4, 1)' });
      [...this.slash.children].forEach((el, n) => el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: Math.min(n, 8) * 18, easing: EASE, fill: 'backwards' }));
    }
  }

  slashMove(n, { scroll = true } = {}) {
    if (!this.slashFor) return;
    this.slashFor.at = n;
    const rows = this.slash.querySelectorAll('.de-slash-item');
    rows.forEach((el, i) => { el.classList.toggle('is-on', i === n); el.setAttribute('aria-selected', String(i === n)); });
    if (scroll) rows[n]?.scrollIntoView({ block: 'nearest' });
  }

  slashPick(n = this.slashFor?.at) {
    const it = this.slashFor?.items[n];
    const block = this.slashFor?.block;
    this.closeSlash();
    if (!it || !block?.isConnected) return;
    // Take the "/…" away, then do what was asked on the empty line.
    this.record();
    block.replaceChildren(h('br'));
    const r = document.createRange();
    r.setStart(block, 0);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    this.range = r.cloneRange();
    it.run();
    // A list made on an empty line can come out wrapped in that line: let it stand alone.
    for (const list of this.flow.querySelectorAll(':scope > p > ul, :scope > p > ol')) {
      const wrap = list.parentElement;
      wrap.replaceWith(...wrap.childNodes);
      const li = list.querySelector('li');
      if (li) {
        const c = document.createRange();
        c.setStart(li, 0);
        c.collapse(true);
        getSelection().removeAllRanges();
        getSelection().addRange(c);
        this.range = c.cloneRange();
      }
    }
    this.changed({ now: true });
  }

  closeSlash() {
    if (this.slash.hidden) return;
    this.slash.hidden = true;
    this.slashFor = null;
  }

  // -------------------------------------------------------- smart punctuation

  // Straight quotes turn curly, two hyphens make a dash, three dots an
  // ellipsis. Undo gives back exactly what was typed.
  smarten(ch) {
    const sel = getSelection();
    const node = sel.anchorNode;
    const o = sel.anchorOffset;
    if (!sel.isCollapsed || node?.nodeType !== 3 || o < 1 || node.data[o - 1] !== ch) return;
    if (node.parentElement.closest('pre, code')) return;
    const block = this.blockAtCaret();
    if (!block) return;
    const lead = document.createRange();
    lead.setStart(block, 0);
    lead.setEnd(node, o - 1);
    const before = lead.toString();
    const prev = before.slice(-1);
    let take = 1;
    let put = '';
    if (ch === '"' || ch === "'") {
      const opens = !prev || /[\s(\[{\u2014\u2013\u201c\u2018\/-]/.test(prev);
      put = ch === '"' ? (opens ? '\u201c' : '\u201d') : (opens ? '\u2018' : '\u2019');
    } else if (ch === '-' && prev === '-' && o >= 2 && node.data[o - 2] === '-' && !/--$/.test(before.slice(0, -1) + '-')) {
      take = 2; put = '\u2014';
    } else if (ch === '.' && o >= 3 && node.data.slice(o - 3, o) === '...') {
      take = 3; put = '\u2026';
    }
    if (!put) return;
    this.record();
    node.replaceData(o - take, take, put);
    const r = document.createRange();
    r.setStart(node, o - take + put.length);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    this.lastInput = 'smart';
  }

  // -------------------------------------------------------- quiet writing

  // Once you've been typing steadily, the bars fade back so it's just you and
  // the page. Move the pointer and they return.
  typing() {
    const now = performance.now();
    const run = this.run;
    if (now - run.last > 3500) { run.from = now; run.keys = 0; }
    run.last = now;
    run.keys++;
    if (now - run.from >= QUIET_AFTER && run.keys >= QUIET_KEYS && !this.quiet && moving()
        && this.panel.hidden && this.findBar.hidden && !this.el.classList.contains('has-side') && !document.querySelector('.pop')) {
      this.quiet = true;
      this.el.classList.add('is-quiet');
    }
  }

  wake() {
    this.run.keys = 0;
    this.run.from = performance.now();
    if (!this.quiet) return;
    this.quiet = false;
    this.el.classList.remove('is-quiet');
    // The first time, say what happened.
    try {
      if (!localStorage.getItem('mutt:docs-quiet')) {
        localStorage.setItem('mutt:docs-quiet', '1');
        const was = this.status.textContent;
        this.setStatus('The bars step back while you write');
        setTimeout(() => { if (this.status.textContent === 'The bars step back while you write') this.setStatus(was === 'Editing…' ? 'Saved' : was); }, 4200);
      }
    } catch { /* private window */ }
  }

  anchorOf(c) {
    if (!c.quote) return null;
    const { text, range } = this.index || (this.index = textIndex(this.flow));
    let best = null;
    let bestScore = -1;
    for (let i = text.indexOf(c.quote); i >= 0; i = text.indexOf(c.quote, i + 1)) {
      let score = 0;
      const pre = text.slice(Math.max(0, i - c.prefix.length), i);
      const post = text.slice(i + c.quote.length, i + c.quote.length + c.suffix.length);
      for (let k = 1; k <= pre.length && pre[pre.length - k] === c.prefix[c.prefix.length - k]; k++) score++;
      for (let k = 0; k < post.length && post[k] === c.suffix[k]; k++) score++;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best === null ? null : range(best, best + c.quote.length);
  }

  startComment() {
    this.remember();
    const sel = getSelection();
    const r = this.range;
    if (!r || r.collapsed) { toast('Select some words to comment on.'); return; }
    const { text } = textIndex(this.flow);
    const start = textIndex(this.flow);
    void start;
    const quote = r.toString();
    const pre = document.createRange();
    pre.setStart(this.flow, 0);
    pre.setEnd(r.startContainer, r.startOffset);
    const before = pre.toString();
    const at = before.length;
    this.draft = { quote: text.slice(at, at + quote.length) || quote, prefix: text.slice(Math.max(0, at - 32), at), suffix: text.slice(at + quote.length, at + quote.length + 32) };
    sel.removeAllRanges();
    this.selBar.hidden = true;
    this.el.classList.add('has-rail');
    if (this.narrow()) this.togglePanel('comments', true);
    this.paintMarks({ focusDraft: true });
  }

  narrow() { return innerWidth < (this.d?.W || 800) + 360 + (this.el.classList.contains('has-side') ? 260 : 0); }

  commentCard(c, replies, { draft = false } = {}) {
    const me = session.user?.username;
    const canResolve = this.mine || c.by === me;
    const card = h('div', { class: `de-card${c.resolved ? ' is-done' : ''}${draft ? ' is-draft' : ''}`, dataset: { id: c.id || 'draft' } });
    if (draft) {
      const area = h('textarea', { class: 'de-card-in', rows: '3', placeholder: 'Add a comment', maxlength: '4000' });
      const post = async () => {
        const body = area.value.trim();
        if (!body) { area.focus(); return; }
        try {
          ({ comments: this.comments } = await api.post(`/api/docs/${this.id}/comments`, { ...this.draft, body }));
          this.draft = null;
          this.paintMarks();
        } catch (err) { toast(err.message); }
      };
      area.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); post(); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.draft = null; this.paintMarks(); }
      });
      card.append(h('p', { class: 'de-card-quote' }, `“${this.draft.quote.slice(0, 140)}”`), area,
        h('div', { class: 'de-card-btns' },
          h('button', { type: 'button', class: 'vbtn vbtn-glass', onclick: () => { this.draft = null; this.paintMarks(); } }, 'Cancel'),
          h('button', { type: 'button', class: 'vbtn vbtn-blue', onclick: post }, 'Comment')));
      setTimeout(() => area.focus({ preventScroll: true }), 40);
      return card;
    }
    const line = (x) => h('div', { class: 'de-msg' }, ...[
      h('p', { class: 'de-msg-by' }, h('b', null, `@${x.by}`), h('span', null, timeAgo(x.createdAt))),
      h('p', { class: 'de-msg-body' }, x.body),
      x.by === me || this.mine ? h('button', { type: 'button', class: 'de-msg-x', 'aria-label': 'Delete comment', title: 'Delete', onclick: async (e) => {
        e.stopPropagation();
        if (!(await confirmDialog({ title: 'Delete this comment?', confirm: 'Delete', danger: true }))) return;
        try { ({ comments: this.comments } = await api.del(`/api/docs/${this.id}/comments/${x.id}`)); this.paintMarks(); } catch (err) { toast(err.message); }
      } }, '×') : null].filter(Boolean));
    const reply = h('textarea', { class: 'de-card-in de-reply', rows: '1', placeholder: 'Reply', maxlength: '4000' });
    reply.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      const body = reply.value.trim();
      if (!body) return;
      try { ({ comments: this.comments } = await api.post(`/api/docs/${this.id}/comments`, { parent: c.id, body })); this.active = c.id; this.paintMarks(); } catch (err) { toast(err.message); }
    });
    card.append(...[
      c.orphan ? h('p', { class: 'de-card-quote is-gone' }, `“${c.quote.slice(0, 100)}” was changed`) : null,
      line(c), ...replies.map(line),
      h('div', { class: 'de-card-foot' }, reply,
        canResolve ? h('button', { type: 'button', class: 'de-done', title: c.resolved ? 'Open it again' : 'Mark as done', 'aria-label': c.resolved ? 'Open again' : 'Done', onclick: async (e) => {
          e.stopPropagation();
          try { ({ comments: this.comments } = await api.patch(`/api/docs/${this.id}/comments/${c.id}`, { resolved: !c.resolved })); this.paintMarks(); } catch (err) { toast(err.message); }
        } }, icon('done')) : null)].filter(Boolean));
    card.addEventListener('click', () => {
      this.active = c.id;
      this.paintMarks();
      if (c.range) this.scrollTo(null, c.range.getBoundingClientRect());
    });
    return card;
  }

  paintMarks({ focusDraft = false } = {}) {
    if (!this.flow.isConnected) return;
    this.index = textIndex(this.flow);
    const tops = this.comments.filter((c) => !c.parentId);
    const repliesOf = (id) => this.comments.filter((c) => c.parentId === id);
    const shown = tops.filter((c) => this.showDone || !c.resolved);
    for (const c of tops) { c.range = this.anchorOf(c); c.orphan = !c.range; }
    const open = tops.filter((c) => !c.resolved).length;
    this.commentsCount.textContent = open ? String(open) : '';
    if (window.Highlight && CSS.highlights) {
      CSS.highlights.set('de-c', new Highlight(...shown.filter((c) => c.range && !c.resolved).map((c) => c.range)));
      const on = shown.find((c) => c.id === this.active && c.range);
      if (on) CSS.highlights.set('de-c-on', new Highlight(on.range)); else CSS.highlights.delete('de-c-on');
    }
    const hasRail = (open > 0 || this.draft) && !this.previewing;
    this.el.classList.toggle('has-rail', !!hasRail && !this.narrow());
    // In the margin, each beside its words; on a narrow screen, in the panel.
    const stackTop = this.stack.getBoundingClientRect().top;
    const items = shown.filter((c) => !c.resolved).map((c) => ({ c, top: c.range ? c.range.getBoundingClientRect().top - stackTop : 1e9 }));
    if (this.draft) {
      const r = this.anchorOf(this.draft);
      items.push({ draft: true, top: r ? r.getBoundingClientRect().top - stackTop : 0 });
      if (r && window.Highlight && CSS.highlights) CSS.highlights.set('de-c-on', new Highlight(r));
    }
    items.sort((a, b) => a.top - b.top);
    const cards = items.map((it) => ({ it, el: it.draft ? this.commentCard({}, [], { draft: true }) : this.commentCard(it.c, repliesOf(it.c.id)) }));
    if (!this.narrow()) {
      this.rail.replaceChildren(...cards.map((x) => x.el));
      let floor = 0;
      for (const { it, el } of cards) {
        const want = it.top >= 1e9 ? floor : it.top;
        const top = Math.max(want, floor);
        el.style.top = `${top}px`;
        el.classList.toggle('is-on', !!(it.draft || it.c?.id === this.active));
        floor = top + el.offsetHeight + 10;
      }
    } else {
      this.rail.replaceChildren();
    }
    if (this.panelKind === 'comments') this.renderCommentsPanel(cards, tops, repliesOf);
    if (focusDraft) this.rail.querySelector('.is-draft textarea')?.focus({ preventScroll: true });
  }

  // -------------------------------------------------------- side panel (comments list, history)

  togglePanel(kind, force = false) {
    if (this.panelKind === kind && !force) { this.closePanel(); return; }
    this.panelKind = kind;
    this.panel.hidden = false;
    this.el.classList.add('has-panel');
    if (moving()) this.panel.animate([{ opacity: 0, transform: 'translateX(14px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: EASE });
    if (kind === 'comments') this.paintMarks();
    if (kind === 'history') this.renderHistory();
    setTimeout(() => this.layout(), 340);
  }

  closePanel() {
    this.panel.hidden = true;
    this.panelKind = null;
    this.el.classList.remove('has-panel');
    if (this.previewing) this.endPreview();
    setTimeout(() => this.layout(), 340);
  }

  panelHead(title, ...extra) {
    return h('div', { class: 'de-panel-head' }, h('p', { class: 'de-panel-title' }, title), ...extra,
      this.btn('close', 'Close', () => this.closePanel()));
  }

  renderCommentsPanel(cards, tops, repliesOf) {
    const toggle = h('button', { type: 'button', class: 'de-word', onclick: () => { this.showDone = !this.showDone; this.paintMarks(); } }, this.showDone ? 'Hide done' : 'Show done');
    const doneCards = this.showDone ? tops.filter((c) => c.resolved).map((c) => this.commentCard(c, repliesOf(c.id))) : [];
    const list = this.narrow() ? cards.map((x) => x.el) : [];
    this.panel.replaceChildren(this.panelHead('Comments', toggle),
      h('div', { class: 'de-panel-body' },
        ...list, ...doneCards,
        !list.length && !doneCards.length ? h('p', { class: 'de-side-hint' }, this.narrow() ? 'Select words in the document, then Comment.' : 'Comments sit in the margin beside their words. Select words to add one.') : null));
  }

  async renderHistory() {
    const body = h('div', { class: 'de-panel-body' }, h('p', { class: 'de-side-hint' }, 'Loading…'));
    const nameBtn = h('button', { type: 'button', class: 'de-word', onclick: () => this.nameVersion() }, 'Name this version');
    this.panel.replaceChildren(this.panelHead('Version history', nameBtn), body);
    try {
      await this.save();
      const { versions } = await api.get(`/api/docs/${this.id}/versions`);
      const day = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
      const time = (t) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const rows = [h('div', { class: 'de-ver is-now' }, h('span', { class: 'de-ver-name' }, 'Now'), h('span', { class: 'de-ver-meta' }, plural(this.wordCount || 0, 'word')))];
      let last = '';
      for (const v of versions) {
        const d = day(v.at);
        if (d !== last) { rows.push(h('p', { class: 'de-side-label' }, d)); last = d; }
        const row = h('button', { type: 'button', class: 'de-ver' },
          h('span', { class: 'de-ver-name' }, v.name || time(v.at)),
          h('span', { class: 'de-ver-meta' }, `${v.name ? `${time(v.at)} · ` : ''}${plural(v.words, 'word')}`));
        row.addEventListener('click', () => { for (const x of body.querySelectorAll('.de-ver')) x.classList.toggle('is-on', x === row); this.preview(v); });
        rows.push(row);
      }
      if (!versions.length) rows.push(h('p', { class: 'de-side-hint' }, 'Versions are kept as you write, every ten minutes or so.'));
      body.replaceChildren(...rows);
    } catch (err) {
      body.replaceChildren(h('p', { class: 'de-side-hint' }, err.message));
    }
  }

  nameVersion() {
    const input = h('input', { class: 'input', type: 'text', maxlength: '80', placeholder: 'e.g. First draft', autofocus: true });
    const go = async () => {
      dialog.close();
      try { await this.save(); await api.post(`/api/docs/${this.id}/versions`, { name: input.value.trim() || 'Saved version' }); this.renderHistory(); toast('Version kept'); } catch (err) { toast(err.message); }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    const dialog = openDialog({
      title: 'Name this version',
      body: h('div', null, h('p', { class: 'dialog-text' }, 'It’s kept as it is now, and never cleared away.'), input,
        h('div', { class: 'dialog-actions' },
          h('button', { type: 'button', class: 'btn', onclick: () => dialog.close() }, 'Cancel'),
          h('button', { type: 'button', class: 'btn btn-dark', onclick: go }, 'Keep it'))),
    });
  }

  async preview(v) {
    try {
      const { version } = await api.get(`/api/docs/${this.id}/versions/${v.id}`);
      if (!this.previewing) { await this.save(); this.previewing = { html: this.snapshot(), sel: this.caret() }; }
      this.flow.innerHTML = cleanHtml(version.html || fromMarkdown(version.text || ''), { own: true });
      this.flow.contentEditable = 'false';
      this.el.classList.add('is-previewing');
      const when = new Date(version.at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      this.banner.replaceChildren(
        h('span', null, version.name ? `“${version.name}”, ${when}` : when),
        h('button', { type: 'button', class: 'vbtn vbtn-glass', onclick: () => this.endPreview() }, 'Back to now'),
        h('button', { type: 'button', class: 'vbtn vbtn-blue', onclick: () => this.restoreVersion(version) }, 'Restore this version'));
      this.banner.hidden = false;
      this.layout();
      this.paintMarks();
    } catch (err) { toast(err.message); }
  }

  endPreview() {
    if (!this.previewing) return;
    const back = this.previewing;
    this.previewing = null;
    this.banner.hidden = true;
    this.el.classList.remove('is-previewing');
    this.flow.contentEditable = 'true';
    this.flow.innerHTML = back.html;
    this.layout();
    this.paintMarks();
    for (const x of this.panel.querySelectorAll('.de-ver.is-on')) x.classList.remove('is-on');
  }

  async restoreVersion(version) {
    try { await api.post(`/api/docs/${this.id}/versions`, { name: 'Before restoring' }); } catch { /* keep going */ }
    const html = this.flow.innerHTML;
    this.previewing = null;
    this.banner.hidden = true;
    this.el.classList.remove('is-previewing');
    this.flow.contentEditable = 'true';
    this.flow.innerHTML = html;
    if (version.title && version.title !== this.titleIn.value) this.titleIn.value = version.title;
    this.changed({ now: true });
    await this.save();
    toast('Restored. The version before it is kept as “Before restoring”.');
    if (this.panelKind === 'history') this.renderHistory();
  }

  // -------------------------------------------------------- closing

  async close({ switching = false } = {}) {
    if (this.closing) return;
    this.closing = true;
    if (this.previewing) this.endPreview();
    clearTimeout(this.retry);
    if (this.dirty) await Promise.race([this.save(), new Promise((r) => setTimeout(r, 2500))]);
    // A new document you never wrote in goes away.
    let gone = false;
    if (this.mine && this.fresh && !this.typed && !(this.flow.innerText || '').trim() && !this.flow.querySelector('img, table')) {
      try { await api.del(`/api/blocks/${this.id}`); bus.emit('block:deleted', { id: this.id }); gone = true; } catch { /* keep it */ }
    }
    this.off.forEach((off) => off());
    CSS.highlights?.delete('de-c');
    CSS.highlights?.delete('de-c-on');
    CSS.highlights?.delete('de-find');
    CSS.highlights?.delete('de-find-on');
    this.closeSlash();
    this.selBar.hidden = true;
    // The planet's page comes back up underneath while the page flies home.
    if (!switching) {
      const root = document.documentElement;
      root.classList.add('is-unwriting');
      root.classList.remove('is-writing');
      await this.depart();
      root.classList.remove('is-unwriting');
    }
    this.el.remove();
    if (openOne === this) openOne = null;
    if (!switching) this.prevFocus?.focus?.({ preventScroll: true });
    this.onClose?.({ id: this.id, block: this.block, gone, switching });
  }
}
