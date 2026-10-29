// The research submarine and the UFO for the backdrop (sea life lives in sealife.js).
import * as THREE from "three";

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
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xbfe8ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.3, clearcoat: 1 }));
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
