// Planets: every drawer is a small world that turns slowly. Its files are
// laid onto the surface like continents between bands of weather, mapped
// onto a real sphere (a little canvas per planet), then lit from the upper
// left with an atmosphere round the edge. Its critter flies the flag in the
// label underneath.

import { blink, renderIcon } from './pixel.js';
import { h, plural, reducedMotion, seeded } from './util.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function shade(hex, other, t) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(other.slice(1), 16);
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

// Bigger worlds for fuller drawers, within reason.
export function planetSize(count, scale = 1) {
  return Math.round(Math.min(280, 112 + Math.sqrt(count || 0) * 13) * scale);
}

export const VISIBILITY = {
  private: { label: 'Private', hint: 'Only you can see inside.' },
  pin: { label: 'Code', hint: 'Anyone who knows your code can look inside.' },
  people: { label: 'People', hint: 'Only the people you pick.' },
  public: { label: 'Public', hint: 'Everyone on Mutt can look inside.' },
};

// Tiny line icons, drawn the same everywhere.
export function glyph(name, size = 12) {
  const paths = {
    private: 'M4 7V5.5a4 4 0 0 1 8 0V7M3 7h10v7H3z',
    pin: 'M10.5 2.5a3 3 0 1 1-2.6 4.5L3 12v2h2v-1.5h1.5V11H8l.9-.9',
    people: 'M5.5 7.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM1.5 13.5c.4-2.3 2-3.6 4-3.6s3.6 1.3 4 3.6M11 7.3a1.9 1.9 0 1 0 0-3.8M12 9.9c1.4.3 2.3 1.5 2.6 3.4',
    public: 'M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13zM1.5 8h13M8 1.5c-2 2-2.6 4.2-2.6 6.5S6 12.5 8 14.5M8 1.5c2 2 2.6 4.2 2.6 6.5S10 12.5 8 14.5',
    community: 'M8 3v10M3 8h10',
    plus: 'M8 3v10M3 8h10',
    lock: 'M4.5 7V5.5a3.5 3.5 0 0 1 7 0V7M3.5 7h9v7h-9z',
    search: 'M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM11 11l3.5 3.5',
    star: 'M8 1.5c.5 3.6 1.9 5 6.5 6.5-4.6 1.5-6 2.9-6.5 6.5C7.5 10.9 6.1 9.5 1.5 8 6.1 6.5 7.5 5.1 8 1.5z',
    chevron: 'M6 3.5 10.5 8 6 12.5',
    caret: 'M4.5 6.5 8 10l3.5-3.5',
    up: 'M8 13V3M4 7l4-4 4 4',
    down: 'M8 3v10M4 9l4 4 4-4',
    upload: 'M8 11V2.5M4.5 6 8 2.5 11.5 6M2.5 10.5v3h11v-3',
    sort: 'M3 4.5h10M3 8h7M3 11.5h4',
    planet: 'M8 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM1.5 10.5c1.5.9 4.5.6 7.6-.6s5.5-3 5.4-4.7',
  };
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `glyph glyph-${name}`);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', paths[name] || paths.star);
  path.setAttribute('fill', name === 'star' ? 'currentColor' : 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', name === 'star' ? '0.6' : '1.4');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

const excerpt = (text, n) => {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const kindWord = (block) => (block.kind === 'link'
  ? (block.meta?.domain || block.title || '?').replace(/^www\./, '').charAt(0).toUpperCase()
  : (block.ext || block.kind || '').slice(0, 4).toUpperCase());

// A file as a small face: its picture, a scrap of its text, or what kind it is.
export function fileFace(block, { lazy = false } = {}) {
  if (block.thumb) {
    const img = h('img', lazy ? { alt: '', 'data-src': block.thumb, draggable: false } : { src: block.thumb, alt: '', decoding: 'async', draggable: false });
    const face = h('span', { class: 'ff ff-img' }, img);
    // No picture after all: show what kind of file it is instead.
    img.addEventListener('error', () => face.replaceWith(fileFace({ ...block, thumb: null })), { once: true });
    return face;
  }
  if (block.kind === 'text') return h('span', { class: 'ff ff-text' }, h('span', null, excerpt(block.title || block.content, 80)));
  return h('span', { class: 'ff ff-kind', dataset: { kind: block.kind } }, h('span', null, kindWord(block)));
}

// ---------------------------------------------------------------- surfaces

const TEX_W = 512;
const TEX_H = 256;
const KIND_TINT = { link: '#5d8fb8', pdf: '#b8775a', doc: '#b8946a', audio: '#4f9b85', video: '#9b5d82', code: '#7468a8', archive: '#7d8597', other: '#7d8597' };

// Critter colours are bright; worlds are dustier.
function worldColors(hex) {
  const base = shade(hex || '#2F6BFF', '#6f7891', 0.3);
  return { base, light: shade(base, '#f4f1ea', 0.38), dark: shade(base, '#070a16', 0.5) };
}

const imageCache = new Map();
function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    }));
  }
  return imageCache.get(src);
}

function roundRect(ctx, x, y, w, hgt, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + hgt, r);
  ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
  ctx.arcTo(x, y + hgt, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Weather: soft bands that wander, a few storms, ice at the poles.
function paintTerrain(ctx, colors, rand) {
  const kind = rand() < 0.45 ? 'gas' : rand() < 0.6 ? 'rock' : 'ice';
  const g = ctx.createLinearGradient(0, 0, 0, TEX_H);
  const pole = kind === 'ice' ? shade(colors.light, '#ffffff', 0.4) : colors.light;
  g.addColorStop(0, pole);
  g.addColorStop(0.14, colors.base);
  g.addColorStop(0.5, kind === 'ice' ? shade(colors.base, '#ffffff', 0.18) : colors.base);
  g.addColorStop(0.86, colors.base);
  g.addColorStop(1, pole);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  const bands = kind === 'gas' ? 22 : 9;
  for (let i = 0; i < bands; i++) {
    const y = rand() * TEX_H;
    const thick = 3 + rand() * (kind === 'gas' ? 18 : 10);
    const amp = 1 + rand() * 5;
    const freq = (1 + Math.floor(rand() * 4)) * ((Math.PI * 2) / TEX_W);
    const phase = rand() * Math.PI * 2;
    ctx.globalAlpha = 0.05 + rand() * (kind === 'gas' ? 0.16 : 0.08);
    ctx.fillStyle = rand() < 0.5 ? colors.dark : colors.light;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= TEX_W; x += 8) ctx.lineTo(x, y + Math.sin(x * freq + phase) * amp);
    for (let x = TEX_W; x >= 0; x -= 8) ctx.lineTo(x, y + thick + Math.sin(x * freq + phase + 0.7) * amp);
    ctx.closePath();
    ctx.fill();
  }
  const spots = kind === 'rock' ? 26 : 5;
  for (let i = 0; i < spots; i++) {
    const x = rand() * TEX_W;
    const y = TEX_H * (0.15 + rand() * 0.7);
    const r = kind === 'rock' ? 2 + rand() * 9 : 4 + rand() * 10;
    const sg = ctx.createRadialGradient(x, y, 0, x, y, r);
    sg.addColorStop(0, kind === 'rock' ? colors.dark : colors.light);
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = kind === 'rock' ? 0.35 : 0.22;
    ctx.fillStyle = sg;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(kind === 'rock' ? 1 : 2.4, 1);
    ctx.translate(-x, -y);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// Where each file sits: one belt round the equator, or two when there are many.
function tileSpots(n) {
  const w = 46;
  const hgt = 34;
  if (n <= 5) {
    const step = TEX_W / Math.max(n, 3);
    return Array.from({ length: n }, (_, i) => ({ x: i * step + step / 2 - w / 2, y: TEX_H / 2 - hgt / 2, w, h: hgt }));
  }
  const top = Math.ceil(n / 2);
  const bottom = n - top;
  const spots = [];
  for (let i = 0; i < top; i++) spots.push({ x: (i + 0.5) * (TEX_W / top) - w / 2, y: TEX_H * 0.39 - hgt / 2, w, h: hgt });
  for (let i = 0; i < bottom; i++) spots.push({ x: (i + 1) * (TEX_W / bottom) - w / 2, y: TEX_H * 0.62 - hgt / 2, w, h: hgt });
  return spots;
}

function drawTile(ctx, block, spot, img) {
  const { x, y, w, h: hgt } = spot;
  // Each file sits in a little crater of light, so it reads as part of the world.
  ctx.save();
  ctx.shadowColor = 'rgba(255, 250, 235, 0.55)';
  ctx.shadowBlur = 6;
  roundRect(ctx, x, y, w, hgt, 4);
  ctx.fillStyle = '#f3f1ea';
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, x, y, w, hgt, 4);
  ctx.clip();
  if (img) {
    const scale = Math.max(w / img.width, hgt / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (hgt - dh) / 2, dw, dh);
  } else if (block.kind === 'text') {
    ctx.fillStyle = '#f6f4ee';
    ctx.fillRect(x, y, w, hgt);
    ctx.fillStyle = 'rgba(40, 44, 60, 0.55)';
    ctx.font = '600 6px sans-serif';
    const words = excerpt(block.title || block.content, 60).split(' ');
    let line = '';
    let ly = y + 9;
    for (const word of words) {
      if (ctx.measureText(`${line} ${word}`).width > w - 8 && line) {
        ctx.fillText(line, x + 4, ly);
        line = word;
        ly += 7;
        if (ly > y + hgt - 3) break;
      } else line = line ? `${line} ${word}` : word;
    }
    if (ly <= y + hgt - 3) ctx.fillText(line, x + 4, ly);
  } else {
    ctx.fillStyle = KIND_TINT[block.kind] || KIND_TINT.other;
    ctx.fillRect(x, y, w, hgt);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '700 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(kindWord(block), x + w / 2, y + hgt / 2 + 4);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, hgt - 1, 4);
  ctx.stroke();
}

const textures = new Map();
function rememberTexture(key, tex) {
  textures.set(key, tex);
  if (textures.size > 48) textures.delete(textures.keys().next().value);
}

function composeTexture(planet, previews, images) {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const colors = worldColors(planet.icon?.c);
  paintTerrain(ctx, colors, seeded(planet.id));
  const spots = tileSpots(previews.length);
  previews.forEach((block, i) => drawTile(ctx, block, spots[i], images?.[i] || null));
  // A thin haze of the planet's own colour over everything ties it together.
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = colors.base;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.globalAlpha = 1;
  return new Uint32Array(ctx.getImageData(0, 0, TEX_W, TEX_H).data.buffer);
}

// The texture for a planet as it is now; `onReady` fires again once its
// pictures have loaded.
function textureFor(planet, previews, onReady) {
  const key = `${planet.id}|${planet.icon?.c}|${previews.map((b) => `${b.id}:${b.thumb || ''}`).join(',')}`;
  const have = textures.get(key);
  if (have) return have;
  const tex = { key, data: composeTexture(planet, previews, null) };
  rememberTexture(key, tex);
  const pics = previews.map((b) => (b.thumb ? loadImage(b.thumb) : Promise.resolve(null)));
  if (previews.some((b) => b.thumb)) {
    Promise.all(pics).then((images) => {
      tex.data = composeTexture(planet, previews, images);
      onReady?.();
    });
  }
  return tex;
}

// For each pixel of a D×D picture of the globe: which texel it shows.
const lookups = new Map();
function lookupFor(size) {
  if (lookups.has(size)) return lookups.get(size);
  const n = size * size;
  const row = new Int32Array(n);
  const col = new Int32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let nx = ((x + 0.5) / size) * 2 - 1;
      let ny = ((y + 0.5) / size) * 2 - 1;
      const d = nx * nx + ny * ny;
      if (d > 1) { const k = 1 / Math.sqrt(d); nx *= k; ny *= k; }
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lon = Math.atan2(nx, nz);
      const lat = Math.asin(Math.max(-1, Math.min(1, -ny)));
      const i = y * size + x;
      col[i] = Math.floor((lon / (Math.PI * 2) + 0.5) * TEX_W) & (TEX_W - 1);
      row[i] = Math.min(TEX_H - 1, Math.floor((0.5 - lat / Math.PI) * TEX_H)) * TEX_W;
    }
  }
  const table = { row, col };
  lookups.set(size, table);
  return table;
}

// One loop turns every planet on screen.
const turning = new Set();
let frame = 0;
let lastTick = 0;
function tick(now) {
  frame = turning.size ? requestAnimationFrame(tick) : 0;
  if (now - lastTick < 33) return;
  lastTick = now;
  for (const globe of turning) {
    // Planets that have left the page stop turning.
    if (!globe.canvas.isConnected && globe.born < now - 2000) { turning.delete(globe); watcher?.unobserve(globe.canvas); continue; }
    globe.draw(now);
  }
}
function startTurning(globe) {
  turning.add(globe);
  if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else if (turning.size && !frame) frame = requestAnimationFrame(tick);
});
const watcher = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries) e.target.globe?.setVisible(e.isIntersecting);
}, { rootMargin: '120px' }) : null;

function makeGlobe(canvas, rand) {
  const period = (80 + rand() * 70) * 1000;
  const offset = rand() * period;
  let size = 0;
  let image = null;
  let out = null;
  let table = null;
  let tex = null;
  let shown = -1;
  let visible = !watcher;
  const ctx = canvas.getContext('2d');

  const globe = {
    canvas,
    born: performance.now(),
    setSize(css) {
      const next = Math.max(48, Math.min(300, Math.round(css * Math.min(devicePixelRatio || 1, 1.5))));
      if (next === size) return;
      size = next;
      canvas.width = size;
      canvas.height = size;
      image = ctx.createImageData(size, size);
      out = new Uint32Array(image.data.buffer);
      table = lookupFor(size);
      shown = -1;
    },
    setTexture(next) { tex = next; shown = -1; globe.draw(performance.now(), true); },
    draw(now, force = false) {
      if (!tex || !image || (!visible && !force)) return;
      const shift = reducedMotion() ? 0 : Math.floor((((now + offset) % period) / period) * TEX_W);
      if (shift === shown && !force) return;
      shown = shift;
      const { row, col } = table;
      const data = tex.data;
      const mask = TEX_W - 1;
      for (let i = 0, n = out.length; i < n; i++) out[i] = data[row[i] + ((col[i] - shift) & mask)];
      ctx.putImageData(image, 0, 0);
    },
    setVisible(on) {
      visible = on;
      if (on) globe.draw(performance.now(), true);
    },
  };
  canvas.globe = globe;
  watcher?.observe(canvas);
  startTurning(globe);
  return globe;
}

// ---------------------------------------------------------------- the planet

export function planetEl(planet, { size, href = `/p/${planet.id}`, label = true, tag = href ? 'a' : 'div', peek = false } = {}) {
  const rand = seeded(planet.id);
  const tilt = Math.round((rand() - 0.5) * 36);
  const ringTilt = Math.round((rand() - 0.5) * 24);

  const canvas = h('canvas', { class: 'planet-map', 'aria-hidden': 'true' });
  const globeApi = makeGlobe(canvas, rand);

  const ball = h('span', { class: 'planet-ball' },
    canvas,
    h('span', { class: 'planet-shade' }),
    h('span', { class: 'planet-lock' }, glyph('lock', 18)));
  const ringBack = h('span', { class: 'planet-ring planet-ring-back' });
  const ringFront = h('span', { class: 'planet-ring planet-ring-front' });
  const bubble = h('span', { class: 'planet-bubble', 'aria-hidden': 'true' });
  const critter = h('span', { class: 'planet-critter' });
  const name = h('span', { class: 'planet-name' });
  const meta = h('span', { class: 'planet-meta' });
  const peekRow = peek ? h('span', { class: 'planet-peek', 'aria-hidden': 'true' }) : null;
  const body = h('span', { class: 'planet-body' }, h('span', { class: 'planet-atmo' }), ringBack, ball, ringFront, bubble);
  const el = h(tag, { class: 'planet', href: tag === 'a' ? href : null, dataset: { id: planet.id }, draggable: 'false' },
    body,
    label ? h('span', { class: 'planet-label' }, h('span', { class: 'planet-title' }, critter, name), meta, peekRow) : null);

  el.style.setProperty('--tilt', `${tilt}deg`);
  el.style.setProperty('--ring-tilt', `${ringTilt}deg`);

  let critterSvg = null;
  let peekFor = '';
  el.update = (next, opts = {}) => {
    planet = next;
    el.planet = next;
    const s = opts.size || size || planetSize(next.count);
    el.style.setProperty('--s', `${s}px`);
    const colors = worldColors(next.icon?.c);
    el.style.setProperty('--c', colors.base);
    el.style.setProperty('--c-light', colors.light);
    el.style.setProperty('--c-dark', colors.dark);
    el.classList.toggle('is-locked', !!next.locked);
    el.classList.toggle('has-rings', (next.count || 0) >= 10);
    el.classList.toggle('is-empty', !next.count);
    globeApi.setSize(s);
    const previews = next.locked ? [] : (next.previews || []).slice(0, 12);
    const tex = textureFor(next, previews, () => globeApi.setTexture(textures.get(tex.key) || tex));
    globeApi.setTexture(tex);
    if (next.icon && label) {
      critterSvg = renderIcon(next.icon, { size: 14 });
      critter.replaceChildren(critterSvg);
    }
    name.textContent = next.title;
    const bits = [];
    const vis = next.community ? 'community' : next.visibility;
    if (next.mine !== false && vis && vis !== 'pin') bits.push(glyph(vis, 10));
    if (next.locked) bits.push(glyph('lock', 10));
    bits.push(h('span', null, next.count ? plural(next.count, 'file') : 'empty'));
    meta.replaceChildren(...bits);
    if (peekRow) {
      const pics = previews.slice(0, 4);
      const sig = pics.map((b) => b.id).join();
      if (sig !== peekFor) { peekFor = sig; peekRow.replaceChildren(...pics.map((b) => fileFace(b, { lazy: true }))); }
    }
    el.setAttribute('aria-label', `${next.title}, ${next.locked ? 'locked' : plural(next.count || 0, 'file')}`);
  };
  el.update(planet);

  el.addEventListener('pointerenter', () => {
    blink(critterSvg);
    for (const img of el.querySelectorAll('.planet-peek img[data-src]')) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
  });
  el.ball = ball;
  el.body = body;

  // The Vita notification bubble: "+2" after things land here.
  let bumped = 0;
  el.bump = (n = 1) => {
    bumped += n;
    bubble.textContent = `+${bumped}`;
    bubble.classList.remove('is-on');
    void bubble.offsetWidth;
    bubble.classList.add('is-on');
  };
  // Something arrived: the atmosphere flares a little.
  el.gulp = () => {
    body.classList.remove('is-gulping');
    void body.offsetWidth;
    body.classList.add('is-gulping');
    setTimeout(() => body.classList.remove('is-gulping'), 900);
    blink(critterSvg);
  };
  el.center = () => {
    const r = ball.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
  };
  return el;
}

// A tiny painted world for the universe: no files, just colour and light.
export function dotWorld(world, size) {
  const colors = worldColors(world.c);
  return h('span', {
    class: `uv-world${world.locked ? ' is-locked' : ''}`,
    style: { '--w': `${size}px`, '--c': colors.base, '--c-light': colors.light, '--c-dark': colors.dark },
  });
}
