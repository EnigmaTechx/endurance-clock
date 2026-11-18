/*
 * Starfield background: a slowly drifting field of stars on a canvas.
 * Page decoration only; the clock component does not depend on it.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('starfield');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var DENSITY = 1 / 4200;      // stars per CSS pixel^2
  var DRIFT_X = -2.4;          // CSS px per second
  var DRIFT_Y = 0.9;

  var stars = [];
  var width = 0, height = 0, dpr = 1;
  var last = 0;
  var brightness = 1;   // set by js/daylight.js: brighter at night, dimmer by day

  function rand(a, b) { return a + Math.random() * (b - a); }

  function seed() {
    stars = [];
    var count = Math.round(width * height * DENSITY);
    for (var i = 0; i < count; i++) {
      var depth = Math.random();               // 0 = far, 1 = near
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.4 + depth * 1.3,
        depth: depth,
        base: 0.25 + depth * 0.6,
        phase: Math.random() * Math.PI * 2,
        twinkle: rand(0.4, 1.6),
        warm: Math.random() < 0.18
      });
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    draw(performance.now(), 0);
  }

  function draw(t, dt) {
    ctx.clearRect(0, 0, width, height);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      if (dt) {
        var k = 0.35 + s.depth;                  // near stars drift faster
        s.x += DRIFT_X * k * dt;
        s.y += DRIFT_Y * k * dt;
        if (s.x < -4) s.x += width + 8;
        if (s.x > width + 4) s.x -= width + 8;
        if (s.y < -4) s.y += height + 8;
        if (s.y > height + 4) s.y -= height + 8;
      }
      var a = s.base * brightness;
      if (!reduceMotion) a *= 0.75 + 0.25 * Math.sin(t / 1000 * s.twinkle + s.phase);
      ctx.globalAlpha = Math.min(1, a);
      ctx.fillStyle = s.warm ? '#ffd9b0' : '#dfe8ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function frame(t) {
    var dt = last ? Math.min((t - last) / 1000, 0.1) : 0;
    last = t;
    draw(t, dt);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  if (!reduceMotion) requestAnimationFrame(frame);

  window.Starfield = {
    setBrightness: function (b) {
      brightness = b;
      if (reduceMotion) draw(performance.now(), 0);
    }
  };
})();
