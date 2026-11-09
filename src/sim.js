/* ==========================================================================
   战役推演：半即时（1 tick = 1 模拟小时）
   - 玩家可自由偏离史实，系统按兵力/补给/铁路/士气等硬约束推演
   - 敌军 AI 只使用自身侦察/接触所得信息，不开图
   ========================================================================== */
(function () {
  const HX = (window.HX = window.HX || {});
  const D = HX.DATA, U = HX.U, W = HX.World;
  const S = (HX.Sim = {});

  S.SPEEDS = [0, 8, 16, 32]; // 0 暂停；其余为「模拟小时 / 现实秒」
  const MAIN_IDS = ['k7', 'k12', 'k2', 'k13', 'k16'];
  const KM = (D.GEO && D.GEO.unitKm) || 0.8; // 1 世界单位 = 0.8 km（等距压缩，见 D.GEO）
  const SUPPLY_R = 60; // 补给半径（世界单位）≈ 48 km
  // 紧迫档的历史时间窗（自战役发起的累计小时）：11.22 / 12.15 / 1949.01.10
  const PHASE_DEADLINES = [384, 936, 1560];

  /* 碾庄圩外壕（独立障碍类，不可徒涉）——显式常量，README §11.2 同步
     史实：外壕宽 30–50 m、深约 2 m，土圩高出地面 2–3 m；跨壕只能架桥/爆破/坑道逼近
     routeMul 0.36 → 跨壕行军耗时 ×2.8（1/0.36≈2.78）
     未破壕强攻：我方伤亡 ×2.4、对敌杀伤 ×0.55、第一人称时限 150s→90s
     近迫作业累计 72 模拟小时（对应史实 11.11 合围 → 11.19 总攻） */
  const MOAT = (S.MOAT = {
    routeMul: 0.36, timeMul: 2.8, casMul: 2.4, dmgMul: 0.55,
    prepHours: 72, assaultLimit: 90, assaultHP: 80
  });

  const clamp = U.clamp;
  const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

  /* 指挥员参数 → 可被行为逻辑读取的 cmd 对象（1–5 档，缺省中性 3） */
  const NEUTRAL = { init: 3, aggr: 3, caut: 3, siege: 3, block: 3, infil: 3, coord: 3, cas: 3, report: 3, temper: 2 };
  function cmdFromProfile(name) {
    const pr = (D.CMDR_PROFILES && D.CMDR_PROFILES[name]) || NEUTRAL;
    return {
      name, profile: pr,
      init: pr.init, aggr: pr.aggr, caut: pr.caut, siege: pr.siege, block: pr.block,
      infil: pr.infil, coord: pr.coord, casSens: pr.cas, report: pr.report, temper: pr.temper,
      opinion: '待命', request: null, lastAsk: -99, deviations: 0,
      planBonus: 0, proposed: false, lastDeviate: -99
    };
  }


  function power(u, def) {
    const s = Math.max(0, u.strength) / 10000;
    const m = 0.45 + 0.55 * clamp(u.morale, 0, 100) / 100;
    const a = 0.55 + 0.45 * clamp(u.ammo, 0, 100) / 100;
    const f = 1 - 0.32 * clamp(u.fatigue, 0, 100) / 100;
    const e = 1 + 0.12 * (u.entrench || 0) * (def ? 1 : 0.35);
    return Math.max(0.05, s * m * a * f * e);
  }

  function log(sim, text, kind, src) {
    sim.logs.unshift({ t: sim.t, text, kind: kind || 'sys', src: src || '', freshUntil: sim.t + 8 });
    if (sim.logs.length > 120) sim.logs.length = 120;
  }
  S.log = log;

  function event(sim, type, payload) {
    sim.events.push(Object.assign({ type, t: sim.t }, payload || {}));
    if (sim.events.length > 40) sim.events.shift();
  }
  S.event = event;

  /* 交战表现事件层：只由 sim 的真实结算（伤亡/炮火/合围扇区/接敌）触发，
     渲染层只做「读事件 + 呈现」，不自己造特效。 */
  function fxEvent(sim, kind, o) {
    sim.fx.push(Object.assign({ i: ++sim.fxSeq, kind, t: sim.t }, o || {}));
    if (sim.fx.length > 260) sim.fx.splice(0, sim.fx.length - 260);
  }
  S.fxEvent = fxEvent;

  function dateLabel(t) {
    const day = Math.floor(t / 24);
    const mmdd = new Date(Date.UTC(1948, 10, 6));
    mmdd.setUTCDate(mmdd.getUTCDate() + day);
    const mo = String(mmdd.getUTCMonth() + 1).padStart(2, '0');
    const da = String(mmdd.getUTCDate()).padStart(2, '0');
    const hh = String(Math.floor((t % 24) / 2) * 2).padStart(2, '0');
    return `${mmdd.getUTCFullYear() === 1948 ? '1948' : '1949'}.${mo}.${da} ${hh}:00`;
  }
  S.dateLabel = dateLabel;

  /* ---------------- 创建 ---------------- */
  S.create = function () {
    const sim = {
      t: 0, speed: 0, running: false, ended: false, outcome: null,
      pace: 0, phaseReady: 0, phaseStart: 0, deadlineHits: [], deadlines: {},
      pla: [], kmt: [], selected: [], intel: {},
      logs: [], events: [], divergences: [], flags: {},
      enemyLog: [], situations: [],
      casualties: { pla: 0, kmt: 0 },
      phase: 1, gapOpen: false, transfer: false,
      battles: 0, lastRadio: 0, railCut: false,
      rng: U.rng(660066), supplyCut: false,
      routeLog: [], autonomy: true, auth: 1, requests: [], cmdReview: null, reqSeq: 0,
      fx: [], fxSeq: 0
    };
    for (const u of D.PLA_UNITS) {
      sim.pla.push(Object.assign({}, u, {
        x: u.x, z: u.z, y: W.heightAt(u.x, u.z), s0: u.strength,
        strength: u.strength, entrench: 0, order: null, dest: null,
        surrounded: false, engaged: false, dead: false, supplied: true,
        scoutTarget: null, origin: { x: u.x, z: u.z },
        path: null, pathIndex: 0, routeOriginal: null, routeActual: null,
        reroute: null, lastReroute: -99, halted: false, supplyDetour: false,
        supplyReason: '', supplyDepot: null,
        cmd: cmdFromProfile(u.cmdr)
      }));
    }
    for (const k of D.KMT_UNITS) {
      sim.kmt.push(Object.assign({}, k, {
        x: k.x, z: k.z, y: W.heightAt(k.x, k.z), s0: k.strength, strength: k.strength,
        alive: true, surrounded: false, contact: false, dest: null, order: null,
        known: [], retreat: false, entrench: 1, lastContact: 99, escaped: false,
        surrender: 0, sectors: new Array(8).fill(0), cover: 0
      }));
      sim.intel[k.id] = { x: k.x, z: k.z, strength: k.strength, time: 0, conf: 42, source: '战役前概估' };
    }
    log(sim, '战役发起。华野主力自临沂、郯城一线出击，向新安镇、碾庄方向急进。', 'sys', '战役指挥部');
    log(sim, '中野主力自豫西东进，目标指向宿县、蒙城方向。', 'sys', '战役指挥部');
    log(sim, '情报：第7兵团正由新安镇向碾庄收缩，第2、第13兵团有东援迹象。', 'intel', '野司情报处');
    return sim;
  };

  /* ---------------- 时间推进 ---------------- */
  S.update = function (sim, dtReal) {
    if (sim.ended || !sim.running) return;
    const hours = Math.min(0.6, dtReal) * S.SPEEDS[sim.speed];
    if (hours <= 0) return;
    let left = hours;
    let guard = 0;
    while (left > 1e-5 && guard++ < 40) {
      const h = Math.min(1, left);
      tick(sim, h);
      left -= h;
      if (sim.ended) break;
    }
  };

  function tick(sim, h) {
    sim.t += h;
    weather(sim);
    plaMove(sim, h);
    kmtAI(sim, h);
    kmtMove(sim, h);
    encirclement(sim);
    enemyReactions(sim, h);
    moatPrep(sim, h);
    combat(sim, h);
    supply(sim, h);
    intelUpdate(sim, h);
    routeAdjust(sim, h);
    commanders(sim, h);
    checkDeadlines(sim);
    checkMilestones(sim);
    checkEnding(sim);
  }

  function weather(sim) {
    const day = Math.floor(sim.t / 24);
    const table = ['晴', '多云', '阴', '小雨', '雨夹雪', '大雪', '晴'];
    sim.weather = table[(day + 1) % table.length];
    if (sim.weather === '大雪' || sim.weather === '雨夹雪') {
      sim.flags.weatherPenalty = 1;
    } else sim.flags.weatherPenalty = 0;
  }

  /* ---------------- 移动 ---------------- */
  function plaMove(sim, h) {
    const snow = sim.flags.weatherPenalty ? 0.78 : 1;
    for (const p of sim.pla) {
      if (p.dead || p.strength <= 0) continue;
      const o = p.order;
      // 手绘路线：按折点逐段推进；被自主/严格模式叫停时不再前进
      if (p.path && p.pathIndex < p.path.length) {
        if (p.halted) { p.dest = null; continue; }
        p.dest = { x: p.path[p.pathIndex][0], z: p.path[p.pathIndex][1] };
      }
      // 包围/进攻的落点是相对敌军实时的，敌军移动时部队随之调整
      const dynamic = o && o.kmtId && (o.type === 'encircle' || o.type === 'attack');
      if (dynamic) {
        const k = sim.kmt.find((x) => x.id === o.kmtId && x.alive);
        if (!k) { p.order = null; p.dest = null; continue; }
        const r = (o.type === 'attack' ? 6.5 : 10.5) * (k.surrounded ? 0.85 : 1);
        p.dest = { x: k.x + Math.cos(o.ang || 0) * r, z: k.z + Math.sin(o.ang || 0) * r };
      }
      if (!p.dest) continue;
      const d = dist(p.x, p.z, p.dest.x, p.dest.z);
      if (d < 0.7) {
        p.x = p.dest.x; p.z = p.dest.z; p.y = W.heightAt(p.x, p.z);
        if (p.path && p.pathIndex < p.path.length) {
          p.routeActual = p.routeActual || [[p.x, p.z]];
          p.routeActual.push([p.x, p.z]);
          p.pathIndex++;
          if (p.pathIndex >= p.path.length) {
            p.dest = null;
            if (p.order && p.order.type === 'move') {
              p.order.arrived = true;
              log(sim, `${p.short} 已沿手绘路线到位（${dateLabel(sim.t)}）。`, 'route', p.short);
              event(sim, 'toast', { text: `${p.short} 已到位`, kind: 'good' });
            }
          } else {
            p.dest = { x: p.path[p.pathIndex][0], z: p.path[p.pathIndex][1] };
          }
          continue;
        }
        if (o) {
          o.arrived = true;
          if (o.type === 'scout') doScout(sim, p, o);
          if (o.type === 'encircle') p.entrench = Math.max(p.entrench, 1);
        }
        if (!dynamic) p.dest = null;
        continue;
      }
      const spd = 1.25 * (1 - 0.42 * p.fatigue / 100) * snow * (p.ammo < 12 ? 0.85 : 1)
        * (sim.auth === 0 ? 0.9 : sim.auth === 2 ? 1.06 : 1) * travelMul(p.x, p.z);
      const step = Math.min(d, spd * h);
      p.x += (p.dest.x - p.x) / d * step;
      p.z += (p.dest.z - p.z) / d * step;
      p.y = W.heightAt(p.x, p.z);
      if (p.path) {
        const ra = p.routeActual || (p.routeActual = [[p.x, p.z]]);
        const last = ra[ra.length - 1];
        if (dist(last[0], last[1], p.x, p.z) > 6 && ra.length < 90) ra.push([p.x, p.z]);
      }
      p.fatigue = Math.min(100, p.fatigue + 0.055 * h);
      p.entrench = Math.max(0, p.entrench - 0.02 * h);
    }
  }

  function kmtMove(sim, h) {
    const snow = sim.flags.weatherPenalty ? 0.82 : 1;
    for (const k of sim.kmt) {
      if (!k.alive || !k.dest) continue;
      const d = dist(k.x, k.z, k.dest.x, k.dest.z);
      if (d < 1.0) { k.dest = null; continue; }
      const spd = 1.05 * (1 - 0.4 * k.fatigue / 100) * snow * (k.surrounded ? 0.35 : 1);
      const step = Math.min(d, spd * h);
      let nx = k.x + (k.dest.x - k.x) / d * step;
      let nz = k.z + (k.dest.z - k.z) / d * step;
      // 不许穿过玩家部队：相遇即停下交战
      for (const p of sim.pla) {
        if (p.dead || p.strength <= 0) continue;
        if (dist(nx, nz, p.x, p.z) < 4.2) { nx = k.x; nz = k.z; break; }
      }
      k.x = nx; k.z = nz; k.y = W.heightAt(k.x, k.z);
      k.fatigue = Math.min(100, k.fatigue + 0.05 * h);
    }
  }

  /* ---------------- 敌军 AI（只用自己的侦察/接触信息） ---------------- */
  function kmtAIPerception(sim, k) {
    // 直接接触：14 单位内
    const seen = [];
    for (const p of sim.pla) {
      if (p.dead || p.strength <= 0) continue;
      const d = dist(p.x, p.z, k.x, k.z);
      if (d < 15) {
        seen.push({ id: p.id, x: p.x, z: p.z, strength: p.strength, d, conf: 90 });
      }
    }
    // 旧情报（俘虏/侦察），可信度衰减
    k.known = k.known.filter((o) => sim.t - o.time < 30);
    for (const p of sim.pla) {
      if (seen.some((s) => s.id === p.id)) continue;
      const old = k.known.find((o) => o.id === p.id);
      if (old) seen.push(old);
    }
    k.known = seen.map((s) => ({ id: s.id, x: s.x, z: s.z, strength: s.strength, time: sim.t, conf: s.conf }));
    return seen;
  }

  function kmtAI(sim, h) {
    if (sim.t >= 47 && sim.t < 49 && sim.flags.defect === undefined) {
      sim.flags.defect = 1;
      const k3 = sim.kmt.find((k) => k.id === 'k3s');
      if (k3 && k3.alive) {
        k3.alive = false; k3.strength = 0; k3.surrender = 1; k3.defected = true;
        log(sim, '第三绥靖区一部在贾汪、台儿庄一线起义，运河防线出现缺口。', 'sys', '野司');
      }
    }
    for (const k of sim.kmt) {
      if (!k.alive) continue;
      const seen = kmtAIPerception(sim, k);
      k.contact = seen.length > 0;
      const k7 = sim.kmt.find((x) => x.id === 'k7');
      if (k.id === 'k7') {
        if (!k.surrounded) k.dest = { x: 68, z: -5.6 };
        else if (reliefNear(sim, k, 28)) k.dest = { x: 44, z: -2.8 }; // 强行突围
        else k.dest = null; // 固守待援
      } else if (k.id === 'k2' || k.id === 'k13') {
        if (k7 && k7.alive) {
          if (k7.surrounded) {
            // 找阻击线上的薄弱 PLA 突击
            const weak = weakestPlatoon(sim, k, seen);
            k.dest = weak ? { x: weak.x, z: weak.z } : { x: 68, z: -5.6 };
          } else k.dest = { x: 43.8, z: -2.8 };
        } else k.dest = { x: 0, z: 0 };
      } else if (k.id === 'k12') {
        if (k.surrounded) k.dest = null;
        else {
          const weak = weakestPlatoon(sim, k, seen);
          if (weak && Math.hypot(weak.x - k.x, weak.z - k.z) < 26) k.dest = { x: weak.x, z: weak.z };
          else k.dest = { x: -23.1, z: 87.6 };
        }
      } else if (k.id === 'k16' || k.id === 'kzu') {
        // 事件驱动：第12兵团被围（或被歼）且宿县铁路已断，才考虑西撤；
        // 是否真的西撤由 enemyReactions 的延迟情报决定（西南通道被封锁则就地固守/改向东南）
        const k12 = sim.kmt.find((x) => x.id === 'k12');
        const k12Down = !k12 || !k12.alive || k12.surrounded;
        const retreatNow = k12Down && sim.railCut && xuzhouThreatened(sim);
        if (retreatNow && !k.reactMode) { k.retreat = true; k.dest = { x: -68, z: 36.1 }; }
        else if (!k.reactMode) k.dest = null;
      } else if (k.id === 'k6') {
        k.dest = { x: -10, z: 105 };
        if (k.contact) {
          const weak = weakestPlatoon(sim, k, seen);
          if (weak) k.dest = { x: weak.x, z: weak.z };
        }
      } else if (k.id === 'k8') {
        k.dest = { x: 24.2, z: 160 };
      } else if (k.id === 'k3s') {
        k.dest = null;
      } else {
        k.dest = null;
      }
      // 事件驱动的反应覆盖固定编队动作（见 enemyReactions）
      if (k.reactMode) {
        if (k.reactMode === 'retreatSW') k.dest = k.retreatTarget || { x: -68, z: 36.1 };
        else if (k.reactMode === 'breakoutSE') k.dest = k.breakoutTarget || { x: 8, z: 133 };
        else k.dest = null;
        if (k.reactMode === 'hedgehog' || k.reactMode === 'hold') {
          k.entrench = Math.min(8, (k.entrench || 0) + 0.25 * h);
        }
      }
      if (k.surrounded) {
        k.morale = Math.max(0, k.morale - 0.32 * h);
        const squeeze = 0.0030 * h * (1 + (sim.gapOpen && ['k2', 'k13', 'k16', 'kzu'].includes(k.id) ? -0.95 : 0));
        k.strength = Math.max(0, k.strength - k.strength * squeeze);
        sim.casualties.kmt += k.strength * squeeze;
        if (k.morale < 22 && sim.rng() < 0.018 * h) {
          const ss = k.strength * (0.15 + sim.rng() * 0.2);
          k.strength -= ss; k.surrender += ss; sim.casualties.kmt += ss;
          log(sim, `${k.short} 出现成建制投降，约 ${Math.round(ss)} 人放下武器。`, 'battle', '前沿战报');
        }
      } else {
        k.morale = Math.min(100, k.morale + 0.06 * h);
      }
      if (k.strength <= k.s0 * 0.03 || k.strength < 500) destroyKMT(sim, k);
    }
    // 南线阻援是否被突破
    if (!sim.flags.southBroken) {
      const k6 = sim.kmt.find((k) => k.id === 'k6');
      if (k6 && k6.alive && k6.z < 110) {
        sim.flags.southBroken = 1;
        addDivergence(sim, 'D6');
        log(sim, '南线阻击被突破！李延年兵团越过浍河，向宿县方向推进。', 'battle', '南线阻援集团');
      }
    }
  }

  function weakestPlatoon(sim, k, seen) {
    let best = null, bs = 1e9;
    for (const s of seen) {
      if (s.strength < bs) { bs = s.strength; best = s; }
    }
    return best;
  }

  function reliefNear(sim, k, r) {
    for (const x of sim.kmt) {
      if (!x.alive || x === k) continue;
      if ((x.id === 'k2' || x.id === 'k13') && dist(x.x, x.z, k.x, k.z) < r) return true;
    }
    return false;
  }

  function xuzhouThreatened(sim) {
    for (const p of sim.pla) {
      if (!p.dead && p.strength > 0 && dist(p.x, p.z, 0, 0) < 38) return true;
    }
    return false;
  }

  /* ---------------- 包围判定 ---------------- */
  function encirclement(sim) {
    for (const k of sim.kmt) {
      if (!k.alive) { k.surrounded = false; continue; }
      const sectors = new Array(8).fill(0);
      for (const p of sim.pla) {
        if (p.dead || p.strength <= 0) continue;
        const d = dist(p.x, p.z, k.x, k.z);
        if (d > 20) continue;
        const a = Math.atan2(p.z - k.z, p.x - k.x);
        const idx = Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4));
        sectors[idx] = 1;
      }
      const covered = sectors.reduce((a, b) => a + b, 0);
      const was = k.surrounded, wasCover = k.cover || 0;
      k.sectors = sectors;
      k.cover = covered;
      k.surrounded = covered >= 5;
      if (covered !== wasCover) {
        fxEvent(sim, 'sector', { x: k.x, z: k.z, kmt: k.id, cover: covered, prev: wasCover, sectors: sectors.slice() });
      }
      if (k.surrounded && !was) {
        log(sim, `${k.short} 已被合围（${covered}/8 扇区封锁），补给通道中断。`, 'battle', '野司');
        event(sim, 'toast', { text: `${k.short} 已被合围`, kind: 'good' });
        fxEvent(sim, 'closing', { x: k.x, z: k.z, kmt: k.id, cover: covered });
      }
      if (!k.surrounded && was) log(sim, `${k.short} 的包围圈被打开缺口。`, 'battle', '前沿战报');
    }
  }

  /* ---------------- 敌军事件驱动（只用自己的延迟情报） ----------------
     玩家部署每 3 小时采样一次，敌军读取的是 delayH 小时前的快照，
     且扇区数含 ±1 情报误差；条件需持续 sustainH 小时才转为行动。
     追溯依据见 D.KMT_REACTIONS 与 README §11.2.3。 */
  const SW_CORRIDOR = [[-6, 6], [-20, 13], [-36, 21], [-52, 28], [-64, 33]];
  const SE_CORRIDOR = [[-24, 126], [-10, 130], [4, 133], [18, 136]];

  function corridorBlocked(sim, pts) {
    let covered = 0;
    for (const q of pts) {
      for (const p of sim.pla) {
        if (p.dead || p.strength <= 1200) continue;
        if (dist(p.x, p.z, q[0], q[1]) < 8.5) { covered++; break; }
      }
    }
    return covered >= 2;
  }

  function measurePosture(sim, k) {
    const sectors = new Array(8).fill(0);
    let n = 0, tight = 0;
    for (const p of sim.pla) {
      if (p.dead || p.strength <= 0) continue;
      const d = dist(p.x, p.z, k.x, k.z);
      if (d > 24) continue;
      n++; tight += d;
      const a = Math.atan2(p.z - k.z, p.x - k.x);
      sectors[Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4))] = 1;
    }
    const raw = sectors.reduce((a, b) => a + b, 0);
    const err = sim.rng() < 0.25 ? (sim.rng() < 0.5 ? -1 : 1) : 0;
    return {
      t: sim.t,
      cover: Math.max(0, Math.min(8, raw + err)),
      rawCover: raw,
      n,
      tight: n ? +(tight / n).toFixed(1) : 99,
      swBlocked: corridorBlocked(sim, SW_CORRIDOR),
      seBlocked: corridorBlocked(sim, SE_CORRIDOR),
      conf: Math.round(D.ENEMY_INTEL.confBase + sim.rng() * D.ENEMY_INTEL.confVar)
    };
  }

  function delayedSituation(sim, id) {
    const delay = D.ENEMY_INTEL.delayH[id] || 4;
    for (let i = sim.situations.length - 1; i >= 0; i--) {
      const s = sim.situations[i];
      if (s.t <= sim.t - delay && s.snap[id]) return Object.assign({ age: sim.t - s.t }, s.snap[id]);
    }
    return null;
  }

  function recordReaction(sim, r, k, view) {
    const rec = {
      t: sim.t, date: dateLabel(sim.t), id: r.id,
      kmt: k ? k.id : (r.kmt || []).join(','), name: r.name,
      condition: r.trigger, source: r.source, effect: r.effect,
      intelAge: view ? +view.age.toFixed(1) : null,
      intelConf: view ? view.conf : null,
      cover: view ? view.cover : null,
      swBlocked: view ? view.swBlocked : null
    };
    sim.enemyLog.unshift(rec);
    if (sim.enemyLog.length > 40) sim.enemyLog.length = 40;
    log(sim, `敌军反应：${k ? k.short : ''}${r.name}（情报滞后 ${rec.intelAge} 小时，可信度 ${rec.intelConf}%）。`, 'enemy', '敌军动向');
    event(sim, 'kmtReaction', { id: r.id, name: r.name, kmt: rec.kmt, intelAge: rec.intelAge });
  }

  function enemyReactions(sim, h) {
    const EI = D.ENEMY_INTEL;
    if (sim.t - (sim.flags.snapT == null ? -999 : sim.flags.snapT) >= EI.snapEvery) {
      sim.flags.snapT = sim.t;
      const snap = {};
      for (const k of sim.kmt) if (k.alive) snap[k.id] = measurePosture(sim, k);
      sim.situations.push({ t: sim.t, snap });
      if (sim.situations.length > 32) sim.situations.shift();
    }
    const k12 = sim.kmt.find((k) => k.id === 'k12');
    const view12 = k12 && k12.alive ? delayedSituation(sim, 'k12') : null;
    if (k12 && k12.alive && view12) reactHuangwei(sim, k12, view12, h);
    if (k12 && k12.alive) liaoReaction(sim, k12, view12, h);
    const kzu = sim.kmt.find((k) => k.id === 'kzu');
    if (kzu && kzu.alive) {
      const view = delayedSituation(sim, 'kzu');
      if (view) reactXuzhou(sim, view, h);
    }
  }

  function reactHuangwei(sim, k, view, h) {
    const EI = D.ENEMY_INTEL;
    let want = null;
    if (k.surrounded && view.cover >= 7) want = 'hedgehog';
    else if (!k.surrounded && view.n >= 3 && view.cover <= 4) want = 'breakoutSE';
    else if (k.reactMode === 'breakoutSE' && view.cover >= 7) want = 'hedgehog';
    if (!want || want === k.reactMode) { k.pendingMode = null; k.pendingT = 0; return; }
    if (k.pendingMode !== want) { k.pendingMode = want; k.pendingT = 0; }
    k.pendingT = (k.pendingT || 0) + h;
    if (k.pendingT < EI.sustainH) return;
    k.pendingMode = null; k.pendingT = 0;
    k.reactMode = want;
    if (want === 'hedgehog') {
      k.dest = null;
      k.entrench = Math.min(8, (k.entrench || 0) + 1.5);
      recordReaction(sim, D.REACTION_OF.huangwei_hedgehog, k, view);
    } else {
      k.dest = { x: 8, z: 133 };
      k.breakoutTarget = { x: 8, z: 133 };
      recordReaction(sim, D.REACTION_OF.huangwei_breakout_se, k, view);
    }
  }

  function applyXuzhouMode(sim, mode) {
    const OFF = { kzu: [0, 0], k2: [3, -2], k13: [-3, 2], k16: [0, 3] };
    for (const id of ['kzu', 'k2', 'k13', 'k16']) {
      const k = sim.kmt.find((x) => x.id === id);
      if (!k || !k.alive) continue;
      const o = OFF[id];
      k.reactMode = mode;
      if (mode === 'retreatSW') {
        k.dest = { x: -68 + o[0], z: 36.1 + o[1] };
        k.retreatTarget = k.dest;
        k.retreat = true;
      } else if (mode === 'breakoutSE') {
        k.dest = { x: 8 + o[0], z: 132 + o[1] };
        k.breakoutTarget = k.dest;
      } else {
        k.dest = null;
        k.hold = true;
      }
    }
  }

  function reactXuzhou(sim, view, h) {
    if (sim.flags.xuzhouMode) return;
    const k12 = sim.kmt.find((k) => k.id === 'k12');
    const k12Down = !k12 || !k12.alive || k12.surrounded;
    if (!k12Down || !sim.railCut) return;
    const kzu = sim.kmt.find((k) => k.id === 'kzu');
    let want;
    if (kzu && kzu.surrounded) want = 'hold';           // 已被围住，原地固守
    else if (view.swBlocked) want = view.seBlocked ? 'hold' : 'breakoutSE';
    else want = 'retreatSW';
    sim.flags.xuzhouMode = want;
    sim.flags.xuzhouIntelAge = +view.age.toFixed(1);
    applyXuzhouMode(sim, want);
    const rid = { retreatSW: 'xuzhou_retreat_sw', hold: 'xuzhou_hold', breakoutSE: 'xuzhou_breakout_se' }[want];
    recordReaction(sim, D.REACTION_OF[rid], kzu, view);
  }

  function liaoReaction(sim, k, view, h) {
    if (sim.flags.liaoDefect || sim.flags.liaoChecked) return;
    if (sim.t < 504) return;
    if (view && k.surrounded && view.cover >= 5) {
      sim.flags.liaoDefect = 1;
      sim.flags.liaoGap = 1;
      sim.flags.liaoChecked = 1;
      const loss = Math.min(6000, Math.max(0, k.strength - 500));
      k.strength -= loss;
      k.morale = Math.max(0, k.morale - 12);
      k.entrench = Math.max(0, (k.entrench || 0) - 2);
      recordReaction(sim, D.REACTION_OF.liao_defect, k, view);
      log(sim, `第110师（廖运周）在双堆集战场倒向，第12兵团减员约 ${Math.round(loss)} 人，防线出现缺口。`, 'battle', '野司');
      return;
    }
    if (sim.t >= 516) {
      sim.flags.liaoChecked = 1;
      sim.flags.liaoMissed = 1;
      const r = D.REACTION_OF.liao_defect;
      sim.enemyLog.unshift({
        t: sim.t, date: dateLabel(sim.t), id: 'liao_defect', kmt: 'k12', name: r.name,
        status: 'not_triggered', condition: '到历史时点时第12兵团尚未合围（封锁 <5/8 扇区）',
        source: r.source, effect: '未发生倒向',
        intelAge: view ? +view.age.toFixed(1) : null, intelConf: view ? view.conf : null,
        cover: view ? view.cover : null, swBlocked: view ? view.swBlocked : null
      });
      log(sim, '情报：第110师内部不稳，但第12兵团尚未合围，廖运周部未倒向。', 'intel', '敌军动向');
    }
  }


  function moatPrep(sim, h) {
    const k7 = sim.kmt.find((x) => x.id === 'k7');
    if (!k7 || !k7.alive || !k7.surrounded || sim.flags.nzMoatBroken) return;
    const sappers = sim.pla.filter((p) => !p.dead && p.order &&
      (p.order.type === 'attack' || p.order.type === 'encircle') &&
      dist(p.x, p.z, k7.x, k7.z) < 16);
    if (!sappers.length) return;
    sim.flags.nzMoatPrep = (sim.flags.nzMoatPrep || 0) + h;
    if (sim.flags.nzMoatPrep >= MOAT.prepHours) {
      sim.flags.nzMoatBroken = 1;
      log(sim, '碾庄圩外壕已完成坑道逼近与爆破，突击通道打开；此后总攻不再受跨壕惩罚。', 'battle', '野司工兵');
      event(sim, 'toast', { text: '碾庄外壕已破，突击通道打开', kind: 'good' });
    }
  }

  /* ---------------- 战斗 ---------------- */
  function combat(sim, h) {
    for (const p of sim.pla) {
      if (p.dead || p.strength <= 0) continue;
      let best = null, bd = 9;
      for (const k of sim.kmt) {
        if (!k.alive) continue;
        const d = dist(k.x, k.z, p.x, p.z);
        if (d < bd) { bd = d; best = k; }
      }
      if (!best) { p.engaged = false; continue; }
      const wasEngaged = p.engaged;
      p.engaged = true;
      if (!wasEngaged) {
        fxEvent(sim, 'contact', { x: p.x, z: p.z, tx: best.x, tz: best.z, kmt: best.id, unit: p.id, short: p.short });
      }
      const artNear = artilleryNear(sim, p);
      const atk = power(p, false) + artNear;
      const def = power(best, true);
      const ratio = atk / (def + 0.01);
      const cmd = p.cmd || {};
      let kMul = 1, pMul = 1;
      // 性格参数实际进入结算：攻坚/穿插影响进攻效率，阻击韧性影响防守代价
      if (p.order && p.order.type === 'attack') {
        kMul += 0.05 * ((cmd.siege || 3) - 3);
        if ((cmd.infil || 3) >= 4 && best.surrounded) kMul += 0.06;
      }
      if (p.order && p.order.type === 'block') pMul -= 0.06 * ((cmd.block || 3) - 1);
      const kLoss = clamp(0.0016 * ratio * kMul, 0.0004, 0.011);
      // 我方损失按“优势兵力下仍会付出代价”的基线调低，使全役伤亡接近史实量级
      const pLoss = clamp(0.00055 / Math.max(0.35, ratio), 0.00015, 0.0045)
        * (1 - Math.min(0.2, cmd.planBonus || 0)) * Math.max(0.55, pMul);
      const kk = best.strength * kLoss * h;
      const pp = p.strength * pLoss * h;
      best.strength = Math.max(0, best.strength - kk);
      p.strength = Math.max(0, p.strength - pp);
      sim.casualties.kmt += kk;
      sim.casualties.pla += pp;
      best.morale = Math.max(0, best.morale - 0.12 * h);
      p.morale = Math.max(0, p.morale - 0.06 * h);
      p.ammo = Math.max(0, p.ammo - 0.9 * h);
      p.fatigue = Math.min(100, p.fatigue + 0.12 * h);
      best.lastContact = sim.t;
      // 逐帧表现事件：由真实伤亡 kk/pp 与炮兵支援 artNear 驱动，按模拟时间节流
      // 用绝对值防御 sim.t 重置（如 debug 脚本手动归零、存档恢复回早期），避免节流标志残留挡住后续 fx
      if (kk + pp > 0 && Math.abs(sim.t - (sim.flags['fx' + best.id] || -99)) > 2.2) {
        sim.flags['fx' + best.id] = sim.t;
        const ang = Math.atan2(best.z - p.z, best.x - p.x);
        fxEvent(sim, 'fire', {
          x: p.x, z: p.z, tx: best.x, tz: best.z, side: 'pla',
          dmg: Math.round(kk), unit: p.id, kmt: best.id
        });
        if (artNear > 0) {
          fxEvent(sim, 'shell', {
            x: best.x + Math.cos(ang) * 1.2, z: best.z + Math.sin(ang) * 1.2,
            r: 2.2 + Math.min(2.2, Math.sqrt(Math.max(1, kk)) / 22),
            dmg: Math.round(kk), kmt: best.id
          });
        }
        fxEvent(sim, 'hit', {
          x: best.x, z: best.z, side: 'kmt', n: Math.round(kk),
          frac: best.s0 ? best.strength / best.s0 : 1, unit: best.id
        });
        best.lastHit = { t: sim.t, n: Math.round(kk) };
        if (pp > 0) {
          fxEvent(sim, 'hit', { x: p.x, z: p.z, side: 'pla', n: Math.round(pp), frac: p.strength / p.s0, unit: p.id });
          p.lastHit = { t: sim.t, n: Math.round(pp) };
        }
      }
      if (sim.t - (sim.flags['lastlog' + best.id] || -99) > 6) {
        sim.flags['lastlog' + best.id] = sim.t;
        log(sim, `与 ${best.short} 在 ${placeName(p.x, p.z)} 附近激战，敌我均有较大伤亡。`, 'battle', '前沿战报');
      }
      if (p.strength < p.s0 * 0.08) {
        p.dead = true;
        log(sim, `${p.name} 伤亡过重，被迫撤出战斗序列。`, 'battle', '野司');
      }
      if (best.strength < 500) destroyKMT(sim, best);
    }
  }

  function artilleryNear(sim, p) {
    let b = 0;
    for (const t of sim.pla) {
      if (t.dead) continue;
      if (t.role === '炮兵' && dist(t.x, t.z, p.x, p.z) < 16) b += 0.4 * (t.strength / 18000);
    }
    return Math.min(0.5, b);
  }

  function placeName(x, z) {
    let best = null, bd = 1e9;
    for (const c of D.CITIES) {
      const d = dist(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return bd < 22 && best ? best.name : `(${Math.round(x)},${Math.round(z)})`;
  }
  S.placeName = placeName;

  function destroyKMT(sim, k) {
    if (!k.alive) return;
    k.alive = false; k.strength = 0; k.surrounded = false;
    fxEvent(sim, 'destroyed', { x: k.x, z: k.z, kmt: k.id, short: k.short });
    const main = MAIN_IDS.includes(k.id);
    log(sim, `${k.name} 已被全歼。${main ? '这是本阶段的决定性胜利。' : ''}`, 'battle', '战报');
    event(sim, 'chapter', { id: k.id, name: k.name });
    event(sim, 'toast', { text: `${k.short} 被全歼`, kind: 'good' });
    if (main) S.recalcPhase(sim);
  }

  /* ---------------- 补给 ---------------- */
  function supply(sim, h) {
    // 津浦线被切断：任一华野/中野部队控制宿县（津浦线要点）即触发
    if (!sim.railCut) {
      const sux = D.CITIES.find((c) => c.id === 'suxian');
      if (sux) {
        for (const p of sim.pla) {
          if (!p.dead && dist(p.x, p.z, sux.x, sux.z) < 6.5) {
            sim.railCut = 1;
            log(sim, '我军控制宿县，徐州—蚌埠铁路联系被切断；徐州、蚌埠方向敌军补给受阻。', 'sys', '野司');
            break;
          }
        }
      }
    }
    for (const p of sim.pla) {
      if (p.dead) continue;
      let bestD = 1e9, nearDepot = null;
      for (const dp of D.DEPOTS.pla) {
        const dd = dist(p.x, p.z, dp.x, dp.z);
        if (dd < bestD) { bestD = dd; nearDepot = dp; }
      }
      let cut = false;
      for (const k of sim.kmt) {
        if (!k.alive) continue;
        // 敌军靠近补给通道中点
        const mx = (p.x + nearDepot.x) / 2, mz = (p.z + nearDepot.z) / 2;
        if (dist(k.x, k.z, mx, mz) < 14 || dist(k.x, k.z, p.x, p.z) < 6.5) cut = true;
      }
      p.supplied = bestD < SUPPLY_R && !cut;
      p.supplyDepot = nearDepot;
      p.supplyReason = p.supplied ? '' : (bestD >= SUPPLY_R ? '远离兵站' : '通道被切断');
      if (p.supplied) {
        p.ammo = Math.min(100, p.ammo + 0.42 * h);
        p.food = Math.min(100, p.food + 0.3 * h);
      } else {
        p.ammo = Math.max(0, p.ammo - 0.26 * h);
        p.food = Math.max(0, p.food - 0.2 * h);
        p.morale = Math.max(0, p.morale - 0.1 * h);
      }
      const o = p.order;
      if (o && o.type === 'rest') {
        p.fatigue = Math.max(0, p.fatigue - 1.25 * h);
        p.morale = Math.min(100, p.morale + 0.4 * h);
        p.entrench = Math.min(8, p.entrench + 0.5 * h);
      } else if (o && o.type === 'block') {
        p.entrench = Math.min(8, p.entrench + 0.32 * h);
      }
      if (!p.engaged && !o) p.fatigue = Math.max(0, p.fatigue - 0.35 * h);
      if (p.ammo < 15) p.morale = Math.max(0, p.morale - 0.18 * h);
      if (p.food < 15) p.morale = Math.max(0, p.morale - 0.22 * h);
    }
    for (const k of sim.kmt) {
      if (!k.alive) continue;
      if (k.surrounded) {
        k.ammo = Math.max(0, k.ammo - 0.7 * h);
        k.food = Math.max(0, k.food - 0.95 * h);
        k.morale = Math.max(0, k.morale - 0.18 * h);
      } else if (sim.railCut) {
        // 铁路被切断后，徐州、蚌埠方向只能靠有限的公路与空运补给
        k.ammo = Math.max(0, k.ammo - 0.14 * h);
        k.food = Math.max(0, k.food - 0.24 * h);
      } else {
        k.ammo = Math.min(100, k.ammo + 0.3 * h);
        k.food = Math.min(100, k.food + 0.35 * h);
      }
    }
    // 补给崩溃判定
    let total = 0, low = 0;
    for (const p of sim.pla) { if (!p.dead) { total++; if (p.ammo < 20 || p.food < 20) low++; } }
    sim.supplyCut = total > 0 && low / total > 0.6;
  }

  /* ---------------- 情报（延迟 + 可信度 + 来源） ---------------- */
  function intelUpdate(sim, h) {
    for (const p of sim.pla) {
      if (p.dead) continue;
      for (const k of sim.kmt) {
        if (!k.alive) continue;
        const d = dist(p.x, p.z, k.x, k.z);
        if (d < 13) {
          sim.intel[k.id] = { x: k.x, z: k.z, strength: k.strength, time: sim.t, conf: 94, source: '前沿接触' };
          if (!sim.flags['ct' + k.id]) {
            sim.flags['ct' + k.id] = 1;
            log(sim, `与我 ${k.short} 前卫接触，位置约 ${placeName(k.x, k.z)}，估计兵力 ${Math.round(k.strength / 10000 * 10) / 10} 万，可信度高。`, 'intel', '侦察分队');
          }
        }
      }
    }
    if (sim.t - sim.lastRadio > 8) {
      sim.lastRadio = sim.t;
      for (const k of sim.kmt) {
        if (!k.alive) continue;
        let near = false;
        for (const p of sim.pla) if (!p.dead && dist(p.x, p.z, k.x, k.z) < 46) near = true;
        if (near) {
          const old = sim.intel[k.id];
          sim.intel[k.id] = {
            x: k.x + (sim.rng() - 0.5) * 3, z: k.z + (sim.rng() - 0.5) * 3,
            strength: k.strength * (0.9 + sim.rng() * 0.2),
            time: sim.t - 2, conf: 68, source: '电话 / 电报'
          };
          if (!old || old.source !== '电话 / 电报') {
            log(sim, `野司通报：${k.short} 位于 ${placeName(k.x, k.z)} 附近，估计 ${Math.round(k.strength / 10000 * 10) / 10} 万，情报约 2 小时前。`, 'intel', '电话 / 电报');
          }
        }
      }
      const known = sim.kmt.filter((k) => k.alive && sim.t - sim.intel[k.id].time < 12).length;
      if (!sim.flags.radioOnce) {
        sim.flags.radioOnce = 1;
        log(sim, `野司情报：已确认 ${known} 个敌军兵团位置，其余为情报空白。`, 'intel', '野司情报处');
      }
    }
    // 情报老化提示
    for (const k of sim.kmt) {
      if (!k.alive) continue;
      const it = sim.intel[k.id];
      if (it && sim.t - it.time > 12 && !sim.flags['stale' + k.id]) {
        sim.flags['stale' + k.id] = 1;
        log(sim, `${k.short} 的情报已超过 12 小时未更新，可信度下降。`, 'intel', '情报处');
      }
    }
  }

  function doScout(sim, p, o) {
    let found = 0;
    for (const k of sim.kmt) {
      if (!k.alive) continue;
      if (dist(o.x, o.z, k.x, k.z) < 30) {
        sim.intel[k.id] = { x: k.x, z: k.z, strength: k.strength, time: sim.t - 1.5, conf: 82, source: '侦察分队' };
        found++;
      }
    }
    log(sim, `${p.short} 侦察分队抵达 ${placeName(o.x, o.z)}，发现 ${found} 个敌军目标（情报滞后约 1.5 小时）。`, 'intel', '侦察分队');
    event(sim, 'toast', { text: `侦察回报：${found} 个敌军目标`, kind: 'good' });
  }

  /* ---------------- 手绘路线与突发自主调整 ---------------- */
  function nearRoute(x, z, routes, r) {
    for (const pts of routes) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const l2 = dx * dx + dz * dz || 1;
        const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1);
        if (dist(x, z, a[0] + dx * t, a[1] + dz * t) < r) return true;
      }
    }
    return false;
  }
  function nearRail(x, z, r) { return nearRoute(x, z, D.RAILS.map((v) => v.pts), r); }
  function nearRoad(x, z, r) { return nearRoute(x, z, D.ROADS, r); }
  function travelMul(x, z) {
    if (nearRail(x, z, 2.4)) return 1.35;
    if (nearRoad(x, z, 2.4)) return 1.15;
    return 1;
  }

  function routeFactor(x1, z1, x2, z2) {
    let f = 1;
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    const onRail = nearRail(mx, mz, 2.4);
    const onRoad = nearRoad(mx, mz, 2.4);
    // 铁路是高机动通道；公路次之
    if (onRail) f *= 1.5;
    else if (onRoad) f *= 1.35;
    for (const c of D.CITIES) if (dist(mx, mz, c.x, c.z) < 3.2) f *= 0.82;
    // 冬季枯水期：主河道不可徒涉，只能走桥梁/铁路（无桥则大幅绕行减速）；小河可涉渡
    const main = W.mainRiverAt ? W.mainRiverAt(mx, mz, 3.2) : null;
    if (main) f *= (onRail || onRoad) ? 0.78 : 0.42;
    else if (W.riverDistance && W.riverDistance(mx, mz) < 2.4) f *= 0.9;
    // 碾庄圩外壕：不可徒涉；跨壕需架桥/爆破，行军耗时 ×2.8（MOAT.timeMul）
    if (W.nzMoatCross && W.nzMoatCross(x1, z1, x2, z2)) f *= MOAT.routeMul;
    const h1 = W.heightAt(x1, z1), h2 = W.heightAt(x2, z2);
    const dh = Math.abs(h2 - h1), dd = Math.max(0.1, dist(x1, z1, x2, z2));
    if (dh / dd > 0.07) f *= 0.78;
    return f;
  }
  S.pathInfo = function (points, unit) {
    const spd = 1.25 * (1 - 0.42 * (unit ? unit.fatigue : 0) / 100);
    let km = 0, hours = 0, roadKm = 0, riverKm = 0, railKm = 0;
    let px = unit ? unit.x : points[0][0], pz = unit ? unit.z : points[0][1];
    for (let i = 0; i < points.length; i++) {
      const nx = points[i][0], nz = points[i][1];
      const d = dist(px, pz, nx, nz);
      if (d < 0.01) continue;
      const f = routeFactor(px, pz, nx, nz);
      const rail = nearRail((px + nx) / 2, (pz + nz) / 2, 2.4);
      km += d * KM;
      hours += d / Math.max(0.35, spd * f);
      if (rail) railKm += d * KM;
      if (f >= 1.2) roadKm += d * KM;
      if (f < 0.9) riverKm += d * KM;
      px = nx; pz = nz;
    }
    return { km, hours, roadKm, riverKm, railKm };
  };
  S.setAutonomy = function (sim, v) {
    sim.autonomy = !!v;
    log(sim, sim.autonomy ? '指挥口径：允许部队在突发情况下自行调整（自主权优先）。' : '指挥口径：严格按路线执行，遇阻即停，等待你的决断。', 'sys', '粟裕');
  };
  S.clearRoute = function (sim, ids) {
    for (const id of ids) {
      const u = sim.pla.find((x) => x.id === id);
      if (!u) continue;
      u.path = null; u.pathIndex = 0; u.routeOriginal = null; u.routeActual = null;
      u.reroute = null; u.halted = false; u.rerouteThreat = null;
      if (u.order && u.order.type === 'move') u.order = null;
      u.dest = null;
    }
  };
  S.assignCommander = function (sim, unitId, name) {
    const u = sim.pla.find((x) => x.id === unitId);
    if (!u || !D.CMDR_PROFILES[name]) return false;
    u.cmdr = name;
    u.cmd = cmdFromProfile(name);
    log(sim, `指挥员调整：${u.short} 改由 ${name} 指挥（${D.CMDR_PROFILES[name].org}）。`, 'cmd', '粟裕');
    return true;
  };

  /* 玩家命令优先级最高：下属只能在硬条件下「申请」变更，绝不静默改航。
     授权档位只决定「是否停下来等批复」，不决定「能否绕过玩家意图」。 */
  function rerouteProposal(sim, p, reason) {
    if (!p.dest) return null;
    const d = dist(p.x, p.z, p.dest.x, p.dest.z) || 1;
    const dx = (p.dest.x - p.x) / d, dz = (p.dest.z - p.z) / d;
    let side = 1;
    if (p.rerouteThreat) {
      const ex = p.rerouteThreat.x - p.x, ez = p.rerouteThreat.z - p.z;
      side = (dx * ez - dz * ex) > 0 ? -1 : 1;
    }
    const detour = 9 + ((p.cmd ? p.cmd.init : 3) - 3) * 1.2 + ((p.cmd ? p.cmd.caut : 3) - 3) * 0.8;
    let x = p.x + dx * 5 + -dz * detour * side;
    let z = p.z + dz * 5 + dx * detour * side;
    if (reason.kind === 'supply' && p.supplyDepot) { x = p.supplyDepot.x; z = p.supplyDepot.z; }
    if (x < W.BOUNDS.minX + 8 || x > W.BOUNDS.maxX - 8 || z < W.BOUNDS.minZ + 8 || z > W.BOUNDS.maxZ - 8) {
      return { x: p.dest.x, z: p.dest.z };
    }
    return { x, z };
  }
  function fileRerouteRequest(sim, p, reason, to) {
    if (sim.requests.some((r) => r.unit === p.id && r.status === 'open' && r.type === 'reroute')) return false;
    const req = {
      id: 'rq' + (++sim.reqSeq), unit: p.id, short: p.short, cmdr: p.cmdr, type: 'reroute',
      text: `${reason.text}；申请经绕行点（${Math.round(to.x)},${Math.round(to.z)}）继续前往 ${placeName(p.dest.x, p.dest.z)}`,
      reason: reason.text, to, t: sim.t, status: 'open'
    };
    sim.requests.push(req);
    if (p.cmd) p.cmd.request = req;
    p.reroute = { t: sim.t, reason: reason.text, decider: '下级请示', to };
    sim.routeLog.push({ t: sim.t, unit: p.short, reason: reason.text, decider: '下级请示', to });
    log(sim, `改航请示（${p.short}·${p.cmdr || '下级'}）：${reason.text}，申请经绕行点（${Math.round(to.x)},${Math.round(to.z)}）继续前往 ${placeName(p.dest.x, p.dest.z)}，待你批复。`, 'route', '行军日志');
    event(sim, 'reroute', {
      text: `${p.short}（${p.cmdr || '下级'}）申请改航：${reason.text}；绕行点（${Math.round(to.x)},${Math.round(to.z)}），仍前往 ${placeName(p.dest.x, p.dest.z)}`,
      unit: p.short, decider: '下级请示', reason: reason.text, to
    });
    return true;
  }

  function routeAdjust(sim, h) {
    for (const p of sim.pla) {
      if (p.dead || !p.dest) continue;
      const playerOrder = !!(p.order && p.order.player);
      if (!playerOrder && !p.path) continue;
      if (sim.t - p.lastReroute < 8) continue;
      p.rerouteThreat = null;
      let threat = null;
      for (const k of sim.kmt) {
        if (!k.alive) continue;
        const it = S.intelOf(sim, k.id);
        if (!it || it.age > 12) continue;
        if (dist(p.x, p.z, it.x, it.z) < 8.5) { threat = { k, text: '行进中遭遇阻击', close: true }; break; }
        if (dist(p.dest.x, p.dest.z, it.x, it.z) < 12) { threat = { k, text: '预定路线被敌封锁' }; break; }
      }
      const lowSupply = !p.supplied && p.supplyReason;
      let reason = null;
      if (threat) reason = { kind: 'threat', text: threat.text, close: threat.close };
      else if (lowSupply) reason = { kind: 'supply', text: `补给中断（${p.supplyReason}）` };
      // 硬条件之一：情报过期（目标敌军情报超过 24 小时未更新）
      if (!reason && p.order && p.order.kmtId) {
        const it = S.intelOf(sim, p.order.kmtId);
        const age = it ? it.age : 99;
        if (age > 24) reason = { kind: 'intel', text: `情报过期（目标情报已 ${Math.round(age)} 小时未更新）` };
      }
      if (!reason) continue;

      // ---- 玩家命令：只申请，不改航 ----
      if (playerOrder) {
        p.rerouteThreat = threat && threat.k;
        const to = rerouteProposal(sim, p, reason);
        const filed = to ? fileRerouteRequest(sim, p, reason, to) : false;
        p.lastReroute = sim.t;
        if (sim.auth === 0) {
          // 严控：停下来等批复（仍然是把决定权交回玩家，不是自行改航）
          p.halted = true;
          if (p.order) p.order.halted = true;
          if (!filed) event(sim, 'reroute', { text: `${p.short} 停止待命：${reason.text}（严控档，等待批复）`, unit: p.short, decider: '下级请示', reason: reason.text });
        }
        continue;
      }

      // ---- 兼容旧存档：非玩家命令沿用原自主逻辑 ----
      if (!sim.autonomy) {
        if (!p.halted) {
          p.halted = true; p.dest = null;
          if (p.order) p.order.halted = true;
          p.lastReroute = sim.t;
          p.reroute = { t: sim.t, reason: reason.text, decider: '严格按路线' };
          sim.routeLog.push({ t: sim.t, unit: p.short, reason: reason.text, decider: '严格按路线' });
          log(sim, `行军日志：${p.short} 于 ${dateLabel(sim.t)} 停止待命 — ${reason.text}（严格按路线，等待你的决断）。`, 'route', '行军日志');
          event(sim, 'reroute', { text: `${p.short} 停止待命：${reason.text}`, unit: p.short });
        }
        continue;
      }
      let adjusted = false;
      if (reason.kind === 'threat') {
        p.rerouteThreat = threat && threat.k;
        const to = rerouteProposal(sim, p, reason);
        if (to && p.path) { p.path.splice(p.pathIndex, 0, [to.x, to.z]); adjusted = true; }
      } else if (reason.kind === 'supply' && !p.supplyDetour && p.supplyDepot) {
        if (p.path) { p.path.splice(p.pathIndex, 0, [p.supplyDepot.x, p.supplyDepot.z]); }
        p.supplyDetour = true; adjusted = true;
        p.halted = false;
      }
      p.lastReroute = sim.t;
      p.reroute = { t: sim.t, reason: reason.text, decider: '自主' };
      sim.routeLog.push({ t: sim.t, unit: p.short, reason: reason.text, decider: '自主' });
      log(sim, `行军日志：${p.short} 于 ${dateLabel(sim.t)} ${adjusted ? '改道' : '就地展开'} — ${reason.text}（自主决定）。`, 'route', '行军日志');
      event(sim, 'reroute', { text: `${p.short} 自动${adjusted ? '改道' : '展开'}：${reason.text}`, unit: p.short });
    }
  }

  /* ---------------- 阶段 ---------------- */
  /* ---------------- 下级指挥员的判断与请示 ---------------- */
  const AUTH_GAP = [6, 12, 24];
  function commanders(sim, h) {
    for (const p of sim.pla) {
      if (p.dead || !p.cmd) continue;
      const cmd = p.cmd;
      const cas = 1 - p.strength / p.s0;
      if (p.engaged) cmd.opinion = p.order && p.order.type === 'attack' ? '正按意图突击' : '与敌接触，寻求战机';
      else if (p.halted) cmd.opinion = '已停止待命，请示下一步';
      else if (p.path) cmd.opinion = '沿手绘路线开进';
      else if (!p.order) cmd.opinion = '待命，等待任务';
      else if (p.order.arrived) cmd.opinion = '已到位，转入巩固';
      const open = sim.requests.find((r) => r.unit === p.id && r.status === 'open');
      if (open) { cmd.request = open; continue; }
      cmd.request = null;
      // 请示倾向越高、授权越紧，请示间隔越短；低请示倾向者宁可自己扛
      const gapMul = 1.42 - cmd.report * 0.16 - (sim.auth === 0 ? 0.14 : 0) + (sim.auth === 2 ? 0.12 : 0);
      if (sim.t - cmd.lastAsk < AUTH_GAP[sim.auth] * gapMul) continue;
      // 增援阈值：伤亡敏感越高越早叫援；阻击韧性越高越晚叫援（守得住就不叫）
      const askAt = 0.05 + (cmd.casSens - 1) * 0.02 + cmd.block * 0.013 + (cmd.temper >= 4 ? 0.012 : 0);
      let type = null, text = '';
      if (!p.supplied && p.order && (p.ammo < 40 || p.food < 30) && sim.t - (cmd.lastSupply || -99) > 24) {
        // 弹药还够时不会先叫补给；避免无意义的反复请示
        type = 'supply';
        cmd.lastSupply = sim.t;
        text = `补给中断（${p.supplyReason}），弹药仅余 ${(p.ammo / 12).toFixed(1)} 日，请求优先补给。`;
      } else if (p.order && p.order.type === 'attack' && p.engaged && !cmd.proposed && cmd.init + cmd.infil >= 8) {
        // 主动性强、敢穿插的指挥员在接战初期会先提替代方案，之后才按伤亡请示增援
        const others = sim.kmt.filter((k) => k.alive && k.id !== p.order.kmtId).sort((a, b) => a.strength - b.strength);
        const weak = others[0];
        if (weak) {
          type = 'alt';
          cmd.proposed = true;
          text = `正面硬顶代价大。我建议先取 ${weak.short} 方向侧翼要点（其兵力较弱），再回头压缩包围圈。`;
        }
      } else if (p.engaged && cas > askAt) {
        type = 'reinforce';
        text = `我纵伤亡已近 ${Math.round(cas * 100)}%（阈值 ${Math.round(askAt * 100)}%），请求增援一个师，或允许整理后再战。`;
      } else if (p.halted) {
        type = 'order';
        text = '已按严格路线停止待命，请示下一步：继续开进或转入休整。';
      }
      if (!type) continue;
      cmd.lastAsk = sim.t;
      const req = { id: 'rq' + (++sim.reqSeq), unit: p.id, short: p.short, cmdr: p.cmdr, type, text, t: sim.t, status: 'open' };
      sim.requests.push(req);
      cmd.request = req;
      if (sim.requests.length > 8) {
        const done = sim.requests.find((r) => r.status !== 'open');
        if (done) sim.requests.splice(sim.requests.indexOf(done), 1);
      }
      log(sim, `请示（${p.short}·${p.cmdr}）：${text}`, 'cmd', '下级指挥员');
      event(sim, 'request', { text: `${p.short} 请示：${text}`, unit: p.short });
    }
    // 放权模式下的有限临机专断（事后补报）
    for (const p of sim.pla) {
      if (p.dead || !p.cmd || sim.auth < 2) continue;
      const cmd = p.cmd;
      if (!p.engaged || !p.order || p.order.type !== 'attack') continue;
      // 脾性 + 勇猛 + 主动性高、协同低者更可能先斩后奏；稳健/协同高者会压住
      if (cmd.aggr + cmd.temper + cmd.init - cmd.coord * 0.5 < 11) continue;
      if (p.morale < 42) continue;
      if (sim.t - cmd.lastDeviate < 30) continue;
      cmd.lastDeviate = sim.t;
      cmd.deviations++;
      p.morale = Math.max(0, p.morale - 1);
      p.order.ang = (p.order.ang || 0) + (cmd.temper >= 5 ? 0.7 : 0.55);
      p.cmd.planBonus += 0.04 * (cmd.aggr >= 5 ? 1.2 : 1);
      sim.unapproved = (sim.unapproved || 0) + 1;
      (sim.unapprovedLog = sim.unapprovedLog || []).push({ t: sim.t, unit: p.short, text: `自行${cmd.aggr >= 5 ? '提前发起' : '调整'}突击轴线，抢占侧翼出发阵地` });
      log(sim, `临机专断（事后补报）：${p.short}（${p.cmdr}）未及请示，自行${cmd.aggr >= 5 ? '提前发起' : '调整'}突击轴线，抢占侧翼出发阵地，已上报。`, 'cmd', p.short);
      event(sim, 'deviation', { text: `${p.short} 临机专断：自行调整突击轴线（事后补报）`, unit: p.short });
    }
  }
  S.setAuth = function (sim, v) {
    sim.auth = clamp(v, 0, 2);
    log(sim, `指挥授权调整为「${['严控', '常规', '放权'][sim.auth]}」：${
      sim.auth === 0 ? '下级事事请示，反应慢但严格按意图。' : sim.auth === 2 ? '下级临机处置多，效率高但可能与意图有偏差。' : '大事请示、小事自决。'}`, 'sys', '粟裕');
  };
  S.adoptRequest = function (sim, id) {
    const r = sim.requests.find((x) => x.id === id && x.status === 'open');
    if (!r) return false;
    const p = sim.pla.find((x) => x.id === r.unit);
    if (!p) return false;
    r.status = 'adopted';
    p.cmd.request = null;
    if (r.type === 'reinforce') {
      const donor = sim.pla.filter((q) => q !== p && !q.dead && !q.engaged && q.strength > q.s0 * 0.7)
        .sort((a, b) => a.strength - b.strength)[0];
      if (donor) {
        const n = Math.min(2600, donor.strength - 1200);
        if (n > 0) { donor.strength -= n; p.strength += n; }
      }
      p.morale = Math.min(100, p.morale + 4);
      log(sim, `批复（${p.short}）：准予增援${donor ? `，由 ${donor.short} 抽调一部` : '，暂无兵可调，先补士气'}。`, 'cmd', '粟裕');
    } else if (r.type === 'supply') {
      p.ammo = Math.min(100, p.ammo + 12); p.food = Math.min(100, p.food + 10);
      p.morale = Math.min(100, p.morale + 3);
      log(sim, `批复（${p.short}）：补给优先，弹药/粮食各补一日份。`, 'cmd', '粟裕');
    } else if (r.type === 'order') {
      p.halted = false;
      if (p.path) p.dest = { x: p.path[Math.min(p.pathIndex, p.path.length - 1)][0], z: p.path[Math.min(p.pathIndex, p.path.length - 1)][1] };
      log(sim, `批复（${p.short}）：继续按原定路线开进。`, 'cmd', '粟裕');
    } else if (r.type === 'alt') {
      p.cmd.planBonus = Math.min(0.2, p.cmd.planBonus + 0.12);
      p.morale = Math.min(100, p.morale + 5);
      log(sim, `批复（${p.short}）：同意先取侧翼要点的打法，按此调整突击组织。`, 'cmd', '粟裕');
    } else if (r.type === 'reroute') {
      // 批准改航：只插入一个绕行折点，最终目的地仍是玩家原命令
      const final = p.dest || (p.order ? { x: p.order.x, z: p.order.z } : null);
      if (r.to && final) {
        p.path = [[r.to.x, r.to.z], [final.x, final.z]];
        p.pathIndex = 0;
        p.dest = { x: r.to.x, z: r.to.z };
      }
      p.halted = false;
      if (p.order) { p.order.halted = false; p.order.player = true; }
      p.rerouteThreat = null;
      log(sim, `批复改航（${p.short}）：准予绕行至 ${placeName(r.to.x, r.to.z)}，随后回到原定目标 ${placeName(final.x, final.z)}。`, 'cmd', '粟裕');
    }
    event(sim, 'toast', { text: `已采纳 ${p.short} 的请示`, kind: 'good' });
    return true;
  };
  S.rejectRequest = function (sim, id) {
    const r = sim.requests.find((x) => x.id === id && x.status === 'open');
    if (!r) return false;
    const p = sim.pla.find((x) => x.id === r.unit);
    r.status = 'rejected';
    if (p) {
      p.cmd.request = null;
      p.morale = Math.max(0, p.morale - 4);
      p.cmd.opinion = '对上级决定有保留，仍按命令执行';
      if (r.type === 'reroute') {
        p.rerouteThreat = null;
        p.halted = false;
        if (!p.dest && p.order && typeof p.order.x === 'number') p.dest = { x: p.order.x, z: p.order.z };
      }
      log(sim, `驳回（${p.short}）：按原定任务继续，不得擅自改变。`, 'cmd', '粟裕');
    }
    return true;
  };

  function advancePhase(sim, np) {
    sim.phase = np;
    sim.phaseStart = sim.t;
    sim.phaseReady = 0;
    event(sim, 'phase', { phase: np });
    log(sim, `战役进入第 ${np} 阶段（${dateLabel(sim.t)}）。`, 'sys', '总前委');
  }
  S.confirmPhase = function (sim) {
    if (!sim.phaseReady) return false;
    sim.running = false;
    advancePhase(sim, sim.phaseReady);
    return true;
  };

  S.recalcPhase = function (sim) {
    const n = MAIN_IDS.filter((id) => {
      const k = sim.kmt.find((x) => x.id === id);
      return !k || !k.alive;
    }).length;
    const np = Math.min(3, n + 1);
    if (np > sim.phase) {
      if (sim.pace === 0) {
        // 从容档：章节推进必须由玩家手动确认，先停表
        if (!sim.phaseReady) {
          sim.phaseReady = np;
          sim.running = false;
          event(sim, 'phaseReady', { phase: np });
          log(sim, `第 ${np} 阶段目标已达成。战局已暂停，等待你确认进入下一阶段。`, 'sys', '总前委');
        }
      } else {
        advancePhase(sim, np);
      }
    }
  };

  /* ---------------- 节奏档位 / 时间窗 ---------------- */
  S.setPace = function (sim, pace) {
    sim.pace = pace;
    if (pace === 0) {
      // 从容：停表，无任何时限
      sim.running = false;
      sim.speed = 0;
    } else {
      if (sim.phaseReady) advancePhase(sim, sim.phaseReady);
      sim.speed = 1;
      sim.running = true;
    }
  };
  S.PHASE_DEADLINES = PHASE_DEADLINES;
  S.pacing = function (sim) {
    if (sim.pace === 0) return { name: '从容', limit: null, text: '无时限 · 战局只在您推进时前进', left: null };
    if (sim.pace === 1) return { name: '标准', limit: null, text: '无硬截止 · 迟缓只会让敌军多做动作', left: null };
    const limit = PHASE_DEADLINES[Math.min(2, sim.phase - 1)];
    return { name: '紧迫', limit, left: Math.max(0, limit - sim.t), text: `第 ${sim.phase} 阶段历史窗口` };
  };

  function checkDeadlines(sim) {
    if (sim.pace !== 2 || sim.ended) return;
    const limit = PHASE_DEADLINES[Math.min(2, sim.phase - 1)];
    if (sim.t < limit || sim.deadlines && sim.deadlines[sim.phase]) return;
    sim.deadlines = sim.deadlines || {};
    sim.deadlines[sim.phase] = 1;
    sim.deadlineHits.push({ phase: sim.phase, t: sim.t });
    // 软后果：敌军增援与补给恶化，不判负
    const alive = sim.kmt.filter((k) => k.alive && MAIN_IDS.includes(k.id)).sort((a, b) => a.strength - b.strength);
    const target = alive[0];
    if (target) {
      const before = target.strength;
      target.strength = Math.min(target.s0 * 1.15, target.strength + target.s0 * 0.08);
      target.morale = Math.min(100, target.morale + 6);
      sim.lastDeadlineEffect = { id: target.id, short: target.short, strengthDelta: Math.round(target.strength - before), ammoDelta: -5 };
    }
    for (const p of sim.pla) {
      if (p.dead) continue;
      p.ammo = Math.max(0, p.ammo - 5);
      p.food = Math.max(0, (p.food || 0) - 4);
    }
    log(sim, `时间窗已过：第 ${sim.phase} 阶段未按期完成。敌军援兵与补给状况改善，我军弹药粮食消耗加剧——但不判负，战役仍可继续。`, 'warn', '总前委');
    event(sim, 'deadline', { phase: sim.phase, t: sim.t });
  }

  S.mainGroups = function (sim) {
    return sim.kmt.filter((k) => MAIN_IDS.includes(k.id));
  };

  S.currentObjective = function (sim) {
    const alive = S.mainGroups(sim).filter((k) => k.alive);
    if (sim.phase === 1) return { title: '围歼黄百韬第7兵团', ids: ['k7'], alive };
    if (sim.phase === 2) return { title: '围歼黄维第12兵团', ids: ['k12'], alive };
    return { title: '围歼杜聿明集团（第2、13、16兵团）', ids: ['k2', 'k13', 'k16'], alive };
  };

  /* ---------------- 玩家命令 ---------------- */
  S.command = function (sim, unitIds, type, target) {
    const units = sim.pla.filter((u) => unitIds.includes(u.id) && !u.dead && u.strength > 0);
    if (!units.length) return false;
    const kmtId = target && target.kmtId;
    const drawn = (target && target.path && target.path.length > 1) ? target.path : null;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      let dest = null;
      let a = 0;
      if (drawn && type === 'move') {
        // 多支部队共用一条手绘路线时，按横向错位分布，避免叠在一起
        const off = (i - (units.length - 1) / 2) * 3.2;
        const dx = drawn[drawn.length - 1][0] - drawn[0][0];
        const dz = drawn[drawn.length - 1][1] - drawn[0][1];
        const len = Math.hypot(dx, dz) || 1;
        const ox = -dz / len * off, oz = dx / len * off;
        u.path = drawn.map((pt) => [pt[0] + ox, pt[1] + oz]);
        u.pathIndex = 0;
        u.routeOriginal = u.path.map((pt) => pt.slice());
        u.routeActual = [[u.x, u.z]];
        u.reroute = null; u.halted = false; u.supplyDetour = false; u.rerouteThreat = null;
        u.dest = { x: u.path[0][0], z: u.path[0][1] };
        u.order = { type: 'move', path: true, at: sim.t, arrived: false, player: true };
        u.origin = { x: u.x, z: u.z };
        continue;
      }
      // 非手绘命令清除旧路线，避免沿旧折线继续走
      u.path = null; u.pathIndex = 0; u.routeOriginal = null; u.routeActual = null;
      u.reroute = null; u.halted = false; u.supplyDetour = false;
      if (type === 'move' || type === 'block' || type === 'scout') dest = { x: target.x, z: target.z };
      if (type === 'encircle' || type === 'attack') {
        const k = sim.kmt.find((x) => x.id === kmtId && x.alive);
        if (!k) return false;
        a = (i / Math.max(1, units.length)) * Math.PI * 2 + (type === 'attack' ? 0.7 : 0.2);
        const r = type === 'attack' ? 6.5 : 10.5;
        dest = { x: k.x + Math.cos(a) * r, z: k.z + Math.sin(a) * r };
        if (type === 'encircle' && k.surrounded) {
          // 已合围则原地压缩，交给玩家继续压缩/休整
          dest = { x: k.x + Math.cos(a) * 8.5, z: k.z + Math.sin(a) * 8.5 };
        }
      }
      u.order = { type, x: dest ? dest.x : u.x, z: dest ? dest.z : u.z, kmtId, at: sim.t, ang: a, player: true };
      u.rerouteThreat = null;
      u.dest = dest;
      if (type === 'rest') { u.dest = null; u.order = { type: 'rest', at: sim.t, player: true }; }
      if (type === 'encircle' || type === 'attack') {
        u.entrench = 0;
        const k = sim.kmt.find((x) => x.id === kmtId);
        if (k && type === 'attack' && k.surrounded) u.order.assaultReady = true;
      }
    }
    const labelMap = { move: '行军', encircle: '包围', attack: '进攻', block: '阻援', rest: '休整', scout: '侦察' };
    const k = target && target.kmtId ? sim.kmt.find((x) => x.id === target.kmtId) : null;
    const where = k ? k.short : (drawn && type === 'move'
      ? `手绘路线（${drawn.length} 折点 / 约 ${Math.round(S.pathInfo(drawn, units[0]).km)} km）`
      : `${placeName(target.x, target.z)}`);
    log(sim, `命令：${units.map((u) => u.short).join('、')} ${labelMap[type] || type} → ${where}。`, 'sys', '粟裕');
    checkDivergence(sim, units, type, target);
    return true;
  };

  function checkDivergence(sim, units, type, target) {
    // D1 先打黄维
    if (type === 'attack' || type === 'encircle') {
      const k = sim.kmt.find((x) => x.id === (target && target.kmtId));
      if (k && k.id === 'k12' && !sim.flags.D1) {
        const k7 = sim.kmt.find((x) => x.id === 'k7');
        if (k7 && k7.alive && k7.strength > k7.s0 * 0.55) {
          const n = sim.pla.filter((u) => !u.dead).length;
          const committed = units.length / Math.max(1, n);
          if (committed > 0.18) addDivergence(sim, 'D1');
        }
      }
    }
    // D2 抽调南线阻援
    if ((type === 'attack' || type === 'encircle' || type === 'move') && !sim.flags.D2) {
      const south = units.filter((u) => u.group === '南线阻援');
      const k6 = sim.kmt.find((x) => x.id === 'k6');
      if (south.length && k6 && k6.alive) {
        const tz = (target && target.kmtId) ? sim.kmt.find((x) => x.id === target.kmtId).z : target.z;
        if (tz !== undefined && tz < 70) addDivergence(sim, 'D2');
      }
    }
  }

  function addDivergence(sim, key) {
    if (sim.flags['div' + key]) return;
    sim.flags['div' + key] = 1;
    const def = D.DIVERGENCE_DEFS[key];
    if (!def) return;
    sim.divergences.push({ key, t: sim.t, title: def.title, choice: '', consequence: '' });
    log(sim, `【历史分歧】${def.title}：${def.alt}`, 'intel', '战史对照');
    event(sim, 'toast', { text: `历史分歧 ${key}：${def.title}`, kind: 'warn' });
    event(sim, 'divergence', { key });
  }
  S.divergence = addDivergence;

  S.setGap = function (sim, open) {
    sim.gapOpen = !!open;
    if (open) {
      addDivergence(sim, 'D4');
      log(sim, '决定：陈官庄西南方向留出缺口，诱使杜聿明集团突围后再追歼。', 'sys', '粟裕');
    } else {
      log(sim, '决定：封闭陈官庄西南缺口。', 'sys', '粟裕');
    }
  };

  S.transferStrategy = function (sim) {
    if (sim.transfer) return;
    sim.transfer = true;
    addDivergence(sim, 'D7');
    log(sim, '决定：停止围歼，主力转入战略转移，保住部队。', 'sys', '粟裕');
    finish(sim);
  };

  S.earlyAssault = function (sim, kmtId) {
    const k = sim.kmt.find((x) => x.id === kmtId);
    if (!k) return;
    const k7 = sim.kmt.find((x) => x.id === 'k7');
    if (k.id === 'k7' && !sim.flags.D3 && (sim.t < 312 || k.entrench < 2 || k.strength > k.s0 * 0.9)) {
      addDivergence(sim, 'D3');
    }
    // D5 同时围两个兵团
    const aliveSur = sim.kmt.filter((x) => x.alive && x.surrounded && MAIN_IDS.includes(x.id));
    if (aliveSur.length >= 2 && !sim.flags.D5) addDivergence(sim, 'D5');
  };

  /* ---------------- 总攻 / 前线战斗 ---------------- */
  /* ---------------- 炮火准备：与战役层弹药/特纵炮兵耦合 ---------------- */
  S.artilleryPlan = function (sim, kmtId) {
    const A = D.ARTILLERY;
    const k = sim.kmt.find((x) => x.id === kmtId);
    const guns = sim.pla.filter((p) => !p.dead && p.role === '炮兵');
    let ammoSum = 0, tubes = 0, fatigue = 0;
    for (const g of guns) { ammoSum += g.ammo; fatigue += g.fatigue || 0; tubes += (g.strength || 0) / 1000; }
    const ammo = guns.length ? ammoSum / guns.length : 0;
    const avgFatigue = guns.length ? fatigue / guns.length : 0;
    let level = 'none';
    if (guns.length) {
      if (ammo >= A.thresholds.full) level = 'full';
      else if (ammo >= A.thresholds.partial) level = 'partial';
      else if (ammo >= A.thresholds.weak) level = 'weak';
    }
    // 炮兵疲劳过高，完整准备降一档（连续总攻会把特纵拖垮）
    if (avgFatigue > 70 && level === 'full') level = 'partial';
    if (avgFatigue > 85 && level === 'partial') level = 'weak';
    return {
      level, label: A.levelText[level],
      duration: A.duration[level], shells: A.shells[level], radius: A.radius[level],
      dmgMul: A.dmgMul[level], ammo: Math.round(ammo), tubes: Math.round(tubes),
      guns: guns.length, fatigue: Math.round(avgFatigue), casMul: A.prepCasMul[level] || 1,
      target: k ? [k.x, k.z] : null, kmtId,
      note: guns.length ? `${guns.length} 个炮兵单位 / ${Math.round(tubes)} 门份 / 平均弹药 ${Math.round(ammo)}%`
        : '无可用炮兵，无法组织炮火准备'
    };
  };
  S.shellDamage = function (plan, d, cover) {
    const A = D.ARTILLERY;
    if (!plan || plan.level === 'none' || !A.shells[plan.level]) return 0;
    if (d > A.shellRadius) return 0;
    const f = Math.pow(1 - d / A.shellRadius, 1.4);
    return Math.round(A.baseDamage * (A.dmgMul[plan.level] || 1) * f * (A.coverMul[cover] || 1) * 10) / 10;
  };
  S.consumeArtillery = function (sim, plan) {
    const A = D.ARTILLERY;
    const cost = A.ammoCost[plan && plan.level] || 0;
    if (!cost) return { cost: 0, guns: 0 };
    let n = 0;
    for (const g of sim.pla) {
      if (g.dead || g.role !== '炮兵') continue;
      g.ammo = Math.max(0, g.ammo - cost);
      g.fatigue = Math.min(100, (g.fatigue || 0) + A.fatigue);
      n++;
    }
    return { cost, guns: n };
  };

  S.assaultConfig = function (sim, kmtId) {
    const k = sim.kmt.find((x) => x.id === kmtId);
    if (!k) return null;
    S.earlyAssault(sim, kmtId);
    const ratio = k.strength / Math.max(1, k.s0);
    const moat = k.id === 'k7' && !sim.flags.nzMoatBroken;
    return {
      kmtId, title: k.name, short: k.short,
      seed: (kmtId.charCodeAt(1) || 1) * 977 + Math.floor(sim.t),
      enemyCount: Math.max(8, Math.min(20, Math.round(12 * ratio + 4))),
      enemyHP: 60 + Math.round(60 * ratio),
      playerHP: moat ? MOAT.assaultHP : 120,
      limit: moat ? MOAT.assaultLimit : 150,
      moatPenalty: moat ? MOAT.casMul : 1,
      moatText: moat ? '外壕未破' : '外壕已破',
      phase: sim.phase,
      kmtStrength: k.strength,
      bonus: 1 + 0.2 * sim.divergences.length,
      support: S.artilleryPlan(sim, kmtId)
    };
  };

  S.applyBattle = function (sim, kmtId, result) {
    const k = sim.kmt.find((x) => x.id === kmtId);
    if (!k || !k.alive) return;
    sim.battles++;
    const win = result.win;
    // 碾庄圩外壕未破：跨壕强攻，对敌杀伤 ×0.55、我方伤亡 ×2.4
    const moat = k.id === 'k7' && !sim.flags.nzMoatBroken;
    const gap = k.id === 'k12' && sim.flags.liaoGap ? 1.25 : 1;
    const dmgMul = (moat ? MOAT.dmgMul : 1) * gap;
    // 炮火准备档位决定「硬冲」代价：不足/中断 → 伤亡系数上抬（上限 4.0）
    const support = result.support || S.artilleryPlan(sim, kmtId);
    const prep = result.prep || { level: support.level, skipped: false };
    const prepLevel = prep.skipped ? 'skipped' : (prep.level || support.level);
    const prepMul = D.ARTILLERY.prepCasMul[prepLevel] || 1;
    const casMul = Math.min(4.0, (moat ? MOAT.casMul : 1) * prepMul);
    // 战斗损耗：突击成功大幅削减守军；失败则我军付出代价
    const frac = (win ? (0.16 + Math.min(0.14, result.kills / 100)) : 0.05) * dmgMul;
    const cut = k.strength * frac;
    k.strength -= cut; sim.casualties.kmt += cut;
    k.morale = Math.max(0, k.morale - (win ? 7 : 3));
    const involved = sim.pla.filter((p) => !p.dead && dist(p.x, p.z, k.x, k.z) < 22);
    const cas = (result.casualties || 0) * casMul;
    let remain = cas;
    for (const p of involved) {
      const take = Math.min(remain, p.strength * 0.06);
      p.strength -= take; remain -= take; sim.casualties.pla += take;
    }
    sim.casualties.pla += remain * 0.4;
    for (const p of involved) {
      p.ammo = Math.max(0, p.ammo - 8);
      p.fatigue = Math.min(100, p.fatigue + 9);
      p.entrench = Math.max(0, p.entrench - 1);
    }
    // 真正扣战役层炮兵弹药与体力（不是视觉特效）
    const spend = S.consumeArtillery(sim, support);
    // 炮火准备的表现：弹幕密度/半径直接来自 artilleryPlan 的 shells/radius
    if (support.level && support.level !== 'none') {
      const n = Math.max(3, Math.min(16, Math.round((support.shells || 6) / 8)));
      const rad = (support.radius || 3) * 1.6;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + (sim.t % 1);
        const rr = rad * (0.25 + ((i * 37) % 100) / 140);
        fxEvent(sim, 'shell', {
          x: k.x + Math.cos(a) * rr, z: k.z + Math.sin(a) * rr,
          r: 1.8 + (i % 3) * 0.6, dmg: Math.round(cut / n), kmt: k.id
        });
      }
    }
    fxEvent(sim, 'hit', { x: k.x, z: k.z, side: 'kmt', n: Math.round(cut), frac: k.strength / k.s0, unit: k.id });
    sim.intel[k.id] = { x: k.x, z: k.z, strength: k.strength, time: sim.t, conf: 90, source: '俘虏审讯' };
    log(sim, (win
      ? `${moat ? '未破壕强攻' : '前线突击'}得手：${k.short} 阵地被突破，估计损失 ${Math.round(cut)} 人；我方伤亡 ${Math.round(cas)} 人。`
      : `${moat ? '未破壕强攻' : '前线突击'}受阻：${k.short} 火力反击猛烈，我方伤亡 ${Math.round(cas)} 人，未能突破。`)
      + (moat ? '（外壕未破，伤亡×2.4、对敌杀伤×0.55）' : '')
      + (gap > 1 ? '（第110师缺口，对敌杀伤×1.25）' : '')
      + `（炮火：${D.ARTILLERY.levelText[support.level] || '无'}${prep.skipped ? '·提前冲锋' : ''}，伤亡×${prepMul}`
      + (spend.cost ? `，特纵弹药-${spend.cost}%（${spend.guns} 个单位）` : '') + '）', 'battle', '前沿战报');
    if (k.strength < k.s0 * 0.03) destroyKMT(sim, k);
    event(sim, 'battleDone', { kmtId, win, prep: prepLevel, support: support.level });
  };

  /* ---------------- 里程碑 ---------------- */
  function checkMilestones(sim) {
    for (const m of D.MILESTONES) {
      if (sim.t >= m.hour && !sim.flags['ms' + m.hour]) {
        sim.flags['ms' + m.hour] = 1;
        log(sim, `${m.date}：${m.text}`, 'sys', '总前委');
      }
    }
  }

  /* ---------------- 结局 ---------------- */
  function finish(sim) {
    if (sim.ended) return;
    sim.ended = true;
    sim.running = false;
    const totalPLA = sim.pla.reduce((a, u) => a + u.s0, 0);
    const casRate = sim.casualties.pla / totalPLA;
    const left = MAIN_IDS.filter((id) => {
      const k = sim.kmt.find((x) => x.id === id);
      return k && k.alive;
    });
    const destroyed = MAIN_IDS.length - left.length;
    let id;
    if (sim.transfer) id = 'transfer';
    else if (left.length === 0) {
      if (casRate > 0.30 || sim.supplyCut) id = 'pyrrhic';
      else if (sim.t < 1296) id = 'early';
      else id = 'historical';
    } else {
      const escaped = sim.kmt.filter((k) => MAIN_IDS.includes(k.id) && k.alive && k.strength > k.s0 * 0.3).length;
      if (casRate > 0.55 || escaped >= 2) id = 'defeat';
      else id = 'stalemate';
    }
    const e = D.ENDINGS[id];
    const adopted = sim.requests.filter((r) => r.status === 'adopted').length;
    const rejected = sim.requests.filter((r) => r.status === 'rejected').length;
    const unapproved = sim.unapproved || 0;
    const authName = ['严控', '常规', '放权'][sim.auth];
    const notes = [];
    if (adopted) notes.push(`采纳下级建议 ${adopted} 次：` + sim.requests.filter((r) => r.status === 'adopted').slice(0, 2).map((r) => `${r.short} — ${r.text}`).join('；'));
    if (rejected) notes.push(`驳回请示 ${rejected} 次（相关指挥员士气下降，仍执行命令）。`);
    if (unapproved) notes.push(`临机专断 ${unapproved} 次：` + (sim.unapprovedLog || []).slice(0, 2).map((x) => `${x.unit} 于 ${dateLabel(x.t)} ${x.text}`).join('；'));
    if (!notes.length) notes.push('下级未提出成规模请示，指挥链按既定意图运转。');
    sim.cmdReview = {
      auth: sim.auth, authName, asked: sim.requests.length, adopted, rejected, unapproved,
      notes,
      verdict: sim.auth === 0
        ? (unapproved === 0 ? '严控达成：无擅自行动，但下级主动性被压缩，反应偏慢。' : '严控下仍出现擅自行动，说明授权与任务不匹配。')
        : sim.auth === 2
          ? (unapproved > 0 ? '放权提高了效率，但出现未经请示的临机处置，应在复盘中明确边界。' : '放权未越界，下级判断与总意图基本一致。')
          : '常规授权：请示与自决大体平衡，未出现明显偏离意图的行动。'
    };
    sim.outcome = {
      id, title: e.title, grade: e.grade, line: e.line, text: e.text, note: e.note,
      t: sim.t, casRate, destroyed, left: left.length,
      cmdReview: sim.cmdReview,
      divergences: sim.divergences.slice()
    };
    // 分歧点后果
    const cons = {
      D1: '以主力先攻黄维，7 兵团获得喘息，碾庄方向压力一度减轻；若黄维未被迅速解决，徐州方向援军将趁机东进。',
      D2: '南线阻援兵力被抽走，李延年、刘汝明兵团更快接近宿县；如被突破，被围兵团士气回升并可能突围。',
      D3: '绕过近迫作业与充分炮火准备，外壕未破即跨壕强攻：我军伤亡 ×2.4、对敌杀伤 ×0.55，弹药消耗加快。',
      D4: '留出缺口使杜聿明集团部分突围，但可在野战中追歼其主力；包围圈闭合时间被推迟。',
      D5: '同时围两个兵团，炮兵与预备队被摊薄，两个方向的压缩速度都下降约四成。',
      D6: '南线阻击被突破，援军与被围兵团形成内外夹击，我军被迫分兵应对。',
      D7: '主动转移，保存了主力，但战役目标未完成。'
    };
    sim.outcome.divergences = sim.divergences.map((d) => Object.assign({}, d, { consequence: cons[d.key] || '' }));
    log(sim, `战役结束：${e.title}。历时 ${Math.floor(sim.t / 24)} 天，我军伤亡 ${Math.round(sim.casualties.pla)} 人。`, 'sys', '总前委');
    event(sim, 'ending', { outcome: sim.outcome });
  }
  S.finish = finish;

  function checkEnding(sim) {
    if (sim.ended) return;
    // 取消时间耗尽判负：只有被突破 / 被反包围 / 兵力耗尽等军事失败才结束
    const left = MAIN_IDS.filter((id) => {
      const k = sim.kmt.find((x) => x.id === id);
      return k && k.alive;
    });
    if (left.length === 0) finish(sim);
    if (sim.casualties.pla > sim.pla.reduce((a, u) => a + u.s0, 0) * 0.6) finish(sim);
  }

  /* ---------------- 供 UI 的数据 ---------------- */
  S.stats = function (sim) {
    let sp = 0, sk = 0, mp = 0, mk = 0, nAlive = 0, ammo = 0, fatigue = 0;
    for (const u of sim.pla) if (!u.dead) { sp += u.strength; mp += u.morale; ammo += u.ammo; fatigue += u.fatigue; nAlive++; }
    for (const k of sim.kmt) if (k.alive) { sk += k.strength; mk += k.morale; }
    return {
      pla: sp, kmt: sk,
      plaCas: sim.casualties.pla, kmtCas: sim.casualties.kmt,
      morale: nAlive ? mp / nAlive : 0, kmtMorale: sim.kmt.filter((k) => k.alive).length ? mk / sim.kmt.filter((k) => k.alive).length : 0,
      ammo: nAlive ? ammo / nAlive : 0, fatigue: nAlive ? fatigue / nAlive : 0,
      supplyUnits: sim.pla.filter((u) => !u.dead && u.supplied).length,
      aliveUnits: nAlive, surroundedKMT: sim.kmt.filter((k) => k.alive && k.surrounded).length
    };
  };

  /* ---------------- 沙盘推演：不改状态，只算预计结果 ---------------- */
  S.preview = function (sim, unitIds, type, target) {
    const units = sim.pla.filter((u) => unitIds.includes(u.id) && !u.dead && u.strength > 0);
    if (!units.length) return null;
    const kmt = target && target.kmtId ? sim.kmt.find((k) => k.id === target.kmtId && k.alive) : null;
    const it = kmt ? S.intelOf(sim, kmt.id) : null;
    const dest = kmt
      ? { x: it ? it.x : kmt.x, z: it ? it.z : kmt.z }
      : (target && isFinite(target.x) ? { x: target.x, z: target.z } : null);
    if (!dest) return null;
    const isRest = type === 'rest';
    let km = 0, hours = 0, roadKm = 0, riverKm = 0, railKm = 0, troops = 0;
    for (const u of units) {
      troops += u.strength;
      if (isRest) continue;
      const pi = S.pathInfo([[dest.x, dest.z]], u);
      km += pi.km; roadKm += pi.roadKm; riverKm += pi.riverKm; railKm += pi.railKm || 0;
      hours = Math.max(hours, pi.hours);
    }
    km = isRest ? 0 : km / units.length;
    // 敌情只取已侦察到的信息
    let contact = null;
    for (const k of sim.kmt) {
      if (!k.alive) continue;
      const info = S.intelOf(sim, k.id);
      if (!info || info.age > 12) continue;
      const d = dist(dest.x, dest.z, info.x, info.z);
      if (!contact || d < contact.d) contact = { k, d, info };
    }
    let risk = '低', contactText = '沿途未发现已侦察到的敌军';
    if (contact && contact.d < 30) {
      const ratio = contact.info.strength / Math.max(1, troops);
      risk = ratio > 0.75 ? '高' : ratio > 0.4 ? '中' : '低';
      contactText = `${contact.k.short} 距目标约 ${Math.round(contact.d)} km（已知 ${Math.round(contact.info.strength)} 人，情报 ${Math.round(contact.info.age)} 小时前），接触风险${risk}`;
    }
    const avg = (key) => units.reduce((a, u) => a + ((u.cmd && u.cmd[key]) || 3), 0) / units.length;
    const casMul = Math.max(0.55, 1 + (avg('aggr') - 3) * 0.09 + (3 - avg('caut')) * 0.05 - (avg('siege') - 3) * 0.03);
    const rmul = risk === '高' ? 1.6 : risk === '中' ? 1.15 : 0.9;
    const casLo = Math.round(troops * 0.004 * casMul * rmul);
    const casHi = Math.round(troops * 0.018 * casMul * rmul);
    let enc = null;
    if (kmt) {
      const cover = kmt.cover || 0;
      const sec = new Set();
      for (const u of units) {
        const ang = Math.atan2(u.z - kmt.z, u.x - kmt.x);
        sec.add(Math.floor(((ang + Math.PI * 2.25) / (Math.PI / 4) + 8) % 8));
      }
      const after = Math.min(8, cover + sec.size);
      enc = {
        cover, after,
        text: type === 'encircle'
          ? (after >= 6 ? `可合拢：覆盖 ${after}/8 扇区` : `力量不足：预计仅覆盖 ${after}/8 扇区`)
          : `当前已被围 ${cover}/8 扇区`
      };
    }
    let dep = 1e9, dname = '';
    for (const dp of D.DEPOTS.pla) {
      const d = dist(dest.x, dest.z, dp.x, dp.z);
      if (d < dep) { dep = d; dname = dp.name; }
    }
    const supplyText = dep < SUPPLY_R ? `可依托 ${dname}（${Math.round(dep * KM)} km）` : `距 ${dname} ${Math.round(dep * KM)} km，补给可能中断`;
    return {
      type, dest, units: units.map((u) => u.short), troops,
      km: Math.round(km), hours: isRest ? 0 : Math.round(hours * 10) / 10,
      eta: isRest ? S.dateLabel(sim.t) : S.dateLabel(sim.t + hours),
      roadKm: Math.round(roadKm), riverKm: Math.round(riverKm), railKm: Math.round(railKm),
      contactText, risk, enemy: contact ? contact.info.strength : null,
      casLo, casHi,
      enc, supplyText,
      note: type === 'rest' ? '休整：恢复士气与弹药，但给敌军调整时间' : ''
    };
  };

  /* ---------------- 存档 / 读档 ---------------- */
  S.serialize = function (sim) {
    const copy = JSON.parse(JSON.stringify(sim));
    copy.events = [];
    copy.fx = [];
    copy.running = false;
    return JSON.stringify({ v: 2, sim: copy });
  };
  S.restore = function (text) {
    try {
      const o = typeof text === 'string' ? JSON.parse(text) : text;
      const sim = o.sim || o;
      if (!sim || !sim.pla) return null;
      sim.events = [];
      sim.fx = [];
      sim.fxSeq = sim.fxSeq || 0;
      sim.running = false;
      sim.speed = 0;
      sim.rng = U.rng(660066 + Math.floor((sim.t || 0) * 7));
      sim.pace = sim.pace == null ? 0 : sim.pace;
      sim.phaseReady = sim.phaseReady || 0;
      sim.deadlineHits = sim.deadlineHits || [];
      sim.deadlines = sim.deadlines || {};
      for (const u of sim.pla) {
        if (!u.cmd) u.cmd = cmdFromProfile(u.cmdr);
        u.path = u.path || null;
        u.routeOriginal = u.routeOriginal || null;
        u.routeActual = u.routeActual || null;
      }
      for (const k of sim.kmt) {
        k.sectors = k.sectors || new Array(8).fill(0);
        k.cover = k.cover || 0;
      }
      sim.intel = sim.intel || {};
      sim.enemyLog = sim.enemyLog || [];
      sim.situations = sim.situations || [];
      return sim;
    } catch (e) { return null; }
  };

  S.intelOf = function (sim, id) {
    const it = sim.intel[id];
    if (!it) return null;
    const age = sim.t - it.time;
    let status = '实时';
    if (age > 24) status = '情报空白（超 24 小时）';
    else if (age > 12) status = '旧报';
    else if (age > 4) status = '滞后';
    return { x: it.x, z: it.z, strength: it.strength, time: it.time, age, conf: it.conf, source: it.source, status };
  };

  S.canAssault = function (sim, kmtId) {
    const k = sim.kmt.find((x) => x.id === kmtId);
    if (!k || !k.alive) return false;
    let near = 0;
    for (const p of sim.pla) if (!p.dead && dist(p.x, p.z, k.x, k.z) < 16) near++;
    return near >= 2 && k.surrounded;
  };
})();
