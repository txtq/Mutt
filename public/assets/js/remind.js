// Comets as reminders (DESIGN.md "Comets"): making a note a comet, dealing with one (Done,
// Snooze, Stop, Add to Calendar), asking a device to be told when one comes due (Web Push, with
// the service worker in /sw.js), and the notes under the clock that say a comet has come.
//
// A comet is always called a comet, and every place that offers or shows one says it reminds you.
// Small and loaded with the page: the sky's own drawing is comets.js, fetched only on your galaxy.

import { api, session } from './api.js';
import { nav } from './nav.js';
import { exit, openDialog, openMenu, toast } from './ui.js';
import { DUR, bus, h } from './util.js';
import { icon } from './icons.js';
import { sound } from './sound.js';

const HOUR = 3600000;
const DAY = 86400000;
const tz = () => -new Date().getTimezoneOffset();
const phone = matchMedia('(max-width: 720px)');

// ------------------------------------------------------------------ words

// What the note is for, without the day it names: "Dentist tomorrow 3pm" is "Dentist".
export function cometName(c) {
  const rest = c.said ? c.title.replace(c.said, ' ') : c.title;
  const name = rest.replace(/\s+(?:on|at|by|for|due|from)\s*$/i, '').replace(/\s+/g, ' ').replace(/^[\s,.:;–—-]+|[\s,.:;–—(-]+$/g, '').trim();
  return name.length > 1 ? name : c.title;
}

const clock = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: new Date(t).getMinutes() ? '2-digit' : undefined });

// "Thursday, 3 PM · in 3 days", "today, 3 PM", "tomorrow", "Sat, 5 Dec · in 19 days"
export function cometWhen(c, now = Date.now()) {
  const at = new Date(c.at);
  const day = new Date(at); day.setHours(0, 0, 0, 0);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const gap = Math.round((day - today) / DAY);
  const plus = c.time ? `, ${clock(c.at)}` : '';
  if (gap === 0) return `today${plus}`;
  if (gap === 1) return `tomorrow${plus}`;
  if (gap === -1) return `yesterday${plus}`;
  if (gap < 0) return `${-gap} days ago`;
  const name = gap < 7 ? at.toLocaleDateString(undefined, { weekday: 'long' }) : at.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${name}${plus} · in ${gap} days`;
}

// "in 50 minutes", "in 2 hours", "now", "2 hours ago"
function fromNow(t, now = Date.now()) {
  const m = Math.round((t - now) / 60000);
  if (Math.abs(m) < 2) return 'now';
  const say = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  const span = Math.abs(m) < 90 ? say(Math.abs(m), 'minute') : Math.abs(m) < 36 * 60 ? say(Math.round(Math.abs(m) / 60), 'hour') : say(Math.round(Math.abs(m) / 1440), 'day');
  return m > 0 ? `in ${span}` : `${span} ago`;
}

// ------------------------------------------------------------------ making and dealing with one

const changed = () => { bus.emit('comet:changed'); notes?.look(); };

// Make a note a comet. Asking the device to tell you comes first, in the same press (Safari asks only then).
// A caller that waits for something first (saving the note) calls tell() itself, in the press, and says `told`.
// `when` ({day, time}) is a day picked by hand, for a file whose words name none.
export async function makeComet(blockId, { quiet = false, told = false, when = null } = {}) {
  if (!told) tell();
  let c;
  try {
    ({ comet: c } = await api.post(`/api/blocks/${blockId}/comet`, { tz: tz(), ...(when || {}) }));
  } catch (err) {
    toast(err.message);
    return null;
  }
  changed();
  if (!quiet) {
    toast(`A comet will remind you ${cometWhen(c).split(' · ')[0]}`, {
      action: { label: 'Undo', run: async () => { await api.del(`/api/blocks/${blockId}/comet`).catch(() => {}); changed(); } },
    });
  }
  return c;
}

export async function stopComet(c) {
  try { await api.del(`/api/blocks/${c.id}/comet`); } catch (err) { toast(err.message); return; }
  changed();
  toast('No longer a comet: it won’t remind you', { action: { label: 'Undo', run: () => makeComet(c.id, { quiet: true }) } });
}

// done | snooze (for: hour, tomorrow) | close, each with an Undo but close.
export async function dealWith(c, act, span) {
  let after;
  try {
    ({ comet: after } = await api.post(`/api/blocks/${c.id}/comet/${act}`, span ? { for: span } : {}));
  } catch (err) { toast(err.message); return; }
  changed();
  if (act === 'close') return;
  const said = act === 'done' ? `${cometName(c)}: done` : `The comet will come back ${cometWhen(after).split(' · ')[0]}`;
  toast(said, { action: { label: 'Undo', run: async () => { await api.post(`/api/blocks/${c.id}/comet/back`, { comet: c }).catch(() => {}); changed(); } } });
}

export function calendarFile(c) {
  const a = h('a', { href: `/api/blocks/${c.id}/comet.ics`, download: '' });
  document.body.append(a);
  a.click();
  a.remove();
}

// The rows a comet's menu adds (the sky's comet, the note's view, a note under the clock).
export function cometRows(c, { open = true } = {}) {
  return [
    ...(open ? [{ label: 'Open note', icon: 'open', run: () => openComet(c) }] : []),
    ...(c.due || c.soon ? [{ label: 'Done', icon: 'check', run: () => dealWith(c, 'done') }] : []),
    { label: 'Remind me in an hour', icon: 'history', run: () => dealWith(c, 'snooze', 'hour') },
    { label: 'Remind me tomorrow', icon: 'date', run: () => dealWith(c, 'snooze', 'tomorrow') },
    { label: 'Add to Calendar', icon: 'download', run: () => calendarFile(c) },
    { label: 'Stop the comet', icon: 'close', run: () => stopComet(c) },
  ];
}

// "Make it a comet…" in any file's menu (actions.js): a comet already opens its own menu; a note that
// names a day becomes one at once; anything else asks when it should remind you.
export async function cometFor(anchor, block) {
  tell();
  let got;
  try {
    got = await api.get(`/api/blocks/${block.id}/comet?tz=${tz()}`);
  } catch (err) { toast(err.message); return; }
  if (got.comet) {
    openMenu(anchor, [{ heading: `A comet will remind you ${cometWhen(got.comet).split(' · ')[0]}` }, ...cometRows(got.comet, { open: false })], { align: 'end' });
  } else if (got.could) {
    makeComet(block.id, { told: true });
  } else {
    askWhen(block);
  }
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// The small box that asks when: a day (tomorrow to start) and, if wanted, a time.
function askWhen(block) {
  const today = new Date();
  const day = h('input', { class: 'field', type: 'date', min: iso(today), value: iso(new Date(today.getTime() + DAY)), 'aria-label': 'Day', required: true });
  const time = h('input', { class: 'field', type: 'time', 'aria-label': 'Time (if any)' });
  const go = h('button', { type: 'submit', class: 'btn btn-main' }, 'Make it a comet');
  const form = h('form', { class: 'cm-ask' },
    h('p', { class: 'dialog-text' }, 'Pick when it should remind you. Until then its comet crosses your sky.'),
    h('div', { class: 'cm-ask-fields' },
      h('label', { class: 'cm-ask-field' }, h('span', { class: 'liv-label' }, 'Day'), day),
      h('label', { class: 'cm-ask-field' }, h('span', { class: 'liv-label' }, 'Time'), time)),
    h('p', { class: 'cm-ask-note' }, 'With no time: 9 in the morning, with a heads-up the evening before.'),
    h('div', { class: 'dialog-actions' },
      h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => dialog.close() }, 'Cancel'), go));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!day.value) return;
    go.disabled = true;
    const c = await makeComet(block.id, { told: true, when: { day: day.value, time: time.value || null } });
    if (c) dialog.close();
    else go.disabled = false;
  });
  const dialog = openDialog({ title: 'Make it a comet', body: form });
}

export function openComet(c) {
  if (c.planet) nav.go(`/p/${c.planet}?b=${c.id}`);
  else nav.openBlock(c.id);
}

// ------------------------------------------------------------------ being told with Mutt closed

const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const iPhone = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const tipKey = () => `mutt:comet-home-tip:${session.user?.username}`;

// Ask once, in the press that made a comet: notifications, then a push subscription for this device.
export function tell() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    // An iPhone tells a web page only once it's on the Home Screen.
    if (iPhone() && !standalone()) {
      let shown = true;
      try { shown = !!localStorage.getItem(tipKey()); localStorage.setItem(tipKey(), '1'); } catch { /* ask again next time */ }
      if (!shown) setTimeout(() => toast('Comets remind you while Mutt is open. To be told when it’s closed, add Mutt to your Home Screen (Share, then Add to Home Screen).'), DUR.scene * 4);
    }
    return;
  }
  if (Notification.permission === 'denied') return;
  const asked = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
  asked.then((answer) => (answer === 'granted' ? subscribe() : null)).catch(() => {});
}

async function subscribe() {
  const { key } = await api.get('/api/push/key');
  if (!key) return;
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
  await api.post('/api/push', { endpoint: sub.endpoint });
}

// A device that said yes before keeps its subscription fresh (Safari can drop one).
async function refresh() {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try { await subscribe(); } catch { /* told while open, then */ }
}

// ------------------------------------------------------------------ the notes under the clock

// A comet that has come (or is an hour off) shows as a note under the clock on any page, over the
// comment notes, until it's dealt with: Done, or Later (in an hour, tomorrow). A heads-up can be closed.
let notes = null;

function cometNote(c, { onDone, onLater, onClose, onOpen }) {
  const now = Date.now();
  const open = h('button', { type: 'button', class: 'cn-open', onclick: onOpen },
    h('span', { class: 'cn-lead cm-lead' }, icon('date', 12)),
    h('span', { class: 'cn-text' },
      h('span', { class: 'cn-line' },
        h('span', { class: 'cn-what' }, h('span', { class: 'cn-file' }, cometName(c))),
        h('span', { class: 'cn-when' }, c.due ? fromNow(c.at, now) : fromNow(c.at, now))),
      h('span', { class: 'cn-said' }, c.due ? `A comet reminding you: ${cometWhen(c).split(' · ')[0]}` : `A comet’s heads-up: ${cometWhen(c).split(' · ')[0]}`)));
  const acts = h('div', { class: 'cm-acts' },
    h('button', { type: 'button', class: 'btn btn-small', onclick: onDone }, icon('check', 12), 'Done'),
    h('button', { type: 'button', class: 'btn btn-quiet btn-small', 'aria-haspopup': 'menu', onclick: onLater }, 'Later', icon('caret', 12)));
  const close = c.due ? null : h('button', {
    type: 'button', class: 'btn btn-quiet btn-round btn-small cn-x', 'aria-label': 'Close', title: 'Close', onclick: onClose,
  }, icon('close', 12));
  return h('div', { class: 'cn-note cm-note', role: 'alert' }, open, acts, close);
}

function cometNotes() {
  const host = h('div', { class: 'cn-notes cm-notes', role: 'region', 'aria-label': 'Comets reminding you' });
  const shown = new Map();
  let timer = 0;
  let asking = null;

  function sync(list) {
    const want = new Map(list.map((c) => [c.id, c]));
    for (const [id, el] of shown) {
      if (want.has(id) && want.get(id).due === el.comet.due) continue;
      shown.delete(id);
      exit(el);
    }
    let rang = false;   // one sound however many arrive (Mutt Sounds, when on)
    for (const c of list.slice(0, 3)) {
      if (shown.has(c.id)) continue;
      if (!rang) { rang = true; sound('news'); }
      const el = cometNote(c, {
        onOpen: () => openComet(c),
        onDone: () => dealWith(c, 'done'),
        onLater: (e) => openMenu(e.currentTarget, [
          { label: 'In an hour', icon: 'history', run: () => dealWith(c, 'snooze', 'hour') },
          { label: 'Tomorrow', icon: 'date', run: () => dealWith(c, 'snooze', 'tomorrow') },
        ]),
        onClose: () => dealWith(c, 'close'),
      });
      el.comet = c;
      shown.set(c.id, el);
      host.append(el);
      // told while the page is open but hidden, on a device not subscribed to pushes
      if (c.due && document.hidden && 'Notification' in window && Notification.permission === 'granted' && !navigator.serviceWorker?.controller) {
        try { new Notification(`Comet: ${cometName(c)}`, { body: `Reminding you: ${cometWhen(c).split(' · ')[0]}`, tag: `comet-${c.id}` }); } catch { /* the note shows */ }
      }
    }
    if (shown.size && !host.isConnected) document.body.append(host);
    document.body.classList.toggle('has-comet-note', shown.size > 0);
    // a phone's galaxy makes room under it, as it does for the comment notes
    requestAnimationFrame(() => {
      const live = [...shown.values()].filter((el) => el.isConnected && !el.classList.contains('is-leaving'));
      if (phone.matches && (live.length || had)) bus.emit('notes:room', live.reduce((t, el) => t + el.offsetHeight + 8, 0));
      had = live.length > 0;
    });
  }
  let had = false;

  async function look() {
    if (!session.user) return;
    asking ||= api.get('/api/comets').then(({ comets }) => {
      sync(comets.filter((c) => c.due || c.soon));
      // look again when the next heads-up or comet comes (and at least every few hours)
      const next = Math.min(...comets.filter((c) => !c.done).flatMap((c) => [c.ahead, c.at]).filter((t) => t > Date.now()), Date.now() + 6 * HOUR);
      clearTimeout(timer);
      timer = setTimeout(look, Math.max(DUR.scene, next - Date.now() + DUR.scene));
    }).catch(() => {}).finally(() => { asking = null; });
    return asking;
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) look(); });
  return { look };
}

// Started by main.js once someone is signed in.
export function startComets() {
  if (notes || !session.user) return;
  notes = cometNotes();
  notes.look();
  refresh();
}
