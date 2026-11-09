/* 构建：把 src 下 CSS/JS 内联进两个模板，输出到 D:\新\淮海战役 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const OUT = 'D:\\新\\淮海战役';

const ORDER = ['engine.js', 'data.js', 'world.js', 'sim.js', 'audio.js', 'ui.js', 'cine.js', 'fps.js', 'api.js', 'game.js'];

function read(n) { return fs.readFileSync(path.join(SRC, n), 'utf8'); }

const css = read('styles.css');
const js = ORDER.map((f) => {
  const code = read(f);
  return `\n/* ===== ${f} ===== */\n` + code;
}).join('\n');

function inject(tpl, page) {
  const html = read(tpl);
  return html.replace('/*CSS*/', () => css).replace('/*JS*/', () => js);
}

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), inject('index_template.html'), 'utf8');
fs.writeFileSync(path.join(OUT, 'cinematics.html'), inject('cinematics_template.html'), 'utf8');

// 后端同端口托管：把静态产物同步到 Spring Boot 的 classpath:/static
const STATIC_OUT = path.join(__dirname, 'server', 'src', 'main', 'resources', 'static');
fs.mkdirSync(STATIC_OUT, { recursive: true });
fs.copyFileSync(path.join(OUT, 'index.html'), path.join(STATIC_OUT, 'index.html'));
fs.copyFileSync(path.join(OUT, 'cinematics.html'), path.join(STATIC_OUT, 'cinematics.html'));

// assets（语音等）一并拷入，手机端走 /assets/... 才能取到
const ASSETS = path.join(__dirname, 'assets');
if (fs.existsSync(ASSETS)) {
  fs.cpSync(ASSETS, path.join(STATIC_OUT, 'assets'), { recursive: true });
}

// Electron 桌面壳内置的静态目录
const DESKTOP_DIST = path.join(__dirname, 'desktop', 'dist');
fs.mkdirSync(DESKTOP_DIST, { recursive: true });
fs.copyFileSync(path.join(OUT, 'index.html'), path.join(DESKTOP_DIST, 'index.html'));
fs.copyFileSync(path.join(OUT, 'cinematics.html'), path.join(DESKTOP_DIST, 'cinematics.html'));
if (fs.existsSync(ASSETS)) {
  fs.cpSync(ASSETS, path.join(DESKTOP_DIST, 'assets'), { recursive: true });
}

const s1 = fs.statSync(path.join(OUT, 'index.html'));
const s2 = fs.statSync(path.join(OUT, 'cinematics.html'));
console.log('index.html', (s1.size / 1024).toFixed(1) + ' KB');
console.log('cinematics.html', (s2.size / 1024).toFixed(1) + ' KB');
console.log('js size', (js.length / 1024).toFixed(1) + ' KB', 'css size', (css.length / 1024).toFixed(1) + ' KB');
