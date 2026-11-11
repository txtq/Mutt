// Spelling in ordinary text boxes (notes, list items, the add box, comments):
// misspelt words get a soft wavy underline, and right-clicking one offers the
// corrections, "Add to my words" and "Ignore". Right-click anywhere else and
// the browser's own menu opens as usual.
//
// A text box can't style single words, so each one that's been focused gets a
// see-through copy laid exactly over it (`.spell-veil`, same type, padding and
// wrapping, scrolled with it) in which only the underlines show.
//
// Text boxes opt in with spellcheck="true", as before. Phones and tablets keep
// their keyboard's own corrections, so none of this runs there.

import { addWord, ignoreWord, loadWords, mistakes, onWordsChanged, suggest, wordsReady } from './spell.js';
import { openContextMenu } from './ui.js';
import { h } from './util.js';

const fields = new Map();
const COPY = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontKerning', 'fontFeatureSettings', 'fontVariationSettings',
  'letterSpacing', 'wordSpacing', 'lineHeight', 'textTransform', 'textIndent', 'textAlign', 'direction', 'tabSize',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
  'boxSizing', 'whiteSpace', 'overflowWrap', 'wordBreak'];

const touchOnly = () => matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
const wants = (t) => t instanceof HTMLTextAreaElement && (t.dataset.spell === 'on' || t.getAttribute('spellcheck') === 'true')
  && !t.readOnly && !t.disabled;

export function watchSpelling() {
  if (touchOnly() || typeof ResizeObserver === 'undefined') return;
  document.addEventListener('focusin', (e) => { if (wants(e.target) && !fields.has(e.target)) new Veil(e.target); });
  document.addEventListener('contextmenu', menu, true);
  onWordsChanged(() => fields.forEach((f) => f.render()));
}

class Veil {
  constructor(ta) {
    this.ta = ta;
    this.el = h('div', { class: 'spell-veil', 'aria-hidden': 'true' });
    fields.set(ta, this);
    this.raf = 0;
    this.soon = () => { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.render()); };
    this.onScroll = () => { this.el.scrollTop = ta.scrollTop; this.el.scrollLeft = ta.scrollLeft; };
    this.onInput = () => { clearTimeout(this.t); this.t = setTimeout(this.soon, 160); };
    ta.addEventListener('input', this.onInput);
    ta.addEventListener('scroll', this.onScroll);
    ta.addEventListener('blur', this.soon);
    ta.addEventListener('keyup', this.onKey = (e) => { if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') this.soon(); });
    ta.addEventListener('pointerup', this.soon);
    this.ro = new ResizeObserver(() => this.soon());
    this.ro.observe(ta);
    loadWords().then(() => {
      if (!fields.has(ta)) return;
      // Ours from here: the browser's own underlines would double up.
      ta.dataset.spell = 'on';
      ta.spellcheck = false;
      this.render();
    });
  }

  destroy() {
    fields.delete(this.ta);
    this.ro.disconnect();
    cancelAnimationFrame(this.raf);
    clearTimeout(this.t);
    this.ta.removeEventListener('input', this.onInput);
    this.ta.removeEventListener('scroll', this.onScroll);
    this.ta.removeEventListener('blur', this.soon);
    this.ta.removeEventListener('keyup', this.onKey);
    this.ta.removeEventListener('pointerup', this.soon);
    this.el.remove();
  }

  // Lay the copy exactly over the box.
  place() {
    const ta = this.ta;
    const el = this.el;
    if (el.previousSibling !== ta) ta.after(el);
    const cs = getComputedStyle(ta);
    for (const k of COPY) el.style[k] = cs[k];
    // Leave room for a scroll bar, as the box does.
    const bar = ta.offsetWidth - ta.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
    if (bar > 0) el.style.paddingRight = `${parseFloat(cs.paddingRight) + bar}px`;
    el.style.zIndex = cs.position !== 'static' && cs.zIndex !== 'auto' ? String(+cs.zIndex + 1) : '';
    el.style.width = `${ta.offsetWidth}px`;
    el.style.height = `${ta.offsetHeight}px`;
    el.style.left = `${ta.offsetLeft}px`;
    el.style.top = `${ta.offsetTop}px`;
    // offsetLeft/Top are from the nearest positioned parent, which isn't always where the copy is placed from.
    const a = ta.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (Math.abs(a.width - b.width) < 1 && (Math.abs(a.left - b.left) > 0.5 || Math.abs(a.top - b.top) > 0.5)) {
      el.style.left = `${ta.offsetLeft + a.left - b.left}px`;
      el.style.top = `${ta.offsetTop + a.top - b.top}px`;
    }
  }

  render() {
    const ta = this.ta;
    if (!ta.isConnected || !wants(ta)) { this.destroy(); return; }
    if (!wordsReady()) return;
    const text = ta.value;
    const focused = document.activeElement === ta && ta.selectionStart === ta.selectionEnd;
    const list = mistakes(text, { caret: focused ? ta.selectionEnd : -1 });
    this.bad = list;
    if (!list.length) { this.el.replaceChildren(); this.el.remove(); return; }
    this.place();
    const out = [];
    let at = 0;
    for (const m of list) {
      out.push(text.slice(at, m.start), h('span', { class: 'spell-bad', dataset: { start: m.start, end: m.end } }, text.slice(m.start, m.end)));
      at = m.end;
    }
    // A last empty line still takes up room in the box.
    out.push(`${text.slice(at)}​`);
    this.el.replaceChildren(...out);
    this.onScroll();
  }

  hitAt(x, y) {
    if (!this.el.isConnected) return null;
    for (const span of this.el.querySelectorAll('.spell-bad')) {
      for (const q of span.getClientRects()) {
        if (x >= q.left - 1 && x <= q.right + 1 && y >= q.top - 2 && y <= q.bottom + 2) {
          return { start: +span.dataset.start, end: +span.dataset.end, word: span.textContent };
        }
      }
    }
    return null;
  }

  replace({ start, end, word }, to) {
    const ta = this.ta;
    if (ta.value.slice(start, end) !== word) return;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(start, end);
    // Through the browser's own editing, so ⌘Z undoes it.
    if (!document.execCommand('insertText', false, to)) {
      ta.setRangeText(to, start, end, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}

function menu(e) {
  const f = fields.get(e.target);
  if (!f || !wordsReady()) return;
  const hit = f.hitAt(e.clientX, e.clientY);
  if (!hit) return;
  // This menu, not the file's or the browser's.
  e.stopPropagation();
  const fixes = suggest(hit.word);
  openContextMenu(e, [
    ...(fixes.length ? fixes.map((s) => ({ label: s, run: () => f.replace(hit, s) })) : [{ heading: 'No suggestions' }]),
    '-',
    { label: 'Add to my words', run: () => addWord(hit.word) },
    { label: 'Ignore', run: () => ignoreWord(hit.word) },
  ], { title: hit.word, keepFocus: true });
}
