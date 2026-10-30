// Ambient soundscape that follows the dive, synthesised live with Web Audio (no audio files to download).
// Layers fade with the descent stage s (0 starry sky … 3 sea surface … 6 abyss):
//   space  — a slow, detuned pad and a faint shimmer         (s 0–2)
//   wind   — filtered noise gusting through the clouds       (s 1–3)
//   surf   — waves rolling in and out at the surface         (s 2.5–4)
//   deep   — muffled underwater rumble and a low drone       (s 3.5–6), with bubbles and distant whale calls
// Browsers only allow audio after a click, so nothing starts until enable() is called from one.

let ctx = null, master = null, layers = null, on = false, depth = 0, nextCall = 0, nextBubble = 0;

const band = (s, a, b, c, d) => (s <= a || s >= d ? 0 : s < b ? (s - a) / (b - a) : s <= c ? 1 : (d - s) / (d - c));

function noiseBuffer(kind) {
  const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    d[i] = kind === "brown" ? (last = (last + 0.02 * w) / 1.02) * 3.5 : w;
  }
  return buf;
}
function loopNoise(kind) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(kind); src.loop = true; src.start(); return src;
}
function lfo(freq, depthAmt, target) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = freq; g.gain.value = depthAmt;
  o.connect(g).connect(target); o.start(); return o;
}
// a small synthetic hall so whale calls and bubbles sound far away
function reverb(seconds = 3.5) {
  const len = ctx.sampleRate * seconds, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const c = ctx.createConvolver(); c.buffer = ir; return c;
}

function build() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor(); master.connect(comp).connect(ctx.destination);
  const hall = reverb(); const wet = ctx.createGain(); wet.gain.value = 0.6; hall.connect(wet).connect(master);

  // space: an open fifth chord, each voice slightly detuned, breathing slowly
  const space = ctx.createGain(); space.gain.value = 0;
  const spaceTone = ctx.createBiquadFilter(); spaceTone.type = "lowpass"; spaceTone.frequency.value = 900;
  spaceTone.connect(space); space.connect(master); space.connect(hall);
  [110, 164.81, 220, 246.94, 329.63].forEach((f, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = i % 2 ? "triangle" : "sine"; o.frequency.value = f; o.detune.value = (i - 2) * 6;
    g.gain.value = 0.05; lfo(0.05 + i * 0.013, 0.03, g.gain); o.connect(g).connect(spaceTone); o.start();
  });
  lfo(0.03, 400, spaceTone.frequency);

  // wind: white noise through a wandering band-pass
  const wind = ctx.createGain(); wind.gain.value = 0;
  const windBand = ctx.createBiquadFilter(); windBand.type = "bandpass"; windBand.frequency.value = 500; windBand.Q.value = 0.8;
  const gust = ctx.createGain(); gust.gain.value = 0.5; lfo(0.13, 0.35, gust.gain);
  loopNoise("white").connect(windBand).connect(gust).connect(wind).connect(master);
  lfo(0.09, 260, windBand.frequency);

  // surf: low-passed noise swelling like waves on a ~8 s cycle
  const surf = ctx.createGain(); surf.gain.value = 0;
  const surfTone = ctx.createBiquadFilter(); surfTone.type = "lowpass"; surfTone.frequency.value = 700;
  const swell = ctx.createGain(); swell.gain.value = 0.5; lfo(0.12, 0.45, swell.gain); lfo(0.12, 350, surfTone.frequency);
  loopNoise("white").connect(surfTone).connect(swell).connect(surf).connect(master);

  // deep: brown-noise rumble under water plus a low drone
  const deep = ctx.createGain(); deep.gain.value = 0;
  const muffle = ctx.createBiquadFilter(); muffle.type = "lowpass"; muffle.frequency.value = 260;
  loopNoise("brown").connect(muffle).connect(deep).connect(master);
  const drone = ctx.createGain(); drone.gain.value = 0;
  [55, 82.4].forEach((f) => { const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.12; lfo(0.07, 0.06, g.gain); o.connect(g).connect(drone); o.start(); });
  drone.connect(master);

  layers = { space, wind, surf, deep, drone, hall };
}

// a humpback-like moan: a sine gliding down and back up, heard through the hall
function whaleCall(level) {
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  f.type = "lowpass"; f.frequency.value = 900;
  const base = 140 + Math.random() * 80;
  o.frequency.setValueAtTime(base, t);
  o.frequency.exponentialRampToValueAtTime(base * 0.62, t + 1.4);
  o.frequency.exponentialRampToValueAtTime(base * 1.35, t + 3.2);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * level, t + 0.6); g.gain.linearRampToValueAtTime(0, t + 3.4);
  o.connect(f).connect(g); g.connect(layers.hall); g.connect(master);
  o.start(t); o.stop(t + 3.6);
}
function bubble(level) {
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  const f0 = 300 + Math.random() * 500;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 2.6, t + 0.09);
  g.gain.setValueAtTime(0.05 * level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g).connect(layers.hall); o.start(t); o.stop(t + 0.14);
}

export const sound = {
  get on() { return on; },
  // must be called from a click/tap handler
  enable() {
    if (!ctx) build();
    ctx.resume();
    on = true;
    master.gain.setTargetAtTime(0.55, ctx.currentTime, 0.8);
    try { localStorage.setItem("sound", "on"); } catch {}
  },
  disable() {
    on = false;
    if (ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    try { localStorage.setItem("sound", "off"); } catch {}
  },
  // called every frame with the descent stage (0–6)
  update(s) {
    depth = s;
    if (!ctx || !on) return;
    const t = ctx.currentTime, k = 0.4;
    layers.space.gain.setTargetAtTime(band(s, -1, 0, 1.2, 2.6), t, k);
    layers.wind.gain.setTargetAtTime(0.8 * band(s, 0.8, 1.8, 2.4, 3.1), t, k);
    layers.surf.gain.setTargetAtTime(0.9 * band(s, 2.4, 2.95, 3.2, 3.9), t, k);
    layers.deep.gain.setTargetAtTime(0.9 * band(s, 3.0, 3.6, 6, 7), t, k);
    layers.drone.gain.setTargetAtTime(band(s, 4.4, 5.6, 6, 7), t, k);
    const now = performance.now();
    if (s > 4.6 && now > nextCall) { if (nextCall) whaleCall(Math.min(1, s - 4.6)); nextCall = now + 9000 + Math.random() * 9000; }
    if (s > 3.4 && now > nextBubble) { bubble(Math.min(1, s - 3.4)); nextBubble = now + 500 + Math.random() * 2600; }
  },
  // a soft two-note chime for button presses
  chime() {
    if (!ctx || !on) return;
    const t = ctx.currentTime;
    [660, 990].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.08); g.gain.linearRampToValueAtTime(0.08, t + i * 0.08 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.7);
      o.connect(g).connect(master); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.8);
    });
  },
};
