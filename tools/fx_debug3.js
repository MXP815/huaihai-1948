/* 为什么 reset fx 后再推进，fire/hit 还是没发？ */
const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const br = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', args: ['--mute-audio','--use-angle=d3d11'] });
  const page = await (await br.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await page.goto('http://127.0.0.1:8080/index.html'); await sleep(3000);
  await page.keyboard.press('Enter'); await sleep(1500); await page.keyboard.press('Escape'); await sleep(900);
  await page.keyboard.press('Enter'); await sleep(1500); await page.keyboard.press('Escape'); await sleep(600);
  // 先把 combat() 里关键条件打出来
  const result = await page.evaluate(() => {
    const sim = HX.Sim.create(); sim.playedCine = {}; sim.running = true; sim.speed = 0;
    const hy9 = sim.pla.find((u) => u.short === '9纵');
    const k7 = sim.kmt.find((u) => u.short === '7兵团');
    const hyte = sim.pla.find((u) => u.short === '特纵');
    HX.Sim.command(sim, [hyte.id], 'move', { x: 58.8, z: -1.4, player: true });
    // 跑 route
    sim.speed = 1; let n = 0; const t0 = sim.t;
    while (Math.abs(sim.t - t0) < 120 && n++ < 50000) HX.Sim.update(sim, 0.02);
    sim.speed = 0;
    const before = { t: sim.t, fxInit: sim.fx.length, fxKeys: Object.keys(sim.flags).filter(k => k.startsWith('fx')) };
    // reset
    hy9.x = k7.x - 4; hy9.z = k7.z; hy9.order = null; hy9.dest = null; hy9.path = null; hy9.strength = 28000;
    sim.t = 0; sim.fx = []; sim.fxSeq = 0;
    // 推进 1h，看 combat 里 distance 条件能不能触发
    sim.speed = 1; n = 0; const t1 = sim.t;
    while (Math.abs(sim.t - t1) < 0.5 && n++ < 1000) HX.Sim.update(sim, 0.02);
    sim.speed = 0;
    const fxGroup = {}; for (const f of sim.fx) fxGroup[f.kind] = (fxGroup[f.kind] || 0) + 1;
    // 查 hy9 的 engagement 状态
    const d = Math.hypot(hy9.x - k7.x, hy9.z - k7.z);
    const allFlags = Object.keys(sim.flags).filter(k => /fx|ctk7/.test(k)).map(k => ({ k, v: sim.flags[k] }));
    return { before, after: { t: sim.t, fxGroup, fxSeq: sim.fxSeq, fxArrLen: sim.fx.length, d,
      hy9Engaged: hy9.engaged, k7Engaged: k7.engaged, k7Gap: k7.gap, flags: allFlags,
      ctk7: sim.flags['ctk7'] } };
  });
  console.log(JSON.stringify(result, null, 2));
  await br.close();
})().catch((e) => { console.error(e.stack); process.exit(1); });
