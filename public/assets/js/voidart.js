// The void, painted on a canvas like a stippled print: a bright white light
// caged by dark, sinewy strands wrapped round it like a sphere, stippled
// cells between them (bright at their rims, dim in the middle), faint rays
// from the light. The cage turns slowly in 3D. It sits straight on the sky,
// with no patch of night round it.
//
// The cells are a texture built once; the strands are drawn fresh each frame
// from a handful of rings on a sphere. Opening the void widens the light
// until it holds the add box, burning through the strands behind it.

import { h, reducedMotion, seeded } from './util.js';

const TEX = 480;
const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// How big the light is for a page this size (its radius, in CSS pixels).
export function voidRadius(width, viewH) {
  const narrow = width < 640;
  return Math.round(clamp(Math.min(viewH * 0.095, width * (narrow ? 0.12 : 0.08)), narrow ? 40 : 50, 92));
}
// How far out the cage reaches, in multiples of that radius.
export const REACH = { x: 3.1, y: 3.3 };
const CAGE = 2.5; // the sphere the strands wrap, in multiples of the radius
const LILAC = '236, 231, 247';
const INK = '#0c0911';
const INK_RGB = [12, 9, 17];

// ---------------------------------------------------------------- noise

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
    return lerp(lerp(at(xi, yi, period), at(xi + 1, yi, period), fx), lerp(at(xi, yi + 1, period), at(xi + 1, yi + 1, period), fx), fy);
  };
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

// Smooth wandering along a loop (t in 0..1), for a strand's width.
function wander(seed, cells) {
  const rand = seeded(seed);
  const v = Array.from({ length: cells }, () => rand());
  return (t) => {
    const x = (((t % 1) + 1) % 1) * cells;
    const i = Math.floor(x);
    return lerp(v[i], v[(i + 1) % cells], smooth(x - i));
  };
}

// ---------------------------------------------------------------- textures

// The cells: a sphere shell of pale dust, dim in the middle and bright at
// the rim, lumpy, with a scalloped outline. The body is the same shape in
// ink, so the ball stays dark inside without a halo round it.
function shell() {
  const n = noise('lobes');
  const make = () => {
    const c = document.createElement('canvas');
    c.width = TEX;
    c.height = TEX;
    return c;
  };
  const canvas = make();
  const body = make();
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(TEX, TEX);
  const ink = ctx.createImageData(TEX, TEX);
  const half = TEX / 2;
  const [lr, lg, lb] = LILAC.split(',').map(Number);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const dx = (x + 0.5 - half) / half;
      const dy = (y + 0.5 - half) / half;
      const r = Math.hypot(dx, dy);
      if (r >= 1) continue;
      const a = (Math.atan2(dy, dx) / TAU + 1) % 1;
      const edge = 0.86 + 0.13 * n(a * 6, 2.3, 6, 2);
      if (r >= edge) continue;
      const k = r / edge;
      const lump = n(a * 9, r * 6, 9);
      const rim = smooth(clamp((edge - r) / 0.025));
      let d = 0.16 + 0.9 * k ** 7 + 0.35 * Math.exp(-((k / 0.42) ** 2));
      d *= 0.55 + 0.9 * lump;
      const i = (y * TEX + x) * 4;
      img.data[i] = lr;
      img.data[i + 1] = lg;
      img.data[i + 2] = lb;
      img.data[i + 3] = clamp(d * rim) * 255;
      ink.data[i] = INK_RGB[0];
      ink.data[i + 1] = INK_RGB[1];
      ink.data[i + 2] = INK_RGB[2];
      ink.data[i + 3] = smooth(clamp((edge - r) / 0.06)) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  body.getContext('2d').putImageData(ink, 0, 0);
  return { cells: canvas, body };
}

// Stipple: punched through whatever is drawn under it, it clears all but
// round dots of mixed sizes, so soft light breaks up like a print.
function stippleTile() {
  const size = 240;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.93)';
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  const rand = seeded('stipple');
  for (let i = 0; i < size * size * 0.17; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.45 + rand() ** 2 * 0.85;
    // Drawn again across each edge, so the tile repeats without seams.
    for (const ox of [0, -size, size]) {
      for (const oy of [0, -size, size]) {
        if ((ox && Math.abs(x + ox - size / 2) > size / 2 + 2) || (oy && Math.abs(y + oy - size / 2) > size / 2 + 2)) continue;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, TAU);
        ctx.fill();
      }
    }
  }
  return canvas;
}

// Faint rays from the light: [angle, width] pairs.
const RAYS = (() => {
  const rand = seeded('rays');
  return Array.from({ length: 18 }, (_, i) => [((i + rand() * 0.7) / 18) * TAU, 0.03 + rand() * 0.06]);
})();

let shellTex = null;
let tile = null;

// ---------------------------------------------------------------- the cage

// Rings on a unit sphere: a normal, how far the ring sits off the centre
// (0 is a great circle), and how thick its strand is (in light radii).
const RINGS = [
  { n: [0.2, 1, 0.15], d: 0, w: 0.26 },
  { n: [1, 0.25, -0.45], d: 0, w: 0.22 },
  { n: [-0.6, 0.55, 0.8], d: 0, w: 0.2 },
  { n: [0.75, -0.6, 0.5], d: 0, w: 0.17 },
  { n: [0.1, 0.35, -1], d: 0, w: 0.15 },
  { n: [0.9, 0.9, 0.2], d: 0.55, w: 0.12 },
  { n: [-0.8, 0.2, -0.5], d: 0.62, w: 0.11 },
  { n: [0.3, -1, -0.35], d: 0.48, w: 0.1 },
].map((ring, i) => {
  const len = Math.hypot(...ring.n);
  const nv = ring.n.map((v) => v / len);
  // Two directions across the ring.
  const helper = Math.abs(nv[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const u = norm(cross(nv, helper));
  const v = cross(nv, u);
  return {
    ...ring, nv, u, v,
    rc: Math.sqrt(1 - ring.d * ring.d),
    width: wander(`strand:${i}`, 9),
    gaps: wander(`gap:${i}`, 5),
  };
});
const STEPS = 120;

// Where strands meet on the sphere, they flare into each other like webbed
// sinew. The rings never change shape, only turn, so this is worked out once.
const at = (ring, t) => {
  const c = Math.cos(t * TAU);
  const s = Math.sin(t * TAU);
  return [0, 1, 2].map((k) => ring.nv[k] * ring.d + ring.rc * (c * ring.u[k] + s * ring.v[k]));
};
for (const ring of RINGS) ring.pts = Array.from({ length: STEPS + 1 }, (_, i) => at(ring, i / STEPS));
for (const ring of RINGS) {
  ring.flare = ring.pts.map((p) => {
    let near = Infinity;
    for (const other of RINGS) {
      if (other === ring) continue;
      for (const q of other.pts) near = Math.min(near, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2);
    }
    return Math.max(0, 1 - Math.sqrt(near) / 0.24) ** 2;
  });
}

// ---------------------------------------------------------------- the painter

export function voidArt() {
  const canvas = h('canvas', { class: 'void-art', 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d');
  // The cells, rays and the light's halo are drawn here first, then stippled.
  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d');
  // The strands, so they can be speckled like ink before they go down.
  const ink = document.createElement('canvas');
  const ictx = ink.getContext('2d');
  let stipple = null;
  let speckle = null;
  const root = document.documentElement;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let R = 80; // the light's radius, closed
  // The light's radius when open (fits the add box), easing when the box changes size.
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

  // The motion setting can change while it's on screen.
  const watch = new MutationObserver(() => sync());
  watch.observe(root, { attributes: true, attributeFilter: ['data-motion'] });

  function openness(now) {
    const t = clamp((now - open.start) / open.dur);
    open.o = lerp(open.from, open.to, open.to > open.from ? easeOut(t) : easeInOut(t));
    return t;
  }
  const wideR = (now) => Math.max(openR(now), R * 2.2);

  // Where each strand runs this frame: the rings turned and laid flat.
  function cage(S) {
    const yaw = spin;
    const tilt = 0.32 + Math.sin(spin * 0.37) * 0.06;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    return RINGS.map((ring) => {
      const pts = [];
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const c = Math.cos(t * TAU);
        const s = Math.sin(t * TAU);
        let x = ring.nv[0] * ring.d + ring.rc * (c * ring.u[0] + s * ring.v[0]);
        let y = ring.nv[1] * ring.d + ring.rc * (c * ring.u[1] + s * ring.v[1]);
        let z = ring.nv[2] * ring.d + ring.rc * (c * ring.u[2] + s * ring.v[2]);
        // Turn about the upright axis, then lean towards us.
        [x, z] = [x * cy + z * sy, -x * sy + z * cy];
        [y, z] = [y * ct - z * st, y * st + z * ct];
        const f = ring.flare[i];
        const taper = Math.max(smooth(clamp((ring.gaps(t) - 0.22) / 0.2)), f);
        const w = R * ring.w * (0.2 + 1.4 * ring.width(t) ** 1.5 + 1.3 * f) * taper * (0.75 + 0.3 * z);
        pts.push({ x: x * S, y: y * S, z, w });
      }
      return pts;
    });
  }
  // Runs of a strand's points (all, or only those in front or behind).
  function runs(pts, keep, each) {
    let run = [];
    for (const p of pts) {
      if (p.w > 0.15 && keep(p)) run.push(p);
      else {
        if (run.length > 1) each(run);
        run = [];
      }
    }
    if (run.length > 1) each(run);
  }
  // The strands, the half behind the light or the half in front, speckled
  // with the stipple so they read as ink.
  function strands(rings, front, alpha, box) {
    ictx.setTransform(1, 0, 0, 1, 0, 0);
    ictx.globalCompositeOperation = 'source-over';
    ictx.clearRect(...box);
    ictx.setTransform(dpr, 0, 0, dpr, (W / 2) * dpr, (H / 2) * dpr);
    ictx.fillStyle = INK;
    for (const pts of rings) runs(pts, (p) => (p.z > 0) === front, (run) => ribbon(ictx, run, 1));
    if (!speckle) speckle = ictx.createPattern(tile, 'repeat');
    ictx.setTransform(1, 0, 0, 1, 0, 0);
    ictx.globalCompositeOperation = 'destination-out';
    ictx.globalAlpha = 0.3;
    ictx.fillStyle = speckle;
    ictx.fillRect(...box);
    ictx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.drawImage(ink, ...box, ...box);
    ctx.globalAlpha = 1;
  }
  // Light catches the cells' edges along every strand, so each cell is
  // bright at its rim and dim in the middle.
  function rims(rings) {
    lctx.fillStyle = '#fff';
    for (const [spread, alpha] of [[3.4, 0.25], [2.4, 0.4], [1.6, 0.7]]) {
      for (const pts of rings) {
        runs(pts, () => true, (run) => {
          lctx.globalAlpha = alpha * (run[run.length >> 1].z > 0 ? 1 : 0.55);
          ribbon(lctx, run, spread);
        });
      }
    }
    lctx.globalAlpha = 1;
  }
  // Faint rays from the light out through the cells.
  function rays(rc, S) {
    const L = S * 1.04;
    const turn = spin * 0.1;
    for (const [angle, width] of RAYS) {
      const a = angle + turn;
      const g = lctx.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
      g.addColorStop(rc / L, 'rgba(255, 255, 255, 0.5)');
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      lctx.fillStyle = g;
      lctx.beginPath();
      lctx.moveTo(0, 0);
      lctx.lineTo(Math.cos(a - width) * L, Math.sin(a - width) * L);
      lctx.lineTo(Math.cos(a + width) * L, Math.sin(a + width) * L);
      lctx.closePath();
      lctx.fill();
    }
  }
  function ribbon(c, run, spread) {
    const left = [];
    const right = [];
    for (let i = 0; i < run.length; i++) {
      const a = run[Math.max(0, i - 1)];
      const b = run[Math.min(run.length - 1, i + 1)];
      const tx = b.x - a.x;
      const ty = b.y - a.y;
      const len = Math.hypot(tx, ty) || 1;
      const nx = -ty / len;
      const ny = tx / len;
      const p = run[i];
      const w = (p.w * spread) / 2;
      left.push([p.x + nx * w, p.y + ny * w]);
      right.push([p.x - nx * w, p.y - ny * w]);
    }
    c.beginPath();
    c.moveTo(left[0][0], left[0][1]);
    for (const [x, y] of left) c.lineTo(x, y);
    for (let i = right.length - 1; i >= 0; i--) c.lineTo(right[i][0], right[i][1]);
    c.closePath();
    c.fill();
  }

  function light(rc, alpha) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rc * 1.08);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.86, '#fdfcff');
    g.addColorStop(0.93, `rgba(${LILAC}, 0.9)`);
    g.addColorStop(1, `rgba(${LILAC}, 0)`);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rc * 1.08, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function draw(now) {
    if (!W || !shellTex) return;
    openness(now);
    const o = open.o;
    const g = clamp((now - gulpAt) / 700);
    const gulp = g < 1 ? Math.sin(Math.PI * g) : 0;
    const rc = lerp(R * 0.9, wideR(now), o) * (1 - gulp * 0.08) * (1 + hunger * 0.05);
    const S = Math.max(R * CAGE, rc * 1.32) * (1 + hunger * 0.03);
    const centre = () => ctx.setTransform(dpr, 0, 0, dpr, (W / 2) * dpr, (H / 2) * dpr);
    // Only the square round the ball needs redrawing on the layers.
    const half = Math.max(S * 1.12, rc * 2.6);
    const x0 = Math.max(0, Math.floor((W / 2 - half) * dpr));
    const y0 = Math.max(0, Math.floor((H / 2 - half) * dpr));
    const box = [x0, y0, Math.min(canvas.width, Math.ceil((W / 2 + half) * dpr)) - x0, Math.min(canvas.height, Math.ceil((H / 2 + half) * dpr)) - y0];

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // The ball's dark body, then three layers of stipple: the cells, then
    // the rims and rays, then the light's glow. Each layer adds its own dots,
    // so the brighter a place is, the more densely it's dotted, like a print.
    centre();
    ctx.save();
    ctx.rotate(spin * 0.25);
    ctx.globalAlpha = 0.72;
    ctx.drawImage(shellTex.body, -S, -S, S * 2, S * 2);
    ctx.restore();
    const rings = cage(S);
    if (!stipple) stipple = lctx.createPattern(tile, 'repeat');
    const pass = (shift, paint) => {
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalCompositeOperation = 'source-over';
      lctx.globalAlpha = 1;
      lctx.clearRect(...box);
      lctx.setTransform(dpr, 0, 0, dpr, (W / 2) * dpr, (H / 2) * dpr);
      paint();
      lctx.setTransform(1, 0, 0, 1, shift[0], shift[1]);
      lctx.globalCompositeOperation = 'destination-out';
      lctx.globalAlpha = 1;
      lctx.fillStyle = stipple;
      lctx.fillRect(box[0] - shift[0], box[1] - shift[1], box[2], box[3]);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(layer, ...box, ...box);
    };
    pass([0, 0], () => {
      lctx.rotate(spin * 0.25);
      lctx.globalAlpha = 0.95;
      lctx.drawImage(shellTex.cells, -S, -S, S * 2, S * 2);
    });
    pass([97, 53], () => {
      rims(rings);
      rays(rc, S);
    });
    pass([41, 171], () => {
      const halo = lctx.createRadialGradient(0, 0, rc * 0.85, 0, 0, rc * 2.6);
      halo.addColorStop(0, 'rgba(255, 255, 255, 1)');
      halo.addColorStop(0.35, 'rgba(255, 255, 255, 1)');
      halo.addColorStop(0.65, `rgba(${LILAC}, 0.55)`);
      halo.addColorStop(1, `rgba(${LILAC}, 0)`);
      lctx.fillStyle = halo;
      lctx.beginPath();
      lctx.arc(0, 0, rc * 2.6, 0, TAU);
      lctx.fill();
      rays(rc, S * 0.8);
    });
    pass([173, 89], () => {
      const core = lctx.createRadialGradient(0, 0, rc * 0.9, 0, 0, rc * 1.8);
      core.addColorStop(0, 'rgba(255, 255, 255, 1)');
      core.addColorStop(1, 'rgba(255, 255, 255, 0)');
      lctx.fillStyle = core;
      lctx.beginPath();
      lctx.arc(0, 0, rc * 1.8, 0, TAU);
      lctx.fill();
    });

    // Strands behind, the light, strands in front.
    strands(rings, false, 0.45, box);
    centre();
    light(rc, 1);
    strands(rings, true, 1, box);
    centre();

    // Open, the light burns through the strands behind the box.
    if (o > 0.01) light(rc, smooth(o));
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
    spin += dt * 0.07 * (1 + sweep * 9 + hunger * 3 + pull * 4) * calm;
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
    // Size the light (radius r) and the canvas round it (w × h CSS pixels).
    resize(r, w, hgt) {
      shellTex ||= shell();
      tile ||= stippleTile();
      const same = r === R && Math.round(w) === W && Math.round(hgt) === H;
      R = r;
      W = Math.round(w);
      H = Math.round(hgt);
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      if (!same || !canvas.width) {
        for (const c of [canvas, layer, ink]) {
          c.width = Math.round(W * dpr);
          c.height = Math.round(H * dpr);
        }
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
      }
      draw(performance.now());
    },
    // Open (1) or closed (0); r is how wide the light should get to hold the box.
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
      return lerp(R * 0.9, wideR(now), open.o);
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
