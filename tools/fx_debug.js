/* 调查 combat fx 为什么只发 contact 不发 fire */
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
    // 紧贴 k7
    hy9.x = k7.x - 4; hy9.z = k7.z; hy9.order = null; hy9.dest = null; hy9.strength = 28000;
    const before = { t: sim.t, fx: sim.fx.length, fxSeq: sim.fxSeq, flags: sim.flags };
    sim.speed = 1; let n = 0; const t0 = sim.t;
    while (Math.abs(sim.t - t0) < 3 && n++ < 200) HX.Sim.update(sim, 0.02);
    sim.speed = 0;
    const fxGroup = {};
    for (const f of sim.fx) fxGroup[f.kind] = (fxGroup[f.kind] || 0) + 1;
    // 查 combat 是否进入：看 sim.events 日志
    const logs = sim.events.filter((e) => e.text || e.kind).slice(-10).map((e) => ({ type: e.type, text: (e.text || '').slice(0, 80) }));
    // 查 hy9 与 k7 的 engagement
    const d = Math.hypot(hy9.x - k7.x, hy9.z - k7.z);
    // 手工调 combat 里的关键变量
    const best = k7;
    const kk = 50;  // 假设真发生伤亡才会发 fire
    const flags = sim.flags['fx'+best.id];
    const after = { t: sim.t, fx: sim.fx.length, fxGroup, fxSeq: sim.fxSeq, flags, logs, d, plaEngaged: hy9.engaged, kmtEngaged: k7.engaged };
    return { before, after };
  });
  console.log(JSON.stringify(result, null, 2));
  await br.close();
})().catch((e) => { console.error(e.stack); process.exit(1); });
