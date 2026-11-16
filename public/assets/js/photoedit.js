// The photo editor (DESIGN.md "Photo editor"): a room where one of your
// pictures is cropped, turned, lit, coloured, sharpened, drawn and written
// on, and made smaller. Fetched (with photo.css) only when a picture is
// first edited.
//
// Nothing is lost. The editor always opens the picture as it was uploaded,
// with the settings it was last saved with (meta.edit), and saving replaces
// the file while Mutt keeps the original (POST /api/blocks/<id>/picture).
// "Start over" and saving brings the original back.
//
// How a picture is made, the same on screen and when saved:
//   1. its shape: quarter turns, mirroring and straightening, drawn on a 2D
//      canvas (straightening zooms in just enough to leave no empty corners);
//      the crop is a window onto that, in fractions of it;
//   2. light, colour and detail, in one small WebGL program (blur and
//      sharpening read a softened copy made in two passes);
//   3. what is drawn and written, on top, kept in fractions of the turned
//      picture, so it stays on the same spot whatever the crop.
// On screen it is made from a smaller copy of the picture; saving makes it
// again from the whole one.

import { api, sendFile } from './api.js';
import { icon } from './icons.js';
import { canEditPicture, displayTitle, imageSrc } from './kinds.js';
import { lookOfBlob } from './look.js';
import { readPicture } from './see.js';
import { makeThumb } from './thumbs.js';
import { transition } from './transitions.js';
import { confirmDialog, enterRoom, leaveRoom, segmented, slider, toast } from './ui.js';
import { bus, fmtBytes, h, named, touchScreen } from './util.js';


const PREVIEW_EDGE = 2600;           // the copy the screen is made from
const MOST_PIXELS = touchScreen() ? 16_000_000 : 50_000_000;   // what one canvas may hold here
const SIZES = [['full', 'Full size', 0], ['large', 'Large', 2560], ['medium', 'Medium', 1600], ['small', 'Small', 1080]];
const INKS = [['white', '--white', 'White'], ['black', '--void', 'Black'], ['red', '--pen-red', 'Red'], ['yellow', '--mark-yellow', 'Yellow'],
  ['green', '--mark-green', 'Green'], ['blue', '--mark-blue', 'Blue'], ['pink', '--mark-pink', 'Pink'], ['purple', '--mark-purple', 'Purple']];
const INK = Object.fromEntries(INKS.map(([k, name]) => [k, name]));
// Line widths and type sizes, as a share of the picture's longer side.
const WIDTH = { s: 0.004, m: 0.008, l: 0.016 };
const TYPE = { s: 0.035, m: 0.055, l: 0.085 };
const FONT = '"Red Hat Text", system-ui, sans-serif';

// ---------------------------------------------------------------- settings

const blank = () => ({
  v: 1, turn: 0, flipX: false, flipY: false, straighten: 0, crop: null,
  light: { brightness: 0, contrast: 0, highlights: 0, shadows: 0 },
  colour: { saturation: 0, warmth: 0, tint: 0, mono: false },
  detail: { sharpen: 0, blur: 0, vignette: 0 },
  marks: [], size: 'full',
});

const num = (v, lo, hi, d = 0) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : d);

// Saved settings, read carefully (they are only ever the owner's, but may be from an older editor).
function fromSaved(saved) {
  const r = blank();
  if (!saved || typeof saved !== 'object') return r;
  r.turn = [0, 90, 180, 270].includes(saved.turn) ? saved.turn : 0;
  r.flipX = !!saved.flipX;
  r.flipY = !!saved.flipY;
  r.straighten = num(saved.straighten, -45, 45);
  const c = saved.crop;
  if (c && [c.x, c.y, c.w, c.h].every(Number.isFinite) && c.w > 0.01 && c.h > 0.01) {
    r.crop = { x: num(c.x, 0, 1), y: num(c.y, 0, 1), w: num(c.w, 0.01, 1), h: num(c.h, 0.01, 1), shape: c.shape || 'free' };
  }
  for (const group of ['light', 'colour', 'detail']) {
    for (const key of Object.keys(r[group])) {
      if (key === 'mono') r.colour.mono = !!saved.colour?.mono;
      else r[group][key] = num(saved[group]?.[key], group === 'detail' ? 0 : -100, 100);
    }
  }
  r.marks = Array.isArray(saved.marks) ? saved.marks.filter((m) => m && typeof m === 'object' && INK[m.c]) : [];
  r.size = SIZES.some(([k]) => k === saved.size) ? saved.size : 'full';
  return r;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isBlank = (r) => same(r, blank());
const adjusted = (r) => Object.values(r.light).some(Boolean) || Object.values(r.colour).some(Boolean) || Object.values(r.detail).some(Boolean);

// ---------------------------------------------------------------- shape

// The picture turned, mirrored and straightened: its size (in the source's
// pixels) and how far straightening zooms in.
function shapeOf(r, sw, sh) {
  const side = r.turn === 90 || r.turn === 270;
  const W = side ? sh : sw;
  const H = side ? sw : sh;
  const a = Math.abs(r.straighten) * Math.PI / 180;
  const zoom = Math.max((W * Math.cos(a) + H * Math.sin(a)) / W, (W * Math.sin(a) + H * Math.cos(a)) / H);
  return { W, H, zoom };
}

const FULL = { x: 0, y: 0, w: 1, h: 1 };

// Draw `source` (a copy `f` times the size of the real picture) turned, mirrored and
// straightened, through the window `region`, at `k` pixels for each of the picture's.
function drawShape(ctx, source, f, r, g, region, k) {
  ctx.save();
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(-region.x * g.W * k, -region.y * g.H * k);
  ctx.translate(g.W * k / 2, g.H * k / 2);
  ctx.rotate(r.straighten * Math.PI / 180);
  ctx.scale(r.flipX ? -1 : 1, r.flipY ? -1 : 1);
  ctx.rotate(r.turn * Math.PI / 180);
  ctx.scale(g.zoom * k / f, g.zoom * k / f);
  const sw = (source.naturalWidth || source.width);
  const sh = (source.naturalHeight || source.height);
  ctx.drawImage(source, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

// ---------------------------------------------------------------- light, colour, detail

const VERTEX = 'attribute vec2 p; varying vec2 uv; void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
const SOFTEN = `precision highp float; varying vec2 uv; uniform sampler2D t; uniform vec2 step;
void main() { vec4 c = vec4(0.0); float sum = 0.0;
  for (int i = -6; i <= 6; i++) { float f = float(i); float w = exp(-f * f / 18.0); c += texture2D(t, uv + step * f) * w; sum += w; }
  gl_FragColor = c / sum; }`;
const FINISH = `precision highp float; varying vec2 uv;
uniform sampler2D img; uniform sampler2D soft; uniform sampler2D wide;
uniform float bright, contrast, high, shade, sat, warm, tint, mono, sharpen, blur, vig; uniform vec2 aspect;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec4 src = texture2D(img, uv); vec3 c = src.rgb;
  if (sharpen > 0.0) c += sharpen * 1.6 * (c - texture2D(soft, uv).rgb);
  if (blur > 0.0) c = mix(c, texture2D(wide, uv).rgb, min(1.0, blur * 5.0));
  c = clamp(c, 0.0, 1.0);
  if (bright > 0.0) c = pow(c, vec3(1.0 / (1.0 + bright * 0.9)));
  if (bright < 0.0) c = pow(c, vec3(1.0 - bright * 0.9));
  c = (c - 0.5) * (contrast > 0.0 ? 1.0 + contrast : 1.0 + contrast * 0.7) + 0.5;
  float L = luma(clamp(c, 0.0, 1.0));
  float hw = smoothstep(0.45, 1.0, L); float sw = 1.0 - smoothstep(0.0, 0.55, L);
  c += high * 0.45 * hw * (high > 0.0 ? (1.0 - c) : c);
  c += shade * 0.45 * sw * (shade > 0.0 ? (1.0 - c) : c);
  c = mix(vec3(luma(c)), c, 1.0 + (sat > 0.0 ? sat * 0.9 : sat));
  c += vec3(warm * 0.07 + tint * 0.03, -tint * 0.06, -warm * 0.07 + tint * 0.03);
  c = mix(c, vec3(luma(c)), mono);
  vec2 d = (uv - 0.5) * aspect;
  c *= 1.0 - vig * 0.8 * smoothstep(0.3, 1.0, length(d) / length(aspect * 0.5));
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`;

// The WebGL program that does light, colour and detail. One per editor.
class Finisher {
  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    this.gl = gl;
    if (!gl) return;
    const program = (fs) => {
      const p = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, fs]]) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        gl.attachShader(p, s);
      }
      gl.bindAttribLocation(p, 0, 'p');
      gl.linkProgram(p);
      return p;
    };
    this.soften = program(SOFTEN);
    this.finish = program(FINISH);
    this.most = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.targets = [];
  }

  texture(w, h2, source) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    if (source) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }

  // Two targets to soften into, kept while the size stays the same.
  target(i, w, h2) {
    const gl = this.gl;
    const have = this.targets[i];
    if (have && have.w === w && have.h === h2) return have;
    if (have) { gl.deleteTexture(have.tex); gl.deleteFramebuffer(have.fb); }
    const tex = this.texture(w, h2);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    this.targets[i] = { tex, fb, w, h: h2 };
    return this.targets[i];
  }

  // Soften `tex` by `radius` pixels into target `into` (a pair of passes, repeated for a wide radius).
  softened(tex, w, h2, radius, into) {
    const gl = this.gl;
    gl.useProgram(this.soften);
    const turns = Math.min(6, Math.max(1, Math.ceil(radius / 12)));
    const each = radius / Math.sqrt(turns);
    let from = tex;
    for (let n = 0; n < turns; n++) {
      for (const [i, sx, sy] of [[2, each / 6 / w, 0], [into, 0, each / 6 / h2]]) {
        const t = this.target(i, w, h2);
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
        gl.viewport(0, 0, w, h2);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, from);
        gl.uniform1i(gl.getUniformLocation(this.soften, 't'), 0);
        gl.uniform2f(gl.getUniformLocation(this.soften, 'step'), sx, sy);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        from = t.tex;
      }
    }
    return from;
  }

  // The picture on `source` (a canvas) with light, colour and detail applied; null without WebGL.
  run(source, r) {
    const pic = this.upload(source);
    if (!pic) return null;
    const done = this.light(pic, r);
    this.drop(pic);
    return done;
  }

  // `source` handed to the graphics chip once, so the screen can light it again and
  // again while a slider moves without sending the picture over each time.
  upload(source) {
    const gl = this.gl;
    if (!gl || source.width > this.most || source.height > this.most) return null;
    return { tex: this.texture(source.width, source.height, source), w: source.width, h: source.height };
  }

  drop(pic) {
    if (pic && this.gl) this.gl.deleteTexture(pic.tex);
  }

  light({ tex: img, w, h: h2 }, r) {
    const gl = this.gl;
    if (this.canvas.width !== w || this.canvas.height !== h2) {
      this.canvas.width = w;
      this.canvas.height = h2;
    }
    const long = Math.max(w, h2);
    const soft = r.detail.sharpen ? this.softened(img, w, h2, Math.max(1, long * 0.0012), 0) : img;
    const wide = r.detail.blur ? this.softened(img, w, h2, long * 0.03 * (r.detail.blur / 100), 1) : img;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h2);
    gl.useProgram(this.finish);
    const u = (name) => gl.getUniformLocation(this.finish, name);
    [[img, 'img'], [soft, 'soft'], [wide, 'wide']].forEach(([t, name], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(u(name), i);
    });
    const { light: L, colour: C, detail: D } = r;
    const values = { bright: L.brightness, contrast: L.contrast, high: L.highlights, shade: L.shadows, sat: C.saturation, warm: C.warmth, tint: C.tint, sharpen: D.sharpen, blur: D.blur, vig: D.vignette };
    for (const [k, v] of Object.entries(values)) gl.uniform1f(u(k), v / 100);
    gl.uniform1f(u('mono'), C.mono ? 1 : 0);
    gl.uniform2f(u('aspect'), w / long, h2 / long);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }

  destroy() {
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.width = this.canvas.height = 0;
  }
}

// ---------------------------------------------------------------- drawing and writing

// `at(x, y)` turns a place in fractions of the turned picture into pixels;
// `unit` is the turned picture's longer side, in those pixels.
function drawMarks(ctx, marks, at, unit) {
  for (const m of marks) {
    ctx.save();
    const colour = named(INK[m.c]) || INK[m.c];
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const width = (WIDTH[m.w] || WIDTH.m) * unit;
    if (m.t === 'text') {
      const size = (TYPE[m.w] || TYPE.m) * unit;
      const [x, y] = at(m.x, m.y);
      ctx.font = `700 ${size}px ${FONT}`;
      ctx.textBaseline = 'middle';
      ctx.shadowColor = named(m.c === 'black' ? '--white' : '--void') || 'black';
      ctx.shadowBlur = size * 0.18;
      ctx.fillText(m.text || '', x, y);
    } else if (m.t === 'arrow' && m.pts?.length === 2) {
      const [[x1, y1], [x2, y2]] = m.pts.map(([x, y]) => at(x, y));
      const lw = width * 1.25;
      const head = Math.max(lw * 4, unit * 0.02);
      const a = Math.atan2(y2 - y1, x2 - x1);
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.moveTo(x2 - head * Math.cos(a - 0.5), y2 - head * Math.sin(a - 0.5));
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(a + 0.5), y2 - head * Math.sin(a + 0.5));
      ctx.stroke();
    } else if (m.pts?.length) {
      // Pen and marker: a smooth line through the points; the marker wide and see-through.
      const marker = m.t === 'marker';
      ctx.lineWidth = marker ? width * 3 : width;
      if (marker) { ctx.globalAlpha = 0.45; ctx.lineCap = 'butt'; }
      const pts = m.pts.map(([x, y]) => at(x, y));
      ctx.beginPath();
      ctx.moveTo(...pts[0]);
      if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.01, pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
      }
      if (pts.length > 1) ctx.lineTo(...pts[pts.length - 1]);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// What is drawn moves with the picture when it is turned or mirrored.
function moveMarks(marks, fn) {
  return marks.map((m) => (m.t === 'text'
    ? { ...m, ...((([x, y]) => ({ x, y }))(fn(m.x, m.y))) }
    : { ...m, pts: m.pts.map(([x, y]) => fn(x, y)) }));
}

// ---------------------------------------------------------------- making the picture

// The whole picture at `k` pixels for each of the source's: shape, then light
// and colour, then what is drawn. Returns a 2D canvas.
function make(r, source, f, finisher, { k, region }) {
  const sw = (source.naturalWidth || source.width) / f;
  const sh = (source.naturalHeight || source.height) / f;
  const g = shapeOf(r, sw, sh);
  const w = Math.max(1, Math.round(region.w * g.W * k));
  const hh = Math.max(1, Math.round(region.h * g.H * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hh;
  const ctx = canvas.getContext('2d');
  drawShape(ctx, source, f, r, g, region, k);
  if (adjusted(r)) {
    const done = finisher.run(canvas, r);
    if (done) { ctx.clearRect(0, 0, w, hh); ctx.drawImage(done, 0, 0); }
  }
  const unit = Math.max(g.W, g.H) * k;
  drawMarks(ctx, r.marks, (x, y) => [(x - region.x) * g.W * k, (y - region.y) * g.H * k], unit);
  return canvas;
}

// ---------------------------------------------------------------- the editor

let open = null;

export async function openPhotoEditor(block, { onSaved } = {}) {
  if (open || !canEditPicture(block)) return;
  open = 'opening';
  // The room opens at once on the picture as it is shown now; the whole picture
  // (often several megabytes, from the server) takes its place when it is in.
  const coming = loadPicture(block);
  coming.catch(() => {});
  let editor = null;
  try {
    editor = new PhotoEditor(block, standIn(block), onSaved);
    open = editor;
    const shown = transition(() => editor.mount(), { type: 'room', before: () => [], after: () => [] });
    const ready = coming.then((picture) => editor.arrived(picture));
    ready.catch(() => {});
    await shown;
    editor.mounted();
    await ready;
  } catch (err) {
    const waiting = open === 'opening' || (editor && open === editor);
    if (editor && open === editor) editor.close();
    else if (open === 'opening') open = null;
    if (waiting) toast(err?.message || 'This picture couldn’t be opened for editing.');
  }
}

// What the room shows until the whole picture is in: the picture as it looks now,
// at the size the original is (for the Fact).
function standIn(block) {
  const o = block.meta?.original;
  return { full: null, small: null, f: 1, w: (o ? o.width : block.width) || 0, h: (o ? o.height : block.height) || 0, src: imageSrc(block) };
}

// The picture as it was uploaded, whole, and a smaller copy for the screen.
async function loadPicture(block) {
  const url = block.meta?.original ? `/api/blocks/${block.id}/original` : block.file;
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('The picture couldn’t be fetched. Check your connection.');
  const blob = await res.blob();
  let full;
  try {
    full = await createImageBitmap(blob);
  } catch {
    const src = URL.createObjectURL(blob);
    try {
      full = new Image();
      full.src = src;
      await full.decode();
    } catch {
      const ext = (block.meta?.original?.ext || block.ext || '').toLowerCase();
      throw new Error(ext === 'heic' || ext === 'heif'
        ? 'This browser can’t open HEIC pictures for editing. Safari can.'
        : 'This picture couldn’t be opened for editing.');
    }
  }
  const w = full.naturalWidth || full.width;
  const hh = full.naturalHeight || full.height;
  const f = Math.min(1, PREVIEW_EDGE / Math.max(w, hh));
  let small = full;
  if (f < 1) {
    small = document.createElement('canvas');
    small.width = Math.round(w * f);
    small.height = Math.round(hh * f);
    const ctx = small.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(full, 0, 0, small.width, small.height);
  }
  return { full, small, f: f < 1 ? small.width / w : 1, w, h: hh, type: blob.type };
}

class PhotoEditor {
  constructor(block, picture, onSaved) {
    this.block = block;
    this.pic = picture;
    this.onSaved = onSaved;
    this.saved = fromSaved(block.meta?.edit);
    this.r = structuredClone(this.saved);
    this.mark = structuredClone(this.saved);
    this.past = [];
    this.future = [];
    this.tab = 'crop';
    this.tool = { t: 'pen', c: 'red', w: 'm' };
    this.finisher = new Finisher();
    this.live = null;          // a line being drawn
    this.before = false;       // showing the picture as uploaded
  }

  // ------------------------------------------------------------ building

  mount() {
    const quiet = (label, run, cls = '') => h('button', { type: 'button', class: `btn btn-quiet ${cls}`.trim(), onclick: run }, label);
    const round = (name, label, run) => h('button', { type: 'button', class: 'btn btn-quiet btn-round', 'aria-label': label, title: label, onclick: run }, icon(name));
    this.undoBtn = round('undo', 'Undo', () => this.undo());
    this.redoBtn = round('redo', 'Redo', () => this.redo());
    this.beforeBtn = h('button', { type: 'button', class: 'btn btn-quiet pe-before', 'aria-pressed': 'false', title: 'Hold to see it as it was' }, 'Before');
    this.holdToCompare(this.beforeBtn);
    this.saveBtn = h('button', { type: 'button', class: 'btn btn-main', onclick: () => this.save() }, 'Save');
    this.canvas = h('canvas', { class: 'pe-canvas', 'aria-label': displayTitle(this.block) || 'Picture', role: 'img' });
    this.crop = this.cropLayer();
    this.frame = h('div', { class: 'pe-frame' }, this.canvas, this.crop);
    this.stage = h('div', { class: 'pe-stage' }, this.frame);
    this.tabs = segmented([['crop', 'Crop'], ['light', 'Light'], ['colour', 'Colour'], ['detail', 'Detail'], ['draw', 'Draw'], ['size', 'Size']]
      .map(([value, label]) => ({ value, label })), this.tab, (v) => this.show(v), { tabs: true, label: 'Tools', className: 'pe-tabs' });
    this.panel = h('div', { class: 'pe-panel' });
    this.fact = h('p', { class: 'pe-fact' });
    this.side = h('aside', { class: 'pe-side bar-glass' }, this.tabs.el, this.panel,
      h('div', { class: 'pe-foot' }, quiet('Start over', () => this.startOver(), 'btn-small'), this.fact));
    this.el = h('div', { class: 'pe room', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Edit picture' },
      h('div', { class: 'pe-top' }, this.undoBtn, this.redoBtn, this.beforeBtn),
      h('div', { class: 'pe-acts' }, this.cancelBtn = quiet('Cancel', () => this.cancel()), this.saveBtn),
      this.stage, this.side);
    this.onKey = (e) => this.key(e);
    addEventListener('keydown', this.onKey, true);
    this.sized = new ResizeObserver(() => this.paint());
    this.sized.observe(this.stage);
    this.drawable(this.frame);
    document.body.append(this.el);
    enterRoom();
    this.show(this.tab);
    this.update();
    if (!this.pic.small) this.waiting(true);
  }

  mounted() {
    (this.pic.small ? this.saveBtn : this.cancelBtn).focus({ preventScroll: true });
  }

  // Until the whole picture is in, the tools wait and Save says so; Cancel still leaves.
  waiting(on) {
    this.el.classList.toggle('is-loading', on);
    this.stage.inert = on;
    this.side.inert = on;
    this.beforeBtn.disabled = on;
    this.busy(on, 'Opening it…');
  }

  // The whole picture is in: the stand-in steps aside and the tools wake.
  arrived(picture) {
    if (open !== this) { picture.full?.close?.(); return; }
    this.pic = picture;
    if (!this.el) return;   // in before the room was built: it is built with it
    this.standIn?.remove();
    this.standIn = null;
    this.canvas.hidden = false;
    this.waiting(false);
    this.update();
    this.paint();
    if (!this.el.contains(document.activeElement) || document.activeElement === this.cancelBtn) this.saveBtn.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------ the panel for each tool

  show(tab) {
    this.text?.commit();
    this.tab = tab;
    this.tabs.set(tab);
    this.el.dataset.tool = tab;
    this.controls = {};
    const label = (words) => h('div', { class: 'pe-label' }, words);
    const sliders = (group, rows) => rows.map(([key, words, min = -100]) => {
      const s = slider({
        label: words, min, max: 100, value: this.r[group][key], format: min === 0 ? String : undefined,
        onInput: (v) => { this.r[group][key] = v; this.paint(); },
        onChange: () => this.commit(),
      });
      this.controls[`${group}.${key}`] = s;
      return s.el;
    });
    let body;
    if (tab === 'crop') {
      const turnBtn = (name, label, run) => h('button', { type: 'button', class: 'btn btn-round', 'aria-label': label, title: label, onclick: run }, icon(name));
      this.shapes = segmented([['free', 'Free'], ['square', 'Square'], ['4:3', '4:3'], ['16:9', '16:9']].map(([value, l]) => ({ value, label: l })),
        this.r.crop?.shape || 'free', (v) => this.shapeTo(v), { label: 'Shape' });
      const straighten = slider({
        label: 'Straighten', min: -45, max: 45, value: this.r.straighten, format: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}°`,
        onInput: (v) => { this.r.straighten = v; this.paint(); },
        onChange: () => this.commit(),
      });
      this.controls.straighten = straighten;
      body = [label('Shape'), this.shapes.el,
        label('Turn'), h('div', { class: 'pe-row' },
          turnBtn('turn-left', 'Turn left', () => this.turn(-90)), turnBtn('turn-right', 'Turn right', () => this.turn(90)),
          turnBtn('mirror', 'Mirror', () => this.flip('x')), turnBtn('mirror-down', 'Flip upside down', () => this.flip('y'))),
        straighten.el];
    } else if (tab === 'light') {
      body = sliders('light', [['brightness', 'Brightness'], ['contrast', 'Contrast'], ['highlights', 'Highlights'], ['shadows', 'Shadows']]);
    } else if (tab === 'colour') {
      const mono = h('input', { type: 'checkbox', checked: this.r.colour.mono, onchange: () => { this.r.colour.mono = mono.checked; this.paint(); this.commit(); } });
      this.controls.mono = mono;
      body = [...sliders('colour', [['saturation', 'Saturation'], ['warmth', 'Warmth'], ['tint', 'Tint']]),
        h('label', { class: 'switch' }, mono, h('span', { class: 'switch-track' }, h('span', { class: 'switch-knob' })), h('span', null, 'Black and white'))];
    } else if (tab === 'detail') {
      body = sliders('detail', [['sharpen', 'Sharpen', 0], ['blur', 'Soften', 0], ['vignette', 'Vignette', 0]]);
    } else if (tab === 'draw') {
      const tools = segmented([['pen', 'Pen'], ['marker', 'Marker'], ['arrow', 'Arrow'], ['text', 'Text']].map(([value, l]) => ({ value, label: l })),
        this.tool.t, (v) => { this.tool.t = v; tools.set(v); this.drawHint(); }, { label: 'Draw with' });
      const sizes = segmented([['s', 'Fine'], ['m', 'Medium'], ['l', 'Bold']].map(([value, l]) => ({ value, label: l })),
        this.tool.w, (v) => { this.tool.w = v; sizes.set(v); }, { label: 'Size' });
      const swatches = h('div', { class: 'pe-inks', role: 'radiogroup', 'aria-label': 'Colour' }, INKS.map(([key, name, words]) => h('button', {
        type: 'button', class: 'swatch', role: 'radio', 'aria-label': words, title: words, style: { '--c': `var(${name})` },
        'aria-checked': String(this.tool.c === key),
        onclick: (e) => {
          this.tool.c = key;
          for (const b of swatches.children) b.setAttribute('aria-checked', String(b === e.currentTarget));
        },
      })));
      this.hint = h('p', { class: 'pe-hint' });
      body = [tools.el, label('Colour'), swatches, label('Size'), sizes.el, this.hint,
        h('div', { class: 'pe-row' }, h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => this.clearMarks() }, 'Clear drawing'))];
      this.drawHint();
    } else if (tab === 'size') {
      this.sizes = segmented(SIZES.map(([value, l]) => ({ value, label: l })), this.r.size, (v) => { this.r.size = v; this.sizes.set(v); this.commit(); }, { label: 'Size' });
      body = [label('Save it at'), this.sizes.el, h('p', { class: 'pe-hint' }, 'Smaller pictures are quicker to send. The original is always kept.')];
    }
    body.forEach((el, i) => el.style.setProperty('--i', i));
    this.panel.replaceChildren(...body);
    this.paint();
    this.update();
  }

  drawHint() {
    if (!this.hint) return;
    this.hint.textContent = {
      pen: 'Draw on the picture.', marker: 'Mark over the picture, see-through.',
      arrow: 'Drag from where the arrow starts to where it points.', text: 'Click the picture where the words go.',
    }[this.tool.t];
  }

  // Bring every control in line with the settings (after undo, start over).
  sync() {
    for (const [key, c] of Object.entries(this.controls || {})) {
      if (key === 'straighten') c.set(this.r.straighten);
      else if (key === 'mono') c.checked = this.r.colour.mono;
      else { const [g, k] = key.split('.'); c.set(this.r[g][k]); }
    }
    this.shapes?.set(this.r.crop?.shape || 'free');
    this.sizes?.set(this.r.size);
  }

  // ------------------------------------------------------------ history

  // A finished change (a slider let go, a turn, a line drawn) is one step to undo.
  commit() {
    if (same(this.r, this.mark)) return;
    this.past.push(this.mark);
    if (this.past.length > 80) this.past.shift();
    this.mark = structuredClone(this.r);
    this.future = [];
    this.update();
  }

  undo() { this.step(this.past, this.future); }

  redo() { this.step(this.future, this.past); }

  step(from, to) {
    if (!from.length) return;
    to.push(structuredClone(this.r));
    this.r = from.pop();
    this.mark = structuredClone(this.r);
    this.sync();
    this.paint();
    this.update();
  }

  startOver() {
    if (isBlank(this.r)) return;
    this.r = blank();
    this.commit();
    this.sync();
    this.paint();
  }

  changed() { return !same(this.r, this.saved); }

  update() {
    this.undoBtn.disabled = !this.past.length;
    this.redoBtn.disabled = !this.future.length;
    if (!(this.pic.w > 0 && this.pic.h > 0)) { this.fact.textContent = ''; return; }
    const [w, hh] = this.outSize();
    const kind = this.outType()[1].toUpperCase();
    this.fact.textContent = `${w} × ${hh} · ${kind === 'JPG' ? 'JPEG' : kind}${this.block.meta?.original ? ' · original kept' : ''}`;
  }

  // ------------------------------------------------------------ the shape

  turn(by) {
    // Turning after a mirror turns the other way round, so it looks right.
    const step = (this.r.flipX !== this.r.flipY) ? -by : by;
    this.r.turn = (((this.r.turn + step) % 360) + 360) % 360;
    const right = by > 0;
    const point = right ? (x, y) => [1 - y, x] : (x, y) => [y, 1 - x];
    const c = this.r.crop;
    if (c) this.r.crop = { ...c, ...(right ? { x: 1 - c.y - c.h, y: c.x } : { x: c.y, y: 1 - c.x - c.w }), w: c.h, h: c.w };
    this.r.marks = moveMarks(this.r.marks, point);
    this.commit();
    this.paint();
  }

  flip(axis) {
    const c = this.r.crop;
    if (axis === 'x') {
      this.r.flipX = !this.r.flipX;
      if (c) c.x = 1 - c.x - c.w;
      this.r.marks = moveMarks(this.r.marks, (x, y) => [1 - x, y]);
    } else {
      this.r.flipY = !this.r.flipY;
      if (c) c.y = 1 - c.y - c.h;
      this.r.marks = moveMarks(this.r.marks, (x, y) => [x, 1 - y]);
    }
    this.r.straighten = -this.r.straighten;
    this.controls.straighten?.set(this.r.straighten);
    this.commit();
    this.paint();
  }

  ratio(shape) {
    return { square: 1, '4:3': 4 / 3, '16:9': 16 / 9 }[shape] || 0;
  }

  // A shape picked: the largest of it that fits, round the middle of the crop.
  shapeTo(shape) {
    this.shapes.set(shape);
    const g = this.shape();
    const c = this.r.crop || { ...FULL };
    const want = this.ratio(shape);
    if (!want) { this.r.crop = isFullCrop(c) ? null : { ...c, shape }; this.commit(); this.paint(); return; }
    // Keep the way round it already is: a tall crop stays tall.
    const tall = c.h * g.H > c.w * g.W;
    const px = tall ? 1 / want : want;            // width over height, in pixels
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    let w = 1;
    let hh = (w * g.W / px) / g.H;
    if (hh > 1) { hh = 1; w = (hh * g.H * px) / g.W; }
    this.r.crop = { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - hh / 2, 0, 1 - hh), w, h: hh, shape };
    this.commit();
    this.paint();
  }

  shape() { return shapeOf(this.r, this.pic.w, this.pic.h); }

  region() { return this.tab === 'crop' || this.before ? FULL : (this.r.crop || FULL); }

  // The size it will be saved at.
  outSize() {
    const g = this.shape();
    const c = this.r.crop || FULL;
    let w = c.w * g.W;
    let hh = c.h * g.H;
    const edge = SIZES.find(([k]) => k === this.r.size)?.[2] || 0;
    let s = edge ? Math.min(1, edge / Math.max(w, hh)) : 1;
    s = Math.min(s, Math.sqrt(MOST_PIXELS / (w * hh)));
    w = Math.max(1, Math.round(w * s));
    hh = Math.max(1, Math.round(hh * s));
    return [w, hh, s];
  }

  // What it is saved as: the same kind where the browser can write it, otherwise JPEG.
  outType() {
    const ext = (this.block.meta?.original?.ext || this.block.ext || '').toLowerCase();
    if (ext === 'png') return ['image/png', 'png'];
    if (ext === 'webp' && this.webp !== false) return ['image/webp', 'webp'];
    return ['image/jpeg', 'jpg'];
  }

  // ------------------------------------------------------------ painting

  paint() {
    if (this.painting) return;
    this.painting = requestAnimationFrame(() => {
      this.painting = 0;
      this.draw();
    });
  }

  // As large as the stage allows, keeping the shape pw × ph.
  fitStage(pw, ph) {
    const box = this.stage.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(this.stage).paddingLeft) * 2 || 0;
    const fit = Math.min(Math.max(40, box.width - pad) / pw, Math.max(40, box.height - pad) / ph);
    return [Math.max(1, Math.floor(pw * fit)), Math.max(1, Math.floor(ph * fit))];
  }

  // Before the whole picture is in: the picture as it is shown elsewhere, at its shape.
  drawStandIn() {
    if (!this.standIn) {
      if (!this.pic.src) return;
      this.standIn = h('img', { class: 'pe-canvas', src: this.pic.src, alt: '', onload: () => this.paint() });
      this.canvas.hidden = true;
      this.frame.prepend(this.standIn);
    }
    const iw = this.standIn.naturalWidth;
    const ih = this.standIn.naturalHeight;
    if (!iw || !ih) return;
    const [cssW, cssH] = this.fitStage(iw, ih);
    this.frame.style.width = `${cssW}px`;
    this.frame.style.height = `${cssH}px`;
  }

  // The screen is made in three layers that are kept between paints, so only what
  // changed is made again (in Safari each copy of a large canvas costs a lot):
  // its shape (turned, straightened, at screen size; handed to WebGL once), its
  // light and colour (one WebGL pass), and what is drawn on top.
  forget() {
    const s = this.screen;
    if (!s) return;
    this.finisher.drop(s.gl);
    for (const c of [s.shaped, s.base]) if (c) c.width = c.height = 0;
    this.screen = null;
  }

  draw() {
    if (!this.el?.isConnected) return;
    if (!this.pic.small) { this.drawStandIn(); return; }
    const r = this.before ? blank() : this.r;
    const g = shapeOf(r, this.pic.w, this.pic.h);
    const region = this.region();
    const pw = region.w * g.W;
    const ph = region.h * g.H;
    const [cssW, cssH] = this.fitStage(pw, ph);
    const dpr = Math.min(2, devicePixelRatio || 1);
    const k = Math.min(cssW * dpr / pw, this.pic.f);
    const w = Math.max(1, Math.round(pw * k));
    const hh = Math.max(1, Math.round(ph * k));
    const shapeKey = JSON.stringify([r.turn, r.flipX, r.flipY, r.straighten, region, w, hh]);
    if (this.screen?.key !== shapeKey) {
      this.forget();
      const shaped = document.createElement('canvas');
      shaped.width = w;
      shaped.height = hh;
      drawShape(shaped.getContext('2d'), this.pic.small, this.pic.f, r, g, region, k);
      this.screen = { key: shapeKey, shaped, gl: null, look: null, from: shaped, base: null };
    }
    const s = this.screen;
    const look = adjusted(r) ? JSON.stringify([r.light, r.colour, r.detail]) : '';
    if (s.look !== look) {
      s.look = look;
      s.from = s.shaped;
      if (s.base) s.base.width = s.base.height = 0;
      s.base = null;
      if (look) {
        s.gl = s.gl || this.finisher.upload(s.shaped);
        s.from = (s.gl && this.finisher.light(s.gl, r)) || s.shaped;
      }
    } else if (s.from !== s.shaped && !s.base) {
      // Only what is drawn changed (a line being drawn): copy the lit picture out of
      // WebGL once and draw over that copy from now on.
      s.base = document.createElement('canvas');
      s.base.width = w;
      s.base.height = hh;
      s.base.getContext('2d').drawImage(s.from, 0, 0);
      s.from = s.base;
    }
    if (this.canvas.width !== w || this.canvas.height !== hh) {
      this.canvas.width = w;
      this.canvas.height = hh;
    }
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, w, hh);
    ctx.drawImage(s.from, 0, 0);
    const at = (x, y) => [(x - region.x) * g.W * k, (y - region.y) * g.H * k];
    const unit = Math.max(g.W, g.H) * k;
    drawMarks(ctx, r.marks, at, unit);
    if (this.live && !this.before) drawMarks(ctx, [this.live], at, unit);
    this.frame.style.width = `${cssW}px`;
    this.frame.style.height = `${cssH}px`;
    this.view = { g, region, cssW, cssH };
    this.placeCrop();
    this.update();
  }

  holdToCompare(btn) {
    const on = (yes) => {
      if (this.before === yes) return;
      this.before = yes;
      btn.setAttribute('aria-pressed', String(yes));
      this.el?.classList.toggle('is-before', yes);
      this.paint();
    };
    btn.addEventListener('pointerdown', (e) => { btn.setPointerCapture?.(e.pointerId); on(true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, () => on(false));
    btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); on(true); } });
    btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') on(false); });
    btn.addEventListener('blur', () => on(false));
  }

  // ------------------------------------------------------------ the crop, by hand

  cropLayer() {
    const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((at) => h('span', { class: `pe-handle pe-handle-${at}`, 'data-at': at }));
    this.cropBox = h('div', { class: 'pe-crop-box', 'data-at': 'move' },
      h('span', { class: 'pe-third pe-third-v1' }), h('span', { class: 'pe-third pe-third-v2' }),
      h('span', { class: 'pe-third pe-third-h1' }), h('span', { class: 'pe-third pe-third-h2' }), ...handles);
    const layer = h('div', { class: 'pe-crop' }, this.cropBox);
    let start = null;
    layer.addEventListener('pointerdown', (e) => {
      const at = e.target.closest('[data-at]')?.dataset.at;
      if (!at || this.tab !== 'crop') return;
      e.preventDefault();
      layer.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, at, c: { ...(this.r.crop || FULL) } };
      layer.classList.add('is-dragging');
    });
    layer.addEventListener('pointermove', (e) => {
      if (!start || !this.view) return;
      const dx = (e.clientX - start.x) / this.view.cssW;
      const dy = (e.clientY - start.y) / this.view.cssH;
      this.r.crop = this.dragCrop(start, dx, dy);
      this.placeCrop();
      this.update();
    });
    const end = () => {
      if (!start) return;
      start = null;
      layer.classList.remove('is-dragging');
      if (this.r.crop && isFullCrop(this.r.crop) && (this.r.crop.shape || 'free') === 'free') this.r.crop = null;
      this.commit();
    };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);
    return layer;
  }

  dragCrop({ at, c }, dx, dy) {
    const MIN = 0.05;
    const g = this.shape();
    let l = c.x;
    let t = c.y;
    let rgt = c.x + c.w;
    let b = c.y + c.h;
    if (at === 'move') {
      const x = clamp(c.x + dx, 0, 1 - c.w);
      const y = clamp(c.y + dy, 0, 1 - c.h);
      return { ...c, x, y };
    }
    if (at.includes('w')) l = clamp(c.x + dx, 0, rgt - MIN);
    if (at.includes('e')) rgt = clamp(rgt + dx, l + MIN, 1);
    if (at.includes('n')) t = clamp(c.y + dy, 0, b - MIN);
    if (at.includes('s')) b = clamp(b + dy, t + MIN, 1);
    const shape = c.shape || 'free';
    const want = this.ratio(shape);
    if (want) {
      // Keep the shape: width over height in pixels stays as it was.
      const px = (c.w * g.W) / (c.h * g.H);
      const n = px * g.H / g.W;                    // width over height, in fractions
      let w = rgt - l;
      let hh = b - t;
      if (at === 'n' || at === 's') w = hh * n;
      else if (at === 'e' || at === 'w') hh = w / n;
      else if (Math.abs(dx) * g.W > Math.abs(dy) * g.H) hh = w / n; else w = hh * n;
      // Anchored at the side or corner that isn't moving (the middle, for an edge).
      const ax = at.includes('w') ? c.x + c.w : at.includes('e') ? c.x : c.x + c.w / 2;
      const ay = at.includes('n') ? c.y + c.h : at.includes('s') ? c.y : c.y + c.h / 2;
      const roomX = at.includes('w') ? ax : at.includes('e') ? 1 - ax : 2 * Math.min(ax, 1 - ax);
      const roomY = at.includes('n') ? ay : at.includes('s') ? 1 - ay : 2 * Math.min(ay, 1 - ay);
      const s = Math.min(1, roomX / w, roomY / hh);
      w = Math.max(MIN, w * s);
      hh = Math.max(MIN, hh * s);
      l = at.includes('w') ? ax - w : at.includes('e') ? ax : ax - w / 2;
      t = at.includes('n') ? ay - hh : at.includes('s') ? ay : ay - hh / 2;
      return { x: clamp(l, 0, 1 - w), y: clamp(t, 0, 1 - hh), w, h: hh, shape };
    }
    return { x: l, y: t, w: rgt - l, h: b - t, shape };
  }

  placeCrop() {
    const c = this.r.crop || FULL;
    Object.assign(this.cropBox.style, { left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` });
  }

  // ------------------------------------------------------------ drawing and writing, by hand

  // Where a pointer is, in fractions of the turned picture.
  spot(e) {
    const box = this.canvas.getBoundingClientRect();
    const { region } = this.view;
    const fx = clamp((e.clientX - box.left) / box.width, 0, 1);
    const fy = clamp((e.clientY - box.top) / box.height, 0, 1);
    return [round4(region.x + fx * region.w), round4(region.y + fy * region.h)];
  }

  drawable(frame) {
    let drawing = false;
    frame.addEventListener('pointerdown', (e) => {
      if (this.tab !== 'draw' || this.before || e.button > 0 || e.target.closest('.pe-text')) return;
      e.preventDefault();
      const p = this.spot(e);
      if (this.tool.t === 'text') { this.writeAt(p); return; }
      drawing = true;
      frame.setPointerCapture(e.pointerId);
      this.live = { t: this.tool.t, c: this.tool.c, w: this.tool.w, pts: this.tool.t === 'arrow' ? [p, p] : [p] };
      this.paint();
    });
    frame.addEventListener('pointermove', (e) => {
      if (!drawing || !this.live) return;
      const p = this.spot(e);
      if (this.live.t === 'arrow') this.live.pts[1] = p;
      else {
        const [lx, ly] = this.live.pts[this.live.pts.length - 1];
        if (Math.hypot(p[0] - lx, p[1] - ly) > 0.002) this.live.pts.push(p);
      }
      this.paint();
    });
    const end = () => {
      if (!drawing) return;
      drawing = false;
      const m = this.live;
      this.live = null;
      if (m && !(m.t === 'arrow' && Math.hypot(m.pts[1][0] - m.pts[0][0], m.pts[1][1] - m.pts[0][1]) < 0.01)) {
        this.r.marks = [...this.r.marks, m];
        this.commit();
      }
      this.paint();
    };
    frame.addEventListener('pointerup', end);
    frame.addEventListener('pointercancel', end);
  }

  // A text box where the words will be; Enter or clicking away puts them on the picture.
  writeAt([x, y]) {
    this.text?.commit();
    const { region, g, cssW } = this.view;
    const unit = Math.max(g.W, g.H) * (cssW / (region.w * g.W));
    const input = h('input', {
      class: 'field pe-text', type: 'text', maxlength: 200, 'aria-label': 'Words on the picture', placeholder: 'Type here',
      style: {
        left: `${((x - region.x) / region.w) * 100}%`, top: `${((y - region.y) / region.h) * 100}%`,
        '--pe-type': `${Math.max(14, (TYPE[this.tool.w] || TYPE.m) * unit)}px`,
      },
    });
    const tool = { ...this.tool };
    const done = (keep) => {
      if (this.text?.input !== input) return;
      this.text = null;
      const words = input.value.trim();
      input.remove();
      if (keep && words) {
        this.r.marks = [...this.r.marks, { t: 'text', c: tool.c, w: tool.w, x, y, text: words }];
        this.commit();
        this.paint();
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); done(true); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
    });
    input.addEventListener('blur', () => done(true));
    this.text = { input, commit: () => done(true) };
    this.frame.append(input);
    requestAnimationFrame(() => input.focus());
  }

  clearMarks() {
    if (!this.r.marks.length) return;
    this.r.marks = [];
    this.commit();
    this.paint();
  }

  // ------------------------------------------------------------ keys

  key(e) {
    if (open !== this || document.querySelector('.scrim:not(.is-leaving), .pop:not(.is-leaving)')) return;
    const typing = e.target.closest?.('input[type="text"], textarea');
    if (e.key === 'Escape' && !typing) {
      e.preventDefault();
      e.stopPropagation();
      this.cancel();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) this.redo(); else this.undo();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // The file view underneath must not step to the next file.
      e.stopPropagation();
    }
  }

  // ------------------------------------------------------------ leaving

  async cancel() {
    this.text?.commit();
    if (this.changed()) {
      const leave = await confirmDialog({ title: 'Leave without saving?', message: 'Your changes to this picture will be lost.', confirm: 'Leave' });
      if (!leave) return;
    }
    this.close();
  }

  async close() {
    if (open !== this) return;
    open = null;
    removeEventListener('keydown', this.onKey, true);
    this.sized.disconnect();
    await transition(() => {
      this.el.remove();
      leaveRoom();
    }, { type: 'room', before: () => [], after: () => [] });
    this.forget();
    this.finisher.destroy();
    this.pic.full?.close?.();
    this.canvas.width = this.canvas.height = 0;
  }

  busy(on, words = 'Saving it…') {
    this.saveBtn.disabled = on;
    this.saveBtn.classList.toggle('is-busy', on);
    this.saveBtn.textContent = on ? words : 'Save';
  }

  async save() {
    this.text?.commit();
    if (!this.changed()) { this.close(); return; }
    const id = this.block.id;
    try {
      // Nothing left of any edit: the original comes back.
      if (isBlank(this.r)) {
        if (this.block.meta?.original) {
          this.busy(true, 'Putting it back…');
          const { block } = await api.post(`/api/blocks/${id}/original`);
          this.done(block, 'Back to the original');
        } else this.close();
        return;
      }
      this.busy(true);
      await nextFrame();
      const [w, hh, s] = this.outSize();
      this.forget();
      const made = make(this.r, this.pic.full, 1, this.finisher, { k: s, region: this.r.crop || FULL });
      let [type] = this.outType();
      let blob = await toBlob(made, type);
      if (!blob || blob.type !== type) { this.webp = false; type = 'image/jpeg'; blob = await toBlob(made, type); }
      made.width = made.height = 0;
      if (!blob) throw new Error('The picture couldn’t be made. It may be too large for this browser.');
      let { block } = await sendFile(`/api/blocks/${id}/picture?w=${w}&h=${hh}`, blob, { type });
      await api.put(`/api/blocks/${id}/edit`, { edit: this.r });
      block = { ...block, meta: { ...block.meta, edit: structuredClone(this.r) } };
      const ext = type.split('/')[1].replace('jpeg', 'jpg');
      const thumb = await makeThumb(new File([blob], `picture.${ext}`, { type }), 'image').catch(() => null);
      if (thumb?.blob) block = (await sendFile(`/api/blocks/${id}/thumb?w=${w}&h=${hh}`, thumb.blob).catch(() => ({ block }))).block;
      // Its colours and what it shows are read again, after it is shown.
      const source = thumb?.blob || blob;
      Promise.all([lookOfBlob(source).catch(() => null), readPicture(source).catch(() => null)]).then(([look, see]) => {
        if (look || see) api.patch(`/api/blocks/${id}`, { ...(look && { look }), ...(see && { see }) }).then((res) => bus.emit('block:changed', res.block)).catch(() => {});
      });
      this.done(block, `Saved · ${fmtBytes(blob.size)} · the original is kept`);
    } catch (err) {
      this.busy(false);
      toast(err?.message || 'The picture couldn’t be saved. Try again.');
    }
  }

  done(block, words) {
    bus.emit('block:changed', block);
    this.onSaved?.(block);
    this.close();
    toast(words);
  }
}

// ---------------------------------------------------------------- small helpers

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round4(v) { return Math.round(v * 10000) / 10000; }
function isFullCrop(c) { return c.x <= 0.001 && c.y <= 0.001 && c.w >= 0.999 && c.h >= 0.999; }
function nextFrame() { return new Promise((r) => requestAnimationFrame(() => setTimeout(r))); }
function toBlob(canvas, type) { return new Promise((resolve) => canvas.toBlob(resolve, type, 0.92)); }
