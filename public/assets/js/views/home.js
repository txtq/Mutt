// Filing cabinet: your drawers, one per row, with a peek at what's inside.

import { api, session } from '../api.js';
import { miniFace } from '../cells.js';
import { drawerHref, nav } from '../nav.js';
import { blink, generateIcon, renderIcon } from '../pixel.js';
import { critterFor } from '../theme.js';
import { toast } from '../ui.js';
import { addFiles } from '../uploads.js';
import { h, plural, timeAgo } from '../util.js';

export function drawerRow(drawer, { href = drawerHref(drawer), locked = false, onOpen, drops = true } = {}) {
  const icon = renderIcon(drawer.icon, { size: 45, className: 'drow-icon' });
  icon.dataset.vt = `d-${drawer.id}-icon`;
  const strip = h('div', { class: 'drow-strip', 'aria-hidden': 'true' });
  if (locked) {
    for (let j = 0; j < Math.min(drawer.count || 0, 7); j++) strip.append(h('div', { class: 'drow-tile is-locked', style: { '--j': j } }));
  } else {
    (drawer.previews || []).forEach((block, j) => {
      const face = miniFace(block);
      face.dataset.vt = `b-${block.id}`;
      strip.append(h('div', { class: 'drow-tile', style: { '--j': j } }, face));
    });
  }
  const row = h('a', { class: `drow${locked ? ' is-locked' : ''}`, href, style: { '--critter': drawer.icon.c } },
    h('div', { class: 'drow-info' },
      icon,
      h('div', { class: 'drow-text' },
        h('div', { class: 'drow-title', dataset: { vt: `d-${drawer.id}-title` } }, drawer.title),
        h('div', { class: 'drow-meta' },
          plural(drawer.count || 0, 'file'),
          drawer.community ? h('span', { class: 'drow-tag' }, drawer.owner && !drawer.mine ? `@${drawer.owner}` : 'community') : null,
          ` · ${timeAgo(drawer.updatedAt)}`))),
    strip);

  row.addEventListener('pointerenter', () => blink(icon));
  row.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    if (onOpen) onOpen(drawer);
    else nav.go(href);
  });

  if (drops) {
    // Drop files straight onto a drawer.
    let depth = 0;
    const isFiles = (e) => e.dataTransfer?.types?.includes('Files');
    row.addEventListener('dragenter', (e) => { if (!isFiles(e)) return; depth++; row.classList.add('is-over'); blink(icon); });
    row.addEventListener('dragleave', (e) => { if (!isFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) row.classList.remove('is-over'); });
    row.addEventListener('dragover', (e) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    });
    row.addEventListener('drop', (e) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      depth = 0;
      row.classList.remove('is-over');
      document.dispatchEvent(new CustomEvent('mutt:dropped'));
      const files = [...e.dataTransfer.files];
      if (!files.length) return;
      addFiles(files, { drawerId: drawer.id });
      toast(`Adding ${plural(files.length, 'file')} to ${drawer.title}`);
    });
  }
  return row;
}

export function newDrawerRow(onCreate, { placeholder = 'New drawer' } = {}) {
  const input = h('input', { type: 'text', placeholder, maxlength: '80', 'aria-label': placeholder });
  const form = h('form', { class: 'drow drow-new' },
    h('div', { class: 'drow-info' }, h('span', { class: 'drow-plus', 'aria-hidden': 'true' }, '+'), input));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = input.value.trim();
    if (!title) { input.focus(); return; }
    input.disabled = true;
    try {
      await onCreate(title);
      input.value = '';
    } finally {
      input.disabled = false;
    }
  });
  form.addEventListener('click', (e) => { if (e.target === form) input.focus(); });
  return form;
}

export function countLine(stats) {
  return h('p', { class: 'page-meta' },
    h('span', { class: 'file-count' }, plural(stats.files, 'file')), ` · ${plural(stats.drawers, 'drawer')}`);
}

export const homeView = {
  load: () => api.get('/api/drawers'),

  create(params, data) {
    const { drawers } = data;
    session.stats = data.stats;
    const list = h('div', { class: 'drows' },
      newDrawerRow(async (title) => {
        try {
          const { drawer } = await api.post('/api/drawers', { title, icon: generateIcon() });
          nav.go(drawerHref(drawer));
        } catch (err) {
          toast(err.message);
          throw err;
        }
      }),
      drawers.map((d) => drawerRow(d)));
    [...list.children].forEach((el, i) => { el.style.setProperty('--i', Math.min(i, 14)); el.classList.add('reveal'); });

    const el = h('div', { class: 'page' },
      h('header', { class: 'page-head' },
        h('div', { class: 'page-title-row' },
          renderIcon(critterFor(session.user.username), { size: 36, className: 'mascot' }),
          h('h1', { class: 'page-title' }, session.user.username)),
        countLine(data.stats)),
      list);

    return {
      el,
      title: 'Filing cabinet',
      dropTarget: () => ({ label: 'Drop onto a drawer' }),
    };
  },
};
