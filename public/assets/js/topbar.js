// The bar along the top, and account actions.

import { api, session } from './api.js';
import { nav } from './nav.js';
import { renderIcon } from './pixel.js';
import { forgetPrefs, parade } from './theme.js';
import { openDialog, openMenu, pinField, segmented, toast } from './ui.js';
import { h, wait } from './util.js';

const SECTIONS = [
  { value: '/', label: 'Filing cabinet' },
  { value: '/all', label: 'Everything' },
  { value: '/users', label: 'Users' },
];

function sectionFor(path) {
  if (path === '/all') return '/all';
  if (path === '/users' || path.startsWith('/u/')) return '/users';
  if (path === '/' || path.startsWith('/d/')) return '/';
  return null;
}

export function createTopbar() {
  const crumbs = h('nav', { class: 'crumbs', 'aria-label': 'You are here' });
  const sections = segmented(SECTIONS, '/', (path) => nav.go(path), { className: 'sections', label: 'Sections' });
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
    { label: 'Filing cabinet', run: () => nav.go('/') },
    { label: 'Everything', run: () => nav.go('/all') },
    { label: 'Users', run: () => nav.go('/users') },
    '-',
    { label: 'Settings', run: () => nav.go('/settings') },
    { label: 'Sign out', run: signOut },
  ], { align: 'end', className: 'pop-me' }));

  const crowd = h('span', { class: 'topbar-crowd' });
  const bar = h('header', { class: 'topbar' },
    h('div', { class: 'topbar-in' },
      h('a', { class: 'wordmark', href: '/', 'aria-label': 'Mutt, home' },
        [...'Mutt'].map((ch, i) => h('span', { style: { '--i': i } }, ch))),
      crowd,
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

  let crowdFor = null;
  return {
    el: bar,
    search,
    update(inst, url) {
      const name = session.user?.username || '';
      me.textContent = name;
      // Colorful mode's little parade, the same critters every time for you.
      if (name && crowdFor !== name) {
        crowdFor = name;
        crowd.replaceChildren(parade(name, 5, 18));
      }
      sections.set(sectionFor(url.pathname), true);
      if (url.pathname === '/search') search.value = url.searchParams.get('q') || '';
      const items = typeof inst.crumbs === 'function' ? inst.crumbs() : inst.crumbs || [];
      crumbs.replaceChildren(...items.map((c) => h(c.href ? 'a' : 'span', { class: 'crumb', href: c.href },
        c.icon ? renderIcon(c.icon, { size: 18 }) : null, h('span', null, c.label))));
    },
  };
}

// ---------------------------------------------------------------- account

export async function signOut() {
  try { await api.post('/api/auth/logout'); } catch { /* signed out either way */ }
  session.user = null;
  forgetPrefs();
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

export function changePin() {
  pinSteps({
    title: 'Change code',
    steps: [{ label: 'Current code' }, { label: 'New code', restart: true }, { label: 'Again' }],
    onDone: async ([current, next, again]) => {
      if (next !== again) return 'Those didn’t match.';
      await api.post('/api/me/pin', { current, next });
      toast('Code changed');
      return null;
    },
  });
}

export function deleteAccount() {
  pinSteps({
    title: 'Delete account?',
    steps: [{ label: 'Everything you’ve stored goes for good. Enter your code.' }],
    onDone: async ([pin]) => {
      await api.post('/api/me/delete', { pin });
      session.user = null;
      forgetPrefs();
      setTimeout(() => nav.go('/login', { replace: true }), 450);
      return null;
    },
  });
}
