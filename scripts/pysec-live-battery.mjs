#!/usr/bin/env node
/**
 * Live-network pysec battery: invoke all async:true catalog tools in the real page.
 * Pass = tool ran and returned structured output (findings empty is OK).
 * Fail = throw, CORS, missing proxy, module error, empty crash.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const START = process.env.PYSEC_START || "";
const BASE = process.argv[2] || "http://127.0.0.1:8080/";
const OUT = process.argv[3] || "/workspace/screenshots/pysec-live-64.json";

const URL = "https://example.com/";
const URLQ = "https://example.com/?q=test&url=https://example.com/";
const HOST = "example.com";
const IP = "1.1.1.1";

function kwargsFor(id, catalog) {
  const tiny = {
    max_words: 4,
    max_checks: 4,
    max_templates: 4,
    max_paths: 4,
    max_payloads: 3,
    max_tests: 4,
    max_params: 4,
    max_plugins: 4,
    max_names: 4,
    limit: 10,
  };
  const pool = {
    url: /sqlmap|xss|inject|ssti|crlf|nosql|ssrf|param/.test(id) ? URLQ : URL,
    target: URL,
    targets: HOST,
    host: id === "internetdb.lookup" ? IP : HOST,
    domain: HOST,
    name: id === "cloud.bucket" ? "example" : HOST,
    company: "example",
    issuer: "https://accounts.google.com",
    ip: IP,
    query: HOST,
    gql: "{ __typename }",
    origin: "",
    auto_configure: true,
    ...tiny,
  };
  if (id === "takeover.check") pool.host = "this-should-not-exist-xyz." + HOST;
  if (/^graphql\./.test(id)) pool.url = "https://example.com/graphql";
  const tool = (catalog || []).find((t) => t.id === id);
  const names = (tool && tool.params ? tool.params : []).map((p) => p.name);
  if (!names.length) return {};
  const kw = {};
  for (const n of names) {
    if (pool[n] !== undefined) kw[n] = pool[n];
  }
  return kw;
}

function judge(id, raw) {
  const s = String(raw == null ? "" : raw);
  let j = null;
  try { j = JSON.parse(s); } catch (_) {}
  const err = (j && (j.error || (j.result && j.result.error))) || "";
  const blob = (s + " " + err).toLowerCase();
  if (/modulenotfound|no module named|not implemented|is not defined|cannot read|typeerror|syntaxerror/.test(blob)) {
    return { pass: false, why: "crash/impl: " + (err || s).slice(0, 160) };
  }
  if (/cors|failed to fetch|proxy not|not configured|via_proxy.?false.*error|load failed/.test(blob) && /ok"?\s*:\s*false/.test(blob)) {
    return { pass: false, why: "network: " + (err || s).slice(0, 160) };
  }
  if (j && j.ok === false && err && !/no findings|not vulnerable|timeout|http \d|status/.test(String(err).toLowerCase())) {
    // structured tool failure — still a run if it looks like a completed scan
    if (/timed out|timeout|status 0/.test(String(err).toLowerCase())) {
      return { pass: false, why: "timeout/unreachable: " + String(err).slice(0, 160) };
    }
    return { pass: false, why: String(err).slice(0, 180) };
  }
  if (j) return { pass: true, why: "structured" };
  if (s.length > 8 && !/^error:/i.test(s)) return { pass: true, why: "text" };
  return { pass: false, why: s.slice(0, 180) || "empty" };
}

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.setDefaultTimeout(180000);
const consoleErr = [];
page.on("pageerror", (e) => consoleErr.push(String(e)));
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });

const ready = await page.evaluate(async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    if (typeof window.ensurePysecWorker === "function") {
      try {
        await window.ensurePysecWorker();
        if (window.__pysecReady) return { ok: true, ms: Date.now() - t0 };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { ok: false, error: "ensurePysecWorker never ready" };
});
if (!ready.ok) {
  console.error("pysec not ready", ready);
  await browser.close();
  process.exit(2);
}
console.log("pysec ready in", ready.ms, "ms");

const catalog = await page.evaluate(() => {
  return (typeof pysecCatalogTools === "function" ? pysecCatalogTools() : []) || [];
});
const ids = catalog.filter((t) => t && t.async === true).map((t) => t.id);
console.log("live tools in page:", ids.length);
  if (START) {
    const i = ids.indexOf(START);
    if (i >= 0) {
      ids.splice(0, i);
      console.log("resuming from", START, "remaining", ids.length);
    }
  }
if (ids.length !== 64) console.warn("expected 64, got", ids.length);

const results = [];
for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  const kwargs = kwargsFor(id, catalog);
  const t0 = Date.now();
  let raw = "";
  try {
    raw = await page.evaluate(async ({ id, kwargs }) => {
      const run = window.toolPysec({ tool_id: id, kwargs });
      const to = new Promise((resolve) =>
        setTimeout(() => resolve(JSON.stringify({ ok: false, error: "client timeout 25s" })), 25000)
      );
      const out = await Promise.race([run, to]);
      return typeof out === "string" ? out : JSON.stringify(out);
    }, { id, kwargs });
  } catch (e) {
    raw = JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) });
  }
  const ms = Date.now() - t0;
  const j = judge(id, raw);
  results.push({
    id,
    pass: j.pass,
    why: j.why,
    ms,
    preview: String(raw).replace(/\s+/g, " ").slice(0, 220),
  });
  console.log((j.pass ? "PASS" : "FAIL") + "  " + id + "  " + ms + "ms  " + j.why.slice(0, 80));
}

await browser.close();

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass);
const report = {
  ts: new Date().toISOString(),
  total: results.length,
  passed,
  failed: failed.length,
  consoleErr: consoleErr.slice(0, 10),
  failedIds: failed.map((r) => r.id),
  results,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log("\n==== " + passed + "/" + results.length + " live pysec ====");
if (failed.length) {
  console.log("FAILED:");
  for (const r of failed) console.log(" - " + r.id + ": " + r.why);
}
process.exit(failed.length ? 1 : 0);
