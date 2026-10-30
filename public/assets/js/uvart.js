// The little galaxies out in the universe: a grainy spiral of dust, painted
// once onto a canvas and turned by CSS. Each owner's arms take the colours
// of their own planets, and every planet gets a faint orbit line.
import { shade, worldColors } from './planets.js';
import { seeded } from './util.js';

const PALE = '#c9d3f2';
const WARM = '#f0dcc2';

const gauss = (rand) => (rand() + rand() + rand() - 1.5) / 1.5;

// size: the box in CSS pixels. orbits: radii of the planets' paths.
export function paintGalaxy(canvas, g, size, orbits = []) {
  const rand = seeded(`uvart:${g.username}`);
  const dpr = Math.min(3, (devicePixelRatio || 1) * 1.5);
  canvas.width = canvas.height = Math.round(size * dpr);
  canvas.style.width = canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, size / 2 * dpr, size / 2 * dpr);

  const tints = (g.worlds || []).filter((w) => !w.locked).slice(0, 5).flatMap((w) => {
    const c = worldColors(w);
    return [c.light, c.base];
  });
  if (!tints.length) tints.push(PALE);
  const R = size * 0.47;
  const arms = 2 + Math.floor(rand() * 3);
  const twist = 2.4 + rand() * 1.8;
  const pitch = rand() < 0.5 ? 1 : -1;
  const dot = (x, y, s, color, a) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.fillRect(x - s / 2, y - s / 2, s, s);
  };

  // A faint haze of loose stars round the whole disk.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 700; i++) {
    const r = R * Math.min(1.05, Math.abs(gauss(rand)) * 0.85);
    const a = rand() * Math.PI * 2;
    dot(Math.cos(a) * r, Math.sin(a) * r, 0.6 + rand() * 0.5, PALE, 0.06 + rand() * 0.12);
  }

  // The arms: dust thick near the middle, thinning and colouring outward.
  const along = (t, j) => j * (Math.PI * 2 / arms) + pitch * twist * Math.sqrt(t) * Math.PI;
  for (let i = 0; i < 2600; i++) {
    const j = i % arms;
    const t = 0.08 + 0.92 * rand() ** 0.8;
    const r = R * t * (1 + gauss(rand) * 0.05);
    const a = along(t, j) + gauss(rand) * (0.42 - t * 0.16);
    const tint = tints[Math.floor(rand() * tints.length)];
    const color = shade(WARM, tint, Math.min(1, t * 1.4));
    const big = rand() < 0.04;
    dot(Math.cos(a) * r, Math.sin(a) * r, big ? 1.4 : 0.55 + rand() * 0.6, color, (big ? 0.85 : 0.3 + rand() * 0.4) * (1 - t * 0.55));
  }

  // Bright knots along the arms, in the planets' colours.
  const knots = 6 + Math.floor(rand() * 6);
  for (let n = 0; n < knots; n++) {
    const j = n % arms;
    const t = 0.3 + rand() * 0.6;
    const a0 = along(t, j) + gauss(rand) * 0.12;
    const x0 = Math.cos(a0) * R * t;
    const y0 = Math.sin(a0) * R * t;
    const tint = tints[Math.floor(rand() * tints.length)];
    for (let i = 0; i < 14; i++) {
      dot(x0 + gauss(rand) * size * 0.018, y0 + gauss(rand) * size * 0.018, 0.6 + rand() * 0.7, tint, 0.35 + rand() * 0.4);
    }
  }

  // The bulge round the core.
  for (let i = 0; i < 500; i++) {
    const r = R * Math.abs(gauss(rand)) * 0.16;
    const a = rand() * Math.PI * 2;
    dot(Math.cos(a) * r, Math.sin(a) * r * 0.9, 0.5 + rand() * 0.6, WARM, 0.2 + rand() * 0.3);
  }

  // Dark dust lanes just inside each arm.
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 900; i++) {
    const j = i % arms;
    const t = 0.18 + 0.7 * rand();
    const r = R * t;
    const a = along(t, j) - pitch * (0.16 + rand() * 0.06) + gauss(rand) * 0.05;
    dot(Math.cos(a) * r, Math.sin(a) * r, 0.8 + rand() * 0.8, '#05070f', 0.25 + rand() * 0.3);
  }

  // Each planet's path.
  ctx.globalAlpha = 1;
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = 'rgba(220, 228, 255, 0.09)';
  for (const r of orbits) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}
