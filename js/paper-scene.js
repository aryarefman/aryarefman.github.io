// The 3D home of paper mode. A dark figure with glowing eyes stands on a vast red-lit dome under an arch;
// the eight projects orbit him as glowing image cards. The intro holds on the face, glitches (RGB split and
// colour-cycling eyes), then the camera swoops up through drifting dust to a high wide shot.
// Bloom and the RGB split come from a small post-processing chain.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const RED = new THREE.Color(0xff2a14);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// final pass: RGB split (strong during the glitch), vignette and film grain
const FinishShader = {
  uniforms: { tDiffuse: { value: null }, uShift: { value: 0 }, uTime: { value: 0 } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uShift, uTime; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main() {
      vec2 dir = (vUv - 0.5) * uShift;
      float band = step(0.5, fract(vUv.y * 40.0 + uTime * 9.0)) * uShift * 0.4;    // torn scanlines while glitching
      vec2 uv = vUv + vec2(band * 0.02, 0.0);
      vec3 c = vec3(texture2D(tDiffuse, uv + dir).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir).b);
      c *= 1.0 - 0.55 * pow(length(vUv - 0.5) * 1.25, 2.2);                           // vignette
      c += (hash(vUv * 900.0) - 0.5) * 0.045;                                        // grain
      gl_FragColor = vec4(c, 1.0);
    }`,
};

function domeMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: "varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uRed; varying vec3 vW;
      void main() {
        float r = length(vW.xz);
        float glow = exp(-r * 0.055);
        float rings = 0.5 + 0.5 * sin(r * 9.0 - uTime * 1.4);                        // fine ripples rolling outward
        float hot = exp(-r * r * 0.12);
        vec3 col = uRed * (0.12 + 0.95 * glow) * (0.86 + 0.14 * rings) + vec3(1.0, 0.62, 0.5) * hot * 0.5;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// cards show the project on both faces (unmirrored) with a bright paper border that blooms
function cardMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uHover: { value: 0 } },
    side: THREE.DoubleSide, toneMapped: false,
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uHover; varying vec2 vUv;
      void main() {
        vec2 uv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
        float bx = min(uv.x, 1.0 - uv.x), by = min(uv.y, 1.0 - uv.y), border = 1.0 - step(0.025, min(bx, by * 1.6));
        vec3 img = texture2D(uMap, vec2(mix(0.035, 0.965, uv.x), mix(0.055, 0.945, uv.y))).rgb;
        vec3 c = mix(img * (0.85 + 0.35 * uHover), vec3(1.6, 1.55, 1.45), border);    // the border is over-bright so bloom halos it
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

// the figure: near-black body, a hot red fresnel rim (lit from the floor and the arch)
function bodyMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x050101, roughness: 0.6, metalness: 0.1 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.4);
      totalEmissiveRadiance += vec3(1.0, 0.12, 0.04) * fres * 1.6;`);
  };
  return m;
}

export function createPaperScene(canvas, { images, onHover, onPick, reduceMotion = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.018);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 300);
  const uniforms = { uTime: { value: 0 }, uRed: { value: RED } };

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.62);
  composer.addPass(bloom);
  const finish = new ShaderPass(FinishShader); composer.addPass(finish);
  composer.addPass(new OutputPass());

  // the dome: the top of a huge sphere, so the floor curves away into the dark like a small planet
  const dome = new THREE.Mesh(new THREE.SphereGeometry(70, 128, 64, 0, Math.PI * 2, 0, Math.PI / 2.4), domeMaterial(uniforms));
  dome.position.y = -70; scene.add(dome);

  const arch = new THREE.Mesh(new THREE.TorusGeometry(15, 0.22, 16, 220), new THREE.MeshBasicMaterial({ color: 0x5a0702 }));
  arch.position.set(0, -1.5, -11); scene.add(arch);
  const archHalo = new THREE.Mesh(new THREE.TorusGeometry(15, 1.4, 16, 220), new THREE.MeshBasicMaterial({ color: 0x3a0300, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  archHalo.position.copy(arch.position); scene.add(archHalo);

  // dust: a cloud of fine specks around the figure that the camera flies through, and far stars
  const rnd = (() => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const dust = [];
  for (let i = 0; i < 2600; i++) { const a = rnd() * Math.PI * 2, r = 1.5 + Math.pow(rnd(), 0.7) * 16; dust.push(Math.cos(a) * r, 0.2 + rnd() * 12, Math.sin(a) * r); }
  const dustPts = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(dust, 3)),
    new THREE.PointsMaterial({ color: 0xfff1ea, size: 0.035, transparent: true, opacity: 0.85, depthWrite: false }));
  scene.add(dustPts);
  const far = [];
  for (let i = 0; i < 1800; i++) { const a = rnd() * Math.PI * 2, e = rnd() * 1.2, r = 90 + rnd() * 60; far.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
  scene.add(new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(far, 3)),
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, fog: false })));

  scene.add(new THREE.HemisphereLight(0x401010, 0x200000, 0.6));
  const under = new THREE.PointLight(0xff3018, 6, 10); under.position.set(0, 0.4, 1.2); scene.add(under);

  // the figure (and its mirror image in the glossy floor), loaded async
  const figure = new THREE.Group(), mirror = new THREE.Group(); scene.add(figure, mirror);
  mirror.scale.y = -1;
  const mixers = [], eyes = [], head = new THREE.Vector3(0, 1.62, 0);
  let headBone = null;
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load("models/xbot.glb", (gltf) => {
    const body = bodyMaterial();
    const setup = (root, isMirror) => {
      root.traverse((o) => {
        if (o.isMesh) {
          o.frustumCulled = false;
          o.material = isMirror ? new THREE.MeshBasicMaterial({ color: 0x5a0a04, transparent: true, opacity: 0.32, depthTest: false }) : body;
          if (isMirror) o.renderOrder = 1;
        }
      });
      const mx = new THREE.AnimationMixer(root);
      const idle = gltf.animations.find((a) => a.name === "idle") || gltf.animations[0];
      mx.clipAction(idle).play(); mixers.push(mx);
    };
    const main = gltf.scene, refl = cloneSkinned(gltf.scene);
    setup(main, false); setup(refl, true);
    figure.add(main); mirror.add(refl);
    main.updateMatrixWorld(true);
    // glowing eyes: placed in world space on the face (just in front of the eye bones) and parented to the head
    // so they follow it; over-bright so the bloom turns them into lights
    headBone = main.getObjectByName("mixamorigHead");
    const hq = headBone.getWorldQuaternion(new THREE.Quaternion()).invert(), hs = 1 / headBone.getWorldScale(new THREE.Vector3()).x;
    // (GLTFLoader strips the ":" from Mixamo bone names, so "mixamorig:LeftEye" arrives as "mixamorigLeftEye")
    ["mixamorigLeftEye", "mixamorigRightEye"].forEach((n) => {
      const bone = main.getObjectByName(n); if (!bone) return;
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4), toneMapped: false });
      const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), m);
      const p = bone.getWorldPosition(new THREE.Vector3()); p.z += 0.085; p.x *= 1.15;
      eye.position.copy(headBone.worldToLocal(p)); eye.quaternion.copy(hq);
      eye.scale.set(0.012 * hs, 0.0055 * hs, 0.005 * hs);
      headBone.add(eye); eyes.push(m);
    });
  });

  // the cards: a tilted ring that rises behind the figure and dips low in front of the camera
  const ring = new THREE.Group(); ring.rotation.x = -0.42; ring.position.set(0, 5.2, -2); scene.add(ring);
  const spinner = new THREE.Group(); ring.add(spinner);
  const loader = new THREE.TextureLoader(), cards = [], R = 12;
  images.forEach((src, i) => {
    const tex = loader.load(src); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(2.5, 1.6, 12, 1);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) p.setZ(k, -Math.pow(p.getX(k) / 1.25, 2) * 0.12);   // a slight curl, like held paper
    const card = new THREE.Mesh(geo, cardMaterial(tex));
    const a = (i / images.length) * Math.PI * 2;
    card.userData = { index: i, angle: a, hover: 0, tilt: (rnd() - 0.5) * 0.5 };
    card.position.set(Math.sin(a) * R, 0, Math.cos(a) * R);
    spinner.add(card); cards.push(card);
  });

  // camera choreography
  const wide = { pos: new THREE.Vector3(0, 13.5, 15.5), look: new THREE.Vector3(0, 0.6, -2.5) };
  const swoop = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.62, 1.05), new THREE.Vector3(1.6, 2.2, 2.6), new THREE.Vector3(4.5, 4.5, 4.2), new THREE.Vector3(3.5, 9.5, 10.5), wide.pos.clone()]);
  const look = new THREE.Vector3(), tmp = new THREE.Vector3();
  let started = false, t0 = 0, spin = 0, hovered = -1;
  const T_HOLD = 2.6, T_GLITCH = 0.8, T_SWOOP = 4.6, spinVel = 0.05;
  const pointer = new THREE.Vector2(9, 9), par = new THREE.Vector2(), ray = new THREE.Raycaster();

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight, a = w / h;
    renderer.setPixelRatio(Math.min(devicePixelRatio, a < 1 ? 1.5 : 1.75));
    renderer.setSize(w, h, false); composer.setSize(w, h);
    bloom.setSize(w / 2, h / 2);
    camera.aspect = a; camera.fov = a < 1 ? 62 : 42; camera.updateProjectionMatrix();
    wide.pos.set(0, a < 1 ? 17 : 13.5, a < 1 ? 21 : 15.5);
    swoop.points[4].copy(wide.pos);
  }
  resize();

  let drag = null, downX = 0;
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    par.copy(pointer);
    if (drag !== null) { spin += (e.clientX - drag) * 0.004; drag = e.clientX; }
  });
  canvas.addEventListener("pointerleave", () => pointer.set(9, 9));
  canvas.addEventListener("pointerdown", (e) => { drag = e.clientX; downX = e.clientX; });
  addEventListener("pointerup", (e) => { if (drag === null) return; drag = null; if (Math.abs(e.clientX - downX) < 6 && hovered >= 0) onPick?.(hovered); });
  canvas.addEventListener("wheel", (e) => { spin += e.deltaY * 0.0012; }, { passive: true });

  let last = performance.now(), running = true;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    uniforms.uTime.value = t; finish.uniforms.uTime.value = t % 100;
    mixers.forEach((m) => m.update(dt));
    if (headBone) headBone.getWorldPosition(head);

    // intro timeline: hold on the face, glitch, swoop out to the wide shot
    const k = started ? (reduceMotion ? 99 : (now - t0) / 1000) : 0;
    let shift = 0;
    if (k < T_HOLD) {
      camera.position.set(Math.sin(t * 0.4) * 0.05, head.y - 0.02, head.z + 1.15 - k * 0.06);
      camera.lookAt(head);
    } else if (k < T_HOLD + T_GLITCH) {
      const g = (k - T_HOLD) / T_GLITCH;
      shift = 0.012 + 0.03 * Math.abs(Math.sin(g * 40.0)) * (1 - g);                  // stuttering RGB split
      camera.position.set((Math.random() - 0.5) * 0.04, head.y - 0.02 + (Math.random() - 0.5) * 0.03, head.z + 1.0);
      camera.lookAt(head);
      eyes.forEach((m, i) => m.color.setHSL((t * 3 + i * 0.3) % 1, 1, 0.5).multiplyScalar(4));   // the eyes cycle through colours
    } else {
      const s = Math.min(1, (k - T_HOLD - T_GLITCH) / T_SWOOP), e = ease(s);
      eyes.forEach((m) => m.color.setRGB(4, 4, 4));
      swoop.points[0].set(0, head.y, head.z + 1.0);
      swoop.getPointAt(e, camera.position);
      look.lerpVectors(head, wide.look, ease(Math.min(1, s * 1.15)));
      if (s >= 1) { camera.position.x += par.x * 1.2; camera.position.y += par.y * 0.6; }   // settled: sway with the pointer
      camera.lookAt(look);
      shift = 0.0015 * (1 - e);
    }
    finish.uniforms.uShift.value = shift;

    // the ring of cards
    if (drag === null && !reduceMotion) spin += spinVel * dt;
    spinner.rotation.y = spin;
    let hit = -1;
    if (k > T_HOLD + T_GLITCH + T_SWOOP * 0.8 && pointer.x < 2) {
      ray.setFromCamera(pointer, camera);
      const h = ray.intersectObjects(cards, false)[0];
      if (h) hit = h.object.userData.index;
    }
    canvas.style.cursor = hit >= 0 ? "pointer" : drag !== null ? "grabbing" : "grab";
    if (hit !== hovered) { hovered = hit; onHover?.(hit); }
    cards.forEach((c) => {
      const u = c.userData; u.hover += ((u.index === hovered ? 1 : 0) - u.hover) * Math.min(1, dt * 8);
      c.material.uniforms.uHover.value = u.hover;
      c.position.y = Math.sin(t * 0.6 + u.index) * 0.35;
      // each card turns toward the figure but keeps its own lean
      c.parent.updateMatrixWorld(); c.lookAt(tmp.set(0, 0.5, 0)); c.rotateY(Math.PI); c.rotateZ(u.tilt);
      c.scale.setScalar(1 + u.hover * 0.12);
    });
    dustPts.rotation.y = t * 0.01;
    composer.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    resize,
    begin() { if (!started) { started = true; t0 = performance.now(); } },
    pause() { running = false; },
    resume() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } },
  };
}
