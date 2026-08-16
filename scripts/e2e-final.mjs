#!/usr/bin/env node
/**
 * Final product E2E: chat first, contained browser, history (no drawer),
 * Grok colors, reliable fabric network.
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:8080/";
const out = { steps: [], errors: [] };
const fail = [];

function step(name, data) {
  out.steps.push({ name, ...data });
  const ok = data.ok !== false;
  if (!ok) fail.push(name);
  console.log((ok ? "ok   " : "FAIL "), name, data.detail || "");
}

const browser = await chromium.launch({
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => out.errors.push("page:" + e.message));
page.on("console", (m) => {
  if (m.type() === "error") out.errors.push("con:" + String(m.text()).slice(0, 220));
});

async function shot(name) {
  await page.screenshot({ path: `/workspace/screenshots/${name}.png` });
}

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot("final-01-boot");

  await page.waitForFunction(
    () => typeof finishEnterChat === "function" || document.getElementById("credGo"),
    { timeout: 45000 },
  ).catch(() => {});

  const entered = await page.evaluate(async () => {
    window.__goarOnboardDone = true;
    if (typeof finishEnterChat === "function") {
      finishEnterChat();
    } else {
      document.getElementById("setup")?.classList.add("hide");
      document.body.classList.add("goar-ready");
      document.getElementById("app")?.classList.add("show");
    }
    return true;
  });

  await page.waitForFunction(
    () => document.body.classList.contains("goar-ready"),
    { timeout: 25000 },
  ).catch(() => {});
  await page.waitForTimeout(1600);
  await shot("final-02-chat");

  const chatState = await page.evaluate(() => {
    const br = document.getElementById("browser-tab");
    const cs = br ? getComputedStyle(br) : null;
    const rail = document.getElementById("side-rail");
    const welcome = document.getElementById("welcome");
    const hist = document.getElementById("btn-history");
    const menu = document.getElementById("btn-menu");
    const drawer = document.getElementById("drawer-overlay");
    const mid = document.elementFromPoint(640, 360);
    return {
      ready: document.body.classList.contains("goar-ready"),
      view: document.body.className,
      hasComputer: document.body.classList.contains("view-computer"),
      brDisplay: cs ? cs.display : "missing",
      brLeft: br ? br.getBoundingClientRect().left : -1,
      railHit: !!(rail && rail.contains(document.elementFromPoint(20, 80))),
      welcome: welcome ? getComputedStyle(welcome).display : "missing",
      welcomeOn: welcome && (welcome.classList.contains("on") || welcome.classList.contains("show")),
      histBtn: !!(hist && getComputedStyle(hist).display !== "none"),
      menuBtn: !!(menu && getComputedStyle(menu).display !== "none" && menu.offsetParent),
      drawerDisplay: drawer ? getComputedStyle(drawer).display : "missing",
      midTag: mid ? (mid.id || mid.className || mid.tagName) : "",
      bg: getComputedStyle(document.body).backgroundColor,
      railBg: rail ? getComputedStyle(rail).backgroundColor : "",
    };
  });

  step("enter-chat", {
    ok: entered && chatState.ready && !chatState.hasComputer && chatState.brDisplay === "none",
    detail: JSON.stringify({
      ready: chatState.ready,
      view: chatState.view,
      br: chatState.brDisplay,
      welcome: chatState.welcome,
      hist: chatState.histBtn,
    }),
  });
  step("no-overlay-on-chat", {
    ok: chatState.brDisplay === "none" && !chatState.hasComputer && chatState.railHit,
    detail: `br=${chatState.brDisplay} view=${chatState.view} mid=${chatState.midTag}`,
  });
  step("history-not-menu", {
    ok: chatState.histBtn && !chatState.menuBtn && chatState.drawerDisplay === "none",
    detail: `hist=${chatState.histBtn} menu=${chatState.menuBtn} drawer=${chatState.drawerDisplay}`,
  });
  step("grok-bg", {
    ok: /rgb\(26,\s*27,\s*30\)/.test(chatState.bg) || /rgb\(26,\s*27,\s*30\)/.test(chatState.railBg),
    detail: `body=${chatState.bg} rail=${chatState.railBg}`,
  });

  await page.click("#btn-history");
  await page.waitForTimeout(250);
  const histOpen = await page.evaluate(() => {
    const ov = document.getElementById("history-overlay");
    const panel = document.getElementById("history-panel");
    return {
      open: !!(ov && ov.classList.contains("open")),
      vis: ov ? getComputedStyle(ov).display !== "none" : false,
      left: panel ? panel.getBoundingClientRect().left : -1,
      bg: panel ? getComputedStyle(panel).backgroundColor : "",
      text: (document.getElementById("history-list")?.innerText || "").slice(0, 80),
    };
  });
  await shot("final-03-history");
  step("history-overlay", {
    ok: histOpen.open && histOpen.vis && histOpen.left >= 50,
    detail: JSON.stringify(histOpen),
  });
  await page.evaluate(() => {
    if (typeof toggleHistory === "function") toggleHistory(false);
  });

  await page.locator('#side-rail [data-view="computer"]').click();
  await page.waitForTimeout(2200);
  const computer = await page.evaluate(() => {
    const br = document.getElementById("browser-tab");
    const rail = document.getElementById("side-rail");
    const chrome = document.querySelector(".ff-chrome") || document.querySelector(".ff-nav");
    const r = br ? br.getBoundingClientRect() : {};
    const railR = rail ? rail.getBoundingClientRect() : {};
    const frame = document.getElementById("goar-live-frame");
    let title = "";
    try { title = frame?.contentDocument?.title || ""; } catch (_) {}
    return {
      view: document.body.classList.contains("view-computer"),
      display: br ? getComputedStyle(br).display : "missing",
      left: r.left || 0,
      top: r.top || 0,
      width: r.width || 0,
      railW: railR.width || 0,
      railVisible: !!(rail && getComputedStyle(rail).display !== "none"),
      railHit: !!(rail && rail.contains(document.elementFromPoint(18, 90))),
      chromeBg: chrome ? getComputedStyle(chrome).backgroundColor : "",
      menubar: getComputedStyle(document.getElementById("ff-menubar") || document.createElement("div")).display,
      url: document.getElementById("browser-url")?.value || "",
      title,
      frameOk: !!(frame && frame.srcdoc && frame.srcdoc.length > 40),
    };
  });
  await shot("final-04-computer");
  step("computer-contained", {
    ok: computer.view && computer.display === "flex" && computer.left >= 44 && computer.railHit && computer.top < 8,
    detail: JSON.stringify({
      left: computer.left,
      top: computer.top,
      railHit: computer.railHit,
      display: computer.display,
      chrome: computer.chromeBg,
    }),
  });
  step("computer-colors", {
    ok: /rgb\(26,\s*27,\s*30\)/.test(computer.chromeBg) && computer.menubar === "none",
    detail: `chrome=${computer.chromeBg} menubar=${computer.menubar}`,
  });
  step("computer-page", {
    ok: computer.frameOk && /duckduckgo|example|html/i.test(computer.url + computer.title),
    detail: `url=${computer.url} title=${computer.title} srcdoc=${computer.frameOk}`,
  });

  const nav = await page.evaluate(async () => {
    if (typeof geckoLoad === "function") {
      const r = await geckoLoad("https://example.com/");
      return r;
    }
    return { ok: false, error: "no geckoLoad" };
  });
  await page.waitForTimeout(1800);
  const afterNav = await page.evaluate(() => {
    const frame = document.getElementById("goar-live-frame");
    let title = "";
    let text = "";
    try {
      title = frame?.contentDocument?.title || "";
      text = (frame?.contentDocument?.body?.innerText || "").slice(0, 160);
    } catch (_) {}
    return {
      url: document.getElementById("browser-url")?.value || "",
      title,
      text,
      stillComputer: document.body.classList.contains("view-computer"),
    };
  });
  await shot("final-05-example");
  step("navigate-example", {
    ok: /example/i.test(afterNav.url + afterNav.title + afterNav.text) && afterNav.stillComputer,
    detail: JSON.stringify({ nav, url: afterNav.url, title: afterNav.title, text: afterNav.text.slice(0, 80) }),
  });

  await page.locator('#side-rail [data-view="chat"]').click();
  await page.waitForTimeout(400);
  const back = await page.evaluate(() => {
    const br = document.getElementById("browser-tab");
    return {
      view: document.body.className,
      hasComputer: document.body.classList.contains("view-computer"),
      brDisplay: br ? getComputedStyle(br).display : "missing",
      welcome: document.getElementById("welcome") ? getComputedStyle(document.getElementById("welcome")).display : "",
    };
  });
  await shot("final-06-back-chat");
  step("back-to-chat", {
    ok: !back.hasComputer && back.brDisplay === "none",
    detail: JSON.stringify(back),
  });

  const net = await page.evaluate(async () => {
    const fabric = typeof mwFabricStatus === "function" ? mwFabricStatus() : null;
    let fetchR = null;
    if (typeof goarHostFetch === "function") {
      try {
        fetchR = await goarHostFetch("https://example.com/", { maxBytes: 20000 });
      } catch (e) {
        fetchR = { ok: false, error: String(e && e.message ? e.message : e) };
      }
    }
    return {
      wisp: fabric && fabric.wispUrl,
      ready: fabric && fabric.ready,
      via: fetchR && (fetchR.via || fetchR.path),
      status: fetchR && fetchR.status,
      ok: !!(fetchR && fetchR.body && /example/i.test(fetchR.body)),
      bytes: fetchR && fetchR.body ? fetchR.body.length : 0,
      err: fetchR && fetchR.error,
    };
  });
  step("network-fabric", {
    ok: net.ok && /manus|wisp|libcurl/i.test(String(net.wisp || "") + String(net.via || "")),
    detail: JSON.stringify(net),
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const mobile = await page.evaluate(() => {
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      railW: document.getElementById("side-rail")?.getBoundingClientRect().width || 0,
      hist: !!(document.getElementById("btn-history")?.offsetParent),
      input: !!(document.getElementById("msg-input")?.offsetParent),
    };
  });
  await shot("final-07-mobile");
  step("mobile", {
    ok: !mobile.overflow && mobile.railW <= 56 && mobile.hist && mobile.input,
    detail: JSON.stringify(mobile),
  });
} catch (e) {
  step("crash", { ok: false, detail: String(e && e.stack ? e.stack : e) });
} finally {
  writeFileSync("/workspace/screenshots/e2e-final-report.json", JSON.stringify({ out, fail }, null, 2));
  await browser.close();
}

console.log("\n" + (fail.length ? "FAILED " + fail.join(", ") : "ALL PASS"));
process.exit(fail.length ? 1 : 0);
