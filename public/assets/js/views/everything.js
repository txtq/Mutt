// Everything: every file you've added, sortable by time, colour, vibe,
// format, name or size.

import { api } from '../api.js';
import { Collection } from '../collection.js';
import { SORTS } from '../look.js';
import { nav } from '../nav.js';
import { segmented } from '../ui.js';
import { h, plural } from '../util.js';

const KEY = 'mutt.sort';
const valid = (s) => SORTS.some((o) => o.value === s);

function remembered() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export const everythingView = {
  load: () => api.get('/api/blocks'),

  create(params, data, url) {
    const fromUrl = url.searchParams.get('sort');
    let sort = valid(fromUrl) ? fromUrl : valid(remembered()) ? remembered() : 'new';
    const meta = h('p', { class: 'page-meta' });
    const setMeta = (blocks) => { meta.textContent = plural(blocks.length, 'file'); };
    setMeta(data.blocks);

    const collection = new Collection({ blocks: data.blocks, entry: true, sort, onChange: setMeta });
    const pick = (value) => {
      const u = nav.current();
      u.searchParams.set('sort', value);
      u.searchParams.delete('b');
      nav.go(u.pathname + u.search, { replace: true });
    };
    const bar = segmented(SORTS, sort, pick, { className: 'sorts', label: 'Sort' });

    const el = h('div', { class: 'page' },
      h('header', { class: 'page-head page-head-split' },
        h('div', null, h('h1', { class: 'page-title' }, 'Everything'), meta),
        bar.el),
      collection.el);

    return {
      el,
      title: 'Everything',
      update(u) {
        const next = u.searchParams.get('sort');
        if (!valid(next) || next === sort) return true;
        sort = next;
        try { localStorage.setItem(KEY, sort); } catch { /* fine */ }
        bar.set(sort);
        collection.setSort(sort);
        return true;
      },
      list: () => collection.list(),
      dropTarget: () => collection.dropTarget(),
      pasteText: (text) => collection.pasteText(text),
      destroy: () => collection.destroy(),
    };
  },
};
