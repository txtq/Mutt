// The page's half of the Mutt browser's pages. The Mutt browser is a Mac app that holds these same
// screens inside it and is also a web browser: a page from the web opens in the window as a sheet
// on the sky, drawn and held by the app, never by this page. What stays here is small:
//
//   - while a web page is on show, your galaxy steps away as it does behind a room (the sky stays),
//     and the middle of the top bar makes way for the page's address, which the app draws there;
//   - the app is told where the top bar's parts rest, so the stars of open pages can sit in it;
//   - a file a web page downloaded arrives in Mutt as a star, through the same door as any upload.
//
// Nothing in this file runs in an ordinary browser: app.js loads it only inside the app.

import { hear, tell } from './app.js';
import { addFiles } from './uploads.js';
import { DUR } from './util.js';

const root = document.documentElement;

// Where the top bar's own things end and begin again: the app's bar lies between them.
function rests() {
  const bar = document.querySelector('.sb');
  if (!bar) return;
  const left = bar.querySelector('.sb-left > :last-child')?.getBoundingClientRect();
  const right = bar.querySelector('.sb-right > :not([hidden])')?.getBoundingClientRect();
  const who = bar.querySelector('.sb-who')?.getBoundingClientRect();
  const b = bar.getBoundingClientRect();
  tell('bar.rests', {
    left: left ? left.right : 0, right: right && right.width ? right.left : b.right, height: b.height,
    who: who && who.width ? [who.left, who.width] : null, shows: getComputedStyle(bar).display !== 'none',
  });
}

export function startPages() {
  // A web page is on show (or no longer): the galaxy steps away behind it and comes back.
  hear('page.on', ({ on }) => {
    const was = root.classList.contains('app-page');
    root.classList.toggle('app-page', !!on);
    if (was && !on) {   // coming back: the galaxy arrives as it does from a room
      root.classList.add('app-page-gone');
      setTimeout(() => root.classList.remove('app-page-gone'), DUR.arrive);
    }
    rests();
  });
  // A file a web page downloaded, handed over by the app: it becomes a star.
  hear('page.file', async ({ id, name, type }) => {
    try {
      const got = await fetch(`/app-file/${encodeURIComponent(id)}`);
      if (!got.ok) return false;
      const blob = await got.blob();
      addFiles([new File([blob], name || 'Download', { type: type || blob.type || 'application/octet-stream' })], { galaxy: true, drawerId: null });
      return true;
    } catch { return false; }
  });
  hear('bar.where', () => { rests(); return true; });
  const again = () => requestAnimationFrame(rests);
  addEventListener('resize', again);
  new MutationObserver(again).observe(document.body, { childList: true, subtree: false });
  const bar = () => {
    const el = document.querySelector('.sb');
    if (!el) { setTimeout(bar, 200); return; }
    new ResizeObserver(again).observe(el);
    new MutationObserver(again).observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
    rests();
  };
  bar();
}
