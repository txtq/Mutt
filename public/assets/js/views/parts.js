// The sample page: every shared part in every state (DESIGN.md section 4).
// It lives at /parts, is linked from nowhere, and its code is fetched only
// when that address is opened (main.js).
//
// To add a part: draw it here first as one more `section(...)`, show the user,
// add it to DESIGN.md and to the shared parts in galaxy.css, then use it.
// States are not drawn by hand: `held(el, 'hover' | 'active' | 'focus')`
// gives a sample the real rule for that state, copied from the stylesheets
// when the page opens (mirrorStates), so the samples can't drift from the app.

import { glyph } from '../planets.js';
import { confirmDialog, openContextMenu, openMenu, openPopover, segmented, stepper, toast } from '../ui.js';
import { PALETTE, h } from '../util.js';

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
  const round = (kind, label, icon, extra = '') => h('button', { type: 'button', class: `btn btn-round ${kind} ${extra}`, 'aria-label': label, title: label }, glyph(icon, 14));
  return section('Button', 'Four kinds, three sizes, one shape. One main button per view; quiet for turning something down; danger only to confirm in a dialog.',
    h('div', { class: 'parts-scroll' }, grid),
    row('Small 24 · regular 32 · large 40', btn('Add', 'btn-main btn-small'), btn('Make it a list', 'btn-main'), btn('Sign in', 'btn-main btn-large'),
      btn('Retry', 'btn-small'), btn('Share'), btn('Sign out', 'btn-large'), btn('Upload', 'btn-quiet btn-small'), btn('Not now', 'btn-quiet')),
    row('Round: an icon alone', round('', 'Share', 'people'), round('btn-quiet', 'Search (/)', 'search'), round('btn-quiet', 'Search (/)', 'search', 'btn-small'),
      held(round('btn-quiet', 'Held on, like Bold in a toolbar', 'star'), 'on')),
    h('div', { class: 'parts-own fglass', style: { '--pc': PALETTE[5], '--pa': 'color-mix(in oklab, var(--pc), var(--shade) 34%)' } },
      row('On a planet’s own things', btn([glyph('people', 13), h('span', null, 'Share')]), btn('Make it a list', 'btn-main'), btn('Not now', 'btn-quiet'), btn('Add', 'btn-main btn-small'))),
    note('Inside a planet’s own page content the main button takes the planet’s deep colour and a plain button’s edge a third of it. Nothing on bar glass does.'));
}

function textBoxes() {
  const field = (extra = {}) => h('input', { class: 'field', type: 'text', placeholder: 'Someone’s username', 'aria-label': 'Sample text box', ...extra });
  const search = h('label', { class: 'field field-search' }, glyph('search', 14),
    h('span', { class: 'chip' }, h('i', { class: 'chip-dot', style: { '--c': PALETTE[2] } }), 'Postcards', h('button', { type: 'button', class: 'chip-x', 'aria-label': 'Remove Postcards' }, '×')),
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
    h('button', { type: 'button', class: 'chip-x', 'aria-label': `Remove ${words}` }, '×'));
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
    { label: 'Rename', run: () => toast('Rename') }, { label: 'Add a moon…', hint: '2 of 4', run: () => toast('Add a moon') }, '-',
    { label: 'Delete planet…', danger: true, run: () => toast('Nothing was deleted') }];
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
    section('Tip', 'Mutt speaking once: the sharing tip, the phone note.', tip),
    section('Tooltip', 'What an icon button or a cut-off name is called. Point at the round buttons at the top for the real one.',
      row(null, tooltip('Search', '/'), tooltip('Planet options'))),
    section('Drop hint', 'While files are dragged over the window the thing that will take them lights up, and one label sits where toasts sit.',
      row(null, h('div', { class: 'parts-box fglass is-drop' }, 'The add box'), h('span', { class: 'btn btn-main' }, 'Drop to add to Postcards'),
        h('span', { class: 'btn btn-main drop-word is-on is-hint' }, 'Open a planet to add files'))),
  ];
}

export function partsView() {
  const el = h('div', { class: 'parts' },
    h('header', { class: 'parts-head' }, h('h1', { class: 'parts-title' }, 'Parts'),
      note('Every shared part in every state, as DESIGN.md section 4 gives them. This page is linked from nowhere. A new part is drawn here first.')),
    buttons(), textBoxes(), ...switches(), menus(), ...overlays());
  return {
    el,
    title: 'Parts',
    home: true,
    mounted() { el.append(mirrorStates()); },
    destroy() {},
  };
}
