// The first box on a planet's grid: type, paste a link, or drop/choose files.
// A sunken slot (DESIGN.md "File box": the add box); while files are dragged
// over it, it is .is-over and its edge lights like any text box being typed in.

import { h } from './util.js';

export function entryCell({ onText, onFiles } = {}) {
  const textarea = h('textarea', { placeholder: 'Type, paste or drop', rows: 1, 'aria-label': 'Add a file', spellcheck: 'true' });
  const picker = h('input', { type: 'file', multiple: true, hidden: true });
  const add = h('button', { type: 'button', class: 'btn btn-main btn-small entry-add' }, 'Add');
  const box = h('div', { class: 'entry' },
    textarea,
    h('div', { class: 'entry-foot' },
      h('button', { type: 'button', class: 'entry-files btn btn-quiet btn-small', onclick: () => picker.click() }, 'Upload'),
      add),
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
