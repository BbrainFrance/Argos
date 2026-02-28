"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

type ScanStatus = "idle" | "scanning" | "done" | "error";
type Severity = "critical" | "high" | "medium" | "low" | "info";

interface Vulnerability {
  id: string;
  title: string;
  severity: Severity;
  category: string;
  description: string;
  remediation: string;
  cvss?: number;
  cve?: string;
  affectedComponent: string;
}

interface CookieCheck {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string | null;
  issues: string[];
}

interface ComplianceCheck {
  name: string;
  passed: boolean;
  details: string;
  category: string;
}

interface ScanResult {
  target: string;
  scanDate: string;
  duration: number;
  score: number;
  vulnerabilities: Vulnerability[];
  tlsInfo?: {
    version: string;
    cipher: string;
    cipherBits?: number;
    validFrom: string;
    validTo: string;
    issuer: string;
    subject?: string;
    grade: string;
    daysUntilExpiry?: number;
    altNames?: string[];
    serialNumber?: string;
  };
  headers: { name: string; present: boolean; value?: string; recommendation?: string }[];
  ports: { port: number; service: string; state: string; risk: Severity; banner?: string }[];
  dnsRecords: { type: string; value: string }[];
  cookies: CookieCheck[];
  compliance: ComplianceCheck[];
}

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: "text-red-500 bg-red-500/10 border-red-500/30",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  info: "text-slate-400 bg-slate-500/10 border-slate-500/30",
};

const SEVERITY_BADGE: Record<Severity, string> = {
  critical: "bg-red-500/20 text-red-400 border border-red-500/40",
  high: "bg-orange-500/20 text-orange-400 border border-orange-500/40",
  medium: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40",
  low: "bg-blue-500/20 text-blue-400 border border-blue-500/40",
  info: "bg-slate-500/20 text-slate-400 border border-slate-500/40",
};

const SCAN_TEMPLATES = [
  { id: "full", name: "Audit Complet", description: "Scan ports, TLS, headers, vulns, DNS", icon: "🔍", duration: "~3 min" },
  { id: "web", name: "Securite Web", description: "Headers HTTP, TLS, XSS, CSRF, injections", icon: "🌐", duration: "~1 min" },
  { id: "infra", name: "Infrastructure", description: "Ports ouverts, services exposes, DNS", icon: "🏗️", duration: "~2 min" },
  { id: "compliance", name: "Conformite ANSSI", description: "Referentiel ANSSI, RGPD, RGS", icon: "📋", duration: "~1 min" },
];

// no mock — API returns real data directly

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : score >= 40 ? "#f97316" : "#ef4444";
  const label = score >= 80 ? "BON" : score >= 60 ? "MOYEN" : score >= 40 ? "FAIBLE" : "CRITIQUE";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#1e293b" strokeWidth="8" />
          <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${score * 2.64} ${264 - score * 2.64}`}
            strokeLinecap="round" className="transition-all duration-1000" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold font-mono" style={{ color }}>{score}</span>
          <span className="text-[8px] font-mono text-argos-text-dim">/100</span>
        </div>
      </div>
      <span className="text-[10px] font-mono font-bold tracking-wider" style={{ color }}>{label}</span>
    </div>
  );
}

export default function CyberAuditPage() {
  const [target, setTarget] = useState("");
  const [template, setTemplate] = useState("full");
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [expandedVuln, setExpandedVuln] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "vulns" | "headers" | "ports" | "dns" | "tls" | "cookies" | "compliance" | "auth">("overview");
  const [history, setHistory] = useState<ScanResult[]>([]);

  const startScan = useCallback(async () => {
    if (!target.trim()) return;
    setStatus("scanning");
    setProgress(0);
    setResult(null);
    setActiveTab("overview");

    let p = 0;
    const progressInterval = setInterval(() => {
      p += Math.random() * 3 + 1;
      setProgress(Math.min(p, 92));
    }, 500);

    try {
      const res = await fetch("/api/cyber-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: target.trim(), template }),
      });
      clearInterval(progressInterval);
      setProgress(100);

      if (!res.ok) throw new Error(`Erreur serveur: ${res.status}`);
      const apiResult = await res.json();

      const scanResult: ScanResult = {
        target: apiResult.target,
        scanDate: apiResult.scanDate,
        duration: apiResult.duration || 0,
        score: apiResult.score,
        vulnerabilities: apiResult.vulnerabilities || [],
        tlsInfo: apiResult.tlsInfo || undefined,
        headers: apiResult.headers || [],
        ports: apiResult.ports || [],
        dnsRecords: apiResult.dnsRecords || [],
        cookies: apiResult.cookies || [],
        compliance: apiResult.compliance || [],
      };
      if (apiResult.error) {
        scanResult.vulnerabilities.unshift({
          id: "vuln-error", title: apiResult.error, severity: "critical", category: "Connectivite",
          description: apiResult.error, remediation: "Verifier que la cible est accessible.", affectedComponent: "Reseau",
        });
      }

      setResult(scanResult);
      setHistory(prev => [scanResult, ...prev].slice(0, 10));
      setStatus("done");
    } catch (err) {
      clearInterval(progressInterval);
      setProgress(0);
      const errorResult: ScanResult = {
        target: target.trim(),
        scanDate: new Date().toISOString(),
        duration: 0,
        score: 0,
        vulnerabilities: [{
          id: "vuln-api-error",
          title: `Echec du scan: ${(err as Error).message}`,
          severity: "critical",
          category: "Connectivite",
          description: `Le serveur n'a pas pu analyser la cible. Erreur: ${(err as Error).message}`,
          remediation: "Verifier que la cible est accessible et que l'URL est correcte.",
          affectedComponent: "Reseau",
        }],
        headers: [],
        ports: [],
        dnsRecords: [],
        cookies: [],
        compliance: [],
      };
      setResult(errorResult);
      setStatus("done");
    }
  }, [target, template]);

  const exportReport = useCallback(() => {
    if (!result) return;
    const lines = [
      "═══════════════════════════════════════════════════════════",
      "  ARGOS — RAPPORT D'EVALUATION RISQUE NUMERIQUE",
      "═══════════════════════════════════════════════════════════",
      "",
      `Cible: ${result.target}`,
      `Date: ${new Date(result.scanDate).toLocaleString("fr-FR")}`,
      `Duree: ${result.duration}s`,
      `Score de securite: ${result.score}/100`,
      "",
      "───── VULNERABILITES ─────",
      "",
    ];
    for (const v of result.vulnerabilities) {
      lines.push(`[${v.severity.toUpperCase()}] ${v.title}`);
      lines.push(`  Categorie: ${v.category}`);
      lines.push(`  Composant: ${v.affectedComponent}`);
      if (v.cvss) lines.push(`  CVSS: ${v.cvss}`);
      if (v.cve) lines.push(`  CVE: ${v.cve}`);
      lines.push(`  Description: ${v.description}`);
      lines.push(`  Remediation: ${v.remediation}`);
      lines.push("");
    }
    lines.push("───── EN-TETES HTTP ─────");
    lines.push("");
    for (const h of result.headers) {
      lines.push(`  ${h.present ? "✓" : "✗"} ${h.name}: ${h.present ? (h.value || "present") : "ABSENT"}`);
      if (!h.present && h.recommendation) lines.push(`    → ${h.recommendation}`);
    }
    lines.push("");
    lines.push("───── PORTS ─────");
    lines.push("");
    for (const p of result.ports) {
      lines.push(`  Port ${p.port} (${p.service}): ${p.state} [${p.risk.toUpperCase()}]`);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `argos-audit-${result.target.replace(/[^a-z0-9]/gi, "_")}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const critCount = result?.vulnerabilities.filter(v => v.severity === "critical").length ?? 0;
  const highCount = result?.vulnerabilities.filter(v => v.severity === "high").length ?? 0;
  const medCount = result?.vulnerabilities.filter(v => v.severity === "medium").length ?? 0;
  const lowCount = result?.vulnerabilities.filter(v => v.severity === "low").length ?? 0;

  return (
    <div className="min-h-screen bg-argos-bg text-argos-text font-mono">
      {/* Header */}
      <header className="bg-argos-surface border-b border-argos-border/30 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-7 h-7 rounded bg-gradient-to-br from-argos-accent to-blue-600 flex items-center justify-center text-white font-bold text-xs">A</div>
            <span className="text-xs font-bold tracking-[0.2em]">ARGOS</span>
          </Link>
          <div className="w-px h-6 bg-argos-border/30" />
          <div className="flex items-center gap-2">
            <span className="text-lg">🛡️</span>
            <div>
              <h1 className="text-sm font-bold tracking-wider text-argos-accent">EVALUATION RISQUE NUMERIQUE</h1>
              <p className="text-[8px] text-argos-text-dim tracking-wider">AUDIT DE SECURITE &mdash; ANALYSE DE VULNERABILITES</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {history.length > 0 && (
            <span className="text-[9px] text-argos-text-dim">{history.length} audit{history.length > 1 ? "s" : ""} effectue{history.length > 1 ? "s" : ""}</span>
          )}
          <Link href="/stress-test" className="text-[10px] px-3 py-1.5 border border-red-500/30 rounded hover:border-red-500/50 text-red-400/70 hover:text-red-400 transition-all">
            💣 STRESS TEST
          </Link>
          <Link href="/" className="text-[10px] px-3 py-1.5 border border-argos-border/30 rounded hover:border-argos-accent/40 hover:text-argos-accent transition-all">
            ← RETOUR CARTE
          </Link>
        </div>
      </header>

      <div className="flex h-[calc(100vh-56px)]">
        {/* Left panel — scan config */}
        <div className="w-80 bg-argos-surface border-r border-argos-border/30 flex flex-col">
          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            {/* Target input */}
            <div className="space-y-2">
              <label className="text-[9px] text-argos-text-dim tracking-wider uppercase">Cible (URL ou domaine)</label>
              <input
                type="text"
                value={target}
                onChange={e => setTarget(e.target.value)}
                placeholder="ex: franceconnect.gouv.fr"
                className="w-full bg-argos-panel border border-argos-border/30 rounded px-3 py-2 text-xs placeholder:text-argos-text-dim/30 focus:border-argos-accent/50 focus:outline-none transition-colors"
                onKeyDown={e => e.key === "Enter" && startScan()}
              />
            </div>

            {/* Templates */}
            <div className="space-y-2">
              <label className="text-[9px] text-argos-text-dim tracking-wider uppercase">Type d&apos;audit</label>
              <div className="grid grid-cols-1 gap-1.5">
                {SCAN_TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTemplate(t.id)}
                    className={`w-full text-left px-3 py-2 rounded border transition-all ${
                      template === t.id
                        ? "bg-argos-accent/10 border-argos-accent/40 text-argos-accent"
                        : "border-argos-border/20 hover:border-argos-border/40 text-argos-text-dim"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{t.icon}</span>
                      <div className="flex-1">
                        <p className="text-[10px] font-bold">{t.name}</p>
                        <p className="text-[8px] opacity-60">{t.description}</p>
                      </div>
                      <span className="text-[7px] opacity-40">{t.duration}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Launch button */}
            <button
              onClick={startScan}
              disabled={!target.trim() || status === "scanning"}
              className={`w-full py-2.5 rounded font-bold text-xs tracking-wider transition-all ${
                status === "scanning"
                  ? "bg-argos-accent/20 text-argos-accent/60 cursor-wait"
                  : target.trim()
                    ? "bg-argos-accent/20 hover:bg-argos-accent/30 text-argos-accent border border-argos-accent/30 hover:border-argos-accent/50 cursor-pointer"
                    : "bg-argos-panel text-argos-text-dim/30 cursor-not-allowed"
              }`}
            >
              {status === "scanning" ? "ANALYSE EN COURS..." : "LANCER L'AUDIT"}
            </button>

            {/* Progress */}
            {status === "scanning" && (
              <div className="space-y-2">
                <div className="w-full h-1.5 bg-argos-panel rounded-full overflow-hidden">
                  <div className="h-full bg-argos-accent transition-all duration-300 rounded-full" style={{ width: `${progress}%` }} />
                </div>
                <div className="flex justify-between text-[8px] text-argos-text-dim">
                  <span className="animate-pulse">Analyse du reseau...</span>
                  <span>{Math.round(progress)}%</span>
                </div>
              </div>
            )}

            {/* Scan history */}
            {history.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-argos-border/20">
                <label className="text-[9px] text-argos-text-dim tracking-wider uppercase">Historique</label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {history.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => { setResult(h); setStatus("done"); setActiveTab("overview"); }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-argos-panel/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-argos-text truncate max-w-[150px]">{h.target}</span>
                        <span className={`text-[8px] font-bold ${h.score >= 70 ? "text-green-400" : h.score >= 40 ? "text-yellow-400" : "text-red-400"}`}>{h.score}</span>
                      </div>
                      <span className="text-[7px] text-argos-text-dim">{new Date(h.scanDate).toLocaleString("fr-FR")}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Pre-configured targets */}
          <div className="p-3 border-t border-argos-border/20 space-y-1.5">
            <label className="text-[8px] text-argos-text-dim/50 tracking-wider uppercase">Cibles pre-configurees</label>
            {[
              { label: "France Connect", url: "franceconnect.gouv.fr" },
              { label: "Service-Public.fr", url: "service-public.fr" },
              { label: "Ameli.fr", url: "ameli.fr" },
              { label: "Impots.gouv.fr", url: "impots.gouv.fr" },
            ].map(t => (
              <button
                key={t.url}
                onClick={() => setTarget(t.url)}
                className="w-full text-left px-2 py-1 rounded text-[9px] hover:bg-argos-panel/40 text-argos-text-dim hover:text-argos-accent transition-all"
              >
                <span className="text-argos-text-dim/40 mr-1">›</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {status === "idle" && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-md">
                <div className="text-5xl">🛡️</div>
                <h2 className="text-sm font-bold tracking-wider text-argos-text-dim">EVALUATION RISQUE NUMERIQUE</h2>
                <p className="text-[10px] text-argos-text-dim/60 leading-relaxed">
                  Auditez la securite d&apos;un site web ou d&apos;un service en ligne. Le rapport genere identifie les vulnerabilites
                  et fournit des recommandations correctives detaillees pour les equipes de developpement.
                </p>
                <div className="grid grid-cols-4 gap-3 pt-4">
                  {[
                    { icon: "🔒", label: "TLS/SSL" },
                    { icon: "🌐", label: "Headers HTTP" },
                    { icon: "🔌", label: "Ports" },
                    { icon: "📋", label: "Conformite" },
                  ].map(f => (
                    <div key={f.label} className="text-center py-3 border border-argos-border/20 rounded">
                      <span className="text-lg">{f.icon}</span>
                      <p className="text-[8px] text-argos-text-dim mt-1">{f.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {status === "scanning" && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-6">
                <div className="w-20 h-20 border-2 border-argos-accent/30 border-t-argos-accent rounded-full animate-spin mx-auto" />
                <div>
                  <p className="text-xs font-bold text-argos-accent tracking-wider">ANALYSE EN COURS</p>
                  <p className="text-[10px] text-argos-text-dim mt-1">{target}</p>
                </div>
                <div className="max-w-xs mx-auto space-y-1 text-[9px] text-argos-text-dim/60">
                  {progress > 10 && <p className="animate-pulse">✓ Resolution DNS...</p>}
                  {progress > 25 && <p className="animate-pulse">✓ Scan des ports...</p>}
                  {progress > 40 && <p className="animate-pulse">✓ Analyse TLS/SSL...</p>}
                  {progress > 55 && <p className="animate-pulse">✓ Verification des headers...</p>}
                  {progress > 70 && <p className="animate-pulse">✓ Detection de vulnerabilites...</p>}
                  {progress > 85 && <p className="animate-pulse">✓ Generation du rapport...</p>}
                </div>
              </div>
            </div>
          )}

          {status === "done" && result && (
            <>
              {/* Tabs */}
              <div className="flex items-center border-b border-argos-border/30 bg-argos-surface">
                {([
                  { id: "overview", label: "VUE GENERALE", icon: "📊" },
                  { id: "vulns", label: `VULNS (${result.vulnerabilities.length})`, icon: "⚠️" },
                  { id: "headers", label: "HEADERS", icon: "🌐" },
                  { id: "ports", label: `PORTS (${result.ports.length})`, icon: "🔌" },
                  { id: "tls", label: "TLS/SSL", icon: "🔒" },
                  { id: "dns", label: `DNS (${result.dnsRecords.length})`, icon: "📡" },
                  { id: "cookies", label: `COOKIES (${result.cookies.length})`, icon: "🍪" },
                  { id: "auth", label: "AUTH / BRUTE FORCE", icon: "🔐" },
                  { id: "compliance", label: "CONFORMITE", icon: "📋" },
                ] as { id: typeof activeTab; label: string; icon: string }[]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] tracking-wider border-b-2 transition-all ${
                      activeTab === tab.id
                        ? "border-argos-accent text-argos-accent"
                        : "border-transparent text-argos-text-dim hover:text-argos-text hover:border-argos-border/30"
                    }`}
                  >
                    <span className="text-xs">{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
                <div className="flex-1" />
                <button
                  onClick={exportReport}
                  className="mr-4 text-[9px] px-3 py-1.5 border border-argos-border/30 rounded hover:border-argos-accent/40 hover:text-argos-accent transition-all"
                >
                  📄 EXPORTER RAPPORT
                </button>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === "overview" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-5 gap-4">
                      {/* Score */}
                      <div className="col-span-1 bg-argos-surface border border-argos-border/20 rounded-lg p-4 flex items-center justify-center">
                        <ScoreGauge score={result.score} />
                      </div>
                      {/* Summary stats */}
                      <div className="col-span-2 bg-argos-surface border border-argos-border/20 rounded-lg p-4 space-y-3">
                        <p className="text-[9px] text-argos-text-dim tracking-wider uppercase">Resume</p>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-argos-text-dim">Cible</span>
                            <span className="text-[10px] text-argos-accent font-bold">{result.target}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-argos-text-dim">Date</span>
                            <span className="text-[10px]">{new Date(result.scanDate).toLocaleString("fr-FR")}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-argos-text-dim">Duree</span>
                            <span className="text-[10px]">{result.duration}s</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-argos-text-dim">TLS</span>
                            <span className={`text-[10px] font-bold ${result.tlsInfo?.grade?.startsWith("A") ? "text-green-400" : result.tlsInfo?.grade?.startsWith("B") ? "text-yellow-400" : "text-red-400"}`}>
                              {result.tlsInfo ? `${result.tlsInfo.version} — Grade ${result.tlsInfo.grade}` : "N/A"}
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* Vuln breakdown */}
                      <div className="col-span-2 bg-argos-surface border border-argos-border/20 rounded-lg p-4 space-y-3">
                        <p className="text-[9px] text-argos-text-dim tracking-wider uppercase">Vulnerabilites</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-red-500/5 border border-red-500/20 rounded p-2 text-center">
                            <p className="text-lg font-bold text-red-400">{critCount}</p>
                            <p className="text-[8px] text-red-400/60">CRITIQUE</p>
                          </div>
                          <div className="bg-orange-500/5 border border-orange-500/20 rounded p-2 text-center">
                            <p className="text-lg font-bold text-orange-400">{highCount}</p>
                            <p className="text-[8px] text-orange-400/60">HAUTE</p>
                          </div>
                          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded p-2 text-center">
                            <p className="text-lg font-bold text-yellow-400">{medCount}</p>
                            <p className="text-[8px] text-yellow-400/60">MOYENNE</p>
                          </div>
                          <div className="bg-blue-500/5 border border-blue-500/20 rounded p-2 text-center">
                            <p className="text-lg font-bold text-blue-400">{lowCount}</p>
                            <p className="text-[8px] text-blue-400/60">BASSE</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Scan modules summary */}
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: "Ports ouverts", value: String(result.ports.length), icon: "🔌", color: result.ports.length > 2 ? "text-red-400" : result.ports.length > 0 ? "text-yellow-400" : "text-green-400" },
                        { label: "Cookies", value: String(result.cookies.length), icon: "🍪", color: result.cookies.some(c => c.issues.length > 0) ? "text-yellow-400" : "text-green-400" },
                        { label: "DNS Records", value: String(result.dnsRecords.length), icon: "📡", color: "text-argos-accent" },
                        { label: "Conformite", value: `${result.compliance.filter(c => c.passed).length}/${result.compliance.length}`, icon: "📋", color: result.compliance.filter(c => !c.passed).length > 2 ? "text-red-400" : "text-green-400" },
                      ].map(m => (
                        <div key={m.label} className="bg-argos-surface border border-argos-border/20 rounded-lg p-3 text-center">
                          <span className="text-lg">{m.icon}</span>
                          <p className={`text-lg font-bold mt-1 ${m.color}`}>{m.value}</p>
                          <p className="text-[8px] text-argos-text-dim uppercase">{m.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Top vulns */}
                    {result.vulnerabilities.filter(v => v.severity === "critical" || v.severity === "high").length > 0 && (
                      <div className="bg-argos-surface border border-red-500/20 rounded-lg p-4 space-y-3">
                        <p className="text-[9px] text-red-400 tracking-wider uppercase">Alertes prioritaires</p>
                        <div className="space-y-2">
                          {result.vulnerabilities.filter(v => v.severity === "critical" || v.severity === "high").map(v => (
                            <div key={v.id} className="flex items-start gap-3 p-2 bg-argos-panel/30 rounded">
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${SEVERITY_BADGE[v.severity]}`}>
                                {v.severity.toUpperCase()}
                              </span>
                              <div className="flex-1">
                                <p className="text-[10px] font-bold">{v.title}</p>
                                <p className="text-[9px] text-argos-text-dim mt-0.5">{v.description}</p>
                              </div>
                              {v.cvss && <span className="text-[9px] text-argos-text-dim">CVSS {v.cvss}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "vulns" && (
                  <div className="space-y-2">
                    {result.vulnerabilities.map(v => (
                      <div
                        key={v.id}
                        className={`border rounded-lg transition-all ${SEVERITY_COLORS[v.severity]}`}
                      >
                        <button
                          onClick={() => setExpandedVuln(expandedVuln === v.id ? null : v.id)}
                          className="w-full text-left px-4 py-3 flex items-center gap-3"
                        >
                          <span className={`text-[8px] font-bold px-2 py-0.5 rounded ${SEVERITY_BADGE[v.severity]}`}>
                            {v.severity.toUpperCase()}
                          </span>
                          <span className="text-[10px] font-bold flex-1">{v.title}</span>
                          <span className="text-[9px] text-argos-text-dim">{v.category}</span>
                          {v.cvss && <span className="text-[8px] bg-argos-panel px-1.5 py-0.5 rounded">CVSS {v.cvss}</span>}
                          <span className="text-argos-text-dim text-xs">{expandedVuln === v.id ? "▾" : "▸"}</span>
                        </button>
                        {expandedVuln === v.id && (
                          <div className="px-4 pb-4 space-y-3 border-t border-inherit">
                            <div className="pt-3 grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-[8px] text-argos-text-dim uppercase tracking-wider mb-1">Description</p>
                                <p className="text-[10px] leading-relaxed">{v.description}</p>
                              </div>
                              <div>
                                <p className="text-[8px] text-argos-text-dim uppercase tracking-wider mb-1">Composant affecte</p>
                                <p className="text-[10px]">{v.affectedComponent}</p>
                                {v.cve && (
                                  <a href={`https://nvd.nist.gov/vuln/detail/${v.cve}`} target="_blank" rel="noopener noreferrer"
                                    className="text-[9px] text-argos-accent hover:underline mt-1 inline-block">{v.cve} ↗</a>
                                )}
                              </div>
                            </div>
                            <div className="bg-green-500/5 border border-green-500/20 rounded p-3">
                              <p className="text-[8px] text-green-400 uppercase tracking-wider mb-1">Remediation recommandee</p>
                              <p className="text-[10px] text-green-300/80 leading-relaxed">{v.remediation}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "headers" && (
                  <div className="bg-argos-surface border border-argos-border/20 rounded-lg overflow-hidden">
                    <div className="px-4 py-2 bg-argos-panel/30 border-b border-argos-border/20">
                      <p className="text-[9px] text-argos-text-dim tracking-wider uppercase">En-tetes de securite HTTP</p>
                    </div>
                    <div className="divide-y divide-argos-border/10">
                      {result.headers.map(h => (
                        <div key={h.name} className="px-4 py-2.5 flex items-center gap-3">
                          <span className={`w-5 h-5 rounded flex items-center justify-center text-xs ${h.present ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                            {h.present ? "✓" : "✗"}
                          </span>
                          <span className="text-[10px] font-bold flex-1">{h.name}</span>
                          {h.present && h.value && <span className="text-[9px] text-argos-text-dim bg-argos-panel px-2 py-0.5 rounded">{h.value}</span>}
                          {!h.present && h.recommendation && <span className="text-[9px] text-yellow-400/70">{h.recommendation}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === "ports" && (
                  <div className="bg-argos-surface border border-argos-border/20 rounded-lg overflow-hidden">
                    <div className="px-4 py-2 bg-argos-panel/30 border-b border-argos-border/20 flex items-center justify-between">
                      <p className="text-[9px] text-argos-text-dim tracking-wider uppercase">Ports ouverts detectes</p>
                      <p className="text-[9px] text-argos-text-dim">{result.ports.length} / 21 ports scannes</p>
                    </div>
                    {result.ports.length === 0 ? (
                      <div className="px-4 py-6 text-center">
                        <p className="text-[10px] text-green-400">Aucun port ouvert detecte sur les 21 ports scannes</p>
                        <p className="text-[8px] text-argos-text-dim mt-1">21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 993, 995, 1433, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 27017</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-argos-border/10">
                        {result.ports.map(p => (
                          <div key={p.port} className="px-4 py-2.5 flex items-center gap-3">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${SEVERITY_BADGE[p.risk]}`}>{p.risk.toUpperCase()}</span>
                            <span className="text-sm font-bold w-16">{p.port}</span>
                            <span className="text-[10px] text-argos-text-dim flex-1">{p.service}</span>
                            {p.banner && <span className="text-[8px] text-argos-text-dim bg-argos-panel/50 px-2 py-0.5 rounded max-w-[200px] truncate">{p.banner}</span>}
                            <span className="text-[10px] font-bold text-red-400">OPEN</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "tls" && (
                  <div className="space-y-4">
                    {!result.tlsInfo ? (
                      <div className="bg-argos-surface border border-red-500/30 rounded-lg p-4 text-center">
                        <p className="text-[10px] text-red-400">Aucune connexion TLS — le site n&apos;utilise pas HTTPS ou l&apos;analyse TLS a echoue</p>
                      </div>
                    ) : (
                      <div className="bg-argos-surface border border-argos-border/20 rounded-lg p-4">
                        <div className="flex items-center gap-4 mb-4">
                          <div className={`w-16 h-16 rounded-lg flex items-center justify-center text-2xl font-bold ${
                            result.tlsInfo.grade.startsWith("A") ? "bg-green-500/10 text-green-400 border border-green-500/30"
                            : result.tlsInfo.grade.startsWith("B") ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30"
                            : "bg-red-500/10 text-red-400 border border-red-500/30"
                          }`}>
                            {result.tlsInfo.grade}
                          </div>
                          <div>
                            <p className="text-sm font-bold">Certificat TLS/SSL</p>
                            <p className="text-[10px] text-argos-text-dim">Analyse reelle du chiffrement et du certificat</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: "Protocole", value: result.tlsInfo.version },
                            { label: "Cipher Suite", value: result.tlsInfo.cipher },
                            { label: "Sujet (CN)", value: result.tlsInfo.subject || "-" },
                            { label: "Emetteur", value: result.tlsInfo.issuer },
                            { label: "Valide du", value: result.tlsInfo.validFrom },
                            { label: "Expire le", value: result.tlsInfo.validTo },
                            { label: "Jours restants", value: result.tlsInfo.daysUntilExpiry != null ? String(result.tlsInfo.daysUntilExpiry) : "-" },
                            { label: "Serial", value: result.tlsInfo.serialNumber || "-" },
                          ].map(f => (
                            <div key={f.label} className="bg-argos-panel/30 rounded p-2">
                              <p className="text-[8px] text-argos-text-dim uppercase tracking-wider">{f.label}</p>
                              <p className="text-[10px] font-bold mt-0.5 break-all">{f.value}</p>
                            </div>
                          ))}
                        </div>
                        {result.tlsInfo.altNames && result.tlsInfo.altNames.length > 0 && (
                          <div className="mt-3 bg-argos-panel/30 rounded p-2">
                            <p className="text-[8px] text-argos-text-dim uppercase tracking-wider mb-1">Subject Alternative Names ({result.tlsInfo.altNames.length})</p>
                            <div className="flex flex-wrap gap-1">
                              {result.tlsInfo.altNames.map((san, i) => (
                                <span key={i} className="text-[9px] bg-argos-accent/10 text-argos-accent px-2 py-0.5 rounded">{san}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "dns" && (
                  <div className="bg-argos-surface border border-argos-border/20 rounded-lg overflow-hidden">
                    <div className="px-4 py-2 bg-argos-panel/30 border-b border-argos-border/20">
                      <p className="text-[9px] text-argos-text-dim tracking-wider uppercase">Enregistrements DNS ({result.dnsRecords.length})</p>
                    </div>
                    {result.dnsRecords.length === 0 ? (
                      <div className="px-4 py-6 text-center text-[10px] text-argos-text-dim">Aucun enregistrement DNS detecte</div>
                    ) : (
                      <div className="divide-y divide-argos-border/10">
                        {result.dnsRecords.map((d, i) => (
                          <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded w-14 text-center ${
                              d.type === "SPF" || d.type === "DMARC" || d.type === "DKIM" ? "bg-green-500/10 text-green-400 border border-green-500/20" :
                              d.type === "MX" ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" :
                              "bg-argos-accent/10 text-argos-accent border border-argos-accent/20"
                            }`}>{d.type}</span>
                            <span className="text-[10px] text-argos-text-dim flex-1 break-all">{d.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "cookies" && (
                  <div className="space-y-3">
                    {result.cookies.length === 0 ? (
                      <div className="bg-argos-surface border border-argos-border/20 rounded-lg px-4 py-6 text-center">
                        <p className="text-[10px] text-argos-text-dim">Aucun cookie detecte dans la reponse</p>
                      </div>
                    ) : result.cookies.map((c, i) => (
                      <div key={i} className={`bg-argos-surface border rounded-lg p-4 ${c.issues.length > 0 ? "border-yellow-500/30" : "border-green-500/30"}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm">{c.issues.length > 0 ? "⚠️" : "✅"}</span>
                          <span className="text-[11px] font-bold">{c.name}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[9px] font-mono mb-2">
                          <div className={`px-2 py-1 rounded text-center ${c.secure ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                            Secure: {c.secure ? "✓" : "✗"}
                          </div>
                          <div className={`px-2 py-1 rounded text-center ${c.httpOnly ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                            HttpOnly: {c.httpOnly ? "✓" : "✗"}
                          </div>
                          <div className={`px-2 py-1 rounded text-center ${c.sameSite && c.sameSite !== "none" ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                            SameSite: {c.sameSite || "absent"}
                          </div>
                        </div>
                        {c.issues.length > 0 && (
                          <div className="space-y-1 mt-2">
                            {c.issues.map((issue, j) => (
                              <p key={j} className="text-[9px] text-yellow-400/80">• {issue}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "auth" && (() => {
                  const authVulns = result.vulnerabilities.filter(v => v.category === "Authentification");
                  return (
                    <div className="space-y-4">
                      <div className="bg-argos-surface border border-argos-border/20 rounded-lg p-4">
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-2xl">🔐</span>
                          <div>
                            <p className="text-sm font-bold">Tests d&apos;authentification et brute force</p>
                            <p className="text-[9px] text-argos-text-dim mt-0.5">{authVulns.length} resultat(s) — detection de formulaire, rate limiting, CAPTCHA, MFA, enumeration de comptes</p>
                          </div>
                        </div>
                      </div>

                      {authVulns.length === 0 ? (
                        <div className="bg-argos-surface border border-argos-border/20 rounded-lg p-6 text-center">
                          <p className="text-argos-text-dim text-sm">Aucun resultat d&apos;authentification disponible</p>
                          <p className="text-[9px] text-argos-text-dim mt-1">Les tests de brute force necessitent un formulaire de connexion accessible</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {authVulns.map(v => (
                            <div key={v.id} className={`border rounded-lg ${SEVERITY_COLORS[v.severity]}`}>
                              <button
                                onClick={() => setExpandedVuln(expandedVuln === v.id ? null : v.id)}
                                className="w-full text-left p-4 flex items-center gap-3 cursor-pointer"
                              >
                                <span className={`text-[8px] font-bold px-2 py-1 rounded ${SEVERITY_BADGE[v.severity]}`}>
                                  {v.severity.toUpperCase()}
                                </span>
                                <span className="flex-1 text-[11px] font-medium">{v.title}</span>
                                <span className="text-argos-text-dim text-xs">{expandedVuln === v.id ? "▲" : "▼"}</span>
                              </button>
                              {expandedVuln === v.id && (
                                <div className="px-4 pb-4 pt-0 border-t border-argos-border/10 space-y-3">
                                  <p className="text-[10px] text-argos-text-dim leading-relaxed">{v.description}</p>
                                  <div className="bg-argos-panel/30 rounded p-3">
                                    <p className="text-[8px] text-argos-text-dim uppercase tracking-wider mb-1">Remediation</p>
                                    <p className="text-[10px] leading-relaxed">{v.remediation}</p>
                                  </div>
                                  <div className="flex gap-4 text-[9px] text-argos-text-dim">
                                    <span>Composant: {v.affectedComponent}</span>
                                    {v.cvss && <span>CVSS: {v.cvss}</span>}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {activeTab === "compliance" && (
                  <div className="space-y-4">
                    {(() => {
                      const categories = [...new Set(result.compliance.map(c => c.category))];
                      return categories.map(cat => (
                        <div key={cat} className="bg-argos-surface border border-argos-border/20 rounded-lg overflow-hidden">
                          <div className="px-4 py-2 bg-argos-panel/30 border-b border-argos-border/20 flex items-center justify-between">
                            <p className="text-[9px] text-argos-text-dim tracking-wider uppercase">{cat}</p>
                            <span className="text-[9px] font-mono">
                              {result.compliance.filter(c => c.category === cat && c.passed).length}/
                              {result.compliance.filter(c => c.category === cat).length} OK
                            </span>
                          </div>
                          <div className="divide-y divide-argos-border/10">
                            {result.compliance.filter(c => c.category === cat).map((c, i) => (
                              <div key={i} className="px-4 py-3 flex gap-3">
                                <span className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0 ${
                                  c.passed ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                                }`}>
                                  {c.passed ? "✓" : "✗"}
                                </span>
                                <div className="flex-1">
                                  <p className="text-[10px] font-bold">{c.name}</p>
                                  <p className="text-[9px] text-argos-text-dim mt-0.5 leading-relaxed">{c.details}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
