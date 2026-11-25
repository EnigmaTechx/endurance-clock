// Shared fixtures and helpers for the suite.
const { test: base, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const THREE_LOCAL = process.env.THREE_LOCAL;
const FIXED_TIME = new Date(2026, 10, 18, 10, 9, 36);   // 10:09:36, the classic pose; module 10 is lit

const test = base.extend({
  page: async ({ page }, use) => {
    if (THREE_LOCAL) {
      await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)/, (route, req) => {
        const rel = req.url().match(/three@[^/]+\/(.*)$/)[1].split('?')[0];
        const file = path.join(THREE_LOCAL, rel);
        if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
        route.fulfill({ status: 200, contentType: rel.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', body: fs.readFileSync(file) });
      });
    }
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.consoleErrors = errors;
    await use(page);
  }
});

/** Open the clock with a query string and wait for the scene (and the model, unless asked not to). */
async function openClock(page, query = '', { model = true, fixedTime = FIXED_TIME } = {}) {
  if (fixedTime) await page.clock.setFixedTime(fixedTime);
  const q = query.startsWith('?') ? query : (query ? '?' + query : '');
  // the idle tour and bloom are off unless a test asks for them, to keep runs quick and deterministic
  const sep = q ? '&' : '?';
  await page.goto(`/${q}${sep}tourDelay=9999&quality=low`);
  await page.waitForFunction(() => window.__endurance && window.__endurance.ship, null, { timeout: 60000 });
  if (model) {
    await page.waitForFunction(() => window.__endurance.hasModel(), null, { timeout: 90000 });
  }
  return page;
}

/** Expect no console or page errors (Playwright's own service-worker notice excepted). */
function expectClean(page) {
  const real = page.consoleErrors.filter((e) => !/Service Worker registration blocked/.test(e));
  expect(real, 'console errors').toEqual([]);
}

/** Screen position (px) of a module's centre. */
function moduleScreen(page, index) {
  return page.evaluate((i) => {
    const E = window.__endurance; const m = E.ship.modules[i];
    const v = m.glow.getWorldPosition(new m.glow.position.constructor()); v.project(E.camera);
    return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
  }, index);
}

/** Pause the render loop so screenshots and reads are not racing frames on software GL. */
const pause = (page) => page.evaluate(() => window.__endurance.pause());
const resume = (page) => page.evaluate(() => window.__endurance.resume());

module.exports = { test, expect, openClock, expectClean, moduleScreen, pause, resume, FIXED_TIME };
