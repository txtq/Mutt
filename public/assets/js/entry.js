// The first box in every grid: type, paste a link, or drop/choose files.

import { renderIcon } from './pixel.js';
import { critterFor } from './theme.js';
import { h } from './util.js';

export function entryCell({ onText, onFiles } = {}) {
  const textarea = h('textarea', { placeholder: 'Type, paste or drop', rows: 1, 'aria-label': 'Add a file', spellcheck: 'true' });
  const picker = h('input', { type: 'file', multiple: true, hidden: true });
  const add = h('button', { type: 'button', class: 'entry-add' }, 'Add');
  const box = h('div', { class: 'entry' },
    textarea,
    h('div', { class: 'entry-foot' },
      h('button', { type: 'button', class: 'entry-files link', onclick: () => picker.click() }, 'Upload'),
      add),
    h('div', { class: 'entry-drop' }, h('span', null, 'Drop')),
    picker);
  // Only seen in colorful mode: someone peeking over the edge.
  const peek = h('span', { class: 'entry-peek', 'aria-hidden': 'true' },
    renderIcon(critterFor(`entry-${Math.random()}`), { size: 27 }));
  const cell = h('div', { class: 'cell cell-entry' }, h('div', { class: 'cell-box' }, peek, h('div', { class: 'cell-fill' }, box)));

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
