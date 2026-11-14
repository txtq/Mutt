// The thin bar along the top, like the Vita's: the wordmark on the left,
// whose galaxy this is in the middle (tap it for your account and settings),
// and search and the time on the right. Away from home, a faint back arrow
// in the top corner takes you back: from someone else's planet to their
// galaxy, from their galaxy out to the universe, and from there home.

import { api, session } from './api.js';
import { glitch, logo } from './logo.js';
import { nav } from './nav.js';
import { DEFAULTS, SKIES, updatePrefs } from './theme.js';
import { closeTopLayer, confirmDialog, openContextMenu, openMenu, sectionHead, segmented, toast } from './ui.js';
import { bus, DUR, EASE_LEAVE, h, plural } from './util.js';
import { renderCell } from './cells.js';
import { restoreBlock } from './actions.js';
import { changePin, deleteAccount, signOut } from './account.js';
import { searchBody } from './search.js';
import { icon } from './icons.js';
import { commentNotes } from './commentnotes.js';

const current = () => ({ ...DEFAULTS, ...session.prefs });
const save = (patch) => updatePrefs(patch, (err) => err && toast(err.message));

// ---------------------------------------------------------------- sheets (drop down from the bar)

const sheets = new Set();
function sheet(className, build) {
  const el = h('div', { class: `sheet ${className}`, role: 'dialog' });
  el.inert = true;   // closed, nothing in it takes the keyboard
  document.body.append(el);
  let open = false;
  let anchor = null;
  // Menus and dialogs opened from a sheet sit outside it; using them keeps it open, and Escape closes them first.
  const outside = (e) => { if (!el.contains(e.target) && !anchor?.contains(e.target) && !e.target.closest?.('.pop, .scrim')) close(); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); if (!closeTopLayer()) close(); } };
  function show(from) {
    for (const s of sheets) if (s !== api_) s.close();
    anchor = from;
    el.replaceChildren(build(close));
    el.inert = false;
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
    el.inert = true;
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

// Forget where you put your planets; they find their own places again.
async function tidyPlanets() {
  const ok = await confirmDialog({
    title: 'Tidy your planets?',
    message: 'They leave the spots you put them in and settle evenly round the void again.',
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

// ---------------------------------------------------------------- recently deleted

// Deleted files wait here a week before they go for good. The section shows
// only while something is waiting; a file is put back from its menu.
const FIRST = 6;   // two rows, shown before "Show all"
const DAY = 86400000;

function leftOf(block) {
  const days = Math.ceil((block.goneAt - Date.now()) / DAY);
  return days > 1 ? `${plural(days, 'day')} left` : 'Goes today';
}

function recentlyDeleted() {
  const el = h('section', { class: 'sheet-deleted', hidden: true, 'aria-label': 'Recently deleted' });
  let blocks = [];
  let all = false;
  const grid = h('div', { class: 'grid sheet-deleted-files' });
  const more = h('button', { type: 'button', class: 'btn btn-quiet btn-small sheet-deleted-more', onclick: () => { all = true; paint(); } });
  const empty = h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: emptyAll }, 'Empty');
  const head = sectionHead('Recently deleted', { tools: [empty] });
  el.append(head.el, grid, more);

  function paint() {
    el.hidden = !blocks.length;
    head.fact.textContent = `${blocks.length} · kept a week`;
    const shown = all ? blocks : blocks.slice(0, FIRST);
    grid.replaceChildren(...shown.map(cellFor));
    more.hidden = shown.length === blocks.length;
    more.textContent = `Show all ${blocks.length}`;
  }

  function cellFor(block) {
    const cell = renderCell(block, { actions: false });
    const cap = cell.querySelector('.cell-cap');
    cap.querySelector('.cell-fact')?.remove();
    cap.append(h('span', { class: 'cell-fact' }, leftOf(block)));
    cell.setAttribute('role', 'button');
    cell.setAttribute('aria-haspopup', 'menu');
    const items = () => [
      { icon: 'undo', label: 'Put back', run: () => putBack(block, cell) },
      { icon: 'trash', label: 'Delete now…', danger: true, run: () => eraseOne(block, cell) },
    ];
    cell.addEventListener('click', () => openMenu(cell, items()));
    cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu(cell, items()); } });
    cell.addEventListener('contextmenu', (e) => openContextMenu(e, items(), { target: cell }));
    return cell;
  }

  // A box leaving the section folds away before the rest close the gap.
  async function leave(block, cell) {
    blocks = blocks.filter((b) => b.id !== block.id);
    await cell.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.92)' }],
      { duration: DUR.change, easing: EASE_LEAVE }).finished.catch(() => {});
    paint();
  }

  async function putBack(block, cell) {
    const back = await restoreBlock(block);
    if (!back) return;
    leave(block, cell);
    const names = back.connections.filter((c) => back.drawers.includes(c.id)).map((c) => c.title);
    toast(names.length === 1 ? `Put back on ${names[0]}` : names.length ? `Put back on ${plural(names.length, 'planet')}` : 'Put back as a star');
  }

  async function eraseOne(block, cell) {
    const ok = await confirmDialog({
      title: 'Delete this file for good?',
      message: 'It can’t be brought back.',
      confirm: 'Delete for good',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/blocks/${block.id}`);
      leave(block, cell);
    } catch (err) {
      toast(err.message);
    }
  }

  async function emptyAll() {
    const ok = await confirmDialog({
      title: 'Empty Recently deleted?',
      message: `${plural(blocks.length, 'file')} will be gone for good. This can’t be undone.`,
      confirm: 'Empty',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del('/api/deleted');
      blocks = [];
      paint();
      toast('Recently deleted is empty');
    } catch (err) {
      toast(err.message);
    }
  }

  api.get('/api/deleted').then((res) => { blocks = res.blocks || []; paint(); }).catch(() => {});
  return el;
}

function settingsBody(close) {
  const stats = { files: 0, drawers: 0, stars: 0, ...session.stats };
  return h('div', { class: 'sheet-in' },
    h('header', { class: 'sheet-head' },
      h('div', null,
        h('div', { class: 'sheet-who' }, `@${session.user.username}`),
        h('div', { class: 'sheet-sub' }, `${plural(stats.files, 'file')} · ${plural(stats.drawers, 'planet')} · ${plural(stats.stars, 'star')}`)),
      location.pathname !== '/'
        ? h('button', { type: 'button', class: 'btn btn-main', onclick: () => { close(); nav.go('/'); } }, 'Your galaxy')
        : null),
    row('Sky', skyPicker()),
    row('Text', choice('size', [{ value: 's', label: 'S' }, { value: 'm', label: 'M' }, { value: 'l', label: 'L' }])),
    row('Motion', choice('motion', [{ value: 'fluid', label: 'Lively' }, { value: 'calm', label: 'Calm' }, { value: 'off', label: 'Still' }])),
    row('Music', choice('music', [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }])),
    recentlyDeleted(),
    h('div', { class: 'sheet-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => { close(); tidyPlanets(); } }, 'Tidy planets'),
      h('button', { type: 'button', class: 'btn', onclick: () => { close(); changePin(); } }, 'Change code'),
      h('button', { type: 'button', class: 'btn', onclick: () => { close(); signOut(); } }, 'Sign out'),
      h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => { close(); deleteAccount(); } }, 'Delete account')));
}

// ---------------------------------------------------------------- the bar

export function createStatusbar() {
  const mark = logo();
  const whoName = h('span', { class: 'sb-who-name' });
  const who = h('button', { type: 'button', class: 'btn btn-quiet btn-small sb-who', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' },
    whoName, icon('caret'));
  const searchBtn = h('button', { type: 'button', class: 'btn btn-quiet btn-round btn-small sb-btn', 'aria-label': 'Search', title: 'Search (/)' }, icon('search'));
  const clock = h('span', { class: 'sb-clock' });
  const bar = h('header', { class: 'sb' },
    h('div', { class: 'sb-left' }, mark),
    who,
    h('div', { class: 'sb-right' }, searchBtn, clock));

  // Home: a faint back arrow in the corner, back to your own galaxy. On
  // someone else's galaxy it first pulls back into the universe round them.
  const home = h('button', { type: 'button', class: 'home-back', 'aria-label': 'Back to your galaxy', title: 'Your galaxy', hidden: true }, icon('back', 20));
  document.body.append(home);
  let current = null;
  home.addEventListener('click', () => {
    if (current?.goHome) current.goHome();
    else nav.go('/');
  });
  let out = false;
  // New comments on your files, under the clock, while you're on your own galaxy.
  const notes = commentNotes();
  const showNotes = () => notes.set(!!session.user && current?.chrome === 'galaxy' && !!current?.who?.you && !out);
  const showHome = () => {
    home.hidden = !session.user || !current?.home;
    // On a phone the arrow sits in the bar, so the bar makes room for it.
    document.body.classList.toggle('has-home', !home.hidden);
    const label = current?.chrome === 'galaxy' && !out ? 'Out to the universe' : current?.homeLabel || 'Your galaxy';
    home.title = label;
    home.setAttribute('aria-label', label === 'Out to the universe' ? 'Back out to the universe' : `Back to ${label === 'Your galaxy' ? 'your galaxy' : label}`);
  };
  bus.on('universe', (on) => {
    out = on;
    paintWho();
    showHome();
    showNotes();
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
      showNotes();
      if (session.user && !glitched) {
        glitched = true;
        requestAnimationFrame(() => glitch(mark));
      }
      settings.close();
      search.close();
    },
  };
}
