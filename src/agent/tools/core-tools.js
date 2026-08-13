let CORE_AGENT_TOOLS = [
  { type: "function", function: {
    name: "bash",
    description: "Execute a shell command in the Alpine Linux sandbox (cwd effectively /workspace). Real BusyBox sh: packages, build, run binaries, git, curl/wget, pip, process control, system inspection. You HAVE a real terminal — use it for verification.",
    parameters: { type: "object", properties: {
      command: { type: "string", description: "Shell command to run" },
      timeout_ms: { type: "number", description: "Timeout ms (default 60000)" }
    }, required: ["command"] }
  }},
  { type: "function", function: {
    name: "python_exec",
    description: "Run Python 3.11 in the sandbox. Pass either inline code OR a path to a .py file (plus optional args). Use after write_file to execute and verify.",
    parameters: { type: "object", properties: {
      code: { type: "string", description: "Python source for python3 -c" },
      path: { type: "string", description: "Path to .py file on guest" },
      args: { type: "string", description: "CLI args when using path" },
      timeout_ms: { type: "number" }
    } }
  }},
  { type: "function", function: {
    name: "write_file",
    description: "Create or OVERWRITE a complete UTF-8 file on the guest. CRITICAL: pass the ENTIRE file body in one call — never line-by-line (each call replaces the whole file). Full CPython 3.11 + pip are on the guest. Flask wheels are offline-installable via host bundle (/opt/wheels). If pip network fails: `pip install --no-index --find-links=/opt/wheels flask`. Full CPython 3.11 + pip are on the guest. You can pip install, write multi-file projects, run Flask, build tools. Prefer /workspace/...",
    parameters: { type: "object", properties: {
      path: { type: "string" },
      content: { type: "string", description: "Full file contents" }
    }, required: ["path", "content"] }
  }},
  { type: "function", function: {
    name: "read_file",
    description: "Read a text file from the guest filesystem.",
    parameters: { type: "object", properties: {
      path: { type: "string" },
      max_bytes: { type: "number" }
    }, required: ["path"] }
  }},
  { type: "function", function: {
    name: "edit_file",
    description: "Precise search-and-replace edit inside an existing guest file. old_string must match exactly (unique unless replace_all).",
    parameters: { type: "object", properties: {
      path: { type: "string" },
      old_string: { type: "string" },
      new_string: { type: "string" },
      replace_all: { type: "boolean" }
    }, required: ["path", "old_string", "new_string"] }
  }},
  { type: "function", function: {
    name: "delete_file",
    description: "Delete a file or directory on the guest (rm -rf).",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }
  }},
  { type: "function", function: {
    name: "move_file",
    description: "Move or rename a file/directory on the guest.",
    parameters: { type: "object", properties: {
      src: { type: "string" }, dest: { type: "string" }
    }, required: ["src", "dest"] }
  }},
  { type: "function", function: {
    name: "copy_file",
    description: "Copy a file/directory on the guest (cp -a).",
    parameters: { type: "object", properties: {
      src: { type: "string" }, dest: { type: "string" }
    }, required: ["src", "dest"] }
  }},
  { type: "function", function: {
    name: "list_dir",
    description: "List a directory on the guest (ls -la). Default /workspace.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }
  }},
  { type: "function", function: {
    name: "mkdir",
    description: "Create directory tree on guest (mkdir -p).",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }
  }},
  { type: "function", function: {
    name: "glob",
    description: "Find files by name/glob under a root path on the guest.",
    parameters: { type: "object", properties: {
      pattern: { type: "string" },
      root: { type: "string", description: "Default /workspace" }
    }, required: ["pattern"] }
  }},
  { type: "function", function: {
    name: "grep",
    description: "Search file contents on the guest with regex (recursive).",
    parameters: { type: "object", properties: {
      pattern: { type: "string" },
      path: { type: "string" },
      max_results: { type: "number" }
    }, required: ["pattern"] }
  }},
  { type: "function", function: {
    name: "web_search",
    description: "Search the public web from the browser (Wikipedia/DDG). Use for docs, APIs, errors, libraries, facts BEFORE guessing. Returns titles, URLs, snippets.",
    parameters: { type: "object", properties: {
      query: { type: "string" },
      max_results: { type: "number" }
    }, required: ["query"] }
  }},
  { type: "function", function: {
    name: "web_fetch",
    description: "Fetch a URL in the browser and return text (HTML stripped). Use after web_search to read docs/pages. Prefer https URLs.",
    parameters: { type: "object", properties: {
      url: { type: "string" },
      max_chars: { type: "number" }
    }, required: ["url"] }
  }},
  { type: "function", function: {
    name: "http_request",
    description: "HTTP request from the browser (GET/POST/PUT/DELETE). For APIs and raw endpoints. Returns status + body.",
    parameters: { type: "object", properties: {
      url: { type: "string" },
      method: { type: "string" },
      headers: { type: "object" },
      body: { type: "string" },
      max_chars: { type: "number" }
    }, required: ["url"] }
  }},
  { type: "function", function: {
    name: "env_info",
    description: "Return live sandbox status: env ready?, python/shell availability, workdir, network hints, tool inventory. Call when unsure what is online.",
    parameters: { type: "object", properties: {} }
  }},
  { type: "function", function: {
    name: "install_flask",
    description: "Install Flask into the guest from the offline wheel bundle (works without internet). Use before deploying Flask apps if import flask fails.",
    parameters: { type: "object", properties: {} }
  }},
  { type: "function", function: {
    name: "pysec",
    description: "Agent toolkit. Args: tool_id (catalog id), kwargs (object). Use for all kit capabilities (hash, codec, jwt, secrets, sqlmap.*, nuclei, xss, sast, yara, recon, …).",
    parameters: {
      type: "object",
      properties: {
        tool_id: { type: "string", description: "Exact id from catalog, e.g. hash.digest, secrets.scan, sqlmap.scan, jwt.inspect, nuclei.scan, yara.scan, sast.scan" },
        kwargs: { type: "object", description: "Named arguments for that tool_id (see catalog descriptions)" }
      },
      required: ["tool_id"]
    }
  }},
  { type: "function", function: {
    name: "guest_http",
    description: "HTTP via Alpine curl — no browser CORS. Use when pysec live fetch/proxy fails or raw guest fetch is needed. Authorized targets only.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" },
        method: { type: "string" },
        headers: { type: "string", description: "Header lines Key: Value" },
        body: { type: "string" },
        max_bytes: { type: "number" }
      },
      required: ["url"]
    }
  }},
  { type: "function", function: {
    name: "kit_status",
    description: "GOAR kit status: python, bins, modules, network, workspace top-level. Call first when diagnosing the personal sandbox.",
    parameters: { type: "object", properties: {} }
  }},
  { type: "function", function: {
    name: "workspace_tree",
    description: "List project files under /workspace (or path) with sizes. Prefer this over raw find for orientation.",
    parameters: { type: "object", properties: {
      path: { type: "string" },
      depth: { type: "number" },
      limit: { type: "number" }
    } }
  }},
  { type: "function", function: {
    name: "py_check",
    description: "Byte-compile check a Python file (optional import smoke). Faster than full run for syntax mistakes.",
    parameters: { type: "object", properties: {
      path: { type: "string" },
      imports: { type: "boolean" }
    }, required: ["path"] }
  }},
  { type: "function", function: {
    name: "net_diag",
    description: "Guest network diagnostics: DNS + sample HTTPS. Use when pip/sqlmap/web tools fail.",
    parameters: { type: "object", properties: {} }
  }},
  { type: "function", function: { name: "todo", description: "Checklist: set|add|done|list|clear", parameters: { type: "object", properties: { action: { type: "string" }, items: { type: "string" }, item: { type: "string" } }, required: ["action"] } }},
  { type: "function", function: { name: "create_plan", description: "Multi-step plan", parameters: { type: "object", properties: { goal: { type: "string" }, steps: { type: "array", items: { type: "string" } } }, required: ["goal", "steps"] } }},
  { type: "function", function: { name: "update_plan_step", description: "Update plan step 0-based", parameters: { type: "object", properties: { step: { type: "number" }, status: { type: "string" }, result: { type: "string" } }, required: ["step", "status"] } }},
  { type: "function", function: { name: "update_ledger", description: "Update goal/facts/decisions", parameters: { type: "object", properties: { goal: { type: "string" }, current_step: { type: "string" }, fact: { type: "string" }, decision: { type: "string" }, dead_end: { type: "string" } } } }},
  { type: "function", function: { name: "think", description: "Reason before acting", parameters: { type: "object", properties: { thought: { type: "string" } }, required: ["thought"] } }},
  { type: "function", function: { name: "complete_task", description: "Finish with summary", parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] } }},
  { type: "function", function: { name: "store_memory", description: "Store session fact", parameters: { type: "object", properties: { content: { type: "string" }, category: { type: "string" }, importance: { type: "number" } }, required: ["content"] } }},
  { type: "function", function: { name: "recall_memory", description: "Recall memories", parameters: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } } } }},
  { type: "function", function: {
    name: "set_phase",
    description: "Adaptive Engineer phase: ASSESS|PLAN|VALIDATE|EXECUTE|REVIEW|VERIFY|DELIVER. Call when entering a new phase.",
    parameters: { type: "object", properties: {
      phase: { type: "string" },
      note: { type: "string" }
    }, required: ["phase"] }
  }},
  { type: "function", function: {
    name: "micropip_install",
    description: "Install pure-Python package into browser Pyodide (micropip). Prefer for analysis libs before heavier Alpine work.",
    parameters: { type: "object", properties: {
      package: { type: "string", description: "PyPI name e.g. beautifulsoup4" }
    }, required: ["package"] }
  }},
  { type: "function", function: {
    name: "mw_status",
    description: "Mercury Workshop network fabric status: libcurl/epoxy engine, Wisp URL, probe. Call when diagnosing live HTTP.",
    parameters: { type: "object", properties: {} }
  }},
  { type: "function", function: {
    name: "browser_status",
    description: "Unified browser framework map: host_fetch · fabric TLS · guest_http · gecko_embed · gecko_chrome. Use to pick the right path. Does not change any plane.",
    parameters: { type: "object", properties: {} }
  }},
  { type: "function", function: {
    name: "compute",
    description: "Run work on a Web Worker: ping, gzip, gunzip, hash, tokens. Keeps the UI thread free.",
    parameters: { type: "object", properties: {
      op: { type: "string", description: "ping | gzip | gunzip | hash | tokens | json" },
      text: { type: "string" },
      algo: { type: "string", description: "sha256 (default) sha1 sha384 sha512" },
      data: { type: "object" }
    } }
  }},
  { type: "function", function: {
    name: "gecko_status",
    description: "Gecko plane status (mode embed|chrome, COI, WISP, last URL). Independent of Alpine v86 freeze/state.",
    parameters: { type: "object", properties: {} }
  }},
  { type: "function", function: {
    name: "gecko_open",
    description: "Boot agent browser plane. mode=embed (canvas Gecko, agent-driven) or mode=chrome (full Firefox UI). Lazy; does NOT replace/pause Alpine. Same WISP as fabric. Requires COOP+COEP.",
    parameters: { type: "object", properties: {
      mode: { type: "string", description: "embed (default) or chrome" },
      url: { type: "string", description: "Optional initial URL" },
      show: { type: "boolean", description: "Show pane (default true)" }
    } }
  }},
  { type: "function", function: {
    name: "gecko_load",
    description: "Navigate embed or chrome Gecko to a URL. Boots default embed if needed. For JS-heavy pages host fetch cannot execute. Leaves guest alone.",
    parameters: { type: "object", properties: {
      url: { type: "string", description: "https://… or data:…" }
    }, required: ["url"] }
  }},
  { type: "function", function: {
    name: "gecko_hide",
    description: "Hide Gecko pane (engine/chrome can stay warm).",
    parameters: { type: "object", properties: {} }
  }},
  { type: "function", function: {
    name: "gecko_menu",
    description: "Shared Firefox menu for user and agent: new_tab, back, forward, reload, find, addons, zoom_in, zoom_out, bookmark, source, settings.",
    parameters: { type: "object", properties: {
      action: { type: "string" },
      url: { type: "string" },
      query: { type: "string" }
    }, required: ["action"] }
  }},
  { type: "function", function: {
    name: "gecko_addon",
    description: "Toggle a Firefox extension on the shared browser: dark, adblock, reader.",
    parameters: { type: "object", properties: {
      id: { type: "string" },
      enabled: { type: "boolean" }
    }, required: ["id"] }
  }},
  { type: "function", function: {
    name: "kv_status",
    description: "HeyPuter kv.js plane status: keys, IndexedDB, namespaces (mem/mission/settings/gecko/session). Host cache — not guest FS.",
    parameters: { type: "object", properties: {} }
  }},
  { type: "function", function: {
    name: "kv_set",
    description: "Set a key in GOAR KV cache (Redis-style). Optional ns: mem|mission|settings|gecko|session|tool|meta. Optional ex=TTL seconds. Persists to IndexedDB when available.",
    parameters: { type: "object", properties: {
      key: { type: "string" },
      value: { type: "string", description: "String or JSON string" },
      ns: { type: "string", description: "Namespace prefix" },
      ex: { type: "number", description: "Expire seconds" }
    }, required: ["key", "value"] }
  }},
  { type: "function", function: {
    name: "kv_get",
    description: "Get a key from GOAR KV cache. Optional ns namespace.",
    parameters: { type: "object", properties: {
      key: { type: "string" },
      ns: { type: "string" }
    }, required: ["key"] }
  }},
  { type: "function", function: {
    name: "kv_del",
    description: "Delete one or more keys from GOAR KV.",
    parameters: { type: "object", properties: {
      key: { type: "string", description: "Single key" },
      keys: { type: "array", items: { type: "string" }, description: "Multiple keys" },
      ns: { type: "string" }
    } }
  }},
  { type: "function", function: {
    name: "kv_keys",
    description: "List KV keys (optional glob pattern and ns).",
    parameters: { type: "object", properties: {
      pattern: { type: "string", description: "Default *" },
      ns: { type: "string" }
    } }
  }},
  { type: "function", function: {
    name: "create_tool",
    description: "Register a new session tool. kind=python|js|guest. Body is source or shell template. Extends the agent immediately.",
    parameters: { type: "object", properties: {
      name: { type: "string" },
      description: { type: "string" },
      kind: { type: "string" },
      body: { type: "string" },
      parameters: { type: "object" }
    }, required: ["name", "body"] }
  }}
];


/** Map OpenAI function name -> pysec tool_id (legacy p_* still resolved if model emits them) */
const PYSEC_FN_TO_ID = Object.create(null);
const PYSEC_ID_TO_FN = Object.create(null);

function pysecFnName(toolId) {
  let n = "p_" + String(toolId || "").replace(/[^a-zA-Z0-9_]+/g, "_");
  if (n.length > 64) n = n.slice(0, 64);
  return n;
}

function rebuildPysecFnMaps() {
  for (const k of Object.keys(PYSEC_FN_TO_ID)) delete PYSEC_FN_TO_ID[k];
  for (const k of Object.keys(PYSEC_ID_TO_FN)) delete PYSEC_ID_TO_FN[k];
  let cat = [];
  try {
    if (typeof pysecCatalogTools === "function") cat = pysecCatalogTools() || [];
  } catch (_) {}
  if ((!cat || !cat.length) && typeof PYSEC_CATALOG_JSON === "string") {
    try { cat = JSON.parse(PYSEC_CATALOG_JSON); } catch (_) {}
  }
  for (const tool of cat || []) {
    if (!tool || !tool.id) continue;
    const id = String(tool.id);
    const fn = pysecFnName(id);
    PYSEC_FN_TO_ID[fn] = id;
    PYSEC_ID_TO_FN[id] = fn;
  }
  try {
    if (typeof invalidateCategoryIndex === "function") invalidateCategoryIndex();
  } catch (_) {}
}

/**
 * Category surface only (~12 tools) — never expand 141 pysec schemas.
 * Core implementations remain in CORE_AGENT_TOOLS for internal dispatch docs;
 * the model only sees buildCategoryAgentTools().
 */
function buildFullAgentTools() {
  rebuildPysecFnMaps();
  let cats = [];
  try {
    const _bcat =
      typeof buildCategoryAgentTools === "function"
        ? buildCategoryAgentTools
        : typeof window !== "undefined" && typeof window.buildCategoryAgentTools === "function"
          ? window.buildCategoryAgentTools
          : null;
    if (_bcat) {
      cats = _bcat() || [];
    }
  } catch (e) {
    console.warn("[goar] buildCategoryAgentTools", e);
  }
  // Fallback minimal if categories failed to load
  if (!cats.length) {
    cats = [
      {
        type: "function",
        function: {
          name: "pysec",
          description: "Run pysec tool_id with kwargs",
          parameters: {
            type: "object",
            properties: {
              tool_id: { type: "string" },
              kwargs: { type: "object" },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "guest",
          description: "Guest shell/fs: action=bash|write_file|read_file|python_exec|…",
          parameters: {
            type: "object",
            properties: { action: { type: "string" }, command: { type: "string" }, path: { type: "string" }, content: { type: "string" } },
            required: ["action"],
          },
        },
      },
    ];
  }
  let dyn = [];
  try {
    if (typeof buildDynamicAgentTools === "function") dyn = buildDynamicAgentTools() || [];
  } catch (_) {}
  // Dynamic create_tool tools append but hard-cap under 128
  const MAX = 120;
  const out = cats.concat(dyn).slice(0, MAX);
  return out;
}

/** Lookup core tool schema (for validation / help) */
function getCoreToolSchema(name) {
  const list = Array.isArray(CORE_AGENT_TOOLS) ? CORE_AGENT_TOOLS : [];
  for (const t of list) {
    if (t && t.function && t.function.name === name) return t;
  }
  return null;
}


let AGENT_TOOLS = [];
