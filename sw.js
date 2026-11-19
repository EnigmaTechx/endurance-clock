/*
 * Service worker: network first, cache fallback.
 *
 * Every request goes to the network and the fresh response is cached, so a
 * deploy is picked up on the next load. Only when the network fails (offline,
 * or an installed app launched without a connection) is the cache used. The
 * core files are cached on install so the clock works offline after the
 * first visit, and Three.js from the CDN is cached once it has loaded once.
 */
const VERSION = 'endurance-v2';
const CORE = [
  '/', '/index.html', '/css/nav.css', '/css/endurance-clock-3d.css', '/css/clock3d.css',
  '/js/main.js', '/js/endurance-clock-3d.js', '/js/ship.js', '/js/gargantua.js', '/js/stars.js',
  '/js/readout.js', '/js/ranger.js', '/js/miller.js', '/js/alarm.js',
  '/js/daylight.js', '/js/tick.js', '/js/murph.js', '/js/nav.js',
  '/manifest.webmanifest', '/assets/icon-192.png', '/assets/icon-512.png',
  '/assets/favicon-32.png', '/assets/favicon-64.png', '/assets/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheable = url.origin === self.location.origin || url.hostname === 'cdn.jsdelivr.net';
  if (!cacheable) return;

  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: url.origin === self.location.origin && url.pathname.endsWith('/') })
      .then((hit) => hit || (req.mode === 'navigate' ? caches.match('/') : undefined)))
  );
});
