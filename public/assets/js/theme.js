// Your look & feel: fonts, sizes, corners, colours and colorful mode.
// Saved with your account and cached locally so pages open already dressed.

import { api, session } from './api.js';
import { DEFAULT_LOGO, followLogo } from './logo.js';
import { PALETTE, generateIcon, renderIcon } from './pixel.js';
import { EASE, debounce, h, reducedMotion, seeded } from './util.js';

export const FONTS = {
  geist: { label: 'Geist', family: 'Geist', google: 'Geist:wght@400;500;600' },
  inter: { label: 'Inter', family: 'Inter', google: 'Inter:wght@400;500;600' },
  instrument: { label: 'Instrument', family: 'Instrument Sans', google: 'Instrument+Sans:wght@400;500;600' },
  grotesk: { label: 'Grotesk', family: 'Space Grotesk', google: 'Space+Grotesk:wght@400;500;600' },
  plex: { label: 'Plex', family: 'IBM Plex Sans', google: 'IBM+Plex+Sans:wght@400;500;600' },
  fraunces: { label: 'Fraunces', family: 'Fraunces', google: 'Fraunces:wght@400;500;600' },
  newsreader: { label: 'Newsreader', family: 'Newsreader', google: 'Newsreader:wght@400;500;600' },
  mono: { label: 'Mono', family: 'JetBrains Mono', google: 'JetBrains+Mono:wght@400;500;600' },
  pixel: { label: 'Pixel', family: 'Pixelify Sans', google: 'Pixelify+Sans:wght@400;500;600' },
};

export const PAPERS = { white: '#FFFFFF', warm: '#FBF8F2', cool: '#F4F7FA', blush: '#FDF4F5', mint: '#F2F8F4' };
export const ACCENTS = ['#111111', ...PALETTE];

export const DEFAULTS = {
  font: 'geist', size: 'm', corners: 'square', density: 'normal', captions: 'show',
  motion: 'fluid', paper: 'white', accent: '#111111', colorful: false, logo: DEFAULT_LOGO,
};

const CACHE = 'mutt.prefs';
const SIZES = { s: 0.93, m: 1, l: 1.1 };
const CORNERS = { square: ['0px', '9px'], soft: ['8px', '12px'], round: ['16px', '999px'] };
const DENSITY = { tight: ['16px', '26px'], normal: ['28px', '40px'], airy: ['44px', '60px'] };

const loadedFonts = new Set(['geist']);
export function loadFont(key) {
  const font = FONTS[key];
  if (!font || loadedFonts.has(key)) return;
  loadedFonts.add(key);
  document.head.append(h('link', { rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?family=${font.google}&display=swap` }));
}

function contrastText(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#111111' : '#FFFFFF';
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * (1 - amount))));
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

let customFont = null;

export function applyPrefs(raw = {}) {
  const p = { ...DEFAULTS, ...raw };
  const root = document.documentElement;
  const css = root.style;

  let family;
  if (p.font === 'custom' && p.fontFile) {
    if (customFont?.key !== p.fontFile) {
      customFont?.el.remove();
      const el = h('style', null, `@font-face{font-family:"Mutt Custom";src:url("/api/me/font?v=${encodeURIComponent(p.fontFile)}");font-display:swap}`);
      document.head.append(el);
      customFont = { key: p.fontFile, el };
    }
    family = '"Mutt Custom"';
  } else {
    const key = FONTS[p.font] ? p.font : 'geist';
    loadFont(key);
    family = `"${FONTS[key].family}"`;
  }
  css.setProperty('--font-pick', family);
  css.setProperty('--t', SIZES[p.size] || 1);
  const [cell, ui] = CORNERS[p.corners] || CORNERS.square;
  css.setProperty('--r-cell', cell);
  css.setProperty('--r-ui', ui);
  const [gx, gy] = DENSITY[p.density] || DENSITY.normal;
  css.setProperty('--gap-x', gx);
  css.setProperty('--gap-y', gy);
  const paper = PAPERS[p.paper] || PAPERS.white;
  css.setProperty('--bg', paper);
  css.setProperty('--tint', shade(paper, 0.035));
  css.setProperty('--tint-2', shade(paper, 0.06));
  css.setProperty('--accent', p.accent);
  css.setProperty('--on-accent', contrastText(p.accent));
  root.dataset.captions = p.captions;
  root.dataset.motion = p.motion;
  root.classList.toggle('colorful', !!p.colorful);
  root.dataset.logo = p.logo;
  followLogo(p.logo);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', paper);
  return p;
}

export function bootPrefs() {
  try {
    applyPrefs(JSON.parse(localStorage.getItem(CACHE) || '{}'));
  } catch {
    applyPrefs({});
  }
}

export function setPrefs(prefs) {
  session.prefs = prefs || {};
  try { localStorage.setItem(CACHE, JSON.stringify(session.prefs)); } catch { /* private mode */ }
  return applyPrefs(session.prefs);
}

const pushPrefs = debounce(async (patch, done) => {
  try {
    const { prefs } = await api.post('/api/me/prefs', patch);
    setPrefs(prefs);
    done?.(null);
  } catch (err) {
    done?.(err);
  }
}, 350);

let pendingPatch = {};
export function updatePrefs(patch, done) {
  pendingPatch = { ...pendingPatch, ...patch };
  setPrefs({ ...session.prefs, ...patch });
  const send = pendingPatch;
  pushPrefs(send, (err) => {
    if (send === pendingPatch) pendingPatch = {};
    done?.(err);
  });
}

export function forgetPrefs() {
  try { localStorage.removeItem(CACHE); } catch { /* ignore */ }
  session.prefs = {};
  applyPrefs({});
}

// ---------------------------------------------------------------- colorful mode

export const isColorful = () => document.documentElement.classList.contains('colorful');

// The same name always gets the same little crowd.
export function critterFor(seed, index = 0) {
  return generateIcon(seeded(`${seed}:${index}`));
}

export function tintFor(id) {
  const r = seeded(id)();
  return PALETTE[Math.floor(r * PALETTE.length)];
}

export function parade(seed, count = 5, size = 18) {
  return h('span', { class: 'parade', 'aria-hidden': 'true' },
    Array.from({ length: count }, (_, i) => {
      const svg = renderIcon(critterFor(seed, i), { size });
      svg.style.setProperty('--i', i);
      return svg;
    }));
}

// A little burst of coloured pixels, for when something lands.
export function sparkle(anchor) {
  if (!isColorful() || reducedMotion() || !anchor?.isConnected) return;
  const r = anchor.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + Math.min(r.height / 2, 40);
  for (let i = 0; i < 10; i++) {
    const dot = h('span', { class: 'spark', style: { left: `${x}px`, top: `${y}px`, background: PALETTE[i % PALETTE.length] } });
    document.body.append(dot);
    const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 26 + Math.random() * 30;
    dot.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(0.4)`, opacity: 0 },
    ], { duration: 650 + Math.random() * 250, easing: EASE }).finished.then(() => dot.remove(), () => dot.remove());
  }
}
