#!/usr/bin/env node
import { chromium } from "playwright";
import { writeFileSync } from "fs";

const BASE = process.argv[2] || "http://127.0.0.1:8080/";
const DIR = "/workspace/screenshots";
const fail = [];
const pass = [];
function ok(n, d) { pass.push(n); console.log("PASS", n, (d || "").slice(0, 100)); }
function bad(n, d) { fail.push(n); console.log("FAIL", n, String(d || "").slice(0, 180)); }

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErr = [];
page.on("pageerror", (e) => pageErr.push(String(e)));
page.setDefaultTimeout(20000);

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => {
  const s = document.getElementById("step")?.textContent || "";
  const cred = document.getElementById("credPhase");
  return /Ready|Failed/i.test(s) || (cred && (cred.classList.contains("on") || cred.classList.contains("show")));
}, { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(600);
await page.screenshot({ path: DIR + "/whole-01-boot.png" });
const boot = await page.evaluate(() => document.getElementById("step")?.textContent);
if (/Ready|Start|Sandbox/i.test(boot || "")) ok("boot", boot);
else bad("boot", boot);

await page.evaluate(() => {
  try {
    saveSettings?.({ provider: "openrouter", apiKey: "sk-e2e", apiModel: "test-model", apiBase: "https://openrouter.ai/api/v1" });
  } catch (_) {}
  finishEnterChat?.();
  document.body.classList.add("goar-ready");
  document.getElementById("setup")?.classList.add("hide");
  document.getElementById("app")?.classList.add("show");
});
await page.waitForTimeout(500);
await page.screenshot({ path: DIR + "/whole-02-chat.png" });
const chat = await page.evaluate(() => {
  const app = document.getElementById("app");
  const inp = document.getElementById("msg-input");
  return { show: app && getComputedStyle(app).display !== "none", input: !!(inp && inp.offsetParent !== null) };
});
if (chat.show && chat.input) ok("chat", "composer");
else bad("chat", JSON.stringify(chat));

const payload = await page.evaluate(() => {
  refreshAgentTools?.();
  const tools = typeof slimToolsForApi === "function" ? slimToolsForApi(getAgentTools()) : getAgentTools();
  const sys = typeof buildVibeSystemPrompt === "function" ? buildVibeSystemPrompt() : OPERATOR_CORE;
  const body = {
    model: "test-model",
    messages: [{ role: "system", content: sys }, { role: "user", content: "hi" }],
    tools,
    tool_choice: "auto",
    temperature: 0.2,
    max_tokens: 1536,
    stream: true,
  };
  return {
    names: tools.map((t) => t.function.name),
    n: tools.length,
    sys,
    sysTok: Math.ceil(sys.length / 4),
    toolsTok: Math.ceil(JSON.stringify(tools).length / 4),
    bodyTok: Math.ceil(JSON.stringify(body).length / 4),
    body,
  };
});
writeFileSync(DIR + "/whole-payload.json", JSON.stringify(payload.body, null, 2));
if (payload.n >= 12 && payload.n <= 16 && payload.bodyTok < 2500) ok("payload", payload.n + " tools ~" + payload.bodyTok + " tok");
else bad("payload", JSON.stringify({ n: payload.n, bodyTok: payload.bodyTok, names: payload.names }));
if (/GOAR Build|Finish the task|pysec/i.test(payload.sys) && !/Tool catalog/i.test(payload.sys)) ok("prompt", payload.sysTok + " tok");
else bad("prompt", payload.sys.slice(0, 200));

for (const [view, sel] of [["computer", "#browser-tab"], ["term", "#term-tab"], ["ide", "#ide-shell"], ["chat", "#chat"]]) {
  const vis = await page.evaluate(({ view, sel }) => {
    goarShowView?.(view);
    const el = document.querySelector(sel);
    if (!el) return { missing: true };
    const cs = getComputedStyle(el);
    return { display: cs.display, w: el.offsetWidth, h: el.offsetHeight, open: el.classList.contains("open") || el.classList.contains("active") || view === "chat" };
  }, { view, sel });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${DIR}/whole-view-${view}.png` });
  if (!vis.missing && vis.w > 100 && vis.display !== "none") ok("nav-" + view, vis.w + "x" + vis.h);
  else bad("nav-" + view, JSON.stringify(vis));
}

await page.evaluate(() => goarShowView?.("chat"));
const menu = await page.evaluate(() => {
  document.getElementById("btn-menu")?.click();
  const ov = document.getElementById("drawer-overlay");
  return ov && (ov.classList.contains("open") || getComputedStyle(ov).display === "block");
});
if (menu) ok("menu"); else bad("menu", "closed");
const settings = await page.evaluate(() => {
  openSettings?.();
  const box = document.getElementById("settings");
  return box && (box.classList.contains("open") || getComputedStyle(box).display === "flex");
});
if (settings) ok("settings"); else bad("settings");
await page.evaluate(() => closeSettings?.());

const guestUp = await page.waitForFunction(() => !!(window.__emulator && typeof guestExec === "function"), { timeout: 25000 }).then(() => true).catch(() => false);
if (guestUp) ok("emulator"); else bad("emulator", "no serial");

if (guestUp) {
  const echo = await page.evaluate(async () => guestExec("echo WHOLE_OK; python3 -c 'print(7*6)'", 20000));
  const t = JSON.stringify(echo);
  if (/WHOLE_OK/.test(t) && /42/.test(t)) ok("guest-cmd", t.slice(0, 80));
  else bad("guest-cmd", t);
}

await page.evaluate(() => goarShowView?.("computer"));
await page.waitForTimeout(800);
const br = await page.evaluate(() => {
  const tab = document.getElementById("browser-tab");
  const url = document.getElementById("browser-url");
  const canvas = document.getElementById("screen") || document.querySelector("#browser-frame-wrap canvas");
  return { open: tab && (tab.classList.contains("open") || tab.classList.contains("active")), url: url?.value, canvas: !!(canvas && canvas.width) };
});
await page.screenshot({ path: DIR + "/whole-browser.png" });
if (br.open && br.url) ok("browser-ui", br.url);
else bad("browser-ui", JSON.stringify(br));

await page.waitForFunction(() => typeof runAgentTool === "function", { timeout: 15000 }).catch(() => {});
const TOOLS = [
  ["think", { thought: "whole check" }],
  ["todo", { action: "list" }],
  ["scratch", { op: "write", name: "note", content: "whole" }],
  ["scratch", { op: "read", name: "note" }],
  ["pysec", { tool_id: "hash.digest", kwargs: { data: "goar", algorithm: "sha256" } }],
  ["workspace_tree", { path: "/workspace" }],
];
if (guestUp) {
  TOOLS.push(
    ["bash", { command: "echo BASH_OK" }],
    ["python_exec", { code: "print('PY_OK')" }],
    ["write_file", { path: "/workspace/whole.txt", content: "ok\n" }],
    ["read_file", { path: "/workspace/whole.txt" }],
    ["grep", { pattern: "ok", path: "/workspace/whole.txt" }],
  );
}
for (const [name, args] of TOOLS) {
  const r = await page.evaluate(async ({ name, args }) => {
    try {
      const out = await Promise.race([
        runAgentTool(name, args),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 18000)),
      ]);
      return String(out);
    } catch (e) { return "ERR " + e; }
  }, { name, args });
  const badHit = /^ERR |TOOL_ERROR|is not defined|TypeError/i.test(r) && !/ok["']?\s*:\s*true/i.test(r);
  if (badHit) bad("tool-" + name, r);
  else ok("tool-" + name, r.replace(/\n/g, " ").slice(0, 80));
}

const gecko = await page.evaluate(async () => {
  try {
    return String(await Promise.race([
      runAgentTool("browse", { url: "https://example.com/" }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 16000)),
    ])).slice(0, 200);
  } catch (e) { return "ERR " + e; }
});
if (/timeout|not defined|TOOL_ERROR/i.test(gecko) && !/example|ok/i.test(gecko)) bad("tool-browse", gecko);
else ok("tool-browse", gecko);

await page.evaluate(() => goarShowView?.("chat"));
await page.screenshot({ path: DIR + "/whole-final.png" });

console.log("\n==== WHOLE", pass.length + "/" + (pass.length + fail.length), "fail", fail.length, "====");
if (pageErr.length) console.log("pageErr", pageErr.slice(0, 6));
if (fail.length) console.log("fails", fail);
await browser.close();
process.exit(fail.length ? 1 : 0);
