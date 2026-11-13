// The void, painted on a canvas like a stippled print: a bright white light
// caged by dark, sinewy strands wrapped round it like a sphere, stippled
// cells between them (bright at their rims, dim in the middle), faint rays
// from the light. The cage turns slowly in 3D. It sits straight on the sky,
// with no patch of night round it.
//
// The cells are a texture built once; the strands are drawn fresh each frame
// from a handful of rings on a sphere, as smooth curves. It is painted at the
// screen's own sharpness (up to SHARP pixels a point), and its dots are laid
// evenly and sized for the screen, like a stippled print (DESIGN.md, "Print: the void"). Opening the void widens the light
// until it holds the add box, burning through the strands behind it.

import { DUR, h, reducedMotion, seeded } from './util.js';
import { TEX, drawStipple, shellPixels, tileSize } from './voidmake.js';

const SHARP = 2;       // pixels a point, at most
// The print's dots, in points: how far apart they sit, and their smallest and largest radius.
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
const BIG = 260;  // a cage wider than this (sign-in's) turns far enough between pictures to be redrawn every one
const LILAC = '236, 231, 247';
const white = (a) => `rgba(255, 255, 255, ${a})`;
const INK = '#0c0911';
const INK_RGB = [12, 9, 17];

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

// Faint rays from the light: [angle, width] pairs.
const RAYS = (() => {
  const rand = seeded('rays');
  return Array.from({ length: 18 }, (_, i) => [((i + rand() * 0.7) / 18) * TAU, 0.03 + rand() * 0.06]);
})();

// The cells and the dot tile are slow to work out, so a worker does it and the page never waits
// (voidmake.js, void-worker.js). Until they are in, a void draws nothing; then it fades in. Worked
// out once and kept: every void on every page shares them.
let shellTex = null;
let tile = null;
let tileFor = 0;   // the sharpness the tile was made for
const waiting = new Set();   // voids to draw once the pictures are in
let worker;
let asked = { shell: false, tile: 0 };
const canvasOf = (size) => Object.assign(document.createElement('canvas'), { width: size, height: size });
function takeShell({ cells, body }) {
  const put = (pixels) => { const c = canvasOf(TEX); c.getContext('2d').putImageData(new ImageData(pixels, TEX, TEX), 0, 0); return c; };
  shellTex = { cells: put(cells), body: put(body) };
}
function tileHere(dpr) {
  const c = canvasOf(tileSize(dpr));
  drawStipple(c.getContext('2d'), dpr);
  return c;
}
function landed() { if (shellTex && tile) for (const draw of [...waiting]) draw(); }
function prepare(dpr) {
  if (worker === undefined) {
    try {
      worker = new Worker(new URL(`./void-worker.js${new URL(import.meta.url).search}`, import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (data.cells) takeShell(data);
        else if (data.dpr === asked.tile) { tile = data.failed ? tileHere(data.dpr) : data.bitmap; tileFor = data.dpr; }
        landed();
      };
      // No workers of this kind here: work it out on the page, as before.
      worker.onerror = () => { worker = null; asked = { shell: false, tile: 0 }; for (const again of [...waiting]) again(true); };
    } catch { worker = null; }
  }
  if (!worker) {
    if (!shellTex) takeShell(shellPixels());
    if (tileFor !== dpr) { tile = tileHere(dpr); tileFor = dpr; }
    return;
  }
  if (!shellTex && !asked.shell) { asked.shell = true; worker.postMessage({ shell: true }); }
  if (tileFor !== dpr && asked.tile !== dpr) { asked.tile = dpr; worker.postMessage({ tile: dpr }); }
}

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
  // Each strand's thickness along it (in light radii), before it turns:
  // it wanders, gaps open in it, and it flares where it meets another.
  ring.thick = ring.pts.map((_, i) => {
    const t = i / STEPS;
    const f = ring.flare[i];
    const taper = Math.max(smooth(clamp((ring.gaps(t) - 0.22) / 0.2)), f);
    return ring.w * (0.2 + 1.4 * ring.width(t) ** 1.5 + 1.3 * f) * taper;
  });
}

// ---------------------------------------------------------------- the painter

// The sign-in page shapes it a little differently when open: openMin is the
// light's least width (in radii), openCage how far the cage stands off the
// open light, and haloReach keeps the light's stippled glow inside the cage
// (0 lets it spread, as in a galaxy).
export function voidArt({ openMin = 2.2, openCage = 1.32, haloReach = 0 } = {}) {
  // The void is a stack of canvases, one on top of the other inside `el`, and the browser lays
  // them over each other itself. Each layer of light is drawn on its own canvas and stippled
  // there; NOTHING IS EVER COPIED FROM ONE CANVAS ONTO ANOTHER. It used to be: six copies a
  // picture, and Safari pays for the whole of a canvas each time it is copied from, which held
  // the void to 13 to 27 pictures a second there and made its strands jump (session 8).
  // Bottom to top. A canvas is only as big as what is drawn on it: the ball's square, or for the
  // halo and the core (which reach far past the ball when the void is open) the whole of `box`.
  const el = h('div', { class: 'void-art', 'aria-hidden': 'true' });
  const STAGES = ['body', 'cells', 'rims', 'halo', 'core', 'behind', 'front'];
  const stage = {};
  for (const name of STAGES) {
    const c = document.createElement('canvas');
    el.append(c);
    stage[name] = { c, g: c.getContext('2d'), far: name === 'halo' || name === 'core', at: '' };
  }
  // The layer being drawn on. Three names, because the drawing below was written for three
  // canvases: `ctx` for the body, the light and its hairlines; `lctx` for a layer of light;
  // `ictx` for the strands.
  let ctx = stage.body.g;
  let lctx = stage.cells.g;
  let ictx = stage.behind.g;
  // A layer's canvas grows to hold what it is asked for (in steps, so it is not remade every
  // picture) and is let go again when it is far bigger than needed (the halo's, once closed).
  const fit = (c, w, h) => {
    if (c.width >= w && c.height >= h && c.width * c.height <= w * h * 3 + 65536) return;
    c.width = Math.ceil(w / 128) * 128;
    c.height = Math.ceil(h / 128) * 128;
  };
  let stipple = null;
  let speckle = null;
  let shown = false;
  let madeFor = null;
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
  let gone = false;
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
  // ... and it rests while the screen is changing (a page change sets data-vt): the browser is
  // showing pictures of both pages then, and every redraw under them is paid for twice over.
  watch.observe(root, { attributes: true, attributeFilter: ['data-motion', 'data-vt'] });

  function openness(now) {
    const t = clamp((now - open.start) / open.dur);
    open.o = lerp(open.from, open.to, open.to > open.from ? easeOut(t) : easeInOut(t));
    return t;
  }
  const wideR = (now) => Math.max(openR(now), R * openMin);

  // Where each strand runs this frame: the rings turned and laid flat. The
  // points are kept and moved, not made anew each frame.
  const turned = RINGS.map((ring) => ring.pts.map(() => ({ x: 0, y: 0, z: 0, w: 0 })));
  function cage(S) {
    const yaw = spin;
    const tilt = 0.32 + Math.sin(spin * 0.37) * 0.06;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    RINGS.forEach((ring, r) => {
      const out = turned[r];
      for (let i = 0; i <= STEPS; i++) {
        const [x0, y0, z0] = ring.pts[i];
        // Turn about the upright axis, then lean towards us.
        const x = x0 * cy + z0 * sy;
        const z1 = -x0 * sy + z0 * cy;
        const y = y0 * ct - z1 * st;
        const z = y0 * st + z1 * ct;
        const p = out[i];
        p.x = x * S;
        p.y = y * S;
        p.z = z;
        p.w = R * ring.thick[i] * (0.75 + 0.3 * z);
      }
    });
    return turned;
  }
  // Runs of a strand's points (all, or only those in front or behind). A strand passes from
  // the front of the ball to the back at the ball's edge, between two of its points: the run is
  // cut exactly there (a point worked out where the strand's depth is nothing), not at the
  // nearest point. Cut at the points themselves, the black in front and the grey behind changed
  // over a whole piece at a time, and jumped along the edges as the cage turned (session 8).
  function runs(pts, keep, each) {
    let run = [];
    let before = null;
    let had = false;
    const edge = (a, b) => {
      const t = a.z / (a.z - b.z);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: 0, w: a.w + (b.w - a.w) * t };
    };
    for (const p of pts) {
      const thick = p.w > 0.15;
      const has = thick && keep(p);
      // the same strand, thick on both sides, and only its side of the ball has changed
      const crossed = before && thick && before.w > 0.15 && has !== had && (before.z > 0) !== (p.z > 0);
      if (has) {
        if (crossed) run.push(edge(before, p));
        run.push(p);
      } else {
        if (crossed && run.length) run.push(edge(before, p));
        if (run.length > 1) each(run);
        run = [];
      }
      before = p;
      had = has;
    }
    if (run.length > 1) each(run);
  }
  // The strands, the half behind the light or the half in front, speckled
  // with the stipple so they read as ink.
  function strands(rings, front, alpha, box) {
    const [bx, by, bw, bh] = box;
    ictx.setTransform(dpr, 0, 0, dpr, (W / 2) * dpr - bx, (H / 2) * dpr - by);
    ictx.fillStyle = INK;
    for (const pts of rings) runs(pts, (p) => (p.z > 0) === front, (run) => ribbon(ictx, run, 1));
    if (!speckle) speckle = ictx.createPattern(tile, 'repeat');
    // the dots keep their places on the picture, wherever the layer's corner is
    ictx.setTransform(1, 0, 0, 1, -bx, -by);
    ictx.globalCompositeOperation = 'destination-out';
    ictx.globalAlpha = 0.3;
    ictx.fillStyle = speckle;
    ictx.fillRect(bx, by, bw, bh);
    // fainter behind the light: the whole layer thinned to that strength
    if (alpha < 1) {
      ictx.globalAlpha = 1 - alpha;
      ictx.fillStyle = INK;
      ictx.fillRect(bx, by, bw, bh);
    }
    ictx.globalAlpha = 1;
    ictx.globalCompositeOperation = 'source-over';
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
      g.addColorStop(0, white(0.8));
      g.addColorStop(rc / L, white(0.5));
      g.addColorStop(1, white(0));
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
    // One smooth outline: a curve through the middles of the pieces, so a big
    // void's strands have no corners.
    const side = (list) => {
      for (let i = 1; i < list.length - 1; i++) c.quadraticCurveTo(list[i][0], list[i][1], (list[i][0] + list[i + 1][0]) / 2, (list[i][1] + list[i + 1][1]) / 2);
      c.lineTo(list[list.length - 1][0], list[list.length - 1][1]);
    };
    right.reverse();
    c.beginPath();
    c.moveTo(left[0][0], left[0][1]);
    side(left);
    c.lineTo(right[0][0], right[0][1]);
    side(right);
    c.closePath();
    c.fill();
  }
  // The light catches the near strands: a hairline along each, on the side
  // toward the light, brightest beside it and gone by the edge of the cage.
  function edges(rings, rc, S) {
    const fade = ctx.createRadialGradient(0, 0, rc * 0.9, 0, 0, S * 0.92);
    fade.addColorStop(0, white(0.75));
    fade.addColorStop(0.5, white(0.28));
    fade.addColorStop(1, white(0));
    ctx.strokeStyle = fade;
    ctx.lineWidth = 0.6;
    const near = (p) => {
      const d = Math.hypot(p.x, p.y) || 1;
      return [p.x - (p.x / d) * p.w * 0.36, p.y - (p.y / d) * p.w * 0.36];
    };
    for (const pts of rings) {
      runs(pts, (p) => p.z > 0, (run) => {
        ctx.beginPath();
        ctx.moveTo(...near(run[0]));
        for (let i = 1; i < run.length - 1; i++) {
          const a = near(run[i]);
          const b = near(run[i + 1]);
          ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        }
        ctx.stroke();
      });
    }
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

  // The square of half-side `half` (CSS pixels) round the middle, in the picture's own pixels.
  const boxOf = (half) => {
    const x0 = Math.max(0, Math.floor((W / 2 - half) * dpr));
    const y0 = Math.max(0, Math.floor((H / 2 - half) * dpr));
    return [x0, y0, Math.min(Math.round(W * dpr), Math.ceil((W / 2 + half) * dpr)) - x0, Math.min(Math.round(H * dpr), Math.ceil((H / 2 + half) * dpr)) - y0];
  };
  function draw(now) {
    if (!W || !shellTex || !tile) return;
    // patterns belong to one tile: made again when a new one comes in (another screen's sharpness)
    if (madeFor !== tile) { stipple = null; speckle = null; madeFor = tile; }
    if (!shown) { shown = true; el.classList.add('is-in'); }
    openness(now);
    const o = open.o;
    const g = clamp((now - gulpAt) / 700);
    const gulp = g < 1 ? Math.sin(Math.PI * g) : 0;
    const rc = lerp(R * 0.9, wideR(now), o) * (1 - gulp * 0.08) * (1 + hunger * 0.05);
    const S = Math.max(R * CAGE, rc * openCage) * (1 + hunger * 0.03);
    const glow = (reach) => (haloReach ? Math.max(rc * 1.05, Math.min(rc * reach, S * haloReach)) : rc * reach);
    // Only the square round the ball is drawn: `box` holds everything (the halo reaches
    // furthest), `ball` the cells, rims, rays, strands and the light. Closed, the two are the same.
    const half = Math.max(S * 1.12, rc * 2.6);
    const box = boxOf(half);
    const ball = boxOf(Math.min(half, S * 1.25));
    // the far layers are sized for where the light is heading, so they are made once as the void opens
    const rEnd = open.to ? Math.max(wide.to || 0, R * openMin, rc) : rc;
    const ahead = open.to ? boxOf(Math.max(Math.max(R * CAGE, rEnd * openCage) * 1.12, rEnd * 2.6)) : box;
    // Take a layer: sized, put where its square is, wiped, and ready to draw on round the middle.
    const take = (name) => {
      const st = stage[name];
      const b = st.far ? box : ball;
      fit(st.c, st.far ? Math.max(b[2], ahead[2]) : b[2], st.far ? Math.max(b[3], ahead[3]) : b[3]);
      const at = `${b[0]},${b[1]},${st.c.width},${st.c.height},${dpr}`;
      if (at !== st.at) {
        st.at = at;
        Object.assign(st.c.style, { left: `${b[0] / dpr}px`, top: `${b[1] / dpr}px`, width: `${st.c.width / dpr}px`, height: `${st.c.height / dpr}px` });
      }
      const g = st.g;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.clearRect(0, 0, st.c.width, st.c.height);
      g.setTransform(dpr, 0, 0, dpr, (W / 2) * dpr - b[0], (H / 2) * dpr - b[1]);
      return g;
    };
    const centre = (g, b) => g.setTransform(dpr, 0, 0, dpr, (W / 2) * dpr - b[0], (H / 2) * dpr - b[1]);

    // The ball's dark body, then four layers of stipple: the cells, the rims and rays, the
    // light's glow, its core. Each layer adds its own dots, so the brighter a place is, the more
    // densely it's dotted, like a print.
    ctx = take('body');
    ctx.rotate(spin * 0.25);
    ctx.globalAlpha = 0.72;
    ctx.drawImage(shellTex.body, -S, -S, S * 2, S * 2);
    ctx.globalAlpha = 1;
    const rings = cage(S);
    if (!stipple) stipple = ctx.createPattern(tile, 'repeat');
    // One layer of light: painted on its own canvas, then the dots punched through it.
    const pass = (name, shift, paint) => {
      const [bx, by, bw, bh] = stage[name].far ? box : ball;
      lctx = take(name);
      paint();
      // the dots keep their places on the picture, wherever the layer's corner is
      lctx.setTransform(1, 0, 0, 1, shift[0] - bx, shift[1] - by);
      lctx.globalCompositeOperation = 'destination-out';
      lctx.globalAlpha = 1;
      lctx.fillStyle = stipple;
      lctx.fillRect(bx - shift[0], by - shift[1], bw, bh);
      lctx.globalCompositeOperation = 'source-over';
    };
    pass('cells', [0, 0], () => {
      lctx.rotate(spin * 0.25);
      lctx.globalAlpha = 0.95;
      lctx.drawImage(shellTex.cells, -S, -S, S * 2, S * 2);
    });
    pass('rims', [97, 53], () => {
      rims(rings);
      rays(rc, S);
    });
    pass('halo', [41, 171], () => {
      const halo = lctx.createRadialGradient(0, 0, rc * 0.85, 0, 0, glow(2.6));
      halo.addColorStop(0, white(1));
      halo.addColorStop(0.35, white(1));
      halo.addColorStop(0.65, `rgba(${LILAC}, 0.55)`);
      halo.addColorStop(1, `rgba(${LILAC}, 0)`);
      lctx.fillStyle = halo;
      lctx.beginPath();
      lctx.arc(0, 0, glow(2.6), 0, TAU);
      lctx.fill();
      rays(rc, S * 0.8);
    });
    pass('core', [173, 89], () => {
      const core = lctx.createRadialGradient(0, 0, rc * 0.9, 0, 0, glow(1.8));
      core.addColorStop(0, white(1));
      core.addColorStop(1, white(0));
      lctx.fillStyle = core;
      lctx.beginPath();
      lctx.arc(0, 0, glow(1.8), 0, TAU);
      lctx.fill();
    });

    // Strands behind with the light over them, then the strands in front with their hairlines.
    ictx = take('behind');
    strands(rings, false, 0.45, ball);
    ctx = ictx;
    centre(ctx, ball);
    light(rc, 1);
    ictx = take('front');
    strands(rings, true, 1, ball);
    ctx = ictx;
    centre(ctx, ball);
    edges(rings, rc, S);

    // Open, the light burns through the strands behind the box.
    if (o > 0.01) light(rc, smooth(o));
  }

  function step(now) {
    frame = running ? requestAnimationFrame(step) : 0;
    // At rest it turns by a fraction of a pixel a frame, so about 30 pictures
    // a second look the same as 60 for half the work, like the sky and the
    // planets. Opening, closing, hungry or gulping, it's drawn every frame.
    const settling = openness(now) < 1 || now - wide.start < 450 || hungry || hunger > 0.001 || now - gulpAt < 700;
    if (!settling && R * CAGE < BIG && last && now - last < 32) return;
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
  }

  function sync() {
    const go = wanted && onScreen && !document.hidden && !reducedMotion() && !root.dataset.vt;
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
      // Held still (zooming out, say), it shows where it was heading rather
      // than freezing halfway through opening or closing.
      open.start = -1e9;
      wide.start = -1e9;
      gulpAt = -1e9;
      hunger = hungry ? 1 : 0;
      draw(performance.now());
    }
  }
  const seen = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); });
  seen.observe(el);
  // Drawn as soon as the cells and dots are in (and again if the worker could not make them).
  const land = (again) => { if (again && W) prepare(dpr); draw(performance.now()); };
  waiting.add(land);
  document.addEventListener('visibilitychange', sync);

  return {
    el,
    // A still picture of it as it stands: the square of half-side r (CSS pixels) round its middle,
    // drawn to fill `target` (a canvas). The one place its layers are copied, and only when asked.
    copyTo(target, r) {
      const g = target.getContext('2d');
      const k = target.width / (2 * r);
      for (const name of STAGES) {
        const { c } = stage[name];
        if (!c.width || !c.style.width) continue;
        g.drawImage(c, (parseFloat(c.style.left) - (W / 2 - r)) * k, (parseFloat(c.style.top) - (H / 2 - r)) * k, parseFloat(c.style.width) * k, parseFloat(c.style.height) * k);
      }
    },
    // Size the light (radius r) and the canvas round it (w × h CSS pixels).
    resize(r, w, hgt) {
      const same = r === R && Math.round(w) === W && Math.round(hgt) === H;
      R = r;
      W = Math.round(w);
      H = Math.round(hgt);
      dpr = Math.min(devicePixelRatio || 1, SHARP);
      prepare(dpr);
      if (!same || !el.style.width) {
        el.style.width = `${W}px`;
        el.style.height = `${H}px`;
        // The layers' canvases are made now, for the closed void, while the page is still being
        // put together: making them is slow, and the first picture should only have to draw.
        const closed = boxOf(R * CAGE * 1.12);
        for (const name of STAGES) fit(stage[name].c, closed[2], closed[3]);
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
      open.dur = Math.max(1, to ? DUR.scene : DUR.arrive);
      draw(now);
    },
    // Its pictures are in and it has been drawn (a picture of it taken before then would be empty).
    ready: () => shown,
    radius() {
      const now = performance.now();
      openness(now);
      return lerp(R * 0.9, wideR(now), open.o);
    },
    hungry(on) { hungry = on; if (!running) { hunger = on ? 1 : 0; draw(performance.now()); } },
    gulp() { gulpAt = performance.now(); },
    // Once its page has gone it stays asleep: nothing is left to stop it.
    play() { if (!gone) { wanted = true; sync(); } },
    pause() { wanted = false; sync(); },
    destroy() {
      gone = true;
      wanted = false;
      sync();
      waiting.delete(land);
      watch.disconnect();
      seen.disconnect();
      document.removeEventListener('visibilitychange', sync);
    },
  };
}
