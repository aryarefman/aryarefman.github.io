// The UFO for the backdrop (sea life lives in sealife.js).
import * as THREE from "three";

// ---------- research submarine (deep-submergence vehicle) ----------
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
