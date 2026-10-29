// Planets: every drawer is a small world. Its files ride around the surface
// as little glowing windows, its critter lives on the north pole, and it
// grows rings once it's full. Everything inside scales with the planet
// (sizes are in em, and the ball's font-size is the planet's diameter).

import { blink, renderIcon } from './pixel.js';
import { h, plural, seeded } from './util.js';

const SURFACES = ['bands', 'speckle', 'swirl', 'ice'];
const SVG_NS = 'http://www.w3.org/2000/svg';

export function shade(hex, other, t) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(other.slice(1), 16);
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

// Bigger worlds for fuller drawers, within reason.
export function planetSize(count, scale = 1) {
  return Math.round(Math.min(148, 66 + Math.sqrt(count || 0) * 12.5) * scale);
}

export const VISIBILITY = {
  private: { label: 'Private', hint: 'Only you can see inside.' },
  pin: { label: 'Code', hint: 'Anyone who knows your code can look inside.' },
  people: { label: 'People', hint: 'Only the people you pick.' },
  public: { label: 'Public', hint: 'Everyone on Mutt can look inside.' },
};

// Tiny line icons for sharing states, drawn the same everywhere.
export function glyph(name, size = 12) {
  const paths = {
    private: 'M4 7V5.5a4 4 0 0 1 8 0V7M3 7h10v7H3z',
    pin: 'M10.5 2.5a3 3 0 1 1-2.6 4.5L3 12v2h2v-1.5h1.5V11H8l.9-.9',
    people: 'M5.5 7.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM1.5 13.5c.4-2.3 2-3.6 4-3.6s3.6 1.3 4 3.6M11 7.3a1.9 1.9 0 1 0 0-3.8M12 9.9c1.4.3 2.3 1.5 2.6 3.4',
    public: 'M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13zM1.5 8h13M8 1.5c-2 2-2.6 4.2-2.6 6.5S6 12.5 8 14.5M8 1.5c2 2 2.6 4.2 2.6 6.5S10 12.5 8 14.5',
    community: 'M8 3v10M3 8h10',
    lock: 'M4.5 7V5.5a3.5 3.5 0 0 1 7 0V7M3.5 7h9v7h-9z',
    search: 'M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM11 11l3.5 3.5',
    star: 'M8 1.5c.5 3.6 1.9 5 6.5 6.5-4.6 1.5-6 2.9-6.5 6.5C7.5 10.9 6.1 9.5 1.5 8 6.1 6.5 7.5 5.1 8 1.5z',
    chevron: 'M6 3.5 10.5 8 6 12.5',
    caret: 'M4.5 6.5 8 10l3.5-3.5',
    upload: 'M8 11V2.5M4.5 6 8 2.5 11.5 6M2.5 10.5v3h11v-3',
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

// One file as a small window on the surface.
export function surfaceTile(block) {
  if (block.thumb) {
    return h('span', { class: 'pt pt-img' },
      h('img', { src: block.thumb, alt: '', loading: 'lazy', decoding: 'async', draggable: false }));
  }
  if (block.kind === 'text') {
    return h('span', { class: 'pt pt-text' }, h('span', null, (block.title || block.content || '').trim().slice(0, 60)));
  }
  const word = block.kind === 'link'
    ? (block.meta?.domain || block.title || '?').replace(/^www\./, '').charAt(0).toUpperCase()
    : (block.ext || block.kind || '').slice(0, 4).toUpperCase();
  return h('span', { class: 'pt pt-kind', dataset: { kind: block.kind } }, h('span', null, word));
}

function fillSurface(spin, previews) {
  spin.replaceChildren();
  if (!previews.length) return;
  // Two latitudes of windows; repeat a few so one file doesn't sit alone.
  let pool = previews.slice(0, 10);
  while (pool.length < 5) pool = pool.concat(previews).slice(0, 5);
  const equator = pool.slice(0, Math.min(6, pool.length));
  const north = pool.slice(equator.length, equator.length + 4);
  equator.forEach((b, i) => {
    const t = surfaceTile(b);
    t.style.setProperty('--a', `${(i / equator.length) * 360}deg`);
    t.classList.add('pt-eq');
    spin.append(t);
  });
  north.forEach((b, i) => {
    const t = surfaceTile(b);
    t.style.setProperty('--a', `${(i / north.length) * 360 + 30}deg`);
    t.classList.add('pt-north');
    spin.append(t);
  });
}

// Recent files circle the planet as moons while you hover it.
function fillMoons(moons, previews, size) {
  moons.replaceChildren();
  const pics = previews.filter((b) => b.thumb).slice(0, 3);
  if (pics.length < 2) return;
  const cx = size / 2;
  const cy = size / 2;
  pics.forEach((b, i) => {
    const rx = size * (0.78 + i * 0.12);
    const ry = size * (0.24 + i * 0.05);
    const moon = h('span', { class: 'moon', style: {
      'offset-path': `path("M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy}")`,
      '--d': `${-i * 2.3}s`, '--dur': `${7 + i * 2}s`,
    } }, h('img', { src: b.thumb, alt: '', loading: 'lazy', draggable: false }));
    moons.append(moon);
  });
}

export function planetEl(planet, { size, href = `/p/${planet.id}`, label = true, tag = href ? 'a' : 'div' } = {}) {
  const rand = seeded(planet.id);
  const surface = SURFACES[Math.floor(rand() * SURFACES.length)];
  const tilt = Math.round((rand() - 0.5) * 34);
  const spinSecs = 34 + rand() * 36;
  const bobSecs = 6 + rand() * 4;
  const bobDelay = -rand() * 10;

  const spin = h('span', { class: 'planet-spin' });
  const skin = h('span', { class: 'planet-skin' });
  const ball = h('span', { class: 'planet-ball', dataset: { surface } },
    skin,
    h('span', { class: 'planet-surface' }, spin),
    h('span', { class: 'planet-shade' }),
    h('span', { class: 'planet-gloss' }),
    h('span', { class: 'planet-lock' }, glyph('lock', 18)));
  const ringBack = h('span', { class: 'planet-ring planet-ring-back' });
  const ringFront = h('span', { class: 'planet-ring planet-ring-front' });
  const critter = h('span', { class: 'planet-critter' });
  const bubble = h('span', { class: 'planet-bubble', 'aria-hidden': 'true' });
  const moons = h('span', { class: 'planet-moons', 'aria-hidden': 'true' });
  const name = h('span', { class: 'planet-name' });
  const meta = h('span', { class: 'planet-meta' });
  const body = h('span', { class: 'planet-body' }, moons, ringBack, ball, ringFront, critter, bubble);
  const el = h(tag, { class: 'planet', href: tag === 'a' ? href : null, dataset: { id: planet.id }, draggable: 'false' },
    body,
    label ? h('span', { class: 'planet-label' }, name, meta) : null);

  el.style.setProperty('--tilt', `${tilt}deg`);
  el.style.setProperty('--spin', `${spinSecs.toFixed(1)}s`);
  el.style.setProperty('--bob', `${bobSecs.toFixed(1)}s`);
  el.style.setProperty('--bob-delay', `${bobDelay.toFixed(1)}s`);

  let critterSvg = null;
  el.update = (next, opts = {}) => {
    planet = next;
    el.planet = next;
    const s = opts.size || size || planetSize(next.count);
    el.style.setProperty('--s', `${s}px`);
    const c = next.icon?.c || '#2F6BFF';
    el.style.setProperty('--c', c);
    el.style.setProperty('--c-light', shade(c, '#ffffff', 0.45));
    el.style.setProperty('--c-dark', shade(c, '#050a2a', 0.62));
    el.classList.toggle('is-locked', !!next.locked);
    el.classList.toggle('has-rings', (next.count || 0) >= 8);
    el.classList.toggle('is-empty', !next.count);
    const previews = next.previews || [];
    fillSurface(spin, next.locked ? [] : previews);
    fillMoons(moons, next.locked ? [] : previews, s);
    if (next.icon) {
      critterSvg = renderIcon(next.icon, { size: Math.round(Math.max(14, Math.min(26, s * 0.2))) });
      critter.replaceChildren(critterSvg);
    }
    name.textContent = next.title;
    const bits = [];
    const vis = next.community ? 'community' : next.visibility;
    if (next.mine !== false && vis !== 'pin') bits.push(glyph(vis, 10));
    if (next.locked) bits.push(glyph('lock', 10));
    bits.push(h('span', null, next.count ? String(next.count) : 'empty'));
    meta.replaceChildren(...bits);
    el.setAttribute('aria-label', `${next.title}, ${next.locked ? 'locked' : plural(next.count || 0, 'file')}`);
  };
  el.update(planet);

  el.addEventListener('pointerenter', () => blink(critterSvg));
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
  // A satisfied little gulp when something arrives.
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

// ---------------------------------------------------------------- stars

export const STAR_COLORS = {
  image: '#FFD66B', video: '#FF8FC8', audio: '#7CF2C4', pdf: '#FFAD73', doc: '#FFC99E',
  link: '#7FE0FF', text: '#F4F7FF', code: '#B9A3FF', archive: '#C9D3E6', other: '#C9D3E6',
};

let starCount = 0;
// A glossy four-point star, coloured by what kind of file it is.
export function starIcon(kind, size = 30) {
  const id = `sg${starCount++}`;
  const color = STAR_COLORS[kind] || STAR_COLORS.other;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '-1.1 -1.1 2.2 2.2');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'star-icon');
  svg.style.setProperty('--star', color);
  svg.innerHTML = `
    <defs>
      <radialGradient id="${id}f" cx="0.42" cy="0.4" r="0.62">
        <stop offset="0" stop-color="#fff"/>
        <stop offset="0.38" stop-color="${color}"/>
        <stop offset="1" stop-color="${shade(color, '#1a1f5a', 0.55)}"/>
      </radialGradient>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.85"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="M0 -1 C0.13 -0.3 0.3 -0.13 1 0 C0.3 0.13 0.13 0.3 0 1 C-0.13 0.3 -0.3 0.13 -1 0 C-0.3 -0.13 -0.13 -0.3 0 -1Z"
      fill="url(#${id}f)" stroke="rgba(255,255,255,0.7)" stroke-width="0.035"/>
    <ellipse cx="-0.06" cy="-0.2" rx="0.11" ry="0.2" fill="url(#${id}g)"/>`;
  return svg;
}
