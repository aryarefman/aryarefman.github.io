// The loader's solar system, drawn with three.js: real spheres lit by the Sun, each spinning on its own axis
// while it orbits. Surfaces are painted at start-up from 3D noise, so there are no texture files to download.
import * as THREE from "three";

const TAU = Math.PI * 2;

function noise3(x, y, z, seed) {
  const h = (i, j, k) => { const v = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + seed * 19.3) * 43758.5453; return v - Math.floor(v); };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (q) => q * q * (3 - 2 * q), u = s(xf), v = s(yf), w = s(zf), L = (a, b, q) => a + (b - a) * q;
  return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), u), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
           L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}
function fbm(x, y, z, seed, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += a * noise3(x * f, y * f, z * f, seed + i); a *= 0.5; f *= 2.03; }
  return v;
}
const mix = (a, b, q) => [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, a[2] + (b[2] - a[2]) * q];
const ramp = (stops, q) => {
  q = Math.min(1, Math.max(0, q));
  for (let i = 1; i < stops.length; i++) if (q <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], Math.max(0, (q - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0])));
  return stops[stops.length - 1][1];
};

// paint(x, y, z) -> [r, g, b, a?] for each texel of an equirectangular map, sampled on the unit sphere (no seam)
function paintTexture(paint, w = 256, h = 128) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    const lat = (0.5 - (j + 0.5) / h) * Math.PI;
    for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w) * TAU, o = paint(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)), k = (j * w + i) * 4;
      img.data[k] = o[0]; img.data[k + 1] = o[1]; img.data[k + 2] = o[2]; img.data[k + 3] = o[3] ?? 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const SURFACES = {
  sun: (x, y, z) => ramp([[0.3, [255, 120, 30]], [0.55, [255, 176, 70]], [0.8, [255, 232, 160]]], fbm(x * 6, y * 6, z * 6, 2)),
  mercury: (x, y, z) => {
    const c = ramp([[0.3, [96, 90, 86]], [0.7, [170, 162, 156]]], fbm(x * 3, y * 3, z * 3, 5));
    return fbm(x * 9, y * 9, z * 9, 8) > 0.62 ? mix(c, [70, 66, 62], 0.6) : c;
  },
  venus: (x, y, z) => ramp([[0, [196, 150, 84]], [0.5, [236, 206, 150]], [1, [250, 236, 200]]], 0.5 + 0.5 * Math.sin(y * 6 + fbm(x * 2, y * 2, z * 2, 11) * 5)),
  earth: (x, y, z) => {
    if (Math.abs(y) > 0.88) return [240, 246, 255];
    const h = fbm(x * 1.8, y * 1.8, z * 1.8, 21);
    if (h < 0.52) return ramp([[0.25, [12, 38, 104]], [0.52, [36, 104, 190]]], h);
    return ramp([[0.52, [214, 198, 140]], [0.56, [68, 136, 62]], [0.7, [42, 96, 48]], [0.8, [120, 102, 78]]], h);
  },
  clouds: (x, y, z) => { const c = fbm(x * 3, y * 4.5, z * 3, 33); return [255, 255, 255, Math.min(220, Math.max(0, (c - 0.52) * 4) * 255)]; },
  mars: (x, y, z) => {
    const h = fbm(x * 2.2, y * 2.2, z * 2.2, 1);
    let c = ramp([[0.3, [110, 40, 24]], [0.5, [184, 82, 46]], [0.7, [226, 140, 88]]], h);
    if (Math.abs(y) + (h - 0.5) * 0.2 > 0.9) c = [244, 236, 230];
    return c;
  },
  jupiter: (x, y, z) => {
    const w = fbm(x * 3, y * 3, z * 3, 7) * 0.6;
    let c = ramp([[0, [150, 98, 60]], [0.35, [206, 160, 116]], [0.65, [240, 222, 194]], [1, [182, 126, 84]]], 0.5 + 0.5 * Math.sin(y * 16 + w * 3));
    const spot = Math.hypot((x - 0.55) * 1, (y + 0.36) * 1.9, (z - 0.72) * 1);
    if (spot < 0.2) c = mix(c, [196, 84, 52], Math.min(1, (0.2 - spot) * 10));
    return c;
  },
  saturn: (x, y, z) => ramp([[0, [176, 136, 80]], [0.5, [232, 204, 150]], [1, [246, 230, 196]]], 0.5 + 0.5 * Math.sin(y * 12 + fbm(x * 3, y * 3, z * 3, 4) * 2)),
  uranus: (x, y, z) => ramp([[0, [120, 204, 214]], [1, [180, 236, 240]]], 0.5 + 0.3 * Math.sin(y * 5) + 0.2 * fbm(x * 2, y * 2, z * 2, 6)),
  neptune: (x, y, z) => {
    let c = ramp([[0, [30, 60, 170]], [0.5, [56, 104, 220]], [1, [110, 160, 250]]], 0.5 + 0.5 * Math.sin(y * 8 + fbm(x * 2.5, y * 2.5, z * 2.5, 3) * 3));
    if (Math.hypot(x - 0.7, y + 0.3, z - 0.6) < 0.25) c = mix(c, [16, 28, 90], 0.8);
    return c;
  },
};

// radius, orbit radius, orbit period (s), spin period (s, negative = backwards), axial tilt
const PLANETS = [
  ["mercury", 0.34, 3.4, 2.4, 9, 0.03],
  ["venus", 0.58, 4.8, 3.6, -14, 0.05],
  ["earth", 0.62, 6.4, 5, 3.2, 0.41],
  ["mars", 0.46, 8.0, 6.6, 3.4, 0.44],
  ["jupiter", 1.2, 12.4, 10, 1.6, 0.05],
  ["saturn", 1.0, 16.0, 14, 1.8, 0.47],
  ["uranus", 0.7, 19.4, 19, 2.6, 1.71],
  ["neptune", 0.68, 22.4, 24, 2.8, 0.49],
];

export function startOrrery(canvas) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { return { stop() {} }; }
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
  scene.add(new THREE.AmbientLight(0x6670a0, 0.18));                    // night sides stay just visible
  scene.add(new THREE.PointLight(0xfff1dc, 3.2, 0, 0));                  // the Sun lights everything from the centre

  const sun = new THREE.Mesh(new THREE.SphereGeometry(1.7, 48, 32), new THREE.MeshBasicMaterial({ map: paintTexture(SURFACES.sun) }));
  scene.add(sun);
  const glowCanvas = document.createElement("canvas"); glowCanvas.width = glowCanvas.height = 128;
  { const g = glowCanvas.getContext("2d"), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255,210,140,0.9)"); r.addColorStop(0.3, "rgba(255,150,60,0.35)"); r.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = r; g.fillRect(0, 0, 128, 128); }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowCanvas), blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(9); scene.add(glow);

  const orbitMat = new THREE.LineBasicMaterial({ color: 0xc8c0ff, transparent: true, opacity: 0.16 });
  const ring = (r) => { const pts = []; for (let i = 0; i <= 128; i++) pts.push(new THREE.Vector3(Math.cos((i / 128) * TAU) * r, 0, Math.sin((i / 128) * TAU) * r)); return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), orbitMat); };

  const bodies = PLANETS.map(([name, r, dist, period, spin, tilt], i) => {
    scene.add(ring(dist));
    const pivot = new THREE.Group(); pivot.rotation.y = i * 1.7; scene.add(pivot);
    const holder = new THREE.Group(); holder.position.x = dist; holder.rotation.z = tilt; pivot.add(holder);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), new THREE.MeshStandardMaterial({ map: paintTexture(SURFACES[name]), roughness: 0.9, metalness: 0 }));
    holder.add(ball);
    if (name === "earth") {
      ball.add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.03, 48, 32), new THREE.MeshStandardMaterial({ map: paintTexture(SURFACES.clouds), transparent: true, depthWrite: false })));
      const moonPivot = new THREE.Group(); pivot.add(moonPivot); moonPivot.position.x = dist;
      const moon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 24, 16), new THREE.MeshStandardMaterial({ color: 0xcfcac4, roughness: 1 }));
      moon.position.x = 0.95; moonPivot.add(moon);
      holder.userData.moon = moonPivot;
    }
    if (name === "saturn" || name === "uranus") {
      const bands = name === "saturn" ? [[1.3, 1.55, 0xd9b27a, 0.6], [1.6, 2.05, 0xf1d6a4, 0.8], [2.1, 2.3, 0xb48a5a, 0.5]] : [[1.5, 1.6, 0xbfeff3, 0.35]];
      bands.forEach(([a, b, color, op]) => {
        const m = new THREE.Mesh(new THREE.RingGeometry(r * a, r * b, 96), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, roughness: 1 }));
        m.rotation.x = -Math.PI / 2; holder.add(m);
      });
    }
    return { pivot, ball, holder, period, spin };
  });

  // asteroid belt between Mars and Jupiter
  const n = 700, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, d = 9.6 + Math.random() * 1.4; pos.set([Math.cos(a) * d, (Math.random() - 0.5) * 0.25, Math.sin(a) * d], i * 3); }
  const beltGeo = new THREE.BufferGeometry(); beltGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const belt = new THREE.Points(beltGeo, new THREE.PointsMaterial({ color: 0xb8aa98, size: 0.07, transparent: true, opacity: 0.7 }));
  scene.add(belt);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // keep Neptune's orbit inside the frame on any aspect ratio
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const dist = Math.max(46, (camera.aspect < 1 ? 15 : 26) / Math.tan(half));   // phones: let the outer orbits run off the sides
    // aim a little toward the near side so the whole ellipse fits
    camera.position.set(0, dist * 0.42, dist); camera.lookAt(0, 0, 3.5); camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize); resize();

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let running = true, last = performance.now(), time = 0;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!reduce) time += dt;
    sun.rotation.y = time * 0.15;
    for (const b of bodies) {
      b.pivot.rotation.y += reduce ? 0 : (TAU / b.period) * dt * 0.6;
      b.ball.rotation.y = (TAU * time) / b.spin;
      if (b.holder.userData.moon) b.holder.userData.moon.rotation.y = time * 2.4;
    }
    belt.rotation.y = time * 0.05;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return {
    stop() {
      running = false; removeEventListener("resize", resize);
      scene.traverse((o) => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
      renderer.dispose();
    },
  };
}
