// Full-screen block view: the block on the left, its details on the right.

import { deleteBlock, openConnect, openSave, removeFromDrawer, toggleShare } from './actions.js';
import { api } from './api.js';
import { KIND_ONE, displayTitle, extLabel, imageSrc } from './kinds.js';
import { markdown } from './md.js';
import { renderIcon } from './pixel.js';
import { transition } from './transitions.js';
import { toast } from './ui.js';
import { autosize, bus, fmtBytes, fmtDuration, fullDate, h, inViewport, isEditable, plural } from './util.js';

let hooks = { step: () => {}, close: () => {}, go: () => {} };
export function configureViewer(next) {
  hooks = { ...hooks, ...next };
}

let state = null;

export const viewerOpen = () => !!state;
export const viewerBlockId = () => state?.block.id;

function findCell(id) {
  const el = document.querySelector(`#view [data-vt="b-${CSS.escape(id)}"]`);
  return el && !el.closest('.is-ghosting') ? el : null;
}

export async function openViewer(id, { list = [], drawer = null } = {}) {
  const known = list.find((b) => b.id === id);
  let block = known;
  let connections = null;
  if (!block) {
    try {
      ({ block, connections } = await api.get(`/api/blocks/${id}`));
    } catch (err) {
      toast(err.message);
      hooks.close();
      return;
    }
  }
  if (state) {
    show(block, { list, drawer, connections });
    return;
  }
  state = { block, list: list.length ? list : [block], drawer, connections };
  const from = findCell(id);
  const fromVisible = from && inViewport(from) ? from : null;
  document.documentElement.classList.add('has-viewer');
  await transition(() => mount(), {
    type: 'viewer',
    before: () => (fromVisible ? [[fromVisible, `b-${id}`]] : []),
    after: () => (state?.media ? [[state.media, `b-${id}`]] : []),
  });
  if (!connections) loadConnections();
}

export async function closeViewer() {
  if (!state) return;
  const s = state;
  const id = s.block.id;
  let cell = findCell(id);
  if (cell && !inViewport(cell)) {
    cell.scrollIntoView({ block: 'center' });
  }
  cell = cell && inViewport(cell) ? cell : null;
  s.media?.querySelector('video, audio')?.pause?.();
  s.media?.matches?.('video') && s.media.pause();
  await transition(() => {
    s.el.remove();
    document.documentElement.classList.remove('has-viewer');
    removeEventListener('keydown', s.onKey);
  }, {
    type: 'viewer',
    before: () => (s.media ? [[s.media, `b-${id}`]] : []),
    after: () => (cell ? [[cell, `b-${id}`]] : []),
  });
  if (state === s) state = null;
}

// Jump to another block without leaving the viewer.
function show(block, { list, drawer, connections } = {}) {
  if (list?.length) state.list = list;
  if (drawer !== undefined) state.drawer = drawer;
  state.block = block;
  state.connections = connections || null;
  renderStage();
  renderSide();
  if (!connections) loadConnections();
}

function step(delta) {
  const { list, block } = state;
  const index = list.findIndex((b) => b.id === block.id);
  if (index < 0 || list.length < 2) return;
  const next = list[(index + delta + list.length) % list.length];
  show(next);
  state.stage.animate(
    [{ opacity: 0, transform: `translateX(${delta * 14}px)`, filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'none' }],
    { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  );
  hooks.step(next.id);
}

async function loadConnections() {
  const id = state?.block.id;
  try {
    const res = await api.get(`/api/blocks/${id}`);
    if (state?.block.id !== id) return;
    state.block = { ...state.block, ...res.block };
    state.connections = res.connections;
    renderSide();
  } catch { /* the side panel just shows what it has */ }
}

function mount() {
  const counter = h('span', { class: 'vw-count' });
  const prev = h('button', { type: 'button', class: 'vw-btn', 'aria-label': 'Previous', onclick: () => step(-1) }, '←');
  const next = h('button', { type: 'button', class: 'vw-btn', 'aria-label': 'Next', onclick: () => step(1) }, '→');
  const close = h('button', { type: 'button', class: 'vw-btn vw-close', 'aria-label': 'Close', onclick: () => hooks.close() }, 'Close');
  state.stage = h('div', { class: 'vw-stage' });
  state.side = h('aside', { class: 'vw-side' });
  state.counter = counter;
  state.nav = h('div', { class: 'vw-nav' }, prev, counter, next);
  state.el = h('div', { class: 'viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Block' },
    h('div', { class: 'vw-top' }, state.nav, close),
    state.stage,
    state.side);
  state.onKey = (e) => {
    if (e.defaultPrevented || isEditable(document.activeElement) || document.querySelector('.scrim, .pop')) return;
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  };
  addEventListener('keydown', state.onKey);
  document.body.append(state.el);
  renderStage();
  renderSide();
}

// ---------------------------------------------------------------- stage

function renderStage() {
  const { block, list } = state;
  const index = list.findIndex((b) => b.id === block.id);
  state.counter.textContent = list.length > 1 && index >= 0 ? `${index + 1} / ${list.length}` : '';
  state.nav.classList.toggle('is-single', list.length < 2);
  state.media = stageMedia(block);
  state.media.dataset.vtMedia = '';
  state.stage.dataset.kind = block.kind;
  state.stage.replaceChildren(state.media);
}

function stageMedia(block) {
  const src = imageSrc(block);
  if (block.kind === 'image' && src) {
    const img = h('img', { class: 'vw-media vw-img', src, alt: displayTitle(block), draggable: false });
    if (block.width && block.height) { img.width = block.width; img.height = block.height; }
    const full = block.ext === 'heic' || block.ext === 'heif' || block.ext === 'tif' || block.ext === 'tiff' ? null : block.file;
    if (full && full !== src) {
      const pre = new Image();
      pre.onload = () => { if (img.isConnected) img.src = full; };
      pre.src = full;
    }
    return img;
  }
  if (block.kind === 'video' && block.file) {
    const video = h('video', { class: 'vw-media vw-video', src: block.file, controls: true, playsInline: true, preload: 'metadata' });
    if (block.thumb) video.poster = block.thumb;
    if (block.width && block.height) { video.width = block.width; video.height = block.height; }
    return video;
  }
  if (block.kind === 'pdf' && block.file) {
    return h('div', { class: 'vw-media vw-doc' }, h('iframe', { src: block.file, title: displayTitle(block) }));
  }
  if (block.kind === 'link') return linkStage(block);
  if (block.kind === 'text') return textStage(block);
  if (block.kind === 'audio' && block.file) {
    return h('div', { class: 'vw-media vw-card' },
      h('div', { class: 'vw-card-ext' }, extLabel(block)),
      h('div', { class: 'vw-card-name' }, displayTitle(block)),
      h('audio', { src: block.file, controls: true, preload: 'metadata' }));
  }
  if (block.meta?.excerpt && block.file && block.size < 400 * 1024) {
    const pre = h('pre', { class: 'vw-code' }, block.meta.excerpt);
    fetch(block.file, { credentials: 'same-origin' }).then((r) => (r.ok ? r.text() : null)).then((t) => { if (t != null) pre.textContent = t; }).catch(() => {});
    return h('div', { class: 'vw-media vw-codebox' }, pre);
  }
  return h('div', { class: 'vw-media vw-card' },
    h('div', { class: 'vw-card-ext' }, extLabel(block)),
    h('div', { class: 'vw-card-name' }, block.fileName || displayTitle(block)),
    h('div', { class: 'vw-card-sub' }, fmtBytes(block.size)),
    block.file ? h('a', { class: 'btn btn-dark', href: `${block.file}?dl=1` }, 'Download') : null);
}

function linkStage(block) {
  if (block.meta?.embed) {
    return h('div', { class: 'vw-media vw-embed' },
      h('iframe', {
        src: block.meta.embed, title: displayTitle(block), allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
        allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin',
      }));
  }
  return h('div', { class: 'vw-media vw-link' },
    block.thumb ? h('img', { src: block.thumb, alt: '', class: 'vw-link-img' }) : null,
    h('div', { class: 'vw-link-body' },
      h('div', { class: 'vw-link-domain' }, block.meta?.siteName || block.meta?.domain || ''),
      h('div', { class: 'vw-link-title' }, block.title || block.content),
      block.meta?.description ? h('p', { class: 'vw-link-desc' }, block.meta.description) : null,
      h('a', { class: 'btn btn-dark', href: block.content, target: '_blank', rel: 'noopener noreferrer' }, 'Visit ↗')));
}

function textStage(block) {
  const body = h('div', { class: 'vw-text-body md', html: markdown(block.content) });
  const wrap = h('div', { class: 'vw-media vw-text' }, body);
  const edit = h('button', { type: 'button', class: 'btn btn-ghost vw-text-edit' }, 'Edit');
  edit.addEventListener('click', () => {
    const area = h('textarea', { class: 'vw-text-area', value: block.content });
    const save = h('button', { type: 'button', class: 'btn btn-dark' }, 'Save');
    const cancel = h('button', { type: 'button', class: 'btn' }, 'Cancel');
    const restore = () => wrap.replaceChildren(body, edit);
    cancel.onclick = restore;
    const commit = async () => {
      const content = area.value;
      if (content === block.content) { restore(); return; }
      try {
        const { block: saved } = await api.patch(`/api/blocks/${block.id}`, { content });
        applyUpdate(saved);
      } catch (err) { toast(err.message); }
    };
    save.onclick = commit;
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); restore(); }
    });
    wrap.replaceChildren(area, h('div', { class: 'vw-text-actions' }, cancel, save));
    autosize(area);
    area.focus();
  });
  if (block.mine !== false) wrap.append(edit);
  return wrap;
}

// ---------------------------------------------------------------- side panel

function editable(block, key, { placeholder, className }) {
  const area = h('textarea', { class: className, rows: 1, placeholder, value: block[key] || '', spellcheck: 'true' });
  autosize(area);
  const save = async () => {
    const value = area.value.trim();
    if (value === (state.block[key] || '')) return;
    try {
      const { block: saved } = await api.patch(`/api/blocks/${block.id}`, { [key]: value });
      applyUpdate(saved, { keepSide: true });
    } catch (err) {
      toast(err.message);
      area.value = state.block[key] || '';
    }
  };
  area.addEventListener('blur', save);
  area.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' && (key === 'title' || e.metaKey || e.ctrlKey)) || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      area.blur();
    }
  });
  return area;
}

function metaRows(block) {
  const rows = [['Kind', block.ext ? `${KIND_ONE[block.kind]} · ${block.ext.toUpperCase()}` : KIND_ONE[block.kind]]];
  if (block.size) rows.push(['Size', fmtBytes(block.size)]);
  if (block.width && block.height) rows.push(['Dimensions', `${block.width} × ${block.height}`]);
  if (block.duration) rows.push(['Length', fmtDuration(block.duration)]);
  if (block.meta?.pages) rows.push(['Pages', String(block.meta.pages)]);
  if (block.kind === 'text') rows.push(['Words', String((block.content.match(/\S+/g) || []).length)]);
  if (block.fileName) rows.push(['File', block.fileName]);
  rows.push(['Added', fullDate(block.createdAt)]);
  if (block.updatedAt - block.createdAt > 60000) rows.push(['Edited', fullDate(block.updatedAt)]);
  const from = block.meta?.savedFrom;
  if (from && block.mine !== false) {
    rows.push(['From', h('a', { href: `/u/${from.username}`, onclick: (e) => { e.preventDefault(); hooks.go(`/u/${from.username}`); } }, `@${from.username}`)]);
  }
  const source = block.kind === 'link' ? block.content : block.meta?.source;
  if (source) rows.push(['Source', h('a', { href: source, target: '_blank', rel: 'noopener noreferrer' }, block.meta?.domain || source)]);
  return h('dl', { class: 'vw-meta' }, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
}

function saveButton(block) {
  const btn = h('button', { type: 'button', class: 'btn btn-dark btn-save' }, block.saved ? 'Saved ✓' : 'Save →');
  btn.addEventListener('click', () => openSave(btn, state.block, {
    align: 'end',
    onSaved: () => {
      state.block = { ...state.block, saved: true };
      bus.emit('block:saved', state.block);
      renderSide();
    },
  }));
  return h('div', { class: 'vw-save' }, btn);
}

function renderSide() {
  const { block, connections, drawer } = state;
  const actions = h('div', { class: 'vw-actions' },
    block.file ? h('a', { class: 'btn', href: `${block.file}?dl=1` }, 'Download') : null,
    block.file && block.kind !== 'pdf' ? h('a', { class: 'btn btn-ghost', href: block.file, target: '_blank', rel: 'noopener' }, 'Original ↗') : null,
    block.file && block.kind === 'pdf' ? h('a', { class: 'btn btn-ghost', href: block.file, target: '_blank', rel: 'noopener' }, 'Open ↗') : null,
    block.kind === 'link' ? h('a', { class: 'btn', href: block.content, target: '_blank', rel: 'noopener noreferrer' }, 'Visit ↗') : null,
    block.mine !== false ? h('button', {
      type: 'button', class: `btn btn-share${block.sharedAt ? ' is-on' : ''}`, 'aria-pressed': String(!!block.sharedAt),
      onclick: () => toggleShare(state.block),
    }, block.sharedAt ? 'Shared ✓' : 'Share') : null);

  const count = connections?.length ?? block.connectionCount ?? 0;

  // Someone else's file, seen through a drawer you unlocked: look, don't touch.
  if (block.mine === false) {
    const owner = block.owner;
    state.side.replaceChildren(
      h('h2', { class: 'vw-title vw-title-static' }, displayTitle(block) || 'Untitled'),
      block.description ? h('p', { class: 'vw-desc vw-desc-static' }, block.description) : null,
      h('a', { class: 'vw-owner', href: `/u/${owner}`, onclick: (e) => { e.preventDefault(); hooks.go(`/u/${owner}`); } }, `@${owner}`),
      actions,
      block.sharedAt ? saveButton(block) : null,
      metaRows(block),
      connections?.length ? h('section', { class: 'vw-conn-head' }, h('span', null, plural(count, 'drawer'))) : null,
      connections?.length ? h('ul', { class: 'vw-conns' }, connections.map((d) => h('li', null,
        h('a', {
          href: `/u/${owner}/d/${d.id}`, class: 'vw-conn',
          onclick: (e) => { e.preventDefault(); hooks.go(`/u/${owner}/d/${d.id}`); },
        }, renderIcon(d.icon, { size: 18 }), h('span', null, d.title))))) : null);
    return;
  }

  const connectBtn = h('button', { type: 'button', class: 'btn btn-dark btn-sm' }, 'Connect →');
  connectBtn.addEventListener('click', () => openConnect(connectBtn, state.block, { align: 'end' }));

  const list = connections == null
    ? h('div', { class: 'vw-conn-note' }, '…')
    : connections.length
      ? h('ul', { class: 'vw-conns' }, connections.map((d) => h('li', null,
        h('a', { href: `/d/${d.id}`, class: 'vw-conn', onclick: (e) => { e.preventDefault(); hooks.go(`/d/${d.id}`); } },
          renderIcon(d.icon, { size: 18 }), h('span', null, d.title)),
        h('button', {
          type: 'button', class: 'vw-conn-x', 'aria-label': `Remove from ${d.title}`, title: `Remove from ${d.title}`,
          onclick: () => removeFromDrawer(state.block, d.id, d.title),
        }, '×'))))
      : null;

  state.side.replaceChildren(
    editable(block, 'title', { placeholder: 'Untitled', className: 'vw-title' }),
    editable(block, 'description', { placeholder: 'Note', className: 'vw-desc' }),
    actions,
    metaRows(block),
    h('section', { class: 'vw-conn-head' },
      h('span', null, count ? plural(count, 'drawer') : 'Drawers'),
      connectBtn),
    list,
    h('div', { class: 'vw-danger' },
      drawer && connections?.some((d) => d.id === drawer.id)
        ? h('button', { type: 'button', class: 'link', onclick: () => removeFromDrawer(state.block, drawer.id, drawer.title) }, `Remove from ${drawer.title}`)
        : null,
      h('button', {
        type: 'button', class: 'link is-danger',
        onclick: async () => { if (await deleteBlock(state.block)) hooks.close(); },
      }, 'Delete')));
}

function applyUpdate(block, { keepSide = false } = {}) {
  if (!state || state.block.id !== block.id) return;
  state.block = { ...state.block, ...block };
  state.list = state.list.map((b) => (b.id === block.id ? state.block : b));
  bus.emit('block:changed', state.block);
  if (block.kind === 'text') renderStage();
  if (!keepSide) renderSide();
}

bus.on('block:changed', (block) => {
  if (state?.block.id !== block.id || state.block.sharedAt === block.sharedAt) return;
  state.block = { ...state.block, ...block };
  renderSide();
});
bus.on('block:connected', ({ block, connections }) => {
  if (state?.block.id !== block.id) return;
  state.connections = connections;
  state.block = { ...state.block, ...block };
  renderSide();
});
bus.on('block:disconnected', ({ block, connections }) => {
  if (state?.block.id !== block.id) return;
  state.connections = connections;
  state.block = { ...state.block, ...block };
  renderSide();
});
