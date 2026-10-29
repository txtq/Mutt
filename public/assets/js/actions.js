// Things you can do to a file from anywhere: put it on planets, take it off, delete it.

import { api } from './api.js';
import { displayTitle } from './kinds.js';
import { drawerHref, nav } from './nav.js';
import { planetDot } from './planets.js';
import { confirmDialog, openMenu, openPopover, toast } from './ui.js';
import { bus, h, plural, wait } from './util.js';

// ---------------------------------------------------------------- connect picker

// Other people's open planets (anyone can add) show up in the pickers too.
const owned = (d) => (d.owner ? h('span', { class: 'cx-owner' }, ` @${d.owner}`) : null);

export async function openConnect(anchor, block, { align = 'start' } = {}) {
  const input = h('input', { class: 'cx-input', type: 'text', placeholder: 'Find or make a planet', 'aria-label': 'Find a planet' });
  const list = h('div', { class: 'cx-list' }, h('div', { class: 'cx-note' }, '…'));
  const pop = openPopover(anchor, h('div', { class: 'cx' },
    h('div', { class: 'cx-head' }, h('span', null, 'Planets'), h('span', { class: 'cx-sub' }, displayTitle(block) || 'this file')),
    input, list), { width: 320, align, className: 'pop-cx' });
  requestAnimationFrame(() => input.focus());

  let drawers = [];
  let connected = new Set();
  try {
    const [all, detail] = await Promise.all([api.get('/api/drawers?lite=1&community=1'), api.get(`/api/blocks/${block.id}`)]);
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
    planetDot(d),
    h('span', { class: 'cx-title' }, d.title, owned(d)),
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
      const { drawer } = await api.post('/api/drawers', { title });
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

// ---------------------------------------------------------------- link screenshots

// A new link's picture of the page arrives a few seconds after the link does.
const watching = new Set();
export async function watchPreview(block) {
  if (block?.kind !== 'link' || block.meta?.shot !== 'pending' || watching.has(block.id)) return;
  watching.add(block.id);
  try {
    for (const delay of [3000, 3000, 4000, 5000, 6000, 8000, 10000, 12000]) {
      await wait(delay);
      const { block: next } = await api.get(`/api/blocks/${block.id}`);
      if (next.meta?.shot !== 'pending') {
        bus.emit('block:changed', next);
        return;
      }
    }
  } catch { /* the link keeps whatever preview it has */ } finally {
    watching.delete(block.id);
  }
}

// ---------------------------------------------------------------- saving someone's shared file

// Pick where a copy of someone else's file goes: one of your planets, or a loose star.
export async function openSave(anchor, block, { align = 'start', onSaved } = {}) {
  const input = h('input', { class: 'cx-input', type: 'text', placeholder: 'Find or make a planet', 'aria-label': 'Find a planet' });
  const list = h('div', { class: 'cx-list' }, h('div', { class: 'cx-note' }, '…'));
  const pop = openPopover(anchor, h('div', { class: 'cx' },
    h('div', { class: 'cx-head' }, h('span', null, 'Save to'), h('span', { class: 'cx-sub' }, displayTitle(block) || 'this file')),
    input, list), { width: 320, align, className: 'pop-cx' });
  requestAnimationFrame(() => input.focus());

  let drawers = [];
  try {
    ({ drawers } = await api.get('/api/drawers?lite=1&community=1'));
  } catch (err) {
    list.replaceChildren(h('div', { class: 'cx-note' }, err.message));
    return pop;
  }

  const save = async (drawer) => {
    pop.close();
    try {
      const res = await api.post(`/api/blocks/${block.id}/save`, { drawer: drawer?.id });
      block.saved = true;
      onSaved?.(res.block);
      toast(drawer ? `Saved to ${drawer.title}` : 'Saved as a star', {
        action: { label: 'Open', run: () => nav.go(drawer ? drawerHref(drawer) : '/') },
      });
    } catch (err) {
      toast(err.message);
    }
  };

  const create = async (title) => {
    try {
      const { drawer } = await api.post('/api/drawers', { title });
      save(drawer);
    } catch (err) {
      toast(err.message);
    }
  };

  const render = () => {
    const q = input.value.trim().toLowerCase();
    const rows = [];
    if (!q) {
      rows.push(h('button', { type: 'button', class: 'cx-row', onclick: () => save(null) },
        h('span', { class: 'cx-plus' }, '✦'), h('span', { class: 'cx-title' }, 'Keep as a star')));
    }
    for (const d of drawers.filter((x) => !q || x.title.toLowerCase().includes(q))) {
      rows.push(h('button', { type: 'button', class: 'cx-row', onclick: () => save(d) },
        planetDot(d), h('span', { class: 'cx-title' }, d.title, owned(d)), h('span', { class: 'cx-count' }, d.count ?? '')));
    }
    if (q && !drawers.some((d) => d.title.toLowerCase() === q)) {
      rows.push(h('button', { type: 'button', class: 'cx-row cx-new', onclick: () => create(input.value.trim()) },
        h('span', { class: 'cx-plus' }, '+'), h('span', { class: 'cx-title' }, `New: ${input.value.trim()}`)));
    }
    list.replaceChildren(...rows);
    pop.place();
  };
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = input.value.trim().toLowerCase();
    if (!q) { save(null); return; }
    const match = drawers.find((d) => d.title.toLowerCase() === q) || drawers.find((d) => d.title.toLowerCase().includes(q));
    if (match) save(match);
    else create(input.value.trim());
  });
  render();
  return pop;
}

// ---------------------------------------------------------------- remove / delete

export async function removeFromDrawer(block, drawerId, drawerTitle) {
  try {
    const res = await api.del(`/api/blocks/${block.id}/connections/${drawerId}`);
    bus.emit('block:disconnected', { block: res.block, drawerId, connections: res.connections });
    toast(`Took it off ${drawerTitle || 'the planet'}`, {
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
      ? `It leaves all ${plural(block.connectionCount, 'planet')} it’s on. This can’t be undone.`
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
    { label: 'Move to planets…', run: () => openConnect(anchor, block, { align: 'end' }) },
    block.sharedAt && { label: 'Stop sharing', run: () => toggleShare(block) },
    block.file && { label: 'Download', run: () => { location.href = `${block.file}?dl=1`; } },
    block.kind === 'link' && { label: 'Copy link', run: () => navigator.clipboard.writeText(block.content).then(() => toast('Link copied')) },
    block.kind === 'text' && { label: 'Copy text', run: () => navigator.clipboard.writeText(block.content).then(() => toast('Text copied')) },
    '-',
    drawer && { label: `Take off ${drawer.title}`, run: () => removeFromDrawer(block, drawer.id, drawer.title) },
    { label: 'Delete', danger: true, run: () => deleteBlock(block) },
  ], { align: 'end' });
}
