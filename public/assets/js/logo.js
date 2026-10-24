// The Mutt wordmark: a little collage of typefaces with a pixel mutt perched
// on it. On load (and briefly on hover) the letters glitch through blocky
// fonts before settling.

import { blink, renderIcon } from './pixel.js';
import { h, reducedMotion, wait } from './util.js';

// A small dog, drawn on the same 9×9 grid as the drawer critters.
export const MUTT_DOG = {
  px: '001111100'
    + '011111110'
    + '111111111'
    + '112111211'
    + '101111101'
    + '101121101'
    + '001313100'
    + '000111000'
    + '000000000',
  c: '#9A6240',
};

const SETTLED = ['lf-fraunces', 'lf-pixel', 'lf-serif', 'lf-geist'];
const BLOCKY = ['lf-silk', 'lf-rubik', 'lf-pixel', 'lf-space', 'lf-silk', 'lf-rubik'];

export function logo({ big = false, href = '/' } = {}) {
  const letters = [...'Mutt'].map((ch, i) => h('span', { class: `logo-l ${SETTLED[i]}` }, ch));
  const dog = renderIcon(MUTT_DOG, { size: big ? 45 : 18, className: 'logo-dog' });
  const el = h(href ? 'a' : 'div', { class: `logo${big ? ' logo-big' : ''}`, href, 'aria-label': 'Mutt' },
    h('span', { class: 'logo-word', 'aria-hidden': 'true' }, letters),
    dog);
  el.addEventListener('pointerenter', () => glitch(el, { quick: true }));
  return el;
}

let fontsReady;
function logoFonts() {
  fontsReady ||= Promise.race([
    Promise.all([
      'italic 600 1em Fraunces', '600 1em "Pixelify Sans"', 'italic 1em "Instrument Serif"',
      '700 1em Silkscreen', '1em "Rubik Mono One"', '700 1em "Space Mono"',
    ].map((font) => document.fonts.load(font, 'Mutt'))).catch(() => {}),
    wait(1500),
  ]);
  return fontsReady;
}

export async function glitch(el, { quick = false } = {}) {
  if (!el || reducedMotion() || el.classList.contains('is-glitching')) return;
  await logoFonts();
  el.classList.add('is-glitching');
  const letters = [...el.querySelectorAll('.logo-l')];
  await Promise.all(letters.map((letter, i) => new Promise((resolve) => {
    let steps = quick ? 3 + Math.floor(Math.random() * 2) : 7 + Math.floor(Math.random() * 4);
    const tick = () => {
      if (steps-- <= 0) {
        letter.className = `logo-l ${SETTLED[i]}`;
        resolve();
        return;
      }
      letter.className = `logo-l ${BLOCKY[Math.floor(Math.random() * BLOCKY.length)]} is-g`;
      letter.style.setProperty('--gx', `${(Math.random() * 4 - 2).toFixed(1)}px`);
      letter.style.setProperty('--gy', `${(Math.random() * 2 - 1).toFixed(1)}px`);
      setTimeout(tick, 45 + Math.random() * 70);
    };
    setTimeout(tick, i * (quick ? 30 : 75));
  })));
  el.classList.remove('is-glitching');
  blink(el.querySelector('.logo-dog'));
}
