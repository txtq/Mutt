// Modes that answer what you're doing right now in one note (the "moment"
// modes of mutt/modes.py). They arrive by themselves as one quiet line under
// the box you're typing in, and leave by themselves when the words stop
// calling for them. Nothing moves your text or takes the cursor.
//
// The server reads the words (POST /api/moment, the same sorting.form the
// rest of Mutt uses), a pause after you stop typing, never on every key. A
// mode that's showing stays down to its lower bar, so it doesn't flicker.
// Waved away with the ×, it stays away: on that planet for good (saved in the
// planet's modes), anywhere else until the page is reloaded.

import { api } from './api.js';
import { EASE, h, reducedMotion } from './util.js';
import { icon } from './icons.js';

const PAUSE = 700;   // ms of quiet typing before the words are read
const LEAST = 200;   // shorter than this, nothing is ever asked
const waved = new Set();

// area: the textarea being written in.
// acts: { <mode key>: { label, run } }, what the line's button does here.
// drawerId: the planet it's on, when it's yours. onWave(key): remember it there.
export function momentLine(area, { acts, drawerId = null, onWave = null }) {
  const say = h('span');
  const btn = h('button', { type: 'button', class: 'btn btn-quiet btn-small dk-hint-btn' });
  const x = h('button', { type: 'button', class: 'dk-hint-x', 'aria-label': 'Not here', title: 'Not here' }, icon('close', 12));
  const el = h('div', { class: 'dk-hint', hidden: true }, say, btn, x);
  let shown = null;
  let timer = 0;
  let asked = 0;

  // Clicking the line never takes the cursor out of the note.
  for (const b of [btn, x]) b.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => { e.stopPropagation(); if (shown) acts[shown].run(); });
  x.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!shown) return;
    waved.add(shown);
    onWave?.(shown);
    show(null);
  });

  function show(key, words) {
    if (key === shown) return;
    shown = key;
    el.hidden = !key;
    if (!key) return;
    say.textContent = words || '';
    btn.textContent = acts[key].label;
    if (!reducedMotion()) el.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EASE });
  }

  async function read(text) {
    const mine = ++asked;
    try {
      const found = await api.post('/api/moment', { text, held: shown ? [shown] : [], drawer: drawerId || undefined });
      if (mine !== asked) return;  // more was typed since
      const key = Object.keys(acts).find((k) => found[k]?.fits && !waved.has(k));
      show(key || null, key ? found[key].say : '');
    } catch { /* no line, then */ }
  }

  el.check = (value) => {
    const text = (value || '').trim();
    clearTimeout(timer);
    if (text.length < LEAST) { asked += 1; show(null); return; }
    timer = setTimeout(() => read(text), PAUSE);
  };
  el.stop = () => { clearTimeout(timer); asked += 1; };
  return el;
}
