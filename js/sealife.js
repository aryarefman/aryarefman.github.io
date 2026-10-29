// Sea life for the backdrop, built the way the reference "material studies" build creatures: smooth bodies swept
// along a spine from a cross-section profile, skin patterns painted from rest-space coordinates, and swimming as a
// travelling bend wave from head to tail whose amplitude grows toward the tail.
import * as THREE from "three";

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------------------------
// Fish. Local frame: nose at +z, length 1, back at +y.
// Attributes: aInfo = (u along body 0 tail→1 nose, ny = vertical position on the section -1..1, part, k)
//   part 0 body · 1 fin (k = position across the fin, for fin rays) · 2 eye (k = radius from the pupil centre)
// ---------------------------------------------------------------------------------------------------------------
export function fishGeometry(sp, hi) {
  const NU = hi ? 40 : 26, NV = hi ? 22 : 14;
  const pos = [], info = [], idx = [];
  const peak = Math.log(0.5) / Math.log(sp.peakAt);                 // where the body is deepest
  const H = (u) => sp.depth * Math.max(sp.peduncle, Math.pow(Math.sin(Math.PI * Math.pow(Math.min(0.999, Math.max(0.001, u)), peak)), sp.blunt));
  const Wd = (u) => H(u) * sp.aspect * (0.85 + 0.25 * u);
  const Z = (u) => -0.5 + u;
  // body: a smooth lofted surface
  for (let i = 0; i <= NU; i++) {
    const u = 0.02 + (i / NU) * 0.98, h = H(u), w = Wd(u), z = Z(u);
    for (let j = 0; j <= NV; j++) {
      const v = (j / NV) * TAU, sv = Math.sin(v), cv = Math.cos(v);
      const y = h * sv * (sv < 0 ? sp.bellyScale : 1) + sp.camber * h;
      pos.push(w * cv * (1 - 0.15 * sv * sv), y, z);
      info.push(u, sv, 0, 0);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * (NV + 1) + j, b = a + NV + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const base = pos.length / 3;
  // fins: flat grids in the yz plane (x = 0) or angled pectorals
  const fin = (grid, uAt) => {
    const start = pos.length / 3, rows = grid.length, cols = grid[0].length;
    grid.forEach((row, r) => row.forEach(([x, y, z], c) => { pos.push(x, y, z); info.push(uAt(z), Math.sign(y) || 1, 1, c / (cols - 1)); }));
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = start + r * cols + c, b = a + cols;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  };
  const uOfZ = (z) => z + 0.5;
  const pedH = H(0.02);
  // caudal fin: forked, lobes longer than the notch
  {
    const rows = [], NT = 10, NS = 14;
    for (let t = 0; t <= NT; t++) {
      const row = [];
      for (let k = 0; k <= NS; k++) {
        const s2 = k / NS * 2 - 1, tt = t / NT;
        const reach = sp.tail * (sp.fork ? 0.5 + 0.5 * Math.pow(Math.abs(s2), 0.9) : 0.8 + 0.2 * Math.cos(s2 * 1.2));
        row.push([0, s2 * (pedH * 0.9 + (sp.tailSpan - pedH * 0.9) * Math.pow(tt, 0.8)), -0.48 - reach * tt]);
      }
      rows.push(row);
    }
    fin(rows, uOfZ);
  }
  // dorsal fin
  {
    const rows = [], N = 10, M = 6, z0 = sp.dorsal[0] - 0.5, z1 = sp.dorsal[1] - 0.5;
    for (let m = 0; m <= M; m++) {
      const row = [];
      for (let n = 0; n <= N; n++) {
        const t = n / N, z = z0 + (z1 - z0) * t, hgt = sp.dorsalH * Math.pow(1 - t, 0.6) * Math.sin(Math.PI * Math.min(1, t * 1.6 + 0.12));
        row.push([0, H(z + 0.5) * 0.92 + hgt * (m / M), z - (m / M) * 0.05 * (1 - t)]);
      }
      rows.push(row);
    }
    fin(rows, uOfZ);
  }
  // anal fin
  {
    const rows = [], N = 8, M = 5, z0 = 0.16 - 0.5, z1 = 0.32 - 0.5;
    for (let m = 0; m <= M; m++) {
      const row = [];
      for (let n = 0; n <= N; n++) { const t = n / N, z = z0 + (z1 - z0) * t; row.push([0, -H(z + 0.5) * sp.bellyScale * 0.92 - sp.dorsalH * 0.5 * Math.sin(Math.PI * t) * (m / M), z - (m / M) * 0.03]); }
      rows.push(row);
    }
    fin(rows, uOfZ);
  }
  // pectoral fins: swept back and down from behind the gill
  [-1, 1].forEach((sd) => {
    const rows = [], N = 6, M = 5, u0 = 0.72;
    for (let m = 0; m <= M; m++) {
      const row = [];
      for (let n = 0; n <= N; n++) {
        const t = n / N, mm = m / M, z = Z(u0) - 0.02 * t - 0.16 * mm * (0.6 + 0.4 * t);
        row.push([sd * (Wd(u0) * 0.9 + 0.07 * mm), -H(u0) * (0.25 + 0.15 * t) - 0.05 * mm, z]);
      }
      rows.push(row);
    }
    fin(rows, uOfZ);
  });
  // eyes: shallow domes on each side
  [-1, 1].forEach((sd) => {
    const u = sp.eyeAt, cx = sd * Wd(u) * 0.93, cy = H(u) * 0.22 + sp.camber * H(u), cz = Z(u), R = sp.eye * sp.depth;
    const start = pos.length / 3, RING = 16, RAD = 5;
    pos.push(cx + sd * R * 0.35, cy, cz); info.push(u, 0.2, 2, 0);
    for (let ri = 1; ri <= RAD; ri++) for (let k = 0; k < RING; k++) {
      const rr = ri / RAD, a = (k / RING) * TAU;
      pos.push(cx + sd * R * 0.35 * Math.cos(rr * Math.PI / 2), cy + Math.cos(a) * R * rr, cz + Math.sin(a) * R * rr);
      info.push(u, 0.2, 2, rr);
    }
    for (let k = 0; k < RING; k++) idx.push(start, start + 1 + k, start + 1 + ((k + 1) % RING));
    for (let ri = 1; ri < RAD; ri++) for (let k = 0; k < RING; k++) {
      const a = start + 1 + (ri - 1) * RING + k, b = start + 1 + (ri - 1) * RING + ((k + 1) % RING), c = a + RING, d = b + RING;
      idx.push(a, c, b, b, c, d);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aInfo", new THREE.Float32BufferAttribute(info, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const glsl3 = (c) => `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`;

function fishMaterial(sp, uniforms) {
  const C = (h) => new THREE.Color(h);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: sp.rough ?? 0.3, metalness: sp.metal ?? 0.35, side: THREE.DoubleSide,
    iridescence: sp.irid ?? 0.6, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 620],
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>
        uniform float uTime; attribute vec4 aInfo; attribute float aPhase; varying vec4 vInfo; varying vec3 vRest;
        float fishWave(float z, out float slope) {
          float sN = 0.5 - z;                                         // 0 at the nose, 1 at the peduncle, >1 on the tail
          float env = ${sp.headSway.toFixed(3)} + (1.0 - ${sp.headSway.toFixed(3)}) * sN * sN;
          float ph = 6.2831 * ${sp.waveK.toFixed(3)} * sN - ${sp.beat.toFixed(3)} * uTime + aPhase;
          float amp = ${sp.amp.toFixed(3)};
          slope = -amp * (2.0 * (1.0 - ${sp.headSway.toFixed(3)}) * sN * sin(ph) + env * cos(ph) * 6.2831 * ${sp.waveK.toFixed(3)});
          return amp * env * sin(ph);
        }`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
        float fSlope; fishWave(position.z, fSlope);
        objectNormal = normalize(vec3(objectNormal.x, objectNormal.y, objectNormal.z - fSlope * objectNormal.x));`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        float fS2; transformed.x += fishWave(position.z, fS2);
        if (aInfo.z > 0.5 && aInfo.z < 1.5 && abs(position.x) > 0.02) transformed.y += sin(uTime * 5.0 + aPhase) * 0.02 * aInfo.w;   // pectorals flutter
        vInfo = aInfo; vRest = position;`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec4 vInfo; varying vec3 vRest;
        float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float u = vInfo.x, ny = vInfo.y, part = vInfo.z, k = vInfo.w;
        vec3 col;
        if (part < 0.5) {
          // counter-shading: dark back, bright flank, white belly
          float back = smoothstep(0.0, 0.7, ny), belly = smoothstep(-0.1, -0.7, ny);
          col = mix(${glsl3(C(sp.flank))}, ${glsl3(C(sp.back))}, back);
          col = mix(col, ${glsl3(C(sp.belly))}, belly);
          col += ${glsl3(C(sp.stripe))} * exp(-pow((ny - 0.22) / 0.07, 2.0)) * 0.55 * smoothstep(0.1, 0.3, u);   // iridescent band
          // overlapping scales: offset rows of rounded cells
          vec2 sc = vec2(u * ${sp.scalesU.toFixed(1)}, ny * ${sp.scalesV.toFixed(1)});
          sc.x += floor(sc.y) * 0.5;
          vec2 f = fract(sc) - vec2(0.5, 0.35);
          float rim = smoothstep(0.28, 0.5, length(f * vec2(1.0, 1.4)));
          col *= 1.0 - rim * 0.16;
          // spots along the upper flank
          float spot = smoothstep(0.075, 0.03, length(vec2((fract(u * ${sp.spotsN.toFixed(1)}) - 0.5) / ${sp.spotsN.toFixed(1)} * 9.0, (ny - 0.32) * 2.2)));
          col = mix(col, ${glsl3(C(sp.back))} * 0.5, spot * ${sp.spots.toFixed(2)} * step(0.42, u) * step(u, 0.82));
          // operculum (gill cover) edge and a darker snout
          col *= 1.0 - smoothstep(0.012, 0.0, abs(u - (${(sp.eyeAt - 0.09).toFixed(3)} - 0.04 * ny * ny))) * 0.5;
          col = mix(col, ${glsl3(C(sp.back))} * 0.8, smoothstep(0.93, 1.0, u) * 0.5);
          // photophores (lanternfish): rows of glowing dots along the belly
          ${sp.photo ? `float row = min(abs(ny + 0.55), abs(ny + 0.8));
          float dots = smoothstep(0.08, 0.0, row) * smoothstep(0.3, 0.0, abs(fract(u * 22.0) - 0.5)) * step(0.15, u) * step(u, 0.85);
          col += ${glsl3(C(sp.photo))} * dots * 2.5;` : ""}
        } else if (part < 1.5) {
          // fins: translucent membrane with darker rays
          float rays = smoothstep(0.65, 1.0, abs(sin(k * 40.0)));
          col = ${glsl3(C(sp.fin))} * (0.75 + 0.25 * rays);
        } else {
          // eye: black pupil, metallic iris ring, dark rim
          col = mix(vec3(0.01), ${glsl3(C(sp.iris))}, smoothstep(0.42, 0.5, k));
          col = mix(col, vec3(0.05), smoothstep(0.85, 0.95, k));
        }
        diffuseColor.rgb = col;`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        if (vInfo.z > 1.5) roughnessFactor = 0.04;`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        if (vInfo.z > 0.5 && vInfo.z < 1.5) totalEmissiveRadiance += ${glsl3(C(sp.fin))} * 0.12;    // light through the fins
        ${sp.photo ? `{ float row = min(abs(vInfo.y + 0.55), abs(vInfo.y + 0.8));
          float dots = smoothstep(0.08, 0.0, row) * smoothstep(0.3, 0.0, abs(fract(vInfo.x * 22.0) - 0.5)) * step(0.15, vInfo.x) * step(vInfo.x, 0.85) * step(vInfo.z, 0.5);
          totalEmissiveRadiance += ${glsl3(C(sp.photo))} * dots * (2.0 + 0.8 * sin(uTime * 3.0 + vInfo.x * 20.0)); }` : ""}`);
    if (sp.photo) sh.fragmentShader = sh.fragmentShader.replace("varying vec4 vInfo; varying vec3 vRest;", "varying vec4 vInfo; varying vec3 vRest; uniform float uTime;");
  };
  return mat;
}

export const SPECIES = {
  sardine: {
    depth: 0.115, aspect: 0.55, peakAt: 0.6, blunt: 0.8, peduncle: 0.12, bellyScale: 1.0, camber: 0.02,
    tail: 0.24, tailSpan: 0.13, fork: true, dorsal: [0.42, 0.56], dorsalH: 0.07, eyeAt: 0.88, eye: 0.36,
    back: 0x1b4f72, flank: 0xc8d6de, belly: 0xf3f6f7, stripe: 0x6fd6ff, fin: 0x9fb8c4, iris: 0xd8d0b0,
    scalesU: 34, scalesV: 7, spots: 0.9, spotsN: 6, amp: 0.05, waveK: 0.85, beat: 12, headSway: 0.06,
  },
  lantern: {
    depth: 0.15, aspect: 0.5, peakAt: 0.68, blunt: 0.7, peduncle: 0.14, bellyScale: 1.0, camber: 0.0,
    tail: 0.22, tailSpan: 0.14, fork: true, dorsal: [0.44, 0.58], dorsalH: 0.06, eyeAt: 0.86, eye: 0.62,
    back: 0x0a0f18, flank: 0x2c3846, belly: 0x5a6672, stripe: 0x3a6a8a, fin: 0x26323e, iris: 0x7fe8ff,
    scalesU: 26, scalesV: 6, spots: 0.0, spotsN: 6, amp: 0.045, waveK: 0.8, beat: 7, headSway: 0.06, photo: 0x7fe8ff,
    metal: 0.25, irid: 0.8, rough: 0.35,
  },
};

// A school following one smooth leader path; every fish faces where it is going.
export function fishSchool(uniforms, count, species, { path, spread = [10, 3, 6], size = [0.8, 1.2], hi = true, seed = 31 } = {}) {
  const sp = SPECIES[species];
  const geo = fishGeometry(sp, hi);
  const phases = new Float32Array(count);
  const mesh = new THREE.InstancedMesh(geo, fishMaterial(sp, uniforms), count);
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const fish = Array.from({ length: count }, (_, i) => {
    phases[i] = rnd() * 50;
    return { off: new THREE.Vector3((rnd() - 0.5) * spread[0], (rnd() - 0.5) * spread[1], (rnd() - 0.5) * spread[2]), ph: rnd() * TAU, s: size[0] + rnd() * (size[1] - size[0]), lag: rnd() * 1.2 };
  });
  geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
  const dummy = new THREE.Object3D(), here = new THREE.Vector3(), ahead = new THREE.Vector3(), wob = new THREE.Vector3();
  const place = (f, t, out) => out.copy(path(t - f.lag)).add(f.off).add(wob.set(Math.sin(t * 0.7 + f.ph) * 0.5, Math.sin(t * 0.9 + f.ph) * 0.25, Math.cos(t * 0.6 + f.ph) * 0.5));
  mesh.userData.update = (t) => {
    fish.forEach((f, i) => {
      place(f, t, here); place(f, t + 0.2, ahead);
      dummy.position.copy(here); dummy.lookAt(ahead); dummy.scale.setScalar(f.s);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------------------------------------------------------
// Green sea turtle. Local frame: head at +z.
// ---------------------------------------------------------------------------------------------------------------
const VORONOI = /* glsl */ `
  vec2 vh2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
  // returns (edge distance, cell id hash, distance to the cell centre)
  vec3 voronoi(vec2 p) {
    vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0; vec2 best = vec2(0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(x, y), r = o + vh2(i + o) - f; float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; best = i + o; } else if (d < d2) d2 = d;
    }
    return vec3(sqrt(d2) - sqrt(d1), fract(sin(dot(best, vec2(41.3, 289.1))) * 1e4), sqrt(d1));
  }`;

function carapaceGeometry() {
  // a domed teardrop: polar grid (r, θ) → outline, height from a dome with a gentle midline ridge
  const NR = 26, NT = 72, pos = [], uv = [], idx = [];
  const outline = (th) => {
    const c = Math.cos(th), s = Math.sin(th);                   // θ = 0 → head (+z)
    const len = c > 0 ? 0.62 : 0.72, wid = 0.55 * (1 - 0.18 * c);
    const serr = c < -0.2 ? 0.025 * Math.pow(Math.abs(Math.sin(th * 13)), 3) * (-c) : 0;   // marginal scutes serrate the rear
    return [s * wid * (1 + serr), c * len * (1 + serr)];
  };
  for (let i = 0; i <= NR; i++) for (let j = 0; j <= NT; j++) {
    const r = i / NR, th = (j / NT) * TAU, [ox, oz] = outline(th);
    const x = ox * r, z = oz * r, dome = 0.27 * Math.pow(1 - r * r, 0.55) + 0.03 * Math.exp(-Math.pow(x / 0.06, 2)) * (1 - r);
    pos.push(x, dome, z); uv.push(x, z);
  }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NT; j++) {
    const a = i * (NT + 1) + j, b = a + NT + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("rest", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}

function skinMaterial(base, plates, scale) {
  const m = new THREE.MeshPhysicalMaterial({ color: base, roughness: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.35, sheen: 0.3, sheenColor: new THREE.Color(0x8a9a7a) });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSk;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvSk = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vSk;\n" + VORONOI)
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec3 vo = voronoi(vSk.xz * ${scale.toFixed(1)} + vSk.y * 3.0);
        vec3 plate = mix(${glsl3(new THREE.Color(plates))} * (0.6 + 0.7 * vo.y), diffuseColor.rgb, 0.3);
        float seam = smoothstep(0.0, 0.05, vo.x);
        diffuseColor.rgb = mix(vec3(0.13, 0.12, 0.06), plate, seam);          // paler skin between the dark scales`);
  };
  return m;
}

export function seaTurtle() {
  const g = new THREE.Group();
  const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, clearcoat: 0.45, clearcoatRoughness: 0.35 });
  shellMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 rest; varying vec2 vRest;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvRest = rest;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
      varying vec2 vRest;
      // scute layout of a green turtle: 5 vertebral, 4 pairs of costal, marginal ring
      const int NS = 13;
      vec2 seeds[13];
      void initSeeds() {
        seeds[0] = vec2(0.0, 0.42); seeds[1] = vec2(0.0, 0.18); seeds[2] = vec2(0.0, -0.06); seeds[3] = vec2(0.0, -0.3); seeds[4] = vec2(0.0, -0.52);
        seeds[5] = vec2(0.28, 0.3); seeds[6] = vec2(0.32, 0.06); seeds[7] = vec2(0.3, -0.18); seeds[8] = vec2(0.24, -0.42);
        seeds[9] = vec2(-0.28, 0.3); seeds[10] = vec2(-0.32, 0.06); seeds[11] = vec2(-0.3, -0.18); seeds[12] = vec2(-0.24, -0.42);
      }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        initSeeds();
        vec2 p = vRest; float d1 = 9.0, d2 = 9.0; vec2 c1 = vec2(0);
        for (int i = 0; i < NS; i++) { vec2 q = seeds[i] * vec2(1.0, 1.0); float d = length((p - q) * vec2(1.0, 0.85)); if (d < d1) { d2 = d1; d1 = d; c1 = q; } else if (d < d2) d2 = d; }
        float rr = length(p / vec2(0.55, 0.68));
        bool marginal = rr > 0.86;
        float seam = marginal ? smoothstep(0.0, 0.02, abs(rr - 0.86)) * smoothstep(0.0, 0.04, abs(sin(atan(p.x, p.y) * 13.0))) : smoothstep(0.0, 0.025, d2 - d1);
        vec2 rel = p - c1; float ang = atan(rel.y, rel.x);
        // tortoiseshell: rays radiating from each scute centre, amber to dark olive
        float wob = sin(ang * 3.0 + length(rel) * 9.0) * 1.4 + sin(rel.x * 31.0 + rel.y * 17.0) * 0.4;
        float rays = 0.5 + 0.5 * sin(ang * 6.0 + wob);
        float blotch = 0.5 + 0.5 * sin(rel.x * 23.0 + 3.1) * sin(rel.y * 19.0 + 1.7);
        vec3 amber = vec3(0.2, 0.075, 0.012), olive = vec3(0.028, 0.018, 0.005), gold = vec3(0.4, 0.2, 0.035);   // linear colour
        vec3 col = mix(olive, amber, smoothstep(0.25, 0.85, rays * 0.7 + blotch * 0.4) * smoothstep(0.02, 0.16, length(rel)));
        col = mix(col, gold, pow(rays, 8.0) * 0.35);
        if (marginal) col = mix(olive, amber, 0.35 + 0.3 * sin(atan(p.x, p.y) * 26.0) + 0.2 * sin(atan(p.x, p.y) * 61.0));
        diffuseColor.rgb = mix(vec3(0.008, 0.005, 0.002), col, seam);`);
  };
  const shell = new THREE.Mesh(carapaceGeometry(), shellMat); shell.castShadow = true; g.add(shell);
  const plastron = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, TAU, Math.PI / 2, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xcdb882, roughness: 0.55, clearcoat: 0.2 }));
  plastron.scale.set(0.5, 0.08, 0.62); g.add(plastron);

  const skin = skinMaterial(0x5d6a4e, 0x4a3a22, 10);
  // head: an elongated sphere with a blunt beak, slightly flattened underneath
  const headGeo = new THREE.SphereGeometry(1, 40, 28);
  { const p = headGeo.attributes.position; for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y < 0) y *= 0.75; if (z > 0.3) { y -= (z - 0.3) * 0.25; x *= 1 - (z - 0.3) * 0.35; } p.setXYZ(i, x, y, z); } headGeo.computeVertexNormals(); }
  const head = new THREE.Mesh(headGeo, skinMaterial(0x6a7a58, 0x3f2f1c, 6)); head.scale.set(0.15, 0.13, 0.22); head.position.set(0, 0.03, 0.82); g.add(head);
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.18, 8, 20), skin); neck.rotation.x = Math.PI / 2; neck.position.set(0, 0.02, 0.62); g.add(neck);
  [-1, 1].forEach((s) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshPhysicalMaterial({ color: 0x1a120a, roughness: 0.05, clearcoat: 1 }));
    eye.position.set(s * 0.12, 0.07, 0.9); g.add(eye);
  });
  // flippers: thin paddles shaped from flattened, swept spheres
  const flipperGeo = (len, wid, sweep) => {
    const geo = new THREE.SphereGeometry(1, 36, 16);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = (x + 1) / 2;                                         // 0 root → 1 tip
      const w = wid * (1 - 0.65 * t * t) * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, t + 0.25)));
      p.setXYZ(i, t * len, y * 0.035 * (1 - 0.7 * t), z * w - sweep * t * t);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const flippers = [];
  [[1, 0.36, 0.7, 0.18, 0.28, true], [-1, 0.36, 0.7, 0.18, 0.28, true], [1, -0.5, 0.3, 0.12, 0.05, false], [-1, -0.5, 0.3, 0.12, 0.05, false]].forEach(([s, z, len, wid, sweep, front]) => {
    const pv = new THREE.Group(); pv.position.set(s * 0.42, 0.02, z); g.add(pv);
    const f = new THREE.Mesh(flipperGeo(len, wid, sweep), skin); f.scale.x = s; f.castShadow = true; pv.add(f);
    flippers.push({ pv, s, front });
  });
  g.userData.update = (t) => {
    // underwater flight: front flippers sweep down and back, feathering on the recovery
    const st = Math.sin(t * 1.3), co = Math.cos(t * 1.3);
    flippers.forEach(({ pv, s, front }) => {
      if (front) { pv.rotation.set(co * 0.35, s * -0.35 * co, s * (0.35 - 0.65 * st)); }
      else { pv.rotation.set(0, s * (0.3 + 0.15 * Math.sin(t * 1.3 + 1)), s * 0.15 * st); }
    });
    head.rotation.set(Math.sin(t * 0.6) * 0.06, Math.sin(t * 0.4) * 0.15, 0);
  };
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Humpback anglerfish (Melanocetus): a globular black body, a huge upturned mouth of glassy fangs, a lure.
// ---------------------------------------------------------------------------------------------------------------
export function anglerfish() {
  const g = new THREE.Group();
  const skin = new THREE.MeshPhysicalMaterial({ color: 0x1c1513, roughness: 0.85, clearcoat: 0.08, sheen: 0.4, sheenColor: new THREE.Color(0x3a2a30), envMapIntensity: 0.25 });
  skin.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vAP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvAP = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vAP;\n" + VORONOI)
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec3 vo = voronoi(vAP.xy * 7.0 + vAP.z * 4.0);
        float mott = 0.6 + 0.5 * vo.y;
        diffuseColor.rgb *= mott * (0.85 + 0.3 * smoothstep(0.0, 0.08, vo.x));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.26, 0.3), smoothstep(0.1, -0.6, vAP.y) * 0.4);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        { vec3 vo2 = voronoi(vAP.xy * 22.0 + vAP.z * 9.0); normal = normalize(normal + (vo2.y - 0.5) * 0.25 * vec3(1.0, 1.0, 0.0)); }   // warty skin`);
  };
  // body: a lathe of a teardrop laid along z, mouth end (+z) blunt and tall
  // body: a lathe profile laid along z, left open at the front (the mouth); the lower jaw is pushed forward
  const R = (t) => 0.18 + 0.82 * Math.sin(Math.PI * t * 0.85);              // t: 0 tail → 1 the open mouth rim
  const prof = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40; prof.push(new THREE.Vector2(R(t), t * 2.0 - 1.0)); }
  const deform = (v) => {                                                   // squash and underbite, shared by body and gape
    v.x *= 0.85; v.y *= 0.95;
    const f = THREE.MathUtils.smoothstep(v.z, 0.45, 1.0);
    if (v.y < 0) v.z += f * 0.32 * (-v.y);                                  // lower jaw juts forward
    else v.z -= f * 0.1 * v.y;                                             // upper lip sits back
    v.y += f * 0.12 * (v.y < 0 ? 1 : 0.4);                                  // the gape tilts upward
    return v;
  };
  const bodyGeo = new THREE.LatheGeometry(prof, 72); bodyGeo.rotateX(Math.PI / 2);
  { const pp = bodyGeo.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < pp.count; i++) { deform(v.fromBufferAttribute(pp, i)); pp.setXYZ(i, v.x, v.y, v.z); } bodyGeo.computeVertexNormals(); }
  const body = new THREE.Mesh(bodyGeo, skin); g.add(body);
  // the gape: a deep throat cupped behind the rim, dark red-black inside
  const rim = [];
  for (let k = 0; k <= 72; k++) { const a2 = (k / 72) * Math.PI * 2; rim.push(deform(new THREE.Vector3(Math.cos(a2) * R(1), Math.sin(a2) * R(1), 1.0))); }
  const throatGeo = new THREE.BufferGeometry(), tp = [];
  const back = new THREE.Vector3(0, -0.05, 0.35);
  for (let k = 0; k < 72; k++) {
    const p0 = rim[k], p1 = rim[k + 1], q0 = p0.clone().lerp(back, 0.55), q1 = p1.clone().lerp(back, 0.55);
    tp.push(...p0.toArray(), ...q0.toArray(), ...p1.toArray(), ...p1.toArray(), ...q0.toArray(), ...q1.toArray());
    tp.push(...q0.toArray(), ...back.toArray(), ...q1.toArray());
  }
  throatGeo.setAttribute("position", new THREE.Float32BufferAttribute(tp, 3)); throatGeo.computeVertexNormals();
  g.add(new THREE.Mesh(throatGeo, new THREE.MeshStandardMaterial({ color: 0x1a0508, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x120206 })));
  const lip = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 96, 0.035, 8, true), skin); g.add(lip);
  // fangs: long glassy needles on the lower rim, shorter ones above, all curving inward
  const toothMat = new THREE.MeshPhysicalMaterial({ color: 0xf2efe6, roughness: 0.1, transparent: true, opacity: 0.9, clearcoat: 1, emissive: 0x1a1a18 });
  const fang = (len) => {
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, len * 0.65, 0.03), new THREE.Vector3(0, len, -len * 0.4));
    const geo = new THREE.TubeGeometry(c, 12, 0.026, 6), pp = geo.attributes.position;
    for (let i = 0; i < pp.count; i++) { const y = Math.min(1, Math.max(0, pp.getY(i) / len)); pp.setX(i, pp.getX(i) * (1 - y * 0.92)); }
    geo.computeVertexNormals(); return geo;
  };
  const teeth = new THREE.Group(); g.add(teeth);
  const centre = rim.reduce((acc, v) => acc.add(v), new THREE.Vector3()).multiplyScalar(1 / rim.length);
  for (let k = 0; k < 72; k += 4) {
    const v = rim[k], lower = v.y < centre.y, len = (lower ? 0.34 : 0.22) * (0.65 + 0.7 * Math.abs(Math.sin(k * 1.7)));
    if (Math.abs(v.y - centre.y) < 0.12) continue;                         // no teeth at the corners of the mouth
    const t = new THREE.Mesh(fang(len), toothMat);
    t.position.copy(v);
    const inward = centre.clone().sub(v).normalize();
    t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), inward.clone().add(new THREE.Vector3(0, 0, 0.35)).normalize());
    teeth.add(t);
  }
  const jaw = teeth;   // the gape animates the teeth slightly
  [-1, 1].forEach((s) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), new THREE.MeshPhysicalMaterial({ color: 0x8aa098, roughness: 0.05, clearcoat: 1, emissive: 0x0a1a14 }));
    eye.position.set(s * 0.45, 0.42, 0.55); g.add(eye);
  });
  const finMat = new THREE.MeshPhysicalMaterial({ color: 0x2a2028, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
  const fan = (r, ang) => new THREE.Mesh(new THREE.CircleGeometry(r, 24, -ang / 2, ang), finMat);
  const tail = fan(0.55, 1.4); tail.position.set(0, 0, -1.0); tail.rotation.set(0, Math.PI / 2, Math.PI); g.add(tail);
  const pecs = [-1, 1].map((s) => { const f = fan(0.38, 1.6); f.position.set(s * 0.72, -0.15, -0.05); f.rotation.set(0, s * (Math.PI / 2 + 0.4), 0); g.add(f); return f; });
  const dorsal = fan(0.3, 1.2); dorsal.position.set(0, 0.7, -0.5); dorsal.rotation.set(0, Math.PI / 2, Math.PI / 2 + 0.5); g.add(dorsal);
  // illicium and esca: a translucent bulb with a bright core and trailing filaments
  const stalk = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.78, 0.3), new THREE.Vector3(0, 1.4, 0.55), new THREE.Vector3(0, 1.55, 1.15), new THREE.Vector3(0, 1.25, 1.6)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(stalk, 32, 0.022, 8), skin));
  const esca = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0x9ff6ff, roughness: 0.1, transparent: true, opacity: 0.85, emissive: 0x6fe8ff, emissiveIntensity: 2.5 }));
  esca.position.set(0, 1.18, 1.66); g.add(esca);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })); core.position.copy(esca.position); g.add(core);
  const haloTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0x8ff6ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.copy(esca.position); halo.scale.setScalar(2); g.add(halo);
  const filaments = new THREE.LineSegments((() => { const pts = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; pts.push(0, 1.12, 1.66, Math.cos(a) * 0.05, 0.95, 1.66 + Math.sin(a) * 0.05); } const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); return geo; })(), new THREE.LineBasicMaterial({ color: 0x8ff6ff, transparent: true, opacity: 0.7 }));
  g.add(filaments);
  const light = new THREE.PointLight(0x8ff6ff, 8, 7, 1.4); light.position.copy(esca.position); g.add(light);
  g.userData.update = (t, hueColor) => {
    const pulse = 0.7 + 0.3 * Math.sin(t * 2.0) + 0.08 * Math.sin(t * 7.3);
    if (hueColor) { esca.material.emissive.copy(hueColor); halo.material.color.copy(hueColor); light.color.copy(hueColor); filaments.material.color.copy(hueColor); }
    esca.material.emissiveIntensity = 1.5 + pulse * 2; halo.scale.setScalar(1.6 + pulse * 0.8); light.intensity = 5 + pulse * 5;
    pecs.forEach((f, i) => (f.rotation.y = (i ? 1 : -1) * (Math.PI / 2 + 0.4 + Math.sin(t * 2.4 + i) * 0.3)));
    tail.rotation.x = Math.sin(t * 1.4) * 0.35;
    jaw.rotation.x = -Math.max(0, Math.sin(t * 0.35)) * 0.03;          // a slight breathing gape
  };
  return g;
}
