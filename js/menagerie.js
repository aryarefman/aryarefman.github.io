// The reference "material study" creatures, rebuilt for the backdrop: a dolphin, a sailfish, a hammerhead,
// a whale shark and an octopus. Bodies are lofted along a spine from elliptical sections (the same recipe as
// the jelly whale in sealife.js), shaded either as translucent jelly (fresnel rim, thickness tint, milky belly)
// or as plush felt (soft sheen, painted pattern), and swim with a side-to-side wave that grows toward the tail.
import * as THREE from "three";

const TAU = Math.PI * 2;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- shared shaders ----------
const VERT = /* glsl */ `
  uniform float uTime, uAmp, uK, uBeat;
  attribute vec3 aInfo;            // (u along the body 0 tail → 1 snout, part 0 body · 1 fin · 2 eye, k)
  varying vec3 vN, vV, vRest, vInfo;
  #include <fog_pars_vertex>
  float wave(float u) { float w = 0.04 + 0.96 * pow(clamp(1.0 - u, 0.0, 1.0), 2.0); return uAmp * w * sin(6.2831 * uK * (1.0 - u) - uTime * uBeat); }
  void main() {
    vec3 p = position;
    float u = aInfo.x;
    p.x += wave(u);
    float slope = (wave(u + 0.01) - wave(u - 0.01)) / 0.02;
    vec3 n = normalize(vec3(normal.x, normal.y, normal.z - slope * normal.x * 0.1));
    vRest = position; vInfo = aInfo;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * n); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
    vec4 mvPosition = mv;
    #include <fog_vertex>
  }`;

const HSV = /* glsl */ `vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0, 4, 2), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1), k, s); }`;

function frag(pattern, style) {
  return /* glsl */ `
  uniform float uTime, uHue; uniform vec3 uA, uB, uC;
  varying vec3 vN, vV, vRest, vInfo;
  #include <fog_pars_fragment>
  ${HSV}
  float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 n = normalize(vN), v = normalize(vV);
    float ndv = abs(dot(n, v)), fres = pow(1.0 - ndv, 2.0);
    float u = vInfo.x, part = vInfo.y;
    vec3 L = normalize(vec3(0.3, 0.9, 0.4));
    float lam = 0.45 + 0.55 * max(dot(n, L), 0.0);
    vec3 col; float alpha = 1.0;
    // pattern: uA back colour, uB belly colour, uC accent
    float back = smoothstep(-0.15, 0.35, vRest.y / max(0.001, vInfo.z));
    vec3 base = mix(uB, uA, back);
    ${pattern}
    if (part > 1.5) { base = vec3(0.01); }
    ${style === "jelly" ? `
      col = base * (0.35 + 0.4 * ndv) * lam + mix(vec3(0.6, 0.9, 1.0), hsv(fract(uHue), 0.5, 1.0), 0.3) * fres * 1.2;
      col += vec3(0.85, 0.95, 1.0) * pow(max(dot(reflect(-L, n), v), 0.0), 50.0) * 0.7;
      alpha = part > 0.5 && part < 1.5 ? 0.55 + fres * 0.4 : 0.42 + fres * 0.5;
      if (part > 1.5) alpha = 1.0;` : `
      // felt: soft wrap lighting, fuzzy sheen at grazing angles, tiny fibre noise
      float wrap = 0.55 + 0.45 * dot(n, L);
      float fibre = 0.92 + 0.16 * h1(floor(vRest.xy * 140.0) + floor(vRest.z * 140.0));
      col = base * wrap * fibre + base * fres * 0.6 + vec3(1.0) * fres * 0.08;`}
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;
}

function material(uniforms, { a, b, c, pattern = "", style = "jelly", amp = 0.25, k = 0.9, beat = 2.4 }) {
  const U = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uHue: { value: 0 }, uAmp: { value: amp }, uK: { value: k }, uBeat: { value: beat },
    uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uC: { value: new THREE.Color(c ?? b) },
  }]);
  U.uTime = uniforms.uTime; U.uHue = uniforms.uHue;
  const jelly = style === "jelly";
  return new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: frag(pattern, style), transparent: jelly, depthWrite: !jelly, side: THREE.DoubleSide, fog: true });
}

// ---------- geometry ----------
// body lofted along z (length L): H(u), W(u) half-height/half-width; arch(u) lifts the spine
function loft({ L, H, W, arch = () => 0, NU = 64, NV = 32, flatBelly = 0.85 }) {
  const pos = [], info = [], idx = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, z = (u - 0.5) * L, h = Math.max(0.004, H(u)), w = Math.max(0.004, W(u));
    for (let j = 0; j <= NV; j++) {
      const a = (j / NV) * TAU, s = Math.sin(a), c = Math.cos(a);
      pos.push(w * c, arch(u) + h * s * (s < 0 ? flatBelly : 1), z);
      info.push(u, 0, h);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  return { pos, info, idx };
}
// a fin: a quad patch from root edge (r0→r1) out to a tip curve; `u` used for the swim wave
function fin(list, root0, root1, tip0, tip1, u, N = 10) {
  const start = list.pos.length / 3;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = root0.clone().lerp(root1, t), e = tip0.clone().lerp(tip1, t);
    for (let k = 0; k <= 4; k++) { const p = r.clone().lerp(e, k / 4); list.pos.push(p.x, p.y, p.z); list.info.push(u, 1, 1); }
  }
  for (let i = 0; i < N; i++) for (let k = 0; k < 4; k++) { const a = start + i * 5 + k, b = a + 5; list.idx.push(a, b, a + 1, a + 1, b, b + 1); }
}
function curveFin(list, root0, root1, tipFn, u, N = 16) {   // tipFn(t) gives the outline point for root position t
  const start = list.pos.length / 3;
  for (let i = 0; i <= N; i++) {
    const t = i / N, r = root0.clone().lerp(root1, t), e = tipFn(t);
    for (let k = 0; k <= 4; k++) { const p = r.clone().lerp(e, k / 4); list.pos.push(p.x, p.y, p.z); list.info.push(u, 1, 1); }
  }
  for (let i = 0; i < N; i++) for (let k = 0; k < 4; k++) { const a = start + i * 5 + k, b = a + 5; list.idx.push(a, b, a + 1, a + 1, b, b + 1); }
}
function eyes(list, u, x, y, z, r) {
  [-1, 1].forEach((s) => {
    const g = new THREE.SphereGeometry(r, 12, 8); g.translate(s * x, y, z);
    const p = g.attributes.position, st = list.pos.length / 3;
    for (let i = 0; i < p.count; i++) { list.pos.push(p.getX(i), p.getY(i), p.getZ(i)); list.info.push(u, 2, 1); }
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) list.idx.push(st + ix[i]);
  });
}
function build(list) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(list.pos, 3));
  geo.setAttribute("aInfo", new THREE.Float32BufferAttribute(list.info, 3));
  geo.setIndex(list.idx); geo.computeVertexNormals();
  return geo;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- species ----------
export function dolphin(uniforms) {
  const L = 4.2;
  const list = loft({ L, NU: 72,
    H: (u) => 0.08 + 0.42 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.9) * (u > 0.86 ? 1 - (u - 0.86) * 3.5 : 1),
    W: (u) => (0.06 + 0.36 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 1.0)) * (u > 0.86 ? 1 - (u - 0.86) * 3.8 : 1),
    arch: (u) => -0.1 * Math.pow(Math.max(0, u - 0.88) * 8, 2) * 0.1 + 0.05 * Math.sin(Math.PI * u) });
  const z = (u) => (u - 0.5) * L;
  curveFin(list, V(0, 0.38, z(0.62)), V(0, 0.32, z(0.42)), (t) => V(0, 0.4 + 0.42 * Math.sin(Math.PI * t * 0.9) * (1 - t * 0.3), z(0.62) - t * 0.95 - 0.25 * Math.sin(Math.PI * t)), 0.52);   // falcate dorsal
  [-1, 1].forEach((s) => fin(list, V(s * 0.3, -0.18, z(0.72)), V(s * 0.3, -0.2, z(0.62)), V(s * 0.85, -0.4, z(0.6)), V(s * 0.8, -0.42, z(0.55)), 0.68));
  curveFin(list, V(-0.06, 0, z(0.02)), V(0.06, 0, z(0.02)), (t) => { const s2 = t * 2 - 1; return V(s2 * 0.75, 0, z(0.02) - 0.18 - 0.22 * Math.abs(s2) + 0.12 * Math.exp(-s2 * s2 * 40)); }, 0.0);
  eyes(list, 0.82, 0.24, 0.05, z(0.82), 0.035);
  const mat = material(uniforms, { a: 0x3d6f9a, b: 0xdfeaf2, style: "jelly", amp: 0.22, k: 0.6, beat: 3.0,
    pattern: `float cape = smoothstep(0.55, 0.75, vRest.y / max(0.001, vInfo.z) + 0.25 * sin(u * 9.0)); base = mix(base, uA * 0.55, cape * step(vInfo.y, 0.5));
              float smile = smoothstep(0.02, 0.0, abs(vRest.y + 0.02 - (u - 0.93) * 0.6)) * step(0.92, u); base *= 1.0 - smile * 0.6;` });
  const m = new THREE.Mesh(build(list), mat); m.rotation.x = 0; return m;
}

export function sailfish(uniforms) {
  const L = 3.6;
  const list = loft({ L, NU: 72,
    H: (u) => 0.03 + 0.26 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.02)), 0.8) * (u > 0.8 ? 1 - (u - 0.8) * 4.6 : 1),
    W: (u) => (0.02 + 0.12 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.02)), 0.9)) * (u > 0.8 ? 1 - (u - 0.8) * 4.6 : 1) });
  const z = (u) => (u - 0.5) * L;
  // bill: a long thin spear
  fin(list, V(0, 0.03, z(0.99)), V(0, -0.02, z(0.99)), V(0, 0.01, z(0.99) + 1.3), V(0, 0.0, z(0.99) + 1.3), 1.0, 4);
  // the sail: a tall ribbed fin running most of the back
  curveFin(list, V(0, 0.26, z(0.8)), V(0, 0.2, z(0.3)), (t) => V(0, 0.26 + 1.05 * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.12)) * (1 - 0.6 * t), z(0.8) - t * 1.9), 0.55, 24);
  curveFin(list, V(-0.04, 0, z(0.02)), V(0.04, 0, z(0.02)), (t) => { const s2 = t * 2 - 1; return V(0, s2 * 0.75, z(0.02) - 0.45 * Math.pow(Math.abs(s2), 1.3) - 0.05); }, 0.0);   // crescent tail
  [-1, 1].forEach((s) => fin(list, V(s * 0.1, -0.12, z(0.74)), V(s * 0.1, -0.12, z(0.68)), V(s * 0.45, -0.35, z(0.5)), V(s * 0.42, -0.36, z(0.46)), 0.7));
  eyes(list, 0.86, 0.11, 0.06, z(0.88), 0.04);
  const mat = material(uniforms, { a: 0x1c3fa8, b: 0xd8dee6, c: 0x6fd6ff, style: "felt", amp: 0.16, k: 0.55, beat: 4.0,
    pattern: `float bars = smoothstep(0.75, 0.95, sin(u * 70.0)) * smoothstep(-0.2, 0.3, vRest.y / max(0.001, vInfo.z)) * step(0.25, u) * step(u, 0.75);
              base = mix(base, uC * (1.2 + 0.4 * sin(uTime * 2.0)), bars * step(vInfo.y, 0.5));
              if (vInfo.y > 0.5 && vInfo.y < 1.5) base = mix(uA, uC, 0.25 + 0.25 * sin(vRest.z * 30.0));
              base = mix(base, vec3(0.6, 0.65, 0.72), smoothstep(-0.2, -0.6, vRest.y / max(0.001, vInfo.z)) * 0.6);` });
  return new THREE.Mesh(build(list), mat);
}

export function hammerhead(uniforms) {
  const L = 4.6;
  const list = loft({ L, NU: 72,
    H: (u) => (0.05 + 0.34 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.02)), 0.8)) * (u > 0.82 ? 0.75 : 1),
    W: (u) => (0.05 + 0.3 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.02)), 0.9)) * (u > 0.82 ? 0.8 : 1) });
  const z = (u) => (u - 0.5) * L;
  // the cephalofoil: a flat wing across the head with eyes at the tips
  const zh = z(0.95);
  curveFin(list, V(-0.08, 0.02, zh + 0.1), V(0.08, 0.02, zh + 0.1), (t) => { const s2 = t * 2 - 1; return V(s2 * 0.9, 0.0, zh + 0.12 - 0.35 * Math.abs(s2) * Math.abs(s2) - 0.04 * Math.exp(-s2 * s2 * 20)); }, 0.97, 24);
  curveFin(list, V(-0.08, -0.03, zh + 0.1), V(0.08, -0.03, zh + 0.1), (t) => { const s2 = t * 2 - 1; return V(s2 * 0.9, -0.04, zh + 0.12 - 0.35 * Math.abs(s2) * Math.abs(s2)); }, 0.97, 24);
  curveFin(list, V(0, 0.3, z(0.62)), V(0, 0.28, z(0.48)), (t) => V(0, 0.32 + 0.75 * Math.sin(Math.PI * t * 0.8), z(0.62) - t * 0.45 - 0.2 * t * t), 0.55);   // tall first dorsal
  curveFin(list, V(-0.05, 0.02, z(0.02)), V(0.05, 0.02, z(0.02)), (t) => { const s2 = t * 2 - 1; return V(0, s2 > 0 ? s2 * 0.9 : s2 * 0.45, z(0.02) - (s2 > 0 ? 0.6 : 0.25) * Math.abs(s2)); }, 0.0);   // heterocercal tail
  [-1, 1].forEach((s) => fin(list, V(s * 0.28, -0.2, z(0.66)), V(s * 0.28, -0.2, z(0.56)), V(s * 1.0, -0.45, z(0.42)), V(s * 0.95, -0.46, z(0.36)), 0.62));
  eyes(list, 0.97, 0.88, 0.0, zh - 0.25, 0.05);
  const mat = material(uniforms, { a: 0x5f6d7c, b: 0xeef1f3, style: "felt", amp: 0.2, k: 0.5, beat: 2.2,
    pattern: `float gills = smoothstep(0.06, 0.0, abs(fract(u * 70.0) - 0.5)) * step(0.74, u) * step(u, 0.8) * smoothstep(-0.4, 0.2, vRest.y / max(0.001, vInfo.z));
              base *= 1.0 - gills * 0.35;` });
  return new THREE.Mesh(build(list), mat);
}

export function whaleShark(uniforms) {
  const L = 7.5;
  const list = loft({ L, NU: 80, flatBelly: 0.7,
    H: (u) => 0.08 + 0.62 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(u, 0.85) * 1.02)), 0.75),
    W: (u) => (0.1 + 0.85 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(u, 0.85) * 1.02)), 0.8)) * (u > 0.85 ? 1 + (u - 0.85) * 0.8 : 1) });
  const z = (u) => (u - 0.5) * L;
  curveFin(list, V(0, 0.6, z(0.55)), V(0, 0.55, z(0.4)), (t) => V(0, 0.62 + 0.75 * Math.sin(Math.PI * t * 0.8), z(0.55) - t * 0.7 - 0.25 * t * t), 0.45);
  curveFin(list, V(-0.06, 0.02, z(0.02)), V(0.06, 0.02, z(0.02)), (t) => { const s2 = t * 2 - 1; return V(0, s2 * 1.2, z(0.02) - 0.75 * Math.pow(Math.abs(s2), 1.2) * (s2 > 0 ? 1.1 : 0.8)); }, 0.0, 20);
  [-1, 1].forEach((s) => fin(list, V(s * 0.75, -0.35, z(0.7)), V(s * 0.75, -0.35, z(0.58)), V(s * 2.0, -0.7, z(0.48)), V(s * 1.9, -0.72, z(0.42)), 0.62));
  eyes(list, 0.93, 0.92, 0.12, z(0.93), 0.05);
  const mat = material(uniforms, { a: 0x2c4a6b, b: 0xeeeae2, c: 0xf4f1e8, style: "felt", amp: 0.3, k: 0.5, beat: 1.4,
    pattern: `// columns of pale spots and pinstripes, denser on the head
              float r = vRest.y / max(0.001, vInfo.z);
              float cols = mix(18.0, 32.0, smoothstep(0.6, 0.95, u));
              vec2 q = vec2(u * cols, atan(vRest.y, vRest.x) * 3.0);
              q.y += floor(q.x) * 0.5;
              float spot = smoothstep(0.2, 0.12, length(fract(q) - 0.5));
              float stripe = smoothstep(0.035, 0.0, abs(fract(u * cols) - 0.5));
              float onBack = smoothstep(-0.1, 0.25, r);
              base = mix(base, uC, max(spot, stripe * 0.7) * onBack * step(vInfo.y, 0.5));
              float mouth = smoothstep(0.03, 0.0, abs(r + 0.15)) * step(0.97, u); base *= 1.0 - mouth * 0.7;` });
  return new THREE.Mesh(build(list), mat);
}

// Octopus: a jelly head with eight boneless arms that curl and sway, two rows of suckers drawn on the undersides
export function octopus(uniforms) {
  const g = new THREE.Group();
  const U = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uHue: { value: 0 } }]);
  U.uTime = uniforms.uTime; U.uHue = uniforms.uHue;
  const jellyFrag = /* glsl */ `
    uniform float uTime, uHue; varying vec3 vN, vV; varying vec2 vA;
    #include <fog_pars_fragment>
    void main() {
      vec3 n = normalize(vN), v = normalize(vV);
      float ndv = abs(dot(n, v)), fres = pow(1.0 - ndv, 2.0);
      vec3 deep = vec3(0.75, 0.12, 0.22), pale = vec3(1.0, 0.55, 0.55);
      vec3 col = mix(deep, pale, vA.y) * (0.35 + 0.35 * ndv) + vec3(1.0, 0.75, 0.8) * fres * 1.1;
      // suckers on the underside of the arms
      float sucker = vA.x > 0.0 ? smoothstep(0.3, 0.15, length(vec2(fract(vA.x * 22.0) - 0.5, (vA.y - 0.5) * 3.0))) * step(0.55, vA.y) : 0.0;
      col = mix(col, vec3(1.0, 0.85, 0.8), sucker * 0.7);
      // chromatophores
      vec3 Lt = normalize(vec3(0.3, 0.9, 0.4));
      col += vec3(1.0) * pow(max(dot(reflect(-Lt, n), v), 0.0), 60.0) * 0.6;
      gl_FragColor = vec4(col, 0.55 + fres * 0.4);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`;
  const vertCommon = /* glsl */ `
    uniform float uTime; varying vec3 vN, vV; varying vec2 vA;
    #include <fog_pars_vertex>`;
  const headMat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, fragmentShader: jellyFrag,
    vertexShader: vertCommon + `
      void main() {
        vec3 p = position; float b = 1.0 + 0.05 * sin(uTime * 1.2);
        p.xz *= b; p.y *= 2.0 - b;                                     // breathing mantle
        vA = vec2(0.0, clamp(0.5 - position.y * 0.6, 0.0, 1.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv; vec4 mvPosition = mv;
        #include <fog_vertex>
      }` });
  const headGeo = new THREE.SphereGeometry(1, 40, 28); headGeo.scale(0.95, 1.15, 1.0); headGeo.translate(0, 1.0, -0.25);
  g.add(new THREE.Mesh(headGeo, headMat));
  // arms: tubes along a curling spiral, animated in the vertex shader
  const armMat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, fragmentShader: jellyFrag,
    vertexShader: vertCommon + `
      attribute vec3 aArm;                 // (t along the arm 0 root → 1 tip, angle around the body, ring angle)
      void main() {
        float t = aArm.x, ang = aArm.y, ring = aArm.z;
        float curl = 2.2 + 1.2 * sin(uTime * 0.6 + ang * 1.7);
        float sway = sin(uTime * 1.3 - t * 5.0 + ang * 2.0) * 0.35 * t;
        float r = 0.45 + 2.6 * t;                                       // spreads out across the floor
        float a = ang + sway * 0.4;
        float lift = pow(t, 2.5) * curl * 0.35;
        vec3 c = vec3(cos(a) * r, 0.25 - 0.2 * t + lift * sin(t * 6.0 + uTime) * 0.4, sin(a) * r);
        vec3 out_ = normalize(vec3(cos(a), 0.0, sin(a)));
        float rad = 0.2 * (1.0 - 0.85 * t) + 0.015;
        vec3 side = normalize(cross(out_, vec3(0, 1, 0)));
        vec3 p = c + (side * cos(ring) + vec3(0, 1, 0) * sin(ring)) * rad;
        vA = vec2(t, 0.5 - 0.5 * sin(ring));                            // underside (sin(ring) < 0) is paler, with suckers
        vec3 nrm = side * cos(ring) + vec3(0, 1, 0) * sin(ring);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * nrm); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv; vec4 mvPosition = mv;
        #include <fog_vertex>
      }` });
  const SEG = 48, RING = 10, armPos = [], armAttr = [], armIdx = [];
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * TAU + 0.2, start = armPos.length / 3;
    for (let i = 0; i <= SEG; i++) for (let j = 0; j <= RING; j++) { armPos.push(0, 0, 0); armAttr.push(i / SEG, ang, (j / RING) * TAU); }
    for (let i = 0; i < SEG; i++) for (let j = 0; j < RING; j++) { const a = start + i * (RING + 1) + j, b = a + RING + 1; armIdx.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const armGeo = new THREE.BufferGeometry();
  armGeo.setAttribute("position", new THREE.Float32BufferAttribute(armPos, 3));
  armGeo.setAttribute("aArm", new THREE.Float32BufferAttribute(armAttr, 3));
  armGeo.setIndex(armIdx);
  const arms = new THREE.Mesh(armGeo, armMat); arms.frustumCulled = false; g.add(arms);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf2c24a });
  [-1, 1].forEach((s) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), eyeMat); e.position.set(s * 0.5, 0.75, 0.55); g.add(e);
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x0a0a0a })); pupil.position.set(s * 0.52, 0.75, 0.7); g.add(pupil);
  });
  return g;
}

// a better jellyfish: domed bell with radial canals and a frilled rim, four ruffled oral arms, long fine tentacles
export function jellyfishV2(uniforms, hueOffset = 0) {
  const g = new THREE.Group();
  const U = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uHue: { value: 0 }, uOff: { value: hueOffset } }]);
  U.uTime = uniforms.uTime; U.uHue = uniforms.uHue;
  const pulse = /* glsl */ `float pulse() { float c = fract(uTime * 0.32 + uOff); return pow(sin(c * 3.14159), 3.0); }`;
  const fragJ = /* glsl */ `
    uniform float uTime, uHue, uOff; varying vec3 vN, vV, vP; varying float vT;
    #include <fog_pars_fragment>
    ${HSV}
    void main() {
      vec3 n = normalize(vN), v = normalize(vV);
      float fres = pow(1.0 - abs(dot(n, v)), 1.8);
      float ang = atan(vP.z, vP.x);
      float canals = pow(abs(sin(ang * 4.0)), 60.0) * (1.0 - vT);
      float rim = smoothstep(0.75, 1.0, vT);
      vec3 c = hsv(fract(uHue + uOff), 0.45, 1.0);
      vec3 col = c * (0.05 + fres * 1.1 + canals * 0.6 + rim * 0.5) + vec3(1.0, 0.95, 0.98) * smoothstep(0.3, 0.0, vT) * 0.08;
      gl_FragColor = vec4(col, 0.06 + fres * 0.6 + canals * 0.25 + rim * 0.2);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`;
  const bellMat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: true, fragmentShader: fragJ,
    vertexShader: /* glsl */ `
      uniform float uTime, uOff; varying vec3 vN, vV, vP; varying float vT;
      #include <fog_pars_vertex>
      ${pulse}
      void main() {
        vec3 p = position; float k = pulse();
        float t = 1.0 - clamp(p.y, 0.0, 1.0);                          // 0 top of the bell → 1 margin
        p.xz *= 1.0 - 0.22 * k * t * t;
        p.y *= 1.0 + 0.12 * k;
        p.xz *= 1.0 + 0.035 * sin(atan(p.z, p.x) * 24.0) * smoothstep(0.7, 1.0, t);   // frilled margin
        vP = position; vT = t;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv; vec4 mvPosition = mv;
        #include <fog_vertex>
      }` });
  const bellGeo = new THREE.SphereGeometry(1, 72, 36, 0, TAU, 0, Math.PI * 0.55); bellGeo.scale(1, 0.8, 1);
  g.add(new THREE.Mesh(bellGeo, bellMat));
  // oral arms and tentacles: ribbons/lines that trail and pulse with the bell
  const strandMat = (width, wig) => new THREE.ShaderMaterial({ uniforms: { ...U, uW: { value: wig } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    vertexShader: /* glsl */ `
      uniform float uTime, uOff, uW; attribute vec2 aS; varying float vT;
      #include <fog_pars_vertex>
      ${pulse}
      void main() {
        vec3 p = position; float t = aS.x, k = pulse();
        p.xz *= 1.0 - 0.2 * k * (1.0 - t);
        p.x += sin(t * 8.0 - uTime * 1.4 + aS.y * 1.7) * t * uW;
        p.z += cos(t * 7.0 - uTime * 1.1 + aS.y * 2.3) * t * uW;
        p.y += k * t * 0.4;
        vT = t; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vec4 mvPosition = mv;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uHue, uOff; varying float vT;
      #include <fog_pars_fragment>
      ${HSV}
      void main() { gl_FragColor = vec4(hsv(fract(uHue + uOff + vT * 0.1), 0.45, 1.0) * ${width.toFixed(2)}, (1.0 - vT) * 0.7);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }` });
  const strands = (count, len, radius, wig, width, ruffle) => {
    const SEG = 50, pos = [], s = [];
    for (let k = 0; k < count; k++) {
      const a = (k / count) * TAU;
      for (let j = 0; j < SEG; j++) for (const jj of [j, j + 1]) {
        const t = jj / SEG, rr = radius + (ruffle ? Math.sin(t * 40) * 0.06 * (1 - t) : 0);
        pos.push(Math.cos(a) * rr, -t * len, Math.sin(a) * rr); s.push(t, k);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("aS", new THREE.Float32BufferAttribute(s, 2));
    return new THREE.LineSegments(geo, strandMat(width, wig));
  };
  g.add(strands(40, 9, 0.95, 0.9, 0.5, false));    // fine marginal tentacles
  for (let r = 0; r < 4; r++) { const arm = strands(10, 4.2, 0.12 + r * 0.02, 0.4, 1.2, true); arm.rotation.y = r * 0.4; g.add(arm); }   // ruffled oral arms
  return g;
}
