/*
 * Alarm and countdown.
 *
 * A one-shot alarm at a clock time, and a countdown in minutes. Both are
 * persisted in localStorage. While armed, the alarm's hour module breathes
 * and a beacon marks the alarm position on the ring; a countdown puts a
 * marker on the second craft's orbit where the craft will be when time is
 * up, and in the final minute a shrinking arc joins the craft to it. When
 * either fires, a wave of light chases round the ring, a soft chime
 * repeats (with a vibration on phones) and a tap anywhere dismisses it.
 */
import * as THREE from 'three';
import { RING_R, ORBIT_R } from './ship.js';

const STORE = { alarm: 'endurance.alarm', alarmAt: 'endurance.alarmAt', countdown: 'endurance.countdownEnd', sound: 'endurance.sound' };
const RING_FOR_MS = 90000;        // auto-stop ringing after this
const STALE_MS = 10 * 60000;      // a missed alarm older than this is dropped, not rung
const COLOR = 0xffb25c;

function store(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch (e) { /* storage unavailable */ }
}
function load(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

/** Next occurrence of HH:MM at or after `from`. */
function nextOccurrence(hm, from) {
  const [h, m] = hm.split(':').map(Number);
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), h, m, 0, 0);
  if (d <= from) d.setDate(d.getDate() + 1);
  return d;
}

function describeIn(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return 'in ' + h + 'h ' + pad2(m) + 'm';
  if (m > 0) return 'in ' + m + 'm';
  return 'in ' + s + 's';
}

function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h > 0 ? h + ':' + pad2(m) : m) + ':' + pad2(r);
}

// ---------- scene objects ----------

function makeSprite(tex, color, scale, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  s.scale.set(scale, scale, 1);
  return s;
}

function makeArc() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uStart: { value: 0 }, uSweep: { value: 0 }, uColor: { value: new THREE.Color(COLOR) } },
    vertexShader: 'varying vec2 vPos; void main(){ vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform float uStart, uSweep; uniform vec3 uColor; varying vec2 vPos;
      void main() {
        // clock angle: 0 at 12 o'clock, increasing clockwise, in turns
        float a = atan(vPos.y, vPos.x);
        float c = fract((1.5707963 - a) / 6.2831853);
        float d = fract(c - uStart);              // turns past the start, clockwise
        if (d > uSweep) discard;
        float head = smoothstep(0.0, 0.015, uSweep - d);   // soft tip at the marker
        float tail = 0.35 + 0.65 * (d / max(uSweep, 1e-4)); // brighter towards the marker
        gl_FragColor = vec4(uColor * tail * 1.6, head * tail);
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(ORBIT_R - 0.07, ORBIT_R + 0.07, 180, 1), mat);
  mesh.position.z = 0.33;
  mesh.visible = false;
  return { mesh, mat };
}

// ---------- audio ----------

function createChime() {
  let ctx = null;
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function play() {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime;
    const master = c.createGain();
    master.gain.value = 0.0001;
    master.connect(c.destination);
    master.gain.exponentialRampToValueAtTime(0.18, t0 + 0.03);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
    for (const [freq, delay, level] of [[659.25, 0, 1], [987.77, 0.18, 0.7], [1318.5, 0.36, 0.45]]) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = c.createGain();
      g.gain.value = level;
      o.connect(g).connect(master);
      o.start(t0 + delay);
      o.stop(t0 + 1.4);
    }
  }
  return { unlock: ensure, play };
}

// ---------- the feature ----------

/**
 * @param opts.ship        the built ship (for group, glowTex, setPulse, setTrailBoost)
 * @param opts.els         { toggle, panel, time, set, clear, presets, minutes, start, cancel, sound, status }
 * @param opts.line        readout element for the alarm/countdown line
 * @param opts.reduceMotion
 */
export function createAlarm(opts) {
  const { ship, els, line, reduceMotion } = opts;
  const chime = createChime();

  const state = {
    alarmHM: load(STORE.alarm),
    alarmAt: null,
    countdownEnd: Number(load(STORE.countdown)) || null,
    sound: load(STORE.sound) !== '0',
    ringing: null,          // { kind: 'alarm' | 'countdown', since: ms }
    lastChime: 0
  };
  const baseTitle = document.title;

  // scene objects
  const beacon = new THREE.Group();
  const beaconGlow = makeSprite(ship.glowTex, COLOR, 2.2, 0.6);
  const beaconCore = makeSprite(ship.glowTex, 0xffffff, 0.6, 0.9);
  beacon.add(beaconGlow, beaconCore);
  beacon.visible = false;
  ship.group.add(beacon);

  const endMarker = new THREE.Group();
  endMarker.add(makeSprite(ship.glowTex, COLOR, 1.8, 0.55), makeSprite(ship.glowTex, 0xffffff, 0.5, 0.9));
  const tick = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), new THREE.MeshBasicMaterial({ color: COLOR }));
  endMarker.add(tick);
  endMarker.visible = false;
  ship.group.add(endMarker);

  const arc = makeArc();
  ship.group.add(arc.mesh);

  const pulses = new Float32Array(12);

  // ---------- state changes ----------

  function scheduleAlarm(now) {
    state.alarmAt = state.alarmHM ? nextOccurrence(state.alarmHM, now) : null;
    store(STORE.alarmAt, state.alarmAt ? state.alarmAt.getTime() : null);
  }

  function setAlarm(hm, now) {
    state.alarmHM = hm;
    store(STORE.alarm, hm);
    scheduleAlarm(now);
    chime.unlock();
    renderPanel();
  }

  function clearAlarm() {
    state.alarmHM = null;
    state.alarmAt = null;
    store(STORE.alarm, null);
    store(STORE.alarmAt, null);
    renderPanel();
  }

  function startCountdown(minutes, now) {
    state.countdownEnd = now.getTime() + minutes * 60000;
    store(STORE.countdown, state.countdownEnd);
    chime.unlock();
    renderPanel();
  }

  function cancelCountdown() {
    state.countdownEnd = null;
    store(STORE.countdown, null);
    document.title = baseTitle;
    renderPanel();
  }

  function ring(kind, now) {
    state.ringing = { kind, since: now.getTime() };
    state.lastChime = 0;
    if (kind === 'alarm') clearAlarm(); else cancelCountdown();
    // vibration needs a prior user gesture; skip it quietly otherwise (e.g. after a reload)
    const active = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    if (navigator.vibrate && active) { try { navigator.vibrate([250, 120, 250]); } catch (e) { /* ignore */ } }
  }

  function dismiss() {
    if (!state.ringing) return;
    state.ringing = null;
    line.classList.remove('is-ringing');
    for (let i = 0; i < 12; i++) pulses[i] = 0;
    renderPanel();
  }

  // ---------- panel ----------

  function openPanel(open) {
    if (!els) return;
    els.panel.hidden = !open;
    els.toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      if (!els.time.value) {
        const d = new Date(Date.now() + 3600000);
        els.time.value = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
      }
      els.time.focus();
    }
  }

  function renderPanel() {
    if (!els) return;
    els.clear.hidden = !state.alarmHM;
    els.cancel.hidden = !state.countdownEnd;
    els.sound.checked = state.sound;
    els.toggle.classList.toggle('is-armed', !!(state.alarmHM || state.countdownEnd));
    if (state.alarmHM) els.time.value = state.alarmHM;
  }

  if (els) {
    els.toggle.addEventListener('click', () => openPanel(els.panel.hidden));
    els.set.addEventListener('click', () => {
      if (/^\d\d:\d\d$/.test(els.time.value)) { setAlarm(els.time.value, new Date()); openPanel(false); }
    });
    els.time.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.set.click(); });
    els.clear.addEventListener('click', () => clearAlarm());
    for (const b of els.presets) {
      b.addEventListener('click', () => { startCountdown(Number(b.dataset.min), new Date()); openPanel(false); });
    }
    els.start.addEventListener('click', () => {
      const v = Number(els.minutes.value);
      if (v >= 1 && v <= 720) { startCountdown(v, new Date()); els.minutes.value = ''; openPanel(false); }
    });
    els.minutes.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.start.click(); });
    els.cancel.addEventListener('click', () => cancelCountdown());
    els.sound.addEventListener('change', () => { state.sound = els.sound.checked; store(STORE.sound, state.sound ? '1' : '0'); if (state.sound) chime.unlock(); });
  }
  const onKey = (e) => { if (e.key === 'Escape') { openPanel(false); dismiss(); } };
  // a tap anywhere dismisses a ringing alarm; a tap outside closes the panel
  const onPointer = (e) => {
    if (state.ringing) { dismiss(); return; }
    if (els && !els.panel.hidden && !els.panel.contains(e.target) && e.target !== els.toggle) openPanel(false);
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onPointer);
  function destroy() {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerdown', onPointer);
    document.title = baseTitle;
  }

  // initial schedule. A stored target that is still ahead, or only just
  // passed (a reload right after the alarm time), is kept so it rings;
  // anything older is dropped rather than rung a day late.
  {
    const now = new Date();
    const storedAt = Number(load(STORE.alarmAt)) || 0;
    if (state.alarmHM && storedAt && now.getTime() - storedAt < STALE_MS) {
      state.alarmAt = new Date(storedAt);
    } else if (state.alarmHM && storedAt) {
      clearAlarm();
    } else {
      scheduleAlarm(now);
    }
    if (state.countdownEnd && now.getTime() - state.countdownEnd > STALE_MS) cancelCountdown();
    renderPanel();
  }

  // ---------- per frame ----------

  const _tmp = new THREE.Vector3();
  function placeOnRing(obj, clockDeg, radius, z) {
    const a = THREE.MathUtils.degToRad(90 - clockDeg);
    obj.position.set(Math.cos(a) * radius, Math.sin(a) * radius, z);
    obj.rotation.z = a - Math.PI / 2;
  }

  let lastLineKey = '';
  function setLine(text, key) {
    if (key === lastLineKey) return;
    lastLineKey = key;
    line.textContent = text;
    const wasHidden = line.hidden;
    line.hidden = !text;
    if (wasHidden !== line.hidden && opts.onLayoutChange) opts.onLayoutChange();
  }

  /**
   * @param now   current Date (real time)
   * @param t     scene seconds, for pulsing
   * @returns pulses per module (0..1) for the ship to blend in
   */
  function update(now, t) {
    const ms = now.getTime();
    let text = '';
    let key = '';
    let trailBoost = 0;

    // ----- alarm -----
    if (state.alarmAt) {
      if (ms >= state.alarmAt.getTime()) {
        if (ms - state.alarmAt.getTime() < STALE_MS) ring('alarm', now);
        else clearAlarm();
      }
    }
    if (state.alarmAt) {
      const h = state.alarmAt.getHours() % 12, m = state.alarmAt.getMinutes();
      const clockDeg = (h + m / 60) * 30;
      placeOnRing(beacon, clockDeg, RING_R + 1.25, 0.5);
      beacon.visible = true;
      beaconGlow.material.opacity = reduceMotion ? 0.6 : 0.45 + 0.3 * Math.sin(t * 2.2);
      const breathe = reduceMotion ? 0.45 : 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2.2));
      for (let i = 0; i < 12; i++) pulses[i] = i === h ? breathe : 0;
      text += 'Alarm ' + state.alarmHM + ' \u00b7 ' + describeIn(state.alarmAt.getTime() - ms);
      key += 'a' + state.alarmHM + Math.floor((state.alarmAt.getTime() - ms) / 1000);
    } else {
      beacon.visible = false;
      if (!state.ringing) for (let i = 0; i < 12; i++) pulses[i] = 0;
    }

    // ----- countdown -----
    if (state.countdownEnd) {
      const left = state.countdownEnd - ms;
      if (left <= 0) {
        ring('countdown', now);
      } else {
        const end = new Date(state.countdownEnd);
        const endSec = end.getSeconds() + end.getMilliseconds() / 1000;
        placeOnRing(endMarker, endSec * 6, ORBIT_R, 0.35);
        endMarker.visible = true;
        if (left <= 60000) {
          const nowSec = now.getSeconds() + now.getMilliseconds() / 1000;
          arc.mat.uniforms.uStart.value = nowSec / 60;
          arc.mat.uniforms.uSweep.value = left / 60000;
          arc.mesh.visible = true;
          trailBoost = 1 - left / 60000;
        } else {
          arc.mesh.visible = false;
        }
        const cd = formatCountdown(left);
        text += (text ? ' \u00b7 ' : '') + 'Countdown ' + cd;
        key += 'c' + cd;
        document.title = cd + ' \u00b7 ' + baseTitle;
      }
    } else {
      endMarker.visible = false;
      arc.mesh.visible = false;
    }

    // ----- ringing -----
    if (state.ringing) {
      const since = ms - state.ringing.since;
      if (since > RING_FOR_MS) {
        dismiss();
      } else {
        for (let i = 0; i < 12; i++) {
          pulses[i] = reduceMotion ? 0.7 : 0.5 + 0.5 * Math.sin(t * 5 - i * 0.52);
        }
        if (state.sound && ms - state.lastChime > 1500) {
          state.lastChime = ms;
          chime.play();
        }
        text = (state.ringing.kind === 'alarm' ? 'Alarm' : 'Time\u2019s up') + ' \u00b7 tap to dismiss';
        key = 'ring' + state.ringing.kind;
        line.classList.add('is-ringing');
      }
    }

    ship.setTrailBoost(trailBoost);
    setLine(text, key);
    return pulses;
  }

  return { update, setAlarm, clearAlarm, startCountdown, cancelCountdown, dismiss, destroy, state };
}
