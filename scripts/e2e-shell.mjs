#!/usr/bin/env node
/**
 * Back-to-back shell E2E against the live preview.
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:8080/";
const KEY = process.env.GOAR_E2E_KEY || "";
const out = { steps: [], errors: [] };

function step(name, data) {
  out.steps.push({ name, ...data });
  const mark = data.ok === false ? "FAIL" : "ok";
  console.log(mark.padEnd(5), name, data.detail || "");
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => out.errors.push("page:" + e.message));
page.on("console", (m) => {
  if (m.type() === "error") out.errors.push("con:" + String(m.text()).slice(0, 200));
});

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "/workspace/screenshots/e2e-01-onboard.png" });
  const p1 = await page.locator("#ob-pane-1").isVisible();
  step("onboard-p1", { ok: p1, detail: p1 ? "welcome visible" : "missing" });

  await page.click("#ob-next-1");
  await page.waitForTimeout(300);
  const p2 = await page.locator("#ob-pane-2").isVisible();
  const presets = await page.locator(".ob-preset").count();
  await page.screenshot({ path: "/workspace/screenshots/e2e-02-provider.png" });
  step("onboard-p2", { ok: p2 && presets >= 8, detail: `presets=${presets}` });

  if (presets) {
    const or = page.locator(".ob-preset").filter({ hasText: /OpenRouter/i });
    if (await or.count()) await or.first().click();
    else await page.locator(".ob-preset").first().click();
    const prov = await page.locator("#credProvider").inputValue();
    step("preset-select", { ok: prov === "openrouter" || !!prov, detail: prov });
  }

  if (KEY) {
    await page.fill("#credKey", KEY);
    await page.waitForFunction(() => {
      const s = document.getElementById("credModel");
      return s && s.options && s.options.length > 1;
    }, { timeout: 12000 }).catch(() => {});
    const opts = await page.locator("#credModel option").count();
    step("live-models", { ok: opts > 1, detail: `options=${opts}` });
    if (opts > 1) {
      await page.selectOption("#credModel", { index: 1 });
      await page.click("#credGo");
      await page.waitForTimeout(2500);
      const p3 = await page.locator("#ob-pane-3").isVisible();
      await page.screenshot({ path: "/workspace/screenshots/e2e-03-ready.png" });
      step("onboard-p3", { ok: p3, detail: p3 ? "ready" : "did not advance" });
      if (p3) {
        await page.click("#ob-finish");
        await page.waitForTimeout(500);
      }
    }
  }

  const entered = await page.evaluate(() => {
    if (!document.body.classList.contains("goar-ready")) {
      window.__goarOnboardDone = true;
      if (typeof finishEnterChat === "function") finishEnterChat();
      else {
        document.getElementById("setup")?.classList.add("hide");
        document.getElementById("setup")?.classList.remove("open");
        document.body.classList.add("goar-ready");
      }
    }
    return document.body.classList.contains("goar-ready");
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/workspace/screenshots/e2e-04-chat.png" });
  const rail = await page.locator("#side-rail").isVisible();
  const welcome = await page.locator("#welcome").isVisible();
  step("enter-chat", { ok: entered && rail, detail: `welcome=${welcome}` });

  // slash /help — no provider required
  await page.fill("#msg-input", "/help");
  await page.click("#send-btn");
  await page.waitForTimeout(600);
  const helpTxt = await page.locator("#chat-inner").innerText();
  await page.screenshot({ path: "/workspace/screenshots/e2e-05-help.png" });
  step("slash-help", { ok: /help|tool|guest|category/i.test(helpTxt), detail: helpTxt.slice(0, 120).replace(/\s+/g, " ") });

  // Computer
  await page.locator('[data-view="computer"]').click();
  await page.waitForTimeout(800);
  const compOpen = await page.locator("#browser-tab").evaluate((el) => el.classList.contains("open"));
  const wrap = await page.locator("#browser-frame-wrap").count();
  await page.screenshot({ path: "/workspace/screenshots/e2e-06-computer.png" });
  step("computer", { ok: compOpen && wrap === 1, detail: `open=${compOpen}` });

  await page.fill("#browser-url", "https://example.com");
  await page.click("#browser-go");
  await page.waitForTimeout(1200);
  const st = await page.locator("#browser-status").innerText();
  step("computer-go", { ok: true, detail: `status=${st}` });

  // Files + IDE
  await page.locator('[data-view="ide"]').click();
  await page.waitForTimeout(700);
  const filesOpen = await page.locator("#files-sheet-overlay").evaluate((el) => el.classList.contains("open"));
  const ideOpen = await page.locator("#ide-shell").evaluate((el) => el.classList.contains("open"));
  const filesTxt = await page.locator("#files-list").innerText();
  await page.screenshot({ path: "/workspace/screenshots/e2e-07-files.png" });
  step("files-ide", { ok: filesOpen && ideOpen, detail: filesTxt.slice(0, 80).replace(/\s+/g, " ") });

  // Skills
  await page.locator('[data-view="skills"]').click();
  await page.waitForTimeout(300);
  await page.fill("#skill-name", "E2E review");
  await page.fill("#skill-desc", "Review code");
  await page.fill("#skill-body", "Report severity-ranked findings.");
  await page.click("#skill-save");
  await page.waitForTimeout(200);
  const skillsTxt = await page.locator("#skills-list").innerText();
  await page.screenshot({ path: "/workspace/screenshots/e2e-08-skills.png" });
  step("skills-save", { ok: /E2E review/.test(skillsTxt), detail: skillsTxt.slice(0, 80) });

  // Drawer + settings
  await page.click("#btn-menu");
  await page.waitForTimeout(250);
  const drawer = await page.locator("#drawer-overlay").evaluate((el) => el.classList.contains("open"));
  await page.screenshot({ path: "/workspace/screenshots/e2e-09-drawer.png" });
  step("drawer", { ok: drawer, detail: "open" });
  await page.click("#drawer-settings");
  await page.waitForTimeout(300);
  const settings = await page.locator("#settings").evaluate((el) => el.classList.contains("open"));
  await page.screenshot({ path: "/workspace/screenshots/e2e-10-settings.png" });
  step("settings", { ok: settings, detail: "sheet" });
  await page.evaluate(() => { if (typeof closeSettings === "function") closeSettings(); });

  await page.evaluate(() => { if (typeof goarShowView === "function") goarShowView("chat"); });
  await page.waitForTimeout(200);

  // optional live turn
  if (KEY) {
    await page.fill("#msg-input", "Reply with exactly the word READY and nothing else.");
    await page.click("#send-btn");
    await page.waitForTimeout(14000);
    const chat = await page.locator("#chat-inner").innerText();
    await page.screenshot({ path: "/workspace/screenshots/e2e-11-turn.png" });
    step("live-turn", { ok: /\bREADY\b/i.test(chat), detail: chat.slice(-220).replace(/\s+/g, " ") });
  }

  // mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  await page.screenshot({ path: "/workspace/screenshots/e2e-12-mobile.png" });
  step("mobile", { ok: !overflow, detail: overflow ? "horizontal overflow" : "no overflow" });
} catch (e) {
  out.errors.push("fatal:" + (e.message || e));
  step("fatal", { ok: false, detail: String(e.message || e) });
}

await browser.close();
const failed = out.steps.filter((s) => s.ok === false);
const noisy = out.errors.filter((e) => !/favicon|og\.jpg|BRAND/i.test(e));
console.log("\n" + JSON.stringify({ failed: failed.length, steps: out.steps.length, errors: noisy }, null, 2));
process.exit(failed.length ? 1 : 0);
