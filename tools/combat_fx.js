/* 交战动画取证：指定一对部队（9纵 vs 7兵团），由 sim 真实战斗驱动
   帧 A = 交战前（未接触）；帧 B = 交战中（真实 fire/hit/shell 事件出现）；帧 C = 交战后（该部真实减员）
   用法：node tools/combat_fx.js
*/
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'file:///D:/新/淮海战役/index.html?mute=1';
const REPO = 'D:\\新\\淮海战役', OUT = path.join(REPO, 'shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function skipCine(page) {
  const active = await page.evaluate(() => !!(window.HX && HX.Cine && HX.Cine.state.active)).catch(() => false);
  if (active) { await page.keyboard.press('Escape'); await sleep(900); return true; }
  return false;
}

(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: EDGE,
    args: ['--mute-audio', '--disable-features=AudioServiceOutOfProcess', '--use-angle=d3d11', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(2600);
  await page.keyboard.press('Enter'); await sleep(1500); await skipCine(page); await sleep(900);
  await page.keyboard.press('Enter'); await sleep(1500); await skipCine(page); await sleep(600);

  const setup = await page.evaluate(() => {
    const g = HX.Game;
    g.sim = HX.Sim.create();
    g.sel = [];
    const sim = g.sim;
    sim.running = true; sim.speed = 1; sim.playedCine = {};
    let best = null;
    for (const p of sim.pla) {
      if (p.dead) continue;
      for (const k of sim.kmt) {
        if (!k.alive) continue;
        const d = Math.hypot(p.x - k.x, p.z - k.z);
        if (!best || d < best.d) best = { p, k, d };
      }
    }
    window.__pair = { pla: best.p.short, kmt: best.k.short, plaId: best.p.id, kmtId: best.k.id };
    HX.Game.setCam((best.p.x + best.k.x) / 2, (best.p.z + best.k.z) / 2, 74, 0.95, 0.42);
    HX.Game.debugHooks.select([best.p.id]);
    HX.Sim.command(sim, [best.p.id], 'attack', { kmtId: best.k.id });
    // 冻结真实时间，后续由脚本独占推进（避免 rAF 抢跑导致帧 A 已接敌）
    sim.running = true; sim.speed = 0;
    window.__adv = function (pred, maxSteps) {
      sim.speed = 1;
      let n = 0;
      while (n++ < maxSteps && !sim.ended) {
        HX.Sim.update(sim, 0.02);
        if (pred && pred()) break;
      }
      sim.speed = 0;
      return n;
    };
    return { pla: best.p.short, kmt: best.k.short, d: Math.round(best.d * 10) / 10, t: sim.t };
  });
  console.log('SETUP', setup);
  await sleep(1200);

  const snap = () => page.evaluate(() => {
    const sim = HX.Game.sim, pr = window.__pair;
    const p = sim.pla.find((u) => u.short === pr.pla);
    const k = sim.kmt.find((x) => x.id === pr.kmtId);
    const fxBy = {};
    for (const f of (sim.fx || [])) {
      if ((f.unit && f.unit !== pr.plaId) && (f.kmt && f.kmt !== pr.kmtId)) continue;
      fxBy[f.kind] = (fxBy[f.kind] || 0) + 1;
    }
    const fxRecent = (sim.fx || []).filter((f) => f.t >= sim.t - 2)
      .map((f) => ({ kind: f.kind, t: Math.round(f.t * 10) / 10, dmg: f.dmg, n: f.n, cover: f.cover, side: f.side }));
    return {
      t: Math.round(sim.t * 10) / 10,
      casualtiesAll: { pla: Math.round(sim.casualties.pla), kmt: Math.round(sim.casualties.kmt) },
      pla: p ? { short: p.short, strength: Math.round(p.strength), s0: p.s0, engaged: !!p.engaged,
        ammo: Math.round(p.ammo), morale: Math.round(p.morale), lastHit: p.lastHit || null,
        entrench: +p.entrench.toFixed(2) } : null,
      kmt: k ? { short: k.short, strength: Math.round(k.strength), s0: k.s0, cover: k.cover,
        surrounded: !!k.surrounded, sectors: k.sectors, lastHit: k.lastHit || null,
        gap: p ? Math.round(Math.hypot(p.x - k.x, p.z - k.z) * 100) / 100 : null } : null,
      fxSeq: sim.fxSeq || 0, fxBy, fxRecent,
      stats: HX.Game.getStats(),
    };
  });

  // 帧 A：交战前（双方尚未进入 9 单位接触距离）
  const A = await snap();
  await page.screenshot({ path: path.join(OUT, 'fx-A-before.png') });

  // 帧 B：推进到该部队真实接敌，且产生 fire 事件（脚本独占推进，每步 0.16 模拟小时）
  const mid = await page.evaluate(() => window.__adv(() => {
    const sim = HX.Game.sim, pr = window.__pair;
    const p = sim.pla.find((u) => u.short === pr.pla);
    return !!(p && p.engaged && (sim.fx || []).some((f) => f.kind === 'fire' && f.unit === pr.plaId));
  }, 2000));
  await sleep(300);
  const B = await snap();
  await page.screenshot({ path: path.join(OUT, 'fx-B-fighting.png') });

  // 帧 C：交战后（该部继续真实减员）
  const post = await page.evaluate(() => {
    const sim = HX.Game.sim, pr = window.__pair;
    const p0 = sim.pla.find((u) => u.short === pr.pla);
    const s0 = p0.strength, c0 = sim.casualties.kmt;
    return window.__adv(() => {
      const p = sim.pla.find((u) => u.short === pr.pla);
      return (p && s0 - p.strength > 600) || sim.casualties.kmt - c0 > 1500;
    }, 3000);
  });
  await sleep(300);
  const C = await snap();
  await page.screenshot({ path: path.join(OUT, 'fx-C-after.png') });

  const report = { setup, frames: { A, B, C }, steps: { mid, post }, errors };
  fs.writeFileSync(path.join(REPO, 'tools', 'combat_fx.json'), JSON.stringify(report, null, 2), 'utf8');
  const brief = (f) => ({ t: f.t, pla: f.pla && { str: f.pla.strength, engaged: f.pla.engaged, ammo: f.pla.ammo, hit: f.pla.lastHit },
    kmt: f.kmt && { str: f.kmt.strength, cover: f.kmt.cover, gap: f.kmt.gap, hit: f.kmt.lastHit }, fx: f.fxBy, fxSeq: f.fxSeq,
    draws: f.stats.draws, instances: f.stats.instances, tris: f.stats.tris, fps: f.stats.fps });
  console.log(JSON.stringify({ A: brief(A), B: brief(B), C: brief(C) }, null, 1));
  console.log('ERRORS', errors.slice(0, 4));
  await browser.close();
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
