"use client";

import { DashboardStats } from "@/types";

interface StatsPanelProps {
  stats: DashboardStats | null;
}

function StatCard({ label, value, unit, color }: { label: string; value: string | number; unit?: string; color?: string }) {
  return (
    <div className="glass-panel p-3">
      <p className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-semibold font-mono ${color ?? "text-argos-accent"}`}>
          {value}
        </span>
        {unit && <span className="text-[10px] text-argos-text-dim font-mono">{unit}</span>}
      </div>
    </div>
  );
}

export default function StatsPanel({ stats }: StatsPanelProps) {
  if (!stats) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-panel p-3 h-16" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest mb-2">
        Statistiques temps reel
      </p>
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Aeronefs" value={stats.totalAircraft} color="text-argos-accent" />
        <StatCard label="En vol" value={stats.activeFlights} color="text-argos-success" />
        <StatCard label="Alt. moyenne" value={stats.avgAltitude.toLocaleString("fr-FR")} unit="m" />
        <StatCard label="Vit. moyenne" value={stats.avgSpeed.toLocaleString("fr-FR")} unit="km/h" />
      </div>
      <div className="glass-panel p-3">
        <p className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest mb-2">
          Pays detectes ({stats.countriesDetected.length})
        </p>
        <div className="flex flex-wrap gap-1">
          {stats.countriesDetected.slice(0, 15).map((c) => (
            <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-argos-bg border border-argos-border/30 text-argos-text-dim">
              {c}
            </span>
          ))}
          {stats.countriesDetected.length > 15 && (
            <span className="text-[10px] font-mono text-argos-text-dim">
              +{stats.countriesDetected.length - 15}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
