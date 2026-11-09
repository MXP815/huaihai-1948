/* 本地无头浏览器实测（Edge headless + --mute-audio，页面带 ?mute=1 强制静默） */
const { chromium } = require('playwright-core');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = 'D:\\新\\淮海战役\\shots';
const URL = 'http://127.0.0.1:8012/index.html?mute=1';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const shot = async (page, name) => { await page.screenshot({ path: OUT + '\\' + name }); console.log('SHOT', name); };
const isCine = (page) => page.evaluate(() => !!(window.HX && HX.Cine && HX.Cine.state.active));

async function skipCine(page) {
  if (await isCine(page)) { await page.keyboard.press('Escape'); await page.waitForTimeout(900); }
}

async function pump(page, seconds) {
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000) {
    if (await isCine(page)) { await page.keyboard.press('Escape'); await page.waitForTimeout(1200); continue; }
    if (await page.locator('#modalWrap').isVisible()) {
      const t = await page.locator('#modalWrap').textContent();
      if (/战役复盘|结局/.test(t)) return 'ended';
    }
    await page.waitForTimeout(250);
  }
  return 'ok';
}

async function startGame(page) {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1600);
  await skipCine(page);
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter'); // 简报 -> 开始本阶段
  await page.waitForTimeout(1600);
}

(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: EDGE,
    args: ['--mute-audio', '--disable-features=AudioServiceOutOfProcess', '--use-angle=d3d11', '--enable-unsafe-swiftshader']
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await shot(page, '00-title.png');
  await startGame(page);
  console.log('campaign visible:', await page.locator('#campaign').isVisible());
  console.log('date:', (await page.locator('#tbDate').textContent()).trim());
  const metrics = await page.evaluate(() => {
    const r = HX.Game.renderer;
    return { stats: r.stats, quality: HX.Game.quality, muted: HX.Audio.muted(), ctx: !!(window.AudioContext) };
  });
  console.log('METRICS', JSON.stringify(metrics));
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); }
    requestAnimationFrame(f);
  }));
  console.log('HEADLESS FPS', fps);
  await shot(page, '01-campaign.png');

  // 多选 8 个华野部队 -> 包围 7 兵团
  for (const id of ['hy1', 'hy3', 'hy4', 'hy6', 'hy8', 'hy9', 'hyte', 'hy13']) {
    await page.locator(`#oob .unit-row[data-id="${id}"]`).click({ modifiers: ['Shift'] });
  }
  console.log('selected rows:', await page.locator('#oob .unit-row.sel').count());
  await page.locator('#unitCard [data-order="encircle"]').click();
  await page.waitForTimeout(200);
  await page.locator('#unitCard [data-target="k7"]').click();
  await page.waitForTimeout(300);
  await shot(page, '02-orders.png');

  // 4x 推进，途中跳过可能出现的过场
  await page.locator('[data-sp="3"]').click();
  const st1 = await pump(page, 6);
  console.log('pump1:', st1, 'cine?', await isCine(page), 't=', await page.evaluate(() => Math.round(HX.Game.sim.t)));
  await skipCine(page);
  if (await page.locator('#campaign').isVisible()) await page.locator('[data-sp="0"]').click({ force: true });
  await page.waitForTimeout(1200);
  const logs = await page.locator('#logList').textContent();
  const sur = await page.evaluate(() => { const k = HX.Game.sim.kmt.find((x) => x.id === 'k7'); return { surrounded: k.surrounded, strength: Math.round(k.strength), alive: k.alive }; });
  console.log('DATE', (await page.locator('#tbDate').textContent()).trim(), 'K7', JSON.stringify(sur), 'LOG_HAS_BESIEGE', /合围|被围/.test(logs));
  await shot(page, '03-encircle.png');

  // 总攻 -> 第一人称
  await skipCine(page);
  await page.locator('#btnAssault').click();
  await page.waitForTimeout(2500);
  console.log('FPS active:', await page.evaluate(() => !!HX.FPS.state.active), 'screen:', await page.locator('#fps-screen').isVisible());

  await shot(page, '04-fps-start.png');
  await page.mouse.click(800, 450);
  await page.waitForTimeout(400);
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(300);
  await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(1200);
  await shot(page, '05-fps.png');
  console.log('hp', await page.locator('#fpsHP').textContent().catch(() => '?'), 'ammo', await page.locator('#fpsAmmo').textContent().catch(() => '?'));
  console.log('pointer lock:', await page.evaluate(() => !!document.pointerLockElement));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  await pump(page, 2);
  console.log('back campaign:', await page.locator('#campaign').isVisible());

  // 舆图
  if (await page.locator('#campaign').isVisible()) {
    await page.keyboard.press('m');
    await page.waitForTimeout(1400);
    console.log('map visible:', await page.locator('#map2d-screen').isVisible(), 'sub:', (await page.locator('#map2dSub').textContent()).slice(0, 60));
    await shot(page, '06-map2d.png');
    await page.keyboard.press('m');
    await page.waitForTimeout(700);
    await page.locator('#oob .unit-row[data-id="hy9"]').click();
    await page.waitForTimeout(400);
    await shot(page, '07-unitcard.png');
    await page.keyboard.press('a');
    await page.waitForTimeout(1000);
    console.log('analysis visible:', await page.locator('#modalWrap').isVisible());
    await shot(page, '08-analysis.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // ---- 偏离史实：先打黄维(D1) + 战略转移(D7) ----
  await startGame(page);
  for (const id of ['zy1', 'zy2', 'zy4', 'zy6', 'zy11']) {
    await page.locator(`#oob .unit-row[data-id="${id}"]`).click({ modifiers: ['Shift'] });
  }
  await page.locator('#unitCard [data-order="attack"]').click();
  await page.waitForTimeout(200);
  const k12 = page.locator('#unitCard [data-target="k12"]');
  console.log('k12 target visible:', await k12.isVisible().catch(() => false));
  if (await k12.isVisible().catch(() => false)) await k12.click();
  await page.waitForTimeout(600);
  console.log('div count:', await page.evaluate(() => HX.Game.sim.divergences.map((d) => d.key).join(',')),
    'tag:', (await page.locator('#divTag').textContent()).trim());
  await shot(page, '09-divergence.png');

  await page.locator('#btnTransfer').click();
  await page.waitForTimeout(800);
  console.log('transfer modal visible:', await page.locator('#modalWrap').isVisible(), 'btns:', await page.locator('#modalWrap [data-cb]').count());
  await page.locator('[data-cb="doTransfer"]').click();
  const st2 = await pump(page, 10);
  console.log('pump2:', st2);
  console.log('OUTCOME visible:', await page.locator('#modalWrap').isVisible());
  const mtxt = await page.locator('#modalWrap').textContent().catch(() => '');
  console.log('OUTCOME text:', mtxt.replace(/\s+/g, ' ').slice(0, 600));
  console.log('SIM OUTCOME', JSON.stringify(await page.evaluate(() => {
    const s = HX.Game.sim;
    return { ended: s.ended, kind: s.outcome && s.outcome.kind, divs: s.divergences.map((d) => d.key) };
  })));
  await shot(page, '10-outcome-dev.png');

  // ---- 独立过场页 ----
  await page.goto('http://127.0.0.1:8012/cinematics.html?mute=1', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  console.log('cine menu visible:', await page.locator('#cine-menu').isVisible(), 'items:', await page.locator('#cineList .cine-item').count().catch(() => '?'));
  await shot(page, '11-cinematics-menu.png');
  await page.locator('#cineList .cine-item').first().click();
  await page.waitForTimeout(2500);
  console.log('standalone cine active:', await isCine(page));
  await shot(page, '12-cinematics-play.png');

  console.log('ERRORS:', errors.length ? JSON.stringify(errors, null, 1) : 'none');
  await browser.close();
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
