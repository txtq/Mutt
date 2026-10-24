// Community: files people have shared with everyone, and the people here.

import { api } from '../api.js';
import { Collection } from '../collection.js';
import { nav } from '../nav.js';
import { segmented } from '../ui.js';
import { h, plural } from '../util.js';
import { userCard } from './users.js';

function head(tab, meta) {
  const tabs = segmented(
    [{ value: 'shared', label: 'Shared' }, { value: 'people', label: 'People' }],
    tab,
    (value) => nav.go(value === 'people' ? '/community/people' : '/community'),
    { className: 'sorts', label: 'Community' },
  );
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
    const el = h('div', { class: 'page' }, head('shared', meta), collection.el);
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

export const peopleView = {
  load: () => api.get('/api/users'),

  create(params, data) {
    const grid = h('div', { class: 'grid' }, data.users.map(userCard));
    [...grid.children].forEach((el, i) => { el.style.setProperty('--i', Math.min(i, 14)); el.classList.add('reveal'); });
    const el = h('div', { class: 'page' },
      head('people', h('p', { class: 'page-meta' }, plural(data.users.length, 'person', 'people'))),
      grid);
    return { el, title: 'People' };
  },
};
