/**
 * Category tool surface — agent sees ~12 tools, not 141+ schemas.
 * Each category is one OpenAI function; sub-tool picked via `action`/`tool`.
 */
(function (global) {
  "use strict";

  /** Pysec group → lane */
  const GROUP_TO_LANE = {
    Hash: "crypto",
    Cipher: "crypto",
    JWT: "crypto",
    JWTAdv: "crypto",
    OTP: "crypto",
    Password: "crypto",
    Crack: "crypto",
    "X.509": "crypto",
    Secrets: "crypto",
    Codec: "crypto",
    Proxy: "http",
    Requests: "http",
    Fetch: "http",
    Repeater: "http",
    HTTPX: "http",
    HAR: "http",
    HeaderFuzz: "http",
    Cookie: "http",
    Form: "http",
    HTTP: "http",
    DNS: "recon",
    Subenum: "recon",
    CT: "recon",
    ASN: "recon",
    RDAP: "recon",
    Wayback: "recon",
    InternetDB: "recon",
    Favicon: "recon",
    Tech: "recon",
    CMS: "recon",
    Katana: "recon",
    JSRecon: "recon",
    Robots: "recon",
    WellKnown: "recon",
    Cloud: "recon",
    EmailSec: "recon",
    Intel: "recon",
    Nuclei: "vuln",
    Nikto: "vuln",
    SQLMap: "vuln",
    XSS: "vuln",
    SSRF: "vuln",
    XXE: "vuln",
    SSTI: "vuln",
    CRLF: "vuln",
    CORS: "vuln",
    Redirect: "vuln",
    Inject: "vuln",
    NoSQL: "vuln",
    ProtoPollution: "vuln",
    Smuggle: "vuln",
    Upload: "vuln",
    Clickjack: "vuln",
    CSP: "vuln",
    WAF: "vuln",
    WPScan: "vuln",
    Backup: "vuln",
    Dirb: "vuln",
    VHost: "vuln",
    Param: "vuln",
    API: "vuln",
    OAuth: "vuln",
    GraphQL: "vuln",
    Nmap: "vuln",
    Takeover: "vuln",
    SAST: "analyze",
    YARA: "analyze",
    ReDoS: "analyze",
    URL: "analyze",
    Homoglyph: "analyze",
    Mutator: "analyze",
    FuzzGen: "analyze",
  };

  const LANES = {
    crypto: {
      name: "pysec_crypto",
      label: "Crypto / tokens",
      when: "hashes, JWT, encrypt/decrypt, OTP, passwords, certs, secret scan, codecs",
      examples: "hash.digest, jwt.inspect, jwt.crack, secrets.scan, otp.totp, cipher.decrypt",
    },
    http: {
      name: "pysec_http",
      label: "Live HTTP",
      when: "fetch, probe, replay, HTTP analysis, cookies, forms, HAR",
      examples: "httpx.probe, fetch.analyze, repeater.send, requests.get, cookie.scan",
    },
    recon: {
      name: "pysec_recon",
      label: "Recon / OSINT",
      when: "DNS, subs, tech, archives, intel, cloud buckets, emailsec",
      examples: "dns.resolve, subenum.enumerate, tech.fingerprint, wayback.collect",
    },
    vuln: {
      name: "pysec_vuln",
      label: "Vuln scan",
      when: "authorized vuln checks, scanners, payloads (sqlmap/xss/nuclei/…)",
      examples: "sqlmap.scan, xss.scan, nuclei.scan, nmap.http_probe, cors.scan",
    },
    analyze: {
      name: "pysec_analyze",
      label: "Local analyze",
      when: "offline code/string/header analysis, yara, redos, mutators",
      examples: "sast.scan, yara.scan, url.analyze, mutator.mutate, headers.analyze",
    },
  };

  /** Guest plane actions */
  const GUEST_ACTIONS = {
    bash: "Shell command in Alpine /workspace",
    python_exec: "Python 3 inline or file",
    write_file: "Write full file (entire content once)",
    read_file: "Read file",
    edit_file: "Search-replace edit",
    delete_file: "rm -rf path",
    move_file: "mv src dest",
    copy_file: "cp -a src dest",
    list_dir: "ls -la",
    mkdir: "mkdir -p",
    glob: "Find files by pattern",
    grep: "Search file contents",
    workspace_tree: "Tree under path",
    install_flask: "Offline flask wheel install",
    py_check: "Syntax/import check",
  };

  const NET_ACTIONS = {
    web_search: "Web search",
    web_fetch: "Fetch URL via host fabric",
    http_request: "HTTP request (method/headers/body)",
    guest_http: "HTTP from Alpine guest (no CORS)",
    mw_status: "Mercury Workshop fabric status",
    net_diag: "Guest DNS + HTTPS diagnostics",
    env_info: "Sandbox env/net status",
    kit_status: "Pysec kit status",
    browser_status: "Fetch + gecko + fabric map",
    gecko_status: "In-app Firefox status",
    gecko_open: "Ensure in-app Firefox is up (usually already booted)",
    gecko_load: "Show URL in the shared Firefox (you and the agent see it)",
    gecko_menu: "Firefox menu: new_tab | back | reload | find | addons | zoom_in",
    gecko_addon: "Toggle an extension: dark | adblock | reader",
    gecko_permit: "Allow/block site permission: popup | notifications | geolocation",
    gecko_popup: "Handle pop-up: allow | block | open",
    gecko_dialog: "alert/confirm/prompt: accept | dismiss",
    gecko_td: "WPT testdriver: click | send_keys | set_permission | accept_alert | new_tab | bless",
    gecko_hide: "Hide the browser panel",
    gecko_click: "Click in the shared Firefox (x,y pixels or 0–1)",
    gecko_type: "Type into the focused field in the shared Firefox",
    gecko_key: "Send a key (Enter, Tab, Escape…)",
    gecko_eval: "Run JS in Firefox chrome context",
    gecko_shot: "Screenshot the shared Firefox canvas",
    gecko_wait: "Wait for the page (ms)",
    inspect: "Read the shared Firefox page: snapshot|dom|text|styles|console|eval|network",
    page: "Puppeteer-style: goto|click|type|evaluate|waitFor|screenshot on the shared Firefox",
    browse: "Fetch URL AND open it in the shared Firefox together",
  };

  const KV_ACTIONS = {
    kv_status: "KV plane status",
    kv_set: "Set key (ns, ex TTL)",
    kv_get: "Get key",
    kv_del: "Delete key(s)",
    kv_keys: "List keys by pattern",
  };

  const MIND_ACTIONS = {
    todo: "Checklist set|add|done|list|clear",
    create_plan: "Multi-step plan",
    update_plan_step: "Update plan step",
    update_ledger: "Update goal/facts/decisions",
    think: "Reason before acting",
    complete_task: "Finish with summary",
    store_memory: "Store session fact",
    recall_memory: "Recall memories",
    set_phase: "Set execution phase",
  };

  const KIT_ACTIONS = {
    micropip_install: "Install pure-Python into Pyodide (browser kit)",
    create_tool: "Create session tool (js|python|guest body)",
    edit_tool: "Edit/replace a session tool by name (same as create upsert)",
    list_session_tools: "List dynamic tools + micropip packages this session",
    remove_tool: "Remove a session dynamic tool",
    install_flask: "Offline flask on guest (heavy)",
    discover: "Find capabilities by intent (query). Returns a few matches — do not dump the catalog.",
    crypto: "Host hash/hmac/aes (Web Crypto + crypto-js). Instant — prefer over pysec for simple digest",
    wasm: "Load/validate/call a WASM module (url or base64)",
    schema_validate: "Validate JSON against a JSON Schema",
    chart: "Draw bar|line|pie from [{label,value}]",
  };

  function indexCatalog(catalog) {
    const byLane = { crypto: [], http: [], recon: [], vuln: [], analyze: [], other: [] };
    const idToLane = Object.create(null);
    const idToMeta = Object.create(null);
    for (const t of catalog || []) {
      if (!t || !t.id) continue;
      const lane = GROUP_TO_LANE[t.group] || "other";
      idToLane[t.id] = lane;
      idToMeta[t.id] = t;
      if (!byLane[lane]) byLane[lane] = [];
      byLane[lane].push(t.id);
    }
    return { byLane, idToLane, idToMeta };
  }

  let _index = null;
  function getIndex() {
    if (_index) return _index;
    let cat = [];
    try {
      if (typeof pysecCatalogTools === "function") cat = pysecCatalogTools() || [];
    } catch (_) {}
    if ((!cat || !cat.length) && typeof PYSEC_CATALOG_JSON === "string") {
      try {
        cat = JSON.parse(PYSEC_CATALOG_JSON);
      } catch (_) {}
    }
    _index = indexCatalog(cat);
    return _index;
  }

  function invalidateCategoryIndex() {
    _index = null;
  }

  function fn(name, description, properties, required) {
    const parameters = { type: "object", properties: properties || {} };
    if (required && required.length) parameters.required = required;
    return {
      type: "function",
      function: {
        name: name,
        description: String(description).slice(0, 1024),
        parameters: parameters,
      },
    };
  }

  function actionEnumDesc(map) {
    return Object.keys(map)
      .map((k) => k + " — " + map[k])
      .join("; ");
  }

  /**
   * Build the compact tool list exposed to the model (well under 128).
   */
  function buildCategoryAgentTools() {
    const idx = getIndex();
    const tools = [];

    tools.push(
      fn(
        "guest",
        "Run work in Alpine: shell, python, files. Pass action plus the args you need. If unsure which action, kit discover.",
        {
          action: { type: "string", description: "Intent: bash | python_exec | write_file | read_file | edit_file | list_dir | grep | …" },
          command: { type: "string", description: "For bash" },
          code: { type: "string", description: "For python_exec inline" },
          path: { type: "string" },
          content: { type: "string", description: "Full file for write_file" },
          old_string: { type: "string" },
          new_string: { type: "string" },
          replace_all: { type: "boolean" },
          src: { type: "string" },
          dest: { type: "string" },
          pattern: { type: "string" },
          root: { type: "string" },
          args: { type: "string" },
          timeout_ms: { type: "number" },
          max_bytes: { type: "number" },
        },
        ["action"]
      )
    );

    tools.push(
      fn(
        "net",
        "Reach the web: fetch, search, in-app Firefox. Prefer browse when you need the page seen and the bytes. If unsure, kit discover.",
        {
          action: { type: "string", description: "Intent: browse | gecko_load | gecko_click | gecko_type | gecko_shot | web_fetch | …" },
          url: { type: "string" },
          query: { type: "string" },
          method: { type: "string" },
          headers: { type: "object" },
          body: { type: "string" },
          timeout_ms: { type: "number" },
          mode: { type: "string", description: "embed (automate) | chrome (full Firefox UI)" },
          show: { type: "boolean" },
          x: { type: "number", description: "Click x (px or 0–1)" },
          y: { type: "number", description: "Click y (px or 0–1)" },
          text: { type: "string", description: "For gecko_type" },
          key: { type: "string", description: "For gecko_key" },
          js: { type: "string", description: "For gecko_eval / inspect eval" },
          selector: { type: "string", description: "For inspect / page click|type|waitFor" },
          method: { type: "string", description: "page: goto|click|type|evaluate|waitFor|screenshot" },
          ms: { type: "number", description: "For gecko_wait / page waitFor" },
        },
        ["action"]
      )
    );

    tools.push(
      fn(
        "browser",
        "Same as net for showing a page. Prefer net browse. Do not treat as a separate product.",
        {
          action: { type: "string", description: "browse | gecko_load | gecko_click | gecko_type | gecko_shot" },
          url: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          text: { type: "string" },
          key: { type: "string" },
          js: { type: "string" },
          ms: { type: "number" },
          mode: { type: "string" },
          show: { type: "boolean" },
        },
        ["action"]
      )
    );

    tools.push(
      fn(
        "kv",
        "Session memory cache. action + key/value. Discover if unsure.",
        {
          action: { type: "string", description: "kv_get | kv_set | kv_del | kv_keys | kv_status" },
          key: { type: "string" },
          keys: { type: "array", items: { type: "string" } },
          value: {},
          ns: { type: "string", description: "mem|mission|settings|gecko|session|tool|meta" },
          ex: { type: "number", description: "TTL seconds" },
          pattern: { type: "string" },
        },
        ["action"]
      )
    );

    tools.push(
      fn(
        "mind",
        "Stay on the mission: plan, remember, finish. Do not narrate the menu.",
        {
          action: { type: "string", description: "create_plan | todo | think | complete_task | store_memory | set_phase | …" },
          thought: { type: "string" },
          summary: { type: "string" },
          goal: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
          step: { type: "number" },
          status: { type: "string" },
          result: { type: "string" },
          content: { type: "string" },
          query: { type: "string" },
          items: { type: "string" },
          item: { type: "string" },
          phase: { type: "string" },
          fact: { type: "string" },
          decision: { type: "string" },
          dead_end: { type: "string" },
          current_step: { type: "string" },
          category: { type: "string" },
          importance: { type: "number" },
          limit: { type: "number" },
        },
        ["action"]
      )
    );

    tools.push(
      fn(
        "kit",
        "Extend yourself: install a package, create a tool, or discover what exists for an intent. Unsure → action=discover query=…",
        {
          action: { type: "string", description: "discover | micropip_install | create_tool | edit_tool | …" },
          package: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          kind: { type: "string" },
          body: { type: "string" },
          parameters: { type: "object" },
          query: { type: "string", description: "For discover: what you are trying to do" },
          algo: { type: "string", description: "crypto: sha256|md5|sha3|…" },
          data: { type: "string" },
          key: { type: "string" },
          password: { type: "string" },
          url: { type: "string", description: "wasm module url" },
          fn: { type: "string", description: "wasm export to call" },
          args: { type: "array" },
          id: { type: "string" },
          instance: {},
          schema: { type: "object" },
          draft: { type: "string" },
          type: { type: "string", description: "chart: bar|line|pie" },
          title: { type: "string" },
          values: { type: "array" },
        },
        ["action"]
      )
    );

    for (const [lane, meta] of Object.entries(LANES)) {
      const n = (idx.byLane[lane] && idx.byLane[lane].length) || 0;
      tools.push(
        fn(
          meta.name,
          meta.label +
            ". Pass tool=<id> and kwargs. Unsure of id → kit discover. Do not list ops.",
          {
            tool: {
              type: "string",
              description: "Dot-id for this job (discover if unknown)",
            },
            kwargs: {
              type: "object",
              description: "Arguments for that tool",
            },
          },
          ["tool"]
        )
      );
    }

    tools.push(
      fn(
        "pysec",
        "Any pysec tool by id when category is unclear. Prefer pysec_crypto/http/recon/vuln/analyze. Pass tool_id + kwargs. Never enumerate catalog.",
        {
          tool_id: { type: "string", description: "e.g. hash.digest, httpx.probe" },
          tool: { type: "string", description: "Alias of tool_id" },
          kwargs: { type: "object" },
        },
        []
      )
    );

    return tools;
  }

  function categoryKitBlurb() {
    return (
      "\n## VIBE\n" +
      "Do the job. guest bash/read/write/grep/tree for the workspace. net browse for the web.\n" +
      "Never list tools. Never dump a catalog. Explore = run the tree.\n"
    );
  }

  function aliasPysecKwargs(toolId, kwargs) {
    const out = Object.assign({}, kwargs || {});
    let params = [];
    try {
      const meta = getIndex().idToMeta[toolId];
      params = (meta && meta.params) || [];
    } catch (_) {}
    const aliases = {
      targets: ["url", "target", "host", "domain", "name"],
      target: ["url", "targets", "host", "domain"],
      name: ["domain", "host", "url", "target", "hostname"],
      host: ["domain", "url", "target", "name", "ip"],
      url: ["target", "targets", "href", "link"],
      data: ["text", "input", "content", "value"],
      text: ["data", "content", "input", "body"],
      domain: ["name", "host", "url"],
      ip: ["host", "address"],
      query: ["q", "search"],
    };
    for (const p of params) {
      const key = p && p.name;
      if (!key) continue;
      if (out[key] != null && out[key] !== "") continue;
      for (const c of aliases[key] || []) {
        if (out[c] != null && out[c] !== "") {
          out[key] = out[c];
          break;
        }
      }
    }
    return out;
  }

  /**
   * Resolve a category tool call → { kind, name, args } for inner dispatch.
   * kind: 'core' | 'pysec'
   */
  function resolveCategoryCall(name, args) {
    args = args && typeof args === "object" ? Object.assign({}, args) : {};
    const n = String(name || "");

    if (n === "guest" || n === "net" || n === "browser" || n === "kv" || n === "mind" || n === "kit") {
      let action = String(args.action || args.tool || args.tool_id || "").trim();
      if (!action) {
        return { error: "action required for " + n };
      }
      if (n === "kit" && action.indexOf(".") !== -1) {
        let kwargs = args.kwargs && typeof args.kwargs === "object" ? Object.assign({}, args.kwargs) : Object.assign({}, args);
        delete kwargs.action; delete kwargs.tool; delete kwargs.tool_id; delete kwargs.kwargs;
        return { kind: "pysec", name: action, args: aliasPysecKwargs(action, kwargs) };
      }
      if (n === "kv") {
        const kvAlias = { set: "kv_set", get: "kv_get", del: "kv_del", delete: "kv_del", keys: "kv_keys", status: "kv_status" };
        if (kvAlias[action]) action = kvAlias[action];
      }
      const maps = {
        guest: GUEST_ACTIONS,
        net: NET_ACTIONS,
        browser: NET_ACTIONS,
        kv: KV_ACTIONS,
        mind: MIND_ACTIONS,
        kit: KIT_ACTIONS,
      };
      if (!maps[n][action] && !maps[n][action.replace(/^gecko_/, "gecko_")]) {
        // allow unknown but warn — still try if it looks like a known core tool
      }
      delete args.action;
      delete args.tool;
      return { kind: "core", name: action, args: args };
    }

    if (n === "pysec" || n.indexOf("pysec_") === 0) {
      let toolId = String(args.tool || args.tool_id || args.id || "").trim();
      let kwargs =
        args.kwargs && typeof args.kwargs === "object" && !Array.isArray(args.kwargs)
          ? Object.assign({}, args.kwargs)
          : null;
      if (!kwargs) {
        kwargs = Object.assign({}, args);
        delete kwargs.tool;
        delete kwargs.tool_id;
        delete kwargs.id;
        delete kwargs.kwargs;
      }
      if (!toolId) {
        return { error: "tool (catalog id) required for " + n };
      }
      kwargs = aliasPysecKwargs(toolId, kwargs);
      // optional lane check
      if (n !== "pysec") {
        const lane = n.replace(/^pysec_/, "");
        const idx = getIndex();
        const toolLane = idx.idToLane[toolId];
        if (toolLane && toolLane !== lane && toolLane !== "other") {
          // soft warn — still run (agent may mis-bucket)
          kwargs.__lane_hint =
            "note: " + toolId + " is usually under pysec_" + toolLane;
        }
      }
      return { kind: "pysec", name: toolId, args: kwargs };
    }

    return null; // not a category tool
  }

  function isCategoryToolName(name) {
    return (
      name === "guest" ||
      name === "net" ||
      name === "browser" ||
      name === "kv" ||
      name === "mind" ||
      name === "kit" ||
      name === "pysec" ||
      (typeof name === "string" && name.indexOf("pysec_") === 0)
    );
  }

  const STOP = new Set(
    "the a an to of and or for in on at is it its you we do be as by from with this that what how can should please just any all our my your use using via then than not but if so get set want need would could".split(/\s+/)
  );

  async function toolDiscover(args) {
    const q = String((args && (args.query || args.q || args.thought)) || "")
      .toLowerCase()
      .trim();
    if (!q) {
      return JSON.stringify({ ok: false, hint: "Say the job. Then I do it." });
    }
    const askingMap = /\b(tools?|available|securit|pysec|what can|capabilities|kit)\b/.test(q);
    if (askingMap) {
      const idx = getIndex();
      const lanes = {};
      let total = 0;
      for (const [lane, meta] of Object.entries(LANES)) {
        const ids = idx.byLane[lane] || [];
        total += ids.length;
        lanes[meta.name] = { count: ids.length, examples: ids.slice(0, 10), when: meta.when };
      }
      return JSON.stringify({
        ok: true,
        stop: true,
        security_tools: total,
        lanes: lanes,
        how: "Call pysec_crypto / pysec_http / pysec_recon / pysec_vuln / pysec_analyze with tool=<id> and kwargs. Or pysec with tool_id. Do NOT call discover or list_session_tools again. Pick a tool and run it.",
        also: { guest: "bash files python", net: "browse fetch Firefox", kit: "micropip create_tool" }
      });
    }

    const explore = /\b(explor|workspace|folder|director|tree|files?|disk|look around|what.?s here|list (the )?files)\b/.test(q);
    if (explore) {
      try {
        if (typeof toolWorkspaceTree === "function") {
          return await toolWorkspaceTree({ path: "/workspace", depth: 3, limit: 220 });
        }
        if (typeof toolLs === "function") {
          return await toolLs({ path: "/workspace" });
        }
      } catch (e) {
        return "TOOL_ERROR: " + (e && e.message ? e.message : e);
      }
    }

    const browse = /\b(open|browse|visit|go to|firefox|gecko|page|url|http)\b/.test(q);
    if (browse && typeof toolWebFetch === "function") {
      const m = q.match(/https?:\/\/\S+/);
      if (m) {
        try { return await toolWebFetch({ url: m[0] }); } catch (e) {
          return "TOOL_ERROR: " + (e && e.message ? e.message : e);
        }
      }
    }

    const terms = q.split(/[^a-z0-9_.]+/).filter((t) => t.length > 2 && !STOP.has(t));
    let force = null;
    if (/\b(bash|shell|python|write|read|edit|grep|glob|mkdir)\b/.test(q)) force = "guest";
    else if (/\b(fetch|http|search|wisp|browser|click|type|screenshot)\b/.test(q)) force = "net";
    else if (/\b(kv|cache|ttl)\b/.test(q)) force = "kv";
    else if (/\b(hash|sha|hmac|aes|wasm|micropip)\b/.test(q)) force = "kit";
    else if (/\b(jwt|nuclei|sqlmap|xss|scan|vuln|recon|dns|csp|cors)\b/.test(q)) force = "pysec";

    const hits = [];
    function add(via, id, why) {
      if (force && via !== force && !(force === "pysec" && String(via).indexOf("pysec") === 0)) return;
      let score = 0;
      const blob = (via + " " + id + " " + why).toLowerCase();
      for (const t of terms) {
        if (id.toLowerCase() === t) score += 10;
        else if (blob.indexOf(t) !== -1) score += t.length > 4 ? 3 : 1;
      }
      if (id === "list_session_tools" || id === "discover") return;
      if (!score) return;
      hits.push({ call: via, use: id, why: why, score: score });
    }
    for (const [via, map] of [
      ["guest", GUEST_ACTIONS],
      ["net", NET_ACTIONS],
      ["kv", KV_ACTIONS],
      ["mind", MIND_ACTIONS],
      ["kit", KIT_ACTIONS],
    ]) {
      for (const [id, why] of Object.entries(map)) add(via, id, why);
    }
    try {
      const idx = getIndex();
      for (const [id, meta] of Object.entries(idx.idToMeta || {})) {
        const lane = idx.idToLane[id] || "other";
        add(lane === "other" ? "pysec" : "pysec_" + lane, id, (meta && meta.description) || "");
      }
    } catch (_) {}
    hits.sort((a, b) => b.score - a.score);
    const best = hits[0];
    if (!best) {
      return JSON.stringify({ ok: true, next: { call: "guest", use: "bash" } });
    }
    return JSON.stringify({
      ok: true,
      next: { call: best.call, use: best.use },
    });
  }

  global.GROUP_TO_LANE = GROUP_TO_LANE;
  global.LANES = LANES;
  global.buildCategoryAgentTools = buildCategoryAgentTools;
  global.categoryKitBlurb = categoryKitBlurb;
  global.resolveCategoryCall = resolveCategoryCall;
  global.isCategoryToolName = isCategoryToolName;
  global.invalidateCategoryIndex = invalidateCategoryIndex;
  global.getCategoryIndex = getIndex;
  global.toolDiscover = toolDiscover;
  global.buildCategoryAgentTools = buildCategoryAgentTools;
  global.categoryKitBlurb = categoryKitBlurb;
  global.resolveCategoryCall = resolveCategoryCall;
  global.isCategoryToolName = isCategoryToolName;
  global.invalidateCategoryIndex = invalidateCategoryIndex;
  global.getCategoryIndex = getIndex;
  try {
    if (typeof window !== "undefined" && window !== global) {
      for (const k of [
        "buildCategoryAgentTools",
        "categoryKitBlurb",
        "resolveCategoryCall",
        "isCategoryToolName",
        "invalidateCategoryIndex",
        "getCategoryIndex",
        "toolDiscover",
        "GROUP_TO_LANE",
        "LANES",
      ]) {
        if (global[k] != null) window[k] = global[k];
      }
    }
  } catch (_) {}
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
