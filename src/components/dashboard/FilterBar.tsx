"use client";

import { FilterState } from "@/types";

interface FilterBarProps {
  filters: FilterState;
  onUpdate: (filters: Partial<FilterState>) => void;
  entityCount: number;
  filteredCount: number;
}

export default function FilterBar({ filters, onUpdate, entityCount, filteredCount }: FilterBarProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-1 h-3 bg-argos-accent-dim rounded-full" />
        <p className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest">Filtres</p>
        <span className="text-[9px] font-mono text-argos-text-dim">
          {filteredCount}/{entityCount}
        </span>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onUpdate({ search: e.target.value })}
          placeholder="Recherche callsign, ICAO, pays..."
          className="w-full bg-argos-bg/80 border border-argos-border/30 rounded px-3 py-1.5 text-[10px] font-mono text-argos-text placeholder:text-argos-text-dim/40 focus:outline-none focus:border-argos-accent/50 transition-colors"
        />
        {filters.search && (
          <button
            onClick={() => onUpdate({ search: "" })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-argos-text-dim hover:text-argos-text text-[10px]"
          >
            ✕
          </button>
        )}
      </div>

      {/* Quick toggles */}
      <div className="flex flex-wrap gap-1">
        <Toggle
          label="Au sol"
          active={filters.showOnGround}
          onChange={() => onUpdate({ showOnGround: !filters.showOnGround })}
        />
        <Toggle
          label="Suivis"
          active={filters.showTrackedOnly}
          onChange={() => onUpdate({ showTrackedOnly: !filters.showTrackedOnly })}
          color="text-argos-warning"
        />
        <Toggle
          label="Signales"
          active={filters.showFlaggedOnly}
          onChange={() => onUpdate({ showFlaggedOnly: !filters.showFlaggedOnly })}
          color="text-argos-danger"
        />
      </div>

      {/* Altitude range */}
      <div>
        <p className="text-[9px] font-mono text-argos-text-dim mb-1">
          Altitude: {filters.altitudeRange[0].toLocaleString("fr-FR")} - {filters.altitudeRange[1].toLocaleString("fr-FR")} m
        </p>
        <input
          type="range"
          min={0}
          max={15000}
          step={500}
          value={filters.altitudeRange[1]}
          onChange={(e) => onUpdate({ altitudeRange: [filters.altitudeRange[0], parseInt(e.target.value)] })}
          className="w-full h-1 bg-argos-border/30 rounded-lg appearance-none cursor-pointer accent-argos-accent"
        />
      </div>

      {/* Speed range */}
      <div>
        <p className="text-[9px] font-mono text-argos-text-dim mb-1">
          Vitesse: 0 - {filters.speedRange[1].toLocaleString("fr-FR")} km/h
        </p>
        <input
          type="range"
          min={0}
          max={2000}
          step={50}
          value={filters.speedRange[1]}
          onChange={(e) => onUpdate({ speedRange: [0, parseInt(e.target.value)] })}
          className="w-full h-1 bg-argos-border/30 rounded-lg appearance-none cursor-pointer accent-argos-accent"
        />
      </div>
    </div>
  );
}

function Toggle({ label, active, onChange, color }: { label: string; active: boolean; onChange: () => void; color?: string }) {
  return (
    <button
      onClick={onChange}
      className={`text-[9px] font-mono px-2 py-1 rounded border transition-all ${
        active
          ? `bg-argos-panel border-argos-accent/30 ${color ?? "text-argos-accent"}`
          : "bg-transparent border-argos-border/20 text-argos-text-dim/50 hover:text-argos-text-dim"
      }`}
    >
      {label}
    </button>
  );
}
