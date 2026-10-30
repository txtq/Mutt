// Your look & feel: the sky, text size, motion and logo. Saved with your
// account and cached locally so pages open already dressed.

import { api, session } from './api.js';
import { DEFAULT_LOGO, followLogo } from './logo.js';
import { burst } from './fx.js';
import { PALETTE, debounce, reducedMotion, seeded } from './util.js';

export const DEFAULTS = {
  size: 'm', motion: 'fluid', logo: DEFAULT_LOGO, sky: 'vita', autosort: false,
};

// Skies to live under. [deep, glow] for the picker;
// the rest is in galaxy.css.
export const SKIES = {
  vita: { label: 'Vita', swatch: ['#06123f', '#2f6bff'], theme: '#071440' },
  nebula: { label: 'Nebula', swatch: ['#160a3d', '#8f6bf0'], theme: '#140b38' },
  aurora: { label: 'Aurora', swatch: ['#03212e', '#2fbf9f'], theme: '#04202c' },
  dusk: { label: 'Dusk', swatch: ['#26092e', '#e0727f'], theme: '#230a2b' },
};

const CACHE = 'mutt.prefs';
const SIZES = { s: 0.93, m: 1, l: 1.1 };

export function applyPrefs(raw = {}) {
  const p = { ...DEFAULTS, ...raw };
  const root = document.documentElement;
  const sky = SKIES[p.sky] || SKIES.vita;
  root.style.setProperty('--t', SIZES[p.size] || 1);
  root.dataset.motion = p.motion;
  root.dataset.logo = p.logo;
  root.dataset.sky = SKIES[p.sky] ? p.sky : 'vita';
  followLogo(p.logo);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sky.theme);
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

// ---------------------------------------------------------------- little touches

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
