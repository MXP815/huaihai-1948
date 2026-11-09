/* 稳定性/性能抽测：4× 连续推进 3 分钟，采样帧率与 JS 堆（静默） */
const { chromium } = require('playwright-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://127.0.0.1:8012/index.html?mute=1';
const OUT = 'D:\\新\\淮海战役\\shots\\19-soak.png';
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EDGE, args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  const fps = () => p.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); }
    requestAnimationFrame(f);
  }));
  const heap = () => p.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1));

  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(2400);
  await p.keyboard.press('Enter'); await p.waitForTimeout(1400);
  await p.keyboard.press('Escape'); await p.waitForTimeout(1000);
  await p.keyboard.press('Enter'); await p.waitForTimeout(1000);
  // 下达一次包围命令并加速
  for (const id of ['hy1', 'hy3', 'hy4', 'hy6', 'hy8', 'hy9', 'hyte', 'hy13']) {
    await p.locator(`#oob .unit-row[data-id="${id}"]`).click({ modifiers: ['Shift'] });
  }
  await p.locator('#unitCard [data-order="encircle"]').click();
  await p.waitForTimeout(200);
  await p.locator('#unitCard [data-target="k7"]').click();
  await p.locator('[data-sp="3"]').click();

  const samples = [];
  const t0 = Date.now();
  for (let i = 0; i < 6; i++) {
    if (await p.evaluate(() => !!(HX.Cine && HX.Cine.state.active))) {
      await p.keyboard.press('Escape'); await p.waitForTimeout(900);
    }
    await p.waitForTimeout(22000);
    const s = { sec: Math.round((Date.now() - t0) / 1000), fps: await fps(), heapMB: await heap(),
      date: (await p.locator('#tbDate').textContent()).trim(),
      phase: await p.evaluate(() => HX.Game.sim.phase) };
    samples.push(s); console.log('SAMPLE', JSON.stringify(s));
    if (await p.evaluate(() => HX.Game.sim.ended)) break;
  }
  await p.screenshot({ path: OUT });
  console.log('ERRS', errs.length ? JSON.stringify(errs.slice(0, 5)) : 'none');
  await b.close();
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
