"use client";

import { MapViewState } from "@/types";
import { useSession, signOut } from "next-auth/react";

interface TopBarProps {
  viewState: MapViewState;
  onToggleView: () => void;
  entityCount: number;
  alertCount: number;
  analysisCount: number;
  lastUpdate: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "ADM",
  OPERATOR: "OPR",
  ANALYST: "ANL",
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "text-argos-danger",
  OPERATOR: "text-argos-warning",
  ANALYST: "text-argos-accent",
};

export default function TopBar({
  viewState,
  onToggleView,
  entityCount,
  alertCount,
  analysisCount,
  lastUpdate,
  refreshing,
  onRefresh,
}: TopBarProps) {
  const { data: session } = useSession();
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const role = session?.user?.role ?? "ANALYST";

  return (
    <header className="h-10 bg-argos-surface/80 backdrop-blur-sm border-b border-argos-border/30 flex items-center justify-between px-4">
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] font-mono text-argos-text-dim/50 uppercase tracking-widest">Zone</span>
          <span className="text-[10px] font-mono text-argos-accent tracking-wide">FRANCE METRO</span>
        </div>
        <div className="h-3 w-px bg-argos-border/30" />
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] font-mono text-argos-text-dim/50 uppercase tracking-widest">Entites</span>
          <span className="text-[10px] font-mono text-argos-accent font-semibold tabular-nums">{entityCount}</span>
        </div>
        <div className="h-3 w-px bg-argos-border/30" />
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] font-mono text-argos-text-dim/50 uppercase tracking-widest">Alertes</span>
          <span className={`text-[10px] font-mono font-semibold tabular-nums ${alertCount > 0 ? "text-argos-danger" : "text-argos-text-dim/50"}`}>
            {alertCount}
          </span>
        </div>
        <div className="h-3 w-px bg-argos-border/30" />
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] font-mono text-argos-text-dim/50 uppercase tracking-widest">Analyses</span>
          <span className={`text-[10px] font-mono font-semibold tabular-nums ${analysisCount > 0 ? "text-argos-warning" : "text-argos-text-dim/50"}`}>
            {analysisCount}
          </span>
        </div>
        {lastUpdate && (
          <>
            <div className="h-3 w-px bg-argos-border/30" />
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${refreshing ? "bg-argos-warning animate-pulse" : "bg-argos-success"}`} />
              <span className="text-[9px] font-mono text-argos-text-dim/60">
                {refreshing ? "ACQUISITION..." : formatTime(lastUpdate)}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {session?.user && (
          <>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-argos-panel/50 border border-argos-border/20">
              <div className="w-1.5 h-1.5 rounded-full bg-argos-success" />
              <span className="text-[9px] font-mono text-argos-text-dim/80">{session.user.name ?? session.user.email}</span>
              <span className={`text-[8px] font-mono font-semibold ${ROLE_COLORS[role]}`}>
                [{ROLE_LABELS[role] ?? role}]
              </span>
            </div>
            <button
              onClick={() => signOut()}
              className="text-[9px] font-mono px-2 py-1 rounded bg-argos-panel border border-argos-border/30 text-argos-text-dim/50 hover:text-argos-danger hover:border-argos-danger/30 transition-all"
              title="Deconnexion"
            >
              ⏻
            </button>
            <div className="h-3 w-px bg-argos-border/30" />
          </>
        )}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="text-[9px] font-mono px-2 py-1 rounded bg-argos-panel border border-argos-border/30 text-argos-text-dim hover:text-argos-accent hover:border-argos-accent/30 transition-all disabled:opacity-30"
        >
          ↻ MAJ
        </button>
        <button
          onClick={onToggleView}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-argos-panel border border-argos-border/30 hover:border-argos-accent/30 transition-all"
        >
          <span className="text-[8px] font-mono text-argos-text-dim/50 uppercase">Vue</span>
          <span className="text-[10px] font-mono text-argos-accent font-semibold">
            {viewState.mode === "3d" ? "GLOBE" : "CARTE"}
          </span>
        </button>
      </div>
    </header>
  );
}
