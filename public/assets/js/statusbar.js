// The thin bar along the top, like the Vita's: the wordmark on the left,
// whose galaxy this is in the middle (tap it for your account and settings),
// and search and the time on the right. Away from home, a little ship waits
// in the top corner: tap it to fly back to your own galaxy.

import { api, session } from './api.js';
import { LOGOS, glitch, logo } from './logo.js';
import { nav } from './nav.js';
import { glyph, planetEl } from './planets.js';
import { DEFAULTS, MODES, SKIES, updatePrefs } from './theme.js';
import { confirmDialog, segmented, toast } from './ui.js';
import { bus, debounce, h, plural, reducedMotion } from './util.js';
import { changePin, deleteAccount, signOut } from './account.js';
import { renderCell } from './cells.js';

const current = () => ({ ...DEFAULTS, ...session.prefs });
const save = (patch) => updatePrefs(patch, (err) => err && toast(err.message));

// ---------------------------------------------------------------- the ship home

// Drawn nose up; CSS turns it toward the wordmark.
const SHIP = `<svg viewBox="0 0 32 32" aria-hidden="true">
  <defs>
    <linearGradient id="ship-hull" x1="0" x2="1">
      <stop offset="0" class="ship-hull-a"/><stop offset="0.45" class="ship-hull-b"/><stop offset="1" class="ship-hull-c"/>
    </linearGradient>
    <linearGradient id="ship-fire" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff4d6"/><stop offset="0.35" stop-color="#ffb347"/><stop offset="1" stop-color="#ff7a3a" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="ship-glass" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#cfe6ff"/><stop offset="0.5" stop-color="#4f8dff"/><stop offset="1" stop-color="#1b2f74"/>
    </radialGradient>
  </defs>
  <path class="ship-fire" d="M13.2 23.2h5.6L16 31.5z" fill="url(#ship-fire)"/>
  <path class="ship-fin" d="M11.6 15.5 6.5 22.4v2.1l5.2-2.6zM20.4 15.5l5.1 6.9v2.1l-5.2-2.6z"/>
  <path class="ship-hull" d="M16 2.2c3.6 3 5.4 8.4 5.1 14.6l-.4 6.4H11.3l-.4-6.4C10.6 10.6 12.4 5.2 16 2.2z" fill="url(#ship-hull)"/>
  <path class="ship-nozzle" d="M12.6 23.2h6.8l-.9 1.6h-5z"/>
  <path class="ship-keel" d="M16 18.5v6.2"/>
  <circle cx="16" cy="11.2" r="2.7" fill="url(#ship-glass)" class="ship-window"/>
  <circle cx="15.1" cy="10.3" r="0.8" fill="#fff" opacity="0.85"/>
</svg>`;

// A point and heading `t` of the way along a cubic curve.
function bezier(p, t) {
  const u = 1 - t;
  const at = (k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k];
  const d = (k) => 3 * u * u * (p[1][k] - p[0][k]) + 6 * u * t * (p[2][k] - p[1][k]) + 3 * t * t * (p[3][k] - p[2][k]);
  return { x: at(0), y: at(1), heading: (Math.atan2(d(0), -d(1)) * 180) / Math.PI };
}

// The take-off: a shudder as it lights, then a lift along its nose, a wide
// swing out over the page (growing as it comes toward you) and a climb up
// off the top, leaving a fading trail. The page drops away behind it.
async function launch(btn, craft, page) {
  const r = btn.getBoundingClientRect();
  const x0 = r.left + r.width / 2;
  const y0 = r.top + r.height / 2;
  const tilt = parseFloat(getComputedStyle(btn).getPropertyValue('--aim')) || 0;
  const rad = (tilt * Math.PI) / 180;
  const w = innerWidth;
  const hgt = innerHeight;
  const curve = [
    [x0, y0],
    [x0 + Math.sin(rad) * hgt * 0.5, y0 - Math.cos(rad) * hgt * 0.5 + hgt * 0.35],
    [w * 0.78, hgt * 0.95],
    [w * 0.6, -hgt * 0.3],
  ];
  // Even steps along the curve's length, so the ship and its trail keep pace.
  const fine = Array.from({ length: 121 }, (_, i) => bezier(curve, i / 120));
  const run = [0];
  for (let i = 1; i < fine.length; i++) run.push(run[i - 1] + Math.hypot(fine[i].x - fine[i - 1].x, fine[i].y - fine[i - 1].y));
  const total = run[run.length - 1];
  const steps = 30;
  let turn = tilt;
  const frames = [];
  for (let i = 0, j = 0; i <= steps; i++) {
    while (j < fine.length - 1 && run[j] < (total * i) / steps) j++;
    const p = fine[j];
    // Keep turning the short way round.
    let heading = p.heading;
    while (heading - turn > 180) heading -= 360;
    while (heading - turn < -180) heading += 360;
    turn = i === 0 ? tilt : heading;
    const grow = 1 + 2.4 * Math.sin((Math.PI * i) / steps * 0.85);
    frames.push({ transform: `translate(${(p.x - x0).toFixed(1)}px, ${(p.y - y0).toFixed(1)}px) rotate(${(turn - tilt).toFixed(1)}deg) scale(${grow.toFixed(2)})` });
  }

  const trail = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  trail.setAttribute('class', 'home-ship-trail');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', `M${curve[0]} C${curve[1]} ${curve[2]} ${curve[3]}`);
  line.setAttribute('pathLength', '1');
  trail.append(line);
  document.body.append(trail);

  btn.classList.add('is-lit');
  await craft.animate([
    { transform: 'none' }, { transform: 'translate(-0.6px, 0.8px)' }, { transform: 'translate(0.6px, 0.4px)' },
    { transform: 'translate(-0.4px, 1px)' }, { transform: 'translate(0, 1.4px)' },
  ], { duration: 260, easing: 'linear' }).finished.catch(() => {});

  const time = { duration: 1250, easing: 'cubic-bezier(0.35, 0, 0.65, 0.6)' };
  page?.animate([
    { transform: 'none', opacity: 1 },
    { transform: 'translateY(36px) scale(0.97)', opacity: 0 },
  ], { ...time, duration: 900, delay: 250, fill: 'forwards' });
  line.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { ...time, fill: 'forwards' });
  trail.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 1500, fill: 'forwards' })
    .finished.then(() => trail.remove(), () => trail.remove());
  await btn.animate(frames, { ...time, fill: 'forwards' }).finished.catch(() => {});
  btn.classList.remove('is-lit');
}

// ---------------------------------------------------------------- sheets (drop down from the bar)

const sheets = new Set();
function sheet(className, build) {
  const el = h('div', { class: `sheet ${className}`, role: 'dialog' });
  document.body.append(el);
  let open = false;
  let anchor = null;
  const outside = (e) => { if (!el.contains(e.target) && !anchor?.contains(e.target)) close(); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  function show(from) {
    for (const s of sheets) if (s !== api_) s.close();
    anchor = from;
    el.replaceChildren(build(close));
    open = true;
    anchor?.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => { if (open) el.classList.add('is-open'); });
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
  }
  function close() {
    if (!open) return;
    open = false;
    el.classList.remove('is-open');
    anchor?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', key, true);
    if (el.contains(document.activeElement)) anchor?.focus({ preventScroll: true });
  }
  const api_ = { el, show, close, toggle: (from) => (open ? close() : show(from)), isOpen: () => open };
  sheets.add(api_);
  return api_;
}

export const closeSheets = () => { let any = false; for (const s of sheets) if (s.isOpen()) { s.close(); any = true; } return any; };

function row(label, control) {
  return h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, label), h('div', { class: 'set-control' }, control));
}

function choice(key, options) {
  const seg = segmented(options, current()[key], (value) => { seg.set(value); save({ [key]: value }); }, { className: 'set-seg', label: key });
  return seg.el;
}

function skyPicker() {
  const wrap = h('div', { class: 'sky-picks' });
  const paint = () => wrap.querySelectorAll('.sky-pick').forEach((b) => b.setAttribute('aria-pressed', b.dataset.value === current().sky));
  for (const [value, sky] of Object.entries(SKIES)) {
    wrap.append(h('button', {
      type: 'button', class: 'sky-pick', dataset: { value }, 'aria-label': sky.label, title: sky.label,
      style: { '--a': sky.swatch[0], '--b': sky.swatch[1] },
      onclick: () => { save({ sky: value }); paint(); },
    }, h('span', { class: 'sky-pick-ball' }), h('span', { class: 'sky-pick-name' }, sky.label)));
  }
  paint();
  return wrap;
}

function logoPicker() {
  const wrap = h('div', { class: 'logo-picks' });
  const paint = () => wrap.querySelectorAll('.logo-pick').forEach((t) => t.setAttribute('aria-pressed', t.dataset.value === current().logo));
  for (const { value, label } of LOGOS) {
    wrap.append(h('button', {
      type: 'button', class: 'logo-pick', dataset: { value }, 'aria-label': label, title: label,
      onclick: () => { save({ logo: value }); paint(); },
    }, logo({ href: null, variant: value })));
  }
  paint();
  return wrap;
}

function autosortSwitch() {
  const input = h('input', { type: 'checkbox', role: 'switch', checked: !!current().autosort });
  input.addEventListener('change', () => save({ autosort: input.checked }));
  return h('label', { class: 'vswitch' }, input, h('span', { class: 'vswitch-track' }, h('span', { class: 'vswitch-knob' })),
    h('span', { class: 'set-note' }, 'New things find their own planet'));
}

// Forget where you put your planets; they find their own places again.
async function tidyPlanets() {
  const ok = await confirmDialog({
    title: 'Tidy your planets?',
    message: 'They leave the spots you put them in and spread out on their own again.',
    confirm: 'Tidy planets',
  });
  if (!ok) return;
  try {
    await api.put('/api/galaxy/layout', { reset: true });
    bus.emit('drawer:changed', null);
  } catch (err) {
    toast(err.message);
  }
}

function settingsBody(close) {
  const stats = { files: 0, drawers: 0, stars: 0, ...session.stats };
  return h('div', { class: 'sheet-in' },
    h('header', { class: 'sheet-head' },
      h('div', null,
        h('div', { class: 'sheet-who' }, `@${session.user.username}`),
        h('div', { class: 'sheet-sub' }, `${plural(stats.files, 'file')} · ${plural(stats.drawers, 'planet')} · ${plural(stats.stars, 'star')}`)),
      location.pathname !== '/'
        ? h('button', { type: 'button', class: 'vbtn vbtn-blue', onclick: () => { close(); nav.go('/'); } }, 'Your galaxy')
        : null),
    row('Mode', choice('mode', Object.entries(MODES).map(([value, label]) => ({ value, label })))),
    row('Sky', skyPicker()),
    row('Logo', logoPicker()),
    row('Autosort', autosortSwitch()),
    row('Text', choice('size', [{ value: 's', label: 'S' }, { value: 'm', label: 'M' }, { value: 'l', label: 'L' }])),
    row('Motion', choice('motion', [{ value: 'fluid', label: 'Lively' }, { value: 'calm', label: 'Calm' }, { value: 'off', label: 'Still' }])),
    h('div', { class: 'sheet-actions' },
      h('button', { type: 'button', class: 'vbtn vbtn-glass', onclick: () => { close(); tidyPlanets(); } }, 'Tidy planets'),
      h('button', { type: 'button', class: 'vbtn vbtn-glass', onclick: () => { close(); changePin(); } }, 'Change code'),
      h('button', { type: 'button', class: 'vbtn vbtn-glass', onclick: () => { close(); signOut(); } }, 'Sign out'),
      h('button', { type: 'button', class: 'link is-danger', onclick: () => { close(); deleteAccount(); } }, 'Delete account')));
}

// ---------------------------------------------------------------- search

function searchBody(close) {
  const input = h('input', { class: 'sheet-search', type: 'search', placeholder: 'Search your planets and stars', 'aria-label': 'Search', autocomplete: 'off' });
  const results = h('div', { class: 'search-results' });
  let n = 0;
  const run = debounce(async () => {
    const q = input.value.trim();
    const mine = ++n;
    if (!q) { results.replaceChildren(); return; }
    try {
      const data = await api.get(`/api/search?q=${encodeURIComponent(q)}`);
      if (mine !== n) return;
      const planets = data.drawers.map((d) => {
        const el = planetEl(d, { size: 40 });
        el.classList.add('planet-mini');
        el.addEventListener('click', close);
        return el;
      });
      const files = data.blocks.slice(0, 60).map((b) => {
        const cell = renderCell(b, { actions: false });
        cell.addEventListener('click', () => { close(); nav.openBlock(b.id); });
        return cell;
      });
      results.replaceChildren(
        planets.length ? h('div', { class: 'search-planets' }, planets) : null,
        files.length ? h('div', { class: 'grid search-grid' }, files) : null,
        !planets.length && !files.length ? h('p', { class: 'search-none' }, 'Nothing out there by that name.') : null,
      );
    } catch (err) {
      results.replaceChildren(h('p', { class: 'search-none' }, err.message));
    }
  }, 180);
  input.addEventListener('input', run);
  setTimeout(() => input.focus(), 60);
  return h('div', { class: 'sheet-in' }, input, results);
}

// ---------------------------------------------------------------- the bar

export function createStatusbar() {
  const mark = logo();
  const whoName = h('span', { class: 'sb-who-name' });
  const who = h('button', { type: 'button', class: 'sb-who', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' },
    whoName, glyph('caret', 11));
  const searchBtn = h('button', { type: 'button', class: 'sb-btn', 'aria-label': 'Search', title: 'Search (/)' }, glyph('search', 14));
  const clock = h('span', { class: 'sb-clock' });
  const bar = h('header', { class: 'sb' },
    h('div', { class: 'sb-left' }, mark),
    who,
    h('div', { class: 'sb-right' }, searchBtn, clock));

  // Home: a little ship parked under the wordmark, nose toward it. Tap it and
  // it lifts off, swings out across the page and soars up out of sight,
  // taking you back to your own galaxy.
  const ship = h('span', { class: 'home-ship-craft', html: SHIP });
  const home = h('button', { type: 'button', class: 'home-ship', 'aria-label': 'Back to your galaxy', title: 'Your galaxy', hidden: true }, ship);
  document.body.append(home);
  let current = null;
  let flying = false;
  const aim = () => {
    if (home.hidden) return;
    const r = home.getBoundingClientRect();
    const m = mark.getBoundingClientRect();
    const a = Math.atan2(m.left + m.width / 2 - (r.left + r.width / 2), r.top + r.height / 2 - (m.top + m.height / 2));
    home.style.setProperty('--aim', `${((a * 180) / Math.PI).toFixed(1)}deg`);
  };
  addEventListener('resize', debounce(aim, 100));
  home.addEventListener('click', async () => {
    if (current?.goHome) { current.goHome(); return; }
    if (flying) return;
    flying = true;
    if (!reducedMotion()) await launch(home, ship, document.getElementById('view')?.firstElementChild);
    flying = false;
    nav.go('/', { motion: 'none' });
    home.getAnimations().forEach((a) => a.cancel());
  });
  const showHome = () => {
    home.hidden = !session.user || !current?.home;
    aim();
  };
  let out = false;
  bus.on('universe', (on) => {
    out = on;
    paintWho();
  });

  const settings = sheet('sheet-settings', settingsBody);
  const search = sheet('sheet-search-wrap', searchBody);
  who.addEventListener('click', () => settings.toggle(who));
  searchBtn.addEventListener('click', () => search.toggle(searchBtn));

  const tick = () => {
    clock.textContent = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
  };
  tick();
  setInterval(tick, 15000);

  function paintWho() {
    const w = current?.who || { username: session.user?.username, you: true };
    whoName.replaceChildren();
    if (out) whoName.append('Universe');
    else whoName.append(h('span', { class: 'sb-at' }, `@${w.username}`), '’s Galaxy');
    who.classList.toggle('is-other', !out && !w.you);
  }

  let glitched = false;
  return {
    el: bar,
    search: { focus: () => search.show(searchBtn) },
    update(inst) {
      current = inst;
      paintWho();
      showHome();
      if (session.user && !glitched) {
        glitched = true;
        requestAnimationFrame(() => glitch(mark));
      }
      settings.close();
      search.close();
    },
  };
}
