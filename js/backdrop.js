// The page background is a real 3D scene the camera descends through as you scroll:
// a night sky with aurora, a cloud deck, a reflective ocean, then underwater past fish and jellyfish
// down to the seafloor, where a jelly humpback whale glides through the dark.
// `stage` runs 0 → 6: 0 starry sky · 1 aurora · 2 clouds · 3 sea surface · 4 shallow sea · 5 twilight zone · 6 abyss
import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { ufo } from "./creatures.js";
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
        vec3 col = mix(vec3(0.07, 0.045, 0.16), vec3(0.012, 0.01, 0.045), pow(h, 0.45)) + vec3(0.13, 0.05, 0.17) * exp(-h * 8.0);
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

export function createBackdrop(canvas, { mobile = false, reduceMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
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
    sunDirection: MOON.clone(), sunColor: 0xcfd9ff, waterColor: 0x063350, distortionScale: 3.2, fog: false,
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
        vec3 dark = vec3(0.01, 0.06, 0.09) * (0.8 + rip * 0.4);
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
  const hemi = new THREE.HemisphereLight(0x4a6a9a, 0x05080f, 0.6); scene.add(hemi);

  // cloud deck between 140 and 280 units up: we fall through it
  const cloudTex = [11, 23, 37].map(cloudTexture);
  const clouds = new THREE.Group(); scene.add(clouds);
  let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTex[i % 3], color: [0xb8a8e0, 0xe4b4d6, 0x9ac8e8, 0xc8c0f0][i % 4], transparent: true, depthWrite: false, opacity: 0.85, fog: false });
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
  const turtle = seaTurtle(); turtle.scale.setScalar(3.2);
  const turtlePath = (q) => new THREE.Vector3(24 - ((q * 1.1) % 52), -27 + Math.sin(q * 0.3) * 1.2, -22 + Math.sin(q * 0.15) * 2);
  const whale = jellyWhale(uniforms); whale.scale.setScalar(1.6);
  const whalePath = (q) => new THREE.Vector3(9 + Math.cos(q * 0.06) * 14, -133 + Math.sin(q * 0.12) * 1.2, -40 + Math.sin(q * 0.06) * 8);
  scene.add(sardines, lantern, turtle, whale);
  // the reference creatures, one or two per depth, each swimming its own loop on the right of the text column
  const swimmers = [
    { o: dolphin(uniforms), s: 2.2, ymin: -12, path: (q) => new THREE.Vector3(18 + Math.cos(q * 0.32) * 9, -9 + Math.sin(q * 0.64) * 2.5, -30 + Math.sin(q * 0.32) * 7) },
    { o: dolphin(uniforms), s: 2.0, ymin: -12, path: (q) => new THREE.Vector3(18 + Math.cos(q * 0.32 + 0.5) * 10, -10.5 + Math.sin(q * 0.64 + 1) * 2.5, -32 + Math.sin(q * 0.32 + 0.5) * 7) },
    { o: sailfish(uniforms), s: 2.4, ymin: -50, path: (q) => new THREE.Vector3(14 + Math.cos(q * 0.22) * 12, -40 + Math.sin(q * 0.3) * 2, -30 + Math.sin(q * 0.22) * 6) },
    { o: hammerhead(uniforms), s: 2.2, ymin: -80, path: (q) => new THREE.Vector3(16 + Math.cos(-q * 0.13) * 12, -66 + Math.sin(q * 0.2) * 2, -36 + Math.sin(-q * 0.13) * 8) },
    { o: whaleShark(uniforms), s: 2.0, ymin: -110, path: (q) => new THREE.Vector3(12 + Math.cos(q * 0.07) * 16, -96 + Math.sin(q * 0.11) * 2, -50 + Math.sin(q * 0.07) * 10) },
  ];
  swimmers.forEach((sw) => { sw.o.scale.setScalar(sw.s); scene.add(sw.o); });
  const octo = octopus(uniforms); octo.position.set(17, -141.6, -24); octo.rotation.y = -0.5; octo.scale.setScalar(1.6); scene.add(octo);
  // a UFO with an alien pilot drifting over the starry sky at the top of the page
  // a pirate galleon sailing the night sea, seen as we come down to the surface
  const ship = pirateShip(); ship.scale.setScalar(2.2); ship.position.set(30, 0, -95); ship.rotation.y = -1.9; scene.add(ship);
  const saucer = ufo(uniforms); saucer.scale.setScalar(15); saucer.userData.setBase(new THREE.Vector3(-120, 1140, -250)); scene.add(saucer);

  const jellies = [
    [20, -60, -34, 2.1, 0.55, 0.0], [26, -76, -44, 1.6, 0.7, 0.3], [16, -90, -28, 1.3, 0.62, 0.55],
    [30, -100, -52, 2.4, 0.8, 0.15], [36, -84, -60, 1.6, 0.5, 0.75], [22, -114, -34, 1.1, 0.9, 0.4],
  ].map(([x, y, z, s, off, ph]) => { const j = jellyfishV2(uniforms, off + ph); j.scale.setScalar(s); j.position.set(x, y, z); j.userData.base = y; scene.add(j); return j; });

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
  const fogStops = [[0, 0x1b8a9c, 0.014], [1, 0x14609e, 0.018], [2, 0x22308a, 0.022], [3, 0x2a1660, 0.026]];
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
      if (ship.visible) { ship.userData.update(t); ship.position.x = 30 - ((t * 0.8) % 80) + 20; }
      show(saucer, y > 300);
      if (saucer.userData.shown) saucer.userData.update(t);
      under.visible = !above;
      shafts.visible = !above && y > -55;
      snow.visible = !above;
      sardines.visible = turtle.visible = !above && y > -60;
      lantern.visible = !above && y < -40;
      whale.visible = !above && y < -90;
      jellies.forEach((j) => (j.visible = !above && y < -30));
      swimmers.forEach((sw) => (sw.o.visible = !above && y > sw.ymin - 30 && y < sw.ymin + 40));
      octo.visible = !above && y < -60;
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
        hemi.intensity = 0.6 * (1 - d / 3) + 0.08;
        moonLight.intensity = 0.9 * (1 - d / 3);
        if (sardines.visible) {
          sardines.userData.update(t);
          turtle.position.copy(turtlePath(t)); turtle.lookAt(turtlePath(t + 0.5)); turtle.userData.update(t);
        }
        if (lantern.visible) lantern.userData.update(t);
        if (whale.visible) { whale.position.copy(whalePath(t)); whale.lookAt(whalePath(t + 1)); whale.userData.update(t); }
        jellies.forEach((j, n) => { j.position.y = j.userData.base + Math.sin(t * 0.3 + n) * 1.5; j.rotation.y = t * 0.05 * (n % 2 ? 1 : -1); });
        swimmers.forEach((sw) => { if (sw.o.visible) { sw.o.position.copy(sw.path(t)); sw.o.lookAt(sw.path(t + 0.3)); } });
        glowMat.color.setHSL(hue % 1, 0.8, 0.6);
      }
      renderer.render(scene, camera);
    },
  };
}
