"use client";

import { Alert } from "@/types";

interface AlertsPanelProps {
  alerts: Alert[];
}

const TYPE_CONFIG = {
  info: { bg: "bg-argos-accent/10", border: "border-argos-accent/30", text: "text-argos-accent", icon: "ℹ" },
  warning: { bg: "bg-argos-warning/10", border: "border-argos-warning/30", text: "text-argos-warning", icon: "⚠" },
  danger: { bg: "bg-argos-danger/10", border: "border-argos-danger/30", text: "text-argos-danger", icon: "🔴" },
};

export default function AlertsPanel({ alerts }: AlertsPanelProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest">
          Alertes
        </p>
        {alerts.length > 0 && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-argos-danger/20 text-argos-danger border border-argos-danger/30">
            {alerts.length}
          </span>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="glass-panel p-4 text-center">
          <p className="text-xs text-argos-text-dim font-mono">Aucune alerte active</p>
          <p className="text-[10px] text-argos-text-dim/50 font-mono mt-1">Surveillance en cours...</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {alerts.map((alert) => {
            const cfg = TYPE_CONFIG[alert.type];
            return (
              <div
                key={alert.id}
                className={`${cfg.bg} border ${cfg.border} rounded-lg p-2.5 transition-all hover:brightness-110`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm mt-0.5">{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold ${cfg.text}`}>{alert.title}</p>
                    <p className="text-[10px] text-argos-text-dim mt-0.5 leading-relaxed">
                      {alert.message}
                    </p>
                    <p className="text-[9px] text-argos-text-dim/50 font-mono mt-1">
                      {alert.timestamp.toLocaleTimeString("fr-FR")} — {alert.source.toUpperCase()}
                    </p>
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
