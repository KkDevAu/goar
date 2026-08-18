/**
 * Precompiled f64 kernels (dot, sum, scale, saxpy).
 * Binary is already assembled — instantiate only, no compile step at use time.
 */
(function (global) {
  "use strict";

  const GOAR_JIT_WASM_B64 =
    "AGFzbQEAAAABGwRgA39/fwF8YAJ/fwF8YAN/f3wAYAR/f398AAMFBAABAgMFAwEAEAcmBQZtZW1vcnkCAANkb3QAAANzdW0AAQVzY2FsZQACBXNheHB5AAMK6QMEjAEDAn8BfAF7/QwAAAAAAAAAAAAAAAAAAAAAIQYgAkF+cSEEA0AgAyAESQRAIAYgACADQQN0av0AAAAgASADQQN0av0AAAD98gH98AEhBiADQQJqIQMMAQsLIAb9IQAgBv0hAaAhBSAEIAJJBEAgBSAAIARBA3RqKwMAIAEgBEEDdGorAwCioCEFCyAFC3EDAn8BfAF7/QwAAAAAAAAAAAAAAAAAAAAAIQUgAUF+cSEDA0AgAiADSQRAIAUgACACQQN0av0AAAD98AEhBSACQQJqIQIMAQsLIAX9IQAgBf0hAaAhBCADIAFJBEAgBCAAIANBA3RqKwMAoCEECyAEC2UCAn8BeyAC/RQhBSABQX5xIQQDQCADIARJBEAgACADQQN0aiAAIANBA3Rq/QAAACAF/fIB/QsAACADQQJqIQMMAQsLIAQgAUkEQCAAIARBA3RqIAAgBEEDdGorAwAgAqI5AwALC4ABAgJ/AXsgA/0UIQYgAkF+cSEFA0AgBCAFSQRAIAAgBEEDdGogACAEQQN0av0AAAAgASAEQQN0av0AAAAgBv3yAf3wAf0LAAAgBEECaiEEDAELCyAFIAJJBEAgACAFQQN0aiAAIAVBA3RqKwMAIAEgBUEDdGorAwAgA6KgOQMACws=";

  let inst = null;
  let mem = null;
  let ready = false;

  function b64ToU8(s) {
    const bin = atob(s);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function ensureJit() {
    if (ready && inst) return inst;
    const bytes = b64ToU8(GOAR_JIT_WASM_B64);
    inst = new WebAssembly.Instance(new WebAssembly.Module(bytes), {});
    mem = inst.exports.memory;
    ready = true;
    global.__GOAR_JIT = true;
    global.__GOAR_JIT_READY = true;
    return inst;
  }

  function f64view() {
    ensureJit();
    return new Float64Array(mem.buffer);
  }

  function writeVec(offsetWords, arr) {
    const v = f64view();
    const n = arr.length;
    if ((offsetWords + n) * 8 > mem.buffer.byteLength) {
      mem.grow(Math.ceil(((offsetWords + n) * 8 - mem.buffer.byteLength) / 65536));
    }
    const w = f64view();
    for (let i = 0; i < n; i++) w[offsetWords + i] = +arr[i];
    return n;
  }

  function readVec(offsetWords, n) {
    const v = f64view();
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = v[offsetWords + i];
    return out;
  }

  function asArr(x) {
    if (!x) return [];
    if (Array.isArray(x)) return x.map(Number);
    if (typeof x === "string") {
      try { return JSON.parse(x).map(Number); } catch (_) { return []; }
    }
    if (typeof x.length === "number") return Array.from(x, Number);
    return [];
  }

  function goarJit(op, payload) {
    payload = payload || {};
    const o = String(op || "");
    if (o === "status") {
      ensureJit();
      return {
        ok: true,
        ready: true,
        compiled: true,
        engine: "goar-jit.wasm",
        simd: true,
        lanes: "f64x2",
        kernels: ["dot", "sum", "scale", "saxpy"],
        pages: mem.buffer.byteLength / 65536,
      };
    }
    ensureJit();
    if (o === "dot") {
      const a = asArr(payload.a);
      const b = asArr(payload.b);
      const n = Math.min(a.length, b.length);
      writeVec(0, a);
      writeVec(n + 8, b);
      const value = inst.exports.dot(0, (n + 8) * 8, n);
      return { ok: true, value, n, via: "goar-jit.wasm" };
    }
    if (o === "sum") {
      const a = asArr(payload.a);
      writeVec(0, a);
      const value = inst.exports.sum(0, a.length);
      return { ok: true, value, n: a.length, via: "goar-jit.wasm" };
    }
    if (o === "scale") {
      const a = asArr(payload.a);
      const k = Number(payload.k);
      writeVec(0, a);
      inst.exports.scale(0, a.length, k);
      return { ok: true, value: readVec(0, a.length), n: a.length, via: "goar-jit.wasm" };
    }
    if (o === "saxpy") {
      const y = asArr(payload.y);
      const x = asArr(payload.x);
      const n = Math.min(y.length, x.length);
      const a = Number(payload.a);
      writeVec(0, y);
      writeVec(n + 8, x);
      inst.exports.saxpy(0, (n + 8) * 8, n, a);
      return { ok: true, value: readVec(0, n), n, via: "goar-jit.wasm" };
    }
    return { ok: false, error: "unknown kernel " + o };
  }

  try { ensureJit(); } catch (e) { console.warn("[goar] jit instantiate", e); }

  const PY_MOD = [
    "import json",
    "from js import goarJit as _jit",
    "",
    "def _call(op, **kw):",
    "    r = _jit(op, kw)",
    "    if hasattr(r, 'to_py'):",
    "        r = r.to_py()",
    "    return r",
    "",
    "def status():",
    "    return _call('status')",
    "",
    "def dot(a, b):",
    "    return _call('dot', a=list(map(float, a)), b=list(map(float, b)))['value']",
    "",
    "def sum(a):",
    "    return _call('sum', a=list(map(float, a)))['value']",
    "",
    "def scale(a, k):",
    "    return _call('scale', a=list(map(float, a)), k=float(k))['value']",
    "",
    "def saxpy(y, x, a):",
    "    return _call('saxpy', y=list(map(float, y)), x=list(map(float, x)), a=float(a))['value']",
    "",
  ].join("\n");

  async function installGoarJitPy() {
    const py = global.__pyodide || (typeof unixPy === "function" ? unixPy() : null);
    if (!py || !py.runPythonAsync) return false;
    try {
      await Promise.resolve(py.FS.mkdirTree("/home/pyodide"));
      const enc = new TextEncoder();
      await Promise.resolve(py.FS.writeFile("/home/pyodide/goar_jit.py", enc.encode(PY_MOD)));
      await py.runPythonAsync(
        "import sys\n" +
          "if '/home/pyodide' not in sys.path: sys.path.insert(0,'/home/pyodide')\n" +
          "import importlib\n" +
          "import goar_jit\n" +
          "importlib.reload(goar_jit)\n"
      );
      global.__GOAR_JIT_PY = true;
      return true;
    } catch (e) {
      console.warn("[goar] jit python", e);
      return false;
    }
  }

  global.goarJit = goarJit;
  global.ensureJit = ensureJit;
  global.installGoarJitPy = installGoarJitPy;
  global.GOAR_JIT_WASM_B64 = GOAR_JIT_WASM_B64;
})(typeof window !== "undefined" ? window : globalThis);
