"use client";

import { Entity, Aircraft, Vessel, Infrastructure } from "@/types";

interface EntityDetailProps {
  entity: Entity | null;
  onClose: () => void;
  onTrack: (id: string) => void;
  onFlag: (id: string) => void;
}

export default function EntityDetail({ entity, onClose, onTrack, onFlag }: EntityDetailProps) {
  if (!entity) return null;

  const isAircraft = entity.type === "aircraft";
  const isVessel = entity.type === "vessel";
  const isInfra = entity.type === "infrastructure";
  const ac = isAircraft ? (entity as Aircraft) : null;
  const vs = isVessel ? (entity as Vessel) : null;
  const infra = isInfra ? (entity as Infrastructure) : null;

  const isEmergency = ac?.metadata.squawk === "7700" || ac?.metadata.squawk === "7600" || ac?.metadata.squawk === "7500";

  return (
    <div className={`bg-argos-bg/80 border rounded p-3 animate-fade-in ${isEmergency ? "border-argos-danger/50" : "border-argos-border/30"}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${entity.tracked ? "bg-argos-warning animate-pulse" : entity.flagged ? "bg-argos-danger" : "bg-argos-accent"}`} />
          <h3 className="text-xs font-semibold font-mono text-argos-accent">{entity.label}</h3>
          <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-argos-panel border border-argos-border/20 text-argos-text-dim uppercase">
            {entity.type === "aircraft" ? "AERONEF" : entity.type === "vessel" ? "NAVIRE" : entity.type === "infrastructure" ? "INFRA" : entity.type}
          </span>
        </div>
        <button onClick={onClose} className="text-argos-text-dim hover:text-argos-text text-xs">✕</button>
      </div>

      {isEmergency && (
        <div className="bg-red-900/20 border border-red-500/30 rounded p-1.5 mb-2 animate-pulse-slow">
          <p className="text-[9px] font-mono text-red-400 font-bold text-center">
            SQUAWK {ac!.metadata.squawk} — {ac!.metadata.squawk === "7700" ? "URGENCE" : ac!.metadata.squawk === "7600" ? "PANNE RADIO" : "DETOURNEMENT"}
          </p>
        </div>
      )}

      <div className="space-y-1 text-[10px] font-mono">
        {ac && (
          <>
            <Row label="ICAO24" value={ac.metadata.icao24.toUpperCase()} />
            <Row label="Indicatif" value={ac.metadata.callsign ?? "—"} />
            <Row label="Pays" value={ac.metadata.originCountry} />
            <Row label="Altitude" value={ac.metadata.baroAltitude ? `${ac.metadata.baroAltitude.toFixed(0)} m` : "—"} />
            <Row label="Vitesse" value={ac.metadata.velocity ? `${(ac.metadata.velocity * 3.6).toFixed(0)} km/h` : "—"} />
            <Row label="Cap" value={ac.metadata.trueTrack ? `${ac.metadata.trueTrack.toFixed(0)}°` : "—"} />
            <Row label="V/Rate" value={ac.metadata.verticalRate ? `${ac.metadata.verticalRate.toFixed(1)} m/s` : "—"} />
            <Row label="Squawk" value={ac.metadata.squawk ?? "—"} highlight={isEmergency} />
            <Row label="Au sol" value={ac.metadata.onGround ? "OUI" : "NON"} />
            <Row label="Position" value={entity.position ? `${entity.position.lat.toFixed(4)}°N ${entity.position.lng.toFixed(4)}°E` : "—"} />
            <Row label="Trail" value={`${ac.trail.length} points`} />
          </>
        )}
        {vs && (
          <>
            <Row label="MMSI" value={vs.metadata.mmsi} />
            <Row label="Nom" value={vs.metadata.name ?? vs.label} />
            <Row label="Type" value={vs.metadata.shipType ?? "—"} />
            <Row label="Pavillon" value={vs.metadata.flag ?? "—"} />
            <Row label="Destination" value={vs.metadata.destination ?? "—"} />
            <Row label="Vitesse" value={vs.metadata.speed != null ? `${vs.metadata.speed.toFixed(1)} kts` : "—"} />
            <Row label="Cap" value={vs.metadata.course != null ? `${vs.metadata.course.toFixed(0)}°` : "—"} />
            <Row label="Longueur" value={vs.metadata.length != null ? `${vs.metadata.length} m` : "—"} />
            <Row label="Tirant d'eau" value={vs.metadata.draught != null ? `${vs.metadata.draught} m` : "—"} />
            <Row label="Position" value={entity.position ? `${entity.position.lat.toFixed(4)}°N ${entity.position.lng.toFixed(4)}°E` : "—"} />
            <Row label="Trail" value={`${vs.trail.length} points`} />
          </>
        )}
        {infra && (
          <>
            <Row label="Nom" value={infra.metadata.name} />
            <Row label="Type" value={infra.metadata.category.replace("_", " ").toUpperCase()} />
            <Row label="Operateur" value={infra.metadata.operator ?? "—"} />
            <Row label="Statut" value={infra.metadata.status ?? "—"} />
            <Row label="Importance" value={infra.metadata.importance.toUpperCase()} highlight={infra.metadata.importance === "critical"} />
            <Row label="Position" value={entity.position ? `${entity.position.lat.toFixed(4)}°N ${entity.position.lng.toFixed(4)}°E` : "—"} />
          </>
        )}
      </div>

      {(isAircraft || isVessel) && (
        <div className="flex gap-1.5 mt-3">
          <button
            onClick={() => onTrack(entity.id)}
            className={`flex-1 text-[9px] font-mono py-1.5 rounded border transition-all ${
              entity.tracked
                ? "bg-argos-warning/20 border-argos-warning/30 text-argos-warning"
                : "bg-argos-panel border-argos-border/30 text-argos-text-dim hover:text-argos-accent hover:border-argos-accent/30"
            }`}
          >
            {entity.tracked ? "SUIVI ACTIF" : "SUIVRE"}
          </button>
          <button
            onClick={() => onFlag(entity.id)}
            className={`flex-1 text-[9px] font-mono py-1.5 rounded border transition-all ${
              entity.flagged
                ? "bg-argos-danger/20 border-argos-danger/30 text-argos-danger"
                : "bg-argos-panel border-argos-border/30 text-argos-text-dim hover:text-argos-danger hover:border-argos-danger/30"
            }`}
          >
            {entity.flagged ? "SIGNALE" : "SIGNALER"}
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-argos-text-dim">{label}</span>
      <span className={highlight ? "text-argos-danger font-bold" : "text-argos-text"}>{value}</span>
    </div>
  );
}
