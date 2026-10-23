// The bar along the top, and account settings.

import { api, session } from './api.js';
import { segmented } from './collection.js';
import { nav } from './nav.js';
import { renderIcon } from './pixel.js';
import { openDialog, openMenu, pinField, toast } from './ui.js';
import { h, wait } from './util.js';

const SECTIONS = [
  { value: '/', label: 'Drawers' },
  { value: '/bundles', label: 'Bundles' },
  { value: '/all', label: 'Everything' },
];

function sectionFor(path) {
  if (path.startsWith('/bundles')) return '/bundles';
  if (path === '/all') return '/all';
  if (path === '/' || path.startsWith('/d/')) return '/';
  return null;
}

export function createTopbar() {
  const crumbs = h('nav', { class: 'crumbs', 'aria-label': 'You are here' });
  const sections = segmented(SECTIONS, '/', (path) => nav.go(path), { className: 'sections' });
  const search = h('input', { class: 'search', type: 'search', placeholder: 'Search', 'aria-label': 'Search', autocomplete: 'off' });
  const searchForm = h('form', { class: 'search-form', role: 'search' }, search, h('kbd', { class: 'search-kbd' }, '/'));
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = search.value.trim();
    nav.go(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
    search.blur();
  });
  const me = h('button', { type: 'button', class: 'me' });
  me.addEventListener('click', () => openMenu(me, [
    { label: 'Drawers', run: () => nav.go('/') },
    { label: 'Bundles', run: () => nav.go('/bundles') },
    { label: 'Everything', run: () => nav.go('/all') },
    '-',
    { label: 'Change PIN…', run: changePin },
    { label: 'Sign out', run: signOut },
    '-',
    { label: 'Delete account…', danger: true, run: deleteAccount },
  ], { align: 'end', className: 'pop-me' }));

  const bar = h('header', { class: 'topbar' },
    h('div', { class: 'topbar-in' },
      h('a', { class: 'wordmark', href: '/', 'aria-label': 'Mutt, home' }, 'Mutt'),
      crumbs,
      h('div', { class: 'topbar-spacer' }),
      sections.el,
      searchForm,
      me));

  let scrolled = false;
  addEventListener('scroll', () => {
    const next = scrollY > 4;
    if (next !== scrolled) { scrolled = next; bar.classList.toggle('is-scrolled', next); }
  }, { passive: true });

  return {
    el: bar,
    search,
    update(inst, url) {
      me.textContent = session.user ? session.user.username : '';
      sections.set(sectionFor(url.pathname), true);
      if (url.pathname === '/search') search.value = url.searchParams.get('q') || '';
      const items = typeof inst.crumbs === 'function' ? inst.crumbs() : inst.crumbs || [];
      crumbs.replaceChildren(...items.map((c) => h(c.href ? 'a' : 'span', { class: 'crumb', href: c.href },
        c.icon ? renderIcon(c.icon, { size: 18 }) : null, h('span', null, c.label))));
    },
  };
}

// ---------------------------------------------------------------- account

async function signOut() {
  try { await api.post('/api/auth/logout'); } catch { /* signed out either way */ }
  session.user = null;
  nav.go('/login', { replace: true });
}

function pinSteps({ title, steps, onDone }) {
  let index = 0;
  const values = [];
  const label = h('p', { class: 'dialog-text' });
  const msg = h('p', { class: 'dialog-msg' });
  const field = pinField({
    autocomplete: 'off',
    onComplete: async (digits) => {
      msg.textContent = '';
      values[index] = digits;
      if (index < steps.length - 1) {
        index++;
        show();
        return;
      }
      field.state('busy');
      const error = await onDone(values).catch((err) => err.message);
      if (!error) { field.state('ok'); await wait(400); dialog.close(); return; }
      field.state('error');
      msg.textContent = error;
      await wait(420);
      index = steps.findIndex((s) => s.restart) >= 0 && error.includes('match') ? 1 : 0;
      show();
    },
  });
  const show = () => {
    label.textContent = steps[index].label;
    label.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'ease-out' });
    field.state('');
    field.clear();
    setTimeout(() => field.focus(), 40);
  };
  const dialog = openDialog({ title, body: h('div', { class: 'pin-dialog' }, label, field.el, msg) });
  show();
  return dialog;
}

function changePin() {
  pinSteps({
    title: 'Change PIN',
    steps: [{ label: 'Your current PIN' }, { label: 'A new 4-digit PIN', restart: true }, { label: 'The new PIN again' }],
    onDone: async ([current, next, again]) => {
      if (next !== again) return 'Those didn’t match.';
      await api.post('/api/me/pin', { current, next });
      toast('PIN changed. Other devices were signed out.');
      return null;
    },
  });
}

function deleteAccount() {
  pinSteps({
    title: 'Delete your account?',
    steps: [{ label: 'This removes every drawer, block and file for good. Enter your PIN to confirm.' }],
    onDone: async ([pin]) => {
      await api.post('/api/me/delete', { pin });
      session.user = null;
      setTimeout(() => nav.go('/login', { replace: true }), 450);
      return null;
    },
  });
}
