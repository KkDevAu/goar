/**
 * GOAR F · Gecko browser plane (additive)
 *
 * Modes (both independent of Alpine v86 / freeze / pysec):
 *   embed  — gecko.js library paints into a canvas pane (lightweight agent control)
 *   chrome — full Firefox UI via chrome-demo SPA (iframe → assets/gecko/chrome/)
 *
 * Host targets (first match wins):
 *   #browser-frame-wrap  — design HTML browser panel (always-on product UI)
 *   #geckoHost           — explicit mount point
 *   #geckoPane (created) — floating fallback if no design host
 *
 * window API:
 *   ensureGecko({ mode?, url?, show?, force? })
 *   geckoLoad(url)
 *   geckoStatus()
 *   geckoHide() / geckoShow()
 *   geckoReset()
 *   browserPlaneStatus()
 */
(function (global) {
  "use strict";

  const STATE = {
    mode: null,
    gecko: null,
    ready: false,
    loading: null,
    lastError: "",
    lastUrl: "",
    canvas: null,
    pane: null,
    iframe: null,
    host: null,
    wasmUrl: "",
    chromeUrl: "",
  };

  function assetBase() {
    if (typeof GOAR_REMOTE === "string" && GOAR_REMOTE) return GOAR_REMOTE;
    if (typeof goarAssetUrl === "function") {
      const u = goarAssetUrl("assets/gecko/");
      return u.replace(/assets\/gecko\/?$/, "");
    }
    try {
      if (typeof location !== "undefined") {
        const path = location.pathname.replace(/\/[^/]*$/, "/");
        return (location.origin || "") + path;
      }
    } catch (_) {}
    return "./";
  }

  function geckoWasmUrl() {
    if (global.GOAR_GECKO_WASM_URL) return String(global.GOAR_GECKO_WASM_URL);
    return assetBase() + "assets/gecko/gecko.wasm.zst";
  }

  function geckoBundleUrl() {
    if (global.GOAR_GECKO_JS_URL) return String(global.GOAR_GECKO_JS_URL);
    // Package-local first, vendor path as legacy fallback
    return assetBase() + "assets/gecko/gecko.js";
  }

  function chromeDemoUrl(wisp) {
    if (global.GOAR_GECKO_CHROME_URL) return String(global.GOAR_GECKO_CHROME_URL);
    let u = assetBase() + "assets/gecko/chrome/index.html";
    if (wisp) u += "?wisp=" + encodeURIComponent(wisp);
    return u;
  }

  function cleanWisp(u) {
    u = String(u || "").trim();
    if (u.startsWith("wisps://")) u = "wss://" + u.slice(8);
    if (u.startsWith("wisp://")) u = "ws://" + u.slice(7);
    if (!/^wss?:\/\//i.test(u) || /\s/.test(u)) return "";
    try {
      const p = new URL(u);
      if (!p.hostname) return "";
    } catch (_) { return ""; }
    return u;
  }
  function resolveGeckoWisp() {
    const fallback = "wss://wisp.mercurywork.shop/";
    try {
      if (typeof resolveWispUrl === "function") {
        const u = cleanWisp(resolveWispUrl());
        if (u) return u;
      }
    } catch (_) {}
    try {
      if (typeof mwFabricStatus === "function") {
        const f = mwFabricStatus();
        if (f && f.wispUrl) {
          const u = cleanWisp(f.wispUrl);
          if (u) return u;
        }
      }
    } catch (_) {}
    const forced = cleanWisp(global.GOAR_WISP_URL);
    if (forced) return forced;
    return fallback;
  }

  function coiOk() {
    try {
      return typeof SharedArrayBuffer !== "undefined" && !!global.crossOriginIsolated;
    } catch (_) {
      return false;
    }
  }

  function designHost() {
    return (
      document.getElementById("browser-frame-wrap") ||
      document.getElementById("geckoHost") ||
      null
    );
  }

  function ensurePane(show, mode) {
    const host = designHost();
    STATE.host = host;

    try {
      const legacy = document.getElementById("browser-frame");
      if (legacy && host) legacy.style.display = "none";
      const hint = document.getElementById("browser-hint");
      if (hint && show !== false) hint.classList.add("hide");
    } catch (_) {}

    let pane = document.getElementById("geckoPane");

    if (host) {
      if (!pane) {
        pane = document.createElement("div");
        pane.id = "geckoPane";
        pane.setAttribute("aria-label", "Gecko browser plane");
        pane.innerHTML =
          '<div id="geckoBody" style="position:absolute;inset:0;width:100%;height:100%;background:#111"></div>';
      }
      pane.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;z-index:2;" +
        "display:" +
        (show === false ? "none" : "flex") +
        ";flex-direction:column;overflow:hidden;background:#0a0a0a;";
      if (host !== pane.parentElement) {
        try {
          const cs = getComputedStyle(host);
          if (cs.position === "static") host.style.position = "relative";
        } catch (_) {
          host.style.position = "relative";
        }
        host.appendChild(pane);
      }
      try {
        const app = document.getElementById("app");
        if (app && show !== false) app.classList.add("panel-open");
        const view = document.getElementById("view-browser");
        if (view && show !== false) {
          document.querySelectorAll(".panel-view").forEach((v) => v.classList.remove("on"));
          view.classList.add("on");
          document.querySelectorAll(".panel-tab").forEach((t) => {
            t.classList.toggle("on", t.dataset.panel === "browser");
          });
          document.getElementById("btn-browser")?.classList.add("on");
        }
      } catch (_) {}
    } else {
      if (!pane) {
        pane = document.createElement("div");
        pane.id = "geckoPane";
        pane.setAttribute("aria-label", "Gecko browser plane");
        pane.innerHTML =
          '<div style="flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid #1a1a1a;font:11px ui-monospace,Menlo,monospace;color:#888">' +
          '<span style="color:#ccc" id="geckoPaneTitle">Gecko</span>' +
          '<span id="geckoPaneMode" style="color:#555;border:1px solid #222;border-radius:4px;padding:0 6px">—</span>' +
          '<span id="geckoPaneUrl" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555"></span>' +
          '<button type="button" id="geckoPaneExpand" title="Larger" style="background:#111;border:1px solid #2a2a2a;color:#aaa;font:inherit;padding:2px 8px;cursor:pointer;border-radius:4px">⛶</button>' +
          '<button type="button" id="geckoPaneHide" style="background:#111;border:1px solid #2a2a2a;color:#aaa;font:inherit;padding:2px 8px;cursor:pointer;border-radius:4px">hide</button>' +
          "</div>" +
          '<div id="geckoBody" style="flex:1;min-height:0;position:relative;background:#111"></div>';
        document.body.appendChild(pane);
        pane.querySelector("#geckoPaneHide").onclick = () => geckoHide();
        pane.querySelector("#geckoPaneExpand").onclick = () => {
          const big = pane.dataset.big === "1";
          if (big) {
            pane.style.inset = "auto 8px 72px auto";
            pane.style.width = "min(480px,94vw)";
            pane.style.height = "min(560px,72vh)";
            pane.dataset.big = "0";
          } else {
            pane.style.inset = "8px";
            pane.style.width = "auto";
            pane.style.height = "auto";
            pane.dataset.big = "1";
          }
        };
      }
      pane.style.cssText =
        "position:fixed;inset:auto 8px 72px auto;width:min(480px,94vw);height:min(560px,72vh);" +
        "z-index:40;background:#0a0a0a;border:1px solid #222;border-radius:10px;" +
        "display:" +
        (show === false ? "none" : "flex") +
        ";flex-direction:column;overflow:hidden;box-shadow:0 12px 40px #000a;";
    }

    STATE.pane = pane;
    let body = pane.querySelector("#geckoBody");
    if (!body) {
      body = document.createElement("div");
      body.id = "geckoBody";
      body.style.cssText =
        "flex:1;min-height:0;position:relative;background:#111;width:100%;height:100%";
      pane.appendChild(body);
    }
    const modeEl = pane.querySelector("#geckoPaneMode");
    if (modeEl) modeEl.textContent = mode || STATE.mode || "—";
    if (show !== false) pane.style.display = "flex";
    return { pane, body, host };
  }

  function geckoHide() {
    if (STATE.pane) STATE.pane.style.display = "none";
  }
  function geckoShow() {
    ensurePane(true, STATE.mode);
    fitGecko().then(function () {
      try { STATE.canvas && STATE.canvas.focus(); } catch (_) {}
    }).catch(function () {});
  }

  function geckoReset() {
    try {
      if (STATE.iframe) STATE.iframe.remove();
    } catch (_) {}
    try {
      if (STATE.pane) STATE.pane.remove();
    } catch (_) {}
    STATE.gecko = null;
    STATE.iframe = null;
    STATE.pane = null;
    STATE.canvas = null;
    STATE.ready = false;
    STATE.mode = null;
    STATE.loading = null;
    STATE.lastError = "";
    global.__GOAR_GECKO = null;
    global.__GOAR_GECKO_READY = false;
    global.__GOAR_GECKO_MODE = null;
  }

  async function loadGeckoModule() {
    const url = geckoBundleUrl();
    const mod = await import(/* webpackIgnore: true */ url);
    return mod.Gecko || mod.default || mod;
  }

  function webgl2Ok() {
    try {
      const c = document.createElement("canvas");
      return !!c.getContext("webgl2", { antialias: false, preserveDrawingBuffer: false });
    } catch (_) {
      return false;
    }
  }

  function useGeckoGpu() {
    if (global.GOAR_GECKO_GPU === false || global.GOAR_GECKO_GPU === "0") return false;
    return webgl2Ok();
  }

  function measureHost() {
    const el = document.getElementById("geckoBody") || designHost();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 80) return null;
    return { w: Math.max(640, Math.floor(r.width)), h: Math.max(400, Math.floor(r.height)) };
  }

  function boxCanvas(canvas, w, h) {
    canvas.width = w;
    canvas.height = h;
    canvas.style.cssText =
      "position:absolute;left:0;top:0;width:" + w + "px;height:" + h + "px;" +
      "display:block;background:#fff;touch-action:none;cursor:default;outline:none;";
    canvas.tabIndex = 0;
  }

  async function fitGecko() {
    const sz = measureHost();
    if (!sz || !STATE.canvas) return sz;
    const gpu = !!(STATE.gecko && STATE.gecko.gpu);
    if (!gpu) boxCanvas(STATE.canvas, sz.w, sz.h);
    if (STATE.gecko && typeof STATE.gecko.resize === "function") {
      if (STATE.gecko.W !== sz.w || STATE.gecko.H !== sz.h) {
        await STATE.gecko.resize(sz.w, sz.h);
      }
    }
    return sz;
  }

  function watchGeckoSize() {
    if (STATE.ro) return;
    const el = document.getElementById("geckoBody") || designHost();
    if (!el || typeof ResizeObserver === "undefined") return;
    let t = 0;
    STATE.ro = new ResizeObserver(function () {
      clearTimeout(t);
      t = setTimeout(function () { fitGecko().catch(function () {}); }, 60);
    });
    STATE.ro.observe(el);
  }

  async function bootEmbed(opts) {
    const { body } = ensurePane(opts.show !== false, "embed");
    if (STATE.iframe) {
      try {
        STATE.iframe.remove();
      } catch (_) {}
      STATE.iframe = null;
    }
    const gpu = useGeckoGpu();
    let canvas = body.querySelector("#screen") || body.querySelector("#geckoCanvas");
    if (!canvas) {
      body.innerHTML = "";
      canvas = document.createElement("canvas");
      body.appendChild(canvas);
    }
    canvas.id = gpu ? "screen" : "geckoCanvas";
    STATE.canvas = canvas;
    STATE.gpu = gpu;

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const sz = measureHost() || { w: 1100, h: 720 };
    boxCanvas(canvas, sz.w, sz.h);
    const w = sz.w;
    const h = sz.h;

    const Gecko = await loadGeckoModule();
    const wispUrl = resolveGeckoWisp();
    const wasmUrl = geckoWasmUrl();
    STATE.wasmUrl = wasmUrl;

    const env = { GECKO_COARSE_CLOCK: "1" };
    if (gpu) {
      env.GECKO_GPU = "1";
      env.GECKO_GL_PASSTHROUGH = "1";
    }
    if (global.GOAR_GECKO_NOWASMJIT) env.GECKO_NOWASMJIT = "1";

    const gecko = new Gecko({
      canvas,
      width: w,
      height: h,
      wispUrl: wispUrl || undefined,
      wasm: { url: wasmUrl, compressed: /\.zst$/i.test(wasmUrl) },
      env,
      forwardInput: true,
      print: (s) => console.log("[gecko:embed]", s),
      printErr: (s) => console.warn("[gecko:embed]", s),
    });
    await gecko.init();
    STATE.gecko = gecko;
    STATE.mode = "embed";
    STATE.ready = true;
    global.__GOAR_GECKO = gecko;
    global.__GOAR_GECKO_READY = true;
    global.__GOAR_GECKO_MODE = "embed";
    watchGeckoSize();
    await fitGecko();

    const welcome = opts.url || global.GOAR_GECKO_HOME || "https://duckduckgo.com/";
    await gecko.load(welcome);
    STATE.lastUrl = welcome;
    setUrlLabel(STATE.lastUrl);
    return geckoStatus();
  }

  function setUrlLabel(u) {
    const el = document.getElementById("geckoPaneUrl");
    if (el) el.textContent = u || "";
    const bar = document.getElementById("browser-url");
    if (bar && u && !String(u).startsWith("data:")) bar.value = u;
    const tab = document.getElementById("ff-tab-title");
    if (tab && u) {
      try { tab.textContent = new URL(u).hostname.replace(/^www\./, "") || "Firefox"; }
      catch (_) { tab.textContent = "Firefox"; }
    }
    try { if (typeof __goarTrackFfUrl === "function") __goarTrackFfUrl(u); } catch (_) {}
  }

  async function bootChrome(opts) {
    if (!coiOk()) {
      return bootEmbed(opts);
    }
    const { body } = ensurePane(opts.show !== false, "chrome");
    STATE.gecko = null;
    body.innerHTML = "";
    const wisp = resolveGeckoWisp();
    const src = chromeDemoUrl(wisp);
    STATE.chromeUrl = src;

    const iframe = document.createElement("iframe");
    iframe.id = "geckoChromeFrame";
    iframe.title = "Firefox WASM chrome";
    iframe.allow = "cross-origin-isolated";
    iframe.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff";
    iframe.src = src;
    body.appendChild(iframe);
    STATE.iframe = iframe;
    STATE.mode = "chrome";
    STATE.ready = true;
    global.__GOAR_GECKO_MODE = "chrome";
    global.__GOAR_GECKO_READY = true;
    const home = opts.url || global.GOAR_GECKO_HOME || "https://duckduckgo.com/";
    STATE.lastUrl = home;
    setUrlLabel(home);

    iframe.addEventListener("load", () => {
      try {
        const win = iframe.contentWindow;
        const doc = iframe.contentDocument;
        if (!win) return;
        try {
          win.localStorage.setItem(
            "libxul-demo-opts",
            JSON.stringify({ gpu: !!global.GOAR_GECKO_GPU, jit: true, wisp: wisp })
          );
          win.localStorage.setItem("libxul-demo-url", home);
        } catch (_) {}
        const launch = () => {
          try {
            const btn = doc && doc.getElementById("start-btn");
            if (btn) btn.click();
          } catch (_) {}
          try {
            if (typeof win.geckoLoad === "function") win.geckoLoad(home);
          } catch (_) {}
        };
        launch();
        let n = 0;
        const iv = setInterval(() => {
          n += 1;
          launch();
          try {
            if (doc && doc.getElementById("screen") && doc.getElementById("screen").classList.contains("ready")) {
              clearInterval(iv);
            }
          } catch (_) {}
          if (n > 80) clearInterval(iv);
        }, 500);
      } catch (e) {
        console.warn("[gecko:chrome] post-load", e);
      }
    });

    return geckoStatus();
  }

  async function ensureGecko(opts) {
    opts = opts || {};
    const mode = "embed";

    if (opts.force) geckoReset();

    if (STATE.ready && STATE.mode === mode && !opts.force) {
      if (opts.show !== false) geckoShow();
      if (opts.url) await geckoLoad(opts.url);
      return geckoStatus();
    }

    // mode switch without force
    if (STATE.ready && STATE.mode && STATE.mode !== mode) {
      geckoReset();
    }

    if (STATE.loading) return STATE.loading;

    STATE.loading = (async () => {
      STATE.lastError = "";
      try {
        if (!coiOk()) {
          try { global.GOAR_GECKO_NOWASMJIT = "1"; } catch (_) {}
        }
        if (mode === "chrome" && coiOk()) return await bootChrome(opts);
        return await bootEmbed(opts);
      } catch (e) {
        STATE.lastError = String(e && e.message ? e.message : e);
        STATE.ready = false;
        STATE.gecko = null;
        console.error("[goar] gecko init failed", e);
        return geckoStatus();
      } finally {
        STATE.loading = null;
      }
    })();

    return STATE.loading;
  }

  async function geckoLoad(url) {
    const u = String(url || "").trim();
    if (!u) return { ok: false, error: "url required" };
    let target = u;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(target)) target = "https://" + target;

    if (!STATE.ready) {
      await ensureGecko({ show: true, url: target, mode: STATE.mode || "embed" });
      return { ok: !!STATE.ready, ...geckoStatus() };
    }

    showSharedBrowser();
    if (STATE.mode === "chrome" && STATE.iframe) {
      try {
        const win = STATE.iframe.contentWindow;
        if (win && typeof win.geckoLoad === "function") {
          await win.geckoLoad(target);
          STATE.lastUrl = target;
          setUrlLabel(target);
          return { ok: true, mode: "chrome", url: target, ...geckoStatus() };
        }
        try {
          win.localStorage.setItem("libxul-demo-url", target);
        } catch (_) {}
        STATE.lastUrl = target;
        setUrlLabel(target);
        return { ok: true, mode: "chrome", pending: true, url: target, ...geckoStatus() };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e), ...geckoStatus() };
      }
    }

    if (STATE.gecko && typeof STATE.gecko.load === "function") {
      await STATE.gecko.load(target);
      STATE.lastUrl = target;
      setUrlLabel(target);
      try {
        if (typeof ensureGeckoDev === "function") ensureGeckoDev().catch(() => {});
      } catch (_) {}
      return { ok: true, mode: "embed", url: target, ...geckoStatus() };
    }
    return { ok: false, error: "no gecko engine", ...geckoStatus() };
  }

  async function geckoBack() {
    if (STATE.gecko && typeof STATE.gecko.evalChrome === "function") {
      try { await STATE.gecko.evalChrome("content.history.back()"); } catch (_) {
        try { await STATE.gecko.evalChrome("window.back()"); } catch (e) {}
      }
    }
    return geckoStatus();
  }
  async function geckoReload() {
    if (STATE.lastUrl && STATE.gecko && typeof STATE.gecko.load === "function") {
      await STATE.gecko.load(STATE.lastUrl);
    }
    return geckoStatus();
  }

  function geckoStatus() {
    return {
      plane: "gecko",
      mode: STATE.mode,
      ready: !!STATE.ready,
      loading: !!STATE.loading,
      lastError: STATE.lastError || null,
      lastUrl: STATE.lastUrl || null,
      host: STATE.host ? STATE.host.id || "design" : "float",
      coi: coiOk(),
      crossOriginIsolated: !!global.crossOriginIsolated,
      sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
      wispUrl: resolveGeckoWisp(),
      wasmUrl: STATE.wasmUrl || geckoWasmUrl(),
      chromeUrl: STATE.chromeUrl || chromeDemoUrl(resolveGeckoWisp()),
      independent_of_v86: true,
      note: !coiOk()
        ? "Always-on plane F — waiting COOP+COEP for SharedArrayBuffer"
        : STATE.ready
          ? "Live · " +
            (STATE.mode || "?") +
            " · host " +
            (STATE.host ? STATE.host.id || "design" : "float")
          : "Always-on plane F — warming",
    };
  }

  function browserPlaneStatus() {
    let mw = null;
    try {
      mw = typeof mwFabricStatus === "function" ? mwFabricStatus() : null;
    } catch (_) {}
    let guestOnline = false;
    try {
      guestOnline = !!(global.envReady || global.__GOAR_ENV_READY);
    } catch (_) {}
    const g = geckoStatus();
    return {
      framework: "interconnected browser paths",
      paths: {
        host_fetch: { tools: ["web_fetch", "http_request"], ok: true },
        fabric_tls: {
          ready: !!(mw && mw.ready),
          wisp: (mw && mw.wispUrl) || resolveGeckoWisp(),
        },
        guest_http: { online: guestOnline },
        gecko_embed: {
          ready: g.ready && g.mode === "embed",
          host: g.host,
          coi: g.coi,
        },
        gecko_chrome: { ready: g.ready && g.mode === "chrome", coi: g.coi },
      },
      routing: [
        "Design Browser panel → #browser-frame-wrap hosts gecko",
        "Go / gecko_load → embed or chrome engine",
        "CORS-blocked → guest_http fallback",
      ],
      gecko: g,
    };
  }

  function showSharedBrowser() {
    try {
      const app = document.getElementById("app");
      if (app) app.classList.add("panel-open");
      document.querySelectorAll(".panel-view").forEach((v) => v.classList.remove("on"));
      document.getElementById("view-browser")?.classList.add("on");
      document.querySelectorAll(".panel-tab").forEach((t) => {
        t.classList.toggle("on", t.dataset.panel === "browser");
      });
      document.getElementById("btn-browser")?.classList.add("on");
    } catch (_) {}
    geckoShow();
  }

  function normXY(x, y) {
    const w = (STATE.gecko && STATE.gecko.W) || (STATE.canvas && STATE.canvas.width) || 400;
    const h = (STATE.gecko && STATE.gecko.H) || (STATE.canvas && STATE.canvas.height) || 480;
    let px = Number(x);
    let py = Number(y);
    if (px >= 0 && px <= 1 && py >= 0 && py <= 1) {
      px = Math.round(px * w);
      py = Math.round(py * h);
    }
    return { x: Math.max(0, Math.min(w - 1, px | 0)), y: Math.max(0, Math.min(h - 1, py | 0)), w, h };
  }

  async function geckoClick(x, y, button) {
    if (!STATE.ready) await ensureGecko({ show: true });
    showSharedBrowser();
    const g = STATE.gecko;
    if (!g || typeof g.run !== "function") {
      return { ok: false, error: "embed engine required for click (not chrome UI)" };
    }
    const p = normXY(x, y);
    const btn = button == null ? 0 : Number(button);
    await g.run({ op: 1, evType: 0, x: p.x, y: p.y, buttons: 0 });
    await g.run({ op: 1, evType: 1, x: p.x, y: p.y, button: btn, buttons: 1 << btn, clickCount: 1 });
    await g.run({ op: 1, evType: 2, x: p.x, y: p.y, button: btn, buttons: 0, clickCount: 1 });
    return { ok: true, x: p.x, y: p.y, w: p.w, h: p.h };
  }

  async function geckoType(text) {
    if (!STATE.ready) await ensureGecko({ show: true });
    showSharedBrowser();
    const g = STATE.gecko;
    if (!g || typeof g.run !== "function") {
      return { ok: false, error: "embed engine required for type (not chrome UI)" };
    }
    const s = String(text || "");
    for (const ch of s) {
      if (ch === "\n") {
        await g.run({ op: 2, evType: 0, key: "Enter", keyCode: 13, charCode: 13, modifiers: 0 });
        await g.run({ op: 2, evType: 1, key: "Enter", keyCode: 13, charCode: 13, modifiers: 0 });
        continue;
      }
      const code = ch.codePointAt(0) || 0;
      await g.run({ op: 2, evType: 0, key: ch, keyCode: code, charCode: code, modifiers: 0 });
      await g.run({ op: 2, evType: 1, key: ch, keyCode: code, charCode: code, modifiers: 0 });
    }
    return { ok: true, n: s.length };
  }

  async function geckoKey(key, keyCode) {
    if (!STATE.ready) await ensureGecko({ show: true });
    showSharedBrowser();
    const g = STATE.gecko;
    if (!g || typeof g.run !== "function") {
      return { ok: false, error: "embed engine required for keys" };
    }
    const k = String(key || "");
    const code = keyCode != null ? Number(keyCode) : (k.length === 1 ? k.codePointAt(0) : 0);
    await g.run({ op: 2, evType: 0, key: k, keyCode: code, charCode: k.length === 1 ? code : 0, modifiers: 0 });
    await g.run({ op: 2, evType: 1, key: k, keyCode: code, charCode: k.length === 1 ? code : 0, modifiers: 0 });
    return { ok: true, key: k };
  }

  async function geckoEval(js) {
    if (!STATE.ready) await ensureGecko({ show: true });
    showSharedBrowser();
    const g = STATE.gecko;
    if (!g || typeof g.evalChrome !== "function") {
      return { ok: false, error: "eval needs embed Gecko" };
    }
    const out = await g.evalChrome(String(js || ""));
    return { ok: true, result: String(out == null ? "" : out).slice(0, 8000) };
  }

  async function geckoShot() {
    if (!STATE.ready) await ensureGecko({ show: true });
    showSharedBrowser();
    const canvas = STATE.canvas || document.getElementById("geckoCanvas");
    if (!canvas || typeof canvas.toDataURL !== "function") {
      return { ok: false, error: "no canvas to capture" };
    }
    let data = "";
    try {
      data = canvas.toDataURL("image/jpeg", 0.62);
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
    STATE.lastShot = data;
    return {
      ok: true,
      mime: "image/jpeg",
      bytes: Math.round((data.length * 3) / 4),
      data_url: data.slice(0, 120) + "…",
      data: data,
      url: STATE.lastUrl,
    };
  }

  async function geckoWait(ms) {
    const n = Math.max(0, Math.min(20000, Number(ms) || 400));
    await new Promise((r) => setTimeout(r, n));
    return { ok: true, ms: n, url: STATE.lastUrl, ready: !!STATE.ready };
  }

  global.ensureGecko = ensureGecko;
  global.geckoLoad = geckoLoad;
  global.geckoStatus = geckoStatus;
  global.geckoHide = geckoHide;
  global.geckoShow = geckoShow;
  global.geckoBack = geckoBack;
  global.geckoReload = geckoReload;
  global.fitGecko = fitGecko;
  global.geckoReset = geckoReset;
  global.geckoClick = geckoClick;
  global.geckoType = geckoType;
  global.geckoKey = geckoKey;
  global.geckoEval = geckoEval;
  global.geckoShot = geckoShot;
  global.geckoWait = geckoWait;
  global.showSharedBrowser = showSharedBrowser;
  global.browserPlaneStatus = browserPlaneStatus;
  global.geckoStatus = geckoStatus;
  global.geckoHide = geckoHide;
  global.geckoShow = geckoShow;
  global.geckoBack = geckoBack;
  global.geckoReload = geckoReload;
  global.fitGecko = fitGecko;
  global.geckoReset = geckoReset;
  global.browserPlaneStatus = browserPlaneStatus;
  global.__GOAR_GECKO_STATUS = geckoStatus;
  global.__GOAR_BROWSER_PLANE = browserPlaneStatus;
})(typeof window !== "undefined" ? window : globalThis);
