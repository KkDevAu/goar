const GOAR_REMOTE = "https://cdn.jsdelivr.net/gh/KkDevAu/goar@main/";
const GOAR_BIN = "https://raw.githubusercontent.com/KkDevAu/goar/refs/heads/main/";
const ROOTFS_REV = "v5-pip";

function goarUseCdn() {
  try {
    if (typeof window !== "undefined") {
      if (window.GOAR_FORCE_CDN === true) return true;
      if (window.GOAR_FORCE_CDN === false) return false;
      const h = String(location.hostname || "");
      if (h === "127.0.0.1" || h === "localhost") return false;
    }
  } catch (_) {}
  return true;
}

function goarAssetUrl(rel) {
  let p = String(rel || "").replace(/^\.\//, "").replace(/^\//, "");
  if (!p.startsWith("assets/") && !p.startsWith("goar.")) p = "assets/" + p;
  if (!goarUseCdn()) return "./" + p;
  // jsDelivr rejects files over ~20 MB — those go through raw GitHub
  if (/\.(gz|zst)$/i.test(p) || /frozen|rootfs|gecko\.wasm|vmlinuz|chrome-assets\.tar/i.test(p)) {
    return GOAR_BIN + p;
  }
  return GOAR_REMOTE + p;
}

const CACHE_NAME = "goar-assets";
const GOAR_LOGO = goarAssetUrl("assets/brand/g.png");

const HEAVY = {
  wasm: goarAssetUrl("assets/v86.wasm"),
  lib: goarAssetUrl("assets/libv86.mjs"),
  bzimage: goarAssetUrl("assets/vmlinuz-lts"),
  initrd: goarAssetUrl("assets/rootfs-slim.cpio.gz") + (goarUseCdn() ? "" : "?v=" + ROOTFS_REV),
  seabios: goarAssetUrl("assets/seabios.bin"),
  vgabios: goarAssetUrl("assets/vgabios.bin"),
  frozen: goarAssetUrl("assets/frozen.bin.gz"),
  gecko: goarAssetUrl("assets/gecko/gecko.wasm.zst"),
  geckoJs: goarAssetUrl("assets/gecko/gecko.js"),
  libcurl: goarAssetUrl("assets/net/libcurl.wasm"),
  libcurlJs: goarAssetUrl("assets/net/libcurl.mjs"),
  epoxy: goarAssetUrl("assets/net/epoxy/epoxy-bundled.js"),
  pyodide: goarUseCdn() ? GOAR_REMOTE + "assets/pyodide/" : "./assets/pyodide/",
  pack: goarAssetUrl("goar.pack.zip"),
  logo: GOAR_LOGO,
};

const HEAVY_REMOTE = {
  wasm: GOAR_BIN + "assets/v86.wasm",
  lib: GOAR_REMOTE + "assets/libv86.mjs",
  bzimage: GOAR_BIN + "assets/vmlinuz-lts",
  initrd: GOAR_BIN + "assets/rootfs-slim.cpio.gz?v=" + ROOTFS_REV,
  seabios: GOAR_BIN + "assets/seabios.bin",
  vgabios: GOAR_BIN + "assets/vgabios.bin",
  frozen: GOAR_BIN + "assets/frozen.bin.gz",
  gecko: GOAR_BIN + "assets/gecko/gecko.wasm.zst",
  geckoJs: GOAR_REMOTE + "assets/gecko/gecko.js",
  libcurl: GOAR_BIN + "assets/net/libcurl.wasm",
  libcurlJs: GOAR_REMOTE + "assets/net/libcurl.mjs",
  epoxy: GOAR_REMOTE + "assets/net/epoxy/epoxy-bundled.js",
  pyodide: GOAR_REMOTE + "assets/pyodide/",
  pack: GOAR_REMOTE + "goar.pack.zip",
  logo: GOAR_REMOTE + "assets/brand/g.png",
};

const LOCAL_ASSETS = HEAVY;
const ASSETS = {
  wasm: [HEAVY.wasm, HEAVY_REMOTE.wasm],
  lib: [HEAVY.lib, HEAVY_REMOTE.lib],
  bzimage: [HEAVY.bzimage, HEAVY_REMOTE.bzimage],
  initrd: [HEAVY.initrd, HEAVY_REMOTE.initrd],
};

try {
  window.GOAR_REMOTE = GOAR_REMOTE;
  window.GOAR_BIN = GOAR_BIN;
  window.GOAR_LOGO = GOAR_LOGO;
  window.HEAVY = HEAVY;
  window.HEAVY_REMOTE = HEAVY_REMOTE;
  window.LOCAL_ASSETS = LOCAL_ASSETS;
  window.ASSETS = ASSETS;
  window.CACHE_NAME = CACHE_NAME;
  window.goarAssetUrl = goarAssetUrl;
  window.goarUseCdn = goarUseCdn;
  window.ROOTFS_REV = ROOTFS_REV;
} catch (_) {}
