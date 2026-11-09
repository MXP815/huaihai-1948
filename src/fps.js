/* ==========================================================================
   前线交火层：指挥员亲临前线（第一人称）
   指针锁定 / 后坐与扩散 / 曳光与枪口火光 / 掩体推进的敌 AI
   ========================================================================== */
(function () {
  const HX = (window.HX = window.HX || {});
  const D = HX.DATA, U = HX.U, W = HX.World, M = HX.M, UI = HX.UI;
  const F = (HX.FPS = {});
  const $ = (id) => document.getElementById(id);
  const clamp = U.clamp;
  const AID = D.FPS_AI || {
    intelDelay: 1.4, intelStale: 3.4, intelError: 0.9, sightRange: 58, fireRange: 46,
    flankArc: 1.15, flankReach: 3.6, assaultHold: 6, boundingStep: 7, boundingSwap: 2.4,
    boundingSpan: 7.5, clearBands: 3, clearSegment: 8, clearHold: 4, pressureShots: 6,
    pressureWindow: 3, cueCd: 2.2, cueText: {}
  };
  const ART = D.ARTILLERY || { shellRadius: 4.6, baseDamage: 62, coverMul: {}, prepCasMul: {}, warnMul: 1.15, duration: {}, shells: {}, radius: {}, dmgMul: {}, levelText: {} };
  /* 寻路：网格 A* + 视线平滑 + 局部避让 + 每帧寻路预算 */
  const NAV = {
    cell: 0.6, half: 46, radius: 0.45, trenchCost: 1.15,
    maxPerFrame: 4, replan: 3.0, wpReach: 0.45, maxPath: 160, stuckT: 0.6
  };
  let nav = null;
  let aiRnd = Math.random;
  F.reseed = function (n) { aiRnd = U.rng(n || 7); };

  const ENV = {
    sunDir: [-0.45, 0.34, -0.30], sunCol: [1.0, 0.70, 0.44], skyCol: [0.30, 0.35, 0.40], groundCol: [0.18, 0.16, 0.13],
    fogCol: [0.28, 0.27, 0.26], skyTop: [0.05, 0.10, 0.15], skyHorizon: [0.42, 0.36, 0.32],
    rimCol: [1.0, 0.72, 0.46], rim: 0.6, fogDensity: 0.0028, bloom: 0.85, exposure: 1.12, vignette: 0.44,
    grain: 0.04, focus: [0, 0], shadowRadius: 32, grade: [1.06, 1.0, 0.94]
  };

  const st = (F.state = {
    active: false, arena: null, arenaSeed: -1, cam: null,
    player: null, enemies: [], allies: [], particles: [], tracers: [], dmg: [],
    cfg: null, t: 0, kills: 0, shots: 0, hits: 0, cas: 0,
    locked: false, keys: {}, down: false, cmdUsed: false, won: null,
    cb: null, suppressT: 0, spread: 0, recoil: 0, ads: false,
    mouseDX: 0, mouseDY: 0, hintT: 0, flash: 0, reloading: false, reloadT: 0,
    dragFallback: false,
    squad: null, prep: null, aiLog: [], shotTimes: [], cueText: '', cueT: 0,
    prepWarn: 1, aiClock: 0,
    navMode: 'astar', navQuota: 0,
    navStats: { frames: 0, calls: 0, dropped: 0, fails: 0, hits: 0, lastLen: 0, lastMs: 0 }
  });

  F.setRenderer = function (r) { F.renderer = r; };

  F.start = function (cfg, cb) {
    const s = st;
    s.cfg = cfg; s.cb = cb;
    s.active = true;
    s.t = 0; s.kills = 0; s.shots = 0; s.hits = 0; s.cas = 0; s.cmdUsed = false;
    s.won = null; s.suppressT = 0; s.spread = 0; s.recoil = 0; s.ads = false;
    s.reloading = false; s.reloadT = 0; s.particles.length = 0; s.tracers.length = 0;
    s.ending = false; s.suppressEnemy = 0; s.focus = 0;
    s.mouseDX = 0; s.mouseDY = 0; s.dragFallback = false; s.lockAt = 0;
    s.hintT = 4;
    s.aiLog.length = 0; s.shotTimes.length = 0; s.cueText = ''; s.cueT = 0;
    s.prepWarn = 1; s.aiClock = 0;
    aiRnd = U.rng((cfg.seed || 7) * 131 + (cfg.chapter || 1));

    const seed = cfg.seed || 7;
    const chapter = cfg.chapter || 1;
    const key = seed + ':' + chapter;
    if (s.arenaSeed !== key) {
      s.arena = W.buildArena(F.renderer, seed, chapter);
      s.arenaSeed = key;
    }
    const arena = s.arena;
    if (!nav || nav.arena !== arena) nav = buildNav(arena);
    s.navStats = { frames: 0, calls: 0, dropped: 0, fails: 0, hits: 0, lastLen: 0, lastMs: 0 };
    s.navQuota = NAV.maxPerFrame;
    const sp = arena.spawns.player;
    s.player = {
      x: sp.x, z: sp.z, y: W.arenaHeight(sp.x, sp.z), hp: cfg.playerHP || 120,
      yaw: Math.PI, pitch: -0.03, ammo: 30, reserve: 120, ads: false, crouch: false,
      jumpV: 0, onGround: true, alive: true, radius: 0.45
    };
    s.cam = { pos: [sp.x, s.player.y + 1.72, sp.z], target: [sp.x, s.player.y + 1.6, sp.z - 5], fov: 78, near: 0.12, far: 420 };

    s.enemies.length = 0;
    for (let i = 0; i < cfg.enemyCount; i++) {
      const e = arena.spawns.enemy[i % arena.spawns.enemy.length];
      const rank = Math.floor(i / arena.spawns.enemy.length);
      s.enemies.push({
        id: i, x: e.x + (aiRnd() - 0.5) * 2 + rank * 5, z: e.z + (aiRnd() - 0.5) * 2 - rank * 3,
        y: W.arenaHeight(e.x, e.z), hp: cfg.enemyHP || 100, maxhp: cfg.enemyHP || 100,
        state: 'advance', cover: null, coverT: 0, fireT: aiRnd() * 1.2,
        alive: true, aimT: 0, flankSide: i % 2 ? 1 : -1, suppress: 0, moveDir: 0,
        strafe: (aiRnd() - 0.5) * 1.2,
        group: i % 2 ? 'flank' : 'fire', ai: 'hold', cue: 0,
        sightT: aiRnd() * 0.6, seen: false, lastSeen: null, hitT: -99, band: 0,
        logT: aiRnd() * 1.2, deathT: -99, travel: 0, nav: null, stuck: 0
      });
    }
    s.allies.length = 0;
    for (let i = 0; i < 4; i++) {
      const a = arena.spawns.ally[i % arena.spawns.ally.length];
      s.allies.push({
        id: 100 + i, x: a.x, z: a.z, y: W.arenaHeight(a.x, a.z), hp: 100, alive: true,
        fireT: 0.4 + i * 0.3, target: null, side: i % 2 ? 1 : -1, travel: 0, nav: null, stuck: 0
      });
    }
    s.prep = makePrep(cfg.support);
    s.squad = {
      phase: s.prep && s.prep.duration > 0 ? 'prepare' : 'fireflank',
      phaseT: 0, lastOrderT: -99, lastCue: -99,
      intel: { x: s.player.x, z: s.player.z, t: 0, conf: 0, seen: false, err: 0 },
      reports: [], flankSide: 1, flanksReady: 0, band: 0, bandT: 0,
      boundT: 0, boundGroup: 'fire', assaultT: 0, orderN: 0
    };
    s.prepWarn = s.prep.active ? 1 : prepCasMul(s.prep.level);
    logAI('phase', null, (s.squad.phase === 'prepare' ? 'prepare' : 'fireflank') + ' · 初始队形');
    UI.fpsSetup({
      title: cfg.title + ' · 前沿', sub: (D.FPS_BRIEFS[cfg.phase === 1 ? 'nianzhuang' : cfg.phase === 2 ? 'shuangduiji' : 'chenguangzhuang'] || {}).sub || '',
      enemyCount: s.enemies.length, allies: s.allies.length
    });
    UI.setScreen('fps_screen');
    UI.fpsWheel(true);
    bindInput();
    requestLock();
    if (HX.Audio) HX.Audio.startBattle();
    return true;
  };

  function requestLock() {
    const cv = F.renderer && F.renderer.canvas;
    if (!cv || !cv.requestPointerLock) return;
    try {
      const p = cv.requestPointerLock();
      if (p && p.catch) p.catch(() => { st.dragFallback = true; });
    } catch (e) { st.dragFallback = true; }
  }

  F.stop = function (result) {
    if (!st.active) return;
    st.active = false;
    if (document.exitPointerLock) document.exitPointerLock();
    UI.fpsWheel(true);
    if (HX.Audio) HX.Audio.stopBattle();
    const cb = st.cb;
    st.cb = null;
    const prep = st.prep ? {
      level: st.prep.level, skipped: !!st.prep.skipped, done: !!st.prep.done,
      fired: st.prep.fired, shells: st.prep.shells, dmg: Math.round(st.prep.dmg || 0)
    } : null;
    if (cb) cb(Object.assign({}, result || {}, { win: !!st.won, kills: st.kills, casualties: st.cas, prep }));
  };

  /* ---------------- 输入 ---------------- */
  function bindInput() {
    if (st.inputBound) return;
    st.inputBound = true;
    document.addEventListener('pointerlockchange', () => {
      st.locked = document.pointerLockElement === F.renderer.canvas;
      if (st.locked) st.lockAt = performance.now();
      st.mouseDX = 0; st.mouseDY = 0;
    });
    document.addEventListener('mousemove', (e) => {
      if (!st.active) return;
      // 刚获得指针锁定时浏览器会补发一次大位移，短暂忽略
      if (st.locked && performance.now() - (st.lockAt || 0) < 260) return;
      if (!st.locked && !st.dragFallback) return;
      // 锁定/解锁或自动化点击时浏览器可能给出异常大的位移，直接丢弃
      const rx = e.movementX || 0, ry = e.movementY || 0;
      if (Math.abs(rx) > 400 || Math.abs(ry) > 400) return;
      const mx = clamp(rx, -220, 220);
      const my = clamp(ry, -220, 220);
      if (st.locked) {
        st.mouseDX += mx;
        st.mouseDY += my;
      } else {
        // 指针锁定不可用时的回退：直接以鼠标位移控制视角
        st.dragFallback = true;
        st.mouseDX += mx;
        st.mouseDY += my;
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (!st.active) return;
      if (st.touchSeen && performance.now() - st.touchSeen < 500) return;
      if (e.target.closest && e.target.closest('.btn, .cmd-opt, .modal, .modal-wrap')) return;
      if (e.button === 0) { st.down = true; fire(); }
      if (e.button === 2) { st.ads = !st.ads; }
    });
    /* ---------------- 触屏：右半屏拖动视角 ---------------- */
    document.addEventListener('pointerdown', (e) => {
      if (!st.active || e.pointerType !== 'touch') return;
      if (e.target.closest && e.target.closest('.btn,.cmd-opt,.modal,.modal-wrap,.fps-stick,.fps-tbtns')) return;
      st.touchSeen = performance.now();
      st.dragFallback = true;
      st.touchLook = { id: e.pointerId, x: e.clientX, y: e.clientY };
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('pointermove', (e) => {
      if (!st.active || !st.touchLook || e.pointerId !== st.touchLook.id) return;
      const dx = e.clientX - st.touchLook.x, dy = e.clientY - st.touchLook.y;
      st.touchLook.x = e.clientX; st.touchLook.y = e.clientY;
      st.mouseDX += clamp(dx, -60, 60);
      st.mouseDY += clamp(dy, -60, 60);
    });
    document.addEventListener('pointerup', (e) => { if (st.touchLook && e.pointerId === st.touchLook.id) st.touchLook = null; });
    document.addEventListener('pointercancel', (e) => { if (st.touchLook && e.pointerId === st.touchLook.id) st.touchLook = null; });
    /* ---------------- 触屏：左半摇杆 ---------------- */
    const stick = document.getElementById('fpsStick');
    const knob = document.getElementById('fpsStickKnob');
    if (stick && knob) {
      let sid = null;
      const move = (e) => {
        if (e.pointerId !== sid) return;
        const r = stick.getBoundingClientRect();
        let dx = e.clientX - (r.left + r.width / 2);
        let dy = e.clientY - (r.top + r.height / 2);
        const max = r.width * 0.34;
        const len = Math.hypot(dx, dy) || 1;
        if (len > max) { dx *= max / len; dy *= max / len; }
        knob.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`;
        st.touchMove = { x: dx / max, y: dy / max };
      };
      stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; try { stick.setPointerCapture(sid); } catch (err) { /* ignore */ } move(e); e.preventDefault(); }, { passive: false });
      stick.addEventListener('pointermove', (e) => { move(e); e.preventDefault(); }, { passive: false });
      const end = (e) => { if (e.pointerId !== sid) return; sid = null; st.touchMove = null; knob.style.transform = 'translate(0,0)'; };
      stick.addEventListener('pointerup', end);
      stick.addEventListener('pointercancel', end);
    }
    const touchBtn = (id, down, up) => {
      const b = $(id);
      if (!b) return;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); st.touchSeen = performance.now(); down(); }, { passive: false });
      if (up) {
        b.addEventListener('pointerup', (e) => { e.stopPropagation(); up(); });
        b.addEventListener('pointercancel', () => up());
        b.addEventListener('pointerleave', () => up());
      }
    };
    touchBtn('btnFpsFire', () => { st.down = true; fire(); }, () => { st.down = false; });
    touchBtn('btnFpsReload', () => reload());
    touchBtn('btnFpsAds', () => { st.ads = !st.ads; });
    touchBtn('btnFpsCmd', () => { UI.fpsWheel(true); });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) st.down = false;
    });
    document.addEventListener('contextmenu', (e) => { if (st.active) e.preventDefault(); });
    document.addEventListener('keydown', (e) => {
      if (!st.active) return;
      st.keys[e.code] = true;
      if (e.code === 'KeyR') reload();
      if (e.code === 'KeyF') skipPrep();
      if (e.code === 'KeyC') st.player.crouch = !st.player.crouch;
      if (e.code === 'Space' && st.player.onGround) { st.player.jumpV = 3.4; st.player.onGround = false; }
      if (e.code === 'Digit1') cmd('focus');
      if (e.code === 'Digit2') cmd('flank');
      if (e.code === 'Digit3') cmd('suppress');
      if (e.code === 'Escape') F.stop({ win: false, kills: st.kills, casualties: st.cas, aborted: true });
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    document.addEventListener('keyup', (e) => { st.keys[e.code] = false; });
    const wheel = document.getElementById('cmdWheel');
    if (wheel) wheel.onclick = (ev) => {
      const o = ev.target.closest('.cmd-opt');
      if (o) cmd(o.dataset.cmd);
    };
    const cv = F.renderer && F.renderer.canvas;
    if (cv) cv.addEventListener('click', () => { if (st.active && !st.locked && !(st.touchSeen && performance.now() - st.touchSeen < 500)) requestLock(); });
  }

  function reload() {
    const p = st.player;
    if (st.reloading || p.ammo >= 30 || p.reserve <= 0) return;
    st.reloading = true; st.reloadT = 0;
    if (HX.Audio) HX.Audio.reload();
  }

  /* ---------------- 战术指令 ---------------- */
  function cmd(type) {
    if (st.cmdUsed || !st.active) return;
    st.cmdUsed = true;
    UI.fpsWheel(false);
    st.hintT = 2.6;
    if (type === 'focus') {
      st.hint = '集中火力：全连压制正面，敌军被迫转入交替掩护';
      st.suppressT = Math.max(st.suppressT, 8);
      st.focus = 10;
      st.spread = -0.5;
      for (let i = 0; i < 8; i++) st.shotTimes.push(st.t);
      if (st.squad) setPhase('bounding', '玩家集中火力压制');
      UI.killfeed('指令：集中火力');
    } else if (type === 'flank') {
      st.hint = '两翼包抄：友军从侧翼推进，敌军收缩';
      for (const a of st.allies) { a.side = a.side * -1; a.flank = 14; }
      if (st.squad) { st.squad.flankSide *= -1; setPhase('fireflank', '玩家命令两翼包抄'); }
      UI.killfeed('指令：两翼包抄');
    } else if (type === 'suppress') {
      st.hint = '火力压制：敌军射速下降 6 秒';
      st.suppressT = Math.max(st.suppressT, 6);
      st.suppressEnemy = 6;
      for (let i = 0; i < 6; i++) st.shotTimes.push(st.t);
      UI.killfeed('指令：火力压制');
    }
    if (HX.Audio) HX.Audio.whistle();
  }
  F.command = cmd;

  /* ---------------- 射击 ---------------- */
  function fire() {
    const p = st.player;
    if (!p || !p.alive || st.reloading) return;
    if (p.ammo <= 0) { reload(); return; }
    p.ammo--;
    st.shots++;
    st.shotTimes.push(st.t);
    if (st.shotTimes.length > 40) st.shotTimes.splice(0, st.shotTimes.length - 40);
    st.recoil = Math.min(0.30, st.recoil + (st.ads ? 0.012 : 0.022));
    st.spread = Math.min(1.6, st.spread + (st.ads ? 0.05 : 0.09));
    if (HX.Audio) HX.Audio.shot();
    // 射线
    const dir = camDir();
    const origin = [st.cam.pos[0], st.cam.pos[1], st.cam.pos[2]];
    const sp = 0.010 + st.spread * 0.02 + (p.crouch ? -0.004 : 0) + (st.ads ? -0.006 : 0);
    let dx = dir[0] + (Math.random() - 0.5) * sp;
    let dy = dir[1] + (Math.random() - 0.5) * sp * 0.85;
    let dz = dir[2] + (Math.random() - 0.5) * sp;
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;

    let hitE = null, hitT = 999;
    for (const e of st.enemies) {
      if (!e.alive) continue;
      const ex = e.x - origin[0], ey = (e.y + 1.05) - origin[1], ez = e.z - origin[2];
      const b = ex * dx + ey * dy + ez * dz;
      const c = ex * ex + ey * ey + ez * ez - 0.62 * 0.62;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t0 = b - Math.sqrt(disc);
      if (t0 < 0.3 || t0 > 160) continue;
      if (W.losBlocked(st.arena, origin[0], origin[2], e.x, e.z)) continue;
      if (t0 < hitT) { hitT = t0; hitE = e; }
    }
    // 地面 / 掩体命中点
    let endT = 120;
    if (hitE) endT = hitT;
    else {
      // 与地面求交（近似：y=heightAt）
      let tt = 1;
      for (let i = 1; i < 120; i++) {
        tt = i * 1.0;
        const px = origin[0] + dx * tt, pz = origin[2] + dz * tt;
        const py = W.arenaHeight(px, pz);
        if (origin[1] + dy * tt <= py) { endT = tt; break; }
      }
      if (endT > 120) endT = 120;
    }
    const hx = origin[0] + dx * endT, hy = origin[1] + dy * endT, hz = origin[2] + dz * endT;

    // 曳光
    st.tracers.push({ x0: origin[0] + dir[0] * 0.6, y0: origin[1] - 0.1, z0: origin[2] + dir[2] * 0.6, x1: hx, y1: hy, z1: hz, t: 0.09 });
    // 枪口火光
    st.particles.push({ x: origin[0] + dir[0] * 0.65, y: origin[1] - 0.05, z: origin[2] + dir[2] * 0.65, life: 0.06, max: 0.06, size: 0.45, col: [1, 0.75, 0.35], add: true });
    if (hitE) {
      hitE.hp -= 36;
      hitE.hitT = st.t;
      st.hits++;
      UI.hitmarker(hitE.hp <= 0);
      if (HX.Audio) HX.Audio.hit();
      st.particles.push({ x: hitE.x, y: hitE.y + 1.0, z: hitE.z, life: 0.45, max: 0.45, size: 0.7, col: [0.75, 0.15, 0.12], add: false });
      for (let i = 0; i < 4; i++) {
        st.particles.push({ x: hitE.x, y: hitE.y + 1.0, z: hitE.z, vx: (Math.random() - 0.5) * 1.6, vy: Math.random() * 1.4, vz: (Math.random() - 0.5) * 1.6, life: 0.55, max: 0.55, size: 0.16, col: [0.65, 0.12, 0.09], add: false, grav: 2.2 });
      }
      if (hitE.hp <= 0) killEnemy(hitE);
    } else {
      st.particles.push({ x: hx, y: hy, z: hz, life: 0.85, max: 0.85, size: 0.85, col: [0.55, 0.48, 0.38], add: false });
      for (let i = 0; i < 5; i++) st.particles.push({ x: hx, y: hy + 0.1, z: hz, vx: (Math.random() - 0.5) * 1.2, vy: Math.random() * 1.2, vz: (Math.random() - 0.5) * 1.2, life: 0.8, max: 0.8, size: 0.3, col: [0.5, 0.45, 0.36], add: false, grav: 1.4 });
    }
  }

  function killEnemy(e) {
    e.alive = false;
    e.deathT = st.t;
    st.kills++;
    UI.killfeed('击毙 敌军士兵');
    if (HX.Audio) HX.Audio.kill();
    for (let i = 0; i < 8; i++) st.particles.push({ x: e.x, y: e.y + 0.9, z: e.z, vx: (Math.random() - 0.5) * 2.4, vy: Math.random() * 2, vz: (Math.random() - 0.5) * 2.4, life: 1.0, max: 1.0, size: 0.25, col: [0.6, 0.12, 0.08], add: false, grav: 2.5 });
  }

  function camDir() {
    const p = st.player;
    const pitch = p.pitch + st.recoil * 0.5;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    return [Math.sin(p.yaw) * cp, sp, Math.cos(p.yaw) * cp];
  }

  /* ---------------- 更新 ---------------- */
  F.update = function (dt) {
    if (!st.active) return;
    const d = Math.min(0.05, dt);
    step(d);
    const prep = st.prep;
    let stateText = '指挥员亲临 · 一线火力支援';
    if (prep) {
      if (prep.active) {
        stateText = `炮火准备 ${Math.max(0, Math.ceil(prep.duration - prep.t))}s · ${ART.levelText[prep.level] || prep.level} · ${prep.fired}/${prep.shells} 发 · 按 F 提前冲锋`;
      } else {
        stateText = `炮火：${ART.levelText[prep.level] || prep.level}${prep.skipped ? ' · 提前冲锋（伤亡↑）' : ' · 已结束'} · 覆盖 ${prep.radius}`;
      }
    }
    if (st.squad) stateText += ` · 敌情：${({ fireflank: '火力+包抄', assault: '冲击', bounding: '交替后撤', clear: '逐段清剿', prepare: '隐蔽' })[st.squad.phase] || st.squad.phase}`;
    UI.fpsUpdate({
      enemies: st.enemies.filter((e) => e.alive).length,
      allies: st.allies.filter((a) => a.alive).length,
      time: (st.cfg.limit || 150) - st.t,
      hp: st.player ? st.player.hp : 0,
      ammo: st.player ? st.player.ammo : 0,
      reserve: st.player ? st.player.reserve : 0,
      gun: '步枪 · 半自动',
      ads: st.ads,
      spread: st.spread + (st.player && st.player.crouch ? -0.3 : 0),
      suppressed: st.suppressT > 0,
      hint: st.hintT > 0 ? (st.hint || '') : null,
      stateText,
      cue: st.cueT > 0 ? st.cueText : null
    });
    st.hintT = Math.max(0, st.hintT - d);
  };

  function step(dt) {
    const p = st.player;
    if (!p) return;
    st.t += dt;
    if (st.t > (st.cfg.limit || 150)) {
      endBattle(false);
      return;
    }
    // 视角
    if (st.locked || st.dragFallback) {
      const sens = st.ads ? 0.0021 : 0.0034;
      p.yaw -= st.mouseDX * sens;
      p.pitch -= st.mouseDY * sens;
      p.pitch = clamp(p.pitch, -1.3, 1.25);
    }
    st.mouseDX = 0; st.mouseDY = 0;
    st.recoil = Math.max(0, st.recoil - dt * 2.4);
    st.spread = Math.max(0, st.spread - dt * 1.8);
    st.suppressT = Math.max(0, st.suppressT - dt);
    st.cueT = Math.max(0, st.cueT - dt);
    if (st.focus) st.focus -= dt;
    updatePrep(dt);
    if (!p.alive) return;

    // 移动
    const fwd = [Math.sin(p.yaw), 0, Math.cos(p.yaw)];
    const right = [Math.cos(p.yaw), 0, -Math.sin(p.yaw)];
    let mx = 0, mz = 0;
    if (st.keys['KeyW']) { mx += fwd[0]; mz += fwd[2]; }
    if (st.keys['KeyS']) { mx -= fwd[0]; mz -= fwd[2]; }
    if (st.keys['KeyD']) { mx += right[0]; mz += right[2]; }
    if (st.keys['KeyA']) { mx -= right[0]; mz -= right[2]; }
    let stickMag = 0;
    if (st.touchMove) {
      const tx = st.touchMove.x, ty = st.touchMove.y;
      mx += fwd[0] * (-ty) + right[0] * tx;
      mz += fwd[2] * (-ty) + right[2] * tx;
      stickMag = Math.hypot(tx, ty);
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    let speed = (st.keys['ShiftLeft'] || st.keys['ShiftRight'] || stickMag > 0.92) ? 5.2 : 3.3;
    if (p.crouch) speed = 1.7;
    if (st.ads) speed *= 0.55;
    const nx = p.x + mx * speed * dt, nz = p.z + mz * speed * dt;
    const rad = p.radius;
    if (!W.isBlocked(st.arena, nx, p.z, rad) && Math.abs(nx) < 44) p.x = nx;
    if (!W.isBlocked(st.arena, p.x, nz, rad) && Math.abs(nz) < 44) p.z = nz;
    // 跳跃
    p.jumpV -= 12 * dt;
    let py = W.arenaHeight(p.x, p.z);
    if (!p.onGround || p.jumpV > 0) {
      p.y += p.jumpV * dt;
      if (p.y <= py) { p.y = py; p.jumpV = 0; p.onGround = true; }
    } else p.y = py;
    const eyeH = p.crouch ? 1.22 : 1.72;
    st.cam.pos[0] = p.x; st.cam.pos[1] = p.y + eyeH; st.cam.pos[2] = p.z;
    const dir = camDir();
    st.cam.target[0] = p.x + dir[0] * 8;
    st.cam.target[1] = st.cam.pos[1] + dir[1] * 8;
    st.cam.target[2] = p.z + dir[2] * 8;
    st.cam.fov = st.ads ? 56 : 78;

    // 换弹
    if (st.reloading) {
      st.reloadT += dt;
      if (st.reloadT > 2.0) {
        const need = 30 - p.ammo;
        const take = Math.min(need, p.reserve);
        p.ammo += take; p.reserve -= take;
        st.reloading = false; st.reloadT = 0;
        if (HX.Audio) HX.Audio.reloadDone();
      }
    }
    // 自动射击（半自动需重复点击，按住则按射速）
    if (st.down) { st.fireCd = (st.fireCd || 0) - dt; if (st.fireCd <= 0) { fire(); st.fireCd = 0.14; } }

    updateAI(dt);
    updateParticles(dt);
    if (st.enemies.every((e) => !e.alive)) endBattle(true);
  }

  function endBattle(win) {
    if (st.ending) return;
    st.ending = true;
    st.won = win;
    if (win) {
      UI.fpsResult('<b style="color:#ffb26b">阵地已夺取</b> · 正在返回指挥部…');
      if (HX.Audio) HX.Audio.victory();
    }
    setTimeout(() => {
      F.stop({ win: !!win, kills: st.kills, casualties: st.cas });
    }, win ? 1500 : 900);
  }

  /* ---------------- 炮火准备（与战役层弹药耦合） ---------------- */
  function prepCasMul(level) { return (ART.prepCasMul && ART.prepCasMul[level]) || 1; }

  function makePrep(sup) {
    const level = (sup && sup.level) || 'full';
    const duration = sup && sup.duration != null ? sup.duration : (ART.duration[level] || 0);
    const shells = sup && sup.shells != null ? sup.shells : (ART.shells[level] || 0);
    const radius = sup && sup.radius != null ? sup.radius : (ART.radius[level] || 0);
    const plan = sup || { level, duration, shells, radius, dmgMul: (ART.dmgMul && ART.dmgMul[level]) || 1 };
    const center = { x: -6, z: -19 };
    const marks = [];
    for (let i = 0; i < shells; i++) {
      let cx = center.x, cz = center.z;
      // 观炮修正：2/3 落点直接压在已知敌军位置上，1/3 面积散布
      const live = st.enemies.filter((e) => e.alive);
      if (live.length && i % 3 !== 2) {
        const e = live[Math.floor(aiRnd() * live.length)];
        cx = e.x + (aiRnd() - 0.5) * 3.2;
        cz = e.z + (aiRnd() - 0.5) * 3.2;
      } else {
        const a = aiRnd() * Math.PI * 2, r = Math.sqrt(aiRnd()) * radius;
        cx = center.x + Math.cos(a) * r;
        cz = center.z + Math.sin(a) * r * 0.7;
      }
      marks.push({
        x: cx, z: cz,
        due: shells ? (i + 1) / (shells + 1) * duration : 0,
        done: false
      });
    }
    const active = shells > 0 && duration > 0;
    return {
      level, plan, duration, shells, radius, marks, t: 0,
      active, done: !active, skipped: false, fired: 0, dmg: 0, hits: 0,
      state: active ? 'preparing' : 'none'
    };
  }

  function skipPrep() {
    const pr = st.prep;
    if (!pr || !pr.active) return;
    pr.skipped = true; pr.active = false; pr.done = true;
    st.prepWarn = prepCasMul('skipped');
    cue('prep_skip', '提前冲锋：炮火准备中断（伤亡×2.4）');
    logAI('prep_skip', null, 'player charged early');
    if (HX.Audio) HX.Audio.whistle();
  }
  F.skipPrep = skipPrep;

  function updatePrep(dt) {
    const pr = st.prep;
    if (!pr) return;
    if (pr.active) {
      pr.t += dt;
      for (const m of pr.marks) {
        if (!m.done && pr.t >= m.due) { m.done = true; shellImpact(m, pr); }
      }
      if (pr.t >= pr.duration) {
        pr.active = false; pr.done = true; pr.state = 'done';
        st.prepWarn = pr.skipped ? prepCasMul('skipped') : prepCasMul(pr.level);
        if (!pr.skipped) cue('prep_done', `炮火准备完毕（${ART.levelText[pr.level] || pr.level}，${pr.fired} 发）`);
        logAI('prep_done', null, `level=${pr.level} shells=${pr.fired}`);
      }
    }
  }

  function shellImpact(m, pr) {
    pr.fired++;
    const plan = pr.plan;
    const y = W.arenaHeight(m.x, m.z);
    st.particles.push({ x: m.x, y: y + 0.9, z: m.z, life: 1.2, max: 1.2, size: 3.4, col: [1, 0.55, 0.18], add: true });
    for (let i = 0; i < 7; i++) {
      st.particles.push({
        x: m.x, y: y + 0.3, z: m.z,
        vx: (aiRnd() - 0.5) * 5, vy: aiRnd() * 3, vz: (aiRnd() - 0.5) * 5,
        life: 1.3, max: 1.3, size: 1.1, col: [0.40, 0.35, 0.30], add: false, grav: 2.2
      });
    }
    if (HX.Audio) HX.Audio.explosion();
    // 对敌：开阔地全额，壕内 0.26、墙后 0.42、屋内 0.5
    for (const e of st.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - m.x, e.z - m.z);
      let dmg = HX.Sim && HX.Sim.shellDamage ? HX.Sim.shellDamage(plan, d, W.coverClass(st.arena, e.x, e.z)) : 0;
      if (!dmg) continue;
      e.hp -= dmg; e.hitT = st.t; pr.dmg += dmg; pr.hits++;
      st.particles.push({ x: e.x, y: e.y + 1.0, z: e.z, life: 0.5, max: 0.5, size: 0.8, col: [0.7, 0.15, 0.1], add: false });
      if (e.hp <= 0) killEnemy(e);
    }
    // 友军也会被覆盖（减半）
    for (const a of st.allies) {
      if (!a.alive) continue;
      const d = Math.hypot(a.x - m.x, a.z - m.z);
      let dmg = HX.Sim && HX.Sim.shellDamage ? HX.Sim.shellDamage(plan, d, W.coverClass(st.arena, a.x, a.z)) : 0;
      if (!dmg) continue;
      a.hp -= dmg * 0.5;
      if (a.hp <= 0) { a.alive = false; }
    }
    // 玩家误入覆盖区
    const p = st.player;
    if (p && p.alive) {
      const d = Math.hypot(p.x - m.x, p.z - m.z);
      let dmg = HX.Sim && HX.Sim.shellDamage ? HX.Sim.shellDamage(plan, d, W.coverClass(st.arena, p.x, p.z)) : 0;
      if (dmg > 0) {
        p.hp -= dmg * 0.6 * (p.crouch ? 0.75 : 1);
        st.flash = 1;
        UI.damageDir(0);
        if (p.hp <= 0) {
          p.alive = false; p.hp = 0; UI.fpsDeath();
          if (HX.Audio) HX.Audio.death();
          setTimeout(() => F.stop({ win: false, kills: st.kills, casualties: st.cas + 600 }), 1200);
        }
      }
    }
  }

  /* ---------------- 小队指挥：协同、通信延迟、视野 ---------------- */
  function logAI(action, e, note) {
    const sq = st.squad;
    const it = sq ? sq.intel : null;
    st.aiLog.push({
      t: +st.t.toFixed(2), action, unit: e ? e.id : 'cmd',
      group: e ? e.group : (sq ? sq.phase : '-'),
      x: e ? +e.x.toFixed(2) : null, z: e ? +e.z.toFixed(2) : null,
      intelAge: it && it.t >= 0 ? +(st.t - it.t).toFixed(1) : null,
      intelErr: it ? +(it.err || 0).toFixed(1) : null,
      note: note || ''
    });
    if (st.aiLog.length > 360) st.aiLog.shift();
  }

  function cue(key, text) {
    st.cueText = text; st.cueT = 4;
    UI.killfeed(text);
    logAI('cue', null, key);
  }

  function setPhase(ph, why) {
    const sq = st.squad;
    if (!sq || (sq.phase === ph && ph !== 'assault')) return;
    sq.phase = ph; sq.phaseT = 0; sq.orderN++; sq.assaultT = 0; sq.flanksReady = 0;
    if (ph === 'bounding') { sq.boundT = 0; sq.boundGroup = sq.boundGroup === 'fire' ? 'flank' : 'fire'; }
    if (ph === 'clear') { sq.band = 0; sq.bandT = 0; }
    for (const e of st.enemies) { e.flankPick = null; e.nav = null; }
    logAI('phase', null, ph + (why ? ' · ' + why : ''));
    const txt = AID.cueText[ph];
    if (txt) cue(ph, txt);
  }

  function perceive(e, dt) {
    const p = st.player;
    if (!p || !p.alive) return;
    e.sightT -= dt;
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    const los = d < AID.sightRange && !W.losBlocked(st.arena, e.x, e.z, p.x, p.z);
    e.seen = los;
    if (!los) return;
    e.lastSeen = { x: p.x, z: p.z, t: st.t };
    if (e.sightT > 0) return;
    e.sightT = AID.intelDelay * (0.85 + aiRnd() * 0.35);
    st.squad.reports.push({
      due: st.t + AID.intelDelay * (0.9 + aiRnd() * 0.3),
      x: p.x + (aiRnd() - 0.5) * 1.4, z: p.z + (aiRnd() - 0.5) * 1.4,
      t: st.t, from: e.id
    });
    logAI('spot', e, 'saw player');
  }

  function intelPoint(e) {
    const it = st.squad.intel;
    const err = it.err || 0;
    return {
      x: it.x + Math.cos((e.id + 1) * 1.7) * err * 0.7,
      z: it.z + Math.sin((e.id + 1) * 1.3) * err * 0.7,
      age: st.t - it.t, err
    };
  }

  /* ---------------- 寻路（网格 A* + 平滑 + 局部避让） ---------------- */
  function buildNav(arena) {
    const cs = NAV.cell, half = NAV.half, n = Math.round((half * 2) / cs) + 1;
    const ox = -half, oz = -half;
    const N = n * n;
    const blocked = new Uint8Array(N), cost = new Float32Array(N).fill(1);
    let blockedN = 0, trenchN = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, x = ox + i * cs, z = oz + j * cs;
      if (i === 0 || j === 0 || i === n - 1 || j === n - 1 || W.isBlocked(arena, x, z, NAV.radius)) { blocked[k] = 1; blockedN++; continue; }
      if (W.inTrench(arena, x, z)) { cost[k] = NAV.trenchCost; trenchN++; }
    }
    return {
      arena, cs, n, ox, oz, N, blocked, cost, blockedN, trenchN,
      g: new Float32Array(N), came: new Int32Array(N),
      stG: new Int32Array(N), stC: new Int32Array(N), gen: 0,
      heapI: new Int32Array(N + 8), heapF: new Float32Array(N + 8)
    };
  }

  function cellOf(x, z) {
    let i = Math.round((x - nav.ox) / nav.cs), j = Math.round((z - nav.oz) / nav.cs);
    i = clamp(i, 0, nav.n - 1); j = clamp(j, 0, nav.n - 1);
    return [i, j];
  }

  // 目标落在障碍内时，就近找可用格（取离单位最近的一圈候选，避免选到墙后另一侧）
  function nearestFree(i, j, ux, uz) {
    const n = nav.n, b = nav.blocked;
    if (!b[j * n + i]) return [i, j];
    for (let r = 1; r <= 5; r++) {
      let best = null, bd = 1e9;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        if (b[jj * n + ii]) continue;
        const wx = nav.ox + ii * nav.cs, wz = nav.oz + jj * nav.cs;
        const d = Math.hypot(wx - ux, wz - uz);
        if (d < bd) { bd = d; best = [ii, jj]; }
      }
      if (best) return best;
    }
    return null;
  }

  function astar(si, sj, ti, tj) {
    const n = nav.n, b = nav.blocked, cost = nav.cost, g = nav.g, came = nav.came;
    const stG = nav.stG, stC = nav.stC, heapI = nav.heapI, heapF = nav.heapF;
    nav.gen++; const gen = nav.gen;
    let hn = 0;
    const push = (k, f) => {
      let p = hn++; heapI[p] = k; heapF[p] = f;
      while (p > 0) {
        const q = (p - 1) >> 1;
        if (heapF[q] <= heapF[p]) break;
        const ti2 = heapI[q], tf2 = heapF[q];
        heapI[q] = heapI[p]; heapF[q] = heapF[p]; heapI[p] = ti2; heapF[p] = tf2;
        p = q;
      }
    };
    const pop = () => {
      const top = heapI[0];
      hn--;
      if (hn > 0) {
        heapI[0] = heapI[hn]; heapF[0] = heapF[hn];
        let p = 0;
        for (;;) {
          const l = p * 2 + 1, r = l + 1;
          let m = p;
          if (l < hn && heapF[l] < heapF[m]) m = l;
          if (r < hn && heapF[r] < heapF[m]) m = r;
          if (m === p) break;
          const ti2 = heapI[m], tf2 = heapF[m];
          heapI[m] = heapI[p]; heapF[m] = heapF[p]; heapI[p] = ti2; heapF[p] = tf2;
          p = m;
        }
      }
      return top;
    };
    const hcost = (i, j) => {
      const dx = Math.abs(i - ti), dz = Math.abs(j - tj);
      return (dx + dz) + (Math.sqrt(2) - 1) * Math.min(dx, dz);
    };
    const sk = sj * n + si, tk = tj * n + ti;
    g[sk] = 0; stG[sk] = gen; came[sk] = -1;
    push(sk, hcost(si, sj));
    let iter = 0;
    while (hn > 0 && iter++ < 20000) {
      const k = pop();
      if (stC[k] === gen) continue;
      stC[k] = gen;
      if (k === tk) break;
      const i = k % n, j = (k - i) / n;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const kk = jj * n + ii;
        if (b[kk]) continue;
        if (di && dj) { // 斜向不许切角
          if (b[j * n + ii] || b[jj * n + i]) continue;
        }
        const step = (di && dj ? Math.SQRT2 : 1) * cost[kk];
        const ng = g[k] + step;
        if (stG[kk] !== gen || ng < g[kk]) {
          stG[kk] = gen; g[kk] = ng; came[kk] = k;
          push(kk, ng + hcost(ii, jj));
        }
      }
    }
    if (stC[tk] !== gen) return null;
    const out = [];
    let k = tk;
    while (k !== -1 && out.length < NAV.maxPath) { out.push(k); k = came[k]; }
    return out.reverse();
  }

  function navClear(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(2, Math.ceil(d / 0.5));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (W.isBlocked(st.arena, ax + (bx - ax) * t, az + (bz - az) * t, 0.5)) return false;
    }
    return true;
  }

  // 视线平滑：能直达就跳过中间点，消除锯齿
  function smoothPath(pts, sx, sz) {
    const out = [];
    let cx = sx, cz = sz, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !navClear(cx, cz, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]);
      cx = pts[j].x; cz = pts[j].z;
      i = j + 1;
      if (out.length > NAV.maxPath) break;
    }
    return out;
  }

  function requestPath(e, tx, tz) {
    if (!nav) return false;
    if (st.navQuota <= 0) { st.navStats.dropped++; return false; }
    st.navQuota--; st.navStats.calls++;
    const t0 = performance.now ? performance.now() : 0;
    const [si, sj] = cellOf(e.x, e.z);
    let [ti, tj] = cellOf(tx, tz);
    const tf = nearestFree(ti, tj, e.x, e.z);
    if (!tf) { st.navStats.fails++; return false; }
    ti = tf[0]; tj = tf[1];
    const sf = nearestFree(si, sj, e.x, e.z);
    const cells = sf ? astar(sf[0], sf[1], ti, tj) : null;
    const ms = (performance.now ? performance.now() : 0) - t0;
    st.navStats.lastMs = +(ms).toFixed(2);
    if (!cells || cells.length < 2) {
      st.navStats.fails++;
      e.nav = { tx, tz, path: null, idx: 0, t: st.t };
      return false;
    }
    const pts = [];
    for (const k of cells) {
      const i = k % nav.n, j = (k - i) / nav.n;
      pts.push({ x: nav.ox + i * nav.cs, z: nav.oz + j * nav.cs });
    }
    pts[pts.length - 1] = { x: tx, z: tz };
    const sm = smoothPath(pts, e.x, e.z);
    e.nav = { tx, tz, path: sm, idx: 0, t: st.t };
    st.navStats.lastLen = sm.length;
    return true;
  }

  function separation(e) {
    let sx = 0, sz = 0;
    const others = [];
    for (const o of st.enemies) if (o.alive && o !== e) others.push(o);
    for (const o of st.allies) if (o.alive) others.push(o);
    if (st.player && st.player.alive) others.push(st.player);
    for (const o of others) {
      const dx = e.x - o.x, dz = e.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.6 && d > 0.02) {
        const w = (1.6 - d) / 1.6;
        sx += dx / d * w; sz += dz / d * w;
      }
    }
    const l = Math.hypot(sx, sz);
    if (l > 1) { sx /= l; sz /= l; }
    return { x: sx, z: sz };
  }

  // 统一移动入口：直线通畅就直走；否则沿缓存路径逐点前进（每帧有限预算）
  function moveTo(e, tx, tz, spd, dt) {
    if (!nav || st.navMode === 'legacy') { moveStep(e, tx, tz, spd, dt); return; }
    const d = Math.hypot(tx - e.x, tz - e.z);
    if (d < 3.0 || navClear(e.x, e.z, tx, tz)) {
      e.nav = null;
      moveStep(e, tx, tz, spd, dt);
      return;
    }
    const np = e.nav;
    const need = !np || !np.path || Math.hypot(np.tx - tx, np.tz - tz) > NAV.replan;
    if (need) {
      const ok = requestPath(e, tx, tz);
      if (!ok && !(e.nav && e.nav.path)) { moveStep(e, tx, tz, spd, dt); return; }
    } else if (np && np.path) {
      st.navStats.hits++;
    }
    const p = e.nav && e.nav.path;
    if (!p || !p.length) { moveStep(e, tx, tz, spd, dt); return; }
    let wp = p[Math.min(e.nav.idx, p.length - 1)];
    while (Math.hypot(wp.x - e.x, wp.z - e.z) < NAV.wpReach && e.nav.idx < p.length - 1) {
      e.nav.idx++; wp = p[e.nav.idx];
    }
    if (e.nav.idx >= p.length - 1 && Math.hypot(tx - e.x, tz - e.z) < 4.5) {
      e.nav = null;
      moveStep(e, tx, tz, spd, dt);
      return;
    }
    const sep = separation(e);
    const ax = wp.x + sep.x * 0.4, az = wp.z + sep.z * 0.4;
    const b0x = e.x, b0z = e.z;
    moveStep(e, ax, az, spd, dt);
    // 局部避障：连续被堵 → 丢弃路径、下一帧重算，避免原地抖动
    if (Math.hypot(e.x - b0x, e.z - b0z) < spd * dt * 0.35) e.stuck += dt; else e.stuck = 0;
    if (e.stuck > NAV.stuckT) { e.nav = null; e.stuck = 0; }
  }

  function moveStep(e, tx, tz, spd, dt) {
    const dx = tx - e.x, dz = tz - e.z, l = Math.hypot(dx, dz);
    if (l < 0.01) return;
    const p0x = e.x, p0z = e.z;
    const step = spd * dt;
    let nx = e.x + dx / l * step, nz = e.z + dz / l * step;
    let moved = false;
    if (!W.isBlocked(st.arena, nx, e.z, 0.45)) { e.x = nx; moved = true; }
    if (!W.isBlocked(st.arena, e.x, nz, 0.45)) { e.z = nz; moved = true; }
    // 贴墙滑动：正面被挡时沿墙切向走，作为寻路失效时的兜底
    if (!moved) {
      const side = e.id % 2 ? 1 : -1;
      const sx = e.x - dz / l * step * side, sz = e.z + dx / l * step * side;
      if (!W.isBlocked(st.arena, sx, e.z, 0.45)) e.x = sx;
      if (!W.isBlocked(st.arena, e.x, sz, 0.45)) e.z = sz;
    }
    e.travel = (e.travel || 0) + Math.hypot(e.x - p0x, e.z - p0z);
    e.y = W.arenaHeight(e.x, e.z);
  }

  function updateSquad(dt) {
    const sq = st.squad;
    if (!sq) return;
    sq.phaseT += dt;
    // 通信延迟：情报按 due 时刻到达指挥官
    const arrived = sq.reports.filter((r) => r.due <= st.t);
    if (arrived.length) {
      const last = arrived[arrived.length - 1];
      sq.intel = { x: last.x, z: last.z, t: last.t, conf: 66 + Math.round(aiRnd() * 18), seen: true, err: 0 };
      sq.reports = sq.reports.filter((r) => r.due > st.t);
      logAI('intel', null, `age=${+(st.t - last.t).toFixed(1)}h? conf=${sq.intel.conf}% from=${last.from}`);
    }
    const age = st.t - sq.intel.t;
    sq.intel.err = age > AID.intelStale ? Math.min(9, (age - AID.intelStale) * AID.intelError) : 0;
    sq.flanksReady = st.enemies.filter((x) => x.alive && x.group === 'flank' && x.flankAt && st.t - x.flankAt < 2.5).length;

    if (sq.phase === 'prepare') {
      if (!st.prep || !st.prep.active) setPhase('fireflank', '炮火结束，转入协同推进');
      return;
    }
    const shots = st.shotTimes.filter((t) => st.t - t <= AID.pressureWindow).length;
    if (shots >= AID.pressureShots && sq.phase !== 'bounding') {
      setPhase('bounding', `玩家 ${AID.pressureWindow}s 内射击 ${shots} 发`);
      return;
    }
    if (sq.phase === 'bounding') {
      sq.boundT += dt;
      if (sq.boundT > AID.boundingSwap) {
        sq.boundT = 0;
        sq.boundGroup = sq.boundGroup === 'fire' ? 'flank' : 'fire';
        logAI('bound_swap', null, '交替后撤：' + sq.boundGroup + ' 组后撤');
      }
      if (sq.phaseT > AID.boundingSpan) setPhase('fireflank', '脱离压制');
      return;
    }
    if (sq.phase === 'fireflank') {
      // 侧翼是否到位（由战术移动写入），到位即转入冲击
      if (sq.flanksReady >= 1 && sq.phaseT > 2.9) setPhase('assault', `侧翼 ${sq.flanksReady} 人到位`);
      else if (sq.phaseT > 22.0) setPhase('clear', '包抄未果，改逐段清剿');
      // 被包抄提示（可读性）
      if (sq.phaseT > 1.5 && sq.flanksReady >= 1 && st.t - (sq.lastFlankWarn || -99) > 3) {
        sq.lastFlankWarn = st.t;
        cue('flank_warn', '敌军侧翼组已绕到你的侧后');
        const p = st.player;
        const rel = Math.atan2(st.enemies.find((x) => x.alive && x.group === 'flank') ? st.enemies.find((x) => x.alive && x.group === 'flank').x - p.x : 1, 1);
        UI.damageDir(((rel - p.yaw) * 180 / Math.PI + 360) % 360);
      }
      return;
    }
    if (sq.phase === 'assault') {
      if (sq.phaseT > AID.assaultHold) setPhase('clear', '冲击结束，转入清剿');
      return;
    }
    if (sq.phase === 'clear') {
      const band = Math.min(AID.clearBands - 1, Math.floor(sq.phaseT / AID.clearHold));
      if (band !== sq.band) {
        sq.band = band;
        logAI('clear_band', null, `推进至第 ${band + 1} 段 / ${AID.clearBands}`);
      }
      if (sq.phaseT > AID.clearHold * AID.clearBands) setPhase('fireflank', '清剿完毕，重新组织');
    }
  }

  function tacticalMove(e, dt) {
    const sq = st.squad;
    const ip = intelPoint(e);
    const stg = sq.phase;
    if (stg === 'prepare') {
      if (!e.cover) e.cover = W.nearestCover(st.arena, e.x, e.z, ip.x, ip.z, 11);
      if (e.cover) moveTo(e, e.cover.x, e.cover.z, 1.4, dt);
      e.ai = 'hunker'; e.cue = 0;
      return;
    }
    if (stg === 'fireflank') {
      const ang = Math.atan2(e.z - ip.z, e.x - ip.x);
      if (e.group === 'fire') {
        const want = 21 + (e.id % 3) * 2.4;
        moveTo(e, ip.x + Math.cos(ang) * want, ip.z + Math.sin(ang) * want, 1.7, dt);
        e.ai = 'suppress'; e.cue = 1;
      } else {
        // 侧翼目标锚定在「已知玩家位置」的固定侧后方；每次情报更新才重算，避免逐帧抖动
        const key = sq.intel.t;
        if (!e.flankPick || e.flankPick.k !== key) {
          const base = Math.atan2(-30 - ip.z, -4 - ip.x);
          const aa = (e.id % 3 - 1) * 0.16;
          const rr = 8.6 + (e.id % 2) * 1.1;
          let tx0 = ip.x, tz0 = ip.z;
          for (const da of [0, 0.22, -0.22, 0.42, -0.42]) {
            const a2 = base + sq.flankSide * (AID.flankArc + da) + aa;
            tx0 = ip.x + Math.cos(a2) * rr; tz0 = ip.z + Math.sin(a2) * rr;
            if (!W.isBlocked(st.arena, tx0, tz0, 0.5)) break;
          }
          e.flankPick = { k: key, tx: tx0, tz: tz0 };
        }
        const tx = e.flankPick.tx, tz = e.flankPick.tz;
        moveTo(e, tx, tz, 2.6, dt);
        e.ai = 'flank'; e.cue = 2;
        const reach = Math.hypot(e.x - tx, e.z - tz);
        if (reach < AID.flankReach) e.flankAt = st.t;
        e.logT -= dt;
        if (e.logT <= 0) { e.logT = 2.0; logAI('flank_move', e, `to (${tx.toFixed(1)},${tz.toFixed(1)}) remain ${reach.toFixed(1)}`); }
      }
      return;
    }
    if (stg === 'assault') {
      const tx = ip.x + (e.group === 'fire' ? 6 : -5);
      const tz = ip.z + (e.group === 'fire' ? 4 : -3);
      moveTo(e, tx, tz, e.group === 'fire' ? 2.3 : 2.7, dt);
      e.ai = 'assault'; e.cue = 3;
      return;
    }
    if (stg === 'bounding') {
      if (e.group === sq.boundGroup) {
        const ang = Math.atan2(e.z - ip.z, e.x - ip.x);
        moveTo(e, e.x + Math.cos(ang) * AID.boundingStep, e.z + Math.sin(ang) * AID.boundingStep, 2.3, dt);
        e.ai = 'retreat'; e.cue = 4;
      } else {
        e.ai = 'coverfire'; e.cue = 1;
        if (!e.cover) e.cover = W.nearestCover(st.arena, e.x, e.z, ip.x, ip.z, 9);
        if (e.cover) moveTo(e, e.cover.x, e.cover.z, 1.2, dt);
      }
      return;
    }
    if (stg === 'clear') {
      const band = Math.min(AID.clearBands - 1, Math.floor(sq.phaseT / AID.clearHold));
      const baseZ = ip.z - 20 + band * AID.clearSegment;
      const lane = ((e.id % 4) - 1.5) * 4.5;
      const tx = ip.x + lane;
      const forward = baseZ > e.z;
      // 不越过未清理段：到达当前段目标后原地据枪
      if (forward ? e.z < baseZ : e.z > baseZ) moveTo(e, tx, baseZ, 1.5, dt);
      else if (Math.abs(e.x - tx) > 1.2) moveTo(e, tx, e.z, 1.2, dt);
      e.ai = 'clear'; e.cue = 5;
      return;
    }
  }

  function enemyFire(e, dt) {
    const p = st.player;
    if (!p || !p.alive) return;
    const sq = st.squad;
    e.fireT -= dt;
    if (e.fireT > 0) return;
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    // 只有自己看见玩家才能精确射击——没看见就打不准
    let can = e.seen && d < AID.fireRange;
    if (sq.phase === 'prepare' && st.prep && st.prep.active) can = can && aiRnd() < 0.25;
    if (e.ai === 'flank') can = can && aiRnd() < 0.35;
    if (e.ai === 'clear') can = can && aiRnd() < 0.7;
    if (sq.phase === 'bounding' && e.group === sq.boundGroup) can = false;
    if (!can) { e.fireT = 0.4 + aiRnd() * 0.45; return; }
    e.fireT = (0.72 + aiRnd() * 1.05) * (st.suppressEnemy > 0 ? 2.2 : 1);
    const tx = p.x + (aiRnd() - 0.5) * d * 0.16;
    const tz = p.z + (aiRnd() - 0.5) * d * 0.16;
    st.tracers.push({ x0: e.x, y0: e.y + 1.15, z0: e.z, x1: tx, y1: p.y + 1.2, z1: tz, t: 0.08, red: true });
    st.particles.push({ x: e.x, y: e.y + 1.2, z: e.z, life: 0.06, max: 0.06, size: 0.65, col: [1, 0.6, 0.25], add: true });
    if (HX.Audio) HX.Audio.enemyShot();
    let hitChance = clamp(0.29 - d * 0.0036, 0.03, 0.32) * (p.crouch ? 0.6 : 1);
    if (sq.intel.err > 2) hitChance *= 0.72;      // 指挥官情报模糊 → 协同射击不准
    if (st.prep && st.prep.active) hitChance *= 0.55;
    if (aiRnd() < hitChance) {
      const dmg = (6 + aiRnd() * 9) * (st.prepWarn || 1);
      p.hp -= dmg; st.cas += dmg * 6; st.flash = 1;
      const rel = Math.atan2(e.x - p.x, e.z - p.z);
      UI.damageDir(((rel - p.yaw) * 180 / Math.PI + 360) % 360);
      if (p.hp <= 0) {
        p.alive = false; p.hp = 0; UI.fpsDeath();
        if (HX.Audio) HX.Audio.death();
        setTimeout(() => F.stop({ win: false, kills: st.kills, casualties: st.cas + 800 }), 1200);
      }
    }
    if (d < 24) st.suppressT = Math.max(st.suppressT, 0.6);
  }

  /* ---------------- 友军与敌军 AI ---------------- */
  function updateAI(dt) {
    const p = st.player;
    const enemies = st.enemies;
    st.navQuota = NAV.maxPerFrame;
    st.navStats.frames++;
    updateSquad(dt);
    // 友军
    for (const a of st.allies) {
      if (!a.alive) continue;
      let best = null, bd = 999;
      for (const e of enemies) if (e.alive) {
        const d = Math.hypot(e.x - a.x, e.z - a.z);
        if (d < bd) { bd = d; best = e; }
      }
      if (best && bd > 12) {
        const ang = Math.atan2(best.x - a.x, best.z - a.z);
        const side = (a.flank > 0 ? 0.5 : -0.5);
        const tx = best.x - Math.sin(ang + side) * 8, tz = best.z - Math.cos(ang + side) * 8;
        moveTo(a, tx, tz, 2.4, dt);
        a.flank -= dt;
      }
      a.fireT -= dt;
      if (best && a.fireT <= 0 && bd < 40 && !W.losBlocked(st.arena, a.x, a.z, best.x, best.z)) {
        a.fireT = 0.55 + aiRnd() * 0.6;
        st.tracers.push({ x0: a.x, y0: a.y + 1.2, z0: a.z, x1: best.x, y1: best.y + 1.0, z1: best.z, t: 0.08 });
        best.hp -= 9 + aiRnd() * 6;
        if (best.hp <= 0 && best.alive) killEnemy(best);
      }
    }
    // 敌军：单兵感知 → 上报 → 指挥官调度
    for (const e of enemies) {
      if (!e.alive) continue;
      e.suppress = Math.max(0, e.suppress - dt);
      perceive(e, dt);
      tacticalMove(e, dt);
      enemyFire(e, dt);
      if (e.lastAi !== e.ai) { e.lastAi = e.ai; logAI('act', e, e.ai); }
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d < 2.2 && aiRnd() < dt * 1.2) {
        p.hp -= 10 * (st.prepWarn || 1); st.flash = 1;
        UI.damageDir(0);
      }
    }
    st.flash = Math.max(0, st.flash - dt * 3);
    if (st.flash > 0) {
      const s = $('suppress');
      if (s) s.style.boxShadow = `inset 0 0 200px rgba(255,60,40,${0.35 * st.flash})`;
    }
  }

  /* 调试/实测接口（不参与正式 UI） */
  F.debug = function () {
    const sq = st.squad;
    const pr = st.prep;
    return {
      t: +st.t.toFixed(2),
      phase: sq ? sq.phase : null,
      intel: sq ? { x: +sq.intel.x.toFixed(2), z: +sq.intel.z.toFixed(2), age: sq.intel.t >= 0 ? +(st.t - sq.intel.t).toFixed(2) : -1, err: +(sq.intel.err || 0).toFixed(2), conf: sq.intel.conf } : null,
      flankSide: sq ? sq.flankSide : 0,
      band: sq ? sq.band : 0,
      prep: pr ? { level: pr.level, active: pr.active, done: pr.done, skipped: pr.skipped, fired: pr.fired, shells: pr.shells, radius: pr.radius, dmg: Math.round(pr.dmg), hits: pr.hits } : null,
      prepWarn: st.prepWarn,
      nav: nav ? { mode: st.navMode, n: nav.n, blockedCells: nav.blockedN, trenchCells: nav.trenchN, cell: nav.cs, calls: st.navStats.calls, dropped: st.navStats.dropped, fails: st.navStats.fails, hits: st.navStats.hits, lastLen: st.navStats.lastLen, lastMs: st.navStats.lastMs } : null,
      enemies: st.enemies.map((e) => ({ id: e.id, group: e.group, ai: e.ai, alive: e.alive, x: +e.x.toFixed(2), z: +e.z.toFixed(2), hp: Math.round(e.hp), seen: !!e.seen, travel: +(e.travel || 0).toFixed(2), stuck: +(e.stuck || 0).toFixed(2), wp: e.nav && e.nav.path ? e.nav.path.length : 0 })),
      aiLog: st.aiLog.slice(),
      kills: st.kills,
      player: st.player ? { x: +st.player.x.toFixed(2), z: +st.player.z.toFixed(2), hp: Math.round(st.player.hp), alive: st.player.alive } : null
    };
  };
  F.setPlayerPos = function (x, z) {
    if (!st.player) return;
    st.player.x = x; st.player.z = z; st.player.y = W.arenaHeight(x, z);
    st.cam.pos[0] = x; st.cam.pos[2] = z; st.cam.pos[1] = st.player.y + 1.72;
  };
  /* 实测钩子：切换寻路模式（legacy=上轮轴向+贴墙，astar=本轮） */
  F.setNavMode = function (m) { st.navMode = m === 'legacy' ? 'legacy' : 'astar'; };
  F.navStats = function () { return F.debug().nav; };
  F.rebuildNav = function () { if (st.arena) nav = buildNav(st.arena); st.navStats = { frames: 0, calls: 0, dropped: 0, fails: 0, hits: 0, lastLen: 0, lastMs: 0 }; };
  /* 实测钩子：在两处障碍之间插一块实体障碍（同步进入碰撞与网格） */
  F.addBlocker = function (x, z, w, d, h) {
    if (!st.arena) return null;
    const b = { x, z, w, d, h: h || 1.6, rot: 0, solid: true, kind: 'test' };
    st.arena.covers.push(b);
    if (st.arena.deco && st.arena.deco.walls) st.arena.deco.walls.push(b);
    nav = buildNav(st.arena);
    return { x, z, w, d };
  };
  F.travelSnapshot = function () {
    return st.enemies.map((e) => ({ id: e.id, group: e.group, travel: +(e.travel || 0).toFixed(2), stuck: +(e.stuck || 0).toFixed(2) }));
  };

  function updateParticles(dt) {
    for (let i = st.particles.length - 1; i >= 0; i--) {
      const p = st.particles[i];
      p.life -= dt;
      if (p.life <= 0) { st.particles.splice(i, 1); continue; }
      if (p.vx !== undefined) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vy -= (p.grav || 0) * dt;
      }
    }
    for (let i = st.tracers.length - 1; i >= 0; i--) {
      st.tracers[i].t -= dt;
      if (st.tracers[i].t <= 0) st.tracers.splice(i, 1);
    }
  }

  /* ---------------- 渲染 ---------------- */
  F.render = function () {
    if (!st.active || !st.player) return false;
    const scene = new HX.Scene();
    const arena = st.arena;
    // 废墟与掩体
    for (const h of arena.deco.houses) {
      const y = W.arenaHeight(h.x, h.z);
      scene.box(h.x, y + h.h / 2, h.z, h.w, h.h, h.d, h.rot, [0.30, 0.27, 0.22, 1]);
      scene.push('wedge', h.x, y + h.h, h.z, h.w * 1.02, 0.35, h.d, h.rot, [0.20, 0.18, 0.16, 1]);
    }
    for (const w of arena.deco.walls) {
      const y = W.arenaHeight(w.x, w.z);
      scene.box(w.x, y + w.h / 2, w.z, w.w, w.h, w.d, w.rot, [0.32, 0.28, 0.21, 1]);
    }
    for (const b of arena.deco.boxes) {
      const y = W.arenaHeight(b.x, b.z);
      const col = b.kind === 'crate' ? [0.34, 0.30, 0.18, 1] : [0.20, 0.22, 0.20, 1];
      scene.box(b.x, y + b.h / 2, b.z, b.w, b.h, b.d, b.rot, col);
    }
    for (const t2 of arena.deco.trees) {
      const y = W.arenaHeight(t2.x, t2.z);
      scene.push('cyl', t2.x, y + 1.2, t2.z, 0.22, 2.4, 0.22, t2.rot, [0.20, 0.16, 0.12]);
      scene.push('cone6', t2.x, y + 2.2, t2.z, 2.4 * t2.s, 3.2 * t2.s, 2.4 * t2.s, t2.rot, [0.16, 0.22, 0.16]);
    }
    // 火点
    for (const f of arena.deco.fires) {
      const fl = 0.65 + 0.35 * Math.sin(st.t * 9 + f.x);
      scene.addSprite(f.x, f.y, f.z, 2.6, [1.0, 0.5, 0.16], 0.8 * fl);
      scene.addSoft(f.x, f.y + 2.4, f.z, 6, [0.35, 0.32, 0.30], 0.16);
    }
    // 壕沟（非实体，仅掩护与视觉）
    for (const tr of arena.deco.trenches) {
      const y = W.arenaHeight(tr.x, tr.z);
      scene.box(tr.x, y + 0.04, tr.z, tr.w, 0.22, tr.d, tr.rot, [0.13, 0.12, 0.10, 1]);
      scene.box(tr.x, y + 0.20, tr.z, tr.w, 0.10, tr.d + 0.18, tr.rot, [0.22, 0.19, 0.15, 1]);
    }
    // 炮火准备：落点预示圈 + 烟柱
    if (st.prep) {
      for (const m of st.prep.marks) {
        if (m.done) continue;
        const dt2 = m.due - st.prep.t;
        if (dt2 > 2.0) continue;
        const y = W.arenaHeight(m.x, m.z);
        const aa = 0.30 + 0.30 * Math.max(0, Math.sin(st.t * 9 + m.x));
        for (let i = 0; i < 10; i++) {
          const q = i / 10 * Math.PI * 2;
          scene.addSoft(m.x + Math.cos(q) * 1.7, y + 0.06, m.z + Math.sin(q) * 1.7, 0.55, [1, 0.36, 0.12], aa);
        }
        scene.addSoft(m.x, y + 1.5, m.z, 0.9, [1, 0.48, 0.18], aa * 1.1);
      }
    }
    // 士兵
    for (const a of st.allies) if (a.alive) drawSoldier(scene, a, [0.30, 0.42, 0.36]);
    for (const e of st.enemies) if (e.alive) drawSoldier(scene, e, [0.40, 0.33, 0.24], true);
    // 弹道
    for (const t of st.tracers) {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const k = i / n;
        scene.addSprite(
          t.x0 + (t.x1 - t.x0) * k, t.y0 + (t.y1 - t.y0) * k, t.z0 + (t.z1 - t.z0) * k,
          0.30, t.red ? [1, 0.35, 0.2] : [1, 0.85, 0.45], 0.75 * (t.t / 0.09)
        );
      }
    }
    // 粒子
    for (const p of st.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.add) scene.addSprite(p.x, p.y, p.z, p.size * (1.2 - a * 0.4), p.col, a);
      else scene.addSoft(p.x, p.y, p.z, p.size, p.col, a * 0.9);
    }
    const env = Object.assign({}, ENV);
    const fe = st.cfg && st.cfg.chapterCfg && st.cfg.chapterCfg.fpsEnv;
    if (fe) {
      if (fe.fogCol) env.fogCol = fe.fogCol;
      if (fe.skyTop) env.skyTop = fe.skyTop;
      if (fe.skyHorizon) env.skyHorizon = fe.skyHorizon;
      if (fe.sunCol) env.sunCol = fe.sunCol;
      if (fe.groundCol) env.groundCol = fe.groundCol;
      if (fe.grade) env.grade = fe.grade;
      if (fe.fogDensity) env.fogDensity = fe.fogDensity;
    }
    env.focus = [st.player.x, st.player.z];
    env.grain = 0.035;
    // 第三章雪原：视距内飘雪
    if (st.cfg && st.cfg.chapterCfg && st.cfg.chapterCfg.cover && st.cfg.chapterCfg.cover.snow) {
      for (let i = 0; i < 34; i++) {
        const sx = st.player.x + Math.sin(st.t * 0.9 + i * 2.1) * (7 + (i % 3) * 2) + (i % 2 ? 3.5 : -3.5);
        const sz = st.player.z + Math.cos(st.t * 0.7 + i * 1.7) * (6 + (i % 4) * 1.6);
        const sy = st.player.y + 1.2 + ((st.t * 0.7 + i * 0.41) % 5);
        scene.addSprite(sx, sy, sz, 0.10 + (i % 3) * 0.03, [0.92, 0.95, 1.0], 0.55);
      }
    }
    drawViewModel(scene);
    F.renderer.render(st.cam, scene, env, arena.staticList);
    return true;
  };

  // 第一人称武器视图模型（程序化低模，随开镜/后坐/行走摆动）
  function drawViewModel(scene) {
    const p = st.player;
    const pitch = p.pitch + st.recoil * 0.5;
    const dir = [Math.sin(p.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(p.yaw) * Math.cos(pitch)];
    const right = [Math.cos(p.yaw), 0, -Math.sin(p.yaw)];
    const up = [-Math.sin(p.yaw) * Math.sin(pitch), Math.cos(pitch), -Math.cos(p.yaw) * Math.sin(pitch)];
    const ads = st.ads;
    const r = ads ? 0.055 : 0.24;
    const u = ads ? -0.105 : -0.21;
    const f = ads ? 0.62 : 0.78;
    const kick = Math.min(0.09, st.recoil * 0.7);
    const bob = Math.sin(st.t * 8) * 0.006;
    const at = (ff, rr, uu) => [
      st.cam.pos[0] + dir[0] * ff + right[0] * rr + up[0] * uu,
      st.cam.pos[1] + dir[1] * ff + right[1] * rr + up[1] * uu,
      st.cam.pos[2] + dir[2] * ff + right[2] * rr + up[2] * uu
    ];
    const wood = [0.24, 0.15, 0.10, 1];
    const metal = [0.12, 0.12, 0.13, 1];
    const steel = [0.17, 0.17, 0.18, 1];
    // 枪身（沿视线，Z 向拉长）
    const body = at(f - kick, r, u + bob);
    scene.box(body[0], body[1], body[2], 0.085, 0.095, 0.30, p.yaw, metal);
    // 枪托
    const stock = at(f - 0.22 - kick, r + 0.01, u - 0.035 + bob);
    scene.box(stock[0], stock[1], stock[2], 0.075, 0.10, 0.24, p.yaw, wood);
    // 枪管
    const barrel = at(f + 0.30 - kick, r, u + 0.005 + bob);
    scene.box(barrel[0], barrel[1], barrel[2], 0.036, 0.036, 0.44, p.yaw, steel);
    // 准星
    const sight = at(f + 0.14 - kick, r, u + 0.045 + bob);
    scene.box(sight[0], sight[1], sight[2], 0.018, 0.05, 0.018, p.yaw, steel);
    // 左手握把 / 右手
    const lh = at(f + 0.04 - kick, r - 0.045, u - 0.085 + bob);
    scene.box(lh[0], lh[1], lh[2], 0.10, 0.09, 0.12, p.yaw, [0.52, 0.40, 0.31, 1]);
    const rh = at(f - 0.20 - kick, r + 0.02, u - 0.075 + bob);
    scene.box(rh[0], rh[1], rh[2], 0.09, 0.085, 0.10, p.yaw, [0.50, 0.38, 0.29, 1]);
    // 枪口余光
    if (st.recoil > 0.05) {
      const tip = at(f + 0.54 - kick, r, u + 0.005 + bob);
      scene.addSprite(tip[0], tip[1], tip[2], 0.32, [1, 0.72, 0.3], 0.6);
    }
  }

  function drawSoldier(scene, s, col, enemy) {
    const y = s.y || W.arenaHeight(s.x, s.z);
    const crouch = enemy && (s.ai === 'hunker' || s.ai === 'coverfire' || s.ai === 'clear') ? 0.75 : 1;
    scene.box(s.x, y + 0.62 * crouch, s.z, 0.46, 1.15 * crouch, 0.40, 0, col, enemy ? 0 : 0.05);
    // 协同状态标记：红=压制/冲击，橙=侧翼，黄=交替后撤，青=清剿
    if (enemy && s.cue) {
      const cc = s.cue === 2 ? [1, 0.55, 0.16] : s.cue === 4 ? [1, 0.85, 0.25] : s.cue === 5 ? [0.35, 0.85, 0.9] : [1, 0.28, 0.20];
      scene.addSprite(s.x, y + 1.95 * crouch, s.z, 0.30, cc, 0.55);
    }
    scene.box(s.x, y + 1.36 * crouch, s.z, 0.30, 0.32, 0.30, 0, [0.52, 0.42, 0.32]);
    // 头盔
    scene.box(s.x, y + 1.50 * crouch, s.z, 0.36, 0.12, 0.36, 0, enemy ? [0.22, 0.20, 0.16] : [0.24, 0.30, 0.24]);
    // 步枪
    scene.box(s.x + 0.28, y + 1.02 * crouch, s.z - 0.15, 0.07, 0.08, 1.0, 0, [0.10, 0.10, 0.10]);
    // 标记
    scene.addSoft(s.x, y + 1.9, s.z, 0.5, enemy ? [1, 0.35, 0.25] : [0.35, 0.9, 0.7], 0.25);
  }

  /* ---------------- 竞技场陈设（供调试） ---------------- */
  F.populateArena = function (scene, arena) {
    for (const h of arena.deco.houses) scene.box(h.x, h.h / 2, h.z, h.w, h.h, h.d, h.rot, [0.3, 0.27, 0.22]);
  };
})();
