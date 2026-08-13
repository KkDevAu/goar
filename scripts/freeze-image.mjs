import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/frozen.bin.gz");
const url = process.env.GOAR_URL || "http://127.0.0.1:8080/";

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
page.setDefaultTimeout(240000);
await page.addInitScript(() => {
  window.GOAR_FORCE_COLD = true;
  window.GOAR_GUEST_RAM_MB = 512;
  window.GOAR_AUTO_FREEZE = false;
});
page.on("console", (m) => {
  const t = m.text();
  if (/goar|boot|freeze|error|ready|seq/i.test(t)) console.log(" ", t.slice(0, 220));
});

console.log("boot", url);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => !!(window.__emulator && window.__emulator.save_state), null, { timeout: 180000 });
console.log("emulator up — settling guest");
await page.waitForTimeout(45000);

const info = await page.evaluate(async () => {
  const emu = window.__emulator;
  const raw = await emu.save_state();
  const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  const cs = new CompressionStream("gzip");
  const stream = new Blob([u8]).stream().pipeThrough(cs);
  const gz = new Uint8Array(await new Response(stream).arrayBuffer());
  window.__FZ = gz;
  return { rawBytes: u8.byteLength, gzBytes: gz.byteLength };
});
console.log("snapshot", info);

const chunk = 1 << 20;
const parts = [];
for (let i = 0; i < info.gzBytes; i += chunk) {
  const b64 = await page.evaluate(({ i, chunk }) => {
    const s = window.__FZ.subarray(i, i + chunk);
    let bin = "";
    for (let j = 0; j < s.length; j++) bin += String.fromCharCode(s[j]);
    return btoa(bin);
  }, { i, chunk });
  parts.push(Buffer.from(b64, "base64"));
  console.log("  chunk", Math.min(i + chunk, info.gzBytes), "/", info.gzBytes);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat(parts));
console.log("saved", out, info);
await browser.close();
