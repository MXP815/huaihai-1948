/* 排查：同样推进 hy9→k7，__adv 为什么 fx 是空的 */
const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const br = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', args: ['--mute-audio','--use-angle=d3d11'] });
  const page = await (await br.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await page.goto('http://127.0.0.1:8080/index.html'); await sleep(3000);
  await page.keyboard.press('Enter'); await sleep(1500); await page.keyboard.press('Escape'); await sleep(900);
  await page.keyboard.press('Enter'); await sleep(1500); await page.keyboard.press('Escape'); await sleep(600);
  const result = await page.evaluate(() => {
    const sim = HX.Sim.create(); sim.playedCine = {}; sim.running = true; sim.speed = 0;
    const hy9 = sim.pla.find((u) => u.short === '9纵');
    const k7 = sim.kmt.find((u) => u.short === '7兵团');
    hy9.x = k7.x - 4; hy9.z = k7.z; hy9.order = null; hy9.dest = null; hy9.path = null; hy9.strength = 28000;
    // 用和 sweep2 里 window.__adv 完全一样的逻辑
    sim.speed = 1; let n = 0; const t0 = sim.t;
    while (Math.abs(sim.t - t0) < 6 && n++ < 5000) HX.Sim.update(sim, 0.02);
    // 停
    sim.speed = 0;
    const fxGroup = {};
    for (const f of sim.fx) fxGroup[f.kind] = (fxGroup[f.kind] || 0) + 1;
    return { t: sim.t, fxGroup, fxSeq: sim.fxSeq, fxLen: sim.fx.length, hy9Engaged: hy9.engaged, k7Engaged: k7.engaged,
      k7cover: k7.cover, k7sectors: k7.sectors, plaLog: sim.pla.find((u) => u.short === '9纵').strength };
  });
  console.log('3h 直接 while', JSON.stringify(result));

  const result2 = await page.evaluate(() => {
    const sim = HX.Sim.create(); sim.playedCine = {}; sim.running = true; sim.speed = 0;
    const hy9 = sim.pla.find((u) => u.short === '9纵');
    const k7 = sim.kmt.find((u) => u.short === '7兵团');
    hy9.x = k7.x - 4; hy9.z = k7.z; hy9.order = null; hy9.dest = null; hy9.path = null; hy9.strength = 28000;
    // 先让特纵推进（模拟 sweep2 的 route 推进过程）
    const hyte = sim.pla.find((u) => u.short === '特纵');
    HX.Sim.command(sim, [hyte.id], 'move', { x: 58.8, z: -1.4, player: true });
    sim.speed = 1; let n = 0; const t0 = sim.t;
    while (Math.abs(sim.t - t0) < 120 && n++ < 50000) HX.Sim.update(sim, 0.02);
    sim.speed = 0;
    // 现在再 reset hy9 + reset fx + 推进战斗
    hy9.x = k7.x - 4; hy9.z = k7.z; hy9.order = null; hy9.dest = null; hy9.path = null; hy9.strength = 28000;
    sim.t = 0; sim.fx = []; sim.fxSeq = 0;
    sim.speed = 1; n = 0; const t1 = sim.t;
    while (Math.abs(sim.t - t1) < 6 && n++ < 5000) HX.Sim.update(sim, 0.02);
    sim.speed = 0;
    const fxGroup = {};
    for (const f of sim.fx) fxGroup[f.kind] = (fxGroup[f.kind] || 0) + 1;
    return { t: sim.t, fxGroup, fxSeq: sim.fxSeq, fxLen: sim.fx.length, hy9Engaged: hy9.engaged, k7Engaged: k7.engaged,
      k7cover: k7.cover, plaLog: sim.pla.find((u) => u.short === '9纵').strength };
  });
  console.log('120h route+reset', JSON.stringify(result2));
  await br.close();
})().catch((e) => { console.error(e.stack); process.exit(1); });
