/**
 * Composable system prompt — vibe/core/system_prompt.py, frontend-shaped.
 * Sections only. Never dumps a tool catalog.
 */
function buildVibeSystemPrompt() {
  const sections = [];
  if (typeof OPERATOR_CORE === "string") sections.push(OPERATOR_CORE);
  if (typeof systemPlaneBlurb === "function") {
    const b = systemPlaneBlurb();
    if (b) sections.push(b);
  }
  if (typeof sandboxStatusBlurb === "function") {
    const b = sandboxStatusBlurb();
    if (b) sections.push(b);
  }
  if (typeof getStateContext === "function") {
    const s = getStateContext();
    if (s) sections.push("## SESSION\n" + s);
  }
  if (typeof missionContextBlock === "function") {
    const m = missionContextBlock();
    if (m) sections.push(m);
  }
  try {
    const s = typeof loadSettings === "function" ? loadSettings() : {};
    if (s && s.apiModel) sections.push("Model: `" + s.apiModel + "`");
  } catch (_) {}
  if (typeof scratchpadBlurb === "function") sections.push(scratchpadBlurb());
  try {
    if (typeof goarSkillBlurb === "function") {
      const sk = goarSkillBlurb();
      if (sk) sections.push(sk);
    }
  } catch (_) {}
  try {
    const fabric = typeof mwFabricStatus === "function" ? mwFabricStatus() : null;
    if (fabric && fabric.engine) {
      sections.push("Net: " + fabric.engine + (fabric.probe && fabric.probe.ok ? " live" : ""));
    }
  } catch (_) {}
  sections.push(
    "## INTERLOCK\n" +
      "Do the job. Explore = guest workspace_tree. Edit = write_file. Web = browse.\n" +
      "Never list tools. Never dump a catalog. Same mission after compact."
  );
  return sections.filter(Boolean).join("\n\n");
}
