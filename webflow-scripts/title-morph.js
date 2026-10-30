(function () {
  'use strict';

  if (window.YuusukeTitle) return;

  var SELECTOR = '[data-title="morph"]';
  var defaults = {
    durationIn: 1.2,
    durationOut: 1.2,
    softBlurEm: 0.3,
    gooBlur: 2,
    thresholdGain: 255,
    thresholdCutoff: 0.5,
    initialOpacity: 0.75
  };
  var config = Object.assign({}, defaults);
  var NS = 'http://www.w3.org/2000/svg';
  var svgRoot = null;
  var uid = 0;
  // Bumped by every in/out so a stale loop stops writing to the same title.
  var generation = 0;

  function log() {
    if (!window.__titleLog) return;
    try { console.log.apply(console, ['[title]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  function collect(container) {
    var root = container || document;
    if (!root || !root.querySelectorAll) return [];
    return Array.prototype.slice.call(root.querySelectorAll(SELECTOR));
  }

  function ensureSvgRoot() {
    if (svgRoot && svgRoot.parentNode) return svgRoot;
    svgRoot = document.createElementNS(NS, 'svg');
    svgRoot.setAttribute('aria-hidden', 'true');
    svgRoot.setAttribute('focusable', 'false');
    svgRoot.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
    (document.body || document.documentElement).appendChild(svgRoot);
    return svgRoot;
  }

  function findBlendRoot(el) {
    var node = el;
    while (node && node !== document.body) {
      var blend = window.getComputedStyle(node).mixBlendMode;
      if (blend && blend !== 'normal') return node;
      node = node.parentElement;
    }
    return el;
  }

  function setup(el) {
    if (el.__yuusukeGoo__) return el.__yuusukeGoo__;
    ensureSvgRoot();

    var id = 'yuusuke-goo-' + (++uid);
    var filter = document.createElementNS(NS, 'filter');
    filter.setAttribute('id', id);
    filter.setAttribute('x', '-50%');
    filter.setAttribute('y', '-50%');
    filter.setAttribute('width', '200%');
    filter.setAttribute('height', '200%');
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    var softBlur = document.createElementNS(NS, 'feGaussianBlur');
    softBlur.setAttribute('in', 'SourceGraphic');
    softBlur.setAttribute('stdDeviation', '0');
    softBlur.setAttribute('result', 'soft');

    var gooBlur = document.createElementNS(NS, 'feGaussianBlur');
    gooBlur.setAttribute('in', 'soft');
    gooBlur.setAttribute('stdDeviation', '0');
    gooBlur.setAttribute('result', 'goo');

    var matrix = document.createElementNS(NS, 'feColorMatrix');
    matrix.setAttribute('in', 'goo');
    matrix.setAttribute('type', 'matrix');
    matrix.setAttribute('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0');

    filter.appendChild(softBlur);
    filter.appendChild(gooBlur);
    filter.appendChild(matrix);
    svgRoot.appendChild(filter);

    var computed = window.getComputedStyle(el);
    var fontPx = parseFloat(computed.fontSize) || 32;
    var targetOpacity = parseFloat(computed.opacity);
    if (!Number.isFinite(targetOpacity)) targetOpacity = 1;
    var savedVisibility = typeof el.__yuusukeMorphVisibility__ === 'undefined'
      ? el.style.visibility
      : el.__yuusukeMorphVisibility__;
    var filterEl = findBlendRoot(el);
    var state = {
      el: el,
      filterEl: filterEl,
      filter: filter,
      softBlur: softBlur,
      gooBlur: gooBlur,
      matrix: matrix,
      fontPx: fontPx,
      targetOpacity: targetOpacity,
      prevFilter: filterEl.style.filter,
      prevWebkitFilter: filterEl.style.webkitFilter,
      prevWillChange: filterEl.style.willChange,
      prevOpacity: el.style.opacity,
      prevVisibility: savedVisibility
    };

    // Same lifetime as the filter itself, which already creates a stacking
    // context here, so this adds no new interaction with mix-blend-mode.
    filterEl.style.willChange = 'filter';
    filterEl.style.filter = 'url(#' + id + ')';
    filterEl.style.webkitFilter = 'url(#' + id + ')';
    el.__yuusukeGoo__ = state;
    return state;
  }

  function renderProgress(state, progress) {
    var p = Math.max(0, Math.min(1, progress));
    var remaining = 1 - p;
    var gain = 1 + (config.thresholdGain - 1) * remaining;
    var offset = -config.thresholdGain * config.thresholdCutoff * remaining;
    var opacity = state.targetOpacity * (
      config.initialOpacity + (1 - config.initialOpacity) * p
    );

    state.softBlur.setAttribute(
      'stdDeviation',
      (state.fontPx * config.softBlurEm * remaining).toFixed(2)
    );
    state.gooBlur.setAttribute('stdDeviation', (config.gooBlur * remaining).toFixed(2));
    state.matrix.setAttribute(
      'values',
      '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ' +
        gain.toFixed(2) + ' ' + offset.toFixed(2)
    );
    state.el.style.opacity = String(opacity);
    state.el.style.visibility = p <= 0 ? 'hidden' : 'visible';
    state.progress = p;
  }

  function teardown(state) {
    if (!state) return;
    state.filterEl.style.filter = state.prevFilter;
    state.filterEl.style.webkitFilter = state.prevWebkitFilter;
    state.filterEl.style.willChange = state.prevWillChange;
    state.el.style.opacity = state.prevOpacity;
    state.el.style.visibility = state.prevVisibility;
    delete state.el.__yuusukeMorphVisibility__;
    if (state.el.__yuusukeGoo__ === state) delete state.el.__yuusukeGoo__;
    if (state.filter.parentNode) state.filter.parentNode.removeChild(state.filter);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }

  // Resolves true when it ran to the end, false when a newer in/out/swap took
  // over this title (which now owns the filter state).
  function animateProgress(state, from, to, duration, ease) {
    var gen = generation;
    renderProgress(state, from);
    if (!(duration > 0)) {
      renderProgress(state, to);
      return Promise.resolve(true);
    }
    return new Promise(function (resolve) {
      var start = null;
      function frame(now) {
        if (gen !== generation) return resolve(false);
        if (start === null) start = now;
        var t = Math.min(1, (now - start) / (duration * 1000));
        renderProgress(state, from + (to - from) * ease(t));
        if (t < 1) requestAnimationFrame(frame);
        else resolve(true);
      }
      requestAnimationFrame(frame);
    });
  }

  function titleIn(container) {
    generation++;
    var els = collect(container);
    log('in found', els.length);
    return Promise.all(els.map(function (el) {
      var state = setup(el);
      return animateProgress(state, 0, 1, config.durationIn, easeOutCubic).then(function (done) {
        if (done) teardown(state);
      });
    }));
  }

  // ---- Morph swap ---------------------------------------------------------------
  // Hover-driven label change. The old and the new text overlap as blurred
  // layers inside the goo filter, so one melts into the other instead of
  // disappearing first. A newer swap just turns the incoming layer into one
  // more outgoing layer, so rapid changes stay continuous.
  var MORPH_BLUR_EM = 0.06;
  var MORPH_BLUR_CAP_EM = 0.5;
  // Share of the incoming layer's progress during which the goo stays at full
  // strength before relaxing back to crisp text.
  var MORPH_HOLD = 0.65;

  function renderGoo(state, k) {
    state.softBlur.setAttribute('stdDeviation', '0');
    state.gooBlur.setAttribute('stdDeviation', (config.gooBlur * k).toFixed(2));
    state.matrix.setAttribute(
      'values',
      '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ' +
        (1 + (config.thresholdGain - 1) * k).toFixed(2) + ' ' +
        (-config.thresholdGain * config.thresholdCutoff * k).toFixed(2)
    );
  }

  // inset: the title's own padding, so the layers sit on its content box.
  function makeLayer(parent, text, fontPx, align, inset) {
    var span = document.createElement('span');
    span.textContent = text;
    span.setAttribute('aria-hidden', 'true');
    span.style.cssText = 'position:absolute;bottom:' + inset.bottom + 'px;' +
      (align === 'left' ? 'left:' : 'right:') + inset.side + 'px;' +
      'white-space:nowrap;will-change:opacity,filter;font-size:' + fontPx + 'px;';
    parent.appendChild(span);
    return span;
  }

  function styleLayer(layer) {
    var f = Math.max(0, Math.min(1, layer.f));
    var unit = layer.fontPx * MORPH_BLUR_EM;
    var cap = layer.fontPx * MORPH_BLUR_CAP_EM;
    var blur = f >= 1 ? 0 : (f > 0 ? Math.min(unit / f - unit, cap) : cap);
    layer.el.style.opacity = String(Math.pow(f, 0.4));
    layer.el.style.filter = blur > 0.05 ? 'blur(' + blur.toFixed(2) + 'px)' : '';
  }

  function finishMorph(state) {
    var morph = state.morph;
    var el = state.el;
    el.textContent = morph.target;
    el.style.fontSize = Math.abs(morph.targetPx - morph.basePx) > 0.5 ? morph.targetPx + 'px' : '';
    el.style.position = morph.prevPosition;
    delete state.morph;
    teardown(state);
  }

  // options: durationIn, durationOut (s), align ('right' | 'left'), maxWidth (px;
  // longer text shrinks its font to fit).
  function swap(el, text, options) {
    if (!el) return Promise.resolve(false);
    options = options || {};
    generation++;
    var gen = generation;
    var state = setup(el);
    var morph = state.morph;
    var align = options.align === 'left' ? 'left' : 'right';
    var durationIn = options.durationIn || 0.9;
    var durationOut = options.durationOut || 0.8;

    if (!morph) {
      var currentText = el.textContent;
      var currentPx = parseFloat(window.getComputedStyle(el).fontSize) || state.fontPx;
      var prevPosition = el.style.position;
      el.style.fontSize = '';
      var baseStyle = window.getComputedStyle(el);
      var basePx = parseFloat(baseStyle.fontSize) || currentPx;
      var inset = {
        side: parseFloat(align === 'left' ? baseStyle.paddingLeft : baseStyle.paddingRight) || 0,
        bottom: parseFloat(baseStyle.paddingBottom) || 0
      };
      if (window.getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.style.whiteSpace = 'nowrap';
      el.style.opacity = String(state.targetOpacity);
      el.style.visibility = 'visible';
      el.textContent = '';
      // Invisible in-flow copy of the target: it gives the element its box.
      var sizer = document.createElement('span');
      sizer.style.cssText = 'display:inline-block;visibility:hidden;white-space:nowrap;';
      el.appendChild(sizer);
      morph = state.morph = {
        sizer: sizer, basePx: basePx, prevPosition: prevPosition, inset: inset,
        layers: [], incoming: null, strength: 0
      };
      morph.layers.push({ el: makeLayer(el, currentText, currentPx, align, inset), f: 1, dir: -1, fontPx: currentPx });
    } else if (morph.incoming) {
      morph.incoming.dir = -1;
    }

    var targetPx = morph.basePx;
    morph.sizer.style.fontSize = targetPx + 'px';
    morph.sizer.textContent = text;
    if (options.maxWidth > 0) {
      var width = morph.sizer.getBoundingClientRect().width;
      if (width > options.maxWidth) targetPx = morph.basePx * options.maxWidth / width;
    }
    morph.sizer.style.fontSize = targetPx + 'px';
    morph.target = text;
    morph.targetPx = targetPx;
    morph.incoming = { el: makeLayer(el, text, targetPx, align, morph.inset), f: 0, dir: 1, fontPx: targetPx };
    morph.layers.push(morph.incoming);
    morph.layers.forEach(styleLayer);

    return new Promise(function (resolve) {
      var last = null;
      function frame(now) {
        if (gen !== generation) return resolve(false);
        var dt = last === null ? 0 : Math.min(0.05, (now - last) / 1000);
        last = now;

        morph.layers = morph.layers.filter(function (layer) {
          layer.f += layer.dir * dt / (layer.dir > 0 ? durationIn : durationOut);
          if (layer.dir < 0 && layer.f <= 0) {
            if (layer.el.parentNode) layer.el.parentNode.removeChild(layer.el);
            return false;
          }
          if (layer.f > 1) layer.f = 1;
          styleLayer(layer);
          return true;
        });

        var progress = morph.incoming.f;
        var wanted = progress < MORPH_HOLD ? 1 : (1 - progress) / (1 - MORPH_HOLD);
        morph.strength += (wanted - morph.strength) * Math.min(1, dt * 12);
        renderGoo(state, morph.strength);

        if (progress >= 1 && morph.layers.length === 1 && morph.strength < 0.02) {
          finishMorph(state);
          return resolve(true);
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  function titleOut(container) {
    generation++;
    var els = collect(container);
    log('out found', els.length);
    return Promise.all(els.map(function (el) {
      var state = setup(el);
      return animateProgress(state, 1, 0, config.durationOut, easeInOutSine);
    }));
  }

  // The exit leaves the title hidden and blurred until the container fades out,
  // so the filter node is only dropped once Barba discards that container.
  // A full teardown here would restore visibility mid fade-out.
  function release(container) {
    collect(container).forEach(function (el) {
      var state = el.__yuusukeGoo__;
      if (!state) return;
      if (state.filter.parentNode) state.filter.parentNode.removeChild(state.filter);
      delete el.__yuusukeGoo__;
      delete el.__yuusukeMorphVisibility__;
    });
  }

  // Keep the real title hidden while its Barba container fades in.
  function hide(container) {
    collect(container).forEach(function (el) {
      if (typeof el.__yuusukeMorphVisibility__ === 'undefined') {
        el.__yuusukeMorphVisibility__ = el.style.visibility;
      }
      el.style.visibility = 'hidden';
    });
  }

  function testIn() {
    var els = collect(document);
    log('test in found', els.length, els);
    return Promise.all(els.map(function (el) {
      var state = setup(el);
      return animateProgress(state, 0, 1, config.durationIn, easeOutCubic).then(function () {
        teardown(state);
      });
    }));
  }

  function testOut() {
    var els = collect(document);
    log('test out found', els.length, els);
    return Promise.all(els.map(function (el) {
      var state = setup(el);
      return animateProgress(state, 1, 0, config.durationOut, easeInOutSine).then(function () {
        teardown(state);
      });
    }));
  }

  function getConfig() {
    return Object.assign({}, config);
  }

  function setConfig(values) {
    Object.keys(values || {}).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(config, key) && Number.isFinite(values[key])) {
        config[key] = values[key];
      }
    });
    log('config', getConfig());
    return getConfig();
  }

  function resetConfig() {
    config = Object.assign({}, defaults);
    log('config reset', getConfig());
    return getConfig();
  }

  window.YuusukeTitle = {
    in: titleIn,
    out: titleOut,
    swap: swap,
    hide: hide,
    release: release,
    test: testIn,
    testIn: testIn,
    testOut: testOut,
    get: getConfig,
    set: setConfig,
    reset: resetConfig
  };
})();
