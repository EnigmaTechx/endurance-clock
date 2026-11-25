const { test, expect, openClock, expectClean } = require('./fixtures');

test.describe('render', () => {
  test('loads the scene, the model and the readout', async ({ page }) => {
    await openClock(page);
    const info = await page.evaluate(() => {
      const E = window.__endurance;
      return {
        canvas: [E.canvas.width, E.canvas.height],
        model: E.hasModel(),
        roles: E.ship.modules.map((m) => m.role[0]).join(''),
        time: document.querySelector('.clock3d__time').textContent.replace(/\s+/g, ''),
        label: document.getElementById('clock').getAttribute('aria-label'),
        credit: !!document.querySelector('.site-nav__credit')
      };
    });
    expect(info.canvas).toEqual([1280, 800]);
    expect(info.model).toBe(true);
    expect(info.roles).toBe('clecelclecel');
    expect(info.time).toMatch(/10:09/);
    expect(info.label).toMatch(/Endurance clock/);
    expect(info.credit).toBe(true);
    expectClean(page);
  });

  test('carries link-preview tags and the manifest', async ({ page }) => {
    await openClock(page, '', { model: false });
    const meta = await page.evaluate(async () => {
      const q = (s) => document.querySelector(s);
      const mf = await fetch(q('link[rel=manifest]').href).then((r) => r.json());
      const og = await fetch(new URL(q('meta[property="og:image"]').content).pathname).then((r) => r.status);
      return { ogStatus: og, manifestName: mf.name, icons: mf.icons.length, card: q('meta[name="twitter:card"]').content };
    });
    expect(meta.ogStatus).toBe(200);
    expect(meta.manifestName).toBe('Endurance Clock');
    expect(meta.icons).toBeGreaterThanOrEqual(3);
    expect(meta.card).toBe('summary_large_image');
  });

  for (const [name, w, h] of [['wide', 1920, 969], ['phone', 390, 844], ['short', 900, 500]]) {
    test(`keeps the ring between the nav and the readout at ${name}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await openClock(page, '', { model: false });
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => {
        const E = window.__endurance; const cam = E.camera; const W = innerWidth, H = innerHeight;
        const V = E.scene.position.constructor;
        const proj = (x, y, z) => { const p = new V(x, y, z).applyMatrix4(E.rig.matrixWorld).project(cam); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H]; };
        const R = E.ship.dims.outerR + 1.3;   // the second craft's orbit
        return {
          top: proj(0, R, 0)[1], bottom: proj(0, -R, 0)[1], left: proj(-R, 0, 0)[0], right: proj(R, 0, 0)[0],
          navBottom: document.querySelector('.site-nav').getBoundingClientRect().bottom,
          readoutTop: document.querySelector('.clock3d__readout').getBoundingClientRect().top, W
        };
      });
      expect(r.top).toBeGreaterThanOrEqual(r.navBottom);
      expect(r.bottom).toBeLessThanOrEqual(r.readoutTop);
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThanOrEqual(r.W);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(w);
    });
  }
});
