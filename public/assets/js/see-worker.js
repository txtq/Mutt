// The picture reader, off the main thread. It runs CLIP's picture half
// (OpenAI, MIT licence) with onnxruntime-web, on this device: pictures are
// never sent anywhere. The model comes from Mutt's own server, once, and is
// kept in the browser's cache storage after that.
//
// Messages in:  { id, pixels: Float32Array(3*224*224) }  (or no pixels: just load)
// Messages out: { id, ok, embeds?: Float32Array(512), error? }

/* global ort */
const ORT = 'https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.20.1/';
const MODEL = '/api/see/model';
const CACHE = 'mutt-see-clip-b32-q4';

let session = null;
let loading = null;

async function modelBytes() {
  let cache = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(MODEL);
    if (hit) return await hit.arrayBuffer();
  } catch { cache = null; }
  // With cache storage, skip the HTTP cache so the 64 MB isn't kept twice.
  const res = await fetch(MODEL, { credentials: 'same-origin', cache: cache ? 'no-store' : 'default' });
  if (!res.ok) throw new Error(res.status === 503 ? 'not ready' : `model ${res.status}`);
  if (cache) {
    try { await cache.put(MODEL, res.clone()); } catch { /* full: fetch again next visit */ }
  }
  return res.arrayBuffer();
}

function load() {
  if (!loading) {
    loading = (async () => {
      if (typeof ort === 'undefined') importScripts(`${ORT}ort.wasm.min.js`);
      ort.env.wasm.wasmPaths = ORT;
      ort.env.wasm.numThreads = 1; // threads need cross-origin isolation, which Mutt doesn't have
      session = await ort.InferenceSession.create(await modelBytes(), { executionProviders: ['wasm'] });
    })().catch((err) => {
      loading = null; // try again next time
      throw err;
    });
  }
  return loading;
}

self.onmessage = async ({ data }) => {
  const { id, pixels } = data;
  try {
    await load();
    if (!pixels) {
      self.postMessage({ id, ok: true });
      return;
    }
    const input = new ort.Tensor('float32', pixels, [1, 3, 224, 224]);
    const out = await session.run({ [session.inputNames[0]]: input });
    const embeds = new Float32Array((out.image_embeds || out[session.outputNames[0]]).data);
    self.postMessage({ id, ok: true, embeds }, [embeds.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
