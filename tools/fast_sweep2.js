/* 补 sim.running=true 后重测 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const REPO = 'D:\\新\\淮海战役', OUT = path.join(REPO, 'shots');
const URL = 'http://127.0.0.1:8080/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function skipCine(p) {
  const on = await p.evaluate(() => !!(window.HX && HX.Cine && HX.Cine.state.active)).catch(() => false);
  if (on) { await p.keyboard.press('Escape'); await sleep(900); }
}
(async () => {
  const br = await chromium.launch({ headless: true, executablePath: EDGE, args: ['--mute-audio','--use-angle=d3d11'] });
  const page = await (await br.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await page.goto(URL); await sleep(3000);
  await page.keyboard.press('Enter'); await sleep(1500); await skipCine(page); await sleep(900);
  await page.keyboard.press('Enter'); await sleep(1500); await skipCine(page); await sleep(600);

  await page.evaluate(() => {
    const g = HX.Game;
    g.sim = HX.Sim.create(); g.sel = [];
    const sim = g.sim;
    sim.playedCine = {};
    sim.pace = 1;        // ← 标准档：phase change 不停表
    sim.running = true;  // ← 关键：让推演真的跑起来
    sim.speed = 0;
    // 特纵 命令曹八集
    const hyte = sim.pla.find((u) => u.short === '特纵');
    HX.Sim.command(sim, [hyte.id], 'move', { x: 58.8, z: -1.4, player: true });
    // 把 9 纵直接挪到 7 兵团旁边，让战斗马上触发
    const hy9 = sim.pla.find((u) => u.short === '9纵');
    const k7 = sim.kmt.find((u) => u.short === '7兵团');
    hy9.x = k7.x - 12; hy9.z = k7.z; hy9.order = null; hy9.dest = null; hy9.path = null; hy9.strength = 28000; hy9.engaged = true; hy9.morale = 85;
    // 专属推进：speed=1 让 update 真的跑 combat
    window.__adv = function (h) {
      sim.speed = 1;
      let n = 0; const t0 = sim.t;
      while (Math.abs(sim.t - t0) < h && n++ < 5000) {
        HX.Sim.update(sim, 0.02);
      }
      sim.speed = 0;
      return n;
    };
  });
  console.log('INIT OK');

  // --- 特纵推进 ---
  await page.evaluate(() => { const u = HX.Game.sim.pla.find((x) => x.short === '特纵'); HX.Game.setCam(u.x, u.z, 110, 0.82, 0.18); });
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'sweep2-route-cmd.png') });
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.__adv(15));
    await page.screenshot({ path: path.join(OUT, 'sweep2-route-s' + i + '.png') });
  }
  const rf = await page.evaluate(() => {
    const u = HX.Game.sim.pla.find((x) => x.short === '特纵');
    return { t: Math.round(HX.Game.sim.t * 10) / 10, x: u.x, z: u.z, dest: u.dest, arrived: !!(u.order && u.order.arrived), dist: Math.hypot(u.x - 58.8, u.z + 1.4) };
  });
  console.log('ROUTE final', JSON.stringify(rf));

  // --- 交战帧：镜头对准 9纵 和 7兵团 ---
  await page.evaluate(() => {
    const sim = HX.Game.sim;
    const hy9 = sim.pla.find((u) => u.short === '9纵');
    const k7 = sim.kmt.find((u) => u.short === '7兵团');
    hy9.x = k7.x - 4; hy9.z = k7.z; hy9.order = null; hy9.dest = null; hy9.path = null; hy9.strength = 28000;
    sim.t = 0; sim.fx = []; sim.fxSeq = 0;
    HX.Game.setCam((hy9.x + k7.x) / 2, (hy9.z + k7.z) / 2, 74, 0.95, 0.42);
  });
  await sleep(600); await page.screenshot({ path: path.join(OUT, 'sweep2-fx-A.png') });
  await page.evaluate(() => window.__adv(6)); await page.screenshot({ path: path.join(OUT, 'sweep2-fx-B.png') });
  await page.evaluate(() => window.__adv(18)); await page.screenshot({ path: path.join(OUT, 'sweep2-fx-C.png') });
  const fm = await page.evaluate(() => {
    const p = HX.Game.sim.pla.find((u) => u.short === '9纵');
    const k = HX.Game.sim.kmt.find((u) => u.short === '7兵团');
    const s = HX.Game.getStats();
    const fxGroup = {};
    for (const f of HX.Game.sim.fx) fxGroup[f.kind] = (fxGroup[f.kind] || 0) + 1;
    return { t: Math.round(HX.Game.sim.t * 10) / 10, fxGroup, fxSeq: HX.Game.sim.fxSeq,
      pStr: p.strength, kStr: k.strength, cover: k.cover,
      inst: s.instances, tris: s.tris, fps: s.fps };
  });
  console.log('FX', JSON.stringify(fm));
  await br.close();
})().catch((e) => { console.error('FAIL', e.stack); process.exit(1); });
