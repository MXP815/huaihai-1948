/* ==========================================================================
   界面层：战役 HUD / 部队卡片 / 战报 / 分析 / 简报 / 复盘 / FPS HUD
   ========================================================================== */
(function () {
  const HX = (window.HX = window.HX || {});
  const D = HX.DATA, U = HX.U, S = HX.Sim;
  const UI = (HX.UI = {});
  const $ = (id) => document.getElementById(id);
  const el = (UI.el = {});
  const on = (UI.on = {});
  let pending = null;

  const fmtW = (n) => (n >= 10000 ? (n / 10000).toFixed(1) + ' 万' : Math.round(n).toLocaleString());
  const pct = (v) => Math.max(0, Math.min(100, v)) + '%';

  UI.init = function () {
    ['title', 'campaign', 'map2d-screen', 'fps-screen', 'cine-screen', 'modalWrap', 'toastWrap',
      'tbDate', 'statPla', 'statKmt', 'statCas', 'phaseTag', 'weatherTag', 'divTag', 'oob', 'oobCount',
      'oobFoot', 'unitCard', 'logList', 'logCount', 'ticker', 'tlFill', 'tlMarks', 'tlClock', 'tlPhase',
      'labels', 'mapTip', 'speedBox', 'map2d', 'map2dSub', 'map2dLegend', 'map2dZoom', 'mapTooltip',
      'fpsTitle', 'fpsSub', 'fpsEnemies', 'fpsEnemiesTotal', 'fpsAllies', 'fpsTime',
      'crosshair', 'hitmarker', 'dmgDir', 'suppress', 'killfeed', 'fpsHP', 'fpsHPBar', 'fpsState',
      'fpsAmmo', 'fpsReserve', 'fpsGun', 'fpsMode', 'cmdWheel', 'fpsHint', 'deathScreen',
      'cineTitle', 'cineKicker', 'cineH1', 'cineSub', 'cineCaption', 'cineWho', 'cineText', 'cineNote',
      'cineSubInfo', 'cineIdx', 'cineProg', 'cineSkip', 'cineFade',
      'cmdPanel', 'authSlider', 'authName', 'authDesc', 'autoToggle', 'btnRouteDraw',
      'btnRouteCopy', 'btnRoutePaste', 'btnRequests', 'reqCount', 'reqBadge', 'routeTip',
      'paceBox', 'pauseBanner', 'pauseBannerText', 'phaseReady', 'phaseReadyText',
      'btnPhaseConfirm', 'btnPlan', 'btnSave', 'pauseHint'].forEach((k) => { el[k.replace(/-/g, '_')] = $(k); });
    el.modal = $('modalWrap');
    el.btns = {
      start: $('btnStart'), cinema: $('btnCinema'), help: $('btnHelp'),
      map: $('btnMap'), analysis: $('btnAnalysis'), brief: $('btnBrief'), quality: $('btnQuality'),
      assault: $('btnAssault'), gap: $('btnGap'), transfer: $('btnTransfer'),
      mapClose: $('btnMapClose'), fpsExit: $('btnFpsExit'), deathBack: $('btnDeathBack'),
      resume: $('btnResume')
    };
    // 顶栏
    if (el.btns.start) el.btns.start.onclick = () => on.start && on.start();
    if (el.btns.cinema) el.btns.cinema.onclick = () => on.cinema && on.cinema();
    if (el.btns.help) el.btns.help.onclick = () => showHelp();
    if (el.btns.map) el.btns.map.onclick = () => on.map && on.map();
    if (el.btns.mapClose) el.btns.mapClose.onclick = () => on.mapClose && on.mapClose();
    if (el.btns.analysis) el.btns.analysis.onclick = () => on.analysis && on.analysis();
    if (el.btns.brief) el.btns.brief.onclick = () => on.brief && on.brief();
    if (el.btns.quality) el.btns.quality.onclick = () => on.quality && on.quality();
    if (el.btns.assault) el.btns.assault.onclick = () => on.assault && on.assault();
    if (el.btns.gap) el.btns.gap.onclick = () => on.gap && on.gap();
    if (el.btns.transfer) el.btns.transfer.onclick = () => on.transfer && on.transfer();
    if (el.btns.fpsExit) el.btns.fpsExit.onclick = () => on.fpsExit && on.fpsExit();
    if (el.btns.deathBack) el.btns.deathBack.onclick = () => on.fpsExit && on.fpsExit();
    if (el.btns.resume) el.btns.resume.onclick = () => on.resume && on.resume();
    try {
      if (el.btns.resume) el.btns.resume.classList.toggle('hidden', !localStorage.getItem('hx1948_save'));
    } catch (e) { /* file:// 下 localStorage 可能受限 */ }

    // 速度
    if (el.speedBox) el.speedBox.querySelectorAll('.btn').forEach((b) => {
      b.onclick = () => { on.speed && on.speed(parseInt(b.dataset.sp, 10)); };
    });
    // 节奏档
    if (el.paceBox) el.paceBox.querySelectorAll('.btn').forEach((b) => {
      b.onclick = () => { on.pace && on.pace(parseInt(b.dataset.pace, 10)); };
    });
    if (el.btnPlan) el.btnPlan.onclick = () => on.plan && on.plan();
    if (el.btnSave) el.btnSave.onclick = () => on.save && on.save();
    if (el.btnPhaseConfirm) el.btnPhaseConfirm.onclick = () => on.confirmPhase && on.confirmPhase();

    // 指挥：授权滑杆 / 自主权 / 路线 / 请示
    if (el.authSlider) el.authSlider.oninput = () => {
      const v = parseInt(el.authSlider.value, 10);
      if (el.authName) el.authName.textContent = ['严控', '常规', '放权'][v];
      if (el.authDesc) el.authDesc.textContent = ['事事请示，反应慢但严格按意图。', '大事请示、小事自决。', '临机处置多，效率高但可能与意图有偏差。'][v];
      on.auth && on.auth(v);
    };
    if (el.autoToggle) el.autoToggle.onchange = () => { on.autonomy && on.autonomy(el.autoToggle.checked); };
    if (el.btnRouteDraw) el.btnRouteDraw.onclick = () => on.routeDraw && on.routeDraw();
    if (el.btnRouteCopy) el.btnRouteCopy.onclick = () => on.routeCopy && on.routeCopy();
    if (el.btnRoutePaste) el.btnRoutePaste.onclick = () => on.routePaste && on.routePaste();
    if (el.btnRequests) el.btnRequests.onclick = () => on.requests && on.requests();

    // 部队列表 & 卡片（事件委托）
    if (el.oob) el.oob.onclick = (ev) => {
      const row = ev.target.closest('.unit-row');
      if (!row) return;
      on.select && on.select(row.dataset.id, ev.shiftKey);
    };
    if (el.unitCard) el.unitCard.onclick = (ev) => {
      const b = ev.target.closest('[data-order]');
      if (b) { on.order && on.order(b.dataset.order); return; }
      const t = ev.target.closest('[data-target]');
      if (t) { on.target && on.target(t.dataset.target); return; }
      const a = ev.target.closest('[data-act]');
      if (a) { on.act && on.act(a.dataset.act); }
    };
    if (el.modal) el.modal.onclick = (ev) => {
      if (ev.target === el.modal) closeModal();
      if (ev.target.closest('.modal-close')) closeModal();
      const tab = ev.target.closest('.tab');
      if (tab) {
        el.modal.querySelectorAll('.tab').forEach((t) => t.classList.remove('on'));
        el.modal.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
        tab.classList.add('on');
        const p = el.modal.querySelector('#tab-' + tab.dataset.tab);
        if (p) p.classList.remove('hidden');
      }
      const cb = ev.target.closest('[data-cb]');
      if (cb) { on.modalAction && on.modalAction(cb.dataset.cb); }
      const rq = ev.target.closest('[data-req]');
      if (rq) { on.requestAct && on.requestAct(rq.dataset.req, rq.dataset.act); }
      const pl = ev.target.closest('[data-plan]');
      if (pl) { on.planAct && on.planAct(UI._plans[parseInt(pl.dataset.plan, 10)]); return; }
    };
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'm' || ev.key === 'M') on.map && on.map();
      if (ev.key === 'a' || ev.key === 'A') on.analysis && on.analysis();
      if (ev.key === 'b' || ev.key === 'B') on.brief && on.brief();
      if (ev.key === 'Escape') closeModal();
    });
  };

  UI.setScreen = function (name) {
    const map = {
      title: el.title, campaign: el.campaign, map2d_screen: el.map2d_screen,
      fps_screen: el.fps_screen, cine_screen: el.cine_screen, cine_menu: document.getElementById('cine-menu')
    };
    for (const k in map) if (map[k]) map[k].classList.toggle('hidden', k !== name);
    if (name === 'title' && el.btns && el.btns.resume) {
      try { el.btns.resume.classList.toggle('hidden', !localStorage.getItem('hx1948_save')); } catch (e) { /* ignore */ }
    }
  };

  UI.setResumeAvailable = function (visible) {
    if (el.btns && el.btns.resume) el.btns.resume.classList.toggle('hidden', !visible);
  };

  UI.toast = function (text, kind) {
    const wrap = el.toastWrap;
    if (!wrap) return;
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = text;
    wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; }, 2600);
    setTimeout(() => t.remove(), 3100);
  };

  UI.speedUI = function (sp) {
    if (!el.speedBox) return;
    el.speedBox.querySelectorAll('.btn').forEach((b) => b.classList.toggle('on', parseInt(b.dataset.sp, 10) === sp));
  };
  UI.setPaceUI = function (sim) {
    if (el.paceBox) el.paceBox.querySelectorAll('.btn').forEach((b) => b.classList.toggle('on', parseInt(b.dataset.pace, 10) === sim.pace));
    if (!el.pauseHint) return;
    el.pauseHint.textContent = sim.pace === 0
      ? '从容档：战局暂停，命令可反复修改、可撤销。'
      : sim.pace === 1
        ? '标准档：时间会流逝，但无硬截止，慢一点只是让敌军多做动作。'
        : '紧迫档：超过历史窗口会有软后果（敌军增援、补给恶化），不判负。';
  };

  UI.pending = function (v) { pending = v; };
  UI.getPending = function () { return pending; };

  /* ---------------- 战役 HUD ---------------- */
  UI.update = function (sim, selected) {
    if (!el.tbDate) return;
    el.tbDate.innerHTML = `${S.dateLabel(sim.t)} <small>第 ${Math.floor(sim.t / 24) + 1} 天</small>`;
    const st = S.stats(sim);
    el.statPla.textContent = fmtW(st.pla);
    el.statKmt.textContent = fmtW(st.kmt);
    el.statCas.textContent = fmtW(st.plaCas);
    const ch = D.chapterOf ? D.chapterOf(sim.phase) : null;
    el.phaseTag.textContent = ch ? `${ch.stage}·${ch.name}` : (['', '第一阶段', '第二阶段', '第三阶段'][sim.phase] + '·' + S.currentObjective(sim).title.replace('围歼', ''));
    el.weatherTag.textContent = sim.weather;
    el.divTag.textContent = '分歧 ' + sim.divergences.length;
    el.divTag.className = 'tag ' + (sim.divergences.length ? 'acc' : 'gold');
    const pc = S.pacing(sim);
    if (sim.pace === 2 && pc.limit) {
      el.tlFill.style.width = pct(Math.min(100, sim.t / pc.limit * 100));
      el.tlClock.textContent = `第 ${Math.floor(sim.t / 24)} / ${Math.floor(pc.limit / 24)} 天 · 紧迫档`;
    } else {
      el.tlFill.style.width = pct(sim.t / 1584 * 100);
      el.tlClock.textContent = `${Math.floor(sim.t / 24)} 天 · ${pc.name}档 · 无时限`;
    }
    el.tlPhase.textContent = S.currentObjective(sim).title;
    const paused = !sim.ended && sim.speed === 0;
    if (el.pauseBanner) {
      el.pauseBanner.classList.toggle('hidden', !paused);
      if (paused && el.pauseBannerText) el.pauseBannerText.textContent = sim.pace === 0
        ? '从容档 · 无时限 · 您可以从容部署，命令可反复修改'
        : '您可以从容部署 · 命令可反复修改';
    }
    if (el.phaseReady) {
      el.phaseReady.classList.toggle('hidden', !sim.phaseReady);
      if (sim.phaseReady && el.phaseReadyText) el.phaseReadyText.textContent = `第 ${sim.phaseReady} 阶段目标已达成 · 战局已暂停`;
    }
    UI.setPaceUI(sim);
    UI.renderOOB(sim, selected);
    UI.renderLog(sim);
    UI.renderUnitCard(sim, selected);
    UI.renderTicker(sim);
    el.oobFoot.textContent = `在编 ${st.aliveUnits} 支部队 · 补给正常 ${st.supplyUnits} · 被围敌军 ${st.surroundedKMT}`;
    UI.syncCommand(sim);
  };

  UI.syncCommand = function (sim) {
    if (!el.authSlider) return;
    if (document.activeElement !== el.authSlider) el.authSlider.value = sim.auth;
    el.authName.textContent = ['严控', '常规', '放权'][sim.auth];
    el.authDesc.textContent = ['事事请示，反应慢但严格按意图。', '大事请示、小事自决。', '临机处置多，效率高但可能与意图有偏差。'][sim.auth];
    if (el.autoToggle) el.autoToggle.checked = sim.autonomy !== false;
    const open = sim.requests.filter((r) => r.status === 'open').length;
    el.reqCount.textContent = `待批 ${open}`;
    if (el.reqBadge) el.reqBadge.textContent = open;
    if (el.btnRequests) el.btnRequests.classList.toggle('primary', open > 0);
  };

  function cmdrBars(cmd) {
    if (!cmd) return '';
    const keys = ['init', 'aggr', 'caut', 'siege', 'block', 'infil', 'coord', 'cas', 'report', 'temper'];
    return `<div class="perso">${keys.map((k) => `<div class="perso-row"><span>${D.CMDR_KEYS[k]}</span><div class="pbar"><i style="width:${(cmd[k] / 5) * 100}%"></i></div></div>`).join('')}</div>`;
  }
  function moodDots(v) {
    let s = '';
    for (let i = 0; i < 5; i++) {
      const th = i * 20;
      const cls = v > th + 16 ? 'on' : v > th ? 'warn' : 'bad';
      s += `<i class="${cls}"></i>`;
    }
    return `<div class="mood">${s}</div>`;
  }

  UI.renderOOB = function (sim, selected) {
    const groups = ['华野', '南线阻援', '中野', '地方'];
    let html = '';
    for (const g of groups) {
      const list = sim.pla.filter((u) => u.group === g);
      if (!list.length) continue;
      const alive = list.filter((u) => !u.dead);
      html += `<div class="oob-group"><span>${g}</span><b>${fmtW(alive.reduce((a, u) => a + u.strength, 0))}</b></div>`;
      for (const u of list) {
        const sel = selected && selected.includes(u.id) ? ' sel' : '';
        const dead = u.dead ? ' dead' : '';
        html += `<div class="unit-row${sel}${dead}" data-id="${u.id}">
          <div class="u-id">${u.short}</div>
          <div><div class="u-name">${u.name}</div><div class="u-sub">${u.role} · ${u.supplied ? '补给正常' : '补给受阻'}${u.engaged ? ' · 交战中' : ''}</div>${moodDots(u.morale)}</div>
          <div class="u-str">${fmtW(u.strength)}<small>弹药 ${(u.ammo / 12).toFixed(1)}日</small></div>
        </div>`;
      }
    }
    el.oob.innerHTML = html;
  };

  UI.renderLog = function (sim) {
    if (!sim.logs.length) { el.logList.innerHTML = '<div class="log-empty">暂无战报</div>'; return; }
    let html = '';
    for (const l of sim.logs.slice(0, 28)) {
      const fresh = sim.t < l.freshUntil ? ' fresh' : '';
      html += `<div class="log-item ${l.kind}${fresh}">
        <div class="lt"><b>${S.dateLabel(l.t)}</b><span class="src">${l.src || ''}</span></div>
        <div>${l.text}</div>
      </div>`;
    }
    el.logList.innerHTML = html;
    el.logCount.textContent = sim.logs.length;
  };

  UI.renderTicker = function (sim) {
    const lines = sim.logs.slice(0, 3).map((l, i) => `<div class="tk-line"><b>${S.dateLabel(l.t).slice(-5)}</b>${l.text}</div>`).join('');
    el.ticker.innerHTML = lines;
  };

  const ORDER_LABEL = { move: '行军', encircle: '包围', attack: '进攻', block: '阻援', rest: '休整', scout: '侦察' };

  UI.renderUnitCard = function (sim, selected) {
    if (!selected || !selected.length) {
      el.unitCard.innerHTML = `<div class="panel-title"><b>部队卡片</b><span>未选中</span></div>
        <div class="uc-body"><p class="dim-note">在左侧战斗序列或三维地图上点击一支部队。右键地图下达命令。未侦察到的敌军不会显示；旧情报会标出时间戳与可信度。</p></div>`;
      return;
    }
    const u = sim.pla.find((x) => x.id === selected[0]);
    if (!u) return;
    const st = u.dead ? '已撤出' : u.engaged ? '交战中' : u.surrounded ? '被围' : '待机';
    const statusTag = u.dead ? 'red' : u.engaged ? 'acc' : u.supplied ? 'green' : 'red';
    const cards = [
      ['兵力', fmtW(u.strength) + ' / ' + fmtW(u.s0)],
      ['士气', Math.round(u.morale) + ' / 100'],
      ['弹药', (u.ammo / 12).toFixed(1) + ' 日'],
      ['粮食', (u.food / 12).toFixed(1) + ' 日'],
      ['疲劳', Math.round(u.fatigue) + ' / 100'],
      ['工事', u.entrench.toFixed(1) + ' 级']
    ];
    let html = `<div class="panel-title"><b>部队卡片</b><span class="tag ${statusTag}">${st}</span></div>
      <div class="uc-head">
        <div class="uc-name">${u.name}</div>
        <div class="uc-meta">${u.group} · ${u.role} · 指挥 ${u.cmdr}</div>
      </div>
      <div class="uc-body">
        <div class="stat-grid">${cards.map((c) => `<div class="stat">${c[0]}<b>${c[1]}</b></div>`).join('')}</div>
        <div class="bar-label"><span>士气</span><span>${Math.round(u.morale)}</span></div><div class="bar acc"><i style="width:${pct(u.morale)}"></i></div>
        <div class="bar-label"><span>弹药 / 粮食</span><span>${u.supplied ? '补给正常' : '补给受阻'}</span></div><div class="bar green"><i style="width:${pct(u.ammo)}"></i></div>
        ${u.lastHit && sim.t - u.lastHit.t < 6 ? `<div class="kv"><span>刚发生伤亡</span><b class="bad">-${u.lastHit.n} 人（战场十字标记同步）</b></div>` : ''}
        <div class="kv"><span>当前任务</span><b>${u.order ? (u.order.path ? '手绘路线行军' : ORDER_LABEL[u.order.type]) : '待机'}${u.halted ? '（已停止待命）' : ''}</b></div>
        <div class="kv"><span>位置</span><b>${S.placeName(u.x, u.z)}</b></div>
        <div class="kv"><span>补给</span><b class="${u.supplied ? 'ok' : 'bad'}">${u.supplied ? '正常' : '中断 · ' + (u.supplyReason || '')}</b></div>
        ${u.path ? (() => {
          const info = S.pathInfo(u.routeOriginal || u.path, { x: u.path[Math.max(0, u.pathIndex - 1)] ? u.path[Math.max(0, u.pathIndex - 1)][0] : u.x, z: u.path[Math.max(0, u.pathIndex - 1)] ? u.path[Math.max(0, u.pathIndex - 1)][1] : u.z, fatigue: u.fatigue });
          return `<div class="kv"><span>手绘路线</span><b>${u.routeOriginal ? u.routeOriginal.length : u.path.length} 折点 · 余约 ${Math.round(info.km)} km / ${info.hours.toFixed(1)} h</b></div>`;
        })() : ''}
        ${u.reroute ? `<div class="kv"><span>最近改道</span><b class="warn">${S.dateLabel(u.reroute.t)} · ${u.reroute.reason}（${u.reroute.decider}）</b></div>` : ''}
        <div class="divider"></div>
        <div class="cmdr-head"><b>${u.cmdr}</b><span>${u.cmd && u.cmd.profile ? u.cmd.profile.org + ' · ' + u.cmd.profile.role : '指挥员'}</span></div>
        ${cmdrBars(u.cmd)}
        <div class="cmdr-note">${u.cmd && u.cmd.profile ? u.cmd.profile.note : ''}</div>
        <div class="kv"><span>当前决心</span><b>${u.cmd ? u.cmd.opinion : '待命'}</b></div>
        ${u.cmd && u.cmd.request ? `<div class="kv"><span>请示</span><b class="warn">${u.cmd.request.text}</b></div>` : ''}
        ${u.cmd && u.cmd.request ? `<button class="btn" style="width:100%;margin-top:4px" data-act="requests">查看请示 · 采纳或驳回</button>` : ''}
        <div class="divider"></div>
        <div class="orders">
          <button class="btn" data-order="move">行军 <i>右键</i></button>
          <button class="btn" data-order="encircle">包围</button>
          <button class="btn" data-order="attack">进攻</button>
          <button class="btn" data-order="block">阻援</button>
          <button class="btn" data-order="rest">休整</button>
          <button class="btn" data-order="scout">侦察</button>
        </div>
        <div class="order-hint">先点命令，再在三维地图上点目标位置（包围/进攻则在下方选择敌军）。<b>休整</b>可积累工事、恢复士气与疲劳。</div>`;

    const targets = sim.kmt.filter((k) => k.alive && sim.intel[k.id] && (sim.t - sim.intel[k.id].time) < 24);
    html += `<div class="divider"></div><div class="dim-note">可选目标（限已接触/侦察到的敌军）</div>`;
    for (const k of targets) {
      const it = S.intelOf(sim, k.id);
      html += `<button class="btn" style="width:100%;margin-top:4px;text-align:left" data-target="${k.id}">
        ${k.short} · ${fmtW(it.strength)} · ${it.status}（${Math.round(it.age)}h 前 · 可信 ${it.conf}%）
      </button>`;
    }
    html += `<div class="frontline"><button class="btn primary" data-act="assault">总攻 · 亲临前线（F）</button></div>`;
    html += `<div class="composition">${u.role === '炮兵' ? '特种兵纵队：野炮、山炮与工兵，靠近突击部队可提高压制效果。' : '纵队下辖若干师/旅；本作按公开史料概数合并为纵队级单位。'}</div>`;
    el.unitCard.innerHTML = html;
  };

  /* ---------------- 请示 / 指挥员卡 ---------------- */
  UI.requests = function (sim) {
    const open = sim.requests.filter((r) => r.status === 'open');
    const done = sim.requests.filter((r) => r.status !== 'open').slice(-5).reverse();
    const dev = (sim.unapprovedLog || []).slice(-5).reverse();
    const authName = ['严控', '常规', '放权'][sim.auth];
    const TAG = { reinforce: '请求增援', supply: '请求补给', order: '请示任务', alt: '替代方案', reroute: '申请改道' };
    const list = open.length ? open.map((r) => `<div class="req-card">
        <div class="req-head"><b>${r.short} · ${r.cmdr}</b><span>${TAG[r.type] || '请示'} · ${S.dateLabel(r.t)}</span></div>
        <p>${r.text}</p>
        <div class="req-acts"><button class="btn primary" data-req="${r.id}" data-act="adopt">采纳</button>
        <button class="btn" data-req="${r.id}" data-act="reject">驳回</button></div>
      </div>`).join('') : '<p class="dim-note">暂无待批请示。下级会按授权档位与自身请示倾向决定何时上报。</p>';
    const doneHtml = done.length ? done.map((r) => `<div class="req-line"><span>${S.dateLabel(r.t)}</span><b>${r.short}</b>${r.status === 'adopted' ? '已采纳' : '已驳回'} · ${r.text}</div>`).join('') : '<p class="dim-note">暂无已处理请示。</p>';
    const devHtml = dev.length ? dev.map((x) => `<div class="req-line dev"><span>${S.dateLabel(x.t)}</span><b>${x.unit}</b>临机专断（事后补报）· ${x.text}</div>`).join('') : '<p class="dim-note">暂无临机专断记录。</p>';
    UI.openModal(`<div class="modal">
      <div class="modal-head"><div><div class="kicker">指挥链 · 任务式指挥</div><h2>下级请示 <small>当前授权：${authName} · 待批 ${open.length}</small></h2></div><button class="modal-close btn">✕</button></div>
      <div class="modal-body">
        <div class="brief-grid">
          <div>
            <div class="brief-block"><h3>待批请示</h3>${list}</div>
            <div class="brief-block"><h3>临机专断（事后补报）</h3>${devHtml}</div>
          </div>
          <div class="brief-side">
            <div class="an-card"><h4>授权档位说明</h4>
              <div class="kv"><span>严控</span><b>6 小时一轮请示；事事上报，行动速度 -10%</b></div>
              <div class="kv"><span>常规</span><b>12 小时一轮；大事请示、小事自决</b></div>
              <div class="kv"><span>放权</span><b>24 小时一轮；勇猛/脾性高的指挥员会先斩后奏，速度 +6%</b></div>
              <p class="hist-note">各指挥员的主动性、请示倾向、伤亡敏感、阻击韧性会改变请示频率与增援阈值；参数为玩法化归纳。</p>
            </div>
            <div class="an-card"><h4>已处理</h4>${doneHtml}</div>
          </div>
        </div>
      </div>
      <div class="modal-foot"><span class="dim-note">采纳会实际增兵/补弹/同意打法；驳回会使该指挥员士气下降。偏离总意图的专断会记入复盘。</span><button class="btn modal-close">关闭</button></div>
    </div>`);
  };

  UI.commanderCard = function (sim, id) {
    const u = sim.pla.find((x) => x.id === id) || sim.pla.find((x) => !x.dead);
    if (!u || !u.cmd) return;
    const pr = u.cmd.profile || {};
    UI.openModal(`<div class="modal">
      <div class="modal-head"><div><div class="kicker">指挥员卡</div><h2>${u.cmdr} <small>${pr.org || u.group} · ${pr.role || u.role}</small></h2></div><button class="modal-close btn">✕</button></div>
      <div class="modal-body">
        <div class="an-grid">
          <div>
            <div class="an-card"><h4>指挥倾向</h4>${cmdrBars(u.cmd)}
              <p class="hist-note">${D.CMDR_BOUNDARY}</p></div>
            <div class="an-card"><h4>行为倾向</h4><p>${pr.note || '暂无特别记录，按上级意图执行。'}</p></div>
          </div>
          <div>
            <div class="an-card"><h4>当前状态</h4>
              <div class="kv"><span>所部</span><b>${u.name}（${u.short}）</b></div>
              <div class="kv"><span>决心</span><b>${u.cmd.opinion}</b></div>
              <div class="kv"><span>士气</span><b>${Math.round(u.morale)} / 100</b></div>
              <div class="kv"><span>伤亡率</span><b>${((1 - u.strength / u.s0) * 100).toFixed(1)}%</b></div>
              <div class="kv"><span>请示</span><b class="${u.cmd.request ? 'warn' : ''}">${u.cmd.request ? u.cmd.request.text : '无'}</b></div>
            </div>
            <div class="an-card"><h4>参数如何影响行为</h4>
              <p>主动性 / 穿插：遇阻时更敢绕向侧翼，进攻中更可能提出替代方案。</p>
              <p>勇猛 + 脾性：放权时更可能先斩后奏（临机专断）；协同高者会压住。</p>
              <p>伤亡敏感 / 阻击韧性：决定请求增援的阈值——阻击韧性高者更晚叫援。</p>
              <p>请示倾向：决定请示间隔，低者宁可自己扛。</p>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-foot"><button class="btn primary modal-close">关闭</button></div>
    </div>`);
  };

  /* ---------------- 弹窗 ---------------- */
  UI.openModal = function (html) {
    el.modal.classList.remove('hidden');
    el.modal.innerHTML = html;
  };
  UI.closeModal = function () { el.modal.classList.add('hidden'); el.modal.innerHTML = ''; };
  const closeModal = UI.closeModal;
  UI.pendingCmd = function (v) {
    if (v) el.mapTip.textContent = `命令待选：${ORDER_LABEL[v] || v} — 在三维地图上点击目标位置，ESC 取消`;
    else el.mapTip.textContent = '左键选部队 · 右键下命令 · 拖拽旋转 · 滚轮缩放 · WASD 平移';
  };

  function showHelp() {
    UI.openModal(`<div class="modal">
      <div class="modal-head"><div><div class="kicker">操作与规则</div><h2>怎么玩</h2></div><button class="modal-close btn">✕</button></div>
      <div class="modal-body">
        <div class="an-grid">
          <div>
            <div class="an-card"><h4>指挥层</h4>
              <p>左键选部队（Shift 多选）。右键地图：行军。选中部队后点「包围/进攻」，再在卡片下方选目标敌军。</p>
              <p>顶栏 1×/2×/4× 控制时间（8/16/32 模拟小时每秒）。暂停时仍可下达命令。</p>
              <p>M 打开全局舆图；A 军事分析；B 战役简报；Q 画质。</p></div>
            <div class="an-card"><h4>前线层</h4>
              <p>选中部队后点「总攻 · 亲临前线」进入第一人称。WASD 移动、鼠标瞄准、左键射击、右键机瞄、R 换弹、1/2/3 下达一次战术指令、ESC 返回。</p></div>
          </div>
          <div>
            <div class="an-card"><h4>规则要点</h4>
              <p>敌军不会开图：它只知道与自己接触过的我军。你的情报同样有延迟——侦察分队约 1.5 小时、电话电报约 2 小时、俘虏审讯更久，超过 12 小时标为旧报。</p>
              <p>断补给会掉弹药/粮食与士气；被围会持续掉士气并可能成建制投降。</p></div>
            <div class="an-card"><h4>自由度</h4>
              <p>可以先打黄维、提前总攻、抽走南线阻援、放开口子、同时围两个兵团。每个重大偏离都会记入「历史分歧」，结局按真实约束推演。</p></div>
          </div>
        </div>
      </div>
      <div class="modal-foot"><span class="dim-note">史实数字为公开史料概数；具体纵队兵力、逐小时战损为游戏化调整。<br>地图为等距压缩（1 单位 = 0.8 km，东西南北同比例）；城镇经纬度可信 ±2–5 km，部队位置只到县/乡镇级，时间粒度到日或阶段，不做逐团逐日还原。</span><button class="btn primary modal-close">知道了</button></div>
    </div>`);
  }
  UI.help = showHelp;

  /* ---------------- 战役简报 ---------------- */
  UI.briefing = function (sim) {
    const phase = sim.phase;
    const obj = S.currentObjective(sim);
    const st = S.stats(sim);
    const texts = {
      1: {
        sub: '1948.11.06 — 11.22 · 运河以西',
        situation: '徐州以东，第7兵团由新安镇向碾庄收缩。华野主力自临沂、郯城一线出击；第2、第13兵团在徐州以东集结，企图东援。南线李延年、刘汝明兵团沿津浦线北进。',
        intent: '以华野主力追歼第7兵团，切断其与徐州的联系，在碾庄圩地区完成合围；以阻援集团卡住徐州以东的铁路与公路；中野牵制黄维兵团。',
        task: '合围并歼灭第7兵团（约10万人）。合围后不要急于硬冲：先休整、近迫作业、炮兵前推，再总攻。'
      },
      2: {
        sub: '1948.11.23 — 12.15 · 浍河以南',
        situation: '第7兵团已被解决。黄维第12兵团由蒙城方向北援，队形密集、火力强，正进入浍河与涡河之间的洼地。南线李延年、刘汝明兵团仍在淮河以北策应。',
        intent: '中野以一部诱其深入，主力从两翼收口，将第12兵团合围于双堆集；华野以一部协同，主力休整并监视徐州方向。',
        task: '合围并歼灭第12兵团（约12万人）。中野火力弱于华野，需靠近迫作业与炸药包，不宜在开阔地硬拼。'
      },
      3: {
        sub: '1948.12.16 — 1949.01.10 · 永城东北',
        situation: '杜聿明率第2、第13、第16兵团放弃徐州西撤，被堵截于陈官庄、青龙集地区。包围圈内约30万人，缺粮缺煤，靠空投；大雪与严寒持续。',
        intent: '收紧包围圈，以军事压力与饥饿瓦解敌军；待其虚弱、我军休整完毕后发起总攻，先取东、南、北三面，视情况留西面缺口。',
        task: '围歼杜聿明集团（第2、13、16兵团）。可「放开口子」诱其突围后在野战中追歼，但需预备队。'
      }
    };
    const t = texts[phase] || texts[3];
    const ch = D.chapterOf ? D.chapterOf(phase) : null;
    const areaKm = ch ? `${Math.round(ch.area.w * 0.8)}×${Math.round(ch.area.h * 0.8)} km` : '—';
    const hydroText = ch ? (ch.hydro.moat ? '河渠网 + 环形外壕（不可徒涉）' : (ch.hydro.rivers ? ch.hydro.rivers.join(' / ') : '全部河流')) : '—';
    const coverText = ch ? (ch.cover.snow ? '积雪/冻土（无树林）' : ch.cover.treeInArea ? '林地、村落遮蔽' : '无树林、无丘陵（开阔通视）') : '—';
    const aliveK = sim.kmt.filter((k) => k.alive);
    UI.openModal(`<div class="modal">
      <div class="modal-head"><div><div class="kicker">战役简报 · 粟裕视角</div><h2>第 ${phase} 阶段 <small>${t.sub}</small></h2></div><button class="modal-close btn">✕</button></div>
      <div class="modal-body">
        <div class="brief-grid">
          <div>
            <div class="brief-block"><h3>态势</h3><p>${t.situation}</p></div>
            <div class="brief-block"><h3>意图</h3><p>${t.intent}</p></div>
            <div class="brief-block"><h3>我的任务</h3><div class="brief-quote">${t.task}</div></div>
            <div class="brief-block"><h3>战场环境（本章独立配置）</h3>
              <p>${ch ? ch.terrain : ''}｜作战区 ${areaKm}｜地形单元：${ch ? ch.terrainUnits.join('、') : ''}｜遮蔽：${coverText}｜水系：${hydroText}｜可用机动方向：${ch ? ch.axes.join('、') : ''}</p>
            </div>
            <div class="brief-block"><h3>本阶段目标</h3>
              <div class="objective"><span class="tag acc">目标</span><span>${obj.title}，当前尚存 ${obj.alive.length} 个目标兵团</span></div>
              <div class="objective"><span class="tag cyan">胜</span><span>目标兵团被全歼，且我军未被突破南线</span></div>
              <div class="objective"><span class="tag red">败</span><span>目标兵团突围成功，或我军伤亡超过总兵力 60%</span></div>
            </div>
          </div>
          <div class="brief-side">
            <div class="mini-table"><table>
              <tr><th>项目</th><th>数值</th></tr>
              <tr><td>我军总兵力</td><td><b>${fmtW(st.pla)}</b></td></tr>
              <tr><td>敌军（在编）</td><td><b>${fmtW(st.kmt)}</b></td></tr>
              <tr><td>我军伤亡累计</td><td><b>${fmtW(st.plaCas)}</b></td></tr>
              <tr><td>平均士气</td><td><b>${st.morale.toFixed(1)}</b></td></tr>
              <tr><td>补给正常部队</td><td><b>${st.supplyUnits} / ${st.aliveUnits}</b></td></tr>
              <tr><td>被围敌军</td><td><b>${st.surroundedKMT}</b></td></tr>
              <tr><td>历史分歧</td><td><b>${sim.divergences.length}</b></td></tr>
            </table></div>
            <div class="divider"></div>
            <div class="dim-note">目前仍存活的主要敌军：</div>
            <div class="mini-table" style="margin-top:6px"><table>
              ${aliveK.map((k) => `<tr><td>${k.name}<br><span style="color:#6f8b93">${k.cmdr} · ${k.mission}</span></td><td><b>${fmtW(k.strength)}</b><br><span style="color:#6f8b93">士气 ${Math.round(k.morale)}</span></td></tr>`).join('')}
            </table></div>
            <div class="hist-note">史实：第一阶段围歼第7兵团（11.6—11.22）；第二阶段双堆集（11.23—12.15）；第三阶段陈官庄（12.16—1949.1.10）。本作不强制重演。</div>
          </div>
        </div>
      </div>
      <div class="modal-foot"><span class="dim-note">当前节奏：${S.pacing(sim).name}档（顶栏可随时切换，从宽档无任何时限）。兵力为公开史料概数；逐部队数字为估算/游戏化调整。<br>地图为等距压缩（1 单位 = 0.8 km），城镇坐标源自史料核查、可信 ±2–5 km；部队位置到县/乡镇级。</span><button class="btn primary" data-cb="startPhase">开始本阶段</button></div>
    </div>`);
  };

  /* ---------------- 沙盘推演：2–3 套方案并排 ---------------- */
  UI.sandbox = function (sim, sel) {
    const ids = sel && sel.length ? sel.slice() : sim.pla.filter((u) => !u.dead).slice(0, 3).map((u) => u.id);
    if (!ids.length) { UI.toast('先选择至少一支部队', 'warn'); return; }
    const units = sim.pla.filter((u) => ids.includes(u.id) && !u.dead);
    if (!units.length) { UI.toast('选中部队已不在编', 'warn'); return; }
    const cx = units.reduce((a, u) => a + u.x, 0) / units.length;
    const cz = units.reduce((a, u) => a + u.z, 0) / units.length;
    const known = sim.kmt.filter((k) => {
      if (!k.alive) return false;
      const it = S.intelOf(sim, k.id);
      return it && it.age <= 12;
    });
    const MAIN = ['k7', 'k12', 'k2', 'k13', 'k16'];
    const mainKnown = known.filter((k) => MAIN.includes(k.id));
    const pool = (mainKnown.length ? mainKnown : known.length ? known : sim.kmt.filter((k) => k.alive)).slice();
    const nearest = pool.slice().sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
    const weak = pool.slice().sort((a, b) => a.strength - b.strength)[0];
    const raw = [];
    if (nearest) {
      raw.push({ type: 'encircle', target: { kmtId: nearest.id }, label: '直接包围', sub: nearest.short, hint: '以现有兵力直接收口，速度优先。' });
      raw.push({ type: 'attack', target: { kmtId: nearest.id }, label: '先打后围', sub: nearest.short, hint: '先突击削弱，再转入包围。' });
    }
    if (weak && (!nearest || weak.id !== nearest.id)) raw.push({ type: 'attack', target: { kmtId: weak.id }, label: '先取弱敌', sub: weak.short, hint: '避开硬骨头，先打较弱目标。' });
    raw.push({ type: 'rest', target: { x: cx, z: cz }, label: '就地休整', sub: '不移动', hint: '恢复士气弹药，把时间留给敌军。' });
    const plans = raw.slice(0, 3).map((p, i) => Object.assign({}, p, { key: 'ABC'[i] }));
    UI._plans = plans;
    const riskCls = (r) => (r === '高' ? 'risk-high' : r === '中' ? 'risk-mid' : 'risk-low');
    const cards = plans.map((p, i) => {
      const pv = S.preview(sim, ids, p.type, p.target);
      if (!pv) return '';
      return `<div class="plan-card">
        <span class="plan-badge">方案 ${p.key}</span>
        <h4>${p.label} · ${p.sub}</h4>
        <div class="plan-kv"><span>投入兵力</span><b>${fmtW(pv.troops)}</b></div>
        <div class="plan-kv"><span>里程 / 耗时</span><b>${pv.km} km · ${pv.hours} h</b></div>
        <div class="plan-kv"><span>铁路里程</span><b>${pv.railKm ? `${pv.railKm} km（铁路提速 1.5×）` : '不沿铁路'}</b></div>
        <div class="plan-kv"><span>预计到达</span><b>${pv.eta}</b></div>
        <div class="plan-kv"><span>接触风险</span><b class="${riskCls(pv.risk)}">${pv.risk}</b></div>
        <div class="plan-note">${pv.contactText}</div>
        <div class="plan-kv"><span>预估伤亡</span><b>${fmtW(pv.casLo)} – ${fmtW(pv.casHi)}</b></div>
        <div class="plan-kv"><span>包围圈</span><b>${pv.enc ? pv.enc.text : '—'}</b></div>
        <div class="plan-kv"><span>补给</span><b>${pv.supplyText}</b></div>
        <div class="plan-note">${p.hint}</div>
        <button class="btn primary plan-exec" data-plan="${i}">执行方案 ${p.key}</button>
      </div>`;
    }).join('');
    UI.openModal(`<div class="modal" style="max-width:1080px">
      <div class="modal-head"><div><div class="kicker">沙盘推演 · 不改动战局</div><h2>同一局势下的方案对比 <small>${units.map((u) => u.short).join('、')}</small></h2></div><button class="modal-close btn">✕</button></div>
      <div class="modal-body">
        <div class="plan-grid">${cards}</div>
        <div class="dim-note" style="margin-top:12px">敌情只使用已侦察情报；伤亡为估算区间；包围圈按当前已控制扇区与部队接近方向推算。执行前可反复比较，方案本身不推进时间。</div>
      </div>
      <div class="modal-foot"><span class="dim-note">推演不消耗时间、不改动任何部队。</span><button class="btn modal-close">取消</button></div>
    </div>`);
  };

  /* ---------------- 军事分析 ---------------- */
  UI.analysis = function (sim, startTab) {
    const st = S.stats(sim);
    const pRatio = st.pla / Math.max(1, st.kmt);
    const alive = sim.pla.filter((u) => !u.dead);
    const kmtAlive = sim.kmt.filter((k) => k.alive);
    const supplyBad = alive.filter((u) => !u.supplied);
    const tired = alive.filter((u) => u.fatigue > 60);
    const tabs = [
      ['sit', '态势判断'], ['oob', '兵力与编制'], ['logi', '补给与后勤'], ['tac', '战法分析'], ['hist', '史实对照']
    ];
    const active = startTab || 'sit';
    let body = '';

    // 态势
    const obj = S.currentObjective(sim);
    body += `<div class="tab-panel ${active === 'sit' ? '' : 'hidden'}" id="tab-sit"><div class="an-grid"><div>
      <div class="an-card"><h4>总体判断</h4>
        <p>我军在编 ${st.aliveUnits} 个纵队级单位，约 ${fmtW(st.pla)}；当面敌军约 ${fmtW(st.kmt)}。局部兵力比 ${(pRatio).toFixed(2)} : 1。</p>
        <p>${pRatio > 1.4 ? '局部兵力优势明显，可寻求围歼；注意不要同时围两个兵团，炮兵与预备队会被摊薄。' : pRatio > 0.9 ? '兵力大致相当，应避免硬碰，优先断敌补给、压缩包围圈。' : '兵力处于劣势，建议收缩防线、等待援军或转入战略转移。'}</p>
        <p>当前阶段目标：${obj.title}；尚存目标兵团 ${obj.alive.length} 个。</p></div>
      <div class="an-card"><h4>战线与被围</h4>
        ${kmtAlive.map((k) => `<div class="kv"><span>${k.name}（${k.cmdr}）</span><b class="${k.surrounded ? 'warn' : 'ok'}">${k.surrounded ? '被围 · 补给中断' : '未合围'}</b></div>`).join('')}
      </div></div>
      <div><div class="an-card"><h4>关键指标</h4>
        <div class="kv"><span>我军总兵力</span><b>${fmtW(st.pla)}</b></div>
        <div class="kv"><span>敌军总兵力</span><b>${fmtW(st.kmt)}</b></div>
        <div class="kv"><span>我军累计伤亡</span><b class="${st.plaCas > 80000 ? 'bad' : 'ok'}">${fmtW(st.plaCas)}</b></div>
        <div class="kv"><span>敌军累计损失</span><b>${fmtW(st.kmtCas)}</b></div>
        <div class="kv"><span>平均士气</span><b>${st.morale.toFixed(1)}</b></div>
        <div class="kv"><span>平均疲劳</span><b class="${st.fatigue > 55 ? 'warn' : 'ok'}">${st.fatigue.toFixed(1)}</b></div>
        <div class="kv"><span>补给正常</span><b>${st.supplyUnits} / ${st.aliveUnits}</b></div>
        <div class="kv"><span>被围敌军</span><b>${st.surroundedKMT}</b></div></div>
      <div class="an-card"><h4>可选方案与代价</h4>
        <div class="opt-row"><h5>集中主力围歼当前目标</h5><p>保持 2.5:1 以上局部优势，逐个解决。</p><div class="cost">代价：主力疲劳上升；阻援方向兵力偏薄</div></div>
        <div class="opt-row"><h5>抽调南线阻援加强围歼</h5><p>加快压缩速度，但南线可能被突破。</p><div class="cost">代价：李延年兵团可能在 3—5 天内越过浍河</div></div>
        <div class="opt-row"><h5>先休整、近迫作业，再总攻</h5><p>降低突击伤亡，但给敌军恢复与增援时间。</p><div class="cost">代价：战役时间延长 3—7 天</div></div>
      </div></div></div></div>`;

    // 编制
    body += `<div class="tab-panel ${active === 'oob' ? '' : 'hidden'}" id="tab-oob"><div class="an-grid"><div>
      <div class="an-card"><h4>我军战斗序列（纵队—师层级概览）</h4>
      ${['华野', '南线阻援', '中野', '地方'].map((g) => {
        const list = sim.pla.filter((u) => u.group === g);
        return `<div class="oob-group" style="padding-left:0">${g}<b>${fmtW(list.filter((u) => !u.dead).reduce((a, u) => a + u.strength, 0))}</b></div>` +
          list.map((u) => `<div class="kv"><span>${u.name} · ${u.cmdr}${u.dead ? '（已撤出）' : ''}</span><b>${fmtW(u.strength)} / 士气 ${Math.round(u.morale)}</b></div>`).join('');
      }).join('')}</div></div>
      <div><div class="an-card"><h4>敌军序列（含番号与估计兵力）</h4>
      ${kmtAlive.map((k) => `<div class="kv"><span>${k.name} · ${k.cmdr}</span><b>${fmtW(k.strength)}</b></div>
        <div class="dim-note" style="margin:0 0 6px">${k.corps.map((c) => `${c.name} ${(c.strength / 10000).toFixed(1)}万`).join(' · ')}</div>`).join('')}
      <div class="hist-note">番号与主官来自公开史料；各军/师兵力为估算，游戏内以兵团为单位结算。</div></div></div></div></div>`;

    // 后勤
    body += `<div class="tab-panel ${active === 'logi' ? '' : 'hidden'}" id="tab-logi"><div class="an-grid"><div>
      <div class="an-card"><h4>补给瓶颈</h4>
        <p>补给由兵站、铁路运力与支前民工共同决定。当前铁路状态：${sim.railCut ? '被切断' : '基本畅通'}。</p>
        <p>${supplyBad.length ? `补给受阻：${supplyBad.map((u) => u.short).join('、')}。这些部队弹药与粮食正在下降。` : '所有在编部队补给正常。'}</p>
        <p>${tired.length ? `疲劳偏高（>60）：${tired.map((u) => u.short).join('、')}。建议休整。` : '部队疲劳处于可接受范围。'}</p></div>
      <div class="an-card"><h4>兵站与铁路</h4>
        ${D.DEPOTS.pla.map((d) => `<div class="kv"><span>${d.name}</span><b>容量 ${d.cap}</b></div>`).join('')}
        ${D.RAILS.map((r) => `<div class="kv"><span>${r.name}</span><b>${sim.railCut ? '运力受限' : '正常'}</b></div>`).join('')}
        <div class="kv"><span>支前民工</span><b>约 543 万人次（史实概数）</b></div></div></div>
      <div><div class="an-card"><h4>各部队弹药 / 粮食（日）</h4>
        ${alive.map((u) => `<div class="kv"><span>${u.short}${u.supplied ? '' : '（受阻）'}</span><b class="${u.ammo < 20 ? 'bad' : 'ok'}">${(u.ammo / 12).toFixed(1)} 日 / ${(u.food / 12).toFixed(1)} 日</b></div>`).join('')}</div>
      <div class="an-card"><h4>敌军补给</h4>
        ${kmtAlive.map((k) => `<div class="kv"><span>${k.short}${k.surrounded ? '（被围）' : ''}</span><b class="${k.food < 25 ? 'bad' : 'ok'}">粮 ${(k.food / 12).toFixed(1)} 日 · 弹 ${(k.ammo / 12).toFixed(1)} 日</b></div>`).join('')}</div></div></div></div>`;

    // 战法
    body += `<div class="tab-panel ${active === 'tac' ? '' : 'hidden'}" id="tab-tac"><div class="an-grid">` +
      D.TACTICS.map((t) => `<div class="an-card"><h4>${t.title}</h4><p>${t.body}</p><p style="color:#8fa9af">本阶段怎么做：${t.how}</p></div>`).join('') +
      `</div></div>`;

    // 史实对照
    body += `<div class="tab-panel ${active === 'hist' ? '' : 'hidden'}" id="tab-hist">
      <div class="an-card"><h4>与史实的距离</h4>
        <p>${D.ANALYSIS_NOTES.free}</p><p>${D.ANALYSIS_NOTES.limit}</p></div>
      <div class="an-card"><h4>已记录的历史分歧（${sim.divergences.length}）</h4>
        ${sim.divergences.length ? sim.divergences.map((d) => {
          const def = D.DIVERGENCE_DEFS[d.key];
          return `<div class="divergence"><div class="dh"><span>${d.key} · ${d.title}</span><span>${S.dateLabel(d.t)}</span></div>
            <p><b>你的选择：</b>${def.alt}</p><p><b>史实：</b>${def.hist}</p><p class="dc">后果将在战役结束后汇总。</p></div>`;
        }).join('') : '<p class="dim-note">尚无重大偏离。按史实顺序推进时不会产生分歧点。</p>'}
      </div>
      <div class="an-card"><h4>史实进程（供对照）</h4>
        ${D.MILESTONES.map((m) => `<div class="kv"><span>${m.date}</span><b style="max-width:70%;text-align:right">${m.text}</b></div>`).join('')}
      </div></div>`;

    const html = `<div class="modal">
      <div class="modal-head"><div><div class="kicker">军事分析 · 可核对</div><h2>战局分析 <small>${S.dateLabel(sim.t)}</small></h2></div><button class="modal-close btn">✕</button></div>
      <div class="modal-body">
        <div class="tabs">${tabs.map((t) => `<div class="tab ${t[0] === active ? 'on' : ''}" data-tab="${t[0]}">${t[1]}</div>`).join('')}</div>
        <div class="tab-body">${body}</div>
      </div>
      <div class="modal-foot"><span class="dim-note">数据来源与虚实标注见 README「数据依据表」。</span><button class="btn modal-close">关闭</button></div>
    </div>`;
    UI.openModal(html);
  };

  /* ---------------- 复盘 / 结局 ---------------- */
  UI.outcome = function (sim) {
    const o = sim.outcome;
    if (!o) return;
    const rows = o.divergences.map((d) => {
      const def = D.DIVERGENCE_DEFS[d.key];
      return `<tr><td>${def.title}</td><td class="yours">${def.alt}</td><td class="hist">${def.hist}</td><td>${d.consequence}</td></tr>`;
    }).join('');
    UI.openModal(`<div class="modal">
      <div class="modal-head"><div><div class="kicker">战役复盘</div><h2>${o.title} <small>评级 ${o.grade} · ${Math.floor(o.t / 24)} 天</small></h2></div><button class="modal-close btn">✕</button></div>
      <div class="modal-body">
        <div class="brief-grid">
          <div>
            <div class="brief-block"><h3>结局</h3><p style="font-size:14px;color:#e6f2f4">${o.line}</p>
              <div class="brief-quote">${o.text}</div>
              <p class="hist-note">${o.note}</p></div>
            <div class="brief-block"><h3>我的代价</h3>
              <div class="kv"><span>我军伤亡</span><b>${fmtW(sim.casualties.pla)}（占总兵力 ${(o.casRate * 100).toFixed(1)}%）</b></div>
              <div class="kv"><span>敌军被歼</span><b>${fmtW(sim.casualties.kmt)}</b></div>
              <div class="kv"><span>主要兵团解决</span><b>${o.destroyed} / 5</b></div>
              <div class="kv"><span>历史分歧点</span><b>${sim.divergences.length}</b></div>
              <div class="kv"><span>前线亲临次数</span><b>${sim.battles}</b></div>
            </div>
          </div>
          <div class="brief-side">
            <div class="an-card"><h4>与史实对照</h4>
              ${o.divergences.length ? `<table class="cmp-table"><tr><th>决策点</th><th>你的选择</th><th>史实</th><th>后果</th></tr>${rows}</table>`
                : '<p>你的指挥与史实进程基本一致，没有产生重大分歧点。</p>'}
            </div>
            <div class="an-card"><h4>指挥复盘 · ${o.cmdReview ? o.cmdReview.authName : '常规'}授权</h4>
              ${o.cmdReview ? `<div class="kv"><span>下级请示</span><b>${o.cmdReview.asked}（采纳 ${o.cmdReview.adopted} · 驳回 ${o.cmdReview.rejected}）</b></div>
              <div class="kv"><span>临机专断</span><b class="${o.cmdReview.unapproved ? 'warn' : 'ok'}">${o.cmdReview.unapproved} 次（已记入日志）</b></div>
              <div class="req-lines">${o.cmdReview.notes.map((n) => `<div class="req-line">${n}</div>`).join('')}</div>
              <p class="hist-note">${o.cmdReview.verdict}</p>` : '<p class="dim-note">无指挥复盘数据。</p>'}
            </div>

            <div class="an-card"><h4>可替代方案</h4>
              <p>${sim.phase < 3 ? '如果在解决第7兵团前先打黄维，徐州方向援军将缺少阻击，结局可能走向僵持或失败。' : '如果放开口子让杜聿明突围，可在野战中追歼，但需要预备队；如果没有预备队，则可能演变为失败。'}</p>
              <p>如果提前总攻（D3），可压缩战役时间，但碾庄外壕未破时跨壕强攻伤亡 ×2.4、对敌杀伤 ×0.55；反之按史实先近迫作业（合围后累计 72 小时），时间更长但代价更低。</p>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-foot"><span class="dim-note">结局判定基于兵力、伤亡、包围与时限等硬约束，不强制回拨史实。</span><button class="btn primary" data-cb="restart">再打一次</button></div>
    </div>`);
  };

  /* ---------------- 部队详情弹窗（舆图 / 三维标签可点开） ---------------- */
  UI.unitModal = function (sim, plaId, kmtId) {
    let body = '', title = '', sub = '';
    if (plaId) {
      const u = sim.pla.find((x) => x.id === plaId);
      if (!u) return;
      title = u.name;
      sub = `${u.group} · ${u.role} · 指挥 ${u.cmdr}`;
      const order = u.order ? ORDER_LABEL[u.order.type] || '待机' : '待机';
      body = `<div class="an-grid"><div>
        <div class="an-card"><h4>编成与状态</h4>
          <div class="kv"><span>兵力</span><b>${fmtW(u.strength)} / ${fmtW(u.s0)}</b></div>
          <div class="kv"><span>累计减员</span><b>${fmtW(u.s0 - u.strength)}</b></div>
          <div class="kv"><span>士气</span><b>${Math.round(u.morale)} / 100</b></div>
          <div class="kv"><span>疲劳</span><b>${Math.round(u.fatigue)} / 100</b></div>
          <div class="kv"><span>弹药</span><b>${(u.ammo / 12).toFixed(1)} 日</b></div>
          <div class="kv"><span>粮食</span><b>${(u.food / 12).toFixed(1)} 日</b></div>
          <div class="kv"><span>工事</span><b>${u.entrench.toFixed(1)} 级</b></div>
          <div class="kv"><span>当前任务</span><b>${order}</b></div>
          <div class="kv"><span>位置</span><b>${S.placeName(u.x, u.z)}</b></div>
          <div class="kv"><span>补给</span><b class="${u.supplied ? 'ok' : 'bad'}">${u.supplied ? '正常' : '受阻'}</b></div>
          <div class="kv"><span>状态</span><b>${u.dead ? '已撤出' : u.engaged ? '交战中' : u.surrounded ? '被围' : '待机'}</b></div>
        </div></div>
        <div><div class="an-card"><h4>指挥员 · ${u.cmdr}</h4>
          ${cmdrBars(u.cmd)}
          <div class="kv"><span>决心</span><b>${u.cmd ? u.cmd.opinion : '—'}</b></div>
          <div class="kv"><span>请示</span><b>${u.cmd && u.cmd.request ? u.cmd.request.text : '无'}</b></div>
          <div class="hist-note">${u.cmd && u.cmd.profile ? u.cmd.profile.note : ''}<br>${D.CMDR_BOUNDARY}</div>
        </div>
        <div class="an-card"><h4>编成说明</h4>
          <p>${u.role === '炮兵' ? '特种兵纵队所属炮兵部队。靠近突击集团时可提供火力压制加成。' : '纵队下辖若干师/旅。本作按公开史料概数合并为纵队级单位，师级不单独建模。'}</p>
          <div class="hist-note">该单位的兵力数为游戏化概数，依据见 README「数据依据表」。</div>
        </div>
        <div class="an-card"><h4>可执行命令</h4>
          <div class="orders">
            <button class="btn" data-order="move">行军</button>
            <button class="btn" data-order="encircle">包围</button>
            <button class="btn" data-order="attack">进攻</button>
            <button class="btn" data-order="block">阻援</button>
            <button class="btn" data-order="rest">休整</button>
            <button class="btn" data-order="scout">侦察</button>
          </div>
          <div class="frontline"><button class="btn primary" data-cb="assaultFromModal">总攻 · 亲临前线（F）</button></div>
        </div></div></div>`;
    } else if (kmtId) {
      const k = sim.kmt.find((x) => x.id === kmtId);
      if (!k) return;
      const it = S.intelOf(sim, kmtId);
      title = k.name;
      sub = `${k.cmdr} · ${k.mission}`;
      body = `<div class="an-grid"><div>
        <div class="an-card"><h4>情报（并非全知）</h4>
          <div class="kv"><span>来源</span><b>${it ? it.source : '无'}</b></div>
          <div class="kv"><span>获取时间</span><b>${it ? S.dateLabel(it.time) : '—'}</b></div>
          <div class="kv"><span>滞后</span><b>${it ? Math.round(it.age) + ' 小时' : '—'}</b></div>
          <div class="kv"><span>可信度</span><b>${it ? it.conf + '%' : '—'}</b></div>
          <div class="kv"><span>位置误差</span><b>${it ? '±' + (2 + Math.min(13, it.age * 0.3)).toFixed(1) + ' km（误差圈）' : '未知'}</b></div>
          <div class="kv"><span>估计兵力</span><b>${it ? fmtW(it.strength) + '（±1 个师）' : '情报空白'}</b></div>
          <div class="kv"><span>合围状态</span><b class="${k.surrounded ? 'bad' : 'ok'}">${k.surrounded ? '已被合围' : '未合围'}</b></div>
          ${k.id === 'k7' ? `<div class="kv"><span>圩寨外壕</span><b class="${sim.flags.nzMoatBroken ? 'ok' : 'bad'}">${sim.flags.nzMoatBroken ? '已破（通道打开）' : '未破（强攻伤亡×2.4 / 耗时×2.8） · 作业 ' + Math.floor(sim.flags.nzMoatPrep || 0) + '/72h'}</b></div>` : ''}
          <div class="kv"><span>估计士气</span><b>${Math.round(it ? k.morale : 0)}</b></div>
          <div class="kv"><span>估计粮弹</span><b>${(k.food / 12).toFixed(1)} 日 / ${(k.ammo / 12).toFixed(1)} 日</b></div>
        </div></div>
        <div><div class="an-card"><h4>已知编成（公开史料番号）</h4>
          ${k.corps.map((c) => `<div class="kv"><span>${c.name}</span><b>${(c.strength / 10000).toFixed(1)} 万</b></div>`).join('')}
          <div class="hist-note">敌军构成来自公开史料；游戏内以兵团为单位结算，军/师为概览。</div>
        </div>
        <div class="an-card"><h4>行动逻辑</h4>
          <p>${k.mission}。敌军只依据自身侦察与接触信息行动，不会读取我军未暴露的部署。</p></div>
        </div></div>`;
    } else return;
    UI.openModal(`<div class="modal">
      <div class="modal-head"><div><div class="kicker">部队详情</div><h2>${title} <small>${sub}</small></h2></div><button class="modal-close btn">✕</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot"><span class="dim-note">数字为史料概数 + 游戏化调整；详情见 README。</span><button class="btn modal-close">关闭</button></div>
    </div>`);
  };

  /* ---------------- FPS HUD ---------------- */
  let crossT = 0;
  UI.fpsSetup = function (cfg) {
    el.fpsTitle.textContent = cfg.title;
    el.fpsSub.textContent = cfg.sub || '';
    el.fpsEnemiesTotal.textContent = cfg.enemyCount;
    el.fpsEnemies.textContent = cfg.enemyCount;
    el.fpsAllies.textContent = cfg.allies || 0;
    el.deathScreen.classList.add('hidden');
    el.cmdWheel.classList.remove('hidden');
    el.crosshair.classList.remove('hidden');
  };

  UI.fpsUpdate = function (f) {
    el.fpsEnemies.textContent = f.enemies;
    el.fpsAllies.textContent = f.allies;
    el.fpsTime.textContent = Math.max(0, Math.ceil(f.time)) + 's';
    el.fpsHP.textContent = Math.round(f.hp);
    el.fpsHPBar.style.width = pct(f.hp);
    el.fpsHPBar.style.background = f.hp < 35 ? 'var(--red)' : 'var(--cyan)';
    el.fpsAmmo.textContent = f.ammo;
    el.fpsReserve.textContent = f.reserve;
    el.fpsGun.textContent = f.gun;
    el.fpsMode.textContent = f.ads ? '机瞄 · 稳定' : '腰射 · 右键机瞄';
    el.crosshair.classList.toggle('ads', f.ads);
    // 扩散
    const s = 1 + f.spread * 2.4;
    el.crosshair.querySelector('.t').style.transform = `translateY(${-8 * s}px)`;
    el.crosshair.querySelector('.b').style.transform = `translateY(${8 * s}px)`;
    el.crosshair.querySelector('.l').style.transform = `translateX(${-8 * s}px)`;
    el.crosshair.querySelector('.r').style.transform = `translateX(${8 * s}px)`;
    el.suppress.classList.toggle('on', !!f.suppressed);
    if (f.stateText) el.fpsState.textContent = f.stateText;
    const hint = f.cue || f.hint;
    el.fpsHint.classList.toggle('hidden', !hint);
    if (hint) el.fpsHint.innerHTML = hint;
  };

  UI.hitmarker = function (kill) {
    const h = el.hitmarker;
    h.classList.remove('show');
    void h.offsetWidth;
    h.classList.add('show');
    h.querySelectorAll('i').forEach((i) => { i.style.background = kill ? '#ff8a3d' : '#fff'; });
  };
  UI.damageDir = function (angleDeg) {
    el.dmgDir.style.opacity = '1';
    el.dmgDir.querySelector('i').style.transform = `rotate(${angleDeg}deg)`;
    clearTimeout(UI._dmgT);
    UI._dmgT = setTimeout(() => { el.dmgDir.style.opacity = '0'; }, 900);
  };
  UI.killfeed = function (text) {
    const d = document.createElement('div');
    d.innerHTML = `<b>${text}</b>`;
    el.killfeed.prepend(d);
    while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
  };
  UI.fpsDeath = function () { el.deathScreen.classList.remove('hidden'); el.cmdWheel.classList.add('hidden'); };
  UI.fpsWheel = function (v) {
    el.cmdWheel.classList.toggle('hidden', !v);
    document.body.classList.toggle('fps-cmd', !!v);
  };
  UI.fpsResult = function (text) {
    el.fpsHint.classList.remove('hidden');
    el.fpsHint.innerHTML = text;
  };

  /* ---------------- 过场列表（cinematics.html） ---------------- */
  UI.renderCineList = function (list, cb) {
    const box = document.getElementById('cineList');
    if (!box) return;
    box.innerHTML = list.map((c, i) => `<div class="cine-item" data-index="${i}">
      <div><h4>${c.title}</h4><p>${c.sub} · ${c.place} · ${c.duration}s · ${c.shots.length} 个镜头 · 本机合成旁白（机械音质）</p></div>
      <div class="idx">${String(i + 1).padStart(2, '0')}</div>
    </div>`).join('');
    box.onclick = (ev) => {
      const it = ev.target.closest('.cine-item');
      if (it) cb(parseInt(it.dataset.index, 10));
    };
  };
})();
