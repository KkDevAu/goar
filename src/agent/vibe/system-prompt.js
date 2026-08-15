/**
 * Vibe-style system prompt: short markdown + live line.
 * Tools live in the API tools array — never listed here.
 */
function buildVibeSystemPrompt() {
  const lines = [];
  if (typeof OPERATOR_CORE === "string") lines.push(OPERATOR_CORE.trim());
  let live = "LIVE:";
  try {
    const ready = typeof envReady !== "undefined" && envReady;
    live += " env=" + (ready ? "ready" : "booting");
  } catch (_) {
    live += " env=?";
  }
  try {
    const s = typeof loadSettings === "function" ? loadSettings() : {};
    if (s && s.apiModel) live += " model=" + s.apiModel;
  } catch (_) {}
  try {
    if (typeof agentState !== "undefined" && agentState && agentState.mission) {
      live += "\nMISSION: " + String(agentState.mission).slice(0, 280);
    }
  } catch (_) {}
  try {
    if (typeof GOAR_SCRATCH !== "undefined" && GOAR_SCRATCH && GOAR_SCRATCH.guestPath) {
      live += "\nSCRATCH: " + GOAR_SCRATCH.guestPath;
    }
  } catch (_) {}
  lines.push(live);
  return lines.filter(Boolean).join("\n\n");
}
