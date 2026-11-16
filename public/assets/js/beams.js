// Beaming out and beaming in (DESIGN.md "Beaming"): sending one of your files
// to someone, and the files beamed to you.
//   beamTo(block)    the file menu's "Beam to…": pick someone, a few words, Beam; it travels across
//                    the universe to them (beamJourney in views/galaxy.js, flyLight here), then Undo
//                    `form` is how it was shown where it was beamed from ('recipe', 'document'), and it arrives so
//   beamPile(page)   on your own galaxy, what waits for you rests by the void, a pile per sender
//                    (from someone you never crossed paths with: one quiet pile, no ring)
//   openBeams(id)    the box that shows what came: Keep (a star), Put on a planet, or Let go
//   stoppedPeople()  the account sheet's list of people whose beams you stopped
// A beamed file stays its sender's until you answer, and they are never told which.
// Fetched only when one of these is wanted (a file menu's row, a galaxy with something waiting).

import { api, session } from './api.js';
import { nav } from './nav.js';
import { confirmDialog, exit, openDialog, openPopover, toast } from './ui.js';
import { BEAT, DUR, EASE_GLIDE, EASE_LEAVE, STAGGER, bus, covered, h, nameColor, plural, reducedMotion, seeded, shortName, styles, timeAgo } from './util.js';
import { icon } from './icons.js';
import { renderCell } from './cells.js';
import { displayTitle } from './kinds.js';
import { fileFace, planetDot } from './planets.js';
import { beamJourney } from './views/galaxy.js';
import { dustFrame } from './uvweb.js';

const WORDS = 140;

const fileName = (block) => {
  const title = displayTitle(block);
  if (title) return title;
  const words = (block.content || '').trim().replace(/\s+/g, ' ');
  return words ? (words.length > 32 ? `${words.slice(0, 30)}…` : words) : 'this file';
};

// ------------------------------------------------------------------ beaming out

export function beamTo(block, { form = null } = {}) {
  const input = h('input', {
    class: 'field', type: 'text', placeholder: 'Find someone', 'aria-label': 'Find someone',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
  });
  const list = h('div', { class: 'pp-list bm-people', role: 'listbox', 'aria-label': 'People' });
  const note = h('p', { class: 'pp-note' });
  const words = h('textarea', {
    class: 'field bm-words', rows: 2, maxlength: WORDS, placeholder: 'A few words, if you like', 'aria-label': 'A few words',
  });
  const send = h('button', { type: 'button', class: 'btn btn-main', disabled: true }, 'Beam');
  const cancel = h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => dialog.close() }, 'Cancel');
  let people = [];
  let chosen = null;
  let asked = 0;
  let timer = 0;

  const paint = () => {
    list.replaceChildren(...people.map((p) => h('button', {
      type: 'button', class: `pp-row${chosen?.username === p.username ? ' is-on' : ''}`, role: 'option',
      'aria-selected': String(chosen?.username === p.username),
      onclick: () => { chosen = p; paint(); words.focus({ preventScroll: true }); },
    },
    h('span', { class: 'pp-dot', style: { '--c': nameColor(p.username) } }),
    h('span', { class: 'pp-name' }, p.name ? [p.name, h('span', { class: 'bm-handle' }, ` @${p.username}`)] : `@${p.username}`),
    h('span', { class: 'tick-box', 'aria-hidden': 'true' }))));
    list.hidden = !people.length;
    const q = input.value.trim();
    note.textContent = people.length ? '' : q ? `No one here is called ${q}.` : 'No one else is here yet.';
    note.hidden = !note.textContent;
    send.disabled = !chosen;
    send.textContent = chosen ? `Beam to ${shortName(chosen)}` : 'Beam';
  };
  const find = async () => {
    const ask = ++asked;
    const q = input.value.trim();
    try {
      const res = await api.get(`/api/beam/people${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      if (ask !== asked) return;
      people = res.people || [];
      if (chosen && !people.some((p) => p.username === chosen.username)) people.unshift(chosen);
    } catch (err) {
      if (ask === asked) { people = []; note.textContent = err.message; }
    }
    paint();
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(find, DUR.quick); });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (people[0]) { chosen = people[0]; paint(); words.focus(); }
  });
  words.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && chosen) { e.preventDefault(); send.click(); }
  });
  send.addEventListener('click', async () => {
    if (!chosen) return;
    send.disabled = true;
    send.setAttribute('aria-busy', 'true');
    try {
      const res = await api.post(`/api/blocks/${block.id}/beam`, { to: chosen.username, words: words.value.trim(), ...(form ? { form } : {}) });
      dialog.close();
      // across the universe first; the toast (and its Undo) once it has landed
      await beamJourney(res.beam.to.username);
      toast(`Beamed to ${shortName(res.beam.to)}`, {
        action: {
          label: 'Undo',
          run: async () => {
            await api.del(`/api/beams/${res.beam.id}`);
            toast('Taken back');
          },
        },
      });
    } catch (err) {
      send.disabled = false;
      send.removeAttribute('aria-busy');
      toast(err.message);
    }
  });

  const body = h('div', { class: 'bm-out' },
    h('p', { class: 'dialog-text' }, `It waits for them until they keep it or let it go.`),
    input, list, note, words,
    h('div', { class: 'dialog-actions' }, cancel, send));
  const dialog = openDialog({ title: `Beam “${fileName(block)}” to…`, body, className: 'bm-dialog' });
  paint();
  find();
  requestAnimationFrame(() => input.focus());
}

// ------------------------------------------------------------------ the light on its way

// A beam on its way, on screen from `a` to `b` (DESIGN.md "Beaming"): a small bright point with a
// short trail of dust behind it, bending a little as the web's threads do, over --dur-grand on the
// glide; where it lands the drop ring plays once (`ring`, its radius; false when the caller lands it,
// as a pile does). The caller doesn't ask under Still.
const TRAIL = 10;
export function flyLight(a, b, { ring = 0 } = {}) {
  const layer = h('div', { class: 'bm-flight', 'aria-hidden': 'true' });
  document.body.append(layer);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(len * 0.16, 140);
  const c = { x: (a.x + b.x) / 2 - (dy / len) * bend, y: (a.y + b.y) / 2 + (dx / len) * bend };
  const path = (size, fade) => Array.from({ length: 17 }, (_, n) => {
    const t = n / 16;
    const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x;
    const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y;
    return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${size})`, opacity: n === 0 || (fade && n === 16) ? 0 : 1 };
  });
  const parts = [];
  for (let i = 0; i <= TRAIL; i++) {
    const dot = h('span', { class: i ? 'bm-trail' : 'bm-light' });
    layer.append(dot);
    parts.push(dot.animate(path(i ? 1 - i / (TRAIL + 3) : 1, i > 0), { duration: DUR.grand, delay: i * STAGGER, easing: EASE_GLIDE, fill: 'both' }));
  }
  // the head goes into what it reached as the rest of the trail catches up
  const head = parts[0].finished.then(() => {
    layer.firstChild.animate([{ opacity: 1 }, { opacity: 0, transform: `translate(${b.x}px, ${b.y}px) scale(0.3)` }],
      { duration: DUR.change, easing: EASE_LEAVE, fill: 'forwards' });
    if (ring === false) return null;
    layer.append(h('span', { class: 'bm-landing', style: { left: `${b.x}px`, top: `${b.y}px`, '--r': `${Math.max(ring, 22).toFixed(1)}px` } }));
    return new Promise((resolve) => setTimeout(resolve, DUR.scene));
  });
  return Promise.all([head, ...parts.map((p) => p.finished)]).catch(() => null).finally(() => layer.remove());
}

// ------------------------------------------------------------------ beaming in

let waiting = null;   // what was last fetched: [{id, block, from, words, sentAt, quiet, noted}]
const changed = new Set();

export async function fetchBeams() {
  try {
    waiting = (await api.get('/api/beams')).beams || [];
  } catch {
    waiting ||= [];
  }
  changed.forEach((fn) => fn(waiting));
  return waiting;
}

const forget = (id) => {
  waiting = (waiting || []).filter((b) => b.id !== id);
  changed.forEach((fn) => fn(waiting));
  bus.emit('beam:answered', id);   // its note under the clock goes too (commentnotes.js)
};

// The piles by the void: one per person you know, newest sender first, and
// one quiet pile for everyone else.
function piles(list) {
  const known = new Map();
  const quiet = [];
  for (const b of list) {
    if (b.quiet) { quiet.push(b); continue; }
    if (!known.has(b.from.username)) known.set(b.from.username, []);
    known.get(b.from.username).push(b);
  }
  const out = [...known.values()].sort((a, b) => b.at(-1).sentAt - a.at(-1).sentAt).map((beams) => ({ beams, quiet: false }));
  if (quiet.length) out.push({ beams: quiet, quiet: true });
  return out;
}

export function beamPile(page) {
  const host = h('div', { class: 'bm-piles', role: 'group', 'aria-label': 'Beamed to you' });
  page.coreWrap.append(host);
  let m = null;
  // Each beam comes in once on this device (`mutt:beams-landed:<username>`): a light from the
  // direction of its sender's galaxy in the universe crosses the sky to its pile, which lands with
  // the drop ring. Under Still the pile is simply there.
  const key = `mutt:beams-landed:${session.user?.username}`;
  let landed;
  try { landed = new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { landed = new Set(); }
  const remember = (beams) => {
    beams.forEach((b) => landed.add(b.id));
    try { localStorage.setItem(key, JSON.stringify([...landed].slice(-300))); } catch { /* kept for this visit only */ }
  };
  const visible = () => page.live && page.p < 0.02 && !document.hidden && !covered();
  const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const comeIn = async (el) => {
    if (el.coming) return;
    el.coming = true;
    el.classList.add('is-coming');
    const lands = () => {
      remember(el.pile.beams);
      el.coming = false;
      el.classList.remove('is-coming', 'is-new');
      void el.offsetWidth;   // so the ring plays again for a second beam from the same person
      el.classList.add('is-new');
    };
    if (reducedMotion()) { lands(); return; }
    await new Promise((resolve) => setTimeout(resolve, DUR.grand));   // once the page itself has arrived
    for (let n = 0; n < 8 && el.isConnected && !visible(); n++) await new Promise((resolve) => setTimeout(resolve, BEAT.slow));
    if (!el.isConnected) return;
    const dir = visible() ? await page.towards(el.pile.beams.at(-1).from.username).catch(() => null) : null;
    if (dir && visible() && el.isConnected) {
      // from just past the edge of the screen, the way their galaxy lies from yours
      const v = centre(host);
      const reach = (d, at, size) => (d > 0.001 ? (size - at) / d : d < -0.001 ? -at / d : Infinity);
      const far = Math.min(reach(dir.x, v.x, innerWidth), reach(dir.y, v.y, innerHeight)) + 24;
      await flyLight({ x: v.x + dir.x * far, y: v.y + dir.y * far }, centre(el), { ring: false });
    }
    if (el.isConnected) lands();
  };
  const paint = (list) => {
    const old = new Map([...host.children].map((el) => [el.dataset.key, el]));
    const next = piles(list).map((pile) => {
      const first = pile.beams[0];
      const name = pile.quiet ? 'quiet' : first.from.username;
      const count = pile.beams.length;
      const label = pile.quiet
        ? `${plural(count, 'file')} beamed to you by ${new Set(pile.beams.map((b) => b.from.username)).size > 1 ? 'people' : 'someone'} you haven’t met here`
        : `${shortName(first.from)} beamed you ${count > 1 ? plural(count, 'file') : fileName(first.block)}`;
      let el = old.get(name);
      old.delete(name);
      if (!el) {
        el = h('button', { type: 'button', class: `bm-star${pile.quiet ? ' is-quiet' : ''}`, dataset: { key: name } });
        el.addEventListener('click', () => openBeams(el.pile.beams[0].id, el.pile.beams));
      }
      el.pile = pile;
      if (pile.quiet) remember(pile.beams);   // a quiet pile never comes in with a light
      else if (pile.beams.some((b) => !landed.has(b.id))) comeIn(el);
      el.setAttribute('aria-label', label);
      el.title = label;
      el.replaceChildren(
        h('span', { class: 'bm-face' }, fileFace(first.block)),
        count > 1 ? h('span', { class: 'bm-count' }, String(count)) : null,
        h('span', { class: 'bm-tag' }, pile.quiet ? 'waiting quietly' : `from ${shortName(first.from)}`));
      return el;
    });
    for (const el of old.values()) exit(el);
    host.append(...next);
    place(m);
  };
  // Just outside the void, where the stars begin (starSpots in views/galaxy.js), up and to
  // the right; the next one a little further round.
  const place = (metrics) => {
    m = metrics || m;
    if (!m) return;
    const r = m.hole * 2.75 + (m.chip || 38) / 2;
    const live = [...host.children].filter((el) => !el.classList.contains('is-leaving'));
    live.forEach((el, i) => {
      // On a phone the ring's planets sit above and beside the void, so they rest in a row below it.
      if (m.narrow) {
        el.style.transform = `translate(${((i - (live.length - 1) / 2) * 116).toFixed(1)}px, ${r.toFixed(1)}px)`;
        return;
      }
      const a = (-62 + i * 24) * Math.PI / 180;
      el.style.transform = `translate(${(Math.cos(a) * r).toFixed(1)}px, ${(Math.sin(a) * r).toFixed(1)}px)`;
    });
  };
  changed.add(paint);
  fetchBeams();
  return {
    place,
    refresh: fetchBeams,
    destroy() { changed.delete(paint); host.remove(); },
  };
}

// What came, as it was sent: a recipe card as the cookbook shows it, a document as its first page
// (each fetched only for one of those), anything else in the file box.
function sentAs(b) {
  if (b.card) {
    const holder = h('div', { class: 'bm-card' });
    import('./cookbook.js').then((m) => holder.replaceChildren(m.recipeCard(b.card)));
    return holder;
  }
  if (b.page) {
    const holder = h('div', { class: 'bm-page' });
    Promise.all([import('./docs.js'), styles('docs.css')]).then(([m]) => {
      const paper = m.docPaper(b.block, b.page);
      holder.replaceChildren(paper, h('span', { class: 'bm-page-words' }, plural(b.page.words, 'word')));
      requestAnimationFrame(() => m.fitPaper(holder, paper));
    });
    return holder;
  }
  return renderCell({ ...b.block, mine: true, owner: null, sharedAt: null, alsoOn: [] }, { actions: false });
}

// The box that shows what came, one file at a time: `group` is the pile it was
// opened from (everything from one person), else everything waiting.
export async function openBeams(id, group) {
  if (!group) {
    const list = waiting || await fetchBeams();
    const one = list.find((b) => b.id === id);
    if (!one) { toast('That file is no longer waiting'); return; }
    group = one.quiet ? list.filter((b) => b.quiet) : list.filter((b) => !b.quiet && b.from.username === one.from.username);
  }
  let queue = group.slice();
  let at = Math.max(0, queue.findIndex((b) => b.id === id));
  const head = h('div', { class: 'bm-head' });
  // from someone you never crossed paths with: said once, plainly
  const quietNote = h('p', { class: 'bm-quiet' }, 'You haven’t crossed paths here before. If you leave it, it goes in a month.');
  const file = h('div', { class: 'bm-file' });
  const said = h('p', { class: 'bm-said' });
  const step = h('span', { class: 'bm-step' });
  const keep = h('button', { type: 'button', class: 'btn btn-main' }, 'Keep');
  const onto = h('button', { type: 'button', class: 'btn' }, icon('move'), 'Put on a planet');
  const letGo = h('button', { type: 'button', class: 'btn btn-quiet' }, 'Let go');
  const stop = h('button', { type: 'button', class: 'btn btn-quiet btn-small bm-stop' });
  const prev = h('button', { type: 'button', class: 'btn btn-quiet btn-round btn-small', 'aria-label': 'Previous', title: 'Previous' }, icon('chevron-left', 12));
  const next = h('button', { type: 'button', class: 'btn btn-quiet btn-round btn-small', 'aria-label': 'Next', title: 'Next' }, icon('chevron-right', 12));
  const nav2 = h('div', { class: 'bm-nav' }, prev, step, next);

  const now = () => queue[at];
  const paint = () => {
    const b = now();
    if (!b) { dialog.close(); return; }
    const who = shortName(b.from);
    head.replaceChildren(
      h('span', { class: 'bm-lead', style: { '--who': nameColor(b.from.username) } }, icon('beam', 12)),
      h('span', null, h('b', null, who), ' beamed you a file'),
      h('time', { class: 'bm-when', datetime: new Date(b.sentAt).toISOString() }, timeAgo(b.sentAt)));
    quietNote.hidden = !b.quiet;
    file.replaceChildren(sentAs(b));
    said.textContent = b.words ? `“${b.words}”` : '';
    said.hidden = !b.words;
    nav2.hidden = queue.length < 2;
    step.textContent = `${at + 1} of ${queue.length}`;
    prev.disabled = at === 0;
    next.disabled = at === queue.length - 1;
    stop.textContent = `Stop beams from ${who}`;
    [keep, onto, letGo].forEach((btn) => { btn.disabled = false; btn.removeAttribute('aria-busy'); });
  };
  // One answered: it leaves the pile and the next one shows.
  const answered = (b) => {
    queue = queue.filter((x) => x !== b);
    forget(b.id);
    if (at >= queue.length) at = queue.length - 1;
    paint();
  };
  const busy = (btn) => { [keep, onto, letGo].forEach((x) => { x.disabled = true; }); btn.setAttribute('aria-busy', 'true'); };
  const answer = async (btn, body) => {
    const b = now();
    busy(btn);
    try {
      const res = await api.post(`/api/beams/${b.id}`, body);
      answered(b);
      return res;
    } catch (err) {
      toast(err.message);
      paint();
      return null;
    }
  };

  keep.addEventListener('click', async () => {
    const res = await answer(keep, { answer: 'keep' });
    if (!res) return;
    bus.emit('drawer:changed', null);
    toast('Kept as a star in your galaxy', { action: { label: 'Open', run: () => nav.openBlock(res.block.id) } });
  });
  onto.addEventListener('click', () => pickPlanet(onto, async (planet) => {
    const res = await answer(onto, { answer: 'keep', drawer: planet.id });
    if (!res) return;
    bus.emit('block:connected', { block: res.block, drawerId: planet.id, connections: res.connections });
    bus.emit('drawer:changed', null);
    toast(`Put on ${planet.title}`, { action: { label: 'See it', run: () => nav.go(`/p/${planet.id}?b=${res.block.id}`) } });
  }));
  letGo.addEventListener('click', async () => {
    const b = now();
    const res = await answer(letGo, { answer: 'gone' });
    if (!res) return;
    toast('Let go', {
      action: {
        label: 'Undo',
        run: async () => {
          await api.post(`/api/beams/${b.id}/undo`);
          await fetchBeams();
        },
      },
    });
  });
  stop.addEventListener('click', async () => {
    const b = now();
    const who = shortName(b.from);
    const ok = await confirmDialog({
      title: `Stop beams from ${who}?`,
      message: `Nothing ${who} beams you will reach you, and what’s waiting from them goes. They aren’t told. You can let them beam you again from your account.`,
      confirm: 'Stop beams',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post('/api/beam-stops', { username: b.from.username });
      if (session.user) session.user.beamStops = (session.user.beamStops || 0) + 1;
      queue = queue.filter((x) => x.from.username !== b.from.username);
      at = Math.min(at, queue.length - 1);
      await fetchBeams();
      paint();
      toast(`${who} can’t beam you any more`);
    } catch (err) {
      toast(err.message);
    }
  });
  prev.addEventListener('click', () => { at = Math.max(0, at - 1); paint(); });
  next.addEventListener('click', () => { at = Math.min(queue.length - 1, at + 1); paint(); });

  const body = h('div', { class: 'bm-in' },
    head, quietNote, file, said, nav2,
    h('div', { class: 'dialog-actions bm-actions' }, letGo, onto, keep),
    h('div', { class: 'bm-foot' }, stop));
  let unframe = null;
  const dialog = openDialog({ body, className: 'bm-dialog bm-dialog-in', onClose: () => unframe?.() });
  dialog.el.setAttribute('aria-label', 'Beamed to you');
  unframe = dustBorder(dialog.el);
  paint();
  requestAnimationFrame(() => keep.focus());
}

// The box's border of dust (DESIGN.md "Kept together and beaming"): the drop ring's print laid
// round its rounded edge (`dustFrame` in uvweb.js) and dotted by the same tile, made for the box's
// size and made again when that changes (another file, the phone turning). It sits in the scrim
// beside the box, so it stays put if the box scrolls. Nothing shows until the dust is in (`has-dust`).
const ROOM = 14;   // round the box, for the strands to wander out into
function dustBorder(card) {
  const edge = h('span', { class: 'bm-frame', 'aria-hidden': 'true' });
  card.after(edge);
  let url = null;
  let size = '';
  const place = () => Object.assign(edge.style, {
    left: `${card.offsetLeft - ROOM}px`, top: `${card.offsetTop - ROOM}px`,
    width: `${card.offsetWidth + ROOM * 2}px`, height: `${card.offsetHeight + ROOM * 2}px`,
  });
  const paint = () => {
    const w = card.offsetWidth;
    const hgt = card.offsetHeight;
    place();
    if (!w || `${w}×${hgt}` === size) return;
    size = `${w}×${hgt}`;
    const canvas = document.createElement('canvas');
    canvas.width = w + ROOM * 2;
    canvas.height = hgt + ROOM * 2;
    const ctx = canvas.getContext('2d');
    const r = parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0;
    dustFrame((x, y, b) => {
      ctx.globalAlpha = Math.min(1, b * 0.85);
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }, seeded('beam-frame'), { x: ROOM, y: ROOM, w, h: hgt, r }, { strands: 3, width: 2.4, spread: 7, haze: 1.2 });
    canvas.toBlob((blob) => {
      if (!blob || !edge.isConnected) return;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      edge.style.setProperty('--dust-frame', `url(${url})`);
    });
  };
  const watch = new ResizeObserver(paint);
  watch.observe(card);
  addEventListener('resize', place);
  return () => {
    watch.disconnect();
    removeEventListener('resize', place);
    setTimeout(() => { if (url) URL.revokeObjectURL(url); }, DUR.change);
  };
}

// Your planets (and those you keep with someone), to put a beamed file straight on one.
async function pickPlanet(anchor, pick) {
  const input = h('input', { class: 'field cx-input', type: 'text', placeholder: 'Find a planet', 'aria-label': 'Find a planet' });
  const list = h('div', { class: 'cx-list' }, h('div', { class: 'cx-note' }, '…'));
  const pop = openPopover(anchor, h('div', { class: 'cx' },
    h('div', { class: 'cx-head' }, h('span', null, 'Put it on')), input, list), { width: 300, className: 'pop-cx' });
  requestAnimationFrame(() => input.focus());
  let drawers = [];
  try {
    drawers = (await api.get('/api/drawers?lite=1')).drawers;
  } catch (err) {
    list.replaceChildren(h('div', { class: 'cx-note' }, err.message));
    return;
  }
  const render = () => {
    const q = input.value.trim().toLowerCase();
    const rows = drawers.filter((d) => !q || d.title.toLowerCase().includes(q)).map((d) => h('button', {
      type: 'button', class: 'cx-row', onclick: () => { pop.close(); pick(d); },
    }, planetDot(d), h('span', { class: 'cx-title' }, d.title), h('span', { class: 'cx-count' }, d.count ?? '')));
    list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'cx-note' }, drawers.length ? 'No planet by that name' : 'You have no planets yet')]));
    pop.place();
  };
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') list.querySelector('.cx-row')?.click(); });
  render();
}

// ------------------------------------------------------------------ stopped people

// The account sheet's page: whose beams you stopped, each with "Let them beam".
export function stoppedPeople() {
  const body = h('div', { class: 'bm-stops' }, h('p', { class: 'pp-note' }, 'Loading…'));
  const paint = (people) => {
    if (!people.length) {
      body.replaceChildren(h('p', { class: 'sheet-note' }, 'No one. Anyone can beam you a file.'));
      return;
    }
    body.replaceChildren(
      h('p', { class: 'sheet-note' }, 'Files they beam you don’t reach you. They aren’t told.'),
      ...people.map((p) => {
        const again = h('button', { type: 'button', class: 'btn btn-quiet btn-small' }, 'Let them beam');
        again.addEventListener('click', async () => {
          again.setAttribute('aria-busy', 'true');
          try {
            await api.del(`/api/beam-stops/${encodeURIComponent(p.username)}`);
            if (session.user) session.user.beamStops = Math.max(0, (session.user.beamStops || 1) - 1);
            paint(people = people.filter((x) => x !== p));
          } catch (err) {
            again.removeAttribute('aria-busy');
            toast(err.message);
          }
        });
        return h('div', { class: 'bm-stop-row' },
          h('span', { class: 'pp-dot', style: { '--c': nameColor(p.username) } }),
          h('span', { class: 'pp-name' }, p.name ? [p.name, h('span', { class: 'bm-handle' }, ` @${p.username}`)] : `@${p.username}`),
          again);
      }));
  };
  let people = [];
  api.get('/api/beam-stops').then((res) => paint(people = res.people || [])).catch((err) => {
    body.replaceChildren(h('p', { class: 'sheet-note' }, err.message));
  });
  return body;
}
