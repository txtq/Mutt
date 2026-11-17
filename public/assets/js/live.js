// Live: the server tells this page what changed elsewhere (someone else, or you
// on another device) and the page looks again, without a reload (mutt/live.py).
// One stream per page; a notice says only what to look at again, never what it
// holds, so the page asks for it as usual, with its own rights.
//
// Every notice goes out on the bus as `live` ({ t: 'planet' | 'galaxy' | 'universe'
// | 'beams' | 'comments' | 'keep' | 'comets' | 'again' }). `again`: the stream was
// down (the phone slept, Mutt restarted), so whatever is showing looks again.
// The router hands notices to the page showing (`inst.live`) and says what it
// watches (`inst.watch`: { planet } or { galaxy }).

import { TAB, api, session } from './api.js';
import { BEAT, bus } from './util.js';

let source = null;
let watching = null;     // what this page shows, as last told
let opened = false;      // the stream has been open before (a reopen means notices were missed)
let retry = 0;

function open() {
  if (source || !session.user || !window.EventSource) return;
  source = new EventSource(`/api/live?tab=${encodeURIComponent(TAB)}`);
  source.onopen = () => {
    // Mutt may have restarted and forgotten this page: say again what it shows.
    tell();
    if (opened) bus.emit('live', { t: 'again' });
    opened = true;
  };
  source.onmessage = (e) => {
    let msg = null;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg?.t) bus.emit('live', msg);
  };
  // The browser tries again by itself after a dropped stream, but not after an answer
  // that wasn't a stream (a deploy's gateway page): then try again in a while.
  source.onerror = () => {
    if (source?.readyState !== EventSource.CLOSED) return;
    source = null;
    clearTimeout(retry);
    retry = setTimeout(open, BEAT.rest);
  };
}

function close() {
  clearTimeout(retry);
  source?.close();
  source = null;
  opened = false;
}

function tell() {
  if (!source || !watching) return;
  api.post('/api/live/watch', { tab: TAB, ...watching }).catch(() => {});
}

// Called by the router whenever a page is shown: what it watches, or null when signed out.
export function watch(what) {
  if (!session.user) { watching = null; close(); return; }
  const next = what || {};
  const same = watching && watching.planet === next.planet && watching.galaxy === next.galaxy;
  watching = next;
  if (!source) open();
  else if (!same) tell();
}

// A page in the background lets its stream go after a while (a browser holds only a
// few connections to one site, and a phone's battery is spared). Back in front, it
// opens again and the page looks again for whatever it missed.
let resting = 0;
document.addEventListener('visibilitychange', () => {
  clearTimeout(resting);
  if (document.hidden) {
    resting = setTimeout(() => { clearTimeout(retry); source?.close(); source = null; }, BEAT.rest);
    return;
  }
  if (session.user && watching && !source) open();
});
