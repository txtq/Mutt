// Sign in / make an account. First a question (new here?), then a
// username, then a 4-digit PIN, under a little pixel night.

import { api, session } from '../api.js';
import { glitch, logo } from '../logo.js';
import { nav } from '../nav.js';
import { createNightScene } from '../nightscene.js';
import { setPrefs } from '../theme.js';
import { pinField } from '../ui.js';
import { h, wait } from '../util.js';

const NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,22}[a-z0-9]$/;
const BEEN = 'mutt.been-here';

const beenHere = () => { try { return !!localStorage.getItem(BEEN); } catch { return false; } };
const markBeen = () => { try { localStorage.setItem(BEEN, '1'); } catch { /* private mode */ } };

export const loginView = {
  create(params, data, url) {
    let mode = 'signin';
    let stage = 'ask';
    let step = 'name';
    let firstPin = '';
    let busy = false;

    const nameInput = h('input', {
      class: 'login-name', type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false',
      maxlength: '24', placeholder: 'username', 'aria-label': 'Username',
    });
    const goBtn = h('button', { type: 'submit', class: 'login-go', 'aria-label': 'Continue' }, '→');
    const pin = pinField({ autocomplete: 'current-password', onComplete: (digits) => submitPin(digits) });
    const pinLabel = h('label', { class: 'login-label' }, 'Code');
    const msg = h('p', { class: 'login-msg', 'aria-live': 'polite' });
    const yesBtn = h('button', { type: 'button', class: 'vbtn vbtn-blue login-choice', onclick: () => choose('signup') }, 'Yes, I’m new');
    const noBtn = h('button', { type: 'button', class: 'vbtn login-choice', onclick: () => choose('signin') }, 'No, log in');
    const ask = h('div', { class: 'login-ask' },
      h('p', { class: 'login-q', id: 'login-q' }, 'Are you new to Mutt?'),
      h('div', { class: 'login-choices', role: 'group', 'aria-labelledby': 'login-q' }, yesBtn, noBtn));

    const heading = h('h2', { class: 'login-heading' });
    const backBtn = h('button', { type: 'button', class: 'login-back', onclick: () => showAsk() },
      h('span', { class: 'login-back-key', 'aria-hidden': 'true' }, '‹'), 'Back');
    const backRow = h('div', { class: 'login-switch' }, backBtn);
    if (!session.signups) backRow.hidden = true;

    const form = h('form', { class: 'login-form', novalidate: true },
      heading,
      h('div', { class: 'login-field' },
        h('label', { class: 'login-label' }, 'Username'),
        h('div', { class: 'login-name-row' }, h('span', { class: 'login-at' }, '@'), nameInput, goBtn)),
      h('div', { class: 'login-field login-pin' }, pinLabel, pin.el),
      msg);

    const mark = h('h1', { class: 'login-mark' }, logo({ big: true, href: null }));
    const scene = createNightScene();
    // A warm light from the top right, like a low sun.
    const light = h('div', { class: 'login-light', 'aria-hidden': 'true' });
    const box = h('div', { class: 'login-box' }, mark, ask, h('div', { class: 'login-steps' }, form, backRow));
    const el = h('div', { class: 'login' }, light, scene.el, box);

    function say(text, tone = '') {
      msg.textContent = text || '';
      msg.className = `login-msg${tone ? ` is-${tone}` : ''}${text ? ' is-on' : ''}`;
    }

    // Each stage rises in softly, like the rest of the page.
    const appear = (node) => node.animate(
      [{ opacity: 0, transform: 'translateY(14px)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'none' }],
      { duration: 700, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });

    function showAsk() {
      stage = 'ask';
      el.dataset.stage = stage;
      say('');
      appear(ask);
      (beenHere() ? noBtn : yesBtn).focus({ preventScroll: true });
    }

    function choose(next) {
      stage = 'form';
      el.dataset.stage = stage;
      setMode(next);
      appear(form);
    }

    function setMode(next) {
      mode = next;
      firstPin = '';
      heading.textContent = mode === 'signin' ? 'Welcome back' : 'Make your account';
      pin.input.autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
      el.dataset.mode = mode;
      say('');
      setStep('name');
    }

    function setStep(next) {
      step = next;
      form.dataset.step = step;
      pin.state('');
      pin.clear();
      if (step === 'name') {
        pinLabel.textContent = 'Code';
        if (stage === 'form') nameInput.focus();
        return;
      }
      if (mode === 'signin') pinLabel.textContent = 'Code';
      else pinLabel.textContent = step === 'pin' ? 'Pick a 4-digit code' : 'Again';
      pinLabel.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
      setTimeout(() => pin.focus(), 60);
    }

    async function submitName() {
      if (busy) return;
      const name = nameInput.value.trim().toLowerCase().replace(/^@/, '');
      nameInput.value = name;
      if (name.length < 2) { say('At least 2 characters.', 'error'); return; }
      if (!NAME_RE.test(name)) { say('Use letters, numbers, dots, dashes or underscores.', 'error'); return; }
      say('');
      if (mode === 'signup') {
        busy = true;
        try {
          const res = await api.get(`/api/auth/available?username=${encodeURIComponent(name)}`);
          if (!res.available) { say(res.reason, 'error'); return; }
        } catch (err) {
          say(err.message, 'error');
          return;
        } finally {
          busy = false;
        }
      }
      setStep('pin');
    }

    async function fail(text) {
      pin.state('error');
      say(text, 'error');
      await wait(420);
      pin.clear();
      pin.state('');
      pin.focus();
    }

    async function submitPin(digits) {
      if (busy) return;
      if (mode === 'signup' && step === 'pin') {
        firstPin = digits;
        setStep('confirm');
        return;
      }
      if (mode === 'signup' && digits !== firstPin) {
        firstPin = '';
        await fail('Didn’t match.');
        setStep('pin');
        return;
      }
      busy = true;
      pin.state('busy');
      say('');
      try {
        const body = { username: nameInput.value, pin: digits };
        const res = await api.post(mode === 'signin' ? '/api/auth/login' : '/api/auth/signup', body);
        pin.state('ok');
        markBeen();
        await wait(520);
        session.user = res.user;
        session.stats = res.stats;
        setPrefs(res.prefs);
        const next = url.searchParams.get('next') || '';
        nav.go(next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });
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
    nameInput.addEventListener('focus', () => { if (step !== 'name') setStep('name'); });
    nameInput.addEventListener('input', () => say(''));
    el.addEventListener('keydown', (e) => {
      if (stage !== 'ask' || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'y' && key !== 'n') return;
      e.preventDefault(); // or the letter lands in the name box
      choose(key === 'y' ? 'signup' : 'signin');
    });

    // Straight to a form when there's nothing to ask.
    if (!session.signups) choose('signin');
    else if (url.searchParams.get('new') === '1') choose('signup');
    else el.dataset.stage = stage;

    return {
      el,
      title: 'Welcome',
      chrome: false,
      mounted: () => {
        scene.start();
        if (stage === 'ask') (beenHere() ? noBtn : yesBtn).focus({ preventScroll: true });
        else nameInput.focus();
        glitch(mark.firstElementChild);
      },
      destroy: () => {
        scene.stop();
      },
    };
  },
};
