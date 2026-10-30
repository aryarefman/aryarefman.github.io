// Paper mode: torn-paper layout, stop-motion movement, the red-lit 3D window, small paper sounds,
// and a burning-paper exit back to the dive mode.
import Lenis from "https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.mjs";
import { createPaperScene } from "./paper-scene.js";
import { burnPage } from "./burn.js";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const lenis = reduceMotion ? null : new Lenis({ lerp: 0.09, smoothWheel: true, anchors: { offset: -70 } });
if (lenis) { lenis.stop(); requestAnimationFrame(function raf(t) { lenis.raf(t); requestAnimationFrame(raf); }); }

// ---------- torn edges: a jagged clip-path polygon for each [data-torn] element ----------
function seeded(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function tornPolygon(w, h, sides, seed) {
  const rnd = seeded(seed), A = 14, pts = [];
  // a wandering offset plus fine fibres: low-frequency wobble from a few summed sines, jitter on top
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  const off = (t) => A * (0.55 + 0.25 * Math.sin(t * 0.011 + ph[0]) + 0.15 * Math.sin(t * 0.037 + ph[1]) + 0.05 * Math.sin(t * 0.09 + ph[2])) + rnd() * 3.5;
  const edge = (from, to, inward, len) => {
    for (let t = 0; t <= len; t += 5 + rnd() * 7) {
      const k = t / len, o = off(t + from[0] + from[1]);
      pts.push([from[0] + (to[0] - from[0]) * k + inward[0] * o, from[1] + (to[1] - from[1]) * k + inward[1] * o]);
    }
  };
  if (sides.includes("top")) edge([0, 0], [w, 0], [0, 1], w); else pts.push([0, 0], [w, 0]);
  if (sides.includes("right")) edge([w, 0], [w, h], [-1, 0], h); else pts.push([w, h]);
  if (sides.includes("bottom")) edge([w, h], [0, h], [0, -1], w); else pts.push([0, h]);
  if (sides.includes("left")) edge([0, h], [0, 0], [1, 0], h);
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(",")})`;
}
const tornEls = [...document.querySelectorAll("[data-torn]")];
function tear() {
  tornEls.forEach((el, i) => {
    const sides = el.dataset.torn === "both" ? "top bottom" : el.dataset.torn;
    el.style.setProperty("--torn", tornPolygon(el.offsetWidth, el.offsetHeight, sides, 1000 + i * 77));
  });
}
tear();
let tearTimer = 0;
addEventListener("resize", () => { clearTimeout(tearTimer); tearTimer = setTimeout(tear, 150); });
new ResizeObserver(() => { clearTimeout(tearTimer); tearTimer = setTimeout(tear, 150); }).observe(document.body);

// ---------- sound: paper rustles, a low warm drone, and crackling when the page burns ----------
let ctx = null, master = null, droneGain = null, soundOn = false;
function noiseBuf() { const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
let nb = null;
function startAudio() {
  ctx = new (window.AudioContext || window.webkitAudioContext)(); nb = noiseBuf();
  master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  droneGain = ctx.createGain(); droneGain.gain.value = 0.0; droneGain.connect(master);
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700; lp.connect(droneGain);
  [73.42, 110, 146.83, 174.61].forEach((f, i) => {   // D2 A2 D3 F3: a low, warm minor chord for the red room
    const o = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
    o.type = i % 2 ? "triangle" : "sine"; o.frequency.value = f; o.detune.value = (i - 1.5) * 5; g.gain.value = 0.06;
    l.frequency.value = 0.05 + i * 0.03; lg.gain.value = 0.03; l.connect(lg).connect(g.gain); l.start();
    o.connect(g).connect(lp); o.start();
  });
}
function setSound(on) {
  soundOn = on;
  if (on && !ctx) startAudio();
  if (ctx) { ctx.resume(); master.gain.setTargetAtTime(on ? 0.7 : 0, ctx.currentTime, 0.4); droneGain.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 1.2); }
  const b = document.querySelector(".sound-btn"); b.setAttribute("aria-pressed", String(on)); b.querySelector("i").textContent = on ? "on" : "off";
  try { localStorage.setItem("sound", on ? "on" : "off"); } catch {}
}
function rustle(level = 1, dur = 0.09) {   // a dry paper flick: band-passed noise with a fast decay
  if (!soundOn) return;
  const t = ctx.currentTime, s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = nb; s.playbackRate.value = 0.8 + Math.random() * 0.5;
  bp.type = "bandpass"; bp.frequency.value = 2500 + Math.random() * 2500; bp.Q.value = 0.9;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18 * level, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bp).connect(g).connect(master); s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.02);
}
function crackle(seconds) { if (!soundOn) return; for (let i = 0; i < seconds * 40; i++) setTimeout(() => rustle(0.4 + Math.random() * 0.8, 0.03 + Math.random() * 0.05), Math.random() * seconds * 1000); }
document.addEventListener("pointerenter", (e) => { if (e.target.closest?.(".jitter, .chip, .ring-btn, .case")) rustle(0.35, 0.05); }, true);
document.addEventListener("click", (e) => { if (e.target.closest("a, button")) rustle(1, 0.12); }, true);
document.querySelector(".sound-btn").addEventListener("click", () => setSound(!soundOn));

// ---------- clock: Surabaya time ----------
const clock = document.querySelector(".clock");
const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
function tick() { clock.textContent = fmt.format(new Date()); }
tick(); setInterval(tick, 10000);

// ---------- title: letters flicker through random glyphs and settle left to right ----------
function scramble(el, delay = 0) {
  const final = el.textContent, glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&*";
  if (reduceMotion) return;
  let frame = 0;
  setTimeout(function step() {
    frame++;
    el.textContent = [...final].map((c, i) => (frame > 6 + i * 3 ? c : glyphs[(Math.random() * glyphs.length) | 0])).join("");
    if (frame < 8 + final.length * 3) setTimeout(step, 55); else el.textContent = final;
  }, delay);
}

// ---------- reveals ----------
const revealer = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); revealer.unobserve(en.target); } }), { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((el) => revealer.observe(el));

// ---------- the 3D window ----------
const cases = [...document.querySelectorAll(".case")];
const label = document.querySelector(".card-label");
const names = cases.map((c) => c.querySelector("h3").textContent);
const tags = cases.map((c) => c.querySelector(".award")?.textContent || c.querySelector(".tags li:last-child")?.textContent || "");
let scene = null;
try {
  scene = createPaperScene(document.querySelector(".portal"), {
    images: cases.map((c) => c.querySelector("img").getAttribute("src")),
    reduceMotion,
    onHover(i) {
      cases.forEach((c, k) => c.classList.toggle("lit", k === i));
      label.innerHTML = i >= 0 ? `CASE ${String(i + 1).padStart(2, "0")} · ${tags[i]}<b>${names[i]}</b>` : "";
    },
    onPick(i) {
      rustle(1, 0.15);
      const el = cases[i];
      if (lenis) lenis.scrollTo(el, { offset: -90 }); else el.scrollIntoView({ behavior: "smooth" });
      el.classList.add("lit"); setTimeout(() => el.classList.remove("lit"), 1800);
    },
  });
} catch (err) { console.warn("3D unavailable", err); document.querySelector(".hint").textContent = "SCROLL FOR CASES"; }
cases.forEach((c, i) => {
  c.addEventListener("mouseenter", () => scene?.hover(i));
  c.addEventListener("mouseleave", () => scene?.hover(-1));
});
addEventListener("resize", () => scene?.resize());
// render the window only while it is on screen
const hero = document.querySelector(".hero");
new IntersectionObserver(([en]) => { if (!scene) return; if (en.isIntersecting) scene.resume(); else scene.pause(); }).observe(hero);
if (lenis) lenis.on("scroll", ({ velocity }) => { if (scene && scrollY < innerHeight) scene.spinBy(velocity * 0.0015); });

// ---------- loader ----------
const loader = document.querySelector(".loader"), count = loader.querySelector(".loader-count span");
const t0 = performance.now(), minShow = reduceMotion ? 0 : 1500;
(function countUp() {
  const k = Math.min(1, (performance.now() - t0) / Math.max(1, minShow));
  count.textContent = String(Math.round(k * 100)).padStart(3, "0");
  if (k < 1) requestAnimationFrame(countUp);
})();
let entered = false;
function enter(withSound) {
  if (entered) return;
  entered = true;
  setSound(withSound);
  loader.classList.add("done");
  setTimeout(() => loader.classList.add("gone"), 950);
  document.body.classList.remove("loading");
  lenis?.start();
  scene?.begin();
  document.querySelectorAll(".hero .morph").forEach((el, i) => scramble(el, 350 + i * 180));
}
loader.querySelectorAll("[data-sound]").forEach((b) => b.addEventListener("click", () => enter(b.dataset.sound === "on")));
Promise.all([document.fonts.ready, new Promise((r) => setTimeout(r, minShow))]).then(() => {
  loader.classList.add("ready");
  let pref = null; try { pref = localStorage.getItem("sound"); } catch {}
  loader.querySelector(`[data-sound="${pref === "on" ? "on" : "off"}"]`).focus({ preventScroll: true });
});

// ---------- back to the dive: the page burns away from where you clicked ----------
document.querySelectorAll(".to-dive").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  try { localStorage.setItem("mode", "dive"); } catch {}
  if (reduceMotion) { location.href = a.getAttribute("href"); return; }
  crackle(1.6);
  burnPage({ x: e.clientX || innerWidth / 2, y: e.clientY || innerHeight / 2, duration: 1.7, onDone: () => (location.href = a.getAttribute("href")) });
}));
