"use client";

import { useState, useCallback } from "react";

export interface SIGINTTrace {
  id: string;
  imei?: string;
  msisdn?: string;
  label: string;
  positions: { lat: number; lng: number; timestamp: number; cellId?: string; operator?: string }[];
  createdAt: Date;
}

interface SIGINTPanelProps {
  traces: SIGINTTrace[];
  onAddTrace: (trace: SIGINTTrace) => void;
  onRemoveTrace: (id: string) => void;
  onAddManualPosition: (traceId: string, pos: { lat: number; lng: number; timestamp: number; cellId?: string; operator?: string }) => void;
  onFocusTrace: (trace: SIGINTTrace) => void;
}

type Tab = "traces" | "add" | "manual";

export default function SIGINTPanel({
  traces,
  onAddTrace,
  onRemoveTrace,
  onAddManualPosition,
  onFocusTrace,
}: SIGINTPanelProps) {
  const [tab, setTab] = useState<Tab>("traces");
  const [newIMEI, setNewIMEI] = useState("");
  const [newMSISDN, setNewMSISDN] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [manualCellId, setManualCellId] = useState("");
  const [manualOperator, setManualOperator] = useState("");

  const handleCreateTrace = useCallback(() => {
    if (!newLabel.trim() && !newIMEI.trim()) return;
    const trace: SIGINTTrace = {
      id: `sigint-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      imei: newIMEI.trim() || undefined,
      msisdn: newMSISDN.trim() || undefined,
      label: newLabel.trim() || `IMEI ${newIMEI.slice(-4)}`,
      positions: [],
      createdAt: new Date(),
    };
    onAddTrace(trace);
    setNewIMEI("");
    setNewMSISDN("");
    setNewLabel("");
    setTab("traces");
  }, [newIMEI, newMSISDN, newLabel, onAddTrace]);

  const handleAddPosition = useCallback(() => {
    if (!selectedTraceId) return;
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng)) return;

    let timestamp = Date.now();
    if (manualDate) {
      const dt = new Date(`${manualDate}T${manualTime || "12:00"}:00`);
      if (!isNaN(dt.getTime())) timestamp = dt.getTime();
    }

    onAddManualPosition(selectedTraceId, {
      lat,
      lng,
      timestamp,
      cellId: manualCellId || undefined,
      operator: manualOperator || undefined,
    });
    setManualLat("");
    setManualLng("");
    setManualCellId("");
    setManualOperator("");
  }, [selectedTraceId, manualLat, manualLng, manualDate, manualTime, manualCellId, manualOperator, onAddManualPosition]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-1 h-3 bg-red-500 rounded-full" />
        <p className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest">
          SIGINT — Suivi & Triangulation
        </p>
      </div>

      <div className="flex gap-1">
        {(["traces", "add", "manual"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-[8px] font-mono px-2 py-1 rounded border transition-all ${
              tab === t
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "border-argos-border/20 text-argos-text-dim hover:text-argos-text"
            }`}
          >
            {t === "traces" ? `TRACES (${traces.length})` : t === "add" ? "NOUVEAU" : "POSITION"}
          </button>
        ))}
      </div>

      {tab === "traces" && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {traces.length === 0 ? (
            <p className="text-[9px] font-mono text-argos-text-dim/50 text-center py-3">
              Aucune trace SIGINT active
            </p>
          ) : (
            traces.map((trace) => (
              <div
                key={trace.id}
                className="px-2 py-1.5 rounded bg-argos-panel/50 border border-argos-border/10 group hover:border-red-500/20 transition-all"
              >
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => onFocusTrace(trace)}
                    className="flex items-center gap-2 text-left flex-1 min-w-0"
                  >
                    <span className="text-[10px]">📱</span>
                    <div className="min-w-0">
                      <p className="text-[9px] font-mono text-argos-text font-bold truncate">{trace.label}</p>
                      <div className="flex items-center gap-2">
                        {trace.imei && (
                          <span className="text-[7px] font-mono text-argos-text-dim">IMEI: {trace.imei}</span>
                        )}
                        {trace.msisdn && (
                          <span className="text-[7px] font-mono text-argos-text-dim">TEL: {trace.msisdn}</span>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-1">
                    <span className="text-[7px] font-mono text-red-400">{trace.positions.length} pos</span>
                    <button
                      onClick={() => onRemoveTrace(trace.id)}
                      className="text-argos-text-dim/30 hover:text-red-400 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {trace.positions.length > 0 && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[7px] font-mono text-argos-text-dim">
                      Derniere: {new Date(trace.positions[trace.positions.length - 1].timestamp).toLocaleString("fr-FR")}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "add" && (
        <div className="space-y-2 px-1">
          <div>
            <label className="text-[8px] font-mono text-argos-text-dim block mb-0.5">NOM / ALIAS *</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="ex: Cible Alpha"
              className="w-full text-[10px] font-mono px-2 py-1.5 rounded bg-argos-bg border border-argos-border/30 text-argos-text placeholder-argos-text-dim/30 focus:border-red-500/50 outline-none"
            />
          </div>
          <div>
            <label className="text-[8px] font-mono text-argos-text-dim block mb-0.5">IMEI</label>
            <input
              value={newIMEI}
              onChange={(e) => setNewIMEI(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="15 chiffres"
              maxLength={15}
              className="w-full text-[10px] font-mono px-2 py-1.5 rounded bg-argos-bg border border-argos-border/30 text-argos-text placeholder-argos-text-dim/30 focus:border-red-500/50 outline-none"
            />
          </div>
          <div>
            <label className="text-[8px] font-mono text-argos-text-dim block mb-0.5">MSISDN (TEL)</label>
            <input
              value={newMSISDN}
              onChange={(e) => setNewMSISDN(e.target.value)}
              placeholder="+33..."
              className="w-full text-[10px] font-mono px-2 py-1.5 rounded bg-argos-bg border border-argos-border/30 text-argos-text placeholder-argos-text-dim/30 focus:border-red-500/50 outline-none"
            />
          </div>
          <button
            onClick={handleCreateTrace}
            disabled={!newLabel.trim() && !newIMEI.trim()}
            className="w-full text-[9px] font-mono py-1.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            CREER LA TRACE
          </button>
        </div>
      )}

      {tab === "manual" && (
        <div className="space-y-2 px-1">
          <div>
            <label className="text-[8px] font-mono text-argos-text-dim block mb-0.5">TRACE CIBLE *</label>
            <select
              value={selectedTraceId ?? ""}
              onChange={(e) => setSelectedTraceId(e.target.value || null)}
              className="w-full text-[10px] font-mono px-2 py-1.5 rounded bg-argos-bg border border-argos-border/30 text-argos-text focus:border-red-500/50 outline-none"
            >
              <option value="">-- Selectionner --</option>
              {traces.map((t) => (
                <option key={t.id} value={t.id}>{t.label} {t.imei ? `(${t.imei})` : ""}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[8px] font-mono text-argos-text-dim block mb-0.5">LATITUDE *</label>
              <input
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                placeholder="48.8566"
                className="w-full text-[10px] font-mono px-2 py-1.5 rounded bg-argos-bg border border-argos-border/30 text-argos-text placeholder-argos-text-dim/30 focus:border-red-500/50 outline-none"
              />
            </div>
            <div>
              <label className="text-[8px] font-mono text-argos-text-dim block mb-0.5">LONGITUDE *</label>
              <input
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
                placeholder="2.3522"
                className="w-full text-[10px] font-mono px-2 py-1.5 rounded bg-argos-bg border border-argos-border/30 text-argos-text placeholder-argos-text-dim/30 focus:border-red-500/50 outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[8px] font-mono text-argos-text-dim block mb-0.5">DATE</label>
              <input
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="w-full text-[10px] font-mono px-2 py-1.5 rounded bg-argos-bg border border-argos-border/30 text-argos-text focus:border-red-500/50 outline-none"
              />
            </div>
            <div>
              <label className="text-[8px] font-mono text-argos-text-dim block mb-0.5">HEURE</label>
              <input
                type="time"
                value={manualTime}
                onChange={(e) => setManualTime(e.target.value)}
                className="w-full text-[10px] font-mono px-2 py-1.5 rounded bg-argos-bg border border-argos-border/30 text-argos-text focus:border-red-500/50 outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[8px] font-mono text-argos-text-dim block mb-0.5">CELL ID</label>
              <input
                value={manualCellId}
                onChange={(e) => setManualCellId(e.target.value)}
                placeholder="Optionnel"
                className="w-full text-[10px] font-mono px-2 py-1.5 rounded bg-argos-bg border border-argos-border/30 text-argos-text placeholder-argos-text-dim/30 focus:border-red-500/50 outline-none"
              />
            </div>
            <div>
              <label className="text-[8px] font-mono text-argos-text-dim block mb-0.5">OPERATEUR</label>
              <input
                value={manualOperator}
                onChange={(e) => setManualOperator(e.target.value)}
                placeholder="SFR, Orange..."
                className="w-full text-[10px] font-mono px-2 py-1.5 rounded bg-argos-bg border border-argos-border/30 text-argos-text placeholder-argos-text-dim/30 focus:border-red-500/50 outline-none"
              />
            </div>
          </div>
          <button
            onClick={handleAddPosition}
            disabled={!selectedTraceId || !manualLat || !manualLng}
            className="w-full text-[9px] font-mono py-1.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            AJOUTER LA POSITION
          </button>
        </div>
      )}
    </div>
  );
}
