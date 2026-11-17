// Keeping a planet together, told on your own galaxy: someone asking you to
// keep one of their planets with them (a tip at the foot, one ask at a time),
// and news of a planet you keep with someone (they joined, left, changed who
// can see it, or their account is gone), each said once as a toast.
// Run by statusbar.js beside the recovery key's tip; small, loaded with it.

import { api, session } from './api.js';
import { nav } from './nav.js';
import { exit, toast } from './ui.js';
import { BEAT, bus, h, shortName } from './util.js';

const FRESH = 60000; // asked again on coming back to the galaxy after this long

const NEWS = {
  joined: (n) => `${n.by} now keeps “${n.title}” with you`,
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
        toast(`You keep “${ask.drawer.title}” with ${shortName(ask.from)} now`, {
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
    const yes = h('button', { type: 'button', class: 'btn btn-main btn-small' }, 'Keep it together');
    const later = h('button', { type: 'button', class: 'btn btn-quiet btn-small' }, 'Not now');
    yes.onclick = () => answer(ask, true, yes);
    later.onclick = () => answer(ask, false, later);
    tip = h('div', { class: 'tip key-tip keep-tip', role: 'note' },
      h('p', { class: 'tip-title' }, `${shortName(ask.from)} asks you to keep “${ask.drawer.title}” together`),
      h('p', { class: 'tip-text' }, 'It will be in both your galaxies, and you’ll both be able to add to it, arrange it and share it.'),
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
