async function openaiChatStream({
  messages,
  tools,
  includeTools = true,
  signal = null,
  onTextDelta = null,
  onThinkingDelta = null,
}) {
  const s = settingsSnapshot();
  const provider = s.provider || detectProvider(s.apiBase);
  const base = normalizeApiBase(s.apiBase || DEFAULTS.apiBase, provider);
  const url = chatCompletionsUrl(base, provider);
  const model = (s.apiModel || DEFAULTS.apiModel || "").trim();
  if (!model) throw new Error("No model configured — open Settings and pick a model.");
  if ((getProvider(provider)?.requiresApiKey) && !(s.apiKey || "").trim() && !getProvider(provider)?.supportsOptionalApiKey) {
    throw new Error("No API key — open Settings and paste your key.");
  }
  const body = {
    model,
    messages: (typeof sanitizeMessagesForApi === "function" ? sanitizeMessagesForApi(messages) : messages),
    temperature: Number(s.temperature != null ? s.temperature : DEFAULTS.temperature) || 0.3,
    max_tokens: Number(s.maxTokens != null ? s.maxTokens : DEFAULTS.maxTokens) || 8192,
    stream: true,
  };
  if (includeTools && tools && tools.length) {
    body.tools = tools;
    body.tool_choice = "auto";
    if (/openrouter|openai|groq|nvidia|together|deepseek|fireworks|deepinfra/i.test(base + provider)) {
      body.parallel_tool_calls = false;
    }
  }
  const headers = authHeaders(s.apiKey, base, provider);
  headers["Accept"] = "text/event-stream";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 300000);
  const onParentAbort = () => { try { ctrl.abort(); } catch (_) {} };
  if (signal) signal.addEventListener("abort", onParentAbort, { once: true });

  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onParentAbort);
    // fallback non-stream
    const data = await openaiChat({ messages, tools, stream: false, includeTools, signal });
    return normalizeChatResultFromJson(data, onTextDelta, onThinkingDelta);
  }

  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  if (!resp.ok || (!ct.includes("text/event-stream") && !ct.includes("json"))) {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onParentAbort);
    // try parse error then fallback
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      // auth hard-fail
      if (resp.status === 401 || resp.status === 403) {
        throw new Error("Auth failed (" + resp.status + "): " + errText.slice(0, 200));
      }
    }
    try {
      const data = await openaiChat({ messages, tools, stream: false, includeTools, signal });
      return normalizeChatResultFromJson(data, onTextDelta, onThinkingDelta);
    } catch (e2) {
      throw e2;
    }
  }

  // If provider returned full JSON despite stream:true
  if (ct.includes("application/json") && !ct.includes("event-stream")) {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onParentAbort);
    const data = await resp.json();
    return normalizeChatResultFromJson(data, onTextDelta, onThinkingDelta);
  }

  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let thinking = "";
  const toolAcc = new Map(); // index -> { id, name, arguments }
  let finish = "";
  let usage = null;

  try {
    while (true) {
      if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() || "";
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        let obj;
        try { obj = JSON.parse(payload); } catch (_) { continue; }
        if (obj.usage) usage = obj.usage;
        const choice = obj.choices && obj.choices[0];
        if (!choice) continue;
        if (choice.finish_reason) finish = choice.finish_reason;
        // Some providers put full message mid-stream
        const delta = choice.delta || choice.message || {};
        // text (string or content-array parts — OpenAI compatible)
        let piece = null;
        if (typeof delta.content === "string") piece = delta.content;
        else if (Array.isArray(delta.content)) {
          piece = delta.content.map((p) => {
            if (typeof p === "string") return p;
            if (p && typeof p.text === "string") return p.text;
            if (p && p.type === "text" && typeof p.text === "string") return p.text;
            return "";
          }).join("");
        } else if (typeof choice.text === "string") piece = choice.text;
        if (piece) {
          // cumulative snapshot vs token delta
          if (text && piece.startsWith(text) && piece.length > text.length) {
            text = piece;
          } else if (text && text.startsWith(piece) && piece.length < text.length) {
            // ignore
          } else {
            text += piece;
          }
          text = collapseDoubledWords(text);
          if (onTextDelta) onTextDelta(piece, text);
        }
        // thinking / reasoning — take FIRST non-empty field only (avoids TheThe doubles)
        {
          let th = "";
          for (const key of ["reasoning_content", "thinking", "reasoning", "reasoning_text"]) {
            let v = delta[key];
            if (v && typeof v === "object") {
              if (typeof v.content === "string") v = v.content;
              else if (typeof v.text === "string") v = v.text;
              else v = "";
            }
            if (typeof v === "string" && v.length) { th = v; break; }
          }
          if (!th && Array.isArray(delta.reasoning_details) && delta.reasoning_details.length) {
            th = delta.reasoning_details.map((rd) => (rd && (rd.text || rd.content || rd.summary)) || "").join("");
          }
          if (th) {
            // If provider sends cumulative full thinking, replace; if delta, append
            if (thinking && th.startsWith(thinking)) {
              thinking = th;
            } else if (thinking && thinking.startsWith(th)) {
              // ignore smaller snapshot
            } else {
              thinking += th;
            }
            thinking = collapseDoubledWords(thinking);
            if (onThinkingDelta) onThinkingDelta(th, thinking);
          }
        }
        // tool_calls streamed
        const tcs = delta.tool_calls;
        if (Array.isArray(tcs)) {
          for (const tc of tcs) {
            const idx = tc.index != null ? tc.index : 0;
            let acc = toolAcc.get(idx);
            if (!acc) {
              acc = { id: tc.id || ("call_" + idx), name: "", arguments: "" };
              toolAcc.set(idx, acc);
            }
            if (tc.id) acc.id = tc.id;
            const fn = tc.function || {};
            if (fn.name) acc.name = fn.name;
            if (typeof fn.arguments === "string") acc.arguments += fn.arguments;
          }
        }
      }
    }
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onParentAbort);
    try { reader.releaseLock(); } catch (_) {}
  }

  const toolCalls = [...toolAcc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => ({
      id: v.id,
      type: "function",
      function: { name: v.name, arguments: v.arguments || "{}" },
    }))
    .filter((tc) => tc.function.name);

  return {
    text,
    thinking,
    toolCalls,
    finish_reason: finish || (toolCalls.length ? "tool_calls" : "stop"),
    usage,
    raw: null,
  };
}

function normalizeChatResultFromJson(data, onTextDelta, onThinkingDelta) {
  const msg = data?.choices?.[0]?.message || {};
  const text = msg.content || "";
  let thinking =
    msg.reasoning_content ||
    msg.thinking ||
    (typeof msg.reasoning === "string" ? msg.reasoning : null) ||
    (msg.reasoning && msg.reasoning.content) ||
    "";
  if (thinking && onThinkingDelta) onThinkingDelta(thinking, thinking);
  if (text && onTextDelta) onTextDelta(text, text);
  const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  return {
    text,
    thinking: thinking || "",
    toolCalls,
    finish_reason: data?.choices?.[0]?.finish_reason || (toolCalls.length ? "tool_calls" : "stop"),
    usage: data?.usage || null,
    raw: data,
  };
}


