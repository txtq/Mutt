// Colour and "vibe" of each file, and the ways to sort Everything by them.
//
// A file's look (average colour, main hue, how vivid, how light) is measured
// in the browser from its preview, saved with the file, and reused.

import { api } from './api.js';
import { KINDS, KIND_LABEL, displayTitle, imageSrc } from './kinds.js';

const SIZE = 36;

export function measure(img) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  let n = 0; let R = 0; let G = 0; let B = 0; let L = 0; let L2 = 0; let C = 0; let hx = 0; let hy = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const l = (max + min) / 2;
    n++; R += r; G += g; B += b; L += l; L2 += l * l; C += chroma;
    if (chroma > 0.06) {
      let hue = max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
      hue *= Math.PI / 3;
      hx += Math.cos(hue) * chroma;
      hy += Math.sin(hue) * chroma;
    }
  }
  const l = L / n;
  const hex = `#${[R, G, B].map((v) => Math.round((v / n) * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  const round = (v) => Math.round(v * 1000) / 1000;
  return {
    hex,
    h: Math.round(((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360),
    s: round(Math.min(1, C / n)),
    l: round(l),
    c: round(Math.min(1, Math.sqrt(Math.max(0, L2 / n - l * l)) * 2)),
  };
}

const lookSource = (block) => block.thumb || imageSrc(block);

export const needsLook = (block) => block.mine !== false && !block.meta?.look && !!lookSource(block);

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
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
