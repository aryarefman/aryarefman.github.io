// The window torn into the paper: a red-lit void where Arya stands on a glowing floor of slow ripples, under an
// arch, with the eight projects orbiting as paper cards (picture on the front, bare paper on the back).
// The camera starts close on the face and pulls back; dragging or scrolling spins the ring of cards.
import * as THREE from "three";

const RED = new THREE.Color(0xff3a1e);

function floorMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uRed; varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float glow = pow(clamp(1.0 - d, 0.0, 1.0), 1.7);
        float rings = 0.5 + 0.5 * sin(d * 150.0 - uTime * 1.6);                    // fine ripples spreading out
        float hot = exp(-d * d * 90.0);                                             // the bright spot under the figure
        vec3 col = uRed * glow * (0.78 + 0.22 * rings) + vec3(1.0, 0.75, 0.62) * hot * 0.55;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// the photo, lit only from behind: dark in the middle, a red rim where the silhouette meets the light
function figureMaterial(map, uniforms, mirror) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uMap: { value: map }, uMirror: { value: mirror ? 1 : 0 } },
    transparent: true, depthWrite: false, depthTest: !mirror,   // the reflection lies under the floor, so it draws over it
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec3 uRed; uniform float uMirror, uTime; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(uMap, vUv);
        if (c.a < 0.02) discard;
        // how much of the neighbourhood is empty: high at the silhouette edge
        float e = 0.0; vec2 o = vec2(0.012, 0.007);
        e += texture2D(uMap, vUv + vec2(o.x, 0)).a + texture2D(uMap, vUv - vec2(o.x, 0)).a;
        e += texture2D(uMap, vUv + vec2(0, o.y)).a + texture2D(uMap, vUv - vec2(0, o.y)).a;
        float rim = clamp(1.0 - e / 4.0, 0.0, 1.0) * 2.4;
        float lum = dot(c.rgb, vec3(0.3, 0.59, 0.11));
        vec3 body = mix(vec3(lum) * 0.32, c.rgb * 0.42, 0.45) * mix(vec3(1.0), uRed * 1.4, 0.35);
        vec3 col = body + uRed * (rim + 0.18 * (1.0 - vUv.y));                     // red bounce from the floor below
        float a = c.a;
        if (uMirror > 0.5) { a *= 0.2 * (1.0 - smoothstep(0.2, 0.9, vUv.y)); col *= 0.8; }   // the reflection fades toward the head
        gl_FragColor = vec4(col, a);
      }`,
  });
}

function cardMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uHover: { value: 0 } },
    side: THREE.DoubleSide,
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uHover; varying vec2 vUv;
      void main() {
        vec3 paper = vec3(0.56, 0.54, 0.5);
        if (!gl_FrontFacing) { gl_FragColor = vec4(paper * 0.8, 1.0); return; }   // the back is bare paper
        vec3 c = texture2D(uMap, vUv).rgb;
        float g = dot(c, vec3(0.3, 0.59, 0.11));
        c = mix(mix(vec3(g) * 0.85, paper, 0.25), c, 0.35 + 0.65 * uHover);       // muted until hovered
        float edge = step(vUv.x, 0.012) + step(0.988, vUv.x) + step(vUv.y, 0.02) + step(0.98, vUv.y);
        c = mix(c, vec3(1.0, 0.23, 0.12), min(1.0, edge) * uHover);                 // a red frame on the hovered card
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

export function createPaperScene(canvas, { images, onPick, onHover, reduceMotion = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(0x040101);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x040101, 0.035);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const uniforms = { uTime: { value: 0 }, uRed: { value: RED } };

  const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 96), floorMaterial(uniforms));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  // the arch behind the figure, with a soft additive halo
  const arch = new THREE.Group(); arch.position.set(0, 0, -6.5); scene.add(arch);
  arch.add(new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.05, 12, 160), new THREE.MeshBasicMaterial({ color: 0xff5a3a })));
  arch.add(new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.55, 12, 160), new THREE.MeshBasicMaterial({ color: 0x8a0c04, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })));

  // stars far away and embers drifting up off the floor
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const starPos = [];
  for (let i = 0; i < 1600; i++) { const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 0.9), r = 40 + rnd() * 40; starPos.push(Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r * 0.8 + 2, Math.sin(ph) * Math.sin(th) * r - 10); }
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({ color: 0xffe6dc, size: 0.09, sizeAttenuation: true, fog: false }));
  scene.add(stars);
  const EMB = 260, embPos = new Float32Array(EMB * 3), embSeed = [];
  for (let i = 0; i < EMB; i++) embSeed.push([(rnd() - 0.5) * 14, rnd() * 6, (rnd() - 0.5) * 10 - 1, 0.15 + rnd() * 0.35]);
  const embGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(embPos, 3));
  const embers = new THREE.Points(embGeo, new THREE.PointsMaterial({ color: 0xffb08a, size: 0.05, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(embers);

  // the figure and its reflection
  const loader = new THREE.TextureLoader();
  const figTex = loader.load("img/arya-waterfall.webp"); figTex.colorSpace = THREE.SRGBColorSpace;
  const FH = 2.7, FW = FH * 760 / 1264;
  const figure = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), figureMaterial(figTex, uniforms, false));
  figure.position.set(0, FH / 2 - 0.05, 0); scene.add(figure);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), figureMaterial(figTex, uniforms, true));
  mirror.scale.y = -1; mirror.position.set(0, -FH / 2 + 0.05, 0); mirror.renderOrder = 1; scene.add(mirror);

  // the ring of project cards, slightly curved like held paper
  const ring = new THREE.Group(); scene.add(ring);
  const R = 4.6, cards = [];
  images.forEach((src, i) => {
    const tex = loader.load(src); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(1.75, 1.12, 16, 1);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setZ(k, -Math.pow(pos.getX(k) / 0.875, 2) * 0.09);
    const card = new THREE.Mesh(geo, cardMaterial(tex));
    const a = (i / images.length) * Math.PI * 2;
    card.userData = { index: i, angle: a, baseY: 1.3 + (i % 3) * 0.55, hover: 0, bob: rnd() * 6 };
    card.position.set(Math.sin(a) * R, card.userData.baseY, Math.cos(a) * R);
    card.rotation.y = a;                           // the picture faces outward, toward the camera when in front
    card.rotation.z = (rnd() - 0.5) * 0.12;
    ring.add(card); cards.push(card);
  });

  // camera: an intro dolly from the face out to the wide shot, then a gentle parallax with the pointer
  const camFrom = { pos: new THREE.Vector3(0, 2.25, 2.1), look: new THREE.Vector3(0, 2.2, 0) };
  const camTo = { pos: new THREE.Vector3(0, 3.1, 11.5), look: new THREE.Vector3(0, 1.35, 0) };
  const look = new THREE.Vector3();
  let intro = reduceMotion ? 1 : 0, started = false, spin = 0, spinVel = 0.06, target = null, hovered = -1, listHover = -1;
  const pointer = new THREE.Vector2(9, 9), ray = new THREE.Raycaster(), par = { x: 0, y: 0 };

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 50 : 38;                 // portrait screens need a wider lens and a longer pull-back to keep the ring in view
    const a = w / h; camTo.pos.set(0, a < 1 ? 3.6 : 3.1, a < 1 ? 11.5 + (1 - a) * 12 : 11.5);
    camera.updateProjectionMatrix();
  }
  resize();

  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    par.x = pointer.x; par.y = pointer.y;
    if (drag) { spinVel = 0; spin += (e.clientX - drag) * 0.006; drag = e.clientX; target = null; }
  });
  canvas.addEventListener("pointerleave", () => pointer.set(9, 9));
  let drag = null, dragDist = 0, downX = 0;
  canvas.addEventListener("pointerdown", (e) => { drag = e.clientX; downX = e.clientX; dragDist = 0; });
  addEventListener("pointerup", (e) => {
    if (drag === null) return;
    dragDist = Math.abs(e.clientX - downX); drag = null;
    if (dragDist < 6 && hovered >= 0) onPick?.(hovered);
  });

  function focus(i) {   // turn the ring so card i comes to the front (angle 0 faces the camera)
    const a = cards[i].userData.angle, cur = spin;
    let goal = -a; goal += Math.round((cur - goal) / (Math.PI * 2)) * Math.PI * 2;
    target = goal;
  }

  let last = performance.now(), running = true;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = reduceMotion ? 0 : now / 1000;
    uniforms.uTime.value = t;
    if (started) intro = Math.min(1, intro + dt / 4.2);   // held on the face until the visitor enters
    const e = 1 - Math.pow(1 - intro, 3);

    if (target !== null) { spin += (target - spin) * Math.min(1, dt * 3); if (Math.abs(target - spin) < 0.002) target = null; }
    else if (!drag && !reduceMotion) spin += spinVel * dt;
    ring.rotation.y = spin;

    camera.position.lerpVectors(camFrom.pos, camTo.pos, e);
    camera.position.x += par.x * 0.6 * e; camera.position.y += par.y * 0.3 * e;
    look.lerpVectors(camFrom.look, camTo.look, e);
    camera.lookAt(look);

    // hover picking (only after the intro, once the cards are in view)
    let hit = -1;
    if (intro > 0.8 && pointer.x < 2) {
      ray.setFromCamera(pointer, camera);
      const h = ray.intersectObjects(cards, false)[0];
      if (h && h.face && h.object.userData) {
        const front = h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(ray.ray.direction) < 0;
        if (front) hit = h.object.userData.index;
      }
    }
    canvas.style.cursor = hit >= 0 ? "pointer" : "grab";
    const want = hit >= 0 ? hit : listHover;           // a hovered row in the cases list lights its card too
    if (want !== hovered) { hovered = want; if (hit >= 0 || listHover < 0) onHover?.(hit); }

    cards.forEach((c) => {
      const u = c.userData; u.hover += ((u.index === hovered ? 1 : 0) - u.hover) * Math.min(1, dt * 8);
      c.material.uniforms.uHover.value = u.hover;
      c.position.y = u.baseY + Math.sin(t * 0.8 + u.bob) * 0.08 + u.hover * 0.15;
      c.scale.setScalar(1 + u.hover * 0.08);
    });

    for (let i = 0; i < EMB; i++) {
      const s = embSeed[i], y = (s[1] + t * s[3]) % 6;
      embPos[i * 3] = s[0] + Math.sin(t * 0.5 + i) * 0.2; embPos[i * 3 + 1] = y; embPos[i * 3 + 2] = s[2];
    }
    embGeo.attributes.position.needsUpdate = true;
    figure.position.y = FH / 2 - 0.05 + Math.sin(t * 0.9) * 0.015;        // breathing

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    resize, focus,
    begin() { started = true; },
    hover(i) { listHover = i; if (i >= 0) focus(i); },
    spinBy(v) { spin += v; target = null; },
    pause() { running = false; },
    resume() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } },
  };
}
