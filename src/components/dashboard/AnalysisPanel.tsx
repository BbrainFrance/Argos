"use client";

import { AnalysisResult } from "@/types";

interface AnalysisPanelProps {
  results: AnalysisResult[];
  onFocusEntity: (entityId: string) => void;
}

const SEV_STYLE = {
  critical: { bg: "bg-red-900/20", border: "border-red-500/30", text: "text-red-400", bar: "bg-red-500" },
  high: { bg: "bg-argos-danger/10", border: "border-argos-danger/20", text: "text-argos-danger", bar: "bg-argos-danger" },
  medium: { bg: "bg-argos-warning/10", border: "border-argos-warning/20", text: "text-argos-warning", bar: "bg-argos-warning" },
  low: { bg: "bg-argos-accent/5", border: "border-argos-accent/20", text: "text-argos-accent", bar: "bg-argos-accent" },
};

export default function AnalysisPanel({ results, onFocusEntity }: AnalysisPanelProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1 h-3 bg-argos-warning rounded-full" />
        <p className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest">
          Analyse IA
        </p>
        {results.length > 0 && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-argos-warning/20 text-argos-warning border border-argos-warning/30 tabular-nums">
            {results.length}
          </span>
        )}
      </div>

      {results.length === 0 ? (
        <div className="bg-argos-bg/60 border border-argos-border/30 rounded p-3 text-center">
          <p className="text-[10px] text-argos-text-dim font-mono">Analyse en cours...</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {results.map((r) => {
            const s = SEV_STYLE[r.severity];
            return (
              <div key={r.id} className={`${s.bg} border ${s.border} rounded p-2 group`}>
                <div className="flex items-start gap-2">
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${s.bar}`} />
                    <div className="w-px h-4 bg-argos-border/30" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-[10px] font-semibold font-mono ${s.text}`}>{r.title}</p>
                      <span className="text-[8px] font-mono text-argos-text-dim/50 px-1 rounded bg-argos-bg/50">
                        {(r.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-[9px] text-argos-text-dim mt-0.5 leading-relaxed">{r.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[8px] font-mono text-argos-text-dim/40 uppercase">{r.type}</span>
                      {r.entities.length > 0 && (
                        <button
                          onClick={() => onFocusEntity(r.entities[0])}
                          className="text-[8px] font-mono text-argos-accent/60 hover:text-argos-accent opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          LOCALISER
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
