#!/usr/bin/env node
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:8080/";
const KEY = process.env.GOAR_E2E_KEY || "";
const dir = "/workspace/screenshots";

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(25000);
const notes = [];

async function shot(name) {
  await page.waitForTimeout(280);
  await page.screenshot({ path: `${dir}/user-${name}.png` });
  notes.push(name);
}

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(900);
await shot("01-welcome");

await page.click("#ob-next-1");
await page.waitForTimeout(350);
await shot("02-provider");

const or = page.locator(".ob-preset").filter({ hasText: /OpenRouter/i });
if (await or.count()) await or.first().click();
if (KEY) {
  await page.fill("#credKey", KEY);
  await page.waitForFunction(() => {
    const s = document.getElementById("credModel");
    return s && s.options && s.options.length > 1;
  }, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => {
    const s = document.getElementById("credModel");
    const ids = [...s.options].map((o) => o.value);
    const prefer = ids.find((id) => /free|mini|nano|haiku/i.test(id)) || ids[1];
    if (prefer) { s.value = prefer; s.dispatchEvent(new Event("change")); }
  });
}
await shot("03-key-filled");
await page.click("#credGo");
await page.waitForTimeout(1800);
await shot("04-ready");
if (await page.locator("#ob-pane-3").isVisible()) await page.click("#ob-finish");
else await page.evaluate(() => { window.__goarOnboardDone = true; finishEnterChat?.(); });
await page.waitForTimeout(500);
await shot("05-chat");

// type as the user
await page.fill("#msg-input", "What can you see in this workspace?");
await shot("06-composer");
await page.click("#send-btn");
await page.waitForTimeout(12000);
await shot("07-thread");

await page.click("#btn-menu");
await page.waitForTimeout(350);
await shot("08-drawer");
await page.click("#drawer-settings");
await page.waitForTimeout(400);
await shot("09-settings");
await page.evaluate(() => closeSettings?.());

await page.evaluate(() => goarShowView?.("computer"));
await page.waitForTimeout(900);
await page.fill("#browser-url", "https://example.com");
await page.click("#browser-go");
await page.waitForTimeout(1100);
await shot("10-computer");

await page.evaluate(() => goarShowView?.("ide"));
await page.waitForTimeout(1400);
await shot("11-files");
const row = page.locator(".file-row").first();
if (await row.count()) {
  await row.click({ force: true });
  await page.waitForTimeout(700);
  await shot("12-ide");
}

await page.evaluate(() => goarShowView?.("skills"));
await page.waitForTimeout(300);
await shot("13-skills");

await page.evaluate(() => goarShowView?.("chat"));
await page.waitForTimeout(250);
await shot("14-chat-return");

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
await shot("15-mobile-chat");
await page.click("#btn-menu");
await page.waitForTimeout(280);
await shot("16-mobile-drawer");
await page.evaluate(() => {
  document.getElementById("drawer-overlay")?.classList.remove("open");
  goarShowView?.("computer");
});
await page.waitForTimeout(500);
await shot("17-mobile-computer");
await page.evaluate(() => goarShowView?.("ide"));
await page.waitForTimeout(400);
await shot("18-mobile-files");

console.log(JSON.stringify({ shots: notes }));
await browser.close();
