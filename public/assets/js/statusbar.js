// The thin bar along the top, like the Vita's: the wordmark on the left,
// whose galaxy this is in the middle (tap it for your account and settings),
// and search and the time on the right. Away from home, a faint back arrow
// in the top corner takes you back: from someone else's planet to their
// galaxy, from their galaxy out to the universe, and from there home.

import { api, session } from './api.js';
import { glitch, logo } from './logo.js';
import { nav } from './nav.js';
import { DEFAULTS, SKIES, updatePrefs } from './theme.js';
import { closeTopLayer, confirmDialog, openContextMenu, openMenu, segmented, sheetPages, toast } from './ui.js';
import { BEAT, bus, DUR, EASE_LEAVE, h, plural, shortName } from './util.js';
import { renderCell } from './cells.js';
import { restoreBlock } from './actions.js';
import { askForKey, askForName, changePin, deleteAccount, newRecoveryKey, saveName, signOut } from './account.js';
import { dropHeldSearch, heldSearch, searchBody } from './search.js';
import { icon } from './icons.js';
import { askToKeep, planetWith } from './keeping.js';
import { commentNotes } from './commentnotes.js';
import { sound } from './sound.js';

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
  // (what search found round the void belongs to search: pressing it keeps search open)
  const outside = (e) => { if (!el.contains(e.target) && !anchor?.contains(e.target) && !e.target.closest?.('.pop, .scrim, .gx-found')) close(); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); if (!closeTopLayer() && !body?.back?.()) close(); } };
  let body = null;
  function show(from) {
    for (const s of sheets) if (s !== api_) s.close();
    anchor = from;
    body = build(close);
    el.replaceChildren(body);
    el.inert = false;
    open = true;
    sound(className.includes('search') ? 'search' : 'sheet');
    anchor?.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => { if (open) el.classList.add('is-open'); });
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
  }
  function close() {
    if (!open) return;
    open = false;
    sound('unsheet');
    body?.onLeave?.();   // (search sends what it found home)
    el.tabsWith = null;
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

// ---------------------------------------------------------------- download everything

// Every file, a folder for each planet, and everything Mutt keeps about you,
// as one zip ("<username>'s galaxy"). Packing a big galaxy takes a while, so
// the button stays busy until the server's cookie says the download has begun.
const LONGEST = 30 * 60;   // beats to wait before giving up on hearing back

function downloadEverything() {
  const label = 'Download everything';
  const btn = h('button', { type: 'button', class: 'btn' }, label, icon('download'));
  const cookie = () => document.cookie.split('; ').find((c) => c.startsWith('mutt-export='))?.slice(12);
  const done = () => { document.cookie = 'mutt-export=; Path=/; Max-Age=0'; btn.disabled = false; btn.replaceChildren(label, icon('download')); };
  btn.addEventListener('click', () => {
    const mark = Math.random().toString(36).slice(2, 12);
    btn.disabled = true;
    btn.textContent = 'Packing your galaxy…';
    h('a', { href: `/api/me/export?mark=${mark}`, download: '' }).click();
    let beats = 0;
    const wait = setInterval(() => {
      const got = cookie();
      if (got === mark || got === `${mark}.x` || ++beats > LONGEST) {
        clearInterval(wait);
        done();
        if (got === `${mark}.x`) toast('Your galaxy couldn’t be packed. Try again in a moment.');
      }
    }, BEAT.quick);
  });
  return btn;
}

// ---------------------------------------------------------------- recently deleted

// Deleted files wait here a week before they go for good. The section shows
// only while something is waiting; a file is put back from its menu.
const FIRST = 8;   // two rows, shown before "Show all"
const DAY = 86400000;

function leftOf(block) {
  const days = Math.ceil((block.goneAt - Date.now()) / DAY);
  return days > 1 ? `${plural(days, 'day')} left` : 'Goes today';
}

// Its own page in the account sheet: the files, and for the page's head a fact and Empty.
// `onCount` hears how many are waiting, so the door can show the number (and hide at none).
function recentlyDeleted({ onCount }) {
  const el = h('section', { class: 'sheet-deleted', 'aria-label': 'Recently deleted' });
  let blocks = [];
  let all = false;
  const grid = h('div', { class: 'grid sheet-deleted-files' });
  const more = h('button', { type: 'button', class: 'btn btn-quiet btn-small sheet-deleted-more', onclick: () => { all = true; paint(); } });
  const empty = h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: emptyAll }, 'Empty');
  const fact = h('span', null);
  el.append(grid, more);

  function paint() {
    onCount(blocks.length);
    fact.textContent = `${plural(blocks.length, 'file')} · kept a week`;
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
  return { el, fact, tools: [empty] };
}

// The name you'd like to be called: any words, or none. Saved when you leave the box.
function nameField(paintHead) {
  const input = h('input', {
    class: 'field-bare sheet-name', type: 'text', maxlength: '40', value: session.user.name || '',
    placeholder: 'What people call you', 'aria-label': 'Your name', spellcheck: 'false',
  });
  const commit = async () => {
    const value = input.value.trim();
    if (value === (session.user.name || '')) return;
    try {
      input.value = (await saveName(value)) || '';
      paintHead();
    } catch (err) {
      toast(err.message);
    }
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
  return input;
}

// The account sheet. Its first page holds what you change often (your name and how Mutt
// looks) and Sign out; what you need now and then is behind a door, on a page of its own:
// Recently deleted (only while something waits), your files, your code and recovery key.
function settingsBody(close) {
  const stats = { files: 0, drawers: 0, stars: 0, ...session.stats };
  const whoEl = h('div', { class: 'sheet-who' });
  const subEl = h('div', { class: 'sheet-sub' });
  const paintHead = () => {
    const { name, username } = session.user;
    whoEl.textContent = name || `@${username}`;
    subEl.textContent = `${name ? `@${username} · ` : ''}${plural(stats.files, 'file')} · ${plural(stats.drawers, 'planet')} · ${plural(stats.stars, 'star')}`;
    paintWhoBar?.();
  };
  paintHead();
  // For whoever runs Mutt: people waiting for a reset, under the doors.
  const resets = h('div', { class: 'sheet-resets-slot' });
  if (session.user.admin) {
    import('./resets.js').then(async (m) => {
      const waiting = await m.waitingResets();
      if (waiting.length) resets.replaceWith(m.resetRequests(waiting));
    });
  }
  const now = (run) => () => { close(); run(); };
  const deleted = recentlyDeleted({
    onCount: (n) => {
      deletedDoor.hidden = !n;
      deletedDoor.fact(String(n));
      if (!n && pages.isOpen()) pages.back();
    },
  });
  const deletedPage = { title: 'Recently deleted', fact: deleted.fact, tools: deleted.tools, body: [deleted.el] };
  const filesPage = {
    title: 'Your files',
    fact: `${plural(stats.files, 'file')} · ${plural(stats.drawers, 'planet')}`,
    body: [
      row('Download', downloadEverything()),
      row('Planets', h('button', { type: 'button', class: 'btn', onclick: now(tidyPlanets) }, 'Tidy planets')),
    ],
  };
  const safePage = () => ({
    title: 'Code and recovery key',
    fact: `@${session.user.username}`,
    body: [
      row('Code', h('div', { class: 'sheet-fact-row' },
        h('span', { class: 'sheet-fact' }, session.user.oldCode ? '4 digits' : '6 digits'),
        h('button', { type: 'button', class: 'btn btn-small', onclick: now(changePin) }, 'Change'))),
      row('Recovery key', h('div', { class: 'sheet-fact-row' },
        h('span', { class: 'sheet-fact' }, session.user.hasKey ? 'Kept outside Mutt' : 'None yet'),
        h('button', { type: 'button', class: `btn btn-small${session.user.hasKey ? ' btn-quiet' : ''}`, onclick: now(newRecoveryKey) },
          session.user.hasKey ? 'Make a new one' : 'Make one'))),
      h('div', { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: now(deleteAccount) }, 'Delete account')),
    ],
  });
  const safe = safePage();
  const home = h('div', { class: 'sheet-page' },
    h('header', { class: 'sheet-head' },
      h('div', null, whoEl, subEl),
      location.pathname !== '/'
        ? h('button', { type: 'button', class: 'btn btn-main', onclick: () => { close(); nav.go('/'); } }, 'Your galaxy')
        : null),
    row('Name', nameField(paintHead)),
    row('Sky', skyPicker()),
    row('Text', choice('size', [{ value: 's', label: 'S' }, { value: 'm', label: 'M' }, { value: 'l', label: 'L' }])),
    row('Motion', choice('motion', [{ value: 'fluid', label: 'Lively' }, { value: 'calm', label: 'Calm' }, { value: 'off', label: 'Still' }])),
    row('Music', choice('music', [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }])),
    row('Sounds', choice('sound', [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }])));
  const pages = sheetPages(home);
  const deletedDoor = pages.door('Recently deleted', { page: () => deletedPage });
  deletedDoor.hidden = true;
  // Whose beams you stopped (beams.js, fetched when opened): shown only once you have stopped someone's.
  const stopsDoor = session.user.beamStops ? pages.door('Beams you stopped', {
    fact: plural(session.user.beamStops, 'person', 'people'),
    page: () => {
      const slot = h('div');
      import('./beams.js').then((m) => slot.replaceWith(m.stoppedPeople()));
      return { title: 'Beams you stopped', body: [slot] };
    },
  }) : null;
  home.append(
    h('nav', { class: 'sheet-doors', 'aria-label': 'More settings' },
      deletedDoor,
      stopsDoor,
      pages.door('Your files', { fact: 'Download, tidy', page: () => filesPage }),
      pages.door('Code and recovery key', { fact: session.user.hasKey ? 'Key kept' : 'No key yet', page: () => safe })),
    resets,
    h('div', { class: 'sheet-actions' },
      h('button', { type: 'button', class: 'btn', onclick: now(signOut) }, 'Sign out')));
  const body = h('div', { class: 'sheet-in' }, pages.el);
  body.back = () => pages.back();   // Escape steps back a page before it closes the sheet
  return body;
}

// The sheet under someone else's name, on their galaxy or one of their planets: who they are
// (their name, @username), how many of their files you can see, their planets, when they joined,
// and what is between the two of you. Nothing of yours to change here; that is on your own galaxy.
function personBody(close, who) {
  const fact = (text = '') => h('span', { class: 'sheet-fact' }, text);
  const subEl = h('div', { class: 'sheet-sub' }, who.name ? `@${who.username}` : '');
  const planetsEl = fact();
  const joinedEl = fact();
  const withYou = row('With you', fact());
  withYou.hidden = true;
  const home = h('div', { class: 'sheet-page' },
    h('header', { class: 'sheet-head' },
      h('div', null, h('div', { class: 'sheet-who' }, who.name || `@${who.username}`), subEl),
      h('button', { type: 'button', class: 'btn btn-main', onclick: () => { close(); nav.go('/'); } }, 'Your galaxy')),
    row('Planets', planetsEl),
    row('Joined', joinedEl),
    withYou,
    // A planet the two of you keep together, started from them.
    session.user && row('Together', h('button', { type: 'button', class: 'btn', onclick: () => { close(); planetWith(who); } },
      icon('pair'), `Make a planet with ${shortName(who)}…`)));
  api.get(`/api/users/${encodeURIComponent(who.username)}`).then((p) => {
    // Files on planets you can open; when some of theirs are closed to you, it says so.
    const shut = p.locked + p.private;
    const files = `${plural(p.files, 'file')}${shut ? ' you can see' : ''}`;
    subEl.textContent = [p.name ? `@${p.username}` : null, files, plural(p.planets, 'planet')].filter(Boolean).join(' · ');
    planetsEl.textContent = !p.planets ? 'None yet' : !shut ? 'All open to you'
      : [p.open && `${p.open} open`, p.locked && `${p.locked} with a code`, p.private && `${p.private} private`].filter(Boolean).join(' · ');
    joinedEl.textContent = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(p.createdAt));
    const between = [
      p.keptWithYou && `${plural(p.keptWithYou, 'planet')} kept together`,
      p.savedByYou && `You saved ${plural(p.savedByYou, 'file')} of theirs`,
    ].filter(Boolean);
    withYou.querySelector('.sheet-fact').textContent = between.join(' · ');
    withYou.hidden = !between.length;
  }).catch(() => {});
  return h('div', { class: 'sheet-in' }, home);
}

// ---------------------------------------------------------------- the bar

let paintWhoBar = null;   // the bar's "whose galaxy", repainted when your name changes

export function createStatusbar() {
  const mark = logo();
  const whoName = h('span', { class: 'sb-who-name' });
  const who = h('button', { type: 'button', class: 'btn btn-quiet btn-small sb-who', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' },
    whoName, icon('caret'));
  const searchBtn = h('button', { type: 'button', class: 'btn btn-quiet btn-round btn-small sb-btn', 'aria-label': 'Search', title: 'Search (/)' }, icon('search'));
  // The clock: pressed, the last three comments people left on your files.
  const clock = h('button', { type: 'button', class: 'btn btn-quiet btn-small sb-btn sb-clock', title: 'Recent comments', 'aria-label': 'Recent comments', 'aria-expanded': 'false' },
    h('time', { class: 'sb-time' }));
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
  clock.addEventListener('click', () => { if (session.user) notes.togglePast(); });
  notes.onPast((on) => clock.setAttribute('aria-expanded', String(on)));
  // A recovery key, asked for once on your own galaxy if you have none.
  const keyTip = askForKey();
  // Someone asking you to keep a planet together, and news of planets you keep with someone.
  const keepTip = askToKeep();
  // Live (live.js): what waits for you came in elsewhere.
  bus.on('live', ({ t }) => {
    if (t === 'comments' || t === 'beams' || t === 'again') notes.refresh();
    if (t === 'keep' || t === 'again') keepTip.refresh();
  });
  // A name, asked for each time you go out into the universe if you haven't given one.
  const nameTip = askForName({ onSaved: () => paintWho() });
  const showNotes = () => {
    const home = !!session.user && current?.chrome === 'galaxy' && !!current?.who?.you && !out;
    notes.set(home);
    keyTip.set(home);
    keepTip.set(home);
    nameTip.set(!!session.user && current?.chrome === 'galaxy' && out);
  };
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
  // Search belongs to a galaxy: what it finds gathers round that galaxy's void (gravity.js).
  const search = sheet('sheet-search-wrap', (close) => searchBody(close, { here: current, sheetEl: search.el }));
  // Whoever's galaxy (or planet) you are on, when it isn't yours: who they are, not your settings.
  const person = sheet('sheet-person', (close) => personBody(close, current.who));
  // Your account sheet opens from your galaxy's name, theirs from theirs; out in the universe the bar only says where you are.
  const whose = () => (current?.who && !current.who.you ? person : settings);
  who.addEventListener('click', () => { if (!out) whose().toggle(who); });
  // Opened anywhere else, it first takes you to the galaxy it searches: from a planet, that planet's
  // galaxy (someone else's searches their files); from the universe or any other page, your own.
  let wantSearch = false;
  const openSearch = () => {
    const seek = current?.seek;
    if (seek && !(seek.away() && !seek.mine)) {
      if (seek.away()) seek.home();   // out in the universe from your galaxy: back in, and it gathers there
      search.show(searchBtn);
      return;
    }
    wantSearch = true;
    const w = current?.who;
    if (seek) seek.home();
    else nav.go(w && !w.you && w.username ? `/g/${encodeURIComponent(w.username)}` : '/');
  };
  searchBtn.addEventListener('click', () => (search.isOpen() ? search.close() : openSearch()));
  // A file opened from what search found: closing it brings search back as it was.
  bus.on('viewer:closed', () => { if (heldSearch() && current?.seek) search.show(searchBtn); });

  const tick = () => {
    clock.firstChild.textContent = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
  };
  tick();
  setInterval(tick, 15000);

  function paintWho() {
    const w = current?.who || { username: session.user?.username, you: true };
    // Someone's own name, if they gave one; else their @username.
    const name = w.you ? session.user?.name : w.name;
    whoName.replaceChildren();
    if (out) whoName.append('Universe');
    else whoName.append(h('span', { class: 'sb-at' }, name || `@${w.username}`), '’s Galaxy');
    who.classList.toggle('is-other', !out && !w.you);
    // Out in the universe it's a plain title: no arrow, nothing to press, not a Tab stop.
    who.classList.toggle('is-place', out);
    who.tabIndex = out ? -1 : 0;
    if (out) {
      who.setAttribute('aria-disabled', 'true');
      who.removeAttribute('aria-haspopup');
      settings.close();
      person.close();
    } else {
      who.removeAttribute('aria-disabled');
      who.setAttribute('aria-haspopup', other() ? 'menu' : 'dialog');
    }
  }
  paintWhoBar = paintWho;

  // Whoever runs Mutt is told on their own galaxy, once a visit, if someone asked for a reset.
  let toldResets = false;
  const tellResets = () => {
    if (toldResets || !session.user?.admin || current?.chrome !== 'galaxy' || !current?.who?.you) return;
    toldResets = true;
    import('./resets.js').then((m) => m.waitingResets()).then((waiting) => {
      if (!waiting.length) return;
      const first = waiting[0];
      toast(waiting.length === 1 ? `@${first.username} asked for a reset` : `${plural(waiting.length, 'person', 'people')} asked for a reset`,
        { action: { label: 'See', run: () => settings.show(who) } });
    });
  };

  let glitched = false;
  return {
    el: bar,
    search: { focus: () => (search.isOpen() ? search.el.querySelector('.search-input')?.focus() : openSearch()) },
    update(inst) {
      current = inst;
      paintWho();
      showHome();
      notes.hidePast();
      showNotes();
      tellResets();
      if (session.user && !glitched) {
        glitched = true;
        requestAnimationFrame(() => glitch(mark));
      }
      settings.close();
      person.close();
      search.close();
      dropHeldSearch();
      if (wantSearch && inst.seek) requestAnimationFrame(() => search.show(searchBtn));
      wantSearch = false;
    },
  };
}
