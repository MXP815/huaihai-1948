/* ==========================================================================
   世界构建：淮海战场地形（程序化）+ 第一人称战场
   ========================================================================== */
(function () {
  const HX = (window.HX = window.HX || {});
  const U = HX.U, D = HX.DATA;
  const W = (HX.World = {});

  W.BOUNDS = { minX: -210, maxX: 155, minZ: -80, maxZ: 210 };

  /* 当前章节：地形高度/配色/遮蔽/水系按章节配置重建（见 D.CHAPTERS / README §11.2.2） */
  W.chapter = 1;
  W.chapterCfg = D.CHAPTERS ? D.chapterOf(1) : null;
  W.setChapter = function (n) {
    W.chapter = n;
    W.chapterCfg = D.CHAPTERS ? D.chapterOf(n) : null;
  };

  function distSeg(px, pz, ax, az, bx, bz) {
    const vx = bx - ax, vz = bz - az;
    const wx = px - ax, wz = pz - az;
    const c1 = vx * wx + vz * wz;
    const len2 = vx * vx + vz * vz || 0.0001;
    const t = U.clamp(c1 / len2, 0, 1);
    return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
  }
  W.distSeg = distSeg;

  function riverDistance(x, z) {
    let best = 999;
    for (const r of D.RIVERS) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        const d = distSeg(x, z, a[0], a[1], b[0], b[1]) - r.w;
        if (d < best) best = d;
      }
    }
    return best;
  }
  W.riverDistance = riverDistance;

  function leveeDistance(x, z) {
    let best = 999;
    for (const l of D.LEVEES || []) {
      for (let i = 0; i < l.pts.length - 1; i++) {
        const a = l.pts[i], b = l.pts[i + 1];
        const d = distSeg(x, z, a[0], a[1], b[0], b[1]) - l.w / 2;
        if (d < best) best = d;
      }
    }
    return best;
  }
  W.leveeDistance = leveeDistance;

  function waterZoneT(x, z) {
    let best = 0;
    for (const wz of D.WATER_ZONES || []) {
      const dx = (x - wz.x) / wz.rx, dz = (z - wz.z) / wz.rz;
      const t = 1 - (dx * dx + dz * dz);
      if (t > best) best = t;
    }
    return best;
  }
  W.waterZoneT = waterZoneT;

  // 返回距离最近的主河道（用于“主河道不可徒涉”的规则判定）
  W.mainRiverAt = function (x, z, pad) {
    let best = null, bestD = pad || 3;
    for (const r of D.RIVERS) {
      if (!r.main) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        const d = distSeg(x, z, a[0], a[1], b[0], b[1]) - r.w;
        if (d < bestD) { bestD = d; best = r; }
      }
    }
    return best;
  };

  W.heightAt = function (x, z) {
    const n = U.fbm((x + 200) * 0.013, (z + 200) * 0.013, 4);
    const n2 = U.fbm((x - 40) * 0.042, (z + 20) * 0.042, 3);
    let h = n * 7.5 + n2 * 1.4 - 3.2;
    // 开阔平原（双堆集、陈官庄）：压平随机起伏，史实“毫无隐蔽物”，不得出现丘陵
    for (const o of D.OPEN_ZONES || []) {
      const d = Math.hypot(x - o.x, z - o.z);
      if (d < o.r) {
        const w = (1 - d / o.r) * 0.88;
        h = h * (1 - w) + (-3.0) * w;
      }
    }
    // 徐州周边丘陵（云龙山、子房山方向，史实地形概括）
    h += Math.exp(-((x - 6) ** 2 + (z - 4) ** 2) / 900) * 4.0;
    h += Math.exp(-((x + 8) ** 2 + (z - 12) ** 2) / 1600) * 2.6;
    // 微山湖、骆马湖、洪泽湖方向的低洼地
    h -= Math.exp(-((x - 8) ** 2 + (z + 56) ** 2) / 1400) * 5.0;
    h -= Math.exp(-((x - 123) ** 2 + (z - 29) ** 2) / 700) * 4.0;
    h -= Math.exp(-((x - 150) ** 2 + (z - 150) ** 2) / 1600) * 2.4;
    // 废黄河故道堤坝：明显高于两侧农田
    const lv = leveeDistance(x, z);
    if (lv < 9) h += Math.exp(-lv * lv / 6) * 2.8;
    // 水网地带：略低、易积水
    h -= waterZoneT(x, z) * 0.8;
    // 碾庄圩：外壕内台地高于四周（史实土圩高出地面 2–3 m；垂直渲染夸张），壕线处下切
    const nz = D.NIANZHUANG;
    if (nz) {
      const er = Math.hypot((x - nz.x) / nz.rx, (z - nz.z) / nz.rz);
      if (er < 1.25) {
        h += nz.plateauH * Math.max(0, Math.min(1, (1.06 - er) / 0.32));
        h -= nz.moatDepth * Math.exp(-((er - 1.05) ** 2) / 0.008);
      }
    }
    // 河谷下切
    const rd = riverDistance(x, z);
    if (rd < 14) h -= Math.pow(1 - Math.max(0, rd) / 14, 2) * 4.6;
    // 第三章雪原：风吹雪堆（上限 0.55 单位，只是低矮起伏，不构成丘陵/遮蔽）
    const ch = W.chapterCfg;
    if (ch && ch.cover && ch.cover.drifts) {
      const a = ch.area;
      if (x > a.x - a.w / 2 && x < a.x + a.w / 2 && z > a.z - a.h / 2 && z < a.z + a.h / 2) {
        const dn = U.fbm((x + 60) * 0.11, (z - 30) * 0.09, 2);
        h += Math.min(0.55, Math.max(0, dn - 0.18) * 0.8);
      }
    }
    return h;
  };

  /* 碾庄圩外壕：椭圆归一化半径≈1 即壕线，不可徒涉 */
  W.nzMoatAt = function (x, z, pad) {
    const nz = D.NIANZHUANG;
    if (!nz) return false;
    const er = Math.hypot((x - nz.x) / nz.rx, (z - nz.z) / nz.rz);
    return Math.abs(er - 1) < (pad || 0.12);
  };
  W.nzMoatCross = function (x1, z1, x2, z2) {
    const nz = D.NIANZHUANG;
    if (!nz) return false;
    const e1 = Math.hypot((x1 - nz.x) / nz.rx, (z1 - nz.z) / nz.rz);
    const e2 = Math.hypot((x2 - nz.x) / nz.rx, (z2 - nz.z) / nz.rz);
    return (e1 < 1 && e2 >= 1) || (e1 >= 1 && e2 < 1);
  };

  function distToRoute(x, z, routes, pad) {
    let best = 999;
    for (const pts of routes) for (let i = 0; i < pts.length - 1; i++) {
      const d = distSeg(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (d < best) best = d;
    }
    return best;
  }

  function ribbon(pts, width, yOff, palette, dashed) {
    const pos = [], nrm = [], col = [], idx = [];
    const stride = 1.7;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.round(len / stride));
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps, t1 = (s + 1) / steps;
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0;
        const x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
        const nx = -dz / l * width / 2, nz = dx / l * width / 2;
        const y0 = W.heightAt(x0, z0) + yOff, y1 = W.heightAt(x1, z1) + yOff;
        const base = pos.length / 3;
        pos.push(x0 + nx, y0, z0 + nz, x0 - nx, y0, z0 - nz, x1 + nx, y1, z1 + nz, x1 - nx, y1, z1 - nz);
        nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
        let c = palette;
        if (dashed) c = ((Math.floor((i * steps + s) / 2) % 2) === 0 ? palette.b : palette.a);
        col.push(c[0], c[1], c[2], c[3] || 0, c[0], c[1], c[2], c[3] || 0, c[0], c[1], c[2], c[3] || 0, c[0], c[1], c[2], c[3] || 0);
        const arr = Array.isArray(c) ? c : [c.r, c.g, c.b, c.a];
        idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    return { pos, nrm, col, idx };
  }

  function buildTerrain(renderer, b) {
    const ch = W.chapterCfg || (D.CHAPTERS ? D.chapterOf(W.chapter) : null);
    const segX = 176, segZ = 190;
    const pos = [], nrm = [], col = [], idx = [];
    const src = (ch && ch.palette && ch.palette.base) ? ch.palette.base : [
      [0.20, 0.255, 0.20], [0.24, 0.29, 0.215], [0.17, 0.225, 0.205], [0.27, 0.28, 0.19],
      [0.22, 0.24, 0.17], [0.16, 0.21, 0.19]
    ];
    const palettes = src.map((c) => [c[0], c[1], c[2], 0]);
    const macro = (ch && ch.palette && ch.palette.macro) || [1, 1, 1];
    const isNz = !ch || ch.id === 1;
    for (let j = 0; j <= segZ; j++) {
      const z = b.minZ + (b.maxZ - b.minZ) * j / segZ;
      for (let i = 0; i <= segX; i++) {
        const x = b.minX + (b.maxX - b.minX) * i / segX;
        const y = W.heightAt(x, z);
        const e = 0.9;
        const hx = W.heightAt(x + e, z) - W.heightAt(x - e, z);
        const hz = W.heightAt(x, z + e) - W.heightAt(x, z - e);
        const n = [(-hx) / (2 * e), 1, (-hz) / (2 * e)];
        const l = Math.hypot(n[0], n[1], n[2]);
        nrm.push(n[0] / l, n[1] / l, n[2] / l);
        pos.push(x, y, z);
        // 田块与地貌着色（章节调色板 + 宏观色调）
        const id = (Math.floor((x + 160) / 16) * 7 + Math.floor((z + 120) / 13) * 3 + 200) % palettes.length;
        let c = palettes[id];
        const patch = U.fbm((x + 30) * 0.06, (z - 10) * 0.06, 2);
        c = [c[0] * (0.9 + patch * 0.22), c[1] * (0.9 + patch * 0.2), c[2] * (0.92 + patch * 0.16), 0];
        // 章节色调：同一张底图在不同章节呈现不同色温/明度
        c[0] *= macro[0]; c[1] *= macro[1]; c[2] *= macro[2];
        // 水网地带：仅第一章（水网圩寨）偏青绿、略暗
        if (isNz) {
          const wz = waterZoneT(x, z);
          if (wz > 0.02) {
            c[0] = c[0] * (1 - wz * 0.24) + 0.012 * wz;
            c[1] = c[1] * (1 - wz * 0.06) + 0.10 * wz;
            c[2] = c[2] * (1 + wz * 0.16) + 0.04 * wz;
          }
        }
        // 废黄河故道堤坝：土黄色高地带
        const lv = leveeDistance(x, z);
        if (lv < 6) { c[0] *= 1.14; c[1] *= 1.07; c[2] *= 0.96; }
        // 碾庄圩台地：土黄色高地；环壕内偏暗，近景可辨（仅第一章）
        const nzp = D.NIANZHUANG;
        if (isNz && nzp) {
          const er = Math.hypot((x - nzp.x) / nzp.rx, (z - nzp.z) / nzp.rz);
          if (er < 0.90) { c[0] = 0.30; c[1] = 0.26; c[2] = 0.19; }          // 土圩台地：土黄
          else if (er < 1.22) { c[0] = 0.055; c[1] = 0.075; c[2] = 0.09; }  // 环壕：深色水带
        }
        if (y < -1.5) { c[0] *= 0.7; c[1] *= 0.8; c[2] *= 0.9; }
        if (n[1] < 0.78) { c[0] *= 1.12; c[1] *= 1.04; c[2] *= 0.94; }
        // 第三章：雪面随坡度/洼地分层——平地泛白、洼地偏冷蓝
        if (ch && ch.cover && ch.cover.snow) {
          const flat = Math.max(0, Math.min(1, (n[1] - 0.72) / 0.25));
          const snowT = 0.45 + flat * 0.55;
          c[0] = c[0] * (1 - snowT) + 0.70 * snowT;
          c[1] = c[1] * (1 - snowT) + 0.73 * snowT;
          c[2] = c[2] * (1 - snowT) + 0.78 * snowT;
          if (y < -2.2) { c[0] *= 0.92; c[1] *= 0.96; c[2] *= 1.04; }
        }
        col.push(c[0], c[1], c[2], 0);
      }
    }
    for (let j = 0; j < segZ; j++) for (let i = 0; i < segX; i++) {
      const a = j * (segX + 1) + i, bb = a + 1, c = a + segX + 1, d = c + 1;
      idx.push(a, c, bb, bb, c, d);
    }
    return renderer.createStaticMesh(pos, nrm, col, idx);
  }

  W.buildCampaign = function (renderer, quality, chapterId) {
    const ch = D.CHAPTERS ? D.chapterOf(chapterId || W.chapter) : null;
    if (ch) W.setChapter(ch.id);
    const b = W.BOUNDS;
    const staticMeshes = [];
    const terrainMesh = buildTerrain(renderer, b);
    staticMeshes.push({ mesh: terrainMesh, kind: 'terrain' });
    const waterPal = (ch && ch.palette && ch.palette.water) ? ch.palette.water : [0.055, 0.16, 0.19];
    const riverList = (ch && ch.hydro && ch.hydro.rivers) ? D.RIVERS.filter((r) => ch.hydro.rivers.includes(r.name)) : D.RIVERS;
    const canalList = (ch && ch.hydro && !ch.hydro.canals) ? [] : (D.CANALS || []);

    // 河流（水面）——章节独立水系布局
    for (const r of riverList) {
      const data = ribbon(r.pts, r.w * 2.4, -0.55, [waterPal[0], waterPal[1], waterPal[2], 0.0]);
      const water = renderer.createStaticMesh(data.pos, data.nrm, data.col, data.idx);
      staticMeshes.push({ mesh: water, kind: 'hydro' });
    }
    // 河渠（窄水面，冬季可涉渡，仅作地形水网辨识）
    for (const c of canalList) {
      const data = ribbon(c.pts, c.w * 2.0, -0.4, [waterPal[0] * 1.15, waterPal[1] * 1.1, waterPal[2] * 1.05, 0.0]);
      staticMeshes.push({ mesh: renderer.createStaticMesh(data.pos, data.nrm, data.col, data.idx), kind: 'hydro' });
    }
    // 圩寨环形外壕：几何由 game.js drawMoatWorks() 逐段贴地标绘（地形网格较粗，
    // 静态 ribbon 会被插值抹平/悬空），此处不再生成静态网格
    // 废黄河故道堤坝（土黄高地）
    for (const l of D.LEVEES || []) {
      const data = ribbon(l.pts, l.w, 0.12, [0.34, 0.31, 0.22, 0.0]);
      staticMeshes.push({ mesh: renderer.createStaticMesh(data.pos, data.nrm, data.col, data.idx), kind: 'road' });
    }
    // 铁路：道砟 + 枕木条纹
    for (const r of D.RAILS) {
      const data = ribbon(r.pts, 2.4, 0.08, [0.13, 0.13, 0.12, 0.0]);
      staticMeshes.push({ mesh: renderer.createStaticMesh(data.pos, data.nrm, data.col, data.idx), kind: 'rail' });
      const sleepers = ribbon(ptsOffset(r.pts, 0.35), 1.15, 0.13, { a: [0.28, 0.24, 0.19, 0], b: [0.16, 0.15, 0.13, 0] }, true);
      staticMeshes.push({ mesh: renderer.createStaticMesh(sleepers.pos, sleepers.nrm, sleepers.col, sleepers.idx), kind: 'rail' });
    }
    // 公路
    for (const road of D.ROADS) {
      const data = ribbon(road, 2.0, 0.06, [0.30, 0.28, 0.22, 0.0]);
      staticMeshes.push({ mesh: renderer.createStaticMesh(data.pos, data.nrm, data.col, data.idx), kind: 'road' });
    }

    const villages = buildVillages();
    const trees = buildTrees(b, villages, quality, ch);

    return {
      staticList: staticMeshes,
      heightAt: W.heightAt,
      villages,
      trees,
      bounds: b,
      chapter: ch ? ch.id : 1,
      paletteId: ch && ch.palette ? ch.palette.id : 'earth-green',
      area: ch ? ch.area : null
    };
  };

  function ptsOffset(pts, d) {
    // 铁路中心线微调，避免与道砟完全共面
    return pts.map((p) => [p[0] + d * 0.2, p[1] + d * 0.2]);
  }

  function buildVillages() {
    const villages = [];
    const all = D.CITIES.slice();
    // 补充乡镇级别村落，使地图有密度
    const extra = [
      { name: '土山', x: 62.2, z: 0 }, { name: '八义集', x: 54.2, z: -2.8 }, { name: '姚集', x: 77.2, z: 1.4 },
      { name: '时村', x: -11.5, z: 70.9 }, { name: '大李集', x: 48.4, z: 8.3 }, { name: '双沟', x: 42, z: 43 },
      { name: '芦沟', x: 80, z: 70 }, { name: '南坪', x: -38, z: 98.7 }, { name: '赵集', x: -49.6, z: 112.5 },
      { name: '蕲县', x: -15, z: 88.9 }, { name: '百善', x: -49.6, z: 75 }, { name: '临涣', x: -66.8, z: 77.8 },
      { name: '马桥', x: -72.6, z: 70.9 }, { name: '刘河', x: 8.1, z: 140.4 }, { name: '曹老集', x: 19.6, z: 168.3 },
      { name: '新桥', x: 46, z: 120 }, { name: '薛集', x: -61.1, z: 63.9 }, { name: '黄集', x: -113, z: 80.6 },
      { name: '永堌', x: -50, z: 24 }, { name: '濉溪口', x: -47.3, z: 47.3 }
    ];
    const groups = all.concat(extra.map((e) => ({ name: e.name, x: e.x, z: e.z, kind: 'village' })));
    for (const g of groups) {
      const rnd = U.rng(Math.abs(Math.round(g.x * 31 + g.z * 17)) + 13);
      // 碾庄圩：村落收缩到外壕以内，避免房屋盖住台地与环壕
      const isNz = g.id === 'nianzhuang';
      const count = isNz ? 12 : (g.kind === 'city' ? 34 : g.kind === 'town' ? 16 : 8);
      const spread = isNz ? 3.0 : (g.kind === 'city' ? 15 : g.kind === 'town' ? 9 : 6);
      const houses = [];
      const nzp = D.NIANZHUANG;
      for (let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2, r = (isNz ? 1.2 : 2) + rnd() * spread;
        const x = g.x + Math.cos(a) * r, z = g.z + Math.sin(a) * r * 0.8;
        if (riverDistance(x, z) < 4) continue;
        // 环壕带不建房，避免房屋盖住台地与壕沟
        if (nzp) {
          const er = Math.hypot((x - nzp.x) / nzp.rx, (z - nzp.z) / nzp.rz);
          if (er > 0.82 && er < 1.55) continue;
        }
        const w = 2.0 + rnd() * 3.0, d = 1.6 + rnd() * 2.4, h = 1.1 + rnd() * 1.2;
        houses.push({ x, z, w, d, h, rot: (rnd() - 0.5) * 0.7, y: W.heightAt(x, z) });
      }
      villages.push({ name: g.name, x: g.x, z: g.z, kind: g.kind, houses });
    }
    return villages;
  }

  function inArea(x, z, a) {
    return a && x > a.x - a.w / 2 && x < a.x + a.w / 2 && z > a.z - a.h / 2 && z < a.z + a.h / 2;
  }

  function buildTrees(b, villages, quality, ch) {
    const trees = [];
    const rnd = U.rng(991);
    const cover = (ch && ch.cover) || { trees: 1, treeInArea: 1 };
    const n = Math.round(760 * (quality && quality.density ? quality.density : 1) * (cover.trees == null ? 1 : cover.trees));
    for (let i = 0; i < n; i++) {
      const x = b.minX + 6 + rnd() * (b.maxX - b.minX - 12);
      const z = b.minZ + 6 + rnd() * (b.maxZ - b.minZ - 12);
      if (riverDistance(x, z) < 5) continue;
      // 碾庄圩外壕周边保持空旷，避免树木遮住环壕
      if (D.NIANZHUANG && Math.hypot((x - D.NIANZHUANG.x) / D.NIANZHUANG.rx, (z - D.NIANZHUANG.z) / D.NIANZHUANG.rz) < 1.6) continue;
      // 双堆集、陈官庄为开阔平原（史实“毫无隐蔽物”），不生成树林
      let inOpen = false;
      for (const o of D.OPEN_ZONES || []) if (Math.hypot(x - o.x, z - o.z) < o.r) { inOpen = true; break; }
      if (inOpen) continue;
      // 章节遮蔽物配置：第二章/第三章作战区内无树（保持平原/雪原通视）
      if (cover.treeInArea === 0 && inArea(x, z, ch.area)) continue;
      if (W.heightAt(x, z) < -1) continue;
      let near = false;
      for (const v of villages) if (Math.hypot(x - v.x, z - v.z) < 7) { near = true; break; }
      if (near) continue;
      if (distToRoute(x, z, D.RAILS, 0) < 3 || distToRoute(x, z, D.ROADS, 0) < 3) continue;
      trees.push({ x, z, y: W.heightAt(x, z), s: 0.75 + rnd() * 0.9, rot: rnd() * 6.28, kind: rnd() > 0.72 ? 1 : 0 });
    }
    return trees;
  }

  /* ---------------- 第一人称战场 ---------------- */
  W.buildArena = function (renderer, seed, chapterId) {
    const rnd = U.rng(seed || 7);
    const ch = D.CHAPTERS ? D.chapterOf(chapterId || W.chapter) : null;
    const cid = ch ? ch.id : 1;
    const isSnow = !!(ch && ch.cover && ch.cover.snow);
    const staticMeshes = [];
    const covers = [];
    const spawns = [];

    // 地面：90×90，带轻微起伏与弹坑
    const seg = 48, size = 92;
    const pos = [], nrm = [], col = [], idx = [];
    const craters = [];
    for (let i = 0; i < 14; i++) craters.push({ x: (rnd() - 0.5) * 62, z: (rnd() - 0.5) * 62, r: 2 + rnd() * 2.4 });
    const gh = (x, z) => {
      let h = U.fbm((x + 50) * 0.035, (z + 50) * 0.035, 2) * 1.4 - 0.6;
      for (const c of craters) {
        const d = Math.hypot(x - c.x, z - c.z);
        if (d < c.r * 2.2) h -= Math.pow(1 - d / (c.r * 2.2), 2) * 0.85;
      }
      return h * 0.55;
    };
    W.arenaHeight = gh;
    for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
      const x = -size / 2 + size * i / seg, z = -size / 2 + size * j / seg;
      const y = gh(x, z);
      pos.push(x, y, z);
      const e = 0.5, hx = gh(x + e, z) - gh(x - e, z), hz = gh(x, z + e) - gh(x, z - e);
      const l = Math.hypot(hx, 1, hz);
      nrm.push(-hx / l, 1 / l, -hz / l);
      const mud = U.fbm(x * 0.15 + 9, z * 0.15, 2);
      let c;
      if (isSnow) {
        // 第三章：积雪/冻土——平地泛白，弹坑与低洼处露出冻土
        c = y < -0.5 ? [0.30, 0.33, 0.37] : [0.58 + mud * 0.05, 0.61 + mud * 0.04, 0.66 + mud * 0.04];
      } else if (cid === 2) {
        // 第二章：双堆集开阔耕地，干燥黄褐、无绿意
        c = y < -0.5 ? [0.22, 0.20, 0.16] : [0.32 + mud * 0.04, 0.30 + mud * 0.04, 0.23 + mud * 0.03];
      } else {
        c = y < -0.5 ? [0.16, 0.15, 0.12] : [0.22 + mud * 0.05, 0.23 + mud * 0.04, 0.17];
      }
      col.push(c[0], c[1], c[2], 0);
    }
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b2 = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, c, b2, b2, c, d);
    }
    const ground = renderer.createStaticMesh(pos, nrm, col, idx);
    staticMeshes.push({ mesh: ground });

    // 弹坑视觉（暗色薄盘）
    const deco = { houses: [], walls: [], boxes: [], craters: [], trees: [], fires: [], trenches: [] };

    // 村舍废墟：第一/三章为圩寨村落；第二章只保留 2 处，强调开阔地
    const ruinAll = [
      { x: -18, z: -16, w: 9, d: 7, h: 2.4, rot: 0.1 },
      { x: -10, z: -24, w: 7, d: 6, h: 3.1, rot: -0.2 },
      { x: 16, z: -22, w: 8, d: 6, h: 2.2, rot: 0.3 },
      { x: 24, z: -8, w: 6, d: 8, h: 2.8, rot: 0 }
    ];
    const ruins = cid === 2 ? ruinAll.slice(0, 2) : cid === 3 ? ruinAll.slice(0, 3) : ruinAll;
    for (const r of ruins) {
      deco.houses.push(r);
      // 墙体碰撞盒（近似）
      covers.push({ x: r.x, z: r.z, w: r.w, d: r.d, h: r.h, solid: true });
    }

    // 沙袋/土墙掩体：第一/三章为村口工事；第二章为汽车/弹药箱围成的低矮环形阵地
    const wallAll = [
      { x: -6, z: 6, w: 12, d: 1.2, h: 1.1, rot: 0.05 },
      { x: 14, z: 2, w: 8, d: 1.1, h: 1.0, rot: -0.35 },
      { x: 0, z: -12, w: 9, d: 1.2, h: 1.2, rot: 0.2 },
      { x: -22, z: -2, w: 6, d: 1.1, h: 0.9, rot: -0.1 },
      { x: 26, z: -18, w: 9, d: 1.2, h: 1.1, rot: 0.5 },
      { x: -4, z: -30, w: 14, d: 1.3, h: 1.3, rot: 0.02 },
      { x: 20, z: 12, w: 7, d: 1.0, h: 0.9, rot: 0.8 },
      { x: -26, z: 14, w: 8, d: 1.1, h: 1.0, rot: -0.6 }
    ];
    let walls = wallAll;
    if (cid === 2) {
      // 猬集环形围沟：12 段矮墙围成一圈，留南侧接近路
      walls = [];
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        if (Math.abs(a - 1.35) < 0.22) continue; // 预留接近路
        walls.push({ x: Math.cos(a) * 16, z: Math.sin(a) * 11 - 2, w: 7, d: 1.0, h: 1.0, rot: -a + Math.PI / 2 });
      }
    } else if (cid === 3) {
      // 雪原：低矮雪墙/冻土壕沿，减少连续高墙
      walls = walls.slice(0, 5);
    }
    for (const w of walls) {
      deco.walls.push(w);
      covers.push({ x: w.x, z: w.z, w: w.w, d: w.d, h: w.h, rot: w.rot, solid: true });
    }
    // 车辆残骸 / 弹药箱
    const boxAll = [
      { x: 8, z: -6, w: 4.2, d: 2.0, h: 1.6, rot: 0.4, kind: 'truck' },
      { x: -14, z: -36, w: 3.4, d: 1.8, h: 1.4, rot: 1.1, kind: 'truck' },
      { x: 30, z: -4, w: 1.5, d: 1.0, h: 1.0, rot: 0.2, kind: 'crate' },
      { x: -30, z: -20, w: 1.4, d: 1.2, h: 1.1, rot: 0.6, kind: 'crate' },
      { x: 4, z: 14, w: 1.8, d: 1.0, h: 1.2, rot: -0.3, kind: 'crate' },
      { x: -20, z: 4, w: 3.2, d: 1.6, h: 1.3, rot: 0.2, kind: 'wreck' }
    ];
    let boxList = boxAll;
    if (cid === 2) {
      // 双堆集：大量汽车残骸与弹药箱堆，形成黄维“汽车防线”的视觉标志
      boxList = boxAll.slice(0, 2).concat([
        { x: 10, z: -18, w: 4.0, d: 1.9, h: 1.5, rot: 0.5, kind: 'truck' },
        { x: -12, z: -14, w: 3.6, d: 1.8, h: 1.4, rot: -0.4, kind: 'wreck' },
        { x: 22, z: 2, w: 2.2, d: 2.2, h: 1.3, rot: 0.1, kind: 'crate' },
        { x: -24, z: -32, w: 2.4, d: 2.0, h: 1.2, rot: 0.3, kind: 'crate' },
        { x: 2, z: -28, w: 2.6, d: 2.2, h: 1.3, rot: -0.2, kind: 'crate' }
      ]);
    } else if (cid === 3) {
      // 陈官庄：空投箱与冻僵的车辆残骸
      boxList = boxAll.concat([
        { x: -6, z: -14, w: 2.4, d: 1.6, h: 1.1, rot: 0.7, kind: 'crate' },
        { x: 12, z: 6, w: 2.0, d: 1.4, h: 1.0, rot: -0.5, kind: 'crate' }
      ]);
    }
    for (const b2 of boxList) {
      deco.boxes.push(b2);
      covers.push({ x: b2.x, z: b2.z, w: b2.w, d: b2.d, h: b2.h, rot: b2.rot, solid: true });
    }
    for (const c of craters) deco.craters.push(c);

    // 树线：第一章有树；第二、三章为开阔平原/雪原，仅留少量远树或不留
    const treeN = cid === 1 ? 18 : isSnow ? 2 : 0;
    for (let i = 0; i < treeN; i++) {
      const a = rnd() * Math.PI * 2, r = 30 + rnd() * 14;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      deco.trees.push({ x, z, y: gh(x, z), s: 0.8 + rnd() * 0.7, rot: rnd() * 6.28 });
    }
    // 壕沟体系：非实体障碍（人可以进入），仅用于炮火掩护分级与视觉
    const trenchList = [];
    if (cid === 1) {
      // 碾庄圩外壕前沿：断续壕段，炮火落在这里时壕内减免明显
      for (let i = 0; i < 5; i++) trenchList.push({ x: -28 + i * 13, z: -9, w: 10.5, d: 1.0, rot: 0.06 * (i % 2 ? 1 : -1) });
      for (let i = 0; i < 3; i++) trenchList.push({ x: -20 + i * 18, z: -26, w: 12, d: 1.0, rot: 0 });
    } else if (cid === 2) {
      // 双堆集汽车/弹药箱围沟：环形壕沟与矮墙平行
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        if (Math.abs(a - 1.35) < 0.22) continue;
        trenchList.push({ x: Math.cos(a) * 17.2, z: Math.sin(a) * 11.8 - 2, w: 6.6, d: 0.9, rot: -a + Math.PI / 2 });
      }
    } else {
      // 陈官庄雪原：冻土壕沿，短段分布
      trenchList.push({ x: -18, z: -14, w: 11, d: 1.0, rot: 0.1 });
      trenchList.push({ x: 8, z: -12, w: 9, d: 1.0, rot: -0.2 });
      trenchList.push({ x: -4, z: 2, w: 12, d: 1.0, rot: 0.05 });
    }
    for (const t of trenchList) deco.trenches.push(t);

    // 火点（舞台氛围）
    deco.fires.push({ x: -17, z: -14, y: 2.2 }, { x: 25, z: -20, y: 2.0 });

    // 敌我推进出发点
    spawns.player = { x: 6, z: 24 };
    spawns.enemy = [];
    for (let i = 0; i < 10; i++) {
      spawns.enemy.push({ x: -26 + i * 6 + rnd() * 3, z: -26 - rnd() * 8 });
    }
    spawns.ally = [];
    for (let i = 0; i < 4; i++) spawns.ally.push({ x: -12 + i * 8, z: 16 + rnd() * 4 });

    return { staticList: staticMeshes, deco, covers, spawns, heightAt: gh, chapter: cid };
  };

  W.isBlocked = function (arena, x, z, rad) {
    for (const c of arena.covers) {
      if (!c.solid) continue;
      const dx = x - c.x, dz = z - c.z;
      const cos = Math.cos(-(c.rot || 0)), sin = Math.sin(-(c.rot || 0));
      const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      if (Math.abs(lx) < c.w / 2 + rad && Math.abs(lz) < c.d / 2 + rad) return c;
    }
    return null;
  };

  W.losBlocked = function (arena, ax, az, bx, bz) {
    const steps = 14;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const c of arena.covers) {
        if (!c.solid || c.h < 0.6) continue;
        const dx = x - c.x, dz = z - c.z;
        const cos = Math.cos(-(c.rot || 0)), sin = Math.sin(-(c.rot || 0));
        const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
        if (Math.abs(lx) < c.w / 2 && Math.abs(lz) < c.d / 2) return true;
      }
    }
    return false;
  };

  W.nearestCover = function (arena, x, z, fromX, fromZ, maxR) {
    let best = null, bd = maxR || 20;
    for (const c of arena.covers) {
      if (!c.solid || c.h < 0.8) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d > bd) continue;
      // 掩体应位于敌人（from）与我之间
      const toEnemy = Math.hypot(c.x - fromX, c.z - fromZ);
      const around = Math.atan2(c.z - fromZ, c.x - fromX);
      const bp = Math.atan2(z - fromZ, x - fromX);
      let da = Math.abs(((around - bp + Math.PI * 2.5) % (Math.PI * 2)) - Math.PI);
      if (da > 1.5) continue;
      best = c; bd = d;
    }
    return best;
  };

  /* 炮火掩护分级：open / crater / wall / trench / house
     与战役层碾庄外壕同一思路——壕内与圩寨内减免明显，开阔地最惨 */
  function inRect(x, z, r, pad) {
    const p = pad || 0;
    const dx = x - r.x, dz = z - r.z;
    const c = Math.cos(-(r.rot || 0)), s = Math.sin(-(r.rot || 0));
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < r.w / 2 + p && Math.abs(lz) < r.d / 2 + p;
  }
  W.inTrench = function (arena, x, z) {
    for (const t of (arena.deco && arena.deco.trenches) || []) if (inRect(x, z, t, 0.55)) return true;
    return false;
  };
  W.coverClass = function (arena, x, z) {
    for (const h of (arena.deco && arena.deco.houses) || []) if (inRect(x, z, h, 0.8)) return 'house';
    for (const t of (arena.deco && arena.deco.trenches) || []) if (inRect(x, z, t, 0.55)) return 'trench';
    for (const c of arena.covers) {
      if (!c.solid || c.h < 0.75) continue;
      if (inRect(x, z, c, 0.7)) return 'wall';
    }
    for (const c of (arena.deco && arena.deco.craters) || []) if (Math.hypot(x - c.x, z - c.z) < c.r) return 'crater';
    return 'open';
  };
})();
