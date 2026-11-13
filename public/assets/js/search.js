// Search: words, plus chips for kind, when it was added, colour, vibe and
// order. Chips come from the row of options under the box, or from typing a
// word the search knows ("red", "pdf", "last week", "warm"). Colours and vibes
// are read from each picture's pixels in the browser (look.js).

import { api } from './api.js';
import { renderCell } from './cells.js';
import { COLORS, TRAITS, arrange, ensureLooks } from './look.js';
import { nav } from './nav.js';
import { planetEl } from './planets.js';
import { openPopover } from './ui.js';
import { debounce, h, nameColor, nameMatch } from './util.js';
import { icon } from './icons.js';

// ---------------------------------------------------------------- what can be picked

const KIND_CHOICES = [
  { value: 'image', label: 'Photos' }, { value: 'video', label: 'Videos' }, { value: 'audio', label: 'Sound' },
  { value: 'pdf', label: 'PDFs' }, { value: 'text', label: 'Notes' }, { value: 'link', label: 'Links' },
  { value: 'doc', label: 'Documents' }, { value: 'code', label: 'Code' }, { value: 'archive', label: 'Archives' },
  { value: 'other', label: 'Other' },
];
const SORT_CHOICES = [
  { value: 'new', label: 'New' }, { value: 'old', label: 'Old' }, { value: 'color', label: 'Colour' },
  { value: 'az', label: 'A–Z' }, { value: 'size', label: 'Size' },
];
const SORT_CHIP = { old: 'Oldest first', color: 'By colour', az: 'A–Z', size: 'Biggest first' };
const SHAPES = new Set(['tall', 'wide', 'square']);
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const secs = (d) => Math.floor(d.getTime() / 1000);
const titleCase = (s) => s[0].toUpperCase() + s.slice(1);

// A span of time, as seconds from..to (to is open), worked out when picked.
function when(key) {
  const now = new Date();
  const today = day(now);
  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const year = new Date(now.getFullYear(), 0, 1);
  const add = (d, days) => { const x = new Date(d); x.setDate(x.getDate() + days); return x; };
  const span = (label, from, to) => ({ key, label, from: from && secs(from), to: to && secs(to) });
  switch (key) {
    case 'today': return span('Today', today);
    case 'yesterday': return span('Yesterday', add(today, -1), today);
    case 'week': return span('This week', monday);
    case 'lastweek': return span('Last week', add(monday, -7), monday);
    case 'month': return span('This month', month);
    case 'lastmonth': return span('Last month', new Date(now.getFullYear(), now.getMonth() - 1, 1), month);
    case '3months': return span('Last 3 months', new Date(now.getFullYear(), now.getMonth() - 2, 1));
    case 'year': return span('This year', year);
    case 'lastyear': return span('Last year', new Date(now.getFullYear() - 1, 0, 1), year);
    case 'before': return span('Before this year', null, year);
    default: {
      const m = /^m(\d+)$/.exec(key);
      if (m) {
        // The most recent such month (this one counts).
        const i = Number(m[1]);
        const y = i > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
        return span(titleCase(MONTHS[i]), new Date(y, i, 1), new Date(y, i + 1, 1));
      }
      const y = /^y(\d{4})$/.exec(key);
      if (y) return span(y[1], new Date(Number(y[1]), 0, 1), new Date(Number(y[1]) + 1, 0, 1));
      return null;
    }
  }
}
const WHEN_CHOICES = ['today', 'week', 'month', '3months', 'year', 'before'];

// Words (and short phrases) that turn into chips as you type.
const WORDS = new Map();
const say = (words, chip) => { for (const w of words.split('|')) WORDS.set(w, chip); };
say('photo|photos|image|images|picture|pictures|pic|pics', { kind: 'image' });
say('video|videos|movie|movies|clip|clips', { kind: 'video' });
say('audio|music|sound|sounds|song|songs', { kind: 'audio' });
say('pdf|pdfs', { kind: 'pdf' });
say('note|notes', { kind: 'text' });
say('link|links|website|websites', { kind: 'link' });
say('doc|docs|document|documents', { kind: 'doc' });
say('archive|archives', { kind: 'archive' });
for (const ext of 'png jpg jpeg gif webp svg heic mp4 mov mp3 wav m4a docx xlsx pptx csv md txt zip'.split(' ')) say(ext, { ext });
for (const c of COLORS) say(c.name, { color: c.name });
say('gray', { color: 'grey' });
say('violet', { color: 'purple' });
say('cyan|turquoise', { color: 'teal' });
say('navy', { color: 'blue' });
say('gold', { color: 'yellow' });
say('beige|tan', { color: 'brown' });
say('bright', { vibe: 'bright' });
say('dark|moody', { vibe: 'dark' });
say('warm', { vibe: 'warm' });
say('cool|cold', { vibe: 'cool' });
say('vivid|colorful|colourful|saturated', { vibe: 'vivid' });
say('muted|faded', { vibe: 'muted' });
say('pastel|pastels|soft', { vibe: 'soft' });
say('mono|monochrome|b&w|bw|greyscale|grayscale|black and white|black & white|black&white', { vibe: 'mono' });
say('contrasty|high contrast', { vibe: 'contrast' });
say('busy|detailed|cluttered', { vibe: 'busy' });
say('minimal|minimalist|sparse', { vibe: 'minimal' });
say('tall|portrait|vertical', { vibe: 'tall' });
say('wide|landscape|horizontal|panorama', { vibe: 'wide' });
say('square', { vibe: 'square' });
say('today', { when: 'today' });
say('yesterday', { when: 'yesterday' });
say('this week', { when: 'week' });
say('last week', { when: 'lastweek' });
say('this month', { when: 'month' });
say('last month', { when: 'lastmonth' });
say('this year', { when: 'year' });
say('last year', { when: 'lastyear' });
MONTHS.forEach((m, i) => say(i === 4 ? m : `${m}|${m.slice(0, 3)}`, { when: `m${i}` }));
say('newest|latest|recent', { sort: 'new' });
say('oldest', { sort: 'old' });
say('biggest|largest', { sort: 'size' });
say('alphabetical|a-z', { sort: 'az' });
say('rainbow', { sort: 'color' });
const LONGEST = Math.max(...[...WORDS.keys()].map((w) => w.split(' ').length));
const PREFIXES = new Set([...WORDS.keys()].flatMap((w) => {
  const parts = w.split(' ');
  return parts.slice(1).map((_, i) => parts.slice(0, i + 1).join(' '));
}));

function chipFor(phrase) {
  if (/^(19|20)\d\d$/.test(phrase)) return { when: `y${phrase}` };
  return WORDS.get(phrase) || null;
}

// Turns known words in `text` into chips. Finished words only (followed by a
// space), unless `all`; a word that may start a longer phrase waits for the next.
function parse(text, all) {
  const ends = all || /\s$/.test(text);
  const tokens = text.split(/\s+/).filter(Boolean);
  const open = ends ? '' : tokens.pop() || '';
  const chips = [];
  const rest = [];
  let i = 0;
  while (i < tokens.length) {
    // Quoted words are always just words.
    if (/^["']/.test(tokens[i])) { rest.push(tokens[i++]); continue; }
    let hit = null;
    for (let n = Math.min(LONGEST, tokens.length - i); n > 0; n--) {
      const phrase = tokens.slice(i, i + n).join(' ').toLowerCase();
      const chip = chipFor(phrase);
      if (chip) { hit = { chip, n, phrase }; break; }
    }
    const tail = tokens.slice(i).join(' ').toLowerCase();
    if (!all && !open && PREFIXES.has(tail)) break; // e.g. "black" might become "black and white"
    if (hit) { chips.push(hit.chip); i += hit.n; } else rest.push(tokens[i++]);
  }
  rest.push(...tokens.slice(i));
  const left = rest.join(' ');
  return { chips, text: open ? (left ? `${left} ${open}` : open) : (left && ends && !all ? `${left} ` : left) };
}

// ---------------------------------------------------------------- the sheet

let measured = false; // older pictures get measured once a visit

// Everyone else's username, fetched once a visit, so you can jump to a galaxy.
let everyone = null;
const loadEveryone = () => (everyone ||= api.get('/api/users').then((r) => r.users).catch(() => { everyone = null; return []; }));

export function searchBody(close) {
  const state = { kind: [], ext: [], when: null, color: null, vibe: [], sort: null };

  const input = h('input', { class: 'search-input', type: 'search', placeholder: 'Search your planets, stars and people', 'aria-label': 'Search', autocomplete: 'off', enterkeyhint: 'search' });
  const chipsEl = h('span', { class: 'search-chips' });
  const box = h('label', { class: 'field field-search sheet-search' }, icon('search'), chipsEl, input);
  const options = h('div', { class: 'search-options' });
  const results = h('div', { class: 'search-results' });

  // ------------------------------------------------------------ chips

  const kindLabel = (v) => KIND_CHOICES.find((k) => k.value === v)?.label || v;
  const traitLabel = (v) => TRAITS.find((t) => t.tag === v)?.label || v;
  const colorOf = (v) => COLORS.find((c) => c.name === v);

  function chips() {
    const list = [];
    for (const v of state.kind) list.push({ label: kindLabel(v), drop: () => { state.kind = state.kind.filter((k) => k !== v); } });
    for (const v of state.ext) list.push({ label: v.toUpperCase(), drop: () => { state.ext = state.ext.filter((k) => k !== v); } });
    if (state.when) list.push({ label: state.when.label, drop: () => { state.when = null; } });
    if (state.color) list.push({ label: colorOf(state.color).label, dot: colorOf(state.color).hex, drop: () => { state.color = null; } });
    for (const v of state.vibe) list.push({ label: traitLabel(v), drop: () => { state.vibe = state.vibe.filter((k) => k !== v); } });
    if (state.sort && state.sort !== 'new') list.push({ label: SORT_CHIP[state.sort], drop: () => { state.sort = null; } });
    return list;
  }

  function add(chip) {
    if (chip.kind && !state.kind.includes(chip.kind)) state.kind.push(chip.kind);
    if (chip.ext && !state.ext.includes(chip.ext)) state.ext.push(chip.ext);
    if (chip.when) state.when = when(chip.when);
    if (chip.color) state.color = chip.color;
    if (chip.vibe && !state.vibe.includes(chip.vibe)) {
      // One shape at a time; the other traits stack.
      if (SHAPES.has(chip.vibe)) state.vibe = state.vibe.filter((v) => !SHAPES.has(v));
      state.vibe.push(chip.vibe);
    }
    if (chip.sort) state.sort = chip.sort;
  }

  function paint() {
    const list = chips();
    input.placeholder = list.length ? 'Add words…' : 'Search your planets, stars and people';
    chipsEl.replaceChildren(...list.map((c) => h('span', { class: 'chip' },
      c.dot ? h('i', { class: 'chip-dot', style: { '--c': c.dot } }) : null,
      c.label,
      h('button', {
        type: 'button', class: 'chip-x', 'aria-label': `Remove ${c.label}`,
        onclick: (e) => { e.preventDefault(); c.drop(); changed(); input.focus(); },
      }, icon('close', 12)))));
    paintOptions();
  }

  function changed() {
    paint();
    run();
  }

  // ------------------------------------------------------------ the row of options

  const kindBtn = optionButton(() => (state.kind.length ? kindLabel(state.kind[0]) + (state.kind.length > 1 ? ` +${state.kind.length - 1}` : '') : 'Kind'), (btn) =>
    choose(btn, () => KIND_CHOICES.map((k) => ({ label: k.label, on: state.kind.includes(k.value), run: () => {
      state.kind = state.kind.includes(k.value) ? state.kind.filter((v) => v !== k.value) : [...state.kind, k.value];
    } })), { many: true }));
  const whenBtn = optionButton(() => state.when?.label || 'Added', (btn) =>
    choose(btn, () => [
      { label: 'Any time', on: !state.when, run: () => { state.when = null; } },
      ...WHEN_CHOICES.map((key) => { const w = when(key); return { label: w.label, on: state.when?.key === key, run: () => { state.when = w; } }; }),
    ]));
  const vibeBtn = optionButton(() => (state.vibe.length ? traitLabel(state.vibe[0]) + (state.vibe.length > 1 ? ` +${state.vibe.length - 1}` : '') : 'Vibe'), (btn) =>
    choose(btn, () => TRAITS.flatMap((t, i) => [
      i && SHAPES.has(t.tag) && !SHAPES.has(TRAITS[i - 1].tag) ? '-' : null,
      { label: t.label, on: state.vibe.includes(t.tag), run: () => {
        if (state.vibe.includes(t.tag)) state.vibe = state.vibe.filter((v) => v !== t.tag);
        else add({ vibe: t.tag });
      } },
    ]).filter(Boolean), { many: true }));
  const sortBtn = optionButton(() => `Sort: ${SORT_CHOICES.find((s) => s.value === (state.sort || 'new')).label}`, (btn) =>
    choose(btn, () => SORT_CHOICES.map((s) => ({ label: s.label, on: (state.sort || 'new') === s.value, run: () => { state.sort = s.value === 'new' ? null : s.value; } }))));
  sortBtn.classList.add('is-sort');

  const swatches = () => COLORS.map((c) => h('button', {
    type: 'button', class: 'swatch', title: c.label, 'aria-label': c.label,
    'aria-pressed': String(state.color === c.name), style: { '--c': c.hex },
    onclick: () => { state.color = state.color === c.name ? null : c.name; changed(); },
  }));
  const swatchRow = h('span', { class: 'search-swatches' });
  // On a phone the dots fold behind a button.
  const colorBtn = optionButton(() => (state.color ? colorOf(state.color).label : 'Colour'), (btn) => {
    const wrap = h('div', { class: 'search-swatches is-pop' });
    const fill = () => wrap.replaceChildren(...swatches().map((s) => {
      s.addEventListener('click', () => fill());
      return s;
    }));
    fill();
    openPopover(btn, wrap, { className: 'search-pop' });
  });
  colorBtn.classList.add('is-color');

  function optionButton(label, open) {
    const btn = h('button', { type: 'button', class: 'btn btn-quiet btn-small search-opt', 'aria-haspopup': 'true', onclick: () => open(btn) });
    btn.paint = () => {
      const text = label();
      btn.replaceChildren(h('span', null, text), h('span', { class: 'search-opt-caret' }, icon('caret', 12)));
      btn.classList.toggle('is-set', !/^(Kind|Added|Vibe|Colour|Sort: New)$/.test(text));
    };
    return btn;
  }

  // A small list of choices; `many` keeps it open so several can be ticked.
  function choose(anchor, make, { many = false } = {}) {
    let pop;
    const list = h('div', { class: 'menu', role: 'menu' });
    const fill = () => list.replaceChildren(...make().map((item) => (item === '-' ? h('div', { class: 'menu-sep' }) : h('button', {
      type: 'button', role: many ? 'menuitemcheckbox' : 'menuitemradio', class: 'menu-item search-choice',
      'aria-checked': String(!!item.on),
      onclick: () => {
        item.run();
        changed();
        if (many) fill(); else pop.close();
      },
    }, h('span', null, item.label), h('span', { class: 'search-tick' }, item.on ? icon('check', 12) : null)))));
    fill();
    pop = openPopover(anchor, list, { className: 'search-pop' });
  }

  function paintOptions() {
    for (const b of [kindBtn, whenBtn, colorBtn, vibeBtn, sortBtn]) b.paint();
    swatchRow.replaceChildren(...swatches());
  }
  options.append(kindBtn, whenBtn, swatchRow, colorBtn, vibeBtn, sortBtn);

  // ------------------------------------------------------------ typing

  function absorb(all) {
    const { chips: found, text } = parse(input.value, all);
    if (!found.length) return false;
    found.forEach(add);
    input.value = text;
    paint();
    return true;
  }

  input.addEventListener('input', () => {
    absorb(false);
    run();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // "@name" and Enter goes straight to that galaxy.
      const top = matchPeople()[0];
      if (top && /^@/.test(input.value.trim())) { visit(top); return; }
      if (absorb(true)) run.now();
    } else if (e.key === 'Backspace' && !input.value && input.selectionStart === 0) {
      const last = chips().pop();
      if (last) { e.preventDefault(); last.drop(); changed(); }
    }
  });

  // ------------------------------------------------------------ asking the server

  let n = 0;
  let loaded = [];

  function query(offset) {
    const p = new URLSearchParams();
    // Quotes only keep a word from becoming a chip.
    const words = input.value.trim().split(/\s+/).map((w) => w.replace(/^["']+|["']+$/g, '')).join(' ').trim();
    if (words) p.set('q', words);
    if (state.kind.length) p.set('kind', state.kind.join(','));
    if (state.ext.length) p.set('ext', state.ext.join(','));
    if (state.when?.from != null) p.set('from', state.when.from);
    if (state.when?.to != null) p.set('to', state.when.to);
    if (state.color) p.set('color', state.color);
    if (state.vibe.length) p.set('vibe', state.vibe.join(','));
    if (state.sort && state.sort !== 'color') p.set('sort', state.sort);
    if (offset) p.set('offset', offset);
    return p;
  }

  const anything = () => !!input.value.trim() || chips().length > 0;
  const looksMatter = () => !!state.color || state.vibe.some((v) => !SHAPES.has(v)) || state.sort === 'color';

  async function fetchPage(more) {
    const mine = ++n;
    const offset = more ? loaded.length : 0;
    try {
      const data = await api.get(`/api/search?${query(offset)}`);
      if (mine !== n) return;
      loaded = more ? [...loaded, ...data.blocks] : data.blocks;
      show(more ? null : data.drawers, data.more);
    } catch (err) {
      if (mine === n) results.replaceChildren(h('p', { class: 'search-none' }, err.message));
    }
  }

  // People whose username answers the words typed (no chips: those are about files).
  let users = [];
  function matchPeople() {
    const raw = input.value.trim().toLowerCase();
    const q = raw.replace(/^@/, '');
    if (!raw || /\s/.test(q) || chips().length) return [];
    if (!q) return users.slice(0, 12); // just "@": a few of everyone
    return users.map((name) => ({ name, score: nameMatch(name, q) }))
      .filter((u) => u.score !== null)
      .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
      .slice(0, 8).map((u) => u.name);
  }
  const visit = (name) => { close(); nav.go(`/g/${name}`); };
  const personEl = (name) => h('button', {
    type: 'button', class: 'search-person', title: `Visit @${name}’s galaxy`,
    onclick: () => visit(name),
  }, h('i', { class: 'search-person-dot', style: { '--c': nameColor(name) } }), h('span', { class: 'search-person-name' }, `@${name}`),
  h('span', { class: 'search-person-go' }, 'Galaxy', icon('chevron-right', 12)));

  let planets = [];
  let lastMore = false;
  function show(drawers, more = lastMore) {
    lastMore = more;
    if (drawers) planets = drawers.map((d) => {
      const el = planetEl(d, { size: 40 });
      el.classList.add('planet-mini');
      el.addEventListener('click', close);
      return el;
    });
    const list = state.sort === 'color' ? arrange(loaded, 'color') : loaded;
    const files = list.map((b) => {
      const cell = renderCell(b, { actions: false });
      cell.addEventListener('click', () => { close(); nav.openBlock(b.id); });
      return cell;
    });
    const hint = anything() ? null : h('p', { class: 'search-hint' }, 'Try ',
      ['warm', 'pdf', 'this month', 'blue'].flatMap((w, i) => [i ? ', ' : '', h('button', {
        type: 'button', class: 'search-try', onclick: () => { add(chipFor(w)); changed(); input.focus(); },
      }, `“${w}”`)]), ', or pick from the row above.');
    const people = matchPeople();
    results.replaceChildren(...[
      hint,
      people.length ? h('div', { class: 'search-people', role: 'group', 'aria-label': 'People' },
        h('p', { class: 'search-label' }, 'People'), h('div', { class: 'search-people-row' }, people.map(personEl))) : null,
      planets.length ? h('div', { class: 'search-planets' }, planets) : null,
      files.length ? h('div', { class: 'grid search-grid' }, files) : null,
      more ? h('div', { class: 'search-more' }, h('button', { type: 'button', class: 'btn', onclick: () => fetchPage(true) }, 'Show more')) : null,
      !planets.length && !files.length && !people.length ? h('p', { class: 'search-none' }, anything() ? 'Nothing out there like that.' : 'Nothing here yet.') : null,
    ].filter(Boolean));
  }

  const later = debounce(() => fetchPage(false), 180);
  const run = () => later();
  run.now = () => fetchPage(false);

  // Older pictures haven't had their colours and vibes read; do that quietly.
  if (!measured) {
    measured = true;
    const refresh = debounce(() => { if (looksMatter() && results.isConnected) fetchPage(false); }, 600);
    api.get('/api/looks/todo').then(({ blocks }) => ensureLooks(blocks, refresh)).catch(() => {});
  }

  loadEveryone().then((all) => { users = all; if (input.value.trim() && results.isConnected) show(null); });

  paint();
  run.now();
  setTimeout(() => input.focus(), 60);
  return h('div', { class: 'sheet-in' }, box, options, results);
}
