# Endurance Clock

A web clock themed on the *Endurance* from *Interstellar* (2014). The ship's ring of
twelve modules sits 30° apart, so each module marks an hour. Hour and minute hands
sweep from the central hub in real local time, a small craft orbits the ring once a
minute as the second indicator, and the current hour's module lights up.

Plain HTML, CSS and JavaScript. No dependencies, no build step.

Two versions live side by side:

- **2D** (`/`): an SVG clock, the lightweight drop-in component.
- **3D** (`/3d/`): the same ship rendered with Three.js, loaded as an ES module
  straight from a CDN via an import map. Still no build step.

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

## The 3D version

`3d/index.html` renders the Endurance as a real object. The camera rides in the
ship's rotating frame: the ring holds still while the starfield and Gargantua
wheel slowly around the ring's axis, which is what the crew would see from a
window. Move the mouse or drag to tilt the view; it drifts gently when idle.

- `3d/js/ship.js` builds the ring, modules, spokes, hub, hands and the orbiting
  second indicator.
- `3d/js/gargantua.js` is a stylised black hole: a shadow sphere, a shader-driven
  accretion disc with Keplerian shear and relativistic beaming, and a lensed halo.
  It is geometry and shaders, not ray-traced lensing, so it runs on phones.
- `3d/js/ranger.js` is the Ranger. It stays docked on the current hour's module;
  24 seconds before the hour it undocks, climbs above the ring plane, flies a
  clockwise arc to the next module and settles onto its hatch as the hour turns.
  The flight is a pure function of the clock, so a sleeping tab or a mid-flight
  page load lands in the right place.
- `3d/js/miller.js` is Miller's planet mode, toggled from the nav or with
  `?mode=miller`. You are on the planet; the Endurance clock overhead runs at the
  film's ratio, one hour here to seven years there (×61,362). The hour hand sweeps
  about 1.4 times a second and the highlight chases round the ring, while the
  readout counts elapsed Endurance time in years, days and hours with the Earth
  date climbing. The minute hand and second craft fade out once the rate is past
  reading, and the Ranger is gone, since it took you down to the surface. The
  dilated clock is an analytic function of real elapsed time with a short ramp,
  so it never drifts when a tab sleeps. Switching off snaps back to real time.
- `3d/js/alarm.js` is the alarm and countdown, from the **Alarm** button in the nav.
  A one-shot alarm at a clock time, or a countdown in minutes (presets or custom);
  both survive a reload. While armed, the alarm's hour module breathes and a beacon
  marks the alarm position on the ring; a countdown puts a marker on the second
  craft's orbit where the craft will be when time is up, counts down in the readout
  and the tab title, and in the final minute a shrinking arc joins the craft to the
  marker while its trail lengthens. When either fires, a wave of light chases round
  the ring, a soft chime repeats (with a vibration on phones; the sound can be
  turned off in the panel) and a tap anywhere, or Escape, dismisses it. A missed
  alarm more than ten minutes old is dropped rather than rung.
- `3d/js/stars.js` is a twinkling point-sprite starfield.
- `3d/js/main.js` sets up the scene, lights, bloom and the render loop.

### Embedding the 3D clock

The 3D clock is a widget. `3d/js/endurance-clock-3d.js` exports `mount(container,
options)`; the widget fills whatever size the container has, creates its own canvas
and readout, pauses when scrolled out of view or when the tab is hidden, and
several can share a page. `3d/embed.html` is a working example: a transparent hero
behind page copy, plus an opaque card further down.

```html
<link rel="stylesheet" href="/3d/css/endurance-clock-3d.css">
<script type="importmap">
{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
               "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/" } }
</script>

<div id="hero" style="height: 80vh" data-endurance-clock-3d data-transparent data-readout="false"></div>
<script type="module" src="/3d/js/endurance-clock-3d.js"></script>
```

Elements with `data-endurance-clock-3d` mount themselves; options come from
`data-*` attributes. Or mount by hand:

```js
import { mount } from '/3d/js/endurance-clock-3d.js';
const clock = mount(document.querySelector('#hero'), { transparent: true, readout: false });
clock.setMiller(true);           // Miller's planet mode
clock.alarm.startCountdown(5, new Date());
clock.pause(); clock.resume();
clock.destroy();
```

Options: `transparent` (alpha canvas so the page shows through; bloom is off in
this mode), `readout`, `gargantua`, `stars`, `quality` (`auto` | `low` | `high`),
`interactive`, `sway`, `pitch` (camera look-down angle, degrees), `fit` (framing
margin; smaller is tighter), `pauseWhenHidden`, `hour12`, `locale`, `daylight`
(use `js/daylight.js` if the page loaded it), `overlays` (`{ top, bottom }`
elements to keep the ring clear of), `alarmControls` (panel elements; the alarm
API works without them), `fallback` (element to reveal without WebGL),
`onMillerChange`, `onReady`. Colours and type are custom properties on the
container (`--accent`, `--text`, `--text-dim`, `--font`).

The full page at `/3d/` is a thin consumer of the same widget: `3d/js/main.js`
mounts it full-screen and wires the nav, alarm panel and tick to it.

#### In a bundled app (React, Vite, webpack)

The repo is also an npm package, so an app that already bundles Three.js can
import the widget and skip the import map:

```bash
npm install github:EnigmaTechx/endurance-clock
```

```js
import { mount } from 'endurance-clock/3d';
import 'endurance-clock/3d/css';

const clock = mount(el, { transparent: true, readout: false });
// later: clock.destroy()
```

Three.js is a peer dependency (0.160 or newer). The optional page scripts are
importable for their side effects: `endurance-clock/daylight`, `endurance-clock/tick`,
`endurance-clock/murph`; the 2D component is `endurance-clock/2d` and `endurance-clock/2d/css`.

Query parameters: `?mode=miller` starts in Miller's planet mode. `?quality=low` turns bloom off and `?quality=high` forces it on
(it turns off automatically on small low-core devices), `?hour12=true|false` and `?locale=en-GB` override the
readout. `?demo=dock` shifts the clock so the hour turns a few seconds after
load, to watch the Ranger dock without waiting. Without WebGL the page shows a link back to the 2D clock.

Three.js is pinned to `0.170.0` in the import map in `3d/index.html`.

## Drop it into another site

Copy `css/endurance-clock.css` and `js/endurance-clock.js`, then:

```html
<link rel="stylesheet" href="endurance-clock.css">
<div class="endurance-clock" data-endurance-clock></div>
<script src="endurance-clock.js"></script>
```

The element sizes to its container, so set a width on it (the demo uses
`min(92vmin, 760px)`). Any element with `data-endurance-clock` mounts automatically.
Optional attributes: `data-hour12="true|false"` and `data-locale="en-GB"`.

Manual control:

```js
const clock = EnduranceClock.mount(document.querySelector('#clock'), { hour12: false });
clock.destroy();
```

Theme it by overriding the `--ec-*` custom properties on `.endurance-clock`.

The starfield (`js/starfield.js`), the tilt parallax (`js/parallax.js`) and the
page layout (`css/page.css`) belong to the demo page only. The Gargantua glow is
part of the component.

### Time-of-day lighting

`js/daylight.js` turns the viewer's local time into a sun elevation and blends
three looks from it, on both pages: **night** is cool, blue and dim with brighter
stars; **twilight** is a strong golden key light with Gargantua at its most
orange; **day** is bright and neutral with Gargantua whiter. Sunrise and sunset
come from a built-in schedule (06:45 / 18:15) unless `?lat=&lon=` are given, in
which case the NOAA sunrise equation is used; if the browser has already granted
the page location access it is used too, but the page never asks for it.
`?sun=-1..1` forces a phase (−1 midnight, 0 sunrise/sunset, 1 noon) for a look.
In Miller's planet mode the lighting stays on the viewer's real time.

The 2D component reads the palette through custom properties (`--ec-disc-rgb`,
`--ec-disc-alpha`, `--ec-hull`, `--ec-hand`) and has fixed defaults without the
script.

### Tick sound

`js/tick.js` adds a quiet tick on every second, from the **Tick** button in either
nav. It is synthesised in WebAudio (a filtered noise burst with a tiny click, a
lower tock on alternate seconds) and scheduled against the wall clock, so it lands
on the same second boundaries the hands and the orbiting craft follow. Off by
default and remembered; because browsers only start audio after a gesture, a
remembered-on tick begins at your first tap or key press. In Miller's planet mode
it becomes a deeper, slower tick once per Earth day of dilated time, every 1.4 s at
the film's ratio, a nod to the score.

### Tilt parallax

On the 2D page the scene responds to the phone's gyroscope, relative to how you
are holding it, or to the mouse on desktop. The starfield shifts furthest and
opposite to the input, the Gargantua glow less so, the ring tilts in perspective,
and the hands and second craft shift slightly towards the input. Dragging a finger across the page steers it too, so it works on phones whose
browser withholds the gyroscope. If no readings arrive on a touch device a
**Tilt** button appears in the nav: on iOS it asks for motion access (which needs
a tap), and elsewhere it explains how to allow motion sensors for the site. Brave
blocks them by default. Off under `prefers-reduced-motion`.

## Link previews, icons and install

`assets/og.png` (1200×630) is the Open Graph and Twitter card image; both pages
carry the tags. `manifest.webmanifest` plus the icons in `assets/` make the site
installable as an app, with shortcuts to the 2D and 3D clocks and Miller's planet.
`sw.js` is a network-first service worker: every load fetches fresh files and
falls back to the cache only when offline, so the 2D clock works without a
connection and deploys are picked up immediately.

All the images are rendered from the real pages at a fixed time by
`tools/capture.js` (needs Playwright with Chromium: `npx playwright install
chromium`, then `node tools/capture.js`). Re-run it after visual changes.

## Nav and the mobile menu

Both pages share `css/nav.css` and `js/nav.js`. The mode buttons (Tilt and Tick
on the 2D page; Miller, Alarm and Tick on the 3D page) sit inline on wide
screens and collapse into a **Menu** dropdown below 640 px, with a dot on the
button when any mode is on.

## Accessibility

The clock has `role="img"` with an `aria-label` that updates every minute. Under
`prefers-reduced-motion`, the hands step once a second instead of sweeping and the
starfield is static.
