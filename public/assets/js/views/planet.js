// A planet up close: a slim header (the world, its name and note, who can
// see it) and then what matters, everything on it. The arrow in the corner
// takes you back to the galaxy it belongs to (yours, or its owner's).

import { api, session } from '../api.js';
import { Collection } from '../collection.js';
import { drift } from '../drift.js';
import { ListView, listOffer, listSettings } from '../listmode.js';
import { nav } from '../nav.js';
import { ShelfView, readingOffer } from '../reading.js';
import { LOOKS, MOON_LOOKS, VISIBILITY, glyph, lookOf, moonDot, moonEl, moonLookOf, planetDot, planetEl, planetTone } from '../planets.js';
import { confirmDialog, openDialog, openMenu, openPopover, pinField, segmented, toast } from '../ui.js';
import { EASE, PALETTE, autosize, bus, h, plural, reducedMotion, timeAgo, wait } from '../util.js';

const seedOf = (text) => [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7) / 9973;

const homeOf = (drawer) => (drawer.mine === false && drawer.owner ? `/g/${drawer.owner}` : '/');

// The planet's colours, which the page's glass, cards and buttons lean toward.
function tintOf(drawer) {
  const { tone, accent } = planetTone(drawer);
  return { '--pc': tone, '--pa': accent };
}

// The people a planet is shared with, as removable chips plus a box to add more.
function peoplePicker(names, onChange) {
  let list = [...names];
  const chips = h('div', { class: 'chips' });
  const input = h('input', { class: 'chip-input', type: 'text', placeholder: list.length ? 'Add someone' : '@username', 'aria-label': 'Add a person by username', autocapitalize: 'none', spellcheck: 'false' });
  const render = () => {
    chips.replaceChildren(...list.map((name) => h('span', { class: 'chip' }, `@${name}`,
      h('button', { type: 'button', class: 'chip-x', 'aria-label': `Remove @${name}`, onclick: () => { list = list.filter((n) => n !== name); render(); onChange(list); } }, '×'))), input);
    input.placeholder = list.length ? 'Add someone' : '@username';
  };
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Backspace' && !input.value && list.length) { list = list.slice(0, -1); render(); onChange(list); return; }
    if (e.key !== 'Enter' && e.key !== ',' && e.key !== ' ') return;
    e.preventDefault();
    const name = input.value.trim().replace(/^@/, '').toLowerCase();
    if (!name || list.includes(name)) { input.value = ''; return; }
    const ok = await onChange([...list, name]);
    if (ok !== false) { list.push(name); input.value = ''; render(); input.focus(); }
  });
  render();
  return chips;
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

export const planetView = {
  async load([id]) {
    try {
      return await api.get(`/api/drawers/${id}`);
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
        if (field === 'title') { inst.title = drawer.title; document.title = `${drawer.title} — Mutt`; }
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
    shareBtn?.addEventListener('click', () => {
      if (sharePop) { sharePop.close(); return; }
      sharePop = openPopover(shareBtn, sharing, { align: 'end', className: 'pop-share', width: 340, onClose: () => { sharePop = null; } });
    });

    const moreBtn = h('button', { type: 'button', class: 'vbtn vbtn-glass vbtn-round', 'aria-label': isMoon ? 'Moon options' : 'Planet options' }, '•••');
    // List mode shows up here only once the planet (or moon) has earned it,
    // and stays here after the offer is waved away or the list is turned off.
    const listItems = () => [
      listView ? { label: 'List options…', run: () => listOptions() } : null,
      !listView && !shelf && listFits ? { label: 'Make it a list', run: () => makeList() } : null,
      // And reading mode, once it holds books.
      shelf ? { label: 'Show as files again', run: () => unshelve() } : null,
      !listView && !shelf && shelfFits ? { label: 'Make it a reading planet', run: () => makeShelf() } : null,
      listView || listFits || shelf || shelfFits ? '-' : null,
    ];
    moreBtn.addEventListener('click', () => openMenu(moreBtn, isMoon ? [
      ...listItems(),
      { label: 'Moon type…', run: pickMoonLook },
      '-',
      { label: 'Delete moon…', danger: true, run: remove },
    ].filter(Boolean) : [
      ...listItems(),
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
      entry: !isMoon && (mine || community),
      sortable: mine,
      readOnly: !mine && !community,
      moderate: mine && community,
      empty: isMoon ? (mine ? 'Nothing here yet. Drag files onto this moon from its planet.' : 'Nothing on this moon yet.') : mine ? null : 'Nothing on this planet yet.',
      onChange: changed,
      ...over,
    });
    const makeShelfView = (blocks) => new ShelfView({ drawer, blocks, editable: mine, makeCollection, onChange: changed });
    const makeListView = (blocks) => new ListView({
      blocks, drawer, editable: mine, options: drawer.modes?.list, onChange: changed, onOptions: listOptions, targets,
    });

    // ------------------------------------------------------------ list mode

    let listView = drawer.modes?.list?.on ? makeListView(data.blocks) : null;
    let shelf = !listView && !isMoon && drawer.modes?.reading?.on ? makeShelfView(data.blocks) : null;
    let collection = listView || shelf ? null : makeCollection(data.blocks);
    let listFits = false;
    let shelfFits = false;
    let offer = null;
    const view = () => listView || shelf || collection;
    const body = h('div', { class: 'liv-body' }, view().el);
    const stopDrift = drift(body);

    // Swap what the page shows, with a soft cross-fade.
    async function swapTo(next) {
      const old = view();
      const outgoing = old.el;
      if (!reducedMotion()) {
        await outgoing.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px)' }],
          { duration: 200, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
      }
      old.destroy();
      listView = next instanceof ListView ? next : null;
      shelf = next instanceof ShelfView ? next : null;
      collection = listView || shelf ? null : next;
      outgoing.replaceWith(next.el);
      if (!reducedMotion() && !listView) {
        next.el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE });
      }
    }

    async function saveList(patch) {
      try {
        ({ drawer } = await api.patch(`/api/drawers/${id}`, { modes: { list: patch } }));
        inst.drawer = drawer;
        if (listView) listView.drawer = drawer;
        return true;
      } catch (err) {
        toast(err.message);
        return false;
      }
    }

    async function makeList() {
      try {
        const res = await api.post(`/api/drawers/${id}/listify`, {});
        ({ drawer } = res);
        inst.drawer = drawer;
        offer?.remove();
        offer = null;
        await swapTo(makeListView(res.blocks));
        changed(res.blocks);
        toast(res.split ? `Now a list. ${plural(res.split, 'note')} became one item per line.` : 'Now a list');
        return true;
      } catch (err) {
        toast(err.message);
        return false;
      }
    }

    // From the list's own ⋯ button (anchor), or the planet's ••• menu.
    let listPanel = null;
    function listOptions(anchor) {
      if (listPanel) { listPanel.close(); listPanel = null; if (anchor) return; }
      anchor?.setAttribute('aria-expanded', 'true');
      listPanel = listSettings({
        anchor,
        onClose: () => { listPanel = null; },
        options: drawer.modes?.list,
        onChange: (patch) => { listView?.setOptions(patch); saveList(patch); },
        onTurnOff: async () => {
          if (!(await saveList({ on: false, dismissed: true }))) return;
          const blocks = listView.blocks.filter((b) => !String(b.id).startsWith('tmp-'));
          await swapTo(makeCollection(blocks));
          readListSigns();
          toast('Showing it as files again', {
            action: { label: 'Undo', run: async () => { if (await saveList({ on: true })) swapTo(makeListView(blocks)); } },
          });
        },
      });
    }

    // ------------------------------------------------------------ reading mode

    async function saveReading(patch) {
      try {
        ({ drawer } = await api.patch(`/api/drawers/${id}`, { modes: { reading: patch } }));
        inst.drawer = drawer;
        return true;
      } catch (err) {
        toast(err.message);
        return false;
      }
    }

    async function makeShelf() {
      if (!(await saveReading({ on: true, dismissed: false }))) return false;
      offer?.remove();
      offer = null;
      const blocks = view().list ? view().list() : data.blocks;
      await swapTo(makeShelfView(blocks.filter((b) => !String(b.id).startsWith('tmp-'))));
      toast('Now a reading planet');
      return true;
    }

    async function unshelve() {
      if (!(await saveReading({ on: false, dismissed: true }))) return;
      const blocks = shelf.blocks;
      await swapTo(makeCollection(blocks));
      toast('Showing it as files again', {
        action: { label: 'Undo', run: async () => { if (await saveReading({ on: true })) swapTo(makeShelfView(blocks)); } },
      });
    }

    // Does it read as a list, or a bookshelf? That decides what the ••• menu offers.
    let readingSigns = null;
    async function readListSigns() {
      if (!mine) return null;
      try {
        const { list, reading } = await api.get(`/api/drawers/${id}/modes`);
        listFits = !!list?.fits;
        shelfFits = !isMoon && !!reading?.fits;
        readingSigns = reading;
        return list;
      } catch {
        return null;
      }
    }

    // Is it being used as a list, or a bookshelf? Ask once the page is up, and offer it once.
    async function lookForList() {
      if (!mine) return;
      const list = await readListSigns();
      try {
        if (shelfFits && !drawer.modes?.reading?.dismissed && el.isConnected && !listView && !shelf) {
          offer = readingOffer({
            signs: readingSigns.signs,
            pdfs: readingSigns.pdfs,
            onAccept: makeShelf,
            onDecline: () => { offer = null; saveReading({ dismissed: true }); },
          });
          body.prepend(offer);
          return;
        }
        if (shelf) return;
        if (!listFits || drawer.modes?.list?.dismissed || listView || !el.isConnected) return;
        offer = listOffer({
          signs: list.signs,
          split: list.split,
          onAccept: makeList,
          onDecline: () => { offer = null; saveList({ dismissed: true }); },
        });
        body.prepend(offer);
      } catch { /* no offer, then */ }
    }

    // Previews for the big planet's surface come from what's here.
    world.update({ ...drawer, previews: data.blocks.slice(0, 12) });

    const el = h('div', { class: 'page liv' },
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
      list: () => (listView ? listView.blocks.filter((b) => !String(b.id).startsWith('tmp-')) : view().list()),
      // A moon takes files dragged from its planet, unless it's a list:
      // then you can drop and paste things onto it like any list.
      dropTarget: () => (isMoon && !listView ? null : view().dropTarget()),
      pasteText: (text) => { if (!isMoon || listView) view().pasteText(text); },
      mounted: () => setTimeout(lookForList, 700),
      destroy: () => { stopDrift(); sharePop?.close(); listPanel?.close(); view().destroy(); },
    };
    return inst;
  },
};
