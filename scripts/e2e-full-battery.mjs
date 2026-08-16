#!/usr/bin/env node
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:8080/";
const DIR = "/workspace/screenshots";
const report = { ui: [], tools: [], term: [], browser: [], loop: [], fail: [] };

function ok(bucket, name, detail) {
  report[bucket].push({ name, ok: true, detail: String(detail || "").slice(0, 180) });
  console.log("PASS", bucket, name, detail ? String(detail).slice(0, 80) : "");
}
function fail(bucket, name, detail) {
  report[bucket].push({ name, ok: false, detail: String(detail || "").slice(0, 280) });
  report.fail.push(bucket + ":" + name);
  console.log("FAIL", bucket, name, String(detail || "").slice(0, 160));
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
const pageErr = [];
page.on("pageerror", (e) => pageErr.push(String(e)));

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => {
  const s = document.getElementById("step")?.textContent || "";
  const cred = document.getElementById("credPhase");
  const credOn = cred && (cred.classList.contains("on") || cred.classList.contains("show") || !cred.hidden);
  return /Ready|Failed|Pack failed/i.test(s) || credOn;
}, { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(800);
await page.screenshot({ path: DIR + "/battery-01-boot.png" });

const boot = await page.evaluate(() => ({
  step: document.getElementById("step")?.textContent,
  pct: document.getElementById("pct")?.textContent,
  emu: !!window.__emulator,
  runTool: typeof runAgentTool === "function",
  show: typeof goarShowView === "function",
}));
if (/Ready|Starting|Sandbox/i.test(boot.step || "") || boot.emu) ok("ui", "boot", boot.step + " " + boot.pct);
else fail("ui", "boot", JSON.stringify(boot));

await page.evaluate(() => {
  try {
    if (typeof saveSettings === "function") {
      saveSettings({
        provider: "openrouter",
        apiKey: "sk-e2e-local",
        apiModel: "test-model",
        apiBase: "https://openrouter.ai/api/v1",
      });
    }
  } catch (_) {}
  if (typeof finishEnterChat === "function") finishEnterChat();
  document.body.classList.add("goar-ready");
  document.getElementById("setup")?.classList.add("hide");
  document.getElementById("app")?.classList.add("show");
});
await page.waitForTimeout(600);
await page.screenshot({ path: DIR + "/battery-02-chat.png" });

const chatOn = await page.evaluate(() => {
  const app = document.getElementById("app");
  const input = document.getElementById("msg-input");
  return {
    appShow: app && getComputedStyle(app).display !== "none",
    input: !!(input && input.offsetParent !== null),
    welcome: !!document.getElementById("welcome"),
  };
});
if (chatOn.appShow && chatOn.input) ok("ui", "enter-chat", "composer visible");
else fail("ui", "enter-chat", JSON.stringify(chatOn));

const views = [
  ["computer", "#browser-tab"],
  ["term", "#term-tab"],
  ["ide", "#ide-shell"],
  ["chat", "#chat"],
];
for (const [view, sel] of views) {
  const vis = await page.evaluate(({ view, sel }) => {
    if (typeof goarShowView === "function") goarShowView(view);
    const el = document.querySelector(sel);
    if (!el) return { missing: true };
    const cs = getComputedStyle(el);
    return {
      display: cs.display,
      open: el.classList.contains("open") || el.classList.contains("active") || el.classList.contains("view-active"),
      w: el.offsetWidth,
      h: el.offsetHeight,
    };
  }, { view, sel });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${DIR}/battery-view-${view}.png` });
  if (view === "chat") {
    if (vis.w > 200) ok("ui", "nav-" + view, JSON.stringify(vis));
    else fail("ui", "nav-" + view, JSON.stringify(vis));
  } else if (vis.open && vis.w > 100 && vis.display !== "none") ok("ui", "nav-" + view, JSON.stringify(vis));
  else fail("ui", "nav-" + view, JSON.stringify(vis));
}

await page.evaluate(() => { if (typeof goarShowView === "function") goarShowView("chat"); });

const menu = await page.evaluate(() => {
  document.getElementById("btn-menu")?.click();
  const ov = document.getElementById("drawer-overlay");
  return ov ? { open: ov.classList.contains("open"), display: getComputedStyle(ov).display } : { missing: true };
});
await page.screenshot({ path: DIR + "/battery-03-menu.png" });
if (menu.open || menu.display === "block") ok("ui", "menu", JSON.stringify(menu));
else fail("ui", "menu", JSON.stringify(menu));

const hist = await page.evaluate(() => {
  document.getElementById("menu-history")?.click();
  if (typeof toggleHistory === "function") toggleHistory(true);
  const ov = document.getElementById("history-overlay");
  return ov ? { open: ov.classList.contains("open"), display: getComputedStyle(ov).display } : { missing: true };
});
if (hist.open || hist.display === "block") ok("ui", "history", JSON.stringify(hist));
else fail("ui", "history", JSON.stringify(hist));
await page.evaluate(() => { document.getElementById("history-overlay")?.classList.remove("open"); document.getElementById("drawer-overlay")?.classList.remove("open"); });

const settings = await page.evaluate(() => {
  if (typeof openSettings === "function") openSettings();
  else document.getElementById("btn-settings")?.click();
  const box = document.getElementById("settings");
  const cs = box ? getComputedStyle(box) : {};
  return { open: box?.classList.contains("open"), display: cs.display, provider: !!document.getElementById("provider") };
});
await page.screenshot({ path: DIR + "/battery-04-settings.png" });
if ((settings.open || settings.display === "flex") && settings.provider) ok("ui", "settings", JSON.stringify(settings));
else fail("ui", "settings", JSON.stringify(settings));
await page.evaluate(() => { if (typeof closeSettings === "function") closeSettings(); });

const chips = await page.evaluate(() => {
  const chip = document.querySelector(".w-chip");
  return { n: document.querySelectorAll(".w-chip").length, q: chip?.getAttribute("data-q") };
});
if (chips.n >= 3) ok("ui", "welcome-chips", chips.n + " " + chips.q);
else fail("ui", "welcome-chips", JSON.stringify(chips));

await page.fill("#msg-input", "ping from battery");
const typed = await page.inputValue("#msg-input");
if (typed.includes("ping")) ok("ui", "composer-type", typed);
else fail("ui", "composer-type", typed);

// wait guest
const guestUp = await page.waitForFunction(() => !!(window.__emulator && typeof guestExec === "function"), { timeout: 25000 }).then(() => true).catch(() => false);
if (guestUp) ok("term", "emulator", "serial ready");
else fail("term", "emulator", "no __emulator");

await page.evaluate(() => { if (typeof goarShowView === "function") goarShowView("term"); });
await page.waitForTimeout(500);
const termVis = await page.evaluate(() => {
  const tab = document.getElementById("term-tab");
  const termEl = document.getElementById("terminal");
  return {
    tabOpen: tab && (tab.classList.contains("open") || tab.classList.contains("active")),
    termH: termEl?.offsetHeight || 0,
    live: termEl?.classList.contains("live"),
  };
});
await page.screenshot({ path: DIR + "/battery-05-term.png" });
if (termVis.tabOpen && termVis.termH > 40) ok("term", "term-view", JSON.stringify(termVis));
else fail("term", "term-view", JSON.stringify(termVis));

if (guestUp) {
  const echo = await page.evaluate(async () => {
    try {
      const r = await guestExec("echo GOAR_TERM_OK; uname -a; pwd", 20000);
      return r;
    } catch (e) { return { error: String(e) }; }
  });
  const out = JSON.stringify(echo);
  if (/GOAR_TERM_OK/.test(out)) ok("term", "guest-echo", out.slice(0, 120));
  else fail("term", "guest-echo", out);
  const py = await page.evaluate(async () => {
    try { return await guestExec("python3 -c 'print(40+2)'", 20000); }
    catch (e) { return { error: String(e) }; }
  });
  if (/42/.test(JSON.stringify(py))) ok("term", "python3", JSON.stringify(py).slice(0, 120));
  else fail("term", "python3", JSON.stringify(py));
}

await page.evaluate(() => { if (typeof goarShowView === "function") goarShowView("computer"); });
await page.waitForTimeout(1200);
const br = await page.evaluate(() => {
  const tab = document.getElementById("browser-tab");
  const url = document.getElementById("browser-url");
  const canvas = document.getElementById("screen") || document.querySelector("#browser-frame-wrap canvas");
  return {
    open: tab && (tab.classList.contains("open") || tab.classList.contains("active")),
    url: url?.value,
    canvas: !!(canvas && canvas.width),
    cw: canvas?.width || 0,
    ch: canvas?.height || 0,
    gecko: typeof geckoStatus === "function" ? geckoStatus() : null,
  };
});
await page.screenshot({ path: DIR + "/battery-06-browser.png" });
if (br.open && br.url) ok("browser", "client-chrome", JSON.stringify(br).slice(0, 160));
else fail("browser", "client-chrome", JSON.stringify(br));

const navClient = await page.evaluate(async () => {
  const input = document.getElementById("browser-url");
  const form = document.getElementById("browser-url-form");
  if (input) {
    input.value = "https://example.com/";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (form) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  else if (typeof geckoLoad === "function") await geckoLoad("https://example.com/");
  await new Promise((r) => setTimeout(r, 1500));
  return {
    url: document.getElementById("browser-url")?.value,
    gecko: typeof geckoStatus === "function" ? geckoStatus() : null,
  };
});
if (/example|duckduckgo/i.test(navClient.url || "")) ok("browser", "client-url", navClient.url);
else fail("browser", "client-url", JSON.stringify(navClient));

const CORE = [
  ["think", { text: "battery check" }],
  ["todo", { action: "list" }],
  ["create_plan", { title: "battery", steps: ["a", "b"] }],
  ["env_info", {}],
  ["discover", { query: "hash sha256" }],
  ["list_session_tools", {}],
  ["mw_status", {}],
  ["browser_status", {}],
  ["gecko_status", {}],
  ["kit", { action: "discover", query: "hash" }],
  ["mind", { action: "think", text: "ok" }],
  ["kv", { action: "kv_status" }],
  ["net", { action: "gecko_status" }],
];

if (guestUp) {
  CORE.push(
    ["guest", { action: "bash", command: "echo GUEST_OK && ls /workspace | head" }],
    ["bash", { command: "echo BASH_OK" }],
    ["python_exec", { code: "print('PY_OK', 6*7)" }],
    ["write_file", { path: "/workspace/battery_e2e.txt", content: "hello-battery\n" }],
    ["read_file", { path: "/workspace/battery_e2e.txt" }],
    ["list_dir", { path: "/workspace" }],
    ["mkdir", { path: "/workspace/battery_dir" }],
    ["workspace_tree", { path: "/workspace" }],
  );
}

for (const [name, args] of CORE) {
  const r = await page.evaluate(async ({ name, args }) => {
    if (typeof runAgentTool !== "function") return { missing: true };
    try {
      const out = await runAgentTool(name, args);
      return { out: typeof out === "string" ? out : JSON.stringify(out) };
    } catch (e) {
      return { error: String(e && e.message ? e.message : e) };
    }
  }, { name, args });
  const text = r.out || r.error || JSON.stringify(r);
  const bad = r.missing || r.error || /TOOL_ERROR|not loaded|is not defined|TypeError/i.test(text);
  if (bad && !/ok["']?\s*:\s*true/i.test(text)) fail("tools", name, text);
  else ok("tools", name, text);
}

// pysec sample across lanes
const PYSEC = [
  ["pysec_crypto", { tool: "hash", kwargs: { algo: "sha256", data: "goar" } }],
  ["pysec", { tool_id: "codec.b64", kwargs: { action: "encode", data: "goar" } }],
];
for (const [name, args] of PYSEC) {
  const r = await page.evaluate(async ({ name, args }) => {
    if (typeof runAgentTool !== "function") return { missing: true };
    try {
      const out = await runAgentTool(name, args);
      return { out: typeof out === "string" ? out : JSON.stringify(out) };
    } catch (e) { return { error: String(e && e.message ? e.message : e) }; }
  }, { name, args });
  const text = r.out || r.error || JSON.stringify(r);
  const id = args.tool_id || args.tool || name;
  const digest = "01858a949a488cf675f20f3896d6f960e4753f3f0808b1cdebcd3984dacdfded";
  const liveOk = id === "codec.b64"
    ? /Z29hcg==/.test(text)
    : text.indexOf(digest) !== -1;
  if (r.missing || r.error || /TOOL_ERROR|not defined|unknown tool/i.test(text) || !liveOk) fail("tools", name + ":" + id, text);
  else ok("tools", name + ":" + id, text);
}

const agentBrowse = await page.evaluate(async () => {
  if (typeof runAgentTool !== "function") return { missing: true };
  try {
    const st = await runAgentTool("gecko_status", {});
    const load = await runAgentTool("gecko_load", { url: "https://example.com/" });
    return { st, load };
  } catch (e) { return { error: String(e) }; }
});
await page.screenshot({ path: DIR + "/battery-07-agent-browser.png" });
const ab = JSON.stringify(agentBrowse);
if (agentBrowse.missing) fail("browser", "agent-gecko", "runAgentTool missing");
else if (/error|not loaded/i.test(ab) && !/ready/i.test(ab)) fail("browser", "agent-gecko", ab);
else ok("browser", "agent-gecko", ab.slice(0, 180));

const loop = await page.evaluate(() => {
  const out = {};
  out.hasTurn = typeof runAgentTurn === "function" || typeof startAgentTurn === "function" || typeof agentTurn === "function";
  out.anti = typeof antiRepeatCheck === "function" || typeof shouldSkipRepeat === "function" || typeof recordToolCall === "function";
  out.compact = typeof compactMessages === "function" || typeof compactContext === "function";
  out.names = Object.getOwnPropertyNames(window).filter((k) => /repeat|compact|turn|vibe/i.test(k)).slice(0, 20);
  return out;
});
if (loop.hasTurn || loop.names.length) ok("loop", "runtime-present", JSON.stringify(loop));
else fail("loop", "runtime-present", JSON.stringify(loop));

if (guestUp) {
  const script = await page.evaluate(async () => {
    await runAgentTool("write_file", {
      path: "/workspace/battery_run.py",
      content: "print('SCRIPT_OK')\nprint(2+2)\n",
    });
    return await runAgentTool("python_exec", { path: "/workspace/battery_run.py" });
  });
  if (/SCRIPT_OK|4/.test(String(script))) ok("tools", "script-exec", String(script).slice(0, 120));
  else fail("tools", "script-exec", String(script));
}

await page.evaluate(() => { if (typeof goarShowView === "function") goarShowView("chat"); });
await page.screenshot({ path: DIR + "/battery-08-final.png" });

const pass = report.ui.filter((x) => x.ok).length + report.tools.filter((x) => x.ok).length + report.term.filter((x) => x.ok).length + report.browser.filter((x) => x.ok).length + report.loop.filter((x) => x.ok).length;
const total = report.ui.length + report.tools.length + report.term.length + report.browser.length + report.loop.length;
console.log("\n==== BATTERY", pass + "/" + total, "fail", report.fail.length, "====");
console.log(JSON.stringify({ fail: report.fail, pageErr: pageErr.slice(0, 8), counts: {
  ui: report.ui.length, tools: report.tools.length, term: report.term.length, browser: report.browser.length, loop: report.loop.length, pass, total,
} }, null, 2));
await browser.close();
process.exit(report.fail.length ? 1 : 0);
