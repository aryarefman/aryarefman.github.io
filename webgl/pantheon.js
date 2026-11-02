/*
 * The pantheon: a different winged figure on every route.
 *
 *   home        the Demon Knight        + a dragon looming in the clouds
 *   cases       the Six-Winged Archangel
 *   case-inner  the Norse Valkyrie
 *   about       the Ember-Winged Fallen Angel
 *   contact     Zeus
 *
 * The figures are sculpts without skeletons. Each stands where the scene's
 * own (now hidden) body is: it rises with it on the home take-off, crouches
 * with it, and turns to face the route's camera. Swaps between routes are a
 * dithered fade with a gold flare.
 *
 * Credits: webgl/models/pantheon/CREDITS.md
 *
 * The scene bundle keeps its own copy of three.js, so this file borrows the
 * constructors from objects already in the scene instead of importing another.
 */
(function () {
  'use strict';

  var P = '/webgl/models/pantheon/', R = '/webgl/models/seraphs/', NONE = /^none$/;
  var FIGURES = {
    // k: height against the original body; anchor: the part of the figure
    // (0 = feet, 1 = top) that sits on the body's hips; yaw: turn so the
    // figure's face looks along +z; fix: stand the model up first
    // rigged winged figures: they take the body's pose on every route
    archon: { url: R + 'archon.glb', rig: true, k: 1.0, mount: { url: R + 'horse.glb', yaw: 1.4, seat: 0.98, lift: 0.0, rear: 0.6, back: 0.42 }, swordUp: true, calmLeft: true, sword: /^archangellightwarchangellightbody0?$/, wings: /^bonewing(l|r)(u|d)00$/, wingScale: 1.4, lift: 0x5c5a56 },
    // a crimson-winged warrior
    pieta: { url: R + 'pieta.glb', rig: true, k: 1.0, rise: 0.08, push: 1.1, pointAt: true, bones: {
      pelvis: /^spinepelvisjnt$/, spine: /^spineajnt$/, spine1: /^spinecjnt$/, spine2: /^spineejnt$/, neck: /^neckajnt$/, head: /^headjnt$/,
      lclav: /^larmclaviclejnt$/, lupper: /^larmshoulderjnt$/, lfore: /^larmelbowjnt$/, lhand: /^larmwristjnt$/,
      rclav: /^rarmclaviclejnt$/, rupper: /^rarmshoulderjnt$/, rfore: /^rarmelbowjnt$/, rhand: /^rarmwristjnt$/,
      lthigh: /^lleghipjnt$/, lcalf: /^llegkneejnt$/, lfoot: /^lleganklejnt$/, ltoe: NONE,
      rthigh: /^rleghipjnt$/, rcalf: /^rlegkneejnt$/, rfoot: /^rleganklejnt$/, rtoe: NONE } },
    // the blue-winged angel warrior
    aurora: { url: R + 'aurora.glb', rig: true, k: 1.0 },
    // Tekken's winged Jin: his rig names bones its own way
    jin: { url: R + 'jin.glb', rig: true, k: 0.8, wingAmp: 0.6, rise: 0.27, push: 0.3, bones: {
      pelvis: /^roothips$/, spine: /^spinelower$/, spine1: /^spineupper$/, spine2: /^none$/, neck: /^headnecklower$/, head: /^headneckupper$/,
      lclav: /^armleftshoulder1$/, lupper: /^armleftshoulder2$/, lfore: /^armleftelbow$/, lhand: /^armleftwrist$/,
      rclav: /^armrightshoulder1$/, rupper: /^armrightshoulder2$/, rfore: /^armrightelbow$/, rhand: /^armrightwrist$/,
      lthigh: /^legleftthigh$/, lcalf: /^legleftknee$/, lfoot: /^legleftankle$/, ltoe: /^leglefttoes$/,
      rthigh: /^legrightthigh$/, rcalf: /^legrightknee$/, rfoot: /^legrightankle$/, rtoe: /^legrighttoes$/ } },
    ophanim: { url: R + 'ophanim.glb', rig: true, k: 1.0 }
  };
  var ROUTES = { home: 'archon', cases: 'jin', 'case-inner': 'aurora', about: 'pieta', contact: 'ophanim' };
  var FIRST = 'archon';
  var USE_DRAGON = false;
  // the dragon behind home: distance back and height (in body heights), size, head tilt, eye size
  var DRAGON = { dist: 7.5, screenY: 0.98, size: 1.0, tilt: 0.35, eye: 0.06, eyeX: 0.062, eyeY: -0.055 };

  var tries = 0;
  var timer = setInterval(function () {
    var exp = window.experience;
    var character = exp && exp.world && exp.world.character;
    if (character && character.model && window.__detective) {
      clearInterval(timer);
      try { start(exp, character); } catch (err) { console.warn('[pantheon]', err); }
    } else if (++tries > 600) {
      clearInterval(timer);
    }
  }, 50);

  function start(exp, character) {
    var model = character.model;
    var T = {
      Object3D: model.constructor,
      Vector3: model.position.constructor,
      Quaternion: model.quaternion.constructor,
      Box3: null
    };
    var V = function (x, y, z) { return new T.Vector3(x || 0, y || 0, z || 0); };
    var bone = function (n) { return model.getObjectByName(n) || model.getObjectByName(n.replace(/\./g, '')); };

    // ---------- the original body: measured once, then hidden ----------
    var skinned = null;
    model.traverse(function (o) { if (o.isSkinnedMesh && !skinned) skinned = o; });
    if (!skinned) return;
    var hips = bone('spine'), head = bone('spine.006'), footL = bone('foot.L'), footR = bone('foot.R');
    var saved = skinned.skeleton.bones.map(function (b) { return [b.position.clone(), b.quaternion.clone(), b.scale.clone()]; });
    skinned.skeleton.pose();
    model.updateMatrixWorld(true);
    var footY = (footL.getWorldPosition(V()).y + footR.getWorldPosition(V()).y) / 2;
    var bodyHeight = head.getWorldPosition(V()).y - footY;
    var restHipsY = hips.getWorldPosition(V()).y;
    var restScale = model.getWorldScale(V()).y;
    skinned.skeleton.bones.forEach(function (b, i) { b.position.copy(saved[i][0]); b.quaternion.copy(saved[i][1]); b.scale.copy(saved[i][2]); });
    model.updateMatrixWorld(true);

    model.traverse(function (o) {
      if (!o.isMesh) return;
      var p = o, onRig = !!o.isSkinnedMesh;
      while (p && !onRig) { if (p.isBone || p.name === 'metarig') onRig = true; p = p.parent; }
      if (onRig) o.visible = false;
    });

    var loader = exp.resources && exp.resources.loaders && exp.resources.loaders.gltfLoader;
    if (!loader) return;
    var holder = new T.Object3D();
    holder.name = 'Pantheon';
    exp.scene.add(holder);

    // ---------- loading and standing each figure up ----------
    var figures = {};
    function bounds(obj) {
      obj.updateMatrixWorld(true);
      var min = V(Infinity, Infinity, Infinity), max = V(-Infinity, -Infinity, -Infinity), v = V();
      obj.traverse(function (o) {
        if (!o.isMesh) return;
        var pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 20000));
        for (var i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); min.min(v); max.max(v); }
      });
      return { min: min, max: max };
    }
    function load(key) {
      if (figures[key]) return figures[key];
      var f = figures[key] = { key: key, ready: false, presence: 0, spec: FIGURES[key], yaw: null };
      loader.load(f.spec.url, function (gltf) {
        try { if (f.spec.rig) rigStand(f, gltf); else stand(f, gltf.scene); } catch (err) { console.warn('[pantheon] ' + key, err); }
      });
      return f;
    }
    function stand(f, scene) {
      var spec = f.spec;
      var inner = new T.Object3D();
      inner.add(scene);
      inner.rotation.y = spec.yaw;
      var b = bounds(inner);
      var h = Math.max(b.max.y - b.min.y, 1e-6);
      // feet at 0, centred, one unit tall
      var norm = new T.Object3D();
      norm.add(inner);
      inner.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      norm.scale.setScalar(1 / h);
      var root = new T.Object3D();
      root.name = 'Figure_' + f.key;
      root.add(norm);
      holder.add(root);
      f.materials = [];
      scene.traverse(function (o) {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        var list = Array.isArray(o.material) ? o.material : [o.material];
        list.forEach(function (m) {
          if (!m) return;
          m.alphaHash = false;
          m.transparent = false;
          m.side = 2; // the simplified meshes have some flipped faces
          m.depthWrite = true;
          if (m.emissive && spec.glow) { m.emissive.setHex(spec.glow); }
          if (spec.tint && m.color) { m.color.setHex(spec.tint); if ('roughness' in m) m.roughness = 0.55; }
          // a soft inner light, for a figure the scene's lamps only graze
          if (spec.lift && m.emissive) { m.emissive.setHex(spec.lift); if (m.map && !m.emissiveMap) m.emissiveMap = m.map; }
          m.userData.stageKeep = true;
          m.needsUpdate = true;
          f.materials.push(m);
        });
      });
      f.root = root;
      root.visible = false;
      f.ready = true;
    }


    // ---------- rigged figures: they take the original body's pose ----------
    // Every frame the hidden body is posed by the scene (the take-off, the
    // reach toward the lens, the dive, the throne). Each rigged figure copies
    // that pose bone by bone: first its rest pose is bent to match the body's
    // rest (so a T-pose and an A-pose agree), then each frame every mapped
    // bone takes the same world-space turn from rest as its body bone.
    var Q = model.quaternion.constructor, M4 = model.matrix.constructor;
    var ROLES = [
      // role, body bone, target bone pattern (names lower-cased, non-alphanumerics and node suffixes dropped)
      ['pelvis', 'spine', /pelvis$/],
      ['spine', 'spine.001', /(bip0?0?1spine|waist)$/],
      ['spine1', 'spine.002', /(spine1|spine01)$/],
      ['spine2', 'spine.003', /(spine2|spine02)$/],
      ['neck', 'spine.004', /neck$/],
      ['head', 'spine.006', /head$/],
      ['lclav', 'shoulder.L', /lclavicle$/], ['lupper', 'upper_arm.L', /l(upperarm|shoulder)$/], ['lfore', 'forearm.L', /l(forearm|elbow)$/], ['lhand', 'hand.L', /lhand$/],
      ['rclav', 'shoulder.R', /rclavicle$/], ['rupper', 'upper_arm.R', /r(upperarm|shoulder)$/], ['rfore', 'forearm.R', /r(forearm|elbow)$/], ['rhand', 'hand.R', /rhand$/],
      ['lthigh', 'thigh.L', /l(thigh|hip)$/], ['lcalf', 'shin.L', /l(calf|kneelower)$/], ['lfoot', 'foot.L', /lfoot$/], ['ltoe', 'toe.L', /l(toe0|toebase|toe)$/],
      ['rthigh', 'thigh.R', /r(thigh|hip)$/], ['rcalf', 'shin.R', /r(calf|kneelower)$/], ['rfoot', 'foot.R', /rfoot$/], ['rtoe', 'toe.R', /r(toe0|toebase|toe)$/]
    ];
    // the bones each role points toward, for matching rest directions
    var NEXT = { pelvis: ['spine', 'spine1', 'spine2', 'neck', 'head'], spine: ['spine1', 'spine2', 'neck', 'head'], spine1: ['spine2', 'neck', 'head'],
      spine2: ['neck', 'head'], neck: ['head'], lclav: ['lupper'], lupper: ['lfore'], lfore: ['lhand'], rclav: ['rupper'], rupper: ['rfore'], rfore: ['rhand'],
      lthigh: ['lcalf'], lcalf: ['lfoot'], lfoot: ['ltoe'], rthigh: ['rcalf'], rcalf: ['rfoot'], rfoot: ['rtoe'] };
    var LIFE = {
      spine1: [0.022, 0.0, 0.0], spine2: [0.018, 0.0, -0.35], neck: [0.012, 0.03, -0.7], head: [0.02, 0.07, -1.0],
      lclav: [0.02, 0.0, -0.2], rclav: [-0.02, 0.0, -0.2], lupper: [0.03, 0.0, 0.6], rupper: [0.03, 0.0, 1.4], lfore: [0.03, 0.0, 0.9], rfore: [0.03, 0.0, 1.7]
    };
    var normName = function (n) { return String(n || '').replace(/_\d+$/, '').toLowerCase().replace(/[^a-z0-9]/g, ''); };

    // the body's rest, kept in the model's own space
    var srcBones = {}, srcRestQ = {}, srcRestP = {};
    (function () {
      var keep = skinned.skeleton.bones.map(function (b) { return [b.position.clone(), b.quaternion.clone(), b.scale.clone()]; });
      skinned.skeleton.pose();
      model.updateMatrixWorld(true);
      var mq = model.getWorldQuaternion(new Q()).invert();
      ROLES.forEach(function (r) {
        var b = bone(r[1]);
        if (!b) return;
        srcBones[r[0]] = b;
        srcRestQ[r[0]] = mq.clone().multiply(b.getWorldQuaternion(new Q()));
        srcRestP[r[0]] = model.worldToLocal(b.getWorldPosition(V()));
      });
      skinned.skeleton.bones.forEach(function (b, i) { b.position.copy(keep[i][0]); b.quaternion.copy(keep[i][1]); b.scale.copy(keep[i][2]); });
      model.updateMatrixWorld(true);
    })();
    var restHeight = srcRestP.head && srcRestP.lfoot ? srcRestP.head.y - (srcRestP.lfoot.y + srcRestP.rfoot.y) / 2 : 1;

    function basis(P) {
      var up = P.head.clone().sub(P.pelvis).normalize();
      var lr = P.lupper.clone().sub(P.rupper);
      var fwd = V().crossVectors(lr, up).normalize();
      lr = V().crossVectors(up, fwd).normalize();
      return new M4().makeBasis(lr, up, fwd);
    }
    function setWorldQ(b, qw) {
      var pq = b.parent.getWorldQuaternion(new Q()).invert();
      b.quaternion.copy(pq.multiply(qw));
      b.updateMatrixWorld(true);
    }

    function aim(b, child, dirModel, mq, w) {
      var cur = child.getWorldPosition(V()).sub(b.getWorldPosition(V())).normalize();
      var want = dirModel.clone().normalize().applyQuaternion(mq);
      var turn = new Q().setFromUnitVectors(cur, want);
      if (w != null && w < 1) turn.slerp(new Q(), 1 - w);
      setWorldQ(b, turn.multiply(b.getWorldQuaternion(new Q())));
    }
    var mirror = new T.Object3D();
    mirror.name = 'BodyMirror';
    holder.add(mirror);
    function syncMirror() {
      model.updateMatrixWorld(true);
      model.matrixWorld.decompose(mirror.position, mirror.quaternion, mirror.scale);
      if (holder.parent) { holder.updateMatrixWorld(true); }
      mirror.updateMatrixWorld(true);
    }
    // Two-tone light, like the original scene's: the side turned one way burns
    // warm gold, the other side is lit icy blue, and the silhouette glows.
    var DUO = { warm: [1.0, 0.46, 0.2], cold: [0.22, 0.78, 1.0], mix: 0.85, rim: 0.95 };
    var GT = { value: 0 };
    function duotone(m, mixAmt, gU) {
      if (m.userData.duo) return;
      m.userData.duo = true;
      var amt = mixAmt == null ? DUO.mix : mixAmt;
      var v3 = function (a) { return 'vec3(' + a.join(',') + ')'; };
      var prev = m.onBeforeCompile;
      m.onBeforeCompile = function (sh, r) {
        if (prev) prev(sh, r);
        if (gU) { sh.uniforms.uGlitch = gU; sh.uniforms.uGT = GT; sh.fragmentShader = 'uniform float uGlitch;\nuniform float uGT;\n' + sh.fragmentShader; }
        var code = [
          '{',
          '  vec3 dn = normalize( normal );',
          '  float side = smoothstep( -0.65, 0.65, dn.x );',
          '  vec3 tone = mix( ' + v3(DUO.cold) + ', ' + v3(DUO.warm) + ', side );',
          '  float rim = pow( 1.0 - clamp( abs( dot( dn, normalize( vViewPosition ) ) ), 0.0, 1.0 ), 2.2 );',
          '  outgoingLight = outgoingLight * mix( vec3( 1.0 ), tone * 1.35, ' + amt.toFixed(2) + ' ) * ( 1.0 - 0.35 * rim ) + tone * rim * ' + DUO.rim.toFixed(2) + ';',
          '}'
        ].join('\n');
        if (gU) code += [
          '',
          'if ( uGlitch > 0.001 ) {',
          '  float row = floor( gl_FragCoord.y / 7.0 ), tick = floor( uGT * 18.0 );',
          '  float h = fract( sin( row * 12.9898 + tick * 78.233 ) * 43758.5453 );',
          '  float h2 = fract( sin( floor( gl_FragCoord.y / 37.0 ) * 4.1 + tick * 1.7 ) * 9631.17 );',
          '  if ( h < uGlitch * 0.95 - 0.02 || ( h2 < uGlitch * 0.5 && fract( gl_FragCoord.x / 90.0 + h2 ) < 0.5 ) ) discard;',
          '  float band = step( 0.5, fract( row * 0.37 + tick * 0.21 ) );',
          '  outgoingLight = mix( outgoingLight, outgoingLight * vec3( 0.35 + band, 0.6, 1.4 - band ) + vec3( band * 0.25, 0.08, ( 1.0 - band ) * 0.35 ), min( 1.0, uGlitch * 1.6 ) );',
          '}'].join('\n');
        if (sh.fragmentShader.indexOf('#include <opaque_fragment>') >= 0) sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', code + '\n#include <opaque_fragment>');
        else sh.fragmentShader = sh.fragmentShader.replace('#include <output_fragment>', code + '\n#include <output_fragment>');
      };
      m.customProgramCacheKey = function () { return 'duo' + amt + (gU ? 'g' : ''); };
      m.needsUpdate = true;
    }
    // ---------- a mount: the hero rides it on home ----------
    function loadMount(f, Mixer) {
      var ms = f.spec.mount;
      loader.load(ms.url, function (gltf) {
        try {
          var sc = gltf.scene, mroot = new T.Object3D(), inner = new T.Object3D();
          mroot.name = 'Mount_' + f.key; inner.add(sc); mroot.add(inner); mirror.add(mroot);
          var mixer = null;
          if (Mixer && gltf.animations && gltf.animations.length) { mixer = new Mixer(sc); mixer.clipAction(gltf.animations[0]).play(); mixer.update(0); }
          var bonesN = {};
          sc.traverse(function (o) { if (o.isBone) bonesN[normName(o.name)] = o; if (o.isMesh) o.frustumCulled = false; });
          mroot.updateMatrixWorld(true);
          var loc = function (o) { return mroot.worldToLocal(o.getWorldPosition(V())); };
          var head = bonesN.head, pel = bonesN.pelvis, seat = bonesN.mountpoint01 || bonesN.saddle;
          if (!head || !pel || !seat) { console.warn('[pantheon] mount has no seat'); return; }
          // its own forward (pelvis to head, level), and its feet
          var fw = loc(head).sub(loc(pel)); fw.y = 0; fw.normalize();
          // measure the posed mesh: its hooves, and the top of the saddle around the seat bone
          var seatP = loc(seat), feetY = Infinity, saddleY = -Infinity, pv = V(), span = 0;
          sc.traverse(function (o) {
            if (!o.isMesh) return;
            var pa = o.geometry.attributes.position;
            for (var i = 0; i < pa.count; i += 3) {
              pv.fromBufferAttribute(pa, i);
              if (o.isSkinnedMesh) o.applyBoneTransform(i, pv);
              pv.applyMatrix4(o.matrixWorld); mroot.worldToLocal(pv);
              if (pv.y < feetY) feetY = pv.y;
              span = Math.max(span, Math.abs(pv.z - seatP.z), Math.abs(pv.x - seatP.x));
            }
          });
          sc.traverse(function (o) {
            if (!o.isMesh) return;
            var pa = o.geometry.attributes.position;
            for (var i = 0; i < pa.count; i += 3) {
              pv.fromBufferAttribute(pa, i);
              if (o.isSkinnedMesh) o.applyBoneTransform(i, pv);
              pv.applyMatrix4(o.matrixWorld); mroot.worldToLocal(pv);
              if (Math.hypot(pv.x - seatP.x, pv.z - seatP.z) < span * 0.12 && pv.y > saddleY) saddleY = pv.y;
            }
          });
          var seatH = saddleY - feetY, seatUp = saddleY - seatP.y;
          var mats = [];
          sc.traverse(function (o) {
            if (!o.isMesh) return;
            o.castShadow = true; o.receiveShadow = true;
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
              if (!m) return;
              m.userData.stageKeep = true;
              if (m.metalness === 1 && !m.metalnessMap) { m.metalness = 0.1; m.roughness = Math.min(m.roughness, 0.75); }
              if (!f.mgU) f.mgU = { value: 1 };
              duotone(m, 0.55, f.mgU);
              m.transparent = false; m.opacity = 1; m.depthWrite = true;
              mats.push(m);
            });
          });
          f.mount = { root: mroot, inner: inner, mixer: mixer, seat: seat, stirL: bonesN.stirrup02l, stirR: bonesN.stirrup02r,
            fwd: fw, feetY: feetY, seatH: seatH, seatUp: seatUp,
            hind: [bonesN.toes02l, bonesN.toes02r].filter(Boolean),
            fore: ['upperarml', 'upperarmr', 'lowerarml', 'lowerarmr', 'handl', 'handr'].map(function (n) { var b = bonesN[n]; if (b) b.userData.base = b.quaternion.clone(); return b; }), mats: mats, ready: true };
          mroot.visible = false;
        } catch (e) { console.warn('[pantheon] mount', e); }
      });
    }
    function rigStand(f, gltf) {
      var spec = f.spec, scene = gltf.scene;
      var root = new T.Object3D(), align = new T.Object3D();
      root.name = 'Seraph_' + f.key;
      root.add(align); align.add(scene);
      // kept outside the body's own tree (its animation player would reach in),
      // on a stand-in that copies the body's transform every frame
      syncMirror();
      mirror.add(root);
      root.updateMatrixWorld(true);
      // find the target's bones by role
      var all = [];
      scene.traverse(function (o) { if (o.isBone) all.push(o); if (o.isMesh) o.frustumCulled = false; });
      var tb = {};
      ROLES.forEach(function (r) {
        var pat = (spec.bones && spec.bones[r[0]]) || r[2];
        var hits = all.filter(function (b) { return pat.test(normName(b.name)); });
        hits.sort(function (a, b) {
          return (/^bip/.test(normName(b.name)) ? 1 : 0) - (/^bip/.test(normName(a.name)) ? 1 : 0) || normName(a.name).length - normName(b.name).length;
        });
        if (hits.length && srcBones[r[0]]) tb[r[0]] = hits[0];
      });
      if (!tb.pelvis || !tb.head || !tb.lupper || !tb.rupper) { console.warn('[pantheon] no humanoid rig in ' + f.key); return; }
      // turn the whole figure so it faces the way the body faces
      var local = function (b) { return root.worldToLocal(b.getWorldPosition(V())); };
      var TP = { pelvis: local(tb.pelvis), head: local(tb.head), lupper: local(tb.lupper), rupper: local(tb.rupper) };
      var R = basis(srcRestP).multiply(basis(TP).invert());
      align.quaternion.setFromRotationMatrix(R);
      root.updateMatrixWorld(true);
      // as tall as the body (times the figure's own scale)
      var pl = local(tb.pelvis).y;
      var feet;
      if (tb.lfoot && tb.rfoot) feet = (local(tb.lfoot).y + local(tb.rfoot).y) / 2;
      else { var bb = bounds(scene); feet = root.worldToLocal(V(0, bb.min.y, 0)).y; } // robed, no legs: the hem
      var h = Math.max(local(tb.head).y - feet, 1e-6);
      if (window.__rigDebug) console.log('[pantheon] size ' + f.key + ' h=' + h + ' feet=' + feet + ' head=' + local(tb.head).y + ' rest=' + restHeight);
      root.scale.setScalar(restHeight / h * (spec.k || 1));
      root.updateMatrixWorld(true);
      // bend the rest pose to the body's rest pose, parents first
      var mqi = model.getWorldQuaternion(new Q()).invert();
      var restQ = {};
      ROLES.forEach(function (r) {
        var role = r[0], b = tb[role];
        if (!b) return;
        var next = (NEXT[role] || []).filter(function (n) { return tb[n] && srcRestP[n]; })[0];
        if (next) {
          var cur = tb[next].getWorldPosition(V()).sub(b.getWorldPosition(V())).normalize();
          var want = model.localToWorld(srcRestP[next].clone()).sub(model.localToWorld(srcRestP[role].clone())).normalize();
          var turn = new Q().setFromUnitVectors(cur, want);
          setWorldQ(b, turn.multiply(b.getWorldQuaternion(new Q())));
        }
        restQ[role] = mqi.clone().multiply(b.getWorldQuaternion(new Q()));
      });
      // wing chains: every wing bone (not single feathers), with its depth down the
      // wing and its side, for a gentle wave from shoulder to tip
      var wingRoots = [];
      var isWing = function (o) { return o && o.isBone && /wing/.test(normName(o.name)) && !/feather|tip|end$|twist/.test(normName(o.name)); };
      var pelX = local(tb.pelvis).x;
      all.forEach(function (b) {
        if (!isWing(b)) return;
        var d = 0, q = b.parent;
        while (q && q.isBone && /wing/.test(normName(q.name))) { d++; q = q.parent; }
        if (d > 4) return;
        // a bone sitting on the body's midline (one root for both wings) only carries its children
        var lp = local(b);
        var side = Math.abs(lp.x - pelX) < 0.02 * (local(tb.head).y - local(tb.pelvis).y) ? 0 : (lp.x >= pelX ? 1 : -1);
        b.userData.side = side; b.userData.depth = d; b.userData.baseQ = b.quaternion.clone();
        wingRoots.push(b);
      });
      wingRoots.sort(function (x, y) { return x.userData.depth - y.userData.depth; });
      // wings: bigger and spread wider
      var wings = [];
      if (spec.wings) all.forEach(function (b) { if (spec.wings.test(normName(b.name))) { b.scale.multiplyScalar(spec.wingScale || 1); wings.push(b); } });
      // the sword: a separate mesh standing upright beside the figure at rest;
      // each frame it is moved into the right hand, blade along the forearm
      var sword = null;
      if (spec.sword) {
        var sm = null;
        scene.traverse(function (o) { if (!sm && o.isMesh && spec.sword.test(normName(o.name))) sm = o; });
        if (sm) {
          root.updateMatrixWorld(true);
          var toModel = mirror.matrixWorld.clone().invert();
          var lo = Infinity, hi = -Infinity, cx = 0, cz = 0, cnt = 0, vv = V();
          var pos = sm.geometry.attributes.position, mw = sm.matrixWorld.clone().premultiply(toModel);
          for (var vi = 0; vi < pos.count; vi += 3) {
            vv.fromBufferAttribute(pos, vi).applyMatrix4(mw);
            if (vv.y < lo) lo = vv.y; if (vv.y > hi) hi = vv.y;
            cx += vv.x; cz += vv.z; cnt++;
          }
          sword = {
            mesh: sm,
            rest: mw, // the mesh in the body's space, at rest
            grip: V(cx / cnt, lo + (hi - lo) * 0.2, cz / cnt)
          };
          sm.updateMatrix();
          sword.orig = sm.matrix.clone();
          if (sm.material && sm.material.emissive) {
            sm.material = sm.material.clone();
            if (sm.material.map && !sm.material.emissiveMap) sm.material.emissiveMap = sm.material.map;
            sm.material.emissive.setHex(0xd8ecff);
            sm.material.emissiveIntensity = 0;
            sword.mat = sm.material;
          }
          sword.gripLocal = sword.grip.clone().applyMatrix4(mw.clone().invert());
          sm.matrixAutoUpdate = false;
        }
      }
      // an idle clip keeps wings, hair and fingers alive; the mapped bones are overwritten each frame
      var mixer = null, Mixer = null, mx = character.cameraMixers;
      if (mx) { for (var mk in mx) { if (mx[mk] && mx[mk].clipAction) { Mixer = mx[mk].constructor; break; } } }
      if (Mixer && gltf.animations && gltf.animations.length && spec.idle !== false) {
        var clip = gltf.animations.filter(function (a) { return (spec.idle || /lobbystand00|^stand$|idle/i).test(a.name); })[0] || null;
        if (clip) {
          // the clip keeps hair, cloth and fingers alive; the wings get our own calm beat instead
          clip = clip.clone();
          clip.tracks = clip.tracks.filter(function (tr) { return !/wing/i.test(tr.name); });
          mixer = new Mixer(scene); mixer.clipAction(clip).play();
        }
      }
      f.materials = [];
      scene.traverse(function (o) {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          if (!m) return;
          m.userData.stageKeep = true;
          if (spec.lift && m.emissive) { m.emissive.setHex(spec.lift); if (m.map && !m.emissiveMap) m.emissiveMap = m.map; }
          // some models glow far past white under the scene's bloom
          if (spec.glowCap != null && 'emissiveIntensity' in m) m.emissiveIntensity = Math.min(m.emissiveIntensity, spec.glowCap);
          // exported game models often keep glTF's default "fully metal": with nothing to
          // reflect that hides their painted colours, so give them a painted finish
          if (m.metalness === 1 && !m.metalnessMap) { m.metalness = 0.15; m.roughness = Math.min(m.roughness, 0.7); }
          if (spec.shade && m.color) m.color.multiplyScalar(spec.shade);
          if (spec.matte) { m.metalness = 0; m.roughness = 1; }
          if (!f.gU) f.gU = { value: 0 };
          duotone(m, spec.duo === false ? 0 : spec.duoMix, f.gU);
          m.needsUpdate = true;
          f.materials.push(m);
        });
      });
      f.rig = { tb: tb, restQ: restQ, mixer: mixer, align: align, sword: sword, wings: wings, wingRoots: wingRoots };
      if (spec.mount) loadMount(f, Mixer);
      f.root = root;
      root.visible = false;
      f.ready = true;
    }

    function pose(f, dt) {
      var rig = f.rig, root = f.root;
      syncMirror();
      if (rig.mixer) rig.mixer.update(dt);
      var mq = model.getWorldQuaternion(new Q()), mqi = mq.clone().invert();
      var B = basis(srcRestP), ax = V(), ay = V(), az = V();
      B.extractBasis(ax, ay, az); // in the body's space: ax toward its left hand, ay up, az forward
      if (f.phase === undefined) f.phase = Math.random() * 10;
      // the viewer can spin the figure about its own vertical (drag on home)
      var Yq = new Q().setFromAxisAngle(ay, f.spin || 0);
      var mqY = mq.clone().multiply(Yq);
      for (var i = 0; i < ROLES.length; i++) {
        var role = ROLES[i][0], b = rig.tb[role], s = srcBones[role];
        if (!b || !s) continue;
        // the body bone's turn from its rest, in the model's space
        var delta = mqi.clone().multiply(s.getWorldQuaternion(new Q())).multiply(srcRestQ[role].clone().invert());
        var tw = mqY.clone().multiply(delta).multiply(rig.restQ[role]);
        // life: breath in the chest, the head drifting, the shoulders easing
        var lf = LIFE[role];
        if (lf) {
          var tt = performance.now() / 1000 + (f.phase || 0);
          var axR = ax.clone().applyQuaternion(mqY), axU = ay.clone().applyQuaternion(mqY);
          var pitch = lf[0] * Math.sin(tt * 1.25 + lf[2]), yaw = lf[1] * Math.sin(tt * 0.37 + lf[2]) + lf[1] * 0.5 * Math.sin(tt * 0.91);
          tw = new Q().setFromAxisAngle(axU, yaw).multiply(new Q().setFromAxisAngle(axR, pitch)).multiply(tw);
        }
        var pq = b.parent.getWorldQuaternion(new Q()).invert().multiply(tw);
        // ease toward the pose rather than snapping to it
        if (b.userData.lifeQ && f.presence > 0.02) b.quaternion.copy(b.userData.lifeQ).slerp(pq, 1 - Math.exp(-dt * 13));
        else b.quaternion.copy(pq);
        b.userData.lifeQ = b.quaternion.clone();
        b.updateMatrixWorld(true);
      }
      // living wings: a slow breath of a beat, rolling out from the shoulder to the tip
      if (rig.wingRoots && rig.wingRoots.length) {
        var wt = performance.now() / 1000 + (f.phase || 0);
        var fwdW = az.clone().applyQuaternion(mqY), upW = ay.clone().applyQuaternion(mqY);
        var amp = f.spec.wingAmp || 1;
        rig.wingRoots.forEach(function (wb) { wb.quaternion.copy(wb.userData.baseQ); });
        rig.wingRoots.forEach(function (wb) {
          var sd = wb.userData.side, d = wb.userData.depth;
          if (!sd) return;
          wb.updateMatrixWorld(true);
          var lag = d * 0.55;
          var flap = (Math.sin(wt * 1.15 - lag) * (d === 0 ? 0.075 : 0.045) + Math.sin(wt * 2.6 - lag) * 0.012) * amp;
          var sweep = Math.sin(wt * 0.6 - lag * 0.5) * 0.03 * amp * (d === 0 ? 1 : 0.4);
          setWorldQ(wb, new Q().setFromAxisAngle(fwdW, flap * sd).multiply(new Q().setFromAxisAngle(upW, sweep * sd)).multiply(wb.getWorldQuaternion(new Q())));
        });
      }
      var dirs = function (x, y, z) { return ax.clone().multiplyScalar(x).addScaledVector(ay, y).addScaledVector(az, z); };
      var c0 = cam();
      if (f.spec.pointAt && c0) {
        // the sword arm thrust at the viewer, the blade aimed straight out of the screen
        if (!rig.blade) {
          rig.blade = { tip: null, side: 'r' };
          root.traverse(function (o) { if (o.isBone && /^swordtipjnt/.test(normName(o.name))) rig.blade.tip = o; });
          for (var q0 = rig.blade.tip && rig.blade.tip.parent; q0; q0 = q0.parent) { var nq = normName(q0.name); if (/^larm/.test(nq)) { rig.blade.side = 'l'; break; } if (/^rarm/.test(nq)) break; }
        }
        var sdA = rig.blade.side, otA = sdA === 'l' ? 'r' : 'l', sgn = sdA === 'l' ? 1 : -1;
        var mqYi = mqY.clone().invert();
        var camW = c0.getWorldPosition(V());
        var thrust = Math.sin(performance.now() / 1300 + (f.phase || 0)) * 0.02;
        var up0 = rig.tb[sdA + 'upper'], fo0 = rig.tb[sdA + 'fore'], ha0 = rig.tb[sdA + 'hand'];
        if (up0 && fo0 && ha0) {
          var toCam = camW.clone().sub(up0.getWorldPosition(V())).applyQuaternion(mqYi).normalize();
          // the arm a touch out to its side and down from the line of sight, so it reads as reaching
          var armDir = toCam.clone().add(dirs(0.12 * sgn, -0.08 + thrust, 0));
          aim(up0, fo0, armDir, mqY, 1);
          aim(fo0, ha0, armDir, mqY, 1);
          if (rig.blade.tip) {
            // just past the lens, so the length of the blade still reads
            var hw0 = ha0.getWorldPosition(V()), dC = camW.distanceTo(hw0);
            var cq0 = c0.getWorldQuaternion(new Q());
            var aimW = camW.clone().addScaledVector(V(1, 0, 0).applyQuaternion(cq0), 0.16 * dC * sgn).addScaledVector(V(0, 1, 0).applyQuaternion(cq0), -0.06 * dC);
            var toCamH = aimW.sub(hw0).applyQuaternion(mqYi);
            aim(ha0, rig.blade.tip, toCamH, mqY, 1);
          }
        }
        var u1 = rig.tb[otA + 'upper'], f1 = rig.tb[otA + 'fore'], h1 = rig.tb[otA + 'hand'];
        if (u1 && f1 && h1) {
          // the free hand drawn back and open, for balance
          aim(u1, f1, dirs(-0.45 * sgn, -0.55, -0.35), mqY, 1);
          aim(f1, h1, dirs(-0.25 * sgn, -0.75, 0.2), mqY, 1);
        }
      }
      if (f.spec.hilt) {
        // a guardian's stance: both hands closed on the hilt before the chest, a slow breath
        var hb = Math.sin(performance.now() / 1600 + (f.phase || 0)) * 0.03;
        [['l', 1], ['r', -1]].forEach(function (A) {
          var up = rig.tb[A[0] + 'upper'], fo = rig.tb[A[0] + 'fore'], ha = rig.tb[A[0] + 'hand'];
          if (!up || !fo || !ha) return;
          aim(up, fo, dirs(0.18 * A[1], -0.75, 0.62 + hb), mqY, 1);
          aim(fo, ha, dirs(-0.62 * A[1], 0.42, 0.66), mqY, 1);
        });
      }
      if (f.spec.soften) {
        // pull both arms part-way toward a relaxed, slightly open hang, with a slow drift
        var sd = Math.sin(performance.now() / 1900 + (f.phase || 0)) * 0.06;
        [['l', 1], ['r', -1]].forEach(function (sdArm) {
          var up = rig.tb[sdArm[0] + 'upper'], fo = rig.tb[sdArm[0] + 'fore'], ha = rig.tb[sdArm[0] + 'hand'];
          if (!up || !fo || !ha) return;
          aim(up, fo, dirs(0.38 * sdArm[1], -0.88, 0.2 + sd), mqY, f.spec.soften);
          aim(fo, ha, dirs(0.22 * sdArm[1], -0.55, 0.6 + sd), mqY, f.spec.soften);
        });
      }
      // The sword: it floats beside him through the intro; then he reaches out,
      // takes it, and raises it overhead (f.seq counts seconds since the intro ended)
      var seq = f.seq || 0;
      var ease = function (x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
      var wReach = ease(seq / 0.8), wTake = ease((seq - 0.85) / 0.35), wRaise = ease((seq - 1.25) / 1.0);
      f.swordRaised = wRaise;
      var sw = rig.sword;
      var gripW = null;
      if (sw) {
        var pelL = mirror.worldToLocal(rig.tb.pelvis.getWorldPosition(V()));
        var F = pelL.add(dirs(-0.6, 0.3, 0.55).multiplyScalar(restHeight).applyQuaternion(Yq));
        F.y += Math.sin(performance.now() / 700) * 0.025 * restHeight;
        var floatM = new M4().makeTranslation(F.x, F.y, F.z)
          .multiply(new M4().makeRotationFromQuaternion(Yq))
          .multiply(new M4().makeTranslation(-sw.grip.x, -sw.grip.y, -sw.grip.z))
          .multiply(sw.rest);
        floatM.premultiply(mirror.matrixWorld).premultiply(sw.mesh.parent.matrixWorld.clone().invert());
        sw.mesh.matrix.copy(floatM);
        sw.mesh.updateMatrixWorld(true);
        gripW = sw.gripLocal.clone().applyMatrix4(sw.mesh.matrixWorld);
      }
      if (f.spec.swordUp && rig.tb.rupper && rig.tb.rfore && rig.tb.rhand && wReach > 0) {
        var mqYi = mqY.clone().invert();
        var reach = gripW ? gripW.clone().sub(rig.tb.rupper.getWorldPosition(V())).applyQuaternion(mqYi).normalize() : dirs(-0.7, 0.2, 0.5);
        var sway = Math.sin(performance.now() / 1400) * 0.04;
        var upU = dirs(-0.42, 0.92, 0.12 + sway).normalize(), upF = dirs(-0.12, 1, 0.18).normalize();
        aim(rig.tb.rupper, rig.tb.rfore, reach.clone().lerp(upU, wRaise), mqY, wReach);
        aim(rig.tb.rfore, rig.tb.rhand, reach.clone().lerp(upF, wRaise), mqY, wReach);
      }
      if (f.spec.calmLeft && rig.tb.lupper && rig.tb.lfore && rig.tb.lhand) {
        // the free arm lowered and a little open, palm toward the viewer;
        // the scene's own gesture is kept while the intro plays
        var calmWant = character._introPlaying ? 0 : 1;
        f.calm = (f.calm || 0) + (calmWant - (f.calm || 0)) * Math.min(1, dt * 2.5);
        if (f.calm > 0.001) {
          aim(rig.tb.lupper, rig.tb.lfore, dirs(0.4, -0.86, 0.14), mqY, f.calm);
          aim(rig.tb.lfore, rig.tb.lhand, dirs(0.28, -0.62, 0.5), mqY, f.calm);
        }
      }
      if (sw && wTake > 0) {
        var hand = rig.tb.rhand;
        var handL = mirror.worldToLocal(hand.getWorldPosition(V()));
        var dirL = handL.clone().sub(mirror.worldToLocal(rig.tb.rfore.getWorldPosition(V()))).normalize();
        var rq = new Q().setFromUnitVectors(V(0, 1, 0), dirL);
        // in the hand: the grip in the palm, the blade along the forearm
        var mm = new M4().makeTranslation(handL.x, handL.y, handL.z)
          .multiply(new M4().makeRotationFromQuaternion(rq))
          .multiply(new M4().makeTranslation(-sw.grip.x, -sw.grip.y, -sw.grip.z))
          .multiply(sw.rest);
        mm.premultiply(mirror.matrixWorld).premultiply(sw.mesh.parent.matrixWorld.clone().invert());
        if (wTake < 1) {
          // fly from where it floated into his hand
          var p0 = V(), q0 = new Q(), s0 = V(), p1 = V(), q1 = new Q(), s1 = V();
          sw.mesh.matrix.decompose(p0, q0, s0); mm.decompose(p1, q1, s1);
          mm.compose(p0.lerp(p1, wTake), q0.slerp(q1, wTake), s0.lerp(s1, wTake));
        }
        sw.mesh.matrix.copy(mm);
        sw.mesh.updateMatrixWorld(true);
      }
      // the figure's hips sit on the body's hips
      var want = model.worldToLocal(srcBones.pelvis.getWorldPosition(V()));
      var have = model.worldToLocal(rig.tb.pelvis.getWorldPosition(V()));
      root.position.add(want.sub(have));
      // some routes crowd the figure with cards: slide it across and back, in the camera's terms
      var c = cam();
      if (c && (f.spec.shift || f.spec.push || f.spec.rise)) {
        f.offsetW = (f.offsetW || 0) + (1 - (f.offsetW || 0)) * Math.min(1, dt * 2);
        var cq = c.getWorldQuaternion(new Q());
        var rightW = V(1, 0, 0).applyQuaternion(cq), fwdW = V(0, 0, -1).applyQuaternion(cq);
        rightW.y = 0; fwdW.y = 0; rightW.normalize(); fwdW.normalize();
        var unit = restHeight * mirror.scale.y;
        var offW = rightW.multiplyScalar((f.spec.shift || 0) * unit).addScaledVector(fwdW, (f.spec.push || 0) * unit).add(V(0, (f.spec.rise || 0) * unit, 0)).multiplyScalar(f.offsetW);
        var hw = rig.tb.pelvis.getWorldPosition(V()).add(offW);
        root.position.copy(root.position.clone().add(mirror.worldToLocal(hw).sub(mirror.worldToLocal(rig.tb.pelvis.getWorldPosition(V())))));
      }
      // framed: the figure's chest held at a fixed spot of the view, in the open sky band
      if (c && f.spec.frameAt) {
        var fa = f.spec.frameAt, cq2 = c.getWorldQuaternion(new Q());
        var cpos = c.getWorldPosition(V());
        var fwd2 = V(0, 0, -1).applyQuaternion(cq2), up2 = V(0, 1, 0).applyQuaternion(cq2), rt2 = V(1, 0, 0).applyQuaternion(cq2);
        var dW = fa.dist * restHeight * mirror.scale.y;
        var hH = dW * Math.tan((c.fov || 35) * Math.PI / 360), hW = hH * (c.aspect || 1);
        var narrow2 = (c.aspect || 1) < 0.8;
        var tgtW = cpos.addScaledVector(fwd2, dW).addScaledVector(rt2, (narrow2 ? fa.mx : fa.x) * hW).addScaledVector(up2, (narrow2 ? fa.my : fa.y) * hH);
        var chest = (rig.tb.spine2 || rig.tb.spine1 || rig.tb.pelvis).getWorldPosition(V());
        root.position.add(mirror.worldToLocal(tgtW).sub(mirror.worldToLocal(chest)));
        root.updateMatrixWorld(true);
      }
      // fit: measure the figure's bones on screen and slide/scale it into a target box
      if (c && f.spec.fitBox) {
        var fb = f.spec.fitBox[(c.aspect || 1) < 0.8 ? 1 : 0];
        if (!rig.allBones) { rig.allBones = []; root.traverse(function (o) { if (o.isBone) rig.allBones.push(o); }); rig.baseScale = root.scale.x; }
        // size first, then the hips back on the body's hips, then measure
        root.scale.setScalar(rig.baseScale * (f.fitS || 1)); root.updateMatrixWorld(true);
        root.position.add(model.worldToLocal(srcBones.pelvis.getWorldPosition(V())).sub(model.worldToLocal(rig.tb.pelvis.getWorldPosition(V()))));
        root.updateMatrixWorld(true);
        var mnx = 9, mny = 9, mxx = -9, mxy = -9, pz = 0, n = 0, pp = V();
        for (var bi = 0; bi < rig.allBones.length; bi += 2) {
          rig.allBones[bi].getWorldPosition(pp).project(c);
          if (pp.z > 1) continue;
          mnx = Math.min(mnx, pp.x); mxx = Math.max(mxx, pp.x); mny = Math.min(mny, pp.y); mxy = Math.max(mxy, pp.y); pz += pp.z; n++;
        }
        if (n) {
          var hgt = Math.max(mxy - mny, mxx - mnx * 0), wantH = fb[3] - fb[1];
          f.fitS = (f.fitS || 1) * Math.pow(Math.max(0.5, Math.min(2, wantH / Math.max(1e-3, mxy - mny))), Math.min(1, dt * 3));
          var cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2, tx = (fb[0] + fb[2]) / 2, ty = (fb[1] + fb[3]) / 2;
          var a0 = V(cx, cy, pz / n).unproject(c), a1 = V(tx, ty, pz / n).unproject(c);
          var need = mirror.worldToLocal(a1.clone()).sub(mirror.worldToLocal(a0.clone()));
          f.fitOff = (f.fitOff || need.clone()).lerp(need, Math.min(1, dt * 4));
        }
        root.position.add(f.fitOff || V());
        root.updateMatrixWorld(true);
      }
      var Mt = f.mount, ride = f.ride || 0;
      if (Mt && Mt.ready) {
        Mt.root.visible = ride > 0.01 && f.presence > 0.01;
        var mo = Math.min(ride, f.presence);
        if (f.mgU) f.mgU.value = Math.max(f.gU ? f.gU.value : 0, 1 - mo);
        if (Mt.root.visible) {
          Mt.fore.forEach(function (b) { if (b) b.quaternion.copy(b.userData.base); });
          if (Mt.mixer) Mt.mixer.update(dt);
          var ms = f.spec.mount;
          // size: its saddle at a rider's seat height
          var sc2 = (ms.seat || 0.78) * restHeight / Math.max(Mt.seatH, 1e-6);
          Mt.root.scale.setScalar(sc2);
          // turn: its head along the rider's forward, then the rider's facing and the mount's own angle
          var turn0 = new Q().setFromUnitVectors(Mt.fwd, az.clone().setY(0).normalize());
          Mt.root.quaternion.copy(Yq).multiply(turn0);
          // stand it on the floor, its saddle under the rider's hips
          var floorL = Math.min(srcRestP.lfoot.y, srcRestP.rfoot.y) - 0.05 * restHeight;
          Mt.root.position.set(0, floorL - Mt.feetY * sc2, 0);
          Mt.root.updateMatrixWorld(true);
          if (ms.rear && Mt.hind.length) {
            var tR = performance.now() / 1000;
            var ang = ms.rear * ride + Math.sin(tR * 1.3) * 0.035 * ride;
            var fwdM = Mt.fwd.clone().applyQuaternion(Mt.root.quaternion);
            var latM = V().crossVectors(fwdM, V(0, 1, 0)).normalize();
            var piv = V();
            Mt.hind.forEach(function (h) { piv.add(mirror.worldToLocal(h.getWorldPosition(V()))); });
            piv.multiplyScalar(1 / Mt.hind.length);
            var Rr = new Q().setFromAxisAngle(latM, ang);
            Mt.root.position.sub(piv).applyQuaternion(Rr).add(piv);
            Mt.root.quaternion.premultiply(Rr);
            Mt.root.updateMatrixWorld(true);
            // forelegs: the upper leg lifted forward, the knee folded back, the hoof curled
            var latW = latM.clone().transformDirection(mirror.matrixWorld);
            var bend = function (b, a) { if (b) setWorldQ(b, new Q().setFromAxisAngle(latW, a * ride).multiply(b.getWorldQuaternion(new Q()))); };
            var paw = Math.sin(tR * 2.2) * 0.12;
            bend(Mt.fore[0], 0.75 + paw); bend(Mt.fore[1], 0.55 - paw);
            bend(Mt.fore[2], -1.7); bend(Mt.fore[3], -1.5);
            bend(Mt.fore[4], -0.6); bend(Mt.fore[5], -0.6);
          }
          var seatL = mirror.worldToLocal(Mt.seat.getWorldPosition(V()));
          var pelL2 = mirror.worldToLocal(rig.tb.pelvis.getWorldPosition(V()));
          Mt.root.position.x += pelL2.x - seatL.x; Mt.root.position.z += pelL2.z - seatL.z;
          // the rider sits back toward the croup, so the reared head and neck rise clear in front of him
          if (ms.back) { var fh = Mt.fwd.clone().applyQuaternion(Mt.root.quaternion); fh.y = 0; fh.normalize(); Mt.root.position.addScaledVector(fh, ms.back * restHeight * ride); }
          Mt.root.updateMatrixWorld(true);
          // the rider settles down into the saddle
          seatL = mirror.worldToLocal(Mt.seat.getWorldPosition(V()));
          root.position.y += (seatL.y + Mt.seatUp * sc2 + (ms.lift || 0.04) * restHeight - pelL2.y) * ride;
          root.updateMatrixWorld(true);
          // legs astride, feet toward the stirrups
          [['l', Mt.stirL, 1], ['r', Mt.stirR, -1]].forEach(function (L) {
            var th = rig.tb[L[0] + 'thigh'], ca = rig.tb[L[0] + 'calf'], fo = rig.tb[L[0] + 'foot'];
            if (!th || !ca || !fo) return;
            var thDir = dirs(0.42 * L[2], -0.35, 0.75);
            aim(th, ca, thDir, mqY, ride);
            var tgt = L[1] ? L[1].getWorldPosition(V()) : null;
            if (tgt) aim(ca, fo, tgt.sub(ca.getWorldPosition(V())), new Q(), ride);
            else aim(ca, fo, dirs(0.15 * L[2], -1, -0.15), mqY, ride);
          });
        }
      }
      root.updateMatrixWorld(true);
    }

    // ---------- the dragon in the clouds (home) ----------
    // A colossal obsidian head far behind the hero, looking at the camera
    // through drifting fog, its eyes burning like embers.
    // "elder dragon" on Sketchfab (CC BY 4.0).
    var dragon = null;
    var Standard = null, floor = null;
    exp.scene.traverse(function (o) {
      if (!Standard && o.isMesh && o.material && o.material.isMeshStandardMaterial) Standard = o.material.constructor;
      if (!floor && o.isMesh && o.name === 'Floor') floor = o;
    });
    function softTexture(draw) {
      var c = document.createElement('canvas'); c.width = c.height = 256;
      draw(c.getContext('2d'), 256);
      return c;
    }
    // a unit quad, built with the floor's geometry classes
    var QuadMesh = floor ? floor.constructor : null, Quad = null;
    if (floor) {
      var G = floor.geometry.constructor, A = floor.geometry.attributes.position.constructor;
      Quad = new G();
      Quad.setAttribute('position', new A(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
      Quad.setAttribute('normal', new A(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
      Quad.setAttribute('uv', new A(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
      Quad.setIndex([0, 1, 2, 0, 2, 3]);
    }
    var TexC = null;
    function findTexC() {
      if (!TexC) exp.scene.traverse(function (o) { if (!TexC && o.isMesh && o.material && o.material.map) TexC = o.material.map.constructor; });
      return TexC;
    }
    function glowPlane(canvas, additive, opacity) {
      if (!QuadMesh || !Quad || !Standard || !findTexC()) return null;
      var tex = new TexC(canvas);
      tex.needsUpdate = true;
      tex.colorSpace = 'srgb';
      var mat = new Standard({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, map: tex, transparent: true, depthWrite: false, opacity: opacity, side: 2 });
      if (additive) mat.blending = 2; // AdditiveBlending
      mat.userData.stageKeep = true;
      var q = new QuadMesh(Quad, mat);
      q.frustumCulled = false;
      q.renderOrder = 5;
      return q;
    }
    // the dragon is retired: set USE_DRAGON to bring it back
    if (USE_DRAGON) loader.load(P + 'dragon.glb', function (gltf) {
      try {
        var m = gltf.scene;
        var inner = new T.Object3D(); inner.add(m);
        var b = bounds(inner);
        var h = Math.max(b.max.y - b.min.y, 1e-6);
        // origin at the top of the head, centred on it
        inner.position.set(-(b.min.x + b.max.x) / 2, -b.max.y, -(b.min.z + b.max.z) / 2);
        var unit = new T.Object3D(); unit.add(inner); unit.scale.setScalar(1 / h);
        var root = new T.Object3D(); root.add(unit);
        var mats = [];
        var skin = Standard ? new Standard({ color: 0x0c0c12, roughness: 0.5, metalness: 0.65, side: 2 }) : null;
        if (skin) {
          skin.userData.stageKeep = true;
          // ember light caught on the scales' edges
          skin.onBeforeCompile = function (sh) {
            sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', [
              'float dRim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);',
              'outgoingLight = outgoingLight * 0.5 + vec3(0.5, 0.56, 0.74) * dRim * 0.18;',
              '#include <opaque_fragment>'].join('\n'));
          };
          mats.push(skin);
        }
        m.traverse(function (o) { if (o.isMesh) { o.frustumCulled = false; if (skin) o.material = skin; } });

        var eyeTex = softTexture(function (g, n) {
          var r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
          r.addColorStop(0, 'rgba(255,240,200,1)'); r.addColorStop(0.18, 'rgba(255,140,40,0.95)');
          r.addColorStop(0.45, 'rgba(230,60,10,0.35)'); r.addColorStop(1, 'rgba(200,30,0,0)');
          g.fillStyle = r; g.fillRect(0, 0, n, n);
        });
        var fogTex = softTexture(function (g, n) {
          // one round, soft puff; many of them make a cloud bank
          var r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
          r.addColorStop(0, 'rgba(160,168,196,0.5)'); r.addColorStop(0.5, 'rgba(150,160,190,0.18)'); r.addColorStop(1, 'rgba(150,160,190,0)');
          g.fillStyle = r; g.fillRect(0, 0, n, n);
        });
        // where the eyes are: the front-most surface at each eye's height and
        // side, measured on the mesh in the head's own unit space
        root.updateMatrixWorld(true);
        var toUnit = root.matrixWorld.clone().invert();
        var front = { '-1': -Infinity, '1': -Infinity }, pv = V();
        m.traverse(function (o) {
          if (!o.isMesh) return;
          var pos = o.geometry.attributes.position, mw = o.matrixWorld.clone().premultiply(toUnit);
          for (var i = 0; i < pos.count; i += 2) {
            pv.fromBufferAttribute(pos, i).applyMatrix4(mw);
            if (Math.abs(pv.y - DRAGON.eyeY) > 0.012) continue;
            [-1, 1].forEach(function (sd) {
              if (Math.abs(pv.x - sd * DRAGON.eyeX) < 0.012 && pv.z > front[sd]) front[sd] = pv.z;
            });
          }
        });
        root.visible = false;
        holder.add(root);
        dragon = { root: root, mats: mats, eyes: [], fogs: [], presence: 0, anchor: null };
        dragon.dress = function () {
        var eyes = dragon.eyes;
        [-1, 1].forEach(function (side) {
          var e = glowPlane(eyeTex, true, 1);
          if (!e) return;
          e.position.set(side * DRAGON.eyeX, DRAGON.eyeY, (isFinite(front[side]) ? front[side] : 0.3) + 0.01);
          e.scale.setScalar(0.12);
          root.add(e);
          eyes.push(e);
        });
        var fogs = dragon.fogs;
        for (var i = 0; i < 16; i++) {
          var f = glowPlane(fogTex, false, 0.75);
          if (!f) break;
          f.userData.seed = Math.random() * 10;
          var sideX = (i % 2 ? 1 : -1) * (0.3 + Math.random() * 0.45);
          f.userData.base = [sideX, 0.16 - Math.random() * 0.12, 0.1 + Math.random() * 0.25];
          f.scale.setScalar(0.3 + Math.random() * 0.25);
          root.add(f);
          fogs.push(f);
        }
          return eyes.length > 0;
        };
        dragon.dressed = dragon.dress();
      } catch (err) { console.warn('[pantheon] dragon', err); }
    });

    // ---------- every frame ----------
    var cam = function () { return exp.camera && exp.camera.instance; };
    var hp = V(), cp = V();
    function place(f, t, dt) {
      if (f.rig) { pose(f, dt); return; }
      var k = model.getWorldScale(V()).y / restScale;
      var height = bodyHeight * f.spec.k * k;
      hips.getWorldPosition(hp);
      f.root.scale.setScalar(height);
      f.root.position.set(hp.x, hp.y - f.spec.anchor * height + Math.sin(t * 1.1) * 0.012 * height, hp.z);
      var c = cam();
      // framed: the camera looks steeply down here, so the figure is posed
      // square to the lens instead of to the floor, and set in the band above
      // the night-glass panel: she rises over its gold rim like the dragon on home
      if (c && f.spec.frame) {
        c.getWorldPosition(cp);
        var q = c.getWorldQuaternion(f.root.quaternion.clone());
        var fwd = V(0, 0, -1).applyQuaternion(q), up = V(0, 1, 0).applyQuaternion(q), right = V(1, 0, 0).applyQuaternion(q);
        var dist = f.spec.frame * bodyHeight * k;
        // never so far down the line of sight that she sinks through the floor
        // (her size follows the distance, so how big she looks does not change)
        var narrow = (c.aspect || 1) < 0.8;
        if (narrow && fwd.y < -0.05) dist = Math.min(dist, 0.55 * (cp.y - footY * k) / -fwd.y);
        var halfH = dist * Math.tan((c.fov || 35) * Math.PI / 360), halfW = halfH * (c.aspect || 1);
        // head, chest and the spread of her wings show above the panel's rim
        var H = 2 * halfH * (narrow ? 0.26 : 0.56);
        var sx = narrow ? 0.5 : 0.6, top = narrow ? 0.96 : 0.95;
        var bob = Math.sin(t * 1.1) * 0.012 * H;
        f.root.scale.setScalar(H);
        f.root.position.copy(cp).addScaledVector(fwd, dist)
          .addScaledVector(right, sx * halfW)
          .addScaledVector(up, top * halfH - H + bob);
        f.root.quaternion.copy(q);
        f.root.rotateY(-0.3 + Math.sin(t * 0.3) * 0.06);
        return;
      }
      // some figures are too grand for a close camera: step them back along its line of sight
      if (c && f.spec.push) {
        c.getWorldPosition(cp);
        var dx = hp.x - cp.x, dz = hp.z - cp.z, dl = Math.max(Math.hypot(dx, dz), 1e-6);
        f.root.position.x += dx / dl * f.spec.push * bodyHeight * k;
        f.root.position.z += dz / dl * f.spec.push * bodyHeight * k;
      }
      if (c) {
        c.getWorldPosition(cp);
        var want = Math.atan2(cp.x - f.root.position.x, cp.z - f.root.position.z);
        if (f.yaw === null) f.yaw = want;
        var d = Math.atan2(Math.sin(want - f.yaw), Math.cos(want - f.yaw));
        f.yaw += d * 0.06;
        f.root.rotation.y = f.yaw;
      }
    }
    // Dithered only while fading: at full presence the figure is plain opaque,
    // so texture and vertex-colour alpha cannot punch holes in it.
    function fade(list, a) {
      // a soft see-through fade (not a dither), back to fully solid at the end
      var see = a < 0.999;
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.userData.baseTransparent === undefined) m.userData.baseTransparent = !!m.transparent;
        m.opacity = a;
        var tr = see || m.userData.baseTransparent;
        if (m.transparent !== tr || m.alphaHash) { m.transparent = tr; m.alphaHash = false; m.needsUpdate = true; }
      }
    }

    // ---------- drag to turn the hero (home) ----------
    var drag = { down: false, x: 0, vel: 0, spin: 0 };
    addEventListener('pointerdown', function (e) { drag.down = true; drag.x = e.clientX; }, true);
    addEventListener('pointermove', function (e) {
      if (!drag.down) return;
      var dx = e.clientX - drag.x; drag.x = e.clientX;
      drag.spin += dx * 0.009; drag.vel = dx * 0.009 * 60;
    }, true);
    addEventListener('pointerup', function () { drag.down = false; }, true);
    addEventListener('pointercancel', function () { drag.down = false; }, true);

    // ---------- lightning from the top of the screen into the raised sword ----------
    // A jagged bolt (with a branch or two) drawn as a camera-facing ribbon, a
    // flare where it meets the blade, and a faint flash over the whole view.
    var bolt = null;
    function makeBolt() {
      if (!floor || !Standard) return null;
      var G = floor.geometry.constructor, A = floor.geometry.attributes.position.constructor;
      var MAXP = 220;
      var geo = new G();
      var pos = new A(new Float32Array(MAXP * 6 * 3), 3);
      var alpha = new A(new Float32Array(MAXP * 6), 1);
      geo.setAttribute('position', pos);
      geo.setAttribute('normal', new A(new Float32Array(MAXP * 6 * 3).fill(0), 3));
      geo.setAttribute('boltA', alpha);
      var mat = new Standard({ color: 0x000000, emissive: 0xe8f4ff, emissiveIntensity: 4, transparent: true, depthWrite: false, depthTest: false, blending: 1, side: 2 });
      mat.toneMapped = false;
      mat.userData.stageKeep = true;
      mat.onBeforeCompile = function (sh) {
        sh.vertexShader = 'attribute float boltA;\nvarying float vBoltA;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBoltA = boltA;');
        sh.fragmentShader = 'varying float vBoltA;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= vBoltA;\n#include <opaque_fragment>');
      };
      var mesh = new floor.constructor(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 20;
      exp.scene.add(mesh);
      // a flare at the blade and a flash over the page
      var flareCanvas = softTexture(function (g, n) {
        var r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
        r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(200,235,255,0.75)');
        r.addColorStop(0.5, 'rgba(120,190,255,0.18)'); r.addColorStop(1, 'rgba(120,190,255,0)');
        g.fillStyle = r; g.fillRect(0, 0, n, n);
      });
      var flare = null;
      var flash = document.createElement('div');
      flash.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;' +
        'background:radial-gradient(ellipse 60% 70% at 50% 20%, rgba(210,235,255,.55), rgba(120,170,255,.12) 55%, rgba(0,0,0,0) 80%);mix-blend-mode:screen;';
      document.body.appendChild(flash);
      return { mesh: mesh, geo: geo, pos: pos, alpha: alpha, MAXP: MAXP, flare: flare, flash: flash, life: 0, next: 0.2, seed: 0, paths: null, reseed: 0 };
    }
    // a jagged path from a to b: midpoint displacement, plus short forks
    function boltPaths(a, b, side) {
      var pts = [a.clone(), b.clone()];
      var len = a.distanceTo(b), amp = len * 0.16;
      for (var it = 0; it < 6; it++) {
        var nx = [];
        for (var i = 0; i < pts.length - 1; i++) {
          var m = pts[i].clone().add(pts[i + 1]).multiplyScalar(0.5);
          m.addScaledVector(side, (Math.random() - 0.5) * amp);
          m.y += (Math.random() - 0.5) * amp * 0.3;
          nx.push(pts[i], m);
        }
        nx.push(pts[pts.length - 1]);
        pts = nx; amp *= 0.55;
      }
      var paths = [{ pts: pts, w: 1 }];
      for (var k = 0; k < 2; k++) {
        var at = 10 + Math.floor(Math.random() * (pts.length - 30));
        var from = pts[at], dir = pts[Math.min(pts.length - 1, at + 8)].clone().sub(from);
        var end = from.clone().add(dir.multiplyScalar(1.5 + Math.random())).addScaledVector(side, (Math.random() - 0.5) * len * 0.35);
        var sub = [from.clone(), end], a2 = from.distanceTo(end) * 0.2;
        for (var it2 = 0; it2 < 4; it2++) {
          var nx2 = [];
          for (var j = 0; j < sub.length - 1; j++) {
            var m2 = sub[j].clone().add(sub[j + 1]).multiplyScalar(0.5).addScaledVector(side, (Math.random() - 0.5) * a2);
            nx2.push(sub[j], m2);
          }
          nx2.push(sub[sub.length - 1]); sub = nx2; a2 *= 0.55;
        }
        paths.push({ pts: sub, w: 0.45 });
      }
      return paths;
    }
    function drawBolt(B, camP, width, strength) {
      // one continuous ribbon per path (shared edges, so no overlapping boxes),
      // tapering to a needle point where it meets the blade
      var arr = B.pos.array, al = B.alpha.array, n = 0;
      B.paths.forEach(function (path, pi) {
        var P = path.pts, N = P.length, L = [], R = [];
        for (var i = 0; i < N; i++) {
          var d = P[Math.min(N - 1, i + 1)].clone().sub(P[Math.max(0, i - 1)]);
          var off = V().crossVectors(d, camP.clone().sub(P[i])).normalize();
          var u = i / (N - 1);
          // main bolt: full width above, narrowing over its last fifth to nothing;
          // forks: thin out along their whole length
          var taper = pi === 0 ? Math.min(1, (1 - u) / 0.2) : (1 - u);
          var w = width * path.w * Math.max(0, taper) * (0.75 + 0.25 * Math.sin(i * 2.7));
          L.push(P[i].clone().addScaledVector(off, w)); R.push(P[i].clone().addScaledVector(off, -w));
        }
        for (var j = 0; j < N - 1 && n < B.MAXP; j++) {
          var tri = [L[j], R[j], L[j + 1], L[j + 1], R[j], R[j + 1]];
          for (var t = 0; t < 6; t++) { arr[(n * 6 + t) * 3] = tri[t].x; arr[(n * 6 + t) * 3 + 1] = tri[t].y; arr[(n * 6 + t) * 3 + 2] = tri[t].z; al[n * 6 + t] = strength * path.w; }
          n++;
        }
      });
      for (var z = n * 6; z < B.MAXP * 6; z++) al[z] = 0;
      B.geo.setDrawRange(0, n * 6);
      B.pos.needsUpdate = true; B.alpha.needsUpdate = true;
    }
    function updateBolt(dt, route) {
      var f = figures[ROUTES.home];
      var armed = route === 'home' && f && f.ready && f.rig && f.rig.sword && (f.swordRaised || 0) > 0.97 && f.presence > 0.9;
      if (!bolt) { if (!armed) return; bolt = makeBolt(); if (!bolt) return; bolt.next = 0.05; }
      var c = cam();
      if (!armed || !c) {
        bolt.mesh.visible = false; bolt.flash.style.opacity = 0; bolt.next = 0.15; bolt.life = 0; bolt.glow = 0;
        if (f && f.rig && f.rig.sword && f.rig.sword.mat) { f.rig.sword.mat.emissive.setRGB(0, 0, 0); f.rig.sword.mat.emissiveIntensity = 1; }
        return;
      }
      // the tip of the blade: the far end of the sword from his hand
      var sw = f.rig.sword.mesh, hand = f.rig.tb.rhand.getWorldPosition(V());
      var bb = new (model.position.constructor)(), tip = null, best = -1, pa = sw.geometry.attributes.position, tv = V();
      for (var i = 0; i < pa.count; i += 7) {
        tv.fromBufferAttribute(pa, i).applyMatrix4(sw.matrixWorld);
        var d = tv.distanceToSquared(hand);
        if (d > best) { best = d; bb.copy(tv); }
      }
      tip = bb;
      c.getWorldPosition(cp);
      bolt.next -= dt;
      if (bolt.life <= 0 && bolt.next <= 0) {
        bolt.life = 0.42 + Math.random() * 0.25;
        bolt.reseed = 0;
        bolt.next = 3.2 + Math.random() * 3.5;
      }
      if (bolt.life > 0) {
        bolt.life -= dt;
        bolt.reseed -= dt;
        // the source: straight above the tip, past the top edge of the screen
        var tipN = tip.clone().project(c);
        var top = V(tipN.x + (Math.random() - 0.5) * 0.08, 1.25, tipN.z).unproject(c);
        var side = V(1, 0, 0).applyQuaternion(c.getWorldQuaternion(new Q()));
        if (bolt.reseed <= 0) { bolt.paths = boltPaths(top, tip, side); bolt.reseed = 0.05 + Math.random() * 0.05; }
        var flick = 0.55 + Math.random() * 0.45;
        var width = tip.distanceTo(cp) * 0.0035;
        drawBolt(bolt, cp, width, flick);
        bolt.mesh.visible = true;
        if (bolt.flare) {
          bolt.flare.visible = true;
          bolt.flare.position.copy(tip);
          bolt.flare.quaternion.copy(c.getWorldQuaternion(new Q()));
          bolt.flare.scale.setScalar(tip.distanceTo(cp) * (0.07 + Math.random() * 0.03));
          bolt.flare.material.opacity = flick;
        }
        bolt.flash.style.opacity = (0.35 * flick).toFixed(3);
        bolt.glow = Math.max(bolt.glow || 0, 4.5 * flick);
      } else {
        bolt.mesh.visible = false;
        if (bolt.flare) {
          // the blade keeps a soft charge between strikes
          bolt.flare.visible = true;
          bolt.flare.position.copy(tip);
          bolt.flare.quaternion.copy(c.getWorldQuaternion(new Q()));
          bolt.flare.scale.setScalar(tip.distanceTo(cp) * 0.035);
          bolt.flare.material.opacity = 0.35 + Math.sin(performance.now() / 180) * 0.12;
        }
        bolt.flash.style.opacity = 0;
      }
      bolt.glow = (bolt.glow || 0) * Math.pow(0.004, dt);
      var sm2 = f.rig.sword.mat;
      if (sm2) {
        if (sm2.emissiveMap) { sm2.emissiveMap = null; sm2.needsUpdate = true; }
        var gl = Math.min(1, bolt.glow);
        sm2.emissive.setRGB(0.85 * gl, 0.93 * gl, gl);
        sm2.emissiveIntensity = 1 + bolt.glow * 1.6;
      }
    }

    var lastBehind = null, everShown = false;
    var clock = performance.now();
    var update = character.update.bind(character);
    character.update = function () {
      var out = update.apply(null, arguments);
      // the intro's colour-split burst and scanline glitch, kept to a soft shimmer
      var rdr = exp.renderer;
      if (rdr && !rdr.__soft) {
        rdr.__soft = true;
        var clampProp = function (obj, key, max) {
          if (!obj) return;
          var v = obj[key];
          Object.defineProperty(obj, key, { configurable: true, get: function () { return v; }, set: function (x) { v = Math.min(x, max); } });
          obj[key] = v;
        };
        clampProp(rdr.chromaticPulse, 'value', 0.12);
        clampProp(rdr.glitch, 'intensity', 0.06);
        if (rdr.glitchPass && rdr.glitchPass.uniforms && rdr.glitchPass.uniforms.uIntensity) clampProp(rdr.glitchPass.uniforms.uIntensity, 'value', 0.06);
      }
      var now = performance.now(), dt = Math.min(0.1, (now - clock) / 1000), t = now / 1000;
      clock = now;
      var route = character.currentRoute;
      var want = ROUTES[route] || FIRST;
      // on a case page the slides sit behind the figure: drawn first, writing no depth,
      // so the wings always pass in front of them instead of cutting through
      var behind = route === 'case-inner';
      if (behind !== lastBehind) {
        (character.panels || []).forEach(function (m) {
          var mt = m.material; if (!mt) return;
          if (mt.userData.dw0 === undefined) mt.userData.dw0 = mt.depthWrite;
          mt.depthWrite = behind ? false : mt.userData.dw0;
          m.renderOrder = behind ? -5 : 0;
        });
        lastBehind = behind;
      }
      if (behind && character.panels && character.panels[0] && character.panels[0].renderOrder !== -5) lastBehind = null;
      // the spin: follows the drag, glides on when let go, and only on home
      if (route === 'home') {
        if (!drag.down) {
          drag.spin += drag.vel * dt; drag.vel *= Math.pow(0.04, dt);
          drag.idle = (drag.idle || 0) + dt;
          // after a moment untouched he turns back to face the viewer
          if (drag.idle > 1.6) drag.spin *= Math.pow(0.25, dt);
        } else drag.idle = 0;
      } else {
        drag.vel = 0; drag.spin *= Math.pow(0.02, dt);
      }
      var hero = figures[ROUTES.home], camF = cam();
      if (hero && hero.ready && hero.rig && camF && route === 'home' && !character._introPlaying) {
        // the yaw that turns his chest square to the camera
        var tbh = hero.rig.tb;
        var chestF = V().crossVectors(tbh.lupper.getWorldPosition(V()).sub(tbh.rupper.getWorldPosition(V())), V(0, 1, 0));
        chestF.y = 0;
        var toC = camF.getWorldPosition(V()).sub(tbh.pelvis.getWorldPosition(V())); toC.y = 0;
        if (chestF.lengthSq() > 1e-8 && toC.lengthSq() > 1e-8) {
          chestF.normalize(); toC.normalize();
          var off = Math.atan2(chestF.x * toC.z - chestF.z * toC.x, chestF.x * toC.x + chestF.z * toC.z);
          // feedback: nudge the facing until the chest meets the camera (minus the viewer's drag)
          hero.faceOff = off;
          hero.face = (hero.face || 0) - (off + ((hero.spec.mount && hero.spec.mount.yaw) || 0) * (hero.ride || 0)) * Math.min(1, dt * 2.2);
        }
      } else if (hero) hero.face = (hero.face || 0) * Math.pow(0.05, dt);
      for (var sk in figures) figures[sk].spin = sk === ROUTES.home ? drag.spin + (figures[sk].face || 0) : 0;
      // the sword sequence runs once the home intro is over, and starts again on each return
      var hf = figures[ROUTES.home];
      if (hf) hf.seq = route === 'home' && !character._introPlaying ? (hf.seq || 0) + dt : 0;
      if (hf) hf.ride = (hf.ride || 0) + ((route === 'home' && !character._introPlaying ? 1 : 0) - (hf.ride || 0)) * Math.min(1, dt * 1.6);
      // during the intro flight there is no horse at all (no glitching away in front of the lens)
      if (hf && character._introPlaying) hf.ride = 0;
      try { updateBolt(dt, route); } catch (e) { if (!window.__boltErr) { window.__boltErr = 1; console.warn('[pantheon] bolt', e); } }
      load(want);
      // once the first figure is in, fetch the rest one at a time so later pages are ready
      if (figures[want] && figures[want].ready) {
        for (var pk in FIGURES) { if (!figures[pk]) { load(pk); break; } if (!figures[pk].ready) break; }
      }
      model.updateMatrixWorld(true);
      // crossfade: the old figure dissolves while the new one rises in, at the same time
      GT.value = now / 1000;
      var othersOut = true;
      for (var key in figures) {
        var f = figures[key];
        if (!f.ready || key === want) continue;
        if (f.presence > 0) {
          f.presence = Math.max(0, f.presence - dt / 0.55);
          // a burst of tearing at once, then sliced away to nothing
          if (f.gU) f.gU.value = f.presence > 0 ? Math.min(1, 0.35 + (1 - f.presence) * 0.8) : 1;
          othersOut = false;
        }
        f.root.visible = f.presence > 0.001;
      }
      var w = figures[want];
      // the very first figure simply appears: nothing to glitch away from yet
      if (w && w.ready && !everShown) { w.presence = 1; if (w.gU) w.gU.value = 0; everShown = true; }
      if (w && w.ready && othersOut && w.presence < 1) {
        w.presence = Math.min(1, w.presence + dt / 0.5);
        if (w.gU) w.gU.value = w.presence < 1 ? Math.max(0, 1 - w.presence * 1.15) : 0;
      }
      if (w && w.ready && w.presence >= 1 && w.gU) w.gU.value = 0;
      for (var key2 in figures) {
        var g = figures[key2];
        if (!g.ready) continue;
        g.root.visible = g.presence > 0.01;
        if (g.root.visible) {
          place(g, t, dt);
          var gv = g.gU ? g.gU.value : 0;
          if (gv > 0.02 && Math.random() < 0.6) {
            var jit = (Math.random() - 0.5) * 0.09 * gv * restHeight;
            g.root.position.x += jit; g.root.position.z -= jit * 0.5;
            g.root.updateMatrixWorld(true);
          }
        }
        else if (g.mount && g.mount.ready) g.mount.root.visible = false;
      }
      if (dragon) {
        if (!dragon.dressed) dragon.dressed = dragon.dress();
        var on = route === 'home' ? 1 : 0;
        dragon.presence += (on - dragon.presence) * Math.min(1, dt * 1.2);
        dragon.root.visible = dragon.presence > 0.01;
        for (var di = 0; di < dragon.mats.length; di++) dragon.mats[di].opacity = dragon.presence;
        var c2 = cam();
        if (!on && dragon.presence < 0.02) dragon.anchor = null;
        if (dragon.root.visible && c2) {
          // Beyond the ring of files, on the far side of the hero from the
          // camera, rising out of the fog: its height is solved so the head
          // sits high in the frame, and its size so it fills about half of it.
          c2.updateMatrixWorld(true);
          c2.getWorldPosition(cp);
          hips.getWorldPosition(hp);
          var dx = hp.x - cp.x, dz = hp.z - cp.z, dl = Math.max(Math.hypot(dx, dz), 1e-6);
          var gx = hp.x + dx / dl * bodyHeight * DRAGON.dist, gz = hp.z + dz / dl * bodyHeight * DRAGON.dist;
          // a phone's frame is tall and thin: a smaller head, higher up, so it
          // crowns the title instead of sitting on it
          var dNarrow = (c2.aspect || 1) < 0.8;
          var dSize = DRAGON.size * (dNarrow ? 0.62 : 1), dScreenY = dNarrow ? 1.0 : DRAGON.screenY;
          var lo = -bodyHeight * 40, hi = bodyHeight * 80, probe = V();
          for (var it = 0; it < 24; it++) {
            var mid = (lo + hi) / 2;
            probe.set(gx, mid, gz).project(c2);
            if (probe.y > dScreenY) hi = mid; else lo = mid;
          }
          var want = V(gx, (lo + hi) / 2, gz);
          var dist = want.distanceTo(cp);
          var span = 2 * dist * Math.tan((c2.fov || 50) * Math.PI / 360);
          if (!dragon.anchor) dragon.anchor = want.clone();
          dragon.anchor.lerp(want, Math.min(1, dt * 0.6)); // trails the camera a little
          dragon.root.scale.setScalar(span * dSize);
          dragon.root.position.copy(dragon.anchor);
          dragon.root.position.y += Math.sin(t * 0.35) * span * 0.006 + span * dSize * 0.12;
          // face the camera, head lowered a little, a slow living sway
          dragon.root.rotation.set(0, Math.atan2(cp.x - dragon.anchor.x, cp.z - dragon.anchor.z) + Math.sin(t * 0.17) * 0.05, 0);
          dragon.root.rotateX(DRAGON.tilt + Math.sin(t * 0.21) * 0.02);
          dragon.root.updateMatrixWorld(true);
          var inv = dragon.root.getWorldQuaternion(c2.quaternion.clone()).invert();
          var pulse = 0.75 + 0.25 * Math.sin(t * 1.7) * Math.sin(t * 0.63);
          dragon.eyes.forEach(function (e) {
            e.material.opacity = dragon.presence * pulse;
            e.scale.setScalar(DRAGON.eye * (0.9 + 0.2 * pulse));
            e.quaternion.copy(inv).multiply(c2.quaternion);
          });
          dragon.fogs.forEach(function (f) {
            var sd = f.userData.seed, bp = f.userData.base;
            f.position.set(bp[0] + Math.sin(t * 0.05 + sd) * 0.12, bp[1] + Math.sin(t * 0.08 + sd) * 0.05, bp[2]);
            f.material.opacity = 0.2 * dragon.presence;
            f.quaternion.copy(inv).multiply(c2.quaternion);
          });
        }
      }
      return out;
    };

    load(FIRST);
    setTimeout(function () { Object.keys(FIGURES).forEach(load); }, 3000);
    window.__pantheon = { figures: figures, routes: ROUTES, specs: FIGURES, get dragon() { return dragon; } };
  }
})();
