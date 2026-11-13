// The Mutt wordmark: one design, the Wonky (DESIGN.md, "The logo"). On load,
// and when pointed at, its letters flick through a run of typefaces, decoding
// left to right, before landing back on the logo.

import { h, reducedMotion, wait } from './util.js';

// The typefaces the letters flick through. Only the letters of "mutt" are
// downloaded for these, and only the first time the flicker runs, never up
// front: the page doesn't wait for them. (The logo's own face, Fraunces, is
// linked by index.html.)
const FACES = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Syne:wght@800&family=Major+Mono+Display&family=Silkscreen:wght@400;700&family=Bodoni+Moda:ital,wght@1,700&family=Playfair+Display:wght@900&family=Unbounded:wght@800&family=Big+Shoulders+Display:wght@900&family=Six+Caps&family=VT323&family=Gloock&family=Abril+Fatface&family=DM+Serif+Display:ital@1&family=Cinzel:wght@700&family=Orbitron:wght@800&family=Tilt+Warp&family=Bungee+Hairline&family=Libre+Barcode+128+Text&family=Bricolage+Grotesque:wght@800&family=Space+Mono:wght@700&family=Rubik+Mono+One&family=Monoton&family=Zen+Dots&family=Climate+Crisis&family=Sixtyfour&text=MUTTmutt&display=swap';
let facesAsked;
function loadFaces() {
  facesAsked ||= new Promise((done) => {
    const link = h('link', { rel: 'stylesheet', href: FACES });
    link.onload = link.onerror = () => done();
    document.head.append(link);
  });
  return facesAsked;
}

// Faces it flicks through on the way in (family, style, weight).
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

export function logo({ big = false, href = '/' } = {}) {
  const word = h('span', { class: 'logo-word', 'aria-hidden': 'true' }, [...'mutt'].map((ch) => h('span', { class: 'logo-l' }, ch)));
  const el = h(href ? 'a' : 'div', { class: `logo${big ? ' logo-big' : ''}`, href, 'aria-label': 'Mutt' }, word);
  el.addEventListener('pointerenter', () => glitch(el, { quick: true }));
  return el;
}

let fontsReady;
function runFonts() {
  fontsReady ||= Promise.race([
    loadFaces()
      .then(() => Promise.all(RUN.map(([family, style, weight]) => document.fonts.load(`${style} ${weight} 1em "${family}"`, 'mutt'))))
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
  letter.style.removeProperty('opacity');
  letter.classList.remove('is-inv');
}

// hard: a longer, rougher run (the sign-in page, as the logo leaves the void).
export async function glitch(el, { quick = false, hard = false } = {}) {
  if (!el || reducedMotion() || el.classList.contains('is-glitching')) return;
  await runFonts();
  const word = el.querySelector('.logo-word');
  const letters = [...word.children];
  // Hold the logo's footprint so the bar doesn't jump while letters swap.
  word.style.width = `${word.getBoundingClientRect().width}px`;
  el.classList.add('is-glitching');
  const total = hard ? 2300 : quick ? 420 : 1250;
  const shove = hard ? 9 : 2.4;
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
      letter.style.setProperty('--gx', `${((Math.random() - 0.5) * shove).toFixed(1)}px`);
      letter.classList.toggle('is-inv', Math.random() < (hard ? 0.16 : 0.07));
      if (hard) letter.style.opacity = Math.random() < 0.14 ? '0' : '';
      setTimeout(step, 36 + Math.random() * 54);
    };
    step();
  })));
  el.classList.remove('is-glitching');
  word.style.width = '';
}
