// Upload queue: files go up three at a time while previews are made locally.
// Views listen for add / progress / done / fail and draw placeholders.

import { api, sendFile } from './api.js';
import { guessKind } from './kinds.js';
import { ensureLooks } from './look.js';
import { makeThumb } from './thumbs.js';
import { bus, h, plural, uid } from './util.js';

const CONCURRENCY = 3;
const queue = [];
const items = new Map();
let active = 0;

export function contextKey(ctx) {
  if (ctx.share) return 'community';
  if (ctx.galaxy) return 'galaxy';
  return ctx.drawerId ? `drawer:${ctx.drawerId}` : 'loose';
}

export function addFiles(files, ctx = {}) {
  const added = [];
  for (const file of files) {
    const kind = guessKind(file);
    const item = {
      key: `up-${uid()}`,
      ctx,
      file,
      kind,
      name: file.name || 'Pasted file',
      preview: kind === 'image' && file.size < 60e6 ? URL.createObjectURL(file) : null,
      progress: 0,
      status: 'queued',
    };
    items.set(item.key, item);
    queue.push(item);
    added.push(item);
  }
  // Placeholders go in at the front one by one, so announce them last-first
  // to keep the order the files were picked in.
  for (const item of [...added].reverse()) bus.emit('upload:add', item);
  pump();
  tray.update();
  return added;
}

export function retry(key) {
  const item = items.get(key);
  if (!item || item.status !== 'failed') return;
  item.status = 'queued';
  item.progress = 0;
  queue.push(item);
  bus.emit('upload:progress', item);
  pump();
  tray.update();
}

export function dismiss(key) {
  const item = items.get(key);
  if (!item) return;
  if (item.preview) URL.revokeObjectURL(item.preview);
  items.delete(key);
  tray.update();
}

export function pendingFor(ctx) {
  const key = contextKey(ctx);
  return [...items.values()].filter((i) => i.status !== 'done' && contextKey(i.ctx) === key);
}

function pump() {
  while (active < CONCURRENCY && queue.length) {
    const item = queue.shift();
    active++;
    run(item).finally(() => {
      active--;
      pump();
      tray.update();
    });
  }
}

async function run(item) {
  item.status = 'uploading';
  const thumbing = makeThumb(item.file, item.kind);
  const params = new URLSearchParams({ name: item.name });
  if (item.ctx.drawerId) params.set('drawer', item.ctx.drawerId);
  if (item.ctx.share) params.set('share', '1');
  if (item.ctx.autosort) params.set('autosort', '1');
  try {
    let { block, sortedInto } = await sendFile(`/api/upload?${params}`, item.file, {
      type: item.file.type,
      onProgress: (p) => {
        item.progress = p;
        bus.emit('upload:progress', item);
        tray.update();
      },
    });
    const thumb = await thumbing;
    if (thumb?.blob) {
      const q = new URLSearchParams();
      if (thumb.width) q.set('w', thumb.width);
      if (thumb.height) q.set('h', thumb.height);
      if (thumb.duration) q.set('d', thumb.duration.toFixed(2));
      if (thumb.pages) q.set('pages', thumb.pages);
      block = (await sendFile(`/api/blocks/${block.id}/thumb?${q}`, thumb.blob).catch(() => ({ block }))).block;
    } else if (thumb && (thumb.width || thumb.duration)) {
      block = (await api.patch(`/api/blocks/${block.id}`, {
        width: thumb.width, height: thumb.height, duration: thumb.duration,
      }).catch(() => ({ block }))).block;
    }
    item.status = 'done';
    item.block = block;
    item.sortedInto = sortedInto || null;
    bus.emit('upload:done', item);
    ensureLooks([block], (b) => bus.emit('block:changed', b));
    setTimeout(() => dismiss(item.key), 4000);
  } catch (err) {
    item.status = 'failed';
    item.error = err.message;
    bus.emit('upload:fail', item);
  }
}

// ---------------------------------------------------------------- tray

const tray = {
  el: null,
  hideTimer: null,
  update() {
    const all = [...items.values()];
    const busy = all.filter((i) => i.status === 'queued' || i.status === 'uploading');
    const failed = all.filter((i) => i.status === 'failed');
    const done = all.filter((i) => i.status === 'done');
    if (!this.el) {
      this.label = h('span', { class: 'tray-label' });
      this.bar = h('span', { class: 'tray-bar' });
      this.action = h('button', { type: 'button', class: 'tray-action', hidden: true });
      this.el = h('div', { class: 'tray', role: 'status' }, this.label, this.action, this.bar);
      document.body.append(this.el);
    }
    clearTimeout(this.hideTimer);
    if (!all.length) { this.el.classList.remove('is-on'); return; }
    this.el.classList.add('is-on');
    this.action.hidden = true;
    if (busy.length) {
      const total = busy.length + done.length;
      const progress = all.filter((i) => i.status !== 'failed').reduce((s, i) => s + (i.status === 'done' ? 1 : i.progress), 0) / Math.max(1, total);
      this.label.textContent = `Uploading ${plural(busy.length, 'file')} · ${Math.round(progress * 100)}%`;
      this.bar.style.transform = `scaleX(${progress})`;
    } else if (failed.length) {
      this.label.textContent = `${plural(failed.length, 'upload')} failed`;
      this.bar.style.transform = 'scaleX(0)';
      this.action.hidden = false;
      this.action.textContent = 'Retry';
      this.action.onclick = () => failed.forEach((i) => retry(i.key));
    } else {
      this.label.textContent = `Added ${plural(done.length, 'file')}`;
      this.bar.style.transform = 'scaleX(1)';
      this.hideTimer = setTimeout(() => this.el.classList.remove('is-on'), 2200);
    }
  },
};
