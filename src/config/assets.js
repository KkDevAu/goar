const GOAR_REMOTE = "https://cdn.jsdelivr.net/gh/KkDevAu/goar@main/";
const GOAR_BIN = "https://raw.githubusercontent.com/KkDevAu/goar/refs/heads/main/";

function goarAssetUrl(rel) {
  const p = String(rel || "").replace(/^\.\//, "").replace(/^\//, "");
  if (/\.(gz|zst|bin)$/i.test(p) || /frozen|rootfs|vmlinuz|gecko\.wasm/.test(p)) {
    return GOAR_BIN + p;
  }
  return GOAR_REMOTE + p;
}

const CACHE_NAME = "goar-assets";
const GOAR_LOGO = goarAssetUrl("assets/brand/g.png");

const LOCAL_ASSETS = {
  wasm: goarAssetUrl("assets/v86.wasm"),
  bzimage: goarAssetUrl("assets/vmlinuz-lts"),
  initrd: goarAssetUrl("assets/rootfs-slim.cpio.gz"),
  lib: goarAssetUrl("assets/libv86.mjs"),
  seabios: goarAssetUrl("assets/seabios.bin"),
  vgabios: goarAssetUrl("assets/vgabios.bin"),
  libcurl: goarAssetUrl("assets/net/libcurl.wasm"),
  libcurlJs: goarAssetUrl("assets/net/libcurl.mjs"),
  gecko: goarAssetUrl("assets/gecko/gecko.wasm.zst"),
  geckoJs: goarAssetUrl("assets/gecko/gecko.js"),
  geckoChrome: goarAssetUrl("assets/gecko/chrome/index.html"),
  pyodide: goarAssetUrl("assets/pyodide/"),
  frozen: goarAssetUrl("assets/frozen.bin.gz"),
  logo: GOAR_LOGO,
};

const ASSETS = {
  wasm: [LOCAL_ASSETS.wasm],
  lib: [LOCAL_ASSETS.lib],
  bzimage: [LOCAL_ASSETS.bzimage],
  initrd: [LOCAL_ASSETS.initrd],
};

try {
  window.GOAR_REMOTE = GOAR_REMOTE;
  window.GOAR_BIN = GOAR_BIN;
  window.GOAR_LOGO = GOAR_LOGO;
  window.LOCAL_ASSETS = LOCAL_ASSETS;
  window.ASSETS = ASSETS;
  window.CACHE_NAME = CACHE_NAME;
  window.goarAssetUrl = goarAssetUrl;
} catch (_) {}
