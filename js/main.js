import * as THREE from "three";
import { createWorld } from "./world.js";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const isMobile = () => innerWidth <= 760;

function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t) return t === "dark";
  return !matchMedia("(prefers-color-scheme: light)").matches;
}

// Each world was composed for the README at a design size; `crop` keeps only the band with the 3D objects
// (the README draws its labels below them, the site uses HTML instead).
const DESIGN = {
  hero: { w: 1280, h: 520 },
  pillars: { w: 1280, h: 380, crop: [10, 270] },
  metrics: { w: 1280, h: 400, crop: [18, 250] },
  footer: { w: 1280, h: 420 },
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
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.build();
  }

  build() {
    const d = DESIGN[this.name];
    const dark = isDark();
    this.renderer.toneMappingExposure = dark ? 1.05 : 1.15;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, d.w / d.h, 0.1, 200);
    this.world = createWorld({ name: this.name, scene: this.scene, camera: this.camera, width: d.w, height: d.h, dark });
    const v = this.camera.view;
    this.base = v ? { x: v.offsetX, y: v.offsetY } : { x: 0, y: 0 };
    this.basePos = this.camera.position.clone();
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
    const d = DESIGN[this.name];
    if (this.name === "footer" && isMobile()) fitView(this.camera, d, this.aspect, d.w * 0.16, 0);
    else if (this.name !== "hero") fitView(this.camera, d, this.aspect, this.base.x, this.base.y, ...(d.crop || []));
  }

  render(time) {
    const loop = this.world.loop;
    this.world.update(reduceMotion ? 0.25 : ((time / 1000) % loop) / loop);
    this.renderer.render(this.scene, this.camera);
  }
}

// ---------- hero camera: scroll flies around the island, the pointer nudges it ----------
const hero = document.querySelector(".hero");
const heroCopy = document.querySelector("[data-hero-layer]");
const heroHint = document.querySelector(".scroll-hint");
const heroOutro = document.querySelector("[data-hero-outro]");
const heroScrim = document.querySelector(".hero-scrim");
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  pointer.tx = (e.clientX / innerWidth - 0.5) * 2;
  pointer.ty = (e.clientY / innerHeight - 0.5) * 2;
}, { passive: true });

function heroProgress() {
  const r = hero.getBoundingClientRect();
  return clamp(-r.top / Math.max(1, r.height - innerHeight));
}

function updateHeroCamera(stage, s) {
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

  if (heroCopy) {
    heroCopy.style.transform = isMobile()
      ? `translateY(${-s * innerHeight * 0.9}px)`
      : `translateY(calc(-50% - ${s * innerHeight * 0.9}px))`;
    heroCopy.style.opacity = String(1 - smooth(0.05, 0.45, s));
  }
  if (heroHint) heroHint.style.opacity = String(1 - smooth(0, 0.12, s));
  if (heroOutro) {
    const o = smooth(0.55, 0.8, s);
    heroOutro.style.opacity = String(o);
    heroScrim.style.opacity = String(o);
    heroOutro.style.transform = `translateX(-50%) translateY(${(1 - o) * 40}px)`;
  }
}

// ---------- parallax layers ----------
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
function updateProgress() {
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
}

// ---------- reveal on scroll + count-up ----------
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

// ---------- card tilt ----------
if (!reduceMotion) {
  document.querySelectorAll(".tilt").forEach((box) => {
    const img = box.querySelector("img");
    box.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const r = box.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      img.style.transform = `rotateY(${x * 10}deg) rotateX(${-y * 8}deg) scale(1.03)`;
    });
    box.addEventListener("pointerleave", () => { img.style.transform = ""; });
  });
}

// ---------- stages ----------
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
addEventListener("resize", () => stages.forEach((s) => s.resize()));

document.querySelector(".theme-toggle").addEventListener("click", () => {
  const next = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch (e) {}
  document.querySelector('meta[name="theme-color"]').content = next === "dark" ? "#0f0c18" : "#f5f0e8";
  stages.forEach((s) => s.build());
});
matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  if (!document.documentElement.dataset.theme) stages.forEach((s) => s.build());
});

const heroStage = stages.find((s) => s.name === "hero");
function frame(time) {
  const s = heroProgress();
  if (heroStage && heroStage.visible) updateHeroCamera(heroStage, reduceMotion ? 0 : s);
  if (!reduceMotion) updateLayers();
  updateProgress();
  for (const st of stages) if (st.visible) st.render(time);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
