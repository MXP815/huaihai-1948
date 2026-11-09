/* 复测「点哪不走哪 / 静默改航」：固定种子、固定步长推进，记录轨迹/落点/改航记录
   用法：node tools/route_rules.js
   输出：tools/route_rules.json + shots/route-<case>-{cmd,mid,end}.png
*/
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'file:///D:/新/淮海战役/index.html?mute=1';
const REPO = 'D:\\新\\淮海战役';
const OUT = path.join(REPO, 'shots');
const JSON_OUT = path.join(REPO, 'tools', 'route_rules.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CASES = [
  { tag: 'hyte-caoxu', unit: '特纵', place: { name: '曹八集', x: 58.8, z: -1.4 } },
  { tag: 'hy10-jiazhuang', unit: '10纵', place: { name: '贾汪', x: 31.1, z: -25.0 } },
];

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
  await page.keyboard.press('Enter'); await sleep(1500);
  await skipCine(page); await sleep(1000);
  await page.keyboard.press('Enter'); await sleep(1500);
  await skipCine(page); await sleep(600);

  const report = { cases: [], errors };

  for (const c of CASES) {
    // 每个案例重新开局，保证同场景、同种子
    await page.evaluate(() => {
      HX.Game.sim = HX.Sim.create();
      HX.Game.sel = [];
      HX.Game.sim.speed = 1;
      HX.Game.sim.running = true;
      HX.Game.sim.playedCine = {};
    });
    await page.evaluate((p) => { HX.Game.setCam(p.x, p.z, 118, 0.72, 0.86); }, c.place);
    await sleep(700);
    const scr = await page.evaluate((p) => {
      const H = HX.Game.debugHooks, W = HX.World;
      const y = W.heightAt(p.x, p.z);
      const s = H.project(p.x, y + 0.2, p.z);
      return s ? { x: Math.round(s.x), y: Math.round(s.y + 34) } : null;
    }, c.place);
    const sel = await page.evaluate((short) => {
      const g = HX.Game;
      const u = g.sim.pla.find((p) => p.short === short);
      return u ? { id: u.id, at: { x: Math.round(u.x * 10) / 10, z: Math.round(u.z * 10) / 10 }, sel: HX.Game.debugHooks.select([u.id]) } : null;
    }, c.unit);
    if (!scr || !sel) { report.cases.push({ tag: c.tag, error: '目标/部队不可达' }); continue; }

    await page.mouse.click(scr.x, scr.y, { button: 'right' });
    await sleep(700);
    const cmd = await page.evaluate((short) => {
      const g = HX.Game, u = g.sim.pla.find((p) => p.short === short);
      return {
        t: Math.round(g.sim.t * 10) / 10,
        order: u.order, dest: u.dest, halted: !!u.halted,
        log: g.sim.logs.slice(0, 2).map((l) => l.text),
      };
    }, c.unit);
    await page.evaluate((m) => HX.Game.setCam(m.x, m.z, 210, 1.02, 0.15), {
      x: (sel.at.x + c.place.x) / 2, z: (sel.at.z + c.place.z) / 2,
    });
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, `route-${c.tag}-cmd.png`) });

    // 固定步长推进（每步 0.6s = 4.8 模拟小时），确定性 sim；分两段以便取"行进中"帧
    await page.evaluate(() => {
      const sim = HX.Game.sim;
      window.__samples = [];
      window.__step = function (short, n) {
        const S = HX.Sim;
        const u = sim.pla.find((p) => p.short === short);
        for (let i = 0; i < n; i++) {
          S.update(sim, 0.6);
          window.__samples.push({
            h: Math.round(sim.t * 10) / 10,
            x: Math.round(u.x * 100) / 100, z: Math.round(u.z * 100) / 100,
            dest: u.dest ? { x: Math.round(u.dest.x * 100) / 100, z: Math.round(u.dest.z * 100) / 100 } : null,
            dist: u.dest ? Math.round(Math.hypot(u.x - u.dest.x, u.z - u.dest.z) * 100) / 100 : 0,
            halted: !!u.halted, arrived: !!(u.order && u.order.arrived),
          });
        }
        return window.__samples.length;
      };
    });
    await page.evaluate((short) => window.__step(short, 7), c.unit);
    await page.evaluate((m) => HX.Game.setCam(m.x, m.z, 210, 1.02, 0.15), {
      x: (sel.at.x + c.place.x) / 2, z: (sel.at.z + c.place.z) / 2,
    });
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, `route-${c.tag}-mid.png`) });
    await page.evaluate((short) => window.__step(short, 253), c.unit);
    const run = await page.evaluate((short) => {
      const g = HX.Game, sim = g.sim;
      const u = sim.pla.find((p) => p.short === short);
      return {
        samples: window.__samples,
        routeLog: sim.routeLog,
        requests: sim.requests.map((r) => ({ unit: r.short, type: r.type, status: r.status, text: r.text, to: r.to || null })),
        events: sim.events.slice(-20).map((e) => ({ type: e.type, text: e.text, decider: e.decider, to: e.to || null })),
        unit: { x: Math.round(u.x * 100) / 100, z: Math.round(u.z * 100) / 100, dest: u.dest, halted: !!u.halted,
          order: u.order, reroute: u.reroute, path: u.path, pathIndex: u.pathIndex },
        endT: Math.round(sim.t * 10) / 10,
      };
    }, c.unit);
    await page.evaluate(() => { HX.Game.sim.running = false; });
    await page.evaluate((m) => HX.Game.setCam(m.x, m.z, 210, 1.02, 0.15), {
      x: (sel.at.x + c.place.x) / 2, z: (sel.at.z + c.place.z) / 2,
    });
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, `route-${c.tag}-end.png`) });

    const final = run.samples[run.samples.length - 1] || null;
    const first = run.samples[0] || null;
    const midShot = run.samples[Math.floor(run.samples.length / 2)] || null;
    report.cases.push({
      tag: c.tag, unit: c.unit, place: c.place, screen: scr, sel, cmd,
      samples: run.samples, final, first, midSample: midShot, endT: run.endT,
      unitEnd: run.unit, routeLog: run.routeLog, requests: run.requests,
      newRequests: run.newRequests, events: run.events,
      finalDistToTarget: Math.round(Math.hypot(run.unit.x - c.place.x, run.unit.z - c.place.z) * 100) / 100,
    });
    console.log('CASE', c.tag, JSON.stringify({ cmd: { dest: cmd.dest, order: cmd.order }, log: cmd.log, final: final, unitEnd: run.unit.dest, routeLog: run.routeLog.length, requests: run.newRequests }, null, 1));
  }

  await page.evaluate(() => { if (HX.Game.sim) HX.Game.sim.running = false; });
  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log('ERRORS', errors.slice(0, 5));
  await browser.close();
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
