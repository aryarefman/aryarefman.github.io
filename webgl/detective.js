/*
 * The detective: gives the paper-mode character black angel wings that grow
 * from the shoulder blades and ride the upper spine. The wings are "Angel
 * Wings" by boooop on Sketchfab (CC BY 4.0).
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
      try { dress(exp, character.model); } catch (err) { console.warn('[detective]', err); }
      try { blankFiles(character); } catch (err) { console.warn('[detective]', err); }
    } else if (++tries > 400) {
      clearInterval(timer);
    }
  }, 50);

  /*
   * Blank case files: the ring of floating cards gets a dozen empty cards
   * between the real ones. They carry no case, cannot be opened, and show a
   * screen of static that tears and flickers.
   */
  var BLANKS = 12;
  var BLANK_MARK = 'blank-case-file';

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

    function makeScreen(Texture, like) {
      var canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 180;
      var tex = new Texture(canvas);
      if (like) {
        tex.colorSpace = like.colorSpace;
        tex.minFilter = like.minFilter; tex.magFilter = like.magFilter;
        tex.generateMipmaps = false;
      }
      var s = { canvas: canvas, ctx: canvas.getContext('2d'), tex: tex, next: 0 };
      draw(s);
      return s;
    }

    function draw(s) {
      var c = s.ctx, w = s.canvas.width, h = s.canvas.height;
      c.globalAlpha = 1;
      c.fillStyle = '#07070b';
      c.fillRect(0, 0, w, h);
      // static
      for (var i = 0; i < 900; i++) {
        var g = Math.random() * 70 | 0;
        c.fillStyle = 'rgb(' + g + ',' + g + ',' + (g + 8) + ')';
        c.fillRect(Math.random() * w | 0, Math.random() * h | 0, 1 + Math.random() * 3 | 0, 1);
      }
      // torn bands in red and cyan
      var bands = 2 + (Math.random() * 4 | 0);
      for (var k = 0; k < bands; k++) {
        var y = Math.random() * h, bh = 2 + Math.random() * 16, shift = (Math.random() - 0.5) * 60;
        c.globalAlpha = 0.35 + Math.random() * 0.45;
        c.fillStyle = Math.random() < 0.5 ? '#eb1716' : '#00ffea';
        c.fillRect(shift, y, w, bh);
        c.globalAlpha = 0.6;
        c.fillStyle = '#d8d6e0';
        c.fillRect(shift * -0.6 + Math.random() * w * 0.6, y + bh * 0.3, Math.random() * w * 0.4, 1);
      }
      // scanlines
      c.globalAlpha = 0.28;
      c.fillStyle = '#000';
      for (var l = 0; l < h; l += 3) c.fillRect(0, l, w, 1);
      // now and then the whole screen blows out
      if (Math.random() < 0.06) {
        c.globalAlpha = 0.5;
        c.fillStyle = '#eb1716';
        c.fillRect(0, 0, w, h);
      }
      c.globalAlpha = 1;
      s.tex.needsUpdate = true;
    }

    function dressBlanks() {
      var panels = character.panels || [];
      panels.forEach(function (m, i) {
        var data = m.userData && m.userData.case;
        if (!data || data.thumb !== BLANK_MARK) return;
        var mat = m.material;
        if (!mat || !mat.map) return;
        if (!screens.length) {
          for (var n = 0; n < 3; n++) screens.push(makeScreen(mat.map.constructor, mat.map));
        }
        m.userData.blank = true;
        delete m.userData.case; // nothing to open, no name to report on hover
        mat.map = screens[i % screens.length].tex;
        mat.needsUpdate = true;
      });
    }

    (function flicker(now) {
      for (var i = 0; i < screens.length; i++) {
        var s = screens[i];
        if (now >= s.next) {
          draw(s);
          s.next = now + 60 + Math.random() * 140;
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
    var footL = bone('foot.L');
    var breastL = bone('breast.L');
    var breastR = bone('breast.R');
    if (!chest || !head || !breastL || !breastR || !footL) return;

    // Borrow the scene's three.js classes.
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
    var pFoot = wp(footL);
    var pFront = wp(breastL).add(wp(breastR)).multiplyScalar(0.5);
    var up = V().subVectors(pHead, pChest).normalize();
    var forward = V().subVectors(pFront, pChest);
    forward.sub(up.clone().multiplyScalar(forward.dot(up))).normalize();
    var back = forward.clone().negate();
    var side = V().crossVectors(up, back).normalize();
    var height = Math.max(pHead.distanceTo(pFoot), 0.001);

    // Parent `obj` to `parentBone`, placing it in world space at `pos` with
    // the basis (x, y, z).
    function mount(obj, parentBone, pos, x, y, z) {
      var world = new T.Matrix4().makeBasis(x, y, z).setPosition(pos);
      var local = new T.Matrix4().copy(parentBone.matrixWorld).invert().multiply(world);
      local.decompose(obj.position, obj.quaternion, obj.scale);
      parentBone.add(obj);
    }

    // ---------- wings ----------
    // "Angel Wings" by boooop on Sketchfab (CC BY 4.0), dyed black. The model
    // holds one group per wing; each hangs from its own pivot at the wing root
    // so the two can beat. Frame: x away from the spine, y up, z back.
    var WING_URL = '/webgl/models/wings/angel-wings.glb';
    var WING_DROP = 0.6; // root to the lowest feather, in character heights
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
    var wingPos = pBlades.addScaledVector(back, 0.08 * height);
    mount(wingsRoot, upperChest || chest, wingPos, side, up, back);

    var loader = exp.resources && exp.resources.loaders && exp.resources.loaders.gltfLoader;
    if (loader) {
      loader.load(WING_URL, function (gltf) {
        try { hangWings(gltf.scene); } catch (err) { console.warn('[detective] wings', err); }
      });
    }

    function boxOf(obj) {
      var min = V(Infinity, Infinity, Infinity), max = V(-Infinity, -Infinity, -Infinity);
      obj.traverse(function (o) {
        if (!o.isMesh) return;
        var pos = o.geometry.attributes.position;
        var v = V();
        // a sparse sample is plenty for a bounding box
        var step = Math.max(1, Math.floor(pos.count / 2000));
        for (var i = 0; i < pos.count; i += step) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          min.min(v); max.max(v);
        }
      });
      return { min: min, max: max };
    }

    function hangWings(scene) {
      scene.updateMatrixWorld(true);
      // the two wing groups are the nodes that own the meshes' parents
      var groups = [];
      scene.traverse(function (o) {
        if (o.isMesh && o.parent && groups.indexOf(o.parent) < 0) groups.push(o.parent);
      });
      var all = boxOf(scene);
      var reach = all.max.y - all.min.y;
      groups.forEach(function (g) {
        var box = boxOf(g);
        var mirror = (box.min.x + box.max.x) > 0 ? 1 : -1;
        // the root is the inner top edge of the wing's bony arm
        var arm = null;
        g.children.forEach(function (c) { if (c.isMesh && /wing/i.test(c.name)) arm = c; });
        var armBox = arm ? boxOf(arm) : box;
        var root = V(mirror > 0 ? armBox.min.x : armBox.max.x, (armBox.min.y + armBox.max.y) / 2, (armBox.min.z + armBox.max.z) / 2);
        var k = (WING_DROP * height) / Math.max(root.y - all.min.y, reach * 0.5);
        var holder = new T.Object3D();
        holder.scale.setScalar(k);
        g.children.slice().forEach(function (c) {
          if (!c.isMesh) return;
          c.matrixWorld.decompose(c.position, c.quaternion, c.scale);
          c.position.sub(root);
          c.castShadow = true;
          c.frustumCulled = false;
          var mats = Array.isArray(c.material) ? c.material : [c.material];
          c.material = mats.map(function (m) {
            var d = m.clone();
            d.color.set(/feather/i.test(m.name) ? 0x1c1c22 : 0x0d0d11);
            if ('roughness' in d) { d.roughness = 0.75; d.metalness = 0.05; }
            // the model glows grey on its own; a fallen angel's feathers do not
            if (d.emissive) { d.emissive.set(0x000000); d.emissiveMap = null; d.emissiveIntensity = 0; }
            if ('sheen' in d) { d.sheen = 0; d.clearcoat = 0; }
            d.transparent = false;
            d.alphaTest = 0.45;
            d.depthWrite = true;
            d.side = 2; // DoubleSide
            d.needsUpdate = true;
            return d;
          });
          if (c.material.length === 1) c.material = c.material[0];
          holder.add(c);
        });
        var pivot = wingPivots[mirror > 0 ? 0 : 1];
        pivot.add(holder);
      });
    }

    saved.forEach(function (s) {
      s[0].position.copy(s[1]);
      s[0].quaternion.copy(s[2]);
      s[0].scale.copy(s[3]);
    });
    model.updateMatrixWorld(true);

    // ---------- motion ----------
    // On the close-up routes the camera sits right beside the character, so the
    // wings shrink away behind the back instead of filling the frame.
    var CLOSE = /^(about|contact|case-inner)$/;
    var character = exp.world.character;
    var isClose = function () { return CLOSE.test(character.currentRoute || ''); };
    var fold = isClose() ? 1 : 0;
    var baseScale = wingsRoot.scale.clone();
    var t0 = performance.now();
    var last = t0;
    function tick() {
      var now = performance.now();
      var t = (now - t0) / 1000;
      var dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      fold += ((isClose() ? 1 : 0) - fold) * Math.min(1, dt * 2.5);
      var beat = Math.sin(t * 1.15) * (1 - 0.6 * fold);
      var k = 1 - 0.92 * fold;
      wingsRoot.scale.copy(baseScale).multiplyScalar(k);
      for (var i = 0; i < wingPivots.length; i++) {
        var p = wingPivots[i];
        var m = p.userData.mirror;
        p.rotation.set(0.05 * beat - 0.25 * fold, -m * (0.1 + 0.08 * beat + 0.4 * fold), m * (0.06 * beat + 0.2 * fold));
      }
      requestAnimationFrame(tick);
    }
    tick();

    window.__detective = { height: height, wings: wingsRoot };
  }
})();
