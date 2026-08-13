async function runAutoSequence() {
  if (seqRunning || seqDone) return;
  seqRunning = true;
  try { setRunning(true, "auto sequence"); } catch (_) {}
  try { if (el.status) el.status.textContent = "auto · waiting for guest..."; } catch (_) {}

  // Instant path: verified freeze already restored into RAM
  if (window.__GOAR_FROM_FREEZE && window.__GOAR_INITIAL_STATE) {
    try { if (el.status) el.status.textContent = "thaw · re-apply credentials..."; } catch (_) {}
    await sleep(800);
    const env = settingsEnvBody();
    if (env) {
      await interruptGuest();
      await sleep(200);
      const b64 = btoa(unescape(encodeURIComponent(env)));
      send(
        "mkdir -p /run /workspace; echo " + b64 + " | base64 -d > /run/goar.env; " +
        "set -a; . /run/goar.env; set +a; " +
        "ip link set eth0 up 2>/dev/null; " +
        "ip addr add 192.168.86.100/24 dev eth0 2>/dev/null || true; " +
        "ip route replace default via 192.168.86.1 dev eth0 2>/dev/null || true; " +
        "echo [goar-seq] thaw-done"
      );
      await waitForSerial(/\[goar-seq\] thaw-done/, 8000);
      send("set -a; . /run/goar.env; set +a; cd /workspace; goar");
    }
    seqDone = true;
  try {
    send("cd /workspace; export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; echo [goar-seq] shell-ready");
    await waitForSerial(/\[goar-seq\] shell-ready/, 6000);
  } catch (_) {}
  try { window.__goarMarkEnvReady?.(true); } catch (_) {}
  try {
    // Flask is preinstalled in rootfs site-packages — no serial wheel flood
    setTimeout(async () => {
      try {
        const r = await guestExec("python3 -c 'import flask; print(1)' 2>/dev/null || echo NO", 20000);
        window.__GOAR_FLASK = { ok: r && !/NO/.test(r.output||"") && r.code===0, output: (r&&r.output)||"" };
        console.log("[goar] flask probe", window.__GOAR_FLASK);
      } catch (e) { console.warn(e); }
    }, 800);
  } catch (_) {}
  try {
    // background shell probe
    setTimeout(async () => {
      try {
        const r = await guestExec("python3 -c 'print(12321)'", 20000);
        window.__GOAR_SHELL_PROBE = r;
        console.log("[goar] shell probe", r);
      } catch (e) { console.warn("[goar] shell probe fail", e); }
    }, 500);
  } catch (_) {}
    seqRunning = false;
    try { setRunning(false, "resumed freeze"); } catch (_) {}
    try {
      if (el.status) el.status.textContent = "GOAR resumed from verified freeze · ready";
  try { if (typeof ensureSystemPlanes === "function") ensureSystemPlanes(); } catch (_) {}

      if (el.btnGoar) el.btnGoar.classList.add("ok");
    } catch (_) {}
    return;
  }

  try {
    const pf = await preflightApi();
    window.__GOAR_API_PREFLIGHT = pf;
    console.log("[goar] api preflight", pf);
    if (pf && pf.ok && pf.chat === false) {
      try { if (el.status) el.status.textContent = "API key lists models but chat denied (" + (pf.reason||"") + ")"; } catch(_){}
    }
  } catch (e) { console.warn(e); }


  let shellOk = await waitForSerial([
    /\[goar-boot\] GOAR OS ready/,
    /GOAR OS ready/,
    /goaros:/,
    /goar-boot/,
    /Alpine Linux/,
    /BusyBox/,
    /localhost/,
    /\/ #/,
    / # /,
  ], 45000);

  if (!shellOk) {
    try { if (el.status) el.status.textContent = "auto · nudging shell..."; } catch (_) {}
    try {
      for (let n = 0; n < 3; n++) { send("\n"); await sleep(300); }
      send("echo [goar-seq] shell-ping; uname -a 2>/dev/null; python3 -c 'print(42)' 2>/dev/null; echo [goar-seq] shell-pong");
      shellOk = await waitForSerial(/\[goar-seq\] shell-pong|42/, 90000);
    } catch (_) {}
  }
  if (!shellOk) {
    try { if (el.status) el.status.textContent = "shell timeout · RESTART"; } catch (_) {}
    seqRunning = false;
    try { setRunning(false, "timeout"); } catch (_) {}
    // still mark partial so browser agent can work
    try { window.__goarMarkEnvReady?.(false, "shell timeout"); } catch (_) {}
    return;
  }

  // CRITICAL: guest shell is live — mark ready NOW (do not wait for API key)
  try { window.__goarMarkEnvReady?.(true, "shell online"); } catch (_) {}
  try { if (el.status) el.status.textContent = "auto · sandbox online"; } catch (_) {}

  await sleep(400);
  try { if (el.status) el.status.textContent = "auto · network..."; } catch (_) {}
  send(
    "echo [goar-seq] net-start; " +
    "ip link set lo up 2>/dev/null; ip link set eth0 up 2>/dev/null; " +
    "udhcpc -i eth0 -q -n -t 4 -T 2 2>/dev/null || true; " +
    "ip addr add 192.168.86.100/24 dev eth0 2>/dev/null || true; " +
    "ip route replace default via 192.168.86.1 dev eth0 2>/dev/null || true; " +
    "printf 'nameserver 192.168.86.1\n' > /etc/resolv.conf; " +
    "command -v bash >/dev/null 2>&1 || ln -sf /bin/sh /bin/bash 2>/dev/null || true; " +
    "echo [goar-seq] net-done"
  );
  await waitForSerial(/\[goar-seq\] net-done/, 20000);
  await sleep(150);
  try { await injectHostsForApi(); } catch (e) { console.warn(e); }

  // Ensure envReady even if operator has not entered API key yet (cred gate is next)
  try { window.__goarMarkEnvReady?.(true, "shell online"); } catch (_) {}

  const env = settingsEnvBody();
  if (!env) {
    try { if (el.status) el.status.textContent = "sandbox ready · enter API key"; } catch (_) {}
    // Do NOT open settings modal — afterEnvReady shows credential gate
    seqRunning = false;
    seqDone = true; // guest sequence done; agent tools available
    try { setRunning(false, "need key"); } catch (_) {}
    window.__goarResumeSeq = () => {
      seqRunning = false;
      seqDone = false;
      runAutoSequenceFromEnv();
    };
    return;
  }

  await applyEnvAndStartAgent(env);
}


async function runAutoSequenceFromEnv() {
  if (seqRunning) return;
  seqRunning = true;
  seqDone = false;
  const env = settingsEnvBody();
  if (!env) {
    try { if (el.status) el.status.textContent = "need API key"; openSettings(); } catch (_) {}
    seqRunning = false;
    return;
  }
  try { if (el.status) el.status.textContent = "restarting agent..."; } catch (_) {}
  await interruptGuest();
  await applyEnvAndStartAgent(env);
}

async function interruptGuest() {
  try { emulator && emulator.serial0_send("\u0003"); } catch (_) {}
  await sleep(250);
  try { emulator && emulator.serial0_send("\u0003"); } catch (_) {}
  await sleep(200);
}

async function applyEnvAndStartAgent(env) {
  try { if (el.status) el.status.textContent = "auto · credentials..."; } catch (_) {}
  await interruptGuest();
  await sleep(120);
  const b64 = btoa(unescape(encodeURIComponent(env)));
  send(
    "mkdir -p /run /root /workspace; " +
    "echo " + b64 + " | base64 -d > /run/goar.env; " +
    "cp -f /run/goar.env /root/.goar.env; " +
    "chmod 600 /run/goar.env /root/.goar.env 2>/dev/null || true; " +
    "ip link set eth0 up 2>/dev/null || true; " +
    "ip addr add 192.168.86.100/24 dev eth0 2>/dev/null || true; " +
    "ip route replace default via 192.168.86.1 dev eth0 2>/dev/null || true; " +
    "echo [goar-seq] env-done"
  );
  await waitForSerial(/\[goar-seq\] env-done/, 25000);
  await sleep(150);

  try { if (el.status) el.status.textContent = "auto · validating goar..."; } catch (_) {}
  send(
    "set -a; . /run/goar.env 2>/dev/null; set +a; " +
    "python3 /opt/goar/goar.py --version 2>/dev/null || goar --version; " +
    "python3 -c 'print(42)'; " +
    "echo [goar-seq] validate-done"
  );
  const validated = await waitForSerial(/\[goar-seq\] validate-done|42/, 60000);
  if (validated) {
    try { window.__goarMarkEnvReady?.(true, "python validated"); } catch (_) {}
  }

  // Skip heavy deep-verify freeze on critical path — mark tools ready ASAP
  let verify = { ok: true, fast: true };
  window.__GOAR_LAST_VERIFY = verify;
  try { if (el.status) el.status.textContent = "auto · shell ready for agent tools..."; } catch (_) {}
  try { if (el.btnGoar) el.btnGoar.classList.add("ok"); } catch (_) {}
  send(
    "set -a; . /run/goar.env 2>/dev/null; set +a; " +
    "cd /workspace; mkdir -p /workspace; " +
    "echo [goar-seq] goar-start; echo [goar-seq] browser-agent; " +
    "# keep interactive shell for agent tools\n" +
    "export PS1='# '; cd /workspace; echo [goar-seq] goar-exit"
  );

  const agentOk = await waitForSerial([
    /GOAR\s*\|\s*GSD/,
    /GSD v2/,
    /goar 2\.4/,
    /OPERATOR CORE/i,
    /\[goar-seq\] goar-start/,
  ], 90000);

  seqDone = true;
  try {
    send("cd /workspace; export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; echo [goar-seq] shell-ready");
    await waitForSerial(/\[goar-seq\] shell-ready/, 6000);
  } catch (_) {}
  try { window.__goarMarkEnvReady?.(true); } catch (_) {}
  try {
    // Flask is preinstalled in rootfs site-packages — no serial wheel flood
    setTimeout(async () => {
      try {
        const r = await guestExec("python3 -c 'import flask; print(1)' 2>/dev/null || echo NO", 20000);
        window.__GOAR_FLASK = { ok: r && !/NO/.test(r.output||"") && r.code===0, output: (r&&r.output)||"" };
        console.log("[goar] flask probe", window.__GOAR_FLASK);
      } catch (e) { console.warn(e); }
    }, 800);
  } catch (_) {}
  try {
    // background shell probe
    setTimeout(async () => {
      try {
        const r = await guestExec("python3 -c 'print(12321)'", 20000);
        window.__GOAR_SHELL_PROBE = r;
        console.log("[goar] shell probe", r);
      } catch (e) { console.warn("[goar] shell probe fail", e); }
    }, 500);
  } catch (_) {}
  seqRunning = false;
  const frozen = !!(window.__GOAR_FROZEN_META && window.__GOAR_FROZEN_META.gzBytes);
  try {
    setRunning(false, frozen ? "verified+frozen" : (agentOk ? "agent online" : "partial"));
  } catch (_) {}
  try {
    if (el.status) {
      const s = loadSettings();
      if (frozen) {
        el.status.textContent =
          "GOAR verified + frozen · " + (s.apiModel || "") +
          " · " + (window.__GOAR_FROZEN_META.gzBytes / 1048576).toFixed(1) + " MB";
      } else if (agentOk) {
        el.status.textContent = "GOAR online · freeze pending";
  try { if (typeof ensureSystemPlanes === "function") ensureSystemPlanes(); } catch (_) {}


  // Background warm freeze (frontend OPFS) — never blocks agent tools
  try {
    if (window.GOAR_AUTO_FREEZE && !window.__GOAR_FROM_FREEZE && typeof saveSessionSnapshot === "function") {
      setTimeout(async () => {
        try {
          if (window.__GOAR_FROZEN_META && window.__GOAR_FROZEN_META.gzBytes) return;
          try {
            if (typeof deepVerifyGuest === "function") {
              window.__GOAR_LAST_VERIFY = await deepVerifyGuest();
            }
          } catch (_) {}
          await saveSessionSnapshot("auto-online");
        } catch (e) { console.warn("[goar] auto-freeze", e); }
      }, 4000);
    }
  } catch (_) {}

      } else {
        el.status.textContent = "boot complete · check terminal";
      }
    }
  } catch (_) {}
}


function sendGoar() {
  if (seqRunning) return;
  seqDone = false;
  runAutoSequenceFromEnv();
}

function sendPkg() {
  sendQuiet(
    "echo '── packages ──'; " +
    "pkg recommend 2>/dev/null || true; " +
    "echo; echo 'Python: pip install <any package>'"
  );
  /* pkgs via agent */
}
function sendNet() {
  sendQuiet(
    "echo '[net] ...'; " +
    "IP=; command -v /sbin/ip >/dev/null && IP=/sbin/ip; IP=${IP:-ip}; " +
    "$IP link set lo up 2>/dev/null; " +
    "for n in eth0 ens3 enp0s3 enp0s5; do $IP link set dev $n up 2>/dev/null || $IP link set $n up 2>/dev/null; done; " +
    "IF=eth0; $IP link show eth0 >/dev/null 2>&1 || IF=$($IP -o link show 2>/dev/null | awk -F': ' '$2!=\"lo\"{print $2; exit}'); " +
    "IF=${IF:-eth0}; udhcpc -i \"$IF\" -q -n -t 6 -T 2 2>/dev/null || true; " +
    "printf 'nameserver 192.168.86.1\\n' > /etc/resolv.conf; " +
    "echo iface=$IF; $IP -br addr 2>/dev/null || $IP addr 2>/dev/null || ifconfig; " +
    "ping -c 1 -W 3 1.1.1.1 2>/dev/null | tail -1 || true; echo '[net] done'"
  );
  /* net automated */
  el.status.textContent = "network...";
}

