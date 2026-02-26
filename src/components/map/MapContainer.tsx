"use client";

import dynamic from "next/dynamic";
import { Entity, Infrastructure, MapViewState, ZoneOfInterest, OperationalMarker, MissionRoute, EntityLink, SatellitePosition, CellTower } from "@/types";

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });
const ThreeGlobe = dynamic(() => import("./ThreeGlobe"), { ssr: false });

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
  satellites?: SatellitePosition[];
  cellTowers?: CellTower[];
  showSatellites?: boolean;
  showCellTowers?: boolean;
  onMissionWaypointAdd?: (latlng: { lat: number; lng: number }) => void;
  onZoneDrawn?: (polygon: [number, number][]) => void;
  onBoundsChange?: (bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number }) => void;
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
  satellites,
  cellTowers,
  showSatellites,
  showCellTowers,
  onMapClick,
  onMissionWaypointAdd,
  onZoneDrawn,
  onBoundsChange,
}: MapContainerProps) {
  return (
    <div className="relative w-full h-full">
      {viewState.mode === "3d" ? (
        <ThreeGlobe
          entities={entities}
          infrastructure={infrastructure}
          zones={zones}
          selectedEntityId={selectedEntityId}
          onSelectEntity={onSelectEntity}
          showTrails={showTrails}
          showInfrastructure={showInfrastructure}
          showSatellite={showSatellite}
          satellites={satellites}
          showSatellites={showSatellites}
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
          satellites={satellites}
          cellTowers={cellTowers}
          showSatellites={showSatellites}
          showCellTowers={showCellTowers}
          onMapClick={onMapClick}
          onMissionWaypointAdd={onMissionWaypointAdd}
          onZoneDrawn={onZoneDrawn}
          onBoundsChange={onBoundsChange}
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
