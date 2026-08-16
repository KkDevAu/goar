/**
 * Agent WASM loader — MDN instantiateStreaming / validate / call.
 * Lets the agent load a .wasm module and invoke exports.
 */
const WASM_MODS = Object.create(null);

async function wasmBytes(src) {
  if (src instanceof ArrayBuffer) return src;
  if (src instanceof Uint8Array) return src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength);
  const s = String(src || "");
  if (/^https?:\/\//i.test(s) || s.startsWith("/") || s.startsWith("./")) {
    const r = await fetch(s);
    if (!r.ok) throw new Error("wasm fetch " + r.status);
    return r.arrayBuffer();
  }
  if (/^[A-Za-z0-9+/=]+$/.test(s.replace(/\s/g, "")) && s.length > 24) {
    const bin = atob(s.replace(/\s/g, ""));
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  throw new Error("wasm src must be url or base64");
}

async function runHostWasm(args) {
  args = args || {};
  const action = String(args.action || args.op || "status").toLowerCase();
  const id = String(args.id || args.name || "mod");

  if (action === "validate") {
    const buf = await wasmBytes(args.url || args.src || args.bytes);
    return { ok: WebAssembly.validate(buf), bytes: buf.byteLength };
  }

  if (action === "load" || action === "instantiate") {
    const src = args.url || args.src || args.bytes;
    const buf = await wasmBytes(src);
    if (!WebAssembly.validate(buf)) return { ok: false, error: "invalid wasm" };
    let inst;
    try {
      if (args.url && typeof WebAssembly.instantiateStreaming === "function" && /^https?:/i.test(String(args.url))) {
        const obj = await WebAssembly.instantiateStreaming(fetch(args.url), args.imports || {});
        inst = obj.instance;
      } else {
        const obj = await WebAssembly.instantiate(buf, args.imports || {});
        inst = obj.instance;
      }
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
    WASM_MODS[id] = inst;
    return { ok: true, id, exports: Object.keys(inst.exports || {}) };
  }

  if (action === "call") {
    const inst = WASM_MODS[id];
    if (!inst) return { ok: false, error: "load first (id=" + id + ")" };
    const fn = inst.exports[args.fn || args.export || args.func];
    if (typeof fn !== "function") {
      return { ok: false, error: "no export", exports: Object.keys(inst.exports || {}) };
    }
    const params = Array.isArray(args.args) ? args.args : args.params != null ? [].concat(args.params) : [];
    const out = fn.apply(null, params);
    return { ok: true, result: out };
  }

  if (action === "list" || action === "status") {
    const ids = Object.keys(WASM_MODS);
    const map = {};
    for (const k of ids) map[k] = Object.keys(WASM_MODS[k].exports || {});
    return { ok: true, modules: map, webassembly: typeof WebAssembly !== "undefined" };
  }

  return { ok: false, error: "wasm action load|call|validate|list" };
}

try {
  window.runHostWasm = runHostWasm;
} catch (_) {}
