/* 存档链路端到端实测（浏览器 → REST → 数据库），两阶段：
   HX_E2E=save     进入战役 → 保存 → 记录服务端返回与前端 state 快照
   HX_E2E=restore  重启后端后打开页面 → 继续上次战役 → 与快照逐字段比对 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.HX_BASE || 'http://127.0.0.1:8080';
const URL = BASE + '/index.html?mute=1';
const OUT = path.join(__dirname, 'e2e');
const MODE = process.env.HX_E2E || 'save';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const snapshotExpr = `(() => {
  const s = HX.Sim.serialize(HX.Game.sim);
  const o = JSON.parse(s);
  return { raw: s, sim: o.sim };
})()`;

async function startGame(page) {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1600);
  for (let i = 0; i < 4; i++) {
    const cine = await page.evaluate(() => !!(window.HX && HX.Cine && HX.Cine.state && HX.Cine.state.active));
    if (!cine) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter'); // 简报 -> 开始本阶段
  await page.waitForTimeout(2000);
  // 让战局真正推进（默认暂停）：直接置为最高速度
  await page.evaluate(() => {
    if (window.HX && HX.Game && HX.Game.sim) {
      HX.Game.sim.speed = 3;
      HX.Game.sim.running = true;
    }
  });
}

function summarize(sim) {
  return {
    t: sim.t,
    phase: sim.phase,
    plaCount: (sim.pla || []).length,
    plaIds: (sim.pla || []).map((p) => p.id).slice(0, 12),
    enemyLogCount: (sim.enemyLog || []).length,
    logsCount: (sim.logs || []).length,
    divergences: (sim.divergences || []).map((d) => d.key),
    flags: sim.flags,
    casualties: sim.casualties,
    enemyCount: sim.enemy ? Object.keys(sim.enemy).length : undefined
  };
}

(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: EDGE,
    args: ['--mute-audio', '--enable-unsafe-swiftshader', '--use-angle=d3d11', '--window-size=1440,900']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const httpCalls = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (!u.includes('/api/')) return;
    let body = null;
    try { body = await res.text(); } catch (e) {}
    httpCalls.push({ method: res.request().method(), url: u, status: res.status(), body });
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  if (MODE === 'save') {
    await startGame(page);
    await page.waitForTimeout(30000);
    await page.click('#btnSave');
    await page.waitForTimeout(2500);
    const snap = await page.evaluate(snapshotExpr);
    const list = await (await fetch(BASE + '/api/saves')).json();
    const detail = await (await fetch(BASE + '/api/saves/manual')).json();
    if (!detail || !detail.state) throw new Error('数据库里没有 manual 存档');
    // 以数据库里的实际内容为准（页面在保存后仍可能继续推进时间）
    const dbSnap = { raw: JSON.stringify(detail.state), sim: detail.state.sim };
    const report = {
      mode: 'save',
      savedAt: new Date().toISOString(),
      httpCalls,
      list,
      detailStatus: 'ok',
      detailVersion: detail.version,
      detailSlotName: detail.slotName,
      summary: summarize(dbSnap.sim),
      pageSummaryAfterSave: summarize(snap.sim),
      rawBytes: Buffer.byteLength(dbSnap.raw, 'utf8'),
      errors,
      expected: dbSnap
    };
    fs.writeFileSync(path.join(OUT, 'expected.json'), JSON.stringify(report.expected));
    fs.writeFileSync(path.join(OUT, 'save_report.json'), JSON.stringify(report, null, 2));
    await page.screenshot({ path: path.join(OUT, 'save_shot.png') });
    console.log('SAVE OK version=' + detail.version + ' t=' + dbSnap.sim.t.toFixed(2) + ' phase=' + dbSnap.sim.phase +
      ' pla=' + dbSnap.sim.pla.length + ' enemyLog=' + (dbSnap.sim.enemyLog || []).length +
      ' logs=' + (dbSnap.sim.logs || []).length + ' bytes=' + report.rawBytes +
      ' pageT=' + snap.sim.t.toFixed(2));
  } else {
    const expected = JSON.parse(fs.readFileSync(path.join(OUT, 'expected.json'), 'utf8'));
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(3500);   // 等探活把“继续上次战役”显示出来
    await page.click('#btnResume');
    await page.waitForTimeout(3000);
    const after = await page.evaluate(snapshotExpr);
    const detail = await (await fetch(BASE + '/api/saves/manual')).json();
    const diffs = [];
    const a = expected.sim, b = after.sim;
    const cmp = (name, x, y) => {
      const xs = JSON.stringify(x), ys = JSON.stringify(y);
      diffs.push({ field: name, same: xs === ys, before: xs && xs.length > 400 ? xs.slice(0, 400) + '…' : xs, after: ys && ys.length > 400 ? ys.slice(0, 400) + '…' : ys });
    };
    cmp('t', a.t, b.t);
    cmp('phase', a.phase, b.phase);
    cmp('pla', a.pla, b.pla);
    cmp('enemyLog', a.enemyLog, b.enemyLog);
    cmp('divergences', a.divergences, b.divergences);
    cmp('logs', a.logs, b.logs);
    cmp('flags', a.flags, b.flags);
    cmp('casualties', a.casualties, b.casualties);
    // speed 是读档后被 UI.speedUI(0) 主动暂停，属于设计行为，单独记录
    cmp('speed', a.speed, b.speed);
    cmp('rawJSON', JSON.stringify(a), JSON.stringify(b));
    const gameplayFieldsSame = diffs
      .filter((d) => d.field !== 'rawJSON' && d.field !== 'speed')
      .every((d) => d.same);
    const report = {
      mode: 'restore',
      restoredAt: new Date().toISOString(),
      httpCalls,
      dbVersion: detail.version,
      summary: summarize(b),
      gameplayFieldsSame,
      allSame: diffs.every((d) => d.same),
      note: 'speed 在读档后被 UI.speedUI(0) 主动归零以暂停战局；rawJSON 的差异仅此一处',
      diffs,
      errors
    };
    fs.writeFileSync(path.join(OUT, 'restore_report.json'), JSON.stringify(report, null, 2));
    await page.screenshot({ path: path.join(OUT, 'restore_shot.png') });
    console.log('RESTORE gameplayFieldsSame=' + gameplayFieldsSame + ' allSame=' + report.allSame +
      ' t=' + b.t.toFixed(2) + ' phase=' + b.phase +
      ' pla=' + b.pla.length + ' enemyLog=' + (b.enemyLog || []).length + ' logs=' + (b.logs || []).length);
    diffs.filter((d) => !d.same).forEach((d) => console.log('DIFF ' + d.field));
  }
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
