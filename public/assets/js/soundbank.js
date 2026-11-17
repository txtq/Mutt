// Mutt's sounds: every one named here, and how each is made. Fetched only when Sound is on
// (`sound.js` asks for it); nothing else imports this file.
//
// Their character (the owner's words, 2026-11-16): tactile, "kind of like Nintendo", textured not
// chords; then "less distracting, and match what the sound corresponds to: a sweeping action
// should sweep or whoosh". So a sound is the movement it goes with, heard: as long as that
// movement (a length from DUR), shaped by its curve (arriving comes fast and settles, leaving
// starts slow and goes, gliding swells and falls), rising when something opens or comes nearer
// and falling when it closes or goes. Only what really clicks clicks (a switch, a tick, a key),
// and a landing is a soft pat, not a knock. One glint of glass marks a few things done, in the
// music's key (D E F G A), never two at once. The parts, played on the device:
//   air    noise swept in pitch, shaped like the motion: a sheet, a menu, a dive, a page
//   click  a tiny burst of noise through a resonance: the edge of a switch or a key
//   knock  noise ringing in a narrow band, with a faint tone: the body of a click
//   pat    a soft low touch: something set down or arriving
//   glint  a single short struck-glass note
// Every part is a hair different each time, so a repeat never sounds copied.
//
//   const bank = makeBank(ctx, input, { dur });
//   bank.ask('land', { note: 'ocean' });   // the rules below decide whether and how it plays
//   bank.hold('wind', 0.6);                // the one sound that lasts, at a level from 0 to 1

// How loud a sound is, by how often it happens: a press is the quietest, something rare the
// loudest (the music's own loudest moment is between `done` and `rare`).
export const LOUD = { press: 0.24, moving: 0.3, done: 0.41, rare: 0.47 };

// Each kind of planet has its note (MIDI numbers, D E F G A): big heavy worlds low, small bright high.
export const PLANET_NOTES = {
  gas: 69, lava: 74, desert: 76, terran: 77, ocean: 79, storm: 81,
  haze: 86, bloom: 88, lagoon: 89, pale: 91, pearl: 93, ice: 98,
};
const HOME = 86;   // D: a star's, and the void's

// Every sound. `rank`: 3 rare, 2 something done, 1 moving about, 0 a touch or press (how loud,
// and who wins when too many arrive at once). `run`: asked again while it still sounds, it adds
// one more small snap, up to this many in all, instead of starting again. `gap`: how long after
// itself it stays silent (a slide while you drag across many places). `shy`: left out if
// anything sounded just before (none is, now that toasts are silent).
export const SOUNDS = {
  // Touches and presses
  press: { rank: 0, when: 'Pressing a button, menu row, tab or door that has no sound of its own', made: 'A soft, short tick' },
  key: { rank: 0, when: 'A digit into the code box (on a computer)', made: 'A key going down' },
  on: { rank: 0, when: 'A switch or tick box turned on', made: 'The knob sliding over, a click as it lands' },
  off: { rank: 0, when: 'A switch or tick box turned off', made: 'The knob sliding back, a lower click' },
  select: { rank: 0, when: 'Choosing on a segmented bar or tabs', made: 'The highlight gliding across, settling with a tick' },
  step: { rank: 0, when: 'A stepper’s + or −', made: 'One tooth of a ratchet' },
  slide: { rank: 0, when: 'A slider passing each notch', made: 'The smallest tick' },
  detent: { rank: 0, when: 'The ring of planets on a phone turning past each planet', made: 'A dial’s notch' },
  shift: { rank: 0, gap: 'quick', when: 'Rearranging: each time the others make way for what you carry (a planet’s files, a list, a board)', made: 'A soft short slide, like cards shuffling over each other' },
  pick: { rank: 0, when: 'Choosing a row in a menu', made: 'A soft tick as the row blinks' },
  over: { rank: 0, when: 'Something you carry coming over a place that would take it', made: 'A faint breath as the ring lights' },
  // Moving about
  swoop: { rank: 1, when: 'The void opening into the add box', made: 'A rush of fine dust swooping down and up, settling with a soft pat' },
  unswoop: { rank: 1, when: 'The void closing again (not when it swallows: that is `take`)', made: 'A shorter rush of dust falling away' },
  pop: { rank: 1, when: 'A menu or small panel growing open', made: 'A small quick rise of air' },
  unpop: { rank: 1, when: 'A menu or panel going', made: 'A small fall of air' },
  sheet: { rank: 1, when: 'A sheet or dialog arriving (account, a question)', made: 'A sweep of air that comes quickly and settles' },
  unsheet: { rank: 1, when: 'A sheet or dialog going', made: 'A short sweep away' },
  turn: { rank: 1, when: 'A page sliding across: the reader, the slideshow by hand, a sheet’s door, the next file', made: 'A sideways swish of paper' },
  open: { rank: 1, when: 'A file, document or book opening into its room', made: 'A soft whoosh rising' },
  close: { rank: 1, when: 'A file, document or book closing', made: 'A soft whoosh falling' },
  dive: { rank: 1, when: 'Opening a planet: it travels and swells to fill the screen', made: 'A long whoosh rising as it comes, softly settling' },
  surface: { rank: 1, when: 'Back from a planet to the galaxy', made: 'A long whoosh falling away' },
  lift: { rank: 1, when: 'Picking up a file, star or planet to carry it', made: 'A small lift of air' },
  search: { rank: 1, when: 'Search opening', made: 'A bright sweep that settles' },
  found: { rank: 1, run: 6, when: 'Found files settling round the void', made: 'A faint tick for each, a few at most' },
  // Something done
  take: { rank: 2, when: 'The void swallows a file', made: 'A soft low pat and air drawn down after it' },
  land: { rank: 2, run: 3, when: 'A file arriving on a planet', made: 'A soft pat and one glint of the planet’s own note' },
  drop: { rank: 2, when: 'Something you carried set down', made: 'A soft pat' },
  tick: { rank: 2, when: 'Ticking something done on a list', made: 'A crisp tick with a small glint' },
  untick: { rank: 2, when: 'Unticking it', made: 'A duller tick' },
  undo: { rank: 2, when: 'Undo, or putting a deleted file back', made: 'A quick sweep the other way' },
  bin: { rank: 2, when: 'Deleting a file: its box folds away', made: 'A soft crumple falling away' },
  copy: { rank: 2, when: 'Copying something (a link, a key)', made: 'A soft tick' },
  no: { rank: 2, when: 'Something you tried can’t be done (a wrong code shakes)', made: 'Two soft dull knocks with the shake, never a buzz' },
  news: { rank: 2, when: 'Someone commented on, or beamed you, a file (once a visit)', made: 'A tap on glass' },
  // Rare
  save: { rank: 3, when: 'Saving someone’s file to your sky', made: 'A rise of air and a glint' },
  join: { rank: 3, when: 'Stars join into a constellation, or another star joins one', made: 'Two breaths meeting, and a glint' },
  born: { rank: 3, when: 'A new planet or moon is born', made: 'A swell of air and a glint of its note' },
  hello: { rank: 3, when: 'Signing in: the light taking the screen', made: 'One long soft breath of air' },
  // The one that lasts
  wind: { rank: 1, when: 'Out in the universe: louder the further out', made: 'Low wide air with a far shimmer, following the scroll' },
};

const LEVEL = ['press', 'moving', 'done', 'rare'];
// Measured (rendered offline in Safari's engine, the loudest 50 ms of each, against the music's
// loudest): each sound's trim brings it to its rank's loudness, -38.5, -33.5, -29.5 and -27.5 dB against
// the music's -19 (2026-11-16: "less distracting", then "a bit quieter"); a long sweep a little under that, since it
// lasts. The faintest ticks (a press, a slider, a notch, a menu row, a find) stay fainter still.
const TRIM = {
  swoop: 0.3, unswoop: 0.46, shift: 0.85,
  press: 3.5, key: 1.84, on: 0.34, off: 0.41, select: 0.97, step: 2.24, slide: 2.5, detent: 3,
  pick: 3, over: 0.62, pop: 0.38, unpop: 0.38, sheet: 0.34, unsheet: 0.33, turn: 0.28, open: 0.24,
  close: 0.27, dive: 0.23, surface: 0.26, lift: 0.68, search: 0.35, found: 3, take: 0.53, land: 0.62,
  drop: 2.95, tick: 1.91, untick: 3.5, undo: 0.3, bin: 0.61, copy: 3.5, no: 0.58, news: 0.5,
  save: 0.27, join: 0.34, born: 0.26, hello: 0.4,
}

const hz = (n) => 440 * 2 ** ((n - 69) / 12);
const noteOf = (note) => (typeof note === 'string' ? (PLANET_NOTES[note] ?? HOME) : (note ?? HOME));

export function makeBank(ctx, input, { dur }) {
  const D = (k) => dur[k] / 1000;
  const playing = new Set();   // { rank, gain, end }
  let vary = (by = 0.06) => 1 + (Math.random() - 0.5) * by;   // a hair different each time

  // A small, close room: enough that a knock has a body, not enough to hear as a space.
  const room = ctx.createConvolver();
  {
    const len = Math.round(ctx.sampleRate * 0.25);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 6;
    }
    room.buffer = b;
  }
  const wet = ctx.createGain();
  wet.gain.value = 0.07;
  room.connect(wet).connect(input);

  const hiss = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  { const d = hiss.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }

  // ---------------------------------------------------------------- the parts

  function noise(dest, t, length, f, q, type = 'bandpass') {
    const s = ctx.createBufferSource();
    s.buffer = hiss;
    s.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = type;
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    s.connect(bp).connect(g).connect(dest);
    s.start(t, Math.random() * 0.9);
    s.stop(t + length + 0.05);
    return { g, bp, s };
  }
  const env = (g, t, peak, decay, attack = 0.0005) => {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(0, t + attack, decay / 3);
  };

  // The edge: a burst of noise a few thousandths long.
  function click(d, t, { f = 3400, q = 2.5, len = 0.003, peak = 1 } = {}) {
    const { g } = noise(d, t, len * 6, f * vary(0.12), q);
    env(g, t, peak * 2.4, len);
  }

  // The body: noise ringing in a narrow band (plastic around 1–2 kHz, wood lower). It has grain,
  // and a faint sine at its middle so it sits on a pitch without becoming a note.
  function knock(d, t, f, { decay = 0.02, peak = 1, q = 14 } = {}) {
    const fr = f * vary();
    const { g } = noise(d, t, decay * 4, fr, q);
    env(g, t, peak * 3.2, decay);
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.value = fr;
    env(og, t, peak * 0.4, decay * 0.8, 0.0008);
    o.connect(og).connect(d);
    o.start(t);
    o.stop(t + decay * 3 + 0.02);
  }

  // Weight: a dull low knock and a soft low click.
  function thud(d, t, { f = 170, peak = 1 } = {}) {
    knock(d, t, f, { decay: 0.05, peak: peak * 1.1, q: 5 });
    click(d, t, { f: 900, q: 1, len: 0.006, peak: peak * 0.5 });
  }

  // Grain: several tiny clicks in a row, uneven, like a ratchet or paper.
  function grain(d, t, n, span, { f = 3000, spread = 1500, peak = 0.6, len = 0.0025 } = {}) {
    for (let i = 0; i < n; i++) {
      const at = t + (i / Math.max(1, n - 1)) * span * vary(0.3);
      click(d, at, { f: f + (Math.random() - 0.5) * spread, q: 3, len, peak: peak * (0.6 + Math.random() * 0.4) });
    }
  }

  function air(d, t, length, from, to, { peak = 1, q = 1.2, rise = 0.5 } = {}) {
    const { g, bp } = noise(d, t, length, from, q);
    if (to !== from) bp.frequency.exponentialRampToValueAtTime(to, t + length);
    g.gain.linearRampToValueAtTime(peak, t + length * rise);
    g.gain.linearRampToValueAtTime(0, t + length);
  }

  // Air shaped like a movement: `shape` is its curve. 'settle' comes fast and dies away slowly
  // (arriving), 'leave' starts slow and is gone at the end (going), 'glide' swells to the middle
  // and falls (travelling), 'spring' rises quickly and falls a little later (popping open).
  const SHAPES = { settle: [[0.12, 1], [0.45, 0.35], [1, 0]], leave: [[0.6, 0.55], [0.9, 1], [1, 0]], glide: [[0.5, 1], [0.8, 0.4], [1, 0]], spring: [[0.25, 1], [0.6, 0.3], [1, 0]] };
  function swell(d, t, length, from, to, { peak = 1, q = 0.9, shape = 'glide', low = 0 } = {}) {
    const { g, bp } = noise(d, t, length, from, q);
    bp.frequency.exponentialRampToValueAtTime(to, t + length);
    for (const [at, v] of SHAPES[shape]) g.gain.linearRampToValueAtTime(peak * v, t + length * at);
    if (low) {   // a little body underneath, for something big moving
      const b = noise(d, t, length, Math.min(from, to) * 0.5, 0.7, 'lowpass');
      for (const [at, v] of SHAPES[shape]) b.g.gain.linearRampToValueAtTime(low * v, t + length * at);
    }
  }

  // Dust: many tiny soft grains, their loudness following a movement's curve (the void is a print
  // of dust; its opening sounds like that dust rushing round).
  function dust(d, t, length, n, { shape = 'glide', peak = 0.3, f = 3500, spread = 3000 } = {}) {
    const pts = [[0, 0], ...SHAPES[shape]];
    const level = (x) => { for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [a, va] = pts[i - 1]; const [b, vb] = pts[i]; return va + (vb - va) * ((x - a) / (b - a)); } return 0; };
    for (let i = 0; i < n; i++) {
      const x = Math.random();
      click(d, t + x * length, { f: f + (Math.random() - 0.5) * spread, q: 2.5, len: 0.0015, peak: peak * level(x) * (0.4 + Math.random() * 0.6) });
    }
  }

  // A soft low touch: something set down or arriving. Felt more than heard.
  function pat(d, t, { f = 260, peak = 1 } = {}) {
    const { g } = noise(d, t, 0.1, f * vary(), 1.2, 'lowpass');
    env(g, t, peak * 2, 0.04, 0.003);
    knock(d, t, f * 1.6, { decay: 0.03, peak: peak * 0.25, q: 4 });
  }

  // The one hint of glass: a single struck-glass note, short, never two at once.
  function glint(d, t, n, { decay = 0.18, peak = 0.5 } = {}) {
    const f = hz(n);
    [[1, 1, 1], [2.756, 0.3, 0.35]].forEach(([r, a, k]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f * r;
      env(g, t, peak * a, decay * k, 0.001);
      o.connect(g).connect(d);
      o.start(t);
      o.stop(t + decay * 3 + 0.02);
    });
  }

  // ---------------------------------------------------------------- the sounds
  // Each gets `d` (its own gain into the chain) and `t`, and returns how long it lasts.

  const MAKE = {
    press(d, t) { click(d, t, { f: 3200, q: 3, len: 0.002, peak: 0.7 }); knock(d, t, 1500, { decay: 0.01, peak: 0.35 }); return D('quick'); },
    key(d, t) { click(d, t, { f: 2800, len: 0.003 }); knock(d, t, 1100, { decay: 0.016, peak: 0.5 }); return D('quick'); },
    on(d, t) { swell(d, t, D('change') * 0.6, 1800, 3400, { peak: 0.25, shape: 'leave', q: 1.4 }); click(d, t + D('change') * 0.6, { f: 3600 }); knock(d, t + D('change') * 0.6, 1800, { decay: 0.014, peak: 0.5 }); return D('change'); },
    off(d, t) { swell(d, t, D('change') * 0.6, 3000, 1600, { peak: 0.25, shape: 'leave', q: 1.4 }); click(d, t + D('change') * 0.6, { f: 2600 }); knock(d, t + D('change') * 0.6, 1100, { decay: 0.016, peak: 0.5 }); return D('change'); },
    select(d, t) { swell(d, t, D('change'), 2200, 3000, { peak: 0.22, shape: 'settle', q: 1.6 }); click(d, t + D('change') * 0.25, { f: 3400, q: 3, len: 0.002, peak: 0.6 }); return D('change'); },
    step(d, t, { down } = {}) { click(d, t, { f: down ? 3000 : 3600, len: 0.002 }); knock(d, t, down ? 1300 : 1650, { decay: 0.01, peak: 0.4 }); return D('quick'); },
    slide(d, t) { click(d, t, { f: 4200, q: 5, len: 0.0015, peak: 0.5 }); return 0.03; },
    detent(d, t) { click(d, t, { f: 3100, q: 4, len: 0.002, peak: 0.6 }); knock(d, t, 1300, { decay: 0.007, peak: 0.25 }); return 0.04; },
    shift(d, t) { swell(d, t, D('change'), 1500, 2300, { peak: 0.3, shape: 'settle', q: 1.3 }); grain(d, t + 0.005, 2, D('change') * 0.4, { f: 3000, spread: 1200, peak: 0.12 }); return D('change'); },
    pick(d, t) { click(d, t, { f: 3400, q: 3, len: 0.002, peak: 0.7 }); knock(d, t, 1500, { decay: 0.012, peak: 0.35 }); return D('quick'); },
    over(d, t) { swell(d, t, D('move'), 600, 1400, { peak: 0.3, shape: 'settle', q: 0.8 }); return D('move'); },

    swoop(d, t) {
      const L = D('scene');
      const { g, bp } = noise(d, t, L, 1400, 0.9);   // air dipping, then rising as it opens
      bp.frequency.exponentialRampToValueAtTime(500, t + L * 0.3);
      bp.frequency.exponentialRampToValueAtTime(2200, t + L * 0.85);
      for (const [at, v] of SHAPES.glide) g.gain.linearRampToValueAtTime(0.45 * v, t + L * at);
      const b = noise(d, t, L, 300, 0.7, 'lowpass');
      for (const [at, v] of SHAPES.glide) b.g.gain.linearRampToValueAtTime(0.25 * v, t + L * at);
      dust(d, t, L * 0.9, 70, { shape: 'glide', peak: 0.35 });
      pat(d, t + L * 0.85, { f: 240, peak: 0.3 });
      return L;
    },
    unswoop(d, t) {
      const L = D('move');
      swell(d, t, L, 2000, 450, { peak: 0.4, shape: 'leave', low: 0.2 });
      dust(d, t, L, 25, { shape: 'leave', peak: 0.3 });
      return L;
    },
    pop(d, t) { swell(d, t, D('move') * 0.7, 1400, 3200, { peak: 0.45, shape: 'spring' }); return D('move'); },
    unpop(d, t) { swell(d, t, D('change'), 2800, 1200, { peak: 0.4, shape: 'leave' }); return D('change'); },
    sheet(d, t) { swell(d, t, D('arrive'), 700, 2200, { peak: 0.55, shape: 'settle', low: 0.25 }); return D('arrive'); },
    unsheet(d, t) { swell(d, t, D('change') * 1.2, 2000, 650, { peak: 0.5, shape: 'leave', low: 0.2 }); return D('change'); },
    turn(d, t) { swell(d, t, D('move'), 4200, 2200, { peak: 0.5, shape: 'settle', q: 0.7 }); grain(d, t + 0.01, 3, D('move') * 0.3, { f: 3800, spread: 1800, peak: 0.12 }); return D('move'); },
    open(d, t) { swell(d, t, D('move'), 900, 2600, { peak: 0.5, shape: 'glide', low: 0.2 }); return D('move'); },
    close(d, t) { swell(d, t, D('move'), 2400, 800, { peak: 0.45, shape: 'glide', low: 0.2 }); return D('move'); },
    dive(d, t) {
      swell(d, t, D('scene'), 350, 2400, { peak: 0.6, shape: 'glide', low: 0.35 });
      pat(d, t + D('scene') * 0.8, { f: 220, peak: 0.25 });
      return D('scene');
    },
    surface(d, t) { swell(d, t, D('scene'), 2400, 300, { peak: 0.55, shape: 'glide', low: 0.35 }); return D('scene'); },
    lift(d, t) { swell(d, t, D('change'), 800, 1800, { peak: 0.35, shape: 'spring' }); return D('change'); },
    search(d, t) { swell(d, t, D('arrive'), 1500, 4200, { peak: 0.45, shape: 'settle', q: 1.1 }); return D('arrive'); },
    found(d, t) { click(d, t, { f: 4000, q: 4, len: 0.0015, peak: 0.45 }); return D('quick'); },

    take(d, t) { pat(d, t, { f: 200, peak: 0.6 }); swell(d, t, D('arrive'), 1600, 250, { peak: 0.4, shape: 'settle', low: 0.25 }); return D('arrive'); },
    land(d, t, { note } = {}) { pat(d, t, { f: 280, peak: 0.6 }); glint(d, t + 0.006, noteOf(note), { decay: 0.22, peak: 0.22 }); return D('move'); },
    drop(d, t) { pat(d, t, { f: 220, peak: 0.8 }); return D('move'); },
    tick(d, t) { click(d, t, { f: 3600, len: 0.002 }); knock(d, t, 1750, { decay: 0.014, peak: 0.5 }); glint(d, t + 0.01, 93, { decay: 0.1, peak: 0.1 }); return D('change'); },
    untick(d, t) { click(d, t, { f: 2400, q: 2, len: 0.002 }); knock(d, t, 1000, { decay: 0.018, peak: 0.45, q: 9 }); return D('quick'); },
    undo(d, t) { swell(d, t, D('move'), 2600, 900, { peak: 0.45, shape: 'glide' }); return D('move'); },
    bin(d, t) { grain(d, t, 6, D('change') * 0.8, { f: 2200, spread: 2000, peak: 0.25, len: 0.003 }); swell(d, t, D('change'), 2000, 600, { peak: 0.35, shape: 'leave' }); return D('change'); },
    copy(d, t) { click(d, t, { f: 3000, len: 0.002 }); knock(d, t, 1300, { decay: 0.014, peak: 0.45 }); return D('quick'); },
    no(d, t) { knock(d, t, 420, { decay: 0.04, peak: 0.6, q: 6 }); knock(d, t + D('quick'), 380, { decay: 0.05, peak: 0.55, q: 6 }); return D('move'); },
    news(d, t) { click(d, t, { f: 4200, q: 4, len: 0.0015, peak: 0.4 }); glint(d, t + 0.004, 86, { decay: 0.28, peak: 0.25 }); return D('arrive'); },

    save(d, t) { swell(d, t, D('move'), 700, 2400, { peak: 0.45, shape: 'glide' }); glint(d, t + D('move') * 0.8, HOME, { decay: 0.22, peak: 0.2 }); return D('arrive'); },
    join(d, t) { swell(d, t, D('move'), 900, 2000, { peak: 0.35, shape: 'glide' }); swell(d, t, D('move'), 3200, 2000, { peak: 0.3, shape: 'glide' }); glint(d, t + D('move') * 0.85, 93, { decay: 0.18, peak: 0.16 }); return D('scene'); },
    born(d, t, { note } = {}) { swell(d, t, D('scene'), 400, 1800, { peak: 0.5, shape: 'settle', low: 0.3 }); glint(d, t + D('scene') * 0.15, noteOf(note), { decay: 0.26, peak: 0.22 }); return D('scene'); },
    hello(d, t) { swell(d, t, D('grand'), 350, 1500, { peak: 0.45, shape: 'glide', low: 0.3, q: 0.7 }); return D('grand'); },
  };

  // ---------------------------------------------------------------- playing

  function voice(name, t) {
    const s = SOUNDS[name];
    const g = ctx.createGain();
    g.gain.value = LOUD[LEVEL[s.rank]] * (TRIM[name] || 1);
    g.connect(input);
    const send = ctx.createGain();
    send.gain.value = 1;
    g.connect(send).connect(room);
    const v = { rank: s.rank, gain: g, send, end: t + 1 };
    playing.add(v);
    for (const o of playing) {   // a higher sound starting quietens the lower ones still playing
      if (o !== v && o.rank < s.rank && o.end > t) o.gain.gain.setTargetAtTime(o.gain.gain.value * 0.4, t, 0.03);
    }
    return v;
  }
  function done(v, length) {
    v.end = ctx.currentTime + length;
    setTimeout(() => { playing.delete(v); v.gain.disconnect(); v.send.disconnect(); }, (length + 1) * 1000);
  }

  function play(name, opts = {}) {
    const make = MAKE[name];
    if (!make) return 0;
    const t = ctx.currentTime + 0.003;
    const v = voice(name, t);
    const length = make(v.gain, t, opts);
    done(v, length);
    return length;
  }

  // The rules for many at once, so Mutt is never noisy:
  //  - everything asked for in the same moment is weighed together, the rarest first;
  //  - a plain press makes no sound if something else starts with it (one press, one sound),
  //    and a `shy` sound none if anything sounded in the last --dur-arrive;
  //  - the same sound asked for again while it still sounds plays nothing, or, for a sound with
  //    a `run`, one more small snap (a run lasts while the asking keeps coming);
  //  - at most four sounds at once: a fifth plays only if it outranks the least of them, which
  //    steps aside; at most sixteen new sounds a second, whatever asks.
  const last = {};
  const starts = [];
  const heard = [];   // what was played lately, newest last (the sample page and the checks read it)
  let queue = [];
  function ask(name, opts = {}) {
    if (!SOUNDS[name]) return;
    queue.push([name, opts]);
    if (queue.length === 1) queueMicrotask(flush);
  }
  function flush() {
    const batch = queue.sort((a, b) => SOUNDS[b[0]].rank - SOUNDS[a[0]].rank);
    queue = [];
    const plain = (n) => n === 'press';
    const crowded = batch.some(([n]) => !plain(n));
    for (const [name, opts] of batch) if (decide(name, opts, crowded, batch.length > 1)) heard.push(name);
    heard.splice(0, Math.max(0, heard.length - 40));
  }
  function decide(name, opts, crowded, several) {
    const s = SOUNDS[name];
    const t = ctx.currentTime;
    const prev = last[name];
    const window = s.gap ? D(s.gap) : s.rank === 0 ? 0.03 : D('move');
    if (prev && t - prev.at < window) {
      prev.at = t;
      if (!s.run || prev.n >= s.run) return false;
      prev.n += 1;
      const v = voice(name, t);
      click(v.gain, t, { f: 3600, q: 4, len: 0.0015, peak: 0.35 });
      done(v, D('quick'));
      return true;
    }
    // A plain press says nothing if something else spoke for it: with it, or just before
    // (a text box seated by the same tap, a menu that opened on the press).
    if (name === 'press' && (crowded || starts.some((at) => t - at < D('quick')))) return false;
    if (s.shy && (several || starts.some((at) => t - at < D('arrive')))) return false;
    while (starts.length && t - starts[0] > 1) starts.shift();
    if (starts.length >= 16) return false;
    const now = [...playing].filter((v) => v.end > t);
    if (now.length >= 4) {
      const least = now.reduce((a, b) => (b.rank < a.rank ? b : a));
      if (least.rank >= s.rank) return false;
      least.gain.gain.setTargetAtTime(0, t, 0.015);
      least.end = t;
    }
    last[name] = { at: t, n: 1 };
    starts.push(t);
    play(name, opts);
    return true;
  }

  // The one sound that lasts: the universe's wind.
  let wind = null;
  function hold(name, level) {
    if (name !== 'wind') return;
    const t = ctx.currentTime;
    if (!wind && level > 0.01) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(input);
      const low = noise(g, t, 3600, 260, 0.6);
      low.g.gain.setValueAtTime(1, t);
      const far = noise(g, t, 3600, 5600, 5);
      far.g.gain.setValueAtTime(0.15, t);
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 0.07;
      depth.gain.value = 120;
      lfo.connect(depth).connect(low.bp.frequency);
      lfo.start(t);
      wind = { g, parts: [low.s, far.s, lfo] };
    }
    if (!wind) return;
    wind.g.gain.setTargetAtTime(0.014 * Math.max(0, Math.min(1, level)), t, 0.25);
    if (level <= 0.01) {
      const w = wind;
      wind = null;
      setTimeout(() => { w.parts.forEach((p) => { try { p.stop(); } catch {} }); w.g.disconnect(); }, 1500);
    }
  }

  return { ask, play, hold, heard, set steady(on) { vary = on ? () => 1 : (by = 0.06) => 1 + (Math.random() - 0.5) * by; } };
}

// The chain every sound goes through: a little muffle off the very top, and a limiter, so many
// sounds at once are never louder than one clear one.
export function makeOut(ctx, end = ctx.destination) {
  const muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 9000;
  muffle.Q.value = 0.5;
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -18;
  limit.knee.value = 6;
  limit.ratio.value = 8;
  limit.attack.value = 0.002;
  limit.release.value = 0.2;
  const out = ctx.createGain();
  out.gain.value = 1;
  muffle.connect(limit).connect(out).connect(end);
  return { input: muffle, level: out };
}
