function fingerprintTool(name, args) {
  try {
    const a = args || {};
    // Include action-specific payload so different edits/writes are NOT false loops
    const payload = {
      n: name,
      c: String(a.command || a.cmd || "").slice(0, 160),
      p: String(a.path || a.src || a.dest || "").slice(0, 120),
      p2: String(a.dest || "").slice(0, 80),
      q: String(a.query || a.url || a.pattern || "").slice(0, 120),
      act: String(a.action || a.tool_id || a.toolId || "").slice(0, 40),
      code: String(a.code || a.content || "").slice(0, 120),
      old: String(a.old_string || a.oldString || "").slice(0, 80),
      neu: String(a.new_string || a.newString || "").slice(0, 80),
      idx: a.index != null ? a.index : (a.step != null ? a.step : ""),
    };
    return (name + "|" + JSON.stringify(payload)).slice(0, 320);
  } catch (_) {
    return String(name || "tool");
  }
}

function detectToolLoop(name, args) {
  // Telemetry only — NEVER block tools (user requirement).
  // "Repetition" is fixed via ADK-style context compaction + mission pin, not tool bans.
  const fp = fingerprintTool(name, args);
  recentToolFingerprints.push(fp);
  if (recentToolFingerprints.length > 64) recentToolFingerprints = recentToolFingerprints.slice(-64);

  const path = String((args && (args.path || args.dest || args.src)) || "").trim();
  const mutates = /^(write_file|edit_file|python_exec|bash)$/.test(name);
  if (mutates && path) {
    if (name === "bash") {
      const cmd = String(args.command || args.cmd || "");
      if (/python|pip|cat |tee |sed |>>| >/.test(cmd)) {
        pathActionCounts[path] = (pathActionCounts[path] || 0) + 1;
      }
    } else {
      pathActionCounts[path] = (pathActionCounts[path] || 0) + 1;
    }
  }
  const pathHits = path ? (pathActionCounts[path] || 0) : 0;
  let consecutive = 0;
  for (let i = recentToolFingerprints.length - 1; i >= 0; i--) {
    if (recentToolFingerprints[i] === fp) consecutive++;
    else break;
  }
  const window = recentToolFingerprints.slice(-16);
  const windowHits = window.filter((x) => x === fp).length;
  return {
    loop: false,
    warn: consecutive >= 6 || windowHits >= 8,
    consecutive,
    fp,
    windowHits,
    pathHits,
    path,
  };
}


function persistAgentChat() {
  try {
    const rows = [];
    const chat = agentEl.chat;
    if (chat) {
      for (const el of chat.querySelectorAll(".msg")) {
        const kind = (el.className || "").replace(/\bmsg\b/g, "").replace(/\bstreaming\b/g, "").trim().split(/\s+/)[0] || "ai";
        const body = el.querySelector(".body");
        rows.push({ kind, text: body ? body.textContent : el.textContent });
      }
    }
    localStorage.setItem(AGENT_CHAT_KEY, JSON.stringify(rows.slice(-160)));
    localStorage.setItem(AGENT_STATE_KEY, JSON.stringify({
      todos: agentState.todos,
      plan: agentState.plan,
      ledger: agentState.ledger,
      memories: agentState.memories,
      lastThinking: agentState.lastThinking || "",
      lastTool: agentState.lastTool || "",
      mission: agentState.mission || "",
      missionClosed: !!agentState.missionClosed,
      compactionSummary: agentState.compactionSummary || "",
      wave: agentState.wave || 0,
    }));
    // Integrated conversation for the model (same turns user sees), sans system prompt
    try {
      const hist = (agentHistory || []).filter((m) => m && m.role !== "system").slice(-48);
      localStorage.setItem(AGENT_HISTORY_KEY, JSON.stringify(hist));
    } catch (_) {}
    try { if (typeof saveCurrentSession === "function") saveCurrentSession({ checkpoint: true }); } catch (_) {}
  } catch (_) {}
}

function restoreAgentChat() {
  try {
    const raw = localStorage.getItem(AGENT_CHAT_KEY);
    if (!raw) return;
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows) || !rows.length) return;
    const hasChat = (rows || []).some((r) => r && (String(r.kind||"").includes("user") || String(r.kind||"").includes("ai")));
    const w = document.getElementById("welcome");
    if (w && hasChat) { w.classList.add("hide"); w.classList.remove("show", "on"); }
    for (const r of rows.slice(-80)) {
      if (!r || r.text == null) continue;
      let kind = r.kind || "sys";
      // DOM class may be "tool-run streaming" etc.
      if (kind.includes("tool-run") || kind === "tool") kind = "tool-run";
      else if (kind.includes("tool-out")) kind = "tool-out";
      else if (kind.includes("thought")) kind = "thought";
      else if (kind.includes("turn-foot")) kind = "turn-foot";
      else if (kind.includes("user")) kind = "user";
      else if (kind.includes("err")) kind = "err";
      else if (kind.includes("ai")) kind = "ai";
      appendMsg(String(r.text), kind);
    }
  } catch (_) {}
  try {
    const st = JSON.parse(localStorage.getItem(AGENT_STATE_KEY) || "null");
    if (st && typeof st === "object") {
      if (Array.isArray(st.todos)) agentState.todos = st.todos;
      if (st.plan) agentState.plan = st.plan;
      if (st.ledger) agentState.ledger = { ...agentState.ledger, ...st.ledger };
      if (Array.isArray(st.memories)) agentState.memories = st.memories;
      if (st.lastThinking) agentState.lastThinking = st.lastThinking;
      if (st.lastTool) agentState.lastTool = st.lastTool;
      if (st.mission) agentState.mission = st.mission;
      if (st.missionClosed != null) agentState.missionClosed = !!st.missionClosed;
      if (st.compactionSummary) agentState.compactionSummary = st.compactionSummary;
      if (st.wave != null) agentState.wave = st.wave || 0;
    }
  } catch (_) {}
  try {
    const hr = JSON.parse(localStorage.getItem(AGENT_HISTORY_KEY) || "null");
    if (Array.isArray(hr) && hr.length) {
      agentHistory = hr.filter((m) => m && m.role && m.role !== "system");
    }
  } catch (_) {}
}

/**
 * @param {boolean} on
 * @param {string} [text]
 */
function setRunningUI(on, text) {
  const ab = document.getElementById("abortBtn");
  if (ab) {
    ab.style.display = on ? "inline-block" : "none";
    ab.classList.toggle("on", !!on);
  }
  if (!on) syncIndicators({ phase: "idle", tool: "", detail: "" });
  else {
    const s = String(text || "thinking").replace(/\.\.\./g, "");
    if (/think/i.test(s)) syncIndicators({ phase: "thinking", tool: "" });
    else if (/stream/i.test(s)) syncIndicators({ phase: "streaming", tool: "" });
    else syncIndicators({ phase: "tool", tool: s.slice(0, 48) });
  }
}

function requestAgentStop() {
  agentAbort = true;
  try { agentAbortController?.abort(); } catch (_) {}
  setStatusFooter("stopping...");
  setRunningUI(true, "stopping...");
}


/**
 * OpenAI-compatible SSE stream — mirrors GoarClient.chatStream / executeChatStream.
 * Collects content, reasoning/thinking, and streamed tool_calls; falls back to non-stream.
 */
/** @returns {Promise<ChatStreamResult>} */
