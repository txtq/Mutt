// New comments, told to a galaxy's owner: small notes under the clock, one
// per file that people commented on while you were away. Pressing one opens
// that file (on its planet, or over the galaxy for a star) at its comments;
// the close button waves it away. Either way the comments count as seen and
// don't come back. Three at a time; the next steps in when one goes.

import { api } from './api.js';
import { nav } from './nav.js';
import { exit } from './ui.js';
import { h, nameColor, timeAgo } from './util.js';
import { icon } from './icons.js';
import { KIND_ONE, displayTitle, imageSrc } from './kinds.js';
import { showCommentsOf } from './comments.js';

const AT_ONCE = 3;
const FRESH = 60000; // asked again on coming back to the galaxy after this long

const nameOf = (block) => {
  const title = displayTitle(block);
  if (title) return title;
  const words = (block.content || '').trim().replace(/\s+/g, ' ');
  return words ? (words.length > 40 ? `${words.slice(0, 38)}…` : words) : `your ${(KIND_ONE[block.kind] || 'file').toLowerCase()}`;
};

// "@sam commented on", "@sam left 3 comments on", "@sam and @jo commented on", "@sam and 2 others commented on"
function who(f) {
  const [first, second] = f.people;
  const at = (name) => h('span', { class: 'cn-at' }, `@${name}`);
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
  const shown = new Map(); // block id → its note
  const gone = new Set();  // seen here; not shown again even before the server is asked again

  function done(f) {
    gone.add(f.block.id);
    api.post('/api/comments/seen', { block: f.block.id }).catch(() => {});
    const el = shown.get(f.block.id);
    shown.delete(f.block.id);
    if (el) exit(el);
    fill();
  }

  function fill() {
    if (!wanted) return;
    let step = 0;
    for (const f of files) {
      if (shown.size >= AT_ONCE) break;
      if (shown.has(f.block.id) || gone.has(f.block.id)) continue;
      const el = commentNote(f, {
        step: step++,
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
    }
    if (shown.size && !host.isConnected) document.body.append(host);
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
      if (on) { ask(); return; }
      for (const el of shown.values()) exit(el);
      shown.clear();
    },
  };
}
