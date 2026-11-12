// The tooltip: one small glass label that says what an icon button or a
// cut-off name is called (DESIGN.md, Tooltip). Anything with a `title` gets
// it in place of the browser's own label; `data-tip` asks for one directly
// (`data-tip-now` shows it without the wait, `data-tip-at="above"` puts it on
// top). Never on touch screens.

import { h } from './util.js';

const KEY = /\s*\(([^()]{1,12})\)\s*$/;        // "Search (/)": the key in brackets
// People's own writing keeps its attributes as they wrote them.
const THEIRS = '[contenteditable="true"], [contenteditable=""], .rd-flow, .de-flow, iframe';
const WAIT = 500;
let el = null;
let timer = 0;
let current = null;
let lastShown = 0;

function tipOf(target) {
  const node = target?.closest?.('[title], [data-tip]');
  if (!node || node.closest(THEIRS)) return null;
  const title = node.getAttribute('title');
  if (title) {
    // Taken over the first time it's pointed at, so the browser's label never shows as well.
    node.dataset.tip = title;
    node.removeAttribute('title');
    if (!node.hasAttribute('aria-label') && !node.textContent.trim()) node.setAttribute('aria-label', title.replace(KEY, ''));
  }
  return node.dataset.tip ? node : null;
}

function show(node) {
  if (!node.isConnected) return;
  el ||= document.body.appendChild(h('div', { class: 'tooltip', role: 'tooltip' }));
  const text = node.dataset.tip;
  const key = text.match(KEY);
  el.replaceChildren(h('span', { class: 'tooltip-text' }, key ? text.replace(KEY, '') : text), key ? h('span', { class: 'tooltip-key' }, key[1]) : '');
  const r = node.getBoundingClientRect();
  const w = el.offsetWidth;
  const tall = el.offsetHeight;
  const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const above = node.dataset.tipAt === 'above' || r.bottom + 8 + tall > innerHeight - 8;
  const y = above ? Math.max(8, r.top - 8 - tall) : r.bottom + 8;
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  el.classList.add('is-on');
}

function hide() {
  clearTimeout(timer);
  if (el?.classList.contains('is-on')) { el.classList.remove('is-on'); lastShown = performance.now(); }
  current = null;
}

export function tooltips() {
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const node = tipOf(e.target);
    if (node === current) return;
    hide();
    if (!node) return;
    current = node;
    // Moving from one to the next, the next one is there at once.
    const soon = 'tipNow' in node.dataset || performance.now() - lastShown < 300;
    timer = setTimeout(() => show(node), soon ? 80 : WAIT);
  });
  document.addEventListener('focusin', (e) => {
    const node = tipOf(e.target);
    if (node && e.target.matches?.(':focus-visible')) { hide(); current = node; show(node); }
  });
  for (const type of ['pointerdown', 'keydown', 'focusout', 'wheel']) document.addEventListener(type, hide, { capture: true, passive: true });
  addEventListener('scroll', hide, { capture: true, passive: true });
  addEventListener('blur', hide);
}
