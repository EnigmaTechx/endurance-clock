/*
 * Time-of-day lighting.
 *
 * Turns the viewer's local time into a sun elevation value in -1..1
 * (-1 solar midnight, 0 sunrise/sunset, 1 solar noon) and blends three
 * looks from it: night (cool, dim), twilight (golden), day (bright and
 * neutral). Both the 2D and 3D pages read the same palette.
 *
 * Sunrise and sunset come from a built-in schedule unless a latitude and
 * longitude are known (?lat=&lon=, or a geolocation permission that was
 * already granted; the page never prompts for one), in which case they
 * are computed with the NOAA sunrise equation.
 *
 * Classic script: defines window.Daylight.
 */
(function (global) {
  'use strict';

  var DEFAULT_RISE = 6.75 * 60;   // minutes after local midnight
  var DEFAULT_SET = 18.25 * 60;

  var params = new URLSearchParams(global.location ? global.location.search : '');
  var override = params.has('sun') ? clamp(parseFloat(params.get('sun')), -1, 1) : null;
  var location = null;
  if (params.has('lat') && params.has('lon')) {
    location = { lat: parseFloat(params.get('lat')), lon: parseFloat(params.get('lon')) };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function smoothstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function rad(d) { return d * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }

  /** Sunrise and sunset as minutes after local midnight, or null for polar day/night. */
  function sunTimes(date, lat, lon) {
    var start = new Date(date.getFullYear(), 0, 0);
    var n = Math.floor((date - start) / 86400000);
    var g = (2 * Math.PI / 365) * (n - 1 + (date.getHours() - 12) / 24);
    var eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
      - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
      + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    var cosHa = Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl);
    if (cosHa < -1 || cosHa > 1) return null;
    var ha = deg(Math.acos(cosHa));
    var tz = -date.getTimezoneOffset();
    var rise = 720 - 4 * (lon + ha) - eqtime + tz;
    var set = 720 - 4 * (lon - ha) - eqtime + tz;
    return { rise: ((rise % 1440) + 1440) % 1440, set: ((set % 1440) + 1440) % 1440 };
  }

  /** Sun elevation proxy in -1..1 for a local date. */
  function elevation(date) {
    if (override !== null) return override;
    var t = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
    var times = location ? sunTimes(date, location.lat, location.lon) : null;
    var rise = times ? times.rise : DEFAULT_RISE;
    var set = times ? times.set : DEFAULT_SET;
    if (set < rise) set += 1440;
    var dayLen = set - rise;
    var nightLen = 1440 - dayLen;
    var noon = rise + dayLen / 2;
    var tt = t < rise ? t + 1440 : t;      // unwrap so night after sunset is continuous
    if (tt >= rise && tt <= set) {
      return Math.cos((Math.PI / 2) * (tt - noon) / (dayLen / 2));
    }
    var midnight = set + nightLen / 2;
    return -Math.cos((Math.PI / 2) * (tt - midnight) / (nightLen / 2));
  }

  /** Blend weights for the three looks; they sum to 1. */
  function weights(e) {
    var day = smoothstep(0.05, 0.5, e);
    var night = smoothstep(0.05, 0.5, -e);
    return { day: day, night: night, twilight: 1 - day - night };
  }

  // ---- the three looks ----
  // colours are [r, g, b] in 0..255; numbers are scalars

  var LOOKS = {
    night: {
      key: [150, 182, 255], keyIntensity: 0.9,
      sky: [44, 64, 118], ground: [5, 7, 12], hemiIntensity: 0.55,
      rim: [120, 160, 255], rimIntensity: 0.9,
      exposure: 0.88,
      discWarm: 0.85, discBright: 0.8,
      stars: 1.2,
      disc2d: [230, 112, 62], disc2dAlpha: 0.8,
      hull: [122, 134, 152], hand: [214, 224, 240], space: [4, 6, 12]
    },
    twilight: {
      key: [255, 160, 90], keyIntensity: 2.4,
      sky: [128, 84, 72], ground: [22, 10, 8], hemiIntensity: 0.8,
      rim: [170, 190, 255], rimIntensity: 0.6,
      exposure: 1.0,
      discWarm: 1.0, discBright: 1.15,
      stars: 0.9,
      disc2d: [255, 150, 70], disc2dAlpha: 1.1,
      hull: [160, 150, 148], hand: [246, 236, 224], space: [8, 6, 11]
    },
    day: {
      key: [255, 241, 226], keyIntensity: 1.9,
      sky: [122, 150, 200], ground: [20, 24, 32], hemiIntensity: 1.05,
      rim: [160, 196, 255], rimIntensity: 0.5,
      exposure: 1.12,
      discWarm: 0.45, discBright: 1.0,
      stars: 0.65,
      disc2d: [255, 192, 124], disc2dAlpha: 0.9,
      hull: [152, 162, 176], hand: [236, 240, 245], space: [6, 9, 16]
    }
  };

  function mix(key, w) {
    var a = LOOKS.night[key], b = LOOKS.twilight[key], c = LOOKS.day[key];
    if (typeof a === 'number') return a * w.night + b * w.twilight + c * w.day;
    return [0, 1, 2].map(function (i) { return a[i] * w.night + b[i] * w.twilight + c[i] * w.day; });
  }

  /** Full blended palette for an elevation. */
  function palette(e) {
    var w = weights(e);
    var out = { elevation: e, weights: w };
    for (var key in LOOKS.night) if (Object.prototype.hasOwnProperty.call(LOOKS.night, key)) out[key] = mix(key, w);
    return out;
  }

  function at(date) { return palette(elevation(date || new Date())); }

  // ---- optional location, only if already permitted ----

  function tryKnownLocation() {
    if (location || !global.navigator || !navigator.permissions || !navigator.geolocation) return;
    navigator.permissions.query({ name: 'geolocation' }).then(function (status) {
      if (status.state !== 'granted') return;
      navigator.geolocation.getCurrentPosition(function (pos) {
        location = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      }, function () {}, { maximumAge: 3600000, timeout: 8000 });
    }).catch(function () {});
  }

  global.Daylight = { elevation: elevation, weights: weights, palette: palette, at: at, sunTimes: sunTimes, tryKnownLocation: tryKnownLocation };
})(window);
