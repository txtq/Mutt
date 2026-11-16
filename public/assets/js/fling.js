// Throw to Sort: something carried and let go while moving fast flies on to
// the world it was heading for (DESIGN.md "Throwing"). drag.js (stars on the
// galaxy) and grid.js (file boxes on a planet page) keep the pointer's last
// moments with `tracker()`; on let-go they ask `velocity()` whether it was a
// flick, `aim()` which world it was thrown at, then `fly()` takes the ghost
// there, or `comeBack()` brings a throw at nothing home.
//
// Aim helps: the world nearest the line of the flick, within a cone either
// side, is the one meant, and the flight steers harder toward it the longer it
// flies, so a throw feels skilled but lands where it was meant to.

import { DUR, reducedMotion } from './util.js';

const FLICK = 900;          // pixels a second at let-go, over the last moments
const WINDOW = 80;          // ...which are this many thousandths of a second
const STOPPED = 60;         // a pointer still for this long before let-go was put down, not thrown
const CONE = (28 * Math.PI) / 180;
const CATCH = 2.2;          // caught within this many of the world's radius: the swing begins
const SWING = 0.75;         // at most this much of a turn round it

// The pointer's last few places, to tell a flick from a put-down.
export function tracker() {
  const pts = [];
  return {
    add(x, y) {
      const t = performance.now();
      pts.push({ x, y, t });
      while (pts.length > 2 && t - pts[0].t > WINDOW * 2) pts.shift();
    },
    // { vx, vy, speed } in pixels a second; speed 0 when the pointer had stopped.
    velocity() {
      const now = performance.now();
      const last = pts[pts.length - 1];
      if (!last || now - last.t > STOPPED) return { vx: 0, vy: 0, speed: 0 };
      const first = pts.find((p) => last.t - p.t <= WINDOW) || last;
      const dt = (last.t - first.t) / 1000;
      if (dt < 0.012) return { vx: 0, vy: 0, speed: 0 };
      const vx = (last.x - first.x) / dt;
      const vy = (last.y - first.y) / dt;
      return { vx, vy, speed: Math.hypot(vx, vy) };
    },
  };
}

export const isFlick = (v) => v.speed >= FLICK;

// The world a flick from `from` with velocity `v` was meant for, or null.
// targets: [{ kind, measure() → { x, y, r } }]; stars are never thrown at.
// Planets ring the void, so a throw at one often crosses it: a world in line
// wins over the void, which takes only the throws no world is in line with.
export function aim(from, v, targets) {
  if (!isFlick(v)) return null;
  const ux = v.vx / v.speed;
  const uy = v.vy / v.speed;
  const far = Math.hypot(innerWidth, innerHeight);
  let best = null;
  let bestScore = Infinity;
  let hole = null;
  for (const t of targets) {
    if (t.kind === 'star') continue;
    const c = t.measure();
    if (c.x < 0 || c.y < 0 || c.x > innerWidth || c.y > innerHeight) continue;   // only what can be seen
    const dx = c.x - from.x;
    const dy = c.y - from.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, (dx * ux + dy * uy) / d)));
    // A big world close by fills more of the view: the cone widens by its size.
    if (angle > CONE + Math.atan(c.r / d)) continue;
    const score = angle / CONE + (0.35 * d) / far;   // nearer wins a tie
    if (t.kind === 'hole') hole = t;
    else if (score < bestScore) { best = t; bestScore = score; }
  }
  return best || hole;
}

const place = (el, p, scale, tilt) => {
  el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${tilt}deg) scale(${scale})`;
};

// Fly `el` (in the effects layer, centred on `from`) at `target`. `ready` is
// the request putting it there: the swing waits for it, so the landing is the
// picture of something already done. `pull` (the void's middle) bends the path
// a little. Resolves true when it has landed, false if `ready` failed (the
// caller brings it home). `caught` stops once it is caught, for the void,
// which swallows things its own way.
export async function fly(el, { from, v, target, ready = Promise.resolve(), pull = null, scale = 1, caught = false }) {
  let settled = false;
  let failed = false;
  ready.then(() => { settled = true; }, () => { settled = true; failed = true; });
  if (reducedMotion()) {
    await ready.catch(() => {});
    return !failed;
  }
  const at = () => target.measure();
  const p = { x: from.x, y: from.y };
  const vel = { x: v.vx, y: v.vy };
  const speed = Math.max(v.speed, FLICK);
  const longest = DUR.scene / 1000;
  let t = 0;
  let last = 0;
  let tilt = 0;
  // In flight: on with its own speed, steered more and more toward the world.
  await new Promise((done) => {
    const step = (now) => {
      const dt = last ? Math.min(now - last, 50) / 1000 : 1 / 60;
      last = now;
      t += dt;
      const c = at();
      const dx = c.x - p.x;
      const dy = c.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < c.r * CATCH || t >= longest) { done(); return; }
      const k = t / longest;
      const steer = 3 + 22 * k * k;
      const want = Math.max(speed * (1 - 0.35 * k), FLICK * 0.8);
      vel.x += ((dx / d) * want - vel.x) * Math.min(1, steer * dt);
      vel.y += ((dy / d) * want - vel.y) * Math.min(1, steer * dt);
      if (pull) {
        const px = pull.x - p.x;
        const py = pull.y - p.y;
        const pd = Math.hypot(px, py) || 1;
        const g = 900 * (1 - k);   // gentle, and gone by the end
        vel.x += (px / pd) * g * dt;
        vel.y += (py / pd) * g * dt;
      }
      p.x += vel.x * dt;
      p.y += vel.y * dt;
      tilt += (Math.max(-24, Math.min(24, vel.x / 60)) - tilt) * Math.min(1, dt * 12);
      place(el, p, scale * (1 - 0.3 * k), tilt);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  if (caught) return true;
  // Caught: one turn or less round the world, closing in, slowing. If the
  // request hasn't answered yet it keeps circling close in until it does.
  const c0 = at();
  const a0 = Math.atan2(p.y - c0.y, p.x - c0.x);
  const r0 = Math.hypot(p.x - c0.x, p.y - c0.y);
  const way = Math.sign((p.x - c0.x) * vel.y - (p.y - c0.y) * vel.x) || 1;
  const turn = SWING * Math.min(1, r0 / (c0.r * CATCH)) * Math.PI * 2;
  const s0 = scale * 0.7;
  let e = 0;
  let circled = 0;
  last = 0;
  await new Promise((done) => {
    const step = (now) => {
      const dt = last ? Math.min(now - last, 50) : 16.7;
      last = now;
      if (failed) { done(); return; }
      e = Math.min(1, e + dt / DUR.arrive);
      // Hold just short of landing, still circling, until the request has answered.
      if (!settled && e > 0.82) { e = 0.82; circled += dt / 900; }
      const ease = 1 - (1 - e) ** 3;
      const c = at();
      const a = a0 + way * (turn * ease + circled * Math.PI * 2);
      const r = r0 * (1 - ease) + c.r * 0.15 * ease;
      place(el, { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }, s0 * (1 - 0.75 * ease), 0);
      el.style.opacity = String(e < 0.7 ? 1 : 1 - (e - 0.7) / 0.3);
      if (e >= 1) { done(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  if (failed) el.style.opacity = '1';
  return !failed;
}

// A throw at nothing (or one that couldn't land): it carries on a little the
// way it was thrown, slows, and comes back to where it was, on a spring.
export async function comeBack(el, { from, v = { vx: 0, vy: 0 }, home, scale = 1 }) {
  if (reducedMotion()) return;
  const p = { x: from.x, y: from.y };
  const vel = { x: v.vx * 0.6, y: v.vy * 0.6 };
  const k = 34;      // spring
  const c = 9.5;     // damping: a little under critical, so it swings round once
  let last = 0;
  let t = 0;
  const longest = DUR.grand / 1000;
  await new Promise((done) => {
    const step = (now) => {
      const dt = last ? Math.min(now - last, 50) / 1000 : 1 / 60;
      last = now;
      t += dt;
      const h = home();
      // A sideways nudge so it curves round rather than bouncing straight back.
      vel.x += (-(p.x - h.x) * k - vel.x * c - (p.y - h.y) * 6) * dt;
      vel.y += (-(p.y - h.y) * k - vel.y * c + (p.x - h.x) * 6) * dt;
      p.x += vel.x * dt;
      p.y += vel.y * dt;
      const left = Math.hypot(p.x - h.x, p.y - h.y);
      place(el, p, scale + (1 - scale) * Math.min(1, t / longest), 0);
      if ((left < 0.6 && Math.hypot(vel.x, vel.y) < 20) || t >= longest) { place(el, h, 1, 0); done(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// The landing: a ring of the drop ring's dust spreads once on the world's face
// (galaxy.css, "landing"). `el` is the planet or moon.
export function landed(el) {
  if (!el) return;
  const ring = el.querySelector?.(':scope > .planet-body') || el;
  ring.classList.remove('is-landing');
  void ring.offsetWidth;
  ring.classList.add('is-landing');
  setTimeout(() => ring.classList.remove('is-landing'), DUR.arrive);
}
