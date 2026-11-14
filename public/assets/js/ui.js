// The shared parts that are built in script (DESIGN.md section 4): the segmented
// bar and tabs, the stepper, toasts, dialogs, small panels, menus, and the PIN field.

import { DUR, h, reducedMotion } from './util.js';
import { icon } from './icons.js';

// ---------------------------------------------------------------- segmented bar, tabs

// A room: a place that covers the page and its bar (the file view, the editor, cooking).
// Give the room's own element the class `room`. Call enterRoom() when it is put on the page
// and leaveRoom() when it is taken off: while a room is open the page steps away and the sky
// stays behind it (the rules are under "room" in galaxy.css).
let rooms = 0;
let leaving = 0;
export function enterRoom() {
  rooms += 1;
  clearTimeout(leaving);
  document.documentElement.classList.remove('leaving-room');
  document.documentElement.classList.add('in-room');
}
export function leaveRoom() {
  rooms = Math.max(0, rooms - 1);
  if (rooms) return;
  document.documentElement.classList.add('leaving-room');
  document.documentElement.classList.remove('in-room');
  leaving = setTimeout(() => document.documentElement.classList.remove('leaving-room'), DUR.arrive);
}

// A segmented bar picks one value of a setting. With `tabs: true` the same
// thing is drawn as tabs (words with a sliding light), for switching what a
// panel shows.
// The heading over a group of files: its name and one fact (DESIGN.md section 4,
// "Section heading"). `tools` are the group's own buttons, at the far end.
// Set the fact with `head.fact.textContent = '4 · 518 words'`.
export function sectionHead(name, { fact = '', tools = [] } = {}) {
  const factEl = h('span', { class: 'sec-fact' }, fact);
  const kept = tools.filter(Boolean);
  const el = h('div', { class: 'sec-head' }, h('h3', { class: 'sec-name' }, name), factEl,
    kept.length ? h('div', { class: 'sec-tools' }, kept) : null);
  return { el, fact: factEl };
}

export function segmented(options, active, onPick, { className = '', label, tabs = false } = {}) {
  const part = tabs ? { box: 'tabs', ind: 'tabs-ind', btn: 'tab' } : { box: 'seg', ind: 'seg-ind', btn: 'seg-btn' };
  const ind = h('span', { class: part.ind, 'aria-hidden': 'true' });
  const el = h('div', { class: `${part.box} ${className}`, role: 'tablist', 'aria-label': label }, ind);
  const buttons = new Map();
  let current = active;
  const place = () => {
    const btn = buttons.get(current);
    if (!btn || !btn.offsetWidth) { ind.style.opacity = '0'; return; }
    const index = [...buttons.keys()].indexOf(current);
    ind.style.opacity = '1';
    ind.style.width = `${btn.offsetWidth}px`;
    ind.style.transform = `translateX(${btn.offsetLeft}px)`;
  };
  const set = (value, animate = true) => {
    current = value;
    for (const [v, b] of buttons) b.setAttribute('aria-selected', v === value);
    el.classList.toggle('is-instant', !animate);
    requestAnimationFrame(place);
  };
  const render = (opts, value) => {
    for (const b of buttons.values()) b.remove();
    buttons.clear();
    for (const o of opts) {
      const b = h('button', { type: 'button', role: 'tab', class: part.btn, onclick: () => onPick(o.value) },
        h('span', null, o.label), o.count != null ? h('span', { class: 'seg-n' }, o.count) : null);
      if (o.style) Object.assign(b.style, o.style);
      buttons.set(o.value, b);
      el.append(b);
    }
    set(value, false);
  };
  // Re-measure when it first appears on the page or fonts change its size.
  new ResizeObserver(() => {
    el.classList.add('is-instant');
    place();
  }).observe(el);
  render(options, active);
  return { el, set, render };
}

// ---------------------------------------------------------------- stepper

// A number with a minus and a plus, in a sunken track. `format` turns the
// value into the words shown; a button at its limit is switched off.
export function stepper({ value, min = -Infinity, max = Infinity, step = 1, format = String, label, less = 'Less', more = 'More', onChange } = {}) {
  const out = h('span', { class: 'stepper-value', 'aria-live': 'polite' });
  const down = h('button', { type: 'button', class: 'stepper-btn', 'aria-label': less, onclick: () => move(-step) }, icon('minus'));
  const up = h('button', { type: 'button', class: 'stepper-btn', 'aria-label': more, onclick: () => move(step) }, icon('plus'));
  const el = h('span', { class: 'stepper', role: 'group', 'aria-label': label }, down, out, up);
  let current = value;
  const set = (v) => {
    current = Math.max(min, Math.min(max, v));
    out.textContent = format(current);
    down.disabled = current <= min;
    up.disabled = current >= max;
  };
  const move = (by) => {
    const before = current;
    set(current + by);
    if (current !== before) onChange?.(current);
  };
  set(value);
  return { el, set, get value() { return current; }, down, up, out };
}

export function exit(el, className = 'is-leaving', fallback = DUR.change + 60) {
  return new Promise((resolve) => {
    if (reducedMotion()) { el.remove(); resolve(); return; }
    el.classList.add(className);
    const done = () => { el.removeEventListener('animationend', own); el.remove(); resolve(); };
    // Only its own exit: a child's animation ending (a shake, a spinner)
    // would otherwise cut it off halfway.
    const own = (e) => { if (e.target === el) done(); };
    el.addEventListener('animationend', own);
    setTimeout(done, fallback);
  });
}

// ---------------------------------------------------------------- toasts

let toastHost;
// Where toasts sit. Uploads put their own toast here (uploads.js).
export function toastsEl() {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  return toastHost;
}
export function toast(message, { action, duration } = {}) {
  toastsEl();
  // A note with a button (Undo, Move) stays long enough to reach it.
  duration ??= action ? 8000 : 3600;
  const el = h('div', { class: 'toast' },
    h('span', null, message));
  let timer;
  let held = false;
  let fired = false;
  const close = () => { clearTimeout(timer); exit(el); };
  // Time spent in another tab or app doesn't count: the note waits for you.
  const wait = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(function expire() {
      if (!document.hidden) { close(); return; }
      document.addEventListener('visibilitychange', () => { timer = setTimeout(expire, 2400); }, { once: true });
    }, ms);
  };
  if (action) {
    el.classList.add('has-action');
    // An action that opens something (`stay`) keeps the toast up to anchor it, and closes it when done.
    const button = h('button', {
      type: 'button',
      onclick: () => {
        if (action.stay) {
          if (el.classList.contains('is-leaving')) return; // nothing left to anchor to
          held = true;
          clearTimeout(timer);
          action.run(button, close);
          return;
        }
        // Once only: a double tap (or a tap as it fades) mustn't undo twice.
        if (fired) return;
        fired = true;
        close();
        Promise.resolve()
          .then(() => action.run(button, close))
          .catch((err) => toast(err?.message || 'That didn’t work. Try again.'));
      },
    }, action.label);
    el.append(button);
  }
  toastHost.append(el);
  // Keep at most three. Plain notes make way first, so a newer message
  // doesn't push an Undo off the screen before you can reach it.
  // The uploads toast isn't one of the three and never makes way.
  const notes = () => [...toastHost.children].filter((t) => !t.classList.contains('is-upload'));
  while (notes().length > 3) {
    const kids = notes();
    (kids.find((t) => !t.classList.contains('has-action') && t !== el) || kids[0]).remove();
  }
  wait(duration);
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', () => { if (!held && !fired) wait(2400); });
  return { close };
}

// ---------------------------------------------------------------- dialogs

const openLayers = [];

export function openDialog({ title, body, className = '', onClose, dismissable = true } = {}) {
  const previous = document.activeElement;
  const card = h('div', { class: `dialog ${className}`, role: 'dialog', 'aria-modal': 'true' },
    title ? h('h2', { class: 'dialog-title' }, title) : null,
    body);
  const scrim = h('div', { class: 'scrim' }, card);
  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    openLayers.splice(openLayers.indexOf(layer), 1);
    exit(scrim);
    previous?.focus?.({ preventScroll: true });
    onClose?.(result);
  };
  const layer = { close: () => dismissable && close() };
  openLayers.push(layer);
  scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim && dismissable) close(); });
  document.body.append(scrim);
  requestAnimationFrame(() => card.querySelector('[autofocus], input, textarea, button.btn-main')?.focus());
  return { el: card, close };
}

export function confirmDialog({ title, message, confirm = 'Confirm', danger = false, extra = null }) {
  return new Promise((resolve) => {
    let result = false;
    const confirmBtn = h('button', {
      type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-main'}`,
      onclick: () => { result = true; dialog.close(); },
    }, confirm);
    const body = h('div', null,
      message ? h('p', { class: 'dialog-text' }, message) : null,
      extra,
      h('div', { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => dialog.close() }, 'Cancel'),
        confirmBtn));
    const dialog = openDialog({ title, body, onClose: () => resolve(result) });
    requestAnimationFrame(() => confirmBtn.focus());
  });
}

// ---------------------------------------------------------------- the keyboard stays where you are

// Tab stays inside whatever is open on top (a dialog, a menu or small panel, a room, a sheet) until
// it is closed; it never walks out into the page behind. A new kind of layer is added to `topLayer`.
const CAN_FOCUS = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
function topLayer() {
  // (the sample page draws parts that are not open layers: those don't count)
  const last = (q) => { const all = [...document.querySelectorAll(q)].filter((el) => !el.closest('.parts')); return all[all.length - 1] || null; };
  return last('.scrim:not(.is-leaving)') || last('.pop:not(.is-leaving)') || last('.room') || last('.sheet.is-open');
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  const layer = topLayer();
  if (!layer) return;
  const at = document.activeElement;
  // Where Tab writes (a document's page), it is the writer's.
  if (at?.isContentEditable && layer.contains(at)) return;
  const stops = [...layer.querySelectorAll(CAN_FOCUS)].filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert]'));
  if (!stops.length) return;
  const first = stops[0];
  const end = stops[stops.length - 1];
  if (!layer.contains(at) || at === (e.shiftKey ? first : end)) {
    e.preventDefault();
    (e.shiftKey ? end : first).focus();
  }
}, true);

// ---------------------------------------------------------------- popovers & menus

export function openPopover(anchor, content, { align = 'start', className = '', onClose, width } = {}) {
  // Pressed again while its own menu or panel is open, a button closes it: it never opens a second.
  const mine = [...openPopovers].find((p) => p.anchor === anchor);
  closeAllPopovers();
  if (mine) return mine;
  const el = h('div', { class: `pop ${className}` }, content);
  if (width) el.style.width = `${width}px`;
  document.body.append(el);
  if (content?.classList?.contains('menu') && !content.classList.contains('ctx-menu')) glideLight(content);
  const place = () => {
    if (!anchor.isConnected) { close(); return; }
    const a = anchor.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    let left = align === 'end' ? a.right - r.width : a.left;
    left = Math.max(12, Math.min(left, innerWidth - r.width - 12));
    let top = a.bottom + 8;
    let origin = 'top';
    if (top + r.height > innerHeight - 12 && a.top - r.height - 8 > 12) {
      top = a.top - r.height - 8;
      origin = 'bottom';
    }
    // Room on neither side (a phone on its side): keep it on the screen.
    top = Math.max(12, Math.min(top, innerHeight - r.height - 12));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.setProperty('--origin', `${origin} ${align === 'end' ? 'right' : 'left'}`);
  };
  place();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('pointerdown', outside, true);
    removeEventListener('resize', resized);
    removeEventListener('scroll', follow, true);
    cancelAnimationFrame(following);
    openPopovers.delete(api);
    openLayers.splice(openLayers.indexOf(api), 1);
    if (el.contains(document.activeElement)) {
      if (anchor.isConnected) anchor.focus?.({ preventScroll: true });
      else document.activeElement.blur();
    }
    exit(el, 'is-leaving', DUR.change + 60);
    anchor.setAttribute?.('aria-expanded', 'false');
    onClose?.();
  };
  const outside = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
  // A new width moves things about, so it closes; a phone's address bar or
  // keyboard only changes the height, and following covers that.
  const openWidth = innerWidth;
  const resized = () => (innerWidth === openWidth ? place() : close());
  addEventListener('resize', resized);
  // Stay with the button it came from while the page (or a panel) scrolls.
  let following = 0;
  const follow = (e) => {
    if (el.contains(e.target)) return;
    cancelAnimationFrame(following);
    following = requestAnimationFrame(place);
  };
  addEventListener('scroll', follow, { capture: true, passive: true });
  anchor.setAttribute?.('aria-expanded', 'true');
  const api = { el, close, place, anchor };
  openPopovers.add(api);
  openLayers.push(api);
  return api;
}

const openPopovers = new Set();
export function closeAllPopovers() {
  for (const p of [...openPopovers]) p.close();
}

// One highlight that glides between a menu's rows, and rows that arrive one after another: every
// menu has both (DESIGN.md "Menu"). `list` is the `.menu`; its rows are its `.menu-item`s.
function glideLight(list) {
  const hi = h('span', { class: 'ctx-hi', 'aria-hidden': 'true' });
  list.classList.add('ctx-menu');
  list.prepend(hi);
  let n = 0;
  for (const row of list.children) if (row !== hi) row.style.setProperty('--i', n++);
  const api = { hi, current: null, light };
  function light(btn) {
    if (btn === api.current) return;
    const first = !api.current;
    api.current = btn;
    if (!btn) { hi.classList.remove('is-on'); return; }
    hi.style.transform = `translateY(${btn.offsetTop}px)`;
    hi.style.height = `${btn.offsetHeight}px`;
    hi.classList.toggle('is-danger', btn.classList.contains('is-danger'));
    if (first) {
      // Appear in place rather than sliding in from the top.
      hi.style.transition = 'none';
      void hi.offsetWidth;
      hi.style.transition = '';
    }
    hi.classList.add('is-on');
  }
  const rowOf = (ev) => { const b = ev.target.closest?.('.menu-item'); return b && list.contains(b) ? b : null; };
  list.addEventListener('pointerover', (ev) => { const b = rowOf(ev); if (b) light(b); });
  list.addEventListener('focusin', (ev) => { const b = rowOf(ev); if (b) light(b); });
  list.addEventListener('pointerleave', () => light(null));
  // A menu that fills itself again (search's choices, ticked one by one) keeps its highlight, and
  // rows put in later don't arrive a second time.
  new MutationObserver(() => {
    if (hi.parentNode !== list) { api.current = null; hi.classList.remove('is-on'); list.prepend(hi); }
    list.classList.add('is-refilled');
  }).observe(list, { childList: true });
  return api;
}

// A chosen row blinks once before its menu closes.
function pickRow(btn, done) {
  const list = btn.closest('.ctx-menu');
  if (!list || reducedMotion()) { done(); return; }
  if (list.dataset.picked) return;
  list.dataset.picked = '1';
  btn.classList.add('is-picked');
  list.querySelector(':scope > .ctx-hi')?.classList.add('is-picked');
  setTimeout(done, DUR.quick + 20);
}

// What leads and ends a menu row. `icon` is a name from icons.js (or an element, for a planet's dot).
// A menu gives every row an icon or none (DESIGN.md "Menu"). `on` (true or false) makes the row one
// of a set of choices: the chosen one ends in a tick.
const rowIcon = (item) => (item.icon ? h('span', { class: 'menu-icon' }, typeof item.icon === 'string' ? icon(item.icon) : item.icon) : null);
const rowEnd = (item) => [item.hint ? h('span', { class: 'menu-hint' }, item.hint) : null, item.on ? h('span', { class: 'menu-tick' }, icon('check')) : null];
const rowRole = (item) => ('on' in item ? { role: 'menuitemradio', 'aria-checked': String(!!item.on) } : { role: 'menuitem' });

export function openMenu(anchor, items, opts = {}) {
  let pop;
  const list = h('div', { class: 'menu', role: 'menu' },
    items.filter(Boolean).map((item) => item === '-'
      ? h('div', { class: 'menu-sep' })
      : h('button', {
        type: 'button', ...rowRole(item), class: `menu-item${item.danger ? ' is-danger' : ''}`,
        onclick: (ev) => pickRow(ev.currentTarget, () => { pop.close(); item.run(); }),
      }, rowIcon(item), h('span', null, item.label), rowEnd(item))));
  pop = openPopover(anchor, list, opts);
  return pop;
}

// A right-click menu, opened where the pointer is. Items are like openMenu's,
// plus `{ heading }` for a small section label. It grows out of the pointer, its rows arrive one after another,
// and one highlight glides between them. With `keepFocus` the text being
// written in keeps the focus (and its caret) while the menu is open, and the
// keys still work the menu.
export function openContextMenu(e, items, { title, target, onClose, keepFocus = false } = {}) {
  e.preventDefault();
  closeAllPopovers();
  // The thing it's about stays lit while the menu is open.
  target?.classList.add('is-ctx');
  const x = e.clientX;
  const y = e.clientY;
  const rows = [];
  const list = h('div', { class: 'menu', role: 'menu', 'aria-label': title || 'Actions' },
    title ? h('div', { class: 'ctx-title' }, title) : null,
    items.filter(Boolean).map((item) => {
      if (item === '-') return h('div', { class: 'menu-sep' });
      if (item.heading) return h('div', { class: 'menu-head ctx-heading' }, item.heading);
      const btn = h('button', {
        type: 'button', ...rowRole(item), tabindex: '-1',
        class: `menu-item ctx-item${item.danger ? ' is-danger' : ''}`,
        onclick: () => pick(btn, item),
      }, rowIcon(item), h('span', { class: 'ctx-label' }, item.label), rowEnd(item));
      rows.push(btn);
      return btn;
    }));
  const el = h('div', { class: 'pop pop-ctx' }, list);
  document.body.append(el);

  // Open toward the room there is, growing from the corner at the pointer.
  // Its own size, not the bounding box: that is still shrunk by the opening animation.
  const r = { width: el.offsetWidth, height: el.offsetHeight };
  const right = x + r.width + 8 <= innerWidth - 8;
  const down = y + r.height + 8 <= innerHeight - 8;
  const left = right ? x + 2 : Math.max(8, x - r.width - 2);
  const top = down ? y + 2 : Math.max(8, Math.min(y - r.height - 2, innerHeight - r.height - 8));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.setProperty('--origin', `${x - left}px ${y - top}px`);

  // The highlight follows the row under the pointer (or the keyboard).
  const glide = glideLight(list);
  const { hi, light } = glide;
  list.addEventListener('pointerover', (ev) => {
    const btn = ev.target.closest?.('.ctx-item');
    if (btn) { light(btn); if (!keepFocus) btn.focus({ preventScroll: true }); }
  });
  list.addEventListener('pointerleave', () => { light(null); if (el.contains(document.activeElement)) list.focus?.(); });
  list.tabIndex = -1;
  const keys = (ev) => {
    if (keepFocus && ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); return; }
    // Typing on (or Enter before choosing anything) goes to the words, and the menu goes.
    if (keepFocus && (!/^(Arrow(Up|Down)|Enter|Tab)$/.test(ev.key) || (ev.key === 'Enter' && !glide.current))) { close(); return; }
    if (keepFocus) ev.stopPropagation();
    const i = rows.indexOf(glide.current);
    let next = null;
    if (ev.key === 'ArrowDown') next = rows[(i + 1) % rows.length];
    else if (ev.key === 'ArrowUp') next = rows[(i - 1 + rows.length) % rows.length];
    else if (ev.key === 'Home') next = rows[0];
    else if (ev.key === 'End') next = rows[rows.length - 1];
    else if ((ev.key === 'Enter' || ev.key === ' ') && glide.current) { ev.preventDefault(); glide.current.click(); return; }
    else if (ev.key === 'Tab') { ev.preventDefault(); close(); return; }
    if (!next) return;
    ev.preventDefault();
    light(next);
    if (!keepFocus) next.focus({ preventScroll: true });
  };
  if (keepFocus) {
    // Clicking a row mustn't take the focus from the words either.
    el.addEventListener('mousedown', (ev) => ev.preventDefault());
    document.addEventListener('keydown', keys, true);
  } else {
    list.addEventListener('keydown', keys);
    requestAnimationFrame(() => list.focus({ preventScroll: true }));
  }

  // A chosen row blinks once, then the menu folds back into the pointer.
  let busy = false;
  function pick(btn, item) {
    if (busy) return;
    busy = true;
    light(btn);
    if (reducedMotion()) { close(); item.run(); return; }
    btn.classList.add('is-picked');
    hi.classList.add('is-picked');
    setTimeout(() => { close(); item.run(); }, DUR.quick + 20);
  }

  let closed = false;
  const before = document.activeElement;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', keys, true);
    removeEventListener('resize', close);
    removeEventListener('scroll', scrolled, true);
    removeEventListener('blur', close);
    openPopovers.delete(api);
    openLayers.splice(openLayers.indexOf(api), 1);
    if (el.contains(document.activeElement)) {
      if (before?.isConnected && before !== document.body) before.focus?.({ preventScroll: true });
      else document.activeElement.blur();
    }
    exit(el, 'is-leaving', DUR.change + 60);
    target?.classList.remove('is-ctx');
    onClose?.();
  }
  const outside = (ev) => { if (!el.contains(ev.target)) close(); };
  const scrolled = (ev) => { if (!el.contains(ev.target)) close(); };
  setTimeout(() => {
    if (closed) return;
    document.addEventListener('pointerdown', outside, true);
    addEventListener('scroll', scrolled, { capture: true, passive: true });
  });
  addEventListener('resize', close);
  addEventListener('blur', close);
  // A second right-click elsewhere opens a fresh menu there.
  el.addEventListener('contextmenu', (ev) => ev.preventDefault());
  const api = { el, close, place: () => {} };
  openPopovers.add(api);
  openLayers.push(api);
  return api;
}

// Escape closes the top-most layer.
export function closeTopLayer() {
  const top = openLayers[openLayers.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

// ---------------------------------------------------------------- PIN field

// `length` is how many digits it takes. `either` is for typing in a sign-in
// code you already have: 6 digits, or 4 for older accounts, which goes in on
// Enter or after a short pause (the two extra rings stay faint until used).
export function pinField({ autocomplete = 'current-password', onComplete, label = 'PIN', length = 4, either = false } = {}) {
  const input = h('input', {
    class: 'pin-input', type: 'password', inputmode: 'numeric', pattern: '[0-9]*',
    autocomplete, 'aria-label': label, spellcheck: 'false',
  });
  const el = h('div', { class: 'pin' }, input);
  let cells = [];
  let most = 4;
  let short = false;
  let pause = 0;
  const configure = (opts) => {
    short = !!opts.either;
    most = short ? 6 : (opts.length || 4);
    input.maxLength = most;
    for (const c of cells) c.remove();
    cells = Array.from({ length: most }, (_, i) =>
      h('div', { class: `pin-cell${short && i >= 4 ? ' is-extra' : ''}`, style: { '--i': i } }, h('span', { class: 'pin-dot' })));
    input.before(...cells);
    el.classList.toggle('is-six', most === 6);
    input.value = input.value.slice(0, most);
    sync();
  };
  const sync = () => {
    const digits = input.value.replace(/\D/g, '').slice(0, most);
    if (digits !== input.value) input.value = digits;
    cells.forEach((cell, i) => {
      cell.classList.toggle('is-filled', i < digits.length);
      cell.classList.toggle('is-current', document.activeElement === input && i === Math.min(digits.length, most - 1) && digits.length < most);
    });
    el.classList.toggle('is-long', digits.length > 4);
    return digits;
  };
  const done = (digits) => (digits.length === most || (short && digits.length === 4));
  input.addEventListener('input', () => {
    el.classList.remove('is-error');
    clearTimeout(pause);
    const digits = sync();
    if (digits.length === most) onComplete?.(digits);
    else if (short && digits.length === 4) {
      pause = setTimeout(() => { if (input.value === digits) onComplete?.(digits); }, 1600);
    }
  });
  input.addEventListener('focus', sync);
  input.addEventListener('blur', sync);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && done(input.value)) { clearTimeout(pause); onComplete?.(input.value); }
  });
  configure({ length, either });

  return {
    el,
    input,
    get value() { return input.value; },
    configure,
    focus() { input.focus({ preventScroll: true }); sync(); },
    clear() { clearTimeout(pause); input.value = ''; sync(); },
    state(name) {
      clearTimeout(pause);
      el.classList.remove('is-error', 'is-busy', 'is-ok');
      if (name) {
        void el.offsetWidth; // restart the animation
        el.classList.add(`is-${name}`);
      }
      input.disabled = name === 'busy' || name === 'ok';
    },
  };
}
