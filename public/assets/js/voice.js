// Speak to the Void (DESIGN.md "Speak to the Void"): hold the void and talk.
// This file is fetched the first time the void is held, never before. It
// records from the microphone, tells the void how loud you are each moment,
// keeps the sound's shape (64 levels, `meta.voice.wave`), and afterwards reads
// the words on this device with the voice reader in hear-worker.js. The
// recording itself is an ordinary sound file; nothing is sent anywhere to be
// read.

import { hush } from './music.js';

export const HEAR_VERSION = 1; // matches mutt/hear.py VERSION
export const LONGEST = 5 * 60; // seconds; then it lets go by itself
export const SHORTEST = 1;     // seconds; anything shorter is dropped
const WAVE = 64;
const RATE = 16000;

// The kinds of sound this browser records, best first, and what the file is called.
const TYPES = [
  ['audio/mp4', 'm4a'],
  ['audio/webm;codecs=opus', 'weba'],
  ['audio/webm', 'weba'],
  ['audio/ogg;codecs=opus', 'ogg'],
];

export function canRecord() {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext !== false;
}

// 'granted', 'denied', 'prompt' or null when the browser won't say.
export async function permission() {
  try {
    return (await navigator.permissions.query({ name: 'microphone' })).state;
  } catch {
    return null;
  }
}

// Start listening. Resolves to a recording, or rejects with `reason`:
// 'denied' (the microphone is off for Mutt), 'none' (there isn't one), 'busy'.
// onLevel(0..1) is called every picture with how loud it is right now.
export async function listen({ onLevel, onEnded } = {}) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch (err) {
    const reason = err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'denied'
      : err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError' ? 'none' : 'busy';
    throw Object.assign(new Error(reason), { reason });
  }
  hush(true);
  const [type, ext] = TYPES.find(([t]) => MediaRecorder.isTypeSupported?.(t)) || ['', 'm4a'];
  const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  ctx.resume?.().catch(() => {});
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.2;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const levels = [];
  let frame = 0;
  let level = 0;
  const started = performance.now();
  // How loud, each picture: the void breathes with it, and the shape is kept.
  const tick = () => {
    frame = requestAnimationFrame(tick);
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const now = Math.min(1, Math.sqrt(Math.sqrt(sum / buf.length)) * 2.2);   // speech sits low: lift it
    level += (now - level) * (now > level ? 0.5 : 0.15);
    levels.push(now);
    onLevel?.(level);
  };
  frame = requestAnimationFrame(tick);
  // Another app took the microphone, or it was unplugged: keep what there is.
  for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => onEnded?.(), { once: true });
  recorder.start(1000);

  let done = null;
  const finish = () => {
    cancelAnimationFrame(frame);
    for (const track of stream.getTracks()) track.stop();
    ctx.close?.().catch(() => {});
    hush(false);
  };
  return {
    seconds: () => (performance.now() - started) / 1000,
    // Let go: the recording as { blob, name, seconds, wave }.
    stop() {
      done ||= new Promise((resolve) => {
        const seconds = (performance.now() - started) / 1000;
        recorder.onstop = () => {
          finish();
          const blob = new Blob(chunks, { type: (recorder.mimeType || type || 'audio/mp4').split(';')[0] });
          resolve({ blob, ext, seconds, wave: shapeOf(levels) });
        };
        if (recorder.state === 'inactive') recorder.onstop();
        else recorder.stop();
      });
      return done;
    },
    // Dropped: nothing kept.
    cancel() {
      if (done) return;
      done = Promise.resolve(null);
      recorder.onstop = finish;
      if (recorder.state === 'inactive') finish();
      else recorder.stop();
    },
  };
}

// The sound's shape: the loudest moment in each of 64 even stretches, 0 to 100.
function shapeOf(levels) {
  const out = [];
  const step = Math.max(1, levels.length / WAVE);
  let top = 0;
  for (let i = 0; i < WAVE; i++) {
    let m = 0;
    for (let j = Math.floor(i * step); j < Math.min(levels.length, Math.floor((i + 1) * step)); j++) m = Math.max(m, levels[j]);
    out.push(m);
    top = Math.max(top, m);
  }
  return out.map((m) => Math.round((top ? m / top : 0) * 100));
}

// ---------------------------------------------------------------- reading the words

let worker = null;
let seq = 0;
let idle = 0;
const waiting = new Map();

function ask(pcm) {
  clearTimeout(idle);
  if (!worker) {
    worker = new Worker(new URL('./hear-worker.js', import.meta.url));
    worker.onmessage = ({ data }) => {
      const job = waiting.get(data.id);
      if (!job) return;
      waiting.delete(data.id);
      if (data.ok) job.resolve(data.text ?? null);
      else job.reject(Object.assign(new Error(data.error), { reason: data.error }));
      letGo();
    };
    worker.onerror = () => {
      for (const job of waiting.values()) job.reject(Object.assign(new Error('worker'), { reason: 'worker' }));
      waiting.clear();
      worker?.terminate();
      worker = null;
    };
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, pcm }, pcm ? [pcm.buffer] : []);
  });
}

// The reader holds about a hundred megabytes while it's loaded; a phone needs
// them back, so it is let go a little while after its last job.
function letGo() {
  clearTimeout(idle);
  if (waiting.size) return;
  idle = setTimeout(() => { worker?.terminate(); worker = null; }, 45000);
}

// Start fetching the reader while you talk, so the words come sooner.
export function warmUp() {
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') return;
  ask(null).catch(() => {});
}

// The recording as the reader wants it: one channel, 16,000 numbers a second.
async function pcmOf(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  let sound;
  try {
    sound = await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    ctx.close?.().catch(() => {});
  }
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const off = new Offline(1, Math.max(1, Math.ceil(sound.duration * RATE)), RATE);
  const src = off.createBufferSource();
  src.buffer = sound;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

// The words said in a recording, read on this device, or '' when none were
// heard. Rejects with `reason` 'not ready' (the server is still fetching the
// reader), 'off' (reading is turned off) or another trouble.
export async function hearWords(blob) {
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') throw Object.assign(new Error('off'), { reason: 'off' });
  const pcm = await pcmOf(blob);
  return (await ask(pcm)) || '';
}

// A name from the first words: a sentence's start, six words at most.
export function nameFrom(text) {
  const first = (text || '').split(/(?<=[.!?])\s/)[0].trim();
  const words = first.split(/\s+/).filter(Boolean);
  const name = words.slice(0, 6).join(' ').replace(/[,;:.!?]+$/, '');
  return words.length > 6 ? `${name}…` : name;
}
