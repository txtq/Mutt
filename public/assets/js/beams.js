// Beaming out and beaming in (DESIGN.md "Beaming"): sending one of your files
// to someone, and the files beamed to you.
//   beamTo(block)    the file menu's "Beam to…": pick someone, a few words, Beam (with Undo)
//   beamPile(page)   on your own galaxy, what waits for you rests by the void, a pile per sender
//                    (from someone you never crossed paths with: one quiet pile, no ring)
//   openBeams(id)    the box that shows what came: Keep (a star), Put on a planet, or Let go
//   stoppedPeople()  the account sheet's list of people whose beams you stopped
// A beamed file stays its sender's until you answer, and they are never told which.
// Fetched only when one of these is wanted (a file menu's row, a galaxy with something waiting).

import { api, session } from './api.js';
import { nav } from './nav.js';
import { confirmDialog, exit, openDialog, openPopover, toast } from './ui.js';
import { DUR, bus, h, nameColor, plural, shortName, timeAgo } from './util.js';
import { icon } from './icons.js';
import { renderCell } from './cells.js';
import { displayTitle } from './kinds.js';
import { fileFace, planetDot } from './planets.js';

const WORDS = 140;

const fileName = (block) => {
  const title = displayTitle(block);
  if (title) return title;
  const words = (block.content || '').trim().replace(/\s+/g, ' ');
  return words ? (words.length > 32 ? `${words.slice(0, 30)}…` : words) : 'this file';
};

// ------------------------------------------------------------------ beaming out

export function beamTo(block) {
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
    note.textContent = people.length ? '' : q ? `No one here is called ${q}.` : 'Type a name to find someone.';
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
      const res = await api.post(`/api/blocks/${block.id}/beam`, { to: chosen.username, words: words.value.trim() });
      dialog.close();
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
  const seen = new Set();   // piles already shown this visit: only a new one wears the ring
  let m = null;
  const paint = (list) => {
    const old = new Map([...host.children].map((el) => [el.dataset.key, el]));
    const next = piles(list).map((pile) => {
      const first = pile.beams[0];
      const key = pile.quiet ? 'quiet' : first.from.username;
      const count = pile.beams.length;
      const label = pile.quiet
        ? `${plural(count, 'file')} beamed to you by ${new Set(pile.beams.map((b) => b.from.username)).size > 1 ? 'people' : 'someone'} you haven’t met here`
        : `${shortName(first.from)} beamed you ${count > 1 ? plural(count, 'file') : fileName(first.block)}`;
      let el = old.get(key);
      old.delete(key);
      if (!el) {
        el = h('button', { type: 'button', class: `bm-star${pile.quiet ? ' is-quiet' : ''}`, dataset: { key } });
        if (!pile.quiet && !seen.has(key)) el.classList.add('is-new');
        el.addEventListener('click', () => openBeams(el.pile.beams[0].id, el.pile.beams));
      }
      seen.add(key);
      el.pile = pile;
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
    file.replaceChildren(renderCell({ ...b.block, mine: true, owner: null, sharedAt: null, alsoOn: [] }, { actions: false }));
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
  const dialog = openDialog({ body, className: 'bm-dialog' });
  dialog.el.setAttribute('aria-label', 'Beamed to you');
  paint();
  requestAnimationFrame(() => keep.focus());
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
