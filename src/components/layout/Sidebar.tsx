"use client";

import { useState } from "react";

interface SidebarProps {
  activeLayers: Record<string, boolean>;
  onToggleLayer: (id: string) => void;
  showTrails: boolean;
  onToggleTrails: () => void;
  showInfra: boolean;
  onToggleInfra: () => void;
}

const LAYERS = [
  { id: "air", name: "Trafic Aerien", icon: "✈", color: "#00d4ff", available: true },
  { id: "maritime", name: "Trafic Maritime", icon: "⚓", color: "#10b981", available: false },
  { id: "satellite", name: "Imagerie Satellite", icon: "🛰", color: "#f59e0b", available: false },
  { id: "infra", name: "Infrastructures", icon: "🏛", color: "#8b5cf6", available: true },
];

const TOOLS = [
  { id: "trails", name: "Trajectoires", icon: "〰" },
  { id: "zones", name: "Zones d'interet", icon: "⬡" },
  { id: "measure", name: "Mesure", icon: "📏" },
];

export default function Sidebar({ activeLayers, onToggleLayer, showTrails, onToggleTrails, showInfra, onToggleInfra }: SidebarProps) {
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
              <p className="text-[8px] text-argos-text-dim font-mono">RENSEIGNEMENT SOUVERAIN</p>
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
        {!collapsed && (
          <p className="text-[8px] font-mono text-argos-text-dim/50 uppercase tracking-[0.2em] px-1 pt-1">Sources</p>
        )}
        <div className="space-y-0.5">
          {LAYERS.map((layer) => {
            const active = layer.id === "infra" ? showInfra : activeLayers[layer.id];
            return (
              <button
                key={layer.id}
                onClick={() => {
                  if (!layer.available) return;
                  if (layer.id === "infra") onToggleInfra();
                  else onToggleLayer(layer.id);
                }}
                disabled={!layer.available}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded text-left transition-all ${
                  active
                    ? "bg-argos-panel border border-argos-border/30"
                    : "hover:bg-argos-panel/30 border border-transparent"
                } ${!layer.available ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
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
            </div>
          </>
        )}
      </div>

      {/* Status */}
      <div className="p-2 border-t border-argos-border/30">
        <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : "px-1"}`}>
          <div className="w-1.5 h-1.5 rounded-full bg-argos-success animate-pulse" />
          {!collapsed && <span className="text-[8px] font-mono text-argos-text-dim">OPERATIONNEL</span>}
        </div>
      </div>
    </aside>
  );
}
