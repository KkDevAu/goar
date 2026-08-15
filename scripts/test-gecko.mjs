import { chromium } from "playwright";

const BASE = process.env.GOAR_URL || "http://127.0.0.1:8080";
const shot = (n) => `/workspace/screenshots/${n}.png`;

async function main() {
  const browser = await chromium.launch({
    args: ["--enable-features=SharedArrayBuffer", "--ignore-gpu-blocklist", "--use-gl=angle"],
  });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

  console.log("=== chrome demo ===");
  await page.goto(`${BASE}/assets/gecko/chrome/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  let chromeState = {};
  for (let i = 0; i < 90; i++) {
    chromeState = await page.evaluate(() => {
      const screen = document.getElementById("screen");
      let pixels = 0;
      try {
        const c = document.createElement("canvas");
        c.width = 64; c.height = 64;
        const x = c.getContext("2d");
        x.drawImage(screen, 0, 0, 64, 64);
        const d = x.getImageData(0, 0, 64, 64).data;
        for (let k = 0; k < d.length; k += 4) if (d[k] + d[k + 1] + d[k + 2] > 30) pixels++;
      } catch (_) {}
      return {
        geckoLoad: typeof window.geckoLoad === "function",
        splashDone: !!(document.getElementById("splash") && document.getElementById("splash").classList.contains("done")),
        screenReady: !!(screen && screen.classList.contains("ready")),
        wisp: (document.getElementById("opt-wisp") || {}).value || "",
        opts: (() => { try { return localStorage.getItem("chrome-demo-opts"); } catch (_) { return ""; } })(),
        pixels,
      };
    });
    if (i % 6 === 0) console.log("tick", i, JSON.stringify(chromeState));
    if (chromeState.geckoLoad && chromeState.pixels > 20) break;
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: shot("gecko-chrome-after"), fullPage: true });
  console.log("chrome final", JSON.stringify(chromeState));

  console.log("=== goar computer ===");
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  for (let i = 0; i < 40; i++) {
    const cred = await page.evaluate(() => document.getElementById("credPhase")?.classList.contains("on"));
    if (cred) break;
    await page.waitForTimeout(800);
  }
  await page.evaluate(() => {
    const go = document.getElementById("credGo");
    if (go) { go.disabled = false; go.click(); }
    if (typeof finishEnterChat === "function") finishEnterChat();
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    if (typeof goarShowView === "function") goarShowView("computer");
  });

  let goar = {};
  for (let i = 0; i < 70; i++) {
    goar = await page.evaluate(() => {
      const frame = document.getElementById("geckoChromeFrame");
      const term = document.getElementById("term-tab");
      const termVis = term ? getComputedStyle(term).display : "none";
      let inner = {};
      try {
        const win = frame && frame.contentWindow;
        const doc = frame && frame.contentDocument;
        const screen = doc && doc.getElementById("screen");
        let pixels = 0;
        if (screen) {
          const c = document.createElement("canvas");
          c.width = 64; c.height = 64;
          const x = c.getContext("2d");
          x.drawImage(screen, 0, 0, 64, 64);
          const d = x.getImageData(0, 0, 64, 64).data;
          for (let k = 0; k < d.length; k += 4) if (d[k] + d[k + 1] + d[k + 2] > 30) pixels++;
        }
        inner = {
          geckoLoad: !!(win && typeof win.geckoLoad === "function"),
          splashDone: !!(doc && doc.getElementById("splash")?.classList.contains("done")),
          wisp: (doc && doc.getElementById("opt-wisp") && doc.getElementById("opt-wisp").value) || "",
          pixels,
        };
      } catch (e) {
        inner = { error: String(e.message || e) };
      }
      const r = frame ? frame.getBoundingClientRect() : { width: 0, height: 0 };
      return {
        tab: document.getElementById("browser-tab")?.classList.contains("open"),
        termDisplay: termVis,
        frame: !!frame,
        frameDisplay: frame ? getComputedStyle(frame).display : "none",
        frameW: Math.round(r.width),
        frameH: Math.round(r.height),
        status: typeof geckoStatus === "function" ? geckoStatus() : null,
        inner,
      };
    });
    if (i % 5 === 0) console.log("computer", i, JSON.stringify(goar));
    if (goar.inner && goar.inner.geckoLoad && goar.inner.pixels > 20) break;
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: shot("goar-computer-final"), fullPage: true });

  const badWisp = logs.filter((l) => l.includes("not authorized") || l.includes("wisp"));
  console.log("=== wisp/logs ===");
  badWisp.slice(-15).forEach((l) => console.log(l));
  logs.filter((l) => l.includes("Firefox") || l.includes("front-end") || l.includes("pageerror")).forEach((l) => console.log(l));
  console.log("=== RESULT ===");
  console.log(JSON.stringify({ chromeState, goar }, null, 2));
  await browser.close();
  const ok = !!(goar.inner && goar.inner.geckoLoad && goar.frameW > 400 && goar.termDisplay === "none");
  process.exit(ok ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
