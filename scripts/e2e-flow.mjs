#!/usr/bin/env node
/**
 * End-to-end flow: load, scripts, host planes, categories, UI.
 * Writes /workspace/screenshots/e2e-*.png
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const URL = process.argv[2] || "http://127.0.0.1:8080/";
const OUT = "/workspace/screenshots";
mkdirSync(OUT, { recursive: true });

const report = { url: URL, consoleErrors: [], pageErrors: [], steps: [], ok: true };

function step(name, data) {
  report.steps.push({ name, ...data });
  const mark = data.ok === false ? "FAIL" : "OK  ";
  console.log(mark, name, data.detail || data.error || "");
  if (data.ok === false) report.ok = false;
}

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("console", (msg) => {
    if (msg.type() === "error") report.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => report.pageErrors.push(String(err?.message || err)));

  const resp = await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);

  step("http", { ok: resp && resp.status() === 200, detail: String(resp?.status()) });
  step("title", { ok: (await page.title()).includes("GOAR"), detail: await page.title() });

  const setup = await page.evaluate(() => {
    const logo = document.querySelector("#setup img.logo");
    const word = document.querySelector("#setup .word, #setup p.word");
    const cred = document.getElementById("credPhase");
    const bar = document.getElementById("barFill");
    const key = document.getElementById("credKey");
    const go = document.getElementById("credGo");
    const pct = document.getElementById("pct");
    return {
      hasLogo: !!(logo && logo.getAttribute("src")),
      logoSrcKind: logo && logo.src.startsWith("data:") ? "data" : logo ? "url" : "none",
      goarWordUnderLogo: !!(word && word.offsetParent !== null && /goar/i.test(word.textContent || "")),
      credOn: !!(cred && cred.classList.contains("on")),
      hasBar: !!bar,
      hasKey: !!key,
      hasGo: !!go,
      pct: pct ? pct.textContent : "",
    };
  });
  step("setup logo", { ok: setup.hasLogo && !setup.goarWordUnderLogo, detail: JSON.stringify(setup) });
  step("cred form", { ok: setup.credOn && setup.hasKey && setup.hasGo, detail: JSON.stringify(setup) });

  const globals = await page.evaluate(() => ({
    loadAll: typeof loadAll,
    runAgentTool: typeof runAgentTool,
    erudaInspect: typeof erudaInspect,
    runPage: typeof runPage,
    runHostCrypto: typeof runHostCrypto,
    runHostWasm: typeof runHostWasm,
    ensureGecko: typeof ensureGecko,
    goarKvSet: typeof goarKvSet,
    toolDiscover: typeof toolDiscover,
    resolveCategoryCall: typeof resolveCategoryCall,
    buildCategoryAgentTools: typeof buildCategoryAgentTools,
    buildVibeSystemPrompt: typeof buildVibeSystemPrompt,
    OPERATOR_CORE: typeof OPERATOR_CORE,
  }));
  const missingG = Object.entries(globals).filter(([, t]) => t !== "function" && t !== "string");
  step("globals", {
    ok: missingG.length === 0,
    detail: missingG.length ? "missing " + missingG.map(([k]) => k).join(",") : "all present",
    globals,
  });

  const tools = await page.evaluate(() => {
    const list = typeof buildCategoryAgentTools === "function" ? buildCategoryAgentTools() : [];
    return { n: list.length, names: list.map((t) => t.function?.name || t.name) };
  });
  step("category tools ≤128", {
    ok: tools.n > 0 && tools.n <= 128,
    detail: tools.n + " → " + (tools.names || []).join(","),
  });

  const crypto = await page.evaluate(async () => {
    const r = await runHostCrypto({ action: "hash", algo: "sha256", data: "goar" });
    return r;
  });
  step("host crypto sha256", {
    ok: !!(crypto && crypto.ok && crypto.hex && crypto.hex.length === 64),
    detail: JSON.stringify(crypto),
  });

  const wasm = await page.evaluate(async () => {
    return runHostWasm({ action: "status" });
  });
  step("wasm status", { ok: !!(wasm && wasm.ok && wasm.webassembly), detail: JSON.stringify(wasm) });

  const kv = await page.evaluate(async () => {
    if (typeof ensureGoarKv === "function") await ensureGoarKv();
    await goarKvSet("e2e", "ok", { ns: "session" });
    return goarKvGet("e2e", { ns: "session" });
  });
  step("kv roundtrip", { ok: !!(kv && (kv.value === "ok" || kv === "ok" || JSON.stringify(kv).includes("ok"))), detail: JSON.stringify(kv) });

  const disc = await page.evaluate(() => toolDiscover({ query: "hash a string" }));
  let discOk = false;
  try {
    const j = typeof disc === "string" ? JSON.parse(disc) : disc;
    discOk = !!(j && (j.hits || j.matches || j.ok !== false));
  } catch (_) {
    discOk = String(disc).length > 10;
  }
  step("discover hash", { ok: discOk, detail: String(disc).slice(0, 280) });

  const resolved = await page.evaluate(() => {
    const a = resolveCategoryCall("kit", { action: "crypto", algo: "sha256", data: "x" });
    const b = resolveCategoryCall("net", { action: "page", method: "goto", url: "https://example.com" });
    const c = resolveCategoryCall("net", { action: "inspect" });
    return { a, b, c };
  });
  step("resolve kit crypto / net page / inspect", {
    ok: resolved.a?.name === "crypto" && resolved.b?.name === "page" && resolved.c?.name === "inspect",
    detail: JSON.stringify(resolved),
  });

  await page.screenshot({ path: OUT + "/e2e-setup.png" });

  // menu
  const menu = await page.evaluate(() => {
    const btn = document.getElementById("btn-menu") || document.getElementById("btn-sidebar") || document.querySelector("[data-open-sidebar]");
    const close = document.getElementById("btn-sidebar-close");
    const chips = document.querySelectorAll(".tool-item").length;
    return { hasClose: !!close, chips };
  });
  step("sidebar tools", { ok: menu.chips >= 8 && menu.hasClose, detail: JSON.stringify(menu) });

  // mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  step("mobile no overflow", {
    ok: overflow.sw <= overflow.cw + 2,
    detail: JSON.stringify(overflow),
  });
  await page.screenshot({ path: OUT + "/e2e-mobile.png" });

  const fatal = report.pageErrors.filter((e) => !/ResizeObserver|favicon/i.test(e));
  const cons = report.consoleErrors.filter((e) => !/favicon|404.*ibb|Failed to load resource.*ibb/i.test(e));
  step("no page errors", { ok: fatal.length === 0, detail: fatal.slice(0, 6).join(" | ") });
  step("console clean-ish", { ok: cons.length === 0, detail: cons.slice(0, 6).join(" | ") || "clean" });
} catch (e) {
  step("runner", { ok: false, error: String(e && e.message ? e.message : e) });
} finally {
  await browser.close();
}

writeFileSync(OUT + "/e2e-report.json", JSON.stringify(report, null, 2));
console.log("\n" + (report.ok ? "E2E PASS" : "E2E FAIL"));
process.exit(report.ok ? 0 : 1);
