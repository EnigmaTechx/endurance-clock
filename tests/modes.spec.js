const { test, expect, openClock, expectClean } = require('./fixtures');

const state = (page) => page.evaluate(() => {
  const E = window.__endurance; const q = (s) => document.querySelector(s);
  return {
    miller: E.isMiller(), murph: E.isMurph(), url: location.search,
    time: q('.clock3d__time').textContent.replace(/\s+/g, ' ').trim(),
    millerLine: q('.clock3d__meta--miller').hidden ? '' : q('.clock3d__meta--miller').textContent,
    murphLine: q('.clock3d__meta--murph').hidden ? '' : q('.clock3d__meta--murph').textContent,
    minuteVisible: E.ship.minute.visible, rangerVisible: E.ranger.group.visible,
    tickSource: window.Tick.getSource().next ? 'pattern' : window.Tick.getSource().style
  };
});

test.describe('modes', () => {
  test("Miller's planet dilates the clock and comes back", async ({ page }) => {
    await openClock(page, '', { model: false, fixedTime: null });
    await page.click('#miller-toggle');
    await page.waitForTimeout(3500);
    const on = await state(page);
    expect(on.miller).toBe(true);
    expect(on.url).toContain('mode=miller');
    expect(on.time).toMatch(/\dy\d\dd\d\dh/);
    expect(on.millerLine).toMatch(/61,362/);
    expect(on.minuteVisible).toBe(false);
    expect(on.rangerVisible).toBe(false);
    expect(on.tickSource).toBe('miller');
    await page.click('#miller-toggle');
    await page.waitForTimeout(800);
    const off = await state(page);
    expect(off.miller).toBe(false);
    expect(off.url).not.toContain('mode=miller');
    expect(off.minuteVisible).toBe(true);
    expect(off.rangerVisible).toBe(true);
    expect(off.tickSource).toBe('clock');
  });

  test("Murph's watch ticks STAY in Morse", async ({ page }) => {
    await openClock(page, 'murph=1', { model: false, fixedTime: null });
    const s = await state(page);
    expect(s.murph).toBe(true);
    expect(s.murphLine).toMatch(/STAY/);
    expect(s.tickSource).toBe('pattern');
    const seq = await page.evaluate(() => {
      const M = window.Murph; const t0 = Math.floor(Date.now() / 42000) * 42000; let out = '';
      for (let u = 0; u < 42; u++) { const st = M.stateAt(t0 + u * 1000 + 10); out += st.on ? (st.dash ? '-' : '.') : ' '; }
      return out;
    });
    expect(seq).toBe('. . .   ---   . ---   --- . --- ---       ');
    await page.click('#murph-toggle');
    expect((await state(page)).murph).toBe(false);
  });

  test('the tick is scheduled on second boundaries', async ({ page }) => {
    await page.addInitScript(() => {
      window.__ticks = [];
      const orig = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when) { window.__ticks.push({ at: when, now: this.context.currentTime, wall: Date.now() }); return orig.apply(this, arguments); };
    });
    await openClock(page, '', { model: false, fixedTime: null });
    await page.click('#tick-toggle');
    await page.waitForTimeout(3200);
    const r = await page.evaluate(() => {
      const t = window.__ticks;
      const offsets = t.map((x) => Math.round((((x.wall + (x.at - x.now) * 1000) % 1000) + 1000) % 1000));
      return { count: t.length, offsets, pressed: document.getElementById('tick-toggle').getAttribute('aria-pressed') };
    });
    expect(r.pressed).toBe('true');
    expect(r.count).toBeGreaterThanOrEqual(2);
    for (const o of r.offsets) expect(Math.min(o, 1000 - o)).toBeLessThanOrEqual(2);
    await page.click('#tick-toggle');
    const n = await page.evaluate(() => window.__ticks.length);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.__ticks.length)).toBe(n);
  });

  test('a countdown rings and a tap dismisses it', async ({ page }) => {
    await openClock(page, '', { model: false, fixedTime: null });
    await page.clock.install({ time: new Date(2026, 10, 18, 10, 0, 0) });
    await page.clock.runFor(200);
    await page.click('#alarm-toggle');
    await page.click('#alarm-panel [data-min="1"]');
    await page.clock.runFor(300);
    const armed = await page.evaluate(() => ({ line: document.querySelector('.clock3d__meta--alarm').textContent, title: document.title, end: window.__endurance.alarm.state.countdownEnd }));
    expect(armed.line).toMatch(/Countdown (1:00|0:5\d)/);   // the faked clock has not moved yet
    expect(armed.title).toMatch(/^(1:00|0:5\d)/);
    expect(armed.end).toBeTruthy();
    await page.clock.fastForward(62000);
    await page.clock.runFor(300);
    const ringing = await page.evaluate(() => ({ ringing: window.__endurance.alarm.state.ringing && window.__endurance.alarm.state.ringing.kind, line: document.querySelector('.clock3d__meta--alarm').textContent }));
    expect(ringing.ringing).toBe('countdown');
    expect(ringing.line).toMatch(/Time.s up/);
    await page.mouse.click(200, 600);
    await page.clock.runFor(300);
    expect(await page.evaluate(() => window.__endurance.alarm.state.ringing)).toBeNull();
    expect(await page.evaluate(() => document.title)).toBe('Endurance Clock');
  });

  test('an alarm survives a reload and rings at its time', async ({ page }) => {
    await openClock(page, '', { model: false, fixedTime: null });
    await page.clock.install({ time: new Date(2026, 10, 18, 10, 0, 0) });
    await page.clock.runFor(200);
    await page.click('#alarm-toggle');
    await page.fill('#alarm-time', '10:02');
    await page.click('#alarm-set');
    await page.clock.runFor(200);
    expect(await page.evaluate(() => localStorage.getItem('endurance.alarm'))).toBe('10:02');
    await page.clock.fastForward(60000);
    await page.reload();
    await page.waitForFunction(() => window.__endurance && window.__endurance.ship);
    await page.clock.runFor(300);
    expect(await page.evaluate(() => window.__endurance.alarm.state.alarmHM)).toBe('10:02');
    await page.clock.fastForward(70000);
    await page.clock.runFor(300);
    expect(await page.evaluate(() => window.__endurance.alarm.state.ringing && window.__endurance.alarm.state.ringing.kind)).toBe('alarm');
    await page.keyboard.press('Escape');
    await page.clock.runFor(200);
    expect(await page.evaluate(() => localStorage.getItem('endurance.alarm'))).toBeNull();
  });
});
