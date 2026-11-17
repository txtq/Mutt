// Upload queue: files go up three at a time while previews are made locally.
// Views listen for add / progress / done / fail and draw placeholders.

import { api, sendFile } from './api.js';
import { extOf, guessKind } from './kinds.js';
import { ensureLooks, lookOfBlob } from './look.js';
import { readPicture, within } from './see.js';
import { makeThumb } from './thumbs.js';
import { toast, toastsEl } from './ui.js';
import { BEAT, bus, fmtBytes, h, plural, uid } from './util.js';

const CONCURRENCY = 3;
const queue = [];
const items = new Map();
let active = 0;

// Matches the server's default limit (MUTT_MAX_UPLOAD_MB), so a file that's
// too big is turned away at once instead of after uploading it all.
export const MAX_UPLOAD_MB = 50;
const MAX_UPLOAD = MAX_UPLOAD_MB * 1024 * 1024;
// A picture, a sound or a video over the limit is first made smaller in the
// browser (shrink.js), aiming a little under so the upload's own bytes fit too.
const AIM = Math.floor(MAX_UPLOAD * 0.97);
const STILL = new Set(['jpg', 'jpeg', 'jfif', 'png', 'webp', 'avif', 'bmp', 'heic', 'heif', 'tif', 'tiff']);
const MEDIA_MOST = 1024 * 1024 * 1024;

function canShrink(file, kind = guessKind(file)) {
  if (kind === 'image') return STILL.has(extOf(file.name)) || /^image\/(jpeg|png|webp|avif|heic|heif|tiff|bmp)$/.test(file.type);
  return (kind === 'video' || kind === 'audio') && file.size <= MEDIA_MOST;
}

// The files that fit (or can be made to); says once which ones can't.
export function withinLimit(files) {
  const ok = [];
  const big = [];
  for (const file of files) (file.size > MAX_UPLOAD && !canShrink(file) ? big : ok).push(file);
  if (big.length === 1) toast(`${big[0].name || 'That file'} is ${fmtBytes(big[0].size)}. Files can be up to ${MAX_UPLOAD_MB} MB.`);
  else if (big.length) toast(`${big.length} files are over ${MAX_UPLOAD_MB} MB and weren’t added.`);
  return ok;
}

// One file is made smaller at a time (the converter does one job at a time,
// and a big picture takes a lot of memory while it is drawn again).
let shrinking = Promise.resolve();

async function makeSmaller(item) {
  item.status = 'squeezing';
  item.progress = 0;
  bus.emit('upload:progress', item);
  tray.update();
  const turn = shrinking.catch(() => {}).then(async () => {
    const { shrink } = await import('./shrink.js');
    return shrink(item.file, AIM, {
      progress: (p) => {
        item.progress = p * 0.5;
        bus.emit('upload:progress', item);
        tray.update();
      },
      stoppable: (stop) => { item.stop = stop; },
    });
  });
  shrinking = turn;
  try {
    const smaller = await turn;
    item.squeezed = { from: item.file.size, to: smaller.size };
    item.original ||= item.file;
    item.file = smaller;
    item.name = smaller.name;
    item.base = 0.5;
  } finally {
    item.stop = null;
  }
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
  if (item.final) return;
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
  if (item.file.size > MAX_UPLOAD) {
    try {
      await makeSmaller(item);
    } catch (err) {
      item.status = 'failed';
      item.final = !err?.stopped;
      item.error = err?.stopped ? 'Stopped' : (err?.message || 'Couldn’t be made small enough');
      bus.emit('upload:fail', item);
      return;
    }
  }
  item.status = 'uploading';
  const base = item.base || 0;
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
        item.progress = base + p * (1 - base);
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
    // A voice note made by holding the void: its shape and length, which the recorder knows best.
    if (item.ctx.voice) {
      block = (await api.patch(`/api/blocks/${block.id}`, {
        voice: { wave: item.ctx.voice.wave }, duration: Math.max(1, Math.round(item.ctx.voice.seconds)),
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

// ---------------------------------------------------------------- the uploads toast

// Uploads are a toast (DESIGN.md: Uploads): its small void fills with light as
// the files go in, and the same toast says what was added.
const tray = {
  el: null,
  hideTimer: null,
  show() {
    clearTimeout(this.hideTimer);
    this.el.classList.remove('is-leaving');
    if (!this.el.isConnected) toastsEl().append(this.el);
  },
  hide() {
    if (!this.el?.isConnected || this.el.classList.contains('is-leaving')) return;
    this.el.classList.add('is-leaving');
    this.hideTimer = setTimeout(() => { this.el.classList.remove('is-leaving'); this.el.remove(); }, 300);
  },
  update() {
    const all = [...items.values()];
    const busy = all.filter((i) => i.status === 'queued' || i.status === 'uploading' || i.status === 'squeezing');
    const failed = all.filter((i) => i.status === 'failed');
    const done = all.filter((i) => i.status === 'done');
    const squeezing = all.filter((i) => i.status === 'squeezing');
    if (!this.el) {
      this.void = h('i', { class: 'toast-void', 'aria-hidden': 'true' });
      this.label = h('span');
      this.action = h('button', { type: 'button', hidden: true });
      this.el = h('div', { class: 'toast is-upload', role: 'status' }, this.void, this.label, this.action);
    }
    if (!all.length) { this.hide(); return; }
    this.show();
    this.action.hidden = true;
    this.el.classList.toggle('is-failed', !busy.length && failed.length > 0);
    if (busy.length) {
      const total = busy.length + done.length;
      const progress = all.filter((i) => i.status !== 'failed').reduce((s, i) => s + (i.status === 'done' ? 1 : i.progress), 0) / Math.max(1, total);
      // A file over the limit is being made smaller first, and can be stopped.
      const stoppable = squeezing.filter((i) => i.stop);
      if (squeezing.length) {
        this.label.textContent = squeezing.length > 1 ? `Making ${squeezing.length} files smaller to fit…` : `Making ${squeezing[0].name} smaller to fit…`;
      } else this.label.textContent = total > 1 ? `Uploading ${Math.min(total, done.length + 1)} of ${total}` : 'Uploading 1 file';
      if (stoppable.length) {
        this.action.hidden = false;
        this.action.textContent = 'Stop';
        this.action.onclick = () => stoppable.forEach((i) => i.stop?.());
      }
      this.void.style.setProperty('--p', progress.toFixed(3));
    } else if (failed.length) {
      const again = failed.filter((i) => !i.final);
      const one = failed.length === 1 && failed[0];
      this.label.textContent = one?.final ? `${one.name}: ${one.error.toLowerCase()}. Files can be up to ${MAX_UPLOAD_MB} MB.`
        : one?.error === 'Stopped' ? `${one.name} wasn’t added`
          : `${plural(failed.length, 'upload')} failed`;
      this.void.style.setProperty('--p', '0');
      if (again.length) {
        this.action.hidden = false;
        this.action.textContent = 'Retry';
        this.action.onclick = () => again.forEach((i) => retry(i.key));
      }
    } else {
      // Says when a file had to be made smaller to fit, and by how much.
      const squeezed = done.filter((i) => i.squeezed);
      const one = squeezed.length === 1 && squeezed[0].squeezed;
      this.label.textContent = `Added ${plural(done.length, 'file')}${one ? ` · made smaller to fit, ${fmtBytes(one.from)} to ${fmtBytes(one.to)}`
        : squeezed.length ? ` · ${squeezed.length} made smaller to fit` : ''}`;
      this.void.style.setProperty('--p', '1');
      this.hideTimer = setTimeout(() => this.hide(), squeezed.length ? BEAT.slow : 2200);
    }
  },
};
