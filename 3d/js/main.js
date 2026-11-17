/*
 * Endurance Clock, 3D. Scene setup, camera rig, time, and render loop.
 *
 * The camera rides in the ship's rotating frame: the ring holds still
 * while the starfield and Gargantua wheel slowly around the ring's axis,
 * which is what the crew would see from a window.
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

const params = new URLSearchParams(location.search);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const quality = params.get('quality');
const lowQuality = quality === 'low' || (quality !== 'high' &&
  navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4 && window.innerWidth < 900);
const useBloom = !lowQuality;

const SKY_PERIOD = 600;            // seconds per revolution of the sky (ship spin, slowed)
const FRAME_HALF_EXTENT = ORBIT_R + 1.6;

const canvas = document.getElementById('scene');
const clockRoot = document.getElementById('clock');
const fallback = document.getElementById('fallback');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !useBloom, alpha: false, powerPreference: 'high-performance' });
} catch (err) {
  fallback.hidden = false;
  clockRoot.hidden = true;
  throw err;
}

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
// pure black: with post-processing the clear colour is tone-mapped too,
// and anything above black gets lifted into a grey haze
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1200);

// ---------- rig: idle sway plus pointer-driven tilt ----------

const rig = new THREE.Group();     // rotates everything the viewer sees
scene.add(rig);

const sky = new THREE.Group();     // wheels slowly around the ring axis
rig.add(sky);

// ---------- content ----------

const stars = buildStars(reduceMotion ? 2200 : 3200, reduceMotion);
sky.add(stars.points);

const gargantua = buildGargantua();
gargantua.group.position.set(30, 11, -84);
gargantua.group.scale.setScalar(1.7);
sky.add(gargantua.group);

const ship = buildShip();
rig.add(ship.group);

// ---------- lights ----------

scene.add(new THREE.HemisphereLight(0x5a6c90, 0x05070c, 0.75));

const key = new THREE.DirectionalLight(0xffb27a, 1.7);   // from Gargantua, follows it
scene.add(key);
scene.add(key.target);

const rim = new THREE.DirectionalLight(0x9fc4ff, 0.7);    // cool fill from the opposite side
rim.position.set(-14, 10, 18);
scene.add(rim);

const front = new THREE.DirectionalLight(0xffffff, 0.35);
front.position.set(0, 4, 30);
scene.add(front);

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

const navEl = document.querySelector('.site-nav');
const readoutEl = clockRoot.querySelector('.clock3d__readout');

/**
 * Place the camera so the ring (plus the second indicator's orbit) fits
 * inside the region between the nav at the top and the readout at the
 * bottom, and sits centred in that region rather than in the viewport.
 */
function frameCamera() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / h;
  camera.aspect = aspect;

  // overlay reserves in CSS pixels; the readout is measured once it has text
  const navRect = navEl.getBoundingClientRect();
  const readoutRect = readoutEl.getBoundingClientRect();
  const top = Math.max(0, navRect.bottom) + 12;
  const readoutTop = readoutRect.height > 0 ? readoutRect.top : h * 0.84;
  const bottom = Math.max(0, h - readoutTop) + 10;
  const availH = Math.max(h * 0.4, h - top - bottom);
  const sideMargin = Math.min(24, w * 0.04);
  const availW = Math.max(w * 0.5, w - sideMargin * 2);

  // distance so the ring extent fits both the available height and width
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const tanHalf = Math.tan(halfFov);
  const extent = FRAME_HALF_EXTENT * 1.04;
  const distH = extent * h / (availH * tanHalf);
  const distW = extent * h / (availW * tanHalf);
  const dist = Math.max(distH, distW);

  // shift the look-at point so the ring centres in the available region
  const unitsPerPx = (2 * dist * tanHalf) / h;
  const centerOffsetPx = (bottom - top) / 2;        // +ve: region centre is above viewport centre
  const targetY = -centerOffsetPx * unitsPerPx;

  // a gentle look-down angle so the ring reads as a solid object
  const pitch = THREE.MathUtils.degToRad(11);
  camera.position.set(0, targetY + Math.sin(pitch) * dist, Math.cos(pitch) * dist);
  camera.lookAt(0, targetY, 0);
  camera.updateProjectionMatrix();
}

function resize() {
  const pr = pixelRatio();
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if (composer) {
    composer.setPixelRatio(pr);
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  frameCamera();
}
window.addEventListener('resize', resize);
resize();

// ---------- pointer tilt ----------

const tilt = { x: 0, y: 0, tx: 0, ty: 0, dragging: false, lastX: 0, lastY: 0, idleSince: 0 };
const MAX_TILT = THREE.MathUtils.degToRad(16);

function setTargetFromPointer(clientX, clientY) {
  const nx = (clientX / window.innerWidth) * 2 - 1;
  const ny = (clientY / window.innerHeight) * 2 - 1;
  tilt.ty = nx * MAX_TILT * 0.55;
  tilt.tx = ny * MAX_TILT * 0.45;
}

canvas.addEventListener('pointermove', (e) => {
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
});
canvas.addEventListener('pointerdown', (e) => {
  tilt.dragging = true;
  tilt.lastX = e.clientX;
  tilt.lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
const endDrag = () => { tilt.dragging = false; tilt.idleSince = performance.now(); };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => { if (!tilt.dragging) tilt.idleSince = performance.now() - 4000; });

// ---------- time ----------

const readout = createReadout(clockRoot, {
  hour12: params.has('hour12') ? params.get('hour12') === 'true' : undefined,
  locale: params.get('locale') || undefined
});

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

function frame() {
  const dt = Math.min(threeClock.getDelta(), 0.1);
  const t = threeClock.elapsedTime;
  const now = new Date();

  const angles = timeAngles(now);
  ship.setAngles(angles.hourDeg, angles.minuteDeg, angles.secondDeg);
  ship.setActive(angles.activeModule);
  ship.updateModules(dt, first || reduceMotion);
  readout.update(now);

  // sky wheels around the ring axis; the ring itself stays put
  if (!reduceMotion) sky.rotation.z = (t / SKY_PERIOD) * Math.PI * 2;

  // idle sway, blended with pointer tilt
  const idle = reduceMotion ? 0 : THREE.MathUtils.smoothstep((performance.now() - tilt.idleSince) / 1000, 2.5, 7);
  const swayX = Math.sin(t * 0.21) * 0.05 * idle;
  const swayY = Math.cos(t * 0.17) * 0.07 * idle;
  const k = 1 - Math.pow(0.001, dt); // exponential ease, frame-rate independent
  tilt.x += ((tilt.tx * (1 - idle) + swayX) - tilt.x) * k;
  tilt.y += ((tilt.ty * (1 - idle) + swayY) - tilt.y) * k;
  rig.rotation.x = tilt.x;
  rig.rotation.y = tilt.y;

  // key light follows Gargantua
  gargantua.group.getWorldPosition(key.position);
  key.position.normalize().multiplyScalar(60);
  gargantua.face(camera);
  gargantua.update(t);
  stars.update(t, pixelRatio());

  if (first) frameCamera();   // the readout now has text, so its height is known

  if (composer) composer.render();
  else renderer.render(scene, camera);
  first = false;
}

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(frameCamera);
}

if (reduceMotion) {
  // step once per second, aligned to the clock
  const step = () => {
    frame();
    setTimeout(step, 1000 - new Date().getMilliseconds() + 5);
  };
  step();
} else {
  renderer.setAnimationLoop(frame);
}

// handle for poking at the scene from devtools
window.__endurance = { scene, camera, renderer, composer, bloomPass, rig, sky, ship, stars, gargantua, key, rim, front };

// WebGL context can still be lost after a successful start
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  fallback.hidden = false;
});
