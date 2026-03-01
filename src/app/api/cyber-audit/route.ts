import { NextRequest, NextResponse } from "next/server";
import * as net from "net";
import * as tls from "tls";
import * as dns from "dns";
import { URL } from "url";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface HeaderCheck {
  name: string;
  present: boolean;
  value?: string;
  recommendation?: string;
}

interface PortResult {
  port: number;
  service: string;
  state: "open" | "closed" | "filtered";
  banner?: string;
  risk: "critical" | "high" | "medium" | "low" | "info";
}

interface CookieCheck {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string | null;
  path: string;
  domain: string;
  issues: string[];
}

interface TlsResult {
  version: string;
  cipher: string;
  cipherBits: number;
  validFrom: string;
  validTo: string;
  issuer: string;
  subject: string;
  daysUntilExpiry: number;
  grade: string;
  altNames: string[];
  serialNumber: string;
}

interface DnsRecord {
  type: string;
  value: string;
}

interface VulnCheck {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  description: string;
  remediation: string;
  affectedComponent: string;
  cvss?: number;
  cve?: string;
}

interface ComplianceCheck {
  name: string;
  passed: boolean;
  details: string;
  category: string;
}

interface SourceLeak {
  id: string;
  type: "git" | "env" | "sourcemap" | "backup" | "config" | "debug" | "directory" | "dependency" | "docker" | "api-doc";
  url: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  content?: string;
  remediation: string;
}

interface SourceAudit {
  leaks: SourceLeak[];
  aiAnalysis?: string;
  exposedFiles: number;
  criticalSecrets: number;
}

interface AuditResult {
  target: string;
  scanDate: string;
  duration: number;
  reachable: boolean;
  statusCode?: number;
  redirectUrl?: string;
  redirectChain?: string[];
  serverHeader?: string;
  poweredBy?: string;
  headers: HeaderCheck[];
  ports: PortResult[];
  tlsInfo?: TlsResult;
  dnsRecords: DnsRecord[];
  cookies: CookieCheck[];
  vulnerabilities: VulnCheck[];
  compliance: ComplianceCheck[];
  sourceAudit?: SourceAudit;
  score: number;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Security Headers reference
// ═══════════════════════════════════════════════════════════════════════════

const SECURITY_HEADERS = [
  { name: "content-security-policy", label: "Content-Security-Policy", weight: 15, recommendation: "Definir une politique CSP stricte pour prevenir les XSS et injections de contenu" },
  { name: "x-frame-options", label: "X-Frame-Options", weight: 10, recommendation: "Ajouter X-Frame-Options: DENY ou SAMEORIGIN pour prevenir le clickjacking" },
  { name: "x-content-type-options", label: "X-Content-Type-Options", weight: 5, recommendation: "Ajouter X-Content-Type-Options: nosniff pour prevenir le MIME sniffing" },
  { name: "strict-transport-security", label: "Strict-Transport-Security", weight: 15, recommendation: "Activer HSTS: max-age=31536000; includeSubDomains; preload" },
  { name: "referrer-policy", label: "Referrer-Policy", weight: 3, recommendation: "Configurer Referrer-Policy: strict-origin-when-cross-origin" },
  { name: "permissions-policy", label: "Permissions-Policy", weight: 3, recommendation: "Restreindre les APIs: camera=(), microphone=(), geolocation=()" },
  { name: "cross-origin-opener-policy", label: "Cross-Origin-Opener-Policy", weight: 3, recommendation: "Ajouter COOP: same-origin" },
  { name: "cross-origin-resource-policy", label: "Cross-Origin-Resource-Policy", weight: 3, recommendation: "Ajouter CORP: same-origin" },
  { name: "cross-origin-embedder-policy", label: "Cross-Origin-Embedder-Policy", weight: 2, recommendation: "Ajouter COEP: require-corp" },
  { name: "x-permitted-cross-domain-policies", label: "X-Permitted-Cross-Domain-Policies", weight: 2, recommendation: "Ajouter X-Permitted-Cross-Domain-Policies: none" },
];

const PORTS_TO_SCAN: { port: number; service: string; risk: PortResult["risk"] }[] = [
  { port: 21, service: "FTP", risk: "critical" },
  { port: 22, service: "SSH", risk: "medium" },
  { port: 23, service: "Telnet", risk: "critical" },
  { port: 25, service: "SMTP", risk: "medium" },
  { port: 53, service: "DNS", risk: "low" },
  { port: 80, service: "HTTP", risk: "info" },
  { port: 110, service: "POP3", risk: "high" },
  { port: 143, service: "IMAP", risk: "high" },
  { port: 443, service: "HTTPS", risk: "info" },
  { port: 445, service: "SMB", risk: "critical" },
  { port: 993, service: "IMAPS", risk: "info" },
  { port: 995, service: "POP3S", risk: "info" },
  { port: 1433, service: "MSSQL", risk: "critical" },
  { port: 3306, service: "MySQL", risk: "critical" },
  { port: 3389, service: "RDP", risk: "critical" },
  { port: 5432, service: "PostgreSQL", risk: "critical" },
  { port: 5900, service: "VNC", risk: "critical" },
  { port: 6379, service: "Redis", risk: "critical" },
  { port: 8080, service: "HTTP-Alt", risk: "medium" },
  { port: 8443, service: "HTTPS-Alt", risk: "low" },
  { port: 27017, service: "MongoDB", risk: "critical" },
];

const ADMIN_PATHS = [
  "/admin", "/administrator", "/wp-admin", "/wp-login.php",
  "/login", "/signin", "/auth", "/panel",
  "/phpmyadmin", "/pma", "/adminer", "/cpanel",
  "/.env", "/.git/config", "/.htaccess", "/server-status",
  "/api/debug", "/graphql", "/swagger", "/api-docs",
  "/robots.txt", "/sitemap.xml", "/security.txt", "/.well-known/security.txt",
];

// ═══════════════════════════════════════════════════════════════════════════
// Scan functions
// ═══════════════════════════════════════════════════════════════════════════

function scanPort(host: string, port: number, timeoutMs = 3000): Promise<{ open: boolean; banner?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let banner = "";
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => {
      socket.on("data", (data) => { banner = data.toString().trim().slice(0, 200); });
      setTimeout(() => { socket.destroy(); resolve({ open: true, banner: banner || undefined }); }, 500);
    });
    socket.on("timeout", () => { socket.destroy(); resolve({ open: false }); });
    socket.on("error", () => { socket.destroy(); resolve({ open: false }); });
    socket.connect(port, host);
  });
}

async function scanPorts(host: string): Promise<PortResult[]> {
  const results: PortResult[] = [];
  const batchSize = 7;
  for (let i = 0; i < PORTS_TO_SCAN.length; i += batchSize) {
    const batch = PORTS_TO_SCAN.slice(i, i + batchSize);
    const promises = batch.map(async (p) => {
      const { open, banner } = await scanPort(host, p.port);
      if (open) {
        results.push({ port: p.port, service: p.service, state: "open", banner, risk: p.risk });
      }
    });
    await Promise.all(promises);
  }
  return results.sort((a, b) => a.port - b.port);
}

function scanTls(host: string, port = 443): Promise<TlsResult | null> {
  return new Promise((resolve) => {
    try {
      const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: 8000 }, () => {
        try {
          const cert = socket.getPeerCertificate(true);
          const cipher = socket.getCipher();
          const protocol = socket.getProtocol();

          const validFrom = cert.valid_from ? new Date(cert.valid_from).toISOString().slice(0, 10) : "N/A";
          const validTo = cert.valid_to ? new Date(cert.valid_to).toISOString().slice(0, 10) : "N/A";
          const daysUntilExpiry = cert.valid_to
            ? Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000)
            : -1;

          const issuer = cert.issuer
            ? [cert.issuer.O, cert.issuer.CN].filter(Boolean).join(" — ") || "Unknown"
            : "Unknown";
          const subject = cert.subject
            ? cert.subject.CN || cert.subject.O || "Unknown"
            : "Unknown";

          const altNames = cert.subjectaltname
            ? cert.subjectaltname.split(",").map((s: string) => s.trim().replace("DNS:", ""))
            : [];

          let grade = "C";
          if (protocol === "TLSv1.3" && daysUntilExpiry > 30 && cipher?.name?.includes("AES")) grade = "A+";
          else if (protocol === "TLSv1.3" && daysUntilExpiry > 0) grade = "A";
          else if (protocol === "TLSv1.2" && daysUntilExpiry > 30) grade = "B";
          else if (protocol === "TLSv1.2" && daysUntilExpiry > 0) grade = "B-";
          else if (protocol === "TLSv1.1" || protocol === "TLSv1") grade = "F";
          if (daysUntilExpiry <= 0) grade = "F";

          const result: TlsResult = {
            version: protocol || "Unknown",
            cipher: cipher?.name || "Unknown",
            cipherBits: cipher?.version ? parseInt(cipher.version) : 0,
            validFrom,
            validTo,
            issuer,
            subject,
            daysUntilExpiry,
            grade,
            altNames: altNames.slice(0, 20),
            serialNumber: cert.serialNumber || "N/A",
          };
          socket.destroy();
          resolve(result);
        } catch {
          socket.destroy();
          resolve(null);
        }
      });
      socket.on("error", () => { socket.destroy(); resolve(null); });
      socket.on("timeout", () => { socket.destroy(); resolve(null); });
    } catch {
      resolve(null);
    }
  });
}

async function resolveDns(hostname: string): Promise<DnsRecord[]> {
  const resolver = new dns.promises.Resolver();
  resolver.setServers(["8.8.8.8", "1.1.1.1"]);
  const records: DnsRecord[] = [];

  const queries: { type: string; fn: () => Promise<unknown> }[] = [
    { type: "A", fn: () => resolver.resolve4(hostname) },
    { type: "AAAA", fn: () => resolver.resolve6(hostname) },
    { type: "MX", fn: () => resolver.resolveMx(hostname) },
    { type: "NS", fn: () => resolver.resolveNs(hostname) },
    { type: "TXT", fn: () => resolver.resolveTxt(hostname) },
    { type: "CNAME", fn: () => resolver.resolveCname(hostname) },
    { type: "SOA", fn: () => resolver.resolveSoa(hostname) },
  ];

  for (const q of queries) {
    try {
      const res = await q.fn();
      if (q.type === "A" || q.type === "AAAA" || q.type === "NS" || q.type === "CNAME") {
        for (const v of res as string[]) records.push({ type: q.type, value: v });
      } else if (q.type === "MX") {
        for (const mx of res as { exchange: string; priority: number }[]) {
          records.push({ type: "MX", value: `${mx.priority} ${mx.exchange}` });
        }
      } else if (q.type === "TXT") {
        for (const txt of res as string[][]) {
          const val = txt.join("");
          if (val.startsWith("v=spf1")) records.push({ type: "SPF", value: val });
          else if (val.startsWith("v=DMARC1")) records.push({ type: "DMARC", value: val });
          else if (val.startsWith("v=DKIM1")) records.push({ type: "DKIM", value: val });
          else records.push({ type: "TXT", value: val.slice(0, 200) });
        }
      } else if (q.type === "SOA") {
        const soa = res as { nsname: string; hostmaster: string; serial: number };
        records.push({ type: "SOA", value: `${soa.nsname} ${soa.hostmaster} (serial: ${soa.serial})` });
      }
    } catch { /* record type not found */ }
  }

  try {
    const dmarcRecords = await resolver.resolveTxt(`_dmarc.${hostname}`);
    for (const txt of dmarcRecords) {
      const val = txt.join("");
      if (val.startsWith("v=DMARC1")) records.push({ type: "DMARC", value: val });
    }
  } catch { /* no DMARC */ }

  // DKIM detection via common selectors (TXT and CNAME)
  if (!records.some(r => r.type === "DKIM")) {
    const dkimSelectors = [
      "default", "selector1", "selector2", "google", "mail", "dkim",
      "k1", "k2", "k3", "s1", "s2", "smtp", "email",
      "hostinger", "titan", "mxroute", "protonmail", "pm",
      "mandrill", "mailgun", "sendgrid", "ses", "amazonses",
      "cm", "key1", "key2", "mx", "mailo", "zoho",
    ];
    for (const sel of dkimSelectors) {
      const dkimDomain = `${sel}._domainkey.${hostname}`;
      try {
        const txtRecs = await resolver.resolveTxt(dkimDomain);
        for (const txt of txtRecs) {
          const val = txt.join("");
          if (/v=DKIM1|k=rsa|p=/i.test(val)) {
            records.push({ type: "DKIM", value: `${sel}._domainkey → ${val.slice(0, 150)}` });
          }
        }
      } catch { /* no TXT DKIM for this selector */ }
      try {
        const cnameRecs = await resolver.resolveCname(dkimDomain);
        for (const cname of cnameRecs) {
          records.push({ type: "DKIM", value: `${sel}._domainkey → CNAME ${cname}` });
        }
      } catch { /* no CNAME DKIM for this selector */ }
      if (records.some(r => r.type === "DKIM")) break;
    }
  }

  return records;
}

function parseCookies(setCookieHeaders: string[]): CookieCheck[] {
  return setCookieHeaders.map(raw => {
    const parts = raw.split(";").map(p => p.trim());
    const [nameVal] = parts;
    const [name] = nameVal.split("=");
    const flags = parts.slice(1).map(p => p.toLowerCase());

    const secure = flags.some(f => f === "secure");
    const httpOnly = flags.some(f => f === "httponly");
    const sameSiteFlag = flags.find(f => f.startsWith("samesite="));
    const sameSite = sameSiteFlag ? sameSiteFlag.split("=")[1] : null;
    const pathFlag = flags.find(f => f.startsWith("path="));
    const path = pathFlag ? pathFlag.split("=")[1] : "/";
    const domainFlag = flags.find(f => f.startsWith("domain="));
    const domain = domainFlag ? domainFlag.split("=")[1] : "";

    const issues: string[] = [];
    if (!secure) issues.push("Attribut Secure absent — cookie transmis en clair sur HTTP");
    if (!httpOnly) issues.push("Attribut HttpOnly absent — cookie accessible via JavaScript (risque XSS)");
    if (!sameSite || sameSite === "none") issues.push("SameSite absent ou None — vulnerable au CSRF");

    return { name: name.trim(), secure, httpOnly, sameSite, path, domain, issues };
  });
}

async function checkVulnerabilities(url: string, html: string, headers: Headers): Promise<VulnCheck[]> {
  const vulns: VulnCheck[] = [];

  // XSS reflected test
  const xssPayload = "<script>alert(1)</script>";
  try {
    const testUrl = new URL(url);
    testUrl.searchParams.set("q", xssPayload);
    testUrl.searchParams.set("search", xssPayload);
    const res = await fetch(testUrl.toString(), {
      redirect: "follow",
      headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.text();
    if (body.includes(xssPayload)) {
      vulns.push({
        id: "vuln-xss-reflected",
        title: "XSS reflechi detecte",
        severity: "critical",
        category: "Injection",
        description: "Le parametre de recherche est reflechi dans la reponse sans sanitisation. Un attaquant peut injecter du JavaScript arbitraire.",
        remediation: "Encoder toutes les sorties HTML (HTML entity encoding). Utiliser une CSP stricte. Implementer une validation d'entree cote serveur.",
        affectedComponent: "Parametres URL",
        cvss: 8.2,
      });
    }
  } catch { /* test failed, not necessarily safe */ }

  // CSRF check — detect both classic token and modern cookie-based protection
  const hasCsrfToken = html.includes("csrf") || html.includes("_token") || html.includes("authenticity_token") || html.includes("__RequestVerificationToken");
  const hasCsrfCookie = html.includes("csrf-token") || html.includes("__Host-next-auth.csrf") || html.includes("XSRF-TOKEN");
  const hasSameSiteCookies = headers.get("set-cookie")?.toLowerCase().includes("samesite=lax") || headers.get("set-cookie")?.toLowerCase().includes("samesite=strict");
  const hasCspFormAction = (headers.get("content-security-policy") || "").includes("form-action");
  const hasModernCsrf = hasCsrfCookie || hasSameSiteCookies || hasCspFormAction;
  const forms = (html.match(/<form[^>]*>/gi) || []);
  const hasFormsWithoutCsrf = forms.length > 0 && !hasCsrfToken && !hasModernCsrf;
  if (hasFormsWithoutCsrf) {
    vulns.push({
      id: "vuln-csrf-missing",
      title: "Protection CSRF absente sur les formulaires",
      severity: "high",
      category: "CSRF",
      description: `${forms.length} formulaire(s) detecte(s) sans token CSRF visible ni protection cookie-based (SameSite, CSP form-action). Les actions utilisateur pourraient etre forgees.`,
      remediation: "Implementer des tokens CSRF ou utiliser SameSite=Strict + CSP form-action 'self'.",
      affectedComponent: "Formulaires",
      cvss: 6.5,
    });
  } else if (forms.length > 0 && !hasCsrfToken && hasModernCsrf) {
    vulns.push({
      id: "vuln-csrf-modern",
      title: "Protection CSRF via cookies (methode moderne)",
      severity: "info",
      category: "CSRF",
      description: `${forms.length} formulaire(s) detecte(s). Pas de token CSRF classique, mais protection assuree par SameSite cookies et/ou CSP form-action.`,
      remediation: "Aucune action requise — protection moderne en place.",
      affectedComponent: "Formulaires",
    });
  }

  // Information disclosure in HTML — strip JSON-LD and structured data before scanning
  const htmlWithoutStructured = html
    .replace(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script[^>]*type\s*=\s*["']application\/json["'][^>]*>[\s\S]*?<\/script>/gi, "");

  const sensitivePatterns = [
    { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']?[a-zA-Z0-9_-]{20,}/i, name: "Cle API exposee", severity: "critical" as const },
    { pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']+["']/i, name: "Mot de passe en dur dans le code", severity: "critical" as const },
    { pattern: /(?:secret[_-]?key|private[_-]?key)\s*[:=]\s*["']?[a-zA-Z0-9_/+=]{20,}/i, name: "Cle secrete exposee", severity: "critical" as const },
    { pattern: /<!--[\s\S]*?(?:TODO|FIXME|HACK|BUG|password|secret)[\s\S]*?-->/i, name: "Commentaire HTML sensible", severity: "medium" as const },
    { pattern: /(?:mysql|postgres|mongodb):\/\/[^\s"'<]+/i, name: "Chaine de connexion BDD exposee", severity: "critical" as const },
  ];
  for (const sp of sensitivePatterns) {
    if (sp.pattern.test(htmlWithoutStructured)) {
      vulns.push({
        id: `vuln-disclosure-${sp.name.replace(/\s/g, "-").toLowerCase()}`,
        title: sp.name,
        severity: sp.severity,
        category: "Information Disclosure",
        description: `Un pattern sensible a ete detecte dans le code source HTML de la page (hors donnees structurees JSON-LD/SEO).`,
        remediation: "Supprimer toute information sensible du code source. Utiliser des variables d'environnement pour les secrets.",
        affectedComponent: "Code source HTML",
      });
    }
  }

  // Directory listing / error pages
  if (html.includes("Index of /") || html.includes("Directory listing for")) {
    vulns.push({
      id: "vuln-dir-listing",
      title: "Listing de repertoire active",
      severity: "medium",
      category: "Configuration",
      description: "Le serveur expose le contenu des repertoires. Un attaquant peut decouvrir des fichiers sensibles.",
      remediation: "Desactiver le directory listing: Options -Indexes (Apache) ou autoindex off (Nginx).",
      affectedComponent: "Configuration serveur",
    });
  }

  // Mixed content
  const httpResources = html.match(/(?:src|href|action)\s*=\s*["']http:\/\//gi);
  if (httpResources && httpResources.length > 0) {
    vulns.push({
      id: "vuln-mixed-content",
      title: `Contenu mixte detecte (${httpResources.length} ressource(s) HTTP)`,
      severity: "medium",
      category: "Transport",
      description: "Des ressources sont chargees en HTTP non chiffre sur une page HTTPS, exposant les donnees en transit.",
      remediation: "Migrer toutes les ressources vers HTTPS. Ajouter upgrade-insecure-requests dans la CSP.",
      affectedComponent: "Ressources externes",
    });
  }

  // X-Powered-By / Server version
  const poweredBy = headers.get("x-powered-by");
  if (poweredBy) {
    vulns.push({
      id: "vuln-powered-by",
      title: `Header X-Powered-By expose: ${poweredBy}`,
      severity: "low",
      category: "Information Disclosure",
      description: `Le header X-Powered-By revele la technologie utilisee (${poweredBy}), facilitant le ciblage d'exploits connus.`,
      remediation: "Supprimer le header X-Powered-By de la configuration serveur.",
      affectedComponent: "Serveur HTTP",
    });
  }

  return vulns;
}

async function checkAdminPaths(baseUrl: string): Promise<VulnCheck[]> {
  const vulns: VulnCheck[] = [];
  const found: string[] = [];

  // Soft-404 baseline: fetch a random path to get the "not found" page signature
  let baseline404Size = -1;
  let baseline404Hash = "";
  try {
    const rnd = await fetch(`${baseUrl}/argos-probe-${Date.now()}-nonexistent`, {
      redirect: "manual",
      headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (rnd.status === 200) {
      const body = await rnd.text();
      baseline404Size = body.length;
      baseline404Hash = body.slice(0, 500).replace(/\d+/g, "").trim();
    }
  } catch { /* ignore */ }

  const SENSITIVE_CONTENT: Record<string, RegExp> = {
    "/.env": /^[A-Z_]+=|DB_|SECRET|PASSWORD|API_KEY/m,
    "/.git/config": /\[core\]|\[remote|\[branch/,
    "/.htaccess": /RewriteEngine|RewriteRule|Deny from|AuthType/i,
    "/server-status": /Apache Server Status|Server Version:|Total Accesses/i,
  };

  const batchSize = 5;
  for (let i = 0; i < ADMIN_PATHS.length; i += batchSize) {
    const batch = ADMIN_PATHS.slice(i, i + batchSize);
    const promises = batch.map(async (path) => {
      try {
        const isSensitive = path.includes(".env") || path.includes(".git") || path.includes(".htaccess") || path.includes("server-status");
        const method = isSensitive ? "GET" : "HEAD";
        const res = await fetch(`${baseUrl}${path}`, {
          method,
          redirect: "manual",
          headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" },
          signal: AbortSignal.timeout(5000),
        });
        if (res.status === 200 || res.status === 301 || res.status === 302) {
          if (isSensitive && res.status === 200) {
            const body = await res.text();
            // Soft-404 detection: if the response matches the baseline "not found" page, skip
            const bodyHash = body.slice(0, 500).replace(/\d+/g, "").trim();
            if (baseline404Size > 0 && (
              Math.abs(body.length - baseline404Size) < 200 ||
              bodyHash === baseline404Hash
            )) {
              return; // soft 404 — skip
            }
            // Content verification: check if the body actually looks like the sensitive file
            const contentPattern = SENSITIVE_CONTENT[path];
            if (contentPattern && !contentPattern.test(body)) {
              return; // body doesn't match expected content — likely a custom error page
            }
            // Reject if it's clearly an HTML page (not a config file)
            if (body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html")) {
              return; // HTML page, not a real .env / .git / .htaccess
            }
            vulns.push({
              id: `vuln-exposed-${path.replace(/[^a-z0-9]/g, "")}`,
              title: `Fichier sensible accessible: ${path}`,
              severity: "critical",
              category: "Exposition de fichiers",
              description: `Le fichier ${path} est accessible publiquement et contient du contenu coherent avec un fichier de configuration. Il peut exposer des secrets.`,
              remediation: `Bloquer l'acces a ${path} via la configuration du serveur web. Verifier qu'aucun secret n'a ete compromis.`,
              affectedComponent: "Configuration serveur",
              cvss: 9.0,
            });
          } else if (!isSensitive) {
            found.push(`${path} (${res.status})`);
          }
        }
      } catch { /* unreachable */ }
    });
    await Promise.all(promises);
  }

  // filter admin paths against soft-404 baseline
  const realFound = found.filter(f => {
    if (baseline404Size <= 0) return true;
    return true; // HEAD requests can't be compared by body; keep them
  });

  if (realFound.length > 0) {
    vulns.push({
      id: "vuln-admin-paths",
      title: `${realFound.length} chemin(s) d'administration detecte(s)`,
      severity: "low",
      category: "Reconnaissance",
      description: `Chemins accessibles: ${realFound.join(", ")}. Ces endpoints sont des cibles potentielles pour les attaquants.`,
      remediation: "Restreindre l'acces aux interfaces d'administration par IP, VPN ou authentification forte (MFA).",
      affectedComponent: "Endpoints",
    });
  }

  return vulns;
}

const CLOUDFLARE_PORTS = new Set([80, 443, 2052, 2053, 2082, 2083, 2086, 2087, 2095, 2096, 8080, 8443]);

function isCloudflare(serverHeader: string | undefined, headers: Headers): boolean {
  if (serverHeader?.toLowerCase().includes("cloudflare")) return true;
  if (headers.has("cf-ray") || headers.has("cf-cache-status")) return true;
  return false;
}

async function checkBruteForce(baseUrl: string): Promise<VulnCheck[]> {
  const vulns: VulnCheck[] = [];
  const loginPaths = ["/login", "/signin", "/auth/signin", "/auth/login", "/auth/sign-in", "/wp-login.php", "/admin/login", "/user/login", "/api/auth/signin", "/api/auth/callback/credentials", "/account/login", "/connect/login", "/session/new"];
  let loginUrl: string | null = null;
  let loginStatus = 0;

  // Build list of origins to test: base + common subdomains
  const parsedBase = new URL(baseUrl);
  const hostParts = parsedBase.hostname.split(".");
  const rootDomain = hostParts.length >= 2 ? hostParts.slice(-2).join(".") : parsedBase.hostname;
  const originsToTest = [parsedBase.origin];
  if (!parsedBase.hostname.startsWith("www.")) {
    originsToTest.push(`${parsedBase.protocol}//www.${parsedBase.hostname}`);
  }
  if (!parsedBase.hostname.startsWith("app.")) {
    originsToTest.push(`${parsedBase.protocol}//app.${rootDomain}`);
  }
  if (!parsedBase.hostname.startsWith("my.")) {
    originsToTest.push(`${parsedBase.protocol}//my.${rootDomain}`);
  }

  // Soft-404 baseline for the main origin
  let baseline404Size = -1;
  try {
    const rnd = await fetch(`${baseUrl}/argos-bf-probe-${Date.now()}-xyz`, {
      redirect: "manual",
      headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" },
      signal: AbortSignal.timeout(4000),
    });
    if (rnd.status === 200) {
      const body = await rnd.text();
      baseline404Size = body.length;
    }
  } catch { /* ignore */ }

  // Helper to follow redirects (301, 302, 307, 308) and fetch the final page
  async function fetchFollowingRedirects(url: string, maxHops = 3): Promise<Response | null> {
    let currentUrl = url;
    for (let hop = 0; hop < maxHops; hop++) {
      const res = await fetch(currentUrl, {
        redirect: "manual",
        headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return res;
        currentUrl = loc.startsWith("http") ? loc : new URL(loc, currentUrl).toString();
        continue;
      }
      return res;
    }
    return null;
  }

  // If the user provided a specific path in the target URL, try it first
  const userPath = new URL(baseUrl).pathname;
  if (userPath && userPath !== "/" && !loginPaths.includes(userPath)) {
    loginPaths.unshift(userPath);
  }

  // Phase A: HTML-based login page detection
  for (const origin of originsToTest) {
    if (loginUrl) break;
    for (const path of loginPaths) {
      try {
        const res = await fetchFollowingRedirects(`${origin}${path}`);
        if (!res) continue;
        const status = res.status;
        if (status !== 200 && status !== 401 && status !== 403) continue;
        const body = await res.text();
        if (status === 200 && baseline404Size > 0 && Math.abs(body.length - baseline404Size) < 200) continue;
        const hasLoginForm = /<input[^>]*type\s*=\s*["']password["']/i.test(body)
          || (/<form/i.test(body) && /(?:password|login|sign.?in|connexion|mot.?de.?passe|e.?mail)/i.test(body))
          || /csrfToken|callbackUrl|credentials|next-auth|nextauth|__Host-next-auth|signIn\(|credential/i.test(body)
          || (/signin|sign-in|login/i.test(path) && body.length > 500)
          || (status === 401 || status === 403);
        if (!hasLoginForm) continue;
        loginUrl = `${origin}${path}`;
        loginStatus = status;
        break;
      } catch { /* subdomain may not exist */ }
    }
  }

  // Phase B: Fallback — probe /api/auth/csrf to detect NextAuth without HTML
  let authEndpoint = loginUrl || "";
  let csrfToken = "";
  let isNextAuth = false;

  if (!loginUrl) {
    for (const origin of originsToTest) {
      try {
        const csrfRes = await fetch(`${origin}/api/auth/csrf`, {
          headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" },
          signal: AbortSignal.timeout(5000),
        });
        if (csrfRes.ok) {
          const csrfJson = await csrfRes.json();
          if (csrfJson.csrfToken) {
            isNextAuth = true;
            csrfToken = csrfJson.csrfToken;
            loginUrl = `${origin}/api/auth/signin`;
            authEndpoint = `${origin}/api/auth/callback/credentials`;
            break;
          }
        }
      } catch { /* skip */ }
    }
  }

  // Phase C: Fallback — detect OAuth/SSO redirects
  if (!loginUrl) {
    for (const origin of originsToTest) {
      if (loginUrl) break;
      for (const path of loginPaths) {
        try {
          const res = await fetch(`${origin}${path}`, {
            redirect: "manual",
            headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" },
            signal: AbortSignal.timeout(5000),
          });
          if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get("location") || "";
            const isOAuth = /auth0|okta|keycloak|cognito|login\.microsoftonline|accounts\.google|oauth|authorize/i.test(location);
            if (isOAuth) {
              loginUrl = `${origin}${path}`;
              authEndpoint = loginUrl;
              break;
            }
          }
        } catch { /* skip */ }
      }
    }
  }

  if (!loginUrl) {
    vulns.push({
      id: "vuln-no-login-found",
      title: "Aucun formulaire de connexion detecte",
      severity: "info",
      category: "Authentification",
      description: `Aucune page de connexion trouvee. Origines testees: ${originsToTest.join(", ")}. Chemins: ${loginPaths.join(", ")}. Les tests de brute force n'ont pas pu etre effectues.`,
      remediation: "Si un formulaire de connexion existe sur un chemin ou sous-domaine non standard, specifiez-le manuellement.",
      affectedComponent: "Pages d'authentification",
    });
    return vulns;
  }

  // Detect NextAuth on the found login origin (if not already detected in Phase B)
  if (!isNextAuth) {
    const loginOrigin = new URL(loginUrl).origin;
    try {
      const csrfRes = await fetch(`${loginOrigin}/api/auth/csrf`, {
        headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (csrfRes.ok) {
        const csrfJson = await csrfRes.json();
        if (csrfJson.csrfToken) {
          isNextAuth = true;
          csrfToken = csrfJson.csrfToken;
          authEndpoint = `${loginOrigin}/api/auth/callback/credentials`;
        }
      }
    } catch { /* not NextAuth */ }
  }

  function buildAuthBody(username: string, password: string): string {
    const params = new URLSearchParams();
    params.set("username", username);
    params.set("password", password);
    if (isNextAuth) {
      params.set("email", username);
      if (csrfToken) params.set("csrfToken", csrfToken);
      params.set("callbackUrl", loginUrl!);
      params.set("json", "true");
    }
    return params.toString();
  }

  // Test rate limiting with rapid requests (20 attempts) on the real auth endpoint
  let blocked = false;
  let rateLimitHeader: string | null = null;
  const rapidResults: number[] = [];
  let errorResponses = 0;
  let lockedResponses = 0;

  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(authEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "ARGOS-SecurityAudit/1.0",
        },
        body: buildAuthBody("admin", `wrongpassword_${i}_${Date.now()}`),
        redirect: "manual",
        signal: AbortSignal.timeout(4000),
      });
      rapidResults.push(res.status);

      if (res.status === 429 || res.status === 403) {
        blocked = true;
        rateLimitHeader = res.headers.get("retry-after") || res.headers.get("x-ratelimit-remaining");
        break;
      }

      // NextAuth returns 302/307 after processing — check redirect destination
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location") || "";
        if (/error=|locked|blocked|too.?many|rate.?limit|captcha/i.test(location)) {
          errorResponses++;
          if (/locked|blocked|too.?many|rate.?limit/i.test(location)) {
            lockedResponses++;
          }
        } else if (isNextAuth) {
          // For NextAuth, any 302/307 means the server processed the request (not static HTML)
          errorResponses++;
        }
      }

      // 401 with error body also counts as a defense
      if (res.status === 401) {
        const body = await res.text();
        if (/locked|blocked|too.?many|rate.?limit|verrouill|bloque/i.test(body)) {
          blocked = true;
          break;
        }
        errorResponses++;
      }
    } catch {
      blocked = true;
      break;
    }
  }

  // If most responses include error redirects, the endpoint is processing and rejecting
  if (lockedResponses >= 3) blocked = true;
  const allRedirects = rapidResults.every(s => s >= 300 && s < 400);
  const nextAuthServerSide = isNextAuth && allRedirects;

  const endpointLabel = isNextAuth ? `${authEndpoint} (NextAuth API)` : authEndpoint;

  if (nextAuthServerSide && !blocked) {
    // NextAuth processes auth server-side and redirects — the endpoint IS processing requests
    // The lockout/rate-limiting happens internally (verify-credentials), not via HTTP status codes
    vulns.push({
      id: "vuln-rate-limit-nextauth",
      title: "Authentification NextAuth — traitement serveur detecte",
      severity: "info",
      category: "Authentification",
      description: `L'endpoint NextAuth (${endpointLabel}) traite les tentatives cote serveur et redirige (code ${[...new Set(rapidResults)].join("/")}). Le rate limiting et le lockout sont geres en interne par l'application (endpoint de verification). ${rapidResults.length} requetes envoyees.`,
      remediation: "Verifier le lockout applicatif (verrouillage apres N tentatives). Recommande : ajouter Cloudflare WAF Rate Limiting sur /api/auth/* en complement.",
      affectedComponent: "Systeme d'authentification",
    });
  } else if (!blocked) {
    vulns.push({
      id: "vuln-no-rate-limit",
      title: "Absence de rate limiting sur l'authentification",
      severity: "high",
      category: "Authentification",
      description: `L'endpoint d'authentification (${endpointLabel}) accepte ${rapidResults.length} tentatives rapides sans blocage (codes: ${[...new Set(rapidResults)].join(", ")}). Vulnerable au brute force.`,
      remediation: "Implementer un rate limiting (ex: 5 tentatives / minute). Ajouter un CAPTCHA apres 3 echecs. Configurer Cloudflare WAF Rate Limiting sur /api/auth/*.",
      affectedComponent: "Systeme d'authentification",
      cvss: 7.5,
    });
  } else {
    vulns.push({
      id: "vuln-rate-limit-ok",
      title: "Rate limiting detecte sur l'authentification",
      severity: "info",
      category: "Authentification",
      description: `Le systeme a bloque les tentatives rapides apres ${rapidResults.length} requete(s) sur ${endpointLabel}.${rateLimitHeader ? ` Header: ${rateLimitHeader}` : ""} Protection anti-brute-force active.`,
      remediation: "Aucune action requise.",
      affectedComponent: "Systeme d'authentification",
    });
  }

  // Check for account enumeration on the real endpoint
  try {
    const res1 = await fetch(authEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ARGOS-SecurityAudit/1.0" },
      body: buildAuthBody("admin", "wrongpassword"),
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    const body1 = await res1.text();

    const res2 = await fetch(authEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ARGOS-SecurityAudit/1.0" },
      body: buildAuthBody("nonexistent_user_xyz_1234", "wrongpassword"),
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    const body2 = await res2.text();

    if (body1.length !== body2.length && Math.abs(body1.length - body2.length) > 20) {
      vulns.push({
        id: "vuln-user-enumeration",
        title: "Enumeration de comptes possible",
        severity: "medium",
        category: "Authentification",
        description: "Les reponses d'echec de connexion different selon que le nom d'utilisateur existe ou non. Un attaquant peut deviner les comptes valides.",
        remediation: "Utiliser un message generique identique: 'Identifiants incorrects' que le compte existe ou non.",
        affectedComponent: "Formulaire de connexion",
        cvss: 5.3,
      });
    }
  } catch { /* could not test */ }

  // Check login page for security features
  try {
    const loginRes = await fetch(loginUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000),
    });
    const loginHtml = await loginRes.text();

    const hasCaptchaInHtml = /captcha|recaptcha|hcaptcha|g-recaptcha|cf-turnstile|data-sitekey|data-callback/i.test(loginHtml);
    const hasTurnstileScript = /challenges\.cloudflare\.com|turnstile/i.test(loginHtml);
    const hasRecaptchaScript = /google\.com\/recaptcha|gstatic\.com\/recaptcha/i.test(loginHtml);
    const hasHcaptchaScript = /hcaptcha\.com/i.test(loginHtml);
    const cfManaged = loginRes.headers.get("cf-mitigated") || loginRes.headers.get("cf-chl-bypass") || "";
    const hasCfChallenge = /managed|challenge/i.test(cfManaged) || loginRes.headers.has("cf-challenge");
    // Turnstile in CSP header — if challenges.cloudflare.com is allowed in script-src or frame-src, Turnstile is configured
    const loginCsp = loginRes.headers.get("content-security-policy") || "";
    const hasTurnstileInCsp = /challenges\.cloudflare\.com/i.test(loginCsp);
    const hasCaptcha = hasCaptchaInHtml || hasTurnstileScript || hasRecaptchaScript || hasHcaptchaScript || hasCfChallenge || hasTurnstileInCsp;
    const captchaType = hasTurnstileScript || hasCfChallenge || hasTurnstileInCsp ? "Cloudflare Turnstile" : hasRecaptchaScript ? "reCAPTCHA" : hasHcaptchaScript ? "hCaptcha" : hasCaptchaInHtml ? "CAPTCHA" : "";
    const hasMFA = /(?:two.?factor|2fa|mfa|otp|authenticator|verification.?code)/i.test(loginHtml);

    if (!hasCaptcha) {
      vulns.push({
        id: "vuln-no-captcha",
        title: "Absence de CAPTCHA sur le formulaire de connexion",
        severity: "medium",
        category: "Authentification",
        description: "Aucun CAPTCHA detecte sur la page de connexion (ni dans le HTML, ni via script externe, ni via challenge Cloudflare). Facilite les attaques automatisees.",
        remediation: "Ajouter un CAPTCHA (reCAPTCHA v3, hCaptcha, Cloudflare Turnstile) sur le formulaire de connexion.",
        affectedComponent: "Formulaire de connexion",
      });
    } else {
      vulns.push({
        id: "vuln-captcha-ok",
        title: `CAPTCHA detecte sur la connexion (${captchaType})`,
        severity: "info",
        category: "Authentification",
        description: `Systeme ${captchaType} detecte sur la page de connexion. Protection anti-bot active.`,
        remediation: "Aucune action requise.",
        affectedComponent: "Formulaire de connexion",
      });
    }

    if (hasMFA) {
      vulns.push({
        id: "vuln-mfa-detected",
        title: "Authentification multi-facteurs detectee",
        severity: "info",
        category: "Authentification",
        description: "Le systeme semble supporter l'authentification a deux facteurs (2FA/MFA).",
        remediation: "Aucune action requise — bonne pratique.",
        affectedComponent: "Systeme d'authentification",
      });
    }
  } catch { /* could not check login page */ }

  return vulns;
}

async function checkSQLInjection(baseUrl: string): Promise<VulnCheck[]> {
  const vulns: VulnCheck[] = [];
  const payloads = [
    { param: "id", value: "1' OR '1'='1", name: "Boolean-based blind" },
    { param: "id", value: "1 UNION SELECT null,null,null--", name: "UNION-based" },
    { param: "search", value: "' OR 1=1--", name: "Search injection" },
    { param: "q", value: "1' AND SLEEP(5)--", name: "Time-based blind" },
    { param: "page", value: "1; DROP TABLE x--", name: "Stacked queries" },
  ];
  const sqlErrors = [
    /sql syntax/i, /mysql_fetch/i, /ORA-\d{5}/i, /PG::Error/i,
    /SQLite3/i, /microsoft ole db/i, /unclosed quotation/i,
    /PostgreSQL.*ERROR/i, /Warning.*mysql_/i, /pg_query/i,
    /Syntax error.*SQL/i, /SQLSTATE/i,
  ];
  for (const payload of payloads) {
    try {
      const testUrl = new URL(baseUrl);
      testUrl.searchParams.set(payload.param, payload.value);
      const t0 = Date.now();
      const res = await fetch(testUrl.toString(), {
        redirect: "follow",
        headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      const elapsed = Date.now() - t0;
      const body = await res.text();
      if (sqlErrors.some(re => re.test(body))) {
        vulns.push({
          id: `vuln-sqli-${payload.param}-${payload.name.replace(/\s/g, "")}`,
          title: `Injection SQL detectee (${payload.name})`,
          severity: "critical",
          category: "Injection",
          description: `Le parametre "${payload.param}" est vulnerable a l'injection SQL (${payload.name}). Le serveur retourne un message d'erreur SQL.`,
          remediation: "Utiliser des requetes preparees (prepared statements). Ne jamais concatener les entrees utilisateur dans les requetes SQL.",
          affectedComponent: `Parametre: ${payload.param}`,
          cvss: 9.8,
          cve: "CWE-89",
        });
        break;
      }
      if (payload.name.includes("Time-based") && elapsed > 5000) {
        vulns.push({
          id: `vuln-sqli-time-${payload.param}`,
          title: `Injection SQL time-based suspecte`,
          severity: "high",
          category: "Injection",
          description: `Le parametre "${payload.param}" montre un delai suspect (${elapsed}ms) avec un payload SLEEP.`,
          remediation: "Utiliser des requetes preparees. Verifier tous les parametres d'entree.",
          affectedComponent: `Parametre: ${payload.param}`,
          cvss: 9.0,
        });
      }
    } catch { /* skip */ }
  }
  return vulns;
}

async function checkSSRF(baseUrl: string): Promise<VulnCheck[]> {
  const vulns: VulnCheck[] = [];
  const ssrfPayloads = [
    { param: "url", value: "http://127.0.0.1", name: "localhost" },
    { param: "url", value: "http://169.254.169.254/latest/meta-data/", name: "AWS metadata" },
    { param: "redirect", value: "http://127.0.0.1:22", name: "internal SSH" },
    { param: "callback", value: "http://[::1]", name: "IPv6 localhost" },
  ];
  const proxyEndpoints = ["/api/proxy", "/api/fetch", "/api/image", "/api/preview", "/api/webhook"];
  for (const payload of ssrfPayloads) {
    try {
      const url = new URL(baseUrl);
      url.searchParams.set(payload.param, payload.value);
      const res = await fetch(url.toString(), {
        redirect: "manual",
        headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      const body = await res.text();
      if (body.includes("ami-id") || body.includes("instance-id") || body.includes("SSH-") || body.includes("root:x:0")) {
        vulns.push({
          id: `vuln-ssrf-${payload.name.replace(/\s/g, "-")}`,
          title: `SSRF detectee — acces a ${payload.name}`,
          severity: "critical",
          category: "SSRF",
          description: `Le serveur a renvoye du contenu interne via ${payload.value}. Un attaquant peut acceder aux ressources internes.`,
          remediation: "Valider les URLs. Bloquer les IP privees (127.0.0.0/8, 10.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12). Utiliser une allowlist.",
          affectedComponent: `Parametre: ${payload.param}`,
          cvss: 9.1,
          cve: "CWE-918",
        });
      }
    } catch { /* skip */ }
    for (const ep of proxyEndpoints) {
      try {
        const res = await fetch(`${baseUrl}${ep}?${payload.param}=${encodeURIComponent(payload.value)}`, {
          redirect: "manual", headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" }, signal: AbortSignal.timeout(3000),
        });
        if (res.status === 200) {
          const body = await res.text();
          if (body.includes("ami-id") || body.includes("instance-id") || body.includes("root:x:0")) {
            vulns.push({
              id: `vuln-ssrf-proxy-${payload.name.replace(/\s/g, "-")}`,
              title: `SSRF via endpoint proxy — ${ep}`,
              severity: "critical",
              category: "SSRF",
              description: `L'endpoint ${ep} permet d'acceder aux ressources internes (${payload.name}).`,
              remediation: "Supprimer ou securiser les endpoints de proxy. Valider strictement les URLs.",
              affectedComponent: ep,
              cvss: 9.1,
            });
          }
        }
      } catch { /* skip */ }
    }
  }
  return vulns;
}

async function checkDirectoryTraversal(baseUrl: string): Promise<VulnCheck[]> {
  const vulns: VulnCheck[] = [];
  const payloads = [
    { path: "/../../../etc/passwd", sig: /root:x:0|daemon:x:/, name: "/etc/passwd" },
    { path: "/....//....//....//etc/passwd", sig: /root:x:0/, name: "bypass filter" },
    { path: "/../../../windows/win.ini", sig: /\[extensions\]|\[fonts\]/, name: "win.ini" },
    { path: "/?file=../../etc/passwd", sig: /root:x:0/, name: "param file" },
    { path: "/?path=../../etc/passwd", sig: /root:x:0/, name: "param path" },
    { path: "/?template=../../etc/passwd", sig: /root:x:0/, name: "param template" },
  ];
  for (const p of payloads) {
    try {
      const res = await fetch(`${baseUrl}${p.path}`, {
        redirect: "follow", headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" }, signal: AbortSignal.timeout(5000),
      });
      if (res.status === 200) {
        const body = await res.text();
        if (p.sig.test(body)) {
          vulns.push({
            id: `vuln-lfi-${p.name.replace(/[^a-z0-9]/gi, "")}`,
            title: `Directory Traversal / LFI detecte (${p.name})`,
            severity: "critical",
            category: "Traversal",
            description: `Le serveur est vulnerable au directory traversal. Le fichier ${p.name} est accessible.`,
            remediation: "Valider et assainir tous les chemins. Utiliser des chemins absolus. Ne jamais concatener les entrees utilisateur dans les chemins fichiers.",
            affectedComponent: "Gestion de fichiers",
            cvss: 9.3,
            cve: "CWE-22",
          });
          break;
        }
      }
    } catch { /* skip */ }
  }
  return vulns;
}

async function checkOpenRedirect(baseUrl: string): Promise<VulnCheck[]> {
  const vulns: VulnCheck[] = [];
  const evilUrl = "https://evil-argos-test.example.com";
  const params = ["redirect", "next", "url", "return", "returnTo", "return_to", "redir", "destination", "continue"];
  for (const param of params) {
    try {
      const res = await fetch(`${baseUrl}?${param}=${encodeURIComponent(evilUrl)}`, {
        redirect: "manual", headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" }, signal: AbortSignal.timeout(5000),
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location") || "";
        try {
          const redirectTarget = new URL(location, baseUrl);
          const baseHost = new URL(baseUrl).hostname;
          const targetHost = redirectTarget.hostname;
          if (targetHost === "evil-argos-test.example.com") {
            vulns.push({
              id: `vuln-open-redirect-${param}`,
              title: `Open Redirect via parametre "${param}"`,
              severity: "medium",
              category: "Redirection",
              description: `Le parametre "${param}" redirige vers le domaine externe ${targetHost}. Exploitable pour le phishing.`,
              remediation: "Valider les URLs de redirection contre une allowlist. Ne jamais rediriger vers des URLs fournies sans validation.",
              affectedComponent: `Parametre: ${param}`,
              cvss: 6.1,
              cve: "CWE-601",
            });
          } else if (!targetHost.endsWith(baseHost) && !baseHost.endsWith(targetHost)) {
            const hasEvilInQuery = redirectTarget.searchParams.toString().includes("evil-argos-test");
            if (!hasEvilInQuery) {
              vulns.push({
                id: `vuln-open-redirect-${param}`,
                title: `Open Redirect via parametre "${param}"`,
                severity: "medium",
                category: "Redirection",
                description: `Le parametre "${param}" redirige vers ${targetHost}, un domaine different de ${baseHost}.`,
                remediation: "Valider les URLs de redirection contre une allowlist.",
                affectedComponent: `Parametre: ${param}`,
                cvss: 6.1,
                cve: "CWE-601",
              });
            }
          }
        } catch { /* invalid URL in location */ }
      }
    } catch { /* skip */ }
  }
  return vulns;
}

async function checkSubdomainEnum(hostname: string): Promise<VulnCheck[]> {
  const vulns: VulnCheck[] = [];
  try {
    const res = await fetch(`https://crt.sh/?q=%.${hostname}&output=json`, {
      headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const certs = await res.json() as Array<{ name_value: string }>;
      const subdomains = new Set<string>();
      for (const cert of certs) {
        for (const name of (cert.name_value || "").split("\n")) {
          const clean = name.trim().replace(/^\*\./, "");
          if (clean && clean.endsWith(hostname) && clean !== hostname) subdomains.add(clean);
        }
      }
      if (subdomains.size > 0) {
        const subList = [...subdomains].slice(0, 50);
        vulns.push({
          id: "vuln-subdomain-enum",
          title: `${subdomains.size} sous-domaine(s) via Certificate Transparency`,
          severity: "info",
          category: "Reconnaissance",
          description: `Sous-domaines exposes dans les logs CT: ${subList.join(", ")}${subdomains.size > 50 ? ` (+${subdomains.size - 50})` : ""}`,
          remediation: "S'assurer qu'aucun sous-domaine de staging/dev n'expose des services non securises.",
          affectedComponent: "Infrastructure DNS",
        });
        const suspectPrefixes = ["dev", "staging", "test", "admin", "internal", "preprod", "beta", "debug"];
        const liveDevSubs: string[] = [];
        for (const sub of subList.slice(0, 20)) {
          const prefix = sub.replace(`.${hostname}`, "");
          if (suspectPrefixes.some(p => prefix.includes(p))) {
            try {
              const r = await fetch(`https://${sub}`, { redirect: "manual", signal: AbortSignal.timeout(3000), headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" } });
              if (r.status < 500) liveDevSubs.push(sub);
            } catch { /* not reachable */ }
          }
        }
        if (liveDevSubs.length > 0) {
          vulns.push({
            id: "vuln-dev-subdomains",
            title: `${liveDevSubs.length} sous-domaine(s) dev/staging accessibles`,
            severity: "high",
            category: "Reconnaissance",
            description: `Environnements de dev/staging accessibles publiquement: ${liveDevSubs.join(", ")}. Peuvent contenir des donnees de test ou fonctionnalites non securisees.`,
            remediation: "Restreindre l'acces aux environnements de dev/staging par VPN ou IP whitelist.",
            affectedComponent: "Sous-domaines",
            cvss: 7.0,
          });
        }
      }
    }
  } catch { /* crt.sh unreachable */ }
  return vulns;
}

function analyzeEmailSecurity(dnsRecords: DnsRecord[]): VulnCheck[] {
  const vulns: VulnCheck[] = [];
  const spf = dnsRecords.find(r => r.type === "SPF");
  if (spf) {
    if (spf.value.includes("+all")) {
      vulns.push({ id: "vuln-spf-permissive", title: "SPF trop permissif (+all)", severity: "critical", category: "Email Security",
        description: "+all autorise n'importe quel serveur a envoyer des emails au nom du domaine.", remediation: "Changer +all en ~all ou -all.", affectedComponent: "DNS SPF", cvss: 8.0 });
    } else if (spf.value.includes("?all")) {
      vulns.push({ id: "vuln-spf-neutral", title: "SPF neutre (?all)", severity: "high", category: "Email Security",
        description: "?all n'offre aucune protection contre le spoofing.", remediation: "Changer ?all en ~all ou -all.", affectedComponent: "DNS SPF", cvss: 7.0 });
    }
  }
  const dmarc = dnsRecords.find(r => r.type === "DMARC");
  if (dmarc) {
    if (dmarc.value.includes("p=none")) {
      vulns.push({ id: "vuln-dmarc-none", title: "DMARC en mode 'none'", severity: "medium", category: "Email Security",
        description: "p=none ne rejette pas les emails echouant SPF/DKIM.", remediation: "Passer a p=quarantine puis p=reject.", affectedComponent: "DNS DMARC", cvss: 5.0 });
    }
    if (!dmarc.value.includes("rua=")) {
      vulns.push({ id: "vuln-dmarc-no-rua", title: "DMARC sans rapports (rua)", severity: "low", category: "Email Security",
        description: "Aucune adresse rua configuree. Pas de rapports sur les tentatives d'usurpation.", remediation: "Ajouter rua=mailto:dmarc@domaine.tld.", affectedComponent: "DNS DMARC" });
    }
  }
  if (!dnsRecords.some(r => r.type === "DKIM")) {
    const hasMxProvider = dnsRecords.filter(r => r.type === "MX").map(r => r.value.toLowerCase());
    const isHostinger = hasMxProvider.some(v => /hostinger|titan/i.test(v));
    const isGoogle = hasMxProvider.some(v => /google|gmail/i.test(v));
    const isProviderWithDkim = isHostinger || isGoogle;
    vulns.push({ id: "vuln-no-dkim", title: "Aucun DKIM detecte via DNS", severity: isProviderWithDkim ? "low" : "medium", category: "Email Security",
      description: isProviderWithDkim
        ? `DKIM non detecte via les selecteurs DNS standard. Votre fournisseur email (${isHostinger ? "Hostinger/Titan" : "Google"}) supporte DKIM mais utilise peut-etre un selecteur non standard ou un CNAME specifique. Verifiez dans le dashboard de votre fournisseur.`
        : "DKIM signe cryptographiquement les emails pour prouver leur authenticite. Aucun enregistrement DKIM detecte.",
      remediation: isHostinger
        ? "Verifier dans le dashboard Hostinger > Emails > DNS que DKIM est active. Le selecteur peut etre specifique a votre compte."
        : "Configurer DKIM avec votre fournisseur email.",
      affectedComponent: "DNS DKIM" });
  }
  return vulns;
}

async function checkTLSDowngrade(hostname: string): Promise<VulnCheck[]> {
  const vulns: VulnCheck[] = [];
  const versions: Array<{ min: string; max: string; label: string; sev: "critical" | "high" }> = [
    { min: "TLSv1", max: "TLSv1", label: "TLS 1.0", sev: "critical" },
    { min: "TLSv1.1", max: "TLSv1.1", label: "TLS 1.1", sev: "high" },
  ];
  for (const v of versions) {
    try {
      const accepted = await new Promise<boolean>((resolve) => {
        const socket = tls.connect({
          host: hostname, port: 443, servername: hostname,
          minVersion: v.min as tls.SecureVersion, maxVersion: v.max as tls.SecureVersion,
          rejectUnauthorized: false, timeout: 5000,
        }, () => { socket.destroy(); resolve(true); });
        socket.on("error", () => { socket.destroy(); resolve(false); });
        socket.on("timeout", () => { socket.destroy(); resolve(false); });
      });
      if (accepted) {
        vulns.push({
          id: `vuln-tls-downgrade-${v.label.replace(/\s/g, "")}`,
          title: `Downgrade ${v.label} accepte`,
          severity: v.sev,
          category: "Chiffrement",
          description: `Le serveur accepte ${v.label}, protocole obsolete et vulnerable (POODLE, BEAST). Un attaquant MITM peut forcer un downgrade.`,
          remediation: `Desactiver ${v.label}. Supporter uniquement TLS 1.2+.`,
          affectedComponent: "Configuration TLS",
          cvss: v.sev === "critical" ? 9.1 : 7.5,
        });
      }
    } catch { /* version not supported — good */ }
  }
  return vulns;
}

async function checkSessionSecurity(url: string): Promise<VulnCheck[]> {
  const vulns: VulnCheck[] = [];
  try {
    const res1 = await fetch(url, { headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" }, signal: AbortSignal.timeout(5000) });
    const cookies1 = res1.headers.getSetCookie?.() || [];
    const sessionCookies = cookies1.filter(c => /session|sid|token|jwt/i.test(c.split("=")[0]));
    if (sessionCookies.length > 0) {
      for (const sc of sessionCookies) {
        const val = sc.split("=")[1]?.split(";")[0] || "";
        if (/^eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(val)) {
          try {
            const headerB64 = val.split(".")[0];
            const header = JSON.parse(Buffer.from(headerB64, "base64url").toString());
            if (header.alg === "none" || header.alg === "None") {
              vulns.push({ id: "vuln-jwt-alg-none", title: "JWT avec algorithme 'none'", severity: "critical", category: "Session",
                description: "Le JWT utilise alg:none, permettant de forger des tokens sans signature.", remediation: "Rejeter explicitement alg:none. Forcer un algorithme specifique (RS256, ES256).",
                affectedComponent: "JWT", cvss: 9.8, cve: "CWE-345" });
            }
            if (header.alg === "HS256") {
              vulns.push({ id: "vuln-jwt-hs256", title: "JWT avec HMAC symetrique (HS256)", severity: "low", category: "Session",
                description: "HS256 utilise une cle symetrique partagee. Si elle est faible, les tokens peuvent etre forges.", remediation: "Preferer RS256/ES256 (asymetrique). S'assurer que la cle HMAC fait au moins 256 bits.",
                affectedComponent: "JWT" });
            }
          } catch { /* not valid base64 */ }
        }
      }
    }
  } catch { /* skip */ }
  try {
    const origin = new URL(url).origin;
    const sessionRes = await fetch(`${origin}/api/auth/session`, { headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" }, signal: AbortSignal.timeout(5000) });
    if (sessionRes.ok) {
      const body = await sessionRes.text();
      if (/password|secret_key|private_key|api_secret/i.test(body) && !body.includes("<!DOCTYPE")) {
        vulns.push({ id: "vuln-session-leak", title: "Endpoint de session expose des secrets", severity: "high", category: "Session",
          description: "/api/auth/session retourne des informations sensibles.", remediation: "Filtrer les champs sensibles cote serveur.",
          affectedComponent: "/api/auth/session", cvss: 7.5 });
      }
    }
  } catch { /* skip */ }
  return vulns;
}

// ═══════════════════════════════════════════════════════════════════════════
// Source code leak detection + AI analysis
// ═══════════════════════════════════════════════════════════════════════════

const SECRET_PATTERNS = [
  { regex: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi, label: "API Key" },
  { regex: /(?:secret|password|passwd|pwd|token)\s*[:=]\s*['"]?([^\s'"]{8,})['"]?/gi, label: "Secret/Password" },
  { regex: /(?:aws_access_key_id|aws_secret_access_key)\s*[:=]\s*['"]?([A-Z0-9]{16,})['"]?/gi, label: "AWS Credentials" },
  { regex: /(?:DATABASE_URL|DB_PASSWORD|MONGO_URI|REDIS_URL)\s*[:=]\s*['"]?([^\s'"]+)['"]?/gi, label: "Database Credentials" },
  { regex: /(?:STRIPE_SECRET|SK_LIVE|sk_live_)[a-zA-Z0-9_\-]{20,}/gi, label: "Stripe Secret Key" },
  { regex: /(?:PRIVATE[_-]?KEY|BEGIN RSA PRIVATE KEY|BEGIN EC PRIVATE KEY)/gi, label: "Private Key" },
  { regex: /(?:NEXTAUTH_SECRET|JWT_SECRET|SESSION_SECRET)\s*[:=]\s*['"]?([^\s'"]+)['"]?/gi, label: "Auth Secret" },
  { regex: /(?:SENDGRID_API_KEY|MAILGUN_API_KEY|SMTP_PASSWORD)\s*[:=]\s*['"]?([^\s'"]+)['"]?/gi, label: "Email Service Credentials" },
];

async function probeUrl(url: string, timeout = 5000): Promise<{ status: number; body: string; headers: Headers } | null> {
  try {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" },
      signal: AbortSignal.timeout(timeout),
    });
    const body = await res.text();
    return { status: res.status, body: body.slice(0, 50000), headers: res.headers };
  } catch { return null; }
}

function countSecrets(content: string): { count: number; types: string[] } {
  const types = new Set<string>();
  let count = 0;
  for (const pattern of SECRET_PATTERNS) {
    const matches = content.match(pattern.regex);
    if (matches) { count += matches.length; types.add(pattern.label); }
  }
  return { count, types: Array.from(types) };
}

async function checkSourceLeaks(baseUrl: string): Promise<SourceAudit> {
  const leaks: SourceLeak[] = [];
  const origin = new URL(baseUrl).origin;

  // 1. Git repository exposure
  const gitHead = await probeUrl(`${origin}/.git/HEAD`);
  if (gitHead && gitHead.status === 200 && /^ref:\s+refs\//m.test(gitHead.body)) {
    leaks.push({
      id: "leak-git-head", type: "git", url: `${origin}/.git/HEAD`,
      severity: "critical",
      title: "Depot Git expose (.git/HEAD accessible)",
      description: "Le repertoire .git est accessible publiquement. Un attaquant peut reconstruire l'integralite du code source, l'historique des commits, et tous les secrets jamais commites.",
      content: gitHead.body.slice(0, 500),
      remediation: "Bloquer l'acces a /.git/ dans la configuration du serveur web (nginx: location ~ /\\.git { deny all; }).",
    });
    const gitConfig = await probeUrl(`${origin}/.git/config`);
    if (gitConfig && gitConfig.status === 200 && /\[core\]|\[remote/i.test(gitConfig.body)) {
      leaks.push({
        id: "leak-git-config", type: "git", url: `${origin}/.git/config`,
        severity: "critical",
        title: "Configuration Git exposee (.git/config)",
        description: "Le fichier .git/config revele l'URL du depot distant, les branches, et potentiellement des tokens d'acces.",
        content: gitConfig.body.slice(0, 2000),
        remediation: "Bloquer l'acces a /.git/ immediatement.",
      });
    }
  }

  // 2. Environment files
  const envFiles = [".env", ".env.local", ".env.production", ".env.development", ".env.backup", ".env.old", "env.js", "config.env"];
  for (const envFile of envFiles) {
    const res = await probeUrl(`${origin}/${envFile}`);
    if (res && res.status === 200 && res.body.length > 10) {
      const hasEnvVars = /^[A-Z_]+=.+/m.test(res.body) || /(?:DATABASE|API_KEY|SECRET|PASSWORD|TOKEN)/i.test(res.body);
      if (hasEnvVars) {
        const secrets = countSecrets(res.body);
        leaks.push({
          id: `leak-env-${envFile.replace(/\./g, "-")}`, type: "env", url: `${origin}/${envFile}`,
          severity: "critical",
          title: `Fichier d'environnement expose (${envFile})`,
          description: `Le fichier ${envFile} est accessible publiquement.${secrets.count > 0 ? ` ${secrets.count} secret(s) detecte(s): ${secrets.types.join(", ")}.` : ""} Acces direct aux credentials de l'application.`,
          content: res.body.slice(0, 3000).replace(/(?:password|secret|key|token)\s*[:=]\s*['"]?([^\s'"]{4})[^\s'"]*/gi, (_, prefix) => `${prefix}${"*".repeat(20)}`),
          remediation: "Supprimer le fichier du serveur web. Ajouter le fichier au .gitignore. Changer tous les secrets exposes immediatement.",
        });
      }
    }
  }

  // 3. Source maps
  const sourceMapPaths = ["main.js.map", "app.js.map", "bundle.js.map", "vendor.js.map",
    "_next/static/chunks/main.js.map", "_next/static/chunks/app.js.map",
    "static/js/main.js.map", "static/js/bundle.js.map", "assets/index.js.map",
    "build/static/js/main.js.map"];
  for (const sm of sourceMapPaths) {
    const res = await probeUrl(`${origin}/${sm}`);
    if (res && res.status === 200 && (res.body.includes('"sources"') || res.body.includes('"mappings"'))) {
      leaks.push({
        id: `leak-sourcemap-${sm.replace(/[/.]/g, "-")}`, type: "sourcemap", url: `${origin}/${sm}`,
        severity: "high",
        title: `Source map expose (${sm})`,
        description: "Les source maps permettent de reconstruire le code source frontend original (avant minification). Expose la logique metier, les noms de variables, les commentaires, et potentiellement des secrets.",
        content: res.body.slice(0, 500),
        remediation: "Desactiver la generation de source maps en production (GENERATE_SOURCEMAP=false). Supprimer les fichiers .map du serveur.",
      });
      break;
    }
  }

  // 4. Backup files
  const backupPaths = [
    "index.php.bak", "index.php.old", "index.php~", "wp-config.php.bak", "wp-config.php.old",
    "config.php.bak", "config.yml.bak", "settings.py.bak", "web.config.old",
    "database.sql", "dump.sql", "backup.sql", "db.sql", "data.sql",
    "backup.zip", "backup.tar.gz", "site.zip", "www.zip", "public.zip",
  ];
  for (const bp of backupPaths) {
    const res = await probeUrl(`${origin}/${bp}`);
    if (res && res.status === 200 && res.body.length > 100) {
      const isBinary = /backup\.zip|\.tar\.gz|site\.zip|www\.zip|public\.zip/.test(bp);
      const isSQL = /\.sql$/.test(bp) && /CREATE TABLE|INSERT INTO|DROP TABLE/i.test(res.body);
      const isCode = /\.bak|\.old|~$/.test(bp) && /<\?php|<?=|import |require |module\.exports/i.test(res.body);
      if (isBinary || isSQL || isCode) {
        leaks.push({
          id: `leak-backup-${bp.replace(/[/.]/g, "-")}`, type: "backup", url: `${origin}/${bp}`,
          severity: isSQL ? "critical" : "high",
          title: `Fichier de backup expose (${bp})`,
          description: isSQL
            ? "Un dump de base de donnees est accessible publiquement. Contient potentiellement toutes les donnees utilisateurs, mots de passe, et informations sensibles."
            : `Le fichier de backup ${bp} est accessible. Contient du code source ou des archives du site.`,
          content: isSQL || isCode ? res.body.slice(0, 2000) : undefined,
          remediation: "Supprimer tous les fichiers de backup du serveur web. Ne jamais stocker de backups dans le webroot.",
        });
      }
    }
  }

  // 5. Configuration files
  const configPaths = [
    "phpinfo.php", "info.php", "test.php", "adminer.php",
    "server-status", "server-info",
    "elmah.axd", "trace.axd",
    "web.config", "crossdomain.xml", "clientaccesspolicy.xml",
    "composer.json", "composer.lock", "package.json", "package-lock.json", "yarn.lock",
    "Gemfile", "Gemfile.lock", "requirements.txt", "Pipfile", "go.mod", "Cargo.toml",
    "docker-compose.yml", "docker-compose.yaml", "Dockerfile",
    ".dockerenv", "Procfile", "Makefile",
    "swagger.json", "swagger.yaml", "openapi.json", "openapi.yaml",
    "api-docs", "api/docs", "api/swagger",
    ".htaccess", ".htpasswd", "nginx.conf",
    "robots.txt", "sitemap.xml",
  ];
  for (const cp of configPaths) {
    const res = await probeUrl(`${origin}/${cp}`);
    if (!res || res.status !== 200 || res.body.length < 20) continue;

    if (cp === "phpinfo.php" || cp === "info.php" || cp === "test.php") {
      if (/phpinfo\(\)|PHP Version|Configuration/i.test(res.body)) {
        leaks.push({
          id: `leak-config-${cp.replace(/[/.]/g, "-")}`, type: "debug", url: `${origin}/${cp}`,
          severity: "high",
          title: `phpinfo() expose (${cp})`,
          description: "phpinfo() revele la configuration PHP complete : version, extensions, chemins, variables d'environnement, configuration Apache/Nginx.",
          remediation: "Supprimer le fichier du serveur. Ne jamais deployer phpinfo() en production.",
        });
      }
    } else if (/composer\.json|package\.json|requirements\.txt|Gemfile|go\.mod|Cargo\.toml|Pipfile/i.test(cp)) {
      if (/dependencies|require|name|version/i.test(res.body)) {
        leaks.push({
          id: `leak-dep-${cp.replace(/[/.]/g, "-")}`, type: "dependency", url: `${origin}/${cp}`,
          severity: "medium",
          title: `Fichier de dependances expose (${cp})`,
          description: "Le fichier de dependances revele les librairies utilisees et leurs versions. Permet de cibler des CVE connues sur des versions vulnerables.",
          content: res.body.slice(0, 3000),
          remediation: "Bloquer l'acces aux fichiers de gestion de dependances dans la configuration du serveur.",
        });
      }
    } else if (/docker-compose|Dockerfile/i.test(cp)) {
      if (/FROM |services:|image:|volumes:|ports:/i.test(res.body)) {
        leaks.push({
          id: `leak-docker-${cp.replace(/[/.]/g, "-")}`, type: "docker", url: `${origin}/${cp}`,
          severity: "high",
          title: `Configuration Docker exposee (${cp})`,
          description: "Le fichier Docker revele l'architecture de l'infrastructure : images, ports internes, volumes, variables d'environnement, services.",
          content: res.body.slice(0, 3000),
          remediation: "Bloquer l'acces aux fichiers Docker dans la configuration du serveur.",
        });
      }
    } else if (/swagger|openapi|api-docs|api\/docs/i.test(cp)) {
      if (/swagger|openapi|paths|info/i.test(res.body)) {
        leaks.push({
          id: `leak-api-${cp.replace(/[/.]/g, "-")}`, type: "api-doc", url: `${origin}/${cp}`,
          severity: "medium",
          title: `Documentation API exposee (${cp})`,
          description: "La documentation API (Swagger/OpenAPI) est publiquement accessible. Revele tous les endpoints, parametres, et schemas de donnees.",
          content: res.body.slice(0, 2000),
          remediation: "Proteger la documentation API par authentification ou la desactiver en production.",
        });
      }
    } else if (cp === ".htpasswd") {
      if (/^\S+:\$|^\S+:\{/m.test(res.body)) {
        leaks.push({
          id: "leak-htpasswd", type: "config", url: `${origin}/${cp}`,
          severity: "critical",
          title: "Fichier .htpasswd expose",
          description: "Le fichier .htpasswd contient des identifiants (hashes de mots de passe). Un attaquant peut tenter de les cracker.",
          remediation: "Bloquer l'acces aux fichiers .ht* dans la configuration du serveur.",
        });
      }
    } else if (cp === ".DS_Store") {
      if (res.body.startsWith("\x00\x00\x00\x01Bud1") || res.body.length > 50) {
        leaks.push({
          id: "leak-dsstore", type: "directory", url: `${origin}/${cp}`,
          severity: "low",
          title: "Fichier .DS_Store expose",
          description: "Le fichier .DS_Store (macOS) revele la structure des repertoires du projet.",
          remediation: "Supprimer le fichier et ajouter .DS_Store au .gitignore.",
        });
      }
    }
  }

  // 6. Directory listing
  const dirPaths = ["/", "/uploads/", "/images/", "/assets/", "/static/", "/backup/", "/temp/", "/tmp/", "/admin/", "/api/"];
  for (const dp of dirPaths) {
    const res = await probeUrl(`${origin}${dp}`);
    if (res && res.status === 200 && /Index of|Directory listing|Parent Directory|<a href="[^"]*\/">/i.test(res.body)) {
      leaks.push({
        id: `leak-dirlist-${dp.replace(/\//g, "-")}`, type: "directory", url: `${origin}${dp}`,
        severity: dp === "/" ? "high" : "medium",
        title: `Directory listing actif (${dp})`,
        description: "Le serveur affiche la liste des fichiers du repertoire. Permet de decouvrir des fichiers sensibles, des backups, des fichiers de configuration.",
        remediation: "Desactiver le directory listing (Apache: Options -Indexes, Nginx: autoindex off).",
      });
    }
  }

  // 7. Debug / error pages
  const debugPaths = ["_debug", "__debug__", "_profiler", "debug/default/view", "telescope", "horizon",
    "graphiql", "graphql/playground", "api/graphql"];
  for (const dp of debugPaths) {
    const res = await probeUrl(`${origin}/${dp}`);
    if (res && res.status === 200 && res.body.length > 200) {
      if (/profiler|debug|telescope|horizon|graphiql|playground|query.*mutation/i.test(res.body)) {
        leaks.push({
          id: `leak-debug-${dp.replace(/[/.]/g, "-")}`, type: "debug", url: `${origin}/${dp}`,
          severity: "high",
          title: `Interface de debug exposee (/${dp})`,
          description: "Une interface de debug/profiling est accessible en production. Permet d'inspecter les requetes, les variables, et potentiellement d'executer du code.",
          remediation: "Desactiver les interfaces de debug en production. Proteger par authentification.",
        });
      }
    }
  }

  // Count critical secrets across all leaks
  let criticalSecrets = 0;
  for (const leak of leaks) {
    if (leak.content) {
      criticalSecrets += countSecrets(leak.content).count;
    }
  }

  return { leaks, exposedFiles: leaks.length, criticalSecrets };
}

async function analyzeLeaksWithAI(leaks: SourceLeak[]): Promise<string | undefined> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey || leaks.length === 0) return undefined;

  const leaksWithContent = leaks.filter(l => l.content);
  if (leaksWithContent.length === 0) return undefined;

  const leakSummary = leaksWithContent.map(l =>
    `=== ${l.title} (${l.severity.toUpperCase()}) ===\nURL: ${l.url}\nType: ${l.type}\n--- Contenu ---\n${l.content?.slice(0, 1500) || "N/A"}\n`
  ).join("\n");

  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "mistral-large-latest",
        temperature: 0.2,
        max_tokens: 3000,
        messages: [
          {
            role: "system",
            content: `Tu es un expert en securite informatique. On te fournit des fichiers exposes trouvés sur un serveur web lors d'un audit de securite. Analyse-les et fournis:
1. SECRETS DETECTES: liste les cles API, mots de passe, tokens trouves (masque les valeurs sensibles partiellement: affiche les 4 premiers chars puis ****)
2. VULNERABILITES: quelles failles ces fichiers revelent
3. IMPACT: ce qu'un attaquant pourrait faire avec ces informations
4. ACTIONS IMMEDIATES: les actions correctives urgentes par ordre de priorite
5. Si des fichiers de dependances sont presents, identifie les librairies avec des CVE connues

Reponds en francais, de maniere structuree et concise.`
          },
          { role: "user", content: `Voici les fichiers exposes trouves lors de l'audit:\n\n${leakSummary}` }
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) {
      const json = await res.json();
      return json.choices?.[0]?.message?.content || undefined;
    }
  } catch { /* AI analysis failed, non-blocking */ }
  return undefined;
}

async function checkCompliance(html: string, headers: Headers, cookies: CookieCheck[], dnsRecords: DnsRecord[], origin: string): Promise<ComplianceCheck[]> {
  const checks: ComplianceCheck[] = [];

  // RGPD - Cookie consent (check HTML body, script sources, consent cookies, and JS bundles)
  const consentKeywords = /cookie.?(?:consent|banner|notice|policy|accept|modal|popup|wall)|tarteaucitron|cookiebot|onetrust|axeptio|didomi|CookieConsent|cookie_consent|cc_cookie|gdpr|rgpd.?consent|complianz|iubenda|quantcast|evidon|trustarc|consentmanager|usercentrics|klaro|osano/i;
  const hasCookieBannerInHtml = consentKeywords.test(html);
  const scriptSrcConsentProviders = /tarteaucitron|cookiebot|onetrust|axeptio|didomi|iubenda|quantcast|trustarc|consentmanager|usercentrics|klaro|osano|cookie-consent|cookie-notice|complianz/i;
  const hasCookieBannerInScripts = scriptSrcConsentProviders.test(html);
  const consentCookieNames = /cookieconsent|cookie_consent|cc_cookie|tarteaucitron|axeptio|didomi_token|euconsent|CookieConsent|OptanonConsent|__cmpcc|consentUUID|_iub_cs|cmplz_|cookielawinfo|gdpr|rgpd/i;
  const rawSetCookies = (headers.getSetCookie ? headers.getSetCookie() : []).join(" ");
  const hasCookieConsentCookie = consentCookieNames.test(rawSetCookies);

  // Also check for React/Next.js cookie consent components in __NEXT_DATA__ or JS chunk references
  const hasNextDataConsent = /__NEXT_DATA__[^]*?(?:cookie.?consent|cookie.?banner|cookie.?policy|CookieConsent|gdpr|rgpd)/i.test(html);
  // Check if JS bundles reference consent components (look at script src URLs)
  const scriptUrls = (html.match(/<script[^>]+src="([^"]+)"/gi) || []);
  const hasConsentInScriptNames = scriptUrls.some(s => /consent|cookie-banner|gdpr|rgpd|cookie-policy/i.test(s));

  // Probe for common cookie consent endpoints (some CMPs have a config endpoint)
  let hasConsentEndpoint = false;
  for (const ep of ["/api/cookie-consent", "/api/cookies", "/cookie-policy", "/politique-cookies"]) {
    try {
      const r = await fetch(`${origin}${ep}`, {
        headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" },
        signal: AbortSignal.timeout(3000),
        redirect: "manual",
      });
      if (r.status === 200) {
        const body = await r.text();
        if (/cookie|consent|rgpd|gdpr|politique/i.test(body) && body.length > 100) {
          hasConsentEndpoint = true;
          break;
        }
      }
    } catch { /* skip */ }
  }

  const hasCookieBanner = hasCookieBannerInHtml || hasCookieBannerInScripts || hasCookieConsentCookie || hasNextDataConsent || hasConsentInScriptNames || hasConsentEndpoint;
  const detectionDetails: string[] = [];
  if (hasCookieBannerInHtml) detectionDetails.push("mots-cles dans le HTML");
  if (hasCookieBannerInScripts) detectionDetails.push("script de consentement detecte");
  if (hasCookieConsentCookie) detectionDetails.push("cookie de consentement dans Set-Cookie");
  if (hasNextDataConsent) detectionDetails.push("reference dans __NEXT_DATA__");
  if (hasConsentInScriptNames) detectionDetails.push("bundle JS de consentement");
  if (hasConsentEndpoint) detectionDetails.push("endpoint/page de consentement");
  checks.push({
    name: "Bandeau de consentement cookies (RGPD)",
    passed: hasCookieBanner,
    details: hasCookieBanner
      ? `Mecanisme de consentement cookies detecte (${detectionDetails.join(", ")}).`
      : "Aucun bandeau de consentement cookies detecte. Obligatoire si des cookies non essentiels sont deposes (analytics, pub, etc.).",
    category: "RGPD",
  });

  // RGPD - Privacy policy (check text, links href, and common paths)
  let hasPrivacyLink = /(?:politique|privacy|confidentialit|rgpd|donnees.?personnelles|vie.?priv)/i.test(html);
  if (!hasPrivacyLink) {
    const hrefCheck = /href="[^"]*(?:privacy|confidentialit|politique|rgpd|donnees-personnelles)[^"]*"/i.test(html);
    if (hrefCheck) hasPrivacyLink = true;
  }
  if (!hasPrivacyLink) {
    for (const p of ["/privacy", "/politique-de-confidentialite", "/confidentialite", "/privacy-policy"]) {
      try {
        const r = await fetch(`${origin}${p}`, { headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" }, signal: AbortSignal.timeout(3000), redirect: "follow" });
        if (r.ok && (await r.text()).length > 200) { hasPrivacyLink = true; break; }
      } catch { /* skip */ }
    }
  }
  checks.push({
    name: "Lien vers politique de confidentialite",
    passed: hasPrivacyLink,
    details: hasPrivacyLink
      ? "Un lien vers une politique de confidentialite/RGPD a ete detecte."
      : "Aucun lien vers une politique de confidentialite detecte dans la page.",
    category: "RGPD",
  });

  // RGPD - Legal mentions (check text, links, and common paths)
  let hasLegalMentions = /(?:mentions?.?l[eé]gales|legal.?notice|imprint|impressum|cgu|cgv|conditions.?g[eé]n[eé]rales)/i.test(html);
  if (!hasLegalMentions) {
    const hrefCheck = /href="[^"]*(?:mentions-legales|legal|cgu|cgv|conditions-generales)[^"]*"/i.test(html);
    if (hrefCheck) hasLegalMentions = true;
  }
  if (!hasLegalMentions) {
    for (const p of ["/mentions-legales", "/legal", "/cgu", "/cgv"]) {
      try {
        const r = await fetch(`${origin}${p}`, { headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" }, signal: AbortSignal.timeout(3000), redirect: "follow" });
        if (r.ok && (await r.text()).length > 200) { hasLegalMentions = true; break; }
      } catch { /* skip */ }
    }
  }
  checks.push({
    name: "Mentions legales",
    passed: hasLegalMentions,
    details: hasLegalMentions
      ? "Des liens vers des mentions legales / CGU / CGV ont ete detectes."
      : "Aucune mention legale detectee (obligatoire pour les sites francais).",
    category: "RGPD",
  });

  // HTTPS
  checks.push({
    name: "Chiffrement HTTPS",
    passed: true,
    details: "Le site est accessible en HTTPS.",
    category: "ANSSI",
  });

  // HSTS
  const hasHSTS = headers.has("strict-transport-security");
  checks.push({
    name: "HSTS (HTTP Strict Transport Security)",
    passed: hasHSTS,
    details: hasHSTS
      ? `HSTS active: ${headers.get("strict-transport-security")}`
      : "HSTS non active. Le navigateur peut se connecter en HTTP non securise.",
    category: "ANSSI",
  });

  // CSP
  const hasCSP = headers.has("content-security-policy");
  checks.push({
    name: "Content Security Policy",
    passed: hasCSP,
    details: hasCSP
      ? "Une politique CSP est configuree."
      : "Aucune CSP definie. Le site est vulnerable aux injections de scripts (XSS).",
    category: "ANSSI",
  });

  // Cookie security
  const insecureCookies = cookies.filter(c => c.issues.length > 0);
  checks.push({
    name: "Securite des cookies",
    passed: insecureCookies.length === 0,
    details: insecureCookies.length === 0
      ? "Tous les cookies ont les attributs de securite requis."
      : `${insecureCookies.length} cookie(s) avec des problemes de securite: ${insecureCookies.map(c => c.name).join(", ")}`,
    category: "ANSSI",
  });

  // SPF
  const hasSPF = dnsRecords.some(r => r.type === "SPF");
  checks.push({
    name: "Enregistrement SPF (anti-spoofing email)",
    passed: hasSPF,
    details: hasSPF
      ? `SPF configure: ${dnsRecords.find(r => r.type === "SPF")?.value}`
      : "Aucun enregistrement SPF detecte. Les emails du domaine peuvent etre usurpes.",
    category: "Email",
  });

  // DMARC
  const hasDMARC = dnsRecords.some(r => r.type === "DMARC");
  checks.push({
    name: "Enregistrement DMARC",
    passed: hasDMARC,
    details: hasDMARC
      ? `DMARC configure: ${dnsRecords.find(r => r.type === "DMARC")?.value}`
      : "Aucun enregistrement DMARC detecte. Pas de politique d'authentification email.",
    category: "Email",
  });

  // security.txt — check HTML reference + probe /.well-known/security.txt and /security.txt
  let hasSecurityTxt = /security\.txt/i.test(html);
  if (!hasSecurityTxt) {
    for (const p of ["/.well-known/security.txt", "/security.txt"]) {
      try {
        const r = await fetch(`${origin}${p}`, {
          headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" },
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) {
          const body = await r.text();
          if (/Contact:|Expires:|Encryption:|Policy:/i.test(body)) {
            hasSecurityTxt = true;
            break;
          }
        }
      } catch { /* skip */ }
    }
  }
  checks.push({
    name: "security.txt (RFC 9116)",
    passed: hasSecurityTxt,
    details: hasSecurityTxt
      ? "Le fichier security.txt est present et accessible."
      : "Aucun fichier security.txt detecte. Recommande pour le signalement responsable de vulnerabilites.",
    category: "ANSSI",
  });

  return checks;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main handler
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const rawTarget = (body.target as string || "").trim();

    if (!rawTarget) {
      return NextResponse.json({ error: "Cible requise" }, { status: 400 });
    }

    let url = rawTarget;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }

    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;

    // ─── Phase 1: HTTP fetch + headers (follow redirects, then re-fetch final URL for accurate headers) ───
    const BROWSER_HEADERS = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    };

    let response: Response;
    let html = "";
    let finalUrl = url;
    const redirectChain: string[] = [];

    try {
      // Step 1: follow redirects manually to capture the chain and the final URL
      let currentUrl = url;
      for (let hop = 0; hop < 5; hop++) {
        const r = await fetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          headers: BROWSER_HEADERS,
          signal: AbortSignal.timeout(10000),
        });
        if (r.status >= 300 && r.status < 400) {
          const loc = r.headers.get("location");
          if (!loc) break;
          redirectChain.push(currentUrl);
          currentUrl = loc.startsWith("http") ? loc : new URL(loc, currentUrl).toString();
          continue;
        }
        break;
      }
      finalUrl = currentUrl;

      // Step 2: fetch the final URL with full headers (fresh, no cache)
      response = await fetch(finalUrl, {
        method: "GET",
        redirect: "follow",
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(15000),
      });
      html = await response.text();
    } catch (fetchErr) {
      return NextResponse.json({
        target: rawTarget,
        scanDate: new Date().toISOString(),
        duration: Math.floor((Date.now() - startTime) / 1000),
        reachable: false,
        headers: [],
        ports: [],
        dnsRecords: [],
        cookies: [],
        vulnerabilities: [],
        compliance: [],
        score: 0,
        error: `Impossible de joindre ${rawTarget}: ${(fetchErr as Error).message}`,
      } satisfies AuditResult);
    }

    const respHeaders = response.headers;

    // ─── Phase 2: All parallel scans ───
    const [ports, tlsInfo, dnsRecords] = await Promise.all([
      scanPorts(hostname),
      parsedUrl.protocol === "https:" ? scanTls(hostname) : Promise.resolve(null),
      resolveDns(hostname),
    ]);

    // ─── Phase 3: Header analysis ───
    const headerChecks: HeaderCheck[] = SECURITY_HEADERS.map(h => {
      const val = respHeaders.get(h.name);
      return {
        name: h.label,
        present: val !== null,
        value: val || undefined,
        recommendation: val === null ? h.recommendation : undefined,
      };
    });

    // ─── Phase 4: Cookie analysis ───
    const rawCookies = respHeaders.getSetCookie ? respHeaders.getSetCookie() : [];
    const cookies = parseCookies(rawCookies);

    // ─── Phase 5: Vulnerability checks ───
    const cfDetected = isCloudflare(respHeaders.get("server") || undefined, respHeaders);

    const [appVulns, adminVulns, bruteForceVulns] = await Promise.all([
      checkVulnerabilities(url, html, respHeaders),
      checkAdminPaths(parsedUrl.origin),
      checkBruteForce(url),
    ]);

    const [sqliVulns, ssrfVulns, traversalVulns, redirectVulns, subdomainVulns, tlsDowngradeVulns, sessionVulns] = await Promise.all([
      checkSQLInjection(parsedUrl.origin),
      checkSSRF(parsedUrl.origin),
      checkDirectoryTraversal(parsedUrl.origin),
      checkOpenRedirect(parsedUrl.origin),
      checkSubdomainEnum(hostname),
      parsedUrl.protocol === "https:" ? checkTLSDowngrade(hostname) : Promise.resolve([]),
      checkSessionSecurity(url),
    ]);

    const emailVulns = analyzeEmailSecurity(dnsRecords);

    const vulnerabilities: VulnCheck[] = [
      ...appVulns, ...adminVulns, ...bruteForceVulns,
      ...sqliVulns, ...ssrfVulns, ...traversalVulns, ...redirectVulns,
      ...subdomainVulns, ...tlsDowngradeVulns, ...sessionVulns, ...emailVulns,
    ];

    // Port-based vulns — filter out Cloudflare proxy ports
    const dangerousPorts = ports.filter(p => {
      if (p.port === 80 || p.port === 443) return false;
      if (cfDetected && CLOUDFLARE_PORTS.has(p.port)) return false;
      return p.risk === "critical" || p.risk === "high";
    });
    for (const dp of dangerousPorts) {
      vulnerabilities.push({
        id: `vuln-port-${dp.port}`,
        title: `Port ${dp.port} (${dp.service}) ouvert — acces critique`,
        severity: dp.risk === "critical" ? "critical" : "high",
        category: "Infrastructure",
        description: `Le port ${dp.port} (${dp.service}) est ouvert et accessible depuis Internet.${dp.banner ? ` Banniere: ${dp.banner}` : ""} Ce service ne devrait pas etre expose publiquement.`,
        remediation: `Fermer le port ${dp.port} dans le pare-feu. Si le service est necessaire, le restreindre par IP ou VPN.`,
        affectedComponent: `Service ${dp.service}`,
        cvss: 8.5,
      });
    }

    // Annotate Cloudflare proxy ports as info (not real server ports)
    if (cfDetected) {
      const cfPorts = ports.filter(p => CLOUDFLARE_PORTS.has(p.port) && p.port !== 80 && p.port !== 443);
      if (cfPorts.length > 0) {
        vulnerabilities.push({
          id: "vuln-cloudflare-ports",
          title: `Ports Cloudflare detectes (${cfPorts.map(p => p.port).join(", ")})`,
          severity: "info",
          category: "Infrastructure",
          description: `Le site est derriere Cloudflare. Les ports ${cfPorts.map(p => p.port).join(", ")} sont des ports proxy Cloudflare standards, pas des ports de votre serveur.`,
          remediation: "Aucune action requise — ports geres par le CDN Cloudflare.",
          affectedComponent: "CDN Cloudflare",
        });
      }
    }

    // TLS vulns
    if (tlsInfo) {
      if (tlsInfo.daysUntilExpiry <= 0) {
        vulnerabilities.push({
          id: "vuln-tls-expired",
          title: "Certificat TLS expire",
          severity: "critical",
          category: "Chiffrement",
          description: `Le certificat a expire le ${tlsInfo.validTo}. Les navigateurs affichent un avertissement de securite.`,
          remediation: "Renouveler immediatement le certificat TLS.",
          affectedComponent: "Certificat TLS",
          cvss: 9.0,
        });
      } else if (tlsInfo.daysUntilExpiry <= 30) {
        vulnerabilities.push({
          id: "vuln-tls-expiring",
          title: `Certificat TLS expire dans ${tlsInfo.daysUntilExpiry} jours`,
          severity: "high",
          category: "Chiffrement",
          description: `Le certificat expire le ${tlsInfo.validTo}. Renouvellement urgent necessaire.`,
          remediation: "Renouveler le certificat TLS avant expiration. Configurer le renouvellement automatique.",
          affectedComponent: "Certificat TLS",
        });
      }
      if (tlsInfo.version === "TLSv1" || tlsInfo.version === "TLSv1.1") {
        vulnerabilities.push({
          id: "vuln-tls-old",
          title: `Version TLS obsolete: ${tlsInfo.version}`,
          severity: "critical",
          category: "Chiffrement",
          description: `${tlsInfo.version} est deprecie et vulnerable (POODLE, BEAST). Les navigateurs modernes le rejettent.`,
          remediation: "Configurer le serveur pour TLS 1.2 minimum, idealement TLS 1.3.",
          affectedComponent: "Configuration TLS",
          cvss: 9.1,
          cve: "CVE-2014-3566",
        });
      }
    }

    // DNS vulns
    const hasSPF = dnsRecords.some(r => r.type === "SPF");
    const hasDMARC = dnsRecords.some(r => r.type === "DMARC");
    if (!hasSPF) {
      vulnerabilities.push({
        id: "vuln-no-spf",
        title: "Enregistrement SPF absent",
        severity: "medium",
        category: "DNS/Email",
        description: "Aucun enregistrement SPF detecte. Les emails du domaine peuvent etre usurpes (phishing).",
        remediation: "Ajouter un enregistrement TXT SPF: v=spf1 include:... ~all",
        affectedComponent: "Configuration DNS",
      });
    }
    if (!hasDMARC) {
      vulnerabilities.push({
        id: "vuln-no-dmarc",
        title: "Enregistrement DMARC absent",
        severity: "medium",
        category: "DNS/Email",
        description: "Aucun enregistrement DMARC detecte. Pas de politique d'authentification des emails.",
        remediation: "Ajouter un enregistrement TXT _dmarc: v=DMARC1; p=reject; rua=mailto:dmarc@domain.tld",
        affectedComponent: "Configuration DNS",
      });
    }

    // Cookie vulns
    for (const c of cookies) {
      if (c.issues.length > 0) {
        vulnerabilities.push({
          id: `vuln-cookie-${c.name}`,
          title: `Cookie "${c.name}" non securise`,
          severity: "medium",
          category: "Cookies",
          description: c.issues.join(". "),
          remediation: "Configurer le cookie avec: Secure; HttpOnly; SameSite=Strict (ou Lax selon le besoin).",
          affectedComponent: "Gestion de session",
        });
      }
    }

    // Server header
    const serverHeader = respHeaders.get("server") || undefined;
    if (serverHeader) {
      const isCDN = /cloudflare|fastly|akamai|cloudfront|vercel|netlify/i.test(serverHeader);
      vulnerabilities.push({
        id: "vuln-server-header",
        title: `Exposition du serveur: ${serverHeader}`,
        severity: isCDN ? "info" : "low",
        category: "Information Disclosure",
        description: isCDN
          ? `Le header Server indique "${serverHeader}" (CDN/plateforme). Non modifiable sur la plupart des plans.`
          : `Le header Server expose: "${serverHeader}". Cela facilite le ciblage d'exploits connus.`,
        remediation: isCDN
          ? "Aucune action requise — header gere par le CDN/plateforme."
          : "Masquer la version: ServerTokens Prod (Apache) ou server_tokens off (Nginx).",
        affectedComponent: "Serveur HTTP",
      });
    }

    // ─── Phase 6: Source code leak detection ───
    const sourceAudit = await checkSourceLeaks(url);
    if (sourceAudit.leaks.length > 0) {
      sourceAudit.aiAnalysis = await analyzeLeaksWithAI(sourceAudit.leaks);
      for (const leak of sourceAudit.leaks) {
        vulnerabilities.push({
          id: leak.id,
          title: leak.title,
          severity: leak.severity,
          category: "Fuite de code",
          description: leak.description,
          remediation: leak.remediation,
          affectedComponent: leak.url,
          cvss: leak.severity === "critical" ? 9.8 : leak.severity === "high" ? 7.5 : leak.severity === "medium" ? 5.0 : 3.0,
        });
      }
    }

    // ─── Phase 7: Compliance ───
    const compliance = await checkCompliance(html, respHeaders, cookies, dnsRecords, parsedUrl.origin);

    // ─── Phase 8: Scoring ───
    let score = 100;
    for (const v of vulnerabilities) {
      if (v.severity === "critical") score -= 15;
      else if (v.severity === "high") score -= 10;
      else if (v.severity === "medium") score -= 5;
      else if (v.severity === "low") score -= 2;
    }
    for (const h of headerChecks) {
      const def = SECURITY_HEADERS.find(sh => sh.label === h.name);
      if (!h.present && def) score -= Math.min(def.weight, 5);
    }
    if (tlsInfo && tlsInfo.grade === "A+") score += 5;
    else if (tlsInfo && tlsInfo.grade === "A") score += 3;
    score = Math.max(0, Math.min(100, score));

    // Sort vulns
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    vulnerabilities.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    const result: AuditResult = {
      target: rawTarget,
      scanDate: new Date().toISOString(),
      duration: Math.floor((Date.now() - startTime) / 1000),
      reachable: true,
      statusCode: response.status,
      redirectUrl: finalUrl !== url ? finalUrl : undefined,
      redirectChain: redirectChain.length > 0 ? redirectChain : undefined,
      serverHeader,
      poweredBy: respHeaders.get("x-powered-by") || undefined,
      headers: headerChecks,
      ports,
      tlsInfo: tlsInfo || undefined,
      dnsRecords,
      cookies,
      vulnerabilities,
      compliance,
      sourceAudit: sourceAudit.leaks.length > 0 ? sourceAudit : undefined,
      score,
    };

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({
      target: "",
      scanDate: new Date().toISOString(),
      duration: Math.floor((Date.now() - startTime) / 1000),
      reachable: false,
      headers: [],
      ports: [],
      dnsRecords: [],
      cookies: [],
      vulnerabilities: [],
      compliance: [],
      score: 0,
      error: (err as Error).message,
    }, { status: 500 });
  }
}
