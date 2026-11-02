/*
 * The poses and the case files: the flight on home, the seat on contact, and
 * sealed files floating between the real cases. The bodies wearing these
 * poses come from cast.js.
 *
 * The scene bundle keeps its own copy of three.js, so this file borrows the
 * constructors from objects already in the scene instead of importing another.
 */
(function () {
  'use strict';

  var tries = 0;
  var timer = setInterval(function () {
    var exp = window.experience;
    var character = exp && exp.world && exp.world.character;
    if (character && character.model) {
      clearInterval(timer);
      try { spreadCards(character); } catch (err) { console.warn('[detective]', err); }
      try { blankFiles(character); } catch (err) { console.warn('[detective]', err); }
      try { dress(exp, character.model); } catch (err) { console.warn('[detective]', err); }
      try { whiteHair(character.model); } catch (err) { console.warn('[detective]', err); }
    } else if (++tries > 400) {
      clearInterval(timer);
    }
  }, 50);

  var WING_URL = '/webgl/models/wings/angel-wings-sxnneh.glb';
  var WING_HUMAN = 1.75; // the model is sized for a person this tall, in metres
  var WING_SIZE = 0.85;  // how big the wings hang on the character, against that person
  var WING_RAISE = 0.08; // radians the wings are lifted at rest

  // White hair, to go with the white wings.
  function whiteHair(model) {
    model.traverse(function (o) {
      if (!o.isMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
        if (m && m.name === 'Hair') { m.color.set(0xeeece8); m.roughness = 0.55; }
      });
    });
  }

  // More cards float now, so the home rings open up to keep them apart; the
  // cases ring keeps the scene's own size.
  function spreadCards(character) {
    var s = character.panelSettings;
    if (!s) return;
    s.radius = 5;          // home: first ring around the character
    s.radiusGrowth = 2.8;  // home: gap between rings
    s.heightStep = 2.4;
    if (character.panelsGroup && character.panelTemplates) character.rebuildPanels();
  }

  /*
   * Blank case files: a dozen black cards float between the real ones. They
   * carry no case, cannot be opened, and show static with an error message
   * that tears and flickers.
   */
  var BLANKS = 6;
  // a 1x1 transparent image, so the scene's texture loader has a real file to read
  var BLANK_MARK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  var ERRORS = [
    ['Sealed', 'BY ORDER OF THE COUNCIL'],
    ['Forbidden', 'CLEARANCE: OLYMPUS'],
    ['In the forge', 'STILL BEING BUILT'],
    ['Redacted', 'UNDER OATH'],
    ['Lost scroll', 'EVIDENCE PENDING'],
    ['Prophecy', 'REVEALED SOON']
  ];

  function blankFiles(character) {
    if (typeof character.setCases !== 'function' || typeof character.rebuildPanels !== 'function') return;

    var setCases = character.setCases.bind(character);
    character.setCases = function (cases) {
      if (!Array.isArray(cases) || !cases.length) return setCases(cases);
      var real = cases.filter(function (c) { return c && c.thumb !== BLANK_MARK; });
      var mixed = [];
      var total = real.length + BLANKS;
      // spread the blanks evenly between the real cards
      for (var i = 0, r = 0, b = 0; i < total; i++) {
        var wantBlank = b < BLANKS && (r >= real.length || (b + 1) / (BLANKS + 1) <= (i + 1) / (total + 1));
        if (wantBlank) { mixed.push({ name: ' ', thumb: BLANK_MARK, url: '', tags: [] }); b++; }
        else mixed.push(real[r++]);
      }
      return setCases(mixed);
    };

    // A blank card is not a case: taps on it go nowhere.
    var onPanelTap = character.onPanelTap && character.onPanelTap.bind(character);
    if (onPanelTap && character.pickPanelFromEvent) {
      character.onPanelTap = function (e) {
        var hit = character.pickPanelFromEvent(e);
        if (hit && hit.object && hit.object.userData.blank) return;
        return onPanelTap(e);
      };
    }

    var screens = [];
    var rebuild = character.rebuildPanels.bind(character);
    character.rebuildPanels = function () {
      var out = rebuild();
      dressBlanks();
      return out;
    };

    function makeScreen(Texture, like, message) {
      var canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 360;
      var tex = new Texture(canvas);
      if (like) {
        tex.colorSpace = like.colorSpace;
        tex.minFilter = like.minFilter; tex.magFilter = like.magFilter;
        tex.generateMipmaps = false;
      }
      var s = { canvas: canvas, ctx: canvas.getContext('2d'), tex: tex, next: 0, message: message };
      draw(s);
      return s;
    }

    var GLYPHS = '#%&@$!?/\\<>[]{}01';
    function scramble(text, rate) {
      return text.split('').map(function (ch) {
        return ch !== ' ' && Math.random() < rate ? GLYPHS[Math.random() * GLYPHS.length | 0] : ch;
      }).join('');
    }

    // A sealed file: cobalt sheet on a fine grid, a gold tab, the notice set in
    // mono, and a scan bar that sweeps down it. Now and then the notice garbles.
    function draw(s) {
      var c = s.ctx, w = s.canvas.width, h = s.canvas.height;
      var t = performance.now() / 1000;
      c.globalAlpha = 1;
      var g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#1a2a5e'); g.addColorStop(1, '#070b1a');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(232, 196, 114, 0.07)';
      c.lineWidth = 1;
      for (var x = 0; x <= w; x += 20) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, h); c.stroke(); }
      for (var y = 0; y <= h; y += 20) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(w, y + 0.5); c.stroke(); }
      // the scan bar
      var sy = (t * 90 + s.message[0].length * 37) % (h + 80) - 40;
      var sg = c.createLinearGradient(0, sy - 40, 0, sy + 40);
      sg.addColorStop(0, 'rgba(232, 196, 114, 0)'); sg.addColorStop(0.5, 'rgba(232, 196, 114, 0.16)'); sg.addColorStop(1, 'rgba(232, 196, 114, 0)');
      c.fillStyle = sg; c.fillRect(0, sy - 40, w, 80);
      // frame and tab
      c.strokeStyle = 'rgba(232, 236, 245, 0.35)';
      c.strokeRect(18.5, 18.5, w - 37, h - 37);
      c.fillStyle = '#e8c472';
      c.fillRect(18, 18, 132, 30);
      c.fillStyle = '#0a1230';
      c.font = '600 15px "Manrope", Arial, sans-serif';
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      c.fillText('SEALED FILE', 30, 34);
      var rate = Math.random() < 0.12 ? 0.3 : 0;
      var title = scramble(s.message[0], rate), sub = scramble(s.message[1], rate);
      c.textAlign = 'center';
      c.fillStyle = '#eef1f7';
      c.font = '600 64px "Grenze Gotisch", "Cinzel", Georgia, serif';
      c.fillText(title, w / 2, h * 0.5);
      c.font = '500 18px "Manrope", Arial, sans-serif';
      c.fillStyle = 'rgba(238, 241, 247, 0.6)';
      c.fillText(sub, w / 2, h * 0.66);
      c.textAlign = 'right';
      c.font = '500 14px "Manrope", Arial, sans-serif';
      c.fillStyle = 'rgba(232, 196, 114, 0.9)';
      c.fillText('NO. ' + (1000 + (s.message[0].length * 97) % 9000), w - 32, h - 38);
      // a rare slip: one band slides sideways
      if (rate) {
        var by = Math.random() * h, bh = 6 + Math.random() * 18;
        c.drawImage(s.canvas, 0, by, w, bh, (Math.random() - 0.5) * 60, by, w, bh);
      }
      s.tex.needsUpdate = true;
    }

    function dressBlanks() {
      var panels = character.panels || [];
      var n = 0;
      panels.forEach(function (m) {
        var data = m.userData && m.userData.case;
        if (!data || data.thumb !== BLANK_MARK) return;
        var mat = m.material;
        if (!mat || !mat.map) return;
        if (!screens.length) {
          for (var e = 0; e < ERRORS.length; e++) screens.push(makeScreen(mat.map.constructor, mat.map, ERRORS[e]));
        }
        m.userData.blank = true;
        delete m.userData.case; // nothing to open, no name to report on hover
        mat.map = screens[n++ % screens.length].tex;
        mat.needsUpdate = true;
      });
    }

    (function flicker(now) {
      for (var i = 0; i < screens.length; i++) {
        var s = screens[i];
        if (now >= s.next) {
          draw(s);
          s.next = now + 70 + Math.random() * 160;
        }
      }
      requestAnimationFrame(flicker);
    })(0);

    // The parent page may have handed over its cases before this ran.
    if (Array.isArray(character.caseData) && character.caseData.length) {
      character._casesSig = null;
      character.setCases(character.caseData);
    }
  }

  function dress(exp, model) {
    // GLTFLoader drops the dots from node names: 'spine.003' arrives as 'spine003'.
    var bone = function (name) { return model.getObjectByName(name) || model.getObjectByName(name.replace(/\./g, '')); };
    var chest = bone('spine.003');
    var upperChest = bone('spine.004');
    var head = bone('spine.006');
    var footL = bone('foot.L'), toeL = bone('toe.L');
    var footR = bone('foot.R'), toeR = bone('toe.R');
    if (!chest || !head || !footL || !toeL || !footR || !toeR) return;

    var skinned = null;
    model.traverse(function (o) { if (o.isSkinnedMesh && !skinned) skinned = o; });
    if (!skinned) return;
    var T = {
      Object3D: model.constructor,
      Vector3: model.position.constructor,
      Matrix4: model.matrixWorld.constructor
    };

    // Measure in the bind pose so the fit does not depend on the frame the
    // animation happens to be on. The pose is put back once the measuring is done.
    var saved = [];
    if (skinned.skeleton) {
      skinned.skeleton.bones.forEach(function (b) {
        saved.push([b, b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
      });
      skinned.skeleton.pose();
    }
    model.updateMatrixWorld(true);
    var V = function (x, y, z) { return new T.Vector3(x, y, z); };
    var wp = function (o) { return o.getWorldPosition(V()); };

    var pChest = wp(chest);
    var pHead = wp(head);
    var up = V().subVectors(pHead, pChest).normalize();
    // The feet point where the character faces.
    var forward = V().subVectors(wp(toeL), wp(footL)).add(V().subVectors(wp(toeR), wp(footR)));
    forward.sub(up.clone().multiplyScalar(forward.dot(up))).normalize();
    var back = forward.clone().negate();
    var side = V().crossVectors(up, back).normalize();
    var height = Math.max(pHead.distanceTo(wp(footL)), 0.001);

    // Parent `obj` to `parentBone`, placing it in world space at `pos` with
    // the basis (x, y, z).
    function mount(obj, parentBone, pos, x, y, z) {
      var world = new T.Matrix4().makeBasis(x, y, z).setPosition(pos);
      var local = new T.Matrix4().copy(parentBone.matrixWorld).invert().multiply(world);
      local.decompose(obj.position, obj.quaternion, obj.scale);
      parentBone.add(obj);
    }

    // Frame: x away from the spine, y up, z back. One pivot per wing at its root.
    var wingsRoot = new T.Object3D();
    wingsRoot.name = 'DetectiveWings';
    var wingPivots = [];
    [1, -1].forEach(function (mirror) {
      var pivot = new T.Object3D();
      pivot.position.set(0.02 * height * mirror, 0, 0);
      pivot.userData.mirror = mirror;
      wingsRoot.add(pivot);
      wingPivots.push(pivot);
    });
    // Shoulder blades: a little over halfway from the chest bone to the base
    // of the neck, pushed out past the coat so the roots sit on the back.
    var pBlades = upperChest ? pChest.clone().lerp(wp(upperChest), 0.6) : pChest.clone().addScaledVector(up, 0.08 * height);
    mount(wingsRoot, upperChest || chest, pBlades.addScaledVector(back, 0.08 * height), side, up, back);

    // ---------- poses ----------
    // Each wide shot gets its own pose, laid over the scene's animation:
    //   home     the ruler: floating, arms spread a little below the shoulders
    //   contact  the throne: seated, arms on the armrests
    // What can be is worked out here, while the skeleton is in bind pose.
    var Q = model.quaternion.constructor;
    var bindLocal = new Map();
    skinned.skeleton.bones.forEach(function (b) { bindLocal.set(b, b.quaternion.clone()); });
    // the ruler: the bind pose with the upper arms dipped a little below the shoulders
    var rulerPose = [];
    skinned.skeleton.bones.forEach(function (b) { rulerPose.push([b, b.quaternion.clone()]); });
    function dipArm(name, handName, angle) {
      var upper = bone(name), hand = bone(handName);
      if (!upper || !hand || !upper.parent) return;
      var parentQ = upper.parent.getWorldQuaternion(new Q());
      var worldQ = upper.getWorldQuaternion(new Q());
      var best = null, bestY = Infinity;
      [1, -1].forEach(function (sign) {
        var r = new Q().setFromAxisAngle(forward, sign * angle);
        var local = parentQ.clone().invert().multiply(r.multiply(worldQ.clone()));
        var keep = upper.quaternion.clone();
        upper.quaternion.copy(local);
        upper.updateMatrixWorld(true);
        var y = wp(hand).y;
        if (y < bestY) { bestY = y; best = local; }
        upper.quaternion.copy(keep);
        upper.updateMatrixWorld(true);
      });
      rulerPose.forEach(function (e) { if (e[0] === upper) e[1].copy(best); });
    }
    dipArm('upper_arm.L', 'hand.L', 0.42);
    dipArm('upper_arm.R', 'hand.R', 0.42);

    // the body's directions, kept in the chest's frame so they follow it around
    var toChest = chest.getWorldQuaternion(new Q()).invert();
    var fwdInChest = forward.clone().applyQuaternion(toChest);
    var upInChest = up.clone().applyQuaternion(toChest);
    var limbs = {};
    ['L', 'R'].forEach(function (k) {
      var l = {
        upper: bone('upper_arm.' + k), fore: bone('forearm.' + k), hand: bone('hand.' + k), finger: bone('f_middle.01.' + k),
        thigh: bone('thigh.' + k), shin: bone('shin.' + k), foot: bone('foot.' + k), toe: bone('toe.' + k)
      };
      // outward, in the chest's frame: from the middle of the chest to this shoulder
      var o = V().subVectors(wp(l.upper), pChest);
      o.sub(up.clone().multiplyScalar(o.dot(up))).normalize();
      l.outInChest = o.applyQuaternion(toChest);
      limbs[k] = l;
    });
    var hips = bone('spine');
    var pHips = hips ? wp(hips) : pChest.clone().addScaledVector(up, -0.3 * height);
    var floorY = Math.min(wp(limbs.L.toe).y, wp(limbs.L.foot).y) - 0.03 * height;
    var spineBones = ['spine', 'spine.001', 'spine.002', 'spine.003', 'spine.004', 'spine.005'].map(bone).filter(Boolean);
    // the armature node moves the whole body (the floor and the cards stay put)
    var rig = skinned.skeleton.bones[0];
    while (rig.parent && rig.parent.isBone) rig = rig.parent;
    rig = rig.parent && rig.parent !== model ? rig.parent : rig;

    saved.forEach(function (s) {
      s[0].position.copy(s[1]);
      s[0].quaternion.copy(s[2]);
      s[0].scale.copy(s[3]);
    });
    model.updateMatrixWorld(true);

    // Shared by every wing material: the clock and how hard the edges glitch.
    var glitch = { time: { value: 0 }, amount: { value: 0.5 } };

    var loader = exp.resources && exp.resources.loaders && exp.resources.loaders.gltfLoader;
    // The wings are retired: the cast (cast.js) has a different character on
    // every route, and none of them wear wings.

    // White feathers whose outer bands jump sideways and flash red or cyan.
    // `span` is the half span along the mesh's x; bands run along `bandAxis`.
    function wingMaterial(src, span, bandAxis, bandDensity) {
      var d = src.clone();
      d.color.set(0xffffff);
      // a soft glow of their own, so the wings stay white even on their unlit side
      if (d.emissive) { d.emissive.set(0x4a4a52); d.emissiveMap = d.map || null; d.emissiveIntensity = 1; }
      if ('roughness' in d) { d.roughness = 0.8; d.metalness = 0; }
      if ('sheen' in d) { d.sheen = 0; d.clearcoat = 0; }
      d.transparent = false;
      d.alphaTest = 0.45;
      d.depthWrite = true;
      d.side = 2; // DoubleSide
      d.onBeforeCompile = function (sh) {
        sh.uniforms.uGlitchTime = glitch.time;
        sh.uniforms.uGlitch = glitch.amount;
        sh.uniforms.uSpan = { value: span };
        sh.uniforms.uBandAxis = { value: bandAxis };
        sh.uniforms.uBandDensity = { value: bandDensity };
        sh.vertexShader = 'uniform float uGlitchTime;\nuniform float uGlitch;\nuniform float uSpan;\nuniform vec3 uBandAxis;\nuniform float uBandDensity;\nvarying float vGlitch;\n' +
          sh.vertexShader.replace('#include <begin_vertex>', [
            '#include <begin_vertex>',
            // only the outer part of the wing glitches
            'float gEdge = smoothstep(0.35, 0.95, abs(position.x) / uSpan);',
            'float gBand = floor(dot(position, uBandAxis) * uBandDensity) + floor(uGlitchTime * 12.0) * 7.0;',
            'float gRand = fract(sin(gBand * 12.9898) * 43758.5453);',
            'float gHit = step(1.0 - 0.22 * uGlitch, gRand) * gEdge;',
            'transformed.x += sign(position.x) * gHit * uSpan * (0.015 + gRand * 0.07) * uGlitch;',
            'vGlitch = gHit;'
          ].join('\n'));
        sh.fragmentShader = 'uniform float uGlitchTime;\nvarying float vGlitch;\n' +
          sh.fragmentShader.replace('#include <dithering_fragment>', [
            '#include <dithering_fragment>',
            'if (vGlitch > 0.0) {',
            '  float gSide = step(0.5, fract(gl_FragCoord.y * 0.25 + uGlitchTime * 3.0));',
            '  gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(vec3(0.92, 0.09, 0.09), vec3(0.0, 1.0, 0.92), gSide), 0.75);',
            '}'
          ].join('\n'));
      };
      d.customProgramCacheKey = function () { return 'detective-wing-glitch'; };
      d.needsUpdate = true;
      return d;
    }

    // The model is one mesh holding both wings, spread wide along its x. Each
    // half gets its own mesh and hangs from its pivot so the two can beat.
    function hangWings(scene) {
      scene.updateMatrixWorld(true);
      var src = null;
      scene.traverse(function (o) { if (o.isMesh && !src) src = o; });
      if (!src) return;
      var geo = src.geometry;
      var pos = geo.attributes.position;
      var index = geo.index ? Array.prototype.slice.call(geo.index.array) : null;
      if (!index) { index = []; for (var n = 0; n < pos.count; n++) index.push(n); }
      geo.computeBoundingBox();
      var gb = geo.boundingBox;
      var span = Math.max(Math.abs(gb.min.x), Math.abs(gb.max.x), 1e-6);

      // where the wings meet: the vertices nearest the middle of the span
      var root = V(), near = 0, v = V();
      for (var i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (Math.abs(v.x) < span * 0.06) { root.add(v); near++; }
      }
      root.multiplyScalar(1 / Math.max(near, 1)).applyMatrix4(src.matrixWorld);

      // bands run along whichever local axis ends up pointing up in the scene
      var q = src.getWorldQuaternion(src.quaternion.clone());
      var ay = V(0, 1, 0).applyQuaternion(q), az = V(0, 0, 1).applyQuaternion(q);
      var useZ = Math.abs(az.y) > Math.abs(ay.y);
      var bandAxis = useZ ? V(0, 0, 1) : V(0, 1, 0);
      var tall = useZ ? gb.max.z - gb.min.z : gb.max.y - gb.min.y;
      var mat = wingMaterial(Array.isArray(src.material) ? src.material[0] : src.material, span, bandAxis, 34 / Math.max(tall, 1e-6));

      var k = WING_SIZE * (height / 0.88) / WING_HUMAN; // the head-to-foot measure is about 0.88 of standing height
      [1, -1].forEach(function (side) {
        var tris = [];
        for (var t = 0; t < index.length; t += 3) {
          var cx = pos.getX(index[t]) + pos.getX(index[t + 1]) + pos.getX(index[t + 2]);
          if ((cx >= 0 ? 1 : -1) === side) tris.push(index[t], index[t + 1], index[t + 2]);
        }
        var g = geo.clone();
        g.setIndex(tris);
        var m = new src.constructor(g, mat);
        src.matrixWorld.decompose(m.position, m.quaternion, m.scale);
        m.position.sub(root);
        m.castShadow = true;
        m.frustumCulled = false;
        var holder = new T.Object3D();
        holder.scale.setScalar(k);
        holder.add(m);
        // the half on the scene's +x hangs on the pivot that leans to +x
        var worldSide = V(side, 0, 0).applyQuaternion(q).x >= 0 ? 1 : -1;
        wingPivots[worldSide > 0 ? 0 : 1].add(holder);
      });
    }

    // ---------- motion ----------
    // On the close-up routes the camera sits right beside the character, so the
    // wings shrink away and disappear instead of filling the frame.
    var CLOSE = /^(about|contact|case-inner)$/;
    var character = exp.world.character;
    var isClose = function () { return CLOSE.test(character.currentRoute || ''); };
    var fold = isClose() ? 1 : 0;
    var baseScale = wingsRoot.scale.clone();
    var t0 = performance.now();
    var last = t0;
    var burstUntil = 0, nextBurst = t0 + 2000;
    function tick() {
      var now = performance.now();
      var t = (now - t0) / 1000;
      var dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      fold += ((isClose() ? 1 : 0) - fold) * Math.min(1, dt * 2.5);
      var beat = Math.sin(t * 1.15) * (1 - 0.6 * fold);
      var k = 1 - 0.92 * fold;
      wingsRoot.scale.copy(baseScale).multiplyScalar(k);
      // gone, not just small, once they have shrunk most of the way
      wingsRoot.visible = fold < 0.6;
      for (var i = 0; i < wingPivots.length; i++) {
        var p = wingPivots[i];
        var m = p.userData.mirror;
        p.rotation.set(0.04 * beat - 0.25 * fold, -m * (0.04 * beat + 0.4 * fold), m * (WING_RAISE + 0.07 * beat - 0.1 * fold));
      }
      // a steady flicker on the edges, with a hard burst every few seconds
      if (now >= nextBurst) { burstUntil = now + 180 + Math.random() * 320; nextBurst = now + 2000 + Math.random() * 3500; }
      glitch.amount.value = now < burstUntil ? 1 : 0.45;
      glitch.time.value = t;
      requestAnimationFrame(tick);
    }
    tick();

    // ---------- poses, every frame ----------
    var q1 = new Q(), q2 = new Q(), q3 = new Q(), va = V(), vb = V(), vc = V();
    // Turn `b` so that the line from it to `child` points along `dir` (world space).
    function aim(b, child, dir, w) {
      if (!b || !child || !b.parent) return;
      var bq = b.getWorldQuaternion(q1);
      var cur = child.getWorldPosition(vb).sub(b.getWorldPosition(va)).normalize();
      var target = q2.setFromUnitVectors(cur, vc.copy(dir).normalize()).multiply(bq);
      var local = b.parent.getWorldQuaternion(q3).invert().multiply(target);
      b.quaternion.slerp(local, w);
      b.updateMatrixWorld(true);
    }
    function frame() {
      var cq = chest.getWorldQuaternion(new Q());
      return {
        fwd: fwdInChest.clone().applyQuaternion(cq),
        up: upInChest.clone().applyQuaternion(cq),
        out: { L: limbs.L.outInChest.clone().applyQuaternion(cq), R: limbs.R.outInChest.clone().applyQuaternion(cq) },
        head: head.getWorldPosition(V())
      };
    }

    function poseRuler(w) {
      for (var i = 0; i < rulerPose.length; i++) rulerPose[i][0].quaternion.slerp(rulerPose[i][1], w);
      // Elbows low in front, forearms raised and open hands up near the face,
      // sweeping left and right together as if scrolling a screen in the air.
      var f = frame();
      var t = performance.now() / 1000;
      var sweep = Math.sin(t * 0.9) * 0.35 + Math.sin(t * 2.3) * 0.04;
      var right = f.out.R;
      ['L', 'R'].forEach(function (k) {
        var l = limbs[k], out = f.out[k];
        aim(l.upper, l.fore, f.fwd.clone().addScaledVector(out, 0.3).addScaledVector(f.up, -0.25).addScaledVector(right, sweep * 0.4), w);
        aim(l.fore, l.hand, f.fwd.clone().addScaledVector(f.up, 0.5).addScaledVector(out, 0.12).addScaledVector(right, sweep), w);
        aim(l.hand, l.finger, f.up.clone().addScaledVector(f.fwd, 0.3).addScaledVector(out, 0.1).addScaledVector(right, sweep * 0.6), w);
      });
    }

    // On the throne: upright back, knees forward, arms on the armrests.
    function poseThrone(w) {
      spineBones.forEach(function (b) { b.quaternion.slerp(bindLocal.get(b), w); b.updateMatrixWorld(true); });
      var f = frame();
      ['L', 'R'].forEach(function (k) {
        var l = limbs[k], out = f.out[k];
        aim(l.thigh, l.shin, f.fwd.clone().addScaledVector(out, 0.22).addScaledVector(f.up, -0.06), w);
        aim(l.shin, l.foot, f.up.clone().negate().addScaledVector(f.fwd, 0.15), w);
        aim(l.foot, l.toe, f.fwd, w);
      });
      // both arms down along the armrests
      ['L', 'R'].forEach(function (k) {
        var l = limbs[k], out = f.out[k];
        aim(l.upper, l.fore, f.up.clone().negate().addScaledVector(out, 0.3).addScaledVector(f.fwd, 0.2), w);
        aim(l.fore, l.hand, f.fwd.clone().addScaledVector(out, 0.1).addScaledVector(f.up, -0.12), w);
        aim(l.hand, l.finger, f.fwd.clone().addScaledVector(f.up, -0.35), w);
      });
    }

    // ---------- the throne ----------
    // "Demon King Throne" by Unreal_Joelab on Sketchfab (CC BY 4.0), re-cast
    // in gold for Jupiter. Loaded the first time the contact page shows, and
    // set under the seated body.
    var throne = null, throneLoading = false;
    function loadThrone() {
      if (throne || throneLoading || !loader) return;
      throneLoading = true;
      loader.load('/webgl/models/throne.glb', function (gltf) {
        try { throne = placeThrone(gltf.scene); } catch (err) { console.warn('[detective] throne', err); }
      });
    }
    function placeThrone(scene) {
      scene.updateMatrixWorld(true);
      var min = V(Infinity, Infinity, Infinity), max = V(-Infinity, -Infinity, -Infinity), pts = [];
      scene.traverse(function (o) {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        // gilded: the throne's own texture only shades the gold
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          if (!m || !m.color) return;
          m.color.setHex(0xd9ad55);
          m.userData.stageKeep = true;
          if ('metalness' in m) { m.metalness = 0.6; m.roughness = 0.32; }
          if (m.emissive) { m.emissive.setHex(0x2a1a04); m.emissiveMap = null; }
        });
        var pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 6000));
        for (var i = 0; i < pos.count; i += step) {
          var p = V().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          pts.push(p); min.min(p); max.max(p);
        }
      });
      var size = V().subVectors(max, min), mid = V().addVectors(max, min).multiplyScalar(0.5);
      // the backrest is the tall part: its side is the back of the throne
      var hi = V(), nHi = 0;
      pts.forEach(function (p) { if (p.y > min.y + size.y * 0.7) { hi.add(p); nHi++; } });
      hi.multiplyScalar(1 / Math.max(nHi, 1));
      var backDir = V(hi.x - mid.x, 0, hi.z - mid.z);
      if (backDir.lengthSq() < 1e-8) backDir.set(0, 0, -1);
      backDir.normalize();
      // the seat: the highest point near the middle, in front of the backrest
      var seat = min.y + size.y * 0.3;
      var depth = Math.max(size.x, size.z);
      pts.forEach(function (p) {
        var along = (p.x - mid.x) * backDir.x + (p.z - mid.z) * backDir.z;
        var across = Math.abs((p.x - mid.x) * backDir.z - (p.z - mid.z) * backDir.x);
        if (across < depth * 0.12 && along < 0 && along > -depth * 0.3 && p.y < min.y + size.y * 0.55) seat = Math.max(seat, p.y);
      });
      // The body stays at standing height so the contact camera keeps the face in
      // frame; the throne is scaled up instead, so its seat meets the hips.
      var seatWorld = pHips.y - 0.05 * height;
      var k = (seatWorld - floorY) / Math.max(seat - min.y, 1e-6);
      var holder = new T.Object3D(), inner = new T.Object3D();
      scene.position.set(-mid.x, -min.y, -mid.z);
      inner.add(scene);
      inner.rotation.y = Math.atan2(forward.x, forward.z) - Math.atan2(-backDir.x, -backDir.z);
      holder.add(inner);
      var at = V(pHips.x, floorY, pHips.z).addScaledVector(back, 0.1 * height);
      model.updateMatrixWorld(true);
      holder.position.copy(model.worldToLocal(at));
      holder.userData.k = k;
      holder.scale.setScalar(0.0001);
      model.add(holder);
      return holder;
    }

    // The poses go on after the scene's own animation each frame, eased in on
    // their route and out everywhere else.
    var weights = { home: 0, contact: 0 };
    // standing hip height and world-to-model scale, both in the model's own space
    var takeoff = {
      done: false, started: 0, low: Infinity,
      standY: model.worldToLocal(pHips.clone()).y,
      scale: 1 / model.getWorldScale(V()).y
    };
    var poseClock = performance.now();
    var rigBase = rig.position.clone();
    var bones = skinned.skeleton.bones;
    var clean = bones.map(function (b) { return b.quaternion.clone(); });
    var written = bones.map(function () { return new Q(0, 0, 0, 0); });
    var update = character.update.bind(character);
    character.update = function () {
      var out = update.apply(null, arguments);
      // Some routes stop the scene's animation, and then nothing rewrites the
      // bones: a bone still holding last frame's pose goes back to the clean
      // animated value it had before the poses touched it.
      for (var i = 0; i < bones.length; i++) {
        var b = bones[i];
        if (b.quaternion.equals(written[i])) b.quaternion.copy(clean[i]);
        else clean[i].copy(b.quaternion);
      }
      var route = character.currentRoute;
      var now = performance.now(), dt = Math.min(0.1, (now - poseClock) / 1000);
      poseClock = now;
      rig.position.copy(rigBase);
      rig.updateWorldMatrix(true, true);
      // The intro crouches and then stands up. Flight holds off until the hips
      // start coming up out of the crouch, and takes off from there instead.
      var holdHome = false;
      if (route === 'home' && character._introPlaying && !takeoff.done) {
        // in the model's own space, so the intro moving the whole model does not count
        var hy = hips ? model.worldToLocal(hips.getWorldPosition(va)).y : takeoff.standY;
        if (!takeoff.started) { takeoff.started = now; takeoff.low = Infinity; }
        takeoff.low = Math.min(takeoff.low, hy);
        var dipped = takeoff.low < takeoff.standY - 0.08 * takeoff.scale * height;
        if ((dipped && hy > takeoff.low + 0.015 * takeoff.scale * height) || now - takeoff.started > 4000) takeoff.done = true;
        else holdHome = true;
      }
      if (route !== 'home') { takeoff.done = false; takeoff.started = 0; }
      // eased by time, not frames, so slow devices change pose just as quickly
      for (var key in weights) {
        var goal = route === key && !(key === 'home' && holdHome) ? 1 : 0;
        weights[key] += (goal - weights[key]) * Math.min(1, dt * (key === 'home' && takeoff.done ? 4 : 3));
      }
      // Zeus stands on contact; the throne stays unloaded.
      if (route === 'contact' && window.__wantThrone) loadThrone();
      var t = performance.now() / 1000;
      if (weights.home > 0.001) rig.position.y += weights.home * height * (0.32 + 0.025 * Math.sin(t * 1.3));
      rig.updateWorldMatrix(true, true);
      if (weights.home > 0.001) poseRuler(weights.home);
      if (weights.contact > 0.001) poseThrone(weights.contact);
      for (var j = 0; j < bones.length; j++) written[j].copy(bones[j].quaternion);
      if (throne) {
        throne.scale.setScalar(throne.userData.k * Math.max(0.0001, weights.contact));
        throne.visible = weights.contact > 0.01;
      }
      return out;
    };

    window.__detective = { height: height, wings: wingsRoot, glitch: glitch, weights: weights, takeoff: takeoff };
  }
})();
