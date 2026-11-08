// The Offices page's building in 3D: a glass skyscraper on a small city plot. The podium holds the
// lobby, every running office is one curtain-wall storey in its theme colours, the shaft steps in as it
// grows, and a crown with a rooftop sign and mast tops it off. Same voxel props and materials as the
// office scene. The canvas is transparent: the plot floats on the page like a diorama.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { C, B, G, mat, plant } from './office-props.js';
import { themeById } from './themes.js';
import { gridCell, gridSize } from './office-grid.js';

const W = 10, D = 10, SH = 7, LH = 6.4, CROWN = 18, R = 26; // shaft footprint, storey, podium, crown+mast, light radius
const PX = 18, PZ0 = -18, PZ1 = 22, GY = -2;                   // plot half-width, back and front edge, underside
const BAYS = 5, MAX_LIT = 12, RISE = .45, PI2 = Math.PI / 2, FILL = .72;
const MAXF = 5, PITCH = 2 * PX, PITCHZ = PZ1 - PZ0; // storeys per building; plots sit on a grid that fills a square first (office-grid.js)
const CLAY = '#B4502B', INK = '#2B2420';
const ORDER = [2, 1, 3, 0, 4]; // bays light up from the middle of the front face outward
// Every few storeys the shaft steps in, so a tall tower stays slim.
const tier = (i) => (i < 5 ? 1 : i < 9 ? .86 : .72);
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };
const fontReady = document.fonts?.load('600 64px "Pixelify Sans"').catch(() => {}) ?? Promise.resolve();

// A pane with a vertical colour gradient baked into its vertices: a faint sky reflection.
function pane(w, h, d, top, bot) {
  const g = new THREE.BoxGeometry(w, h, d), p = g.attributes.position, col = new Float32Array(p.count * 3);
  const a = new THREE.Color(top), b = new THREE.Color(bot), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { c.copy(b).lerp(a, p.getY(i) / h + .5); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const PW = 1.62, PH = 3.6, PD = .16;
const GEO = { dark: pane(PW, PH, PD, '#B4CCE0', '#52698A'), refl: pane(PW, PH, PD, '#E6F0F8', '#8CA9C6'), lit: pane(PW, PH, PD, '#FFE9B0', '#FFB347') };
const glass = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .12, metalness: .3, ...o });
const MAT = {
  dark: glass({ emissive: '#14202E', emissiveIntensity: .3 }),
  refl: glass({ emissive: '#2A3E52', emissiveIntensity: .25, roughness: .05 }),
  lit: glass({ emissive: '#FF9A2E', emissiveIntensity: .8, roughness: .4 }),
};
const LAMP = new THREE.MeshStandardMaterial({ color: '#FFE2B0', emissive: '#FFD28A', emissiveIntensity: .2 });
const BEACON = new THREE.MeshStandardMaterial({ color: '#FF6B4A', emissive: '#FF3B1A', emissiveIntensity: 1 });
const OUTLINE = new THREE.MeshBasicMaterial({ color: CLAY, side: THREE.BackSide });

function canvasTex(w, h, paint) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const draw = () => { paint(cv.getContext('2d'), w, h); tex.needsUpdate = true; };
  draw(); fontReady.then(draw);
  return tex;
}
function fit(x, text, max, from) {
  for (let size = from; size > 60; size -= 4) { x.font = `600 ${size}px "Pixelify Sans", "Geist", sans-serif`; if (x.measureText(text).width < max) break; }
}

// A lit name band: warm text on dark glass, the theme colour as an underline.
function sign(name, here, accent) {
  const text = name.length > 20 ? `${name.slice(0, 19)}…` : name;
  const tex = canvasTex(1536, 252, (x, w, h) => {
    x.fillStyle = '#1E1B26'; x.fillRect(0, 0, w, h);
    x.fillStyle = accent; x.fillRect(0, h - 20, w, 20);
    if (here) { x.strokeStyle = CLAY; x.lineWidth = 26; x.strokeRect(13, 13, w - 26, h - 26); }
    fit(x, text, w - 170, 150);
    x.fillStyle = '#FFE9C2'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 - 6);
  });
  return new THREE.MeshBasicMaterial({ map: tex });
}

const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
const inst = (kind, n = BAYS * 4) => { const m = new THREE.InstancedMesh(GEO[kind], MAT[kind], n); m.frustumCulled = false; m.count = 0; return m; };

// One storey: a body in the theme colour, a ribbon of glass bays on all four faces, a sign front and back.
function storey(o, here) {
  const g = new THREE.Group(), t = themeById(o.theme);
  const wall = new THREE.MeshStandardMaterial({ color: '#8CA3C0', roughness: .6, metalness: .2, emissive: '#FFE7C2', emissiveIntensity: 0 });
  const body = B(g, W, SH, D, wall, 0, 0, 0);
  B(g, W + .4, .3, D + .4, '#5E7391', 0, 0, 0);            // floor slab edge
  B(g, W + .2, .18, D + .2, t.swatch[2], 0, SH - .18, 0);  // the theme colour: a thin band between storeys
  [-W / 2, W / 2].forEach((x) => [-D / 2, D / 2].forEach((z) => B(g, .3, SH, .3, t.swatch[2], x, 0, z))); // corner fins
  const outline = new THREE.Mesh(new THREE.BoxGeometry(W + 1.6, SH + .5, D + 1.6), OUTLINE);
  outline.position.y = SH / 2; outline.visible = false; g.add(outline);
  const bays = { dark: inst('dark'), refl: inst('refl'), lit: inst('lit') };
  Object.values(bays).forEach((m) => g.add(m));
  const sm = sign(o.name, here, t.swatch[2]);
  [0, Math.PI].forEach((ry) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(8.8, 1.45), sm); p.rotation.y = ry; p.position.set(0, 1.2, (D / 2 + .06) * (ry ? -1 : 1)); g.add(p); });
  if (here) { // a small clay flag on the front right corner marks the office this page belongs to
    B(g, 1.8, .2, .2, C.dark, W / 2 + .9, 5.8, D / 2);
    B(g, .12, 1.2, 1.5, CLAY, W / 2 + 1.7, 4.6, D / 2);
  }
  const s = { key: '', o, group: g, body, wall, outline, bays, sign: sm, seed: o.url + o.name, h: 0, target: 1, tier: 1 };
  body.userData.storey = s;
  return s;
}

// Lit bays follow busy + manager; the rest are dark glass, some of them reflective.
function setBays(s, lit) {
  const n = { dark: 0, refl: 0, lit: 0 };
  for (let f = 0; f < 4; f++) for (let k = 0; k < BAYS; k++) {
    const r = f * BAYS + k, rank = f * BAYS + ORDER.indexOf(k);
    const kind = rank < lit ? 'lit' : hash(s.seed + r) < .22 ? 'refl' : 'dark';
    dummy.position.set(-W / 2 + (W / BAYS) * (k + .5), 4.1, D / 2 + .03).applyAxisAngle(up, f * PI2);
    dummy.rotation.set(0, f * PI2, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    s.bays[kind].setMatrixAt(n[kind]++, dummy.matrix);
  }
  for (const k in s.bays) { s.bays[k].count = n[k]; s.bays[k].instanceMatrix.needsUpdate = true; }
}

function tree(p, x, z, s = 1, y = 0) {
  const g = G(p, x, z); g.position.y = y; g.scale.setScalar(s);
  B(g, .6, 1.8, .6, '#6B5A3A', 0, 0, 0);
  B(g, 2.6, 2, 2.6, C.leaf, 0, 1.6, 0); B(g, 1.8, 1.5, 1.8, C.leaf3, .15, 3.4, -.1); B(g, 1, .8, 1, C.leaf2, -.1, 4.7, .15);
}

function groundShadow(scene) {
  const tex = canvasTex(128, 128, (x) => {
    const gr = x.createRadialGradient(64, 64, 6, 64, 64, 62);
    gr.addColorStop(0, 'rgba(43,36,32,.34)'); gr.addColorStop(.6, 'rgba(43,36,32,.14)'); gr.addColorStop(1, 'rgba(43,36,32,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * PX + 12, PZ1 - PZ0 + 12), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  m.rotation.x = -PI2; m.position.set(0, GY - .05, (PZ0 + PZ1) / 2); m.renderOrder = -1; scene.add(m);
}

const WATER = new THREE.MeshStandardMaterial({ color: '#7FB4D4', emissive: '#3C8FC0', emissiveIntensity: .12, roughness: .15, metalness: .1 });
const JET = new THREE.MeshStandardMaterial({ color: '#E4F4FC', emissive: '#9FD6F2', emissiveIntensity: .2, roughness: .2, transparent: true, opacity: .85 });
const UNIT = new THREE.BoxGeometry(1, 1, 1);
const FLOWERS = ['#E56B8C', '#F2C94C', '#F7EFE1', '#E8785A', '#B88BD6'];

// The plot: a park and a paved plaza round the tower, two streets, lamps. Repeated voxels are batched into instanced meshes.
function site(scene) {
  const cz = (PZ0 + PZ1) / 2, pd = PZ1 - PZ0, batch = new Map();
  groundShadow(scene);
  // vox: one voxel (bottom at y) added to the instanced batch of its colour; '@lamp' uses the glowing lamp material.
  const vox = (col, x, y, z, w, h, d, ry = 0) => {
    dummy.position.set(x, y + h / 2, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(w, h, d); dummy.updateMatrix();
    if (!batch.has(col)) batch.set(col, []);
    batch.get(col).push(dummy.matrix.clone());
  };
  const part = (cx, cz0, ry, col, dx, y, dz, w, h, d) => { const v = new THREE.Vector3(dx, 0, dz).applyAxisAngle(up, ry); vox(col, cx + v.x, y, cz0 + v.z, w, h, d, ry); };
  B(scene, 2 * PX, 1.6, pd, C.base, 0, GY, cz);
  B(scene, 2 * PX, .4, pd, '#A9AE9A', 0, -.4, cz);
  const road = (x0, x1, z0, z1) => B(scene, x1 - x0, .06, z1 - z0, '#55504C', (x0 + x1) / 2, 0, (z0 + z1) / 2, false);
  const flat = (col, x0, x1, z0, z1, h) => B(scene, x1 - x0, h, z1 - z0, col, (x0 + x1) / 2, 0, (z0 + z1) / 2, false);
  road(-PX, PX, 14, 20); road(12.5, 16.5, PZ0, 14);
  flat('#D3CABB', -PX, PX, 20, PZ1, .08); flat('#D3CABB', 16.5, PX, PZ0, 14, .08);
  flat('#8DAF78', -PX, 12.5, PZ0, 14, .1); // the lawn
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, .05, .22), mat('#EDE6D6'), 40);
  let nd = 0;
  for (let x = -PX + 1; x < PX - 1; x += 3.4) { dummy.position.set(x, .08, 17); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); dashes.setMatrixAt(nd++, dummy.matrix); }
  for (let z = PZ0 + 1; z < 13; z += 3.4) { dummy.position.set(14.5, .08, z); dummy.rotation.set(0, PI2, 0); dummy.updateMatrix(); dashes.setMatrixAt(nd++, dummy.matrix); }
  dashes.count = nd; scene.add(dashes);

  // Plaza in front of the lobby: a checkerboard of two stones with a darker border.
  for (let i = 0; i < 10; i++) for (let j = 0; j < 3; j++) vox((i + j) % 2 ? '#CFC8BA' : '#E0DACE', -9 + 2 * i, 0, 9 + 2 * j, 1.96, .14, 1.96);
  [[-10.15, 11, .3, 6.2], [10.15, 11, .3, 6.2]].forEach(([x, z, w, d]) => vox('#8C95A3', x, 0, z, w, .2, d));
  // Park path: stepping stones winding from the plaza past the pond to the back of the plot.
  for (let z = 8.5; z > -15; z -= 1.5) vox('#E0DACE', -11.4 + .5 * Math.sin(z * .55), .1, z, 1.1, .08, 1.1);
  // Round pond with a stone rim.
  const pond = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 3, .3, 20), mat('#C9CFD6')); pond.position.set(-15, .25, -1); pond.receiveShadow = true; scene.add(pond);
  const pw = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.45, .1, 20), WATER); pw.position.set(-15, .42, -1); scene.add(pw);
  // Fountain: round basin, still water, a pillar and a ring of jets that breathe.
  const fx = 6.8, fz = 11.2;
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.4, .7, 16), mat('#C9CFD6')); basin.position.set(fx, .35, fz); basin.castShadow = basin.receiveShadow = true; scene.add(basin);
  const fw = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 1.95, .1, 16), WATER); fw.position.set(fx, .68, fz); scene.add(fw);
  vox('#C9CFD6', fx, .6, fz, .7, .9, .7);
  const jetGeo = new THREE.BoxGeometry(.14, 1, .14).translate(0, .5, 0), jets = [];
  [[0, 0, 2.4], ...Array.from({ length: 6 }, (_, k) => [Math.cos(k * 1.047) * 1.05, Math.sin(k * 1.047) * 1.05, 1.1])].forEach(([dx, dz, h], k) => {
    const m = new THREE.Mesh(jetGeo, JET); m.position.set(fx + dx, .72, fz + dz); m.scale.y = h; scene.add(m); jets.push({ m, h, ph: k * 1.3 });
  });
  // Beds, hedges, benches.
  [[-6.5, 12.7, 3.6, 1.1], [-14, 12.2, 3.2, 1.3], [-6.5, 9.6, 2.4, .9]].forEach(([x, z, w, d], k) => {
    vox('#6B5A3A', x, 0, z, w, .3, d);
    for (let i = 0; i < w * d * 3.2; i++) vox(FLOWERS[(i + k) % 5], x + (hash(`f${k}${i}`) - .5) * (w - .4), .3, z + (hash(`g${k}${i}`) - .5) * (d - .3), .35, .45, .35);
  });
  for (let z = 8.8; z < 13.5; z += 1.3) { vox('#4C7A43', -10.5, 0, z, .8, .8, 1.2); vox('#4C7A43', 10.5, 0, z, .8, .8, 1.2); }
  for (let x = -17; x < -10; x += 1.3) vox('#4C7A43', x, 0, 13.6, 1.2, .7, .8);
  const bench = (x, z, ry) => {
    part(x, z, ry, '#B48A60', 0, .45, 0, 1.9, .16, .6); part(x, z, ry, '#B48A60', 0, .75, -.28, 1.9, .5, .12);
    [-.8, .8].forEach((dx) => part(x, z, ry, '#2E2C2B', dx, 0, 0, .12, .45, .5));
  };
  [[-7.5, 13.5, 0], [6.8, 8.6, Math.PI], [-12.9, 5, PI2], [-9.4, -8, -PI2]].forEach(([x, z, ry]) => bench(x, z, ry));
  // Trees: round, tall (pine) and blossom.
  const round = (x, z, k = 1) => { vox('#6B5A3A', x, 0, z, .6 * k, 1.8 * k, .6 * k); vox('#5F8A4E', x, 1.6 * k, z, 2.6 * k, 2 * k, 2.6 * k); vox('#78A05A', x + .15 * k, 3.4 * k, z, 1.8 * k, 1.5 * k, 1.8 * k); vox('#4C7A43', x, 4.7 * k, z, 1 * k, .8 * k, 1 * k); };
  const pine = (x, z, k = 1) => { vox('#6B5A3A', x, 0, z, .5 * k, 1 * k, .5 * k); [[2.4, 1], [1.9, 2.1], [1.4, 3.2], [.9, 4.3], [.5, 5.3]].forEach(([w, y]) => vox('#3F6B47', x, y * k, z, w * k, 1.1 * k, w * k)); };
  const blossom = (x, z, k = 1) => { vox('#6B5A3A', x, 0, z, .6 * k, 1.8 * k, .6 * k); vox('#F2B5C8', x, 1.6 * k, z, 2.8 * k, 1.8 * k, 2.8 * k); vox('#F7D0DC', x + .1 * k, 3.2 * k, z, 1.9 * k, 1.3 * k, 1.9 * k); vox('#E99AB4', x - .9 * k, 2 * k, z + .9 * k, .7 * k, .6 * k, .7 * k); };
  [[-16.3, 11.8], [-16.5, -7], [2, -13.5], [11.2, -10], [-4, -15], [17.2, -3], [17.2, -12.5], [-9, -16]].forEach(([x, z], i) => round(x, z, .85 + (i % 3) * .12));
  [[-16.5, -16], [9.5, -16], [17.2, 6.5], [17.2, -8], [-16.8, 3], [5, -16.5]].forEach(([x, z], i) => pine(x, z, .9 + (i % 2) * .2));
  [[-12.6, 11.4], [11.5, 11.8], [6, -9.6], [-6, -9.8], [-12.6, -9.5]].forEach(([x, z]) => blossom(x, z, 1));
  // Lamps: along the park path, the plaza and the pavement. '@lamp' glows at night.
  [[-12.7, 6], [-12.7, -3.5], [-12.7, -11], [-10.3, 9.5]].forEach(([x, z]) => { vox('#2E2C2B', x, 0, z, .2, 2.6, .2); vox('@lamp', x, 2.6, z, .5, .4, .5); });
  [-14, -5, 5, 14].forEach((x) => { vox('#2E2C2B', x, 0, 20.8, .25, 4.2, .25); vox('@lamp', x, 4.2, 20.8, .7, .5, .7); });
  [-8.5, 8.5].forEach((x) => { vox('#2E2C2B', x, 0, 14.4, .25, 3.6, .25); vox('@lamp', x, 3.6, 14.4, .7, .5, .7); });
  // Low glass pavilion and kiosk: steel frame, glass, thin roof, like the tower.
  const pavil = (x, z, w, d) => {
    vox('#8CA3C0', x, 0, z, w, .2, d);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([i, j]) => vox('#5E7391', x + i * (w / 2 - .15), .2, z + j * (d / 2 - .15), .3, 3, .3));
    const gl = new THREE.Mesh(new THREE.BoxGeometry(w - .4, 2.6, d - .4), mat('#B4CCE0', { transparent: true, opacity: .4, metalness: .3, roughness: .1, depthWrite: false })); gl.position.set(x, 1.6, z); scene.add(gl);
    vox('#5E7391', x, 3.2, z, w + .5, .25, d + .5);
  };
  pavil(-12.5, -13.5, 6, 4.4); pavil(6.5, -13.2, 3.2, 3.2);
  batch.forEach((ms, col) => {
    const m = new THREE.InstancedMesh(UNIT, col === '@lamp' ? LAMP : mat(col), ms.length);
    ms.forEach((mx, i) => m.setMatrixAt(i, mx)); m.castShadow = col !== '@lamp'; m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
  });
  dummy.scale.set(1, 1, 1);
  // Two people sit on benches, three stroll: round the fountain, along the path, across the plaza.
  const parkB = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, .9, .4), new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: .8 }), 5);
  const parkH = new THREE.InstancedMesh(new THREE.BoxGeometry(.4, .4, .4), mat('#E3B590'), 5);
  ['#3F5E73', '#B4502B', '#5E7458', '#7B5E8C', '#C9A15A'].forEach((c, i) => parkB.setColorAt(i, new THREE.Color(c)));
  [parkB, parkH].forEach((m) => { m.frustumCulled = false; scene.add(m); });
  const sit = [[-7.9, 13.3], [-12.7, 5.5]];
  sit.forEach(([x, z], i) => {
    dummy.rotation.set(0, 0, 0); dummy.scale.set(1, .65, 1); dummy.position.set(x, .9, z); dummy.updateMatrix(); parkB.setMatrixAt(i, dummy.matrix);
    dummy.scale.set(1, 1, 1); dummy.position.y = 1.3; dummy.updateMatrix(); parkH.setMatrixAt(i, dummy.matrix);
  });
  const stroll = (t, k) => (k === 0 ? [fx + Math.cos(t * 6.28) * 3.3, fz + Math.sin(t * 6.28) * 3.3]
    : k === 1 ? [-11.4 + .5 * Math.sin((8 - 22 * Math.abs(2 * t - 1)) * .55), 8 - 22 * Math.abs(2 * t - 1)] : [-4 + 9 * Math.abs(2 * t - 1), 13.2]);
  const park = { jets, parkB, parkH, stroll, sitters: sit.length };
  // Podium: stone base, warm lobby panes, a revolving door under a canopy, a roof terrace.
  const hall = B(scene, 20, LH - .4, 16, mat('#A9B9CC'), 0, 0, 0);
  B(scene, 20.6, .4, 16.6, mat('#5E7391'), 0, LH - .4, 0);
  const lobby = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat('#FFE2B0', { emissive: '#FFD28A', emissiveIntensity: .55 }), 24);
  let nl = 0;
  const lp = (x, z, ry, w) => { dummy.position.set(x, 2.7, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(w, 3.4, .15); dummy.updateMatrix(); lobby.setMatrixAt(nl++, dummy.matrix); };
  [-8, -5.6, -3.4, 3.4, 5.6, 8].forEach((x) => lp(x, 8.02, 0, 1.7));
  [-5.5, -2, 2, 5.5].forEach((z) => { lp(10.02, z, PI2, 2.2); lp(-10.02, z, -PI2, 2.2); });
  dummy.scale.set(1, 1, 1); lobby.count = nl; scene.add(lobby);
  B(scene, 7, .4, 4, mat('#3E4A5A'), 0, 4.4, 9.8); [-3.2, 3.2].forEach((x) => B(scene, .3, 4.4, .3, C.dark, x, 0, 11.6)); // canopy
  B(scene, 3.2, 3.8, .3, C.dark, 0, .4, 8.1);
  const door = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3.6, 16), new THREE.MeshStandardMaterial({ color: '#CFE0F0', transparent: true, opacity: .3, roughness: .1, depthWrite: false }));
  door.position.set(0, 2.2, 9.6); scene.add(door);
  const blades = G(scene, 0, 9.6); [0, PI2].forEach((ry) => { const b = B(blades, .08, 3.4, 2.8, C.dark, 0, .5, 0, false); b.rotation.y = ry; });

  // Crown: the shaft steps in three times and narrows into a thin needle with a small beacon.
  const crown = G(scene, 0, 0), STEEL = mat('#8CA3C0', { metalness: .2, roughness: .6 }), GL = mat('#B4CCE0', { metalness: .3, roughness: .15 });
  B(crown, W + .3, .4, D + .3, mat('#5E7391'), 0, 0, 0);
  [[7, 2.6, .4], [4.6, 2.4, 3], [2.8, 2.2, 5.4]].forEach(([w, h, y]) => { B(crown, w, h, w, STEEL, 0, y, 0); B(crown, w + .06, h * .55, w + .06, GL, 0, y + h * .25, 0); });
  [[1.4, 2.2, 7.6], [.9, 2.2, 9.8], [.5, 2.2, 12]].forEach(([w, h, y]) => B(crown, w, h, w, mat('#5E7391'), 0, y, 0));
  B(crown, .14, 4.2, .14, C.dark, 0, 14.2, 0); B(crown, .5, .5, .5, BEACON, 0, 18.2, 0, false);
  const logo = canvasTex(1024, 192, (x, w, h) => {
    // Claude mark: uneven rounded rays around a centre, in Claude orange, beside the wordmark.
    x.fillStyle = '#1E1B26'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#D97757'; x.lineCap = 'round'; x.lineWidth = 15;
    [78, 62, 84, 58, 80, 66, 86, 60, 76, 64, 82, 58].forEach((len, i) => {
      const a = i * Math.PI / 6 + .1; x.beginPath(); x.moveTo(120 + Math.cos(a) * 14, h / 2 + Math.sin(a) * 14); x.lineTo(120 + Math.cos(a) * len, h / 2 + Math.sin(a) * len); x.stroke();
    });
    x.font = '600 118px "Pixelify Sans", "Geist", sans-serif'; x.fillStyle = '#F5E6D8'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText('Claude', 250, h / 2 + 6);
  });
  const lm = new THREE.MeshBasicMaterial({ map: logo });
  [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((ry) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.125), lm); const g = G(crown, 0, 0); g.rotation.y = ry; p.position.set(0, 1.7, 3.53); g.add(p); });
  return { hall, crown, blades, park };
}

export function createTower(host, { onOpen, onHover = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // throws without WebGL
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  host.prepend(renderer.domElement);
  const label = host.querySelector('.tlabel');

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#EFE6DA', 100, 400);
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 4000);
  camera.position.set(70, 40, 90);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, enableZoom: false, enablePan: false, minPolarAngle: .85, maxPolarAngle: 1.42, autoRotateSpeed: .6 });
  // A swipe up or down on a phone scrolls the page; a sideways one turns the building.
  renderer.domElement.style.touchAction = 'pan-y';

  const hemi = new THREE.HemisphereLight(0xfff1dd, 0xb49a80, 1.0);
  const key = new THREE.DirectionalLight(0xffe2bf, 1.9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow, { bias: -0.0004, normalBias: 0.03, radius: 4 });
  const win = new THREE.DirectionalLight(0xfff4e2, 0.45);
  win.position.set(-40, 60, -90);
  scene.add(hemi, key, key.target, win);
  // One city plot per five offices; each further building is built the first time it is needed.
  const blds = [];
  function building(i) {
    while (blds.length <= i) { const g = new THREE.Group(); const c = gridCell(blds.length); g.position.set(c.col * PITCH, 0, -c.row * PITCHZ); scene.add(g); blds.push({ g, ...site(g) }); }
    return blds[i];
  }
  building(0);

  // People and cars: a few instanced voxels, only while motion is welcome.
  const peopleB = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, .9, .4), new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: .8 }), 6);
  const peopleH = new THREE.InstancedMesh(new THREE.BoxGeometry(.4, .4, .4), mat('#E3B590'), 6);
  ['#B4502B', '#3F5E73', '#5E7458', '#C9A15A', '#7B5E8C', '#2F3B48'].forEach((c, i) => peopleB.setColorAt(i, new THREE.Color(c)));
  const carB = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, .8, 1.3), new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: .6 }), 6);
  const carC = new THREE.InstancedMesh(new THREE.BoxGeometry(1.3, .6, 1.1), mat('#CFE0F0', { roughness: .2 }), 6);
  ['#B4502B', '#E0B04A', '#3F5E73', '#F7EFE1', '#5E7458', '#8E8A84'].forEach((c, i) => carB.setColorAt(i, new THREE.Color(c)));
  [peopleB, peopleH, carB, carC].forEach((m) => { m.frustumCulled = false; m.count = 0; scene.add(m); });
  // axis 0 drives along the front street (x), axis 1 along the side street (z)
  const cars = [[0, 15.5, 1, -17, -19, 19], [0, 15.5, 1, 6, -19, 19], [0, 18.5, -1, 14, -19, 19], [0, 18.5, -1, -12, -19, 19], [1, 13.5, -1, -4, -17, 12], [1, 15.5, 1, 8, -17, 12]]
    .map(([axis, lane, dir, pos, min, max]) => ({ axis, lane, dir, pos, min, max }));

  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let nb = 1, fitC = 1, fitR = 1; // buildings standing, and the smoothed grid columns and rows the camera frames
  let storeys = [], fitH = LH + CROWN, hovered = null, pointer = null, pointed = null, forced = null, labelKey = '', down = null, seen = false;
  let busyTotal = 0, night = null, clock = 0;

  // Day or night follows the theme of the office this page belongs to.
  function atmosphere(dark) {
    if (dark === night) return; night = dark;
    hemi.color.set(dark ? 0x7080b8 : 0xfff1dd); hemi.groundColor.set(dark ? 0x1c1a24 : 0xb49a80); hemi.intensity = dark ? .8 : 1;
    key.color.set(dark ? 0x8fa6ff : 0xffe2bf); key.intensity = dark ? .8 : 1.9; win.intensity = dark ? .25 : .45;
    LAMP.emissiveIntensity = dark ? 2.2 : .2;
    MAT.dark.color.set(dark ? '#8794AA' : '#FFFFFF'); MAT.refl.color.set(dark ? '#9AA8BC' : '#FFFFFF');
    WATER.emissiveIntensity = dark ? 1.1 : .12; JET.emissiveIntensity = dark ? 1 : .2;
  }
  atmosphere(false);

  function light(n) {
    const h = LH + Math.min(n, MAXF) * SH + CROWN, s = key.shadow.camera, { cols, rows } = gridSize(nb), ex = (cols - 1) * PITCH / 2, ez = (rows - 1) * PITCHZ / 2, w = R + 8 + Math.hypot(ex, ez);
    key.position.set(ex + 45, h + 70, -ez + 60); key.target.position.set(ex, h / 2, -ez);
    Object.assign(s, { left: -w, right: w, top: h / 2 + R + 8 + ez, bottom: -h / 2 - R - 8 - ez, near: 1, far: 260 + h * 2 });
    s.updateProjectionMatrix();
  }

  // Rebuilds only what changed: a new office rises in place, a closed one sinks away.
  function update(offices, here) {
    const old = storeys, next = [], first = !seen; seen = true; // the first sight of the building stands whole
    offices.forEach((o) => {
      const k = `${o.url}|${o.name}|${o.theme}|${o.url === here}`;
      let s = old.find((x) => x.key === k && x.target);
      if (!s) { s = storey(o, o.url === here); s.key = k; if (first) s.h = 1; scene.add(s.group); }
      s.o = o;
      next.push(s);
    });
    old.forEach((s, i) => { if (!next.includes(s)) { s.target = 0; next.splice(Math.min(i, next.length), 0, s); } });
    storeys = next;
    let i = 0; busyTotal = 0;
    for (const s of storeys) {
      const lit = s.o.busy + (s.o.managerBusy ? 1 : 0);
      setBays(s, Math.min(lit, MAX_LIT));
      if (!s.target) continue;
      busyTotal += lit;
      s.b = Math.floor(i / MAXF); // the sixth office starts the next building
      s.tier = tier(i % MAXF);
      i++;
    }
    nb = Math.max(1, Math.ceil(i / MAXF));
    building(nb - 1);
    blds.forEach((b, k) => { b.g.visible = k < nb; });
    atmosphere(themeById((offices.find((o) => o.url === here) ?? offices[0])?.theme).dark);
    light(offices.length);
    labelKey = ''; // the hovered storey's numbers may have changed
  }

  function storeyAt(x, y) {
    const r = renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects([...blds.filter((b) => b.g.visible).map((b) => b.hall), ...storeys.filter((s) => s.target).map((s) => s.body)], false)[0];
    // A click on a lobby opens the first office of that building.
    return hit && (hit.object.userData.storey ?? storeys.find((s) => s.target && s.b === blds.findIndex((b) => b.hall === hit.object)));
  }

  const el = renderer.domElement;
  el.addEventListener('pointermove', (e) => { pointer = e.pointerType === 'mouse' ? e : null; });
  el.addEventListener('pointerleave', () => { pointer = null; });
  el.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  el.addEventListener('click', (e) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return; // that was a drag
    const s = storeyAt(e.clientX, e.clientY);
    if (s) onOpen(s.o);
  });

  const lightUp = (s, on) => { s.wall.emissiveIntensity = on ? .35 : 0; s.outline.visible = on; };
  function hover() {
    const ps = pointer ? storeyAt(pointer.clientX, pointer.clientY) : null;
    if (ps !== pointed) { pointed = ps; onHover(ps?.o ?? null); }
    const s = ps ?? (forced && storeys.find((x) => x.target && x.o.url === forced)) ?? null; // a hovered list row lights its storey too
    if (s !== hovered) {
      if (hovered) lightUp(hovered, false);
      if (s) lightUp(s, true);
      hovered = s;
    }
    el.style.cursor = ps ? 'pointer' : 'grab';
    if (!ps) { label.hidden = true; labelKey = ''; return; }
    const busy = ps.o.busy + (ps.o.managerBusy ? 1 : 0), here = ps.key.endsWith('|true');
    const k = `${ps.o.name}|${busy}|${here}`;
    if (k !== labelKey) {
      labelKey = k;
      const part = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
      label.replaceChildren(part('b', ps.o.name), part('span', busy ? `${busy} working` : 'all idle'), ...(here ? [part('span', 'You are here')] : []));
    }
    label.hidden = false;
    const r = el.getBoundingClientRect(), x = pointer.clientX - r.left, y = pointer.clientY - r.top;
    label.style.left = `${Math.max(8, Math.min(x + 16, r.width - label.offsetWidth - 8))}px`;
    label.style.top = `${Math.max(8, y - label.offsetHeight - 12)}px`;
  }

  // Cars drive slowly along the two streets; people walk between the pavement and the door, only while a floor is busy.
  function street(dt) {
    const n = Math.min(6, Math.ceil(busyTotal / 2));
    carB.count = carC.count = cars.length; peopleB.count = peopleH.count = n;
    cars.forEach((c, i) => {
      const max = c.axis ? c.max : c.max + (gridSize(nb).cols - 1) * PITCH; // the front street runs on past every building in the front row
      c.pos += c.dir * 2.4 * dt; if (c.pos > max) c.pos = c.min; else if (c.pos < c.min) c.pos = max;
      const x = c.axis ? c.lane : c.pos, z = c.axis ? c.pos : c.lane;
      dummy.rotation.set(0, c.axis ? PI2 : 0, 0); dummy.scale.set(1, 1, 1);
      dummy.position.set(x, .45, z); dummy.updateMatrix(); carB.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 1.1; dummy.updateMatrix(); carC.setMatrixAt(i, dummy.matrix);
    });
    for (let i = 0; i < n; i++) {
      const t = (clock * .09 + i / 6) % 1, f = i % 2 ? t : 1 - t, sc = Math.min(1, f * 6, (1 - f) * 6 + .01); // shrinks into the door and at the kerb
      dummy.rotation.set(0, 0, 0); dummy.scale.set(sc, sc, sc);
      dummy.position.set((-4 + i * 1.6) * f, .1 + .45 * sc, 11 + 2.4 * f); dummy.updateMatrix(); peopleB.setMatrixAt(i, dummy.matrix);
      dummy.position.y = .1 + 1.1 * sc; dummy.updateMatrix(); peopleH.setMatrixAt(i, dummy.matrix);
    }
    dummy.scale.set(1, 1, 1);
    [carB, carC, peopleB, peopleH].forEach((m) => { m.instanceMatrix.needsUpdate = true; });
  }

  let last = performance.now();
  function frame(now = performance.now()) {
    const dt = Math.min((now - last) / 1000, .05), calm = still.matches;
    last = now; clock += dt;
    const base = night ? 1.6 : .8;
    MAT.lit.emissiveIntensity = calm ? base : base * (1 + .22 * Math.sin(now / 420)); // a slow breath on the lit bays only
    BEACON.emissiveIntensity = calm || Math.sin(now / 520) > .2 ? 1.2 : .08;
    if (calm) carB.count = carC.count = peopleB.count = peopleH.count = 0; else { street(dt); blds.forEach((b) => { b.blades.rotation.y += dt * .8; }); }
    blds.forEach(({ park }, bi) => { // each plot has its own park
      park.jets.forEach((j) => { j.m.scale.y = calm ? j.h : j.h * (1 + .22 * Math.sin(now / 260 + j.ph + bi)); }); // still under reduced motion
      park.parkB.count = park.parkH.count = calm ? park.sitters : 5;
      if (calm) return;
      for (let k = 0; k < 3; k++) {
        const [x, z] = park.stroll((clock * (k ? .02 : .018) + k / 3 + bi * .37) % 1, k);
        dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
        dummy.position.set(x, .55, z); dummy.updateMatrix(); park.parkB.setMatrixAt(park.sitters + k, dummy.matrix);
        dummy.position.y = 1.2; dummy.updateMatrix(); park.parkH.setMatrixAt(park.sitters + k, dummy.matrix);
      }
      park.parkB.instanceMatrix.needsUpdate = park.parkH.instanceMatrix.needsUpdate = true;
    });
    const ys = blds.map(() => LH), tops = blds.map(() => 1);
    let moving = false;
    for (const s of storeys) {
      if (calm) s.h = s.target;
      else if (s.h !== s.target && !moving) { s.h = THREE.MathUtils.clamp(s.h + Math.sign(s.target - s.h) * dt / RISE, 0, 1); moving = true; } // one storey at a time
      const bi = Math.min(s.b ?? 0, blds.length - 1), e = s.h * s.h * (3 - 2 * s.h), xz = s.tier * (s === hovered ? 1.02 : 1);
      s.group.position.set(blds[bi].g.position.x, ys[bi], blds[bi].g.position.z); s.group.scale.set(xz, Math.max(e, .001), xz); s.group.visible = s.h > 0;
      ys[bi] += e * SH;
      if (s.target) tops[bi] = s.tier;
    }
    storeys = storeys.filter((s) => {
      if (s.target || s.h) return true;
      if (s === hovered) hovered = null;
      s.group.removeFromParent(); s.sign.map.dispose(); s.sign.dispose(); s.wall.dispose(); s.outline.geometry.dispose();
      Object.values(s.bays).forEach((m) => m.dispose());
      return false;
    });
    blds.forEach((b, bi) => { b.crown.position.y = ys[bi]; b.crown.scale.set(tops[bi], 1, tops[bi]); });

    // Frame the buildings: ground, the tallest building and its mast fill about 72% of the canvas height, and every plot fits the width.
    const goal = LH + Math.min(MAXF, storeys.filter((s) => s.target).length) * SH + CROWN, k = calm ? 1 : Math.min(1, dt * 4);
    fitH += (goal - fitH) * k; const gs = gridSize(nb); fitC += (gs.cols - fitC) * k; fitR += (gs.rows - fitR) * k;
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), p = controls.getPolarAngle();
    const vSpan = (fitH - GY) * Math.sin(p) + 2 * (fitR * PITCHZ / 2 - 1) * Math.cos(p);
    const dist = Math.max(vSpan / (2 * half * FILL), (2 * Math.hypot(fitC * PX, fitR * PITCHZ / 2) + 6) / (2 * half * camera.aspect * .92));
    const off = camera.position.clone().sub(controls.target).setLength(dist);
    controls.target.set((fitC - 1) * PITCH / 2, (fitH + GY) / 2, -(fitR - 1) * PITCHZ / 2);
    camera.position.copy(controls.target).add(off);
    scene.fog.near = dist + 8; scene.fog.far = dist + 140; // a breath of haze on the far edge only

    hover();
    controls.autoRotate = !calm && !hovered;
    controls.update(dt);
    renderer.render(scene, camera);
  }

  new ResizeObserver(() => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }).observe(host);
  let active = true;
  const run = () => { renderer.setAnimationLoop(document.hidden || !active ? null : frame); last = performance.now(); };
  document.addEventListener('visibilitychange', run);
  run();
  return { update, highlight: (url) => { forced = url; }, setActive: (on) => { active = on; run(); } };
}
