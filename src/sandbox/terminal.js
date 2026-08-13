function initTerm() {
  if (typeof Terminal === "undefined") throw new Error("terminal failed to load");
  term = new Terminal({
    cursorBlink: true,
    cursorStyle: "block",
    fontFamily: 'ui-monospace,"SF Mono",Menlo,Consolas,monospace',
    fontSize: 13,
    lineHeight: 1.2,
    theme: {
      background: "#000000", foreground: "#f2f2f2", cursor: "#ff1a1a", cursorAccent: "#000",
      selectionBackground: "#ff1a1a33",
      black:"#000", red:"#ff1a1a", green:"#33ff66", yellow:"#ffaa00",
      blue:"#6b8cff", magenta:"#ff79c6", cyan:"#8be9fd", white:"#f2f2f2",
      brightBlack:"#555", brightRed:"#ff4444", brightGreen:"#69ff94", brightYellow:"#ffcc66",
      brightBlue:"#a0b4ff", brightMagenta:"#ff92df", brightCyan:"#a4ffff", brightWhite:"#fff",
    },
    scrollback: 10000,
    convertEol: true,
    allowProposedApi: true,
  });
  fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  try { term.loadAddon(new WebLinksAddon.WebLinksAddon()); } catch (_) {}
  const termMount = (typeof el !== "undefined" && el.terminal) || document.getElementById("terminal");
  if (!termMount) throw new Error("terminal mount #terminal missing");
  term.open(termMount);
  try { fitAddon.fit(); } catch (_) {}
  // xterm → serial: Linux line discipline wants LF; map CR→LF
  term.onData((data) => {
    if (!emulator) return;
    try {
      // xterm sends \r on Enter. Linux TTY wants CR (ICRNL → NL).
      // Map LF→CR only; keep CR as CR so Enter works.
      let fixed = data.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
      emulator.serial0_send(fixed);
    } catch (_) {}
  });
  // Push geometry to guest TTY when xterm resizes
  let _ttySized = false;
  const pushTtySize = () => {
    if (_ttySized || !emulator || !term) return;
    try {
      const c = term.cols | 0, r = term.rows | 0;
      if (c > 0 && r > 0) {
        _ttySized = true;
        const cmd = "stty -echo 2>/dev/null; stty cols " + c + " rows " + r
          + " 2>/dev/null; export COLUMNS=" + c + " LINES=" + r + "; stty echo 2>/dev/null";
        emulator.serial0_send(cmd + "\n");
      }
    } catch (_) {}
  };
  window.__pushTtySize = pushTtySize;
  const focusTerm = () => {
    try { term.focus(); } catch (_) {}
    try {
      const ta = el.host.querySelector(".xterm-helper-textarea");
      if (ta) ta.focus();
    } catch (_) {}
  };
  const host = (typeof el !== "undefined" && el.host) || termMount.parentElement || termMount;
  if (host && host.addEventListener) host.addEventListener("pointerdown", focusTerm);
  window.addEventListener("resize", () => {
    try { fitAddon.fit(); } catch (_) {}
    /* no stty spam */
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      try { fitAddon.fit(); } catch (_) {}
      /* no stty spam */
    });
  }
  // expose for post-boot
  window.__pushTtySize = pushTtySize;
}


/** One-shot guest TTY repair over serial (job control + size) */
function fixGuestTty() {
  if (!emulator || window.__ttyFixed) return;
  window.__ttyFixed = true;
  try {
    const c = (term && term.cols) || 100;
    const r = (term && term.rows) || 30;
    const cmd = "stty -echo 2>/dev/null; stty sane cols " + c + " rows " + r
      + " 2>/dev/null; export TERM=xterm-256color COLUMNS=" + c + " LINES=" + r
      + "; stty echo 2>/dev/null; echo [goar-seq] tty-ok";
    emulator.serial0_send(cmd + "\n");
  } catch (_) {}
}


function setRunning(on, text) {
  try {
    if (el.running) el.running.classList.toggle('on', !!on);
    if (el.runningText && text) el.runningText.textContent = text;
    if (el.statusMid && text) el.statusMid.textContent = text;
    if (el.host) el.host.classList.toggle('agent-on', !!on);
  } catch (_) {}
}

function send(cmd) {
  if (!emulator) return;
  try {
    const s = /[\r\n]$/.test(cmd) ? cmd.replace(/\n/g, "\r") : cmd + "\r";
    if (typeof emulator.serial0_send === "function") emulator.serial0_send(s);
  } catch (_) {}
}

/** Host automation: hide command echo on guest TTY */
function sendQuiet(cmd) {
  if (!emulator) return;
  const body = cmd.endsWith("\n") ? cmd.slice(0, -1) : cmd;
  try {
    emulator.serial0_send("stty -echo 2>/dev/null\n");
    emulator.serial0_send(body + "\r");
    emulator.serial0_send("stty echo 2>/dev/null\n");
  } catch (_) {}
}
function shellQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function waitForSerial(patterns, timeoutMs) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  const regs = list.map((p) => (p instanceof RegExp ? p : new RegExp(p)));
  const start = Date.now();
  const baseline = serialBuf.length;
  return new Promise((resolve) => {
    const tick = () => {
      const slice = serialBuf.slice(Math.max(0, baseline - 200));
      for (const r of regs) {
        if (r.test(slice) || r.test(serialBuf.slice(-800))) {
          resolve(true);
          return;
        }
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, 120);
    };
    tick();
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function settingsEnvBody() {
  const s = ensureDefaultSettings();
  const key = (s.apiKey || "").trim();
  if (!key) return null;
  const base = (s.apiBase || DEFAULTS.apiBase).replace(/\/+$/, "");
  const model = (s.apiModel || DEFAULTS.apiModel).trim();
  const dnsMap = window.__GOAR_DNS_MAP || s.dnsMap || "";
  // Fully OpenAI-compatible env — works with NIM, OpenAI, Groq, OpenRouter, custom, ...
  const lines = [
    "export OPENAI_API_KEY=" + shellQuote(key),
    "export GOAR_API_KEY=" + shellQuote(key),
    "export OPENAI_BASE_URL=" + shellQuote(base),
    "export GOAR_API_URL=" + shellQuote(base),
    "export OPENAI_MODEL=" + shellQuote(model),
    "export GOAR_MODEL=" + shellQuote(model),
    "export GOAR_AUTO_APPROVE=1",
    "export GOAR_OPERATOR_CORE=1",
    "export SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt",
    "export REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt",
    "export CURL_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt",
    "export PYTHONPATH=/usr/lib/python3.11/site-packages",
    "export PYTHONUNBUFFERED=1",
    "export PIP_BREAK_SYSTEM_PACKAGES=1",
    "export TERM=xterm-256color",
    "export COLORTERM=truecolor",
    "export COLUMNS=100",
    "export LINES=30",
    "export GOAR_WORKDIR=/workspace",
    "export GOAR_CONFIG_DIR=/opt/goar",
    "unset GOAR_PROXY_LIST",
  ];
  // NVIDIA aliases only when using NIM
  if (/nvidia\.com/i.test(base) || key.startsWith("nvapi-")) {
    lines.push("export NVIDIA_API_KEY=" + shellQuote(key));
    lines.push("export NGC_API_KEY=" + shellQuote(key));
  }
  if (dnsMap) lines.push("export GOAR_DNS_MAP=" + shellQuote(dnsMap));
  return lines.join("\n") + "\n";
}





/* Parse custom DNS: NextDNS id, DoH URL, or comma-separated IPs */
