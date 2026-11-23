// Sign in / make an account, inside the void. It fills the screen; dust
// spirals into it and the stars round it are stretched toward it. It opens,
// and the logo, your name and your code sit in dark ink on its light, never
// on its speckled cage. There's one thing to do: type a name. A name Mutt
// knows is asked for its code; a new one is free to take by picking a code.
// The void answers every key, and the right code lets its light take you.
//
// Forgetting your code: after two misses "Can’t remember it?" offers the two
// ways back in that need no identity: the recovery key Mutt gave you, or
// asking whoever runs Mutt for a reset (they send a one-time link, which opens
// this page as /login?reset=…, asking only for a new code).

import { askForLongerCode } from '../account.js';
import { api, session } from '../api.js';
import { shockwave } from '../fx.js';
import { glitch, logo } from '../logo.js';
import { nav } from '../nav.js';
import { theSky } from '../sky.js';
import { setPrefs } from '../theme.js';
import { pinField } from '../ui.js';
import { DUR, EASE, EASE_GLIDE, EASE_LEAVE, STAGGER, h, reducedMotion, touchScreen, wait } from '../util.js';
import { voidArt } from '../voidart.js';
import { icon } from '../icons.js';
import { sound } from '../sound.js';

const NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,22}[a-z0-9]$/;
const BEEN = 'mutt.been-here';
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

// What surrounds the void, all of it the print's stippling come loose:
//  - a haze of dots hugging the cage, gathered into three spiral arms that
//    slowly turn with it;
//  - dotted orbits, broken rings turning at their own speeds;
//  - dust circling and spiralling in;
//  - dust thrown out of the void along the arms, slowing and fading;
//  - further out, stars stretched into streaks falling in along the swirl.
// All of it quickens when the void is fed, and a fed void throws out a burst.
function dustField() {
  const canvas = h('canvas', { class: 'login-dust', 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d');
  const ARMS = 3;
  // Each orbit: how far out (in cage radii), how fast it turns, how strong.
  const ORBITS = [[1.13, 0.06, 1], [1.4, -0.035, 0.8], [1.82, 0.02, 0.55]].map(([at, speed, o]) => ({ at, speed, o, a: Math.random() * TAU }));
  let W = 0;
  let H = 0;
  let dpr = 1;
  let inner = 200; // the cage's edge: dust is swallowed here, and thrown out from here
  let far = 600;
  let motes = [];
  let streaks = [];
  let sprays = [];
  let haze = null;
  let hazeFor = 0;
  let spin = 0;
  let frame = 0;
  let last = 0;
  let boost = 0;
  let push = 0;
  let falling = false;

  const band = () => inner * 1.35; // how far out the circling dust reaches
  // How much of an arm passes through (a, r): the arms trail as they go out.
  const arm = (a, r) => 0.5 + 0.5 * Math.cos(ARMS * (a + 1.5 * Math.log(r / inner)));
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
  // A grain leaves the cage's edge where an arm meets it.
  const spray = (p, burst) => {
    p.a = spin + Math.floor(Math.random() * ARMS) * (TAU / ARMS) + (Math.random() - 0.5) * (burst ? 1.6 : 0.9);
    p.r = inner * (0.97 + Math.random() * 0.05);
    p.v = (46 + Math.random() * 110) * (burst ? 2.2 : 1) * (inner / 250);
    p.t = 0;
    p.life = 2.4 + Math.random() * 3.4;
    p.wait = burst ? Math.random() * 0.15 : Math.random() * 1.6;
    p.w = 0.6 + Math.random() * 1.2;
    p.o = 0.4 + Math.random() * 0.6;
    p.k = 0.6 + Math.random() * 0.8;
    return p;
  };

  // The haze is dotted once and then only turned.
  function dotHaze() {
    const reach = inner * 2;
    const c = document.createElement('canvas');
    c.width = Math.ceil(reach * 2);
    c.height = c.width;
    const g = c.getContext('2d');
    g.translate(c.width / 2, c.width / 2);
    g.fillStyle = 'rgb(236, 231, 247)';
    const n = Math.round(clamp((inner * inner) / 2.4, 7000, 30000));
    for (let i = 0; i < n; i += 1) {
      const t = Math.random() ** 1.5;
      const r = inner * (0.95 + t * 1.03);
      const a = Math.random() * TAU;
      const d = arm(a, r);
      if (Math.random() > 0.14 + 0.86 * d * d) continue;
      g.globalAlpha = (1 - t) ** 1.1 * (0.35 + Math.random() * 0.65);
      g.beginPath();
      g.arc(Math.cos(a) * r, Math.sin(a) * r, 0.4 + Math.random() * 0.65, 0, TAU);
      g.fill();
    }
    haze = c;
    hazeFor = inner;
  }

  function draw(dt) {
    boost -= boost * Math.min(1, dt * 1.8);
    push -= push * Math.min(1, dt * 3);
    const rush = falling ? 1 : 0;
    const quick = 1 + boost * 4 + rush * 9;
    spin += 0.03 * quick * dt;
    ctx.setTransform(dpr, 0, 0, dpr, (W / 2) * dpr, (H / 2) * dpr);
    ctx.clearRect(-W / 2, -H / 2, W, H);
    ctx.strokeStyle = 'rgb(236, 231, 247)';
    ctx.lineCap = 'round';

    if (haze) {
      const reach = hazeFor * 2;
      ctx.save();
      ctx.rotate(spin);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(haze, -reach, -reach, reach * 2, reach * 2);
      ctx.restore();
    }

    ctx.lineWidth = 1.3;
    ctx.setLineDash([0.1, 7]);
    for (const ring of ORBITS) {
      ring.a += ring.speed * quick * dt;
      ctx.globalAlpha = 0.62 * ring.o;
      for (let j = 0; j < 2; j += 1) {
        ctx.beginPath();
        ctx.arc(0, 0, inner * ring.at, ring.a + j * Math.PI, ring.a + j * Math.PI + 2.1);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

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

    for (const p of sprays) {
      if (!p.o) continue;
      if (p.wait > 0) { p.wait -= dt; continue; }
      p.t += dt;
      if (falling) {
        p.r -= 620 * dt;
        if (p.r < edge) { p.o = 0; continue; }
      } else if (p.t > p.life) {
        spray(p, false);
        continue;
      }
      const u = clamp(p.t / p.life);
      const v = p.v * (1 - u) ** 1.5;
      const turn = (0.1 + 0.3 * (inner / p.r) ** 2) * p.k * (1 + boost * 2);
      if (!falling) p.r += (v * (1 + boost) + push * 220) * dt;
      p.a += turn * dt;
      const len = Math.min(30, v * 0.17 + 1.2);
      const back = p.a - Math.min(0.5, turn * 0.3);
      ctx.globalAlpha = p.o * Math.min(1, u * 9) * (1 - u) ** 1.2;
      ctx.lineWidth = p.w;
      ctx.beginPath();
      ctx.moveTo(Math.cos(p.a) * p.r, Math.sin(p.a) * p.r);
      ctx.lineTo(Math.cos(back) * (p.r - len), Math.sin(back) * (p.r - len));
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
      if (!haze || Math.abs(inner - hazeFor) > inner * 0.03) dotHaze();
      if (Math.round(w) === W && Math.round(hgt) === H) return;
      W = Math.round(w);
      H = Math.round(hgt);
      far = Math.hypot(W, H) / 2;
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      motes = Array.from({ length: Math.round(clamp((W * H) / 2200, 200, 560)) }, () => mote({}, true));
      sprays = Array.from({ length: Math.round(clamp((W * H) / 1700, 260, 620)) }, () => spray({}, false));
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
    // Fed: everything quickens for a moment, and a good mouthful makes the
    // void throw out a burst.
    surge(by) {
      boost = Math.min(2, boost + by);
      if (by < 0.3 || falling) return;
      for (const p of sprays) if (Math.random() < 0.3) spray(p, true);
    },
    // Refused: the dust is thrown back.
    repel() { push = 1; },
    // Taken: all of it goes in, and none comes back.
    fall() { falling = true; },
  };
}

// What a reset link (/login?reset=…) is for, read before the page is made.
const resetOf = (url) => {
  const token = url.searchParams.get('reset') || '';
  if (!token) return null;
  return api.get(`/api/auth/reset/${encodeURIComponent(token)}`)
    .then((r) => ({ reset: { token, username: r.username } }), (err) => ({ reset: { token, error: err.message } }));
};

// Keys are 16 letters and digits; how they're typed (case, dashes, spaces) doesn't matter.
const keyChars = (value) => value.toUpperCase().replace(/[\s\-_.]/g, '');

export const loginView = {
  load: (params, url) => resetOf(url),
  create(params, data, url) {
    // signin, signup, recover (a new code with your recovery key) or reset (a new code from a link)
    let mode = 'signin';
    let misses = 0;
    let key = '';
    const reset = data?.reset || null;
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
    const goBtn = h('button', { type: 'submit', class: 'login-go', 'aria-label': 'Continue', title: 'Continue' }, icon('forward', 20));
    const pin = pinField({ autocomplete: 'current-password', label: 'Code', either: true, onComplete: (digits) => submitPin(digits) });
    const prompt = h('h2', { class: 'login-prompt', 'aria-live': 'polite' });
    const pinLabel = h('p', { class: 'login-label' });
    const msg = h('p', { class: 'login-msg', 'aria-live': 'polite' });
    const other = h('button', { type: 'button', class: 'login-other', onclick: () => back() });
    const help = h('button', { type: 'button', class: 'login-other', hidden: true, onclick: () => setStep('help') }, 'Can’t remember it?');
    const about = h('p', { class: 'login-label login-about' });
    const choices = h('div', { class: 'login-choices' },
      h('button', { type: 'button', class: 'login-other', onclick: () => setStep('key') }, 'Use my recovery key'),
      h('button', { type: 'button', class: 'login-other', onclick: () => setStep('ask') }, 'Ask for a reset'));
    const keyInput = h('input', {
      class: 'login-name login-key-input', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
      maxlength: '24', placeholder: 'XXXX-XXXX-XXXX-XXXX', 'aria-label': 'Recovery key',
    });
    const noteInput = h('input', {
      class: 'login-name login-note-input', type: 'text', autocomplete: 'off', maxlength: '300',
      placeholder: 'who you are, how to reach you', 'aria-label': 'A note for whoever runs Mutt',
    });
    const goTo = (label) => h('button', { type: 'submit', class: 'login-go', 'aria-label': label, title: label }, icon('forward', 20));

    const form = h('form', { class: 'login-form', novalidate: true },
      prompt,
      h('div', { class: 'login-name-row' }, h('span', { class: 'login-at' }, '@'), nameInput, goBtn),
      about,
      choices,
      h('div', { class: 'login-line login-key' }, keyInput, goTo('Continue')),
      h('div', { class: 'login-line login-ask' }, noteInput, goTo('Send')),
      h('div', { class: 'login-pin' }, pinLabel, pin.el),
      msg,
      h('div', { class: 'login-links' }, other, help));

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
        { duration: DUR.arrive, delay, easing: EASE, fill: 'backwards' });
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

    // Where "Back" (or "Not you?", "Another name") goes from each step.
    function back() {
      if (step === 'help' || (mode === 'signin' && step === 'asked')) { setStep('pin'); return; }
      if (step === 'key' || step === 'ask') { setStep('help'); return; }
      if (mode === 'recover') { setStep('key'); return; }
      if (step === 'gone') { history.replaceState(null, '', '/login'); mode = 'signin'; setStep(nameInput.value ? 'pin' : 'name'); return; }
      mode = 'signin';
      misses = 0;
      setStep('name');
      nameInput.select();
    }

    const PICK = { pin: 'Pick a 6-digit code', confirm: 'Once more, to be sure' };
    function setStep(next) {
      step = next;
      form.dataset.step = step;
      el.dataset.mode = mode;
      pin.state('');
      pin.clear();
      fed = 0;
      const name = nameInput.value;
      about.textContent = '';
      other.hidden = false;
      help.hidden = !(mode === 'signin' && step === 'pin' && misses >= 2);
      if (step === 'name') {
        firstPin = '';
        prompt.textContent = 'Who’s there?';
      } else if (step === 'help') {
        prompt.textContent = 'Can’t remember it?';
        about.textContent = `There are two ways back in to @${name}.`;
        other.textContent = 'Back';
      } else if (step === 'key') {
        prompt.textContent = 'Your recovery key';
        about.textContent = 'The one Mutt gave you when you made your account.';
        other.textContent = 'Back';
      } else if (step === 'ask') {
        prompt.textContent = 'Ask for a reset';
        about.textContent = 'Whoever runs Mutt checks it’s you, then sends you a link to pick a new code. Say who you are and where to reach you.';
        other.textContent = 'Back';
      } else if (step === 'asked') {
        prompt.textContent = 'Asked';
        about.textContent = 'Once they know it’s you, they’ll send you a link. It works once, for three days.';
        other.textContent = 'Back to sign in';
      } else if (step === 'gone') {
        prompt.textContent = 'This link has run out';
        about.textContent = 'It may have been used already, or be more than three days old. Ask for a new one.';
        other.textContent = 'Sign in';
      } else if (mode === 'signin') {
        prompt.textContent = `Welcome back, @${name}`;
        pinLabel.textContent = 'Your code';
        other.textContent = 'Not you?';
      } else if (mode === 'signup') {
        prompt.textContent = `@${name} is free`;
        pinLabel.textContent = PICK[step];
        other.textContent = 'Another name';
      } else {
        prompt.textContent = mode === 'reset' ? `A new code for @${name}` : 'Pick a new code';
        pinLabel.textContent = PICK[step];
        other.textContent = 'Back';
        other.hidden = mode === 'reset';
      }
      if (step === 'pin' && mode !== 'signup' && mode !== 'signin') firstPin = '';
      pin.input.autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
      // Signing in takes 6 digits, or 4 for older accounts; new codes are 6.
      pin.configure(mode === 'signin' ? { either: true } : { length: 6 });
      say('');
      if (!ready) return;
      appear(prompt);
      if (about.textContent) appear(about, 60);
      if (step === 'pin' || step === 'confirm') appear(pinLabel, 60);
      fit();
      if (step === 'name') nameInput.focus({ preventScroll: true });
      else if (step === 'key') keyInput.focus({ preventScroll: true });
      else if (step === 'ask') noteInput.focus({ preventScroll: true });
      else if (step === 'help') choices.firstElementChild.focus({ preventScroll: true });
      else if (step === 'pin' || step === 'confirm') setTimeout(() => pin.focus(), 60);
    }

    // The key is checked when the new code is sent, so a wrong one costs one try, not two.
    function submitKey() {
      const raw = keyChars(keyInput.value);
      if (raw.length !== 16 || !/^[0-9A-Z]+$/.test(raw)) { say('A key is 16 letters and numbers.', 'error'); dust.repel(); return; }
      key = raw;
      mode = 'recover';
      feed(0.5);
      setStep('pin');
    }

    async function submitAsk() {
      if (busy) return;
      busy = true;
      try {
        await api.post('/api/auth/reset-request', { username: nameInput.value, note: noteInput.value.trim() });
        feed(0.5);
        setStep('asked');
      } catch (err) {
        say(err.message, 'error');
      } finally {
        busy = false;
      }
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
      theSky()?.pull(at.x, at.y, { strength: 0.35, radius: R * 6, duration: DUR.scene });
    }
    for (const input of [nameInput, keyInput, noteInput]) input.addEventListener('input', () => { say(''); feed(0.14); });
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
      await wait(DUR.move);
      pin.clear();
      fed = 0;
      pin.state('');
      pin.focus();
    }

    // The right code: the words go, everything round the void rushes in, and the void itself draws
    // down into the void at the middle of your galaxy, which arrives round it. One void, carried from
    // the door into the home (the user, 2026-11-23; before, its light swelled until it took the screen).
    // Gives back how to land it once the galaxy is in place, or null when nothing moves.
    async function fallIn() {
      if (reducedMotion()) { art.hungry(false); await wait(400); return null; }
      const at = eyeAt();
      dust.fall();
      art.gulp();
      art.hungry(false);
      theSky()?.pull(at.x, at.y, { strength: 1.4, radius: Math.hypot(innerWidth, innerHeight), duration: DUR.grand });
      core.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.86 }],
        { duration: DUR.move, easing: EASE_LEAVE, fill: 'forwards' });
      // Its light draws in: closed, it is the galaxy's own void, only larger.
      art.setOpen(0);
      await wait(DUR.scene);
      // It leaves this page as it stands, to lie over the next one while that is put together. (Held still
      // from here: the galaxy being built stops the page for a moment, and a void that stopped turning
      // half way would show it. It turns too slowly for a second's stillness to be seen.)
      const size = R;
      const carry = h('div', { class: 'login-carry', 'aria-hidden': 'true', style: { left: `${at.x}px`, top: `${at.y}px` } });
      art.pause();
      carry.append(art.el);
      document.body.append(carry);
      return async () => {
        const hole = document.querySelector('.gx .void .void-hole');
        const theirs = document.querySelector('.gx .void .void-art');
        if (!hole || !theirs) {
          carry.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.change, easing: EASE_LEAVE, fill: 'forwards' }).finished.then(() => carry.remove(), () => carry.remove());
          return;
        }
        // Down to the galaxy's void, in its place and at its size; then it is that void, turned exactly as this one is.
        const to = hole.getBoundingClientRect();
        theirs.style.visibility = 'hidden';
        await carry.animate([{ transform: 'none' }, { transform: `translate(${(to.left + to.width / 2 - at.x).toFixed(1)}px, ${(to.top + to.height / 2 - at.y).toFixed(1)}px) scale(${(to.width / 2 / size).toFixed(4)})` }],
          { duration: DUR.grand, easing: EASE_GLIDE, fill: 'forwards' }).finished.catch(() => {});
        theirs.spin?.(art.el.spin?.());
        theirs.style.visibility = '';
        carry.remove();
      };
    }

    async function submitPin(digits) {
      if (busy) return;
      const picking = mode !== 'signin';
      if (picking && step === 'pin') {
        // Too easy to guess? Say so now, before asking for it twice.
        const problem = await api.post('/api/auth/check-pin', { pin: digits }).then((r) => r.problem, () => null);
        if (problem) { await fail(problem); return; }
        firstPin = digits;
        await wait(320);
        setStep('confirm');
        return;
      }
      if (picking && digits !== firstPin) {
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
        const username = nameInput.value;
        const res = await (
          mode === 'recover' ? api.post('/api/auth/recover', { username, key, pin: digits })
            : mode === 'reset' ? api.post(`/api/auth/reset/${encodeURIComponent(reset.token)}`, { pin: digits })
              : api.post(mode === 'signin' ? '/api/auth/login' : '/api/auth/signup', { username, pin: digits }));
        pin.state('ok');
        sound('hello');
        remember(res.user?.username || nameInput.value);
        clearTimeout(twitch);
        const land = await fallIn();
        session.user = res.user;
        session.stats = res.stats;
        setPrefs(res.prefs);
        const next = url.searchParams.get('next') || '';
        // The light stays until the galaxy is in place underneath it.
        await nav.go(next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });
        askForLongerCode();
        // A new account, or a new code without the old one: here is the key that gets you back in next time.
        if (res.recoveryKey) import('../account.js').then((m) => m.showRecoveryKey(res.recoveryKey, res.user?.username));
        land?.();
      } catch (err) {
        busy = false;
        const left = err.data?.attemptsLeft;
        if (mode === 'signin' && (err.status === 401 || err.status === 429)) misses += 1;
        await fail(left ? `${err.message} ${left} ${left === 1 ? 'try' : 'tries'} left.` : err.message);
        if (mode === 'signin' && misses >= 2 && help.hidden) { help.hidden = false; appear(help); fit(); }
        if (mode === 'signup' && err.status !== 429) setStep(err.status === 409 ? 'name' : 'pin');
        if (mode === 'recover' && err.status === 401) { setStep('key'); keyInput.select(); say(err.message, 'error'); }
        else if (mode === 'recover' && err.status === 400) setStep('pin');
        if (mode === 'reset' && err.status === 404) { mode = 'signin'; setStep('gone'); }
        else if (mode === 'reset') { const said = err.message; setStep('pin'); say(said, 'error'); }
        return;
      }
      busy = false;
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (step === 'name') submitName();
      else if (step === 'key') submitKey();
      else if (step === 'ask') submitAsk();
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
      art.el.animate([{ transform: `${centred} scale(0.55)`, opacity: 0 }, { transform: centred, opacity: 1 }], { duration: DUR.grand, easing: EASE });
      dust.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.grand, easing: 'ease' });
      timers.push(setTimeout(open, DUR.arrive));
      mark.animate([
        { opacity: 0, transform: 'scale(0.6)', filter: 'blur(6px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ], { duration: DUR.scene, delay: DUR.scene, easing: EASE, fill: 'backwards' });
      timers.push(setTimeout(() => { if (!gone) glitch(word, { hard: true }); }, DUR.scene));
      [...form.children].forEach((node, i) => appear(node, DUR.grand + i * STAGGER));
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
    if (reset?.username) {
      nameInput.value = reset.username;
      mode = 'reset';
      setStep('pin');
    } else if (reset) {
      nameInput.value = known;
      setStep('gone');
    } else if (known && url.searchParams.get('new') !== '1') {
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
        if (!touchScreen() && step !== 'gone') (step === 'name' ? nameInput : pin).focus({ preventScroll: true });
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
