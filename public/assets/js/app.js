// The Mutt browser's half of the bridge. The Mutt browser is a Mac app that holds these same
// screens inside it (its code is not in this repository). There the page lives at mutt://app/
// and the app has put a port in; this file is how the two talk.
//
// It wakes only inside the app. In an ordinary browser `inApp` is false: nothing here runs,
// nothing is fetched and nothing on the page changes.

const port = globalThis.webkit?.messageHandlers?.mutt;
export const inApp = location.protocol === 'mutt:' && !!port;

/** What the app has told the page so far: how far the window's buttons reach in from the left, and its open looks. */
export const app = { lead: 0, choices: {}, check: null };

const hearers = new Map();

/** Ask the app for `name`; its answer comes back (null outside the app, or if the app has no such thing). */
export function tell(name, data = null) {
  return inApp ? port.postMessage({ name, data }).catch(() => null) : Promise.resolve(null);
}

/** Do `fn(data)` whenever the app says `name`. What `fn` gives back is the page's answer. */
export function hear(name, fn) {
  if (!hearers.has(name)) hearers.set(name, []);
  hearers.get(name).push(fn);
}

export async function startApp() {
  if (!inApp) return;
  const root = document.documentElement;
  root.classList.add('in-app');
  window.__muttApp = {
    heard(name, data) {
      let answer = null;
      for (const fn of hearers.get(name) || []) answer = fn(data) ?? answer;
      return answer;
    },
  };
  const lead = (px) => { app.lead = px || 0; root.style.setProperty('--app-lead', `${app.lead}px`); };
  hear('lead', lead);
  hear('choices', (c) => {
    const was = app.choices['sky-by'];
    app.choices = c || {};
    if (was && was !== app.choices['sky-by']) location.reload();
  });

  // The window has no title bar: the top strip of the page is its handle. Pressing an empty part
  // of it carries the window; pressing twice makes it full size, as a title bar would.
  addEventListener('mousedown', (e) => {
    const strip = parseFloat(getComputedStyle(root).getPropertyValue('--bar')) || 0;
    if (e.button !== 0 || e.clientY > strip) return;
    if (e.target.closest?.('a, button, input, textarea, select, [role="button"], [contenteditable=""], [contenteditable="true"]')) return;
    tell(e.detail === 2 ? 'window.zoom' : 'window.carry');
  });

  wholeBodies();

  const hello = await tell('hello');
  if (!hello) return;
  lead(hello.lead);
  app.choices = hello.choices || {};
  app.check = hello.check || null;
  // A proof from the app's first build chat: the app draws the sky itself, under this page.
  if (app.choices['sky-by'] === 'app') import('./appsky.js').then((m) => m.startAppSky());
}

// Inside the app a file sent to the server never arrives if it is handed over as a Blob or a File:
// the app's own answering of mutt://app/ is given strings and plain bytes, but not those (a gap in
// Safari's engine, measured 2026-11-23: the server got no body at all). So here a Blob is read into
// plain bytes first and sent as those. Nothing else about the call changes.
function wholeBodies() {
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    if (!(body instanceof Blob)) return send.call(this, body);
    let gone = false;
    this.addEventListener('abort', () => { gone = true; });
    body.arrayBuffer().then((bytes) => { if (!gone) send.call(this, bytes); }, () => send.call(this, body));
  };
  const plain = window.fetch;
  window.fetch = async function (what, init) {
    if (init && init.body instanceof Blob) {
      const headers = new Headers(init.headers || {});
      if (!headers.has('Content-Type') && init.body.type) headers.set('Content-Type', init.body.type);
      init = { ...init, headers, body: await init.body.arrayBuffer() };
    }
    return plain.call(this, what, init);
  };
}
