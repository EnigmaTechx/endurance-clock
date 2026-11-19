/*
 * Murph's watch.
 *
 * In the tesseract, Cooper ticks the second hand of Murph's watch in
 * Morse. With this mode on, the second indicator stops sweeping and ticks
 * like a quartz hand, and it flares in Morse, spelling STAY on a loop:
 * a dot is one flare one second long, a dash three seconds, with the
 * standard gaps. One loop takes 42 seconds. The timeline is anchored to
 * the epoch, so every open page sends the same letter at the same moment.
 *
 * Classic script: defines window.Murph; the page wires the button.
 */
(function (global) {
  'use strict';

  var UNIT_MS = 1000;
  var WORD = 'STAY';
  var MORSE = { S: '...', T: '-', A: '.-', Y: '-.--' };

  // segments: { on, dash, len (units), letter (index), symbol (index) }
  var segments = [];
  for (var li = 0; li < WORD.length; li++) {
    var code = MORSE[WORD[li]];
    for (var si = 0; si < code.length; si++) {
      var dash = code[si] === '-';
      segments.push({ on: true, dash: dash, len: dash ? 3 : 1, letter: li, symbol: si });
      if (si < code.length - 1) segments.push({ on: false, dash: false, len: 1, letter: li, symbol: si });
    }
    segments.push({ on: false, dash: false, len: li < WORD.length - 1 ? 3 : 7, letter: li, symbol: -1 });
  }
  var TOTAL = 0;
  var starts = [];
  for (var k = 0; k < segments.length; k++) { starts.push(TOTAL); TOTAL += segments[k].len; }

  function segmentAt(unit) {
    var u = ((unit % TOTAL) + TOTAL) % TOTAL;
    var lo = 0, hi = segments.length - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= u) lo = mid; else hi = mid - 1;
    }
    return { seg: segments[lo], index: lo, unitInSegment: u - starts[lo] };
  }

  /**
   * State at a wall-clock time.
   * @returns {{on, dash, letter, symbol, flash, phase, unitFrac}}
   *   flash: 0..1 brightness envelope; letter: index into WORD, or -1 in the word gap
   */
  function stateAt(ms) {
    var unit = Math.floor(ms / UNIT_MS);
    var frac = (ms - unit * UNIT_MS) / UNIT_MS;
    var s = segmentAt(unit);
    var seg = s.seg;
    var phase = (s.unitInSegment + frac) / seg.len;      // 0..1 through the segment
    var flash = 0;
    if (seg.on) {
      if (seg.dash) {
        // sustained, with a soft attack and a tail at the end
        flash = Math.min(1, phase * 6) * (0.75 + 0.25 * Math.max(0, 1 - phase)) * (phase > 0.92 ? (1 - phase) / 0.08 : 1);
      } else {
        flash = Math.exp(-frac * 3.2);
      }
    }
    var inWordGap = !seg.on && seg.symbol === -1 && seg.letter === WORD.length - 1;
    return {
      on: seg.on, dash: seg.dash, letter: inWordGap ? -1 : seg.letter, symbol: seg.symbol,
      flash: flash, phase: phase, unitFrac: frac, segment: s.index
    };
  }

  /** The next tick (start of a dot or dash) strictly after `afterMs`. */
  function nextTick(afterMs) {
    var unit = Math.floor(afterMs / UNIT_MS) + 1;
    for (var i = 0; i < TOTAL + 1; i++, unit++) {
      var s = segmentAt(unit);
      if (s.seg.on && s.unitInSegment === 0) return { at: unit * UNIT_MS, alt: s.seg.dash };
    }
    return null;
  }

  global.Murph = { WORD: WORD, MORSE: MORSE, TOTAL_UNITS: TOTAL, UNIT_MS: UNIT_MS, stateAt: stateAt, nextTick: nextTick };
})(window);
