// The void at the middle of your galaxy is how things get in. Click it and
// it opens wide, and a fresh sheet of paper rises out of the dark: type a
// note or paste a link, pick where it should go (a loose star, wherever it
// fits, a planet, or a planet you name right there), and drop it in. Files
// and stars dropped onto the void fall in the same way.

import { center, shockwave } from './fx.js';
import { glyph } from './planets.js';
import { theSky } from './sky.js';
import { h, isEditable } from './util.js';

const MODES = [
  { value: 'star', label: 'Star', hint: 'Lands as a loose star by the void. Drag it onto a planet later.' },
  { value: 'sort', label: 'Autosort', hint: 'Finds the planet it fits best, or starts a new one.' },
  { value: 'planet', label: 'Planet', hint: 'Goes straight onto the planet you pick.' },
  { value: 'new', label: 'New planet', hint: 'Starts a new planet with this as its first file.' },
];

export function blackHole({ planets = () => [], onText, onFiles, mode: startMode = 'star', onMode } = {}) {
  const core = h('button', { type: 'button', class: 'void-core', 'aria-label': 'Add something', 'aria-expanded': 'false' },
    h('span', { class: 'void-lens' }),
    h('span', { class: 'void-swirl' }),
    h('span', { class: 'void-ring' }),
    h('span', { class: 'void-hole' }, h('span', { class: 'void-plus' }, glyph('plus', 18))));
  const label = h('span', { class: 'void-label' }, 'Add');

  // ---------------------------------------------------------------- the sheet of paper

  const input = h('textarea', {
    class: 'vf-input', rows: 4, placeholder: 'Write something, or paste a link…', 'aria-label': 'A note or link', spellcheck: 'true',
  });
  const picker = h('input', { type: 'file', multiple: true, hidden: true });
  const modeBtns = MODES.map((m) => h('button', { type: 'button', class: 'vf-mode', dataset: { value: m.value }, 'aria-pressed': 'false' }, m.label));
  const modes = h('div', { class: 'vf-modes', role: 'group', 'aria-label': 'Where it goes' }, modeBtns);
  const planetRow = h('div', { class: 'vf-planets', role: 'listbox', 'aria-label': 'Planet' });
  const nameInput = h('input', { class: 'vf-name', type: 'text', maxlength: '80', placeholder: 'Name the new planet', 'aria-label': 'New planet name', spellcheck: 'false' });
  const hint = h('p', { class: 'vf-hint' });
  const go = h('button', { type: 'button', class: 'vbtn vbtn-blue vf-go' }, 'Drop in');
  const upload = h('button', { type: 'button', class: 'vbtn vf-upload', onclick: () => picker.click() }, glyph('upload', 13), h('span', null, 'Upload'));
  const closeBtn = h('button', { type: 'button', class: 'vf-close', 'aria-label': 'Close' }, '×');
  const sheet = h('div', { class: 'vf', role: 'dialog', 'aria-label': 'Add something' },
    h('div', { class: 'vf-paper' },
      h('header', { class: 'vf-head' }, h('span', { class: 'vf-tab' }, 'New file'), closeBtn),
      input,
      h('div', { class: 'vf-dest' }, h('span', { class: 'vf-label' }, 'Goes to'), modes, planetRow, nameInput, hint),
      h('footer', { class: 'vf-foot' }, upload, go)),
    picker);
  const el = h('div', { class: 'void' }, core, label, sheet);

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
  }
  for (const b of modeBtns) b.addEventListener('click', () => {
    setMode(b.dataset.value);
    if (mode === 'new') nameInput.focus();
  });
  setMode(mode, { save: false });

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
  const outside = (e) => {
    if (el.contains(e.target) || e.target.closest?.('.toast, .scrim')) return;
    close();
  };
  function show() {
    if (open) return;
    open = true;
    el.classList.add('is-open');
    core.setAttribute('aria-expanded', 'true');
    if (mode === 'planet') paintPlanets();
    setTimeout(() => input.focus({ preventScroll: true }), 220);
    document.addEventListener('pointerdown', outside, true);
  }
  function close() {
    if (!open) return;
    open = false;
    el.classList.remove('is-open');
    core.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    if (sheet.contains(document.activeElement)) core.focus({ preventScroll: true });
  }
  // The sheet folds itself back into the dark once it's been sent.
  function swallow() {
    el.classList.add('is-swallowing');
    close();
    setTimeout(() => el.classList.remove('is-swallowing'), 520);
  }
  const reset = () => { input.value = ''; nameInput.value = ''; };

  const submit = () => {
    const value = input.value;
    if (!value.trim()) { input.focus(); return; }
    const dest = destination();
    if (!dest) return;
    const from = input.getBoundingClientRect();
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
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); input.value.trim() ? submit() : input.focus(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  input.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    sendFiles(files, input.getBoundingClientRect());
  });
  picker.addEventListener('change', () => {
    const files = [...picker.files];
    picker.value = '';
    if (files.length) sendFiles(files, upload.getBoundingClientRect());
  });

  return {
    el,
    core,
    open: show,
    close,
    isOpen: () => open,
    mode: () => mode,
    setMode: (next) => setMode(next, { save: false }),
    // Type straight into it (pasting text anywhere on the galaxy lands here).
    focusText(text) {
      show();
      if (text != null && !isEditable(document.activeElement)) input.value = text;
    },
    center: () => center(core.querySelector('.void-hole').getBoundingClientRect()),
    radius: () => core.querySelector('.void-hole').getBoundingClientRect().width / 2,
    // Something is hovering over it, about to fall in.
    hover(on) { el.classList.toggle('is-hungry', on); },
    // Swallowed: the dark ripples and the stars lean in.
    gulp() {
      el.classList.remove('is-gulping');
      void el.offsetWidth;
      el.classList.add('is-gulping');
      setTimeout(() => el.classList.remove('is-gulping'), 800);
      const at = this.center();
      shockwave(at, { size: this.radius() * 2, color: 'rgba(200, 210, 235, 0.35)' });
      theSky()?.pull(at.x, at.y, { strength: 0.8, radius: 380 });
    },
    setLabel(text) { label.textContent = text; },
  };
}
