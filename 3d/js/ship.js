/*
 * The Endurance: a ring of twelve modules, four spokes, a central hub,
 * clock hands pivoting at the hub, and a small craft that orbits the
 * ring once a minute as the second indicator.
 *
 * Ship frame: the ring lies in the XY plane and faces +Z (the camera).
 * Twelve o'clock is +Y; hour i sits at -i * 30 degrees about Z.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const RING_R = 10;
export const HUB_R = 1.9;
export const ORBIT_R = RING_R + 1.9;
export const HOUR_LEN = 7.3;
export const MINUTE_LEN = 8.5;

const COLORS = {
  hull: 0x9aa4b2,
  hullDark: 0x4a5261,
  truss: 0x5b6473,
  window: 0x9fd3ff,
  accent: 0xffb25c,
  hand: 0xe6ecf5,
  second: 0xffd089
};

function hullMaterial(color, opts) {
  return new THREE.MeshStandardMaterial(Object.assign({
    color: color,
    metalness: 0.55,
    roughness: 0.42,
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

// ---------- ring truss ----------

function buildRingTruss() {
  const g = new THREE.Group();
  const trussMat = hullMaterial(COLORS.truss, { metalness: 0.7, roughness: 0.5 });
  const darkMat = hullMaterial(COLORS.hullDark, { metalness: 0.7, roughness: 0.55 });

  g.add(new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.16, 10, 120), trussMat));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(RING_R - 0.7, 0.055, 6, 120), darkMat));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(RING_R + 0.7, 0.055, 6, 120), darkMat));

  // cross-bracing between the rails, midway between modules
  const brace = new THREE.CylinderGeometry(0.035, 0.035, 1.55, 5);
  for (let i = 0; i < 12; i++) {
    const deg = i * 30 + 15;
    for (const sign of [-1, 1]) {
      const m = new THREE.Mesh(brace, darkMat);
      const holder = new THREE.Group();
      holder.rotation.z = -THREE.MathUtils.degToRad(deg + sign * 4);
      m.position.set(0, RING_R, 0);
      m.rotation.z = sign * 0.6;
      holder.add(m);
      g.add(holder);
    }
  }
  return g;
}

// ---------- spokes and hub ----------

function buildSpokes() {
  const g = new THREE.Group();
  const coreMat = hullMaterial(COLORS.hullDark, { metalness: 0.7, roughness: 0.55 });
  const rungMat = hullMaterial(COLORS.truss, { metalness: 0.7, roughness: 0.5 });
  const inner = HUB_R - 0.2;
  const outer = RING_R - 0.85;
  const len = outer - inner;
  const rail = new THREE.CylinderGeometry(0.07, 0.07, len, 6);
  const rung = new THREE.CylinderGeometry(0.035, 0.035, 0.78, 5);

  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Group();
    spoke.rotation.z = -THREE.MathUtils.degToRad(i * 90);
    // three longitudinal rails in a triangle, plus a slim core
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.42, len, 0.42), coreMat);
    core.position.y = inner + len / 2;
    spoke.add(core);
    for (const [dx, dz] of [[-0.3, 0.2], [0.3, 0.2], [0, -0.32]]) {
      const r = new THREE.Mesh(rail, rungMat);
      r.position.set(dx, inner + len / 2, dz);
      spoke.add(r);
    }
    for (let y = inner + 0.5; y < outer - 0.3; y += 0.62) {
      const a = new THREE.Mesh(rung, rungMat);
      a.position.set(0, y, 0.22);
      a.rotation.z = Math.PI / 2 + 0.5;
      spoke.add(a);
    }
    g.add(spoke);
  }
  return g;
}

function buildHub() {
  const g = new THREE.Group();
  const hubMat = hullMaterial(0x2a3140, { metalness: 0.6, roughness: 0.45 });
  const innerMat = hullMaterial(0x161b25, { metalness: 0.5, roughness: 0.5 });
  const portMat = hullMaterial(COLORS.hullDark);
  const rimMat = hullMaterial(0xc7cfdb, { metalness: 0.8, roughness: 0.3 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(HUB_R, HUB_R, 1.3, 48), hubMat);
  body.rotation.x = Math.PI / 2;
  g.add(body);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(HUB_R - 0.05, 0.07, 8, 64), rimMat);
  rim.position.z = 0.65;
  g.add(rim);

  const inner = new THREE.Mesh(new THREE.CylinderGeometry(HUB_R - 0.55, HUB_R - 0.55, 0.25, 48), innerMat);
  inner.rotation.x = Math.PI / 2;
  inner.position.z = 0.66;
  g.add(inner);

  const port = new THREE.CylinderGeometry(0.2, 0.2, 0.22, 16);
  for (let i = 0; i < 4; i++) {
    const a = THREE.MathUtils.degToRad(i * 90 + 45);
    const p = new THREE.Mesh(port, portMat);
    p.rotation.x = Math.PI / 2;
    p.position.set(Math.cos(a) * (HUB_R - 0.3), Math.sin(a) * (HUB_R - 0.3), 0.72);
    g.add(p);
  }
  return g;
}

// ---------- modules ----------

function buildModule(index, glowTex) {
  const cardinal = index % 3 === 0;
  const w = cardinal ? 3.7 : 3.05;   // tangential
  const h = cardinal ? 1.9 : 1.6;    // radial
  const d = cardinal ? 1.9 : 1.6;    // depth (towards camera)

  const holder = new THREE.Group();
  holder.rotation.z = -THREE.MathUtils.degToRad(index * 30);

  const g = new THREE.Group();
  g.position.y = RING_R;
  holder.add(g);

  const bodyMat = hullMaterial(COLORS.hull, { emissive: 0x000000 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, 0.36), bodyMat);
  g.add(body);

  // panel seams: two slim dark bands around the body
  const seamMat = hullMaterial(COLORS.hullDark, { roughness: 0.6 });
  const seam = new THREE.TorusGeometry(Math.max(h, d) / 2 + 0.02, 0.03, 6, 32);
  for (const x of [-w / 4, w / 4]) {
    const s = new THREE.Mesh(seam, seamMat);
    s.rotation.y = Math.PI / 2;
    s.position.x = x;
    s.scale.set(1, 1, 1);
    g.add(s);
  }

  // windows on the +Z face
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x0a1018, emissive: COLORS.window, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.1
  });
  const windows = [];
  if (cardinal) {
    const geo = new THREE.CylinderGeometry(0.14, 0.14, 0.08, 20);
    for (let k = -2; k <= 2; k++) {
      const m = new THREE.Mesh(geo, windowMat);
      m.rotation.x = Math.PI / 2;
      m.position.set(k * 0.56, 0.22, d / 2 - 0.02);
      g.add(m);
      windows.push(m);
    }
  } else {
    const geo = new RoundedBoxGeometry(0.55, 0.18, 0.08, 2, 0.06);
    for (const x of [-w / 2 + 0.6, w / 2 - 0.6]) {
      const m = new THREE.Mesh(geo, windowMat);
      m.position.set(x, 0.2, d / 2 - 0.02);
      g.add(m);
      windows.push(m);
    }
  }

  // inner docking hatch, where the Ranger berths; cardinal modules carry the
  // spoke at their centre, so theirs sits to one side of it
  const dockX = cardinal ? 1.15 : 0;
  const hatchMat = hullMaterial(COLORS.hullDark);
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.35, 24), hatchMat);
  hatch.position.set(dockX, -h / 2 - 0.12, 0);
  g.add(hatch);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 24), hullMaterial(0xc7cfdb));
  collar.rotation.x = Math.PI / 2;
  collar.position.set(dockX, -h / 2 - 0.3, 0);
  g.add(collar);

  // glow sprite behind the module, visible only when active
  const glow = glowSprite(glowTex, COLORS.accent, 7.5, 0);
  glow.position.z = 0.4;
  g.add(glow);

  return {
    holder: holder, body: body, bodyMat: bodyMat, windowMat: windowMat, glow: glow, cardinal: cardinal,
    // where a Ranger's docking collar meets the hatch, in ring polar terms
    dock: { radius: RING_R - h / 2 - 0.3 - 0.31, tangent: dockX }
  };
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
  const mesh = new THREE.Mesh(geo, mat);
  g.add(mesh);

  // warm tip
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
  // a tiny Ranger-like wedge
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.55, 4),
    new THREE.MeshStandardMaterial({ color: 0xdfe6f0, metalness: 0.5, roughness: 0.4 })
  );
  body.scale.set(1.6, 1, 0.5);
  body.rotation.z = -Math.PI / 2; // nose along +X (direction of travel is tangential)
  g.add(body);

  const engine = glowSprite(glowTex, COLORS.second, 1.4, 0.8);
  engine.position.x = -0.25;
  g.add(engine);
  const core = glowSprite(glowTex, 0xffffff, 0.5, 0.9);
  core.position.x = -0.25;
  g.add(core);
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
    const t = i / (segments - 1);          // 0 = oldest, 1 = at the craft
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

  group.add(buildRingTruss());
  group.add(buildSpokes());

  const modules = [];
  for (let i = 0; i < 12; i++) {
    const m = buildModule(i, glowTex);
    group.add(m.holder);
    modules.push(m);
  }

  group.add(buildHub());

  const hour = buildHand(HOUR_LEN, 0.27, 0.9, 0.2, 1.0, glowTex);
  const minute = buildHand(MINUTE_LEN, 0.16, 1.05, 0.14, 1.26, glowTex);
  group.add(hour);
  group.add(minute);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 0.3, 24),
    hullMaterial(0x161b25, { metalness: 0.7, roughness: 0.35 })
  );
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 1.4;
  group.add(cap);

  // faint orbit path for the second indicator
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

  // the light that follows the active module
  const moduleLight = new THREE.PointLight(COLORS.accent, 0, 9, 1.6);
  group.add(moduleLight);

  const accent = new THREE.Color(COLORS.accent);
  const hot = new THREE.Color(0xfff1dc);
  const windowCool = new THREE.Color(COLORS.window);
  const hullBase = new THREE.Color(COLORS.hull);
  const state = { active: -1, blend: new Array(12).fill(0) };

  function setActive(index) {
    state.active = index;
  }

  /** Animate module highlight blends; dt in seconds. */
  function updateModules(dt, instant) {
    const k = instant ? 1 : Math.min(1, dt * 1.6);
    for (let i = 0; i < 12; i++) {
      const target = i === state.active ? 1 : 0;
      const b = state.blend[i] += (target - state.blend[i]) * k;
      if (Math.abs(b - target) < 0.002) state.blend[i] = target;
      const m = modules[i];
      m.bodyMat.emissive.copy(accent).multiplyScalar(0.55 * b);
      m.bodyMat.color.lerpColors(hullBase, accent, b * 0.8);
      m.windowMat.emissive.lerpColors(windowCool, hot, b);
      m.windowMat.emissiveIntensity = 0.7 + 1.5 * b;
      m.glow.material.opacity = 0.55 * b;
      if (i === state.active) {
        moduleLight.intensity = 14 * b;
        m.glow.getWorldPosition(moduleLight.position);
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
    craft.rotation.z = a - Math.PI / 2; // nose along the direction of travel (clockwise)

    const pos = trail.geometry.attributes.position.array;
    for (let i = 0; i < TRAIL_SEGMENTS; i++) {
      const t = i / (TRAIL_SEGMENTS - 1);
      const deg = secondDeg - TRAIL_DEG * (1 - t) - 0.6;
      const ta = THREE.MathUtils.degToRad(90 - deg);
      pos[i * 3] = Math.cos(ta) * ORBIT_R;
      pos[i * 3 + 1] = Math.sin(ta) * ORBIT_R;
      pos[i * 3 + 2] = 0.35;
    }
    trail.geometry.attributes.position.needsUpdate = true;
  }

  const docks = modules.map((m) => m.dock);

  return { group, modules, docks, hour, minute, craft, trail, glowTex, setActive, updateModules, setAngles };
}
