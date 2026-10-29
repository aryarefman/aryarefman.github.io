// The page background: one full-screen shader that descends from a night sky with aurora, through the clouds,
// across the sea surface and down to the abyss. `stage` runs 0 → 6:
//   0 starry sky · 1 aurora · 2 clouds · 3 sea surface · 4 shallow sea · 5 twilight zone · 6 abyss
// The aurora hue follows the scroll, and the same hue tints the light and bioluminescence below the water.
import * as THREE from "three";

export const STAGES = [
  { name: "Starry sky", m: 8000 },
  { name: "Aurora", m: 3000 },
  { name: "Clouds", m: 1000 },
  { name: "Sea surface", m: 0 },
  { name: "Shallow sea", m: -60 },
  { name: "Twilight zone", m: -600 },
  { name: "Abyss", m: -4000 },
];

export function metresAt(s) {
  const i = Math.min(5, Math.max(0, Math.floor(s))), t = Math.min(1, Math.max(0, s - i));
  return STAGES[i].m + (STAGES[i + 1].m - STAGES[i].m) * t;
}

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const frag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime, uStage, uScroll, uHue, uPointer;
uniform int uSteps;

#define PI 3.14159265

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = ROT * p * 2.03; a *= 0.5; } return s; }
float fbm3(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * noise(p); p = ROT * p * 2.03; a *= 0.5; } return s; }
vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0, 4, 2), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1), k, s); }
float sstep(float a, float b, float x) { return smoothstep(a, b, x); }
float bump(float a, float p, float b, float x) { return x < p ? smoothstep(a, p, x) : 1.0 - smoothstep(p, b, x); }

const vec3 MOON = normalize(vec3(-0.5, 0.32, 1.0));

// aurora colour at a curtain height (0 bottom → 1 top): green-ish fringe below, shifted hue above
vec3 auroraCol(float k) { return hsv(fract(uHue + k * 0.18), 0.75 - k * 0.2, 1.0); }

// Curtains: march horizontal slabs above the viewer; each slab samples a wavy band with vertical streaks.
vec3 aurora(vec3 rd, int steps) {
  vec3 acc = vec3(0);
  if (rd.y < 0.01) return acc;
  for (int i = 0; i < 40; i++) {
    if (i >= steps) break;
    float fi = float(i) / float(steps);
    float h = 1.0 + fi * 1.6;
    vec2 q = rd.xz / rd.y * h;                       // where this slab is pierced
    float wave = (fbm3(vec2(q.x * 0.18 + uTime * 0.015, 2.0)) - 0.5) * 7.0 + sin(q.x * 0.35 + uTime * 0.08) * 1.4;
    float d1 = q.y - 3.4 - wave, d2 = q.y - 6.8 - wave * 0.7 - 1.2;
    float band = exp(-d1 * d1 * 0.9) + 0.6 * exp(-d2 * d2 * 0.6);
    float rays = pow(fbm3(vec2(q.x * 2.4 + uTime * 0.04, fi * 0.6)), 2.0) * 2.4;
    acc += auroraCol(fi) * band * rays * (1.0 - fi) * (3.5 / float(steps));
  }
  return acc * sstep(0.01, 0.2, rd.y);
}

vec3 skyBase(vec3 rd) {
  float h = max(rd.y, 0.0);
  vec3 col = mix(vec3(0.045, 0.05, 0.11), vec3(0.006, 0.008, 0.028), pow(h, 0.45));
  col += vec3(0.05, 0.04, 0.1) * exp(-h * 9.0);                  // airglow at the horizon
  // stars on a sphere grid, fading into the haze near the horizon
  vec2 sp = vec2(atan(rd.x, rd.z), asin(clamp(rd.y, -1.0, 1.0))) * 160.0;
  vec2 cell = floor(sp), f = fract(sp) - 0.5;
  float r = hash(cell);
  if (r > 0.972) {
    vec2 o = vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
    float d = length(f - o * 0.6);
    float tw = 0.7 + 0.3 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
    col += mix(vec3(0.75, 0.8, 1.0), vec3(1.0, 0.85, 0.7), hash(cell + 9.0)) * smoothstep(0.12, 0.0, d) * tw * (r - 0.972) * 36.0 * sstep(0.0, 0.25, h);
  }
  // milky way: a soft dusty band across the sky
  float mw = exp(-pow(dot(rd, normalize(vec3(0.7, 0.55, -0.45))) * 3.0, 2.0));
  col += vec3(0.12, 0.1, 0.16) * mw * fbm(sp * 0.02) * sstep(0.05, 0.4, h);
  col -= vec3(0.04) * mw * sstep(0.62, 0.8, fbm(sp * 0.035 + 4.0));  // dust lanes
  // moon and its halo
  float m = dot(rd, MOON);
  float disc = smoothstep(0.99986, 0.99991, m);
  float mottle = 0.82 + 0.18 * fbm(rd.xy * 900.0);                     // maria on the moon's face
  col += vec3(3.2, 3.05, 2.7) * disc * mottle;
  col += vec3(0.16, 0.17, 0.24) * pow(max(m, 0.0), 2200.0) + vec3(0.035, 0.04, 0.065) * pow(max(m, 0.0), 40.0);
  return max(col, 0.0);
}

// wave height and its slope for the sea surface
float waves(vec2 p) {
  float t = uTime * 0.6;
  return 0.35 * sin(dot(p, vec2(0.8, 0.6)) * 0.9 + t) + 0.22 * sin(dot(p, vec2(-0.5, 0.86)) * 1.6 + t * 1.3)
       + 0.12 * sin(dot(p, vec2(0.2, -0.98)) * 2.7 + t * 1.7) + 0.35 * (fbm3(p * 0.6 + t * 0.15) - 0.5);
}

vec3 seaSurface(vec3 ro, vec3 rd) {
  float t = ro.y / -rd.y;
  vec3 pos = ro + rd * t;
  vec2 e = vec2(0.05, 0.0);
  float hx = waves(pos.xz + e.xy) - waves(pos.xz - e.xy), hz = waves(pos.xz + e.yx) - waves(pos.xz - e.yx);
  float fade = exp(-t * 0.004);
  vec3 n = normalize(vec3(-hx * 2.2 * fade, 2.0 * e.x * 2.0, -hz * 2.2 * fade));
  vec3 rf = reflect(rd, n); rf.y = abs(rf.y);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
  vec3 refl = skyBase(rf) + aurora(rf, 12) * 0.8;
  vec3 deep = vec3(0.004, 0.018, 0.035) + auroraCol(0.2) * 0.012;
  vec3 col = mix(deep, refl, fres);
  col += vec3(1.0, 0.95, 0.85) * pow(max(dot(rf, MOON), 0.0), 600.0) * 3.0;   // moon glitter
  return mix(col, skyBase(vec3(rd.x, 0.0, rd.z)) * 1.4, 1.0 - exp(-t * 0.006)); // haze toward the horizon
}

vec3 aboveWater(vec2 p, float s) {
  float pitch = mix(0.62, 0.02, sstep(0.6, 3.0, s));
  vec3 rd = normalize(vec3(p.x + uPointer * 0.03, p.y + pitch, 1.35));
  float camH = mix(60.0, 2.5, sstep(1.4, 3.0, s));
  vec3 col = rd.y > 0.0 ? skyBase(rd) + aurora(rd, uSteps) : seaSurface(vec3(0.0, camH, 0.0), rd);
  // cloud deck: we sink through it around stage 2
  float amt = bump(1.1, 2.0, 2.8, s);
  if (amt > 0.001) {
    vec2 c = vec2(p.x * 1.1 + uTime * 0.008, p.y * 1.5 + (s - 2.0) * 2.6);
    float base = fbm(c * 1.6 + vec2(0.0, uTime * 0.005));
    float dens = sstep(0.36, 0.7, base) * amt;
    float lit = sstep(0.45, 0.75, fbm(c * 1.6 + vec2(0.06, 0.09)) - base + 0.6);   // brighter where the cloud thins toward the moon
    vec3 cc = mix(vec3(0.07, 0.075, 0.13), vec3(0.6, 0.63, 0.78), lit) + auroraCol(0.3) * 0.1;
    col = mix(col, cc, dens * 0.92);
    col = mix(col, vec3(0.16, 0.17, 0.26), bump(1.7, 2.05, 2.4, s) * 0.55);         // inside the deck
  }
  return col;
}

// ---------- under the water ----------
float particles(vec2 p, float scale, float speed, float density, float seed) {
  vec2 q = p * scale + vec2(seed, uScroll * 0.0012 * speed + uTime * 0.015 * speed);
  vec2 cell = floor(q), f = fract(q) - 0.5;
  float r = hash(cell + seed);
  if (r < 1.0 - density) return 0.0;
  vec2 o = vec2(hash(cell + 1.3 + seed), hash(cell + 5.9 + seed)) - 0.5;
  return smoothstep(0.08, 0.0, length(f - o * 0.7));
}

vec3 jelly(vec2 p, vec2 c, float size, vec3 tint) {
  vec2 d = (p - c) / size;
  float bell = length(d * vec2(1.0, 1.7));
  vec3 col = tint * (smoothstep(1.0, 0.0, bell) * 0.5 + smoothstep(0.25, 0.0, abs(bell - 0.9)) * 0.8) * step(-0.05, d.y + 0.02);
  for (int k = 0; k < 5; k++) {
    float x = -0.55 + float(k) * 0.27;
    float wx = d.x - x - sin(d.y * 6.0 + uTime * 1.6 + float(k)) * 0.08 * (-d.y);
    col += tint * smoothstep(0.05, 0.0, abs(wx)) * step(d.y, 0.0) * smoothstep(-3.0, 0.0, d.y) * 0.55;
  }
  return col;
}

vec3 underWater(vec2 p, vec2 uv, float s) {
  float d = clamp(s - 3.0, 0.0, 3.0);            // 0 just below the surface → 3 abyss
  vec3 shallow = vec3(0.02, 0.16, 0.22), mid = vec3(0.008, 0.06, 0.13), twi = vec3(0.003, 0.022, 0.055), abyss = vec3(0.0, 0.006, 0.016);
  vec3 base = d < 1.0 ? mix(shallow, mid, d) : d < 2.0 ? mix(mid, twi, d - 1.0) : mix(twi, abyss, d - 2.0);
  vec3 tint = auroraCol(0.15);
  vec3 col = base * mix(0.45, 1.5, uv.y) + tint * 0.03 * (1.0 - d / 3.0);
  // light shafts slanting down from the surface, fading with depth
  float shaftAmt = 1.0 - sstep(0.0, 1.8, d);
  if (shaftAmt > 0.001) {
    float x = p.x * 1.0 + (1.0 - uv.y) * 0.35;
    float sh = pow(fbm3(vec2(x * 5.0 + uTime * 0.06, uTime * 0.03)), 3.0) * 2.2;
    col += mix(vec3(0.5, 0.8, 0.95), tint, 0.35) * sh * sstep(-0.2, 1.0, uv.y) * shaftAmt * 0.32;
    // the surface seen from below: rippling caustic light at the top
    float surf = sstep(0.7, 1.0, uv.y + 0.08 * (1.0 - d));
    float caus = pow(1.0 - abs(sin(fbm3(p * 22.0 + uTime * 0.35) * 12.0)), 10.0);
    col += vec3(0.5, 0.8, 0.9) * surf * (0.1 + caus * 0.22) * (1.0 - sstep(0.0, 0.8, d));
  }
  // marine snow drifting up past us (three depths for parallax)
  col += vec3(0.6, 0.75, 0.8) * (particles(p, 18.0, 1.0, 0.18, 0.0) * 0.25 + particles(p, 9.0, 2.0, 0.12, 7.0) * 0.35 + particles(p, 4.5, 3.5, 0.08, 13.0) * 0.5) * (0.4 + 0.6 * (1.0 - d / 3.0));
  // bioluminescent plankton and jellyfish deeper down, in the aurora hue
  float bio = sstep(0.8, 1.8, d);
  if (bio > 0.001) {
    float pulse = 0.6 + 0.4 * sin(uTime * 2.0 + hash(floor(p * 14.0)) * 30.0);
    col += hsv(fract(uHue + 0.05), 0.7, 1.0) * particles(p, 14.0, 0.6, 0.06, 21.0) * pulse * bio * 0.9;
    float jy = mod(uTime * 0.02 + uScroll * 0.00025, 2.2) - 1.1;
    col += jelly(p, vec2(-0.55, jy), 0.09, hsv(fract(uHue + 0.55), 0.6, 0.8)) * bio;
    col += jelly(p, vec2(0.62, mod(jy + 1.0, 2.2) - 1.1), 0.06, hsv(fract(uHue + 0.7), 0.6, 0.7)) * bio;
    col += jelly(p, vec2(0.15, mod(jy + 0.45, 2.2) - 1.1), 0.045, hsv(fract(uHue + 0.85), 0.6, 0.6)) * bio * 0.8;
  }
  // the seafloor rises from below at the bottom of the page
  float fl = sstep(2.2, 3.0, d);
  if (fl > 0.001) {
    float far = -0.36 + (1.0 - fl) * -0.5 + fbm3(vec2(p.x * 1.6 + 7.0, 1.0)) * 0.24;
    float near = -0.46 + (1.0 - fl) * -0.6 + fbm3(vec2(p.x * 3.2 + 2.0, 3.0)) * 0.16;
    if (p.y < far) col = mix(col, vec3(0.004, 0.016, 0.03), 0.85);
    if (p.y < near) {
      col = vec3(0.006, 0.012, 0.022) + vec3(0.02, 0.03, 0.04) * fbm(p * 12.0);
      col += hsv(fract(uHue + 0.1), 0.6, 1.0) * particles(p, 22.0, 0.0, 0.05, 31.0) * 0.8;
      col += vec3(0.06, 0.09, 0.12) * smoothstep(0.02, 0.0, abs(p.y - near));       // rim light
    }
  }
  return col;
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float s = uStage;
  vec3 col;
  // the waterline sweeps up the screen as we dive (stage 2.85 → 3.15)
  float wl = mix(-0.75, 0.75, sstep(2.85, 3.15, s)) + 0.018 * sin(p.x * 9.0 + uTime * 1.4) + 0.01 * sin(p.x * 23.0 - uTime * 2.1);
  if (s < 2.85 || (s < 3.15 && p.y > wl)) col = aboveWater(p, s);
  else col = underWater(p, uv, s);
  if (s >= 2.85 && s <= 3.15) col += vec3(0.6, 0.8, 0.9) * smoothstep(0.012, 0.0, abs(p.y - wl)) * 0.6;
  // filmic finish: tone map, vignette, fine grain
  col = col / (1.0 + col * 0.6);
  col *= 1.0 - 0.35 * pow(length(uv - 0.5) * 1.25, 2.2);
  col += (hash(uv * uRes + fract(uTime) * 100.0) - 0.5) * 0.012;
  gl_FragColor = vec4(pow(max(col, 0.0), vec3(0.95)), 1.0);
}
`;

export function createBackdrop(canvas, { mobile = false, reduceMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  const scale = mobile ? 0.4 : 0.55; // a soft background: render at reduced resolution and let CSS scale it up
  const uniforms = {
    uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uStage: { value: 0 }, uScroll: { value: 0 },
    uHue: { value: 0.35 }, uPointer: { value: 0 }, uSteps: { value: mobile ? 14 : 26 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const scene = new THREE.Scene(), cam = new THREE.Camera();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  function resize() {
    renderer.setPixelRatio(1);
    renderer.setSize(Math.ceil(innerWidth * scale), Math.ceil(innerHeight * scale), false);
    uniforms.uRes.value.set(Math.ceil(innerWidth * scale), Math.ceil(innerHeight * scale));
  }
  resize();
  return {
    resize,
    draw(time, stage, scroll, hue, pointerX) {
      uniforms.uTime.value = reduceMotion ? 0 : time / 1000;
      uniforms.uStage.value = stage; uniforms.uScroll.value = scroll; uniforms.uHue.value = hue; uniforms.uPointer.value = pointerX;
      renderer.render(scene, cam);
    },
  };
}
