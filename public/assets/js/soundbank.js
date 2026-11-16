// Mutt's sounds: every one named here, and how each is made. Fetched only when Sound is on
// (`sound.js` asks for it); nothing else imports this file.
//
// Their character (the owner's words, 2026-11-16): "tactile / mechanical and satisfying with a
// hint of glass, kind of like Nintendo", then "more textured / tactile and less like chords",
// with a sound for pretty much everything you touch. So nothing here is a tone or a tune. Each
// sound is built from four small parts, played on the device (no recordings, nothing to fetch):
//   click  a tiny burst of noise through a resonance: the edge of a press
//   knock  noise ringing in a narrow resonance for a few thousandths: the body of a switch,
//          plastic or wood, with grain in it rather than a pure note (no slides: they sound poppy)
//   thud   a low, dull knock under it: something set down
//   air    noise sweeping up or down: something moving
// and, on a few things only, one glint of glass (`glint`): a single short struck-glass note in the
// music's key (D E F G A), never two together. A file landing glints in its planet's own note.
// Every part is a hair different each time, as a real switch is, so a repeat never sounds copied.
//
//   const bank = makeBank(ctx, input, { dur });
//   bank.ask('land', { note: 'ocean' });   // the rules below decide whether and how it plays
//   bank.hold('wind', 0.6);                // the one sound that lasts, at a level from 0 to 1

// How loud a sound is, by how often it happens: a press is the quietest, something rare the
// loudest (the music's own loudest moment is between `done` and `rare`).
export const LOUD = { press: 0.32, moving: 0.4, done: 0.55, rare: 0.62 };

// Each kind of planet has its note (MIDI numbers, D E F G A): big heavy worlds low, small bright high.
export const PLANET_NOTES = {
  gas: 69, lava: 74, desert: 76, terran: 77, ocean: 79, storm: 81,
  haze: 86, bloom: 88, lagoon: 89, pale: 91, pearl: 93, ice: 98,
};
const HOME = 86;   // D: a star's, and the void's

// Every sound. `rank`: 3 rare, 2 something done, 1 moving about, 0 a touch or press (how loud,
// and who wins when too many arrive at once). `run`: asked again while it still sounds, it adds
// one more small snap, up to this many in all, instead of starting again. `shy`: left out if
// anything sounded just before (a toast that only repeats what a sound already said).
export const SOUNDS = {
  // Touches and presses
  press: { rank: 0, when: 'Pressing down on any button, menu row, tab or door', made: 'A crisp switch: click and a small plastic knock' },
  touch: { rank: 0, when: 'Pressing down on a file box, a planet or a star', made: 'A soft contact, felt more than heard' },
  key: { rank: 0, when: 'A digit into the code box (on a computer)', made: 'A key bottoming out: two clicks close together' },
  field: { rank: 0, when: 'A text box taking the keyboard', made: 'A small seat-click, low' },
  focus: { rank: 0, when: 'Tab or the arrow keys moving to the next thing', made: 'The faintest tick' },
  on: { rank: 0, when: 'A switch or tick box turned on', made: 'A latch closing: two clicks, the second higher' },
  off: { rank: 0, when: 'A switch or tick box turned off', made: 'The latch opening: two clicks, the second lower' },
  select: { rank: 0, when: 'Choosing on a segmented bar or tabs', made: 'A click into a notch, with a little slide' },
  step: { rank: 0, when: 'A stepper’s + or −', made: 'Two teeth of a ratchet' },
  slide: { rank: 0, when: 'A slider passing each notch', made: 'The smallest grain of a tick' },
  detent: { rank: 0, when: 'The ring of planets on a phone turning past each planet', made: 'A dial’s notch' },
  pick: { rank: 0, when: 'Choosing a row in a menu', made: 'A firm click and knock' },
  over: { rank: 0, when: 'Something you carry passing over a place that would take it', made: 'A faint tick as it lights' },
  // Moving about
  pop: { rank: 1, when: 'A menu or small panel opening', made: 'A catch released and a short flick of air' },
  unpop: { rank: 1, when: 'A menu or panel closing', made: 'A softer catch, air falling' },
  sheet: { rank: 1, when: 'A sheet or dialog opening (account, a question)', made: 'A drawer sliding out and stopping' },
  unsheet: { rank: 1, when: 'A sheet or dialog closing', made: 'The drawer sliding back and shutting' },
  turn: { rank: 1, when: 'A page turning: the reader, the slideshow by hand, a sheet’s door', made: 'A flick of paper' },
  open: { rank: 1, when: 'A file, document or book opening', made: 'A card lifted from its slot' },
  close: { rank: 1, when: 'A file, document or book closing', made: 'The card dropped back in' },
  dive: { rank: 1, when: 'Opening a planet (the dive)', made: 'Air rushing in, a snap as it lands' },
  surface: { rank: 1, when: 'Back from a planet to the galaxy', made: 'Air rushing out, a soft knock' },
  lift: { rank: 1, when: 'Picking up a file, star or planet to carry it', made: 'A click and a little scrape' },
  back: { rank: 1, when: 'The back arrow in the corner', made: 'A knock and air falling' },
  toast: { rank: 1, shy: true, when: 'A note at the foot answering what you did, when nothing else just sounded', made: 'Two soft ticks' },
  search: { rank: 1, when: 'Search opening', made: 'Three quick clicks and air' },
  found: { rank: 1, run: 8, when: 'Found files settling round the void', made: 'A small tick for each' },
  // Something done
  take: { rank: 2, when: 'The void takes a file (a new star, or one sent to be sorted)', made: 'A dull chunk and air drawn in' },
  land: { rank: 2, run: 3, when: 'A file lands on a planet', made: 'A snap into place and one glint of the planet’s own note' },
  drop: { rank: 2, when: 'Something you carried set down', made: 'A satisfying clunk' },
  tick: { rank: 2, when: 'Ticking something done on a list', made: 'A crisp click with a glint' },
  untick: { rank: 2, when: 'Unticking it', made: 'A duller click' },
  undo: { rank: 2, when: 'Undo, or putting a deleted file back', made: 'A ratchet winding back' },
  bin: { rank: 2, when: 'Deleting a file', made: 'A crumple and a soft drop' },
  copy: { rank: 2, when: 'Copying something (a link, a key)', made: 'A stamp pressed twice' },
  no: { rank: 2, when: 'Something you tried can’t be done (a wrong code)', made: 'Two dull knocks, never a buzz' },
  news: { rank: 2, when: 'Someone commented on your file (once a visit)', made: 'A tap on glass' },
  // Rare
  save: { rank: 3, when: 'Saving someone’s file to your sky', made: 'A heavy stamp and a glint' },
  join: { rank: 3, when: 'Stars join into a constellation, or another star joins one', made: 'Two magnets meeting' },
  born: { rank: 3, when: 'A new planet or moon is born', made: 'A ratchet winding up, a snap, and a glint of its note' },
  hello: { rank: 3, when: 'Signing in: the light taking the screen', made: 'A heavy latch and a long breath of air' },
  // The one that lasts
  wind: { rank: 1, when: 'Out in the universe: louder the further out', made: 'Low wide air with a far shimmer, following the scroll' },
};

const LEVEL = ['press', 'moving', 'done', 'rare'];
// Measured (rendered offline in Safari's engine, the loudest 50 ms of each, against the music's
// loudest): each sound's trim brings it to its rank's loudness, -30, -27, -23 and -21 dB against
// the music's -19. The faintest ticks (focus, slide, a notch, a target lighting, found) are kept fainter than that.
const TRIM = {
  press: 3.55, touch: 5.5, key: 1.72, field: 4.37, focus: 3, on: 1.11, off: 1.27, select: 1.23,
  step: 1.66, slide: 3, detent: 3, pick: 2.88, over: 3, pop: 2.88, unpop: 2.19, sheet: 0.66,
  unsheet: 0.73, turn: 1.08, open: 2.82, close: 1.5, dive: 0.51, surface: 0.74, lift: 4.8, back: 3.35,
  toast: 1.8, search: 1.51, found: 4, take: 1.4, land: 0.87, drop: 1.7, tick: 2.19, untick: 4.32,
  undo: 1.2, bin: 0.51, copy: 1.6, no: 0.56, news: 0.63, save: 0.92, join: 0.95, born: 0.47,
  hello: 1.02,
};

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
    press(d, t) { click(d, t, { f: 3800 }); knock(d, t, 1700, { decay: 0.014, peak: 0.6 }); click(d, t + 0.009 * vary(), { f: 2600, peak: 0.35 }); return D('quick'); },
    touch(d, t) { click(d, t, { f: 2200, q: 1.5, len: 0.004, peak: 0.6 }); knock(d, t, 900, { decay: 0.016, peak: 0.4, q: 8 }); return D('quick'); },
    key(d, t) { click(d, t, { f: 3000 }); knock(d, t, 1250, { decay: 0.02, peak: 0.6 }); click(d, t + 0.022, { f: 2200, peak: 0.6 }); knock(d, t + 0.022, 700, { decay: 0.03, peak: 0.45, q: 8 }); return D('quick'); },
    field(d, t) { click(d, t, { f: 1800, q: 2, len: 0.004, peak: 0.7 }); knock(d, t, 620, { decay: 0.025, peak: 0.5, q: 9 }); return D('quick'); },
    focus(d, t) { click(d, t, { f: 4800, q: 4, len: 0.002, peak: 0.55 }); return 0.04; },
    on(d, t) { click(d, t, { f: 3000 }); knock(d, t, 1150, { decay: 0.015, peak: 0.55 }); click(d, t + 0.034, { f: 4300 }); knock(d, t + 0.034, 1900, { decay: 0.018, peak: 0.6 }); return D('change'); },
    off(d, t) { click(d, t, { f: 4000 }); knock(d, t, 1800, { decay: 0.014, peak: 0.5 }); click(d, t + 0.034, { f: 2500 }); knock(d, t + 0.034, 1050, { decay: 0.02, peak: 0.6 }); return D('change'); },
    select(d, t) { grain(d, t, 3, 0.03, { f: 3600, peak: 0.35 }); click(d, t + 0.036, { f: 3200 }); knock(d, t + 0.036, 1500, { decay: 0.016, peak: 0.6 }); return D('quick'); },
    step(d, t, { down } = {}) { const f = down ? 1250 : 1650; click(d, t, { f: 3500, peak: 0.8 }); knock(d, t, f, { decay: 0.01, peak: 0.45 }); click(d, t + 0.026, { f: 3900 }); knock(d, t + 0.026, f * (down ? 0.9 : 1.1), { decay: 0.013, peak: 0.5 }); return D('quick'); },
    slide(d, t) { click(d, t, { f: 4400, q: 5, len: 0.002, peak: 0.6 }); return 0.03; },
    detent(d, t) { click(d, t, { f: 3300, q: 4, len: 0.002, peak: 0.7 }); knock(d, t, 1400, { decay: 0.008, peak: 0.3 }); return 0.04; },
    pick(d, t) { click(d, t, { f: 3600 }); knock(d, t, 1500, { decay: 0.018, peak: 0.7 }); return D('quick'); },
    over(d, t) { click(d, t, { f: 4600, q: 5, len: 0.002, peak: 0.5 }); knock(d, t, 2400, { decay: 0.006, peak: 0.25 }); return 0.05; },

    pop(d, t) { click(d, t, { f: 3000 }); knock(d, t, 1300, { decay: 0.012, peak: 0.5 }); air(d, t, 0.06, 1500, 3200, { peak: 0.3, rise: 0.2 }); return D('quick'); },
    unpop(d, t) { air(d, t, 0.06, 2800, 1300, { peak: 0.25, rise: 0.2 }); click(d, t + 0.04, { f: 2500, peak: 0.6 }); knock(d, t + 0.04, 1000, { decay: 0.012, peak: 0.4 }); return D('quick'); },
    sheet(d, t) { grain(d, t, 6, 0.09, { f: 2200, spread: 900, peak: 0.25, len: 0.003 }); air(d, t, 0.1, 900, 1800, { peak: 0.25 }); thud(d, t + 0.1, { f: 220, peak: 0.6 }); click(d, t + 0.1, { f: 2600 }); return D('move'); },
    unsheet(d, t) { grain(d, t, 5, 0.07, { f: 2000, spread: 800, peak: 0.22, len: 0.003 }); air(d, t, 0.08, 1700, 800, { peak: 0.22 }); thud(d, t + 0.08, { f: 190, peak: 0.5 }); click(d, t + 0.08, { f: 2200, peak: 0.7 }); return D('change'); },
    turn(d, t) { air(d, t, 0.09, 3800, 1600, { peak: 0.5, q: 0.8, rise: 0.15 }); grain(d, t + 0.01, 4, 0.06, { f: 3500, spread: 2000, peak: 0.25 }); return D('move'); },
    open(d, t) { click(d, t, { f: 2800 }); knock(d, t, 1100, { decay: 0.016, peak: 0.5 }); grain(d, t + 0.012, 4, 0.05, { f: 2600, peak: 0.2 }); air(d, t, 0.08, 1300, 2600, { peak: 0.2 }); return D('move'); },
    close(d, t) { grain(d, t, 3, 0.03, { f: 2600, peak: 0.2 }); click(d, t + 0.035, { f: 2400 }); knock(d, t + 0.035, 900, { decay: 0.02, peak: 0.6, q: 10 }); return D('change'); },
    dive(d, t) {
      const s = D('scene') * 0.75;
      air(d, t, s, 500, 2600, { peak: 0.45, rise: 0.85 });
      click(d, t + s, { f: 3000 }); thud(d, t + s, { f: 190, peak: 0.6 }); knock(d, t + s, 1100, { decay: 0.02, peak: 0.45 });
      return D('scene');
    },
    surface(d, t) { air(d, t, D('scene') * 0.5, 2600, 500, { peak: 0.4, rise: 0.15 }); knock(d, t + 0.04, 700, { decay: 0.03, peak: 0.45, q: 8 }); return D('scene'); },
    lift(d, t) { click(d, t, { f: 2600, peak: 0.8 }); knock(d, t, 800, { decay: 0.014, peak: 0.4, q: 9 }); grain(d, t + 0.015, 5, 0.06, { f: 1800, spread: 700, peak: 0.2 }); return D('change'); },
    back(d, t) { click(d, t, { f: 3000, peak: 0.7 }); knock(d, t, 1150, { decay: 0.016, peak: 0.5 }); air(d, t, 0.08, 2400, 900, { peak: 0.2, rise: 0.2 }); return D('quick'); },
    toast(d, t) { click(d, t, { f: 4000, q: 4, peak: 0.6 }); knock(d, t, 2000, { decay: 0.01, peak: 0.35 }); click(d, t + 0.06, { f: 4400, q: 4, peak: 0.5 }); knock(d, t + 0.06, 2200, { decay: 0.01, peak: 0.3 }); return D('change'); },
    search(d, t) { [0, 0.028, 0.056].forEach((x, i) => { click(d, t + x, { f: 3000 + i * 500, peak: 0.6 }); knock(d, t + x, 1200 + i * 200, { decay: 0.01, peak: 0.35 }); }); air(d, t, 0.16, 900, 2600, { peak: 0.22 }); return D('move'); },
    found(d, t) { click(d, t, { f: 4200, q: 4, peak: 0.6 }); knock(d, t, 2100, { decay: 0.01, peak: 0.35 }); return D('quick'); },

    take(d, t) {
      thud(d, t, { f: 190, peak: 0.9 }); click(d, t, { f: 2000, q: 2, peak: 0.7 });
      knock(d, t, 600, { decay: 0.04, peak: 0.4, q: 6 });
      air(d, t, 0.22, 2000, 350, { peak: 0.4, rise: 0.12 });
      return D('move');
    },
    land(d, t, { note } = {}) {
      click(d, t, { f: 3300 }); knock(d, t, 1400, { decay: 0.012, peak: 0.5 });
      click(d, t + 0.016, { f: 2400, peak: 0.6 }); thud(d, t + 0.016, { f: 230, peak: 0.45 });
      glint(d, t + 0.02, noteOf(note), { decay: 0.2, peak: 0.22 });
      return D('move');
    },
    drop(d, t) { thud(d, t, { f: 165, peak: 1 }); click(d, t, { f: 1700, q: 2, len: 0.006 }); knock(d, t + 0.006, 850, { decay: 0.02, peak: 0.45, q: 9 }); return D('move'); },
    tick(d, t) { click(d, t, { f: 3600 }); knock(d, t, 1750, { decay: 0.016, peak: 0.6 }); click(d, t + 0.012, { f: 2800, peak: 0.4 }); glint(d, t + 0.02, 93, { decay: 0.1, peak: 0.12 }); return D('change'); },
    untick(d, t) { click(d, t, { f: 2500, q: 2 }); knock(d, t, 1000, { decay: 0.02, peak: 0.55, q: 9 }); return D('quick'); },
    undo(d, t) {
      [0, 0.028, 0.056, 0.084].forEach((x, i) => { click(d, t + x, { f: 3700 - i * 300, peak: 0.6 }); knock(d, t + x, 1500 - i * 140, { decay: 0.008, peak: 0.35 }); });
      knock(d, t + 0.115, 800, { decay: 0.025, peak: 0.55, q: 9 });
      return D('change') + 0.12;
    },
    bin(d, t) { grain(d, t, 9, 0.1, { f: 2500, spread: 2600, peak: 0.45, len: 0.003 }); thud(d, t + 0.11, { f: 140, peak: 0.8 }); return D('move'); },
    copy(d, t) { [0, 0.06].forEach((x) => { click(d, t + x, { f: 3000 }); thud(d, t + x, { f: 320, peak: 0.35 }); knock(d, t + x, 1400, { decay: 0.012, peak: 0.35 }); }); return D('change'); },
    no(d, t) { knock(d, t, 430, { decay: 0.05, peak: 0.8, q: 7 }); thud(d, t, { f: 180, peak: 0.4 }); knock(d, t + 0.12, 380, { decay: 0.06, peak: 0.75, q: 7 }); thud(d, t + 0.12, { f: 160, peak: 0.35 }); return D('move'); },
    news(d, t) { click(d, t, { f: 4200, q: 4, peak: 0.5 }); knock(d, t, 2400, { decay: 0.008, peak: 0.3 }); glint(d, t + 0.004, 86, { decay: 0.3, peak: 0.3 }); return D('arrive'); },

    save(d, t) { thud(d, t, { f: 210, peak: 1 }); click(d, t, { f: 1900, q: 1.5, len: 0.006 }); knock(d, t + 0.004, 700, { decay: 0.03, peak: 0.5, q: 7 }); glint(d, t + 0.03, HOME, { decay: 0.22, peak: 0.2 }); return D('arrive'); },
    join(d, t) { grain(d, t, 4, 0.05, { f: 2400, spread: 600, peak: 0.25 }); click(d, t + 0.055, { f: 3600 }); knock(d, t + 0.055, 1600, { decay: 0.012, peak: 0.6 }); click(d, t + 0.068, { f: 4200, peak: 0.6 }); knock(d, t + 0.068, 2000, { decay: 0.014, peak: 0.5 }); glint(d, t + 0.07, 93, { decay: 0.18, peak: 0.16 }); return D('scene'); },
    born(d, t, { note } = {}) {
      const at = D('scene') * 0.5;
      [0, 0.13, 0.22, 0.28, 0.32].forEach((x, i) => { click(d, t + x * at / 0.32, { f: 2400 + i * 350, peak: 0.55 }); knock(d, t + x * at / 0.32, 900 + i * 140, { decay: 0.009, peak: 0.3 }); });
      click(d, t + at + 0.03, { f: 3400 }); thud(d, t + at + 0.03, { f: 200, peak: 0.7 }); knock(d, t + at + 0.03, 1200, { decay: 0.02, peak: 0.5 });
      glint(d, t + at + 0.04, noteOf(note), { decay: 0.26, peak: 0.24 });
      return D('scene') + 0.3;
    },
    hello(d, t) {
      grain(d, t, 3, 0.04, { f: 2600, peak: 0.4 }); click(d, t + 0.05, { f: 2400, q: 2 }); thud(d, t + 0.05, { f: 190, peak: 0.8 }); knock(d, t + 0.05, 800, { decay: 0.03, peak: 0.5, q: 8 });
      air(d, t + 0.05, D('grand'), 400, 1600, { peak: 0.3, rise: 0.4, q: 0.8 });
      return D('grand');
    },
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
  //  - a plain press or touch makes no sound if something else starts with it (one press, one
  //    sound), and a `shy` sound (a toast) none if anything sounded in the last --dur-arrive;
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
    const plain = (n) => n === 'press' || n === 'touch';
    const crowded = batch.some(([n]) => !plain(n));
    for (const [name, opts] of batch) if (decide(name, opts, crowded, batch.length > 1)) heard.push(name);
    heard.splice(0, Math.max(0, heard.length - 40));
  }
  function decide(name, opts, crowded, several) {
    const s = SOUNDS[name];
    const t = ctx.currentTime;
    const prev = last[name];
    const window = s.rank === 0 ? 0.03 : D('move');
    if (prev && t - prev.at < window) {
      prev.at = t;
      if (!s.run || prev.n >= s.run) return false;
      prev.n += 1;
      const v = voice(name, t);
      click(v.gain, t, { f: 3600, peak: 0.5 }); knock(v.gain, t, 1500 + prev.n * 120, { decay: 0.01, peak: 0.35 });
      done(v, D('quick'));
      return true;
    }
    // A plain press or touch says nothing if something else spoke for it: with it, or just before
    // (a text box seated by the same tap, a menu that opened on the press).
    if ((name === 'press' || name === 'touch') && (crowded || starts.some((at) => t - at < D('quick')))) return false;
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
    wind.g.gain.setTargetAtTime(0.5 * Math.max(0, Math.min(1, level)), t, 0.25);
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
export function makeOut(ctx) {
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
  muffle.connect(limit).connect(out).connect(ctx.destination);
  return { input: muffle, level: out };
}
