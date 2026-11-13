// The painter for planets: one WebGL canvas, kept off the page, paints each
// planet in turn and the picture is copied onto that planet's own canvas.
// One canvas for all of them because browsers only allow a handful.
//
// Planets due in the same frame are painted side by side on it, then all
// copied out together: copying out costs about the same however much is on
// it, so one copy-out a frame instead of one a planet.
//
// Every world is drawn fresh each frame on a real sphere: its kind of ground
// (made from noise, so it never repeats), the files laid on it from a
// texture, its own weather and effects, how used it is (weather on a busy
// world, dust on a forgotten one), then one sun from the upper left and the
// air round its edge. The turn is a smooth fraction, never a whole step, so
// it glides. The kinds are looks 0 to 11 (planets.js LOOKS), the moons 12 to
// 21; DESIGN.md "Planets" says how each is made and how to add one.

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform float uSize;
uniform vec2 uOrigin;
uniform float uTurn;
uniform float uTime;
uniform float uTilt;
uniform float uLean;
uniform int uLook;
uniform vec3 uSeed;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform sampler2D uTex;
uniform float uUse;    // 0 forgotten, 0.5 calm, 1 busy
uniform float uClear;  // 0 to 1 while dust lifts off
uniform float uRings;  // 1 when it has rings
uniform float uLock;   // 1 when it is locked
out vec4 outColor;

const float PI = 3.14159265;
const vec3 SUN = normalize(vec3(-0.55, 0.5, 0.68));
// The ball fills 1/AIR of its square; the rest is room for the air round its edge (planets.js sizes the canvas to match).
const float FILE_GLOW = 0.34;  // how brightly files stay lit on the night side

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

vec3 rotX(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

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

// A spiral of cloud round an eye: 'q' a point on the ball, 'eye' where the storm sits.
// Returns how much cloud (0 to 1); the eye itself is clear.
float vortex(vec3 q, vec3 eye, float size, float arms, float turn) {
  float d = distance(q, eye) / size;
  if (d > 1.0) return 0.0;
  vec3 e1 = normalize(cross(eye, vec3(0.0, 1.0, 0.0)));
  vec3 e2 = cross(eye, e1);
  float a = atan(dot(q, e2), dot(q, e1));
  float s = sin(a * arms + log(d + 0.03) * 5.5 - turn);
  float body = smoothstep(1.0, 0.25, d) * smoothstep(-0.35, 0.75, s + (1.0 - d) * 0.9);
  return body * smoothstep(0.05, 0.13, d) * (0.65 + 0.5 * fbm3(q * 7.0 + turn * 0.05));
}

void main() {
  vec2 q = ((gl_FragCoord.xy - uOrigin) / uSize) * 2.0 - 1.0;
  // Phobos and Hyperion are lumps, not balls: their outline dents a little.
  if (uLook == 18 || uLook == 19) {
    float la = atan(q.y, q.x);
    q *= 1.05 + 0.05 * sin(2.0 * la + uSeed.x) * cos(3.0 * la + uSeed.y);
  }
  // The ball is drawn a little inside its square, so there is room for air round its edge.
  q *= 1.12;
  float r = length(q);
  if (r > 1.118) { outColor = vec4(0.0); return; }
  float alpha = 1.0 - smoothstep(1.0 - 3.4 / uSize, 1.0, r);
  if (r > 0.999) q *= 0.999 / r;
  float rq = min(r, 0.999);
  vec3 v = vec3(q, sqrt(max(0.0, 1.0 - rq * rq)));

  // Its tilt, and a slight look down on its north pole.
  float tc = cos(uTilt);
  float ts = sin(uTilt);
  vec3 n = vec3(tc * v.x - ts * v.y, ts * v.x + tc * v.y, v.z);
  n = vec3(n.x, cos(uLean) * n.y + sin(uLean) * n.z, -sin(uLean) * n.y + cos(uLean) * n.z);
  // The sun as the world's own axes see it (for a ring's shadow).
  vec3 sunA = vec3(tc * SUN.x - ts * SUN.y, ts * SUN.x + tc * SUN.y, SUN.z);
  sunA = vec3(sunA.x, cos(uLean) * sunA.y + sin(uLean) * sunA.z, -sin(uLean) * sunA.y + cos(uLean) * sunA.z);
  // Hyperion tumbles: its axis wanders instead of holding still.
  if (uLook == 19) n = rotX(n, 0.55 * sin(uTime * 0.11 + uSeed.x) + 0.3 * sin(uTime * 0.047 + uSeed.z));

  float ang = uTurn * 2.0 * PI;
  vec3 p = rotY(n, -ang);
  vec3 sp = p + uSeed;
  float t = uTime;
  float ndl = dot(v, SUN);
  // How used it is: 0 forgotten, 0.5 calm, 1 busy.
  float calm = min(uUse * 2.0, 1.0);
  float busy = clamp(uUse * 2.0 - 1.0, 0.0, 1.0);

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
  vec3 glow = vec3(0.0);       // light of its own, by day and night
  vec3 nightGlow = vec3(0.0);  // light of its own that only shows in the dark
  float hard = 0.0;
  float limb = 0.0;
  float frozen = 0.0;

  if (uLook == 0) {
    // OCEAN: deep water, a few islands in pale shallows; trade-wind cloud and one cyclone that turns
    float h = fbm(sp * 2.1);
    float land = smoothstep(0.66, 0.69, h);
    float shelf = smoothstep(0.57, 0.66, h) * (1.0 - land);
    col = mix(uC0, uC1, smoothstep(0.25, 0.62, h));
    col = mix(col, mix(uC1, vec3(0.5, 0.92, 0.86), 0.5), shelf * 0.75);
    col = mix(col, mix(uC2, uC2 * 0.72, smoothstep(0.6, 0.8, fbm3(sp * 7.0))), land);
    spec = 0.65 * (1.0 - land);
    vec3 cp = rotY(n, -ang * 1.25 - t * 0.012) + uSeed.zxy * 0.0;
    vec3 eye = normalize(vec3(sin(uSeed.x), 0.38, cos(uSeed.x)));
    float streaks = smoothstep(0.58, 0.84, fbm((cp + uSeed.zxy) * vec3(2.4, 5.0, 2.4) + vec3(0.0, 0.0, t * 0.012))) * 0.8;
    cloud = max(streaks * (1.0 - smoothstep(0.75, 0.3, distance(cp, eye))), vortex(cp, eye, 0.62, 2.0, t * 0.22));
    cloudC = uC3;
    atmoC = mix(uC1, vec3(0.72, 0.86, 1.0), 0.6);
  } else if (uLook == 1) {
    // GREEN: continents of forest and plain, mountains with snow, ice caps; weather, and an aurora round the pole
    float h = fbm(sp * 1.7);
    float land = smoothstep(0.5, 0.53, h);
    vec3 sea = mix(uC0 * 0.72, uC0, smoothstep(0.2, 0.5, h));
    float dry = fbm3(sp * 3.0 + 7.0);
    vec3 ground = mix(uC1 * 0.72, uC1, smoothstep(0.3, 0.6, dry));
    ground = mix(ground, uC2, smoothstep(0.58, 0.8, h + (dry - 0.5) * 0.3));
    float peak = smoothstep(0.7, 0.78, h + (fbm3(sp * 9.0) - 0.5) * 0.12);
    ground = mix(ground, uC2 * 0.7, smoothstep(0.62, 0.7, h) * 0.5);
    ground = mix(ground, uC3, peak * 0.85);
    col = mix(sea, ground, land);
    float cap = smoothstep(0.8, 0.86, abs(p.y) + (fbm3(sp * 4.0) - 0.5) * 0.14);
    col = mix(col, uC3, cap);
    spec = 0.4 * (1.0 - land) * (1.0 - cap);
    vec3 cp = rotY(n, -ang * 1.2 - t * 0.008) + uSeed.yzx + vec3(0.0, 0.0, t * 0.012);
    cloud = smoothstep(0.56, 0.8, fbm(cp * vec3(2.2, 4.4, 2.2))) * 0.9;
    atmoC = vec3(0.68, 0.82, 1.0);
    float lon = atan(n.x, n.z);
    float curtain = exp(-pow((n.y - 0.83 - 0.025 * sin(lon * 5.0 + t * 0.6)) / 0.035, 2.0));
    curtain *= 0.45 + 0.55 * sin(lon * 16.0 + t * 1.3 + fbm3(n * 6.0) * 5.0);
    nightGlow = vec3(0.25, 1.0, 0.62) * max(curtain, 0.0) * (0.55 + 0.6 * busy);
    glow = nightGlow * 0.22;
  } else if (uLook == 2) {
    // GAS GIANT: bands sliding past each other, curls where they rub, a great storm and a string of white ovals
    float shear = sin(p.y * 7.0 + uSeed.x) * 0.5 * sin(t * 0.02 + uSeed.y);
    vec3 gp = rotY(n, -ang - shear);
    float turb = fbm(vec3(gp.x * 2.0, gp.y * 9.0, gp.z * 2.0) + uSeed + vec3(0.0, 0.0, t * 0.008));
    float b = gp.y * 5.5 + turb * 1.3;
    float band = 0.5 + 0.5 * sin(b * PI + uSeed.y);
    col = mix(uC0, uC1, smoothstep(0.1, 0.9, band));
    col = mix(col, uC2, smoothstep(0.5, 1.0, 0.5 + 0.5 * sin(b * PI * 2.3 + 1.7)) * 0.6);
    float rub = smoothstep(0.35, 0.5, band) * smoothstep(0.65, 0.5, band);
    col = mix(col, uC2 * 1.05, rub * smoothstep(0.5, 0.8, fbm3(vec3(gp.x * 7.0, gp.y * 16.0, gp.z * 7.0) + uSeed + t * 0.01)) * 0.5);
    vec3 sc = normalize(vec3(cos(uSeed.x), -0.32, sin(uSeed.x)));
    vec3 d = gp - sc;
    d.y *= 1.9;
    float sd = length(d) / 0.24;
    float eddy = 0.5 + 0.5 * sin(sd * 8.0 - t * 0.35 + turb * 3.0);
    col = mix(col, mix(uC3, uC2, eddy * 0.45), smoothstep(1.0, 0.5, sd));
    float glon = atan(gp.x, gp.z) * 2.5 + t * 0.02;
    float oi = floor(glon);
    float osz = 0.16 + 0.2 * hash3(vec3(oi, uSeed.x, 7.0));
    vec2 ov = vec2(fract(glon) - 0.3 - 0.4 * hash3(vec3(oi, 3.0, uSeed.y)), (gp.y - 0.36) * 4.5);
    col = mix(col, vec3(0.97, 0.95, 0.9), smoothstep(osz, osz * 0.55, length(ov)) * step(0.3, hash3(vec3(oi, 9.0, uSeed.z))) * 0.85);
    atmo = 0.35;
    atmoC = uC2;
    limb = 1.0;
  } else if (uLook == 3) {
    // PALE GIANT: a calm giant with soft bands and a six-sided storm on its pole
    vec3 gp = rotY(n, -ang * 0.9);
    float b = n.y * 8.0 + (fbm3(vec3(gp.x * 1.6, gp.y * 7.0, gp.z * 1.6) + uSeed + vec3(t * 0.006, 0.0, 0.0)) - 0.5) * 0.9;
    col = mix(uC0, uC1, 0.5 + 0.5 * sin(b * PI * 0.5));
    col = mix(col, uC2, smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(b * PI * 1.3 + 0.8)) * 0.45);
    float pr = acos(clamp(n.y, -1.0, 1.0));
    float pa = atan(gp.z, gp.x) + t * 0.01;
    float hex = pr * cos(mod(pa, PI / 3.0) - PI / 6.0);
    col = mix(col, uC3, smoothstep(0.36, 0.33, hex) * 0.55);
    col *= 1.0 - 0.35 * smoothstep(0.02, 0.0, abs(hex - 0.36));
    atmo = 0.45;
    atmoC = uC2;
    limb = 1.0;
  } else if (uLook == 4) {
    // LAVA: dark plates, seams that breathe, a molten sea, and vents that flare; smoke drifts off it
    float h = fbm(sp * 2.4);
    col = mix(uC0, uC1, smoothstep(0.35, 0.7, h));
    col = mix(col, uC2, smoothstep(0.62, 0.8, fbm3(sp * 5.0)) * 0.45);
    float seam = smoothstep(0.86, 0.97, ridge(sp * 3.2 + fbm3(sp * 2.0) * 0.8))
      + smoothstep(0.9, 0.985, ridge(sp * 7.5)) * 0.45;
    float sea = smoothstep(0.36, 0.3, h);
    float crust = smoothstep(0.45, 0.7, fbm3(sp * 9.0 + vec3(0.0, t * 0.01, 0.0)));
    float breathe = 0.6 + 0.4 * sin(t * 0.7 + h * 9.0);
    col = mix(col, uC3 * 0.5, seam * 0.5);
    col = mix(col, mix(uC3, uC0, crust * 0.8), sea);
    vec2 vent = cells(sp * 4.0);
    float flare = pow(max(0.0, sin(t * 0.8 + vent.y * 40.0)), 8.0) * step(0.55, vent.y) * smoothstep(0.26, 0.0, vent.x);
    glow = uC3 * (seam * breathe * 0.8 + sea * (1.0 - crust * 0.8) * 0.7) + vec3(1.0, 0.8, 0.45) * flare * (0.5 + busy);
    vec3 cp = rotY(n, -ang * 1.1 - t * 0.01) + uSeed.zxy;
    cloud = smoothstep(0.62, 0.86, fbm(cp * vec3(2.0, 3.6, 2.0))) * 0.55;
    cloudC = vec3(0.2, 0.17, 0.16);
    atmo = 0.35;
    atmoC = uC3 * 0.8;
  } else if (uLook == 5) {
    // ICE: pale sheets, blue crevasses that hold a little light at night, a blizzard blowing, and glints off the snow
    float h = fbm(sp * 2.0);
    col = mix(uC1, uC2, smoothstep(0.35, 0.7, h));
    float cr = smoothstep(0.9, 0.985, ridge(sp * 4.0 + fbm3(sp * 3.0) * 0.6)) * 0.75
      + smoothstep(0.93, 0.99, ridge(sp * 9.0)) * 0.35;
    col = mix(col, uC0, cr);
    vec3 bp = rotY(n, -ang * 1.3 - t * 0.03) + uSeed.yzx;
    float blow = smoothstep(0.5, 0.8, fbm(bp * vec3(1.6, 7.0, 1.6)));
    cloud = blow * 0.6;
    cloudC = uC3;
    float glint = step(0.988, hash3(floor(sp * 40.0) + floor(t * 1.5))) * (0.4 + busy);
    glow = vec3(0.9, 0.97, 1.0) * glint * smoothstep(0.0, 0.3, ndl);
    nightGlow = uC0 * 1.4 * cr * 0.5;
    spec = 0.3;
    frozen = 1.0;
    atmoC = vec3(0.8, 0.92, 1.0);
  } else if (uLook == 6) {
    // DESERT: rust plains and ochre dune seas, dark old lava, one long canyon, small pale caps; a dust storm crossing
    float h = fbm(sp * 1.9);
    col = mix(uC1, uC2, smoothstep(0.3, 0.7, h));
    float dark = smoothstep(0.55, 0.72, fbm3(sp * 1.3 + 5.0));
    col = mix(col, uC0, dark * 0.62);
    float dune = sin(dot(sp, vec3(58.0, 14.0, 37.0)) + fbm3(sp * 3.0) * 11.0);
    col *= 1.0 - 0.06 * smoothstep(0.2, 0.9, dune) * (1.0 - dark) * smoothstep(0.45, 0.7, h);
    float canyon = smoothstep(0.955, 0.995, ridge(vec3(sp.x * 1.1, sp.y * 4.5, sp.z * 1.1) + 3.0)) * smoothstep(0.5, 0.15, abs(p.y));
    col = mix(col, uC0 * 0.55, canyon * 0.85);
    float cap = smoothstep(0.93, 0.97, abs(p.y) + (fbm3(sp * 5.0) - 0.5) * 0.06);
    col = mix(col, vec3(0.96, 0.93, 0.9), cap);
    vec3 dp = rotY(n, -ang * 1.1 - t * 0.02) + uSeed.zyx;
    cloud = smoothstep(0.52, 0.8, fbm(dp * vec3(1.5, 2.8, 1.5))) * 0.8;
    cloudC = mix(uC2, vec3(0.97, 0.84, 0.64), 0.55);
    atmo = 0.75;
    atmoC = mix(uC2, vec3(1.0, 0.74, 0.5), 0.5);
  } else if (uLook == 7) {
    // STORM: cloud curling over cloud, two great hurricanes with clear eyes, and lightning under the cloud
    vec3 cp = rotY(n, -ang * 1.15) + uSeed;
    vec3 w = vec3(fbm3(cp * 2.0 + vec3(0.0, 0.0, t * 0.02)), fbm3(cp * 2.0 + vec3(5.2, 1.3, t * 0.02)), fbm3(cp * 2.0 + vec3(1.7, 9.2, -t * 0.02)));
    float h = fbm(cp * 2.2 + w * 1.6);
    col = mix(uC0, uC1, smoothstep(0.28, 0.5, h));
    col = mix(col, uC2, smoothstep(0.5, 0.74, h) * 0.9);
    col = mix(col, uC3, smoothstep(0.72, 0.9, h) * 0.5);
    vec3 hq = rotY(n, -ang * 1.15 - t * 0.006);
    float spin = t * 0.3;
    float storms = max(vortex(hq, normalize(vec3(sin(uSeed.y), 0.3, cos(uSeed.y))), 0.85, 2.0, spin),
                       vortex(hq, normalize(vec3(sin(uSeed.y + 2.4), -0.38, cos(uSeed.y + 2.4))), 0.62, 3.0, -spin * 1.3));
    col = mix(col, uC3, storms * 0.85);
    float slot = floor(t * (0.5 + 0.8 * busy));
    float ft = fract(t * (0.5 + 0.8 * busy));
    float on = step(0.66 - 0.3 * busy, hash3(vec3(slot, uSeed.x, 3.1)));
    vec3 at = normalize(vec3(0.15 + 0.5 * hash3(vec3(slot, 1.0, uSeed.y)) - 0.3, -0.1 - 0.5 * hash3(vec3(slot, 2.0, uSeed.z)) + 0.3, 0.7));
    float nearby = exp(-pow(distance(v, at) / 0.2, 2.0));
    float flick = exp(-ft * 10.0) + 0.5 * exp(-max(0.0, ft - 0.12) * 14.0) * step(0.12, ft);
    glow = uC3 * on * nearby * flick * (0.5 + h * 0.7);
    atmo = 0.55;
    atmoC = uC1;
  } else if (uLook == 8) {
    // LAGOON: warm shallows, atolls of sand round pale pools, reefs; light dancing on the water and small clouds
    float h = fbm(sp * 2.6);
    col = mix(uC0, uC1, smoothstep(0.25, 0.6, h));
    vec2 c = cells(sp * 3.1);
    float rim = 0.2 + 0.12 * c.y;
    float isle = step(0.52, c.y);
    float pool = smoothstep(rim, rim * 0.5, c.x) * isle;
    float sand = smoothstep(0.05, 0.0, abs(c.x - rim)) * isle;
    col = mix(col, mix(uC1, vec3(0.74, 1.0, 0.95), 0.6), pool * 0.75);
    col = mix(col, uC3, smoothstep(0.1, 0.0, abs(c.x - rim * 1.35)) * isle * 0.5);
    col = mix(col, uC2, sand);
    float dance = smoothstep(0.86, 0.98, ridge(sp * 13.0 + vec3(0.0, t * 0.05, t * 0.03)));
    col += vec3(0.5, 0.75, 0.7) * dance * 0.14 * (1.0 - sand);
    spec = 0.75 * (1.0 - sand);
    vec3 cp = rotY(n, -ang * 1.3 - t * 0.015) + uSeed.zxy;
    vec2 puff = cells(cp * 8.0);
    cloud = smoothstep(0.34, 0.14, puff.x) * step(0.6, puff.y) * 0.85;
    atmoC = vec3(0.62, 0.95, 1.0);
  } else if (uLook == 9) {
    // BLOOM: dark seas and continents of strange growth, veined; at night its veins and shores glow, in slow waves
    float h = fbm(sp * 1.8);
    float land = smoothstep(0.48, 0.52, h);
    vec3 sea = mix(uC0 * 0.7, uC0, smoothstep(0.2, 0.5, h));
    float veins = smoothstep(0.8, 0.97, ridge(sp * 5.0 + fbm3(sp * 2.0) * 1.2));
    vec3 growth = mix(uC1, uC2, smoothstep(0.5, 0.8, h + (fbm3(sp * 6.0) - 0.5) * 0.3));
    growth = mix(growth, uC3, veins * 0.6);
    col = mix(sea, growth, land);
    spec = 0.3 * (1.0 - land);
    vec3 cp = rotY(n, -ang * 1.2 - t * 0.008) + uSeed.yzx;
    cloud = smoothstep(0.6, 0.86, fbm(cp * vec3(2.4, 3.6, 2.4))) * 0.55;
    cloudC = mix(vec3(1.0), uC3, 0.35);
    float shore = smoothstep(0.045, 0.0, abs(h - 0.5));
    float wave = 0.5 + 0.5 * sin(t * 0.5 + h * 14.0 + sp.x * 3.0);
    nightGlow = (uC3 * veins * land * 1.1 + vec3(0.3, 1.0, 0.9) * shore * 0.9) * (0.35 + 0.65 * wave) * (0.7 + 0.6 * busy);
    atmoC = mix(uC2, vec3(1.0, 0.7, 0.95), 0.5);
  } else if (uLook == 10) {
    // HAZE: no ground to see, only thick cloud racing round in a great sideways V, under deep glowing air
    vec3 hp = rotY(n, -ang * 0.5 - t * 0.035);
    float lon = atan(hp.x, hp.z);
    float chev = lon * 2.0 + abs(n.y) * 4.2;
    float bands = fbm(vec3(cos(chev), n.y * 4.5, sin(chev)) * 1.5 + fbm3(hp * 2.0 + uSeed) * 0.9 + uSeed);
    col = mix(uC0, uC1, smoothstep(0.3, 0.66, bands));
    col = mix(col, uC2, smoothstep(0.6, 0.86, bands) * 0.75);
    col *= 1.0 - 0.28 * smoothstep(0.62, 0.92, abs(n.y));
    atmo = 1.5;
    atmoC = uC3;
    limb = 1.0;
  } else if (uLook == 11) {
    // PEARL: a milky world of slow veils, with the colours of oil on water sliding over it as it turns
    vec3 pp = rotY(n, -ang * 0.8) + uSeed;
    float h = fbm(pp * 1.6 + vec3(0.0, 0.0, t * 0.01));
    float veil = fbm3(pp * vec3(1.5, 4.5, 1.5) + h * 1.5);
    col = mix(uC0, uC1, smoothstep(0.25, 0.75, veil));
    col = mix(col, uC2, smoothstep(0.55, 0.9, h) * 0.5);
    float film = ndl * 1.1 + v.z * 1.5 + veil * 0.9 + t * 0.02;
    vec3 opal = 0.5 + 0.5 * cos(6.2832 * (film + vec3(0.0, 0.33, 0.67)));
    col = mix(col, col * (0.74 + 0.5 * opal), 0.3 * (0.5 + 0.5 * calm)) * 0.9;
    spec = 0.25;
    atmo = 0.9;
    atmoC = uC3;
  } else if (uLook == 12) {
    // Luna: grey highlands, dark seas, craters; it always shows the same face
    float h = fbm(sp * 2.2);
    col = mix(uC1, uC2, smoothstep(0.3, 0.72, h));
    col = mix(col, uC0, smoothstep(0.5, 0.6, fbm3(sp * 1.3 + 2.0)) * 0.8);
    float rim = 0.0;
    float bowl = crater(sp * 4.0, 1.0, rim) + crater(sp * 9.0 + 3.3, 0.5, rim);
    col *= 1.0 - bowl * 0.22;
    col += uC3 * rim * 0.18;
    atmo = 0.0;
    hard = 1.0;
  } else if (uLook == 13) {
    // Io: sulphur yellows and oranges, black calderas, hot spots that glow now and then
    float h = fbm(sp * 2.6);
    col = mix(uC1, uC2, smoothstep(0.35, 0.72, h));
    col = mix(col, uC3, smoothstep(0.62, 0.8, fbm3(sp * 4.0 + 1.0)) * 0.6);
    vec2 c = cells(sp * 5.0);
    float pit = smoothstep(0.24, 0.12, c.x) * step(0.62, c.y);
    col = mix(col, uC0, pit * 0.85);
    float pulse = 0.5 + 0.5 * sin(t * 0.6 + c.y * 40.0);
    glow = vec3(1.0, 0.42, 0.1) * smoothstep(0.14, 0.04, c.x) * step(0.62, c.y) * pulse * pulse * 0.7;
    atmo = 0.0;
    hard = 1.0;
  } else if (uLook == 14) {
    // Europa: cream ice crossed by rust-red cracks; a soft glint drifts over
    float h = fbm(sp * 2.0);
    col = mix(uC1, uC2, smoothstep(0.3, 0.7, h));
    float lines = smoothstep(0.93, 0.99, ridge(sp * 3.0 + fbm3(sp * 2.0) * 0.5))
      + smoothstep(0.95, 0.995, ridge(sp * 6.5 + 1.3)) * 0.7;
    col = mix(col, uC0, clamp(lines, 0.0, 1.0) * 0.75);
    col = mix(col, uC0 * 1.2, smoothstep(0.62, 0.8, fbm3(sp * 3.0 + 4.0)) * 0.25);
    spec = 0.3 + 0.25 * sin(t * 0.25 + h * 6.0);
    atmo = 0.0;
    hard = 1.0;
  } else if (uLook == 15) {
    // Titan: thick orange haze, no ground; bands drift; a blue rim of haze
    vec3 hp = rotY(n, -ang * 0.6) + uSeed;
    float b = n.y * 3.2 + (fbm3(vec3(hp.x * 1.5, hp.y * 5.0, hp.z * 1.5) + vec3(t * 0.006, 0.0, 0.0)) - 0.5) * 0.9;
    col = mix(uC0, uC1, 0.5 + 0.5 * sin(b * PI * 0.6));
    col = mix(col, uC2, smoothstep(0.55, 0.85, n.y) * 0.5);
    atmo = 1.4;
    atmoC = uC3;
    limb = 1.0;
  } else if (uLook == 16) {
    // Enceladus: the brightest ice; blue "tiger stripes" at its south pole
    float h = fbm(sp * 2.4);
    col = mix(uC1, uC2, smoothstep(0.3, 0.7, h));
    float south = smoothstep(-0.5, -0.82, p.y);
    float stripes = smoothstep(0.9, 0.985, ridge(vec3(p.x * 7.0, p.y * 1.5, p.z * 7.0) + uSeed));
    col = mix(col, uC0, stripes * south * 0.8);
    float rim = 0.0;
    col *= 1.0 - crater(sp * 6.0, 0.5, rim) * 0.12 * (1.0 - south);
    spec = 0.45;
    atmo = 0.25;
    atmoC = uC3;
  } else if (uLook == 17) {
    // Triton: pinkish "cantaloupe" ice, a bright southern cap with dark streaks
    vec2 c = cells(sp * 6.0);
    col = mix(uC1, uC2, smoothstep(0.15, 0.55, c.x) * 0.55 + (fbm3(sp * 3.0) - 0.5) * 0.4);
    float cap = smoothstep(-0.05, -0.35, p.y + (fbm3(sp * 2.0) - 0.5) * 0.3);
    col = mix(col, uC3, cap * 0.8);
    float streak = smoothstep(0.7, 0.9, noise(vec3(p.x * 16.0, p.y * 2.5, p.z * 16.0) + uSeed));
    col = mix(col, uC0, streak * cap * 0.55);
    atmo = 0.2;
    atmoC = vec3(0.7, 0.82, 1.0);
  } else if (uLook == 18) {
    // Phobos: a dark lump with one huge crater and long grooves
    float h = fbm(sp * 2.8);
    col = mix(uC0, uC1, smoothstep(0.3, 0.75, h));
    float d = distance(p, normalize(vec3(0.75, 0.15, 0.6))) / 0.5;
    col *= 1.0 - smoothstep(1.0, 0.55, d) * 0.3;
    col += uC2 * smoothstep(0.8, 1.0, d) * smoothstep(1.25, 1.0, d) * 0.25;
    col *= 1.0 - smoothstep(0.93, 0.99, ridge(vec3(p.x * 10.0, p.y * 2.0, p.z * 10.0) + uSeed)) * 0.22;
    float rim = 0.0;
    col *= 1.0 - crater(sp * 7.0, 0.6, rim) * 0.2;
    col += uC2 * rim * 0.1;
    atmo = 0.0;
    hard = 1.0;
  } else if (uLook == 19) {
    // Hyperion: a sponge, deep dark pits with bright rims
    vec2 c = cells(sp * 7.0);
    col = mix(uC1, uC2, smoothstep(0.3, 0.7, fbm3(sp * 2.0)));
    col = mix(col, uC0, smoothstep(0.42, 0.12, c.x) * 0.85);
    col += uC3 * smoothstep(0.38, 0.48, c.x) * smoothstep(0.58, 0.48, c.x) * 0.25;
    atmo = 0.0;
    hard = 1.0;
  } else if (uLook == 20) {
    // Iapetus: one side coal-black, the other bright, a ridge round its middle
    float dark = smoothstep(-0.12, 0.12, p.z + (fbm3(sp * 3.0) - 0.5) * 0.5);
    col = mix(mix(uC2, uC3, smoothstep(0.4, 0.7, fbm(sp * 2.5))), uC0, dark);
    col = mix(col, uC1, exp(-pow(p.y / 0.045, 2.0)) * 0.55);
    float rim = 0.0;
    col *= 1.0 - crater(sp * 5.0, 0.6, rim) * 0.18;
    atmo = 0.0;
    hard = 1.0;
  } else if (uLook == 21) {
    // Callisto: old dark ground peppered with bright little craters
    col = mix(uC0, uC1, smoothstep(0.3, 0.7, fbm(sp * 2.4)));
    vec2 c = cells(sp * 11.0);
    col = mix(col, uC3, smoothstep(0.17, 0.05, c.x) * step(0.55, c.y) * 0.9);
    float ring = abs(distance(p, normalize(vec3(-0.4, 0.3, 0.85))) - 0.3);
    col = mix(col, uC2, smoothstep(0.04, 0.0, ring) * 0.35);
    atmo = 0.0;
    hard = 1.0;
  }

  // ---- how much it is used: a busy world has weather and light, a forgotten one gathers dust.
  // uClear (0 to 1) is the moment of coming back: the dust lifts off in patches on a wind, not all at once.
  float dustAmt = clamp(1.0 - uUse * 2.6, 0.0, 1.0);
  vec3 wp = rotY(n, -ang * 1.4 - uClear * 2.2) + uSeed.zxy;
  float patchy = fbm(wp * vec3(1.6, 3.4, 1.6));
  float held = uClear <= 0.0 ? 1.0 : smoothstep(uClear * 1.25 - 0.3, uClear * 1.25, patchy);
  float dusty = dustAmt * held;
  float gust = dustAmt * (1.0 - held) * smoothstep(1.0, 0.5, uClear) * smoothstep(0.35, 0.75, fbm3(wp * vec3(2.0, 9.0, 2.0)));
  cloud = clamp(cloud * mix(0.35, 1.0, calm) * (1.0 + 0.45 * busy), 0.0, 1.0) * (1.0 - dusty);
  glow *= mix(0.12, 1.0, calm) * (1.0 + 0.9 * busy) * (1.0 - 0.8 * dusty);
  nightGlow *= mix(0.1, 1.0, calm) * (1.0 - dusty);
  spec *= 1.0 - dusty;
  float grey = dot(col, vec3(0.3, 0.59, 0.11));
  vec3 dustC = mix(vec3(0.6, 0.55, 0.5), vec3(grey), 0.4) * (0.75 + 0.5 * grey);
  float coat = dusty * (0.5 + 0.38 * smoothstep(0.3, 0.72, fbm3(sp * 3.2 + 11.0)));
  col = mix(col, dustC, coat);

  // A locked world is clouded over: nothing of it shows but its kind's colours through the gaps.
  if (uLock > 0.5) {
    cloud = max(cloud, 0.5 + 0.45 * smoothstep(0.3, 0.7, fbm(rotY(n, -ang * 1.2) * vec3(2.0, 3.2, 2.0) + uSeed.yzx + vec3(0.0, t * 0.01, 0.0))));
    cloudC = mix(cloudC, vec3(0.8, 0.82, 0.87), 0.6);
  }

  // ---- the files: on top of the ground; weather parts round them, dust settles on them too
  float fa = tile.a;
  vec3 fileC = mix(tile.rgb, uC2 * fa, frozen * 0.12) * 0.9;
  fileC = mix(fileC, dustC * fa, coat * 0.72);
  col = col * (1.0 - fa) + fileC;
  cloud *= 1.0 - fa;
  // A planet with rings (ten files or more, of any kind) carries their shadow: where the rings stand
  // between a spot and the sun.
  if (uRings > 0.5) {
    float sy = -n.y / (abs(sunA.y) < 0.02 ? 0.02 : sunA.y);
    float rh = length((n + sunA * sy).xz);
    col *= 1.0 - 0.45 * step(0.0, sy) * smoothstep(1.3, 1.38, rh) * smoothstep(1.92, 1.84, rh) * (0.55 + 0.45 * step(0.05, abs(rh - 1.63)));
  }
  // dust in the air as it blows away
  cloud = max(cloud, gust * 0.8);
  cloudC = mix(cloudC, dustC * 1.25, clamp(gust * 2.0, 0.0, 1.0));

  // ---- light: one sun from the upper left, a crisp edge to the day, and air that catches it
  float day = hard > 0.5 ? smoothstep(-0.03, 0.2, ndl) : smoothstep(-0.16, 0.44, ndl);
  float air = atmo * (1.0 - 0.65 * dusty);
  vec3 c = col * (vec3(0.045, 0.055, 0.1) + vec3(1.1, 1.06, 1.0) * day);
  c += col * vec3(1.0, 0.45, 0.2) * exp(-pow((ndl - 0.03) / 0.13, 2.0)) * 0.24 * min(air, 1.0) * (1.0 - hard);
  c += nightGlow * (1.0 - day) * (1.0 - cloud * 0.7);
  c = mix(c, cloudC * (0.05 + 1.0 * day), cloud * 0.92);
  c += vec3(1.0, 0.97, 0.9) * pow(max(dot(reflect(-SUN, v), vec3(0.0, 0.0, 1.0)), 0.0), 36.0) * spec * day * (1.0 - cloud) * 1.25;
  c += tile.rgb * (1.0 - day) * FILE_GLOW * (1.0 - coat);
  c *= mix(1.0, 0.8, limb * pow(1.0 - v.z, 1.5));
  c = mix(c, atmoC * (0.08 + 0.92 * day), pow(1.0 - v.z, 3.0) * air * 0.5);
  c += atmoC * pow(1.0 - v.z, 9.0) * air * (0.12 + 0.88 * day) * 0.5;
  c += glow * (1.0 - 0.5 * day);

  // ---- the air outside the edge: a thin glow on the lit side only
  float outside = max(0.0, r - 1.0) / 0.118;
  float halo = exp(-outside * 4.5) * (1.0 - smoothstep(0.75, 1.0, outside)) * min(air, 1.4) * (0.06 + 0.94 * smoothstep(-0.55, 0.5, ndl)) * 0.62;
  vec3 haloC = mix(atmoC, vec3(1.0), 0.25) * halo;
  outColor = vec4(c * alpha + haloC * (1.0 - alpha), alpha + halo * (1.0 - alpha));
}
`;

const UNIFORMS = ['uSize', 'uOrigin', 'uTurn', 'uTime', 'uTilt', 'uLean', 'uLook', 'uSeed', 'uC0', 'uC1', 'uC2', 'uC3', 'uTex', 'uUse', 'uClear', 'uRings', 'uLock'];
// The ball is drawn at 1/AIR of its square, leaving room for the air round its edge.
export const AIR = 1.12;
const MAX_TEXTURES = 24;
const SHEET = 1024;

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
  canvas.width = SHEET;
  canvas.height = SHEET;
  const gl = canvas.getContext('webgl2', {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power',
  });
  if (!gl) return state;
  try {
    const s = { gl, canvas, loc: build(gl), textures: new Map(), lost: false, clock: 0, pending: [], x: 0, y: 0, row: 0, slant: gl.getExtension('EXT_texture_filter_anisotropic') };
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); s.lost = true; s.textures.clear(); s.pending.length = 0; });
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
    // files near the edge of the ball are seen at a slant: keep them sharp there
    if (s.slant) gl.texParameterf(gl.TEXTURE_2D, s.slant.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    entry.version = source.version;
  }
  entry.used = ++s.clock;
}

// Copies every planet painted since the last copy-out onto its own canvas.
function copyOut(s) {
  const { canvas, pending } = s;
  for (const { ctx, size, x, y } of pending) {
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(canvas, x, canvas.height - y - size, size, size, 0, 0, size, size);
  }
  pending.length = 0;
  s.x = 0;
  s.y = 0;
  s.row = 0;
}

// Where on the sheet the next planet goes, in rows from the bottom left.
function place(s, size) {
  const { canvas } = s;
  if (s.x + size > canvas.width) { s.x = 0; s.y += s.row; s.row = 0; }
  if (s.y + size > canvas.height) {
    copyOut(s);
    if (size > canvas.width || size > canvas.height) {
      canvas.width = Math.max(canvas.width, size);
      canvas.height = Math.max(canvas.height, size);
    }
  }
  const spot = { x: s.x, y: s.y };
  // On even pixels, so the shader's 2×2 blocks fall the same as on a canvas of its own.
  const step = size + (size & 1);
  s.x += step;
  s.row = Math.max(s.row, step);
  return spot;
}

let batching = 0;

// Paints one planet onto `ctx` (its own 2D canvas, `size` pixels square).
// Inside together() the copy waits for the rest of the frame's planets.
// `world`: { source: { canvas, version }, look, tilt, lean?, turn, time, seed, colors: [[r,g,b] ×4],
//   use? (0 forgotten to 1 busy), clear? (0 to 1 while dust lifts), rings?, lock? }
// `time` is the world's own weather clock in seconds (a busy world's runs faster).
export function paint(ctx, size, world) {
  const s = init();
  if (!s || s.lost) return false;
  const { gl, loc } = s;
  const { x, y } = place(s, size);
  textureOf(s, world.source);
  gl.viewport(x, y, size, size);
  gl.uniform2f(loc.uOrigin, x, y);
  gl.uniform1f(loc.uSize, size);
  gl.uniform1f(loc.uTurn, world.turn);
  gl.uniform1f(loc.uTime, world.time);
  gl.uniform1f(loc.uTilt, world.tilt);
  gl.uniform1f(loc.uLean, world.lean ?? 0.3);
  gl.uniform1i(loc.uLook, world.look);
  gl.uniform3fv(loc.uSeed, world.seed);
  gl.uniform3fv(loc.uC0, world.colors[0]);
  gl.uniform3fv(loc.uC1, world.colors[1]);
  gl.uniform3fv(loc.uC2, world.colors[2]);
  gl.uniform3fv(loc.uC3, world.colors[3]);
  gl.uniform1f(loc.uUse, world.use ?? 0.5);
  gl.uniform1f(loc.uClear, world.clear || 0);
  gl.uniform1f(loc.uRings, world.rings ? 1 : 0);
  gl.uniform1f(loc.uLock, world.lock ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  s.pending.push({ ctx, size, x, y });
  if (!batching) copyOut(s);
  return true;
}

// Paints all the planets `fn` paints, then copies them out in one go.
export function together(fn) {
  batching += 1;
  try {
    fn();
  } finally {
    batching -= 1;
    const s = state;
    if (!batching && s && s.pending.length) copyOut(s);
  }
}

// A planet's texture won't be needed again.
export function forget(source) {
  const s = init();
  const entry = s && s.textures.get(source);
  if (!entry) return;
  s.gl.deleteTexture(entry.tex);
  s.textures.delete(source);
}
