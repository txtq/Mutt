// Your account: signing out, changing your code, leaving for good.

import { api, session } from './api.js';
import { nav } from './nav.js';
import { forgetPrefs } from './theme.js';
import { openDialog, pinField, toast } from './ui.js';
import { h, wait } from './util.js';

export async function signOut() {
  try { await api.post('/api/auth/logout'); } catch { /* signed out either way */ }
  session.user = null;
  forgetPrefs();
  nav.go('/login', { replace: true });
}

function pinSteps({ title, steps, onDone }) {
  let index = 0;
  const values = [];
  const label = h('p', { class: 'dialog-text' });
  const msg = h('p', { class: 'dialog-msg' });
  const field = pinField({
    autocomplete: 'off',
    onComplete: async (digits) => {
      msg.textContent = '';
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
  const show = () => {
    label.textContent = steps[index].label;
    label.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'ease-out' });
    field.state('');
    field.clear();
    setTimeout(() => field.focus(), 40);
  };
  const dialog = openDialog({ title, body: h('div', { class: 'pin-dialog' }, label, field.el, msg) });
  show();
  return dialog;
}

export function changePin() {
  pinSteps({
    title: 'Change code',
    steps: [{ label: 'Current code' }, { label: 'New code', restart: true }, { label: 'Again' }],
    onDone: async ([current, next, again]) => {
      if (next !== again) return 'Those didn’t match.';
      await api.post('/api/me/pin', { current, next });
      toast('Code changed');
      return null;
    },
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
      setTimeout(() => nav.go('/login', { replace: true }), 450);
      return null;
    },
  });
}
