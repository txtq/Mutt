// Sign in / make an account: a username, then a 4-digit PIN.

import { api, session } from '../api.js';
import { nav } from '../nav.js';
import { setPrefs } from '../theme.js';
import { pinField } from '../ui.js';
import { h, wait } from '../util.js';

const NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,22}[a-z0-9]$/;

export const loginView = {
  create(params, data, url) {
    let mode = url.searchParams.get('new') === '1' && session.signups ? 'signup' : 'signin';
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
    const switchBtn = h('button', { type: 'button', class: 'link', onclick: () => setMode(mode === 'signin' ? 'signup' : 'signin') });
    const switchRow = h('div', { class: 'login-switch' }, switchBtn);
    if (!session.signups) switchRow.hidden = true;

    const form = h('form', { class: 'login-form', novalidate: true },
      h('div', { class: 'login-field' },
        h('label', { class: 'login-label' }, 'Username'),
        h('div', { class: 'login-name-row' }, h('span', { class: 'login-at' }, '@'), nameInput, goBtn)),
      h('div', { class: 'login-field login-pin' }, pinLabel, pin.el),
      msg);

    const mark = h('h1', { class: 'login-mark', 'aria-label': 'Mutt' },
      [...'Mutt'].map((ch, i) => h('span', { style: { '--i': i }, 'aria-hidden': 'true' }, ch)));
    const el = h('div', { class: 'login' }, h('div', { class: 'login-box' }, mark, form, switchRow));

    function say(text, tone = '') {
      msg.textContent = text || '';
      msg.className = `login-msg${tone ? ` is-${tone}` : ''}${text ? ' is-on' : ''}`;
    }

    function setMode(next) {
      mode = next;
      firstPin = '';
      switchBtn.textContent = mode === 'signin' ? 'Make an account' : 'Sign in';
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
        nameInput.focus();
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

    setMode(mode);
    return {
      el,
      title: mode === 'signin' ? 'Sign in' : 'Make an account',
      chrome: false,
      mounted: () => nameInput.focus(),
    };
  },
};
