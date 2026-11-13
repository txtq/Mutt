// The sky behind every page (DESIGN.md, "The sky"): a deep ground, one river of
// print dust that drifts on a slow liquid, a hint of light on that liquid, many
// small stars and a few that flare, and old-film grain. Out in the universe it
// goes dark and still, with no stars.
//
// It is built to cost almost nothing:
//   1. the slow liquid is worked out small (a sixth of the screen each way);
//   2. one light pass at full size turns it into ground, dots, sheen and grain;
//   3. both run DUST_FPS times a second, never while the tab is hidden or out in
//      the universe, and once under Motion: Still (and Calm);
//   4. the stars are their own layer of ready-made pictures, redrawn STAR_FPS
//      times a second to twinkle, and every frame only while something pushes
//      them about (the pointer, a scroll, the void).

import { DUR, h, onMotionChange, reducedMotion } from './util.js';

const DUST_FPS = 8;
const STAR_FPS = 4;
const FIELD = 6;        // the liquid is worked out at 1/FIELD of the screen each way
const DUST_DPR = 1.5;   // sharper than this costs far more for nothing the eye sees in dust
const DRIFT = 0.15;     // how fast the liquid moves ("slow" on the sky board)
const smoothstep = (t) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const NOISE = `
float h21(vec2 p) { vec3 a = fract(vec3(p.xyx) * .1031); a += dot(a, a.yzx + 33.33); return fract((a.x + a.y) * a.z); }
vec2 h22(vec2 p) { float n = h21(p); return vec2(n, h21(p + n + 17.1)); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1., 0.)), f.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), f.x), f.y);
}
float fbm(vec2 p) { float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec2(17.3, 9.1); a *= .5; } return s / .9375; }
float fbm2(vec2 p) { return (vn(p) + .45 * vn(p * 2.1 + vec2(9.3, 4.1))) / 1.45; }`;

// 1. The liquid, small. Out: r = how much dust, g = the light on the liquid,
// b = where that light shows, a = how wide its colour line is (over 8).
const FIELD_FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uT;
out vec4 o;
${NOISE}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes; uv.y = 1. - uv.y;
  float asp = uRes.x / uRes.y, t = uT;
  vec2 p = vec2(uv.x * asp, uv.y) * 1.5;
  // one slow field drives the river, its lanes and the light, so they move as one
  vec2 q = vec2(fbm(p + vec2(0., t * .05)), fbm(p + vec2(5.2, 1.3) - vec2(t * .04, 0.)));
  vec2 r = vec2(fbm(p + 2.6 * q + vec2(1.7, 9.2) + t * .03), fbm(p + 2.6 * q + vec2(8.3, 2.8) - t * .025));
  float f = fbm(p + 2.6 * r);
  // the river: low left to high right, with dark winding lanes cut through it
  float dd = uv.y - (.8 - .58 * uv.x) + (r.x - .5) * .34;
  float river = exp(-dd * dd / .017) * (.5 + .7 * f);
  float cut = smoothstep(.022, .075, abs(fbm(p * 1.25 + 2.2 * q + 31.) - .5));
  float fl = max(0., (uv.y - .5) / .5); fl = fl * fl * (1. - .45 * uv.x) * .55;
  float den = .006 + .9 * river * cut + .16 * fl * cut;
  // the surface of a dark liquid, lit from above
  vec2 pp = vec2(p.x * .45, p.y) * 2.3 + .45 * q + vec2(t * .012, 3.);
  float h0 = fbm2(pp);
  float v = clamp(.5 + dot(vec2(fbm2(pp + vec2(.03, 0.)) - h0, fbm2(pp + vec2(0., .03)) - h0) / .03, vec2(-.33, -.94)) * .55, 0., 1.);
  float mask = smoothstep(.44, .62, fbm2(p * 1.3 + vec2(40., t * .012)));
  float th = mix(1.6, 7., vn(p * .9 + vec2(11., t * .01)));
  o = vec4(den, v, mask, th / 8.);
}`;

// 2. The picture, full size: ground, two dot screens, sheen with its thin colour
// line, film. The four colours are the sky's (tokens.css); nothing else differs
// between Vita, Nebula, Aurora and Dusk.
const PAINT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uF;
uniform vec2 uRes, uFRes;
uniform float uPx, uT, uSeed;
uniform vec3 cTop, cDeep, cMid, cLow;
out vec4 o;
${NOISE}
// across a fold: red, amber, a pale core, green, blue, violet
vec3 ramp(float x) {
  vec3 c = mix(vec3(0.), vec3(1., .1, .2), smoothstep(0., .15, x));
  c = mix(c, vec3(1., .6, .1), smoothstep(.15, .3, x));
  c = mix(c, vec3(1., .98, .78), smoothstep(.3, .42, x));
  c = mix(c, vec3(.2, 1., .45), smoothstep(.42, .56, x));
  c = mix(c, vec3(.1, .72, 1.), smoothstep(.56, .7, x));
  c = mix(c, vec3(.42, .3, 1.), smoothstep(.7, .85, x));
  return mix(c, vec3(0.), smoothstep(.85, 1., x));
}
// one screen of print dots: a dot shows once the dust passes its own threshold
float stipple(vec2 sp, float size, float den, float seed) {
  vec2 cell = floor(sp / size) + seed, cf = fract(sp / size);
  float th = h21(cell + 3.7), rad = mix(.16, .3, h21(cell + 9.1));
  return smoothstep(th - .07, th + .07, den) * smoothstep(rad, rad - .16, length(cf - (.2 + .6 * h22(cell)))) * mix(.22, .8, h21(cell + 5.3));
}
void main() {
  vec2 st = gl_FragCoord.xy / uRes, uv = vec2(st.x, 1. - st.y);
  float asp = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * asp, uv.y) * 1.5;
  vec4 F = texture(uF, st);
  float glit = .6 + .8 * h21(gl_FragCoord.xy);
  // the ground: top, deep at 34%, half mid half deep at 78%, and the floor glowing from the bottom left
  vec3 cA = mix(cMid, cDeep, .5), cB = mix(mix(cMid, cLow, .3), cDeep, .45);
  vec3 col = uv.y < .34 ? mix(cTop, cDeep, uv.y / .34) : uv.y < .78 ? mix(cDeep, cA, (uv.y - .34) / .44) : mix(cA, cB, (uv.y - .78) / .22);
  col = mix(col, cLow, clamp(1. - length((uv - vec2(.12, 1.12)) / vec2(1.3, .85)) / .62, 0., 1.) * .46);
  // the print
  vec2 sp = gl_FragCoord.xy / uPx;
  float dn = min(F.r, .62);
  float dots = max(stipple(sp, 2.7, dn, 0.), stipple(mat2(.891, .454, -.454, .891) * sp, 3.4, dn * .8, 40.));
  col = mix(col, mix(cLow, vec3(1.), .72), dots);
  // a hint of light on the liquid: pale sheen on the folds that face it, colour only where a highlight ends
  vec2 e = 1.5 / uFRes;
  vec2 g = vec2(texture(uF, st + vec2(e.x, 0.)).g - texture(uF, st - vec2(e.x, 0.)).g, texture(uF, st + vec2(0., e.y)).g - texture(uF, st - vec2(0., e.y)).g);
  float gw = max(length(g / (3. * uRes / uFRes)) * uPx, .0004), v = F.g, th = F.a * 8.;
  vec3 pearl = mix(vec3(.72, .8, 1.), vec3(1., .93, .78), smoothstep(.72, 1., v));
  vec3 li = pearl * pow(smoothstep(.5, .92, v), 1.3) * .32;
  li += (ramp(.5 + .5 * clamp((v - .6) / (gw * th), -1., 1.)) + .6 * ramp(.5 + .5 * clamp((.34 - v) / (gw * th * 1.2), -1., 1.))) * .61 * (.3 + .7 * smoothstep(.3, .7, vn(p * 2.3 + vec2(uT * .02, 7.))));
  li += vec3(.25, .2, .9) * smoothstep(.32, .05, v) * .06;
  col += li * F.b * glit * (1. - .5 * col);
  // old film: a little faded and warm, blacks lifted, grain
  col = mix(col, vec3(dot(col, vec3(.3, .59, .11))), .1);
  col = col * vec3(1.05, 1., .93) + vec3(.012, .02, .017);
  col += (h21(gl_FragCoord.xy * .71 + uSeed * vec2(37., 17.)) - .5) * .095;
  o = vec4(clamp(col, 0., 1.), 1.);
}`;

// The stars' colours (tokens.css): about a third white, the rest warm and cool.
const TINTS = ['--star-white', '--star-white', '--star-white', '--star-amber', '--star-blue', '--star-pink', '--star-mint'];
// A colour as the browser reports it (a hex, rgb() or color()), as [r, g, b] out of 255.
function channels(text) {
  const t = text.trim();
  if (t[0] === '#') {
    const n = parseInt(t.length < 6 ? t.slice(1).replace(/./g, '$&$&') : t.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const parts = (t.match(/-?[\d.]+(?:e-?\d+)?/g) || [255, 255, 255]).slice(0, 3).map(Number);
  return t.startsWith('color(') ? parts.map((v) => v * 255) : parts;
}
const ink = (c, a) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A small soft point, drawn once per colour.
function pointPicture(tint, dpr) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(16 * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const fall = g.createRadialGradient(8, 8, 0, 8, 8, 8);
  fall.addColorStop(0, ink(tint, 1)); fall.addColorStop(0.22, ink(tint, 0.55)); fall.addColorStop(0.5, ink(tint, 0.1)); fall.addColorStop(1, ink(tint, 0));
  g.fillStyle = fall;
  g.fillRect(0, 0, 16, 16);
  return c;
}

// A flare, drawn once: a core, a soft halo and two arms of its own lengths and
// tilt, with red and blue pulled a little apart like an old lens. No two match.
function flarePicture(rand, tint, dpr) {
  const m = 0.3 + 0.7 * rand() ** 1.7;
  const len = (5 + 30 * m) * (0.6 + 0.8 * rand());
  const len2 = len * (0.45 + 0.55 * rand());
  const tilt = (rand() < 0.3 ? Math.PI / 4 : 0) + (rand() - 0.5) * 0.22;
  const half = Math.ceil(len * 2.2 + 6);
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(half * 2 * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.translate(half, half);
  g.globalCompositeOperation = 'lighter';
  for (const [dx, dy, keep] of [[2.1, 0.8, [1, 0, 0]], [0, 0, [0, 1, 0]], [-2.1, -0.8, [0, 0, 1]]]) {
    const col = (a) => ink(tint.map((v, i) => v * keep[i]), a);
    g.save();
    g.translate(-dx, -dy);
    const halo = g.createRadialGradient(0, 0, 0, 0, 0, 3 * (3 + 10 * m));
    halo.addColorStop(0, col(0.22 * m)); halo.addColorStop(0.33, col(0.08 * m)); halo.addColorStop(1, col(0));
    g.fillStyle = halo;
    g.fillRect(-half, -half, half * 2, half * 2);
    const size = (0.9 + 1.5 * m) * 2.2;
    const core = g.createRadialGradient(0, 0, 0, 0, 0, size);
    core.addColorStop(0, col(1)); core.addColorStop(0.45, col(0.4)); core.addColorStop(1, col(0));
    g.fillStyle = core;
    g.beginPath(); g.arc(0, 0, size, 0, Math.PI * 2); g.fill();
    g.rotate(tilt);
    for (const [reach, turn] of [[len, 0], [len2, Math.PI / 2]]) {
      g.save();
      g.rotate(turn);
      const arm = g.createLinearGradient(-reach * 2.2, 0, reach * 2.2, 0);
      arm.addColorStop(0, col(0)); arm.addColorStop(0.36, col(0.1 * m)); arm.addColorStop(0.5, col(0.75 * m)); arm.addColorStop(0.64, col(0.1 * m)); arm.addColorStop(1, col(0));
      g.fillStyle = arm;
      g.fillRect(-reach * 2.2, -0.55, reach * 4.4, 1.1);
      g.restore();
    }
    g.restore();
  }
  return { picture: c, half, strength: 0.4 + 0.5 * m };
}

// Film grain as a small still tile, for where the moving dust isn't drawn (the
// universe, and browsers without the graphics the dust needs).
function grainTile() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const image = g.createImageData(128, 128);
  const rand = mulberry(7);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = rand() - 0.5;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = v > 0 ? 255 : 0;
    image.data[i + 3] = Math.abs(v) * 2 * 15;
  }
  g.putImageData(image, 0, 0);
  return `url(${c.toDataURL()})`;
}

// The moving dust: two programs on one WebGL2 canvas. Null where the browser
// can't do it; the sky is then its ground, stars and still grain.
function dustPainter(canvas) {
  let gl = null;
  try { gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' }); } catch { gl = null; }
  if (!gl) return null;
  const program = (frag, names) => {
    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const loc = {};
    for (const name of names) loc[name] = gl.getUniformLocation(p, name);
    return { p, loc };
  };
  let field; let paint; let tex; let fbo;
  const build = () => {
    // the liquid's picture needs more than 8 bits, or its thin colour lines come out in steps
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) throw new Error('no half-float pictures');
    field = program(FIELD_FRAG, ['uRes', 'uT']);
    paint = program(PAINT_FRAG, ['uF', 'uRes', 'uFRes', 'uPx', 'uT', 'uSeed', 'cTop', 'cDeep', 'cMid', 'cLow']);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    tex = gl.createTexture();
    fbo = gl.createFramebuffer();
  };
  try { build(); } catch (err) {
    console.warn('Sky: no moving dust here.', err);
    return null;
  }
  let fw = 0; let fh = 0; let lost = false;
  // Graphics drawn by the processor instead of a graphics card: far too slow to move.
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const software = /swiftshader|llvmpipe|software|basic render/i.test(info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '');
  const size = (w, hgt, dpr) => {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    fw = Math.max(64, Math.round(w / FIELD));
    fh = Math.max(40, Math.round(hgt / FIELD));
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, fw, fh, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  };
  let last = null;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  canvas.addEventListener('webglcontextrestored', () => {
    try { build(); lost = false; if (last) size(...last); } catch { /* stays lost: the ground and stars still show */ }
  });
  return {
    software,
    size(w, hgt, dpr) { last = [w, hgt, dpr]; if (!lost) size(w, hgt, dpr); },
    // `t` is the liquid's own clock, `seed` picks the grain, `colors` the sky's four ([r, g, b] 0 to 1).
    // With `timed` it gives a promise of how many milliseconds the picture took. The page never waits
    // for it: a marker is left behind the picture and looked for between the page's other jobs.
    draw(t, seed, dpr, colors, timed = false) {
      if (lost || !fw) return null;
      const began = timed ? performance.now() : 0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, fw, fh);
      gl.useProgram(field.p);
      gl.uniform2f(field.loc.uRes, fw, fh);
      gl.uniform1f(field.loc.uT, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(paint.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(paint.loc.uF, 0);
      gl.uniform2f(paint.loc.uRes, canvas.width, canvas.height);
      gl.uniform2f(paint.loc.uFRes, fw, fh);
      gl.uniform1f(paint.loc.uPx, dpr);
      gl.uniform1f(paint.loc.uT, t);
      gl.uniform1f(paint.loc.uSeed, seed);
      gl.uniform3fv(paint.loc.cTop, colors[0]);
      gl.uniform3fv(paint.loc.cDeep, colors[1]);
      gl.uniform3fv(paint.loc.cMid, colors[2]);
      gl.uniform3fv(paint.loc.cLow, colors[3]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!timed) return null;
      const mark = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      return new Promise((done) => {
        const look = () => {
          const took = performance.now() - began;
          if (lost || took > 200 || gl.getSyncParameter(mark, gl.SYNC_STATUS) === gl.SIGNALED) { gl.deleteSync(mark); done(took); }
          else setTimeout(look, 1);
        };
        setTimeout(look, 1);
      });
    },
  };
}

let instance = null;
export const theSky = () => instance;

export function createSky() {
  const dustCanvas = h('canvas', { class: 'sky-dust' });
  const starCanvas = h('canvas', { class: 'sky-stars' });
  const wash = h('div', { class: 'sky-wash' });
  const el = h('div', { class: 'sky', 'aria-hidden': 'true' }, wash, dustCanvas, h('div', { class: 'sky-night' }), starCanvas);
  el.style.setProperty('--sky-grain', grainTile());
  const dust = dustPainter(dustCanvas);
  if (!dust) el.classList.add('is-flat');
  const ctx = starCanvas.getContext('2d');

  let width = 0;
  let height = 0;
  let dpr = 1;
  let dustDpr = 1;
  let stars = [];
  let flares = [];
  let points = [];
  let seededFor = null;
  const lean = { x: 0, y: 0, tx: 0, ty: 0 };
  let pulls = [];
  let frame = 0;
  let lastStars = 0;
  let lastDust = 0;
  let lastTick = 0;
  let clock = 24;        // the liquid's own time; it only runs while the dust is drawn
  let drawnScroll = 0;
  let busy = false;
  let lens = null;
  // How strongly the void bends the sky (0 to 1). It eases in and out, so
  // arriving at or leaving a galaxy doesn't snap the stars into a ring.
  let bend = 0;
  let lastHole = null;
  let night = 0;
  let hurry = 0;         // until when the dust is redrawn every frame (a sky changing colour)
  // The first few pictures of dust are timed. A computer that needs more than
  // SLOW_MS for one keeps a still sky: the same picture, never redrawn to move.
  const SLOW_MS = 14;
  let slow = !!dust?.software;
  const timings = [];
  let timing = false;    // one picture is being timed

  // Stars sit at fractions of the screen, so a small resize (a phone's address
  // bar sliding away) stretches the sky a little instead of reshuffling it.
  // Most are small points that gather where the river is; a handful flare.
  function seed() {
    const style = getComputedStyle(document.documentElement);
    const tints = TINTS.map((name) => channels(style.getPropertyValue(name)));
    const rand = mulberry(20261113);
    points = tints.map((t) => pointPicture(t, dpr));
    stars = [];
    flares = [];
    for (let cy = 0; cy * 44 < height; cy++) {
      for (let cx = 0; cx * 44 < width; cx++) {
        const u = ((cx + 0.15 + 0.7 * rand()) * 44) / width;
        const v = ((cy + 0.15 + 0.7 * rand()) * 44) / height;
        const off = v - (0.8 - 0.58 * u);
        const keep = rand();
        const m = rand();
        const tint = Math.floor(rand() * tints.length);
        const speed = 0.3 + 1.2 * rand();
        const phase = rand() * Math.PI * 2;
        if (keep > (0.05 + 0.42 * Math.exp((-off * off) / 0.017) * 0.85) * 1.65) continue;
        stars.push({ u, v, r: (0.7 + 1.1 * m * m) * 3.2, a: 0.22 + 0.55 * m, depth: m, picture: points[tint], speed, phase });
      }
    }
    for (let cy = 0; cy * 210 < height; cy++) {
      for (let cx = 0; cx * 210 < width; cx++) {
        const u = ((cx + 0.2 + 0.6 * rand()) * 210) / width;
        const v = ((cy + 0.2 + 0.6 * rand()) * 210) / height;
        const tint = tints[Math.floor(rand() * tints.length)];
        const flare = flarePicture(rand, tint, dpr);
        const keep = rand();
        if (keep > 0.44) continue;
        flares.push({ u, v, r: flare.half, a: flare.strength, depth: 0.9, picture: flare.picture, speed: 0.2 + 0.5 * rand(), phase: rand() * Math.PI * 2 });
      }
    }
    seededFor = { width, height };
  }

  function measure() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    dustDpr = Math.min(devicePixelRatio || 1, DUST_DPR);
    width = innerWidth;
    height = innerHeight;
    starCanvas.width = Math.round(width * dpr);
    starCanvas.height = Math.round(height * dpr);
    dust?.size(width, height, dustDpr);
    // a new sky of stars only when the screen really changed shape
    if (!seededFor || Math.abs(width - seededFor.width) > seededFor.width * 0.25 || Math.abs(height - seededFor.height) > seededFor.height * 0.25) seed();
  }

  function place(s, time) {
    let x = s.u * width + lean.x * s.depth * 14;
    let y = s.v * height + lean.y * s.depth * 10 - drawnScroll * (0.02 + s.depth * 0.05);
    y = ((y % height) + height) % height;
    for (const p of pulls) {
      // Ease in toward the pull, then let go.
      const t = (time - p.start) / p.duration;
      const k = Math.sin(Math.PI * t) * p.strength;
      const dx = p.x - x;
      const dy = p.y - y;
      const dist = Math.hypot(dx, dy) || 1;
      const reach = Math.max(0, 1 - dist / p.radius);
      x += (dx / dist) * reach * reach * k * 60;
      y += (dy / dist) * reach * reach * k * 60;
    }
    if (bend && lastHole) {
      // Gravitational lensing: light from behind the void is bent outward,
      // so the stars crowd into a bright ring round its edge. The bend fades
      // out a little way past the dark, so a big void doesn't shove the whole sky about.
      const hole = lastHole;
      const dx = x - hole.x;
      const dy = y - hole.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const e = hole.r * 1.05;
      const reach = hole.r * 3.2;
      if (d < reach) {
        const fade = (1 - smoothstep((d - hole.r * 1.8) / (reach - hole.r * 1.8))) * bend;
        const bent = d + ((d + Math.sqrt(d * d + 4 * e * e)) / 2 - d) * fade;
        x = hole.x + (dx / d) * bent;
        y = hole.y + (dy / d) * bent;
      }
    }
    return [x, y];
  }

  function drawStars(time, dt = 32) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    // Eased by time, not by frame, so it feels the same at any frame rate.
    const ease = (ms) => 1 - Math.exp(-dt / ms);
    lean.x += (lean.tx - lean.x) * ease(780);
    lean.y += (lean.ty - lean.y) * ease(780);
    drawnScroll = scrollY;
    pulls = pulls.filter((p) => time - p.start < p.duration);
    const want = lens?.() || null;
    if (want) lastHole = want;
    const aim = want ? 1 : 0;
    const still = reducedMotion();
    bend = still ? aim : bend + (aim - bend) * ease(340);
    if (Math.abs(aim - bend) < 0.005) bend = aim;
    // Still settling: keep drawing every frame until it has.
    busy = pulls.length > 0 || bend !== aim || Math.abs(lean.tx - lean.x) + Math.abs(lean.ty - lean.y) > 0.002;
    const tw = still ? 0 : time / 1000;
    for (const list of [stars, flares]) {
      for (const s of list) {
        const [x, y] = place(s, time);
        ctx.globalAlpha = s.a * (0.84 + 0.16 * Math.sin(tw * s.speed + s.phase));
        ctx.drawImage(s.picture, x - s.r, y - s.r, s.r * 2, s.r * 2);
      }
    }
    ctx.globalAlpha = 1;
    lastStars = time;
  }

  function drawDust(time) {
    if (!dust) return;
    // read off the wash while it is on the page: a sky's colours ease there when another is picked
    const style = getComputedStyle(wash.isConnected ? wash : document.documentElement);
    const colors = ['--sky-top', '--sky-deep', '--sky-mid', '--sky-low'].map((name) => channels(style.getPropertyValue(name)).map((v) => v / 255));
    // the grain changes six times a second, like film; it holds still when nothing moves
    const took = dust.draw(clock, resting() ? 0 : Math.floor(time / 166), dustDpr, colors, !slow && !timing && timings.length < 5);
    if (took) {
      timing = true;
      took.then((ms) => {
        timing = false;
        if (timings.push(ms) === 5) slow = timings.sort((a, b) => a - b)[2] > SLOW_MS;
        // too slow to move: paint it once more and keep that picture (a copy is only good in the job that painted it)
        if (slow) drawDust(performance.now());
      });
    }
    if (slow) keepStill();
    lastDust = time;
  }

  // On a slow computer even showing a live graphics canvas costs every frame, so the
  // dust is copied once onto a plain picture and that is what stays on the page.
  let stillCanvas = null;
  function keepStill() {
    if (!stillCanvas) {
      stillCanvas = h('canvas', { class: 'sky-dust' });
      dustCanvas.replaceWith(stillCanvas);
    }
    stillCanvas.width = dustCanvas.width;
    stillCanvas.height = dustCanvas.height;
    stillCanvas.getContext('2d').drawImage(dustCanvas, 0, 0);
  }

  // The dust holds still under Still and Calm, and on a computer too slow for it; the stars only under Still.
  const resting = () => slow || reducedMotion() || document.documentElement.dataset.motion === 'calm';

  function loop(time) {
    // Switched to Still: one last picture, then rest.
    if (reducedMotion()) { drawStars(time); drawDust(time); frame = 0; return; }
    frame = requestAnimationFrame(loop);
    const dt = Math.min(100, time - lastTick);
    lastTick = time;
    // Twinkling is slow enough for a few pictures a second, but while the page
    // scrolls or the stars are being pushed about, every frame, so they don't judder.
    // (none of it out in the universe, where there are no stars to see)
    if (night > 0.99) { if (busy) drawStars(time, dt); return; }
    if (busy || scrollY !== drawnScroll) drawStars(time, dt);
    else if (time - lastStars >= 1000 / STAR_FPS) drawStars(time, Math.min(100, time - lastStars));
    // The dust: a few pictures a second, none out in the universe where it can't be seen.
    if (!dust) return;
    const rushed = time < hurry && !slow;
    if (!rushed && time - lastDust < 1000 / DUST_FPS) return;
    if (!resting()) clock += Math.min(0.5, (time - lastDust) / 1000) * DRIFT;
    else if (!rushed && lastDust) return;
    drawDust(time);
  }

  function start() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastDust = 0;
    if (reducedMotion()) { drawStars(performance.now()); drawDust(performance.now()); return; }
    lastTick = performance.now();
    drawDust(lastTick);
    drawStars(lastTick);
    frame = requestAnimationFrame(loop);
  }

  measure();
  start();
  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { measure(); start(); }, 120);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else start();
  });
  onMotionChange(() => { if (!document.hidden) start(); });
  // Another sky was picked: its colours ease across, so follow them frame by frame, then settle.
  new MutationObserver(() => {
    hurry = performance.now() + DUR.scene + 200;
    if (reducedMotion()) setTimeout(() => drawDust(performance.now()), DUR.scene + 50);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-sky'] });
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    lean.tx = (e.clientX / width - 0.5) * 2;
    lean.ty = (e.clientY / height - 0.5) * 2;
    busy = true;
  }, { passive: true });

  instance = {
    el,
    // Where the void is right now ({ x, y, r } on screen), or null for none.
    setLens(fn) {
      lens = fn;
      busy = true;
      if (reducedMotion()) drawStars(performance.now());
    },
    // 0 by your galaxy, 1 out in the universe: the sky goes dark there, the
    // stars leave and the dust rests (the stylesheet fades all three by --night).
    setNight(v) {
      if (v === night) return;
      const back = night > 0.99 && v <= 0.99;
      night = v;
      el.style.setProperty('--night', v.toFixed(3));
      if (back) { lastDust = 0; busy = true; }
    },
    // Stars near (x, y) lean in, then drift back.
    pull(x, y, { strength = 1, radius = 360, duration = 1300 } = {}) {
      if (reducedMotion()) return;
      pulls.push({ x, y, strength, radius, duration, start: performance.now() });
      busy = true;
    },
  };
  return instance;
}
