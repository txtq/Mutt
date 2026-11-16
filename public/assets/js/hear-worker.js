// The voice reader, off the main thread (Speak to the Void). It runs Moonshine
// Tiny (Useful Sensors, MIT licence; English) with onnxruntime-web, on this
// device: the recording is never sent anywhere for this. The model comes from
// Mutt's own server (hear.py), once, and is kept in the browser's cache storage
// after that, so it works offline from then on.
//
// Messages in:  { id, pcm: Float32Array (16 kHz, one channel) }  (or no pcm: just load)
// Messages out: { id, ok, text?, error? }

/* global ort */
const ORT = 'https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.20.1/';
const FILES = { encoder: '/api/hear/encoder', decoder: '/api/hear/decoder', vocab: '/api/hear/vocab' };
const CACHE = 'mutt-hear-moonshine-tiny-q8';
const RATE = 16000;
const LAYERS = 6;
const HEADS = 8;
const HEAD = 36;      // 288 wide, 8 heads
const START = 1;      // <s>
const END = 2;        // </s>
const PIECE = 20;     // seconds read at a time at most; longer recordings are cut at a quiet moment
const SHORTEST = 12;  // ...and never into pieces shorter than this, unless it's the last

let encoder = null;
let decoder = null;
let pieces = null;
let loading = null;

async function bytes(url) {
  let cache = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return await hit.arrayBuffer();
  } catch { cache = null; }
  const res = await fetch(url, { credentials: 'same-origin', cache: cache ? 'no-store' : 'default' });
  if (!res.ok) throw new Error(res.status === 503 ? 'not ready' : res.status === 404 ? 'off' : `model ${res.status}`);
  if (cache) {
    try { await cache.put(url, res.clone()); } catch { /* full: fetch again next time */ }
  }
  return res.arrayBuffer();
}

function load() {
  if (!loading) {
    loading = (async () => {
      if (typeof ort === 'undefined') importScripts(`${ORT}ort.wasm.min.js`);
      ort.env.wasm.wasmPaths = ORT;
      ort.env.wasm.numThreads = 1; // threads need cross-origin isolation, which Mutt doesn't have
      const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
      const [enc, dec, voc] = await Promise.all([bytes(FILES.encoder), bytes(FILES.decoder), bytes(FILES.vocab)]);
      encoder = await ort.InferenceSession.create(enc, opts);
      decoder = await ort.InferenceSession.create(dec, opts);
      pieces = JSON.parse(new TextDecoder().decode(voc));
    })().catch((err) => {
      loading = null; // try again next time
      throw err;
    });
  }
  return loading;
}

// The model's numbers as words: "▁" is a space, "<0x41>" a byte.
function words(ids) {
  const out = [];
  for (const id of ids) {
    const piece = pieces[id] || '';
    const byte = /^<0x([0-9A-F]{2})>$/.exec(piece);
    if (byte) out.push(parseInt(byte[1], 16));
    else for (const b of new TextEncoder().encode(piece.replace(/▁/g, ' '))) out.push(b);
  }
  return new TextDecoder().decode(new Uint8Array(out)).trim();
}

const empty = () => new ort.Tensor('float32', new Float32Array(0), [1, HEADS, 0, HEAD]);

// One piece of sound (up to PIECE seconds) to words: read it, then write the
// words one at a time, each looking back at the ones before (greedy).
async function read(pcm) {
  const enc = await encoder.run({ [encoder.inputNames[0]]: new ort.Tensor('float32', pcm, [1, pcm.length]) });
  const hidden = enc[encoder.outputNames[0]];
  const longest = Math.ceil((pcm.length / RATE) * 6.5) + 8;   // about 6.5 words-pieces a second at most
  const ids = [];
  let past = null;
  let token = START;
  for (let step = 0; step < longest; step++) {
    const feeds = {};
    for (const name of decoder.inputNames) {
      if (name === 'input_ids') feeds[name] = new ort.Tensor('int64', BigInt64Array.from([BigInt(token)]), [1, 1]);
      else if (name === 'encoder_hidden_states') feeds[name] = hidden;
      else if (name === 'use_cache_branch') feeds[name] = new ort.Tensor('bool', Uint8Array.from([step > 0 ? 1 : 0]), [1]);
      else if (name.startsWith('past_key_values.')) feeds[name] = past?.[name] || empty();
    }
    const out = await decoder.run(feeds);
    const logits = out.logits;
    const vocab = logits.dims[2];
    const row = logits.data.subarray(logits.data.length - vocab);
    let best = 0;
    for (let i = 1; i < vocab; i++) if (row[i] > row[best]) best = i;
    // What it remembers for the next word. The sound's half is worked out on the
    // first word only, and kept.
    const next = {};
    for (const name of decoder.inputNames) {
      if (!name.startsWith('past_key_values.')) continue;
      const present = out[name.replace('past_key_values.', 'present.')];
      next[name] = name.includes('.encoder.') && past ? past[name] : present;
    }
    past = next;
    if (best === END) break;
    ids.push(best);
    token = best;
    // A model stuck saying the same thing over and over: stop there.
    const n = ids.length;
    if (n >= 12 && ids.slice(n - 4).join() === ids.slice(n - 8, n - 4).join() && ids.slice(n - 8, n - 4).join() === ids.slice(n - 12, n - 8).join()) {
      ids.length = n - 8;
      break;
    }
  }
  return words(ids);
}

// Where to cut a long recording: the quietest moment between SHORTEST and PIECE
// seconds in, so a word is never cut in half.
function pieces16k(pcm) {
  const frame = RATE / 50;   // 20 ms
  const out = [];
  let at = 0;
  while (pcm.length - at > PIECE * RATE) {
    let cut = at + PIECE * RATE;
    let quiet = Infinity;
    for (let f = at + SHORTEST * RATE; f + frame <= at + PIECE * RATE; f += frame) {
      let e = 0;
      for (let i = f; i < f + frame; i++) e += pcm[i] * pcm[i];
      if (e < quiet) { quiet = e; cut = f + frame / 2; }
    }
    out.push(pcm.subarray(at, cut));
    at = cut;
  }
  out.push(pcm.subarray(at));
  // A piece with nothing in it (silence) isn't read: the model makes words up for silence.
  return out.filter((p) => {
    let top = 0;
    for (let i = 0; i < p.length; i += 4) top = Math.max(top, Math.abs(p[i]));
    return top > 0.02 && p.length > RATE * 0.3;
  });
}

self.onmessage = async ({ data }) => {
  const { id, pcm } = data;
  try {
    await load();
    if (!pcm) {
      self.postMessage({ id, ok: true });
      return;
    }
    const said = [];
    for (const part of pieces16k(pcm)) said.push(await read(part));
    self.postMessage({ id, ok: true, text: said.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
