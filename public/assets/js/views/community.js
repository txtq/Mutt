// Community: files people have shared with everyone, drawers anyone can add
// to, and the people here.

import { api } from '../api.js';
import { Collection } from '../collection.js';
import { nav } from '../nav.js';
import { generateIcon } from '../pixel.js';
import { segmented, toast } from '../ui.js';
import { h, plural } from '../util.js';
import { drawerRow, newDrawerRow } from './home.js';
import { userCard } from './users.js';

const TABS = [
  { value: '/community', label: 'Shared' },
  { value: '/community/drawers', label: 'Drawers' },
  { value: '/community/people', label: 'People' },
];

function head(tab, meta) {
  const tabs = segmented(TABS, tab, (value) => nav.go(value), { className: 'sorts', label: 'Community' });
  return h('header', { class: 'page-head page-head-split' },
    h('div', null, h('h1', { class: 'page-title' }, 'Community'), meta),
    tabs.el);
}

export const communityView = {
  load: () => api.get('/api/community'),

  create(params, data) {
    const meta = h('p', { class: 'page-meta' });
    const setMeta = (blocks) => { meta.textContent = plural(blocks.length, 'shared file'); };
    setMeta(data.blocks);
    // Anything added here is yours, and shared straight away.
    const collection = new Collection({
      blocks: data.blocks, entry: true, share: true, keep: (b) => !!b.sharedAt, onChange: setMeta,
    });
    const el = h('div', { class: 'page' }, head('/community', meta), collection.el);
    return {
      el,
      title: 'Community',
      list: () => collection.list(),
      dropTarget: () => collection.dropTarget(),
      pasteText: (text) => collection.pasteText(text),
      destroy: () => collection.destroy(),
    };
  },
};

export const communityDrawersView = {
  load: () => api.get('/api/community/drawers'),

  create(params, data) {
    const list = h('div', { class: 'drows' },
      newDrawerRow(async (title) => {
        try {
          const { drawer } = await api.post('/api/drawers', { title, community: true, icon: generateIcon() });
          nav.go(`/c/${drawer.id}`);
        } catch (err) {
          toast(err.message);
          throw err;
        }
      }, { placeholder: 'New community drawer' }),
      data.drawers.map((d) => drawerRow(d)));
    [...list.children].forEach((el, i) => { el.style.setProperty('--i', Math.min(i, 14)); el.classList.add('reveal'); });
    const el = h('div', { class: 'page' },
      head('/community/drawers', h('p', { class: 'page-meta' }, plural(data.drawers.length, 'drawer'))),
      list);
    return { el, title: 'Community drawers', dropTarget: () => ({ label: 'Drop onto a drawer' }) };
  },
};

export const peopleView = {
  load: () => api.get('/api/users'),

  create(params, data) {
    const grid = h('div', { class: 'grid' }, data.users.map(userCard));
    [...grid.children].forEach((el, i) => { el.style.setProperty('--i', Math.min(i, 14)); el.classList.add('reveal'); });
    const el = h('div', { class: 'page' },
      head('/community/people', h('p', { class: 'page-meta' }, plural(data.users.length, 'person', 'people'))),
      grid);
    return { el, title: 'People' };
  },
};
