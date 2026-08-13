#!/usr/bin/env node
/**
 * Act as the GOAR agent: enter the product, run every category tool,
 * then one live agent turn. Writes /workspace/screenshots/agent-*.png
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:8080/";
const KEY = process.env.GOAR_E2E_KEY || "";
const results = [];

function rec(name, ok, detail) {
  const row = { name, ok: !!ok, detail: String(detail || "").slice(0, 280) };
  results.push(row);
  console.log((row.ok ? "PASS" : "FAIL").padEnd(5), name, "·", row.detail.replace(/\s+/g, " ").slice(0, 140));
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

async function enter() {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(800);
  await page.click("#ob-next-1");
  await page.waitForTimeout(300);
  const or = page.locator(".ob-preset").filter({ hasText: /OpenRouter/i });
  if (await or.count()) await or.first().click();
  if (KEY) {
    await page.fill("#credKey", KEY);
    await page.waitForFunction(() => {
      const s = document.getElementById("credModel");
      return s && s.options && s.options.length > 1;
    }, { timeout: 15000 }).catch(() => {});
    const n = await page.locator("#credModel option").count();
    if (n > 1) {
      // prefer a cheap free model if present
      const picked = await page.evaluate(() => {
        const s = document.getElementById("credModel");
        const ids = [...s.options].map((o) => o.value);
        const prefer = ids.find((id) => /free|nano|mini|haiku/i.test(id)) || ids[1];
        s.value = prefer;
        s.dispatchEvent(new Event("change"));
        return prefer;
      });
      rec("models", true, picked);
      await page.click("#credGo");
      await page.waitForTimeout(2000);
      if (await page.locator("#ob-pane-3").isVisible()) await page.click("#ob-finish");
    } else rec("models", false, "no live models");
  }
  await page.evaluate(() => {
    window.__goarOnboardDone = true;
    if (typeof finishEnterChat === "function") finishEnterChat();
  });
  await page.waitForTimeout(400);
  rec("enter", await page.evaluate(() => document.body.classList.contains("goar-ready")), "shell");
}

async function waitEnv(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const st = await page.evaluate(() => {
      try { return (window.__GOAR_GET_ENV && window.__GOAR_GET_ENV()) || {}; } catch (e) { return { err: String(e) }; }
    });
    if (st.envReady) return st;
    await page.waitForTimeout(2000);
  }
  return page.evaluate(() => (window.__GOAR_GET_ENV && window.__GOAR_GET_ENV()) || {});
}

async function tool(name, args) {
  return page.evaluate(async ({ name, args }) => {
    if (typeof window.__GOAR_RUN_TOOL !== "function") return "NO_DISPATCH";
    try {
      const r = await window.__GOAR_RUN_TOOL(name, args);
      return typeof r === "string" ? r : JSON.stringify(r);
    } catch (e) {
      return "THROW: " + (e && e.message ? e.message : e);
    }
  }, { name, args });
}

function okish(s) {
  const t = String(s || "");
  if (!t || t === "NO_DISPATCH") return false;
  if (/^THROW:/.test(t)) return false;
  if (/TOOL_ERROR|error: guest environment not ready|env not ready/i.test(t) && t.length < 80) return false;
  return true;
}

try {
  await enter();
  const env = await waitEnv(90000);
  rec("env", !!env.envReady, JSON.stringify(env));

  // --- act as the agent: every category ---
  const kitDisc = await tool("kit", { action: "discover", query: "hash aes http dns" });
  rec("kit.discover", okish(kitDisc) && /pysec|kit|crypto/i.test(kitDisc), kitDisc);

  const kitList = await tool("kit", { action: "list_session_tools" });
  rec("kit.list", okish(kitList), kitList);

  const kitCrypto = await tool("kit", { action: "crypto", algo: "sha256", text: "goar-validate" });
  rec("kit.crypto", okish(kitCrypto) && /[a-f0-9]{32,}/i.test(kitCrypto), kitCrypto);

  const kvSet = await tool("kv", { action: "set", key: "agent.e2e", value: "ok" });
  const kvGet = await tool("kv", { action: "get", key: "agent.e2e" });
  rec("kv", okish(kvGet) && /ok/.test(kvGet), kvGet);

  const mind = await tool("mind", { action: "set_phase", phase: "ASSESS" });
  rec("mind", okish(mind), mind);

  const fetchOut = await tool("net", { action: "web_fetch", url: "https://example.com" });
  rec("net.fetch", okish(fetchOut) && /example/i.test(fetchOut), fetchOut);

  const browse = await tool("net", { action: "browse", url: "https://example.com" });
  rec("net.browse", okish(browse), browse);

  const hash = await tool("pysec_crypto", { tool: "hash.digest", kwargs: { data: "goar", algorithm: "sha256" } });
  rec("pysec.crypto", okish(hash) && /[a-f0-9]{32,}|digest|sha/i.test(hash), hash);

  const http = await tool("pysec_http", { tool: "httpx.probe", kwargs: { url: "https://example.com" } });
  rec("pysec.http", okish(http), http);

  const dns = await tool("pysec_recon", { tool: "dns.resolve", kwargs: { domain: "example.com" } });
  rec("pysec.recon", okish(dns), dns);

  if (env.envReady) {
    const ls = await tool("guest", { action: "list_dir", path: "/workspace" });
    rec("guest.ls", okish(ls), ls);
    const wr = await tool("guest", { action: "write_file", path: "/workspace/agent-e2e.txt", content: "agent-was-here\n" });
    rec("guest.write", okish(wr), wr);
    const rd = await tool("guest", { action: "read_file", path: "/workspace/agent-e2e.txt" });
    rec("guest.read", okish(rd) && /agent-was-here/.test(rd), rd);
    const sh = await tool("guest", { action: "bash", cmd: "uname -a && pwd" });
    rec("guest.bash", okish(sh) && /Linux|workspace/i.test(sh), sh);
  } else {
    rec("guest.ls", false, "alpine not ready — skipped write/read/bash");
  }

  // UI surfaces while tools ran
  await page.evaluate(() => { if (typeof goarShowView === "function") goarShowView("computer"); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/workspace/screenshots/agent-computer.png" });
  rec("ui.computer", await page.locator("#browser-tab").evaluate((el) => el.classList.contains("open")), "firefox stage");

  await page.evaluate(() => { if (typeof goarShowView === "function") goarShowView("ide"); });
  await page.waitForTimeout(1500);
  const filesTxt = await page.locator("#files-list").innerText();
  await page.screenshot({ path: "/workspace/screenshots/agent-files.png" });
  rec("ui.files", /agent-e2e|workspace|Alpine|Empty|\.txt/i.test(filesTxt), filesTxt);

  await page.evaluate(() => { if (typeof goarShowView === "function") goarShowView("chat"); });
  await page.waitForTimeout(200);

  // one real agent turn
  if (KEY) {
    const turn = await page.evaluate(async () => {
      if (typeof window.__GOAR_AGENT_TURN !== "function") return "NO_TURN";
      try {
        await window.__GOAR_AGENT_TURN(
          "Use kit crypto to sha256 the text goar-validate. Reply with the hex digest only after you actually ran the tool."
        );
        return document.getElementById("chat-inner")?.innerText || "";
      } catch (e) {
        return "THROW: " + (e && e.message ? e.message : e);
      }
    });
    await page.screenshot({ path: "/workspace/screenshots/agent-turn.png" });
    rec("agent.turn", /[a-f0-9]{32,}/i.test(turn) && !/^THROW:/.test(turn), turn);
  }

  await page.screenshot({ path: "/workspace/screenshots/agent-final.png" });
} catch (e) {
  rec("fatal", false, e.message || e);
}

await browser.close();
const fail = results.filter((r) => !r.ok);
console.log("\n" + JSON.stringify({
  passed: results.filter((r) => r.ok).length,
  failed: fail.length,
  total: results.length,
  fail: fail.map((f) => f.name + ": " + f.detail.slice(0, 100)),
  pageErrors: errors.slice(0, 8),
}, null, 2));
process.exit(fail.length ? 1 : 0);
