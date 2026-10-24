// Mutt — boot, routes and page-wide behaviour (dropping, pasting, keys).

import { api, session, whenSignedOut } from './api.js';
import { nav } from './nav.js';
import { startIdleBlinks } from './pixel.js';
import { currentView, route, startRouter } from './router.js';
import { createTopbar } from './topbar.js';
import { closeTopLayer } from './ui.js';
import { h, isEditable } from './util.js';
import { viewerOpen } from './viewer.js';
import { bootPrefs, setPrefs } from './theme.js';
import { communityDrawerView, drawerView } from './views/drawer.js';
import { everythingView } from './views/everything.js';
import { homeView } from './views/home.js';
import { loginView } from './views/login.js';
import { searchView } from './views/search.js';
import { settingsView } from './views/settings.js';
import { communityDrawersView, communityView, peopleView } from './views/community.js';
import { userDrawerView, userView } from './views/users.js';

bootPrefs();

route(/^\/login$/, loginView);
route(/^\/$/, homeView);
route(/^\/d\/([\w-]+)$/, drawerView);
route(/^\/all$/, everythingView);
route(/^\/community$/, communityView);
route(/^\/community\/drawers$/, communityDrawersView);
route(/^\/community\/people$/, peopleView);
route(/^\/c\/([\w-]+)$/, communityDrawerView);
route(/^\/users$/, peopleView);
route(/^\/u\/([a-z0-9_.-]+)$/, userView);
route(/^\/u\/([a-z0-9_.-]+)\/d\/([\w-]+)$/, userDrawerView);
route(/^\/settings$/, settingsView);
route(/^\/search$/, searchView);

const topbar = createTopbar();
const view = h('main', { id: 'view' });
const dropLabel = h('span', { class: 'dropzone-label' });
const dropzone = h('div', { class: 'dropzone', 'aria-hidden': 'true' }, dropLabel);
document.getElementById('app').append(topbar.el, view, dropzone);

// ---------------------------------------------------------------- files dropped anywhere

const hasFiles = (e) => e.dataTransfer?.types?.includes('Files');
let dragDepth = 0;
const hideDrop = () => { dragDepth = 0; dropzone.classList.remove('is-on'); };

addEventListener('dragenter', (e) => {
  if (!hasFiles(e) || !session.user) return;
  dragDepth++;
  const target = viewerOpen() ? null : currentView()?.dropTarget?.();
  dropLabel.textContent = target?.label || 'Open a drawer to add files';
  dropzone.classList.toggle('is-hint', !target?.drop);
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
  const target = viewerOpen() ? null : currentView()?.dropTarget?.();
  e.dataTransfer.dropEffect = target?.drop ? 'copy' : 'none';
});
addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  hideDrop();
  const target = viewerOpen() ? null : currentView()?.dropTarget?.();
  const files = [...e.dataTransfer.files];
  if (target?.drop && files.length) target.drop(files);
});
document.addEventListener('mutt:dropped', hideDrop);

// ---------------------------------------------------------------- paste anywhere

addEventListener('paste', (e) => {
  if (!session.user || isEditable(document.activeElement) || viewerOpen() || document.querySelector('.scrim')) return;
  const target = currentView()?.dropTarget?.();
  if (!target?.drop) return;
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) {
    e.preventDefault();
    target.drop(files);
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
    if (closeTopLayer()) { e.preventDefault(); return; }
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
    topbar.search.focus();
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
  await startRouter({ rootEl: view, topbar });
  startIdleBlinks();
}

boot();
