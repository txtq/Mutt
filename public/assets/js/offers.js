// The quiet offer a planet makes when it starts being used a certain way
// ("This planet looks like a list"). Every mode's offer is this one box: the
// mode says what it noticed and what its button is called; the box and its
// motion are shared.
//
// Nothing below it ever jumps. When the offer arrives, what's under it glides
// down to make room; when it's waved away, it glides back up. Only transforms
// and fades move, so the page isn't laid out again on every frame.

import { DUR, EASE, EASE_LEAVE, h, reducedMotion } from './util.js';
import { drawing } from './icons.js';

const topOf = (el) => el.getBoundingClientRect().top;

// Slide each element from where it was (`tops`) to where it is now. Added on
// top of whatever else is moving it, so it can run during a page's own fades.
function settle(els, tops, duration) {
  els.forEach((el, i) => {
    if (!el.isConnected) return;
    const dy = tops[i] - topOf(el);
    if (Math.abs(dy) < 0.5) return;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration, easing: EASE, composite: 'add' });
  });
}

// kind: an extra class; drawing: the name of its small drawing in icons.js.
export function modeOffer({ kind = '', drawing: draws = 'list', title, signs = [], note = null, accept, busy, decline = 'Not now', onAccept, onDecline }) {
  const yes = h('button', { type: 'button', class: 'btn btn-main' }, accept);
  const no = h('button', { type: 'button', class: 'btn btn-quiet' }, decline);
  const el = h('div', { class: `lm-offer${kind ? ` ${kind}` : ''}`, role: 'region', 'aria-label': title },
    drawing(draws),
    h('div', { class: 'lm-offer-text' },
      h('p', { class: 'lm-offer-title' }, title),
      h('ul', { class: 'lm-offer-signs' }, signs.map((s) => h('li', null, s))),
      note ? h('p', { class: 'lm-offer-note' }, note) : null),
    h('div', { class: 'lm-offer-btns' }, no, yes));

  // Put it at the top of `parent`, easing what's already there down.
  el.show = (parent) => {
    const below = [...parent.children];
    const tops = below.map(topOf);
    parent.prepend(el);
    if (reducedMotion()) return;
    settle(below, tops, 560);
    el.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { duration: DUR.move, easing: EASE });
  };

  // Waved away: it lifts off in place while what's below closes the gap.
  el.leave = async () => {
    if (!el.isConnected) return;
    el.style.pointerEvents = 'none';
    if (!reducedMotion()) {
      const below = [];
      for (let n = el.nextElementSibling; n; n = n.nextElementSibling) below.push(n);
      const tops = below.map(topOf);
      const r = el.getBoundingClientRect();
      Object.assign(el.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0' });
      settle(below, tops, 460);
      await el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px) scale(0.99)' }],
        { duration: DUR.change, easing: EASE_LEAVE, fill: 'forwards' }).finished.catch(() => {});
    }
    el.remove();
  };

  // Taken up: it fades where it is, for the page to take it out as it changes.
  el.fade = async () => {
    el.style.pointerEvents = 'none';
    if (reducedMotion() || !el.isConnected) return;
    await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.change, easing: EASE_LEAVE, fill: 'forwards' }).finished.catch(() => {});
  };

  yes.addEventListener('click', async () => {
    yes.disabled = no.disabled = true;
    yes.textContent = busy;
    const ok = await onAccept();
    if (ok === false) { yes.disabled = no.disabled = false; yes.textContent = accept; return; }
    // The page takes the offer out as it changes; this is for one that didn't.
    el.leave();
  });
  no.addEventListener('click', () => { el.leave(); onDecline(); });
  return el;
}
