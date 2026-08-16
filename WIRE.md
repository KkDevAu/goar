# GOAR kit — wire into any HTML

This zip is the full GOAR runtime **without** a page. You supply the HTML.
The kit mounts on **element IDs**. Keep those IDs (or the scripts will no-op).

Serve the folder as the site root. Firefox + Alpine need **cross-origin isolation**:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
Cross-Origin-Resource-Policy: cross-origin
```

`scripts/serve.mjs` already sends those. `python -m http.server` will not.

Also expose these files at the **site root** (copy or symlink):

- `gecko.wasm.zst` → `assets/gecko/chrome/gecko.wasm.zst`
- `assets/gecko/chrome/chrome-assets.json`
- `assets/gecko/chrome/chrome-assets.tar.zst`

---

## 1. Head

```html
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<script>
  window.GOAR_LOCAL_ONLY = true;
  window.GOAR_ALLOW_REMOTE_ASSETS = false;
  window.GOAR_GECKO_MODE = "chrome";
  window.GOAR_GECKO_HOME = "https://duckduckgo.com/";
</script>
<link rel="stylesheet" href="./src/css/xterm.css" />
<link rel="stylesheet" href="./src/css/app.css" />
<link rel="stylesheet" href="./src/css/ghtml-shell.css" />
```

`ghtml-shell.css` is the product chrome. `app.css` is the original boot screen (logo + bar + key).

---

## 2. Required IDs

Minimum contract. Missing IDs are skipped; the agent still runs if `#chat-inner`, `#msg-input`, `#send-btn`, and `#setup` exist.

### Boot (original screen)

| ID | Role |
|---|---|
| `#setup` | Full-screen boot. Add class `hide` when ready. |
| `#setup img.logo` | Logo (no wordmark) |
| `#barFill` | Progress bar fill |
| `#pct` `#step` `#detail` | % and stage text |
| `#bootList` | Optional boot rows |
| `#credPhase` | Provider + key form (`class="on"` to show) |
| `#credProvider` `#credKey` `#credBase` `#credModel` | Live `/models` |
| `#credGo` | ENTER CHAT |
| `#credStatus` `#err` `#retry` | Status |

### Chat

| ID | Role |
|---|---|
| `#app` | Shell root. Gets `show` after ENTER. |
| `#chat` `#chat-inner` | Transcript |
| `#welcome` | Empty state (hidden after first message) |
| `.w-chip[data-q]` | Prompt chips |
| `#msg-input` `#send-btn` | Composer |
| `#chat-attach` `#chat-attach-input` `#chat-attach-chips` | Files |
| `#hdr-tokens` `#hdr-status-text` `#active-model` | Optional HUD |
| `#btn-menu` | Opens drawer |

### Computer (Firefox)

| ID | Role |
|---|---|
| `#browser-tab` | Stage. Add class `open` to show. |
| `#browser-frame-wrap` | Gecko mounts here |
| `#browser-url` | Hidden input, default `https://duckduckgo.com/` |
| `#browser-empty` | Hidden once Firefox is up |

Rail button: `data-view="computer"` calls `goarShowView("computer")`.

### Files + IDE

| ID | Role |
|---|---|
| `#files-sheet-overlay` `#files-list` `#files-crumb` | Guest listing |
| `#ide-shell` `#ide-editor` `#ide-path` `#ide-save` | Editor |
| `#files-refresh` `#files-new` `#files-upload-input` | File actions |

Rail: `data-view="ide"`.

### Settings + drawer + sandbox hosts

| ID | Role |
|---|---|
| `#settings` `#provider` `#apiKey` `#apiBase` `#apiModel` | Same live `/models` as boot |
| `#btnSaveSettings` `#btnCloseSettings` `#refreshModels` | Settings actions |
| `#drawer-overlay` `#drawer-sessions` `#drawer-new` `#drawer-settings` `#drawer-clear` | Menu |
| `#terminal` `#screen_container` `#kb` | Alpine / v86 (can stay hidden) |
| `#toast` | Toasts |

---

## 3. Script order (do not reorder)

Vendors first, then `src/LOAD_ORDER.json`.

```html
<script src="./src/vendor/xterm.js"></script>
<script src="./src/vendor/xterm-addon-fit.js"></script>
<script src="./src/vendor/xterm-addon-web-links.js"></script>
<script src="./src/vendor/pako-inflate.js"></script>
<script src="./vendor/kv.js/kv-browser.js"></script>
```

Then every file in `src/LOAD_ORDER.json` as `./src/<path>`.

Last two own the shell:

- `src/ui/ghtml-shell.js` — rail, Computer, Files, IDE, drawer
- `src/ui/design-wire.js` — Firefox pane + agent browser tools

---

## 4. Call the runtime from your own UI

```js
goarShowView("chat" | "computer" | "ide" | "skills")
ensureGecko({ mode: "chrome", url: "https://duckduckgo.com/", show: true })
geckoLoad("https://duckduckgo.com/")
window.__GOAR_RUN_TOOL("net", { action: "browse", url: "https://duckduckgo.com/" })
window.__GOAR_AGENT_TURN("your task")
```

Thought / tool rows in `#chat-inner` start collapsed (`Thought · show`). Click to expand.

---

## 5. Flags (`src/config/flags.js`)

| Flag | Default | Meaning |
|---|---|---|
| `GOAR_GECKO_MODE` | `chrome` | Real Firefox UI |
| `GOAR_GECKO_HOME` | `https://duckduckgo.com/` | First page |
| `GOAR_ALLOW_FREEZE` | `true` | OPFS warm snapshot |
| `GOAR_WISP_URL` | public demo wisp | Tab network |
| `GOAR_LOCAL_ONLY` | `true` | No remote asset fallback |

---

## 6. What the kit is

- **Agent** — autonomous loop, 12 category tools, live `/models`, token HUD
- **Firefox** — `assets/gecko/` (chrome UI + WASM + chrome-assets)
- **Alpine** — `assets/vmlinuz-lts`, `rootfs-slim.cpio.gz`, `v86.wasm`, seabios
- **Pyodide / pysec** — `assets/pyodide/` + `src/pysec/`
- **Network** — WISP / libcurl under `assets/net/`
- **Optional PHP CORS** — `optional/goar-proxy.php`

Your page is the only HTML you own. Keep the IDs, keep the script order, serve with isolation headers.
