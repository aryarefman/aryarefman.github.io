(function () {
  'use strict';

  if (window.YuusukePaper) return;

  var DURATION_IN = 0.6;
  var DURATION_OUT = 1;
  var STEPS_IN = 7;
  var STEPS_OUT = 12;
  var OVERSHOOT = 1.2;  // fração além da borda pra garantir que some

  // Atraso (s) antes da entrada dos papéis, por página (namespace do Barba).
  var ENTER_DELAY = { home: 0, about: 0.6, contact: 0.6, cases: 0.8, 'case-inner': 0.8 };
  var ENTER_DELAY_DEFAULT = 0.4;

  // Papers that travel more than TRAVEL_REF of the viewport width (the wide
  // mobile ones) get proportionally more time and steps, so they don't fly in.
  var TRAVEL_REF = 0.9;
  var STRETCH_POWER = 1.5;
  var STRETCH_MAX = 2.2;

  // Bumped by every in/out so a stale loop stops writing to the same elements.
  var generation = 0;

  var SELECTOR = [
    '[data-paper]',
    '.home_paper-left',
    '.home_paper-right',
    '.home_paper-lright',
    '.about_paper',
    '.contact_paper',
    '.cases-inner-paper',
    '.loader_paper-left',
    '.loader_paper-right',
    '.loader_paper-lright'
  ].join(',');

  function log() {
    if (!window.__paperLog) return;
    try { console.log.apply(console, ['[paper]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  function collectPapers(container) {
    var root = container || document;
    if (!root || !root.querySelectorAll) return [];
    return Array.prototype.slice.call(root.querySelectorAll(SELECTOR));
  }

  // No enter o conteúdo pode entrar 1-2 frames depois; tenta de novo se vazio.
  function collectWithRetry(container, tries) {
    tries = tries == null ? 12 : tries;
    var imgs = collectPapers(container);
    if (imgs.length || tries <= 0) return Promise.resolve(imgs);
    return waitFrames(1).then(function () { return collectWithRetry(container, tries - 1); });
  }

  function waitFrames(n) {
    return new Promise(function (resolve) {
      (function tick() {
        if (--n <= 0) resolve();
        else requestAnimationFrame(tick);
      })();
    });
  }

  // Espera o papel ter tamanho real (no enter o DOM acabou de ser montado).
  function waitLayout(img, tries) {
    tries = tries == null ? 16 : tries;
    var rect = img.getBoundingClientRect();
    if (rect.width >= 2 && rect.height >= 2) return Promise.resolve(rect);
    if (tries <= 0) return Promise.resolve(rect);
    return waitFrames(1).then(function () { return waitLayout(img, tries - 1); });
  }

  // Direção de saída. Override: data-paper-dir="left|right|up|down".
  function resolveDir(img, rect) {
    var override = (img.getAttribute('data-paper-dir') || '').toLowerCase();
    if (override === 'left' || override === 'right' || override === 'up' || override === 'down') {
      return override;
    }
    // Case-inner: sempre desce na saída (= entra de baixo pra cima).
    if (img.classList && img.classList.contains('cases-inner-paper')) {
      return 'down';
    }
    if (img.classList) {
      if (img.classList.contains('home_paper-left') || img.classList.contains('loader_paper-left')) {
        return 'left';
      }
      if (
        img.classList.contains('home_paper-right')
        || img.classList.contains('home_paper-lright')
        || img.classList.contains('loader_paper-right')
        || img.classList.contains('loader_paper-lright')
      ) {
        return 'right';
      }
    }
    // Side papers keep their side even when they grow past the viewport on
    // mobile, where the size-based guess below would send them up or down.
    if (img.classList) {
      if (img.classList.contains('about_paper')) return 'right';
      if (img.classList.contains('contact_paper')) return 'left';
    }
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var fullHeight = rect.height >= vh * 0.9;
    var fullWidth = rect.width >= vw * 0.9;

    if (fullHeight && !fullWidth) {
      return (vw - rect.right) <= rect.left ? 'right' : 'left';
    }
    if (fullWidth && !fullHeight) {
      return (vh - rect.bottom) <= rect.top ? 'down' : 'up';
    }
    var gaps = [
      { d: 'left', v: rect.left },
      { d: 'right', v: vw - rect.right },
      { d: 'up', v: rect.top },
      { d: 'down', v: vh - rect.bottom }
    ].sort(function (a, b) { return a.v - b.v; });
    return gaps[0].d;
  }

  // Deslocamento em px (assinado) que leva o papel pra fora pela borda escolhida.
  function offset(dir, rect) {
    var dx = 0, dy = 0;
    if (dir === 'left') dx = -(rect.right + rect.width * (OVERSHOOT - 1));
    else if (dir === 'right') dx = (window.innerWidth - rect.left) + rect.width * (OVERSHOOT - 1);
    else if (dir === 'up') dy = -(rect.bottom + rect.height * (OVERSHOOT - 1));
    else dy = (window.innerHeight - rect.top) + rect.height * (OVERSHOOT - 1);
    return { dx: dx, dy: dy };
  }

  // Rect com fallback: se o layout ainda não veio, deriva do CSS + viewport.
  function fallbackRect(img) {
    var cs = window.getComputedStyle(img);
    var vw = window.innerWidth, vh = window.innerHeight;
    var w = parseFloat(cs.width) || vw * 0.5;
    var h = parseFloat(cs.height) || vh;
    var left = (cs.right && cs.right !== 'auto') ? (vw - w - (parseFloat(cs.right) || 0)) : (parseFloat(cs.left) || 0);
    var top = (cs.bottom && cs.bottom !== 'auto') ? (vh - h - (parseFloat(cs.bottom) || 0)) : (parseFloat(cs.top) || 0);
    return { left: left, top: top, width: w, height: h, right: left + w, bottom: top + h };
  }

  function stretchOf(dx) {
    var ratio = Math.abs(dx) / Math.max(1, window.innerWidth * TRAVEL_REF);
    return Math.min(STRETCH_MAX, Math.pow(Math.max(1, ratio), STRETCH_POWER));
  }

  function stretchForItems(items) {
    return items.reduce(function (max, it) { return Math.max(max, stretchOf(it.dx)); }, 1);
  }

  // Same measure before the items exist, for callers scheduling around the entry.
  function stretchForContainer(container) {
    return collectPapers(container).reduce(function (max, img) {
      var rect = img.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) rect = fallbackRect(img);
      if (rect.width < 2 || rect.height < 2) return max;
      return Math.max(max, stretchOf(offset(resolveDir(img, rect), rect).dx));
    }, 1);
  }

  function buildOriginalItems(imgs, initialFactor) {
    initialFactor = initialFactor == null ? 1 : initialFactor;
    return Promise.all(imgs.map(function (img) {
      return waitLayout(img).then(function (rect) {
        if (rect.width < 2 || rect.height < 2) rect = fallbackRect(img);
        if (rect.width < 2 || rect.height < 2) return null;
        var dir = resolveDir(img, rect);
        var off = offset(dir, rect);
        var item = {
          img: img,
          dx: off.dx,
          dy: off.dy,
          prevTranslate: img.style.translate,
          prevWillChange: img.style.willChange
        };
        setFactor(item, initialFactor);
        img.style.willChange = 'translate';
        img.style.visibility = '';
        return item;
      });
    })).then(function (arr) {
      return arr.filter(Boolean);
    });
  }

  function setFactor(item, f) {
    item.img.style.translate = (item.dx * f) + 'px ' + (item.dy * f) + 'px';
  }

  function linear(t) { return t; }
  function easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }

  // f: 0 = in place, 1 = outside the viewport.
  function animate(items, fromF, toF, duration, steps, ease) {
    var gen = generation;
    items.forEach(function (it) { setFactor(it, fromF); });
    return new Promise(function (resolve) {
      var start = null;
      var durMs = duration * 1000;
      function frame(now) {
        // A newer in/out took over these same elements.
        if (gen !== generation) return resolve();
        if (start === null) start = now;
        var t = Math.min(1, (now - start) / durMs);
        var q = Math.round(ease(t) * steps) / steps;
        var f = fromF + (toF - fromF) * q;
        for (var i = 0; i < items.length; i++) setFactor(items[i], f);
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function cleanup(items, revealOriginal) {
    items.forEach(function (it) {
      it.img.style.visibility = revealOriginal ? '' : 'hidden';
      it.img.style.translate = it.prevTranslate;
      it.img.style.willChange = it.prevWillChange;
    });
    return Promise.resolve();
  }

  function wait(seconds) {
    if (!seconds) return Promise.resolve();
    return new Promise(function (resolve) { setTimeout(resolve, seconds * 1000); });
  }

  function enterDelay(container, options) {
    if (options && Number.isFinite(options.delay)) {
      return Math.max(0, options.delay);
    }
    var ns = container && container.getAttribute && container.getAttribute('data-barba-namespace');
    ns = String(ns || '').toLowerCase();
    return ENTER_DELAY.hasOwnProperty(ns) ? ENTER_DELAY[ns] : ENTER_DELAY_DEFAULT;
  }

  function enterTiming(container, options) {
    var delay = enterDelay(container, options);
    var duration = DURATION_IN * stretchForContainer(container);
    return {
      delay: delay,
      duration: duration,
      total: delay + duration
    };
  }

  // ---- API ------------------------------------------------------------------

  function out(container) {
    generation++;
    return collectWithRetry(container).then(function (imgs) {
      log('out found', imgs.length);
      if (!imgs.length) return;
      return buildOriginalItems(imgs, 0).then(function (items) {
        log('out built', items.length);
        if (!items.length) return;
        var k = stretchForItems(items);
        return animate(items, 0, 1, DURATION_OUT * k, Math.round(STEPS_OUT * k), easeInOutSine).then(function () {
          return cleanup(items, false);
        });
      });
    });
  }

  function paperIn(container, options) {
    generation++;
    return collectWithRetry(container).then(function (imgs) {
      log('in found', imgs.length);
      if (!imgs.length) return;
      return buildOriginalItems(imgs, 1).then(function (items) {
        log('in built', items.length);
        if (!items.length) {
          // sem layout medível: garante que o papel apareça
          imgs.forEach(function (img) { img.style.visibility = ''; });
          return;
        }
        // Segura o papel fora da tela durante o delay (home = 0).
        items.forEach(function (it) { setFactor(it, 1); });
        var delay = enterDelay(container, options);
        return wait(delay).then(function () {
          var k = stretchForItems(items);
          return animate(items, 1, 0, DURATION_IN * k, Math.round(STEPS_IN * k), linear).then(function () {
            return cleanup(items, true);
          });
        });
      });
    });
  }

  // Esconde na hora (chamado no enter antes do fade) pra não piscar o papel.
  function hide(container) {
    collectPapers(container).forEach(function (img) { img.style.visibility = 'hidden'; });
  }

  window.YuusukePaper = {
    out: out,
    in: paperIn,
    hide: hide,
    enterTiming: enterTiming
  };
})();
