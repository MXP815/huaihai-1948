/* 截图：第 2/3 阶段简报（静默） */
const { chromium } = require('playwright-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://127.0.0.1:8012/index.html?mute=1';
const OUT = 'D:\\新\\淮海战役\\shots\\';
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EDGE, args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(2400);
  await p.keyboard.press('Enter'); await p.waitForTimeout(1400);
  await p.keyboard.press('Escape'); await p.waitForTimeout(1000);
  // 跳过简报
  if (await p.locator('#modalWrap').isVisible()) { await p.keyboard.press('Enter'); await p.waitForTimeout(900); }
  // 用模拟状态直接切阶段，仅用于截取简报界面
  for (const ph of [2, 3]) {
    await p.evaluate((phase) => { HX.Game.sim.phase = phase; HX.UI.briefing(HX.Game.sim); }, ph);
    await p.waitForTimeout(500);
    await p.screenshot({ path: OUT + '2' + ph + '-briefing-phase' + ph + '.png' });
    console.log('shot phase', ph, await p.locator('#modalWrap h2').textContent());
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  }
  console.log('muted', await p.evaluate(() => HX.Audio.muted()), 'ERRS', errs.length ? errs : 'none');
  await b.close();
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
