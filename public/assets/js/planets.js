// Planets: every drawer is a small world that turns slowly, one of twelve
// kinds, each with its own ground, weather and effects (planetgl.js paints
// them). Its files ride on it as cards in a belt, each drawn as what it is,
// so a planet's use reads from the galaxy. How used it is shows too: weather
// on a busy world, dust on a forgotten one. DESIGN.md "Planets" has the rules.

import { nav } from './nav.js';
import { AIR, canPaint, forget, paint, together } from './planetgl.js';
import { BLUE, DUR, h, named, onMotionChange, plural, reducedMotion, seeded } from './util.js';
import { icon } from './icons.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function shade(hex, other, t) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(other.slice(1), 16);
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

// Bigger worlds for fuller drawers, within reason.
export function planetSize(count, scale = 1) {
  return Math.round(Math.min(280, 112 + Math.sqrt(count || 0) * 13) * scale);
}

// How a planet is shared: its words and its icon (js/icons.js). A planet anyone can add to shows a plus.
export const VISIBILITY = {
  private: { label: 'Private', icon: 'lock', hint: 'Only you can see inside.' },
  pin: { label: 'Code', icon: 'key', hint: 'Anyone you give this planet’s code to can look inside.' },
  people: { label: 'People', icon: 'people', hint: 'Only the people you pick.' },
  public: { label: 'Public', icon: 'globe', hint: 'Everyone on Mutt can look inside.' },
};

const excerpt = (text, n) => {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const kindWord = (block) => (block.kind === 'link'
  ? (block.meta?.domain || block.title || '?').replace(/^www\./, '').charAt(0).toUpperCase()
  : (block.ext || block.kind || '').slice(0, 4).toUpperCase());

// Text as a tiny page: its first line as a heading, then the words after it.
// A text file (notes, code) gets the same page in a typewriter face, with its
// kind in the corner.
function pageFace(block) {
  const note = block.kind === 'text';
  const raw = (note ? (block.content || block.title) : block.meta.excerpt) || '';
  const lines = raw.split(/\n/).map((l) => l.replace(/^[#>*\-\s]+/, '').trim()).filter(Boolean);
  let head;
  if (!note) head = block.title || block.fileName || '';
  else if (block.title && block.title !== block.content) head = block.title;
  else head = lines.shift() || '';
  const rest = lines.filter((l) => l !== head).join(' ');
  // A note that's one longer line reads as a whole, not a cut-off heading.
  const solo = note && !rest && head.length > 24;
  return h('span', { class: `ff ff-text${note ? '' : ' is-file'}${solo ? ' is-solo' : ''}`, dataset: { kind: block.kind } },
    h('span', { class: 'ff-head' }, excerpt(head, solo ? 90 : 60)),
    rest ? h('span', { class: 'ff-body' }, excerpt(rest, 160)) : null,
    note ? null : h('span', { class: 'ff-ext' }, kindWord(block)));
}

// A file as a small face: its picture, a scrap of its text, or what kind it is.
export function fileFace(block, { lazy = false } = {}) {
  if (block.thumb) {
    const img = h('img', lazy ? { alt: '', 'data-src': block.thumb, draggable: false } : { src: block.thumb, alt: '', decoding: 'async', draggable: false });
    const face = h('span', { class: 'ff ff-img' }, img);
    // No picture after all: show what kind of file it is instead.
    img.addEventListener('error', () => face.replaceWith(fileFace({ ...block, thumb: null })), { once: true });
    return face;
  }
  if (block.kind === 'text' || block.meta?.excerpt) return pageFace(block);
  return h('span', { class: 'ff ff-kind', dataset: { kind: block.kind } }, h('span', null, kindWord(block)));
}

// ---------------------------------------------------------------- kinds of world

// Every planet is one kind of world. One that hasn't been given a kind gets
// it from its id, so it never changes by itself.
// Their order is the painter's (planetgl.js, looks 0 to 11): add at the end.
export const LOOKS = [
  { id: 'ocean', label: 'Deep ocean' },
  { id: 'terran', label: 'Forests and seas' },
  { id: 'gas', label: 'Banded giant' },
  { id: 'pale', label: 'Pale giant' },
  { id: 'lava', label: 'Lava seas' },
  { id: 'ice', label: 'Ice sheets' },
  { id: 'desert', label: 'Red desert' },
  { id: 'storm', label: 'Thunderstorm' },
  { id: 'lagoon', label: 'Coral shallows' },
  { id: 'bloom', label: 'Night bloom' },
  { id: 'haze', label: 'Golden haze' },
  { id: 'pearl', label: 'Pearl mist' },
];
// A planet with no kind of its own gets one from its id. Those made before
// there were twelve (the server says which: `twelve`) keep drawing from the
// first eight, so none of them changed by itself (Moon rock, which is gone,
// became Pearl mist).
const FIRST_KINDS = ['ocean', 'terran', 'gas', 'lava', 'ice', 'desert', 'pearl', 'storm'];
const ALL_KINDS = LOOKS.map((l) => l.id);

// Moons are modelled on real ones. Each has its own colours, how long it
// takes to go round (seconds), how fast it turns on its own axis (Luna not
// at all: it always shows its planet the same face), and how far out it sits.
export const MOON_LOOKS = [
  { id: 'luna', label: 'Luna', note: 'Earth', period: 26, rate: 0, reach: 0 },
  { id: 'io', label: 'Io', note: 'Jupiter', period: 18, rate: 1, reach: 0 },
  { id: 'europa', label: 'Europa', note: 'Jupiter', period: 22, rate: 1, reach: 0.04 },
  { id: 'titan', label: 'Titan', note: 'Saturn', period: 34, rate: 0.6, reach: 0.06 },
  { id: 'enceladus', label: 'Enceladus', note: 'Saturn', period: 16, rate: 1, reach: -0.02 },
  { id: 'triton', label: 'Triton', note: 'Neptune, backwards', period: 24, rate: 1, reach: 0.02, backwards: true },
  { id: 'phobos', label: 'Phobos', note: 'Mars', period: 9, rate: 1.4, reach: -0.1 },
  { id: 'hyperion', label: 'Hyperion', note: 'Saturn, tumbling', period: 30, rate: 2.2, reach: 0.04 },
  { id: 'iapetus', label: 'Iapetus', note: 'Saturn', period: 46, rate: 0.7, reach: 0.14 },
  { id: 'callisto', label: 'Callisto', note: 'Jupiter', period: 40, rate: 0.5, reach: 0.1 },
];
const MOON_BY_ID = Object.fromEntries(MOON_LOOKS.map((m) => [m.id, m]));
const LOOK_INDEX = Object.fromEntries([...LOOKS, ...MOON_LOOKS].map((l, i) => [l.id, i]));

// Four colours each (what they're for depends on the kind), and how far each
// one leans toward the planet's own colour.
// `rich` is how far its colours are pushed (1.4 unless the kind is pale or
// already vivid).
const PALETTES = {
  ocean: { colors: ['#0f2c4a', '#2a6f97', '#b5a878', '#f3f1eb'], tint: [0.25, 0.25, 0.1, 0] },
  terran: { colors: ['#1b4264', '#4f7f3f', '#9a8058', '#f0f2f3'], tint: [0.2, 0.12, 0.1, 0] },
  gas: { colors: ['#8a5536', '#cf9b68', '#f1dfc0', '#b9502f'], tint: [0.4, 0.35, 0.15, 0.2] },
  pale: { colors: ['#c2a56a', '#e3cf9c', '#f4e9cc', '#9c8150'], tint: [0.25, 0.22, 0.1, 0.2], rich: 1.15 },
  lava: { colors: ['#15100e', '#2c2320', '#4a3a33', '#ee7a2c'], tint: [0.08, 0.12, 0.12, 0.06], rich: 1.1 },
  ice: { colors: ['#4b84b3', '#bdd5e4', '#eff5f8', '#f4f8fb'], tint: [0.2, 0.16, 0.06, 0.04] },
  desert: { colors: ['#3d2420', '#9c5741', '#cfa277', '#e8c9a0'], tint: [0.1, 0.12, 0.1, 0.08], rich: 1.12 },
  storm: { colors: ['#151033', '#3b2f7a', '#8f7fd0', '#e6e2ff'], tint: [0.16, 0.18, 0.12, 0] },
  lagoon: { colors: ['#0b6f86', '#27b7b4', '#f0e2b8', '#f08a7a'], tint: [0.2, 0.2, 0.05, 0.1], rich: 1.18 },
  bloom: { colors: ['#0c2f3a', '#b23a8e', '#6a3fb0', '#ffb3de'], tint: [0.2, 0.2, 0.2, 0.05], rich: 1.18 },
  haze: { colors: ['#b98a2e', '#e2c463', '#f3e6a8', '#f6dc8a'], tint: [0.2, 0.2, 0.1, 0.15] },
  pearl: { colors: ['#e9c9cf', '#f6ead9', '#fbf6ee', '#ffe3ee'], tint: [0.14, 0.1, 0.05, 0.08], rich: 1.15 },
};
// Moons keep their real colours, whatever their planet's.
const MOON_PALETTES = {
  luna: ['#46464b', '#8d8a86', '#b9b5ae', '#efebe4'],
  io: ['#2a1d12', '#e3c957', '#d38834', '#f2ecc0'],
  europa: ['#8a4a2e', '#e9dcc4', '#cdbca1', '#ffffff'],
  titan: ['#a5642a', '#d69d4c', '#e8c27a', '#7fa9d8'],
  enceladus: ['#7fa4c4', '#f4f6f8', '#dde6ee', '#e8f2ff'],
  triton: ['#5e4a4a', '#d8b4a6', '#bfa294', '#f1d7d0'],
  phobos: ['#3a3532', '#6b625b', '#958a80', '#c8beb2'],
  hyperion: ['#2e2620', '#b29e84', '#8d7b66', '#e2d6c2'],
  iapetus: ['#1d1814', '#8e8579', '#e6e1d8', '#c9c2b6'],
  callisto: ['#2f2a25', '#5a4d40', '#8c7e6c', '#d9d2c4'],
};

// A moon (a drawer with a planet, or one of a planet's `moons`) is one of
// the real moons: its own pick, or one from its id.
export function moonLookOf(moon) {
  if (moon.look && MOON_PALETTES[moon.look]) return moon.look;
  return MOON_LOOKS[Math.floor(seeded(`moon:${moon.id}`)() * MOON_LOOKS.length)].id;
}

export function lookOf(planet) {
  if (planet.parentId) return moonLookOf(planet);
  if (planet.look && PALETTES[planet.look]) return planet.look;
  const pool = planet.twelve ? ALL_KINDS : FIRST_KINDS;
  return pool[Math.floor(seeded(`look:${planet.id}`)() * pool.length)];
}

// More colourful: pushes a colour's saturation up and lifts it a touch.
// Greys and whites barely move, so ice caps and clouds stay clean.
function richer(hex, amount = 1.4) {
  const [hue, s, l] = toHsl(hex);
  if (!s) return hex;
  return fromHsl(hue, Math.min(1, s * amount), Math.min(0.92, l + (1 - l) * 0.06));
}

// [hue 0–360, saturation, lightness]; greys have no saturation.
function toHsl(hex) {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hue * 60 + 360) % 360, s, l];
}

function fromHsl(hue, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const [r1, g1, b1] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  const to = (v) => Math.round((v + m) * 255);
  return `#${((1 << 24) | (to(r1) << 16) | (to(g1) << 8) | to(b1)).toString(16).slice(1)}`;
}

// How bright a colour looks (0 black, 1 white).
function luminance(hex) {
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = rgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// The colours a planet's page leans toward: `tone`, the world as it reads
// from afar (its kind's main colour, not just the planet's own), and
// `accent`, a livelier one for buttons, dark enough for white type (no
// brighter than the galaxy's blue). Grey worlds keep a hint of that blue.
export function planetTone(planet) {
  const { base } = worldColors(planet);
  const [hue, s, l] = toHsl(base);
  const tone = fromHsl(hue, Math.min(s, 0.6), Math.max(0.36, Math.min(0.62, l)));
  if (s < 0.12) return { tone, accent: shade(BLUE, tone, 0.45) };
  let accent;
  for (let al = 0.54; al > 0.3; al -= 0.02) {
    accent = fromHsl(hue, Math.max(0.5, Math.min(0.78, s * 1.15)), al);
    if (luminance(accent) <= 0.22) break;
  }
  return { tone, accent };
}

// A world's colours: its kind's palette, leaning toward the planet's colour
// (which is bright; worlds are a little dustier), then made more colourful.
function worldColors(planet, look = lookOf(planet)) {
  if (MOON_PALETTES[look]) {
    const colors = MOON_PALETTES[look];
    const base = look === 'iapetus' ? shade(colors[0], colors[2], 0.5) : colors[1];
    return { colors, base, light: shade(base, '#f4f1ea', 0.38), dark: shade(base, '#070a16', 0.5) };
  }
  const tint = shade(planet.icon?.c || planet.c || '#2F6BFF', '#6f7891', 0.15);
  const pal = PALETTES[look];
  // Lava stays dark and hot rather than taking on the planet's colour.
  const colors = pal.colors.map((c, i) => richer(shade(c, tint, pal.tint[i]), pal.rich || 1.4));
  const base = look === 'lava' ? shade(colors[1], colors[3], 0.4) : colors[1];
  return { colors, base, light: shade(base, '#f4f1ea', 0.38), dark: shade(base, '#070a16', 0.5) };
}

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// ---------------------------------------------------------------- surfaces

// Files are laid out on a 512×256 map, drawn at twice that for sharpness.
const MAP_W = 512;
const MAP_H = 256;
const TEX_W = 1024;
const TEX_H = 512;

// The newest few hundred pictures are kept for painting planets; older ones
// are let go, or a long visit would hold every picture it ever passed (the
// browser keeps the files, so asking again later is quick).
const imageCache = new Map();
const MAX_IMAGES = 400;
function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    }));
    if (imageCache.size > MAX_IMAGES) imageCache.delete(imageCache.keys().next().value);
  }
  return imageCache.get(src);
}

// For the plain painter (no WebGL): soft bands that wander, a few storms, ice at the poles.
function paintTerrain(ctx, colors, rand) {
  const kind = rand() < 0.45 ? 'gas' : rand() < 0.6 ? 'rock' : 'ice';
  const g = ctx.createLinearGradient(0, 0, 0, MAP_H);
  const pole = kind === 'ice' ? shade(colors.light, '#ffffff', 0.4) : colors.light;
  g.addColorStop(0, pole);
  g.addColorStop(0.14, colors.base);
  g.addColorStop(0.5, kind === 'ice' ? shade(colors.base, '#ffffff', 0.18) : colors.base);
  g.addColorStop(0.86, colors.base);
  g.addColorStop(1, pole);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  const bands = kind === 'gas' ? 22 : 9;
  for (let i = 0; i < bands; i++) {
    const y = rand() * MAP_H;
    const thick = 3 + rand() * (kind === 'gas' ? 18 : 10);
    const amp = 1 + rand() * 5;
    const freq = (1 + Math.floor(rand() * 4)) * ((Math.PI * 2) / MAP_W);
    const phase = rand() * Math.PI * 2;
    ctx.globalAlpha = 0.05 + rand() * (kind === 'gas' ? 0.16 : 0.08);
    ctx.fillStyle = rand() < 0.5 ? colors.dark : colors.light;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= MAP_W; x += 8) ctx.lineTo(x, y + Math.sin(x * freq + phase) * amp);
    for (let x = MAP_W; x >= 0; x -= 8) ctx.lineTo(x, y + thick + Math.sin(x * freq + phase + 0.7) * amp);
    ctx.closePath();
    ctx.fill();
  }
  const spots = kind === 'rock' ? 26 : 5;
  for (let i = 0; i < spots; i++) {
    const x = rand() * MAP_W;
    const y = MAP_H * (0.15 + rand() * 0.7);
    const r = kind === 'rock' ? 2 + rand() * 9 : 4 + rand() * 10;
    const sg = ctx.createRadialGradient(x, y, 0, x, y, r);
    sg.addColorStop(0, kind === 'rock' ? colors.dark : colors.light);
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = kind === 'rock' ? 0.35 : 0.22;
    ctx.fillStyle = sg;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(kind === 'rock' ? 1 : 2.4, 1);
    ctx.translate(-x, -y);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---- the small drawings: what a file looks like as a card on a world.
// Each kind of file has its own, so a planet's use reads from the galaxy: a
// list is rows with tick boxes, a recipe an index card, a book a cover, a
// document a cream page, a picture a print. DESIGN.md "Files on a world" says
// how to add one. They are drawn in map pixels (the card is at most about 64
// by 48), so words are bars: nothing here is meant to be read, only told apart.
const INK = { paper: named('--paper'), ink: named('--paper-ink'), ink2: named('--paper-ink-2'), ink3: named('--paper-ink-3'), rule: named('--paper-rule'), well: named('--paper-well'), tick: BLUE, red: named('--ribbon-red'), night: named('--room-night'), pale: named('--pale') };
const PRINT = INK.paper;                                // the pale border of a photographic print, and marks on a dark card
const SHADOW = 'rgba(0, 0, 12, 0.55)';                  // under every card
const KIND_TINT = { video: named('--mark-pink'), code: named('--mark-purple'), other: named('--ink-4') };

function card(ctx, x, y, w, hgt, fill, r = 3) {
  ctx.save();
  ctx.shadowColor = SHADOW;
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, hgt, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}
function bar(ctx, x, y, w, t, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(1, w), t, t / 2);
  ctx.fill();
}
function fit(ctx, img, x, y, w, hgt) {
  const k = Math.max(w / img.width, hgt / img.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, hgt);
  ctx.clip();
  ctx.drawImage(img, x + (w - img.width * k) / 2, y + (hgt - img.height * k) / 2, img.width * k, img.height * k);
  ctx.restore();
}
function tickBox(ctx, x, y, s, done) {
  ctx.beginPath();
  if (done) {
    ctx.roundRect(x, y, s, s, s * 0.22);
    ctx.fillStyle = INK.tick;
    ctx.fill();
    ctx.strokeStyle = PRINT;
    ctx.lineWidth = Math.max(0.9, s * 0.16);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + s * 0.24, y + s * 0.52);
    ctx.lineTo(x + s * 0.43, y + s * 0.72);
    ctx.lineTo(x + s * 0.78, y + s * 0.3);
    ctx.stroke();
  } else {
    ctx.roundRect(x + 0.5, y + 0.5, s - 1, s - 1, s * 0.22);
    ctx.strokeStyle = INK.ink3;
    ctx.lineWidth = Math.max(0.8, s * 0.12);
    ctx.stroke();
  }
}
const FACES = {
  // a picture: a print with a white border (a video's carries a play mark)
  photo(ctx, f, x, y, w, hgt) {
    card(ctx, x, y, w, hgt, PRINT, 2);
    const b = Math.max(1.6, w * 0.035);
    fit(ctx, f.img, x + b, y + b, w - b * 2, hgt - b * 2);
    if (f.video) {
      ctx.fillStyle = PRINT;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.42, y + hgt * 0.34);
      ctx.lineTo(x + w * 0.64, y + hgt * 0.5);
      ctx.lineTo(x + w * 0.42, y + hgt * 0.66);
      ctx.fill();
    }
  },
  // a note: paper, a heading and a few lines
  note(ctx, f, x, y, w, hgt) {
    card(ctx, x, y, w, hgt, INK.paper);
    const p = w * 0.09;
    bar(ctx, x + p, y + hgt * 0.16, w * 0.55, Math.max(2.2, hgt * 0.075), INK.ink);
    for (let i = 0; i < 4; i++) bar(ctx, x + p, y + hgt * (0.36 + i * 0.14), (w - p * 2) * [1, 0.92, 0.97, 0.6][i], Math.max(1.4, hgt * 0.04), INK.ink3);
  },
  // a list: rows, each a tick box and its words
  list(ctx, f, x, y, w, hgt) {
    card(ctx, x, y, w, hgt, INK.paper);
    const pad = Math.max(3, w * 0.07);
    const rh = (hgt - pad * 2) / f.items.length;
    const s = Math.min(rh * 0.62, 10);
    f.items.forEach((done, i) => {
      const cy = y + pad + rh * (i + 0.5);
      tickBox(ctx, x + pad, cy - s / 2, s, done);
      bar(ctx, x + pad + s + 3, cy - rh * 0.14, (w - pad * 2 - s - 4) * (0.5 + 0.45 * (((i + f.items.length) * 37) % 10) / 10), Math.max(1.6, rh * 0.28), done ? INK.rule : INK.ink2);
      if (i) { ctx.fillStyle = INK.rule; ctx.fillRect(x + pad, y + pad + rh * i - 0.3, w - pad * 2, 0.6); }
    });
  },
  // a recipe: an index card, its name over a red rule, ingredients beside steps (its dish on top when it has one)
  recipe(ctx, f, x, y, w, hgt) {
    card(ctx, x, y, w, hgt, INK.paper);
    const p = w * 0.08;
    let top = y + hgt * 0.12;
    if (f.img) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, hgt, 3);
      ctx.clip();
      fit(ctx, f.img, x, y, w, hgt * 0.46);
      ctx.restore();
      top = y + hgt * 0.54;
    }
    bar(ctx, x + p, top, w * 0.5, Math.max(2.2, hgt * 0.07), INK.ink);
    ctx.fillStyle = INK.red;
    ctx.fillRect(x + p, top + hgt * 0.13, w - p * 2, 0.8);
    const from = top + hgt * 0.2;
    const lh = (y + hgt - from - 3) / 3;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = INK.red;
      ctx.beginPath();
      ctx.arc(x + p + 1.2, from + lh * (i + 0.5), Math.min(1.3, lh * 0.22), 0, Math.PI * 2);
      ctx.fill();
      bar(ctx, x + p + 4, from + lh * (i + 0.5) - lh * 0.16, w * [0.2, 0.26, 0.16][i], Math.max(1.2, lh * 0.32), INK.ink3);
      bar(ctx, x + w * 0.5, from + lh * (i + 0.5) - lh * 0.16, w * [0.42, 0.36, 0.3][i], Math.max(1.2, lh * 0.32), INK.rule);
    }
  },
  // a book: its cover, with a spine down the left
  book(ctx, f, x, y, w, hgt) {
    card(ctx, x, y, w, hgt, f.color, 1.5);
    if (f.img) fit(ctx, f.img, x, y, w, hgt);
    else {
      bar(ctx, x + w * 0.2, y + hgt * 0.16, w * 0.6, Math.max(1.8, hgt * 0.05), PRINT);
      bar(ctx, x + w * 0.2, y + hgt * 0.26, w * 0.4, Math.max(1.8, hgt * 0.05), PRINT);
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(x, y, w * 0.08, hgt);
  },
  // a document: a cream page, a centred title and lines in paragraphs
  page(ctx, f, x, y, w, hgt) {
    card(ctx, x, y, w, hgt, INK.paper, 1.5);
    const p = w * 0.13;
    bar(ctx, x + w * 0.24, y + hgt * 0.12, w * 0.52, Math.max(2, hgt * 0.045), INK.ink);
    const n = Math.max(5, Math.min(11, Math.floor((hgt * 0.66) / 5)));
    const turn = Math.floor(n * 0.45);
    for (let i = 0; i < n; i++) {
      const first = i === 0 || i === turn + 1;
      const last = i === n - 1 || i === turn;
      bar(ctx, x + p + (first ? w * 0.08 : 0), y + hgt * 0.26 + i * ((hgt * 0.66) / n), (w - p * 2) * (last ? 0.55 : 1) - (first ? w * 0.08 : 0), Math.max(1, hgt * 0.018), INK.ink3);
    }
  },
  // a link: a small window with its bar, the site's mark and name
  link(ctx, f, x, y, w, hgt) {
    card(ctx, x, y, w, hgt, INK.pale);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, hgt, 3);
    ctx.clip();
    if (f.img) fit(ctx, f.img, x, y, w, hgt);
    ctx.fillStyle = INK.rule;
    ctx.fillRect(x, y, w, hgt * 0.2);
    ctx.fillStyle = INK.ink3;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + w * 0.08 + i * w * 0.07, y + hgt * 0.1, Math.max(1, hgt * 0.035), 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    if (f.img) return;
    ctx.fillStyle = INK.tick;
    ctx.beginPath();
    ctx.arc(x + w * 0.24, y + hgt * 0.58, hgt * 0.17, 0, Math.PI * 2);
    ctx.fill();
    bar(ctx, x + w * 0.46, y + hgt * 0.46, w * 0.4, Math.max(2, hgt * 0.07), INK.ink2);
    bar(ctx, x + w * 0.46, y + hgt * 0.63, w * 0.28, Math.max(1.5, hgt * 0.05), INK.ink3);
  },
  // a PDF or other paper: a white sheet with a red tag
  sheet(ctx, f, x, y, w, hgt) {
    card(ctx, x, y, w, hgt, PRINT, 1.5);
    if (f.img) fit(ctx, f.img, x, y, w, hgt);
    else for (let i = 0; i < 6; i++) bar(ctx, x + w * 0.14, y + hgt * (0.3 + i * 0.1), w * (i === 5 ? 0.4 : 0.72), Math.max(1, hgt * 0.022), INK.ink3);
    ctx.fillStyle = INK.red;
    ctx.beginPath();
    ctx.roundRect(x + w * 0.14, y + hgt * 0.1, w * 0.42, hgt * 0.12, 1.2);
    ctx.fill();
  },
  // a sound: its shape as bars, on night
  audio(ctx, f, x, y, w, hgt) {
    card(ctx, x, y, w, hgt, INK.night);
    const n = Math.floor(w / 4);
    const rand = seeded(`sound:${f.id}`);
    for (let i = 0; i < n; i++) {
      const a = (0.15 + 0.85 * Math.abs(Math.sin(i * 0.5) * (0.4 + 0.6 * rand()))) * hgt * 0.62;
      ctx.fillStyle = i < n * 0.4 ? INK.pale : INK.ink3;
      ctx.beginPath();
      ctx.roundRect(x + w * 0.08 + i * ((w * 0.84) / n), y + hgt / 2 - a / 2, Math.max(1.2, (w * 0.84) / n - 1.4), a, 0.8);
      ctx.fill();
    }
  },
  // anything else: its kind, in its colour
  other(ctx, f, x, y, w, hgt) {
    card(ctx, x, y, w, hgt, KIND_TINT[f.kind] || KIND_TINT.other);
    ctx.fillStyle = PRINT;
    ctx.font = '700 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(f.word, x + w / 2, y + hgt / 2 + 0.5);
  },
};
// Cards that stand taller than wide.
const UPRIGHT = { book: true, page: true, sheet: true };
const COVERS = [named('--mark-blue'), named('--ribbon-red'), named('--mark-green'), named('--mark-purple'), named('--mark-yellow')];
const isDone = (text) => /^\s*(?:[-*]\s*)?\[[xX✓]\]/.test(text);
const isItem = (text) => /^\s*(?:[-*]\s*)?\[[ xX✓]?\]/.test(text);

// Which drawing a file gets. `planet.modes` decides for notes: on a list every note
// is an item, on a desk every note is a page. A new kind of file or a new mode adds
// its line here and its drawing above.
function faceOf(planet, block, img) {
  const modes = planet.modes || {};
  const id = block.id;
  if (block.meta?.recipe) return { k: 'recipe', img };
  if (block.kind === 'text') {
    const text = block.content || block.title || '';
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length > 1 && lines.filter(isItem).length >= lines.length / 2) return { k: 'list', items: lines.slice(0, 4).map(isDone) };
    if (modes.documents?.on || text.length > 900) return { k: 'page' };
    return { k: 'note' };
  }
  if (block.ext === 'epub' || (modes.reading?.on && block.ext === 'pdf')) return { k: 'book', img, color: COVERS[Math.floor(seeded(`cover:${id}`)() * COVERS.length)] };
  if (block.kind === 'link') return { k: 'link', img };
  if (block.kind === 'pdf' || block.kind === 'doc') return { k: 'sheet', img };
  if (img) return { k: 'photo', img, video: block.kind === 'video' };
  if (block.kind === 'audio') return { k: 'audio', id };
  return { k: 'other', kind: block.kind, word: kindWord(block) };
}

// A planet's cards. On a list planet the notes are its items, three to a card.
function cardsOf(planet, previews, images) {
  if (!planet.modes?.list?.on) return previews.map((b, i) => faceOf(planet, b, images?.[i] || null));
  const cards = [];
  let items = [];
  previews.forEach((b, i) => {
    if (b.kind === 'text') {
      items.push(!!b.checked);
      if (items.length === 3) { cards.push({ k: 'list', items }); items = []; }
    } else cards.push(faceOf(planet, b, images?.[i] || null));
  });
  if (items.length) cards.push({ k: 'list', items });
  return cards;
}

// Where the cards sit: one belt round the middle, or two when there are many.
// The world comes first, so cards stay modest: at most 60 tall of the map's 256.
function belt(ctx, cards) {
  const n = cards.length;
  const two = n > 6;
  const top = two ? Math.ceil(n / 2) : n;
  cards.forEach((f, i) => {
    const upper = i < top;
    const count = upper ? top : n - top;
    const j = upper ? i : i - top;
    const step = MAP_W / Math.max(count, two ? 4 : 5);
    const hgt = two ? 38 : UPRIGHT[f.k] ? 60 : count <= 3 ? 60 : 48;
    const w = UPRIGHT[f.k] ? hgt * 0.7 : Math.min(hgt * 1.34, step - 10);
    FACES[f.k](ctx, f, (j + 0.5 + (upper ? 0 : 0.5)) * step - w / 2, MAP_H * (two ? (upper ? 0.385 : 0.615) : 0.5) - hgt / 2, w, hgt);
  });
}

const textures = new Map();
function rememberTexture(key, tex) {
  textures.set(key, tex);
  if (textures.size > 32) {
    const oldest = textures.keys().next().value;
    forget(textures.get(oldest));
    textures.delete(oldest);
  }
}

// With WebGL the ground is painted live, so the texture is just the files
// on a clear map. The plain painter gets the ground baked in.
function composeTexture(planet, previews, images, flat) {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: flat });
  ctx.scale(TEX_W / MAP_W, TEX_H / MAP_H);
  const colors = worldColors(planet);
  if (flat) paintTerrain(ctx, colors, seeded(planet.id));
  belt(ctx, cardsOf(planet, previews, images));
  if (!flat) return { canvas };
  // A thin haze of the planet's own colour over everything ties it together.
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = colors.base;
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  ctx.globalAlpha = 1;
  return { data: new Uint32Array(ctx.getImageData(0, 0, TEX_W, TEX_H).data.buffer) };
}

// The texture for a planet as it is now; `onReady` fires again once its
// pictures have loaded.
function textureFor(planet, previews, onReady) {
  const flat = !canPaint();
  const modes = planet.modes || {};
  const key = `${planet.id}|${flat ? `${planet.icon?.c}|${lookOf(planet)}` : ''}|${modes.list?.on ? 'l' : ''}${modes.documents?.on ? 'd' : ''}${modes.reading?.on ? 'r' : ''}|${previews.map((b) => `${b.id}:${b.thumb || ''}:${b.checked ? 1 : 0}:${b.updatedAt || ''}`).join(',')}`;
  const have = textures.get(key);
  if (have) return have;
  const tex = { key, version: 0, ...composeTexture(planet, previews, null, flat) };
  rememberTexture(key, tex);
  const pics = previews.map((b) => (b.thumb ? loadImage(b.thumb) : Promise.resolve(null)));
  if (previews.some((b) => b.thumb)) {
    Promise.all(pics).then((images) => {
      Object.assign(tex, composeTexture(planet, previews, images, flat));
      tex.version += 1;
      onReady?.();
    });
  }
  return tex;
}

// For the plain painter: for each pixel of a D×D picture of the globe, which texel it shows.
const lookups = new Map();
function lookupFor(size) {
  if (lookups.has(size)) return lookups.get(size);
  const n = size * size;
  const row = new Int32Array(n);
  const col = new Int32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let nx = ((x + 0.5) / size) * 2 - 1;
      let ny = ((y + 0.5) / size) * 2 - 1;
      const d = nx * nx + ny * ny;
      if (d > 1) { const k = 1 / Math.sqrt(d); nx *= k; ny *= k; }
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lon = Math.atan2(nx, nz);
      const lat = Math.asin(Math.max(-1, Math.min(1, -ny)));
      const i = y * size + x;
      col[i] = Math.floor((lon / (Math.PI * 2) + 0.5) * TEX_W) & (TEX_W - 1);
      row[i] = Math.min(TEX_H - 1, Math.floor((0.5 - lat / Math.PI) * TEX_H)) * TEX_W;
    }
  }
  const table = { row, col };
  lookups.set(size, table);
  return table;
}

// One loop turns every planet on screen. They turn slowly and by fractions
// of a pixel, so each is repainted about 30 times a second, on a steady beat:
// half of them on one frame, half on the next (more turns on faster screens).
// Planets being spun by hand (or still coasting) are painted every frame.
const turning = new Set();
const spinning = new Set();
let frame = 0;
let held = false;
// Planets also keep their picture while the screen is changing (a page change sets data-vt on the
// page): the browser is showing pictures of both pages then, and repainting under them is waste.
const changing = () => !!document.documentElement.dataset.vt;
new MutationObserver(() => { if (!changing()) { wake(); wakeOrbits(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-vt'] });
let beat = 0;
let lastNow = 0;
let gap = 16.7;
function tick(now) {
  // Held or Still: every planet keeps its picture, so the loop rests until wake().
  const resting = held || changing() || reducedMotion();
  if (resting && !spinning.size && !lifting.size) { frame = 0; lastNow = 0; return; }
  frame = turning.size ? requestAnimationFrame(tick) : 0;
  const dt = lastNow ? Math.min(100, now - lastNow) : 16.7;
  if (lastNow) gap += (dt - gap) * 0.05;
  lastNow = now;
  const turns = Math.max(1, Math.round(33 / gap));
  beat += 1;
  let i = 0;
  together(() => {
    for (const globe of spinning) {
      if (!globe.step(dt)) spinning.delete(globe);
      globe.draw(now, true);
    }
    for (const globe of lifting) if (!spinning.has(globe)) globe.draw(now, true);
    if (resting) return;
    for (const globe of turning) {
      if (spinning.has(globe) || lifting.has(globe)) continue;
      if (gone(globe, now)) { letGo(globe); continue; }
      if ((i++ + beat) % turns === 0) globe.draw(now);
    }
  });
}
function wake() {
  if (turning.size && !frame && !document.hidden && (spinning.size || lifting.size || (!held && !reducedMotion()))) frame = requestAnimationFrame(tick);
}
// Planets that have left the page stop turning. The loop lets them go as it
// goes, but it rests while held or Still, so each new planet checks too.
const gone = (globe, now) => !globe.canvas.isConnected && globe.born < now - 2000;
function letGo(globe) {
  turning.delete(globe);
  watcher?.unobserve(globe.canvas);
}
function startTurning(globe) {
  const now = performance.now();
  for (const old of turning) if (gone(old, now)) letGo(old);
  turning.add(globe);
  wake();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(frame); frame = 0; lastNow = 0; } else { wake(); wakeOrbits(); }
});
onMotionChange(() => { wake(); wakeOrbits(); });
const watcher = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries) e.target.globe?.setVisible(e.isIntersecting);
}, { rootMargin: '120px' }) : null;

// Planets stop (keeping their picture) while nobody can see them, such as out in the universe.
export function holdPlanets(on) {
  held = on;
  wake();
  wakeOrbits();
}

// Flicks: the speed is measured over the last FLICK_MS before letting go,
// capped at MAX_SPIN turns a millisecond (5 a second); RUB is the steady friction.
const FLICK_MS = 90;
const MAX_SPIN = 0.005;
const RUB = 2e-7;
const NUDGE = 0.00022;   // the spin a planet picks up when pointed at, in turns a millisecond
const LIFT_MS = 2500;    // how long dust takes to lift off a world that has just been used
const RISE_MS = 1500;    // how long a calm world takes to grow busy
const DUSTY = 0.385;     // under this much use a world gathers dust (mutt/api.py USE_DUST)
// Worlds whose dust is lifting are painted every frame until it has.
const lifting = new Set();

function makeGlobe(canvas, rand, rate = 1) {
  // about a minute a turn
  const period = (40 + rand() * 35) * 1000;
  const offset = rand() * period;
  const seed = [rand() * 97, rand() * 97, rand() * 97];
  const live = canPaint();
  // Its weather keeps its own clock, so it runs faster on a busy world
  // without jumping when its use changes.
  let clock = seed[0] * 10;
  let clockAt = 0;
  // Dust lifting off (wake): when it began, and what the world's use becomes after.
  let lift = 0;
  let liftFrom = 0.5;
  let liftTo = 0.5;
  let size = 0;
  let cssSize = 0;
  // A hand's spin on top of its own slow turn: extra turn (a fraction of a
  // whole one), how fast it's coasting (turns a millisecond) and a tip forward.
  let spin = 0;
  let vel = 0;
  let tip = 0;
  let tipVel = 0;
  let grabbed = false;
  const flick = [];
  let image = null;
  let out = null;
  let table = null;
  let tex = null;
  let texVersion = -1;
  let world = null;
  // What the painter is handed each frame, reused rather than made anew.
  const job = { seed };
  let drawn = false;
  let shown = -1;
  let visible = !watcher;
  const ctx = canvas.getContext('2d');

  const globe = {
    canvas,
    born: performance.now(),
    setSize(css) {
      cssSize = css;
      // As sharp as the screen, up to 2 pixels a point; the painter's picture is a
      // little larger than the ball, for the air round its edge.
      const next = live ? Math.max(32, Math.min(660, Math.round(css * AIR * Math.min(devicePixelRatio || 1, 2))))
        : Math.max(32, Math.min(300, Math.round(css * Math.min(devicePixelRatio || 1, 1.5))));
      if (next === size) return;
      size = next;
      canvas.width = size;
      canvas.height = size;
      if (!live) {
        image = ctx.createImageData(size, size);
        out = new Uint32Array(image.data.buffer);
        table = lookupFor(size);
      }
      drawn = false;
      shown = -1;
    },
    setWorld(next) { world = next; Object.assign(job, next); drawn = false; globe.draw(performance.now(), true); },
    // Laying the page out again hands back the same texture: no need to repaint for that.
    setTexture(next) {
      if (next === tex && next.version === texVersion && drawn) return;
      tex = next;
      texVersion = next.version;
      drawn = false;
      shown = -1;
      globe.draw(performance.now(), true);
    },
    draw(now, force = false) {
      if (!tex || !size || (!visible && !force)) return;
      const still = reducedMotion();
      if (!force && drawn && (still || held || changing())) return;
      const own = still || !rate ? offset / period : (((now * rate) + offset) % period) / period;
      const turn = (((own + spin) % 1) + 1) % 1;
      job.source = tex;
      job.turn = turn;
      job.lean = 0.3 + tip;
      if (lift) {
        // A dusty world: over LIFT_MS the dust clears in patches, then its weather comes
        // back. One that wasn't dusty just grows busier, over RISE_MS.
        const dusty = liftFrom < DUSTY;
        const t = still ? 1 : Math.min(1, (now - lift) / (dusty ? LIFT_MS : RISE_MS));
        const back = dusty ? Math.max(0, Math.min(1, (t - 0.6) / 0.4)) : t;
        job.clear = dusty ? Math.min(1, t / 0.75) : 0;
        job.use = liftFrom + (liftTo - liftFrom) * back * back * (3 - 2 * back);
        if (t >= 1) { lift = 0; job.clear = 0; job.use = liftTo; lifting.delete(globe); }
      }
      if (clockAt && !still) clock += (Math.min(250, now - clockAt) / 1000) * (0.35 + 1.35 * (job.use ?? 0.5));
      clockAt = now;
      job.time = still ? 0 : clock;
      if (live && world && paint(ctx, size, job)) {
        drawn = true;
        return;
      }
      if (!tex.data) return; // the painter was lost: keep the last picture
      const shift = Math.floor(turn * TEX_W);
      if (shift === shown && !force) return;
      shown = shift;
      drawn = true;
      const { row, col } = table;
      const data = tex.data;
      const mask = TEX_W - 1;
      for (let i = 0, n = out.length; i < n; i++) out[i] = data[row[i] + ((col[i] - shift) & mask)];
      ctx.putImageData(image, 0, 0);
    },
    setVisible(on) {
      visible = on;
      if (on) globe.draw(performance.now(), true);
    },
    // Pointed at: it spins up a little to show more of what is on it, then coasts down.
    nudge() {
      if (grabbed || reducedMotion() || Math.abs(vel) > NUDGE) return;
      vel = -NUDGE;
      spinning.add(globe);
      wake();
    },
    // Something landed on a dusty world: the dust lifts off on a wind and its weather returns.
    wakeUp(to = 1) {
      liftTo = to;
      if (lift || (job.use ?? 0.5) >= to) return;
      liftFrom = job.use ?? 0.5;
      lift = performance.now();
      lifting.add(globe);
      wake();
    },
    lifting: () => !!lift,
    // Spinning by hand, like a fidget spinner: the surface follows the
    // pointer sideways (a whole turn is the distance round its middle) and,
    // let go, keeps the speed and direction it was flicked with, coasting
    // down slowly. Up/down tips it a little; it bounces back level.
    grab() {
      grabbed = true;
      vel = 0;
      flick.length = 0;
      spinning.add(globe);
      wake();
    },
    drag(dx, dy, t) {
      // Its own turn carries the surface leftward, so a drag right is a negative turn.
      const step = -dx / (Math.PI * Math.max(1, cssSize));
      spin += step;
      flick.push({ step, t });
      while (flick.length > 1 && t - flick[0].t > FLICK_MS) flick.shift();
      tip = 0.45 * Math.tanh((dy / Math.max(1, cssSize)) * 1.4);
      tipVel = 0;
    },
    // The speed of the last moments before letting go: a pause first means no spin.
    release(t, cancelled = false) {
      grabbed = false;
      const recent = flick.filter((f) => t - f.t <= FLICK_MS);
      const span = recent.length ? Math.max(16, t - recent[0].t + 8) : 0;
      vel = cancelled || reducedMotion() || !span ? 0 : recent.reduce((sum, f) => sum + f.step, 0) / span;
      vel = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, vel));
      flick.length = 0;
    },
    // Coasts down and bounces the tip back; false once it has settled.
    step(dt) {
      if (grabbed) return true;
      spin += vel * dt;
      // Slows like a bearing: a little drag that grows with speed, plus a
      // steady rub that brings it to a clean stop.
      const slowed = Math.abs(vel) * Math.exp(-dt / 2600) - RUB * dt;
      vel = slowed > 0 ? Math.sign(vel) * slowed : 0;
      for (let left = dt; left > 0; left -= 16) {
        const d = Math.min(16, left);
        tipVel += (-tip * 2.5e-4 - tipVel * 0.012) * d;
        tip += tipVel * d;
      }
      if (vel || Math.abs(tip) > 0.002 || Math.abs(tipVel) > 1e-5) return true;
      tip = 0;
      tipVel = 0;
      return false;
    },
  };
  canvas.globe = globe;
  watcher?.observe(canvas);
  startTurning(globe);
  return globe;
}

// Grab the globe and drag sideways to spin it; let go and it coasts. With a
// mouse it follows at once. On touch only a sideways swipe spins: an upward
// one scrolls the page, and holding still picks the planet up (drag.js).
function spinnable(el, globe) {
  const ball = el.ball;
  let spun = false;
  ball.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.isPrimary === false) return;
    const pid = e.pointerId;
    const start = { x: e.clientX, y: e.clientY };
    let last = { x: e.clientX };
    let on = false;
    spun = false;

    const begin = () => {
      on = true;
      el.classList.add('is-spinning');
      globe.grab();
      try { ball.setPointerCapture(pid); } catch { /* already gone */ }
    };
    const move = (ev) => {
      if (ev.pointerId !== pid) return;
      if (document.body.classList.contains('is-carrying')) { end(ev.timeStamp, true); return; }
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!on) {
        if (Math.hypot(dx, dy) < 6) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.2) { end(ev.timeStamp, true); return; } // a scroll
        begin();
      }
      if (Math.hypot(dx, dy) > 4) spun = true;
      globe.drag(ev.clientX - last.x, dy, ev.timeStamp);
      last = { x: ev.clientX };
    };
    const up = (ev) => {
      if (ev.pointerId === pid) end(ev.timeStamp, ev.type === 'pointercancel');
    };
    function end(t, cancelled) {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      if (on) { globe.release(t, cancelled); el.classList.remove('is-spinning'); }
      on = false;
    }
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    if (e.pointerType === 'mouse') begin();
  });
  // A spin isn't a click: don't open the planet.
  el.addEventListener('click', (e) => {
    if (!spun) return;
    spun = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
}

// ---------------------------------------------------------------- the planet

export function planetEl(planet, { size, href = `/p/${planet.id}`, label = true, tag = href ? 'a' : 'div', orbit = false } = {}) {
  const rand = seeded(planet.id);
  const tilt = Math.round((rand() - 0.5) * 36);
  rand();   // (a draw once used for the rings' own tilt: kept so every planet shows the face it always has)
  const isMoon = !!planet.parentId;

  const canvas = h('canvas', { class: 'planet-map', 'aria-hidden': 'true' });
  const globeApi = makeGlobe(canvas, rand, isMoon ? MOON_BY_ID[moonLookOf(planet)].rate : 1);

  const ball = h('span', { class: 'planet-ball' },
    canvas,
    h('span', { class: 'planet-shade' }),
    h('span', { class: 'planet-lock' }, icon('lock', 20)));
  const ringBack = h('span', { class: 'planet-ring planet-ring-back' });
  const ringFront = h('span', { class: 'planet-ring planet-ring-front' });
  const bubble = h('span', { class: 'planet-bubble', 'aria-hidden': 'true' });
  const name = h('span', { class: 'planet-name' });
  const meta = h('span', { class: 'planet-meta' });
  const body = h('span', { class: 'planet-body' }, h('span', { class: 'planet-atmo' }), ringBack, ball, ringFront, bubble);
  const el = h(tag, { class: `planet${canPaint() ? ' is-gl' : ''}${isMoon ? ' is-moon' : ''}`, href: tag === 'a' ? href : null, dataset: { id: planet.id }, draggable: 'false' },
    body,
    label ? h('span', { class: 'planet-label' }, h('span', { class: 'planet-title' }, name), meta) : null);

  // its rings lie round its middle, so they lean as it does
  el.style.setProperty('--tilt', `${tilt}deg`);

  // Its moons, going round it (on the galaxy only).
  const host = { size: 0, hovered: false };
  let orbits = [];
  let moonSig = '';
  el.moonEls = () => orbits.map((o) => o.el);
  function setMoons(list, s) {
    host.size = s;
    const sig = list.map((m) => `${m.id}:${m.look || ''}:${m.locked ? 1 : 0}:${m.title}`).join();
    if (sig !== moonSig) {
      moonSig = sig;
      for (const o of orbits) { o.el.remove(); orbiting.delete(o); }
      orbits = list.map((m, i) => {
        const me = moonEl(m, { size: moonSize(s, m.count) });
        me.classList.add('is-orbiting');
        bubble.before(me);
        return makeOrbit(me, host, i);
      });
      wakeOrbits();
    }
    for (const o of orbits) { o.el.resize(moonSize(s, o.el.moon.count)); place(o); }
    el.classList.toggle('has-moons', orbits.length > 0);
  }
  if (orbit) {
    const hover = (on) => (e) => { if (e.pointerType !== 'touch') { host.hovered = on; wakeOrbits(); if (on) globeApi.nudge(); } };
    el.addEventListener('pointerenter', hover(true));
    el.addEventListener('pointerleave', hover(false));
    el.addEventListener('focusin', () => { host.hovered = true; wakeOrbits(); });
    el.addEventListener('focusout', () => { host.hovered = false; wakeOrbits(); });
  }

  let shownWorld = '';
  let fresh = 0;
  el.update = (next, opts = {}) => {
    planet = next;
    el.planet = next;
    const s = opts.size || size || planetSize(next.count);
    el.style.setProperty('--s', `${s}px`);
    const look = lookOf(next);
    const colors = worldColors(next, look);
    el.dataset.look = look;
    const rings = !isMoon && (next.count || 0) >= 10;
    // How used it is (the server works it out); a moon and a planet that says nothing are calm.
    // (once something has landed here it stays busy for this visit, whatever the galaxy last said)
    const use = globeApi.lifting() ? null : Math.max(next.use ?? 0.5, fresh);
    const worldKey = `${look}|${colors.colors.join()}|${rings}|${!!next.locked}|${use}`;
    if (worldKey !== shownWorld) {
      shownWorld = worldKey;
      globeApi.setWorld({ look: LOOK_INDEX[look], tilt: (tilt * Math.PI) / 180, colors: colors.colors.map(rgb), rings, lock: !!next.locked, ...(use == null ? {} : { use }) });
    }
    el.style.setProperty('--c', colors.base);
    el.style.setProperty('--c-light', colors.light);
    el.style.setProperty('--c-dark', colors.dark);
    el.classList.toggle('is-locked', !!next.locked);
    el.classList.toggle('is-private', !!next.private);
    el.classList.toggle('has-rings', rings);
    el.classList.toggle('is-empty', !next.count);
    globeApi.setSize(s);
    if (orbit) setMoons(next.locked ? [] : (next.moons || []), s);
    const previews = next.locked ? [] : (next.previews || []).slice(0, 12);
    const tex = textureFor(next, previews, () => globeApi.setTexture(textures.get(tex.key) || tex));
    globeApi.setTexture(tex);
    name.textContent = next.private ? 'Private' : next.title;
    const bits = [];
    if (next.private) {
      meta.replaceChildren();
      el.setAttribute('aria-label', 'A private planet');
      return;
    }
    const vis = next.community ? 'community' : next.visibility;
    if (next.mine !== false && vis && vis !== 'pin') bits.push(icon(vis === 'community' ? 'plus' : VISIBILITY[vis].icon, 12));
    if (next.locked) bits.push(icon('lock', 12));
    bits.push(h('span', null, next.count ? plural(next.count, 'file') : 'empty'));
    meta.replaceChildren(...bits);
    el.setAttribute('aria-label', `${next.title}, ${next.locked ? 'locked' : plural(next.count || 0, 'file')}`);
  };
  el.update(planet);

  el.ball = ball;
  el.body = body;
  spinnable(el, globeApi);

  // The Vita notification bubble: "+2" after things land here.
  let bumped = 0;
  el.bump = (n = 1) => {
    bumped += n;
    bubble.textContent = `+${bumped}`;
    bubble.classList.remove('is-on');
    void bubble.offsetWidth;
    bubble.classList.add('is-on');
  };
  // Something arrived: the world brightens a moment, and if it had gathered
  // dust, the dust lifts off.
  el.gulp = () => {
    fresh = 1;
    globeApi.wakeUp();
    body.classList.remove('is-gulping');
    void body.offsetWidth;
    body.classList.add('is-gulping');
    setTimeout(() => body.classList.remove('is-gulping'), DUR.scene);
  };
  el.center = () => {
    const r = ball.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
  };
  return el;
}

// ---------------------------------------------------------------- moons

// A moon is about a quarter of its planet's width, a little bigger as it
// fills up, never more than a third.
export function moonSize(planetPx, count = 0) {
  return Math.round(Math.max(12, Math.min(planetPx / 3, planetPx * 0.25 + Math.sqrt(count || 0) * 1.5)));
}

const ORBIT_FLAT = 0.32;
const orbitRadius = (slot, look) => 0.6 + slot * 0.09 + (MOON_BY_ID[look]?.reach || 0);

// How far a planet's moons reach out sideways from its middle, for laying
// out the galaxy (0 when it has none).
export function orbitReach(planet, s) {
  const list = planet.locked ? [] : planet.moons || [];
  return list.reduce((most, m, i) => Math.max(most, s * orbitRadius(i, moonLookOf(m)) + moonSize(s, m.count) / 2), 0);
}

let blankTex = null;
function blankTexture() {
  if (!blankTex) {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 2;
    blankTex = { key: 'blank', version: 0, canvas };
  }
  return blankTex;
}

// A moon as a small painted world, showing just its real-moon look.
// Clicking opens it. (A span, not a link: on the galaxy it sits inside its
// planet's link.)
export function moonEl(moon, { size = 28, link = true } = {}) {
  const look = moonLookOf(moon);
  const kind = MOON_BY_ID[look];
  const rand = seeded(moon.id);
  const tilt = (rand() - 0.5) * 30;
  const ball = h('span', { class: 'moon-ball' });
  const el = h('span', {
    class: `moon${moon.locked ? ' is-locked' : ''}`,
    dataset: { id: moon.id, look, vt: `moon-${moon.id}` },
    style: { '--m': `${size}px` },
    ...(link ? { role: 'link', tabindex: '0', 'aria-label': `${moon.title}, moon` } : { 'aria-hidden': 'true' }),
  }, ball, h('span', { class: 'moon-fx', 'aria-hidden': 'true' }), link ? h('span', { class: 'moon-name' }, moon.title) : null);
  el.moon = moon;
  if (canPaint()) {
    const canvas = h('canvas', { class: 'moon-map', 'aria-hidden': 'true' });
    ball.append(canvas);
    const globe = makeGlobe(canvas, rand, kind.rate);
    globe.setSize(size);
    globe.setWorld({ look: LOOK_INDEX[look], tilt: (tilt * Math.PI) / 180, colors: MOON_PALETTES[look].map(rgb), use: 0.5 });
    globe.setTexture(blankTexture());
    el.globe = globe;
    el.classList.add('is-gl');
  }
  el.resize = (px) => {
    el.style.setProperty('--m', `${px}px`);
    el.globe?.setSize(px);
  };
  el.center = () => {
    const r = ball.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
  };
  el.gulp = () => {
    el.classList.remove('is-gulping');
    void el.offsetWidth;
    el.classList.add('is-gulping');
    setTimeout(() => el.classList.remove('is-gulping'), DUR.scene);
  };
  if (link) {
    const open = (e) => {
      e.preventDefault();
      e.stopPropagation();
      nav.go(`/p/${moon.id}`);
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
  }
  return el;
}

// Orbits: each moon goes round on a tilted, flattened circle, in front of its
// planet in the near half and behind it in the far half. Hovering the planet
// eases them to a stop, but only once they've come round to the front, so
// they can always be clicked. Under Still they rest in front, right and left.
const orbiting = new Set();
let orbitFrame = 0;
let orbitLast = 0;

function makeOrbit(el, host, slot) {
  const look = el.dataset.look;
  const kind = MOON_BY_ID[look];
  const rand = seeded(`orbit:${el.moon.id}`);
  const speed = ((Math.PI * 2) / (kind.period * 1000)) * (kind.backwards ? -1 : 1);
  const o = {
    el,
    host,
    slot,
    radius: orbitRadius(slot, look),
    tilt: (rand() - 0.5) * 0.5,
    speed,
    phase: rand() * Math.PI * 2 + performance.now() * speed,
    rate: 1,
    front: null,
    born: performance.now(),
  };
  orbiting.add(o);
  return o;
}

// Where a moon rests when nothing moves: in front, first right then left.
// The inner pair sit lower and closer in, the outer pair further out, so they don't overlap.
const restPhase = (slot) => {
  const a = slot >> 1 ? 0.1 : 0.8;
  return slot % 2 ? Math.PI - a : a;
};

function place(o) {
  const r = o.host.size * o.radius;
  const x0 = Math.cos(o.phase) * r;
  const y0 = Math.sin(o.phase) * r * ORBIT_FLAT;
  const c = Math.cos(o.tilt);
  const sn = Math.sin(o.tilt);
  const depth = Math.sin(o.phase);
  o.el.style.transform = `translate(${(x0 * c - y0 * sn).toFixed(1)}px, ${(x0 * sn + y0 * c).toFixed(1)}px) scale(${(1 + depth * 0.08).toFixed(3)})`;
  const front = depth > 0;
  if (front !== o.front) {
    o.front = front;
    o.el.classList.toggle('is-behind', !front);
  }
}

function orbitTick(now) {
  orbitFrame = 0;
  const dt = orbitLast ? Math.min(100, now - orbitLast) : 16.7;
  orbitLast = now;
  const carrying = document.body.classList.contains('is-carrying');
  let moving = false;
  for (const o of orbiting) {
    if (!o.el.isConnected) {
      if (o.born < now - 2000) orbiting.delete(o);
      continue;
    }
    const want = (o.host.hovered && Math.sin(o.phase) > 0.25) || carrying ? 0 : 1;
    o.rate += (want - o.rate) * (1 - Math.exp(-dt / 220));
    if (Math.abs(o.rate - want) < 0.003) o.rate = want;
    if (o.rate) {
      o.phase += o.speed * o.rate * dt;
      place(o);
    }
    if (o.rate || want) moving = true;
  }
  if (moving && !document.hidden && !held) orbitFrame = requestAnimationFrame(orbitTick);
  else orbitLast = 0;
}

function wakeOrbits() {
  if (reducedMotion()) {
    cancelAnimationFrame(orbitFrame);
    orbitFrame = 0;
    orbitLast = 0;
    for (const o of orbiting) { o.phase = restPhase(o.slot); place(o); }
    return;
  }
  if (!orbitFrame && orbiting.size && !document.hidden && !held) orbitFrame = requestAnimationFrame(orbitTick);
}

// A moon as a small shaded dot, in its own colours, for menus.
export function moonDot(moon) {
  const [, dark, mid, light] = MOON_PALETTES[moonLookOf(moon)];
  return h('span', { class: 'planet-dot moon-dot', style: { '--c': mid, '--c-dark': dark, '--c-light': light }, 'aria-hidden': 'true' });
}

// A tiny painted world for the universe: no files, just colour and light.
// A planet's colour as a small dot, for lists of planets.
export function planetDot(planet) {
  return h('span', { class: 'planet-dot', style: { '--c': planet.icon?.c || planet.c || '#2F6BFF' }, 'aria-hidden': 'true' });
}

// A planet's kind of world painted once in another colour, bare and still, for
// the colour picker. Nothing without the painter (the picker's own dot shows).
export function worldDot(planet, color, size) {
  if (!canPaint()) return null;
  const rand = seeded(planet.id);
  const tilt = (rand() - 0.5) * 36;
  rand();
  const period = 40 + rand() * 35;
  const offset = rand() * period;
  const seed = [rand() * 97, rand() * 97, rand() * 97];
  const look = lookOf(planet);
  const px = Math.round(size * AIR * Math.min(devicePixelRatio || 1, 2));
  const canvas = h('canvas', { class: 'world-dot', width: px, height: px, 'aria-hidden': 'true' });
  const ok = paint(canvas.getContext('2d'), px, {
    source: blankTexture(), look: LOOK_INDEX[look], tilt: (tilt * Math.PI) / 180, colors: worldColors({ ...planet, icon: { c: color } }, look).colors.map(rgb),
    turn: offset / period, time: seed[0] * 10, seed, use: 0.5,
  });
  return ok ? canvas : null;
}

// A planet as it looks in its own galaxy, painted once and held still, for
// the universe. It has no files on it (the universe doesn't load them).
// `res` is how sharp it's painted, in pixels per pixel of `size`.
let blank = null;
export function worldPicture(world, size, res = Math.min(3, (devicePixelRatio || 1) * 1.5)) {
  const colors = worldColors(world);
  const look = lookOf(world);
  const el = h('span', {
    class: `uv-world${world.locked ? ' is-locked' : ''}${world.private ? ' is-private' : ''}${(world.n || 0) >= 10 ? ' has-rings' : ''}`,
    dataset: { look },
    style: { '--w': `${size}px`, '--c': colors.base, '--c-light': colors.light, '--c-dark': colors.dark },
  });
  (world.moons || []).slice(0, 4).forEach((m, i) => {
    const look = moonLookOf(m);
    el.append(h('span', { class: 'uv-moon', style: { '--mc': MOON_PALETTES[look][1], '--side': i % 2 ? -1 : 1, '--lv': i >> 1 } }));
  });
  if (world.locked && !world.private) el.append(h('span', { class: 'uv-world-lock', style: { '--g': `${Math.round(size * 0.3)}px` } }, icon('lock', Math.max(6, Math.round(size * 0.3)))));
  if (!canPaint()) return el;
  // The same draws from the planet's id as planetEl() and makeGlobe(), so
  // it shows the same face, tilt and weather.
  const rand = seeded(world.id);
  const tilt = (rand() - 0.5) * 36;
  rand();
  const period = 40 + rand() * 35;
  const offset = rand() * period;
  const seed = [rand() * 97, rand() * 97, rand() * 97];
  if (!blank) {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 2;
    blank = { canvas };
  }
  const px = Math.max(16, Math.round(size * res * AIR));
  const canvas = h('canvas', { class: 'uv-world-map', width: px, height: px, 'aria-hidden': 'true' });
  const ok = paint(canvas.getContext('2d'), px, {
    source: blank,
    look: LOOK_INDEX[look],
    tilt: (tilt * Math.PI) / 180,
    colors: colors.colors.map(rgb),
    turn: offset / period,
    time: seed[0] * 10,
    seed,
    use: 0.5,
    lock: !!world.locked,
  });
  if (ok) {
    el.classList.add('is-painted');
    el.prepend(canvas);
  }
  return el;
}
