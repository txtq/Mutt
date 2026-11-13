// The file box: how a file looks in a grid (and in search). One frame for
// every kind (DESIGN.md section 4, "File box"): a box four wide to five tall
// holding the file's face and, under it, one line: its name, and one fact.
// The box shows what is in the file and the caption says what it is called,
// so nothing is said twice. The look is the section of galaxy.css headed
// THE FILE BOX.
//
// A new kind of file gets its face here: decide which of the three it is.
//   - it has a shape of its own (a picture, a page, a cover): `shaped()`
//   - it is words (a note, a link): a glass face, `textFace` / `linkFace`
//   - it is neither: `fileFace`, one bold word and, if it has one, a sign

import { KIND_ONE, displayTitle, extLabel, imageSrc } from './kinds.js';
import { markdown } from './md.js';
import { tintFor } from './theme.js';
import { fmtBytes, fmtDate, fmtDuration, h, seeded } from './util.js';
import { icon } from './icons.js';

const BOX = 4 / 5;   // the frame's own shape (.cell-box in galaxy.css)

const isBook = (block) => block.ext === 'epub';
const isPage = (block) => !isBook(block) && (block.kind === 'pdf' || block.kind === 'doc');

function img(src, block, className) {
  const el = h('img', { class: className, src, alt: displayTitle(block), loading: 'lazy', decoding: 'async', draggable: false });
  if (block.width && block.height) {
    el.width = block.width;
    el.height = block.height;
  }
  el.addEventListener('load', () => el.classList.add('is-loaded'), { once: true });
  el.addEventListener('error', () => {
    // Formats the browser can't show (HEIC, TIFF…) fall back to a file card.
    const shown = el.closest('.face-shape') || el;
    const fallback = fileFace(block);
    fallback.dataset.vt = shown.dataset.vt || '';
    shown.replaceWith(fallback);
  }, { once: true });
  return el;
}

// Something with a shape of its own keeps it, in the middle of the box. When
// its size is known it gets a wrapper of exactly that shape, so a tag (and a
// book's spine) can sit on the picture itself; until then the picture sizes
// itself. `kind` is '' for a picture or a video, 'is-page' for a page of
// paper, 'is-book' for a cover.
function shaped(block, inner, kind = '') {
  if (kind) inner.classList.add(kind);
  if (!(block.width > 0 && block.height > 0)) return inner;
  inner.classList.remove('face', kind || 'face');
  const ratio = block.width / block.height;
  return h('span', {
    class: `face face-shape ${ratio >= BOX ? 'is-wide' : 'is-tall'} ${kind}`.trim(),
    style: { '--ar': `${block.width} / ${block.height}` },
  }, inner, kind === 'is-book' ? h('i', { class: 'face-spine' }) : null);
}

// A song's sign: a row of fine level bars, always the same for the same file.
function levels(block) {
  const bars = [];
  const next = seeded(String(block.id));
  for (let n = 0; n < 40; n++) {
    const swell = 0.45 + 0.55 * Math.sin((n / 39) * Math.PI);
    bars.push(h('i', { style: { '--h': Math.round(14 + next() * 70 * swell) } }));
  }
  return h('div', { class: 'face-levels', 'aria-hidden': 'true' }, bars);
}

// The first lines of a text file; code has its lines numbered.
function excerpt(block, text) {
  const code = block.kind === 'code';
  const pre = h('pre', { class: `face-excerpt${code ? ' is-code' : ''}` });
  if (!code) pre.textContent = text.slice(0, 900);
  else text.slice(0, 900).trimEnd().split('\n').slice(0, 14).forEach((line, n) => pre.append(h('span', { class: 'face-ln' }, String(n + 1)), `${line}\n`));
  return pre;
}

// A file with no picture of itself: one bold word at the foot (how long a
// song is, or what kind of file it is) and above it, where there is one, its
// sign. Its name and size are in the caption, not here.
function fileFace(block, { excerpt: wanted = true } = {}) {
  const text = wanted ? block.meta?.excerpt : null;
  const song = block.kind === 'audio';
  const length = song && block.duration ? fmtDuration(block.duration) : null;
  return h('div', { class: 'face face-file' },
    song ? levels(block) : text ? excerpt(block, text) : null,
    text && !song ? null : h('div', { class: 'face-kind' }, length || extLabel(block)),
    text || length ? h('div', { class: 'face-sub' }, extLabel(block)) : null);
}

function textFace(block) {
  return h('div', { class: 'face face-text' },
    h('div', { class: 'face-text-body md', html: markdown(block.content.slice(0, 2400)) }));
}

// A link: its title and what the page says about itself, with the page's
// picture across the top when it has one. Its site is the caption.
function linkFace(block, src) {
  let pic = null;
  if (src) {
    const shot = h('img', { src, alt: '', loading: 'lazy', decoding: 'async', draggable: false });
    pic = h('div', { class: 'face-link-pic' }, shot);
    shot.addEventListener('load', () => shot.classList.add('is-loaded'), { once: true });
    shot.addEventListener('error', () => pic.remove(), { once: true });
  }
  // Still waiting on a picture of the page: shimmer until it lands.
  return h('div', { class: `face face-link${block.meta?.shot === 'pending' ? ' is-shimmer' : ''}` },
    pic,
    h('div', { class: 'face-link-title' }, block.title || block.content),
    block.meta?.description ? h('div', { class: 'face-link-desc' }, block.meta.description) : null);
}

// The visual part of a block, sized to its content so it morphs cleanly.
export function blockFace(block) {
  let el;
  const src = imageSrc(block);
  if (block.kind === 'link') el = linkFace(block, src);
  else if (src) el = shaped(block, img(src, block, 'face face-img'), isBook(block) ? 'is-book' : isPage(block) ? 'is-page' : '');
  else if (block.kind === 'video' && block.file) {
    el = shaped(block, h('video', { class: 'face face-img', src: `${block.file}#t=0.5`, preload: 'metadata', muted: true, playsInline: true }));
  } else if (block.kind === 'text') el = textFace(block);
  else el = fileFace(block);
  el.dataset.vt = `b-${block.id}`;
  return el;
}

// The tag on a picture that isn't only a picture. A video's or a song's
// length always shows; what a page or a cover is shows when it's pointed at.
function tagFor(block) {
  if (!imageSrc(block) && block.kind !== 'video') return null;
  if (block.kind === 'video' || block.kind === 'audio') {
    return h('span', { class: 'cell-tag is-always' }, icon('play', 12), block.duration ? fmtDuration(block.duration) : KIND_ONE[block.kind]);
  }
  if (isBook(block)) return h('span', { class: 'cell-tag' }, 'Book');
  if (isPage(block)) return h('span', { class: 'cell-tag' }, [extLabel(block), block.meta?.pages ? `${block.meta.pages} pp` : null].filter(Boolean).join(' · '));
  return null;
}

// What a file is called, under its box. A link's title is in its box, so its
// caption is its site.
const nameOf = (block) => (block.kind === 'link' && block.meta?.domain) || displayTitle(block);

// The one fact beside the name: when words were added, how long or how big a file is.
export function factOf(block) {
  if (block.kind === 'text' || block.kind === 'link') return block.createdAt ? fmtDate(block.createdAt) : '';
  if (block.meta?.pages && (isBook(block) || isPage(block))) return `${block.meta.pages} pp`;
  return block.size ? fmtBytes(block.size) : '';
}

// A full-width label between groups (Vibes and Format sorting).
export function renderDivider(item) {
  return h('div', { class: 'grid-divider', dataset: { key: item.id } }, h('span', null, item.label));
}

// moderate: you made this community drawer, so you can take other people's files out.
export function renderCell(block, { actions = block.mine !== false, moderate = false } = {}) {
  const face = blockFace(block);
  const box = h('div', { class: 'cell-box' }, h('div', { class: 'cell-fill' }, face));
  const tag = tagFor(block);
  // on the picture itself when its shape is known, else in the corner of the box
  if (tag) (face.classList.contains('face-shape') ? face : box).append(tag);
  if (block.sharedAt && block.mine !== false) box.append(h('span', { class: 'cell-shared', title: 'Shared to Community' }));
  if (block.mine === false) {
    // Someone else's file: the one thing to do is keep a copy.
    box.append(h('div', { class: 'cell-actions' },
      h('button', { type: 'button', class: `btn btn-small pill${block.saved ? ' btn-main' : ''}`, dataset: { act: 'save' } }, icon(block.saved ? 'check' : 'onto'), block.saved ? 'Saved' : 'Save'),
      moderate ? h('button', { type: 'button', class: 'btn btn-small pill pill-dots', dataset: { act: 'more' }, 'aria-label': 'More', title: 'More' }, icon('more')) : null));
  } else if (actions) {
    box.append(h('div', { class: 'cell-actions' },
      h('button', { type: 'button', class: 'btn btn-small pill', dataset: { act: 'connect' } }, 'Planets'),
      h('button', { type: 'button', class: 'btn btn-small pill pill-dots', dataset: { act: 'more' }, 'aria-label': 'More', title: 'More' }, icon('more'))));
  }
  const fact = factOf(block);
  const cell = h('article', {
    class: 'cell', dataset: { id: block.id, kind: block.kind }, tabindex: '0',
    style: { '--cell-tint': tintFor(block.id) },
  },
  box,
  h('div', { class: 'cell-cap' }, h('span', { class: 'cell-title' }, nameOf(block),
    block.owner ? h('span', { class: 'cell-owner' }, ` @${block.owner}`) : null),
  block.commentCount ? h('span', {
    class: 'cell-comments', title: `${block.commentCount} comment${block.commentCount === 1 ? '' : 's'}`,
  }, icon('comment', 12), String(block.commentCount)) : null,
  fact ? h('span', { class: 'cell-fact' }, fact) : null));
  if (block.kind === 'video' && block.file) attachHoverPlay(cell, block);
  return cell;
}

// Videos quietly play while hovered.
function attachHoverPlay(cell, block) {
  let video;
  let timer;
  cell.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    timer = setTimeout(() => {
      const fill = cell.querySelector('.cell-fill');
      const face = fill?.firstElementChild;
      if (!fill || !face) return;
      video = h('video', { class: 'cell-hover-video', src: block.file, muted: true, loop: true, playsInline: true, preload: 'auto' });
      const r = face.getBoundingClientRect();
      const f = fill.getBoundingClientRect();
      Object.assign(video.style, { left: `${r.left - f.left}px`, top: `${r.top - f.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      video.addEventListener('playing', () => video?.classList.add('is-playing'), { once: true });
      fill.append(video);
      video.play().catch(() => {});
    }, 280);
  });
  cell.addEventListener('pointerleave', () => {
    clearTimeout(timer);
    if (!video) return;
    const v = video;
    video = null;
    v.classList.remove('is-playing');
    setTimeout(() => { v.pause(); v.remove(); }, 300);
  });
}

// Placeholder for something still on its way up.
export function renderPending(item) {
  let face;
  if (item.preview) {
    face = h('img', { class: 'face face-img is-loaded', src: item.preview, alt: '' });
    face.addEventListener('error', () => face.replaceWith(pendingFace(item)), { once: true });
  } else face = pendingFace(item);
  const cell = h('article', { class: 'cell is-pending', dataset: { key: item.key, kind: item.kind } },
    h('div', { class: 'cell-box' },
      h('div', { class: 'cell-fill' }, face),
      h('div', { class: 'cell-progress' })),
    h('div', { class: 'cell-cap' }, h('span', { class: 'cell-title' }, item.name),
      item.file?.size ? h('span', { class: 'cell-fact' }, fmtBytes(item.file.size)) : null));
  updatePending(cell, item);
  return cell;
}

function pendingFace(item) {
  if (item.text != null) {
    return h('div', { class: 'face face-text is-shimmer' },
      h('div', { class: 'face-text-body' }, item.link ? h('span', { class: 'face-sub' }, 'Fetching link…') : null, h('div', null, item.text.slice(0, 600))));
  }
  return h('div', { class: 'face face-file is-shimmer' },
    h('div', { class: 'face-kind' }, (item.name.split('.').pop() || '').toUpperCase().slice(0, 6)));
}

export function updatePending(cell, item) {
  cell.style.setProperty('--p', item.status === 'done' ? 1 : Math.max(0.03, item.progress || 0));
  cell.classList.toggle('is-failed', item.status === 'failed');
  const cap = cell.querySelector('.cell-title');
  if (item.status === 'failed') {
    cap.replaceChildren(h('span', { class: 'cell-error' }, item.error || 'Upload failed'), ' · ',
      h('button', { type: 'button', class: 'btn btn-small', dataset: { act: 'retry' } }, 'Retry'));
    cell.querySelector('.cell-fact')?.remove();
  }
}
