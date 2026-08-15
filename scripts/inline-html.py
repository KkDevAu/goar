#!/usr/bin/env python3
"""Bake src JS/CSS into index.html as named sections. Heavies stay remote."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
shell_path = root / "index.shell.html"
html_path = root / "index.html"
if not shell_path.is_file():
    raise SystemExit("missing index.shell.html")

order = json.loads((root / "src/LOAD_ORDER.json").read_text())
EXTRAS = [
    "src/vendor/xterm.js",
    "src/vendor/xterm-addon-fit.js",
    "src/vendor/xterm-addon-web-links.js",
    "src/vendor/pako-inflate.js",
    "src/vendor/json-schema.js",
    "vendor/kv.js/kv-browser.js",
]
CSS = [
    ("xterm", "src/css/xterm.css"),
    ("app", "src/css/app.css"),
    ("shell", "src/css/ghtml-shell.css"),
    ("bridge", "src/css/goar-bridge.css"),
    ("chat", "src/css/grok-chat.css"),
]

def section_of(path: str) -> str:
    p = path.replace("src/", "")
    if p.startswith("vendor/") or path.startswith("vendor/"):
        return "vendor"
    return p.split("/", 1)[0]

def esc_js(s: str) -> str:
    return s.replace("</script>", "<\\/script>").replace("</SCRIPT>", "<\\/SCRIPT>")

def rule() -> str:
    return "<!-- ====================================================================== -->"

def banner(title: str) -> str:
    line = f"<!-- {title}"
    pad = 70 - len(line)
    if pad < 1:
        pad = 1
    return f"\n{rule()}\n{line}{' ' * pad}-->\n{rule()}\n"

js, seen = [], set()
for p in EXTRAS + ["src/" + x.replace("src/", "") for x in order]:
    if p in seen:
        continue
    seen.add(p)
    js.append(p)

toc = [
    banner("TABLE OF CONTENTS"),
    "<!--",
    "  MARKUP   SETUP · HANDOFF · SHELL · MENU · HISTORY · COMPUTER",
    "           TERMINAL · FILES · IDE · SETTINGS · HIDDEN",
    "  CSS      xterm · app · shell · bridge · chat",
    "  JS       vendor · config · providers · ui · sandbox · net",
    "           boot · agent · pysec · chat",
    "  HEAVY    Alpine / v86 / Gecko / Pyodide  (downloaded, not in this file)",
    "  EDIT     src/ and index.shell.html   then:  python3 scripts/inline-html.py",
    "-->",
    "",
]

out = [shell_path.read_text(encoding="utf-8").rstrip(), ""]
out.extend(toc)

out.append(banner("CSS"))
for name, p in CSS:
    out.append(banner(f"CSS / {name}"))
    out.append(f'<style data-section="css-{name}" data-src="{p}">')
    out.append((root / p).read_text(encoding="utf-8", errors="replace").rstrip())
    out.append("</style>")

out.append(banner("UI / settings-open"))
out.append("""<script data-section="ui-settings-open">
document.addEventListener("click", function (e) {
  var t = e.target && e.target.closest && e.target.closest("#btn-settings, #menu-settings, #drawer-settings");
  if (!t) return;
  e.preventDefault();
  e.stopPropagation();
  if (typeof openSettings === "function") openSettings();
  else {
    var box = document.getElementById("settings");
    if (box) { box.classList.add("open"); box.style.display = "flex"; box.style.zIndex = "10000"; }
  }
}, true);
</script>""")

for p in js:
    name = section_of(p)
    fname = Path(p).name
    out.append(banner(f"JS / {name} / {fname}"))
    out.append(f'<script data-section="{name}" data-src="{p}">')
    out.append(esc_js((root / p).read_text(encoding="utf-8", errors="replace")).rstrip())
    out.append("</script>")

out.append("\n</body>\n</html>\n")
html_path.write_text("\n".join(out), encoding="utf-8")
print("wrote", html_path, html_path.stat().st_size, "scripts", len(js))
