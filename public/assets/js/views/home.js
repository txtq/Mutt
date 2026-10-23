// Your drawers.

import { api, session } from '../api.js';
import { miniFace } from '../cells.js';
import { newDrawerCell } from '../entry.js';
import { nav } from '../nav.js';
import { blink, generateIcon, renderIcon } from '../pixel.js';
import { toast } from '../ui.js';
import { addFiles } from '../uploads.js';
import { fmtDate, h, plural, timeAgo } from '../util.js';

export function drawerCard(drawer, { assemble = false } = {}) {
  const icon = renderIcon(drawer.icon, { size: 45, assemble, className: 'card-icon' });
  icon.dataset.vt = `d-${drawer.id}-icon`;
  const peek = h('div', { class: 'card-peek', 'aria-hidden': 'true' },
    (drawer.previews || []).map((block, j) => {
      const face = miniFace(block);
      face.dataset.vt = `b-${block.id}`;
      return h('div', { class: 'peek', style: { '--j': j } }, face);
    }));
  const card = h('a', { class: 'card', href: `/d/${drawer.id}` },
    h('div', { class: 'card-top' }, icon),
    peek,
    h('div', { class: 'card-foot' },
      h('div', { class: 'card-title', dataset: { vt: `d-${drawer.id}-title` } }, drawer.title),
      h('div', { class: 'card-meta' }, `${plural(drawer.count || 0, 'block')} · ${timeAgo(drawer.updatedAt)}`)));

  card.addEventListener('pointerenter', () => blink(icon));
  card.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    nav.go(`/d/${drawer.id}`);
  });

  // Drop files straight onto a drawer.
  let depth = 0;
  const isFiles = (e) => e.dataTransfer?.types?.includes('Files');
  card.addEventListener('dragenter', (e) => { if (!isFiles(e)) return; depth++; card.classList.add('is-over'); blink(icon); });
  card.addEventListener('dragleave', (e) => { if (!isFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) card.classList.remove('is-over'); });
  card.addEventListener('dragover', (e) => {
    if (!isFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  });
  card.addEventListener('drop', (e) => {
    if (!isFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    depth = 0;
    card.classList.remove('is-over');
    document.dispatchEvent(new CustomEvent('mutt:dropped'));
    const files = [...e.dataTransfer.files];
    if (!files.length) return;
    addFiles(files, { drawerId: drawer.id });
    toast(`Adding ${plural(files.length, 'file')} to ${drawer.title}`);
  });

  return h('div', { class: 'cell cell-card' }, h('div', { class: 'cell-box' }, h('div', { class: 'cell-fill' }, card)));
}

export const homeView = {
  load: () => api.get('/api/drawers'),

  create(params, data) {
    const { drawers, totalBlocks } = data;
    const entry = newDrawerCell({
      onCreate: async (title) => {
        try {
          const { drawer } = await api.post('/api/drawers', { title, icon: generateIcon() });
          nav.go(`/d/${drawer.id}`);
        } catch (err) {
          toast(err.message);
          throw err;
        }
      },
    });
    const grid = h('div', { class: 'grid' }, entry, drawers.map((d) => drawerCard(d)));
    [...grid.children].forEach((el, i) => { el.style.setProperty('--i', Math.min(i, 16)); el.classList.add('reveal'); });
    if (!drawers.length) {
      grid.append(h('div', { class: 'grid-empty grid-empty-side' },
        h('p', null, 'Drawers hold anything: images, notes, links, PDFs, video, sound, files.'),
        h('p', null, 'Name your first one to start.')));
    }

    const since = session.user?.createdAt ? ` · since ${fmtDate(session.user.createdAt)}` : '';
    const el = h('div', { class: 'page' },
      h('header', { class: 'page-head' },
        h('h1', { class: 'page-title' }, session.user.username),
        h('p', { class: 'page-meta' }, `${plural(drawers.length, 'drawer')} · ${plural(totalBlocks, 'block')}${since}`)),
      grid);

    return {
      el,
      title: 'Drawers',
      dropTarget: () => ({ label: 'Drop onto a drawer to add to it' }),
    };
  },
};
