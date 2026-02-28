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

  const batchSize = 5;
  for (let i = 0; i < ADMIN_PATHS.length; i += batchSize) {
    const batch = ADMIN_PATHS.slice(i, i + batchSize);
    const promises = batch.map(async (path) => {
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          method: "HEAD",
          redirect: "manual",
          headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" },
          signal: AbortSignal.timeout(5000),
        });
        if (res.status === 200 || res.status === 301 || res.status === 302) {
          const isSensitive = path.includes(".env") || path.includes(".git") || path.includes(".htaccess") || path.includes("server-status");
          if (isSensitive && res.status === 200) {
            vulns.push({
              id: `vuln-exposed-${path.replace(/[^a-z0-9]/g, "")}`,
              title: `Fichier sensible accessible: ${path}`,
              severity: "critical",
              category: "Exposition de fichiers",
              description: `Le fichier ${path} est accessible publiquement. Il peut contenir des secrets, des identifiants ou des informations de configuration.`,
              remediation: `Bloquer l'acces a ${path} via la configuration du serveur web. Verifier qu'aucun secret n'a ete compromis.`,
              affectedComponent: "Configuration serveur",
              cvss: 9.0,
            });
          } else {
            found.push(`${path} (${res.status})`);
          }
        }
      } catch { /* unreachable */ }
    });
    await Promise.all(promises);
  }

  if (found.length > 0) {
    vulns.push({
      id: "vuln-admin-paths",
      title: `${found.length} chemin(s) d'administration detecte(s)`,
      severity: "low",
      category: "Reconnaissance",
      description: `Chemins accessibles: ${found.join(", ")}. Ces endpoints sont des cibles potentielles pour les attaquants.`,
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
  const loginPaths = ["/login", "/signin", "/auth/login", "/wp-login.php", "/admin/login", "/user/login", "/api/auth/signin"];
  let loginUrl: string | null = null;
  let loginStatus = 0;

  for (const path of loginPaths) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: "HEAD",
        redirect: "manual",
        headers: { "User-Agent": "ARGOS-SecurityAudit/1.0" },
        signal: AbortSignal.timeout(4000),
      });
      if (res.status === 200 || res.status === 302 || res.status === 301) {
        loginUrl = `${baseUrl}${path}`;
        loginStatus = res.status;
        break;
      }
    } catch { /* not found */ }
  }

  if (!loginUrl) {
    vulns.push({
      id: "vuln-no-login-found",
      title: "Aucun formulaire de connexion detecte",
      severity: "info",
      category: "Authentification",
      description: `Aucune page de connexion trouvee parmi les chemins testes (${loginPaths.join(", ")}). Les tests de brute force n'ont pas pu etre effectues.`,
      remediation: "Si un formulaire de connexion existe sur un chemin non standard, specifiez-le manuellement.",
      affectedComponent: "Pages d'authentification",
    });
    return vulns;
  }

  // Test rate limiting with rapid requests (20 attempts)
  let blocked = false;
  let rateLimitHeader: string | null = null;
  const rapidResults: number[] = [];

  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(loginUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "ARGOS-SecurityAudit/1.0",
        },
        body: "username=admin&password=wrongpassword123",
        redirect: "manual",
        signal: AbortSignal.timeout(4000),
      });
      rapidResults.push(res.status);
      if (res.status === 429 || res.status === 403) {
        blocked = true;
        rateLimitHeader = res.headers.get("retry-after") || res.headers.get("x-ratelimit-remaining");
        break;
      }
    } catch {
      blocked = true;
      break;
    }
  }

  if (!blocked) {
    vulns.push({
      id: "vuln-no-rate-limit",
      title: "Absence de rate limiting sur l'authentification",
      severity: "high",
      category: "Authentification",
      description: `Le formulaire de connexion (${loginUrl}) accepte ${rapidResults.length} tentatives rapides sans blocage (codes: ${rapidResults.join(", ")}). Vulnerable au brute force.`,
      remediation: "Implementer un rate limiting (ex: 5 tentatives / minute). Ajouter un CAPTCHA apres 3 echecs. Considerer fail2ban cote serveur.",
      affectedComponent: "Systeme d'authentification",
      cvss: 7.5,
    });
  } else {
    vulns.push({
      id: "vuln-rate-limit-ok",
      title: "Rate limiting detecte sur l'authentification",
      severity: "info",
      category: "Authentification",
      description: `Le systeme a bloque les tentatives rapides apres ${rapidResults.length} requete(s).${rateLimitHeader ? ` Header: ${rateLimitHeader}` : ""} Protection anti-brute-force active.`,
      remediation: "Aucune action requise.",
      affectedComponent: "Systeme d'authentification",
    });
  }

  // Check for account enumeration
  try {
    const res1 = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ARGOS-SecurityAudit/1.0" },
      body: "username=admin&password=wrongpassword",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    const body1 = await res1.text();

    const res2 = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ARGOS-SecurityAudit/1.0" },
      body: "username=nonexistent_user_xyz_1234&password=wrongpassword",
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

    const hasCaptcha = /captcha|recaptcha|hcaptcha|turnstile|g-recaptcha/i.test(loginHtml);
    const hasMFA = /(?:two.?factor|2fa|mfa|otp|authenticator|verification.?code)/i.test(loginHtml);

    if (!hasCaptcha) {
      vulns.push({
        id: "vuln-no-captcha",
        title: "Absence de CAPTCHA sur le formulaire de connexion",
        severity: "medium",
        category: "Authentification",
        description: "Aucun CAPTCHA detecte sur la page de connexion. Facilite les attaques automatisees.",
        remediation: "Ajouter un CAPTCHA (reCAPTCHA v3, hCaptcha, Cloudflare Turnstile) sur le formulaire de connexion.",
        affectedComponent: "Formulaire de connexion",
      });
    } else {
      vulns.push({
        id: "vuln-captcha-ok",
        title: "CAPTCHA detecte sur la connexion",
        severity: "info",
        category: "Authentification",
        description: "Un systeme CAPTCHA est en place sur la page de connexion.",
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

function checkCompliance(html: string, headers: Headers, cookies: CookieCheck[], dnsRecords: DnsRecord[]): ComplianceCheck[] {
  const checks: ComplianceCheck[] = [];

  // RGPD - Cookie consent
  const hasCookieBanner = /cookie.?(?:consent|banner|notice|policy|accept)|tarteaucitron|cookiebot|onetrust|axeptio|didomi|CookieConsent/i.test(html);
  checks.push({
    name: "Bandeau de consentement cookies (RGPD)",
    passed: hasCookieBanner,
    details: hasCookieBanner
      ? "Un mecanisme de consentement cookies a ete detecte dans le code source."
      : "Aucun bandeau de consentement cookies detecte. Obligatoire si des cookies non essentiels sont deposes (analytics, pub, etc.).",
    category: "RGPD",
  });

  // RGPD - Privacy policy
  const hasPrivacyLink = /(?:politique|privacy|confidentialit|rgpd|donnees.?personnelles|vie.?priv)/i.test(html);
  checks.push({
    name: "Lien vers politique de confidentialite",
    passed: hasPrivacyLink,
    details: hasPrivacyLink
      ? "Un lien vers une politique de confidentialite/RGPD a ete detecte."
      : "Aucun lien vers une politique de confidentialite detecte dans la page.",
    category: "RGPD",
  });

  // RGPD - Legal mentions
  const hasLegalMentions = /(?:mentions?.?l[eé]gales|legal.?notice|imprint|impressum|cgu|cgv|conditions.?g[eé]n[eé]rales)/i.test(html);
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

  // security.txt
  const hasSecurityTxt = /security\.txt/i.test(html);
  checks.push({
    name: "security.txt (RFC 9116)",
    passed: hasSecurityTxt,
    details: hasSecurityTxt
      ? "Le fichier security.txt est reference."
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

    // ─── Phase 1: HTTP fetch + headers ───
    let response: Response;
    let html = "";
    try {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
        },
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
      checkBruteForce(parsedUrl.origin),
    ]);

    const vulnerabilities: VulnCheck[] = [...appVulns, ...adminVulns, ...bruteForceVulns];

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

    // ─── Phase 6: Compliance ───
    const compliance = checkCompliance(html, respHeaders, cookies, dnsRecords);

    // ─── Phase 7: Scoring ───
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
      redirectUrl: response.redirected ? response.url : undefined,
      serverHeader,
      poweredBy: respHeaders.get("x-powered-by") || undefined,
      headers: headerChecks,
      ports,
      tlsInfo: tlsInfo || undefined,
      dnsRecords,
      cookies,
      vulnerabilities,
      compliance,
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
