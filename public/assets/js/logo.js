// The Mutt wordmark. Five designs to choose from (Settings → Logo). On load
// the letters flick through a run of typefaces, decoding left to right,
// before landing on the logo.

import { h, reducedMotion, wait } from './util.js';

export const LOGOS = [
  { value: 'wonk', label: 'Wonky' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'stamp', label: 'Stamp' },
  { value: 'wide', label: 'Wide' },
  { value: 'mono', label: 'Mono' },
];
export const DEFAULT_LOGO = 'wonk';

// Faces it flicks through on the way in (family, style, weight). Only the
// letters of "mutt" are downloaded for these (see index.html).
const RUN = [
  ['Bodoni Moda', 'italic', 700], ['Playfair Display', 'normal', 900], ['Unbounded', 'normal', 800],
  ['Big Shoulders Display', 'normal', 900], ['Six Caps', 'normal', 400], ['VT323', 'normal', 400],
  ['Gloock', 'normal', 400], ['Abril Fatface', 'normal', 400], ['DM Serif Display', 'italic', 400],
  ['Cinzel', 'normal', 700], ['Orbitron', 'normal', 800], ['Tilt Warp', 'normal', 400],
  ['Bungee Hairline', 'normal', 400], ['Libre Barcode 128 Text', 'normal', 400], ['Bricolage Grotesque', 'normal', 800],
  ['Space Mono', 'normal', 700], ['Rubik Mono One', 'normal', 400], ['Monoton', 'normal', 400],
  ['Zen Dots', 'normal', 400], ['Climate Crisis', 'normal', 400], ['Sixtyfour', 'normal', 400],
  ['Silkscreen', 'normal', 700], ['Instrument Serif', 'italic', 400], ['Major Mono Display', 'normal', 400],
  ['Syne', 'normal', 800],
];

const current = () => document.documentElement.dataset.logo || DEFAULT_LOGO;

// variant: a fixed design (for previews), or follow the viewer's setting.
export function logo({ big = false, href = '/', variant = null } = {}) {
  const word = h('span', { class: 'logo-word', 'aria-hidden': 'true' }, [...'mutt'].map((ch) => h('span', { class: 'logo-l' }, ch)));
  const el = h(href ? 'a' : 'div', {
    class: `logo${big ? ' logo-big' : ''}`, href, 'aria-label': 'Mutt',
    dataset: { variant: variant || current(), ...(variant ? {} : { follow: '' }) },
  }, word);
  el.addEventListener('pointerenter', () => glitch(el, { quick: true }));
  return el;
}

// Called when the viewer picks another design.
export function followLogo(value) {
  document.querySelectorAll('.logo[data-follow]').forEach((el) => {
    if (el.dataset.variant === value) return;
    el.dataset.variant = value;
    glitch(el, { quick: true });
  });
}

let fontsReady;
function runFonts() {
  fontsReady ||= Promise.race([
    Promise.all(RUN.map(([family, style, weight]) => document.fonts.load(`${style} ${weight} 1em "${family}"`, 'mutt')))
      .catch(() => {}),
    wait(1200),
  ]);
  return fontsReady;
}

const pick = () => RUN[Math.floor(Math.random() * RUN.length)];

function reset(letter) {
  letter.style.removeProperty('font-family');
  letter.style.removeProperty('font-style');
  letter.style.removeProperty('font-weight');
  letter.style.removeProperty('--gx');
  letter.classList.remove('is-inv');
}

export async function glitch(el, { quick = false } = {}) {
  if (!el || reducedMotion() || el.classList.contains('is-glitching')) return;
  await runFonts();
  const word = el.querySelector('.logo-word');
  const letters = [...word.children];
  // Hold the logo's footprint so the bar doesn't jump while letters swap.
  word.style.width = `${word.getBoundingClientRect().width}px`;
  el.classList.add('is-glitching');
  const total = quick ? 420 : 1250;
  const start = performance.now();
  await Promise.all(letters.map((letter, i) => new Promise((resolve) => {
    // Letters land left to right, each a little unpredictably.
    const landAt = total * (0.4 + (0.6 * (i + 1)) / letters.length) * (0.92 + Math.random() * 0.12);
    const step = () => {
      if (performance.now() - start >= landAt) {
        reset(letter);
        letter.classList.remove('is-landed');
        void letter.offsetWidth;
        letter.classList.add('is-landed');
        resolve();
        return;
      }
      const [family, style, weight] = pick();
      letter.style.fontFamily = `"${family}"`;
      letter.style.fontStyle = style;
      letter.style.fontWeight = weight;
      letter.style.setProperty('--gx', `${(Math.random() * 2.4 - 1.2).toFixed(1)}px`);
      letter.classList.toggle('is-inv', Math.random() < 0.07);
      setTimeout(step, 36 + Math.random() * 54);
    };
    step();
  })));
  el.classList.remove('is-glitching');
  word.style.width = '';
}
