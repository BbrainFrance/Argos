"use client";

import dynamic from "next/dynamic";
import { Entity, Infrastructure, MapViewState, ZoneOfInterest, OperationalMarker, MissionRoute, EntityLink } from "@/types";

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });
const MapLibreGlobe = dynamic(() => import("./MapLibreGlobe"), { ssr: false });

interface MapContainerProps {
  entities: Entity[];
  infrastructure: Infrastructure[];
  zones: ZoneOfInterest[];
  viewState: MapViewState;
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
  onMissionWaypointAdd?: (latlng: { lat: number; lng: number }) => void;
  onZoneDrawn?: (polygon: [number, number][]) => void;
}

export default function MapContainer({
  entities,
  infrastructure,
  zones,
  viewState,
  selectedEntityId,
  onSelectEntity,
  showTrails,
  showInfrastructure,
  showSatellite,
    showSentinel,
    gibsDate,
    gibsProduct,
    drawMode,
  measureMode,
  operationalMarkers,
  placeMarkerMode,
  missionPlanMode,
  missionRoutes,
  activeMissionWaypoints,
  entityLinks,
  onMapClick,
  onMissionWaypointAdd,
  onZoneDrawn,
}: MapContainerProps) {
  return (
    <div className="relative w-full h-full">
      {viewState.mode === "3d" ? (
        <MapLibreGlobe
          entities={entities}
          infrastructure={infrastructure}
          zones={zones}
          selectedEntityId={selectedEntityId}
          onSelectEntity={onSelectEntity}
          showTrails={showTrails}
          showInfrastructure={showInfrastructure}
          showSatellite={showSatellite}
        />
      ) : (
        <LeafletMap
          entities={entities}
          infrastructure={infrastructure}
          zones={zones}
          selectedEntityId={selectedEntityId}
          onSelectEntity={onSelectEntity}
          showTrails={showTrails}
          showInfrastructure={showInfrastructure}
          showSatellite={showSatellite}
          showSentinel={showSentinel}
          gibsDate={gibsDate}
          gibsProduct={gibsProduct}
          drawMode={drawMode}
          measureMode={measureMode}
          operationalMarkers={operationalMarkers}
          placeMarkerMode={placeMarkerMode}
          missionPlanMode={missionPlanMode}
          missionRoutes={missionRoutes}
          activeMissionWaypoints={activeMissionWaypoints}
          entityLinks={entityLinks}
          onMapClick={onMapClick}
          onMissionWaypointAdd={onMissionWaypointAdd}
          onZoneDrawn={onZoneDrawn}
        />
      )}

      {/* Scan line effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.03]">
        <div className="w-full h-1 bg-argos-accent animate-scan-line" />
      </div>

      {/* Corner brackets */}
      <div className="absolute top-2 left-2 w-6 h-6 border-l-2 border-t-2 border-argos-accent/30 pointer-events-none" />
      <div className="absolute top-2 right-2 w-6 h-6 border-r-2 border-t-2 border-argos-accent/30 pointer-events-none" />
      <div className="absolute bottom-2 left-2 w-6 h-6 border-l-2 border-b-2 border-argos-accent/30 pointer-events-none" />
      <div className="absolute bottom-2 right-2 w-6 h-6 border-r-2 border-b-2 border-argos-accent/30 pointer-events-none" />
    </div>
  );
}
