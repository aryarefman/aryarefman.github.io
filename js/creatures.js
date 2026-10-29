// Detailed sea life and the research submarine for the backdrop.
import * as THREE from "three";

// ---------- fish ----------
// One fish, nose toward +z, ~1 unit long: a laterally compressed body with a forked tail, dorsal, anal and
// pectoral fins, eyes, and counter-shading (dark back, silver flank, white belly) baked into vertex colours.
function fishGeometry(pal = {}) {
  const pos = [], col = [], RING = 14, SEG = 22;
  const back = new THREE.Color(pal.back ?? 0x1d3a4a), flank = new THREE.Color(pal.flank ?? 0xa9bcc6), belly = new THREE.Color(pal.belly ?? 0xe8eef0), stripe = new THREE.Color(pal.stripe ?? 0x3f6a7a);
  const prof = (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), 0.75) * (1 - 0.35 * t); // t: 0 tail → 1 nose
  const ring = (t) => {
    const z = -0.5 + t, r = prof(t), h = 0.2 * r, w = 0.075 * r;
    return Array.from({ length: RING }, (_, k) => {
      const a = (k / RING) * Math.PI * 2;
      return [Math.cos(a) * w, Math.sin(a) * h * (Math.sin(a) > 0 ? 1.05 : 0.92), z];
    });
  };
  const shade = (y, z) => {
    const c = new THREE.Color();
    const s = THREE.MathUtils.clamp((y + 0.1) / 0.22, 0, 1);
    if (s > 0.62) c.copy(flank).lerp(back, (s - 0.62) / 0.38); else c.copy(belly).lerp(flank, s / 0.62);
    if (Math.abs(y - 0.04) < 0.012 && z < 0.35) c.lerp(stripe, 0.6);       // lateral line
    return c;
  };
  const tri = (a, b, c, colors) => { pos.push(...a, ...b, ...c); (colors || [a, b, c].map((p) => shade(p[1], p[2]))).forEach((cc) => col.push(cc.r, cc.g, cc.b)); };
  const rings = Array.from({ length: SEG + 1 }, (_, i) => ring(0.04 + (i / SEG) * 0.95));
  for (let i = 0; i < SEG; i++) for (let k = 0; k < RING; k++) {
    const a = rings[i][k], b = rings[i][(k + 1) % RING], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % RING];
    tri(a, c, b); tri(b, c, d);
  }
  const nose = [0, 0, 0.5];
  for (let k = 0; k < RING; k++) tri(rings[SEG][k], nose, rings[SEG][(k + 1) % RING]);
  const fin = new THREE.Color(pal.fin ?? 0x6f8f9c);
  const fins = (a, b, c) => { tri(a, b, c, [fin, fin, fin]); tri(a, c, b, [fin, fin, fin]); };
  // forked caudal fin
  fins([0, 0.015, -0.46], [0, 0.17, -0.72], [0, 0.03, -0.6]);
  fins([0, -0.015, -0.46], [0, -0.16, -0.7], [0, -0.03, -0.6]);
  fins([0, 0.03, -0.6], [0, 0.17, -0.72], [0, 0.0, -0.64]);
  fins([0, -0.03, -0.6], [0, -0.16, -0.7], [0, 0.0, -0.64]);
  // dorsal, anal and pectoral fins
  fins([0, 0.19, 0.12], [0, 0.31, -0.02], [0, 0.17, -0.16]);
  fins([0, -0.15, -0.1], [0, -0.22, -0.2], [0, -0.13, -0.28]);
  [-1, 1].forEach((s) => fins([s * 0.06, -0.04, 0.2], [s * 0.2, -0.1, 0.08], [s * 0.06, -0.07, 0.1]));
  // eyes: a dark disc with a bright ring on each side
  [-1, 1].forEach((s) => {
    const cx = s * 0.052, cy = 0.04, cz = 0.36, R = 0.032, iris = new THREE.Color(0xd8c48a), pupil = new THREE.Color(0x05080a);
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2;
      const p0 = [cx, cy + Math.cos(a0) * R, cz + Math.sin(a0) * R], p1 = [cx, cy + Math.cos(a1) * R, cz + Math.sin(a1) * R];
      const q0 = [cx + s * 0.001, cy + Math.cos(a0) * R * 0.6, cz + Math.sin(a0) * R * 0.6], q1 = [cx + s * 0.001, cy + Math.cos(a1) * R * 0.6, cz + Math.sin(a1) * R * 0.6];
      tri(p0, p1, q0, [iris, iris, iris]); tri(q0, p1, q1, [iris, iris, iris]);
      tri([cx + s * 0.002, cy, cz], q0, q1, [pupil, pupil, pupil]);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

// A school following one smooth leader path; every fish faces where it is going and beats its tail.
// opts: palette, size, spread, path(t) for the leader, beat (tail frequency), glow (photophore colour)
export function fishSchool(uniforms, count, opts = {}) {
  const geo = fishGeometry(opts.palette);
  const phases = new Float32Array(count);
  const beat = (opts.beat ?? 9).toFixed(2);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: opts.metalness ?? 0.55, roughness: 0.32, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; attribute float aPhase; varying vec3 vFishPos;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vFishPos = position;
        float tailw = pow(clamp(0.35 - position.z, 0.0, 1.2), 1.7);
        transformed.x += sin(uTime * ${beat} + aPhase - position.z * 7.0) * 0.12 * tailw;   // body wave, strongest at the tail
        transformed.x += sin(uTime * ${beat} + aPhase) * 0.012;`);
    if (opts.glow) {
      const c = new THREE.Color(opts.glow);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vFishPos;")
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          // photophores: two rows of glowing dots along the belly
          float row = min(abs(vFishPos.y + 0.09), abs(vFishPos.y + 0.045));
          float dots = smoothstep(0.014, 0.0, row) * smoothstep(0.35, 0.0, abs(fract(vFishPos.z * 14.0) - 0.5)) * step(-0.38, vFishPos.z) * step(vFishPos.z, 0.3);
          totalEmissiveRadiance += vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)}) * dots * 3.0;`);
    }
  };
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  let seed = 31; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const fish = Array.from({ length: count }, (_, i) => {
    phases[i] = rnd() * 50;
    const u = rnd(), v = rnd(), w = rnd();
    const sp = opts.spread ?? [12, 3.5, 7], sz = opts.size ?? [0.55, 0.9];
    return { off: new THREE.Vector3((u - 0.5) * sp[0], (v - 0.5) * sp[1], (w - 0.5) * sp[2]), ph: rnd() * 6.28, s: sz[0] + rnd() * (sz[1] - sz[0]), lag: rnd() * 0.8 };
  });
  geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
  const leader = opts.path ?? ((t) => new THREE.Vector3(Math.sin(t * 0.11) * 16, -24 + Math.sin(t * 0.17) * 2.2, -34 + Math.cos(t * 0.09) * 7));
  const dummy = new THREE.Object3D(), here = new THREE.Vector3(), ahead = new THREE.Vector3();
  const place = (f, t, out) => out.copy(leader(t - f.lag)).add(f.off).add(new THREE.Vector3(Math.sin(t * 0.7 + f.ph) * 0.6, Math.sin(t * 0.9 + f.ph) * 0.3, Math.cos(t * 0.6 + f.ph) * 0.6));
  mesh.userData.update = (t) => {
    fish.forEach((f, i) => {
      place(f, t, here); place(f, t + 0.25, ahead);
      dummy.position.copy(here); dummy.lookAt(ahead); dummy.scale.setScalar(f.s);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  mesh.frustumCulled = false;
  return mesh;
}

// ---------- research submarine (deep-submergence vehicle) ----------
function decal(text) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(0,0,0,0)"; g.fillRect(0, 0, 512, 128);
  g.fillStyle = "#f4f4f2"; g.font = "bold 72px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 256, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// grime and panel seams on painted metal, added to standard materials
function weathered(mat, seamScale = 2.2) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vObjPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObjPos = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vObjPos;
      float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec3 q = vObjPos * ${seamScale.toFixed(2)};
        float seam = max(smoothstep(0.97, 1.0, abs(fract(q.x) * 2.0 - 1.0)), smoothstep(0.985, 1.0, abs(fract(q.y * 0.7) * 2.0 - 1.0)));
        float grime = h3(floor(vObjPos * 18.0)) * 0.12 + smoothstep(0.2, -0.9, vObjPos.y) * 0.25;
        diffuseColor.rgb *= (1.0 - seam * 0.45) * (1.0 - grime);`);
  };
  return mat;
}

export function submarine(uniforms) {
  const g = new THREE.Group();
  const white = weathered(new THREE.MeshPhysicalMaterial({ color: 0xe8ebe9, roughness: 0.38, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.4 }));
  const orange = weathered(new THREE.MeshPhysicalMaterial({ color: 0xe8611f, roughness: 0.42, metalness: 0.1, clearcoat: 0.5 }), 3.0);
  const titanium = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.3, metalness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.5, metalness: 0.8 });
  const black = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.7, metalness: 0.3 });
  const yellow = weathered(new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.45, metalness: 0.2 }));

  // streamlined fairing: a lathe profile laid along x (nose toward -x)
  const prof = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24; prof.push(new THREE.Vector2(Math.max(0.001, Math.sin(Math.PI * Math.pow(t, 0.8)) * 1.25 * (1 - 0.25 * t)), t * 6.2 - 3.1)); }
  const fairingGeo = new THREE.LatheGeometry(prof, 48); fairingGeo.rotateZ(Math.PI / 2); fairingGeo.scale(1, 1, 0.92);
  const fairing = new THREE.Mesh(fairingGeo, white); fairing.position.y = 0.25; g.add(fairing);
  // sail with the call sign
  const sail = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.4, 8, 24), orange); sail.rotation.z = Math.PI / 2; sail.scale.set(1, 1.3, 0.55); sail.position.set(0.4, 1.35, 0); g.add(sail);
  [-1, 1].forEach((s) => {
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: decal("ARYA-1"), transparent: true }));
    label.position.set(0.4, 1.38, s * 0.24); label.rotation.y = s > 0 ? 0 : Math.PI; g.add(label);
  });
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); strobe.position.set(0.9, 1.75, 0); g.add(strobe);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.7, 6), steel); mast.position.set(-0.1, 1.95, 0); g.add(mast);

  // titanium personnel sphere at the bow with three viewports
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.0, 48, 32), titanium); sphere.position.set(-2.5, -0.15, 0); g.add(sphere);
  [[-0.98, -0.2, 0], [-0.8, -0.35, 0.5], [-0.8, -0.35, -0.5]].forEach(([x, y, z]) => {
    const n = new THREE.Vector3(x, y, z).normalize();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 10, 28), steel);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.16, 28), new THREE.MeshPhysicalMaterial({ color: 0x0a1820, roughness: 0.05, metalness: 0.2, clearcoat: 1, emissive: 0xffc070, emissiveIntensity: 0.55 }));
    [ring, glass].forEach((m) => { m.position.copy(sphere.position).addScaledVector(n, 1.0); m.lookAt(m.position.clone().add(n)); g.add(m); });
  });

  // lower frame: skids, ballast tanks, sample basket and manipulator arms
  [-0.75, 0.75].forEach((z) => {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.2, 10), steel); skid.rotation.z = Math.PI / 2; skid.position.set(0.1, -1.35, z); g.add(skid);
    [-1.4, 0.2, 1.8].forEach((x) => { const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), steel); strut.position.set(x, -1.0, z); g.add(strut); });
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 2.2, 8, 20), yellow); tank.rotation.z = Math.PI / 2; tank.position.set(0.6, -0.65, z * 1.2); g.add(tank);
  });
  const basket = new THREE.LineSegments((() => {
    const pts = [], x0 = -2.9, x1 = -1.9, z0 = -0.55, z1 = 0.55, y0 = -1.25, y1 = -0.85;
    for (let i = 0; i <= 6; i++) { const x = x0 + (x1 - x0) * (i / 6); pts.push(x, y0, z0, x, y0, z1, x, y0, z0, x, y1, z0, x, y0, z1, x, y1, z1); }
    for (let i = 0; i <= 6; i++) { const z = z0 + (z1 - z0) * (i / 6); pts.push(x0, y0, z, x1, y0, z); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); return geo;
  })(), new THREE.LineBasicMaterial({ color: 0x8a9096 }));
  g.add(basket);
  const arms = [];
  [-0.45, 0.45].forEach((z, k) => {
    const shoulder = new THREE.Group(); shoulder.position.set(-2.0, -0.9, z); g.add(shoulder);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.0, 12), black); upper.geometry.translate(0, -0.5, 0); shoulder.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -1.0; shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.9, 12), black); fore.geometry.translate(0, -0.45, 0); elbow.add(fore);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), steel); elbow.add(joint);
    [-1, 1].forEach((s) => { const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.05), steel); jaw.position.set(s * 0.06, -0.98, 0); jaw.rotation.z = s * 0.25; elbow.add(jaw); });
    shoulder.rotation.z = -1.0; elbow.rotation.z = 1.3;
    arms.push({ shoulder, elbow, k });
  });

  // ducted thrusters: stern pair and a vertical one on top
  const thrusters = [];
  [[2.95, 0.2, 0.55, "x"], [2.95, 0.2, -0.55, "x"], [1.6, 1.0, 0.95, "y"]].forEach(([x, y, z, axis]) => {
    const duct = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.07, 10, 28), black);
    const prop = new THREE.Group();
    for (let b = 0; b < 3; b++) { const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.12), steel); blade.rotation.y = 0.5; const arm = new THREE.Group(); arm.rotation.z = (b * Math.PI * 2) / 3; arm.add(blade); prop.add(arm); }
    const holder = new THREE.Group(); holder.position.set(x, y, z); holder.add(duct, prop);
    if (axis === "x") holder.rotation.y = Math.PI / 2; else holder.rotation.x = Math.PI / 2;
    g.add(holder); thrusters.push(prop);
  });

  // lights: LED bar, two pan-tilt spotlights with visible beams, and a work light
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1.4), new THREE.MeshBasicMaterial({ color: 0xeaf6ff })); bar.position.set(-2.2, 0.95, 0); g.add(bar);
  const work = new THREE.PointLight(0xffe6c0, 26, 16, 1.6); work.position.set(-0.5, 3.0, 2.8); g.add(work);
  const beams = [];
  [-0.55, 0.55].forEach((z) => {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.26, 16), steel); head.rotation.z = Math.PI / 2; head.position.set(-3.0, 0.75, z); g.add(head);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), new THREE.MeshBasicMaterial({ color: 0xffffff })); lens.position.set(-3.14, 0.75, z); lens.rotation.y = -Math.PI / 2; g.add(lens);
    const spot = new THREE.SpotLight(0xdff2ff, 90, 80, 0.38, 0.55, 1.3); spot.position.copy(lens.position); g.add(spot, spot.target);
    const beamGeo = new THREE.ConeGeometry(5.0, 24, 40, 1, true); beamGeo.translate(0, -12, 0); beamGeo.rotateZ(-Math.PI / 2);
    const beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime },
      vertexShader: "varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: /* glsl */ `uniform float uTime; varying vec3 vP;
        float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() { float t = clamp(-vP.x / 24.0, 0.0, 1.0);
          float grain = 0.85 + 0.15 * h(floor(vP.yz * 3.0 + uTime * 0.5));
          gl_FragColor = vec4(vec3(0.78, 0.9, 1.0), pow(1.0 - t, 2.2) * 0.13 * grain); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    beam.position.copy(lens.position); g.add(beam);
    beams.push({ spot, beam, head, z });
  });

  // particles caught in the beams and bubbles from the thrusters
  const dot = (() => { const c = document.createElement("canvas"); c.width = c.height = 32; const x = c.getContext("2d"), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  let seed = 77; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const motePos = [];
  for (let i = 0; i < 500; i++) { const d = 2 + rnd() * 20, rr = d * 0.2 * Math.sqrt(rnd()), a = rnd() * 6.28; motePos.push(-3.2 - d, 0.75 - d * 0.42 + Math.sin(a) * rr, Math.cos(a) * rr); }
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute("position", new THREE.Float32BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ map: dot, size: 0.12, color: 0xdff0ff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(motes);
  const BUB = 70, bubGeo = new THREE.BufferGeometry(), bubPos = new Float32Array(BUB * 3), bubSeed = [];
  for (let i = 0; i < BUB; i++) bubSeed.push([rnd(), rnd(), rnd()]);
  bubGeo.setAttribute("position", new THREE.BufferAttribute(bubPos, 3));
  const bubbles = new THREE.Points(bubGeo, new THREE.PointsMaterial({ map: dot, size: 0.16, color: 0xcfe8ff, transparent: true, opacity: 0.7, depthWrite: false }));
  g.add(bubbles);

  g.userData.update = (t) => {
    thrusters.forEach((p, i) => (p.rotation.z = t * (i === 2 ? 6 : 9)));
    strobe.material.color.setScalar(Math.sin(t * 2.6) > 0.92 ? 1 : 0.08);
    const sweep = Math.sin(t * 0.35) * 0.3;
    beams.forEach(({ spot, beam, z }) => {
      const dir = new THREE.Vector3(-Math.cos(sweep), -0.42, Math.sin(sweep) + z * 0.08).normalize();
      spot.target.position.copy(spot.position).addScaledVector(dir, 20);
      beam.rotation.set(0, sweep, 0.4);
    });
    motes.rotation.y = sweep;
    arms.forEach(({ shoulder, elbow, k }) => { shoulder.rotation.z = -1.0 + Math.sin(t * 0.4 + k) * 0.12; elbow.rotation.z = 1.3 + Math.sin(t * 0.5 + k * 2) * 0.15; });
    for (let i = 0; i < BUB; i++) {
      const [a, b, c] = bubSeed[i], u = (t * (0.25 + a * 0.2) + b) % 1;
      bubPos[i * 3] = 3.2 + u * 1.2 + Math.sin(u * 12 + c * 6) * 0.15;
      bubPos[i * 3 + 1] = 0.2 + u * 6 + (c - 0.5) * 0.3;
      bubPos[i * 3 + 2] = (b > 0.5 ? 0.55 : -0.55) + Math.cos(u * 9 + a * 6) * 0.15;
    }
    bubGeo.attributes.position.needsUpdate = true;
    g.position.y = g.userData.baseY + Math.sin(t * 0.6) * 0.25;
    g.rotation.z = Math.sin(t * 0.5) * 0.025;
  };
  return g;
}

// ---------- sea turtle (penyu): domed shell with scutes, scaly skin, beating fore-flippers ----------
export function seaTurtle(uniforms) {
  const g = new THREE.Group();
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x6a5a34, roughness: 0.55, metalness: 0.05 });
  shellMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvSP = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vSP;
      vec2 h2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
      float cells(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(x, y); vec2 r = o + h2(i + o) - f; float d = dot(r, r);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
        return sqrt(d2) - sqrt(d1); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float edge = smoothstep(0.0, 0.12, cells(vSP.xz * 2.2));
        vec3 scute = mix(vec3(0.24, 0.17, 0.08), vec3(0.55, 0.42, 0.2), smoothstep(0.1, 0.6, cells(vSP.xz * 2.2)));
        diffuseColor.rgb = mix(vec3(0.08, 0.06, 0.03), scute, edge);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.76, 0.58), smoothstep(0.0, -0.25, vSP.y));`);
  };
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), shellMat); shell.scale.set(0.95, 0.36, 1.2); g.add(shell);
  const skin = new THREE.MeshStandardMaterial({ color: 0x5f6b55, roughness: 0.7 });
  skin.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vKP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvKP = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vKP;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec2 q = vKP.xz * 9.0 + vKP.y * 5.0; vec2 f = fract(q) - 0.5;
        diffuseColor.rgb = mix(diffuseColor.rgb * 0.55, vec3(0.78, 0.74, 0.55), smoothstep(0.42, 0.3, length(f)) * 0.5);`);
  };
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), skin); head.scale.set(0.3, 0.24, 0.4); head.position.set(0, 0.02, 1.4); g.add(head);
  [-1, 1].forEach((s) => { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2 })); eye.position.set(s * 0.2, 0.08, 1.55); g.add(eye); });
  const flippers = [];
  [[-1, 0.55, 1.6], [1, 0.55, 1.6], [-1, -0.75, 0.7], [1, -0.75, 0.7]].forEach(([s, z, len], i) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.8, -0.05, z); g.add(pivot);
    const f = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), skin); f.scale.set(len * 0.5, 0.05, len * 0.18); f.position.x = s * len * 0.45; f.rotation.y = s * (i < 2 ? 0.45 : 0.9); pivot.add(f);
    flippers.push({ pivot, s, front: i < 2 });
  });
  const here = new THREE.Vector3(), ahead = new THREE.Vector3();
  const path = (t) => new THREE.Vector3(-30 + ((t * 2.2) % 60), -16 + Math.sin(t * 0.3) * 1.5, -26 + Math.sin(t * 0.15) * 3);
  g.userData.update = (t) => {
    flippers.forEach(({ pivot, s, front }) => { pivot.rotation.z = s * (front ? 0.15 + 0.55 * Math.sin(t * 1.4) : 0.1 * Math.sin(t * 1.4 + 1)); });
    here.copy(path(t)); ahead.copy(path(t + 0.3));
    if (ahead.x < here.x) ahead.x = here.x + 0.6;   // wrap-around frame: keep heading forward
    g.position.copy(here); g.lookAt(ahead);
  };
  g.scale.setScalar(1.6);
  return g;
}

// ---------- anglerfish: dark bulky body, needle teeth and a glowing lure ----------
export function anglerfish(uniforms) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x241c22, roughness: 0.8, metalness: 0.05 });
  skin.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vAP;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvAP = position;\ntransformed += normal * (fract(sin(dot(floor(position * 9.0), vec3(12.9, 78.2, 37.7))) * 43758.5) - 0.5) * 0.04;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vAP;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= 0.7 + 0.5 * fract(sin(dot(floor(vAP * 14.0), vec3(12.9, 78.2, 37.7))) * 43758.5);");
  };
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), skin); body.scale.set(0.85, 0.8, 1.05); g.add(body);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), skin); jaw.scale.set(0.9, 0.55, 0.85); jaw.position.set(0, -0.05, 0.35); jaw.rotation.x = 0.25; g.add(jaw);
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), new THREE.MeshBasicMaterial({ color: 0x050204 })); mouth.position.set(0, -0.08, 1.0); mouth.scale.y = 0.45; g.add(mouth);
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.3 });
  for (let i = 0; i < 18; i++) {
    const a = -0.95 + (i % 9) * 0.24, upper = i < 9;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22 + (i % 3) * 0.06, 6), toothMat);
    tooth.position.set(Math.sin(a) * 0.52, upper ? 0.1 : -0.26, 0.98 - Math.abs(Math.sin(a)) * 0.25);
    tooth.rotation.x = upper ? Math.PI + 0.2 : -0.2; g.add(tooth);
  }
  [-1, 1].forEach((s) => { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshStandardMaterial({ color: 0x9fb0a0, roughness: 0.1, emissive: 0x203028 })); eye.position.set(s * 0.42, 0.42, 0.62); g.add(eye); });
  const finMat = new THREE.MeshStandardMaterial({ color: 0x1a1418, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const tail = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16, 0, Math.PI), finMat); tail.position.set(0, 0, -1.1); tail.rotation.set(0, Math.PI / 2, Math.PI / 2); g.add(tail);
  const pecs = [-1, 1].map((s) => { const f = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12, 0, Math.PI), finMat); f.position.set(s * 0.8, -0.1, 0); f.rotation.set(0, s * 1.2, s * 0.5); g.add(f); return f; });
  // illicium: a curved stalk from the forehead to the glowing esca
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.75, 0.4), new THREE.Vector3(0, 1.45, 0.75), new THREE.Vector3(0, 1.5, 1.35), new THREE.Vector3(0, 1.2, 1.7)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.025, 6), skin));
  const lure = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), new THREE.MeshBasicMaterial({ color: 0xbffcff }));
  lure.position.set(0, 1.12, 1.74); g.add(lure);
  const haloTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0x8ff6ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(1.6); halo.position.copy(lure.position); g.add(halo);
  const light = new THREE.PointLight(0x8ff6ff, 6, 6, 1.5); light.position.copy(lure.position); g.add(light);
  g.userData.update = (t, hueColor) => {
    const pulse = 0.75 + 0.25 * Math.sin(t * 2.2) + 0.1 * Math.sin(t * 7.0);
    if (hueColor) { lure.material.color.copy(hueColor).lerp(new THREE.Color(0xffffff), 0.45); halo.material.color.copy(hueColor); light.color.copy(hueColor); }
    halo.scale.setScalar(1.3 + pulse * 0.5); light.intensity = 4 + pulse * 3;
    pecs.forEach((f, i) => (f.rotation.y = (i ? 1 : -1) * (1.2 + Math.sin(t * 2 + i) * 0.25)));
    tail.rotation.y = Math.PI / 2 + Math.sin(t * 1.5) * 0.3;
    g.position.y = g.userData.baseY + Math.sin(t * 0.5) * 0.3;
    g.rotation.y = g.userData.baseYaw + Math.sin(t * 0.2) * 0.25;
  };
  return g;
}

// ---------- UFO: brushed-metal saucer, glass dome with an alien pilot, rim lights and a tractor beam ----------
export function ufo(uniforms) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.22, metalness: 0.95 });
  metal.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vUP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvUP = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vUP;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        float r = length(vUP.xz), ang = atan(vUP.z, vUP.x);
        float rings = smoothstep(0.93, 1.0, abs(sin(r * 26.0)));                                // machined grooves
        float panels = smoothstep(0.985, 1.0, abs(sin(ang * 8.0)));                             // panel seams
        diffuseColor.rgb *= 1.0 - rings * 0.25 - panels * 0.35;`);
  };
  // saucer body: a lathe profile with a sharp rim
  const prof = [[0.001, -0.32], [0.45, -0.3], [0.9, -0.16], [1.35, -0.04], [1.5, 0.0], [1.35, 0.06], [0.9, 0.18], [0.55, 0.26], [0.001, 0.28]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), metal); g.add(body);
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.38, 0.12, 48), new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.4, metalness: 0.8 }));
  belly.position.y = -0.36; g.add(belly);
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.34, 40), new THREE.MeshBasicMaterial({ color: 0x9dffd4 })); core.rotation.x = Math.PI / 2; core.position.y = -0.43; g.add(core);
  // glass dome and the pilot inside
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xbfe8ff, roughness: 0.05, metalness: 0, transmission: 0.9, thickness: 0.2, transparent: true, opacity: 0.35, clearcoat: 1 }));
  dome.position.y = 0.26; g.add(dome);
  const skin = new THREE.MeshStandardMaterial({ color: 0x7fd36a, roughness: 0.45, emissive: 0x0e2a0a, emissiveIntensity: 0.6 });
  const alien = new THREE.Group(); alien.position.y = 0.26; g.add(alien);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 24), skin); head.scale.set(1, 1.15, 0.95); head.position.y = 0.3; alien.add(head);
  const chin = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.16, 24), skin); chin.rotation.x = Math.PI; chin.position.y = 0.13; alien.add(chin);
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.05, clearcoat: 1 });
  [-1, 1].forEach((s) => { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), eyeMat); eye.scale.set(1, 0.62, 0.5); eye.position.set(s * 0.085, 0.3, 0.16); eye.rotation.z = s * -0.45; alien.add(eye); });
  [-1, 1].forEach((s) => {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.16, 6), skin); stalk.position.set(s * 0.08, 0.55, 0); stalk.rotation.z = s * -0.3; alien.add(stalk);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), new THREE.MeshBasicMaterial({ color: 0xc8ff9a })); bulb.position.set(s * 0.105, 0.63, 0); alien.add(bulb);
  });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.12, 6, 16), skin); torso.position.y = 0.0; alien.add(torso);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), skin); hand.position.set(0.16, 0.12, 0.08); alien.add(hand);
  // rim lights that chase around the edge
  const rimLights = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd36a }));
    l.position.set(Math.cos(a) * 1.42, 0.0, Math.sin(a) * 1.42); g.add(l); rimLights.push(l);
  }
  // tractor beam: a soft cone below the saucer with drifting rings
  const beamGeo = new THREE.CylinderGeometry(0.3, 1.6, 4.5, 48, 1, true); beamGeo.translate(0, -2.7, 0);
  const beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uHue: uniforms.uHue },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `uniform float uTime, uHue; varying vec2 vUv;
      vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0, 4, 2), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1), k, s); }
      void main() {
        float rings = 0.6 + 0.4 * smoothstep(0.6, 1.0, sin((vUv.y * 9.0 + uTime * 2.0) * 6.2831));
        float fade = smoothstep(0.0, 0.5, vUv.y) * (0.5 + 0.5 * sin(uTime * 1.3));
        gl_FragColor = vec4(mix(vec3(0.6, 1.0, 0.85), hsv(fract(uHue), 0.5, 1.0), 0.4), fade * rings * 0.18);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  g.add(beam);
  const glow = new THREE.PointLight(0x9dffd4, 30, 30, 1.5); glow.position.y = -1.0; g.add(glow);

  const base = new THREE.Vector3();
  g.userData.setBase = (v) => base.copy(v);
  g.userData.update = (t) => {
    // a slow figure-eight drift with a little wobble, the way UFOs move in films
    g.position.set(base.x + Math.sin(t * 0.21) * 30, base.y + Math.sin(t * 0.43) * 8, base.z + Math.sin(t * 0.42) * 14);
    g.rotation.set(Math.sin(t * 0.9) * 0.08, t * 0.6, Math.cos(t * 0.7) * 0.08);
    rimLights.forEach((l, i) => l.material.color.setHSL(((i / 16) + t * 0.15) % 1, 0.8, 0.5 + 0.35 * Math.max(0, Math.sin(t * 6 - i * 0.8))));
    alien.rotation.y = -t * 0.6 + Math.sin(t * 0.8) * 0.6;   // the pilot keeps looking out at us
    hand.position.y = 0.12 + Math.max(0, Math.sin(t * 2.5)) * 0.12;   // and waves
  };
  return g;
}
