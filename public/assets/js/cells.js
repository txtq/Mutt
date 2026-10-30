// How a block looks in a grid cell (and in small previews).

import { KIND_ONE, displayTitle, extLabel, imageSrc } from './kinds.js';
import { markdown } from './md.js';
import { tintFor } from './theme.js';
import { fmtBytes, fmtDuration, h } from './util.js';

function img(src, block, className) {
  const el = h('img', { class: className, src, alt: displayTitle(block), loading: 'lazy', decoding: 'async', draggable: false });
  if (block.width && block.height) {
    el.width = block.width;
    el.height = block.height;
  }
  el.addEventListener('load', () => el.classList.add('is-loaded'), { once: true });
  el.addEventListener('error', () => {
    // Formats the browser can't show (HEIC, TIFF…) fall back to a file card.
    const fallback = fileFace(block);
    fallback.dataset.vt = el.dataset.vt || '';
    el.replaceWith(fallback);
  }, { once: true });
  return el;
}

function fileFace(block, { excerpt = true } = {}) {
  const text = excerpt ? block.meta?.excerpt : null;
  return h('div', { class: `face face-file${text ? ' has-excerpt' : ''}` },
    text ? h('pre', { class: 'face-excerpt' }, text.slice(0, 900)) : h('div', { class: 'face-ext' }, extLabel(block)),
    h('div', { class: 'face-foot' },
      h('div', { class: 'face-name' }, block.fileName || displayTitle(block)),
      h('div', { class: 'face-sub' },
        text ? `${extLabel(block)} · ` : '',
        block.duration ? `${fmtDuration(block.duration)} · ` : '',
        block.meta?.pages ? `${block.meta.pages} pp · ` : '',
        fmtBytes(block.size))));
}

function textFace(block) {
  return h('div', { class: 'face face-text' },
    h('div', { class: 'face-text-body md', html: markdown(block.content.slice(0, 2400)) }));
}

function linkFace(block) {
  // Still waiting on a picture of the page: shimmer until it lands.
  return h('div', { class: `face face-link${block.meta?.shot === 'pending' ? ' is-shimmer' : ''}` },
    h('div', { class: 'face-link-title' }, block.title || block.content),
    block.meta?.description ? h('div', { class: 'face-link-desc' }, block.meta.description) : null,
    h('div', { class: 'face-sub' }, block.meta?.domain || ''));
}

// The visual part of a block, sized to its content so it morphs cleanly.
export function blockFace(block) {
  let el;
  const src = imageSrc(block);
  if (src) el = img(src, block, 'face face-img');
  else if (block.kind === 'video' && block.file) {
    el = h('video', { class: 'face face-img', src: `${block.file}#t=0.5`, preload: 'metadata', muted: true, playsInline: true });
  } else if (block.kind === 'text') el = textFace(block);
  else if (block.kind === 'link') el = linkFace(block);
  else el = fileFace(block);
  el.dataset.vt = `b-${block.id}`;
  return el;
}

const BADGE = { video: true, audio: true, link: true, pdf: true };

// A full-width label between groups (Vibes and Format sorting).
export function renderDivider(item) {
  return h('div', { class: 'grid-divider', dataset: { key: item.id } }, h('span', null, item.label));
}

// moderate: you made this community drawer, so you can take other people's files out.
export function renderCell(block, { actions = block.mine !== false, moderate = false } = {}) {
  const box = h('div', { class: 'cell-box' }, h('div', { class: 'cell-fill' }, blockFace(block)));
  if (BADGE[block.kind] && (block.thumb || block.kind === 'video')) {
    const label = block.kind === 'video' && block.duration ? fmtDuration(block.duration)
      : block.kind === 'link' ? block.meta?.domain || 'Link' : KIND_ONE[block.kind];
    box.append(h('span', { class: 'cell-badge' }, label));
  }
  if (block.sharedAt && block.mine !== false) box.append(h('span', { class: 'cell-shared', title: 'Shared to Community' }));
  if (block.mine === false) {
    // Someone else's file: the one thing to do is keep a copy.
    box.append(h('div', { class: 'cell-actions' },
      h('button', { type: 'button', class: `pill${block.saved ? ' is-saved' : ''}`, dataset: { act: 'save' } }, block.saved ? 'Saved ✓' : 'Save'),
      moderate ? h('button', { type: 'button', class: 'pill pill-dots', dataset: { act: 'more' }, 'aria-label': 'More' }, '•••') : null));
  } else if (actions) {
    box.append(h('div', { class: 'cell-actions' },
      h('button', { type: 'button', class: 'pill', dataset: { act: 'connect' } }, 'Planets'),
      h('button', { type: 'button', class: 'pill pill-dots', dataset: { act: 'more' }, 'aria-label': 'More' }, '•••')));
  }
  const cell = h('article', {
    class: 'cell', dataset: { id: block.id, kind: block.kind }, tabindex: '0',
    style: { '--cell-tint': tintFor(block.id) },
  },
  box,
  h('div', { class: 'cell-cap' }, h('span', { class: 'cell-title' }, displayTitle(block),
    block.owner ? h('span', { class: 'cell-owner' }, ` @${block.owner}`) : null)));
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
    h('div', { class: 'cell-cap' }, h('span', { class: 'cell-title' }, item.name)));
  updatePending(cell, item);
  return cell;
}

function pendingFace(item) {
  if (item.text != null) {
    return h('div', { class: 'face face-text is-shimmer' },
      h('div', { class: 'face-text-body' }, item.link ? h('span', { class: 'face-sub' }, 'Fetching link…') : null, h('div', null, item.text.slice(0, 600))));
  }
  return h('div', { class: 'face face-file is-shimmer' },
    h('div', { class: 'face-ext' }, (item.name.split('.').pop() || '').toUpperCase().slice(0, 6)),
    h('div', { class: 'face-foot' }, h('div', { class: 'face-name' }, item.name), h('div', { class: 'face-sub' }, fmtBytes(item.file?.size))));
}

export function updatePending(cell, item) {
  cell.style.setProperty('--p', item.status === 'done' ? 1 : Math.max(0.03, item.progress || 0));
  cell.classList.toggle('is-failed', item.status === 'failed');
  const cap = cell.querySelector('.cell-title');
  if (item.status === 'failed') {
    cap.replaceChildren(h('span', { class: 'cell-error' }, item.error || 'Upload failed'), ' · ',
      h('button', { type: 'button', class: 'link', dataset: { act: 'retry' } }, 'Retry'));
  }
}
