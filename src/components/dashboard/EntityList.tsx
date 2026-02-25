"use client";

import { Entity, Aircraft } from "@/types";

interface EntityListProps {
  entities: Entity[];
  selectedId: string | null;
  onSelect: (entity: Entity) => void;
}

export default function EntityList({ entities, selectedId, onSelect }: EntityListProps) {
  const aircraft = entities.filter((e): e is Aircraft => e.type === "aircraft");
  const sorted = [...aircraft].sort((a, b) => {
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
    if (a.tracked !== b.tracked) return a.tracked ? -1 : 1;
    return (b.metadata.baroAltitude ?? 0) - (a.metadata.baroAltitude ?? 0);
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1 h-3 bg-argos-accent rounded-full" />
        <p className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest">
          Entites ({sorted.length})
        </p>
      </div>
      <div className="space-y-0.5 max-h-52 overflow-y-auto">
        {sorted.slice(0, 50).map((ac) => {
          const isSelected = ac.id === selectedId;
          const speedKmh = ac.metadata.velocity ? (ac.metadata.velocity * 3.6).toFixed(0) : "—";

          return (
            <button
              key={ac.id}
              onClick={() => onSelect(ac)}
              className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-[10px] font-mono transition-all ${
                isSelected
                  ? "bg-argos-accent/10 border border-argos-accent/20"
                  : "hover:bg-argos-panel/50 border border-transparent"
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                ac.flagged ? "bg-argos-danger" : ac.tracked ? "bg-argos-warning" : ac.metadata.onGround ? "bg-argos-text-dim/30" : "bg-argos-accent"
              }`} />
              <span className={`flex-1 truncate ${isSelected ? "text-argos-accent" : "text-argos-text"}`}>
                {ac.label}
              </span>
              <span className="text-argos-text-dim/60 flex-shrink-0 w-12 text-right">
                {ac.metadata.baroAltitude ? `${(ac.metadata.baroAltitude / 1000).toFixed(1)}k` : "GND"}
              </span>
              <span className="text-argos-text-dim/40 flex-shrink-0 w-10 text-right">
                {speedKmh}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
