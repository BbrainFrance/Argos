"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Entity, Aircraft, Vessel, Infrastructure, ZoneOfInterest, OperationalMarker, MissionRoute, EntityLink, SatellitePosition, CellTower } from "@/types";
import { INFRA_ICONS } from "@/lib/infrastructure";
import {
  generateNATOSymbol,
  getAircraftAffiliation,
  getAircraftModifier,
  getVesselAffiliation,
  getVesselModifier,
} from "@/lib/nato-symbols";
import { predictTrajectory } from "@/lib/interpolation";

interface LeafletMapProps {
  entities: Entity[];
  infrastructure: Infrastructure[];
  zones: ZoneOfInterest[];
  selectedEntityId: string | null;
  onSelectEntity: (entity: Entity) => void;
  showTrails: boolean;
  showInfrastructure: boolean;
  showSatellite?: boolean;
  showSentinel?: boolean;
  gibsDate?: string;
  gibsProduct?: string;
  drawMode?: boolean;
  measureMode?: boolean;
  operationalMarkers?: OperationalMarker[];
  placeMarkerMode?: boolean;
  missionPlanMode?: boolean;
  missionRoutes?: MissionRoute[];
  activeMissionWaypoints?: MissionRoute["waypoints"];
  onMapClick?: (latlng: { lat: number; lng: number }) => void;
  entityLinks?: EntityLink[];
  satellites?: SatellitePosition[];
  cellTowers?: CellTower[];
  showSatellites?: boolean;
  showCellTowers?: boolean;
  onMissionWaypointAdd?: (latlng: { lat: number; lng: number }) => void;
  onZoneDrawn?: (polygon: [number, number][]) => void;
  onBoundsChange?: (bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number }) => void;
}

const FRANCE_CENTER: [number, number] = [46.6, 2.3];

export default function LeafletMap({
  entities,
  infrastructure,
  zones,
  selectedEntityId,
  onSelectEntity,
  showTrails,
  showInfrastructure,
  showSatellite = false,
  showSentinel = false,
  gibsDate,
  gibsProduct,
  drawMode = false,
  measureMode = false,
  operationalMarkers = [],
  placeMarkerMode = false,
  missionPlanMode = false,
  missionRoutes = [],
  activeMissionWaypoints = [],
  entityLinks = [],
  satellites = [],
  cellTowers = [],
  showSatellites = false,
  showCellTowers = false,
  onMapClick,
  onMissionWaypointAdd,
  onZoneDrawn,
  onBoundsChange,
}: LeafletMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const entityLayerRef = useRef<L.LayerGroup | null>(null);
  const trailLayerRef = useRef<L.LayerGroup | null>(null);
  const infraLayerRef = useRef<L.LayerGroup | null>(null);
  const zoneLayerRef = useRef<L.LayerGroup | null>(null);
  const satLayerRef = useRef<L.TileLayer | null>(null);
  const sentinelLayerRef = useRef<L.TileLayer | null>(null);
  const measureLayerRef = useRef<L.LayerGroup | null>(null);
  const opsLayerRef = useRef<L.LayerGroup | null>(null);
  const predictionLayerRef = useRef<L.LayerGroup | null>(null);
  const missionLayerRef = useRef<L.LayerGroup | null>(null);
  const linkLayerRef = useRef<L.LayerGroup | null>(null);
  const satLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const cellLayerRef = useRef<L.LayerGroup | null>(null);
  const measurePointsRef = useRef<L.LatLng[]>([]);
  const entityMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const drawPointsRef = useRef<[number, number][]>([]);
  const drawLayerRef = useRef<L.LayerGroup | null>(null);
  const onZoneDrawnRef = useRef(onZoneDrawn);
  onZoneDrawnRef.current = onZoneDrawn;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onMissionWaypointAddRef = useRef(onMissionWaypointAdd);
  onMissionWaypointAddRef.current = onMissionWaypointAdd;
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: FRANCE_CENTER,
      zoom: 6,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    entityLayerRef.current = L.layerGroup().addTo(map);
    trailLayerRef.current = L.layerGroup().addTo(map);
    infraLayerRef.current = L.layerGroup().addTo(map);
    zoneLayerRef.current = L.layerGroup().addTo(map);
    drawLayerRef.current = L.layerGroup().addTo(map);
    measureLayerRef.current = L.layerGroup().addTo(map);
    opsLayerRef.current = L.layerGroup().addTo(map);
    predictionLayerRef.current = L.layerGroup().addTo(map);
    missionLayerRef.current = L.layerGroup().addTo(map);
    linkLayerRef.current = L.layerGroup().addTo(map);
    satLayerGroupRef.current = L.layerGroup().addTo(map);
    cellLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const emitBounds = () => {
      const b = map.getBounds();
      onBoundsChangeRef.current?.({
        latMin: b.getSouth(),
        latMax: b.getNorth(),
        lonMin: b.getWest(),
        lonMax: b.getEast(),
      });
    };
    map.on("moveend", emitBounds);
    setTimeout(emitBounds, 100);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const onSelectEntityRef = useRef(onSelectEntity);
  onSelectEntityRef.current = onSelectEntity;

  // Satellite layer toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (showSatellite && !satLayerRef.current) {
      satLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19, attribution: "Esri, Maxar" }
      ).addTo(map);
    } else if (!showSatellite && satLayerRef.current) {
      map.removeLayer(satLayerRef.current);
      satLayerRef.current = null;
    }
  }, [showSatellite]);

  // NASA GIBS imagery layer with temporal navigation
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (sentinelLayerRef.current) {
      map.removeLayer(sentinelLayerRef.current);
      sentinelLayerRef.current = null;
    }

    if (showSentinel) {
      const dateStr = gibsDate || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 3);
        return d.toISOString().slice(0, 10);
      })();

      const product = gibsProduct || "MODIS_Terra_CorrectedReflectance_TrueColor";
      const ext = product.includes("NDVI") ? "png" : "jpg";
      const maxZoom = product.includes("NDVI") ? 8 : 9;

      sentinelLayerRef.current = L.tileLayer(
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${product}/default/${dateStr}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.${ext}`,
        {
          maxZoom,
          attribution: `NASA GIBS — ${dateStr}`,
          opacity: 0.85,
        }
      ).addTo(map);
    }
  }, [showSentinel, gibsDate, gibsProduct]);

  // Operational markers (blue/red force, intel)
  useEffect(() => {
    if (!opsLayerRef.current) return;
    opsLayerRef.current.clearLayers();

    operationalMarkers.forEach((m) => {
      const size = 28;
      const domain: "land" | "sea" | "air" = m.category === "naval" ? "sea" : "land";

      const CATEGORY_MODS: Record<string, string> = {
        infantry: "INF", armor: "ARM", artillery: "ART", air_defense: "AD",
        logistics: "LOG", command: "CMD", recon: "RCN", engineering: "ENG",
        naval: "NAV", special_ops: "SOF", medical: "MED", observation: "OBS",
        threat: "THR", ied: "IED", checkpoint: "CP", hq: "HQ", custom: "",
      };

      const svgHtml = generateNATOSymbol({
        affiliation: m.affiliation,
        domain,
        size,
        modifier: CATEGORY_MODS[m.category] ?? "",
      });

      const icon = L.divIcon({
        className: "ops-marker",
        html: `<div style="cursor:pointer;">${svgHtml}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([m.position.lat, m.position.lng], { icon, zIndexOffset: 500 });

      const affLabel = m.affiliation === "friendly" ? "AMI" : m.affiliation === "hostile" ? "HOSTILE" : m.affiliation === "suspect" ? "SUSPECT" : "NEUTRE";
      marker.bindTooltip(
        `<div style="font-family:monospace;font-size:10px;background:#1a2332ee;color:#e2e8f0;padding:6px 10px;border:1px solid #1e3a5f;border-radius:4px;min-width:140px;">
          <strong>${m.label}</strong> <span style="color:#64748b;font-size:8px;">[${affLabel}]</span><br/>
          <span style="color:#64748b;">${m.category.replace("_", " ").toUpperCase()}</span><br/>
          ${m.notes ? `<span style="color:#94a3b8;">${m.notes}</span><br/>` : ""}
          ${m.weaponRange ? `Portee: ${m.weaponRange} km` : ""}
        </div>`,
        { className: "argos-tooltip", direction: "top", offset: [0, -14] }
      );

      opsLayerRef.current!.addLayer(marker);

      if (m.weaponRange) {
        const rangeColor = m.affiliation === "hostile" || m.affiliation === "suspect" ? "#ff404060" : "#4080ff40";
        const rangeBorder = m.affiliation === "hostile" || m.affiliation === "suspect" ? "#ff4040" : "#4080ff";
        const circle = L.circle([m.position.lat, m.position.lng], {
          radius: m.weaponRange * 1000,
          color: rangeBorder,
          fillColor: rangeColor,
          fillOpacity: 0.15,
          weight: 1.5,
          dashArray: "6 4",
        });
        opsLayerRef.current!.addLayer(circle);
      }
    });
  }, [operationalMarkers]);

  // Entity links rendering
  useEffect(() => {
    if (!linkLayerRef.current) return;
    linkLayerRef.current.clearLayers();

    const LINK_COLORS: Record<string, string> = {
      escort: "#4080ff", surveillance: "#ff4040", supply: "#f59e0b",
      command: "#8b5cf6", comms: "#06b6d4", threat: "#ef4444", unknown: "#64748b",
    };

    const LINK_DASH: Record<string, string | undefined> = {
      escort: undefined, surveillance: "6 4", supply: "4 4",
      command: "2 6", comms: "8 2", threat: "2 2", unknown: "4 8",
    };

    entityLinks.forEach((link) => {
      const source = entities.find((e) => e.id === link.sourceId);
      const target = entities.find((e) => e.id === link.targetId);
      if (!source?.position || !target?.position) return;

      const color = LINK_COLORS[link.type] ?? "#64748b";
      const dash = LINK_DASH[link.type];

      const line = L.polyline(
        [[source.position.lat, source.position.lng], [target.position.lat, target.position.lng]],
        { color, weight: 2, opacity: 0.6, dashArray: dash }
      );

      const midLat = (source.position.lat + target.position.lat) / 2;
      const midLng = (source.position.lng + target.position.lng) / 2;

      const typeLabel = link.type.toUpperCase();
      line.bindTooltip(
        `<div style="font-family:monospace;font-size:9px;background:#1a2332ee;color:#e2e8f0;padding:3px 6px;border:1px solid ${color};border-radius:3px;">
          <span style="color:${color};">${typeLabel}</span>${link.label ? ` — ${link.label}` : ""}
        </div>`,
        { className: "argos-tooltip", permanent: false, direction: "center", offset: [0, 0] }
      );

      linkLayerRef.current!.addLayer(line);

      linkLayerRef.current!.addLayer(
        L.circleMarker([midLat, midLng], { radius: 3, color, fillColor: color, fillOpacity: 0.5, weight: 1 })
      );
    });
  }, [entityLinks, entities]);

  // Mission routes rendering
  useEffect(() => {
    if (!missionLayerRef.current) return;
    missionLayerRef.current.clearLayers();

    const WP_COLORS: Record<string, string> = {
      start: "#00ff00", waypoint: "#ffffff", objective: "#ff4040", rally: "#f59e0b", extraction: "#8b5cf6",
    };

    const allRoutes = [...missionRoutes];
    if (activeMissionWaypoints.length > 0) {
      allRoutes.push({
        id: "__active__",
        name: "En cours",
        waypoints: activeMissionWaypoints,
        color: "#00ffaa",
        createdBy: "operator",
        createdAt: new Date(),
      });
    }

    allRoutes.forEach((route) => {
      if (route.waypoints.length < 1) return;

      if (route.waypoints.length > 1) {
        const latlngs = route.waypoints.map((wp) => [wp.position.lat, wp.position.lng] as [number, number]);
        missionLayerRef.current!.addLayer(
          L.polyline(latlngs, {
            color: route.color,
            weight: 2.5,
            opacity: 0.8,
            dashArray: route.id === "__active__" ? "8 4" : undefined,
          })
        );
      }

      route.waypoints.forEach((wp, i) => {
        const color = WP_COLORS[wp.type] ?? "#ffffff";
        const isObjective = wp.type === "objective";
        const radius = isObjective ? 8 : 5;

        const circle = L.circleMarker([wp.position.lat, wp.position.lng], {
          radius,
          color,
          fillColor: color,
          fillOpacity: isObjective ? 0.5 : 0.3,
          weight: 2,
        });

        circle.bindTooltip(
          `<div style="font-family:monospace;font-size:9px;background:#1a2332ee;color:#e2e8f0;padding:4px 8px;border:1px solid ${color};border-radius:3px;">
            <strong style="color:${color};">${wp.label || `WP-${i + 1}`}</strong><br/>
            <span style="color:#64748b;">${wp.type.toUpperCase()}</span>
          </div>`,
          { className: "argos-tooltip", direction: "top", offset: [0, -8] }
        );

        missionLayerRef.current!.addLayer(circle);
      });
    });
  }, [missionRoutes, activeMissionWaypoints]);

  // Satellite constellation rendering
  useEffect(() => {
    if (!satLayerGroupRef.current) return;
    satLayerGroupRef.current.clearLayers();
    if (!showSatellites) return;

    const GROUP_COLORS: Record<string, string> = {
      gps: "#f59e0b", galileo: "#3b82f6", glonass: "#ef4444",
      iridium: "#06b6d4", starlink: "#a855f7", military: "#dc2626", "french-mil": "#2563eb",
    };

    satellites.forEach((sat) => {
      const color = GROUP_COLORS[sat.group] ?? "#f59e0b";
      const size = sat.group === "starlink" ? 3 : 5;

      const marker = L.circleMarker([sat.lat, sat.lng], {
        radius: size,
        color,
        fillColor: color,
        fillOpacity: 0.6,
        weight: 1,
      });

      marker.bindTooltip(
        `<div style="font-family:monospace;font-size:9px;background:#1a2332ee;color:#e2e8f0;padding:4px 8px;border:1px solid ${color};border-radius:3px;">
          <strong style="color:${color};">${sat.name}</strong><br/>
          <span style="color:#64748b;">${sat.group.toUpperCase()}</span><br/>
          Alt: ${Math.round(sat.alt)} km | Vit: ${(sat.velocity).toFixed(1)} km/s
        </div>`,
        { className: "argos-tooltip", direction: "top", offset: [0, -6] }
      );

      satLayerGroupRef.current!.addLayer(marker);
    });
  }, [satellites, showSatellites]);

  // Cell tower rendering
  useEffect(() => {
    if (!cellLayerRef.current) return;
    cellLayerRef.current.clearLayers();
    if (!showCellTowers) return;

    cellTowers.forEach((tower) => {
      const radioColor = tower.radio === "LTE" ? "#ef4444" : tower.radio === "UMTS" ? "#f59e0b" : tower.radio === "GSM" ? "#10b981" : "#8b5cf6";

      const marker = L.circleMarker([tower.lat, tower.lng], {
        radius: 4,
        color: radioColor,
        fillColor: radioColor,
        fillOpacity: 0.7,
        weight: 1,
      });

      const rangeCircle = L.circle([tower.lat, tower.lng], {
        radius: tower.range,
        color: radioColor,
        fillColor: radioColor,
        fillOpacity: 0.04,
        weight: 0.5,
        dashArray: "4 4",
      });

      marker.bindTooltip(
        `<div style="font-family:monospace;font-size:9px;background:#1a2332ee;color:#e2e8f0;padding:4px 8px;border:1px solid ${radioColor};border-radius:3px;">
          <strong style="color:${radioColor};">📡 ${tower.radio}</strong><br/>
          MCC: ${tower.mcc} | MNC: ${tower.mnc}<br/>
          LAC: ${tower.lac} | Cell: ${tower.cellId}<br/>
          Portee: ${(tower.range / 1000).toFixed(1)} km
        </div>`,
        { className: "argos-tooltip", direction: "top", offset: [0, -6] }
      );

      cellLayerRef.current!.addLayer(marker);
      cellLayerRef.current!.addLayer(rangeCircle);
    });
  }, [cellTowers, showCellTowers]);

  // Disable entity interaction when in placement/mission modes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const container = map.getContainer();
    const interactionBlocked = placeMarkerMode || missionPlanMode;

    if (interactionBlocked) {
      container.classList.add("leaflet-crosshair-mode");
    } else {
      container.classList.remove("leaflet-crosshair-mode");
    }

    if (!interactionBlocked) return;

    const handler = (e: L.LeafletMouseEvent) => {
      if (placeMarkerMode) {
        onMapClickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
      } else if (missionPlanMode) {
        onMissionWaypointAddRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    };
    map.on("click", handler);

    return () => {
      map.off("click", handler);
      container.classList.remove("leaflet-crosshair-mode");
    };
  }, [placeMarkerMode, missionPlanMode]);

  // Measure mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !measureLayerRef.current) return;

    if (!measureMode) {
      measureLayerRef.current.clearLayers();
      measurePointsRef.current = [];
      map.getContainer().style.cursor = "";
      return;
    }

    map.getContainer().style.cursor = "crosshair";
    measurePointsRef.current = [];
    measureLayerRef.current.clearLayers();

    function formatDistance(meters: number): string {
      if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
      return `${Math.round(meters)} m`;
    }

    function redrawMeasure() {
      measureLayerRef.current!.clearLayers();
      const pts = measurePointsRef.current;

      for (let i = 0; i < pts.length; i++) {
        const circleMarker = L.circleMarker(pts[i], {
          radius: 4,
          color: "#00d4ff",
          fillColor: "#00d4ff",
          fillOpacity: 1,
          weight: 2,
        });
        measureLayerRef.current!.addLayer(circleMarker);
      }

      if (pts.length >= 2) {
        const polyline = L.polyline(pts, {
          color: "#00d4ff",
          weight: 2,
          opacity: 0.8,
          dashArray: "6 4",
        });
        measureLayerRef.current!.addLayer(polyline);

        let totalDist = 0;
        for (let i = 1; i < pts.length; i++) {
          totalDist += pts[i - 1].distanceTo(pts[i]);
        }

        const lastPt = pts[pts.length - 1];
        const label = L.marker(lastPt, {
          icon: L.divIcon({
            className: "measure-label",
            html: `<div style="background:#1a2332ee;color:#00d4ff;font-family:monospace;font-size:11px;padding:3px 8px;border:1px solid #00d4ff80;border-radius:3px;white-space:nowrap;font-weight:bold;">${formatDistance(totalDist)}</div>`,
            iconSize: [0, 0],
            iconAnchor: [-10, 10],
          }),
        });
        measureLayerRef.current!.addLayer(label);

        for (let i = 1; i < pts.length; i++) {
          const segDist = pts[i - 1].distanceTo(pts[i]);
          const midLat = (pts[i - 1].lat + pts[i].lat) / 2;
          const midLng = (pts[i - 1].lng + pts[i].lng) / 2;
          if (pts.length > 2) {
            const segLabel = L.marker([midLat, midLng], {
              icon: L.divIcon({
                className: "measure-seg-label",
                html: `<div style="background:#1a233299;color:#94a3b8;font-family:monospace;font-size:9px;padding:1px 4px;border:1px solid #1e3a5f;border-radius:2px;white-space:nowrap;">${formatDistance(segDist)}</div>`,
                iconSize: [0, 0],
                iconAnchor: [-8, 8],
              }),
            });
            measureLayerRef.current!.addLayer(segLabel);
          }
        }
      }
    }

    function onMeasureClick(e: L.LeafletMouseEvent) {
      measurePointsRef.current.push(e.latlng);
      redrawMeasure();
    }

    function onMeasureDblClick(e: L.LeafletMouseEvent) {
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
    }

    map.on("click", onMeasureClick);
    map.on("dblclick", onMeasureDblClick);
    map.doubleClickZoom.disable();

    return () => {
      map.off("click", onMeasureClick);
      map.off("dblclick", onMeasureDblClick);
      map.doubleClickZoom.enable();
      map.getContainer().style.cursor = "";
    };
  }, [measureMode]);

  // Render zones
  useEffect(() => {
    if (!zoneLayerRef.current) return;
    zoneLayerRef.current.clearLayers();

    zones.forEach((zone) => {
      if (!zone.active) return;
      const latlngs = zone.polygon.map(([lat, lng]) => [lat, lng] as [number, number]);
      const poly = L.polygon(latlngs, {
        color: zone.color,
        fillColor: zone.color,
        fillOpacity: 0.1,
        weight: 2,
        dashArray: zone.type === "exclusion" ? "10 5" : undefined,
      });
      poly.bindTooltip(
        `<div style="font-family:monospace;font-size:10px;background:#1a2332;color:#e2e8f0;padding:4px 8px;border:1px solid ${zone.color};border-radius:4px;"><strong style="color:${zone.color};">${zone.name}</strong><br/>${zone.type.toUpperCase()}</div>`,
        { className: "argos-tooltip", sticky: true }
      );
      zoneLayerRef.current!.addLayer(poly);
    });
  }, [zones]);

  // Render infrastructure
  useEffect(() => {
    if (!infraLayerRef.current) return;
    infraLayerRef.current.clearLayers();
    if (!showInfrastructure) return;

    infrastructure.forEach((infra) => {
      if (!infra.position) return;
      const cfg = INFRA_ICONS[infra.metadata.category] ?? { icon: "📍", color: "#666" };
      const size = infra.metadata.importance === "critical" ? 12 : 8;

      const icon = L.divIcon({
        className: "infra-marker",
        html: `<div style="width:${size}px;height:${size}px;background:${cfg.color};border:1px solid ${cfg.color}80;border-radius:2px;box-shadow:0 0 6px ${cfg.color}40;cursor:pointer;" title="${infra.metadata.name}"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([infra.position.lat, infra.position.lng], { icon });
      marker.on("click", () => onSelectEntityRef.current(infra));
      marker.bindTooltip(
        `<div style="font-family:monospace;font-size:10px;background:#1a2332;color:#e2e8f0;padding:4px 8px;border:1px solid ${cfg.color};border-radius:4px;"><span>${cfg.icon}</span> <strong style="color:${cfg.color};">${infra.metadata.name}</strong><br/>${infra.metadata.category.replace("_", " ").toUpperCase()} — ${infra.metadata.importance.toUpperCase()}</div>`,
        { className: "argos-tooltip", direction: "top", offset: [0, -8] }
      );
      infraLayerRef.current!.addLayer(marker);
    });
  }, [infrastructure, showInfrastructure]);

  // Render entities + trails
  useEffect(() => {
    if (!entityLayerRef.current || !trailLayerRef.current) return;

    trailLayerRef.current.clearLayers();

    const currentIds = new Set<string>();

    entities.forEach((entity) => {
      if (!entity.position) return;
      currentIds.add(entity.id);
      const isSelected = entity.id === selectedEntityId;
      const existing = entityMarkersRef.current.get(entity.id);

      if (entity.type === "aircraft") {
        const ac = entity as Aircraft;
        const heading = ac.metadata.trueTrack ?? undefined;
        const isGrounded = ac.metadata.onGround;
        const affiliation = getAircraftAffiliation(ac.metadata.originCountry, ac.metadata.squawk);
        const modifier = getAircraftModifier(ac.metadata.callsign, ac.metadata.squawk);
        const size = isSelected ? 26 : isGrounded ? 12 : 20;

        const svgHtml = generateNATOSymbol({
          affiliation,
          domain: isGrounded ? "land" : "air",
          size,
          heading: isGrounded ? undefined : heading,
          selected: isSelected,
          tracked: ac.tracked,
          flagged: ac.flagged,
          modifier,
        });

        const natoIcon = L.divIcon({
          className: "nato-marker",
          html: `<div style="cursor:pointer;">${svgHtml}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        if (existing) {
          existing.setLatLng([ac.position!.lat, ac.position!.lng]);
          existing.setIcon(natoIcon);
          existing.setZIndexOffset(isSelected ? 1000 : isGrounded ? -100 : 0);
        } else {
          const marker = L.marker([ac.position!.lat, ac.position!.lng], { icon: natoIcon, zIndexOffset: isSelected ? 1000 : isGrounded ? -100 : 0 });
          marker.on("click", () => onSelectEntityRef.current(entity));

          const speedKmh = ac.metadata.velocity ? (ac.metadata.velocity * 3.6).toFixed(0) : "N/A";
          const affiliationLabel = affiliation === "friendly" ? "AMI" : affiliation === "hostile" ? "HOSTILE" : affiliation === "suspect" ? "SUSPECT" : "NEUTRE";
          const squawk = ac.metadata.squawk;
          marker.bindTooltip(
            `<div style="font-family:monospace;font-size:10px;background:#1a2332ee;color:#e2e8f0;padding:6px 10px;border:1px solid #1e3a5f;border-radius:4px;min-width:140px;">
              <strong>${ac.label}</strong> <span style="color:#64748b;font-size:8px;">[${affiliationLabel}]</span><br/>
              <span style="color:#64748b;">${ac.metadata.originCountry}</span><br/>
              Alt: ${ac.metadata.baroAltitude?.toFixed(0) ?? "N/A"} m | Vit: ${speedKmh} km/h<br/>
              Cap: ${ac.metadata.trueTrack?.toFixed(0) ?? "—"}°
              ${squawk ? `<br/>Sqk: <span style="color:${squawk.startsWith("7") ? "#ef4444" : "#e2e8f0"};">${squawk}</span>` : ""}
              ${modifier ? `<br/><span style="color:#f59e0b;">${modifier}</span>` : ""}
            </div>`,
            { className: "argos-tooltip", direction: "top", offset: [0, -10] }
          );

          entityLayerRef.current!.addLayer(marker);
          entityMarkersRef.current.set(entity.id, marker);
        }

        const trailColor = affiliation === "hostile" ? "#ff4040" : affiliation === "friendly" ? "#4080ff" : "#80e080";
        if (showTrails && ac.trail.length > 1) {
          const latlngs = ac.trail.map((p) => [p.lat, p.lng] as [number, number]);
          const trailOpacity = (ac.tracked || isSelected) ? 0.7 : 0.35;
          const trailWeight = (ac.tracked || isSelected) ? 2.5 : 1.5;
          trailLayerRef.current!.addLayer(L.polyline(latlngs, { color: trailColor, weight: trailWeight, opacity: trailOpacity, dashArray: "4 4" }));
        }
      }

      if (entity.type === "vessel") {
        const vs = entity as Vessel;
        const heading = vs.metadata.course ?? vs.metadata.heading ?? undefined;
        const affiliation = getVesselAffiliation(vs.metadata.flag, vs.metadata.shipType);
        const modifier = getVesselModifier(vs.metadata.shipType);
        const size = isSelected ? 24 : 16;

        const svgHtml = generateNATOSymbol({
          affiliation,
          domain: "sea",
          size,
          heading,
          selected: isSelected,
          tracked: vs.tracked,
          flagged: vs.flagged,
          modifier,
        });

        const natoIcon = L.divIcon({
          className: "nato-marker",
          html: `<div style="cursor:pointer;">${svgHtml}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        if (existing) {
          existing.setLatLng([vs.position!.lat, vs.position!.lng]);
          existing.setIcon(natoIcon);
        } else {
          const marker = L.marker([vs.position!.lat, vs.position!.lng], { icon: natoIcon, zIndexOffset: isSelected ? 1000 : 0 });
          marker.on("click", () => onSelectEntityRef.current(entity));

          const speedKnots = vs.metadata.speed != null ? vs.metadata.speed.toFixed(1) : "N/A";
          const affiliationLabel = affiliation === "friendly" ? "AMI" : affiliation === "hostile" ? "HOSTILE" : affiliation === "unknown" ? "INCONNU" : "NEUTRE";
          marker.bindTooltip(
            `<div style="font-family:monospace;font-size:10px;background:#1a2332ee;color:#e2e8f0;padding:6px 10px;border:1px solid #1e3a5f;border-radius:4px;min-width:140px;">
              <strong>${vs.label}</strong> <span style="color:#64748b;font-size:8px;">[${affiliationLabel}]</span><br/>
              <span style="color:#64748b;">${vs.metadata.shipType ?? "Navire"}</span>
              ${vs.metadata.flag ? ` — ${vs.metadata.flag}` : ""}<br/>
              Vit: ${speedKnots} kts | Cap: ${vs.metadata.course?.toFixed(0) ?? "—"}°
              ${vs.metadata.destination ? `<br/>Dest: ${vs.metadata.destination}` : ""}
              ${modifier ? `<br/><span style="color:#f59e0b;">${modifier}</span>` : ""}
            </div>`,
            { className: "argos-tooltip", direction: "top", offset: [0, -10] }
          );

          entityLayerRef.current!.addLayer(marker);
          entityMarkersRef.current.set(entity.id, marker);
        }

        const trailColor = affiliation === "hostile" ? "#ff4040" : affiliation === "friendly" ? "#4080ff" : "#80e080";
        if (showTrails && vs.trail.length > 1) {
          const latlngs = vs.trail.map((p) => [p.lat, p.lng] as [number, number]);
          const trailOpacity = (vs.tracked || isSelected) ? 0.7 : 0.35;
          const trailWeight = (vs.tracked || isSelected) ? 2.5 : 1.5;
          trailLayerRef.current!.addLayer(L.polyline(latlngs, { color: trailColor, weight: trailWeight, opacity: trailOpacity, dashArray: "4 4" }));
        }
      }
    });

    for (const [id, marker] of entityMarkersRef.current) {
      if (!currentIds.has(id)) {
        entityLayerRef.current!.removeLayer(marker);
        entityMarkersRef.current.delete(id);
      }
    }

    if (predictionLayerRef.current) {
      predictionLayerRef.current.clearLayers();
      entities.forEach((entity) => {
        if (!entity.position) return;
        const shouldPredict = entity.tracked || entity.id === selectedEntityId;
        if (!shouldPredict) return;

        const prediction = predictTrajectory(entity, 15, 8);
        if (prediction.length < 2) return;

        const predColor = entity.type === "aircraft" ? "#ffffff" : "#00ffaa";
        const latlngs: [number, number][] = [
          [entity.position.lat, entity.position.lng],
          ...prediction.map((p) => [p.lat, p.lng] as [number, number]),
        ];

        predictionLayerRef.current!.addLayer(
          L.polyline(latlngs, { color: predColor, weight: 1.5, opacity: 0.5, dashArray: "3 6" })
        );

        const last = prediction[prediction.length - 1];
        const minutes = Math.round(last.timeOffset / 60);
        predictionLayerRef.current!.addLayer(
          L.circleMarker([last.lat, last.lng], { radius: 4, color: predColor, fillColor: predColor, fillOpacity: 0.4, weight: 1 })
            .bindTooltip(`T+${minutes}min`, { permanent: true, direction: "right", className: "prediction-tooltip", offset: [6, 0] })
        );
      });
    }
  }, [entities, selectedEntityId, showTrails]);

  // Draw mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !drawLayerRef.current) return;

    const container = map.getContainer();

    if (!drawMode) {
      container.style.cursor = "";
      drawPointsRef.current = [];
      drawLayerRef.current.clearLayers();
      return;
    }

    container.style.cursor = "crosshair";
    drawPointsRef.current = [];
    drawLayerRef.current.clearLayers();

    function onMapClick(e: L.LeafletMouseEvent) {
      const points = drawPointsRef.current;
      const dl = drawLayerRef.current!;
      points.push([e.latlng.lat, e.latlng.lng]);

      dl.clearLayers();

      points.forEach((p, i) => {
        const cm = L.circleMarker([p[0], p[1]], {
          radius: 5,
          color: "#f59e0b",
          fillColor: "#f59e0b",
          fillOpacity: i === 0 ? 0.8 : 0.5,
          weight: 2,
        });
        dl.addLayer(cm);
      });

      if (points.length > 1) {
        const line = L.polyline(points, { color: "#f59e0b", weight: 2, dashArray: "6 4" });
        dl.addLayer(line);
      }

      if (points.length >= 3) {
        const preview = L.polygon(points, {
          color: "#f59e0b",
          fillColor: "#f59e0b",
          fillOpacity: 0.08,
          weight: 1,
          dashArray: "4 4",
        });
        dl.addLayer(preview);
      }
    }

    function onDblClick(e: L.LeafletMouseEvent) {
      e.originalEvent.stopPropagation();
      e.originalEvent.preventDefault();
      const points = drawPointsRef.current;
      if (points.length >= 3 && onZoneDrawnRef.current) {
        onZoneDrawnRef.current([...points]);
      }
    }

    map.on("click", onMapClick);
    map.on("dblclick", onDblClick);
    map.doubleClickZoom.disable();

    return () => {
      map.off("click", onMapClick);
      map.off("dblclick", onDblClick);
      map.doubleClickZoom.enable();
      container.style.cursor = "";
    };
  }, [drawMode]);

  return <div ref={containerRef} className="w-full h-full" />;
}
