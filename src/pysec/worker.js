/**
 * Wire Manus CORS proxy for all pysec live tools (httpx, fetch, nuclei, …).
 * Order:
 *  1) Saved manusKey / manus_api_key in settings
 *  2) POST same-origin /api/manus-key (proxy.generate path) then configure
 *  3) Fall back to same-origin /api/cors-proxy (Manus-shaped, no external key)
 * Re-tests with proxy.test(example.com). Never leaves live tools on bare pyfetch CORS.
 */

/**
 * Route pysec _http through MW fabric (libcurl+Wisp) when available.
 * Monkey-patches pyodide_security._http.http_request to call window.goarHostFetchJson.
 */

/**
 * Route pysec _http through MW fabric (libcurl+Wisp).
 * Rebinds http_request on _http AND every already-imported consumer module.
 */
async function wirePysecThroughFabric() {
  if (!__pyodide) return { ok: false, error: "no pyodide" };
  if (window.__GOAR_PYSEC_FABRIC_WIRED) {
    // re-apply in case pyodide reloaded
  }
  try {
    if (typeof ensureMwFabric === "function") await ensureMwFabric();
  } catch (_) {}
  try {
    await __pyodide.runPythonAsync(`
import json, sys, types

async def _goar_fabric_http_request(url, method="GET", headers=None, body=None, timeout_ms=30000, use_proxy=None):
    import time
    t0 = time.perf_counter()
    headers = headers or {}
    from js import goarHostFetchJson
    raw = await goarHostFetchJson(
        str(url),
        str(method or "GET"),
        json.dumps({str(k): str(v) for k, v in (headers or {}).items()}),
        None if body is None else (body if isinstance(body, str) else body.decode("utf-8", "replace")),
    )
    data = json.loads(raw)
    ms = round((time.perf_counter() - t0) * 1000, 2)
    return {
        "ok": bool(data.get("ok")),
        "status": int(data.get("status") or 0),
        "headers": data.get("headers") or {},
        "body": data.get("body") or "",
        "url": url,
        "final_url": data.get("url") or url,
        "error": data.get("error"),
        "elapsed_ms": data.get("ms") or ms,
        "via_proxy": True,
        "via": data.get("via"),
        "engine": "goar-mw-fabric",
    }

import pyodide_security._http as _h
_orig = getattr(_h, "http_request", None)

async def http_request(url, method="GET", headers=None, body=None, timeout_ms=30000, use_proxy=None):
    try:
        return await _goar_fabric_http_request(url, method, headers, body, timeout_ms, use_proxy)
    except Exception as e1:
        if _orig is not None:
            try:
                return await _orig(url, method=method, headers=headers, body=body, timeout_ms=timeout_ms, use_proxy=use_proxy)
            except Exception as e2:
                return {"ok": False, "status": 0, "error": f"fabric:{e1}; orig:{e2}", "url": url, "headers": {}, "body": ""}
        return {"ok": False, "status": 0, "error": str(e1), "url": url, "headers": {}, "body": ""}

_h.http_request = http_request

# Rebind imported names in every loaded pyodide_security submodule
n = 0
for name, mod in list(sys.modules.items()):
    if not name or not name.startswith("pyodide_security"):
        continue
    if not isinstance(mod, types.ModuleType):
        continue
    if getattr(mod, "http_request", None) is not None:
        try:
            mod.http_request = http_request
            n += 1
        except Exception:
            pass

print("fabric rebound modules", n)
`)
    window.__GOAR_PYSEC_FABRIC_WIRED = true;
    console.log("[goar] pysec HTTP → MW fabric (rebound)");
    return { ok: true };
  } catch (e) {
    console.warn("[goar] wirePysecThroughFabric", e);
    return { ok: false, error: String(e.message || e) };
  }
}

async function ensurePysecNetwork() {
  if (!__pyodide) return { ok: false, error: "pyodide not ready" };
  const origin = (typeof location !== "undefined" && location.origin) ? location.origin : "";
  let key = "";
  let source = "";
  try {
    if (typeof readManusKey === "function") key = readManusKey() || "";
  } catch (_) {}
  if (!key) {
    try {
      const s = typeof loadSettings === "function" ? loadSettings() : {};
      key = String((s && (s.manusKey || s.manus_api_key)) || "").trim();
      if (key) source = "settings";
    } catch (_) {}
  } else {
    source = "storage";
  }

  // Mint via /api/manus-key (what proxy.generate expects) when no saved key
  let mintMeta = null;
  if (!key && origin) {
    try {
      const r = await fetch(origin + "/api/manus-key", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: "{}",
      });
      if (r.ok) {
        mintMeta = await r.json();
        if (mintMeta && mintMeta.key) {
          key = String(mintMeta.key).trim();
          source = mintMeta.source || "manus-key";
          try {
            if (typeof persistManusKey === "function") persistManusKey(key);
            else {
              localStorage.setItem("pyodide_security_manus_api_key", key);
              localStorage.setItem("goar_manus_key", key);
            }
          } catch (_) {}
        }
      } else {
        console.warn("[goar] /api/manus-key HTTP", r.status);
      }
    } catch (e) {
      console.warn("[goar] /api/manus-key", e);
    }
  }

  // Also try Python proxy.generate (same endpoint) if still no key
  if (!key && origin) {
    try {
      __pyodide.globals.set("_goar_origin", origin);
      const raw = await __pyodide.runPythonAsync(`
import json
from pyodide_security import proxy_tool
r = await proxy_tool.generate(origin=_goar_origin, auto_configure=False)
json.dumps(r)
`);
      const j = JSON.parse(raw);
      if (j && j.ok && j.key) {
        key = String(j.key).trim();
        source = "proxy.generate";
        mintMeta = j;
        try {
          if (typeof persistManusKey === "function") persistManusKey(key);
        } catch (_) {}
      }
    } catch (e) {
      console.warn("[goar] proxy.generate", e);
    }
  }

  // Decide base_url: minted Manus key → cors.manus.space; local goar_ → same-origin
  let baseUrl = (typeof window !== "undefined" && window.GOAR_CORS_PROXY) || "https://cors.manus.space/api/proxy";
  if (!key) {
    try {
      if (typeof mintManusKey === "function") {
        key = await mintManusKey();
        if (key) source = "manus-mint";
      }
    } catch (_) {}
  }
  const isLocalKey = !!(key && key.startsWith("goar_"));
  if (isLocalKey && origin) {
    baseUrl = origin + "/api/cors-proxy";
  } else if (!key && origin) {
    key = "goar_open";
    baseUrl = origin + "/api/cors-proxy";
    source = "local-open";
  }

  if (!key) {
    console.warn("[goar] no Manus/local proxy key — live pysec HTTP will hit browser CORS");
    return { ok: false, error: "no proxy key" };
  }

  __pyodide.globals.set("_k", key);
  __pyodide.globals.set("_base", baseUrl);
  const probe = await __pyodide.runPythonAsync(`
from pyodide_security import proxy_tool
import json
st = proxy_tool.configure(api_key=_k, enabled=True, base_url=_base, auth_mode="both")
r = await proxy_tool.test(target="https://example.com/")
# If Manus key fails auth, leave configured state but report
json.dumps({"status": st, "test": r})
`);
  let result;
  try { result = JSON.parse(probe); } catch (_) { result = { raw: probe }; }

  // If Manus base failed, fall back to local cors-proxy
  const testOk = !!(result && result.test && result.test.ok);
  if (!testOk && origin && !isLocalKey) {
    console.warn("[goar] Manus proxy test failed — falling back to /api/cors-proxy", result && result.test);
    __pyodide.globals.set("_k", key.startsWith("goar_") ? key : "goar_fallback");
    __pyodide.globals.set("_base", origin + "/api/cors-proxy");
    const probe2 = await __pyodide.runPythonAsync(`
from pyodide_security import proxy_tool
import json
st = proxy_tool.configure(api_key=_k, enabled=True, base_url=_base, auth_mode="both")
r = await proxy_tool.test(target="https://example.com/")
json.dumps({"status": st, "test": r})
`);
    try { result = JSON.parse(probe2); } catch (_) { result = { raw: probe2 }; }
    source = "local-fallback";
  }

  const ok = !!(result && result.test && result.test.ok);
  window.__GOAR_PROXY = {
    ok,
    source,
    baseUrl: (result && result.status && result.status.base_url) || baseUrl,
    masked: result && result.status && result.status.api_key_masked,
    test: result && result.test,
  };
  if (ok) console.log("[goar] pysec CORS proxy ok via", source, window.__GOAR_PROXY.baseUrl);
  else console.warn("[goar] pysec CORS proxy NOT ready", window.__GOAR_PROXY);
  return window.__GOAR_PROXY;
}

async function ensurePysecWorker() {
  // name kept for slash/API compatibility — now embedded single-file Pyodide (no external assets)
  if (__pysecInitPromise) return __pysecInitPromise;
  __pysecInitPromise = (async () => {
    try { syncIndicators({ kit: "loading" }); } catch (_) {}
    await loadPysecCatalog();
    const files = await inflatePysecPackage();
    // load Pyodide (CDN runtime only — toolkit is fully embedded)
    // Prefer packaged WASM under ./assets/pyodide (offline), fall back to CDN
    let indexURL = (typeof HEAVY !== "undefined" && HEAVY.pyodide)
      ? HEAVY.pyodide
      : (typeof PYSEC_PYODIDE_LOCAL !== "undefined" ? PYSEC_PYODIDE_LOCAL : "https://cdn.jsdelivr.net/pyodide/v0.27.0/full/");
    const base = (typeof document !== "undefined" && document.baseURI) || location.href;
    indexURL = new URL(indexURL, base).href;
    if (!indexURL.endsWith("/")) indexURL += "/";
    const mod = await import(indexURL + "pyodide.mjs");
    __pyodide = await mod.loadPyodide({ indexURL });
    // Polyfill hashlib.pbkdf2_hmac when missing (needed by cipher tools)
    await __pyodide.runPythonAsync(`
import hashlib, hmac
if not hasattr(hashlib, "pbkdf2_hmac"):
    def _pbkdf2_hmac(hash_name, password, salt, iterations, dklen=None):
        if not isinstance(password, (bytes, bytearray)):
            raise TypeError("password must be bytes")
        if not isinstance(salt, (bytes, bytearray)):
            raise TypeError("salt must be bytes")
        hn = str(hash_name).lower().replace("sha-", "sha")
        def prf(p, m):
            return hmac.new(p, m, hn).digest()
        hlen = len(prf(password, salt))
        if dklen is None:
            dklen = hlen
        out = bytearray()
        block = 1
        while len(out) < dklen:
            u = prf(password, salt + block.to_bytes(4, "big"))
            f = bytearray(u)
            for _ in range(1, int(iterations)):
                u = prf(password, u)
                for i in range(len(f)):
                    f[i] ^= u[i]
            out.extend(f)
            block += 1
        return bytes(out[:dklen])
    hashlib.pbkdf2_hmac = _pbkdf2_hmac
`);

    const root = "/home/pyodide";
    __pyodide.FS.mkdirTree(root);
    for (const [path, data] of Object.entries(files)) {
      const full = root + "/" + path;
      const dir = full.slice(0, full.lastIndexOf("/"));
      __pyodide.FS.mkdirTree(dir);
      __pyodide.FS.writeFile(full, data);
    }
    await __pyodide.runPythonAsync(`
import sys
sys.path.insert(0, "/home/pyodide")
import pyodide_security as ps
print("pysec", ps.VERSION, "tools", len(ps.list_tools()))
`);
    __pysecReady = true;
    try { window.__pysecReady = true; } catch (_) {}
    try { syncIndicators({ kit: "ready" }); } catch (_) {}
    try { await wirePysecThroughFabric(); } catch (_) {}
    try { await hardenLivePysecTools(); } catch (e) { console.warn("[goar] harden live tools", e); }
    try {
      await ensurePysecNetwork();
    } catch (e) {
      console.warn("[goar] pysec network wire", e);
    }
    console.log("[goar] pysec ready (embedded package)");
    try { syncIndicators({ kit: "ready" }); } catch (_) {}
    return true;
  })();
  return __pysecInitPromise;
}

async function hardenLivePysecTools() {
  if (!__pyodide) return { ok: false };
  await __pyodide.runPythonAsync(`
import asyncio, inspect
from pyodide_security import _BY_ID

def _wrap_timeout(tid, seconds, port_cap=None):
    meta = _BY_ID.get(tid) or {}
    fn = meta.get("fn")
    if fn is None or getattr(fn, "_goar_capped", False):
        return
    async def _capped(*a, **kw):
        if port_cap:
            raw = kw.get("ports")
            if raw:
                parts = [p.strip() for p in str(raw).split(",") if p.strip()]
                kw["ports"] = ",".join(parts[:port_cap])
            else:
                kw["ports"] = "80,443"
            if "top" in kw:
                try:
                    kw["top"] = min(int(kw["top"] or 0), port_cap)
                except Exception:
                    kw["top"] = 0
        if inspect.iscoroutinefunction(fn):
            return await asyncio.wait_for(fn(*a, **kw), timeout=seconds)
        return fn(*a, **kw)
    _capped._goar_capped = True
    meta["fn"] = _capped
    _BY_ID[tid] = meta

_wrap_timeout("nmap.http_probe", 14, port_cap=3)
_wrap_timeout("nmap.nse_http", 16, port_cap=None)
`);
  return { ok: true };
}
async function toolPysec(args) {
  let toolId = String((args && (args.tool_id || args.toolId || args.id)) || "").trim();
  if (toolId === "list_tools" || toolId === "list" || toolId === "catalog") {
    try {
      await ensurePysecWorker();
      const out = await __pyodide.runPythonAsync(`
import json
from pyodide_security import _BY_ID
ids = sorted(_BY_ID.keys())
json.dumps({"ok": True, "count": len(ids), "tools": ids[:200]})
`);
      return typeof out === "string" ? out : JSON.stringify(out);
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e.message || e) });
    }
  }
  if (!toolId) return "error: tool_id required";
  let kwargs = args.kwargs != null ? args.kwargs : args.arguments;
  if (typeof kwargs === "string") {
    try { kwargs = JSON.parse(kwargs); } catch (_) { kwargs = {}; }
  }
  if (!kwargs || typeof kwargs !== "object" || Array.isArray(kwargs)) {
    kwargs = Object.assign({}, args || {});
    delete kwargs.tool_id; delete kwargs.toolId; delete kwargs.id;
    delete kwargs.kwargs; delete kwargs.arguments;
  }
  try {
    await ensurePysecWorker();
    const payload = JSON.stringify({ tool_id: toolId, kwargs: kwargs || {} });
    __pyodide.globals.set("_goar_payload", payload);
    const out = await __pyodide.runPythonAsync(`
import json, inspect
from pyodide_security import run_tool, run_tool_async, _BY_ID
req = json.loads(_goar_payload)
tid = req["tool_id"]
kw = dict(req.get("kwargs") or {})
meta = _BY_ID.get(tid) or {}
fn = meta.get("fn")
# Drop unknown kwargs so shared agent payloads do not TypeError
try:
    if fn is not None:
        sig = inspect.signature(fn)
        if any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()):
            pass
        else:
            allowed = set(sig.parameters.keys())
            kw = {k: v for k, v in kw.items() if k in allowed}
except Exception:
    pass
if meta.get("async") or (fn is not None and inspect.iscoroutinefunction(fn)):
    _res = await run_tool_async(tid, **kw)
else:
    _res = run_tool(tid, **kw)
json.dumps(_res, default=str)
`);
    const raw = typeof out === "string" ? out : JSON.stringify(out);
    // Structured for the agent loop (kit is first-class tool surface)
    try {
      const j = JSON.parse(raw);
      return JSON.stringify({
        agent_toolkit: "pysec",
        tool_id: toolId,
        ok: j.ok !== false && !j.error,
        result: j.result !== undefined ? j.result : j,
        error: j.error || null,
        ms: j.ms,
      }, null, 2);
    } catch (_) {
      return raw;
    }
  } catch (e) {
    return JSON.stringify({
      agent_toolkit: "pysec",
      tool_id: toolId,
      ok: false,
      error: String(e && e.message ? e.message : e),
    });
  }
}

async function toolGuestHttp(args) {
  if (typeof envReady !== "undefined" && !envReady) return "error: Alpine env not ready";
  const url = String((args && args.url) || "").trim();
  if (!url) return "error: url required";
  const method = String((args && args.method) || "GET").toUpperCase();
  const maxB = Math.min(Number(args && args.max_bytes) || 8000, 50000);
  const body = (args && args.body) || "";
  const hdrLines = String((args && args.headers) || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const hdrFlags = hdrLines.map((h) => "-H '" + h.replace(/'/g, "'\\''") + "'").join(" ");
  const uq = url.replace(/'/g, "'\\''");
  let cmd;
  if (method === "GET" || method === "HEAD") {
    cmd = "curl -sS -L -m 25 -X " + method + " " + hdrFlags +
      " -D /tmp/.gh_hdr -o /tmp/.gh_body --max-filesize " + maxB + " '" + uq +
      "'; echo EXIT:$?; echo '---HEADERS---'; head -c 2000 /tmp/.gh_hdr; echo; echo '---BODY---'; head -c " + maxB + " /tmp/.gh_body";
  } else {
    const b64 = btoa(unescape(encodeURIComponent(body)));
    await guestExec("echo '" + b64 + "' | base64 -d > /tmp/.gh_post", 15000);
    cmd = "curl -sS -L -m 25 -X " + method + " " + hdrFlags +
      " -D /tmp/.gh_hdr -o /tmp/.gh_body --max-filesize " + maxB +
      " --data-binary @/tmp/.gh_post '" + uq +
      "'; echo EXIT:$?; echo '---HEADERS---'; head -c 2000 /tmp/.gh_hdr; echo; echo '---BODY---'; head -c " + maxB + " /tmp/.gh_body";
  }
  const r = await guestExec(cmd, 60000);
  return "exit " + r.code + "\n" + String(r.output || "").slice(0, 12000);
}

try {
  try {
    Object.defineProperty(window, "__pysecReady", {
      get() { return !!__pysecReady; },
      set(v) { __pysecReady = !!v; },
      configurable: true,
    });
  } catch (_) {
    window.__pysecReady = false;
  }
  window.ensurePysecWorker = ensurePysecWorker;
  window.wirePysecThroughFabric = wirePysecThroughFabric;
  window.hardenLivePysecTools = hardenLivePysecTools;
  window.toolPysec = toolPysec;
  window.loadPysecCatalog = loadPysecCatalog;
  window.pysecCatalogBlurb = pysecCatalogBlurb;
  window.pysecCatalogTools = pysecCatalogTools;
  window.pysecCatalogBody = pysecCatalogBody;
  try { pysecCatalogBody(); } catch (_) {}
  window.inflatePysecPackage = inflatePysecPackage;
  window.PYSEC_TOOL_COUNT = typeof PYSEC_TOOL_COUNT !== "undefined" ? PYSEC_TOOL_COUNT : 141;
} catch (_) {}



