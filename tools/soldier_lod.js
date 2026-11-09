/* 逐兵 LOD 取证：同一镜头目标下，按距离分 far/mid/near 三档截图并统计
   instances / draws / tris / fps / 逐兵人数
   用法：node tools/soldier_lod.js
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
  await page.keyboard.press('Enter'); await sleep(1500); await skipCine(page); await sleep(900);

  const setup = await page.evaluate(() => {
    const g = HX.Game;
    g.sim = HX.Sim.create();
    g.sel = [];
    const sim = g.sim;
    sim.running = false; sim.speed = 0; sim.playedCine = {};
    // 取兵力最大的我军部队作镜头目标，保证三档都能看清逐兵
    let best = null;
    for (const p of sim.pla) { if (!p.dead && (!best || p.strength > best.strength)) best = p; }
    window.__target = [best.x, best.z];
    HX.Game.debugHooks.select([best.id]);
    return { unit: best.short, strength: Math.round(best.strength), cx: Math.round(best.x), cz: Math.round(best.z), pla: sim.pla.length, kmt: sim.kmt.length };
  });
  console.log('SETUP', setup);

  const shots = [];
  const cases = [
    { name: 'far', dist: 160, pitch: 0.86, expect: 0 },
    { name: 'mid', dist: 100, pitch: 0.72, expect: 1 },
    { name: 'near', dist: 56, pitch: 0.52, expect: 2 },
    { name: 'close', dist: 30, pitch: 0.42, expect: 2 },
    { name: 'kinds', dist: 14, pitch: 0.30, expect: 2, unit: '特纵' },
    { name: 'infantry', dist: 11, pitch: 0.26, expect: 2, unit: '4纵' },
  ];
  for (const c of cases) {
    await page.evaluate(({ dist, pitch, unit }) => {
      if (unit) {
        const u = HX.Game.sim.pla.find((p) => p.short === unit);
        window.__target = [u.x, u.z];
        HX.Game.debugHooks.select([u.id]);
      }
      const t = window.__target;
      HX.Game.setCam(t[0], t[1], dist, pitch, 0.72);
    }, { dist: c.dist, pitch: c.pitch, unit: c.unit });
    await sleep(900);
    // 采样 FPS：连续 30 帧取平均，避免单帧抖动
    const m = await page.evaluate(() => new Promise((res) => {
      const arr = [];
      let last = performance.now();
      function tick() {
        const now = performance.now();
        arr.push(now - last); last = now;
        if (arr.length < 30) requestAnimationFrame(tick);
        else {
          const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
          res({ frameMs: Math.round(avg * 10) / 10, fps: Math.round(10000 / avg) / 10, stats: HX.Game.getStats() });
        }
      }
      requestAnimationFrame(tick);
    }));
    await page.screenshot({ path: path.join(OUT, 'lod-' + c.name + '.png') });
    const s = m.stats;
    shots.push({
      lod: c.name, dist: c.dist, expectLod: c.expect,
      soldierLod: s.soldierLod, soldiers: s.soldiers, soldierUnits: s.soldierUnits,
      soldierInstances: s.soldierInstances,
      instances: s.instances, draws: s.draws, tris: s.tris,
      fps: m.fps, frameMs: m.frameMs, quality: s.quality, canvas: s.canvas, effDpr: s.effDpr
    });
    console.log('LOD', JSON.stringify(shots[shots.length - 1]));
  }

  const report = { setup, shots, errors };
  fs.writeFileSync(path.join(REPO, 'tools', 'soldier_lod.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('ERRORS', errors.slice(0, 4));
  await browser.close();
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
