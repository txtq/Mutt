// The void's slow sums, off the page's own thread (voidmake.js has them; voidart.js asks).
// In:  { shell: true } or { tile: dpr }
// Out: { cells, body } (pixels, TEX each way) or { dpr, bitmap } (the dot tile), or { dpr, failed: true }
// where this browser's workers can't draw.
import { drawStipple, shellPixels, tileSize } from './voidmake.js';

onmessage = ({ data }) => {
  if (data.shell) {
    const { cells, body } = shellPixels();
    postMessage({ cells, body }, [cells.buffer, body.buffer]);
  } else if (data.tile) {
    if (typeof OffscreenCanvas === 'undefined') { postMessage({ dpr: data.tile, failed: true }); return; }
    const size = tileSize(data.tile);
    const canvas = new OffscreenCanvas(size, size);
    drawStipple(canvas.getContext('2d'), data.tile);
    const bitmap = canvas.transferToImageBitmap();
    postMessage({ dpr: data.tile, bitmap }, [bitmap]);
  }
};
