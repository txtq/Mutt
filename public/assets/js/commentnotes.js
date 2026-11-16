// New comments, told to a galaxy's owner: small notes under the clock, one
// per file that people commented on while you were away. Pressing one opens
// that file (on its planet, or over the galaxy for a star) at its comments;
// the close button waves it away. Either way the comments count as seen and
// don't come back. Three at a time; the next steps in when one goes.
// Pressing the clock (on any page) brings back the last three files people
// commented on, seen or not, in the same column; pressing it again, Escape or
// going elsewhere puts them away.

import { api } from './api.js';
import { nav } from './nav.js';
import { exit, toast } from './ui.js';
import { bus, h, nameColor, personLabel, timeAgo } from './util.js';
import { icon } from './icons.js';
import { KIND_ONE, displayTitle, imageSrc } from './kinds.js';
import { showCommentsOf } from './comments.js';

const AT_ONCE = 3;
// A phone shows one at a time, on one line across the top, and its galaxy makes room for it.
const phone = matchMedia('(max-width: 720px)');
const atOnce = () => (phone.matches ? 1 : AT_ONCE);
const FRESH = 60000; // asked again on coming back to the galaxy after this long

const nameOf = (block) => {
  const title = displayTitle(block);
  if (title) return title;
  const words = (block.content || '').trim().replace(/\s+/g, ' ');
  return words ? (words.length > 40 ? `${words.slice(0, 38)}…` : words) : `your ${(KIND_ONE[block.kind] || 'file').toLowerCase()}`;
};

// "@sam commented on", "@sam left 3 comments on", "@sam and @jo commented on", "@sam and 2 others commented on";
// each person by the name they gave with their username, if they gave one ("Sam Ray (@sam) commented on").
function who(f) {
  const [first, second] = f.people;
  // (a phone's one line keeps only the name they gave: .cn-handle is hidden there)
  const at = (name) => {
    const given = f.names?.[name];
    return h('span', { class: 'cn-at' }, given ? [given, h('span', { class: 'cn-handle' }, ` (@${name})`)] : personLabel(name));
  };
  if (f.people.length === 1) return [at(first), f.count > 1 ? ` left ${f.count} comments on ` : ' commented on '];
  if (f.people.length === 2) return [at(first), ' and ', at(second), ' commented on '];
  return [at(first), ` and ${f.people.length - 1} others commented on `];
}

// One note: the file's picture (or the comment icon in the commenter's colour), who said
// something about which file, when, and the latest words. Also drawn on /parts.
export function commentNote(f, { step = 0, onOpen = () => {}, onClose = () => {} } = {}) {
  const thumb = imageSrc(f.block);
  const open = h('button', { type: 'button', class: 'cn-open', onclick: onOpen },
    h('span', { class: 'cn-lead', style: { '--who': nameColor(f.latest.by) } },
      thumb ? h('img', { src: thumb, alt: '', loading: 'lazy', decoding: 'async' }) : icon('comment', 12)),
    h('span', { class: 'cn-text' },
      h('span', { class: 'cn-line' },
        h('span', { class: 'cn-what' }, ...who(f), h('span', { class: 'cn-file' }, nameOf(f.block))),
        h('time', { class: 'cn-when', datetime: new Date(f.latest.createdAt).toISOString() }, timeAgo(f.latest.createdAt))),
      h('span', { class: 'cn-said' }, f.latest.body)));
  const close = h('button', {
    type: 'button', class: 'btn btn-quiet btn-round btn-small cn-x', 'aria-label': 'Dismiss', title: 'Dismiss', onclick: onClose,
  }, icon('close', 12));
  return h('div', { class: 'cn-note', style: { '--i': step } }, open, close);
}

export function commentNotes() {
  const host = h('div', { class: 'cn-notes', role: 'region', 'aria-label': 'New comments' });
  let wanted = false;
  let files = [];
  let fetchedAt = 0;
  let asking = null;
  let past = false;        // the clock's last three are showing, in place of the new ones
  let pastAsk = 0;         // which press of the clock an answer belongs to
  const shown = new Map(); // block id → its note
  const gone = new Set();  // seen here; not shown again even before the server is asked again
  const changed = new Set(); // told whenever past opens or closes

  function done(f) {
    gone.add(f.block.id);
    api.post('/api/comments/seen', { block: f.block.id }).catch(() => {});
    const el = shown.get(f.block.id);
    shown.delete(f.block.id);
    if (el) exit(el);
    if (past && !shown.size) setPast(false);
    else fill();
    room();
  }

  function note(f, step) {
    const el = commentNote(f, {
      step,
      onOpen: () => {
        done(f);
        showCommentsOf(f.block.id);
        // On its planet, so closing the file leaves you there with it; a star opens over the galaxy.
        if (f.planet) nav.go(`/p/${f.planet.id}?b=${f.block.id}`);
        else nav.openBlock(f.block.id);
      },
      onClose: () => done(f),
    });
    shown.set(f.block.id, el);
    host.append(el);
    room();
  }

  // How much of the top the notes take on a phone (0 on a computer, where they sit to the side).
  let roomFrame = 0;
  function room() {
    cancelAnimationFrame(roomFrame);
    roomFrame = requestAnimationFrame(() => {
      const live = [...shown.values()].filter((el) => el.isConnected && !el.classList.contains('is-leaving'));
      bus.emit('notes:room', phone.matches && wanted && live.length ? live.reduce((t, el) => t + el.offsetHeight + 8, 0) : 0);
    });
  }

  function clear() {
    for (const el of shown.values()) exit(el);
    shown.clear();
    room();
  }

  function fill() {
    if (!wanted || past) return;
    let step = 0;
    for (const f of files) {
      if (shown.size >= atOnce()) break;
      if (shown.has(f.block.id) || gone.has(f.block.id)) continue;
      note(f, step++);
    }
    if (shown.size && !host.isConnected) document.body.append(host);
  }

  const onKey = (e) => { if (e.key === 'Escape' && past) setPast(false); };

  async function setPast(on) {
    if (on === past) return;
    past = on;
    const ask = ++pastAsk;
    clear();
    changed.forEach((fn) => fn(past));
    if (!on) {
      document.removeEventListener('keydown', onKey);
      if (wanted) ask();
      return;
    }
    document.addEventListener('keydown', onKey);
    const res = await api.get('/api/comments/new?past=1').catch(() => null);
    if (ask !== pastAsk) return;
    const list = res?.files || [];
    if (!list.length) {
      setPast(false);
      toast(res ? 'No one has commented on your files yet' : 'Couldn’t fetch your comments');
      return;
    }
    list.slice(0, atOnce()).forEach((f, i) => note(f, i));
    if (!host.isConnected) document.body.append(host);
  }

  async function ask() {
    if (Date.now() - fetchedAt < FRESH) { fill(); return; }
    asking ||= api.get('/api/comments/new').then((res) => {
      files = res.files || [];
      fetchedAt = Date.now();
      gone.clear();
    }).catch(() => {}).finally(() => { asking = null; });
    await asking;
    fill();
  }

  return {
    // On: the owner is looking at their own galaxy (not out in the universe).
    set(on) {
      if (on === wanted) return;
      wanted = on;
      if (past) return;
      if (on) { ask(); return; }
      clear();
    },
    // The clock: the last three, or back to the new ones.
    togglePast() { setPast(!past); },
    hidePast() { setPast(false); },
    onPast(fn) { changed.add(fn); },
  };
}
