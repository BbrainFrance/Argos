"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  details: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
}

const SEVERITY_STYLES: Record<string, { dot: string; bg: string }> = {
  INFO: { dot: "bg-blue-400", bg: "hover:bg-blue-500/5" },
  WARNING: { dot: "bg-amber-400", bg: "hover:bg-amber-500/5" },
  CRITICAL: { dot: "bg-red-400", bg: "hover:bg-red-500/5" },
};

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Connexion",
  LOGOUT: "Deconnexion",
  VIEW_ENTITY: "Consultation entite",
  TRACK_ENTITY: "Suivi entite",
  FLAG_ENTITY: "Signalement entite",
  CREATE_ZONE: "Creation zone",
  DELETE_ZONE: "Suppression zone",
  PLACE_MARKER: "Placement marqueur",
  DELETE_MARKER: "Suppression marqueur",
  CREATE_LINK: "Creation lien",
  DELETE_LINK: "Suppression lien",
  CREATE_MISSION: "Creation mission",
  EXPORT_PDF: "Export PDF",
  GENERATE_BRIEFING: "Generation briefing IA",
  AI_QUERY: "Requete IA",
  CHANGE_CLASSIFICATION: "Changement classification",
  ENCRYPT_DATA: "Chiffrement donnees",
  DECRYPT_DATA: "Dechiffrement donnees",
  ACTIVATE_LAYER: "Activation couche",
  DEACTIVATE_LAYER: "Desactivation couche",
  ACKNOWLEDGE_ALERT: "Acquittement alerte",
  FILTER_CHANGE: "Modification filtre",
  MAP_INTERACTION: "Interaction carte",
  TACTICAL_MESSAGE: "Message tactique",
  CONFIG_CHANGE: "Modification configuration",
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const months = ["JAN", "FEV", "MAR", "AVR", "MAI", "JUN", "JUL", "AOU", "SEP", "OCT", "NOV", "DEC"];
  return `${d.getDate().toString().padStart(2, "0")}${months[d.getMonth()]} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

export default function AuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "INFO" | "WARNING" | "CRITICAL">("ALL");
  const parentRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (filter !== "ALL") params.set("severity", filter);
      const res = await fetch(`/api/audit?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 15_000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const filtered = entries;

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1 border-b border-white/5">
        <h3 className="text-[9px] font-bold text-argos-accent tracking-widest uppercase">
          Audit Trail
        </h3>
        <div className="flex gap-1">
          {(["ALL", "CRITICAL", "WARNING", "INFO"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-[7px] px-1.5 py-0.5 rounded font-mono transition-colors ${
                filter === s
                  ? "bg-argos-accent/20 text-argos-accent"
                  : "text-argos-text-dim/60 hover:text-argos-text-dim"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[8px] text-argos-text-dim/40 animate-pulse">Chargement audit...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[8px] text-argos-text-dim/40">Aucune entree</span>
        </div>
      ) : (
        <div ref={parentRef} className="flex-1 overflow-auto" style={{ contain: "strict" }}>
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const e = filtered[vi.index];
              const style = SEVERITY_STYLES[e.severity] ?? SEVERITY_STYLES.INFO;
              return (
                <div
                  key={e.id}
                  className={`absolute left-0 right-0 px-2 py-1.5 border-b border-white/[0.03] ${style.bg} transition-colors`}
                  style={{ top: vi.start, height: vi.size }}
                >
                  <div className="flex items-start gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${style.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-[8px]">
                        <span className="text-argos-text-dim/50 font-mono">{formatTimestamp(e.timestamp)}</span>
                        <span className="text-argos-text-dim/30">|</span>
                        <span className="text-argos-accent/80 font-medium truncate">
                          {ACTION_LABELS[e.action] ?? e.action}
                        </span>
                        {!e.success && (
                          <span className="text-red-400 text-[6px] font-mono">ECHEC</span>
                        )}
                      </div>
                      <div className="text-[7px] text-argos-text-dim/40 truncate">
                        {e.userName} ({e.userRole})
                        {e.details && Object.keys(e.details).length > 0 && (
                          <span className="ml-1 text-argos-text-dim/25">
                            — {Object.entries(e.details).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
