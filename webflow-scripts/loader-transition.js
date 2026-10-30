(function () {
  'use strict';

  if (window.YuusukeLoader) return;

  var MIN_DURATION = 3;
  // Respiro com a barra cheia antes de começar a saída.
  var HOLD_COMPLETE = 0.5;
  var EXIT_PROGRESS = 0.55;
  // Quando o papel começa a queimar, contado do início da saída do texto/barra
  // (só sem o chooser de som; com ele a queima espera o clique).
  var EXIT_HANDOFF = 0.62;
  var CHOICE_IN = 0.5;
  var CHOICE_OUT = 0.35;
  // Quando o papel começa a queimar, contado do clique no chooser.
  var CHOICE_HANDOFF = 0.15;
  var LOAD_CAP = 12;
  var WEBGL_FALLBACK = 5;
  var DEPS_TIMEOUT = 4000;
  var BURN_DURATION = 1.8;
  var BURN_FIRE = '#ff5010';
  // Ignition point in 0..1 (y up): the paper catches where the text was.
  var BURN_ORIGIN = [0.5, 0.5];
  var SCRIPT_BASE = '/webflow-scripts/';

  var loaderEl = null;
  var progressEl = null;
  var progressWrap = null;
  var contentEl = null;
  var txtEl = null;
  var webglReady = !!window.__yuusukeWebglReady;
  var windowLoaded = document.readyState === 'complete';
  var progressGen = 0;
  var webglFallbackTimer = 0;
  var readyPromise = null;
  var introFired = false;

  // Resolve quando o papel começa a queimar: é o gancho da entrada da página.
  var exitStartedResolve = null;
  var exitStarted = new Promise(function (resolve) { exitStartedResolve = resolve; });

  function markExitStarted() {
    if (!exitStartedResolve) return;
    var resolve = exitStartedResolve;
    exitStartedResolve = null;
    resolve();
  }

  function log() {
    if (!window.__loaderLog) return;
    try { console.log.apply(console, ['[loader]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  // Evita o flash do texto e da barra cheios entre o primeiro paint e o script.
  // Vale só até showLoader() assumir com estilos inline: sem o guard, o teardown
  // do title-morph devolveria o visibility inline e a regra esconderia o texto.
  var READY_CLASS = 'yuusuke-loader-on';

  (function injectCriticalCss() {
    if (document.getElementById('yuusuke-loader-css')) return;
    var style = document.createElement('style');
    style.id = 'yuusuke-loader-css';
    style.textContent =
      'html:not(.' + READY_CLASS + ') .loader_txt{visibility:hidden}' +
      'html:not(.' + READY_CLASS + ') .loader_progress-wrap' +
      '{overflow:hidden;clip-path:inset(0 100% 0 0);-webkit-clip-path:inset(0 100% 0 0)}';
    (document.head || document.documentElement).appendChild(style);
  })();

  function dropCriticalCss() {
    var style = document.getElementById('yuusuke-loader-css');
    if (style && style.parentNode) style.parentNode.removeChild(style);
  }

  function webglFrames() {
    return document.querySelectorAll('iframe[data-webgl-frame], iframe[src*="yuusuke-theta.vercel.app"]');
  }

  function hasWebGLFrame() {
    return !!webglFrames().length;
  }

  function markWebglReady() {
    if (webglReady) return;
    webglReady = true;
    window.__yuusukeWebglReady = true;
    log('webgl ready');
  }

  // YUUSUKE_READY costuma chegar antes do loader começar; escuta desde já.
  window.addEventListener('message', function (event) {
    if (!event || !event.data || event.data.type !== 'YUUSUKE_READY') return;
    markWebglReady();
    holdIntro3D();
  });

  if (!windowLoaded) {
    window.addEventListener('load', function () { windowLoaded = true; }, { once: true });
  }

  function postToFrames(message) {
    Array.prototype.forEach.call(webglFrames(), function (frame) {
      if (!frame || !frame.contentWindow) return;
      frame.contentWindow.postMessage(message, '*');
    });
  }

  function playIntro3D() {
    if (introFired) return;
    introFired = true;
    log('play intro 3D', webglFrames().length);
    postToFrames({ type: 'YUUSUKE_PLAY_INTRO' });
  }

  // The iframe plays the intro on its own after 9s; with the sound chooser the
  // user may take longer, so ask it to wait for PLAY_INTRO. Only when this page
  // actually has a loader to send it.
  function holdIntro3D() {
    if (introFired || !document.querySelector('.loader')) return;
    postToFrames({ type: 'YUUSUKE_INTRO_HOLD' });
  }

  function bindWebglSignals() {
    if (!hasWebGLFrame()) {
      markWebglReady();
      return;
    }
    if (webglFallbackTimer) return;
    webglFallbackTimer = window.setTimeout(function () {
      log('webgl fallback');
      markWebglReady();
    }, WEBGL_FALLBACK * 1000);
  }

  function wait(seconds) {
    if (!seconds) return Promise.resolve();
    return new Promise(function (resolve) {
      window.setTimeout(resolve, seconds * 1000);
    });
  }

  function domReady() {
    if (document.readyState !== 'loading') return Promise.resolve();
    return new Promise(function (resolve) {
      document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
  }

  function loadDep(file, global) {
    if (window[global]) return Promise.resolve(window[global]);
    return new Promise(function (resolve) {
      var selector = 'script[src="' + SCRIPT_BASE + file + '"]';
      var script = document.querySelector(selector) || document.createElement('script');
      var settled = false;

      function done() {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(window[global] || null);
      }

      var timer = window.setTimeout(done, DEPS_TIMEOUT);
      script.addEventListener('load', done);
      script.addEventListener('error', done);

      if (!script.parentNode) {
        script.src = SCRIPT_BASE + file;
        (document.head || document.documentElement).appendChild(script);
      } else if (window[global]) {
        done();
      }
    });
  }

  function depsReady() {
    return Promise.all([
      loadDep('title-morph.js', 'YuusukeTitle'),
      loadDep('burn-paper.js', 'YuusukeBurn'),
      loadDep('ui-sound.js', 'YuusukeSound')
    ]);
  }

  function query() {
    loaderEl = document.querySelector('.loader');
    progressWrap = document.querySelector('.loader_progress-wrap');
    progressEl = document.querySelector('.loader_progress');
    contentEl = document.querySelector('.loader_content') || loaderEl;
    txtEl = document.querySelector('.loader_txt');
  }

  function clipTarget() {
    return progressWrap || progressEl;
  }

  function setClip(el, value) {
    if (!el) return;
    el.style.clipPath = value;
    el.style.webkitClipPath = value;
  }

  function setReveal(p) {
    var hidden = Math.max(0, (1 - p) * 100);
    setClip(clipTarget(), 'inset(0 ' + hidden.toFixed(2) + '% 0 0)');
  }

  // Máscara oposta à entrada: come a linha a partir da esquerda.
  function setHide(p) {
    var shown = Math.max(0, p * 100);
    setClip(clipTarget(), 'inset(0 0 0 ' + shown.toFixed(2) + '%)');
  }

  function clearClip() {
    [progressWrap, progressEl].forEach(function (el) {
      if (!el) return;
      el.style.clipPath = '';
      el.style.webkitClipPath = '';
    });
  }

  function getLoadProgress() {
    if (window.__yuusukeWebglReady) webglReady = true;
    var p = 0;
    if (document.readyState !== 'loading') p += 0.25;
    if (document.readyState === 'interactive' || document.readyState === 'complete') p += 0.15;
    if (windowLoaded) p += 0.25;
    if (webglReady || !hasWebGLFrame()) p += 0.35;
    return Math.min(1, p);
  }

  function animateReveal(startedAt) {
    var gen = ++progressGen;
    return new Promise(function (resolve) {
      var capTimer = window.setTimeout(function () {
        log('load cap');
        setReveal(1);
        resolve();
      }, LOAD_CAP * 1000);

      function frame(now) {
        if (gen !== progressGen) {
          window.clearTimeout(capTimer);
          return resolve();
        }
        var elapsed = (now - startedAt) / 1000;
        var timeP = Math.min(1, elapsed / MIN_DURATION);
        var loadP = getLoadProgress();
        var p = Math.min(loadP, timeP);
        setReveal(p);
        if (p >= 1 && elapsed >= MIN_DURATION) {
          window.clearTimeout(capTimer);
          return resolve();
        }
        requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);
    });
  }

  function animateHide() {
    var gen = ++progressGen;
    return new Promise(function (resolve) {
      var start = null;
      var dur = EXIT_PROGRESS * 1000;

      function frame(now) {
        if (gen !== progressGen) return resolve();
        if (start === null) start = now;
        var t = Math.min(1, (now - start) / dur);
        setHide(t);
        if (t >= 1) resolve();
        else requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);
    });
  }

  function easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }

  // The paper burns away (burn-paper.js) revealing the page underneath. If the
  // module failed to load, fade it out so the sequence still completes.
  function paperOut() {
    var paper = document.querySelector('.loader_paper-full');
    if (!paper) return Promise.resolve();

    var api = window.YuusukeBurn;
    if (api && api.burn) {
      return api.burn(paper, {
        duration: BURN_DURATION,
        fireColor: BURN_FIRE,
        origin: BURN_ORIGIN
      });
    }

    return new Promise(function (resolve) {
      var start = null;
      var durMs = BURN_DURATION * 1000;

      function frame(now) {
        if (start === null) start = now;
        var t = Math.min(1, (now - start) / durMs);
        paper.style.opacity = String(1 - easeInOutSine(t));
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }

      requestAnimationFrame(frame);
    });
  }

  // Sound chooser: [data-loader-sound="on"|"off"]. Fallback: first button
  // enables, second continues muted.
  function queryChoice() {
    var column = loaderEl && loaderEl.querySelector('.loader_btn-column');
    if (!column) return null;
    var on = column.querySelector('[data-loader-sound="on"]');
    var off = column.querySelector('[data-loader-sound="off"]');
    if (!on || !off) {
      var buttons = column.querySelectorAll('.loader_sound-btn');
      on = on || buttons[0];
      off = off || buttons[1];
    }
    if (!on || !off) return null;
    // The buttons are plain blocks in the markup: without a role, a name and a
    // tab stop, a keyboard or screen reader user could not get past the loader.
    [[on, 'Enter with sound'], [off, 'Enter without sound']].forEach(function (pair) {
      pair[0].setAttribute('role', 'button');
      pair[0].setAttribute('tabindex', '0');
      if (!pair[0].getAttribute('aria-label')) pair[0].setAttribute('aria-label', pair[1]);
    });
    return { column: column, on: on, off: off };
  }

  function choiceIn(choice) {
    var el = choice.column;
    el.style.transition = 'none';
    el.style.opacity = '0';
    el.style.display = 'flex';
    void el.offsetWidth;
    el.style.transition = 'opacity ' + CHOICE_IN + 's ease';
    el.style.opacity = '1';
    return wait(CHOICE_IN);
  }

  function choiceOut(choice) {
    var el = choice.column;
    el.style.transition = 'opacity ' + CHOICE_OUT + 's ease';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    return wait(CHOICE_OUT).then(function () {
      el.style.display = 'none';
    });
  }

  // Resolves with the choice (true = sound on). The click is also the user
  // gesture that unlocks audio for the whole session.
  function waitChoice(choice) {
    return new Promise(function (resolve) {
      function pick(enabled) {
        return function (event) {
          if (event) event.preventDefault();
          resolve(enabled);
        };
      }
      function key(enabled) {
        return function (event) {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          pick(enabled)(event);
        };
      }
      choice.on.addEventListener('click', pick(true), { once: true });
      choice.off.addEventListener('click', pick(false), { once: true });
      choice.on.addEventListener('keydown', key(true));
      choice.off.addEventListener('keydown', key(false));
    });
  }

  function isHome() {
    var container = document.querySelector('[data-barba="container"]');
    var namespace = container ? container.getAttribute('data-barba-namespace') : '';
    return String(namespace || '').toLowerCase() === 'home';
  }

  function applyChoice(enabled) {
    var api = window.YuusukeSound;
    if (!api) return;
    // The intro (and its explosion) only plays on the home page, and only when
    // there's a scene to play it. Elsewhere the music starts in its page state.
    if (isHome() && hasWebGLFrame() && api.expectExplosion) api.expectExplosion();
    if (api.setEnabled) api.setEnabled(enabled);
  }

  // O CSS do Webflow deixa .loader em display:none; string vazia voltaria a
  // esconder, então o valor de exibição precisa ser explícito.
  // While the loader covers the page, what is underneath must not take focus:
  // Tab would otherwise walk through links nobody can see.
  function setPageInert(on) {
    document.querySelectorAll('.navbar, .main-wrapper, .bot_info, .webgl_wrapper').forEach(function (el) {
      if (on) el.setAttribute('inert', '');
      else el.removeAttribute('inert');
    });
  }

  function showLoader() {
    query();
    if (!loaderEl) return false;
    setPageInert(true);

    loaderEl.style.display = 'flex';
    loaderEl.style.visibility = 'visible';
    document.documentElement.style.overflow = 'hidden';
    if (progressWrap) progressWrap.style.overflow = 'hidden';
    setReveal(0);

    if (txtEl) {
      if (!txtEl.hasAttribute('data-title')) txtEl.setAttribute('data-title', 'morph');
      // Mesmo contrato do YuusukeTitle.hide, que pode ainda não ter carregado.
      if (typeof txtEl.__yuusukeMorphVisibility__ === 'undefined') {
        txtEl.__yuusukeMorphVisibility__ = txtEl.style.visibility;
      }
      txtEl.style.visibility = 'hidden';
    }

    // Os estilos inline acima já cobrem o estado inicial; libera o CSS crítico.
    document.documentElement.classList.add(READY_CLASS);
    return true;
  }

  function txtIn() {
    var api = window.YuusukeTitle;
    if (!txtEl || !contentEl || !api || !api.in) return Promise.resolve();
    return api.in(contentEl);
  }

  function txtOut() {
    var api = window.YuusukeTitle;
    if (!txtEl || !contentEl || !api || !api.out) return Promise.resolve();
    return api.out(contentEl);
  }

  function finish() {
    if (!loaderEl) query();
    // Held intro must not stay stuck if the sequence bailed out early.
    if (loaderEl) playIntro3D();
    if (loaderEl) {
      loaderEl.style.display = 'none';
      loaderEl.style.visibility = 'hidden';
    }
    document.documentElement.style.overflow = '';
    setPageInert(false);
    clearClip();
    dropCriticalCss();
    markExitStarted();
    log('done');
  }

  function run() {
    if (!showLoader()) {
      log('no .loader found, skip');
      markExitStarted();
      return Promise.resolve();
    }

    bindWebglSignals();
    holdIntro3D();

    var startedAt = performance.now();
    log('start', { webgl: webglReady, load: getLoadProgress() });

    // O texto entra enquanto a barra revela; encadear faria a barra pular,
    // porque startedAt já teria consumido a duração do texto.
    return Promise.all([txtIn(), animateReveal(startedAt)])
      .then(function () {
        log('hold');
        return wait(HOLD_COMPLETE);
      })
      .then(function () {
        log('exit: txt + progress');
        var contentExit = Promise.all([animateHide(), txtOut()]);
        var choice = queryChoice();

        if (!choice) {
          // O papel queima por cima do fim da saída do texto; esperar o texto
          // terminar (1.2s do morph) deixava a sequência arrastada.
          return wait(EXIT_HANDOFF).then(function () {
            log('exit: burn + intro');
            playIntro3D();
            markExitStarted();
            return Promise.all([contentExit, paperOut()]);
          });
        }

        // The chooser takes the text's spot, so it waits for the exit to end.
        return contentExit
          .then(function () {
            log('choice: in');
            // Listening from the first frame: a click during the fade-in counts.
            var picked = waitChoice(choice);
            // No programmatic focus: it would draw a focus ring for everyone.
            // The rest of the page is inert, so the first Tab lands here anyway.
            choiceIn(choice);
            return picked;
          })
          .then(function (enabled) {
            log('choice', enabled ? 'sound on' : 'sound off');
            applyChoice(enabled);
            var out = choiceOut(choice);
            return wait(CHOICE_HANDOFF).then(function () {
              log('exit: burn + intro');
              playIntro3D();
              markExitStarted();
              return Promise.all([out, paperOut()]);
            });
          });
      })
      .then(finish)
      .catch(function (error) {
        console.warn('[loader] failed, hiding', error);
        finish();
      });
  }

  // Auto-start: não depende do Barba (barba.init não aceita hook "once" global).
  function start() {
    if (readyPromise) return readyPromise;
    // Cobre a janela entre o parse do script e o carregamento das dependências.
    if (!showLoader()) domReady().then(showLoader);

    readyPromise = domReady()
      .then(depsReady)
      .then(run)
      .catch(function (error) {
        console.warn('[loader] start failed', error);
        finish();
      });
    return readyPromise;
  }

  window.YuusukeLoader = {
    run: start,
    finish: finish,
    exitStarted: exitStarted,
    minDuration: MIN_DURATION
  };

  window.YuusukeLoader.ready = start();
})();
