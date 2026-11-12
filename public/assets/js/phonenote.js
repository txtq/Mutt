// On a phone, one quiet note: Mutt is still being tested and isn't made for
// phones yet. Waved away once, it stays away on that device.

import { h } from './util.js';

const KEY = 'mutt:phone-note';
let shown = false;

const onPhone = () => matchMedia('(max-width: 700px) and (pointer: coarse)').matches;

function waved() {
  try { return localStorage.getItem(KEY) === 'away'; } catch { return false; }
}

export function phoneNote() {
  if (shown || !onPhone() || waved()) return;
  shown = true;
  const close = () => {
    try { localStorage.setItem(KEY, 'away'); } catch { /* it just comes back next visit */ }
    note.classList.add('is-leaving');
    setTimeout(() => note.remove(), 320);
  };
  const note = h('div', { class: 'tip phone-note', role: 'status' },
    h('p', { class: 'tip-text phone-note-text' }, 'Mutt is still in testing, and it isn’t made for phones yet. It works best on a computer.'),
    h('button', { type: 'button', class: 'btn btn-quiet btn-round btn-small phone-note-x', 'aria-label': 'Dismiss', onclick: close }, '×'));
  // After the page has settled, so it never arrives on top of an entrance.
  setTimeout(() => document.body.append(note), 1200);
}
