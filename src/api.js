/* ===== api.js =====
   存档后端客户端。优先级：数据库（REST）优先，localStorage 仅作断网兜底。
   后端地址可用 ?api=... 或 window.HX_API_BASE 覆盖，默认 http://localhost:8080/api */
(function () {
  const HX = (window.HX = window.HX || {});
  const qs = new URLSearchParams(location.search);
  // 由后端同端口托管时（8080）直接用同源 /api，手机用局域网 IP 访问也能命中；
  // 8016 调试页与 Electron 内置静态服务则指向本机 8080。
  function defaultBase() {
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      if (location.port === '8080') return location.origin.replace(/\/+$/, '') + '/api';
      return location.protocol + '//' + location.hostname + ':8080/api';
    }
    return 'http://localhost:8080/api';
  }
  const DEFAULT_BASE = defaultBase();
  const BASE = String(qs.get('api') || window.HX_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');

  class ApiError extends Error {
    constructor(message, status, body) {
      super(message);
      this.name = 'ApiError';
      this.status = status || 0;
      this.body = body || null;
      this.offline = !status;   // 0 = 网络失败/超时/跨域被拒
    }
  }

  async function request(method, path, payload, opts) {
    const o = opts || {};
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, o.timeout || 8000);
    const init = { method, headers: {} };
    if (payload !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(payload);
    }
    if (ctrl) init.signal = ctrl.signal;
    if (o.keepalive) init.keepalive = true;
    try {
      const res = await fetch(BASE + path, init);
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
      if (!res.ok) throw new ApiError('HTTP ' + res.status, res.status, data);
      return data;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(e && e.name === 'AbortError' ? '请求超时' : '后端不可达', 0, null);
    } finally {
      clearTimeout(timer);
    }
  }

  const Api = {
    base: BASE,
    online: null,
    lastError: null,

    list() { return request('GET', '/saves'); },
    get(slot) { return request('GET', '/saves/' + encodeURIComponent(slot)); },
    save(slot, slotName, state, expectedVersion) {
      return request('PUT', '/saves/' + encodeURIComponent(slot), { slotName, state, expectedVersion });
    },
    autoSave(state, expectedVersion, opts) {
      return request('POST', '/saves/auto', { slotName: '自动存档', state, expectedVersion }, opts);
    },
    remove(slot) { return request('DELETE', '/saves/' + encodeURIComponent(slot)); },
    afterAction(record) { return request('POST', '/after-actions', record); },
    async probe() {
      try { await this.list(); this.online = true; this.lastError = null; }
      catch (e) { this.online = false; this.lastError = e.message; }
      return this.online;
    }
  };

  HX.Api = Api;
  HX.ApiError = ApiError;
})();
