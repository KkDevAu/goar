/**
 * One ready moment. Chat does not unlock until this resolves.
 */
(function (global) {
  "use strict";

  async function waitForGoarReady(ms) {
    const budget = Number(ms) || 90000;
    const t0 = Date.now();
    const state = {
      unix: !!global.__GOAR_UNIX,
      py: !!(global.__pyodide),
      kernel: !!global.__GOAR_KERNEL,
      jit: !!global.__GOAR_JIT,
      pysec: !!global.__pysecReady,
      box: !!global.__GOAR_WASI_BOX,
      gecko: false,
    };

    const jobs = [];
    if (typeof ensureWasiBox === "function") {
      jobs.push(
        ensureWasiBox()
          .then((ok) => { state.box = !!ok || !!global.__GOAR_WASI_BOX; })
          .catch(() => {})
      );
    }
    if (typeof ensureJit === "function") {
      try { ensureJit(); state.jit = true; } catch (_) {}
    }
    if (typeof ensurePysecWorker === "function" && !global.__pysecReady) {
      jobs.push(
        ensurePysecWorker()
          .then(() => { state.pysec = !!global.__pysecReady; })
          .catch(() => {})
      );
    }
    if (typeof ensureGecko === "function") {
      jobs.push(
        ensureGecko({
          mode: "embed",
          show: false,
          url: global.GOAR_GECKO_HOME || "https://duckduckgo.com/",
        })
          .then((st) => {
            state.gecko = !!(st && (st.ready || st.ok)) || !!(global.__GOAR_GECKO);
          })
          .catch(() => {})
      );
    }
    const left = Math.max(1000, budget - (Date.now() - t0));
    await Promise.race([
      Promise.all(jobs),
      new Promise((r) => setTimeout(r, left)),
    ]);

    state.unix = !!global.__GOAR_UNIX;
    state.py = !!(global.__pyodide);
    state.kernel = !!global.__GOAR_KERNEL;
    state.jit = !!global.__GOAR_JIT || state.jit;
    state.pysec = !!global.__pysecReady || state.pysec;
    state.box = !!global.__GOAR_WASI_BOX || state.box;

    const core = state.unix && state.py;
    global.__GOAR_READY = !!core;
    global.__GOAR_READY_STATE = state;
    try {
      if (core && typeof __goarMarkEnvReady === "function") __goarMarkEnvReady(true, "ready");
    } catch (_) {}
    console.log("[goar] ready", state);
    return state;
  }

  global.waitForGoarReady = waitForGoarReady;
})(typeof window !== "undefined" ? window : globalThis);
