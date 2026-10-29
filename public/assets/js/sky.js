// The sky behind every page: a deep Vita-blue wash, slow ribbons of light,
// and a field of stars that twinkle, lean a little as you move, and get
// tugged toward the black hole when it eats something.

import { h, reducedMotion } from './util.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// One soft band of light: a filled wave with a bright hairline along its crest.
function ribbon(index, { y, amp, thick, period, opacity, line }) {
  const width = period * Math.ceil((1600 + period) / period); // still covers the view while drifting one period
  const crest = [];
  const trough = [];
  for (let x = 0; x <= width; x += period / 16) {
    const t = (x / period) * Math.PI * 2;
    const top = y + Math.sin(t) * amp + Math.sin(t * 2 + index) * amp * 0.18;
    crest.push([x, top]);
    trough.push([x, top + thick * (0.65 + 0.35 * Math.cos(t + 0.8))]);
  }
  const pts = (list) => list.map(([x, py]) => `${x.toFixed(1)},${py.toFixed(1)}`).join(' L');
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', `sky-ribbon sky-ribbon-${index}`);
  const band = document.createElementNS(SVG_NS, 'path');
  band.setAttribute('d', `M${pts(crest)} L${pts([...trough].reverse())} Z`);
  band.setAttribute('fill', `url(#sky-band-${index})`);
  band.setAttribute('opacity', opacity);
  const hair = document.createElementNS(SVG_NS, 'path');
  hair.setAttribute('d', `M${pts(crest)}`);
  hair.setAttribute('fill', 'none');
  hair.setAttribute('stroke', 'var(--ribbon-line)');
  hair.setAttribute('stroke-width', '1.2');
  hair.setAttribute('opacity', line);
  g.append(band, hair);
  const grad = document.createElementNS(SVG_NS, 'linearGradient');
  grad.id = `sky-band-${index}`;
  grad.setAttribute('x1', '0');
  grad.setAttribute('y1', '0');
  grad.setAttribute('x2', '0');
  grad.setAttribute('y2', '1');
  for (const [offset, alpha] of [[0, 0.9], [0.35, 0.35], [1, 0]]) {
    const stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', 'var(--ribbon)');
    stop.setAttribute('stop-opacity', alpha);
    grad.append(stop);
  }
  return { g, grad };
}

function ribbons() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'sky-ribbons');
  svg.setAttribute('viewBox', '0 0 1600 1000');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  const defs = document.createElementNS(SVG_NS, 'defs');
  svg.append(defs);
  const bands = [
    { y: 560, amp: 90, thick: 170, period: 1600, opacity: 0.16, line: 0.5 },
    { y: 640, amp: 120, thick: 120, period: 1300, opacity: 0.12, line: 0.35 },
    { y: 470, amp: 70, thick: 90, period: 1900, opacity: 0.08, line: 0.28 },
  ];
  bands.forEach((band, i) => {
    const { g, grad } = ribbon(i, band);
    defs.append(grad);
    g.style.setProperty('--period', `${band.period}px`);
    svg.append(g);
  });
  return svg;
}

let instance = null;
export const theSky = () => instance;

export function createSky() {
  const canvas = h('canvas', { class: 'sky-stars' });
  const el = h('div', { class: 'sky', 'aria-hidden': 'true' },
    h('div', { class: 'sky-wash' }),
    h('div', { class: 'sky-nebula' }),
    ribbons(),
    canvas);
  const ctx = canvas.getContext('2d');
  let stars = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let lean = { x: 0, y: 0, tx: 0, ty: 0 };
  let pulls = [];
  let frame = 0;
  let last = 0;

  function seed() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    width = innerWidth;
    height = innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const count = Math.round(Math.min(340, (width * height) / 5200));
    stars = Array.from({ length: count }, () => {
      const depth = Math.random();
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.35 + depth * depth * 1.25,
        depth,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 1.6,
        tint: Math.random() < 0.18 ? 'warm' : Math.random() < 0.3 ? 'blue' : 'white',
        flare: depth > 0.93,
      };
    });
  }

  const COLORS = { white: '255,255,255', warm: '255,226,196', blue: '178,214,255' };

  function draw(time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    lean.x += (lean.tx - lean.x) * 0.04;
    lean.y += (lean.ty - lean.y) * 0.04;
    const scroll = scrollY;
    pulls = pulls.filter((p) => time - p.start < p.duration);
    for (const s of stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(time * 0.001 * s.speed + s.phase);
      let x = s.x + lean.x * s.depth * 14;
      let y = s.y + lean.y * s.depth * 10 - scroll * (0.02 + s.depth * 0.05);
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
      const alpha = (0.25 + s.depth * 0.75) * twinkle;
      ctx.fillStyle = `rgba(${COLORS[s.tint]},${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (s.flare && twinkle > 0.6) {
        // A little four-point glint on the nearest stars.
        const len = s.r * 5 * twinkle;
        ctx.strokeStyle = `rgba(${COLORS[s.tint]},${(alpha * 0.55).toFixed(3)})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(x - len, y); ctx.lineTo(x + len, y);
        ctx.moveTo(x, y - len); ctx.lineTo(x, y + len);
        ctx.stroke();
      }
    }
  }

  function loop(time) {
    frame = requestAnimationFrame(loop);
    if (time - last < 32) return; // ~30fps is plenty for twinkling
    last = time;
    draw(time);
  }

  function start() {
    cancelAnimationFrame(frame);
    if (reducedMotion()) { draw(performance.now()); return; }
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
  }, { passive: true });

  instance = {
    el,
    restart: start,
    // Stars near (x, y) lean in, then drift back.
    pull(x, y, { strength = 1, radius = 360, duration = 1300 } = {}) {
      if (reducedMotion()) return;
      pulls.push({ x, y, strength, radius, duration, start: performance.now() });
    },
  };
  return instance;
}
