/*
 * The loader's centrepiece: the home page's archangel, descending in a shaft
 * of light. White wings open wide as he arrives, mist rolls at his feet and
 * light dust drifts up through the beams. It sits behind the loading line and
 * the sound choice, and stops drawing once the loader has gone.
 *
 * Model: "Summoner's War: Archangel" on Sketchfab (CC BY 4.0), see
 * webgl/models/seraphs/CREDITS.md.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

const loaderEl = document.querySelector('.loader');
const host = document.querySelector('.loader_paper-full');
if (loaderEl && host) start();

function visible() {
  const cs = getComputedStyle(loaderEl);
  return cs.display !== 'none' && cs.visibility !== 'hidden' && document.body.contains(loaderEl);
}

function softTexture(draw, w = 256, h = 256) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function start() {
  const canvas = document.createElement('canvas');
  canvas.className = 'celestial-loader-canvas';
  host.appendChild(canvas);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { canvas.remove(); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const look = new THREE.Vector3(0, 1.35, 0);

  // light: a cold white beam from straight above, warm gold from behind, a dim blue fill
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x0b1026, 0.8));
  const beam = new THREE.SpotLight(0xffffff, 60, 14, 0.42, 0.6, 1.2);
  beam.position.set(0, 7, 1.2); beam.target.position.set(0, 1, 0); scene.add(beam, beam.target);
  const rim = new THREE.DirectionalLight(0xffcf7a, 3.2); rim.position.set(-2.5, 3, -3); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xbfd2ff, 2.0); rim2.position.set(2.5, 2, -3); scene.add(rim2);
  const front = new THREE.DirectionalLight(0xfff3dc, 0.9); front.position.set(0, 1.5, 5); scene.add(front);

  // shafts of light falling from above, behind him
  const rayTex = softTexture((g, w, h) => {
    const lin = g.createLinearGradient(0, 0, 0, h);
    lin.addColorStop(0, 'rgba(255,255,255,0.9)'); lin.addColorStop(0.55, 'rgba(255,240,210,0.25)'); lin.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = lin; g.fillRect(0, 0, w, h);
    // soft side edges
    const side = g.createLinearGradient(0, 0, w, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(0.5, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = side; g.fillRect(0, 0, w, h);
  }, 64, 256);
  const rays = [];
  [[-0.9, 0.16, 1.1], [-0.35, -0.05, 0.7], [0.15, 0.08, 1.4], [0.7, -0.12, 0.8], [1.15, 0.2, 0.6]].forEach(([x, tilt, wd], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wd, 9), new THREE.MeshBasicMaterial({
      map: rayTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.18, side: THREE.DoubleSide
    }));
    m.position.set(x, 4.2, -1.6 - i * 0.15); m.rotation.z = tilt;
    m.userData.phase = Math.random() * 6; m.userData.base = 0.12 + Math.random() * 0.1;
    scene.add(m); rays.push(m);
  });

  // a glow on the ground where the beam lands
  const poolTex = softTexture((g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,246,226,0.7)'); r.addColorStop(0.4, 'rgba(214,190,140,0.18)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.03; scene.add(pool);

  // mist rolling at his feet
  const mistTex = softTexture((g, w, h) => {
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * w, y = h * (0.35 + Math.random() * 0.3), r = 30 + Math.random() * 70;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(200,210,235,0.16)'); rg.addColorStop(1, 'rgba(200,210,235,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    }
  }, 512, 256);
  mistTex.wrapS = THREE.RepeatWrapping;
  const mists = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.4), new THREE.MeshBasicMaterial({ map: mistTex.clone(), transparent: true, depthWrite: false, opacity: 0.5 - i * 0.08 }));
    m.material.map.wrapS = THREE.RepeatWrapping; m.material.map.needsUpdate = true;
    m.position.set(0, 0.35 + i * 0.12, 1.4 - i * 1.1);
    m.userData.speed = (i % 2 ? -1 : 1) * (0.008 + i * 0.004);
    scene.add(m); mists.push(m);
  }

  // light dust drifting up through the beams
  const N = 700, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.pow(Math.random(), 0.6) * 3.2;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * 5 - 0.4; pos[i * 3 + 2] = Math.sin(a) * r - 0.6;
    seed[i] = Math.random();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute float seed; uniform float uTime; uniform float uScale; varying float vA; varying float vWarm;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uTime * (0.08 + seed * 0.18) + 0.4, 5.0) - 0.4;
        p.x += sin(uTime * 0.5 + seed * 20.0) * 0.1;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.2 + seed * 3.0) * uScale * (7.0 / -mv.z);
        // brightest inside the central beam
        float inBeam = 1.0 - smoothstep(0.4, 2.2, abs(p.x));
        vA = smoothstep(-0.4, 0.6, p.y) * (1.0 - smoothstep(3.8, 4.6, p.y)) * (0.25 + 0.75 * inBeam) * (0.4 + 0.6 * fract(seed * 7.13 + uTime * 0.2));
        vWarm = seed;
      }`,
    fragmentShader: `
      varying float vA; varying float vWarm;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        gl_FragColor = vec4(mix(vec3(1.0), vec3(1.0, 0.85, 0.55), vWarm), a);
      }`
  });
  scene.add(new THREE.Points(dustGeo, dustMat));

  // ---------- the sanctuary: platform, rune ring, colonnade, halo, floating shards ----------
  const sanctum = new THREE.Group();
  scene.add(sanctum);
  const marbleTex = softTexture((g, w, h) => {
    g.fillStyle = '#d9d4ca'; g.fillRect(0, 0, w, h);
    // faint veins
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = `rgba(120,115,110,${0.06 + Math.random() * 0.08})`; g.lineWidth = 0.6 + Math.random() * 1.6;
      g.beginPath(); let x = Math.random() * w, y = 0; g.moveTo(x, y);
      while (y < h) { x += (Math.random() - 0.5) * 30; y += 12 + Math.random() * 20; g.lineTo(x, y); }
      g.stroke();
    }
  }, 256, 512);
  marbleTex.wrapS = marbleTex.wrapT = THREE.RepeatWrapping;
  const marble = new THREE.MeshStandardMaterial({ map: marbleTex, color: 0x3c4152, roughness: 0.6, metalness: 0.1 });
  const marbleFar = new THREE.MeshStandardMaterial({ map: marbleTex, color: 0x262a38, roughness: 0.7, metalness: 0.05 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd6b062, roughness: 0.3, metalness: 0.9, emissive: 0x3a2808 });

  // the round platform he lands on, stepped, with a gold lip
  const disc = (r, hgt, y, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.02, hgt, 96), mat); m.position.y = y; sanctum.add(m); return m; };
  disc(1.75, 0.12, -0.06, marble); disc(2.05, 0.1, -0.17, marble); disc(2.35, 0.09, -0.26, marbleFar);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.018, 8, 160), gold); lip.rotation.x = Math.PI / 2; lip.position.y = 0.005; sanctum.add(lip);

  // a ring of runes glowing on the platform, slowly turning
  const runeTex = softTexture((g, w, h) => {
    const c = w / 2;
    g.translate(c, c);
    const ring = (r, lw, a) => { g.strokeStyle = `rgba(255,214,140,${a})`; g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
    ring(c * 0.96, 3, 0.9); ring(c * 0.9, 1.2, 0.6); ring(c * 0.62, 2, 0.7); ring(c * 0.58, 1, 0.45);
    g.fillStyle = 'rgba(255,220,150,0.85)'; g.font = `${Math.round(c * 0.085)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
    for (let i = 0; i < 48; i++) {
      g.save(); g.rotate(i / 48 * Math.PI * 2); g.translate(0, -c * 0.76); g.fillText(glyphs[i % glyphs.length], 0, 0); g.restore();
    }
    // an eight-pointed star in the middle
    g.strokeStyle = 'rgba(255,214,140,0.55)'; g.lineWidth = 1.5;
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      for (let i = 0; i <= 4; i++) { const a = i / 4 * Math.PI * 2 + k * Math.PI / 4; const x = Math.cos(a) * c * 0.55, y = Math.sin(a) * c * 0.55; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
  }, 1024, 1024);
  const runes = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 3.3), new THREE.MeshBasicMaterial({ map: runeTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
  runes.rotation.x = -Math.PI / 2; runes.position.y = 0.012; sanctum.add(runes);

  // a broken colonnade in an arc behind him
  const colGeo = new THREE.CylinderGeometry(0.2, 0.23, 1, 20, 1);
  const capGeo = new THREE.BoxGeometry(0.6, 0.16, 0.6);
  const COLS = 9, R = 7.5;
  for (let i = 0; i < COLS; i++) {
    const a = Math.PI * (0.12 + 0.76 * i / (COLS - 1));
    const x = Math.cos(a) * R, z = -Math.sin(a) * R - 0.6;
    const broken = i === 1 || i === 6;
    const hgt = broken ? 1.6 + Math.random() * 1.4 : 5.2;
    const col = new THREE.Group(); col.position.set(x, -0.42, z);
    const base = new THREE.Mesh(capGeo, marbleFar); base.position.y = 0.08; col.add(base);
    const shaft = new THREE.Mesh(colGeo, marbleFar); shaft.scale.y = hgt; shaft.position.y = 0.16 + hgt / 2; col.add(shaft);
    if (!broken) {
      const cap = new THREE.Mesh(capGeo, marbleFar); cap.position.y = 0.24 + hgt; col.add(cap);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 6, 24), gold); band.rotation.x = Math.PI / 2; band.position.y = hgt; col.add(band);
    } else {
      shaft.rotation.z = (Math.random() - 0.5) * 0.06;
      // a fallen drum at its foot
      const drum = new THREE.Mesh(colGeo, marbleFar); drum.scale.y = 0.7; drum.rotation.z = Math.PI / 2; drum.rotation.y = Math.random() * 3; drum.position.set(0.5, 0.25, 0.4); col.add(drum);
    }
    sanctum.add(col);
  }
  // an architrave across the three middle columns
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.32, 0.6), marbleFar);
  lintel.position.set(0, 5.05, -R - 0.65); sanctum.add(lintel);

  // a great halo turning slowly behind him
  const haloRing = new THREE.Group(); haloRing.position.set(0, 1.6, -2.6); sanctum.add(haloRing);
  const hr1 = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.025, 8, 200), gold); haloRing.add(hr1);
  const hr2 = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.01, 6, 200), gold); haloRing.add(hr2);
  for (let i = 0; i < 24; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, i % 3 ? 0.14 : 0.3, 0.02), gold);
    const a = i / 24 * Math.PI * 2; sp.position.set(Math.cos(a) * 2.15, Math.sin(a) * 2.15, 0); sp.rotation.z = a - Math.PI / 2; haloRing.add(sp);
  }

  // stone shards floating around the sanctuary
  const shards = [];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.DodecahedronGeometry(0.05 + Math.random() * 0.1, 0);
    g.scale(1, 0.55 + Math.random() * 0.6, 1);
    const m = new THREE.Mesh(g, marbleFar);
    const a = Math.PI * (0.05 + Math.random() * 0.9), r = 3.4 + Math.random() * 3.0;
    m.position.set(Math.cos(a) * r, 0.4 + Math.random() * 3.6, -Math.sin(a) * r * 0.8 - 0.8);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    m.userData = { y: m.position.y, ph: Math.random() * 6, sp: 0.2 + Math.random() * 0.4 };
    scene.add(m); shards.push(m);
  }
  sanctum.traverse((o) => { if (o.isMesh) o.material.userData.fade = true; });

  // the archangel
  const stage = new THREE.Group();
  scene.add(stage);
  let figure = null, mixer = null, shown = 0, wings = [], mats = [];
  const norm = (n) => String(n || '').replace(/_\d+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  new GLTFLoader().load('/webgl/models/seraphs/archon.glb', (gltf) => {
    const m = gltf.scene;
    m.traverse((o) => {
      if (o.isBone && /^bonewing(l|r)(u|d)00$/.test(norm(o.name))) wings.push(o);
      if (!o.isMesh) return;
      // his floating blade is left out here: on the home page it is in his raised hand
      if (/^archangellightwarchangellightbody0?$/.test(norm(o.name))) { o.visible = false; return; }
      o.frustumCulled = false;
      const mat = o.material;
      if (mat.emissive) { mat.emissive.setHex(0x5c5a56); if (mat.map && !mat.emissiveMap) mat.emissiveMap = mat.map; }
      mat.transparent = true; mat.opacity = 0;
      mats.push(mat);
    });
    const clips = gltf.animations;
    const stand = clips.find((c) => /lobbystand00/i.test(c.name)) || clips.find((c) => /stand/i.test(c.name)) || clips[0];
    const intro = clips.find((c) => /lobbyintro/i.test(c.name));
    if (clips.length) mixer = new THREE.AnimationMixer(m);
    // measure him in his standing pose, so the hover he settles into is the one framed
    if (mixer && stand) { const a = mixer.clipAction(stand); a.play(); mixer.update(0); }
    m.updateMatrixWorld(true);
    let hips = null;
    m.traverse((o) => { if (!hips && o.isBone && /pelvis$/.test(norm(o.name))) hips = o; });
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const hp = hips ? hips.getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
    const k = 2.5 / size.y;
    m.scale.setScalar(k);
    m.position.set(-hp.x * k, -box.min.y * k, -hp.z * k);
    if (mixer) {
      mixer.stopAllAction();
      if (intro) {
        const a = mixer.clipAction(intro); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play();
        mixer.addEventListener('finished', () => { const st = mixer.clipAction(stand); st.reset().play(); a.crossFadeTo(st, 0.6, false); });
      } else mixer.clipAction(stand).play();
    }
    figure = m; figure.userData.hips = hips;
    stage.add(m);
  });

  function resize() {
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // a low camera looking up at him; further back on narrow screens so the wings fit
    const narrow = w / h < 0.8;
    camera.position.set(0, 0.6, narrow ? 13.5 : 8.8);
    look.y = narrow ? 0.85 : 0.95;
    camera.lookAt(look);
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  // once a sound choice is made the scene behind takes over with the same hero:
  // this one fades straight out so the two never overlap
  let leaving = 0;
  document.querySelectorAll('.loader_sound-btn').forEach((b) => b.addEventListener('click', () => {
    leaving = leaving || 1e-3;
    // the whole sanctuary goes with him, before the page opens onto the scene
    canvas.style.transition = 'opacity .35s ease';
    canvas.style.opacity = '0';
  }));

  const t0 = performance.now();
  let last = t0;
  function frame(now) {
    if (!visible()) { renderer.dispose(); canvas.remove(); removeEventListener('resize', resize); return; }
    const t = (now - t0) / 1000, dt = Math.min(0.1, (now - last) / 1000); last = now;
    dustMat.uniforms.uTime.value = t;
    rays.forEach((r) => { r.material.opacity = r.userData.base * (0.75 + 0.25 * Math.sin(t * 0.7 + r.userData.phase)); });
    mists.forEach((m) => { m.material.map.offset.x += m.userData.speed * dt; });
    if (mixer) mixer.update(dt);
    if (figure) {
      // he descends into the beam, then hovers; the wings open wide as he lands
      shown = Math.min(1, shown + dt * 0.55);
      const e = 1 - Math.pow(1 - shown, 3);
      stage.position.y = (1 - e) * 1.2 + Math.sin(t * 0.9) * 0.04;
      stage.rotation.y = Math.sin(t * 0.3) * 0.12;
      // keep his body centred in the beam whatever his animation does
      const hb = figure.userData.hips;
      if (hb) {
        const hpw = hb.getWorldPosition(new THREE.Vector3());
        figure.position.x -= (hpw.x - 0) * Math.min(1, dt * 3);
        figure.position.z -= (hpw.z - 0) * Math.min(1, dt * 3);
      }
      wings.forEach((b) => b.scale.setScalar(0.8 + 0.6 * e));
      if (leaving) leaving = Math.min(1, leaving + dt * 3);
      const op = e * (1 - leaving);
      mats.forEach((mt) => { mt.opacity = op; mt.transparent = op < 1; mt.depthWrite = op > 0.5; });
      figure.visible = op > 0.01;
    }
    runes.rotation.z = t * 0.06;
    runes.material.opacity = 0.65 + Math.sin(t * 1.6) * 0.2;
    haloRing.rotation.z = -t * 0.08;
    shards.forEach((m) => { m.position.y = m.userData.y + Math.sin(t * m.userData.sp + m.userData.ph) * 0.15; m.rotation.y += dt * m.userData.sp * 0.4; m.rotation.x += dt * 0.05; });
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
