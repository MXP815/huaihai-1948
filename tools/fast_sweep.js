/* 快拍：用 Playwright 截图，自己看图判断
   - 逐兵：4 纵近/中/远三档
   - 点哪走哪：特纵→曹八集 命令下达 / 行进中 / 到达
   - 交战：9 纵 vs 7 兵团 前/中/后
   用法：node tools/fast_sweep.js
*/
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

  // 场景初始化
  const S = await page.evaluate(() => {
    const g = HX.Game;
    g.sim = HX.Sim.create();
    g.sel = [];
    const sim = g.sim; sim.running = false; sim.speed = 0; sim.playedCine = {};
    // 镜头目标：4纵
    const p4 = sim.pla.find((u) => u.short === '4纵');
    // 选特纵并命令曹八集（58.8, -1.4）
    const hyte = sim.pla.find((u) => u.short === '特纵');
    HX.Sim.command(sim, [hyte.id], 'move', { x: 58.8, z: -1.4, player: true });
    // 选 9 纵并攻击 7 兵团
    const hy9 = sim.pla.find((u) => u.short === '9纵');
    const k7 = sim.kmt.find((u) => u.short === '7兵团');
    // 先让 9 纵接近 7 兵团
    sim.pla.find((u) => u.short === '9纵').x = sim.kmt.find((u) => u.short === '7兵团').x - 15;
    sim.pla.find((u) => u.short === '9纵').z = sim.kmt.find((u) => u.short === '7兵团').z;
    sim.pla.find((u) => u.short === '9纵').dest = null; sim.pla.find((u) => u.short === '9纵').order = null;
    // 固定步长推进
    window.__adv = function (h) { sim.speed = 1; let n = 0; const t0 = sim.t; while (Math.abs(sim.t - t0) < h && n++ < 5000) HX.Sim.update(sim, 0.02); sim.speed = 0; return n; };
    return { hyte: { x: hyte.x, z: hyte.z }, caoxu: [58.8, -1.4], hy9: { x: hy9.x, z: hy9.z }, k7: { x: k7.x, z: k7.z } };
  });
  console.log('INIT', JSON.stringify(S));

  // --- 逐兵 LOD 三档 ---
  const p4 = await page.evaluate(() => { const u = HX.Game.sim.pla.find((x) => x.short === '4纵'); return [u.x, u.z]; });
  for (const [name, dist, pitch] of [['far', 160, 0.86], ['mid', 100, 0.72], ['near', 56, 0.52], ['kind', 14, 0.30]]) {
    await page.evaluate(({ x, z, d, p }) => HX.Game.setCam(x, z, d, p, 0.72), { x: p4[0], z: p4[1], d: dist, p: pitch });
    await sleep(700);
    await page.screenshot({ path: path.join(OUT, 'sweep-lod-' + name + '.png') });
    console.log('LOD', name);
  }

  // --- 特纵 → 曹八集 ---
  const hyte = await page.evaluate(() => { const u = HX.Game.sim.pla.find((x) => x.short === '特纵'); return [u.x, u.z]; });
  await page.evaluate(({ x, z }) => HX.Game.setCam(x, z, 110, 0.82, 0.18), { x: hyte[0], z: hyte[1] });
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, 'sweep-route-cmd.png') });
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.__adv(20));
    await page.screenshot({ path: path.join(OUT, 'sweep-route-step' + i + '.png') });
  }
  await page.evaluate(() => window.__adv(60));
  await page.screenshot({ path: path.join(OUT, 'sweep-route-end.png') });
  const rf = await page.evaluate(() => {
    const u = HX.Game.sim.pla.find((x) => x.short === '特纵');
    return { x: u.x, z: u.z, dest: u.dest, arrived: u.order && u.order.arrived, dist: Math.hypot(u.x - 58.8, u.z + 1.4) };
  });
  console.log('ROUTE final', JSON.stringify(rf));

  // --- 交战帧 ---
  await page.evaluate(() => {
    const sim = HX.Game.sim;
    sim.t = 0;
    sim.pla.find((u) => u.short === '9纵').x = sim.kmt.find((u) => u.short === '7兵团').x - 15;
    sim.pla.find((u) => u.short === '9纵').z = sim.kmt.find((u) => u.short === '7兵团').z;
    sim.pla.find((u) => u.short === '9纵').strength = 28000;
    sim.pla.find((u) => u.short === '9纵').order = null; sim.pla.find((u) => u.short === '9纵').dest = null;
  });
  const hy9 = await page.evaluate(() => { const u = HX.Game.sim.pla.find((x) => x.short === '9纵'); return [u.x, u.z]; });
  const k7 = await page.evaluate(() => { const u = HX.Game.sim.kmt.find((x) => x.short === '7兵团'); return [u.x, u.z]; });
  await page.evaluate(({ ax, az, bx, bz }) => HX.Game.setCam((ax + bx) / 2, (az + bz) / 2, 74, 0.95, 0.42), { ax: hy9[0], az: hy9[1], bx: k7[0], bz: k7[1] });
  await sleep(600); await page.screenshot({ path: path.join(OUT, 'sweep-fx-A.png') });
  await page.evaluate(() => window.__adv(12)); await page.screenshot({ path: path.join(OUT, 'sweep-fx-B.png') });
  await page.evaluate(() => window.__adv(36)); await page.screenshot({ path: path.join(OUT, 'sweep-fx-C.png') });
  const fm = await page.evaluate(() => {
    const p = HX.Game.sim.pla.find((u) => u.short === '9纵');
    const k = HX.Game.sim.kmt.find((u) => u.short === '7兵团');
    const s = HX.Game.getStats();
    return { t: Math.round(HX.Game.sim.t * 10) / 10,
      pStr: p.strength, kStr: k.strength, cover: k.cover, fx: HX.Game.sim.fx.length,
      inst: s.instances, tris: s.tris, fps: s.fps };
  });
  console.log('FX', JSON.stringify(fm));
  await br.close();
})().catch((e) => { console.error('FAIL', e.stack); process.exit(1); });
