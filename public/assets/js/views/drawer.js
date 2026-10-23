// A drawer: its critter, name and notes, then the grid.

import { api, session } from '../api.js';
import { Collection } from '../collection.js';
import { nav } from '../nav.js';
import { blink, fillIcon, generateIcon, iconEditor, renderIcon } from '../pixel.js';
import { confirmDialog, openDialog, openMenu, toast } from '../ui.js';
import { autosize, bus, h, plural, timeAgo } from '../util.js';

export const drawerView = {
  load: ([id]) => api.get(`/api/drawers/${id}`),

  create([id], data, url) {
    let drawer = data.drawer;

    const icon = renderIcon(drawer.icon, { size: 54, assemble: true, className: 'head-icon-svg' });
    icon.dataset.vt = `d-${id}-icon`;
    const iconBtn = h('button', { type: 'button', class: 'head-icon', title: 'Change icon', onclick: () => editIcon() }, icon);
    iconBtn.addEventListener('pointerenter', () => blink(icon));

    const title = h('textarea', { class: 'head-title', rows: 1, maxlength: '80', value: drawer.title, 'aria-label': 'Drawer name', spellcheck: 'false' });
    title.dataset.vt = `d-${id}-title`;
    const desc = h('textarea', { class: 'head-desc', rows: 1, maxlength: '2000', value: drawer.description, placeholder: 'Add a note about this drawer…', 'aria-label': 'Description' });
    const meta = h('p', { class: 'head-meta' });
    const moreBtn = h('button', { type: 'button', class: 'pill pill-dots head-more', 'aria-label': 'Drawer options' }, '•••');

    const setMeta = (count) => {
      meta.textContent = `${plural(count, 'block')} · by ${session.user.username} · updated ${timeAgo(drawer.updatedAt)}`;
    };
    setMeta(drawer.count);

    const save = async (field, input) => {
      const value = input.value.trim();
      if (value === drawer[field]) return;
      if (field === 'title' && !value) { input.value = drawer.title; return; }
      try {
        ({ drawer } = await api.patch(`/api/drawers/${id}`, { [field]: value }));
        inst.drawer = drawer;
        input.value = drawer[field];
        bus.emit('drawer:changed', drawer);
        if (field === 'title') { inst.title = drawer.title; document.title = `${drawer.title} — Mutt`; }
      } catch (err) {
        toast(err.message);
        input.value = drawer[field];
      }
    };
    for (const [field, input] of [['title', title], ['description', desc]]) {
      autosize(input);
      input.addEventListener('blur', () => save(field, input));
      input.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' && (field === 'title' || e.metaKey || e.ctrlKey)) || e.key === 'Escape') {
          e.preventDefault();
          if (e.key === 'Escape') input.value = drawer[field];
          input.blur();
        }
      });
    }

    async function setIcon(next) {
      try {
        ({ drawer } = await api.patch(`/api/drawers/${id}`, { icon: next }));
        inst.drawer = drawer;
        fillIcon(icon, drawer.icon, true);
        bus.emit('drawer:changed', drawer);
      } catch (err) {
        toast(err.message);
      }
    }

    function editIcon() {
      const dialog = openDialog({
        title: 'Drawer critter',
        className: 'dialog-wide',
        body: iconEditor(drawer.icon, {
          onSave: (next) => { dialog.close(); setIcon(next); },
          onCancel: () => dialog.close(),
        }),
      });
    }

    async function remove() {
      let orphans = 0;
      try { ({ count: orphans } = await api.get(`/api/drawers/${id}/orphans`)); } catch { /* ask anyway */ }
      const check = h('input', { type: 'checkbox' });
      const extra = orphans
        ? h('label', { class: 'check' }, check, h('span', null, `Also delete the ${plural(orphans, 'block')} that only live${orphans === 1 ? 's' : ''} here`))
        : null;
      const ok = await confirmDialog({
        title: `Delete “${drawer.title}”?`,
        message: orphans
          ? 'Blocks stay in Everything and in any other drawers they’re connected to, unless you delete them too.'
          : 'Its blocks stay in your other drawers and in Everything.',
        confirm: 'Delete drawer',
        danger: true,
        extra,
      });
      if (!ok) return;
      try {
        const res = await api.del(`/api/drawers/${id}${check.checked ? '?blocks=orphans' : ''}`);
        toast(res.deletedBlocks ? `Drawer and ${plural(res.deletedBlocks, 'block')} deleted` : 'Drawer deleted');
        nav.go('/', { replace: true });
      } catch (err) {
        toast(err.message);
      }
    }

    moreBtn.addEventListener('click', () => openMenu(moreBtn, [
      { label: 'Draw its critter…', run: editIcon },
      { label: 'New random critter', run: () => setIcon(generateIcon()) },
      '-',
      { label: 'Delete drawer…', danger: true, run: remove },
    ], { align: 'end' }));

    const collection = new Collection({
      blocks: data.blocks,
      url,
      drawer,
      entry: true,
      sortable: true,
      chips: 'kind',
      modes: true,
      onChange: (blocks) => { drawer.updatedAt = Date.now(); setMeta(blocks.length); },
    });

    const el = h('div', { class: 'page page-drawer' },
      h('header', { class: 'head' },
        iconBtn,
        h('div', { class: 'head-text' }, title, desc, meta),
        moreBtn),
      collection.el);

    const inst = {
      el,
      title: drawer.title,
      drawer,
      crumbs: () => [{ label: inst.drawer.title, icon: inst.drawer.icon }],
      update: (u) => collection.update(u),
      list: () => collection.list(),
      dropTarget: () => collection.dropTarget(),
      pasteText: (text) => collection.pasteText(text),
      destroy: () => collection.destroy(),
    };
    return inst;
  },
};
