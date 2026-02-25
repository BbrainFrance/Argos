"use client";

import { Alert } from "@/types";

interface AlertsPanelProps {
  alerts: Alert[];
  onAcknowledge: (id: string) => void;
  onFocusEntity: (entityId: string) => void;
}

const TYPE_STYLE = {
  info: { bg: "bg-argos-accent/5", border: "border-argos-accent/20", text: "text-argos-accent", dot: "bg-argos-accent" },
  warning: { bg: "bg-argos-warning/5", border: "border-argos-warning/20", text: "text-argos-warning", dot: "bg-argos-warning" },
  danger: { bg: "bg-argos-danger/5", border: "border-argos-danger/20", text: "text-argos-danger", dot: "bg-argos-danger" },
  critical: { bg: "bg-red-900/20", border: "border-red-500/40", text: "text-red-400", dot: "bg-red-500" },
};

export default function AlertsPanel({ alerts, onAcknowledge, onFocusEntity }: AlertsPanelProps) {
  const unack = alerts.filter((a) => !a.acknowledged);
  const critical = unack.filter((a) => a.type === "critical");

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-1 h-3 rounded-full ${unack.length > 0 ? "bg-argos-danger animate-pulse" : "bg-argos-text-dim"}`} />
          <p className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest">
            Alertes
          </p>
        </div>
        {unack.length > 0 && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-argos-danger/20 text-argos-danger border border-argos-danger/30 tabular-nums">
            {unack.length}
          </span>
        )}
      </div>

      {critical.length > 0 && (
        <div className="mb-2 bg-red-900/20 border border-red-500/30 rounded p-2 animate-pulse-slow">
          <p className="text-[10px] font-mono text-red-400 font-bold">
            {critical.length} ALERTE{critical.length > 1 ? "S" : ""} CRITIQUE{critical.length > 1 ? "S" : ""}
          </p>
        </div>
      )}

      {unack.length === 0 ? (
        <div className="bg-argos-bg/60 border border-argos-border/30 rounded p-3 text-center">
          <p className="text-[10px] text-argos-text-dim font-mono">RAS — Surveillance active</p>
        </div>
      ) : (
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {unack.slice(0, 20).map((alert) => {
            const s = TYPE_STYLE[alert.type];
            return (
              <div
                key={alert.id}
                className={`${s.bg} border ${s.border} rounded p-2 transition-all hover:brightness-110 group`}
              >
                <div className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1 ${s.dot} ${alert.type === "critical" ? "animate-pulse" : ""}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-[10px] font-semibold font-mono ${s.text}`}>{alert.title}</p>
                    <p className="text-[9px] text-argos-text-dim mt-0.5 leading-relaxed">{alert.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[8px] text-argos-text-dim/50 font-mono">
                        {alert.timestamp.toLocaleTimeString("fr-FR")} — {alert.source.toUpperCase()}
                      </span>
                      <div className="flex-1" />
                      {alert.entityId && (
                        <button
                          onClick={() => onFocusEntity(alert.entityId!)}
                          className="text-[8px] font-mono text-argos-accent/70 hover:text-argos-accent opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          LOCALISER
                        </button>
                      )}
                      <button
                        onClick={() => onAcknowledge(alert.id)}
                        className="text-[8px] font-mono text-argos-text-dim/50 hover:text-argos-text opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ACK
                      </button>
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
