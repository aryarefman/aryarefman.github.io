import * as THREE from "three";
import { createWorld } from "./world.js";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const isMobile = () => innerWidth <= 760;

// Each world was composed for the README at a design size; `crop` keeps only the band with the 3D objects
// (the README draws its labels below them, the site uses HTML instead).
const DESIGN = {
  hero: { w: 1280, h: 520 },
  pillars: { w: 1280, h: 380, crop: [10, 270] },
  metrics: { w: 1280, h: 400, crop: [18, 250] },
  footer: { w: 1280, h: 420 },
  archipelago: { w: 1280, h: 720 },
};

// Show the design composition (offset by offX/offY design pixels, vertical band top..bottom) in a canvas of
// any shape without stretching: narrow canvases keep the full design width, wide ones gain room at the sides.
// setViewOffset() sets camera.aspect to the design aspect, so the sub-rectangle must carry the canvas aspect.
function fitView(cam, d, aspect, offX = 0, offY = 0, top = 0, bottom = d.h) {
  const bh = bottom - top;
  let w, h;
  if (bh * aspect >= d.w) { h = bh; w = bh * aspect; } else { w = d.w; h = d.w / aspect; }
  cam.setViewOffset(d.w, d.h, offX - (w - d.w) / 2, offY + top + bh / 2 - h / 2, w, h);
  cam.updateProjectionMatrix();
}

class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.name = canvas.dataset.world;
    this.visible = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const d = DESIGN[this.name];
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, d.w / d.h, 0.1, 200);
    // the page paints its own starfield, so the worlds skip theirs
    this.world = createWorld({ name: this.name, scene: this.scene, camera: this.camera, width: d.w, height: d.h, dark: true, stars3d: false });
    const v = this.camera.view;
    this.base = v ? { x: v.offsetX, y: v.offsetY } : { x: 0, y: 0 };
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
    const d = DESIGN[this.name];
    if (this.name === "footer" && isMobile()) fitView(this.camera, d, this.aspect, d.w * 0.16, 0);
    else if (this.name !== "hero" && this.name !== "archipelago") fitView(this.camera, d, this.aspect, this.base.x, this.base.y, ...(d.crop || []));
  }

  render(time) {
    const loop = this.world.loop;
    this.world.update(reduceMotion ? 0.25 : ((time / 1000) % loop) / loop);
    this.renderer.render(this.scene, this.camera);
  }
}

// ---------- pointer (shared by the hero camera, starfield and cursor) ----------
const pointer = { x: 0, y: 0, tx: 0, ty: 0, cx: innerWidth / 2, cy: innerHeight / 2 };
addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  pointer.tx = (e.clientX / innerWidth - 0.5) * 2;
  pointer.ty = (e.clientY / innerHeight - 0.5) * 2;
  pointer.cx = e.clientX; pointer.cy = e.clientY;
}, { passive: true });

// ---------- starfield: three depth layers drift at different speeds with scroll and pointer ----------
const sky = document.querySelector(".starfield");
const skyCtx = sky.getContext("2d");
let skyLayers = [];
function buildSky() {
  const dpr = Math.min(devicePixelRatio, 2);
  sky.width = innerWidth * dpr; sky.height = innerHeight * dpr;
  skyCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  let s = 42;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const area = innerWidth * innerHeight;
  skyLayers = [[0.04, 0.5, 0.35, area / 2400], [0.12, 0.9, 0.6, area / 7000], [0.28, 1.5, 0.95, area / 26000]].map(([depth, size, alpha, n]) => ({
    depth, stars: Array.from({ length: Math.round(n) }, () => ({ x: r() * innerWidth, y: r() * innerHeight * 3, size: size * (0.6 + r() * 0.8), alpha: alpha * (0.5 + r() * 0.5), tw: r() * Math.PI * 2, warm: r() > 0.85 })),
  }));
}
function drawSky(time) {
  const W = innerWidth, H = innerHeight, H3 = H * 3;
  skyCtx.clearRect(0, 0, W, H);
  for (const layer of skyLayers) {
    const oy = scrollY * layer.depth, ox = pointer.x * 30 * layer.depth;
    for (const st of layer.stars) {
      const y = ((st.y - oy) % H3 + H3) % H3;
      if (y > H) continue;
      const tw = reduceMotion ? 1 : 0.65 + 0.35 * Math.sin(time / 900 + st.tw);
      skyCtx.globalAlpha = st.alpha * tw;
      skyCtx.fillStyle = st.warm ? "#ffe1b8" : "#e9e6ff";
      skyCtx.beginPath(); skyCtx.arc(st.x - ox, y, st.size, 0, Math.PI * 2); skyCtx.fill();
    }
  }
  skyCtx.globalAlpha = 1;
}

// ---------- hero: scroll flies the camera around the island ----------
const hero = document.querySelector(".hero");
const heroCopy = document.querySelector(".hero-copy");
const heroHint = document.querySelector(".scroll-hint");
const heroOutro = document.querySelector(".hero-outro");
const heroScrim = document.querySelector(".hero-scrim");

function sectionProgress(el) {
  const r = el.getBoundingClientRect();
  return clamp(-r.top / Math.max(1, r.height - innerHeight));
}

function updateHero(stage, s) {
  const cam = stage.camera, d = DESIGN.hero;
  pointer.x += (pointer.tx - pointer.x) * 0.05;
  pointer.y += (pointer.ty - pointer.y) * 0.05;
  const e = s * s * (3 - 2 * s);
  const yaw = -0.85 * e + 0.08 * pointer.x;
  const elev = 0.3 + 0.2 * e - 0.04 * pointer.y;
  const dist = isMobile() ? 8.6 - 0.6 * e : 15.2 - 1.4 * e;
  cam.position.set(Math.sin(yaw) * Math.cos(elev) * dist, Math.sin(elev) * dist, Math.cos(yaw) * Math.cos(elev) * dist);
  cam.lookAt(0, -0.2, 0);
  if (isMobile()) fitView(cam, d, stage.aspect, 0, -d.h * (1.7 - 1.2 * e));
  else fitView(cam, d, stage.aspect, -d.w * 0.225 * (1 - e), -d.h * 0.14 * e);

  heroCopy.style.transform = isMobile() ? `translateY(${-s * innerHeight * 0.9}px)` : `translateY(calc(-50% - ${s * innerHeight * 0.9}px))`;
  heroCopy.style.opacity = String(1 - smooth(0.05, 0.45, s));
  heroHint.style.opacity = String(1 - smooth(0, 0.12, s));
  const o = smooth(0.55, 0.8, s);
  heroOutro.style.opacity = String(o);
  heroScrim.style.opacity = String(o);
  heroOutro.style.transform = `translateX(-50%) translateY(${(1 - o) * 40}px)`;
}

// ---------- seasonal islands: each band flies the camera past its island ----------
const bands = [...document.querySelectorAll(".season-band")];
function updateArchipelago(stage) {
  const vh = innerHeight;
  let best = null;
  for (const band of bands) {
    const r = band.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) continue;
    const t = clamp((vh - r.top) / (r.height + vh)); // 0 when the band enters, 1 when it leaves
    const vis = smooth(0, 0.18, t) * (1 - smooth(0.82, 1, t));
    if (!best || vis > best.vis) best = { band, t, vis };
  }
  stage.canvas.style.opacity = best ? best.vis.toFixed(3) : "0";
  stage.active = !!best && best.vis > 0.001;
  if (!stage.active) return;
  const i = parseInt(best.band.dataset.season, 10), t = best.t;
  const isle = stage.camera.userData.isles[i].position;
  const cam = stage.camera, d = DESIGN.archipelago;
  // orbit a little while the island rises through the screen (it moves faster than the text: parallax)
  const yaw = (i % 2 ? 0.55 : -0.55) + (t - 0.5) * 1.1 + 0.06 * pointer.x;
  const elev = 0.32 + 0.12 * (t - 0.5);
  const dist = isMobile() ? 7.6 : 10.5;
  const lookY = isle.y + 0.4 + (0.5 - t) * 5.5;
  cam.position.set(isle.x + Math.sin(yaw) * Math.cos(elev) * dist, lookY + Math.sin(elev) * dist, isle.z + Math.cos(yaw) * Math.cos(elev) * dist);
  cam.lookAt(isle.x, lookY, isle.z);
  // keep the island on the side opposite the caption
  const side = best.band.classList.contains("right") ? 1 : -1;
  if (isMobile()) fitView(cam, d, stage.aspect, 0, -d.h * 0.18);
  else fitView(cam, d, stage.aspect, side * d.w * 0.2, 0);
}

// ---------- work: vertical scroll drives a horizontal gallery ----------
const work = document.querySelector(".work");
const track = document.querySelector(".work-track");
const workBar = document.querySelector(".work-bar span");
const workIndex = document.querySelector(".work-index");
const slides = [...document.querySelectorAll(".slide")];
let travel = 0;
function measureWork() {
  if (innerWidth <= 860) { travel = 0; work.style.removeProperty("--travel"); return; }
  travel = Math.max(0, track.scrollWidth - innerWidth);
  work.style.setProperty("--travel", `${travel}px`);
}
function updateWork() {
  if (!travel) return;
  const p = sectionProgress(work);
  track.style.transform = `translate3d(${(-p * travel).toFixed(1)}px, 0, 0)`;
  workBar.style.transform = `scaleX(${p})`;
  workIndex.textContent = String(Math.min(slides.length, Math.round(p * (slides.length - 1)) + 1)).padStart(2, "0");
}

// ---------- parallax layers, progress bar, active nav ----------
const layers = [...document.querySelectorAll("[data-speed]")];
function updateLayers() {
  const mid = innerHeight / 2;
  for (const el of layers) {
    const r = (el.parentElement || el).getBoundingClientRect();
    if (r.bottom < -200 || r.top > innerHeight + 200) continue;
    const offset = (r.top + r.height / 2 - mid) * parseFloat(el.dataset.speed);
    el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
  }
}
const bar = document.querySelector(".progress span");
const navLinks = [...document.querySelectorAll(".nav nav a")];
function updateChrome() {
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  let current = null;
  for (const a of navLinks) {
    const sec = document.querySelector(a.getAttribute("href"));
    if (sec && sec.getBoundingClientRect().top < innerHeight * 0.4) current = a;
  }
  navLinks.forEach((a) => a.classList.toggle("active", a === current && !a.classList.contains("nav-cta")));
}

// ---------- reveal on scroll, split-letter title, count-up ----------
let charIndex = 0;
document.querySelectorAll(".split > span").forEach((line) => {
  const words = line.textContent.split(" ");
  line.textContent = "";
  words.forEach((word, w) => {
    const wrap = document.createElement("span");
    wrap.className = "word"; // keeps each word on one line
    [...word].forEach((ch) => {
      const s = document.createElement("span");
      s.className = "ch"; s.textContent = ch;
      s.style.transitionDelay = `${0.25 + charIndex++ * 0.03}s`;
      wrap.appendChild(s);
    });
    line.appendChild(wrap);
    if (w < words.length - 1) line.appendChild(document.createTextNode(" "));
  });
});
function countUp(el) {
  const target = parseFloat(el.dataset.count), decimals = parseInt(el.dataset.decimals || "0", 10);
  const suffix = el.dataset.suffix || "", group = el.dataset.group === "1";
  const fmt = (v) => (group ? Math.round(v).toLocaleString("en-US") : v.toFixed(decimals)) + suffix;
  if (reduceMotion) { el.textContent = fmt(target); return; }
  const t0 = performance.now(), dur = 1400;
  const step = (t) => {
    const k = clamp((t - t0) / dur), eased = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(target * eased);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const revealer = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    en.target.classList.add("in");
    en.target.querySelectorAll("[data-count]").forEach(countUp);
    if (en.target.dataset.count) countUp(en.target);
    revealer.unobserve(en.target);
  }
}, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
document.querySelectorAll(".reveal").forEach((el) => revealer.observe(el));

// ---------- custom cursor + magnetic buttons ----------
const cursor = document.querySelector(".cursor");
const dot = document.querySelector(".cursor-dot"), ring = document.querySelector(".cursor-ring");
const ringPos = { x: pointer.cx, y: pointer.cy };
if (finePointer && !reduceMotion) {
  document.addEventListener("pointerover", (e) => cursor.classList.toggle("hover", !!e.target.closest("a, button")));
  document.querySelectorAll(".magnetic").forEach((btn) => {
    btn.addEventListener("pointermove", (e) => {
      const r = btn.getBoundingClientRect();
      btn.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
    });
    btn.addEventListener("pointerleave", () => { btn.style.transform = ""; });
  });
} else if (cursor) cursor.remove();
function updateCursor() {
  if (!cursor.isConnected) return;
  ringPos.x += (pointer.cx - ringPos.x) * 0.18;
  ringPos.y += (pointer.cy - ringPos.y) * 0.18;
  dot.style.transform = `translate(${pointer.cx}px, ${pointer.cy}px)`;
  ring.style.transform = `translate(${ringPos.x}px, ${ringPos.y}px)`;
}

// ---------- 3D stages ----------
let stages = [];
try {
  stages = [...document.querySelectorAll("canvas.stage")].map((c) => new Stage(c));
} catch (err) {
  console.warn("WebGL unavailable, showing the page without 3D", err);
  document.querySelectorAll("canvas.stage").forEach((c) => (c.style.display = "none"));
}
const watcher = new IntersectionObserver((entries) => {
  for (const en of entries) {
    const st = stages.find((s) => s.canvas === en.target);
    if (st) st.visible = en.isIntersecting;
  }
}, { rootMargin: "120px" });
stages.forEach((s) => watcher.observe(s.canvas));

function onResize() { buildSky(); measureWork(); stages.forEach((s) => s.resize()); }
addEventListener("resize", onResize);
buildSky();
measureWork();
addEventListener("load", measureWork); // slide images change the track width once they load
document.querySelectorAll(".slide img").forEach((img) => img.addEventListener("load", measureWork, { once: true }));

// ---------- loader: count up while fonts and the first frame get ready ----------
const loader = document.querySelector(".loader");
const loaderCount = document.querySelector(".loader-count");
document.body.classList.add("loading");
const t0 = performance.now();
const minShow = reduceMotion ? 0 : 900;
(function tickLoader() {
  const k = clamp((performance.now() - t0) / Math.max(1, minShow));
  loaderCount.textContent = String(Math.round(k * 100));
  if (k < 1) requestAnimationFrame(tickLoader);
})();
Promise.all([document.fonts.ready, new Promise((r) => setTimeout(r, minShow))]).then(() => {
  loaderCount.textContent = "100";
  loader.classList.add("done");
  document.body.classList.remove("loading");
  document.querySelector(".name").classList.add("in");
});

const heroStage = stages.find((s) => s.name === "hero");
const archStage = stages.find((s) => s.name === "archipelago");
if (archStage) watcher.unobserve(archStage.canvas); // fixed canvas: visibility comes from the bands
function frame(time) {
  if (heroStage && heroStage.visible) updateHero(heroStage, reduceMotion ? 0 : sectionProgress(hero));
  if (!reduceMotion) { updateLayers(); updateWork(); }
  else if (travel) updateWork();
  updateChrome();
  drawSky(time);
  updateCursor();
  if (archStage) { updateArchipelago(archStage); if (archStage.active) archStage.render(time); }
  for (const st of stages) if (st.visible && st !== archStage) st.render(time);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
