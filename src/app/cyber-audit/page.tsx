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

interface ScanResult {
  target: string;
  scanDate: string;
  duration: number;
  score: number;
  vulnerabilities: Vulnerability[];
  tlsInfo?: {
    version: string;
    cipher: string;
    validFrom: string;
    validTo: string;
    issuer: string;
    grade: string;
  };
  headers: { name: string; present: boolean; value?: string; recommendation?: string }[];
  ports: { port: number; service: string; state: string; risk: Severity }[];
  dnsRecords: { type: string; value: string }[];
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

function generateMockScan(target: string, template: string): ScanResult {
  const now = new Date();
  const vulns: Vulnerability[] = [];
  const rng = () => Math.random();

  if (template === "full" || template === "web") {
    if (rng() > 0.3) vulns.push({
      id: "vuln-001", title: "En-tete Content-Security-Policy absent", severity: "high", category: "Headers HTTP",
      description: "L'en-tete Content-Security-Policy n'est pas defini. Cela expose le site aux attaques XSS et d'injection de contenu.",
      remediation: "Ajouter un en-tete CSP strict : Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;",
      cvss: 7.1, affectedComponent: "Serveur HTTP",
    });
    if (rng() > 0.4) vulns.push({
      id: "vuln-002", title: "Cookie sans attribut Secure", severity: "medium", category: "Cookies",
      description: "Des cookies de session sont transmis sans l'attribut Secure, permettant l'interception sur des connexions non-HTTPS.",
      remediation: "Configurer tous les cookies de session avec les attributs : Secure; HttpOnly; SameSite=Strict",
      cvss: 5.3, affectedComponent: "Gestion de session",
    });
    if (rng() > 0.5) vulns.push({
      id: "vuln-003", title: "Version TLS 1.0/1.1 supportee", severity: "critical", category: "Chiffrement",
      description: "Le serveur accepte encore TLS 1.0 et 1.1 qui sont deprecies et vulnerables (POODLE, BEAST).",
      remediation: "Desactiver TLS 1.0 et 1.1. Configurer le serveur pour supporter uniquement TLS 1.2+ avec des cipher suites modernes.",
      cvss: 9.1, cve: "CVE-2014-3566", affectedComponent: "Configuration TLS",
    });
    if (rng() > 0.4) vulns.push({
      id: "vuln-004", title: "X-Frame-Options non defini", severity: "medium", category: "Headers HTTP",
      description: "L'en-tete X-Frame-Options est absent, exposant le site aux attaques de clickjacking.",
      remediation: "Ajouter l'en-tete : X-Frame-Options: DENY (ou SAMEORIGIN si l'iframe est necessaire).",
      cvss: 4.3, affectedComponent: "Serveur HTTP",
    });
    if (rng() > 0.6) vulns.push({
      id: "vuln-005", title: "Exposition d'informations serveur", severity: "low", category: "Information Disclosure",
      description: "Le header Server expose la version du serveur web (Apache/2.4.41). Cela facilite la reconnaissance par un attaquant.",
      remediation: "Configurer le serveur pour masquer la version : ServerTokens Prod (Apache) ou server_tokens off (Nginx).",
      cvss: 3.1, affectedComponent: "Serveur HTTP",
    });
  }

  if (template === "full" || template === "infra") {
    if (rng() > 0.3) vulns.push({
      id: "vuln-006", title: "Port SSH (22) expose avec authentification par mot de passe", severity: "high", category: "Acces Reseau",
      description: "Le port SSH est ouvert et accepte l'authentification par mot de passe, exposant le serveur aux attaques brute-force.",
      remediation: "Desactiver l'authentification par mot de passe SSH. Utiliser uniquement les cles SSH. Configurer fail2ban.",
      cvss: 7.5, affectedComponent: "Service SSH",
    });
    if (rng() > 0.5) vulns.push({
      id: "vuln-007", title: "Port FTP (21) ouvert", severity: "critical", category: "Acces Reseau",
      description: "FTP transmet les identifiants en clair. Ce protocole est intrinsiquement non securise.",
      remediation: "Desactiver FTP. Migrer vers SFTP ou SCP pour les transferts de fichiers.",
      cvss: 8.2, affectedComponent: "Service FTP",
    });
    if (rng() > 0.4) vulns.push({
      id: "vuln-008", title: "Enregistrement DNS SPF manquant", severity: "medium", category: "DNS/Email",
      description: "Aucun enregistrement SPF n'est configure, permettant l'usurpation d'emails du domaine.",
      remediation: "Ajouter un enregistrement TXT SPF : v=spf1 include:_spf.google.com ~all (adapter selon le fournisseur email).",
      cvss: 5.8, affectedComponent: "Configuration DNS",
    });
  }

  if (template === "full" || template === "compliance") {
    if (rng() > 0.3) vulns.push({
      id: "vuln-009", title: "Non-conformite RGPD : absence de bandeau cookies", severity: "high", category: "Conformite",
      description: "Le site ne presente pas de bandeau de consentement pour les cookies conformement au RGPD.",
      remediation: "Implementer un bandeau de consentement conforme RGPD avec consentement explicite avant tout depot de cookie non essentiel.",
      cvss: 6.0, affectedComponent: "Interface utilisateur",
    });
    if (rng() > 0.5) vulns.push({
      id: "vuln-010", title: "Politique de mots de passe faible", severity: "medium", category: "Authentification",
      description: "La politique de mots de passe n'exige pas de longueur minimale de 12 caracteres (recommandation ANSSI).",
      remediation: "Appliquer une politique conforme ANSSI : minimum 12 caracteres, melange majuscules/minuscules/chiffres/speciaux.",
      cvss: 5.5, affectedComponent: "Systeme d'authentification",
    });
  }

  vulns.push({
    id: "vuln-info-001", title: "HSTS configure correctement", severity: "info", category: "Headers HTTP",
    description: "L'en-tete Strict-Transport-Security est present et correctement configure.",
    remediation: "Aucune action requise. Bonne pratique detectee.",
    affectedComponent: "Serveur HTTP",
  });

  const score = Math.max(0, 100 - vulns.filter(v => v.severity === "critical").length * 25
    - vulns.filter(v => v.severity === "high").length * 15
    - vulns.filter(v => v.severity === "medium").length * 8
    - vulns.filter(v => v.severity === "low").length * 3);

  return {
    target,
    scanDate: now.toISOString(),
    duration: Math.floor(30 + Math.random() * 120),
    score,
    vulnerabilities: vulns.sort((a, b) => {
      const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      return order[a.severity] - order[b.severity];
    }),
    tlsInfo: {
      version: rng() > 0.5 ? "TLS 1.3" : "TLS 1.2",
      cipher: "TLS_AES_256_GCM_SHA384",
      validFrom: "2025-01-15",
      validTo: "2026-01-15",
      issuer: "Let's Encrypt Authority X3",
      grade: rng() > 0.5 ? "A" : rng() > 0.3 ? "B" : "C",
    },
    headers: [
      { name: "Content-Security-Policy", present: rng() > 0.5, recommendation: "Definir une politique CSP stricte" },
      { name: "X-Frame-Options", present: rng() > 0.4, value: "DENY" },
      { name: "X-Content-Type-Options", present: rng() > 0.3, value: "nosniff" },
      { name: "Strict-Transport-Security", present: true, value: "max-age=31536000; includeSubDomains" },
      { name: "X-XSS-Protection", present: rng() > 0.5, value: "1; mode=block" },
      { name: "Referrer-Policy", present: rng() > 0.6, value: "strict-origin-when-cross-origin" },
      { name: "Permissions-Policy", present: rng() > 0.7, recommendation: "Restreindre les APIs navigateur" },
    ],
    ports: ([
      { port: 80, service: "HTTP", state: "open", risk: "low" as Severity },
      { port: 443, service: "HTTPS", state: "open", risk: "info" as Severity },
      { port: 22, service: "SSH", state: rng() > 0.5 ? "open" : "filtered", risk: (rng() > 0.5 ? "high" : "medium") as Severity },
      { port: 21, service: "FTP", state: rng() > 0.6 ? "open" : "closed", risk: "critical" as Severity },
      { port: 3306, service: "MySQL", state: rng() > 0.7 ? "open" : "filtered", risk: "critical" as Severity },
      { port: 8080, service: "HTTP-ALT", state: rng() > 0.5 ? "open" : "closed", risk: "medium" as Severity },
    ]).filter(p => p.state !== "closed"),
    dnsRecords: [
      { type: "A", value: `${Math.floor(rng()*255)}.${Math.floor(rng()*255)}.${Math.floor(rng()*255)}.${Math.floor(rng()*255)}` },
      { type: "AAAA", value: "2606:4700:3033::ac43:84c1" },
      { type: "MX", value: "mx1.mail.ovh.net" },
      { type: "TXT", value: rng() > 0.5 ? "v=spf1 include:_spf.google.com ~all" : "(absent)" },
      { type: "NS", value: "dns1.registrar-servers.com" },
    ],
  };
}

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
  const [activeTab, setActiveTab] = useState<"overview" | "vulns" | "headers" | "ports" | "dns" | "tls">("overview");
  const [history, setHistory] = useState<ScanResult[]>([]);

  const startScan = useCallback(() => {
    if (!target.trim()) return;
    setStatus("scanning");
    setProgress(0);
    setResult(null);
    setActiveTab("overview");

    let p = 0;
    const interval = setInterval(() => {
      p += Math.random() * 15 + 5;
      if (p >= 100) {
        p = 100;
        clearInterval(interval);
        const res = generateMockScan(target, template);
        setResult(res);
        setHistory(prev => [res, ...prev].slice(0, 10));
        setStatus("done");
      }
      setProgress(Math.min(p, 100));
    }, 400);
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
                  { id: "vulns", label: `VULNERABILITES (${result.vulnerabilities.length})`, icon: "⚠️" },
                  { id: "headers", label: "HEADERS HTTP", icon: "🌐" },
                  { id: "ports", label: "PORTS", icon: "🔌" },
                  { id: "tls", label: "TLS/SSL", icon: "🔒" },
                  { id: "dns", label: "DNS", icon: "📡" },
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
                            <span className={`text-[10px] font-bold ${result.tlsInfo?.grade === "A" ? "text-green-400" : result.tlsInfo?.grade === "B" ? "text-yellow-400" : "text-red-400"}`}>
                              Grade {result.tlsInfo?.grade}
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
                    <div className="px-4 py-2 bg-argos-panel/30 border-b border-argos-border/20">
                      <p className="text-[9px] text-argos-text-dim tracking-wider uppercase">Ports detectes</p>
                    </div>
                    <div className="divide-y divide-argos-border/10">
                      {result.ports.map(p => (
                        <div key={p.port} className="px-4 py-2.5 flex items-center gap-3">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${SEVERITY_BADGE[p.risk]}`}>{p.risk.toUpperCase()}</span>
                          <span className="text-sm font-bold w-16">{p.port}</span>
                          <span className="text-[10px] text-argos-text-dim flex-1">{p.service}</span>
                          <span className={`text-[10px] font-bold ${p.state === "open" ? "text-red-400" : "text-yellow-400"}`}>{p.state.toUpperCase()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === "tls" && result.tlsInfo && (
                  <div className="space-y-4">
                    <div className="bg-argos-surface border border-argos-border/20 rounded-lg p-4">
                      <div className="flex items-center gap-4 mb-4">
                        <div className={`w-16 h-16 rounded-lg flex items-center justify-center text-2xl font-bold ${
                          result.tlsInfo.grade === "A" ? "bg-green-500/10 text-green-400 border border-green-500/30"
                          : result.tlsInfo.grade === "B" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30"
                          : "bg-red-500/10 text-red-400 border border-red-500/30"
                        }`}>
                          {result.tlsInfo.grade}
                        </div>
                        <div>
                          <p className="text-sm font-bold">Certificat TLS/SSL</p>
                          <p className="text-[10px] text-argos-text-dim">Analyse du chiffrement et du certificat</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "Version TLS", value: result.tlsInfo.version },
                          { label: "Cipher Suite", value: result.tlsInfo.cipher },
                          { label: "Emetteur", value: result.tlsInfo.issuer },
                          { label: "Valide du", value: result.tlsInfo.validFrom },
                          { label: "Valide jusqu'au", value: result.tlsInfo.validTo },
                          { label: "Grade", value: result.tlsInfo.grade },
                        ].map(f => (
                          <div key={f.label} className="bg-argos-panel/30 rounded p-2">
                            <p className="text-[8px] text-argos-text-dim uppercase tracking-wider">{f.label}</p>
                            <p className="text-[10px] font-bold mt-0.5">{f.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "dns" && (
                  <div className="bg-argos-surface border border-argos-border/20 rounded-lg overflow-hidden">
                    <div className="px-4 py-2 bg-argos-panel/30 border-b border-argos-border/20">
                      <p className="text-[9px] text-argos-text-dim tracking-wider uppercase">Enregistrements DNS</p>
                    </div>
                    <div className="divide-y divide-argos-border/10">
                      {result.dnsRecords.map((d, i) => (
                        <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                          <span className="text-[10px] font-bold bg-argos-accent/10 text-argos-accent px-2 py-0.5 rounded w-12 text-center">{d.type}</span>
                          <span className="text-[10px] text-argos-text-dim flex-1 break-all">{d.value}</span>
                        </div>
                      ))}
                    </div>
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
