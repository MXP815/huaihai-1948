/* ==========================================================================
   淮海 1948 — 战役数据与文本
   说明：兵力为公开史料常见概数；具体到纵队/军的数字多为估算与游戏化调整，
   详见 README 的「数据依据表」。凡虚构台词均标注「艺术演绎」。
   ========================================================================== */
(function () {
  const HX = (window.HX = window.HX || {});
  const D = (HX.DATA = {});

  D.META = {
    title: '淮海 1948',
    subtitle: '粟裕视角 · 半即时战役指挥',
    startLabel: '1948年11月6日',
    endLabel: '1949年1月10日',
    startHour: 0,
    endHour: 1584 // 66 天
  };

  /* ---------------- 地理（等距压缩，坐标已按史料校准） ----------------
     坐标换算：x = (经度 - 117.18) × 115.25；z = -(纬度 - 34.26) × 139.0
     即 1 世界单位 = 0.8 km，东西/南北同比例（无方向性拉伸）。
     城镇经纬度见 refs/geo.json；可信区间多为 ±2–5 km。
     精度说明：部队初始位置只到县/乡镇级，时间粒度到日或阶段。 */
  D.GEO = {
    unitKm: 0.8,
    kx: 115.25,
    kz: 139.0,
    origin: { name: '徐州', lon: 117.18, lat: 34.26, x: 0, z: 0 },
    note: '等距压缩：1 世界单位 = 0.8 km；东西与南北同一比例，未做方向性拉伸。',
    precision: '城镇坐标可信区间多为 ±2–5 km；部队位置只到县/乡镇级，时间粒度到日或阶段。',
    sources: 'refs/geo.json、refs/geo.md、refs/timeline.md（史料核查稿）'
  };

  D.CITIES = [
    { id: 'xuzhou', name: '徐州', x: 0, z: 0, kind: 'city', side: 'kmt', note: '徐州剿总驻地' },
    { id: 'xinan', name: '新安镇', x: 134.8, z: -15.3, kind: 'town', side: 'kmt', note: '黄百韬兵团集结地' },
    { id: 'nianzhuang', name: '碾庄', x: 68, z: -5.6, kind: 'town', side: 'kmt', note: '第7兵团固守点，圩寨水网' },
    { id: 'caoxu', name: '曹八集', x: 58.8, z: -1.4, kind: 'village', side: 'pla' },
    { id: 'daxujia', name: '大许家', x: 43.8, z: -2.8, kind: 'village', side: 'pla', note: '碾庄以西阻援阵地' },
    { id: 'pizhou', name: '邳县', x: 89.9, z: -7.0, kind: 'town', side: 'pla' },
    { id: 'yaowan', name: '窑湾', x: 104.9, z: -2.8, kind: 'village', side: 'pla', minor: true },
    { id: 'yunheqiao', name: '运河铁桥', x: 86.4, z: -7.0, kind: 'village', side: 'kmt', minor: true, note: '中运河通道' },
    { id: 'suqian', name: '宿迁', x: 126.8, z: 41.7, kind: 'town', side: 'pla' },
    { id: 'jiazhuang', name: '贾汪', x: 31.1, z: -25.0, kind: 'town', side: 'kmt', note: '第三绥靖区防区' },
    { id: 'taierzhuang', name: '台儿庄', x: 63.4, z: -41.7, kind: 'town', side: 'kmt' },
    { id: 'xiao', name: '萧县', x: -26.5, z: 9.7, kind: 'town', side: 'kmt' },
    { id: 'huangku', name: '黄口', x: -53.0, z: -13.9, kind: 'town', side: 'kmt' },
    { id: 'dangshan', name: '砀山', x: -95.7, z: -22.2, kind: 'town', side: 'kmt' },
    { id: 'shangqiu', name: '商丘', x: -176.3, z: -20.8, kind: 'city', side: 'kmt', note: '陇海西段要点' },
    { id: 'suxian', name: '宿县', x: -23.1, z: 87.6, kind: 'city', side: 'pla', note: '津浦线要点，11.15 被攻克' },
    { id: 'jiagou', name: '夹沟', x: -12.7, z: 50.0, kind: 'village', side: 'kmt', minor: true },
    { id: 'fuliji', name: '符离集', x: -20.7, z: 73.7, kind: 'village', side: 'kmt', minor: true },
    { id: 'shuangduiji', name: '双堆集', x: -35.7, z: 120.9, kind: 'town', side: 'kmt', note: '第12兵团被围点' },
    { id: 'dawangzhuang', name: '大王庄', x: -35.7, z: 125.1, kind: 'village', side: 'kmt', minor: true },
    { id: 'mengcheng', name: '蒙城', x: -71.5, z: 139.0, kind: 'town', side: 'kmt' },
    { id: 'guoyang', name: '涡阳', x: -110.6, z: 104.3, kind: 'town', side: 'kmt' },
    { id: 'yongcheng', name: '永城', x: -85.3, z: 45.9, kind: 'town', side: 'kmt' },
    { id: 'chenguangzhuang', name: '陈官庄', x: -68.0, z: 36.1, kind: 'town', side: 'kmt', note: '杜聿明集团被围点' },
    { id: 'qinglongji', name: '青龙集', x: -63.4, z: 32.0, kind: 'village', side: 'kmt', minor: true },
    { id: 'guolou', name: '郭楼', x: -65.7, z: 37.5, kind: 'village', side: 'kmt', minor: true },
    { id: 'lishilin', name: '李石林', x: -63.4, z: 23.6, kind: 'village', side: 'kmt', minor: true },
    { id: 'guzhen', name: '固镇', x: 16.1, z: 130.7, kind: 'town', side: 'kmt' },
    { id: 'bengbu', name: '蚌埠', x: 24.2, z: 186.3, kind: 'city', side: 'kmt', note: '南线补给基地，淮河南岸' }
  ];

  /* 水系：main=true 为主河道，冬季枯水期仍不可徒涉；ford=true 的小河可涉渡。 */
  D.RIVERS = [
    { name: '中运河', pts: [[20, -55], [63, -42], [90, -8], [127, 42], [150, 85]], w: 3.4, main: true, note: '韩庄—台儿庄—邳州—宿迁' },
    { name: '沂河', pts: [[142, -82], [135, -49], [135, -15], [123, 29], [152, 55]], w: 3.0, main: true, note: '临沂—郯城—新安镇—骆马湖' },
    { name: '沭河', pts: [[152, -70], [150, -30], [148, 10], [145, 55]], w: 2.0, ford: true, note: '沂河以东，平行南流' },
    { name: '涡河', pts: [[-200, 15], [-161, 54], [-111, 104], [-71, 139], [-20, 170], [2, 179]], w: 2.8, main: true, note: '亳州—涡阳—蒙城—怀远' },
    { name: '浍河', pts: [[-195, -25], [-176, -21], [-130, 0], [-85, 46], [-47, 47], [16, 131], [81, 156]], w: 2.2, ford: true, note: '商丘—永城—濉溪—固镇—五河' },
    { name: '包河', pts: [[-190, -30], [-150, 0], [-110, 25], [-92, 55], [-85, 46]], w: 1.2, ford: true, note: '商丘—永城间小河，入浍河' },
    { name: '濉河', pts: [[-60, 40], [-47, 47], [-23, 88], [43, 99], [84, 108], [110, 140]], w: 1.6, ford: true, note: '宿县—灵璧—泗县' },
    { name: '沱河', pts: [[-185, -22], [-140, 5], [-100, 32], [-70, 60], [-30, 78], [20, 95], [60, 110], [90, 130]], w: 1.8, ford: true, note: '与浍河平行的皖北水系' },
    { name: '王引河', pts: [[-80, 30], [-70, 34], [-63, 40], [-58, 48]], w: 1.0, ford: true, note: '陈官庄一带小河' },
    { name: '淮河', pts: [[-140, 205], [-60, 196], [2, 179], [24, 183], [70, 195], [110, 205]], w: 4.4, main: true, note: '蚌埠位于淮河南岸' }
  ];

  /* 河渠：窄、浅、冬季可涉渡，仅用于地形与水网辨识（不含圩寨外壕） */
  D.CANALS = [
    { name: '碾庄水网', pts: [[50, -8], [64, -2], [80, 2]], w: 0.5 },
    { name: '苏北河渠一', pts: [[110, -10], [125, 20]], w: 0.6 },
    { name: '苏北河渠二', pts: [[120, -15], [138, 15]], w: 0.6 },
    { name: '苏北河渠三', pts: [[100, 5], [120, 35]], w: 0.6 },
    { name: '皖北沟渠', pts: [[-30, 70], [10, 80], [45, 90]], w: 0.5 }
  ];

  /* 碾庄圩：土圩台地 + 环形外壕（军事障碍，不可徒涉）
     史实：外壕宽 30–50 m、深约 2 m；土圩高出地面 2–3 m，中心村落高于四周。
     跨壕需架桥/爆破/坑道逼近。渲染宽度与垂直高差按可读性放大，不作为等比例地形。 */
  D.NIANZHUANG = {
    x: 68, z: -6, rx: 7.0, rz: 5.8,
    plateauH: 2.2, moatDepth: 1.1, moatWidth: 1.2,
    note: '外壕宽30–50米、深约2米，不可徒涉；土圩高出地面2–3米。地图壕宽与高差为可读性夸张。'
  };
  /* 环形外壕：独立障碍类，不能与“窄浅可涉渡”的河渠共用 */
  D.MOATS = [
    { id: 'nianzhuang', name: '碾庄圩外壕', x: 68, z: -6, rx: 7.0, rz: 5.8,
      w: 1.2, impassable: true, bridge: false, note: '环形外壕，跨壕需架桥/爆破/坑道逼近' }
  ];

  /* 开阔平原：史实“毫无隐蔽物”，不得出现丘陵、树林、塌陷湖 */
  D.OPEN_ZONES = [
    { name: '双堆集', x: -35.7, z: 120.9, r: 18, note: '双堆集周边为开阔平原，无丘陵、树林' },
    { name: '陈官庄', x: -68.0, z: 36.1, r: 18, note: '陈官庄包围圈内为开阔平原，无丘陵、树林、塌陷湖' }
  ];

  /* 合围尺度：陈官庄包围圈约东西 10 km、南北 5 km（0.8 km/单位 → rx 6.25、rz 3.125） */
  D.ENCIRCLE = {
    default: { rx: 7.0, rz: 6.0 },
    chenguangzhuang: { x: -68.0, z: 36.1, rx: 6.25, rz: 3.125 },
    group: ['k2', 'k13', 'k16', 'kzu'],
    byId: { k7: { rx: 5.2, rz: 4.6 }, k12: { rx: 7.5, rz: 6.2 }, kzu: { rx: 6.25, rz: 3.125 } }
  };

  /* ---------------- 章节环境配置（三章各自独立） ----------------
     世界地图是一张连续战场图（史实地理不能拆成三张图），但每章运行期独立重建：
     ① 作战区尺寸/取景 ② 地形单元组 ③ 色调 ④ 遮蔽物（树/雪/沙尘）
     ⑤ 水系布局 ⑥ 兵力密度 ⑦ 可用机动方向。README §11.2.2 列明复用与重建项。 */
  D.CHAPTERS = {
    1: {
      id: 1, stage: '第一章', name: '碾庄圩', sub: '1948.11.06—11.22 · 运河以西',
      area: { x: 68, z: -6, w: 132, h: 96 }, // 105.6×76.8 km
      terrain: '水网圩寨 · 村落攻坚',
      terrainUnits: ['土圩台地 +2.2', '环形外壕（不可徒涉）', '窄河渠×5', '圩寨村落群'],
      palette: {
        id: 'earth-green',
        base: [
          [0.20, 0.255, 0.20], [0.24, 0.29, 0.215], [0.17, 0.225, 0.205],
          [0.27, 0.28, 0.19], [0.22, 0.24, 0.17], [0.16, 0.21, 0.19]
        ],
        macro: [1.0, 1.0, 1.0], water: [0.055, 0.16, 0.19]
      },
      cover: { trees: 1.0, treeInArea: 1.0, snow: 0, drifts: 0 },
      hydro: { rivers: null, canals: true, moat: true }, // null = 全部河流
      camera: { dist: 118, pitch: 0.72, yaw: 0.86 },
      density: { kmt: 100000, kmtUnits: 1, strongpointRing: 0, airdrop: false },
      axes: ['东北（邳县）', '东南（运河桥）', '西（曹八集）'],
      env: { skyTop: [0.035, 0.09, 0.15], skyHorizon: [0.38, 0.33, 0.30], fogCol: [0.20, 0.22, 0.25], fogDensity: 0.0016, grade: [1.05, 1.0, 0.95], snow: 0 },
      fpsEnv: { fogCol: [0.28, 0.27, 0.26], skyTop: [0.05, 0.10, 0.15], skyHorizon: [0.42, 0.36, 0.32], sunCol: [1.0, 0.70, 0.44], groundCol: [0.18, 0.16, 0.13], grade: [1.06, 1.0, 0.94], fogDensity: 0.0028 },
      note: '史实：黄百韬第7兵团在碾庄圩以水网、土圩、外壕固守，华野先近迫作业再总攻。'
    },
    2: {
      id: 2, stage: '第二章', name: '双堆集', sub: '1948.11.23—12.15 · 浍河以南',
      area: { x: -35.7, z: 120.9, w: 120, h: 96 }, // 96×76.8 km
      terrain: '开阔平原 · 猬集防御',
      terrainUnits: ['平坦耕地（起伏 2.85）', '外围村落据点×12', '汽车/弹药箱环形围沟', '无树林·无丘陵·无塌陷湖'],
      palette: {
        id: 'dust-grey',
        base: [
          [0.30, 0.28, 0.21], [0.33, 0.30, 0.225], [0.26, 0.25, 0.19],
          [0.355, 0.325, 0.24], [0.285, 0.27, 0.205], [0.245, 0.24, 0.18]
        ],
        macro: [1.08, 1.04, 0.94], water: [0.09, 0.17, 0.17]
      },
      cover: { trees: 0.06, treeInArea: 0, snow: 0, drifts: 0 },
      hydro: { rivers: ['浍河', '涡河', '包河', '沱河'], canals: false, moat: false },
      camera: { dist: 128, pitch: 0.62, yaw: 0.42 },
      density: { kmt: 120000, kmtUnits: 1, strongpointRing: 12, airdrop: false },
      axes: ['东北（宿县）', '东南（固镇）', '西（蒙城）'],
      env: { skyTop: [0.05, 0.09, 0.13], skyHorizon: [0.40, 0.37, 0.31], fogCol: [0.30, 0.29, 0.25], fogDensity: 0.0024, grade: [1.03, 1.0, 0.95], snow: 0 },
      fpsEnv: { fogCol: [0.34, 0.32, 0.27], skyTop: [0.08, 0.11, 0.15], skyHorizon: [0.44, 0.40, 0.33], sunCol: [1.0, 0.78, 0.55], groundCol: [0.26, 0.24, 0.19], grade: [1.06, 1.0, 0.92], fogDensity: 0.0034 },
      note: '史实：双堆集周边为开阔平原，“毫无隐蔽物”；黄维以村落、汽车、弹药箱构成环形阵地猬集固守。'
    },
    3: {
      id: 3, stage: '第三章', name: '陈官庄', sub: '1948.12.16—1949.01.10 · 永城东北',
      area: { x: -68, z: 36.1, w: 84, h: 64 }, // 67.2×51.2 km，合围圈 10×5 km
      terrain: '冬季野战 · 合围圈',
      terrainUnits: ['雪原/冻土（起伏来自王引河下切）', '王引河河谷', '合围圈 6.25×3.125 单位', '空投场', '村落群'],
      palette: {
        id: 'snow-steel',
        base: [
          [0.56, 0.60, 0.64], [0.62, 0.66, 0.70], [0.50, 0.55, 0.60],
          [0.66, 0.69, 0.72], [0.54, 0.58, 0.63], [0.46, 0.51, 0.57]
        ],
        macro: [1.02, 1.03, 1.08], water: [0.22, 0.34, 0.42]
      },
      cover: { trees: 0.05, treeInArea: 0, snow: 1, drifts: 1 },
      hydro: { rivers: ['王引河', '浍河', '包河'], canals: false, moat: false },
      camera: { dist: 100, pitch: 0.58, yaw: -0.55 },
      density: { kmt: 300000, kmtUnits: 4, strongpointRing: 0, airdrop: true },
      axes: ['东（总攻）', '南（总攻）', '北（总攻）', '西（可留缺口）'],
      env: { skyTop: [0.09, 0.13, 0.18], skyHorizon: [0.62, 0.66, 0.70], fogCol: [0.55, 0.60, 0.65], fogDensity: 0.0034, grade: [1.04, 1.06, 1.12], snow: 1 },
      fpsEnv: { fogCol: [0.60, 0.64, 0.68], skyTop: [0.10, 0.14, 0.19], skyHorizon: [0.72, 0.76, 0.80], sunCol: [0.88, 0.90, 0.95], groundCol: [0.48, 0.52, 0.57], grade: [1.0, 1.03, 1.10], fogDensity: 0.0042 },
      note: '史实：杜聿明集团约30万人被围于陈官庄、青龙集，包围圈东西约10 km、南北约5 km；大雪严寒，靠空投。'
    }
  };
  D.chapterOf = (n) => D.CHAPTERS[n] || D.CHAPTERS[1];

  /* 双堆集外围村落据点 + 环形围沟（黄维猬集防御的可见单元） */
  D.STRONGPOINTS = {
    shuangduiji: { x: -35.7, z: 120.9, r: 8.2, n: 12, note: '外围村落据点与汽车/弹药箱围沟构成环形阵地' }
  };
  /* 陈官庄空投场 + 合围圈内村落群 */
  D.AIRDROP = { x: -66.5, z: 40.2, w: 3.6, d: 2.0, rot: 0.35, note: '空投场（史实：陈官庄包围圈内靠空投补给）' };

  /* ---------------- 敌军反应（事件驱动） ----------------
     每条反应都有：触发条件、史料出处、游戏内表现；实际判定只用「延迟情报」
     （D.ENEMY_INTEL.delayH），不做全知即时反应。README §11.2.3「敌军行为依据表」。 */
  D.ENEMY_INTEL = {
    delayH: { k7: 3, k12: 4, kzu: 5, k2: 5, k13: 5, k16: 5 },
    snapEvery: 3,       // 每 3 模拟小时采样一次玩家部署
    confBase: 62, confVar: 18,
    sustainH: 6         // 条件需持续 6 小时才转化为行动
  };
  D.KMT_REACTIONS = [
    {
      id: 'huangwei_breakout_se', kmt: ['k12'], name: '向东南（固镇方向）突围',
      trigger: '延迟情报显示包围圈封锁 ≤4/8 扇区并持续 6 小时',
      source: '11.27 黄维兵团以 4 个师向双堆集东南方向突围，被中野预置兵力堵回（《淮海战役》第二册·双堆集作战）',
      effect: '脱离猬集阵地，向固镇方向（约 x=8,z=133）机动；遇我军阻击即就地展开'
    },
    {
      id: 'huangwei_hedgehog', kmt: ['k12'], name: '转猬集固守、缩短防线',
      trigger: '延迟情报显示包围圈封锁 ≥7/8 扇区并持续 6 小时',
      source: '黄维兵团被围后以双堆集为中心，用车厢、弹药箱、村落构成多层环形阵地，猬集固守待援（《淮海战役》第二册）',
      effect: '停止机动，原地加固阵地（entrench +），缩短防线，等待援军'
    },
    {
      id: 'liao_defect', kmt: ['k12'], name: '第110师（廖运周）起义',
      trigger: '到 11.27（t≥504h）且第12兵团已被合围、封锁 ≥5/8 扇区',
      source: '11.27 第85军第110师师长廖运周率部在双堆集战场起义（《淮海战役》第二册）',
      effect: '第12兵团减员约 6000、士气 -12，防线出现缺口；我军总攻对敌杀伤 +25%'
    },
    {
      id: 'xuzhou_retreat_sw', kmt: ['kzu', 'k2', 'k13', 'k16'], name: '放弃徐州，向西南撤退',
      trigger: '第12兵团被围（或被歼）+ 宿县铁路已断 + 西南通道未被封锁',
      source: '11.30 杜聿明率徐州主力放弃徐州，沿永城方向向西南撤退（《淮海战役》第三册）',
      effect: '向陈官庄（-68,36.1）方向撤退，随后被合围'
    },
    {
      id: 'xuzhou_hold', kmt: ['kzu', 'k2', 'k13', 'k16'], name: '西南通道受阻，就地固守',
      trigger: '第12兵团被围 + 铁路已断 + 延迟情报显示西南通道已被我军提前封锁',
      source: '杜聿明集团西撤路线被截断后转入就地固守（陈官庄被围，12.4）',
      effect: '停止西撤，就地构筑工事，缩短防线'
    },
    {
      id: 'xuzhou_breakout_se', kmt: ['kzu', 'k2', 'k13', 'k16'], name: '改向东南突围',
      trigger: '西南通道封锁 + 延迟情报显示东南方向薄弱',
      source: '12.6 孙元良兵团擅自向东南突围（第16兵团突围经过，《淮海战役》第三册）',
      effect: '向东南（固镇方向）突围；若被阻则就地固守'
    }
  ];
  D.REACTION_OF = Object.fromEntries(D.KMT_REACTIONS.map((r) => [r.id, r]));

  /* 废黄河故道堤坝：地形上抬高并着色，作为徐州东南的天然障碍 */
  D.LEVEES = [
    { name: '废黄河故道堤', pts: [[-10, 8], [20, 14], [60, 30], [89, 50], [126, 42], [150, 55]], w: 4.0 }
  ];

  /* 水网地带：地形着色与微起伏差异（碾庄圩寨、苏北河渠、皖北平行水系） */
  D.WATER_ZONES = [
    { name: '碾庄圩寨水网', x: 68, z: -6, rx: 18, rz: 14 },
    { name: '苏北河渠密集区', x: 122, z: 18, rx: 30, rz: 34 },
    { name: '皖北平行水系', x: -30, z: 90, rx: 70, rz: 60 }
  ];

  D.RAILS = [
    { name: '陇海线（东段）', pts: [[0, -2], [25, -3], [43.8, -2.8], [58.8, -1.4], [68, -4.2], [80, -6], [89.9, -7], [110, -10], [134.8, -15.3], [152, -20]] },
    { name: '陇海线（西段）', pts: [[0, -2], [-30, -8], [-53, -13.9], [-95.7, -22.2], [-140, -25], [-176.3, -20.8], [-205, -18]] },
    { name: '津浦线（南段）', pts: [[0, -2], [-6, 20], [-12.7, 50], [-20.7, 73.7], [-23.1, 87.6], [-10, 105], [16.1, 130.7], [24.2, 186.3]] },
    { name: '津浦线（北段）', pts: [[0, -2], [2, -15], [20.7, -50], [11.5, -72], [8, -80]] },
    { name: '津浦线（蚌埠—浦口）', pts: [[24.2, 186.3], [60, 200], [92.2, 205.7], [110, 210]] }
  ];

  D.ROADS = [
    [[0, 0], [43.8, -2.8], [68, -5.6], [89.9, -7], [134.8, -15.3]],
    [[0, 0], [-8, 25], [-20.7, 73.7], [-23.1, 87.6], [-5, 110], [16.1, 130.7], [24.2, 186.3]],
    [[0, 0], [-26.5, 9.7], [-85.3, 45.9], [-68, 36.1]],
    [[-23.1, 87.6], [-45, 105], [-71.5, 139], [-110.6, 104.3]],
    [[-23.1, 87.6], [-30, 105], [-35.7, 120.9]],
    [[24.2, 186.3], [16.1, 130.7], [-8, 110], [-23.1, 87.6]],
    [[68, -5.6], [89.9, -7], [108, 10], [126.8, 41.7]],
    [[0, 0], [31.1, -25], [63.4, -41.7]],
    [[0, 0], [-53, -13.9], [-95.7, -22.2], [-176.3, -20.8]],
    [[0, 0], [30, 20], [88.7, 50], [126.8, 41.7]]
  ];

  D.DEPOTS = {
    pla: [
      { name: '华野后勤（山东方向）', x: 112, z: -78, cap: 3 },
      { name: '中野后勤（豫西方向）', x: -190, z: 60, cap: 2 },
      { name: '中野兵站（涡阳北）', x: -115, z: 95, cap: 2 },
      { name: '支前总站（宿县北）', x: -30, z: 80, cap: 2 },
      { name: '南线支前站（固镇）', x: 18, z: 128, cap: 2 }
    ],
    kmt: [
      { name: '徐州兵站', x: 0, z: 0, cap: 3 },
      { name: '蚌埠兵站', x: 24.2, z: 186.3, cap: 2 }
    ]
  };

  /* ---------------- 战斗序列 ---------------------------- */
  // 华野（约 30 万）、中野（约 12 万）——公开史料常见概数，纵队数字为估算
  D.PLA_UNITS = [
    { id: 'hy1', name: '华野第1纵队', short: '1纵', group: '华野', x: 122, z: -58, strength: 24000, morale: 84, ammo: 92, food: 90, fatigue: 16, role: '突击', cmdr: '叶飞' },
    { id: 'hy3', name: '华野第3纵队', short: '3纵', group: '华野', x: 104, z: -66, strength: 25000, morale: 82, ammo: 90, food: 88, fatigue: 18, role: '突击', cmdr: '孙继先（代）' },
    { id: 'hy4', name: '华野第4纵队', short: '4纵', group: '华野', x: 136, z: -44, strength: 28000, morale: 86, ammo: 94, food: 91, fatigue: 14, role: '突击', cmdr: '陶勇' },
    { id: 'hy6', name: '华野第6纵队', short: '6纵', group: '华野', x: 142, z: -28, strength: 26000, morale: 83, ammo: 88, food: 86, fatigue: 20, role: '突击', cmdr: '王必成' },
    { id: 'hy8', name: '华野第8纵队', short: '8纵', group: '华野', x: 114, z: -38, strength: 26000, morale: 81, ammo: 87, food: 84, fatigue: 22, role: '突击', cmdr: '张仁初' },
    { id: 'hy9', name: '华野第9纵队', short: '9纵', group: '华野', x: 126, z: -24, strength: 28000, morale: 85, ammo: 93, food: 89, fatigue: 15, role: '突击', cmdr: '聂凤智' },
    { id: 'hy10', name: '华野第10纵队', short: '10纵', group: '华野', x: 96, z: -54, strength: 25000, morale: 80, ammo: 86, food: 82, fatigue: 24, role: '阻援', cmdr: '宋时轮' },
    { id: 'hy13', name: '华野第13纵队', short: '13纵', group: '华野', x: 118, z: -72, strength: 23000, morale: 79, ammo: 84, food: 81, fatigue: 25, role: '预备', cmdr: '周志坚' },
    { id: 'hyte', name: '华野特种兵纵队', short: '特纵', group: '华野', x: 102, z: -48, strength: 18000, morale: 86, ammo: 78, food: 85, fatigue: 12, role: '炮兵', cmdr: '陈锐霆' },
    { id: 'hy2gd', name: '两广纵队', short: '两广', group: '华野', x: 132, z: -64, strength: 5000, morale: 78, ammo: 80, food: 84, fatigue: 18, role: '预备', cmdr: '曾生' },
    { id: 'hy2', name: '华野第2纵队', short: '2纵', group: '南线阻援', x: 0, z: 148, strength: 22000, morale: 80, ammo: 85, food: 86, fatigue: 20, role: '阻援', cmdr: '滕海清' },
    { id: 'hy7', name: '华野第7纵队', short: '7纵', group: '南线阻援', x: 40, z: 146, strength: 20000, morale: 79, ammo: 83, food: 85, fatigue: 22, role: '阻援', cmdr: '成钧' },
    { id: 'hy11', name: '华野第11纵队', short: '11纵', group: '南线阻援', x: 66, z: 138, strength: 22000, morale: 81, ammo: 86, food: 84, fatigue: 19, role: '阻援', cmdr: '胡炳云' },
    { id: 'hy12', name: '华野第12纵队', short: '12纵', group: '南线阻援', x: -8, z: 118, strength: 20000, morale: 80, ammo: 84, food: 83, fatigue: 21, role: '阻援', cmdr: '谢振华' },
    { id: 'zy1', name: '中野第1纵队', short: '中1纵', group: '中野', x: -152, z: 34, strength: 18000, morale: 78, ammo: 82, food: 80, fatigue: 26, role: '突击', cmdr: '杨勇' },
    { id: 'zy2', name: '中野第2纵队', short: '中2纵', group: '中野', x: -144, z: 58, strength: 15000, morale: 77, ammo: 79, food: 78, fatigue: 28, role: '突击', cmdr: '陈再道' },
    { id: 'zy3', name: '中野第3纵队', short: '中3纵', group: '中野', x: -122, z: 78, strength: 16000, morale: 78, ammo: 80, food: 79, fatigue: 27, role: '突击', cmdr: '陈锡联' },
    { id: 'zy4', name: '中野第4纵队', short: '中4纵', group: '中野', x: -160, z: 72, strength: 17000, morale: 80, ammo: 83, food: 80, fatigue: 25, role: '突击', cmdr: '陈赓' },
    { id: 'zy6', name: '中野第6纵队', short: '中6纵', group: '中野', x: -134, z: 100, strength: 14000, morale: 77, ammo: 78, food: 77, fatigue: 29, role: '突击', cmdr: '王近山' },
    { id: 'zy9', name: '中野第9纵队', short: '中9纵', group: '中野', x: -152, z: 96, strength: 13000, morale: 76, ammo: 77, food: 76, fatigue: 30, role: '突击', cmdr: '秦基伟' },
    { id: 'zy11', name: '中野第11纵队', short: '中11纵', group: '中野', x: -178, z: 84, strength: 12000, morale: 75, ammo: 76, food: 75, fatigue: 31, role: '预备', cmdr: '王秉璋' },
    { id: 'yw', name: '豫皖苏军区部队', short: '豫皖苏', group: '地方', x: -34, z: 112, strength: 10000, morale: 74, ammo: 70, food: 88, fatigue: 20, role: '地方' }
  ];

  /* ---------------- 指挥员人格参数 ----------------
     1–5 档。仅表示「指挥倾向」，据公开史料归纳，供玩法参考，不作历史定论。
     init 主动性 / aggr 勇猛度 / caut 稳健度 / siege 攻坚 / block 阻击韧性 /
     infil 穿插 / coord 协同 / cas 伤亡敏感 / report 请示倾向 / temper 脾性
     这些参数会被 sim.js 的请示频率、增援阈值、改道与临机专断逻辑实际读取。 */
  D.CMDR_KEYS = {
    init: '主动性', aggr: '勇猛度', caut: '稳健度', siege: '攻坚', block: '阻击韧性',
    infil: '穿插', coord: '协同', cas: '伤亡敏感', report: '请示倾向', temper: '脾性'
  };
  D.CMDR_BOUNDARY = '指挥倾向（据公开史料归纳，仅供玩法参考，不作历史定论）';
  D.CMDR_PROFILES = {
    '叶飞': { org: '华野1纵', role: '司令员', init: 5, aggr: 4, caut: 3, siege: 4, block: 4, infil: 5, coord: 4, cas: 3, report: 3, temper: 4, note: '擅长机动穿插，敢独立抓战机；对伤亡耐受较好，倾向先动后报。' },
    '孙继先（代）': { org: '华野3纵', role: '代司令员', init: 4, aggr: 4, caut: 3, siege: 3, block: 4, infil: 3, coord: 4, cas: 3, report: 3, temper: 3, note: '执行命令坚决，敢打硬仗；独立改变任务的倾向中等。' },
    '陶勇': { org: '华野4纵', role: '司令员', init: 5, aggr: 5, caut: 2, siege: 4, block: 4, infil: 4, coord: 4, cas: 2, report: 4, temper: 4, note: '突击风格强硬，愿以伤亡换进展；遇硬仗更可能请求增援而非后撤。' },
    '王必成': { org: '华野6纵', role: '司令员', init: 4, aggr: 5, caut: 2, siege: 4, block: 3, infil: 4, coord: 4, cas: 2, report: 4, temper: 5, note: '劣势下仍倾向主动出击；请示偏晚，可能先打后报。' },
    '成钧': { org: '华野7纵', role: '司令员', init: 4, aggr: 3, caut: 3, siege: 3, block: 4, infil: 3, coord: 4, cas: 3, report: 3, temper: 2, note: '稳健执行，阻援与机动兼顾；不轻易越权。' },
    '张仁初': { org: '华野8纵', role: '司令员', init: 4, aggr: 4, caut: 3, siege: 4, block: 3, infil: 4, coord: 4, cas: 3, report: 3, temper: 3, note: '攻坚与穿插均可用，倾向按上级意图组织突击。' },
    '聂凤智': { org: '华野9纵', role: '司令员', init: 5, aggr: 4, caut: 3, siege: 4, block: 4, infil: 4, coord: 4, cas: 3, report: 3, temper: 3, note: '主动寻求战机，攻坚组织细密；协同配合较好。' },
    '宋时轮': { org: '华野10纵', role: '司令员', init: 2, aggr: 3, caut: 4, siege: 3, block: 5, infil: 2, coord: 4, cas: 2, report: 2, temper: 2, note: '阻击韧性极高，遭优势兵力冲击也不轻易后撤；主动性偏低，不请示不轻易转攻，增援请求出现得晚。' },
    '胡炳云': { org: '华野11纵', role: '司令员', init: 3, aggr: 3, caut: 4, siege: 3, block: 4, infil: 3, coord: 4, cas: 3, report: 3, temper: 2, note: '偏稳健，重视防线完整与友邻衔接。' },
    '谢振华': { org: '华野12纵', role: '司令员', init: 3, aggr: 3, caut: 4, siege: 3, block: 4, infil: 3, coord: 4, cas: 3, report: 3, temper: 2, note: '执行稳健，遇到侧翼威胁会较早请示。' },
    '周志坚': { org: '华野13纵', role: '司令员', init: 4, aggr: 4, caut: 3, siege: 3, block: 3, infil: 4, coord: 4, cas: 3, report: 3, temper: 3, note: '预备队出身，投入战斗后倾向积极扩张战果。' },
    '陈锐霆': { org: '华野特纵', role: '司令员', init: 2, aggr: 2, caut: 4, siege: 5, block: 2, infil: 2, coord: 5, cas: 4, report: 4, temper: 1, note: '炮兵使用讲协同，强调火力准备；不主导步兵突击。' },
    '杨勇': { org: '中野1纵', role: '司令员', init: 4, aggr: 4, caut: 3, siege: 3, block: 4, infil: 4, coord: 4, cas: 3, report: 3, temper: 3, note: '攻守均衡，愿意配合友邻封口。' },
    '陈再道': { org: '中野2纵', role: '司令员', init: 4, aggr: 4, caut: 3, siege: 3, block: 4, infil: 3, coord: 4, cas: 3, report: 3, temper: 3, note: '执行坚决，偏好正面压缩而非远距离穿插。' },
    '陈锡联': { org: '中野3纵', role: '司令员', init: 5, aggr: 4, caut: 3, siege: 4, block: 4, infil: 4, coord: 4, cas: 3, report: 3, temper: 3, note: '主动性强，善于抓住敌军接合部。' },
    '陈赓': { org: '中野4纵', role: '司令员', init: 5, aggr: 4, caut: 3, siege: 5, block: 4, infil: 5, coord: 4, cas: 2, report: 2, temper: 4, note: '穿插与攻坚能力突出，独立处置倾向较强，可能先打后报。' },
    '王近山': { org: '中野6纵', role: '司令员', init: 5, aggr: 5, caut: 2, siege: 4, block: 3, infil: 4, coord: 3, cas: 2, report: 4, temper: 5, note: '勇猛好战，劣势下更可能主动出击；协同与请示偏随意。' },
    '秦基伟': { org: '中野9纵', role: '司令员', init: 4, aggr: 4, caut: 3, siege: 4, block: 4, infil: 3, coord: 4, cas: 3, report: 3, temper: 3, note: '稳中带攻，重视阵地巩固。' },
    '王秉璋': { org: '中野11纵', role: '司令员', init: 3, aggr: 3, caut: 4, siege: 3, block: 3, infil: 3, coord: 4, cas: 3, report: 3, temper: 2, note: '偏辅助与配合，按意图执行。' },
    '曾生': { org: '两广纵队', role: '司令员', init: 3, aggr: 3, caut: 4, siege: 3, block: 3, infil: 3, coord: 4, cas: 3, report: 3, temper: 2, note: '兵力较小，倾向谨慎使用。' },
    '滕海清': { org: '华野2纵', role: '司令员', init: 3, aggr: 3, caut: 4, siege: 3, block: 4, infil: 3, coord: 4, cas: 3, report: 3, temper: 2, note: '阻援方向执行稳健。' },
    '粟裕': { org: '华野代司令员', role: '战役指挥', init: 5, aggr: 4, caut: 4, siege: 5, block: 4, infil: 5, coord: 4, cas: 3, report: 2, temper: 3, note: '（玩家）总体意图的锁定者；参数用于复盘对照，不参与下级请示。' },
    '刘伯承': { org: '中野', role: '司令员', init: 4, aggr: 3, caut: 5, siege: 4, block: 4, infil: 5, coord: 4, cas: 4, report: 3, temper: 1, note: '重视计算与协同，倾向稳妥用兵。' },
    '陈毅': { org: '华野', role: '司令员', init: 4, aggr: 4, caut: 4, siege: 4, block: 4, infil: 4, coord: 5, cas: 3, report: 3, temper: 3, note: '重视全局协同与政治工作。' },
    '邓小平': { org: '总前委', role: '书记', init: 4, aggr: 4, caut: 4, siege: 4, block: 4, infil: 4, coord: 5, cas: 4, report: 3, temper: 2, note: '强调统一指挥与纪律，倾向压下擅自行动。' },
    '谭震林': { org: '总前委', role: '委员', init: 4, aggr: 3, caut: 4, siege: 4, block: 4, infil: 3, coord: 5, cas: 4, report: 4, temper: 2, note: '重视后勤与支前，倾向先稳后进。' }
  };

  D.KMT_UNITS = [
    {
      id: 'k7', name: '第7兵团', short: '7兵团', cmdr: '黄百韬', x: 134.8, z: -15.3, strength: 100000, morale: 74, ammo: 80, food: 72, fatigue: 20,
      corps: [
        { name: '第25军', strength: 30000 }, { name: '第63军', strength: 18000 }, { name: '第64军', strength: 20000 },
        { name: '第100军', strength: 18000 }, { name: '第44军', strength: 14000 }
      ],
      intent: '向碾庄收缩，固守待援', mission: '固守待援'
    },
    {
      id: 'k12', name: '第12兵团', short: '12兵团', cmdr: '黄维', x: -190, z: 128, strength: 120000, morale: 76, ammo: 84, food: 70, fatigue: 22,
      corps: [
        { name: '第18军', strength: 40000 }, { name: '第10军', strength: 28000 }, { name: '第14军', strength: 24000 }, { name: '第85军', strength: 28000 }
      ],
      intent: '经蒙城、宿县北援徐州', mission: '北援徐州'
    },
    {
      id: 'k2', name: '第2兵团', short: '2兵团', cmdr: '邱清泉', x: 18, z: -6, strength: 120000, morale: 72, ammo: 86, food: 80, fatigue: 16,
      corps: [
        { name: '第5军', strength: 40000 }, { name: '第70军', strength: 26000 }, { name: '第74军', strength: 28000 }, { name: '第12军', strength: 26000 }
      ],
      intent: '向东解7兵团之围', mission: '东援碾庄'
    },
    {
      id: 'k13', name: '第13兵团', short: '13兵团', cmdr: '李弥', x: 28, z: 2, strength: 80000, morale: 68, ammo: 82, food: 78, fatigue: 18,
      corps: [
        { name: '第8军', strength: 30000 }, { name: '第9军', strength: 26000 }, { name: '第115军', strength: 24000 }
      ],
      intent: '协同2兵团东援', mission: '东援碾庄'
    },
    {
      id: 'k16', name: '第16兵团', short: '16兵团', cmdr: '孙元良', x: 8, z: 10, strength: 90000, morale: 64, ammo: 78, food: 74, fatigue: 20,
      corps: [
        { name: '第41军', strength: 32000 }, { name: '第47军', strength: 30000 }, { name: '第99军', strength: 28000 }
      ],
      intent: '守备徐州外围，相机撤出', mission: '守备徐州'
    },
    {
      id: 'k6', name: '第6兵团', short: '6兵团', cmdr: '李延年', x: 30, z: 170, strength: 80000, morale: 66, ammo: 82, food: 86, fatigue: 14,
      corps: [{ name: '第39军', strength: 26000 }, { name: '第54军', strength: 26000 }, { name: '第96军', strength: 28000 }],
      intent: '沿津浦线北进策应', mission: '北援策应'
    },
    {
      id: 'k8', name: '第8兵团', short: '8兵团', cmdr: '刘汝明', x: 62, z: 178, strength: 60000, morale: 62, ammo: 80, food: 84, fatigue: 16,
      corps: [{ name: '第55军', strength: 22000 }, { name: '第68军', strength: 20000 }, { name: '第96军(一部)', strength: 10000 }],
      intent: '固守淮河，策应6兵团', mission: '守备淮河'
    },
    {
      id: 'kzu', name: '徐州剿总直属', short: '剿总直属', cmdr: '刘峙 / 杜聿明', x: 0, z: 0, strength: 50000, morale: 70, ammo: 88, food: 82, fatigue: 12,
      corps: [{ name: '直属部队及交警总队', strength: 30000 }, { name: '徐州警备部队', strength: 20000 }],
      intent: '固守徐州', mission: '固守徐州'
    },
    {
      id: 'k3s', name: '第三绥靖区', short: '三绥区', cmdr: '冯治安（何基沣、张克侠前线）', x: 38, z: -30, strength: 23000, morale: 52, ammo: 76, food: 78, fatigue: 14,
      corps: [{ name: '第59军', strength: 14000 }, { name: '第77军', strength: 9000 }],
      intent: '守备贾汪、台儿庄一线', mission: '守备运河'
    }
  ];

  D.KMT_GROUP_OF = { k7: '黄百韬兵团', k12: '黄维兵团', k2: '邱清泉兵团', k13: '李弥兵团', k16: '孙元良兵团', k6: '李延年兵团', k8: '刘汝明兵团', kzu: '徐州剿总', k3s: '第三绥靖区' };

  /* ---------------- 时间线 / 史实节点 ---------------- */
  D.MILESTONES = [
    { hour: 0, date: '11.06', text: '战役发起，华野主力自临沂、郯城一线出击' },
    { hour: 48, date: '11.08', text: '何基沣、张克侠率第三绥靖区一部在贾汪起义' },
    { hour: 120, date: '11.11', text: '华野将第7兵团合围于碾庄圩地区' },
    { hour: 216, date: '11.15', text: '中野第3纵队攻克宿县，切断徐州—蚌埠铁路联系' },
    { hour: 384, date: '11.22', text: '碾庄战役结束，第7兵团被歼，黄百韬身亡' },
    { hour: 456, date: '11.25', text: '中野将第12兵团合围于双堆集' },
    { hour: 504, date: '11.27', text: '第110师廖运周部在双堆集战场起义' },
    { hour: 576, date: '11.30', text: '杜聿明集团放弃徐州，向西南方向撤退' },
    { hour: 672, date: '12.04', text: '杜聿明集团被合围于陈官庄、青龙集地区' },
    { hour: 936, date: '12.15', text: '双堆集战役结束，第12兵团被歼，黄维被俘' },
    { hour: 960, date: '12.16', text: '华野转入战场休整，对陈官庄围而不打' },
    { hour: 1464, date: '01.06', text: '对陈官庄杜聿明集团发起总攻' },
    { hour: 1584, date: '01.10', text: '战役结束，杜聿明集团被歼' }
  ];

  D.HISTORICAL = {
    totals: '解放军参战约60万人，国民党军约80万人；歼敌55.5万人，解放军伤亡13.4万人。战役历时66天（1948.11.6—1949.1.10）。',
    phase1: '第一阶段（11.6—11.22）：华野追歼并围歼黄百韬第7兵团于碾庄圩，约10万人。',
    phase2: '第二阶段（11.23—12.15）：中原野战军围歼黄维第12兵团于双堆集，约12万人。',
    phase3: '第三阶段（12.16—1949.1.10）：华野围歼杜聿明集团（第2、13、16兵团）于陈官庄，约30万人。',
    commanders: '解放军：刘伯承、陈毅、邓小平、粟裕、谭震林；总前委由邓小平任书记。国民党：徐州剿总司令刘峙，副总司令杜聿明（前线指挥）。'
  };

  D.DIVERGENCE_DEFS = {
    D1: { key: 'D1', title: '先打黄维', hist: '先围歼黄百韬第7兵团（11.6—11.22）', alt: '在7兵团尚未解决时，优先以主力围歼黄维第12兵团' },
    D2: { key: 'D2', title: '抽调阻援兵力', hist: '以南线部队坚守阻击阵地，阻李延年、刘汝明北援', alt: '把南线阻援部队调去参加围歼，放空阻击正面' },
    D3: { key: 'D3', title: '提前总攻', hist: '对碾庄先围后攻，11月中旬完成近迫作业后总攻', alt: '在包围圈尚未压缩、外壕未破、炮火准备不足时提前发起总攻（跨壕强攻伤亡×2.4）' },
    D4: { key: 'D4', title: '放开口子', hist: '收紧陈官庄包围圈，逐步压缩、最终总攻', alt: '在西南方向留出缺口，让杜聿明集团突围后再追歼' },
    D5: { key: 'D5', title: '分兵两路', hist: '集中兵力各个歼灭，先解决一个兵团再转用兵力', alt: '同时围歼两个互相分离的兵团，兵力与补给被摊薄' },
    D6: { key: 'D6', title: '南线失守', hist: '南线阻援成功，援军被阻于淮河以北', alt: '南线阻击被突破，李延年、刘汝明兵团逼近徐州以南' },
    D7: { key: 'D7', title: '战略转移', hist: '坚持围歼，直至全歼杜聿明集团', alt: '主动放弃围歼，转入战略转移' }
  };

  /* ---------------- 结局 ---------------- */
  D.ENDINGS = {
    historical: {
      id: 'historical', title: '史实走向', grade: 'S',
      line: '三个集团依次被歼，战役在66天内结束。',
      text: '碾庄、双堆集、陈官庄——三场围歼战按部就班地打完。我们付出的伤亡在预料之内，支前民工把粮食和炮弹送到了离火线最近的地方。这不是一场靠运气的胜利，是把每一路援军都算准了之后，才敢下的决心。',
      note: '与史实基本一致：先7兵团、再12兵团、最后杜聿明集团。'
    },
    early: {
      id: 'early', title: '提前决战', grade: 'A+',
      line: '在12月中旬前解决三个集团，战役进程被大幅压缩。',
      text: '我们把总攻提前了。风险在于部队没有充分休整、炮弹也未必跟得上；回报是敌人来不及重新组织，徐州方向的多路援军被各个击破。历史上需要66天的仗，我们用更短的时间打完，但每一支纵队的疲劳都到了极限。',
      note: '重大偏离：提前决战。代价是部队疲劳与弹药消耗显著上升。'
    },
    pyrrhic: {
      id: 'pyrrhic', title: '惨胜', grade: 'B',
      line: '达成了歼敌目标，但我军伤亡与后勤代价过高。',
      text: '目标完成了，代价却超出了一个战役应有的限度。有的纵队打到最后只剩骨架，支前运力被拉到极限，伤员转运不及时。赢了，但这样的赢法不能再来一次。',
      note: '歼敌目标达成，但我军伤亡超过可接受阈值，或后勤体系濒临崩溃。'
    },
    stalemate: {
      id: 'stalemate', title: '僵持', grade: 'C',
      line: '时限到达时仍有兵团未被解决，战线陷入僵持。',
      text: '敌人没有跑掉，我们也没能吃掉他。包围圈还在，但兵力、弹药和天气都不允许再打下去。战场停在了对峙线上，下一次决战要等到春天。',
      note: '时限内未全歼目标，但主要集团未突围成功。'
    },
    defeat: {
      id: 'defeat', title: '失败', grade: 'D',
      line: '多个集团突围成功，或我军主力遭到重创。',
      text: '包围圈被撕开了。敌人从我们以为不会来的方向突围，而我们没有预备队可以堵上去。这个责任在我——兵力用得太满，没有给自己留下应对意外的余地。',
      note: '两个以上集团逃脱，或我军伤亡超过总兵力的六成。'
    },
    transfer: {
      id: 'transfer', title: '战略转移', grade: 'C-',
      line: '主动放弃围歼，转入战略转移。',
      text: '我下令转移。有人不理解，但把最后一点主力耗在包围圈上，不是勇敢，是赌博。撤出来，保住部队，下一次还有机会。代价是这一仗的政治与军事目标没有完成。',
      note: '由玩家主动选择「战略转移」，或徐州失守后被迫转入转移。'
    }
  };

  /* ---------------- 军事分析：战法 ---------------- */
  D.TACTICS = [
    {
      title: '集中优势兵力，各个歼灭',
      body: '华野、中野在战役全过程中始终避免同时与两个集团决战：先以绝对优势围歼黄百韬，再转兵双堆集，最后集中对杜聿明集团。游戏中的体现是：同时围两个兵团会显著拉低每支部队的有效战力与补给效率（分歧点 D5）。',
      how: '围歼时保持 2.5:1 以上的局部兵力优势；不要在两个包围圈之间平均分配炮兵与预备队。'
    },
    {
      title: '围点打援',
      body: '碾庄与双堆集都不是单纯的攻城：华野以阻援集团挡住邱清泉、李弥东援，中野在南线阻止李延年、刘汝明北进。游戏里，敌军援兵会主动寻找你阻击线的薄弱处；一旦南线被突破，被围兵团士气会回升并可能突围。',
      how: '用阻援部队卡住铁路与主要公路，优先在敌援军必经的节点构筑工事（休整/阻援命令会累积工事）。'
    },
    {
      title: '先打弱敌',
      body: '黄百韬兵团相对孤立、援军距离远，是理想的首歼目标；黄维兵团装备强、队形密集，需要中野先拖后围；杜聿明集团兵力最大，必须等前两个集团解决后集中华野主力。',
      how: '优先打孤立、补给线短、士气低的兵团；避免用疲劳度高的部队硬啃有工事的强敌。'
    },
    {
      title: '断敌补给，瓦解士气',
      body: '国军依赖徐州、蚌埠兵站与津浦铁路。切断铁路或占领兵站会让被围兵团弹药、粮食快速下降，士气随之崩溃。游戏中每支敌军都有补给状态与弹药天数，断粮会直接降低战力并诱发投降。',
      how: '用一支部队切断铁路节点（宿县、固镇），或以包围圈压缩其补给通道。'
    },
    {
      title: '近迫作业与炮火准备',
      body: '碾庄是水网村落，硬冲会造成重大伤亡。历史上华野以坑道、交通壕逼近，再用特纵炮火摧毁工事。游戏里「提前总攻」（D3）会绕过早迫作业阶段，短期提升突击强度，但伤亡显著上升。',
      how: '包围后先休整、构筑工事，待弹药与士气恢复再总攻；炮兵靠近可提高压制效果。'
    }
  ];

  /* ---------------- 过场短片（8 段，日期/地点对齐 refs/timeline.md） ----------------
     镜头语言：move = push 推 | pull 拉 | pan 摇 | truck 移（全片四类都用到，每段至少两种）
     caption.text 同时是旁白文本：本机 Windows SAPI 合成（机械音质，非真人）
     stageX/stageZ/actors：该段人物陈设（行军纵队/指挥所/炮兵/担架队/支前民工/俘虏）
     字幕文本一律按 timeline.md 口径；兵力、伤亡概数并列标注。 */
  const cap = (t, text, who, note) => ({ t, text, who: who || '粟裕 · 第一人称（艺术演绎）', note });
  D.CINEMATICS = [
    {
      id: 'prologue', title: '序章 · 徐蚌之间', sub: '1948.11.06 — 战役发起',
      date: '1948.11.06', place: '徐州以东 · 新安镇方向', env: 'dusk', duration: 34,
      stageX: 2, stageZ: 16, actors: ['column', 'command', 'civilians'],
      shots: [
        { move: 'pull', dur: 12, from: { pos: [34, 14, 58], target: [2, 3, 16], fov: 34 }, to: { pos: [96, 62, 138], target: [0, 0, 20], fov: 44 },
          caption: [cap(1.0, '十一月六日，华东野战军分路南下。淮海战役从这一天开始。', null, '史实：11月6日战役发起')] },
        { move: 'truck', dur: 11, from: { pos: [-24, 6, 44], target: [-2, 3, 22], fov: 34 }, to: { pos: [26, 7, 40], target: [22, 3, 20], fov: 32 },
          caption: [cap(1.0, '徐州以东，黄百韬的第七兵团正沿陇海线向西收缩。', null, '史实：11月7日第七兵团自新安镇西撤')] },
        { move: 'pan', dur: 11, from: { pos: [46, 14, 62], target: [10, 3, 30], fov: 38 }, to: { pos: [46, 15, 62], target: [-30, 3, 2], fov: 38 },
          caption: [cap(1.0, '六十万对八十万，是概数。胜负从来不是算术。', null, '兵力为史实概数；判断为艺术演绎')] }
      ]
    },
    {
      id: 'nianzhuang_open', title: '碾庄 · 合围', sub: '1948.11.11 — 运河以西',
      date: '1948.11.11', place: '碾庄圩 · 运河以西', env: 'dusk', duration: 30,
      stageX: 68, stageZ: -6, actors: ['column', 'command'],
      shots: [
        { move: 'push', dur: 9, from: { pos: [102, 14, 20], target: [70, 2, -6], fov: 40 }, to: { pos: [82, 6, 2], target: [70, 2, -6], fov: 32 },
          caption: [cap(0.8, '十一月十一日，第七兵团四个军被合围在碾庄圩。', null, '史实：11月11日合围于碾庄圩地区')] },
        { move: 'truck', dur: 10, from: { pos: [78, 4, 32], target: [70, 3, 18], fov: 30 }, to: { pos: [56, 4, 34], target: [58, 3, 18], fov: 28 },
          caption: [cap(0.8, '运河截断退路，外围的村子一个接一个被拿下。', null, '运河与村落战斗为史实概括')] },
        { move: 'pan', dur: 11, from: { pos: [44, 22, 44], target: [58, 3, 20], fov: 36 }, to: { pos: [44, 22, 44], target: [76, 3, -10], fov: 36 },
          caption: [cap(0.8, '口袋扎紧了。碾庄不只是一个地名。', null, '艺术演绎')] }
      ]
    },
    {
      id: 'nianzhuang_close', title: '碾庄 · 第一阶段结束', sub: '1948.11.22 — 碾庄圩',
      date: '1948.11.22', place: '碾庄圩 · 近迫作业之后', env: 'night', duration: 31,
      stageX: 68, stageZ: -6, actors: ['artillery', 'column', 'stretcher'],
      shots: [
        { move: 'push', dur: 10, from: { pos: [69, 10, 36], target: [69, 2, 8], fov: 34 }, to: { pos: [69, 5, 23], target: [69, 2, 6], fov: 30 },
          caption: [cap(0.8, '十一月十二日起，碾庄逐村争夺，土墙与交通壕之间反复拉锯。', null, '史实：11月12日至22日碾庄逐村争夺')] },
        { move: 'truck', dur: 10, from: { pos: [50, 3, 10], target: [58, 3, -2], fov: 30 }, to: { pos: [78, 3, 8], target: [78, 3, -4], fov: 28 },
          caption: [cap(0.8, '近迫作业，把战壕挖到敌人枪眼下面，一米一米往前挪。', null, '近迫作业与炮火准备为史实战法')] },
        { move: 'pull', dur: 11, from: { pos: [64, 5, 4], target: [68, 3, -6], fov: 26 }, to: { pos: [56, 24, 34], target: [68, 3, -6], fov: 38 },
          caption: [cap(1.0, '二十二日黄昏，枪声停了。第七兵团覆灭。', '战报', '史实：11月22日碾庄战斗结束，黄百韬身亡（死因口径不一）')] }
      ]
    },
    {
      id: 'shuangduiji_open', title: '双堆集 · 合围', sub: '1948.11.25 — 浍河以南',
      date: '1948.11.25', place: '双堆集 · 浍河以南', env: 'dusk', duration: 30,
      stageX: -62, stageZ: 80, actors: ['column', 'civilians'],
      shots: [
        { move: 'pan', dur: 10, from: { pos: [-38, 16, 122], target: [-98, 3, 74], fov: 38 }, to: { pos: [-38, 16, 122], target: [-64, 3, 82], fov: 34 },
          caption: [cap(0.8, '十一月二十五日，中原野战军把黄维的第十二兵团围在双堆集。', null, '史实：11月25日完成包围')] },
        { move: 'truck', dur: 10, from: { pos: [-78, 5, 102], target: [-70, 3, 84], fov: 30 }, to: { pos: [-46, 5, 98], target: [-54, 3, 78], fov: 28 },
          caption: [cap(1.0, '纵横约七点五公里，一圈又一圈围沟。', null, '史实：包围圈纵横约7.5公里')] },
        { move: 'push', dur: 10, from: { pos: [-30, 30, 138], target: [-62, 4, 78], fov: 40 }, to: { pos: [-50, 12, 102], target: [-62, 4, 80], fov: 28 },
          caption: [cap(1.0, '不硬顶。放他进来，再卡住侧后。', null, '艺术演绎')] }
      ]
    },
    {
      id: 'shuangduiji_uprising', title: '双堆集 · 一一〇师起义', sub: '1948.11.27 — 双堆集以南',
      date: '1948.11.27', place: '双堆集以南 · 第八十五军阵地', env: 'night', duration: 30,
      stageX: -62, stageZ: 80, actors: ['column', 'command'],
      shots: [
        { move: 'truck', dur: 10, from: { pos: [-64, 26, 126], target: [-62, 3, 80], fov: 32 }, to: { pos: [-84, 22, 112], target: [-72, 3, 84], fov: 30 },
          caption: [cap(0.8, '十一月二十七日，第八十五军第一一〇师师长廖运周率部起义。', null, '史实：11月27日廖运周率110师起义')] },
        { move: 'push', dur: 10, from: { pos: [-96, 30, 120], target: [-70, 3, 84], fov: 30 }, to: { pos: [-78, 16, 100], target: [-70, 3, 84], fov: 26 },
          caption: [cap(1.0, '起义部队从包围圈上走出去。那一夜，黄维的突围计划乱了。', null, '起义为史实；打乱突围部署为艺术演绎')] },
        { move: 'pull', dur: 10, from: { pos: [-60, 18, 104], target: [-70, 3, 84], fov: 28 }, to: { pos: [-44, 28, 134], target: [-72, 3, 84], fov: 38 },
          caption: [cap(1.0, '一个师的转向，比一个军的强攻更快。', null, '艺术演绎')] }
      ]
    },
    {
      id: 'chenguangzhuang_open', title: '陈官庄 · 合围', sub: '1948.12.04 — 永城东北',
      date: '1948.12.04', place: '陈官庄 / 青龙集 / 李石林', env: 'snow', duration: 34,
      stageX: -112, stageZ: 48, actors: ['column', 'civilians', 'prisoners'],
      shots: [
        { move: 'pull', dur: 11, from: { pos: [-90, 6, 70], target: [-112, 3, 48], fov: 30 }, to: { pos: [-58, 16, 92], target: [-112, 3, 48], fov: 40 },
          caption: [cap(0.8, '十二月四日，华野十一个纵队在陈官庄、青龙集、李石林合围杜聿明集团。', null, '史实：12月4日完成包围')] },
        { move: 'pan', dur: 11, from: { pos: [-112, 5, 66], target: [-126, 3, 58], fov: 30 }, to: { pos: [-112, 5, 66], target: [-96, 3, 38], fov: 30 },
          caption: [cap(1.0, '三十万人挤在东西十公里、南北五公里的圈子里。', null, '史实：包围圈南北约5公里、东西约10公里；兵力约30万含机关人员')] },
        { move: 'truck', dur: 12, from: { pos: [-134, 8, 64], target: [-118, 3, 52], fov: 38 }, to: { pos: [-94, 8, 64], target: [-106, 3, 50], fov: 34 },
          caption: [cap(1.0, '不急着打。饥饿和寒冷，会替我们完成一半的包围。', null, '空投中断与大雪为史实背景；判断为艺术演绎')] }
      ]
    },
    {
      id: 'shuangduiji_close', title: '双堆集 · 第二阶段结束', sub: '1948.12.15 — 最后一道围沟',
      date: '1948.12.15', place: '双堆集 · 大小马庄一带', env: 'night', duration: 30,
      stageX: -62, stageZ: 80, actors: ['artillery', 'column', 'prisoners'],
      shots: [
        { move: 'push', dur: 10, from: { pos: [-36, 9, 118], target: [-62, 3, 80], fov: 30 }, to: { pos: [-56, 5, 104], target: [-62, 3, 80], fov: 24 },
          caption: [cap(0.8, '十二月十五日，双堆集。第十二兵团被歼，黄维被俘。', '战报', '史实：12月15日第二阶段结束，黄维、吴绍周被俘')] },
        { move: 'truck', dur: 10, from: { pos: [-72, 4, 94], target: [-66, 3, 86], fov: 26 }, to: { pos: [-48, 4, 90], target: [-50, 3, 84], fov: 26 },
          caption: [cap(1.0, '第二阶段结束。中原野战军以弱于对手的火力，啃下了围沟。', null, '中野火力弱于华野为史实背景')] },
        { move: 'pull', dur: 10, from: { pos: [-56, 4, 84], target: [-62, 3, 80], fov: 24 }, to: { pos: [-62, 30, 108], target: [-62, 3, 80], fov: 40 },
          caption: [cap(1.0, '从十一月六日到十二月十五日，淮河以北的态势已经改写。', null, '艺术演绎')] }
      ]
    },
    {
      id: 'chenguangzhuang_close', title: '陈官庄 · 终局', sub: '1949.01.06—01.10 — 最后的总攻',
      date: '1949.01.10', place: '陈官庄 · 郭楼东南', env: 'dawn', duration: 40,
      stageX: -112, stageZ: 48, actors: ['column', 'stretcher', 'civilians', 'prisoners'],
      shots: [
        { move: 'push', dur: 12, from: { pos: [-92, 5, 64], target: [-112, 3, 48], fov: 30 }, to: { pos: [-106, 3, 54], target: [-112, 3, 48], fov: 26 },
          caption: [cap(0.8, '一九四九年一月六日，总攻开始。东、南、北三面压进去，留西面。', null, '史实：1月6日约15:30发起总攻')] },
        { move: 'truck', dur: 10, from: { pos: [-118, 4, 58], target: [-110, 3, 52], fov: 26 }, to: { pos: [-98, 4, 62], target: [-100, 3, 56], fov: 26 },
          caption: [cap(0.8, '十日拂晓，枪声由密转疏。雪地上出现成片的俘虏。', null, '艺术演绎；雪与投降为史实背景')] },
        { move: 'pull', dur: 18, from: { pos: [-112, 6, 56], target: [-112, 3, 48], fov: 26 }, to: { pos: [-60, 38, 86], target: [-70, 3, 40], fov: 44 },
          caption: [
            cap(1.2, '杜聿明被俘。六十六天，淮海战役结束。', '战报', '史实：1949年1月10日战役结束，杜聿明被俘'),
            cap(7.0, '歼敌五十五万五千人；我军伤亡十三万余人，资料口径为十一万至十三万六千。', '战报', '史实：歼敌55.5万余；伤亡口径11万–13.6万并列')
          ] }
      ]
    }
  ];

  D.FPS_BRIEFS = {
    nianzhuang: {
      title: '碾庄外围 · 前沿阵地',
      sub: '华野突击部队 / 村落攻坚',
      text: '你随突击营进入碾庄外围。敌人的机枪压在土墙后面，村口有铁丝网与鹿砦。先压制正面火力，再让两翼贴上去。'
    },
    shuangduiji: {
      title: '双堆集 · 围沟之间',
      sub: '中野突击部队 / 野战围沟',
      text: '黄维兵团把汽车、弹药箱堆成围沟。火力密集，地形开阔。利用弹坑与车辆残骸接近，别在空地上停留。'
    },
    chenguangzhuang: {
      title: '陈官庄 · 雪野',
      sub: '华野突击部队 / 雪地村落',
      text: '雪很深，视野受限。敌人缺粮、士气低落，但仍有火力。压缩包围圈，逐个院落清理。'
    }
  };

  /* ---------------- 前线敌 AI 协同（README §11.2.4） ----------------
     小队指挥官统一调度三个战术动作；通信延迟 + 单兵视野限制，不做全知。
     intelDelay  ：观察到玩家后，情报传到小队指挥官所需的秒数
     intelStale  ：情报超过该秒数未更新则位置误差持续放大
     flankArc    ：侧翼组相对「已知玩家位置」的绕行角度（弧度）
     clearBands  ：逐段清剿的推进段数（不越过未清理段） */
  D.FPS_AI = {
    squads: 2,
    intelDelay: 1.4,
    intelStale: 3.4,
    intelError: 0.9,        // 每秒放大的位置误差（单位）
    sightRange: 58,
    viewFov: 2.1,           // 单兵视野半角（弧度）
    fireRange: 46,
    flankArc: 1.15,
    flankReach: 4.5,
    assaultHold: 6.0,
    boundingStep: 7.0,
    boundingSwap: 2.4,
    boundingSpan: 7.5,
    clearBands: 3,
    clearSegment: 8.0,
    clearHold: 4.0,
    pressureShots: 6,       // 3 秒内玩家射击数达到该值 → 敌军转为交替掩护
    pressureWindow: 3.0,
    cueCd: 2.2,
    cueText: {
      fireflank: '敌军：火力组正面压制，侧翼组开始迂回',
      assault: '敌军：侧翼已到位，发起冲击',
      bounding: '敌军：交替掩护后撤，保持火力',
      clear: '敌军：逐段清剿，封锁壕沟与院落',
      prepare: '敌军：炮火准备中，隐蔽待机'
    }
  };

  /* ---------------- 炮火准备（与战役层弹药/特纵炮兵耦合） ----------------
     弹药档位来自战役层所有存活炮兵的平均弹药（0–100）：
       full ≥62 / partial ≥38 / weak ≥18 / none <18
     准备时长、覆盖半径、弹数、对敌杀伤与「准备不足硬冲」的我方伤亡系数全在此表。 */
  D.ARTILLERY = {
    thresholds: { full: 62, partial: 38, weak: 18 },
    levelText: { full: '全量准备', partial: '减半准备', weak: '薄弱准备', none: '无炮火准备' },
    duration: { full: 9.0, partial: 5.5, weak: 2.4, none: 0 },
    shells: { full: 24, partial: 14, weak: 6, none: 0 },
    radius: { full: 18, partial: 12, weak: 6.5, none: 0 },
    shellRadius: 7.0,
    baseDamage: 78,
    dmgMul: { full: 1.0, partial: 0.82, weak: 0.58, none: 0 },
    coverMul: { open: 1.0, crater: 0.82, wall: 0.42, trench: 0.26, house: 0.5 },
    prepCasMul: { full: 1.0, partial: 1.6, weak: 2.4, none: 2.4, skipped: 2.4 },
    ammoCost: { full: 8, partial: 5, weak: 2, none: 0 },
    fatigue: 4,
    warnMul: 1.15,          // 准备不足时敌火对玩家伤害倍率
    note: '史实：碾庄总攻前特纵集中炮火准备；弹药由战役层兵站/铁路调拨，不足则只能减量准备'
  };

  D.ANALYSIS_NOTES = {
    intel: '情报不是即时的：侦察分队、俘虏审讯、地方武装报告、电话/电报各有延迟。地图上的敌军标记带有时间戳与可信度；超过12小时未更新的情报会变成灰色「旧报」。',
    supply: '补给由兵站、铁路运力与支前民工共同决定。铁路被切断、兵站丢失、或敌军逼近补给线，都会让弹药/粮食天数下降，进而影响士气与战力。',
    free: '系统不强制重演历史：你可以先打黄维、提前总攻、抽调阻援部队、放开口子。每个重大偏离都会记录为分歧点，并在战后与史实对照。',
    limit: '锁定项：总兵力、各纵队初始编成、兵站与铁路位置、天气进程、敌军初始部署与援军到达时间。玩家不能凭空增兵或改变地理。'
  };
})();
