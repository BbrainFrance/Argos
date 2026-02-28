import { NextRequest, NextResponse } from "next/server";

interface HeaderCheck {
  name: string;
  present: boolean;
  value?: string;
  recommendation?: string;
}

interface AuditResult {
  target: string;
  scanDate: string;
  reachable: boolean;
  statusCode?: number;
  redirectUrl?: string;
  serverHeader?: string;
  headers: HeaderCheck[];
  tlsInfo?: {
    version: string;
    grade: string;
  };
  score: number;
  error?: string;
}

const SECURITY_HEADERS = [
  { name: "content-security-policy", label: "Content-Security-Policy", recommendation: "Definir une politique CSP stricte pour prevenir les XSS" },
  { name: "x-frame-options", label: "X-Frame-Options", recommendation: "Ajouter X-Frame-Options: DENY ou SAMEORIGIN" },
  { name: "x-content-type-options", label: "X-Content-Type-Options", recommendation: "Ajouter X-Content-Type-Options: nosniff" },
  { name: "strict-transport-security", label: "Strict-Transport-Security", recommendation: "Activer HSTS : max-age=31536000; includeSubDomains; preload" },
  { name: "x-xss-protection", label: "X-XSS-Protection", recommendation: "Ajouter X-XSS-Protection: 0 (deprecie, prefer CSP)" },
  { name: "referrer-policy", label: "Referrer-Policy", recommendation: "Configurer Referrer-Policy: strict-origin-when-cross-origin" },
  { name: "permissions-policy", label: "Permissions-Policy", recommendation: "Restreindre les APIs: camera=(), microphone=(), geolocation=()" },
  { name: "x-permitted-cross-domain-policies", label: "X-Permitted-Cross-Domain-Policies", recommendation: "Ajouter X-Permitted-Cross-Domain-Policies: none" },
  { name: "cross-origin-opener-policy", label: "Cross-Origin-Opener-Policy", recommendation: "Ajouter COOP: same-origin" },
  { name: "cross-origin-resource-policy", label: "Cross-Origin-Resource-Policy", recommendation: "Ajouter CORP: same-origin" },
];

export async function POST(req: NextRequest) {
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "ARGOS-SecurityAudit/1.0",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      return NextResponse.json({
        target: rawTarget,
        scanDate: new Date().toISOString(),
        reachable: false,
        headers: [],
        score: 0,
        error: `Impossible de joindre ${rawTarget}: ${(fetchErr as Error).message}`,
      } satisfies AuditResult);
    }
    clearTimeout(timeout);

    const respHeaders = response.headers;
    const headerChecks: HeaderCheck[] = SECURITY_HEADERS.map(h => {
      const val = respHeaders.get(h.name);
      return {
        name: h.label,
        present: val !== null,
        value: val || undefined,
        recommendation: val === null ? h.recommendation : undefined,
      };
    });

    const serverHeader = respHeaders.get("server") || undefined;
    const isHttps = url.startsWith("https://");
    const hasHSTS = respHeaders.has("strict-transport-security");
    const hasCSP = respHeaders.has("content-security-policy");
    const hasXFO = respHeaders.has("x-frame-options");
    const hasXCTO = respHeaders.has("x-content-type-options");

    let score = 100;
    if (!isHttps) score -= 20;
    if (!hasCSP) score -= 15;
    if (!hasHSTS) score -= 15;
    if (!hasXFO) score -= 10;
    if (!hasXCTO) score -= 5;
    headerChecks.forEach(h => {
      if (!h.present) score -= 3;
    });
    if (serverHeader) score -= 5;
    score = Math.max(0, Math.min(100, score));

    let tlsGrade = "N/A";
    if (isHttps) {
      if (hasHSTS && hasCSP && !serverHeader) tlsGrade = "A";
      else if (hasHSTS || hasCSP) tlsGrade = "B";
      else tlsGrade = "C";
    }

    const result: AuditResult = {
      target: rawTarget,
      scanDate: new Date().toISOString(),
      reachable: true,
      statusCode: response.status,
      redirectUrl: response.redirected ? response.url : undefined,
      serverHeader,
      headers: headerChecks,
      tlsInfo: isHttps ? { version: "TLS 1.2+", grade: tlsGrade } : undefined,
      score,
    };

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
