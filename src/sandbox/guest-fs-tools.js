async function toolBash(args) {
  if (!envReady && (window.__emulator || window.__GOAR_UNIX)) { try { window.__goarMarkEnvReady?.(true, "lazy bash"); } catch (_) {} }
  if (!envReady && !(window.__emulator || window.__GOAR_UNIX)) return "error: guest environment not ready yet";
  let cmd = (args.command || args.cmd || "").trim();
  if (!cmd) return "error: empty command";
  if (/\b(pip|apk|curl|wget)\b/i.test(cmd)) {
    try { await ensureGuestNet(); } catch (_) {}
  }
  const simplePip = /^\s*(?:python3?\s+-m\s+)?pip3?\s+install\b/.test(cmd)
    && !/--no-index|-r\s|--requirement|--find-links|-e\s|--editable|--target|--prefix|--user/.test(cmd);
  if (simplePip && typeof guestPipInstall === "function") {
    const spec = cmd
      .replace(/^\s*(?:python3?\s+-m\s+)?pip3?\s+install\b/, "")
      .replace(/--break-system-packages|--disable-pip-version-check|--no-input|--no-cache-dir|-q|--quiet|--upgrade|-U/g, "")
      .trim();
    const r = await guestPipInstall(spec, Number(args.timeout_ms || 300000));
    return (r.ok ? "ok via " + (r.via || "pip") : "failed") + "\n" + String(r.output || r.error || JSON.stringify(r)).slice(0, 8000);
  }
  if (/^\s*pip3?(?:\s|$)/.test(cmd) || /\bpip3?\s+install\b/.test(cmd)) {
    cmd = cmd.replace(/^\s*pip3?/, "python3 -m pip").replace(
      /\bpip3?\s+install\b/,
      "python3 -m pip install --break-system-packages"
    );
    if (!/--break-system-packages/.test(cmd) && /\sinstall\b/.test(cmd)) {
      cmd = cmd.replace(/\sinstall\b/, " install --break-system-packages");
    }
  }
  const r = await guestExec(cmd, Number(args.timeout_ms || 300000));
  return "exit " + r.code + "\n" + r.output;
}

async function toolWrite(args) {
  if (!envReady && (window.__emulator || window.__GOAR_UNIX)) { try { window.__goarMarkEnvReady?.(true, "lazy write"); } catch (_) {} }
  if (!envReady && !(window.__emulator || window.__GOAR_UNIX)) return "error: guest environment not ready yet";
  const path = (args.path || "").trim();
  let content = args.content ?? "";
  if (!path) return "error: path required";
  content = String(content);
  if (typeof unixWrite === "function" && (window.__GOAR_UNIX || (typeof Unix !== "undefined" && Unix.ready))) {
    unixWrite(path, content);
    try { window.__GOAR_LAST_WRITE = { path: path, content: content, at: Date.now() }; } catch (_) {}
    return content.length + " " + path + "\nOK";
  }
  const emu = window.__emulator || (typeof emulator !== "undefined" ? emulator : null);
  if (!emu) return "error: filesystem missing";

  try { emu.serial0_send("\u0003"); } catch (_) {}
  await sleep(80);
  const id = Math.random().toString(36).slice(2, 7);
  const start = "WS" + id;
  const end = "WE" + id;
  const mark = serialBuf.length;
  const b64 = b64utf8(content);
  const pathB64 = b64utf8(path);
  const chunk = 48;

  send("rm -f /tmp/.gw.b64 /tmp/.gpath.b64; : > /tmp/.gw.b64; : > /tmp/.gpath.b64");
  await sleep(40);
  for (let i = 0; i < pathB64.length; i += chunk) {
    send("printf %s " + JSON.stringify(pathB64.slice(i, i + chunk)) + " >> /tmp/.gpath.b64");
    await sleep(5);
  }
  for (let i = 0; i < b64.length; i += chunk) {
    send("printf %s " + JSON.stringify(b64.slice(i, i + chunk)) + " >> /tmp/.gw.b64");
    await sleep(5);
  }
  send(
    "echo " + start + "; " +
    "P=$(base64 -d /tmp/.gpath.b64); mkdir -p \"$(dirname \"$P\")\" 2>/dev/null; " +
    "base64 -d /tmp/.gw.b64 > \"$P\"; " +
    "wc -c \"$P\"; echo OK; echo " + end + ":$?"
  );
  const re = new RegExp(end + ":([0-9]+)");
  await waitForSerial(re, 120000);
  const out = serialBuf.slice(mark);
  const m = out.match(re);
  let body = out;
  const sIdx = out.lastIndexOf(start);
  const eIdx = out.lastIndexOf(end);
  if (sIdx >= 0 && eIdx > sIdx) body = out.slice(sIdx + start.length, eIdx);
  body = body.split("\n").filter((ln) => {
    const s = ln.trim();
    return s && !s.startsWith("printf %s") && !s.includes("/tmp/.gw") && !s.includes("/tmp/.gpath") && s !== start && !s.startsWith(end);
  }).join("\n").trim();
  if (!m) return "error: write timed out for " + path + "\n" + body.slice(-400);
  try { window.__GOAR_LAST_WRITE = { path: path, content: content, at: Date.now() }; } catch (_) {}
  return body || (content.length + " " + path + "\nOK");
}

async function toolRead(args) {
  const path = (args.path || "").trim();
  const maxb = Math.min(Number(args.max_bytes || 80000), 200000);
  if (typeof unixRead === "function" && (window.__GOAR_UNIX || (typeof Unix !== "undefined" && Unix.ready))) {
    try {
      return String(unixRead(path, false)).slice(0, maxb);
    } catch (e) {
      return "error: " + (e && e.message ? e.message : e);
    }
  }
  const r = await guestExec("head -c " + maxb + " " + JSON.stringify(path), 30000);
  return r.output;
}

async function toolLs(args) {
  const path = (args.path || "/workspace").trim();
  let r = await guestExec("ls -la " + JSON.stringify(path), 20000);
  if (/GOAR_ENV_OK|echo GOAR/.test(String(r.output || ""))) {
    await sleep(600);
    r = await guestExec("ls -la " + JSON.stringify(path), 20000);
  }
  return r.output;
}

async function toolWebSearch(args) {
  const q = (args.query || "").trim();
  const n = Math.min(Number(args.max_results || 8), 12);
  if (!q) return "error: query required";
  const blocks = [];
  try {
    const url = "https://en.wikipedia.org/w/api.php?action=opensearch&search=" + encodeURIComponent(q) + "&limit=" + n + "&namespace=0&format=json&origin=*";
    const r = await fetch(url);
    const data = await r.json();
    if (Array.isArray(data) && data[1]?.length) {
      const lines = [];
      for (let i = 0; i < data[1].length; i++) {
        lines.push("- " + data[1][i] + "\n  " + (data[3]?.[i] || "") + "\n  " + (data[2]?.[i] || ""));
      }
      blocks.push("## wikipedia\n" + lines.join("\n"));
    }
  } catch (e) { blocks.push("## wikipedia\nerror: " + e.message); }
  try {
    const url = "https://api.duckduckgo.com/?q=" + encodeURIComponent(q) + "&format=json&no_html=1&no_redirect=1&skip_disambig=1";
    const r = await fetch(url);
    const data = await r.json();
    const parts = [];
    if (data.AbstractText) parts.push("- " + (data.Heading || q) + "\n  " + (data.AbstractURL || "") + "\n  " + data.AbstractText);
    for (const topic of data.RelatedTopics || []) {
      if (parts.length >= n) break;
      if (topic.Text) parts.push("- " + (topic.FirstURL || "") + "\n  " + topic.Text);
    }
    if (parts.length) blocks.push("## duckduckgo\n" + parts.join("\n"));
  } catch (e) { blocks.push("## duckduckgo\nerror: " + e.message); }
  if (!blocks.length) return "No results for: " + q;
  return "Search: " + q + "\n\n" + blocks.join("\n\n");
}


async function toolWebFetch(args) {
  const url = (args.url || "").trim();
  const max = Math.min(Number(args.max_chars || 12000), 50000);
  if (!/^https?:\/\//i.test(url)) return "error: http(s) url required";
  const render = args.render === true || args.render === "true";
  const extract = args.extract || args.selector ? (args.extract || "1") : "";
  try {
    if (typeof goarHostFetch === "function") {
      const r = await goarHostFetch(url, {
        method: "GET",
        maxBytes: max,
        render: render,
        extract: extract,
        selector: args.selector || "",
        ttl: args.ttl,
        input: args.input,
        output: args.output,
      });
      if (r && (r.ok || r.status)) {
        let text = r.body || "";
        const ct = (r.headers && (r.headers["content-type"] || r.headers["Content-Type"])) || "";
        if (!extract && (String(ct).includes("html") || /<html/i.test(text.slice(0, 200)))) {
          text = text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        }
        return "HTTP " + r.status + " " + url + " [" + (r.via || "?") + "]\n\n" + text.slice(0, max);
      }
    }
  } catch (e) { /* fall through */ }
  try {
    const r = await fetch(url, { mode: "cors" });
    const ct = r.headers.get("content-type") || "";
    let text = await r.text();
    if (ct.includes("html")) {
      text = text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
    return "HTTP " + r.status + " " + url + " [browser-cors]\n\n" + text.slice(0, max);
  } catch (e) {
    try {
      if (typeof toolGuestHttp === "function" && (envReady || window.__emulator || window.__GOAR_UNIX)) {
        const g = await toolGuestHttp({ url, method: "GET", max_bytes: max });
        return "[via guest]\n" + String(g).slice(0, max + 200);
      }
    } catch (e2) {
      return "web_fetch failed: " + e.message + " | guest: " + e2.message;
    }
    return "web_fetch failed: " + e.message;
  }
}

async function toolPython(args) {
  if (!envReady && (window.__emulator || window.__GOAR_UNIX)) { try { window.__goarMarkEnvReady?.(true, "lazy python"); } catch (_) {} }
  if (!envReady && !(window.__emulator || window.__GOAR_UNIX)) return "error: guest environment not ready yet";
  const path = (args.path || "").trim();
  const code = args.code || "";
  const argv = args.args || "";
  if (!path && code && typeof goarKernel === "function") {
    try {
      const r = await goarKernel("exec", { code: String(code) });
      if (r && (r.ok || r.stdout != null || r.stderr != null)) {
        const bits = [];
        if (r.stdout) bits.push(String(r.stdout));
        if (r.stderr) bits.push(String(r.stderr));
        if (!bits.length && r.result != null) bits.push(typeof r.result === "string" ? r.result : JSON.stringify(r.result));
        return bits.join("") || (r.ok ? "" : JSON.stringify(r));
      }
    } catch (_) {}
  }
  let cmd;
  if (path) {
    cmd = "python3 " + JSON.stringify(path) + (argv ? " " + argv : "");
  } else if (code) {
    await toolWrite({ path: "/tmp/.goar_py_exec.py", content: String(code) });
    cmd = "python3 /tmp/.goar_py_exec.py" + (argv ? " " + argv : "");
  } else return "error: code or path required";
  const r = await guestExec(cmd, Number(args.timeout_ms || 90000));
  return "exit " + r.code + "\n" + r.output;
}

async function toolEdit(args) {
  if (!envReady && (window.__emulator || window.__GOAR_UNIX)) { try { window.__goarMarkEnvReady?.(true, "lazy toolEdit"); } catch (_) {} }
  if (!envReady && !(window.__emulator || window.__GOAR_UNIX)) return "error: guest environment not ready yet";
  const path = (args.path || "").trim();
  const oldS = args.old_string ?? args.oldString ?? "";
  const newS = args.new_string ?? args.newString ?? "";
  const all = !!(args.replace_all || args.replaceAll);
  if (!path) return "error: path required";
  if (oldS === "") return "error: old_string required";
  if (typeof unixRead === "function" && typeof unixWrite === "function" && (window.__GOAR_UNIX || (typeof Unix !== "undefined" && Unix.ready))) {
    let t;
    try { t = String(unixRead(path, false)); } catch (e) {
      return "error: " + (e && e.message ? e.message : e);
    }
    const c = all ? t.split(oldS).length - 1 : (t.indexOf(oldS) >= 0 ? 1 : 0);
    if (!c) return "error: old_string not found";
    t = all ? t.split(oldS).join(newS) : t.replace(oldS, newS);
    unixWrite(path, t);
    return "matches " + c + "\nok";
  }
  // Multiline-safe: write helper script (python -c breaks over serial)
  const py =
    "import pathlib,sys\n" +
    "p=pathlib.Path(" + JSON.stringify(path) + ")\n" +
    "t=p.read_text(encoding='utf-8',errors='replace')\n" +
    "o=" + JSON.stringify(oldS) + "\n" +
    "n=" + JSON.stringify(newS) + "\n" +
    "c=t.count(o)\n" +
    "print('matches',c)\n" +
    (all
      ? "t2=t.replace(o,n)\n"
      : "t2=t.replace(o,n,1)\n") +
    "if c==0:\n" +
    "    sys.exit('old_string not found')\n" +
    "p.write_text(t2,encoding='utf-8')\n" +
    "print('ok')\n";
  await toolWrite({ path: "/tmp/.goar_edit.py", content: py });
  const r = await guestExec("python3 /tmp/.goar_edit.py", 60000);
  return "exit " + r.code + "\n" + r.output;
}
async function toolDelete(args) {
  if (!envReady) return "error: guest not ready";
  const path = (args.path || "").trim();
  const r = await guestExec("rm -rf -- " + JSON.stringify(path) + " && echo deleted", 20000);
  return "exit " + r.code + "\n" + r.output;
}
async function toolMove(args) {
  if (!envReady) return "error: guest not ready";
  const r = await guestExec("mkdir -p \"$(dirname " + JSON.stringify(args.dest) + ")\" 2>/dev/null; mv -- " + JSON.stringify(args.src) + " " + JSON.stringify(args.dest) + " && echo moved", 20000);
  return "exit " + r.code + "\n" + r.output;
}
async function toolCopy(args) {
  if (!envReady) return "error: guest not ready";
  const r = await guestExec("mkdir -p \"$(dirname " + JSON.stringify(args.dest) + ")\" 2>/dev/null; cp -a -- " + JSON.stringify(args.src) + " " + JSON.stringify(args.dest) + " && echo copied", 30000);
  return "exit " + r.code + "\n" + r.output;
}
async function toolMkdir(args) {
  if (!envReady) return "error: guest not ready";
  const r = await guestExec("mkdir -p -- " + JSON.stringify(args.path) + " && echo ok", 15000);
  return "exit " + r.code + "\n" + r.output;
}
async function toolGlob(args) {
  if (!envReady && (window.__emulator || window.__GOAR_UNIX)) { try { window.__goarMarkEnvReady?.(true, "lazy glob"); } catch (_) {} }
  if (!envReady && !(window.__emulator || window.__GOAR_UNIX)) return "error: guest not ready";
  let root = (args.root || "/workspace").trim();
  let pattern = (args.pattern || args.glob || "*").trim();
  // Support absolute patterns like /workspace/e2e_suite/**
  if (pattern.startsWith("/") && !args.root) {
    // derive root + name pattern
    if (pattern.endsWith("/**") || pattern.endsWith("/*")) {
      root = pattern.replace(/\/\*\*?$/, "") || "/";
      pattern = "*";
    } else if (pattern.includes("*")) {
      const last = pattern.lastIndexOf("/");
      root = pattern.slice(0, last) || "/";
      pattern = pattern.slice(last + 1) || "*";
    } else {
      root = pattern;
      pattern = "*";
    }
  }
  // strip **/ prefix for find -name
  pattern = pattern.replace(/^\*\*\//, "");
  if (pattern === "**" || pattern === "") pattern = "*";
  const r = await guestExec(
    "find " + JSON.stringify(root) + " -type f -name " + JSON.stringify(pattern) + " 2>/dev/null | head -200; " +
    "find " + JSON.stringify(root) + " -type f 2>/dev/null | head -50",
    30000
  );
  const out = (r.output || "").trim();
  return out || "(no matches)";
}
async function toolGrep(args) {
  if (!envReady) return "error: guest not ready";
  const path = (args.path || "/workspace").trim();
  const n = Math.min(Number(args.max_results || 50), 200);
  const r = await guestExec("grep -RIn -- " + JSON.stringify(args.pattern) + " " + JSON.stringify(path) + " 2>/dev/null | head -n " + n, 45000);
  return r.output || "(no matches)";
}
async function toolHttp(args) {
  const url = (args.url || "").trim();
  const method = (args.method || "GET").toUpperCase();
  const max = Math.min(Number(args.max_chars || 12000), 50000);
  if (!/^https?:\/\//i.test(url)) return "error: http(s) url required";
  try {
    if (typeof goarHostFetch === "function") {
      const r = await goarHostFetch(url, {
        method,
        headers: args.headers || {},
        body: args.body != null ? (typeof args.body === "string" ? args.body : JSON.stringify(args.body)) : undefined,
        maxBytes: max,
      });
      if (r) {
        return "HTTP " + r.status + " [" + (r.via || "?") + "]\n" + String(r.body || r.error || "").slice(0, max);
      }
    }
  } catch (e) { /* fall */ }
  try {
    const init = { method, headers: args.headers || {}, mode: "cors" };
    if (args.body != null && method !== "GET" && method !== "HEAD") init.body = typeof args.body === "string" ? args.body : JSON.stringify(args.body);
    const r = await fetch(url, init);
    return "HTTP " + r.status + " [browser-cors]\n" + (await r.text()).slice(0, max);
  } catch (e) {
    try {
      if (typeof toolGuestHttp === "function" && (envReady || window.__emulator || window.__GOAR_UNIX)) {
        const g = await toolGuestHttp({
          url,
          method,
          body: args.body || "",
          max_bytes: max,
          headers: typeof args.headers === "string" ? args.headers : "",
        });
        return "[via guest]\n" + String(g).slice(0, max + 200);
      }
    } catch (e2) {
      return "http_request failed: " + e.message + " | guest: " + e2.message;
    }
    return "http_request failed: " + e.message;
  }
}


