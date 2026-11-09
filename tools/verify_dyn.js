/* 动态三维地图 / 手绘路线 / 任务式指挥 验收（headless + --mute-audio + ?mute=1） */
const { chromium } = require('playwright-core');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://127.0.0.1:8012/index.html?mute=1';
const OUT = 'D:\\新\\淮海战役\\shots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const errs = [];
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function start(p) {
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(2400);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(1200);
  for (let i = 0; i < 4; i++) {
    if (!(await p.evaluate(() => !!(window.HX && HX.Cine && HX.Cine.state.active)))) break;
    await p.keyboard.press('Escape');
    await p.waitForTimeout(800);
  }
  await p.waitForTimeout(700);
  if (!(await p.evaluate(() => HX.Game.mode === 'campaign'))) {
    await p.keyboard.press('Enter');
    await p.waitForTimeout(1000);
  }
  await p.waitForTimeout(600);
  await p.evaluate(() => HX.UI.closeModal());
  await p.waitForTimeout(300);
}
function log(st) { console.log(JSON.stringify(st)); }

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE, args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  try {
    await start(page);
    log(await page.evaluate(() => ({ mode: HX.Game.mode, t: HX.Game.sim.t, units: HX.Game.sim.pla.length })));

    // 1) 包围命令：刚下 / 行进中 / 合围完成
    await page.evaluate(() => {
      const sim = HX.Game.sim;
      sim.speed = 0;
      HX.Sim.command(sim, ['hy1', 'hy4', 'hy9', 'hy13', 'hy3', 'hy6'], 'encircle', { kmtId: 'k7' });
      HX.Game.sel = ['hy1'];
      HX.UI.update(sim, ['hy1']);
    });
    await sleep(700);
    await shot(page, 'dyn-01-command-issued');

    await page.evaluate(() => { HX.Game.sim.speed = 3; });
    await sleep(800);
    await shot(page, 'dyn-02-advancing');
    log(await page.evaluate(() => ({ t: HX.Game.sim.t, cover: HX.Game.sim.kmt.find((k) => k.id === 'k7').cover, sur: HX.Game.sim.kmt.find((k) => k.id === 'k7').surrounded })));

    await sleep(2600);
    await page.evaluate(() => { HX.Game.sim.speed = 0; });
    await sleep(500);
    await shot(page, 'dyn-03-encircled');
    log(await page.evaluate(() => ({ t: HX.Game.sim.t, cover: HX.Game.sim.kmt.find((k) => k.id === 'k7').cover, sur: HX.Game.sim.kmt.find((k) => k.id === 'k7').surrounded })));

    // 帧率：加速运行中测 1.5s
    await page.evaluate(() => { HX.Game.sim.speed = 3; });
    const fps = await page.evaluate(() => new Promise((res) => {
      let n = 0; const st = performance.now();
      function f(t) { n++; if (t - st > 1500) res(+(n / ((t - st) / 1000)).toFixed(1)); else requestAnimationFrame(f); }
      requestAnimationFrame(f);
    }));
    console.log('fps@dynamic=' + fps);
    await page.evaluate(() => { HX.Game.sim.speed = 0; });

    // 2) 补给线被切断
    await page.evaluate(() => {
      const sim = HX.Game.sim;
      sim.supplyCut = true;
      sim.speed = 1;
    });
    await sleep(1200);
    await page.evaluate(() => { HX.Game.sim.speed = 0; });
    await sleep(400);
    await shot(page, 'dyn-04-supply-cut');
    log(await page.evaluate(() => ({ cut: HX.Game.sim.supplyCut, unsupplied: HX.Game.sim.pla.filter((u) => !u.supplied && !u.dead).length, reason: HX.Game.sim.pla.find((u) => !u.supplied) && HX.Game.sim.pla.find((u) => !u.supplied).supplyReason })));
    await page.evaluate(() => { HX.Game.sim.supplyCut = false; });

    // 3) 情报迟滞：先制造旧情报，再侦察刷新
    const intel = await page.evaluate(() => {
      const sim = HX.Game.sim;
      const k2 = sim.kmt.find((k) => k.id === 'k2');
      sim.intel.k2 = { x: k2.x + 10, z: k2.z + 8, strength: k2.strength, time: sim.t - 30, conf: 25, source: '旧战报' };
      sim.speed = 0; HX.Game.sel = ['hy12']; HX.UI.update(sim, ['hy12']);
      return { age: sim.t - sim.intel.k2.time, conf: sim.intel.k2.conf };
    });
    await sleep(600);
    await shot(page, 'dyn-05-intel-stale');
    log(intel);

    await page.evaluate(() => {
      const sim = HX.Game.sim;
      const k2 = sim.kmt.find((k) => k.id === 'k2');
      HX.Sim.command(sim, ['hy12'], 'scout', { x: k2.x, z: k2.z });
      sim.speed = 3;
    });
    await sleep(3200);
    await page.evaluate(() => { HX.Game.sim.speed = 0; });
    await sleep(500);
    await shot(page, 'dyn-06-intel-refreshed');
    log(await page.evaluate(() => {
      const sim = HX.Game.sim; const it = sim.intel.k2;
      return { age: +(sim.t - it.time).toFixed(1), conf: it.conf, source: it.source };
    }));

    // 4) 手绘多段路线（真实鼠标点击 + Enter）
    await page.evaluate(() => {
      const sim = HX.Game.sim;
      HX.Game.sel = ['hy12']; HX.UI.update(sim, ['hy12']);
      HX.Game.startRouteDraw();
    });
    const pts = [[600, 560], [760, 470], [920, 540], [1080, 430], [1230, 480]];
    for (const [x, y] of pts) { await page.mouse.click(x, y); await sleep(220); }
    await sleep(400);
    await shot(page, 'dyn-07-route-drawing');
    log(await page.evaluate(() => ({ points: HX.Game.routeDraw.points.length, tip: (document.getElementById('routeTip') || {}).innerHTML })));
    await page.keyboard.press('Enter');
    await sleep(700);
    await shot(page, 'dyn-08-route-issued');
    log(await page.evaluate(() => {
      const u = HX.Game.sim.pla.find((x) => x.id === 'hy12');
      return u.path ? { pts: u.path.length, km: HX.Sim.pathInfo(u.path, u).km.toFixed(0), hours: HX.Sim.pathInfo(u.path, u).hours.toFixed(1) } : { path: null };
    }));

    // 5) 遇阻自动改道（把路线穿过一支敌军并刷新情报）
    const rr = await page.evaluate(() => {
      const sim = HX.Game.sim;
      const u = sim.pla.find((x) => x.id === 'hy12');
      const k = sim.kmt.find((x) => x.id === 'k13' && x.alive) || sim.kmt.find((x) => x.alive);
      const mx = (u.x + k.x) / 2, mz = (u.z + k.z) / 2;
      HX.Sim.command(sim, ['hy12'], 'move', { path: [[mx, mz], [k.x, k.z]] });
      sim.intel[k.id] = { x: k.x, z: k.z, strength: k.strength, time: sim.t, conf: 92, source: '前沿侦察' };
      sim.autonomy = true; sim.auth = 1; sim.speed = 3;
      return { path: u.path && u.path.length, mx, mz };
    });
    await sleep(2600);
    await page.evaluate(() => { HX.Game.sim.speed = 0; });
    await sleep(400);
    await shot(page, 'dyn-09-reroute');
    log(await page.evaluate(() => ({ log: HX.Game.sim.routeLog.slice(-2), reroute: HX.Game.sim.pla.find((x) => x.id === 'hy12').reroute })));

    // 6) 玩家手动覆盖路线（UI 绘制）
    await page.evaluate(() => {
      HX.Game.sim.speed = 0; HX.Game.sel = ['hy12']; HX.UI.update(HX.Game.sim, ['hy12']);
      HX.Game.startRouteDraw();
    });
    for (const [x, y] of [[1250, 640], [1100, 700], [950, 650], [820, 730]]) { await page.mouse.click(x, y); await sleep(200); }
    await page.keyboard.press('Enter');
    await sleep(600);
    await shot(page, 'dyn-10-route-override');
    log(await page.evaluate(() => {
      const u = HX.Game.sim.pla.find((x) => x.id === 'hy12');
      return { reroute: u.reroute && u.reroute.reason, pts: u.path && u.path.length, order: u.order && u.order.type };
    }));

    // 7) 指挥员卡 + 请示
    await page.evaluate(() => { HX.UI.commanderCard(HX.Game.sim, 'hy10'); });
    await sleep(500);
    await shot(page, 'dyn-11-commander-card');
    await page.evaluate(() => { HX.UI.closeModal(); });

    // 8) 严控 vs 放权：同一局势各推进 48 模拟小时
    async function authRun(auth) {
      return page.evaluate((authV) => {
        const sim = HX.Sim.create();
        sim.t = 30; sim.speed = 1; sim.auth = authV; sim.autonomy = true;
        const k7 = sim.kmt.find((k) => k.id === 'k7');
        ['hy4', 'hy6', 'hy9'].forEach((id, i) => {
          const u = sim.pla.find((x) => x.id === id);
          if (!u) return;
          u.x = k7.x - 8 + i * 1.6; u.z = k7.z + (i - 1) * 3;
          u.engaged = true; u.strength = u.s0 * 0.80; u.morale = 62;
          u.order = { type: 'attack', kmtId: k7.id, ang: i * 1.2, arrived: false };
          u.cmd.lastAsk = -99; u.cmd.lastDeviate = -99;
        });
        let first = null, firstRe = null;
        const types = {};
        for (let i = 0; i < 60 && !sim.ended; i++) {
          HX.Sim.update(sim, 0.15);
          for (const r of sim.requests) if (r.status === 'open') {
            types[r.type] = (types[r.type] || 0) + 1;
            if (!first) first = Math.round(r.t);
            if (!firstRe && r.type === 'reinforce') firstRe = Math.round(r.t);
            r.status = 'adopted';
          }
          for (const u of sim.pla) if (u.cmd) u.cmd.request = null;
        }
        window.__authSim = sim;
        return {
          auth: authV, t: Math.round(sim.t),
          requests: sim.requests.length,
          totalAsks: sim.reqSeq,
          unapproved: sim.unapproved || 0,
          devLog: (sim.unapprovedLog || []).length,
          reinforcements: sim.requests.filter((r) => r.type === 'reinforce').length,
          alts: sim.requests.filter((r) => r.type === 'alt').length,
          types,
          firstAskT: first, firstReinforceT: firstRe, ended: sim.ended,
          cas: +((1 - sim.pla.find((x) => x.id === 'hy4').strength / sim.pla.find((x) => x.id === 'hy4').s0) * 100).toFixed(1)
        };
      }, auth);
    }
    const strict = await authRun(0);
    log(strict);

    // 待批请示界面（保留未批复状态，展示采纳/驳回）
    const pending = await page.evaluate(() => {
      const sim = HX.Sim.create();
      sim.t = 40; sim.auth = 0; sim.speed = 1;
      const k7 = sim.kmt.find((k) => k.id === 'k7');
      ['hy4', 'hy6', 'hy9'].forEach((id, i) => {
        const u = sim.pla.find((x) => x.id === id);
        u.x = k7.x - 8 + i * 1.6; u.z = k7.z + (i - 1) * 3;
        u.engaged = true; u.strength = u.s0 * 0.79; u.morale = 60;
        u.order = { type: 'attack', kmtId: k7.id, ang: i * 1.2 }; u.cmd.lastAsk = -99;
      });
      for (let i = 0; i < 10 && !sim.ended; i++) HX.Sim.update(sim, 0.15);
      window.__pSim = sim;
      HX.UI.requests(sim);
      return {
        open: sim.requests.filter((r) => r.status === 'open').length, asks: sim.reqSeq, t: Math.round(sim.t),
        openTypes: sim.requests.filter((r) => r.status === 'open').map((r) => r.type + ':' + r.cmdr)
      };
    });
    log(pending);
    await sleep(500);
    await shot(page, 'dyn-12-alt-request');
    await page.evaluate(() => { HX.UI.closeModal(); });

    const permissive = await authRun(2);
    log(permissive);
    await page.evaluate(() => { HX.UI.requests(window.__authSim); });
    await sleep(500);
    await shot(page, 'dyn-13-auth-permissive');
    await page.evaluate(() => { HX.UI.closeModal(); });

    // 9) 性格差异：同一局势下 陶勇 vs 宋时轮
    const pers = await page.evaluate(() => {
      function run(cmdName, auth) {
        const sim = HX.Sim.create();
        sim.t = 30; sim.auth = auth; sim.autonomy = true; sim.speed = 1;
        HX.Sim.assignCommander(sim, 'hy10', cmdName);
        const u = sim.pla.find((x) => x.id === 'hy10');
        const k = sim.kmt.find((x) => x.id === 'k7');
        u.x = k.x - 9; u.z = k.z; u.strength = u.s0 * 0.87; u.engaged = true; u.morale = 70;
        u.order = { type: 'attack', kmtId: 'k7', ang: 0, arrived: false };
        let first = null, firstRe = null;
        const types = {};
        for (let i = 0; i < 60 && !sim.ended; i++) {
          HX.Sim.update(sim, 0.15);
          for (const r of sim.requests) if (r.status === 'open') {
            types[r.type] = (types[r.type] || 0) + 1;
            if (!first) first = Math.round(r.t);
            if (!firstRe && r.type === 'reinforce') firstRe = Math.round(r.t);
            r.status = 'adopted';
          }
          u.cmd.request = null;
        }
        return {
          cmdr: cmdName,
          reinforce: sim.requests.filter((r) => r.type === 'reinforce').length,
          totalAsk: sim.reqSeq, firstAskT: first, firstReinforceT: firstRe, types,
          dev: sim.unapproved || 0,
          cas: Math.round((1 - u.strength / u.s0) * 1000) / 10,
          strength: Math.round(u.strength)
        };
      }
      function defend(cmdName) {
        const sim = HX.Sim.create();
        sim.t = 40; sim.auth = 1; sim.speed = 1;
        HX.Sim.assignCommander(sim, 'hy10', cmdName);
        const u = sim.pla.find((x) => x.id === 'hy10');
        const k = sim.kmt.find((x) => x.id === 'k7');
        u.x = k.x - 8; u.z = k.z; u.strength = u.s0; u.engaged = true; u.morale = 75;
        u.order = { type: 'block', kmtId: 'k7', ang: 0, arrived: true };
        for (let i = 0; i < 60 && !sim.ended; i++) HX.Sim.update(sim, 0.15);
        return { cmdr: cmdName, cas: Math.round((1 - u.strength / u.s0) * 1000) / 10, left: Math.round(u.strength) };
      }
      return { taoyong: run('陶勇', 0), song: run('宋时轮', 0), wangPermissive: run('王近山', 2), defendTaoyong: defend('陶勇'), defendSong: defend('宋时轮') };
    });
    log(pers);

    console.log('ERRORS=' + errs.length + (errs.length ? ' :: ' + errs.slice(0, 6).join(' | ') : ''));
  } catch (e) {
    errs.push('FATAL ' + e.message);
    console.log('FATAL ' + e.message);
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
})();
