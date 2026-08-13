function sandboxStatusBlurb() {
  try {
    const s = (typeof settingsSnapshot === "function") ? settingsSnapshot() : (typeof DEFAULTS !== "undefined" ? DEFAULTS : {});
    const toolNames = (typeof getAgentTools === "function" ? getAgentTools() : (typeof AGENT_TOOLS !== "undefined" ? AGENT_TOOLS : []))
      .map((x) => x.function && x.function.name).filter(Boolean);
    const nl = String.fromCharCode(10);
    const ready = !!(envReady || window.envReady || window.__GOAR_ENV_READY);
    const emu = !!(window.__emulator);
    const proxy = window.__GOAR_PROXY || {};
    const kit = !!(typeof __pysecReady !== "undefined" && __pysecReady);
    let phase = "ASSESS";
    try { phase = (agentState.framework && agentState.framework.phase) || phase; } catch (_) {}
    const envLine = (ready || emu)
      ? "env_ready: YES — USE guest tools (bash, python_exec, write_file). Do NOT say sandbox is offline."
      : "env_ready: BOOTING — use browser/kit tools only until YES; then use guest immediately.";
    return [
      "## LIVE STATUS (authoritative — trust this over assumptions)",
      envLine,
      "emulator: " + emu,
      "kit_ready: " + kit,
      "cors_proxy: " + (proxy.ok ? ("OK · " + (proxy.source || "wired") + " · " + (proxy.baseUrl || "")) : "pending/unavailable"),
      "framework_phase: " + phase,
      "workdir: /workspace",
      "provider: " + (s.provider || "openrouter"),
      "model: " + (s.apiModel || ""),
      "api_base: " + (s.apiBase || ""),
      "api_key_set: " + (!!(s.apiKey && String(s.apiKey).trim())),
      "tools_n: " + toolNames.length,
      "tools: " + toolNames.join(", "),
      "todos: " + (typeof agentState !== "undefined" ? agentState.todos.filter(function(x){return x.done}).length + "/" + agentState.todos.length : "0"),
      "plan: " + (typeof agentState !== "undefined" && agentState.plan ? agentState.plan.goal : "(none)"),
      "mission: " + (typeof agentState !== "undefined" && agentState.mission ? String(agentState.mission).slice(0, 160) : "(none)"),
    ].join(nl);
  } catch (e) {
    return "LIVE STATUS unavailable: " + e.message;
  }
}

async function toolEnvInfo() {
  const s = (typeof settingsSnapshot === "function") ? settingsSnapshot() : {};
  let guest = "not probed";
  if (envReady) {
    try {
      const r = await guestExec("uname -a; echo ---; python3 --version 2>&1; echo ---; ls -la /workspace 2>&1 | head -20", 45000);
      guest = r.output || ("exit " + r.code);
    } catch (e) {
      guest = "probe error: " + e.message;
    }
  }
  const snap = typeof planeSnapshot === "function" ? planeSnapshot() : {};
  const nl = String.fromCharCode(10);
  return [
    "env_ready=" + envReady,
    "model=" + (s.apiModel || ""),
    "base=" + (s.apiBase || ""),
    "tools_n=" + ((typeof getAgentTools === "function" ? getAgentTools() : []).length),
    "tools=" + ((typeof getAgentTools === "function" ? getAgentTools() : (typeof AGENT_TOOLS !== "undefined" ? AGENT_TOOLS : [])).map((x) => x.function.name).join(",")),
    "planes=" + JSON.stringify(snap),
    "guest_probe:",
    guest,
  ].join(nl);
}

/** Keep tool results available in full for the agent */
function compactToolResult(name, raw) {
  if (raw == null) return "";
  return String(raw);
}
