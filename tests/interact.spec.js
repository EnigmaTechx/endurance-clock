const { test, expect, openClock, expectClean, moduleScreen } = require('./fixtures');

test.describe('interaction', () => {
  test('lore cards open on tap, step with the arrows and close', async ({ page }) => {
    await openClock(page);
    let [x, y] = await moduleScreen(page, 3);
    await page.mouse.move(x, y);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__endurance.lore.hoverIndex())).toBe(3);
    await page.mouse.click(x, y);
    await page.waitForTimeout(500);
    const card = () => page.evaluate(() => { const c = document.querySelector('.ec3d__lore'); return { hidden: c.hidden, name: c.querySelector('.ec3d__lore-name').textContent, hour: c.querySelector('.ec3d__lore-hour').textContent, cur: window.__endurance.lore.current() }; });
    let c = await card();
    expect(c.hidden).toBe(false);
    expect(c.name).toBe('Medical & labs');
    expect(c.hour).toMatch(/3 o/);
    await page.keyboard.press('ArrowRight');
    c = await card();
    expect(c.cur.index).toBe(4);
    await page.keyboard.press('Escape');
    expect((await card()).hidden).toBe(true);
    [x, y] = await moduleScreen(page, 10);
    await page.mouse.click(x, y);
    await page.waitForTimeout(400);
    expect((await card()).hour).toMatch(/current hour/);
    // a drag opens nothing
    await page.keyboard.press('Escape');
    [x, y] = await moduleScreen(page, 6);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 40, y + 30, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(300);
    expect((await card()).hidden).toBe(true);
    expectClean(page);
  });

  test('keyboard shortcuts drive the modes and the help overlay', async ({ page }) => {
    await openClock(page, '', { model: false, fixedTime: null });
    await page.mouse.click(1200, 700);
    const pressed = (id) => page.evaluate((i) => document.getElementById(i).getAttribute('aria-pressed'), id);
    await page.keyboard.press('m'); await page.keyboard.press('w'); await page.keyboard.press('t');
    await page.waitForTimeout(300);
    expect([await pressed('miller-toggle'), await pressed('murph-toggle'), await pressed('tick-toggle')]).toEqual(['true', 'true', 'true']);
    await page.keyboard.press('m'); await page.keyboard.press('w'); await page.keyboard.press('t');
    await page.waitForTimeout(300);
    expect([await pressed('miller-toggle'), await pressed('murph-toggle'), await pressed('tick-toggle')]).toEqual(['false', 'false', 'false']);
    await page.keyboard.press('?');
    expect(await page.evaluate(() => !document.getElementById('help').hidden)).toBe(true);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => !document.getElementById('help').hidden)).toBe(false);
    await page.keyboard.press('a');
    expect(await page.evaluate(() => !document.getElementById('alarm-panel').hidden)).toBe(true);
    await page.focus('#countdown-minutes');
    await page.keyboard.type('m');
    expect(await pressed('miller-toggle')).toBe('false');
  });

  test('the nav collapses into a menu on phones', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openClock(page, '', { model: false });
    const visible = (sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).display !== 'none', sel);
    expect(await visible('.site-nav__menu')).toBe(true);
    expect(await visible('.site-nav__modes')).toBe(false);
    await page.click('.site-nav__menu');
    expect(await visible('.site-nav__modes')).toBe(true);
    await page.click('#help-toggle');
    await page.waitForTimeout(200);
    expect(await visible('.site-nav__modes')).toBe(false);
    expect(await page.evaluate(() => !document.getElementById('help').hidden)).toBe(true);
  });

  test('the idle tour takes the camera and input brings it home', async ({ page }) => {
    await page.goto('/?tour=1&quality=low&ship=procedural');
    await page.waitForFunction(() => window.__endurance && window.__endurance.ship);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.__endurance.isTouring())).toBe(true);
    expect(await page.evaluate(() => document.body.classList.contains('is-touring'))).toBe(true);
    await page.mouse.move(640, 400); await page.mouse.move(650, 410);
    await page.waitForTimeout(3500);
    const after = await page.evaluate(() => { const E = window.__endurance; const cam = [E.camera.position.x, E.camera.position.y, E.camera.position.z]; E.frameCamera(); const home = [E.camera.position.x, E.camera.position.y, E.camera.position.z]; return { touring: E.isTouring(), cam, home }; });
    expect(after.touring).toBe(false);
    for (let i = 0; i < 3; i++) expect(Math.abs(after.cam[i] - after.home[i])).toBeLessThan(0.05);
    // C starts it again and is not undone by its own key press
    await page.keyboard.press('c');
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__endurance.isTouring())).toBe(true);
  });

  test('the embed page runs two instances and destroys cleanly', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/embed.html');
    await page.waitForFunction(() => window.cardClock && document.querySelector('.hero__clock').__enduranceClock3D, null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => {
      const hero = document.querySelector('.hero__clock').__enduranceClock3D; const card = window.cardClock;
      return { heroTransparent: hero.renderer.getClearAlpha() === 0, heroReadout: !!document.querySelector('.hero__clock .clock3d__readout'), heroRunning: hero.isRunning(), cardReadout: !!card.container.querySelector('.clock3d__readout'), instances: document.querySelectorAll('.ec3d').length };
    });
    expect(info.heroTransparent).toBe(true);
    expect(info.heroReadout).toBe(false);
    expect(info.heroRunning).toBe(true);
    expect(info.cardReadout).toBe(true);
    expect(info.instances).toBe(2);
    await page.evaluate(() => document.getElementById('card').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => document.querySelector('.hero__clock').__enduranceClock3D.isRunning())).toBe(false);
    expect(await page.evaluate(() => window.cardClock.isRunning())).toBe(true);
    const gone = await page.evaluate(() => { window.cardClock.destroy(); const el = document.getElementById('card'); return { canvases: el.querySelectorAll('canvas').length, handle: !!el.__enduranceClock3D, cls: el.className }; });
    expect(gone).toEqual({ canvases: 0, handle: false, cls: 'card' });
    expectClean(page);
  });
});
