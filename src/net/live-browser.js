/**
 * Live Computer browser — a real, clickable Firefox-looking webview.
 * Pages are fetched through the host fabric (libcurl+WISP / CORS relays)
 * and shown in a same-origin srcdoc frame so you and the agent can
 * click, type, scroll, and screenshot immediately.
 */
(function (global) {
  "use strict";

  const HOME = "https://html.duckduckgo.com/html/";
  const S = {
    ready: false,
    iframe: null,
    url: HOME,
    title: "DuckDuckGo",
    stack: [HOME],
    idx: 0,
    loading: false,
    lastError: "",
  };

  function $(id) {
    return document.getElementById(id);
  }

  function absUrl(href, base) {
    try {
      return new URL(String(href || ""), base || S.url || HOME).href;
    } catch (_) {
      return String(href || "");
    }
  }

  function setChrome(url, title) {
    S.url = url || S.url;
    if (title) S.title = title;
    const bar = $("browser-url");
    if (bar && url && !String(url).startsWith("data:")) bar.value = url;
    const tab = $("ff-tab-title");
    if (tab) {
      try {
        tab.textContent = title || new URL(S.url).hostname.replace(/^www\./, "") || "Firefox";
      } catch (_) {
        tab.textContent = title || "Firefox";
      }
    }
    const st = $("browser-status");
    if (st) st.textContent = S.loading ? "loading" : "live";
  }

  function showComputer() {
    try {
      if (typeof goarShowView === "function") {
        const on = document.body.classList.contains("view-computer");
        if (!on) goarShowView("computer");
      } else {
        document.body.classList.add("view-computer");
        $("browser-tab")?.classList.add("open", "view-active", "active");
      }
    } catch (_) {}
  }

  function ensureFrame() {
    const wrap = $("browser-frame-wrap");
    if (!wrap) return null;
    let iframe = $("goar-live-frame");
    if (!iframe) {
      wrap.innerHTML = "";
      iframe = document.createElement("iframe");
      iframe.id = "goar-live-frame";
      iframe.title = "Firefox";
      iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-same-origin allow-popups allow-modals allow-downloads");
      iframe.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff;display:block;";
      wrap.appendChild(iframe);
      iframe.addEventListener("load", onFrameLoad);
    }
    S.iframe = iframe;
    S.ready = true;
    return iframe;
  }

  function onFrameLoad() {
    const iframe = S.iframe;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (doc && doc.title) setChrome(S.url, doc.title);
    } catch (_) {}
  }

  function rewritePage(html, url) {
    html = String(html || "");
    html = html.replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy[^>]*>/gi, "");
    html = html.replace(/if\s*\(\s*top\s*!==\s*self\s*\)[^;{]+[;{]/gi, "if(0){");
    html = html.replace(/if\s*\(\s*self\s*!==\s*top\s*\)[^;{]+[;{]/gi, "if(0){");
    const base = absUrl(url);
    const hook =
      "<script>(function(){function N(u,m,b){try{parent.postMessage({goarNav:u,method:m||'GET',body:b||''},'*');}catch(e){}}" +
      "document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a');" +
      "if(!a||!a.href)return;if(a.hasAttribute('download'))return;e.preventDefault();N(a.href);},true);" +
      "document.addEventListener('submit',function(e){var f=e.target;if(!f||!f.tagName)return;" +
      "e.preventDefault();var fd=new FormData(f);var q=new URLSearchParams(fd).toString();" +
      "var act=f.action||location.href;N(act,(f.method||'GET').toUpperCase(),q);},true);})();<\/script>";
    const safeBase = String(base).replace(/["'<>]/g, "");
    if (/<head[\s>]/i.test(html)) {
      html = html.replace(/<head([^>]*)>/i, "<head$1><base href=\"" + safeBase + "\">");
    } else {
      html = "<head><base href=\"" + safeBase + "\"></head>" + html;
    }
    if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, hook + "</body>");
    else html += hook;
    return html;
  }

  async function fetchPage(url, method, body) {
    const opts = { method: method || "GET", maxBytes: 900000 };
    if (body && opts.method !== "GET") {
      opts.body = body;
      opts.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    } else if (body && opts.method === "GET") {
      url = url + (url.indexOf("?") >= 0 ? "&" : "?") + body;
    }
    if (typeof goarHostFetch === "function") {
      try {
        const r = await goarHostFetch(url, Object.assign({ render: true }, opts));
        if (r && r.body) return r;
      } catch (e) {
        S.lastError = String(e && e.message ? e.message : e);
      }
    }
    if (typeof manusHttpFetch === "function") {
      const r = await manusHttpFetch(url, Object.assign({ render: true }, opts));
      if (r && r.body) return r;
    }
    throw new Error(S.lastError || "fetch failed");
  }

  function looksHtml(body, headers) {
    const ct = String((headers && (headers["content-type"] || headers["Content-Type"])) || "");
    if (/image\//i.test(ct)) return false;
    if (/text\/html|application\/xhtml|text\/plain/i.test(ct)) return true;
    const s = String(body || "").slice(0, 400).toLowerCase();
    return s.indexOf("<html") >= 0 || s.indexOf("<!doctype") >= 0 || s.indexOf("<head") >= 0;
  }

  async function liveLoad(url, extra) {
    extra = extra || {};
    let target = String(url || "").trim();
    if (!target) target = HOME;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(target)) {
      if (/^[\w.-]+\.[a-z]{2,}([/:?#]|$)/i.test(target)) target = "https://" + target;
      else target = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(target);
    }
    if (/^https?:\/\/(www\.)?duckduckgo\.com\/?$/i.test(target)) target = HOME;
    if (/^https?:\/\/(www\.)?duckduckgo\.com\/\?/i.test(target)) {
      try {
        const q = new URL(target).searchParams.get("q") || "";
        target = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q);
      } catch (_) {}
    }

    if (!extra.skipShow) showComputer();
    const iframe = ensureFrame();
    if (!iframe) return { ok: false, error: "no browser host" };

    S.loading = true;
    S.lastError = "";
    setChrome(target, "Loading…");

    try {
      const page = await fetchPage(target, extra.method, extra.body);
      const finalUrl = page.url || target;
      if (!looksHtml(page.body, page.headers)) {
        iframe.srcdoc =
          "<!doctype html><meta charset=utf-8><body style='font:14px sans-serif;padding:24px;background:#fff'>" +
          "<p>Opened <a href='" + finalUrl.replace(/'/g, "") + "'>" + finalUrl + "</a></p>" +
          "<p style='color:#666'>This response is not an HTML page.</p></body>";
      } else {
        iframe.srcdoc = rewritePage(page.body, finalUrl);
      }
      S.url = finalUrl;
      if (!extra.skipHist) {
        S.stack = S.stack.slice(0, S.idx + 1);
        if (S.stack[S.idx] !== finalUrl) {
          S.stack.push(finalUrl);
          S.idx = S.stack.length - 1;
        }
      }
      S.ready = true;
      S.loading = false;
      setChrome(finalUrl, "");
      setTimeout(function () {
        try {
          const t = iframe.contentDocument && iframe.contentDocument.title;
          if (t) setChrome(finalUrl, t);
        } catch (_) {}
      }, 80);
      return { ok: true, url: finalUrl, via: page.via || "fabric", ready: true };
    } catch (e) {
      S.loading = false;
      S.lastError = String(e && e.message ? e.message : e);
      iframe.srcdoc =
        "<!doctype html><meta charset=utf-8><body style='margin:0;background:#f9f9fb;color:#1c1b22;font:15px/1.5 sans-serif'>" +
        "<div style='max-width:520px;margin:12vh auto;padding:0 20px'>" +
        "<h1 style='font-size:20px;font-weight:650'>Hmm. We're having trouble finding that site.</h1>" +
        "<p style='color:#5b5b66'>" + String(S.lastError).replace(/</g, "") + "</p>" +
        "<p><a href='https://html.duckduckgo.com/html/'>Search DuckDuckGo</a></p></div></body>";
      setChrome(target, "Problem loading page");
      return { ok: false, error: S.lastError, url: target };
    }
  }

  function liveBack() {
    if (S.idx <= 0) return liveStatus();
    S.idx -= 1;
    return liveLoad(S.stack[S.idx], { skipHist: true });
  }
  function liveForward() {
    if (S.idx >= S.stack.length - 1) return liveStatus();
    S.idx += 1;
    return liveLoad(S.stack[S.idx], { skipHist: true });
  }
  function liveReload() {
    return liveLoad(S.url, { skipHist: true });
  }

  function liveDoc() {
    try {
      return S.iframe && S.iframe.contentDocument;
    } catch (_) {
      return null;
    }
  }

  function liveStatus() {
    return {
      plane: "live",
      mode: "live",
      ready: !!S.ready,
      loading: !!S.loading,
      lastError: S.lastError || null,
      lastUrl: S.url,
      title: S.title,
      host: "browser-frame-wrap",
      note: "Live Firefox shell · fabric fetch · you and the agent share this tab",
    };
  }

  async function liveClick(x, y) {
    const doc = liveDoc();
    if (!doc) return { ok: false, error: "no document" };
    if (typeof x === "string" && /[a-z.#\[\]]/i.test(x) && y == null) {
      return liveClickSel(x);
    }
    const el = doc.elementFromPoint(Number(x) || 0, Number(y) || 0);
    if (!el) return { ok: false, error: "no element" };
    try {
      el.focus();
      el.click();
    } catch (_) {}
    return { ok: true, tag: el.tagName, text: String(el.textContent || "").slice(0, 80) };
  }

  function liveClickSel(sel) {
    const doc = liveDoc();
    if (!doc) return { ok: false, error: "no document" };
    const el = doc.querySelector(sel);
    if (!el) return { ok: false, error: "no element", selector: sel };
    try {
      el.scrollIntoView({ block: "center", inline: "nearest" });
      el.focus();
      el.click();
    } catch (_) {}
    const b = el.getBoundingClientRect();
    return { ok: true, selector: sel, tag: el.tagName, x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }

  function liveFind(sel) {
    const doc = liveDoc();
    if (!doc) return { ok: false, error: "no document" };
    const q = String(sel || "a,button,input,textarea,select,[role=button]");
    const els = Array.prototype.slice.call(doc.querySelectorAll(q), 0, 40);
    return {
      ok: true,
      url: S.url,
      title: (doc.title || S.title || ""),
      n: els.length,
      matches: els.map(function (el, i) {
        return {
          i: i,
          tag: el.tagName.toLowerCase(),
          id: el.id || "",
          name: el.getAttribute("name") || "",
          type: el.getAttribute("type") || "",
          href: el.getAttribute("href") || "",
          text: String(el.innerText || el.value || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").slice(0, 80),
        };
      }),
    };
  }

  async function liveType(text, sel) {
    const doc = liveDoc();
    if (!doc) return { ok: false, error: "no document" };
    let el = null;
    if (sel) el = doc.querySelector(sel);
    if (!el) el = doc.activeElement;
    if (!el || el === doc.body) el = doc.querySelector("input:not([type=hidden]),textarea,[contenteditable='true']");
    if (!el) return { ok: false, error: "no field" };
    const val = String(text || "");
    try {
      el.focus();
      if ("value" in el) {
        el.value = val;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        el.textContent = val;
      }
    } catch (_) {}
    return { ok: true, typed: val.length, tag: el.tagName };
  }

  async function liveEval(js) {
    const iframe = S.iframe;
    if (!iframe || !iframe.contentWindow) return { ok: false, error: "no window" };
    try {
      const result = iframe.contentWindow.eval(String(js || "document.title"));
      let out = result;
      if (result && typeof result === "object") {
        try { out = JSON.parse(JSON.stringify(result)); } catch (_) { out = String(result); }
      }
      return { ok: true, result: out };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  async function runBrowser(args) {
    args = args || {};
    const act = String(args.action || args.method || args.op || "url").toLowerCase();
    const sel = args.selector || args.sel || args.query || "";
    const url = args.url;
    const text = args.text != null ? args.text : args.value;
    if (act === "goto" || act === "go" || act === "open" || act === "load") {
      if (!url) return { ok: false, error: "url required" };
      return liveLoad(url);
    }
    if (act === "url" || act === "status") return liveStatus();
    if (act === "title") {
      const doc = liveDoc();
      return { ok: true, title: (doc && doc.title) || S.title, url: S.url };
    }
    if (act === "content" || act === "html") {
      const doc = liveDoc();
      if (!doc) return { ok: false, error: "no document" };
      return { ok: true, html: String(doc.documentElement.outerHTML || "").slice(0, 12000), url: S.url };
    }
    if (act === "find" || act === "elements") return liveFind(sel);
    if (act === "click" || act === "$") {
      if (sel) return liveClickSel(sel);
      return liveClick(args.x, args.y);
    }
    if (act === "type" || act === "fill" || act === "send_keys") return liveType(text, sel);
    if (act === "eval" || act === "evaluate" || act === "execute") return liveEval(args.js || args.code || args.script || "document.title");
    if (act === "shot" || act === "screenshot") return liveShot();
    if (act === "wait" || act === "waitfor") {
      if (sel) {
        const limit = Math.max(200, Math.min(20000, Number(args.ms || args.timeout) || 8000));
        const t0 = Date.now();
        while (Date.now() - t0 < limit) {
          const doc = liveDoc();
          if (doc && doc.querySelector(sel)) return { ok: true, selector: sel, ms: Date.now() - t0 };
          await new Promise((r) => setTimeout(r, 150));
        }
        return { ok: false, error: "timeout", selector: sel };
      }
      return liveWait(args.ms || args.timeout);
    }
    if (act === "back") return liveBack();
    if (act === "reload") return liveReload();
    if (act === "forward") return liveForward();
    return { ok: false, error: "action goto|click|type|eval|find|shot|url|title|content|wait|back|reload" };
  }

  async function liveShot() {
    const doc = liveDoc();
    const iframe = S.iframe;
    if (!doc || !iframe) return { ok: false, error: "no document" };
    const w = Math.max(320, iframe.clientWidth || 800);
    const h = Math.max(240, iframe.clientHeight || 600);
    try {
      const xhtml = new XMLSerializer().serializeToString(doc.documentElement);
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
        '<foreignObject width="100%" height="100%">' + xhtml + "</foreignObject></svg>";
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      return { ok: true, mime: "image/svg+xml", url: url, bytes: blob.size, href: S.url };
    } catch (e) {
      return {
        ok: true,
        mime: "text/html",
        url: S.url,
        title: doc.title,
        note: String(e && e.message ? e.message : e),
      };
    }
  }

  async function liveWait(ms) {
    const n = Math.max(0, Math.min(20000, Number(ms) || 400));
    await new Promise((r) => setTimeout(r, n));
    return { ok: true, ms: n, url: S.url, ready: !!S.ready };
  }

  async function ensureLive(opts) {
    opts = opts || {};
    ensureFrame();
    S.ready = true;
    if (opts.show !== false) showComputer();
    const url = opts.url || S.url || HOME;
    if (!S.iframe || !S.iframe.srcdoc) await liveLoad(url, { skipShow: true });
    else if (opts.url && opts.url !== S.url) await liveLoad(opts.url, { skipShow: opts.show === false });
    return liveStatus();
  }

  window.addEventListener("message", function (ev) {
    const d = ev && ev.data;
    if (!d || !d.goarNav) return;
    liveLoad(d.goarNav, { method: d.method, body: d.body }).catch(function () {});
  });

  function wireChrome() {
    $("browser-back")?.addEventListener("click", function (e) {
      e.preventDefault();
      liveBack();
    });
    $("browser-forward")?.addEventListener("click", function (e) {
      e.preventDefault();
      liveForward();
    });
    $("browser-reload")?.addEventListener("click", function (e) {
      e.preventDefault();
      liveReload();
    });
    $("browser-url-form")?.addEventListener("submit", function (e) {
      e.preventDefault();
      const v = ($("browser-url") && $("browser-url").value) || "";
      liveLoad(v);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireChrome);
  else wireChrome();

  global.ensureLiveBrowser = ensureLive;
  global.liveLoad = liveLoad;
  global.liveStatus = liveStatus;
  global.liveFind = liveFind;
  global.runBrowser = runBrowser;

  global.ensureGecko = ensureLive;
  global.geckoLoad = liveLoad;
  global.geckoStatus = liveStatus;
  global.geckoShow = function (force) {
    ensureFrame();
    if (force || document.body.classList.contains("view-computer")) showComputer();
    return liveStatus();
  };
  global.geckoHide = function () {
    try {
      if (typeof goarShowView === "function") goarShowView("chat");
    } catch (_) {}
    return liveStatus();
  };
  global.geckoBack = liveBack;
  global.geckoReload = liveReload;
  global.geckoClick = liveClick;
  global.geckoType = liveType;
  global.geckoEval = liveEval;
  global.geckoShot = liveShot;
  global.geckoWait = liveWait;
  global.fitGecko = function () {
    return Promise.resolve(liveStatus());
  };
  global.sizeChromeIframe = function () {
    return liveStatus();
  };
})(typeof window !== "undefined" ? window : globalThis);
