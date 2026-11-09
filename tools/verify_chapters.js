const { chromium } = require('playwright-core');
const os = require('os');
const path = require('path');
const fs = require('fs');

const TMP = path.join(os.tmpdir());
const SHOTS = [
  ['chap-01-panorama.png', 1, [68, -6], 120, 0.72, 0.86],
  ['chap-02-panorama.png', 2, [-35.7, 120.9], 128, 0.62, 0.42],
  ['chap-03-panorama.png', 3, [-68, 36.1], 100, 0.58, -0.55],
  ['chap-close-01-moat.png', 1, [68, -6], 34, 0.46, 2.35],
  ['chap-close-02-ring.png', 2, [-35.7, 120.9], 42, 0.50, 1.90]
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
  for (let i = 0; i < 12; i++) {
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

  // ---- 三章环境统计 ----
  const envData = await page.evaluate(() => {
    const W = HX.World, D = HX.DATA, G = HX.Game;
    function inArea(x, z, a) { return a && x > a.x - a.w / 2 && x < a.x + a.w / 2 && z > a.z - a.h / 2 && z < a.z + a.h / 2; }
    function stats(id) {
      G.setChapter(id, false);
      const ch = D.CHAPTERS[id];
      const camp = G.campaign;
      const trees = (camp.trees || []).filter((t) => inArea(t.x, t.z, ch.area)).length;
      const kinds = {};
      for (const s of camp.staticList) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
      const a = ch.area;
      let hmin = 1e9, hmax = -1e9, water = 0, samples = 0;
      for (let x = a.x - 14; x <= a.x + 14; x += 2) {
        for (let z = a.z - 14; z <= a.z + 14; z += 2) {
          const d = Math.hypot(x - a.x, z - a.z);
          if (d > 14) continue;
          const h = W.heightAt(x, z);
          hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
          if (W.waterZoneT && W.waterZoneT(x, z) > 0.05) water++;
          samples++;
        }
      }
      return {
        id, paletteId: camp.paletteId, terrain: ch.terrain,
        areaUnits: [ch.area.w, ch.area.h],
        areaKm: [+(ch.area.w * 0.8).toFixed(1), +(ch.area.h * 0.8).toFixed(1)],
        treesInArea: trees,
        hydroMeshes: kinds.hydro || 0,
        heightRange: +(hmax - hmin).toFixed(2),
        waterCells: water, samples,
        cover: ch.cover, hydro: ch.hydro, axes: ch.axes,
        strongpoints: ch.density.strongpointRing, airdrop: ch.density.airdrop
      };
    }
    const all = [stats(1), stats(2), stats(3)];
    const cg = D.ENCIRCLE.chenguangzhuang;
    return {
      chapters: all,
      encircle: { rx: cg.rx, rz: cg.rz, ewKm: +(cg.rx * 2 * 0.8).toFixed(3), nsKm: +(cg.rz * 2 * 0.8).toFixed(3) },
      palettesDiffer: new Set(all.map((c) => c.paletteId)).size === 3
    };
  });

  // ---- 反事实分支（直接驱动 S.create，不走 UI） ----
  const branches = await page.evaluate(() => {
    const S = HX.Sim, D = HX.DATA;
    const SQ = [-35.7, 120.9];
    const SW = [[-6, 6], [-20, 13], [-36, 21], [-52, 28], [-64, 33]];
    function setup(opts) {
      const s = S.create();
      s.phase = 2;
      s.t = 456; // 11.25
      s.railCut = 1;
      s.running = true;
      s.speed = 1;
      const ids = ['k7', 'k12', 'k2', 'k13', 'k16', 'kzu'];
      // 第7兵团仍在碾庄（远离测试战场，不参与反应判定）
      const k7 = s.kmt.find((k) => k.id === 'k7');
      if (k7) { k7.dest = null; }
      const k12 = s.kmt.find((k) => k.id === 'k12');
      k12.alive = true; k12.x = SQ[0]; k12.z = SQ[1]; k12.dest = null; k12.reactMode = null;
      k12.strength = Math.max(k12.strength, 110000); k12.entrench = 2;
      const kzu = s.kmt.find((k) => k.id === 'kzu');
      kzu.alive = true; kzu.x = 0; kzu.z = 0; kzu.dest = null; kzu.reactMode = null;
      for (const id of ['k2', 'k13', 'k16']) {
        const k = s.kmt.find((x) => x.id === id);
        k.alive = true; k.reactMode = null; k.dest = null;
      }
      // 所有我军先搬离，制造干净初始态势
      for (const p of s.pla) { p.order = null; p.path = null; p.dest = null; p.x = -195; p.z = 198; }
      // 宿县控制部队（维持 railCut）
      s.pla[21].x = -23.1; s.pla[21].z = 87.6;
      // 围住双堆集：cover 8 / 4
      const ring = opts.ring;
      for (let i = 0; i < ring; i++) {
        const p = s.pla[i];
        const a = i / ring * Math.PI * 2 + 0.1;
        p.x = SQ[0] + Math.cos(a) * 11.6;
        p.z = SQ[1] + Math.sin(a) * 11.6;
      }
      // 提前封堵西南通道（3 个纵队）
      if (opts.blockSW) {
        for (let i = 0; i < 3; i++) {
          const p = s.pla[16 + i];
          p.x = SW[i][0]; p.z = SW[i][1];
        }
      }
      return s;
    }
    function run(s, ticks) {
      const startPos = {};
      for (const k of s.kmt) if (['k12', 'k2', 'k13', 'k16', 'kzu'].includes(k.id)) startPos[k.id] = [k.x, k.z];
      for (let i = 0; i < ticks; i++) S.update(s, 0.25);
      const moves = {};
      for (const k of s.kmt) if (startPos[k.id]) {
        moves[k.id] = {
          reactMode: k.reactMode || null,
          dest: k.dest ? [+k.dest.x.toFixed(1), +k.dest.z.toFixed(1)] : null,
          movedUnit: +Math.hypot(k.x - startPos[k.id][0], k.z - startPos[k.id][1]).toFixed(2),
          pos: [+k.x.toFixed(1), +k.z.toFixed(1)],
          entrench: +(k.entrench || 0).toFixed(1),
          surrounded: !!k.surrounded,
          cover: k.cover
        };
      }
      const reactions = s.enemyLog.map((r) => ({
        id: r.id, kmt: r.kmt, status: r.status || 'triggered',
        t: +r.t.toFixed(1), intelAge: r.intelAge, intelConf: r.intelConf,
        cover: r.cover, swBlocked: r.swBlocked
      }));
      return { moves, reactions, flags: { xuzhouMode: s.flags.xuzhouMode || null, liaoDefect: !!s.flags.liaoDefect, liaoMissed: !!s.flags.liaoMissed }, t: +s.t.toFixed(1), phase: s.phase };
    }

    // A: 西南通道开放（对照）→ 应向陈官庄撤退
    const aOpen = run(setup({ ring: 8, blockSW: false }), 40);
    // A2: 西南通道提前封堵 → 应就地固守/改向东南
    const aBlock = run(setup({ ring: 8, blockSW: true }), 40);
    // B: 围而不打（cover 4，不合围）→ 黄维应尝试向东南突围
    const bLoose = run(setup({ ring: 4, blockSW: false }), 40);
    // B2: 收紧包围（cover 8）→ 猬集固守
    const bTight = run(setup({ ring: 8, blockSW: false }), 40);
    // C: 廖运周起义（到点 + 合围）
    const cDefect = (() => {
      const s = setup({ ring: 6, blockSW: false });
      s.t = 500;
      for (let i = 0; i < 18; i++) S.update(s, 0.25);
      return {
        liaoDefect: !!s.flags.liaoDefect, liaoGap: !!s.flags.liaoGap,
        strength: Math.round(s.kmt.find((k) => k.id === 'k12').strength),
        reactions: s.enemyLog.map((r) => ({ id: r.id, status: r.status || 'triggered', cover: r.cover, intelAge: r.intelAge })),
        assaultGap: s.flags.liaoGap ? 1.25 : 1
      };
    })();
    // C2: 未合围 → 不触发
    const cNo = (() => {
      const s = setup({ ring: 3, blockSW: false });
      s.t = 500;
      for (let i = 0; i < 18; i++) S.update(s, 0.25);
      return {
        liaoDefect: !!s.flags.liaoDefect, liaoMissed: !!s.flags.liaoMissed,
        reactions: s.enemyLog.map((r) => ({ id: r.id, status: r.status || 'triggered', cover: r.cover }))
      };
    })();
    return { aOpen, aBlock, bLoose, bTight, cDefect, cNo };
  });

  // ---- 回归：环壕、节奏、存档 ----
  const regression = await page.evaluate(() => {
    const S = HX.Sim, D = HX.DATA;
    const nz = D.NIANZHUANG;
    const hopCross = S.pathInfo([[nz.x + nz.rx * 0.95, nz.z], [nz.x + nz.rx * 1.05, nz.z]], null);
    const hopOut = S.pathInfo([[nz.x + 8, nz.z], [nz.x + 8.7, nz.z]], null);
    const s = S.create();
    S.setPace(s, 0); const p0 = S.pacing(s).name;
    S.setPace(s, 1); const p1 = S.pacing(s).name;
    S.setPace(s, 2); const p2 = S.pacing(s).name;
    s.t = 123.5; s.phase = 2;
    s.enemyLog = [{ t: 100, id: 'huangwei_hedgehog' }];
    s.situations = [{ t: 102, snap: { k12: { t: 102, cover: 7, n: 8 } } }];
    const snapText = S.serialize(s);
    const saved = JSON.parse(snapText).sim;
    const rs = S.restore(snapText);
    const moatCross = +((hopCross.hours / hopOut.hours)).toFixed(2);
    function cas(open) {
      const x = S.create(); x.flags.nzMoatBroken = open ? 1 : 0;
      const k = x.kmt.find((k) => k.id === 'k7'); const s0 = k.strength;
      S.applyBattle(x, 'k7', { win: true, kills: 10, casualties: 100 });
      return { pla: Math.round(x.casualties.pla), kmt: Math.round(s0 - k.strength) };
    }
    return {
      moat: { timeMul: moatCross, impassable: D.MOATS[0].impassable, w: D.MOATS[0].w },
      hard: cas(false), soft: cas(true),
      pace: [p0, p1, p2],
      save: { t: saved.t, phase: saved.phase, restoredT: rs.t, restoredPhase: rs.phase, enemyLog: (rs.enemyLog || []).length, situations: (rs.situations || []).length }
    };
  });

  // ---- 截图：逐章设置章节与代表兵力 ----
  for (const [name, cid, [tx, tz], dist, pitch, yaw] of SHOTS) {
    await page.evaluate(({ cid, tx, tz }) => {
      const sim = HX.Game.sim, G = HX.Game;
      G.setChapter(cid, false);
      sim.phase = cid;
      if (cid === 2) {
        const k12 = sim.kmt.find((k) => k.id === 'k12');
        k12.alive = true; k12.x = -35.7; k12.z = 120.9; k12.sectors = null; k12.cover = 0;
        sim.intel.k12 = { x: -35.7, z: 120.9, strength: k12.strength, time: sim.t, conf: 92, source: '目视' };
      }
      if (cid === 3) {
        const spots = { k2: [-73.4, 36.2], k13: [-68.0, 38.9], k16: [-62.6, 34.6], kzu: [-69.6, 33.4] };
        for (const k of sim.kmt) {
          if (spots[k.id]) {
            k.alive = true; k.x = spots[k.id][0]; k.z = spots[k.id][1]; k.surrounded = true; k.cover = 0; k.sectors = null;
            sim.intel[k.id] = { x: k.x, z: k.z, strength: k.strength, time: sim.t, conf: 92, source: '目视' };
          }
        }
      }
      sim.running = false; sim.speed = 0;
    }, { cid, tx, tz });
    await page.waitForTimeout(800);
    await page.evaluate(({ dist, tx, tz, pitch, yaw }) => HX.Game.setCam(tx, tz, dist, pitch, yaw), { dist, tx, tz, pitch, yaw });
    await page.waitForTimeout(1500);
    await page.locator('#gl').screenshot({ path: path.join(TMP, name) });
  }

  const dest = 'D:\\新\\淮海战役\\shots\\';
  for (const [n] of SHOTS) {
    try { fs.copyFileSync(path.join(TMP, n), path.join(dest, n)); } catch (e) { errs.push('COPY ' + n + ' ' + e.message); }
  }
  const report = { envData, branches, regression, errs };
  fs.writeFileSync(path.join('D:\\新\\淮海战役\\tools', 'verify_chapters.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
