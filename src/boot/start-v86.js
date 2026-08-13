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
      emulator = new V86({
        wasm_path: buffers.wasmUrl,
        initial_state: window.__GOAR_INITIAL_STATE || undefined,
        memory_size: mem,
        // leaner: less background work
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
      });
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

/** After guest sequence: toolkit then credentials gate → chat */
async function afterEnvReady() {
  bootItem("sandbox", "ok", "ok");
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
  Promise.resolve().then(async () => {
    try {
      if (typeof ensureGecko === "function") {
        await ensureGecko({
          mode: window.GOAR_GECKO_MODE || "embed",
          url: window.GOAR_GECKO_HOME || "https://duckduckgo.com/",
          show: false,
        });
      }
    } catch (e) {
      console.warn("[goar] gecko warm", e);
    }
  });
  bootItem("agent", "run", "…");
  setProgress(100, "Ready", "");
  try { pysecCatalogBody && pysecCatalogBody(); } catch (_) {}
  bootItem("agent", "ok", "ok");
  setProgress(100, "Ready", geckoStatus && geckoStatus().ready ? "sandbox + browser live" : "");
  await sleep(200);
  showCredPhase();
}


