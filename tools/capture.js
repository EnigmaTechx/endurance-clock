#!/usr/bin/env node
/*
 * Regenerates the Open Graph image and the app icons by rendering the real
 * pages headless at a fixed time. Needs Playwright with Chromium:
 *
 *   npx playwright install chromium
 *   node tools/capture.js
 *
 * Set THREE_LOCAL=/path/to/node_modules/three to serve Three.js from disk
 * instead of the CDN (handy on a machine without internet access).
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets');
const FIXED_TIME = new Date(2026, 10, 18, 10, 9, 36);   // hands at 10:09, the classic pose
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const HIDE_CHROME = `
  .site-nav, .clock3d, .ec3d__overlay, .endurance-clock__readout, .site-hint, .panel { display: none !important; }
`;

async function routeThree(page) {
  if (!process.env.THREE_LOCAL) return;
  await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)/, (route, req) => {
    const rel = req.url().match(/three@[^/]+\/(.*)$/)[1].split('?')[0];
    route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(process.env.THREE_LOCAL, rel)) });
  });
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  fs.mkdirSync(OUT, { recursive: true });

  // ---- Open Graph: the 3D ship, 1200x630 ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await routeThree(page);
    await page.clock.setFixedTime(FIXED_TIME);
    await page.goto(`${base}/3d/?quality=high&sun=0`);
    await page.addStyleTag({ content: HIDE_CHROME });
    // let the module highlight settle, then move in for a hero framing
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      const E = window.__endurance;
      E.camera.position.multiplyScalar(0.92);
      E.camera.lookAt(0, 0.2, 0);
    });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, 'og.png') });
    await ctx.close();
    console.log('assets/og.png');
  }

  // ---- Icons: the 2D ring on space, square ----
  async function icon(size, clockPx, file) {
    const ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(FIXED_TIME);
    await page.goto(`${base}/?sun=0`);
    await page.addStyleTag({ content: HIDE_CHROME + `
      .stage { padding: 0; min-height: ${size}px; }
      .stage .endurance-clock { width: ${clockPx}px !important; grid-template-rows: auto; }
      .endurance-clock__gargantua::before { width: 120%; }
    ` });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, file) });
    await ctx.close();
    console.log('assets/' + file);
  }
  await icon(512, 470, 'icon-512.png');
  await icon(512, 360, 'icon-maskable-512.png');   // ring inside the 80% safe zone
  await icon(192, 176, 'icon-192.png');
  await icon(180, 166, 'apple-touch-icon.png');
  await icon(64, 62, 'favicon-64.png');
  await icon(32, 32, 'favicon-32.png');

  await browser.close();
  server.close();
})();
