// Upload queue: files go up three at a time while previews are made locally.
// Views listen for add / progress / done / fail and draw placeholders.

import { api, sendFile } from './api.js';
import { guessKind } from './kinds.js';
import { ensureLooks, lookOfBlob } from './look.js';
import { readPicture, within } from './see.js';
import { makeThumb } from './thumbs.js';
import { toast } from './ui.js';
import { bus, fmtBytes, h, plural, uid } from './util.js';

const CONCURRENCY = 3;
const queue = [];
const items = new Map();
let active = 0;

// Matches the server's default limit (MUTT_MAX_UPLOAD_MB), so a file that's
// too big is turned away at once instead of after uploading it all.
export const MAX_UPLOAD_MB = 100;
const MAX_UPLOAD = MAX_UPLOAD_MB * 1024 * 1024;

// The files that fit; says once which ones didn't.
export function withinLimit(files) {
  const ok = [];
  const big = [];
  for (const file of files) (file.size > MAX_UPLOAD ? big : ok).push(file);
  if (big.length === 1) toast(`${big[0].name || 'That file'} is ${fmtBytes(big[0].size)}. Files can be up to ${MAX_UPLOAD_MB} MB.`);
  else if (big.length) toast(`${big.length} files are over ${MAX_UPLOAD_MB} MB and weren't added.`);
  return ok;
}

export function contextKey(ctx) {
  if (ctx.share) return 'community';
  if (ctx.galaxy) return 'galaxy';
  return ctx.drawerId ? `drawer:${ctx.drawerId}` : 'loose';
}

export function addFiles(files, ctx = {}) {
  const added = [];
  for (const file of withinLimit(files)) {
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
  // Pictures and videos are sorted once we know what they show, so they
  // upload first and sort after their preview has been read.
  const visual = item.kind === 'image' || item.kind === 'video';
  const sortAfter = item.ctx.autosort && visual && !item.ctx.drawerId;
  if (item.ctx.drawerId) params.set('drawer', item.ctx.drawerId);
  if (item.ctx.share) params.set('share', '1');
  if (item.ctx.autosort && !sortAfter) params.set('autosort', '1');
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
    if (visual) {
      const source = thumb?.blob || (item.kind === 'image' ? item.file : null);
      const looking = source ? lookOfBlob(source).catch(() => null) : Promise.resolve(null);
      const reading = source ? readPicture(source).catch(() => null) : Promise.resolve(null);
      // Sorting waits a little for the reader (its first-ever load fetches the
      // model); a reading that comes later is still saved for next time.
      const [look, seen] = await Promise.all([looking, sortAfter ? within(reading, 8000) : reading]);
      if (look || seen) {
        block = (await api.patch(`/api/blocks/${block.id}`, { ...(look && { look }), ...(seen && { see: seen }) })
          .catch(() => ({ block }))).block;
      }
      if (!seen && source) {
        const id = block.id;
        reading.then((late) => late && api.patch(`/api/blocks/${id}`, { see: late }).catch(() => {}));
      }
      if (sortAfter) {
        const res = await api.post(`/api/blocks/${block.id}/autosort`, {}).catch(() => null);
        if (res) ({ block, sortedInto } = res);
      }
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
