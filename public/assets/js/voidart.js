// The black hole itself, painted on a canvas like a grainy print rather
// than a render: folds of smoky dust slowly turning round a dark middle with
// a ragged edge, a faint tilted smudge of matter running through it, one thin
// stray arc, and a few small square sparks drifting in. Two tiny embers circle
// each other down in the dark. In light mode it's the same picture printed
// in ink on pale paper, with the middle left pale.
//
// The textures are built once (and again on a theme change); each frame only
// turns them. Opening the void widens the dark, and the dust thins into a
// ring round it.

import { h, reducedMotion, seeded } from './util.js';

const TEX = 480;
const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// How big the dark is for a page this size (its radius, in CSS pixels).
export function voidRadius(width, viewH) {
  const narrow = width < 640;
  return Math.round(clamp(Math.min(viewH * 0.13, width * (narrow ? 0.16 : 0.11)), narrow ? 50 : 64, 120));
}
// How far out the dust reaches, in multiples of that radius.
export const REACH = { x: 3.3, y: 3.8 };
const TALL = REACH.y / REACH.x;

// ---------------------------------------------------------------- textures

// Value noise that wraps round the circle (x repeats every `period` cells).
function noise(seed) {
  const salt = Math.floor(seeded(seed)() * 1e9);
  const at = (x, y, period) => {
    let n = Math.imul(((x % period) + period) % period, 374761393) + Math.imul(y, 668265263) + salt;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const one = (x, y, period) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = smooth(x - xi);
    const fy = smooth(y - yi);
    const a = lerp(at(xi, yi, period), at(xi + 1, yi, period), fx);
    const b = lerp(at(xi, yi + 1, period), at(xi + 1, yi + 1, period), fx);
    return lerp(a, b, fy);
  };
  // A few octaves, still wrapping.
  return (x, y, period, octaves = 3) => {
    let v = 0;
    let amp = 0.5;
    let f = 1;
    let sum = 0;
    for (let o = 0; o < octaves; o++) {
      v += amp * one(x * f, y * f + o * 31, period * f);
      sum += amp;
      amp *= 0.5;
      f *= 2;
    }
    return v / sum;
  };
}

function ramp(stops, v) {
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [p0, c0] = stops[i - 1];
      const [p1, c1] = stops[i];
      const t = clamp((v - p0) / (p1 - p0 || 1));
      return c0.map((c, k) => lerp(c, c1[k], t));
    }
  }
  return stops[stops.length - 1][1];
}

function blank() {
  const canvas = document.createElement('canvas');
  canvas.width = TEX;
  canvas.height = TEX;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx, img: ctx.createImageData(TEX, TEX) };
}

// Smoke round a hole: noise in circular coordinates, folded back on itself
// (domain warping) so it billows, with thin bright creases where the sheets
// of dust fold over, a ragged inner edge, and grain over everything.
function smoke({ seed, inner, ragged = 0.1, peak, outer, twist = 0.5, grain, stops }) {
  const n = noise(seed);
  const { canvas, ctx, img } = blank();
  const half = TEX / 2;
  const speck = seeded(`${seed}:grain`);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const dx = (x + 0.5 - half) / half;
      const dy = (y + 0.5 - half) / half;
      const r = Math.hypot(dx, dy);
      if (r >= outer || r <= inner - ragged) continue;
      const a = (Math.atan2(dy, dx) / TAU + 1) % 1;
      const edge = inner + ragged * (n(a * 7, 3.7, 7, 2) - 0.5) * 2;
      if (r <= edge) continue;
      const body = smooth(clamp((r - edge) / 0.06)) * (r < peak ? 1 : (1 - smooth((r - peak) / (outer - peak))) ** 1.3);
      if (body <= 0.002) continue;
      const s = (a + r * twist) % 1;
      const q = n(s * 5, r * 4, 5);
      const w = n(s * 9 + q * 3, r * 7 + q * 2.5, 9);
      const crease = (1 - Math.abs(2 * w - 1)) ** 3.5;
      const lip = 1 + 1.6 * Math.exp(-(r - edge) / 0.05);
      let v = body * (0.42 * smooth(clamp(w * 1.4 - 0.2)) + 0.6 * crease * lip);
      v *= 1 - grain + grain * 2 * speck();
      const [cr, cg, cb, ca] = ramp(stops, clamp(v));
      const i = (y * TEX + x) * 4;
      img.data[i] = cr;
      img.data[i + 1] = cg;
      img.data[i + 2] = cb;
      img.data[i + 3] = ca * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// A long thin smudge of dust, stippled, tapering at both ends (drawn tilted).
function smudge({ seed, grain, color }) {
  const n = noise(seed);
  const { canvas, ctx, img } = blank();
  const half = TEX / 2;
  const speck = seeded(`${seed}:grain`);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const u = (x + 0.5 - half) / half;
      const v = (y + 0.5 - half) / half;
      const width = 0.16 * (1 - Math.abs(u)) ** 1.6 + 0.012;
      const across = Math.abs(v) / width;
      if (across >= 1) continue;
      let k = (1 - across * across) ** 2 * (1 - Math.abs(u)) ** 0.7;
      k *= 0.55 + 0.6 * n(u * 6 + 10, v * 30, 1000, 3);
      k *= 1 - grain + grain * 2 * speck();
      const i = (y * TEX + x) * 4;
      img.data[i] = color[0];
      img.data[i + 1] = color[1];
      img.data[i + 2] = color[2];
      img.data[i + 3] = clamp(k) * color[3] * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Film grain: a tile of random specks, laid over the dust at screen
// resolution so it stays fine however big the dust is drawn.
function grainTile(strength) {
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rand = seeded('film');
  for (let i = 0; i < size * size; i++) {
    const k = rand();
    img.data[i * 4 + 3] = (k < 0.5 ? k * 2 * strength : strength * (0.35 + 0.65 * (k - 0.5) * 2) * (k > 0.93 ? 1.4 : 0.6)) * 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const LOOKS = {
  dark: {
    haze: 'rgba(96, 80, 132, 0.16)',
    core: ['#020104', 'rgba(2, 1, 4, 0)'],
    arc: 'rgba(206, 196, 228, 0.32)',
    ember: [255, 70, 36],
    sparks: ['#f1e6d4', '#d6cdf0', '#fff6e4'],
    smoke: [[0, [56, 42, 74, 0]], [0.2, [70, 54, 92, 0.5]], [0.5, [116, 96, 144, 0.75]], [0.8, [174, 160, 198, 0.85]], [1, [224, 216, 238, 0.92]]],
    smudge: [196, 186, 220, 0.5],
    grain: 0.15,
    film: 0.6,
  },
  light: {
    haze: 'rgba(30, 32, 48, 0.07)',
    core: ['#f7f6f1', 'rgba(247, 246, 241, 0)'],
    arc: 'rgba(18, 20, 32, 0.45)',
    ember: [18, 20, 32],
    sparks: ['#1b1d2c', '#3a3d52', '#1b1d2c'],
    smoke: [[0, [40, 42, 58, 0]], [0.2, [40, 42, 58, 0.3]], [0.55, [24, 26, 40, 0.62]], [1, [10, 11, 20, 0.92]]],
    smudge: [16, 18, 30, 0.7],
    grain: 0.3,
    film: 0.75,
  },
};

const cache = {};
function textures(mode) {
  if (cache[mode]) return cache[mode];
  const look = LOOKS[mode];
  cache[mode] = {
    look,
    dust: smoke({ seed: 'dust', inner: 0.32, ragged: 0.07, peak: 0.5, outer: 1, twist: 0.6, grain: look.grain, stops: look.smoke }),
    dust2: smoke({ seed: 'dust-far', inner: 0.36, ragged: 0.1, peak: 0.6, outer: 1, twist: -0.4, grain: look.grain, stops: look.smoke }),
    thin: smoke({ seed: 'dust-thin', inner: 0.6, ragged: 0.05, peak: 0.7, outer: 1, twist: 0.4, grain: look.grain, stops: look.smoke }),
    smudge: smudge({ seed: 'smudge', grain: look.grain, color: look.smudge }),
    film: grainTile(look.film),
  };
  return cache[mode];
}

// ---------------------------------------------------------------- the painter

export function voidArt() {
  const canvas = h('canvas', { class: 'void-art', 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d');
  // The dust is drawn here first so the grain only bites into the dust.
  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d');
  let film = null;
  let filmMode = '';
  const root = document.documentElement;
  const rand = seeded('sparks');

  let tex = null;
  let mode = '';
  let W = 0;
  let H = 0;
  let dpr = 1;
  let R = 80; // the dark's radius, closed
  // The dark's radius when open (fits the add box), easing when the box changes size.
  const wide = { from: 0, to: 0, start: 0 };
  const openR = (now) => lerp(wide.from, wide.to, easeOut(clamp((now - wide.start) / 450)));
  let frame = 0;
  let running = false;
  let wanted = false;
  let onScreen = true;
  let last = 0;
  let spin = 0;
  // Opening: o goes 0 → 1, eased, with a burst of speed on the way (the sweep).
  const open = { o: 0, from: 0, to: 0, start: 0, dur: 900 };
  let hunger = 0;
  let hungry = false;
  let gulpAt = -1e9;

  const sparks = Array.from({ length: 10 }, (_, i) => ({
    a: rand() * TAU,
    r: 1.3 + rand() * 2,
    w: 0.35 + rand() * 0.3,
    tone: i % 3,
    phase: rand() * TAU,
  }));

  function theme() {
    const next = root.dataset.mode === 'light' ? 'light' : 'dark';
    if (next === mode) return;
    mode = next;
    tex = textures(mode);
    draw(performance.now());
  }
  // Light/dark and the motion setting can change while it's on screen.
  const watch = new MutationObserver(() => { theme(); sync(); });
  watch.observe(root, { attributes: true, attributeFilter: ['data-mode', 'data-motion'] });

  function openness(now) {
    const t = clamp((now - open.start) / open.dur);
    open.o = lerp(open.from, open.to, open.to > open.from ? easeOut(t) : easeInOut(t));
    return t;
  }
  const wideR = (now) => Math.max(openR(now), R * 2.2);

  function draw(now) {
    if (!W || !tex) return;
    const { look } = tex;
    openness(now);
    const o = open.o;
    const g = clamp((now - gulpAt) / 700);
    const gulp = g < 1 ? Math.sin(Math.PI * g) : 0;
    const r = lerp(R, wideR(now), o) * (1 - gulp * 0.06) * (1 + hunger * 0.04);
    const G = R * (1 + hunger * 0.05) * (1 - gulp * 0.04);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, (W / 2) * dpr, (H / 2) * dpr);

    // Haze: the faintest dust, reaching furthest.
    ctx.save();
    ctx.scale(1, TALL);
    const haze = ctx.createRadialGradient(0, 0, r * 0.9, 0, 0, Math.max(G * REACH.x * 1.2, r * 1.9));
    haze.addColorStop(0, look.haze);
    haze.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(-W, -H, W * 2, H * 2);
    ctx.restore();

    // The tilted smudge of matter running through it, and one stray arc.
    ctx.save();
    ctx.rotate(-0.38);
    ctx.globalAlpha = lerp(1, 0.55, o);
    const S = Math.max(G * 5.2, r * 2.6);
    ctx.drawImage(tex.smudge, -S, -S * 0.5, S * 2, S);
    ctx.restore();
    ctx.save();
    ctx.rotate(spin * 0.15);
    ctx.strokeStyle = look.arc;
    ctx.lineWidth = 1;
    ctx.setLineDash([1.5, 2.5]);
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(G * 3.05, r * 1.75), Math.max(G * 3.05, r * 1.75) * 1.08, 0, 2.2, 3.9);
    ctx.stroke();
    ctx.restore();

    // The dark itself, soft at the edge; the dust's ragged lip covers that.
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.22);
    core.addColorStop(0, look.core[0]);
    core.addColorStop(0.8, look.core[0]);
    core.addColorStop(1, look.core[1]);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.22, 0, TAU);
    ctx.fill();

    // Two tiny embers circling each other down in the dark.
    const fade = 1 - smooth(clamp(o * 1.6));
    if (fade > 0.01) {
      const c = { x: -0.3 * r, y: 0.48 * r };
      for (const k of [0, Math.PI]) {
        const a = spin * 0.9 + k;
        const x = c.x + Math.cos(a) * r * 0.12;
        const y = c.y + Math.sin(a) * r * 0.08;
        const e = Math.max(3, r * 0.055);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, e * 2.2);
        const [er, eg, eb] = look.ember;
        glow.addColorStop(0, `rgba(${er}, ${eg}, ${eb}, 0)`);
        glow.addColorStop(0.3, `rgba(${er}, ${eg}, ${eb}, ${0.95 * fade})`);
        glow.addColorStop(0.55, `rgba(${er}, ${eg}, ${eb}, ${0.35 * fade})`);
        glow.addColorStop(1, `rgba(${er}, ${eg}, ${eb}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, e * 2.2, 0, TAU);
        ctx.fill();
      }
    }

    // Dust: two layers turning at different speeds, a tall oval. Open, it
    // hands over to a thinner ring round the wider dark.
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, layer.width, layer.height);
    lctx.setTransform(dpr, 0, 0, dpr, (W / 2) * dpr, (H / 2) * dpr);
    const dust = (img, D, turn, alpha) => {
      if (alpha <= 0.01) return;
      lctx.save();
      lctx.scale(1, TALL);
      lctx.rotate(turn);
      lctx.globalAlpha = alpha;
      lctx.drawImage(img, -D, -D, D * 2, D * 2);
      lctx.restore();
    };
    const D = G * REACH.x;
    dust(tex.dust2, D * 1.06, spin * 0.6, 0.75 * (1 - o));
    dust(tex.dust, D, spin, 1 - o);
    dust(tex.thin, (r * 1.04) / 0.6, spin * 0.8, o);
    lctx.globalAlpha = 1;
    if (filmMode !== mode) {
      film = lctx.createPattern(tex.film, 'repeat');
      filmMode = mode;
    }
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'destination-out';
    lctx.fillStyle = film;
    lctx.fillRect(0, 0, layer.width, layer.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);

    // Sparks: a few small square specks drifting in.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const size = Math.max(2, Math.round(2 * dpr));
    for (const s of sparks) {
      const d = s.r * G;
      if (d < r * 1.1) continue;
      const x = (W / 2 + Math.cos(s.a) * d) * dpr;
      const y = (H / 2 + Math.sin(s.a) * d * TALL) * dpr;
      const k = smooth(clamp((s.r - r / G - 0.1) / 0.6)) * smooth(clamp((3.4 - s.r) / 0.5));
      const twinkle = 0.6 + 0.4 * Math.sin(now * 0.003 + s.phase);
      ctx.globalAlpha = k * twinkle * (mode === 'light' ? 0.7 : 0.85);
      ctx.fillStyle = look.sparks[s.tone];
      ctx.fillRect(Math.round(x), Math.round(y), size, size);
    }
    ctx.globalAlpha = 1;
  }

  function step(now) {
    frame = 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    const t = openness(now);
    const sweep = t < 1 ? Math.sin(Math.PI * t) : 0;
    hunger += ((hungry ? 1 : 0) - hunger) * Math.min(1, dt * 6);
    const g = clamp((now - gulpAt) / 700);
    const pull = g < 1 ? Math.sin(Math.PI * g) : 0;
    const calm = root.dataset.motion === 'calm' ? 0.35 : 1;
    const boost = 1 + sweep * 9 + hunger * 3 + pull * 4;
    spin += dt * 0.06 * boost * calm;
    const inner = lerp(1, wideR(now) / R, open.o);
    for (const s of sparks) {
      s.a += (dt * s.w * (1 + sweep * 4 + hunger * 2) * calm) / Math.max(1, s.r);
      s.r -= dt * (0.05 + pull * 0.9 + hunger * 0.12) * calm;
      if (s.r < inner * 1.1) {
        s.r = 2.6 + rand() * 0.8;
        s.a = rand() * TAU;
      }
    }
    draw(now);
    if (running) frame = requestAnimationFrame(step);
  }

  function sync() {
    const go = wanted && onScreen && !document.hidden && !reducedMotion();
    if (go === running) {
      if (!go) draw(performance.now());
      return;
    }
    running = go;
    if (go) {
      last = 0;
      frame = requestAnimationFrame(step);
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
      draw(performance.now());
    }
  }
  const seen = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); });
  seen.observe(canvas);
  document.addEventListener('visibilitychange', sync);

  return {
    el: canvas,
    // Size the dark (radius r) and the canvas round it (w × h CSS pixels).
    resize(r, w, hgt) {
      R = r;
      W = Math.round(w);
      H = Math.round(hgt);
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      layer.width = canvas.width;
      layer.height = canvas.height;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      theme();
      draw(performance.now());
    },
    // Open (1) or closed (0); r is how wide the dark should get to hold the box.
    setOpen(to, r) {
      const now = performance.now();
      if (r != null && r !== wide.to) {
        wide.from = open.o > 0.01 ? openR(now) : r;
        wide.to = r;
        wide.start = running ? now : -1e9;
      }
      openness(now);
      // Already there: only the width changes.
      if (to === open.to && open.o === to) { draw(now); return; }
      open.from = open.o;
      open.to = to;
      open.start = running ? now : -1e9;
      open.dur = to ? 900 : 620;
      draw(now);
    },
    radius() {
      const now = performance.now();
      openness(now);
      return lerp(R, wideR(now), open.o);
    },
    hungry(on) { hungry = on; if (!running) { hunger = on ? 1 : 0; draw(performance.now()); } },
    gulp() { gulpAt = performance.now(); },
    play() { wanted = true; sync(); },
    pause() { wanted = false; sync(); },
    destroy() {
      wanted = false;
      sync();
      watch.disconnect();
      seen.disconnect();
      document.removeEventListener('visibilitychange', sync);
    },
  };
}
