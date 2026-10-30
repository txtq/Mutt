// The sky behind every page: a deep blue Vita wash, slow ribbons of light, and a field of stars that twinkle, lean a
// little as you move, bend round the void, and get tugged toward it when it
// eats something. Further out, in the universe, it goes dark and still.

import { h, reducedMotion } from './util.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const smoothstep = (t) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

// The bands' shared picture is 1600 × 1000, cropped to fill the sky.
const VIEW_W = 1600;
const VIEW_H = 1000;
const BANDS = [
  { y: 560, amp: 90, thick: 170, period: 1600, opacity: 0.16, line: 0.5 },
  { y: 640, amp: 120, thick: 120, period: 1300, opacity: 0.12, line: 0.35 },
  { y: 470, amp: 70, thick: 90, period: 1900, opacity: 0.08, line: 0.28 },
];

const svgEl = (tag, attrs) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
};

// One soft band of light: a filled wave with a bright hairline along its
// crest. Each band is its own picture, drawn once and slid sideways, so the
// browser only moves it rather than redrawing the sky every frame.
function ribbon(index, { y, amp, thick, period, opacity, line }) {
  const width = period * Math.ceil((VIEW_W + period) / period); // still covers the view while drifting one period
  const crest = [];
  const trough = [];
  for (let x = 0; x <= width; x += period / 16) {
    const t = (x / period) * Math.PI * 2;
    const top = y + Math.sin(t) * amp + Math.sin(t * 2 + index) * amp * 0.18;
    crest.push([x, top]);
    trough.push([x, top + thick * (0.65 + 0.35 * Math.cos(t + 0.8))]);
  }
  const pts = (list) => list.map(([x, py]) => `${x.toFixed(1)},${py.toFixed(1)}`).join(' L');
  const svg = svgEl('svg', { class: `sky-ribbon sky-ribbon-${index}`, viewBox: `0 0 ${width} ${VIEW_H}`, preserveAspectRatio: 'none' });
  const defs = svgEl('defs', {});
  const grad = svgEl('linearGradient', { id: `sky-band-${index}`, x1: 0, y1: 0, x2: 0, y2: 1 });
  for (const [offset, alpha] of [[0, 0.9], [0.35, 0.35], [1, 0]]) {
    grad.append(svgEl('stop', { offset, 'stop-color': 'var(--ribbon)', 'stop-opacity': alpha }));
  }
  defs.append(grad);
  svg.append(
    defs,
    svgEl('path', { d: `M${pts(crest)} L${pts([...trough].reverse())} Z`, fill: `url(#sky-band-${index})`, opacity }),
    svgEl('path', { d: `M${pts(crest)}`, fill: 'none', stroke: 'var(--ribbon-line)', 'stroke-width': 1.2, opacity: line }),
  );
  // One period is this share of the picture's width.
  svg.style.setProperty('--drift', `${((-100 * period) / width).toFixed(4)}%`);
  return { svg, width };
}

function ribbons() {
  const el = h('div', { class: 'sky-ribbons' });
  const bands = BANDS.map((band, i) => ribbon(i, band));
  el.append(...bands.map((b) => b.svg));
  // Crop and scale them to cover the sky, as one 1600 × 1000 picture would.
  new ResizeObserver(([entry]) => {
    const { width: w, height: hgt } = entry.contentRect;
    const k = Math.max(w / VIEW_W, hgt / VIEW_H);
    for (const { svg, width } of bands) {
      Object.assign(svg.style, {
        left: `${((w - VIEW_W * k) / 2).toFixed(1)}px`,
        top: `${((hgt - VIEW_H * k) / 2).toFixed(1)}px`,
        width: `${(width * k).toFixed(1)}px`,
        height: `${(VIEW_H * k).toFixed(1)}px`,
      });
    }
  }).observe(el);
  return el;
}

let instance = null;
export const theSky = () => instance;

export function createSky() {
  const canvas = h('canvas', { class: 'sky-stars' });
  const el = h('div', { class: 'sky', 'aria-hidden': 'true' },
    h('div', { class: 'sky-wash' }),
    h('div', { class: 'sky-nebula' }),
    ribbons(),
    h('div', { class: 'sky-night' }),
    canvas);
  const ctx = canvas.getContext('2d');
  // Stars sit at fractions of the screen, so a resize (a phone's address
  // bar sliding away) stretches the sky a little instead of reshuffling it.
  // Grouped by colour, so each frame changes colour only three times.
  const pool = [];
  let stars = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  const lean = { x: 0, y: 0, tx: 0, ty: 0 };
  let pulls = [];
  let frame = 0;
  let last = 0;
  let drawnScroll = 0;
  let busy = false;
  let lens = null;
  // How strongly the void bends the sky (0 to 1). It eases in and out, so
  // arriving at or leaving a galaxy doesn't snap the stars into a ring.
  let bend = 0;
  let lastHole = null;
  let night = 0;

  function star() {
    const depth = Math.random();
    const tint = Math.random() < 0.18 ? 'warm' : Math.random() < 0.3 ? 'blue' : 'white';
    return {
      u: Math.random(),
      v: Math.random(),
      r: 0.35 + depth * depth * 1.25,
      depth,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.6,
      tint,
      flare: depth > 0.93,
    };
  }

  function seed() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    width = innerWidth;
    height = innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const count = Math.round(Math.min(340, (width * height) / 5200));
    while (pool.length < count) pool.push(star());
    stars = pool.slice(0, count).sort((a, b) => (a.tint < b.tint ? -1 : a.tint > b.tint ? 1 : 0));
  }

  const COLORS = { white: 'rgb(255,255,255)', warm: 'rgb(255,226,196)', blue: 'rgb(178,214,255)' };

  function draw(time, dt = 32) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    // Eased by time, not by frame, so it feels the same at any frame rate.
    const ease = (ms) => 1 - Math.exp(-dt / ms);
    lean.x += (lean.tx - lean.x) * ease(780);
    lean.y += (lean.ty - lean.y) * ease(780);
    const scroll = scrollY;
    drawnScroll = scroll;
    pulls = pulls.filter((p) => time - p.start < p.duration);
    const want = lens?.() || null;
    if (want) lastHole = want;
    const aim = want ? 1 : 0;
    bend = reducedMotion() ? aim : bend + (aim - bend) * ease(340);
    if (Math.abs(aim - bend) < 0.005) bend = aim;
    const hole = bend ? lastHole : null;
    // Still settling: keep drawing every frame until it has.
    busy = pulls.length > 0 || bend !== aim || Math.abs(lean.tx - lean.x) + Math.abs(lean.ty - lean.y) > 0.002;
    let color = '';
    for (const s of stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(time * 0.001 * s.speed + s.phase);
      let x = s.u * width + lean.x * s.depth * 14;
      let y = s.v * height + lean.y * s.depth * 10 - scroll * (0.02 + s.depth * 0.05);
      y = ((y % height) + height) % height;
      for (const p of pulls) {
        // Ease in toward the pull, then let go.
        const t = (time - p.start) / p.duration;
        const k = Math.sin(Math.PI * t) * p.strength;
        const dx = p.x - x;
        const dy = p.y - y;
        const dist = Math.hypot(dx, dy) || 1;
        const reach = Math.max(0, 1 - dist / p.radius);
        x += (dx / dist) * reach * reach * k * 60;
        y += (dy / dist) * reach * reach * k * 60;
      }
      if (hole) {
        // Gravitational lensing: light from behind the void is bent outward,
        // so the stars crowd into a bright ring round its edge.
        const dx = x - hole.x;
        const dy = y - hole.y;
        const d = Math.hypot(dx, dy) || 0.01;
        // The bend fades out smoothly a little way past the dark, so a big
        // void doesn't shove the whole sky about.
        const e = hole.r * 1.05;
        const reach = hole.r * 3.2;
        if (d < reach) {
          const fade = (1 - smoothstep((d - hole.r * 1.8) / (reach - hole.r * 1.8))) * bend;
          const bent = d + ((d + Math.sqrt(d * d + 4 * e * e)) / 2 - d) * fade;
          x = hole.x + (dx / d) * bent;
          y = hole.y + (dy / d) * bent;
        }
      }
      let alpha = (0.25 + s.depth * 0.75) * twinkle;
      if (night) alpha = Math.min(1, alpha * (1 + night * 0.35));
      if (s.tint !== color) {
        color = s.tint;
        ctx.fillStyle = COLORS[color];
        ctx.strokeStyle = COLORS[color];
      }
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (s.flare && twinkle > 0.6) {
        // A little four-point glint on the nearest stars.
        const len = s.r * 5 * twinkle;
        ctx.globalAlpha = alpha * 0.55;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(x - len, y); ctx.lineTo(x + len, y);
        ctx.moveTo(x, y - len); ctx.lineTo(x, y + len);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function loop(time) {
    frame = requestAnimationFrame(loop);
    // Twinkling alone is fine at ~30fps, but while the page scrolls or the
    // stars are being pushed about, every frame, so they don't judder.
    if (!busy && scrollY === drawnScroll && time - last < 32) return;
    const dt = Math.min(100, time - last);
    last = time;
    draw(time, dt);
  }

  function start() {
    cancelAnimationFrame(frame);
    if (reducedMotion()) { draw(performance.now()); return; }
    last = performance.now();
    frame = requestAnimationFrame(loop);
  }

  seed();
  start();
  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { seed(); start(); }, 120);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(frame);
    else start();
  });
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    lean.tx = (e.clientX / width - 0.5) * 2;
    lean.ty = (e.clientY / height - 0.5) * 2;
    busy = true;
  }, { passive: true });

  instance = {
    el,
    // Where the void is right now ({ x, y, r } on screen), or null for none.
    setLens(fn) { lens = fn; },
    // 0 by your galaxy, 1 out in the universe.
    setNight(v) {
      if (v === night) return;
      night = v;
      el.style.setProperty('--night', v.toFixed(3));
    },
    // Stars near (x, y) lean in, then drift back.
    pull(x, y, { strength = 1, radius = 360, duration = 1300 } = {}) {
      if (reducedMotion()) return;
      pulls.push({ x, y, strength, radius, duration, start: performance.now() });
    },
  };
  return instance;
}
