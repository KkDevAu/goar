(function () {
  "use strict";

  const PACKS = [
    "./goar.pack.zip",
    "https://cdn.jsdelivr.net/gh/KkDevAu/goar@ea15c46af1061c3cad1526606838d0a6bc94c97e/goar.pack.zip",
    "https://raw.githubusercontent.com/KkDevAu/goar/ea15c46af1061c3cad1526606838d0a6bc94c97e/goar.pack.zip",
    "https://cdn.jsdelivr.net/gh/KkDevAu/goar@main/goar.pack.zip",
    "https://raw.githubusercontent.com/KkDevAu/goar/refs/heads/main/goar.pack.zip",
  ];
  const CSS = [
    "src/css/xterm.css",
    "src/css/app.css",
    "src/css/ghtml-shell.css",
    "src/css/goar-bridge.css",
    "src/css/grok-chat.css",
    "src/css/particles-layer.css",
  ];

  function say(msg) {
    const el = document.getElementById("step");
    if (el) el.textContent = msg;
    const d = document.getElementById("detail");
    if (d) d.textContent = "";
  }

  function pct(n) {
    const p = Math.max(0, Math.min(100, Math.round(n)));
    const bar = document.getElementById("barFill");
    const lab = document.getElementById("pct");
    if (bar) bar.style.width = p + "%";
    if (lab) lab.textContent = p + "%";
  }

  async function inflateRaw(u8) {
    if (typeof DecompressionStream === "function") {
      const ds = new DecompressionStream("deflate-raw");
      const ab = await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
      return new Uint8Array(ab);
    }
    if (typeof pako !== "undefined" && pako.inflateRaw) return pako.inflateRaw(u8);
    throw new Error("no deflate");
  }

  function str(u8) {
    return new TextDecoder().decode(u8);
  }

  async function unzip(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= 0 && i > u8.length - 22 - 65536; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("zip: no directory");
    const n = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    const files = Object.create(null);
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(off, true) !== 0x02014b50) throw new Error("zip: bad central");
      const method = dv.getUint16(off + 10, true);
      const comp = dv.getUint32(off + 20, true);
      const size = dv.getUint32(off + 24, true);
      const nameLen = dv.getUint16(off + 28, true);
      const extra = dv.getUint16(off + 30, true);
      const comment = dv.getUint16(off + 32, true);
      const local = dv.getUint32(off + 42, true);
      const name = str(u8.subarray(off + 46, off + 46 + nameLen));
      off += 46 + nameLen + extra + comment;
      if (name.endsWith("/")) continue;
      const nameL = dv.getUint16(local + 26, true);
      const extraL = dv.getUint16(local + 28, true);
      const start = local + 30 + nameL + extraL;
      const raw = u8.subarray(start, start + comp);
      files[name] = method === 0 ? raw : await inflateRaw(raw);
      if (files[name].length !== size && method !== 0) {
        /* allow */
      }
    }
    return files;
  }

  async function fetchPack() {
    let last = null;
    for (const url of PACKS) {
      try {
        const res = await fetch(url, { cache: "default" });
        if (!res.ok) { last = new Error("pack " + res.status); continue; }
        return await res.arrayBuffer();
      } catch (e) {
        last = e;
      }
    }
    throw last || new Error("pack missing");
  }

  function injectCss(text) {
    const s = document.createElement("style");
    s.textContent = text;
    document.head.appendChild(s);
  }

  function runJs(text, name) {
    try {
      const s = document.createElement("script");
      s.textContent = text;
      document.body.appendChild(s);
    } catch (e) {
      throw new Error("script " + (name || "") + ": " + ((e && e.message) || e));
    }
  }

  async function main() {
    try {
      pct(4);
      say("Pack");
      const buf = await fetchPack();
      pct(18);
      say("Open");
      const files = await unzip(buf);
      pct(40);
      say("Style");
      CSS.forEach((p) => {
        const f = files[p];
        if (f) injectCss(str(f));
      });
      const orderRaw = files["src/LOAD_ORDER.json"];
      const order = orderRaw
        ? JSON.parse(str(orderRaw)).map((p) => "src/" + p.replace(/^src\//, ""))
        : [];
      const extra = [
        "src/vendor/xterm.js",
        "src/vendor/xterm-addon-fit.js",
        "src/vendor/xterm-addon-web-links.js",
        "src/vendor/pako-inflate.js",
        "src/vendor/json-schema.js",
        "vendor/kv.js/kv-browser.js",
      ];
      const seen = new Set();
      const list = extra.concat(order).filter((p) => {
        if (seen.has(p) || !files[p]) return false;
        seen.add(p);
        return true;
      });
      pct(48);
      for (let i = 0; i < list.length; i++) {
        say("Load");
        runJs(str(files[list[i]]), list[i]);
        pct(48 + Math.round(((i + 1) / list.length) * 40));
      }
      pct(92);
      say("Start");
    } catch (e) {
      say("Pack failed");
      const err = document.getElementById("err");
      if (err) {
        err.textContent = (e && e.message) || String(e);
        err.classList.add("show");
      }
    }
  }

  document.addEventListener(
    "click",
    function (e) {
      const t = e.target && e.target.closest
        ? e.target.closest("#btn-settings, #menu-settings, #drawer-settings")
        : null;
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof openSettings === "function") openSettings();
      else {
        const box = document.getElementById("settings");
        if (box) {
          box.classList.add("open");
          box.style.display = "flex";
          box.style.zIndex = "10000";
        }
      }
    },
    true
  );

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", main);
  else main();
})();
