(function () {
  'use strict';

  if (window.YuusukeBurn) return;

  var DEFAULT_DURATION = 1.8;
  var DEFAULT_FIRE = '#ff5010';
  var DEFAULT_GRAIN = 0.6;
  var MAX_DPR = 2;

  function log() {
    if (!window.__burnLog) return;
    try { console.log.apply(console, ['[burn]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  // Raw WebGL port of the threejs-burn-paper skill: same shader, no Three.js.
  var VERT = [
    'attribute vec2 position;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = position * 0.5 + 0.5;',
    '  gl_Position = vec4(position, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform float uTime;',
    'uniform float uProgress;',
    'uniform vec2  uResolution;',
    'uniform vec2  uOrigin;',
    'uniform float uRadius;',
    'uniform vec3  uFireColor;',
    'uniform vec3  uPaperColor;',
    'uniform float uGrain;',

    'float hash(vec2 p) {',
    '  p = fract(p * vec2(233.34, 851.73));',
    '  p += dot(p, p + 23.45);',
    '  return fract(p.x * p.y);',
    '}',

    'float noise(vec2 p) {',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  float a = hash(i);',
    '  float b = hash(i + vec2(1.0, 0.0));',
    '  float c = hash(i + vec2(0.0, 1.0));',
    '  float d = hash(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
    '}',

    'float fbm(vec2 p) {',
    '  float v = 0.0;',
    '  float amp = 0.5;',
    '  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);',
    '  for (int i = 0; i < 6; i++) {',
    '    v += amp * noise(p);',
    '    p = rot * p * 2.0;',
    '    amp *= 0.5;',
    '  }',
    '  return v;',
    '}',

    // Starts as the flat div color; fibers/grain fade in with the burn so the
    // canvas handoff from the DOM element is seamless.
    'vec3 paperColor(vec2 uv, vec2 aspect) {',
    '  vec2 p = uv * aspect;',
    '  float fibers = fbm(p * vec2(220.0, 12.0)) * 0.5 + fbm(p * vec2(12.0, 220.0)) * 0.5;',
    '  float stains = fbm(p * 3.5);',
    '  float grain = noise(p * 900.0);',
    '  float g = uGrain * smoothstep(0.0, 0.25, uProgress);',
    '  vec3 base = uPaperColor;',
    '  base = mix(base, base * 0.88, stains * 0.35 * g);',
    '  base -= (fibers - 0.5) * 0.06 * g;',
    '  base -= (grain - 0.5) * 0.04 * g;',
    '  return base;',
    '}',

    'void main() {',
    '  vec2 uv = vUv;',
    '  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);',
    '  vec2 np = uv * aspect;',
    '  float edgeNoise = fbm(np * 3.2 + vec2(uTime * 0.02, 0.0));',
    '  float detail = fbm(np * 9.0) * 0.35;',

    // Radial burn map from the ignition point; 1.0 lands on the farthest corner.
    '  float dm = distance(np, uOrigin * aspect);',
    '  float base = 0.1 + smoothstep(0.0, uRadius, dm) * 0.9;',
    '  float burnMap = base + (edgeNoise - 0.5) * 0.55 + (detail - 0.5) * 0.25;',

    // Range covers burnMap extremes so 0 is untouched and 1 is fully consumed.
    '  float threshold = uProgress * 1.6 - 0.25;',
    '  float edge = burnMap - threshold;',

    '  vec3 paper = paperColor(uv, aspect);',
    '  float emberW = 0.045;',
    '  float charW  = 0.11;',

    '  float charAmt = 1.0 - smoothstep(0.0, charW, edge);',
    '  vec3 charCol = mix(vec3(0.10, 0.07, 0.05), vec3(0.02, 0.015, 0.012), 1.0 - smoothstep(0.0, emberW, edge));',
    '  vec3 col = mix(paper, charCol, clamp(charAmt, 0.0, 1.0));',

    '  vec3 fire = uFireColor;',
    '  vec3 hotFire = mix(fire, vec3(1.0, 0.96, 0.75), 0.7);',

    '  float flicker = 0.75 + 0.25 * fbm(np * 8.0 + uTime * 3.0);',
    '  float ember = (1.0 - smoothstep(0.0, emberW, edge)) * step(0.0, edge);',
    '  vec3 emberCol = mix(hotFire, fire, smoothstep(0.0, emberW, edge));',
    '  col += emberCol * ember * flicker * 2.2;',

    '  float glow = (1.0 - smoothstep(0.0, emberW * 2.5, edge)) * step(0.0, edge);',
    '  col += fire * glow * 0.35 * flicker;',

    '  float alpha = smoothstep(-0.012, 0.012, edge);',

    '  float sparkNoise = noise(np * 60.0 + uTime * 5.0);',
    '  float sparkBand = (1.0 - smoothstep(0.0, emberW * 1.6, abs(edge))) * step(0.0, edge);',
    '  if (sparkNoise > 0.94) {',
    '    col += mix(hotFire, fire, 0.4) * sparkBand * 2.0;',
    '  }',

    '  gl_FragColor = vec4(col, alpha);',
    '}'
  ].join('\n');

  function parseColor(input, fallback) {
    var s = String(input || '').trim();
    var m = s.match(/^#([0-9a-f]{6})$/i);
    if (m) {
      return [
        parseInt(m[1].slice(0, 2), 16) / 255,
        parseInt(m[1].slice(2, 4), 16) / 255,
        parseInt(m[1].slice(4, 6), 16) / 255
      ];
    }
    m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
    return fallback;
  }

  function compile(gl, type, src) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      log('shader error', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function buildProgram(gl) {
    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      log('link error', gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }

  function easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }

  // Keeps the sequence going when WebGL is unavailable.
  function fadeOut(el, duration) {
    return new Promise(function (resolve) {
      var start = null;
      var durMs = duration * 1000;
      function frame(now) {
        if (start === null) start = now;
        var t = Math.min(1, (now - start) / durMs);
        el.style.opacity = String(1 - easeInOutSine(t));
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  // Burns `el` away, revealing whatever sits behind it. Resolves when done.
  // opts: duration (s), fireColor (hex), origin ([x, y] in 0..1, y up), grain (0..1).
  function burn(el, opts) {
    opts = opts || {};
    if (!el) return Promise.resolve();

    var rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return Promise.resolve();

    var duration = opts.duration || DEFAULT_DURATION;
    var canvas = document.createElement('canvas');
    var gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false })
      || canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
    var program = gl && buildProgram(gl);

    if (!gl || !program) {
      log('no webgl, fading');
      return fadeOut(el, duration);
    }

    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
    el.appendChild(canvas);

    var dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);

    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.useProgram(program);
    var position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    var u = {};
    ['uTime', 'uProgress', 'uResolution', 'uOrigin', 'uRadius', 'uFireColor', 'uPaperColor', 'uGrain']
      .forEach(function (name) { u[name] = gl.getUniformLocation(program, name); });

    var origin = opts.origin || [0.5, 0.5];
    var aspect = rect.width / rect.height;
    // Farthest corner from the origin, in the shader's aspect-corrected space.
    var radius = Math.max(
      Math.hypot((0 - origin[0]) * aspect, 0 - origin[1]),
      Math.hypot((1 - origin[0]) * aspect, 0 - origin[1]),
      Math.hypot((0 - origin[0]) * aspect, 1 - origin[1]),
      Math.hypot((1 - origin[0]) * aspect, 1 - origin[1])
    );
    var paper = parseColor(getComputedStyle(el).backgroundColor, [0.92, 0.89, 0.83]);
    var fire = parseColor(opts.fireColor || DEFAULT_FIRE, [1, 0.313, 0.063]);

    gl.uniform2f(u.uResolution, canvas.width, canvas.height);
    gl.uniform2f(u.uOrigin, origin[0], origin[1]);
    gl.uniform1f(u.uRadius, radius);
    gl.uniform3f(u.uFireColor, fire[0], fire[1], fire[2]);
    gl.uniform3f(u.uPaperColor, paper[0], paper[1], paper[2]);
    gl.uniform1f(u.uGrain, typeof opts.grain === 'number' ? opts.grain : DEFAULT_GRAIN);
    gl.clearColor(0, 0, 0, 0);

    function draw(time, progress) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uProgress, progress);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // First frame is drawn before the div goes transparent so nothing flashes.
    draw(0, 0);
    var prevBackground = el.style.backgroundColor;
    el.style.backgroundColor = 'transparent';
    log('start', { duration: duration, origin: origin, paper: paper });

    return new Promise(function (resolve) {
      var start = null;
      var durMs = duration * 1000;

      function frame(now) {
        if (start === null) start = now;
        var t = Math.min(1, (now - start) / durMs);
        // Linear: the threshold range already paces ignition and the last embers.
        draw((now - start) / 1000, t);
        if (t < 1) return requestAnimationFrame(frame);

        el.style.backgroundColor = prevBackground;
        el.style.visibility = 'hidden';
        var lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        log('done');
        resolve();
      }

      requestAnimationFrame(frame);
    });
  }

  window.YuusukeBurn = { burn: burn };
})();
