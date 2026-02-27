"use client";

import { useEffect, useRef, useState, Component, type ReactNode } from "react";
import { Entity, Aircraft, Vessel, Infrastructure, ZoneOfInterest, SatellitePosition } from "@/types";
import { INFRA_ICONS } from "@/lib/infrastructure";
import {
  Viewer,
  Cartesian2,
  Cartesian3,
  Color,
  Ion,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  defined,
  Math as CesiumMath,
  LabelStyle,
  VerticalOrigin,
  HorizontalOrigin,
  PolygonHierarchy,
  ColorMaterialProperty,
  NearFarScalar,
  HeightReference,
  createGooglePhotorealistic3DTileset,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

class GlobeErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  state = { hasError: false, error: "" };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#000005]">
          <div className="text-center max-w-md p-6">
            <div className="text-4xl mb-4">🌐</div>
            <p className="text-sm font-mono text-argos-accent mb-2">MODE GLOBE INDISPONIBLE</p>
            <p className="text-[10px] font-mono text-argos-text-dim/60 mb-4">
              Le rendu 3D necessite WebGL2. Utilisez le mode 2D pour la cartographie.
            </p>
            <p className="text-[8px] font-mono text-red-400/40">{this.state.error}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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

function getEntityColor(entity: Entity, selectedId: string | null): [number, number, number, number] {
  const isSelected = entity.id === selectedId;
  if (entity.type === "aircraft") {
    const ac = entity as Aircraft;
    if (ac.metadata.squawk === "7700" || ac.metadata.squawk === "7600" || ac.metadata.squawk === "7500") return [1, 0.2, 0.2, 1];
    if (isSelected) return [0.06, 0.73, 0.51, 1];
    if (ac.tracked) return [0.96, 0.62, 0.04, 1];
    if (ac.flagged) return [0.94, 0.27, 0.27, 1];
    if (ac.metadata.onGround) return [0.28, 0.33, 0.41, 0.6];
    return [0, 0.83, 1, 1];
  }
  if (entity.type === "vessel") {
    if (isSelected) return [0.13, 0.83, 0.88, 1];
    if ((entity as Vessel).tracked) return [0.96, 0.62, 0.04, 1];
    if ((entity as Vessel).flagged) return [0.94, 0.27, 0.27, 1];
    return [0.06, 0.73, 0.51, 1];
  }
  return [0.4, 0.4, 0.4, 1];
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
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const entityMapRef = useRef<Map<string, Entity>>(new Map());
  const onSelectRef = useRef(onSelectEntity);
  onSelectRef.current = onSelectEntity;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    Ion.defaultAccessToken = "";

    (window as unknown as Record<string, unknown>).CESIUM_BASE_URL = "/cesiumStatic";

    const viewer = new Viewer(containerRef.current, {
      timeline: false,
      animation: false,
      homeButton: false,
      geocoder: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      shadows: false,
      skyAtmosphere: undefined,
      requestRenderMode: false,
      maximumRenderTimeChange: Infinity,
    });

    viewer.scene.globe.show = false;
    viewer.scene.backgroundColor = Color.fromCssColorString("#000005");
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 50;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 30000000;
    viewer.scene.screenSpaceCameraController.enableTilt = true;

    if (apiKey) {
      createGooglePhotorealistic3DTileset({ key: apiKey }).then((tileset) => {
        viewer.scene.primitives.add(tileset);
      }).catch((err) => {
        console.warn("Google 3D Tiles failed, falling back to default globe:", err);
        viewer.scene.globe.show = true;
      });
    } else {
      viewer.scene.globe.show = true;
    }

    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(2.3, 46.6, 3000000),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-90),
        roll: 0,
      },
      duration: 0,
    });

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: { position: Cartesian2 }) => {
      const pickedObject = viewer.scene.pick(movement.position);
      if (defined(pickedObject) && pickedObject.id && pickedObject.id._argosId) {
        const entity = entityMapRef.current.get(pickedObject.id._argosId);
        if (entity) onSelectRef.current(entity);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    viewerRef.current = viewer;
    setReady(true);

    return () => {
      handler.destroy();
      if (!viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !ready) return;

    viewer.entities.removeAll();
    entityMapRef.current.clear();

    const visibleEntities = entities.filter(
      (e) => e.position && (e.type === "aircraft" || e.type === "vessel")
    );

    for (const e of visibleEntities) {
      const [r, g, b, a] = getEntityColor(e, selectedEntityId);
      const color = new Color(r, g, b, a);
      const isSelected = e.id === selectedEntityId;
      const pos = e.position!;

      let alt = 0;
      let label = e.label;
      if (e.type === "aircraft") {
        const ac = e as Aircraft;
        alt = ac.metadata.baroAltitude ?? 0;
        label = ac.label || ac.metadata.callsign || ac.metadata.icao24;
      }

      const cesiumEntity = viewer.entities.add({
        position: Cartesian3.fromDegrees(pos.lng, pos.lat, alt),
        point: {
          pixelSize: isSelected ? 10 : 6,
          color,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          scaleByDistance: new NearFarScalar(1000, 2, 8000000, 0.5),
          heightReference: e.type === "vessel" ? HeightReference.CLAMP_TO_GROUND : HeightReference.NONE,
        },
        label: {
          text: label,
          font: "10px monospace",
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.LEFT,
            pixelOffset: new Cartesian2(8, -4),
            scaleByDistance: new NearFarScalar(1000, 1, 5000000, 0),
            show: isSelected,
        },
      });

      (cesiumEntity as unknown as Record<string, unknown>)._argosId = e.id;
      entityMapRef.current.set(e.id, e);

      if (showTrails && e.trail.length > 1 && (e.tracked || isSelected)) {
        const positions = e.trail.map((t) =>
          Cartesian3.fromDegrees(t.lng, t.lat, e.type === "aircraft" ? (alt || 1000) : 0)
        );
        viewer.entities.add({
          polyline: {
            positions,
            width: 1.5,
            material: new ColorMaterialProperty(color.withAlpha(0.5)),
            clampToGround: e.type === "vessel",
          },
        });
      }
    }

    if (showInfrastructure) {
      for (const inf of infrastructure) {
        if (!inf.position) continue;
        const cfg = INFRA_ICONS[inf.metadata.category] ?? { icon: "📍", color: "#666" };
        const c = Color.fromCssColorString(cfg.color);
        viewer.entities.add({
          position: Cartesian3.fromDegrees(inf.position.lng, inf.position.lat, 0),
          point: {
            pixelSize: inf.metadata.importance === "critical" ? 8 : 5,
            color: c,
            outlineColor: Color.BLACK,
            outlineWidth: 1,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            scaleByDistance: new NearFarScalar(1000, 2, 5000000, 0.5),
          },
          label: {
            text: inf.metadata.name,
            font: "9px monospace",
            fillColor: c,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: new Cartesian2(8, -4),
            scaleByDistance: new NearFarScalar(500, 1, 2000000, 0),
          },
        });
      }
    }

    for (const zone of zones) {
      if (!zone.active || zone.polygon.length < 3) continue;
      const c = Color.fromCssColorString(zone.color);
      const positions = zone.polygon.map(([lat, lng]) => Cartesian3.fromDegrees(lng, lat, 0));
      viewer.entities.add({
        polygon: {
          hierarchy: new PolygonHierarchy(positions),
          material: new ColorMaterialProperty(c.withAlpha(0.1)),
          outline: true,
          outlineColor: c.withAlpha(0.6),
          heightReference: HeightReference.CLAMP_TO_GROUND,
        },
      });
    }

    if (showSatellites && satellites.length > 0) {
      const SAT_COLORS: Record<string, string> = {
        gps: "#f59e0b", galileo: "#3b82f6", glonass: "#ef4444",
        iridium: "#06b6d4", starlink: "#a855f7", military: "#dc2626",
        "french-mil": "#2563eb",
      };
      for (const sat of satellites) {
        const c = Color.fromCssColorString(SAT_COLORS[sat.group] ?? "#f59e0b");
        viewer.entities.add({
          position: Cartesian3.fromDegrees(sat.lng, sat.lat, sat.alt * 1000),
          point: {
            pixelSize: sat.group === "starlink" ? 3 : 5,
            color: c,
            scaleByDistance: new NearFarScalar(100000, 1, 20000000, 0.3),
          },
        });
      }
    }
  }, [entities, infrastructure, zones, selectedEntityId, showTrails, showInfrastructure, satellites, showSatellites, ready]);

  return (
    <GlobeErrorBoundary>
      <div ref={containerRef} style={{ width: "100%", height: "100%", background: "#000005" }} />
      <style>{`
        .cesium-viewer .cesium-widget-credits { display: none !important; }
        .cesium-viewer { font-family: 'JetBrains Mono', monospace; }
      `}</style>
    </GlobeErrorBoundary>
  );
}
