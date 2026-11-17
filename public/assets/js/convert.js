// Turning a file into another kind of file, in the browser, then saving it
// (downloads.js says what each kind can become). Fetched only when someone
// first downloads something as another format.
//
// Pictures: drawn on a canvas and written out by the browser (a PDF holds
// the picture on one page). Notes: the document exporter (docexport.js).
// PDFs: drawn page by page with pdf.js, or their words read out. Sound and
// video: ffmpeg built for the web, run in convert-worker.js; its 32 MB engine
// comes from Mutt itself (mutt/convert.py) the first time, then the browser
// keeps it.
//
// Anything that takes a while shows the uploads toast: its small void fills
// with light, and it can be stopped.

import { api } from './api.js';
import { displayTitle } from './kinds.js';
import { exit, toast, toastsEl } from './ui.js';
import { h, named, wait } from './util.js';

const NAMES = {
  jpg: 'JPEG', png: 'PNG', webp: 'WebP', pdf: 'PDF', txt: 'plain text', md: 'Markdown', docx: 'Word',
  mp3: 'MP3', m4a: 'M4A', wav: 'WAV', ogg: 'Ogg', flac: 'FLAC', mp4: 'MP4', webm: 'WebM', mov: 'MOV', gif: 'GIF',
};
const TYPES = {
  jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', txt: 'text/plain', zip: 'application/zip',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', gif: 'image/gif',
};

const baseName = (block) => {
  const name = (block.fileName || '').replace(/\.[^.]+$/, '') || displayTitle(block) || 'File';
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'File';
};

function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function fetchBlob(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('The file couldn’t be fetched. Check your connection.');
  return res.blob();
}

export async function convertAndSave(block, to) {
  const job = block.kind === 'text' ? writing
    : block.kind === 'image' ? picture
      : block.kind === 'pdf' ? pdfFile
        : block.kind === 'audio' || block.kind === 'video' ? media
          : null;
  if (!job) return;
  try {
    await job(block, to);
  } catch (err) {
    if (err?.stopped) return;
    toast(err?.message || 'That file couldn’t be converted.');
  }
}

// ---------------------------------------------------------------- the toast

// The uploads toast, saying what is being made (DESIGN.md "Toast": Uploads).
function progressToast(words, { onStop } = {}) {
  const host = toastsEl();
  const glow = h('i', { class: 'toast-void', 'aria-hidden': 'true' });
  const label = h('span', null, words);
  const stop = onStop ? h('button', { type: 'button', onclick: () => { onStop(); close(); } }, 'Stop') : null;
  const el = h('div', { class: 'toast is-upload', role: 'status' }, glow, label, stop);
  host.append(el);
  let closed = false;
  const close = () => { if (!closed) { closed = true; exit(el); } };
  return {
    set(p, text) {
      el.style.setProperty('--p', Math.max(0, Math.min(1, p)));
      if (text) label.textContent = text;
    },
    say(text) { label.textContent = text; },
    close,
  };
}

// ---------------------------------------------------------------- pictures

async function readPicture(block) {
  const blob = await fetchBlob(block.file);
  try {
    return await createImageBitmap(blob);
  } catch {
    // Some pictures (an SVG, a HEIC in Safari) only open as an image.
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (!img.naturalWidth) img.width = img.height = 1600;
      return img;
    } catch {
      const ext = (block.ext || '').toLowerCase();
      throw new Error(ext === 'heic' || ext === 'heif'
        ? 'This browser can’t read HEIC pictures. Open Mutt in Safari to convert it.'
        : 'This picture couldn’t be read.');
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

const sizeOf = (pic) => [pic.naturalWidth || pic.width, pic.naturalHeight || pic.height];

// A canvas of the picture; for a JPEG (which can't be see-through) on white.
function canvasOf(pic, opaque) {
  const [w, h2] = sizeOf(pic);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h2;
  const ctx = canvas.getContext('2d');
  if (opaque) { ctx.fillStyle = named('--white') || 'white'; ctx.fillRect(0, 0, w, h2); }
  ctx.drawImage(pic, 0, 0, w, h2);
  return canvas;
}

export function canvasBlob(canvas, type, quality = 0.92) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function picture(block, to) {
  const pic = await readPicture(block);
  const name = `${baseName(block)}.${to}`;
  if (to === 'pdf') {
    const jpeg = await canvasBlob(canvasOf(pic, true), 'image/jpeg', 0.92);
    save(await pictureAsPdf(jpeg, sizeOf(pic), baseName(block)), name);
    return;
  }
  const canvas = canvasOf(pic, to === 'jpg');
  let out = await canvasBlob(canvas, TYPES[to]);
  if (!out || out.type !== TYPES[to]) {
    // This browser can't write it (WebP in Safari): the converter can.
    const png = await canvasBlob(canvas, 'image/png');
    out = new Blob([await runFfmpeg(png, 'in.png', `out.${to}`, ['-c:v', 'libwebp', '-quality', '90', '-lossless', '0'], `${NAMES[to]}`, block)], { type: TYPES[to] });
  }
  save(out, name);
}

// One page the shape of the picture, its longer side as long as an A4 page.
export async function pictureAsPdf(jpeg, [w, h2], title) {
  const { loadPdfLib } = await import('./docexport.js');
  const { PDFDocument } = await loadPdfLib();
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator('Mutt');
  const image = await pdf.embedJpg(await jpeg.arrayBuffer());
  const s = 842 / Math.max(w, h2);
  const page = pdf.addPage([w * s, h2 * s]);
  page.drawImage(image, { x: 0, y: 0, width: w * s, height: h2 * s });
  return new Blob([await pdf.save()], { type: TYPES.pdf });
}

// ---------------------------------------------------------------- notes

const PAGE = { page: 'a4', margins: 'normal', font: 'serif', size: 12, spacing: 1.15, layout: 'auto', numbers: 'center', header: '', footer: '' };

async function writing(block, to) {
  const [docexport, { fromMarkdown }, { docTitle }] = await Promise.all([import('./docexport.js'), import('./docformat.js'), import('./docs.js')]);
  // A note written as a document keeps its look; any other is read from its Markdown.
  let doc = null;
  try { doc = await api.get(`/api/docs/${block.id}`); } catch { /* a plain note */ }
  const flow = h('div', { html: doc?.html || fromMarkdown(block.content || '') });
  const settings = { ...PAGE, ...(doc?.settings || {}) };
  // Named as the documents desk names it: its own name, or its first line.
  const title = docTitle(block);
  if (to === 'txt') docexport.exportText(flow, title);
  else if (to === 'md') docexport.exportMarkdown(flow, title);
  else if (to === 'pdf') {
    if (docexport.pdfMissing(flow) > 0) {
      toast('This note has letters a plain PDF can’t hold, so it opens in the print view. Choose “Save as PDF” there.');
      docexport.printDoc(flow, { title, settings });
    } else await docexport.exportPdf(flow, { title, named: block.title || '', settings, author: block.owner });
  } else if (to === 'docx') await docexport.exportDocx(flow, { title, named: block.title || '', settings, author: block.owner });
}

// ---------------------------------------------------------------- PDFs

async function pdfFile(block, to) {
  const [{ loadPdfjs }, data] = await Promise.all([import('./pdfjs.js'), fetchBlob(block.file).then((b) => b.arrayBuffer())]);
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const name = baseName(block);
  let stopped = false;
  const note = doc.numPages > 2 ? progressToast(`Reading ${doc.numPages} pages…`, { onStop: () => { stopped = true; } }) : null;
  try {
    if (to === 'txt') {
      const pages = [];
      for (let n = 1; n <= doc.numPages && !stopped; n++) {
        const content = await (await doc.getPage(n)).getTextContent();
        pages.push(content.items.map((i) => i.str + (i.hasEOL ? '\n' : '')).join('').replace(/[ \t]+\n/g, '\n').trim());
        note?.set(n / doc.numPages);
      }
      if (stopped) return;
      save(new Blob([`${pages.join('\n\n')}\n`], { type: 'text/plain;charset=utf-8' }), `${name}.txt`);
      return;
    }
    const files = [];
    const last = Math.min(doc.numPages, 300);
    for (let n = 1; n <= last && !stopped; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(4, 1600 / base.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = named('--white') || 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      files.push([`${name} ${String(n).padStart(String(last).length, '0')}.png`, new Uint8Array(await (await canvasBlob(canvas, 'image/png')).arrayBuffer())]);
      canvas.width = canvas.height = 0;
      note?.set(n / last, `Drawing page ${n} of ${last}…`);
    }
    if (stopped) return;
    if (files.length === 1) save(new Blob([files[0][1]], { type: TYPES.png }), `${name}.png`);
    else {
      const { zip } = await import('./docexport.js');
      save(zip(files), `${name} pages.zip`);
    }
  } finally {
    note?.close();
    doc.destroy();
  }
}

// ---------------------------------------------------------------- sound and video

const SOUND_ARGS = {
  mp3: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'],
  m4a: ['-vn', '-c:a', 'aac', '-b:a', '192k'],
  wav: ['-vn', '-c:a', 'pcm_s16le'],
  ogg: ['-vn', '-c:a', 'libvorbis', '-q:a', '5'],
  flac: ['-vn', '-c:a', 'flac'],
};
const VIDEO_ARGS = {
  mp4: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'],
  mov: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k'],
  webm: ['-c:v', 'libvpx', '-crf', '10', '-b:v', '2M', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libvorbis', '-q:a', '4'],
  gif: ['-t', '15', '-an', '-vf', "fps=12,scale='min(480,iw)':-2:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse", '-loop', '0'],
};

async function media(block, to) {
  const args = VIDEO_ARGS[to] || SOUND_ARGS[to];
  if (!args) return;
  const input = await fetchBlob(block.file);
  const ext = (block.ext || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const out = await runFfmpeg(input, `in.${ext}`, `out.${to}`, args, NAMES[to], block);
  save(new Blob([out], { type: TYPES[to] }), `${baseName(block)}.${to}`);
}

let worker = null;

// The converter's engine is fetched by Mutt the first time anyone asks for
// it (about half a minute on a good line); until then it answers "not yet".
async function engineReady(note) {
  for (let tries = 0; ; tries++) {
    const res = await fetch('/api/convert/core.js', { credentials: 'same-origin' }).catch(() => null);
    if (res?.ok) return;
    if (!res || res.status !== 503 || tries > 90) {
      throw new Error(res?.status === 404 ? 'Converting sound and video isn’t switched on here.' : 'The converter couldn’t be fetched. Try again in a little while.');
    }
    note.say('Getting the converter ready…');
    await wait(2000);
  }
}

function runFfmpeg(input, inName, outName, args, what, block) {
  const note = progressToast(`Converting to ${what}…`, { onStop: () => job.stop() });
  const job = ffmpegJob(input, inName, outName, args, {
    waiting: () => note.say('Getting the converter ready…'),
    started: () => note.say(`Converting “${baseName(block)}” to ${what}…`),
    progress: (p) => note.set(p, `Converting to ${what} · ${Math.round(p * 100)}%`),
  });
  return job.done.finally(() => note.close());
}

// One run of the converter: { done, stop() }. The worker does one job at a
// time, so jobs wait for the one before (a download and an upload being made
// smaller can be asked for together).
let lastJob = Promise.resolve();

export function ffmpegJob(input, inName, outName, args, { waiting, started, progress } = {}) {
  let stop;
  let over = false;
  const stopped = new Promise((_, reject) => {
    stop = () => {
      if (over) return;
      over = true;
      worker?.terminate();
      worker = null;
      reject(Object.assign(new Error('Stopped'), { stopped: true }));
    };
  });
  const run = lastJob.catch(() => {}).then(async () => {
    if (over) return null;
    await engineReady({ say: () => waiting?.() });
    if (over) return null;
    started?.();
    const data = await input.arrayBuffer();
    worker ||= new Worker(new URL(`./convert-worker.js${new URL(import.meta.url).search}`, import.meta.url));
    const w = worker;
    return new Promise((resolve, reject) => {
      w.onmessage = ({ data: msg }) => {
        if (msg.type === 'progress') progress?.(msg.progress);
        else if (msg.type === 'done') resolve(msg.out);
        else if (msg.type === 'error') {
          if (msg.log) console.warn('Converter:', msg.log);
          reject(new Error(msg.message));
        }
      };
      w.onerror = (e) => { e.preventDefault?.(); worker = null; reject(new Error('The converter stopped. The file may be too large for this browser.')); };
      w.postMessage({ base: location.origin, input: data, inName, outName, args: ['-hide_banner', '-i', inName, ...args] }, [data]);
    });
  });
  const done = Promise.race([run, stopped]).finally(() => { over = true; });
  lastJob = done;
  return { done, stop };
}
