/* 完全模拟 fx_debug4 但加 0.5h / 1h / 2h / 4h / 6h 多点采样 */
const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const br = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', args: ['--mute-audio','--use-angle=d3d11'] });
  const page = await (await br.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await page.goto('http://127.0.0.1:8080/index.html'); await sleep(3000);
  await page.keyboard.press('Enter'); await sleep(1500); await page.keyboard.press('Escape'); await sleep(900);
  await page.keyboard.press('Enter'); await sleep(1500); await page.keyboard.press('Escape'); await sleep(600);
  await page.evaluate(() => {
    const sim = HX.Sim.create(); sim.playedCine = {}; sim.running = true; sim.speed = 0;
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
  // route
  await page.evaluate(() => {
    const sim = HX.Game.sim; sim.speed = 1; let n = 0; const t0 = sim.t;
    while (Math.abs(sim.t - t0) < 120 && n++ < 50000) HX.Sim.update(sim, 0.02); sim.speed = 0;
    return { afterRoute: sim.t, fxLen: sim.fx.length, hy9Engaged: sim.pla.find(u=>u.short==='9纵').engaged, running: sim.running };
  }).then(r => console.log('afterRoute', r));
  // reset
  await page.evaluate(() => {
    const sim = HX.Game.sim; const hy9 = sim.pla.find((u) => u.short === '9纵'); const k7 = sim.kmt.find((u) => u.short === '7兵团');
    hy9.x = k7.x - 4; hy9.z = k7.z; hy9.order = null; hy9.dest = null; hy9.path = null; hy9.strength = 28000;
    // 连 engaged 状态一起清！
    hy9.engaged = false; hy9.lastContact = -999; hy9.lastHit = null;
    k7.engaged = false; k7.lastContact = -999; k7.lastHit = null; k7.cover = 0; k7.surrounded = false; k7.sectors = [0,0,0,0,0,0,0,0];
    sim.t = 0; sim.fx = []; sim.fxSeq = 0;
    // 清 fx 节流 flags
    for (const k of Object.keys(sim.flags)) if (k.startsWith('fx')) sim.flags[k] = undefined;
  });
  const results = [];
  for (const hh of [0.5, 1, 2, 4, 6]) {
    await page.evaluate((h) => window.__adv(h), hh);
    const r = await page.evaluate(() => {
      const sim = HX.Game.sim; const hy9 = sim.pla.find((u) => u.short === '9纵'); const k7 = sim.kmt.find((u) => u.short === '7兵团');
      const fxGroup = {}; for (const f of sim.fx) fxGroup[f.kind] = (fxGroup[f.kind] || 0) + 1;
      return { t: sim.t, fxGroup, fxLen: sim.fx.length, fxSeq: sim.fxSeq,
        d: Math.hypot(hy9.x - k7.x, hy9.z - k7.z), hy9Engaged: hy9.engaged, k7Engaged: k7.engaged,
        k7cover: k7.cover, k7sectors: k7.sectors,
        flags: Object.keys(sim.flags).filter(k => k.startsWith('fx') || k.startsWith('ctk7')).map(k => ({ k, v: sim.flags[k] })) };
    });
    results.push(r);
  }
  await br.close();
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => { console.error(e.stack); process.exit(1); });
