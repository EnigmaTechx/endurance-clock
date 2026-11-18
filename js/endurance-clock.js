/*
 * Endurance Clock
 * An analog clock drawn as the Endurance from Interstellar (2014):
 * a ring of twelve modules, 30 degrees apart, one per hour position.
 *
 * Plain JS, no dependencies, no build step.
 *
 * Usage:
 *   <div class="endurance-clock" data-endurance-clock></div>
 *   <script src="endurance-clock.js"></script>
 *
 * Elements with [data-endurance-clock] mount automatically.
 * Or mount by hand:  const clock = EnduranceClock.mount(el, { hour12: true });
 *                    clock.destroy();
 */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // Geometry (SVG user units; viewBox is SIZE x SIZE)
  var SIZE = 1000;
  var CX = SIZE / 2;
  var CY = SIZE / 2;
  var RING_R = 352;          // centreline of the ring
  var MODULES = 12;
  var HUB_R = 68;
  var ORBIT_R = RING_R + 64; // second indicator orbit
  var HOUR_LEN = 262;
  var MINUTE_LEN = 306;

  // ---------- helpers ----------

  function make(name, attrs, parent) {
    var node = document.createElementNS(SVG_NS, name);
    if (attrs) {
      for (var key in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, key)) {
          node.setAttribute(key, attrs[key]);
        }
      }
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  function polar(radius, deg) {
    var a = (deg - 90) * Math.PI / 180;
    return [CX + radius * Math.cos(a), CY + radius * Math.sin(a)];
  }

  function fmt(n) {
    return n.toFixed(2).replace(/\.?0+$/, '');
  }

  function arcPath(radius, fromDeg, toDeg) {
    var p0 = polar(radius, fromDeg);
    var p1 = polar(radius, toDeg);
    var sweep = toDeg - fromDeg;
    var large = Math.abs(sweep) > 180 ? 1 : 0;
    var dir = sweep >= 0 ? 1 : 0;
    return 'M' + fmt(p0[0]) + ' ' + fmt(p0[1]) +
      ' A' + radius + ' ' + radius + ' 0 ' + large + ' ' + dir + ' ' +
      fmt(p1[0]) + ' ' + fmt(p1[1]);
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  // ---------- drawing ----------

  function drawDefs(svg) {
    var defs = make('defs', null, svg);

    var glow = make('filter', {
      id: 'ec-glow', x: '-60%', y: '-60%', width: '220%', height: '220%'
    }, defs);
    make('feGaussianBlur', { stdDeviation: 14, result: 'b' }, glow);
    var merge = make('feMerge', null, glow);
    make('feMergeNode', { 'in': 'b' }, merge);
    make('feMergeNode', { 'in': 'SourceGraphic' }, merge);

    var soft = make('filter', {
      id: 'ec-soft', x: '-100%', y: '-100%', width: '300%', height: '300%'
    }, defs);
    make('feGaussianBlur', { stdDeviation: 5 }, soft);

    var shadow = make('filter', {
      id: 'ec-shadow', x: '-20%', y: '-20%', width: '140%', height: '140%'
    }, defs);
    make('feDropShadow', {
      dx: 0, dy: 3, stdDeviation: 4, 'flood-color': '#000', 'flood-opacity': 0.6
    }, shadow);
  }

  function drawRingTruss(svg) {
    var g = make('g', { 'class': 'ec-ring-truss' }, svg);
    // main structural ring plus two outer rails
    make('circle', { 'class': 'ec-truss', cx: CX, cy: CY, r: RING_R, 'stroke-width': 12 }, g);
    make('circle', { 'class': 'ec-truss-rail', cx: CX, cy: CY, r: RING_R - 23, 'stroke-width': 3 }, g);
    make('circle', { 'class': 'ec-truss-rail', cx: CX, cy: CY, r: RING_R + 23, 'stroke-width': 3 }, g);
    // cross-bracing between the rails, at the midpoint between modules
    for (var i = 0; i < MODULES; i++) {
      var deg = i * 30 + 15;
      var a = polar(RING_R - 23, deg - 4);
      var b = polar(RING_R + 23, deg + 4);
      var c = polar(RING_R - 23, deg + 4);
      var d = polar(RING_R + 23, deg - 4);
      make('line', { 'class': 'ec-spoke-rung', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, g);
      make('line', { 'class': 'ec-spoke-rung', x1: c[0], y1: c[1], x2: d[0], y2: d[1] }, g);
    }
  }

  function drawSpokes(svg) {
    var g = make('g', { 'class': 'ec-spokes' }, svg);
    var inner = HUB_R - 4;
    var outer = RING_R - 30;
    for (var i = 0; i < 4; i++) {
      var sg = make('g', { transform: 'rotate(' + (i * 90) + ' ' + CX + ' ' + CY + ')' }, g);
      // truss body (points up from hub to ring at 12 o'clock, then rotated)
      make('rect', {
        'class': 'ec-spoke',
        x: CX - 9, y: CY - outer, width: 18, height: outer - inner, rx: 2
      }, sg);
      for (var y = CY - outer + 18; y < CY - inner - 8; y += 22) {
        make('line', { 'class': 'ec-spoke-rung', x1: CX - 9, y1: y, x2: CX + 9, y2: y + 11 }, sg);
      }
    }
  }

  function drawHub(svg) {
    var g = make('g', { 'class': 'ec-hub-group', filter: 'url(#ec-shadow)' }, svg);
    make('circle', { 'class': 'ec-hub', cx: CX, cy: CY, r: HUB_R }, g);
    make('circle', { 'class': 'ec-hub-inner', cx: CX, cy: CY, r: HUB_R - 20 }, g);
    // four docking ports between the spokes
    for (var i = 0; i < 4; i++) {
      var p = polar(HUB_R - 10, i * 90 + 45);
      make('circle', { 'class': 'ec-hub-port', cx: p[0], cy: p[1], r: 7 }, g);
    }
  }

  function drawModule(parent, index) {
    var deg = index * 30;
    var cardinal = index % 3 === 0; // 12, 3, 6, 9: the four command modules
    var w = cardinal ? 134 : 110;
    var h = cardinal ? 70 : 58;

    // local frame: module centred at (0,0), "outward" is -y
    var g = make('g', {
      'class': 'ec-module' + (cardinal ? ' ec-module--command' : ''),
      'data-hour': index === 0 ? 12 : index,
      transform: 'rotate(' + deg + ' ' + CX + ' ' + CY + ') translate(' + CX + ' ' + (CY - RING_R) + ')'
    }, parent);

    // warm glow (only visible when active)
    make('rect', {
      'class': 'ec-module__glow',
      x: -w / 2 - 6, y: -h / 2 - 6, width: w + 12, height: h + 12, rx: 20,
      filter: 'url(#ec-glow)'
    }, g);

    make('rect', {
      'class': 'ec-module__body',
      x: -w / 2, y: -h / 2, width: w, height: h, rx: 14,
      filter: 'url(#ec-shadow)'
    }, g);

    // inward-facing shade band
    make('rect', {
      'class': 'ec-module__shade',
      x: -w / 2 + 2, y: h / 2 - 16, width: w - 4, height: 14, rx: 6
    }, g);

    // panel seams
    make('line', { 'class': 'ec-module__seam', x1: -w / 4, y1: -h / 2 + 2, x2: -w / 4, y2: h / 2 - 2 }, g);
    make('line', { 'class': 'ec-module__seam', x1: w / 4, y1: -h / 2 + 2, x2: w / 4, y2: h / 2 - 2 }, g);

    if (cardinal) {
      // row of viewports on the command modules
      for (var k = -2; k <= 2; k++) {
        make('circle', { 'class': 'ec-module__window', cx: k * 20, cy: -8, r: 4.5 }, g);
      }
    } else {
      // slot windows plus an inner docking hatch (for Rangers and Landers)
      make('rect', { 'class': 'ec-module__window', x: -w / 2 + 14, y: -10, width: 18, height: 6, rx: 3 }, g);
      make('rect', { 'class': 'ec-module__window', x: w / 2 - 32, y: -10, width: 18, height: 6, rx: 3 }, g);
      make('rect', { 'class': 'ec-module__hatch', x: -13, y: h / 2 - 2, width: 26, height: 14, rx: 3 }, g);
      make('circle', { 'class': 'ec-module__hatch', cx: 0, cy: h / 2 + 5, r: 4 }, g);
    }
    return g;
  }

  function drawModules(svg) {
    var g = make('g', { 'class': 'ec-modules' }, svg);
    var list = [];
    for (var i = 0; i < MODULES; i++) list.push(drawModule(g, i));
    return list;
  }

  function drawHands(svg) {
    var g = make('g', { 'class': 'ec-hands' }, svg);

    var hour = make('g', { 'class': 'ec-hand ec-hand-hour-group' }, g);
    make('polygon', {
      'class': 'ec-hand-hour',
      points: [
        [CX - 9, CY + 28], [CX - 9, CY - HOUR_LEN + 40], [CX, CY - HOUR_LEN],
        [CX + 9, CY - HOUR_LEN + 40], [CX + 9, CY + 28]
      ].map(function (p) { return p.join(','); }).join(' ')
    }, hour);
    make('polygon', {
      'class': 'ec-hand-tip',
      points: [
        [CX - 4.5, CY - HOUR_LEN + 42], [CX, CY - HOUR_LEN + 6], [CX + 4.5, CY - HOUR_LEN + 42]
      ].map(function (p) { return p.join(','); }).join(' ')
    }, hour);

    var minute = make('g', { 'class': 'ec-hand ec-hand-minute-group' }, g);
    make('polygon', {
      'class': 'ec-hand-minute',
      points: [
        [CX - 5.5, CY + 34], [CX - 5.5, CY - MINUTE_LEN + 34], [CX, CY - MINUTE_LEN],
        [CX + 5.5, CY - MINUTE_LEN + 34], [CX + 5.5, CY + 34]
      ].map(function (p) { return p.join(','); }).join(' ')
    }, minute);
    make('polygon', {
      'class': 'ec-hand-tip',
      points: [
        [CX - 2.5, CY - MINUTE_LEN + 36], [CX, CY - MINUTE_LEN + 5], [CX + 2.5, CY - MINUTE_LEN + 36]
      ].map(function (p) { return p.join(','); }).join(' ')
    }, minute);

    make('circle', { 'class': 'ec-hand-cap', cx: CX, cy: CY, r: 11 }, g);

    return { hour: hour, minute: minute };
  }

  function drawSeconds(svg) {
    var g = make('g', { 'class': 'ec-seconds-group' }, svg);
    make('circle', { 'class': 'ec-orbit', cx: CX, cy: CY, r: ORBIT_R }, g);
    var trail = make('path', { 'class': 'ec-second-trail', d: '' }, g);
    var dot = make('g', { 'class': 'ec-second' }, g);
    var halo = make('circle', { 'class': 'ec-second-dot', cx: CX, cy: CY - ORBIT_R, r: 9, opacity: 0.45, filter: 'url(#ec-soft)' }, dot);
    var body = make('circle', { 'class': 'ec-second-dot', cx: CX, cy: CY - ORBIT_R, r: 4 }, dot);
    make('circle', { 'class': 'ec-second-dot-core', cx: CX, cy: CY - ORBIT_R, r: 1.6 }, dot);
    return { trail: trail, dot: dot, halo: halo, body: body };
  }

  function buildSvg() {
    var svg = make('svg', {
      'class': 'endurance-clock__svg',
      viewBox: '0 0 ' + SIZE + ' ' + SIZE,
      focusable: 'false',
      'aria-hidden': 'true'
    });
    drawDefs(svg);
    drawRingTruss(svg);
    drawSpokes(svg);
    var modules = drawModules(svg);
    drawHub(svg);               // hub sits above the spokes, below the hands
    var hands = drawHands(svg);
    var seconds = drawSeconds(svg);
    return { svg: svg, modules: modules, hands: hands, seconds: seconds };
  }

  function buildReadout() {
    var box = document.createElement('div');
    box.className = 'endurance-clock__readout';

    var time = document.createElement('div');
    time.className = 'endurance-clock__time';
    var hm = document.createElement('span');
    hm.className = 'ec-hm';
    var sec = document.createElement('span');
    sec.className = 'ec-seconds';
    var period = document.createElement('span');
    period.className = 'ec-period';
    time.appendChild(hm);
    time.appendChild(sec);
    time.appendChild(period);

    var meta = document.createElement('div');
    meta.className = 'endurance-clock__meta';

    box.appendChild(time);
    box.appendChild(meta);
    return { box: box, hm: hm, sec: sec, period: period, meta: meta };
  }

  // ---------- clock ----------

  function mount(root, options) {
    options = options || {};
    if (!root || root.__enduranceClock) return root && root.__enduranceClock;

    var reduceMotion = global.matchMedia &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var hour12 = typeof options.hour12 === 'boolean' ? options.hour12 : undefined;
    var locale = options.locale || undefined;

    var timeFmt = new Intl.DateTimeFormat(locale, {
      hour: '2-digit', minute: '2-digit', hour12: hour12
    });
    var dateFmt = new Intl.DateTimeFormat(locale, {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    });
    var zoneFmt = new Intl.DateTimeFormat(locale, { timeZoneName: 'short' });
    var ariaFmt = new Intl.DateTimeFormat(locale, {
      hour: 'numeric', minute: '2-digit', weekday: 'long', day: 'numeric', month: 'long'
    });

    root.classList.add('endurance-clock');
    root.setAttribute('role', 'img');

    var gargantua = document.createElement('div');
    gargantua.className = 'endurance-clock__gargantua';
    gargantua.setAttribute('aria-hidden', 'true');

    var ship = buildSvg();
    var readout = buildReadout();

    root.appendChild(gargantua);
    root.appendChild(ship.svg);
    root.appendChild(readout.box);

    var state = { activeModule: -1, lastSecond: -1, lastMinute: -1, raf: 0, timer: 0, alive: true, murph: false, murphLetter: -2 };
    var murphLine = null;

    function renderMurphLine(letter) {
      if (letter === state.murphLetter) return;
      state.murphLetter = letter;
      if (!murphLine) {
        murphLine = document.createElement('div');
        murphLine.className = 'endurance-clock__murph';
        readout.box.appendChild(murphLine);
      }
      murphLine.textContent = '';
      murphLine.appendChild(document.createTextNode('Murph\u2019s watch \u00b7 '));
      var word = global.Murph.WORD;
      for (var i = 0; i < word.length; i++) {
        var span = document.createElement('span');
        span.className = 'ec-letter' + (i === letter ? ' is-sending' : '');
        span.textContent = word[i];
        murphLine.appendChild(span);
      }
    }

    function zoneName(d) {
      var parts = zoneFmt.formatToParts(d);
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'timeZoneName') return parts[i].value;
      }
      return '';
    }

    function render(now) {
      var ms = now.getMilliseconds();
      var s = now.getSeconds();
      var m = now.getMinutes();
      var h = now.getHours();

      var secF = reduceMotion ? s : s + ms / 1000;
      var minF = m + secF / 60;
      var hourF = (h % 12) + minF / 60;

      var secDeg = secF * 6;
      var flash = 0;
      if (state.murph && global.Murph) {
        // Murph's watch: a quartz tick instead of a sweep, flaring in Morse
        var st = global.Murph.stateAt(now.getTime());
        secDeg = s * 6;
        flash = st.flash;
        renderMurphLine(st.letter);
      }
      ship.seconds.halo.setAttribute('r', fmt(9 + 11 * flash));
      ship.seconds.halo.setAttribute('opacity', fmt(0.45 + 0.5 * flash));
      ship.seconds.body.setAttribute('r', fmt(4 + 2 * flash));
      var minDeg = minF * 6;
      var hourDeg = hourF * 30;

      ship.hands.hour.setAttribute('transform', 'rotate(' + fmt(hourDeg) + ' ' + CX + ' ' + CY + ')');
      ship.hands.minute.setAttribute('transform', 'rotate(' + fmt(minDeg) + ' ' + CX + ' ' + CY + ')');
      ship.seconds.dot.setAttribute('transform', 'rotate(' + fmt(secDeg) + ' ' + CX + ' ' + CY + ')');
      ship.seconds.trail.setAttribute('d', arcPath(ORBIT_R, secDeg - 28, secDeg - 1.5));

      var active = h % 12;
      if (active !== state.activeModule) {
        if (state.activeModule >= 0) ship.modules[state.activeModule].classList.remove('is-active');
        ship.modules[active].classList.add('is-active');
        state.activeModule = active;
      }

      if (s !== state.lastSecond) {
        state.lastSecond = s;
        // hours and minutes in the locale's format; seconds and AM/PM set apart
        var parts = timeFmt.formatToParts(now);
        var hm = '';
        var period = '';
        for (var i = 0; i < parts.length; i++) {
          var part = parts[i];
          if (part.type === 'dayPeriod') period = part.value;
          else if (part.type === 'literal' && !/[:.]/.test(part.value)) continue;
          else hm += part.value;
        }
        readout.hm.textContent = hm.trim();
        readout.sec.textContent = pad2(s);
        readout.period.textContent = period;
      }

      if (m !== state.lastMinute) {
        state.lastMinute = m;
        readout.meta.innerHTML = '';
        readout.meta.appendChild(document.createTextNode(dateFmt.format(now)));
        var sep = document.createElement('span');
        sep.className = 'ec-sep';
        sep.textContent = '·';
        readout.meta.appendChild(sep);
        readout.meta.appendChild(document.createTextNode(zoneName(now) + ' local'));
        root.setAttribute('aria-label', 'Endurance clock. ' + ariaFmt.format(now));
      }
    }

    function tick() {
      if (!state.alive) return;
      render(new Date());
      if (reduceMotion) {
        // step once per second, aligned to the clock
        state.timer = global.setTimeout(tick, 1000 - new Date().getMilliseconds() + 5);
      } else {
        state.raf = global.requestAnimationFrame(tick);
      }
    }

    tick();

    var api = {
      root: root,
      /** Murph's watch: the second indicator ticks STAY in Morse (needs js/murph.js). */
      setMurph: function (on) {
        on = !!on && !!global.Murph;
        if (on === state.murph) return;
        state.murph = on;
        state.murphLetter = -2;
        root.classList.toggle('is-murph', on);
        if (!on && murphLine) { murphLine.remove(); murphLine = null; }
      },
      isMurph: function () { return state.murph; },
      destroy: function () {
        state.alive = false;
        if (state.raf) global.cancelAnimationFrame(state.raf);
        if (state.timer) global.clearTimeout(state.timer);
        root.innerHTML = '';
        root.removeAttribute('role');
        root.removeAttribute('aria-label');
        delete root.__enduranceClock;
      }
    };
    root.__enduranceClock = api;
    return api;
  }

  function autoMount() {
    var nodes = document.querySelectorAll('[data-endurance-clock]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var opts = {};
      if (el.dataset.hour12 === 'true') opts.hour12 = true;
      if (el.dataset.hour12 === 'false') opts.hour12 = false;
      if (el.dataset.locale) opts.locale = el.dataset.locale;
      mount(el, opts);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }

  global.EnduranceClock = { mount: mount, autoMount: autoMount };
})(window);
