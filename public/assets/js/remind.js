// Comets as reminders (DESIGN.md "Comets"): making a note a comet, dealing with one (Done,
// Snooze, Stop, Add to Calendar), asking a device to be told when one comes due (Web Push, with
// the service worker in /sw.js), and the notes under the clock that say a comet has come.
//
// A comet is always called a comet, and every place that offers or shows one says it reminds you.
// Small and loaded with the page: the sky's own drawing is comets.js, fetched only on your galaxy.

import { api, session } from './api.js';
import { nav } from './nav.js';
import { calendar, exit, openDialog, openMenu, openPopover, timeWheel, toast } from './ui.js';
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

// What a comet's file is: shown as that, never as a note when it isn't one (the user: "if a comet is a
// list item show it as a list item, not a note; same goes for other formats").
export function cometThing(c) {
  const things = {
    item: { noun: 'list item', icon: 'untick', open: c.list ? `Open ${c.list.title}` : 'Open list' },
    text: { noun: 'note', icon: 'note', open: 'Open note' },
    image: { noun: 'picture', icon: 'picture', open: 'Open picture' },
    video: { noun: 'video', icon: 'play', open: 'Open video' },
    audio: { noun: 'recording', icon: 'play', open: 'Open recording' },
    link: { noun: 'link', icon: 'link', open: 'Open link' },
    pdf: { noun: 'PDF', icon: 'page', open: 'Open PDF' },
    doc: { noun: 'document', icon: 'page', open: 'Open document' },
  };
  return things[c.kind] || { noun: 'file', icon: 'files', open: 'Open file' };
}

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
    ...(open ? [{ label: cometThing(c).open, icon: 'open', run: () => openWhole(c) }] : []),
    { label: 'Done', icon: 'check', run: () => dealWith(c, 'done') },
    { label: 'Change when…', icon: 'date', run: () => askWhen({ id: c.id, title: cometName(c) }, { comet: c }) },
    { label: 'Remind me in an hour', icon: 'history', run: () => dealWith(c, 'snooze', 'hour') },
    { label: 'Remind me tomorrow', icon: 'date', run: () => dealWith(c, 'snooze', 'tomorrow') },
    { label: 'Add to Calendar', icon: 'download', run: () => calendarFile(c) },
    { label: 'Stop the comet', icon: 'close', run: () => stopComet(c) },
  ];
}

// "Make it a comet…" in any file's menu (actions.js): a comet already opens its own menu; anything
// else opens the box that asks when, starting from what its words say.
export async function cometFor(anchor, block) {
  tell();
  let got;
  try {
    got = await api.get(`/api/blocks/${block.id}/comet?tz=${tz()}`);
  } catch (err) { toast(err.message); return; }
  if (got.comet && !got.comet.done) {
    openMenu(anchor, [{ heading: `A comet will remind you ${cometWhen(got.comet).split(' · ')[0]}` }, ...cometRows(got.comet, { open: false })], { align: 'end' });
  } else {
    askWhen(block, { could: got.could });
  }
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const atDay = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const hm = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: new Date(t).getMinutes() ? '2-digit' : undefined });

// The quick choices under the words: what the note says first, then the usual ones.
function picks(could) {
  const now = new Date();
  const out = [];
  if (could) out.push({ label: `“${could.said}”`, title: 'What it says', day: could.day, time: could.time || '' });
  const later = new Date(now.getTime() + 3 * HOUR);
  if (later.getDate() === now.getDate() && later.getHours() <= 21) {
    out.push({ label: 'Later today', day: iso(now), time: `${String(later.getHours()).padStart(2, '0')}:00` });
  }
  out.push({ label: 'Tomorrow', day: iso(atDay(1)), time: '' });
  const wd = now.getDay();   // 0 Sunday … 6 Saturday
  if (wd >= 1 && wd <= 5) out.push({ label: 'This weekend', day: iso(atDay(6 - wd)), time: '' });
  out.push({ label: 'Next week', day: iso(atDay(((8 - wd) % 7) || 7)), time: '' });
  // the note's own day first; a usual one that is the same day and time is left out
  return out.filter((p, i) => !out.slice(0, i).some((q) => q.day === p.day && q.time === p.time));
}

// When it will remind you, in words: "Friday 20 November at 5 PM, and an hour before."
function sayWhen(dayValue, timeValue) {
  if (!dayValue) return { gone: true, words: 'Pick a day.' };
  const [y, mo, d] = dayValue.split('-').map(Number);
  const [hh, mm] = (timeValue || '09:00').split(':').map(Number);
  const at = new Date(y, mo - 1, d, hh, mm);
  if (at.getTime() <= Date.now()) return { gone: true, words: 'That time has already gone. Pick a later one.' };
  const gap = Math.round((new Date(y, mo - 1, d) - atDay(0)) / DAY);
  const day = gap === 0 ? 'today' : gap === 1 ? 'tomorrow' : at.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const ahead = timeValue ? 'and an hour before' : 'and the evening before at 7 PM';
  return { gone: false, words: `It will remind you ${day} at ${hm(at)}, ${ahead}.` };
}

// The box that asks when (DESIGN.md "Comet: when"): quick choices (what the note says, pressed, first),
// a day and a time, and a line saying when it will remind you. With `comet`, it changes that one's day.
export function askWhen(block, { could = null, comet = null } = {}) {
  const choices = picks(comet ? null : could);
  const first = comet ? { day: comet.day, time: comet.time || '' } : choices[0];
  // The day on a calendar, the time on a wheel: nothing to type (the user: "make it easier to input
  // date and time without manually typing every digit"). With no time the wheel waits, faint; turning
  // it, or "Add a time", gives the comet one.
  let dayValue = first.day;
  let timeValue = first.time;
  const day = calendar({ value: dayValue, min: iso(new Date()), label: 'Day', onPick: (v) => { dayValue = v; update(); } });
  const time = timeWheel({ value: timeValue || '09:00', onChange: (v) => { timeValue = v; update(); } });
  const timeSwitch = h('button', { type: 'button', class: 'btn btn-quiet btn-small cm-ask-notime' });
  // With no time it reminds at 9 in the morning, so the faint wheel rests there too.
  timeSwitch.addEventListener('click', () => {
    if (timeValue) { timeValue = ''; time.set('09:00'); } else timeValue = time.value;
    update();
  });
  const note = h('p', { class: 'cm-ask-note', 'aria-live': 'polite' });
  const go = h('button', { type: 'submit', class: 'btn btn-main' }, comet ? 'Save' : 'Make it a comet');
  const buttons = choices.map((p) => {
    const b = h('button', { type: 'button', class: 'btn btn-small cm-ask-pick', title: p.title || null }, p.label);
    b.addEventListener('click', () => {
      dayValue = p.day;
      timeValue = p.time;
      day.set(p.day);
      if (p.time) time.set(p.time);
      update();
    });
    return [p, b];
  });
  const update = () => {
    for (const [p, b] of buttons) b.setAttribute('aria-pressed', String(p.day === dayValue && p.time === timeValue));
    time.off(!timeValue);
    timeSwitch.textContent = timeValue ? 'No time' : 'Add a time';
    const said = sayWhen(dayValue, timeValue);
    note.textContent = said.words;
    note.classList.toggle('is-gone', said.gone);
    go.disabled = said.gone;
  };
  const name = (block.title || block.content || block.fileName || '').trim().split('\n')[0].slice(0, 60);
  const form = h('form', { class: 'cm-ask' },
    h('p', { class: 'dialog-text' }, name ? `A comet will remind you of “${name}”. Until then it crosses your sky.` : 'A comet will remind you. Until then it crosses your sky.'),
    comet ? null : h('div', { class: 'cm-ask-picks', role: 'group', 'aria-label': 'Quick choices' }, ...buttons.map(([, b]) => b)),
    h('div', { class: 'cm-ask-fields' },
      h('div', { class: 'cm-ask-field cm-ask-day' }, h('div', { class: 'cm-ask-head' }, h('span', { class: 'liv-label' }, 'Day')), day.el),
      h('div', { class: 'cm-ask-field cm-ask-time' },
        h('div', { class: 'cm-ask-head' }, h('span', { class: 'liv-label' }, 'Time'), timeSwitch), time.el)),
    note,
    h('div', { class: 'dialog-actions' },
      h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => dialog.close() }, 'Cancel'), go));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!dayValue || go.disabled) return;
    go.disabled = true;
    const when = { day: dayValue, time: timeValue || null };
    const c = await makeComet(block.id, { told: true, when, quiet: !!comet });
    if (!c) { go.disabled = false; return; }
    dialog.close();
    if (comet) {
      toast(`The comet will remind you ${cometWhen(c).split(' · ')[0]}`, {
        action: { label: 'Undo', run: async () => { await makeComet(comet.id, { told: true, quiet: true, when: { day: comet.day, time: comet.time } }); } },
      });
    }
  });
  const dialog = openDialog({ title: comet ? 'Change when it reminds you' : 'Make it a comet', body: form, className: 'dialog-wide' });
  update();
}

// A comet opens where you are (over your sky), not on its planet, as what it is: a list item as a small
// card with its tick box (ticking it is Done), anything else in the file view with its comet row.
export function openComet(c, anchor = null) {
  if (c.kind === 'item' && anchor) cometCard(anchor, c);
  else openWhole(c);
}

// The whole thing: a list item on its list, anything else in the file view where you are.
function openWhole(c) {
  if (c.kind === 'item' && c.list) nav.go(`/p/${c.list.id}`);
  else nav.openBlock(c.id);
}

// A list item's comet, as the item: its tick box and words, its list, when it reminds you, and what to do.
export function cometCard(anchor, c) {
  const when = cometWhen(c).split(' · ')[0];
  const tick = h('button', { type: 'button', class: 'cm-card-tick', role: 'checkbox', 'aria-checked': 'false', 'aria-label': `Tick off ${c.title}` }, h('span', { class: 'tick-box' }));
  tick.addEventListener('click', () => {
    tick.setAttribute('aria-checked', 'true');
    sound('tick');
    dealWith(c, 'done');
    setTimeout(() => pop.close(), DUR.move);
  });
  const later = h('button', { type: 'button', class: 'btn btn-small', 'aria-haspopup': 'menu' }, 'Later', icon('caret', 12));
  later.addEventListener('click', () => openMenu(later, [
    { label: 'In an hour', icon: 'history', run: () => dealWith(c, 'snooze', 'hour') },
    { label: 'Tomorrow', icon: 'date', run: () => dealWith(c, 'snooze', 'tomorrow') },
  ]));
  const more = h('button', { type: 'button', class: 'btn btn-quiet btn-small btn-round', 'aria-label': 'More', title: 'More', 'aria-haspopup': 'menu' }, icon('more'));
  more.addEventListener('click', () => openMenu(more, cometRows(c), { align: 'end' }));
  const body = h('div', { class: 'cm-card' },
    h('div', { class: 'cm-card-row' }, tick, h('span', { class: 'cm-card-text' }, c.title)),
    h('div', { class: 'cm-card-meta' },
      h('span', { class: 'cm-card-when' }, icon('date', 12), when),
      c.list ? h('span', { class: 'cm-card-on' }, icon('planet', 12), c.list.title) : null),
    h('div', { class: 'cm-card-acts' },
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => { pop.close(); askWhen({ id: c.id, title: c.title }, { comet: c }); } }, 'Change when…'),
      later, more));
  const pop = openPopover(anchor, body, { className: 'pop-panel cm-card-pop' });
  if (anchor.matches?.(':focus-visible')) tick.focus({ preventScroll: true });   // from the keyboard: straight to the tick box
  return pop;
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
      h('span', { class: 'cn-said' }, `${c.due ? 'A comet reminding you' : 'A comet’s heads-up'}: ${cometWhen(c).split(' · ')[0]}${c.kind === 'item' && c.list ? `, on ${c.list.title}` : ''}`)));
  const acts = h('div', { class: 'cm-acts' },
    c.kind === 'item'
      ? h('button', { type: 'button', class: 'btn btn-small', onclick: onDone }, icon('tick', 12), 'Tick off')
      : h('button', { type: 'button', class: 'btn btn-small', onclick: onDone }, icon('check', 12), 'Done'),
    h('button', { type: 'button', class: 'btn btn-quiet btn-small', 'aria-haspopup': 'menu', onclick: onLater }, 'Later', icon('caret', 12)));
  // every note can be closed (the user: "you should be able to dismiss the comet nudge"); a due comet
  // still waits in the sky until it is done
  const close = h('button', {
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
        onOpen: (e) => openComet(c, e.currentTarget),
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
  // Live (live.js): a comet came due, or one changed on another device.
  bus.on('live', ({ t }) => { if (t === 'comets' || t === 'again') notes.look(); });
  notes.look();
  refresh();
}
