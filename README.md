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
- `3d/js/stars.js` is a twinkling point-sprite starfield.
- `3d/js/main.js` sets up the scene, lights, bloom and the render loop.

Query parameters: `?quality=low` turns bloom off and `?quality=high` forces it on
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

The starfield (`js/starfield.js`) and the page layout (`css/page.css`) belong to the
demo page only. The Gargantua glow is part of the component.

## Accessibility

The clock has `role="img"` with an `aria-label` that updates every minute. Under
`prefers-reduced-motion`, the hands step once a second instead of sweeping and the
starfield is static.
