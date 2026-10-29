// The void at the middle of your galaxy is how things get in. It's a real
// black hole (painted by voidart.js). Click it and it sweeps open, the dark
// widening until an add box sits inside it: type a note or paste a link,
// pick where it should go (a loose star, wherever it fits, a planet, or a
// planet you name right there), and add it. Files and stars dropped onto the
// void fall in the same way.

import { center, shockwave } from './fx.js';
import { glyph } from './planets.js';
import { theSky } from './sky.js';
import { h, isEditable } from './util.js';
import { voidArt } from './voidart.js';

const MODES = [
  { value: 'star', label: 'Star', hint: 'Lands as a loose star by the void. Drag it onto a planet later.' },
  { value: 'sort', label: 'Autosort', hint: 'Finds the planet it fits best, or starts a new one.' },
  { value: 'planet', label: 'Planet', hint: 'Goes straight onto the planet you pick.' },
  { value: 'new', label: 'New planet', hint: 'Starts a new planet with this as its first file.' },
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

export function blackHole({ planets = () => [], onText, onFiles, mode: startMode = 'star', onMode } = {}) {
  const v = hole({ tag: 'button', label: 'Add', attrs: { type: 'button', 'aria-label': 'Add something', 'aria-expanded': 'false' } });
  const { core, el, art } = v;
  const label = v.text;

  // ---------------------------------------------------------------- the add box

  const input = h('textarea', {
    class: 'vf-input', rows: 6, placeholder: 'Type, paste a link, or drop a file', 'aria-label': 'A note or link', spellcheck: 'true',
  });
  const picker = h('input', { type: 'file', multiple: true, hidden: true });
  const modeBtns = MODES.map((m) => h('button', { type: 'button', class: 'vf-mode', dataset: { value: m.value }, 'aria-pressed': 'false' }, m.label));
  const modes = h('div', { class: 'vf-modes', role: 'group', 'aria-label': 'Where it goes' }, modeBtns);
  const planetRow = h('div', { class: 'vf-planets', role: 'listbox', 'aria-label': 'Planet' });
  const nameInput = h('input', { class: 'vf-name', type: 'text', maxlength: '80', placeholder: 'Name the new planet', 'aria-label': 'New planet name', spellcheck: 'false' });
  const hint = h('p', { class: 'vf-hint' });
  const go = h('button', { type: 'button', class: 'vf-go' }, 'Add');
  const upload = h('button', { type: 'button', class: 'vf-upload', onclick: () => picker.click() }, glyph('upload', 13), h('span', null, 'Upload'));
  const closeBtn = h('button', { type: 'button', class: 'vf-close' }, 'Close');
  const field = h('div', { class: 'vf-field' }, input, h('div', { class: 'vf-drop' }, h('span', null, 'Drop to add')));
  const sheet = h('div', { class: 'vf', role: 'dialog', 'aria-label': 'Add something' },
    h('header', { class: 'vf-head' }, h('span', { class: 'vf-tab' }, 'Add to the void'), closeBtn),
    field,
    h('div', { class: 'vf-dest' }, h('span', { class: 'vf-label' }, 'Goes to'), modes, planetRow, nameInput, hint),
    h('footer', { class: 'vf-foot' }, upload, go),
    picker);
  el.append(sheet);

  let mode = MODES.some((m) => m.value === startMode) ? startMode : 'star';
  let planetId = null;

  const choices = () => planets().filter((p) => !p.locked);
  function paintPlanets() {
    const list = choices();
    if (!list.some((p) => p.id === planetId)) planetId = list[0]?.id || null;
    planetRow.replaceChildren(...(list.length ? list.map((p) => h('button', {
      type: 'button', class: 'vf-planet', role: 'option', dataset: { id: p.id }, 'aria-selected': String(p.id === planetId),
      style: { '--c': p.icon?.c || '#2F6BFF' },
      onclick: () => { planetId = p.id; paintPlanets(); },
    }, h('span', { class: 'vf-planet-dot' }), h('span', null, p.title))) : [h('span', { class: 'vf-none' }, 'No planets yet. Make one with New planet.')]));
  }
  function setMode(next, { save = true } = {}) {
    mode = next;
    for (const b of modeBtns) b.setAttribute('aria-pressed', String(b.dataset.value === mode));
    planetRow.hidden = mode !== 'planet';
    nameInput.hidden = mode !== 'new';
    hint.textContent = MODES.find((m) => m.value === mode).hint;
    if (mode === 'planet') paintPlanets();
    if (save) onMode?.(mode);
    if (open) fit();
  }
  for (const b of modeBtns) b.addEventListener('click', () => {
    setMode(b.dataset.value);
    if (mode === 'new') nameInput.focus();
  });

  // Where this one is going, or null (with the reason shown) when it can't go yet.
  function destination() {
    if (mode === 'planet') {
      if (!planetId) { hint.textContent = 'Pick a planet first.'; return null; }
      return { mode, planetId };
    }
    if (mode === 'new') {
      const title = nameInput.value.trim();
      if (!title) { nameInput.focus(); hint.textContent = 'Give the new planet a name.'; return null; }
      return { mode, title };
    }
    return { mode };
  }

  let open = false;
  // The dark opens just wide enough to hold the box.
  const fit = () => art.setOpen(1, Math.hypot(sheet.offsetWidth / 2, sheet.offsetHeight / 2) + 14);
  const sync = () => sheet.classList.toggle('has-text', input.value.trim().length > 0);
  const outside = (e) => {
    if (el.contains(e.target) || e.target.closest?.('.toast, .scrim')) return;
    close();
  };
  function show() {
    if (open) return;
    open = true;
    el.classList.add('is-open');
    el.closest('.gx')?.classList.add('is-adding');
    core.setAttribute('aria-expanded', 'true');
    if (mode === 'planet') paintPlanets();
    fit();
    sync();
    setTimeout(() => input.focus({ preventScroll: true }), 380);
    document.addEventListener('pointerdown', outside, true);
  }
  function close() {
    if (!open) return;
    open = false;
    el.classList.remove('is-open', 'is-hungry');
    el.closest('.gx')?.classList.remove('is-adding');
    core.setAttribute('aria-expanded', 'false');
    art.setOpen(0);
    document.removeEventListener('pointerdown', outside, true);
    if (sheet.contains(document.activeElement)) core.focus({ preventScroll: true });
  }
  setMode(mode, { save: false });
  // The box folds itself back into the dark once it's been sent.
  function swallow() {
    el.classList.add('is-swallowing');
    close();
    setTimeout(() => el.classList.remove('is-swallowing'), 520);
  }
  const reset = () => { input.value = ''; nameInput.value = ''; sync(); };

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
  closeBtn.addEventListener('click', close);
  go.addEventListener('click', submit);
  input.addEventListener('input', sync);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  nameInput.addEventListener('keydown', (e) => {
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
