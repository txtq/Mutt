// A drawer: its critter, name and note, then the grid (drag to rearrange).
// Community drawers use the same page: anyone can add, only the maker edits.

import { api, session } from '../api.js';
import { Collection } from '../collection.js';
import { nav } from '../nav.js';
import { blink, fillIcon, generateIcon, iconEditor, renderIcon } from '../pixel.js';
import { confirmDialog, openDialog, openMenu, toast } from '../ui.js';
import { autosize, bus, h, plural, timeAgo } from '../util.js';

export const drawerView = {
  load: ([id]) => api.get(`/api/drawers/${id}`),

  create([id], data) {
    let drawer = data.drawer;
    // Your own drawers come back without `mine`; community ones say whose they are.
    const editable = drawer.mine !== false;
    const community = !!drawer.community;

    const icon = renderIcon(drawer.icon, { size: 54, assemble: true, className: 'head-icon-svg' });
    icon.dataset.vt = `d-${id}-icon`;
    const iconBtn = editable
      ? h('button', { type: 'button', class: 'head-icon', title: 'Change critter', onclick: () => editIcon() }, icon)
      : h('div', { class: 'head-icon' }, icon);
    iconBtn.addEventListener('pointerenter', () => blink(icon));

    const title = h('textarea', { class: 'head-title', rows: 1, maxlength: '80', value: drawer.title, 'aria-label': 'Drawer name', spellcheck: 'false' });
    title.dataset.vt = `d-${id}-title`;
    const desc = h('textarea', { class: 'head-desc', rows: 1, maxlength: '2000', value: drawer.description, placeholder: 'Note', 'aria-label': 'Note' });
    const meta = h('p', { class: 'head-meta' });
    const moreBtn = h('button', { type: 'button', class: 'pill pill-dots head-more', 'aria-label': 'Drawer options' }, '•••');

    const setMeta = (count) => {
      const parts = [plural(count, 'file')];
      if (community) parts.push(editable ? 'community' : `@${drawer.owner}`);
      parts.push(timeAgo(drawer.updatedAt));
      meta.textContent = parts.join(' · ');
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
    if (!editable) {
      title.readOnly = true;
      desc.readOnly = true;
      title.classList.add('head-title-static');
      desc.classList.add('head-desc-static');
      if (!drawer.description) desc.hidden = true;
    }
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
        title: 'Critter',
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
        ? h('label', { class: 'check' }, check, h('span', null, `Also delete ${plural(orphans, 'file')} only kept here`))
        : null;
      const ok = await confirmDialog({
        title: `Delete “${drawer.title}”?`,
        message: 'Its files stay in Everything.',
        confirm: 'Delete',
        danger: true,
        extra,
      });
      if (!ok) return;
      try {
        const res = await api.del(`/api/drawers/${id}${check.checked ? '?blocks=orphans' : ''}`);
        toast(res.deletedBlocks ? `Deleted with ${plural(res.deletedBlocks, 'file')}` : 'Drawer deleted');
        nav.go('/', { replace: true });
      } catch (err) {
        toast(err.message);
      }
    }

    async function setCommunity(on) {
      if (!on && !(await confirmDialog({
        title: 'Make it private?',
        message: 'Files other people added will leave the drawer.',
        confirm: 'Make private',
      }))) return;
      try {
        ({ drawer } = await api.patch(`/api/drawers/${id}`, { community: on }));
        toast(on ? 'Anyone can add to it now' : 'Private again');
        nav.go(on ? `/c/${id}` : `/d/${id}`, { replace: true });
      } catch (err) {
        toast(err.message);
      }
    }

    moreBtn.addEventListener('click', () => openMenu(moreBtn, [
      { label: 'Draw critter…', run: editIcon },
      { label: 'New critter', run: () => setIcon(generateIcon()) },
      community
        ? { label: 'Make private', run: () => setCommunity(false) }
        : { label: 'Make community drawer', run: () => setCommunity(true) },
      '-',
      { label: 'Delete drawer…', danger: true, run: remove },
    ], { align: 'end' }));

    const collection = new Collection({
      blocks: data.blocks,
      drawer,
      entry: true,
      sortable: editable,
      moderate: editable && community,
      onChange: (blocks) => {
        drawer.updatedAt = Date.now();
        setMeta(blocks.length);
        if (session.stats) session.stats.files = Math.max(session.stats.files, blocks.length);
      },
    });

    const el = h('div', { class: 'page page-drawer' },
      h('header', { class: 'head' },
        iconBtn,
        h('div', { class: 'head-text' }, title, desc, meta),
        editable ? moreBtn : null),
      collection.el);

    const inst = {
      el,
      title: drawer.title,
      drawer,
      crumbs: () => [...(community ? [{ label: 'Community', href: '/community/drawers' }] : []), { label: inst.drawer.title, icon: inst.drawer.icon }],
      list: () => collection.list(),
      dropTarget: () => collection.dropTarget(),
      pasteText: (text) => collection.pasteText(text),
      destroy: () => collection.destroy(),
    };
    return inst;
  },
};

export const communityDrawerView = {
  load: ([id]) => api.get(`/api/community/drawers/${id}`),
  create: (params, data, url) => drawerView.create(params, data, url),
};
