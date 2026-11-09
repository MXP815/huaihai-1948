/* pace=1 为什么自动变回 0 */
const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const br = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', args: ['--mute-audio','--use-angle=d3d11'] });
  const page = await (await br.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await page.goto('http://127.0.0.1:8080/index.html'); await sleep(3000);
  await page.keyboard.press('Enter'); await sleep(1500); await page.keyboard.press('Escape'); await sleep(900);
  await page.keyboard.press('Enter'); await sleep(1500); await page.keyboard.press('Escape'); await sleep(600);
  const r = await page.evaluate(() => {
    const sim = HX.Sim.create();
    // 直接看 S.create 里 pace 默认
    const before = { pace: sim.pace, running: sim.running, speed: sim.speed };
    sim.pace = 1; sim.running = true; sim.speed = 0;
    // 跑 1h update
    sim.speed = 1; let n = 0; const t0 = sim.t;
    while (Math.abs(sim.t - t0) < 1 && n++ < 2000) HX.Sim.update(sim, 0.02);
    sim.speed = 0;
    const after = { pace: sim.pace, running: sim.running, speed: sim.speed, t: sim.t };
    // 那 UI init 会不会又 setPace(0)？
    HX.Game.sim = sim;
    const afterSetG = { pace: sim.pace, running: sim.running };
    return { before, after, afterSetG };
  });
  console.log(JSON.stringify(r, null, 2));
  await br.close();
})().catch((e) => { console.error(e.stack); process.exit(1); });
