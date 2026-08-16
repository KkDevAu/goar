window.__goarMarkEnvReady = function (ok, detail) {
  const was = !!envReady;
  envReady = !!ok;
  window.envReady = envReady;
  window.__GOAR_ENV_READY = envReady;
  if (ok) {
    try { agentBootOff(); } catch (_) {}
    try { if (typeof markTermReady === "function") markTermReady(); } catch (_) {}
    // Announce once only — avoid chat spam on re-probes
    if (!was && !window.__GOAR_ONLINE_ANNOUNCED) {
      window.__GOAR_ONLINE_ANNOUNCED = true;
      try {
        appendMsg("Ready.", "sys");
      try { if (typeof ensureSystemPlanes === "function") ensureSystemPlanes(); } catch (_) {}
      } catch (_) {}
    }
  } else {
    try { agentBoot(detail || "environment issue"); } catch (_) {}
  }
  try { refreshAgentPill(); } catch (_) {}
};
window.__GOAR_GET_ENV = () => ({
  envReady: !!envReady,
  windowEnv: !!window.envReady,
  emu: !!window.__emulator,
  seqDone: !!seqDone,
  seqRunning: !!seqRunning,
});
window.__GOAR_GUEST_EXEC = (cmd, ms) => guestExec(cmd, ms || 90000);
window.__GOAR_RUN_TOOL = (name, args) => runAgentTool(name, args || {});
window.__GOAR_AGENT_TURN = (text) => agentTurn(text);


