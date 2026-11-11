// Toasts, dialogs, popovers, menus, sliding pills and the PIN field.

import { PALETTE, h, reducedMotion } from './util.js';

// ---------------------------------------------------------------- sliding-pill control

export function segmented(options, active, onPick, { className = '', label } = {}) {
  const ind = h('span', { class: 'seg-ind', 'aria-hidden': 'true' });
  const el = h('div', { class: `seg ${className}`, role: 'tablist', 'aria-label': label }, ind);
  const buttons = new Map();
  let current = active;
  const place = () => {
    const btn = buttons.get(current);
    if (!btn || !btn.offsetWidth) { ind.style.opacity = '0'; return; }
    const index = [...buttons.keys()].indexOf(current);
    ind.style.setProperty('--seg-color', PALETTE[index % PALETTE.length]);
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
      const b = h('button', { type: 'button', role: 'tab', class: 'seg-btn', onclick: () => onPick(o.value) },
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

function exit(el, className = 'is-leaving', fallback = 320) {
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
let toastCount = 0;
export function toast(message, { action, duration } = {}) {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  // A note with a button (Undo, Move) stays long enough to reach it.
  duration ??= action ? 8000 : 3600;
  const el = h('div', { class: 'toast', style: { '--toast-color': PALETTE[toastCount++ % PALETTE.length] } },
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
  while (toastHost.children.length > 3) {
    const kids = [...toastHost.children];
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
  requestAnimationFrame(() => card.querySelector('[autofocus], input, textarea, button.btn-dark')?.focus());
  return { el: card, close };
}

export function confirmDialog({ title, message, confirm = 'Confirm', danger = false, extra = null }) {
  return new Promise((resolve) => {
    let result = false;
    const confirmBtn = h('button', {
      type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-dark'}`,
      onclick: () => { result = true; dialog.close(); },
    }, confirm);
    const body = h('div', null,
      message ? h('p', { class: 'dialog-text' }, message) : null,
      extra,
      h('div', { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => dialog.close() }, 'Cancel'),
        confirmBtn));
    const dialog = openDialog({ title, body, onClose: () => resolve(result) });
    requestAnimationFrame(() => confirmBtn.focus());
  });
}

// ---------------------------------------------------------------- popovers & menus

export function openPopover(anchor, content, { align = 'start', className = '', onClose, width } = {}) {
  closeAllPopovers();
  const el = h('div', { class: `pop ${className}` }, content);
  if (width) el.style.width = `${width}px`;
  document.body.append(el);
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
    exit(el, 'is-leaving', 200);
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
  const api = { el, close, place };
  openPopovers.add(api);
  openLayers.push(api);
  return api;
}

const openPopovers = new Set();
export function closeAllPopovers() {
  for (const p of [...openPopovers]) p.close();
}

export function openMenu(anchor, items, opts = {}) {
  let pop;
  const list = h('div', { class: 'menu', role: 'menu' },
    items.filter(Boolean).map((item) => item === '-'
      ? h('div', { class: 'menu-sep' })
      : h('button', {
        type: 'button', role: 'menuitem', class: `menu-item${item.danger ? ' is-danger' : ''}`,
        onclick: () => { pop.close(); item.run(); },
      }, h('span', null, item.label), item.hint ? h('span', { class: 'menu-hint' }, item.hint) : null)));
  pop = openPopover(anchor, list, opts);
  return pop;
}

// A right-click menu, opened where the pointer is. Items are like openMenu's,
// plus `{ heading }` for a small section label and `icon` (an element) before
// the label. It grows out of the pointer, its rows arrive one after another,
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
  const hi = h('span', { class: 'ctx-hi', 'aria-hidden': 'true' });
  const rows = [];
  let n = 0;
  const list = h('div', { class: 'menu ctx-menu', role: 'menu', 'aria-label': title || 'Actions' }, hi,
    title ? h('div', { class: 'ctx-title' }, title) : null,
    items.filter(Boolean).map((item) => {
      if (item === '-') return h('div', { class: 'menu-sep' });
      if (item.heading) return h('div', { class: 'ctx-heading', style: { '--i': n++ } }, item.heading);
      const btn = h('button', {
        type: 'button', role: 'menuitem', tabindex: '-1',
        class: `menu-item ctx-item${item.danger ? ' is-danger' : ''}`,
        style: { '--i': n++ },
        onclick: () => pick(btn, item),
      }, item.icon ? h('span', { class: 'ctx-icon' }, item.icon) : null,
      h('span', { class: 'ctx-label' }, item.label),
      item.hint ? h('span', { class: 'menu-hint' }, item.hint) : null);
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
  let current = null;
  const light = (btn) => {
    if (btn === current) return;
    const first = !current;
    current = btn;
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
  };
  list.addEventListener('pointerover', (ev) => {
    const btn = ev.target.closest?.('.ctx-item');
    if (btn) { light(btn); if (!keepFocus) btn.focus({ preventScroll: true }); }
  });
  list.addEventListener('pointerleave', () => { light(null); if (el.contains(document.activeElement)) list.focus?.(); });
  list.tabIndex = -1;
  const keys = (ev) => {
    if (keepFocus && ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); return; }
    // Typing on (or Enter before choosing anything) goes to the words, and the menu goes.
    if (keepFocus && (!/^(Arrow(Up|Down)|Enter|Tab)$/.test(ev.key) || (ev.key === 'Enter' && !current))) { close(); return; }
    if (keepFocus) ev.stopPropagation();
    const i = rows.indexOf(current);
    let next = null;
    if (ev.key === 'ArrowDown') next = rows[(i + 1) % rows.length];
    else if (ev.key === 'ArrowUp') next = rows[(i - 1 + rows.length) % rows.length];
    else if (ev.key === 'Home') next = rows[0];
    else if (ev.key === 'End') next = rows[rows.length - 1];
    else if ((ev.key === 'Enter' || ev.key === ' ') && current) { ev.preventDefault(); current.click(); return; }
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
    setTimeout(() => { close(); item.run(); }, 140);
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
    exit(el, 'is-leaving', 200);
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

export function pinField({ autocomplete = 'current-password', onComplete, label = 'PIN' } = {}) {
  const input = h('input', {
    class: 'pin-input', type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '4',
    autocomplete, 'aria-label': label, spellcheck: 'false',
  });
  const cells = Array.from({ length: 4 }, (_, i) =>
    h('div', { class: 'pin-cell', style: { '--i': i } }, h('span', { class: 'pin-dot' })));
  const el = h('div', { class: 'pin' }, cells, input);

  const sync = () => {
    const digits = input.value.replace(/\D/g, '').slice(0, 4);
    if (digits !== input.value) input.value = digits;
    cells.forEach((cell, i) => {
      cell.classList.toggle('is-filled', i < digits.length);
      cell.classList.toggle('is-current', document.activeElement === input && i === Math.min(digits.length, 3) && digits.length < 4);
    });
    return digits;
  };
  input.addEventListener('input', () => {
    el.classList.remove('is-error');
    const digits = sync();
    if (digits.length === 4) onComplete?.(digits);
  });
  input.addEventListener('focus', sync);
  input.addEventListener('blur', sync);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.length === 4) onComplete?.(input.value);
  });

  return {
    el,
    input,
    get value() { return input.value; },
    focus() { input.focus({ preventScroll: true }); sync(); },
    clear() { input.value = ''; sync(); },
    state(name) {
      el.classList.remove('is-error', 'is-busy', 'is-ok');
      if (name) {
        void el.offsetWidth; // restart the animation
        el.classList.add(`is-${name}`);
      }
      input.disabled = name === 'busy' || name === 'ok';
    },
  };
}
