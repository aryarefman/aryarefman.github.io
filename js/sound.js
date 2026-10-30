// Ambient soundscape that follows the dive, synthesised live with Web Audio (no audio files to download).
// Layers fade with the descent stage s (0 starry sky … 3 sea surface … 6 abyss):
//   space  — a warm, slowly breathing major-9 pad            (s 0–2)
//   wind   — filtered noise gusting through the clouds       (s 1–3)
//   surf   — waves rolling in and out at the surface         (s 2.5–4)
//   deep   — a soft underwater wash and a dreamy major pad   (s 3.5–6), with bubbles
//   calls  — songbirds by the islands (s 1.3–3.3), gulls over the sea surface (s 2.1–3.5), humpback song below (s > 3.4)
//   bells  — music-box notes from a pentatonic scale sprinkled over the whole dive
// Browsers only allow audio after a click, so nothing starts until enable() is called from one.

let ctx = null, master = null, layers = null, on = false, depth = 0, nextCall = 0, nextBubble = 0, nextBell = 0, nextGull = 0, nextChirp = 0;

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

  // space: a warm C major 9 chord (C E G B D), each voice slightly detuned, breathing slowly
  const space = ctx.createGain(); space.gain.value = 0;
  const spaceTone = ctx.createBiquadFilter(); spaceTone.type = "lowpass"; spaceTone.frequency.value = 2000;
  spaceTone.connect(space); space.connect(master); space.connect(hall);
  [130.81, 261.63, 329.63, 392, 493.88, 587.33].forEach((f, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = i % 2 ? "triangle" : "sine"; o.frequency.value = f; o.detune.value = (i - 2) * 5;
    g.gain.value = 0.04; lfo(0.05 + i * 0.013, 0.025, g.gain); o.connect(g).connect(spaceTone); o.start();
  });
  lfo(0.03, 700, spaceTone.frequency);

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

  // deep: a soft underwater wash plus a dreamy major pad (C G C E), not a dark rumble
  const deep = ctx.createGain(); deep.gain.value = 0;
  const muffle = ctx.createBiquadFilter(); muffle.type = "lowpass"; muffle.frequency.value = 480;
  loopNoise("brown").connect(muffle).connect(deep).connect(master);
  const drone = ctx.createGain(); drone.gain.value = 0;
  const droneTone = ctx.createBiquadFilter(); droneTone.type = "lowpass"; droneTone.frequency.value = 1400;
  [130.81, 196, 261.63, 329.63].forEach((f, i) => { const o = ctx.createOscillator(); o.type = i % 2 ? "sine" : "triangle"; o.frequency.value = f; o.detune.value = (i - 1.5) * 4; const g = ctx.createGain(); g.gain.value = 0.05; lfo(0.06 + i * 0.02, 0.03, g.gain); o.connect(g).connect(droneTone); o.start(); });
  droneTone.connect(drone); drone.connect(master); drone.connect(hall);

  layers = { space, wind, surf, deep, drone, hall };
}

// a voice placed somewhere left or right, so calls come from around the listener
function placed(gain, pan, wet = true) {
  const p = ctx.createStereoPanner(); p.pan.value = pan;
  gain.connect(p).connect(master); if (wet) p.connect(layers.hall);
  return p;
}
// one note of humpback song: a tone with a second harmonic, a slow vibrato and a pitch contour.
// Humpbacks sing in phrases of moans, upsweeping "whoops" and high cries, so a call strings two or three together.
function whaleNote(t, contour, dur, level, pan) {
  const g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1500; f.Q.value = 0.7;
  const vib = ctx.createOscillator(), vibAmt = ctx.createGain(); vib.frequency.value = 4.5 + Math.random() * 2; vibAmt.gain.value = contour[0] * 0.018;
  vib.connect(vibAmt);
  [[1, "sine", 1], [2.005, "triangle", 0.28], [3.01, "sine", 0.08]].forEach(([mul, type, amp]) => {
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; og.gain.value = amp;
    o.frequency.setValueAtTime(contour[0] * mul, t);
    contour.slice(1).forEach((fq, i) => o.frequency.exponentialRampToValueAtTime(fq * mul, t + dur * (i + 1) / (contour.length - 1)));
    vibAmt.connect(o.frequency);
    o.connect(og).connect(f); o.start(t); o.stop(t + dur + 0.1);
  });
  vib.start(t); vib.stop(t + dur + 0.1);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.14 * level, t + dur * 0.25);
  g.gain.setValueAtTime(0.14 * level, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
  f.connect(g); placed(g, pan);
}
function whaleSong(level) {
  const t0 = ctx.currentTime, pan = Math.random() * 1.4 - 0.7, r = (a, b) => a + Math.random() * (b - a);
  const phrases = [
    () => [[r(200, 260), r(130, 160), r(190, 240)], r(2.6, 3.4)],    // moan: down and back up
    () => [[r(110, 140), r(380, 480)], r(0.9, 1.3)],                 // whoop: a fast upsweep
    () => [[r(620, 780), r(820, 950), r(480, 560)], r(1.4, 2)],      // cry: high, rising then falling
    () => [[r(90, 110), r(70, 85)], r(1.8, 2.4)],                    // grunt: a low, short groan
  ];
  let t = t0;
  for (let i = 0, n = 2 + Math.floor(Math.random() * 2); i < n; i++) {
    const [contour, dur] = phrases[Math.floor(Math.random() * phrases.length)]();
    whaleNote(t, contour, dur, level, pan); t += dur + r(0.3, 0.9);
  }
}
// a herring gull's "kee-ow": a raspy, falling cry repeated a few times, from somewhere along the shore
function gull(level) {
  const t0 = ctx.currentTime, pan = Math.random() * 1.6 - 0.8, n = 2 + Math.floor(Math.random() * 3), pitch = 0.85 + Math.random() * 0.35;
  const out = ctx.createGain(); out.gain.value = level; placed(out, pan);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * (0.3 + Math.random() * 0.08), dur = i === 0 ? 0.42 : 0.26;
    const o = ctx.createOscillator(), rasp = ctx.createOscillator(), raspAmt = ctx.createGain(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "sawtooth"; bp.type = "bandpass"; bp.frequency.value = 2100 * pitch; bp.Q.value = 1.6;
    rasp.frequency.value = 38; raspAmt.gain.value = 70; rasp.connect(raspAmt).connect(o.frequency);   // the throaty buzz
    o.frequency.setValueAtTime(1350 * pitch, t); o.frequency.linearRampToValueAtTime(1750 * pitch, t + dur * 0.25); o.frequency.exponentialRampToValueAtTime(900 * pitch, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05); rasp.start(t); rasp.stop(t + dur + 0.05);
  }
}
// a small songbird: a quick run of bright chirps, each a fast upward flick
function chirps(level) {
  const t0 = ctx.currentTime, pan = Math.random() * 1.6 - 0.8, n = 3 + Math.floor(Math.random() * 5), base = 2600 + Math.random() * 1400;
  const out = ctx.createGain(); out.gain.value = level; placed(out, pan);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * (0.07 + Math.random() * 0.06), f = base * (1 + (Math.random() - 0.5) * 0.25), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.55, t + 0.05);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.08);
  }
}
// a music-box note from the C major pentatonic scale: sparkles in the sky, softer and an octave lower under water
const BELLS = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];
function bell(level, octave) {
  const t = ctx.currentTime, f = BELLS[Math.floor(Math.random() * BELLS.length)] * octave;
  [[1, 1], [2.01, 0.25], [3.02, 0.08]].forEach(([mul, amp]) => {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f * mul;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.045 * amp * level, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2 / mul);
    o.connect(g); g.connect(layers.hall); g.connect(master); o.start(t); o.stop(t + 2.3);
  });
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
    layers.deep.gain.setTargetAtTime(0.45 * band(s, 3.0, 3.6, 6, 7), t, k);
    layers.drone.gain.setTargetAtTime(band(s, 3.6, 4.8, 6, 7), t, k);
    const now = performance.now();
    if (now > nextBell) { if (nextBell) bell(s < 3 ? 1 : 0.7, s < 3 ? 1 : 0.5); nextBell = now + 900 + Math.random() * 2400; }
    // whales sing from the shallows down (louder the deeper you go); gulls over the sea surface; songbirds by the islands
    if (s > 3.4 && now > nextCall) { if (nextCall) whaleSong(0.5 + 0.5 * Math.min(1, (s - 3.4) / 1.5)); nextCall = now + 7000 + Math.random() * 8000; }
    const shore = band(s, 2.1, 2.6, 3.2, 3.5);
    if (shore > 0.05 && now > nextGull) { if (nextGull) gull(shore); nextGull = now + 2500 + Math.random() * 4500; }
    const sky = band(s, 1.3, 1.9, 3.0, 3.35);
    if (sky > 0.05 && now > nextChirp) { if (nextChirp) chirps(sky * 0.8); nextChirp = now + 1800 + Math.random() * 3500; }
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
