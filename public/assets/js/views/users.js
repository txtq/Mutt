// A person's page, and unlocking their drawers (to look, not touch) with
// their code. The People grid itself lives in Community.

import { api } from '../api.js';
import { Collection } from '../collection.js';
import { nav } from '../nav.js';
import { blink, renderIcon } from '../pixel.js';
import { openDialog, pinField } from '../ui.js';
import { h, plural, wait } from '../util.js';
import { drawerRow } from './home.js';

// Ask for someone's code. Resolves true once their drawers are open.
export function unlockDialog(username) {
  return new Promise((resolve) => {
    let done = false;
    const msg = h('p', { class: 'dialog-msg' });
    const field = pinField({
      autocomplete: 'off',
      label: `${username}'s code`,
      onComplete: async (pin) => {
        msg.textContent = '';
        field.state('busy');
        try {
          await api.post(`/api/users/${encodeURIComponent(username)}/unlock`, { pin });
          field.state('ok');
          done = true;
          await wait(380);
          dialog.close();
        } catch (err) {
          field.state('error');
          msg.textContent = err.message;
          await wait(420);
          field.state('');
          field.clear();
          field.focus();
        }
      },
    });
    const dialog = openDialog({
      title: `@${username}`,
      className: 'dialog-code',
      body: h('div', { class: 'pin-dialog' }, field.el, msg),
      onClose: () => resolve(done),
    });
    setTimeout(() => field.focus(), 60);
  });
}

export function userCard(user) {
  const critters = h('div', { class: 'ucard-critters' },
    user.critters.length
      ? user.critters.slice(0, 9).map((icon, i) => {
        const svg = renderIcon(icon, { size: 36 });
        svg.style.setProperty('--i', i);
        return svg;
      })
      : h('span', { class: 'ucard-empty' }));
  const card = h('a', { class: 'ucard', href: user.you ? '/' : `/u/${user.username}` },
    critters,
    h('div', { class: 'ucard-foot' },
      h('div', { class: 'ucard-name' }, `@${user.username}`, user.you ? h('span', { class: 'ucard-you' }, 'you') : null),
      h('div', { class: 'ucard-meta' }, `${plural(user.files, 'file')} · ${plural(user.drawers, 'drawer')}`)));
  card.addEventListener('pointerenter', () => {
    const all = card.querySelectorAll('svg.pix');
    if (all.length) blink(all[Math.floor(Math.random() * all.length)]);
  });
  return h('div', { class: 'cell cell-card' }, h('div', { class: 'cell-box' }, h('div', { class: 'cell-fill' }, card)));
}

export const userView = {
  load: ([username]) => api.get(`/api/users/${encodeURIComponent(username)}`),

  create([username], data) {
    if (data.user.you) {
      queueMicrotask(() => nav.go('/', { replace: true }));
      return { el: h('div'), title: 'Filing cabinet' };
    }
    const open = async (drawer) => {
      if (!data.unlocked && !(await unlockDialog(username))) return;
      nav.go(`/u/${username}/d/${drawer.id}`);
    };
    const unlockBtn = data.unlocked ? null : h('button', {
      type: 'button', class: 'btn btn-dark btn-sm',
      onclick: async () => { if (await unlockDialog(username)) nav.go(`/u/${username}`, { replace: true }); },
    }, 'Unlock');
    const shared = data.shared.length ? new Collection({ blocks: data.shared, readOnly: true }) : null;
    const list = h('div', { class: 'drows' },
      data.drawers.map((d) => drawerRow(d, {
        href: `/u/${username}/d/${d.id}`, locked: !data.unlocked, onOpen: open, drops: false,
      })));
    [...list.children].forEach((el, i) => { el.style.setProperty('--i', Math.min(i, 14)); el.classList.add('reveal'); });
    if (!data.drawers.length) list.append(h('div', { class: 'grid-empty' }, 'No drawers yet.'));

    const el = h('div', { class: 'page' },
      h('header', { class: 'page-head page-head-split' },
        h('div', null,
          h('h1', { class: 'page-title' }, `@${username}`),
          h('p', { class: 'page-meta' }, `${plural(data.user.files, 'file')} · ${plural(data.user.drawers, 'drawer')}`)),
        unlockBtn),
      shared ? h('h2', { class: 'section-title' }, 'Shared') : null,
      shared?.el,
      shared ? h('h2', { class: 'section-title section-gap' }, 'Drawers') : null,
      list);
    return {
      el,
      title: `@${username}`,
      crumbs: [{ label: 'Community', href: '/community' }, { label: `@${username}` }],
      list: () => shared?.list() || [],
      destroy: () => shared?.destroy(),
    };
  },
};

export const userDrawerView = {
  async load([username, id]) {
    try {
      return await api.get(`/api/users/${encodeURIComponent(username)}/drawers/${id}`);
    } catch (err) {
      if (err.status === 403) return { locked: true };
      throw err;
    }
  },

  create([username, id], data) {
    if (data.locked) {
      queueMicrotask(async () => {
        if (await unlockDialog(username)) nav.go(`/u/${username}/d/${id}`, { replace: true });
        else nav.go(`/u/${username}`, { replace: true });
      });
      return { el: h('div', { class: 'page' }), title: `@${username}` };
    }
    const { drawer, owner } = data;
    const icon = renderIcon(drawer.icon, { size: 54, className: 'head-icon-svg' });
    icon.dataset.vt = `d-${drawer.id}-icon`;
    const collection = new Collection({ blocks: data.blocks, readOnly: true, empty: 'Empty.' });
    const el = h('div', { class: 'page page-drawer' },
      h('header', { class: 'head' },
        h('div', { class: 'head-icon' }, icon),
        h('div', { class: 'head-text' },
          h('h1', { class: 'head-title head-title-static', dataset: { vt: `d-${drawer.id}-title` } }, drawer.title),
          drawer.description ? h('p', { class: 'head-desc head-desc-static' }, drawer.description) : null,
          h('p', { class: 'head-meta' }, `${plural(drawer.count, 'file')} · `,
            h('a', { href: `/u/${owner.username}` }, `@${owner.username}`)))),
      collection.el);
    return {
      el,
      title: drawer.title,
      crumbs: [{ label: `@${owner.username}`, href: `/u/${owner.username}` }, { label: drawer.title, icon: drawer.icon }],
      list: () => collection.list(),
      destroy: () => collection.destroy(),
    };
  },
};
