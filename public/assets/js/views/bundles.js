// Bundles: everything you've stored, sorted by kind like boards. Plus the
// Everything page, which is the unsorted pile.

import { api } from '../api.js';
import { Collection, board } from '../collection.js';
import { KINDS, KIND_LABEL } from '../kinds.js';
import { nav } from '../nav.js';
import { generateIcon } from '../pixel.js';
import { openDialog, toast } from '../ui.js';
import { h, plural } from '../util.js';

export const bundlesView = {
  load: () => api.get('/api/bundles'),

  create(params, data) {
    const grid = h('div', { class: 'grid grid-boards' },
      data.bundles.map((b, i) => {
        const el = board({ ...b, href: `/bundles/${b.kind}` });
        el.style.setProperty('--i', i);
        el.classList.add('reveal');
        return el;
      }));
    if (!data.bundles.length) grid.append(h('div', { class: 'grid-empty' }, 'Bundles appear here once you’ve added a few things.'));
    const el = h('div', { class: 'page' },
      h('header', { class: 'page-head' },
        h('h1', { class: 'page-title' }, 'Bundles'),
        h('p', { class: 'page-meta' }, `${plural(data.total, 'block')}, sorted by kind automatically`)),
      grid);
    return { el, title: 'Bundles' };
  },
};

function saveAsDrawer(blocks, suggested) {
  const input = h('input', { class: 'input', type: 'text', value: suggested, maxlength: '80', 'aria-label': 'Drawer name' });
  const form = h('form', { class: 'dialog-form' },
    h('p', { class: 'dialog-text' }, `Makes a new drawer and connects these ${plural(blocks.length, 'block')} to it. They stay where they are too.`),
    input,
    h('div', { class: 'dialog-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => dialog.close() }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn btn-dark' }, 'Make drawer')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = input.value.trim();
    if (!title) return;
    try {
      const { drawer } = await api.post('/api/drawers', { title, icon: generateIcon(), blockIds: blocks.map((b) => b.id) });
      dialog.close();
      nav.go(`/d/${drawer.id}`);
    } catch (err) {
      toast(err.message);
    }
  });
  const dialog = openDialog({ title: 'Save as a drawer', body: form });
  requestAnimationFrame(() => input.select());
}

export const bundleView = {
  load: ([kind]) => {
    if (!KINDS.includes(kind)) throw Object.assign(new Error('Not found'), { status: 404 });
    return api.get(`/api/blocks?kind=${kind}`);
  },

  create([kind], data, url) {
    const label = KIND_LABEL[kind];
    const meta = h('p', { class: 'page-meta' });
    const saveBtn = h('button', { type: 'button', class: 'btn btn-sm' }, 'Save as drawer');
    const collection = new Collection({
      blocks: data.blocks,
      url,
      chips: 'ext',
      extras: saveBtn,
      empty: 'Nothing here anymore.',
      onChange: (blocks) => { meta.textContent = `${plural(blocks.length, 'block')} from across your drawers`; },
    });
    meta.textContent = `${plural(data.blocks.length, 'block')} from across your drawers`;
    saveBtn.addEventListener('click', () => {
      const shown = collection.visible();
      if (!shown.length) return;
      const ext = collection.filter;
      saveAsDrawer(shown, ext ? `${ext.toUpperCase()} ${label.toLowerCase()}` : label);
    });
    const el = h('div', { class: 'page' },
      h('header', { class: 'page-head' },
        h('a', { class: 'page-back', href: '/bundles', onclick: (e) => { e.preventDefault(); nav.go('/bundles'); } }, '← Bundles'),
        h('h1', { class: 'page-title' }, label),
        meta),
      collection.el);
    return {
      el,
      title: label,
      crumbs: () => [{ label: 'Bundles', href: '/bundles' }, { label }],
      update: (u) => collection.update(u),
      list: () => collection.list(),
      destroy: () => collection.destroy(),
    };
  },
};

export const everythingView = {
  load: () => api.get('/api/blocks'),

  create(params, data, url) {
    const meta = h('p', { class: 'page-meta' });
    const setMeta = (blocks) => { meta.textContent = `${plural(blocks.length, 'block')}, newest first`; };
    setMeta(data.blocks);
    const collection = new Collection({
      blocks: data.blocks,
      url,
      entry: true,
      chips: 'kind',
      modes: true,
      onChange: setMeta,
    });
    const el = h('div', { class: 'page' },
      h('header', { class: 'page-head' },
        h('h1', { class: 'page-title' }, 'Everything'),
        meta),
      collection.el);
    return {
      el,
      title: 'Everything',
      update: (u) => collection.update(u),
      list: () => collection.list(),
      dropTarget: () => collection.dropTarget(),
      pasteText: (text) => collection.pasteText(text),
      destroy: () => collection.destroy(),
    };
  },
};
