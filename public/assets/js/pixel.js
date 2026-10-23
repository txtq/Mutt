// Pixel critters: each drawer gets a tiny 9×9 creature. They're generated,
// editable, and blink now and then.

import { h, reducedMotion } from './util.js';

export const SIZE = 9;
export const PALETTE = ['#FF5C39', '#2F6BFF', '#14B86A', '#FFB020', '#A66BFF', '#FF6FB0', '#00B2C6', '#9A6240'];
const SVG_NS = 'http://www.w3.org/2000/svg';

// 0 empty · 1 body · 2 eye · 3 blush
export function generateIcon(random = Math.random) {
  const R = random;
  const px = new Array(SIZE * SIZE).fill(0);
  const put = (r, c, v) => {
    if (r < 0 || r >= SIZE || c < 0 || c > 4) return;
    px[r * SIZE + c] = v;
    px[r * SIZE + (SIZE - 1 - c)] = v;
  };
  const get = (r, c) => px[r * SIZE + c];

  const roll = R();
  const half = roll < 0.4 ? 2 : roll < 0.8 ? 3 : 4; // body spans columns (4 - half)..(4 + half)
  const left = 4 - half;
  const top = 2 + Math.floor(R() * 2);
  const bottom = Math.min(7, top + 3 + Math.floor(R() * 3));

  for (let r = top; r <= bottom; r++) for (let c = left; c <= 4; c++) put(r, c, 1);

  const shape = R();
  if (shape < 0.4) { put(top, left, 0); put(bottom, left, 0); } // rounded
  else if (shape < 0.6 && half > 2) { put(top, left, 0); put(top, left + 1, 0); } // pear

  const ears = R();
  if (ears < 0.28 && left > 0) { for (let r = top; r <= top + 2; r++) put(r, left - 1, 1); } // floppy, like a mutt
  else if (ears < 0.52) put(top - 1, left + (get(top, left) ? 0 : 1), 1); // pointy
  else if (ears < 0.68) { put(top - 1, 3, 1); put(top - 2, 3, 1); } // antennae
  else if (ears < 0.82) { put(top - 1, left + 1, 1); put(top - 1, left + 2, 1); } // round ears

  if (R() < 0.8 && bottom < SIZE - 1) {
    put(bottom + 1, left + 1, 1);
    if (half >= 3 && R() < 0.5) put(bottom + 1, 3, 1);
  }
  if (R() < 0.3 && left > 0 && ears >= 0.28) put(top + 2, left - 1, 1);

  const eyeRow = top + 1 + (R() < 0.45 ? 1 : 0);
  const eyeCol = Math.max(left + 1, half >= 4 && R() < 0.5 ? 2 : 3);
  put(eyeRow, eyeCol, 2);
  const tall = R() < 0.22 && eyeRow + 1 < bottom;
  if (tall) put(eyeRow + 1, eyeCol, 2);
  if (R() < 0.6) {
    const br = eyeRow + (tall ? 2 : 1);
    const bc = eyeCol - 1;
    if (br <= bottom && bc >= left && get(br, bc) === 1) put(br, bc, 3);
  }
  const mouthRow = eyeRow + (tall ? 3 : 2);
  if (R() < 0.3 && mouthRow <= bottom) put(mouthRow, 4, 2);

  return { px: px.join(''), c: PALETTE[Math.floor(R() * PALETTE.length)] };
}

function mix(hex, other, t) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(other.slice(1), 16);
  const ch = (shift) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

export function iconColors(color) {
  return {
    1: color,
    2: luminance(color) < 0.32 ? '#FFFFFF' : '#151515',
    3: mix(color, '#FFFFFF', 0.55),
  };
}

// Renders a crisp SVG. `assemble` makes the pixels arrive one by one.
export function renderIcon(icon, { size = 36, assemble = false, className = '' } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('pix');
  if (className) svg.classList.add(...className.split(' '));
  fillIcon(svg, icon, assemble);
  return svg;
}

export function fillIcon(svg, icon, assemble = false) {
  svg.replaceChildren();
  const colors = iconColors(icon.c);
  const doAssemble = assemble && !reducedMotion();
  const cells = [...icon.px];
  cells.forEach((value, i) => {
    if (value === '0') return;
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', i % SIZE);
    rect.setAttribute('y', Math.floor(i / SIZE));
    rect.setAttribute('width', 1.02);
    rect.setAttribute('height', 1.02);
    rect.setAttribute('fill', colors[value]);
    if (doAssemble) {
      rect.classList.add('px-in');
      rect.style.animationDelay = `${Math.round(Math.random() * 380)}ms`;
    }
    if (value === '2') {
      const eye = document.createElementNS(SVG_NS, 'g');
      eye.classList.add('px-eye');
      eye.append(rect);
      svg.append(eye);
    } else svg.append(rect);
  });
  if (doAssemble) svg.classList.add('is-assembling');
}

export function blink(svg) {
  if (!svg || reducedMotion() || svg.classList.contains('is-blinking')) return;
  svg.classList.add('is-blinking');
  setTimeout(() => svg.classList.remove('is-blinking'), 320);
}

// Now and then, someone on screen blinks.
let idleTimer = null;
export function startIdleBlinks() {
  if (idleTimer) return;
  idleTimer = setInterval(() => {
    if (document.hidden || reducedMotion()) return;
    const visible = [...document.querySelectorAll('svg.pix')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.bottom > 0 && r.top < innerHeight;
    });
    if (!visible.length || Math.random() < 0.35) return;
    blink(visible[Math.floor(Math.random() * visible.length)]);
  }, 2600);
}

// ---------------------------------------------------------------- editor

export function iconEditor(initial, { onSave, onCancel } = {}) {
  let px = [...initial.px];
  let color = initial.c;
  let tool = '1';
  let mirror = true;
  let painting = null;

  const preview = renderIcon({ px: px.join(''), c: color }, { size: 54 });
  const previewSmall = renderIcon({ px: px.join(''), c: color }, { size: 27 });
  const board = h('div', { class: 'pe-board', role: 'grid', 'aria-label': 'Pixel editor' });
  const cells = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = h('button', { type: 'button', class: 'pe-cell', tabindex: '-1', 'aria-label': `Pixel ${i + 1}` });
    cell.dataset.i = i;
    cells.push(cell);
    board.append(cell);
  }

  function paint() {
    const colors = iconColors(color);
    cells.forEach((cell, i) => {
      const v = px[i];
      cell.style.background = v === '0' ? '' : colors[v];
      cell.classList.toggle('is-on', v !== '0');
    });
    fillIcon(preview, { px: px.join(''), c: color });
    fillIcon(previewSmall, { px: px.join(''), c: color });
    swatches.querySelectorAll('.pe-swatch').forEach((s) => s.setAttribute('aria-pressed', s.dataset.c === color));
    tools.querySelectorAll('.pe-tool').forEach((t) => t.setAttribute('aria-pressed', t.dataset.v === tool));
    mirrorBtn.setAttribute('aria-pressed', mirror);
  }

  function setPixel(i, value) {
    px[i] = value;
    if (mirror) {
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      px[r * SIZE + (SIZE - 1 - c)] = value;
    }
  }

  board.addEventListener('pointerdown', (e) => {
    const cell = e.target.closest('.pe-cell');
    if (!cell) return;
    e.preventDefault();
    const i = Number(cell.dataset.i);
    painting = px[i] === tool ? '0' : tool;
    setPixel(i, painting);
    paint();
    board.setPointerCapture(e.pointerId);
  });
  board.addEventListener('pointermove', (e) => {
    if (painting == null) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest?.('.pe-cell');
    if (!cell || !board.contains(cell)) return;
    const i = Number(cell.dataset.i);
    if (px[i] !== painting) { setPixel(i, painting); paint(); }
  });
  const stop = () => { painting = null; };
  board.addEventListener('pointerup', stop);
  board.addEventListener('pointercancel', stop);

  const tools = h('div', { class: 'pe-tools' },
    [['1', 'Body'], ['2', 'Eyes'], ['3', 'Blush'], ['0', 'Erase']].map(([v, label]) =>
      h('button', { type: 'button', class: 'pe-tool', dataset: { v }, onclick: () => { tool = v; paint(); } }, label)));
  const mirrorBtn = h('button', { type: 'button', class: 'pe-tool', onclick: () => { mirror = !mirror; paint(); } }, 'Mirror');
  tools.append(mirrorBtn);

  const custom = h('input', {
    type: 'color', class: 'pe-custom', value: color, title: 'Any color',
    oninput: (e) => { color = e.target.value.toUpperCase(); paint(); },
  });
  const swatches = h('div', { class: 'pe-swatches' },
    PALETTE.map((c) => h('button', {
      type: 'button', class: 'pe-swatch', dataset: { c }, style: { '--c': c }, 'aria-label': c,
      onclick: () => { color = c; custom.value = c; paint(); },
    })),
    custom);

  const el = h('div', { class: 'pe' },
    h('div', { class: 'pe-main' },
      board,
      h('div', { class: 'pe-side' },
        h('div', { class: 'pe-previews' }, preview, previewSmall),
        h('div', { class: 'pe-label' }, 'Paint with'),
        tools,
        h('div', { class: 'pe-label' }, 'Color'),
        swatches)),
    h('div', { class: 'pe-foot' },
      h('div', { class: 'pe-foot-left' },
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => {
          const next = generateIcon();
          px = [...next.px];
          color = next.c;
          custom.value = color;
          paint();
          board.animate([{ opacity: 0.4, filter: 'blur(2px)' }, { opacity: 1, filter: 'none' }], { duration: 380, easing: 'ease-out' });
        } }, 'Shuffle'),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { px = new Array(SIZE * SIZE).fill('0'); paint(); } }, 'Clear')),
      h('div', { class: 'pe-foot-right' },
        h('button', { type: 'button', class: 'btn', onclick: () => onCancel?.() }, 'Cancel'),
        h('button', { type: 'button', class: 'btn btn-dark', onclick: () => onSave?.({ px: px.join(''), c: color }) }, 'Save'))));

  paint();
  return el;
}
