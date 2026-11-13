// The void's slow sums, with no page needed: its cells (a picture worked out point by point) and
// the tile of evenly laid dots that everything is stippled through. They run in a worker
// (void-worker.js) so the page never waits for them; voidart.js falls back to running them itself.
// Nothing here may touch the page or import util.js (which reads the page as it loads).

export const TEX = 768;
export const DOT = { gap: 1.12, small: 0.26, large: 0.64, tile: 192 };
const TAU = Math.PI * 2;
const LILAC = [236, 231, 247];
const INK_RGB = [12, 9, 17];
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// The same as util.js's.
function seeded(text) {
  let seed = 2166136261;
  for (let i = 0; i < text.length; i++) seed = Math.imul(seed ^ text.charCodeAt(i), 16777619);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

// ---------------------------------------------------------------- the cells

// The cells: a sphere shell of pale dust, dim in the middle and bright at
// the rim, lumpy, with a scalloped outline. The body is the same shape in
// ink, so the ball stays dark inside without a halo round it.
export function shellPixels() {
  const n = noise('lobes');
  const img = { data: new Uint8ClampedArray(TEX * TEX * 4) };
  const ink = { data: new Uint8ClampedArray(TEX * TEX * 4) };
  const half = TEX / 2;
  const [lr, lg, lb] = LILAC;
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
  return { cells: img.data, body: ink.data };
}

// Evenly spaced points on a tile that repeats (Bridson's method, wrapped round
// its edges): no clumps and no bald patches, as a hand stipples a print.
function evenPoints(size, gap, rand) {
  const cell = gap / Math.SQRT2;
  const n = Math.ceil(size / cell);
  const grid = new Int32Array(n * n).fill(-1);
  const pts = [];
  const active = [];
  const put = (x, y) => {
    grid[(Math.floor(y / cell) % n) * n + (Math.floor(x / cell) % n)] = pts.length;
    active.push(pts.length);
    pts.push([x, y]);
  };
  const free = (x, y) => {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    for (let j = -2; j <= 2; j++) {
      for (let i = -2; i <= 2; i++) {
        const k = grid[((gy + j + n) % n) * n + ((gx + i + n) % n)];
        if (k < 0) continue;
        let dx = Math.abs(pts[k][0] - x);
        let dy = Math.abs(pts[k][1] - y);
        if (dx > size / 2) dx = size - dx;
        if (dy > size / 2) dy = size - dy;
        if (dx * dx + dy * dy < gap * gap) return false;
      }
    }
    return true;
  };
  put(rand() * size, rand() * size);
  while (active.length) {
    const pick = Math.floor(rand() * active.length);
    const [px, py] = pts[active[pick]];
    let found = false;
    for (let tries = 0; tries < 12 && !found; tries++) {
      const a = rand() * TAU;
      const d = gap * (1 + rand());
      const x = (px + Math.cos(a) * d + size) % size;
      const y = (py + Math.sin(a) * d + size) % size;
      if (free(x, y)) { put(x, y); found = true; }
    }
    if (!found) { active[pick] = active[active.length - 1]; active.pop(); }
  }
  return pts;
}

// Stipple: punched through whatever is drawn under it, it clears all but
// round dots of mixed sizes, so soft light breaks up like a print. The tile
// is made for the screen's sharpness, so a dot is the same size on every
// sharp screen and crisp on all of them. On a plain screen (under 1.5 pixels
// a point) the dots are drawn larger and further apart, or they would be
// smaller than a pixel and blur into grey.
export const tileSize = (dpr) => Math.round(DOT.tile * dpr);
// Draws the tile on `ctx`, a 2D canvas of tileSize(dpr) each way (the page's own, or a worker's).
export function drawStipple(ctx, dpr) {
  const size = tileSize(dpr);
  const k = size / DOT.tile;
  const grow = Math.max(1, 1.5 / dpr);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.93)';
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  const rand = seeded('stipple');
  for (const [px, py] of evenPoints(DOT.tile, DOT.gap * grow, rand)) {
    const x = px * k;
    const y = py * k;
    const r = (DOT.small + rand() ** 2 * (DOT.large - DOT.small)) * k * grow;
    // Drawn again across each edge, so the tile repeats without seams.
    for (const ox of [0, -size, size]) {
      for (const oy of [0, -size, size]) {
        if ((ox && Math.abs(x + ox - size / 2) > size / 2 + 3) || (oy && Math.abs(y + oy - size / 2) > size / 2 + 3)) continue;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, TAU);
        ctx.fill();
      }
    }
  }
}

