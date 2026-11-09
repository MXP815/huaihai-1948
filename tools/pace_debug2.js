/* 逐步 120h route，每 15h 看 pace/running */
const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const br = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', args: ['--mute-audio','--use-angle=d3d11'] });
  const page = await (await br.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await page.goto('http://127.0.0.1:8080/index.html'); await sleep(3000);
  await page.keyboard.press('Enter'); await sleep(1500); await page.keyboard.press('Escape'); await sleep(900);
  await page.keyboard.press('Enter'); await sleep(1500); await page.keyboard.press('Escape'); await sleep(600);
  const r = await page.evaluate(() => {
    const sim = HX.Sim.create(); sim.playedCine = {}; sim.pace = 1; sim.running = true; sim.speed = 0;
    const hyte = sim.pla.find((u) => u.short === '特纵');
    HX.Sim.command(sim, [hyte.id], 'move', { x: 58.8, z: -1.4, player: true });
    const hy9 = sim.pla.find((u) => u.short === '9纵');
    const k7 = sim.kmt.find((u) => u.short === '7兵团');
    hy9.x = k7.x - 12; hy9.z = k7.z; hy9.order = null; hy9.dest = null; hy9.path = null; hy9.strength = 28000;
    const adv = function (h) { sim.speed = 1; let n = 0; const t0 = sim.t; while (Math.abs(sim.t - t0) < h && n++ < 5000) HX.Sim.update(sim, 0.02); sim.speed = 0; return n; };
    const steps = [];
    for (let i = 0; i < 10; i++) {
      adv(12);
      steps.push({ step: i, t: sim.t, pace: sim.pace, running: sim.running, speed: sim.speed, phase: sim.phase, phaseReady: sim.phaseReady, k7alive: k7.alive });
      if (!sim.running) break;
    }
    return steps;
  });
  console.log(JSON.stringify(r, null, 2));
  await br.close();
})().catch((e) => { console.error(e.stack); process.exit(1); });
