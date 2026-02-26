"use client";

import type {
  ConflictEvent,
  CyberThreat,
  InternetOutage,
  SubmarineCable,
  Pipeline,
  MilitaryBase,
  NuclearFacility,
  FireHotspot,
  NaturalDisaster,
  CellTower,
} from "@/types";

export type MapItemType =
  | "conflict"
  | "fire"
  | "disaster"
  | "cyber"
  | "outage"
  | "cable"
  | "pipeline"
  | "base"
  | "nuclear"
  | "tower";

export interface MapItem {
  type: MapItemType;
  data: ConflictEvent | CyberThreat | InternetOutage | SubmarineCable | Pipeline | MilitaryBase | NuclearFacility | FireHotspot | NaturalDisaster | CellTower;
}

interface Props {
  item: MapItem | null;
  onClose: () => void;
}

const TYPE_META: Record<MapItemType, { label: string; icon: string; color: string }> = {
  conflict: { label: "CONFLIT", icon: "💥", color: "text-red-400" },
  fire: { label: "FEU DETECTE", icon: "🔥", color: "text-orange-400" },
  disaster: { label: "CATASTROPHE", icon: "🌊", color: "text-cyan-400" },
  cyber: { label: "CYBER MENACE", icon: "🛡", color: "text-purple-400" },
  outage: { label: "PANNE INTERNET", icon: "📵", color: "text-rose-400" },
  cable: { label: "CABLE SOUS-MARIN", icon: "🔌", color: "text-sky-400" },
  pipeline: { label: "PIPELINE", icon: "🛢", color: "text-lime-400" },
  base: { label: "BASE MILITAIRE", icon: "🎖", color: "text-red-500" },
  nuclear: { label: "INSTALLATION NUCLEAIRE", icon: "☢", color: "text-yellow-400" },
  tower: { label: "ANTENNE RELAIS", icon: "📡", color: "text-red-400" },
};

const SEV_COLORS: Record<string, string> = {
  green: "text-green-400",
  orange: "text-orange-400",
  red: "text-red-400",
  minor: "text-yellow-400",
  moderate: "text-orange-400",
  major: "text-red-400",
  low: "text-green-400",
  nominal: "text-yellow-400",
  high: "text-red-400",
};

export default function MapItemDetail({ item, onClose }: Props) {
  if (!item) return null;

  const meta = TYPE_META[item.type];

  return (
    <div className="bg-argos-bg/80 border border-argos-border/30 rounded p-3 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span>{meta.icon}</span>
          <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded bg-argos-panel border border-argos-border/20 uppercase ${meta.color}`}>
            {meta.label}
          </span>
        </div>
        <button onClick={onClose} className="text-argos-text-dim hover:text-argos-text text-xs">✕</button>
      </div>

      <div className="space-y-1 text-[10px] font-mono">
        {item.type === "conflict" && <ConflictDetail d={item.data as ConflictEvent} />}
        {item.type === "fire" && <FireDetail d={item.data as FireHotspot} />}
        {item.type === "disaster" && <DisasterDetail d={item.data as NaturalDisaster} />}
        {item.type === "cyber" && <CyberDetail d={item.data as CyberThreat} />}
        {item.type === "outage" && <OutageDetail d={item.data as InternetOutage} />}
        {item.type === "cable" && <CableDetail d={item.data as SubmarineCable} />}
        {item.type === "pipeline" && <PipelineDetail d={item.data as Pipeline} />}
        {item.type === "base" && <BaseDetail d={item.data as MilitaryBase} />}
        {item.type === "nuclear" && <NuclearDetail d={item.data as NuclearFacility} />}
        {item.type === "tower" && <TowerDetail d={item.data as CellTower} />}
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-argos-text-dim">{label}</span>
      <span className={`text-right max-w-[60%] truncate ${highlight ? "text-red-400 font-bold" : "text-argos-text"}`}>{value}</span>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-current/20 ${SEV_COLORS[severity] ?? "text-slate-400"}`}>
      {severity}
    </span>
  );
}

function ConflictDetail({ d }: { d: ConflictEvent }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-xs font-semibold text-argos-accent">{d.eventType.replace("_", " ").toUpperCase()}</h3>
        {d.fatalities > 0 && <span className="text-[9px] font-bold text-red-400">{d.fatalities} mort{d.fatalities > 1 ? "s" : ""}</span>}
      </div>
      <Row label="Date" value={d.eventDate} />
      <Row label="Sous-type" value={d.subEventType || "—"} />
      <Row label="Acteur 1" value={d.actor1} />
      <Row label="Acteur 2" value={d.actor2 ?? "—"} />
      <Row label="Pays" value={d.country} />
      <Row label="Region" value={d.region} />
      <Row label="Victimes" value={String(d.fatalities)} highlight={d.fatalities > 0} />
      <Row label="Position" value={`${d.lat.toFixed(4)}°N ${d.lng.toFixed(4)}°E`} />
      <Row label="Source" value={d.source} />
      {d.notes && (
        <div className="mt-2 p-2 rounded bg-argos-panel/50 border border-argos-border/10">
          <p className="text-[9px] text-argos-text-dim leading-relaxed">{d.notes.slice(0, 300)}</p>
        </div>
      )}
    </>
  );
}

function FireDetail({ d }: { d: FireHotspot }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-xs font-semibold text-orange-400">FRP: {d.frp.toFixed(1)} MW</h3>
        <SeverityBadge severity={d.confidence} />
      </div>
      <Row label="Satellite" value={d.satellite} />
      <Row label="Confiance" value={d.confidence.toUpperCase()} />
      <Row label="Luminosite" value={`${d.brightness.toFixed(1)} K`} />
      <Row label="FRP" value={`${d.frp.toFixed(1)} MW`} />
      <Row label="Date" value={d.acqDate} />
      <Row label="Heure" value={d.acqTime} />
      <Row label="Scan" value={`${d.scan.toFixed(1)} x ${d.track.toFixed(1)}`} />
      <Row label="Pays" value={d.country ?? "—"} />
      <Row label="Position" value={`${d.lat.toFixed(4)}°N ${d.lng.toFixed(4)}°E`} />
    </>
  );
}

function DisasterDetail({ d }: { d: NaturalDisaster }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-xs font-semibold text-cyan-400">{d.title}</h3>
        <SeverityBadge severity={d.severity} />
      </div>
      <Row label="Type" value={d.eventType.toUpperCase()} />
      <Row label="Alerte" value={`Niveau ${d.alertLevel}`} highlight={d.alertLevel >= 3} />
      <Row label="Pays" value={d.country} />
      <Row label="Debut" value={d.fromDate} />
      <Row label="Fin" value={d.toDate ?? "En cours"} />
      {d.population && <Row label="Population" value={d.population.toLocaleString()} />}
      <Row label="Source" value={d.source} />
      <Row label="Position" value={`${d.lat.toFixed(4)}°N ${d.lng.toFixed(4)}°E`} />
      {d.description && (
        <div className="mt-2 p-2 rounded bg-argos-panel/50 border border-argos-border/10">
          <p className="text-[9px] text-argos-text-dim leading-relaxed">{d.description.slice(0, 300)}</p>
        </div>
      )}
      {d.url && (
        <a href={d.url} target="_blank" rel="noopener noreferrer" className="block mt-2 text-[9px] text-argos-accent hover:underline">
          Source externe →
        </a>
      )}
    </>
  );
}

function CyberDetail({ d }: { d: CyberThreat }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-xs font-semibold text-purple-400">{d.threatCategory.toUpperCase()}</h3>
        <span className="text-[8px] font-mono text-argos-text-dim px-1 rounded bg-argos-panel">{d.iocType.toUpperCase()}</span>
      </div>
      <Row label="IOC" value={d.iocValue.length > 50 ? d.iocValue.slice(0, 47) + "..." : d.iocValue} />
      <Row label="Categorie" value={d.threatCategory} />
      <Row label="Confiance" value={`${d.confidence}%`} highlight={d.confidence >= 90} />
      <Row label="Source" value={d.source.replace("_", " ")} />
      <Row label="Vu pour la 1ere fois" value={d.firstSeen} />
      <Row label="Vu en dernier" value={d.lastSeen} />
      <Row label="Rapports" value={String(d.reportCount)} />
      <Row label="Pays" value={d.country ?? "—"} />
      {d.lat != null && d.lng != null && <Row label="Position" value={`${d.lat.toFixed(4)}°N ${d.lng.toFixed(4)}°E`} />}
      {d.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {d.tags.map((t) => (
            <span key={t} className="text-[7px] font-mono px-1 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
              {t}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function OutageDetail({ d }: { d: InternetOutage }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-xs font-semibold text-rose-400">{d.country}</h3>
        <SeverityBadge severity={d.severity} />
      </div>
      <Row label="Pays" value={d.country} />
      <Row label="Region" value={d.region ?? "—"} />
      <Row label="Type" value={d.type.toUpperCase()} />
      <Row label="Severite" value={d.severity.toUpperCase()} highlight={d.severity === "major"} />
      <Row label="Chute score" value={`${d.scoreDropPct}%`} highlight={d.scoreDropPct > 50} />
      {d.asn && <Row label="ASN" value={String(d.asn)} />}
      {d.asName && <Row label="Operateur" value={d.asName} />}
      <Row label="Debut" value={new Date(d.startTime).toLocaleString("fr-FR")} />
      <Row label="Fin" value={d.endTime ? new Date(d.endTime).toLocaleString("fr-FR") : "En cours"} />
      <Row label="Source" value={d.source.replace("_", " ")} />
      <Row label="Position" value={`${d.lat.toFixed(4)}°N ${d.lng.toFixed(4)}°E`} />
    </>
  );
}

function CableDetail({ d }: { d: SubmarineCable }) {
  return (
    <>
      <h3 className="text-xs font-semibold text-sky-400 mb-1">{d.name}</h3>
      <Row label="Statut" value={d.status.toUpperCase()} highlight={d.status === "fault"} />
      <Row label="Longueur" value={d.lengthKm ? `${d.lengthKm.toLocaleString()} km` : "—"} />
      {d.capacityTbps && <Row label="Capacite" value={`${d.capacityTbps} Tbps`} />}
      <Row label="Mise en service" value={d.rfsDate ?? "—"} />
      {d.owners.length > 0 && (
        <>
          <div className="text-argos-text-dim mt-1 mb-0.5">Proprietaires:</div>
          <div className="flex flex-wrap gap-1">
            {d.owners.slice(0, 8).map((o) => (
              <span key={o} className="text-[7px] font-mono px-1 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
                {o}
              </span>
            ))}
          </div>
        </>
      )}
      {d.landingPoints.length > 0 && (
        <>
          <div className="text-argos-text-dim mt-2 mb-0.5">Points d&apos;atterrissage ({d.landingPoints.length}):</div>
          <div className="max-h-24 overflow-y-auto space-y-0.5">
            {d.landingPoints.slice(0, 10).map((lp) => (
              <div key={lp.name} className="text-[8px] text-argos-text">
                {lp.name} ({lp.country})
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function PipelineDetail({ d }: { d: Pipeline }) {
  return (
    <>
      <h3 className="text-xs font-semibold text-lime-400 mb-1">{d.name}</h3>
      <Row label="Type" value={d.type.toUpperCase()} />
      <Row label="Statut" value={d.status.toUpperCase()} highlight={d.status === "decommissioned"} />
      <Row label="Operateur" value={d.operator ?? "—"} />
      {d.capacityMbpd && <Row label="Capacite" value={`${d.capacityMbpd} Mbpd`} />}
      {d.countries.length > 0 && (
        <>
          <div className="text-argos-text-dim mt-1 mb-0.5">Pays traverses:</div>
          <div className="flex flex-wrap gap-1">
            {d.countries.map((c) => (
              <span key={c} className="text-[7px] font-mono px-1 py-0.5 rounded bg-lime-500/10 text-lime-300 border border-lime-500/20">
                {c}
              </span>
            ))}
          </div>
        </>
      )}
      <Row label="Segments" value={`${d.coordinates.length} points`} />
    </>
  );
}

function BaseDetail({ d }: { d: MilitaryBase }) {
  return (
    <>
      <h3 className="text-xs font-semibold text-red-400 mb-1">{d.name}</h3>
      <Row label="Pays" value={d.country} />
      <Row label="Operateur" value={d.operator} />
      <Row label="Type" value={d.type.replace("_", " ").toUpperCase()} />
      <Row label="Statut" value={d.status.toUpperCase()} highlight={d.status === "closed"} />
      {d.branch && <Row label="Branche" value={d.branch} />}
      <Row label="Position" value={`${d.lat.toFixed(4)}°N ${d.lng.toFixed(4)}°E`} />
      {d.notes && (
        <div className="mt-2 p-2 rounded bg-argos-panel/50 border border-argos-border/10">
          <p className="text-[9px] text-argos-text-dim leading-relaxed">{d.notes.slice(0, 200)}</p>
        </div>
      )}
    </>
  );
}

function NuclearDetail({ d }: { d: NuclearFacility }) {
  return (
    <>
      <h3 className="text-xs font-semibold text-yellow-400 mb-1">{d.name}</h3>
      <Row label="Pays" value={d.country} />
      <Row label="Type" value={d.type.replace("_", " ").toUpperCase()} />
      <Row label="Statut" value={d.status.toUpperCase()} highlight={d.status === "shutdown" || d.status === "decommissioning"} />
      {d.operator && <Row label="Operateur" value={d.operator} />}
      {d.capacityMw && <Row label="Puissance" value={`${d.capacityMw} MW`} />}
      {d.reactorCount && <Row label="Reacteurs" value={String(d.reactorCount)} />}
      <Row label="Position" value={`${d.lat.toFixed(4)}°N ${d.lng.toFixed(4)}°E`} />
    </>
  );
}

function TowerDetail({ d }: { d: CellTower }) {
  return (
    <>
      <h3 className="text-xs font-semibold text-red-400 mb-1">{d.radio} — {d.operator || "Operateur inconnu"}</h3>
      <Row label="Technologie" value={d.radio} />
      <Row label="Operateur" value={d.operator || "—"} />
      <Row label="Cell ID" value={String(d.cellId)} />
      <Row label="MCC" value={String(d.mcc)} />
      <Row label="MNC" value={String(d.mnc)} />
      <Row label="LAC" value={String(d.lac)} />
      <Row label="Portee" value={`${d.range} m`} />
      <Row label="Position" value={`${d.lat.toFixed(4)}°N ${d.lng.toFixed(4)}°E`} />
    </>
  );
}
