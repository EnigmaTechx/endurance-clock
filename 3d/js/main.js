/*
 * The full-page 3D clock. Everything scene-related lives in
 * endurance-clock-3d.js (the embeddable widget); this file reads the URL,
 * mounts the widget full-screen and wires the page chrome (nav toggles,
 * alarm panel, tick source) to it.
 */
import { mount } from './endurance-clock-3d.js';
import { DOCK_LEAD } from './ranger.js';
import { FACTOR, RAMP_SECONDS } from './miller.js';

const params = new URLSearchParams(location.search);

// ?demo=dock shifts the clock so the hour turns a few seconds after load,
// which plays the Ranger's docking sequence without waiting for the hour
let timeOffset = 0;
if (params.get('demo') === 'dock') {
  const d = new Date();
  const sec = d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
  timeOffset = ((3600 - DOCK_LEAD - 4) - sec) * 1000;
}

const millerToggle = document.getElementById('miller-toggle');

/** On Miller's planet the tick marks each Earth day of dilated time (every 1.4 s at the film's ratio). */
function setTickSource(on, state) {
  if (!window.Tick) return;
  if (!on) { window.Tick.setSource(null); return; }
  const periodMs = 86400000 / FACTOR;
  // past the ramp the dilated clock is linear: D = t0 + (tau + (K-1)(tau - R/2)) s.
  // Real time of a local midnight D_m on that line, used as the anchor:
  const d0 = new Date(state.t0 + state.timeOffset);
  const midnight = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime();
  const tau = ((midnight - (state.t0 + state.timeOffset)) / 1000 + (FACTOR - 1) * RAMP_SECONDS / 2) / FACTOR;
  window.Tick.setSource({ periodMs, anchorMs: state.t0 + tau * 1000, style: 'miller' });
}

let clock;
try {
  clock = mount(document.getElementById('clock'), {
    quality: params.get('quality') || 'auto',
    hour12: params.has('hour12') ? params.get('hour12') === 'true' : undefined,
    locale: params.get('locale') || undefined,
    timeOffset,
    overlays: { top: document.querySelector('.site-nav') },
    fallback: document.getElementById('fallback'),
    alarmControls: {
      toggle: document.getElementById('alarm-toggle'),
      panel: document.getElementById('alarm-panel'),
      time: document.getElementById('alarm-time'),
      set: document.getElementById('alarm-set'),
      clear: document.getElementById('alarm-clear'),
      presets: Array.from(document.querySelectorAll('#alarm-panel [data-min]')),
      minutes: document.getElementById('countdown-minutes'),
      start: document.getElementById('countdown-start'),
      cancel: document.getElementById('countdown-cancel'),
      sound: document.getElementById('alarm-sound')
    },
    onMillerChange(on, state) {
      millerToggle.setAttribute('aria-pressed', String(on));
      const url = new URL(location.href);
      if (on) url.searchParams.set('mode', 'miller'); else url.searchParams.delete('mode');
      history.replaceState(null, '', url);
      setTickSource(on, state);
    }
  });
} catch (err) {
  document.getElementById('clock').hidden = true;
  throw err;
}

millerToggle.addEventListener('click', () => clock.setMiller(!clock.isMiller()));
if (params.get('mode') === 'miller') clock.setMiller(true);

// handle for poking at the scene from devtools
window.__endurance = clock;
