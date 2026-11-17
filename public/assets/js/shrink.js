// Making a file small enough to upload, in the browser, before it is turned
// away (uploads.js asks for a file over the limit; DESIGN.md "Toast": Uploads).
// Fetched only the first time a file is too big.
//
// Pictures are drawn again on a canvas: a JPEG a little more squeezed, then
// smaller, until it fits; a see-through picture stays see-through (WebP, or a
// smaller PNG where the browser can't write WebP). A JPEG keeps its camera
// details (when it was taken, the camera), turned upright like its pixels.
// Sound and video go through the converter (convert.js): their length says
// how many bits a second fit, video keeps the picture's shape and comes out as
// MP4, sound as M4A.

import { canvasBlob, ffmpegJob } from './convert.js';
import { extOf, guessKind } from './kinds.js';
import { named, touchScreen } from './util.js';

const MAY_BE_CLEAR = new Set(['png', 'webp', 'avif', 'tif', 'tiff', 'heic', 'heif']);

// A smaller File that fits under `limit` bytes, or an Error saying why not.
// `hooks.progress(0..1)` follows along; `hooks.stoppable(fn)` is given a stop.
export async function shrink(file, limit, hooks = {}) {
  const kind = guessKind(file);
  const out = kind === 'image' ? await picture(file, limit, hooks) : await media(file, kind, limit, hooks);
  if (!out || out.blob.size > limit) throw new Error('Still too big after making it smaller');
  const name = `${(file.name || 'File').replace(/\.[^.]+$/, '')}.${out.ext}`;
  return new File([out.blob], name, { type: out.blob.type, lastModified: file.lastModified });
}

// ---------------------------------------------------------------- pictures

async function open(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new Error('This picture couldn’t be read here to make it smaller');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const sizeOf = (pic) => [pic.naturalWidth || pic.width, pic.naturalHeight || pic.height];

// Whether any of it is see-through, judged from a small copy.
function seeThrough(pic) {
  const [w, h] = sizeOf(pic);
  const s = Math.min(1, 256 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(pic, 0, 0, c.width, c.height);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

async function picture(file, limit, { progress }) {
  const pic = await open(file);
  const [w, h] = sizeOf(pic);
  const clear = MAY_BE_CLEAR.has(extOf(file.name)) && seeThrough(pic);
  // A phone's Safari draws no canvas past about 16 million pixels.
  const most = touchScreen() ? 16e6 : 48e6;
  let scale = Math.min(1, Math.sqrt(most / (w * h)));
  let quality = 0.9;
  const tries = 9;
  for (let n = 0; n < tries; n++) {
    progress?.(n / tries);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!clear) { ctx.fillStyle = named('--white') || 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(pic, 0, 0, canvas.width, canvas.height);
    let blob = clear ? await canvasBlob(canvas, 'image/webp', quality) : await canvasBlob(canvas, 'image/jpeg', quality);
    if (clear && blob && blob.type !== 'image/webp') blob = await canvasBlob(canvas, 'image/png');
    canvas.width = canvas.height = 0;
    // Nothing back: the canvas was too big for this browser.
    if (!blob) { scale *= 0.7; continue; }
    if (blob.size <= limit) {
      pic.close?.();
      progress?.(1);
      if (blob.type === 'image/jpeg') return { blob: await keepCamera(file, blob), ext: 'jpg' };
      return { blob, ext: blob.type === 'image/webp' ? 'webp' : 'png' };
    }
    const ratio = limit / blob.size;
    if (!clear && quality > 0.8 && ratio > 0.7) quality = 0.8;
    else scale *= Math.min(0.9, Math.sqrt(ratio) * 0.95);
  }
  pic.close?.();
  throw new Error('Still too big after making it smaller');
}

// A JPEG's camera details (its Exif block) carried over to the smaller copy.
// The pixels were drawn upright already, so the copy says "upright".
async function keepCamera(file, blob) {
  try {
    const seg = await exifOf(file);
    if (!seg) return blob;
    const out = new Uint8Array(await blob.arrayBuffer());
    // After the start mark and the browser's own JFIF block, if it wrote one.
    let at = 2;
    if (out[2] === 0xff && out[3] === 0xe0) at = 4 + ((out[4] << 8) | out[5]);
    return new Blob([out.subarray(0, at), seg, out.subarray(at)], { type: 'image/jpeg' });
  } catch {
    return blob;
  }
}

async function exifOf(file) {
  const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  if (head[0] !== 0xff || head[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= head.length && head[i] === 0xff) {
    const mark = head[i + 1];
    if (mark === 0xda || mark === 0xd9) break;
    const len = (head[i + 2] << 8) | head[i + 3];
    const isExif = mark === 0xe1 && String.fromCharCode(...head.subarray(i + 4, i + 8)) === 'Exif';
    if (isExif) {
      if (i + 2 + len > head.length) return null;
      const seg = head.slice(i, i + 2 + len);
      upright(seg);
      return seg;
    }
    i += 2 + len;
  }
  return null;
}

// Orientation (tag 0x0112 in the first directory) set to 1.
function upright(seg) {
  const tiff = 10;
  const view = new DataView(seg.buffer, seg.byteOffset, seg.byteLength);
  const little = view.getUint16(tiff) === 0x4949;
  const first = tiff + view.getUint32(tiff + 4, little);
  const count = view.getUint16(first, little);
  for (let e = 0; e < count; e++) {
    const at = first + 2 + e * 12;
    if (at + 12 > seg.length) return;
    if (view.getUint16(at, little) === 0x0112) { view.setUint16(at + 8, 1, little); return; }
  }
}

// ---------------------------------------------------------------- sound and video

// How long it is and its shape, as the browser reads it (null where it can't).
function measure(file, kind) {
  return new Promise((resolve) => {
    const el = document.createElement(kind === 'video' ? 'video' : 'audio');
    const url = URL.createObjectURL(file);
    const done = (facts) => { el.removeAttribute('src'); el.load(); URL.revokeObjectURL(url); resolve(facts); };
    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => done({
      seconds: Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null,
      width: el.videoWidth || 0,
      height: el.videoHeight || 0,
    });
    el.onerror = () => done({ seconds: null, width: 0, height: 0 });
    el.src = url;
  });
}

async function media(file, kind, limit, { progress, stoppable }) {
  const facts = await measure(file, kind);
  const ext = (extOf(file.name) || (kind === 'video' ? 'mp4' : 'm4a')).replace(/[^a-z0-9]/g, '') || 'bin';
  const inName = `in.${ext}`;
  // Room for the container's own bytes.
  const bits = limit * 8 * 0.93;
  // The file keeps its own details (when it was made, its tags) and never says
  // the converter made it: sorting would read it as an edited video.
  const plain = ['-map_metadata', '0', '-fflags', '+bitexact', '-flags:a', '+bitexact'];
  const run = async (args, outName, type) => {
    const job = ffmpegJob(file, inName, outName, [...args, ...plain], { progress });
    stoppable?.(job.stop);
    const out = await job.done;
    return out ? new Blob([out], { type }) : null;
  };

  if (kind === 'audio') {
    // Bits a second that fit, never more than sounds no different.
    const rate = facts.seconds ? Math.min(192e3, Math.floor(bits / facts.seconds)) : 128e3;
    if (rate < 32e3) throw new Error('Too long to fit, even made smaller');
    const blob = await run(['-vn', '-c:a', 'aac', '-b:a', `${Math.floor(rate / 1000)}k`], 'out.m4a', 'audio/mp4');
    return blob && { blob, ext: 'm4a' };
  }

  // Video: as many bits a second as fit, and a picture no bigger than they can fill.
  const shape = (side) => (facts.width && facts.height && facts.height > facts.width ? `scale=${side}:-2` : `scale=-2:${side}`);
  const shortSide = Math.min(facts.width || 1080, facts.height || 1080);
  const base = ['-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  if (!facts.seconds) {
    // The browser can't say how long it is: a steady quality, then see.
    const blob = await run([...base, '-crf', '28', '-vf', shape(Math.min(shortSide, 720)), '-c:a', 'aac', '-b:a', '96k'], 'out.mp4', 'video/mp4');
    return blob && { blob, ext: 'mp4' };
  }
  let blob = null;
  for (const share of [1, 0.8]) {
    const sound = bits / facts.seconds >= 1.5e6 ? 128e3 : 64e3;
    const rate = Math.floor((bits / facts.seconds - sound) * share);
    if (rate < 150e3) throw new Error('Too long to fit, even made smaller');
    const side = Math.min(shortSide, rate >= 5e6 ? 1080 : rate >= 1.6e6 ? 720 : rate >= 700e3 ? 480 : 360);
    blob = await run([...base, '-b:v', `${rate}`, '-maxrate', `${Math.floor(rate * 1.3)}`, '-bufsize', `${rate * 2}`,
      '-vf', `${shape(side - (side % 2))}`, '-c:a', 'aac', '-b:a', `${sound / 1000}k`], 'out.mp4', 'video/mp4');
    if (!blob || blob.size <= limit) break;
  }
  return blob && { blob, ext: 'mp4' };
}
