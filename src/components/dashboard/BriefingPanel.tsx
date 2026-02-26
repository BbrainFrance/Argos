"use client";

import { useState } from "react";

interface BriefingPanelProps {
  onRequestBriefing: () => void;
  briefing: string | null;
  provider: string | null;
  loading: boolean;
}

export default function BriefingPanel({ onRequestBriefing, briefing, provider, loading }: BriefingPanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3 bg-blue-500 rounded-full" />
          <p className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest">
            Briefing IA
          </p>
        </div>
        <button
          onClick={onRequestBriefing}
          disabled={loading}
          className="px-2 py-1 text-[8px] font-mono uppercase tracking-wider rounded border border-argos-accent/30 text-argos-accent hover:bg-argos-accent/10 transition-all disabled:opacity-30"
        >
          {loading ? "Generation..." : "Generer Brief"}
        </button>
      </div>

      {briefing && (
        <div className="relative">
          <div
            className={`px-2 py-1.5 rounded bg-blue-500/5 border border-blue-500/10 text-[9px] font-mono text-argos-text leading-relaxed whitespace-pre-wrap overflow-hidden transition-all ${
              expanded ? "max-h-[600px]" : "max-h-32"
            }`}
          >
            {briefing}
          </div>
          <div className="flex items-center justify-between mt-1">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[8px] font-mono text-argos-accent/70 hover:text-argos-accent"
            >
              {expanded ? "Reduire" : "Voir plus"}
            </button>
            {provider && (
              <span className="text-[7px] font-mono text-argos-text-dim/40 uppercase">
                via {provider}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
