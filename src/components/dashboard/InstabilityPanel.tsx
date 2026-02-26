"use client";

import type { CountryInstabilityScore } from "@/lib/country-instability";

interface InstabilityPanelProps {
  scores: CountryInstabilityScore[];
}

const LEVEL_COLORS: Record<string, string> = {
  CHAOS: "text-red-500 bg-red-500/10 border-red-500/30",
  CRITIQUE: "text-red-400 bg-red-400/10 border-red-400/20",
  INSTABLE: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  ATTENTION: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  STABLE: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
};

export default function InstabilityPanel({ scores }: InstabilityPanelProps) {
  if (scores.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1 h-3 bg-orange-500 rounded-full" />
        <p className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest">
          Index Instabilite (CII)
        </p>
      </div>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {scores.slice(0, 15).map((s) => (
          <div
            key={s.countryCode}
            className="flex items-center gap-2 px-2 py-1 rounded border border-argos-border/10"
          >
            <span className="text-[10px] font-mono text-argos-text w-16 truncate font-bold">
              {s.countryCode}
            </span>
            <div className="flex-1 h-1.5 bg-argos-bg rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${s.score}%`,
                  backgroundColor:
                    s.score >= 80 ? "#ef4444" : s.score >= 60 ? "#f97316" : s.score >= 40 ? "#eab308" : s.score >= 20 ? "#3b82f6" : "#22c55e",
                }}
              />
            </div>
            <span className="text-[9px] font-mono text-argos-text-dim w-8 text-right">
              {s.score.toFixed(0)}
            </span>
            <span
              className={`text-[7px] font-mono px-1.5 py-0.5 rounded border ${LEVEL_COLORS[s.level] ?? "text-slate-400"}`}
            >
              {s.level}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
