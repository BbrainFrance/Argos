import { NextRequest } from "next/server";
import { generatePasswordList, COMMON_USERNAMES } from "@/lib/password-dictionary";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface StressConfig {
  target: string;
  maxBruteForce: number;   // 100 | 500 | 1000
  intensity: number;       // max req/s for ramp: 50 | 200 | 500
  maxDuration: number;     // seconds: 30 | 60 | 120
}

interface PhaseStats {
  sent: number;
  success: number;
  blocked: number;
  errors: number;
  timeouts: number;
  avgMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

interface BruteForceResult {
  loginUrl: string | null;
  attemptsBeforeBlock: number;
  totalAttempts: number;
  defenses: string[];
  stats: PhaseStats;
}

interface FloodResult {
  endpoint: string;
  stats: PhaseStats;
  degradation: boolean;
}

interface RampStep {
  reqPerSec: number;
  stats: PhaseStats;
}

interface StressReport {
  target: string;
  duration: number;
  bruteForce: BruteForceResult;
  flood: FloodResult[];
  ramp: RampStep[];
  slowloris: { totalConnections: number; keptAlive: number; serverCrashed: boolean; avgHoldTime: number } | null;
  breakpointReqPerSec: number | null;
  resilienceScore: number;
  recommendations: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

async function fetchFollow(url: string, maxHops = 3): Promise<Response | null> {
  let cur = url;
  for (let i = 0; i < maxHops; i++) {
    const res = await fetch(cur, {
      redirect: "manual",
      headers: { "User-Agent": "ARGOS-StressTest/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      cur = loc.startsWith("http") ? loc : new URL(loc, cur).toString();
      continue;
    }
    return res;
  }
  return null;
}

function computeStats(times: number[]): PhaseStats {
  if (times.length === 0) return { sent: 0, success: 0, blocked: 0, errors: 0, timeouts: 0, avgMs: 0, p95Ms: 0, minMs: 0, maxMs: 0 };
  const sorted = [...times].sort((a, b) => a - b);
  const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const p95Idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
  return {
    sent: sorted.length,
    success: 0, blocked: 0, errors: 0, timeouts: 0,
    avgMs: Math.round(avg),
    p95Ms: sorted[p95Idx],
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
  };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════════════════════════
// Phase 1: Brute Force Login
// ═══════════════════════════════════════════════════════════════════════════

interface LoginPageInfo {
  loginUrl: string;
  authEndpoint: string;
  isNextAuth: boolean;
  csrfToken: string;
}

async function findLoginPage(baseUrl: string): Promise<LoginPageInfo | null> {
  const parsed = new URL(baseUrl);
  const parts = parsed.hostname.split(".");
  const root = parts.length >= 2 ? parts.slice(-2).join(".") : parsed.hostname;
  const origins = [baseUrl];
  if (!parsed.hostname.startsWith("www.")) origins.push(`${parsed.protocol}//www.${parsed.hostname}`);
  if (!parsed.hostname.startsWith("app.")) origins.push(`${parsed.protocol}//app.${root}`);

  const userPath = parsed.pathname;
  const paths = ["/login", "/signin", "/auth/signin", "/auth/login", "/auth/sign-in", "/wp-login.php",
    "/admin/login", "/user/login", "/api/auth/signin", "/account/login", "/connect/login", "/session/new"];
  if (userPath && userPath !== "/" && !paths.includes(userPath)) {
    paths.unshift(userPath);
  }

  for (const origin of origins) {
    for (const path of paths) {
      try {
        const res = await fetchFollow(`${origin}${path}`);
        if (!res || res.status !== 200) continue;
        const body = await res.text();
        const hasLogin = /<input[^>]*type\s*=\s*["']password["']/i.test(body)
          || (/<form/i.test(body) && /(?:password|login|sign.?in|connexion|e.?mail)/i.test(body))
          || /csrfToken|callbackUrl|credentials|next-auth|nextauth|__Host-next-auth|signIn\(|credential/i.test(body)
          || (/signin|sign-in|login/i.test(path) && body.length > 500);
        if (!hasLogin) continue;

        const foundOrigin = new URL(`${origin}${path}`).origin;
        const loginUrl = `${origin}${path}`;

        let isNextAuth = false;
        let csrfToken = "";
        let authEndpoint = loginUrl;

        try {
          const csrfRes = await fetch(`${foundOrigin}/api/auth/csrf`, {
            headers: { "User-Agent": "ARGOS-StressTest/1.0" },
            signal: AbortSignal.timeout(5000),
          });
          if (csrfRes.ok) {
            const csrfJson = await csrfRes.json();
            if (csrfJson.csrfToken) {
              isNextAuth = true;
              csrfToken = csrfJson.csrfToken;
              authEndpoint = `${foundOrigin}/api/auth/callback/credentials`;
            }
          }
        } catch { /* not NextAuth */ }

        return { loginUrl, authEndpoint, isNextAuth, csrfToken };
      } catch { /* skip */ }
    }
  }
  return null;
}

async function phaseBruteForce(
  loginInfo: LoginPageInfo | null,
  targetDomain: string,
  maxAttempts: number,
  emit: (data: Record<string, unknown>) => void,
): Promise<BruteForceResult> {
  const result: BruteForceResult = {
    loginUrl: loginInfo?.loginUrl ?? null,
    attemptsBeforeBlock: -1,
    totalAttempts: 0,
    defenses: [],
    stats: computeStats([]),
  };

  if (!loginInfo) {
    emit({ phase: "bruteforce", progress: 100, message: "Aucun formulaire de connexion trouve", stats: result.stats });
    return result;
  }

  const { authEndpoint, isNextAuth, csrfToken, loginUrl } = loginInfo;

  function buildBody(username: string, password: string): string {
    const params = new URLSearchParams();
    params.set("username", username);
    params.set("password", password);
    params.set("email", username);
    if (isNextAuth) {
      if (csrfToken) params.set("csrfToken", csrfToken);
      params.set("callbackUrl", loginUrl);
      params.set("json", "true");
    }
    return params.toString();
  }

  const passwords = generatePasswordList(targetDomain).slice(0, maxAttempts);
  const usernames = COMMON_USERNAMES.slice(0, 5);
  const times: number[] = [];
  let blocked = false;
  let successCount = 0;
  let blockedCount = 0;
  let errorCount = 0;
  let timeoutCount = 0;
  let consecutiveBlocks = 0;
  const BATCH_SIZE = 15;
  let attempt = 0;

  for (let i = 0; i < passwords.length && !blocked; i += BATCH_SIZE) {
    const batch = passwords.slice(i, i + BATCH_SIZE);
    const username = usernames[Math.floor(i / passwords.length * usernames.length) % usernames.length];

    const promises = batch.map(async (pwd) => {
      const t0 = Date.now();
      try {
        const res = await fetch(authEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "ARGOS-StressTest/1.0",
          },
          body: buildBody(username, pwd),
          redirect: "manual",
          signal: AbortSignal.timeout(8000),
        });
        const elapsed = Date.now() - t0;
        times.push(elapsed);
        attempt++;

        if (res.status === 429 || res.status === 403) {
          blockedCount++;
          consecutiveBlocks++;
          if (result.attemptsBeforeBlock < 0) result.attemptsBeforeBlock = attempt;
          if (res.status === 429) result.defenses.push("Rate Limiting (429)");
          if (res.status === 403) result.defenses.push("IP Ban (403)");
        } else {
          consecutiveBlocks = 0;
          successCount++;
        }

        const retryAfter = res.headers.get("retry-after");
        if (retryAfter) result.defenses.push(`Retry-After: ${retryAfter}`);
        const rateLimit = res.headers.get("x-ratelimit-remaining");
        if (rateLimit) result.defenses.push(`X-RateLimit-Remaining: ${rateLimit}`);

        return { status: res.status, elapsed };
      } catch (err) {
        const elapsed = Date.now() - t0;
        times.push(elapsed);
        attempt++;
        if (elapsed >= 7500) { timeoutCount++; } else { errorCount++; }
        return { status: 0, elapsed };
      }
    });

    await Promise.allSettled(promises);

    if (consecutiveBlocks >= 5) {
      blocked = true;
      result.defenses.push("Blocage apres tentatives repetees");
    }

    const pct = Math.min(Math.round((i + batch.length) / passwords.length * 100), 100);
    emit({
      phase: "bruteforce",
      progress: pct,
      message: `${attempt} tentatives — ${blockedCount} bloquees`,
      stats: { sent: attempt, success: successCount, blocked: blockedCount, errors: errorCount, timeouts: timeoutCount, avgMs: times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0 },
    });
  }

  // Check for CAPTCHA on login page
  try {
    const loginRes = await fetch(loginUrl, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) });
    const html = await loginRes.text();
    if (/captcha|recaptcha|hcaptcha|turnstile/i.test(html)) result.defenses.push("CAPTCHA detecte");
    if (/two.?factor|2fa|mfa|otp|authenticator/i.test(html)) result.defenses.push("MFA/2FA detecte");
  } catch { /* skip */ }

  result.totalAttempts = attempt;
  result.defenses = [...new Set(result.defenses)];
  const stats = computeStats(times);
  stats.success = successCount;
  stats.blocked = blockedCount;
  stats.errors = errorCount;
  stats.timeouts = timeoutCount;
  result.stats = stats;

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2: Endpoint Flooding
// ═══════════════════════════════════════════════════════════════════════════

async function phaseFlood(
  baseUrl: string,
  loginUrl: string | null,
  emit: (data: Record<string, unknown>) => void,
): Promise<FloodResult[]> {
  const endpoints: { url: string; label: string; method: "GET" | "POST" }[] = [
    { url: baseUrl, label: "Page d'accueil (GET /)", method: "GET" },
  ];
  if (loginUrl) endpoints.push({ url: loginUrl, label: "Login (POST)", method: "POST" });

  // Discover API endpoints
  const apiPaths = ["/api", "/graphql", "/api/health", "/api/status"];
  for (const p of apiPaths) {
    try {
      const res = await fetch(`${baseUrl}${p}`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(3000), headers: { "User-Agent": "ARGOS-StressTest/1.0" } });
      if (res.status < 404) endpoints.push({ url: `${baseUrl}${p}`, label: `API ${p}`, method: "GET" as const });
    } catch { /* skip */ }
  }

  const results: FloodResult[] = [];
  const BURST = 50;

  for (let ei = 0; ei < endpoints.length; ei++) {
    const ep = endpoints[ei];
    const times: number[] = [];
    let success = 0, blocked = 0, errors = 0, timeouts = 0;
    let degradation = false;

    // Send burst of 50 requests
    const promises = Array.from({ length: BURST }, async () => {
      const t0 = Date.now();
      try {
        const res = await fetch(ep.url, {
          method: ep.method,
          headers: { "User-Agent": "ARGOS-StressTest/1.0", "Content-Type": "application/x-www-form-urlencoded" },
          body: ep.method === "POST" ? "username=test&password=test" : undefined,
          redirect: "manual",
          signal: AbortSignal.timeout(10000),
        });
        const elapsed = Date.now() - t0;
        times.push(elapsed);
        if (res.status === 429 || res.status === 403) blocked++;
        else if (res.status >= 500) errors++;
        else success++;
      } catch {
        const elapsed = Date.now() - t0;
        times.push(elapsed);
        if (elapsed >= 9500) timeouts++;
        else errors++;
      }
    });

    await Promise.allSettled(promises);

    const stats = computeStats(times);
    stats.success = success;
    stats.blocked = blocked;
    stats.errors = errors;
    stats.timeouts = timeouts;

    // Degradation = more than 20% errors/timeouts or p95 > 5s
    degradation = (errors + timeouts) / BURST > 0.2 || stats.p95Ms > 5000;

    results.push({ endpoint: ep.label, stats, degradation });

    emit({
      phase: "flood",
      progress: Math.round(((ei + 1) / endpoints.length) * 100),
      message: `${ep.label}: ${success}/${BURST} OK — avg ${stats.avgMs}ms`,
      stats,
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3: Ramp-up (point de rupture)
// ═══════════════════════════════════════════════════════════════════════════

async function phaseRamp(
  baseUrl: string,
  maxReqPerSec: number,
  maxDuration: number,
  emit: (data: Record<string, unknown>) => void,
): Promise<{ steps: RampStep[]; breakpoint: number | null }> {
  const steps: RampStep[] = [];
  let breakpoint: number | null = null;
  const STEP_DURATION_MS = 5000;
  const STEP_INCREMENT = 10;
  const startTime = Date.now();
  let currentRate = 10;

  while (currentRate <= maxReqPerSec) {
    if (Date.now() - startTime > maxDuration * 1000) break;

    const reqCount = Math.round(currentRate * (STEP_DURATION_MS / 1000));
    const interval = STEP_DURATION_MS / reqCount;
    const times: number[] = [];
    let success = 0, blocked = 0, errors = 0, timeouts = 0;

    // Fire requests at target rate over 5 seconds
    const firePromises: Promise<void>[] = [];
    for (let i = 0; i < reqCount; i++) {
      const delay = i * interval;
      firePromises.push(
        sleep(delay).then(async () => {
          const t0 = Date.now();
          try {
            const res = await fetch(baseUrl, {
              headers: { "User-Agent": "ARGOS-StressTest/1.0" },
              signal: AbortSignal.timeout(10000),
              redirect: "follow",
            });
            const elapsed = Date.now() - t0;
            times.push(elapsed);
            if (res.status === 429 || res.status === 403) blocked++;
            else if (res.status >= 500) errors++;
            else success++;
          } catch {
            const elapsed = Date.now() - t0;
            times.push(elapsed);
            if (elapsed >= 9500) timeouts++;
            else errors++;
          }
        })
      );
    }

    await Promise.allSettled(firePromises);

    const stats = computeStats(times);
    stats.success = success;
    stats.blocked = blocked;
    stats.errors = errors;
    stats.timeouts = timeouts;

    steps.push({ reqPerSec: currentRate, stats });

    const errorRate = (errors + timeouts) / Math.max(times.length, 1);
    const pct = Math.round((currentRate / maxReqPerSec) * 100);

    emit({
      phase: "ramp",
      progress: pct,
      message: `${currentRate} req/s — avg ${stats.avgMs}ms — ${Math.round(errorRate * 100)}% erreurs`,
      stats,
      reqPerSec: currentRate,
    });

    // Breakpoint detection
    if (!breakpoint && (errorRate > 0.5 || stats.avgMs > 10000)) {
      breakpoint = currentRate;
      break;
    }

    // Degradation warning
    if (errorRate > 0.3 || stats.avgMs > 5000) {
      if (!breakpoint) breakpoint = currentRate;
    }

    currentRate += STEP_INCREMENT;
  }

  return { steps, breakpoint };
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 4: Slowloris (connexions lentes)
// ═══════════════════════════════════════════════════════════════════════════

async function phaseSlowloris(
  baseUrl: string,
  maxConnections: number,
  durationSec: number,
  emit: (data: Record<string, unknown>) => void,
): Promise<{ totalConnections: number; keptAlive: number; serverCrashed: boolean; avgHoldTime: number }> {
  const parsed = new URL(baseUrl);
  const host = parsed.hostname;
  const port = parsed.protocol === "https:" ? 443 : 80;
  const isHttps = parsed.protocol === "https:";

  let totalConnections = 0;
  let keptAlive = 0;
  let serverCrashed = false;
  const holdTimes: number[] = [];
  const activeConns: Array<{ socket: import("net").Socket | import("tls").TLSSocket; start: number }> = [];

  const net = await import("net");
  const tlsMod = await import("tls");

  const createSlowConn = (): Promise<void> => {
    return new Promise((resolve) => {
      const start = Date.now();
      totalConnections++;
      
      const onConnect = (socket: import("net").Socket | import("tls").TLSSocket) => {
        activeConns.push({ socket, start });
        // Send partial HTTP header — never complete it
        socket.write(`GET ${parsed.pathname || "/"} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: ARGOS-Slowloris/1.0\r\nAccept: */*\r\n`);
        
        // Keep connection alive by sending incomplete header every 5 seconds
        const keepAlive = setInterval(() => {
          try {
            socket.write(`X-Argos-${Date.now()}: keep-alive\r\n`);
            keptAlive++;
          } catch {
            clearInterval(keepAlive);
          }
        }, 5000);
        
        socket.on("close", () => {
          clearInterval(keepAlive);
          holdTimes.push(Date.now() - start);
          const idx = activeConns.findIndex(c => c.socket === socket);
          if (idx >= 0) activeConns.splice(idx, 1);
          resolve();
        });
        socket.on("error", () => {
          clearInterval(keepAlive);
          holdTimes.push(Date.now() - start);
          resolve();
        });
        setTimeout(() => {
          try { socket.destroy(); } catch { /* ok */ }
          resolve();
        }, durationSec * 1000);
      };

      if (isHttps) {
        const socket = tlsMod.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: 10000 }, () => onConnect(socket));
        socket.on("error", () => resolve());
        socket.on("timeout", () => { socket.destroy(); resolve(); });
      } else {
        const socket = net.connect({ host, port, timeout: 10000 }, () => onConnect(socket));
        socket.on("error", () => resolve());
        socket.on("timeout", () => { socket.destroy(); resolve(); });
      }
    });
  };

  // Open connections in waves
  const WAVE_SIZE = 10;
  const waves = Math.ceil(maxConnections / WAVE_SIZE);
  
  for (let w = 0; w < waves; w++) {
    const batch = Math.min(WAVE_SIZE, maxConnections - w * WAVE_SIZE);
    const promises = Array.from({ length: batch }, () => createSlowConn());
    
    emit({
      phase: "slowloris",
      progress: Math.round(((w + 1) / waves) * 50),
      message: `${activeConns.length} connexions lentes actives — ${totalConnections} total`,
    });

    // Don't await all — let them run while we open more
    await Promise.race([Promise.allSettled(promises), sleep(2000)]);
  }

  // Monitor server health during hold
  emit({ phase: "slowloris", progress: 60, message: `Maintien de ${activeConns.length} connexions — test de sante serveur...` });
  
  await sleep(3000);
  
  // Check if server still responds
  try {
    const healthCheck = await fetch(baseUrl, {
      headers: { "User-Agent": "ARGOS-HealthCheck/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (healthCheck.status >= 500) serverCrashed = true;
  } catch {
    serverCrashed = true;
  }

  // Clean up
  for (const conn of activeConns) {
    try { conn.socket.destroy(); } catch { /* ok */ }
  }

  const avgHoldTime = holdTimes.length > 0 ? Math.round(holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length) : 0;

  emit({
    phase: "slowloris",
    progress: 100,
    message: `Slowloris termine: ${totalConnections} connexions, serveur ${serverCrashed ? "DEGRADE" : "OK"}`,
  });

  return { totalConnections, keptAlive, serverCrashed, avgHoldTime };
}

// ═══════════════════════════════════════════════════════════════════════════
// Scoring and recommendations
// ═══════════════════════════════════════════════════════════════════════════

function computeResilienceScore(report: Omit<StressReport, "resilienceScore" | "recommendations">): { score: number; recommendations: string[] } {
  let score = 100;
  const recs: string[] = [];

  // Brute force scoring
  if (report.bruteForce.loginUrl) {
    if (report.bruteForce.attemptsBeforeBlock < 0) {
      score -= 30;
      recs.push("CRITIQUE: Aucun rate limiting detecte sur le login. Implementer un mecanisme de blocage apres 5-10 tentatives (fail2ban, WAF, ou rate limiting applicatif).");
    } else if (report.bruteForce.attemptsBeforeBlock > 50) {
      score -= 15;
      recs.push("Le rate limiting se declenche trop tard (apres " + report.bruteForce.attemptsBeforeBlock + " tentatives). Reduire le seuil a 5-10 tentatives.");
    } else if (report.bruteForce.attemptsBeforeBlock > 10) {
      score -= 5;
      recs.push("Le rate limiting est present mais pourrait etre plus strict (actuellement " + report.bruteForce.attemptsBeforeBlock + " tentatives avant blocage).");
    }
    if (!report.bruteForce.defenses.some(d => /captcha/i.test(d))) {
      score -= 10;
      recs.push("Aucun CAPTCHA detecte sur le formulaire de connexion. Ajouter reCAPTCHA, hCaptcha ou Cloudflare Turnstile.");
    }
    if (!report.bruteForce.defenses.some(d => /mfa|2fa/i.test(d))) {
      score -= 5;
      recs.push("Aucune authentification multi-facteurs (MFA/2FA) detectee. Fortement recommande pour les comptes sensibles.");
    }
  }

  // Flood scoring
  for (const f of report.flood) {
    if (f.degradation) {
      score -= 10;
      recs.push(`L'endpoint "${f.endpoint}" montre une degradation sous charge (50 requetes simultanees). Envisager un CDN, du caching, ou du load balancing.`);
    }
    if (f.stats.p95Ms > 3000) {
      score -= 5;
      recs.push(`Temps de reponse p95 eleve sur "${f.endpoint}" (${f.stats.p95Ms}ms). Optimiser les performances ou ajouter du scaling horizontal.`);
    }
  }

  // Ramp scoring
  if (report.breakpointReqPerSec !== null) {
    if (report.breakpointReqPerSec <= 30) {
      score -= 25;
      recs.push(`CRITIQUE: Le serveur commence a faillir a seulement ${report.breakpointReqPerSec} req/s. Infrastructure sous-dimensionnee pour resister a une attaque coordonnee. Deployer un WAF (Cloudflare, AWS WAF) et/ou du scaling automatique.`);
    } else if (report.breakpointReqPerSec <= 100) {
      score -= 15;
      recs.push(`Point de rupture a ${report.breakpointReqPerSec} req/s. Correct pour un site a faible trafic, mais insuffisant contre une attaque DDoS. Considerer un CDN avec protection anti-DDoS.`);
    } else {
      score -= 5;
      recs.push(`Point de rupture a ${report.breakpointReqPerSec} req/s. Bonne resilience de base.`);
    }
  } else if (report.ramp.length > 0) {
    recs.push("Aucun point de rupture detecte dans la plage testee. L'infrastructure semble resiliente.");
  }

  // Slowloris scoring
  const slowloris = (report as unknown as { slowloris?: { serverCrashed: boolean; totalConnections: number } }).slowloris;
  if (slowloris) {
    if (slowloris.serverCrashed) {
      score -= 20;
      recs.push(`CRITIQUE: Le serveur est vulnerable au Slowloris (${slowloris.totalConnections} connexions lentes suffisent a le degrader). Configurer des timeouts stricts et un module anti-slowloris (mod_reqtimeout pour Apache, limit_conn pour Nginx).`);
    } else {
      recs.push("Le serveur resiste aux attaques Slowloris (connexions lentes maintenues sans degradation).");
    }
  }

  if (recs.length === 0) {
    recs.push("L'infrastructure montre une bonne resilience aux tests effectues.");
  }

  return { score: Math.max(0, score), recommendations: recs };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main handler — SSE streaming
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  const body = await req.json();
  const rawTarget = (body.target as string || "").trim();
  const maxBruteForce = Math.min(Number(body.maxBruteForce) || 500, 1000);
  const intensity = Math.min(Number(body.intensity) || 200, 500);
  const maxDuration = Math.min(Number(body.maxDuration) || 60, 120);

  if (!rawTarget) {
    return new Response(JSON.stringify({ error: "Cible requise" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  let url = rawTarget;
  if (!url.startsWith("http://") && !url.startsWith("https://")) url = `https://${url}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* stream closed */ }
      };

      const startTime = Date.now();

      try {
        emit({ phase: "init", progress: 0, message: `Demarrage du stress test sur ${rawTarget}` });

        // Phase 1: Brute Force
        emit({ phase: "bruteforce", progress: 0, message: "Phase 1: Detection du formulaire de connexion..." });
        const loginInfo = await findLoginPage(url);
        emit({ phase: "bruteforce", progress: 5, message: loginInfo
          ? `Login trouve: ${loginInfo.loginUrl}${loginInfo.isNextAuth ? ` → API: ${loginInfo.authEndpoint}` : ""}`
          : "Aucun login detecte — test brute force reduit" });

        const bruteResult = await phaseBruteForce(loginInfo, new URL(url).hostname, maxBruteForce, emit);
        emit({ phase: "bruteforce", progress: 100, message: `Phase 1 terminee: ${bruteResult.totalAttempts} tentatives, ${bruteResult.defenses.length} defenses detectees` });

        // Phase 2: Flood
        emit({ phase: "flood", progress: 0, message: "Phase 2: Test de charge sur les endpoints..." });
        const floodResults = await phaseFlood(url, loginInfo?.loginUrl ?? null, emit);
        emit({ phase: "flood", progress: 100, message: `Phase 2 terminee: ${floodResults.length} endpoints testes` });

        // Phase 3: Ramp-up
        emit({ phase: "ramp", progress: 0, message: `Phase 3: Montee en charge progressive (max ${intensity} req/s)...` });
        const rampResult = await phaseRamp(url, intensity, maxDuration, emit);
        emit({ phase: "ramp", progress: 100, message: rampResult.breakpoint ? `Point de rupture: ${rampResult.breakpoint} req/s` : "Aucun point de rupture detecte" });

        // Phase 4: Slowloris
        emit({ phase: "slowloris", progress: 0, message: "Phase 4: Test Slowloris (connexions lentes)..." });
        const slowlorisResult = await phaseSlowloris(url, Math.min(intensity, 100), Math.min(maxDuration, 30), emit);
        emit({ phase: "slowloris", progress: 100, message: `Phase 4 terminee: ${slowlorisResult.totalConnections} connexions, serveur ${slowlorisResult.serverCrashed ? "DEGRADE" : "OK"}` });

        // Build report
        const partialReport = {
          target: rawTarget,
          duration: Math.round((Date.now() - startTime) / 1000),
          bruteForce: bruteResult,
          flood: floodResults,
          ramp: rampResult.steps,
          slowloris: slowlorisResult,
          breakpointReqPerSec: rampResult.breakpoint,
        };

        const { score, recommendations } = computeResilienceScore(partialReport);

        const report: StressReport = {
          ...partialReport,
          resilienceScore: score,
          recommendations,
        };

        emit({ phase: "done", progress: 100, message: "Test termine", report });
      } catch (err) {
        emit({ phase: "error", progress: 0, message: `Erreur: ${(err as Error).message}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
