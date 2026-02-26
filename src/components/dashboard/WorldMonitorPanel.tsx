"use client";

import { ConflictEvent, FireHotspot, NaturalDisaster, InternetOutage } from "@/types";

interface WorldMonitorPanelProps {
  conflicts: ConflictEvent[];
  fires: FireHotspot[];
  disasters: NaturalDisaster[];
  outages: InternetOutage[];
}

const SEV_COLORS: Record<string, string> = {
  red: "text-red-400",
  orange: "text-orange-400",
  green: "text-emerald-400",
  major: "text-red-400",
  moderate: "text-orange-400",
  minor: "text-slate-400",
};

export default function WorldMonitorPanel({ conflicts, fires, disasters, outages }: WorldMonitorPanelProps) {
  const totalEvents = conflicts.length + fires.length + disasters.length + outages.length;
  if (totalEvents === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1 h-3 bg-red-500 rounded-full" />
        <p className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest">
          World Monitor ({totalEvents})
        </p>
      </div>

      <div className="space-y-2">
        {conflicts.length > 0 && (
          <div className="px-2 py-1.5 rounded bg-red-500/5 border border-red-500/10">
            <p className="text-[9px] font-mono text-red-400 uppercase tracking-wider mb-1">
              Conflits — {conflicts.length} evenements
            </p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(
                conflicts.reduce<Record<string, number>>((acc, e) => {
                  acc[e.country] = (acc[e.country] || 0) + 1;
                  return acc;
                }, {})
              )
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([country, count]) => (
                  <span
                    key={country}
                    className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-red-500/10 text-red-300"
                  >
                    {country}: {count}
                  </span>
                ))}
            </div>
          </div>
        )}

        {disasters.length > 0 && (
          <div className="px-2 py-1.5 rounded bg-cyan-500/5 border border-cyan-500/10">
            <p className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider mb-1">
              Catastrophes — {disasters.length}
            </p>
            <div className="space-y-0.5">
              {disasters.slice(0, 4).map((d) => (
                <div key={d.id} className="flex items-center gap-1.5">
                  <span className={`text-[8px] font-mono font-bold ${SEV_COLORS[d.severity] ?? "text-slate-400"}`}>
                    {d.severity.toUpperCase()}
                  </span>
                  <span className="text-[8px] font-mono text-argos-text truncate">{d.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {fires.length > 0 && (
          <div className="px-2 py-1.5 rounded bg-orange-500/5 border border-orange-500/10">
            <p className="text-[9px] font-mono text-orange-400 uppercase tracking-wider">
              Feux detectes — {fires.length} hotspots
            </p>
          </div>
        )}

        {outages.length > 0 && (
          <div className="px-2 py-1.5 rounded bg-rose-500/5 border border-rose-500/10">
            <p className="text-[9px] font-mono text-rose-400 uppercase tracking-wider mb-1">
              Pannes Internet — {outages.length}
            </p>
            <div className="space-y-0.5">
              {outages.slice(0, 3).map((o) => (
                <div key={o.id} className="flex items-center gap-1.5">
                  <span className={`text-[8px] font-mono font-bold ${SEV_COLORS[o.severity] ?? "text-slate-400"}`}>
                    {o.severity.toUpperCase()}
                  </span>
                  <span className="text-[8px] font-mono text-argos-text truncate">
                    {o.country}{o.asName ? ` — ${o.asName}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
