// Asked for a reset: what whoever runs Mutt sees (MUTT_ADMIN on the server).
// Someone who couldn't sign in asked from the sign-in page; you check it's
// them however you know them, then make a one-time link and send it yourself.
// Fetched only for the person who runs Mutt.

import { api } from './api.js';
import { openDialog, sectionHead, toast } from './ui.js';
import { DUR, EASE_LEAVE, h, plural, timeAgo } from './util.js';
import { icon } from './icons.js';

export const waitingResets = () => api.get('/api/admin/resets').then((r) => r.requests || [], () => []);

// The link, to copy and send; it isn't shown again.
function showLink(who, res) {
  const box = h('input', { class: 'field rk-key rk-link', type: 'text', readonly: true, value: res.link, spellcheck: 'false', 'aria-label': 'Reset link', onfocus: (e) => e.target.select() });
  const copy = h('button', {
    type: 'button', class: 'btn btn-small',
    onclick: async () => {
      try { await navigator.clipboard.writeText(res.link); toast('Link copied'); } catch { box.select(); toast('Press Copy on your keyboard'); }
    },
  }, icon('copy'), 'Copy');
  const dialog = openDialog({
    title: `A link for @${who}`,
    body: h('div', { class: 'rk' },
      h('p', { class: 'dialog-text' }, `Send it to @${who} yourself, somewhere you know it’s them. It lets them pick a new code, works once, and runs out in three days.`),
      box,
      h('div', { class: 'rk-tools' }, copy),
      h('div', { class: 'dialog-actions' }, h('button', { type: 'button', class: 'btn btn-main', onclick: () => dialog.close() }, 'Done'))),
  });
}

// The account sheet's section: shown only while someone is waiting.
export function resetRequests(requests) {
  const el = h('section', { class: 'sheet-resets', 'aria-label': 'Asked for a reset' });
  const head = sectionHead('Asked for a reset');
  const list = h('ul', { class: 'sheet-resets-list' });
  el.append(head.el, list);

  const paint = () => {
    el.hidden = !requests.length;
    head.fact.textContent = plural(requests.length, 'person', 'people');
    list.replaceChildren(...requests.map(item));
  };

  async function leave(r, li) {
    requests = requests.filter((x) => x.id !== r.id);
    await li.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.change, easing: EASE_LEAVE }).finished.catch(() => {});
    paint();
  }

  function item(r) {
    const li = h('li', { class: 'sheet-reset' });
    const answer = async (how, btn) => {
      btn.classList.add('is-busy');
      try {
        const res = await api.post(`/api/admin/resets/${r.id}/${how}`);
        leave(r, li);
        if (how === 'link') showLink(r.username, res);
      } catch (err) {
        btn.classList.remove('is-busy');
        toast(err.message);
      }
    };
    const link = h('button', { type: 'button', class: 'btn btn-main btn-small', onclick: (e) => answer('link', e.currentTarget) }, icon('link'), 'Make a link');
    const wave = h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: (e) => answer('wave', e.currentTarget) }, 'Not now');
    li.append(
      h('div', { class: 'sheet-reset-who' },
        h('span', { class: 'sheet-reset-name' }, `@${r.username}`, r.name ? h('span', { class: 'sheet-reset-also' }, ` · ${r.name}`) : null),
        h('span', { class: 'sheet-reset-when' }, timeAgo(r.createdAt))),
      h('p', { class: 'sheet-reset-note' }, r.note ? `“${r.note}”` : 'No note.'),
      h('div', { class: 'sheet-reset-btns' }, link, wave));
    return li;
  }

  paint();
  return el;
}
