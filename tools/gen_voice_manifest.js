/* 从 src/data.js 抽取过场旁白文本，生成 tools/cine_voice.json
   目的：保证 WAV 与字幕文本逐字一致（同一份数据导出） */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'data.js'), 'utf8');
const sandbox = { window: {}, console: console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const D = sandbox.window.HX.DATA;
const out = [];
D.CINEMATICS.forEach((c, i) => {
  c.shots.forEach((s, si) => {
    const caps = s.caption || [];
    if (!caps.length) return;
    caps.forEach((cap, ci) => {
      out.push({
        file: c.id + '-s' + (si + 1) + '-c' + (ci + 1) + '.wav',
        text: cap.text,
        cinematic: c.id,
        index: i,
        shot: si + 1,
        caption: ci + 1,
        date: c.date,
        place: c.place
      });
    });
  });
});

fs.writeFileSync(path.join(__dirname, 'cine_voice.json'), JSON.stringify(out, null, 2), 'utf8');
console.log('lines', out.length);
out.forEach((o) => console.log(o.file + '\t' + o.text));
