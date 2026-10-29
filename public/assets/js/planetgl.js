// The painter for planets: one WebGL canvas, kept off the page, paints each
// planet in turn and the picture is copied onto that planet's own canvas.
// One canvas for all of them because browsers only allow a handful.
//
// Every world is drawn fresh each frame on a real sphere: its kind of ground
// (made from noise, so it never repeats), the files laid on it from a
// texture, clouds or storms on their own wind, then sunlight from the upper
// left. The turn is a smooth fraction, never a whole step, so it glides.

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform float uSize;
uniform float uTurn;
uniform float uTime;
uniform float uTilt;
uniform int uLook;
uniform vec3 uSeed;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform sampler2D uTex;
out vec4 outColor;

const float PI = 3.14159265;
const vec3 SUN = normalize(vec3(-0.55, 0.5, 0.68));

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s / 0.97;
}

float fbm3(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.07 + vec3(4.1, 2.3, 7.7); a *= 0.5; }
  return s / 0.875;
}

// Thin lines where noise crosses its middle: cracks, seams, crevasses.
float ridge(vec3 p) { return 1.0 - abs(noise(p) * 2.0 - 1.0); }

vec3 rotY(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

// Craters: the nearest of a scatter of points, and whether that one is a crater.
vec2 cells(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  float best = 8.0;
  float id = 0.0;
  for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++) {
    vec3 g = vec3(a, b, c);
    vec3 o = vec3(hash3(i + g), hash3(i + g + 19.1), hash3(i + g + 47.7));
    vec3 r = g + o - f;
    float d = dot(r, r);
    if (d < best) { best = d; id = hash3(i + g + 91.3); }
  }
  return vec2(sqrt(best), id);
}

float crater(vec3 p, float depth, inout float rim) {
  vec2 c = cells(p);
  if (c.y < 0.45) return 0.0;
  float k = c.x / (0.22 + 0.2 * c.y);
  rim += smoothstep(0.7, 0.95, k) * smoothstep(1.2, 0.95, k) * depth;
  return smoothstep(1.0, 0.55, k) * depth;
}

void main() {
  vec2 q = (gl_FragCoord.xy / uSize) * 2.0 - 1.0;
  float r = length(q);
  float alpha = 1.0 - smoothstep(1.0 - 3.0 / uSize, 1.0, r);
  if (alpha <= 0.0) { outColor = vec4(0.0); return; }
  vec3 v = vec3(q, sqrt(max(0.0, 1.0 - r * r)));

  // Its tilt, and a slight look down on its north pole.
  float tc = cos(uTilt);
  float ts = sin(uTilt);
  vec3 n = vec3(tc * v.x - ts * v.y, ts * v.x + tc * v.y, v.z);
  const float LEAN = 0.3;
  n = vec3(n.x, cos(LEAN) * n.y + sin(LEAN) * n.z, -sin(LEAN) * n.y + cos(LEAN) * n.z);

  float ang = uTurn * 2.0 * PI;
  vec3 p = rotY(n, -ang);
  vec3 sp = p + uSeed;
  float t = uTime;

  // The files on it, from the texture. Gradients are worked out by hand so
  // the wrap-around at the back doesn't leave a seam.
  vec2 uv = vec2(atan(n.x, n.z) / (2.0 * PI) + 0.5 - uTurn, 0.5 - asin(clamp(n.y, -1.0, 1.0)) / PI);
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  dx.x -= floor(dx.x + 0.5);
  dy.x -= floor(dy.x + 0.5);
  vec4 tile = textureGrad(uTex, uv, dx, dy);

  vec3 col = uC1;
  float spec = 0.0;
  float atmo = 0.6;
  vec3 atmoC = uC3;
  float cloud = 0.0;
  vec3 cloudC = vec3(0.95, 0.94, 0.91);
  vec3 glow = vec3(0.0);
  float hard = 0.0;
  float limb = 0.0;
  float frozen = 0.0;

  if (uLook == 0) {
    // ocean: deep water, a few islands, clouds on their own wind
    float h = fbm(sp * 2.1);
    float land = smoothstep(0.64, 0.67, h);
    col = mix(uC0, uC1, smoothstep(0.3, 0.64, h));
    col = mix(col, mix(uC2, uC2 * 0.8, smoothstep(0.62, 0.8, fbm3(sp * 7.0))), land);
    spec = 0.5 * (1.0 - land);
    vec3 cp = rotY(n, -ang * 1.3 - t * 0.01) + uSeed.zxy + vec3(0.0, 0.0, t * 0.015);
    cloud = smoothstep(0.56, 0.82, fbm(cp * vec3(2.6, 4.4, 2.6))) * 0.85;
    cloudC = uC3;
    atmoC = mix(uC1, vec3(0.72, 0.86, 1.0), 0.6);
  } else if (uLook == 1) {
    // terran: continents, ice caps, weather
    float h = fbm(sp * 1.7);
    float land = smoothstep(0.5, 0.53, h);
    vec3 sea = mix(uC0 * 0.75, uC0, smoothstep(0.2, 0.5, h));
    vec3 ground = mix(uC1, uC2, smoothstep(0.56, 0.78, h + (fbm3(sp * 6.0) - 0.5) * 0.25));
    col = mix(sea, ground, land);
    float cap = smoothstep(0.8, 0.86, abs(p.y) + (fbm3(sp * 4.0) - 0.5) * 0.14);
    col = mix(col, uC3, cap);
    spec = 0.35 * (1.0 - land) * (1.0 - cap);
    vec3 cp = rotY(n, -ang * 1.2 - t * 0.008) + uSeed.yzx + vec3(0.0, 0.0, t * 0.012);
    cloud = smoothstep(0.56, 0.8, fbm(cp * vec3(2.4, 4.0, 2.4))) * 0.9;
    atmoC = vec3(0.68, 0.82, 1.0);
  } else if (uLook == 2) {
    // gas giant: bands sliding past each other, one slow storm
    float shear = sin(p.y * 7.0 + uSeed.x) * 0.5 * sin(t * 0.02 + uSeed.y);
    vec3 gp = rotY(n, -ang - shear);
    float turb = fbm(vec3(gp.x * 2.0, gp.y * 9.0, gp.z * 2.0) + uSeed + vec3(0.0, 0.0, t * 0.008));
    float b = gp.y * 5.5 + turb * 1.3;
    col = mix(uC0, uC1, smoothstep(0.1, 0.9, 0.5 + 0.5 * sin(b * PI + uSeed.y)));
    col = mix(col, uC2, smoothstep(0.5, 1.0, 0.5 + 0.5 * sin(b * PI * 2.3 + 1.7)) * 0.6);
    vec3 sc = normalize(vec3(cos(uSeed.x), -0.32, sin(uSeed.x)));
    vec3 d = gp - sc;
    d.y *= 1.9;
    float sd = length(d) / 0.24;
    float eddy = 0.5 + 0.5 * sin(sd * 8.0 - t * 0.35 + turb * 3.0);
    col = mix(col, mix(uC3, uC2, eddy * 0.45), smoothstep(1.0, 0.5, sd));
    atmo = 0.35;
    atmoC = uC2;
    limb = 1.0;
  } else if (uLook == 3) {
    // lava: dark plates with seams that slowly breathe
    float h = fbm(sp * 2.4);
    col = mix(uC0, uC1, smoothstep(0.35, 0.7, h));
    col = mix(col, uC2, smoothstep(0.62, 0.8, fbm3(sp * 5.0)) * 0.45);
    float seam = smoothstep(0.86, 0.97, ridge(sp * 3.2 + fbm3(sp * 2.0) * 0.8))
      + smoothstep(0.9, 0.985, ridge(sp * 7.5)) * 0.45;
    float breathe = 0.6 + 0.4 * sin(t * 0.7 + h * 9.0);
    col = mix(col, uC3 * 0.5, seam * 0.5);
    glow = uC3 * seam * breathe * 0.8;
    atmo = 0.3;
    atmoC = uC3 * 0.8;
  } else if (uLook == 4) {
    // ice: pale sheets, blue crevasses, drifting frost
    float h = fbm(sp * 2.0);
    col = mix(uC1, uC2, smoothstep(0.35, 0.7, h));
    float cr = smoothstep(0.9, 0.985, ridge(sp * 4.0 + fbm3(sp * 3.0) * 0.6)) * 0.75
      + smoothstep(0.93, 0.99, ridge(sp * 9.0)) * 0.35;
    col = mix(col, uC0, cr);
    float fr = fbm3(rotY(n, -ang * 1.1 - t * 0.006) * 3.0 + uSeed.yzx);
    col = mix(col, uC3, smoothstep(0.5, 0.8, fr) * 0.35);
    spec = 0.25;
    frozen = 1.0;
  } else if (uLook == 5) {
    // desert: dunes and rock, a dust storm crossing
    float h = fbm(sp * 1.8);
    col = mix(uC1, uC2, smoothstep(0.35, 0.7, h));
    col = mix(col, uC0, smoothstep(0.6, 0.76, fbm3(sp * 3.5)) * 0.55);
    col *= 0.93 + 0.07 * sin(dot(sp, vec3(26.0, 8.0, 19.0)) + fbm3(sp * 4.0) * 7.0);
    float dust = fbm3(rotY(n, -ang * 1.08 - t * 0.01) * 2.5 + uSeed.zyx + vec3(0.0, t * 0.015, 0.0));
    col = mix(col, uC3, smoothstep(0.55, 0.85, dust) * 0.4);
    atmo = 0.8;
  } else if (uLook == 6) {
    // rock: an airless moon, cratered
    float h = fbm(sp * 3.0);
    col = mix(uC0, uC1, smoothstep(0.3, 0.7, h));
    col = mix(col, uC2, smoothstep(0.55, 0.8, fbm3(sp * 1.5)) * 0.5);
    float rim = 0.0;
    float bowl = crater(sp * 3.5, 1.0, rim) + crater(sp * 8.0 + 3.3, 0.6, rim);
    col *= 1.0 - bowl * 0.28;
    col += uC3 * rim * 0.16;
    atmo = 0.0;
    hard = 1.0;
  } else {
    // storm: violet clouds curling over each other, and now and then lightning
    vec3 cp = rotY(n, -ang * 1.15) + uSeed;
    vec3 w = vec3(fbm3(cp * 2.0 + vec3(0.0, 0.0, t * 0.02)), fbm3(cp * 2.0 + vec3(5.2, 1.3, t * 0.02)), fbm3(cp * 2.0 + vec3(1.7, 9.2, -t * 0.02)));
    float h = fbm(cp * 2.2 + w * 1.6);
    col = mix(uC0, uC1, smoothstep(0.32, 0.56, h));
    col = mix(col, uC2, smoothstep(0.6, 0.82, h) * 0.8);
    float slot = floor(t * 0.5);
    float ft = fract(t * 0.5);
    float on = step(0.72, hash3(vec3(slot, uSeed.x, 3.1)));
    vec3 at = normalize(vec3(0.15 + 0.5 * hash3(vec3(slot, 1.0, uSeed.y)), -0.1 - 0.5 * hash3(vec3(slot, 2.0, uSeed.z)), 0.7));
    float near = exp(-pow(distance(v, at) / 0.16, 2.0));
    float flick = exp(-ft * 10.0) + 0.5 * exp(-max(0.0, ft - 0.12) * 14.0) * step(0.12, ft);
    glow = uC3 * on * near * flick * (0.5 + h * 0.6);
    atmo = 0.5;
    atmoC = uC1;
  }

  // Files sit on top of the ground; clouds part round them so they stay readable.
  vec3 tileC = mix(tile.rgb, uC2 * tile.a, frozen * 0.22);
  col = col * (1.0 - tile.a) + tileC;
  cloud *= 1.0 - tile.a * 0.85;

  float ndl = dot(v, SUN);
  float day = hard > 0.5 ? smoothstep(-0.04, 0.28, ndl) : smoothstep(-0.22, 0.62, ndl);
  float light = mix(day, 0.32 + 0.68 * day, tile.a);
  vec3 c = col * (vec3(0.05, 0.06, 0.1) + vec3(1.02, 1.0, 0.96) * light);
  c = mix(c, cloudC * (0.06 + 0.98 * day), cloud * 0.9);
  c += vec3(1.0, 0.97, 0.9) * pow(max(dot(reflect(-SUN, v), vec3(0.0, 0.0, 1.0)), 0.0), 28.0) * spec * day * (1.0 - cloud);
  c *= mix(1.0, 0.72, limb * pow(1.0 - v.z, 1.5));
  c = mix(c, atmoC * (0.12 + 0.88 * day), pow(1.0 - v.z, 2.5) * atmo * 0.55);
  c += glow * (1.0 - 0.5 * day);
  outColor = vec4(c * alpha, alpha);
}`;

const UNIFORMS = ['uSize', 'uTurn', 'uTime', 'uTilt', 'uLook', 'uSeed', 'uC0', 'uC1', 'uC2', 'uC3', 'uTex'];
const MAX_TEXTURES = 24;

let state = null;

function build(gl) {
  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  // One triangle big enough to cover the square.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.activeTexture(gl.TEXTURE0);
  const loc = {};
  for (const name of UNIFORMS) loc[name] = gl.getUniformLocation(prog, name);
  gl.uniform1i(loc.uTex, 0);
  return loc;
}

function init() {
  if (state !== null) return state;
  state = false;
  // ?flat=1 shows the plain painter, to check the fallback.
  if (/[?&]flat=1/.test(location.search)) return state;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const gl = canvas.getContext('webgl2', {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power',
  });
  if (!gl) return state;
  try {
    const s = { gl, canvas, loc: build(gl), textures: new Map(), lost: false, clock: 0 };
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); s.lost = true; s.textures.clear(); });
    canvas.addEventListener('webglcontextrestored', () => {
      try { s.loc = build(gl); s.lost = false; } catch { /* stays lost: planets keep their last picture */ }
    });
    state = s;
  } catch (err) {
    console.warn('Planets: drawing them flat instead.', err);
  }
  return state;
}

export const canPaint = () => !!init();

function textureOf(s, source) {
  const { gl, textures } = s;
  let entry = textures.get(source);
  if (!entry) {
    if (textures.size >= MAX_TEXTURES) {
      let oldest = null;
      for (const [key, e] of textures) if (!oldest || e.used < oldest[1].used) oldest = [key, e];
      gl.deleteTexture(oldest[1].tex);
      textures.delete(oldest[0]);
    }
    entry = { tex: gl.createTexture(), version: -1, used: 0 };
    textures.set(source, entry);
  }
  gl.bindTexture(gl.TEXTURE_2D, entry.tex);
  if (entry.version !== source.version) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source.canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    entry.version = source.version;
  }
  entry.used = ++s.clock;
}

// Paints one planet onto `ctx` (its own 2D canvas, `size` pixels square).
// `world`: { source: { canvas, version }, look, tilt, turn, time, seed, colors: [[r,g,b] ×4] }
export function paint(ctx, size, world) {
  const s = init();
  if (!s || s.lost) return false;
  const { gl, canvas, loc } = s;
  if (canvas.width < size || canvas.height < size) {
    canvas.width = Math.max(canvas.width, size);
    canvas.height = Math.max(canvas.height, size);
  }
  textureOf(s, world.source);
  gl.viewport(0, 0, size, size);
  gl.uniform1f(loc.uSize, size);
  gl.uniform1f(loc.uTurn, world.turn);
  gl.uniform1f(loc.uTime, world.time);
  gl.uniform1f(loc.uTilt, world.tilt);
  gl.uniform1i(loc.uLook, world.look);
  gl.uniform3fv(loc.uSeed, world.seed);
  gl.uniform3fv(loc.uC0, world.colors[0]);
  gl.uniform3fv(loc.uC1, world.colors[1]);
  gl.uniform3fv(loc.uC2, world.colors[2]);
  gl.uniform3fv(loc.uC3, world.colors[3]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(canvas, 0, canvas.height - size, size, size, 0, 0, size, size);
  return true;
}

// A planet's texture won't be needed again.
export function forget(source) {
  const s = init();
  const entry = s && s.textures.get(source);
  if (!entry) return;
  s.gl.deleteTexture(entry.tex);
  s.textures.delete(source);
}
