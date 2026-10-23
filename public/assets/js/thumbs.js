// Preview images made in the browser while a file uploads, so the server
// never has to decode media. Returns { blob, width, height, duration, pages }.

const MAX_EDGE = 1000;
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168';

function scaled(w, h, max = MAX_EDGE) {
  const s = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function encode(draw, w, h, opaque = false) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (opaque) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
  draw(ctx);
  let blob = await toBlob(canvas, 'image/webp', 0.86);
  if (!blob || blob.type !== 'image/webp') {
    // Browsers without WebP encoding: JPEG on white keeps transparent PNGs readable.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    blob = await toBlob(canvas, 'image/jpeg', 0.86);
  }
  return blob;
}

function once(el, event, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeout);
    el.addEventListener(event, () => { clearTimeout(t); resolve(); }, { once: true });
    el.addEventListener('error', () => { clearTimeout(t); reject(new Error('media error')); }, { once: true });
  });
}

async function imageSize(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function imageThumb(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (file.type === 'image/gif' || file.type === 'image/svg+xml' || ext === 'gif' || ext === 'svg') {
    const size = await imageSize(file).catch(() => null);
    return size && { blob: null, ...size };
  }
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const small = file.size < 400 * 1024 && Math.max(width, height) <= 1200 && /^image\/(png|jpeg|webp)$/.test(file.type);
  if (small) { bitmap.close?.(); return { blob: null, width, height }; }
  const [w, h] = scaled(width, height);
  const blob = await encode((ctx) => ctx.drawImage(bitmap, 0, 0, w, h), w, h);
  bitmap.close?.();
  return { blob, width, height };
}

async function videoThumb(file) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await once(video, 'loadeddata');
    const duration = Number.isFinite(video.duration) ? video.duration : null;
    video.currentTime = duration ? Math.min(1.2, duration * 0.1) : 0;
    await once(video, 'seeked', 6000);
    const { videoWidth: width, videoHeight: height } = video;
    if (!width || !height) return { blob: null, duration };
    const [w, h] = scaled(width, height);
    const blob = await encode((ctx) => ctx.drawImage(video, 0, 0, w, h), w, h, true);
    return { blob, width, height, duration };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function audioInfo(file) {
  const url = URL.createObjectURL(file);
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.src = url;
  try {
    await once(audio, 'loadedmetadata', 6000);
    return Number.isFinite(audio.duration) ? { blob: null, duration: audio.duration } : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

let pdfjsPromise;
async function pdfThumb(file) {
  if (file.size > 80 * 1024 * 1024) return null;
  pdfjsPromise ||= import(`${PDFJS}/pdf.min.mjs`).then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
    return lib;
  });
  const pdfjs = await pdfjsPromise;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, 900 / base.width);
    const viewport = page.getViewport({ scale });
    const w = Math.round(viewport.width);
    const h = Math.round(viewport.height);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await encode((c) => c.drawImage(canvas, 0, 0), w, h, true);
    return { blob, width: Math.round(base.width), height: Math.round(base.height), pages: doc.numPages };
  } finally {
    doc.destroy();
  }
}

export async function makeThumb(file, kind) {
  try {
    if (kind === 'image') return await imageThumb(file);
    if (kind === 'video') return await videoThumb(file);
    if (kind === 'audio') return await audioInfo(file);
    if (kind === 'pdf') return await pdfThumb(file);
  } catch {
    return null;
  }
  return null;
}
