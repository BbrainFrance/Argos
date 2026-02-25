"use client";

import { MapViewState } from "@/types";

interface TopBarProps {
  viewState: MapViewState;
  onToggleView: () => void;
  aircraftCount: number;
  lastUpdate: string | null;
}

export default function TopBar({ viewState, onToggleView, aircraftCount, lastUpdate }: TopBarProps) {
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <header className="h-12 bg-argos-surface/90 backdrop-blur-sm border-b border-argos-border/50 flex items-center justify-between px-4">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest">Zone</span>
          <span className="text-xs font-mono text-argos-accent">FRANCE METROPOLITAINE</span>
        </div>
        <div className="h-4 w-px bg-argos-border/50" />
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest">Cibles</span>
          <span className="text-xs font-mono text-argos-accent font-semibold">{aircraftCount}</span>
        </div>
        {lastUpdate && (
          <>
            <div className="h-4 w-px bg-argos-border/50" />
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-argos-success animate-pulse" />
              <span className="text-[10px] font-mono text-argos-text-dim">
                MAJ {formatTime(lastUpdate)}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onToggleView}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-argos-panel border border-argos-border/50 hover:border-argos-accent/50 transition-all"
        >
          <span className="text-[10px] font-mono text-argos-text-dim uppercase">Vue</span>
          <span className="text-xs font-mono text-argos-accent font-semibold">
            {viewState.mode === "3d" ? "GLOBE 3D" : "CARTE 2D"}
          </span>
        </button>
      </div>
    </header>
  );
}
