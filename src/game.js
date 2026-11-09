/* ==========================================================================
   主控：状态机 / 三维战役相机 / 拾取 / 主循环 / 画质 / 联动
   ========================================================================== */
(function () {
  const HX = (window.HX = window.HX || {});
  const D = HX.DATA, U = HX.U, W = HX.World, S = HX.Sim, UI = HX.UI, M = HX.M;
  const G = (HX.Game = {});
  const $ = (id) => document.getElementById(id);
  const clamp = U.clamp;

  /* 画质档：同时约束渲染分辨率（按 DPR 与屏幕像素总量）与场景裁剪量 */
  const QUALITY = {
    high: { dpr: 1.5, maxPixels: 2600000, shadow: 2048, msaa: 4, shadowsOn: true, bloom: true, treeStep: 1, drawDist: 430 },
    mid: { dpr: 1.0, maxPixels: 1500000, shadow: 1536, msaa: 4, shadowsOn: true, bloom: true, treeStep: 2, drawDist: 310 },
    low: { dpr: 0.75, maxPixels: 850000, shadow: 1024, msaa: 2, shadowsOn: false, bloom: false, treeStep: 4, drawDist: 210 }
  };
  const QUALITY_ORDER = ['high', 'mid', 'low'];
  const QUALITY_LABEL = { high: '高', mid: '中', low: '低' };
  function pickQuality() {
    const coarse = (window.matchMedia && window.matchMedia('(pointer:coarse)').matches) || 'ontouchstart' in window;
    const w = window.innerWidth || 1280, h = window.innerHeight || 720;
    const px = w * h * Math.min(window.devicePixelRatio || 1, 2);
    if (coarse && w <= 900) return 'mid';
    if (px > 3200000) return 'mid';
    return 'high';
  }

  const ENV_CAMPAIGN = {
    sunDir: [-0.52, 0.30, -0.38], sunCol: [1.0, 0.68, 0.40], skyCol: [0.30, 0.36, 0.44], groundCol: [0.17, 0.16, 0.14],
    fogCol: [0.20, 0.22, 0.25], skyTop: [0.035, 0.09, 0.15], skyHorizon: [0.38, 0.33, 0.30],
    rimCol: [1.0, 0.72, 0.46], rim: 0.55, fogDensity: 0.0016, bloom: 0.75, exposure: 1.2, vignette: 0.36,
    grain: 0.03, focus: [10, 30], shadowRadius: 110, grade: [1.05, 1.0, 0.95]
  };

  G.mode = 'title';
  G.quality = 'high';
  G.layers = { terrain: true, hydro: true, rail: true, pla: true, kmt: true, supply: true, labels: true, orders: true, intel: true };
  G.map2dOpen = false;

  const cam = (G.cam = { yaw: 0.72, pitch: 0.62, dist: 230, target: [-10, 0, 58], pos: [0, 110, 190], near: 0.5, far: 900, fov: 42 });
  const camSmooth = { yaw: 0.72, pitch: 0.62, dist: 230, target: [-10, 0, 58] };
  /* 取景/调试：同步目标与平滑值，用于截图与定点观察 */
  G.setCam = function (x, z, dist, pitch, yaw) {
    const y = W.heightAt(x, z);
    cam.target = [x, y, z]; camSmooth.target = [x, y, z];
    if (dist) cam.dist = camSmooth.dist = dist;
    if (pitch) cam.pitch = camSmooth.pitch = pitch;
    if (yaw !== undefined) cam.yaw = camSmooth.yaw = yaw;
  };
  const map2d = { zoom: 1, ox: 0, oy: 0, drag: null, moved: false };

  /* 章节切换：按章重建/切换地形与环境（复用同一张史实底图，但四项配置独立） */
  G.chapter = 1;
  G.campaignCache = {};
  G.setChapter = function (n, reframe) {
    const id = n || 1;
    const ch = D.chapterOf ? D.chapterOf(id) : null;
    if (!G.campaignCache[id]) G.campaignCache[id] = W.buildCampaign(G.renderer, G.quality, id);
    G.campaign = G.campaignCache[id];
    G.chapter = id;
    G.chapterCfg = ch;
    if (ch && reframe !== false) {
      G.setCam(ch.area.x, ch.area.z, ch.camera.dist, ch.camera.pitch, ch.camera.yaw);
    }
    if (G.map2dOpen) frameChapter2D();
    return ch;
  };

  /* 二维地图按作战区取景：三章的作战区尺寸不同 */
  function frameChapter2D() {
    const c = $('map2d');
    const ch = G.chapterCfg;
    if (!c || !c.width || !ch) return;
    const b = W.BOUNDS;
    const base = Math.min(c.width / (b.maxX - b.minX), c.height / (b.maxZ - b.minZ));
    const zx = c.width * 0.82 / (ch.area.w * base);
    const zy = c.height * 0.82 / (ch.area.h * base);
    map2d.zoom = Math.max(0.8, Math.min(4, Math.min(zx, zy)));
    map2d.ox = -(ch.area.x - (b.minX + b.maxX) / 2) * base * map2d.zoom;
    map2d.oy = -(ch.area.z - (b.minZ + b.maxZ) / 2) * base * map2d.zoom;
  }

  /* ================================ 启动 ================================ */
  G.init = function () {
    const canvas = $('gl');
    G.quality = pickQuality();
    G.renderer = new HX.Renderer(canvas);
    G.renderer.setQuality(QUALITY[G.quality]);
    UI.init();
    bind();
    W.setChapter(1);
    G.chapterCfg = D.chapterOf ? D.chapterOf(1) : null;
    G.campaign = W.buildCampaign(G.renderer, G.quality, 1);
    G.campaignCache[1] = G.campaign;
    HX.FPS.setRenderer(G.renderer);
    HX.Cine.setup(G.renderer, G.campaign);
    G.sim = S.create();
    fixSizes();
    requestAnimationFrame(loop);

    if (window.PAGE === 'cinematics') {
      G.mode = 'cineMenu';
      UI.setScreen('cine_menu');
    } else {
      UI.setScreen('title');
    }
    setTimeout(fixSizes, 300);
    setTimeout(fixSizes, 1200);
    window.addEventListener('resize', fixSizes);

    // 后端探活：数据库里有存档时，标题页也显示“继续上次战役”
    if (window.PAGE !== 'cinematics' && HX.Api) {
      HX.Api.probe().then((ok) => {
        if (!ok) return;
        HX.Api.list().then((l) => { if (l && l.length) UI.setResumeAvailable(true); }).catch(() => {});
      });
    }
  };

  function fixSizes() {
    for (const c of [$('gl'), $('map2d')]) {
      if (!c) continue;
      const r = c.getBoundingClientRect();
      if (r.width < 4) continue;
    }
    if (G.renderer) G.renderer.resize();
    if (G.map2dOpen) resize2d();
  }

  /* ================================ 事件绑定 ================================ */
  function bind() {
    UI.on.start = () => startCampaign();
    UI.on.cinema = () => { location.href = 'cinematics.html'; };
    UI.on.speed = (sp) => {
      if (!G.sim) return;
      G.sim.speed = sp;
      UI.speedUI(sp);
      if (sp === 0) G.sim.running = false; else G.sim.running = true;
      UI.update(G.sim, G.sel);
    };
    UI.on.pace = (v) => {
      if (!G.sim) return;
      S.setPace(G.sim, v);
      UI.speedUI(G.sim.speed);
      UI.update(G.sim, G.sel);
      UI.toast(v === 0 ? '从容档：无时限，战局只在你推进时前进' : v === 1 ? '标准档：时间会流逝，但无硬截止' : '紧迫档：已启用历史时间窗（超时有软后果，不判负）', v === 0 ? 'good' : 'warn');
    };
    UI.on.plan = () => {
      if (!G.sim) return;
      if (!G.sel.length) { UI.toast('先选择 1–3 支部队再推演', 'warn'); return; }
      UI.sandbox(G.sim, G.sel);
    };
    UI.on.planAct = (p) => {
      if (!G.sim || !p) return;
      if (!G.sel.length) { UI.toast('先选择部队', 'warn'); return; }
      if (p.type === 'rest') S.command(G.sim, G.sel, 'rest', {});
      else S.command(G.sim, G.sel, p.type, p.target);
      UI.closeModal();
      UI.toast(`已执行方案：${p.label}`, 'good');
      UI.update(G.sim, G.sel);
    };
    UI.on.confirmPhase = () => {
      if (!G.sim) return;
      if (S.confirmPhase(G.sim)) {
        UI.update(G.sim, G.sel);
        UI.briefing(G.sim);
      }
    };
    UI.on.save = () => saveGame(true);
    UI.on.resume = () => resumeSaved();
    UI.on.select = (id, shift) => {
      const pl = G.sim.pla.find((u) => u.id === id);
      if (!pl || pl.dead) return;
      if (shift) {
        const i = G.sel.indexOf(id);
        if (i >= 0) G.sel.splice(i, 1); else G.sel.push(id);
      } else G.sel = [id];
      UI.update(G.sim, G.sel);
    };
    UI.on.order = (type) => {
      if (!G.sel.length) { UI.toast('先选择一支部队', 'warn'); return; }
      if (type === 'rest') {
        S.command(G.sim, G.sel, 'rest', {});
        UI.toast('部队转入休整', 'good');
        UI.pendingCmd(null);
        return;
      }
      if (type === 'encircle' || type === 'attack') {
        UI.pending(type);
        UI.pendingCmd(type);
        UI.toast(type === 'encircle' ? '选择要包围的敌军（点地图上的敌军）' : '选择要进攻的敌军', '');
        return;
      }
      UI.pending(type);
      UI.pendingCmd(type);
      UI.toast('在三维地图上点击目标位置', '');
    };
    UI.on.target = (kmtId) => {
      const type = UI.getPending() || 'attack';
      if (!G.sel.length) { UI.toast('先选择一支部队', 'warn'); return; }
      S.command(G.sim, G.sel, type === 'encircle' ? 'encircle' : 'attack', { kmtId });
      UI.pending(null); UI.pendingCmd(null); UI.toast('命令已下达', 'good');
      UI.update(G.sim, G.sel);
    };
    UI.on.act = (a) => {
      if (a === 'assault') startAssault();
      if (a === 'cmdr' && G.sel.length) UI.commanderCard(G.sim, G.sel[0]);
      if (a === 'requests') UI.requests(G.sim);
    };
    UI.on.auth = (v) => { if (!G.sim) return; S.setAuth(G.sim, v); UI.update(G.sim, G.sel); };
    UI.on.autonomy = (v) => {
      if (!G.sim) return;
      S.setAutonomy(G.sim, v);
      UI.toast(v ? '已开启部队自主权：遇阻可自行绕行/展开' : '严格按路线：遇阻即停，等你决断', v ? 'good' : 'warn');
      UI.update(G.sim, G.sel);
    };
    UI.on.routeDraw = () => G.startRouteDraw();
    UI.on.routeCopy = () => G.copyRoute();
    UI.on.routePaste = () => G.pasteRoute();
    UI.on.requests = () => UI.requests(G.sim);
    UI.on.requestAct = (id, act) => {
      if (!G.sim) return;
      act === 'adopt' ? S.adoptRequest(G.sim, id) : S.rejectRequest(G.sim, id);
      UI.update(G.sim, G.sel);
      UI.requests(G.sim);
    };
    UI.on.assault = startAssault;
    UI.on.gap = () => {
      if (!G.sim) return;
      S.setGap(G.sim, !G.sim.gapOpen);
      UI.toast(G.sim.gapOpen ? '已放开口子：西南方向留出缺口' : '已封闭缺口', G.sim.gapOpen ? 'warn' : '');
      UI.update(G.sim, G.sel);
    };
    UI.on.transfer = () => {
      UI.openModal(`<div class="modal"><div class="modal-head"><div><div class="kicker">重大决策</div><h2>转入战略转移</h2></div><button class="modal-close btn">✕</button></div>
        <div class="modal-body"><p>停止围歼，主力脱离接触并转入战略转移。</p>
        <p>这会记录一个重大历史分歧（D7），战役以「战略转移」结局结束，部队得以保存，但战役目标未完成。</p></div>
        <div class="modal-foot"><span class="dim-note">不可撤销。</span><button class="btn primary" data-cb="doTransfer">确认转移</button></div></div>`);
    };
    UI.on.analysis = () => { if (G.sim) UI.analysis(G.sim); };
    UI.on.brief = () => { if (G.sim) UI.briefing(G.sim); };
    UI.on.quality = () => {
      const i = (QUALITY_ORDER.indexOf(G.quality) + 1) % QUALITY_ORDER.length;
      setQuality(QUALITY_ORDER[i]);
      UI.toast('画质：' + QUALITY_LABEL[QUALITY_ORDER[i]] + (QUALITY_ORDER[i] === 'high' ? '（阴影开 · 树全量 · 远距 430）' : QUALITY_ORDER[i] === 'mid' ? '（阴影开 · 树 1/2 · 远距 310）' : '（无阴影 · 树 1/4 · 远距 210）'), '');
      G.autoQ = false;
    };
    UI.on.map = toggle2d;
    UI.on.mapClose = toggle2d;
    UI.on.fpsExit = () => {
      if (HX.FPS.state.active) HX.FPS.stop({ win: false, kills: HX.FPS.state.kills, casualties: HX.FPS.state.cas, aborted: true });
    };
    UI.on.modalAction = (cb) => {
      if (cb === 'startPhase') { UI.closeModal(); resumeCampaign(); }
      if (cb === 'doTransfer') { UI.closeModal(); S.transferStrategy(G.sim); }
      if (cb === 'assaultFromModal') { UI.closeModal(); startAssault(); }
      if (cb === 'restart') location.reload();
    };
    for (const pair of [['btnMobOob', 'oob'], ['btnMobCmd', 'cmd'], ['btnMobLog', 'log']]) {
      const b = $(pair[0]);
      if (b) b.onclick = () => toggleMobPanel(pair[1]);
    }
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', (ev) => {
      clearTimeout(touch.longT);
      touchPts.delete(ev.pointerId);
      if (touchPts.size < 2) touch.pinch = false;
      touch.longFired = false;
      map2d.drag = null;
      if (touchPts.size === 0) touch.lastUp = performance.now();
    });
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (HX.Cine.state.active) {
        if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); HX.Cine.skip(); }
        return;
      }
      if (G.mode === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); startCampaign(); }
        return;
      }
      if (G.mode === 'campaign') {
        const mw = $('modalWrap');
        if (e.code === 'Enter' && mw && !mw.classList.contains('hidden')) {
          const b = mw.querySelector('[data-cb="startPhase"]');
          if (b) { e.preventDefault(); b.click(); return; }
        }
        if (G.routeDraw && G.routeDraw.active) {
          if (e.code === 'Enter') { e.preventDefault(); G.finishRouteDraw(); return; }
          if (e.code === 'Escape') { e.preventDefault(); G.cancelRouteDraw(); return; }
          if (e.code === 'KeyR') { e.preventDefault(); G.cancelRouteDraw(); return; }
        }
        if (e.code === 'Escape') {
          if (G.map2dOpen) toggle2d(); else UI.closeModal();
          return;
        }
        if (e.code === 'KeyR') { e.preventDefault(); G.startRouteDraw(); return; }
        if (e.code === 'KeyP') { e.preventDefault(); if (G.sel.length) UI.sandbox(G.sim, G.sel); return; }
        if (e.code === 'KeyQ') { UI.on.quality(); }
        if (e.code === 'Space') { G.sim.speed = G.sim.speed ? 0 : 2; UI.speedUI(G.sim.speed); G.sim.running = G.sim.speed > 0; UI.update(G.sim, G.sel); }
        if (e.code === 'KeyF') startAssault();
      }
    });
  }

  /* 竖屏开局的视野：把最近的我军集群框进画面，避免开局只见空地 */
  function frameOpening(dist) {
    if (!G.sim) return;
    const list = G.sim.pla.filter((u) => !u.dead)
      .sort((a, b) => (a.x - cam.target[0]) ** 2 + (a.z - cam.target[2]) ** 2 - ((b.x - cam.target[0]) ** 2 + (b.z - cam.target[2]) ** 2))
      .slice(0, 6);
    if (!list.length) return;
    const cx = list.reduce((s, u) => s + u.x, 0) / list.length;
    const cz = list.reduce((s, u) => s + u.z, 0) / list.length;
    cam.target = camSmooth.target = [cx, W.heightAt(cx, cz), cz];
    cam.dist = camSmooth.dist = dist;
  }

  function startCampaign() {
    HX.Audio && HX.Audio.resume();
    HX.Audio && HX.Audio.ambient(true);
    G.sel = [];
    G.sim = S.create();
    G.setChapter(1, false);
    G.mode = 'cine';
    HX.Cine.play(0, () => {
      G.mode = 'campaign';
      UI.setScreen('campaign');
      UI.update(G.sim, G.sel);
      UI.briefing(G.sim);
    }, false);
  }

  function resumeCampaign() {
    G.mode = 'campaign';
    UI.setScreen('campaign');
    G.setChapter(G.sim.phase);
    if (window.innerWidth <= 560) frameOpening(170);
    // 从容档默认停表：章节由玩家手动确认，战局只在其推进时前进
    if (G.sim.pace === 0) { G.sim.speed = 0; G.sim.running = false; }
    else G.sim.running = G.sim.speed > 0;
    UI.speedUI(G.sim.speed);
    UI.update(G.sim, G.sel);
  }

  /* ---------------- 存档 / 读档 ----------------
     优先级：后端 MySQL（REST）优先；localStorage 只作断网兜底。
     写档：先 PUT 数据库，失败才退回 localStorage 并明确提示“未持久化”。
     读档：先 GET 数据库，数据库不可达才用本机兜底，并提示可能落后。 */
  const SAVE_KEY = 'hx1948_save';
  const SAVE_SLOT = 'manual';
  let saveVersion = null;   // 当前手动槽在数据库中的版本号；null 表示尚未同步
  let autoVersion = null;

  function snapshot() {
    if (!G.sim) return null;
    try { return JSON.parse(S.serialize(G.sim)); } catch (e) { return null; }
  }
  function cacheLocal(state, source, version) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      localStorage.setItem(SAVE_KEY + '_meta', JSON.stringify({
        v: 1, savedAt: Date.now(), t: Math.floor(G.sim.t), phase: G.sim.phase,
        source: source, version: version == null ? null : version
      }));
      return true;
    } catch (e) { return false; }
  }
  function saveLabel() { return `第 ${G.sim.phase} 阶段 · ${S.dateLabel(G.sim.t)}`; }

  async function saveGame(notify) {
    if (!G.sim) return false;
    const state = snapshot();
    if (!state) return false;
    cacheLocal(state, 'local', null);   // 先落兜底，后端失败时仍有本机副本
    try {
      if (saveVersion == null) {
        const list = await HX.Api.list();
        const cur = (list || []).find((s) => s.slot === SAVE_SLOT);
        saveVersion = cur ? cur.version : 0;
      }
      let res;
      try {
        res = await HX.Api.save(SAVE_SLOT, saveLabel(), state, saveVersion);
      } catch (e) {
        if (e.status === 409 && e.body && typeof e.body.currentVersion === 'number') {
          saveVersion = e.body.currentVersion;
          res = await HX.Api.save(SAVE_SLOT, saveLabel(), state, saveVersion);
          if (notify) UI.toast(`存档已被其他会话更新，已按最新版本覆盖（v${res.version}）`, 'warn');
        } else throw e;
      }
      saveVersion = res.version;
      cacheLocal(state, 'db', res.version);
      if (notify) UI.toast(`已保存到数据库：${saveLabel()}（v${res.version}${res.idempotent ? ' · 内容未变' : ''}）`, 'good');
      return true;
    } catch (e) {
      if (notify) UI.toast(`数据库不可用（${e.message}）：已写本机兜底存档，未写入 MySQL`, 'warn');
      return false;
    }
  }

  async function resumeSaved() {
    let sim = null, from = null, ver = null;
    try {
      const list = await HX.Api.list();
      let target = (list || []).find((s) => s.slot === SAVE_SLOT);
      if (!target) {
        const others = (list || []).filter((s) => s.slot !== 'auto');
        others.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
        target = others[0] || (list || []).find((s) => s.slot === 'auto');
      }
      if (target) {
        const det = await HX.Api.get(target.slot);
        sim = S.restore(det.state);
        if (sim) {
          from = '数据库';
          ver = det.version;
          saveVersion = target.slot === SAVE_SLOT ? det.version : null;
        }
      }
    } catch (e) { HX.Api.lastError = e.message; }
    if (!sim) {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        sim = raw ? S.restore(raw) : null;
        if (sim) { from = '本机兜底'; saveVersion = null; }
      } catch (e) { sim = null; }
    }
    if (!sim) { UI.toast('没有找到可用存档', 'warn'); return; }
    G.sim = sim;
    G.sel = [];
    G.mode = 'campaign';
    G.setChapter(sim.phase);
    UI.setScreen('campaign');
    UI.speedUI(0);
    UI.update(G.sim, G.sel);
    if (from === '数据库') UI.toast(`已从数据库恢复：${saveLabel()}（v${ver}），战局暂停`, 'good');
    else UI.toast(`后端不可用（${HX.Api.lastError || '未知'}）：已用本机兜底存档恢复，可能落后于数据库，战局暂停`, 'warn');
  }

  function reportAfterAction(o, sim) {
    if (!o || !HX.Api) return;
    HX.Api.afterAction({
      endingType: o.id,
      endingTitle: o.title,
      endingDate: S.dateLabel(sim.t),
      campaignT: sim.t,
      enemiesDestroyed: Math.round(sim.casualties.kmt),
      ownCasualties: Math.round(sim.casualties.pla),
      keyDivergence: (o.divergences || []).map((d) => d.key).join(','),
      note: o.line || ''
    }).catch(() => {});
  }

  window.addEventListener('pagehide', () => {
    if (!G.sim || G.sim.ended) return;
    const state = snapshot();
    if (!state) return;
    cacheLocal(state, 'local', null);
    HX.Api.autoSave(state, autoVersion, { keepalive: true, timeout: 4000 })
      .then((r) => { autoVersion = r.version; })
      .catch(() => { /* 后端不可用时保留本机兜底 */ });
  });

  /* ================================ 相机 / 拾取 ================================ */
  function updateCam(dt) {
    const k = 1 - Math.pow(0.001, dt);
    camSmooth.yaw += (cam.yaw - camSmooth.yaw) * k;
    camSmooth.pitch += (cam.pitch - camSmooth.pitch) * k;
    camSmooth.dist += (cam.dist - camSmooth.dist) * k;
    for (let i = 0; i < 3; i++) camSmooth.target[i] += (cam.target[i] - camSmooth.target[i]) * k;
    const cp = Math.cos(camSmooth.pitch), sp = Math.sin(camSmooth.pitch);
    cam.pos = [
      camSmooth.target[0] + Math.sin(camSmooth.yaw) * cp * camSmooth.dist,
      camSmooth.target[1] + sp * camSmooth.dist,
      camSmooth.target[2] + Math.cos(camSmooth.yaw) * cp * camSmooth.dist
    ];
    cam.target = [camSmooth.target[0], camSmooth.target[1], camSmooth.target[2]];
    cam.fov = 42;
  }

  function vpMat() {
    const w = G.renderer ? G.renderer.cssW || window.innerWidth : window.innerWidth;
    const h = G.renderer ? G.renderer.cssH || window.innerHeight : window.innerHeight;
    const proj = M.persp(new Float32Array(16), cam.fov * Math.PI / 180, w / Math.max(1, h), cam.near, cam.far);
    const view = M.lookAt(new Float32Array(16), cam.pos, cam.target, [0, 1, 0]);
    return { vp: M.mul(new Float32Array(16), proj, view), w, h };
  }

  function project(x, y, z) {
    const { vp, w, h } = vpMat();
    const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
    const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (cw <= 0.01) return null;
    return { x: (cx / cw * 0.5 + 0.5) * w, y: (1 - (cy / cw * 0.5 + 0.5)) * h, z: cw };
  }

  function screenRay(sx, sy) {
    const { w, h } = vpMat();
    const fwd = [cam.target[0] - cam.pos[0], cam.target[1] - cam.pos[1], cam.target[2] - cam.pos[2]];
    const fl = Math.hypot(...fwd); fwd[0] /= fl; fwd[1] /= fl; fwd[2] /= fl;
    // 右手系：right = cross(fwd, worldUp) = [-fwd.z, 0, fwd.x]；up = cross(right, fwd)
    const right = [-fwd[2], 0, fwd[0]];
    const rl = Math.hypot(right[0], right[2]); right[0] /= rl; right[2] /= rl;
    const upn = [
      right[1] * fwd[2] - right[2] * fwd[1],
      right[2] * fwd[0] - right[0] * fwd[2],
      right[0] * fwd[1] - right[1] * fwd[0]
    ];
    const tanY = Math.tan(cam.fov * Math.PI / 180 / 2);
    const nx = sx / w * 2 - 1, ny = 1 - sy / h * 2;
    const d = [
      fwd[0] + right[0] * nx * tanY * (w / h) + upn[0] * ny * tanY,
      fwd[1] + right[1] * nx * tanY * (w / h) + upn[1] * ny * tanY,
      fwd[2] + right[2] * nx * tanY * (w / h) + upn[2] * ny * tanY
    ];
    const l = Math.hypot(...d);
    return [d[0] / l, d[1] / l, d[2] / l];
  }

  function groundPoint(sx, sy) {
    const d = screenRay(sx, sy);
    // 相机常在地图边界外（俯视拉远时），不能因起点出界就提前 break；
    // 沿射线扫到第一个落到地面的采样点，并夹回地图范围。
    for (let t = 2; t < 900; t += 2) {
      const x = cam.pos[0] + d[0] * t, z = cam.pos[2] + d[2] * t;
      const y = W.heightAt(x, z);
      const py = cam.pos[1] + d[1] * t;
      if (py <= y) {
        if (Math.abs(x) > 159 || Math.abs(z) > 189) return [clamp(x, -159, 159), clamp(z, -189, 189)];
        return [x, z];
      }
    }
    return null;
  }

  // 双指平移：屏幕位移换算成地面位移，内容跟手（拖左→视野向东）
  function panCamera(dx, dy) {
    const k = 2 * Math.tan(cam.fov * Math.PI / 360) * cam.dist / Math.max(1, window.innerHeight);
    const fx = cam.target[0] - cam.pos[0], fz = cam.target[2] - cam.pos[2];
    const fl = Math.hypot(fx, fz) || 1;
    const fhx = fx / fl, fhz = fz / fl;
    const rx = -fhz, rz = fhx;  // 屏幕右方向（与 screenRay 同一约定）
    const nx = clamp(cam.target[0] + (-rx * dx + fhx * dy) * k, -150, 150);
    const nz = clamp(cam.target[2] + (-rz * dx + fhz * dy) * k, -180, 180);
    cam.target[0] = camSmooth.target[0] = nx;
    cam.target[2] = camSmooth.target[2] = nz;
    cam.target[1] = camSmooth.target[1] = W.heightAt(nx, nz);
  }

  function hitTest(sx, sy) {
    let best = null, bd = 34;
    for (const u of G.sim.pla) {
      if (u.dead) continue;
      const p = project(u.x, W.heightAt(u.x, u.z) + 3, u.z);
      if (!p) continue;
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < bd) { bd = d; best = { kind: 'pla', id: u.id, u }; }
    }
    for (const k of G.sim.kmt) {
      if (!k.alive) continue;
      const it = S.intelOf(G.sim, k.id);
      if (!it || it.age > 24) continue;
      const p = project(it.x, W.heightAt(it.x, it.z) + 3.5, it.z);
      if (!p) continue;
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < bd) { bd = d; best = { kind: 'kmt', id: k.id, k, it }; }
    }
    return best;
  }

  /* ================================ 指针 ================================ */
  /* 手机面板抽屉：一次只开一个，点地图收起 */
  function toggleMobPanel(name) {
    const cls = 'mob-' + name;
    const on = !document.body.classList.contains(cls);
    ['mob-oob', 'mob-cmd', 'mob-log'].forEach((c) => document.body.classList.remove(c));
    if (on) document.body.classList.add(cls);
    const ids = { oob: 'btnMobOob', cmd: 'btnMobCmd', log: 'btnMobLog' };
    for (const k in ids) { const el = $(ids[k]); if (el) el.classList.toggle('on', on && k === name); }
    if (on && G.sim) UI.update(G.sim, G.sel);
  }
  function closeMobPanels() {
    ['mob-oob', 'mob-cmd', 'mob-log'].forEach((c) => document.body.classList.remove(c));
    ['btnMobOob', 'btnMobCmd', 'btnMobLog'].forEach((id) => { const el = $(id); if (el) el.classList.remove('on'); });
  }

  const touchPts = new Map();
  const touch = { pinch: false, pinchSep: 0, pinchDist: 0, suppressTap: 0, longT: null, longFired: false, moved: false, lastUp: 0 };

  function startLongPress(ev) {
    clearTimeout(touch.longT);
    touch.longFired = false;
    const sx = ev.clientX, sy = ev.clientY;
    touch.longT = setTimeout(() => {
      if (!touchPts.size || touch.pinch || touch.moved) return;
      const hit = hitTest(sx, sy);
      if (hit && hit.kind === 'pla' && !UI.getPending()) {
        touch.longFired = true;
        UI.commanderCard(G.sim, hit.id);
        try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) { /* ignore */ }
      }
    }, 480);
  }

  function onPointerDown(ev) {
    if (G.mode !== 'campaign' || G.map2dOpen || HX.Cine.state.active) return;
    if (ev.target.closest && ev.target.closest('.panel,.topbar,.bottombar,.log-wrap,.modal-wrap,button,.map-tip')) return;
    if (ev.pointerType === 'touch') {
      const b = document.body;
      if (b.classList.contains('mob-oob') || b.classList.contains('mob-cmd') || b.classList.contains('mob-log')) { closeMobPanels(); return; }
      if (touch.lastUp && performance.now() - touch.lastUp > 350) { touchPts.clear(); touch.pinch = false; }
      touchPts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      touch.moved = false;
      if (touchPts.size === 2) {
        const a = [...touchPts.values()];
        touch.pinch = true;
        touch.pinchSep = Math.max(10, Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y));
        touch.pinchDist = cam.dist;
        touch.pinchMid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
        map2d.drag = null;
        clearTimeout(touch.longT);
        ev.preventDefault();
        return;
      }
      startLongPress(ev);
      touch.lastUp = 0;
    }
    if (G.routeDraw && G.routeDraw.active) {
      if (ev.button === 0) {
        const pt = groundPoint(ev.clientX, ev.clientY);
        if (pt) { G.routeDraw.points.push(pt); G.routeDraw.drawing = true; routeTip(); }
        ev.preventDefault();
      } else if (ev.button === 2) {
        G.routeDraw.points.pop(); routeTip();
      }
      return;
    }
    if (ev.button === 0) { map2d.drag = { x: ev.clientX, y: ev.clientY, lastX: ev.clientX, lastY: ev.clientY, yaw: cam.yaw, pitch: cam.pitch, moved: false }; }
  }

  function onPointerMove(ev) {
    if (G.mode !== 'campaign' || G.map2dOpen || HX.Cine.state.active) return;
    if (ev.pointerType === 'touch' && touchPts.has(ev.pointerId)) {
      const p = touchPts.get(ev.pointerId);
      if (Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > 8) { touch.moved = true; clearTimeout(touch.longT); }
      touchPts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (touch.pinch && touchPts.size >= 2) {
        const a = [...touchPts.values()];
        const sep = Math.max(10, Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y));
        cam.dist = clamp(touch.pinchDist * touch.pinchSep / sep, 45, 330);
        const mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2;
        if (touch.pinchMid) panCamera(mx - touch.pinchMid.x, my - touch.pinchMid.y);
        touch.pinchMid = { x: mx, y: my };
        ev.preventDefault();
        return;
      }
    }
    if (G.routeDraw && G.routeDraw.active) {
      const pt = groundPoint(ev.clientX, ev.clientY);
      G.routeDraw.hover = pt;
      if (G.routeDraw.drawing && pt) {
        const pts = G.routeDraw.points;
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 4) { pts.push(pt); routeTip(); }
      }
      return;
    }
    if (!map2d.drag) return;
    const dx = ev.clientX - map2d.drag.lastX, dy = ev.clientY - map2d.drag.lastY;
    map2d.drag.lastX = ev.clientX; map2d.drag.lastY = ev.clientY;
    if (Math.hypot(ev.clientX - map2d.drag.x, ev.clientY - map2d.drag.y) > 6) map2d.drag.moved = true;
    if (map2d.drag.moved) {
      cam.yaw -= dx * 0.0055;
      cam.pitch = clamp(cam.pitch + dy * 0.0045, 0.12, 1.35);
    }
  }

  function onPointerUp(ev) {
    if (G.mode !== 'campaign' || G.map2dOpen || HX.Cine.state.active) return;
    touch.lastUpInfo = { x: ev.clientX, y: ev.clientY, type: UI.getPending(), pinch: touch.pinch, pts: touchPts.size, drag: map2d.drag ? map2d.drag.moved : null, btn: ev.button };
    if (ev.pointerType === 'touch') {
      clearTimeout(touch.longT);
      touch.lastUp = performance.now();
      if (touch.pinch) {
        touchPts.delete(ev.pointerId);
        if (touchPts.size < 2) { touch.pinch = false; touch.suppressTap = performance.now() + 350; map2d.drag = null; }
        ev.preventDefault();
        return;
      }
      touchPts.delete(ev.pointerId);
      if (touch.longFired) { touch.longFired = false; map2d.drag = null; return; }
      if (performance.now() < touch.suppressTap) { map2d.drag = null; return; }
    }
    if (G.routeDraw && G.routeDraw.active) {
      if (ev.button === 0) G.routeDraw.drawing = false;
      return;
    }
    if (ev.target.closest && ev.target.closest('.panel,.topbar,.bottombar,.log-wrap,.modal-wrap,button,.map-tip')) { map2d.drag = null; return; }
    const drag = map2d.drag;
    map2d.drag = null;
    if (ev.button === 2) {
      const pt = groundPoint(ev.clientX, ev.clientY);
      if (!pt) return;
      const hit = hitTest(ev.clientX, ev.clientY);
      const type = UI.getPending();
      if (!type && hit && hit.kind === 'pla') { UI.commanderCard(G.sim, hit.id); return; }
      if (type === 'encircle' || type === 'attack') {
        if (hit && hit.kind === 'kmt') { S.command(G.sim, G.sel, type, { kmtId: hit.id }); UI.pending(null); UI.pendingCmd(null); UI.toast('命令已下达', 'good'); }
        else UI.toast('目标是敌军兵团：请点击红色敌军标记', 'warn');
      } else {
        if (!G.sel.length) { UI.toast('先选择一支部队', 'warn'); return; }
        S.command(G.sim, G.sel, type || 'move', { x: pt[0], z: pt[1] });
        UI.pending(null); UI.pendingCmd(null);
        UI.toast(`${G.sel.length} 支部队受命`, 'good');
      }
      return;
    }
    if (ev.button !== 0 || (drag && drag.moved)) return;
    const hit = hitTest(ev.clientX, ev.clientY);
    const type = UI.getPending();
    if (type === 'encircle' || type === 'attack') {
      if (hit && hit.kind === 'kmt') { S.command(G.sim, G.sel, type, { kmtId: hit.id }); UI.pending(null); UI.pendingCmd(null); UI.toast('命令已下达', 'good'); }
      else UI.toast('请点击地图上的敌军标记', 'warn');
      return;
    }
    /* 触屏没有右键：已选“行军/阻援/侦察”时，点地图即下达 */
    if (type === 'move' || type === 'block' || type === 'scout') {
      const pt = groundPoint(ev.clientX, ev.clientY);
      if (!pt) { UI.toast('此处视线没有落到地面，请点地图中部', 'warn'); return; }
      if (G.sel.length) {
        S.command(G.sim, G.sel, type, { x: pt[0], z: pt[1] });
        touch.lastCmd = type + '@' + Math.round(pt[0]) + ',' + Math.round(pt[1]);
        UI.pending(null); UI.pendingCmd(null);
        UI.toast(`${G.sel.length} 支部队受命`, 'good');
        UI.update(G.sim, G.sel);
      }
      return;
    }
    if (hit) {
      if (hit.kind === 'pla') {
        if (ev.shiftKey) {
          const i = G.sel.indexOf(hit.id);
          if (i >= 0) G.sel.splice(i, 1); else G.sel.push(hit.id);
        } else G.sel = [hit.id];
        if (ev.pointerType === 'touch') { closeMobPanels(); UI.update(G.sim, G.sel); UI.toast('已选中 ' + hit.u.short + ' · 点“指挥”可下达命令', ''); }
      } else {
        UI.unitModal(G.sim, null, hit.id);
      }
      UI.update(G.sim, G.sel);
    } else {
      G.sel = [];
      UI.update(G.sim, G.sel);
    }
  }

  /* ================================ 手绘路线 ================================ */
  const routeDraw = (G.routeDraw = { active: false, points: [], hover: null, drawing: false, unitIds: [] });
  function routeTip() {
    let el = $('routeTip');
    if (!el) {
      el = document.createElement('div');
      el.id = 'routeTip';
      el.className = 'route-tip';
      document.body.appendChild(el);
    }
    if (!routeDraw.active) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if (!routeDraw.points.length) {
      el.innerHTML = `<b>手绘路线</b><span>在地图上拖动绘制 · 右键撤销一点 · Enter 下达 · Esc 取消</span>`;
      return;
    }
    const info = S.pathInfo(routeDraw.points, { x: routeDraw.points[0][0], z: routeDraw.points[0][1], fatigue: 0 });
    const terrain = info.roadKm > info.km * 0.4 ? '道路为主' : info.riverKm > info.km * 0.3 ? '水网拖慢' : '乡野/村落';
    el.innerHTML = `<b>手绘路线</b><span>${routeDraw.unitIds.length} 支部队 · 折点 ${routeDraw.points.length}</span>` +
      `<span>里程约 <b>${Math.round(info.km)}</b> km · 预计 <b>${info.hours.toFixed(1)}</b> 小时 · ${terrain}</span>` +
      `<span class="dim">右键撤销 · Enter 下达 · Esc 取消</span>`;
  }
  G.startRouteDraw = function () {
    if (G.mode !== 'campaign' || G.map2dOpen || !G.sel.length) { UI.toast('先选择一支部队再画路线', 'warn'); return false; }
    const u = G.sim.pla.find((x) => x.id === G.sel[0]);
    routeDraw.active = true; routeDraw.points = []; routeDraw.hover = null; routeDraw.unitIds = G.sel.slice();
    routeDraw.start = u ? [u.x, u.z] : null;
    UI.pending(null); UI.pendingCmd(null);
    UI.toast('手绘路线：拖动落点，Enter 下达', '');
    routeTip();
    return true;
  };
  G.cancelRouteDraw = function () {
    routeDraw.active = false; routeDraw.points = []; routeDraw.hover = null;
    routeTip();
  };
  G.finishRouteDraw = function () {
    if (!routeDraw.active) return;
    if (routeDraw.points.length < 1) { UI.toast('路线至少要有一个落点', 'warn'); return; }
    if (!G.sel.length) { UI.toast('部队选择已变化，请重新选择', 'warn'); return; }
    const info = S.pathInfo(routeDraw.points, G.sim.pla.find((u) => u.id === G.sel[0]));
    const pts = routeDraw.points.map((p) => [p[0], p[1]]);
    S.command(G.sim, G.sel.slice(), 'move', { path: pts });
    G.copiedPath = pts;
    UI.toast(`${G.sel.length} 支部队受命，约 ${Math.round(info.km)} km / ${info.hours.toFixed(1)} 小时`, 'good');
    G.cancelRouteDraw();
    UI.update(G.sim, G.sel);
  };
  G.copyRoute = function () {
    const u = G.sim && G.sim.pla.find((x) => G.sel.includes(x.id) && x.routeOriginal);
    if (!u) { UI.toast('当前选中部队没有可复制的路线', 'warn'); return; }
    G.copiedPath = u.routeOriginal.map((p) => [p[0], p[1]]);
    UI.toast(`已复制 ${u.short} 的路线（${G.copiedPath.length} 折点）`, 'good');
  };
  G.pasteRoute = function () {
    if (!G.copiedPath) { UI.toast('还没有复制过路线', 'warn'); return; }
    if (!G.sel.length) { UI.toast('先选择要粘贴路线的部队', 'warn'); return; }
    S.command(G.sim, G.sel.slice(), 'move', { path: G.copiedPath });
    UI.toast(`已把路线复制给 ${G.sel.length} 支部队`, 'good');
    UI.update(G.sim, G.sel);
  };

  function onWheel(ev) {
    if (G.mode !== 'campaign') return;
    ev.preventDefault();
    if (G.map2dOpen) {
      const z = clamp(map2d.zoom * (ev.deltaY > 0 ? 0.88 : 1.14), 0.6, 3.2);
      map2d.zoom = z;
      draw2d();
      return;
    }
    if (ev.target.closest && ev.target.closest('.panel,.topbar,.bottombar,.log-wrap,.modal-wrap,button')) return;
    cam.dist = clamp(cam.dist * (ev.deltaY > 0 ? 1.1 : 0.9), 45, 320);
  }

  /* ================================ 主循环 ================================ */
  let last = 0, fpsAcc = 0, fpsN = 0, fpsVal = 60, fpsT = 0, perfEl = null, map2dT = 0, uiT = 0;

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) {
      fpsVal = Math.round(fpsN / fpsAcc);
      fpsAcc = 0; fpsN = 0;
      showPerf();
      autoscale();
    }
    if (HX.Cine.state.active) {
      HX.Cine.update(dt);
      if (HX.Cine.state.active) { HX.Cine.render(); return; }
    }
    if (G.mode === 'fps') {
      HX.FPS.update(dt);
      if (HX.FPS.state.active) { HX.FPS.render(); return; }
    }
    updateCam(dt);
    if (G.sim && G.mode === 'campaign') {
      if (G.sim.running) S.update(G.sim, dt);
      drainEvents();
    }
    if (G.map2dOpen && G.mode === 'campaign') {
      map2dT += dt;
      if (map2dT > 0.4) { map2dT = 0; draw2d(); }
    }
    if (G.mode === 'campaign') {
      fpsT += dt;
      if (fpsT > 0.1) { fpsT = 0; updateLabels(); }
      uiT += dt;
      if (uiT > 1.0) { uiT = 0; if (G.sim) UI.update(G.sim, G.sel); }
    }
    renderCampaign(dt);
  }

  let rerouteToastAt = 0, rerouteSuppressed = 0;
  function drainEvents() {
    const evs = G.sim.events;
    while (evs.length) {
      const e = evs.shift();
      if (e.type === 'toast') UI.toast(e.text, e.kind);
      if (e.type === 'request') UI.toast('请示：' + e.text, 'warn');
      if (e.type === 'deviation') UI.toast(e.text, 'warn');
      // 改航必须显式播报：谁改的、为什么、改到哪（禁止静默改航）
      // 同屏多支部队同时请示时按 0.9s 节流，余量计入战报，避免刷屏
      if (e.type === 'reroute') {
        const now = performance.now();
        if (now - rerouteToastAt < 900) { rerouteSuppressed++; }
        else {
          const extra = rerouteSuppressed ? `（另有 ${rerouteSuppressed} 条同类请示见战报）` : '';
          rerouteToastAt = now; rerouteSuppressed = 0;
          UI.toast('改航播报 · ' + (e.decider || '下级') + '：' + e.text + extra, 'warn');
        }
      }
      if (e.type === 'phaseReady') {
        UI.toast(`第 ${e.phase} 阶段目标达成，战局已暂停——请确认是否进入下一阶段`, 'good');
        UI.update(G.sim, G.sel);
      }
      if (e.type === 'deadline') {
        UI.toast(`第 ${e.phase} 阶段历史窗口已过：敌军增援、补给恶化（不判负）`, 'warn');
        UI.update(G.sim, G.sel);
      }
      if (e.type === 'phase') {
        G.setChapter(e.phase);
        UI.update(G.sim, G.sel);
        queueCine({ 2: 'shuangduiji_open', 3: 'chenguangzhuang_open' }[e.phase]);
      }
      if (e.type === 'kmtReaction') {
        UI.toast(`敌军动向：${e.name}（情报滞后 ${e.intelAge} 小时）`, 'warn');
      }
      if (e.type === 'chapter') {
        const cmap = { k7: 1, k12: 2, k2: 3, k13: 3, k16: 3, kzu: 3 };
        if (cmap[e.id]) G.setChapter(cmap[e.id], false);
        const map = { k7: 'nianzhuang_close', k12: 'shuangduiji_close', k2: 'chenguangzhuang_close', k13: 'chenguangzhuang_close', k16: 'chenguangzhuang_close' };
        if (map[e.id]) queueCine(map[e.id]);
        UI.update(G.sim, G.sel);
      }
      if (e.type === 'ending') {
        G.pendingOutcome = e.outcome;
        queueCine('ending');
        if (e.outcome) reportAfterAction(e.outcome, G.sim);
      }
    }
  }

  const cineQueue = [];
  function queueCine(id) {
    if (!id) return;
    if (!D.CINEMATICS.some((c) => c.id === id)) return;
    if (G.playedCine && G.playedCine[id]) return;
    G.playedCine = G.playedCine || {};
    G.playedCine[id] = true;
    cineQueue.push(id);
    if (!HX.Cine.state.active) playNextCine();
  }
  function playNextCine() {
    const id = cineQueue.shift();
    if (!id) {
      if (G.pendingOutcome) { const o = G.pendingOutcome; G.pendingOutcome = null; UI.outcome(G.sim); }
      return;
    }
    const idx = D.CINEMATICS.findIndex((c) => c.id === id);
    if (idx < 0) { playNextCine(); return; }
    G.mode = 'cine';
    HX.Cine.play(idx, () => {
      if (cineQueue.length) playNextCine();
      else {
        if (G.pendingOutcome) { const o = G.pendingOutcome; G.pendingOutcome = null; UI.outcome(G.sim); }
        G.mode = G.sim && G.sim.ended ? 'campaign' : 'campaign';
        UI.setScreen('campaign');
        UI.update(G.sim, G.sel);
      }
    }, false);
  }

  /* ================================ 三维战场 ================================ */
  /* 碾庄圩外壕 + 土圩：地形网格约 1.8 单位/格，环形壕沟会被插值抹平；
     这里沿椭圆逐段贴地铺深色壕沟带，并在内沿立 2.2 单位高土黄色圩墙，
     近景可直接看出「台地—环壕—圩墙」三层结构 */
  function drawMoatWorks(scene) {
    if (!D.MOATS || !G.layers.hydro) return;
    const n = 64;
    for (const m of D.MOATS) {
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        const mx = m.x + Math.cos(a) * m.rx, mz = m.z + Math.sin(a) * m.rz;
        const my = W.heightAt(mx, mz);
        scene.box(mx, my + 0.22, mz, 1.34, 0.90, 1.34, -a, [0.02, 0.11, 0.17], 0.9);
        const wx = m.x + Math.cos(a) * m.rx * 0.90, wz = m.z + Math.sin(a) * m.rz * 0.90;
        scene.box(wx, W.heightAt(wx, wz) + 1.10, wz, 0.86, 2.20, 0.86, -a, [0.42, 0.33, 0.19], 0.55);
      }
    }
  }
  /* 章节专属地形单元：双堆集猬集据点 / 陈官庄空投场 / 作战区边框 */
  function drawStrongpoints(scene) {
    const sp = D.STRONGPOINTS && D.STRONGPOINTS.shuangduiji;
    if (!sp) return;
    for (let i = 0; i < sp.n; i++) {
      const a = i / sp.n * Math.PI * 2;
      const x = sp.x + Math.cos(a) * sp.r * 1.05;
      const z = sp.z + Math.sin(a) * sp.r * 0.92;
      const y = W.heightAt(x, z);
      scene.box(x, y + 0.65, z, 1.9, 1.3, 1.4, -a, [0.30, 0.27, 0.20], 0.05);
      scene.box(x + Math.cos(a) * 1.2, y + 0.45, z + Math.sin(a) * 1.2, 3.2, 0.9, 0.55, -a + Math.PI / 2, [0.36, 0.31, 0.22], 0.05);
    }
    // 内圈汽车/弹药箱（黄维“汽车防线”）
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2 + 0.15;
      const x = sp.x + Math.cos(a) * 5.0, z = sp.z + Math.sin(a) * 4.4;
      scene.box(x, W.heightAt(x, z) + 0.45, z, 2.4, 0.9, 1.1, -a + Math.PI / 2, i % 2 ? [0.22, 0.22, 0.20] : [0.28, 0.26, 0.19], 0.05);
    }
  }
  function drawAirdrop(scene) {
    const ad = D.AIRDROP;
    if (!ad) return;
    const y = W.heightAt(ad.x, ad.z);
    scene.box(ad.x, y + 0.10, ad.z, ad.w, 0.10, ad.d, -ad.rot, [0.52, 0.52, 0.50], 0.0);
    scene.box(ad.x, y + 0.16, ad.z, ad.w * 0.72, 0.06, 0.18, -ad.rot, [0.72, 0.72, 0.70], 0.05);
    scene.box(ad.x, y + 0.16, ad.z, 0.18, 0.06, ad.d * 0.72, -ad.rot, [0.72, 0.72, 0.70], 0.05);
  }
  function drawAreaFrame(scene, ch) {
    const a = ch.area;
    const col = [0.42, 0.72, 0.82], em = 0.25;
    const nx = 18, nz = 14;
    for (let i = 0; i < nx; i++) {
      if (i % 2) continue;
      const x0 = a.x - a.w / 2 + a.w * i / nx;
      scene.box(x0, W.heightAt(x0, a.z - a.h / 2) + 0.25, a.z - a.h / 2, a.w / nx * 0.6, 0.06, 0.45, 0, col, em);
      scene.box(x0, W.heightAt(x0, a.z + a.h / 2) + 0.25, a.z + a.h / 2, a.w / nx * 0.6, 0.06, 0.45, 0, col, em);
    }
    for (let j = 0; j < nz; j++) {
      if (j % 2) continue;
      const z0 = a.z - a.h / 2 + a.h * j / nz;
      scene.box(a.x - a.w / 2, W.heightAt(a.x - a.w / 2, z0) + 0.25, z0, 0.45, 0.06, a.h / nz * 0.6, 0, col, em);
      scene.box(a.x + a.w / 2, W.heightAt(a.x + a.w / 2, z0) + 0.25, z0, 0.45, 0.06, a.h / nz * 0.6, 0, col, em);
    }
  }
  function drawChapterWorks(scene) {
    const ch = G.chapterCfg || (D.chapterOf ? D.chapterOf(G.chapter) : null);
    if (!ch) return;
    if (ch.density && ch.density.strongpointRing) drawStrongpoints(scene);
    if (ch.density && ch.density.airdrop) drawAirdrop(scene);
    if (G.layers.labels) drawAreaFrame(scene, ch);
  }
  function renderCampaign(dt) {
    const scene = new HX.Scene();
    HX.Populate(scene, G.campaign, simulationTime(), { quality: G.quality, layers: G.layers, tier: QUALITY[G.quality], camX: camSmooth.target[0], camZ: camSmooth.target[2] });
    drawMoatWorks(scene);
    drawChapterWorks(scene);
    if (G.sim) {
      drawUnits(scene, G.sim, dt || 0.016);
      drawSoldiers(scene, G.sim, dt || 0.016);
      drawFx(scene, G.sim);
      drawSupply(scene, G.sim);
      drawRoutePreview(scene);
    }
    const env = Object.assign({}, ENV_CAMPAIGN);
    const ch = G.chapterCfg || (D.chapterOf ? D.chapterOf(G.chapter) : null);
    if (ch && ch.env) {
      env.skyTop = ch.env.skyTop;
      env.skyHorizon = ch.env.skyHorizon;
      env.fogCol = ch.env.fogCol;
      env.fogDensity = ch.env.fogDensity;
      env.grade = ch.env.grade;
      if (ch.id === 3) {
        env.sunCol = [0.90, 0.92, 0.96]; env.groundCol = [0.46, 0.50, 0.55]; env.rimCol = [0.86, 0.90, 1.0];
      } else if (ch.id === 2) {
        env.sunCol = [1.0, 0.76, 0.50]; env.groundCol = [0.24, 0.23, 0.18]; env.rimCol = [1.0, 0.74, 0.46];
      }
    }
    env.focus = [cam.target[0], cam.target[2]];
    if (G.sim && G.sim.flags && G.sim.flags.weatherPenalty) env.fogDensity = Math.max(env.fogDensity, 0.0032);
    const statics = G.campaign.staticList.filter((s) => {
      if (s.kind === 'terrain') return G.layers.terrain;
      if (s.kind === 'hydro') return G.layers.hydro;
      if (s.kind === 'rail' || s.kind === 'road') return G.layers.rail;
      return true;
    });
    G.renderer.render(cam, scene, env, statics);
  }

  /* 位置插值：推演时间按小时跳变，渲染层平滑过渡，避免棋子瞬移 */
  const vis = (G.vis = { map: new Map() });
  function dpos(u, dt) {
    let v = vis.map.get(u.id);
    if (!v) { v = { x: u.x, z: u.z }; vis.map.set(u.id, v); }
    const running = G.sim && G.sim.running && G.mode === 'campaign';
    if (!running) { v.x = u.x; v.z = u.z; return v; }
    const k = 1 - Math.pow(0.004, dt);
    v.x += (u.x - v.x) * k;
    v.z += (u.z - v.z) * k;
    if (Math.abs(u.x - v.x) < 0.02) v.x = u.x;
    if (Math.abs(u.z - v.z) < 0.02) v.z = u.z;
    return v;
  }
  const ORDER_COL = {
    move: [0.36, 0.86, 0.98], encircle: [1, 0.62, 0.22], attack: [1, 0.35, 0.28],
    block: [0.70, 0.55, 1], rest: [0.45, 0.95, 0.60], scout: [0.95, 0.88, 0.40]
  };
  function dashLine(scene, x0, z0, x1, z1, col, alpha, seg, gap) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    if (d < 0.5) return;
    const n = Math.max(1, Math.floor(d / (seg + gap)));
    for (let i = 0; i < n; i++) {
      const a = (i * (seg + gap)) / d, b = Math.min(1, (i * (seg + gap) + seg) / d);
      const ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a;
      const bx = x0 + (x1 - x0) * b, bz = z0 + (z1 - z0) * b;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const ang = Math.atan2(z1 - z0, x1 - x0);
      scene.box(mx, W.heightAt(mx, mz) + 0.42, mz, seg * 1.25, 0.05, 0.26, ang, col, alpha);
    }
  }

  function drawUnits(scene, sim, dt) {
    const t = performance.now() / 1000;
    vis.map.forEach((v, id) => { if (!sim.pla.find((u) => u.id === id)) vis.map.delete(id); });
    if (G.layers.pla) {
      for (const u of sim.pla) {
        if (u.dead || u.strength <= 0) continue;
        const v = dpos(u, dt);
        const y = W.heightAt(v.x, v.z);
        const s = 0.9 + Math.sqrt(Math.max(1, u.strength) / 10000) * 1.1;
        const sel = G.sel && G.sel.includes(u.id);
        const hp = Math.max(0.15, u.strength / u.s0);
        const moraleCol = u.morale > 66 ? [0.36, 0.9, 0.55] : u.morale > 36 ? [0.95, 0.8, 0.35] : [1, 0.35, 0.3];
        // LOD：远景保留高方块棋子；中/近景压成低矮基座，把空间让给逐兵（见 drawSoldiers）
        if (soldierLod() === LODF.far) {
          scene.box(v.x, y + 0.55, v.z, 2.0 * s, 1.1, 1.5 * s, 0.15, [0.24, 0.42, 0.44], 0.3);
          scene.box(v.x, y + 1.65, v.z, 1.4 * s, 0.85, 1.0 * s, 0.35, [0.40, 0.68, 0.66], 0.55);
        } else {
          scene.box(v.x, y + 0.09, v.z, 2.0 * s, 0.14, 1.5 * s, 0.15, [0.14, 0.19, 0.20], 0.12);
        }
        scene.box(v.x + 0.9 * s, y + 1.3, v.z, 0.09, 2.6, 0.09, 0, [0.16, 0.18, 0.18], 0.2);
        scene.box(v.x + 1.55 * s, y + 2.5, v.z, 1.3, 0.05, 0.8, 0, [0.85, 0.32, 0.16], 0.7);
        // 战力 / 士气双条（不点开也能看变化）
        const bw = 3.0;
        scene.box(v.x, y + 4.35, v.z, bw, 0.11, 0.22, 0, [0.12, 0.12, 0.12], 0.5);
        scene.box(v.x - bw / 2 + bw * hp / 2, y + 4.37, v.z, bw * hp, 0.09, 0.18, 0, [0.35, 0.85, 0.95], 0.85);
        scene.box(v.x, y + 4.60, v.z, bw, 0.09, 0.16, 0, [0.12, 0.12, 0.12], 0.5);
        scene.box(v.x - bw / 2 + bw * (u.morale / 100) / 2, y + 4.62, v.z, bw * (u.morale / 100), 0.07, 0.14, 0, moraleCol, 0.8);
        if (u.engaged) scene.addSoft(v.x, y + 4.9, v.z, 3.4, [1, 0.5, 0.2], 0.5 + 0.3 * Math.sin(t * 8 + v.x));
        if (u.reroute && sim.t - u.reroute.t < 24) {
          scene.push('ring', v.x, y + 0.18, v.z, 6.2, 1, 6.2, 0, [1, 0.9, 0.35], 0.55 + 0.35 * Math.sin(t * 6));
          scene.addSoft(v.x, y + 5.6, v.z, 2.2, [1, 0.85, 0.3], 0.5);
        }
        if (sel) scene.push('ring', v.x, y + 0.15, v.z, 5.0, 1, 5.0, 0, [1, 0.55, 0.25], 0.85 + 0.15 * Math.sin(t * 4));

        if (!G.layers.orders) continue;
        const col = ORDER_COL[u.order ? u.order.type : 'move'] || ORDER_COL.move;
        // 计划路线（虚线）与实际路线（实线）对比
        if (u.routeOriginal) {
          const ro = u.routeOriginal;
          for (let i = 0; i < ro.length - 1; i++) dashLine(scene, ro[i][0], ro[i][1], ro[i + 1][0], ro[i + 1][1], [0.7, 0.74, 0.76], 0.5, 2.2, 1.8);
        }
        if (u.routeActual && u.routeActual.length > 1) {
          const ra = u.routeActual.concat([[v.x, v.z]]);
          for (let i = 0; i < ra.length - 1; i++) {
            const a = ra[i], b = ra[i + 1];
            const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
            const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
            scene.box(mx, W.heightAt(mx, mz) + 0.5, mz, Math.hypot(b[0] - a[0], b[1] - a[1]) * 1.05, 0.06, 0.22, ang, col, 0.75);
          }
        }
        if (u.path && u.pathIndex < u.path.length) {
          let px = v.x, pz = v.z;
          for (let i = u.pathIndex; i < u.path.length; i++) {
            const nx = u.path[i][0], nz = u.path[i][1];
            dashLine(scene, px, pz, nx, nz, col, 0.55, 3.2, 1.6);
            px = nx; pz = nz;
          }
          const ex = u.path[u.path.length - 1][0], ez = u.path[u.path.length - 1][1];
          const ey = W.heightAt(ex, ez);
          scene.push('ring', ex, ey + 0.2, ez, 2.8, 1, 2.8, 0, col, 0.75 + 0.2 * Math.sin(t * 5));
          scene.box(ex, ey + 3.0, ez, 0.14, 6.0, 0.14, 0, col, 0.55);
        } else if (u.dest) {
          const dx = u.dest.x - v.x, dz = u.dest.z - v.z;
          const dl = Math.hypot(dx, dz) || 1;
          for (let i = 1; i <= 6; i++) {
            const k = i / 7;
            const px = v.x + dx * k, pz = v.z + dz * k;
            scene.box(px, W.heightAt(px, pz) + 0.45, pz, 1.8, 0.05, 0.3, Math.atan2(dz, dx), col, 0.55);
          }
          const ang = Math.atan2(dz, dx);
          for (const sgn of [1, -1]) {
            scene.box(u.dest.x - Math.cos(ang + sgn * 0.5) * 1.6, W.heightAt(u.dest.x, u.dest.z) + 0.5,
              u.dest.z - Math.sin(ang + sgn * 0.5) * 1.6, 2.2, 0.06, 0.3, ang + sgn * 0.5, col, 0.85);
          }
          scene.push('ring', u.dest.x, W.heightAt(u.dest.x, u.dest.z) + 0.2, u.dest.z, 3.2, 1, 3.2, 0, col, 0.7 + 0.2 * Math.sin(t * 5));
          scene.box(u.dest.x, W.heightAt(u.dest.x, u.dest.z) + 2.6, u.dest.z, 0.12, 5.0, 0.12, 0, col, 0.45);
        }
      }
    }
    if (G.layers.kmt) {
      for (const k of sim.kmt) {
        if (!k.alive) continue;
        const it = S.intelOf(sim, k.id);
        if (!it) continue;
        const y = W.heightAt(it.x, it.z);
        const fresh = it.age <= 12;
        const conf = it.conf / 100;
        const col = fresh ? [0.85, 0.24, 0.20] : [0.42, 0.30, 0.24];
        const s = 1.1 + Math.sqrt(Math.max(1, it.strength) / 10000) * 1.2;
        if (soldierLod() === LODF.far) {
          scene.box(it.x, y + 0.5, it.z, 2.2 * s, 1.0, 1.7 * s, 0.6, col, fresh ? 0.7 : 0.15);
          scene.box(it.x, y + 1.5, it.z, 1.5 * s, 0.8, 1.2 * s, 0.9, [col[0] * 0.8, col[1] * 0.7, col[2] * 0.7], fresh ? 0.4 : 0.1);
        } else {
          scene.box(it.x, y + 0.09, it.z, 2.2 * s, 0.14, 1.7 * s, 0.6, [0.16, 0.11, 0.10], fresh ? 0.22 : 0.1);
        }
        scene.box(it.x + 1.0 * s, y + 1.2, it.z, 0.08, 2.4, 0.08, 0, [0.16, 0.16, 0.16]);
        scene.box(it.x + 1.6 * s, y + 2.4, it.z, 1.1, 0.05, 0.7, 0, [0.55, 0.16, 0.14], fresh ? 0.5 : 0.1);
        // 包围圈随就位部队逐步合拢：8 个扇区，已封锁的亮起
        if (k.cover > 0) {
          const radius = 16 - 4.2 * (k.cover / 8);
          for (let sIdx = 0; sIdx < 8; sIdx++) {
            const ang = sIdx * Math.PI / 4;
            const covered = k.sectors && k.sectors[sIdx];
            const bx = it.x + Math.cos(ang) * radius, bz = it.z + Math.sin(ang) * radius;
            scene.box(bx, W.heightAt(bx, bz) + 0.35, bz, 3.4, 0.1, 0.55, -ang + Math.PI / 2,
              covered ? [1, 0.4, 0.25] : [0.5, 0.35, 0.3], covered ? 0.85 : 0.18);
          }
          const grp3 = sim.phase === 3 && D.ENCIRCLE && D.ENCIRCLE.group.includes(k.id);
          if (k.surrounded && !grp3) {
            const es = (D.ENCIRCLE && D.ENCIRCLE.byId && D.ENCIRCLE.byId[k.id]) || (D.ENCIRCLE && D.ENCIRCLE.default) || { rx: 7, rz: 6 };
            scene.push('ring', it.x, y + 0.2, it.z, es.rx, 1, es.rz, 0, [1, 0.35, 0.3], 0.65 + 0.25 * Math.sin(t * 3));
          }
        }
        if (!fresh) scene.addSoft(it.x, y + 4.6, it.z, 2.4, [0.8, 0.75, 0.55], 0.25);
        if (G.layers.intel) {
          const err = 2.2 + Math.min(13, it.age * 0.32);
          scene.push('ring', it.x, y + 0.06, it.z, err, 1, err, 0, fresh ? [0.4, 0.8, 0.75] : [0.75, 0.6, 0.4], initialAlpha(it) * 0.5);
        }
      }
      // 第三阶段陈官庄合围圈：东西 10 km、南北 5 km（rx 6.25、rz 3.125 单位），按集团质心绘制
      if (sim.phase === 3 && D.ENCIRCLE) {
        const g = D.ENCIRCLE.group.map((id) => sim.kmt.find((x) => x.id === id)).filter((k) => k && k.alive);
        const sur = g.filter((k) => k.surrounded);
        if (g.length && sur.length) {
          const cx = g.reduce((a, k) => a + k.x, 0) / g.length;
          const cz = g.reduce((a, k) => a + k.z, 0) / g.length;
          const cg = D.ENCIRCLE.chenguangzhuang;
          // 指挥合围线：抬到兵棋标绘之上，用浅色粗虚线画椭圆，避免与红色守军标绘混同
          const gy = W.heightAt(cx, cz) + 4.4;
          const segN = 56;
          for (let i = 0; i < segN; i++) {
            const a0 = i / segN * Math.PI * 2, a1 = (i + 1) / segN * Math.PI * 2;
            const x0 = cx + Math.cos(a0) * cg.rx, z0 = cz + Math.sin(a0) * cg.rz;
            const x1 = cx + Math.cos(a1) * cg.rx, z1 = cz + Math.sin(a1) * cg.rz;
            const mx2 = (x0 + x1) / 2, mz2 = (z0 + z1) / 2;
            const len = Math.hypot(x1 - x0, z1 - z0);
            const ang = Math.atan2(z1 - z0, x1 - x0);
            scene.box(mx2, gy, mz2, len * 1.10, 0.10, 0.34, ang, [1, 0.93, 0.62], 0.85 + 0.15 * Math.sin(t * 3 + i * 0.5));
          }
        }
      }
    }
    // 交火标记：接触线 + 枪口闪光/烟柱
    if (G.layers.pla) {
      for (const u of sim.pla) {
        if (u.dead || !u.engaged) continue;
        const v = dpos(u, dt);
        let best = null, bd = 12;
        for (const k of sim.kmt) {
          if (!k.alive) continue;
          const it = S.intelOf(sim, k.id);
          if (!it) continue;
          const dd = Math.hypot(v.x - it.x, v.z - it.z);
          if (dd < bd) { bd = dd; best = it; }
        }
        scene.addSoft(v.x, W.heightAt(v.x, v.z) + 4.2, v.z, 2.6, [1, 0.75, 0.3], 0.7 + 0.3 * Math.sin(t * 20 + v.x));
        if (best) {
          for (let i = 1; i < 4; i++) {
            const q = i / 4;
            const px = v.x + (best.x - v.x) * q, pz = v.z + (best.z - v.z) * q;
            scene.addSoft(px, W.heightAt(px, pz) + 1.6 + Math.sin(t * 9 + i) * 0.4, pz, 0.9, [1, 0.5, 0.2], 0.5);
          }
        }
      }
    }
    // 兵站
    if (G.layers.supply) {
      for (const d of D.DEPOTS.pla) {
        const y = W.heightAt(d.x, d.z);
        scene.push('cyl', d.x, y + 0.1, d.z, 2.2, 0.6, 2.2, 0, [0.20, 0.55, 0.45], 0.5);
        scene.addSprite(d.x, y + 2.2, d.z, 3.0, [0.35, 0.9, 0.7], 0.25);
      }
    }
  }
  /* ---------------- 逐兵表现：按缩放分级 LOD ----------------
     说明：HX.Scene.push/box 写入的是实例属性缓冲（engine.js L519-523 用
     vertexAttribDivisor=1 绘制），每次 box 只增加 1 个 instance，
     不增加 draw call——因此逐兵用"多次 box"仍是 InstancedMesh 批量绘制。 */
  const LODF = { far: 0, mid: 1, near: 2 };
  const SOLD = {
    pla: { coat: [0.15, 0.40, 0.30], head: [0.95, 0.82, 0.65], gear: [0.10, 0.11, 0.12] },
    kmt: { coat: [0.45, 0.25, 0.12], head: [0.95, 0.82, 0.65], gear: [0.10, 0.11, 0.12] }
  };
  G.soldierStats = { lod: 0, units: 0, soldiers: 0, instances: 0 };
  function soldierLod() {
    const d = cam.dist;
    if (d > 132) return LODF.far;
    if (d > 76) return LODF.mid;
    return LODF.near;
  }
  function drawSoldiers(scene, sim, dt) {
    const lod = soldierLod();
    const st = G.soldierStats;
    if (st.lod === lod && st.instances === 0) { /* noop */ }
    st.lod = lod;
    st.units = 0; st.soldiers = 0; st.instances = 0;
    if (lod === LODF.far) return;
    const per = lod === LODF.mid ? 8 : 24;
    const rows = lod === LODF.mid ? 3 : 4;
    let budget = lod === LODF.mid ? 2400 : 4800;
    const draw = (list, side, enemy) => {
      for (const u of list) {
        if (budget <= 0) break;
        let x, z, strength;
        if (enemy) {
          const it = S.intelOf(sim, u.id);
          if (!u.alive || !it || it.age > 36) continue;
          x = it.x; z = it.z; strength = it.strength;
        } else {
          if (u.dead || u.strength <= 0) continue;
          const v = dpos(u, dt); x = v.x; z = v.z; strength = u.strength;
        }
        // 朝向：行军朝目标点；交战朝最近敌军；否则朝地图北方
        let heading = -Math.PI / 2;
        if (!enemy && u.dest) heading = Math.atan2(u.dest.z - z, u.dest.x - x);
        else if (u.engaged || enemy) {
          const foes = enemy ? sim.pla : sim.kmt;
          let bx = 0, bz = 0, bd = 1e9;
          for (const e of foes) {
            if (!enemy && (!e.alive)) continue;
            if (enemy && e.dead) continue;
            const d = Math.hypot(e.x - x, e.z - z);
            if (d < bd) { bd = d; bx = e.x; bz = e.z; }
          }
          if (bd < 1e8) heading = Math.atan2(bz - z, bx - x);
        }
        const isArty = /炮/.test(u.role || '') || /炮/.test(u.name || '');
        const s = 0.70 + Math.sqrt(Math.max(1, strength) / 10000) * 0.55;
        const n = Math.min(per, Math.max(4, Math.round(strength / 900)));
        const cols = Math.ceil(n / rows);
        const c = SOLD[side];
        // 行距拉大，避免 box 互相穿透
        const lxs = 0.44 * s, lzs = 0.50 * s;
        for (let i = 0; i < n && budget > 1; i++) {
          const rr = Math.floor(i / cols), cc = i % cols;
          const lx = (cc - (cols - 1) / 2) * lxs;
          const lz = (rr - (rows - 1) / 2) * lzs;
          const px = x + Math.cos(heading) * lz - Math.sin(heading) * lx;
          const pz = z + Math.sin(heading) * lz + Math.cos(heading) * lx;
          const y = W.heightAt(px, pz);
          const sway = u.engaged ? 0 : Math.sin(performance.now() / 300 + i) * 0.03 * s;
          // 放大 box：躯干宽 0.32s、高 0.62s；肩线宽 0.44s；头 0.20s
          scene.box(px, y + 0.33 * s, pz, 0.32 * s, 0.62 * s, 0.24 * s, heading, c.coat, 0.85);
          scene.box(px, y + 0.58 * s, pz, 0.44 * s, 0.09 * s, 0.18 * s, heading, c.coat, 0.55);
          scene.box(px, y + 0.72 * s + sway, pz, 0.20 * s, 0.20 * s, 0.20 * s, 0, c.head, 0.95);
          budget -= 3; st.instances += 3;
          if (lod === LODF.near) {
            // 兵种：0 步兵（步枪）/ 1 机枪（三脚架+长枪管）/ 2 炮兵（炮管+炮轮）/ 3 担架（白板+红十字）
            const kind = isArty ? (i % 5 === 0 ? 2 : 0)
              : (i % 8 === 0 ? 1 : i % 17 === 0 ? 3 : 0);
            const hx = Math.cos(heading), hz = Math.sin(heading);
            if (kind === 1) {
              scene.box(px + hx * 0.42 * s, y + 0.48 * s, pz + hz * 0.42 * s,
                1.2 * s, 0.09, 0.09, heading, [0.08, 0.09, 0.10], 0.8);
              scene.box(px, y + 0.20 * s, pz, 0.52 * s, 0.42 * s, 0.52 * s, heading, [0.13, 0.12, 0.11], 0.4);
            } else if (kind === 2) {
              scene.box(px + hx * 0.55 * s, y + 0.62 * s, pz + hz * 0.55 * s,
                1.6 * s, 0.16, 0.16, heading, [0.15, 0.16, 0.17], 0.85);
              scene.box(px + hx * 0.06 * s, y + 0.22 * s, pz + hz * 0.06 * s,
                0.42 * s, 0.28 * s, 0.62 * s, heading, [0.28, 0.24, 0.18], 0.35);
            } else if (kind === 3) {
              scene.box(px, y + 0.52 * s, pz, 1.3 * s, 0.07, 0.36 * s, heading, [0.92, 0.92, 0.90], 0.85);
              scene.box(px, y + 0.59 * s, pz, 0.34 * s, 0.06, 0.12 * s, heading, [0.90, 0.12, 0.10], 0.95);
              scene.box(px + hx * 0.55 * s, y + 0.52 * s, pz + hz * 0.55 * s, 0.10, 0.06, 0.10, 0, [0.85, 0.85, 0.82], 0.7);
            } else {
              scene.box(px + hx * 0.40 * s, y + 0.52 * s, pz + hz * 0.40 * s,
                0.80 * s, 0.08, 0.08, heading, [0.09, 0.09, 0.09], 0.7);
            }
            budget -= (kind === 3 ? 3 : 2); st.instances += (kind === 3 ? 3 : 2);
          }
          st.soldiers++;
        }
        st.units++;
      }
    };
    if (G.layers.pla) draw(sim.pla, 'pla', false);
    if (G.layers.kmt) draw(sim.kmt, 'kmt', true);
  }

  /* ---------------- 交战表现（全部读取 sim.fx，事件驱动，无装饰性循环） ---------------- */
  const fxBorn = new Map();
  const FX_LIFE = { fire: 0.55, shell: 1.7, hit: 2.2, contact: 2.6, sector: 1.2, closing: 2.6, destroyed: 3.2 };
  function drawFx(scene, sim) {
    const now = performance.now() / 1000;
    const list = sim.fx || [];
    for (const f of list) {
      if (!fxBorn.has(f.i)) fxBorn.set(f.i, now);
      const age = now - fxBorn.get(f.i);
      const life = FX_LIFE[f.kind] || 1.5;
      if (age > life) continue;
      const q = age / life;
      const fade = Math.max(0, 1 - q);
      const y = W.heightAt(f.x, f.z);
      if (f.kind === 'fire') {
        const ang = Math.atan2(f.tz - f.z, f.tx - f.x);
        const d = Math.hypot(f.tx - f.x, f.tz - f.z);
        const n = Math.min(8, Math.max(3, Math.round(d / 9)));
        for (let i = 0; i < n; i++) {
          const k = (i + 1) / (n + 1);
          const px = f.x + (f.tx - f.x) * k, pz = f.z + (f.tz - f.z) * k;
          const jitter = Math.sin(f.i * 3.7 + i) * 0.5;
          scene.box(px, y + 1.35 + jitter, pz, 1.7, 0.11, 0.11, ang,
            [1, 0.86, 0.48], fade * 0.95);
        }
        scene.addSoft(f.x, y + 1.6, f.z, 1.0 + fade * 0.6, [1, 0.88, 0.55], fade * 0.85);
        scene.addSoft(f.x + Math.cos(ang) * 1.2, y + 1.9, f.z + Math.sin(ang) * 1.2, 0.8, [1, 0.75, 0.35], fade * 0.7);
        const ty = W.heightAt(f.tx, f.tz);
        scene.addSoft(f.tx, ty + 1.2, f.tz, 1.3, [1, 0.7, 0.4], fade * 0.8);
      } else if (f.kind === 'shell') {
        const r = (f.r || 2.5) * (0.25 + q * 1.8);
        scene.push('ring', f.x, y + 0.1, f.z, r, 1, r, 0, [1, 0.55, 0.2], fade * 0.9);
        scene.addSoft(f.x, y + 0.8 + q * 2.4, f.z, 2.2 + q * 2.6, [0.32, 0.28, 0.24], fade * 0.55);
        scene.addSoft(f.x, y + 0.5, f.z, 1.2 + q * 1.2, [1, 0.7, 0.3], fade * 0.8);
      } else if (f.kind === 'hit') {
        const col = f.side === 'pla' ? [1, 0.35, 0.30] : [1, 0.55, 0.2];
        const s = 1.6 + fade * 1.0;
        scene.box(f.x - s * 0.5, y + 2.6, f.z, s * 1.4, 0.10, 0.10, 0.8, col, fade * 0.95);
        scene.box(f.x + s * 0.5, y + 2.6, f.z, s * 1.4, 0.10, 0.10, -0.8, col, fade * 0.95);
        scene.push('ring', f.x, y + 0.08, f.z, 1.3 + q * 2.2, 1, 1.3 + q * 2.2, 0, col, fade * 0.7);
        scene.addSoft(f.x, y + 3.0, f.z, 1.6, col, fade * 0.8);
      } else if (f.kind === 'contact') {
        const ang = Math.atan2(f.tz - f.z, f.tx - f.x);
        const mx = (f.x + f.tx) / 2, mz = (f.z + f.tz) / 2;
        for (const sgn of [0, 1]) {
          const a2 = ang + (sgn ? Math.PI : 0);
          scene.box(mx - Math.cos(a2) * 1.4, W.heightAt(mx, mz) + 0.5, mz - Math.sin(a2) * 1.4,
            2.2, 0.06, 0.28, a2, sgn ? [0.5, 0.75, 1] : [1, 0.45, 0.30], fade * 0.9);
        }
        scene.addSoft(mx, W.heightAt(mx, mz) + 1.2, mz, 3.0, [1, 0.72, 0.4], fade * 0.35);
      } else if (f.kind === 'sector') {
        const r = 15.5;
        for (const sIdx of [0, 1, 2, 3, 4, 5, 6, 7]) {
          const a = sIdx * Math.PI / 4;
          const bx = f.x + Math.cos(a) * r, bz = f.z + Math.sin(a) * r;
          const b = f.sectors && f.sectors[sIdx];
          scene.box(bx, W.heightAt(bx, bz) + 0.3, bz, 2.6, 0.08, 0.5, -a + Math.PI / 2,
            b ? [1, 0.45, 0.25] : [0.5, 0.4, 0.35], (b ? 0.8 : 0.2) * fade);
        }
      } else if (f.kind === 'closing') {
        const rr = 17 - q * 8;
        scene.push('ring', f.x, y + 0.12, f.z, rr, 1, rr, 0, [1, 0.3, 0.24], fade * 0.9);
        scene.addSoft(f.x, y + 4.0, f.z, 2.6, [1, 0.4, 0.3], fade * 0.5);
      } else if (f.kind === 'destroyed') {
        scene.push('ring', f.x, y + 0.1, f.z, 2 + q * 12, 1, 2 + q * 12, 0, [1, 0.75, 0.35], fade * 0.8);
        scene.addSoft(f.x, y + 3 + q * 6, f.z, 4 + q * 6, [0.25, 0.22, 0.2], fade * 0.6);
      }
    }
    for (const [k, v] of fxBorn) if (now - v > 8) fxBorn.delete(k);
  }
  G.fxRecent = function (unitId, w) {
    const now = performance.now() / 1000;
    for (const f of (G.sim.fx || [])) {
      if (f.unit !== unitId) continue;
      if ((fxBorn.get(f.i) == null) || now - fxBorn.get(f.i) <= (w || 2)) return true;
    }
    return false;
  };

  function initialAlpha(it) { return it.age <= 12 ? 0.8 : 0.35; }

  function drawSupply(scene, sim) {
    if (!G.layers.supply) return;
    const t = performance.now() / 1000;
    for (const u of sim.pla) {
      if (u.dead) continue;
      const v = vis.map.get(u.id) || u;
      let near = null, bd = 1e9;
      for (const d of D.DEPOTS.pla) {
        const dd = Math.hypot(d.x - v.x, d.z - v.z);
        if (dd < bd) { bd = dd; near = d; }
      }
      if (!near || bd > 95) continue;
      const col = u.supplied ? [0.4, 0.85, 0.6] : [1, 0.25, 0.2];
      const n = 7;
      for (let i = 1; i < n; i++) {
        const q = i / n;
        const px = near.x + (v.x - near.x) * q, pz = near.z + (v.z - near.z) * q;
        scene.addSoft(px, W.heightAt(px, pz) + 0.4, pz, u.supplied ? 0.38 : 0.5 + 0.2 * Math.sin(t * 6 + i), col, u.supplied ? 0.26 : 0.6);
      }
      // 补给线本体：正常为绿色虚线，被切断时变红并加粗闪烁
      dashLine(scene, near.x, near.z, v.x, v.z, col, u.supplied ? 0.34 : 0.72 + 0.12 * Math.sin(t * 5), u.supplied ? 3.4 : 4.6, 1.6);
      if (!u.supplied) {
        dashLine(scene, near.x, near.z, v.x, v.z, [1, 0.55, 0.45], 0.35, 2.2, 2.4);
        scene.addSoft(v.x, W.heightAt(v.x, v.z) + 2.0, v.z, 2.4, [1, 0.3, 0.22], 0.55 + 0.3 * Math.sin(t * 5));
      }
    }
  }

  function drawRoutePreview(scene) {
    const rd = G.routeDraw;
    if (!rd || !rd.active || !rd.points.length) return;
    const col = [0.45, 1, 0.9];
    let px = rd.points[0][0], pz = rd.points[0][1];
    scene.push('ring', px, W.heightAt(px, pz) + 0.2, pz, 2.2, 1, 2.2, 0, col, 0.8);
    for (let i = 1; i < rd.points.length; i++) {
      const nx = rd.points[i][0], nz = rd.points[i][1];
      dashLine(scene, px, pz, nx, nz, col, 0.85, 3.4, 1.2);
      scene.push('ring', nx, W.heightAt(nx, nz) + 0.2, nz, 1.8, 1, 1.8, 0, col, 0.7);
      px = nx; pz = nz;
    }
    scene.box(px, W.heightAt(px, pz) + 2.6, pz, 0.12, 5.2, 0.12, 0, col, 0.6);
    if (rd.hover) {
      dashLine(scene, px, pz, rd.hover[0], rd.hover[1], [1, 1, 1], 0.35, 2.4, 1.6);
    }
  }

  function simulationTime() {
    return G.sim ? G.sim.t : (performance.now() / 1000);
  }

  /* ================================ 世界陈设 ================================ */
  HX.Populate = function (scene, campaign, t, opts) {
    const q = (opts && opts.quality) || 'high';
    const L = (opts && opts.layers) || null;
    const tier = (opts && opts.tier) || null;
    const step = tier ? tier.treeStep : (q === 'low' ? 3 : q === 'mid' ? 2 : 1);
    const drawDist = tier ? tier.drawDist : 0;
    const camX = opts && opts.camX, camZ = opts && opts.camZ;
    if (!L || L.terrain) {
      for (const v of campaign.villages) {
        for (const h of v.houses) {
          scene.box(h.x, h.y + h.h / 2, h.z, h.w, h.h, h.d, h.rot, [0.34, 0.30, 0.24, 1]);
          scene.push('wedge', h.x, h.y + h.h, h.z, h.w * 1.04, 0.34, h.d * 1.04, h.rot, [0.20, 0.18, 0.15, 1]);
        }
      }
      for (let i = 0; i < campaign.trees.length; i += step) {
        const tr = campaign.trees[i];
        if (drawDist > 0 && camX != null && Math.hypot(tr.x - camX, tr.z - camZ) > drawDist) continue;
        scene.push('cyl', tr.x, tr.y + 1.0, tr.z, 0.22, 2.0, 0.22, tr.rot, [0.19, 0.15, 0.11]);
        scene.push('cone6', tr.x, tr.y + 1.7, tr.z, 2.1 * tr.s, 2.9 * tr.s, 2.1 * tr.s, tr.rot, [0.15, 0.21, 0.16]);
      }
    }
    if (q !== 'low' && (!L || L.rail)) {
      for (const r of D.RAILS) {
        for (let i = 0; i < r.pts.length - 1; i += 2) {
          const a = r.pts[i], b = r.pts[i + 1];
          const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
          scene.push('box', mx, W.heightAt(mx, mz) + 0.35, mz, 2.2, 0.5, 2.2, ang, [0.24, 0.20, 0.16]);
        }
      }
    }
  };

  /* ================================ 标签 ================================ */
  function unitStatus(u) {
    if (u.dead) return '已撤出';
    if (u.engaged) return '交火中';
    if (!u.supplied) return '补给中断';
    if (u.halted) return '停止待命';
    if (u.reroute && G.sim.t - u.reroute.t < 24) return '已改道';
    if (u.path && u.pathIndex < u.path.length) return `行进 ${u.pathIndex}/${u.path.length}`;
    if (u.order && u.order.arrived) return '已到位';
    return '';
  }
  function updateLabels() {
    if (!G.sim) return;
    const html = [];
    for (const c of D.CITIES) {
      if (!G.layers.labels) break;
      if (c.minor) continue;
      const p = project(c.x, W.heightAt(c.x, c.z) + 1, c.z);
      if (!p || p.z > 500) continue;
      html.push(`<div class="lbl city" style="left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px">${c.name}</div>`);
    }
    if (G.layers.labels) {
      for (const u of G.sim.pla) {
        if (u.dead) continue;
        const v = G.vis && G.vis.map.get(u.id);
        const ux = v ? v.x : u.x, uz = v ? v.z : u.z;
        const p = project(ux, W.heightAt(ux, uz) + 5.2, uz);
        if (!p || p.z > 400) continue;
        const sel = G.sel && G.sel.includes(u.id) ? ' sel' : '';
        const st = unitStatus(u);
        html.push(`<div class="lbl${sel}" style="left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px;color:${sel ? '#ff9a54' : '#a8d8d6'}">${u.short}<br><small>${(u.strength / 10000).toFixed(1)}万 · 士${Math.round(u.morale)}${st ? ' · ' + st : ''}</small></div>`);
      }
      for (const k of G.sim.kmt) {
        if (!k.alive || !G.layers.kmt) continue;
        const it = S.intelOf(G.sim, k.id);
        if (!it) continue;
        const p = project(it.x, W.heightAt(it.x, it.z) + 4.8, it.z);
        if (!p || p.z > 400) continue;
        if (it.age > 24) {
          html.push(`<div class="lbl ghost" style="left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px">？ 情报空白</div>`);
        } else {
          const err = G.layers.intel ? ` · ±${(2 + Math.min(13, it.age * 0.3)).toFixed(1)}km ${it.conf}%` : '';
          html.push(`<div class="lbl enemy" style="left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px">${k.short}<br><small>${(it.strength / 10000).toFixed(1)}万 · ${Math.round(it.age)}h前${err}</small></div>`);
        }
      }
    }
    $('labels').innerHTML = html.join('');
  }

  /* ================================ 2D 舆图 ================================ */
  function toggle2d() {
    if (G.mode !== 'campaign') return;
    G.map2dOpen = !G.map2dOpen;
    UI.setScreen(G.map2dOpen ? 'map2d_screen' : 'campaign');
    if (G.map2dOpen) {
      buildLayers();
      resize2d();
      draw2d();
    }
  }

  function ctxMenu(x, y) {
    document.querySelectorAll('.ctx-menu').forEach((n) => n.remove());
    const u = G.sim && G.sel.length ? G.sim.pla.find((p) => p.id === G.sel[0]) : null;
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.innerHTML = `<button data-ctx="cmdr">看指挥员${u ? '（' + u.cmdr + '）' : ''}</button><button data-ctx="req">下级请示</button>`;
    document.body.appendChild(menu);
    menu.onclick = (ev) => {
      const b = ev.target.closest('[data-ctx]');
      if (!b) return;
      menu.remove();
      if (b.dataset.ctx === 'cmdr' && u) UI.commanderCard(G.sim, u.id);
      else if (b.dataset.ctx === 'req') UI.requests(G.sim);
    };
  }
  window.addEventListener('contextmenu', (ev) => {
    if (!G.map2dOpen) return;
    const screen = $('map2d-screen');
    if (!screen || !screen.contains(ev.target)) return;
    ev.preventDefault();
    ctxMenu(ev.clientX, ev.clientY);
  });
  window.addEventListener('pointerdown', (ev) => {
    const m = document.querySelector('.ctx-menu');
    if (m && !m.contains(ev.target)) m.remove();
  }, true);

  function resize2d() {
    const c = $('map2d');
    if (!c) return;
    const r = c.parentElement.getBoundingClientRect();
    c.width = Math.max(320, Math.floor(r.width));
    c.height = Math.max(240, Math.floor(r.height));
    draw2d();
  }

  function buildLayers() {
    const box = $('mapLayers');
    if (!box || box.dataset.built) return;
    box.dataset.built = '1';
    const names = [['terrain', '地形 / 等高'], ['hydro', '水系'], ['rail', '铁路'], ['pla', '我军部署'], ['kmt', '敌情（战报所及）'], ['intel', '情报可信度 / 误差圈'], ['supply', '补给线 / 兵站'], ['orders', '命令队列'], ['labels', '地名标注']];
    box.innerHTML = `<div class="panel-title"><b>图层</b><span>LAYERS</span></div>` +
      names.map((n) => `<label class="layer-row"><input type="checkbox" data-layer="${n[0]}" ${G.layers[n[0]] ? 'checked' : ''}><span>${n[1]}</span></label>`).join('') +
      `<div class="divider"></div><div class="dim-note" style="padding:4px 10px">情报并非全知：只显示己方部署与战报所及的敌情。旧情报带时间戳与可信度。</div>`;
    box.querySelectorAll('input').forEach((i) => {
      i.onchange = () => { G.layers[i.dataset.layer] = i.checked; draw2d(); };
    });
    const cv = $('map2d');
    cv.onwheel = (ev) => {
      ev.preventDefault();
      map2d.zoom = clamp(map2d.zoom * (ev.deltaY > 0 ? 0.88 : 1.14), 0.6, 3.2);
      draw2d();
    };
    const p2d = { pts: new Map(), sep: 0, zoom: 1, pinch: false };
    cv.onpointerdown = (ev) => {
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      if (ev.pointerType === 'touch') {
        p2d.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (p2d.pts.size === 2) {
          const a = [...p2d.pts.values()];
          p2d.pinch = true;
          p2d.sep = Math.max(10, Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y));
          p2d.zoom = map2d.zoom;
          map2d.drag = null;
          return;
        }
      }
      map2d.drag = { x: ev.clientX, y: ev.clientY, ox: map2d.ox, oy: map2d.oy, moved: false };
    };
    cv.onpointermove = (ev) => {
      if (ev.pointerType === 'touch' && p2d.pts.has(ev.pointerId)) {
        p2d.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (p2d.pinch && p2d.pts.size >= 2) {
          const a = [...p2d.pts.values()];
          const sep = Math.max(10, Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y));
          map2d.zoom = clamp(p2d.zoom * sep / p2d.sep, 0.6, 3.2);
          draw2d();
          return;
        }
      }
      if (map2d.drag) {
        const dx = ev.clientX - map2d.drag.x, dy = ev.clientY - map2d.drag.y;
        if (Math.hypot(dx, dy) > 4) map2d.drag.moved = true;
        map2d.ox = map2d.drag.ox + dx;
        map2d.oy = map2d.drag.oy + dy;
        draw2d();
        return;
      }
      if (ev.pointerType !== 'touch') mapHover(ev);
    };
    cv.onpointerup = (ev) => {
      p2d.pts.delete(ev.pointerId);
      if (p2d.pinch) { if (p2d.pts.size < 2) p2d.pinch = false; map2d.drag = null; return; }
      if (map2d.drag && !map2d.drag.moved) mapClick(ev);
      map2d.drag = null;
      try { cv.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    };
    cv.onpointercancel = () => { p2d.pts.clear(); p2d.pinch = false; map2d.drag = null; };
    cv.onpointerleave = () => { const tt = $('mapTooltip'); if (tt) tt.classList.add('hidden'); };
  }

  function m2s(x, z, c) {
    const mw = W.BOUNDS.maxX - W.BOUNDS.minX + 10, mh = W.BOUNDS.maxZ - W.BOUNDS.minZ + 12;
    const scale = Math.min(c.width / mw, c.height / mh) * map2d.zoom;
    const cx = c.width / 2 + map2d.ox, cy = c.height / 2 + map2d.oy;
    const mc = [(W.BOUNDS.minX + W.BOUNDS.maxX) / 2, (W.BOUNDS.minZ + W.BOUNDS.maxZ) / 2];
    return [cx + (x - mc[0]) * scale, cy + (z - mc[1]) * scale, scale];
  }
  function s2m(sx, sy, c) {
    const mw = W.BOUNDS.maxX - W.BOUNDS.minX + 10, mh = W.BOUNDS.maxZ - W.BOUNDS.minZ + 12;
    const scale = Math.min(c.width / mw, c.height / mh) * map2d.zoom;
    const cx = c.width / 2 + map2d.ox, cy = c.height / 2 + map2d.oy;
    const mc = [(W.BOUNDS.minX + W.BOUNDS.maxX) / 2, (W.BOUNDS.minZ + W.BOUNDS.maxZ) / 2];
    return [mc[0] + (sx - cx) / scale, mc[1] + (sy - cy) / scale];
  }

  function draw2d() {
    const c = $('map2d');
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const Wd = c.width, Hd = c.height;
    g.clearRect(0, 0, Wd, Hd);
    g.fillStyle = '#04121a';
    g.fillRect(0, 0, Wd, Hd);
    // 网格
    g.strokeStyle = 'rgba(70,130,145,.10)';
    g.lineWidth = 1;
    for (let x = 0; x < Wd; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Hd); g.stroke(); }
    for (let y = 0; y < Hd; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(Wd, y); g.stroke(); }

    if (G.layers.terrain) {
      const stepX = 14, stepZ = 14;
      for (let wx = W.BOUNDS.minX; wx < W.BOUNDS.maxX; wx += stepX) {
        for (let wz = W.BOUNDS.minZ; wz < W.BOUNDS.maxZ; wz += stepZ) {
          const p = m2s(wx, wz, c);
          const hh = W.heightAt(wx, wz);
          const v = clamp((hh + 6) / 26, 0, 1);
          const r = Math.round(20 + v * 26), gg = Math.round(34 + v * 30), b = Math.round(30 + v * 22);
          g.fillStyle = `rgb(${r},${gg},${b})`;
          g.fillRect(p[0], p[1], stepX * p[2] + 1, stepZ * p[2] + 1);
        }
      }
    }
    if (G.layers.hydro) {
      g.strokeStyle = 'rgba(78,178,200,.55)';
      for (const r of D.RIVERS) {
        g.lineWidth = Math.max(1.5, 3.2 * map2d.zoom);
        g.beginPath();
        r.pts.forEach((pt, i) => { const p = m2s(pt[0], pt[1], c); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
        g.stroke();
      }
      // 河渠与圩壕（细线）
      g.strokeStyle = 'rgba(96,186,200,.42)';
      g.lineWidth = Math.max(1, 1.3 * map2d.zoom);
      for (const cn of D.CANALS || []) {
        g.beginPath();
        cn.pts.forEach((pt, i) => { const p = m2s(pt[0], pt[1], c); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
        g.stroke();
      }
      // 废黄河故道堤坝（土黄色）
      g.strokeStyle = 'rgba(160,138,88,.55)';
      g.lineWidth = Math.max(2, 3.4 * map2d.zoom);
      for (const lv of D.LEVEES || []) {
        g.beginPath();
        lv.pts.forEach((pt, i) => { const p = m2s(pt[0], pt[1], c); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
        g.stroke();
      }
    }
    if (G.layers.rail) {
      g.strokeStyle = 'rgba(226,196,120,.75)';
      g.lineWidth = 1.6;
      g.setLineDash([7, 5]);
      for (const r of D.RAILS) {
        g.beginPath();
        r.pts.forEach((pt, i) => { const p = m2s(pt[0], pt[1], c); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
        g.stroke();
      }
      g.setLineDash([]);
    }
    // 兵站
    if (G.layers.supply) {
      for (const d of D.DEPOTS.pla) {
        const p = m2s(d.x, d.z, c);
        g.fillStyle = 'rgba(60,220,170,.9)';
        g.beginPath(); g.arc(p[0], p[1], 4, 0, 7); g.fill();
        g.strokeStyle = 'rgba(60,220,170,.5)';
        g.beginPath(); g.arc(p[0], p[1], 8, 0, 7); g.stroke();
        g.fillStyle = '#8fe6cd'; g.font = '10px monospace'; g.fillText(d.name, p[0] + 10, p[1] + 3);
      }
    }
    if (!G.sim) return;
    // 补给线
    if (G.layers.supply) {
      g.strokeStyle = 'rgba(70,200,140,.28)';
      g.lineWidth = 1;
      g.setLineDash([3, 4]);
      for (const u of G.sim.pla) {
        if (u.dead || !u.supplied) continue;
        let near = null, bd = 1e9;
        for (const d of D.DEPOTS.pla) { const dd = Math.hypot(d.x - u.x, d.z - u.z); if (dd < bd) { bd = dd; near = d; } }
        if (!near || bd > 85) continue;
        const a = m2s(near.x, near.z, c), b = m2s(u.x, u.z, c);
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      }
      g.setLineDash([]);
    }
    // 命令队列
    if (G.layers.orders) {
      for (const u of G.sim.pla) {
        if (u.dead || !u.dest) continue;
        const a = m2s(u.x, u.z, c), b = m2s(u.dest.x, u.dest.z, c);
        g.strokeStyle = 'rgba(255,150,80,.6)';
        g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        g.beginPath(); g.arc(b[0], b[1], 3, 0, 7); g.stroke();
      }
    }
    // 我军
    if (G.layers.pla) {
      for (const u of G.sim.pla) {
        if (u.dead) continue;
        const p = m2s(u.x, u.z, c);
        const r = 3.2 + Math.sqrt(u.strength / 10000) * 3.4;
        g.fillStyle = G.sel && G.sel.includes(u.id) ? '#ff9a54' : '#65d9d0';
        g.beginPath(); g.arc(p[0], p[1], r, 0, 7); g.fill();
        g.strokeStyle = u.engaged ? '#ff6a4c' : 'rgba(120,220,215,.4)';
        g.lineWidth = u.engaged ? 2 : 1;
        g.beginPath(); g.arc(p[0], p[1], r + 4, 0, 7); g.stroke();
        if (u.surrounded) { g.strokeStyle = '#ff5f52'; g.beginPath(); g.arc(p[0], p[1], r + 7, 0, 7); g.stroke(); }
        if (map2d.zoom > 1.15) {
          g.fillStyle = '#d8f4f2'; g.font = '9px monospace';
          g.fillText(u.short, p[0] + r + 3, p[1] - 1);
          g.fillStyle = '#7fa9ae';
          g.fillText(`${(u.strength / 10000).toFixed(1)}万`, p[0] + r + 3, p[1] + 9);
        }
      }
    }
    // 敌军（情报）
    if (G.layers.kmt) {
      for (const k of G.sim.kmt) {
        if (!k.alive) continue;
        const it = S.intelOf(G.sim, k.id);
        if (!it) continue;
        const p = m2s(it.x, it.z, c);
        const r = 4 + Math.sqrt(it.strength / 10000) * 3.2;
        const grp3 = G.sim.phase === 3 && D.ENCIRCLE && D.ENCIRCLE.group.includes(k.id);
        if (k.surrounded && !grp3) {
          const es = (D.ENCIRCLE && D.ENCIRCLE.byId && D.ENCIRCLE.byId[k.id]) || (D.ENCIRCLE && D.ENCIRCLE.default) || { rx: 7, rz: 6 };
          const rx = Math.max(6, es.rx * p[2]), rz = Math.max(4, es.rz * p[2]);
          g.strokeStyle = 'rgba(255,90,70,.8)'; g.lineWidth = 2;
          g.beginPath(); g.ellipse(p[0], p[1], rx, rz, 0, 0, 7); g.stroke();
          g.setLineDash([4, 4]);
          g.strokeStyle = 'rgba(255,140,110,.5)';
          g.beginPath(); g.ellipse(p[0], p[1], rx * 1.15, rz * 1.15, 0, 0, 7); g.stroke();
          g.setLineDash([]);
        }
        if (it.age > 24) {
          g.strokeStyle = 'rgba(200,180,150,.6)';
          g.setLineDash([2, 3]);
          g.beginPath(); g.arc(p[0], p[1], r, 0, 7); g.stroke();
          g.setLineDash([]);
          g.fillStyle = 'rgba(220,200,160,.8)'; g.font = '11px monospace';
          g.fillText('? 情报空白', p[0] + r + 3, p[1] + 2);
        } else {
          g.fillStyle = it.age < 4 ? 'rgba(255,90,74,.92)' : 'rgba(196,90,70,.8)';
          g.beginPath(); g.arc(p[0], p[1], r, 0, 7); g.fill();
          g.strokeStyle = 'rgba(255,150,120,.55)'; g.lineWidth = 1;
          g.beginPath(); g.arc(p[0], p[1], r + 3, 0, 7); g.stroke();
          g.fillStyle = '#ffc0ac'; g.font = '9px monospace';
          g.fillText(k.short, p[0] + r + 4, p[1] - 1);
          g.fillStyle = '#c99a8c';
          g.fillText(`${(it.strength / 10000).toFixed(1)}万 · ${Math.round(it.age)}h前 · ${it.conf}%`, p[0] + r + 4, p[1] + 9);
        }
      }
      // 第三阶段陈官庄合围圈（集团质心，东西 10 km/南北 5 km）
      if (G.sim.phase === 3 && D.ENCIRCLE) {
        const grp = D.ENCIRCLE.group.map((id) => G.sim.kmt.find((x) => x.id === id)).filter((k) => k && k.alive);
        const sur = grp.filter((k) => k.surrounded);
        if (grp.length && sur.length) {
          const cx = grp.reduce((a, k) => a + k.x, 0) / grp.length;
          const cz = grp.reduce((a, k) => a + k.z, 0) / grp.length;
          const pp = m2s(cx, cz, c), cg = D.ENCIRCLE.chenguangzhuang;
          g.strokeStyle = 'rgba(255,90,70,.9)'; g.lineWidth = 2;
          g.beginPath(); g.ellipse(pp[0], pp[1], Math.max(8, cg.rx * pp[2]), Math.max(5, cg.rz * pp[2]), 0, 0, 7); g.stroke();
          g.setLineDash([3, 4]);
          g.strokeStyle = 'rgba(255,160,120,.45)';
          g.beginPath(); g.ellipse(pp[0], pp[1], Math.max(10, cg.rx * pp[2] * 1.2), Math.max(7, cg.rz * pp[2] * 1.2), 0, 0, 7); g.stroke();
          g.setLineDash([]);
        }
      }
    }
    // 地名
    if (G.layers.labels) {
      g.fillStyle = '#e6f2f4';
      g.font = '600 11px sans-serif';
      for (const city of D.CITIES) {
        if (city.minor && map2d.zoom < 1.25) continue;
        const p = m2s(city.x, city.z, c);
        g.fillText(city.name, p[0] + 5, p[1] + 14);
        g.fillStyle = 'rgba(120,170,180,.6)';
        g.beginPath(); g.arc(p[0], p[1], 2.2, 0, 7); g.fill();
        g.fillStyle = '#e6f2f4';
      }
    }
    // 比例尺
    g.fillStyle = 'rgba(180,210,215,.55)';
    g.font = '10px monospace';
    const sc2 = m2s(0, 0, c)[2];
    g.fillText(`等距压缩 1 单位 = 0.8 km（史实校准）· 1 格 ≈ ${Math.round(40 / sc2 * 0.8)} km`, 14, Hd - 14);
    // 头部信息
    if (G.sim) {
      const st = S.stats(G.sim);
      $('map2dSub').innerHTML = `${S.dateLabel(G.sim.t)} · 天气 ${G.sim.weather} · 我军 ${(st.pla / 10000).toFixed(1)}万 / 敌军（已知）${(st.kmt / 10000).toFixed(1)}万 · 情报滞后是常态`;
      $('map2dZoom').textContent = `缩放 ${map2d.zoom.toFixed(2)}× · 滚轮缩放 · 拖拽平移`;
    }
  }

  function mapHover(ev) {
    const c = $('map2d');
    const tt = $('mapTooltip');
    if (!c || !tt || !G.sim) return;
    const r = c.getBoundingClientRect();
    const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
    let hit = null;
    for (const u of G.sim.pla) {
      if (u.dead) continue;
      const p = m2s(u.x, u.z, c);
      if (Math.hypot(p[0] - sx, p[1] - sy) < 10) { hit = { kind: 'pla', u }; break; }
    }
    if (!hit) for (const k of G.sim.kmt) {
      if (!k.alive) continue;
      const it = S.intelOf(G.sim, k.id);
      if (!it) continue;
      const p = m2s(it.x, it.z, c);
      if (Math.hypot(p[0] - sx, p[1] - sy) < 12) { hit = { kind: 'kmt', k, it }; break; }
    }
    if (!hit) { tt.classList.add('hidden'); return; }
    tt.classList.remove('hidden');
    tt.style.left = (ev.clientX - r.left + 14) + 'px';
    tt.style.top = (ev.clientY - r.top + 12) + 'px';
    if (hit.kind === 'pla') {
      const u = hit.u;
      tt.innerHTML = `<b>${u.name}</b><br>${u.group} · ${u.role} · ${u.cmdr}<br>兵力 ${(u.strength / 10000).toFixed(2)}万 · 士气 ${Math.round(u.morale)}<br>弹药 ${(u.ammo / 12).toFixed(1)}日 · 粮食 ${(u.food / 12).toFixed(1)}日<br>疲劳 ${Math.round(u.fatigue)} · 工事 ${u.entrench.toFixed(1)}<br>${u.engaged ? '<span style="color:#ff8a3d">交战中</span>' : '待机'}`;
    } else {
      tt.innerHTML = `<b>${hit.k.name}</b>（${hit.k.cmdr}）<br>情报来源：${hit.it.source}<br>时间：${S.dateLabel(hit.it.time)}（${Math.round(hit.it.age)} 小时前）<br>可信度 ${hit.it.conf}% · 估计 ${(hit.it.strength / 10000).toFixed(1)}万 ±1<br>${hit.k.surrounded ? '<span style="color:#ff5f52">已被合围</span>' : '未合围'}`;
    }
  }

  function mapClick(ev) {
    const c = $('map2d');
    const r = c.getBoundingClientRect();
    const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
    const rad = ev.pointerType === 'touch' ? 26 : 11;
    for (const u of G.sim.pla) {
      if (u.dead) continue;
      const p = m2s(u.x, u.z, c);
      if (Math.hypot(p[0] - sx, p[1] - sy) < rad) { G.sel = [u.id]; UI.unitModal(G.sim, u.id); UI.update(G.sim, G.sel); return; }
    }
    for (const k of G.sim.kmt) {
      if (!k.alive) continue;
      const it = S.intelOf(G.sim, k.id);
      if (!it) continue;
      const p = m2s(it.x, it.z, c);
      if (Math.hypot(p[0] - sx, p[1] - sy) < 13) { UI.unitModal(G.sim, null, k.id); return; }
    }
  }

  /* ================================ 总攻 / 前线 ================================ */
  function startAssault() {
    if (!G.sim || G.sim.ended) return;
    if (HX.Cine.state.active) return;
    if (!G.sel.length) { UI.toast('先选择一线部队，再点总攻', 'warn'); return; }
    const cands = G.sim.kmt.filter((k) => k.alive && k.surrounded &&
      G.sel.some((id) => { const u = G.sim.pla.find((x) => x.id === id); return u && Math.hypot(u.x - k.x, u.z - k.z) < 18; }));
    if (!cands.length) { UI.toast('总攻前必须完成合围（包围圈需封锁 5/8 扇区）', 'warn'); return; }
    const k = cands[0];
    const cfg = S.assaultConfig(G.sim, k.id);
    cfg.chapter = G.chapter;
    cfg.chapterCfg = G.chapterCfg;
    const moatWarn = k.id === 'k7' && !G.sim.flags.nzMoatBroken;
    const sup = cfg.support || S.artilleryPlan(G.sim, k.id);
    cfg.sub = `${k.cmdr} · ${(k.strength / 10000).toFixed(1)} 万 · 已被合围${moatWarn ? ' · 外壕未破（伤亡×2.4）' : ''}${k.id === 'k12' && G.sim.flags.liaoGap ? ' · 第110师缺口' : ''}`
      + ` · 炮火：${sup.label}（${sup.shells} 发 / ${sup.duration}s / 覆盖 ${sup.radius}）`;
    if (moatWarn) UI.toast('碾庄外壕未破：跨壕强攻耗时×2.8、伤亡×2.4', 'warn');
    if (sup.level === 'full') UI.toast(`炮火准备充分：特纵平均弹药 ${sup.ammo}%，${sup.shells} 发覆盖 ${sup.radius} 单位`, 'good');
    else UI.toast(`炮火准备不足（${sup.label}）：弹药 ${sup.ammo}%，强行冲锋伤亡×${D.ARTILLERY.prepCasMul[sup.level] || 1}`, 'warn');
    G.mode = 'fps';
    G.sim.running = false;
    HX.Audio && HX.Audio.resume();
    HX.FPS.start(cfg, (res) => {
      G.mode = 'campaign';
      UI.setScreen('campaign');
      if (res.aborted) { UI.toast('已返回指挥部', ''); G.sim.running = G.sim.speed > 0; return; }
      S.applyBattle(G.sim, k.id, res);
      UI.toast(res.win ? '前线突击成功，敌军阵地被突破' : '前线突击受阻，我军付出代价', res.win ? 'good' : 'red');
      G.sim.running = G.sim.speed > 0;
      UI.update(G.sim, G.sel);
    });
  }

  /* ================================ 画质 ================================ */
  function setQuality(q) {
    G.quality = q;
    G.renderer.setQuality(QUALITY[q]);
  }
  G.setQuality = (q) => { if (QUALITY[q]) setQuality(q); G.autoQ = false; };
  G.getStats = () => {
    const st = (G.renderer && G.renderer.stats) || {};
    const sim = G.sim;
    const mem = (typeof performance !== 'undefined' && performance.memory) ? performance.memory.usedJSHeapSize : 0;
    return {
      t: sim ? Math.round(sim.t * 10) / 10 : 0,
      date: sim ? S.dateLabel(sim.t) : '',
      phase: sim ? sim.phase : 0,
      quality: G.quality,
      effDpr: (G.renderer && G.renderer.effDpr) ? Math.round(G.renderer.effDpr * 100) / 100 : 0,
      canvas: G.renderer ? [G.renderer.canvas.width, G.renderer.canvas.height] : [0, 0],
      cam: { dist: Math.round(cam.dist * 10) / 10, yaw: Math.round(cam.yaw * 1000) / 1000, pitch: Math.round(cam.pitch * 1000) / 1000 },
      map2d: { open: !!G.map2dOpen, zoom: Math.round(map2d.zoom * 100) / 100, ox: Math.round(map2d.ox), oy: Math.round(map2d.oy) },
      fps: Math.round(fpsVal * 10) / 10,
      draws: st.draws || 0,
      instances: st.instances || 0,
      tris: st.tris || 0,
      heap: mem,
      enemies: sim ? sim.kmt.filter((k) => k.alive).length : 0,
      logs: sim ? sim.logs.length : 0,
      units: sim ? sim.pla.filter((u) => !u.dead).length : 0,
      soldierLod: G.soldierStats.lod,
      soldiers: G.soldierStats.soldiers,
      soldierUnits: G.soldierStats.units,
      soldierInstances: G.soldierStats.instances,
      plaScreens: sim ? sim.pla.filter((u) => !u.dead).map((u) => { const p = project(u.x, W.heightAt(u.x, u.z) + 3, u.z); return p ? { id: u.id, short: u.short, x: Math.round(p.x), y: Math.round(p.y) } : null; }).filter(Boolean) : [],
      touch: { pts: touchPts.size, pinch: touch.pinch, lastUp: Math.round(touch.lastUp), lastUpInfo: touch.lastUpInfo || null, lastCmd: touch.lastCmd || null }
    };
  };

  /* 调试/取证钩子：只读，不改变交互行为（供 tools/coord_probe.js 用） */
  G.debugHooks = {
    project: (x, y, z) => project(x, y, z),
    screenRay: (sx, sy) => screenRay(sx, sy),
    groundPoint: (sx, sy) => groundPoint(sx, sy),
    hitTest: (sx, sy) => hitTest(sx, sy),
    select: (ids) => { G.sel = ids.slice(); UI.update(G.sim, G.sel); return G.sel.map((u) => u.short); },
    camInfo: () => ({ yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, pos: cam.pos.slice(), target: cam.target.slice() }),
    unit: (short) => {
      const u = G.sim.pla.find((p) => p.short === short);
      if (!u) return null;
      return { short: u.short, id: u.id, x: u.x, z: u.z, dest: u.dest ? { x: u.dest.x, z: u.dest.z } : null,
        order: u.order ? JSON.parse(JSON.stringify(u.order)) : null, halted: !!u.halted,
        path: u.path ? u.path.map((p) => p.slice()) : null, pathIndex: u.pathIndex,
        reroute: u.reroute || null, arrived: !!(u.order && u.order.arrived) };
    }
  };

  let lowFrames = 0;
  function autoscale() {
    if (!G.autoQ && G.autoQ !== undefined) return;
    if (G.autoQ === undefined) G.autoQ = true;
    if (!G.autoQ) return;
    if (fpsVal < 45) {
      lowFrames++;
      if (lowFrames >= 3) {
        const i = QUALITY_ORDER.indexOf(G.quality);
        if (i >= 0 && i < 2) {
          setQuality(QUALITY_ORDER[i + 1]);
          UI.toast('帧率偏低，已自动降低画质至 ' + ({ high: '高', mid: '中', low: '低' })[QUALITY_ORDER[i + 1]], 'warn');
        }
        lowFrames = 0;
      }
    } else lowFrames = 0;
  }

  function showPerf() {
    if (!perfEl) {
      perfEl = document.createElement('div');
      perfEl.id = 'perf';
      perfEl.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:25;font:10px var(--mono,monospace);color:#6e9aa3;background:rgba(3,12,16,.7);border:1px solid rgba(70,110,120,.3);padding:3px 7px;pointer-events:none;letter-spacing:.08em';
      document.body.appendChild(perfEl);
    }
    const st = G.renderer ? G.renderer.stats : null;
    perfEl.textContent = `${fpsVal} FPS · ${G.quality.toUpperCase()} · D ${st ? st.draws : '-'} · I ${st ? st.instances : '-'} · T ${st ? (st.tris / 1000).toFixed(0) : '-'}k`;
  }

  /* 启动 */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', G.init);
  else G.init();
})();
