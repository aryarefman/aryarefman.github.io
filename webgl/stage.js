/*
 * The stage: the scene's red light and red effects, recoloured.
 *
 *   gold    #ffb84a  the lights: the pool on the floor, the area glow
 *   gold    #e8c472  the effects: the intro shockwave, sparks, the lightning
 *   ink     #070b1a  the night behind everything
 *
 * The bundle sets some colours once and animates others, so the lights are
 * recoloured every frame and the materials are swept now and then for any
 * red they still carry.
 */
(function () {
  'use strict';

  var COBALT = 0x8a5a22, LIME = 0xf3d08a, INK = '#05070f';
  var SOFT_LIME = 0xf6e7c1;

  try { document.documentElement.style.background = INK; document.body.style.background = INK; } catch (e) {}

  var tries = 0;
  var timer = setInterval(function () {
    var exp = window.experience;
    var character = exp && exp.world && exp.world.character;
    if (character && character.model && exp.scene) {
      clearInterval(timer);
      try { start(exp, character); } catch (err) { console.warn('[stage]', err); }
    } else if (++tries > 600) {
      clearInterval(timer);
    }
  }, 50);

  // red, or the pale pinks the bundle mixes from red
  function reddish(c) {
    if (!c || !c.isColor) return false;
    var r = c.r, g = c.g, b = c.b;
    return r > 0.2 && r > g * 1.35 && r > b * 1.35;
  }
  function pale(c) { return c.g > 0.45 && c.b > 0.45; }

  function start(exp, character) {
    var scene = exp.scene;

    // settings the bundle reads again whenever it rebuilds an effect
    if (character.introBurst) {
      character.introBurst.waveColor = '#e8c472';
      character.introBurst.particleColor = '#f6e7c1';
    }
    if (character.ambient) character.ambient.color = '#f3e2b8';

    var lights = [];
    scene.traverse(function (o) { if (o.isLight && !o.isAmbientLight) lights.push(o); });

    var swept = new WeakSet();
    function recolourMaterial(m) {
      if (!m || swept.has(m) || (m.userData && m.userData.stageKeep)) return;
      swept.add(m);
      if (reddish(m.color)) m.color.setHex(pale(m.color) ? SOFT_LIME : LIME);
      if (reddish(m.emissive)) m.emissive.setHex(COBALT);
      if (m.uniforms) {
        for (var k in m.uniforms) {
          var u = m.uniforms[k] && m.uniforms[k].value;
          if (u && u.isColor && reddish(u)) u.setHex(pale(u) ? SOFT_LIME : LIME);
          if (u && u.isVector3 && /colou?r/i.test(k) && u.x > 0.2 && u.x > u.y * 1.35 && u.x > u.z * 1.35) u.set(0.83, 1, 0.23);
        }
      }
    }
    function sweep() {
      scene.traverse(function (o) {
        if (o.isLight && lights.indexOf(o) < 0 && !o.isAmbientLight) lights.push(o);
        if (!o.material) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(recolourMaterial);
      });
    }
    sweep();
    setInterval(sweep, 1000);

    // the floor reads as a cool slate, not warm paper
    scene.traverse(function (o) {
      if (o.isMesh && o.name === 'Floor' && o.material && o.material.color) {
        o.material.color.setHex(0x2a2f45);
        if ('roughness' in o.material) o.material.roughness = 0.6;
      }
    });

    var update = character.update.bind(character);
    character.update = function () {
      var out = update.apply(null, arguments);
      for (var i = 0; i < lights.length; i++) {
        var l = lights[i];
        if (reddish(l.color)) l.color.setHex(COBALT);
      }
      return out;
    };

    window.__stage = { lights: lights, sweep: sweep };
  }
})();
