/* 坐标反解取证：世界点 -> 屏幕 -> 逆投影 -> 世界点，比对四地（曹八集/贾汪/邳县/宿迁）
   并真实右键下令，打印 order/dest/routeLog/requests。
   用法：node tools/coord_probe.js before|after
*/
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'file:///D:/新/淮海战役/index.html?mute=1';
const TAG = process.argv[2] || 'before';
const REPO = 'D:\\新\\淮海战役';
const OUT = path.join(REPO, 'shots');
const JSON_OUT = path.join(REPO, 'tools', `coord_probe_${TAG}.json`);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PLACES = [
  { id: 'caoxu', name: '曹八集', x: 58.8, z: -1.4 },
  { id: 'jiazhuang', name: '贾汪', x: 31.1, z: -25.0 },
  { id: 'pizhou', name: '邳县', x: 89.9, z: -7.0 },
  { id: 'suqian', name: '宿迁', x: 126.8, z: 41.7 },
];

async function skipCine(page) {
  const active = await page.evaluate(() => !!(window.HX && HX.Cine && HX.Cine.state.active)).catch(() => false);
  if (active) { await page.keyboard.press('Escape'); await sleep(1000); return true; }
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
  await page.keyboard.press('Enter');
  await sleep(1600);
  await skipCine(page);
  await sleep(1200);
  await page.keyboard.press('Enter');
  await sleep(1600);
  await skipCine(page);

  await page.evaluate(() => {
    const g = HX.Game;
    g.sim.speed = 1;
    g.sim.running = true;
    g.sim.playedCine = {};
  });
  await sleep(800);

  const report = { tag: TAG, cam: await page.evaluate(() => HX.Game.debugHooks.camInfo()), roundTrip: [], clickTests: [], errors };

  // 正确的逆投影（仅取证用）：right = [-fwd.z,0,fwd.x]，up = cross(right,fwd)
  await page.evaluate(() => {
    window.__intended = function (sx, sy) {
      const H = HX.Game.debugHooks, W = HX.World, r = HX.Game.renderer;
      const w = r.cssW, h = r.cssH, c = H.camInfo();
      const f = [c.target[0] - c.pos[0], c.target[1] - c.pos[1], c.target[2] - c.pos[2]];
      const fl = Math.hypot(f[0], f[1], f[2]); f[0] /= fl; f[1] /= fl; f[2] /= fl;
      const rg = [-f[2], 0, f[0]]; const rl = Math.hypot(rg[0], rg[2]); rg[0] /= rl; rg[2] /= rl;
      const up = [rg[1] * f[2] - rg[2] * f[1], rg[2] * f[0] - rg[0] * f[2], rg[0] * f[1] - rg[1] * f[0]];
      const tanY = Math.tan(42 * Math.PI / 180 / 2);
      const nx = sx / w * 2 - 1, ny = 1 - sy / h * 2;
      const d = [f[0] + rg[0] * nx * tanY * (w / h) + up[0] * ny * tanY,
        f[1] + rg[1] * nx * tanY * (w / h) + up[1] * ny * tanY,
        f[2] + rg[2] * nx * tanY * (w / h) + up[2] * ny * tanY];
      const dl = Math.hypot(d[0], d[1], d[2]); d[0] /= dl; d[1] /= dl; d[2] /= dl;
      for (let t = 2; t < 900; t += 2) {
        const x = c.pos[0] + d[0] * t, z = c.pos[2] + d[2] * t;
        if (c.pos[1] + d[1] * t <= W.heightAt(x, z)) return [x, z];
      }
      return null;
    };
  });

  // ---- 1. 世界 -> 屏幕 -> 逆投影 -> 世界：四地往返误差
  report.roundTrip = await page.evaluate((places) => {
    const H = HX.Game.debugHooks, W = HX.World;
    return places.map((p) => {
      const y = W.heightAt(p.x, p.z);
      const scr = H.project(p.x, y + 0.2, p.z);
      if (!scr) return { ...p, screen: null, back: null, err: null };
      const gp = H.groundPoint(scr.x, scr.y);
      if (!gp) return { ...p, screen: { x: Math.round(scr.x), y: Math.round(scr.y) }, back: null, err: null };
      const err = Math.hypot(gp[0] - p.x, gp[1] - p.z);
      return {
        id: p.id, name: p.name, world: { x: p.x, z: p.z },
        screen: { x: Math.round(scr.x * 10) / 10, y: Math.round(scr.y * 10) / 10 },
        back: { x: Math.round(gp[0] * 100) / 100, z: Math.round(gp[1] * 100) / 100 },
        err: Math.round(err * 100) / 100,
        dx: Math.round((gp[0] - p.x) * 100) / 100, dz: Math.round((gp[1] - p.z) * 100) / 100,
      };
    });
  }, PLACES);
  console.log('ROUNDTRIP', JSON.stringify(report.roundTrip, null, 1));

  // ---- 2. 真实右键：选特纵 -> 右键点曹八集屏幕点；选 10 纵 -> 右键点贾汪屏幕点
  const cases = [
    { unit: '特纵', placeId: 'caoxu', off: [0, 34] },
    { unit: '10纵', placeId: 'jiazhuang', off: [0, 34] },
  ];
  // 用第一章默认取景（用户在真机上看到的视角），不做点对点重新对焦
  await page.evaluate(() => { HX.Game.setCam(68, -6, 118, 0.72, 0.86); });
  await sleep(900);
  for (const c of cases) {
    const place = PLACES.find((p) => p.id === c.placeId);
    const target = await page.evaluate((p) => {
      const H = HX.Game.debugHooks, W = HX.World;
      const y = W.heightAt(p.x, p.z);
      const scr = H.project(p.x, y + 0.2, p.z);
      return scr ? { x: Math.round(scr.x), y: Math.round(scr.y) } : null;
    }, place);
    if (target) { target.x += c.off[0]; target.y += c.off[1]; }
    const intended = target ? await page.evaluate((s) => window.__intended(s.x, s.y), target) : null;
    const hitAt = target ? await page.evaluate((s) => { const h = HX.Game.debugHooks.hitTest(s.x, s.y); return h ? { kind: h.kind, id: h.id } : null; }, target) : null;
    // 选部队（走 UI 真实路径：先用钩子选中，再看 order 是否写入）
    const sel = await page.evaluate((short) => {
      const g = HX.Game;
      const u = g.sim.pla.find((p) => p.short === short);
      if (!u) return { ok: false, list: g.sim.pla.map((p) => p.short) };
      return { ok: true, id: u.id, sel: HX.Game.debugHooks.select([u.id]) };
    }, c.unit);
    const before = await page.evaluate((short) => HX.Game.debugHooks.unit(short), c.unit);
    const routeLog0 = await page.evaluate(() => HX.Game.sim.routeLog.length);
    if (!target) { report.clickTests.push({ ...c, target: null, sel, note: '目标在屏幕外' }); continue; }
    await page.mouse.click(target.x, target.y, { button: 'right' });
    await sleep(900);
    const after = await page.evaluate((short) => HX.Game.debugHooks.unit(short), c.unit);
    const routeLog1 = await page.evaluate(() => HX.Game.sim.routeLog.slice());
    const expect = await page.evaluate((short) => {
      const g = HX.Game;
      const u = g.sim.pla.find((p) => p.short === short);
      return u && u.dest ? { x: Math.round(u.dest.x * 100) / 100, z: Math.round(u.dest.z * 100) / 100 } : null;
    }, c.unit);
    const dist = expect ? Math.hypot(expect.x - place.x, expect.z - place.z) : null;
    const intendedGap = (expect && intended) ? Math.hypot(expect.x - intended[0], expect.z - intended[1]) : null;
    const lastLogs = await page.evaluate(() => HX.Game.sim.logs.slice(0, 3).map((l) => l.text));
    const reqs = await page.evaluate(() => (HX.Game.sim.requests || []).map((r) => ({ unit: r.short, type: r.type, status: r.status, text: r.text })));
    report.clickTests.push({
      unit: c.unit, placeId: c.placeId, placeName: place.name,
      placeWorld: { x: place.x, z: place.z }, screen: target, intendedWorld: intended, hitAt, sel,
      orderBefore: before, orderAfter: after,
      destVsPlace: dist == null ? null : Math.round(dist * 100) / 100,
      destVsIntended: intendedGap == null ? null : Math.round(intendedGap * 100) / 100,
      routeLogNew: routeLog1.slice(routeLog0), requests: reqs, lastLogs,
    });
    console.log('CLICK', c.unit, '->', place.name,
      '\n  screen', target, '\n  intended(正确逆投影)', intended,
      '\n  dest(游戏实际写入)', expect,
      '\n  |dest-intended|', intendedGap && Math.round(intendedGap * 100) / 100,
      '\n  |dest-place|', dist && Math.round(dist * 100) / 100,
      '\n  lastLogs', lastLogs);
  }

  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log('ERRORS', errors.slice(0, 5));
  await browser.close();
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
