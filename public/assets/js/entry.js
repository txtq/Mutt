// The first box in every grid: type, paste a link, or drop/choose files.

import { h } from './util.js';

export function entryCell({ onText, onFiles, placeholder = 'Type here, paste a link, or drop files' } = {}) {
  const textarea = h('textarea', { placeholder, rows: 1, 'aria-label': 'Add a block', spellcheck: 'true' });
  const picker = h('input', { type: 'file', multiple: true, hidden: true });
  const add = h('button', { type: 'button', class: 'entry-add' }, 'Add');
  const box = h('div', { class: 'entry' },
    textarea,
    h('div', { class: 'entry-foot' },
      h('span', { class: 'entry-files' },
        'or ', h('button', { type: 'button', class: 'link', onclick: () => picker.click() }, 'choose files')),
      h('span', { class: 'entry-hint' }, '↵ add · ⇧↵ new line'),
      add),
    h('div', { class: 'entry-drop' }, h('span', null, 'Drop to add')),
    picker);
  const cell = h('div', { class: 'cell cell-entry' }, h('div', { class: 'cell-box' }, h('div', { class: 'cell-fill' }, box)));

  const sync = () => box.classList.toggle('has-text', textarea.value.trim().length > 0);
  const submit = () => {
    const value = textarea.value;
    if (!value.trim()) return;
    textarea.value = '';
    sync();
    onText?.(value);
  };

  textarea.addEventListener('input', sync);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });
  textarea.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      e.preventDefault();
      onFiles?.(files);
    }
  });
  add.addEventListener('click', submit);
  picker.addEventListener('change', () => {
    if (picker.files.length) onFiles?.([...picker.files]);
    picker.value = '';
  });

  let depth = 0;
  box.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    depth++;
    box.classList.add('is-over');
  });
  box.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) box.classList.remove('is-over');
  });
  box.addEventListener('drop', () => {
    depth = 0;
    box.classList.remove('is-over');
  });

  cell.focusText = (text) => {
    if (text != null) {
      textarea.value = text;
      sync();
    }
    textarea.focus();
  };
  return cell;
}

// The home page's version: name a new drawer.
export function newDrawerCell({ onCreate }) {
  const input = h('input', { type: 'text', placeholder: 'New drawer', maxlength: '80', 'aria-label': 'Name a new drawer' });
  const box = h('form', { class: 'entry entry-drawer' },
    h('div', { class: 'entry-drawer-top' }, h('span', { class: 'entry-plus', 'aria-hidden': 'true' }, '+')),
    input,
    h('div', { class: 'entry-foot' }, h('span', { class: 'entry-hint is-on' }, 'Name it, then ↵')));
  box.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = input.value.trim();
    if (!title) { input.focus(); return; }
    input.disabled = true;
    try {
      await onCreate(title);
      input.value = '';
    } finally {
      input.disabled = false;
    }
  });
  box.addEventListener('click', (e) => { if (e.target === box) input.focus(); });
  return h('div', { class: 'cell cell-entry' }, h('div', { class: 'cell-box' }, h('div', { class: 'cell-fill' }, box)));
}
