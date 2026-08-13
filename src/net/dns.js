function parseCustomDns(raw) {
  // DNS UI removed — fixed public resolvers only
  return {
    label: "static",
    resolvers: ["1.1.1.1", "8.8.8.8"],
    doh: [],
  };
}


function resolvConfText(resolvers) {
  const rs = (resolvers && resolvers.length) ? resolvers : ["1.1.1.1", "8.8.8.8"];
  return rs.map((r) => "nameserver " + r).join("\n") + "\n";
}



/* ── DNS help for flaky guest resolvers (Errno -3) ── */
async function resolveA(hostname, dohBases) {
  return []; // DNS over HTTPS removed — use static hosts only
}




function hostFromBase(base) {
  try {
    return new URL(base.includes("://") ? base : "https://" + base).hostname;
  } catch {
    return "api.groq.com";
  }
}

async function injectHostsForApi() {
  try { if (el.status) el.status.textContent = "auto · network + hosts..."; } catch (_) {}
  const STATIC = {
    "integrate.api.nvidia.com": ["75.2.113.119", "99.83.136.103"],
    "api.nvcf.nvidia.com": ["3.218.201.149", "98.83.173.66"],
    "api.openai.com": ["162.159.140.245", "172.66.0.245"],
    "openrouter.ai": ["104.18.2.115", "104.18.3.115"],
    "api.groq.com": ["172.64.149.20", "104.18.38.236"],
    "api.together.xyz": ["104.18.0.0"],
    "api.deepseek.com": ["104.18.0.0"],
    "pypi.org": ["151.101.0.223", "151.101.64.223"],
    "files.pythonhosted.org": ["151.101.0.223", "151.101.64.223"],
    "example.com": ["104.20.23.154", "172.66.147.243"],
    "api.ipify.org": ["104.26.12.24", "104.26.13.24"],
    "en.wikipedia.org": ["208.80.154.224", "185.15.59.224"],
    "api.duckduckgo.com": ["52.250.42.157"],
    "lite.duckduckgo.com": ["52.250.42.157"],
    "html.duckduckgo.com": ["52.250.42.157"],
    "search.brave.com": ["13.248.202.133"],
    "www.mojeek.com": ["5.135.165.54"],
    "www.bing.com": ["204.79.197.200"],
    "www.google.com": ["142.250.72.100"],
  };
  // Always include the operator's configured API host
  try {
    const s = ensureDefaultSettings();
    const u = new URL(s.apiBase || DEFAULTS.apiBase);
    if (u.hostname && !STATIC[u.hostname]) {
      STATIC[u.hostname] = []; // resolve via guest DNS / WISP
    }
  } catch (_) {}
  const hostLines = ["127.0.0.1 localhost", "::1 localhost"];
  for (const [h, ips] of Object.entries(STATIC)) {
    for (const ip of ips) if (ip) hostLines.push(ip + " " + h);
  }
  const hostsText = hostLines.join("\n") + "\n";
  const resolvText = "nameserver 192.168.86.1\nnameserver 1.1.1.1\nnameserver 8.8.8.8\n";
  const hostsB64 = btoa(unescape(encodeURIComponent(hostsText)));
  const rcB64 = btoa(unescape(encodeURIComponent(resolvText)));
  const dnsMapStr = Object.entries(STATIC).map(([h, ips]) => h + ":" + (ips.join("|") || "")).join(";");
  window.__GOAR_DNS_MAP = dnsMapStr;
  send(
    "echo " + hostsB64 + " | base64 -d > /etc/hosts; " +
    "echo " + rcB64 + " | base64 -d > /etc/resolv.conf; " +
    "ip link set eth0 up 2>/dev/null || true; " +
    "ip addr add 192.168.86.100/24 dev eth0 2>/dev/null || true; " +
    "ip route replace default via 192.168.86.1 dev eth0 2>/dev/null || true; " +
    "ip neigh replace 192.168.86.1 lladdr 52:54:00:01:02:03 dev eth0 2>/dev/null || true; " +
    "mkdir -p /run; echo export GOAR_DNS_MAP=" + shellQuote(dnsMapStr) + " > /run/goar.dns.env; " +
    "echo '[goar-seq] dns-done n=" + Object.keys(STATIC).length + "'"
  );
  await waitForSerial(/\[goar-seq\] dns-done/, 25000);
}









/** Correct boot sequence: net → credentials → agent */
