/*
 * Endurance Clock 3D, as an embeddable widget.
 *
 *   import { mount } from './endurance-clock-3d.js';
 *   const clock = mount(document.querySelector('#hero'), { transparent: true });
 *   clock.destroy();
 *
 * Or add data-endurance-clock-3d to an element and import this module; it
 * mounts automatically with options read from data-* attributes.
 *
 * The widget fills its container (give the container a size), creates its
 * own canvas and, unless readout is false, its own digital readout. It
 * pauses when scrolled out of view or when the tab is hidden. Several
 * instances can share a page. The camera rides in the ship's rotating
 * frame: the ring holds still while the starfield and Gargantua wheel
 * slowly around the ring's axis.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { buildShip, ORBIT_R } from './ship.js';
import { buildGargantua } from './gargantua.js';
import { buildStars } from './stars.js';
import { createReadout } from './readout.js';
import { buildRanger, dockTimeline } from './ranger.js';
import { FACTOR, rateAt, dilatedElapsed, splitElapsed } from './miller.js';
import { createAlarm } from './alarm.js';

const SKY_PERIOD = 600;              // seconds per revolution of the sky (ship spin, slowed)
const FRAME_HALF_EXTENT = ORBIT_R + 1.6;

const DEFAULTS = {
  transparent: false,     // alpha canvas so the page shows through (bloom is off in this mode)
  readout: true,          // create the digital readout inside the container
  gargantua: true,
  stars: true,
  quality: 'auto',        // 'auto' | 'low' | 'high' (bloom and pixel ratio)
  interactive: true,      // pointer tilt and drag
  sway: true,             // gentle idle motion
  pitch: 11,              // camera look-down angle in degrees
  fit: 1.04,              // framing margin around the ring; smaller is tighter
  pauseWhenHidden: true,  // stop rendering when off-screen or in a hidden tab
  hour12: undefined,      // readout format; undefined follows the locale
  locale: undefined,
  timeOffset: 0,          // ms added to the clock (demos)
  daylight: true,         // use window.Daylight if the page loaded js/daylight.js
  overlays: null,         // { top: Element, bottom: Element } to keep the ring clear of
  alarmControls: null,    // panel elements for the alarm (see alarm.js); API works without
  fallback: null,         // element to reveal if WebGL is unavailable
  onMillerChange: null,   // (on: boolean, state: {t0}) => void
  onMurphChange: null,    // (on: boolean) => void
  onReady: null
};

function readDataOptions(el) {
  const d = el.dataset;
  const bool = (v) => v === '' || v === 'true' || v === '1';
  const o = {};
  if ('transparent' in d) o.transparent = bool(d.transparent);
  if ('readout' in d) o.readout = bool(d.readout);
  if ('gargantua' in d) o.gargantua = bool(d.gargantua);
  if ('stars' in d) o.stars = bool(d.stars);
  if ('interactive' in d) o.interactive = bool(d.interactive);
  if ('sway' in d) o.sway = bool(d.sway);
  if ('quality' in d) o.quality = d.quality;
  if ('pitch' in d) o.pitch = Number(d.pitch);
  if ('fit' in d) o.fit = Number(d.fit);
  if ('hour12' in d) o.hour12 = bool(d.hour12);
  if ('locale' in d) o.locale = d.locale;
  return o;
}

function buildReadoutDom() {
  const overlay = document.createElement('div');
  overlay.className = 'ec3d__overlay';
  overlay.innerHTML =
    '<div class="clock3d__readout">' +
      '<div class="clock3d__time"><span class="ec-hm"></span><span class="ec-seconds"></span><span class="ec-period"></span></div>' +
      '<div class="clock3d__meta"></div>' +
      '<div class="clock3d__meta clock3d__meta--miller" hidden></div>' +
      '<div class="clock3d__meta clock3d__meta--murph" hidden></div>' +
      '<div class="clock3d__meta clock3d__meta--alarm" hidden></div>' +
    '</div>';
  return overlay;
}

/**
 * Mount the clock into `container`. Returns the instance.
 */
export function mount(container, options) {
  if (!container) throw new Error('EnduranceClock3D.mount: container required');
  if (container.__enduranceClock3D) return container.__enduranceClock3D;
  const opts = Object.assign({}, DEFAULTS, options || {});

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const width = () => Math.max(1, container.clientWidth);
  const height = () => Math.max(1, container.clientHeight);
  const lowQuality = opts.quality === 'low' || (opts.quality !== 'high' &&
    navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4 && width() < 900);
  const useBloom = !lowQuality && !opts.transparent;

  const nowDate = () => new Date(Date.now() + opts.timeOffset);

  // ---------- DOM ----------

  container.classList.add('ec3d');
  if (opts.transparent) container.classList.add('ec3d--transparent');
  const canvas = document.createElement('canvas');
  canvas.className = 'ec3d__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  let overlay = null;
  if (opts.readout) {
    overlay = buildReadoutDom();
    container.appendChild(overlay);
  }
  const readoutRoot = overlay || container;
  container.setAttribute('role', 'img');
  container.setAttribute('aria-label', 'Endurance clock');

  // ---------- renderer ----------

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: !useBloom, alpha: opts.transparent, powerPreference: 'high-performance'
    });
  } catch (err) {
    container.classList.add('ec3d--failed');
    if (opts.fallback) opts.fallback.hidden = false;
    throw err;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  // pure black: with post-processing the clear colour is tone-mapped too,
  // and anything above black gets lifted into a grey haze
  renderer.setClearColor(0x000000, opts.transparent ? 0 : 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1200);

  const rig = new THREE.Group();     // rotates everything the viewer sees
  scene.add(rig);
  const sky = new THREE.Group();     // wheels slowly around the ring axis
  rig.add(sky);

  // ---------- content ----------

  const stars = opts.stars ? buildStars(reduceMotion ? 2200 : 3200, reduceMotion) : null;
  if (stars) sky.add(stars.points);

  const gargantua = opts.gargantua ? buildGargantua() : null;
  if (gargantua) {
    gargantua.group.position.set(30, 11, -84);
    gargantua.group.scale.setScalar(1.7);
    sky.add(gargantua.group);
  }

  const ship = buildShip();
  rig.add(ship.group);

  const ranger = buildRanger(ship.glowTex);
  ship.group.add(ranger.group);

  // ---------- lights ----------

  const hemi = new THREE.HemisphereLight(0x5a6c90, 0x05070c, 0.75);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffb27a, 1.7);   // from Gargantua's direction
  scene.add(key);
  scene.add(key.target);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 0.7);
  rim.position.set(-14, 10, 18);
  scene.add(rim);
  const front = new THREE.DirectionalLight(0xffffff, 0.35);
  front.position.set(0, 4, 30);
  scene.add(front);
  const gargantuaDir = new THREE.Vector3(30, 11, -84).normalize();

  // ---------- time-of-day lighting ----------

  const daylight = opts.daylight ? (window.Daylight || null) : null;
  const setColor = (color, rgb) => color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
  let lastDaylightAt = -Infinity;
  let daylightPalette = null;

  function applyDaylight(realNow, force) {
    if (!daylight) return;
    const ms = realNow.getTime();
    if (!force && ms - lastDaylightAt < 1000) return;
    lastDaylightAt = ms;
    const p = daylight.at(realNow);
    daylightPalette = p;
    setColor(key.color, p.key);
    key.intensity = p.keyIntensity;
    setColor(hemi.color, p.sky);
    setColor(hemi.groundColor, p.ground);
    hemi.intensity = p.hemiIntensity;
    setColor(rim.color, p.rim);
    rim.intensity = p.rimIntensity;
    renderer.toneMappingExposure = p.exposure;
  }

  // ---------- post-processing ----------

  let composer = null;
  let bloomPass = null;
  if (useBloom) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // threshold above 1.0 so only emissive surfaces bloom, never lit hull
    bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.2, 1.15);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }

  // ---------- sizing ----------

  function pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, useBloom ? 1.6 : 2);
  }

  /** Overlay reserves in container pixels: {top, bottom}. */
  function reserves() {
    const box = container.getBoundingClientRect();
    let top = 0, bottom = 0;
    const topEl = opts.overlays && opts.overlays.top;
    const bottomEl = (opts.overlays && opts.overlays.bottom) || (overlay && overlay.querySelector('.clock3d__readout'));
    if (topEl) {
      const r = topEl.getBoundingClientRect();
      if (r.height > 0) top = Math.max(0, r.bottom - box.top) + 12;
    }
    if (bottomEl) {
      const r = bottomEl.getBoundingClientRect();
      bottom = r.height > 0 ? Math.max(0, box.bottom - r.top) + 10 : box.height * 0.16;
    }
    return { top, bottom };
  }

  /**
   * Place the camera so the ring (plus the second craft's orbit) fits the
   * region between the overlays, centred in that region.
   */
  function frameCamera() {
    const w = width();
    const h = height();
    camera.aspect = w / h;
    const { top, bottom } = reserves();
    const availH = Math.max(h * 0.4, h - top - bottom);
    const sideMargin = Math.min(24, w * 0.04);
    const availW = Math.max(w * 0.5, w - sideMargin * 2);

    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const extent = FRAME_HALF_EXTENT * opts.fit;
    const dist = Math.max(extent * h / (availH * tanHalf), extent * h / (availW * tanHalf));

    const unitsPerPx = (2 * dist * tanHalf) / h;
    const targetY = -((bottom - top) / 2) * unitsPerPx;
    const pitch = THREE.MathUtils.degToRad(opts.pitch);
    camera.position.set(0, targetY + Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    camera.lookAt(0, targetY, 0);
    camera.updateProjectionMatrix();
  }

  function resize() {
    const pr = pixelRatio();
    const w = width(), h = height();
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    if (composer) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
    }
    frameCamera();
  }

  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  if (resizeObserver) resizeObserver.observe(container);
  else window.addEventListener('resize', resize);
  resize();

  // ---------- pointer tilt ----------

  const tilt = { x: 0, y: 0, tx: 0, ty: 0, dragging: false, lastX: 0, lastY: 0, idleSince: 0 };
  const MAX_TILT = THREE.MathUtils.degToRad(16);

  function setTargetFromPointer(clientX, clientY) {
    const box = container.getBoundingClientRect();
    const nx = ((clientX - box.left) / box.width) * 2 - 1;
    const ny = ((clientY - box.top) / box.height) * 2 - 1;
    tilt.ty = nx * MAX_TILT * 0.55;
    tilt.tx = ny * MAX_TILT * 0.45;
  }

  const onPointerMove = (e) => {
    if (reduceMotion) return;
    if (tilt.dragging) {
      tilt.ty += (e.clientX - tilt.lastX) * 0.004;
      tilt.tx += (e.clientY - tilt.lastY) * 0.004;
      tilt.lastX = e.clientX;
      tilt.lastY = e.clientY;
    } else if (e.pointerType === 'mouse') {
      setTargetFromPointer(e.clientX, e.clientY);
    }
    tilt.ty = THREE.MathUtils.clamp(tilt.ty, -MAX_TILT, MAX_TILT);
    tilt.tx = THREE.MathUtils.clamp(tilt.tx, -MAX_TILT, MAX_TILT);
    tilt.idleSince = performance.now();
  };
  const onPointerDown = (e) => {
    tilt.dragging = true;
    tilt.lastX = e.clientX;
    tilt.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };
  const endDrag = () => { tilt.dragging = false; tilt.idleSince = performance.now(); };
  const onPointerLeave = () => { if (!tilt.dragging) tilt.idleSince = performance.now() - 4000; };
  if (opts.interactive) {
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.classList.add('ec3d__canvas--interactive');
  }

  // ---------- readout, alarm ----------

  const readout = opts.readout ? createReadout(readoutRoot, { hour12: opts.hour12, locale: opts.locale }) : null;
  const alarmLine = (overlay && overlay.querySelector('.clock3d__meta--alarm')) || document.createElement('div');

  const alarm = createAlarm({
    ship,
    reduceMotion,
    onLayoutChange: () => frameCamera(),
    line: alarmLine,
    els: opts.alarmControls || null
  });

  // ---------- Miller's planet ----------

  const miller = { on: false, t0: 0 };
  const millerMeta = overlay && overlay.querySelector('.clock3d__meta--miller');
  const timeEl = overlay && overlay.querySelector('.clock3d__time');
  const ownTimeFmt = new Intl.DateTimeFormat(opts.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: opts.hour12 });
  const nf = new Intl.NumberFormat(opts.locale);
  let savedTimeHTML = '';
  let lastMillerHours = -1;

  function setMiller(on) {
    on = !!on;
    if (on === miller.on) return;
    miller.on = on;
    miller.t0 = Date.now();
    lastMillerHours = -1;
    container.classList.toggle('clock3d--miller', on);
    if (overlay) {
      millerMeta.hidden = !on;
      if (on) {
        savedTimeHTML = timeEl.innerHTML;
        timeEl.textContent = '';
      } else {
        timeEl.innerHTML = savedTimeHTML;
        readout.reset();
      }
    }
    if (!on) ranger.group.visible = true;
    frameCamera();
    if (opts.onMillerChange) opts.onMillerChange(on, { t0: miller.t0, timeOffset: opts.timeOffset });
  }

  const millerTau = () => (Date.now() - miller.t0) / 1000;

  function displayDate() {
    const real = nowDate();
    if (!miller.on) return real;
    return new Date(miller.t0 + opts.timeOffset + dilatedElapsed(millerTau()) * 1000);
  }

  function updateMillerReadout(realNow, shown) {
    if (!overlay) return;
    const el = splitElapsed(dilatedElapsed(millerTau()));
    if (el.hours !== lastMillerHours) {
      lastMillerHours = el.hours;
      timeEl.textContent = '';
      const add = (n, unit) => {
        const v = document.createElement('span');
        v.textContent = String(n).padStart(unit === 'y' ? 1 : 2, '0');
        const u = document.createElement('span');
        u.className = 'ec-unit';
        u.textContent = unit;
        timeEl.appendChild(v);
        timeEl.appendChild(u);
      };
      add(el.years, 'y');
      add(el.days, 'd');
      add(el.hours, 'h');
      millerMeta.textContent = 'Miller’s planet · 1 h here = 7 y there (×' + nf.format(Math.round(FACTOR)) + ') · your time ' + ownTimeFmt.format(realNow);
      container.setAttribute('aria-label', 'Endurance clock in Miller’s planet mode. ' +
        el.years + ' years, ' + el.days + ' days and ' + el.hours + ' hours have passed on the Endurance.');
    }
    readout.updateMeta(shown, 'Endurance date');
  }

  // ---------- Murph's watch ----------

  const murph = { on: false, letter: -2 };
  const murphLine = overlay && overlay.querySelector('.clock3d__meta--murph');

  function setMurph(on) {
    on = !!on && !!window.Murph;
    if (on === murph.on) return;
    murph.on = on;
    murph.letter = -2;
    if (murphLine) murphLine.hidden = !on;
    if (!on) {
      ship.setCraftFlare(0);
      ship.setTrailBoost(0, 'murph');
    }
    frameCamera();
    if (opts.onMurphChange) opts.onMurphChange(on);
  }

  function renderMurphLine(letter) {
    if (!murphLine || letter === murph.letter) return;
    murph.letter = letter;
    murphLine.textContent = '';
    murphLine.appendChild(document.createTextNode('Murph\u2019s watch \u00b7 '));
    const word = window.Murph.WORD;
    for (let i = 0; i < word.length; i++) {
      const span = document.createElement('span');
      span.className = 'ec-letter' + (i === letter ? ' is-sending' : '');
      span.textContent = word[i];
      murphLine.appendChild(span);
    }
  }

  function timeAngles(now) {
    const ms = now.getMilliseconds();
    const s = now.getSeconds();
    const m = now.getMinutes();
    const h = now.getHours();
    const secF = reduceMotion ? s : s + ms / 1000;
    const minF = m + secF / 60;
    const hourF = (h % 12) + minF / 60;
    return { hourDeg: hourF * 30, minuteDeg: minF * 6, secondDeg: secF * 6, activeModule: h % 12 };
  }

  // ---------- loop ----------

  const threeClock = new THREE.Clock();
  let first = true;
  let skyAngle = 0;
  let running = false;
  let visible = true;
  let paused = false;
  let stepTimer = 0;
  let destroyed = false;

  function frame() {
    const dt = Math.min(threeClock.getDelta(), 0.1);
    const t = threeClock.elapsedTime;
    const real = nowDate();
    const now = displayDate();

    const angles = timeAngles(now);
    if (murph.on && !miller.on) {
      // quartz tick instead of a sweep, and a Morse flare on the craft
      const st = window.Murph.stateAt(real.getTime());
      angles.secondDeg = now.getSeconds() * 6;
      ship.setCraftFlare(st.flash);
      ship.setTrailBoost(0.6 * st.flash, 'murph');
      renderMurphLine(st.letter);
    }
    ship.setAngles(angles.hourDeg, angles.minuteDeg, angles.secondDeg);
    ship.setActive(angles.activeModule);
    ship.setPulses(alarm.update(real, t));
    ship.updateModules(dt, first || reduceMotion);

    if (miller.on) {
      const fast = rateAt(millerTau()) > 40;
      ship.minute.visible = !fast;
      ship.craft.visible = !fast;
      ship.trail.visible = !fast;
      ranger.group.visible = false;
      updateMillerReadout(real, now);
    } else {
      ship.minute.visible = true;
      ship.craft.visible = true;
      ship.trail.visible = true;
      if (readout) readout.update(now);
      ranger.update(dockTimeline(now, reduceMotion), ship.docks, t);
    }
    if (!reduceMotion) {
      const skyRate = miller.on ? 1 + 59 * Math.min(1, (rateAt(millerTau()) - 1) / (FACTOR - 1)) : 1;
      skyAngle += dt * (Math.PI * 2 / SKY_PERIOD) * skyRate;
      sky.rotation.z = skyAngle;
    }

    const idle = (reduceMotion || !opts.sway) ? 0 : THREE.MathUtils.smoothstep((performance.now() - tilt.idleSince) / 1000, 2.5, 7);
    const swayX = Math.sin(t * 0.21) * 0.05 * idle;
    const swayY = Math.cos(t * 0.17) * 0.07 * idle;
    const k = 1 - Math.pow(0.001, dt);
    tilt.x += ((tilt.tx * (1 - idle) + swayX) - tilt.x) * k;
    tilt.y += ((tilt.ty * (1 - idle) + swayY) - tilt.y) * k;
    rig.rotation.x = tilt.x;
    rig.rotation.y = tilt.y;

    applyDaylight(real, first);
    if (gargantua) {
      gargantua.group.getWorldPosition(key.position);
      key.position.normalize().multiplyScalar(60);
      gargantua.face(camera);
      gargantua.update(t, daylightPalette ? daylightPalette.discWarm : undefined, daylightPalette ? daylightPalette.discBright : 1);
    } else {
      key.position.copy(gargantuaDir).applyQuaternion(sky.getWorldQuaternion(new THREE.Quaternion())).multiplyScalar(60);
    }
    if (stars) stars.update(t, pixelRatio(), daylightPalette ? daylightPalette.stars : undefined);

    if (first) frameCamera();   // the readout now has text, so its height is known

    if (composer) composer.render();
    else renderer.render(scene, camera);
    first = false;
  }

  function shouldRun() {
    return !destroyed && !paused && (visible || !opts.pauseWhenHidden);
  }

  function start() {
    if (running || !shouldRun()) return;
    running = true;
    threeClock.getDelta();   // drop the time spent paused
    if (reduceMotion) {
      const step = () => {
        if (!running) return;
        frame();
        stepTimer = setTimeout(step, 1000 - nowDate().getMilliseconds() + 5);
      };
      step();
    } else {
      renderer.setAnimationLoop(frame);
    }
  }

  function stop() {
    if (!running) return;
    running = false;
    if (reduceMotion) clearTimeout(stepTimer);
    else renderer.setAnimationLoop(null);
  }

  const intersection = (opts.pauseWhenHidden && typeof IntersectionObserver !== 'undefined')
    ? new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) start(); else stop();
      }, { threshold: 0.01 })
    : null;
  if (intersection) intersection.observe(container);
  const onVisibility = () => { if (document.hidden) stop(); else start(); };
  document.addEventListener('visibilitychange', onVisibility);
  const onFonts = () => frameCamera();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onFonts);

  const onContextLost = (e) => {
    e.preventDefault();
    container.classList.add('ec3d--failed');
    if (opts.fallback) opts.fallback.hidden = false;
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  start();
  if (daylight && daylight.tryKnownLocation) daylight.tryKnownLocation();

  // ---------- instance ----------

  const instance = {
    container, canvas, renderer, scene, camera, composer, bloomPass, rig, sky,
    ship, ranger, stars, gargantua, key, rim, hemi, front, alarm, readout,
    miller,
    get timeOffset() { return opts.timeOffset; },
    daylight: () => daylightPalette,
    setMiller,
    isMiller: () => miller.on,
    setMurph,
    isMurph: () => murph.on,
    pause() { paused = true; stop(); },
    resume() { paused = false; start(); },
    isRunning: () => running,
    frameCamera,
    destroy() {
      destroyed = true;
      stop();
      if (resizeObserver) resizeObserver.disconnect(); else window.removeEventListener('resize', resize);
      if (intersection) intersection.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      if (alarm.destroy) alarm.destroy();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
      });
      if (composer) composer.dispose();
      renderer.dispose();
      canvas.remove();
      if (overlay) overlay.remove();
      container.classList.remove('ec3d', 'ec3d--transparent', 'clock3d--miller');
      container.removeAttribute('role');
      container.removeAttribute('aria-label');
      delete container.__enduranceClock3D;
    }
  };
  container.__enduranceClock3D = instance;
  if (opts.onReady) opts.onReady(instance);
  return instance;
}

/** Mount every [data-endurance-clock-3d] element not yet mounted. */
export function autoMount() {
  const list = [];
  for (const el of document.querySelectorAll('[data-endurance-clock-3d]')) {
    if (!el.__enduranceClock3D) list.push(mount(el, readDataOptions(el)));
  }
  return list;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => autoMount());
  else autoMount();
}

export default { mount, autoMount };
