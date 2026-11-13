// Comments on a file, in the side of the file view. Anyone who can see a
// file can say something about it; its owner can remove any comment (and
// whoever wrote one can take theirs back). On your own file the section stays
// out of the way until someone has commented.

import { api } from './api.js';
import { toast } from './ui.js';
import { autosize, fullDate, h, nameColor, timeAgo, touchScreen } from './util.js';
import { icon } from './icons.js';

const LIMIT = 2000;

export function commentSection(block, { go = () => {}, onCount = () => {} } = {}) {
  const owner = block.mine !== false;
  let comments = null;
  let posting = false;

  const count = h('span', { class: 'vw-cm-count' });
  const list = h('ol', { class: 'vw-cm-list', 'aria-live': 'polite' });
  const area = h('textarea', {
    class: 'vw-cm-input', rows: 1, maxlength: LIMIT, spellcheck: 'true',
    placeholder: owner ? 'Reply…' : `Say something to @${block.owner}…`, 'aria-label': 'Write a comment',
  });
  const post = h('button', { type: 'button', class: 'btn btn-main btn-small vw-cm-post', disabled: true }, 'Post');
  const left = h('span', { class: 'vw-cm-left' });
  const composer = h('div', { class: 'vw-cm-compose fglass' }, area,
    h('div', { class: 'vw-cm-bar' },
      h('span', { class: 'vw-cm-hint' }, touchScreen() ? '' : 'Enter to post · Shift+Enter for a new line'),
      left, post));
  const el = h('section', { class: 'vw-cm', 'aria-label': 'Comments' },
    h('div', { class: 'vw-cm-head' }, h('span', null, 'Comments'), count),
    list, composer);
  autosize(area);

  const changed = () => {
    const text = area.value.trim();
    post.disabled = posting || !text;
    composer.classList.toggle('has-text', !!text);
    const remaining = LIMIT - area.value.length;
    left.textContent = remaining < 200 ? String(remaining) : '';
  };
  area.addEventListener('input', changed);
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !touchScreen()) { e.preventDefault(); send(); }
    if (e.key === 'Escape' && area.value) { e.preventDefault(); e.stopPropagation(); area.value = ''; area.dispatchEvent(new Event('input')); area.blur(); }
  });
  post.addEventListener('click', send);

  async function send() {
    const body = area.value.trim();
    if (!body || posting) return;
    posting = true;
    changed();
    try {
      const res = await api.post(`/api/blocks/${block.id}/comments`, { body });
      area.value = '';
      area.dispatchEvent(new Event('input'));
      show(res.comments, { arrived: res.comments.at(-1)?.id });
    } catch (err) {
      toast(err.message);
    } finally {
      posting = false;
      changed();
    }
  }

  async function remove(c, row) {
    try {
      const res = await api.del(`/api/blocks/${block.id}/comments/${c.id}`);
      await row.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(10px)' }],
        { duration: 260, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }).finished.catch(() => {});
      show(res.comments);
      toast(c.mine ? 'Comment taken back' : 'Comment removed');
    } catch (err) {
      toast(err.message);
    }
  }

  // The × asks once in place ("Remove?") before it removes anything.
  function removeButton(c, row) {
    const btn = h('button', { type: 'button', class: 'vw-cm-x', title: c.mine ? 'Take back' : 'Remove comment', 'aria-label': c.mine ? 'Take back your comment' : `Remove @${c.by}'s comment` }, icon('close', 12));
    let armed = 0;
    btn.addEventListener('click', () => {
      if (armed) { clearTimeout(armed); remove(c, row); return; }
      btn.classList.add('is-armed');
      btn.textContent = 'Remove?';
      armed = setTimeout(() => { armed = 0; btn.classList.remove('is-armed'); btn.replaceChildren(icon('close', 12)); }, 3000);
    });
    btn.addEventListener('blur', () => {
      if (!armed) return;
      clearTimeout(armed); armed = 0; btn.classList.remove('is-armed'); btn.replaceChildren(icon('close', 12));
    });
    return btn;
  }

  function row(c) {
    const li = h('li', { class: `vw-cm-item fglass${c.byOwner ? ' is-owner' : ''}`, dataset: { id: c.id }, style: { '--who': nameColor(c.by) } });
    li.append(
      h('div', { class: 'vw-cm-meta' },
        h('span', { class: 'vw-cm-dot', 'aria-hidden': 'true' }),
        h('a', { class: 'vw-cm-by', href: `/g/${c.by}`, onclick: (e) => { e.preventDefault(); go(`/g/${c.by}`); } }, `@${c.by}`),
        c.byOwner ? h('span', { class: 'vw-cm-tag' }, owner && c.mine ? 'you' : 'owner') : (c.mine ? h('span', { class: 'vw-cm-tag' }, 'you') : null),
        h('time', { class: 'vw-cm-when', datetime: new Date(c.createdAt).toISOString(), title: fullDate(c.createdAt) }, timeAgo(c.createdAt)),
        c.canRemove ? removeButton(c, li) : null),
      h('p', { class: 'vw-cm-body' }, c.body));
    return li;
  }

  function show(next, { arrived = null } = {}) {
    comments = next;
    const n = comments.length;
    count.replaceChildren(...(n ? [icon('comment', 12), String(n)] : []));
    list.replaceChildren(...comments.map(row));
    if (!n && !owner) list.append(h('li', { class: 'vw-cm-empty' }, 'No comments yet.'));
    // Your own file shows the section only once someone has said something.
    el.hidden = owner && !n;
    // Only the first showing and a new comment come in moving.
    requestAnimationFrame(() => list.classList.add('is-settled'));
    if (arrived) {
      const li = list.querySelector(`[data-id="${CSS.escape(arrived)}"]`);
      li?.classList.add('is-new');
      li?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    if (block.commentCount !== n) {
      block.commentCount = n;
      onCount(n);
    }
  }

  el.hidden = owner && !block.commentCount;
  if (!owner || block.commentCount) list.append(h('li', { class: 'vw-cm-empty' }, '…'));
  api.get(`/api/blocks/${block.id}/comments`).then((res) => show(res.comments)).catch(() => {
    if (!comments) list.replaceChildren(h('li', { class: 'vw-cm-empty' }, 'Comments didn’t load.'));
  });

  return { el, id: block.id };
}
