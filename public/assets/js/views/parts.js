// The sample page: every shared part in every state (DESIGN.md section 4).
// It lives at /parts, is linked from nowhere, and its code is fetched only
// when that address is opened (main.js).
//
// To add a part: draw it here first as one more `section(...)`, show the user,
// add it to DESIGN.md and to the shared parts in galaxy.css, then use it.
// States are not drawn by hand: `held(el, 'hover' | 'active' | 'focus')`
// gives a sample the real rule for that state, copied from the stylesheets
// when the page opens (mirrorStates), so the samples can't drift from the app.

import { renderCell } from '../cells.js';
import { entryCell } from '../entry.js';
import { confirmDialog, openContextMenu, openMenu, openPopover, sectionHead, segmented, stepper, toast } from '../ui.js';
import { PALETTE, h } from '../util.js';
import { ICON_NAMES, icon } from '../icons.js';
import { commentNote } from '../commentnotes.js';

const held = (el, ...states) => { el.classList.add(...states.map((s) => `is-${s}`)); el.tabIndex = -1; return el; };
const off = (el) => { el.disabled = true; return el; };
const note = (text) => h('p', { class: 'parts-note' }, text);
const row = (label, ...kids) => h('div', { class: 'parts-row' }, label ? h('span', { class: 'parts-label' }, label) : null, ...kids);
const section = (name, says, ...kids) => h('section', { class: 'parts-section' },
  h('h2', { class: 'parts-name' }, name), says ? note(says) : null, ...kids);
const btn = (words, kind = '', extra = {}) => h('button', { type: 'button', class: `btn ${kind}`.trim(), ...extra }, words);

// Every rule that has a pointed-at, pressed or keyboard state gets a twin that
// a sample can wear as a class: .is-hover, .is-active, .is-focus.
function mirrorStates() {
  const out = [];
  const twin = (sel) => `.parts ${sel.trim()
    .replace(/:hover\b/g, '.is-hover').replace(/:active\b/g, '.is-active')
    .replace(/:focus-visible\b/g, '.is-focus').replace(/:focus-within\b/g, '.is-focus').replace(/:focus\b/g, '.is-focus')}`;
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule) { if (matchMedia(rule.conditionText).matches) walk(rule.cssRules); continue; }
      if (!(rule instanceof CSSStyleRule) || !/:(hover|active|focus)/.test(rule.selectorText)) continue;
      out.push(`${rule.selectorText.split(/,(?![^(]*\))/).map(twin).join(', ')} { ${rule.style.cssText} }`);
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules); } catch { /* a font stylesheet from elsewhere can't be read */ }
  }
  return h('style', null, out.join('\n'));
}

function buttons() {
  const kinds = [['Main', 'btn-main', 'Add', 'Adding 3 files…'], ['Plain', '', 'Share', 'Tidying the planets…'],
    ['Quiet', 'btn-quiet', 'Not now', null], ['Danger', 'btn-danger', 'Delete', 'Deleting the planet…']];
  const states = ['Resting', 'Pointed at', 'Pressed', 'Keyboard', 'Switched off', 'Busy'];
  const grid = h('div', { class: 'parts-matrix' }, h('span'), states.map((s) => h('span', { class: 'parts-label' }, s)),
    kinds.map(([name, cls, words, busy]) => [
      h('span', { class: 'parts-label' }, name),
      h('span', null, btn(words, cls)),
      h('span', null, held(btn(words, cls), 'hover')),
      h('span', null, held(btn(words, cls), 'active')),
      h('span', null, held(btn(words, cls), 'focus')),
      h('span', null, off(btn(words, cls))),
      h('span', null, busy ? btn(busy, `${cls} is-busy`) : null),
    ]));
  const round = (kind, label, name, extra = '') => h('button', { type: 'button', class: `btn btn-round ${kind} ${extra}`, 'aria-label': label, title: label }, icon(name));
  return section('Button', 'Four kinds, three sizes, one shape. One main button per view; quiet for turning something down; danger only to confirm in a dialog.',
    h('div', { class: 'parts-scroll' }, grid),
    row('Small 24 · regular 32 · large 40', btn('Add', 'btn-main btn-small'), btn('Make it a list', 'btn-main'), btn('Sign in', 'btn-main btn-large'),
      btn('Retry', 'btn-small'), btn('Share'), btn('Sign out', 'btn-large'), btn('Upload', 'btn-quiet btn-small'), btn('Not now', 'btn-quiet')),
    row('Round: an icon alone', round('', 'Share', 'people'), round('btn-quiet', 'Search (/)', 'search'), round('btn-quiet', 'Search (/)', 'search', 'btn-small'),
      held(round('btn-quiet', 'Held on, like a set bookmark', 'bookmark'), 'on')),
    h('div', { class: 'parts-own fglass', style: { '--pc': PALETTE[5], '--pa': 'color-mix(in oklab, var(--pc), var(--shade) 34%)' } },
      row('On a planet’s own things', btn([icon('people'), h('span', null, 'Share')]), btn('Make it a list', 'btn-main'), btn('Not now', 'btn-quiet'), btn('Add', 'btn-main btn-small'))),
    note('Inside a planet’s own page content the main button takes the planet’s deep colour and a plain button’s edge a third of it. Nothing on bar glass does.'));
}

function textBoxes() {
  const field = (extra = {}) => h('input', { class: 'field', type: 'text', placeholder: 'Someone’s username', 'aria-label': 'Sample text box', ...extra });
  const search = h('label', { class: 'field field-search' }, icon('search'),
    h('span', { class: 'chip' }, h('i', { class: 'chip-dot', style: { '--c': PALETTE[2] } }), 'Postcards', h('button', { type: 'button', class: 'chip-x', 'aria-label': 'Remove Postcards' }, icon('close', 12))),
    h('input', { class: 'search-input', type: 'search', placeholder: 'Search your planets, stars and people', 'aria-label': 'Sample search' }));
  const bare = (words, extra = {}) => h('input', { class: 'field-bare', type: 'text', value: words, placeholder: 'Add a note', 'aria-label': 'Sample bare text box', ...extra });
  return section('Text box', 'Boxed is a sunken well, 32 high. Search is 40 high with round ends. Bare is for a planet’s or file’s own name and note: no box until you point or type.',
    h('div', { class: 'parts-stack' },
      row('Resting', field()), row('Pointed at', held(field(), 'hover')), row('Typing', held(field({ value: 'pier' }), 'focus')), row('Switched off', off(field())),
      row('Search', search),
      row('More than one line', h('textarea', { class: 'field', rows: 2, placeholder: 'A reason, if you like', 'aria-label': 'Sample note' })),
      row('Bare', bare('')), row('Bare, pointed at', held(bare(''), 'hover')), row('Bare, typing', held(bare('The summer we kept writing home'), 'focus'))));
}

function switches() {
  const sw = (words, { on = false, disabled = false, focus = false } = {}) => {
    const input = h('input', { type: 'checkbox', checked: on, disabled });
    if (focus) held(input, 'focus');
    return h('label', { class: 'switch' }, input, h('span', { class: 'switch-track' }, h('span', { class: 'switch-knob' })), h('span', null, words));
  };
  const tick = (words, { on = false, focus = false, hover = false } = {}) => {
    const input = h('input', { type: 'checkbox', checked: on });
    if (focus) held(input, 'focus');
    const el = h('label', { class: 'tick' }, input, h('span', { class: 'tick-box' }), h('span', null, words));
    return hover ? held(el, 'hover') : el;
  };
  const sizes = segmented([{ value: 's', label: 'S' }, { value: 'm', label: 'M' }, { value: 'l', label: 'L' }], 'm', (v) => sizes.set(v), { label: 'Sample sizes' });
  const who = segmented(['Private', 'Code', 'People', 'Public'].map((label) => ({ value: label, label })), 'Public', (v) => who.set(v), { label: 'Sample choices' });
  const tabs = segmented(['Contents', 'Bookmarks', 'Highlights'].map((label) => ({ value: label, label })), 'Contents', (v) => tabs.set(v), { tabs: true, label: 'Sample tabs' });
  const serves = stepper({ value: 4, min: 1, max: 12, format: (n) => `Serves ${n}`, label: 'Sample servings', less: 'Fewer', more: 'More' });
  const size = stepper({ value: 17, min: 12, max: 28, label: 'Sample text size', less: 'Smaller', more: 'Bigger' });
  const chip = (words, c) => h('span', { class: 'chip' }, c ? h('i', { class: 'chip-dot', style: { '--c': c } }) : null, words,
    h('button', { type: 'button', class: 'chip-x', 'aria-label': `Remove ${words}` }, icon('close', 12)));
  return [
    section('Switch', 'For something that happens now. 40 × 24, the pearl travels 16.',
      row(null, sw('On', { on: true }), sw('Off'), sw('Keyboard', { on: true, focus: true }), sw('Switched off', { on: true, disabled: true }))),
    section('Segmented bar', 'Picks one value of a setting; at most four short choices. The chosen bead slides.', row(null, sizes.el, who.el)),
    section('Tabs', 'Switch what a panel shows. Words with a light that slides under the chosen one.', h('div', { class: 'parts-panel' }, tabs.el)),
    section('Tick box', 'For “include this when I confirm”. Never the browser’s own.',
      row(null, tick('Also delete 3 files that only live here'), tick('Ticked', { on: true }), tick('Pointed at', { hover: true }), tick('Keyboard', { focus: true }))),
    section('Chip', 'A person in Share, a filter in search.', row(null, chip('@ines', PALETTE[5]), chip('@tomas', PALETTE[2]), chip('Photos'))),
    section('Stepper', 'A number with a minus and a plus in a sunken track. A button at its limit is switched off.', row(null, serves.el, size.el)),
  ];
}

function menus() {
  const item = (words, { hint, danger, state } = {}) => {
    const el = h('button', { type: 'button', class: `menu-item${danger ? ' is-danger' : ''}` }, h('span', null, words), hint ? h('span', { class: 'menu-hint' }, hint) : null);
    return state ? held(el, state) : el;
  };
  const menu = h('div', { class: 'pop' }, h('div', { class: 'menu' },
    item('Planet type…'), item('Planet colour… (pointed at)', { state: 'hover' }), item('Add a moon…', { hint: '2 of 4' }), item('Keyboard', { state: 'focus' }),
    h('div', { class: 'menu-sep' }), item('Delete planet…', { danger: true }), item('Delete planet… (pointed at)', { danger: true, state: 'hover' })));
  const grouped = h('div', { class: 'pop' }, h('div', { class: 'menu' },
    h('div', { class: 'menu-head' }, 'Move to'), item('Postcards'), item('Recipes to try'), h('div', { class: 'menu-sep' }), item('Copy link')));
  const who = segmented(['Private', 'Code', 'People', 'Public'].map((label) => ({ value: label, label })), 'People', (v) => who.set(v), { className: 'liv-seg', label: 'Sample sharing' });
  const panelBody = () => h('div', { class: 'parts-stack' }, h('div', { class: 'liv-label' }, 'Who can see it'), who.el,
    h('input', { class: 'field', type: 'text', placeholder: 'Someone’s username', 'aria-label': 'Sample username' }));
  const live = [
    { icon: 'edit', label: 'Rename', run: () => toast('Rename') }, { icon: 'moon', label: 'Add a moon…', hint: '2 of 4', run: () => toast('Add a moon') }, '-',
    { icon: 'trash', label: 'Delete planet…', danger: true, run: () => toast('Nothing was deleted') }];
  const area = h('div', { class: 'parts-ctx fglass', tabindex: '0' }, 'Right-click here');
  area.addEventListener('contextmenu', (e) => openContextMenu(e, [{ heading: 'Move to' }, ...live], { title: 'pier-at-dusk.jpg', target: area }));
  return section('Menu and small panel', 'One menu for the ••• button and right-click. Rows 32 high; the red row is last, under a line. A small panel is a menu that holds controls.',
    h('div', { class: 'parts-cols' }, menu, grouped, h('div', { class: 'pop pop-panel pop-share' }, panelBody())),
    row('The real ones', btn('Open a menu', '', { onclick: (e) => openMenu(e.currentTarget, live) }), area,
      btn('Open a small panel', '', { onclick: (e) => openPopover(e.currentTarget, panelBody(), { className: 'pop-panel pop-share', width: 340 }) })));
}

function overlays() {
  const sizes = segmented([{ value: 's', label: 'S' }, { value: 'm', label: 'M' }, { value: 'l', label: 'L' }], 'm', (v) => sizes.set(v), { className: 'set-seg', label: 'Sample text size' });
  const sheet = h('div', { class: 'sheet is-open' },
    h('header', { class: 'sheet-head' }, h('div', null, h('div', { class: 'sheet-who' }, '@edan'), h('div', { class: 'sheet-sub' }, '214 files · 9 planets · 6 stars'))),
    h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, 'Text'), h('div', null, sizes.el)),
    h('div', { class: 'sheet-actions' }, btn('Tidy planets'), btn('Sign out'), btn('Delete account', 'btn-quiet btn-small')));
  const dialog = h('div', { class: 'dialog' }, h('h2', { class: 'dialog-title' }, 'Delete “Postcards”?'), h('p', { class: 'dialog-text' }, 'Its files float off and become stars.'),
    h('label', { class: 'tick' }, h('input', { type: 'checkbox' }), h('span', { class: 'tick-box' }), h('span', null, 'Also delete 3 files that only live here')),
    h('div', { class: 'dialog-actions' }, btn('Cancel', 'btn-quiet'), btn('Delete planet', 'btn-danger')));
  const toastEl = (words, action) => h('div', { class: 'toast' }, h('span', null, words), action ? h('button', { type: 'button' }, action) : null);
  const upload = (p, words, action) => h('div', { class: 'toast is-upload' }, h('i', { class: 'toast-void', style: { '--p': p } }), h('span', null, words), action ? h('button', { type: 'button' }, action) : null);
  const tip = h('div', { class: 'tip' }, h('p', { class: 'tip-title' }, 'Who can see this planet'),
    h('p', { class: 'tip-text' }, 'Everyone on Mutt can look inside. Change that, or let others add too, under Share.'),
    h('div', { class: 'tip-btns' }, btn('Change sharing', 'btn-main btn-small'), btn('Got it', 'btn-quiet btn-small')));
  const tooltip = (words, key) => h('div', { class: 'tooltip is-on' }, h('span', { class: 'tooltip-text' }, words), key ? h('span', { class: 'tooltip-key' }, key) : null);
  return [
    section('Sheet', 'Drops from the top bar: your account, search.', sheet),
    section('Dialog', 'The quiet button first, the main or danger one last.', dialog,
      row('The real one', btn('Ask to delete', '', {
        onclick: () => confirmDialog({ title: 'Delete “Postcards”?', message: 'This is only a sample: nothing is deleted.', confirm: 'Delete planet', danger: true }),
      }))),
    section('Toast', 'Its one action is blue words. A long message grows to a second line. Uploads are a toast whose void fills with light.',
      h('div', { class: 'parts-stack' }, toastEl('Sent to Recipes', 'Move'), toastEl('Link copied'),
        toastEl('“The summer we kept writing home” is on Postcards and Drafts now, and it kept its place in both', 'Undo'),
        upload(0, 'Uploading 1 of 7'), upload(0.43, 'Uploading 3 of 7'), upload(1, 'Added 7 files'), h('div', { class: 'toast is-upload is-failed' }, h('i', { class: 'toast-void' }), h('span', null, '2 uploads failed'), h('button', { type: 'button' }, 'Retry'))),
      row('The real ones', btn('Show a toast', '', { onclick: () => toast('Sent to Recipes', { action: { label: 'Move', run: () => toast('Moved') } }) }),
        btn('A long one', '', { onclick: () => toast('“The summer we kept writing home” is on Postcards and Drafts now, and it kept its place in both') }))),
    section('Comment note', 'New comments on your files, told on your own galaxy under the clock, one note per file, three at a time. Pressing it opens the file at its comments; the cross waves it away.',
      h('div', { class: 'parts-stack parts-notes' },
        commentNote({ block: { kind: 'text', content: 'the pier at dusk' }, count: 1, people: ['ines'], latest: { by: 'ines', body: 'I know this pier! Is it Brighton?', createdAt: Date.now() - 3 * 3600e3 } }),
        commentNote({ block: { kind: 'text', title: 'The summer we kept writing home' }, count: 3, people: ['tomas'], latest: { by: 'tomas', body: 'The second paragraph is my favourite thing you have written all year, honestly.', createdAt: Date.now() - 26 * 3600e3 } }),
        commentNote({ block: { kind: 'image', title: 'Harbour wall.jpg' }, count: 4, people: ['ines', 'tomas', 'ada'], latest: { by: 'ada', body: 'Such light', createdAt: Date.now() - 4 * 86400e3 } }))),
    section('Tip', 'Mutt speaking once: the sharing tip, the phone note.', tip),
    section('Tooltip', 'What an icon button or a cut-off name is called. Point at the round buttons at the top for the real one.',
      row(null, tooltip('Search', '/'), tooltip('Planet options'))),
    section('Drop hint', 'While files are dragged over the window the thing that will take them lights up, and one label sits where toasts sit.',
      row(null, h('div', { class: 'parts-box fglass is-drop' }, 'The add box'), h('span', { class: 'btn btn-main' }, 'Drop to add to Postcards'),
        h('span', { class: 'btn btn-main drop-word is-on is-hint' }, 'Open a planet to add files'))),
  ];
}

// The file box: one frame for every kind of file, built by renderCell from
// made-up files. A new kind of file is added to FILES here first.
const drawn = (w, hgt, a, b) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}">`
  + `<defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`)}`;
const LASTS = { video: 42, song: 222 };   // seconds
const FILES = [
  ['A picture, wide', { kind: 'image', title: 'pier-at-dusk', thumb: drawn(600, 400, PALETTE[4], PALETTE[0]), width: 600, height: 400, size: 2202009 }],
  ['A picture, upright', { kind: 'image', title: 'lighthouse, early', thumb: drawn(450, 600, PALETTE[6], PALETTE[3]), width: 450, height: 600, size: 1887436 }],
  ['A video: its length always shows', { kind: 'video', title: 'ferry-in-fog', thumb: drawn(640, 360, PALETTE[6], PALETTE[1]), width: 640, height: 360, duration: LASTS.video, size: 18874368 }],
  ['A page: paper, upright', { kind: 'pdf', ext: 'pdf', title: 'Tide tables 2026', thumb: drawn(480, 620, 'white', 'white'), width: 480, height: 620, meta: { pages: 12 }, size: 1468006 }],
  ['A book: its cover, with a spine', { kind: 'doc', ext: 'epub', title: 'The Harbour Light', thumb: drawn(400, 600, PALETTE[1], PALETTE[4]), width: 400, height: 600, size: 842310 }],
  ['A note', { kind: 'text', content: 'Things to bring back\n\n- sea glass from the north beach\n- the blue enamel mug\n- a tide table for next year', createdAt: Date.UTC(2026, 10, 3) }],
  ['A link', { kind: 'link', title: 'Tide times and heights for the next seven days', content: 'https://tides.example.org', createdAt: Date.UTC(2026, 10, 2),
    meta: { domain: 'tides.example.org', description: 'High and low water for every port on the coast, updated each morning.' } }],
  ['A link with a picture', { kind: 'link', title: 'Winter ferry timetable', content: 'https://ferries.example.org', thumb: drawn(640, 400, PALETTE[3], PALETTE[5]), createdAt: Date.UTC(2026, 9, 30),
    meta: { domain: 'ferries.example.org', description: 'Sailings from 1 November to 31 March.' } }],
  ['A song: level bars and its length', { kind: 'audio', ext: 'm4a', title: 'low-tide-demo', duration: LASTS.song, size: 4299161 }],
  ['Any other file', { kind: 'archive', ext: 'zip', title: 'site-backup', size: 50331648 }],
  ['Code: its first lines, numbered', { kind: 'code', ext: 'py', title: 'tides', size: 2048, meta: { excerpt: 'import math\n\ndef height(t, high, low):\n    mid = (high + low) / 2\n    swing = (high - low) / 2\n    return mid + swing * math.cos(t)\n' } }],
];

function fileBoxes() {
  const sample = ([says, block], i, state) => {
    const cell = renderCell({ id: `sample-${i}`, mine: true, ...block });
    return h('div', { class: 'parts-file' }, state ? held(cell, state) : cell, h('span', { class: 'parts-label' }, state ? `${says}, pointed at` : says));
  };
  const add = entryCell();
  const heads = [sectionHead('Books', { fact: '2' }), sectionHead('Documents', { fact: '2 · 518 words', tools: [btn('Last edited', 'btn-quiet'), btn('New document')] }), sectionHead('Other files')];
  return [
    section('File box', 'One frame for every kind of file: a box four wide to five tall and, under it, its name and one fact. The box shows what is in the file; the caption says what it is called. At rest a box only floats; pointed at, its edge takes the planet’s colour, it glows and it leans.',
      h('div', { class: 'parts-own parts-files' }, FILES.map((f, i) => sample(f, i)),
        sample(FILES[0], 'a', 'hover'), sample(FILES[5], 'b', 'hover'), sample(FILES[8], 'c', 'hover'))),
    section('Add box', 'The first box on a planet: a sunken slot, not a file. Its edge lights in the planet’s colour while you type in it or drag files over it.',
      h('div', { class: 'parts-own parts-files' }, h('div', { class: 'parts-file' }, add, h('span', { class: 'parts-label' }, 'Resting (type in it)')))),
    section('Section heading', 'The name of a group of files and one fact, straight on the sky, with the group’s own buttons at the far end. One for every mode; a page with a single group has none.',
      h('div', { class: 'parts-own parts-heads' }, heads.map((x) => x.el))),
  ];
}

// What session 5 added: the pieces the modes share.
function modeParts() {
  const MARKS = ['yellow', 'green', 'blue', 'pink', 'purple'];
  const dot = (c, on, extra = '') => h('button', { type: 'button', class: `swatch ${extra}`.trim(), style: { '--c': c }, 'aria-pressed': String(!!on), 'aria-label': 'A colour' });
  const round = (words, on) => h('button', { type: 'button', class: `btn btn-quiet btn-round${on ? ' is-on' : ''}`, 'aria-label': words }, words);
  const item = (words, { done = false, state = '' } = {}) => {
    const li = h('li', { class: `lm-item${done ? ' is-done' : ''}` },
      h('div', { class: 'lm-row fglass' },
        h('span', { class: 'lm-grip', 'aria-hidden': 'true' }, icon('grip')),
        h('button', { type: 'button', class: 'lm-mark lm-box', role: 'checkbox', 'aria-checked': String(done), 'aria-label': `Tick off ${words}` }, h('span', { class: 'tick-box' })),
        h('div', { class: 'lm-text is-static' }, words),
        h('button', { type: 'button', class: 'btn btn-quiet btn-small btn-round lm-x', 'aria-label': 'Remove' }, icon('close'))));
    return state ? held(li, state) : li;
  };
  return [
    section('Swatch', 'A colour to pick: a dot of it, 20 across; the chosen one wears a ring. Used for the highlighters in the reader and in documents, a document’s inks, and colours in search. The five highlighters are one named set.',
      row('Highlighters', ...MARKS.map((m, i) => dot(`var(--mark-${m})`, i === 1))),
      row('No colour', dot('transparent', false, 'is-none')),
      row('Large, in a panel of nothing but colours', ...MARKS.map((m, i) => dot(`var(--mark-${m})`, i === 3, 'swatch-large')))),
    section('A tool on bar glass', 'What Mutt gives you to work with inside a room (the editor’s toolbar, the bubble beside selected words) is bar glass holding shared quiet buttons, and stays Mutt blue on every planet. Give it the class bar-glass.',
      h('div', { class: 'bar-glass parts-toolbar' }, round('B'), round('I', true), round('U'), h('span', { class: 'parts-sep' }), h('button', { type: 'button', class: 'btn btn-quiet' }, 'Link'), h('button', { type: 'button', class: 'btn btn-quiet' }, 'Comment'))),
    section('List item', 'On a list planet every item is its own strip of box glass, with the shared tick box in the planet’s colour. Pointed at, it shows its grip and its ×.',
      h('div', { class: 'parts-own parts-list' }, h('ol', { class: 'lm lm-items', dataset: { type: 'check' } },
        item('tide table for next year'), item('renew the ferry pass', { state: 'hover' }), item('bread', { done: true })))),
    section('Paper, and a room’s veil', 'Paper is one flat cream with barely rounded corners and its own shadow; a book’s cover adds a shaded spine. A room (the file view, the editor, cooking) steps the page away and dims the sky with one veil.',
      h('div', { class: 'parts-room' },
        h('div', { class: 'parts-paper' }, h('b', null, 'Low water'), 'The harbour gives its floor away, the ropes lie slack along the quay.'),
        h('div', { class: 'parts-cover' }, h('i', { class: 'rp-spine' }), h('b', null, 'The Quiet Coast')))),
    section('Arm’s length', 'Cooking is read from across a kitchen: its step is set in the reach size and its Back and Next are 52 high. Nothing else uses these two sizes.',
      row(null, h('button', { type: 'button', class: 'btn cbk-back' }, 'Back'), h('button', { type: 'button', class: 'btn btn-main cbk-next' }, 'Next')),
      h('p', { class: 'cbk-text parts-reach' }, 'Rub the chicken with butter.')),
  ];
}

// Every icon in the set, read from icons.js itself, so the sheet can't fall behind the file.
function icons() {
  const cell = (name) => h('button', { type: 'button', class: 'parts-icon', title: name }, icon(name), h('span', null, name));
  const round = (name, label, extra = '') => h('button', { type: 'button', class: `btn btn-quiet btn-round ${extra}`.trim(), 'aria-label': label, title: label }, icon(name, extra.includes('btn-large') ? 20 : 16));
  const item = (name, words, { danger = false, hint = null, state = '' } = {}) => {
    const el = h('button', { type: 'button', role: 'menuitem', class: `menu-item${danger ? ' is-danger' : ''}` },
      h('span', { class: 'menu-icon' }, icon(name)), h('span', null, words), hint ? h('span', { class: 'menu-hint' }, hint) : null);
    return state ? held(el, state) : el;
  };
  const pick = (words, on) => h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(on), class: 'menu-item' },
    h('span', null, words), on ? h('span', { class: 'menu-tick' }, icon('check')) : null);
  return section('Icons', `One set of ${ICON_NAMES.length}, drawn in js/icons.js on a 16 grid with a 1.5 line and round ends. An icon takes the colour of the words beside it. Point at one: its body fills with a little light, as it does on a button that is pointed at or held on.`,
    h('div', { class: 'parts-icons' }, ICON_NAMES.map(cell)),
    row('Three sizes, one line: 12 in a chip or a tag · 16 · 20 in the editor’s and reader’s bars', icon('comment', 12), icon('comment'), icon('comment', 20),
      h('span', { class: 'parts-sep' }), icon('close', 12), icon('close'), icon('close', 20)),
    row('Resting · pointed at · held on', round('bookmark', 'Bookmark'), held(round('bookmark', 'Bookmark'), 'hover'), held(round('bookmark', 'Bookmark'), 'on'),
      h('span', { class: 'parts-sep' }), btn([icon('plus'), 'New card']), btn(['Original', icon('out')], 'btn-quiet'), btn(['Planets', icon('caret')], 'btn-small')),
    row('A tail to leave, a chevron to step', round('back', 'Back to your galaxy'), h('span', { class: 'parts-sep' }), round('chevron-left', 'Previous'), round('chevron-right', 'Next')),
    h('div', { class: 'parts-menus' },
      h('div', { class: 'pop' }, h('div', { class: 'menu' },
        item('open', 'Open'), item('move', 'Other planets…', { state: 'hover' }), item('download', 'Download'), item('link', 'Copy link', { hint: '⌘C' }),
        h('div', { class: 'menu-sep' }), item('trash', 'Delete', { danger: true }))),
      h('div', { class: 'pop' }, h('div', { class: 'menu' },
        h('div', { class: 'menu-head' }, 'Sort'), pick('Last edited', true), pick('Newest', false), pick('Name', false)))),
    note('A menu of things to do gives every row an icon; a menu that picks one of a list gives none, and the chosen row ends in a tick. A menu never mixes the two.'));
}

export function partsView() {
  const el = h('div', { class: 'parts' },
    h('header', { class: 'parts-head' }, h('h1', { class: 'parts-title' }, 'Parts'),
      note('Every shared part in every state, as DESIGN.md section 4 gives them. This page is linked from nowhere. A new part is drawn here first.')),
    buttons(), textBoxes(), ...switches(), menus(), icons(), ...overlays(), ...fileBoxes(), ...modeParts());
  return {
    el,
    title: 'Parts',
    home: true,
    mounted() { el.append(mirrorStates()); },
    destroy() {},
  };
}
