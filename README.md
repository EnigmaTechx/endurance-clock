# Endurance Clock

A web clock themed on the *Endurance* from *Interstellar* (2014). The ship's ring of
twelve modules sits 30° apart, so each module marks an hour. Hour and minute hands
sweep from the central hub in real local time, a small craft orbits the ring once a
minute as the second indicator, the current hour's module lights up, and a Ranger
docks at the next module as the hour turns.

Rendered with Three.js, loaded as an ES module straight from a CDN via an import
map. Plain HTML, CSS and JavaScript, no build step. The clock is also an
embeddable widget and an npm package (see below).

## Run it

Open `index.html` in a browser, or serve the folder with any static server:

```bash
python3 -m http.server 8000
```

## Deploy

The site is static, so any static host works. It is deployed on Vercel at
[clock.enigmatech.dev](https://clock.enigmatech.dev) (and `endurance-clock.vercel.app`).

### Vercel

1. **Add New Project** and import this repository.
2. Framework preset **Other**. Leave the build command and install command empty.
   Output directory is the repository root (`.`).
3. Deploy. Every push to `main` becomes the production deployment; every pull
   request gets a preview URL.

### Custom subdomain

1. In the Vercel project go to **Settings → Domains** and click **Add Existing**.
   Enter `clock.enigmatech.dev` and connect it to the Production environment.
2. At the domain registrar (GoDaddy, DNS management for `enigmatech.dev`) add
   one record:

   | Type  | Name    | Value                  |
   |-------|---------|------------------------|
   | CNAME | `clock` | `cname.vercel-dns.com` |

   If the domain's nameservers were moved to Vercel, add the record in Vercel's
   DNS dashboard instead.
3. Vercel verifies the record and issues the TLS certificate automatically,
   usually within a few minutes.

`.dev` is an HTTPS-only, HSTS-preloaded top-level domain. Browsers refuse plain
HTTP on it, so the site only loads once the certificate exists. Vercel handles
that; any other host must serve HTTPS too.

## The ship model

The hull is ["Interstellar | Endurance"](https://skfb.ly/p6vzT) by
[devPilot](https://sketchfab.com/devPilot), licensed
[CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) (see
`assets/models/CREDITS.md` for the changes made). It ships as a 390 KB
Draco-compressed glTF at `assets/models/endurance.glb`; the Draco decoder comes
from the same CDN as Three.js. At load the clock rotates and scales the model into
its frame, splits the hull into twelve sectors by angle so the current hour's
module can light up, and measures the module radii and depth so the hands, the
Ranger's docking points and the alarm beacon follow the real geometry.

The procedural ship shows until the model has loaded and stays if it fails to
load. `?ship=procedural` keeps it on purpose; the widget's `model` option takes
`true`, a URL, or `false`, and `decoderPath` points at a Draco decoder.

## How it works

`index.html` renders the Endurance as a real object. The camera rides in the
ship's rotating frame: the ring holds still while the starfield and Gargantua
wheel slowly around the ring's axis, which is what the crew would see from a
window. Move the mouse or drag to tilt the view; it drifts gently when idle.

- `js/ship.js` builds the ship: twelve chamfered modules standing radially around
  the ring, long axes pointing at the hub, joined side to side by corridor tubes;
  four thick spokes from the hub to the inner ends of the command modules; the
  film's layout of roles (command at the cardinals, engine modules with their
  bells on the far side, landing modules with the big hatches and two Landers
  berthed on inner ends); a hub with the axial docking port; the hands and the
  orbiting second indicator. The Ranger docks on a module's inner end. Everything
  is procedural geometry; there is no model file.
- `js/gargantua.js` is a stylised black hole: a shadow sphere, a shader-driven
  accretion disc with Keplerian shear and relativistic beaming, and a lensed halo.
  It is geometry and shaders, not ray-traced lensing, so it runs on phones.
- `js/ranger.js` is the Ranger. It stays docked on the current hour's module;
  24 seconds before the hour it undocks, climbs above the ring plane, flies a
  clockwise arc to the next module and settles onto its hatch as the hour turns.
  The flight is a pure function of the clock, so a sleeping tab or a mid-flight
  page load lands in the right place.
- `js/miller.js` is Miller's planet mode, toggled from the nav or with
  `?mode=miller`. You are on the planet; the Endurance clock overhead runs at the
  film's ratio, one hour here to seven years there (×61,362). The hour hand sweeps
  about 1.4 times a second and the highlight chases round the ring, while the
  readout counts elapsed Endurance time in years, days and hours with the Earth
  date climbing. The minute hand and second craft fade out once the rate is past
  reading, and the Ranger is gone, since it took you down to the surface. The
  dilated clock is an analytic function of real elapsed time with a short ramp,
  so it never drifts when a tab sleeps. Switching off snaps back to real time.
- `js/alarm.js` is the alarm and countdown, from the **Alarm** button in the nav.
  A one-shot alarm at a clock time, or a countdown in minutes (presets or custom);
  both survive a reload. While armed, the alarm's hour module breathes and a beacon
  marks the alarm position on the ring; a countdown puts a marker on the second
  craft's orbit where the craft will be when time is up, counts down in the readout
  and the tab title, and in the final minute a shrinking arc joins the craft to the
  marker while its trail lengthens. When either fires, a wave of light chases round
  the ring, a soft chime repeats (with a vibration on phones; the sound can be
  turned off in the panel) and a tap anywhere, or Escape, dismisses it. A missed
  alarm more than ten minutes old is dropped rather than rung.
- `js/stars.js` is a twinkling point-sprite starfield.
- `js/main.js` sets up the scene, lights, bloom and the render loop.

### Embedding the clock

The 3D clock is a widget. `js/endurance-clock-3d.js` exports `mount(container,
options)`; the widget fills whatever size the container has, creates its own canvas
and readout, pauses when scrolled out of view or when the tab is hidden, and
several can share a page. `embed.html` is a working example: a transparent hero
behind page copy, plus an opaque card further down.

```html
<link rel="stylesheet" href="/css/endurance-clock-3d.css">
<script type="importmap">
{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
               "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/" } }
</script>

<div id="hero" style="height: 80vh" data-endurance-clock-3d data-transparent data-readout="false"></div>
<script type="module" src="/js/endurance-clock-3d.js"></script>
```

Elements with `data-endurance-clock-3d` mount themselves; options come from
`data-*` attributes. Or mount by hand:

```js
import { mount } from '/js/endurance-clock-3d.js';
const clock = mount(document.querySelector('#hero'), { transparent: true, readout: false });
clock.setMiller(true);           // Miller's planet mode
clock.alarm.startCountdown(5, new Date());
clock.pause(); clock.resume();
clock.destroy();
```

Options: `model` (`true` for the bundled Endurance model, a URL, or `false` for the
procedural ship), `decoderPath` (Draco decoder location), `onModel`, `transparent`
(alpha canvas so the page shows through; bloom is off in this mode), `readout`,
`gargantua`, `stars`, `quality` (`auto` | `low` | `high`),
`interactive`, `sway`, `pitch` (camera look-down angle, degrees), `fit` (framing
margin; smaller is tighter), `pauseWhenHidden`, `hour12`, `locale`, `daylight`
(use `js/daylight.js` if the page loaded it), `overlays` (`{ top, bottom }`
elements to keep the ring clear of), `alarmControls` (panel elements; the alarm
API works without them), `fallback` (element to reveal without WebGL),
`onMillerChange`, `onReady`. Colours and type are custom properties on the
container (`--accent`, `--text`, `--text-dim`, `--font`).

The page is a thin consumer of the same widget: `js/main.js`
mounts it full-screen and wires the nav, alarm panel and tick to it.

#### In a bundled app (React, Vite, webpack)

The repo is also an npm package, so an app that already bundles Three.js can
import the widget and skip the import map:

```bash
npm install github:EnigmaTechx/endurance-clock
```

```js
import { mount } from 'endurance-clock';
import 'endurance-clock/css';

const clock = mount(el, { transparent: true, readout: false });
// later: clock.destroy()
```

Three.js is a peer dependency (0.160 or newer). The optional page scripts are
importable for their side effects: `endurance-clock/daylight`, `endurance-clock/tick`,
`endurance-clock/murph`.

Query parameters: `?mode=miller` starts in Miller's planet mode. `?quality=low` turns bloom off and `?quality=high` forces it on
(it turns off automatically on small low-core devices), `?hour12=true|false` and `?locale=en-GB` override the
readout. `?demo=dock` shifts the clock so the hour turns a few seconds after
load, to watch the Ranger dock without waiting. Without WebGL the page shows a short note instead.

Three.js is pinned to `0.170.0` in the import map in `index.html`.

### Time-of-day lighting

`js/daylight.js` turns the viewer's local time into a sun elevation and blends
three looks from it: **night** is cool, blue and dim with brighter
stars; **twilight** is a strong golden key light with Gargantua at its most
orange; **day** is bright and neutral with Gargantua whiter. Sunrise and sunset
come from a built-in schedule (06:45 / 18:15) unless `?lat=&lon=` are given, in
which case the NOAA sunrise equation is used; if the browser has already granted
the page location access it is used too, but the page never asks for it.
`?sun=-1..1` forces a phase (−1 midnight, 0 sunrise/sunset, 1 noon) for a look.
In Miller's planet mode the lighting stays on the viewer's real time.

### Murph's watch

In the tesseract, Cooper ticks the second hand of Murph's watch in Morse. The
**Murph** button (or `?murph=1`) makes the second indicator tick
like a quartz hand instead of sweeping, and flare in Morse, spelling STAY on a
42-second loop: a dot is a one-second flare, a dash three, with the standard gaps.
A line under the readout shows the word with the letter being sent lit. The
timeline is anchored to the epoch, so every open page sends the same letter at the
same moment. With the tick sound on, the ticks follow the Morse instead of the
seconds. `js/murph.js` holds the timeline.

### Tick sound

`js/tick.js` adds a quiet tick on every second, from the **Tick** button. It is synthesised in WebAudio (a filtered noise burst with a tiny click, a
lower tock on alternate seconds) and scheduled against the wall clock, so it lands
on the same second boundaries the hands and the orbiting craft follow. Off by
default and remembered; because browsers only start audio after a gesture, a
remembered-on tick begins at your first tap or key press. In Miller's planet mode
it becomes a deeper, slower tick once per Earth day of dilated time, every 1.4 s at
the film's ratio, a nod to the score.

## Nav and the mobile menu

`css/nav.css` and `js/nav.js` hold the top nav. The mode buttons (Miller, Alarm,
Murph and Tick) sit inline on wide screens and collapse into a **Menu** dropdown
below 640 px, with a dot on the button when any mode is on.

## Accessibility

The clock has `role="img"` with an `aria-label` that updates every minute. Under
`prefers-reduced-motion`, the hands step once a second instead of sweeping, the
sky holds still and the idle sway is off.

## History

The clock started as a 2D SVG component with the 3D version alongside it at `/3d/`.
The 3D version is now the whole site and old `/3d/` links redirect. The SVG version
is in the git history before the `feat/3d-only` merge if it is ever wanted again.
