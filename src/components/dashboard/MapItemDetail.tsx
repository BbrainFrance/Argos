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
  | "tower"
  | "position";

export interface PositionData {
  lat: number;
  lng: number;
  address?: string;
  ip?: string;
  nearbyCount: { entities: number; events: number; fires: number; disasters: number };
  geoRadius: number;
}

export interface MapItem {
  type: MapItemType;
  data: ConflictEvent | CyberThreat | InternetOutage | SubmarineCable | Pipeline | MilitaryBase | NuclearFacility | FireHotspot | NaturalDisaster | CellTower | PositionData;
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
  position: { label: "MA POSITION", icon: "📍", color: "text-cyan-400" },
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
        {item.type === "position" && <PositionDetail d={item.data as PositionData} />}
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between py-0.5 gap-2">
      <span className="text-argos-text-dim flex-shrink-0">{label}</span>
      <span className={`text-right break-words ${highlight ? "text-red-400 font-bold" : "text-argos-text"}`}>{value}</span>
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
  const typeLabels: Record<string, { label: string; icon: string }> = {
    battles: { label: "COMBATS", icon: "⚔️" },
    explosions: { label: "EXPLOSIONS", icon: "💥" },
    protests: { label: "MANIFESTATIONS", icon: "✊" },
    riots: { label: "EMEUTES", icon: "🔥" },
    violence_against_civilians: { label: "VIOLENCES CIVILS", icon: "⚠️" },
    strategic_developments: { label: "STRAT. DEVPT", icon: "🎯" },
  };
  const t = typeLabels[d.eventType] ?? { label: d.eventType.replace("_", " ").toUpperCase(), icon: "⚡" };
  const searchQuery = encodeURIComponent(`${d.actor1} ${d.country} ${d.eventDate}`);

  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">{t.icon}</span>
        <h3 className="text-xs font-semibold text-argos-accent">{t.label}</h3>
        {d.fatalities > 0 && <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">{d.fatalities} mort{d.fatalities > 1 ? "s" : ""}</span>}
      </div>
      {d.subEventType && <Row label="Sous-type" value={d.subEventType} />}
      <Row label="Date" value={d.eventDate} />
      <Row label="Acteur 1" value={d.actor1} />
      {d.actor2 && <Row label="Acteur 2" value={d.actor2} />}
      <Row label="Pays" value={d.country} />
      <Row label="Region" value={d.region} />
      <Row label="Position" value={`${d.lat.toFixed(4)}°N ${d.lng.toFixed(4)}°E`} />
      <Row label="Source" value={`${d.source} (${d.sourceScale})`} />
      {d.notes && (
        <div className="mt-2 p-2 rounded bg-argos-panel/50 border border-argos-border/10">
          <p className="text-[9px] text-argos-text-dim leading-relaxed">{d.notes.slice(0, 400)}</p>
        </div>
      )}
      <div className="mt-2 pt-2 border-t border-argos-border/20 space-y-1">
        <p className="text-[8px] font-mono text-argos-text-dim uppercase tracking-wider">Couverture Media</p>
        <div className="flex flex-wrap gap-1">
          <a href={`https://news.google.com/search?q=${searchQuery}`} target="_blank" rel="noopener noreferrer" className="text-[8px] font-mono px-2 py-0.5 bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded hover:bg-blue-500/20">Google News ↗</a>
          <a href={`https://www.aljazeera.com/search/${searchQuery}`} target="_blank" rel="noopener noreferrer" className="text-[8px] font-mono px-2 py-0.5 bg-orange-500/10 text-orange-300 border border-orange-500/20 rounded hover:bg-orange-500/20">Al Jazeera ↗</a>
          <a href={`https://www.reuters.com/search/news?query=${searchQuery}`} target="_blank" rel="noopener noreferrer" className="text-[8px] font-mono px-2 py-0.5 bg-sky-500/10 text-sky-300 border border-sky-500/20 rounded hover:bg-sky-500/20">Reuters ↗</a>
          <a href={`https://www.bbc.co.uk/search?q=${searchQuery}`} target="_blank" rel="noopener noreferrer" className="text-[8px] font-mono px-2 py-0.5 bg-red-500/10 text-red-300 border border-red-500/20 rounded hover:bg-red-500/20">BBC ↗</a>
          <a href={`https://www.youtube.com/results?search_query=${searchQuery}+live`} target="_blank" rel="noopener noreferrer" className="text-[8px] font-mono px-2 py-0.5 bg-rose-500/10 text-rose-300 border border-rose-500/20 rounded hover:bg-rose-500/20">YouTube Live ↗</a>
        </div>
      </div>
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

function PositionDetail({ d }: { d: PositionData }) {
  return (
    <>
      <h3 className="text-xs font-semibold text-cyan-400 mb-1">Position Operateur</h3>
      {d.address && <Row label="Adresse" value={d.address} />}
      <Row label="Coordonnees" value={`${d.lat.toFixed(5)}°N ${d.lng.toFixed(5)}°E`} />
      {d.ip && <Row label="IP publique" value={d.ip} />}
      <Row label="Rayon surveillance" value={`${d.geoRadius} km`} />

      <div className="mt-2 pt-2 border-t border-argos-border/20">
        <p className="text-[8px] text-argos-text-dim uppercase tracking-wider mb-1">Situation a proximite ({d.geoRadius} km)</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <Row label="Entites" value={String(d.nearbyCount.entities)} />
          <Row label="Conflits" value={String(d.nearbyCount.events)} highlight={d.nearbyCount.events > 0} />
          <Row label="Feux actifs" value={String(d.nearbyCount.fires)} highlight={d.nearbyCount.fires > 0} />
          <Row label="Catastrophes" value={String(d.nearbyCount.disasters)} highlight={d.nearbyCount.disasters > 0} />
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-argos-border/20">
        <p className="text-[8px] text-argos-text-dim uppercase tracking-wider mb-1">Brief de situation</p>
        <div className="p-2 rounded bg-argos-panel/50 border border-argos-border/10">
          <p className="text-[9px] text-argos-text-dim leading-relaxed">
            {d.nearbyCount.events === 0 && d.nearbyCount.fires === 0 && d.nearbyCount.disasters === 0
              ? `Zone calme. Aucune menace detectee dans un rayon de ${d.geoRadius} km. ${d.nearbyCount.entities} entite${d.nearbyCount.entities > 1 ? "s" : ""} trackee${d.nearbyCount.entities > 1 ? "s" : ""}.`
              : `ATTENTION — ${[
                  d.nearbyCount.events > 0 ? `${d.nearbyCount.events} conflit${d.nearbyCount.events > 1 ? "s" : ""}` : "",
                  d.nearbyCount.fires > 0 ? `${d.nearbyCount.fires} feu${d.nearbyCount.fires > 1 ? "x" : ""} actif${d.nearbyCount.fires > 1 ? "s" : ""}` : "",
                  d.nearbyCount.disasters > 0 ? `${d.nearbyCount.disasters} catastrophe${d.nearbyCount.disasters > 1 ? "s" : ""}` : "",
                ].filter(Boolean).join(", ")} detecte${d.nearbyCount.events + d.nearbyCount.fires + d.nearbyCount.disasters > 1 ? "s" : ""} dans un rayon de ${d.geoRadius} km. ${d.nearbyCount.entities} entite${d.nearbyCount.entities > 1 ? "s" : ""} trackee${d.nearbyCount.entities > 1 ? "s" : ""}.`
            }
          </p>
        </div>
      </div>
    </>
  );
}
