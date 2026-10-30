(function () {
  'use strict';

  if (window.__yuusukeBarbaInitialized) return;
  window.__yuusukeBarbaInitialized = true;

  if (!window.barba) {
    console.warn('[barba-transition] Barba.js not found.');
    return;
  }

  // ---- Sub-scripts (paper / title / inner) ----------------------------------
  // Carregados aqui pra manter só os 2 <script> CDN no Webflow; o deploy
  // atualiza. Resolvem no onload do próprio script, sem polling.
  var SCRIPT_BASE = '/webflow-scripts/';
  var LOAD_TIMEOUT = 8000;
  var modulePromises = {};

  function loadModule(name, file, global) {
    if (window[global]) return Promise.resolve(window[global]);
    if (modulePromises[name]) return modulePromises[name];

    modulePromises[name] = new Promise(function (resolve) {
      var attribute = 'data-yuusuke-' + name;
      var existing = document.querySelector('script[' + attribute + ']');
      var script = existing || document.createElement('script');
      var settled = false;

      function done() {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(window[global] || null);
      }

      // Safety net: an already-loaded tag never fires load again.
      var timer = window.setTimeout(done, LOAD_TIMEOUT);

      script.addEventListener('load', done);
      script.addEventListener('error', done);

      if (existing) {
        if (window[global]) {
          done();
        } else if (existing.readyState === 'complete' || existing.readyState === 'loaded') {
          window.setTimeout(done, 0);
        }
      } else {
        script.src = SCRIPT_BASE + file;
        script.setAttribute(attribute, '1');
        (document.head || document.documentElement).appendChild(script);
      }
    });

    return modulePromises[name];
  }

  function paperReady() {
    return loadModule('paper', 'paper-transition.js', 'YuusukePaper');
  }

  function titleReady() {
    return loadModule('title', 'title-morph.js', 'YuusukeTitle');
  }

  function innerReady() {
    return loadModule('inner', 'inner-text.js', 'YuusukeInner');
  }

  function loaderReady() {
    return loadModule('loader', 'loader-transition.js', 'YuusukeLoader');
  }

  // Self-binding (event delegation), so loading it is all it needs.
  function soundReady() {
    return loadModule('sound', 'ui-sound.js', 'YuusukeSound');
  }

  // Self-binding too: About page index and award badge.
  function aboutReady() {
    return loadModule('about', 'about-page.js', 'YuusukeAbout');
  }

  // Self-binding too: case page gallery slider and previous/next case.
  function caseReady() {
    return loadModule('case', 'case-page.js', 'YuusukeCase');
  }

  // Dispara o download já, não na primeira transição.
  paperReady();
  titleReady();
  innerReady();
  loaderReady();
  soundReady();
  aboutReady();
  caseReady();

  function paperOut(el) {
    return paperReady().then(function (api) {
      return (api && api.out(el)) || Promise.resolve();
    });
  }

  function titleOut(el) {
    return titleReady().then(function (api) {
      return (api && api.out(el)) || Promise.resolve();
    });
  }

  function innerOut(el) {
    return innerReady().then(function (api) {
      return (api && api.out(el)) || Promise.resolve();
    });
  }

  function waitUntil(startedAt, seconds) {
    var elapsed = (performance.now() - startedAt) / 1000;
    var remaining = Math.max(0, seconds - elapsed);
    return new Promise(function (resolve) {
      window.setTimeout(resolve, remaining * 1000);
    });
  }

  // Navbar/bot_info live outside the Barba container, so they only fade on the
  // first load, in sync with the page content landing.
  var CHROME_SELECTOR = '.navbar, .bot_info';

  // Live Tokyo time in the bottom bar (.bot_info .time).
  (function japanClock() {
    var format;
    try {
      format = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      });
    } catch (e) { return; }

    function tick() {
      var now = new Date();
      var text = format.format(now);
      Array.prototype.forEach.call(document.querySelectorAll('.bot_info .time'), function (el) {
        if (el.textContent !== text) el.textContent = text;
        // The label sits in a component text prop next to the span ("JA 00:00:00").
        var label = el.previousSibling;
        if (label && label.nodeType === 3 && /\bJA\b/.test(label.nodeValue)) {
          label.nodeValue = label.nodeValue.replace(/\bJA\b/, 'JP');
        }
      });
      // No seconds (they made the tag's width jitter); re-arm on the next minute.
      window.setTimeout(tick, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick, { once: true });
    else tick();
  })();

  function chromeElements() {
    return Array.prototype.slice.call(document.querySelectorAll(CHROME_SELECTOR));
  }

  function hideChrome() {
    chromeElements().forEach(function (el) {
      el.style.opacity = '0';
    });
  }

  function chromeIn() {
    var els = chromeElements();
    if (!els.length) return Promise.resolve();

    if (window.gsap) {
      return window.gsap.to(els, {
        opacity: 1,
        duration: 0.8,
        ease: 'power1.out',
        onComplete: function () {
          els.forEach(function (el) { el.style.opacity = ''; });
        }
      });
    }

    return new Promise(function (resolve) {
      els.forEach(function (el) {
        el.style.transition = 'opacity 0.8s ease';
        el.style.opacity = '1';
      });
      window.setTimeout(function () {
        els.forEach(function (el) {
          el.style.transition = '';
          el.style.opacity = '';
        });
        resolve();
      }, 850);
    });
  }

  // Quanto antes do fim da animação 3D o conteúdo começa a encaixar.
  var ENTER_LEAD = 0.4;

  function enterContent(el, startedAt, transitionTimingPromise, options) {
    var withChrome = !!(options && options.chrome);
    var lead = options && Number.isFinite(options.lead) ? options.lead : ENTER_LEAD;
    return Promise.all([paperReady(), titleReady(), innerReady()]).then(function (apis) {
      var paperApi = apis[0];
      var titleApi = apis[1];
      var innerApi = apis[2];
      if (paperApi && paperApi.hide) paperApi.hide(el);
      if (titleApi && titleApi.hide) titleApi.hide(el);
      if (innerApi && innerApi.hide) innerApi.hide(el);

      var namespace = el && el.getAttribute
        ? String(el.getAttribute('data-barba-namespace') || '').toLowerCase()
        : '';
      var fadePromise = fadeIn(el);

      function runAt(seconds, callback) {
        return Promise.all([
          fadePromise,
          waitUntil(startedAt, seconds)
        ]).then(callback);
      }

      return transitionTimingPromise.then(function (webglTiming) {
        var fallbackTiming = paperApi && paperApi.enterTiming
          ? paperApi.enterTiming(el)
          : { delay: 0, duration: 0.6, total: 0.6 };
        var paperDelay = webglTiming
          ? Math.max(0, webglTiming.duration - lead)
          : fallbackTiming.delay;
        var paperDuration = fallbackTiming.duration || 0.6;
        var paperTotal = paperDelay + paperDuration;
        var titleAt = Math.max(0, paperTotal - 0.4);
        var innerAt = namespace === 'home' ? titleAt : paperTotal;
        var elapsed = (performance.now() - startedAt) / 1000;
        var remainingPaperDelay = Math.max(0, paperDelay - elapsed);

        log(
          '[barba-transition] enter timing',
          namespace,
          webglTiming ? ('3D ' + webglTiming.duration.toFixed(2) + 's') : 'fallback',
          '| paper', paperDelay.toFixed(2),
          '| title', titleAt.toFixed(2),
          '| inner', innerAt.toFixed(2)
        );

        return Promise.all([
          (paperApi && paperApi.in(el, { delay: remainingPaperDelay })) || Promise.resolve(),
          withChrome ? runAt(titleAt, chromeIn) : Promise.resolve(),
          runAt(titleAt, function () {
            return (titleApi && titleApi.in(el)) || Promise.resolve();
          }),
          runAt(innerAt, function () {
            return (innerApi && innerApi.in(el)) || Promise.resolve();
          })
        ]);
      });
    });
  }

  var routeMap = {
    home: 'home',
    index: 'home',
    cases: 'cases',
    'paper.html': 'cases',
    paper: 'cases',
    case: 'cases',
    about: 'about',
    contact: 'contact',
    'case-inner': 'case-inner'
  };

  var currentRoute = 'home';
  var transitionTimingWaiter = null;
  var firstLoadTimingResolve = null;
  var firstLoadTiming = new Promise(function (resolve) {
    firstLoadTimingResolve = resolve;
  });
  var activeRouteTransition = null;
  var syncedFrameWindows = new WeakSet();
  var casesRetryTimers = [];

  function log() {
    if (!window.__barbaLog) return;
    console.log.apply(console, arguments);
  }

  function clearCasesRetries() {
    casesRetryTimers.forEach(window.clearTimeout);
    casesRetryTimers = [];
  }

  function waitForTransitionTiming(route) {
    if (transitionTimingWaiter) {
      window.clearTimeout(transitionTimingWaiter.timer);
      transitionTimingWaiter.resolve(null);
    }
    return new Promise(function (resolve) {
      var waiter = {
        route: route,
        resolve: resolve,
        timer: window.setTimeout(function () {
          if (transitionTimingWaiter !== waiter) return;
          transitionTimingWaiter = null;
          resolve(null);
        }, 180)
      };
      transitionTimingWaiter = waiter;
    });
  }

  function receiveTransitionTiming(data) {
    var firstRoute = String(data.route || '').toLowerCase();
    var firstDuration = Number.isFinite(data.duration)
      ? data.duration
      : Number(data.durationMs) / 1000;

    // The intro timing arrives once the loader fires it, long after the short
    // per-navigation window, so it is captured whenever it shows up.
    if (firstLoadTimingResolve && firstRoute === 'home' && Number.isFinite(firstDuration)) {
      var resolveFirst = firstLoadTimingResolve;
      firstLoadTimingResolve = null;
      resolveFirst({ route: firstRoute, duration: Math.max(firstDuration, 0) });
    }

    if (!transitionTimingWaiter) return;
    var route = String(data.route || '').toLowerCase();
    if (route !== transitionTimingWaiter.route) return;
    var duration = Number.isFinite(data.duration)
      ? data.duration
      : Number(data.durationMs) / 1000;
    if (!Number.isFinite(duration) || duration < 0) return;
    var waiter = transitionTimingWaiter;
    transitionTimingWaiter = null;
    window.clearTimeout(waiter.timer);
    waiter.resolve({ route: route, duration: duration });
  }

  function getNamespaceFromData(data) {
    var ns = (data && data.next && data.next.namespace)
      || (data && data.current && data.current.namespace)
      || '';
    return String(ns).trim().toLowerCase();
  }

  function getPathFromData(data) {
    var href = (data && data.next && data.next.url && data.next.url.href)
      || (data && data.current && data.current.url && data.current.url.href)
      || window.location.href;
    try {
      return new URL(href).pathname;
    } catch (e) {
      return window.location.pathname;
    }
  }

  function routeFromPath(path) {
    var p = String(path || '/').replace(/\/+$/, '') || '/';
    if (p === '/') return 'home';
    var segs = p.split('/').filter(Boolean);
    var first = (segs[0] || '').toLowerCase();
    if (first === 'cases' || first === 'case' || first === 'paper.html' || first === 'paper') return segs.length > 1 ? 'case-inner' : 'cases';
    if (first === 'about') return 'about';
    if (first === 'contact') return 'contact';
    return routeMap[first] || 'home';
  }

  function getSceneRoute(data) {
    var ns = getNamespaceFromData(data);
    return routeMap[ns] || routeFromPath(getPathFromData(data));
  }

  // No leave o Barba ainda pode não ter o namespace do próximo container. Cair
  // no namespace atual mandaria a cena para a rota em que ela já está, e o
  // Navigation ignora esse caso — por isso a transição 3D só começava no enter.
  function getTargetRoute(data) {
    var ns = String((data && data.next && data.next.namespace) || '').trim().toLowerCase();
    if (ns && routeMap[ns]) return routeMap[ns];

    var href = data && data.next && data.next.url && data.next.url.href;
    if (href) {
      try {
        return routeFromPath(new URL(href).pathname);
      } catch (e) {}
    }
    return getSceneRoute(data);
  }

  // ---- WebGL (iframe) bridge ------------------------------------------------

  function getWebGLFrames() {
    return document.querySelectorAll('iframe[data-webgl-frame], iframe[src*="yuusuke-theta.vercel.app"]');
  }

  // The embed's title shows up as a tooltip when the mouse rests on the scene.
  function silenceFrameTitles() {
    getWebGLFrames().forEach(function (frame) {
      var title = frame.getAttribute('title');
      if (!title) return;
      if (!frame.getAttribute('aria-label')) frame.setAttribute('aria-label', title);
      frame.removeAttribute('title');
    });
  }

  silenceFrameTitles();

  function postToFrames(route, animate) {
    getWebGLFrames().forEach(function (frame) {
      if (!frame || !frame.contentWindow) return;
      frame.contentWindow.postMessage({ type: 'YUUSUKE_NAVIGATE', route: route, animate: animate }, '*');
    });
  }

  // Parent mouse → iframe parallax (iframe alone can't see page mouse).
  // Coalesced to one update per frame: the raw event fires far more often than
  // that, and each dispatch cost a layout read plus a cross-process postMessage.
  var pointerFrame = 0;
  var pointerX = 0;
  var pointerY = 0;
  var frameRects = null;

  function invalidateFrameRects() {
    frameRects = null;
  }

  function getFrameRects() {
    if (frameRects) return frameRects;
    var rects = [];
    getWebGLFrames().forEach(function (frame) {
      if (!frame || !frame.contentWindow) return;
      var rect = frame.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      rects.push({ win: frame.contentWindow, rect: rect });
    });
    // Não cacheia vazio: o iframe pode ainda não ter montado.
    if (rects.length) frameRects = rects;
    return rects;
  }

  function flushPointer() {
    pointerFrame = 0;
    getFrameRects().forEach(function (entry) {
      var rect = entry.rect;
      var x = ((pointerX - rect.left) / rect.width) * 2 - 1;
      var y = ((pointerY - rect.top) / rect.height) * 2 - 1;
      entry.win.postMessage({ type: 'mouse-move', x: x, y: y }, '*');
    });
  }

  window.addEventListener('mousemove', function (e) {
    pointerX = e.clientX;
    pointerY = e.clientY;
    if (!pointerFrame) pointerFrame = window.requestAnimationFrame(flushPointer);
  }, { passive: true });

  window.addEventListener('resize', invalidateFrameRects, { passive: true });
  window.addEventListener('scroll', invalidateFrameRects, { passive: true });

  function notifyWebGL(route, animate) {
    currentRoute = route;
    if (window.experience && typeof window.experience.navigate === 'function') {
      window.experience.navigate(route, { animate: animate });
    }
    postToFrames(route, animate);
    sendCasesToFrames();
  }

  // ---- Cases (CMS) ----------------------------------------------------------
  // Lê a Collection List escondida (.cases-item) e manda os dados pro iframe,
  // que aplica nas faces dos retângulos (thumb + nome + tags) e guarda o link.

  function collectCases() {
    var items = document.querySelectorAll('.cases-item');
    var out = [];
    items.forEach(function (item) {
      var img = item.querySelector('.cases-thumb');
      var thumb = img ? (img.getAttribute('src') || img.currentSrc || img.src || '') : '';
      var nameEl = item.querySelector('.text-size-large');
      var name = nameEl ? nameEl.textContent.trim() : '';
      var linkEl = item.querySelector('.cases-link');
      var url = linkEl ? (linkEl.getAttribute('href') || '') : '';
      var tags = [];
      item.querySelectorAll('.cases-tags_item').forEach(function (t) {
        var tx = t.textContent.trim();
        if (tx) tags.push(tx);
      });
      if (thumb || name) out.push({ name: name, thumb: thumb, url: url, tags: tags });
    });
    return out;
  }

  // The ring lives in WebGL, out of reach of the keyboard and of screen readers.
  // On the Cases page the hidden list becomes the accessible way in: its links
  // get a name, sit off screen, and show as a small label while focused.
  function exposeCaseLinks() {
    if (!document.getElementById('yuusuke-cases-a11y')) {
      var style = document.createElement('style');
      style.id = 'yuusuke-cases-a11y';
      var page = 'html:has([data-barba-namespace="cases"]) ';
      style.textContent =
        page + '.cases-wrapper{display:block;position:absolute;left:-9999px;top:0;width:1px;height:1px}' +
        page + '.cases-link:focus-visible{position:fixed;left:1.25em;bottom:4.5em;top:auto;right:auto;z-index:200;display:block;' +
        'width:auto;height:auto;padding:.7em 1em .8em;background:#eb1716;color:#000;text-transform:uppercase;' +
        'font-size:.875em;line-height:1;text-decoration:none;outline:none}' +
        page + '.cases-link:focus-visible::after{content:attr(aria-label)}';
      (document.head || document.documentElement).appendChild(style);
    }
    document.querySelectorAll('.cases-item').forEach(function (item) {
      var link = item.querySelector('.cases-link');
      var nameEl = item.querySelector('.text-size-large');
      var name = nameEl ? nameEl.textContent.trim() : '';
      if (link && name) link.setAttribute('aria-label', 'Open case: ' + name);
    });
  }

  function sendCasesToFrames() {
    exposeCaseLinks();
    var cases = collectCases();
    var frames = getWebGLFrames();
    log('[barba-transition] cases coletados:', cases.length, '| iframes WebGL:', frames.length);
    if (!cases.length) return;
    frames.forEach(function (frame) {
      if (!frame || !frame.contentWindow) return;
      frame.contentWindow.postMessage({ type: 'YUUSUKE_CASES', cases: cases }, '*');
    });
  }

  // O iframe avisa quando fica pronto; respondemos com a rota atual + os cases.
  // Sempre com animate: false, pra um iframe recém-montado não re-disparar a
  // transição 3D que já rodou.
  // ---- Cases title follows the hovered card ----------------------------------
  // The big morph title swaps to the hovered case's name and back to its own
  // text when the pointer leaves the cards.
  var CASE_TITLE_MAX_VW = 0.7;
  // Moving between two cards reports "none" for an instant; wait it out.
  var CASE_TITLE_REVERT_DELAY = 180;
  // Seconds for the old name to melt away and the new one to form; both run
  // at once, overlapping inside the goo.
  var CASE_TITLE_OUT = 0.8;
  var CASE_TITLE_IN = 0.9;
  var caseTitleTimer = 0;
  var caseTitleLocked = false;

  function casesTitleEl() {
    var els = document.querySelectorAll('[data-barba-namespace="cases"] [data-title="morph"]');
    return els.length ? els[els.length - 1] : null;
  }

  function showCaseTitle(el, text) {
    var api = window.YuusukeTitle;
    if (!api || !api.swap) return;
    if (!el.hasAttribute('data-title-default')) el.setAttribute('data-title-default', el.textContent);
    var fallback = el.getAttribute('data-title-default');
    var next = text || fallback;
    if ((el.getAttribute('data-title-current') || fallback) === next) return;
    el.setAttribute('data-title-current', next);
    // The heading is anchored right; long names shrink to stay on screen.
    api.swap(el, next, {
      align: 'right',
      maxWidth: window.innerWidth * CASE_TITLE_MAX_VW,
      durationOut: CASE_TITLE_OUT,
      durationIn: CASE_TITLE_IN
    });
  }

  function onCaseHover(name) {
    window.clearTimeout(caseTitleTimer);
    if (caseTitleLocked || currentRoute !== 'cases') return;
    // Phones and tablets keep the page title as it is.
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) return;
    var el = casesTitleEl();
    // Still hidden: the page-enter morph has not revealed it yet.
    if (!el || (el.style.visibility === 'hidden' && !el.__yuusukeGoo__)) return;
    if (name) return showCaseTitle(el, String(name));
    caseTitleTimer = window.setTimeout(function () { showCaseTitle(el, null); }, CASE_TITLE_REVERT_DELAY);
  }

  // ---- "Click for details" beside the cursor ----------------------------------
  // The cursor is over the 3D frame, so the frame reports where it is and this
  // page draws the label. Touch screens get a written hint instead (.cases_hint).
  var CASE_HINT_TEXT = 'Click for details';
  var CASE_HINT_OFFSET_X = 18;
  var CASE_HINT_OFFSET_Y = 16;
  var CASE_HINT_EASE = 0.22;
  var caseHint = { el: null, on: false, x: 0, y: 0, tx: 0, ty: 0, raf: 0, placed: false };

  function caseHintEl() {
    if (caseHint.el) return caseHint.el;
    var style = document.createElement('style');
    style.textContent =
      '.yuusuke-case-hint{position:fixed;left:0;top:0;z-index:150;pointer-events:none;opacity:0;' +
      'transition:opacity .2s ease;will-change:transform;background:#eb1716;color:#000;' +
      'padding:.6em .9em .7em;font-size:.875em;line-height:1;text-transform:uppercase;white-space:nowrap}' +
      '.yuusuke-case-hint.is-on{opacity:1}' +
      // The written hint is for screens with no cursor to follow.
      '.cases_hint{display:none}@media (hover: none){.cases_hint{display:block}}';
    (document.head || document.documentElement).appendChild(style);
    var el = document.createElement('div');
    el.className = 'yuusuke-case-hint';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = CASE_HINT_TEXT;
    document.body.appendChild(el);
    caseHint.el = el;
    return el;
  }

  function caseHintTick() {
    caseHint.raf = 0;
    caseHint.x += (caseHint.tx - caseHint.x) * CASE_HINT_EASE;
    caseHint.y += (caseHint.ty - caseHint.y) * CASE_HINT_EASE;
    caseHint.el.style.transform = 'translate3d(' + caseHint.x.toFixed(1) + 'px,' + caseHint.y.toFixed(1) + 'px,0)';
    var settled = Math.abs(caseHint.tx - caseHint.x) < 0.3 && Math.abs(caseHint.ty - caseHint.y) < 0.3;
    if (caseHint.on && !settled) caseHint.raf = window.requestAnimationFrame(caseHintTick);
  }

  function caseHintShow(on) {
    var el = caseHintEl();
    caseHint.on = on;
    el.classList.toggle('is-on', on);
    // Next time it shows it starts under the cursor, not where it last was.
    if (!on) caseHint.placed = false;
  }

  function caseHintHover(name) {
    if (!name || caseTitleLocked || currentRoute !== 'cases') caseHintShow(false);
  }

  function caseHintMove(d, source) {
    if (caseTitleLocked || currentRoute !== 'cases' || d.dragging) return caseHintShow(false);
    var left = 0;
    var top = 0;
    getWebGLFrames().forEach(function (frame) {
      if (frame.contentWindow !== source) return;
      var rect = frame.getBoundingClientRect();
      left = rect.left;
      top = rect.top;
    });
    var el = caseHintEl();
    var x = left + d.x + CASE_HINT_OFFSET_X;
    var y = top + d.y + CASE_HINT_OFFSET_Y;
    // Keeps the label inside the window near the right and bottom edges.
    x = Math.min(x, window.innerWidth - el.offsetWidth - 8);
    y = Math.min(y, window.innerHeight - el.offsetHeight - 8);
    caseHint.tx = x;
    caseHint.ty = y;
    if (!caseHint.placed) {
      caseHint.placed = true;
      caseHint.x = x;
      caseHint.y = y;
    }
    caseHintShow(true);
    if (!caseHint.raf) caseHint.raf = window.requestAnimationFrame(caseHintTick);
  }

  // Created up front: its stylesheet also switches on the written hint for touch.
  caseHintEl();

  barba.hooks.before(function () {
    caseTitleLocked = true;
    window.clearTimeout(caseTitleTimer);
    if (caseHint.el) caseHintShow(false);
  });
  barba.hooks.after(function () { caseTitleLocked = false; });

  window.addEventListener('message', function (event) {
    var d = event && event.data;
    if (!d) return;

    if (d.type === 'YUUSUKE_TRANSITION_TIMING') {
      receiveTransitionTiming(d);
      return;
    }

    if (d.type === 'YUUSUKE_READY') {
      window.__yuusukeWebglReady = true;
      var source = event.source;
      if (source && !syncedFrameWindows.has(source)) {
        syncedFrameWindows.add(source);
        source.postMessage({
          type: 'YUUSUKE_NAVIGATE',
          route: currentRoute,
          animate: false
        }, '*');
      }
      sendCasesToFrames();
      return;
    }

    if (d.type === 'YUUSUKE_CASE_HOVER') {
      onCaseHover(d.name);
      caseHintHover(d.name);
      return;
    }

    if (d.type === 'YUUSUKE_CASE_POINTER') {
      caseHintMove(d, event.source);
      return;
    }

    // Clique num retângulo dentro da cena: navega até a página template do case.
    if (d.type === 'YUUSUKE_OPEN_CASE' && d.url) {
      if (window.barba && typeof window.barba.go === 'function') {
        window.barba.go(d.url);
      } else {
        window.location.href = d.url;
      }
      return;
    }
  });

  // ---- Webflow --------------------------------------------------------------

  function reinitWebflow() {
    if (!window.Webflow) return;
    try {
      window.Webflow.destroy();
      window.Webflow.ready();
      var ix2 = window.Webflow.require('ix2');
      if (ix2 && typeof ix2.init === 'function') ix2.init();
    } catch (error) {
      console.warn('[barba-transition] Webflow reinit failed:', error);
    }
  }

  // ---- Fades (apenas opacity; nunca mexe em visibility/display) -------------

  function fadeOut(el) {
    if (!el) return Promise.resolve();
    if (window.gsap) return window.gsap.to(el, { opacity: 0, duration: 0.3, ease: 'power1.out' });
    return new Promise(function (resolve) {
      el.style.transition = 'opacity 0.3s ease';
      el.style.opacity = '0';
      window.setTimeout(resolve, 320);
    });
  }

  function fadeIn(el) {
    if (!el) return Promise.resolve();
    if (window.gsap) {
      return window.gsap.fromTo(el, { opacity: 0 }, {
        opacity: 1,
        duration: 0.4,
        ease: 'power1.out',
        onComplete: function () { el.style.opacity = ''; }
      });
    }
    return new Promise(function (resolve) {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.4s ease';
      requestAnimationFrame(function () { el.style.opacity = '1'; });
      window.setTimeout(function () { el.style.opacity = ''; resolve(); }, 420);
    });
  }

  function nextPaint() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(resolve);
      });
    });
  }

  // Barba keeps both containers in normal flow during enter. Pinning the next
  // one prevents its real elements from animating one viewport below the fold.
  function pinIncoming(el) {
    if (!el || el.__yuusukePinned__) return;
    el.__yuusukePinned__ = {
      position: el.style.position,
      top: el.style.top,
      right: el.style.right,
      bottom: el.style.bottom,
      left: el.style.left,
      width: el.style.width,
      zIndex: el.style.zIndex
    };
    el.style.position = 'absolute';
    el.style.top = '0';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.left = '0';
    el.style.width = '100%';
    el.style.zIndex = 'auto';
  }

  function unpinIncoming(el) {
    if (!el || !el.__yuusukePinned__) return;
    var previous = el.__yuusukePinned__;
    Object.keys(previous).forEach(function (property) {
      el.style[property] = previous[property];
    });
    delete el.__yuusukePinned__;
  }

  // ---- Barba ----------------------------------------------------------------

  barba.hooks.after(function (data) {
    unpinIncoming(data && data.next && data.next.container);
    invalidateFrameRects();

    // The old container is gone by now, so its SVG goo filters can be dropped.
    var previous = data && data.current && data.current.container;
    if (!previous) return;
    if (window.YuusukeTitle && window.YuusukeTitle.release) {
      window.YuusukeTitle.release(previous);
    }
    if (window.YuusukeInner && window.YuusukeInner.release) {
      window.YuusukeInner.release(previous);
    }
  });

  // Reforço: tenta mandar os cases algumas vezes nos primeiros segundos, caso o
  // iframe ainda esteja carregando quando o YUUSUKE_READY/once dispara.
  casesRetryTimers = [200, 800, 1600, 3000].map(function (ms) {
    return window.setTimeout(sendCasesToFrames, ms);
  });

  function timingRace(seconds) {
    return Promise.race([
      firstLoadTiming,
      new Promise(function (resolve) {
        window.setTimeout(function () { resolve(null); }, seconds * 1000);
      })
    ]);
  }

  // Primeira carga: espera o loader terminar antes de revelar a página.
  function runFirstLoad(data) {
    var container = data && data.next && data.next.container;
    var firstRoute = getSceneRoute(data);
    notifyWebGL(firstRoute, false);
    hideChrome();

    return Promise.all([
      paperReady(),
      titleReady(),
      innerReady(),
      loaderReady()
    ]).then(function (apis) {
      var paperApi = apis[0];
      var titleApi = apis[1];
      var innerApi = apis[2];
      var loaderApi = apis[3];

      if (paperApi && paperApi.hide && container) paperApi.hide(container);
      if (titleApi && titleApi.hide && container) titleApi.hide(container);
      if (innerApi && innerApi.hide && container) innerApi.hide(container);

      // A página entra junto com a saída dos papéis, não depois dela.
      var loaderDone = loaderApi && (loaderApi.exitStarted || loaderApi.ready)
        ? (loaderApi.exitStarted || loaderApi.ready)
        : Promise.resolve();

      if (!loaderApi) {
        var loaderNode = document.querySelector('.loader');
        if (loaderNode) loaderNode.style.display = 'none';
      }

      return loaderDone.then(function () {
        // Home: os papéis acabaram de sair, então a intro do 3D já reportou a
        // duração. Nas outras páginas não há intro (a cena já está na pose), e a
        // página entra com o atraso padrão dela, junto com a queima do papel.
        var timing = firstRoute === 'home' ? timingRace(2) : Promise.resolve(null);
        return enterContent(container, performance.now(), timing, {
          chrome: true,
          lead: 1.1
        });
      });
    });
  }

  // Pages without a Barba wrapper (the 404) keep plain navigation.
  if (!document.querySelector('[data-barba="wrapper"]')) return;

  barba.init({
    preventRunning: true,
    timeout: 10000,
    prevent: function (data) {
      var el = data && data.el;
      if (el && el.getAttribute('data-barba-prevent') === 'true') return true;
      var href = (el && (el.getAttribute('href') || '')) || '';
      if (href === '/' || href === './' || href === '/index.html' || href === 'index.html') return true;
      return false;
    },
    transitions: [
      {
        name: 'main-fade',
        once: runFirstLoad,
          beforeEnter: function (data) {
            // Put the incoming page at its final viewport position before any
            // real element inside it starts animating.
            data.next.container.style.opacity = '0';
            pinIncoming(data.next.container);
            reinitWebflow();
            return nextPaint();
          },
          leave: function (data) {
            var route = getTargetRoute(data);
            activeRouteTransition = {
              route: route,
              startedAt: performance.now(),
              timingPromise: waitForTransitionTiming(route)
            };
            log('[barba-transition] leave → 3D', route);
            clearCasesRetries();
            invalidateFrameRects();
            notifyWebGL(route, true);
            return Promise.all([
              paperOut(data.current.container),
              titleOut(data.current.container),
              innerOut(data.current.container)
            ]).then(function () {
              return fadeOut(data.current.container);
            });
          },
          enter: function (data) {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            var route = getTargetRoute(data);
            var transition = activeRouteTransition;
            if (!transition || transition.route !== route) {
              log('[barba-transition] enter → 3D (fallback)', route);
              transition = {
                route: route,
                startedAt: performance.now(),
                timingPromise: waitForTransitionTiming(route)
              };
              notifyWebGL(route, true);
            }
            activeRouteTransition = null;
            sendCasesToFrames();
            // Estado inicial (fora da tela / em gosma) ANTES do fade pra sempre
            // haver entrada visível.
            if (window.YuusukePaper && window.YuusukePaper.hide) {
              window.YuusukePaper.hide(data.next.container);
            }
            if (window.YuusukeTitle && window.YuusukeTitle.hide) {
              window.YuusukeTitle.hide(data.next.container);
            }
            if (window.YuusukeInner && window.YuusukeInner.hide) {
              window.YuusukeInner.hide(data.next.container);
            }
            return enterContent(
              data.next.container,
              transition.startedAt,
              transition.timingPromise
            );
          }
      }
    ]
  });
})();
