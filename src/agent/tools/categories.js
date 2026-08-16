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
      when: "DNS, subdomains, tech, archives, intel, cloud buckets, email security",
      examples: "dns.resolve, subenum.enumerate, tech.fingerprint, wayback.collect",
    },
    vuln: {
      name: "pysec_vuln",
      label: "Vulnerability scan",
      when: "authorized vulnerability checks, scanners, payloads (sqlmap, xss, nuclei)",
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
    scratch: "Session pad /workspace/.scratch — op=write|read|list|clear",
    install_flask: "Offline flask wheel install",
    py_check: "Syntax/import check",
  };

  const NET_ACTIONS = {
    web_search: "Web search",
    web_fetch: "Fetch URL via host fabric",
    http_request: "HTTP request (method/headers/body)",
    guest_http: "HTTP from Alpine guest (no CORS)",
    mw_status: "Network fabric status",
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
    crypto: "Host hash/hmac/aes (Web Crypto). Instant for a simple digest",
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
        "Alpine /workspace. action=" + Object.keys(GUEST_ACTIONS).join("|") + ". Extra fields go in kwargs or top-level (command,path,content,code).",
        {
          action: { type: "string" },
          kwargs: { type: "object" },
          command: { type: "string" },
          code: { type: "string" },
          path: { type: "string" },
          content: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" },
          src: { type: "string" },
          dest: { type: "string" },
          pattern: { type: "string" },
        },
        ["action"]
      )
    );

    tools.push(
      fn(
        "net",
        "Web + shared Firefox. action=" + Object.keys(NET_ACTIONS).join("|") + ". url/query/text/x/y in kwargs or top-level.",
        {
          action: { type: "string" },
          kwargs: { type: "object" },
          url: { type: "string" },
          query: { type: "string" },
          text: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          method: { type: "string" },
          body: { type: "string" },
        },
        ["action"]
      )
    );

    tools.push(
      fn(
        "kv",
        "Session KV. action=" + Object.keys(KV_ACTIONS).join("|"),
        {
          action: { type: "string" },
          kwargs: { type: "object" },
          key: { type: "string" },
          value: {},
          ns: { type: "string" },
        },
        ["action"]
      )
    );

    tools.push(
      fn(
        "mind",
        "Mission state. action=" + Object.keys(MIND_ACTIONS).join("|"),
        {
          action: { type: "string" },
          kwargs: { type: "object" },
          thought: { type: "string" },
          text: { type: "string" },
          goal: { type: "string" },
          summary: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
          content: { type: "string" },
        },
        ["action"]
      )
    );

    tools.push(
      fn(
        "kit",
        "Pyodide + discover + create_tool. action=" + Object.keys(KIT_ACTIONS).join("|"),
        {
          action: { type: "string" },
          kwargs: { type: "object" },
          query: { type: "string" },
          name: { type: "string" },
          body: { type: "string" },
          package: { type: "string" },
          data: { type: "string" },
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
      "\n## Work\n" +
      "Use guest for the workspace (bash, read, write, grep, tree). Use net to browse the web.\n" +
      "Do not list tools or dump the catalog. To explore, run the workspace tree.\n"
    );
  }

  const HASH_ALGO = {
    sha1: "sha1",
    "sha-1": "sha1",
    sha256: "sha256",
    "sha-256": "sha256",
    sha384: "sha384",
    "sha-384": "sha384",
    sha512: "sha512",
    "sha-512": "sha512",
    sha3: "sha3",
    md5: "md5",
    blake2: "blake2s",
    blake2s: "blake2s",
    blake2b: "blake2b",
  };

  const FAMILY_DEFAULT = {
    hash: "hash.digest",
    codec: "codec.encode",
    jwt: "jwt.inspect",
    sqlmap: "sqlmap.scan",
    xss: "xss.scan",
    nuclei: "nuclei.scan",
    dns: "dns.resolve",
    sast: "sast.scan",
    secrets: "secrets.scan",
    nmap: "nmap.http_probe",
    cors: "cors.scan",
    csp: "csp.analyze",
    httpx: "httpx.probe",
    yara: "yara.scan",
    ssti: "ssti.scan",
    ssrf: "ssrf.scan",
    xxe: "xxe.scan",
    waf: "waf.detect",
    cookie: "cookie.scan",
    emailsec: "emailsec.check",
    subenum: "subenum.enumerate",
    wayback: "wayback.collect",
    cloud: "cloud.bucket",
    otp: "otp.totp",
    cipher: "cipher.decrypt",
    password: "password.analyze",
    headers: "headers.analyze",
    url: "url.analyze",
    fetch: "fetch.analyze",
    nikto: "nikto.scan",
    dirb: "dirb.brute",
    backup: "backup.scan",
    cms: "cms.detect",
    graphql: "graphql.introspect",
    redos: "redos.analyze",
    nosql: "nosql.scan",
    clickjack: "clickjack.scan",
    robots: "robots.scan",
    asn: "asn.lookup",
    ct: "ct.search",
    mutator: "mutator.mutate",
    upload: "upload.bypass",
    homoglyph: "homoglyph.generate",
    form: "form.scan",
    intel: "intel.urlhaus",
    crack: "crack.hash",
    hashid: "hashid.identify",
    x509: "x509.parse",
    jwtadv: "jwtadv.none",
    fuzzgen: "fuzzgen.generate",
    requests: "requests.get",
    param: "param.discover",
    takeover: "takeover.check",
    wpscan: "wpscan.scan",
    smuggle: "smuggle.detect",
    inject: "inject.scan",
    crlf: "crlf.scan",
    redirect: "redirect.scan",
    pp: "pp.scan",
    oauth: "oauth.analyze",
    wellknown: "wellknown.scan",
    katana: "katana.crawl",
    jsrecon: "jsrecon.analyze",
    headerfuzz: "headerfuzz.fuzz",
    internetdb: "internetdb.lookup",
    favicon: "favicon.hash",
    tech: "tech.fingerprint",
    api: "api.discover",
    vhost: "vhost.brute",
    har: "har.parse",
    proxy: "proxy.status",
    repeater: "repeater.send",
  };

  /**
   * Map shorthand / wrong ids (hash, hash.sha256, codec.b64) to catalog ids
   * and fill implied kwargs (algorithm, format).
   */
  function resolvePysecToolId(raw, kwargs) {
    const out = Object.assign({}, kwargs || {});
    let id = String(raw || "").trim();
    if (!id) return { id: "", kwargs: out };

    if (out.format === "b64") out.format = "base64";
    if (out.fmt === "b64") out.format = out.format || "base64";

    let known = false;
    try {
      const meta = getIndex().idToMeta;
      known = !!(meta && meta[id]);
    } catch (_) {}
    if (known) {
      return { id: id, kwargs: aliasPysecKwargs(id, out) };
    }

    const lower = id.toLowerCase().replace(/\s+/g, "");

    if (HASH_ALGO[lower] || lower === "sha256" || lower === "sha1" || lower === "md5") {
      if (!out.algorithm) out.algorithm = HASH_ALGO[lower] || lower;
      return { id: "hash.digest", kwargs: aliasPysecKwargs("hash.digest", out) };
    }
    const hashAlgo = lower.match(/^hash\.(sha-?1|sha-?256|sha-?384|sha-?512|sha3|md5|blake2s?|blake2b)$/);
    if (hashAlgo) {
      if (!out.algorithm) out.algorithm = HASH_ALGO[hashAlgo[1]] || hashAlgo[1].replace(/-/g, "");
      return { id: "hash.digest", kwargs: aliasPysecKwargs("hash.digest", out) };
    }
    if (lower === "hash" || lower === "digest" || lower === "sha") {
      if (!out.algorithm) out.algorithm = "sha256";
      return { id: "hash.digest", kwargs: aliasPysecKwargs("hash.digest", out) };
    }

    const encodeB64 = /^(codec\.(b64|base64|encode\.b64)|b64|base64|b64encode)$/.test(lower);
    const decodeB64 = /^(codec\.(decode\.b64|unb64|fromb64|decode\.base64)|b64decode)$/.test(lower);
    if (decodeB64 || (encodeB64 && /decod/i.test(String(out.action || "")))) {
      if (!out.format) out.format = "base64";
      delete out.action;
      return { id: "codec.decode", kwargs: aliasPysecKwargs("codec.decode", out) };
    }
    if (encodeB64) {
      if (!out.format) out.format = "base64";
      delete out.action;
      return { id: "codec.encode", kwargs: aliasPysecKwargs("codec.encode", out) };
    }
    if (lower === "codec.hex" || lower === "hex") {
      if (!out.format) out.format = "hex";
      return { id: "codec.encode", kwargs: aliasPysecKwargs("codec.encode", out) };
    }

    const fam = FAMILY_DEFAULT[lower];
    if (fam) {
      return { id: fam, kwargs: aliasPysecKwargs(fam, out) };
    }

    if (typeof PYSEC_FN_TO_ID !== "undefined" && PYSEC_FN_TO_ID && PYSEC_FN_TO_ID[id]) {
      const mapped = PYSEC_FN_TO_ID[id];
      return { id: mapped, kwargs: aliasPysecKwargs(mapped, out) };
    }

    return { id: id, kwargs: aliasPysecKwargs(id, out) };
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
      algorithm: ["algo", "hash"],
      format: ["fmt", "encoding", "enc"],
    };
    if (out.format === "b64") out.format = "base64";
    if (out.fmt === "b64") out.format = out.format || "base64";
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
        const resolved = resolvePysecToolId(action, kwargs);
        return { kind: "pysec", name: resolved.id, args: resolved.kwargs };
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
      if (args.kwargs && typeof args.kwargs === "object" && !Array.isArray(args.kwargs)) {
        const flat = Object.assign({}, args, args.kwargs);
        delete flat.kwargs;
        args = flat;
      }
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
      const resolved = resolvePysecToolId(toolId, kwargs);
      toolId = resolved.id;
      kwargs = resolved.kwargs;
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
      return JSON.stringify({ ok: false, hint: "Describe what you need." });
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
        security_tools: total,
        lanes: lanes,
        how: "Call pysec_crypto / pysec_http / pysec_recon / pysec_vuln / pysec_analyze with tool=<id> and kwargs. Or pysec with tool_id.",
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
    else if (/\b(hash|sha|hmac|digest|codec|jwt|nuclei|sqlmap|xss|scan|vuln|recon|dns|csp|cors)\b/.test(q)) force = "pysec";
    else if (/\b(wasm|micropip)\b/.test(q)) force = "kit";

    const hits = [];
    function add(via, id, why) {
      if (force && via !== force && !(force === "pysec" && String(via).indexOf("pysec") === 0)) return;
      let score = 0;
      const blob = (via + " " + id + " " + why).toLowerCase();
      for (const t of terms) {
        if (id.toLowerCase() === t) score += 10;
        else if (id.toLowerCase().split(".")[0] === t || id.toLowerCase().startsWith(t + ".")) score += 8;
        else if (blob.indexOf(t) !== -1) score += t.length > 4 ? 3 : 1;
      }
      if (FAMILY_DEFAULT[id] || id === "hash.digest" || id === "codec.encode" || id === "jwt.inspect") score += 2;
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
  global.resolvePysecToolId = resolvePysecToolId;
  global.isCategoryToolName = isCategoryToolName;
  global.invalidateCategoryIndex = invalidateCategoryIndex;
  global.getCategoryIndex = getIndex;
  global.toolDiscover = toolDiscover;
  try {
    if (typeof window !== "undefined" && window !== global) {
      for (const k of [
        "buildCategoryAgentTools",
        "categoryKitBlurb",
        "resolveCategoryCall",
        "resolvePysecToolId",
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
