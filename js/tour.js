/*
 * Cinematic idle tour.
 *
 * After a while with no input the camera leaves its post and runs a slow
 * loop of shots: a dolly around the tilted ring, a close pass on the lit
 * module, a turn to frame Gargantua beyond the ring's edge, a low pass
 * over the hub and its docking port, then a glide home before the loop
 * repeats. Any input eases the camera back to the clock framing.
 *
 * Shots are pure functions of their local progress, blended into each
 * other over a few seconds, so the motion is smooth whatever the frame
 * rate. The clock keeps running throughout; only the camera moves.
 */
import * as THREE from 'three';

const BLEND = 3.0;          // seconds to ease between shots
const RETURN = 2.6;         // seconds to ease home when the tour ends

const smooth = (t) => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp = THREE.MathUtils.lerp;

/**
 * @param ctx { camera, ship, gargantua, sky, getHome: () => {position, target}, onChange: (touring:boolean) => void }
 */
export function createTour(ctx) {
  const { camera, ship } = ctx;
  const _g = new THREE.Vector3();
  const _dir = new THREE.Vector3();

  function activeAngle() {
    const i = ship.modules.findIndex((m) => m.glow.material.opacity > 0.2);
    return THREE.MathUtils.degToRad(90 - (i < 0 ? 0 : i) * 30);
  }

  // ---- shots: (u in 0..1, out) -> fills out.position / out.target ----

  const shots = [
    { // 1. dolly around the tilted ring
      duration: 36,
      pose(u, out) {
        const a = THREE.MathUtils.degToRad(-60 + u * 130);
        const r = lerp(23, 20, smooth(u));
        const z = lerp(12, 8, smooth(u));
        out.position.set(Math.cos(a) * r, Math.sin(a) * r, z);
        out.target.set(0, 0, 0.5);
      }
    },
    { // 2. close pass on the lit module
      duration: 20,
      pose(u, out) {
        const base = activeAngle();
        const a = base + THREE.MathUtils.degToRad(lerp(28, -28, u));
        const r = ship.dims.outerR + 5;
        const z = ship.dims.topZ + lerp(5, 3.5, u);
        out.position.set(Math.cos(a) * r, Math.sin(a) * r, z);
        const mid = (ship.dims.innerR + ship.dims.outerR) / 2;
        out.target.set(Math.cos(base) * mid, Math.sin(base) * mid, 0);
      }
    },
    { // 3. Gargantua beyond the ring's edge
      duration: 22,
      pose(u, out) {
        if (ctx.gargantua) ctx.gargantua.group.getWorldPosition(_g); else _g.set(30, 11, -84);
        ship.group.worldToLocal(_g);
        _dir.set(_g.x, _g.y, 0).normalize();
        // stand on the far side of the ring, low, and drift sideways
        const side = new THREE.Vector3(-_dir.y, _dir.x, 0);
        const r = ship.dims.outerR + 6;
        out.position.copy(_dir).multiplyScalar(-r).addScaledVector(side, lerp(-6, 6, u));
        out.position.z = lerp(2.5, 4, u);
        out.target.copy(_g).multiplyScalar(0.35);     // between the ring and Gargantua, so both read
        out.target.z = lerp(-2, 1, u);
      }
    },
    { // 4. low over the hub and its docking port
      duration: 16,
      pose(u, out) {
        const a = THREE.MathUtils.degToRad(-110 + u * 70);
        const r = 7.5;
        out.position.set(Math.cos(a) * r, Math.sin(a) * r, ship.dims.topZ + lerp(4.5, 3, u));
        out.target.set(0, 0, 0.8);
      }
    },
    { // 5. home, held, before the loop repeats
      duration: 18,
      pose(u, out) {
        const home = ctx.getHome();
        out.position.copy(home.position);
        out.target.copy(home.target);
      }
    }
  ];

  const state = {
    active: false,
    returning: false,
    shot: 0,
    time: 0,            // seconds into the current shot
    from: { position: new THREE.Vector3(), target: new THREE.Vector3() },   // pose at the last switch
    cur: { position: new THREE.Vector3(), target: new THREE.Vector3() },
    tmp: { position: new THREE.Vector3(), target: new THREE.Vector3() },
    returnTime: 0
  };

  function currentTarget(out) {
    // the camera's look-at point is not stored by three; derive one ahead of it
    camera.getWorldDirection(_dir);
    out.copy(camera.position).addScaledVector(_dir, 20);
  }

  function start(shot) {
    state.active = true;
    state.returning = false;
    state.shot = shot || 0;
    state.time = 0;
    state.from.position.copy(camera.position);
    currentTarget(state.from.target);
    if (ctx.onChange) ctx.onChange(true);
  }

  function stop() {
    if (!state.active) return;
    state.returning = true;
    state.returnTime = 0;
    state.from.position.copy(camera.position);
    currentTarget(state.from.target);
    if (ctx.onChange) ctx.onChange(false);
  }

  function apply(pose) {
    camera.position.copy(pose.position);
    camera.lookAt(pose.target);
  }

  /** Advance by dt seconds. Returns true while the tour owns the camera. */
  function update(dt) {
    if (!state.active) return false;

    if (state.returning) {
      state.returnTime += dt;
      const k = smooth(state.returnTime / RETURN);
      const home = ctx.getHome();
      state.cur.position.lerpVectors(state.from.position, home.position, k);
      state.cur.target.lerpVectors(state.from.target, home.target, k);
      apply(state.cur);
      if (state.returnTime >= RETURN) {
        state.active = false;
        state.returning = false;
        return false;
      }
      return true;
    }

    state.time += dt;
    const shot = shots[state.shot];
    if (state.time >= shot.duration) {
      state.from.position.copy(camera.position);
      currentTarget(state.from.target);
      state.shot = (state.shot + 1) % shots.length;
      state.time -= shot.duration;
    }
    const s = shots[state.shot];
    const u = THREE.MathUtils.clamp(state.time / s.duration, 0, 1);
    s.pose(u, state.tmp);
    const k = smooth(state.time / BLEND);
    state.cur.position.lerpVectors(state.from.position, state.tmp.position, k);
    state.cur.target.lerpVectors(state.from.target, state.tmp.target, k);
    apply(state.cur);
    return true;
  }

  return {
    start, stop, update,
    isActive: () => state.active && !state.returning,
    ownsCamera: () => state.active,
    shotIndex: () => state.shot
  };
}
