// Your account: signing out, changing your code (or setting one without it,
// on a device you've signed in on), your name, your recovery key, leaving for good.

import { api, session } from './api.js';
import { nav } from './nav.js';
import { forgetPrefs } from './theme.js';
import { confirmDialog, openDialog, pinField, toast } from './ui.js';
import { DUR, EASE, h, reducedMotion, wait } from './util.js';
import { icon } from './icons.js';

export async function signOut() {
  try { await api.post('/api/auth/logout'); } catch { /* signed out either way */ }
  session.user = null;
  forgetPrefs();
  nav.go('/login', { replace: true });
}

function pinSteps({ title, steps, onDone, aside = null }) {
  let index = 0;
  const values = [];
  const label = h('p', { class: 'dialog-text' });
  const msg = h('p', { class: 'dialog-msg' });
  const field = pinField({
    autocomplete: 'off',
    onComplete: async (digits) => {
      msg.textContent = '';
      if (steps[index].check) {
        // A new code that's too easy to guess is turned back before "Again".
        const problem = await api.post('/api/auth/check-pin', { pin: digits }).then((r) => r.problem, () => null);
        if (problem) {
          field.state('error');
          msg.textContent = problem;
          await wait(420);
          field.state('');
          field.clear();
          field.focus();
          return;
        }
      }
      values[index] = digits;
      if (index < steps.length - 1) {
        index++;
        show();
        return;
      }
      field.state('busy');
      const error = await onDone(values).catch((err) => err.message);
      if (!error) { field.state('ok'); await wait(400); dialog.close(); return; }
      field.state('error');
      msg.textContent = error;
      await wait(420);
      index = steps.findIndex((s) => s.restart) >= 0 && error.includes('match') ? 1 : 0;
      show();
    },
  });
  // A way out of the first step ("Forgot it?"), shown only there.
  const asideBtn = aside ? h('button', { type: 'button', class: 'btn btn-quiet btn-small pin-aside', onclick: () => { dialog.close(); aside.run(); } }, aside.label) : null;
  const show = () => {
    if (asideBtn) asideBtn.hidden = index > 0;
    label.textContent = steps[index].label;
    field.configure(steps[index].pin || { either: true });
    label.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: reducedMotion() ? 0 : DUR.move, easing: EASE });
    field.state('');
    field.clear();
    setTimeout(() => field.focus(), 40);
  };
  const dialog = openDialog({ title, body: h('div', { class: 'pin-dialog' }, label, field.el, msg, asideBtn) });
  show();
  return dialog;
}

export function changePin() {
  pinSteps({
    title: 'Change code',
    aside: { label: 'Forgot it?', run: forgotPin },
    steps: [{ label: 'Current code' }, { label: 'New code (6 digits)', restart: true, check: true, pin: { length: 6 } },
      { label: 'Again', pin: { length: 6 } }],
    onDone: async ([current, next, again]) => {
      if (next !== again) return 'Those didn’t match.';
      await api.post('/api/me/pin', { current, next });
      if (session.user) session.user.oldCode = false;
      toast('Code changed');
      return null;
    },
  });
}

// Someone who still signs in with 4 digits is asked, once a day on each
// device, to pick 6: a 4-digit code is far easier to guess.
export function askForLongerCode() {
  if (!session.user?.oldCode) return;
  const today = new Date().toDateString();
  try {
    if (localStorage.getItem('mutt:old-code-asked') === today) return;
    localStorage.setItem('mutt:old-code-asked', today);
  } catch { /* asked again next time, no harm */ }
  toast('Your sign-in code is only 4 digits. A 6-digit one is far harder to guess.', {
    action: { label: 'Change code', run: () => changePin() },
  });
}

export function deleteAccount() {
  pinSteps({
    title: 'Delete account?',
    steps: [{ label: 'Everything you’ve stored goes for good. Enter your code.' }],
    onDone: async ([pin]) => {
      await api.post('/api/me/delete', { pin });
      session.user = null;
      forgetPrefs();
      setTimeout(() => nav.go('/login', { replace: true }), DUR.arrive);
      return null;
    },
  });
}

// Forgotten your code, but still signed in here: a device that has signed in
// to the account can set a new one without the old.
export function forgotPin() {
  pinSteps({
    title: 'Set a new code',
    steps: [{ label: 'You’re signed in here, so you can pick a new code without the old one. New code (6 digits)', restart: true, check: true, pin: { length: 6 } },
      { label: 'Again', pin: { length: 6 } }],
    onDone: async ([next, again]) => {
      if (next !== again) return 'Those didn’t match.';
      await api.post('/api/me/pin', { forgot: true, next });
      toast('Code changed. Other devices are signed out.');
      return null;
    },
  });
}

// ---------------------------------------------------------------- your name

// Any words you'd like to be called, shown where people see you; or none.
export async function saveName(value) {
  const res = await api.put('/api/me/name', { name: value });
  session.user = { ...session.user, name: res.name };
  return res.name;
}

// ---------------------------------------------------------------- your recovery key

// Shown once, at sign-up and whenever a new one is made: kept somewhere
// outside Mutt, it lets you pick a new code if you forget yours. It isn't
// offered as a file on a planet: a planet is behind the same code the key is
// there to replace, so it would be locked away exactly when it's needed.
export function showRecoveryKey(key, username = session.user?.username) {
  session.user = session.user && { ...session.user, hasKey: true };
  const box = h('input', {
    class: 'field rk-key', type: 'text', readonly: true, value: key, spellcheck: 'false', 'aria-label': 'Your recovery key',
    onfocus: (e) => e.target.select(),
  });
  const copy = h('button', {
    type: 'button', class: 'btn btn-small',
    onclick: async () => {
      try { await navigator.clipboard.writeText(key); toast('Key copied'); } catch { box.select(); toast('Press Copy on your keyboard'); }
    },
  }, icon('copy'), 'Copy');
  const save = h('button', {
    type: 'button', class: 'btn btn-small',
    onclick: () => {
      const text = `Mutt recovery key for @${username}\n\n${key}\n\nIf you forget your code: on the sign-in page, after two wrong tries choose\n“Can’t remember it?”, then “Use my recovery key”. It works once; Mutt then gives you a new one.\n`;
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      h('a', { href: url, download: `mutt-recovery-key-${username}.txt` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  }, icon('download'), 'Save as a file');
  const done = h('button', { type: 'button', class: 'btn btn-main', onclick: () => dialog.close() }, 'I’ve kept it');
  const dialog = openDialog({
    title: 'Your recovery key',
    dismissable: false,
    body: h('div', { class: 'rk' },
      h('p', { class: 'dialog-text' }, 'If you ever forget your code, this key lets you pick a new one. Keep it somewhere outside Mutt: your password manager, a photo, or paper. It’s only shown now.'),
      box,
      h('div', { class: 'rk-tools' }, copy, save),
      h('div', { class: 'dialog-actions' }, done)),
  });
  requestAnimationFrame(() => done.focus());
  return dialog;
}

export async function newRecoveryKey() {
  if (session.user?.hasKey) {
    const ok = await confirmDialog({
      title: 'Make a new recovery key?',
      message: 'Your old key stops working.',
      confirm: 'Make a new key',
    });
    if (!ok) return;
  }
  try {
    const res = await api.post('/api/me/recovery-key');
    showRecoveryKey(res.recoveryKey);
  } catch (err) {
    toast(err.message);
  }
}
