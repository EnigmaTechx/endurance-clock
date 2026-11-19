/*
 * The Ranger and its docking on the hour.
 *
 * A Ranger stays docked on the current hour's module. Starting DOCK_LEAD
 * seconds before the hour it undocks, climbs above the ring plane, flies
 * a clockwise arc to the next module and settles onto its hatch as the
 * hour turns. The whole thing is a pure function of the clock, so a tab
 * that sleeps mid-flight, or a page that loads mid-flight, is always in
 * the right place.
 *
 * Frames: the Ranger's nose is +X and its top (docking collar) is +Z.
 * Docked, the top faces the module's inner hatch, i.e. radially outward.
 */
import * as THREE from 'three';

export const DOCK_LEAD = 24;   // seconds before the hour the Ranger undocks

const PHASE_UNDOCK = 0.18;     // fraction of the lead spent pushing off
const PHASE_DOCK = 0.8;        // fraction at which the final approach starts
const CRUISE_Z = 2.3;          // height above the ring plane in transit, clear of the hands
const CRUISE_IN = 1.5;         // how far inside the hatch radius the transit arc runs

// ---------- timeline ----------

/**
 * @returns {{from:number, to:number, p:number, sinceDock:number}}
 *   from/to: module indices; p: 0..1 flight progress (1 = docked);
 *   sinceDock: seconds since the current docking completed.
 */
export function dockTimeline(now, reduceMotion) {
  const h = now.getHours() % 12;
  const sec = now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
  const start = 3600 - DOCK_LEAD;
  if (!reduceMotion && sec >= start) {
    return { from: h, to: (h + 1) % 12, p: (sec - start) / DOCK_LEAD, sinceDock: Infinity };
  }
  return { from: h, to: h, p: 1, sinceDock: sec };
}

// ---------- geometry ----------

function rangerShape() {
  // a flat, swept lifting body seen from above; nose at +X
  const s = new THREE.Shape();
  s.moveTo(1.0, 0);
  s.bezierCurveTo(0.72, 0.22, 0.25, 0.5, -0.25, 0.56);
  s.lineTo(-0.72, 0.52);
  s.quadraticCurveTo(-0.86, 0.5, -0.86, 0.36);
  s.lineTo(-0.86, -0.36);
  s.quadraticCurveTo(-0.86, -0.5, -0.72, -0.52);
  s.lineTo(-0.25, -0.56);
  s.bezierCurveTo(0.25, -0.5, 0.72, -0.22, 1.0, 0);
  return s;
}

function sprite(texture, color, scale, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, color: color, transparent: true, opacity: opacity,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  s.scale.set(scale, scale, 1);
  return s;
}

export const RANGER_SCALE = 1.4;

export function buildRanger(glowTex) {
  const group = new THREE.Group();
  group.scale.setScalar(RANGER_SCALE);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdfe4ec, metalness: 0.35, roughness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a4250, metalness: 0.6, roughness: 0.5 });

  const geo = new THREE.ExtrudeGeometry(rangerShape(), {
    depth: 0.2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.06, bevelSegments: 3, curveSegments: 16
  });
  geo.translate(0, 0, -0.1);
  group.add(new THREE.Mesh(geo, bodyMat));

  // cockpit canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 12), new THREE.MeshStandardMaterial({
    color: 0x1b2430, metalness: 0.2, roughness: 0.15, emissive: 0x9fd3ff, emissiveIntensity: 0.25
  }));
  canopy.scale.set(1.5, 0.9, 0.5);
  canopy.position.set(0.38, 0, 0.13);
  group.add(canopy);

  // docking collar on top
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 20), darkMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(-0.2, 0, 0.17);
  group.add(collar);

  // engines
  const engineMat = new THREE.MeshStandardMaterial({
    color: 0x2a303c, emissive: 0xffd089, emissiveIntensity: 0.3, roughness: 0.5
  });
  const engineGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.18, 14);
  const engineGlows = [];
  for (const y of [-0.22, 0.22]) {
    const e = new THREE.Mesh(engineGeo, engineMat);
    e.rotation.z = Math.PI / 2;
    e.position.set(-0.9, y, 0);
    group.add(e);
    const g = sprite(glowTex, 0xffd089, 1.5, 0.1);
    g.position.set(-1.02, y, 0);
    group.add(g);
    engineGlows.push(g);
  }

  // RCS thrusters at the corners
  const rcs = [];
  for (const [x, y] of [[0.55, 0.22], [0.55, -0.22], [-0.7, 0.5], [-0.7, -0.5]]) {
    const r = sprite(glowTex, 0xcfe4ff, 0.55, 0);
    r.position.set(x, y, 0.12);
    group.add(r);
    rcs.push(r);
  }

  // dock light: flashes on contact, sits at the collar
  const dockLight = sprite(glowTex, 0xffffff, 1.6, 0);
  dockLight.position.set(-0.2, 0, 0.3);
  group.add(dockLight);

  // ---------- pose ----------

  const _radial = new THREE.Vector3();
  const _tangent = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _x = new THREE.Vector3(1, 0, 0);

  const lerp = THREE.MathUtils.lerp;
  const easeInOut = (q) => q * q * (3 - 2 * q);
  const easeOut = (q) => 1 - Math.pow(1 - q, 3);
  const bump = (q, a, b) => { const u = (q - a) / (b - a); return u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI); };

  /**
   * @param timeline from dockTimeline()
   * @param docks    per-module {radius, tangent, z}: hatch radius, tangential offset and height
   * @param time     scene time in seconds (for thruster flicker)
   */
  function update(timeline, docks, time) {
    const { from, to, p } = timeline;
    const dFrom = docks[from];
    const dTo = docks[to];
    const thFrom = THREE.MathUtils.degToRad(90 - from * 30);
    const thTo = from === to ? thFrom : thFrom - THREE.MathUtils.degToRad(30); // clockwise
    const cruiseR = Math.min(dFrom.radius, dTo.radius) - CRUISE_IN;

    let theta, r, z, tan, engine = 0, thrusters = 0, roll = 0, flash = 0;

    if (from === to || p >= 1) {
      theta = thTo; r = dTo.radius; z = dTo.z || 0; tan = dTo.tangent;
      if (timeline.sinceDock < 1.6) flash = Math.exp(-timeline.sinceDock * 3) ;
    } else if (p < PHASE_UNDOCK) {
      const q = easeInOut(p / PHASE_UNDOCK);
      theta = thFrom;
      r = lerp(dFrom.radius, cruiseR, q);
      z = lerp(dFrom.z || 0, CRUISE_Z, q);
      tan = lerp(dFrom.tangent, 0, q);
      thrusters = bump(q, 0, 0.55);
    } else if (p < PHASE_DOCK) {
      const q = easeInOut((p - PHASE_UNDOCK) / (PHASE_DOCK - PHASE_UNDOCK));
      theta = lerp(thFrom, thTo, q);
      r = cruiseR; z = CRUISE_Z; tan = 0;
      engine = Math.sin(q * Math.PI);
      roll = Math.sin(q * Math.PI) * 0.28;
    } else {
      const q = easeOut((p - PHASE_DOCK) / (1 - PHASE_DOCK));
      theta = thTo;
      r = lerp(cruiseR, dTo.radius, q);
      z = lerp(CRUISE_Z, dTo.z || 0, q);
      tan = lerp(0, dTo.tangent, q);
      thrusters = bump(q, 0.15, 0.95);
      flash = bump(q, 0.9, 1.0);
    }

    _radial.set(Math.cos(theta), Math.sin(theta), 0);
    _tangent.set(Math.sin(theta), -Math.cos(theta), 0); // clockwise direction of travel
    group.position.copy(_radial).multiplyScalar(r).addScaledVector(_tangent, tan);
    group.position.z = z;

    // nose along the direction of travel, top towards the module
    _up.crossVectors(_radial, _tangent);              // = Z x X in the ranger frame
    _m.makeBasis(_tangent, _up, _radial);
    group.setRotationFromMatrix(_m);
    if (roll) group.rotateOnAxis(_x, roll);

    const flicker = 0.7 + 0.3 * Math.sin(time * 37);
    for (const g of engineGlows) g.material.opacity = 0.12 + 0.88 * engine;
    engineMat.emissiveIntensity = 0.2 + 2.2 * engine;
    for (let i = 0; i < rcs.length; i++) {
      rcs[i].material.opacity = thrusters * flicker * (i % 2 === 0 ? 1 : 0.8);
    }
    dockLight.material.opacity = flash * 0.9;
  }

  return { group, update };
}
