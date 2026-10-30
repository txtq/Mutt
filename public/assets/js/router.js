// History-based routing with animated page changes. The `b` query
// parameter opens a block in the viewer over whatever page you're on.

import { session } from './api.js';
import { nav } from './nav.js';
import { canTransition, transition, visibleShared } from './transitions.js';
import { closeAllPopovers, toast } from './ui.js';
import { h } from './util.js';
import { closeViewer, configureViewer, openViewer, viewerBlockId, viewerOpen } from './viewer.js';

const routes = [];
const redirects = [];
let current = null;
let navId = 0;
let root;
let chrome = { update() {} };

export function route(pattern, view) {
  routes.push({ pattern, view });
}

// Old addresses: `to(params)` gives the new one.
export function redirect(pattern, to) {
  redirects.push({ pattern, to });
}

export const currentView = () => current?.inst || null;

const notFound = {
  create: () => ({
    el: h('div', { class: 'page page-missing' },
      h('h1', { class: 'page-title' }, 'Nothing out here.'),
      h('p', { class: 'page-meta' }, 'That planet may have been deleted, or kept private.'),
      h('a', { class: 'vbtn vbtn-blue', href: '/', onclick: (e) => { e.preventDefault(); go('/'); } }, 'Back to your galaxy')),
    title: 'Not found',
  }),
};

function withoutBlock(url) {
  const u = new URL(url);
  u.searchParams.delete('b');
  return u.search;
}

function rememberScroll() {
  history.replaceState({ ...(history.state || {}), scroll: scrollY }, '');
}

// motion: 'none' when the page has already animated itself away (galaxy swipes).
export function go(url, { replace = false, viewer = false, motion = 'page' } = {}) {
  const target = new URL(url, location.href);
  const path = target.pathname + target.search;
  if (!replace) rememberScroll();
  history[replace ? 'replaceState' : 'pushState']({ viewer: viewer || (replace && history.state?.viewer) || false }, '', path);
  return render({ motion });
}

const progress = {
  el: null,
  timer: null,
  start() {
    this.el ||= document.body.appendChild(h('div', { class: 'progress' }));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.el.classList.add('is-on'), 140);
  },
  done() {
    clearTimeout(this.timer);
    if (!this.el?.classList.contains('is-on')) return;
    this.el.classList.add('is-done');
    setTimeout(() => this.el.classList.remove('is-on', 'is-done'), 420);
  },
};

async function syncViewer(blockId) {
  if (blockId && viewerBlockId() !== blockId) {
    await openViewer(blockId, { list: current?.inst.list?.() || [], drawer: current?.inst.drawer || null });
  } else if (!blockId && viewerOpen()) {
    await closeViewer();
  }
}

export async function render({ pop = false, motion = 'page' } = {}) {
  closeAllPopovers();
  const url = new URL(location.href);
  for (const r of redirects) {
    const m = r.pattern.exec(url.pathname);
    if (m) {
      history.replaceState(history.state, '', r.to(m.slice(1).map(decodeURIComponent)) + url.search);
      return render({ pop, motion });
    }
  }
  if (!session.user && url.pathname !== '/login') {
    const next = url.pathname === '/' ? '' : `?next=${encodeURIComponent(url.pathname + url.search)}`;
    history.replaceState(null, '', `/login${next}`);
    return render();
  }
  if (session.user && url.pathname === '/login') {
    const next = url.searchParams.get('next');
    history.replaceState(null, '', next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
    return render();
  }

  const blockId = url.searchParams.get('b');
  const base = withoutBlock(url);
  if (current && current.path === url.pathname) {
    if (current.base === base) { await syncViewer(blockId); return; }
    if (current.inst.update && await current.inst.update(url)) {
      current.base = base;
      await syncViewer(blockId);
      return;
    }
  }

  const id = ++navId;
  let match = null;
  for (const r of routes) {
    const m = r.pattern.exec(url.pathname);
    if (m) { match = { view: r.view, params: m.slice(1).map(decodeURIComponent) }; break; }
  }
  match ||= { view: notFound, params: [] };

  progress.start();
  let data = null;
  try {
    data = match.view.load ? await match.view.load(match.params, url) : null;
  } catch (err) {
    if (err.status === 404 || err.status === 400) match = { view: notFound, params: [] };
    else if (err.status === 401) { progress.done(); return; }
    else { progress.done(); toast(err.message); if (current) return; match = { view: notFound, params: [] }; }
  }
  progress.done();
  if (id !== navId) return;

  const inst = match.view.create(match.params, data, url);
  if (viewerOpen()) await closeViewer();
  const swap = () => {
    current?.inst.destroy?.();
    current = { path: url.pathname, base, inst };
    root.replaceChildren(inst.el);
    document.title = inst.title ? `${inst.title} — Mutt` : 'Mutt';
    document.body.classList.toggle('no-chrome', inst.chrome === false);
    document.body.dataset.page = inst.chrome || 'page';
    chrome.update(inst, url);
    scrollTo(0, pop ? history.state?.scroll || 0 : 0);
  };
  // The very first page just plays its own entrance. After a page change
  // the change itself was the entrance, so the page shouldn't play another.
  const moved = !!current && motion !== 'none' && canTransition();
  if (moved) {
    // Only things on both pages morph (a planet into its page and back).
    // Everything else fades with the page, so the old page's files don't
    // hang crisp over the new one while it arrives.
    const coming = new Set([...inst.el.querySelectorAll('[data-vt]')].map((el) => el.dataset.vt));
    let names = new Set();
    await transition(swap, {
      before: () => {
        const pairs = visibleShared().filter(([, n]) => coming.has(n));
        names = new Set(pairs.map(([, n]) => n));
        return pairs;
      },
      after: () => visibleShared().filter(([, n]) => names.has(n)),
    });
  }
  else swap();
  inst.mounted?.({ moved });
  if (id === navId) await syncViewer(blockId);
}

export function startRouter({ rootEl, topbar }) {
  root = rootEl;
  chrome = topbar;
  nav.go = go;
  nav.current = () => new URL(location.href);
  nav.openBlock = (id) => {
    const u = new URL(location.href);
    u.searchParams.set('b', id);
    go(u.pathname + u.search, { viewer: true });
  };
  configureViewer({
    step: (blockId) => {
      const u = new URL(location.href);
      u.searchParams.set('b', blockId);
      history.replaceState(history.state, '', u.pathname + u.search);
    },
    close: () => {
      if (history.state?.viewer) history.back();
      else {
        const u = new URL(location.href);
        u.searchParams.delete('b');
        go(u.pathname + u.search, { replace: true });
      }
    },
    go: (url) => go(url),
  });
  addEventListener('popstate', () => render({ pop: true }));
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || /^\/(f|t|api)\//.test(url.pathname)) return;
    e.preventDefault();
    go(url.pathname + url.search);
  });
  history.scrollRestoration = 'manual';
  return render();
}
