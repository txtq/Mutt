// Toasts, dialogs, popovers, menus and the PIN field.

import { h, reducedMotion } from './util.js';

function exit(el, className = 'is-leaving', fallback = 320) {
  return new Promise((resolve) => {
    if (reducedMotion()) { el.remove(); resolve(); return; }
    el.classList.add(className);
    const done = () => { el.remove(); resolve(); };
    el.addEventListener('animationend', done, { once: true });
    setTimeout(done, fallback);
  });
}

// ---------------------------------------------------------------- toasts

let toastHost;
export function toast(message, { action, duration = 3600 } = {}) {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const el = h('div', { class: 'toast' }, h('span', null, message));
  let timer;
  const close = () => { clearTimeout(timer); exit(el); };
  if (action) {
    el.append(h('button', { type: 'button', onclick: () => { close(); action.run(); } }, action.label));
  }
  toastHost.append(el);
  while (toastHost.children.length > 3) toastHost.firstElementChild.remove();
  timer = setTimeout(close, duration);
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', () => { timer = setTimeout(close, 1800); });
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
    removeEventListener('resize', close);
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
  addEventListener('resize', close);
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
