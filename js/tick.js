/*
 * Tick sound.
 *
 * A quiet, dry tick synthesised in WebAudio (no audio files), scheduled
 * against the wall clock so it lands on the same second boundaries the
 * hands and the orbiting craft follow. Alternate seconds get a slightly
 * lower tock. Off by default; the preference is remembered, and because
 * browsers only start audio after a gesture, a remembered-on tick begins
 * at the first tap or key press on the page.
 *
 * The source can be changed: Miller's planet mode ticks once per Earth
 * day of dilated time with a deeper, slower sound, a nod to the score.
 *
 * Classic script: defines window.Tick and binds a #tick-toggle button if
 * one exists.
 */
(function (global) {
  'use strict';

  var STORE_KEY = 'endurance.tick';
  var MASTER_GAIN = 0.14;

  var ctx = null;
  var master = null;
  var noiseBuffer = null;
  var enabled = false;
  var timer = 0;
  var lastScheduled = -Infinity;   // wall ms of the last tick scheduled
  var source = { periodMs: 1000, anchorMs: 0, style: 'clock' };
  var button = null;

  function store(v) { try { localStorage.setItem(STORE_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ } }
  function load() { try { return localStorage.getItem(STORE_KEY) === '1'; } catch (e) { return false; } }

  // ---------- audio graph ----------

  function ensureContext() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);
      // one second of white noise, reused for every tick
      var len = ctx.sampleRate;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    return ctx;
  }

  /** One tick at audio time `at`. `alt` is the tock variant. */
  function scheduleTick(at, alt) {
    var clock = source.style === 'clock';
    // body: a filtered noise burst
    var noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = clock ? (alt ? 1500 : 1900) : (alt ? 760 : 900);
    bp.Q.value = clock ? 9 : 6;
    var env = ctx.createGain();
    var decay = clock ? 0.028 : 0.075;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(clock ? 0.9 : 1.0, at + 0.0015);
    env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    noise.connect(bp).connect(env).connect(master);
    noise.start(at);
    noise.stop(at + decay + 0.02);

    // transient: a tiny sine blip gives the click its edge
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = clock ? (alt ? 2300 : 2700) : 1100;
    var oenv = ctx.createGain();
    oenv.gain.setValueAtTime(0.0001, at);
    oenv.gain.exponentialRampToValueAtTime(clock ? 0.35 : 0.3, at + 0.001);
    oenv.gain.exponentialRampToValueAtTime(0.0001, at + (clock ? 0.008 : 0.02));
    osc.connect(oenv).connect(master);
    osc.start(at);
    osc.stop(at + 0.03);

    if (!clock) {
      // Miller: a soft low thump under each day's tick
      var low = ctx.createOscillator();
      low.type = 'sine';
      low.frequency.setValueAtTime(140, at);
      low.frequency.exponentialRampToValueAtTime(70, at + 0.12);
      var lenv = ctx.createGain();
      lenv.gain.setValueAtTime(0.0001, at);
      lenv.gain.exponentialRampToValueAtTime(0.6, at + 0.004);
      lenv.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      low.connect(lenv).connect(master);
      low.start(at);
      low.stop(at + 0.2);
    }
  }

  // ---------- scheduler ----------

  function pump() {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    var lookahead = document.hidden ? 1.6 : 0.35;    // background timers run once a second
    var nowMs = Date.now();
    var audioNow = ctx.currentTime;
    var horizon = nowMs + lookahead * 1000;
    if (source.next) {
      // irregular pattern: the source says when the next tick falls
      var n = source.next(Math.max(nowMs, lastScheduled));
      while (n && n.at <= horizon) {
        if (n.at > lastScheduled) {
          scheduleTick(audioNow + (n.at - nowMs) / 1000, !!n.alt);
          lastScheduled = n.at;
        }
        n = source.next(n.at);
      }
      return;
    }
    // next tick strictly after the last scheduled one, and not in the past
    var k = Math.floor((Math.max(nowMs, lastScheduled + 1) - source.anchorMs) / source.periodMs) + 1;
    var t = source.anchorMs + k * source.periodMs;
    if (t <= lastScheduled) t += source.periodMs;
    while (t <= horizon) {
      var at = audioNow + (t - nowMs) / 1000;
      if (at >= audioNow) scheduleTick(at, Math.round((t - source.anchorMs) / source.periodMs) % 2 === 1);
      lastScheduled = t;
      t += source.periodMs;
    }
  }

  function start() {
    if (timer) return;
    lastScheduled = -Infinity;
    timer = setInterval(pump, 100);
    pump();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = 0;
  }

  // ---------- public ----------

  function setEnabled(on, fromGesture) {
    enabled = !!on;
    store(enabled);
    if (button) button.setAttribute('aria-pressed', String(enabled));
    if (enabled) {
      if (fromGesture) ensureContext();
      if (ctx && ctx.state === 'running') start();
      else armGesture();
    } else {
      stop();
    }
  }

  // a remembered-on tick can only start after the first interaction
  var armed = false;
  function armGesture() {
    if (armed) return;
    armed = true;
    var kick = function () {
      if (!enabled) return cleanup();
      var c = ensureContext();
      if (!c) return cleanup();
      var go = function () { if (enabled) start(); cleanup(); };
      if (c.state === 'running') go(); else c.resume().then(go, cleanup);
    };
    var cleanup = function () {
      armed = false;
      global.removeEventListener('pointerdown', kick, true);
      global.removeEventListener('keydown', kick, true);
    };
    global.addEventListener('pointerdown', kick, true);
    global.addEventListener('keydown', kick, true);
  }

  /**
   * Change what a tick marks.
   * @param s  {periodMs, anchorMs, style} for a regular tick, or {next(afterMs) -> {at, alt}|null, style}
   *           for an irregular pattern; null restores the second tick
   */
  function setSource(s) {
    source = s || { periodMs: 1000, anchorMs: 0, style: 'clock' };
    lastScheduled = -Infinity;
  }

  function bind() {
    button = document.getElementById('tick-toggle');
    if (button) {
      button.addEventListener('click', function () { setEnabled(!enabled, true); });
    }
    if (load()) setEnabled(true, false);
  }

  if (global.document) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
  }

  // keep audio alive across tab switches
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && enabled && ctx && ctx.state === 'suspended') ctx.resume().catch(function () {});
    if (!document.hidden && enabled) { lastScheduled = -Infinity; }
  });

  global.Tick = {
    setEnabled: setEnabled,
    isEnabled: function () { return enabled; },
    setSource: setSource,
    getSource: function () { return source; }
  };
})(window);
