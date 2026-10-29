// A planet up close, laid out like a Vita LiveArea: the world itself, its
// name and note, who can see it, then everything on it. Peel the corner to
// go back to the galaxy.

import { api, session } from '../api.js';
import { Collection } from '../collection.js';
import { nav } from '../nav.js';
import { fillIcon, generateIcon, iconEditor } from '../pixel.js';
import { VISIBILITY, glyph, planetEl } from '../planets.js';
import { confirmDialog, openDialog, openMenu, pinField, segmented, toast } from '../ui.js';
import { autosize, bus, h, plural, timeAgo, wait } from '../util.js';

const homeOf = (drawer) => (drawer.mine === false && drawer.owner ? `/g/${drawer.owner}` : '/');

function peel(href, label) {
  return h('a', { class: 'peel', href, 'aria-label': label, title: label },
    h('span', { class: 'peel-flap' }), h('span', { class: 'peel-under' }, glyph('chevron', 12)));
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

function lockedPlanet(id, data) {
  const drawer = data.drawer;
  const msg = h('p', { class: 'dialog-msg' });
  const field = pinField({
    autocomplete: 'off',
    label: `${data.owner}'s code`,
    onComplete: async (pin) => {
      field.state('busy');
      try {
        await api.post(`/api/galaxy/${encodeURIComponent(data.owner)}/unlock`, { pin });
        field.state('ok');
        await wait(380);
        nav.go(`/p/${id}`, { replace: true });
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
  const world = planetEl(drawer, { size: 150, href: null, label: false });
  const el = h('div', { class: 'page liv liv-locked', style: { '--pc': drawer.icon?.c || '#2F6BFF' } },
    peel(`/g/${data.owner}`, `Back to @${data.owner}’s galaxy`),
    h('header', { class: 'liv-head' },
      h('div', { class: 'liv-world' }, world),
      h('div', { class: 'liv-info' },
        h('p', { class: 'liv-owner' }, `@${data.owner}’s planet`),
        h('h1', { class: 'liv-title-static' }, drawer.title),
        h('p', { class: 'liv-meta' }, glyph('lock', 11), h('span', null, `Locked · ${plural(drawer.count, 'file')}`)),
        h('div', { class: 'liv-unlock' }, h('p', { class: 'liv-hint' }, `Enter @${data.owner}’s code to look inside.`), field.el, msg))));
  return {
    el,
    title: drawer.title,
    chrome: 'planet',
    who: { username: data.owner, you: false },
    mounted: () => setTimeout(() => field.focus(), 200),
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

    const world = planetEl(drawer, { size: innerWidth < 640 ? 132 : 176, href: null, label: false });
    world.ball.dataset.vt = `planet-${id}`;
    world.classList.add('planet-big');
    if (mine) {
      world.classList.add('is-editable');
      world.title = 'Change critter';
      world.addEventListener('click', () => editIcon());
    }

    const title = h('textarea', { class: 'liv-title', rows: 1, maxlength: '80', value: drawer.title, 'aria-label': 'Planet name', spellcheck: 'false' });
    const desc = h('textarea', { class: 'liv-desc', rows: 1, maxlength: '2000', value: drawer.description, placeholder: 'Add a note', 'aria-label': 'Note' });
    const meta = h('p', { class: 'liv-meta' });
    const setMeta = (count) => {
      meta.replaceChildren(h('span', null, [plural(count, 'file'), timeAgo(drawer.updatedAt)].join(' · ')));
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

    async function setIcon(next) {
      try {
        ({ drawer } = await api.patch(`/api/drawers/${id}`, { icon: next }));
        inst.drawer = drawer;
        world.update({ ...drawer, previews: world.planet?.previews });
        el.style.setProperty('--pc', drawer.icon?.c || '#2F6BFF');
        const svg = world.querySelector('.planet-critter svg');
        if (svg) fillIcon(svg, drawer.icon, true);
        bus.emit('drawer:changed', drawer);
      } catch (err) {
        toast(err.message);
      }
    }

    function editIcon() {
      const dialog = openDialog({
        title: 'Critter',
        className: 'dialog-wide',
        body: iconEditor(drawer.icon, {
          onSave: (next) => { dialog.close(); setIcon(next); },
          onCancel: () => dialog.close(),
        }),
      });
    }

    async function remove() {
      let orphans = 0;
      try { ({ count: orphans } = await api.get(`/api/drawers/${id}/orphans`)); } catch { /* ask anyway */ }
      const check = h('input', { type: 'checkbox' });
      const extra = orphans
        ? h('label', { class: 'check' }, check, h('span', null, `Also delete ${plural(orphans, 'file')} that only live here`))
        : null;
      const ok = await confirmDialog({
        title: `Delete “${drawer.title}”?`,
        message: 'Its files float off and become stars.',
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
    if (mine) {
      const hint = h('p', { class: 'liv-share-hint' });
      const people = h('div', { class: 'liv-people' });
      const openBox = h('input', { type: 'checkbox', role: 'switch', checked: !!drawer.community });
      const openRow = h('label', { class: 'vswitch liv-open' },
        openBox, h('span', { class: 'vswitch-track' }, h('span', { class: 'vswitch-knob' })), h('span', null, 'Others can add files'));
      const paint = () => {
        hint.textContent = drawer.community ? 'Everyone can look inside and add to it.' : VISIBILITY[drawer.visibility].hint;
        people.hidden = drawer.visibility !== 'people';
        openRow.hidden = drawer.visibility !== 'public' && !drawer.community;
        world.update({ ...drawer, previews: world.planet?.previews });
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
        } catch (err) {
          seg.set(drawer.visibility);
          toast(err.message);
        }
      }, { className: 'liv-seg', label: 'Who can see this planet' });
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
        seg.el, hint, people, openRow);
    }

    const moreBtn = h('button', { type: 'button', class: 'vbtn vbtn-glass vbtn-round', 'aria-label': 'Planet options' }, '•••');
    moreBtn.addEventListener('click', () => openMenu(moreBtn, [
      { label: 'Draw critter…', run: editIcon },
      { label: 'New critter', run: () => setIcon(generateIcon()) },
      '-',
      { label: 'Delete planet…', danger: true, run: remove },
    ], { align: 'end' }));

    const community = !!drawer.community;
    const collection = new Collection({
      blocks: data.blocks,
      drawer,
      entry: mine || community,
      sortable: mine,
      readOnly: !mine && !community,
      moderate: mine && community,
      empty: mine ? null : 'Nothing on this planet yet.',
      onChange: (blocks) => {
        drawer.updatedAt = Date.now();
        drawer.count = blocks.length;
        setMeta(blocks.length);
        world.update({ ...drawer, previews: blocks.slice(0, 12) });
        if (session.stats) session.stats.files = Math.max(session.stats.files, blocks.length);
      },
    });
    // Previews for the big planet's surface come from what's here.
    world.update({ ...drawer, previews: data.blocks.slice(0, 12) });

    const el = h('div', { class: 'page liv', style: { '--pc': drawer.icon?.c || '#2F6BFF' } },
      peel(home, mine ? 'Back to your galaxy' : `Back to @${drawer.owner}’s galaxy`),
      h('header', { class: 'liv-head' },
        h('div', { class: 'liv-world' }, world),
        h('div', { class: 'liv-info' },
          mine ? null : h('p', { class: 'liv-owner' }, h('a', { href: home }, `@${drawer.owner}`), '’s planet', community ? ' · anyone can add' : ''),
          title, desc, meta,
          sharing),
        mine ? h('div', { class: 'liv-tools' }, moreBtn) : null),
      h('div', { class: 'liv-body' }, collection.el));

    const inst = {
      el,
      title: drawer.title,
      drawer,
      chrome: 'planet',
      who: { username: mine ? session.user.username : drawer.owner, you: mine },
      list: () => collection.list(),
      dropTarget: () => collection.dropTarget(),
      pasteText: (text) => collection.pasteText(text),
      destroy: () => collection.destroy(),
    };
    return inst;
  },
};
