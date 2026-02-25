"use client";

import { DashboardStats } from "@/types";

interface StatsPanelProps {
  stats: DashboardStats;
}

function StatCard({ label, value, unit, color }: { label: string; value: string | number; unit?: string; color?: string }) {
  return (
    <div className="bg-argos-bg/60 border border-argos-border/30 rounded px-2.5 py-2">
      <p className="text-[9px] font-mono text-argos-text-dim uppercase tracking-widest">{label}</p>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className={`text-lg font-semibold font-mono tabular-nums ${color ?? "text-argos-accent"}`}>
          {typeof value === "number" ? value.toLocaleString("fr-FR") : value}
        </span>
        {unit && <span className="text-[9px] text-argos-text-dim font-mono">{unit}</span>}
      </div>
    </div>
  );
}

export default function StatsPanel({ stats }: StatsPanelProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1 h-3 bg-argos-accent rounded-full" />
        <p className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest">Situation</p>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <StatCard label="Aeronefs" value={stats.totalAircraft} color="text-argos-accent" />
        <StatCard label="En vol" value={stats.activeFlights} color="text-argos-success" />
        <StatCard label="Alt. moy." value={stats.avgAltitude} unit="m" />
        <StatCard label="Vit. moy." value={stats.avgSpeed} unit="km/h" />
        <StatCard label="Alertes" value={stats.activeAlerts} color={stats.activeAlerts > 0 ? "text-argos-danger" : "text-argos-text-dim"} />
        <StatCard label="Suivis" value={stats.trackedEntities} color="text-argos-warning" />
      </div>
      {stats.countriesDetected.length > 0 && (
        <div className="mt-2 bg-argos-bg/60 border border-argos-border/30 rounded px-2.5 py-2">
          <p className="text-[9px] font-mono text-argos-text-dim uppercase tracking-widest mb-1.5">
            Pays ({stats.countriesDetected.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {stats.countriesDetected.slice(0, 20).map((c) => (
              <span key={c} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-argos-panel border border-argos-border/20 text-argos-text-dim">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
