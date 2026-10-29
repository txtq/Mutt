// Mutt — boot, routes and page-wide behaviour (dropping, pasting, keys).

import { api, session, whenSignedOut } from './api.js';
import { nav } from './nav.js';
import { currentView, redirect, route, startRouter } from './router.js';
import { createSky } from './sky.js';
import { closeSheets, createStatusbar } from './statusbar.js';
import { closeTopLayer } from './ui.js';
import { h, isEditable } from './util.js';
import { viewerOpen } from './viewer.js';
import { bootPrefs, setPrefs } from './theme.js';
import { galaxyView, universeView } from './views/galaxy.js';
import { loginView } from './views/login.js';
import { planetView } from './views/planet.js';

bootPrefs();

route(/^\/login$/, loginView);
route(/^\/$/, galaxyView);
route(/^\/g\/([a-z0-9_.-]+)$/, galaxyView);
route(/^\/p\/([\w-]+)$/, planetView);
route(/^\/universe$/, universeView);
// Addresses from before the galaxy still lead somewhere sensible.
redirect(/^\/(?:d|c)\/([\w-]+)$/, ([id]) => `/p/${id}`);
redirect(/^\/u\/([a-z0-9_.-]+)\/d\/([\w-]+)$/, ([, id]) => `/p/${id}`);
redirect(/^\/u\/([a-z0-9_.-]+)$/, ([name]) => `/g/${name}`);
redirect(/^\/(?:all|settings|search|users)$/, () => '/');
redirect(/^\/community(?:\/.*)?$/, () => '/universe');

const sky = createSky();
const bar = createStatusbar();
const view = h('main', { id: 'view' });
const dropLabel = h('span', { class: 'dropzone-label' });
const dropzone = h('div', { class: 'dropzone', 'aria-hidden': 'true' }, dropLabel);
document.getElementById('app').append(sky.el, bar.el, view, dropzone);

// ---------------------------------------------------------------- files dragged in from your computer

const hasFiles = (e) => e.dataTransfer?.types?.includes('Files');
const target = () => (viewerOpen() ? null : currentView()?.dropTarget?.());
let dragDepth = 0;
const hideDrop = () => {
  dragDepth = 0;
  dropzone.classList.remove('is-on');
  target()?.leave?.();
};

addEventListener('dragenter', (e) => {
  if (!hasFiles(e) || !session.user) return;
  dragDepth++;
  const t = target();
  // The galaxy shows where things will land itself; other pages get the big frame.
  if (t?.overlay === false) return;
  dropLabel.textContent = t?.label || 'Open a planet to add files';
  dropzone.classList.toggle('is-hint', !t?.drop);
  dropzone.classList.add('is-on');
});
addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) hideDrop();
});
addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  const t = target();
  e.dataTransfer.dropEffect = t?.drop ? 'copy' : 'none';
  t?.over?.(e);
});
addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  const t = target();
  const files = [...e.dataTransfer.files];
  dragDepth = 0;
  dropzone.classList.remove('is-on');
  if (t?.drop && files.length) t.drop(files, e);
  else t?.leave?.();
});
document.addEventListener('mutt:dropped', hideDrop);

// ---------------------------------------------------------------- paste anywhere

addEventListener('paste', (e) => {
  if (!session.user || isEditable(document.activeElement) || viewerOpen() || document.querySelector('.scrim, .sheet.is-open')) return;
  const t = currentView()?.dropTarget?.();
  if (!t?.drop) return;
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) {
    e.preventDefault();
    t.drop(files);
    return;
  }
  const text = e.clipboardData?.getData('text/plain');
  if (text && currentView()?.pasteText) {
    e.preventDefault();
    currentView().pasteText(text);
  }
});

// ---------------------------------------------------------------- keys

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (closeTopLayer() || closeSheets()) { e.preventDefault(); return; }
    if (isEditable(document.activeElement)) { document.activeElement.blur(); return; }
    if (viewerOpen()) {
      e.preventDefault();
      const u = new URL(location.href);
      if (history.state?.viewer) history.back();
      else { u.searchParams.delete('b'); nav.go(u.pathname + u.search, { replace: true }); }
    }
    return;
  }
  if (e.key === '/' && session.user && !isEditable(document.activeElement) && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    bar.search.focus();
  }
});

// ---------------------------------------------------------------- boot

whenSignedOut(() => {
  if (!session.user) return;
  session.user = null;
  nav.go(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
});

async function boot() {
  try {
    const me = await api.get('/api/me');
    session.user = me.user;
    session.stats = me.stats;
    setPrefs(me.prefs);
  } catch (err) {
    session.user = null;
    if (err.data && 'signups' in err.data) session.signups = err.data.signups;
  }
  await startRouter({ rootEl: view, topbar: bar });
}

boot();
