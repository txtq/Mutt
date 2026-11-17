// Keeping a planet together, told on your own galaxy: someone asking you to
// keep one of their planets with them (a tip at the foot, one ask at a time),
// and news of a planet you keep with someone (they joined, left, changed who
// can see it, or their account is gone), each said once as a toast.
// Run by statusbar.js beside the recovery key's tip; small, loaded with it.

import { api, session } from './api.js';
import { icon } from './icons.js';
import { nav } from './nav.js';
import { exit, openDialog, toast } from './ui.js';
import { BEAT, bus, h, shortName } from './util.js';

// "Make a planet with Rae": from Rae's galaxy, one of Rae's files, or something Rae
// beamed you. A new planet shared with them by name at once, and they're asked to
// share it, so it sits in both galaxies once they say yes. `start(drawer)` puts its
// first file on it (a copy of their file, or the beam kept there); `what` names that file.
export function planetWith(who, { start = null, what = '' } = {}) {
  const name = shortName(who);
  const input = h('input', { class: 'field', type: 'text', maxlength: '80', placeholder: 'Name it', 'aria-label': 'Planet name', autofocus: true });
  const make = h('button', { type: 'button', class: 'btn btn-main' }, icon('pair'), `Make it with ${name}`);
  const go = async () => {
    const title = input.value.trim();
    if (!title) { input.focus(); return; }
    make.setAttribute('aria-busy', 'true');
    make.disabled = true;
    try {
      const { drawer } = await api.post('/api/drawers', { title, with: who.username });
      dialog.close();
      if (start) await start(drawer);
      bus.emit('drawer:changed', drawer);
      toast(`Made “${drawer.title}”. ${name} is asked to share it with you`, {
        action: { label: 'See it', run: () => nav.go(`/p/${drawer.id}`) },
      });
    } catch (err) {
      make.removeAttribute('aria-busy');
      make.disabled = false;
      toast(err.message);
    }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  make.addEventListener('click', go);
  const dialog = openDialog({
    title: `A planet with ${name}`,
    body: h('div', null,
      h('p', { class: 'dialog-text' },
        `A shared planet sits in both your galaxies, and you both add to it and arrange it. ${name} is asked first; until then only you two can see inside.`,
        what ? ` It starts with “${what}”.` : ''),
      input,
      h('div', { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => dialog.close() }, 'Cancel'),
        make)),
  });
  return dialog;
}

const FRESH = 60000; // asked again on coming back to the galaxy after this long

const NEWS = {
  joined: (n) => `${n.by} said yes: “${n.title}” is a shared planet now`,
  left: (n) => `${n.by} left “${n.title}”. It’s yours alone now, with their files kept`,
  sharing: (n) => `${n.by} changed who can see “${n.title}”`,
  gone: (n) => `${n.by} deleted their account. “${n.title}” is yours alone now, with their files kept`,
};

export function askToKeep() {
  let tip = null;
  let timer = 0;
  let here = false;
  let asks = [];
  let fetchedAt = 0;
  let asking = null;
  // Something else is speaking or open (the recovery key's tip included).
  const busy = () => !!document.querySelector('.scrim, .pop, .sheet.is-open, .room, .toast.has-action, .key-tip');
  const away = () => {
    if (!tip) return;
    const el = tip;
    tip = null;
    el.inert = true;
    document.body.style.removeProperty('--key-tip-room');
    exit(el);
  };
  const answer = async (ask, yes, btn) => {
    btn?.setAttribute('aria-busy', 'true');
    try {
      const res = await api.post(`/api/keep/${ask.drawer.id}`, { answer: yes ? 'yes' : 'wave' });
      asks = asks.filter((a) => a !== ask);
      away();
      if (yes) {
        toast(`“${ask.drawer.title}” is in your galaxy now, shared with ${shortName(ask.from)}`, {
          action: { label: 'See it', run: () => nav.go(`/p/${ask.drawer.id}`) },
        });
        bus.emit('drawer:changed', res.drawer);
      }
      timer = setTimeout(show, BEAT.slow);
    } catch (err) {
      btn?.removeAttribute('aria-busy');
      toast(err.message);
    }
  };
  const show = () => {
    timer = 0;
    if (!here || tip || !asks.length) return;
    if (busy()) { timer = setTimeout(show, BEAT.slow); return; }
    const ask = asks[0];
    const yes = h('button', { type: 'button', class: 'btn btn-main btn-small' }, 'Yes, share it');
    const later = h('button', { type: 'button', class: 'btn btn-quiet btn-small' }, 'Not now');
    yes.onclick = () => answer(ask, true, yes);
    later.onclick = () => answer(ask, false, later);
    tip = h('div', { class: 'tip key-tip keep-tip', role: 'note' },
      h('p', { class: 'tip-title' }, `${shortName(ask.from)} wants to share “${ask.drawer.title}” with you`),
      h('p', { class: 'tip-text' }, 'A shared planet sits in both your galaxies, and you both add to it, arrange it and share it.'),
      h('div', { class: 'tip-btns' }, yes, later));
    document.body.append(tip);
    document.body.style.setProperty('--key-tip-room', `${tip.offsetHeight + 24}px`);
  };
  const fetchNow = async () => {
    if (Date.now() - fetchedAt < FRESH) return;
    asking ||= api.get('/api/keep').then((res) => {
      fetchedAt = Date.now();
      asks = res.asks || [];
      (res.news || []).forEach((n, i) => setTimeout(() => toast(NEWS[n.what]?.(n) || `“${n.title}” changed`, {
        action: { label: 'See it', run: () => nav.go(`/p/${n.drawer}`) },
      }), i * BEAT.slow));
    }).catch(() => {}).finally(() => { asking = null; });
    await asking;
  };
  return {
    // Live (live.js): someone asked, answered or left; ask again.
    refresh() {
      fetchedAt = 0;
      if (here) this.set(true);
    },
    // true while you're on your own galaxy (not out in the universe)
    async set(on) {
      here = on;
      if (!on) { clearTimeout(timer); timer = 0; away(); return; }
      if (!session.user) return;
      await fetchNow();
      if (here && !timer && !tip) timer = setTimeout(show, BEAT.slow);
    },
  };
}
