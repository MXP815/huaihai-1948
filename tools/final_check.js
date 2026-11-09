/* 交付目录最终自检：无黑屏、无致命报错、可进入指挥层、过场可播（静默） */
const { chromium } = require('playwright-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://127.0.0.1:8012';
const OUT = 'D:\\新\\淮海战役\\shots\\';
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EDGE, args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });

  const r1 = await p.goto(BASE + '/index.html?mute=1', { waitUntil: 'load' });
  await p.waitForTimeout(2600);
  const title = await p.locator('#title').isVisible().catch(() => false);
  const nonBlack = await p.evaluate(() => {
    const c = document.getElementById('gl');
    const gl = c.getContext('webgl2');
    const px = new Uint8Array(4);
    gl.readPixels(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return Array.from(px);
  });
  await p.screenshot({ path: OUT + '24-final-title.png' });
  console.log('INDEX status', r1.status(), 'titleVisible', title, 'centerPixel', nonBlack.join(','), 'muted', await p.evaluate(() => HX.Audio.muted()));

  await p.keyboard.press('Enter'); await p.waitForTimeout(1600);
  await p.keyboard.press('Escape'); await p.waitForTimeout(1200);
  await p.keyboard.press('Enter'); await p.waitForTimeout(1600);
  console.log('CAMPAIGN visible', await p.locator('#campaign').isVisible(), 'date', (await p.locator('#tbDate').textContent()).trim());
  await p.screenshot({ path: OUT + '25-final-campaign.png' });

  const r2 = await p.goto(BASE + '/cinematics.html?mute=1', { waitUntil: 'load' });
  await p.waitForTimeout(2200);
  const items = await p.locator('#cineList .cine-item').count();
  await p.locator('#cineList .cine-item').first().click();
  await p.waitForTimeout(2200);
  console.log('CINEMATICS status', r2.status(), 'items', items, 'playing', await p.evaluate(() => !!(HX.Cine && HX.Cine.state.active)));
  await p.screenshot({ path: OUT + '26-final-cine.png' });
  console.log('ERRS', errs.length ? JSON.stringify(errs.slice(0, 5)) : 'none');
  await b.close();
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
