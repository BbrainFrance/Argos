"use client";

import { useEffect, useRef, useState } from "react";
import { Aircraft } from "@/types";

interface CesiumGlobeProps {
  aircraft: Aircraft[];
  onSelectAircraft: (ac: Aircraft) => void;
}

export default function CesiumGlobe({ aircraft, onSelectAircraft }: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const entitiesRef = useRef<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(true);
  const cesiumRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;

    async function initCesium() {
      const Cesium = await import("cesium");
      cesiumRef.current = Cesium;

      (window as any).CESIUM_BASE_URL = "/cesium/";

      if (destroyed || !containerRef.current) return;

      const ionToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
      if (ionToken) {
        Cesium.Ion.defaultAccessToken = ionToken;
      }

      const viewer = new Cesium.Viewer(containerRef.current, {
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        creditContainer: document.createElement("div"),
        scene3DOnly: true,
        skyAtmosphere: new Cesium.SkyAtmosphere(),
      });

      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#0a0e17");
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#111827");
      viewer.scene.globe.enableLighting = true;

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(2.3, 46.6, 3000000),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-60),
          roll: 0,
        },
        duration: 2,
      });

      viewerRef.current = viewer;
      setLoading(false);
    }

    initCesium().catch(console.error);

    return () => {
      destroyed = true;
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
      }
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || viewer.isDestroyed() || !Cesium) return;

    const existingIds = new Set(entitiesRef.current.keys());
    const currentIds = new Set(aircraft.map((a) => a.icao24));

    existingIds.forEach((id) => {
      if (!currentIds.has(id)) {
        const entity = entitiesRef.current.get(id);
        if (entity) viewer.entities.remove(entity);
        entitiesRef.current.delete(id);
      }
    });

    aircraft.forEach((ac) => {
      if (!ac.latitude || !ac.longitude) return;

      const position = Cesium.Cartesian3.fromDegrees(
        ac.longitude,
        ac.latitude,
        ac.baroAltitude ?? 0
      );

      const color = ac.onGround
        ? Cesium.Color.fromCssColorString("#64748b")
        : Cesium.Color.fromCssColorString("#00d4ff");

      const existing = entitiesRef.current.get(ac.icao24);

      if (existing) {
        existing.position = position;
      } else {
        const entity = viewer.entities.add({
          id: ac.icao24,
          position,
          point: {
            pixelSize: ac.onGround ? 4 : 6,
            color,
            outlineColor: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.3),
            outlineWidth: ac.onGround ? 0 : 2,
          },
          label: {
            text: ac.callsign ?? "",
            font: "10px JetBrains Mono",
            fillColor: Cesium.Color.fromCssColorString("#e2e8f0"),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 500000),
          },
        });

        entitiesRef.current.set(ac.icao24, entity);
      }
    });
  }, [aircraft]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-argos-bg/80">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-argos-accent/30 border-t-argos-accent rounded-full animate-spin" />
            <span className="text-xs font-mono text-argos-text-dim">INITIALISATION GLOBE 3D...</span>
          </div>
        </div>
      )}
    </div>
  );
}
