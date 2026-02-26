"use client";

import { useState, useCallback } from "react";
import { DashboardStats, Alert, AnalysisResult, Entity } from "@/types";

interface AIPanelProps {
  stats: DashboardStats;
  alerts: Alert[];
  analyses: AnalysisResult[];
  selectedEntity: Entity | null;
}

export default function AIPanel({ stats, alerts, analyses, selectedEntity }: AIPanelProps) {
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastType, setLastType] = useState<string | null>(null);

  const query = useCallback(async (type: string, payload: Record<string, unknown>) => {
    setLoading(true);
    setLastType(type);
    setResponse(null);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...payload }),
      });
      const data = await res.json();
      setResponse(data.response ?? data.error ?? "Erreur inconnue");
    } catch {
      setResponse("[ERREUR] Impossible de contacter le module IA");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSituation = () => {
    query("situation", {
      stats,
      alerts: alerts.filter((a) => !a.acknowledged).slice(0, 10).map((a) => ({
        title: a.title,
        message: a.message,
        category: a.category,
        type: a.type,
      })),
      analyses: analyses.slice(0, 10).map((a) => ({
        title: a.title,
        description: a.description,
        severity: a.severity,
      })),
    });
  };

  const handleEntity = () => {
    if (!selectedEntity) return;
    query("entity", { entity: selectedEntity });
  };

  return (
    <div className="glass-panel p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
          <h3 className="text-[10px] font-mono text-argos-accent tracking-widest uppercase">ARGOS-IA</h3>
        </div>
        <span className="text-[8px] font-mono text-argos-text-dim/40">MISTRAL LARGE</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSituation}
          disabled={loading}
          className="flex-1 py-1.5 text-[9px] font-mono uppercase tracking-wider rounded bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 hover:border-violet-500/50 transition-all disabled:opacity-40"
        >
          Brief Situation
        </button>
        <button
          onClick={handleEntity}
          disabled={loading || !selectedEntity}
          className="flex-1 py-1.5 text-[9px] font-mono uppercase tracking-wider rounded bg-argos-accent/10 border border-argos-accent/30 text-argos-accent hover:bg-argos-accent/20 hover:border-argos-accent/50 transition-all disabled:opacity-40"
        >
          Analyser Entite
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-6 gap-2">
          <div className="w-4 h-4 border border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
          <span className="text-[9px] font-mono text-violet-400 animate-pulse">
            {lastType === "situation" ? "GENERATION BRIEF..." : "ANALYSE EN COURS..."}
          </span>
        </div>
      )}

      {response && !loading && (
        <div className="mt-2 p-3 bg-argos-bg/60 border border-argos-border/30 rounded max-h-80 overflow-y-auto">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-argos-border/20">
            <div className="w-1 h-1 rounded-full bg-violet-500" />
            <span className="text-[8px] font-mono text-violet-400 uppercase tracking-widest">
              {lastType === "situation" ? "Brief de Situation" : lastType === "entity" ? "Analyse Entite" : "Reponse IA"}
            </span>
          </div>
          <div className="text-[10px] font-mono text-argos-text/90 leading-relaxed whitespace-pre-wrap">
            {response}
          </div>
        </div>
      )}

      {!response && !loading && (
        <div className="py-4 text-center">
          <p className="text-[9px] font-mono text-argos-text-dim/40">
            Module IA pret. Selectionnez une action.
          </p>
        </div>
      )}
    </div>
  );
}
