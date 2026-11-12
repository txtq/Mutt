// The void at the middle of your galaxy is how things get in. It's a real
// black hole (painted by voidart.js). Click it and it sweeps open, the dark
// widening until an add box sits inside it: type a note or paste a link,
// pick where it should go (a loose star, wherever it fits, a planet, or a
// planet you name right there), and add it. Files and stars dropped onto the
// void fall in the same way.

import { center, shockwave } from './fx.js';
import { glyph } from './planets.js';
import { theSky } from './sky.js';
import { h, isEditable, touchScreen } from './util.js';
import { voidArt } from './voidart.js';

const MODES = [
  { value: 'star', label: 'Star', hint: 'A loose star by the void' },
  { value: 'sort', label: 'Autosort', hint: 'The planet it fits best' },
  { value: 'planet', label: 'Planet' },
  { value: 'new', label: 'New planet' },
];


// The painted hole plus the parts every void shares: something to measure
// (the dark's centre and size) and a label in the middle of the dark.
function hole({ tag = 'div', label = '', attrs = {} } = {}) {
  const art = voidArt();
  const mark = h('span', { class: 'void-hole' });
  const text = h('span', { class: 'void-label' }, label);
  const core = h(tag, { class: 'void-core', ...attrs }, mark, h('span', { class: 'void-mid' }, tag === 'button' ? h('span', { class: 'void-plus' }, glyph('plus', 16)) : null, text));
  const el = h('div', { class: 'void' }, core);
  return {
    art, core, text, el,
    // Size the dark (radius r) for a page w × hgt.
    size(r, w, hgt) {
      el.style.setProperty('--vr', `${r}px`);
      art.resize(r, w, hgt);
    },
    center: () => center(mark.getBoundingClientRect()),
    radius: () => art.radius(),
  };
}

// Someone else's galaxy: the same black hole, with their name in it.
export function stillVoid(name) {
  const v = hole({ label: name });
  v.el.classList.add('is-still');
  return {
    el: v.el,
    art: v.art.el,
    size: v.size,
    center: v.center,
    radius: v.radius,
    play: () => v.art.play(),
    pause: () => v.art.pause(),
    destroy: () => v.art.destroy(),
  };
}

export function blackHole({ planets = () => [], onText, onFiles, mode: startMode = 'star', onMode, onToggle } = {}) {
  const v = hole({ tag: 'button', label: 'Add', attrs: { type: 'button', 'aria-label': 'Add something', 'aria-expanded': 'false' } });
  const { core, el, art } = v;
  const label = v.text;

  // ---------------------------------------------------------------- the add box
  // Writing comes first: the text sits straight on the light with no frame,
  // and grows as you write. Under it, one quiet line: upload, where it goes
  // (a single choice that opens a short list), and Add.

  const input = h('textarea', {
    class: 'vf-input', rows: 4, placeholder: 'Write something, or paste a link', 'aria-label': 'A note or link', spellcheck: 'true',
  });
  const picker = h('input', { type: 'file', multiple: true, hidden: true });
  const whereDot = h('span', { class: 'vf-where-dot' });
  const whereText = h('span', { class: 'vf-where-text' });
  const where = h('button', { type: 'button', class: 'vf-where', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', title: 'Where it goes' },
    h('span', { class: 'vf-where-to' }, 'To'), whereDot, whereText, glyph('caret', 12));
  const list = h('div', { class: 'vf-list', role: 'listbox', 'aria-label': 'Where it goes', hidden: true });
  const nameInput = h('input', { class: 'vf-name', type: 'text', maxlength: '80', placeholder: 'Name it', 'aria-label': 'New planet name', spellcheck: 'false' });
  const go = h('button', { type: 'button', class: 'vf-go' }, 'Add', h('kbd', { class: 'vf-keys' }, /Mac|iP/.test(navigator.platform) ? '⌘↵' : 'Ctrl ↵'));
  const upload = h('button', { type: 'button', class: 'vf-upload', title: 'Upload files', 'aria-label': 'Upload files', onclick: () => picker.click() }, glyph('upload', 15));
  const field = h('div', { class: 'vf-field' }, input, h('div', { class: 'vf-drop' }, h('span', null, 'Drop to add')));
  const sheet = h('div', { class: 'vf', role: 'dialog', 'aria-label': 'Add something' },
    field,
    h('footer', { class: 'vf-foot' }, upload, where, nameInput, go),
    list,
    picker);
  el.append(sheet);

  let mode = MODES.some((m) => m.value === startMode) ? startMode : 'star';
  let planetId = null;

  const choices = () => planets().filter((p) => !p.locked);
  const chosen = () => choices().find((p) => p.id === planetId);

  // The one button says where it's going; the planet's colour shows as a dot.
  function paintWhere() {
    const planet = mode === 'planet' ? chosen() : null;
    whereText.textContent = planet ? planet.title : MODES.find((m) => m.value === mode).label;
    whereDot.hidden = !planet;
    if (planet) whereDot.style.setProperty('--c', planet.icon?.c || '#2F6BFF');
    nameInput.hidden = mode !== 'new';
  }
  function setMode(next, { save = true, planet } = {}) {
    mode = next;
    if (planet) planetId = planet;
    if (mode === 'planet' && !chosen()) mode = 'star';
    paintWhere();
    if (save) onMode?.(mode);
  }

  // The short list of places: a star, autosort, each planet, or a new one.
  function option(label, { hint: note, dot, selected, pick }) {
    return h('button', {
      type: 'button', class: 'vf-opt', role: 'option', 'aria-selected': String(selected),
      onclick: () => { pick(); hideList(); },
    }, dot ? h('span', { class: 'vf-where-dot', style: { '--c': dot } }) : null, h('span', { class: 'vf-opt-label' }, label), note ? h('span', { class: 'vf-opt-hint' }, note) : null);
  }
  function showList() {
    const planetsHere = choices();
    list.replaceChildren(
      ...MODES.filter((m) => m.value !== 'planet' && m.value !== 'new').map((m) => option(m.label, { hint: m.hint, selected: mode === m.value, pick: () => setMode(m.value) })),
      planetsHere.length ? h('div', { class: 'vf-sep' }) : null,
      ...planetsHere.map((p) => option(p.title, { dot: p.icon?.c || '#2F6BFF', selected: mode === 'planet' && p.id === planetId, pick: () => setMode('planet', { planet: p.id }) })),
      h('div', { class: 'vf-sep' }),
      option('New planet…', { selected: mode === 'new', pick: () => { setMode('new'); nameInput.focus(); } }));
    list.hidden = false;
    where.setAttribute('aria-expanded', 'true');
    (list.querySelector('[aria-selected="true"]') || list.querySelector('.vf-opt'))?.focus({ preventScroll: true });
  }
  function hideList({ refocus = false } = {}) {
    if (list.hidden) return;
    list.hidden = true;
    where.setAttribute('aria-expanded', 'false');
    if (refocus) where.focus({ preventScroll: true });
  }
  where.addEventListener('click', () => (list.hidden ? showList() : hideList()));
  sheet.addEventListener('pointerdown', (e) => { if (!list.contains(e.target) && !where.contains(e.target)) hideList(); });
  list.addEventListener('keydown', (e) => {
    const opts = [...list.querySelectorAll('.vf-opt')];
    const i = opts.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      opts[(i + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length]?.focus();
    }
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); hideList({ refocus: true }); }
  });

  // Where this one is going, or null when it can't go yet.
  function destination() {
    if (mode === 'planet') {
      if (!chosen()) { setMode('star', { save: false }); showList(); return null; }
      return { mode, planetId };
    }
    if (mode === 'new') {
      const title = nameInput.value.trim();
      if (!title) {
        nameInput.focus();
        nameInput.classList.remove('is-wanted');
        void nameInput.offsetWidth;
        nameInput.classList.add('is-wanted');
        return null;
      }
      return { mode, title };
    }
    return { mode };
  }

  let open = false;
  // The dark opens just wide enough to hold the box.
  const fit = () => art.setOpen(1, Math.hypot(sheet.offsetWidth / 2, sheet.offsetHeight / 2) + 14);
  // The text grows with what you write (up to a point, then it scrolls), and
  // the light widens with it.
  let tall = 0;
  const grow = () => {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
    if (open && input.offsetHeight !== tall) { tall = input.offsetHeight; fit(); }
  };
  const sync = () => {
    sheet.classList.toggle('has-text', input.value.trim().length > 0);
    grow();
  };
  const outside = (e) => {
    if (el.contains(e.target) || e.target.closest?.('.toast, .scrim')) return;
    if (!list.hidden) { hideList(); return; }
    close();
  };

  // A phone's keyboard covers the bottom half of the screen. While it's up,
  // the whole galaxy rises until the box sits just above it, but never so
  // far that the box slips under the top bar.
  const vv = window.visualViewport;
  let lifted = 0;
  let liftFrame = 0;
  let lowering = 0;
  const raise = (gx, by) => {
    lifted = by;
    gx.style.translate = by ? `0 ${-by}px` : '';
  };
  const lift = () => {
    cancelAnimationFrame(liftFrame);
    liftFrame = requestAnimationFrame(() => {
      const gx = el.closest('.gx');
      if (!gx || !open || !vv) return;
      const now = getComputedStyle(gx).translate;
      const moved = now === 'none' ? 0 : parseFloat(now.split(' ')[1]) || 0;
      const r = sheet.getBoundingClientRect();
      const mid = (r.top + r.bottom) / 2 - moved;
      const half = sheet.offsetHeight / 2;
      const bar = document.querySelector('.sb')?.offsetHeight || 0;
      const want = Math.min(mid + half + 16 - (vv.offsetTop + vv.height), mid - half - (vv.offsetTop + bar + 12));
      const by = Math.max(0, Math.round(want));
      if (Math.abs(by - lifted) > 1) raise(gx, by);
    });
  };
  const watchKeyboard = (on) => {
    if (!vv) return;
    const fn = on ? 'addEventListener' : 'removeEventListener';
    vv[fn]('resize', lift);
    vv[fn]('scroll', lift);
  };

  function show() {
    if (open) return;
    open = true;
    clearTimeout(lowering);
    el.classList.add('is-open');
    el.closest('.gx')?.classList.add('is-adding');
    core.setAttribute('aria-expanded', 'true');
    setMode(mode, { save: false });
    sync();
    tall = input.offsetHeight;
    fit();
    onToggle?.(true);
    // A phone only brings up its keyboard for a field focused right on the tap.
    if (touchScreen()) input.focus({ preventScroll: true });
    else setTimeout(() => input.focus({ preventScroll: true }), 380);
    document.addEventListener('pointerdown', outside, true);
    watchKeyboard(true);
    lift();
  }
  function close() {
    if (!open) return;
    open = false;
    hideList();
    el.classList.remove('is-open', 'is-hungry');
    el.closest('.gx')?.classList.remove('is-adding');
    core.setAttribute('aria-expanded', 'false');
    art.setOpen(0);
    document.removeEventListener('pointerdown', outside, true);
    watchKeyboard(false);
    cancelAnimationFrame(liftFrame);
    if (sheet.contains(document.activeElement)) core.focus({ preventScroll: true });
    onToggle?.(false);
    // Something sent falls into the void first, then the galaxy settles back.
    const gx = el.closest('.gx');
    if (gx && lifted) lowering = setTimeout(() => raise(gx, 0), el.classList.contains('is-swallowing') ? 900 : 0);
  }
  setMode(mode, { save: false });
  // The box folds itself back into the dark once it's been sent.
  function swallow() {
    el.classList.add('is-swallowing');
    close();
    setTimeout(() => el.classList.remove('is-swallowing'), 520);
  }
  const reset = () => {
    input.value = '';
    // A new planet exists once it's sent; next time it's just that planet.
    if (mode === 'new') { nameInput.value = ''; setMode('star', { save: false }); }
    sync();
  };

  const submit = () => {
    const value = input.value;
    if (!value.trim()) { input.focus(); return; }
    const dest = destination();
    if (!dest) return;
    const from = field.getBoundingClientRect();
    reset();
    swallow();
    onText?.(value, from, dest);
  };
  const sendFiles = (files, from) => {
    const dest = destination();
    if (!dest) return false;
    reset();
    swallow();
    onFiles?.(files, from, dest);
    return true;
  };

  core.addEventListener('click', () => (open ? close() : show()));
  go.addEventListener('click', submit);
  input.addEventListener('input', sync);
  // Return starts a new line, so a longer note is easy to write; ⌘/Ctrl+Return adds.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  nameInput.addEventListener('keydown', (e) => {
    nameInput.classList.remove('is-wanted');
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); input.value.trim() ? submit() : input.focus(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  input.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    sendFiles(files, field.getBoundingClientRect());
  });
  picker.addEventListener('change', () => {
    const files = [...picker.files];
    picker.value = '';
    if (files.length) sendFiles(files, upload.getBoundingClientRect());
  });

  return {
    el,
    core,
    art: art.el,
    size: v.size,
    play: () => art.play(),
    pause: () => art.pause(),
    destroy: () => { close(); art.destroy(); },
    open: show,
    close,
    isOpen: () => open,
    mode: () => mode,
    setMode: (next) => setMode(next, { save: false }),
    // Files dropped while the box is open go where the box says.
    takeFiles: (files, from) => sendFiles(files, from || field.getBoundingClientRect()),
    // Type straight into it (pasting text anywhere on the galaxy lands here).
    focusText(text) {
      show();
      if (text != null && !isEditable(document.activeElement)) { input.value = text; sync(); }
    },
    center: v.center,
    radius: v.radius,
    // Files are being dragged over the window: a ring opens round it (the drop hint).
    ring(on) {
      if (!on && !this.ringEl) return;
      this.ringEl ||= el.appendChild(h('span', { class: 'drop-ring', 'aria-hidden': 'true' }));
      void this.ringEl.offsetWidth;
      this.ringEl.classList.toggle('is-on', on);
    },
    // Something is hovering over it, about to fall in.
    hover(on) {
      el.classList.toggle('is-hungry', on);
      art.hungry(on);
    },
    // Swallowed: the dark ripples and the stars lean in.
    gulp() {
      el.classList.remove('is-gulping');
      void el.offsetWidth;
      el.classList.add('is-gulping');
      setTimeout(() => el.classList.remove('is-gulping'), 800);
      art.gulp();
      const at = this.center();
      shockwave(at, { size: this.radius() * 2.2, color: 'rgba(200, 210, 235, 0.3)' });
      theSky()?.pull(at.x, at.y, { strength: 0.8, radius: this.radius() * 4 });
    },
    setLabel(text) { label.textContent = text; },
  };
}
