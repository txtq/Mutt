// Swiping up out of a planet (DESIGN.md "Swiping out of a planet"). On a touch
// screen, once a planet's page is at its end (or nearly: the swipe scrolls the rest), a long
// swipe up lifts the page back toward its planet as the finger goes; let go far
// enough up (or flicked well past halfway) and the pull away takes you to its
// galaxy, otherwise it settles back. Never while a scroll is under way, a file
// is being carried, or anything is open on top.

import { isFlick, tracker } from './fling.js';
import { DUR, EASE, reducedMotion } from './util.js';

const OPEN = '.scrim:not(.is-leaving), .pop:not(.is-leaving), .room, .sheet.is-open';
// What takes a finger itself: words, players, the board, a list's grip, the PDF pen.
const OWN = 'input, textarea, select, video, audio, iframe, [contenteditable], .bd, .lm-grip, .pm-catch';
const FOLLOW = 0.15;   // how far the page rises for each point the finger does
const SHRINK = 0.14;   // how much smaller it is when far enough

// How far is far enough: a third of a phone's screen, give or take.
const reach = () => Math.min(Math.max(innerHeight * 0.3, 180), 280);
// How much page is left below the screen, and how much may be left for a swipe to start: a page
// only a little taller than the screen (a planet of three files) is scrolled to its end by the
// swipe itself, then lifts.
const left = () => Math.max(document.documentElement.scrollHeight - Math.ceil(scrollY + innerHeight), 0);
const slack = () => Math.min(innerHeight * 0.15, 120);

// Whether anything between the finger and the page scrolls up and down by itself.
function scrolls(el, page) {
  for (let n = el; n && n !== page; n = n.parentElement) {
    if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY)) return true;
  }
  return false;
}

export function swipeOutOfPlanets(view) {
  let s = null;   // the swipe under way: where it began, the page, whether it is following

  const free = (page) => {
    const html = document.documentElement;
    return !html.classList.contains('in-room') && !html.classList.contains('is-writing') && !html.classList.contains('is-reading')
      && !html.dataset.vt && !document.body.classList.contains('is-carrying') && !document.querySelector(OPEN)
      && (window.visualViewport?.scale || 1) <= 1.05 && page.isConnected;
  };

  const lift = (dy) => {
    const r = reach();
    const up = dy <= r ? dy * FOLLOW : r * FOLLOW + (dy - r) * FOLLOW * 0.3;   // past far enough it stiffens
    const k = Math.min(dy / r, 1.25);
    s.page.style.transform = `translate3d(0, ${(-up).toFixed(1)}px, 0) scale(${(1 - SHRINK * k).toFixed(4)})`;
  };

  const settle = (page) => {
    const from = page.style.transform;
    const done = () => { page.style.transform = ''; page.style.transformOrigin = ''; page.style.willChange = ''; };
    if (!from || reducedMotion()) { done(); return; }
    page.style.transform = '';
    page.animate([{ transform: from }, { transform: 'none' }], { duration: DUR.move, easing: EASE })
      .finished.then(done, done);
  };

  const drop = () => {
    if (s?.following) settle(s.page);
    s = null;
  };

  document.addEventListener('touchstart', (e) => {
    if (s) drop();
    if (e.touches.length !== 1) return;
    const inst = view();
    const page = inst?.el;
    if (inst?.chrome !== 'planet' || !inst.goHome || !page || !page.contains(e.target)) return;
    const room = left();
    if (!free(page) || room > slack() || e.target.closest(OWN) || scrolls(e.target, page)) return;
    const t = e.touches[0];
    s = { x: t.clientX, y: t.clientY, top: scrollY, room, page, inst, first: true, following: false, track: tracker() };
    s.track.add(t.clientX, t.clientY);
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!s) return;
    if (e.touches.length !== 1 || !free(s.page)) { drop(); return; }
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = s.y - t.clientY;   // up is more
    s.track.add(t.clientX, t.clientY);
    // The first move decides: only a move up is ours. Anything else is the page's to scroll,
    // and a scroll once begun can't be taken back.
    if (s.first) {
      s.first = false;
      if (dy <= 0 || Math.abs(dx) > dy) { s = null; return; }
    }
    e.preventDefault();
    if (Math.abs(dx) > Math.max(dy, 0) + 24) { drop(); return; }   // turned sideways: let it be
    // What's left of the page scrolls first, with the finger; then the page lifts.
    if (s.room) scrollTo(0, s.top + Math.min(Math.max(dy, 0), s.room));
    const up = dy - s.room;
    if (!s.following) {
      if (up < 12) return;
      s.following = true;
      // It shrinks toward its planet, or toward the top of the screen when the planet is above it.
      const world = s.page.querySelector('.planet-big');
      const box = s.page.getBoundingClientRect();
      const r = world?.getBoundingClientRect();
      const cx = r ? r.left + r.width / 2 : innerWidth / 2;
      const cy = Math.max(r ? r.top + r.height / 2 : 0, 0);
      s.page.style.transformOrigin = `${(cx - box.left).toFixed(1)}px ${(cy - box.top).toFixed(1)}px`;
      s.page.style.willChange = 'transform';
    }
    if (!reducedMotion()) lift(Math.max(up, 0));
  }, { passive: false });

  document.addEventListener('touchcancel', drop, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!s) return;
    const { page, inst, following } = s;
    const dy = s.y - e.changedTouches[0].clientY - s.room;
    const v = s.track.velocity();
    s = null;
    if (!following) return;
    const far = dy >= reach() || (dy >= reach() * 0.5 && v.vy < 0 && isFlick(v));
    if (!far || !free(page)) { settle(page); return; }
    // The pull away carries on from where the finger left the page; if the galaxy can't
    // be reached (no connection), the page comes back.
    Promise.resolve(inst.goHome()).finally(() => { if (page.isConnected) settle(page); });
  }, { passive: true });
}
