// Paper mode: the sound gate, the corner interface, pages that swap behind stop-motion paper, small paper
// sounds, and a burning-paper exit back to the dive mode.
import { createPaperScene } from "./paper-scene.js";
import { burnPage } from "./burn.js";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- torn edges: a jagged clip-path polygon for each [data-torn] element ----------
// "right"/"left" tear one long side deeply and unevenly (the screen hems); "right-s"/"left-s" tear it shallowly
// (halves that must meet and cover the screen); "lr" tears both sides lightly (pages)
function seeded(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function tornPolygon(w, h, mode, seed) {
  const rnd = seeded(seed), ph = [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6], pts = [];
  // depth of the tear at height y (as a fraction of the strip width): narrow near the top, a big bite lower down
  const deep = (y) => {
    const k = y / h;
    return 0.22 + 0.32 * Math.sin(k * 2.6 + ph[0]) ** 2 + 0.16 * Math.sin(k * 7.3 + ph[1]) + 0.05 * Math.sin(k * 23 + ph[2]) - 0.18 * Math.exp(-k * 9);
  };
  const fibre = () => (rnd() - 0.5) * 6;
  const shallow = mode.endsWith("-s"); mode = mode.replace("-s", "");
  if (mode === "right" || mode === "left") {
    const edgeX = shallow ? (y) => w - 10 - 14 * (0.5 + 0.5 * Math.sin(y * 0.013 + ph[0])) + fibre() : (y) => Math.max(4, Math.min(w - 2, w * deep(y) + fibre()));
    const ys = []; for (let y = 0; y <= h; y += 4 + rnd() * 7) ys.push(y); ys.push(h);
    if (mode === "right") { pts.push([0, 0]); ys.forEach((y) => pts.push([edgeX(y), y])); pts.push([0, h]); }
    else { pts.push([w, 0]); ys.forEach((y) => pts.push([w - edgeX(y), y])); pts.push([w, h]); }
  } else {   // "lr": shallow tears on both long sides
    const A = 16, off = (y, p) => A * (0.5 + 0.3 * Math.sin(y * 0.012 + p) + 0.2 * Math.sin(y * 0.041 + p * 2)) + fibre();
    const ys = []; for (let y = 0; y <= h; y += 5 + rnd() * 8) ys.push(y); ys.push(h);
    ys.forEach((y) => pts.push([off(y, ph[0]), y]));
    ys.reverse().forEach((y) => pts.push([w - off(y, ph[3]), y]));
  }
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(",")})`;
}
const tornEls = [...document.querySelectorAll("[data-torn]")];
function tear() {
  tornEls.forEach((el, i) => {
    const r = el.getBoundingClientRect(), w = r.width || innerWidth, h = el.classList.contains("page") ? innerHeight : r.height || innerHeight;
    el.style.setProperty("--torn", tornPolygon(w, h, el.dataset.torn, 1000 + i * 77));
  });
}
tear();
let tearTimer = 0;
addEventListener("resize", () => { clearTimeout(tearTimer); tearTimer = setTimeout(() => { tear(); scene?.resize(); }, 150); });

// ---------- sound: paper rustles, a low warm drone, crackle while burning ----------
let ctx = null, master = null, droneGain = null, nb = null, soundOn = false;
function startAudio() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  droneGain = ctx.createGain(); droneGain.gain.value = 0; droneGain.connect(master);
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 650; lp.connect(droneGain);
  [73.42, 110, 146.83, 174.61].forEach((f, i) => {   // D2 A2 D3 F3: a low, warm minor chord for the red room
    const o = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
    o.type = i % 2 ? "triangle" : "sine"; o.frequency.value = f; o.detune.value = (i - 1.5) * 5; g.gain.value = 0.06;
    l.frequency.value = 0.05 + i * 0.03; lg.gain.value = 0.03; l.connect(lg).connect(g.gain); l.start();
    o.connect(g).connect(lp); o.start();
  });
}
const soundBtn = document.querySelector(".sound-btn");
function setSound(on) {
  soundOn = on;
  if (on && !ctx) startAudio();
  if (ctx) { ctx.resume(); master.gain.setTargetAtTime(on ? 0.7 : 0, ctx.currentTime, 0.4); droneGain.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 1.2); }
  soundBtn.setAttribute("aria-pressed", String(on));
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
document.addEventListener("pointerenter", (e) => { if (e.target.closest?.(".sm, .ring-btn, .case")) rustle(0.35, 0.05); }, true);
document.addEventListener("click", (e) => { if (e.target.closest("a, button")) rustle(1, 0.12); }, true);
soundBtn.addEventListener("click", () => setSound(!soundOn));

// ---------- clock: Surabaya time ----------
const clock = document.querySelector(".clock");
const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
const tick = () => (clock.textContent = fmt.format(new Date()));
tick(); setInterval(tick, 10000);

// ---------- pages: swap behind two sheets of paper that snap shut and open again ----------
const pages = { cases: document.getElementById("cases"), about: document.getElementById("about"), contact: document.getElementById("contact") };
const swap = document.querySelector(".swap");
let current = "home", swapping = false;
function show(name, after) {
  name = pages[name] ? name : "home";
  if (name === current || swapping) { after?.(); return; }
  const apply = () => {
    Object.entries(pages).forEach(([k, el]) => (el.hidden = k !== name));
    current = name;
    if (name === "home") scene?.resume(); else scene?.pause();   // the scene is covered: stop rendering it
    tear();
    after?.();
  };
  if (reduceMotion) { apply(); return; }
  swapping = true; rustle(1, 0.2);
  swap.className = "swap in";
  setTimeout(() => {
    apply();
    swap.className = "swap out"; rustle(0.8, 0.18);
    setTimeout(() => { swap.className = "swap"; swapping = false; }, 520);
  }, 440);
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-page]"); if (!a) return;
  e.preventDefault();
  const name = a.dataset.page;
  history.pushState(null, "", name === "home" ? location.pathname : `#${name}`);
  show(name);
});
addEventListener("popstate", () => show(location.hash.slice(1) || "home"));
addEventListener("keydown", (e) => { if (e.key === "Escape" && current !== "home") { history.pushState(null, "", location.pathname); show("home"); } });

// ---------- the scene, with a tooltip that follows the pointer over a card ----------
const cases = [...document.querySelectorAll(".case")];
const names = cases.map((c) => c.querySelector(".case-row b").textContent);
const tip = document.querySelector(".tip"), tipName = tip.querySelector(".tip-name");
addEventListener("pointermove", (e) => { tip.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 14}px)`; });
let scene = null;
try {
  scene = createPaperScene(document.querySelector(".portal"), {
    images: cases.map((c) => c.querySelector("img").getAttribute("src")),
    reduceMotion,
    onHover(i) { tip.classList.toggle("on", i >= 0); if (i >= 0) { tipName.textContent = names[i]; rustle(0.3, 0.05); } },
    onPick(i) {
      tip.classList.remove("on");
      history.pushState(null, "", "#cases");
      show("cases", () => {
        const el = cases[i]; el.scrollIntoView({ block: "center" });
        el.classList.add("lit"); setTimeout(() => el.classList.remove("lit"), 2200);
      });
    },
  });
} catch (err) { console.warn("3D unavailable", err); }

// ---------- the sound gate ----------
const loader = document.querySelector(".loader"), pct = loader.querySelector(".loader-pct");
const t0 = performance.now();
(function count() {
  const k = Math.min(1, (performance.now() - t0) / 1400);
  pct.textContent = `${Math.round(k * 100)}%`;
  if (k < 1) requestAnimationFrame(count);
})();
let entered = false;
function enter(withSound) {
  if (entered) return;
  entered = true;
  setSound(withSound);
  loader.classList.add("done");
  setTimeout(() => loader.classList.add("gone"), 950);
  document.body.classList.remove("loading");
  scene?.begin();
  const start = location.hash.slice(1);
  if (pages[start]) setTimeout(() => show(start), 400);
}
loader.querySelectorAll("[data-sound]").forEach((b) => b.addEventListener("click", () => enter(b.dataset.sound === "on")));
let pref = null; try { pref = localStorage.getItem("sound"); } catch {}
loader.querySelector(`[data-sound="${pref === "on" ? "on" : "off"}"]`).focus({ preventScroll: true });

// ---------- back to the dive: the page burns away from where you clicked ----------
document.querySelectorAll(".to-dive").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  try { localStorage.setItem("mode", "dive"); } catch {}
  if (reduceMotion) { location.href = a.getAttribute("href"); return; }
  crackle(1.6);
  burnPage({ x: e.clientX || innerWidth / 2, y: e.clientY || innerHeight / 2, duration: 1.7, onDone: () => (location.href = a.getAttribute("href")) });
}));
