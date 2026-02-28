"use client";

import { useState } from "react";
import Link from "next/link";

interface GibsProduct {
  id: string;
  label: string;
}

const GIBS_PRODUCTS: GibsProduct[] = [
  { id: "MODIS_Terra_CorrectedReflectance_TrueColor", label: "VISIBLE" },
  { id: "MODIS_Terra_CorrectedReflectance_Bands721", label: "IR" },
  { id: "VIIRS_SNPP_CorrectedReflectance_TrueColor", label: "VIIRS HD" },
  { id: "MODIS_Terra_NDVI_8Day", label: "NDVI" },
];

interface SidebarProps {
  activeLayers: Record<string, boolean>;
  onToggleLayer: (id: string) => void;
  showTrails: boolean;
  onToggleTrails: () => void;
  showInfra: boolean;
  onToggleInfra: () => void;
  drawMode: boolean;
  onToggleDraw: () => void;
  measureMode: boolean;
  onToggleMeasure: () => void;
  placeMarkerMode?: boolean;
  onTogglePlaceMarker?: () => void;
  operationalMarkerCount?: number;
  onClearMarkers?: () => void;
  missionPlanMode?: boolean;
  onToggleMissionPlan?: () => void;
  missionRouteCount?: number;
  linkMode?: boolean;
  onToggleLinkMode?: () => void;
  entityLinkCount?: number;
  onExportPDF?: () => void;
  onToggleAudit?: () => void;
  onOpenSIGINT?: () => void;
  onOpenGeoINT?: () => void;
  sigintActive?: boolean;
  geointActive?: boolean;
  gibsDate?: string;
  gibsDaysAgo?: number;
  gibsProduct?: string;
  onGibsDaysChange?: (days: number) => void;
  onGibsProductChange?: (product: string) => void;
  viewMode?: "2d" | "3d";
}

const LAYERS: { id: string; name: string; icon: string; color: string; modes: ("2d" | "3d")[]; group: string }[] = [
  { id: "air", name: "Trafic Aerien", icon: "✈", color: "#00d4ff", modes: ["2d", "3d"], group: "sources" },
  { id: "maritime", name: "Trafic Maritime", icon: "⚓", color: "#10b981", modes: ["2d", "3d"], group: "sources" },
  { id: "satellites", name: "Constellations Sat.", icon: "🛰", color: "#f59e0b", modes: ["2d", "3d"], group: "sources" },
  { id: "cellTowers", name: "Antennes Relais", icon: "📡", color: "#ef4444", modes: ["2d"], group: "sources" },
  { id: "satellite", name: "Imagerie Satellite", icon: "🌐", color: "#8b5cf6", modes: ["2d"], group: "sources" },
  { id: "sentinel", name: "Imagerie NASA GIBS", icon: "🌍", color: "#06b6d4", modes: ["2d"], group: "sources" },
  { id: "infra", name: "Infrastructures", icon: "🏛", color: "#9333ea", modes: ["2d", "3d"], group: "sources" },
  { id: "conflicts", name: "Conflits ACLED", icon: "💥", color: "#ef4444", modes: ["2d", "3d"], group: "world" },
  { id: "fires", name: "Feux (NASA FIRMS)", icon: "🔥", color: "#f97316", modes: ["2d", "3d"], group: "world" },
  { id: "disasters", name: "Catastrophes (GDACS)", icon: "🌊", color: "#06b6d4", modes: ["2d", "3d"], group: "world" },
  { id: "cyberThreats", name: "Cyber Menaces", icon: "🛡", color: "#a855f7", modes: ["2d", "3d"], group: "world" },
  { id: "internetOutages", name: "Pannes Internet", icon: "📵", color: "#f43f5e", modes: ["2d", "3d"], group: "world" },
  { id: "submarineCables", name: "Cables Sous-marins", icon: "🔌", color: "#0ea5e9", modes: ["2d"], group: "infra" },
  { id: "pipelines", name: "Pipelines", icon: "🛢", color: "#84cc16", modes: ["2d"], group: "infra" },
  { id: "militaryBases", name: "Bases Militaires", icon: "🎖", color: "#dc2626", modes: ["2d", "3d"], group: "infra" },
  { id: "nuclearFacilities", name: "Installations Nucl.", icon: "☢", color: "#eab308", modes: ["2d", "3d"], group: "infra" },
  { id: "intelFeeds", name: "Flux Intel", icon: "📰", color: "#64748b", modes: ["2d", "3d"], group: "intel" },
];

const TOOLS = [
  { id: "trails", name: "Trajectoires", icon: "〰" },
  { id: "zones", name: "Zones d'interet", icon: "⬡" },
  { id: "measure", name: "Mesure", icon: "📏" },
];

export default function Sidebar({ activeLayers, onToggleLayer, showTrails, onToggleTrails, showInfra, onToggleInfra, drawMode, onToggleDraw, measureMode, onToggleMeasure, placeMarkerMode, onTogglePlaceMarker, operationalMarkerCount = 0, onClearMarkers, missionPlanMode, onToggleMissionPlan, missionRouteCount = 0, linkMode, onToggleLinkMode, entityLinkCount = 0, onExportPDF, onToggleAudit, onOpenSIGINT, onOpenGeoINT, sigintActive = false, geointActive = false, gibsDate, gibsDaysAgo = 3, gibsProduct, onGibsDaysChange, onGibsProductChange, viewMode = "2d" }: SidebarProps) {
  const is2D = viewMode === "2d";
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`h-full bg-argos-surface border-r border-argos-border/30 flex flex-col transition-all duration-300 ${collapsed ? "w-14" : "w-56"}`}>
      {/* Logo */}
      <div className="p-3 border-b border-argos-border/30 flex items-center justify-between">
        <div className={`flex items-center gap-2 ${collapsed ? "justify-center w-full" : ""}`}>
          <div className="w-7 h-7 rounded bg-gradient-to-br from-argos-accent to-blue-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            A
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-xs font-bold text-argos-text tracking-[0.2em]">ARGOS</h1>
              <p className="text-[8px] text-argos-text-dim font-mono">ANALYSE GEOSPATIALE</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <button onClick={() => setCollapsed(true)} className="text-argos-text-dim hover:text-argos-accent text-xs p-1">«</button>
        )}
      </div>

      {collapsed && (
        <button onClick={() => setCollapsed(false)} className="p-3 text-argos-text-dim hover:text-argos-accent text-xs text-center">»</button>
      )}

      {/* Layers */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {(() => {
          const groups = [
            { key: "sources", label: "Sources" },
            { key: "world", label: "World Monitor" },
            { key: "infra", label: "Infrastructures" },
            { key: "intel", label: "Intel" },
          ];
          const filtered = LAYERS.filter((l) => l.modes.includes(viewMode));
          return groups.map((g) => {
            const groupLayers = filtered.filter((l) => l.group === g.key);
            if (groupLayers.length === 0) return null;
            return (
              <div key={g.key}>
                {!collapsed && (
                  <p className="text-[8px] font-mono text-argos-text-dim/50 uppercase tracking-[0.2em] px-1 pt-1 pb-0.5">{g.label}</p>
                )}
                <div className="space-y-0.5">
                  {groupLayers.map((layer) => {
                    const active = layer.id === "infra" ? showInfra : activeLayers[layer.id];
                    return (
                      <button
                        key={layer.id}
                        onClick={() => {
                          if (layer.id === "infra") onToggleInfra();
                          else onToggleLayer(layer.id);
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-all ${
                          active
                            ? "bg-argos-panel border border-argos-border/30"
                            : "hover:bg-argos-panel/30 border border-transparent"
                        } cursor-pointer`}
                      >
                        <span className="text-sm flex-shrink-0">{layer.icon}</span>
                        {!collapsed && (
                          <>
                            <span className="text-[10px] font-mono flex-1 truncate" style={{ color: active ? layer.color : "#64748b" }}>
                              {layer.name}
                            </span>
                            {active && <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: layer.color }} />}
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          });
        })()}
      

        {!collapsed && activeLayers.sentinel && (
          <div className="px-1 py-2 space-y-2 border border-cyan-500/20 rounded-lg bg-cyan-500/5 p-2">
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-mono text-cyan-400 tracking-widest uppercase">GIBS Timeline</span>
              <span className="text-[9px] font-mono text-argos-text font-bold">{gibsDate}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[7px] font-mono text-argos-text-dim">J-30</span>
              <input
                type="range"
                min={1}
                max={30}
                value={31 - gibsDaysAgo}
                onChange={(e) => onGibsDaysChange?.(31 - parseInt(e.target.value))}
                className="flex-1 h-1 gibs-slider"
              />
              <span className="text-[7px] font-mono text-argos-text-dim">J-1</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {GIBS_PRODUCTS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onGibsProductChange?.(p.id)}
                  className={`px-1.5 py-0.5 text-[7px] font-mono uppercase rounded border transition-all ${
                    gibsProduct === p.id
                      ? "border-cyan-500 text-cyan-400 bg-cyan-500/10"
                      : "border-argos-border/30 text-argos-text-dim/50 hover:text-argos-text-dim"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!collapsed && (
          <>
            <p className="text-[8px] font-mono text-argos-text-dim/50 uppercase tracking-[0.2em] px-1 pt-2">Outils</p>
            <div className="space-y-0.5">
              <button
                onClick={onToggleTrails}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded text-left transition-all ${
                  showTrails ? "bg-argos-panel border border-argos-border/30" : "hover:bg-argos-panel/30 border border-transparent"
                }`}
              >
                <span className="text-sm">〰</span>
                <span className={`text-[10px] font-mono ${showTrails ? "text-argos-accent" : "text-argos-text-dim"}`}>Trajectoires</span>
              </button>
              {is2D && (
                <>
                  <button
                    onClick={onToggleDraw}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded text-left transition-all ${
                      drawMode
                        ? "bg-argos-warning/10 border border-argos-warning/40"
                        : "hover:bg-argos-panel/30 border border-transparent"
                    }`}
                  >
                    <span className="text-sm">⬡</span>
                    <span className={`text-[10px] font-mono ${drawMode ? "text-argos-warning" : "text-argos-text-dim"}`}>
                      {drawMode ? "Dessin en cours..." : "Dessiner Zone"}
                    </span>
                  </button>
                  <button
                    onClick={onToggleMeasure}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded text-left transition-all ${
                      measureMode
                        ? "bg-argos-accent/10 border border-argos-accent/40"
                        : "hover:bg-argos-panel/30 border border-transparent"
                    }`}
                  >
                    <span className="text-sm">📏</span>
                    <span className={`text-[10px] font-mono ${measureMode ? "text-argos-accent" : "text-argos-text-dim"}`}>
                      {measureMode ? "Mesure active..." : "Mesure Distance"}
                    </span>
                  </button>
                </>
              )}
            </div>

            {is2D && <p className="text-[8px] font-mono text-red-400/60 uppercase tracking-[0.2em] px-1 pt-2">Operationnel</p>}
            {is2D && (
              <div className="space-y-0.5">
                <button
                  onClick={onTogglePlaceMarker}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded text-left transition-all ${
                    placeMarkerMode
                      ? "bg-red-500/10 border border-red-500/40"
                      : "hover:bg-argos-panel/30 border border-transparent"
                  }`}
                >
                  <span className="text-sm">🎯</span>
                  <span className={`text-[10px] font-mono ${placeMarkerMode ? "text-red-400" : "text-argos-text-dim"}`}>
                    {placeMarkerMode ? "Placement..." : "Placer Unite"}
                  </span>
                </button>
                {operationalMarkerCount > 0 && (
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-[9px] font-mono text-argos-text-dim">
                      {operationalMarkerCount} marqueur{operationalMarkerCount > 1 ? "s" : ""}
                    </span>
                    <button
                      onClick={onClearMarkers}
                      className="text-[8px] font-mono text-red-400/60 hover:text-red-400 transition-colors"
                    >
                      EFFACER
                    </button>
                  </div>
                )}
                <button
                  onClick={onToggleMissionPlan}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded text-left transition-all ${
                    missionPlanMode
                      ? "bg-emerald-500/10 border border-emerald-500/40"
                      : "hover:bg-argos-panel/30 border border-transparent"
                  }`}
                >
                  <span className="text-sm">🗺</span>
                  <span className={`text-[10px] font-mono ${missionPlanMode ? "text-emerald-400" : "text-argos-text-dim"}`}>
                    {missionPlanMode ? "Planification..." : "Plan Mission"}
                  </span>
                </button>
                {missionRouteCount > 0 && (
                  <div className="flex items-center px-2 py-1">
                    <span className="text-[9px] font-mono text-argos-text-dim">
                      {missionRouteCount} route{missionRouteCount > 1 ? "s" : ""}
                    </span>
                  </div>
                )}
                <button
                  onClick={onToggleLinkMode}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded text-left transition-all ${
                    linkMode
                      ? "bg-violet-500/10 border border-violet-500/40"
                      : "hover:bg-argos-panel/30 border border-transparent"
                  }`}
                >
                  <span className="text-sm">🔗</span>
                  <span className={`text-[10px] font-mono ${linkMode ? "text-violet-400" : "text-argos-text-dim"}`}>
                    {linkMode ? "Liaison active..." : "Lier Entites"}
                  </span>
                </button>
                {entityLinkCount > 0 && (
                  <div className="flex items-center px-2 py-1">
                    <span className="text-[9px] font-mono text-argos-text-dim">
                      {entityLinkCount} liaison{entityLinkCount > 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>
            )}

          </>
        )}
      </div>

      {/* Export & Status */}
      <div className="p-2 border-t border-argos-border/30 space-y-2">
        {!collapsed && (
          <div className="space-y-1">
            <Link
              href="/cyber-audit"
              className="w-full flex items-center gap-2 px-2 py-2 rounded text-left transition-all hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30"
            >
              <span className="text-sm">🛡️</span>
              <span className="text-[10px] font-mono text-purple-400">Eval. Risque Num.</span>
            </Link>
            <button
              onClick={onExportPDF}
              className="w-full flex items-center gap-2 px-2 py-2 rounded text-left transition-all hover:bg-argos-panel/30 border border-transparent hover:border-argos-border/30"
            >
              <span className="text-sm">📄</span>
              <span className="text-[10px] font-mono text-argos-text-dim">Export PDF</span>
            </button>
            <button
              onClick={onToggleAudit}
              className="w-full flex items-center gap-2 px-2 py-2 rounded text-left transition-all hover:bg-argos-panel/30 border border-transparent hover:border-argos-border/30"
            >
              <span className="text-sm">📋</span>
              <span className="text-[10px] font-mono text-argos-text-dim">Audit Trail</span>
            </button>
          </div>
        )}
        <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : "px-1"}`}>
          <div className="w-1.5 h-1.5 rounded-full bg-argos-success animate-pulse" />
          {!collapsed && <span className="text-[8px] font-mono text-argos-text-dim">OPERATIONNEL</span>}
        </div>
      </div>
    </aside>
  );
}
