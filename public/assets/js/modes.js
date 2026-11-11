// The page's half of the mode registry: every way a planet can show itself
// other than as plain files. The server's half is mutt/modes.py (the trigger,
// the two bars, saved settings); the keys match. CLAUDE.md, "How to add a
// mode", is the recipe.
//
// A mode is one entry here plus its own file, which is only fetched when a
// planet uses it (`load`). Everything else is shared by views/planet.js: the
// offer box, the ••• menu, turning on and off, Undo, stepping back.
//
//   label     what its ••• menu item says while it's off
//   name      how it's named mid-sentence ("a list")
//   moons     whether a moon can be one (same as the server's entry)
//   load      fetches its code; the module is handed to the calls below as `m`
//   view      (m, page, blocks, extra) builds its view from the planet's files
//   start     (m, page) turns it on at the server; gives { view, say, after }
//   blocks    (view) the files its view holds, for showing them as files again
//   offer     (signs) the words of its offer: { title, note, accept, busy, icon }
//   menu      (page) what the ••• menu holds while it's on
//   leave     (page) puts away anything of its own when the page goes
//   pageClass a class the page wears while it's on
//   ownEntrance  true when its view animates itself in
//
// `page` is what views/planet.js lends a mode: drawer (always the latest),
// id, mine, changed, targets, makeCollection, filesNow, setDrawer, patchMode,
// saveMode, turnOff, modeView, docs and a `state` object to keep things in.

import { api } from './api.js';
import { plural } from './util.js';

const notTmp = (b) => !String(b.id).startsWith('tmp-');
const showAsFiles = (page, key) => ({ label: 'Show as files again', run: () => page.turnOff(key) });

// From the list's own ⋯ button (anchor), or the planet's ••• menu.
function listOptions(m, page, anchor) {
  const st = page.state;
  if (st.listPanel) { st.listPanel.close(); st.listPanel = null; if (anchor) return; }
  anchor?.setAttribute('aria-expanded', 'true');
  st.listPanel = m.listSettings({
    anchor,
    onClose: () => { st.listPanel = null; },
    options: page.drawer.modes?.list,
    onChange: (patch) => { page.modeView('list')?.setOptions(patch); page.saveMode('list', patch); },
    onTurnOff: () => page.turnOff('list'),
  });
}

export const MODES = {
  list: {
    label: 'Make it a list',
    name: 'a list',
    moons: true,
    ownEntrance: true,
    load: () => import('./listmode.js'),
    view: (m, page, blocks) => new m.ListView({
      blocks, drawer: page.drawer, editable: page.mine, options: page.drawer.modes?.list, onChange: page.changed,
      onOptions: (anchor) => listOptions(m, page, anchor), targets: page.targets,
    }),
    start: async (m, page) => {
      const res = await api.post(`/api/drawers/${page.id}/listify`, {});
      page.setDrawer(res.drawer);
      return {
        view: MODES.list.view(m, page, res.blocks),
        after: () => page.changed(res.blocks),
        say: res.split ? `Now a list. ${plural(res.split, 'note')} became one item per line.` : 'Now a list',
      };
    },
    blocks: (v) => v.blocks.filter(notTmp),
    offer: (signs) => ({
      icon: 'lm-offer-icon',
      title: 'This planet looks like a list',
      note: !signs.split?.length ? null : signs.split.length === 1
        ? 'The note written as a list will become one item per line.'
        : `The ${signs.split.length} notes written as lists will become one item per line.`,
      accept: 'Make it a list',
      busy: 'Making it a list…',
    }),
    menu: (page) => [{ label: 'List options…', run: () => listOptions(codeOf('list'), page) }],
    leave: (page) => page.state.listPanel?.close(),
  },

  reading: {
    label: 'Make it a reading planet',
    name: 'a bookshelf',
    moons: false,
    load: () => import('./reading.js'),
    view: (m, page, blocks) => new m.ShelfView({
      drawer: page.drawer, blocks, editable: page.mine, makeCollection: page.makeCollection, onChange: page.changed,
    }),
    start: async (m, page) => {
      const blocks = page.filesNow();
      await page.patchMode('reading', { on: true, dismissed: false });
      return { view: MODES.reading.view(m, page, blocks), say: 'Now a reading planet' };
    },
    blocks: (v) => v.blocks,
    offer: (signs) => ({
      kind: 'rp-offer',
      icon: 'rp-offer-icon',
      title: 'This planet looks like a bookshelf',
      note: signs.pdfs
        ? 'Books stand on a shelf by their cover, and open in a reader that keeps your place, highlights and notes. PDFs can be turned into reading format when you open them.'
        : 'Books stand on a shelf by their cover, and open in a reader that keeps your place, highlights and notes.',
      accept: 'Make it a reading planet',
      busy: 'Making it a reading planet…',
    }),
    menu: (page) => [showAsFiles(page, 'reading')],
  },

  cookbook: {
    label: 'Make it a cookbook',
    name: 'a cookbook',
    moons: false,
    load: () => import('./cookbook.js'),
    view: (m, page, blocks, box = null) => new m.RecipeBoxView({
      drawer: page.drawer, blocks, box, editable: page.mine, makeCollection: page.makeCollection, onChange: page.changed,
    }),
    start: async (m, page) => {
      const blocks = page.filesNow();
      const res = await api.post(`/api/drawers/${page.id}/cookify`, {});
      page.setDrawer(res.drawer);
      const n = res.box.recipes.length;
      return {
        view: MODES.cookbook.view(m, page, blocks, res.box),
        say: n ? `Now a cookbook: ${plural(n, 'recipe')} in the box` : 'Now a cookbook',
      };
    },
    blocks: (v) => v.list(),
    offer: () => ({
      kind: 'cb-offer',
      icon: 'cb-offer-icon',
      strokes: 2,
      title: 'This planet looks like a cookbook',
      note: 'Recipes become index cards in a recipe box, sorted into chapters. Each card has the amounts (scaled for however many you’re cooking for, in metric or US), the method, your notes and a photo of the finished dish, and a cooking mode that goes one step at a time.',
      accept: 'Make it a cookbook',
      busy: 'Reading the recipes…',
    }),
    menu: (page) => [showAsFiles(page, 'cookbook')],
  },

  documents: {
    label: 'Open in Mutt Documents',
    name: 'a desk of writing',
    moons: true,
    pageClass: 'is-desk',
    load: () => import('./docs.js'),
    view: (m, page, blocks) => new m.DeskView({
      drawer: page.drawer, blocks, editable: page.mine, makeCollection: page.makeCollection, onChange: page.changed,
      onOpen: (bid) => page.docs.open(bid), onNew: () => page.docs.create(),
      onSort: (sort) => page.saveMode('documents', { sort }),
    }),
    start: async (m, page) => {
      const blocks = page.filesNow();
      await page.patchMode('documents', { on: true, dismissed: false });
      return { view: MODES.documents.view(m, page, blocks), say: 'Now in Mutt Documents' };
    },
    blocks: (v) => v.list(),
    offer: () => ({
      kind: 'dk-offer',
      icon: 'dk-offer-icon',
      strokes: 2,
      title: 'This planet looks like writing',
      note: 'Its notes become documents on paper pages, with headings, page setup, comments, versions, and downloads as PDF or Word. Poems are set as poems.',
      accept: 'Open it in Mutt Documents',
      busy: 'Opening…',
    }),
    menu: (page) => [{ label: 'New document', run: () => page.docs.create() }, showAsFiles(page, 'documents')],
  },

};

// A planet saved with more than one mode on shows the first of these.
export const SHOW_ORDER = ['list', 'reading', 'documents', 'cookbook'];
// Which is suggested first when a planet fits more than one.
export const OFFER_ORDER = ['reading', 'cookbook', 'documents', 'list'];
// The order they stand in the ••• menu.
export const MENU_ORDER = ['list', 'reading', 'cookbook', 'documents'];

export const allowed = (key, drawer) => MODES[key].moons || !drawer.parentId;

// The mode a planet opens in, if one is on.
export const startMode = (drawer) => SHOW_ORDER.find((key) => allowed(key, drawer) && drawer.modes?.[key]?.on) || null;

// A mode's code, fetched the first time a planet needs it and kept.
const code = {};
export const codeOf = (key) => code[key];
export async function loadMode(key) {
  if (!code[key]) code[key] = await MODES[key].load();
  return code[key];
}
