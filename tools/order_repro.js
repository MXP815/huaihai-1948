/* 复现「点哪不走哪 / 上级不停调度」：真实点击选择 + 点击地面下令，5 分钟采轨（每 10s 一个点）
   用法：node tools/order_repro.js before|after
   输出：tools/order_repro_<tag>.json + shots/order-<tag>-start.png / -end.png
*/
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'file:///D:/新/淮海战役/index.html?mute=1';
const TAG = process.argv[2] || 'before';
const REPO = 'D:\\新\\淮海战役';
const OUT = path.join(REPO, 'shots');
const JSON_OUT = path.join(REPO, 'tools', `order_repro_${TAG}.json`);
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  const report = { tag: TAG, steps: [], samples: [], errors };

  // 固定开局：低倍速，便于每 10s 采点
  await page.evaluate(() => {
    const g = HX.Game;
    g.sim.speed = 1;
    g.sim.running = true;
    g.sim.playedCine = {};
  });

  const selBefore = await page.evaluate(() => {
    const g = HX.Game;
    const list = g.plaScreens || [];
    const u = list.find((p) => p.short === '华野第1纵队') || list[0] || null;
    return { unit: u, count: list.length, hour: g.sim.t, date: HX.Sim.dateLabel(g.sim.t) };
  });
  report.deploy = selBefore;

  // 真实点击：点中该纵队的屏幕标记
  if (selBefore.unit) {
    await page.mouse.click(selBefore.unit.x, selBefore.unit.y);
    await sleep(700);
  }
  const afterSelect = await page.evaluate(() => {
    const g = HX.Game;
    return { sel: (g.sel || []).map((u) => u.short), pending: g.pendingOrder || null, hour: g.sim.t };
  });
  report.afterSelect = afterSelect;

  // 记录下令前的目标（应为空或旧目标）
  const beforeOrder = await page.evaluate(() => {
    const g = HX.Game;
    const u = (g.sel || [])[0];
    return u ? { short: u.short, x: u.x, z: u.z, dest: u.dest || null, halted: !!u.halted, order: u.order || null } : null;
  });
  report.orderBefore = beforeOrder;

  // 真实点击：点画面右下空地作为目标点（不按右键，模拟用户"点哪走哪"的直觉操作）
  const hit = await page.evaluate(({ x, y }) => {
    // 先探明该屏幕点是否落在空地上（hitTest 在 game.js 内部，这里用公开的 map2d/hit 信息近似）
    return { x, y };
  }, { x: 1180, y: 640 });
  await page.mouse.click(hit.x, hit.y);
  await sleep(900);
  const afterMove = await page.evaluate(() => {
    const g = HX.Game;
    const u = (g.sel || [])[0] || g.sim.pla.find((p) => p.short === '华野第1纵队');
    const dest = u && u.dest ? { x: Math.round(u.dest.x * 100) / 100, z: Math.round(u.dest.z * 100) / 100 } : null;
    return {
      hour: g.sim.t,
      dest, halted: u ? !!u.halted : null,
      orderApplied: !!(u && u.dest),
      orderSrc: u && u.order ? u.order : null,
      sel: (g.sel || []).map((p) => p.short),
    };
  });
  report.afterClickMove = afterMove;

  await page.screenshot({ path: path.join(OUT, `order-${TAG}-start.png`) });

  // 5 分钟采轨：每 10 秒一个点
  const t0 = Date.now();
  const samples = [];
  let cineCount = 0;
  for (let i = 0; i < 31; i++) {
    if (i > 0) await sleep(10000);
    const paused = await skipCine(page);
    if (paused) { cineCount++; await page.evaluate(() => { HX.Game.sim.running = true; }); }
    const s = await page.evaluate((idx) => {
      const g = HX.Game;
      const sim = g.sim;
      const u = sim.pla.find((p) => p.short === '华野第1纵队') || (g.sel || [])[0];
      if (!u) return null;
      const dest = u.dest || null;
      const dist = dest ? Math.round(Math.hypot(u.x - dest.x, u.z - dest.z) * 100) / 100 : null;
      return {
        realS: idx * 10,
        hour: Math.round(sim.t * 100) / 100,
        x: Math.round(u.x * 100) / 100, z: Math.round(u.z * 100) / 100,
        dest: dest ? { x: Math.round(dest.x * 100) / 100, z: Math.round(dest.z * 100) / 100 } : null,
        dist, halted: !!u.halted, speed: sim.speed,
        engaged: !!(u.engaged || u.inCombat),
        routeLog: sim.routeLog.length, requests: (sim.requests || []).length,
        fx: (sim.fx || []).length,
        dead: !!u.dead,
      };
    }, i);
    if (s) samples.push(s);
  }
  report.samples = samples;
  report.cineInterrupts = cineCount;

  const tail = await page.evaluate(() => {
    const sim = HX.Game.sim;
    const u = sim.pla.find((p) => p.short === '华野第1纵队');
    const dest = u && u.dest ? u.dest : null;
    return {
      hour: Math.round(sim.t * 100) / 100, date: HX.Sim.dateLabel(sim.t),
      unit: u ? { short: u.short, x: Math.round(u.x * 100) / 100, z: Math.round(u.z * 100) / 100, dest: dest ? { x: Math.round(dest.x * 100) / 100, z: Math.round(dest.z * 100) / 100 } : null, halted: !!u.halted } : null,
      dist: u && dest ? Math.round(Math.hypot(u.x - dest.x, u.z - dest.z) * 100) / 100 : null,
      routeLog: sim.routeLog.map((r) => ({ t: Math.round(r.t * 10) / 10, unit: r.unit, reason: r.reason, decider: r.decider })),
      requests: (sim.requests || []).map((r) => ({ kind: r.kind || 'need', unit: r.unit, text: r.text || r.reason, status: r.status })),
      autonomy: sim.autonomy, auth: sim.auth,
      stats: (() => { const r = HX.Game.renderer; return r && r.stats ? r.stats : null; })(),
    };
  });
  report.tail = tail;

  await page.evaluate(() => { HX.Game.sim.running = false; });
  await page.screenshot({ path: path.join(OUT, `order-${TAG}-end.png`) });
  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2), 'utf8');

  console.log(JSON.stringify({
    tag: TAG,
    orderBefore: report.orderBefore,
    afterClickMove: report.afterClickMove,
    cineInterrupts: report.cineInterrupts,
    routeLogCount: tail.routeLog.length,
    requestCount: tail.requests.length,
    finalDist: tail.dist,
    trajectory: samples.map((s) => `${s.realS}s t=${s.hour} (${s.x},${s.z}) d=${s.dist} halt=${s.halted ? 1 : 0}`),
    routeLog: tail.routeLog,
    requests: tail.requests,
    errors,
  }, null, 2));
  await browser.close();
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
