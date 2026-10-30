(function () {
  'use strict';

  if (window.YuusukeAbout) return;

  var SCROLLER = '.component.is-about';
  var INDEX_LINK = '.about_index-link';
  var AWARD = '[data-award]';
  // Where a block's top lands inside the scroller, as a fraction of its height.
  // Matches where the first block rests on load, below the fixed heading.
  var ANCHOR_AT = 0.3;
  var BADGE_OFFSET_X = 20;
  var BADGE_OFFSET_Y = 14;
  var BADGE_EASE = 0.2;

  function injectCss() {
    if (document.getElementById('yuusuke-about-css')) return;
    var style = document.createElement('style');
    style.id = 'yuusuke-about-css';
    style.textContent =
      INDEX_LINK + '[aria-current="true"]{opacity:1;color:#eb1716}' +
      INDEX_LINK + ':focus:not(:focus-visible){outline:none}' +
      '.yuusuke-award-badge{position:fixed;left:0;top:0;z-index:150;pointer-events:none;' +
      'opacity:0;transition:opacity .2s ease;will-change:transform;' +
      'background:#eb1716;color:#000;padding:.7em 1em .8em;text-transform:uppercase;line-height:1;' +
      'font-family:Wdxllubrifontjpn,Arial,sans-serif;white-space:nowrap}' +
      '.yuusuke-award-badge.is-on{opacity:1}' +
      '.yuusuke-award-badge small{display:block;font-size:.75em;margin-bottom:.5em;opacity:.7}' +
      '.yuusuke-award-badge strong{display:block;font-size:1.5em;font-weight:400}' +
      '.yuusuke-award-badge img{display:block;width:7em;height:auto}' +
      '.yuusuke-award-badge.has-img{background:none;padding:0}';
    (document.head || document.documentElement).appendChild(style);
  }

  // ---- Topic index -----------------------------------------------------------

  function targetOf(link) {
    var hash = (link.getAttribute('href') || '').split('#')[1];
    return hash ? document.getElementById(hash) : null;
  }

  function scrollToTarget(target) {
    var scroller = target.closest(SCROLLER);
    if (!scroller) return;
    var top = scroller.scrollTop
      + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      - scroller.clientHeight * ANCHOR_AT;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
  }

  // Active = the last block whose top has passed the reading line.
  function refreshIndex() {
    var links = document.querySelectorAll(INDEX_LINK);
    if (!links.length) return;
    var active = links[0];
    Array.prototype.forEach.call(links, function (link) {
      var target = targetOf(link);
      var scroller = target && target.closest(SCROLLER);
      if (!scroller) return;
      var line = scroller.getBoundingClientRect().top + scroller.clientHeight * (ANCHOR_AT + 0.15);
      if (target.getBoundingClientRect().top <= line) active = link;
      // A short last block never reaches the line: the scroller bottoms out first.
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) active = links[links.length - 1];
    });
    Array.prototype.forEach.call(links, function (link) {
      if (link === active) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }

  // ---- Award badge that follows the mouse --------------------------------------

  var badge = null;
  var badgeOn = false;
  var mouseX = 0, mouseY = 0, badgeX = 0, badgeY = 0;
  var following = false;

  function ensureBadge() {
    if (badge) return badge;
    badge = document.createElement('div');
    badge.className = 'yuusuke-award-badge';
    badge.setAttribute('aria-hidden', 'true');
    document.body.appendChild(badge);
    return badge;
  }

  // data-award-img (a logo URL) wins; otherwise the badge is a text stamp.
  function fillBadge(el) {
    var node = ensureBadge();
    var img = el.getAttribute('data-award-img');
    node.textContent = '';
    node.classList.toggle('has-img', !!img);
    if (img) {
      var image = document.createElement('img');
      image.src = img;
      image.alt = '';
      node.appendChild(image);
      return;
    }
    var org = document.createElement('small');
    org.textContent = el.getAttribute('data-award') || '';
    var prize = document.createElement('strong');
    prize.textContent = el.getAttribute('data-award-prize') || '';
    node.appendChild(org);
    node.appendChild(prize);
  }

  function follow() {
    if (!badgeOn && Math.abs(mouseX - badgeX) < 0.5 && Math.abs(mouseY - badgeY) < 0.5) {
      following = false;
      return;
    }
    badgeX += (mouseX - badgeX) * BADGE_EASE;
    badgeY += (mouseY - badgeY) * BADGE_EASE;
    badge.style.transform = 'translate3d(' + (badgeX + BADGE_OFFSET_X) + 'px,' + (badgeY + BADGE_OFFSET_Y) + 'px,0) rotate(-4deg)';
    requestAnimationFrame(follow);
  }

  function showBadge(el, event) {
    fillBadge(el);
    mouseX = event.clientX;
    mouseY = event.clientY;
    if (!badgeOn) { badgeX = mouseX; badgeY = mouseY; }
    badgeOn = true;
    badge.classList.add('is-on');
    if (!following) { following = true; requestAnimationFrame(follow); }
  }

  function hideBadge() {
    badgeOn = false;
    if (badge) badge.classList.remove('is-on');
  }

  // ---- Binding (delegated, so Barba page swaps need no re-binding) -------------

  function bind() {
    document.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest(INDEX_LINK);
      if (!link) return;
      var target = targetOf(link);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      scrollToTarget(target);
    }, true);

    // scroll does not bubble; capture catches the inner scroller.
    document.addEventListener('scroll', function (event) {
      var node = event.target;
      if (node && node.matches && node.matches(SCROLLER)) refreshIndex();
    }, true);

    document.addEventListener('pointerover', function (event) {
      if (event.pointerType === 'touch') return;
      var el = event.target.closest && event.target.closest(AWARD);
      if (el) showBadge(el, event);
    }, true);

    document.addEventListener('pointermove', function (event) {
      if (!badgeOn) return;
      mouseX = event.clientX;
      mouseY = event.clientY;
    }, true);

    document.addEventListener('pointerout', function (event) {
      var el = event.target.closest && event.target.closest(AWARD);
      if (!el || el.contains(event.relatedTarget)) return;
      hideBadge();
    }, true);

    if (window.barba && window.barba.hooks) {
      window.barba.hooks.before(hideBadge);
      window.barba.hooks.afterEnter(function () { window.setTimeout(refreshIndex, 50); });
    }
  }

  injectCss();
  bind();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshIndex, { once: true });
  else refreshIndex();

  window.YuusukeAbout = { refresh: refreshIndex };
})();
