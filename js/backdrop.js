// The page background is a real 3D scene the camera descends through as you scroll:
// a night sky with aurora, a cloud deck, a reflective ocean, then underwater past fish and jellyfish
// down to the seafloor, where a research submarine sweeps the dark with its lights.
// `stage` runs 0 → 6: 0 starry sky · 1 aurora · 2 clouds · 3 sea surface · 4 shallow sea · 5 twilight zone · 6 abyss
import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { fishSchool, seaTurtle, anglerfish, submarine, ufo } from "./creatures.js";

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

// camera height (scene units) and pitch along the descent
const PATH_Y = [[0, 900], [1, 450], [2, 170], [2.7, 10], [3.3, -8], [4, -28], [5, -82], [6, -131]];
const PATH_PITCH = [[0, 0.5], [1, 0.26], [2, 0.05], [2.7, -0.03], [3.3, -0.04], [4, -0.06], [5, -0.1], [6, -0.2]];
function along(path, s) {
  if (s <= path[0][0]) return path[0][1];
  for (let i = 0; i < path.length - 1; i++) {
    const [s0, v0] = path[i], [s1, v1] = path[i + 1];
    if (s <= s1) { const t = (s - s0) / (s1 - s0), e = t * t * (3 - 2 * t); return v0 + (v1 - v0) * e; }
  }
  return path[path.length - 1][1];
}

const MOON = new THREE.Vector3(-0.5, 0.32, -1).normalize();

const NOISE_GLSL = /* glsl */ `
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = ROT * p * 2.03; a *= 0.5; } return s; }
float fbm3(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * noise(p); p = ROT * p * 2.03; a *= 0.5; } return s; }
vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0, 4, 2), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1), k, s); }
`;

// ---------- sky dome: stars, Milky Way, moon and aurora curtains ----------
function skyDome(uniforms) {
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uHue; uniform int uSteps; uniform vec3 uMoon;
      varying vec3 vDir;
      ${NOISE_GLSL}
      vec3 auroraCol(float k) { return hsv(fract(uHue + k * 0.18), 0.75 - k * 0.2, 1.0); }
      vec3 aurora(vec3 rd) {
        vec3 acc = vec3(0);
        if (rd.y < 0.01) return acc;
        for (int i = 0; i < 40; i++) {
          if (i >= uSteps) break;
          float fi = float(i) / float(uSteps), h = 1.0 + fi * 1.6;
          vec2 q = rd.xz / rd.y * h;
          float wave = (fbm3(vec2(q.x * 0.18 + uTime * 0.015, 2.0)) - 0.5) * 7.0 + sin(q.x * 0.35 + uTime * 0.08) * 1.4;
          float d1 = -q.y - 3.4 - wave, d2 = -q.y - 6.8 - wave * 0.7 - 1.2;
          float band = exp(-d1 * d1 * 0.9) + 0.6 * exp(-d2 * d2 * 0.6);
          float rays = pow(fbm3(vec2(q.x * 2.4 + uTime * 0.04, fi * 0.6)), 2.0) * 2.4;
          acc += auroraCol(fi) * band * rays * (1.0 - fi) * (3.4 / float(uSteps));
        }
        return acc * smoothstep(0.01, 0.2, rd.y);
      }
      void main() {
        vec3 rd = normalize(vDir);
        float h = max(rd.y, 0.0);
        vec3 col = mix(vec3(0.045, 0.05, 0.11), vec3(0.006, 0.008, 0.028), pow(h, 0.45)) + vec3(0.05, 0.04, 0.1) * exp(-h * 9.0);
        vec2 sp = vec2(atan(rd.x, rd.z), asin(clamp(rd.y, -1.0, 1.0))) * 160.0;
        vec2 cell = floor(sp), f = fract(sp) - 0.5;
        float r = hash(cell);
        if (r > 0.972) {
          vec2 o = vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
          float tw = 0.7 + 0.3 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
          col += mix(vec3(0.75, 0.8, 1.0), vec3(1.0, 0.85, 0.7), hash(cell + 9.0)) * smoothstep(0.12, 0.0, length(f - o * 0.6)) * tw * (r - 0.972) * 36.0 * smoothstep(0.0, 0.25, h);
        }
        float mw = exp(-pow(dot(rd, normalize(vec3(0.7, 0.55, -0.45))) * 3.0, 2.0));
        col += vec3(0.12, 0.1, 0.16) * mw * fbm(sp * 0.02) * smoothstep(0.05, 0.4, h);
        col -= vec3(0.04) * mw * smoothstep(0.62, 0.8, fbm(sp * 0.035 + 4.0));
        float m = dot(rd, uMoon);
        col += vec3(3.2, 3.05, 2.7) * smoothstep(0.99986, 0.99991, m) * (0.82 + 0.18 * fbm(rd.xy * 900.0));
        col += vec3(0.16, 0.17, 0.24) * pow(max(m, 0.0), 2200.0) + vec3(0.035, 0.04, 0.065) * pow(max(m, 0.0), 40.0);
        col += aurora(rd);
        col = col / (1.0 + col * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), mat);
  dome.frustumCulled = false; dome.renderOrder = -10;
  return dome;
}

// soft cloud textures from noise, painted once
function cloudTexture(seed) {
  const N = 128, c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d"), img = g.createImageData(N, N);
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const grid = Array.from({ length: 33 * 33 }, rnd);
  const vn = (x, y) => {
    const xi = Math.floor(x) & 31, yi = Math.floor(y) & 31, xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), at = (i, j) => grid[(j & 31) * 33 + (i & 31)];
    return at(xi, yi) * (1 - u) * (1 - v) + at(xi + 1, yi) * u * (1 - v) + at(xi, yi + 1) * (1 - u) * v + at(xi + 1, yi + 1) * u * v;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let f = 0, a = 0.5, fx = x / 16, fy = y / 16;
    for (let o = 0; o < 5; o++) { f += a * vn(fx, fy); fx *= 2; fy *= 2; a *= 0.5; }
    const dx = (x - N / 2) / (N / 2), dy = (y - N / 2) / (N / 2) * 1.6;
    const fall = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
    const d = Math.max(0, f * 1.5 - 0.45) * fall * 1.9;
    const lit = 150 + 105 * Math.min(1, Math.max(0, 0.5 - dy * 0.5)); // brighter on top, toward the moon
    const i = (y * N + x) * 4;
    img.data[i] = lit * 0.92; img.data[i + 1] = lit * 0.95; img.data[i + 2] = lit * 1.05; img.data[i + 3] = Math.min(255, d * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function softDot() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.3, "rgba(255,255,255,0.5)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ---------- jellyfish: translucent pulsing bell, frilled oral arms and long tentacles ----------
function jellyfish(uniforms, hueOffset, size, phase) {
  const group = new THREE.Group();
  const shared = { uTime: uniforms.uTime, uHue: uniforms.uHue, uOff: { value: hueOffset }, uPhase: { value: phase } };
  const pulse = /* glsl */ `float pulse(float t) { float c = fract(t * 0.28 + uPhase); return pow(sin(c * 3.14159), 4.0); }`;
  const bell = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.56), new THREE.ShaderMaterial({
    uniforms: shared,
    vertexShader: /* glsl */ `
      uniform float uTime, uPhase; varying vec3 vN, vV, vP; ${pulse}
      void main() {
        vec3 p = position; float k = pulse(uTime);
        float rim = 1.0 - clamp(p.y, 0.0, 1.0);
        p.xz *= 1.0 - 0.16 * k * rim; p.y *= 1.0 + 0.1 * k;
        p.xz *= 1.0 + 0.03 * sin(atan(p.z, p.x) * 16.0) * rim;          // scalloped margin
        vP = position; vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uHue, uOff, uTime; varying vec3 vN, vV, vP;
      vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0, 4, 2), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1), k, s); }
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float ang = atan(vP.z, vP.x);
        float canals = pow(abs(sin(ang * 4.0)), 40.0) * smoothstep(0.1, 0.9, 1.0 - vP.y);
        float gonads = smoothstep(0.35, 0.0, abs(length(vP.xz) - 0.32)) * smoothstep(0.4, 0.8, vP.y) * pow(abs(sin(ang * 2.0)), 3.0);
        vec3 c = hsv(fract(uHue + uOff), 0.55, 1.0);
        vec3 col = c * (0.06 + fres * 1.4 + canals * 0.5) + vec3(1.0, 0.9, 0.95) * gonads * 0.25;
        gl_FragColor = vec4(col, 0.12 + fres * 0.75 + canals * 0.3);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  }));
  group.add(bell);

  // tentacles and oral arms as animated lines: attribute `along` 0 at the bell → 1 at the tip
  const strands = (count, length, radius, wiggle, width) => {
    const SEG = 40, pos = [], alongA = [], idxA = [];
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      for (let j = 0; j < SEG; j++) {
        for (const jj of [j, j + 1]) {
          const t = jj / SEG;
          pos.push(Math.cos(a) * radius, -t * length, Math.sin(a) * radius);
          alongA.push(t); idxA.push(k);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("along", new THREE.Float32BufferAttribute(alongA, 1));
    geo.setAttribute("idx", new THREE.Float32BufferAttribute(idxA, 1));
    return new THREE.LineSegments(geo, new THREE.ShaderMaterial({
      uniforms: { ...shared, uWiggle: { value: wiggle }, uWidth: { value: width } },
      vertexShader: /* glsl */ `
        attribute float along, idx; uniform float uTime, uPhase, uWiggle; varying float vA; ${pulse}
        void main() {
          vec3 p = position; float k = pulse(uTime);
          p.xz *= 1.0 - 0.16 * k * (1.0 - along);
          p.x += sin(along * 7.0 - uTime * 1.3 + idx * 1.7) * along * uWiggle;
          p.z += cos(along * 6.0 - uTime * 1.1 + idx * 2.3) * along * uWiggle;
          p.y += k * along * 0.25;
          vA = along; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uHue, uOff, uWidth; varying float vA;
        vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0, 4, 2), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1), k, s); }
        void main() { gl_FragColor = vec4(hsv(fract(uHue + uOff + vA * 0.08), 0.5, 1.0) * uWidth, (1.0 - vA) * 0.8); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
  };
  group.add(strands(28, 7.5, 0.92, 0.8, 0.55));   // fine marginal tentacles
  group.add(strands(4, 3.2, 0.18, 0.5, 1.2));     // thick oral arms
  group.add(strands(10, 3.6, 0.28, 0.4, 0.8));
  group.scale.setScalar(size);
  return group;
}

export function createBackdrop(canvas, { mobile = false, reduceMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scale = mobile ? 0.5 : 0.75;
  const scene = new THREE.Scene();
  // a soft studio environment so metal, glass and fish scales have something to reflect
  const envMap = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envMap; scene.environmentIntensity = 0.35;
  const camera = new THREE.PerspectiveCamera(mobile ? 62 : 52, innerWidth / innerHeight, 0.1, 6000);
  const uniforms = { uTime: { value: 0 }, uHue: { value: 0.35 }, uSteps: { value: mobile ? 14 : 24 }, uMoon: { value: MOON } };

  // sky, ocean surface (above) and its underside (below)
  const dome = skyDome(uniforms); scene.add(dome);
  const normals = new THREE.TextureLoader().load("img/textures/waternormals.jpg", (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
  const water = new Water(new THREE.PlaneGeometry(10000, 10000), {
    textureWidth: mobile ? 256 : 512, textureHeight: mobile ? 256 : 512, waterNormals: normals,
    sunDirection: MOON.clone(), sunColor: 0xcfd9ff, waterColor: 0x00141f, distortionScale: 3.2, fog: false,
  });
  water.rotation.x = -Math.PI / 2; scene.add(water);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uHue: uniforms.uHue, uCam: { value: new THREE.Vector3() } },
    vertexShader: "varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: /* glsl */ `uniform float uTime, uHue; uniform vec3 uCam; varying vec3 vW;
      ${NOISE_GLSL}
      void main() {
        vec3 v = normalize(vW - uCam);
        float cosT = abs(v.y);
        float window = smoothstep(0.6, 0.72, cosT);                                  // Snell's window
        float rip = fbm3(vW.xz * 0.08 + uTime * 0.12);
        float caus = pow(1.0 - abs(sin(fbm3(vW.xz * 0.25 + uTime * 0.3) * 10.0)), 8.0);
        vec3 bright = mix(vec3(0.35, 0.55, 0.7), hsv(fract(uHue), 0.4, 0.9), 0.25) * (0.6 + rip * 0.6 + caus * 0.5);
        vec3 dark = vec3(0.01, 0.06, 0.09) * (0.8 + rip * 0.4);
        float dist = length(vW - uCam);
        vec3 col = mix(dark, bright, window);
        col = mix(col, vec3(0.02, 0.13, 0.18), 1.0 - exp(-dist * 0.012));
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.DoubleSide,
  }));
  under.rotation.x = Math.PI / 2; under.position.y = 0.05; scene.add(under);

  // lights
  const moonLight = new THREE.DirectionalLight(0xbfcaff, 0.9); moonLight.position.copy(MOON).multiplyScalar(100); scene.add(moonLight);
  const hemi = new THREE.HemisphereLight(0x4a6a9a, 0x05080f, 0.6); scene.add(hemi);

  // cloud deck between 140 and 280 units up: we fall through it
  const cloudTex = [11, 23, 37].map(cloudTexture);
  const clouds = new THREE.Group(); scene.add(clouds);
  let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTex[i % 3], color: 0x9aa4c4, transparent: true, depthWrite: false, opacity: 0.85, fog: false });
    const sp = new THREE.Sprite(m);
    const w = 120 + rnd() * 260; sp.scale.set(w, w * 0.55, 1);
    sp.position.set((rnd() - 0.5) * 900, 140 + rnd() * 140, -60 - rnd() * 700);
    clouds.add(sp);
  }

  // underwater: light shafts, marine snow, fish, jellyfish, seafloor, submarine
  const shafts = new THREE.Mesh((() => { const gg = new THREE.CylinderGeometry(30, 70, 90, 64, 1, true); gg.translate(0, -45, 0); return gg; })(), new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uHue: uniforms.uHue },
    vertexShader: "varying vec3 vP; varying vec2 vUv; void main() { vP = position; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `uniform float uTime, uHue; varying vec3 vP; varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        float a = atan(vP.z, vP.x);
        float rays = pow(fbm3(vec2(a * 9.0 + uTime * 0.05, uTime * 0.02)), 3.0) * 3.0;
        float fade = smoothstep(0.0, 0.25, vUv.y) * vUv.y;                         // bright near the surface
        gl_FragColor = vec4(mix(vec3(0.55, 0.8, 0.95), hsv(fract(uHue), 0.5, 1.0), 0.3), rays * fade * 0.22);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  scene.add(shafts);

  const dot = softDot();
  const snowGeo = new THREE.BufferGeometry(), snowPos = [];
  for (let i = 0; i < (mobile ? 1200 : 3000); i++) snowPos.push((rnd() - 0.5) * 120, -rnd() * 150, -rnd() * 90 + 10);
  snowGeo.setAttribute("position", new THREE.Float32BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ map: dot, size: 0.35, color: 0xbfd6e0, transparent: true, opacity: 0.55, depthWrite: false, fog: true }));
  scene.add(snow);

  // each depth has its own life: sardines and a sea turtle in the shallows, lanternfish and jellyfish in the
  // twilight zone, an anglerfish beside the submarine in the abyss
  const sardines = fishSchool(uniforms, mobile ? 90 : 180, {
    palette: { back: 0x1d3a4a, flank: 0xb4c6cf, belly: 0xeef3f4, stripe: 0x3f6a7a },
    path: (q) => new THREE.Vector3(Math.sin(q * 0.11) * 16, -24 + Math.sin(q * 0.17) * 2.2, -34 + Math.cos(q * 0.09) * 7),
  });
  const lantern = fishSchool(uniforms, mobile ? 40 : 80, {
    palette: { back: 0x0b1018, flank: 0x2a3440, belly: 0x4a5560, stripe: 0x1a2028, fin: 0x1c242c },
    glow: 0x7fe8ff, size: [0.35, 0.55], spread: [16, 6, 10], beat: 6, metalness: 0.3,
    path: (q) => new THREE.Vector3(-12 + Math.sin(q * 0.08) * 10, -86 + Math.sin(q * 0.13) * 3, -30 + Math.cos(q * 0.07) * 6),
  });
  const turtle = seaTurtle(uniforms);
  const angler = anglerfish(uniforms); angler.position.set(9, -137.5, -16); angler.userData.baseY = -137.5; angler.userData.baseYaw = -0.7; angler.scale.setScalar(1.4);
  scene.add(sardines, lantern, turtle, angler);
  // a UFO with an alien pilot drifting over the starry sky at the top of the page
  const saucer = ufo(uniforms); saucer.scale.setScalar(15); saucer.userData.setBase(new THREE.Vector3(-120, 1140, -250)); scene.add(saucer);

  const jellies = [
    [20, -60, -34, 2.1, 0.55, 0.0], [26, -76, -44, 1.6, 0.7, 0.3], [16, -90, -28, 1.3, 0.62, 0.55],
    [30, -100, -52, 2.4, 0.8, 0.15], [36, -84, -60, 1.6, 0.5, 0.75], [22, -114, -34, 1.1, 0.9, 0.4],
  ].map(([x, y, z, s, off, ph]) => { const j = jellyfish(uniforms, off, s, ph); j.position.set(x, y, z); j.userData.base = y; scene.add(j); return j; });

  const floorGeo = new THREE.PlaneGeometry(500, 500, 160, 160); floorGeo.rotateX(-Math.PI / 2);
  {
    const p = floorGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const dune = Math.sin(x * 0.08 + Math.sin(z * 0.05)) * 0.8 + Math.sin(z * 0.11 + x * 0.03) * 0.6;
      const rock = Math.max(0, Math.sin(x * 0.21) * Math.cos(z * 0.17) - 0.6) * 6;
      p.setY(i, dune + rock);
    }
    floorGeo.computeVertexNormals();
  }
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: 0x6a6455, roughness: 0.95 }));
  floor.position.y = -142; scene.add(floor);
  const glowGeo = new THREE.BufferGeometry(), glowPos = [];
  for (let i = 0; i < 400; i++) glowPos.push((rnd() - 0.5) * 160, -141 + rnd() * 3, -rnd() * 120 + 10);
  glowGeo.setAttribute("position", new THREE.Float32BufferAttribute(glowPos, 3));
  const glowMat = new THREE.PointsMaterial({ map: dot, size: 0.6, color: 0x55ffcc, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const glow = new THREE.Points(glowGeo, glowMat); scene.add(glow);
  const sub = submarine(uniforms); sub.position.set(12, -133, -30); sub.userData.baseY = -133; sub.rotation.y = 0.4; sub.scale.setScalar(0.85); scene.add(sub);

  const fog = new THREE.FogExp2(0x0a3a4c, 0.02);
  const fogStops = [[0, 0x0e4f63, 0.016], [1, 0x07324a, 0.02], [2, 0x041a2c, 0.026], [3, 0x02080f, 0.03]];
  const cA = new THREE.Color(), cB = new THREE.Color();

  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * scale);
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  }
  resize();

  const hueColor = new THREE.Color();
  let last = 0;
  return {
    resize,
    draw(time, stage, scroll, hue, pointerX) {
      const t = reduceMotion ? 0 : time / 1000, dt = Math.min(0.05, Math.max(0, t - last)); last = t;
      uniforms.uTime.value = t; uniforms.uHue.value = hue;
      const y = along(PATH_Y, stage), pitch = along(PATH_PITCH, stage);
      camera.position.set(pointerX * 3, y, 0);
      camera.rotation.set(pitch, pointerX * -0.05, 0, "YXZ");
      dome.position.copy(camera.position);
      const above = y > 0;
      dome.visible = water.visible = clouds.visible = above;
      saucer.visible = y > 300;
      if (saucer.visible) saucer.userData.update(t);
      under.visible = shafts.visible = !above;
      snow.visible = !above;
      sardines.visible = turtle.visible = !above && y > -60;
      lantern.visible = !above && y < -40;
      angler.visible = !above && y < -90;
      jellies.forEach((j) => (j.visible = !above && y < -30));
      glow.visible = sub.visible = floor.visible = !above && y < -60;
      if (above) {
        scene.fog = null; scene.background = null;
        water.material.uniforms.time.value += dt * 0.6;
        moonLight.intensity = 0.9; hemi.intensity = 0.6;
      } else {
        const d = Math.min(3, Math.max(0, (-y / 128) * 3));
        const i = Math.min(2, Math.floor(d)), k = d - i;
        cA.setHex(fogStops[i][1]); cB.setHex(fogStops[i + 1][1]); cA.lerp(cB, k);
        fog.color.copy(cA); fog.density = fogStops[i][2] + (fogStops[i + 1][2] - fogStops[i][2]) * k;
        fog.density *= THREE.MathUtils.smoothstep(-y, 0, 10) * 0.85 + 0.15;
        scene.fog = fog; scene.background = fog.color;
        under.material.uniforms.uCam.value.copy(camera.position);
        shafts.position.set(camera.position.x, 0, -20);
        hemi.intensity = 0.6 * (1 - d / 3) + 0.08;
        moonLight.intensity = 0.9 * (1 - d / 3);
        if (sardines.visible) { sardines.userData.update(t); turtle.userData.update(t); }
        if (lantern.visible) lantern.userData.update(t);
        if (angler.visible) angler.userData.update(t, hueColor.setHSL(hue % 1, 0.8, 0.65));
        jellies.forEach((j, n) => { j.position.y = j.userData.base + Math.sin(t * 0.3 + n) * 1.5; j.rotation.y = t * 0.05 * (n % 2 ? 1 : -1); });
        glowMat.color.setHSL(hue % 1, 0.8, 0.6);
        sub.userData.update(t);
      }
      renderer.render(scene, camera);
    },
  };
}
