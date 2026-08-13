function setProgress(n, msg, detail) {
  if (n != null && !Number.isNaN(n)) {
    const p = Math.max(0, Math.min(100, Math.round(n)));
    if (el.bar) el.bar.style.width = p + "%";
    if (el.pct) el.pct.textContent = p + "%";
    try { document.getElementById("bootPhase")?.style.setProperty("--pct", p + "%"); } catch (_) {}
  }
  if (msg && el.step) el.step.textContent = msg;
  if (detail != null && el.detail) el.detail.textContent = detail;
}

function reflectActiveModel(model, provider) {
  let m = (model || "").trim();
  let p = (provider || "").trim();
  try {
    const s = typeof settingsSnapshot === "function" ? settingsSnapshot() : {};
    if (!m) m = (s.apiModel || "").trim();
    if (!p) p = (s.provider || "").trim();
  } catch (_) {}
  const applySel = (sel) => {
    if (!sel || !m) return;
    if (sel.tagName === "SELECT") {
      if (![...sel.options].some((o) => o.value === m)) {
        const o = document.createElement("option");
        o.value = m;
        o.textContent = m;
        sel.appendChild(o);
      }
      sel.value = m;
    } else {
      sel.value = m;
    }
  };
  applySel(document.getElementById("credModel"));
  applySel(document.getElementById("model-input"));
  applySel(document.getElementById("apiModel"));
  const am = document.getElementById("active-model");
  if (am) am.textContent = m ? (p ? p + " · " + m : m) : "";
  const dm = document.getElementById("drawer-model");
  if (dm) dm.textContent = m ? (p ? p + " · " + m : m) : "auto";
  try { if (typeof syncIndicators === "function") syncIndicators({ model: m }); } catch (_) {}
}

/** @param {string} key @param {'wait'|'run'|'ok'|'err'} state @param {string} [st] */
function bootItem(key, state, st) {
  try {
    const li = document.querySelector('#bootList li[data-key="' + key + '"]');
    if (!li) return;
    li.dataset.state = state || "wait";
    const s = li.querySelector(".st");
    if (s) s.textContent = st != null ? st : (state === "ok" ? "ok" : state === "run" ? "…" : state === "err" ? "fail" : "—");
  } catch (_) {}
}

function fillProviderSelect(sel, selected) {
  if (!sel) return;
  const list = (typeof SERVICE_PROVIDERS !== "undefined" && SERVICE_PROVIDERS) || [];
  const cur = selected || sel.value || "";
  sel.innerHTML = "";
  list.forEach((p) => {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.displayName || p.id;
    sel.appendChild(o);
  });
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

function setCredReady(ok, msg) {
  const st = document.getElementById("credStatus");
  const go = document.getElementById("credGo");
  if (st) {
    st.textContent = msg || "";
    st.classList.toggle("ok", !!ok);
    st.classList.toggle("err", !ok && !!msg);
  }
  if (go) go.disabled = !ok;
}

function showCredPhase() {
  if (typeof goarMotion !== "undefined" && goarMotion.toCred) {
    goarMotion.toCred();
  } else {
    const bp = document.getElementById("bootPhase");
    const cp = document.getElementById("credPhase");
    if (bp) {
      bp.hidden = true;
      bp.style.display = "none";
    }
    if (cp) {
      cp.hidden = false;
      cp.classList.add("on");
    }
  }
  try {
    const s = settingsSnapshot();
    const p = document.getElementById("credProvider");
    const k = document.getElementById("credKey");
    const b = document.getElementById("credBase");
    fillProviderSelect(p, s.provider || detectProvider(s.apiBase) || "openrouter");
    fillProviderSelect(document.getElementById("provider-select"), s.provider);
    if (k) {
      k.value = s.apiKey || "";
      const prov = getProvider(p && p.value);
      if (prov && k) k.placeholder = prov.placeholder || "Paste API key";
    }
    if (b) b.value = s.apiBase || "";
    applyCredProvider();
    if (s.apiKey || (p && p.value === "ollama")) {
      loadModelsInto(document.getElementById("credModel"), {
        provider: (p && p.value) || s.provider,
        apiBase: (b && b.value) || s.apiBase,
        apiKey: (k && k.value) || s.apiKey,
        apiModel: s.apiModel || "",
      }).catch(() => {});
    } else {
      setCredReady(false, "Paste a key to list models");
    }
  } catch (e) {
    console.warn("[goar] showCredPhase", e);
  }
}

function applyCredProvider() {
  const p = document.getElementById("credProvider");
  const b = document.getElementById("credBase");
  const k = document.getElementById("credKey");
  const wrap = document.getElementById("credBaseWrap");
  if (!p) return;
  const prov = getProvider(p.value);
  const custom = !!(prov && (prov.isCustom || prov.id === "openai-compatible"));
  if (prov && b && (!b.value || b.dataset.auto !== "0")) {
    b.value = prov.apiBase || "";
    b.dataset.auto = "1";
  }
  if (b) b.readOnly = !custom && !!(prov && prov.apiBase);
  if (wrap) wrap.style.display = custom || !(prov && prov.apiBase) ? "" : "none";
  if (k && prov) k.placeholder = prov.placeholder || "Paste API key";
}

/**
 * Load GET /models into a <select>. Live list only — no static catalog.
 */
async function loadModelsInto(sel, s) {
  s = s || {};
  const st = document.getElementById("credStatus");
  if (!sel) return [];
  sel.innerHTML = "";
  const loading = document.createElement("option");
  loading.value = "";
  loading.textContent = "Loading models…";
  sel.appendChild(loading);
  setCredReady(false, "querying /models…");
  try {
    const ids = await fetchModels({
      provider: s.provider,
      apiBase: s.apiBase,
      apiKey: s.apiKey,
    });
    liveModels = ids;
    sel.innerHTML = "";
    if (!ids.length) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "No models returned";
      sel.appendChild(o);
      setCredReady(false, "key accepted but /models was empty");
      return ids;
    }
    const prefer = s.apiModel && ids.includes(s.apiModel) ? s.apiModel : ids[0];
    ids.forEach((id) => {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = id;
      if (id === prefer) o.selected = true;
      sel.appendChild(o);
    });
    try { fillModelSelect(ids, prefer, "live"); } catch (_) {}
    syncInAppProviderBar(s.provider, s.apiKey, prefer, ids);
    reflectActiveModel(prefer, s.provider);
    setCredReady(true, ids.length + " models · key valid");
    return ids;
  } catch (e) {
    sel.innerHTML = "";
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "Failed — check key / provider";
    sel.appendChild(o);
    setCredReady(false, "models: " + (e.message || e));
    throw e;
  }
}

function syncInAppProviderBar(provider, apiKey, apiModel, ids) {
  try {
    const sel = document.getElementById("provider-select");
    const token = document.getElementById("token-input");
    const model = document.getElementById("model-input");
    const status = document.getElementById("provider-status");
    fillProviderSelect(sel, provider);
    if (token && apiKey != null) token.value = apiKey;
    if (model) {
      if (model.tagName === "SELECT") {
        const list = ids || liveModels || [];
        model.innerHTML = "";
        if (!list.length) {
          const o = document.createElement("option");
          o.value = apiModel || "";
          o.textContent = apiModel || "models load after key…";
          model.appendChild(o);
        } else {
          list.forEach((id) => {
            const o = document.createElement("option");
            o.value = id;
            o.textContent = id;
            if (id === apiModel) o.selected = true;
            model.appendChild(o);
          });
        }
      } else if (apiModel) {
        model.value = apiModel;
      }
    }
    if (status) {
      status.textContent = apiKey ? ((ids && ids.length ? ids.length + " models" : "key set")) : "no key";
      status.classList.toggle("ok", !!apiKey);
    }
  } catch (_) {}
}

async function enterChatFromCreds() {
  const p = document.getElementById("credProvider");
  const k = document.getElementById("credKey");
  const b = document.getElementById("credBase");
  const m = document.getElementById("credModel");
  const provider = (p && p.value) || "";
  const prov = getProvider(provider);
  let apiBase = ((b && b.value) || "").trim() || (prov && prov.apiBase) || "";
  apiBase = normalizeApiBase(apiBase, provider);
  const apiKey = ((k && k.value) || "").trim();
  let apiModel = ((m && m.value) || "").trim();
  if (!provider) {
    setCredReady(false, "Pick a provider");
    return;
  }
  if (!apiKey && prov && prov.requiresApiKey !== false && provider !== "ollama") {
    setCredReady(false, "API key required");
    return;
  }
  if (!apiModel) {
    setCredReady(false, "No model — wait for /models or pick one");
    return;
  }
  // Re-verify live list; never fall back to a hardcoded id
  setCredReady(false, "Verifying /models…");
  try {
    const ids = await loadModelsInto(m, { provider, apiBase, apiKey, apiModel });
    apiModel = ((m && m.value) || "").trim();
    if (!apiModel || !ids.includes(apiModel)) {
      setCredReady(false, "Model must come from live /models");
      return;
    }
  } catch (_) {
    return;
  }
  saveSettings({ provider, apiBase, apiKey, apiModel });
  try {
    if (el.provider) el.provider.value = provider;
    if (el.apiBase) el.apiBase.value = apiBase;
    if (el.apiKey) el.apiKey.value = apiKey;
    fillModelSelect(liveModels, apiModel, "live");
  } catch (_) {}
  syncInAppProviderBar(provider, apiKey, apiModel, liveModels);
  reflectActiveModel(apiModel, provider);
  setCredReady(true, "Connected · " + provider + " · " + apiModel);
  finishEnterChat();
}

function finishEnterChat() {
  const after = () => {
    try { document.body.classList.add("goar-ready"); } catch (_) {}
    try { el.app.classList.add("show"); } catch (_) {}
    try { enableAgentMode(); } catch (_) {}
    try { wireAgentUi(); } catch (_) {}
    try {
      const s = settingsSnapshot();
      reflectActiveModel(s.apiModel, s.provider);
      refreshAgentPill();
      syncIndicators({ model: s.apiModel });
    } catch (_) {}
    try { fitAddon && fitAddon.fit(); } catch (_) {}
    loadModelsFromApi({ selected: settingsSnapshot().apiModel }).catch(() => {});
    try {
      const es = document.getElementById("emptyState");
      if (es) es.classList.add("on");
    } catch (_) {}
    try { agentEl.input && agentEl.input.focus(); } catch (_) {}
    try {
      const w = document.getElementById("welcome");
      const has = document.querySelector("#chat-inner .msg.user, #chat-inner .msg.ai");
      if (w) {
        if (has) {
          w.classList.add("hide");
          w.classList.remove("show", "on");
        } else {
          w.classList.remove("hide");
          w.style.display = "";
          w.classList.add("show", "on");
        }
      }
    } catch (_) {}
    try { if (typeof goarMotion !== "undefined" && goarMotion.enterStage) goarMotion.enterStage(); } catch (_) {}
  };
  if (typeof goarMotion !== "undefined" && goarMotion.leaveSetup) {
    goarMotion.leaveSetup(after);
  } else {
    try { el.setup.classList.add("hide"); el.setup.classList.remove("open"); } catch (_) {}
    after();
  }

  // Wire API into guest + force sandbox ONLINE for agent tools
  (async () => {
    try {
      // If shell already came up, never leave envReady false after user enters chat
      if (window.__emulator && typeof send === "function") {
        try { window.__goarMarkEnvReady?.(true, "chat enter"); } catch (_) {}
      }
      const env = typeof settingsEnvBody === "function" ? settingsEnvBody() : null;
      if (env && typeof applyEnvAndStartAgent === "function") {
        // Apply credentials to guest without blocking UI
        if (!seqRunning) {
          seqRunning = false;
          try {
            await applyEnvAndStartAgent(env);
          } catch (e) {
            console.warn("[goar] applyEnv on enter", e);
            try { window.__goarMarkEnvReady?.(true, "applyEnv soft-fail"); } catch (_) {}
          }
        }
      } else {
        try { window.__goarMarkEnvReady?.(true, "chat enter no-env-body"); } catch (_) {}
      }
      // Hard probe — if guest answers, tools are live
      try {
        if (typeof guestExec === "function") {
          const r = await guestExec("echo GOAR_ENV_OK; python3 -c 'print(42)'", 25000);
          if (r && (r.code === 0 || /GOAR_ENV_OK|42/.test(r.output || ""))) {
            window.__goarMarkEnvReady?.(true, "probe ok");
          }
        }
      } catch (e) {
        console.warn("[goar] enter probe", e);
      }
      try { refreshAgentPill(); } catch (_) {}
    } catch (e) {
      console.warn("[goar] finishEnterChat async", e);
    }
  })();
}

function recomputeProgress(label) {
  let t = 0;
  for (const k of Object.keys(weights)) t += progress[k] * weights[k];
  setProgress(4 + t * 86, label || "Loading system...",
    Object.entries(progress).map(([k, v]) => k + " " + Math.round(v * 100) + "%").join(" · "));
}
function showErr(m) {
  if (el.err) {
    el.err.textContent = m;
    el.err.classList.add("show");
  }
  if (el.detail) el.detail.textContent = m;
  if (el.retry) el.retry.classList.add("show");
  if (el.step) el.step.textContent = "Failed";
  console.error("[goar]", m);
}
function clearErr() {
  if (el.err) {
    el.err.classList.remove("show");
    el.err.textContent = "";
  }
  if (el.retry) el.retry.classList.remove("show");
}
function mb(n) { return (n / 1048576).toFixed(1); }

async function openCache() {
  try { return await caches.open(CACHE_NAME); } catch { return null; }
}

async function fetchBuffer(urls, key) {
  const list = Array.isArray(urls) ? urls : [urls];
  let lastErr = null;
  for (const url of list) {
    try {
      const abs = url.startsWith("http://") || url.startsWith("https://");
      const cache = await openCache();
      if (cache) {
        try {
          const hit = await cache.match(url);
          if (hit) {
            progress[key] = 1;
            recomputeProgress("Cached " + key);
            return await hit.arrayBuffer();
          }
        } catch (_) {}
      }
      const res = await fetch(url, {
        credentials: abs ? "omit" : "same-origin",
        cache: "force-cache",
        mode: "cors",
      });
      if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
      const total = Number(res.headers.get("content-length") || 0);
      if (!res.body || !res.body.getReader) {
        const buf = await res.arrayBuffer();
        progress[key] = 1;
        recomputeProgress("Got " + key);
        if (cache) try { await cache.put(url, new Response(buf.slice(0))); } catch (_) {}
        return buf;
      }
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        progress[key] = total ? Math.min(1, received / total) : Math.min(0.99, progress[key] + 0.01);
        recomputeProgress("Downloading " + key + " · " + mb(received) + (total ? " / " + mb(total) : "") + " MB");
      }
      const out = new Uint8Array(received);
      let off = 0;
      for (const c of chunks) { out.set(c, off); off += c.byteLength; }
      progress[key] = 1;
      recomputeProgress("Got " + key);
      if (cache) try { await cache.put(url, new Response(out.buffer.slice(0))); } catch (_) {}
      return out.buffer;
    } catch (e) {
      lastErr = e;
      progress[key] = 0;
      console.warn(url, e);
    }
  }
  throw lastErr || new Error("Failed " + key);
}

/* ── terminal ── */
