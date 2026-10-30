(function () {
  'use strict';

  if (window.YuusukeSound) return;

  var SOUND_BASE = '/sound/';
  var SOUNDS = {
    hover: { file: 'hover.opus', volume: 0.85 },
    click: { file: 'click.opus', volume: 0.9 },
    // Hit on the intro shockwave; plays outside the music lowpass, which
    // opens over its duration.
    explosion: { file: 'explosion.mp3', volume: 1 },
    music: { file: 'loop.mp3', volume: 0.25 }
  };
  // Background loop. Starts muffled (lowpass) and opens on the 3D intro
  // explosion; the home hold-spin muffles it again while held.
  var MUFFLE_FREQ = 900;
  var OPEN_FREQ = 20000;
  var MUFFLE_GAIN = 0.75;
  // Explosion releases the muffle the same way the hold does.
  var OPEN_RAMP = 0.35;
  var HOLD_ON_RAMP = 0.25;
  var HOLD_OFF_RAMP = 0.35;
  var MUTE_RAMP = 0.3;
  // If the explosion message never arrives (no iframe on the page).
  var INTRO_FALLBACK = 6;
  // Pages where the music stays lo-fi (Barba namespaces).
  var LOFI_ROUTES = { about: true, contact: true, 'case-inner': true };
  var ROUTE_RAMP = 0.6;
  // Elements that get hover + click sounds. Opt out with data-sound="none",
  // opt anything else in with data-sound.
  var TARGETS = '[data-draw-line], .yuu_logo-link, .btn-stop-motion, .cases-link, .contact_item, .about_award, [data-sound]';
  var HOVER_THROTTLE = 60;
  // Nav toggle. Fallback: the .btn-stop-motion whose label reads "sound".
  var TOGGLE = '[data-sound-toggle]';
  var ON_CLASS = 'yuusuke-sound-on';
  var OFF_CLASS = 'is-off';

  // Inside the 3D iframe the module only forwards play requests: the parent
  // already holds the user gesture (loader click), the frame never does.
  var inFrame = false;
  try { inFrame = !!window.parent && window.parent !== window; } catch (e) {}

  var ctx = null;
  var buffers = {};
  var unlocked = false;
  // Off until the loader chooser or the nav toggle turns it on.
  var enabled = false;
  var lastHover = 0;

  var music = null;
  var musicWanted = false;
  // Set by the loader right before the intro; opens on the explosion.
  var introPending = false;
  var holding = false;
  var routeMuffled = false;
  var introFallbackTimer = 0;

  function log() {
    if (!window.__soundLog) return;
    try { console.log.apply(console, ['[sound]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  function getContext() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  function load(name) {
    var audio = getContext();
    if (!audio || buffers[name]) return;
    buffers[name] = true;
    fetch(SOUND_BASE + SOUNDS[name].file)
      .then(function (res) { return res.arrayBuffer(); })
      .then(function (data) { return audio.decodeAudioData(data); })
      .then(function (buffer) {
        buffers[name] = buffer;
        log('loaded', name);
        if (name === 'music' && musicWanted) startMusic();
      })
      .catch(function (error) {
        buffers[name] = null;
        log('load failed', name, error);
      });
  }

  // ---- Background music ----------------------------------------------------

  function isMuffled() {
    return introPending || holding || routeMuffled;
  }

  function ramp(param, value, seconds) {
    var now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + seconds);
  }

  function applyMusic(seconds) {
    if (!music) return;
    var muffled = isMuffled();
    var volume = enabled ? SOUNDS.music.volume * (muffled ? MUFFLE_GAIN : 1) : 0;
    ramp(music.filter.frequency, muffled ? MUFFLE_FREQ : OPEN_FREQ, seconds);
    ramp(music.gain.gain, volume, seconds);
    log('music', muffled ? 'muffled' : 'open', enabled ? 'on' : 'muted');
  }

  function startMusic() {
    musicWanted = true;
    if (music || inFrame) return;
    var audio = getContext();
    var buffer = buffers.music;
    if (!audio || !buffer || buffer === true) return;
    if (audio.state === 'suspended') audio.resume();

    var source = audio.createBufferSource();
    var filter = audio.createBiquadFilter();
    var gain = audio.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    filter.frequency.value = isMuffled() ? MUFFLE_FREQ : OPEN_FREQ;
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.destination);
    source.start(0);
    music = { source: source, filter: filter, gain: gain };
    applyMusic(0.05);
    log('music start', { introPending: introPending });

    if (introPending && !introFallbackTimer) {
      introFallbackTimer = window.setTimeout(function () {
        if (!introPending) return;
        log('intro fallback');
        introOpen();
      }, INTRO_FALLBACK * 1000);
    }
  }

  function expectExplosion() {
    introPending = true;
    applyMusic(0.05);
  }

  // The muffle lifts across the hit, fully open the moment it ends.
  function introOpen() {
    if (!introPending) return;
    introPending = false;
    var source = play('explosion');
    applyMusic(source ? source.buffer.duration : OPEN_RAMP);
  }

  function setRoute(namespace) {
    var muffled = !!LOFI_ROUTES[String(namespace || '').toLowerCase()];
    if (routeMuffled === muffled) return;
    routeMuffled = muffled;
    applyMusic(ROUTE_RAMP);
  }

  function currentNamespace() {
    var container = document.querySelector('[data-barba="container"]');
    return container ? container.getAttribute('data-barba-namespace') : '';
  }

  // Barba's `before` runs before the next page is fetched, so its namespace
  // is still unknown there; the URL is enough to tell the lo-fi pages apart.
  function namespaceFromPath(path) {
    var p = String(path || '').toLowerCase().replace(/\/+$/, '');
    if (p === '/about') return 'about';
    if (p === '/contact') return 'contact';
    if (/^\/cases\/.+/.test(p)) return 'case-inner';
    if (p === '/cases') return 'cases';
    return 'home';
  }

  // Muffles as the transition starts, so the music shifts with the page.
  function watchRoutes() {
    setRoute(currentNamespace());
    if (!window.barba || !window.barba.hooks) return;
    window.barba.hooks.before(function (data) {
      var next = data && data.next;
      setRoute((next && next.namespace) || namespaceFromPath(next && next.url && next.url.path));
    });
    // Once the real container is in, its namespace wins.
    window.barba.hooks.beforeEnter(function (data) {
      setRoute(data && data.next && data.next.namespace);
    });
  }

  function setHolding(active) {
    active = !!active;
    if (holding === active) return;
    holding = active;
    applyMusic(active ? HOLD_ON_RAMP : HOLD_OFF_RAMP);
  }

  // Returns the source node, or null when nothing played.
  function play(name) {
    if (!SOUNDS[name] || name === 'music') return null;
    if (inFrame) {
      try { window.parent.postMessage({ type: 'YUUSUKE_SOUND_PLAY', name: name }, '*'); } catch (e) {}
      return null;
    }
    if (!enabled) return null;
    var audio = getContext();
    var buffer = buffers[name];
    if (!audio || !buffer || buffer === true) return null;
    // Browsers keep the context suspended until a user gesture; resume is a
    // no-op once unlocked.
    if (audio.state === 'suspended') audio.resume();
    var source = audio.createBufferSource();
    var gain = audio.createGain();
    source.buffer = buffer;
    gain.gain.value = SOUNDS[name].volume;
    source.connect(gain);
    gain.connect(audio.destination);
    source.start(0);
    return source;
  }

  function hover() {
    var now = performance.now();
    if (now - lastHover < HOVER_THROTTLE) return;
    lastHover = now;
    play('hover');
  }

  function click() {
    play('click');
  }

  function toggleTarget(node) {
    if (!node || !node.closest) return null;
    var el = node.closest(TOGGLE);
    if (el) return el;
    var btn = node.closest('.btn-stop-motion');
    if (!btn) return null;
    var label = btn.querySelector('.btn-stop-motion__p');
    return label && /sound/i.test(label.textContent) ? btn : null;
  }

  function syncToggles() {
    document.documentElement.classList.toggle(ON_CLASS, enabled);
    document.querySelectorAll(TOGGLE + ', .btn-stop-motion').forEach(function (el) {
      if (!toggleTarget(el)) return;
      el.classList.toggle(OFF_CLASS, !enabled);
      // It is a link in the markup, and aria-pressed is only valid on a button.
      el.setAttribute('role', 'button');
      el.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    });
  }

  function setEnabled(value) {
    enabled = !!value;
    syncToggles();
    log('enabled', enabled);
    // Audible confirmation only when turning on; off should be silent.
    if (enabled) click();
    // Fetches the loop and the intro hit on the first turn-on; the loop starts
    // by itself as soon as it has decoded.
    if (enabled) preload();
    // First time on starts the loop; later toggles just mute/unmute it.
    if (enabled && !music) startMusic();
    else applyMusic(MUTE_RAMP);
  }

  function toggle() {
    setEnabled(!enabled);
  }

  function isEnabled() {
    return enabled;
  }

  function target(node) {
    if (!node || !node.closest) return null;
    var el = node.closest(TARGETS);
    if (!el || el.getAttribute('data-sound') === 'none') return null;
    return el;
  }

  // Delegated so Barba page swaps need no re-binding.
  function bind() {
    document.addEventListener('pointerover', function (event) {
      if (event.pointerType === 'touch') return;
      var el = target(event.target);
      if (!el) return;
      // Ignore moves between children of the same target.
      if (el.contains(event.relatedTarget)) return;
      hover();
    }, true);

    document.addEventListener('pointerdown', function (event) {
      if (toggleTarget(event.target)) return toggle();
      if (target(event.target)) click();
    }, true);

    // The nav toggle is an <a href="#">; keep it from jumping to the top.
    document.addEventListener('click', function (event) {
      if (toggleTarget(event.target)) event.preventDefault();
    });

    // Barba swaps the nav-less container only, but re-sync in case a page
    // ships its own toggle.
    if (window.barba && window.barba.hooks) window.barba.hooks.afterEnter(syncToggles);
  }

  // The icon sprite (Webflow custom CSS, always running) only animates while
  // sound is on; hovering the button animates it regardless.
  function injectCss() {
    if (document.getElementById('yuusuke-sound-css')) return;
    var style = document.createElement('style');
    style.id = 'yuusuke-sound-css';
    style.textContent =
      'html [data-sprite] .btn-stop-motion__icon-svg{animation-play-state:paused}' +
      'html.' + ON_CLASS + ' [data-sprite] .btn-stop-motion__icon-svg,' +
      'html [data-sprite]:hover .btn-stop-motion__icon-svg{animation-play-state:running}';
    (document.head || document.documentElement).appendChild(style);
  }

  function listenFrames() {
    window.addEventListener('message', function (event) {
      var d = event && event.data;
      if (!d || !d.type) return;
      if (d.type === 'YUUSUKE_SOUND_PLAY') {
        if (d.name === 'hover') hover();
        else if (d.name === 'click') click();
      } else if (d.type === 'YUUSUKE_INTRO_EXPLOSION') {
        introOpen();
      } else if (d.type === 'YUUSUKE_HOLD') {
        setHolding(d.active);
      }
    });
  }

  // The loop and the intro hit are the heavy files (most of a megabyte), and
  // nothing plays them until the visitor turns the sound on.
  var LAZY = { music: true, explosion: true };

  function preload() {
    Object.keys(SOUNDS).forEach(function (name) {
      if (LAZY[name] && !enabled) return;
      if (buffers[name] === null) delete buffers[name];
      load(name);
    });
  }

  // Autoplay policy keeps the context suspended until a user gesture. Decoding
  // doesn't need one, so buffers are ready by the first click; a failed decode
  // is retried here in case the browser wanted the gesture for that too.
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    var audio = getContext();
    if (!audio) return;
    if (audio.state === 'suspended') audio.resume();
    preload();
    log('unlocked');
  }

  if (!inFrame) {
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (type) {
      document.addEventListener(type, unlock, { once: true, capture: true, passive: true });
    });
    preload();
    injectCss();
    listenFrames();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { syncToggles(); watchRoutes(); }, { once: true });
    } else {
      syncToggles();
      watchRoutes();
    }
  }

  bind();

  window.YuusukeSound = {
    hover: hover,
    click: click,
    play: play,
    setEnabled: setEnabled,
    toggle: toggle,
    isEnabled: isEnabled,
    startMusic: startMusic,
    setHolding: setHolding,
    setRoute: setRoute,
    expectExplosion: expectExplosion,
    introOpen: introOpen
  };
})();
