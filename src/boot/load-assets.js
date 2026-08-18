async function loadAll() {
  bootItem("assets", "run", "…");
  bootItem("sandbox", "wait");
  bootItem("toolkit", "wait");
  bootItem("agent", "wait");
  setProgress(2, "Loading…", "");
  await new Promise((r) => requestAnimationFrame(() => r()));

  async function loadOne(key, url, weight, minBytes) {
    setProgress(weight, "Loading " + key, String(url).split("/").pop());
    const list = (typeof ASSETS !== "undefined" && ASSETS[key]) ? ASSETS[key] : [url];
    let lastErr = "";
    for (const candidate of list) {
      try {
        const nocache = /rootfs|initrd|cpio/i.test(candidate) ? "no-store" : "force-cache";
        const res = await fetch(candidate, { cache: nocache });
        if (!res.ok) { lastErr = candidate + " → " + res.status; continue; }
        const total = Number(res.headers.get("Content-Length") || 0);
        let buf;
        if (res.body && total > 0) {
          const reader = res.body.getReader();
          const chunks = [];
          let got = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            got += value.byteLength;
            setProgress(
              weight + Math.min(12, (got / total) * 12),
              key,
              (got / 1048576).toFixed(1) + " / " + (total / 1048576).toFixed(1) + " MB"
            );
          }
          const out = new Uint8Array(got);
          let off = 0;
          for (const c of chunks) { out.set(c, off); off += c.byteLength; }
          buf = out.buffer;
        } else {
          buf = await res.arrayBuffer();
        }
        if (!buf || buf.byteLength < (minBytes || 1024)) {
          lastErr = key + " incomplete (" + (buf ? buf.byteLength : 0) + " B)";
          continue;
        }
        if (progress[key] !== undefined) progress[key] = 1;
        setProgress(weight + 14, key, (buf.byteLength / 1048576).toFixed(1) + " MB");
        return buf;
      } catch (e) {
        lastErr = String(e && e.message ? e.message : e);
      }
    }
    throw new Error(key + " missing (" + lastErr + ")");
  }

  const bios = await loadOne("seabios", LOCAL_ASSETS.seabios, 4, 10000);
  const vgaBios = await loadOne("vgabios", LOCAL_ASSETS.vgabios, 6, 5000);
  const wasm = await loadOne("wasm", LOCAL_ASSETS.wasm, 8, 100000);
  const lib = await loadOne("lib", LOCAL_ASSETS.lib, 20, 50000);
  const bzimage = await loadOne("bzimage", LOCAL_ASSETS.bzimage, 28, 1000000);
  const initrd = await loadOne("initrd", LOCAL_ASSETS.initrd, 45, 1000000);

  progress.lib = progress.wasm = progress.bzimage = progress.initrd = 1;
  setProgress(92, "Starting…", "");
  const libText = new TextDecoder().decode(new Uint8Array(lib));
  return {
    bios,
    vgaBios,
    wasmUrl: URL.createObjectURL(new Blob([wasm], { type: "application/wasm" })),
    bzimage,
    initrd,
    libUrl: URL.createObjectURL(new Blob([libText], { type: "text/javascript" })),
  };
}

try { window.loadAll = loadAll; } catch (_) {}
