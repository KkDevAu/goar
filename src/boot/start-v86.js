async function boot(buffers) {
  // GOAR never loads Alpine ISO via URL/Manus — buffers only (bzimage+initrd)
  if (window.GOAR_FORCE_ALPINE_ISO || window.GOAR_CDROM_URL) {
    console.warn("[goar] ignoring GOAR_CDROM_URL / FORCE_ALPINE_ISO — not supported");
    try { delete window.GOAR_CDROM_URL; } catch (_) {}
  }
  bootItem("assets", "ok", "ok");
  bootItem("sandbox", "run", "boot");
  const mod = await import(buffers.libUrl);
  const V86 = mod.default || mod.V86;
  setProgress(94, "Booting Linux...", "");
  if (el.status) el.status.textContent = "booting Linux...";
  ensureDefaultSettings();

  
  // Fast resume: OPFS freeze / shipped frozen state
  window.__GOAR_FROM_FREEZE = false;
  try {
    if (!window.GOAR_FORCE_COLD && window.GOAR_ALLOW_FREEZE === true) {
      const snap = (window.GOAR_ALLOW_FREEZE === true) ? await loadSessionSnapshot() : null;
      if (snap && snap.state) {
        window.__GOAR_INITIAL_STATE = snap.state;
        window.__GOAR_FROM_FREEZE = true;
        window.__GOAR_FROZEN_META = snap.meta || {};
        // Match guest RAM to frozen snapshot if known
        if (snap.meta && snap.meta.guestRamMB) {
          window.GOAR_GUEST_RAM_MB = snap.meta.guestRamMB;
        }
        try {
          if (el.status) el.status.textContent =
            "instant resume · " + ((snap.meta && (snap.meta.source || snap.meta.reason)) || "freeze");
          if (typeof setProgress === "function") setProgress(90, "Restoring image…", "frozen.bin.gz");
        } catch (_) {}
        console.log("[goar] restoring freeze", snap.meta);
      }
    }
  } catch (e) { console.warn("session restore skip", e); }

const memPlan = planMemoryBudget();
  try {
    if (el.status) el.status.textContent =
      "RAM " + memPlan.guestRamMB + " MB guest · cache target " + memPlan.codePackageMB + " MB · device ~" + memPlan.deviceMemoryGB + " GB";
  } catch (_) {}
  try { await ensureCodeCacheBudget(memPlan); } catch (_) {}
  const mems = (window.__GOAR_FROM_FREEZE ? [memPlan.guestRamMB] : memPlan.tiersMB).map((m) => m * 1024 * 1024);
  let lastErr = null;
  for (const mem of mems) {
    try {
      const opts = {
        wasm_path: buffers.wasmUrl,
        memory_size: mem,
        disable_speech: true,
        disable_kbd: false,
        vga_memory_size: 2 * 1024 * 1024,
        screen_container: document.getElementById("screen_container"),
        bios: { buffer: buffers.bios },
        vga_bios: { buffer: buffers.vgaBios },
        bzimage: { buffer: buffers.bzimage },
        initrd: { buffer: buffers.initrd },
        cmdline:
          "console=ttyS0,115200n8 rdinit=/init init=/init noapic nolapic acpi=off pci=conf1 tsc=reliable mitigations=off random.trust_cpu=on quiet loglevel=3 rw",
        net_device: buildNetDevice(),
        autostart: true,
        disable_keyboard: true,
        disable_mouse: true,
        disable_speaker: true,
      };
      if (window.__GOAR_INITIAL_STATE) {
        const st = window.__GOAR_INITIAL_STATE;
        opts.initial_state = st.buffer ? st : { buffer: st };
      }
      emulator = new V86(opts);
      lastErr = null;
      break;
    } catch (e) { lastErr = e; }
  }
  if (lastErr) throw lastErr;

  window.__serialSend = (s) => { try { emulator.serial0_send(s); } catch (e) { console.warn(e); } };
  window.__emulator = emulator;

  // Batch serial→xterm writes (per-byte write hammers TTY rendering)
  let _serQ = [];
  let _serFlush = null;
  const flushSerial = () => {
    _serFlush = null;
    if (!_serQ.length || !term) return;
    const chunk = Uint8Array.from(_serQ);
    _serQ = [];
    try { term.write(chunk); } catch (_) {}
  };
  emulator.add_listener("serial0-output-byte", (byte) => {
    _serQ.push(byte);
    serialBuf += String.fromCharCode(byte);
    if (serialBuf.length > 200000) serialBuf = serialBuf.slice(-120000);
    if (!_serFlush) _serFlush = requestAnimationFrame(flushSerial);
  });

  setProgress(92, "Sandbox up", window.__GOAR_FROM_FREEZE ? "frozen image" : "virtio · serial");
  bootItem("sandbox", "run", "init");
  try {
    term.writeln("\x1b[38;2;255;26;26mGOAR\x1b[0m\x1b[90m  loading sandbox…\x1b[0m");
  } catch (_) {}

  let _envDone = false;
  const doneEnv = () => {
    if (_envDone) return;
    _envDone = true;
    afterEnvReady().catch((e) => console.warn(e));
  };
  setTimeout(() => { runAutoSequence().catch(() => {}); }, 200);
  setTimeout(doneEnv, window.__GOAR_FROM_FREEZE ? 600 : 2500);
}

function markTermReady() {
  if (window.__GOAR_TERM_READY) return;
  window.__GOAR_TERM_READY = true;
  try {
    if (term) {
      term.write("\r\x1b[2K\x1b[90mready\x1b[0m\r\n");
    }
  } catch (_) {}
  try {
    if (emulator && emulator.serial0_send) emulator.serial0_send("\n");
  } catch (_) {}
  try {
    if (typeof fitAddon !== "undefined" && fitAddon && fitAddon.fit) fitAddon.fit();
  } catch (_) {}
}

function goarAutomate() {
  if (window.__GOAR_AUTOMATED) return;
  window.__GOAR_AUTOMATED = true;
  try { if (typeof markTermReady === "function") markTermReady(); } catch (_) {}
  try {
    if (typeof fixGuestTty === "function") {
      window.__ttyFixed = false;
      fixGuestTty();
    }
  } catch (_) {}
  try { if (typeof attachTermView === "function" && document.body.classList.contains("view-term")) attachTermView(); } catch (_) {}
  Promise.resolve().then(async () => {
    try { if (typeof ensurePysecWorker === "function") await ensurePysecWorker(); } catch (_) {}
    try { if (typeof ensurePysecNetwork === "function") await ensurePysecNetwork(); } catch (_) {}
    try { if (typeof ensureSystemPlanes === "function") await ensureSystemPlanes(); } catch (_) {}
    try {
      if (typeof ensureGecko === "function") {
        await ensureGecko({
          mode: "embed",
          url: window.GOAR_GECKO_HOME || "https://duckduckgo.com/",
          show: false,
        });
      }
    } catch (_) {}
  });
}

async function afterEnvReady() {
  bootItem("sandbox", "ok", "ok");
  goarAutomate();
  bootItem("toolkit", "run", "…");
  Promise.resolve().then(async () => {
    try {
      if (typeof ensurePysecWorker === "function") await ensurePysecWorker();
      bootItem("toolkit", "ok", "ok");
    } catch (e) {
      console.warn("[goar] toolkit", e);
      bootItem("toolkit", "err", "retry");
    }
  });
  bootItem("agent", "run", "…");
  setProgress(100, "Ready", "");
  try { pysecCatalogBody && pysecCatalogBody(); } catch (_) {}
  bootItem("agent", "ok", "ok");
  try { if (typeof setProgress === "function") setProgress(92, "Browser", ""); } catch (_) {}
  try {
    if (typeof waitForGoarPlanes === "function") await waitForGoarPlanes(40000);
  } catch (e) {
    console.warn("[goar] wait browser", e);
  }
  setProgress(100, "Ready", "");
  await sleep(120);
  let keyed = false;
  try {
    const s = typeof settingsSnapshot === "function" ? settingsSnapshot() : {};
    const p = typeof getProvider === "function" ? getProvider(s.provider) : null;
    const noKey = typeof providerAllowsEmptyKey === "function" ? providerAllowsEmptyKey(p) : (s.provider === "ollama" || s.provider === "freeai");
    keyed = !!((s.apiModel || (p && p.defaultModel)) && ((s.apiKey && String(s.apiKey).trim()) || noKey));
    if (keyed && !s.apiModel && p && p.defaultModel) {
      try { saveSettings({ apiModel: p.defaultModel, provider: s.provider || "freeai", apiBase: s.apiBase || (p && p.apiBase) }); } catch (_) {}
    }
  } catch (_) {}
  if (keyed && typeof finishEnterChat === "function") finishEnterChat();
  else showCredPhase();
}


