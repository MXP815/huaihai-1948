/* 和 fast_sweep2 完全一样的流程，但加中间 debug */
const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const br = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', args: ['--mute-audio','--use-angle=d3d11'] });
  const page = await (await br.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await page.goto('http://127.0.0.1:8080/index.html'); await sleep(3000);
  await page.keyboard.press('Enter'); await sleep(1500); await page.keyboard.press('Escape'); await sleep(900);
  await page.keyboard.press('Enter'); await sleep(1500); await page.keyboard.press('Escape'); await sleep(600);
  const logs = [];
  const trace = (label, fn) => page.evaluate(({ label, src }) => {
    // src 是要执行的表达式
    const sim = HX.Game.sim;
    const hy9 = sim.pla.find((u) => u.short === '9纵');
    const k7 = sim.kmt.find((u) => u.short === '7兵团');
    const hyte = sim.pla.find((u) => u.short === '特纵');
    return { label, t: sim.t, fxLen: sim.fx.length, fxSeq: sim.fxSeq, hy9x: hy9.x, hy9z: hy9.z, k7x: k7.x, k7z: k7.z,
      d: Math.hypot(hy9.x - k7.x, hy9.z - k7.z), hy9Engaged: hy9.engaged, k7Engaged: k7.engaged };
  }, { label, src: fn });

  await page.evaluate(() => {
    const g = HX.Game;
    g.sim = HX.Sim.create(); g.sel = [];
    const sim = g.sim; sim.playedCine = {}; sim.running = true; sim.speed = 0;
    const hyte = sim.pla.find((u) => u.short === '特纵');
    HX.Sim.command(sim, [hyte.id], 'move', { x: 58.8, z: -1.4, player: true });
    const hy9 = sim.pla.find((u) => u.short === '9纵');
    const k7 = sim.kmt.find((u) => u.short === '7兵团');
    hy9.x = k7.x - 12; hy9.z = k7.z; hy9.order = null; hy9.dest = null; hy9.path = null; hy9.strength = 28000;
    window.__adv = function (h) {
      sim.speed = 1; let n = 0; const t0 = sim.t;
      while (Math.abs(sim.t - t0) < h && n++ < 5000) HX.Sim.update(sim, 0.02);
      sim.speed = 0;
      return n;
    };
  });

  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.__adv(15));
  }
  logs.push(await page.evaluate(() => {
    const sim = HX.Game.sim; const hy9 = sim.pla.find((u) => u.short === '9纵'); const k7 = sim.kmt.find((u) => u.short === '7兵团');
    return { afterRoute: true, t: sim.t, fxLen: sim.fx.length, fxSeq: sim.fxSeq, hy9Engaged: hy9.engaged, k7Engaged: k7.engaged, d: Math.hypot(hy9.x - k7.x, hy9.z - k7.z) };
  }));

  // NOW reset FX and hy9 position
  await page.evaluate(() => {
    const sim = HX.Game.sim; const hy9 = sim.pla.find((u) => u.short === '9纵'); const k7 = sim.kmt.find((u) => u.short === '7兵团');
    hy9.x = k7.x - 4; hy9.z = k7.z; hy9.order = null; hy9.dest = null; hy9.path = null; hy9.strength = 28000;
    sim.t = 0; sim.fx = []; sim.fxSeq = 0;
  });
  logs.push(await page.evaluate(() => {
    const sim = HX.Game.sim; const hy9 = sim.pla.find((u) => u.short === '9纵'); const k7 = sim.kmt.find((u) => u.short === '7兵团');
    return { afterReset: true, t: sim.t, fxLen: sim.fx.length, fxSeq: sim.fxSeq, d: Math.hypot(hy9.x - k7.x, hy9.z - k7.z),
      hy9Engaged: hy9.engaged, k7Engaged: k7.engaged };
  }));

  await page.evaluate(() => window.__adv(6));
  logs.push(await page.evaluate(() => {
    const sim = HX.Game.sim; const hy9 = sim.pla.find((u) => u.short === '9纵'); const k7 = sim.kmt.find((u) => u.short === '7兵团');
    const fxGroup = {}; for (const f of sim.fx) fxGroup[f.kind] = (fxGroup[f.kind] || 0) + 1;
    return { afterFxAdv1: true, t: sim.t, fxGroup, fxSeq: sim.fxSeq, d: Math.hypot(hy9.x - k7.x, hy9.z - k7.z),
      hy9Engaged: hy9.engaged, k7Engaged: k7.engaged, k7cover: k7.cover };
  }));

  await br.close();
  console.log(JSON.stringify(logs, null, 2));
})().catch((e) => { console.error(e.stack); process.exit(1); });
