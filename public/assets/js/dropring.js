// The drop ring (DESIGN.md "Drop ring"): round a planet, a moon or a star you are
// carrying something onto, and where a moved planet will land. It is the threads'
// print bent into a loop (`dustLoop` in uvweb.js), never a ruled circle.
//
// Painted once, as two pictures the stylesheet lays over each other as a mask:
// the loop's soft strands, stretched to each ring, and a small tile of evenly
// laid dots, never stretched, punched through it. So a star's small ring and a
// planet's large one are dotted alike, as the void is. Until both are in, no
// ring shows (`html.has-dust`); they are made a moment after the page starts,
// off the way of anything else, and cost nothing after.

import { evenPoints, DOT } from './voidmake.js';
import { dustLoop } from './uvweb.js';
import { seeded } from './util.js';

const TAU = Math.PI * 2;
const LOOP = 256;   // the loop's picture, in pixels: soft, so it stretches without showing it
const TILE = 48;    // the dot tile, in points
const GAPS = 0.07;  // what shows between the dots: the void's own stipple leaves the same

const blobOf = (canvas) => new Promise((done) => canvas.toBlob(done));

function loopPicture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = LOOP;
  const ctx = canvas.getContext('2d');
  dustLoop((x, y, b) => {
    ctx.globalAlpha = Math.min(1, b * 0.85);
    ctx.beginPath();
    ctx.arc(x, y, 1.7, 0, TAU);
    ctx.fill();
  }, seeded('drop-ring'), { x: LOOP / 2, y: LOOP / 2 }, LOOP * 0.42, { strands: 3, width: 3.4, spread: 8, haze: 0.9 });
  return canvas;
}

function dotTile(dpr) {
  const size = Math.round(TILE * dpr);
  const k = size / TILE;
  const grow = Math.max(1, 1.5 / dpr);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.globalAlpha = GAPS;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 1;
  const rand = seeded('drop-ring-dots');
  for (const [px, py] of evenPoints(TILE, DOT.gap * grow, rand)) {
    const r = (DOT.small + rand() ** 2 * (DOT.large - DOT.small)) * k * grow;
    // drawn again across each edge, so the tile repeats without seams
    for (const ox of [0, -size, size]) {
      for (const oy of [0, -size, size]) {
        ctx.beginPath();
        ctx.arc(px * k + ox, py * k + oy, r, 0, TAU);
        ctx.fill();
      }
    }
  }
  return canvas;
}

let made = false;
export async function makeDropRing() {
  if (made) return;
  made = true;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const [loop, dots] = await Promise.all([blobOf(loopPicture()), blobOf(dotTile(dpr))]);
  if (!loop || !dots) return;
  const root = document.documentElement;
  root.style.setProperty('--dust-loop', `url(${URL.createObjectURL(loop)})`);
  root.style.setProperty('--dust-dots', `url(${URL.createObjectURL(dots)})`);
  root.style.setProperty('--dust-tile', `${TILE}px`);
  root.classList.add('has-dust');
}
