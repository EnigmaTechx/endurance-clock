const { test, expect, openClock, expectClean } = require('./fixtures');

test.describe('the clock', () => {
  test('rolls the hour: hands wrap and the highlight moves', async ({ page }) => {
    await openClock(page, 'ship=procedural', { model: false, fixedTime: null });
    await page.clock.install({ time: new Date(2026, 10, 18, 11, 59, 58) });
    await page.clock.runFor(300);
    const before = await page.evaluate(() => ({ active: window.__endurance.ship.activeIndex(), hour: window.__endurance.ship.hour.rotation.z }));
    await page.clock.fastForward(2500);
    await page.clock.runFor(200);
    const after = await page.evaluate(() => ({ active: window.__endurance.ship.activeIndex(), hour: window.__endurance.ship.hour.rotation.z, minute: window.__endurance.ship.minute.rotation.z }));
    expect(before.active).toBe(11);
    expect(after.active).toBe(0);
    expect(Math.abs(after.hour)).toBeLessThan(0.01);      // 12:00:00.x -> hour hand at the top
    expect(Math.abs(after.minute)).toBeLessThan(0.05);
  });

  test('docks the Ranger on the next module as the hour turns', async ({ page }) => {
    test.slow();
    await openClock(page, 'demo=dock', { fixedTime: null });
    const start = Date.now();
    const sample = () => page.evaluate(() => { const p = window.__endurance.ranger.group.position; return { x: p.x, y: p.y, z: p.z, r: Math.hypot(p.x, p.y), docks: window.__endurance.ship.docks.slice(0, 2) }; });
    // the demo offset puts the undock 4 s after load; mid-flight the Ranger is up at cruise height
    await page.waitForTimeout(Math.max(0, start + 16000 - Date.now()));
    const flight = await sample();
    expect(flight.z).toBeGreaterThan(1.5);
    // docked by 30 s after the undock began: on the next module's inner end
    await page.waitForTimeout(Math.max(0, start + 34000 - Date.now()));
    const docked = await sample();
    expect(Math.abs(docked.z - 0)).toBeLessThan(0.05);
    expect(Math.abs(docked.r - docked.docks[1].radius)).toBeLessThan(0.05);
    expectClean(page);
  });
});
