// Downloading a file, as it is or as another kind of file. Mutt converts it
// in the browser: pictures with the browser's own canvas, writing with the
// document exporter, PDFs with pdf.js, and sound and video with the
// converter Mutt serves itself (convert.js, fetched the first time it's used).
// This file only knows what each kind can become; the work is in convert.js.

import { openMenu } from './ui.js';
import { h } from './util.js';

const IMAGE = [['JPEG', 'jpg'], ['PNG', 'png'], ['WebP', 'webp'], ['PDF', 'pdf']];
const SOUND = [['MP3', 'mp3'], ['M4A', 'm4a'], ['WAV', 'wav'], ['Ogg', 'ogg'], ['FLAC', 'flac']];
const VIDEO = [['MP4', 'mp4'], ['WebM', 'webm'], ['MOV', 'mov'], ['GIF, first 15 s', 'gif']];
const TEXT = [['Plain text', 'txt'], ['Markdown', 'md'], ['PDF', 'pdf'], ['Word', 'docx']];
const PDF = [['Pictures of its pages', 'png'], ['Plain text', 'txt']];
const SAME = { jpeg: 'jpg', jpe: 'jpg', tif: 'tiff', oga: 'ogg', markdown: 'md', text: 'txt' };

// Pictures the browser can read (HEIC only in Safari: convert.js says so if it can't).
const PICTURES = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'heic', 'heif', 'tif', 'tiff', 'svg']);

const same = (ext) => SAME[ext] || ext;

// [{ heading } | { label, hint, to }] for a file; empty when it can only be had as it is.
export function formatsOf(block) {
  const ext = same((block.ext || '').toLowerCase());
  const others = (list) => list.filter(([, to]) => to !== ext).map(([label, to]) => ({ label, hint: `.${to}`, to }));
  if (block.kind === 'text') return others(TEXT);
  if (!block.file) return [];
  if (block.kind === 'image' && PICTURES.has(ext)) return others(IMAGE);
  if (block.kind === 'pdf') return others(PDF);
  if (block.kind === 'audio') return others(SOUND);
  if (block.kind === 'video') return [...others(VIDEO), { heading: 'Sound only' }, ...others(SOUND.slice(0, 3))];
  return [];
}

// The file as it is.
export function downloadOriginal(block) {
  if (!block.file) return;
  const url = new URL(block.file, location.href);
  url.searchParams.set('dl', '1');
  const a = h('a', { href: url.pathname + url.search, download: '' });
  document.body.append(a);
  a.click();
  a.remove();
}

export async function convertTo(block, to) {
  const { convertAndSave } = await import('./convert.js');
  return convertAndSave(block, to);
}

// The menu a Download button opens: the file as it is, then what it can become.
// A file that can only be had as it is downloads straight away.
export function downloadMenu(anchor, block, opts = {}) {
  const formats = formatsOf(block);
  if (!formats.length) { downloadOriginal(block); return; }
  const rows = block.file
    ? [{ label: 'As it is', hint: block.ext ? `.${block.ext.toLowerCase()}` : '', run: () => downloadOriginal(block) }, '-', { heading: 'Converted to' }]
    : [{ heading: 'Download as' }];
  for (const f of formats) {
    if (f.heading) rows.push({ heading: f.heading });
    else rows.push({ label: f.label, hint: f.hint, run: () => convertTo(block, f.to) });
  }
  openMenu(anchor, rows, { align: 'end', ...opts });
}

export const canDownload = (block) => !!block.file || block.kind === 'text';
