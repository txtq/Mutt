// Background music: a slow, warm bass loop with a soft organ pad under it,
// played quietly while you're signed in. Browsers only allow sound after a
// tap or key, so it starts on the first one. The Music setting (`music` pref,
// on <html data-music>) turns it off.
//
// If `/assets/audio/music.mp3` exists it plays that on a loop instead.

import { session } from './api.js';

const TRACK = '/assets/audio/music.mp3';
const VOLUME = 0.112;
// A gentle low-pass on everything, so the music sits back and sounds a bit muffled.
const MUFFLE = 1800;
const BPM = 64;
const BEAT = 60 / BPM;

// [note, beats]. An original line in D dorian, four bars of four beats.
const BASS = [
  ['D2', 2], ['A2', 1], ['C3', 0.5], ['D3', 0.5],
  ['G2', 1.5], ['F2', 0.5], ['D2', 1], ['F2', 1],
  ['A#1', 2], ['F2', 1], ['A2', 1],
  ['A1', 1.5], ['E2', 0.5], ['G2', 1], ['A2', 1],
];
// One chord a bar, held under the bass.
const PAD = [
  ['F3', 'A3', 'C4', 'E4'],
  ['F3', 'A#3', 'D4', 'E4'],
  ['F3', 'A3', 'D4', 'E4'],
  ['E3', 'G3', 'C#4', 'D4'],
];

const NAMES = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const hz = (note) => {
  const [, name, oct] = note.match(/^([A-G]#?)(\d)$/);
  return 440 * 2 ** ((NAMES[name] + (Number(oct) + 1) * 12 - 69) / 12);
};

let ctx = null;
let master = null;
let track = null; // the <audio> when a music file is there
let synth = false; // true once the bass loop is running
let next = 0; // when the next bass note starts (context time)
let step = 0;
let pos = 0; // beats into the four-bar loop
let heard = false; // a tap or key has happened

const wanted = () => heard && !!session.user && document.documentElement.dataset.music !== 'off' && !document.hidden;

function bassNote(at, freq, dur) {
  const osc = ctx.createOscillator();
  const body = ctx.createOscillator();
  const tone = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  osc.type = 'sine';
  body.type = 'triangle';
  osc.frequency.value = freq;
  body.frequency.value = freq;
  tone.type = 'lowpass';
  tone.frequency.setValueAtTime(900, at);
  tone.frequency.exponentialRampToValueAtTime(260, at + 0.4);
  const mix = ctx.createGain();
  mix.gain.value = 0.35;
  body.connect(mix).connect(tone);
  osc.connect(tone);
  tone.connect(amp).connect(master);
  // A plucked swell that rings into the next note.
  const end = at + dur + 0.25;
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(0.9, at + 0.03);
  amp.gain.exponentialRampToValueAtTime(0.45, at + 0.5);
  amp.gain.setTargetAtTime(0.0001, at + dur, 0.12);
  osc.start(at);
  body.start(at);
  osc.stop(end + 0.5);
  body.stop(end + 0.5);
}

function padChord(at, notes, dur) {
  const amp = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 1100;
  // A slow wobble, like a rotating speaker.
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  lfo.frequency.value = 0.9;
  depth.gain.value = 0.012;
  lfo.connect(depth).connect(amp.gain);
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(0.045, at + 1.2);
  amp.gain.setTargetAtTime(0, at + dur - 0.4, 0.5);
  tone.connect(amp).connect(master);
  for (const note of notes) {
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = hz(note);
      osc.detune.value = detune;
      osc.connect(tone);
      osc.start(at);
      osc.stop(at + dur + 2);
    }
  }
  lfo.start(at);
  lfo.stop(at + dur + 2);
}

// Schedule a little ahead of time so notes land exactly on the beat.
function schedule() {
  while (next < ctx.currentTime + 1.2) {
    if (pos % 4 === 0) padChord(next, PAD[pos / 4], 4 * BEAT);
    const [note, beats] = BASS[step];
    bassNote(next, hz(note), beats * BEAT);
    next += beats * BEAT;
    step = (step + 1) % BASS.length;
    pos = (pos + beats) % 16;
  }
}

function fade(to, time = 2.5) {
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(master.gain.value, t);
  master.gain.linearRampToValueAtTime(to, t + time);
}

async function hasTrack() {
  try {
    const res = await fetch(TRACK, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

async function setup() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0;
  const muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = MUFFLE;
  muffle.Q.value = 0.5;
  master.connect(muffle).connect(ctx.destination);
  if (await hasTrack()) {
    track = new Audio(TRACK);
    track.loop = true;
    ctx.createMediaElementSource(track).connect(master);
  }
}

async function sync() {
  if (!wanted()) {
    if (!ctx || ctx.state !== 'running') return;
    fade(0, 0.8);
    setTimeout(() => {
      if (wanted()) return;
      track?.pause();
      ctx.suspend();
    }, 900);
    return;
  }
  // Starting the sound engine holds the page for about 60 thousandths of a second. At sign-in that
  // falls while the light has the whole screen and nothing moves, the one place it can't be seen:
  // measured in session 8, and moving it later only made it show. Leave it here.
  await setup();
  if (!wanted()) return;
  await ctx.resume();
  if (track) {
    track.play().catch(() => {});
  } else if (!synth) {
    synth = true;
    next = ctx.currentTime + 0.1;
    setInterval(schedule, 250);
    schedule();
  }
  fade(VOLUME);
}

export function startMusic() {
  if (!(window.AudioContext || window.webkitAudioContext)) return;
  const first = () => {
    if (heard) return;
    heard = true;
    sync();
  };
  addEventListener('pointerdown', first, { capture: true });
  addEventListener('keydown', first, { capture: true });
  document.addEventListener('visibilitychange', sync);
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-music'] });
  // Signing in or out doesn't touch the setting; check now and then.
  setInterval(() => { if (heard && ctx && (ctx.state === 'running') !== wanted()) sync(); }, 2000);
}
