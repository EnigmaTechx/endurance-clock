# Endurance Clock

A web clock themed on the *Endurance* from *Interstellar* (2014). The ship's ring of
twelve modules sits 30° apart, so each module marks an hour. Hour and minute hands
sweep from the central hub in real local time, a small craft orbits the ring once a
minute as the second indicator, and the current hour's module lights up.

Plain HTML, CSS and JavaScript. No dependencies, no build step.

## Run it

Open `index.html` in a browser, or serve the folder with any static server:

```bash
python3 -m http.server 8000
```

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
