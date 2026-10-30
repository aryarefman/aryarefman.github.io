/*
 * Glitch: every few seconds the page breaks up for a moment. The titles split
 * into red and cyan, the 3D frame jumps sideways and a few bars of the screen
 * tear out of place. Page changes glitch too. The look lives in detective.css
 * under html.is-glitching; this file only decides when, and where the tears go.
 */
(function () {
  'use strict';

  if (window.AryaGlitch) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var root = document.documentElement;
  var veil = null;
  var offTimer = 0;

  function rand(min, max) { return min + Math.random() * (max - min); }

  function ensureVeil() {
    if (veil && veil.parentNode) return veil;
    veil = document.createElement('div');
    veil.className = 'glitch-veil';
    veil.setAttribute('aria-hidden', 'true');
    document.body.appendChild(veil);
    return veil;
  }

  function burst(ms) {
    if (document.hidden || !document.body) return;
    ensureVeil();
    // where this burst tears the screen
    root.style.setProperty('--g-a', rand(5, 70).toFixed(1) + '%');
    root.style.setProperty('--g-ah', rand(1, 6).toFixed(1) + '%');
    root.style.setProperty('--g-b', rand(30, 92).toFixed(1) + '%');
    root.style.setProperty('--g-bh', rand(0.6, 5).toFixed(1) + '%');
    root.style.setProperty('--g-s', (Math.random() < 0.5 ? -1 : 1) * rand(12, 46).toFixed(0) + 'px');
    root.classList.add('is-glitching');
    clearTimeout(offTimer);
    offTimer = setTimeout(function () { root.classList.remove('is-glitching'); }, ms || rand(180, 420));
  }

  (function schedule() {
    setTimeout(function () {
      burst();
      // now and then a second hit right after the first
      if (Math.random() < 0.35) setTimeout(function () { burst(rand(90, 180)); }, rand(450, 700));
      schedule();
    }, rand(3500, 8500));
  })();

  // page changes glitch on the way out and on the way in
  function hookBarba() {
    if (!window.barba || !window.barba.hooks) return false;
    window.barba.hooks.before(function () { burst(260); });
    window.barba.hooks.after(function () { burst(320); });
    return true;
  }
  if (!hookBarba()) window.addEventListener('load', hookBarba);

  window.AryaGlitch = { burst: burst };
})();
