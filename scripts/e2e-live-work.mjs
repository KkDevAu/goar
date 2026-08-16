import { chromium } from "playwright";
import fs from "node:fs";

const url = (process.argv[2] || "http://127.0.0.1:8080/") + (String(process.argv[2] || "").includes("?") ? "&" : "?") + "t=" + Date.now();
const shot = process.argv[3] || "/workspace/screenshots/live-work.png";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => typeof paintComposerMode === "function", null, { timeout: 45000 });
const cred = page.locator("#credGo");
if (await cred.isVisible().catch(() => false)) {
  await cred.click();
  await page.waitForTimeout(800);
}
await page.evaluate(() => {
  try { if (typeof goarShowView === "function") goarShowView("chat"); } catch (_) {}
});
await page.waitForSelector("#msg-input", { state: "attached", timeout: 15000 });
await page.waitForTimeout(400);
const info = await page.evaluate(() => {
  const input = document.getElementById("msg-input");
  const welcome = document.querySelector("#welcome .w-sub");
  const live = document.getElementById("live-work");
  const abort = document.getElementById("abortBtn");
  return {
    placeholder: input && input.placeholder,
    welcome: welcome && welcome.textContent,
    liveExists: !!live,
    liveHidden: live ? live.hidden : null,
    abortExists: !!abort,
    paint: typeof paintComposerMode,
    steer: typeof queueSteer,
    send: typeof sendCommand,
    stop: typeof requestAgentStop,
  };
});
await page.screenshot({ path: shot.replace(".png", "-idle.png"), fullPage: false });

const running = await page.evaluate(() => {
  agentBusy = true;
  if (typeof setRunningUI === "function") setRunningUI(true, "write /workspace/goar-scanner.py");
  const live = document.getElementById("live-work");
  const send = document.getElementById("send-btn");
  const input = document.getElementById("msg-input");
  return {
    liveHidden: live ? live.hidden : null,
    liveText: document.getElementById("live-work-text")?.textContent || "",
    sendStop: send ? send.classList.contains("is-stop") : false,
    sendLabel: send ? send.getAttribute("aria-label") : "",
    placeholder: input && input.placeholder,
  };
});
await page.screenshot({ path: shot, fullPage: false });

const steered = await page.evaluate(async () => {
  const input = document.getElementById("msg-input");
  input.value = "also add a README";
  if (typeof paintComposerMode === "function") paintComposerMode();
  const beforeSend = document.getElementById("send-btn")?.classList.contains("is-stop");
  if (typeof sendCommand === "function") await sendCommand();
  return {
    queue: window.__GOAR_STEER || [],
    placeholder: input.placeholder,
    sendStopBefore: beforeSend,
    sendStopAfter: document.getElementById("send-btn")?.classList.contains("is-stop"),
  };
});

await page.evaluate(() => {
  agentBusy = false;
  if (typeof setRunningUI === "function") setRunningUI(false, "");
});

const report = { info, running, steered, errors: errors.filter((e) => !/sandbox|iframe/i.test(e)).slice(0, 12) };
fs.writeFileSync("/workspace/screenshots/live-work-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (info.placeholder !== "Request Anything") process.exit(2);
if (!info.liveExists || !info.abortExists) process.exit(3);
if (running.liveHidden !== false) process.exit(4);
if (!/write \/workspace\/goar-scanner\.py/i.test(running.liveText)) process.exit(6);
if (!steered.queue.length) process.exit(5);
