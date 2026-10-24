// Things you can do to a block from anywhere: connect, remove, delete.

import { api } from './api.js';
import { displayTitle } from './kinds.js';
import { generateIcon, renderIcon } from './pixel.js';
import { confirmDialog, openMenu, openPopover, toast } from './ui.js';
import { bus, h, plural } from './util.js';

// ---------------------------------------------------------------- connect picker

export async function openConnect(anchor, block, { align = 'start' } = {}) {
  const input = h('input', { class: 'cx-input', type: 'text', placeholder: 'Find or make a drawer', 'aria-label': 'Find a drawer' });
  const list = h('div', { class: 'cx-list' }, h('div', { class: 'cx-note' }, '…'));
  const pop = openPopover(anchor, h('div', { class: 'cx' },
    h('div', { class: 'cx-head' }, h('span', null, 'Connect'), h('span', { class: 'cx-sub' }, displayTitle(block) || 'this file')),
    input, list), { width: 320, align, className: 'pop-cx' });
  requestAnimationFrame(() => input.focus());

  let drawers = [];
  let connected = new Set();
  try {
    const [all, detail] = await Promise.all([api.get('/api/drawers?lite=1'), api.get(`/api/blocks/${block.id}`)]);
    drawers = all.drawers;
    connected = new Set(detail.connections.map((d) => d.id));
  } catch (err) {
    list.replaceChildren(h('div', { class: 'cx-note' }, err.message));
    return pop;
  }

  const render = () => {
    const q = input.value.trim().toLowerCase();
    const shown = drawers.filter((d) => !q || d.title.toLowerCase().includes(q))
      .sort((a, b) => Number(connected.has(b.id)) - Number(connected.has(a.id)));
    const rows = shown.map((d) => h('button', {
      type: 'button', class: `cx-row${connected.has(d.id) ? ' is-on' : ''}`, onclick: () => toggle(d),
    },
    renderIcon(d.icon, { size: 18 }),
    h('span', { class: 'cx-title' }, d.title),
    h('span', { class: 'cx-count' }, d.count ?? ''),
    h('span', { class: 'cx-check', 'aria-hidden': 'true' })));
    const exact = drawers.some((d) => d.title.toLowerCase() === q);
    if (q && !exact) {
      rows.push(h('button', { type: 'button', class: 'cx-row cx-new', onclick: () => create(input.value.trim()) },
        h('span', { class: 'cx-plus' }, '+'), h('span', { class: 'cx-title' }, `New: ${input.value.trim()}`)));
    }
    if (!rows.length) rows.push(h('div', { class: 'cx-note' }, 'Type a name to make one'));
    list.replaceChildren(...rows);
    pop.place();
  };

  async function toggle(drawer) {
    const on = !connected.has(drawer.id);
    on ? connected.add(drawer.id) : connected.delete(drawer.id);
    drawer.count = (drawer.count || 0) + (on ? 1 : -1);
    render();
    try {
      if (on) {
        const res = await api.post(`/api/blocks/${block.id}/connections`, { drawer: drawer.id });
        bus.emit('block:connected', { block: res.block, drawerId: drawer.id, connections: res.connections });
      } else {
        const res = await api.del(`/api/blocks/${block.id}/connections/${drawer.id}`);
        bus.emit('block:disconnected', { block: res.block, drawerId: drawer.id, connections: res.connections });
      }
    } catch (err) {
      on ? connected.delete(drawer.id) : connected.add(drawer.id);
      render();
      toast(err.message);
    }
  }

  async function create(title) {
    try {
      const { drawer } = await api.post('/api/drawers', { title, icon: generateIcon() });
      drawers.unshift(drawer);
      input.value = '';
      await toggle(drawer);
      
    } catch (err) {
      toast(err.message);
    }
  }

  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = input.value.trim().toLowerCase();
    const match = drawers.find((d) => d.title.toLowerCase() === q) || drawers.find((d) => d.title.toLowerCase().includes(q));
    if (q && match) toggle(match);
    else if (q) create(input.value.trim());
  });
  render();
  return pop;
}

// ---------------------------------------------------------------- remove / delete

export async function removeFromDrawer(block, drawerId, drawerTitle) {
  try {
    const res = await api.del(`/api/blocks/${block.id}/connections/${drawerId}`);
    bus.emit('block:disconnected', { block: res.block, drawerId, connections: res.connections });
    toast(`Removed from ${drawerTitle || 'drawer'}`, {
      action: {
        label: 'Undo',
        run: async () => {
          const back = await api.post(`/api/blocks/${block.id}/connections`, { drawer: drawerId, position: res.position });
          bus.emit('block:connected', { block: back.block, drawerId, connections: back.connections, position: res.position });
        },
      },
    });
  } catch (err) {
    toast(err.message);
  }
}

export async function deleteBlock(block) {
  const ok = await confirmDialog({
    title: 'Delete this file?',
    message: block.connectionCount > 1
      ? `It leaves all ${plural(block.connectionCount, 'drawer')} it’s in. This can’t be undone.`
      : 'This can’t be undone.',
    confirm: 'Delete',
    danger: true,
  });
  if (!ok) return false;
  try {
    await api.del(`/api/blocks/${block.id}`);
    bus.emit('block:deleted', { id: block.id });
    toast('Deleted');
    return true;
  } catch (err) {
    toast(err.message);
    return false;
  }
}

export async function toggleShare(block) {
  try {
    const { block: saved } = await api.post(`/api/blocks/${block.id}/share`, { shared: !block.sharedAt });
    bus.emit('block:changed', saved);
    toast(saved.sharedAt ? 'Shared to Community' : 'No longer shared');
    return saved;
  } catch (err) {
    toast(err.message);
    return null;
  }
}

export function blockMenu(anchor, block, { drawer, open } = {}) {
  openMenu(anchor, [
    open && { label: 'Open', run: open },
    { label: 'Connect…', run: () => openConnect(anchor, block, { align: 'end' }) },
    { label: block.sharedAt ? 'Stop sharing' : 'Share to Community', run: () => toggleShare(block) },
    block.file && { label: 'Download', run: () => { location.href = `${block.file}?dl=1`; } },
    block.kind === 'link' && { label: 'Copy link', run: () => navigator.clipboard.writeText(block.content).then(() => toast('Link copied')) },
    block.kind === 'text' && { label: 'Copy text', run: () => navigator.clipboard.writeText(block.content).then(() => toast('Text copied')) },
    '-',
    drawer && { label: `Remove from ${drawer.title}`, run: () => removeFromDrawer(block, drawer.id, drawer.title) },
    { label: 'Delete', danger: true, run: () => deleteBlock(block) },
  ], { align: 'end' });
}
