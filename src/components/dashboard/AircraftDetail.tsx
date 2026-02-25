"use client";

import { Aircraft } from "@/types";

interface AircraftDetailProps {
  aircraft: Aircraft | null;
  onClose: () => void;
}

export default function AircraftDetail({ aircraft, onClose }: AircraftDetailProps) {
  if (!aircraft) return null;

  const fields = [
    { label: "ICAO24", value: aircraft.icao24.toUpperCase() },
    { label: "Indicatif", value: aircraft.callsign ?? "N/A" },
    { label: "Pays", value: aircraft.originCountry },
    { label: "Altitude baro", value: aircraft.baroAltitude ? `${aircraft.baroAltitude.toFixed(0)} m` : "N/A" },
    { label: "Altitude geo", value: aircraft.geoAltitude ? `${aircraft.geoAltitude.toFixed(0)} m` : "N/A" },
    { label: "Vitesse", value: aircraft.velocity ? `${(aircraft.velocity * 3.6).toFixed(0)} km/h` : "N/A" },
    { label: "Cap", value: aircraft.trueTrack ? `${aircraft.trueTrack.toFixed(0)}°` : "N/A" },
    { label: "Taux vertical", value: aircraft.verticalRate ? `${aircraft.verticalRate.toFixed(1)} m/s` : "N/A" },
    { label: "Squawk", value: aircraft.squawk ?? "N/A" },
    { label: "Position", value: aircraft.latitude && aircraft.longitude ? `${aircraft.latitude.toFixed(4)}°N, ${aircraft.longitude.toFixed(4)}°E` : "N/A" },
    { label: "Au sol", value: aircraft.onGround ? "Oui" : "Non" },
  ];

  const isEmergency = aircraft.squawk === "7700" || aircraft.squawk === "7600" || aircraft.squawk === "7500";

  return (
    <div className={`glass-panel p-3 animate-fade-in ${isEmergency ? "border-argos-danger/50 glow-accent" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${aircraft.onGround ? "bg-argos-text-dim" : "bg-argos-accent animate-pulse"}`} />
          <h3 className="text-sm font-semibold font-mono text-argos-accent">
            {aircraft.callsign ?? aircraft.icao24.toUpperCase()}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-argos-text-dim hover:text-argos-text text-xs transition-colors"
        >
          ✕
        </button>
      </div>

      {isEmergency && (
        <div className="bg-argos-danger/10 border border-argos-danger/30 rounded p-2 mb-3">
          <p className="text-[10px] font-mono text-argos-danger font-semibold">
            SQUAWK {aircraft.squawk} — {aircraft.squawk === "7700" ? "URGENCE GENERALE" : aircraft.squawk === "7600" ? "PANNE RADIO" : "DETOURNEMENT"}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-argos-text-dim uppercase">{label}</span>
            <span className="text-[11px] font-mono text-argos-text">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
