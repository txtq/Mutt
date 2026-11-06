// What a picture shows, read on this device. A small model (CLIP, run in a
// worker, see see-worker.js) turns a picture into 512 numbers; the server
// compares those with descriptions (a sculpture, a linocut, climbing, a
// receipt...) and with the pictures already on each planet, so autosort and
// planets understand pictures, not just their names. Pictures never leave
// the device; only the numbers are saved with the file.

import { api } from './api.js';
import { imageSrc } from './kinds.js';

export const SEE_VERSION = 1; // matches mutt/sight.py VERSION
const SIZE = 224;
const MEAN = [0.48145466, 0.4578275, 0.40821073];
const STD = [0.26862954, 0.26130258, 0.27577711];

let worker = null;
let seq = 0;
const waiting = new Map();
let failures = 0;

// Not on data saver, and not where the browser can't run it.
export function canSee() {
  return failures < 3 && typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'
    && typeof createImageBitmap === 'function' && !navigator.connection?.saveData;
}

function ask(pixels) {
  if (!worker) {
    worker = new Worker(new URL('./see-worker.js', import.meta.url));
    worker.onmessage = ({ data }) => {
      const done = waiting.get(data.id);
      if (!done) return;
      waiting.delete(data.id);
      if (data.ok) done.resolve(data.embeds || null);
      else done.reject(new Error(data.error));
    };
    worker.onerror = () => {
      failures = 3; // the worker itself didn't start: give up for this visit
      for (const done of waiting.values()) done.reject(new Error('worker'));
      waiting.clear();
    };
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, pixels }, pixels ? [pixels.buffer] : []);
  }).catch((err) => {
    if (err.message !== 'not ready') failures += 1; // the server is still fetching the model: not a failure
    throw err;
  });
}

// The picture as the model wants it: the middle square, 224 pixels, in
// three planes of normalised colour.
async function pixelsOf(source) {
  const blob = source instanceof Blob ? source : await (await fetch(source, { credentials: 'same-origin' })).blob();
  const bitmap = await createImageBitmap(blob);
  const { width: w, height: h } = bitmap;
  const side = Math.min(w, h);
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(SIZE, SIZE)
    : Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff'; // transparent pictures read as on white paper
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(bitmap, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close?.();
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const plane = SIZE * SIZE;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) out[c * plane + i] = (data[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  }
  return out;
}

// 512 numbers -> 512 signed bytes, base64 (what the server keeps).
function pack(embeds) {
  let norm = 0;
  let top = 0;
  for (const x of embeds) { norm += x * x; top = Math.max(top, Math.abs(x)); }
  const bytes = new Uint8Array(embeds.length);
  for (let i = 0; i < embeds.length; i++) {
    const q = Math.max(-127, Math.min(127, Math.round((embeds[i] / top) * 127)));
    bytes[i] = q & 0xff;
  }
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return norm ? btoa(text) : null;
}

// Read a picture (a Blob or a URL): { v, e } for the server, or null.
export async function readPicture(source) {
  if (!canSee() || !source) return null;
  let pixels;
  try {
    pixels = await pixelsOf(source);
  } catch {
    return null; // a picture this browser can't open (HEIC in Chrome, say)
  }
  const embeds = await ask(pixels); // throws when the reader isn't available
  const e = embeds && pack(embeds);
  return e ? { v: SEE_VERSION, e } : null;
}

// Start fetching the model early (no picture), ignoring failures.
export function warmUp() {
  if (canSee()) ask(null).catch(() => {});
}

// Wait at most `ms` for a promise; null if it takes longer (it carries on regardless).
export function within(promise, ms) {
  return Promise.race([promise.catch(() => null), new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

const seeSource = (block) => block.thumb || imageSrc(block);
export const needsSee = (block) => block.mine !== false && block.meta?.see?.v !== SEE_VERSION && !!seeSource(block);

// Read one file's picture and save it. Resolves to the saved block, or null.
export async function seeBlock(block, source = null) {
  const seen = await readPicture(source || seeSource(block)).catch(() => null);
  if (!seen) return null;
  const res = await api.patch(`/api/blocks/${block.id}`, { see: seen }).catch(() => null);
  return res?.block || null;
}

// Quietly read pictures uploaded before this existed: a few per visit, one at
// a time, when the browser is idle. Fewer on phones and slow connections.
export async function catchUp() {
  if (!canSee() || navigator.connection?.type === 'cellular') return;
  const phone = matchMedia('(pointer: coarse)').matches;
  let blocks;
  try {
    ({ blocks } = await api.get('/api/see/todo'));
  } catch { return; }
  const idle = () => new Promise((resolve) => (window.requestIdleCallback
    ? requestIdleCallback(resolve, { timeout: 4000 }) : setTimeout(resolve, 400)));
  for (const block of blocks.filter(needsSee).slice(0, phone ? 12 : 60)) {
    if (!canSee() || document.hidden) break;
    await idle();
    let seen;
    try {
      seen = await readPicture(seeSource(block));
    } catch {
      break; // the reader isn't available right now; try again next visit
    }
    if (seen) await api.patch(`/api/blocks/${block.id}`, { see: seen }).catch(() => {});
  }
}
