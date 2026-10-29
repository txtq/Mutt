// The black hole at the middle of your galaxy is how things get in. Click
// it to type, paste a link or upload; drop files or stars onto it. What goes
// in spirals down and comes back out as a star, or, with Autosort on, shoots
// off to the planet it belongs on.

import { center, shockwave } from './fx.js';
import { glyph } from './planets.js';
import { theSky } from './sky.js';
import { h, isEditable } from './util.js';

export function blackHole({ onText, onFiles, autosort = false, onAutosort } = {}) {
  const spinners = () => [...core.querySelectorAll('.bh-disk-spin')];
  const dust = h('span', { class: 'bh-dust' },
    Array.from({ length: 7 }, (_, i) => h('span', { class: 'bh-mote', style: { '--i': i } })));
  const core = h('button', { type: 'button', class: 'bh-core', 'aria-label': 'Add something to your galaxy', 'aria-expanded': 'false' },
    h('span', { class: 'bh-glow' }),
    h('span', { class: 'bh-plane bh-back' }, h('span', { class: 'bh-disk' }, h('span', { class: 'bh-disk-spin' })), dust),
    h('span', { class: 'bh-halo' }),
    h('span', { class: 'bh-horizon' }),
    h('span', { class: 'bh-plane bh-front' }, h('span', { class: 'bh-disk' }, h('span', { class: 'bh-disk-spin' }))));
  const label = h('span', { class: 'bh-label' }, 'Add');

  const input = h('textarea', {
    class: 'bh-input', rows: 3, placeholder: 'Type a note, or paste a link…', 'aria-label': 'A note or link', spellcheck: 'true',
  });
  const picker = h('input', { type: 'file', multiple: true, hidden: true });
  const sortBox = h('input', { type: 'checkbox', role: 'switch', checked: autosort });
  const sortLabel = h('label', { class: 'vswitch', title: 'Send new things straight to the planet they fit' },
    sortBox, h('span', { class: 'vswitch-track' }, h('span', { class: 'vswitch-knob' })), h('span', null, 'Autosort'));
  const go = h('button', { type: 'button', class: 'vbtn vbtn-blue bh-go' }, 'Drop in');
  const upload = h('button', { type: 'button', class: 'vbtn bh-upload', onclick: () => picker.click() }, glyph('upload', 13), h('span', null, 'Upload'));
  const hint = h('p', { class: 'bh-hint' });
  const panel = h('div', { class: 'bh-panel', role: 'dialog', 'aria-label': 'Add to your galaxy' },
    input,
    h('div', { class: 'bh-foot' }, upload, sortLabel, go),
    hint,
    picker);
  const el = h('div', { class: 'bh' }, core, label, panel);

  const setHint = () => {
    hint.textContent = sortBox.checked
      ? 'New things find their own planet.'
      : 'New things become stars. Drag them onto planets.';
  };
  setHint();

  let open = false;
  const outside = (e) => { if (!el.contains(e.target)) close(); };
  function show() {
    if (open) return;
    open = true;
    el.classList.add('is-open');
    core.setAttribute('aria-expanded', 'true');
    setTimeout(() => input.focus({ preventScroll: true }), 60);
    document.addEventListener('pointerdown', outside, true);
  }
  function close() {
    if (!open) return;
    open = false;
    el.classList.remove('is-open');
    core.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    if (panel.contains(document.activeElement)) core.focus({ preventScroll: true });
  }

  const submit = () => {
    const value = input.value;
    if (!value.trim()) { input.focus(); return; }
    const from = input.getBoundingClientRect();
    input.value = '';
    close();
    onText?.(value, from, sortBox.checked);
  };

  core.addEventListener('click', () => (open ? close() : show()));
  core.addEventListener('pointerenter', () => speed(2.6));
  core.addEventListener('pointerleave', () => speed(1));
  go.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  input.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    const from = input.getBoundingClientRect();
    close();
    onFiles?.(files, from, sortBox.checked);
  });
  picker.addEventListener('change', () => {
    const files = [...picker.files];
    picker.value = '';
    if (!files.length) return;
    const from = upload.getBoundingClientRect();
    close();
    onFiles?.(files, from, sortBox.checked);
  });
  sortBox.addEventListener('change', () => { setHint(); onAutosort?.(sortBox.checked); });

  function speed(rate) {
    for (const s of spinners()) for (const a of s.getAnimations()) a.updatePlaybackRate(rate);
  }

  return {
    el,
    core,
    open: show,
    close,
    isOpen: () => open,
    autosort: () => sortBox.checked,
    setAutosort(on) { sortBox.checked = on; setHint(); },
    // Type straight into it (pasting text anywhere on the galaxy lands here).
    focusText(text) {
      show();
      if (text != null && !isEditable(document.activeElement)) input.value = text;
    },
    center: () => center(core.querySelector('.bh-horizon').getBoundingClientRect()),
    // Something is hovering over it, about to fall in.
    hover(on) {
      el.classList.toggle('is-hungry', on);
      speed(on ? 4 : 1);
    },
    // Swallowed: a shudder, a flash, a ring of light.
    gulp() {
      el.classList.remove('is-gulping');
      void el.offsetWidth;
      el.classList.add('is-gulping');
      setTimeout(() => el.classList.remove('is-gulping'), 800);
      const at = this.center();
      shockwave(at, { size: 150, color: 'rgba(170, 190, 255, 0.75)' });
      theSky()?.pull(at.x, at.y, { strength: 1.2, radius: 420 });
    },
    setLabel(text) { label.textContent = text; },
  };
}
