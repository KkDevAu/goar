function renderAttachChips() {
  const host = document.getElementById("chat-attach-chips");
  const list = window.__GOAR_ATTACHMENTS || [];
  if (!host) return;
  if (!list.length) {
    host.innerHTML = "";
    host.hidden = true;
    return;
  }
  host.hidden = false;
  host.innerHTML = list.map((a, i) =>
    '<span class="attach-chip" data-i="' + i + '">' +
    String(a.name || "file").replace(/[<>&]/g, "") +
    ' <button type="button" data-rm="' + i + '" aria-label="Remove">×</button></span>'
  ).join("");
  host.querySelectorAll("[data-rm]").forEach((b) => {
    b.addEventListener("click", () => {
      const i = Number(b.getAttribute("data-rm"));
      (window.__GOAR_ATTACHMENTS || []).splice(i, 1);
      renderAttachChips();
    });
  });
}

function consumeAttachments() {
  const list = window.__GOAR_ATTACHMENTS || [];
  window.__GOAR_ATTACHMENTS = [];
  renderAttachChips();
  if (!list.length) return "";
  return list.map((a) =>
    "\n\n--- attached: " + a.name + " (" + a.size + " B) ---\n" + (a.text || "") + "\n--- end ---"
  ).join("");
}

async function sendCommand() {
  let msg = (agentEl.input?.value || "").trim();
  const extra = consumeAttachments();
  if (extra) msg = (msg || "Review the attached files.") + extra;
  if (!msg) return;
  if (msg === "/stop" || msg === "/abort") {
    agentEl.input.value = "";
    requestAgentStop();
    return;
  }
  // Queue one follow-up while a turn runs — never drop the user's intent
  if (agentBusy) {
    try {
      window.__GOAR_PENDING_TURN = msg;
      agentEl.input.value = "";
      agentEl.input.style.height = "auto";
      appendMsg(msg, "user");
      appendMsg("queued — runs when current step finishes", "sys");
      if (typeof setStatusFooter === "function") setStatusFooter("queued…");
    } catch (_) {
      if (typeof setStatusFooter === "function") setStatusFooter("busy — Esc to stop");
    }
    return;
  }
  agentEl.input.value = "";
  agentEl.input.style.height = "auto";
  if (msg.startsWith("/")) {
    appendMsg(msg, "user");
    await handleSlash(msg);
    try { persistAgentChat(); } catch (_) {}
    return;
  }
  appendMsg(msg, "user");
  await agentTurn(msg);
}
