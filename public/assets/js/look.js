// Colour and "vibe" of each file, and the ways to sort Everything by them.
//
// A file's look (average colour, main hue, how vivid, how light) is measured
// in the browser from its preview, saved with the file, and reused.

import { api } from './api.js';
import { KINDS, KIND_LABEL, displayTitle, imageSrc } from './kinds.js';

const SIZE = 36;

// Named colours a picture can be found by, with the swatch shown in search.
export const COLORS = [
  { name: 'red', label: 'Red', hex: '#D9403A' },
  { name: 'orange', label: 'Orange', hex: '#EE8A2E' },
  { name: 'yellow', label: 'Yellow', hex: '#F2CF3D' },
  { name: 'green', label: 'Green', hex: '#4FA35A' },
  { name: 'teal', label: 'Teal', hex: '#2FA6A0' },
  { name: 'blue', label: 'Blue', hex: '#3B6FD8' },
  { name: 'purple', label: 'Purple', hex: '#8A55C9' },
  { name: 'pink', label: 'Pink', hex: '#E77AB0' },
  { name: 'brown', label: 'Brown', hex: '#8A5A36' },
  { name: 'black', label: 'Black', hex: '#141414' },
  { name: 'white', label: 'White', hex: '#F4F4F0' },
  { name: 'grey', label: 'Grey', hex: '#8C8C8C' },
];

// Traits read from the pixels (no idea what's in the picture, only how it looks).
export const TRAITS = [
  { tag: 'bright', label: 'Bright' },
  { tag: 'dark', label: 'Dark' },
  { tag: 'warm', label: 'Warm' },
  { tag: 'cool', label: 'Cool' },
  { tag: 'vivid', label: 'Vivid' },
  { tag: 'muted', label: 'Muted' },
  { tag: 'soft', label: 'Pastel' },
  { tag: 'mono', label: 'Black & white' },
  { tag: 'contrast', label: 'High contrast' },
  { tag: 'busy', label: 'Busy' },
  { tag: 'minimal', label: 'Minimal' },
  { tag: 'tall', label: 'Tall' },
  { tag: 'wide', label: 'Wide' },
  { tag: 'square', label: 'Square' },
];

const LOOK_VERSION = 2;

function colorName(hue, chroma, l) {
  if (chroma < 0.1) return l < 0.2 ? 'black' : l > 0.82 ? 'white' : 'grey';
  if (l < 0.1) return 'black';
  if (l > 0.94) return 'white';
  if (hue >= 10 && hue < 45 && l < 0.42) return 'brown';
  if (hue < 12 || hue >= 345) return l > 0.75 ? 'pink' : 'red';
  if (hue < 40) return 'orange';
  if (hue < 68) return 'yellow';
  if (hue < 160) return 'green';
  if (hue < 195) return 'teal';
  if (hue < 255) return 'blue';
  if (hue < 290) return 'purple';
  return 'pink';
}

export function measure(img) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const light = new Float32Array(SIZE * SIZE);
  const counts = {};
  let n = 0; let R = 0; let G = 0; let B = 0; let L = 0; let L2 = 0; let C = 0; let hx = 0; let hy = 0;
  let warm = 0; let cool = 0; let strong = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const l = (max + min) / 2;
    light[i / 4] = l;
    n++; R += r; G += g; B += b; L += l; L2 += l * l; C += chroma;
    let hue = 0;
    if (chroma > 0) {
      hue = max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
      hue = (hue * 60 + 360) % 360;
    }
    if (chroma > 0.06) {
      const a = (hue * Math.PI) / 180;
      hx += Math.cos(a) * chroma;
      hy += Math.sin(a) * chroma;
    }
    if (chroma > 0.15) {
      if (hue < 70 || hue >= 320) warm++; else cool++;
    }
    if (chroma > 0.5) strong++;
    const name = colorName(hue, chroma, l);
    counts[name] = (counts[name] || 0) + 1;
  }
  // How much changes from one sample to the next: busy pictures change a lot.
  let edge = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      if (x + 1 < SIZE) edge += Math.abs(light[i] - light[i + 1]);
      if (y + 1 < SIZE) edge += Math.abs(light[i] - light[i + SIZE]);
    }
  }
  edge /= 2 * SIZE * (SIZE - 1);

  const l = L / n;
  const s = Math.min(1, C / n);
  const c = Math.min(1, Math.sqrt(Math.max(0, L2 / n - l * l)) * 2);
  const h = Math.round(((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360);
  const round = (v) => Math.round(v * 1000) / 1000;
  const hex = `#${[R, G, B].map((v) => Math.round((v / n) * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

  const colors = {};
  Object.entries(counts).map(([name, k]) => [name, k / n]).filter(([, p]) => p >= 0.08)
    .sort((a, b) => b[1] - a[1]).slice(0, 4)
    .forEach(([name, p]) => { colors[name] = round(p); });
  const neutral = ((counts.black || 0) + (counts.white || 0) + (counts.grey || 0)) / n;

  const tags = [];
  if (l > 0.62) tags.push('bright');
  if (l < 0.3) tags.push('dark');
  if (neutral > 0.9) tags.push('mono');
  else {
    // Warm or cool only when most of the colour leans one way.
    const tinted = warm + cool;
    if (tinted > n * 0.15 && warm / tinted >= 0.65) tags.push('warm');
    else if (tinted > n * 0.15 && cool / tinted >= 0.65) tags.push('cool');
    if (s > 0.36 || strong > n * 0.3) tags.push('vivid');
    else if (l > 0.62 && s >= 0.07 && s < 0.3) tags.push('soft');
    else if (s < 0.2) tags.push('muted');
  }
  if (c > 0.5) tags.push('contrast');
  if (edge > 0.085) tags.push('busy');
  else if (edge < 0.035) tags.push('minimal');
  const w = img.naturalWidth || img.width;
  const ht = img.naturalHeight || img.height;
  if (w && ht) tags.push(w / ht > 1.25 ? 'wide' : w / ht < 0.8 ? 'tall' : 'square');

  return { v: LOOK_VERSION, hex, h, s: round(s), l: round(l), c: round(c), colors, tags };
}

const lookSource = (block) => block.thumb || imageSrc(block);

export const needsLook = (block) => block.mine !== false && block.meta?.look?.v !== LOOK_VERSION && !!lookSource(block);

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.decoding = 'async';
    img.src = src;
  });
}

const inFlight = new Map();

// Measure (and save) any files that don't have a look yet.
export async function ensureLooks(blocks, onEach) {
  const queue = blocks.filter(needsLook);
  const worker = async () => {
    while (queue.length) {
      const block = queue.shift();
      if (!inFlight.has(block.id)) {
        inFlight.set(block.id, loadImage(lookSource(block)).then(measure));
      }
      try {
        const look = await inFlight.get(block.id);
        block.meta = { ...block.meta, look };
        api.patch(`/api/blocks/${block.id}`, { look }).catch(() => {});
        onEach?.(block);
      } catch { /* unreadable preview: it just sorts with the others */ }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

// ---------------------------------------------------------------- vibes

export const VIBES = ['vivid', 'warm', 'cool', 'soft', 'paper', 'mono', 'dark', 'words', 'sound', 'files'];

export function vibeOf(block) {
  const look = block.meta?.look;
  if (!look) {
    if (block.kind === 'text' || block.kind === 'link') return 'words';
    if (block.kind === 'audio') return 'sound';
    return 'files';
  }
  const { h, s, l } = look;
  if (l < 0.25) return 'dark';
  if (s < 0.07) return l > 0.78 ? 'paper' : 'mono';
  if (l > 0.7 && s < 0.22) return 'soft';
  if (s > 0.42) return 'vivid';
  return h < 70 || h >= 320 ? 'warm' : 'cool';
}

// ---------------------------------------------------------------- sorting

const newest = (a, b) => b.createdAt - a.createdAt;
const hueKey = (look) => (look.h + 20) % 360;

function byColor(a, b) {
  const la = a.meta?.look;
  const lb = b.meta?.look;
  if (!la || !lb) return (la ? -1 : lb ? 1 : 0) || newest(a, b);
  const greyA = la.s < 0.07;
  const greyB = lb.s < 0.07;
  if (greyA !== greyB) return greyA ? 1 : -1;
  if (greyA) return lb.l - la.l;
  return hueKey(la) - hueKey(lb) || lb.l - la.l;
}

function formatGroup(block) {
  if (block.kind === 'text' || block.kind === 'link') return KIND_LABEL[block.kind];
  return (block.ext || KIND_LABEL[block.kind]).toUpperCase();
}

const sizeOf = (b) => b.size ?? (b.content ? b.content.length : 0);

export const SORTS = [
  { value: 'new', label: 'New' },
  { value: 'old', label: 'Old' },
  { value: 'color', label: 'Color', looks: true },
  { value: 'vibes', label: 'Vibes', looks: true },
  { value: 'format', label: 'Format' },
  { value: 'az', label: 'A–Z' },
  { value: 'size', label: 'Size' },
];

const divider = (label) => ({ divider: true, id: `div-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, label });

// Returns files (and, for grouped sorts, little section labels) in order.
export function arrange(blocks, mode) {
  const list = [...blocks];
  switch (mode) {
    case 'old': return list.sort((a, b) => a.createdAt - b.createdAt);
    case 'color': return list.sort(byColor);
    case 'az': return list.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b), undefined, { sensitivity: 'base' }) || newest(a, b));
    case 'size': return list.sort((a, b) => sizeOf(b) - sizeOf(a) || newest(a, b));
    case 'vibes': {
      const groups = new Map(VIBES.map((v) => [v, []]));
      for (const b of list) groups.get(vibeOf(b)).push(b);
      return [...groups].filter(([, items]) => items.length)
        .flatMap(([vibe, items]) => [divider(vibe), ...items.sort(byColor)]);
    }
    case 'format': {
      const kindIndex = (b) => KINDS.indexOf(b.kind);
      list.sort((a, b) => kindIndex(a) - kindIndex(b) || formatGroup(a).localeCompare(formatGroup(b)) || newest(a, b));
      const out = [];
      let last = null;
      for (const b of list) {
        const label = formatGroup(b);
        if (label !== last) { out.push(divider(label)); last = label; }
        out.push(b);
      }
      return out;
    }
    default: return list.sort(newest);
  }
}
