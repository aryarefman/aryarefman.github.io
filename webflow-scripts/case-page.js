(function () {
  'use strict';

  if (window.YuusukeCase) return;

  var SLIDER = '[data-case-slider]';
  var TRACK = '.case_slider-track';
  var GALLERY = '[data-case-gallery]';
  var NAV = '[data-case-nav]';
  var CASE_ITEM = '.cases-item';

  // Idle drift, in em per second: the page font scales with the viewport, so the
  // gallery crosses the screen in the same time on every size.
  var DRIFT_EM = 1.6;
  // How fast a throw fades out, per second.
  var THROW_DECAY = 2.4;
  // How tightly the drawn position follows its target, per second.
  var FOLLOW = 6;
  var FOLLOW_DRAG = 28;
  var WHEEL_GAIN = 1.4;
  // Below this release speed (px/s) a drag does not change the drift direction.
  var THROW_MIN = 60;
  var LAYOUT_RETRIES = 40;

  var reducedMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  function injectCss() {
    if (document.getElementById('yuusuke-case-css')) return;
    var style = document.createElement('style');
    style.id = 'yuusuke-case-css';
    style.textContent =
      SLIDER + '{touch-action:pan-y;-webkit-user-select:none;user-select:none}' +
      SLIDER + '.is-dragging{cursor:grabbing}' +
      SLIDER + ' img{-webkit-user-drag:none}' +
      TRACK + '{will-change:transform}' +
      '.case_slider-gl{position:absolute;left:0;width:100%;top:-30%;height:160%;pointer-events:none;display:none}' +
      SLIDER + '.is-webgl .case_slider-gl{display:block}' +
      SLIDER + '.is-webgl ' + TRACK + '{visibility:hidden}' +
      // Nothing in the scene is clickable on this page, so the 3D layer lets the
      // wheel and the pointer through to the page.
      'html:has([data-barba-namespace="case-inner"]) .webgl_wrapper{pointer-events:none}' +
      GALLERY + '{display:none}' +
      // Fields left empty in the CMS take their whole column with them.
      '.case_def:has(.w-dyn-bind-empty),.case_def.is-empty{display:none}' +
      '.case_nav-item[href]:focus-visible{opacity:1}' +
      // Touch browsers keep :hover on whatever sits under the last tap, and the
      // tap that opened this page often lands where the next thumb will be.
      '@media (hover:hover){.case_nav-item[href]:hover{opacity:1}}';
    (document.head || document.documentElement).appendChild(style);
  }

  // ---- Gallery slider ---------------------------------------------------------
  // Endless strip: the image set is repeated enough times to cover the viewport,
  // and the position wraps by one set width, so there is no seam and no end.
  // The DOM slides give the layout; when WebGL is available they are hidden and
  // the same rectangles are drawn on a canvas, bent and colour-split at the edges.

  function gallerySources(root) {
    var urls = [];
    function add(img) {
      var src = img.getAttribute('src') || '';
      if (!src || img.classList.contains('w-dyn-bind-empty')) return;
      if (urls.indexOf(src) === -1) urls.push(src);
    }
    var scope = root.closest('[data-barba="container"]') || document;
    scope.querySelectorAll(GALLERY + ' img').forEach(add);
    // No gallery yet: the slide Webflow rendered with the cover stands in.
    if (!urls.length) root.querySelectorAll('img').forEach(add);
    return urls;
  }

  function makeSlide(url) {
    var slide = document.createElement('div');
    slide.className = 'case_slide';
    var img = document.createElement('img');
    img.className = 'case_slide-img';
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.src = url;
    slide.appendChild(img);
    return slide;
  }

  // Left edge of the track, in px from the slider's left.
  function trackX(state) {
    var wrapped = ((state.pos % state.setWidth) + state.setWidth) % state.setWidth;
    return state.shift - state.lead * state.setWidth - wrapped;
  }

  function render(state) {
    if (!state.setWidth) return;
    var x = trackX(state);
    if (state.gl && state.glOn) state.gl.draw(state, x);
    else state.track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
  }

  function layout(state) {
    var track = state.track;
    var progress = state.setWidth ? state.pos / state.setWidth : 0;

    track.textContent = '';
    var probe = makeSlide(state.urls[0]);
    track.appendChild(probe);
    var probeRect = probe.getBoundingClientRect();
    var slideWidth = probeRect.width;
    var viewWidth = state.root.getBoundingClientRect().width;

    // The container can still be unmeasurable right after Barba inserts it.
    if (!(slideWidth > 0) || !(viewWidth > 0)) {
      if (state.retries++ < LAYOUT_RETRIES) {
        state.retry = window.requestAnimationFrame(function () { layout(state); });
      }
      return;
    }

    var gap = parseFloat(window.getComputedStyle(track).columnGap) || 0;
    var setWidth = (slideWidth + gap) * state.urls.length;
    // At rest the first image sits centred, as in the layout.
    state.shift = (viewWidth - slideWidth) / 2;
    state.lead = Math.ceil(state.shift / setWidth);
    var copies = state.lead + Math.ceil((viewWidth - state.shift) / setWidth) + 2;

    track.textContent = '';
    for (var c = 0; c < copies; c++) {
      for (var i = 0; i < state.urls.length; i++) track.appendChild(makeSlide(state.urls[i]));
    }

    state.slideWidth = slideWidth;
    state.slideHeight = probeRect.height;
    state.gap = gap;
    state.viewWidth = viewWidth;
    state.count = copies * state.urls.length;
    state.setWidth = setWidth;
    state.pos = progress * setWidth;
    state.target = state.pos;
    state.em = parseFloat(window.getComputedStyle(state.root).fontSize) || 16;
    render(state);
  }

  // ---- WebGL strip --------------------------------------------------------------
  // Each slide is a small grid. Past the centre slide the grid grows taller and
  // squeezes inward, like a wall curving toward the viewer, and the red and blue
  // channels drift apart. Fast movement bows the rows and adds to the split.

  // Canvas overflow above and below the strip, as a share of its height.
  var GL_PAD = 0.3;
  var GL_COLS = 18;
  var GL_ROWS = 6;
  var FX = { bend: 0.2, squeeze: 0.1, bow: 0.05, shift: 0.012, velShift: 0.012 };

  var VERT = [
    'attribute vec2 aPos;',
    'uniform vec4 uRect;',
    'uniform vec2 uRes;',
    'uniform float uStart;',
    'uniform float uBend;',
    'uniform float uSqueeze;',
    'uniform float uBow;',
    'uniform float uVel;',
    'varying vec2 vUv;',
    'varying float vEdge;',
    'varying float vSide;',
    'void main() {',
    '  vec2 px = uRect.xy + aPos * uRect.zw;',
    '  float nx = px.x / uRes.x * 2.0 - 1.0;',
    '  float row = aPos.y * 2.0 - 1.0;',
    '  nx += uVel * uBow * row * row;',
    '  float e = smoothstep(uStart, 1.05, abs(nx));',
    '  float cy = uRes.y * 0.5;',
    '  float py = cy + (px.y - cy) * (1.0 + uBend * e * e);',
    '  float sx = nx * (1.0 - uSqueeze * e * e);',
    '  gl_Position = vec4(sx, -(py / uRes.y * 2.0 - 1.0), 0.0, 1.0);',
    '  vUv = aPos;',
    '  vEdge = e;',
    '  vSide = nx < 0.0 ? -1.0 : 1.0;',
    '}'
  ].join('\n');

  var FRAG = [
    'precision mediump float;',
    'uniform sampler2D uTex;',
    'uniform vec2 uCover;',
    'uniform float uShift;',
    'uniform float uVelShift;',
    // Not the vertex shader's uVel: a uniform shared by both stages must have
    // the same precision in each, and this one is mediump.
    'uniform float uVelF;',
    'varying vec2 vUv;',
    'varying float vEdge;',
    'varying float vSide;',
    'void main() {',
    '  vec2 uv = (vUv - 0.5) * uCover + 0.5;',
    '  vec2 o = vec2(uShift * vEdge * vEdge * vSide + uVelF * uVelShift, 0.0);',
    '  float r = texture2D(uTex, uv + o).r;',
    '  float g = texture2D(uTex, uv).g;',
    '  float b = texture2D(uTex, uv - o).b;',
    '  gl_FragColor = vec4(r, g, b, 1.0);',
    '}'
  ].join('\n');

  // Returns null when WebGL is not available; the DOM strip stays in charge.
  function createGl(state, onReady, onFail) {
    var canvas = document.createElement('canvas');
    canvas.className = 'case_slider-gl';
    canvas.setAttribute('aria-hidden', 'true');
    var gl = null;
    try {
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
    } catch (e) {}
    if (!gl) return null;

    function compile(type, source) {
      var shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    }
    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

    var verts = [];
    var indices = [];
    for (var r = 0; r <= GL_ROWS; r++) {
      for (var c = 0; c <= GL_COLS; c++) verts.push(c / GL_COLS, r / GL_ROWS);
    }
    for (var rr = 0; rr < GL_ROWS; rr++) {
      for (var cc = 0; cc < GL_COLS; cc++) {
        var a = rr * (GL_COLS + 1) + cc;
        var d = a + GL_COLS + 1;
        indices.push(a, a + 1, d, a + 1, d + 1, d);
      }
    }
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    var ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    var aPos = gl.getAttribLocation(program, 'aPos');
    var u = {};
    ['uRect', 'uRes', 'uStart', 'uBend', 'uSqueeze', 'uBow', 'uVel', 'uVelF', 'uTex', 'uCover', 'uShift', 'uVelShift']
      .forEach(function (name) { u[name] = gl.getUniformLocation(program, name); });

    var textures = {};
    var loaded = 0;
    var disposed = false;

    state.urls.forEach(function (url) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        if (disposed) return;
        try {
          // A long gallery at full size would hold a lot of GPU memory, mostly on
          // phones. Each image is uploaded at the size it is actually drawn.
          var source = img;
          var wanted = Math.ceil((state.slideWidth || 1280) * Math.min(2, window.devicePixelRatio || 1) * 1.25);
          wanted = Math.max(512, wanted);
          if (img.naturalWidth > wanted) {
            var scaled = document.createElement('canvas');
            scaled.width = wanted;
            scaled.height = Math.max(1, Math.round(wanted * img.naturalHeight / img.naturalWidth));
            scaled.getContext('2d').drawImage(img, 0, 0, scaled.width, scaled.height);
            source = scaled;
          }
          var texture = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          textures[url] = { texture: texture, aspect: img.naturalWidth / Math.max(1, img.naturalHeight) };
        } catch (e) {
          // A tainted image (no CORS headers) throws here.
          return onFail();
        }
        if (++loaded === state.urls.length) onReady();
      };
      img.onerror = onFail;
      img.src = url;
    });

    canvas.addEventListener('webglcontextlost', function (event) {
      event.preventDefault();
      onFail();
    });

    function draw(st, x) {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var width = Math.max(1, Math.round(st.viewWidth * dpr));
      var height = Math.max(1, Math.round(st.slideHeight * (1 + 2 * GL_PAD) * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      // Flat zone: the width of the slide that rests in the middle.
      var start = Math.min(0.8, Math.max(0.3, st.slideWidth / st.viewWidth));
      gl.uniform2f(u.uRes, width, height);
      gl.uniform1f(u.uStart, start);
      gl.uniform1f(u.uBend, FX.bend);
      gl.uniform1f(u.uSqueeze, FX.squeeze);
      gl.uniform1f(u.uBow, FX.bow);
      gl.uniform1f(u.uShift, FX.shift);
      gl.uniform1f(u.uVelShift, FX.velShift);
      gl.uniform1f(u.uVel, st.velN);
      gl.uniform1f(u.uVelF, st.velN);
      gl.uniform1i(u.uTex, 0);
      gl.activeTexture(gl.TEXTURE0);

      var step = st.slideWidth + st.gap;
      var margin = st.viewWidth * 0.2;
      var slideAspect = st.slideWidth / Math.max(1, st.slideHeight);
      for (var i = 0; i < st.count; i++) {
        var left = x + i * step;
        if (left + st.slideWidth < -margin || left > st.viewWidth + margin) continue;
        var entry = textures[st.urls[i % st.urls.length]];
        if (!entry) continue;
        // Same crop as object-fit: cover.
        if (entry.aspect > slideAspect) gl.uniform2f(u.uCover, slideAspect / entry.aspect, 1);
        else gl.uniform2f(u.uCover, 1, entry.aspect / slideAspect);
        gl.uniform4f(u.uRect, left * dpr, st.slideHeight * GL_PAD * dpr, st.slideWidth * dpr, st.slideHeight * dpr);
        gl.bindTexture(gl.TEXTURE_2D, entry.texture);
        gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
      }
    }

    function dispose() {
      disposed = true;
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }

    return { canvas: canvas, draw: draw, dispose: dispose };
  }

  function destroySlider(state) {
    window.cancelAnimationFrame(state.raf);
    window.cancelAnimationFrame(state.retry);
    window.clearTimeout(state.resizeTimer);
    window.removeEventListener('resize', state.onResize);
    window.removeEventListener('wheel', state.onWheel);
    if (state.gl) state.gl.dispose();
    delete state.root.__yuusukeSlider__;
  }

  function createSlider(root) {
    if (root.__yuusukeSlider__) return;
    var track = root.querySelector(TRACK);
    if (!track) return;
    var urls = gallerySources(root);
    if (!urls.length) return;
    var scope = root.closest('[data-barba="container"]') || root;

    var state = {
      root: root, track: track, urls: urls,
      // target: where the strip is heading. pos: what is drawn, easing toward it.
      pos: 0, target: 0, throwV: 0, dir: 1, velN: 0,
      setWidth: 0, shift: 0, lead: 0, em: 16,
      slideWidth: 0, slideHeight: 0, gap: 0, viewWidth: 0, count: 0,
      dragging: false, pressed: false, pointerId: null, lastX: 0, lastY: 0, lastT: 0, travel: 0,
      suppressClick: false, gl: null, glOn: false,
      retries: 0, retry: 0, raf: 0, resizeTimer: 0
    };
    root.__yuusukeSlider__ = state;
    layout(state);

    state.gl = createGl(state, function () {
      if (!state.gl) return;
      state.glOn = true;
      root.classList.add('is-webgl');
    }, function () {
      // Any failure hands the strip back to the DOM slides.
      state.glOn = false;
      root.classList.remove('is-webgl');
    });
    if (state.gl) root.appendChild(state.gl.canvas);

    // A mouse drags the strip itself; a finger can swipe from anywhere on the page.
    scope.addEventListener('pointerdown', function (event) {
      var mouse = event.pointerType === 'mouse';
      if (mouse && (event.button !== 0 || !root.contains(event.target))) return;
      state.pressed = true;
      state.dragging = mouse;
      state.pointerId = event.pointerId;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      state.lastT = performance.now();
      state.travel = 0;
      state.throwV = 0;
      state.suppressClick = false;
      if (mouse) {
        root.classList.add('is-dragging');
        try { root.setPointerCapture(event.pointerId); } catch (e) {}
      }
    });

    scope.addEventListener('pointermove', function (event) {
      if (!state.pressed || event.pointerId !== state.pointerId) return;
      var now = performance.now();
      var dx = event.clientX - state.lastX;
      var dy = event.clientY - state.lastY;
      // Vertical swipes count too: on a phone that is how a page is scrolled.
      var delta = event.pointerType === 'mouse' || Math.abs(dx) >= Math.abs(dy) ? dx : dy;
      state.travel += Math.abs(delta);
      // A finger only takes over after a real swipe, so taps still reach links.
      if (!state.dragging && state.travel > 8) state.dragging = true;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      if (!state.dragging) return;
      var dt = Math.max(1, now - state.lastT) / 1000;
      state.target -= delta;
      // Smoothed, so one jittery sample does not decide the throw.
      state.throwV += (-delta / dt - state.throwV) * 0.35;
      state.lastT = now;
    });

    function release(event) {
      if (!state.pressed || (event && event.pointerId !== state.pointerId)) return;
      state.pressed = false;
      if (state.dragging) {
        state.suppressClick = state.travel > 8;
        if (Math.abs(state.throwV) > THROW_MIN) state.dir = state.throwV > 0 ? 1 : -1;
        else state.throwV = 0;
      }
      state.dragging = false;
      root.classList.remove('is-dragging');
      try { root.releasePointerCapture(state.pointerId); } catch (e) {}
    }
    scope.addEventListener('pointerup', release);
    scope.addEventListener('pointercancel', release);

    // The click that ends a swipe must not follow a link under the finger.
    scope.addEventListener('click', function (event) {
      if (!state.suppressClick) return;
      state.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    // The page itself does not scroll, so the wheel moves the strip from anywhere.
    state.onWheel = function (event) {
      var delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      if (event.deltaMode === 1) delta *= 32;
      event.preventDefault();
      state.target += delta * WHEEL_GAIN;
      state.dir = delta > 0 ? 1 : -1;
    };
    window.addEventListener('wheel', state.onWheel, { passive: false });

    state.onResize = function () {
      window.clearTimeout(state.resizeTimer);
      state.resizeTimer = window.setTimeout(function () {
        state.retries = 0;
        layout(state);
      }, 150);
    };
    window.addEventListener('resize', state.onResize, { passive: true });

    var last = null;
    function tick(now) {
      // Barba removed this page: stop instead of animating a detached node.
      if (!root.isConnected) return destroySlider(state);
      var dt = last === null ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;

      if (!state.dragging) {
        // A throw fades out; the slow drift carries on in its direction.
        state.throwV *= Math.exp(-dt * THROW_DECAY);
        var drift = reducedMotion.matches ? 0 : DRIFT_EM * state.em * state.dir;
        state.target += (state.throwV + drift) * dt;
      }

      // The drawn position eases toward the target: tight under a finger,
      // loose for the wheel, which is what makes the wheel feel smooth.
      var before = state.pos;
      var rate = state.dragging ? FOLLOW_DRAG : FOLLOW;
      state.pos += (state.target - state.pos) * (1 - Math.exp(-dt * rate));

      if (dt > 0 && state.viewWidth) {
        var speed = (state.pos - before) / dt / state.viewWidth;
        state.velN += (Math.max(-1.5, Math.min(1.5, speed)) - state.velN) * Math.min(1, dt * 10);
      }

      render(state);
      state.raf = window.requestAnimationFrame(tick);
    }
    state.raf = window.requestAnimationFrame(tick);
  }

  // ---- Previous / next case -----------------------------------------------------
  // Webflow has no previous/next on a CMS page, so they come from the hidden
  // collection list that already feeds the 3D ring, in that same order.

  function pathOf(href) {
    try {
      return new URL(href, window.location.href).pathname.replace(/\/+$/, '') || '/';
    } catch (e) {
      return '';
    }
  }

  function readCases() {
    var seen = {};
    var out = [];
    document.querySelectorAll(CASE_ITEM).forEach(function (item) {
      var link = item.querySelector('.cases-link');
      var href = link ? (link.getAttribute('href') || '') : '';
      var path = pathOf(href);
      if (!href || !path || seen[path]) return;
      seen[path] = true;
      var img = item.querySelector('.cases-thumb');
      var nameEl = item.querySelector('.text-size-large');
      var tags = [];
      item.querySelectorAll('.cases-tags_item').forEach(function (tag) {
        var text = tag.textContent.trim();
        if (text) tags.push(text);
      });
      out.push({
        href: href,
        path: path,
        thumb: img ? (img.getAttribute('src') || '') : '',
        name: nameEl ? nameEl.textContent.trim() : '',
        tags: tags
      });
    });
    return out;
  }

  function fillNavLink(el, info, label) {
    if (!el || !info) return;
    el.setAttribute('href', info.href);
    el.setAttribute('aria-label', label + (info.name ? ': ' + info.name : ''));
    if (info.name) el.setAttribute('title', info.name);
    el.setAttribute('data-sound', '');
    el.textContent = '';
    if (info.thumb) {
      var img = document.createElement('img');
      img.className = 'case_nav-img';
      img.alt = '';
      img.src = info.thumb;
      el.appendChild(img);
    }
  }

  function fillCase(container, path) {
    var cases = readCases();
    var current = pathOf(path);
    var index = -1;
    for (var i = 0; i < cases.length; i++) {
      if (cases[i].path === current) { index = i; break; }
    }

    var nav = container.querySelector(NAV);
    if (nav) {
      if (index < 0 || cases.length < 2) {
        nav.style.display = 'none';
      } else {
        nav.style.display = '';
        var count = cases.length;
        fillNavLink(nav.querySelector('[data-case-prev]'), cases[(index - 1 + count) % count], 'Previous case');
        fillNavLink(nav.querySelector('[data-case-next]'), cases[(index + 1) % count], 'Next case');
      }
    }

    // Role: the case's tags, which the template cannot list on its own.
    var role = container.querySelector('[data-case-role]');
    if (role) {
      var tags = index >= 0 ? cases[index].tags : [];
      // A tag can carry its own slash ("3D / WebGL"); tighten it so the list reads.
      role.textContent = tags.map(function (tag) { return tag.replace(/\s*\/\s*/g, '/'); }).join(' / ');
      var roleDef = role.closest('.case_def');
      if (roleDef) roleDef.classList.toggle('is-empty', !tags.length);
    }

    // Year: the CMS field is a full date and Webflow prints all of it.
    var year = container.querySelector('[data-case-year]');
    if (year) {
      var match = year.textContent.match(/\b(?:19|20)\d{2}\b/);
      if (match) year.textContent = match[0];
    }

    container.querySelectorAll('.case_info a[data-draw-line]').forEach(function (link) {
      var href = (link.getAttribute('href') || '').trim();
      if (!href || href === '#') {
        link.style.display = 'none';
        return;
      }
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener');
    });
  }

  // Long case names shrink to stay inside the screen (the title never wraps).
  function fitTitle(container) {
    var el = container.querySelector('.case_heading-inner');
    if (!el) return;
    el.style.fontSize = '';
    var style = window.getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    var padLeft = parseFloat(style.paddingLeft) || 0;
    var content = rect.width - padLeft - (parseFloat(style.paddingRight) || 0);
    if (!(content > 0)) return;
    var em = parseFloat(window.getComputedStyle(document.body).fontSize) || 16;
    var max = window.innerWidth - (rect.left + padLeft) - em * 1.25;
    if (max > 0 && content > max) {
      el.style.fontSize = (parseFloat(style.fontSize) * max / content).toFixed(2) + 'px';
    }
  }

  var fitTimer = 0;
  window.addEventListener('resize', function () {
    window.clearTimeout(fitTimer);
    fitTimer = window.setTimeout(function () { fitTitle(document); }, 150);
  }, { passive: true });

  function init(container, path) {
    var root = container || document;
    if (!root.querySelector) return;
    var sliders = root.querySelectorAll(SLIDER);
    if (!sliders.length && !root.querySelector(NAV)) return;
    injectCss();
    fillCase(root, path || window.location.pathname);
    fitTitle(root);
    sliders.forEach(createSlider);
  }

  function boot() {
    init(document, window.location.pathname);
    if (window.barba && window.barba.hooks) {
      // beforeEnter: the next page is in the DOM but not revealed yet.
      window.barba.hooks.beforeEnter(function (data) {
        var next = data && data.next;
        if (!next || !next.container) return;
        init(next.container, (next.url && next.url.path) || window.location.pathname);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.YuusukeCase = { init: init };
})();
