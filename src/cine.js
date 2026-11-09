/* ==========================================================================
   引擎内过场短片：运镜 / 人物动作 / 黑场过渡 / 字幕 / 本机合成旁白
   画面与人物全部程序化渲染；旁白为本机 Windows SAPI 合成的 WAV（机械音质）
   ========================================================================== */
(function () {
  const HX = (window.HX = window.HX || {});
  const D = HX.DATA, U = HX.U, W = HX.World;
  const C = (HX.Cine = {});
  const $ = (id) => document.getElementById(id);
  const ease = U.ease;
  const lerp = U.lerp;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  C.ENV = {
    dusk: {
      sunDir: [-0.62, 0.18, -0.42], sunCol: [1.0, 0.58, 0.30], skyCol: [0.26, 0.31, 0.40], groundCol: [0.15, 0.14, 0.12],
      fogCol: [0.24, 0.23, 0.24], skyTop: [0.03, 0.08, 0.14], skyHorizon: [0.38, 0.30, 0.28],
      rimCol: [1.0, 0.66, 0.38], rim: 0.62, fogDensity: 0.0026, bloom: 0.95, exposure: 1.15, vignette: 0.44,
      grain: 0.055, focus: [0, 40], shadowRadius: 90, grade: [1.08, 1.0, 0.92]
    },
    night: {
      sunDir: [0.30, 0.35, 0.40], sunCol: [0.24, 0.34, 0.52], skyCol: [0.10, 0.14, 0.21], groundCol: [0.05, 0.06, 0.08],
      fogCol: [0.06, 0.08, 0.11], skyTop: [0.01, 0.02, 0.05], skyHorizon: [0.09, 0.10, 0.14],
      rimCol: [0.55, 0.72, 1.0], rim: 0.5, fogDensity: 0.0034, bloom: 1.25, exposure: 0.92, vignette: 0.55,
      grain: 0.07, focus: [58, 20], shadowRadius: 70, grade: [0.92, 0.98, 1.12]
    },
    snow: {
      sunDir: [0.20, 0.42, 0.22], sunCol: [0.80, 0.84, 0.92], skyCol: [0.32, 0.36, 0.44], groundCol: [0.22, 0.24, 0.27],
      fogCol: [0.36, 0.39, 0.44], skyTop: [0.10, 0.13, 0.18], skyHorizon: [0.46, 0.48, 0.52],
      rimCol: [0.75, 0.86, 1.0], rim: 0.55, fogDensity: 0.0042, bloom: 0.62, exposure: 1.0, vignette: 0.4,
      grain: 0.05, focus: [-100, 50], shadowRadius: 80, grade: [0.96, 1.0, 1.06]
    },
    dawn: {
      sunDir: [0.55, 0.26, 0.38], sunCol: [1.0, 0.78, 0.52], skyCol: [0.34, 0.36, 0.40], groundCol: [0.18, 0.17, 0.15],
      fogCol: [0.38, 0.33, 0.30], skyTop: [0.09, 0.13, 0.20], skyHorizon: [0.60, 0.48, 0.38],
      rimCol: [1.0, 0.86, 0.62], rim: 0.6, fogDensity: 0.0030, bloom: 1.0, exposure: 1.1, vignette: 0.4,
      grain: 0.04, focus: [-110, 60], shadowRadius: 85, grade: [1.04, 1.0, 0.96]
    }
  };

  const TR = 0.6;          // 镜头间黑场过渡时长（秒）
  C.state = {
    active: false, idx: 0, t: 0, shot: 0, shotT: 0, onEnd: null, queue: null, fade: 0,
    segStart: 0, capKey: ''
  };

  /* ---------------- 旁白（本机 SAPI 合成 WAV） ---------------- */
  const V = { a: null, file: '', failed: {}, logs: [], disabled: false };
  const voiceName = (cine, si, ci) => cine.id + '-s' + (si + 1) + '-c' + (ci + 1) + '.wav';
  function stopVoice() {
    if (V.a) { try { V.a.pause(); } catch (e) { /* ignore */ } V.a = null; }
  }
  function playVoice(cine, si, ci, text, capMs) {
    const name = voiceName(cine, si, ci);
    V.file = name;
    if (V.disabled) { V.logs.push({ file: name, schedMs: 0, latMs: null, muted: true }); return; }
    let a;
    try { a = new Audio('assets/voice/' + name); } catch (e) { V.failed[name] = 'audio-api'; return; }
    V.a = a;
    const t0 = performance.now();
    a.preload = 'auto';
    a.onplaying = () => V.logs.push({ file: name, schedMs: +(t0 - C.state.segStart - capMs * 1000).toFixed(2), latMs: +(performance.now() - t0).toFixed(1) });
    a.onerror = () => {
      V.failed[name] = 'load';
      const note = $('cineNote');
      if (note && !/合成语音缺失/.test(note.textContent)) note.textContent = (note.textContent || '') + '（合成语音缺失，仅字幕）';
    };
    const pr = a.play();
    if (pr && pr.catch) pr.catch(() => { V.failed[name] = 'play'; });
  }
  C.voiceName = voiceName;

  C.setup = function (renderer, campaign) {
    C.renderer = renderer;
    C.campaign = campaign;
    if (window.PAGE === 'cinematics') {
      HX.UI.renderCineList(D.CINEMATICS, (i) => C.play(i, null, true));
      const all = document.getElementById('btnPlayAll');
      if (all) all.onclick = () => C.playAll(true);
      const back = document.getElementById('btnBackGame');
      if (back) back.onclick = () => { location.href = 'index.html'; };
    }
    const skip = $('cineSkip');
    if (skip) skip.onclick = () => C.skip();
  };

  C.play = function (idx, onEnd, standalone) {
    const list = D.CINEMATICS;
    if (idx < 0 || idx >= list.length) return;
    stopVoice();
    C.state.active = true;
    C.state.idx = idx; C.state.t = 0; C.state.shot = 0; C.state.shotT = 0;
    C.state.onEnd = onEnd || null;
    C.state.standalone = !!standalone;
    C.state.segStart = performance.now();
    C.state.capKey = '';
    V.disabled = !!(HX.Audio && HX.Audio.muted && HX.Audio.muted());
    HX.UI.setScreen('cine_screen');
    const c = list[idx];
    const datePlace = c.date + ' · ' + c.place;
    $('cineKicker').textContent = datePlace;
    $('cineH1').textContent = c.title;
    $('cineSub').textContent = datePlace;
    $('cineSubInfo').textContent = datePlace + ' · 镜头 ' + (idx + 1) + ' / ' + list.length + ' · 本机合成旁白（机械音质）';
    $('cineTitle').style.opacity = '1';
    $('cineCaption').style.opacity = '0';
    $('cineNote').textContent = '';
    $('cineFade').style.opacity = '1';
    setTimeout(() => { $('cineTitle').style.opacity = '0'; }, 3600);
    C.applyShotUI(c, 0);
  };

  C.playAll = function (standalone) {
    C.state.standalone = !!standalone;
    C.state.queue = D.CINEMATICS.map((_, i) => i);
    playNext();
  };
  function playNext() {
    if (!C.state.queue || !C.state.queue.length) {
      C.state.active = false;
      if (C.state.standalone) {
        HX.UI.setScreen('cine_menu');
        HX.UI.renderCineList(D.CINEMATICS, (i) => C.play(i, null, true));
      }
      return;
    }
    const i = C.state.queue.shift();
    C.play(i, () => playNext(), true);
  }

  C.skip = function () {
    const cb = C.state.onEnd;
    stopVoice();
    C.state.active = false;
    $('cineFade').style.opacity = '1';
    setTimeout(() => {
      if (C.state.queue) { C.state.queue = null; }
      if (cb) cb();
      else if (C.state.standalone) {
        HX.UI.setScreen('cine_menu');
        HX.UI.renderCineList(D.CINEMATICS, (i) => C.play(i, null, true));
      }
    }, 300);
  };

  function applyShotUI(cine, si) {
    const shot = cine.shots[si];
    const caps = shot.caption || [];
    $('cineWho').textContent = (caps[0] && caps[0].who) || '粟裕 · 第一人称（艺术演绎）';
    $('cineText').textContent = '';
    $('cineNote').textContent = '';
    $('cineCaption').style.opacity = '0';
    C.state.capKey = '';
    $('cineIdx').textContent = String(si + 1).padStart(2, '0') + ' / ' + String(cine.shots.length).padStart(2, '0');
  }
  C.applyShotUI = applyShotUI;

  C.update = function (dt) {
    const st = C.state;
    if (!st.active) return;
    const cine = D.CINEMATICS[st.idx];
    st.t += dt;
    st.shotT += dt;
    let shot = cine.shots[st.shot];
    if (st.shotT >= shot.dur) {
      st.shotT = 0;
      st.shot++;
      if (st.shot >= cine.shots.length) { C.end(); return; }
      shot = cine.shots[st.shot];
      applyShotUI(cine, st.shot);
    }
    // 镜头之间黑场过渡（起幅淡入 / 落幅淡出）
    let dip = 0;
    if (st.shotT < TR) dip = 1 - st.shotT / TR;
    else if (st.shotT > shot.dur - TR) dip = (st.shotT - (shot.dur - TR)) / TR;
    $('cineFade').style.opacity = String(clamp(dip, 0, 1));
    // 字幕 + 旁白（同一文本、同一触发点）
    const caps = shot.caption || [];
    let ci = -1;
    for (let i = 0; i < caps.length; i++) if (st.shotT >= caps[i].t) ci = i;
    const cur = ci >= 0 ? caps[ci] : null;
    const capEl = $('cineCaption');
    if (cur) {
      const key = st.shot + ':' + ci;
      if (st.capKey !== key) {
        st.capKey = key;
        $('cineWho').textContent = cur.who || '粟裕 · 第一人称（艺术演绎）';
        $('cineText').textContent = cur.text;
        $('cineNote').textContent = cur.note || '';
        const shotBase = cine.shots.slice(0, st.shot).reduce((a, s) => a + s.dur, 0);
        playVoice(cine, st.shot, ci, cur.text, shotBase + st.shotT);
      }
      capEl.style.opacity = '1';
    } else capEl.style.opacity = '0';
    // 进度
    const total = cine.shots.reduce((a, s) => a + s.dur, 0);
    const done = cine.shots.slice(0, st.shot).reduce((a, s) => a + s.dur, 0) + st.shotT;
    $('cineProg').style.width = Math.min(100, done / total * 100) + '%';
  };

  C.end = function () {
    const st = C.state;
    const cb = st.onEnd;
    stopVoice();
    st.active = false;
    $('cineFade').style.opacity = '1';
    setTimeout(() => {
      if (st.queue && st.queue.length) { playNext(); return; }
      st.queue = null;
      if (cb) cb();
      else if (st.standalone) {
        HX.UI.setScreen('cine_menu');
        HX.UI.renderCineList(D.CINEMATICS, (i) => C.play(i, null, true));
      }
    }, 420);
  };

  /* ---------------- 每帧场景 ---------------- */
  C.render = function () {
    const st = C.state;
    if (!st.active || !C.renderer) return false;
    const cine = D.CINEMATICS[st.idx];
    const shot = cine.shots[st.shot];
    const p = clamp(st.shotT / shot.dur, 0, 1);
    const k = ease(p);
    const wobMul = shot.move === 'truck' ? 0.35 : shot.move === 'pan' ? 0.5 : shot.move === 'push' ? 0.6 : 1.0;
    const wob = [Math.sin(st.t * 0.7) * 0.35, Math.sin(st.t * 0.52 + 1.3) * 0.22, Math.cos(st.t * 0.61) * 0.3].map((v) => v * wobMul);
    // 机位高度按地形抬升：数据里的 y 表示"离地高度"，避免镜头钻进土坡
    const px = lerp(shot.from.pos[0], shot.to.pos[0], k);
    const pz = lerp(shot.from.pos[2], shot.to.pos[2], k);
    const tx = lerp(shot.from.target[0], shot.to.target[0], k);
    const tz = lerp(shot.from.target[2], shot.to.target[2], k);
    const py = W.heightAt(px, pz) + lerp(shot.from.pos[1], shot.to.pos[1], k);
    const ty = W.heightAt(tx, tz) + lerp(shot.from.target[1], shot.to.target[1], k);
    const cam = {
      pos: [px + wob[0], py + wob[1], pz + wob[2]],
      target: [tx, ty, tz],
      fov: lerp(shot.from.fov, shot.to.fov, k),
      near: 0.35, far: 900
    };
    const env = Object.assign({}, C.ENV[cine.env] || C.ENV.dusk);
    env.focus = [(cam.pos[0] + cam.target[0]) / 2, (cam.pos[2] + cam.target[2]) / 2];
    const scene = new HX.Scene();
    // 过场降低植被密度，避免近景大树挡住人物与运镜
    if (HX.Populate) HX.Populate(scene, C.campaign, st.t, { cine: true, quality: 'low' });
    populateCine(scene, cine, st.t, cam);
    C.renderer.render(cam, scene, env, C.campaign ? C.campaign.staticList : null);
    return true;
  };

  /* ---------------- 过场专用陈设与人 ---------------- */
  const COL = {
    pla: [0.42, 0.52, 0.50], plaDark: [0.30, 0.38, 0.37], kmt: [0.42, 0.36, 0.26],
    fire: [1.0, 0.45, 0.12], smoke: [0.30, 0.30, 0.32], skin: [0.55, 0.45, 0.36],
    wood: [0.34, 0.27, 0.20], steel: [0.30, 0.31, 0.33], cloth: [0.66, 0.60, 0.48]
  };

  /* 单个人形：躯干 + 头 + 两条迈步的腿 + 可选手臂/步枪/背包
     姿态变化靠 stride（步幅）、arm（手臂前伸长度）、h（身高）三者随 t 改变 */
  function figure(scene, x, y, z, yaw, ph, col, opt) {
    opt = opt || {};
    const h = opt.h || 1;
    const stride = Math.sin(ph) * 0.24;
    const bob = Math.abs(Math.cos(ph)) * 0.035;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    scene.box(x, y + 0.55 * h + bob, z, 0.36, 0.92 * h, 0.28, yaw, col);
    scene.box(x, y + 1.18 * h + bob, z, 0.24, 0.24, 0.24, yaw, col);
    scene.box(x + fx * stride * 0.5, y + 0.22, z + fz * stride * 0.5, 0.16, 0.44, 0.16, yaw, col);
    scene.box(x - fx * stride * 0.5, y + 0.22, z - fz * stride * 0.5, 0.16, 0.44, 0.16, yaw, col);
    if (opt.arm) {
      const reach = opt.arm;
      scene.box(x + fx * (0.2 + reach * 0.5), y + 0.95 * h, z + fz * (0.2 + reach * 0.5), reach, 0.12, 0.12, yaw, col);
    }
    if (opt.rifle) scene.box(x + fx * 0.32, y + 0.86, z + fz * 0.32, 0.08, 0.78, 0.08, yaw, [0.12, 0.12, 0.12]);
    if (opt.pack) scene.box(x - fx * 0.24, y + 0.75, z - fz * 0.24, 0.3, 0.42, 0.2, yaw, [0.25, 0.23, 0.17]);
    if (opt.hat) scene.box(x, y + 1.32 * h + bob, z, 0.3, 0.09, 0.3, yaw, col);
  }

  /* 行军纵队：沿 A→B 循环推进，每人间距固定，位移与步态随时间连续变化 */
  function column(scene, t, cx, cz, opt) {
    opt = opt || {};
    const ax = opt.dx === undefined ? 1 : opt.dx, az = opt.dz === undefined ? 0.18 : opt.dz;
    const n = opt.n || 16, gap = opt.gap || 2.3, spd = opt.spd || 0.95, L = n * gap;
    const col = opt.col || COL.pla;
    const x0 = cx - ax * L * 0.5, z0 = cz - az * L * 0.5;
    const yaw = Math.atan2(ax, az);
    for (let i = 0; i < n; i++) {
      const s = ((t * spd + i * gap) % L);
      const x = x0 + ax * s, z = z0 + az * s;
      if (Math.abs(x) > 140 || z < -120 || z > 180) continue;
      const y = W.heightAt(x, z);
      figure(scene, x, y, z, yaw, t * 6.2 + i * 0.9, col, { rifle: i % 2 === 0, pack: true, hat: i % 3 === 0, h: 1.12 + (i % 3) * 0.05 });
      if (i % 5 === 0) {
        // 骡马与小车
        scene.box(x + 1.35, y + 0.5, z + 0.45, 1.4, 0.6, 0.7, yaw, COL.wood);
        scene.box(x + 1.95, y + 0.72, z + 0.45, 0.5, 0.45, 0.4, yaw, COL.wood);
      }
    }
  }

  /* 指挥所：土屋、桌上地图、两名身影（一人俯身图上，手臂前伸长度周期变化） */
  function commandPost(scene, t, cx, cz) {
    const y = W.heightAt(cx, cz);
    // 简易指挥棚：四根立柱 + 帆布顶，给"指挥所"一个可读的剪影
    scene.box(cx - 2.8, y + 1.25, cz - 1.4, 0.16, 2.5, 0.16, 0, COL.wood);
    scene.box(cx + 2.8, y + 1.25, cz - 1.4, 0.16, 2.5, 0.16, 0, COL.wood);
    scene.box(cx - 2.8, y + 1.25, cz + 1.6, 0.16, 2.5, 0.16, 0, COL.wood);
    scene.box(cx + 2.8, y + 1.25, cz + 1.6, 0.16, 2.5, 0.16, 0, COL.wood);
    scene.box(cx, y + 2.55, cz + 0.1, 6.0, 0.12, 3.4, 0.18, [0.40, 0.36, 0.28]);
    scene.box(cx, y + 1.05, cz, 3.2, 0.16, 1.8, 0.18, COL.wood);
    scene.box(cx, y + 0.5, cz, 0.2, 1.0, 0.2, 0.18, COL.wood);
    scene.box(cx, y + 1.18, cz, 1.9, 0.04, 1.1, 0.18, [0.72, 0.68, 0.52]);
    const lean = 0.55 + 0.38 * Math.sin(t * 0.85);
    figure(scene, cx + 1.2, y, cz + 0.5, -1.55, t * 1.4, COL.plaDark, { arm: lean, pack: true, hat: true, h: 1.2 });
    figure(scene, cx - 1.3, y, cz - 0.5, 1.15, t * 1.0, COL.pla, { arm: 0.18 + 0.18 * (0.5 + 0.5 * Math.sin(t * 0.45)), h: 1.2 });
    scene.addSprite(cx - 0.15, y + 1.65, cz + 0.55, 0.5, [1.0, 0.72, 0.38], 0.5 + 0.12 * Math.sin(t * 5.1));
    scene.addSoft(cx - 0.15, y + 1.7, cz + 0.55, 5.5, [1.0, 0.62, 0.28], 0.07);
  }

  /* 炮兵阵地：炮架 + 后坐炮管 + 装填手（手臂/弹药位置随时间变化） */
  function battery(scene, t, cx, cz) {
    const yaw = Math.PI; // 朝北
    for (let g = 0; g < 3; g++) {
      const x = cx - 7 + g * 7, z = cz + 11;
      const y = W.heightAt(x, z);
      const ph = ((t * 0.55 + g * 0.37) % 1);
      const kick = ph < 0.16 ? (1 - ph / 0.16) * 0.42 : 0;
      // 炮架 + 防盾 + 车轮 + 炮管（后坐）
      scene.box(x, y + 0.45, z, 1.9, 0.5, 1.2, 0, COL.wood);
      scene.box(x, y + 0.95, z - 0.55, 2.1, 0.9, 0.12, 0, COL.steel);
      scene.box(x - 0.95, y + 0.55, z + 0.2, 0.14, 0.85, 0.85, 0, [0.18, 0.18, 0.18]);
      scene.box(x + 0.95, y + 0.55, z + 0.2, 0.14, 0.85, 0.85, 0, [0.18, 0.18, 0.18]);
      scene.box(x, y + 1.2 + kick * 0.2, z - 0.9 + kick, 0.30, 0.30, 3.0, 0, COL.steel);
      scene.box(x, y + 1.2, z + 1.1, 0.5, 0.4, 0.6, 0, [0.45, 0.42, 0.3]);
      figure(scene, x - 1.1, y, z - 0.6, yaw, t * 2.1 + g, COL.pla, { arm: 0.2 + 0.5 * Math.abs(Math.sin(t * 1.1 + g)) });
      figure(scene, x + 1.1, y, z - 0.2, yaw, t * 1.7 + g, COL.pla, { arm: 0.12 });
      if (ph < 0.13) {
        scene.addSprite(x, y + 1.3, z - 2.6, 8.0, COL.fire, 0.9 * (1 - ph / 0.13));
        scene.addSprite(x, y + 1.5, z - 3.0, 3.4, [1.0, 0.85, 0.4], 0.75);
      }
      for (let i = 0; i < 2; i++) {
        scene.addSoft(x + Math.sin(t * 0.3 + i) * 1.2, y + 2.2 + i * 1.6, z + 1.2 + Math.cos(t * 0.25 + i), 5 + i * 2, COL.smoke, 0.08);
      }
    }
  }

  /* 担架队：两人抬一副担架，沿路往复移动，步态与担架起伏同步 */
  function stretchers(scene, t, cx, cz) {
    for (let k = 0; k < 3; k++) {
      const s = ((t * 0.55 + k * 9) % 27);
      const x = cx - 4 + k * 2.8, z = cz + 13 - s;
      const y = W.heightAt(x, z);
      const bob = Math.sin(t * 4.2 + k) * 0.04;
      figure(scene, x - 0.55, y, z - 0.5, 0, t * 5.0 + k, COL.pla, { arm: 0.35 });
      figure(scene, x + 0.55, y, z - 0.5, 0, t * 5.0 + k + 0.6, COL.pla, { arm: 0.35 });
      scene.box(x, y + 0.62 + bob, z, 1.5, 0.08, 0.62, 0, COL.cloth);
      scene.box(x, y + 0.72 + bob, z, 1.25, 0.18, 0.42, 0, [0.42, 0.30, 0.26]);
    }
  }

  /* 支前民工：小车、扁担与粮袋，沿路推进 */
  function civilians(scene, t, cx, cz) {
    for (let k = 0; k < 6; k++) {
      const s = ((t * 0.5 + k * 5.5) % 33);
      const x = cx - 16 + s * 0.95, z = cz - 11 + s * 0.42;
      const y = W.heightAt(x, z);
      const yaw = Math.atan2(0.95, 0.42);
      figure(scene, x, y, z, yaw, t * 5.4 + k, COL.pla, { arm: 0.22, h: 0.92 });
      scene.box(x + 0.72, y + 0.55, z + 0.3, 1.0, 0.46, 0.56, yaw, COL.wood);
      scene.box(x + 0.72, y + 0.25, z + 0.3, 0.08, 0.5, 0.5, yaw, [0.18, 0.18, 0.18]);
      scene.box(x + 0.72, y + 0.82, z + 0.3, 0.5, 0.24, 0.4, yaw, [0.62, 0.55, 0.36]);
      if (k % 3 === 0) {
        scene.box(x - 0.15, y + 1.32, z - 0.05, 1.25, 0.07, 0.07, yaw, COL.wood);
        scene.box(x + 0.45, y + 0.9, z - 0.05, 0.26, 0.42, 0.3, yaw, [0.55, 0.48, 0.32]);
        scene.box(x - 0.75, y + 0.9, z - 0.05, 0.26, 0.42, 0.3, yaw, [0.55, 0.48, 0.32]);
      }
    }
  }

  /* 俘虏纵队：低头、慢速，反方向行进 */
  function prisoners(scene, t, cx, cz) {
    const n = 10, gap = 1.9, L = n * gap, spd = 0.42;
    for (let i = 0; i < n; i++) {
      const s = ((t * spd + i * gap) % L);
      const x = cx + 9 - s * 0.6, z = cz - 4 + s * 0.9;
      const y = W.heightAt(x, z);
      figure(scene, x, y, z, Math.atan2(-0.6, 0.9), t * 3.4 + i, COL.kmt, { h: 0.9, pack: i % 3 === 0 });
    }
  }

  function stage(scene, cine, t) {
    const cx = cine.stageX || 0, cz = cine.stageZ || 0;
    const list = cine.actors || ['column'];
    for (const a of list) {
      if (a === 'column') column(scene, t, cx - 5, cz + 2, {});
      else if (a === 'command') commandPost(scene, t, cx + 6, cz + 8);
      else if (a === 'artillery') battery(scene, t, cx, cz + 10);
      else if (a === 'stretcher') stretchers(scene, t, cx - 2, cz + 1);
      else if (a === 'civilians') civilians(scene, t, cx - 6, cz - 3);
      else if (a === 'prisoners') prisoners(scene, t, cx + 6, cz + 4);
    }
  }

  function populateCine(scene, cine, t, cam) {
    const rnd = U.rng(771 + (cine.id.length * 13));
    stage(scene, cine, t);
    // 村舍火光与烟柱（跟随本段陈设位置）
    const base = [cine.stageX || 0, cine.stageZ || 0];
    const fires = [[base[0] + 14, base[1] + 8], [base[0] - 18, base[1] + 14], [base[0] + 6, base[1] - 18], [base[0] - 9, base[1] - 9]];
    for (const f of fires) {
      const y = W.heightAt(f[0], f[1]);
      const fl = 0.6 + 0.4 * Math.sin(t * 6.1 + f[0]);
      scene.addSprite(f[0], y + 3.2, f[1], 7.5, [1.0, 0.42, 0.10], 0.5 * fl);
      scene.addSprite(f[0] + 0.6, y + 5.5, f[1] + 0.3, 10.5, [1.0, 0.30, 0.06], 0.28 * fl);
      for (let i = 0; i < 4; i++) {
        const yy = y + 6 + i * 3.2;
        scene.addSoft(f[0] + Math.sin(t * 0.4 + i) * 2.2, yy, f[1] + Math.cos(t * 0.3 + i) * 2.0, 14 + i * 4, COL.smoke, 0.09);
      }
    }
    if (cine.env === 'night') {
      for (let i = 0; i < 14; i++) {
        const x = base[0] + (rnd() - 0.5) * 70, z = base[1] + (rnd() - 0.5) * 70;
        const y = W.heightAt(x, z) + 2.5;
        scene.addSprite(x, y, z, 3.0, [1.0, 0.55, 0.2], 0.2 * (0.7 + rnd() * 0.5));
      }
    }
    if (cine.env === 'snow') {
      for (let i = 0; i < 200; i++) {
        const x = cam.target[0] + (rnd() - 0.5) * 90;
        const z = cam.target[2] + (rnd() - 0.5) * 90;
        const y = W.heightAt(x, z) + 3 + ((rnd() * 38 + t * 3.2) % 38);
        scene.addSoft(x, y, z, 0.22 + rnd() * 0.42, [0.92, 0.95, 1.0], 0.42);
      }
    }
    if (cine.env === 'dusk' || cine.env === 'dawn') {
      for (let i = 0; i < 6; i++) {
        scene.addSoft(cam.target[0] + (rnd() - 0.5) * 50, 4 + rnd() * 10, cam.target[2] + (rnd() - 0.5) * 50, 20, [0.55, 0.48, 0.40], 0.05);
      }
    }
  }

  /* ---------------- 测试 / 汇报钩子 ---------------- */
  C.totalDuration = function () {
    let s = 0;
    for (const c of D.CINEMATICS) for (const sh of c.shots) s += sh.dur;
    return s;
  };
  C.info = function () {
    return D.CINEMATICS.map((c, i) => ({
      index: i, id: c.id, title: c.title, date: c.date, place: c.place, env: c.env,
      duration: c.shots.reduce((a, s) => a + s.dur, 0),
      moves: c.shots.map((s) => s.move),
      voices: c.shots.reduce((a, s) => a + Math.max(1, (s.caption || []).length), 0)
    }));
  };
  C.voiceList = function () {
    const out = [];
    D.CINEMATICS.forEach((c, i) => {
      c.shots.forEach((s, si) => {
        const n = Math.max(1, (s.caption || []).length);
        for (let ci = 0; ci < n; ci++) out.push({ file: voiceName(c, si, ci), text: s.caption[ci].text, index: i, shot: si, t: s.caption[ci].t });
      });
    });
    return out;
  };
  C.seek = function (idx, si, p) {
    const cine = D.CINEMATICS[idx];
    if (!cine) return;
    const s = cine.shots[si];
    C.state.active = true; C.state.idx = idx; C.state.shot = si;
    C.state.shotT = clamp(p, 0, 0.999) * s.dur;
    C.state.t = cine.shots.slice(0, si).reduce((a, x) => a + x.dur, 0) + C.state.shotT;
    C.state.segStart = performance.now();
    V.disabled = !!(HX.Audio && HX.Audio.muted && HX.Audio.muted());
    HX.UI.setScreen('cine_screen');
    $('cineKicker').textContent = cine.date + ' · ' + cine.place;
    $('cineH1').textContent = cine.title;
    $('cineSub').textContent = cine.date + ' · ' + cine.place;
    $('cineSubInfo').textContent = cine.date + ' · ' + cine.place + ' · 镜头 ' + (si + 1) + ' / ' + cine.shots.length + ' · 本机合成旁白（机械音质）';
    $('cineTitle').style.opacity = '0';
    $('cineFade').style.opacity = '0';
    C.applyShotUI(cine, si);
    if (C.render) C.render();
  };
  C.resetAv = function () { V.logs.length = 0; V.failed = {}; };
  C.avReport = function () {
    const logs = V.logs.slice();
    const sched = logs.filter((l) => l.schedMs != null).map((l) => Math.abs(l.schedMs));
    const lat = logs.filter((l) => l.latMs != null).map((l) => l.latMs);
    const mean = (a) => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null;
    const max = (a) => a.length ? +Math.max.apply(null, a).toFixed(2) : null;
    return {
      entries: logs.length, schedMeanMs: mean(sched), schedMaxMs: max(sched),
      latencyMeanMs: mean(lat), latencyMaxMs: max(lat),
      muted: V.disabled, failed: Object.keys(V.failed), logs: logs
    };
  };
  C.debug = function () {
    const st = C.state;
    const cine = D.CINEMATICS[st.idx];
    const shot = cine && cine.shots[st.shot];
    return {
      active: st.active, idx: st.idx, shot: st.shot, move: shot && shot.move,
      shotT: +st.shotT.toFixed(2), dur: shot && shot.dur, total: C.totalDuration(),
      date: cine && cine.date, place: cine && cine.place
    };
  };
})();
