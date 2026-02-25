"use client";

import { useState } from "react";
import { DataLayer } from "@/types";

const LAYERS: DataLayer[] = [
  { id: "air", name: "Trafic Aerien", source: "opensky", enabled: true, color: "#00d4ff", icon: "✈" },
  { id: "maritime", name: "Trafic Maritime", source: "ais", enabled: false, color: "#10b981", icon: "⚓" },
  { id: "satellite", name: "Imagerie Satellite", source: "sentinel", enabled: false, color: "#f59e0b", icon: "🛰" },
  { id: "infra", name: "Infrastructures", source: "osm", enabled: false, color: "#8b5cf6", icon: "🏗" },
];

interface SidebarProps {
  onLayerToggle: (layerId: string) => void;
  activeLayers: string[];
}

export default function Sidebar({ onLayerToggle, activeLayers }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`h-full bg-argos-surface border-r border-argos-border/50 flex flex-col transition-all duration-300 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-argos-border/50 flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-argos-accent to-argos-accent-dim flex items-center justify-center text-white font-bold text-sm">
              A
            </div>
            <div>
              <h1 className="text-sm font-semibold text-argos-text tracking-wider">ARGOS</h1>
              <p className="text-[10px] text-argos-text-dim font-mono">v0.1.0 — SOUVERAIN</p>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-argos-text-dim hover:text-argos-accent transition-colors p-1"
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>

      {/* Layers */}
      <div className="flex-1 overflow-y-auto p-3">
        {!collapsed && (
          <p className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest mb-3">
            Couches de donnees
          </p>
        )}
        <div className="space-y-1">
          {LAYERS.map((layer) => {
            const isActive = activeLayers.includes(layer.id);
            return (
              <button
                key={layer.id}
                onClick={() => onLayerToggle(layer.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                  isActive
                    ? "bg-argos-panel border border-argos-border/50 text-argos-text"
                    : "text-argos-text-dim hover:text-argos-text hover:bg-argos-panel/50"
                } ${layer.source !== "opensky" ? "opacity-40 cursor-not-allowed" : ""}`}
                disabled={layer.source !== "opensky"}
              >
                <span className="text-lg">{layer.icon}</span>
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{layer.name}</p>
                    {layer.source !== "opensky" && (
                      <p className="text-[10px] text-argos-text-dim">Bientot</p>
                    )}
                  </div>
                )}
                {!collapsed && isActive && (
                  <div
                    className="w-2 h-2 rounded-full animate-pulse-slow"
                    style={{ backgroundColor: layer.color }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status */}
      <div className="p-3 border-t border-argos-border/50">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-argos-success animate-pulse" />
            <span className="text-[10px] font-mono text-argos-text-dim">SYSTEME OPERATIONNEL</span>
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center">
            <div className="w-2 h-2 rounded-full bg-argos-success animate-pulse" />
          </div>
        )}
      </div>
    </aside>
  );
}
