/*
 * Dive door: the way out of paper mode. Clicking the dive button closes two
 * torn paper halves over the page, then the paper burns away from the centre
 * (the same burn as the loader, burn-paper.js) onto the violet night of dive
 * mode, and dive mode opens.
 */
(function () {
  'use strict';

  if (window.AryaDiveDoor) return;
  window.AryaDiveDoor = true;

  var PAPER = '#eae3d4';
  var NIGHT = 'radial-gradient(ellipse at 50% 42%, #4a2590 0%, #24145e 45%, #160d3a 80%)';
  var busy = false;

  function jagged(side) { // a rough torn inner edge for one half, as a clip-path polygon
    var pts = [side === 'l' ? '0% 0%' : '100% 0%'];
    for (var y = 0; y <= 100; y += 1.2 + Math.random() * 1.6) {
      var x = 94 + Math.sin(y * 0.21) * 2.2 + Math.random() * 2.4;
      pts.push((side === 'l' ? x : 100 - x).toFixed(1) + '% ' + y.toFixed(1) + '%');
    }
    pts.push(side === 'l' ? '0% 100%' : '100% 100%');
    return 'polygon(' + pts.join(',') + ')';
  }

  function loadBurn() {
    if (window.YuusukeBurn) return Promise.resolve(window.YuusukeBurn);
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = '/webflow-scripts/burn-paper.js';
      s.onload = function () { resolve(window.YuusukeBurn || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
  }

  function go(href) {
    if (busy) return;
    busy = true;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { location.href = href; return; }

    var door = document.createElement('div');
    door.className = 'dive-door';
    door.innerHTML = '<div class="dive-door__night"></div><div class="dive-door__half is-l"></div><div class="dive-door__half is-r"></div><div class="dive-door__paper"></div>';
    door.children[1].style.clipPath = jagged('l');
    door.children[2].style.clipPath = jagged('r');
    door.children[0].style.background = NIGHT;
    door.children[3].style.backgroundColor = PAPER;
    document.body.appendChild(door);
    if (window.YuusukeSound && window.YuusukeSound.click) { try { window.YuusukeSound.click(); } catch (e) {} }

    var burnReady = loadBurn();
    // the halves snap shut, then a whole sheet takes their place and burns
    setTimeout(function () {
      door.classList.add('is-shut');
      burnReady.then(function (api) {
        var sheet = door.children[3];
        var done = api && api.burn
          ? api.burn(sheet, { duration: 1.5, fireColor: '#ff5010', origin: [0.5, 0.5] })
          : new Promise(function (r) { sheet.style.transition = 'opacity .8s'; sheet.style.opacity = 0; setTimeout(r, 800); });
        done.then(function () { location.href = href; });
      });
    }, 620);
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.is-dive');
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    go(a.getAttribute('href') || '/');
  }, true);

  // coming back from dive mode with the browser's back button: no door left over
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    busy = false;
    var old = document.querySelector('.dive-door');
    if (old) old.parentNode.removeChild(old);
  });
})();
