// Search across your drawers and files.

import { api } from '../api.js';
import { Collection } from '../collection.js';
import { nav } from '../nav.js';
import { debounce, h, plural } from '../util.js';
import { drawerRow } from './home.js';

export const searchView = {
  load: (params, url) => {
    const q = url.searchParams.get('q') || '';
    return q.trim() ? api.get(`/api/search?q=${encodeURIComponent(q)}`) : { drawers: [], blocks: [] };
  },

  create(params, data, url) {
    let q = url.searchParams.get('q') || '';
    let collection = null;
    const input = h('input', { class: 'search-big', type: 'search', value: q, placeholder: 'Search', 'aria-label': 'Search', autocomplete: 'off' });
    const results = h('div', { class: 'search-results' });
    const go = debounce(() => {
      const next = input.value;
      nav.go(next.trim() ? `/search?q=${encodeURIComponent(next)}` : '/search', { replace: true });
    }, 220);
    input.addEventListener('input', go);

    const render = (res) => {
      collection?.destroy();
      collection = null;
      const parts = [];
      if (q.trim() && !res.drawers.length && !res.blocks.length) {
        parts.push(h('p', { class: 'search-note' }, 'Nothing.'));
      }
      if (res.drawers.length) {
        parts.push(h('h2', { class: 'section-title' }, plural(res.drawers.length, 'drawer')),
          h('div', { class: 'drows' }, res.drawers.map((d) => drawerRow(d))));
      }
      if (res.blocks.length) {
        collection = new Collection({ blocks: res.blocks });
        parts.push(h('h2', { class: 'section-title' }, plural(res.blocks.length, 'file')), collection.el);
      }
      results.replaceChildren(...parts);
    };
    render(data);

    const el = h('div', { class: 'page' }, h('header', { class: 'page-head' }, input), results);

    return {
      el,
      title: 'Search',
      mounted: () => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); },
      async update(u) {
        const next = u.searchParams.get('q') || '';
        if (next === q) return true;
        q = next;
        const res = q.trim() ? await api.get(`/api/search?q=${encodeURIComponent(q)}`) : { drawers: [], blocks: [] };
        if ((u.searchParams.get('q') || '') === q) render(res);
        return true;
      },
      list: () => collection?.list() || [],
      destroy: () => collection?.destroy(),
    };
  },
};
