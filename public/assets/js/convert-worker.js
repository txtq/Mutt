// Runs the sound and video converter (ffmpeg built for the web, served by Mutt
// at /api/convert/…) off the page's own thread, so the page never waits.
// One job at a time: { input, inName, outName, args } in, { out } back, with
// { progress } along the way. Stopping a job is ending this worker.

/* global createFFmpegCore */
let core = null;
let logTail = [];

async function start(base) {
  if (core) return core;
  const coreURL = `${base}/api/convert/core.js`;
  const wasmURL = `${base}/api/convert/core.wasm`;
  importScripts(coreURL);
  // The core finds its engine through this address (it reads what follows the #).
  core = await createFFmpegCore({ mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL }))}` });
  core.setLogger(({ message }) => {
    logTail.push(message);
    if (logTail.length > 30) logTail.shift();
  });
  core.setProgress(({ progress }) => {
    if (Number.isFinite(progress)) postMessage({ type: 'progress', progress: Math.max(0, Math.min(1, progress)) });
  });
  return core;
}

self.onmessage = async ({ data }) => {
  try {
    const ff = await start(data.base);
    postMessage({ type: 'started' });
    logTail = [];
    ff.FS.writeFile(data.inName, new Uint8Array(data.input));
    const code = ff.exec(...data.args, data.outName);
    let out = null;
    try { out = ff.FS.readFile(data.outName); } catch { /* nothing was made */ }
    for (const name of [data.inName, data.outName]) {
      try { ff.FS.unlink(name); } catch { /* already gone */ }
    }
    ff.reset();
    if (code !== 0 || !out?.length) {
      postMessage({ type: 'error', message: 'This file couldn’t be converted.', log: logTail.join('\n') });
      return;
    }
    postMessage({ type: 'done', out }, [out.buffer]);
  } catch (err) {
    postMessage({ type: 'error', message: String(err?.message || err), log: logTail.join('\n') });
  }
};
