"use client";

import dynamic from "next/dynamic";
import { Aircraft, MapViewState } from "@/types";

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });
const CesiumGlobe = dynamic(() => import("./CesiumGlobe"), { ssr: false });

interface MapContainerProps {
  aircraft: Aircraft[];
  viewState: MapViewState;
  onSelectAircraft: (ac: Aircraft) => void;
}

export default function MapContainer({ aircraft, viewState, onSelectAircraft }: MapContainerProps) {
  return (
    <div className="relative w-full h-full grid-overlay">
      {viewState.mode === "2d" ? (
        <LeafletMap aircraft={aircraft} onSelectAircraft={onSelectAircraft} />
      ) : (
        <CesiumGlobe aircraft={aircraft} onSelectAircraft={onSelectAircraft} />
      )}

      {/* Crosshair overlay */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-0 right-0 h-px bg-argos-accent/5" />
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-argos-accent/5" />
      </div>

      {/* Coordinates */}
      <div className="absolute bottom-3 left-3 glass-panel px-3 py-1.5 pointer-events-none">
        <span className="text-[10px] font-mono text-argos-text-dim">
          {viewState.center[0].toFixed(4)}°N {viewState.center[1].toFixed(4)}°E — Z{viewState.zoom}
        </span>
      </div>
    </div>
  );
}
