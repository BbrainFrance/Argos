"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";

type Phase = "idle" | "bruteforce" | "flood" | "ramp" | "slowloris" | "done" | "error";

interface PhaseStats {
  sent: number;
  success: number;
  blocked: number;
  errors: number;
  timeouts: number;
  avgMs: number;
  p95Ms?: number;
  minMs?: number;
  maxMs?: number;
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

interface SlowlorisResult {
  totalConnections: number;
  keptAlive: number;
  serverCrashed: boolean;
  avgHoldTime: number;
}

interface StressReport {
  target: string;
  duration: number;
  bruteForce: BruteForceResult;
  flood: FloodResult[];
  ramp: RampStep[];
  slowloris: SlowlorisResult | null;
  breakpointReqPerSec: number | null;
  resilienceScore: number;
  recommendations: string[];
}

interface LogEntry {
  ts: number;
  phase: string;
  message: string;
  stats?: PhaseStats;
  reqPerSec?: number;
}

const INTENSITY_LABELS: Record<number, string> = {
  50: "LEGERE (50 req/s max)",
  200: "MOYENNE (200 req/s max)",
  500: "AGRESSIVE (500 req/s max)",
};

function ResilienceGauge({ score }: { score: number }) {
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : score >= 40 ? "#f97316" : "#ef4444";
  const label = score >= 80 ? "RESILIENT" : score >= 60 ? "MOYEN" : score >= 40 ? "FRAGILE" : "VULNERABLE";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" className="text-argos-border/20" strokeWidth="8" />
          <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="8" strokeDasharray={`${score * 2.51} 251`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold font-mono" style={{ color }}>{score}</span>
          <span className="text-[8px] font-mono text-argos-text-dim">/100</span>
        </div>
      </div>
      <span className="text-[11px] font-mono font-bold tracking-wider" style={{ color }}>{label}</span>
    </div>
  );
}

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[8px] font-mono">
        <span className="text-argos-text-dim">{label}</span>
        <span>{value}</span>
      </div>
      <div className="w-full h-1.5 bg-argos-panel rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function StressTestPage() {
  const [target, setTarget] = useState("");
  const [maxBruteForce, setMaxBruteForce] = useState(500);
  const [intensity, setIntensity] = useState(200);
  const [maxDuration, setMaxDuration] = useState(60);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [report, setReport] = useState<StressReport | null>(null);
  const [activeTab, setActiveTab] = useState<"live" | "bruteforce" | "flood" | "ramp" | "slowloris" | "report">("live");
  const abortRef = useRef<AbortController | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const startTest = useCallback(async () => {
    if (!target.trim()) return;
    setPhase("bruteforce");
    setProgress({});
    setLogs([]);
    setReport(null);
    setActiveTab("live");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/stress-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: target.trim(), maxBruteForce, intensity, maxDuration }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setPhase("error");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            const entry: LogEntry = {
              ts: Date.now(),
              phase: data.phase || "unknown",
              message: data.message || "",
              stats: data.stats,
              reqPerSec: data.reqPerSec,
            };
            setLogs(prev => [...prev, entry]);

            if (data.phase && data.progress !== undefined) {
              setProgress(prev => ({ ...prev, [data.phase]: data.progress }));
            }

            if (data.phase === "bruteforce" || data.phase === "flood" || data.phase === "ramp") {
              setPhase(data.phase as Phase);
            }

            if (data.phase === "done" && data.report) {
              setReport(data.report as StressReport);
              setPhase("done");
              setActiveTab("report");
            }

            if (data.phase === "error") {
              setPhase("error");
            }
          } catch { /* malformed SSE */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setPhase("error");
    }
  }, [target, maxBruteForce, intensity, maxDuration]);

  const stopTest = useCallback(() => {
    abortRef.current?.abort();
    setPhase("idle");
  }, []);

  const isRunning = phase !== "idle" && phase !== "done" && phase !== "error";
  const totalSent = logs.reduce((sum, l) => sum + (l.stats?.sent || 0), 0);
  const lastStats = logs.filter(l => l.stats).slice(-1)[0]?.stats;

  const exportReport = useCallback(() => {
    if (!report) return;
    const lines = [
      "═══════════════════════════════════════════════",
      "  ARGOS STRESS TEST — RAPPORT DE RESILIENCE",
      "═══════════════════════════════════════════════",
      "",
      `Cible: ${report.target}`,
      `Duree: ${report.duration}s`,
      `Score de resilience: ${report.resilienceScore}/100`,
      `Point de rupture: ${report.breakpointReqPerSec ? report.breakpointReqPerSec + " req/s" : "Non atteint"}`,
      "",
      "───── BRUTE FORCE ─────",
      `Login: ${report.bruteForce.loginUrl || "Non detecte"}`,
      `Tentatives: ${report.bruteForce.totalAttempts}`,
      `Blocage apres: ${report.bruteForce.attemptsBeforeBlock >= 0 ? report.bruteForce.attemptsBeforeBlock + " tentatives" : "Jamais"}`,
      `Defenses: ${report.bruteForce.defenses.join(", ") || "Aucune"}`,
      "",
      "───── FLOOD ─────",
      ...report.flood.map(f => `${f.endpoint}: avg ${f.stats.avgMs}ms, ${f.stats.success}/${f.stats.sent} OK${f.degradation ? " [DEGRADATION]" : ""}`),
      "",
      "───── MONTEE EN CHARGE ─────",
      ...report.ramp.map(r => `${r.reqPerSec} req/s: avg ${r.stats.avgMs}ms, ${r.stats.errors + r.stats.timeouts} erreurs`),
      "",
      "───── SLOWLORIS ─────",
      ...(report.slowloris ? [
        `Connexions: ${report.slowloris.totalConnections}`,
        `Keep-alive envoyes: ${report.slowloris.keptAlive}`,
        `Duree moyenne: ${report.slowloris.avgHoldTime}ms`,
        `Serveur: ${report.slowloris.serverCrashed ? "DEGRADE" : "OK"}`,
      ] : ["Non execute"]),
      "",
      "───── RECOMMANDATIONS ─────",
      ...report.recommendations.map((r, i) => `${i + 1}. ${r}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `argos-stress-${report.target.replace(/[^a-z0-9]/gi, "_")}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  return (
    <div className="min-h-screen bg-argos-bg text-argos-text font-mono">
      <header className="bg-argos-surface border-b border-argos-border/30 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-7 h-7 rounded bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center text-white font-bold text-xs">A</div>
            <span className="text-xs font-bold tracking-[0.2em]">ARGOS</span>
          </Link>
          <div className="w-px h-6 bg-argos-border/30" />
          <div className="flex items-center gap-2">
            <span className="text-lg">💣</span>
            <div>
              <h1 className="text-sm font-bold tracking-wider text-red-400">STRESS TEST — RESILIENCE</h1>
              <p className="text-[8px] text-argos-text-dim tracking-wider">BRUTE FORCE &mdash; CHARGE &mdash; POINT DE RUPTURE</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/cyber-audit" className="text-[10px] px-3 py-1.5 border border-argos-border/30 rounded hover:border-argos-accent/40 hover:text-argos-accent transition-all">
            AUDIT SECURITE
          </Link>
          <Link href="/" className="text-[10px] px-3 py-1.5 border border-argos-border/30 rounded hover:border-argos-accent/40 hover:text-argos-accent transition-all">
            ← CARTE
          </Link>
        </div>
      </header>

      <div className="flex h-[calc(100vh-56px)]">
        {/* Left panel — config */}
        <div className="w-80 bg-argos-surface border-r border-argos-border/30 flex flex-col">
          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            <div className="space-y-2">
              <label className="text-[9px] text-argos-text-dim tracking-wider uppercase">Cible (URL ou domaine)</label>
              <input
                type="text"
                value={target}
                onChange={e => setTarget(e.target.value)}
                placeholder="ex: mon-site.gouv.fr"
                disabled={isRunning}
                className="w-full bg-argos-panel border border-argos-border/30 rounded px-3 py-2 text-xs placeholder:text-argos-text-dim/30 focus:border-red-500/50 focus:outline-none transition-colors disabled:opacity-50"
                onKeyDown={e => e.key === "Enter" && startTest()}
              />
            </div>

            {/* Brute force count */}
            <div className="space-y-2">
              <label className="text-[9px] text-argos-text-dim tracking-wider uppercase">Tentatives brute force</label>
              <div className="flex gap-1.5">
                {[100, 500, 1000].map(n => (
                  <button
                    key={n}
                    onClick={() => setMaxBruteForce(n)}
                    disabled={isRunning}
                    className={`flex-1 py-1.5 text-[10px] rounded border transition-all ${
                      maxBruteForce === n ? "bg-red-500/15 border-red-500/40 text-red-400" : "border-argos-border/20 text-argos-text-dim hover:border-argos-border/40"
                    } disabled:opacity-50`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Intensity */}
            <div className="space-y-2">
              <label className="text-[9px] text-argos-text-dim tracking-wider uppercase">Intensite montee en charge</label>
              <div className="space-y-1.5">
                {[50, 200, 500].map(n => (
                  <button
                    key={n}
                    onClick={() => setIntensity(n)}
                    disabled={isRunning}
                    className={`w-full text-left px-3 py-1.5 text-[9px] rounded border transition-all ${
                      intensity === n ? "bg-red-500/15 border-red-500/40 text-red-400" : "border-argos-border/20 text-argos-text-dim hover:border-argos-border/40"
                    } disabled:opacity-50`}
                  >
                    {INTENSITY_LABELS[n]}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <label className="text-[9px] text-argos-text-dim tracking-wider uppercase">Duree max (secondes)</label>
              <div className="flex gap-1.5">
                {[30, 60, 120].map(n => (
                  <button
                    key={n}
                    onClick={() => setMaxDuration(n)}
                    disabled={isRunning}
                    className={`flex-1 py-1.5 text-[10px] rounded border transition-all ${
                      maxDuration === n ? "bg-red-500/15 border-red-500/40 text-red-400" : "border-argos-border/20 text-argos-text-dim hover:border-argos-border/40"
                    } disabled:opacity-50`}
                  >
                    {n}s
                  </button>
                ))}
              </div>
            </div>

            {/* Warning */}
            <div className="bg-red-500/5 border border-red-500/20 rounded p-3">
              <p className="text-[8px] text-red-400/80 leading-relaxed">
                Ce test envoie des milliers de requetes vers la cible. Ne l&apos;executez que sur des infrastructures dont vous etes responsable ou autorise a tester.
              </p>
            </div>

            {/* Launch / Stop */}
            {isRunning ? (
              <button onClick={stopTest} className="w-full py-2.5 rounded font-bold text-xs tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 cursor-pointer transition-all">
                ARRETER LE TEST
              </button>
            ) : (
              <button
                onClick={startTest}
                disabled={!target.trim()}
                className={`w-full py-2.5 rounded font-bold text-xs tracking-wider transition-all ${
                  target.trim()
                    ? "bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 hover:border-red-500/50 cursor-pointer"
                    : "bg-argos-panel text-argos-text-dim/30 cursor-not-allowed"
                }`}
              >
                LANCER LE STRESS TEST
              </button>
            )}

            {/* Phase progress */}
            {isRunning && (
              <div className="space-y-2 pt-2 border-t border-argos-border/20">
                {(["bruteforce", "flood", "ramp", "slowloris"] as const).map(p => (
                  <div key={p} className="space-y-1">
                    <div className="flex justify-between text-[8px] font-mono">
                      <span className={phase === p ? "text-red-400" : "text-argos-text-dim"}>{p === "bruteforce" ? "BRUTE FORCE" : p === "flood" ? "FLOOD" : p === "slowloris" ? "SLOWLORIS" : "MONTEE EN CHARGE"}</span>
                      <span>{progress[p] ?? 0}%</span>
                    </div>
                    <div className="w-full h-1 bg-argos-panel rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-300 ${phase === p ? "bg-red-500" : "bg-red-500/40"}`} style={{ width: `${progress[p] ?? 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Live stats */}
            {isRunning && lastStats && (
              <div className="space-y-2 pt-2 border-t border-argos-border/20">
                <p className="text-[8px] text-argos-text-dim tracking-wider uppercase">Stats temps reel</p>
                <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
                  <div className="bg-argos-panel/50 rounded p-2 text-center">
                    <p className="text-argos-text-dim text-[7px]">ENVOYEES</p>
                    <p className="text-lg text-argos-text font-bold">{lastStats.sent}</p>
                  </div>
                  <div className="bg-argos-panel/50 rounded p-2 text-center">
                    <p className="text-argos-text-dim text-[7px]">BLOQUEES</p>
                    <p className="text-lg text-orange-400 font-bold">{lastStats.blocked}</p>
                  </div>
                  <div className="bg-argos-panel/50 rounded p-2 text-center">
                    <p className="text-argos-text-dim text-[7px]">ERREURS</p>
                    <p className="text-lg text-red-400 font-bold">{lastStats.errors + lastStats.timeouts}</p>
                  </div>
                  <div className="bg-argos-panel/50 rounded p-2 text-center">
                    <p className="text-argos-text-dim text-[7px]">AVG MS</p>
                    <p className="text-lg text-cyan-400 font-bold">{lastStats.avgMs}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {phase === "idle" && !report && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center p-8">
              <div className="text-6xl">💣</div>
              <div>
                <h2 className="text-xl font-bold text-argos-text mb-2">Test de Resilience Infrastructure</h2>
                <p className="text-sm text-argos-text-dim max-w-lg leading-relaxed">
                  Evaluez la capacite de votre infrastructure a resister a une attaque coordonnee.
                  Brute force sur l&apos;authentification, flood des endpoints critiques, et montee en charge progressive
                  pour identifier le point de rupture.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4 max-w-lg">
                <div className="bg-argos-surface border border-argos-border/20 rounded-lg p-4 text-center">
                  <p className="text-2xl mb-2">🔐</p>
                  <p className="text-[10px] font-bold text-red-400">Phase 1</p>
                  <p className="text-[8px] text-argos-text-dim mt-1">Brute force login avec dictionnaire de {maxBruteForce} mots de passe</p>
                </div>
                <div className="bg-argos-surface border border-argos-border/20 rounded-lg p-4 text-center">
                  <p className="text-2xl mb-2">🌊</p>
                  <p className="text-[10px] font-bold text-orange-400">Phase 2</p>
                  <p className="text-[8px] text-argos-text-dim mt-1">Flood 50 requetes simultanees sur chaque endpoint</p>
                </div>
                <div className="bg-argos-surface border border-argos-border/20 rounded-lg p-4 text-center">
                  <p className="text-2xl mb-2">📈</p>
                  <p className="text-[10px] font-bold text-yellow-400">Phase 3</p>
                  <p className="text-[8px] text-argos-text-dim mt-1">Montee en charge 10 a {intensity} req/s</p>
                </div>
              </div>
            </div>
          )}

          {(isRunning || report) && (
            <>
              {/* Tabs */}
              <div className="flex items-center border-b border-argos-border/30 bg-argos-surface">
                {([
                  { id: "live" as const, label: "LOGS EN DIRECT", icon: "📡" },
                  ...(report ? [
                    { id: "bruteforce" as const, label: "BRUTE FORCE", icon: "🔐" },
                    { id: "flood" as const, label: "FLOOD", icon: "🌊" },
                    { id: "ramp" as const, label: "MONTEE EN CHARGE", icon: "📈" },
                    { id: "slowloris" as const, label: "SLOWLORIS", icon: "🐌" },
                    { id: "report" as const, label: "RAPPORT", icon: "📄" },
                  ] : []),
                ]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] tracking-wider border-b-2 transition-all ${
                      activeTab === tab.id
                        ? "border-red-500 text-red-400"
                        : "border-transparent text-argos-text-dim hover:text-argos-text hover:border-argos-border/30"
                    }`}
                  >
                    <span className="text-xs">{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
                {report && (
                  <>
                    <div className="flex-1" />
                    <button onClick={exportReport} className="mr-4 text-[9px] px-3 py-1.5 border border-argos-border/30 rounded hover:border-red-500/40 hover:text-red-400 transition-all">
                      EXPORTER RAPPORT
                    </button>
                  </>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {/* Live logs */}
                {activeTab === "live" && (
                  <div className="bg-black/40 rounded-lg border border-argos-border/20 p-4 font-mono text-[9px] max-h-[calc(100vh-160px)] overflow-y-auto">
                    {logs.map((log, i) => (
                      <div key={i} className="flex gap-3 py-0.5">
                        <span className="text-argos-text-dim w-20 flex-shrink-0">{new Date(log.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                        <span className={`w-16 flex-shrink-0 uppercase ${
                          log.phase === "bruteforce" ? "text-red-400" :
                          log.phase === "flood" ? "text-orange-400" :
                          log.phase === "ramp" ? "text-yellow-400" :
                          log.phase === "done" ? "text-green-400" :
                          log.phase === "error" ? "text-red-500" : "text-cyan-400"
                        }`}>{log.phase}</span>
                        <span className="text-argos-text">{log.message}</span>
                      </div>
                    ))}
                    <div ref={logEndRef} />
                    {isRunning && <span className="animate-pulse text-red-400">_</span>}
                  </div>
                )}

                {/* Brute force tab */}
                {activeTab === "bruteforce" && report && (
                  <div className="space-y-4">
                    <div className="bg-argos-surface border border-argos-border/20 rounded-lg p-5">
                      <h3 className="text-sm font-bold text-red-400 mb-4">Phase 1 — Brute Force Authentification</h3>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-argos-text-dim">Login detecte</span>
                            <span className={report.bruteForce.loginUrl ? "text-red-400" : "text-argos-text-dim"}>{report.bruteForce.loginUrl || "Non"}</span>
                          </div>
                          <div className="flex justify-between text-[10px]">
                            <span className="text-argos-text-dim">Total tentatives</span>
                            <span className="text-argos-text font-bold">{report.bruteForce.totalAttempts}</span>
                          </div>
                          <div className="flex justify-between text-[10px]">
                            <span className="text-argos-text-dim">Blocage apres</span>
                            <span className={report.bruteForce.attemptsBeforeBlock >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                              {report.bruteForce.attemptsBeforeBlock >= 0 ? `${report.bruteForce.attemptsBeforeBlock} tentatives` : "JAMAIS"}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <StatBar label="Succes" value={report.bruteForce.stats.success} max={report.bruteForce.stats.sent} color="#10b981" />
                          <StatBar label="Bloquees" value={report.bruteForce.stats.blocked} max={report.bruteForce.stats.sent} color="#f59e0b" />
                          <StatBar label="Erreurs" value={report.bruteForce.stats.errors + report.bruteForce.stats.timeouts} max={report.bruteForce.stats.sent} color="#ef4444" />
                        </div>
                      </div>
                      {report.bruteForce.defenses.length > 0 && (
                        <div className="border-t border-argos-border/20 pt-3">
                          <p className="text-[9px] text-argos-text-dim tracking-wider uppercase mb-2">Defenses detectees</p>
                          <div className="flex flex-wrap gap-1.5">
                            {report.bruteForce.defenses.map((d, i) => (
                              <span key={i} className="text-[9px] px-2 py-1 bg-green-500/10 text-green-400 border border-green-500/30 rounded">{d}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {report.bruteForce.defenses.length === 0 && report.bruteForce.loginUrl && (
                        <div className="border-t border-argos-border/20 pt-3">
                          <p className="text-[9px] text-red-400 font-bold">AUCUNE DEFENSE DETECTEE — Le formulaire de connexion est vulnerable au brute force</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Flood tab */}
                {activeTab === "flood" && report && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-orange-400 mb-2">Phase 2 — Flood Endpoints (50 requetes simultanees)</h3>
                    {report.flood.map((f, i) => (
                      <div key={i} className={`bg-argos-surface border rounded-lg p-4 ${f.degradation ? "border-red-500/30" : "border-argos-border/20"}`}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[11px] font-bold">{f.endpoint}</span>
                          <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${f.degradation ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>
                            {f.degradation ? "DEGRADATION" : "STABLE"}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-3 text-[9px] font-mono">
                          <div className="text-center">
                            <p className="text-argos-text-dim text-[7px]">AVG</p>
                            <p className="text-lg font-bold">{f.stats.avgMs}<span className="text-[8px] text-argos-text-dim">ms</span></p>
                          </div>
                          <div className="text-center">
                            <p className="text-argos-text-dim text-[7px]">P95</p>
                            <p className="text-lg font-bold">{f.stats.p95Ms}<span className="text-[8px] text-argos-text-dim">ms</span></p>
                          </div>
                          <div className="text-center">
                            <p className="text-argos-text-dim text-[7px]">SUCCES</p>
                            <p className="text-lg font-bold text-green-400">{f.stats.success}/{f.stats.sent}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-argos-text-dim text-[7px]">ERREURS</p>
                            <p className="text-lg font-bold text-red-400">{f.stats.errors + f.stats.timeouts}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Ramp tab */}
                {activeTab === "ramp" && report && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-yellow-400 mb-2">Phase 3 — Montee en charge progressive</h3>
                    {report.breakpointReqPerSec && (
                      <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 mb-4">
                        <p className="text-sm font-bold text-red-400">Point de rupture: {report.breakpointReqPerSec} req/s</p>
                        <p className="text-[9px] text-argos-text-dim mt-1">L&apos;infrastructure commence a faillir a ce niveau de charge</p>
                      </div>
                    )}
                    {/* Chart-like visualization */}
                    <div className="bg-argos-surface border border-argos-border/20 rounded-lg p-4">
                      <div className="flex items-end gap-1 h-40">
                        {report.ramp.map((step, i) => {
                          const maxAvg = Math.max(...report.ramp.map(s => s.stats.avgMs), 1);
                          const h = Math.max((step.stats.avgMs / maxAvg) * 100, 4);
                          const errorRate = (step.stats.errors + step.stats.timeouts) / Math.max(step.stats.sent, 1);
                          const color = errorRate > 0.5 ? "#ef4444" : errorRate > 0.2 ? "#f59e0b" : "#10b981";
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${step.reqPerSec} req/s — avg ${step.stats.avgMs}ms`}>
                              <span className="text-[7px] text-argos-text-dim">{step.stats.avgMs}ms</span>
                              <div className="w-full rounded-t" style={{ height: `${h}%`, backgroundColor: color, minHeight: "4px" }} />
                              <span className="text-[7px] text-argos-text-dim">{step.reqPerSec}</span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[8px] text-argos-text-dim text-center mt-2">Requetes/seconde → Temps de reponse moyen (ms)</p>
                    </div>
                    {/* Table */}
                    <div className="bg-argos-surface border border-argos-border/20 rounded-lg overflow-hidden">
                      <div className="grid grid-cols-6 gap-0 text-[8px] text-argos-text-dim tracking-wider uppercase bg-argos-panel/30 px-4 py-2 border-b border-argos-border/20">
                        <span>REQ/S</span><span>AVG MS</span><span>P95 MS</span><span>SUCCES</span><span>ERREURS</span><span>BLOQUE</span>
                      </div>
                      {report.ramp.map((step, i) => (
                        <div key={i} className={`grid grid-cols-6 gap-0 text-[10px] px-4 py-2 border-b border-argos-border/10 ${
                          report.breakpointReqPerSec === step.reqPerSec ? "bg-red-500/5" : ""
                        }`}>
                          <span className="font-bold">{step.reqPerSec}</span>
                          <span>{step.stats.avgMs}</span>
                          <span>{step.stats.p95Ms}</span>
                          <span className="text-green-400">{step.stats.success}</span>
                          <span className="text-red-400">{step.stats.errors + step.stats.timeouts}</span>
                          <span className="text-orange-400">{step.stats.blocked}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Slowloris tab */}
                {activeTab === "slowloris" && report && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-purple-400 mb-2">Phase 4 — Slowloris (connexions lentes)</h3>
                    <p className="text-[9px] text-argos-text-dim leading-relaxed">
                      Le test Slowloris ouvre des connexions HTTP partielles vers le serveur et les maintient ouvertes le plus longtemps possible,
                      sans jamais terminer la requete. L&apos;objectif est d&apos;epuiser le pool de connexions du serveur.
                    </p>
                    {report.slowloris ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-4 gap-3">
                          <div className="bg-argos-surface border border-argos-border/20 rounded-lg p-3 text-center">
                            <p className="text-lg font-bold text-purple-400">{report.slowloris.totalConnections}</p>
                            <p className="text-[8px] text-argos-text-dim">CONNEXIONS</p>
                          </div>
                          <div className="bg-argos-surface border border-argos-border/20 rounded-lg p-3 text-center">
                            <p className="text-lg font-bold text-purple-400">{report.slowloris.keptAlive}</p>
                            <p className="text-[8px] text-argos-text-dim">KEEP-ALIVE</p>
                          </div>
                          <div className="bg-argos-surface border border-argos-border/20 rounded-lg p-3 text-center">
                            <p className="text-lg font-bold text-purple-400">{report.slowloris.avgHoldTime}ms</p>
                            <p className="text-[8px] text-argos-text-dim">DUREE MOY.</p>
                          </div>
                          <div className={`bg-argos-surface border rounded-lg p-3 text-center ${report.slowloris.serverCrashed ? "border-red-500/30" : "border-green-500/30"}`}>
                            <p className={`text-lg font-bold ${report.slowloris.serverCrashed ? "text-red-400" : "text-green-400"}`}>
                              {report.slowloris.serverCrashed ? "DEGRADE" : "OK"}
                            </p>
                            <p className="text-[8px] text-argos-text-dim">SERVEUR</p>
                          </div>
                        </div>
                        <div className={`p-3 rounded border ${report.slowloris.serverCrashed ? "border-red-500/30 bg-red-500/5" : "border-green-500/30 bg-green-500/5"}`}>
                          <p className={`text-[10px] font-bold ${report.slowloris.serverCrashed ? "text-red-400" : "text-green-400"}`}>
                            {report.slowloris.serverCrashed
                              ? `Le serveur a montre des signes de degradation apres ${report.slowloris.totalConnections} connexions lentes. Vulnerable au Slowloris.`
                              : `Le serveur a resiste a ${report.slowloris.totalConnections} connexions lentes sans degradation. Protection anti-Slowloris en place.`}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-argos-surface border border-argos-border/20 rounded-lg p-6 text-center">
                        <p className="text-argos-text-dim text-sm">Test Slowloris non execute</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Report tab */}
                {activeTab === "report" && report && (
                  <div className="space-y-6">
                    <div className="flex items-start gap-8">
                      <ResilienceGauge score={report.resilienceScore} />
                      <div className="flex-1 space-y-3">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-argos-surface border border-argos-border/20 rounded-lg p-3 text-center">
                            <p className="text-[8px] text-argos-text-dim tracking-wider">DUREE</p>
                            <p className="text-lg font-bold">{report.duration}s</p>
                          </div>
                          <div className="bg-argos-surface border border-argos-border/20 rounded-lg p-3 text-center">
                            <p className="text-[8px] text-argos-text-dim tracking-wider">POINT DE RUPTURE</p>
                            <p className={`text-lg font-bold ${report.breakpointReqPerSec ? "text-red-400" : "text-green-400"}`}>
                              {report.breakpointReqPerSec ? `${report.breakpointReqPerSec} req/s` : "N/A"}
                            </p>
                          </div>
                          <div className="bg-argos-surface border border-argos-border/20 rounded-lg p-3 text-center">
                            <p className="text-[8px] text-argos-text-dim tracking-wider">BRUTE FORCE</p>
                            <p className={`text-lg font-bold ${report.bruteForce.attemptsBeforeBlock >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {report.bruteForce.attemptsBeforeBlock >= 0 ? "Protege" : "Vulnerable"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-argos-surface border border-argos-border/20 rounded-lg p-5">
                      <h3 className="text-sm font-bold mb-4">Recommandations</h3>
                      <div className="space-y-3">
                        {report.recommendations.map((rec, i) => (
                          <div key={i} className="flex gap-3 p-3 bg-argos-panel/30 rounded">
                            <span className={`text-sm flex-shrink-0 ${rec.startsWith("CRITIQUE") ? "text-red-400" : "text-yellow-400"}`}>
                              {rec.startsWith("CRITIQUE") ? "🔴" : rec.includes("Aucun point de rupture") || rec.includes("bonne resilience") ? "🟢" : "🟡"}
                            </span>
                            <p className="text-[10px] leading-relaxed">{rec}</p>
                          </div>
                        ))}
                      </div>
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
