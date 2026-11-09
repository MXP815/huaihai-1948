/* ==========================================================================
   程序化音效：WebAudio 合成，无任何外部音频素材
   ========================================================================== */
(function () {
  const HX = (window.HX = window.HX || {});
  const A = (HX.Audio = {});
  // 测试/无音频模式：?mute=1 时完全不创建音频上下文，保证自动化实测静默
  const MUTED = /(?:^|[?&])mute=1(?:&|$)/.test(location.search);
  let ctx = null, master = null, enabled = !MUTED, wind = null;
  let battleNodes = [];

  function ac() {
    if (MUTED) return null;
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.75;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }
  A.muted = function () { return MUTED; };
  A.resume = function () {
    if (MUTED) return;
    const c = ac();
    if (c && c.state === 'suspended') c.resume();
  };
  A.setEnabled = function (v) { enabled = !MUTED && !!v; if (master) master.gain.value = enabled ? 0.75 : 0; };

  function noiseBuffer(sec, brown) {
    const c = ac(); if (!c) return null;
    const n = Math.floor(c.sampleRate * sec);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      else d[i] = w;
    }
    return buf;
  }

  function burst(o) {
    const c = ac(); if (!c || !enabled) return;
    const sec = o.sec || 0.12;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(sec, o.brown);
    const g = c.createGain();
    g.gain.setValueAtTime(o.gain || 0.4, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + sec);
    const f = c.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 1600, c.currentTime);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, c.currentTime + sec);
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
    if (o.tone) {
      const osc = c.createOscillator();
      const og = c.createGain();
      osc.frequency.setValueAtTime(o.tone, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(o.tone * 0.5, c.currentTime + sec);
      og.gain.setValueAtTime(0.12, c.currentTime);
      og.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + sec);
      osc.connect(og); og.connect(master); osc.start();
    }
  }

  A.shot = function () { burst({ sec: 0.16, gain: 0.55, freq: 2600, freqEnd: 300, tone: 90 }); };
  A.enemyShot = function () { burst({ sec: 0.12, gain: 0.16, freq: 1500, freqEnd: 260 }); };
  A.hit = function () { burst({ sec: 0.05, gain: 0.12, freq: 3200, filter: 'highpass' }); };
  A.kill = function () { burst({ sec: 0.18, gain: 0.18, freq: 400, brown: true }); };
  A.explosion = function () { burst({ sec: 0.7, gain: 0.7, freq: 900, freqEnd: 80, brown: true, tone: 55 }); };
  A.victory = function () {
    const c = ac(); if (!c || !enabled) return;
    [523, 659, 784].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f; o.type = 'triangle';
      g.gain.setValueAtTime(0.0, c.currentTime + i * 0.14);
      g.gain.linearRampToValueAtTime(0.16, c.currentTime + i * 0.14 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.14 + 0.7);
      o.connect(g); g.connect(master); o.start(c.currentTime + i * 0.14); o.stop(c.currentTime + i * 0.14 + 0.8);
    });
  };
  A.death = function () { burst({ sec: 0.9, gain: 0.35, freq: 300, freqEnd: 40, brown: true }); };
  A.whistle = function () {
    const c = ac(); if (!c || !enabled) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(950, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(1500, c.currentTime + 0.25);
    g.gain.setValueAtTime(0.1, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);
    o.connect(g); g.connect(master); o.start(); o.stop(c.currentTime + 0.4);
  };
  A.reload = function () {
    setTimeout(() => burst({ sec: 0.04, gain: 0.1, freq: 2400, filter: 'highpass' }), 240);
    setTimeout(() => burst({ sec: 0.05, gain: 0.14, freq: 1800, filter: 'highpass' }), 820);
    setTimeout(() => burst({ sec: 0.04, gain: 0.12, freq: 3000, filter: 'highpass' }), 1500);
  };
  A.reloadDone = function () { setTimeout(() => burst({ sec: 0.05, gain: 0.12, freq: 2000, filter: 'highpass' }), 380); };

  /* ---------------- 环境音 ---------------- */
  A.ambient = function (on) {
    const c = ac(); if (!c) return;
    if (on && !wind) {
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(4, true);
      src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      const g = c.createGain(); g.gain.value = 0.05;
      src.connect(f); f.connect(g); g.connect(master); src.start();
      wind = { src, g };
    } else if (!on && wind) {
      try { wind.src.stop(); } catch (e) {}
      wind = null;
    }
  };
  A.startBattle = function () {
    A.ambient(true);
    const c = ac(); if (!c) return;
    // 远处炮声节奏
    const tick = () => {
      if (!enabled || !ctx) return;
      if (Math.random() < 0.5) burst({ sec: 0.9, gain: 0.1 + Math.random() * 0.12, freq: 260, freqEnd: 60, brown: true });
      battleNodes.push(setTimeout(tick, 1600 + Math.random() * 3200));
    };
    battleNodes.push(setTimeout(tick, 900));
  };
  A.stopBattle = function () {
    battleNodes.forEach((t) => clearTimeout(t));
    battleNodes = [];
    A.ambient(false);
  };
  // 页面卸载 / 切后台时彻底关掉音频，避免自动化或预览页残留发声
  A.close = function () {
    A.stopBattle();
    if (wind) { try { wind.src.stop(); } catch (e) {} wind = null; }
    if (ctx) { try { ctx.close(); } catch (e) {} ctx = null; master = null; }
  };
  window.addEventListener('pagehide', A.close);
  window.addEventListener('beforeunload', A.close);
})();
