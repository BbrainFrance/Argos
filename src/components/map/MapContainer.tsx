"use client";

import dynamic from "next/dynamic";
import { Entity, Infrastructure, MapViewState, ZoneOfInterest } from "@/types";

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });

interface MapContainerProps {
  entities: Entity[];
  infrastructure: Infrastructure[];
  zones: ZoneOfInterest[];
  viewState: MapViewState;
  selectedEntityId: string | null;
  onSelectEntity: (entity: Entity) => void;
  showTrails: boolean;
  showInfrastructure: boolean;
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
}: MapContainerProps) {
  return (
    <div className="relative w-full h-full">
      <LeafletMap
        entities={entities}
        infrastructure={infrastructure}
        zones={zones}
        selectedEntityId={selectedEntityId}
        onSelectEntity={onSelectEntity}
        showTrails={showTrails}
        showInfrastructure={showInfrastructure}
      />

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
