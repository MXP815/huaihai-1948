/* 总攻（第一人称）回归探针：先合围 k7 到 5/8 扇区且存活，再点「总攻」，
   确认 FPS 模式能进入、炮火准备提示存在、退出后回到战役层
   用法：node tools/assault_probe.js
*/
const { chromium } = require('playwright-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'file:///D:/新/淮海战役/index.html?mute=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function skipCine(page) {
  const active = await page.evaluate(() => !!(window.HX && HX.Cine && HX.Cine.state.active)).catch(() => false);
  if (active) { await page.keyboard.press('Escape'); await sleep(900); return true; }
  return false;
}

(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: EDGE,
    args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-swiftshader'],
  });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(2600);
  await page.keyboard.press('Enter'); await sleep(1500); await skipCine(page); await sleep(900);
  await page.keyboard.press('Enter'); await sleep(1500); await skipCine(page); await sleep(600);

  const st = await page.evaluate(() => {
    const g = HX.Game;
    g.sim = HX.Sim.create();
    const sim = g.sim;
    sim.running = true; sim.speed = 0; sim.playedCine = {};
    const ids = ['hy1', 'hy3', 'hy4', 'hy6', 'hy8', 'hy9', 'hyte', 'hy13'].map((s) => sim.pla.find((u) => u.id === s).id);
    HX.Sim.command(sim, ids, 'encircle', { kmtId: 'k7' });
    sim.speed = 1;
    let n = 0;
    while (n++ < 5000) {
      HX.Sim.update(sim, 0.02);
      const k = sim.kmt.find((x) => x.id === 'k7');
      if (k.surrounded && k.alive) break;
    }
    sim.speed = 0;
    const k = sim.kmt.find((x) => x.id === 'k7');
    HX.Game.debugHooks.select([sim.pla.find((u) => u.id === 'hy9').id]);
    return { t: Math.round(sim.t * 10) / 10, k7: { alive: k.alive, surrounded: k.surrounded, cover: k.cover, strength: Math.round(k.strength) } };
  });
  console.log('SURROUNDED', JSON.stringify(st));
  await sleep(600);
  await page.locator('#btnAssault').click();
  await sleep(2000);
  const fps = await page.evaluate(() => ({ active: !!(HX.FPS && HX.FPS.state && HX.FPS.state.active), screen: !!document.getElementById('fps-screen').getAttribute('style') }));
  console.log('FPS', JSON.stringify(fps), 'support', await page.evaluate(() => HX.Game.sim && HX.Game.sim.lastSupport ? HX.Game.sim.lastSupport : null));
  await page.screenshot({ path: 'D:\\新\\淮海战役\\shots\\assault-fps.png' });
  await page.keyboard.press('Escape'); await sleep(1600);
  console.log('back campaign', await page.locator('#campaign').isVisible(), 'errs', errs.slice(0, 3));
  await browser.close();
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
