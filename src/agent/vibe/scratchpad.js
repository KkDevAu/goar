/**
 * Session scratchpad — Vibe's temp dir, mapped onto this frontend:
 *   guest  /workspace/.scratch
 *   kv     ns=scratch
 *   memory only if guest is not up
 */
const GOAR_SCRATCH = {
  guestPath: "/workspace/.scratch",
  ready: false,
  sessionId: "",
};

function vibeSessionId() {
  if (GOAR_SCRATCH.sessionId) return GOAR_SCRATCH.sessionId;
  try {
    let id = sessionStorage.getItem("goar_session_id");
    if (!id) {
      id = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem("goar_session_id", id);
    }
    GOAR_SCRATCH.sessionId = id;
    return id;
  } catch (_) {
    GOAR_SCRATCH.sessionId = "s" + Date.now().toString(36);
    return GOAR_SCRATCH.sessionId;
  }
}

async function ensureScratchpad() {
  GOAR_SCRATCH.sessionId = vibeSessionId();
  if (typeof envReady !== "undefined" && envReady && typeof guestExec === "function") {
    try {
      await guestExec("mkdir -p " + GOAR_SCRATCH.guestPath + " && echo ok", 12000);
      GOAR_SCRATCH.ready = true;
    } catch (_) {
      GOAR_SCRATCH.ready = false;
    }
  }
  try {
    if (typeof kvSet === "function") {
      await kvSet({ ns: "scratch", key: "session", value: GOAR_SCRATCH.sessionId });
    }
  } catch (_) {}
  return { ok: true, path: GOAR_SCRATCH.guestPath, id: GOAR_SCRATCH.sessionId, guest: GOAR_SCRATCH.ready };
}

function scratchpadBlurb() {
  return (
    "Scratch: " + GOAR_SCRATCH.guestPath +
    " (session " + (GOAR_SCRATCH.sessionId || vibeSessionId()) +
    "). Notes, drafts, probes — not the product tree."
  );
}
