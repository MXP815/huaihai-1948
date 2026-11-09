/* 全流程验证：三章依次推进到结局（headless + --mute-audio + ?mute=1） */
const { chromium } = require('playwright-core');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://127.0.0.1:8012/index.html?mute=1';
const OUT = 'D:\\新\\淮海战役\\shots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const errs = [];
const isCine = (p) => p.evaluate(() => !!(window.HX && HX.Cine && HX.Cine.state.active));
const state = (p) => p.evaluate(() => {
  const s = HX.Game.sim;
  const q = (id) => { const k = s.kmt.find((x) => x.id === id); return k ? { alive: k.alive, str: Math.round(k.strength), sur: k.surrounded } : null; };
  return { t: Math.round(s.t), date: HX.Sim.dateLabel(s.t), phase: s.phase, ended: s.ended,
    k7: q('k7'), k12: q('k12'), k2: q('k2'), k13: q('k13'), k16: q('k16'),
    cas: Math.round(s.casualties.pla), count: s.pla.filter((u) => !u.dead).length };
});
async function skipCine(p) {
  for (let i = 0; i < 4; i++) {
    if (!(await isCine(p))) return;
    await p.keyboard.press('Escape');
    await p.waitForTimeout(900);
  }
}
async function selectAndOrder(p, ids, order, target) {
  for (const id of ids) {
    const row = p.locator(`#oob .unit-row[data-id="${id}"]`);
    if (await row.count()) await row.click({ modifiers: ['Shift'], force: true }).catch(() => {});
  }
  await p.waitForTimeout(200);
  const ob = p.locator(`#unitCard [data-order="${order}"]`);
  if (!(await ob.count())) return false;
  await ob.click();
  await p.waitForTimeout(200);
  const tb = p.locator(`#unitCard [data-target="${target}"]`);
  if (!(await tb.count())) return false;
  await tb.click();
  await p.waitForTimeout(250);
  return true;
}
async function pumpUntil(p, pred, maxMs, label) {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < maxMs) {
    if (await isCine(p)) { await skipCine(p); continue; }
    if (await p.locator('#modalWrap').isVisible().catch(() => false)) {
      const txt = await p.locator('#modalWrap').textContent().catch(() => '');
      if (/战役复盘|结局/.test(txt)) return 'ended';
    }
    const st = await state(p);
    const key = st.phase + '|' + (st.k7 && st.k7.alive) + '|' + (st.k12 && st.k12.alive) + '|' + st.ended;
    if (key !== last) { console.log('[' + label + ']', JSON.stringify(st)); last = key; }
    if (await pred(st)) return st;
    if (st.ended) return st;
    await p.waitForTimeout(700);
  }
  console.log('[' + label + '] timeout');
  return null;
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE, args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1400);
  await skipCine(page);
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  console.log('start', JSON.stringify(await state(page)));

  // ---------- 第一章：围歼 k7 ----------
  await selectAndOrder(page, ['hy1', 'hy3', 'hy4', 'hy6', 'hy8', 'hy9', 'hyte', 'hy13'], 'encircle', 'k7');
  await page.locator('[data-sp="3"]').click();
  const p1 = await pumpUntil(page, (st) => st.phase >= 2, 180000, 'ch1');
  console.log('CH1 RESULT', JSON.stringify(p1));
  await skipCine(page);
  await page.screenshot({ path: OUT + '\\15-chapter1-cleared.png' });

  // ---------- 第二章：围歼 k12 ----------
  await page.waitForTimeout(600);
  const phaseNow = (await state(page)).phase;
  if (phaseNow >= 2) {
    if (await page.locator('#oob .unit-row[data-id="hy9"]').count()) {
      const ok = await selectAndOrder(page, ['zy1', 'zy2', 'zy4', 'zy6', 'zy11', 'hy4', 'hy8', 'hy9'], 'encircle', 'k12');
      console.log('ch2 order issued', ok);
    }
    if (await page.locator('[data-sp="3"]').count()) await page.locator('[data-sp="3"]').click();
    const p2 = await pumpUntil(page, (st) => st.phase >= 3, 200000, 'ch2');
    console.log('CH2 RESULT', JSON.stringify(p2));
    await skipCine(page);
    await page.screenshot({ path: OUT + '\\16-chapter2-cleared.png' });
  }

  // ---------- 第三章：围歼杜聿明集团 ----------
  await page.waitForTimeout(600);
  const st3 = await state(page);
  if (st3.phase >= 3 && !st3.ended) {
    const ids = await page.evaluate(() => HX.Game.sim.pla.filter((u) => !u.dead && u.strength > 0).map((u) => u.id));
    console.log('ch3 alive units', ids.length);
    const a = ids.slice(0, Math.ceil(ids.length / 3));
    const b = ids.slice(a.length, a.length + Math.ceil(ids.length / 3));
    const c = ids.slice(a.length + b.length);
    // 先合围 k2；k13/k16 在徐州方向，一同压上
    const targets = await page.evaluate(() => HX.Game.sim.kmt.filter((k) => ['k2', 'k13', 'k16'].includes(k.id) && k.alive).map((k) => k.id));
    console.log('ch3 targets', targets);
    if (targets.includes('k2')) await selectAndOrder(page, a, 'encircle', 'k2');
    if (targets.includes('k13')) await selectAndOrder(page, b, 'encircle', 'k13');
    if (targets.includes('k16')) await selectAndOrder(page, c, 'encircle', 'k16');
    if (await page.locator('[data-sp="3"]').count()) await page.locator('[data-sp="3"]').click();
    const p3 = await pumpUntil(page, () => false, 260000, 'ch3');
    console.log('CH3 RESULT', JSON.stringify(p3));
    await skipCine(page);
    await page.screenshot({ path: OUT + '\\17-chapter3-end.png' });
  }

  // ---------- 结局面板 ----------
  await skipCine(page);
  await page.waitForTimeout(1200);
  const modal = await page.locator('#modalWrap').isVisible().catch(() => false);
  console.log('OUTCOME MODAL', modal);
  if (modal) {
    const txt = (await page.locator('#modalWrap').textContent()).replace(/\s+/g, ' ').slice(0, 700);
    console.log('OUTCOME TEXT', txt);
    await page.screenshot({ path: OUT + '\\18-full-outcome.png' });
  }
  const final = await page.evaluate(() => {
    const s = HX.Game.sim;
    return { ended: s.ended, outcome: s.outcome && { id: s.outcome.id, title: s.outcome.title, grade: s.outcome.grade, left: s.outcome.left, casRate: +s.outcome.casRate.toFixed(3) }, date: HX.Sim.dateLabel(s.t), divs: s.divergences.map((d) => d.key), stats: HX.Game.renderer.stats };
  });
  console.log('FINAL', JSON.stringify(final));
  console.log('ERRS', errs.length ? JSON.stringify(errs.slice(0, 6)) : 'none');
  await browser.close();
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
