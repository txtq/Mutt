// Mutt — boot, routes and page-wide behaviour (dropping, pasting, keys).

import { api, session, whenSignedOut } from './api.js';
import { nav } from './nav.js';
import { currentView, redirect, route, startRouter } from './router.js';
import { createSky } from './sky.js';
import { closeSheets, createStatusbar } from './statusbar.js';
import { closeTopLayer } from './ui.js';
import { startMusic } from './music.js';
import { h, isEditable, styles } from './util.js';
import { viewerOpen } from './viewer.js';
import { bootPrefs, setPrefs } from './theme.js';
import { galaxyView, universeView } from './views/galaxy.js';
import { loginView } from './views/login.js';
import { planetView } from './views/planet.js';
import { catchUp } from './see.js';
import { watchSpelling } from './spellfield.js';
import { phoneNote } from './phonenote.js';
import { tooltips } from './tooltip.js';

bootPrefs();
startMusic();
watchSpelling();

route(/^\/login$/, loginView);
route(/^\/$/, galaxyView);
route(/^\/g\/([a-z0-9_.-]+)$/, galaxyView);
route(/^\/p\/([\w-]+)$/, planetView);
route(/^\/universe$/, universeView);
// The sample page (DESIGN.md section 4): every shared part in every state. Linked
// from nowhere; its code and layout are fetched only when it's opened.
route(/^\/parts$/, {
  load: () => Promise.all([import('./views/parts.js'), styles('parts.css')]).then(([m]) => m),
  create: (params, mod) => mod.partsView(),
});
// Addresses from before the galaxy still lead somewhere sensible.
redirect(/^\/(?:d|c)\/([\w-]+)$/, ([id]) => `/p/${id}`);
redirect(/^\/u\/([a-z0-9_.-]+)\/d\/([\w-]+)$/, ([, id]) => `/p/${id}`);
redirect(/^\/u\/([a-z0-9_.-]+)$/, ([name]) => `/g/${name}`);
redirect(/^\/(?:all|settings|search|users)$/, () => '/');
redirect(/^\/community(?:\/.*)?$/, () => '/universe');

const sky = createSky();
const bar = createStatusbar();
const view = h('main', { id: 'view' });
// The drop hint (DESIGN.md): one label where toasts sit; the thing that will take the files lights up.
const dropWord = h('span', { class: 'btn btn-main drop-word', 'aria-hidden': 'true' });
document.getElementById('app').append(sky.el, bar.el, view, dropWord);
tooltips();

// ---------------------------------------------------------------- files dragged in from your computer

const hasFiles = (e) => e.dataTransfer?.types?.includes('Files');
const target = () => (viewerOpen() ? null : currentView()?.dropTarget?.());
let dragDepth = 0;
let lit = null;
const light = (t) => {
  if (lit === (t?.el || null)) return;
  lit?.classList.remove('is-drop');
  lit = t?.el || null;
  lit?.classList.add('is-drop');
};
const hideDrop = () => {
  dragDepth = 0;
  dropWord.classList.remove('is-on');
  light(null);
  const t = target();
  t?.lit?.(false);
  t?.leave?.();
};

addEventListener('dragenter', (e) => {
  if (!hasFiles(e) || !session.user) return;
  dragDepth++;
  const t = target();
  dropWord.textContent = t?.label || 'Open a planet to add files';
  dropWord.classList.toggle('is-hint', !t?.drop);
  dropWord.classList.add('is-on');
  light(t?.drop ? t : null);
  t?.lit?.(true);
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
  // A page can say more exactly where they'll land as the pointer moves (the galaxy: a planet, or the void).
  const say = t?.over?.(e);
  if (typeof say === 'string') dropWord.textContent = say;
});
addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  const t = target();
  const files = [...e.dataTransfer.files];
  dragDepth = 0;
  dropWord.classList.remove('is-on');
  light(null);
  t?.lit?.(false);
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

// ---------------------------------------------------------------- touch

// Safari on a phone only shows a button being pressed if the page listens
// for touches at all.
addEventListener('touchstart', () => {}, { passive: true });

// How much of the screen a phone's keyboard leaves showing, so sheets and
// dialogs can stay above it (--seen in the stylesheets). Pinching in isn't
// the keyboard, so it doesn't count.
if (window.visualViewport) {
  const seen = () => document.documentElement.style.setProperty('--seen', `${Math.round(visualViewport.height * visualViewport.scale)}px`);
  visualViewport.addEventListener('resize', seen);
  seen();
}

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
  // Once the page has settled, read pictures uploaded before the picture reader existed.
  if (session.user) setTimeout(() => catchUp(), 6000);
  if (session.user) phoneNote();
}

boot();
