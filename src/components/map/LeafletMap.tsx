"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Entity, Aircraft, Infrastructure, ZoneOfInterest } from "@/types";
import { INFRA_ICONS } from "@/lib/infrastructure";

interface LeafletMapProps {
  entities: Entity[];
  infrastructure: Infrastructure[];
  zones: ZoneOfInterest[];
  selectedEntityId: string | null;
  onSelectEntity: (entity: Entity) => void;
  showTrails: boolean;
  showInfrastructure: boolean;
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
}: LeafletMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const entityLayerRef = useRef<L.LayerGroup | null>(null);
  const trailLayerRef = useRef<L.LayerGroup | null>(null);
  const infraLayerRef = useRef<L.LayerGroup | null>(null);
  const zoneLayerRef = useRef<L.LayerGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const onSelectEntityRef = useRef(onSelectEntity);
  onSelectEntityRef.current = onSelectEntity;

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
    entityLayerRef.current.clearLayers();
    trailLayerRef.current.clearLayers();

    entities.forEach((entity) => {
      if (entity.type !== "aircraft" || !entity.position) return;
      const ac = entity as Aircraft;
      const isSelected = entity.id === selectedEntityId;
      const rotation = ac.metadata.trueTrack ?? 0;
      const isGrounded = ac.metadata.onGround;

      let color = "#00d4ff";
      if (isGrounded) color = "#475569";
      if (ac.flagged) color = "#ef4444";
      if (ac.tracked) color = "#f59e0b";
      if (isSelected) color = "#10b981";

      const squawk = ac.metadata.squawk;
      if (squawk === "7700" || squawk === "7600" || squawk === "7500") color = "#ef4444";

      const size = isSelected ? 12 : isGrounded ? 4 : 7;

      const icon = L.divIcon({
        className: "aircraft-marker",
        html: `<div style="
          width:0;height:0;
          border-left:${size/2}px solid transparent;
          border-right:${size/2}px solid transparent;
          border-bottom:${size}px solid ${color};
          filter: drop-shadow(0 0 ${isSelected ? 8 : 4}px ${color}80);
          transform:rotate(${rotation}deg);
          cursor:pointer;
          transition:all 0.3s;
        "></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([ac.position!.lat, ac.position!.lng], { icon, zIndexOffset: isSelected ? 1000 : isGrounded ? -100 : 0 });
      marker.on("click", () => onSelectEntityRef.current(entity));

      const speedKmh = ac.metadata.velocity ? (ac.metadata.velocity * 3.6).toFixed(0) : "N/A";
      marker.bindTooltip(
        `<div style="font-family:monospace;font-size:10px;background:#1a2332ee;color:#e2e8f0;padding:6px 10px;border:1px solid #1e3a5f;border-radius:4px;min-width:120px;">
          <strong style="color:${color};">${ac.label}</strong><br/>
          <span style="color:#64748b;">${ac.metadata.originCountry}</span><br/>
          Alt: ${ac.metadata.baroAltitude?.toFixed(0) ?? "N/A"} m<br/>
          Vit: ${speedKmh} km/h<br/>
          Cap: ${ac.metadata.trueTrack?.toFixed(0) ?? "—"}°
          ${squawk ? `<br/>Sqk: <span style="color:${squawk.startsWith("7") ? "#ef4444" : "#e2e8f0"};">${squawk}</span>` : ""}
        </div>`,
        { className: "argos-tooltip", direction: "top", offset: [0, -10] }
      );

      entityLayerRef.current!.addLayer(marker);

      // Trail
      if (showTrails && (ac.tracked || isSelected) && ac.trail.length > 1) {
        const latlngs = ac.trail.map((p) => [p.lat, p.lng] as [number, number]);
        const polyline = L.polyline(latlngs, {
          color,
          weight: 2,
          opacity: 0.6,
          dashArray: "4 4",
        });
        trailLayerRef.current!.addLayer(polyline);
      }
    });
  }, [entities, selectedEntityId, showTrails]);

  return <div ref={containerRef} className="w-full h-full" />;
}
