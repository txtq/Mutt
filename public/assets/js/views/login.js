// Sign in / make an account, inside the void. It fills the screen; dust
// spirals into it and the stars round it are stretched toward it. It opens,
// and the logo, your name and your code sit in dark ink on its light, never
// on its speckled cage. There's one thing to do: type a name. A name Mutt
// knows is asked for its code; a new one is free to take by picking a code.
// The void answers every key, and the right code lets its light take you.

import { api, session } from '../api.js';
import { shockwave } from '../fx.js';
import { glitch, logo } from '../logo.js';
import { nav } from '../nav.js';
import { theSky } from '../sky.js';
import { setPrefs } from '../theme.js';
import { pinField } from '../ui.js';
import { h, reducedMotion, touchScreen, wait } from '../util.js';
import { voidArt } from '../voidart.js';

const NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,22}[a-z0-9]$/;
const BEEN = 'mutt.been-here';
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const TAU = Math.PI * 2;
const CAGE_OPEN = 1.7; // how far the cage stands off the open light
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

// The last name that signed in on this device, so coming back is only a code.
const lastName = () => {
  try {
    const name = localStorage.getItem(BEEN) || '';
    return NAME_RE.test(name) ? name : '';
  } catch { return ''; }
};
const remember = (name) => { try { localStorage.setItem(BEEN, name); } catch { /* private mode */ } };

// What surrounds the void: fine dust circling it and slowly spiralling in
// (the print's stippling come loose), and further out, stars stretched into
// short streaks falling toward it along the same swirl. Both quicken when the void is fed.
function dustField() {
  const canvas = h('canvas', { class: 'login-dust', 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let dpr = 1;
  let inner = 200; // the cage's edge: dust is swallowed here
  let far = 600;
  let motes = [];
  let streaks = [];
  let frame = 0;
  let last = 0;
  let boost = 0;
  let push = 0;
  let falling = false;

  const band = () => inner * 1.35; // how far out the dust reaches
  const mote = (m, fresh) => {
    m.r = fresh ? inner + Math.random() ** 1.5 * band() : inner + band() * (0.9 + Math.random() * 0.1);
    m.a = Math.random() * TAU;
    m.w = 0.7 + Math.random() * 1.1;
    m.o = 0.16 + Math.random() * 0.5;
    m.k = 0.6 + Math.random() * 0.8;
    return m;
  };
  const streak = (s, fresh) => {
    s.r = fresh ? inner * 1.25 + Math.random() * (far - inner * 1.25) : far * (0.9 + Math.random() * 0.15);
    s.a = Math.random() * TAU;
    s.w = 0.6 + Math.random() * 0.8;
    s.o = 0.2 + Math.random() * 0.5;
    s.k = 0.5 + Math.random();
    return s;
  };

  function draw(dt) {
    boost -= boost * Math.min(1, dt * 1.8);
    push -= push * Math.min(1, dt * 3);
    const rush = falling ? 1 : 0;
    ctx.setTransform(dpr, 0, 0, dpr, (W / 2) * dpr, (H / 2) * dpr);
    ctx.clearRect(-W / 2, -H / 2, W, H);
    ctx.strokeStyle = 'rgb(236, 231, 247)';
    ctx.lineCap = 'round';
    const edge = inner * 0.97;
    for (const m of motes) {
      const near = inner / m.r;
      const turn = (0.05 + 0.2 * near * near) * m.k * (1 + boost * 4 + rush * 7);
      m.a += turn * dt;
      m.r += (-(3 + 9 * near) * m.k * (1 + boost * 5 + rush * 45) + push * 240 * near) * dt;
      if (m.r < edge) {
        if (falling) { m.o = 0; continue; }
        mote(m, false);
      } else if (m.r > inner + band()) mote(m, true);
      const fade = clamp((m.r - edge) / (inner * 0.12)) * clamp((inner + band() - m.r) / (inner * 0.25));
      if (fade <= 0 || !m.o) continue;
      ctx.globalAlpha = m.o * fade;
      ctx.lineWidth = m.w;
      ctx.beginPath();
      ctx.arc(0, 0, m.r, m.a - Math.min(0.7, turn * 0.14 + 0.004), m.a);
      ctx.stroke();
    }
    for (const s of streaks) {
      const near = inner / s.r;
      s.r -= (5 + 34 * near) * s.k * (1 + boost * 3 + rush * 30) * dt;
      if (s.r < inner * 1.08) {
        if (falling) { s.o = 0; continue; }
        streak(s, false);
      }
      const fade = clamp((s.r - inner * 1.08) / (inner * 0.35)) * clamp((far - s.r) / 80);
      if (fade <= 0 || !s.o) continue;
      const len = (3 + 30 * near * near) * (1 + boost * 1.5 + rush * 3);
      // They fall along the same swirl as the dust: the tail trails behind.
      s.a += (0.015 + 0.09 * near * near) * s.k * (1 + boost * 3 + rush * 6) * dt;
      const tail = s.a - (len / s.r) * 0.9;
      ctx.globalAlpha = s.o * fade;
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.moveTo(Math.cos(s.a) * s.r, Math.sin(s.a) * s.r);
      ctx.lineTo(Math.cos(tail) * (s.r + len), Math.sin(tail) * (s.r + len));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function step(now) {
    frame = requestAnimationFrame(step);
    // Drifting, about 30 pictures a second is plenty; stirred up, every frame.
    if (last && now - last < 30 && boost < 0.05 && !falling) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    draw(dt);
  }

  return {
    el: canvas,
    // A canvas w × hgt round the void, whose cage reaches r from its centre.
    resize(r, w, hgt) {
      inner = r;
      if (Math.round(w) === W && Math.round(hgt) === H) return;
      W = Math.round(w);
      H = Math.round(hgt);
      far = Math.hypot(W, H) / 2;
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      motes = Array.from({ length: Math.round(clamp((W * H) / 3600, 120, 340)) }, () => mote({}, true));
      streaks = Array.from({ length: Math.round(clamp((W * H) / 11000, 36, 110)) }, () => streak({}, true));
      draw(0);
    },
    play() {
      cancelAnimationFrame(frame);
      last = 0;
      if (reducedMotion()) draw(0);
      else frame = requestAnimationFrame(step);
    },
    stop() { cancelAnimationFrame(frame); },
    // Fed: everything quickens for a moment.
    surge(by) { boost = Math.min(2, boost + by); },
    // Refused: the dust is thrown back.
    repel() { push = 1; },
    // Taken: all of it goes in, and none comes back.
    fall() { falling = true; },
  };
}

export const loginView = {
  create(params, data, url) {
    let mode = 'signin';
    let step = 'name';
    let firstPin = '';
    let busy = false;
    let R = 84;
    let sized = '';
    let twitch = 0;
    let gone = false;
    let opened = false;
    let ready = false;
    let fed = 0;
    const timers = [];

    const nameInput = h('input', {
      class: 'login-name', type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false',
      maxlength: '24', placeholder: 'your name', 'aria-label': 'Username',
    });
    const goBtn = h('button', { type: 'submit', class: 'login-go', 'aria-label': 'Continue' }, '→');
    const pin = pinField({ autocomplete: 'current-password', label: 'Code', onComplete: (digits) => submitPin(digits) });
    const prompt = h('h2', { class: 'login-prompt', 'aria-live': 'polite' });
    const pinLabel = h('p', { class: 'login-label' });
    const msg = h('p', { class: 'login-msg', 'aria-live': 'polite' });
    const other = h('button', { type: 'button', class: 'login-other', onclick: () => { setStep('name'); nameInput.select(); } });

    const form = h('form', { class: 'login-form', novalidate: true },
      prompt,
      h('div', { class: 'login-name-row' }, h('span', { class: 'login-at' }, '@'), nameInput, goBtn),
      h('div', { class: 'login-pin' }, pinLabel, pin.el),
      msg,
      other);

    // The logo, then what comes off it: a stippled haze of ink behind, and
    // two faint copies of the word that keep swelling outward and fading.
    const echo = () => h('span', { class: 'login-echo', 'aria-hidden': 'true' }, logo({ big: true, href: null }));
    const mark = h('h1', { class: 'login-mark' }, logo({ big: true, href: null }),
      h('span', { class: 'login-haze', 'aria-hidden': 'true' }), echo(), echo());
    const art = voidArt({ openMin: 0, openCage: CAGE_OPEN, haloReach: 1 });
    const dust = dustField();
    // Everything you read sits here, in the light.
    const core = h('div', { class: 'login-core' }, mark, form);
    const eye = h('div', { class: 'login-eye' }, dust.el, art.el, core);
    const el = h('div', { class: 'login' }, eye);

    const eyeAt = () => { const r = eye.getBoundingClientRect(); return { x: r.left, y: r.top }; };

    function say(text, tone = '') {
      msg.textContent = text || '';
      msg.className = `login-msg${tone ? ` is-${tone}` : ''}${text ? ' is-on' : ''}`;
    }

    const appear = (node, delay = 0) => {
      if (reducedMotion()) return;
      node.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
        { duration: 600, delay, easing: EASE, fill: 'backwards' });
    };

    // The light is as wide as what it holds, and the cage and dust make room.
    function fit() {
      // On a big screen the words grow with the light.
      const k = clamp(R / 105, 1, 1.35);
      core.style.setProperty('--k', k.toFixed(3));
      const light = Math.max(R * 1.45, (Math.hypot(core.offsetWidth / 2, core.offsetHeight / 2) * 0.94 + 8) * k);
      if (opened) art.setOpen(1, light);
      dust.resize(Math.max(R * 2.5, light * CAGE_OPEN) * 1.08, innerWidth, innerHeight);
    }

    function setStep(next) {
      step = next;
      form.dataset.step = step;
      el.dataset.mode = mode;
      pin.state('');
      pin.clear();
      fed = 0;
      const name = nameInput.value;
      if (step === 'name') {
        firstPin = '';
        prompt.textContent = 'Who’s there?';
      } else if (mode === 'signin') {
        prompt.textContent = `Welcome back, @${name}`;
        pinLabel.textContent = 'Your code';
        other.textContent = 'Not you?';
      } else {
        prompt.textContent = `@${name} is free`;
        pinLabel.textContent = step === 'pin' ? 'Pick a 4-digit code' : 'Once more, to be sure';
        other.textContent = 'Another name';
      }
      pin.input.autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
      say('');
      if (!ready) return;
      appear(prompt);
      if (step !== 'name') appear(pinLabel, 60);
      fit();
      if (step === 'name') nameInput.focus({ preventScroll: true });
      else setTimeout(() => pin.focus(), 60);
    }

    async function submitName() {
      if (busy) return;
      const name = nameInput.value.trim().toLowerCase().replace(/^@/, '');
      nameInput.value = name;
      if (name.length < 2) { say('At least 2 characters.', 'error'); return; }
      if (!NAME_RE.test(name)) { say('Letters, numbers, dots, dashes or underscores.', 'error'); return; }
      say('');
      busy = true;
      try {
        const res = await api.get(`/api/auth/available?username=${encodeURIComponent(name)}`);
        if (res.taken) mode = 'signin';
        else if (!res.available) { say(res.reason, 'error'); return; }
        else if (!session.signups) { say(`No one here goes by @${name}.`, 'error'); return; }
        else mode = 'signup';
      } catch (err) {
        say(err.message, 'error');
        return;
      } finally {
        busy = false;
      }
      feed(0.5);
      setStep('pin');
    }

    // Whatever you type feeds it: it gulps, spins up, and the sky leans in.
    function feed(much) {
      if (gone) return;
      dust.surge(much);
      if (much < 0.3) return;
      const at = eyeAt();
      art.gulp();
      theSky()?.pull(at.x, at.y, { strength: 0.35, radius: R * 6, duration: 800 });
    }
    nameInput.addEventListener('input', () => { say(''); feed(0.14); });
    pin.input.addEventListener('input', () => {
      const n = pin.value.length;
      if (n > fed) feed(0.6);
      fed = n;
    });

    // Refused: it shudders, throws the dust back and sends out a ripple.
    async function fail(text) {
      art.hungry(false);
      dust.repel();
      shockwave(eyeAt(), { size: art.radius() * 2.1, color: 'rgba(214, 208, 236, 0.4)' });
      pin.state('error');
      say(text, 'error');
      fit();
      await wait(420);
      pin.clear();
      fed = 0;
      pin.state('');
      pin.focus();
    }

    // The right code: the words go, everything round the void rushes in, and
    // its light swells until it takes the whole screen.
    async function fallIn() {
      if (reducedMotion()) { art.hungry(false); await wait(400); return null; }
      const at = eyeAt();
      dust.fall();
      art.gulp();
      theSky()?.pull(at.x, at.y, { strength: 1.4, radius: Math.hypot(innerWidth, innerHeight), duration: 1500 });
      core.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.86 }],
        { duration: 420, easing: 'ease-in', fill: 'forwards' });
      await wait(640);
      const from = art.radius();
      const far = Math.hypot(Math.max(at.x, innerWidth - at.x), Math.max(at.y, innerHeight - at.y)) + 24;
      const flash = h('div', { class: 'login-flash', 'aria-hidden': 'true' });
      Object.assign(flash.style, { left: `${at.x - far}px`, top: `${at.y - far}px`, width: `${far * 2}px`, height: `${far * 2}px` });
      document.body.append(flash);
      await flash.animate([{ transform: `scale(${(from / far).toFixed(3)})` }, { transform: 'scale(1)' }],
        { duration: 760, easing: 'cubic-bezier(0.7, 0, 0.84, 0)' }).finished.catch(() => {});
      return flash;
    }

    async function submitPin(digits) {
      if (busy) return;
      if (mode === 'signup' && step === 'pin') {
        firstPin = digits;
        await wait(320);
        setStep('confirm');
        return;
      }
      if (mode === 'signup' && digits !== firstPin) {
        firstPin = '';
        await fail('Those didn’t match. Pick it again.');
        setStep('pin');
        return;
      }
      busy = true;
      pin.state('busy');
      art.hungry(true);
      say('');
      try {
        const body = { username: nameInput.value, pin: digits };
        const res = await api.post(mode === 'signin' ? '/api/auth/login' : '/api/auth/signup', body);
        pin.state('ok');
        remember(res.user?.username || nameInput.value);
        clearTimeout(twitch);
        const flash = await fallIn();
        session.user = res.user;
        session.stats = res.stats;
        setPrefs(res.prefs);
        const next = url.searchParams.get('next') || '';
        nav.go(next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });
        if (flash) {
          flash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, delay: 140, easing: 'ease-out', fill: 'forwards' })
            .finished.then(() => flash.remove(), () => flash.remove());
        }
      } catch (err) {
        busy = false;
        const left = err.data?.attemptsLeft;
        await fail(left ? `${err.message} ${left} ${left === 1 ? 'try' : 'tries'} left.` : err.message);
        if (mode === 'signup' && err.status !== 429) setStep(err.status === 409 ? 'name' : 'pin');
        return;
      }
      busy = false;
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (step === 'name') submitName();
    });

    // The void takes up most of the screen; on a phone its cage runs off both sides.
    function layout() {
      // A phone's keyboard only changes the height: leave it be.
      const key = touchScreen() ? `${innerWidth}` : `${innerWidth}x${innerHeight}`;
      if (key === sized) return;
      sized = key;
      R = Math.round(clamp(Math.min(innerHeight * 0.155, innerWidth * 0.3), 80, 170));
      // Wide enough for the whole cage even where the screen isn't (a phone),
      // so its picture has no edge to show while it grows in.
      art.resize(R, Math.max(innerWidth + 40, R * 6.4), Math.max(innerHeight * 1.2, R * 7));
      fit();
    }

    function open() {
      if (gone || opened) return;
      opened = true;
      fit();
    }

    // First the void alone, closed, with the dust circling. Then it opens;
    // the logo flickers into being in its light, and then the question.
    function arrive() {
      const word = mark.firstElementChild;
      if (reducedMotion()) { open(); return; }
      const centred = 'translate(-50%, -50%)';
      art.el.animate([{ transform: `${centred} scale(0.55)`, opacity: 0 }, { transform: centred, opacity: 1 }], { duration: 1600, easing: EASE });
      dust.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 2200, easing: 'ease-out' });
      timers.push(setTimeout(open, 650));
      mark.animate([
        { opacity: 0, transform: 'scale(0.6)', filter: 'blur(6px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ], { duration: 900, delay: 1150, easing: EASE, fill: 'backwards' });
      timers.push(setTimeout(() => { if (!gone) glitch(word, { hard: true }); }, 1150));
      [...form.children].forEach((node, i) => appear(node, 1500 + i * 70));
    }

    // Settled, the logo still twitches now and then.
    function restless() {
      twitch = setTimeout(() => {
        if (gone) return;
        if (!document.hidden) glitch(mark.firstElementChild, { quick: true });
        restless();
      }, 7000 + Math.random() * 9000);
    }

    // Someone who's signed in here before only has to give their code.
    const known = lastName();
    if (known && url.searchParams.get('new') !== '1') {
      nameInput.value = known;
      setStep('pin');
    } else {
      setStep('name');
    }

    return {
      el,
      title: 'Welcome',
      chrome: false,
      mounted: () => {
        layout();
        addEventListener('resize', layout);
        art.play();
        dust.play();
        theSky()?.setNight(1); // the darkest sky, as far out in the universe
        theSky()?.setLens(() => (el.isConnected ? { ...eyeAt(), r: art.radius() } : null));
        arrive();
        restless();
        ready = true;
        // A phone's keyboard would cover the void, so there it waits for a tap.
        if (!touchScreen()) (step === 'name' ? nameInput : pin).focus({ preventScroll: true });
      },
      destroy: () => {
        gone = true;
        clearTimeout(twitch);
        timers.forEach(clearTimeout);
        removeEventListener('resize', layout);
        theSky()?.setLens(null);
        theSky()?.setNight(0);
        dust.stop();
        art.destroy();
      },
    };
  },
};
