/*
 * The Endurance: twelve modules standing radially around the ring, their
 * long axes pointing at the hub, joined side to side by corridor tubes;
 * four thick spokes from the hub to the inner ends of the command
 * modules; two Landers berthed on the inner ends of landing modules;
 * clock hands pivoting at the hub; and a small craft that orbits the
 * ring once a minute as the second indicator.
 *
 * Module roles follow the film's layout: command modules at the
 * cardinals (where the spokes attach), engine modules with their bells
 * on the far side, landing modules with the big hatches. The Ranger
 * docks on a module's inner end, as in the film.
 *
 * Ship frame: the ring lies in the XY plane and faces +Z (the camera).
 * Twelve o'clock is +Y; hour i sits at -i * 30 degrees about Z.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const RING_R = 9.4;                 // radius of the module centres
export const HUB_R = 1.5;
export const MOD_L = 4.0;                  // radial length
export const MOD_W = 2.1;                  // tangential width
export const MOD_D = 2.0;                  // axial depth (towards the camera)
export const MODULE_INNER_R = RING_R - MOD_L / 2;   // 7.4
export const MODULE_OUTER_R = RING_R + MOD_L / 2;   // 11.4
export const ORBIT_R = MODULE_OUTER_R + 1.3;        // second craft's orbit
export const HOUR_LEN = MODULE_INNER_R - 0.25;
export const MINUTE_LEN = RING_R - 0.4;
export const HAND_Z = { hour: 1.3, minute: 1.55, cap: 1.72 };

const COLORS = {
  hull: 0xc3c9d0,        // the Endurance's pale hull
  hullShade: 0x9ea6b0,   // recessed panels
  hullDark: 0x3b414b,    // frames, bands, hatches
  truss: 0x5b6473,
  window: 0x9fd3ff,
  accent: 0xffb25c,
  hand: 0xe6ecf5,
  second: 0xffd089
};

const ROLE = (index) => (index % 3 === 0 ? 'command' : index % 2 === 0 ? 'engine' : 'landing');
const LANDER_MODULES = [5, 11];   // landing modules with a Lander berthed
const SPOKE_Z = -0.35;            // spokes meet the inner ends a little behind the mid-plane
const DOCK_Z_OFFSET = 0.55;       // where a spoke or Lander occupies the inner end, the Ranger docks above it

function hullMaterial(color, opts) {
  return new THREE.MeshStandardMaterial(Object.assign({
    color: color,
    metalness: 0.25,
    roughness: 0.55,
    envMapIntensity: 0.6
  }, opts || {}));
}

/** Soft radial glow texture for sprites, drawn on a canvas. */
export function glowTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowSprite(texture, color, scale, opacity) {
  const mat = new THREE.SpriteMaterial({
    map: texture, color: color, transparent: true, opacity: opacity,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(scale, scale, 1);
  return s;
}

/** Shared materials, created per ship so instances can be disposed independently. */
function makeMaterials() {
  return {
    hull: hullMaterial(COLORS.hull),
    shade: hullMaterial(COLORS.hullShade, { roughness: 0.6 }),
    dark: hullMaterial(COLORS.hullDark, { metalness: 0.6, roughness: 0.5 }),
    truss: hullMaterial(COLORS.truss, { metalness: 0.7, roughness: 0.5 }),
    rim: hullMaterial(0xb9c1cc, { metalness: 0.55, roughness: 0.45 }),
    corridor: hullMaterial(0xb4bac2, { roughness: 0.6 }),
    engine: hullMaterial(0x2a2f38, { metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide }),
    engineGlow: new THREE.MeshStandardMaterial({ color: 0x101418, emissive: 0x4f7cff, emissiveIntensity: 0.35, roughness: 0.6 })
  };
}

/** Ring-frame position of a point given in module i's local frame (x tangential, y radial). */
function ringPoint(index, lx, ly, lz) {
  const a = -THREE.MathUtils.degToRad(index * 30);
  const x = lx, y = RING_R + ly;
  return new THREE.Vector3(x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), lz || 0);
}

/** A cylinder from a to b. */
function tube(a, b, radius, material, segments) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, segments || 14), material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

// ---------- corridors ----------

/** Corridor tubes between neighbouring modules' side faces, with couplers at each end. */
function buildCorridors(m) {
  const g = new THREE.Group();
  const coupler = new THREE.TorusGeometry(0.46, 0.07, 8, 24);
  for (let i = 0; i < 12; i++) {
    const a = ringPoint(i, MOD_W / 2, 0);
    const b = ringPoint((i + 1) % 12, -MOD_W / 2, 0);
    g.add(tube(a, b, 0.36, m.corridor));
    // a slimmer sleeve along the middle and couplers against each hull
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    for (const [p, s] of [[a, 1], [b, -1]]) {
      const c = new THREE.Mesh(coupler, m.dark);
      c.position.copy(p).addScaledVector(dir, s * 0.12);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      g.add(c);
    }
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 24), m.dark);
    band.position.copy(a).addScaledVector(dir, a.distanceTo(b) / 2);
    band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    g.add(band);
  }
  return g;
}

// ---------- spokes and hub ----------

function buildSpokes(m) {
  const g = new THREE.Group();
  const inner = HUB_R - 0.1;
  const outer = MODULE_INNER_R + 0.15;
  const len = outer - inner;
  const sleeve = new THREE.TorusGeometry(0.4, 0.06, 8, 24);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Group();
    spoke.rotation.z = -THREE.MathUtils.degToRad(i * 90);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, len, 18), m.corridor);
    core.position.set(0, inner + len / 2, SPOKE_Z);
    spoke.add(core);
    // joints along the spoke, and a root fitting at the module
    for (let y = inner + 1.2; y < outer - 0.6; y += 1.5) {
      const s = new THREE.Mesh(sleeve, m.dark);
      s.position.set(0, y, SPOKE_Z);
      s.rotation.x = Math.PI / 2;
      spoke.add(s);
    }
    const foot = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.5, 1.0, 2, 0.08), m.dark);
    foot.position.set(0, outer - 0.15, SPOKE_Z);
    spoke.add(foot);
    g.add(spoke);
  }
  return g;
}

function buildHub(m) {
  const g = new THREE.Group();
  const hubMat = hullMaterial(0xbfc5cd, { metalness: 0.4, roughness: 0.5 });
  const innerMat = hullMaterial(0x161b25, { metalness: 0.5, roughness: 0.5 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(HUB_R, HUB_R, 1.6, 48), hubMat);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  for (const z of [-0.55, 0.55]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(HUB_R + 0.01, 0.05, 6, 64), m.dark);
    band.position.z = z;
    g.add(band);
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(HUB_R - 0.05, 0.07, 8, 64), m.rim);
  rim.position.z = 0.8;
  g.add(rim);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(HUB_R - 0.45, HUB_R - 0.45, 0.25, 48), innerMat);
  inner.rotation.x = Math.PI / 2;
  inner.position.z = 0.81;
  g.add(inner);

  // the axial docking port the Ranger mates with in the film
  const port = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.08, 8, 48), m.rim);
  port.position.z = 0.95;
  g.add(port);
  const petal = new THREE.BoxGeometry(0.14, 0.3, 0.12);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = new THREE.Mesh(petal, m.dark);
    p.position.set(Math.cos(a) * 0.66, Math.sin(a) * 0.66, 1.0);
    p.rotation.z = a + Math.PI / 2;
    g.add(p);
  }
  return g;
}

// ---------- modules ----------

function buildModule(index, glowTex, m) {
  const role = ROLE(index);
  const cardinal = role === 'command';
  const hasLander = LANDER_MODULES.includes(index);
  const w = MOD_W, l = MOD_L, d = MOD_D;

  const holder = new THREE.Group();
  holder.rotation.z = -THREE.MathUtils.degToRad(index * 30);
  const g = new THREE.Group();
  g.position.y = RING_R;
  holder.add(g);

  // warm glow (only visible when active)
  const glow = glowSprite(glowTex, COLORS.accent, 8.5, 0);
  glow.position.z = 0.4;
  g.add(glow);

  // the chamfered hull, long axis radial
  const bodyMat = hullMaterial(COLORS.hull, { emissive: 0x000000 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(w, l, d, 3, 0.18), bodyMat);
  g.add(body);

  // dark frames near each end
  const frame = new RoundedBoxGeometry(w + 0.06, 0.16, d + 0.06, 2, 0.05);
  for (const y of [-l / 2 + 0.45, l / 2 - 0.45]) {
    const f = new THREE.Mesh(frame, m.dark);
    f.position.y = y;
    g.add(f);
  }

  // the long recessed panel on the face towards the camera, with a light strip
  const panel = new THREE.Mesh(new RoundedBoxGeometry(w * 0.64, l * 0.62, 0.1, 2, 0.04), m.dark);
  panel.position.set(0, -0.1, d / 2 - 0.02);
  g.add(panel);
  const strip = new THREE.Mesh(new RoundedBoxGeometry(0.22, l * 0.56, 0.06, 2, 0.03), m.shade);
  strip.position.set(0, -0.1, d / 2 + 0.03);
  g.add(strip);
  // and on the side faces, so the ring reads from any tilt
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new RoundedBoxGeometry(0.1, l * 0.55, d * 0.5, 2, 0.03), m.dark);
    side.position.set(sx * (w / 2 - 0.02), 0, 0);
    g.add(side);
  }

  // windows across the outer end of the face
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x0a1018, emissive: COLORS.window, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.1
  });
  const win = new RoundedBoxGeometry(0.22, 0.2, 0.08, 2, 0.04);
  const cols = cardinal ? [-0.6, -0.2, 0.2, 0.6] : [-0.4, 0.4];
  for (const x of cols) {
    const wm = new THREE.Mesh(win, windowMat);
    wm.position.set(x, l / 2 - 0.95, d / 2 - 0.02);
    g.add(wm);
  }

  // RCS thruster quads at the outer corners
  const quad = new THREE.CylinderGeometry(0.07, 0.09, 0.14, 8);
  for (const [x, y] of [[-w / 2 + 0.25, l / 2 - 0.25], [w / 2 - 0.25, l / 2 - 0.25]]) {
    const q = new THREE.Mesh(quad, m.dark);
    q.rotation.x = Math.PI / 2;
    q.position.set(x, y, d / 2 + 0.02);
    g.add(q);
  }

  // engine modules carry their bells on the far side
  if (role === 'engine') {
    const bell = new THREE.CylinderGeometry(0.22, 0.48, 0.9, 20, 1, true);
    const throat = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 20);
    for (const y of [-0.9, 0.4]) {
      const b = new THREE.Mesh(bell, m.engine);
      b.rotation.x = -Math.PI / 2;
      b.position.set(0, y, -d / 2 - 0.4);
      g.add(b);
      const t = new THREE.Mesh(throat, m.engineGlow);
      t.rotation.x = Math.PI / 2;
      t.position.set(0, y, -d / 2 - 0.85);
      g.add(t);
    }
  }

  // the inner end: docking hatch for the Ranger. Where a spoke or a Lander
  // meets the end, the hatch sits above it (towards the camera).
  const dockZ = (cardinal || hasLander) ? DOCK_Z_OFFSET : 0;
  const big = role === 'landing';
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(big ? 0.46 : 0.4, big ? 0.5 : 0.44, 0.3, 24), m.dark);
  hatch.position.set(0, -l / 2 - 0.1, dockZ);
  g.add(hatch);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(big ? 0.44 : 0.38, 0.05, 8, 24), m.rim);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, -l / 2 - 0.26, dockZ);
  g.add(collar);

  if (hasLander) g.add(buildLander(-l / 2, m));

  return {
    holder, body, bodyMat, windowMat, glow, cardinal, role,
    // where the Ranger's docking collar meets the hatch, in ring polar terms
    dock: { radius: RING_R - l / 2 - 0.26 - 0.31, tangent: 0, z: dockZ }
  };
}

/** A Lander berthed on a module's inner end, behind the Ranger's hatch. */
function buildLander(innerFaceY, m) {
  const g = new THREE.Group();
  const bodyW = 1.6, bodyH = 1.0, bodyD = 1.2;
  const body = new THREE.Mesh(new RoundedBoxGeometry(bodyW, bodyH, bodyD, 2, 0.14), hullMaterial(0xc4c9cf));
  g.add(body);
  const belly = new THREE.Mesh(new RoundedBoxGeometry(bodyW * 0.9, 0.3, bodyD * 0.9, 2, 0.08), m.dark);
  belly.position.y = -bodyH / 2 + 0.05;
  g.add(belly);
  const cockpit = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.18, bodyD * 0.7, 2, 0.05), new THREE.MeshStandardMaterial({
    color: 0x1b2430, metalness: 0.2, roughness: 0.2, emissive: COLORS.window, emissiveIntensity: 0.3
  }));
  cockpit.position.set(bodyW / 2 - 0.4, 0.12, bodyD / 2 - 0.25);
  g.add(cockpit);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 20), m.dark);
  collar.position.y = bodyH / 2 + 0.1;
  g.add(collar);
  const leg = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6);
  for (const [lx, lz] of [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]]) {
    const l = new THREE.Mesh(leg, m.truss);
    l.position.set(lx, -bodyH / 2 - 0.12, lz);
    l.rotation.z = lx > 0 ? -0.5 : 0.5;
    g.add(l);
  }
  g.position.set(0, innerFaceY - 0.21 - bodyH / 2, -0.4);
  return g;
}

// ---------- hands ----------

function handShape(len, halfW, tail) {
  const s = new THREE.Shape();
  s.moveTo(-halfW, -tail);
  s.lineTo(-halfW, len - halfW * 6);
  s.lineTo(0, len);
  s.lineTo(halfW, len - halfW * 6);
  s.lineTo(halfW, -tail);
  s.closePath();
  return s;
}

function buildHand(len, halfW, tail, thickness, z, glowTex) {
  const g = new THREE.Group();
  const geo = new THREE.ExtrudeGeometry(handShape(len, halfW, tail), {
    depth: thickness, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2
  });
  geo.translate(0, 0, -thickness / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: COLORS.hand, metalness: 0.35, roughness: 0.35, emissive: 0x1a1d24, emissiveIntensity: 0.6
  });
  g.add(new THREE.Mesh(geo, mat));

  const tipLen = halfW * 5;
  const tipMat = new THREE.MeshStandardMaterial({
    color: COLORS.accent, emissive: COLORS.accent, emissiveIntensity: 1.6, roughness: 0.4
  });
  const tip = new THREE.Mesh(new THREE.ConeGeometry(halfW * 0.8, tipLen, 4), tipMat);
  tip.position.set(0, len - tipLen / 2 - 0.05, thickness / 2 + 0.02);
  tip.rotation.y = Math.PI / 4;
  g.add(tip);

  const spark = glowSprite(glowTex, COLORS.accent, 1.2, 0.5);
  spark.position.set(0, len - 0.3, thickness / 2 + 0.05);
  g.add(spark);

  g.position.z = z;
  return g;
}

// ---------- second indicator ----------

function buildSecondCraft(glowTex) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.55, 4),
    new THREE.MeshStandardMaterial({ color: 0xdfe6f0, metalness: 0.5, roughness: 0.4 })
  );
  body.scale.set(1.6, 1, 0.5);
  body.rotation.z = -Math.PI / 2;
  g.add(body);

  const engine = glowSprite(glowTex, COLORS.second, 1.4, 0.8);
  engine.position.x = -0.25;
  g.add(engine);
  const core = glowSprite(glowTex, 0xffffff, 0.5, 0.9);
  core.position.x = -0.25;
  g.add(core);
  g.userData.engine = engine;
  g.userData.core = core;
  return g;
}

function buildTrail(segments) {
  const positions = new Float32Array(segments * 3);
  const colors = new Float32Array(segments * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const base = new THREE.Color(COLORS.second);
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const f = t * t * 0.9;
    colors[i * 3] = base.r * f;
    colors[i * 3 + 1] = base.g * f;
    colors[i * 3 + 2] = base.b * f;
  }
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  return new THREE.Line(geo, mat);
}

// ---------- assembly ----------

export function buildShip() {
  const group = new THREE.Group();
  const glowTex = glowTexture();
  const m = makeMaterials();

  group.add(buildCorridors(m));
  group.add(buildSpokes(m));

  const modules = [];
  for (let i = 0; i < 12; i++) {
    const mod = buildModule(i, glowTex, m);
    group.add(mod.holder);
    modules.push(mod);
  }

  group.add(buildHub(m));

  const hour = buildHand(HOUR_LEN, 0.27, 0.9, 0.2, HAND_Z.hour, glowTex);
  const minute = buildHand(MINUTE_LEN, 0.16, 1.05, 0.14, HAND_Z.minute, glowTex);
  group.add(hour);
  group.add(minute);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 0.3, 24),
    hullMaterial(0x161b25, { metalness: 0.7, roughness: 0.35 })
  );
  cap.rotation.x = Math.PI / 2;
  cap.position.z = HAND_Z.cap;
  group.add(cap);

  const orbit = new THREE.Mesh(
    new THREE.TorusGeometry(ORBIT_R, 0.012, 4, 180),
    new THREE.MeshBasicMaterial({ color: COLORS.second, transparent: true, opacity: 0.12 })
  );
  group.add(orbit);

  const TRAIL_SEGMENTS = 48;
  const TRAIL_DEG = 30;
  const trail = buildTrail(TRAIL_SEGMENTS);
  group.add(trail);

  const craft = buildSecondCraft(glowTex);
  group.add(craft);

  const moduleLight = new THREE.PointLight(COLORS.accent, 0, 6.5, 1.8);
  group.add(moduleLight);

  const accent = new THREE.Color(COLORS.accent);
  const hot = new THREE.Color(0xfff1dc);
  const windowCool = new THREE.Color(COLORS.window);
  const hullBase = new THREE.Color(COLORS.hull);
  const state = { active: -1, blend: new Array(12).fill(0), pulse: new Array(12).fill(0) };
  let trailDeg = TRAIL_DEG;
  const trailBoosts = {};

  function setActive(index) {
    state.active = index;
  }

  /** Extra glow per module (0..1), e.g. a breathing alarm module or a ringing wave. */
  function setPulses(values) {
    for (let i = 0; i < 12; i++) state.pulse[i] = values ? values[i] : 0;
  }

  /** 0..1 per source: lengthens and brightens the second craft's trail; the strongest source wins. */
  function setTrailBoost(k, source) {
    trailBoosts[source || 'default'] = k;
    let max = 0;
    for (const key in trailBoosts) max = Math.max(max, trailBoosts[key]);
    trailDeg = TRAIL_DEG + 70 * max;
    trail.material.opacity = 0.9 + 0.1 * max;
  }

  /** 0..1: the second craft's engine flares (Murph's watch). */
  function setCraftFlare(k) {
    const engine = craft.userData.engine;
    const core = craft.userData.core;
    const s = 1.4 * (1 + 1.6 * k);
    engine.scale.set(s, s, 1);
    engine.material.opacity = 0.8 + 0.2 * k;
    const c = 0.5 * (1 + 1.2 * k);
    core.scale.set(c, c, 1);
  }

  /** Animate module highlight blends; dt in seconds. */
  function updateModules(dt, instant) {
    const k = instant ? 1 : Math.min(1, dt * 1.6);
    for (let i = 0; i < 12; i++) {
      const target = i === state.active ? 1 : 0;
      state.blend[i] += (target - state.blend[i]) * k;
      if (Math.abs(state.blend[i] - target) < 0.002) state.blend[i] = target;
      const b = Math.max(state.blend[i], state.pulse[i]);
      const mod = modules[i];
      mod.bodyMat.emissive.copy(accent).multiplyScalar(0.55 * b);
      mod.bodyMat.color.lerpColors(hullBase, accent, b * 0.8);
      mod.windowMat.emissive.lerpColors(windowCool, hot, b);
      mod.windowMat.emissiveIntensity = 0.7 + 1.5 * b;
      mod.glow.material.opacity = 0.55 * b;
      if (i === state.active) {
        moduleLight.intensity = 9 * b;
        mod.glow.getWorldPosition(moduleLight.position);
        group.worldToLocal(moduleLight.position);
        moduleLight.position.z += 1.2;
      }
    }
  }

  function setAngles(hourDeg, minuteDeg, secondDeg) {
    hour.rotation.z = -THREE.MathUtils.degToRad(hourDeg);
    minute.rotation.z = -THREE.MathUtils.degToRad(minuteDeg);

    const a = THREE.MathUtils.degToRad(90 - secondDeg);
    craft.position.set(Math.cos(a) * ORBIT_R, Math.sin(a) * ORBIT_R, 0.35);
    craft.rotation.z = a - Math.PI / 2;

    const pos = trail.geometry.attributes.position.array;
    for (let i = 0; i < TRAIL_SEGMENTS; i++) {
      const t = i / (TRAIL_SEGMENTS - 1);
      const deg = secondDeg - trailDeg * (1 - t) - 0.6;
      const ta = THREE.MathUtils.degToRad(90 - deg);
      pos[i * 3] = Math.cos(ta) * ORBIT_R;
      pos[i * 3 + 1] = Math.sin(ta) * ORBIT_R;
      pos[i * 3 + 2] = 0.35;
    }
    trail.geometry.attributes.position.needsUpdate = true;
  }

  const docks = modules.map((mod) => mod.dock);

  return { group, modules, docks, hour, minute, craft, trail, glowTex, setActive, setPulses, setTrailBoost, setCraftFlare, updateModules, setAngles };
}
