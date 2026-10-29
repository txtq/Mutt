// A little pixel horizon for the sign-in page: low hills of pines and autumn
// trees, a cottage with its light on and a mutt waiting outside. Drawn small
// and scaled up so the pixels stay crisp; the Vita sky (and its stars) does
// the rest.

import { debounce, h, reducedMotion, seeded } from './util.js';

const FPS = 8;

const C = {
  hillBack: '#142d66', hillBackLit: '#21418a',
  hillFront: '#0b1a3e', hillFrontLit: '#172c5e', grass: '#1b3568', path: '#1a2450', pebble: '#253263',
  pineBack: '#10255c', pineBackLit: '#1d3a7a',
  pine: '#0d2a40', pineLit: '#285068', pineDark: '#08192c',
  trunk: '#2b1a14',
  autumn: [
    { base: '#9a4a2a', lit: '#d4813c', dark: '#5c2a20' }, // rust
    { base: '#a87428', lit: '#dcab4a', dark: '#654220' }, // amber
    { base: '#8a3a30', lit: '#c4603e', dark: '#4e2024' }, // red
  ],
  wall: '#5b3a28', wallLit: '#7c5236', wallDark: '#44291d', stone: '#363a55', stoneLit: '#4d5374',
  roof: '#4f2a33', roofLit: '#74404a', roofDark: '#361b24',
  chimney: '#454a66', chimneyLit: '#646b8e',
  door: '#2e1c16', frame: '#2a1a14',
  glow: '#ffd36a', glowHot: '#fff0b0', ember: '#f2a33a',
  smoke: '#a9b4d6', post: '#2a2234',
};

// The mutt, sitting and facing the cottage. b shade · B coat · L moonlit ·
// E eye · N nose · T tail.
const DOG = [
  '...bBL.',
  '...BEBN',
  '...bBB.',
  'T..BBBL',
  '.bBBBBL',
  '.BbBbB.',
];
const DOG_INK = { b: '#8a5f3e', B: '#c08f5c', L: '#e3bb88', E: '#1a1020', N: '#1a1020', T: '#8a5f3e' };

// Repeatable noise for dithering, so the same spot always gets the same pixel.
function noise(x, y) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function dot(ctx, x, y, color, w = 1, hgt = 1, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, hgt);
  ctx.globalAlpha = 1;
}

// A soft, checkered glow: every other pixel, fading out.
function haze(ctx, cx, cy, radius, color, alpha) {
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const d = Math.hypot(x, y);
      if (d > radius || (x + y) & 1) continue;
      dot(ctx, cx + x, cy + y, color, 1, 1, alpha * (1 - d / (radius + 1)));
    }
  }
}

function layout(W, H) {
  const R = seeded('mutt-night');
  const narrow = W < 170;
  const backTop = [];
  const frontTop = [];
  for (let x = 0; x < W; x++) {
    backTop[x] = Math.round(H * 0.84 + Math.sin(x * 0.021 + 1.3) * H * 0.02 + Math.sin(x * 0.067) * 1.2);
    frontTop[x] = Math.round(H * 0.91 + Math.sin(x * 0.014 + 4) * H * 0.015 + Math.sin(x * 0.05 + 2));
  }

  // Level a spot for the cottage.
  const house = { x: Math.round(W * (narrow ? 0.5 : 0.66)), w: 24 };
  const flat = frontTop[Math.min(W - 1, house.x + 12)];
  for (let x = house.x - 12; x < house.x + house.w + 12; x++) {
    if (x < 0 || x >= W) continue;
    const d = Math.max(0, house.x - 3 - x, x - (house.x + house.w + 3));
    const t = Math.min(1, d / 9);
    frontTop[x] = Math.round(flat * (1 - t) + frontTop[x] * t);
  }
  house.y = flat;
  const dog = { x: house.x - 9, y: flat - DOG.length };
  const lamp = { x: house.x - 15, y: flat };

  // Trees gather toward the edges, like the edge of a wood.
  const edgeX = () => {
    const r = R();
    const reach = W * (narrow ? 0.34 : 0.42);
    return r < 0.5 ? (r * 2) ** 1.5 * reach : W - 1 - ((r - 0.5) * 2) ** 1.5 * reach;
  };
  const clear = (x, pad) => x > lamp.x - pad && x < house.x + house.w + pad;

  const backTrees = [];
  for (let i = 0, n = Math.round(W / 18); i < n; i++) {
    const x = Math.floor(R() < 0.7 ? edgeX() : R() * W);
    backTrees.push({ x, y: backTop[x] + 1, size: 6 + Math.floor(R() * 7) });
  }

  const frontTrees = [];
  for (let i = 0, n = Math.round(W / (narrow ? 16 : 24)); i < n; i++) {
    const x = Math.floor(edgeX());
    if (clear(x, 7)) continue;
    const autumn = R() < 0.45;
    frontTrees.push({
      x, y: frontTop[x] + 1, autumn,
      size: autumn ? 4 + Math.floor(R() * 3) : 10 + Math.floor(R() * 9),
      tint: Math.floor(R() * C.autumn.length),
    });
  }
  frontTrees.sort((a, b) => a.size - b.size);

  return { W, H, backTop, frontTop, house, dog, lamp, backTrees, frontTrees };
}

// ---------------------------------------------------------------- the still parts

function drawHill(ctx, tops, H, fill, lit, salt) {
  tops.forEach((top, x) => {
    dot(ctx, x, top, fill, 1, H - top);
    if (noise(x, salt) > 0.45) dot(ctx, x, top, lit);
    if (!(x & 1) && noise(x, salt + 1) > 0.5) dot(ctx, x, top + 1, lit);
  });
}

function drawPine(ctx, x, base, size, ink) {
  dot(ctx, x, base - 2, C.trunk, 1, 2);
  const tiers = Math.max(2, Math.round(size / 4));
  let y = base - 2;
  for (let k = tiers - 1; k >= 0; k--) {
    for (let j = 3; j >= 0; j--) {
      const half = k + j;
      if (k === 0 && j === 0) { dot(ctx, x, y - 1, ink.body); y -= 1; continue; }
      dot(ctx, x - half, y - 1, ink.body, half * 2 + 1);
      dot(ctx, x + half, y - 1, ink.lit);
      if (half > 1) dot(ctx, x - half, y - 1, ink.dark || ink.body);
      y -= 1;
    }
  }
}

function drawLeafy(ctx, x, base, size, ink) {
  dot(ctx, x, base - size - 1, C.trunk, 2, size + 1);
  const cy = base - size - Math.round(size * 0.8);
  const r = size + 1;
  for (let y = -r - 1; y <= r; y++) {
    for (let dx = -r - 1; dx <= r + 1; dx++) {
      const edge = Math.hypot(dx, y * 1.15);
      if (edge > r + (noise(x + dx, cy + y) - 0.5) * 1.6) continue;
      let color = ink.base;
      if (dx - y > r * 0.7) color = ink.lit;
      else if (dx - y < -r * 0.6) color = ink.dark;
      else if (noise(x + dx, cy + y + 9) > 0.86) color = ink.lit;
      dot(ctx, x + dx, cy + y, color);
    }
  }
}

function drawCottage(ctx, { x, y, w }) {
  const wallTop = y - 12;
  // chimney behind the roof
  dot(ctx, x + w - 7, wallTop - 11, C.chimney, 3, 9);
  dot(ctx, x + w - 5, wallTop - 11, C.chimneyLit, 1, 9);
  dot(ctx, x + w - 8, wallTop - 12, C.chimneyLit, 5, 1);
  // walls, plank by plank, moonlit on the right
  dot(ctx, x + 1, wallTop, C.wall, w - 2, 10);
  for (let row = 2; row < 10; row += 3) dot(ctx, x + 1, wallTop + row, C.wallDark, w - 2, 1);
  dot(ctx, x + w - 3, wallTop, C.wallLit, 2, 10);
  dot(ctx, x, y - 2, C.stone, w, 2);
  for (let i = 0; i < w; i += 3) dot(ctx, x + i, y - 2, C.stoneLit);
  // door
  dot(ctx, x + 3, y - 9, C.frame, 6, 7);
  dot(ctx, x + 4, y - 8, C.door, 4, 6);
  dot(ctx, x + 7, y - 5, C.ember);
  // window frame (the light goes in each frame)
  dot(ctx, x + 12, wallTop + 2, C.frame, 7, 6);
  // roof: stepped, one row narrower each step up
  for (let i = 0; i < 10; i++) {
    const left = x - 2 + i;
    const width = w + 4 - i * 2;
    if (width <= 0) break;
    const row = wallTop - 1 - i;
    dot(ctx, left, row, C.roof, width);
    dot(ctx, left + Math.floor(width / 2), row, C.roofLit, Math.ceil(width / 2));
    if (i % 2 === 0) for (let s = left + (i % 4 ? 1 : 2); s < left + width; s += 4) dot(ctx, s, row, C.roofDark);
  }
  dot(ctx, x - 2, wallTop - 1, C.roofDark, w + 4);
  // light spilling out onto the ground
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 3; j++) if (!((i + j) & 1)) dot(ctx, x + 11 + i, y + j, C.glow, 1, 1, 0.16 - j * 0.04);
  }
}

function drawGround(ctx, s) {
  const { W, H, frontTop, house } = s;
  // a path from the door down off the page
  const door = house.x + 6;
  for (let y = house.y; y < H; y++) {
    const t = y - house.y;
    const cx = door + Math.round(Math.sin(t * 0.18) * 2 - t * 0.35);
    const half = 2 + Math.floor(t / 6);
    dot(ctx, cx - half, y, C.path, half * 2 + 1);
    if (noise(cx, y) > 0.6) dot(ctx, cx - half + Math.floor(noise(y, cx) * half * 2), y, C.pebble);
  }
  for (let x = 0; x < W; x++) {
    if (noise(x, 7) > 0.84) dot(ctx, x, frontTop[x] - 1, C.grass);
    if (noise(x, 8) > 0.93) dot(ctx, x, frontTop[x] - 2, C.grass);
  }
}

function drawStill(ctx, s) {
  ctx.clearRect(0, 0, s.W, s.H);
  drawHill(ctx, s.backTop, s.H, C.hillBack, C.hillBackLit, 1);
  for (const t of s.backTrees) drawPine(ctx, t.x, t.y, t.size, { body: C.pineBack, lit: C.pineBackLit });
  drawHill(ctx, s.frontTop, s.H, C.hillFront, C.hillFrontLit, 3);
  drawGround(ctx, s);
  drawCottage(ctx, s.house);
  // lamp post
  dot(ctx, s.lamp.x, s.lamp.y - 10, C.post, 1, 10);
  dot(ctx, s.lamp.x - 1, s.lamp.y - 11, C.post, 3, 1);
  dot(ctx, s.lamp.x - 1, s.lamp.y - 1, C.post, 3, 1);
  for (const t of s.frontTrees) {
    if (t.autumn) drawLeafy(ctx, t.x, t.y, t.size, C.autumn[t.tint]);
    else drawPine(ctx, t.x, t.y, t.size, { body: C.pine, lit: C.pineLit, dark: C.pineDark });
  }
}

// ---------------------------------------------------------------- what moves

function drawFrame(ctx, still, s, f) {
  ctx.clearRect(0, 0, s.W, s.H);
  ctx.drawImage(still, 0, 0);

  const { house, lamp, dog } = s;
  const wallTop = house.y - 12;

  // the window, flickering now and then like a fire inside
  const flicker = noise(f >> 1, 3) > 0.82;
  const pane = flicker ? C.ember : C.glow;
  dot(ctx, house.x + 13, wallTop + 3, pane, 2, 4);
  dot(ctx, house.x + 16, wallTop + 3, pane, 2, 4);
  dot(ctx, house.x + 13, wallTop + 3, C.glowHot, 1, 1);
  haze(ctx, house.x + 15, wallTop + 5, 5, C.glow, flicker ? 0.16 : 0.24);

  // lamp
  dot(ctx, lamp.x, lamp.y - 10, noise(f >> 2, 5) > 0.9 ? C.ember : C.glowHot, 1, 2);
  haze(ctx, lamp.x, lamp.y - 9, 4, C.glow, 0.26);

  // smoke from the chimney
  const chimney = { x: house.x + house.w - 6, y: wallTop - 13 };
  for (let k = 0; k < 5; k++) {
    const age = (f * 0.6 + k * 6) % 30;
    const size = age < 10 ? 1 : 2;
    dot(ctx, chimney.x + Math.round(Math.sin(age * 0.25 + k) * 1.4 + age * 0.2), chimney.y - age, C.smoke, size, size, 0.5 * (1 - age / 30));
  }


  // the mutt: blinks, and wags now and then
  const blink = f % 37 === 0;
  const wag = f % 50 < 14 && (f >> 1) & 1;
  DOG.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === '.') return;
      if (ch === 'T') { dot(ctx, dog.x + c, dog.y + r - (wag ? 1 : 0), DOG_INK.T); return; }
      dot(ctx, dog.x + c, dog.y + r, ch === 'E' && blink ? DOG_INK.B : DOG_INK[ch]);
    });
  });
}

// ---------------------------------------------------------------- the layer

export function createNightScene() {
  const canvas = h('canvas', { class: 'nightscene-canvas' });
  const el = h('div', { class: 'nightscene', 'aria-hidden': 'true' }, canvas);
  const ctx = canvas.getContext('2d');
  const still = document.createElement('canvas');
  let scene = null;
  let frame = 0;
  let timer = 0;
  let size = { w: 0, h: 0 };

  function fit() {
    const w = el.clientWidth;
    const hgt = el.clientHeight;
    if (!w || !hgt) return; // not laid out yet; the observer calls again
    const typing = document.activeElement?.matches?.('input, textarea');
    // Phones shrink the window for the keyboard; keep the scene where it was.
    if (scene && w === size.w && (hgt === size.h || typing)) return;
    size = { w, h: hgt };
    const scale = Math.max(3, Math.round(Math.min(w, hgt) / 230));
    const W = Math.ceil(w / scale);
    const H = Math.ceil(hgt / scale);
    canvas.width = still.width = W;
    canvas.height = still.height = H;
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
    scene = layout(W, H);
    drawStill(still.getContext('2d'), scene);
    drawFrame(ctx, still, scene, frame);
  }

  const tick = () => { if (scene) drawFrame(ctx, still, scene, ++frame); };
  const run = () => {
    clearInterval(timer);
    timer = 0;
    if (!document.hidden && !reducedMotion()) timer = setInterval(tick, 1000 / FPS);
  };
  const onResize = debounce(fit, 120);
  const watch = new ResizeObserver(() => (scene ? onResize() : fit()));

  return {
    el,
    start() {
      watch.observe(el);
      run();
      document.addEventListener('visibilitychange', run);
    },
    stop() {
      clearInterval(timer);
      watch.disconnect();
      document.removeEventListener('visibilitychange', run);
    },
  };
}
