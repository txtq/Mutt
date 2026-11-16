// A note's history, in the side of the file view (viewer.js fetches this file
// only for your own note once it has an earlier copy). The server keeps the
// words as they were each time a note changes (changes close together count as
// one), in the same history a document keeps. Picking an earlier copy shows it
// in place of the note, with what has changed since marked: words added since
// lit, words taken out since struck through. "Put this back" restores it, and
// keeps how it is now first, so nothing is lost.

import { api } from './api.js';
import { toast } from './ui.js';
import { h, plural } from './util.js';

const SHOWN = 5;   // copies listed before "Show all"

const day = (t) => {
  const d = new Date(t);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== today.getFullYear() && { year: 'numeric' }) });
};
const time = (t) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const when = (t) => `${day(t)}, ${time(t)}`;
const words = (text) => (text.match(/\S+/g) || []).length;

// `view` is what the file view lends: `block()` (the note as it is now),
// `show(el)` (put something on the stage in place of the note), `back()`
// (the note again), `restored(block)` (the note has new words).
export function historySection(block, view) {
  const id = block.id;
  let versions = null;
  let all = false;
  let picked = null;   // the id of the copy on the stage

  const fact = h('span', { class: 'vw-hist-fact' });
  const list = h('ol', { class: 'vw-hist-list' });
  const more = h('button', { type: 'button', class: 'btn btn-quiet btn-small vw-hist-more', hidden: true, onclick: () => { all = true; draw(); } });
  const el = h('section', { class: 'vw-hist', 'aria-label': 'History', hidden: true },
    h('div', { class: 'vw-conn-head' }, h('span', { class: 'vw-conn-label' }, 'History'), fact),
    list, more);

  function row(v) {
    const now = v === 'now';
    const btn = h('button', { type: 'button', class: `vw-hist-row${now ? ' is-now' : ''}`, dataset: { v: now ? '' : v.id } },
      h('span', { class: 'vw-hist-name' }, now ? 'Now' : v.name || when(v.at)),
      h('span', { class: 'vw-hist-meta' }, now ? plural(words(view.block().content || ''), 'word') : `${v.name ? `${when(v.at)} · ` : ''}${plural(v.words, 'word')}`));
    btn.addEventListener('click', () => (now ? close() : open(v)));
    return h('li', null, btn);
  }

  // Which row is on the stage (Now, or an earlier copy).
  function mark() {
    for (const b of list.querySelectorAll('.vw-hist-row')) b.setAttribute('aria-pressed', String(b.dataset.v === (picked || '')));
  }

  function draw() {
    const n = versions?.length || 0;
    el.hidden = !n;
    fact.textContent = n ? `${n} earlier` : '';
    const shown = all ? versions : versions.slice(0, SHOWN);
    list.replaceChildren(row('now'), ...shown.map(row));
    more.hidden = all || n <= SHOWN;
    more.textContent = `Show all ${n}`;
    mark();
  }

  async function load() {
    try {
      ({ versions } = await api.get(`/api/docs/${id}/versions`));
      draw();
    } catch { /* the section stays away */ }
  }

  async function open(v) {
    picked = v.id;
    mark();
    try {
      const { version } = await api.get(`/api/docs/${id}/versions/${v.id}`);
      if (picked !== v.id) return;
      view.show(stage(version));
    } catch (err) {
      toast(err.message);
      close();
    }
  }

  function close() {
    if (!picked) return;
    picked = null;
    mark();
    view.back();
  }

  async function putBack(version, btn) {
    btn.disabled = true;
    try {
      const { block: saved } = await api.post(`/api/docs/${id}/versions/${version.id}/restore`);
      picked = null;
      view.restored(saved);
      toast('Put back. The words it had are kept in its history.');
    } catch (err) {
      btn.disabled = false;
      toast(err.message);
    }
  }

  // The earlier copy, marked against how the note is now.
  function stage(version) {
    const now = view.block().content || '';
    const parts = marked(version.text || '', now);
    const same = parts.every(([op]) => op === '=');
    const put = h('button', { type: 'button', class: 'btn btn-main btn-small', disabled: same }, 'Put this back');
    put.addEventListener('click', () => putBack(version, put));
    const bar = h('div', { class: 'vw-hist-bar bar-glass' },
      h('div', { class: 'vw-hist-what' },
        h('span', { class: 'vw-hist-when' }, version.name ? `“${version.name}”, ${when(version.at)}` : when(version.at)),
        h('span', { class: 'vw-hist-key' }, same ? 'The same as now' : [h('ins', null, 'added since'), ' · ', h('del', null, 'taken out since')])),
      h('div', { class: 'vw-hist-btns' },
        h('button', { type: 'button', class: 'btn btn-small', onclick: close }, 'Back to now'),
        put));
    const text = h('div', { class: 'vw-hist-text' }, parts.map(([op, s]) => (op === '=' ? s : h(op === '+' ? 'ins' : 'del', null, s))));
    return h('div', { class: 'vw-media vw-text vw-hist-view' }, bar, text);
  }

  load();
  return {
    el,
    id,
    // The note changed (or was put back): list its copies again.
    update(next) {
      if (!versions) return;
      if (next.versions !== versions.length) { load(); return; }
      const now = list.querySelector('.vw-hist-row.is-now .vw-hist-meta');
      if (now) now.textContent = plural(words(next.content || ''), 'word');
    },
    // Opened from a file's menu: show the latest copy straight away.
    async reveal() {
      if (!versions) await load();
      requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      if (versions?.length) open(versions[0]);
    },
  };
}

// ---------------------------------------------------------------- what changed

// Words, the space between them and marks each count as one piece, so a change
// is shown as whole words.
const pieces = (s) => s.match(/\s+|[\p{L}\p{N}'’_-]+|[^\s\p{L}\p{N}]/gu) || [];

// [op, text] runs from `then` to `now`: '=' unchanged, '-' taken out since,
// '+' added since.
export function marked(then, now) {
  const a = pieces(then);
  const b = pieces(now);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const middle = diff(a.slice(start, endA), b.slice(start, endB))
    || [...a.slice(start, endA).map((s) => ['-', s]), ...b.slice(start, endB).map((s) => ['+', s])];
  const ops = [...a.slice(0, start).map((s) => ['=', s]), ...middle, ...a.slice(endA).map((s) => ['=', s])];
  // A changed phrase reads as one mark: changes with only spaces between them
  // join, all that was taken out first, then all that was added.
  const out = [];
  for (let i = 0; i < ops.length;) {
    if (ops[i][0] === '=') {
      if (out.at(-1)?.[0] === '=') out.at(-1)[1] += ops[i][1];
      else out.push(['=', ops[i][1]]);
      i++;
      continue;
    }
    let gone = '';
    let added = '';
    let took = false;
    let gave = false;
    for (; i < ops.length; i++) {
      const [op, s] = ops[i];
      if (op === '-') { gone += s; took = true; } else if (op === '+') { added += s; gave = true; } else if (/^\s+$/.test(s) && i + 1 < ops.length && ops[i + 1][0] !== '=') { gone += s; added += s; } else break;
    }
    if (took) out.push(['-', gone]);
    if (gave) out.push(['+', added]);
  }
  return out;
}

// The shortest set of changes between two lists of pieces (Myers). Gives up
// (null) on two texts too different to be worth marking piece by piece.
function diff(a, b, limit = 1500) {
  const n = a.length;
  const m = b.length;
  if (!n) return b.map((s) => ['+', s]);
  if (!m) return a.map((s) => ['-', s]);
  const max = n + m;
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  for (let d = 0; d <= Math.min(max, limit); d++) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) return walkBack(trace, a, b, d);
    }
  }
  return null;
}

function walkBack(trace, a, b, steps) {
  const out = [];
  let x = a.length;
  let y = b.length;
  for (let d = steps; d > 0; d--) {
    const v = trace[d];
    const at = (k) => v[k + d + 1];
    const k = x - y;
    const prev = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const px = at(prev);
    const py = px - prev;
    while (x > px && y > py) { out.push(['=', a[--x]]); y--; }
    if (x === px) out.push(['+', b[--y]]);
    else out.push(['-', a[--x]]);
  }
  while (x > 0 && y > 0) { out.push(['=', a[--x]]); y--; }
  return out.reverse();
}
