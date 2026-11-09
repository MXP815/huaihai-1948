/* 合围回归探针：验证「8 个华野部队包围 7 兵团」是否在当前规则下仍能形成合围
   固定步长推进（S.update(sim, 0.02) = 0.16h/步），每 12h 采样一次
   用法：node tools/encircle_probe.js
*/
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'file:///D:/新/淮海战役/index.html?mute=1';
const REPO = 'D:\\新\\淮海战役';
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
    sim.running = true; sim.speed = 0; sim.playedCine = {};
    const ids = ['hy1', 'hy3', 'hy4', 'hy6', 'hy8', 'hy9', 'hyte', 'hy13'].map((s) => sim.pla.find((u) => u.id === s).id);
    HX.Sim.command(sim, ids, 'encircle', { kmtId: 'k7' });
    window.__ids = ids;
    window.__adv = function (hours) {
      sim.speed = 1;
      let n = 0;
      const t0 = sim.t;
      while (Math.abs(sim.t - t0) < hours && n++ < 4000 && !sim.ended) HX.Sim.update(sim, 0.02);
      sim.speed = 0;
      return n;
    };
    const k = sim.kmt.find((x) => x.id === 'k7');
    return { units: ids.length, k7: { x: Math.round(k.x), z: Math.round(k.z), strength: Math.round(k.strength) }, auth: sim.auth, autonomy: sim.autonomy };
  });
  console.log('SETUP', JSON.stringify(setup));

  const rows = [];
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => window.__adv(12));
    const s = await page.evaluate(() => {
      const sim = HX.Game.sim, k = sim.kmt.find((x) => x.id === 'k7');
      const units = window.__ids.map((id) => {
        const u = sim.pla.find((p) => p.id === id);
        return { short: u.short, x: Math.round(u.x * 10) / 10, z: Math.round(u.z * 10) / 10,
          dK: Math.round(Math.hypot(u.x - k.x, u.z - k.z) * 10) / 10,
          halted: !!u.halted, arrived: !!(u.order && u.order.arrived),
          dest: u.dest ? [Math.round(u.dest.x), Math.round(u.dest.z)] : null,
          pathLeft: u.path ? Math.max(0, u.path.length - (u.pathIndex || 0)) : 0,
          reroute: u.reroute ? u.reroute.decider : null, rerouteN: 0 };
      });
      return { t: Math.round(sim.t * 10) / 10, k7: { alive: k.alive, surrounded: !!k.surrounded, cover: k.cover,
        sectors: k.sectors, strength: Math.round(k.strength) },
        openReq: sim.requests.filter((r) => r.status === 'open').length,
        totalReq: sim.requests.length,
        routeLog: sim.routeLog.length,
        units };
    });
    rows.push(s);
    console.log(JSON.stringify({ t: s.t, k7: s.k7, req: [s.openReq, s.totalReq], route: s.routeLog,
      minDK: Math.min(...s.units.map((u) => u.dK)), halted: s.units.filter((u) => u.halted).length,
      arrived: s.units.filter((u) => u.arrived).length, reroute: s.units.filter((u) => u.reroute).length }));
    if (!s.k7.alive || s.k7.surrounded) break;
  }

  fs.writeFileSync(path.join(REPO, 'tools', 'encircle_probe.json'), JSON.stringify({ setup, rows, errors }, null, 2), 'utf8');
  console.log('ERRORS', errors.slice(0, 4));
  await browser.close();
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
