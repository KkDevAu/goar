let __guestExecTail = Promise.resolve();

async function guestExec(command, timeoutMs = 180000) {
  const run = () => guestExecUnlocked(command, timeoutMs);
  const next = __guestExecTail.then(run, run);
  __guestExecTail = next.then(function () {}, function () {});
  return next;
}

async function guestExecUnlocked(command, timeoutMs = 180000) {
  const emu = window.__emulator || (typeof emulator !== "undefined" ? emulator : null);
  if (!emu || typeof send !== "function") throw new Error("Guest environment not ready");
  const id = Math.random().toString(36).slice(2, 7);
  const start = "GOS" + id;
  const end = "GOE" + id;
  let cmd = String(command).replace(/\r/g, "");

  // python3 -c '…' cannot travel the serial console: quotes are eaten or
  // echoed as the payload. Rewrite to a file write + run. The long path
  // then base64-encodes the whole script so the snippet never hits serial.
  const dashC = cmd.match(/^\s*python3?\s+-c\s+(?:'([^']*)'|"([^"]*)")\s*(.*)$/);
  if (dashC) {
    const snippet = dashC[1] != null ? dashC[1] : dashC[2];
    const extra = (dashC[3] || "").trim();
    const staged = "/tmp/.goar_inline_" + id + ".py";
    const b64 = btoa(unescape(encodeURIComponent(snippet)));
    cmd =
      "printf %s " + JSON.stringify(b64) + " | base64 -d > " + staged +
      " && python3 " + staged + (extra ? " " + extra : "");
  }

  // Fast path only for plain single-line commands — no quotes, no python -c.
  const isShort =
    cmd.length <= 220 &&
    !cmd.includes("\n") &&
    !cmd.includes("base64") &&
    !/['"]/.test(cmd) &&
    !/\bpython3?\s+-c\b/.test(cmd);
  if (isShort) {
    try { emu.serial0_send("\n"); } catch (_) {}
    await sleep(40);
    const mark = serialBuf.length;
    const one = cmd.replace(/;/g, " ; ");
    send("echo " + start + "; { " + one + " ; } > /tmp/.gout." + id + " 2>&1; EC=$?; tail -c 12000 /tmp/.gout." + id + " 2>/dev/null; echo " + end + ":$EC");
    const re = new RegExp(end + ":([0-9]+)");
    let ok = await waitForSerial(re, timeoutMs);
    let out = typeof serialBuf === "string" ? serialBuf.slice(mark) : "";
    let m = out.match(re);
    if (!ok || !m) {
      return { code: -1, output: (out || "").slice(0, 8000) || "timeout" };
    }
    let body = out;
    const sIdx = out.lastIndexOf(start);
    const eIdx = out.lastIndexOf(end);
    if (sIdx >= 0 && eIdx > sIdx) body = out.slice(sIdx + start.length, eIdx);
    body = body.split("\n").filter((ln) => {
      const s = ln.trim();
      if (!s) return false;
      if (s === start || s.startsWith(end)) return false;
      if (s.includes("/tmp/.gout") || s.includes("/tmp/.ginl") || s.includes("/tmp/.goar_inline")) return false;
      return true;
    }).join("\n").trim();
    return { code: Number(m[1]), output: body.slice(0, 500000) };
  }

  try { emu.serial0_send("\u0003"); } catch (_) {}
  await sleep(60);
  try { emu.serial0_send("\n"); } catch (_) {}
  await sleep(40);

  const mark = serialBuf.length;

  // Capture all output to a temp file so long jobs (pip) cannot flood serial.
  const full = [
    "echo " + start,
    "{",
    cmd,
    "} > /tmp/.gout." + id + " 2>&1",
    "EC=$?",
    "tail -c 12000 /tmp/.gout." + id + " 2>/dev/null || true",
    "echo " + end + ":$EC",
  ].join("\n");

  const payload = btoa(unescape(encodeURIComponent(full)));
  const chunk = 64;
  send(": > /tmp/.grun.b64");
  await sleep(15);
  for (let i = 0; i < payload.length; i += chunk) {
    send("printf %s " + JSON.stringify(payload.slice(i, i + chunk)) + " >> /tmp/.grun.b64");
    await sleep(2);
  }
  send("base64 -d /tmp/.grun.b64 > /tmp/.grun.sh && sh /tmp/.grun.sh");


  const re = new RegExp(end + ":([0-9]+)");
  let ok = await waitForSerial(re, timeoutMs);
  let out = typeof serialBuf === "string" ? serialBuf.slice(mark) : "";
  let m = out.match(re);

  if (!ok || !m) {
    if (!/['"]/.test(cmd) && !/\bpython3?\s+-c\b/.test(cmd)) {
      const mark2 = serialBuf.length;
      const one = cmd.replace(/\n+/g, " ; ").slice(0, 280);
      send("echo " + start + "; { " + one + " ; } 2>&1 | tail -c 8000; echo " + end + ":$?");
      ok = await waitForSerial(re, Math.min(60000, timeoutMs));
      out = serialBuf.slice(mark2);
      m = out.match(re);
    }
  }

  let body = out;
  const sIdx = out.lastIndexOf(start);
  const eIdx = out.lastIndexOf(end);
  if (sIdx >= 0 && eIdx > sIdx) body = out.slice(sIdx + start.length, eIdx);
  body = body.split("\n").filter((ln) => {
    const s = ln.trim();
    if (!s) return false;
    if (s.startsWith("printf %s")) return false;
    if (s.includes("/tmp/.grun") || s.includes("/tmp/.gout") || s.includes("/tmp/.ginl") || s.includes("/tmp/.goar_inline")) return false;
    if (s === start || s.startsWith(end)) return false;
    return true;
  }).join("\n").trim();

  return { code: m ? Number(m[1]) : -1, output: body.slice(0, 500000) };
}


async function ensureGuestNet() {
  return guestExec(
    "ip link set lo up 2>/dev/null; ip link set eth0 up 2>/dev/null; " +
    "udhcpc -i eth0 -q -n -t 3 -T 2 2>/dev/null || true; " +
    "ip addr add 192.168.86.100/24 dev eth0 2>/dev/null || true; " +
    "ip route replace default via 192.168.86.1 dev eth0 2>/dev/null || true; " +
    "printf 'nameserver 192.168.86.1\\n' > /etc/resolv.conf; " +
    "pip --version; echo NET_SETUP_OK",
    60000,
  );
}



async function installOfflineFlask() {
  try {
    if (!envReady) return { ok: false, error: "env not ready" };
    const chk = await guestExec("python3 -c 'import flask; print(1)' 2>/dev/null || echo NOFLASK", 30000);
    if (chk && Number(chk.code) === 0 && chk.output && !/NOFLASK/.test(chk.output)) {
      return { ok: true, cached: true, output: chk.output };
    }
    const urls = [
      (typeof location !== "undefined" ? location.origin : "") + "/assets/flask-offline.tar.gz",
      "/assets/flask-offline.tar.gz",
    ];
    let buf = null;
    let lastErr = "";
    for (const u of urls) {
      try {
        const r = await fetch(u);
        if (!r.ok) { lastErr = "HTTP " + r.status; continue; }
        buf = new Uint8Array(await r.arrayBuffer());
        break;
      } catch (e) { lastErr = String(e && e.message ? e.message : e); }
    }
    if (!buf) return { ok: false, error: "fetch wheels failed: " + lastErr };

    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, buf.subarray(i, Math.min(i + 0x8000, buf.length)));
    }
    const b64 = btoa(bin);
    const emu = window.__emulator || (typeof emulator !== "undefined" ? emulator : null);
    try { if (emu) emu.serial0_send("\u0003"); } catch (_) {}
    await sleep(80);
    const id = Math.random().toString(36).slice(2, 7);
    const start = "FS" + id;
    const end = "FE" + id;
    const mark = serialBuf.length;
    send(": > /tmp/flask-offline.b64");
    await sleep(30);
    for (let i = 0; i < b64.length; i += 48) {
      send("printf %s " + JSON.stringify(b64.slice(i, i + 48)) + " >> /tmp/flask-offline.b64");
      await sleep(3);
    }
    send(
      "echo " + start + "; " +
      "base64 -d /tmp/flask-offline.b64 > /tmp/flask-offline.tar.gz && " +
      "mkdir -p /opt/wheels && tar -xzf /tmp/flask-offline.tar.gz -C /opt/wheels && " +
      "pip install --break-system-packages --no-index --find-links=/opt/wheels flask 2>&1 | tail -25; " +
      "python3 -c 'import flask; print(chr(70)+chr(76)+chr(65)+chr(83)+chr(75)+chr(95)+chr(79)+chr(75))'; " +
      "echo " + end + ":$?"
    );
    const re = new RegExp(end + ":([0-9]+)");
    await waitForSerial(re, 300000);
    const out = serialBuf.slice(mark);
    return { ok: /FLASK_OK/.test(out), output: out.slice(-1000) };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}
window.__GOAR_INSTALL_FLASK = installOfflineFlask;
