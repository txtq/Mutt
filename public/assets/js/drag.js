// Picking a star up and letting it fall onto a planet (or back into the
// black hole). Pointer-based so fingers work too: on touch, hold for a
// moment to pick it up, otherwise the page just scrolls.

import { float } from './fx.js';
import { DUR, EASE_SPRING, reducedMotion } from './util.js';

const HOLD_MS = 260;
const EDGE = 72;

// targets(): [{ el, measure() → { x, y, r }, onHover? }]; onDrop gets the
// target, the ghost element and where it is. Returns a function that detaches.
export function draggable(el, { ghost, targets, onDrop, onStart, onEnd }) {
  let blockClick = false;

  const down = (e) => {
    if (e.button !== 0 || e.isPrimary === false) return;
    const pid = e.pointerId;
    const touch = e.pointerType !== 'mouse';
    const start = { x: e.clientX, y: e.clientY };
    let pos = { ...start };
    let dragging = false;
    let armed = !touch;
    let g = null;
    let shown = { ...start };
    let size = 1;
    let hovered = null;
    let list = [];
    let frame = 0;
    let last = 0;
    const hold = touch ? setTimeout(() => {
      armed = true;
      navigator.vibrate?.(8);
      begin();
    }, HOLD_MS) : 0;

    function begin() {
      if (dragging) return;
      dragging = true;
      blockClick = true;
      onStart?.();
      list = targets();
      g = float(ghost(), pos);
      g.classList.add('drag-ghost');
      el.classList.add('is-lifted');
      document.body.classList.add('is-carrying');
      frame = requestAnimationFrame(tick);
    }

    function nearest() {
      let best = null;
      let bestD = Infinity;
      let moon = null;
      let moonD = Infinity;
      for (const t of list) {
        t.center = t.measure(); // planets bob and the page scrolls, so look again
        const d = Math.hypot(pos.x - t.center.x, pos.y - t.center.y);
        // A moon is small: it has a tighter reach, but wins over its planet.
        if (t.kind === 'moon') {
          if (d < t.center.r * 1.3 + 10 && d < moonD) { moon = t; moonD = d; }
          continue;
        }
        const reach = t.center.r * 1.3 + 22;
        if (d < reach && d < bestD) { best = t; bestD = d; }
      }
      return moon || best;
    }

    function tick(now) {
      frame = requestAnimationFrame(tick);
      // Timed, not counted in frames, so it feels the same on a 120 Hz screen.
      const dt = last ? Math.min(now - last, 50) : 16.7;
      last = now;
      // Near an edge, carry on scrolling so far-off planets come into reach.
      if (pos.y < EDGE) scrollBy(0, -Math.ceil(((EDGE - pos.y) / 5) * (dt / 16.7)));
      else if (pos.y > innerHeight - EDGE) scrollBy(0, Math.ceil(((pos.y - innerHeight + EDGE) / 5) * (dt / 16.7)));
      const next = nearest();
      if (next !== hovered) {
        hovered?.el.classList.remove('is-target');
        hovered?.onHover?.(false);
        hovered = next;
        hovered?.el.classList.add('is-target');
        hovered?.onHover?.(true);
      }
      // Planets have a pull: the star drifts toward the one you're over.
      const aim = hovered
        ? { x: pos.x + (hovered.center.x - pos.x) * 0.38, y: pos.y + (hovered.center.y - pos.y) * 0.38 }
        : pos;
      const still = reducedMotion();
      const k = still ? 1 : 1 - Math.exp(-dt / 43);
      const vx = (aim.x - shown.x) * k;
      shown = { x: shown.x + vx, y: shown.y + (aim.y - shown.y) * k };
      // It leans with its speed, and settles into size (lifted, or tucked
      // in over a planet) rather than jumping.
      const tilt = Math.max(-24, Math.min(24, (vx / dt) * 27));
      size += ((hovered ? 0.8 : 1.15) - size) * (still ? 1 : 1 - Math.exp(-dt / 70));
      g.style.transform = `translate(${shown.x}px, ${shown.y}px) translate(-50%, -50%) rotate(${tilt}deg) scale(${size})`;
    }

    const move = (ev) => {
      if (ev.pointerId !== pid) return;
      pos = { x: ev.clientX, y: ev.clientY };
      if (!dragging) {
        const far = Math.hypot(pos.x - start.x, pos.y - start.y) > 6;
        if (far && !armed) { cleanup(); return; } // a scroll, not a pick-up
        if (far && armed) begin();
      }
    };
    const stopTouchScroll = (ev) => { if (dragging) ev.preventDefault(); };

    const up = async (ev) => {
      if (ev.pointerId !== pid) return;
      const wasDragging = dragging;
      const target = hovered;
      const ghostEl = g;
      const at = shown;
      cleanup();
      if (!wasDragging) return; // a plain click; the click handler opens it
      if (target && ev.type === 'pointerup') {
        await onDrop(target, ghostEl, at);
      } else {
        // Nowhere to land: float back home.
        const r = el.getBoundingClientRect();
        const home = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        await ghostEl.animate([
          { transform: ghostEl.style.transform },
          { transform: `translate(${home.x}px, ${home.y}px) translate(-50%, -50%) scale(1)` },
        ], { duration: reducedMotion() ? 1 : DUR.arrive, easing: EASE_SPRING, fill: 'forwards' }).finished.catch(() => {});
        ghostEl.remove();
      }
      el.classList.remove('is-lifted');
      onEnd?.();
    };

    function cleanup() {
      clearTimeout(hold);
      cancelAnimationFrame(frame);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      removeEventListener('touchmove', stopTouchScroll);
      hovered?.el.classList.remove('is-target');
      hovered?.onHover?.(false);
      document.body.classList.remove('is-carrying');
      setTimeout(() => { blockClick = false; }, 0);
    }

    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    addEventListener('touchmove', stopTouchScroll, { passive: false });
  };

  const click = (e) => {
    if (blockClick) { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  const menu = (e) => { if (document.body.classList.contains('is-carrying')) e.preventDefault(); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('click', click, true);
  el.addEventListener('contextmenu', menu);
  el.addEventListener('dragstart', (e) => e.preventDefault());
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('click', click, true);
    el.removeEventListener('contextmenu', menu);
  };
}

// Moving something itself (a planet round your galaxy) rather than carrying a
// copy of it. Same feel as picking up a star: a mouse moves it once you've
// dragged a little, a finger after holding for a moment. `onMove` gets the
// pointer and the milliseconds since the last frame, on every frame;
// `limits()` says how far the page may scroll.
export function movable(el, { enabled = () => true, from = () => true, onStart, onMove, onEnd, limits = () => ({ top: 0, bottom: Infinity }) }) {
  let blockClick = false;

  const down = (e) => {
    if (e.button !== 0 || e.isPrimary === false || !enabled() || !from(e)) return;
    const pid = e.pointerId;
    const touch = e.pointerType !== 'mouse';
    const start = { x: e.clientX, y: e.clientY };
    let pos = { ...start };
    let dragging = false;
    let armed = !touch;
    let frame = 0;
    let last = 0;
    const hold = touch ? setTimeout(() => {
      armed = true;
      navigator.vibrate?.(8);
      begin();
    }, HOLD_MS) : 0;

    function begin() {
      if (dragging) return;
      dragging = true;
      blockClick = true;
      document.body.classList.add('is-carrying');
      onStart?.(start);
      frame = requestAnimationFrame(tick);
    }

    function tick(now) {
      frame = requestAnimationFrame(tick);
      const dt = last ? Math.min(now - last, 50) : 16.7;
      last = now;
      const { top, bottom } = limits();
      if (pos.y < EDGE && scrollY > top) scrollBy(0, -Math.min(scrollY - top, Math.ceil(((EDGE - pos.y) / 5) * (dt / 16.7))));
      else if (pos.y > innerHeight - EDGE && scrollY < bottom) scrollBy(0, Math.min(bottom - scrollY, Math.ceil(((pos.y - innerHeight + EDGE) / 5) * (dt / 16.7))));
      onMove?.(pos, dt);
    }

    const move = (ev) => {
      if (ev.pointerId !== pid) return;
      pos = { x: ev.clientX, y: ev.clientY };
      if (!dragging) {
        const far = Math.hypot(pos.x - start.x, pos.y - start.y) > 6;
        if (far && !armed) { cleanup(); return; } // a scroll, not a pick-up
        if (far && armed) begin();
      }
    };
    const stopTouchScroll = (ev) => { if (dragging) ev.preventDefault(); };

    const up = (ev) => {
      if (ev.pointerId !== pid) return;
      const wasDragging = dragging;
      cleanup();
      if (wasDragging) onEnd?.(pos, ev.type === 'pointercancel');
    };

    function cleanup() {
      clearTimeout(hold);
      cancelAnimationFrame(frame);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      removeEventListener('touchmove', stopTouchScroll);
      document.body.classList.remove('is-carrying');
      setTimeout(() => { blockClick = false; }, 0);
    }

    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    addEventListener('touchmove', stopTouchScroll, { passive: false });
  };

  const click = (e) => {
    if (blockClick) { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  const menu = (e) => { if (document.body.classList.contains('is-carrying')) e.preventDefault(); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('click', click, true);
  el.addEventListener('contextmenu', menu);
  el.addEventListener('dragstart', (e) => e.preventDefault());
}
