// 静默验收：从容档暂停零变化 / 沙盘推演方案对比 / 紧迫档软后果 / 章节手动确认 / 存档恢复
// 用法：设置 PACE_WAIT（毫秒，默认 600000 = 10 分钟挂机）后 node tools\verify_pace.js
const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
const URL = 'http://127.0.0.1:8012/index.html?mute=1';
const WAIT = +(process.env.PACE_WAIT || 600000);
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].find((p) => fs.existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (o) => console.log(JSON.stringify(o, null, 2));
const results = { waitMs: WAIT, errors: [] };

async function shot(page, name) {
  const dest = path.join(SHOTS, name + '.png');
  const tmp = path.join(os.tmpdir(), 'hxshot-' + name + '-' + Date.now() + '.png');
  await page.screenshot({ path: tmp });
  for (let i = 0; i < 6; i++) {
    try {
      fs.copyFileSync(tmp, dest);
      fs.unlinkSync(tmp);
      return name;
    } catch (e) {
      await sleep(800);
    }
  }
  results.errors.push('SHOT_COPY_FAILED: ' + dest + ' (tmp kept: ' + tmp + ')');
  return name;
}

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => results.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') results.errors.push('console: ' + m.text()); });
  try {
    // 测试注入：把 HX.Game 暴露成 G，并提供 $ 便捷取元素
    await page.addInitScript(() => {
      Object.defineProperty(window, 'G', { get: () => window.HX && window.HX.Game });
      window.$ = (id) => document.getElementById(id);
    });
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.HX && HX.Sim && HX.UI, null, { timeout: 20000 });

    await page.click('#btnStart');
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      const st = await page.evaluate(() => ({ active: !!(HX.Cine && HX.Cine.state && HX.Cine.state.active), mode: G.mode }));
      if (st.active) await page.evaluate(() => HX.Cine.skip());
      if (st.mode === 'campaign' && !st.active) break;
    }
    await page.waitForFunction(() => G.mode === 'campaign', null, { timeout: 15000 });
    await page.evaluate(() => HX.UI.closeModal());
    await sleep(500);

    const snap = () => page.evaluate(() => {
      const s = G.sim;
      return {
        t: +s.t.toFixed(3), phase: s.phase, pace: s.pace, speed: s.speed, running: s.running, ended: s.ended,
        pla: s.pla.map((u) => ({ id: u.id, st: Math.round(u.strength), mor: +u.morale.toFixed(2), x: +u.x.toFixed(3), z: +u.z.toFixed(3), ammo: +u.ammo.toFixed(2), order: u.order && u.order.type })),
        kmt: s.kmt.map((k) => ({ id: k.id, st: Math.round(k.strength), x: +k.x.toFixed(3), z: +k.z.toFixed(3), cover: k.cover || 0, alive: !!k.alive })),
        logs: s.logs.length, asks: s.reqSeq || 0, events: s.events.length
      };
    });

    // 1) 从容档默认暂停 + 挂机零变化
    results.defaultPause = await page.evaluate(() => ({ pace: G.sim.pace, speed: G.sim.speed, running: G.sim.running, banner: !$('pauseBanner').classList.contains('hidden'), bannerText: $('pauseBannerText').textContent }));
    const before = await snap();
    await shot(page, 'pace-01-paused-before');
    results.before = { t: before.t, phase: before.phase, logs: before.logs };
    await sleep(WAIT);
    const after = await snap();
    await shot(page, 'pace-02-paused-after-' + Math.round(WAIT / 60000) + 'min');
    results.after = { t: after.t, phase: after.phase, logs: after.logs };
    results.pauseZero = JSON.stringify(before) === JSON.stringify(after);
    if (!results.pauseZero) {
      results.pauseDiff = [];
      for (const k of Object.keys(before)) {
        if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) results.pauseDiff.push(k);
      }
    }

    // 2) 沙盘推演：同一局势三套方案并排
    await page.evaluate(() => {
      const units = ['hy4', 'hy6', 'hy9'].filter((id) => G.sim.pla.find((u) => u.id === id && !u.dead));
      G.sel = units.length ? units : G.sim.pla.filter((u) => !u.dead).slice(0, 3).map((u) => u.id);
      HX.UI.update(G.sim, G.sel);
      HX.UI.sandbox(G.sim, G.sel);
    });
    await sleep(500);
    await shot(page, 'pace-03-plan-compare');
    results.plans = await page.evaluate(() => {
      const t0 = G.sim.t;
      const parsed = HX.UI._plans.map((p) => {
        const pv = HX.Sim.preview(G.sim, G.sel, p.type, p.target);
        return { key: p.key, type: p.type, label: p.label, target: p.sub, km: pv && pv.km, hours: pv && pv.hours, risk: pv && pv.risk, cas: pv ? [pv.casLo, pv.casHi] : null, enc: pv && pv.enc && pv.enc.text, supply: pv && pv.supplyText, eta: pv && pv.eta };
      });
      return { tBefore: t0, tAfter: G.sim.t, plans: parsed, modalOpen: !$('modalWrap').classList.contains('hidden') };
    });
    // 执行方案 A，验证不下达时间推进
    await page.click('[data-plan="0"]');
    await sleep(300);
    results.afterPlan = await page.evaluate(() => ({ t: G.sim.t, orders: G.sel.map((id) => { const u = G.sim.pla.find((x) => x.id === id); return { id, order: u.order && u.order.type, kmtId: u.order && u.order.kmtId }; }), modalOpen: !$('modalWrap').classList.contains('hidden') }));
    await shot(page, 'pace-04-plan-executed');

    // 3) 紧迫档：历史窗口过后是软后果，不判负
    const urgentBefore = await page.evaluate(() => ({
      kmtMax: Math.max(...G.sim.kmt.filter((k) => k.alive).map((k) => k.strength)),
      ammo: G.sim.pla[0].ammo
    }));
    await page.evaluate(() => {
      HX.Sim.setPace(G.sim, 2);
      G.sim.t = HX.Sim.PHASE_DEADLINES[0] + 0.5;
      G.sim.speed = 1;
      G.sim.running = true;
      HX.Sim.update(G.sim, 0.1);
      G.sim.running = false;
      G.sim.speed = 0;
      HX.UI.update(G.sim, G.sel);
    });
    await sleep(300);
    await shot(page, 'pace-05-urgent-soft');
    results.urgent = await page.evaluate((b) => {
      const kmtMax = Math.max(...G.sim.kmt.filter((k) => k.alive).map((k) => k.strength));
      return {
        pace: G.sim.pace, paceName: HX.Sim.pacing(G.sim).name, limit: HX.Sim.pacing(G.sim).limit,
        hits: G.sim.deadlineHits.length, ended: G.sim.ended, phase: G.sim.phase,
        clock: $('tlClock').textContent,
        kmtMaxBefore: Math.round(b.kmtMax), kmtMaxAfter: Math.round(kmtMax),
        kmtDelta: Math.round(kmtMax - b.kmtMax),
        ammoDelta: +(G.sim.pla[0].ammo - b.ammo).toFixed(1),
        effect: G.sim.lastDeadlineEffect || null,
        deadlineLog: G.sim.logs.filter((l) => l.text && l.text.includes('时间窗')).length,
        logTail: G.sim.logs.slice(0, 2).map((l) => l.text)
      };
    }, urgentBefore);

    // 4) 从容档：章节目标达成 → 停表等确认
    await page.evaluate(() => {
      HX.Sim.setPace(G.sim, 0);
      const k = G.sim.kmt.find((x) => x.id === 'k7');
      if (k) { k.alive = false; k.strength = 0; }
      HX.Sim.recalcPhase(G.sim);
      HX.UI.update(G.sim, G.sel);
    });
    await sleep(300);
    await shot(page, 'pace-06-phase-ready');
    results.phaseReady = await page.evaluate(() => ({ phaseReady: G.sim.phaseReady, phase: G.sim.phase, running: G.sim.running, speed: G.sim.speed, banner: !$('phaseReady').classList.contains('hidden'), text: $('phaseReadyText').textContent }));
    await page.click('#btnPhaseConfirm');
    await sleep(600);
    results.phaseConfirmed = await page.evaluate(() => ({ phase: G.sim.phase, phaseReady: G.sim.phaseReady, modalOpen: !$('modalWrap').classList.contains('hidden'), t: G.sim.t }));
    for (let i = 0; i < 12; i++) {
      const st = await page.evaluate(() => ({ active: !!(HX.Cine && HX.Cine.state && HX.Cine.state.active), mode: G.mode }));
      if (st.active) await page.evaluate(() => HX.Cine.skip());
      if (st.mode === 'campaign' && !st.active) break;
      await sleep(250);
    }
    await page.evaluate(() => HX.UI.closeModal());
    await page.waitForFunction(() => G.mode === 'campaign', null, { timeout: 10000 });

    // 5) 保存 → 刷新 → 继续
    const saved = await snap();
    results.saveDiag = await page.evaluate(() => {
      const e = $('btnSave');
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      const dock = e.closest('.dock-right');
      const dr = dock && dock.getBoundingClientRect();
      return {
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        display: cs.display, visibility: cs.visibility,
        dock: dr ? [Math.round(dr.y), Math.round(dr.height), dock.scrollTop, dock.scrollHeight] : null,
        screen: $('campaign').className, modal: $('modalWrap').className
      };
    });
    await page.click('#btnSave');
    await sleep(300);
    results.saved = await page.evaluate(() => ({ has: !!localStorage.getItem('hx1948_save'), meta: localStorage.getItem('hx1948_save_meta') }));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.HX && HX.Sim, null, { timeout: 20000 });
    await page.waitForTimeout(1200);
    results.resumeVisible = await page.evaluate(() => ({
      visible: !$('btnResume').classList.contains('hidden'),
      cls: $('btnResume').className,
      hasSave: !!localStorage.getItem('hx1948_save'),
      screen: $('title').className
    }));
    await page.click('#btnResume');
    await sleep(800);
    await shot(page, 'pace-07-resumed');
    const resumed = await snap();
    results.resumeSame = JSON.stringify(saved) === JSON.stringify(resumed);
    if (!results.resumeSame) {
      results.resumeDiff = [];
      for (const k of Object.keys(saved)) {
        if (saved[k] && typeof saved[k] === 'object') {
          if (JSON.stringify(saved[k]) !== JSON.stringify(resumed[k])) results.resumeDiff.push(k);
        } else if (saved[k] !== resumed[k]) results.resumeDiff.push(k + ': ' + saved[k] + ' -> ' + resumed[k]);
      }
    }
    results.resume = { t: resumed.t, phase: resumed.phase, speed: resumed.speed, running: resumed.running, banner: await page.evaluate(() => !$('pauseBanner').classList.contains('hidden')) };

    // 6) 无时间判负：把时钟推过 66 天
    await page.evaluate(() => { G.sim.t = 2000; G.sim.running = true; HX.Sim.update(G.sim, 0.1); G.sim.running = false; });
    results.noTimeDefeat = await page.evaluate(() => ({ t: G.sim.t, ended: G.sim.ended, phase: G.sim.phase }));

    results.errors = results.errors.filter((e, i, a) => a.indexOf(e) === i).slice(0, 12);
    log(results);
  } catch (e) {
    results.errors.push('FATAL: ' + e.message);
    log(results);
    process.exitCode = 1;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
})();
