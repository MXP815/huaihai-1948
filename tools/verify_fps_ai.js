/* FPS 小队协同 + 炮火准备 静默实测（headless Edge）
   产出：workspace/_fps_verify/verify_fps_ai.json + 两张截图
   不写入项目目录（构建产物另由 build.js 生成） */
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { chromium } = require('playwright-core');

const SRC = path.join(__dirname, '..', 'src');
const OUT = path.join(os.tmpdir(), 'hx_fps_verify');
const ORDER = ['engine.js', 'data.js', 'world.js', 'sim.js', 'audio.js', 'ui.js', 'cine.js', 'fps.js', 'game.js'];
const PORT = 8014;

function buildTemp() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
  const read = (n) => fs.readFileSync(path.join(SRC, n), 'utf8');
  const css = read('styles.css');
  const js = ORDER.map((f) => `\n/* ===== ${f} ===== */\n` + read(f)).join('\n');
  const tpl = read('index_template.html');
  fs.writeFileSync(path.join(OUT, 'index.html'), tpl.replace('/*CSS*/', () => css).replace('/*JS*/', () => js), 'utf8');
}

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, resp) => {
      const p = path.join(OUT, decodeURIComponent(req.url.split('?')[0].replace(/^\//, '') || 'index.html'));
      if (!fs.existsSync(p)) { resp.writeHead(404); resp.end('no'); return; }
      resp.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      resp.end(fs.readFileSync(p));
    });
    srv.listen(PORT, '127.0.0.1', () => res(srv));
  });
}

const NONE = { level: 'none', duration: 0, shells: 0, radius: 0, dmgMul: 0 };
const FULL = { level: 'full', duration: 9, shells: 24, radius: 18, dmgMul: 1 };
const WEAK = { level: 'weak', duration: 2.4, shells: 6, radius: 6.5, dmgMul: 0.58 };

function trace(d) {
  const log = d.aiLog || [];
  return {
    phases: log.filter((x) => x.action === 'phase').map((x) => `${x.t}s ${x.note}`),
    cues: log.filter((x) => x.action === 'cue').map((x) => `${x.t}s ${x.note}`),
    flankMoves: log.filter((x) => x.action === 'flank_move').map((x) => ({ t: x.t, unit: x.unit, x: x.x, z: x.z })),
    act: log.filter((x) => x.action === 'act').map((x) => `${x.t}s #${x.unit} ${x.note}`),
    intel: log.filter((x) => x.action === 'intel').map((x) => `${x.t}s age=${x.intelAge} conf=${x.note.match(/conf=(\d+)/) ? x.note.match(/conf=(\d+)/)[1] : '?'}%`),
    final: { phase: d.phase, intel: d.intel, enemies: d.enemies, kills: d.kills }
  };
}

(async () => {
  buildTemp();
  const srv = await serve();
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--mute-audio', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(120000);
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGE ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CON ' + m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/index.html?mute=1&cb=${Date.now()}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.HX && HX.Game && HX.Game.renderer && HX.FPS, { timeout: 30000 });

  async function runScene(support, px, pz, seconds, pressureAt, skipAt) {
    return page.evaluate(({ support, px, pz, seconds, pressureAt, skipAt }) => {
      HX.FPS.reseed(7);
      HX.FPS.start({
        title: '实测', phase: 2, enemyCount: 12, enemyHP: 90, playerHP: 999999, limit: 300,
        seed: 7, chapter: 2, chapterCfg: HX.DATA.CHAPTERS[2], support
      }, () => {});
      HX.FPS.setPlayerPos(px, pz);
      HX.FPS.state.player.yaw = Math.PI;
      const steps = Math.round(seconds / 0.05);
      for (let i = 0; i < steps; i++) {
        const t = HX.FPS.state.t;
        if (pressureAt != null && Math.abs(t - pressureAt) < 0.03) {
          for (let k = 0; k < 9; k++) HX.FPS.state.shotTimes.push(t);
        }
        if (skipAt != null && Math.abs(t - skipAt) < 0.03) HX.FPS.skipPrep();
        HX.FPS.update(0.05);
        if (!HX.FPS.state.active) break;
      }
      return HX.FPS.debug();
    }, { support, px, pz, seconds, pressureAt, skipAt });
  }

  // 1) 同一场景、玩家站位不同：包抄路线是否不同
  const runA = await runScene(NONE, 12, 18, 26, null, null);
  const runB = await runScene(NONE, -12, 20, 26, null, null);
  const aiA = trace(runA), aiB = trace(runB);
  const lastFlank = (t) => {
    const map = {};
    for (const m of t.flankMoves) map[m.unit] = m;
    return map;
  };
  const lfA = lastFlank(aiA), lfB = lastFlank(aiB);
  let routeDiff = 0, routeN = 0;
  for (const u of Object.keys(lfA)) if (lfB[u]) { routeDiff += Math.hypot(lfA[u].x - lfB[u].x, lfA[u].z - lfB[u].z); routeN++; }
  const ai = {
    A: aiA, B: aiB,
    intelA: runA.intel, intelB: runB.intel,
    routeDiffAvg: routeN ? +(routeDiff / routeN).toFixed(2) : null,
    routeSamples: routeN,
    phaseA: runA.phase, phaseB: runB.phase
  };

  // 2) 三种协同动作全流程（含玩家压制触发交替后撤）
  const tactics = await runScene(NONE, 4, 18, 42, 13, null);
  const tacticsTrace = trace(tactics);

  // 3) 炮火准备：充足 vs 薄弱 vs 提前冲锋
  const prepFull = await runScene(FULL, 34, 30, 12, null, null);
  const prepWeak = await runScene(WEAK, 34, 30, 12, null, null);
  const prepSkip = await runScene(FULL, 34, 30, 5, null, 1.2);
  const enemyHpTotal = (d) => d.enemies.reduce((a, e) => a + Math.max(0, e.hp), 0);
  const artilleryFps = {
    full: { fired: prepFull.prep.fired, shells: prepFull.prep.shells, radius: prepFull.prep.radius, dmg: prepFull.prep.dmg, hits: prepFull.prep.hits, alive: prepFull.enemies.filter((e) => e.alive).length, hpLeft: enemyHpTotal(prepFull) },
    weak: { fired: prepWeak.prep.fired, shells: prepWeak.prep.shells, radius: prepWeak.prep.radius, dmg: prepWeak.prep.dmg, hits: prepWeak.prep.hits, alive: prepWeak.enemies.filter((e) => e.alive).length, hpLeft: enemyHpTotal(prepWeak) },
    skipped: { skipped: prepSkip.prep.skipped, fired: prepSkip.prep.fired, warnMul: prepSkip.prepWarn }
  };

  // 4) 战役层耦合：弹药档位、扣弹、伤亡系数、掩体减免
  const coupling = await page.evaluate(() => {
    const S = HX.Sim, D = HX.DATA;
    function withAmmo(a) {
      const s = S.create();
      const guns = s.pla.filter((p) => !p.dead && p.role === '炮兵');
      for (const g of guns) g.ammo = a;
      return { s, guns, plan: S.artilleryPlan(s, 'k12') };
    }
    const hi = withAmmo(90), mid = withAmmo(50), lo = withAmmo(30), none = withAmmo(8);
    const spend = (() => {
      const x = withAmmo(90);
      const before = x.guns[0].ammo;
      const r = S.consumeArtillery(x.s, x.plan);
      return { level: x.plan.level, cost: r.cost, before, after: x.guns[0].ammo, fatigue: x.guns[0].fatigue };
    })();
    function casualties(ammo, prepLevel, skipped) {
      const s = S.create();
      for (const g of s.pla.filter((p) => !p.dead && p.role === '炮兵')) g.ammo = ammo;
      const before = Math.round(s.casualties.pla);
      S.applyBattle(s, 'k12', { win: true, kills: 10, casualties: 100, prep: { level: prepLevel, skipped: !!skipped } });
      return { level: prepLevel, casDelta: Math.round(s.casualties.pla - before), kmtCut: Math.round(s.kmt.find((k) => k.id === 'k12').s0 - s.kmt.find((k) => k.id === 'k12').strength) };
    }
    const plan = hi.plan;
    const cover = {};
    for (const c of ['open', 'crater', 'wall', 'trench', 'house']) cover[c] = S.shellDamage(plan, 0.6, c);
    return {
      levels: { hi: hi.plan, mid: mid.plan, lo: lo.plan, none: none.plan },
      spend,
      cas: { full: casualties(90, 'full', false), weak: casualties(30, 'weak', false), none: casualties(8, 'none', false), skipped: casualties(90, 'full', true) },
      coverDamage: cover,
      shellRadius: D.ARTILLERY.shellRadius
    };
  });

  // 5) 帧率 / draws / instances（rAF 内同时 update+render）
  const frame = await page.evaluate(async () => {
    HX.FPS.reseed(7);
    HX.FPS.start({
      title: '实测', phase: 2, enemyCount: 12, enemyHP: 90, playerHP: 999999, limit: 300,
      seed: 7, chapter: 2, chapterCfg: HX.DATA.CHAPTERS[2], support: { level: 'full', duration: 9, shells: 24, radius: 18, dmgMul: 1 }
    }, () => {});
    HX.FPS.setPlayerPos(4, 20);
    HX.FPS.state.player.yaw = Math.PI;
    for (let i = 0; i < 80; i++) HX.FPS.update(1 / 60);
    let frames = 0, renderMs = 0;
    const t0 = performance.now();
    await new Promise((res) => {
      function loop() {
        const a = performance.now();
        HX.FPS.update(1 / 60);
        HX.FPS.render();
        renderMs += performance.now() - a;
        frames++;
        if (performance.now() - t0 < 2500) requestAnimationFrame(loop); else res();
      }
      requestAnimationFrame(loop);
    });
    const dur = (performance.now() - t0) / 1000;
    const s = HX.FPS.renderer.stats;
    return { rafFps: +(frames / dur).toFixed(1), frameMsAvg: +(renderMs / frames).toFixed(2), frames, draws: s.draws, instances: s.instances, tris: s.tris };
  });

  // 6) 回归：三章差异化 / 战役层反应 / 环壕 / 节奏 / 存档
  const regression = await page.evaluate(() => {
    const S = HX.Sim, W = HX.World, D = HX.DATA;
    const ch = [1, 2, 3].map((id) => {
      const c = D.CHAPTERS[id];
      W.setChapter(id);
      let hmin = 1e9, hmax = -1e9;
      for (let x = c.area.x - 12; x <= c.area.x + 12; x += 2) {
        for (let z = c.area.z - 12; z <= c.area.z + 12; z += 2) {
          const h = W.heightAt(x, z); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
        }
      }
      return { id, palette: c.palette, areaKm: [+(c.area.w * 0.8).toFixed(1), +(c.area.h * 0.8).toFixed(1)], treesInArea: c.cover.treeInArea, heightRange: +(hmax - hmin).toFixed(2) };
    });
    W.setChapter(1);
    function setup(opts) {
      const s = S.create();
      s.phase = 2; s.t = 456; s.railCut = 1; s.running = true; s.speed = 1;
      const SQ = [-35.7, 120.9], SW = [[-6, 6], [-20, 13], [-36, 21], [-52, 28], [-64, 33]];
      for (const id of ['k2', 'k13', 'k16', 'kzu']) { const k = s.kmt.find((x) => x.id === id); k.alive = true; k.reactMode = null; k.dest = null; }
      const k7 = s.kmt.find((k) => k.id === 'k7'); if (k7) k7.dest = null;
      const k12 = s.kmt.find((k) => k.id === 'k12');
      k12.alive = true; k12.x = SQ[0]; k12.z = SQ[1]; k12.dest = null; k12.reactMode = null; k12.entrench = 2;
      const kzu = s.kmt.find((k) => k.id === 'kzu'); kzu.x = 0; kzu.z = 0;
      for (const p of s.pla) { p.order = null; p.path = null; p.dest = null; p.x = -195; p.z = 198; }
      s.pla[21].x = -23.1; s.pla[21].z = 87.6;
      for (let i = 0; i < opts.ring; i++) { const p = s.pla[i]; const a = i / opts.ring * Math.PI * 2 + 0.1; p.x = SQ[0] + Math.cos(a) * 11.6; p.z = SQ[1] + Math.sin(a) * 11.6; }
      if (opts.blockSW) for (let i = 0; i < 3; i++) { const p = s.pla[16 + i]; p.x = SW[i][0]; p.z = SW[i][1]; }
      return s;
    }
    function run(s, ticks) {
      for (let i = 0; i < ticks; i++) S.update(s, 0.25);
      return { reactions: s.enemyLog.filter((r) => r.status !== 'not_triggered').map((r) => `${r.id}@${r.t.toFixed(1)}`), modes: s.kmt.filter((k) => k.reactMode).map((k) => `${k.id}:${k.reactMode}`) };
    }
    const branchOpen = run(setup({ ring: 8, blockSW: false }), 40);
    const branchBlock = run(setup({ ring: 8, blockSW: true }), 40);
    const branchLoose = run(setup({ ring: 4, blockSW: false }), 40);
    const nz = D.NIANZHUANG;
    const cross = S.pathInfo([[nz.x + nz.rx * 0.95, nz.z], [nz.x + nz.rx * 1.05, nz.z]], null);
    const out = S.pathInfo([[nz.x + 8, nz.z], [nz.x + 8.7, nz.z]], null);
    const s = S.create();
    S.setPace(s, 0); const p0 = S.pacing(s).name;
    S.setPace(s, 1); const p1 = S.pacing(s).name;
    S.setPace(s, 2); const p2 = S.pacing(s).name;
    s.t = 123.5; s.phase = 2; s.enemyLog = [{ t: 100, id: 'huangwei_hedgehog' }];
    s.situations = [{ t: 102, snap: { k12: { t: 102, cover: 7, n: 8 } } }];
    const snapText = S.serialize(s);
    const saved = JSON.parse(snapText).sim;
    const rs = S.restore(snapText);
    return {
      chapters: ch,
      branches: { open: branchOpen, block: branchBlock, loose: branchLoose },
      moat: { timeMul: +((cross.hours / out.hours)).toFixed(2), impassable: D.MOATS[0].impassable, w: D.MOATS[0].w },
      pace: [p0, p1, p2],
      save: { t: saved.t, phase: saved.phase, restoredT: rs.t, restoredPhase: rs.phase, enemyLog: (rs.enemyLog || []).length, situations: (rs.situations || []).length }
    };
  });

  // 7) 截图：炮火落点预示 + 侧翼协同
  await runScene(FULL, 4, 24, 1.2, null, null);
  await page.evaluate(() => { HX.FPS.state.player.yaw = Math.PI; HX.FPS.render(); });
  await page.waitForTimeout(250);
  await page.locator('#gl').screenshot({ path: path.join(OUT, 'shots', 'fps-prep.png') });
  await runScene(NONE, 4, 20, 7, null, null);
  await page.evaluate(() => { HX.FPS.state.player.yaw = Math.PI; HX.FPS.render(); });
  await page.waitForTimeout(250);
  await page.locator('#gl').screenshot({ path: path.join(OUT, 'shots', 'fps-flank.png') });

  const report = { ai, tactics: tacticsTrace, artilleryFps, coupling, frame, regression, errs };
  fs.writeFileSync(path.join(OUT, 'verify_fps_ai.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    routes: { phaseA: ai.phaseA, phaseB: ai.phaseB, intelA: ai.intelA, intelB: ai.intelB, routeDiffAvg: ai.routeDiffAvg, samples: ai.routeSamples },
    tacticsPhases: tacticsTrace.phases, cues: tacticsTrace.cues,
    artilleryFps, coupling: { levels: Object.fromEntries(Object.entries(coupling.levels).map(([k, v]) => [k, { level: v.level, label: v.label, duration: v.duration, shells: v.shells, radius: v.radius, casMul: v.casMul, ammo: v.ammo }])), spend: coupling.spend, cas: coupling.cas, coverDamage: coupling.coverDamage },
    frame, regression, errs
  }, null, 2));
  await browser.close();
  srv.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
