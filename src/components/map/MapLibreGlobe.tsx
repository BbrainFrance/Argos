"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Entity, Aircraft, Vessel, Infrastructure, ZoneOfInterest } from "@/types";
import { INFRA_ICONS } from "@/lib/infrastructure";

interface MapLibreGlobeProps {
  entities: Entity[];
  infrastructure: Infrastructure[];
  zones: ZoneOfInterest[];
  selectedEntityId: string | null;
  onSelectEntity: (entity: Entity) => void;
  showTrails: boolean;
  showInfrastructure: boolean;
  showSatellite?: boolean;
}

const GLOBE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  name: "ARGOS Globe",
  sources: {
    "esri-imagery": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Esri, Maxar, Earthstar Geographics",
    },
    "carto-labels": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
        "https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
      ],
      tileSize: 256,
      maxzoom: 19,
    },
    "ign-ortho": {
      type: "raster",
      tiles: [
        "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
      ],
      tileSize: 256,
      maxzoom: 20,
    },
    "osm-buildings": {
      type: "vector",
      tiles: [
        "https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf",
      ],
      maxzoom: 14,
    },
  },
  layers: [
    {
      id: "esri-imagery-layer",
      type: "raster",
      source: "esri-imagery",
      paint: {
        "raster-brightness-max": 0.55,
        "raster-contrast": 0.3,
        "raster-saturation": -0.3,
      },
    },
    {
      id: "ign-ortho-layer",
      type: "raster",
      source: "ign-ortho",
      minzoom: 10,
      paint: {
        "raster-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0, 12, 0.9],
      },
    },
    {
      id: "buildings-3d",
      type: "fill-extrusion",
      source: "osm-buildings",
      "source-layer": "building",
      minzoom: 13,
      paint: {
        "fill-extrusion-color": [
          "interpolate", ["linear"], ["get", "render_height"],
          0, "#1a2332",
          30, "#243447",
          100, "#2d4560",
        ],
        "fill-extrusion-height": [
          "coalesce", ["get", "render_height"], 5,
        ],
        "fill-extrusion-base": [
          "coalesce", ["get", "render_min_height"], 0,
        ],
        "fill-extrusion-opacity": 0.7,
      },
    },
    {
      id: "labels-layer",
      type: "raster",
      source: "carto-labels",
      paint: {
        "raster-opacity": 0.9,
      },
    },
  ],
};

function getEntityColor(entity: Entity, selectedId: string | null): string {
  const isSelected = entity.id === selectedId;

  if (entity.type === "aircraft") {
    const ac = entity as Aircraft;
    let c = "#00d4ff";
    if (ac.metadata.onGround) c = "#475569";
    if (ac.flagged) c = "#ef4444";
    if (ac.tracked) c = "#f59e0b";
    if (isSelected) c = "#10b981";
    const sq = ac.metadata.squawk;
    if (sq === "7700" || sq === "7600" || sq === "7500") c = "#ef4444";
    return c;
  }

  if (entity.type === "vessel") {
    let c = "#10b981";
    if ((entity as Vessel).flagged) c = "#ef4444";
    if ((entity as Vessel).tracked) c = "#f59e0b";
    if (isSelected) c = "#22d3ee";
    return c;
  }

  return "#666";
}

function getEntitySize(entity: Entity, selectedId: string | null): number {
  const isSelected = entity.id === selectedId;
  if (entity.type === "aircraft") {
    return isSelected ? 10 : (entity as Aircraft).metadata.onGround ? 3 : 6;
  }
  return isSelected ? 10 : 6;
}

function entitiesToGeoJSON(
  entities: Entity[],
  selectedId: string | null
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: entities
      .filter((e) => e.position && (e.type === "aircraft" || e.type === "vessel"))
      .map((e) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [e.position!.lng, e.position!.lat],
        },
        properties: {
          id: e.id,
          type: e.type,
          label: e.label,
          color: getEntityColor(e, selectedId),
          size: getEntitySize(e, selectedId),
        },
      })),
  };
}

function trailsToGeoJSON(
  entities: Entity[],
  selectedId: string | null
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: entities
      .filter((e) => e.position && e.trail.length > 1)
      .map((e) => {
        let c = e.type === "vessel" ? "#10b981" : "#00d4ff";
        if (e.flagged) c = "#ef4444";
        if (e.tracked) c = "#f59e0b";
        if (e.id === selectedId) c = e.type === "vessel" ? "#22d3ee" : "#10b981";

        return {
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: e.trail.map((p) => [p.lng, p.lat]),
          },
          properties: { color: c },
        };
      }),
  };
}

function zonesToGeoJSON(zones: ZoneOfInterest[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: zones
      .filter((z) => z.active && z.polygon.length >= 3)
      .map((z) => ({
        type: "Feature" as const,
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              ...z.polygon.map(([lat, lng]) => [lng, lat]),
              [z.polygon[0][1], z.polygon[0][0]],
            ],
          ],
        },
        properties: {
          id: z.id,
          name: z.name,
          color: z.color,
          type: z.type,
        },
      })),
  };
}

function infraToGeoJSON(infrastructure: Infrastructure[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: infrastructure
      .filter((i) => i.position)
      .map((i) => {
        const cfg = INFRA_ICONS[i.metadata.category] ?? { icon: "\u{1F4CD}", color: "#666" };
        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [i.position!.lng, i.position!.lat],
          },
          properties: {
            id: i.id,
            name: i.metadata.name,
            category: i.metadata.category,
            importance: i.metadata.importance,
            color: cfg.color,
            size: i.metadata.importance === "critical" ? 8 : 5,
          },
        };
      }),
  };
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export default function MapLibreGlobe({
  entities,
  infrastructure,
  zones,
  selectedEntityId,
  onSelectEntity,
  showTrails,
  showInfrastructure,
  showSatellite = false,
}: MapLibreGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const onSelectRef = useRef(onSelectEntity);
  onSelectRef.current = onSelectEntity;
  const entityMapRef = useRef<Map<string, Entity>>(new Map());
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: GLOBE_STYLE,
      center: [2.3, 46.6],
      zoom: 4,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    map.on("style.load", () => {
      try {
        map.setProjection({ type: "globe" });
        map.setSky({
          "sky-color": "#040a15",
          "sky-horizon-blend": 0.5,
          "horizon-color": "#0d1b2a",
          "horizon-fog-blend": 0.7,
          "fog-color": "#020810",
          "fog-ground-blend": 0.9,
        });
      } catch {
        /* v4 fallback */
      }

      map.addSource("entities", { type: "geojson", data: EMPTY_FC });
      map.addSource("trails", { type: "geojson", data: EMPTY_FC });
      map.addSource("zones", { type: "geojson", data: EMPTY_FC });
      map.addSource("infra", { type: "geojson", data: EMPTY_FC });

      map.addLayer({
        id: "zones-fill",
        type: "fill",
        source: "zones",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.15 },
      });
      map.addLayer({
        id: "zones-outline",
        type: "line",
        source: "zones",
        paint: { "line-color": ["get", "color"], "line-width": 2, "line-opacity": 0.6 },
      });
      map.addLayer({
        id: "trails-line",
        type: "line",
        source: "trails",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2,
          "line-opacity": 0.6,
          "line-dasharray": [4, 4],
        },
      });
      map.addLayer({
        id: "infra-circle",
        type: "circle",
        source: "infra",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["get", "size"],
          "circle-opacity": 0.9,
          "circle-stroke-width": 1,
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-opacity": 0.3,
        },
      });
      map.addLayer({
        id: "entities-glow",
        type: "circle",
        source: "entities",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["*", ["get", "size"], 2],
          "circle-opacity": 0.15,
          "circle-blur": 1,
        },
      });
      map.addLayer({
        id: "entities-circle",
        type: "circle",
        source: "entities",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["get", "size"],
          "circle-opacity": 0.9,
          "circle-stroke-width": 0,
        },
      });

      setMapReady(true);
    });

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "argos-globe-popup",
      maxWidth: "260px",
    });
    popupRef.current = popup;

    map.on("mouseenter", "entities-circle", (e) => {
      map.getCanvas().style.cursor = "pointer";
      if (!e.features?.length) return;
      const props = e.features[0].properties;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      const ent = entityMapRef.current.get(props.id as string);
      if (!ent) return;

      let html = "";
      if (ent.type === "aircraft") {
        const ac = ent as Aircraft;
        const spd = ac.metadata.velocity ? (ac.metadata.velocity * 3.6).toFixed(0) : "N/A";
        html = `<div class="argos-tt">
          <strong style="color:${props.color}">${ac.label}</strong><br/>
          <span class="dim">${ac.metadata.originCountry}</span><br/>
          Alt: ${ac.metadata.baroAltitude?.toFixed(0) ?? "N/A"} m | Vit: ${spd} km/h<br/>
          Cap: ${ac.metadata.trueTrack?.toFixed(0) ?? "\u2014"}\u00B0
          ${ac.metadata.squawk ? `<br/>Sqk: <span style="color:${String(ac.metadata.squawk).startsWith("7") ? "#ef4444" : "#e2e8f0"}">${ac.metadata.squawk}</span>` : ""}
        </div>`;
      } else if (ent.type === "vessel") {
        const vs = ent as Vessel;
        const spd = vs.metadata.speed != null ? vs.metadata.speed.toFixed(1) : "N/A";
        html = `<div class="argos-tt">
          <strong style="color:${props.color}">${vs.label}</strong><br/>
          <span class="dim">${vs.metadata.shipType ?? "Navire"}</span>${vs.metadata.flag ? ` \u2014 ${vs.metadata.flag}` : ""}<br/>
          Vit: ${spd} kts | Cap: ${vs.metadata.course?.toFixed(0) ?? "\u2014"}\u00B0
          ${vs.metadata.destination ? `<br/>Dest: ${vs.metadata.destination}` : ""}
        </div>`;
      }
      popup.setLngLat(coords).setHTML(html).addTo(map);
    });
    map.on("mouseleave", "entities-circle", () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });

    map.on("mouseenter", "infra-circle", (e) => {
      map.getCanvas().style.cursor = "pointer";
      if (!e.features?.length) return;
      const props = e.features[0].properties;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      const cfg = INFRA_ICONS[props.category as string] ?? { icon: "\u{1F4CD}", color: "#666" };

      popup
        .setLngLat(coords)
        .setHTML(
          `<div class="argos-tt">
            <span>${cfg.icon}</span> <strong style="color:${cfg.color}">${props.name}</strong><br/>
            ${String(props.category).replace("_", " ").toUpperCase()} \u2014 ${String(props.importance).toUpperCase()}
          </div>`
        )
        .addTo(map);
    });
    map.on("mouseleave", "infra-circle", () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });

    map.on("click", "entities-circle", (e) => {
      if (!e.features?.length) return;
      const ent = entityMapRef.current.get(e.features[0].properties.id as string);
      if (ent) onSelectRef.current(ent);
    });
    map.on("click", "infra-circle", (e) => {
      if (!e.features?.length) return;
      const ent = entityMapRef.current.get(e.features[0].properties.id as string);
      if (ent) onSelectRef.current(ent);
    });

    mapRef.current = map;

    return () => {
      popup.remove();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Toggle satellite brightness
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    try {
      if (showSatellite) {
        map.setPaintProperty("esri-imagery-layer", "raster-brightness-max", 1.0);
        map.setPaintProperty("esri-imagery-layer", "raster-contrast", 0.1);
        map.setPaintProperty("esri-imagery-layer", "raster-saturation", 0.0);
      } else {
        map.setPaintProperty("esri-imagery-layer", "raster-brightness-max", 0.55);
        map.setPaintProperty("esri-imagery-layer", "raster-contrast", 0.3);
        map.setPaintProperty("esri-imagery-layer", "raster-saturation", -0.3);
      }
    } catch { /* layer not ready yet */ }
  }, [mapReady, showSatellite]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    entityMapRef.current.clear();
    for (const e of entities) entityMapRef.current.set(e.id, e);
    for (const i of infrastructure) entityMapRef.current.set(i.id, i);

    const src = (id: string) => map.getSource(id) as maplibregl.GeoJSONSource | undefined;

    src("entities")?.setData(entitiesToGeoJSON(entities, selectedEntityId));
    src("trails")?.setData(showTrails ? trailsToGeoJSON(entities, selectedEntityId) : EMPTY_FC);
    src("zones")?.setData(zonesToGeoJSON(zones));
    src("infra")?.setData(showInfrastructure ? infraToGeoJSON(infrastructure) : EMPTY_FC);
  }, [mapReady, entities, infrastructure, zones, selectedEntityId, showTrails, showInfrastructure]);

  return (
    <>
      <style>{`
        .argos-globe-popup .maplibregl-popup-content {
          background: #1a2332ee;
          border: 1px solid #1e3a5f;
          border-radius: 4px;
          padding: 0;
          box-shadow: 0 4px 20px rgba(0,0,0,.5);
        }
        .argos-globe-popup .maplibregl-popup-tip {
          border-top-color: #1a2332ee;
        }
        .argos-tt {
          font-family: monospace;
          font-size: 10px;
          color: #e2e8f0;
          padding: 6px 10px;
          line-height: 1.5;
        }
        .argos-tt .dim { color: #64748b; }
        .maplibregl-ctrl-group {
          background: #1a2332 !important;
          border: 1px solid #1e3a5f !important;
        }
        .maplibregl-ctrl-group button {
          filter: invert(1);
        }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
    </>
  );
}
