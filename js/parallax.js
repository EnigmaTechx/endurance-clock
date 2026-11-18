/*
 * Tilt parallax for the 2D page.
 *
 * Input is the device gyroscope on phones (relative to how the phone is
 * being held) or the mouse on desktop. Layers move by depth: the starfield
 * furthest and opposite to the input, the Gargantua glow less so, the ring
 * tilts in perspective, and the hands and second craft shift slightly
 * towards the input. Page decoration only; the clock component does not
 * depend on it.
 */
(function () {
  'use strict';

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var starfield = document.getElementById('starfield');
  var clock = document.querySelector('.endurance-clock');
  var tiltButton = document.getElementById('tilt-enable');
  var hint = document.getElementById('site-hint');
  if (!clock) return;

  var svg = null, gargantua = null, hands = null, seconds = null;

  // the component builds its DOM on DOMContentLoaded; look the parts up lazily
  function bind() {
    if (svg) return true;
    svg = clock.querySelector('.endurance-clock__svg');
    gargantua = clock.querySelector('.endurance-clock__gargantua');
    hands = clock.querySelector('.ec-hands');
    seconds = clock.querySelector('.ec-seconds-group');
    return !!svg;
  }

  // depth amounts, in px at a 700px-wide clock; scaled with the clock's size
  var DEPTH = { stars: -22, gargantua: -12, hands: 7, seconds: 10 };
  var MAX_TILT_DEG = 7;
  var ORIENTATION_RANGE = 18;   // degrees of phone tilt for full effect

  var target = { x: 0, y: 0 };
  var current = { x: 0, y: 0 };
  var raf = 0;
  var usingOrientation = false;
  var base = null;              // neutral holding angle, captured from the first readings

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function setTargetFromPointer(e) {
    if (usingOrientation) return;
    target.x = (e.clientX / window.innerWidth) * 2 - 1;
    target.y = (e.clientY / window.innerHeight) * 2 - 1;
    schedule();
  }

  // Touch fallback: a finger dragged across the page steers the layers
  // (the gyroscope takes over as soon as it delivers readings)
  var touchId = null;
  function onTouchDown(e) {
    if (e.pointerType !== 'touch' || usingOrientation) return;
    if (e.target.closest && e.target.closest('a, button')) return;
    touchId = e.pointerId;
    setTargetFromPointer(e);
  }
  function onTouchMove(e) {
    if (e.pointerId !== touchId || usingOrientation) return;
    setTargetFromPointer(e);
  }
  function onTouchUp(e) {
    if (e.pointerId !== touchId) return;
    touchId = null;
    if (!usingOrientation) { target.x = 0; target.y = 0; schedule(); }
  }

  function onOrientation(e) {
    if (e.gamma == null || e.beta == null) return;
    var gamma = e.gamma;   // left-right, -90..90
    var beta = e.beta;     // front-back, -180..180
    var angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    var x, y;
    if (angle === 90) { x = beta; y = -gamma; }
    else if (angle === -90 || angle === 270) { x = -beta; y = gamma; }
    else if (angle === 180) { x = -gamma; y = -beta; }
    else { x = gamma; y = beta; }

    if (!base) base = { x: x, y: y, n: 1 };
    else if (base.n < 20) {   // settle the neutral angle over the first readings
      base.x += (x - base.x) * 0.2; base.y += (y - base.y) * 0.2; base.n++;
    } else {
      // drift the neutral angle slowly so a new holding position becomes neutral
      base.x += (x - base.x) * 0.003; base.y += (y - base.y) * 0.003;
    }
    usingOrientation = true;
    target.x = clamp((x - base.x) / ORIENTATION_RANGE, -1, 1);
    target.y = clamp((y - base.y) / ORIENTATION_RANGE, -1, 1);
    schedule();
  }

  function apply() {
    raf = 0;
    if (!bind()) return;
    var dx = target.x - current.x, dy = target.y - current.y;
    current.x += dx * 0.08;
    current.y += dy * 0.08;
    var settled = Math.abs(dx) < 0.0005 && Math.abs(dy) < 0.0005;
    if (settled) { current.x = target.x; current.y = target.y; }

    var scale = clock.getBoundingClientRect().width / 700;
    var x = current.x, y = current.y;

    if (starfield) {
      starfield.style.transform = 'translate3d(' + (x * DEPTH.stars * scale) + 'px,' + (y * DEPTH.stars * scale) + 'px,0) scale(1.08)';
    }
    gargantua.style.transform = 'translate3d(calc(-50% + ' + (x * DEPTH.gargantua * scale) + 'px),' + (y * DEPTH.gargantua * scale) + 'px,0)';
    svg.style.transform = 'perspective(1400px) rotateY(' + (x * MAX_TILT_DEG) + 'deg) rotateX(' + (-y * MAX_TILT_DEG) + 'deg)';
    // SVG user units: the viewBox is 1000 wide, so convert px to units
    var unit = 1000 / (700 * scale);
    hands.setAttribute('transform', 'translate(' + (x * DEPTH.hands * scale * unit).toFixed(2) + ' ' + (y * DEPTH.hands * scale * unit).toFixed(2) + ')');
    seconds.setAttribute('transform', 'translate(' + (x * DEPTH.seconds * scale * unit).toFixed(2) + ' ' + (y * DEPTH.seconds * scale * unit).toFixed(2) + ')');

    if (!settled) schedule();
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(apply);
  }

  // ---- wire up ----

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'mouse') setTargetFromPointer(e);
    else onTouchMove(e);
  });
  window.addEventListener('pointerdown', onTouchDown);
  window.addEventListener('pointerup', onTouchUp);
  window.addEventListener('pointercancel', onTouchUp);
  document.addEventListener('pointerleave', function () {
    if (!usingOrientation) { target.x = 0; target.y = 0; schedule(); }
  });

  // Listen straight away: Android and desktop browsers deliver readings (or
  // nothing) without asking; iOS delivers nothing until the page asks for
  // motion access from a user gesture. On a touch device with no reading
  // after a moment, offer a Tilt button: it asks where asking is possible,
  // and otherwise explains how to allow motion sensors for the site.
  var canRequest = typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function';
  var isTouch = navigator.maxTouchPoints > 0;
  var isBrave = !!(navigator.brave && typeof navigator.brave.isBrave === 'function');
  var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if ('DeviceOrientationEvent' in window) {
    window.addEventListener('deviceorientation', onOrientation);
  }

  function showHint(text) {
    if (!hint) return;
    hint.textContent = text;
    hint.hidden = false;
    clearTimeout(showHint.timer);
    showHint.timer = setTimeout(function () { hint.hidden = true; }, 9000);
  }

  function blockedMessage() {
    if (isIOS) return 'Motion access was not granted. Allow Motion & Orientation Access for this browser in iOS Settings, then reload.';
    if (isBrave) return 'Brave blocks motion sensors by default. Allow them for this site under Settings \u2192 Site settings \u2192 Motion sensors, then reload. Dragging a finger across the page works meanwhile.';
    return 'This browser is not sharing motion sensors with the page. Allow motion sensors for this site in its settings, then reload. Dragging a finger across the page works meanwhile.';
  }

  function blocked() {
    tiltButton.textContent = 'Tilt off';
    tiltButton.disabled = true;
    tiltButton.title = blockedMessage();
    showHint(blockedMessage());
  }

  function awaitReadings() {
    setTimeout(function () {
      if (usingOrientation) tiltButton.hidden = true;
      else blocked();
    }, 1500);
  }

  if (isTouch && tiltButton) {
    setTimeout(function () {
      if (usingOrientation) return;
      tiltButton.hidden = false;
      tiltButton.addEventListener('click', function () {
        if (canRequest) {
          DeviceOrientationEvent.requestPermission().then(function (state) {
            if (state === 'granted') awaitReadings();
            else blocked();
          }).catch(blocked);
        } else {
          awaitReadings();
        }
      });
    }, 1500);
  }

  window.addEventListener('orientationchange', function () { base = null; });
  clock.classList.add('has-parallax');
})();
