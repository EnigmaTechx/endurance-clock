/*
 * Miller's planet mode.
 *
 * "Every hour we spend on that planet will be seven years back on Earth."
 * The viewer is on the planet; the Endurance clock overhead runs at that
 * ratio. The dilated clock is an analytic function of real elapsed time,
 * with a short smooth ramp from 1x to full rate, so it never drifts when
 * a tab sleeps.
 */

export const HOURS_PER_YEAR = 365.25 * 24;
export const FACTOR = 7 * HOURS_PER_YEAR;          // 61 362 x
export const RAMP_SECONDS = 2.5;                   // time to reach full rate

/** Smoothstep and its integral, for the rate ramp. */
function s(u) { return u * u * (3 - 2 * u); }
function S(u) { return u * u * u - (u * u * u * u) / 2; }

/** Instantaneous rate multiplier at real elapsed tau (seconds). */
export function rateAt(tau) {
  if (tau <= 0) return 1;
  if (tau >= RAMP_SECONDS) return FACTOR;
  return 1 + (FACTOR - 1) * s(tau / RAMP_SECONDS);
}

/** Dilated elapsed seconds after tau real seconds. */
export function dilatedElapsed(tau) {
  if (tau <= 0) return 0;
  if (tau >= RAMP_SECONDS) return tau + (FACTOR - 1) * (tau - RAMP_SECONDS / 2);
  return tau + (FACTOR - 1) * RAMP_SECONDS * S(tau / RAMP_SECONDS);
}

const SECONDS_PER_DAY = 86400;
const SECONDS_PER_YEAR = HOURS_PER_YEAR * 3600;

/** Split dilated seconds into years, days and hours for the readout. */
export function splitElapsed(seconds) {
  const years = Math.floor(seconds / SECONDS_PER_YEAR);
  let rest = seconds - years * SECONDS_PER_YEAR;
  const days = Math.floor(rest / SECONDS_PER_DAY);
  rest -= days * SECONDS_PER_DAY;
  const hours = Math.floor(rest / 3600);
  return { years, days, hours };
}
