// The cosmic web behind the universe: faint threads of stippled dust that
// link the galaxies into a loose net, gathering into brighter knots where
// they meet and into a soft halo round each galaxy. Dotted like a print
// (brighter places get more dots, never a glow), with only a faint mauve
// tint. Painted once for a layout, then moved as one picture. A few threads
// that reach a galaxy also carry a bead of light (`beads`, below).

import { seeded } from './util.js';

const TAU = Math.PI * 2;
// Dots go into a few brightness buckets, so each bucket is one colour change.
const SHADES = [0.1, 0.2, 0.34, 0.52];

// `nodes` are the galaxies, in the canvas's own pixels: { x, y, r }.
export function paintWeb(canvas, width, height, nodes, seedName = 'web') {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const rand = seeded(`uvweb:${seedName}:${nodes.length}`);
  const gauss = () => {
    const u = Math.max(1e-6, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand());
  };
  const buckets = SHADES.map(() => []);
  const dot = (x, y, b) => {
    if (x < 0 || y < 0 || x > width || y > height) return;
    buckets[Math.max(0, Math.min(SHADES.length - 1, Math.round(b * (SHADES.length - 1))))].push(x, y);
  };

  // Loose knots in the dark between galaxies, on a jittered grid, so the
  // web carries on past them to the edges.
  const cell = Math.max(110, Math.min(width, height) / 4.2);
  const knots = [];
  for (let y = cell / 2; y < height + cell / 2; y += cell) {
    for (let x = cell / 2; x < width + cell / 2; x += cell) {
      const k = { x: x + (rand() - 0.5) * cell * 0.9, y: y + (rand() - 0.5) * cell * 0.9, r: 0, knot: true };
      if (nodes.some((n) => Math.hypot(n.x - k.x, n.y - k.y) < n.r + cell * 0.45)) continue;
      if (rand() < 0.22) continue;
      knots.push(k);
    }
  }
  const all = [...nodes, ...knots];

  // Each one links to its nearest two or three.
  const links = new Map();
  all.forEach((a, i) => {
    const near = all.map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) - (a.r + b.r) * 0.5 }))
      .filter((n) => n.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, a.knot ? 2 + (rand() < 0.4 ? 1 : 0) : 3);
    for (const { j } of near) {
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (!links.has(key)) links.set(key, [Math.min(i, j), Math.max(i, j)]);
    }
  });
  const degree = all.map(() => 0);
  for (const [i, j] of links.values()) { degree[i]++; degree[j]++; }

  // A sprinkle of very faint dust everywhere.
  for (let n = Math.round((width * height) / 900); n > 0; n--) dot(rand() * width, rand() * height, 0);

  // Threads: gently curved, wandering in width, brighter towards the ends
  // where they gather into knots. They stop short of a galaxy's planets.
  const threads = [];
  for (const [i, j] of links.values()) {
    const a = all[i];
    const b = all[j];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 4) continue;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const bend = (rand() - 0.5) * len * 0.35;
    const c = { x: (a.x + b.x) / 2 + nx * bend, y: (a.y + b.y) / 2 + ny * bend };
    if (!a.knot || !b.knot) threads.push({ a, b, c, len });
    const thick = 1.6 + rand() * 3.2;
    const phase = rand() * TAU;
    const waves = 1 + rand() * 2.5;
    const steps = Math.ceil(len / 1.4);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x;
      const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y;
      const da = Math.hypot(x - a.x, y - a.y);
      const db = Math.hypot(x - b.x, y - b.y);
      if (da < a.r * 0.7 || db < b.r * 0.7) continue;
      const w = thick * (0.55 + 0.45 * Math.sin(t * TAU * waves + phase));
      const ends = Math.max(1 - Math.min(1, da / (len * 0.3)), 1 - Math.min(1, db / (len * 0.3)));
      const bright = 0.35 + 0.5 * ends;
      const count = 0.5 + w * 0.32 * (0.6 + ends);
      for (let n = count + rand(); n >= 1; n--) {
        const off = gauss() * w;
        dot(x + nx * off + (rand() - 0.5), y + ny * off + (rand() - 0.5), bright * (1 - Math.min(1, Math.abs(off) / (w * 2.4))));
      }
    }
  }

  // Knots where threads meet: a dense clump, denser in the middle.
  knots.forEach((k, n) => {
    const d = degree[nodes.length + n];
    if (d < 3) return;
    const r = 4 + d * 2.2 + rand() * 5;
    for (let c = Math.round(r * r * 0.9); c > 0; c--) {
      const g = Math.abs(gauss());
      const a = rand() * TAU;
      dot(k.x + Math.cos(a) * g * r * 0.5, k.y + Math.sin(a) * g * r * 0.5, 1 - Math.min(1, g / 2.2));
    }
  });

  // A soft dotted halo round each galaxy, where the threads land.
  for (const g of nodes) {
    for (let c = Math.round(g.r * 9); c > 0; c--) {
      const a = rand() * TAU;
      const d = g.r * (0.8 + Math.abs(gauss()) * 0.35);
      dot(g.x + Math.cos(a) * d, g.y + Math.sin(a) * d, 0.35 * (1 - Math.min(1, (d / g.r - 0.8) / 0.9)));
    }
  }

  const size = 1 / dpr + 0.35;
  buckets.forEach((pts, b) => {
    ctx.fillStyle = `rgba(222, 212, 240, ${SHADES[b]})`;
    for (let n = 0; n < pts.length; n += 2) ctx.fillRect(pts[n], pts[n + 1], size, size);
  });
  return threads;
}

// Beads of light for the threads that reach a galaxy: one small bead each (at
// most MAX_BEADS), travelling slowly from end to end and fading at both. They
// are plain elements moved by the browser, so they cost nothing to keep going.
// `host` shares the web's own box, so they move with the picture. None under Still.
const MAX_BEADS = 14;
const BEAD_SPEED = 22;   // pixels a second
export function beads(host, threads, still) {
  host.replaceChildren();
  if (still) return;
  const rand = seeded(`beads:${threads.length}`);
  const longest = [...threads].sort((p, q) => q.len - p.len).slice(0, MAX_BEADS);
  longest.forEach(({ a, b, c, len }, n) => {
    // stay clear of each end's galaxy, as the dots do
    const from = Math.min(0.45, (a.r * 0.8) / len);
    const to = 1 - Math.min(0.45, (b.r * 0.8) / len);
    const frames = [];
    for (let s = 0; s <= 10; s++) {
      const t = from + ((to - from) * s) / 10;
      const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x;
      const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y;
      frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`, opacity: s === 0 || s === 10 ? 0 : 1 });
    }
    const bead = document.createElement('span');
    bead.className = 'uv-bead';
    host.append(bead);
    const time = (len * (to - from) * 1000) / BEAD_SPEED;
    bead.animate(n % 2 ? frames.reverse() : frames, { duration: time, delay: -rand() * time, iterations: Infinity, easing: 'linear' });
  });
  beadsRun(host, host.dataset.run !== 'no');
}

// The beads move only while the universe can be seen: on a galaxy's own page they would run all
// day out of sight. The page says when (views/galaxy.js, as the scroll crosses into the universe).
export function beadsRun(host, on) {
  host.dataset.run = on ? 'yes' : 'no';
  for (const a of host.getAnimations({ subtree: true })) { if (on) a.play(); else a.pause(); }
}
