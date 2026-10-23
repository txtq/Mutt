// Search across drawers and blocks.

import { api } from '../api.js';
import { Collection } from '../collection.js';
import { nav } from '../nav.js';
import { debounce, h, plural } from '../util.js';
import { drawerCard } from './home.js';

export const searchView = {
  load: (params, url) => {
    const q = url.searchParams.get('q') || '';
    return q.trim() ? api.get(`/api/search?q=${encodeURIComponent(q)}`) : { drawers: [], blocks: [] };
  },

  create(params, data, url) {
    let q = url.searchParams.get('q') || '';
    let collection = null;
    const input = h('input', { class: 'search-big', type: 'search', value: q, placeholder: 'Search your drawers and blocks', 'aria-label': 'Search', autocomplete: 'off' });
    const results = h('div', { class: 'search-results' });
    const go = debounce(() => {
      const next = input.value;
      nav.go(next.trim() ? `/search?q=${encodeURIComponent(next)}` : '/search', { replace: true });
    }, 220);
    input.addEventListener('input', go);

    const render = (res, u) => {
      collection?.destroy();
      collection = null;
      const parts = [];
      if (!q.trim()) {
        parts.push(h('p', { class: 'search-note' }, 'Titles, notes, text, file names and links are all searchable.'));
      } else if (!res.drawers.length && !res.blocks.length) {
        parts.push(h('p', { class: 'search-note' }, `Nothing matches “${q}”.`));
      } else {
        if (res.drawers.length) {
          const grid = h('div', { class: 'grid' }, res.drawers.map((d) => drawerCard(d)));
          parts.push(h('h2', { class: 'section-title' }, plural(res.drawers.length, 'drawer')), grid);
        }
        if (res.blocks.length) {
          collection = new Collection({ blocks: res.blocks, url: u, chips: 'kind' });
          parts.push(h('h2', { class: 'section-title' }, plural(res.blocks.length, 'block')), collection.el);
        }
      }
      results.replaceChildren(...parts);
    };
    render(data, url);

    const el = h('div', { class: 'page' },
      h('header', { class: 'page-head' }, input),
      results);

    return {
      el,
      title: 'Search',
      mounted: () => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); },
      async update(u) {
        const next = u.searchParams.get('q') || '';
        if (next === q) return collection ? collection.update(u) : true;
        q = next;
        const res = q.trim() ? await api.get(`/api/search?q=${encodeURIComponent(q)}`) : { drawers: [], blocks: [] };
        if ((u.searchParams.get('q') || '') === q) render(res, u);
        return true;
      },
      list: () => collection?.list() || [],
      destroy: () => collection?.destroy(),
    };
  },
};
