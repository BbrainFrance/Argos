"use client";

import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import * as THREE from "three";
import { Entity, Aircraft, Vessel, Infrastructure, ZoneOfInterest, SatellitePosition } from "@/types";
import { INFRA_ICONS } from "@/lib/infrastructure";
import GlobeComponent from "react-globe.gl";

interface ThreeGlobeProps {
  entities: Entity[];
  infrastructure: Infrastructure[];
  zones: ZoneOfInterest[];
  selectedEntityId: string | null;
  onSelectEntity: (entity: Entity) => void;
  showTrails: boolean;
  showInfrastructure: boolean;
  showSatellite?: boolean;
  satellites?: SatellitePosition[];
  showSatellites?: boolean;
}

const EARTH_RADIUS_KM = 6371;
const GLOBE_RADIUS = 100;

const SAT_GROUP_COLORS: Record<string, string> = {
  gps: "#f59e0b",
  galileo: "#3b82f6",
  glonass: "#ef4444",
  iridium: "#06b6d4",
  starlink: "#a855f7",
  military: "#dc2626",
  "french-mil": "#2563eb",
};

function polar2Cartesian(lat: number, lng: number, relAlt: number) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (90 - lng) * Math.PI / 180;
  const r = GLOBE_RADIUS * (1 + relAlt);
  return {
    x: r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.cos(phi),
    z: r * Math.sin(phi) * Math.sin(theta),
  };
}

function getEntityColor(entity: Entity, selectedId: string | null): string {
  const isSelected = entity.id === selectedId;
  if (entity.type === "aircraft") {
    const ac = entity as Aircraft;
    if (ac.metadata.squawk === "7700" || ac.metadata.squawk === "7600" || ac.metadata.squawk === "7500") return "#ef4444";
    if (isSelected) return "#10b981";
    if (ac.tracked) return "#f59e0b";
    if (ac.flagged) return "#ef4444";
    if (ac.metadata.onGround) return "#475569";
    return "#00d4ff";
  }
  if (entity.type === "vessel") {
    if (isSelected) return "#22d3ee";
    if ((entity as Vessel).tracked) return "#f59e0b";
    if ((entity as Vessel).flagged) return "#ef4444";
    return "#10b981";
  }
  return "#666";
}

interface GlobePointData {
  id: string;
  lat: number;
  lng: number;
  alt: number;
  color: string;
  size: number;
  label: string;
  tooltipHtml: string;
  entity?: Entity;
}

interface SatCustomData {
  lat: number;
  lng: number;
  alt: number;
  color: string;
  size: number;
  tooltipHtml: string;
  group: string;
}

export default function ThreeGlobe({
  entities,
  infrastructure,
  zones,
  selectedEntityId,
  onSelectEntity,
  showTrails,
  showInfrastructure,
  satellites = [],
  showSatellites = false,
}: ThreeGlobeProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeRef = useRef<any>(null);
  const onSelectRef = useRef(onSelectEntity);
  onSelectRef.current = onSelectEntity;
  const initDone = useRef(false);
  const [dims, setDims] = useState({ w: 1200, h: 800 });

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) setDims({ w: Math.round(width), h: Math.round(height) });
      }
    });
    ro.observe(el);
    setDims({ w: el.clientWidth || 1200, h: el.clientHeight || 800 });
    return () => ro.disconnect();
  }, []);

  const entityPoints: GlobePointData[] = useMemo(() => {
    return entities
      .filter((e) => e.position && (e.type === "aircraft" || e.type === "vessel"))
      .map((e) => {
        const color = getEntityColor(e, selectedEntityId);
        const isSelected = e.id === selectedEntityId;
        let tooltip = "";
        let size = 0.3;

        if (e.type === "aircraft") {
          const ac = e as Aircraft;
          const spd = ac.metadata.velocity ? (ac.metadata.velocity * 3.6).toFixed(0) : "N/A";
          size = isSelected ? 0.6 : ac.metadata.onGround ? 0.15 : 0.35;
          tooltip = `<div class="argos-globe-tt">
            <strong style="color:${color}">${ac.label}</strong><br/>
            <span class="dim">${ac.metadata.originCountry}</span><br/>
            Alt: ${ac.metadata.baroAltitude?.toFixed(0) ?? "N/A"} m | Vit: ${spd} km/h
          </div>`;
        } else if (e.type === "vessel") {
          const vs = e as Vessel;
          const spd = vs.metadata.speed != null ? vs.metadata.speed.toFixed(1) : "N/A";
          size = isSelected ? 0.55 : 0.3;
          tooltip = `<div class="argos-globe-tt">
            <strong style="color:${color}">${vs.label}</strong><br/>
            <span class="dim">${vs.metadata.shipType ?? "Navire"}</span><br/>
            Vit: ${spd} kts
          </div>`;
        }

        return {
          id: e.id,
          lat: e.position!.lat,
          lng: e.position!.lng,
          alt: 0.001,
          color,
          size,
          label: e.label,
          tooltipHtml: tooltip,
          entity: e,
        };
      });
  }, [entities, selectedEntityId]);

  const infraPoints: GlobePointData[] = useMemo(() => {
    if (!showInfrastructure) return [];
    return infrastructure
      .filter((i) => i.position)
      .map((i) => {
        const cfg = INFRA_ICONS[i.metadata.category] ?? { icon: "\u{1F4CD}", color: "#666" };
        return {
          id: i.id,
          lat: i.position!.lat,
          lng: i.position!.lng,
          alt: 0.002,
          color: cfg.color,
          size: i.metadata.importance === "critical" ? 0.3 : 0.2,
          label: i.metadata.name,
          tooltipHtml: `<div class="argos-globe-tt">
            <span>${cfg.icon}</span> <strong style="color:${cfg.color}">${i.metadata.name}</strong><br/>
            ${i.metadata.category.replace("_", " ").toUpperCase()}
          </div>`,
          entity: i as unknown as Entity,
        };
      });
  }, [infrastructure, showInfrastructure]);

  const surfacePoints = useMemo(
    () => [...entityPoints, ...infraPoints],
    [entityPoints, infraPoints]
  );

  const satCustomData: SatCustomData[] = useMemo(() => {
    if (!showSatellites) return [];
    return satellites.map((s) => {
      const color = SAT_GROUP_COLORS[s.group] ?? "#f59e0b";
      const altFraction = s.alt / EARTH_RADIUS_KM;
      const velKmh = (s.velocity * 3.6).toFixed(0);
      return {
        lat: s.lat,
        lng: s.lng,
        alt: altFraction,
        color,
        size: s.group === "starlink" ? 0.3 : 0.5,
        group: s.group,
        tooltipHtml: `<div class="argos-globe-tt">
          <strong style="color:${color}">${s.name}</strong><br/>
          <span class="dim">${s.group.toUpperCase()}</span><br/>
          Alt: ${Math.round(s.alt)} km | Vit: ${velKmh} km/h
        </div>`,
      };
    });
  }, [satellites, showSatellites]);

  const trailPaths = useMemo(() => {
    if (!showTrails) return [];
    return entities
      .filter((e) => e.position && e.trail.length > 1 && (e.tracked || e.id === selectedEntityId))
      .map((e) => {
        const color = getEntityColor(e, selectedEntityId);
        return {
          coords: e.trail.map((p) => ({ lat: p.lat, lng: p.lng })),
          color,
        };
      });
  }, [entities, selectedEntityId, showTrails]);

  const zonePolygons = useMemo(() => {
    return zones
      .filter((z) => z.active && z.polygon.length >= 3)
      .map((z) => ({
        coords: [...z.polygon.map(([lat, lng]) => ({ lat, lng })), { lat: z.polygon[0][0], lng: z.polygon[0][1] }],
        color: z.color,
        label: z.name,
      }));
  }, [zones]);

  const handlePointClick = useCallback(
    (point: object) => {
      const p = point as GlobePointData;
      if (p?.entity) {
        onSelectRef.current(p.entity);
      }
    },
    []
  );

  const createSatObject = useCallback((d: object) => {
    const sat = d as SatCustomData;
    const geo = new THREE.SphereGeometry(sat.size, 8, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(sat.color),
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);

    const glowGeo = new THREE.SphereGeometry(sat.size * 2.5, 8, 6);
    const glowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(sat.color),
      transparent: true,
      opacity: 0.15,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);

    const group = new THREE.Group();
    group.add(mesh);
    group.add(glow);
    return group;
  }, []);

  const updateSatObject = useCallback((obj: object, d: object) => {
    const sat = d as SatCustomData;
    const pos = polar2Cartesian(sat.lat, sat.lng, sat.alt);
    const group = obj as THREE.Group;
    group.position.set(pos.x, pos.y, pos.z);
  }, []);

  useEffect(() => {
    if (!globeRef.current || initDone.current) return;
    initDone.current = true;
    const globe = globeRef.current;
    globe.pointOfView({ lat: 46.6, lng: 2.3, altitude: 2.5 });
    const controls = globe.controls();
    if (controls) {
      controls.autoRotate = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.minDistance = 101;
    }
  });

  return (
    <>
      <style>{`
        .argos-globe-tt {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: #e2e8f0;
          padding: 6px 10px;
          background: #1a2332ee;
          border: 1px solid #1e3a5f;
          border-radius: 4px;
          line-height: 1.5;
          backdrop-filter: blur(8px);
          pointer-events: none;
        }
        .argos-globe-tt .dim { color: #64748b; }
        .argos-globe-tt strong { font-weight: 600; }
        .scene-tooltip {
          font-family: 'JetBrains Mono', monospace !important;
          pointer-events: none !important;
        }
      `}</style>
      <div ref={wrapperRef} style={{ width: "100%", height: "100%", background: "#000005" }}>
        <GlobeComponent
          ref={globeRef}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
          atmosphereColor="#0891b2"
          atmosphereAltitude={0.15}
          width={dims.w}
          height={dims.h}

          pointsData={surfacePoints}
          pointLat="lat"
          pointLng="lng"
          pointAltitude="alt"
          pointColor="color"
          pointRadius="size"
          pointsMerge={false}
          pointLabel="tooltipHtml"
          onPointClick={handlePointClick}

          customLayerData={satCustomData}
          customThreeObject={createSatObject}
          customThreeObjectUpdate={updateSatObject}
          customLayerLabel={(d: object) => (d as SatCustomData).tooltipHtml}

          pathsData={trailPaths}
          pathPoints="coords"
          pathPointLat="lat"
          pathPointLng="lng"
          pathColor="color"
          pathStroke={1.5}
          pathDashLength={0.01}
          pathDashGap={0.01}
          pathDashAnimateTime={3000}

          polygonsData={zonePolygons}
          polygonCapColor={() => "rgba(0, 212, 255, 0.06)"}
          polygonSideColor={() => "rgba(0, 212, 255, 0.12)"}
          polygonStrokeColor={() => "#00d4ff55"}
          polygonLabel={(d: object) => {
            const zone = d as { label: string; color: string };
            return `<div class="argos-globe-tt"><strong style="color:${zone.color}">${zone.label}</strong></div>`;
          }}
        />
      </div>
    </>
  );
}
