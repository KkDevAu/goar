/**
 * GOAR host network fabric — one path, discovered fallbacks.
 *
 *   libcurl.js (packaged ESM) + Wisp  → TLS in-browser
 *   same-origin /api/cors-proxy       → Manus-shaped local hop
 *   bare CORS                         → when the origin allows it
 *   open GET relays                   → last resort only
 *
 * No second stack. Wisp endpoints are probed; first that opens wins.
 */

const MW_FABRIC = {
  engine: null,
  ready: false,
  loading: null,
  wispUrl: "",
  wispTried: [],
  libcurl: null,
  epoxy: null,
  lastError: "",
  probe: null,
};

const MANUS_LS = "pyodide_security_manus_api_key";
const MANUS_LS_LEGACY = "goar_manus_key";

const DEFAULT_WISP_POOL = [
  "wss://wisp.mercurywork.shop/",
];

const CORS_RELAYS = [
  { id: "allorigins", wrap: (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u) },
  { id: "corsproxy", wrap: (u) => "https://corsproxy.io/?" + encodeURIComponent(u) },
  { id: "codetabs", wrap: (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u) },
];

function normalizeWispUrl(u) {
  u = String(u || "").trim();
  if (!u) return "";
  if (u.startsWith("wisps://")) u = "wss://" + u.slice(8);
  if (u.startsWith("wisp://")) u = "ws://" + u.slice(7);
  if (!/^wss?:\/\//i.test(u)) return "";
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") return "";
    if (!parsed.hostname || /\s/.test(parsed.hostname)) return "";
  } catch (_) {
    return "";
  }
  if (!/\/$/.test(u) && !/[?#]/.test(u)) u += "/";
  return u;
}

function wispPool() {
  const pool = [];
  const push = (u) => {
    const n = normalizeWispUrl(u);
    if (n && pool.indexOf(n) === -1) pool.push(n);
  };
  try {
    const s = typeof loadSettings === "function" ? loadSettings() : {};
    if (s && s.wispUrl) push(s.wispUrl);
  } catch (_) {}
  try {
    const saved = localStorage.getItem("goar_wisp_url");
    if (saved) push(saved);
  } catch (_) {}
  if (typeof window !== "undefined" && window.GOAR_WISP_URL) push(window.GOAR_WISP_URL);
  if (typeof NET_RELAY !== "undefined") push(NET_RELAY);
  if (typeof NET_RELAYS !== "undefined" && Array.isArray(NET_RELAYS)) {
    NET_RELAYS.forEach(push);
  }
  DEFAULT_WISP_POOL.forEach(push);
  return pool;
}

function probeWisp(url, timeoutMs) {
  const wisp = normalizeWispUrl(url);
  return new Promise((resolve) => {
    let settled = false;
    let ws;
    const finish = (ok, err) => {
      if (settled) return;
      settled = true;
      try { if (ws) ws.close(); } catch (_) {}
      resolve({ ok: !!ok, url: wisp, error: err || null });
    };
    try {
      ws = new WebSocket(wisp);
      ws.binaryType = "arraybuffer";
      const t = setTimeout(() => finish(false, "timeout"), timeoutMs || 3500);
      ws.onopen = () => { clearTimeout(t); finish(true); };
      ws.onerror = () => { clearTimeout(t); finish(false, "error"); };
      ws.onclose = () => { clearTimeout(t); if (!settled) finish(false, "closed"); };
    } catch (e) {
      finish(false, String(e && e.message ? e.message : e));
    }
  });
}

async function pickWispUrl() {
  const pool = wispPool();
  MW_FABRIC.wispTried = [];
  for (const url of pool) {
    const p = await probeWisp(url, 3500);
    MW_FABRIC.wispTried.push(p);
    if (p.ok) {
      try { localStorage.setItem("goar_wisp_url", url); } catch (_) {}
      return url;
    }
  }
  return pool[0] || DEFAULT_WISP_POOL[0];
}

function resolveWispUrl() {
  const u = MW_FABRIC.wispUrl || wispPool()[0] || DEFAULT_WISP_POOL[0];
  return normalizeWispUrl(u) || DEFAULT_WISP_POOL[0];
}
try {
  const saved = localStorage.getItem("goar_wisp_url");
  if (saved && !normalizeWispUrl(saved)) localStorage.removeItem("goar_wisp_url");
} catch (_) {}

function mwAssetBase() {
  if (typeof goarAssetUrl === "function") return goarAssetUrl("assets/net/");
  if (typeof GOAR_REMOTE === "string" && GOAR_REMOTE) return GOAR_REMOTE + "assets/net/";
  try {
    if (typeof location !== "undefined") {
      const base = location.pathname.replace(/\/[^/]*$/, "/");
      return (location.origin || "") + base + "assets/net/";
    }
  } catch (_) {}
  return "./assets/net/";
}

async function loadLibcurlEngine(wispUrl) {
  const base = mwAssetBase();
  const mod = await import(base + "libcurl.mjs");
  const lc = mod.libcurl || mod.default || mod;
  await lc.load_wasm(base + "libcurl.wasm");
  lc.set_websocket(wispUrl);
  MW_FABRIC.libcurl = lc;
  MW_FABRIC.engine = "libcurl";
  return lc;
}

async function loadEpoxyEngine() { return null; }

async function ensureMwFabric(opts) {
  if (MW_FABRIC.ready && MW_FABRIC.engine && !(opts && opts.force)) {
    return mwFabricStatus();
  }
  if (MW_FABRIC.loading) return MW_FABRIC.loading;
  MW_FABRIC.loading = (async () => {
    MW_FABRIC.lastError = "";
    const wisp = await pickWispUrl();
    MW_FABRIC.wispUrl = wisp;
    try {
      await loadLibcurlEngine(wisp);
      MW_FABRIC.ready = true;
      await probeMwFabric();
      console.log("[goar] fabric ready via", MW_FABRIC.engine, wisp);
      return mwFabricStatus();
    } catch (e) {
      MW_FABRIC.lastError = String(e && e.message ? e.message : e);
      MW_FABRIC.ready = false;
      MW_FABRIC.engine = null;
      console.warn("[goar] fabric unavailable", MW_FABRIC.lastError);
      return mwFabricStatus();
    } finally {
      MW_FABRIC.loading = null;
    }
  })();
  return MW_FABRIC.loading;
}

async function probeMwFabric() {
  try {
    const r = await goarHostFetch("https://example.com/", { method: "GET", maxBytes: 800 });
    MW_FABRIC.probe = {
      ok: !!(r && r.ok),
      status: r && r.status,
      via: r && r.via,
      ms: r && r.ms,
    };
  } catch (e) {
    MW_FABRIC.probe = { ok: false, error: String(e.message || e) };
  }
  return MW_FABRIC.probe;
}

function mwFabricStatus() {
  return {
    ready: !!MW_FABRIC.ready,
    engine: MW_FABRIC.engine,
    wispUrl: MW_FABRIC.wispUrl,
    wispTried: MW_FABRIC.wispTried.slice(),
    lastError: MW_FABRIC.lastError || null,
    probe: MW_FABRIC.probe,
    stack: "libcurl+Wisp · /api/cors-proxy · CORS · GET relay",
  };
}

function persistManusKey(key) {
  key = String(key || "").trim();
  if (!key) return;
  try { localStorage.setItem(MANUS_LS, key); } catch (_) {}
  try { localStorage.setItem(MANUS_LS_LEGACY, key); } catch (_) {}
  try {
    if (typeof loadSettings === "function" && typeof saveSettings === "function") {
      const s = loadSettings() || {};
      s.manusKey = key;
      saveSettings(s);
    }
  } catch (_) {}
}

function readManusKey() {
  try {
    const s = typeof loadSettings === "function" ? loadSettings() : {};
    const fromS = String((s && (s.manusKey || s.manus_api_key)) || "").trim();
    if (fromS) return fromS;
  } catch (_) {}
  try {
    const a = localStorage.getItem(MANUS_LS);
    if (a) return a;
  } catch (_) {}
  try {
    const b = localStorage.getItem(MANUS_LS_LEGACY);
    if (b) return b;
  } catch (_) {}
  return "";
}

async function goarLoopbackFetch(url, opts) {
  if (typeof toolGuestHttp !== "function") return null;
  if (typeof envReady !== "undefined" && !envReady && !(typeof window !== "undefined" && window.__emulator)) return null;
  const headers = (opts && opts.headers) || {};
  const hdrText = typeof headers === "string"
    ? headers
    : Object.keys(headers).map((k) => k + ": " + headers[k]).join("\n");
  const r = await toolGuestHttp({
    url: url,
    method: (opts && opts.method) || "GET",
    headers: hdrText,
    body: opts && opts.body,
    max_bytes: (opts && opts.maxBytes) || 80000,
  });
  const text = String(r || "");
  const statusM = text.match(/HTTP\/\d(?:\.\d)?\s+(\d{3})/i);
  return {
    ok: /exit 0/.test(text) || !!(statusM && Number(statusM[1]) < 400),
    status: statusM ? Number(statusM[1]) : (/exit 0/.test(text) ? 200 : 0),
    headers: {},
    body: text.slice(0, (opts && opts.maxBytes) || 80000),
    via: "guest-curl",
    url: url,
  };
}

async function goarHostFetch(url, opts) {
  const t0 = performance.now();
  opts = opts || {};
  const method = String(opts.method || "GET").toUpperCase();
  try {
    const host = new URL(url, "https://local").hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
      const g = await goarLoopbackFetch(url, opts);
      if (g) {
        g.ms = Math.round(performance.now() - t0);
        return g;
      }
    }
  } catch (_) {}
  let headers = opts.headers || {};
  if (typeof headers === "string") {
    const h = {};
    headers.split("\n").forEach((line) => {
      const i = line.indexOf(":");
      if (i > 0) h[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    headers = h;
  }
  const maxBytes = Math.min(Number(opts.maxBytes) || 250000, 2_000_000);
  const body = opts.body != null ? String(opts.body) : undefined;

  if (!MW_FABRIC.ready) {
    try { await ensureMwFabric(); } catch (_) {}
  }

  if (MW_FABRIC.engine === "libcurl" && MW_FABRIC.libcurl) {
    try {
      const init = { method, headers };
      if (body != null && method !== "GET" && method !== "HEAD") init.body = body;
      const res = await MW_FABRIC.libcurl.fetch(url, init);
      const text = await res.text();
      const hdrs = {};
      try {
        if (res.headers && typeof res.headers.forEach === "function") {
          res.headers.forEach((v, k) => { hdrs[k] = v; });
        } else if (res.rawHeaders) {
          Object.assign(hdrs, res.rawHeaders);
        }
      } catch (_) {}
      return {
        ok: res.status >= 200 && res.status < 400,
        status: res.status,
        headers: hdrs,
        body: text.slice(0, maxBytes),
        via: "libcurl+wisp",
        ms: Math.round(performance.now() - t0),
        url,
      };
    } catch (e) {
      console.warn("[goar] libcurl fetch fail", e);
      MW_FABRIC.lastError = String(e.message || e);
    }
  }

  if (MW_FABRIC.engine === "epoxy" && MW_FABRIC.epoxy) {
    try {
      const res = await MW_FABRIC.epoxy.fetch(url, { method, headers, body: body });
      const text = await res.text();
      return {
        ok: res.status >= 200 && res.status < 400,
        status: res.status,
        headers: res.headers || {},
        body: text.slice(0, maxBytes),
        via: "epoxy+wisp",
        ms: Math.round(performance.now() - t0),
        url,
      };
    } catch (e) {
      MW_FABRIC.lastError = String(e.message || e);
    }
  }

  try {
    const origin = typeof location !== "undefined" ? location.origin : "";
    if (origin) {
      const proxyUrl =
        origin +
        "/api/cors-proxy?url=" +
        encodeURIComponent(url) +
        (method !== "GET" && method !== "HEAD" ? "&method=" + encodeURIComponent(method) : "") +
        "&apikey=goar_fabric";
      const init = {
        method: method === "HEAD" ? "GET" : method,
        headers: { "x-api-key": "goar_fabric", "x-target-url": url },
      };
      if (body != null && method !== "GET" && method !== "HEAD") {
        init.body = body;
        if (headers["Content-Type"] || headers["content-type"]) {
          init.headers["Content-Type"] = headers["Content-Type"] || headers["content-type"];
        }
      }
      const res = await fetch(proxyUrl, init);
      const text = await res.text();
      return {
        ok: res.status >= 200 && res.status < 400,
        status: res.status,
        headers: { "content-type": res.headers.get("content-type") || "" },
        body: text.slice(0, maxBytes),
        via: "cors-proxy",
        ms: Math.round(performance.now() - t0),
        url,
      };
    }
  } catch (_) {}

  try {
    const init = { method, headers, mode: "cors" };
    if (body != null && method !== "GET" && method !== "HEAD") init.body = body;
    const res = await fetch(url, init);
    const text = await res.text();
    return {
      ok: res.status >= 200 && res.status < 400,
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "" },
      body: text.slice(0, maxBytes),
      via: "browser-cors",
      ms: Math.round(performance.now() - t0),
      url,
    };
  } catch (_) {}

  if (method === "GET" || method === "HEAD") {
    for (const relay of CORS_RELAYS) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        const res = await fetch(relay.wrap(url), { method: "GET", signal: ctrl.signal, credentials: "omit" });
        clearTimeout(t);
        const text = await res.text();
        if (!res.ok && res.status >= 500) continue;
        return {
          ok: true,
          status: res.status || 200,
          headers: { "content-type": res.headers.get("content-type") || "" },
          body: text.slice(0, maxBytes),
          via: "relay:" + relay.id,
          ms: Math.round(performance.now() - t0),
          url,
        };
      } catch (_) {}
    }
  }

  return {
    ok: false,
    status: 0,
    headers: {},
    body: "",
    error: MW_FABRIC.lastError || "all hops failed",
    via: "failed",
    ms: Math.round(performance.now() - t0),
    url,
  };
}

async function goarHostFetchJson(url, method, headersJson, body) {
  let headers = {};
  try {
    headers = headersJson ? JSON.parse(headersJson) : {};
  } catch (_) {}
  const r = await goarHostFetch(url, { method: method || "GET", headers, body: body || undefined });
  return JSON.stringify(r);
}

try {
  window.MW_FABRIC = MW_FABRIC;
  window.ensureMwFabric = ensureMwFabric;
  window.goarHostFetch = goarHostFetch;
  window.goarHostFetchJson = goarHostFetchJson;
  window.mwFabricStatus = mwFabricStatus;
  window.resolveWispUrl = resolveWispUrl;
  window.probeMwFabric = probeMwFabric;
  window.probeWisp = probeWisp;
  window.readManusKey = readManusKey;
  window.persistManusKey = persistManusKey;
} catch (_) {}

try { window.goarLoopbackFetch = goarLoopbackFetch; } catch (_) {}
