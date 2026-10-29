// The thin bar along the top, like the Vita's: the wordmark on the left,
// whose galaxy this is in the middle (tap it for settings), and search, a
// count and the time on the right.

import { api, session } from './api.js';
import { LOGOS, glitch, logo } from './logo.js';
import { nav } from './nav.js';
import { glyph, planetEl } from './planets.js';
import { DEFAULTS, SKIES, updatePrefs } from './theme.js';
import { segmented, toast } from './ui.js';
import { bus, debounce, h, plural } from './util.js';
import { changePin, deleteAccount, signOut } from './account.js';
import { renderCell } from './cells.js';

const current = () => ({ ...DEFAULTS, ...session.prefs });
const save = (patch) => updatePrefs(patch, (err) => err && toast(err.message));

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

function settingsBody(close) {
  const stats = session.stats || { files: 0, drawers: 0 };
  return h('div', { class: 'sheet-in' },
    h('header', { class: 'sheet-head' },
      h('div', null,
        h('div', { class: 'sheet-who' }, `@${session.user.username}`),
        h('div', { class: 'sheet-sub' }, `${plural(stats.files, 'file')} · ${plural(stats.drawers, 'planet')}`)),
      location.pathname !== '/'
        ? h('button', { type: 'button', class: 'vbtn vbtn-blue', onclick: () => { close(); nav.go('/'); } }, 'Your galaxy')
        : null),
    row('Sky', skyPicker()),
    row('Logo', logoPicker()),
    row('Autosort', autosortSwitch()),
    row('Text', choice('size', [{ value: 's', label: 'S' }, { value: 'm', label: 'M' }, { value: 'l', label: 'L' }])),
    row('Motion', choice('motion', [{ value: 'fluid', label: 'Lively' }, { value: 'calm', label: 'Calm' }, { value: 'off', label: 'Still' }])),
    h('div', { class: 'sheet-actions' },
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
  const count = h('span', { class: 'sb-count', title: 'Files' }, glyph('star', 10), h('span'));
  const clock = h('span', { class: 'sb-clock' });
  const bar = h('header', { class: 'sb' },
    h('div', { class: 'sb-left' }, mark),
    who,
    h('div', { class: 'sb-right' }, searchBtn, count, clock));

  const settings = sheet('sheet-settings', settingsBody);
  const search = sheet('sheet-search-wrap', searchBody);
  who.addEventListener('click', () => settings.toggle(who));
  searchBtn.addEventListener('click', () => search.toggle(searchBtn));

  const tick = () => {
    clock.textContent = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
  };
  tick();
  setInterval(tick, 15000);

  const showCount = () => { count.lastChild.textContent = session.stats ? session.stats.files.toLocaleString() : ''; };
  bus.on('stats:changed', showCount);

  let glitched = false;
  return {
    el: bar,
    search: { focus: () => search.show(searchBtn) },
    update(inst) {
      const w = inst.who || { username: session.user?.username, you: true };
      whoName.replaceChildren();
      if (w.community) whoName.append('Community');
      else whoName.append(h('span', { class: 'sb-at' }, `@${w.username}`), '’s Galaxy');
      who.classList.toggle('is-other', !w.you);
      showCount();
      if (session.user && !glitched) {
        glitched = true;
        requestAnimationFrame(() => glitch(mark));
      }
      settings.close();
      search.close();
    },
  };
}
