# 开发进度与续做指引（PROGRESS）

> 快照时间：2026-11-05 22:35（本地）
> 文档版本：`v2026.11.05-rc10`（代码/构建同为 `rc9`；本文档 rc10 为 MySQL 实测补记）
> 构建产物：`index.html` **503,838 字节**；`cinematics.html` **494,546 字节**（22:14:13）
> 数据库：**MySQL 8.0.36 / 库 `hx1948` / 127.0.0.1:3306，已于 2026-11-05 22:22–22:34 实测通过**（H2 仅作无库环境的回退）
> 交付目录：`D:\新\淮海战役`（唯一真源）；后端 `server/`；桌面壳 `desktop/`
> 入口：`index.html`（双击可玩 / 也可由后端同端口托管 / 也可由 Electron 加载）；过场：`cinematics.html`；源码：`src/`；构建：`node build.js`
> 测试全程静默：`?mute=1` + `--mute-audio` + headless（Edge）。

---

## 0. 一句话结论

已完成 **8 个**功能块（碾庄三修正 → 三章差异化 → 敌军事件驱动 → 炮火准备 → 寻路 → 过场动画与配音 → 手机端适配 → **前后端分离 + Electron 桌面端 + 手机同端口托管**），每块都有实测数值与回归；第 **9 块「30 分钟长跑」仍未完成**：`tools/longrun_30min.json` 目前只有一次 **40 秒冒烟**（9 条采样 / 间隔 5s / `wall_s=40`），不能当 30 分钟结论（见 §2.2）。

**本轮（前后端分离）已经用真实 MySQL 跑通**：库 `hx1948`（MySQL 8.0.36，`utf8mb4` / `utf8mb4_0900_ai_ci`，端口 3306），`schema.sql` 自动建出 `save_slot` 与 `after_action`（各 11 列），Electron 便携版存档 → 命令行查表有真实行 → 杀后端 → 重启 → 应用内读回 **8 组字段全部 `same`**，`auto` 槽与结局表各落一行，同内容重放 `idempotent:true` 且 `version` 不涨。原始输出见 `tools/mysql_verify_output.txt` / `tools/mysql_idempotent.txt`。凭证只经环境变量传入，工作区 0 命中明文密码。H2 2.2.224 `MODE=MySQL` 降级为「没有 MySQL 时的开发回退」，不再作为验证依据。其余回归（三章、战役层反应、碾庄环壕、炮火、寻路、三档节奏、存档、过场同步、触屏链路、三档画质）全部保持通过。本文件按「断电后能否续做」组织：块清单 + 关键数字 + 参数行号 + 首指令。

---

## 1. 已完成块清单（按完成顺序，含关键数字与位置）

### 1.1 碾庄三修正（史实口径 + 环壕不可徒涉）
- **外壕独立成障碍类**：`D.MOATS`（`src/data.js` L98–101）`{ rx:7.0, rz:5.8, w:1.2, impassable:true, bridge:false }`，不再与「窄浅可涉渡」河渠共用。
- **跨壕代价**：`S.MOAT`（`src/sim.js` L23–26）`routeMul 0.36 / timeMul 2.8 / casMul 2.4 / dmgMul 0.55 / prepHours 72 / assaultLimit 90 / assaultHP 80`；实测跨壕耗时 **×2.78**、`impassable=true`、壕宽 1.2。
- **台地**：碾庄土圩台地 **+2.2**（`D.CHAPTERS[1].terrainUnits`，`src/data.js` L121+）。
- **破壕作业 72h**：未破壕硬冲 → 我方伤亡 **×2.4**、对敌伤害 **×0.55**（`S.applyBattle`，`src/sim.js` L1392–1425）。
- **未破壕硬冲的复用语**：炮火准备不足时沿用同一 `casMul` 通道（见 1.4）。

### 1.2 三章差异化（一张连续史实底图，运行期重建）
- 配置：`D.CHAPTERS`（`src/data.js` L121–188）；地形重建 `W.setChapter`（`src/world.js` L14）、关卡构建 `W.buildArena`（`src/world.js` L382）。
- 实测三章：
  - 第一章 碾庄圩：`earth-green`，作战区 **105.6×76.8 km**，作战区内树 **39**，圆盘 r14 高差 **5.98**；
  - 第二章 双堆集：`dust-grey`，**96×76.8 km**，树 **0**，高差 **3.37**；开阔地压平（`D.OPEN_ZONES` L104–107）；
  - 第三章 陈官庄：`snow-steel`，**67.2×51.2 km**，树 **0**，高差 **7.59**（王引河谷）。
- **陈官庄合围尺度**：`D.ENCIRCLE.chenguangzhuang = { rx:6.25, rz:3.125 }`（`src/data.js` L110–115），按 0.8 km/单位 → **东西 10 km、南北 5 km**；`group = k2/k13/k16/kzu`。
- 差异化七项：作战区取景、地形单元组、色调、遮蔽物、水系布局、兵力密度、FPS 场景；**不拆底图**（坐标一致性优先）。

### 1.3 敌军事件驱动反应（延迟情报，不做全知）
- 延迟情报：`D.ENEMY_INTEL`（`src/data.js` L201–206）`delayH k7=3h / k12=4h / kzu·k2·k13·k16=5h`、`snapEvery 3h`、`confBase 62 ± 18`、`sustainH 6`。
- 反应表：`D.KMT_REACTIONS`（`src/data.js` L207–244）、索引 `D.REACTION_OF`（L245）；逻辑 `S.enemyReactions / reactHuangwei / reactXuzhou / liaoReaction`（`src/sim.js` L472 / 492 / 536 / 553）。
- 实测触发（同 seed）：
  - 开放西南通道 → `xuzhou_retreat_sw@462`（第 462 模拟小时）、`huangwei_hedgehog@466`、`liao_defect@504`；四个军改 `retreatSW`；
  - 封锁西南 → `xuzhou_breakout_se@462`，k2/k13/k16/kzu 改 `breakoutSE`；
  - 松散包围 → `huangwei_breakout_se@466`（k12 改 `breakoutSE`）。
- 机制要点：情报每 3h 采样、经 3–5h 延迟才到；扇区判断 ±1 错判；条件需持续 6h 才转化；**不会**对玩家当前部署即时反应。

### 1.4 炮火准备（与战役层弹药/特纵炮兵真实耦合）
- 参数：`D.ARTILLERY`（`src/data.js` L651–666）；计划 `S.artilleryPlan`（`src/sim.js` L1312）、单发 `S.shellDamage`（L1339）、扣弹 `S.consumeArtillery`（L1346）、总攻耦合 `S.applyBattle`（L1392）。
- 四档：平均弹药 **≥62 full / ≥38 partial / ≥18 weak / <18 none**；时长 **9 / 5.5 / 2.4 / 0s**；弹数 **24/14/6/0**；半径 **18/12/6.5/0**；对敌系数 **1/0.82/0.58/0**；弹药消耗 **8/5/2/0**；疲劳 **+4**（疲劳过高降一档）。
- 单发：`78 × dmgMul × (1−d/7)^1.4 × coverMul`，`shellRadius 7`；掩体 **开阔 1.0 / 弹坑 0.82 / 墙后 0.42 / 壕内 0.26 / 屋内 0.5**（实测距爆心 0.6：**68.8 / 56.4 / 28.9 / 17.9 / 34.4**，壕内 = 开阔的 26%）。
- 实测：full 9s/24 发 → 命中 28–29、杀伤 **854–861**、敌军存活 5；weak 2.4s/6 发 → 命中 9、杀伤 **160–161**、存活 9–10；扣弹 **90→82**、疲劳 16；提前冲锋 `skipped` 已落 3 发、敌火伤害 ×2.4。
- 伤亡：full +40 vs weak/none/skipped **+96**（×2.4）；与环壕 `casMul` 相乘，上限 4。
- 指挥层提示：`G.startAssault`（`src/game.js` L1477）在下令时算档位，弹药不足直接提示「炮火准备不足（伤亡×N）」。

### 1.5 寻路（网格 A* + 平滑 + 局部避让 + 预算）
- 参数：`NAV`（`src/fps.js` L19–24）`cell 0.6 / half 46 / radius 0.45 / trenchCost 1.15 / maxPerFrame 4 / replan 3.0 / wpReach 0.45 / stuckT 0.6`。
- 网格 `buildNav`（L638）：154×154 = **23,716 格**；第二章 **1,811 格不可通行、196 格壕沟**；`W.isBlocked`（`src/world.js` L552）膨胀 0.45。
- A*（L670 起）：8 邻、禁斜切角、八角启发、二叉堆 + 池化数组；单次 **0.1–0.3ms**；平滑 `smoothPath` 用 `navClear`（步长 0.5）。
- 移动入口 `moveTo`（L831）；局部避让 `separation`（1.6 单位、权重 0.4）；0.6s 无位移丢路径重算。
- 协同不变：`updateSquad`（L887）、`tacticalMove`（L950）、`e.flankPick` 仅在情报更新时重算锚点。
- 实测（同场景 seed=7、第二章、炮火 none）：
  - A 站位（玩家 12,18）：侧翼到位 **13.00s → 12.70s**；卡顿采样 **143 → 82**（−43%）；前 12s 净位移/里程 **159.59/166.33=0.959 → 185.37/187.01=0.991**（绕远 4.1%→0.9%）。
  - B 站位（玩家 −12,20）：侧翼 **24s 内未到位 → 19.45s**；卡顿 **299 → 185**（−38%）；里程/净位移 108.95→**145.44**（+33%）；比值 0.943→0.932（未改善，如实记录）。
  - 障碍测试：在 (0,-6) 插 **15×2.6、高 3.4** 实体墙（横在壕沟与围沟之间）→ 穿墙 **0** 次、最小间距 **1.11**、20s 内 **0** 卡死采样、**12.65s** 完成包抄；截图 `shots/nav-01-obstacle.png`。
  - 性能：rAF **59.3–59.6fps**、frameMsAvg **1.10–1.11ms**、updateMsAvg **0.133ms**、draws **9**、instances **114**、tris **5968**；寻路调用 152 次/20s、丢弃 43（预算）、命中缓存 4,516、失败 9。
- 注意：FPS 竞技场里**没有**碾庄那道深水环壕几何；浅壕可进入但代价 ×1.15（为了保留壕内炮火减免）；**未实现架桥/涉渡**。

### 1.6 前序基础（不属本轮，但续做需要知道）
- 两阶段玩法：战役指挥 + 第一人称前线 + 程序化过场（`HX.Game / HX.Sim / HX.FPS / HX.World / HX.UI / HX.Audio`）。
- 三档节奏：从容 / 标准 / 紧迫；存档键 `hx1948_save`（实测 t=123.5、phase=2 完整恢复，enemyLog 1、situations 1）。
- 前线协同：两小组 fire/flank、阶段 `prepare/fireflank/assault/bounding/clear`、通信延迟 1.4s、情报老化 3.4s 后误差 0.9 单位/秒；喊话 5 条 + 光环 5 色。

### 1.7 过场动画与配音（8 段 / 24 镜头 / 25 个 WAV）
- **日期地点对齐** `refs/timeline.md`：11.06 徐州以东·新安镇方向 34s；11.11 碾庄圩·运河以西 30s；11.22 碾庄圩·近迫作业之后 31s；11.25 双堆集·浍河以南 30s；11.27 双堆集以南·第八十五军阵地 30s；12.04 陈官庄/青龙集/李石林 34s；12.15 双堆集·大小马庄一带 30s；1949.01.10 陈官庄·郭楼东南 40s。**总时长 259s**，数据 `src/data.js:531`。
- **运镜**：推 6 / 拉 6 / 摇 4 / 移 8（24 镜，每段 ≥2 种）；每镜有 `from/to` 机位 + 目标点 + FOV，起落幅明确；机位高度用 `W.heightAt` 换算（避免埋地）；镜头两端 0.6s 黑场（`src/cine.js:41`），段间不硬切。
- **角色动画**（低多边形，均有连续位移 + 姿态变化）：行军纵队 16 人 + 骡马小车（`:280`）；指挥所 2 人 + 手臂前伸 0.55+0.38·sin（`:302`）；炮兵 3 门 + 后坐 / 炮口焰 / 装填手（`:321`）；担架队 3 组（`:348`）；支前民工 6 组（`:362`）；俘虏 10 人（`:381`）。
- **旁白**：Windows SAPI（`Microsoft Huihui Desktop`，16 kHz / 16-bit / 单声道，`Rate=-1`），**机械音质，不是真人配音**；25 个 WAV / 合计 181.19s，`assets/voice/`。文本由 `tools/gen_voice_manifest.js` 从 `src/data.js` 导出 `tools/cine_voice.json`，`tools/gen_voice.ps1` 逐个合成——**字幕与 WAV 同源同字**。
- **音画同步**（真实时间跑完 8 段，墙钟 263.6s）：字幕出现与 `play()` 同一 tick（**0 ms**）；触发时刻相对时间轴 **-21.3 ~ +30.7 ms**（均值 +13.2 ms，帧步进）；出声晚于字幕 **31.4–122.3 ms（均值 51.7 ms）**；0 文件失败、无 muted 回退。钩子 `C.avReport()`（`src/cine.js:486`）。
- **失败回退**：缺 WAV → 纯字幕 + 注「（合成语音缺失，仅字幕）」；`?mute=1` 全关旁白。菜单 / 页脚 / 帧内 HUD 均标注「本机合成旁白（机械音质）」。
- **验收截图**：`shots/cin-01-a…cin-08-b`（16 张，1600×900，起幅/落幅）。

### 1.8 手机端适配（竖屏/横屏、触控、44px、画质三档）
- **验证方式（先说明）**：没有真机。全部用 Playwright + Edge headless 的**浏览器触控仿真**：`viewport 390×844 / 844×390`、`deviceScaleFactor 3`、`isMobile + hasTouch`，并用 CDP `Emulation.setTouchEmulationEnabled{maxTouchPoints:5}` 派发真实 `Input.dispatchTouchEvent`（单指拖动、双指捏合/平移、点按）。**不是**真机、不是手机 GPU；帧率数字来自桌面 Iris Xe + CPU 降速/软件渲染模拟。
- **UI 重排**（`src/styles.css` 末尾移动端块；`src/index_template.html` 顶栏新增 `.tb-mob` 三按钮）：
  - 竖屏：顶栏改为 3 行（高 **183px**），底栏 2 行（**112px**）；`.dock-left/.dock-right` 变底部抽屉，`bottom = safe-area + 124px`，一次只开一个（序列/战报/指挥互斥），实测与顶栏/底栏重叠面积 **0 px²**。
  - 横屏 844×390：顶栏单行 **52px**（横向滚动）、底栏 **54px**；抽屉 `max-height 64vh`。
  - 44×44 触控目标：竖屏首页 **17 个可见控件 0 个不达标**；指挥抽屉 **25 个 0 个不达标**；横屏首页 **17/0**、抽屉 **21/0**（`probe_mobile.js` 的 `auditTargets`）。
  - 抽屉/战报/指挥按钮本身 44px 高，浮层 `#perf` 移到 `top:194px`，不再压住底栏按钮；FPS 退出键 `z-index:9`，实测触屏可直接退出。
- **触控操作实测**（竖屏 390×844）：
  - 地图拖动：yaw **0.86→0.31**、pitch **0.72→0.855**；双指捏合 dist **118→68.1**；新增**双指平移**（`panCamera`，内容跟手），平移后再点选。
  - 点选部队：点 `8纵` → `sel=['hy8']`，toast「已选中 8纵 · 点“指挥”可下达命令」。
  - 下达命令：指挥抽屉→行军→点地图 → `order=move`、`dest=(108.1,-24.8)`，toast「1 支部队受命」。
  - 沙盘推演：`#btnPlan` 触屏打开，`#modalWrap` 可见；舆图：拖动 `ox/oy 0→60/50`、双指 `zoom 1→2`。
  - FPS：触屏总攻进入（`active=true`）；虚拟摇杆把玩家从 (4,18) 走到 **(6.7,18)**；开火 600ms 弹药 **30→24**；触屏退出成功。
- **渲染自适应**（`src/engine.js` resize + `src/game.js` `QUALITY`/`pickQuality`）：按 `devicePixelRatio`、像素预算与屏幕尺寸取 `effDpr`；实测高/中/低画布 **585×1266 / 390×844 / 292×633**（DPR 上限 1.5/1.0/0.75）。
  - 三档降级项：高 阴影2048·MSAA4·树步长1·绘制距离430；中 阴影1536·MSAA4·树步长2·绘制距离310；低 **关阴影**·MSAA2·树步长4·绘制距离210·关泛光。
  - 帧率（10s 实测，竖屏）：正常 GPU **60.1 / 60.1 / 60.0**；CPU 6× 降速 **39.9 / 43.7 / 48.0**（p95 50.0/49.9/33.4ms）；软件渲染 **11.5 / 16.9 / 30.2**。**最低可玩 = 低画质**（软件渲染下唯一 ≥30fps 且 p95≤33.4ms 的档位）；弱 CPU 下高档已掉到 ~40fps，建议手机默认中/低。原始数据 `tools/quality_fps.json`。
- **同时修掉的真实缺陷**：
  1. `groundPoint` 在相机位于地图边界外时提前 `break` → 返回 null，**右键/触屏下达命令长期静默失效**（`src/game.js`）；改为沿射线扫到地面并夹回边界。
  2. 模板缺少 `#toastWrap`，`UI.toast` 一直是空操作；已补容器（移动端 toast 改到底部 160px）。
  3. 竖屏开局相机只框空地；`frameOpening` 在 `resumeCampaign` 把最近 6 支我军框进画面（`dist 118→170`）。
  4. FPS 退出键被触控层遮挡；补 `z-index:9` 并把 `top` 调到 196px（避开目标面板），实测触屏可直接退出。
  5. 窄屏 FPS 战术指令面板与战报浮层/弹药 HUD 字压字；展开指令时 `body.fps-cmd` 隐藏 `.toast-wrap` 与 `.hud-bottom`（`src/ui.js` `UI.fpsWheel`，`src/styles.css` 移动端块），指令行改 `flex-wrap` + 描述独占一行 + `max-height/overflow:auto`。
- **截图**：`shots/mob-portrait-*.png`（home/oob/log/cmd/select/pending/sandbox/map2d/fps/fps-fire/zoom）、`shots/mob-landscape-*.png`（home/cmd/order）、`shots/mob-portrait-q-high|mid|low.png`。

### 1.9 前后端分离 + Electron 桌面端 + 手机同端口托管（本轮，rc9）

**目标形态（三条，抖音小游戏已取消）**：电脑端 Electron 便携 exe；手机端浏览器走局域网 `http://<本机IP>:8080`（由 Spring Boot 同端口托管前端）；后端 Spring Boot + MySQL。

**前端只加一层 API 客户端，没重写游戏**：
- `src/api.js`（新增）：`HX.Api` = `list / get / save / autoSave / remove / afterAction / probe`，`AbortController` 8s 超时，`keepalive` 支持 `pagehide` 兜底；base 推导：同端口 8080 时用同源 `/api`，否则回落 `http://<hostname>:8080/api`。
- `src/game.js`：`saveGame()` 先写 `localStorage` 兜底 → 再 `PUT /api/saves/manual`（带 `expectedVersion`，409 用 `currentVersion` 重试一次），成功 toast「已保存到数据库…（vN）」，失败 toast「数据库不可用…未写入 MySQL」；`resumeSaved()` 先 `list` 选槽（manual 优先，其次最新非 auto，再 auto）→ `get` → `S.restore`，失败回落 localStorage 并提示「可能落后于数据库」；`pagehide` 时 `POST /api/saves/auto`（keepalive）；结局触发 `POST /api/after-actions`。
- `src/ui.js`：`UI.setResumeAvailable(bool)` 控制标题页「继续上次战役」按钮，有库存档才显示。
- `build.js`：`ORDER` 插入 `api.js`；构建后同步到 `server/src/main/resources/static/` 与 `desktop/dist/`。

**后端 `server/`（Spring Boot 3.2.5 / Java 17 / Maven）**：
- 表：`save_slot`（slot、slot_name、version、campaign_t、phase、state_json LONGTEXT、state_bytes、state_hash、created_at、updated_at；`UNIQUE(slot)`）与 `after_action`（record_key UNIQUE、ending_type/title/date、campaign_t、enemies_destroyed、own_casualties、key_divergence、note、created_at）。
- `schema.sql` 随启动执行（`spring.sql.init.mode=always`）；`SchemaCheckRunner` 用 `SELECT * FROM … WHERE 1=0` 读 ResultSetMetaData 逐列校验，缺表/缺列直接拒绝启动（实测日志：`save_slot.11 列齐全` / `after_action.11 列齐全`）。
- 并发/幂等：`UPDATE … WHERE slot=? AND version=?` 乐观锁；`state_hash` 与 `slot_name` 相同 → 幂等返回（不涨版本）；覆盖非 auto 槽位必须带 `expectedVersion`（缺失 400，过期 409 并回传 `currentVersion`）；auto 槽固定只走 `POST /api/saves/auto`。
- 接口：`GET /api/saves`、`GET|PUT|DELETE /api/saves/{slot}`、`POST /api/saves/auto`、`GET|POST /api/after-actions`；CORS 只放 8016（浏览器调试）/8090（Electron 内置静态服务），可用 `HX_CORS_ORIGINS` 覆盖。
- 凭证零默认值：`application.yml` 只写 `${DB_URL}` `${DB_USERNAME}` `${DB_PASSWORD}`，驱动默认 MySQL 可用 `${DB_DRIVER}` 覆盖（开发用 H2）；仓库只提供 `.env.example`（密码留空）。

**Electron `desktop/`**：主进程内置 127.0.0.1:8090 静态服务（MIME + 路径穿越防护），`BrowserWindow` 1440×900，`loadURL('…/index.html?desktop=1')`；`HX_SOFT=1` → `disableHardwareAcceleration()`（本机远程会话下硬件模式窗口 never ready-to-show，必须软渲染）；`pack.js` 用本地 `node_modules/electron/dist` 组装便携版 `release/Huaihai1948/Huaihai1948.exe`（188,784,128 字节），不依赖 `@electron/packager` 的 GitHub 下载。

**实测证据（MySQL 8.0.36 / 库 `hx1948` / 127.0.0.1:3306 / utf8mb4，验证时间 2026-11-05 22:22–22:34；密码只经 `$env:DB_PASSWORD` 传入，未落任何文件）**：
| 项 | 结果 | 证据 |
|---|---|---|
| 服务与端口 | `mysqladmin status` → `Uptime: 562  Threads: 10 …`；`SHOW VARIABLES LIKE 'port'` → `3306`；`VERSION()` → `8.0.36`；`@@character_set_server` → `utf8mb4` | `tools/mysql_verify_output.txt` |
| 建库建表 | `SHOW DATABASES` 含 `hx1948`；`SHOW TABLES` → `after_action` / `save_slot`；`DESC` 两表各 11 列（`state_json longtext`、`state_hash char(64)`、`campaign_t double`、`created_at datetime(3)` 等） | `tools/mysql_verify_output.txt` |
| 后端启动 + 列校验 + 连接标识 | 3.378s；`schema 校验通过：save_slot.11 列齐全` / `after_action.11 列齐全` / **`数据库连接正常：MySQL`**；Hikari 日志为 `com.mysql.cj.jdbc.ConnectionImpl@…`（不是 H2） | 启动日志（§0 同轮） |
| 接口单测（H2，仅逻辑层） | 8/8 通过（建→读全量 state、重放幂等、版本过期 409、覆盖必带版本、auto 固定、列表删除、结局去重、CORS 白名单）；**不替代上面的 MySQL 实测** | `mvn clean test` |
| **Electron 便携版存档 → MySQL 有真实行** | `manual` v2、`campaign_t=125.33439999999985`、`phase=1`、`state_bytes=74342`、`state_hash=68b106a7b25de4d72273923634d2764b13fbf5e9719e84ac0f914b928c7852d4`，创建 22:22:59.483；toast「已保存到数据库：第 1 阶段 · 1948.11.11 04:00（v2）」 | `shots/desktop-mysql-save.png`、`tools/electron_save_report_mysql.json`、`tools/mysql_verify_output.txt` |
| **命令行查表（原文）** | `id=1 slot=manual slot_name=第 1 阶段 · 1948.11.11 04:00 version=2 campaign_t=125.33439999999985 phase=1 len=74342 …`；`id=2 slot=auto slot_name=自动存档 version=1 campaign_t=19.200000000000003 … len=40437` | `tools/mysql_verify_output.txt` |
| **杀后端 → 重启 → Electron 读回** | t / phase / **22 支部队** / enemyLog / logs / divergences / flags / casualties **8 组全 `same`**，`gameplayFieldsSame=true`；toast「已从数据库恢复：第 1 阶段 · 1948.11.11 04:00（v2），战局暂停」 | `shots/desktop-mysql-restore.png`、`tools/electron_restore_report_mysql.json` |
| `auto` 槽 | `version=1`、`campaign_t=19.200000000000003`、`len=40437`、创建 22:23:03.766（页面 `pagehide` 自动写） | `tools/mysql_verify_output.txt` |
| 结局表 `after_action` | `id=1 record_key=10cfbca1e43328bd85ca36f0f2524401f1a96c1407b9f81c2dfd58f9c99e1ed6 ending_type=verify ending_title=MySQL 链路验证样本`，写入 22:24:14.469；内容标注「用于验证结局表落行，非真实对局结局」，**不代表真实战果** | `tools/mysql_verify_output.txt` |
| 重放幂等 | 同内容 `PUT /api/saves/manual` → 200，`version` 仍为 2、`idempotent:true`、`created:false`，`updated_at` 保持 22:23:27.512（未写库） | `tools/mysql_idempotent.txt` |
| H2 定位 | `H2 2.2.224 MODE=MySQL` 文件库仅作**无 MySQL 环境下的开发回退**（`-P dev-h2` + `DB_DRIVER=org.h2.Driver`），不再作为验证依据 | `tools/db_rows_h2.txt`（保留为历史记录） |
| 手机端局域网访问 | `http://<本机局域网IP>:8080` 首页 200、503,838 字节、加载 571ms；390×844 竖屏，`60 FPS · MID`；同源 `/api/saves` 200 且返回中文槽名 | `shots/mob-lan-390x844-title.png`、`shots/mob-lan-390x844-game.png`、`tools/mobile_lan_report.json` |
| Electron 冷启动 / 资源 | 冷启动 217–528ms；`#perf` 稳定 **20 FPS（LOW，软渲染自动降档）**；JS 堆 12.6MB；进程工作集 Browser 89 / GPU 379 / Tab 265 / Utility 46+73 MB；GPU 状态 `webgl: unavailable_software`、`gpu_compositing: disabled_software` | `tools/desktop_probe.json` |
| 后端同端口托管 | `GET /index.html` 200、503,838 字节（静态产物由 `build.js` 同步进 `server/src/main/resources/static/`） | 启动日志 welcome page |

**启动顺序（唯一正确顺序）**：MySQL（建库）→ 后端（8080）→ Electron / 手机浏览器。

```powershell
# 0) 建库（只需一次；本机实测用管道执行，避免中文路径被 mysql 客户端 source 解析失败）
Get-Content "D:\新\淮海战役\server\sql\00_create_database.sql" -Raw -Encoding UTF8 |
  & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -h 127.0.0.1 -P 3306 --default-character-set=utf8mb4
# 1) 后端（凭证只从环境变量来；application.yml 无默认密码）
cd "D:\新\淮海战役\server"
$env:DB_URL="jdbc:mysql://127.0.0.1:3306/hx1948?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true"
$env:DB_USERNAME="root"; $env:DB_PASSWORD="<你的密码>"
& "D:\maven\apache-maven-3.9.9\bin\mvn.cmd" spring-boot:run
# 2a) 电脑端
& "D:\新\淮海战役\desktop\release\Huaihai1948\Huaihai1948.exe"
# 2b) 手机端（同一局域网，Windows 防火墙需放行入站 8080）
#     浏览器打开 http://<本机IP>:8080/index.html
```

**仍未完成 / 边界（一次性列清）**：
1. **手机真机未测**：只有局域网 IP + 竖屏 390×844 的浏览器仿真截图，没有 iOS/Android 真机与地址栏/软键盘差异；防火墙放行入站 8080 为说明项，未在真机上验证连通。
2. **公网 HTTPS 未实现**：只写文档（需反向代理 + 证书，且要补齐鉴权，不建议直接暴露）。
3. **Electron 本机硬件加速不可用**：`HX_SOFT=1` 下 20 FPS（LOW 档），真实独显机器数字会不同；`fps6s` rAF 采样在窗口不可见时会掉到 1，不能当帧率结论，以 `#perf` 计数为准。
4. **`JWT_SECRET` 未引入**：当前接口无鉴权（仅本机/局域网使用），如果需要多人或公网，先加登录与 token 校验再谈暴露。
5. 结局表的那一行是**接口写入样本**，不是真实打通结局；要证明真实结局上报，需要真打到结局再查表。

---

## 2. 本轮（寻路）复现数据原文

```
NAV-A legacy: assault 13.00s | 前12s 里程 166.33 / 净位移 159.59 = 0.959 | 卡顿 143
NAV-A astar : assault 12.70s | 前12s 里程 187.01 / 净位移 185.37 = 0.991 | 卡顿  82
NAV-B legacy: assault 未发生（24s 内） | 里程 115.56 / 净位移 108.95 = 0.943 | 卡顿 299
NAV-B astar : assault 19.45s | 里程 156.02 / 净位移 145.44 = 0.932 | 卡顿 185
A 相位：0s fireflank → 12.7s assault（侧翼 1 人到位）→ 18.75s clear
B 相位：0s fireflank → 19.45s assault（旧法：22s clear · 包抄未果）
障碍：insideHits=0 | minClearance=1.11 | 12.65s assault → 18.7s clear
网格：n=154 blocked=1811 trench=196 cell=0.6
FRAME：59.3–59.6fps / 1.10–1.11ms / draws 9 / instances 114 / tris 5968
```

测试入口：把 `index.html` 与 `nav_test_runner.js` 放同目录，`python -m http.server 8014 --bind 127.0.0.1`，打开 `nav_test.html`，标题变 `DONE` 后读 `#fpsTestOut`。对照开关 `F.setNavMode('legacy'|'astar')`。

### 2.1 本轮（过场与配音）复现数据原文

```
CINE-SEG: prologue 11.06 34s | nianzhuang_open 11.11 30s | nianzhuang_close 11.22 31s
          shuangduiji_open 11.25 30s | shuangduiji_uprising 11.27 30s
          chenguangzhuang_open 12.04 34s | shuangduiji_close 12.15 30s | chenguangzhuang_close 01.10 40s
CINE-MOVES: push 6 | pull 6 | pan 4 | truck 8 | shots 24 | total 259s
CINE-ACTORS: column 16 (+cart) | command 2 | guns 3 | stretcher 3x2 | civ 6 | pow 10
VOICE: 25 wav / 181.19s / 16000Hz / 16bit / mono / Huihui / rate=-1
AV(wall 263.6s): entries 25 | sched -21.3..+30.7ms (mean +13.2) | lat 31.4..122.3ms (mean 51.7) | failed 0
REG: routeDiff 20.79 / 6 · B 19.45s · moat 2.78 · art full|partial|weak|none · pace 从容/标准/紧迫 · save t=123.5 phase=2
```

复现：`cinematics_test.html?sh=0..7&p=0/1`（起幅/落幅截图，`?mute=1` 静默）；`?av=1` 快速逐条（计时会被模拟 tick 扭曲，只用于查文件缺失）；音画同步用 `av_full.js` 走 CDP 真实时间跑 `C.playAll(true)`，读 `C.avReport()`。

### 2.2 本轮（手机端适配 + 长跑冒烟）复现数据原文

```
MOBILE 390×844 DPR3 : topbar 183 | bottombar 112 | dock bottom 124 | overlap 0 px²
MOBILE 844×390 DPR3 : topbar  52 | bottombar  54 | dock 与底栏 overlap 0 px²
TOUCH  : drag yaw 0.86→0.31 pitch 0.72→0.855 | pinch dist 170→68.1 | two-finger pan 有效
SELECT : 8纵 → sel ['hy8'] | toast「已选中 8纵 · 点“指挥”可下达命令」
ORDER  : move → order=move dest=(108.1,-24.8) | toast「1 支部队受命」
2D MAP : drag ox/oy 0→60/50 | pinch zoom 1→2
FPS    : active=true | 摇杆 (4,18)→(6.7,18) | fire 600ms ammo 30→24 | 触屏退出 true
44px   : 竖屏首页 17/0 | 指挥 25/0 | 横屏首页 17/0 | 抽屉 21/0（总/不达标）
QUAL gpu      : high 60.1fps p95 16.9ms dpr1.50 585×1266 draws50 inst2151 tris118210
                mid  60.1fps p95 16.9ms dpr1.00 390×844  draws50 inst1625 tris100326
                low  60.0fps p95 16.9ms dpr0.75 292×633  draws46 inst1315 tris90138
QUAL cpu6(×6) : high 39.9fps p95 50.0ms long>33ms 54/902
                mid  43.7fps p95 49.9ms
                low  48.0fps p95 33.4ms long>50ms 2/912
QUAL software : high 11.5fps p95 100ms | mid 16.9fps p95 66.7ms | low 30.2fps p95 33.4ms
REG    : routeDiff 20.79/6 · B 19.45s · art full|partial|weak|none · pace 3 · save t=123.5 phase=2
         moat ×2.78 · ENCIRCLE open/blockSW/loose · chapters palettes earth/dust/snow
AV     : wall 263.2s | entries 25 | sched mean +12.35ms (max 30.9) | lat mean 38.71ms (max 98.6) | failed 0
FPS-ENTRY(desktop): active=true screen=true pointerLock=true hp80 ammo30
LONGRUN : **未完成**（仅 40s 冒烟，非 30 分钟）
          环境 1280×800 / mobile.html?mute=1 / headless Edge；start 2026-11-05T11:12:48Z end 11:13:29Z
          wall_s=40 | 9 条采样 | 间隔 5s（调试期用 STEP_S=5，非 60s）
          heap  : 首 6.42MB 末 15.10MB 峰 15.10MB 谷 6.16MB；growth +8.67MB；5 个上升步 / 3 个回落步（12.04→9.72→6.16），**非单调**，末值=峰值
          fps   : mean 60.4 / min 59.1 / max 64.1
          draws : 50 恒定 | instances 1731–2192 | tris 103102–118838
          注    : 第 5 条起因打开第二标签页瞬时掉帧触发自动降档 high→mid，inst/tris 出现台阶，曲线已被污染
          enemies 9→8 | logs 20→120（日志长度上限 120，之后不再增长）
          save  : t=200.2616 phase=1 logs=120 units=22 enemies=8 strength=418381 hash=429067
                  strict=true coreEqual=true tDrift=0 hashDrift=0；存档 78,243 B；新标签页恢复后 1× 续跑 +16h
          结论  : 只证明“采样链路 + 存档恢复”可用。按首末点线性拟合 +8.67MB/40s ≈ **+13MB/min**，但中段回落到 6.16MB、末段再升到峰值，属启动期分配 + GC 相位，**不可外推到 30 分钟**；是否泄漏需 wall_s≥1800、≥31 条 60s 采样后重测
```

---

### 2.3 本轮（真机三问题：交战动画 / 点哪不走哪 / 逐兵 LOD）复现数据原文

**① 交战动画（`src/sim.js` `fxEvent` L68、`combat` L613、`applyBattle` L1489；`src/game.js` `drawFx` L1374）**

事件只由真实结算产生：`combat()` 在 `kk+pp>0` 时发 `fire`（射击方→目标）、`artNear>0` 时发 `shell`（真实炮火落点）、双方各发 `hit`（带真实伤亡 `n`）；`cover` 变化发 `sector`（8 扇区布尔数组）；首次 `surrounded` 发 `closing`；`destroyKMT` 发 `destroyed`。渲染层只读 `sim.fx`，**没有任何与推演无关的循环特效**。

`tools/combat_fx.js`（固定场景 9纵 vs 7兵团，`S.update(sim,0.02)` 独占推进）三帧实测（`tools/combat_fx.json`）：

| 帧 | sim 数值变化 | fx 事件 | 截图 |
|---|---|---|---|
| A 交战前 | t=0，未接敌，gap **12.37**，兵力 28000 / 敌 100000，cover 0 | fx 0 条 | `shots/fx-A-before.png` |
| B 交战中 | t=2.1，engaged=true，兵力 **28000→27993**（-7）、敌 **100000→99992**（-8）、cover **0→2**（扇区合拢中）、弹药 94 | `contact 1 + fire 1 + hit 2 + sector 1`（fxSeq 5） | `shots/fx-B-fighting.png` |
| C 交战后 | t=16，兵力 **27387**（累计 -613）、敌 **99355**（累计 -645）、弹药 **93→79**、cover **1** | `contact 1 + fire 7 + hit 14 + sector 4`（fxSeq 26） | `shots/fx-C-after.png` |

同屏 `draws 50 / instances 4858→4886→4976 / tris 150898→153334 / fps 60`；部队卡同步显示「刚发生伤亡 -7 人（战场十字标记同步）」。C 帧 `gap 12.37→6.6`（双方阵位对峙收拢）。

**② 点哪不走哪：结论 = 坐标反解错误，不是下属自主改道**

`refs/geo.json` 世界坐标：曹八集 (58.8,-1.4)、贾汪 (31.1,-25)、邳县 (89.9,-7)、宿迁 (126.8,41.7)。

| 项 | 改前 | 改后 |
|---|---|---|
| `screenRay` 右向量 | `[fwd.z,0,-fwd.x]`（取反，横向镜像） | `[-fwd.z,0,fwd.x]`（`game.js` L502-519） |
| 四地往返误差（project→groundPoint） | 20.4 / 34.6 / 8.21 / 54 | **0.12 / 0.67 / 0.79 / 1.6** |
| 特纵点曹八集 → dest | (70.58,-14.53)，距目标 17.64，日志「行军 → **碾庄**」 | (61.60,1.01)，`|dest-intended|=0`，日志「行军 → **曹八集**」，落点距 0 |
| 10纵点贾汪 → dest | (64.77,-40.21)，距目标 36.95，日志「行军 → **台儿庄**」 | (35.01,-21.64)，`|dest-intended|=0`，日志「行军 → **贾汪**」，落点距 0 |

判据：`|dest - 逆投影目标| ≤ 0.5`、`|落点 - 目标| ≤ 10`（含取证脚本人为 +34px 落点偏移）。两案例均 `arrived=true`、`dist=0`（`tools/coord_probe_after.json`、`tools/route_rules.json`，截图 `shots/route-hyte-caoxu-{cmd,mid,end}.png`、`route-hy10-jiazhuang-{cmd,mid,end}.png`）。

规则落地（`src/sim.js` `routeAdjust` L981-1052、`rerouteProposal` L944、`fileRerouteRequest` L962、`adoptRequest` L1134）：玩家命令 `order.player=true` 时**只申请不改航**，硬条件仅 `threat`（行进遇阻/预定路线被封锁）、`supply`（补给中断）、`intel`（目标情报 >24h 未更新）；授权档只决定是否停下等批复（严控档 `sim.auth===0` 停等），**任何档位都不能绕过玩家意图**；每次申请都写入 `sim.requests` 并发 `reroute` 事件 → toast「改航播报 · 下属：原因；绕行点；仍前往 X」，同屏多条按 0.9s 节流并计入战报，**无静默改航**。

**③ 逐兵 + LOD（`src/game.js` `drawSoldiers` L1284-1373、`soldierLod` L1278、棋子 LOD 变形 L1107-1112 / L1183-1187）**

`HX.Scene.push/box` 写实例属性缓冲（`engine.js` L519-523 `vertexAttribDivisor=1`），一个 box = 1 instance、不增 draw call。每个兵 3 个 box（躯干+肩线+头），近景再加 2–3 个兵种件（机枪三脚架+枪管 / 炮兵炮管+炮架 / 担架白板+红十字 / 步兵步枪）。`tools/soldier_lod.js` 实测（`tools/soldier_lod.json`）：

| 档位 | 触发距离 | 每队兵额 | soldiers / 逐兵 instances / 全场景 instances / draws / tris | fps |
|---|---|---|---|---|
| far | dist > 132 | 0（队列色块+队标+番号） | 0 / 0 / 2127 / 50 / 118058 | 60.1 |
| mid | 76 < dist ≤ 132 | 8 | 246 / 738 / 2834 / 50 / 126542 | 61.4 |
| near | dist ≤ 76 | 24 | **654 / 3294 / 4848 / 50 / 150710** | 60.4 |
| close（near 取样） | 30 | 24 | 654 / 3294 / 4848 / 50 / 150710 | 61.1 |
| kinds（炮兵特写） | 14 | 24 | 654 / 3294 / 4848 / 50 / 150710 | 60.1 |
| infantry（步兵特写） | 11 | 24 | 654 / 3294 / 4848 / 50 / 150710 | 59.7 |

（`tools/soldier_lod.json` 里唯一 console error 是 `ERR_CONNECTION_REFUSED`：本轮回归时后端未起，属预期，不影响渲染统计。）

上限：mid 实例预算 2400 → 最多 800 兵/帧；near 预算 4800 → 最多 960 兵/帧（当前战役 22 支我军 + 9 支敌军，实测 654 兵未触顶）。三档均 ≥ 60 FPS（判据 ≥20）。截图 `shots/lod-{far,mid,near,close,kinds,infantry}.png`（`lod-kinds` 为特纵炮兵：长炮管+炮架；`lod-infantry` 为 4纵步兵：步枪/机枪三脚架/担架白板红十字）。

**回归（静默 `?mute=1` + `--mute-audio`）**

- `tools/verify.js`：三章 / 舆图 / 分歧 D1+D7 / `sim.ended=true` / 8 段过场 / 章节切换全部跑通；第 7 天 `LOG_HAS_BESIEGE=true`（合围日志已出现），K7 随后被歼灭（`alive=false`）；`draws 50 / instances 2833 / tris 126462 / fps 60`（`ERR_CONNECTION_REFUSED` 为后端未起，属预期）。该脚本点「总攻」时 K7 已亡，第一人称分支自然跳过 —— 合围与总攻改用下面两个独立探针验证。
- `tools/verify_fps_ai.js`：routes clear、炮火 full 24 发/命中 29/杀伤 860、weak 6 发/161、skipped 落 3 发 ×2.4、扣弹 90→82、掩体伤害 68.8/56.4/28.9/17.9/34.4、moat ×2.78、pace 3、save t=123.5 phase=2 复原一致、`errs []`。
- `tools/encircle_probe.js`：8 队包围 k7，t=12 cover 3、t=24 cover 5 且 `surrounded=true`（无 halted、无卡死）。
- `tools/assault_probe.js`：t=23.4 合围后点「总攻」→ `FPS active=true`，炮火提示「特纵平均弹药 88%，24 发覆盖 18 单位」，退出回战役层。
- 存档 / MySQL 落库（本轮复测，JDK17 直起 `SaveServerApplication` + 真库 `hx1948`）：浏览器 → REST → MySQL `save_slot` 写入成功 `SAVE OK version=4 t=962.12 phase=1 pla=22 enemyLog=1 logs=120 bytes=85404`；SQL 直查 `id=1 slot=manual version=4 bytes=75892 updated_at=2026-11-06 00:28:18`（`after_action` 1 行）；杀后端重启后再读回 `RESTORE gameplayFieldsSame=true t=962.12 phase=1 pla=22 enemyLog=1 logs=120`，仅 `speed / rawJSON` 因 UI 速度与 `fx` 清空不同（非玩法字段）。收尾无 8080/8090/8012 监听、无 java / Electron 残留。

---

## 3. 回归基线（每轮都必须复测）

| 项 | 基线值（当前） | 复测方式 |
|---|---|---|
| 三章差异化 | 调色板 earth-green/dust-grey/snow-steel；面积 105.6×76.8 / 96×76.8 / 67.2×51.2 km；树 39/0/0；圆盘 r14 高差 5.98/3.37/7.59 | `W.setChapter` + 采样 |
| 战役层反应 | `xuzhou_retreat_sw@462` / `xuzhou_breakout_se@462` / `huangwei_hedgehog@466` / `huangwei_breakout_se@466` / `liao_defect@504` | `S.enemyReactions` 三组对照 |
| 碾庄环壕 | timeMul **2.78**、`impassable=true`、w=1.2 | `S.MOAT` + 跨壕路线 |
| 三档节奏 | 从容 / 标准 / 紧迫 | 指挥层节奏参数 |
| 存档恢复 | t=123.5、phase=2、enemyLog 1、situations 1 | `hx1948_save` 写入/读取 |
| 过场完整度 | 8 段 / 24 镜 / 259s / 25 WAV / 181.19s / 0 缺文件 | `C.info()` / `C.voiceList()` / `C.avReport()` |
| 过场同步 | sched mean **+12.35ms**（max 30.9）、lat mean **38.71ms**（max 98.6）、failed 0、wall 263.2s | `av_pw.js` 真实时间 `playAll(true)` |
| 手机竖屏/横屏重排 | 390×844：顶栏 183 / 底栏 112 / 抽屉与两栏重叠 0；844×390：顶栏 52 / 底栏 54 | `probe_mobile.js` `rects()` + 截图 |
| 44×44 触控目标 | 竖屏 17/0、指挥 25/0；横屏 17/0、抽屉 21/0 | `probe_mobile.js` `auditTargets()` |
| 触屏操作链 | 选 `hy8` → `order=move` `dest=(108.1,-24.8)`；舆图 zoom 1→2；FPS 摇杆位移、弹药 30→24、触屏退出 | `probe_mobile.js` |
| 三档画质 | 正常 60.1/60.1/60.0；CPU6× 39.9/43.7/48.0；软件 11.5/16.9/30.2（竖屏 10s） | `quality_fps.js` → `tools/quality_fps.json` |
| 30 分钟长跑 | **未完成**：仅 40s 冒烟（`wall_s=40`、9 条、间隔 5s；堆 6.42→15.10MB，峰=末，5 上升步/3 回落步、非单调；fps mean 60.4；存档 strict=true）。不可作 30 分钟结论 | `longrun_30min.js`（需 60s×≥31 条、`wall_s≥1800`，见 §6） |


炮火回归附加：四档 full/partial/weak/none、掩体伤害 68.8/56.4/28.9/17.9/34.4、扣弹 cost 8、伤亡 ×2.4。

---

## 4. 参数 / 函数行号索引（全部经本轮核对）

| 想改什么 | 文件 | 位置 |
|---|---|---|
| 环壕障碍（不可徒涉） | `src/data.js` | `D.MOATS` **L98–101** |
| 开阔地压平 | `src/data.js` | `D.OPEN_ZONES` **L104–107** |
| 陈官庄合围 6.25×3.125 | `src/data.js` | `D.ENCIRCLE` **L110–115** |
| 三章配置 | `src/data.js` | `D.CHAPTERS` **L121–188** |
| 敌情延迟 3–5h | `src/data.js` | `D.ENEMY_INTEL` **L201–206** |
| 敌军反应表 | `src/data.js` | `D.KMT_REACTIONS` **L207–244** |
| 炮火档位/掩体/伤亡 | `src/data.js` | `D.ARTILLERY` **L651–666** |
| 协同参数 | `src/data.js` | `D.FPS_AI` **L618–645** |
| 跨壕/破壕常量 | `src/sim.js` | `S.MOAT` **L23–26** |
| 反应逻辑 | `src/sim.js` | `enemyReactions` **L472**、`reactHuangwei` L492、`reactXuzhou` L536、`liaoReaction` L553 |
| 炮火计划/伤害/扣弹 | `src/sim.js` | `artilleryPlan` **L1312**、`shellDamage` L1339、`consumeArtillery` L1346 |
| 总攻伤亡耦合 | `src/sim.js` | `applyBattle` **L1392–1425** |
| 指挥层总攻提示 | `src/game.js` | `startAssault` **L1477** |
| 章节地形重建 | `src/world.js` | `W.setChapter` **L14**、`buildArena` **L382** |
| 碰撞/视线/壕沟/掩体类 | `src/world.js` | `isBlocked` **L552**、`losBlocked` L563、`inTrench` L605、`coverClass` L609 |
| 寻路参数 | `src/fps.js` | `NAV` **L19–24** |
| 网格构建 | `src/fps.js` | `buildNav` **L638** |
| A* / 平滑 | `src/fps.js` | `astar` L670 起、`smoothPath` L780 起 |
| 统一移动入口 | `src/fps.js` | `moveTo` **L831** |
| 局部避让 | `src/fps.js` | `separation` L800 起 |
| 小队调度 | `src/fps.js` | `updateSquad` **L887** |
| 分组战术移动 | `src/fps.js` | `tacticalMove` **L950** |
| 炮火准备/落弹 | `src/fps.js` | `makePrep` **L462**、`skipPrep` L497 |
| 实测钩子 | `src/fps.js` | `F.setNavMode` / `F.addBlocker` / `F.rebuildNav` / `F.debug()` / `F.travelSnapshot()` |
| 过场 8 段（日期/地点/镜头/字幕） | `src/data.js` | `D.CINEMATICS` **L531–700** |
| 镜头黑场过渡 | `src/cine.js` | `TR` **L41**、`C.update` **L158**、`C.render` L219 |
| 旁白播放 / 同步日志 | `src/cine.js` | `playVoice` **L53–85**、`C.avReport` **L486** |
| 角色动画 | `src/cine.js` | `column` **L280**、`commandPost` L302、`battery` L321、`stretchers` L348、`civilians` L362、`prisoners` L381、`stage` L391 |
| 静默截图定位 | `src/cine.js` | `C.seek` **L466**（强制隐藏标题与黑场） |
| 旁白文本导出 | `tools/gen_voice_manifest.js` | 全文件（`node tools/gen_voice_manifest.js` → `tools/cine_voice.json`） |
| 旁白 WAV 合成 | `tools/gen_voice.ps1` | 全文件（SAPI Huihui / 16 kHz / 单声道） |
| 画质三档 / 自动选档 | `src/game.js` | `QUALITY` **L12–16**、`pickQuality` **L19**、`G.setQuality` **L1699** |
| DPR / 像素预算降采样 | `src/engine.js` | `resize()` 内 `budget/byPixels/dpr`（`this.effDpr`） |
| 触屏手势 / 双指平移 | `src/game.js` | `groundPoint` **L426**、`panCamera` **L443**、`touch` **L494**、`onPointerUp` 触屏命令分支 |
| 窄屏抽屉 | `src/game.js` / `src/styles.css` | `toggleMobPanel` **L479** / 移动端块 **L443–**、`#gl…touch-action:none` **L143** |
| 竖屏开局取景 | `src/game.js` | `frameOpening` **L302**（`resumeCampaign` 内调用） |
| FPS 触屏摇杆/按钮 | `src/styles.css` / `src/fps.js` | `.fps-touch` **L539–**；`fpsStick`/`btnFpsFire` 绑定 |
| 长跑采样 | `_hx_copy\longrun_30min.js`（**不在 tools/**，是工作区脚本） | 默认 60s×30 条 + 第 15 分钟存档/新标签页恢复 → `tools/longrun_30min.json/csv`；**当前只跑过 40s 冒烟**（见 §6） |
| 长跑脚本 / 画质脚本 | 工作区 `_hx_copy`（非交付目录） | `longrun_30min.js` / `quality_fps.js`；运行前需把最新 `index.html` 复制为 `mobile.html`，并起 8016 服务 |

---

## 5. 未做 / 已知限制（不粉饰）

1. **B 站位「净位移÷里程」0.932 < 旧法 0.943**：旧法贴墙蹭出高比值但只推进 108.95，A* 推进 145.44 且真到位；「所有站位里程一律下降」未做到。
2. 动态避障是单向分离力，非互惠速度障碍；拥挤窄道仍可能互相让路。
3. 无 funnel 走廊优化；掩体群角落路径比理想值长约 5–7%。
4. 无架桥/涉渡；不可通行区一律绕行。
5. **过场角色只有基础姿态**：步行摆腿 / 手臂前伸 / 火炮后坐，没有骨骼、面部与布料；剪影在近景仍显方块感。双堆集段推镜落幅以村落屋顶为前景，构图不算干净（见 README §14-17），还能继续调。
6. 结局分支未逐一实跑到最后一天；无头性能数字不代表真实显卡。
7. **旁白是机械音**：本机 SAPI（Huihui）合成，不是真人配音；多音字、长句停顿偶尔不自然，不要按「配音」标准验收。
8. **没有真机**：竖屏/横屏与触控全部是浏览器触控仿真（Playwright + CDP，390×844 / 844×390、DPR3、5 点触控）。没有 iOS/Android 地址栏、软键盘、刘海安全区的真机差异；safe-area 只按 `env()` 规则预留，未在真机核对。
9. **帧率不代表具体手机**：正常组是桌面 Iris Xe（vsync 60）；“弱 CPU”是 6× 降速、“软件渲染”是 SwiftShader。低画质在软件渲染约 30fps，真实中低端手机可能 25–40fps。三档数据只能判断相对开销，不能当机型承诺。
10. **移动端手势取舍**：单指拖动=旋转、双指=缩放+平移；没有惯性甩动、没有双指旋转。竖屏横向 FOV 很窄（390/844），开局只框最近 6 支我军，更远的部队要双指平移过去。
11. **30 分钟长跑未完成**：本轮只跑到 40 秒冒烟（9 条、间隔 5s、`wall_s=40`），中途没有 60s 采样、没有 15 分钟存档点对比；§2.2 的堆斜率来自 9 个 5s 点，且因开第二标签页触发自动降档，inst/tris 出现台阶。**40 秒不能证明 30 分钟稳定性**，真实长跑要等下次开机（§6）。
12. **MySQL 已实测（2026-11-05 22:22–22:34，库 `hx1948` / 8.0.36 / 3306）**：建表、Electron 落行、杀后端重启读回、`auto` 槽、结局表、重放幂等全部通过（§1.9）。H2 只在没有 MySQL 的环境里作开发回退。剩下的相关缺口只有「结局表那一行是接口样本而不是真实打通结局」。
13. **接口无鉴权**：`/api/**` 没有登录与 token（`JWT_SECRET` 未引入），CORS 只放本机 8016/8090 端口；仅适合本机与同一局域网，**公网暴露前必须先加鉴权**（HTTPS 也未实现）。
14. **手机真机未测**：局域网 `http://<本机局域网IP>:8080` 的 390×844 竖屏是浏览器仿真，没有真机地址栏、软键盘、刘海安全区差异；Windows 防火墙放行入站 8080 只是说明项，未在真机验证。
15. **Electron 本机只有软件渲染**：`HX_SOFT=1` 下 `#perf` 20 FPS（自动降到 LOW），GPU 进程 379MB 工作集；真实独显机器会明显不同。`fps6s`（rAF）在窗口不可见时会降到 1，**不能当帧率结论**，以游戏内 `#perf` 计数为准。

---

## 6. 下次开机第一条指令（唯一凭据）

**MySQL 已在 2026-11-05 22:22–22:34 实测通过（库 `hx1948`）**，复跑时凭证仍然只走环境变量：

```powershell
cd "D:\新\淮海战役\server"
$env:DB_URL="jdbc:mysql://127.0.0.1:3306/hx1948?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true"
$env:DB_USERNAME="root"; $env:DB_PASSWORD="<实际密码>"   # 不要写进任何文件
& "D:\maven\apache-maven-3.9.9\bin\mvn.cmd" spring-boot:run
```

验收门槛：日志出现 `schema 校验通过：save_slot.11 列齐全` / `after_action.11 列齐全` 与 `数据库连接正常：MySQL`；随后 Electron 存档 → `SELECT id,slot,version,campaign_t,phase,LENGTH(state_json),state_hash FROM hx1948.save_slot;` 能看到行；杀后端重启 → 「继续上次战役」toast 出现「已从数据库恢复」。

**第一件事：补跑真实 30 分钟长跑**（当前这一块仍未完成，别引用冒烟数据）：

```powershell
cd C:\Users\k1763\OneDrive\Microsoft OneDrive\OneDrive\Documents\Trae-CN\temp_20261104_04\_hx_copy
# 1) 起测试服务（8016，服务 mobile.html；mobile.html 必须是最新 index.html 的副本）
python -m http.server 8016
# 2) 默认就是 60s×30 条 + 第 15 分钟存档/新标签页恢复；不要设 STEP_S / SAVE_S / N
node longrun_30min.js
```

验收门槛：`tools/longrun_30min.json` 里 `meta.wall_s ≥ 1800`、`samples.length ≥ 31`、`saveCheck.coreEqual=true`；再按 `tools/longrun_30min.csv` 算首/末/峰值与单调段。**40 秒冒烟的堆斜率（+8.67MB / 9 点）不可外推，也不能用来说明有无泄漏。**

```powershell
cd D:\新\淮海战役
node build.js   # 会同时更新 index.html / cinematics.html / server 静态产物 / desktop/dist
```

改过旁白文本后，先重导文本再重合成（顺序不能反）：

```powershell
node tools/gen_voice_manifest.js
powershell -ExecutionPolicy Bypass -File tools/gen_voice.ps1
```

然后双击 `index.html` 抽查：三章切换、总攻炮火提示、前线 3 种协同、环壕跨壕耗时；打开 `cinematics.html` 抽查 8 段运镜与字幕/旁白。改动前先跑 §3 回归。

---

## 7. 环境状态（本轮结束，22:35）

- 8016 / 8012 测试服务器：**已关闭**（19:20 停止进程 27640 / 516，确认 0 监听）。
- 后端 8080：MySQL 实测跑完后**已停止**（最后一次启动 PID 10344，22:24:47 起、`数据库连接正常：MySQL`），停止后 `Get-NetTCPConnection -LocalPort 8080,8090,8016` 无监听。
- 数据库：**MySQL 8.0.36 服务在跑（Windows 服务 `MySQL80`，3306）**，库 `hx1948` 保留 2 行存档 + 1 行结局（`manual` v2 / `auto` v1 / after_action id=1）。H2 开发库 `C:\Users\k1763\.cache\hx1948\` 只作历史记录，可删。
- Electron：便携版 `desktop/release/Huaihai1948/`（188MB）已生成，探针/存档/读档多次运行均正常退出（exit 0），**无残留进程**。
- headless Edge：无残留（Playwright 实例随脚本结束关闭）。用户自己打开的 Edge 未动。
- 构建产物与源码一致（**22:14:13**，rc9）；源码最后改动：新增 `src/api.js`、`src/game.js`（存档/读档/自动存档/结局上报）、`src/ui.js`（`UI.setResumeAvailable`）、`build.js`（同步 server 静态产物与 desktop/dist）；后端 `server/` 与桌面壳 `desktop/` 为新增目录。
- 凭证：`DB_PASSWORD` 只在运行时环境变量里出现，仓库内 `ma…` 0 命中；只有 `server/.env.example`（密码留空）。
- 计划任务 / shutdown 倒计时：无。
