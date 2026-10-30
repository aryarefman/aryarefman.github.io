// The page background is a real 3D scene the camera descends through as you scroll:
// a night sky with aurora, a cloud deck, a reflective ocean, then underwater past fish and jellyfish
// down to the seafloor, where a jelly humpback whale glides through the dark.
// `stage` runs 0 → 6: 0 starry sky · 1 aurora · 2 clouds · 3 sea surface · 4 shallow sea · 5 twilight zone · 6 abyss
import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { ufo } from "./creatures.js";
import { creature } from "./realsea.js";
import { fishSchool, seaTurtle, jellyWhale, glowReef, pirateShip } from "./sealife.js";
import { dolphin, sailfish, hammerhead, whaleShark, octopus, jellyfishV2 } from "./menagerie.js";

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
const PATH_PITCH = [[0, 0.5], [1, 0.26], [2, 0.05], [2.7, -0.03], [3.3, -0.04], [4, -0.06], [5, -0.1], [6, -0.3]];
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
      vec3 auroraCol(float k, float x) {
        float h0 = uHue + 0.07 * sin(x * 0.11 + uTime * 0.05);
        vec3 low = hsv(fract(h0), 0.8, 1.0), mid = hsv(fract(h0 + 0.2 + 0.06 * sin(x * 0.07)), 0.75, 1.0), high = hsv(fract(h0 + 0.55), 0.7, 1.0);
        return k < 0.45 ? mix(low, mid, k / 0.45) : mix(mid, high, (k - 0.45) / 0.55);
      }
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
          acc += auroraCol(fi, q.x) * band * rays * (1.0 - fi * 0.7) * (3.6 / float(uSteps));
        }
        return acc * smoothstep(0.01, 0.2, rd.y);
      }
      void main() {
        vec3 rd = normalize(vDir);
        float h = max(rd.y, 0.0);
        // twilight gradient: a warm peach horizon, through magenta, up to a deep violet-blue zenith where the stars show
        vec3 col = mix(vec3(1.0, 0.5, 0.42), vec3(0.62, 0.2, 0.62), smoothstep(0.0, 0.16, h));
        col = mix(col, vec3(0.2, 0.12, 0.48), smoothstep(0.1, 0.5, h));
        col = mix(col, vec3(0.06, 0.06, 0.24), smoothstep(0.45, 1.0, h));
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
        col += aurora(rd) * 1.35;
        col = col / (1.0 + col * 0.5);
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

// low-poly islands and icebergs scattered along the horizon so the open sea is not empty;
// the Water mirror reflects them for free
function horizonIsles() {
  let seed = 91; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, emissive: 0x2a1a40, emissiveIntensity: 0.35 });
  const sand = new THREE.Color(0xf6d39a), grass = new THREE.Color(0x3fcf78), jungle = new THREE.Color(0x1f9a68), rock = new THREE.Color(0x9a86b8), snow = new THREE.Color(0xffffff);
  const ice = new THREE.Color(0xe6fbff), iceDeep = new THREE.Color(0x7fd8f0), c = new THREE.Color();
  function paint(geo, pick) {
    const pos = geo.attributes.position, col = [];
    geo.computeBoundingBox();
    const { min, max } = geo.boundingBox;
    for (let i = 0; i < pos.count; i++) { pick((pos.getY(i) - min.y) / (max.y - min.y || 1), c); col.push(c.r, c.g, c.b); }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  }
  // offsets come from a hash of the vertex position, so duplicated seam vertices move together and the mesh stays closed
  const salt = rnd() * 100;
  const hash = (x, y, z, k) => { const v = Math.sin(x * 12.99 + y * 78.23 + z * 37.72 + k * 4.1 + salt) * 43758.55; return v - Math.floor(v) - 0.5; };
  function jitter(geo, amt, keepBase) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (keepBase && y <= geo.boundingBox.min.y + 0.01) continue;
      const qx = Math.round(x * 100) / 100, qy = Math.round(y * 100) / 100, qz = Math.round(z * 100) / 100;
      pos.setXYZ(i, x + hash(qx, qy, qz, 1) * amt, y + hash(qx, qy, qz, 2) * amt * 0.6, z + hash(qx, qy, qz, 3) * amt);
    }
  }
  function island(x, z, s) {
    const g = new THREE.Group();
    const beach = new THREE.Mesh(new THREE.CylinderGeometry(95 * s, 110 * s, 6, 14).toNonIndexed(), mat);
    paint(beach.geometry, (_, out) => out.copy(sand)); beach.position.y = 1;
    g.add(beach);
    const peaks = 1 + Math.floor(rnd() * 3);
    for (let p = 0; p < peaks; p++) {
      const h = (38 + rnd() * 52) * s * (p ? 0.6 : 1), r = (70 + rnd() * 30) * s * (p ? 0.7 : 1);
      // a squashed, lumpy dome reads as a hill rather than a spike
      const geo = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      geo.scale(r, h, r * (0.75 + rnd() * 0.3));
      geo.computeBoundingBox(); jitter(geo, 14 * s, true);
      const g2 = geo.toNonIndexed();
      paint(g2, (k, out) => (k < 0.15 ? out.copy(grass) : k < 0.7 ? out.copy(jungle).lerp(grass, 0.35 - k * 0.3) : k < 0.9 || h < 60 * s ? out.copy(rock).lerp(jungle, 0.3) : out.copy(snow)));
      const m = new THREE.Mesh(g2, mat);
      m.position.set(p ? (rnd() - 0.5) * 100 * s : 0, 2, p ? (rnd() - 0.5) * 40 * s : 0);
      g.add(m);
    }
    g.position.set(x, -1, z); g.rotation.y = rnd() * Math.PI;
    return g;
  }
  function iceberg(x, z, s) {
    const geo = new THREE.IcosahedronGeometry(30 * s, 1);
    geo.computeBoundingBox(); jitter(geo, 14 * s, false);
    geo.scale(1.3, 1.1 + rnd() * 0.7, 1);
    const g2 = geo.index ? geo.toNonIndexed() : geo;   // the icosahedron is already non-indexed
    paint(g2, (k, out) => out.copy(iceDeep).lerp(ice, Math.min(1, k * 1.6)));
    const m = new THREE.Mesh(g2, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.35, emissive: 0x4fb8d8, emissiveIntensity: 0.25 }));
    m.position.set(x, 4 * s, z); m.rotation.y = rnd() * Math.PI;
    return m;
  }
  [[-280, -520, 1.0], [200, -720, 1.4], [560, -480, 0.8], [-660, -780, 1.6], [20, -980, 1.2], [-900, -560, 0.9]].forEach(([x, z, s]) => group.add(island(x, z, s)));
  [[-130, -330, 0.7], [330, -380, 0.9], [-440, -420, 1.1], [740, -660, 1.3], [-60, -620, 0.8]].forEach(([x, z, s]) => group.add(iceberg(x, z, s)));
  return group;
}

export function createBackdrop(canvas, { mobile = false, reduceMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scale = mobile ? 0.5 : 0.65;
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
    sunDirection: MOON.clone(), sunColor: 0xffd8c8, waterColor: 0x0b7290, distortionScale: 3.2, fog: false,
  });
  water.rotation.x = -Math.PI / 2; scene.add(water);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uHue: uniforms.uHue, uCam: { value: new THREE.Vector3() }, uFog: { value: new THREE.Color() } },
    vertexShader: "varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: /* glsl */ `uniform float uTime, uHue; uniform vec3 uCam, uFog; varying vec3 vW;
      ${NOISE_GLSL}
      void main() {
        vec3 v = normalize(vW - uCam);
        float cosT = abs(v.y);
        float window = smoothstep(0.6, 0.72, cosT);                                  // Snell's window
        float rip = fbm3(vW.xz * 0.08 + uTime * 0.12);
        float caus = pow(1.0 - abs(sin(fbm3(vW.xz * 0.25 + uTime * 0.3) * 10.0)), 8.0);
        vec3 bright = mix(vec3(0.35, 0.55, 0.7), hsv(fract(uHue), 0.4, 0.9), 0.25) * (0.6 + rip * 0.6 + caus * 0.5);
        vec3 dark = vec3(0.03, 0.2, 0.26) * (0.8 + rip * 0.4);
        float dist = length(vW - uCam);
        vec3 col = mix(dark, bright, window);
        // same order as three.js materials: tone map and encode first, then fog, so it matches the background exactly
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uFog, 1.0 - exp(-dist * 0.03));
      }`,
    side: THREE.DoubleSide,
  }));
  under.rotation.x = Math.PI / 2; under.position.y = 0.05; scene.add(under);

  // lights
  const moonLight = new THREE.DirectionalLight(0xbfcaff, 0.9); moonLight.position.copy(MOON).multiplyScalar(100); scene.add(moonLight);
  const hemi = new THREE.HemisphereLight(0x8aa0e0, 0x2a3050, 0.6); scene.add(hemi);
  const isles = horizonIsles(); scene.add(isles);

  // cloud deck between 140 and 280 units up: we fall through it
  const cloudTex = [11, 23, 37].map(cloudTexture);
  const clouds = new THREE.Group(); scene.add(clouds);
  let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTex[i % 3], color: [0xd6b8f0, 0xffc0d8, 0xa8dcf8, 0xffd2b0][i % 4], transparent: true, depthWrite: false, opacity: 0.85, fog: false });
    const sp = new THREE.Sprite(m);
    const w = 120 + rnd() * 260; sp.scale.set(w, w * 0.55, 1);
    sp.position.set((rnd() - 0.5) * 900, 140 + rnd() * 140, -60 - rnd() * 700);
    clouds.add(sp);
  }

  // underwater: light shafts, marine snow, fish, jellyfish, seafloor, whale
  const shafts = new THREE.Mesh((() => { const gg = new THREE.CylinderGeometry(30, 70, 90, 64, 1, true); gg.translate(0, -45, 0); return gg; })(), new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uHue: uniforms.uHue },
    vertexShader: "varying vec3 vP; varying vec2 vUv; void main() { vP = position; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `uniform float uTime, uHue; varying vec3 vP; varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        float a = atan(vP.z, vP.x);
        float rays = pow(fbm3(vec2(a * 9.0 + uTime * 0.05, uTime * 0.02)), 3.0) * 3.0;
        float fade = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.7, vUv.y);   // soft at both ends: no visible rim
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

  // each depth has its own life, kept to the right of the text column:
  // a sardine bait ball and a green sea turtle in the shallows, lanternfish and jellyfish in the twilight zone,
  // a jelly humpback whale gliding through the abyss
  const sardines = fishSchool(uniforms, mobile ? 70 : 150, "sardine", {
    hi: !mobile, spread: [5, 3, 5], size: [1.3, 1.8],
    path: (q) => new THREE.Vector3(13 + Math.cos(q * 0.45) * 6, -25 + Math.sin(q * 0.9) * 1.2, -32 + Math.sin(q * 0.45) * 4),
  });
  const lantern = fishSchool(uniforms, mobile ? 30 : 60, "lantern", {
    hi: !mobile, spread: [9, 5, 7], size: [1.0, 1.5], seed: 77,
    path: (q) => new THREE.Vector3(14 + Math.cos(q * 0.25) * 7, -88 + Math.sin(q * 0.4) * 2, -34 + Math.sin(q * 0.25) * 5),
  });
  const turtle = creature("sea_turtle", 5);
  const turtlePath = (q) => new THREE.Vector3(24 - ((q * 1.1) % 52), -27 + Math.sin(q * 0.3) * 1.2, -22 + Math.sin(q * 0.15) * 2);
  const whale = creature("humpback_whale", 22, { speed: 0.6 });
  const whalePath = (q) => new THREE.Vector3(9 + Math.cos(q * 0.06) * 14, -133 + Math.sin(q * 0.12) * 1.2, -40 + Math.sin(q * 0.06) * 8);
  scene.add(sardines, lantern, turtle, whale);
  // a school of real scanned barramundi (CC0 model from the Khronos glTF sample assets) in the shallows;
  // the stylised sardines stay as the fallback until the model has loaded
  const BARRA = mobile ? 14 : 28, barraFish = [];
  let barra = null;
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load("models/barramundi.glb", (gltf) => {
    let src = null; gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
    const geo = src.geometry.clone(); geo.translate(0, -0.14, 0);                 // centre the body on its spine
    const mat = src.material.clone();
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          float ph = float(gl_InstanceID) * 1.7;
          float tw = pow(clamp((0.2 - position.z) / 0.52, 0.0, 1.0), 1.6);       // nose at +z: the tail end bends most
          transformed.x += sin(uTime * 6.5 + ph - position.z * 9.0) * 0.07 * tw + sin(uTime * 6.5 + ph) * 0.006;`);
    };
    barra = new THREE.InstancedMesh(geo, mat, BARRA); barra.frustumCulled = false;
    let s2 = 9; const r2 = () => ((s2 = (s2 * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < BARRA; i++) barraFish.push({ off: new THREE.Vector3((r2() - 0.5) * 9, (r2() - 0.5) * 3, (r2() - 0.5) * 6), ph: r2() * 6.28, s: 2.6 + r2() * 1.4, lag: r2() * 1.5 });
    scene.add(barra);
    sardines.removeFromParent();
  });
  const barraPath = (q) => new THREE.Vector3(13 + Math.cos(q * 0.3) * 7, -25 + Math.sin(q * 0.6) * 1.2, -30 + Math.sin(q * 0.3) * 5);
  const bDummy = new THREE.Object3D(), bHere = new THREE.Vector3(), bAhead = new THREE.Vector3(), bWob = new THREE.Vector3();
  const bPlace = (f, q, out) => out.copy(barraPath(q - f.lag)).add(f.off).add(bWob.set(Math.sin(q * 0.6 + f.ph) * 0.5, Math.sin(q * 0.8 + f.ph) * 0.25, Math.cos(q * 0.5 + f.ph) * 0.5));
  // the reference creatures, one or two per depth, each swimming its own loop on the right of the text column
  const swimmers = [
    { o: creature("dolphin", 7), s: 1, ymin: -12, path: (q) => new THREE.Vector3(18 + Math.cos(q * 0.32) * 9, -9 + Math.sin(q * 0.64) * 2.5, -30 + Math.sin(q * 0.32) * 7) },
    { o: creature("dolphin", 6.5), s: 1, ymin: -12, path: (q) => new THREE.Vector3(18 + Math.cos(q * 0.32 + 0.5) * 10, -10.5 + Math.sin(q * 0.64 + 1) * 2.5, -32 + Math.sin(q * 0.32 + 0.5) * 7) },
    { o: creature("manta_ray", 8), s: 1, ymin: -50, path: (q) => new THREE.Vector3(14 + Math.cos(q * 0.22) * 12, -40 + Math.sin(q * 0.3) * 2, -30 + Math.sin(q * 0.22) * 6) },
    { o: creature("hammerhead", 9), s: 1, ymin: -80, path: (q) => new THREE.Vector3(16 + Math.cos(-q * 0.13) * 12, -66 + Math.sin(q * 0.2) * 2, -36 + Math.sin(-q * 0.13) * 8) },
    // colourful and unusual species, so each depth is not just grey whales and sharks
    { o: creature("orca", 10), s: 1, ymin: -16, path: (q) => new THREE.Vector3(-8 + Math.cos(-q * 0.2) * 14, -14 + Math.sin(q * 0.4) * 2, -40 + Math.sin(-q * 0.2) * 8) },
    { o: creature("blue_tang", 1.6), s: 1, ymin: -24, path: (q) => new THREE.Vector3(8 + Math.cos(q * 0.6) * 5, -22 + Math.sin(q * 1.1) * 1, -18 + Math.sin(q * 0.6) * 3) },
    { o: creature("blue_tang", 1.4), s: 1, ymin: -24, path: (q) => new THREE.Vector3(8 + Math.cos(q * 0.6 + 0.4) * 5.6, -21 + Math.sin(q * 1.1 + 1) * 1, -18 + Math.sin(q * 0.6 + 0.4) * 3.4) },
    { o: creature("powder_tang", 1.5), s: 1, ymin: -26, path: (q) => new THREE.Vector3(12 + Math.cos(-q * 0.5) * 4, -24 + Math.sin(q) * 0.8, -20 + Math.sin(-q * 0.5) * 3) },
    { o: creature("parrotfish", 2.6), s: 1, ymin: -32, path: (q) => new THREE.Vector3(4 + Math.cos(q * 0.35) * 7, -30 + Math.sin(q * 0.7) * 1.2, -24 + Math.sin(q * 0.35) * 4) },
    { o: creature("lionfish", 2.4), s: 1, ymin: -46, path: (q) => new THREE.Vector3(24 + Math.cos(q * 0.15) * 2, -44 + Math.sin(q * 0.5) * 0.6, -22 + Math.sin(q * 0.15) * 1.5) },
    { o: creature("sea_dragon", 2.6), s: 1, ymin: -52, path: (q) => new THREE.Vector3(2 + Math.cos(q * 0.1) * 2, -50 + Math.sin(q * 0.4) * 0.8, -20 + Math.sin(q * 0.1) * 1.5) },
    { o: creature("narwhal", 11), s: 1, ymin: -80, path: (q) => new THREE.Vector3(-6 + Math.cos(q * 0.1) * 14, -76 + Math.sin(q * 0.18) * 2, -46 + Math.sin(q * 0.1) * 8) },
    { o: creature("whale_shark", 16), s: 1, ymin: -110, path: (q) => new THREE.Vector3(12 + Math.cos(q * 0.07) * 16, -96 + Math.sin(q * 0.11) * 2, -50 + Math.sin(q * 0.07) * 10) },
  ];
  swimmers.forEach((sw) => { sw.o.scale.setScalar(sw.s); scene.add(sw.o); });
  const octo = creature("octopus", 6); octo.position.set(17, -140.2, -24); octo.rotation.y = -0.5; scene.add(octo);
  const angler = creature("anglerfish", 4); angler.position.set(-2, -136, -18); angler.rotation.y = 0.8; scene.add(angler);
  const coral = creature("coral", 14); coral.position.set(10, -141.3, -30); scene.add(coral);
  const clowns = creature("clownfish", 1.6); clowns.position.set(12, -138, -26); scene.add(clowns);
  const seahorse = creature("seahorse", 2.2); seahorse.position.set(4, -138.6, -22); seahorse.rotation.y = 0.6; scene.add(seahorse);
  const slug = creature("nudibranch", 1.2); slug.position.set(9, -140.9, -21); slug.rotation.y = -0.9; scene.add(slug);
  // a UFO with an alien pilot drifting over the starry sky at the top of the page
  // a pirate galleon sailing the night sea, seen as we come down to the surface
  const ship = creature("pirate_ship", 46); ship.position.set(30, 13, -95); ship.rotation.y = -1.9; ship.userData.update = (q) => { ship.rotation.z = Math.sin(q * 0.7) * 0.03; ship.position.y = 13 + Math.sin(q * 0.9) * 0.3; }; scene.add(ship);
  const saucer = ufo(uniforms); saucer.scale.setScalar(15); saucer.userData.setBase(new THREE.Vector3(-120, 1140, -250)); scene.add(saucer);
  // a pod of dolphins leaping out of the open sea right of the island, and a humpback whale breaching further out,
  // each throwing up white spray as it leaves and re-enters the water
  const leapers = [0, 1, 2].map((i) => ({ o: creature("dolphin", 8 - i * 0.6), lag: i * 0.5, dx: i * 2.2, dz: i * 3, air: false }));
  const breacher = creature("humpback_whale", 30, { speed: 0.5 }); breacher.rotation.order = "YXZ";
  let breacherAir = false;
  leapers.forEach((l) => scene.add(l.o)); scene.add(breacher);
  const LEAP = 6.5, BREACH = 19;
  const leapAt = (q, l, out) => {                      // one 1.8 s leap every 6.5 s, a little further along each time
    const u = ((q - l.lag) % LEAP + LEAP) % LEAP, k = Math.floor((q - l.lag) / LEAP), s = u / 1.8;
    const x0 = 4 + ((k * 13) % 14) + l.dx;
    out.set(x0 + Math.min(s, 1) * 17, -1.5 + 10 * 4 * s * (1 - s), -125 - l.dz);
    return s < 1;
  };
  const SPLASH = mobile ? 240 : 520;
  const spPos = new Float32Array(SPLASH * 3).fill(-999), spCol = new Float32Array(SPLASH * 3), spVel = new Float32Array(SPLASH * 3), spLife = new Float32Array(SPLASH);
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute("position", new THREE.BufferAttribute(spPos, 3)); spGeo.setAttribute("color", new THREE.BufferAttribute(spCol, 3));
  const spray = new THREE.Points(spGeo, new THREE.PointsMaterial({ map: dot, size: 2.2, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  spray.frustumCulled = false; scene.add(spray);
  let spNext = 0;
  const splash = (p, n, power) => {
    for (let j = 0; j < n; j++) {
      const i = spNext; spNext = (spNext + 1) % SPLASH;
      const a = rnd() * Math.PI * 2, r = rnd() * power * 0.35;
      spPos.set([p.x + Math.cos(a) * r * 0.4, 0.2, p.z + Math.sin(a) * r * 0.4], i * 3);
      spVel.set([Math.cos(a) * r, power * (0.5 + rnd() * 0.7), Math.sin(a) * r], i * 3);
      spLife[i] = 0.7 + rnd() * 0.5;
    }
  };
  const lHere = new THREE.Vector3(), lAhead = new THREE.Vector3();
  function surfaceLife(t, dt, on) {
    leapers.forEach((l) => {
      const air = leapAt(t, l, lHere);
      if (air !== l.air && on) splash(lHere, mobile ? 18 : 36, 6);
      l.air = air; l.o.visible = on && air;
      if (l.o.visible) { leapAt(t + 0.05, l, lAhead); l.o.position.copy(lHere); l.o.lookAt(lAhead); }
    });
    // the whale rises nose-first, twists onto its side at the top and crashes back down
    const s = ((t % BREACH) + BREACH) % BREACH / 3.2, air = s < 1;
    if (air) {
      breacher.position.set(62 + s * 7, -15 + 32 * 4 * s * (1 - s), -230);
      breacher.rotation.set(-1.25 + s * 2.1, Math.PI / 2, s * 1.6);
    }
    if (air !== breacherAir && on) splash(breacher.position, mobile ? 70 : 150, 16);
    breacherAir = air; breacher.visible = on && air;
    spray.visible = on;
    if (!on) return;
    for (let i = 0; i < SPLASH; i++) {
      if (spLife[i] <= 0) continue;
      spLife[i] -= dt; spVel[i * 3 + 1] -= 18 * dt;
      spPos[i * 3] += spVel[i * 3] * dt; spPos[i * 3 + 1] += spVel[i * 3 + 1] * dt; spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt;
      if (spPos[i * 3 + 1] < 0 || spLife[i] <= 0) { spLife[i] = 0; spPos[i * 3 + 1] = -999; }
      const c = Math.max(0, Math.min(1, spLife[i])) * 0.9;
      spCol.set([c * 0.85, c * 0.92, c], i * 3);
    }
    spGeo.attributes.position.needsUpdate = spGeo.attributes.color.needsUpdate = true;
  }

  const jellies = [
    [20, -60, -34, 2.1, 0.55, 0.0], [26, -76, -44, 1.6, 0.7, 0.3], [16, -90, -28, 1.3, 0.62, 0.55],
    [30, -100, -52, 2.4, 0.8, 0.15], [36, -84, -60, 1.6, 0.5, 0.75], [22, -114, -34, 1.1, 0.9, 0.4],
  ].map(([x, y, z, s, off, ph]) => { const j = creature("jellyfish", 6 * s, { speed: 0.8 }); j.position.set(x, y, z); j.userData.base = y; scene.add(j); return j; });
  // the glowing jellyfish from before, drifting on the other side of the descent next to the real ones
  [[-14, -56, -30, 2.0, 0.55, 0.0], [-22, -72, -42, 1.5, 0.7, 0.3], [-10, -88, -26, 1.2, 0.62, 0.55],
   [-26, -104, -50, 2.2, 0.8, 0.15], [-4, -120, -36, 1.4, 0.9, 0.4], [-18, -128, -46, 1.7, 0.5, 0.75],
  ].forEach(([x, y, z, s, off, ph]) => { const j = jellyfishV2(uniforms, off + ph); j.scale.setScalar(s); j.position.set(x, y, z); j.userData.base = y; scene.add(j); jellies.push(j); });
  // kelp swaying on the seafloor around the reef
  const kelp = [[-6, -24], [2, -36], [20, -38], [26, -22], [-12, -34]].map(([x, z], i) => { const k = creature("seaweed", 9 + (i % 3) * 2); k.position.set(x, -137.5, z); k.rotation.y = i * 1.3; scene.add(k); return k; });

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
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: 0x3e3c6e, roughness: 0.95 }));
  floor.position.y = -142; scene.add(floor);
  // the end of the page: a glowing reef on the seafloor
  const reef = glowReef(uniforms, { centre: new THREE.Vector3(6, -141.2, -26), radius: 12, anemones: mobile ? 12 : 24 }); scene.add(reef);
  const glowGeo = new THREE.BufferGeometry(), glowPos = [];
  for (let i = 0; i < 400; i++) glowPos.push((rnd() - 0.5) * 160, -141 + rnd() * 3, -rnd() * 120 + 10);
  glowGeo.setAttribute("position", new THREE.Float32BufferAttribute(glowPos, 3));
  const glowMat = new THREE.PointsMaterial({ map: dot, size: 0.6, color: 0x55ffcc, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const glow = new THREE.Points(glowGeo, glowMat); scene.add(glow);

  // fog stays attached for the whole page (density 0 above water): toggling it would recompile every material
  const fog = new THREE.FogExp2(0x0a3a4c, 0.0); scene.fog = fog;
  const fogStops = [[0, 0x2cc8d4, 0.012], [1, 0x2390d8, 0.015], [2, 0x4458d0, 0.018], [3, 0x6a34b0, 0.021]];
  const cA = new THREE.Color(), cB = new THREE.Color();

  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * scale);
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  }
  resize();

  // Objects that carry lights are never hidden: changing the number of lights makes three.js recompile every
  // shader, which stalls the page mid-scroll. Their meshes are hidden instead and their lights faded to zero.
  const lit = [saucer];
  lit.forEach((o) => o.traverse((c) => { if (c.isLight) c.userData.base = c.intensity; }));
  function show(o, on) {
    if (o.userData.shown === on) return;
    o.userData.shown = on;
    o.traverse((c) => {
      if (c === o) return;
      if (c.isLight) c.intensity = on ? c.userData.base : 0;
      else if (c.isMesh || c.isPoints || c.isLine || c.isSprite) c.visible = on;
    });
  }
  // compile every shader up front (while the loader is showing) so nothing compiles during scrolling
  renderer.compileAsync(scene, camera).catch(() => {});

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
      ship.visible = above && y < 260;
      isles.visible = above && y < 320;
      if (ship.visible) { ship.userData.update(t); ship.position.x = 30 - ((t * 0.8) % 80) + 20; }
      surfaceLife(t, dt, ship.visible);
      show(saucer, y > 300);
      if (saucer.userData.shown) saucer.userData.update(t);
      under.visible = !above;
      shafts.visible = !above && y > -55;
      snow.visible = !above;
      sardines.visible = turtle.visible = !above && y > -60;
      lantern.visible = false;   // replaced by the real jellyfish and sharks at this depth
      whale.visible = !above && y < -90;
      jellies.forEach((j) => (j.visible = !above && y < -30));
      swimmers.forEach((sw) => (sw.o.visible = !above && y > sw.ymin - 30 && y < sw.ymin + 40));
      octo.visible = angler.visible = coral.visible = clowns.visible = seahorse.visible = slug.visible = !above && y < -60;
      kelp.forEach((k) => (k.visible = !above && y < -60));
      glow.visible = floor.visible = reef.visible = !above && y < -60;
      reef.userData.light.intensity = !above && y < -60 ? 40 : 0;   // light stays in the scene (constant light count)
      if (above) {
        fog.density = 0; scene.background = null;
        water.material.uniforms.time.value += dt * 0.6;
        moonLight.intensity = 0.9; hemi.intensity = 0.6;
      } else {
        const d = Math.min(3, Math.max(0, (-y / 128) * 3));
        const i = Math.min(2, Math.floor(d)), k = d - i;
        cA.setHex(fogStops[i][1]); cB.setHex(fogStops[i + 1][1]); cA.lerp(cB, k);
        fog.color.copy(cA); fog.density = fogStops[i][2] + (fogStops[i + 1][2] - fogStops[i][2]) * k;
        fog.density *= THREE.MathUtils.smoothstep(-y, 0, 10) * 0.85 + 0.15;
        scene.background = fog.color;
        under.material.uniforms.uCam.value.copy(camera.position);
        under.material.uniforms.uFog.value.copy(fog.color).convertLinearToSRGB();   // three.js passes fog and clear colours in output space
        shafts.position.set(camera.position.x, 0, -20);
        hemi.intensity = 0.6 * (1 - d / 3) + 0.25;
        moonLight.intensity = 0.9 * (1 - d / 3) + 0.15;
        if (barra) {
          barra.visible = y > -60;
          if (barra.visible) {
            barraFish.forEach((f, i) => { bPlace(f, t, bHere); bPlace(f, t + 0.2, bAhead); bDummy.position.copy(bHere); bDummy.lookAt(bAhead); bDummy.scale.setScalar(f.s); bDummy.updateMatrix(); barra.setMatrixAt(i, bDummy.matrix); });
            barra.instanceMatrix.needsUpdate = true;
          }
        }
        if (sardines.visible) {
          sardines.userData.update(t);
          turtle.position.copy(turtlePath(t)); turtle.lookAt(turtlePath(t + 0.5));
        }
        if (lantern.visible) lantern.userData.update(t);
        if (whale.visible) { whale.position.copy(whalePath(t)); whale.lookAt(whalePath(t + 1)); }
        clowns.position.set(12 + Math.cos(t * 0.5) * 3, -138 + Math.sin(t) * 0.4, -26 + Math.sin(t * 0.5) * 2); clowns.rotation.y = -t * 0.5; seahorse.position.y = -138.6 + Math.sin(t * 0.8) * 0.25; seahorse.rotation.z = Math.sin(t * 0.6) * 0.08;
        jellies.forEach((j, n) => { j.position.y = j.userData.base + Math.sin(t * 0.3 + n) * 1.5; j.rotation.y = t * 0.05 * (n % 2 ? 1 : -1); });
        kelp.forEach((k, n) => (k.rotation.z = Math.sin(t * 0.6 + n) * 0.06));
        swimmers.forEach((sw) => { if (sw.o.visible) { sw.o.position.copy(sw.path(t)); sw.o.lookAt(sw.path(t + 0.3)); } });
        glowMat.color.setHSL(hue % 1, 0.8, 0.6);
      }
      for (const o of [turtle, whale, octo, angler, clowns, slug, breacher, ...leapers.map((l) => l.o), ...jellies, ...swimmers.map((sw) => sw.o)]) if (o.userData.mixer && o.visible) o.userData.mixer.update(dt);
      renderer.render(scene, camera);
    },
  };
}
