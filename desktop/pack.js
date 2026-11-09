/* 便携版组装：把已安装的 Electron 运行时 + 应用文件拼成 release/Huaihai1948，
   不依赖联网下载 electron zip。运行：node pack.js */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');
const OUT = path.join(ROOT, 'release', 'Huaihai1948');
const APP = path.join(OUT, 'resources', 'app');

if (!fs.existsSync(DIST)) {
  console.error('未找到 node_modules/electron/dist，请先执行 npm install');
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(DIST, OUT, { recursive: true });

// Electron 优先加载 resources/app，移除默认启动页
const DEFAULTS = path.join(OUT, 'resources', 'default_app.asar');
if (fs.existsSync(DEFAULTS)) fs.rmSync(DEFAULTS);

fs.mkdirSync(APP, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'main.js'), path.join(APP, 'main.js'));
fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(APP, 'package.json'));

const SRC_DIST = path.join(ROOT, 'dist');
if (!fs.existsSync(SRC_DIST)) {
  console.error('未找到 desktop/dist，请先在项目根目录执行 node build.js');
  process.exit(1);
}
fs.cpSync(SRC_DIST, path.join(APP, 'dist'), { recursive: true });

const EXE = path.join(OUT, 'electron.exe');
const TARGET = path.join(OUT, 'Huaihai1948.exe');
if (fs.existsSync(EXE)) fs.renameSync(EXE, TARGET);

console.log('已生成便携版：' + TARGET);
