const GOAR_REMOTE = "https://cdn.jsdelivr.net/gh/KkDevAu/goar@main/";
const GOAR_BIN = "https://raw.githubusercontent.com/KkDevAu/goar/refs/heads/main/";

function goarAssetUrl(rel) {
  const p = String(rel || "").replace(/^\.\//, "").replace(/^\//, "");
  if (/\.(gz|zst|bin|wasm|cpio|mjs)$/i.test(p) || /frozen|rootfs|vmlinuz|gecko\.wasm|libv86|pyodide/i.test(p)) {
    return GOAR_BIN + p;
  }
  return GOAR_REMOTE + p;
}

const CACHE_NAME = "goar-assets";
const GOAR_LOGO = GOAR_REMOTE + "assets/brand/g.png";

const HEAVY = {
  wasm: GOAR_BIN + "assets/v86.wasm",
  lib: GOAR_BIN + "assets/libv86.mjs",
  bzimage: GOAR_BIN + "assets/vmlinuz-lts",
  initrd: GOAR_BIN + "assets/rootfs-slim.cpio.gz",
  seabios: GOAR_BIN + "assets/seabios.bin",
  vgabios: GOAR_BIN + "assets/vgabios.bin",
  frozen: GOAR_BIN + "assets/frozen.bin.gz",
  gecko: "./assets/gecko/gecko.wasm.zst",
  geckoJs: "./assets/gecko/gecko.js",
  libcurl: GOAR_BIN + "assets/net/libcurl.wasm",
  libcurlJs: GOAR_REMOTE + "assets/net/libcurl.mjs",
  pyodide: "https://cdn.jsdelivr.net/pyodide/v0.27.0/full/",
  logo: GOAR_LOGO,
};

const LOCAL_ASSETS = HEAVY;
const ASSETS = {
  wasm: [HEAVY.wasm],
  lib: [HEAVY.lib],
  bzimage: [HEAVY.bzimage],
  initrd: [HEAVY.initrd],
};

try {
  window.GOAR_REMOTE = GOAR_REMOTE;
  window.GOAR_BIN = GOAR_BIN;
  window.GOAR_LOGO = GOAR_LOGO;
  window.HEAVY = HEAVY;
  window.LOCAL_ASSETS = LOCAL_ASSETS;
  window.ASSETS = ASSETS;
  window.CACHE_NAME = CACHE_NAME;
  window.goarAssetUrl = goarAssetUrl;
} catch (_) {}
