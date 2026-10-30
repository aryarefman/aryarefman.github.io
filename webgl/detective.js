/*
 * The detective: dresses the paper-mode character as a fallen consulting
 * detective. Black angel wings ride the chest bone, a deerstalker sits on the
 * head bone and a magnifying glass is held in the right hand.
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
    } else if (++tries > 400) {
      clearInterval(timer);
    }
  }, 50);

  function dress(exp, model) {
    // GLTFLoader drops the dots from node names: 'spine.003' arrives as 'spine003'.
    var bone = function (name) { return model.getObjectByName(name) || model.getObjectByName(name.replace(/\./g, '')); };
    var chest = bone('spine.003');
    var neck = bone('spine.005');
    var head = bone('spine.006');
    var handR = bone('hand.R');
    var footL = bone('foot.L');
    var breastL = bone('breast.L');
    var breastR = bone('breast.R');
    if (!chest || !head || !breastL || !breastR || !footL) return;

    // Borrow the scene's three.js classes.
    var skinned = null;
    var refMaterial = null;
    model.traverse(function (o) {
      if (o.isSkinnedMesh && !skinned) skinned = o;
      if (o.isMesh && (!refMaterial || o.name === 'Hood')) {
        var m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (m && m.isMeshStandardMaterial) refMaterial = m;
      }
    });
    if (!skinned || !refMaterial) return;
    var T = {
      Object3D: model.constructor,
      Mesh: Object.getPrototypeOf(skinned.constructor.prototype).constructor,
      Geometry: skinned.geometry.constructor,
      Attribute: skinned.geometry.attributes.position.constructor,
      Vector3: model.position.constructor,
      Quaternion: model.quaternion.constructor,
      Matrix4: model.matrixWorld.constructor
    };
    if (typeof T.Mesh !== 'function') return;
    if (T.Attribute.prototype.isInterleavedBufferAttribute) return;

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

    function material(color, opts) {
      var m = refMaterial.clone();
      m.name = 'Detective';
      m.map = null; m.normalMap = null; m.roughnessMap = null; m.metalnessMap = null;
      m.emissiveMap = null; m.aoMap = null; m.alphaMap = null;
      m.color.set(color);
      m.emissive.set(0x000000);
      m.emissiveIntensity = 0;
      m.roughness = 0.6; m.metalness = 0.05;
      m.transparent = false; m.opacity = 1;
      m.side = 2; // DoubleSide
      if (m.isMeshPhysicalMaterial) { m.clearcoat = 0; m.sheen = 0; m.transmission = 0; m.iridescence = 0; }
      if (opts) for (var k in opts) m[k] = opts[k];
      m.needsUpdate = true;
      return m;
    }

    function mesh(positions, indices, mat) {
      var g = new T.Geometry();
      g.setAttribute('position', new T.Attribute(new Float32Array(positions), 3));
      g.setIndex(indices);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      var m = new T.Mesh(g, mat);
      m.castShadow = true;
      m.frustumCulled = false;
      return m;
    }

    // Parent `obj` to `parentBone`, placing it in world space at `pos` with
    // the basis (x, y, z).
    function mount(obj, parentBone, pos, x, y, z) {
      var world = new T.Matrix4().makeBasis(x, y, z).setPosition(pos);
      var local = new T.Matrix4().copy(parentBone.matrixWorld).invert().multiply(world);
      local.decompose(obj.position, obj.quaternion, obj.scale);
      parentBone.add(obj);
    }

    // ---------- wings ----------
    // Built in a frame where x points away from the spine, y up and z back,
    // with lengths in units of the character's height.
    function featherInto(P, I, base, dir, len, width, zLift) {
      var segs = 7;
      var start = P.length / 3;
      var px = -dir[1], py = dir[0];
      for (var s = 0; s <= segs; s++) {
        var t = s / segs;
        // quill at the base, full vane in the middle, rounded tip
        var u = Math.max(0, (t - 0.2) / 0.8);
        var w = width * Math.min(1, 0.25 + t / 0.2) * Math.sqrt(Math.max(0, 1 - Math.pow(u, 3)));
        var cx = base[0] + dir[0] * len * t;
        var cy = base[1] + dir[1] * len * t;
        var cz = base[2] + zLift + 0.05 * len * t * t; // tips curl backwards
        P.push(cx + px * w, cy + py * w, cz + 0.004 * len);
        P.push(cx - px * w, cy - py * w, cz - 0.004 * len);
      }
      for (var k = 0; k < segs; k++) {
        var a = start + k * 2;
        I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    // Leading edge of the wing, from the shoulder blade out to the tip.
    var arm = [[0, 0, 0], [0.08, 0.2, 0.04], [0.2, 0.36, 0.1], [0.35, 0.45, 0.16], [0.5, 0.44, 0.22]];
    function along(s) {
      var f = s * (arm.length - 1);
      var i = Math.min(arm.length - 2, Math.floor(f));
      var t = f - i;
      return [0, 1, 2].map(function (k) { return arm[i][k] + (arm[i + 1][k] - arm[i][k]) * t; });
    }

    function buildWing(mirror) {
      var P = [], I = [];
      var rows = [
        // count, length near body, length at tip, width, depth offset, start
        { n: 34, l0: 0.3, l1: 0.56, w: 0.04, z: 0.0, s0: 0.04 },
        { n: 28, l0: 0.19, l1: 0.3, w: 0.038, z: -0.012, s0: 0.02 },
        { n: 22, l0: 0.1, l1: 0.14, w: 0.034, z: -0.022, s0: 0.0 }
      ];
      rows.forEach(function (r, ri) {
        for (var i = 0; i < r.n; i++) {
          var s = r.s0 + (1 - r.s0) * (i / (r.n - 1));
          var base = along(Math.min(1, s * (ri === 0 ? 1 : 0.94)));
          var ang = (-100 + 66 * Math.pow(s, 1.25)) * Math.PI / 180;
          var len = (r.l0 + (r.l1 - r.l0) * Math.pow(s, 1.2)) * (1 + 0.05 * Math.sin(i * 2.3 + ri));
          featherInto(P, I, base, [Math.cos(ang), Math.sin(ang)], len, r.w, r.z + i * 0.0006);
        }
      });
      for (var v = 0; v < P.length; v += 3) {
        P[v] *= height * mirror;
        P[v + 1] *= height;
        P[v + 2] *= height;
      }
      if (mirror < 0) {
        for (var j = 0; j < I.length; j += 3) { var tmp = I[j]; I[j] = I[j + 1]; I[j + 1] = tmp; }
      }
      return P.length ? { P: P, I: I } : null;
    }

    var featherMat = material(0x030304, { roughness: 0.62, metalness: 0.1, envMapIntensity: 0.2 });
    var wingsRoot = new T.Object3D();
    wingsRoot.name = 'DetectiveWings';
    var wingPivots = [];
    [1, -1].forEach(function (mirror) {
      var data = buildWing(mirror);
      var pivot = new T.Object3D();
      pivot.position.set(0.045 * height * mirror, 0, 0);
      pivot.add(mesh(data.P, data.I, featherMat));
      pivot.userData.mirror = mirror;
      wingsRoot.add(pivot);
      wingPivots.push(pivot);
    });
    var wingPos = pChest.clone().addScaledVector(back, 0.075 * height).addScaledVector(up, 0.06 * height);
    mount(wingsRoot, chest, wingPos, side, up, back);

    // ---------- deerstalker ----------
    var pNeck = neck ? wp(neck) : pChest;
    var headUp = V().subVectors(pHead, pNeck).normalize();
    var headFwd = forward.clone().sub(headUp.clone().multiplyScalar(forward.dot(headUp))).normalize();
    var headSide = V().crossVectors(headUp, headFwd).normalize();
    var hs = 0.115 * height; // head size
    var hat = new T.Object3D();
    hat.name = 'DetectiveHat';
    var tweed = material(0x4a3a28, { roughness: 0.95, metalness: 0 });
    var tweedDark = material(0x2f2418, { roughness: 0.95, metalness: 0 });

    // Crown: a squashed dome, longer front to back. Local axes: x side, y up, z front.
    (function () {
      var P = [], I = [], rings = 10, segs = 28;
      for (var r = 0; r <= rings; r++) {
        var phi = (r / rings) * Math.PI / 2;
        for (var s = 0; s <= segs; s++) {
          var th = (s / segs) * Math.PI * 2;
          P.push(Math.cos(th) * Math.cos(phi) * 0.6 * hs, Math.sin(phi) * 0.55 * hs, Math.sin(th) * Math.cos(phi) * 0.68 * hs);
        }
      }
      for (var r2 = 0; r2 < rings; r2++) {
        for (var s2 = 0; s2 < segs; s2++) {
          var a = r2 * (segs + 1) + s2, b = a + segs + 1;
          I.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      hat.add(mesh(P, I, tweed));
      // seams running over the top, front to back and side to side
      [0, Math.PI / 2].forEach(function (rot) {
        var Q = [], J = [];
        for (var k = 0; k <= 16; k++) {
          var ph = (k / 16) * Math.PI;
          var c = Math.cos(ph), sn = Math.sin(ph);
          var x = rot ? c * 0.605 * hs : 0, z = rot ? 0 : c * 0.685 * hs, y = sn * 0.555 * hs;
          var wx = rot ? 0 : 0.012 * hs, wz = rot ? 0.012 * hs : 0;
          Q.push(x - wx, y, z - wz, x + wx, y, z + wz);
          if (k < 16) J.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
        }
        hat.add(mesh(Q, J, tweedDark));
      });
    })();

    // Front and back peaks.
    [1, -1].forEach(function (dirZ) {
      var P = [0, -0.02 * hs, 0], I = [], n = 16;
      for (var i = 0; i <= n; i++) {
        var th = Math.PI * (i / n);
        var x = Math.cos(th) * 0.5 * hs;
        var z = dirZ * (0.6 * hs + Math.sin(th) * 0.32 * hs);
        P.push(x, -0.02 * hs - Math.sin(th) * 0.07 * hs, z);
        if (i < n) I.push(0, i + 1, i + 2);
      }
      hat.add(mesh(P, I, tweedDark));
    });

    // Ear flaps tied up over the crown, with the bow on top.
    [1, -1].forEach(function (dirX) {
      var x0 = dirX * 0.6 * hs, x1 = dirX * 0.3 * hs;
      hat.add(mesh([
        x0, 0.02 * hs, -0.22 * hs, x0, 0.02 * hs, 0.22 * hs,
        x1, 0.5 * hs, 0.16 * hs, x1, 0.5 * hs, -0.16 * hs
      ], [0, 1, 2, 0, 2, 3], tweedDark));
    });
    hat.add(mesh([
      -0.16 * hs, 0.6 * hs, -0.05 * hs, 0, 0.56 * hs, 0, -0.16 * hs, 0.6 * hs, 0.05 * hs,
      0.16 * hs, 0.6 * hs, -0.05 * hs, 0, 0.56 * hs, 0, 0.16 * hs, 0.6 * hs, 0.05 * hs
    ], [0, 1, 2, 3, 5, 4], tweedDark));

    var hatPos = pHead.clone().addScaledVector(headUp, 0.78 * hs).addScaledVector(headFwd, -0.05 * hs);
    var hatTilt = headFwd.clone().multiplyScalar(Math.cos(0.12)).addScaledVector(headUp, -Math.sin(0.12)).normalize();
    var hatUp = V().crossVectors(hatTilt, headSide).normalize();
    mount(hat, head, hatPos, headSide, hatUp, hatTilt);

    // ---------- magnifying glass ----------
    if (handR) {
      var glass = new T.Object3D();
      glass.name = 'DetectiveGlass';
      var brass = material(0x9c7a3c, { roughness: 0.35, metalness: 0.8 });
      var handle = material(0x241810, { roughness: 0.7 });
      var lensMat = material(0xbfd6e6, { roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.25 });
      var g = 0.05 * height;
      // handle: an eight-sided tube along +y
      (function () {
        var P = [], I = [], n = 8;
        for (var e = 0; e <= 1; e++) for (var i = 0; i < n; i++) {
          var th = (i / n) * Math.PI * 2;
          P.push(Math.cos(th) * 0.07 * g, e * 1.1 * g, Math.sin(th) * 0.07 * g);
        }
        for (var j = 0; j < n; j++) { var k = (j + 1) % n; I.push(j, n + j, k, k, n + j, n + k); }
        glass.add(mesh(P, I, handle));
      })();
      // brass rim: a flat ring in the x-y plane above the handle
      (function () {
        var P = [], I = [], n = 32, cy = 1.1 * g + 0.62 * g;
        for (var i = 0; i <= n; i++) {
          var th = (i / n) * Math.PI * 2;
          var c = Math.cos(th), s = Math.sin(th);
          P.push(c * 0.62 * g, cy + s * 0.62 * g, 0.05 * g, c * 0.72 * g, cy + s * 0.72 * g, 0.05 * g,
                 c * 0.62 * g, cy + s * 0.62 * g, -0.05 * g, c * 0.72 * g, cy + s * 0.72 * g, -0.05 * g);
          if (i < n) {
            var a = i * 4, b = a + 4;
            I.push(a, a + 1, b, a + 1, b + 1, b, a + 2, b + 2, a + 3, a + 3, b + 2, b + 3,
                   a + 1, a + 3, b + 1, a + 3, b + 3, b + 1, a, b, a + 2, a + 2, b, b + 2);
          }
        }
        glass.add(mesh(P, I, brass));
        var L = [0, cy, 0], J = [];
        for (var q = 0; q <= n; q++) {
          var t2 = (q / n) * Math.PI * 2;
          L.push(Math.cos(t2) * 0.63 * g, cy + Math.sin(t2) * 0.63 * g, 0);
          if (q < n) J.push(0, q + 1, q + 2);
        }
        var lens = mesh(L, J, lensMat);
        lens.castShadow = false;
        glass.add(lens);
      })();
      handR.add(glass);
      // The hand bone's +y runs toward the fingers; hold the glass across the palm.
      var hScale = handR.getWorldScale(V());
      glass.scale.set(1 / hScale.x, 1 / hScale.y, 1 / hScale.z);
      glass.position.set(0.02 * height / hScale.x, 0.045 * height / hScale.y, 0);
      glass.rotation.set(0, 0, -Math.PI / 2);
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

    window.__detective = { height: height, wings: wingsRoot, hat: hat };
  }
})();
