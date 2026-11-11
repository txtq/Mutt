// Spelling in documents: misspelt words get a wavy underline (drawn with the
// CSS Highlight API, so the document's HTML is never touched), right-click one
// for corrections, and slips are corrected as you type, like a phone or a Mac.
// Backspace straight after a correction puts back what you typed (and leaves
// that word alone from then on); so does Undo.
//
// Only the owner gets any of this: visitors read, they don't write.

import { addWord, autocorrect, ignoreWord, known, mistakes, onWordsChanged, sentenceStart, suggest, whenReady, wordsReady } from './spell.js';
import { openContextMenu } from './ui.js';
import { debounce } from './util.js';

const AUTO_KEY = 'mutt:autocorrect';
// Typing one of these after a word finishes it.
const ENDS = /^[\s.,;:!?)\]}"”…]$/;
// Text that isn't writing to check.
const NOT_PROSE = 'pre, code, a, .de-gap, .pb, [contenteditable="false"]';
const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, figcaption, dd, dt';
// Phones and tablets have their own keyboard corrections; leave them be.
const touchOnly = () => matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;

export const autocorrectOn = () => { try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch { return true; } };
export function setAutocorrect(on) { try { localStorage.setItem(AUTO_KEY, on ? '1' : '0'); } catch { /* private window */ } }

export class DocSpelling {
  constructor(ed) {
    this.ed = ed;
    this.flow = ed.flow;
    this.bad = [];
    this.fix = null;
    this.mine = new Set();     // words put back after a correction: not corrected again here
    this.off = [];
    if (!ed.mine || touchOnly() || !window.CSS?.highlights) { this.dead = true; return; }
    this.scanSoon = debounce(() => this.scan(), 260);
    this.off.push(whenReady(() => {
      if (this.dead) return;
      // Ours from here: the browser's own underlines would double up.
      this.flow.spellcheck = false;
      this.scan();
    }));
    this.off.push(onWordsChanged(() => this.scan()));
    const on = (t, type, fn) => { t.addEventListener(type, fn); this.off.push(() => t.removeEventListener(type, fn)); };
    on(this.flow, 'contextmenu', (e) => this.menu(e));
    on(this.flow, 'keydown', (e) => this.key(e));
    on(this.flow, 'blur', () => { this.fix = null; this.scanSoon(); });
  }

  destroy() {
    this.dead = true;
    this.off.forEach((off) => off());
    CSS.highlights?.delete('mutt-spell');
    CSS.highlights?.delete('mutt-fixed');
    clearTimeout(this.flashT);
  }

  // ---------------------------------------------------------- underlines

  // Each block's text, with where every character came from.
  *blocks() {
    const seen = new Map();
    const walker = document.createTreeWalker(this.flow, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const block = n.parentElement.closest(BLOCKS) || n.parentElement;
      if (!this.flow.contains(block)) continue;
      let b = seen.get(block);
      if (!b) { b = { block, text: '', parts: [] }; seen.set(block, b); }
      const skip = !!n.parentElement.closest(NOT_PROSE);
      b.parts.push({ node: skip ? null : n, at: b.text.length, len: n.data.length });
      b.text += skip ? '\u0001'.repeat(n.data.length) : n.data;
    }
    yield* seen.values();
  }

  static point(b, i, end) {
    for (const p of b.parts) {
      if (!p.node) continue;
      if (i < p.at + p.len || (end && i === p.at + p.len)) return i >= p.at ? [p.node, i - p.at] : null;
    }
    return null;
  }

  scan() {
    if (this.dead || !wordsReady()) return;
    const sel = getSelection();
    const focused = document.activeElement === this.flow && sel.isCollapsed && sel.anchorNode?.nodeType === 3;
    this.waiting = false;
    const ranges = [];
    this.bad = [];
    for (const b of this.blocks()) {
      if (!/[A-Za-z]/.test(b.text)) continue;
      let caret = -1;
      if (focused) {
        const p = b.parts.find((q) => q.node === sel.anchorNode);
        if (p) caret = p.at + sel.anchorOffset;
      }
      for (const m of mistakes(b.text, { caret })) {
        if (this.mine.has(m.word.toLowerCase())) continue;
        const s = DocSpelling.point(b, m.start, false);
        const e = DocSpelling.point(b, m.end, true);
        if (!s || !e) continue;
        const r = document.createRange();
        r.setStart(s[0], s[1]);
        r.setEnd(e[0], e[1]);
        ranges.push(r);
        this.bad.push({ range: r, word: m.word });
      }
      if (caret >= 0) this.waiting = true;
    }
    CSS.highlights.set('mutt-spell', new Highlight(...ranges));
  }

  // The caret moved on: the word it was in can be judged now.
  moved() {
    if (this.waiting && !this.dead) this.scanSoon();
  }

  // ---------------------------------------------------------- autocorrect

  // After a key went in: if it finished a word, correct the word if we're sure.
  typed(e) {
    this.fix = null;
    if (this.dead || !wordsReady() || this.ed.composing) return;
    if (!autocorrectOn()) return;
    if (e.inputType === 'insertText' && e.data && ENDS.test(e.data)) {
      const sel = getSelection();
      const node = sel.anchorNode;
      const o = sel.anchorOffset;
      if (!sel.isCollapsed || node?.nodeType !== 3 || o < 2 || node.data[o - 1] !== e.data) return;
      this.correct(node, o - 1, e.data);
    } else if (e.inputType === 'insertParagraph') {
      // Enter: the word that ended the line before.
      const block = getSelection().anchorNode?.parentElement?.closest(BLOCKS) || getSelection().anchorNode;
      const prev = block?.previousElementSibling;
      if (!prev) return;
      const walker = document.createTreeWalker(prev, NodeFilter.SHOW_TEXT);
      let last = null;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.data) last = n;
      if (last) this.correct(last, last.data.length, null);
    }
  }

  correct(node, end, sep) {
    if (node.parentElement.closest(NOT_PROSE)) return;
    const before = node.data.slice(0, end);
    const m = /[A-Za-z]+(?:['’][A-Za-z]+)*$/.exec(before);
    if (!m) return;
    const start = end - m[0].length;
    // Part of a link, a file name, an @name or a word split by formatting.
    const chunk = /\S*$/.exec(before)[0];
    if (chunk !== m[0] && /[\w@#/\\.À-ɏ-]/.test(chunk[chunk.length - m[0].length - 1] || '')) return;
    if (start === 0 && /[\w'’]$/.test(node.previousSibling?.textContent || '')) return;
    const word = m[0];
    if (this.mine.has(word.toLowerCase())) return;
    const block = node.parentElement.closest(BLOCKS) || node.parentElement;
    const lead = document.createRange();
    lead.setStart(block, 0);
    lead.setEnd(node, start);
    const text = lead.toString();
    const atStart = sentenceStart(text + word, text.length);
    let to = autocorrect(word, { curly: true, start: atStart });
    // A new sentence starts with a capital (not in poems, lists of words, or after a line break).
    if (!to && atStart && /[.!?]\s*$/.test(text) && /^[a-z]/.test(word) && known(word) && !this.flow.classList.contains('is-poem')) {
      to = word[0].toUpperCase() + word.slice(1);
    }
    if (!to || to === word) return;
    this.ed.record();
    node.replaceData(start, word.length, to);
    if (sep !== null) {
      const r = document.createRange();
      r.setStart(node, start + to.length + sep.length);
      r.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      this.fix = { node, start, from: word, to, sep };
    }
    this.ed.lastInput = 'fix';
    this.flash(node, start, start + to.length);
  }

  // A corrected word is underlined in blue for a moment.
  flash(node, start, end) {
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, end);
    CSS.highlights.set('mutt-fixed', new Highlight(r));
    clearTimeout(this.flashT);
    this.flashT = setTimeout(() => CSS.highlights.delete('mutt-fixed'), 2200);
  }

  key(e) {
    const fix = this.fix;
    if (e.key !== 'Backspace' || !fix || e.metaKey || e.ctrlKey || e.altKey) { if (e.key.length === 1 || e.key === 'Enter') this.fix = null; return; }
    this.fix = null;
    const sel = getSelection();
    const end = fix.start + fix.to.length + fix.sep.length;
    if (!sel.isCollapsed || sel.anchorNode !== fix.node || sel.anchorOffset !== end || fix.node.data.slice(fix.start, end) !== fix.to + fix.sep) return;
    // Put back what was typed, and leave that word alone.
    e.preventDefault();
    e.stopPropagation();
    this.ed.record();
    fix.node.replaceData(fix.start, fix.to.length + fix.sep.length, fix.from);
    const r = document.createRange();
    r.setStart(fix.node, fix.start + fix.from.length);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    this.mine.add(fix.from.toLowerCase());
    CSS.highlights.delete('mutt-fixed');
    this.ed.changed({ now: true });
  }

  // ---------------------------------------------------------- right-click

  menu(e) {
    if (this.dead || !wordsReady()) return;
    const hit = this.bad.find(({ range }) => [...range.getClientRects()].some((q) =>
      e.clientX >= q.left - 1 && e.clientX <= q.right + 1 && e.clientY >= q.top - 2 && e.clientY <= q.bottom + 2));
    if (!hit || hit.range.collapsed) return;
    const word = hit.range.toString();
    const fixes = suggest(word, { curly: true });
    openContextMenu(e, [
      ...(fixes.length ? fixes.map((s) => ({ label: s, run: () => this.replace(hit.range, s) })) : [{ heading: 'No suggestions' }]),
      '-',
      { label: 'Add to my words', run: () => addWord(word) },
      { label: 'Ignore', run: () => ignoreWord(word) },
    ], { title: word, keepFocus: true });
  }

  replace(range, to) {
    this.ed.record();
    this.flow.focus({ preventScroll: true });
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('insertText', false, to);
    this.ed.changed({ now: true });
  }
}
