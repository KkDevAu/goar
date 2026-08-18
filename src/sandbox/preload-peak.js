/**
 * Peak preload — every library, Wasm, and binary is live before chat unlocks.
 */
(function (global) {
  "use strict";

  const CRYPTO_JS = [
    "md5.js", "sha1.js", "sha256.js", "sha512.js", "sha3.js",
    "ripemd160.js", "hmac-sha256.js", "aes.js", "pbkdf2.js",
  ];

  function asset(rel) {
    try {
      if (typeof goarAssetUrl === "function") return goarAssetUrl(rel);
    } catch (_) {}
    return "./" + String(rel).replace(/^\.\//, "");
  }

  async function cacheUrls(urls) {
    if (!global.caches) return 0;
    let n = 0;
    try {
      const cache = await caches.open("goar-peak-v1");
      await Promise.all(
        urls.map(async (u) => {
          if (!u) return;
          try {
            const hit = await cache.match(u);
            if (hit) { n++; return; }
            const res = await fetch(u);
            if (res && res.ok) {
              await cache.put(u, res.clone());
              n++;
            }
          } catch (_) {}
        })
      );
    } catch (_) {}
    return n;
  }

  async function warmCryptoJs() {
    if (typeof loadScriptOnce !== "function") return 0;
    let n = 0;
    for (const f of CRYPTO_JS) {
      try {
        await loadScriptOnce(asset("assets/crypto-js/" + f));
        n++;
      } catch (_) {}
    }
    return n;
  }

  async function warmPythonPeak() {
    const py = global.__pyodide;
    if (!py || typeof py.runPythonAsync !== "function") return { ok: false };
    try {
      if (typeof py.loadPackage === "function") {
        await py.loadPackage(["micropip", "packaging", "six"]);
      }
    } catch (_) {}
    try {
      if (typeof installGoarJitPy === "function") await installGoarJitPy();
    } catch (_) {}
    const raw = await py.runPythonAsync(`
import importlib, json, pkgutil, sys
sys.path.insert(0, "/home/pyodide")
out = {"modules": 0, "failed": [], "tools": 0, "jit": None, "version": None}
try:
    import pyodide_security as ps
    out["version"] = getattr(ps, "VERSION", None) or getattr(ps, "__version__", None)
    for info in pkgutil.walk_packages(ps.__path__, ps.__name__ + "."):
        try:
            importlib.import_module(info.name)
            out["modules"] += 1
        except Exception as e:
            out["failed"].append(info.name)
    try:
        from pyodide_security import policy
        policy.configure(max_requests=400, allow_active_scanning=True, reset_budget=True)
    except Exception:
        pass
    try:
        out["tools"] = len(ps.list_tools())
    except Exception:
        pass
except Exception as e:
    out["failed"].append("pyodide_security:" + str(e)[:120])
try:
    import goar_jit
    out["jit"] = goar_jit.status()
except Exception as e:
    out["failed"].append("goar_jit:" + str(e)[:80])
json.dumps(out)
`);
    let info = {};
    try { info = JSON.parse(String(raw || "{}")); } catch (_) { info = { raw: raw }; }
    global.__GOAR_PYSEC_PRELOADED = true;
    global.__GOAR_PYSEC_PRELOAD = info;
    return info;
  }

  async function warmBox() {
    if (typeof ensureWasiBox !== "function") return false;
    const ok = await ensureWasiBox();
    if (!ok || typeof wasiBusybox !== "function") return !!ok;
    try {
      const r = await wasiBusybox(["busybox", "--list"], "", "/workspace");
      global.__GOAR_BOX_LIST = r && r.stdout;
    } catch (_) {}
    return true;
  }

  async function preloadGoarPeak() {
    if (global.__GOAR_PEAK) return global.__GOAR_PEAK_STATE;
    const state = {
      cache: 0,
      crypto: 0,
      fabric: false,
      epoxy: false,
      box: false,
      gecko: false,
      pysec: null,
      jit: !!global.__GOAR_JIT,
    };
    try { if (typeof setProgress === "function") setProgress(86, "Peak preload", "libraries"); } catch (_) {}

    const heavy = [
      asset("assets/unix/goar-box.wasm"),
      asset("assets/unix/wasi/index.js"),
      asset("assets/jit/goar-jit.wasm"),
      asset("assets/net/libcurl.wasm"),
      asset("assets/net/libcurl.mjs"),
      asset("assets/net/epoxy/epoxy-bundled.js"),
      asset("assets/net/wisp/wisp.mjs"),
      asset("assets/gecko/gecko.js"),
      asset("assets/gecko/gecko.wasm.zst"),
    ];
    try { if (typeof HEAVY !== "undefined") {
      if (HEAVY.gecko) heavy.push(HEAVY.gecko);
      if (HEAVY.geckoJs) heavy.push(HEAVY.geckoJs);
      if (HEAVY.libcurl) heavy.push(HEAVY.libcurl);
      if (HEAVY.epoxy) heavy.push(HEAVY.epoxy);
    } } catch (_) {}

    const jobs = [
      cacheUrls(heavy).then((n) => { state.cache = n; }),
      warmCryptoJs().then((n) => { state.crypto = n; }),
    ];

    if (typeof ensureJit === "function") {
      try { ensureJit(); state.jit = true; } catch (_) {}
    }
    if (typeof ensureMwFabric === "function") {
      jobs.push(
        ensureMwFabric()
          .then((s) => { state.fabric = !!(s && s.ready); })
          .catch(() => {})
      );
    }
    if (typeof ensureEpoxy === "function" || typeof ensureGoarEpoxy === "function") {
      const epoxyFn = typeof ensureEpoxy === "function" ? ensureEpoxy : ensureGoarEpoxy;
      jobs.push(
        epoxyFn()
          .then((c) => { state.epoxy = !!c; })
          .catch(() => {})
      );
    }
    jobs.push(warmBox().then((ok) => { state.box = !!ok; }));
    if (typeof ensureGecko === "function") {
      jobs.push(
        ensureGecko({
          mode: "embed",
          show: false,
          url: global.GOAR_GECKO_HOME || "https://duckduckgo.com/",
        })
          .then((st) => { state.gecko = !!(st && st.ready) || !!global.__GOAR_GECKO_READY; })
          .catch(() => {})
      );
    }
    jobs.push(
      warmPythonPeak()
        .then((info) => { state.pysec = info; })
        .catch((e) => { state.pysec = { ok: false, error: String(e && e.message ? e.message : e) }; })
    );

    await Promise.all(jobs);
    global.__GOAR_PEAK = true;
    global.__GOAR_PEAK_STATE = state;
    console.log("[goar] peak preload", state);
    return state;
  }

  global.preloadGoarPeak = preloadGoarPeak;
  global.warmPythonPeak = warmPythonPeak;
})(typeof window !== "undefined" ? window : globalThis);
