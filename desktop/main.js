/* Electron 主进程：内置只读静态服务（127.0.0.1:8090）加载 dist 构建产物，
   不依赖任何开发服务器。HX_PROBE=1 时自动进入指挥层、采样帧率与内存并落盘后退出。 */
const { app, BrowserWindow, Menu, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const T0 = Date.now();
const PORT = Number(process.env.HX_DESKTOP_PORT || 8090);
const ROOT = path.join(__dirname, 'dist');
const PROBE = process.env.HX_PROBE === '1';
const SAVE_E2E = process.env.HX_SAVE_E2E || ''; // save | restore
const API_BASE = process.env.HX_API_BASE || 'http://localhost:8080/api';
const OUT_DIR = process.env.HX_OUT_DIR || path.join(__dirname, '..', 'tools');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2'
};

function startStatic() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let rel;
      try { rel = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { rel = '/'; }
      if (rel === '/') rel = '/index.html';
      const file = path.normalize(path.join(ROOT, rel));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

let win = null;
let server = null;
let readyMs = null;

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#030c10',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  win.once('ready-to-show', () => {
    readyMs = Date.now() - T0;
    win.show();
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  await win.loadURL(`http://127.0.0.1:${PORT}/index.html?desktop=1`);
  if (readyMs == null) { readyMs = Date.now() - T0; win.show(); }
  if (PROBE) await runProbe();
  else if (SAVE_E2E) await runSaveE2E(SAVE_E2E);
}

/* Electron 端存档链路实测：save 阶段写库并落参考快照；restore 阶段读库恢复后逐字段比对 */
async function runSaveE2E(mode) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code, ms) => Promise.race([
    win.webContents.executeJavaScript(code),
    new Promise((_, rej) => setTimeout(() => rej(new Error('js timeout')), ms || 10000))
  ]);
  const apiGet = (p) => new Promise((resolve) => {
    const req = http.get(API_BASE + p, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(b) }); } catch (e) { resolve({ status: res.statusCode, raw: b }); } });
    });
    req.on('error', (e) => resolve({ error: String(e.message) }));
    req.setTimeout(8000, () => { req.destroy(new Error('api timeout')); });
  });
  const SNAP = "JSON.parse(HX.Sim.serialize(HX.Game.sim))";
  const HXREF = path.join(OUT_DIR, 'electron_expected.json');
  const result = { mode, coldStartMs: readyMs, softwareRendering: process.env.HX_SOFT === '1', apiBase: API_BASE };
  try {
    if (mode === 'save') {
      await sleep(1200);
      await js("document.getElementById('btnStart').click(); true", 5000);
      for (let i = 0; i < 12; i++) {
        await sleep(700);
        if (await js("!document.getElementById('campaign').classList.contains('hidden')", 5000)) break;
        await js("var b=document.getElementById('cineSkip'); if(b) b.click(); true", 5000);
      }
      await sleep(1500);
      await js("var b=document.querySelector('[data-cb=\"startPhase\"]'); if(b) b.click(); true", 5000);
      await sleep(2000);
      await js("HX.Game.sim.speed = 3; HX.Game.sim.running = true; true", 5000);
      await sleep(12000);
      await js("HX.Game.sim.running = false; true", 5000);
      await js("document.getElementById('btnSave').click(); true", 5000);
      await sleep(2500);
      result.toast = await js("var t=document.getElementById('toastWrap'); t ? t.textContent : ''", 3000);
      const ref = await js(SNAP, 8000);
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(HXREF, JSON.stringify(ref), 'utf8');
      result.snapshot = { t: ref.sim.t, phase: ref.sim.phase, pla: ref.sim.pla.length, enemyLog: ref.sim.enemyLog.length, logs: ref.sim.logs.length, divergences: (ref.sim.divergences || []).length };
      const l = await apiGet('/saves');
      result.dbList = l.json || l;
      const only = result.dbList && result.dbList.find ? result.dbList.find((s) => s.slot === 'manual') : null;
      if (only) {
        const d = await apiGet('/saves/manual');
        result.dbRow = d.json ? { slot: d.json.slot, slotName: d.json.slotName, version: d.json.version, campaignT: d.json.campaignT, phase: d.json.phase, stateBytes: d.json.stateBytes, updatedAt: d.json.updatedAt } : d;
        result.dbStateMatchesUi = d.json && d.json.state ? d.json.state.sim.t === ref.sim.t : null;
      }
      const img = await win.webContents.capturePage();
      try { fs.writeFileSync(path.join(OUT_DIR, 'electron_save_shot.png'), img.toPNG()); } catch (e) { result.shotError = String(e.message); }
    } else {
      await sleep(1200);
      const ref = JSON.parse(fs.readFileSync(HXREF, 'utf8'));
      result.reference = { t: ref.sim.t, phase: ref.sim.phase, pla: ref.sim.pla.length, enemyLog: ref.sim.enemyLog.length, logs: ref.sim.logs.length, divergences: (ref.sim.divergences || []).length };
      await js("var b=document.getElementById('btnResume'); if(b){ window.__resumeBtnVisible = true; b.click(); } true", 5000);
      await sleep(3000);
      const got = await js(SNAP, 8000);
      const fields = [
        ['t', (s) => s.sim.t],
        ['phase', (s) => s.sim.phase],
        ['pla', (s) => JSON.stringify(s.sim.pla)],
        ['enemyLog', (s) => JSON.stringify(s.sim.enemyLog)],
        ['logs', (s) => JSON.stringify(s.sim.logs)],
        ['divergences', (s) => JSON.stringify(s.sim.divergences || [])],
        ['flags', (s) => JSON.stringify(s.sim.flags || {})],
        ['casualties', (s) => JSON.stringify(s.sim.casualties)]
      ];
      result.diff = {};
      for (const [k, f] of fields) {
        const same = f(ref) === f(got);
        result.diff[k] = same ? 'same' : { expected: String(f(ref)).slice(0, 120), actual: String(f(got)).slice(0, 120) };
      }
      result.gameplayFieldsSame = Object.values(result.diff).every((v) => v === 'same');
      result.toast = await js("var t=document.getElementById('toastWrap'); t ? t.textContent : ''", 3000);
      result.after = { t: got.sim.t, phase: got.sim.phase, pla: got.sim.pla.length, enemyLog: got.sim.enemyLog.length, logs: got.sim.logs.length, divergences: (got.sim.divergences || []).length };
      const img = await win.webContents.capturePage();
      try { fs.writeFileSync(path.join(OUT_DIR, 'electron_restore_shot.png'), img.toPNG()); } catch (e) { result.shotError = String(e.message); }
    }
  } catch (e) {
    result.error = String((e && e.message) || e);
  }
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, `electron_${mode}_report.json`), JSON.stringify(result, null, 2));
  } catch (e) { /* 落盘失败也要退出 */ }
  app.quit();
}

async function runProbe() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code, ms) => Promise.race([
    win.webContents.executeJavaScript(code),
    new Promise((_, rej) => setTimeout(() => rej(new Error('js timeout')), ms || 10000))
  ]);
  const result = { coldStartMs: readyMs, softwareRendering: process.env.HX_SOFT === '1' };
  try {
    await sleep(1200);
    await js("document.getElementById('btnStart').click(); true", 5000);
    // 跳过开场过场，直到进入战役指挥层
    for (let i = 0; i < 12; i++) {
      await sleep(700);
      const inCampaign = await js("!document.getElementById('campaign').classList.contains('hidden')", 5000);
      if (inCampaign) break;
      await js("var b=document.getElementById('cineSkip'); if(b) b.click(); true", 5000);
    }
    await sleep(1500);
    // 关掉开场简报弹窗，进入可操作的指挥层
    await js("var b=document.querySelector('[data-cb=\"startPhase\"]'); if(b) b.click(); true", 5000);
    await sleep(2000);
    app.getAppMetrics(); // 重置 CPU 采样窗口
    const perfSamples = [];
    for (let i = 0; i < 12; i++) {
      await sleep(500);
      const txt = await js("var p=document.getElementById('perf'); p ? p.textContent : ''", 3000);
      const m = /\d+(?:\.\d+)?\s*FPS/.exec(txt || '');
      if (m) perfSamples.push(parseFloat(m[0]));
    }
    result.perfSamples = perfSamples;
    result.perfAvg = perfSamples.length ? +(perfSamples.reduce((a, b) => a + b, 0) / perfSamples.length).toFixed(1) : null;
    result.fps6s = await js(`new Promise((res) => {
      let n = 0, done = false; const s = performance.now();
      function finish() { if (done) return; done = true; res(+(n / ((performance.now() - s) / 1000)).toFixed(1)); }
      function f() { n++; if (performance.now() - s < 6000) requestAnimationFrame(f); else finish(); }
      requestAnimationFrame(f);
      setTimeout(finish, 7500);
    })`, 9000);
    result.jsHeapMB = await js("performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 100) / 100 : 0", 5000);
    result.screen = await js("({ w: innerWidth, h: innerHeight, screen: document.getElementById('campaign').className.includes('hidden') ? 'title' : 'campaign' })", 5000);
    result.processMetrics = app.getAppMetrics().map((m) => ({
      type: m.type,
      cpu: m.cpu ? +m.cpu.percentCPUUsage.toFixed(1) : 0,
      workingSetMB: m.memory ? Math.round(m.memory.workingSetSize / 1024) : 0
    }));
    result.electron = process.versions.electron;
    result.chrome = process.versions.chrome;
    result.port = PORT;
    result.gpu = app.getGPUFeatureStatus();
    result.visible = win.isVisible();
    const img = await win.webContents.capturePage();
    try { fs.writeFileSync(path.join(OUT_DIR, 'desktop_shot.png'), img.toPNG()); }
    catch (e) { result.shotError = String(e.message); }
  } catch (e) {
    result.error = String((e && e.message) || e);
  }
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'desktop_probe.json'), JSON.stringify(result, null, 2));
  } catch (e) { /* 落盘失败也要退出，否则进程悬挂 */ }
  app.quit();
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// 无 GPU 或远程桌面环境：HX_SOFT=1 时退回软件渲染
if (process.env.HX_SOFT === '1') app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  server = await startStatic();
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { if (server) server.close(); });
