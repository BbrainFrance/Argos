"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Aircraft } from "@/types";

interface LeafletMapProps {
  aircraft: Aircraft[];
  onSelectAircraft: (ac: Aircraft) => void;
}

const FRANCE_CENTER: [number, number] = [46.6, 2.3];
const DEFAULT_ZOOM = 6;

export default function LeafletMap({ aircraft, onSelectAircraft }: LeafletMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: FRANCE_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!markersRef.current) return;
    markersRef.current.clearLayers();

    aircraft.forEach((ac) => {
      if (!ac.latitude || !ac.longitude) return;

      const rotation = ac.trueTrack ?? 0;
      const color = ac.onGround ? "#64748b" : "#00d4ff";
      const size = ac.onGround ? 6 : 8;

      const icon = L.divIcon({
        className: "aircraft-marker",
        html: `<div style="
          width: ${size}px;
          height: ${size}px;
          background: ${color};
          border-radius: 50%;
          box-shadow: 0 0 ${ac.onGround ? 4 : 8}px ${color}80;
          transform: rotate(${rotation}deg);
          cursor: pointer;
        "></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([ac.latitude, ac.longitude], { icon })
        .on("click", () => onSelectAircraft(ac));

      marker.bindTooltip(
        `<div style="font-family: monospace; font-size: 10px; background: #1a2332; color: #e2e8f0; padding: 4px 8px; border: 1px solid #1e3a5f; border-radius: 4px;">
          <strong style="color: #00d4ff;">${ac.callsign ?? ac.icao24}</strong><br/>
          ${ac.originCountry}<br/>
          Alt: ${ac.baroAltitude?.toFixed(0) ?? "N/A"} m<br/>
          Vit: ${ac.velocity ? (ac.velocity * 3.6).toFixed(0) : "N/A"} km/h
        </div>`,
        { className: "argos-tooltip", direction: "top", offset: [0, -8] }
      );

      markersRef.current!.addLayer(marker);
    });
  }, [aircraft, onSelectAircraft]);

  return <div ref={containerRef} className="w-full h-full" />;
}
