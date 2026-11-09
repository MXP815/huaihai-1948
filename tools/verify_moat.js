const { chromium } = require('playwright-core');
const os = require('os');
const path = require('path');
const fs = require('fs');

const TMP = path.join(os.tmpdir());
const SHOTS = [
  ['moat-01-nianzhuang-close.png', 34, [68, -6], 0.46, 2.35],
  ['moat-02-shuangduiji-open.png', 52, [-35.7, 120.9], 0.50, 1.85],
  ['moat-03-chenguangzhuang-open.png', 52, [-68, 36.1], 0.95, 0.0]
];

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--mute-audio', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGE ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CON ' + m.text()); });

  await page.goto('http://127.0.0.1:8012/index.html?mute=1&cb=' + Date.now(), { waitUntil: 'load' });
  await page.waitForFunction(() => window.HX && HX.Game && HX.Game.renderer, { timeout: 30000 });
  await page.evaluate(() => document.getElementById('btnStart').click());
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(500);
    const mode = await page.evaluate(() => HX.Game.mode);
    if (mode === 'campaign') break;
    if (mode === 'cine') await page.keyboard.press('Escape');
  }
  await page.waitForFunction(() => HX.Game.mode === 'campaign', { timeout: 20000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = document.querySelector('[data-cb="startPhase"]'); if (b) b.click(); });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const b = document.querySelector('#modalWrap [data-cb="closeModal"], .modal-close');
    if (b) b.click();
    HX.Game.sim.running = false; HX.Game.sim.speed = 0;
  });
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '#campaign .topbar,#campaign .panel{display:none!important}';
    document.head.appendChild(st);
  });
  await page.waitForTimeout(500);

  const data = await page.evaluate(() => {
    const W = HX.World, D = HX.DATA, S = HX.Sim;
    const nz = D.NIANZHUANG;
    const centerH = W.heightAt(nz.x, nz.z);
    const outH = W.heightAt(nz.x + 10, nz.z);
    const trenchH = W.heightAt(nz.x + nz.rx * 1.05, nz.z);
    const hopCross = S.pathInfo([[nz.x + nz.rx * 0.95, nz.z], [nz.x + nz.rx * 1.05, nz.z]], null);
    const hopOut = S.pathInfo([[nz.x + 8, nz.z], [nz.x + 8.7, nz.z]], null);
    const direct = S.pathInfo([[nz.x - nz.rx - 3, nz.z], [nz.x, nz.z]], null);
    const detour = S.pathInfo([
      [nz.x - nz.rx - 3, nz.z], [nz.x - nz.rx - 3, nz.z - nz.rz - 3],
      [nz.x, nz.z - nz.rz - 3], [nz.x, nz.z]
    ], null);

    function run(open) {
      const s = S.create();
      s.flags.nzMoatBroken = open ? 1 : 0;
      const k = s.kmt.find((x) => x.id === 'k7');
      const s0 = k.strength;
      S.applyBattle(s, 'k7', { win: true, kills: 10, casualties: 100 });
      return { cas: Math.round(s.casualties.pla), cut: Math.round(s0 - k.strength) };
    }
    const hard = run(false), soft = run(true);
    function cfg(open) {
      const s = S.create();
      s.flags.nzMoatBroken = open ? 1 : 0;
      const c = S.assaultConfig(s, 'k7');
      return { hp: c.playerHP, limit: c.limit, penalty: c.moatPenalty, text: c.moatText };
    }
    const openStats = (D.OPEN_ZONES || []).map((o) => {
      let min = 1e9, max = -1e9, maxAbsH = 0;
      for (let dx = -12; dx <= 12; dx += 0.5) {
        for (let dz = -12; dz <= 12; dz += 0.5) {
          if (dx * dx + dz * dz > 144) continue;
          const h = W.heightAt(o.x + dx, o.z + dz);
          min = Math.min(min, h); max = Math.max(max, h); maxAbsH = Math.max(maxAbsH, Math.abs(h + 3));
        }
      }
      const trees = (HX.Game.campaign.trees || []).filter((t) => Math.hypot(t.x - o.x, t.z - o.z) < o.r).length;
      let waterZone = 0;
      for (let dx = -12; dx <= 12; dx += 1) for (let dz = -12; dz <= 12; dz += 1) {
        if (dx * dx + dz * dz > 144) continue;
        if (W.waterZoneT && W.waterZoneT(o.x + dx, o.z + dz) > 0.05) waterZone++;
      }
      return { name: o.name, range: +(max - min).toFixed(2), trees, waterCells: waterZone };
    });
    const cg = D.ENCIRCLE.chenguangzhuang;
    const kinds = {};
    for (const s of (HX.Game.campaign.staticList || [])) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
    return {
      meshKinds: kinds,
      centerH: +centerH.toFixed(2), outH: +outH.toFixed(2), trenchH: +trenchH.toFixed(2),
      hopCrossH: +hopCross.hours.toFixed(2), hopOutH: +hopOut.hours.toFixed(2),
      hopRatio: +(hopCross.hours / hopOut.hours).toFixed(2),
      direct: { km: +direct.km.toFixed(2), h: +direct.hours.toFixed(2), rail: +direct.railKm.toFixed(2) },
      detour: { km: +detour.km.toFixed(2), h: +detour.hours.toFixed(2) },
      hard, soft, cfgHard: cfg(false), cfgSoft: cfg(true),
      openStats,
      encircle: { rx: cg.rx, rz: cg.rz, ewKm: +(cg.rx * 2 * 0.8).toFixed(2), nsKm: +(cg.rz * 2 * 0.8).toFixed(2) },
      moat: { rx: nz.rx, rz: nz.rz, w: D.MOATS[0].w, impassable: D.MOATS[0].impassable },
      moatConst: S.MOAT,
      phase: HX.Game.sim.phase
    };
  });

  for (const [name, dist, [tx, tz], pitch, yaw] of SHOTS) {
    await page.evaluate(({ dist, tx, tz, pitch, yaw }) => {
      HX.Game.setCam(tx, tz, dist, pitch, yaw);
    }, { dist, tx, tz, pitch, yaw });
    await page.waitForTimeout(1600);
    await page.locator('#gl').screenshot({ path: path.join(TMP, name) });
  }

  // 碾庄俯视：确认环壕与台地几何存在
  await page.evaluate(() => HX.Game.setCam(68, -6, 30, 0.98, 0.0));
  await page.waitForTimeout(1400);
  await page.locator('#gl').screenshot({ path: path.join(TMP, 'moat-01b-top.png') });

  // 第三阶段：陈官庄集团合围圈
  await page.evaluate(() => {
    const sim = HX.Game.sim;
    sim.phase = 3;
    const spots = { k2: [-73.4, 36.2], k13: [-68.0, 38.9], k16: [-62.6, 34.6], kzu: [-69.6, 33.4] };
    for (const k of sim.kmt) {
      if (['k2', 'k13', 'k16', 'kzu'].includes(k.id)) {
        const sp = spots[k.id];
        k.alive = true; k.x = sp[0]; k.z = sp[1]; k.surrounded = true;
        k.cover = 0; k.sectors = null; // 截图时收起扇形封锁标绘，避免遮住合围椭圆
        sim.intel[k.id] = { x: sp[0], z: sp[1], strength: k.strength, time: sim.t, conf: 92, source: '目视' };
      }
    }
    HX.Game.setCam(-68, 36.1, 52, 0.95, 0.0);
  });
  await page.waitForTimeout(1800);
  await page.locator('#gl').screenshot({ path: path.join(TMP, 'moat-03-chenguangzhuang-open.png') });

  const dest = 'D:\\新\\淮海战役\\shots\\';
  for (const n of ['moat-01-nianzhuang-close.png', 'moat-01b-top.png', 'moat-02-shuangduiji-open.png', 'moat-03-chenguangzhuang-open.png']) {
    try { fs.copyFileSync(path.join(TMP, n), path.join(dest, n)); } catch (e) { errs.push('COPY ' + n + ' ' + e.message); }
  }
  console.log(JSON.stringify({ data, errs }, null, 2));
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
