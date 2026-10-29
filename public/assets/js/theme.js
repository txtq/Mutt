// Your look & feel: the sky, text size, motion and logo. Saved with your
// account and cached locally so pages open already dressed.

import { api, session } from './api.js';
import { DEFAULT_LOGO, followLogo } from './logo.js';
import { burst } from './fx.js';
import { PALETTE, generateIcon } from './pixel.js';
import { debounce, reducedMotion, seeded } from './util.js';

export const DEFAULTS = {
  size: 'm', motion: 'fluid', logo: DEFAULT_LOGO, sky: 'vita', autosort: false, mode: 'dark',
};

// Skies to live under, by night and by day. [deep, glow] for the picker;
// the rest is in galaxy.css.
export const SKIES = {
  vita: { label: 'Vita', swatch: ['#06123f', '#2f6bff'], day: ['#c9d8f2', '#f4f7fd'], theme: '#071440', dayTheme: '#e9eff9' },
  nebula: { label: 'Nebula', swatch: ['#160a3d', '#8f6bf0'], day: ['#d9d0f2', '#f7f5fd'], theme: '#140b38', dayTheme: '#efecfa' },
  aurora: { label: 'Aurora', swatch: ['#03212e', '#2fbf9f'], day: ['#c8e6e0', '#f3faf8'], theme: '#04202c', dayTheme: '#e8f4f1' },
  dusk: { label: 'Dusk', swatch: ['#26092e', '#e0727f'], day: ['#f0d5d2', '#fcf6f4'], theme: '#230a2b', dayTheme: '#f7ecea' },
};

export const MODES = { auto: 'Auto', light: 'Light', dark: 'Dark' };

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
// Light or dark, once Auto has asked the system.
export const modeOf = (p = {}) => (p.mode === 'light' || p.mode === 'dark' ? p.mode : darkQuery.matches ? 'dark' : 'light');
let applied = DEFAULTS;
let nightHeld = false; // the sign-in page is always night
darkQuery.addEventListener?.('change', () => { if (applied.mode === 'auto') applyPrefs(applied); });

const CACHE = 'mutt.prefs';
const SIZES = { s: 0.93, m: 1, l: 1.1 };

export function applyPrefs(raw = {}) {
  const p = { ...DEFAULTS, ...raw };
  applied = p;
  const root = document.documentElement;
  const mode = nightHeld ? 'dark' : modeOf(p);
  const sky = SKIES[p.sky] || SKIES.vita;
  root.style.setProperty('--t', SIZES[p.size] || 1);
  root.dataset.motion = p.motion;
  root.dataset.logo = p.logo;
  root.dataset.sky = SKIES[p.sky] ? p.sky : 'vita';
  root.dataset.mode = mode;
  root.style.colorScheme = mode;
  followLogo(p.logo);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'light' ? sky.dayTheme : sky.theme);
  document.dispatchEvent(new CustomEvent('mutt:mode', { detail: mode }));
  return p;
}

// Keep it night whatever the saved mode, until let go.
export function holdNight(on) {
  if (nightHeld === on) return;
  nightHeld = on;
  applyPrefs(applied);
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

// ---------------------------------------------------------------- little touches

// The same name always gets the same critter.
export function critterFor(seed, index = 0) {
  return generateIcon(seeded(`${seed}:${index}`));
}

export function tintFor(id) {
  const r = seeded(id)();
  return PALETTE[Math.floor(r * PALETTE.length)];
}

// A glint of light where something just landed.
export function sparkle(anchor) {
  if (reducedMotion() || !anchor?.isConnected) return;
  const r = anchor.getBoundingClientRect();
  burst({ x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 40) }, { count: 6, reach: 24 });
}
