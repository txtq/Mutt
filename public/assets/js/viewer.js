// Full-screen block view: the block on the left, its details on the right.

import { commentSection } from './comments.js';
import { momentLine } from './moments.js';
import { deleteBlock, editPicture, openConnect, openSave, removeFromDrawer, takeHistoryWish, watchPreview } from './actions.js';
import { downloadMenu, formatsOf } from './downloads.js';
import { api, session } from './api.js';
import { KIND_ONE, canEditPicture, displayTitle, extLabel, imageSrc } from './kinds.js';
import { markdown } from './md.js';
import { sound } from './sound.js';
import { briefNote } from './cells.js';
import { drawerHref } from './nav.js';
import { loadPdfjs } from './pdfjs.js';
import { planetDot } from './planets.js';
import { canTransition, transition } from './transitions.js';
import { enterRoom, leaveRoom, toast } from './ui.js';
import { DUR, EASE, autosize, bus, fmtBytes, fmtDuration, fullDate, h, inViewport, isEditable, paperFaces, personLabel, plural, reducedMotion, styles, touchScreen, wait } from './util.js';
import { icon } from './icons.js';

let hooks = { step: () => {}, close: () => {}, go: () => {} };
export function configureViewer(next) {
  hooks = { ...hooks, ...next };
}

let state = null;

export const viewerOpen = () => !!state;
export const viewerBlockId = () => state?.block.id;

function findCell(id) {
  const el = document.querySelector(`#view [data-vt="b-${CSS.escape(id)}"]`);
  return el && !el.closest('.is-ghosting') ? el : null;
}

export async function openViewer(id, { list = [], drawer = null } = {}) {
  const known = list.find((b) => b.id === id);
  let block = known;
  let connections = null;
  if (!block) {
    try {
      ({ block, connections } = await api.get(`/api/blocks/${id}`));
    } catch (err) {
      toast(err.message);
      hooks.close();
      return;
    }
  }
  if (state) {
    show(block, { list, drawer, connections });
    return;
  }
  state = { block, list: list.length ? list : [block], drawer, connections };
  const from = findCell(id);
  const fromVisible = from && inViewport(from) ? from : null;
  // Carried in by the page change, it must not also play its own fade once that is over.
  const carried = canTransition();
  await transition(() => mount(carried), {
    type: 'viewer',
    before: () => (fromVisible ? [[fromVisible, `b-${id}`]] : []),
    after: () => (state?.media ? [[state.media, `b-${id}`]] : []),
  });
  if (!connections) loadConnections();
  wantShot(block);
}

export async function closeViewer() {
  if (!state) return;
  const s = state;
  const id = s.block.id;
  let cell = findCell(id);
  if (cell && !inViewport(cell)) {
    cell.scrollIntoView({ block: 'center' });
  }
  cell = cell && inViewport(cell) ? cell : null;
  s.media?.querySelector('video, audio')?.pause?.();
  s.media?.matches?.('video') && s.media.pause();
  s.cleanup?.();
  await transition(() => {
    s.el.remove();
    leaveRoom();
    removeEventListener('keydown', s.onKey);
  }, {
    type: 'viewer',
    before: () => (s.media ? [[s.media, `b-${id}`]] : []),
    after: () => (cell ? [[cell, `b-${id}`]] : []),
  });
  if (state === s) state = null;
}

// Jump to another block without leaving the viewer.
function show(block, { list, drawer, connections } = {}) {
  if (list?.length) state.list = list;
  if (drawer !== undefined) state.drawer = drawer;
  state.block = block;
  state.connections = connections || null;
  renderStage();
  renderSide();
  if (!connections) loadConnections();
  wantShot(block);
}

// Links from before screenshots (or whose picture got stuck) get one now.
async function wantShot(block) {
  if (block.kind !== 'link' || block.mine === false || block.meta?.embed || block.meta?.shot === 'done') return;
  try {
    const { block: next } = await api.post(`/api/blocks/${block.id}/preview`);
    if (next.meta?.shot !== 'pending') return;
    if (state?.block.id === block.id && !state.block.thumb) {
      state.block = { ...state.block, meta: next.meta };
      renderStage();  // show the picture's placeholder while it's taken
    }
    watchPreview(next);
  } catch { /* keep what it has */ }
}

function step(delta) {
  const { list, block } = state;
  const index = list.findIndex((b) => b.id === block.id);
  if (index < 0 || list.length < 2) return;
  const next = list[(index + delta + list.length) % list.length];
  sound('turn');
  show(next);
  state.stepping?.cancel();
  const slide = state.stage.animate(
    [{ opacity: 0, transform: `translateX(${delta * 14}px)`, filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'none' }],
    { duration: reducedMotion() ? 0 : DUR.move, easing: EASE },
  );
  state.stepping = slide;
  // A picture that isn't ready waits a moment to slide in whole, rather
  // than popping in halfway through.
  const img = state.media.tagName === 'IMG' && !state.media.complete ? state.media : null;
  if (img) {
    slide.pause();
    Promise.race([img.decode().catch(() => {}), wait(160)]).then(() => { if (state?.stepping === slide) slide.play(); });
  }
  hooks.step(next.id);
}

async function loadConnections() {
  const id = state?.block.id;
  try {
    const res = await api.get(`/api/blocks/${id}`);
    if (state?.block.id !== id) return;
    state.block = { ...state.block, ...res.block };
    state.connections = res.connections;
    renderSide();
  } catch { /* the side panel just shows what it has */ }
}

function mount(carried = false) {
  const counter = h('span', { class: 'vw-count' });
  const prev = h('button', { type: 'button', class: 'btn btn-quiet btn-round vw-btn', 'aria-label': 'Previous', title: 'Previous', onclick: () => step(-1) }, icon('chevron-left'));
  const next = h('button', { type: 'button', class: 'btn btn-quiet btn-round vw-btn', 'aria-label': 'Next', title: 'Next', onclick: () => step(1) }, icon('chevron-right'));
  const close = h('button', { type: 'button', class: 'btn btn-quiet vw-btn vw-close', 'aria-label': 'Close', onclick: () => hooks.close() }, 'Close');
  state.stage = h('div', { class: 'vw-stage' });
  state.side = h('aside', { class: 'vw-side' });
  state.counter = counter;
  state.nav = h('div', { class: 'vw-nav' }, prev, counter, next);
  state.el = h('div', { class: `viewer room${carried ? ' is-carried' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Block' },
    h('div', { class: 'vw-top' }, state.nav, close),
    state.stage,
    state.side);
  state.onKey = (e) => {
    if (e.defaultPrevented || isEditable(document.activeElement) || document.querySelector('.scrim, .pop, .pe')) return;
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  };
  addEventListener('keydown', state.onKey);
  swipeable(state.stage);
  document.body.append(state.el);
  enterRoom();
  renderStage();
  renderSide();
}

// On a phone, a quick sideways swipe across the file goes to the next or
// previous one. Not when it starts on something that moves sideways itself
// (a video's scrubber, a wide code box), nor while the page is pinched in.
function swipeable(stage) {
  let start = null;
  stage.addEventListener('touchstart', (e) => {
    start = null;
    if (e.touches.length !== 1 || (window.visualViewport?.scale || 1) > 1.05) return;
    if (e.target.closest('video, audio, iframe, input, textarea, select, [contenteditable], .pm-catch, .pm-bar') || slides(e.target, stage)) return;
    const t = e.touches[0];
    start = { x: t.clientX, y: t.clientY, at: e.timeStamp };
  }, { passive: true });
  stage.addEventListener('touchmove', (e) => { if (e.touches.length > 1) start = null; }, { passive: true });
  stage.addEventListener('touchcancel', () => { start = null; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (!start || !state) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const quick = e.timeStamp - start.at < 700;
    start = null;
    if (quick && Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.6) step(dx < 0 ? 1 : -1);
  }, { passive: true });
}

// Whether anything between the finger and the stage scrolls sideways.
function slides(el, stage) {
  for (let n = el; n && n !== stage; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- stage

function renderStage() {
  const { block, list } = state;
  const index = list.findIndex((b) => b.id === block.id);
  state.counter.textContent = list.length > 1 && index >= 0 ? `${index + 1} / ${list.length}` : '';
  state.nav.classList.toggle('is-single', list.length < 2);
  state.cleanup?.();
  state.cleanup = null;
  state.media = stageMedia(block);
  state.media.dataset.vtMedia = '';
  state.stage.dataset.kind = block.kind;
  state.stage.replaceChildren(state.media);
}

function stageMedia(block) {
  const src = imageSrc(block);
  if (block.kind === 'image' && src) {
    const img = h('img', { class: 'vw-media vw-img', src, alt: displayTitle(block), draggable: false });
    if (block.width && block.height) { img.width = block.width; img.height = block.height; }
    const full = block.ext === 'heic' || block.ext === 'heif' || block.ext === 'tif' || block.ext === 'tiff' ? null : block.file;
    if (full && full !== src) {
      const pre = new Image();
      pre.onload = () => { if (img.isConnected) img.src = full; };
      pre.src = full;
    }
    return img;
  }
  if (block.kind === 'video' && block.file) {
    const video = h('video', { class: 'vw-media vw-video', src: block.file, controls: true, playsInline: true, preload: 'metadata' });
    if (block.thumb) video.poster = block.thumb;
    if (block.width && block.height) { video.width = block.width; video.height = block.height; }
    return video;
  }
  if (block.kind === 'pdf' && block.file) return pdfStage(block);
  if (block.kind === 'link') return linkStage(block);
  if (block.kind === 'text') return textStage(block);
  if (block.kind === 'audio' && block.file) {
    return h('div', { class: 'vw-media vw-card fglass' },
      h('div', { class: 'vw-card-ext' }, extLabel(block)),
      h('div', { class: 'vw-card-name' }, displayTitle(block)),
      h('audio', { src: block.file, controls: true, preload: 'metadata' }));
  }
  if (block.file && PAGED_DOCS.has((block.ext || '').toLowerCase())) return docStage(block);
  if (block.meta?.excerpt && block.file && block.size < 400 * 1024) {
    const pre = h('pre', { class: 'vw-code' }, block.meta.excerpt);
    fetch(block.file, { credentials: 'same-origin' }).then((r) => (r.ok ? r.text() : null)).then((t) => { if (t != null) pre.textContent = t; }).catch(() => {});
    return h('div', { class: 'vw-media vw-codebox' }, pre);
  }
  return fileCard(block);
}

// A file with nothing to show: what it is, in box glass.
function fileCard(block) {
  return h('div', { class: 'vw-media vw-card fglass' },
    h('div', { class: 'vw-card-ext' }, extLabel(block)),
    h('div', { class: 'vw-card-name' }, block.fileName || displayTitle(block)),
    h('div', { class: 'vw-card-sub' }, fmtBytes(block.size)),
    block.file ? downloadButton(block, 'btn btn-main') : null);
}

// Download, as it is or as another kind of file: a menu when it can become something else.
function downloadButton(block, cls = 'btn') {
  const more = formatsOf(block).length > 0;
  return h('button', {
    type: 'button', class: cls, ...(more ? { 'aria-haspopup': 'menu' } : {}),
    onclick: (e) => downloadMenu(e.currentTarget, state?.block.id === block.id ? state.block : block),
  }, 'Download', more ? icon('caret') : null);
}

// The address along the top, like a browser's: click it to go to the site.
function linkBar(block) {
  let host = block.meta?.domain || block.content;
  let path = '';
  try {
    const url = new URL(block.content);
    host = url.hostname.replace(/^www\./, '');
    path = `${url.pathname}${url.search}`.replace(/^\/$/, '');
  } catch { /* show it as typed */ }
  return h('a', { class: 'vw-link-bar', href: block.content, target: '_blank', rel: 'noopener noreferrer', title: block.content },
    h('span', { class: 'vw-link-host' }, host),
    h('span', { class: 'vw-link-path' }, path),
    h('span', { class: 'vw-link-go', 'aria-hidden': 'true' }, icon('out')));
}

function linkStage(block) {
  if (block.meta?.embed) {
    return h('div', { class: 'vw-media vw-link vw-link-play' },
      linkBar(block),
      h('div', { class: 'vw-embed' }, h('iframe', {
        src: block.meta.embed, title: displayTitle(block), allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
        allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin',
      })));
  }
  const pending = block.meta?.shot === 'pending';
  const picture = block.thumb
    ? h('a', { class: 'vw-link-shot', href: block.content, target: '_blank', rel: 'noopener noreferrer', tabindex: '-1' },
      h('img', { src: block.thumb, alt: displayTitle(block), draggable: false }))
    : pending ? h('div', { class: 'vw-link-shot is-pending is-shimmer' }) : null;
  return h('div', { class: 'vw-media vw-link' },
    linkBar(block),
    picture,
    h('div', { class: 'vw-link-body' },
      block.meta?.siteName ? h('div', { class: 'vw-link-site' }, block.meta.siteName) : null,
      picture ? null : h('div', { class: 'vw-link-title' }, block.title || block.content),
      block.meta?.description ? h('p', { class: 'vw-link-desc' }, block.meta.description) : null));
}

// Your own text: click it to edit right there. Saves when you click away.
function textStage(block) {
  const body = h('div', { class: 'vw-text-body md', html: markdown(block.content) });
  const wrap = h('div', { class: `vw-media vw-text${briefNote(block.content) ? ' is-brief' : ''}` }, body);
  if (block.mine === false) return wrap;
  body.classList.add('is-editable');
  wrap.classList.add('is-editable');
  let editing = false;
  wrap.addEventListener('click', (e) => {
    if (editing || e.target.closest('a') || !getSelection().isCollapsed) return;
    edit();
  });

  function edit() {
    editing = true;
    const area = h('textarea', { class: 'vw-text-area', value: block.content, 'aria-label': 'Text', spellcheck: 'true' });
    let done = false;
    const finish = async (keep) => {
      if (done) return;
      done = true;
      const content = area.value;
      const back = () => { editing = false; wrap.replaceChildren(body); };
      if (!keep || content === block.content) { back(); return; }
      try {
        const { block: saved } = await api.patch(`/api/blocks/${block.id}`, { content });
        applyUpdate(saved);
      } catch (err) {
        toast(err.message);
        back();
      }
    };
    area.addEventListener('blur', () => finish(true));
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); area.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    // Grown past what a note holds: offer the document editor.
    const long = momentLine(area, {
      acts: { writing: { label: 'Open it as a document', run: async () => { await finish(true); openDocEditor(block.id); } } },
    });
    area.addEventListener('input', () => long.check(area.value));
    long.check(area.value);
    wrap.replaceChildren(area, long, h('div', { class: 'vw-hint' }, touchScreen() ? 'tap outside to save' : 'click away to save · esc to cancel'));
    autosize(area);
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }
  return wrap;
}

// The document editor is only fetched when a note is opened as a document.
async function openDocEditor(id) {
  try {
    const [editor] = await Promise.all([import('./doceditor.js'), styles('docs.css')]);
    editor.openDocEditor(id);
  } catch (err) { toast(err.message); }
}

// PDFs are drawn page by page with pdf.js, so they read the same in every
// browser (phones won't show a PDF inside a page otherwise). Each page also
// gets pdf.js's see-through text, so its words can be picked and copied. On
// your own PDF, picking words or pressing "Mark up" fetches the markup tools
// (pdfedit.js, which writes the changes into the file); `view` is what they
// work with.
const PDF_ZOOMS = [0.6, 0.8, 1, 1.3, 1.7];

function pdfStage(block) {
  const pages = h('div', { class: 'vw-pdf-pages' });
  const count = h('span', { class: 'vw-pdf-count' }, block.meta?.pages ? plural(block.meta.pages, 'page') : '');
  const zoomOut = h('button', { type: 'button', class: 'btn btn-quiet btn-round vw-btn', 'aria-label': 'Zoom out', title: 'Zoom out' }, icon('minus'));
  const zoomIn = h('button', { type: 'button', class: 'btn btn-quiet btn-round vw-btn', 'aria-label': 'Zoom in', title: 'Zoom in' }, icon('plus'));
  const markBtn = block.mine === false ? null
    : h('button', { type: 'button', class: 'btn btn-small vw-pdf-mark', 'aria-pressed': 'false', disabled: true }, icon('edit'), 'Mark up');
  const tools = h('span', { class: 'vw-pdf-zoom' }, markBtn, zoomOut, zoomIn);
  const bar = h('div', { class: 'vw-pdf-bar' }, count, tools);
  const wrap = h('div', { class: 'vw-media vw-pdf' }, bar, pages);
  // The first page's preview (or a blank page) stands in while the real thing loads.
  const ratio = block.width && block.height ? `${block.width} / ${block.height}` : '8.5 / 11';
  pages.append(h('div', { class: 'vw-pdf-page is-shimmer', style: block.thumb ? {} : { aspectRatio: ratio } },
    block.thumb ? h('img', { src: block.thumb, alt: '' }) : null));

  let doc = null;
  let observer = null;
  let gone = false;
  let zoom = 2;
  let redraw = 0;
  let markup = null;
  const rendering = new Map();
  // Each page's words sit in pdf.js's units; --scale-factor is how many of the page's own pixels make one of those.
  const sized = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const pw = Number(target.dataset.pw);
      if (pw) target.style.setProperty('--scale-factor', target.clientWidth / pw);
    }
    showPage();   // the count is right once the pages have their real height
    if (innerWidth <= 720) catchUp();
  });

  const view = {
    block, wrap, bar, pages, markBtn,
    get doc() { return doc; },
    info: new Map(),        // page number -> { vp: its viewport at scale 1, page }
    text: new Map(),        // page number -> its words, as pdf.js reads them
    onPage: null,           // the markup tools' hook: a page has been (re)drawn
    boxOf: (n) => pages.querySelector(`.vw-pdf-page[data-n="${n}"]`),
    // A new copy of the PDF to draw from (the markup tools draw their marks themselves).
    async swap(data) {
      const pdfjs = await loadPdfjs();
      const next = await pdfjs.getDocument({ data: data.slice(), isEvalSupported: false }).promise;
      if (gone) { next.destroy(); return; }
      const old = doc;
      doc = next;
      view.info.clear();
      view.text.clear();
      rendering.clear();
      // The words are read again too: the old copy may have held words the new one doesn't.
      for (const box of pages.children) { delete box.dataset.w; box.querySelector('.vw-pdf-text')?.remove(); }
      await Promise.all([...pages.querySelectorAll('.vw-pdf-page.is-near')].map(draw));
      old?.destroy();
    },
    // The markup tools saved a new copy of the file.
    saved(next) {
      if (state?.block.id !== block.id) return;
      state.block = { ...state.block, ...next };
      state.list = state.list.map((b) => (b.id === next.id ? state.block : b));
      view.block = state.block;
      bus.emit('block:changed', state.block);
      renderSide();
    },
  };
  state.pdf = view;
  state.cleanup = () => {
    gone = true;
    clearTimeout(redraw);
    observer?.disconnect();
    sized.disconnect();
    markup?.then((m) => m?.destroy());
    doc?.destroy();
    if (state?.pdf === view) state.pdf = null;
  };

  // The tools are only fetched when they're wanted: words picked, or "Mark up".
  const tools$ = () => {
    markup ||= Promise.all([import('./pdfedit.js'), styles('pdfedit.css')])
      .then(([m]) => (gone ? null : m.markup(view)))
      .catch((err) => { markup = null; toast(err.message); return null; });
    return markup;
  };
  if (markBtn) {
    markBtn.addEventListener('click', async () => {
      markBtn.classList.add('is-busy');
      const m = await tools$();
      markBtn.classList.remove('is-busy');
      m?.toggle();
    });
    pages.addEventListener('pointerup', (e) => {
      if (e.button || !doc) return;
      setTimeout(() => {
        const sel = getSelection();
        if (sel.isCollapsed || !pages.contains(sel.anchorNode)) return;
        tools$().then((m) => m?.picked());
      });
    });
  }

  const targetWidth = (page) => Math.round(page.clientWidth * Math.min(devicePixelRatio || 1, 2));

  async function draw(box) {
    const n = Number(box.dataset.n);
    const width = targetWidth(box);
    if (!width || box.dataset.w === String(width) || rendering.get(n) === width) return;
    rendering.set(n, width);
    const from = doc;
    try {
      const page = await from.getPage(n);
      const base = page.getViewport({ scale: 1 });
      view.info.set(n, { vp: base, page });
      box.style.aspectRatio = `${base.width} / ${base.height}`;
      box.dataset.pw = String(base.width);
      box.style.setProperty('--scale-factor', box.clientWidth / base.width);
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = h('canvas', { width: Math.round(viewport.width), height: Math.round(viewport.height) });
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      if (gone || from !== doc || rendering.get(n) !== width) return;
      // Scrolled away while it was being drawn: let it go at once.
      if (innerWidth <= 720 && !markup && !box.classList.contains('is-near')) {
        rendering.delete(n);
        canvas.width = 0;
        canvas.height = 0;
        return;
      }
      const old = box.querySelector(':scope > canvas, :scope > img');
      if (old) old.replaceWith(canvas);
      else box.prepend(canvas);
      box.dataset.w = String(width);
      box.classList.remove('is-shimmer');
      if (!box.querySelector('.vw-pdf-text')) words(box, n, page, base, canvas);
      view.onPage?.(n, box);
    } catch {
      rendering.delete(n);
    }
  }

  // On a phone, whether a page is truly near is read from where it sits on the page,
  // not from how it looks: while the view grows in from a file's small box, all of a
  // long PDF looks near, and drawing it all at once is what made Safari reload.
  function closeBy(box) {
    if (innerWidth > 720) return true;
    if (!box.offsetHeight || !pages.clientHeight) return false;   // not laid out yet
    const top = box.offsetTop - (pages.firstElementChild?.offsetTop || 0) - pages.scrollTop;
    return top + box.offsetHeight > -900 && top < pages.clientHeight + 900;
  }
  let queued = 0;
  function catchUp() {
    if (queued || !doc) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      pages.querySelectorAll('.vw-pdf-page.is-near:not([data-w])').forEach((box) => { if (closeBy(box)) draw(box); });
    });
  }

  // On a phone a page far off screen lets its picture go (about 3 MB each: a long PDF
  // read to the end held hundreds) and is drawn again when it comes near.
  function forgetPage(box) {
    const canvas = box.querySelector(':scope > canvas');
    if (!canvas || !box.dataset.w) return;
    rendering.delete(Number(box.dataset.n));
    delete box.dataset.w;
    box.classList.add('is-shimmer');
    canvas.width = 0;
    canvas.height = 0;
    canvas.remove();
  }

  // pdf.js's see-through words over the picture of the page.
  async function words(box, n, page, vp, canvas) {
    const layer = h('div', { class: 'vw-pdf-text' });
    (box.querySelector(':scope > .pm-multiply') || canvas).after(layer);
    try {
      const pdfjs = await loadPdfjs();
      const content = await page.getTextContent();
      if (gone) return;
      view.text.set(n, content);
      await new pdfjs.TextLayer({ textContentSource: content, container: layer, viewport: vp }).render();
      layer.append(h('div', { class: 'endOfContent' }));
      // While words are being picked, the empty part of the page doesn't jump the pick about.
      layer.addEventListener('pointerdown', () => {
        layer.classList.add('selecting');
        addEventListener('pointerup', () => layer.classList.remove('selecting'), { once: true, capture: true });
      });
    } catch {
      layer.remove();
    }
  }

  function setZoom(next) {
    zoom = Math.max(0, Math.min(PDF_ZOOMS.length - 1, next));
    pages.style.setProperty('--zoom', PDF_ZOOMS[zoom]);
    zoomOut.disabled = zoom === 0;
    zoomIn.disabled = zoom === PDF_ZOOMS.length - 1;
    // Pages on screen redraw sharp once they've grown; the rest when reached.
    clearTimeout(redraw);
    redraw = setTimeout(() => pages.querySelectorAll('.vw-pdf-page.is-near').forEach((box) => { if (closeBy(box)) draw(box); }), DUR.arrive);
  }
  zoomOut.addEventListener('click', () => setZoom(zoom - 1));
  zoomIn.addEventListener('click', () => setZoom(zoom + 1));
  setZoom(zoom);

  const showPage = () => {
    if (!doc) return;
    const top = pages.getBoundingClientRect().top + pages.clientHeight / 3;
    const boxes = pages.children;
    let current = 1;
    for (const box of boxes) {
      if (box.getBoundingClientRect().top > top) break;
      current = Number(box.dataset.n) || current;
    }
    count.textContent = `${current} / ${doc.numPages}`;
  };
  pages.addEventListener('scroll', showPage, { passive: true });

  (async () => {
    try {
      const pdfjs = await loadPdfjs();
      if (gone) return;
      doc = await pdfjs.getDocument({ url: block.file, isEvalSupported: false }).promise;
      if (gone) { doc.destroy(); return; }
      const first = (await doc.getPage(1)).getViewport({ scale: 1 });
      const boxes = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const box = h('div', { class: 'vw-pdf-page is-shimmer', dataset: { n }, style: { 'aspect-ratio': `${first.width} / ${first.height}` } });
        boxes.push(box);
      }
      const poster = pages.querySelector('img');
      if (poster) boxes[0].append(poster);
      pages.replaceChildren(...boxes);
      boxes.forEach((box) => sized.observe(box));
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          entry.target.classList.toggle('is-near', entry.isIntersecting);
          if (entry.isIntersecting) { if (closeBy(entry.target)) draw(entry.target); }
          else if (innerWidth <= 720 && !markup) forgetPage(entry.target);
        }
        showPage();  // once the pages have their real size
      }, { root: pages, rootMargin: '900px 0px' });
      boxes.forEach((box) => observer.observe(box));
      // A page held back while the view grew in is drawn once it settles, or when scrolled to.
      if (innerWidth <= 720) {
        pages.addEventListener('scroll', catchUp, { passive: true });
        setTimeout(catchUp, DUR.scene);
      }
      if (markBtn) markBtn.disabled = false;
    } catch {
      if (gone) return;
      wrap.replaceChildren(h('div', { class: 'vw-card fglass' },
        h('div', { class: 'vw-card-ext' }, 'PDF'),
        h('div', { class: 'vw-card-name' }, block.fileName || displayTitle(block)),
        h('a', { class: 'btn btn-main', href: block.file, target: '_blank', rel: 'noopener' }, 'Open', icon('out'))));
    }
  })();
  return wrap;
}

// A Word, OpenDocument or RTF file is shown as its pages: the server reads it
// into a document's HTML (mutt/convert.py), set here on paper.
const PAGED_DOCS = new Set(['docx', 'odt', 'rtf']);

function docStage(block) {
  const sheet = h('div', { class: 'vw-doc-sheet is-shimmer' });
  const wrap = h('div', { class: 'vw-media vw-doc' }, sheet);
  let gone = false;
  state.cleanup = () => { gone = true; };
  paperFaces();
  api.get(`/api/blocks/${block.id}/document`).then(({ html }) => {
    if (gone) return;
    sheet.classList.remove('is-shimmer');
    sheet.innerHTML = html;
    if (!sheet.textContent.trim()) throw new Error('empty');
  }).catch(() => {
    if (gone) return;
    const card = fileCard(block);
    card.dataset.vtMedia = '';
    wrap.replaceWith(card);
    if (state.media === wrap) state.media = card;
  });
  return wrap;
}

// Writing kept as a file (Word, OpenDocument, RTF, text, Markdown) or a PDF
// can be made into a Mutt document, which opens in the editor. The file stays.
const DOC_FROM = new Set([...PAGED_DOCS, 'txt', 'text', 'md', 'markdown']);
const canBeDocument = (block) => block.mine !== false && !!block.file
  && (block.kind === 'pdf' || DOC_FROM.has((block.ext || '').toLowerCase()));

async function makeDocument(btn) {
  const block = state.block;
  btn.classList.add('is-busy');
  const label = btn.lastChild.textContent;
  btn.lastChild.textContent = 'Making a document…';
  try {
    const body = { drawer: state.drawer?.id || null };
    if (block.kind === 'pdf') Object.assign(body, await pdfAsDocument(block));
    const res = await api.post(`/api/blocks/${block.id}/document`, body);
    bus.emit('block:connected', { block: res.block, drawerId: res.drawer, connections: [], position: res.position });
    toast(`Made a document from ${displayTitle(block) || 'the file'} · the file is kept`);
    // On its planet's page the file view steps aside for the document (the planet's own ?doc=),
    // so closing it lands on the planet, the new document beside the file. Elsewhere it opens on top.
    const here = new URL(location.href);
    if (res.drawer && here.pathname === `/p/${res.drawer}`) {
      here.searchParams.delete('b');
      here.searchParams.set('doc', res.block.id);
      const { go } = await import('./router.js');
      go(here.pathname + here.search, { replace: true });
    } else openDocEditor(res.block.id);
  } catch (err) {
    toast(err.message);
  } finally {
    if (btn.isConnected) { btn.classList.remove('is-busy'); btn.lastChild.textContent = label; }
  }
}

// A PDF's words, read in the browser the way the reader reads one
// (pdfbook.js), as a document's HTML and the note's Markdown.
async function pdfAsDocument(block) {
  const [{ pdfToBook }, { toMarkdown, escapeHtml }, { changedLines, withChangedLines }] = await Promise.all([
    import('./pdfbook.js'), import('./docformat.js'), import('./pdfedit.js')]);
  // Lines whose words were changed here still hold the old words under their patch: read the new ones.
  const changed = await fetch(block.file).then((r) => r.arrayBuffer()).then(changedLines).catch(() => []);
  const book = await pdfToBook(block.file, { adjust: (i, items) => withChangedLines(items, changed[i]) });
  const titled = book.chapters.length > 1 && !book.chapters.every((c) => /^Pages \d/.test(c.title));
  const parts = [];
  for (const chapter of book.chapters) {
    const first = chapter.blocks[0];
    if (titled && chapter.title !== 'Opening' && !(first && /^h/.test(first.t) && first.x === chapter.title)) {
      parts.push(`<h1>${escapeHtml(chapter.title)}</h1>`);
    }
    for (const b of chapter.blocks) {
      const tag = b.t === 'h1' || b.t === 'h2' ? b.t : 'p';
      parts.push(`<${tag}>${escapeHtml(b.x)}</${tag}>`);
    }
  }
  const html = parts.join('');
  const root = h('div', { html });
  return { html, text: toMarkdown(root) };
}

// ---------------------------------------------------------------- side panel

function editable(block, key, { placeholder, className }) {
  const area = h('textarea', { class: className, rows: 1, placeholder, value: block[key] || '', spellcheck: 'true' });
  autosize(area);
  const save = async () => {
    const value = area.value.trim();
    if (value === (state.block[key] || '')) return;
    try {
      const { block: saved } = await api.patch(`/api/blocks/${block.id}`, { [key]: value });
      applyUpdate(saved, { keepSide: true });
    } catch (err) {
      toast(err.message);
      area.value = state.block[key] || '';
    }
  };
  area.addEventListener('blur', save);
  area.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' && (key === 'title' || e.metaKey || e.ctrlKey)) || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      area.blur();
    }
  });
  return area;
}

function metaRows(block) {
  const rows = [['Kind', block.ext ? `${KIND_ONE[block.kind]} · ${block.ext.toUpperCase()}` : KIND_ONE[block.kind]]];
  if (block.size) rows.push(['Size', fmtBytes(block.size)]);
  if (block.width && block.height) rows.push(['Dimensions', `${block.width} × ${block.height}`]);
  if (block.duration) rows.push(['Length', fmtDuration(block.duration)]);
  if (block.meta?.pages) rows.push(['Pages', String(block.meta.pages)]);
  if (block.kind === 'text') rows.push(['Words', String((block.content.match(/\S+/g) || []).length)]);
  if (block.fileName) rows.push(['File', block.fileName]);
  const story = block.story;
  rows.push([story?.savedBy ? 'Saved' : 'Added', fullDate(block.createdAt)]);
  if (block.updatedAt - block.createdAt > 60000) rows.push(['Edited', fullDate(block.updatedAt)]);
  if (block.meta?.original && block.mine !== false) rows.push(['Original', `${block.meta.original.width} × ${block.meta.original.height}, kept`]);
  // A saved copy says who first made it and who saved it (and from whom, when
  // that was someone in between), to everyone who can see it.
  if (story?.savedBy) {
    if (story.madeBy) rows.push(['Made by', personLink(story.madeBy)]);
    const via = story.savedFrom && story.savedFrom.username !== story.madeBy?.username;
    const beamed = block.mine !== false && block.meta?.beamedBy;
    // to its owner, a copy someone beamed them says so, with their words (others see who saved it, as for any copy)
    if (beamed) rows.push(['Beamed by', personLink(beamed)]);
    if (beamed?.words) rows.push(['Their words', `“${beamed.words}”`]);
    if (!beamed) rows.push(['Saved by', via ? h('span', null, personLink(story.savedBy), ' from ', personLink(story.savedFrom)) : personLink(story.savedBy)]);
  } else if (block.meta?.savedFrom) {
    rows.push(['From', personLink(block.meta.savedFrom)]);
  }
  const source = block.kind === 'link' ? block.content : block.meta?.source;
  if (source) rows.push(['Source', h('a', { href: source, target: '_blank', rel: 'noopener noreferrer' }, block.meta?.domain || source)]);
  return h('dl', { class: 'vw-meta' }, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
}

// Someone, as a file's story names them: the name they gave, else their handle; you are "you".
// A row of its own ("Made by") gives both, "Bob Ray (@bob)"; the fact beside a planet, the name.
const personName = (p) => (p.username === session.user?.username ? 'you' : p.name || `@${p.username}`);
function personLink(p) {
  const shown = p.username === session.user?.username ? 'you' : personLabel(p.username, p.name);
  return h('a', { href: `/g/${p.username}`, onclick: (e) => { e.preventDefault(); hooks.go(`/g/${p.username}`); } }, shown);
}

// Copies of this same file (saved from it, or what it was saved from) on
// other people's planets you can open, each row the planet and whose it is;
// your own copy kept as a star says so.
function elsewhere(block) {
  const away = block.story?.elsewhere || [];
  if (!away.length) return [];
  const planets = away.filter((d) => !d.star);
  const people = new Set(away.map((d) => d.by?.username));
  const open = (d) => `${drawerHref(d)}?b=${d.file}`;
  return [
    h('section', { class: 'vw-conn-head' }, h('span', { class: 'vw-conn-label' },
      people.size === 1 && people.has(session.user?.username) ? 'Your copy' : `In ${plural(people.size, 'other galaxy', 'other galaxies')}`)),
    planets.length ? h('ul', { class: 'vw-conns' }, planets.map((d) => h('li', null, h('a', {
      href: open(d), class: 'vw-conn', onclick: (e) => { e.preventDefault(); hooks.go(open(d)); },
    }, planetDot(d), h('span', null, d.title || 'Untitled'), d.by ? h('span', { class: 'vw-conn-fact' }, personName(d.by)) : null)))) : null,
    away.some((d) => d.star) ? h('div', { class: 'vw-conn-note' }, 'You kept a copy as a star.') : null,
  ];
}

function saveButton(block) {
  const btn = h('button', { type: 'button', class: 'btn btn-main btn-save' }, icon(block.saved ? 'check' : 'onto'), block.saved ? 'Saved' : 'Save');
  btn.addEventListener('click', () => openSave(btn, state.block, {
    align: 'end',
    onSaved: () => {
      state.block = { ...state.block, saved: true };
      bus.emit('block:saved', state.block);
      renderSide();
    },
  }));
  return h('div', { class: 'vw-save' }, btn);
}

// The comments keep their place (and anything half written) while the rest
// of the side panel is rebuilt around them.
function comments(block) {
  if (state.comments?.id !== block.id) {
    state.comments = commentSection(block, {
      go: (href) => hooks.go(href),
      onCount: (n) => {
        if (state?.block.id !== block.id) return;
        state.block = { ...state.block, commentCount: n };
        state.list = state.list.map((b) => (b.id === block.id ? state.block : b));
        bus.emit('block:changed', state.block);
      },
    });
  }
  // Edged in the colour of the planet it was opened from.
  const c = state.drawer?.icon?.c || state.drawer?.c;
  if (c) state.comments.el.style.setProperty('--pc', c);
  return state.comments.el;
}

// A note's history (history.js), once your note has an earlier copy. Like the
// comments, it keeps its place while the side panel is rebuilt around it.
function history(block) {
  if (block.kind !== 'text' || block.mine === false) return null;
  if (state.history?.id === block.id) {
    state.history.inst?.update(block);
    return state.history.el;
  }
  state.history = null;
  if (!block.versions) return null;
  const slot = { id: block.id, el: h('div', { class: 'vw-hist-slot' }), inst: null };
  state.history = slot;
  import('./history.js').then(({ historySection }) => {
    if (state?.history !== slot) return;
    slot.inst = historySection(block, {
      block: () => state.block,
      show: (el) => {
        state.cleanup?.();
        state.cleanup = null;
        state.media = el;
        el.dataset.vtMedia = '';
        state.stage.replaceChildren(el);
        // On a phone the history sits below the note: go up to where the copy now shows.
        if (state.stage.getBoundingClientRect().top < 0) state.el.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      },
      back: () => renderStage(),
      restored: (saved) => applyUpdate(saved),
    });
    slot.el.append(slot.inst.el);
    if (takeHistoryWish(block.id)) slot.inst.reveal();
  }).catch(() => { /* no history to show */ });
  return slot.el;
}

// replaceChildren would print a skipped (null) piece as the word “null”.
const fill = (el, ...kids) => el.replaceChildren(...kids.filter((k) => k != null && k !== false));

function renderSide() {
  const { block, connections, drawer } = state;
  const actions = h('div', { class: 'vw-actions' },
    canEditPicture(block) ? h('button', { type: 'button', class: 'btn', onclick: () => editPicture(state.block) }, icon('edit'), 'Edit') : null,
    block.file || block.kind === 'text' ? downloadButton(block) : null,
    block.file && block.kind !== 'pdf' ? h('a', { class: 'btn btn-quiet', href: block.file, target: '_blank', rel: 'noopener' }, 'Original', icon('out')) : null,
    block.file && block.kind === 'pdf' ? h('a', { class: 'btn btn-quiet', href: block.file, target: '_blank', rel: 'noopener' }, 'Open', icon('out')) : null,
    block.kind === 'link' ? h('a', { class: 'btn', href: block.content, target: '_blank', rel: 'noopener noreferrer' }, 'Visit', icon('out')) : null,
    // Writing longer than a sentence or two can be opened as a document.
    block.kind === 'text' && (block.content.trim().length >= 280 || (block.content.match(/[.!?](\s|$)/g) || []).length >= 3)
      ? h('button', { type: 'button', class: 'btn', onclick: () => openDocEditor(block.id) }, 'Open as a document') : null,
    canBeDocument(block)
      ? h('button', { type: 'button', class: 'btn', onclick: (e) => makeDocument(e.currentTarget) }, icon('page'), 'Make it a document') : null);

  const count = connections?.length ?? block.connectionCount ?? 0;
  // Opened on one of its planets: the others are "also on", and each opens
  // this same file there. Opened anywhere else (search, a star): all of them.
  const here = drawer && connections?.some((d) => d.id === drawer.id) ? drawer.id : null;
  const others = connections ? connections.filter((d) => d.id !== here) : null;
  const where = here
    ? (others.length ? `Also on ${plural(others.length, 'planet')}` : 'Only on this planet')
    : count ? `On ${plural(count, 'planet')}` : 'A loose star';
  const go = (d) => (here ? `${drawerHref(d)}?b=${block.id}` : drawerHref(d));
  const planetLink = (d) => h('a', {
    href: go(d), class: 'vw-conn', onclick: (e) => { e.preventDefault(); hooks.go(go(d)); },
  }, planetDot(d), h('span', null, d.title || 'Untitled'), d.parentId ? h('span', { class: 'vw-conn-fact' }, 'moon') : null);

  // Someone else's file, seen on one of their planets: look, keep a copy, don't touch.
  if (block.mine === false) {
    const owner = block.owner;
    fill(state.side,
      h('h2', { class: 'vw-title vw-title-static' }, displayTitle(block) || 'Untitled'),
      block.description ? h('p', { class: 'vw-desc vw-desc-static' }, block.description) : null,
      h('a', { class: 'vw-owner', href: `/g/${owner}`, onclick: (e) => { e.preventDefault(); hooks.go(`/g/${owner}`); } }, personLabel(owner, block.ownerName)),
      actions,
      saveButton(block),
      metaRows(block),
      others?.length ? h('section', { class: 'vw-conn-head' }, h('span', { class: 'vw-conn-label' }, where)) : null,
      others?.length ? h('ul', { class: 'vw-conns' }, others.map((d) => h('li', null, planetLink(d)))) : null,
      ...elsewhere(block),
      comments(block));
    return;
  }

  const connectBtn = h('button', { type: 'button', class: 'btn btn-small', 'aria-haspopup': 'dialog' }, 'Planets', icon('caret'));
  connectBtn.addEventListener('click', () => openConnect(connectBtn, state.block, { align: 'end' }));

  const list = others == null
    ? h('div', { class: 'vw-conn-note' }, '…')
    : others.length
      ? h('ul', { class: 'vw-conns' }, others.map((d) => h('li', null,
        planetLink(d),
        h('button', {
          type: 'button', class: 'btn btn-quiet btn-small btn-round vw-conn-x', 'aria-label': `Take off ${d.title}`, title: `Take off ${d.title}`,
          onclick: () => removeFromDrawer(state.block, d.id, d.title),
        }, icon('close')))))
      : null;

  fill(state.side,
    editable(block, 'title', { placeholder: 'Untitled', className: 'field-bare vw-title' }),
    editable(block, 'description', { placeholder: 'Add a note', className: 'field-bare vw-desc' }),
    actions,
    metaRows(block),
    history(block),
    h('section', { class: 'vw-conn-head' },
      h('span', { class: 'vw-conn-label' }, where),
      connectBtn),
    list,
    ...elsewhere(block),
    comments(block),
    h('div', { class: 'vw-danger' },
      drawer && connections?.some((d) => d.id === drawer.id)
        ? h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => removeFromDrawer(state.block, drawer.id, drawer.title) }, `Take off ${drawer.title}`)
        : null,
      h('button', {
        type: 'button', class: 'btn btn-quiet btn-small',
        onclick: async () => { if (await deleteBlock(state.block)) hooks.close(); },
      }, 'Delete')));
}

function applyUpdate(block, { keepSide = false } = {}) {
  if (!state || state.block.id !== block.id) return;
  state.block = { ...state.block, ...block };
  state.list = state.list.map((b) => (b.id === block.id ? state.block : b));
  bus.emit('block:changed', state.block);
  if (block.kind === 'text') renderStage();
  if (!keepSide) renderSide();
}

bus.on('block:changed', (block) => {
  if (state?.block.id !== block.id) return;
  const newPicture = (block.thumb !== undefined && block.thumb !== state.block.thumb) || (block.file !== undefined && block.file !== state.block.file);
  if (state.block.sharedAt === block.sharedAt && !newPicture) return;
  state.block = { ...state.block, ...block };
  state.list = state.list.map((b) => (b.id === block.id ? state.block : b));
  if (newPicture) renderStage();
  renderSide();
});
bus.on('block:connected', ({ block, connections }) => {
  if (state?.block.id !== block.id) return;
  state.connections = connections;
  state.block = { ...state.block, ...block };
  renderSide();
});
bus.on('block:disconnected', ({ block, connections }) => {
  if (state?.block.id !== block.id) return;
  state.connections = connections;
  state.block = { ...state.block, ...block };
  renderSide();
});
