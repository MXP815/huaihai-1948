/* ==========================================================================
   HX Engine — 自研 WebGL2 渲染器（零依赖）
   低多边形 + 强轮廓光 + 泛光 + 软阴影 + 程序化天空
   ========================================================================== */
(function () {
  const HX = (window.HX = window.HX || {});
  const M = (HX.M = {});
  const U = (HX.U = {});

  /* ---------------- math ---------------- */
  M.ident = function (o) {
    o = o || new Float32Array(16);
    o.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    return o;
  };
  M.persp = function (o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = (far + near) * nf; o[11] = -1;
    o[12] = 0; o[13] = 0; o[14] = 2 * far * near * nf; o[15] = 0;
    return o;
  };
  M.lookAt = function (o, eye, center, up) {
    let z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
    let l = Math.hypot(z0, z1, z2) || 1; z0 /= l; z1 /= l; z2 /= l;
    let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
    l = Math.hypot(x0, x1, x2) || 1; x0 /= l; x1 /= l; x2 /= l;
    const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
    o[0] = x0; o[1] = y0; o[2] = z0; o[3] = 0;
    o[4] = x1; o[5] = y1; o[6] = z1; o[7] = 0;
    o[8] = x2; o[9] = y2; o[10] = z2; o[11] = 0;
    o[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
    o[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
    o[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
    o[15] = 1;
    return o;
  };
  M.mul = function (o, a, b) {
    // 列主序：o = a * b
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return o;
  };
  M.ortho = function (o, l, r, b, t, n, f) {
    o[0] = 2 / (r - l); o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = 2 / (t - b); o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = -2 / (f - n); o[11] = 0;
    o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1;
    return o;
  };
  M.raySphere = function (ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    const ex = cx - ox, ey = cy - oy, ez = cz - oz;
    const b = ex * dx + ey * dy + ez * dz;
    const c = ex * ex + ey * ey + ez * ez - r * r;
    const disc = b * b - c;
    if (disc < 0) return -1;
    const t = b - Math.sqrt(disc);
    return t >= 0 ? t : (b + Math.sqrt(disc) >= 0 ? 0.01 : -1);
  };

  /* ---------------- utils ---------------- */
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smooth = (t) => t * t * (3 - 2 * t);
  U.ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  U.hash = function (n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  U.noise = function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = U.smooth(xf), v = U.smooth(yf);
    const a = U.hash(xi + yi * 57), b = U.hash(xi + 1 + yi * 57), c = U.hash(xi + (yi + 1) * 57), d = U.hash(xi + 1 + (yi + 1) * 57);
    return U.lerp(U.lerp(a, b, u), U.lerp(c, d, u), v);
  };
  U.fbm = function (x, y, oct) {
    let s = 0, a = 0.5, f = 1;
    for (let i = 0; i < (oct || 4); i++) { s += U.noise(x * f, y * f) * a; a *= 0.5; f *= 2.03; }
    return s;
  };
  U.rng = function (seed) {
    let s = seed | 0 || 1;
    return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296); };
  };
  U.fmt = (n) => (n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(Math.round(n)));
  U.color = function (hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  };

  /* ---------------- meshes ---------------- */
  function meshData(pos, nrm, idx, col) {
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: idx ? new Uint32Array(idx) : null, col: col ? new Float32Array(col) : null };
  }
  const BOX = (function () {
    const p = [], n = [], idx = [];
    const faces = [
      [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]
    ];
    // 用标准立方体数据（每面独立法线）
    const V = [
      // +X
      [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5],
      // -X
      [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5],
      // +Y
      [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
      // -Y
      [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5],
      // +Z
      [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, 0.5],
      // -Z
      [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, -0.5, -0.5]
    ];
    const N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) { p.push(...V[f * 4 + v]); n.push(...N[f]); }
      const b = f * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    return meshData(p, n, idx);
  })();

  function makeCone(seg, rBot, rTop, h, cap) {
    const p = [], n = [], idx = [];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      // 侧面（两个三角，法线近似）
      const bt = [[c0 * rBot, 0, s0 * rBot], [c1 * rBot, 0, s1 * rBot], [c1 * rTop, h, s1 * rTop]];
      const bt2 = [[c0 * rBot, 0, s0 * rBot], [c1 * rTop, h, s1 * rTop], [c0 * rTop, h, s0 * rTop]];
      const na = [c0, (rBot - rTop) / h, s0], nb = [c1, (rBot - rTop) / h, s1];
      const b0 = p.length / 3;
      p.push(...bt[0], ...bt[1], ...bt[2], ...bt2[0], ...bt2[1], ...bt2[2]);
      n.push(...na, ...na, ...nb, ...na, ...nb, ...nb);
      idx.push(b0, b0 + 1, b0 + 2, b0 + 3, b0 + 4, b0 + 5);
    }
    if (cap) {
      const top = p.length / 3;
      p.push(0, h, 0); n.push(0, 1, 0);
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        p.push(Math.cos(a) * rTop, h, Math.sin(a) * rTop); n.push(0, 1, 0);
      }
      for (let i = 0; i < seg; i++) idx.push(top, top + 1 + i, top + 1 + ((i + 1) % seg));
      const bot = p.length / 3;
      p.push(0, 0, 0); n.push(0, -1, 0);
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        p.push(Math.cos(a) * rBot, 0, Math.sin(a) * rBot); n.push(0, -1, 0);
      }
      for (let i = 0; i < seg; i++) idx.push(bot, bot + 1 + ((i + 1) % seg), bot + 1 + i);
    }
    return meshData(p, n, idx);
  }

  const CYL = makeCone(12, 0.5, 0.5, 1, true);
  const CONE = makeCone(9, 0.5, 0.08, 1, true);
  const CONE6 = makeCone(5, 0.5, 0.06, 1, true);

  function makeWedge() {
    // 屋脊：底 1x1，高 1，沿 Z 延伸
    const p = [], n = [], idx = [];
    const v = [
      [-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5],
      [0, 1, -0.5], [0, 1, 0.5]
    ];
    const tris = [
      [0, 1, 2], [0, 2, 3], // bottom
      [0, 4, 1], [3, 2, 5], // ends
      [0, 3, 5], [0, 5, 4], // left slope
      [1, 4, 5], [1, 5, 2]  // right slope
    ];
    for (const t of tris) {
      const a = v[t[0]], b = v[t[1]], c = v[t[2]];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const l = Math.hypot(...nn) || 1; nn = nn.map((x) => x / l);
      const base = p.length / 3;
      p.push(...a, ...b, ...c);
      n.push(...nn, ...nn, ...nn);
      idx.push(base, base + 1, base + 2);
    }
    return meshData(p, n, idx);
  }
  const WEDGE = makeWedge();

  function makeRing(seg, inner, outer) {
    const p = [], n = [], idx = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      p.push(c * inner, 0, s * inner, c * outer, 0, s * outer);
      n.push(0, 1, 0, 0, 1, 0);
    }
    for (let i = 0; i < seg; i++) {
      const b = i * 2, nx = ((i + 1) % seg) * 2;
      idx.push(b, nx, b + 1, b + 1, nx, nx + 1);
    }
    return meshData(p, n, idx);
  }
  const RING = makeRing(40, 0.82, 1.0);
  const RING_THIN = makeRing(24, 0.94, 1.0);

  function makePlane() {
    return meshData(
      [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5],
      [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      [0, 1, 2, 0, 2, 3]
    );
  }
  const PLANE = makePlane();

  /* ---------------- shaders ---------------- */
  const VS_MAIN = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aOff;
layout(location=3) in vec3 aScale;
layout(location=4) in vec2 aRot;
layout(location=5) in vec4 aCol;
uniform mat4 uVP; uniform mat4 uLightVP;
out vec3 vN; out vec3 vW; out vec4 vC; out vec4 vSC;
void main(){
  vec3 p = aPos * aScale;
  float s = aRot.x, c = aRot.y;
  vec3 rp = vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z);
  vec3 wp = rp + aOff;
  vec3 n = aNrm / max(aScale, vec3(0.0001));
  vN = normalize(vec3(c*n.x + s*n.z, n.y, -s*n.x + c*n.z));
  vW = wp; vC = aCol;
  vSC = uLightVP * vec4(wp, 1.0);
  gl_Position = uVP * vec4(wp, 1.0);
}`;

  const FS_MAIN = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec4 vC; in vec4 vSC;
uniform vec3 uCam, uLightDir, uLightCol, uSkyCol, uGroundCol, uFogCol, uRimCol;
uniform float uFogDensity, uRim, uUseShadow, uAlpha, uEmissive;
uniform sampler2D uShadow;
out vec4 outColor;
float shadowFactor(vec4 sc){
  vec3 p = sc.xyz / sc.w; p = p * 0.5 + 0.5;
  if(p.x < 0.002 || p.x > 0.998 || p.y < 0.002 || p.y > 0.998) return 1.0;
  vec2 texel = 1.0 / vec2(textureSize(uShadow, 0));
  float sum = 0.0;
  for(int y=-1; y<=1; y++){
    for(int x=-1; x<=1; x++){
      float d = texture(uShadow, p.xy + vec2(float(x), float(y)) * texel * 1.35).r;
      sum += (p.z - 0.0035 <= d) ? 1.0 : 0.0;
    }
  }
  return sum / 9.0;
}
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  vec3 L = normalize(uLightDir);
  float ndl = max(dot(N, L), 0.0);
  float sh = uUseShadow > 0.5 ? shadowFactor(vSC) : 1.0;
  vec3 amb = mix(uGroundCol, uSkyCol, N.y * 0.5 + 0.5);
  vec3 base = vC.rgb;
  vec3 col = base * (amb * 0.62 + uLightCol * ndl * sh * 0.85);
  vec3 H = normalize(L + V);
  col += uLightCol * pow(max(dot(N, H), 0.0), 28.0) * 0.22 * sh;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += uRimCol * rim * uRim;
  col += base * vC.w * uEmissive;
  float d = length(uCam - vW);
  float fog = 1.0 - exp(-pow(d * uFogDensity, 2.0));
  col = mix(col, uFogCol, clamp(fog, 0.0, 1.0));
  outColor = vec4(col, uAlpha);
}`;

  const VS_DEPTH = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=2) in vec3 aOff;
layout(location=3) in vec3 aScale;
layout(location=4) in vec2 aRot;
uniform mat4 uLightVP;
void main(){
  vec3 p = aPos * aScale;
  float s = aRot.x, c = aRot.y;
  vec3 rp = vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z);
  gl_Position = uLightVP * vec4(rp + aOff, 1.0);
}`;
  const FS_DEPTH = `#version 300 es
precision mediump float;
void main(){}`;

  const VS_TERR = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aCol;
uniform mat4 uVP; uniform mat4 uLightVP;
out vec3 vN; out vec3 vW; out vec4 vC; out vec4 vSC;
void main(){
  vN = aNrm; vW = aPos; vC = aCol;
  vSC = uLightVP * vec4(aPos, 1.0);
  gl_Position = uVP * vec4(aPos, 1.0);
}`;

  const FS_TERR = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec4 vC; in vec4 vSC;
uniform vec3 uCam, uLightDir, uLightCol, uSkyCol, uGroundCol, uFogCol, uRimCol;
uniform float uFogDensity, uRim, uUseShadow, uAlpha, uEmissive, uTime;
uniform sampler2D uShadow;
out vec4 outColor;
float shadowFactor(vec4 sc){
  vec3 p = sc.xyz / sc.w; p = p * 0.5 + 0.5;
  if(p.x < 0.002 || p.x > 0.998 || p.y < 0.002 || p.y > 0.998) return 1.0;
  vec2 texel = 1.0 / vec2(textureSize(uShadow, 0));
  float sum = 0.0;
  for(int y=-1; y<=1; y++){
    for(int x=-1; x<=1; x++){
      float d = texture(uShadow, p.xy + vec2(float(x), float(y)) * texel * 1.35).r;
      sum += (p.z - 0.004 <= d) ? 1.0 : 0.0;
    }
  }
  return sum / 9.0;
}
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  vec3 L = normalize(uLightDir);
  float ndl = max(dot(N, L), 0.0);
  float sh = uUseShadow > 0.5 ? shadowFactor(vSC) : 1.0;
  vec3 amb = mix(uGroundCol, uSkyCol, N.y * 0.5 + 0.5);
  vec3 base = vC.rgb;
  vec3 col = base * (amb * 0.66 + uLightCol * ndl * sh * 0.8);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += uRimCol * rim * uRim * 0.6;
  col += base * vC.w * uEmissive;
  // 等高线 / 田垄的轻微条纹，增强低模地形层次
  float band = smoothstep(0.42, 0.5, fract(vW.y * 1.6 + 0.15));
  col *= 1.0 - band * 0.045;
  float d = length(uCam - vW);
  float fog = 1.0 - exp(-pow(d * uFogDensity, 2.0));
  col = mix(col, uFogCol, clamp(fog, 0.0, 1.0));
  outColor = vec4(col, uAlpha);
}`;

  const VS_SKY = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){ vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
  const FS_SKY = `#version 300 es
precision highp float;
in vec2 vUV;
uniform vec3 uRight, uUp, uFwd, uSunDir, uSunCol, uSkyTop, uSkyHorizon, uFogCol;
uniform float uTanY, uAspect, uTime;
out vec4 outColor;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
void main(){
  vec2 p = vUV * 2.0 - 1.0;
  vec3 dir = normalize(uFwd + uRight * p.x * uTanY * uAspect + uUp * p.y * uTanY);
  float y = clamp(dir.y, 0.0, 1.0);
  float t = pow(1.0 - y, 2.6);
  vec3 col = mix(uSkyTop, uSkyHorizon, t);
  float sd = max(dot(dir, uSunDir), 0.0);
  col += uSunCol * pow(sd, 260.0) * 6.0;
  col += uSunCol * pow(sd, 6.0) * 0.16;
  // 薄云层（平面投影噪声）
  vec2 cp = dir.xz / max(dir.y + 0.25, 0.06) * 1.4 + vec2(uTime * 0.008, 0.0);
  float cl = noise(cp) * 0.55 + noise(cp * 2.3) * 0.3;
  cl = smoothstep(0.55, 0.95, cl) * smoothstep(0.02, 0.35, y);
  col = mix(col, uSkyHorizon * 1.35 + uSunCol * 0.05, cl * 0.5);
  if (dir.y < 0.0) col = mix(col, uFogCol, clamp(-dir.y * 6.0, 0.0, 1.0));
  outColor = vec4(col, 1.0);
}`;

  const VS_SPRITE = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in vec3 aOff;
layout(location=2) in float aSize;
layout(location=3) in vec4 aCol;
uniform mat4 uVP; uniform vec3 uRight, uUp;
out vec2 vUV; out vec4 vC;
void main(){
  vUV = aPos;
  vec3 wp = aOff + uRight * (aPos.x * aSize) + uUp * (aPos.y * aSize);
  vC = aCol;
  gl_Position = uVP * vec4(wp, 1.0);
}`;
  const FS_SPRITE = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vC;
uniform float uSoft;
out vec4 outColor;
void main(){
  float d = length(vUV);
  float a = smoothstep(1.0, uSoft, d);
  outColor = vec4(vC.rgb, vC.a * a);
}`;

  const VS_FLAT = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
uniform mat4 uVP;
out vec4 vC;
void main(){ vC = aCol; gl_Position = uVP * vec4(aPos, 1.0); }`;
  const FS_FLAT = `#version 300 es
precision highp float;
in vec4 vC; out vec4 outColor;
void main(){ outColor = vC; }`;

  const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uTexel; out vec4 outColor;
void main(){
  vec3 c = vec3(0.0);
  c += texture(uTex, vUV + vec2(-1,-1) * uTexel).rgb;
  c += texture(uTex, vUV + vec2( 1,-1) * uTexel).rgb;
  c += texture(uTex, vUV + vec2(-1, 1) * uTexel).rgb;
  c += texture(uTex, vUV + vec2( 1, 1) * uTexel).rgb;
  c *= 0.25;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float k = smoothstep(0.62, 1.15, l);
  outColor = vec4(c * k, 1.0);
}`;
  const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir; out vec4 outColor;
void main(){
  vec3 c = texture(uTex, vUV).rgb * 0.227;
  c += (texture(uTex, vUV + uDir * 1.0).rgb + texture(uTex, vUV - uDir * 1.0).rgb) * 0.194;
  c += (texture(uTex, vUV + uDir * 2.0).rgb + texture(uTex, vUV - uDir * 2.0).rgb) * 0.121;
  c += (texture(uTex, vUV + uDir * 3.5).rgb + texture(uTex, vUV - uDir * 3.5).rgb) * 0.061;
  c += (texture(uTex, vUV + uDir * 5.0).rgb + texture(uTex, vUV - uDir * 5.0).rgb) * 0.011;
  outColor = vec4(c, 1.0);
}`;
  const FS_COMP = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene, uBloom;
uniform float uBloomAmt, uExposure, uTime, uGrain, uVignette;
uniform vec3 uGrade;
out vec4 outColor;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 c = texture(uScene, vUV).rgb;
  vec3 b = texture(uBloom, vUV).rgb;
  c += b * uBloomAmt;
  c *= uGrade;
  c = aces(c * uExposure);
  vec2 q = vUV - 0.5;
  c *= 1.0 - uVignette * dot(q, q);
  c += (hash(vUV * 1024.0 + fract(uTime) * 13.0) - 0.5) * uGrain;
  outColor = vec4(c, 1.0);
}`;

  /* ---------------- renderer ---------------- */
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      const opts = { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: false };
      const gl = (this.gl = canvas.getContext('webgl2', opts));
      if (!gl) throw new Error('此浏览器不支持 WebGL2。请使用 Chrome / Edge 最新版，并开启硬件加速。');
      this.quality = { dpr: 1.25, shadow: 1536, msaa: 4, bloom: true, density: 1.0, shadowsOn: true };
      this.instCapacity = 9000;
      this.instStride = 12;
      this.instData = new Float32Array(this.instCapacity * 12);
      this.stats = { draws: 0, instances: 0, tris: 0 };
      this.time = 0;

      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      this.progMain = this.createProgram(VS_MAIN, FS_MAIN, ['uVP', 'uLightVP', 'uCam', 'uLightDir', 'uLightCol', 'uSkyCol', 'uGroundCol', 'uFogCol', 'uRimCol', 'uFogDensity', 'uRim', 'uUseShadow', 'uAlpha', 'uEmissive', 'uShadow']);
      this.progDepth = this.createProgram(VS_DEPTH, FS_DEPTH, ['uLightVP']);
      this.progTerr = this.createProgram(VS_TERR, FS_TERR, ['uVP', 'uLightVP', 'uCam', 'uLightDir', 'uLightCol', 'uSkyCol', 'uGroundCol', 'uFogCol', 'uRimCol', 'uFogDensity', 'uRim', 'uUseShadow', 'uAlpha', 'uEmissive', 'uTime', 'uShadow']);
      this.progSky = this.createProgram(VS_SKY, FS_SKY, ['uRight', 'uUp', 'uFwd', 'uSunDir', 'uSunCol', 'uSkyTop', 'uSkyHorizon', 'uFogCol', 'uTanY', 'uAspect', 'uTime']);
      this.progSprite = this.createProgram(VS_SPRITE, FS_SPRITE, ['uVP', 'uRight', 'uUp', 'uSoft']);
      this.progFlat = this.createProgram(VS_FLAT, FS_FLAT, ['uVP']);
      this.progBright = this.createProgram(VS_SKY, FS_BRIGHT, ['uTex', 'uTexel']);
      this.progBlur = this.createProgram(VS_SKY, FS_BLUR, ['uTex', 'uDir']);
      this.progComp = this.createProgram(VS_SKY, FS_COMP, ['uScene', 'uBloom', 'uBloomAmt', 'uExposure', 'uTime', 'uGrain', 'uVignette', 'uGrade']);

      this.meshes = {};
      for (const k in { box: 1, wedge: 1, cone: 1, cone6: 1, cyl: 1, ring: 1, ringThin: 1, plane: 1 }) {
        this.meshes[k] = this.createMesh(
          { box: BOX, wedge: WEDGE, cone: CONE, cone6: CONE6, cyl: CYL, ring: RING, ringThin: RING_THIN, plane: PLANE }[k]
        );
      }
      this.instVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instVBO);
      gl.bufferData(gl.ARRAY_BUFFER, this.instData.byteLength, gl.DYNAMIC_DRAW);
      for (const k in this.meshes) this.setupInstanced(this.meshes[k]);

      this.spriteMesh = this.createMesh(
        meshData([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], [0, 1, 2, 0, 2, 3], [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])
      );
      this.spriteVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteVBO);
      gl.bufferData(gl.ARRAY_BUFFER, 5000 * 8 * 4, gl.DYNAMIC_DRAW);
      this.spriteData = new Float32Array(5000 * 8);
      // sprite VAO（8 floats：off3, size1, color4）
      this.spriteVAO = gl.createVertexArray();
      gl.bindVertexArray(this.spriteVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteMesh.vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.spriteMesh.ibo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteVBO);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 12); gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(3, 1);
      gl.bindVertexArray(null);

      this.flatVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.flatVBO);
      gl.bufferData(gl.ARRAY_BUFFER, 8000 * 7 * 4, gl.DYNAMIC_DRAW);
      this.flatData = new Float32Array(8000 * 7);
      this.flatVAO = gl.createVertexArray();
      gl.bindVertexArray(this.flatVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.flatVBO);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
      gl.bindVertexArray(null);

      this.quadVAO = gl.createVertexArray();
      const qb = gl.createBuffer();
      gl.bindVertexArray(this.quadVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, qb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      this.staticCache = new WeakMap();
      this.shadowFBO = null;
      this.targets = null;
      this.resize();
    }

    createProgram(vs, fs, uniforms) {
      const gl = this.gl;
      const v = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(v, vs); gl.compileShader(v);
      if (!gl.getShaderParameter(v, gl.COMPILE_STATUS)) throw new Error('VS 编译失败: ' + gl.getShaderInfoLog(v));
      const f = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(f, fs); gl.compileShader(f);
      if (!gl.getShaderParameter(f, gl.COMPILE_STATUS)) throw new Error('FS 编译失败: ' + gl.getShaderInfoLog(f));
      const p = gl.createProgram();
      gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('程序链接失败: ' + gl.getProgramInfoLog(p));
      p.u = {};
      for (const n of uniforms) p.u[n] = gl.getUniformLocation(p, n);
      p.attrs = {};
      return p;
    }

    createMesh(data) {
      const gl = this.gl, m = { mode: gl.TRIANGLES, count: 0 };
      const vbo = gl.createBuffer();
      const nbo = gl.createBuffer();
      m.vbo = vbo; m.nbo = nbo;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, data.pos, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
      gl.bufferData(gl.ARRAY_BUFFER, data.nrm, gl.STATIC_DRAW);
      let cbo = null;
      if (data.col) { cbo = gl.createBuffer(); m.cbo = cbo; gl.bindBuffer(gl.ARRAY_BUFFER, cbo); gl.bufferData(gl.ARRAY_BUFFER, data.col, gl.STATIC_DRAW); }
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.idx, gl.STATIC_DRAW);
      m.ibo = ibo;
      m.count = data.idx.length;
      m.tris = data.idx.length / 3;
      return m;
    }

    setupInstanced(mesh) {
      const gl = this.gl;
      mesh.vao = gl.createVertexArray();
      gl.bindVertexArray(mesh.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nbo);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instVBO);
      const S = 12 * 4;
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, S, 0); gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, S, 12); gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 2, gl.FLOAT, false, S, 24); gl.vertexAttribDivisor(4, 1);
      gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 4, gl.FLOAT, false, S, 32); gl.vertexAttribDivisor(5, 1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
      gl.bindVertexArray(null);
    }

    createStaticMesh(positions, normals, colors, indices) {
      const data = meshData(positions, normals, indices, colors);
      const m = this.createMesh(data);
      return m;
    }

    resize() {
      const gl = this.gl, c = this.canvas;
      const rect = c.getBoundingClientRect ? c.getBoundingClientRect() : { width: 0, height: 0 };
      const cw = Math.max(rect.width, c.clientWidth, window.innerWidth, 320);
      const ch = Math.max(rect.height, c.clientHeight, window.innerHeight, 240);
      /* 分辨率自适应：DPR 上限 × 屏幕像素预算，窄屏 / 高 DPR 自动降采样 */
      const budget = this.quality.maxPixels || 2600000;
      const byPixels = Math.sqrt(budget / Math.max(1, cw * ch));
      const dpr = Math.max(0.55, Math.min(window.devicePixelRatio || 1, this.quality.dpr || 1, byPixels));
      this.effDpr = dpr;
      const w = Math.max(2, Math.floor(cw * dpr));
      const h = Math.max(2, Math.floor(ch * dpr));
      this.cssW = cw; this.cssH = ch;
      if (this.targets && this.targets.w === w && this.targets.h === h) return;
      c.width = w; c.height = h;
      this.destroyTargets();
      const msaa = this.quality.msaa;
      const colorRB = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, colorRB);
      if (msaa > 0) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaa, gl.RGBA8, w, h);
      else gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h);
      const depthRB = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRB);
      if (msaa > 0) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaa, gl.DEPTH_COMPONENT24, w, h);
      else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      let msFBO = null;
      if (msaa > 0) {
        msFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, msFBO);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colorRB);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRB);
      }
      const sceneTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const sceneFBO = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
      if (msaa === 0) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRB);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      const hw = Math.max(2, Math.floor(w / 2)), hh = Math.max(2, Math.floor(h / 2));
      const mkHalf = () => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, hw, hh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        return { t, fb };
      };
      const bright = mkHalf(), blurA = mkHalf(), blurB = mkHalf();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      this.targets = { w, h, hw, hh, msaa, msFBO, colorRB, depthRB, sceneFBO, sceneTex, bright, blurA, blurB };

      // 阴影贴图
      if (!this.shadowFBO) {
        const sz = this.quality.shadow;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, sz, sz, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
        gl.drawBuffers([gl.NONE]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.shadowFBO = { fb, tex, size: sz };
      }
    }

    setQuality(q) {
      Object.assign(this.quality, q);
      if (this.shadowFBO) {
        const gl = this.gl;
        gl.deleteTexture(this.shadowFBO.tex); gl.deleteFramebuffer(this.shadowFBO.fb);
        this.shadowFBO = null;
      }
      this.targets = null;
      this.resize();
    }

    destroyTargets() {
      const gl = this.gl, t = this.targets;
      if (!t) return;
      gl.deleteFramebuffer(t.sceneFBO); gl.deleteTexture(t.sceneTex);
      gl.deleteRenderbuffer(t.colorRB); gl.deleteRenderbuffer(t.depthRB);
      if (t.msFBO) gl.deleteFramebuffer(t.msFBO);
      for (const k of ['bright', 'blurA', 'blurB']) { gl.deleteFramebuffer(t[k].fb); gl.deleteTexture(t[k].t); }
      this.targets = null;
    }

    beginFrame(cam, env) {
      const gl = this.gl, t = this.targets, q = this.quality, c = this.canvas;
      this.stats.draws = 0; this.stats.instances = 0; this.stats.tris = 0;
      if (this.debugDirect) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, c.width, c.height); }
      else gl.bindFramebuffer(gl.FRAMEBUFFER, t.msFBO || t.sceneFBO);
      gl.viewport(0, 0, this.debugDirect ? c.width : t.w, this.debugDirect ? c.height : t.h);
      const bg = env.fogCol;
      gl.clearColor(bg[0] * 0.35, bg[1] * 0.35, bg[2] * 0.38, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);

      // camera
      const eye = cam.pos, fwd = [cam.target[0] - eye[0], cam.target[1] - eye[1], cam.target[2] - eye[2]];
      const fl = Math.hypot(...fwd) || 1; fwd[0] /= fl; fwd[1] /= fl; fwd[2] /= fl;
      let right = [fwd[2], 0, -fwd[0]];
      const rl = Math.hypot(...right) || 1;
      right = [right[0] / rl, 0, right[2] / rl];
      const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
      const upn = [-up[0], -up[1], -up[2]]; // cross(right, fwd)
      const tanY = Math.tan((cam.fov * Math.PI / 180) / 2);
      const aspect = t.w / t.h;
      const view = M.ident(new Float32Array(16));
      M.lookAt(view, eye, cam.target, [0, 1, 0]);
      const proj = M.persp(new Float32Array(16), (cam.fov * Math.PI) / 180, aspect, cam.near || 0.4, cam.far || 900);
      const vp = M.ident(new Float32Array(16));
      M.mul(vp, proj, view);

      // 光照
      const L = env.sunDir, ll = Math.hypot(...L);
      const ld = [L[0] / ll, L[1] / ll, L[2] / ll];
      const lightVP = this.computeLightVP(ld, env.focus || [0, 0], env.shadowRadius || 55);
      this.cam = cam; this.env = env; this.vp = vp; this.view = view; this.lightVP = lightVP;
      this.camRight = [right[0], right[1], right[2]]; this.camUp = upn;

      // sky
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      const p = this.progSky;
      gl.useProgram(p);
      gl.uniform3fv(p.u.uRight, right);
      gl.uniform3fv(p.u.uUp, upn);
      gl.uniform3fv(p.u.uFwd, fwd);
      gl.uniform3fv(p.u.uSunDir, ld);
      gl.uniform3fv(p.u.uSunCol, env.sunCol || [1, .85, .65]);
      gl.uniform3fv(p.u.uSkyTop, env.skyTop || [0.04, 0.12, 0.16]);
      gl.uniform3fv(p.u.uSkyHorizon, env.skyHorizon || env.fogCol || [0.1, 0.2, 0.24]);
      gl.uniform3fv(p.u.uFogCol, env.fogCol || [0.08, 0.16, 0.19]);
      gl.uniform1f(p.u.uTanY, tanY);
      gl.uniform1f(p.u.uAspect, aspect);
      gl.uniform1f(p.u.uTime, this.time);
      gl.bindVertexArray(this.quadVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      this.stats.draws++;
    }

    computeLightVP(ld, focus, radius) {
      const out = new Float32Array(16);
      const center = [focus[0], 0, focus[1]];
      const dist = radius * 2.4;
      const eye = [center[0] + ld[0] * dist, center[1] + ld[1] * dist, center[2] + ld[2] * dist];
      const view = M.ident(new Float32Array(16));
      M.lookAt(view, eye, center, [0, 1, 0]);
      const proj = M.ortho(new Float32Array(16), -radius, radius, -radius, radius, 1, dist * 2.6);
      M.mul(out, proj, view);
      return out;
    }

    drawShadow(scene) {
      const gl = this.gl, q = this.quality, t = this.targets;
      if (!this.shadowFBO || !q.shadowsOn) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO.fb);
      gl.viewport(0, 0, this.shadowFBO.size, this.shadowFBO.size);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.progDepth);
      gl.uniformMatrix4fv(this.progDepth.u.uLightVP, false, this.lightVP);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.4, 3.2);
      for (const name in scene.lists) {
        const list = scene.lists[name];
        if (!list.cast || list.n === 0) continue;
        const mesh = this.meshes[name];
        if (!mesh) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instVBO);
        const cnt = Math.min(list.n, this.instCapacity);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, list.data.subarray(0, cnt * 12));
        gl.bindVertexArray(mesh.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0, cnt);
        this.stats.draws++;
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindVertexArray(null);
      // 恢复主渲染目标（此前误绑到默认帧缓冲会导致几何体全部丢失）
      if (this.debugDirect) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height); }
      else { gl.bindFramebuffer(gl.FRAMEBUFFER, t.msFBO || t.sceneFBO); gl.viewport(0, 0, t.w, t.h); }
    }

    drawScene(scene) {
      const gl = this.gl, t = this.targets, env = this.env, cam = this.cam;
      // 静态地形
      gl.useProgram(this.progTerr);
      this.setCommonUniforms(this.progTerr, env, cam);
      gl.uniform1f(this.progTerr.u.uUseShadow, this.quality.shadowsOn && this.shadowFBO ? 0 : 0);
      gl.uniform1f(this.progTerr.u.uEmissive, 1.0);
      gl.uniform1f(this.progTerr.u.uRim, env.rim || 0.3);
      gl.uniform1f(this.progTerr.u.uTime, this.time);
      if (this.staticList) {
        for (const s of this.staticList) {
          const m = s.mesh;
          gl.bindVertexArray(m.vao || this.makeStaticVAO(m));
          gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
          this.stats.draws++; this.stats.tris += m.tris || 0;
        }
      }
      // 实例化
      gl.useProgram(this.progMain);
      this.setCommonUniforms(this.progMain, env, cam);
      gl.uniform1f(this.progMain.u.uUseShadow, this.quality.shadowsOn && this.shadowFBO ? 0 : 0);
      gl.uniform1f(this.progMain.u.uRim, env.rim || 0.3);
      gl.uniform1f(this.progMain.u.uEmissive, 1.0);
      gl.uniform1f(this.progMain.u.uAlpha, 1.0);
      const useShadow = this.quality.shadowsOn && this.shadowFBO ? 1.0 : 0.0;
      gl.uniform1f(this.progMain.u.uUseShadow, useShadow);
      if (useShadow) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shadowFBO.tex); gl.uniform1i(this.progMain.u.uShadow, 0); }
      for (const name in scene.lists) {
        const list = scene.lists[name];
        if (list.n === 0) continue;
        const mesh = this.meshes[name];
        if (!mesh) continue;
        const cnt = Math.min(list.n, this.instCapacity);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instVBO);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, list.data.subarray(0, cnt * 12));
        gl.bindVertexArray(mesh.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0, cnt);
        this.stats.draws++; this.stats.instances += cnt; this.stats.tris += (mesh.tris || 0) * cnt;
      }
      gl.bindVertexArray(null);
      // 线条 / 三角形面片
      if (scene.flat) this.drawFlat(scene.flat);
      // 精灵
      if (scene.sprites && scene.sprites.length) this.drawSprites(scene.sprites, true);
      if (scene.spritesSoft && scene.spritesSoft.length) this.drawSprites(scene.spritesSoft, false);
    }

    makeStaticVAO(m) {
      const gl = this.gl;
      m.vao = gl.createVertexArray();
      gl.bindVertexArray(m.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.nbo);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      if (m.cbo) {
        gl.bindBuffer(gl.ARRAY_BUFFER, m.cbo);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
      gl.bindVertexArray(null);
      return m.vao;
    }

    setCommonUniforms(p, env, cam) {
      const gl = this.gl;
      gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
      gl.uniformMatrix4fv(p.u.uLightVP, false, this.lightVP);
      gl.uniform3fv(p.u.uCam, cam.pos);
      gl.uniform3fv(p.u.uLightDir, env.sunDir);
      gl.uniform3fv(p.u.uLightCol, env.sunCol);
      gl.uniform3fv(p.u.uSkyCol, env.skyCol);
      gl.uniform3fv(p.u.uGroundCol, env.groundCol);
      gl.uniform3fv(p.u.uFogCol, env.fogCol);
      gl.uniform3fv(p.u.uRimCol, env.rimCol);
      gl.uniform1f(p.u.uFogDensity, env.fogDensity);
      if (p.u.uShadow) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowFBO ? this.shadowFBO.tex : null);
        gl.uniform1i(p.u.uShadow, 0);
      }
    }

    drawFlat(list) {
      const gl = this.gl;
      const count = Math.min(list.count, 8000);
      this.flatData.set(list.data.subarray(0, count * 7));
      gl.useProgram(this.progFlat);
      gl.uniformMatrix4fv(this.progFlat.u.uVP, false, this.vp);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.flatVBO);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.flatData.subarray(0, count * 7));
      if (list.additive) { gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false); }
      else { gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
      gl.bindVertexArray(this.flatVAO);
      gl.drawArrays(list.mode, 0, count);
      gl.bindVertexArray(null);
      gl.depthMask(true);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.stats.draws++;
    }

    drawSprites(list, additive) {
      const gl = this.gl;
      const n = Math.min(list.length, 5000);
      for (let i = 0; i < n; i++) {
        const s = list[i];
        const o = i * 8;
        this.spriteData[o] = s[0]; this.spriteData[o + 1] = s[1]; this.spriteData[o + 2] = s[2];
        this.spriteData[o + 3] = s[3];
        this.spriteData[o + 4] = s[4]; this.spriteData[o + 5] = s[5]; this.spriteData[o + 6] = s[6]; this.spriteData[o + 7] = s[7];
      }
      if (n === 0) return;
      gl.useProgram(this.progSprite);
      gl.uniformMatrix4fv(this.progSprite.u.uVP, false, this.vp);
      gl.uniform3fv(this.progSprite.u.uRight, this.camRight);
      gl.uniform3fv(this.progSprite.u.uUp, this.camUp);
      gl.uniform1f(this.progSprite.u.uSoft, additive ? 0.15 : 0.35);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteVBO);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.spriteData.subarray(0, n * 8));
      if (additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.bindVertexArray(this.spriteVAO);
      gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, n);
      gl.bindVertexArray(null);
      gl.depthMask(true);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.stats.draws++;
    }

    endFrame(preserveDraw) {
      const gl = this.gl, t = this.targets, q = this.quality;
      // resolve MSAA
      if (t.msFBO) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.msFBO);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.sceneFBO);
        gl.blitFramebuffer(0, 0, t.w, t.h, 0, 0, t.w, t.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      }
      // bloom
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      if (q.bloom) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.bright.fb);
        gl.viewport(0, 0, t.hw, t.hh);
        gl.useProgram(this.progBright);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.sceneTex); gl.uniform1i(this.progBright.u.uTex, 0);
        gl.uniform2f(this.progBright.u.uTexel, 1 / t.w, 1 / t.h);
        gl.bindVertexArray(this.quadVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.useProgram(this.progBlur);
        for (let i = 0; i < 2; i++) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, t.blurA.fb);
          gl.viewport(0, 0, t.hw, t.hh);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.bright.t); gl.uniform1i(this.progBlur.u.uTex, 0);
          gl.uniform2f(this.progBlur.u.uDir, (1 + i * 2.2) / t.hw, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.bindFramebuffer(gl.FRAMEBUFFER, t.bright.fb);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.blurA.t); gl.uniform1i(this.progBlur.u.uTex, 0);
          gl.uniform2f(this.progBlur.u.uDir, 0, (1 + i * 2.2) / t.hh);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      }
      // composite
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, t.w, t.h);
      gl.useProgram(this.progComp);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.sceneTex); gl.uniform1i(this.progComp.u.uScene, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t.bright.t); gl.uniform1i(this.progComp.u.uBloom, 1);
      const grade = this.env.grade || [1, 1, 1];
      gl.uniform3fv(this.progComp.u.uGrade, grade);
      gl.uniform1f(this.progComp.u.uBloomAmt, q.bloom ? (this.env.bloom || 0.55) : 0);
      gl.uniform1f(this.progComp.u.uExposure, this.env.exposure || 1.0);
      gl.uniform1f(this.progComp.u.uTime, this.time);
      gl.uniform1f(this.progComp.u.uGrain, this.env.grain || 0.02);
      gl.uniform1f(this.progComp.u.uVignette, this.env.vignette || 0.33);
      gl.bindVertexArray(this.quadVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      this.stats.draws++;
    }

    render(cam, scene, env, staticList) {
      const rw = this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect().width : 0;
      if (rw > 4 && (!this.cssW || Math.abs(rw - this.cssW) > 2)) this.resize();
      this.staticList = staticList || null;
      this.beginFrame(cam, env);
      this.drawShadow(scene);
      this.drawScene(scene);
      if (!this.debugDirect) this.endFrame();
      // 恢复正常绘制状态
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (this.targets) gl.viewport(0, 0, this.targets.w, this.targets.h);
    }
  }

  HX.Renderer = Renderer;
  HX.Scene = class Scene {
    constructor() {
      this.lists = {};
      this.sprites = [];
      this.spritesSoft = [];
      this.flat = null;
      for (const k of ['box', 'wedge', 'cone', 'cone6', 'cyl', 'ring', 'ringThin', 'plane']) {
        this.lists[k] = { data: new Float32Array(0), n: 0, cap: 0, cast: k !== 'ring' && k !== 'ringThin' && k !== 'plane' };
      }
    }
    reset() {
      for (const k in this.lists) this.lists[k].n = 0;
      this.sprites.length = 0;
      this.spritesSoft.length = 0;
      this.flat = null;
    }
    push(name, x, y, z, sx, sy, sz, rot, r, g, b, em, cast) {
      const L = this.lists[name];
      if (!L) return;
      if (L.n >= L.cap) {
        const cap = Math.max(256, L.cap * 2);
        const nd = new Float32Array(cap * 12);
        nd.set(L.data);
        L.data = nd; L.cap = cap;
      }
      const o = L.n * 12;
      L.data[o] = x; L.data[o + 1] = y; L.data[o + 2] = z;
      L.data[o + 3] = sx; L.data[o + 4] = sy; L.data[o + 5] = sz;
      if (rot === undefined || rot === null) { L.data[o + 6] = 0; L.data[o + 7] = 1; }
      else { L.data[o + 6] = Math.sin(rot); L.data[o + 7] = Math.cos(rot); }
      L.data[o + 8] = 0; L.data[o + 9] = 0; L.data[o + 10] = 0; L.data[o + 11] = 0;
      this.setColor(L, o, r, g, b, em);
      L.n++;
    }
    setColor(L, o, r, g, b, em) {
      const d = L.data;
      // 支持传入 [r,g,b] 数组
      if (Array.isArray(r)) { d[o + 8] = r[0]; d[o + 9] = r[1]; d[o + 10] = r[2]; d[o + 11] = g === undefined ? 0 : g; }
      else { d[o + 8] = r; d[o + 9] = g; d[o + 10] = b; d[o + 11] = em === undefined ? 0 : em; }
    }
    box(x, y, z, sx, sy, sz, rot, col, em) { this.push('box', x, y, z, sx, sy, sz, rot, col, em); }
    addSprite(x, y, z, size, col, a) { this.sprites.push([x, y, z, size, col[0], col[1], col[2], a]); }
    addSoft(x, y, z, size, col, a) { this.spritesSoft.push([x, y, z, size, col[0], col[1], col[2], a]); }
  };

})();
