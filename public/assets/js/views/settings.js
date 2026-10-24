// Settings: make Mutt look like yours. Changes apply as you pick them.

import { api, sendFile, session } from '../api.js';
import { ACCENTS, DEFAULTS, FONTS, PAPERS, loadFont, parade, setPrefs, updatePrefs } from '../theme.js';
import { LOGOS, logo } from '../logo.js';
import { segmented, toast } from '../ui.js';
import { h } from '../util.js';
import { changePin, deleteAccount, signOut } from '../topbar.js';
import { countLine } from './home.js';

const current = () => ({ ...DEFAULTS, ...session.prefs });

function row(label, control) {
  return h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, label), h('div', { class: 'set-control' }, control));
}

function choice(key, options) {
  const seg = segmented(options, current()[key], (value) => {
    seg.set(value);
    save({ [key]: value });
  }, { className: 'set-seg', label: key });
  return seg.el;
}

function save(patch) {
  updatePrefs(patch, (err) => err && toast(err.message));
}

function swatches(key, colors, { custom = false } = {}) {
  const wrap = h('div', { class: 'swatches' });
  const paint = () => wrap.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-pressed', s.dataset.value === String(current()[key]).toUpperCase() || s.dataset.value === current()[key]));
  for (const [value, color] of colors) {
    wrap.append(h('button', {
      type: 'button', class: 'swatch', dataset: { value }, style: { '--c': color }, 'aria-label': value,
      onclick: () => { save({ [key]: value }); paint(); },
    }));
  }
  if (custom) {
    wrap.append(h('input', {
      type: 'color', class: 'swatch-custom', value: current()[key], 'aria-label': 'Any colour',
      onchange: (e) => { save({ [key]: e.target.value.toUpperCase() }); paint(); },
    }));
  }
  paint();
  return wrap;
}

function fontPicker() {
  const wrap = h('div', { class: 'fonts' });
  const picker = h('input', { type: 'file', accept: '.woff2,.woff,.ttf,.otf', hidden: true });
  const paint = () => {
    const p = current();
    wrap.querySelectorAll('.font-tile').forEach((t) => t.setAttribute('aria-pressed', t.dataset.value === p.font));
    customTile.hidden = !p.fontFile;
    remove.hidden = !p.fontFile;
    customTile.querySelector('.font-name').textContent = p.fontName || 'Yours';
  };
  for (const [key, font] of Object.entries(FONTS)) {
    loadFont(key);
    wrap.append(h('button', {
      type: 'button', class: 'font-tile', dataset: { value: key }, style: { 'font-family': `"${font.family}"` },
      onclick: () => { save({ font: key }); paint(); },
    }, h('span', { class: 'font-aa' }, 'Aa'), h('span', { class: 'font-name' }, font.label)));
  }
  const customTile = h('button', {
    type: 'button', class: 'font-tile', dataset: { value: 'custom' }, style: { 'font-family': '"Mutt Custom"' },
    onclick: () => { save({ font: 'custom' }); paint(); },
  }, h('span', { class: 'font-aa' }, 'Aa'), h('span', { class: 'font-name' }));
  const remove = h('button', {
    type: 'button', class: 'link', onclick: async () => {
      try { setPrefs((await api.del('/api/me/font')).prefs); paint(); } catch (err) { toast(err.message); }
    },
  }, 'Remove');
  const upload = h('button', { type: 'button', class: 'btn btn-sm', onclick: () => picker.click() }, 'Upload font');
  picker.addEventListener('change', async () => {
    const file = picker.files[0];
    picker.value = '';
    if (!file) return;
    upload.disabled = true;
    try {
      const res = await sendFile(`/api/me/font?name=${encodeURIComponent(file.name)}`, file, { type: file.type || 'font/woff2' });
      setPrefs(res.prefs);
      paint();
    } catch (err) {
      toast(err.message);
    } finally {
      upload.disabled = false;
    }
  });
  wrap.append(customTile);
  paint();
  return h('div', null, wrap, h('div', { class: 'font-actions' }, upload, remove, picker));
}

// Each design shown for real; picking one swaps the logo everywhere.
function logoPicker() {
  const wrap = h('div', { class: 'logo-picks' });
  const paint = () => wrap.querySelectorAll('.logo-pick').forEach((t) => t.setAttribute('aria-pressed', t.dataset.value === current().logo));
  for (const { value, label } of LOGOS) {
    const tile = h('button', {
      type: 'button', class: 'logo-pick', dataset: { value }, 'aria-label': label,
      onclick: () => { save({ logo: value }); paint(); },
    }, logo({ href: null, variant: value }), h('span', { class: 'logo-pick-name' }, label));
    wrap.append(tile);
  }
  paint();
  return wrap;
}

function colorfulSwitch() {
  const input = h('input', { type: 'checkbox', role: 'switch', checked: !!current().colorful, 'aria-label': 'Colorful mode' });
  input.addEventListener('change', () => save({ colorful: input.checked }));
  return h('label', { class: 'switch' }, input, h('span', { class: 'switch-track' }, h('span', { class: 'switch-knob' })),
    parade(session.user.username, 4, 18));
}

export const settingsView = {
  load: () => api.get('/api/me'),

  create(params, data) {
    setPrefs(data.prefs);
    session.stats = data.stats;
    const el = h('div', { class: 'page page-settings' },
      h('header', { class: 'page-head' },
        h('h1', { class: 'page-title' }, 'Settings'),
        countLine(data.stats)),
      h('section', { class: 'set-group' },
        row('Logo', logoPicker()),
        row('Colorful', colorfulSwitch()),
        row('Font', fontPicker()),
        row('Size', choice('size', [{ value: 's', label: 'S' }, { value: 'm', label: 'M' }, { value: 'l', label: 'L' }])),
        row('Accent', swatches('accent', ACCENTS.map((c) => [c, c]), { custom: true })),
        row('Paper', swatches('paper', Object.entries(PAPERS))),
        row('Corners', choice('corners', [{ value: 'square', label: 'Square' }, { value: 'soft', label: 'Soft' }, { value: 'round', label: 'Round' }])),
        row('Spacing', choice('density', [{ value: 'tight', label: 'Tight' }, { value: 'normal', label: 'Normal' }, { value: 'airy', label: 'Airy' }])),
        row('Captions', choice('captions', [{ value: 'show', label: 'Show' }, { value: 'hover', label: 'Hover' }, { value: 'hide', label: 'Hide' }])),
        row('Motion', choice('motion', [{ value: 'fluid', label: 'Fluid' }, { value: 'calm', label: 'Calm' }, { value: 'off', label: 'Off' }])),
        row('', h('button', {
          type: 'button', class: 'link', onclick: () => {
            const reset = { ...DEFAULTS };
            delete reset.fontFile;
            updatePrefs(reset);
            setTimeout(() => location.reload(), 450);
          },
        }, 'Reset'))),
      h('section', { class: 'set-group' },
        row('Account', h('div', { class: 'set-actions' },
          h('button', { type: 'button', class: 'btn btn-sm', onclick: changePin }, 'Change code'),
          h('button', { type: 'button', class: 'btn btn-sm', onclick: signOut }, 'Sign out'),
          h('button', { type: 'button', class: 'link is-danger', onclick: deleteAccount }, 'Delete account')))));
    return { el, title: 'Settings' };
  },
};
