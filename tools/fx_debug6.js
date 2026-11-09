/* 完全按 fast_sweep2 但加中间 debug，pace=1 */
const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const br = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', args: ['--mute-audio','--use-angle=d3d11'] });
  const page = await (await br.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await page.goto('http://127.0.0.1:8080/index.html'); await sleep(3000);
  await page.keyboard.press('Enter'); await sleep(1500); await page.keyboard.press('Escape'); await sleep(900);
  await page.keyboard.press('Enter'); await sleep(1500); await page.keyboard.press('Escape'); await sleep(600);
  await page.evaluate(() => {
    const sim = HX.Sim.create(); sim.playedCine = {}; sim.pace = 1; sim.running = true; sim.speed = 0;
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
  for (let i = 0; i < 8; i++) await page.evaluate(() => window.__adv(15));
  const afterRoute = await page.evaluate(() => {
    const sim = HX.Game.sim;
    return { t: sim.t, running: sim.running, speed: sim.speed, pace: sim.pace,
      fxLen: sim.fx.length, fxSeq: sim.fxSeq };
  });
  console.log('afterRoute', JSON.stringify(afterRoute));

  // reset FX
  await page.evaluate(() => {
    const sim = HX.Game.sim; const hy9 = sim.pla.find((u) => u.short === '9纵'); const k7 = sim.kmt.find((u) => u.short === '7兵团');
    hy9.x = k7.x - 4; hy9.z = k7.z; hy9.order = null; hy9.dest = null; hy9.path = null; hy9.strength = 28000;
    // 不清 sim.t、不清 sim.fx、只清 hy9 的 engaged 状态
    hy9.engaged = false; hy9.lastContact = -999; hy9.lastHit = null;
    k7.engaged = false; k7.lastContact = -999; k7.lastHit = null; k7.cover = 0; k7.sectors = [0,0,0,0,0,0,0,0];
  });

  const afterReset = await page.evaluate(() => {
    const sim = HX.Game.sim;
    return { t: sim.t, running: sim.running, speed: sim.speed,
      fxLen: sim.fx.length, fxSeq: sim.fxSeq };
  });
  console.log('afterReset', JSON.stringify(afterReset));

  // fx 推进
  for (let i = 0; i < 4; i++) await page.evaluate(() => window.__adv(6));

  const afterFx = await page.evaluate(() => {
    const sim = HX.Game.sim;
    const fxGroup = {}; for (const f of sim.fx) fxGroup[f.kind] = (fxGroup[f.kind] || 0) + 1;
    const hy9 = sim.pla.find((u) => u.short === '9纵'); const k7 = sim.kmt.find((u) => u.short === '7兵团');
    return { t: sim.t, running: sim.running, speed: sim.speed,
      fxGroup, fxSeq: sim.fxSeq, fxLen: sim.fx.length,
      hy9Engaged: hy9.engaged, k7Engaged: k7.engaged, k7cover: k7.cover,
      pStr: Math.round(hy9.strength), kStr: Math.round(k7.strength) };
  });
  console.log('afterFx', JSON.stringify(afterFx));
  await br.close();
})().catch((e) => { console.error(e.stack); process.exit(1); });
