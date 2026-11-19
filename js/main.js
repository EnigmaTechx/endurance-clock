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
const murphToggle = document.getElementById('murph-toggle');
let millerState = null;

/**
 * What the tick marks: on Miller's planet each Earth day of dilated time
 * (every 1.4 s at the film's ratio); with Murph's watch, the Morse pattern;
 * otherwise every second.
 */
function updateTickSource() {
  if (!window.Tick) return;
  if (clock.isMiller() && millerState) {
    const periodMs = 86400000 / FACTOR;
    // past the ramp the dilated clock is linear: D = t0 + (tau + (K-1)(tau - R/2)) s.
    // Real time of a local midnight D_m on that line, used as the anchor:
    const d0 = new Date(millerState.t0 + millerState.timeOffset);
    const midnight = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime();
    const tau = ((midnight - (millerState.t0 + millerState.timeOffset)) / 1000 + (FACTOR - 1) * RAMP_SECONDS / 2) / FACTOR;
    window.Tick.setSource({ periodMs, anchorMs: millerState.t0 + tau * 1000, style: 'miller' });
  } else if (clock.isMurph() && window.Murph) {
    window.Tick.setSource({ next: window.Murph.nextTick, style: 'clock' });
  } else {
    window.Tick.setSource(null);
  }
}

function setUrlFlag(key, value) {
  const url = new URL(location.href);
  if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  history.replaceState(null, '', url);
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
      millerState = state;
      millerToggle.setAttribute('aria-pressed', String(on));
      setUrlFlag('mode', on ? 'miller' : null);
      updateTickSource();
    },
    onMurphChange(on) {
      murphToggle.setAttribute('aria-pressed', String(on));
      setUrlFlag('murph', on ? '1' : null);
      updateTickSource();
    }
  });
} catch (err) {
  document.getElementById('clock').hidden = true;
  throw err;
}

millerToggle.addEventListener('click', () => clock.setMiller(!clock.isMiller()));
murphToggle.addEventListener('click', () => clock.setMurph(!clock.isMurph()));
if (params.get('mode') === 'miller') clock.setMiller(true);
if (params.get('murph') === '1') clock.setMurph(true);

// handle for poking at the scene from devtools
window.__endurance = clock;
