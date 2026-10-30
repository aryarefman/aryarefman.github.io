(function () {
  'use strict';

  if (window.YuusukeInner) return;

  var SELECTOR = '[data-inner]';
  var defaults = {
    durationIn: 0.9,
    durationOut: 0.7,
    blurIn: 8,
    blurOut: 6,
    staggerIn: 0.1,
    staggerOut: 0.07,
    initialOpacity: 0
  };
  var config = Object.assign({}, defaults);
  // Bumped by every in/out so a stale loop stops writing to the same elements.
  var generation = 0;

  function log() {
    if (!window.__innerLog) return;
    try { console.log.apply(console, ['[inner]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  function collect(container) {
    var root = container || document;
    if (!root || !root.querySelectorAll) return [];
    return Array.prototype.slice.call(root.querySelectorAll(SELECTOR));
  }

  function setup(el) {
    if (el.__yuusukeInner__) return el.__yuusukeInner__;
    var computed = window.getComputedStyle(el);
    var targetOpacity = parseFloat(computed.opacity);
    if (!Number.isFinite(targetOpacity)) targetOpacity = 1;
    var savedVisibility = typeof el.__yuusukeInnerVisibility__ === 'undefined'
      ? el.style.visibility
      : el.__yuusukeInnerVisibility__;
    var state = {
      el: el,
      targetOpacity: targetOpacity,
      baseFilter: computed.filter === 'none' ? '' : computed.filter,
      prevFilter: el.style.filter,
      prevWebkitFilter: el.style.webkitFilter,
      prevOpacity: el.style.opacity,
      prevVisibility: savedVisibility,
      prevWillChange: el.style.willChange
    };
    el.style.willChange = 'filter, opacity';
    el.__yuusukeInner__ = state;
    return state;
  }

  function apply(state, blur, opacity, visible) {
    var blurFilter = blur > 0.01 ? 'blur(' + blur.toFixed(2) + 'px)' : '';
    var filter = [state.baseFilter, blurFilter].filter(Boolean).join(' ');
    state.el.style.filter = filter || 'none';
    state.el.style.webkitFilter = filter || 'none';
    state.el.style.opacity = String(opacity);
    state.el.style.visibility = visible ? 'visible' : 'hidden';
  }

  function teardown(state) {
    state.el.style.filter = state.prevFilter;
    state.el.style.webkitFilter = state.prevWebkitFilter;
    state.el.style.opacity = state.prevOpacity;
    state.el.style.visibility = state.prevVisibility;
    state.el.style.willChange = state.prevWillChange;
    delete state.el.__yuusukeInnerVisibility__;
    if (state.el.__yuusukeInner__ === state) delete state.el.__yuusukeInner__;
  }

  function easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }

  function wait(seconds) {
    if (!seconds) return Promise.resolve();
    return new Promise(function (resolve) {
      window.setTimeout(resolve, seconds * 1000);
    });
  }

  // One loop for the whole group instead of one per element: each item keeps
  // its own stagger, measured from the group start rather than a setTimeout.
  function runGroup(items) {
    var gen = generation;
    items.forEach(function (item) {
      apply(item.state, item.fromBlur, item.fromOpacity, item.fromOpacity > 0);
    });

    return new Promise(function (resolve) {
      var start = null;

      function frame(now) {
        // A newer in/out took over these same elements.
        if (gen !== generation) return resolve();
        if (start === null) start = now;
        var elapsed = (now - start) / 1000;
        var pending = false;

        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          if (item.done) continue;

          var local = elapsed - item.delay;
          if (local < 0) {
            pending = true;
            continue;
          }

          var t = Math.min(1, local / item.duration);
          var eased = item.ease(t);
          apply(
            item.state,
            item.fromBlur + (item.toBlur - item.fromBlur) * eased,
            item.fromOpacity + (item.toOpacity - item.fromOpacity) * eased,
            true
          );

          if (t >= 1) item.done = true;
          else pending = true;
        }

        if (pending) requestAnimationFrame(frame);
        else resolve();
      }

      requestAnimationFrame(frame);
    });
  }

  function innerIn(container) {
    generation++;
    var els = collect(container);
    log('in found', els.length);
    var states = els.map(setup);

    return runGroup(states.map(function (state, index) {
      return {
        state: state,
        fromBlur: config.blurIn,
        toBlur: 0,
        fromOpacity: state.targetOpacity * config.initialOpacity,
        toOpacity: state.targetOpacity,
        duration: config.durationIn,
        delay: index * config.staggerIn,
        ease: easeInOutSine
      };
    })).then(function () {
      states.forEach(teardown);
    });
  }

  function innerOut(container) {
    generation++;
    var els = collect(container);
    log('out found', els.length);

    return runGroup(els.map(function (el, index) {
      var state = setup(el);
      return {
        state: state,
        fromBlur: 0,
        toBlur: config.blurOut,
        fromOpacity: state.targetOpacity,
        toOpacity: 0,
        duration: config.durationOut,
        delay: (els.length - 1 - index) * config.staggerOut,
        ease: easeInOutSine
      };
    }));
  }

  // Same contract as the title: only clear leftover state after Barba discards
  // the container, so the exit keeps its faded-out look until then.
  function release(container) {
    collect(container).forEach(function (el) {
      if (el.__yuusukeInner__) teardown(el.__yuusukeInner__);
    });
  }

  function hide(container) {
    collect(container).forEach(function (el) {
      if (typeof el.__yuusukeInnerVisibility__ === 'undefined') {
        el.__yuusukeInnerVisibility__ = el.style.visibility;
      }
      el.style.visibility = 'hidden';
    });
  }

  function testIn() {
    return innerIn(document);
  }

  function testOut() {
    var els = collect(document);
    return innerOut(document).then(function () {
      return wait(0.2).then(function () {
        els.forEach(function (el) {
          if (el.__yuusukeInner__) teardown(el.__yuusukeInner__);
        });
      });
    });
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
    return getConfig();
  }

  window.YuusukeInner = {
    in: innerIn,
    out: innerOut,
    hide: hide,
    release: release,
    testIn: testIn,
    testOut: testOut,
    get: getConfig,
    set: setConfig,
    reset: resetConfig
  };
})();
