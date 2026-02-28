"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DeckGL, { ScatterplotLayer, PathLayer, SolidPolygonLayer } from "deck.gl";
import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { WebMercatorViewport, type Layer } from "@deck.gl/core";
import {
  Entity,
  Aircraft,
  Vessel,
  Infrastructure,
  ZoneOfInterest,
  OperationalMarker,
  MissionRoute,
  EntityLink,
  SatellitePosition,
  CellTower,
  ConflictEvent,
  FireHotspot,
  NaturalDisaster,
  CyberThreat,
  InternetOutage,
  SubmarineCable,
  Pipeline,
  MilitaryBase,
  NuclearFacility,
} from "@/types";
import { INFRA_ICONS } from "@/lib/infrastructure";
import {
  getAircraftAffiliation,
  getVesselAffiliation,
} from "@/lib/nato-symbols";
import { predictTrajectory } from "@/lib/interpolation";
import type { MapItem } from "@/components/dashboard/MapItemDetail";
import type { SIGINTTrace } from "@/components/dashboard/SIGINTPanel";

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const INITIAL_VIEW = { longitude: 2.3, latitude: 46.6, zoom: 6, maxZoom: 24, minZoom: 0, pitch: 0, bearing: 0 };

const AFFILIATION_COLORS: Record<string, [number, number, number]> = {
  friendly: [64, 128, 255],
  hostile: [255, 64, 64],
  neutral: [128, 224, 128],
  unknown: [255, 255, 128],
  suspect: [255, 176, 96],
};

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [128, 128, 128];
}

function circlePolygon(lat: number, lng: number, radiusM: number, numPoints = 64): [number, number][] {
  const points: [number, number][] = [];
  const R = 6371000;
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    const dy = (radiusM / R) * Math.cos(angle);
    const dx = (radiusM / R) * Math.sin(angle) / Math.cos((lat * Math.PI) / 180);
    points.push([lat + (dy * 180) / Math.PI, lng + (dx * 180) / Math.PI]);
  }
  return points;
}

export interface DeckGLMapProps {
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
  conflictEvents?: ConflictEvent[];
  fireHotspots?: FireHotspot[];
  naturalDisasters?: NaturalDisaster[];
  cyberThreats?: CyberThreat[];
  internetOutages?: InternetOutage[];
  submarineCables?: SubmarineCable[];
  pipelines?: Pipeline[];
  militaryBases?: MilitaryBase[];
  nuclearFacilities?: NuclearFacility[];
  onMissionWaypointAdd?: (latlng: { lat: number; lng: number }) => void;
  onZoneDrawn?: (polygon: [number, number][]) => void;
  onBoundsChange?: (bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number }) => void;
  onSelectMapItem?: (item: MapItem) => void;
  sigintTraces?: SIGINTTrace[];
  userLocation?: { lat: number; lng: number } | null;
  geoRadius?: number;
}

export default function DeckGLMap({
  entities,
  infrastructure,
  zones,
  selectedEntityId,
  onSelectEntity,
  showTrails,
  showInfrastructure,
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
  conflictEvents = [],
  fireHotspots = [],
  naturalDisasters = [],
  cyberThreats = [],
  internetOutages = [],
  submarineCables = [],
  pipelines = [],
  militaryBases = [],
  nuclearFacilities = [],
  showSatellite = false,
  showSentinel = false,
  gibsDate,
  gibsProduct,
  onMapClick,
  onMissionWaypointAdd,
  onZoneDrawn,
  onBoundsChange,
  onSelectMapItem,
  sigintTraces = [],
  userLocation,
  geoRadius = 20,
}: DeckGLMapProps) {
  const [ivs, setIvs] = useState(INITIAL_VIEW);
  const vsRef = useRef(INITIAL_VIEW);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; object?: unknown } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);
  const [animPhase, setAnimPhase] = useState(0);

  useEffect(() => {
    let frame: number;
    const tick = () => {
      setAnimPhase(Date.now() % 3000 / 3000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const onViewStateChange = useCallback(
    (params: { viewState: Record<string, unknown> }) => {
      const vs = params.viewState;
      const lon = vs.longitude as number;
      const lat = vs.latitude as number;
      const zoom = vs.zoom as number;
      if (typeof lon === "number" && typeof lat === "number" && typeof zoom === "number") {
        vsRef.current = { longitude: lon, latitude: lat, zoom, maxZoom: 24, minZoom: 0, pitch: (vs.pitch as number) ?? 0, bearing: (vs.bearing as number) ?? 0 };
        const latDelta = 180 / Math.pow(2, zoom);
        const lonDelta = (360 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
        onBoundsChange?.({
          latMin: lat - latDelta / 2,
          latMax: lat + latDelta / 2,
          lonMin: lon - lonDelta / 2,
          lonMax: lon + lonDelta / 2,
        });
      }
    },
    [onBoundsChange]
  );

  useEffect(() => {
    if (!drawMode) setDrawPoints([]);
  }, [drawMode]);

  useEffect(() => {
    if (!measureMode) setMeasurePoints([]);
  }, [measureMode]);

  const unprojectClick = useCallback(
    (e: React.MouseEvent): { lat: number; lng: number } | null => {
      const container = containerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cur = vsRef.current;
      const vp = new WebMercatorViewport({
        width: rect.width,
        height: rect.height,
        longitude: cur.longitude,
        latitude: cur.latitude,
        zoom: cur.zoom,
      });
      const [lng, lat] = vp.unproject([x, y]);
      return { lat, lng };
    },
    []
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      const pt = unprojectClick(e);
      if (!pt) return;
      if (placeMarkerMode) {
        onMapClick?.(pt);
      } else if (missionPlanMode) {
        onMissionWaypointAdd?.(pt);
      } else if (drawMode) {
        setDrawPoints((prev) => {
          const next = [...prev, [pt.lat, pt.lng] as [number, number]];
          return next;
        });
      } else if (measureMode) {
        setMeasurePoints((prev) => {
          if (prev.length >= 2) return [[pt.lat, pt.lng]];
          return [...prev, [pt.lat, pt.lng] as [number, number]];
        });
      }
    },
    [unprojectClick, placeMarkerMode, missionPlanMode, drawMode, measureMode, onMapClick, onMissionWaypointAdd]
  );

  const handleOverlayDblClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (drawMode && drawPoints.length >= 3) {
        onZoneDrawn?.(drawPoints);
        setDrawPoints([]);
      }
    },
    [drawMode, drawPoints, onZoneDrawn]
  );

  const entityLayerData = useMemo(() => {
    return entities
      .filter((e) => e.position)
      .map((e) => {
        const isSelected = e.id === selectedEntityId;
        let affiliation: string;
        if (e.type === "aircraft") {
          affiliation = getAircraftAffiliation(
            (e as Aircraft).metadata.originCountry,
            (e as Aircraft).metadata.squawk
          );
        } else {
          affiliation = getVesselAffiliation(
            (e as Vessel).metadata.flag,
            (e as Vessel).metadata.shipType
          );
        }
        const color = AFFILIATION_COLORS[affiliation] ?? [128, 128, 128];
        const size = isSelected ? 12 : e.type === "aircraft" && (e as Aircraft).metadata.onGround ? 5 : 8;
        return {
          id: e.id,
          position: [e.position!.lng, e.position!.lat],
          color: [...color, 255],
          radius: size,
          entity: e,
        };
      });
  }, [entities, selectedEntityId]);

  const trailLayerData = useMemo(() => {
    if (!showTrails) return [];
    return entities
      .filter((e) => e.position && e.trail.length > 1 && (e.tracked || e.id === selectedEntityId))
      .map((e) => {
        const affiliation =
          e.type === "aircraft"
            ? getAircraftAffiliation((e as Aircraft).metadata.originCountry, (e as Aircraft).metadata.squawk)
            : getVesselAffiliation((e as Vessel).metadata.flag, (e as Vessel).metadata.shipType);
        const color = affiliation === "hostile" ? [255, 64, 64] : affiliation === "friendly" ? [64, 128, 255] : [128, 224, 128];
        return {
          path: e.trail.map((p) => [p.lng, p.lat]),
          color: [...color, (e.tracked || e.id === selectedEntityId) ? 180 : 90],
        };
      });
  }, [entities, selectedEntityId, showTrails]);

  const zoneLayerData = useMemo(() => {
    return zones
      .filter((z) => z.active && z.polygon.length >= 3)
      .map((z) => ({
        polygon: z.polygon.map(([lat, lng]) => [lng, lat] as [number, number]),
        color: hexToRgb(z.color),
      }));
  }, [zones]);

  const opsLayerData = useMemo(() => {
    return operationalMarkers.map((m) => {
      const color =
        m.affiliation === "hostile" || m.affiliation === "suspect"
          ? [255, 64, 64]
          : m.affiliation === "friendly"
            ? [64, 128, 255]
            : [128, 128, 128];
      return {
        position: [m.position.lng, m.position.lat],
        color: [...color, 255],
        radius: 10,
        label: m.label,
        marker: m,
      };
    });
  }, [operationalMarkers]);

  const opsRangeData = useMemo(() => {
    const polys: { polygon: [number, number][]; color: [number, number, number] }[] = [];
    operationalMarkers.forEach((m) => {
      if (!m.weaponRange) return;
      const color =
        m.affiliation === "hostile" || m.affiliation === "suspect"
          ? [255, 64, 64]
          : [64, 128, 255];
      const poly = circlePolygon(m.position.lat, m.position.lng, m.weaponRange * 1000);
      polys.push({
        polygon: poly.map(([lat, lng]) => [lng, lat] as [number, number]),
        color: color as [number, number, number],
      });
    });
    return polys;
  }, [operationalMarkers]);

  const linkLayerData = useMemo(() => {
    return entityLinks
      .map((link) => {
        const source = entities.find((e) => e.id === link.sourceId);
        const target = entities.find((e) => e.id === link.targetId);
        if (!source?.position || !target?.position) return null;
        const color =
          link.type === "escort"
            ? [64, 128, 255]
            : link.type === "threat" || link.type === "surveillance"
              ? [255, 64, 64]
              : [128, 128, 128];
        return { path: [source.position, target.position].map((p) => [p.lng, p.lat]), color: [...color, 153] };
      })
      .filter(Boolean) as { path: [number, number][]; color: [number, number, number] }[];
  }, [entityLinks, entities]);

  const missionLayerData = useMemo(() => {
    const routes = [...missionRoutes];
    if (activeMissionWaypoints.length > 0) {
      routes.push({
        id: "__active__",
        name: "En cours",
        waypoints: activeMissionWaypoints,
        color: "#00ffaa",
        createdBy: "operator",
        createdAt: new Date(),
      });
    }
    return routes.flatMap((r) => {
      if (r.waypoints.length < 2) return [];
      return [
        {
          path: r.waypoints.map((wp) => [wp.position.lng, wp.position.lat]),
          color: hexToRgb(r.color),
        },
      ];
    });
  }, [missionRoutes, activeMissionWaypoints]);

  const missionWaypointsData = useMemo(() => {
    const routes = [...missionRoutes];
    if (activeMissionWaypoints.length > 0) {
      routes.push({
        id: "__active__",
        waypoints: activeMissionWaypoints,
        color: "#00ffaa",
      } as MissionRoute & { waypoints: typeof activeMissionWaypoints });
    }
    const wpColors: Record<string, [number, number, number]> = {
      start: [0, 255, 0],
      waypoint: [255, 255, 255],
      objective: [255, 64, 64],
      rally: [245, 158, 11],
      extraction: [139, 92, 246],
    };
    return routes.flatMap((r) =>
      r.waypoints.map((wp, i) => ({
        position: [wp.position.lng, wp.position.lat] as [number, number],
        color: [...(wpColors[wp.type] ?? [255, 255, 255]), 200],
        radius: wp.type === "objective" ? 6 : 4,
        label: wp.label || `WP-${i + 1}`,
      }))
    );
  }, [missionRoutes, activeMissionWaypoints]);

  const satLayerData = useMemo(() => {
    if (!showSatellites) return [];
    const colors: Record<string, [number, number, number]> = {
      gps: [245, 158, 11],
      galileo: [59, 130, 246],
      starlink: [168, 85, 247],
      "french-mil": [37, 99, 235],
    };
    return satellites.map((s) => ({
      position: [s.lng, s.lat],
      color: [...(colors[s.group] ?? [245, 158, 11]), 200],
      radius: s.group === "starlink" ? 2 : 3,
    }));
  }, [satellites, showSatellites]);

  const cellLayerData = useMemo(() => {
    if (!showCellTowers) return [];
    const colors: Record<string, [number, number, number]> = {
      LTE: [239, 68, 68],
      UMTS: [245, 158, 11],
      GSM: [16, 185, 129],
      "5G": [59, 130, 246],
    };
    return cellTowers.map((t) => ({
      position: [t.lng, t.lat],
      color: [...(colors[t.radio] ?? [139, 92, 246]), 200],
      radius: 4,
      tower: t,
    }));
  }, [cellTowers, showCellTowers]);

  const cellRangeData = useMemo(() => {
    if (!showCellTowers) return [];
    return cellTowers.map((t) => {
      const color = t.radio === "LTE" ? [239, 68, 68] : t.radio === "5G" ? [59, 130, 246] : [139, 92, 246];
      const poly = circlePolygon(t.lat, t.lng, t.range, 32);
      return { polygon: poly.map(([lat, lng]) => [lng, lat]), color };
    });
  }, [cellTowers, showCellTowers]);

  const infraLayerData = useMemo(() => {
    if (!showInfrastructure) return [];
    return infrastructure
      .filter((i) => i.position)
      .map((i) => {
        const cfg = INFRA_ICONS[i.metadata.category] ?? { color: "#666" };
        const color = hexToRgb(cfg.color);
        return {
          position: [i.position!.lng, i.position!.lat],
          color: [...color, 255],
          radius: i.metadata.importance === "critical" ? 6 : 4,
          infra: i,
        };
      });
  }, [infrastructure, showInfrastructure]);

  const predictionLayerData = useMemo(() => {
    return entities
      .filter((e) => e.position && (e.tracked || e.id === selectedEntityId))
      .flatMap((e) => {
        const pred = predictTrajectory(e, 15, 8);
        if (pred.length < 2) return [];
        return [
          {
            path: [
              [e.position!.lng, e.position!.lat],
              ...pred.map((p) => [p.lng, p.lat] as [number, number]),
            ],
            color: e.type === "aircraft" ? [255, 255, 255, 128] : [0, 255, 170, 128],
          },
        ];
      });
  }, [entities, selectedEntityId]);

  const layers = useMemo(() => {
    const l: Layer[] = [];

    if (showSatellite) {
      l.push(
        new TileLayer({
          id: "esri-satellite",
          data: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          minZoom: 0,
          maxZoom: 19,
          tileSize: 256,
          opacity: 0.9,
          onTileError: () => {},
          renderSubLayers: (props) => {
            if (!props.data) return null;
            const { boundingBox } = props.tile;
            return new BitmapLayer(props as unknown as Record<string, unknown>, {
              data: undefined,
              image: props.data,
              bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
            });
          },
        }) as unknown as Layer,
      );
    }

    if (showSentinel && gibsDate && gibsProduct) {
      const gibsUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${gibsProduct}/default/${gibsDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
      l.push(
        new TileLayer({
          id: "nasa-gibs",
          data: gibsUrl,
          minZoom: 0,
          maxZoom: 9,
          tileSize: 256,
          opacity: 0.8,
          onTileError: () => {},
          renderSubLayers: (props) => {
            if (!props.data) return null;
            const { boundingBox } = props.tile;
            return new BitmapLayer(props as unknown as Record<string, unknown>, {
              data: undefined,
              image: props.data,
              bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
            });
          },
        }) as unknown as Layer,
      );
    }

    if (zoneLayerData.length > 0) {
      l.push(
        new SolidPolygonLayer({
          id: "zones",
          data: zoneLayerData,
          getPolygon: (d) => d.polygon,
          getFillColor: (d) => [...d.color, 25] as [number, number, number, number],
          getLineColor: (d) => d.color,
          lineWidthMinPixels: 2,
          pickable: false,
        })
      );
    }

    if (opsRangeData.length > 0) {
      l.push(
        new SolidPolygonLayer({
          id: "ops-ranges",
          data: opsRangeData,
          getPolygon: (d) => d.polygon,
          getFillColor: (d) => [...d.color, 40] as [number, number, number, number],
          getLineColor: (d) => [...d.color, 100] as [number, number, number, number],
          lineWidthMinPixels: 1,
          pickable: false,
        })
      );
    }

    if (cellRangeData.length > 0) {
      l.push(
        new SolidPolygonLayer({
          id: "cell-ranges",
          data: cellRangeData,
          getPolygon: (d) => d.polygon,
          getFillColor: (d) => [...d.color, 20] as [number, number, number, number],
          getLineColor: (d) => [...d.color, 80] as [number, number, number, number],
          lineWidthMinPixels: 1,
          pickable: false,
        })
      );
    }

    if (trailLayerData.length > 0) {
      l.push(
        new PathLayer({
          id: "trails",
          data: trailLayerData,
          getPath: (d) => d.path,
          getColor: (d) => d.color,
          getWidth: 2,
          widthMinPixels: 1.5,
          pickable: false,
        })
      );
    }

    if (linkLayerData.length > 0) {
      l.push(
        new PathLayer({
          id: "entity-links",
          data: linkLayerData,
          getPath: (d) => d.path,
          getColor: (d) => d.color,
          getWidth: 2,
          widthMinPixels: 1,
          pickable: false,
        })
      );
    }

    if (missionLayerData.length > 0) {
      l.push(
        new PathLayer({
          id: "mission-routes",
          data: missionLayerData,
          getPath: (d) => d.path,
          getColor: (d) => d.color,
          getWidth: 2.5,
          widthMinPixels: 2,
          pickable: false,
        })
      );
    }

    if (missionWaypointsData.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "mission-waypoints",
          data: missionWaypointsData,
          getPosition: (d) => d.position,
          getRadius: (d) => d.radius * 100,
          getFillColor: (d) => d.color,
          radiusMinPixels: 4,
          radiusMaxPixels: 12,
          pickable: false,
        })
      );
    }

    if (predictionLayerData.length > 0) {
      l.push(
        new PathLayer({
          id: "predictions",
          data: predictionLayerData,
          getPath: (d) => d.path,
          getColor: (d) => d.color,
          getWidth: 1.5,
          widthMinPixels: 1,
          pickable: false,
        })
      );
    }

    if (entityLayerData.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "entities",
          data: entityLayerData,
          getPosition: (d) => d.position,
          getRadius: (d) => d.radius * 100,
          getFillColor: (d) => d.color,
          getLineColor: [255, 255, 255],
          getLineWidth: 1,
          lineWidthMinPixels: 0.5,
          radiusMinPixels: 5,
          radiusMaxPixels: 28,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 80],
          onClick: (info) => {
            if (!info.object) return;
            const obj = info.object as { entity?: Entity };
            if (obj?.entity) onSelectEntity(obj.entity);
          },
          onHover: (info) => setHoverInfo(info.picked ? { x: info.x!, y: info.y!, object: info.object } : null),
        })
      );
    }

    if (opsLayerData.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "ops-markers",
          data: opsLayerData,
          getPosition: (d) => d.position,
          getRadius: (d) => d.radius * 100,
          getFillColor: (d) => d.color,
          radiusMinPixels: 6,
          radiusMaxPixels: 20,
          pickable: true,
          onHover: (info) => setHoverInfo(info.picked ? { x: info.x!, y: info.y!, object: info.object } : null),
        })
      );
    }

    if (infraLayerData.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "infrastructure",
          data: infraLayerData,
          getPosition: (d) => d.position,
          getRadius: (d) => d.radius * 100,
          getFillColor: (d) => d.color,
          radiusMinPixels: 4,
          radiusMaxPixels: 14,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 60],
          onClick: (info) => {
            if (!info.object) return;
            const obj = info.object as { infra?: Infrastructure };
            if (obj?.infra) onSelectEntity(obj.infra);
          },
          onHover: (info) => setHoverInfo(info.picked ? { x: info.x!, y: info.y!, object: info.object } : null),
        })
      );
    }

    if (satLayerData.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "satellites",
          data: satLayerData,
          getPosition: (d) => d.position,
          getRadius: (d) => d.radius * 100,
          getFillColor: (d) => d.color,
          radiusMinPixels: 2,
          radiusMaxPixels: 6,
          pickable: true,
        })
      );
    }

    if (cellLayerData.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "cell-towers",
          data: cellLayerData,
          getPosition: (d) => d.position,
          getRadius: (d) => d.radius * 100,
          getFillColor: (d) => d.color,
          radiusMinPixels: 4,
          radiusMaxPixels: 8,
          pickable: true,
          onClick: (info) => {
            if (!info.object) return;
            const obj = info.object as { tower?: CellTower };
            if (obj?.tower) onSelectMapItem?.({ type: "tower", data: obj.tower });
          },
          onHover: (info) => setHoverInfo(info.picked ? { x: info.x!, y: info.y!, object: info.object } : null),
        })
      );
    }

    // Phase 3 — World Monitor layers (animated)
    const pulse = 0.6 + 0.4 * Math.sin(animPhase * Math.PI * 2);
    const pulseInv = 1.4 - 0.4 * Math.sin(animPhase * Math.PI * 2);

    if (conflictEvents.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "conflicts-glow",
          data: conflictEvents,
          getPosition: (d: ConflictEvent) => [d.lng, d.lat] as [number, number],
          getRadius: (d: ConflictEvent) => Math.max(5, Math.min(d.fatalities * 3, 40)) * 300 * pulseInv,
          getFillColor: (d: ConflictEvent) => {
            const a = Math.round(60 * pulse);
            if (d.eventType === "battles" || d.eventType === "explosions") return [255, 40, 0, a] as [number, number, number, number];
            return [255, 160, 0, a] as [number, number, number, number];
          },
          radiusMinPixels: 8,
          radiusMaxPixels: 35,
          pickable: false,
          updateTriggers: { getRadius: [animPhase], getFillColor: [animPhase] },
        })
      );
      l.push(
        new ScatterplotLayer({
          id: "conflicts",
          data: conflictEvents,
          getPosition: (d: ConflictEvent) => [d.lng, d.lat] as [number, number],
          getRadius: (d: ConflictEvent) => Math.max(3, Math.min(d.fatalities * 2, 30)) * 200,
          getFillColor: (d: ConflictEvent) => {
            if (d.eventType === "battles") return [255, 40, 40, 220] as [number, number, number, number];
            if (d.eventType === "explosions") return [255, 100, 0, 220] as [number, number, number, number];
            if (d.eventType === "protests") return [255, 220, 50, 180] as [number, number, number, number];
            if (d.eventType === "riots") return [255, 160, 0, 200] as [number, number, number, number];
            return [200, 80, 80, 160] as [number, number, number, number];
          },
          radiusMinPixels: 4,
          radiusMaxPixels: 18,
          pickable: true,
          onClick: (info) => {
            if (info.object) onSelectMapItem?.({ type: "conflict", data: info.object as ConflictEvent });
          },
          onHover: (info) =>
            setHoverInfo(
              info.picked ? { x: info.x!, y: info.y!, object: { conflict: info.object } } : null
            ),
        })
      );
    }

    if (fireHotspots.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "fires-glow",
          data: fireHotspots,
          getPosition: (d: FireHotspot) => [d.lng, d.lat] as [number, number],
          getRadius: (d: FireHotspot) => d.frp * 80 * pulseInv,
          getFillColor: [255, 80, 0, Math.round(50 * pulse)] as [number, number, number, number],
          radiusMinPixels: 6,
          radiusMaxPixels: 20,
          pickable: false,
          updateTriggers: { getRadius: [animPhase], getFillColor: [animPhase] },
        })
      );
      l.push(
        new ScatterplotLayer({
          id: "fires",
          data: fireHotspots,
          getPosition: (d: FireHotspot) => [d.lng, d.lat] as [number, number],
          getRadius: (d: FireHotspot) => d.frp * 50,
          getFillColor: [255, 120, 0, 220] as [number, number, number, number],
          radiusMinPixels: 3,
          radiusMaxPixels: 12,
          pickable: true,
          onClick: (info) => {
            if (info.object) onSelectMapItem?.({ type: "fire", data: info.object as FireHotspot });
          },
          onHover: (info) =>
            setHoverInfo(
              info.picked ? { x: info.x!, y: info.y!, object: { fire: info.object } } : null
            ),
        })
      );
    }

    if (naturalDisasters.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "disasters-glow",
          data: naturalDisasters,
          getPosition: (d: NaturalDisaster) => [d.lng, d.lat] as [number, number],
          getRadius: 1200 * pulseInv,
          getFillColor: (d: NaturalDisaster) => {
            const a = Math.round(50 * pulse);
            if (d.severity === "red") return [255, 0, 0, a] as [number, number, number, number];
            if (d.severity === "orange") return [255, 160, 0, a] as [number, number, number, number];
            return [0, 200, 100, a] as [number, number, number, number];
          },
          radiusMinPixels: 10,
          radiusMaxPixels: 30,
          pickable: false,
          updateTriggers: { getRadius: [animPhase], getFillColor: [animPhase] },
        })
      );
      l.push(
        new ScatterplotLayer({
          id: "disasters",
          data: naturalDisasters,
          getPosition: (d: NaturalDisaster) => [d.lng, d.lat] as [number, number],
          getRadius: 800,
          getFillColor: (d: NaturalDisaster) => {
            if (d.severity === "red") return [255, 0, 0, 220] as [number, number, number, number];
            if (d.severity === "orange") return [255, 160, 0, 220] as [number, number, number, number];
            return [0, 200, 100, 180] as [number, number, number, number];
          },
          radiusMinPixels: 6,
          radiusMaxPixels: 20,
          pickable: true,
          onClick: (info) => {
            if (info.object) onSelectMapItem?.({ type: "disaster", data: info.object as NaturalDisaster });
          },
          onHover: (info) =>
            setHoverInfo(
              info.picked ? { x: info.x!, y: info.y!, object: { disaster: info.object } } : null
            ),
        })
      );
    }

    if (cyberThreats.length > 0) {
      const geoThreats = cyberThreats.filter((t) => t.lat != null && t.lng != null);
      if (geoThreats.length > 0) {
        l.push(
          new ScatterplotLayer({
            id: "cyber-threats",
            data: geoThreats,
            getPosition: (d: CyberThreat) => [d.lng!, d.lat!] as [number, number],
            getRadius: 400,
            getFillColor: [168, 85, 247, 180] as [number, number, number, number],
            radiusMinPixels: 3,
            radiusMaxPixels: 8,
            pickable: true,
            onClick: (info) => {
              if (info.object) onSelectMapItem?.({ type: "cyber", data: info.object as CyberThreat });
            },
            onHover: (info) =>
              setHoverInfo(
                info.picked ? { x: info.x!, y: info.y!, object: { cyber: info.object } } : null
              ),
          })
        );
      }
    }

    if (internetOutages.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "internet-outages",
          data: internetOutages,
          getPosition: (d: InternetOutage) => [d.lng, d.lat] as [number, number],
          getRadius: 600,
          getFillColor: (d: InternetOutage) => {
            if (d.severity === "major") return [244, 63, 94, 200] as [number, number, number, number];
            if (d.severity === "moderate") return [245, 158, 11, 180] as [number, number, number, number];
            return [100, 116, 139, 140] as [number, number, number, number];
          },
          radiusMinPixels: 5,
          radiusMaxPixels: 14,
          pickable: true,
          onClick: (info) => {
            if (info.object) onSelectMapItem?.({ type: "outage", data: info.object as InternetOutage });
          },
          onHover: (info) =>
            setHoverInfo(
              info.picked ? { x: info.x!, y: info.y!, object: { outage: info.object } } : null
            ),
        })
      );
    }

    if (submarineCables.length > 0) {
      l.push(
        new PathLayer({
          id: "submarine-cables",
          data: submarineCables,
          getPath: (d: SubmarineCable) => d.coordinates.map(([lat, lng]) => [lng, lat] as [number, number]),
          getColor: [14, 165, 233, 120] as [number, number, number, number],
          getWidth: 2,
          widthMinPixels: 1,
          pickable: true,
          onClick: (info) => {
            if (info.object) onSelectMapItem?.({ type: "cable", data: info.object as SubmarineCable });
          },
          onHover: (info) =>
            setHoverInfo(
              info.picked ? { x: info.x!, y: info.y!, object: { cable: info.object } } : null
            ),
        })
      );
    }

    if (pipelines.length > 0) {
      l.push(
        new PathLayer({
          id: "pipelines",
          data: pipelines,
          getPath: (d: Pipeline) => d.coordinates.map(([lat, lng]) => [lng, lat] as [number, number]),
          getColor: (d: Pipeline) =>
            d.type === "oil"
              ? ([139, 92, 246, 160] as [number, number, number, number])
              : d.type === "gas"
                ? ([132, 204, 22, 160] as [number, number, number, number])
                : ([245, 158, 11, 160] as [number, number, number, number]),
          getWidth: 3,
          widthMinPixels: 1.5,
          pickable: true,
          onClick: (info) => {
            if (info.object) onSelectMapItem?.({ type: "pipeline", data: info.object as Pipeline });
          },
          onHover: (info) =>
            setHoverInfo(
              info.picked ? { x: info.x!, y: info.y!, object: { pipeline: info.object } } : null
            ),
        })
      );
    }

    if (militaryBases.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "military-bases",
          data: militaryBases,
          getPosition: (d: MilitaryBase) => [d.lng, d.lat] as [number, number],
          getRadius: 500,
          getFillColor: [220, 38, 38, 200] as [number, number, number, number],
          getLineColor: [255, 255, 255, 120] as [number, number, number, number],
          getLineWidth: 1,
          lineWidthMinPixels: 0.5,
          radiusMinPixels: 4,
          radiusMaxPixels: 10,
          pickable: true,
          onClick: (info) => {
            if (info.object) onSelectMapItem?.({ type: "base", data: info.object as MilitaryBase });
          },
          onHover: (info) =>
            setHoverInfo(
              info.picked ? { x: info.x!, y: info.y!, object: { base: info.object } } : null
            ),
        })
      );
    }

    if (nuclearFacilities.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "nuclear-facilities",
          data: nuclearFacilities,
          getPosition: (d: NuclearFacility) => [d.lng, d.lat] as [number, number],
          getRadius: 500,
          getFillColor: [234, 179, 8, 200] as [number, number, number, number],
          getLineColor: [255, 255, 255, 120] as [number, number, number, number],
          getLineWidth: 1,
          lineWidthMinPixels: 0.5,
          radiusMinPixels: 4,
          radiusMaxPixels: 10,
          pickable: true,
          onClick: (info) => {
            if (info.object) onSelectMapItem?.({ type: "nuclear", data: info.object as NuclearFacility });
          },
          onHover: (info) =>
            setHoverInfo(
              info.picked ? { x: info.x!, y: info.y!, object: { nuclear: info.object } } : null
            ),
        })
      );
    }

    for (const trace of sigintTraces) {
      if (trace.positions.length >= 2) {
        l.push(
          new PathLayer<{ path: [number, number][] }>({
            id: `sigint-path-${trace.id}`,
            data: [{ path: trace.positions.map((p) => [p.lng, p.lat] as [number, number]) }],
            getPath: (d) => d.path,
            getColor: [255, 50, 50, 200],
            getWidth: 3,
            widthMinPixels: 2,
            pickable: false,
          }) as unknown as Layer
        );
      }
      if (trace.positions.length > 0) {
        l.push(
          new ScatterplotLayer<{ position: [number, number]; idx: number; total: number }>({
            id: `sigint-points-${trace.id}`,
            data: trace.positions.map((p, i) => ({ position: [p.lng, p.lat] as [number, number], idx: i, total: trace.positions.length })),
            getPosition: (d) => d.position,
            getRadius: 300,
            getFillColor: (d) => d.idx === d.total - 1
              ? [255, 50, 50, 255] as [number, number, number, number]
              : [255, 100, 100, 150] as [number, number, number, number],
            getLineColor: [255, 255, 255, 200] as [number, number, number, number],
            lineWidthMinPixels: 1,
            stroked: true,
            radiusMinPixels: 4,
            radiusMaxPixels: 10,
            pickable: false,
          }) as unknown as Layer
        );
      }
    }

    if (drawPoints.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "draw-points",
          data: drawPoints.map((p, i) => ({ position: [p[1], p[0]] as [number, number], idx: i })),
          getPosition: (d) => d.position,
          getRadius: 200,
          getFillColor: [255, 170, 0, 200],
          getLineColor: [255, 255, 255, 255],
          lineWidthMinPixels: 2,
          stroked: true,
          radiusMinPixels: 5,
          radiusMaxPixels: 8,
          pickable: false,
        })
      );
      if (drawPoints.length >= 2) {
        l.push(
          new PathLayer({
            id: "draw-path",
            data: [{ path: [...drawPoints.map((p) => [p[1], p[0]] as [number, number]), drawPoints.length >= 3 ? [drawPoints[0][1], drawPoints[0][0]] as [number, number] : null].filter(Boolean) as [number, number][] }],
            getPath: (d) => d.path,
            getColor: [255, 170, 0, 180],
            getWidth: 2,
            widthMinPixels: 2,
            pickable: false,
          })
        );
      }
    }

    if (measurePoints.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "measure-points",
          data: measurePoints.map((p) => ({ position: [p[1], p[0]] as [number, number] })),
          getPosition: (d) => d.position,
          getRadius: 200,
          getFillColor: [0, 212, 255, 200],
          getLineColor: [255, 255, 255, 255],
          lineWidthMinPixels: 2,
          stroked: true,
          radiusMinPixels: 5,
          radiusMaxPixels: 8,
          pickable: false,
        })
      );
      if (measurePoints.length === 2) {
        l.push(
          new PathLayer({
            id: "measure-line",
            data: [{ path: measurePoints.map((p) => [p[1], p[0]] as [number, number]) }],
            getPath: (d) => d.path,
            getColor: [0, 212, 255, 200],
            getWidth: 2,
            widthMinPixels: 2,
            getDashArray: [8, 4],
            pickable: false,
          })
        );
      }
    }

    if (userLocation) {
      l.push(
        new ScatterplotLayer({
          id: "user-location-ring",
          data: [userLocation],
          getPosition: (d: { lat: number; lng: number }) => [d.lng, d.lat] as [number, number],
          getRadius: geoRadius * 1000,
          getFillColor: [0, 212, 255, 15] as [number, number, number, number],
          getLineColor: [0, 212, 255, 80] as [number, number, number, number],
          lineWidthMinPixels: 1,
          stroked: true,
          filled: true,
          pickable: false,
          updateTriggers: { getRadius: [geoRadius] },
        })
      );
      l.push(
        new ScatterplotLayer({
          id: "user-location-dot",
          data: [userLocation],
          getPosition: (d: { lat: number; lng: number }) => [d.lng, d.lat] as [number, number],
          getRadius: 200,
          getFillColor: [0, 212, 255, 220] as [number, number, number, number],
          getLineColor: [255, 255, 255, 200] as [number, number, number, number],
          lineWidthMinPixels: 2,
          stroked: true,
          radiusMinPixels: 6,
          radiusMaxPixels: 10,
          pickable: false,
        })
      );
      l.push(
        new ScatterplotLayer({
          id: "user-location-pulse",
          data: [userLocation],
          getPosition: (d: { lat: number; lng: number }) => [d.lng, d.lat] as [number, number],
          getRadius: 600 * pulseInv,
          getFillColor: [0, 212, 255, Math.round(40 * pulse)] as [number, number, number, number],
          radiusMinPixels: 10,
          radiusMaxPixels: 20,
          pickable: false,
          updateTriggers: { getRadius: [animPhase], getFillColor: [animPhase] },
        })
      );
    }

    return l;
  }, [
    showSatellite,
    showSentinel,
    gibsDate,
    gibsProduct,
    zoneLayerData,
    opsRangeData,
    cellRangeData,
    trailLayerData,
    linkLayerData,
    missionLayerData,
    missionWaypointsData,
    predictionLayerData,
    entityLayerData,
    opsLayerData,
    infraLayerData,
    satLayerData,
    cellLayerData,
    onSelectEntity,
    onSelectMapItem,
    sigintTraces,
    conflictEvents,
    fireHotspots,
    naturalDisasters,
    cyberThreats,
    internetOutages,
    submarineCables,
    pipelines,
    militaryBases,
    nuclearFacilities,
    drawPoints,
    measurePoints,
    animPhase,
    userLocation,
    geoRadius,
  ]);

  const interactionBlocked = placeMarkerMode || missionPlanMode || drawMode || measureMode;

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <DeckGL
        initialViewState={ivs}
        onViewStateChange={onViewStateChange as never}
        controller={!interactionBlocked}
        layers={layers}
        pickingRadius={8}
        getCursor={({ isHovering }) => interactionBlocked ? "crosshair" : isHovering ? "pointer" : "grab"}
      >
        <Map mapStyle={MAP_STYLE} attributionControl={false} maxZoom={24} />
      </DeckGL>

      {hoverInfo?.object != null && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: hoverInfo.x + 16, top: hoverInfo.y + 16 }}
        >
          {(() => {
            const o = hoverInfo.object as Record<string, unknown>;
            if (o.entity) {
              const e = o.entity as Entity;
              const isAircraft = e.type === "aircraft";
              const meta = e.metadata as Record<string, unknown>;
              return (
                <div className="bg-[#0d1520f0] border border-argos-border rounded-lg p-3 min-w-[200px] max-w-[280px] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{isAircraft ? "✈" : "🚢"}</span>
                    <div>
                      <p className="text-xs font-mono text-argos-accent font-bold">{e.label}</p>
                      <p className="text-[9px] font-mono text-argos-text-dim">{isAircraft ? (meta.originCountry as string) : (meta.shipType as string) || "N/A"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[8px] font-mono">
                    {e.position ? <><p className="text-argos-text-dim">POS</p><p className="text-argos-text">{e.position.lat.toFixed(3)}, {e.position.lng.toFixed(3)}</p></> : null}
                    {meta.velocity ? <><p className="text-argos-text-dim">VIT</p><p className="text-argos-text">{(meta.velocity as number).toFixed(0)} m/s</p></> : null}
                    {e.position?.alt ? <><p className="text-argos-text-dim">ALT</p><p className="text-argos-text">{e.position.alt.toFixed(0)} m</p></> : null}
                    {meta.callsign ? <><p className="text-argos-text-dim">CALL</p><p className="text-argos-text">{String(meta.callsign)}</p></> : null}
                  </div>
                </div>
              );
            }
            if (o.conflict) {
              const c = o.conflict as ConflictEvent;
              const typeLabel: Record<string, string> = { battles: "COMBAT", explosions: "EXPLOSION", protests: "MANIFESTATION", riots: "EMEUTE", violence_against_civilians: "VIOLENCE CIVILE", strategic_developments: "STRAT." };
              return (
                <div className="bg-[#1a0505f0] border border-red-800/60 rounded-lg p-3 min-w-[220px] max-w-[300px] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg event-explosion">💥</span>
                    <div>
                      <p className="text-xs font-mono text-red-400 font-bold">{typeLabel[c.eventType] || c.eventType.toUpperCase()}</p>
                      <p className="text-[9px] font-mono text-red-300/70">{c.country} — {c.region}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[8px] font-mono">
                    <p className="text-red-400/60">ACTEUR</p><p className="text-red-200">{c.actor1}</p>
                    {c.actor2 && <><p className="text-red-400/60">VS</p><p className="text-red-200">{c.actor2}</p></>}
                    <p className="text-red-400/60">DATE</p><p className="text-red-200">{c.eventDate}</p>
                    {c.fatalities > 0 && <><p className="text-red-400/60">VICTIMES</p><p className="text-red-100 font-bold">{c.fatalities}</p></>}
                    <p className="text-red-400/60">SOURCE</p><p className="text-red-200 truncate">{c.source}</p>
                  </div>
                  {c.notes && <p className="text-[7px] font-mono text-red-300/50 line-clamp-2">{c.notes}</p>}
                </div>
              );
            }
            if (o.fire) {
              const f = o.fire as FireHotspot;
              return (
                <div className="bg-[#1a0d05f0] border border-orange-800/60 rounded-lg p-3 min-w-[200px] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg event-fire">🔥</span>
                    <div>
                      <p className="text-xs font-mono text-orange-400 font-bold">FEU DETECTE</p>
                      <p className="text-[9px] font-mono text-orange-300/70">{f.country || "N/A"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[8px] font-mono">
                    <p className="text-orange-400/60">FRP</p><p className="text-orange-200">{f.frp.toFixed(1)} MW</p>
                    <p className="text-orange-400/60">SAT</p><p className="text-orange-200">{f.satellite}</p>
                    <p className="text-orange-400/60">CONF</p><p className="text-orange-200">{f.confidence}</p>
                    <p className="text-orange-400/60">POS</p><p className="text-orange-200">{f.lat.toFixed(3)}, {f.lng.toFixed(3)}</p>
                  </div>
                </div>
              );
            }
            if (o.disaster) {
              const d = o.disaster as NaturalDisaster;
              const icons: Record<string, string> = { earthquake: "🌍", flood: "🌊", cyclone: "🌀", volcano: "🌋", drought: "☀", wildfire: "🔥", tsunami: "🌊" };
              return (
                <div className="bg-[#0a1a10f0] border border-emerald-800/60 rounded-lg p-3 min-w-[220px] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg event-seismic">{icons[d.eventType] || "⚠"}</span>
                    <div>
                      <p className="text-xs font-mono text-emerald-400 font-bold">{d.title}</p>
                      <p className="text-[9px] font-mono text-emerald-300/70">{d.eventType.toUpperCase()}</p>
                    </div>
                  </div>
                  <p className="text-[8px] font-mono text-emerald-200/80 line-clamp-2">{d.description}</p>
                  <div className="flex gap-2 text-[8px] font-mono">
                    <span className={`px-1.5 py-0.5 rounded ${d.severity === "red" ? "bg-red-900/50 text-red-300" : d.severity === "orange" ? "bg-orange-900/50 text-orange-300" : "bg-green-900/50 text-green-300"}`}>
                      {d.severity.toUpperCase()}
                    </span>
                  </div>
                </div>
              );
            }
            if (o.cyber) {
              const c = o.cyber as CyberThreat;
              return (
                <div className="bg-[#0d0520f0] border border-purple-800/60 rounded-lg p-3 min-w-[200px] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg event-cyber">🛡</span>
                    <div>
                      <p className="text-xs font-mono text-purple-400 font-bold">{c.threatCategory.toUpperCase()}</p>
                      <p className="text-[9px] font-mono text-purple-300/70">{c.iocType} — {c.source}</p>
                    </div>
                  </div>
                  <p className="text-[8px] font-mono text-purple-200/80 break-all">{c.iocValue.slice(0, 50)}</p>
                </div>
              );
            }
            if (o.outage) {
              const ou = o.outage as InternetOutage;
              return (
                <div className="bg-[#1a0a0af0] border border-rose-800/60 rounded-lg p-3 min-w-[200px] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg event-outage">📵</span>
                    <div>
                      <p className="text-xs font-mono text-rose-400 font-bold">COUPURE INTERNET</p>
                      <p className="text-[9px] font-mono text-rose-300/70">{ou.country}</p>
                    </div>
                  </div>
                  <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${ou.severity === "major" ? "bg-red-900/50 text-red-300" : "bg-yellow-900/50 text-yellow-300"}`}>{ou.severity.toUpperCase()}</span>
                </div>
              );
            }
            if (o.marker) {
              const m = o.marker as OperationalMarker;
              return (
                <div className="bg-[#0d1520f0] border border-argos-border rounded-lg p-2 min-w-[160px]">
                  <p className="text-xs font-mono text-argos-accent font-bold">{m.label}</p>
                  <p className="text-[9px] font-mono text-argos-text-dim">{m.category} — {m.affiliation}</p>
                </div>
              );
            }
            if (o.infra) {
              const i = o.infra as Infrastructure;
              return (
                <div className="bg-[#0d1520f0] border border-argos-border rounded-lg p-2 min-w-[160px]">
                  <p className="text-xs font-mono text-argos-accent font-bold">{i.metadata.name}</p>
                  <p className="text-[9px] font-mono text-argos-text-dim">{i.type}</p>
                </div>
              );
            }
            if (o.tower) {
              const t = o.tower as CellTower;
              return (
                <div className="bg-[#0d1520f0] border border-argos-border rounded-lg p-2 min-w-[160px]">
                  <p className="text-xs font-mono text-argos-accent">{t.radio} — {t.operator || "N/A"}</p>
                </div>
              );
            }
            if (o.cable) {
              const c = o.cable as SubmarineCable;
              return (
                <div className="bg-[#0d1520f0] border border-argos-border rounded-lg p-2 min-w-[160px]">
                  <p className="text-xs font-mono text-blue-400">🔌 {c.name}</p>
                  <p className="text-[9px] font-mono text-argos-text-dim">{c.lengthKm?.toLocaleString()} km</p>
                </div>
              );
            }
            if (o.pipeline) {
              const p = o.pipeline as Pipeline;
              return (
                <div className="bg-[#0d1520f0] border border-argos-border rounded-lg p-2 min-w-[160px]">
                  <p className="text-xs font-mono text-yellow-400">🛢 {p.name}</p>
                  <p className="text-[9px] font-mono text-argos-text-dim">{p.type}</p>
                </div>
              );
            }
            if (o.base) {
              const b = o.base as MilitaryBase;
              return (
                <div className="bg-[#0d1520f0] border border-argos-border rounded-lg p-2 min-w-[160px]">
                  <p className="text-xs font-mono text-green-400">🎖 {b.name}</p>
                  <p className="text-[9px] font-mono text-argos-text-dim">{b.country}</p>
                </div>
              );
            }
            if (o.nuclear) {
              const n = o.nuclear as NuclearFacility;
              return (
                <div className="bg-[#1a1a05f0] border border-yellow-800/60 rounded-lg p-2 min-w-[160px]">
                  <p className="text-xs font-mono text-yellow-400">☢ {n.name}</p>
                  <p className="text-[9px] font-mono text-argos-text-dim">{n.type} — {n.status}</p>
                </div>
              );
            }
            return null;
          })()}
        </div>
      )}

      {interactionBlocked && (
        <div
          className="absolute inset-0 cursor-crosshair"
          style={{ zIndex: 9999 }}
          onClick={handleOverlayClick}
          onDoubleClick={handleOverlayDblClick}
        />
      )}

      {drawMode && drawPoints.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-argos-surface/90 border border-argos-warning/50 rounded-lg px-4 py-2 flex items-center gap-3 backdrop-blur-sm">
          <span className="text-[10px] font-mono text-argos-warning">{drawPoints.length} points</span>
          {drawPoints.length >= 3 && (
            <button
              onClick={() => { onZoneDrawn?.(drawPoints); setDrawPoints([]); }}
              className="text-[10px] font-mono bg-argos-warning/20 hover:bg-argos-warning/30 text-argos-warning border border-argos-warning/40 px-3 py-1 rounded transition-colors"
            >
              Valider la zone
            </button>
          )}
          <button
            onClick={() => setDrawPoints([])}
            className="text-[10px] font-mono text-argos-text-dim hover:text-red-400 px-2 py-1 transition-colors"
          >
            Annuler
          </button>
        </div>
      )}

      {measureMode && measurePoints.length === 2 && (() => {
        const [lat1, lon1] = measurePoints[0];
        const [lat2, lon2] = measurePoints[1];
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const nm = dist / 1.852;
        return (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-argos-surface/90 border border-argos-accent/50 rounded-lg px-4 py-2 flex items-center gap-4 backdrop-blur-sm">
            <span className="text-xs font-mono text-argos-accent font-bold">{dist.toFixed(1)} km</span>
            <span className="text-[10px] font-mono text-argos-text-dim">{nm.toFixed(1)} NM</span>
            <button
              onClick={() => setMeasurePoints([])}
              className="text-[10px] font-mono text-argos-text-dim hover:text-argos-accent px-2 py-1 transition-colors"
            >
              Reset
            </button>
          </div>
        );
      })()}

      {/* Zoom control placeholder - deck.gl controller handles zoom via scroll */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 rounded bg-argos-surface/80 border border-argos-border/50 p-1">
        <button
          onClick={() => { const c = vsRef.current; setIvs({ ...c, zoom: Math.min(24, c.zoom + 1) }); }}
          className="w-8 h-7 flex items-center justify-center text-argos-text hover:bg-argos-accent/20 rounded text-lg"
        >
          +
        </button>
        <button
          onClick={() => { const c = vsRef.current; setIvs({ ...c, zoom: Math.max(0, c.zoom - 1) }); }}
          className="w-8 h-7 flex items-center justify-center text-argos-text hover:bg-argos-accent/20 rounded text-lg"
        >
          −
        </button>
      </div>
    </div>
  );
}
