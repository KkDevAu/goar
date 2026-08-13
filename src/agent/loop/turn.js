/**
 * Agent turn — ADK-inspired seamless multi-wave loop.
 *
 * Continuity model (google/adk-python):
 *  - Session state holds sticky mission + rolling compaction summary
 *  - Token pressure → compact older events (do NOT wipe / do NOT block tools)
 *  - Wave boundaries auto-continue same mission without context reset
 */
async function agentTurn(userText) {
  if (agentBusy) {
    try {
      window.__GOAR_PENDING_TURN = String(userText || "");
      if (typeof appendMsg === "function") appendMsg("Queued — will run when the current step finishes.", "sys");
    } catch (_) {}
    return;
  }
  agentBusy = true;
  agentAbort = false;
  agentAbortController = new AbortController();
  // Fingerprints are telemetry only (never used to ban tools)
  recentToolFingerprints = [];
  pathActionCounts = Object.create(null);
  agentTurn._loopSteps = 0;
  if (agentEl.send) agentEl.send.disabled = true;
  const t0 = performance.now();
  let toolCount = 0;
  let step = 0;
  let lastUsage = null;
  let waves = 0;
  const stepsPerWave = (typeof VIBE_RUNTIME !== "undefined" && VIBE_RUNTIME.stepsPerWave)
    || (typeof GOAR_COMPACTION !== "undefined" && GOAR_COMPACTION.stepsPerWave) || 24;
  const maxWaves = (typeof VIBE_RUNTIME !== "undefined" && VIBE_RUNTIME.maxWaves)
    || (typeof GOAR_COMPACTION !== "undefined" && GOAR_COMPACTION.maxWaves) || 240;
  let stepBudget = stepsPerWave;
  let quietStops = 0;

  setRunningUI(true, "thinking...");
  if (typeof setStatusFooter === "function") setStatusFooter("working...");
  if (typeof agentSetPill === "function") agentSetPill("working...");
  try {
    // Sticky original request — ADK session state, not dropped by compaction
    if (typeof pinMission === "function") pinMission(userText);
    if (typeof agentState !== "undefined") agentState.wave = 0;

    try { await loadPysecCatalog(); } catch (_) {}
    try {
      if (typeof ensureSystemPlanes === "function") await ensureSystemPlanes();
      else {
        if (typeof ensurePysecWorker === "function") await ensurePysecWorker();
        if (typeof ensurePysecNetwork === "function") await ensurePysecNetwork();
      }
    } catch (_) {}
    try { refreshAgentTools(); } catch (_) {}

    const hasFullCatalog =
      !!(agentHistory[0] && agentHistory[0].role === "system" &&
        typeof agentHistory[0].content === "string" &&
        agentHistory[0].content.indexOf("### CATALOG n=") !== -1);

    const buildSysCore = () => {
      if (typeof buildVibeSystemPrompt === "function") return buildVibeSystemPrompt();
      if (typeof buildIntegratedSystemCore === "function") return buildIntegratedSystemCore();
      const stateCtx = typeof getStateContext === "function" ? getStateContext() : "";
      const missionExtra = typeof missionContextBlock === "function" ? missionContextBlock() : "";
      return (
        OPERATOR_CORE + "\n\n" +
        (typeof systemPlaneBlurb === "function" ? systemPlaneBlurb() + "\n\n" : "") +
        (typeof sandboxStatusBlurb === "function" ? sandboxStatusBlurb() : "") +
        (stateCtx ? "\n\n## SESSION STATE\n" + stateCtx : "") +
        missionExtra +
        "\n## INTERLOCK\n" +
        "Do the job. Explore = workspace_tree. Never list tools. Same mission after compact.\n"
      );
    };

    const refreshSystem = () => {
      const sysCore = buildSysCore();
      if (!agentHistory.length) {
        agentHistory.push({ role: "system", content: sysCore + pysecCatalogBlurb({ full: false }) });
      } else if (agentHistory[0] && agentHistory[0].role === "system") {
        agentHistory[0].content = sysCore + pysecCatalogBlurb({ full: false });
      } else {
        agentHistory.unshift({ role: "system", content: sysCore + pysecCatalogBlurb({ full: false }) });
      }
    };

    try { if (typeof ensureScratchpad === "function") await ensureScratchpad(); } catch (_) {}
    refreshSystem();
    agentHistory.push({ role: "user", content: userText });
    if (typeof maybeCompactAgentHistoryAsync === "function") await maybeCompactAgentHistoryAsync({ force: false });
    else if (typeof maybeCompactAgentHistory === "function") maybeCompactAgentHistory({ force: false });
    else if (typeof trimAgentHistory === "function") trimAgentHistory();

    let finishedClean = false;

    step = -1;
    while (!agentAbort) {
      step++;
      if (step >= stepBudget && waves + 1 >= maxWaves) break;

      if (agentAbort) {
        appendMsg("Stopped.", "sys");
        break;
      }

      if (typeof runVibeBeforeTurn === "function") {
        const mw = await runVibeBeforeTurn();
        if (mw && mw.action === "stop") {
          appendMsg("Stopped.", "sys");
          break;
        }
        if (mw && mw.action === "compact") {
          if (typeof maybeCompactAgentHistoryAsync === "function") {
            await maybeCompactAgentHistoryAsync({ force: true, lastUsage });
          } else if (typeof maybeCompactAgentHistory === "function") {
            maybeCompactAgentHistory({ force: true, lastUsage });
          }
          refreshSystem();
        }
        if (mw && mw.action === "inject" && mw.message) {
          agentHistory.push({ role: "user", content: mw.message });
        }
      }

      // Before each model call: compact if over token threshold (ADK CompactionRequestProcessor)
      if (typeof maybeCompactAgentHistoryAsync === "function") {
        const c = await maybeCompactAgentHistoryAsync({ lastUsage });
        if (c && c.compacted) refreshSystem();
      } else if (typeof maybeCompactAgentHistory === "function") {
        const c = maybeCompactAgentHistory({ lastUsage });
        if (c && c.compacted) refreshSystem();
      }

      setRunningUI(true, step === 0 && waves === 0 ? "thinking" : ("step " + (step + 1) + (waves ? " · wave " + (waves + 1) : "")));
      try {
        syncIndicators({
          phase: step === 0 && waves === 0 ? "thinking" : "tool",
          tool: step ? ("step " + (step + 1)) : "",
          detail: waves ? ("wave " + (waves + 1)) : "",
        });
      } catch (_) {}
      if (typeof setStatusFooter === "function") {
        setStatusFooter(
          step === 0 && waves === 0
            ? "thinking..."
            : ("step " + (step + 1) + (waves ? " · wave " + (waves + 1) : ""))
        );
      }

      let thinkRef = null;
      let aiRef = null;
      let thinkingFull = "";
      let textFull = "";

      let result;
      try {
        const call = () => openaiChatStream({
        messages: agentHistory,
        tools: getAgentTools(),
        signal: agentAbortController.signal,
        onThinkingDelta: (piece, full) => {
          thinkingFull = collapseDoubledWords(full);
          if (!thinkRef) thinkRef = beginStreamMsg("thought");
          streamDelta(thinkRef, thinkingFull);
          try { syncIndicators({ phase: "thinking" }); } catch (_) {}
        },
        onTextDelta: (piece, full) => {
          textFull = collapseDoubledWords(full);
          if (!aiRef) aiRef = beginStreamMsg("ai");
          streamDelta(aiRef, textFull);
          try { syncIndicators({ phase: "streaming" }); } catch (_) {}
        },
      });
        result = typeof vibeCallModel === "function" ? await vibeCallModel(call, { lastUsage }) : await call();
      } catch (e) {
        const msg = String(e && e.message ? e.message : e);
        if (/context.?too.?long|maximum context|prompt is too long|reduce the length/i.test(msg)) {
          if (typeof maybeCompactAgentHistoryAsync === "function") {
            await maybeCompactAgentHistoryAsync({ force: true, lastUsage });
          } else if (typeof maybeCompactAgentHistory === "function") {
            maybeCompactAgentHistory({ force: true });
          }
          refreshSystem();
          continue;
        }
        throw e;
      }

      endStreamMsg(thinkRef);
      endStreamMsg(aiRef);

      if (agentAbort) {
        appendMsg("Stopped.", "sys");
        break;
      }

      const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
      const finish = result.finish_reason || "";
      const content = collapseDoubledWords(result.text || textFull || "");
      const thinking = collapseDoubledWords(result.thinking || thinkingFull || "");
      if (result.usage) {
        lastUsage = result.usage;
        accumulateUsage(result.usage);
      }

      if (thinking && thinking.trim() && !thinkRef) {
        appendMsg(thinking.trim(), "thought");
      }

      if (toolCalls.length || finish === "tool_calls") {
        if (content && content.trim() && !aiRef) {
          appendMsg(content.trim().slice(0, 800), "thought");
        }
        if (aiRef && !(content && content.trim())) {
          try { aiRef.el.remove(); } catch (_) {}
        }

        agentHistory.push({
          role: "assistant",
          content: content || null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: tc.type || "function",
            function: {
              name: tc.function?.name || "",
              arguments: typeof tc.function?.arguments === "string"
                ? tc.function.arguments
                : JSON.stringify(tc.function?.arguments || {}),
            },
          })),
        });
        try {
          if (thinking && typeof agentState !== "undefined") {
            agentState.lastThinking = thinking.slice(0, 4000);
          }
        } catch (_) {}

        const names = toolCalls.map((tc) => tc.function?.name || "");
        const allSafe = names.every((n) =>
          /^(read_file|list_dir|glob|grep|env_info|think|todo|recall_memory|web_search|web_fetch|kit_status|workspace_tree|py_check|net_diag|set_phase|proxy\.status|hash\.|codec\.|password\.|jwt\.inspect)$/.test(n)
        );

        const runOne = async (tc) => {
          if (agentAbort) return { tc, name: "", result: "aborted" };
          const name = tc.function?.name || "";
          if (!name) return { tc, name: "", result: "error: empty tool name" };
          let args = {};
          try {
            const rawArgs = tc.function?.arguments;
            args = typeof rawArgs === "string" ? JSON.parse(rawArgs || "{}") : (rawArgs || {});
          } catch (_) { args = {}; }

          // Telemetry only — never block tool execution
          try {
            const loopInfo = typeof detectToolLoop === "function" ? detectToolLoop(name, args) : null;
            if (loopInfo && loopInfo.warn && !runOne._warned) {
              runOne._warned = true;
              // soft note only; tools still run
            }
          } catch (_) {}

          let summary = name;
          if (name === "bash") summary = "bash  " + String(args.command || "").slice(0, 100);
          else if (name === "write_file") summary = "write  " + (args.path || "");
          else if (name === "read_file") summary = "read  " + (args.path || "");
          else if (name === "edit_file") summary = "edit  " + (args.path || "");
          else if (name === "python_exec") summary = "python  " + String(args.path || "inline").slice(0, 80);
          else if (name === "pysec") summary = "pysec  " + String(args.tool_id || args.toolId || "").slice(0, 80);
          else if (name === "guest_http") summary = "guest_http  " + String(args.url || "").slice(0, 80);
          else if (name === "todo") summary = "todo  " + (args.action || "list");
          else if (name === "create_plan") summary = "plan  " + String(args.goal || "").slice(0, 80);
          else if (name === "think") summary = "think";
          else if (name === "complete_task") summary = "done  " + String(args.summary || "").slice(0, 80);
          else if (name === "set_phase") summary = "phase  " + String(args.phase || "");
          else if (name === "micropip_install") summary = "micropip  " + String(args.package || "");
          else if (name === "create_tool") summary = "create_tool  " + String(args.name || "");
          else if (name === "kit") summary = "kit  " + String(args.action || args.tool || "").slice(0, 80);
          else if (String(name).indexOf("pysec") === 0) summary = name + "  " + String(args.tool || args.tool_id || "").slice(0, 80);
          else summary = name;

          appendMsg(summary, "tool-run");
          toolCount++;
          try { syncIndicators({ phase: "tool", tool: name }); } catch (_) {}
          if (typeof agentState !== "undefined") agentState.lastTool = name;
          if (typeof setStatusFooter === "function") setStatusFooter("* " + name + "  step " + (step + 1));
          setRunningUI(true, name + "...");

          let out = "";
          try {
            if (typeof applyInferredPhase === "function") applyInferredPhase(name, args);
            let runArgs = args;
            if (typeof runVibePreTool === "function") {
              const pre = await runVibePreTool(name, args);
              if (pre && pre.deny) {
                out = "hook deny: " + (pre.reason || "denied");
              } else if (pre && pre.args) {
                runArgs = pre.args;
              }
            }
            if (!out) out = String(await runAgentTool(name, runArgs));
            if (typeof runVibePostTool === "function") out = await runVibePostTool(name, runArgs, out);
            if (typeof enrichToolResult === "function") out = enrichToolResult(name, runArgs, out);
          } catch (e) {
            out = "tool error: " + e.message;
            if (typeof enrichToolResult === "function") out = enrichToolResult(name, args, out);
          }

          const preview = out.split("\n").slice(0, 120).join("\n").slice(0, 50000);
          if (preview.trim()) appendMsg(preview, "tool-out");
          // Store compact form in model history (ADK caps tool content in context)
          const forModel = typeof compactToolResult === "function" ? compactToolResult(out) : out;
          return { tc, name, result: forModel };
        };

        let results;
        if (allSafe && toolCalls.length > 1) {
          results = await Promise.all(toolCalls.map(runOne));
        } else {
          results = [];
          for (const tc of toolCalls) results.push(await runOne(tc));
        }

        let completed = false;
        for (const row of results) {
          const { tc, name, result: toolResult } = row;
          agentHistory.push({
            role: "tool",
            tool_call_id: tc.id,
            name: name,
            content: String(toolResult == null ? "" : toolResult),
          });
          if (name === "complete_task") completed = true;
        }
        quietStops = 0;
        if (completed) {
          if (typeof agentState !== "undefined") agentState.missionClosed = true;
          appendMsg("Task closed.", "sys");
          finishedClean = true;
          break;
        }

        // Compact after tool fan-in if prompt grew
        if (typeof maybeCompactAgentHistoryAsync === "function") {
          const c2 = await maybeCompactAgentHistoryAsync({ lastUsage });
          if (c2 && c2.compacted) refreshSystem();
        } else if (typeof maybeCompactAgentHistory === "function") {
          const c2 = maybeCompactAgentHistory({ lastUsage });
          if (c2 && c2.compacted) refreshSystem();
        } else if (typeof trimAgentHistory === "function") {
          trimAgentHistory();
        }
        try { persistAgentChat(); } catch (_) {}

        // Seamless multi-wave: extend budget instead of context-reset stop
        if (step >= stepBudget - 1 && waves + 1 < maxWaves) {
          waves++;
          if (typeof agentState !== "undefined") agentState.wave = waves;
          stepBudget += stepsPerWave;
          // Force a compaction at wave boundary so next wave starts lean but continuous
          if (typeof maybeCompactAgentHistoryAsync === "function") {
            await maybeCompactAgentHistoryAsync({ force: true, lastUsage, useLlm: true });
          } else if (typeof maybeCompactAgentHistory === "function") {
            maybeCompactAgentHistory({ force: true, lastUsage });
          }
          refreshSystem();
          agentHistory.push({
            role: "user",
            content:
              "[continuity] Wave " + (waves + 1) + " of the same mission. " +
              "Older tool transcript was compacted into ROLLING CONTEXT. " +
              "Continue the PRIMARY USER REQUEST — do not restart. Tools stay available.",
            _compaction: true,
          });
          try {
            appendMsg("wave " + (waves + 1) + " · same mission (context compacted, not reset)", "sys");
          } catch (_) {}
        }
        continue;
      }

      // Final assistant message (no tools) — natural end of this turn
      if (content && content.trim()) {
        if (!aiRef) appendMsg(content, "ai");
        agentHistory.push({ role: "assistant", content });
      } else if (!thinking) {
        appendMsg("(no content)", "sys");
      } else {
        agentHistory.push({ role: "assistant", content: "" });
      }
      if (typeof runVibePostAgent === "function") {
        const retry = await runVibePostAgent({ content: content, step: step });
        if (retry) {
          agentHistory.push({ role: "user", content: retry, _vibe: true });
          continue;
        }
      }
      quietStops++;
      if (typeof vibeShouldKeepGoing === "function" && vibeShouldKeepGoing({
        content: content, toolCount: toolCount, step: step, quiet: quietStops
      })) {
        agentHistory.push({
          role: "user",
          content: (typeof vibeContinueMessage === "function" ? vibeContinueMessage() : "Continue the same mission. Use tools."),
          _vibe: true,
        });
        continue;
      }
      finishedClean = true;
      break;
    }

    // Hit max waves with tools still open: one text wrap-up that keeps mission, not a hard amnesia
    if (!finishedClean && !agentAbort) {
      try {
        if (typeof maybeCompactAgentHistoryAsync === "function") {
          await maybeCompactAgentHistoryAsync({ force: true, lastUsage, useLlm: true });
          refreshSystem();
        } else if (typeof maybeCompactAgentHistory === "function") {
          maybeCompactAgentHistory({ force: true, lastUsage });
          refreshSystem();
        }
        agentHistory.push({
          role: "user",
          content:
            "[continuity] Step budget reached for this session slice. " +
            "Using ROLLING CONTEXT + MISSION, give the best current status and what remains. " +
            "Tools will be available again on the next user message — do not invent a reset.",
        });
        let stopRef = null;
        const last = await openaiChatStream({
          messages: agentHistory,
          tools: [],
          includeTools: false,
          signal: agentAbortController.signal,
          onTextDelta: (piece, full) => {
            if (!stopRef) stopRef = beginStreamMsg("ai");
            streamDelta(stopRef, collapseDoubledWords(full));
          },
        });
        endStreamMsg(stopRef);
        const finalText = collapseDoubledWords((last && last.text) || "");
        if (finalText.trim()) {
          if (!stopRef) appendMsg(finalText, "ai");
          agentHistory.push({ role: "assistant", content: finalText });
        }
      } catch (_) {}
    }
  } catch (e) {
    if (agentAbort || (e && e.name === "AbortError")) {
      appendMsg("Stopped.", "sys");
    } else {
      appendMsg(String(e.message || e), "err");
    }
  } finally {
    agentBusy = false;
    agentAbort = false;
    agentAbortController = null;
    if (agentEl.send) agentEl.send.disabled = false;
    agentEl.input?.focus();
    setRunningUI(false, "");
    const ms = Math.round(performance.now() - t0);
    if (typeof agentState !== "undefined") agentState.turnMs = ms;
    let foot = "turn " + (ms / 1000).toFixed(1) + "s";
    if (toolCount) foot += "  |  " + toolCount + " tool" + (toolCount === 1 ? "" : "s");
    if (step) foot += "  |  " + (step + 1) + " step" + ((step + 1) === 1 ? "" : "s");
    if (waves) foot += "  |  " + (waves + 1) + " wave" + ((waves + 1) === 1 ? "" : "s");
    if (lastUsage) {
      const pt = lastUsage.prompt_tokens || lastUsage.promptTokens || 0;
      const ct = lastUsage.completion_tokens || lastUsage.completionTokens || 0;
      const tt = lastUsage.total_tokens || lastUsage.totalTokens || (pt + ct);
      if (tt || pt || ct) foot += "  |  tokens " + (tt || (pt + ct));
    }
    if (typeof agentState !== "undefined" && agentState.todos && agentState.todos.length) {
      foot += "  |  todo " + agentState.todos.filter((x) => x.done).length + "/" + agentState.todos.length;
    }
    appendMsg(foot, "turn-foot");
    if (typeof setStatusFooter === "function") setStatusFooter(foot);
    if (typeof refreshAgentPill === "function") refreshAgentPill();
    try { persistAgentChat(); } catch (_) {}
    // Drain one queued user message (logical continuous chat)
    try {
      const pending = window.__GOAR_PENDING_TURN;
      window.__GOAR_PENDING_TURN = "";
      if (pending && String(pending).trim()) {
        setTimeout(() => {
          try { agentTurn(String(pending)); } catch (_) {}
        }, 40);
      }
    } catch (_) {}
  }
}
