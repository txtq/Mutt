// A planet up close: a slim header (the world, its name and note, who can
// see it) and then what matters, everything on it. The arrow in the corner
// takes you back to the galaxy it belongs to (yours, or its owner's).

import { api, session } from '../api.js';
import { Collection } from '../collection.js';
import { drift } from '../drift.js';
import { MENU_ORDER, MODES, OFFER_ORDER, allowed as modeAllowed, codeOf, loadMode, startMode } from '../modes.js';
import { momentLine } from '../moments.js';
import { nav } from '../nav.js';
import { modeOffer } from '../offers.js';
import { LOOKS, MOON_LOOKS, VISIBILITY, glyph, lookOf, moonDot, moonEl, moonLookOf, planetDot, planetEl, planetTone } from '../planets.js';
import { confirmDialog, openDialog, openMenu, openPopover, pinField, segmented, toast } from '../ui.js';
import { EASE, PALETTE, autosize, bus, h, nameColor, nameMatch, plural, reducedMotion, timeAgo, wait } from '../util.js';

const seedOf = (text) => [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7) / 9973;

const homeOf = (drawer) => (drawer.mine === false && drawer.owner ? `/g/${drawer.owner}` : '/');

// The planet's colours, which the page's glass, cards and buttons lean toward.
function tintOf(drawer) {
  const { tone, accent } = planetTone(drawer);
  return { '--pc': tone, '--pa': accent };
}

const loadEveryone = () => api.get('/api/users').then((r) => r.users);

// The people a planet is shared with: chips for who's on it, a box to search,
// and everyone else's username below to pick from (a tap adds or takes off).
function peoplePicker(names, onChange) {
  let list = [...names];
  let users = [];
  let shown = [];
  let active = -1;
  let busy = false;
  let failed = false;
  const chips = h('div', { class: 'chips' });
  const input = h('input', {
    class: 'chip-input', type: 'text', placeholder: 'Search usernames', role: 'combobox',
    'aria-label': 'Search for a person by username', 'aria-autocomplete': 'list', 'aria-expanded': 'true',
    autocapitalize: 'none', autocomplete: 'off', spellcheck: 'false',
  });
  const results = h('div', { class: 'pp-list', role: 'listbox', 'aria-label': 'People', 'aria-multiselectable': 'true' });
  input.setAttribute('aria-controls', results.id = `pp-${Math.random().toString(36).slice(2, 8)}`);
  const note = h('p', { class: 'pp-note' });

  const query = () => input.value.trim().replace(/^@/, '').toLowerCase();
  const save = async (next) => {
    if (busy) return false;
    busy = true;
    const ok = await onChange(next);
    busy = false;
    if (ok !== false) list = next;
    renderChips();
    renderList();
    return ok !== false;
  };
  const toggle = (name) => save(list.includes(name) ? list.filter((n) => n !== name) : [...list, name]);

  // The chips go in front of the search box without moving it, so it keeps focus.
  const renderChips = () => {
    chips.querySelectorAll('.chip').forEach((c) => c.remove());
    if (input.parentNode !== chips) chips.append(input);
    input.before(...list.map((name) => h('span', { class: 'chip' }, `@${name}`,
      h('button', { type: 'button', class: 'chip-x', 'aria-label': `Remove @${name}`, onclick: () => { save(list.filter((n) => n !== name)); input.focus({ preventScroll: true }); } }, '×'))));
  };

  const renderList = () => {
    const q = query();
    shown = users.map((name) => ({ name, score: nameMatch(name, q) }))
      .filter((u) => u.score !== null)
      .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
      .map((u) => u.name);
    if (active >= shown.length) active = shown.length - 1;
    if (q && active < 0 && shown.length) active = 0;
    results.replaceChildren(...shown.map((name, i) => {
      const on = list.includes(name);
      const row = h('button', {
        type: 'button', class: `pp-row${on ? ' is-on' : ''}${i === active ? ' is-active' : ''}`, role: 'option',
        id: `${results.id}-${i}`, 'aria-selected': String(on), tabindex: '-1',
        onpointerdown: (e) => e.preventDefault(),
        onclick: () => { active = i; toggle(name); input.focus({ preventScroll: true }); },
      }, h('span', { class: 'pp-dot', style: { '--c': nameColor(name) } }), h('span', { class: 'pp-name' }, `@${name}`), h('span', { class: 'pp-tick', 'aria-hidden': 'true' }));
      return row;
    }));
    if (active >= 0 && shown.length) input.setAttribute('aria-activedescendant', `${results.id}-${active}`);
    else input.removeAttribute('aria-activedescendant');
    results.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
    const near = q && shown.length && nameMatch(shown[0], q) >= 3;
    note.textContent = failed ? 'Couldn’t load people. Type a username and press Enter.'
      : !users.length ? 'No one else is here yet.'
      : !shown.length ? `No one called @${q}.`
      : near ? `No exact match. Did you mean @${shown[0]}?` : '';
    note.hidden = !note.textContent;
    results.hidden = !shown.length;
  };

  input.addEventListener('input', () => { active = -1; renderList(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!shown.length) return;
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      renderList();
      return;
    }
    if (e.key === 'Backspace' && !input.value && list.length) { save(list.slice(0, -1)); return; }
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const q = query();
    const pick = shown[active] ?? (users.includes(q) || (failed && q) ? q : null);
    if (!pick) { if (q) toast(`No one here is called @${q}.`); return; }
    const clear = () => { input.value = ''; active = -1; renderList(); };
    // Typing a name only ever adds; picking with the arrows (nothing typed) can take someone off.
    if (q && list.includes(pick)) { clear(); return; }
    toggle(pick).then((ok) => { if (ok && q) clear(); });
  });

  renderChips();
  note.textContent = 'Loading people…';
  results.hidden = true;
  loadEveryone().then((all) => { users = all; renderList(); }).catch(() => { failed = true; renderList(); });
  return h('div', { class: 'pp' }, chips, results, note);
}

// The owner picks the code they'll give people, typed twice. It can't be
// their sign-in code (the server checks), or sharing would hand out the account.
function pickCode(drawer) {
  return new Promise((resolve) => {
    let first = null;
    let result = null;
    const text = h('p', { class: 'dialog-text' });
    const msg = h('p', { class: 'dialog-msg' });
    const step = (again) => {
      text.textContent = again ? 'Type it again.' : 'People type this to look inside. Don’t use your sign-in code.';
    };
    const field = pinField({
      autocomplete: 'off',
      label: 'Planet code',
      onComplete: async (code) => {
        msg.textContent = '';
        if (first === null) {
          first = code;
          field.clear();
          step(true);
          return;
        }
        if (code !== first) {
          field.state('error');
          msg.textContent = 'Those didn’t match. Try again.';
          first = null;
          await wait(420);
          field.state('');
          field.clear();
          step(false);
          field.focus();
          return;
        }
        field.state('busy');
        try {
          ({ drawer: result } = await api.put(`/api/drawers/${drawer.id}/code`, { code }));
          field.state('ok');
          await wait(380);
          dialog.close();
        } catch (err) {
          field.state('error');
          msg.textContent = err.message;
          first = null;
          await wait(420);
          field.state('');
          field.clear();
          step(false);
          field.focus();
        }
      },
    });
    step(false);
    const dialog = openDialog({
      title: drawer.hasCode ? 'New code for this planet' : 'Pick a code for this planet',
      className: 'dialog-code',
      body: h('div', { class: 'pin-dialog' }, text, field.el, msg),
      onClose: () => resolve(result),
    });
    setTimeout(() => field.focus(), 60);
  });
}

function lockedPlanet(id, data) {
  const drawer = data.drawer;
  const msg = h('p', { class: 'dialog-msg' });
  const field = pinField({
    autocomplete: 'off',
    label: 'Planet code',
    onComplete: async (pin) => {
      field.state('busy');
      try {
        await api.post(`/api/galaxy/${encodeURIComponent(data.owner)}/unlock`, { pin, drawer: id });
        field.state('ok');
        await wait(380);
        nav.go(`/p/${id}`, { replace: true, fresh: true });
      } catch (err) {
        field.state('error');
        msg.textContent = err.message;
        await wait(420);
        field.state('');
        field.clear();
        field.focus();
      }
    },
  });
  const world = planetEl(drawer, { size: 120, href: null, label: false });
  const el = h('div', { class: 'page liv liv-locked' },
    h('header', { class: 'liv-head' },
      h('div', { class: 'liv-world' }, world),
      h('div', { class: 'liv-info' },
        h('p', { class: 'liv-owner' }, `@${data.owner}’s planet`),
        h('h1', { class: 'liv-title-static' }, drawer.title),
        h('p', { class: 'liv-meta' }, glyph('lock', 11), h('span', null, `Locked · ${plural(drawer.count, 'file')}`)),
        h('div', { class: 'liv-unlock' }, drawer.hasCode
          ? [h('p', { class: 'liv-hint' }, `Enter the code @${data.owner} gave you for this planet.`), field.el, msg]
          : h('p', { class: 'liv-hint' }, `@${data.owner} hasn’t given this planet a code yet.`)))));
  return {
    el,
    title: drawer.title,
    chrome: 'planet',
    tint: tintOf(drawer),
    who: { username: data.owner, you: false },
    home: true,
    // Back to the galaxy it belongs to, and from there out to the universe.
    homeLabel: `@${data.owner}’s galaxy`,
    goHome: () => nav.go(`/g/${encodeURIComponent(data.owner)}`),
    mounted: () => { if (drawer.hasCode) setTimeout(() => field.focus(), 200); },
  };
}

// The document editor, fetched the first time a document is opened.
let editor = null;
const loadEditor = async () => { if (!editor) editor = await import('../doceditor.js'); return editor; };
const docEditorOpen = () => editor?.docEditorOpen() || null;

export const planetView = {
  async load([id]) {
    try {
      const data = await api.get(`/api/drawers/${id}`);
      // A planet that opens in a mode needs that mode's code before it's drawn;
      // no other mode's code is fetched.
      const key = data.drawer && startMode(data.drawer);
      if (key) await loadMode(key);
      return data;
    } catch (err) {
      if (err.status === 403 && err.data?.locked) return { locked: true, ...err.data };
      throw err;
    }
  },

  create([id], data) {
    if (data.locked) return lockedPlanet(id, data);
    let drawer = data.drawer;
    const mine = drawer.mine !== false;
    const home = homeOf(drawer);
    // A moon's page is a planet page with its planet beside it.
    const isMoon = !!drawer.parentId;
    const parent = drawer.parent || null;
    const word = isMoon ? 'moon' : 'planet';

    const worldSize = innerWidth < 640 ? 76 : 104;
    const world = planetEl(drawer, { size: worldSize, href: null, label: false });
    world.body.dataset.vt = isMoon ? `moon-${id}` : `planet-${id}`;
    world.classList.add('planet-big');
    if (mine) {
      world.classList.add('is-editable');
      world.title = isMoon ? 'Moon type' : 'Planet type';
      world.addEventListener('click', () => (isMoon ? pickMoonLook() : pickLook()));
    }

    // Beside the world: a planet's moons, first on the right, then the left,
    // drifting a little. Click one to open it; drag a file onto one to move it there.
    const besideSize = Math.round(worldSize * 0.32);
    const worldBox = h('div', { class: 'liv-world', style: { '--ws': `${worldSize}px`, '--bs': `${besideSize}px` } }, world);
    const moonSlots = [];
    function renderMoons({ born = null } = {}) {
      for (const m of moonSlots.splice(0)) m.remove();
      if (isMoon) return;
      (drawer.moons || []).forEach((m, i) => {
        const el = moonEl(m, { size: besideSize });
        el.classList.add('is-beside');
        el.style.setProperty('--side', i % 2 ? -1 : 1);
        el.style.setProperty('--lv', i >> 1);
        el.style.setProperty('--bob', `${(seedOf(m.id) * -6).toFixed(2)}s`);
        moonSlots.push(el);
        worldBox.append(el);
        if (m.id === born) el.classList.add('is-born');
      });
      worldBox.classList.toggle('has-moons', moonSlots.length > 0);
      worldBox.classList.toggle('has-left', moonSlots.length > 1);
    }
    renderMoons();
    // On a moon's page its planet sits beside it, small; drag a file onto it to move it back.
    const parentWorld = parent ? planetEl(parent, { size: Math.round(worldSize * 0.46), href: `/p/${parent.id}`, label: false }) : null;
    if (parentWorld) {
      parentWorld.body.dataset.vt = `planet-${parent.id}`;
      parentWorld.classList.add('liv-parent');
      parentWorld.setAttribute('aria-label', `Back to ${parent.title}`);
      parentWorld.title = parent.title;
      worldBox.append(parentWorld);
      worldBox.classList.add('has-parent');
    }

    const title = h('textarea', { class: 'liv-title', rows: 1, maxlength: '80', value: drawer.title, 'aria-label': 'Planet name', spellcheck: 'false' });
    const desc = h('textarea', { class: 'liv-desc', rows: 1, maxlength: '2000', value: drawer.description, placeholder: 'Add a note', 'aria-label': 'Note' });
    const meta = h('p', { class: 'liv-meta' });
    const setMeta = (count) => {
      const vis = drawer.community ? 'community' : drawer.visibility;
      const moons = drawer.moons?.length ? plural(drawer.moons.length, 'moon') : null;
      // (replaceChildren would write a left-out piece as the word "null")
      meta.replaceChildren(...[
        h('span', null, [plural(count, 'file'), moons, timeAgo(drawer.updatedAt)].filter(Boolean).join(' · ')),
        mine && vis ? h('span', { class: 'liv-vis' }, glyph(vis, 11), drawer.community ? 'Open to all' : VISIBILITY[drawer.visibility].label) : null,
      ].filter(Boolean));
    };
    setMeta(drawer.count);

    const save = async (field, input) => {
      const value = input.value.trim();
      if (value === drawer[field]) return;
      if (field === 'title' && !value) { input.value = drawer.title; return; }
      try {
        ({ drawer } = await api.patch(`/api/drawers/${id}`, { [field]: value }));
        inst.drawer = drawer;
        input.value = drawer[field];
        world.update({ ...drawer, previews: world.planet?.previews });
        bus.emit('drawer:changed', drawer);
        if (field === 'title') { inst.title = drawer.title; document.title = `${drawer.title} — Mutt.`; }
      } catch (err) {
        toast(err.message);
        input.value = drawer[field];
      }
    };
    if (!mine) {
      title.readOnly = true;
      desc.readOnly = true;
      title.classList.add('is-static');
      desc.classList.add('is-static');
      if (!drawer.description) desc.hidden = true;
    }
    if (isMoon) title.setAttribute('aria-label', 'Moon name');
    for (const [field, input] of [['title', title], ['description', desc]]) {
      autosize(input);
      input.addEventListener('blur', () => save(field, input));
      input.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' && (field === 'title' || e.metaKey || e.ctrlKey)) || e.key === 'Escape') {
          e.preventDefault();
          if (e.key === 'Escape') input.value = drawer[field];
          input.blur();
        }
      });
    }

    // The planet's colour. It's kept with the old pixel icon, which the
    // classic site still reads, so only the colour changes.
    function retint() {
      inst.tint = tintOf(drawer);
      for (const [k, v] of Object.entries(inst.tint)) document.body.style.setProperty(k, v);
    }

    async function setColor(c) {
      if (c.toUpperCase() === drawer.icon?.c) return;
      try {
        ({ drawer } = await api.patch(`/api/drawers/${id}`, { icon: { ...drawer.icon, c } }));
        inst.drawer = drawer;
        world.update({ ...drawer, previews: world.planet?.previews });
        retint();
        bus.emit('drawer:changed', drawer);
      } catch (err) {
        toast(err.message);
      }
    }

    function pickColor() {
      const current = drawer.icon?.c || '#2F6BFF';
      const pick = (c) => { dialog.close(); setColor(c); };
      const custom = h('input', { type: 'color', class: 'swatch-custom', value: current, title: 'Any colour', 'aria-label': 'Any colour' });
      custom.addEventListener('change', () => pick(custom.value));
      const body = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Planet colour' },
        PALETTE.map((c) => h('button', {
          type: 'button', class: 'swatch', role: 'radio', style: { '--c': c }, 'aria-label': c,
          'aria-checked': String(c === current), onclick: () => pick(c),
        })),
        custom);
      const dialog = openDialog({ title: 'Planet colour', body });
    }

    // What kind of world it is: picked for it, or one you choose.
    async function setLook(look) {
      try {
        ({ drawer } = await api.patch(`/api/drawers/${id}`, { look }));
        inst.drawer = drawer;
        world.update({ ...drawer, previews: world.planet?.previews });
        retint();
        bus.emit('drawer:changed', drawer);
      } catch (err) {
        toast(err.message);
      }
    }

    function pickLook() {
      const previews = world.planet?.previews || [];
      const auto = LOOKS.find((l) => l.id === lookOf({ id })).label;
      const choices = [{ id: null, label: 'Auto', note: auto }, ...LOOKS];
      const grid = h('div', { class: 'look-grid', role: 'radiogroup', 'aria-label': 'Kind of planet' });
      const dialog = openDialog({ title: 'Planet type', className: 'dialog-wide', body: grid });
      for (const choice of choices) {
        const preview = planetEl({ ...drawer, look: choice.id, previews }, { size: 64, href: null, label: false });
        preview.classList.add('planet-mini');
        grid.append(h('button', {
          type: 'button',
          class: 'look-pick',
          role: 'radio',
          'aria-checked': String((drawer.look || null) === choice.id),
          onclick: () => { dialog.close(); if ((drawer.look || null) !== choice.id) setLook(choice.id); },
        }, preview, h('span', { class: 'look-name' }, choice.label), choice.note ? h('span', { class: 'look-note' }, choice.note) : null));
      }
    }

    // What real moon it is: picked for it, or one you choose.
    function pickMoonLook() {
      const auto = MOON_LOOKS.find((l) => l.id === moonLookOf({ id })).label;
      const choices = [{ id: null, label: 'Auto', note: auto }, ...MOON_LOOKS];
      const grid = h('div', { class: 'look-grid', role: 'radiogroup', 'aria-label': 'Kind of moon' });
      const dialog = openDialog({ title: 'Moon type', className: 'dialog-wide', body: grid });
      for (const choice of choices) {
        const preview = moonEl({ id, title: drawer.title, look: choice.id }, { size: 56, link: false });
        grid.append(h('button', {
          type: 'button',
          class: 'look-pick',
          role: 'radio',
          'aria-checked': String((drawer.look || null) === choice.id),
          onclick: () => { dialog.close(); if ((drawer.look || null) !== choice.id) setLook(choice.id); },
        }, h('span', { class: 'look-moon' }, preview), h('span', { class: 'look-name' }, choice.label), h('span', { class: 'look-note' }, choice.note)));
      }
    }

    // A new moon: just a name. It shows up beside the planet.
    function addMoon() {
      const input = h('input', { class: 'input', type: 'text', maxlength: '80', placeholder: 'Name it', 'aria-label': 'Moon name', autofocus: true });
      const make = async () => {
        const name = input.value.trim();
        if (!name) { input.focus(); return; }
        dialog.close();
        try {
          const res = await api.post('/api/drawers', { title: name, parent: id });
          const m = res.drawer;
          drawer = { ...drawer, moons: [...(drawer.moons || []), { id: m.id, title: m.title, look: m.look, count: 0, visibility: m.visibility, locked: false }] };
          inst.drawer = drawer;
          renderMoons({ born: m.id });
          setMeta(view().blocks.length);
          bus.emit('drawer:changed', drawer);
        } catch (err) {
          toast(err.message);
        }
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); make(); } });
      const dialog = openDialog({
        title: 'Add a moon',
        body: h('div', null,
          h('p', { class: 'dialog-text' }, 'A small planet of its own, going round this one. Drag files onto it to move them there.'),
          input,
          h('div', { class: 'dialog-actions' },
            h('button', { type: 'button', class: 'btn', onclick: () => dialog.close() }, 'Cancel'),
            h('button', { type: 'button', class: 'btn btn-dark', onclick: make }, 'Add moon'))),
      });
    }

    async function remove() {
      if (isMoon) {
        const ok = await confirmDialog({
          title: `Delete “${drawer.title}”?`,
          message: drawer.count ? `Its files move to ${parent?.title || 'its planet'}.` : 'It’s empty.',
          confirm: 'Delete moon',
          danger: true,
        });
        if (!ok) return;
        try {
          await api.del(`/api/drawers/${id}`);
          toast('Moon deleted');
          bus.emit('drawer:changed', null);
          nav.go(`/p/${drawer.parentId}`, { replace: true });
        } catch (err) {
          toast(err.message);
        }
        return;
      }
      let orphans = 0;
      try { ({ count: orphans } = await api.get(`/api/drawers/${id}/orphans`)); } catch { /* ask anyway */ }
      const check = h('input', { type: 'checkbox' });
      const extra = orphans
        ? h('label', { class: 'check' }, check, h('span', null, `Also delete ${plural(orphans, 'file')} that only live here`))
        : null;
      const ok = await confirmDialog({
        title: `Delete “${drawer.title}”?`,
        message: drawer.moons?.length ? 'Its moons go with it, and all their files float off and become stars.' : 'Its files float off and become stars.',
        confirm: 'Delete planet',
        danger: true,
        extra,
      });
      if (!ok) return;
      try {
        const res = await api.del(`/api/drawers/${id}${check.checked ? '?blocks=orphans' : ''}`);
        toast(res.deletedBlocks ? `Deleted with ${plural(res.deletedBlocks, 'file')}` : 'Planet deleted');
        nav.go('/', { replace: true });
      } catch (err) {
        toast(err.message);
      }
    }

    // ------------------------------------------------------------ sharing

    let sharing = null;
    let sharePop = null;
    if (mine) {
      const hint = h('p', { class: 'liv-share-hint' });
      const people = h('div', { class: 'liv-people' });
      const openBox = h('input', { type: 'checkbox', role: 'switch', checked: !!drawer.community });
      const openRow = h('label', { class: 'vswitch liv-open' },
        openBox, h('span', { class: 'vswitch-track' }, h('span', { class: 'vswitch-knob' })), h('span', null, 'Others can add files'));
      const codeText = h('span', { class: 'liv-code-text' });
      const codeBtn = h('button', { type: 'button', class: 'vbtn vbtn-glass liv-code-btn' });
      const codeRow = h('div', { class: 'liv-code' }, glyph('pin', 12), codeText, codeBtn);
      const chooseCode = async () => {
        sharePop?.close();
        const next = await pickCode(drawer);
        if (!next) return;
        drawer = next;
        inst.drawer = drawer;
        paint();
        bus.emit('drawer:changed', drawer);
        toast(`Give people the code to open “${drawer.title}”`);
      };
      codeBtn.addEventListener('click', chooseCode);
      const paint = () => {
        hint.textContent = drawer.community ? 'Everyone can look inside and add to it.' : VISIBILITY[drawer.visibility].hint;
        // A moon is never more open than its planet.
        if (parent && drawer.visibility !== 'private' && parent.visibility !== 'public' && parent.visibility !== drawer.visibility) {
          hint.textContent += ` Also limited by ${parent.title}’s sharing (${VISIBILITY[parent.visibility].label}).`;
        }
        people.hidden = drawer.visibility !== 'people';
        openRow.hidden = isMoon || (drawer.visibility !== 'public' && !drawer.community);
        codeRow.hidden = drawer.visibility !== 'pin' || drawer.community;
        codeText.textContent = drawer.hasCode ? 'It has a code.' : 'No code yet, so only you can look inside.';
        codeBtn.textContent = drawer.hasCode ? 'Change code' : 'Pick a code';
        world.update({ ...drawer, previews: world.planet?.previews });
        setMeta(drawer.count);
        sharePop?.place();
      };
      const seg = segmented(Object.entries(VISIBILITY).map(([value, v]) => ({ value, label: v.label })), drawer.visibility, async (value) => {
        seg.set(value);
        try {
          const body = { visibility: value };
          if (value !== 'public' && drawer.community) body.community = false;
          ({ drawer } = await api.patch(`/api/drawers/${id}`, body));
          inst.drawer = drawer;
          openBox.checked = !!drawer.community;
          paint();
          bus.emit('drawer:changed', drawer);
          if (value === 'pin' && !drawer.hasCode) chooseCode();
        } catch (err) {
          seg.set(drawer.visibility);
          toast(err.message);
        }
      }, { className: 'liv-seg', label: `Who can see this ${word}` });
      people.append(peoplePicker(drawer.people || [], async (names) => {
        try {
          ({ drawer } = await api.patch(`/api/drawers/${id}`, { people: names }));
          inst.drawer = drawer;
          return true;
        } catch (err) {
          toast(err.message);
          return false;
        }
      }));
      openBox.addEventListener('change', async () => {
        if (!openBox.checked && !(await confirmDialog({
          title: 'Close it to others?',
          message: 'Files other people added will leave the planet (they keep them).',
          confirm: 'Close it',
        }))) { openBox.checked = true; return; }
        try {
          ({ drawer } = await api.patch(`/api/drawers/${id}`, { community: openBox.checked }));
          inst.drawer = drawer;
          paint();
        } catch (err) {
          openBox.checked = !!drawer.community;
          toast(err.message);
        }
      });
      paint();
      sharing = h('div', { class: 'liv-share' },
        h('p', { class: 'liv-label' }, 'Who can see it'),
        seg.el, hint, codeRow, people, openRow);
    }
    const shareBtn = mine ? h('button', { type: 'button', class: 'vbtn liv-share-btn', 'aria-haspopup': 'dialog' }, glyph('people', 13), h('span', null, 'Share')) : null;
    // A new planet's first visit: a quiet note by Share saying who can see it
    // now and that it can be changed. Put away for good once read or used.
    let shareTip = null;
    const putTipAway = () => {
      if (!shareTip) return;
      const tip = shareTip;
      shareTip = null;
      api.patch(`/api/drawers/${id}`, { modes: { shareTip: false } }).then((res) => { drawer = res.drawer; inst.drawer = drawer; }).catch(() => {});
      if (reducedMotion()) { tip.remove(); return; }
      tip.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 -6px' }], { duration: 220, easing: 'ease-in', fill: 'forwards' })
        .finished.then(() => tip.remove(), () => tip.remove());
    };
    const showShareTip = () => {
      if (!mine || isMoon || !drawer.modes?.shareTip || shareTip || offer || !shareBtn?.isConnected) return;
      const now = drawer.community ? 'Everyone on Mutt can see it and add files.'
        : { public: 'Everyone on Mutt can see it, but only you can add files.',
            private: 'Only you can see it.', pin: 'Only people with its code can see it.',
            people: 'Only the people you picked can see it.' }[drawer.visibility] || '';
      const change = h('button', { type: 'button', class: 'vbtn vbtn-blue' }, 'Change sharing');
      const ok = h('button', { type: 'button', class: 'vbtn vbtn-glass' }, 'Got it');
      shareTip = h('div', { class: 'share-tip fglass', role: 'note' },
        h('p', { class: 'share-tip-title' }, 'Who can see this planet'),
        h('p', { class: 'share-tip-text' }, `${now} Change that, or let others add too, under Share.`),
        h('div', { class: 'share-tip-btns' }, ok, change));
      change.addEventListener('click', () => { putTipAway(); shareBtn.click(); });
      ok.addEventListener('click', putTipAway);
      // It hangs from the page, not the header: glass inside the header's
      // glass can only frost the header, so the files under it would show through.
      el.append(shareTip);
      placeTip();
      addEventListener('resize', placeTip);
    };
    const placeTip = () => {
      if (!shareTip) { removeEventListener('resize', placeTip); return; }
      const page = el.getBoundingClientRect();
      const btn = shareBtn.parentElement.getBoundingClientRect();
      shareTip.style.top = `${Math.round(btn.bottom - page.top + 10)}px`;
      shareTip.style.right = `${Math.max(0, Math.round(page.right - btn.right))}px`;
    };
    shareBtn?.addEventListener('click', () => {
      putTipAway();
      if (sharePop) { sharePop.close(); return; }
      sharePop = openPopover(shareBtn, sharing, { align: 'end', className: 'pop-share', width: 340, onClose: () => { sharePop = null; } });
    });

    const moreBtn = h('button', { type: 'button', class: 'vbtn vbtn-glass vbtn-round', 'aria-label': isMoon ? 'Moon options' : 'Planet options' }, '•••');
    // A mode shows up here only once the planet (or moon) has earned it, and
    // stays here after its offer is waved away or it's turned off.
    const modeItems = () => {
      const items = active
        ? MODES[active.key].menu(page)
        : MENU_ORDER.filter((key) => fits[key]).map((key) => ({ label: MODES[key].label, run: () => turnOn(key) }));
      return items.length ? [...items, '-'] : [];
    };
    moreBtn.addEventListener('click', () => openMenu(moreBtn, isMoon ? [
      ...modeItems(),
      { label: 'Moon type…', run: pickMoonLook },
      '-',
      { label: 'Delete moon…', danger: true, run: remove },
    ].filter(Boolean) : [
      ...modeItems(),
      { label: 'Planet type…', run: pickLook },
      { label: 'Planet colour…', run: pickColor },
      (drawer.moons || []).length < 4 ? { label: 'Add a moon…', run: addMoon } : null,
      '-',
      { label: 'Delete planet…', danger: true, run: remove },
    ].filter(Boolean), { align: 'end' }));

    const community = !!drawer.community;
    // Where a file can be dragged to: this planet's moons, or a moon's planet.
    const targets = () => {
      if (!mine) return [];
      if (parentWorld) {
        return [{
          id: parent.id, title: parent.title, el: parentWorld, planet: true, dot: planetDot(parent), measure: () => parentWorld.center(),
          onMoved: () => { parent.count = (parent.count || 0) + 1; },
          onBack: () => { parent.count = Math.max(0, (parent.count || 1) - 1); },
        }];
      }
      return moonSlots.filter((el) => !el.moon.locked).map((el) => ({
        id: el.moon.id, title: el.moon.title, el, dot: moonDot(el.moon), measure: () => el.center(),
        onMoved: () => { el.moon.count = (el.moon.count || 0) + 1; },
        onBack: () => { el.moon.count = Math.max(0, (el.moon.count || 1) - 1); },
      }));
    };
    const changed = (blocks) => {
      drawer.updatedAt = Date.now();
      drawer.count = blocks.length;
      setMeta(blocks.length);
      world.update({ ...drawer, count: blocks.length, previews: blocks.slice(0, 12) });
      if (session.stats) session.stats.files = Math.max(session.stats.files, blocks.length);
    };
    const makeCollection = (blocks, over = {}) => new Collection({
      blocks,
      drawer,
      targets,
      entry: mine || community,
      sortable: mine,
      readOnly: !mine && !community,
      moderate: mine && community,
      empty: mine ? null : isMoon ? 'Nothing on this moon yet.' : 'Nothing on this planet yet.',
      onChange: changed,
      ...over,
    });
    const notTmp = (b) => !String(b.id).startsWith('tmp-');

    // ------------------------------------------------------------ modes
    //
    // Every way a planet can show itself other than as plain files is an entry
    // in modes.js (the server's half is mutt/modes.py). What's here is shared
    // by all of them: turning on and off, Undo, the offer, the ••• menu and
    // stepping back. `page` is what a mode is lent to do its work.
    const page = {
      id,
      mine,
      state: {},
      get drawer() { return drawer; },
      targets,
      makeCollection,
      changed,
      filesNow: () => filesNow(),
      setDrawer: (next) => setDrawer(next),
      patchMode: (key, patch) => patchMode(key, patch),
      saveMode: (key, patch) => saveMode(key, patch),
      turnOff: (key) => turnOff(key),
      modeView: (key) => modeView(key),
      docs: { open: (bid) => openDoc(bid), create: () => newDoc() },
    };
    const allowed = (key) => modeAllowed(key, drawer);
    const build = (key, blocks) => MODES[key].view(codeOf(key), page, blocks);

    const setDrawer = (next) => {
      drawer = next;
      inst.drawer = drawer;
      if (active) active.view.drawer = drawer;
    };

    // The mode that's on ({ key, view }), or null when it shows as plain files.
    const startKey = startMode(drawer);
    let active = startKey ? { key: startKey, view: build(startKey, data.blocks) } : null;
    let collection = active ? null : makeCollection(data.blocks);
    const view = () => active?.view || collection;
    const modeView = (key) => (active?.key === key ? active.view : null);
    // The planet's files as they stand, whatever is showing them.
    const filesNow = () => (active ? MODES[active.key].blocks(active.view) : collection.list()).filter(notTmp);
    // What the server noticed about each mode, and whether the planet fits it.
    const fits = {};
    const signs = {};
    let offer = null;
    const body = h('div', { class: 'liv-body' }, view().el);
    const stopDrift = drift(body);
    const pageClasses = Object.values(MODES).map((m) => m.pageClass).filter(Boolean);

    // Swap what the page shows, with a soft cross-fade. An offer still up
    // goes with the old view.
    async function swapTo(key, next) {
      const old = view();
      const outgoing = old.el;
      const gone = offer;
      offer = null;
      if (!reducedMotion()) {
        await Promise.all([
          outgoing.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px)' }],
            { duration: 200, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {}),
          gone?.fade(),
        ]);
      }
      gone?.remove();
      old.destroy();
      active = key ? { key, view: next } : null;
      collection = key ? null : next;
      outgoing.replaceWith(next.el);
      for (const c of pageClasses) el.classList.toggle(c, !!key && MODES[key].pageClass === c);
      attachHint();
      if (!reducedMotion() && !(key && MODES[key].ownEntrance)) {
        next.el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE });
      }
    }

    async function patchMode(key, patch) {
      const res = await api.patch(`/api/drawers/${id}`, { modes: { [key]: patch } });
      setDrawer(res.drawer);
    }

    async function saveMode(key, patch) {
      try {
        await patchMode(key, patch);
        return true;
      } catch (err) {
        toast(err.message);
        return false;
      }
    }

    // undo: say it with an Undo (for a mode that switched on by itself).
    async function turnOn(key, { quiet = false, undo = false } = {}) {
      try {
        const made = await MODES[key].start(await loadMode(key), page);
        await swapTo(key, made.view);
        made.after?.();
        if (undo) toast(made.say, { action: { label: 'Undo', run: () => turnOff(key, { quiet: true }) } });
        else if (!quiet) toast(made.say);
        return true;
      } catch (err) {
        toast(err.message);
        return false;
      }
    }

    // Back to plain files, with Undo. The mode stays in the ••• menu if it still fits.
    async function turnOff(key, { quiet = false } = {}) {
      if (active?.key !== key || !(await saveMode(key, { on: false, dismissed: true }))) return;
      const blocks = MODES[key].blocks(active.view);
      MODES[key].leave?.(page);
      await swapTo(null, makeCollection(blocks));
      readSigns();
      if (quiet) return;
      toast('Showing it as files again', {
        action: { label: 'Undo', run: async () => { if (!active && await saveMode(key, { on: true })) swapTo(key, build(key, blocks)); } },
      });
    }

    // ------------------------------------------------------------ Mutt documents

    // The editor's address is the planet's with ?doc=, so a reload or Back finds it.
    let docPushed = false;
    function openDoc(bid, { fresh = false } = {}) {
      const u = new URL(location.href);
      if (u.searchParams.get('doc') === bid) { showDoc(bid, { fresh }); return; }
      const replace = !!u.searchParams.get('doc');
      if (!replace) docPushed = true;
      freshDoc = fresh ? bid : null;
      nav.go(`/p/${id}?doc=${encodeURIComponent(bid)}`, { replace });
    }
    let freshDoc = null;
    let docLoading = null;
    async function showDoc(bid, { fresh = freshDoc === bid } = {}) {
      if (docLoading === bid) return;
      docLoading = bid;
      let ed;
      try { ed = await loadEditor(); } catch (err) { toast(err.message); return; } finally { docLoading = null; }
      if (!el.isConnected) return;
      ed.openDocEditor(bid, {
        drawer,
        fresh,
        card: (bid) => modeView('documents')?.pageOf(bid) || null,
        onClose: ({ switching }) => {
          if (switching) return;
          modeView('documents')?.refreshSoon();
          const u = new URL(location.href);
          if (!u.searchParams.get('doc')) return;
          if (docPushed) { docPushed = false; history.back(); } else nav.go(`/p/${id}`, { replace: true });
        },
      });
    }

    // A document made here opens on the desk, turning the planet into one if it isn't yet.
    async function deskWith(block, opts) {
      if (!modeView('documents') && !(await turnOn('documents', { quiet: true }))) return;
      modeView('documents')?.add(block);
      openDoc(block.id, opts);
    }

    async function newDoc() {
      try {
        const { block } = await api.post('/api/docs', { drawer: id });
        await deskWith(block, { fresh: true });
      } catch (err) {
        toast(err.message);
      }
    }

    // What's being typed into the add box can call for something of its own
    // (the moment modes): writing that outgrows a note offers to be a document.
    function attachHint() {
      const cell = collection?.entry;
      if (!mine || !cell || cell.querySelector('.dk-hint')) return;
      const area = cell.querySelector('textarea');
      const box = cell.querySelector('.entry');
      if (!area || !box) return;
      const hint = momentLine(area, {
        drawerId: id,
        onWave: (key) => saveMode(key, { dismissed: true }),
        acts: {
          writing: {
            label: 'Write it as a document',
            run: async () => {
              const text = area.value;
              if (!text.trim()) return;
              area.value = '';
              area.dispatchEvent(new Event('input'));
              try {
                const { block } = await api.post('/api/blocks', { content: text, drawer: id });
                await deskWith(block);
              } catch (err) {
                area.value = text;
                area.dispatchEvent(new Event('input'));
                toast(err.message);
              }
            },
          },
        },
      });
      box.append(hint);
      area.addEventListener('input', () => hint.check(area.value));
    }

    // What does the planet read as? One answer for every mode, from the
    // server's registry. That decides what the ••• menu offers.
    let left = null;
    async function readSigns() {
      if (!mine) return;
      try {
        const res = await api.get(`/api/drawers/${id}/modes`);
        left = null;
        for (const key of Object.keys(MODES)) {
          signs[key] = res[key] || null;
          fits[key] = allowed(key) && !!res[key]?.fits;
          if (res[key]?.left) left = key;
        }
      } catch { /* nothing offered, then */ }
    }

    // Once the page is up: a mode the planet has grown into arrives the way
    // its entry says (offered once in place, or switched on with an Undo, or
    // quietly); a mode the planet has grown out of offers to step back, once.
    async function lookForModes() {
      if (!mine) return;
      await readSigns();
      if (offer || !el.isConnected) return;
      if (active) {
        if (left === active.key) stepBack(left);
        return;
      }
      const key = OFFER_ORDER.find((k) => fits[k] && !drawer.modes?.[k]?.dismissed);
      if (!key) return;
      const how = signs[key].arrives;
      if (how === 'undo' || how === 'quiet') {
        // It stays in the ••• menu if it's undone, and isn't switched on again.
        turnOn(key, { undo: how === 'undo', quiet: how === 'quiet' });
        return;
      }
      try {
        offer = modeOffer({
          ...MODES[key].offer(signs[key]),
          signs: signs[key].signs,
          onAccept: () => turnOn(key),
          onDecline: () => { offer = null; saveMode(key, { dismissed: true }); setTimeout(showShareTip, 500); },
        });
        offer.show(body);
      } catch { offer = null; }
    }

    // A mode that's on, on a planet that's mostly something else now. Said
    // once, in the same quiet box; either answer is remembered.
    function stepBack(key) {
      try {
        offer = modeOffer({
          kind: 'lm-offer-back',
          icon: 'lm-offer-icon',
          title: `Most of this ${word} isn’t ${MODES[key].name} any more`,
          signs: [],
          note: `It can go back to showing everything as plain files, or stay ${MODES[key].name}. Nothing on it changes either way.`,
          accept: 'Show as files again',
          busy: 'Showing the files…',
          decline: 'Keep it',
          onAccept: async () => { await turnOff(key); return true; },
          onDecline: () => { offer = null; saveMode(key, { kept: true }); },
        });
        offer.show(body);
      } catch { offer = null; }
    }

    // Previews for the big planet's surface come from what's here.
    world.update({ ...drawer, previews: data.blocks.slice(0, 12) });

    const el = h('div', { class: `page liv${active && MODES[active.key].pageClass ? ` ${MODES[active.key].pageClass}` : ''}` },
      h('header', { class: 'liv-head' },
        worldBox,
        h('div', { class: 'liv-info' },
          isMoon
            ? h('p', { class: 'liv-owner' }, mine ? null : h('a', { href: home }, `@${drawer.owner}`), mine ? 'Moon of ' : '’s moon of ', h('a', { href: `/p/${drawer.parentId}` }, parent?.title || 'its planet'))
            : mine ? null : h('p', { class: 'liv-owner' }, h('a', { href: home }, `@${drawer.owner}`), '’s planet', community ? ' · anyone can add' : ''),
          title, desc, meta),
        mine ? h('div', { class: 'liv-tools' }, shareBtn, moreBtn) : null),
      body);

    const inst = {
      el,
      title: drawer.title,
      drawer,
      chrome: 'planet',
      tint: tintOf(drawer),
      who: { username: mine ? session.user.username : drawer.owner, you: mine },
      home: true,
      // Someone else's planet goes back to their galaxy first; from there the
      // arrow pulls out to the universe.
      homeLabel: mine ? null : `@${drawer.owner}’s galaxy`,
      goHome: () => nav.go(home),
      list: () => filesNow(),
      // A moon takes new things just like a planet: typed, pasted or dropped.
      dropTarget: () => view().dropTarget(),
      pasteText: (text) => view().pasteText(text),
      mounted: () => {
        // One thing at a time: the sharing tip waits while a mode is being offered
        // (it would hang over the offer's buttons).
        setTimeout(async () => { await lookForModes(); showShareTip(); }, 700);
        attachHint();
        const bid = new URL(location.href).searchParams.get('doc');
        if (bid) showDoc(bid);
      },
      // Opening or closing a document changes only ?doc=, not the page.
      update: (url) => {
        const bid = url.searchParams.get('doc');
        const open = docEditorOpen();
        if (bid) { if (open?.id !== bid) showDoc(bid); } else if (open) { docPushed = false; open.close(); }
        return true;
      },
      destroy: () => { removeEventListener('resize', placeTip); stopDrift(); sharePop?.close(); if (active) MODES[active.key].leave?.(page); docEditorOpen()?.close(); view().destroy(); },
    };
    return inst;
  },
};
