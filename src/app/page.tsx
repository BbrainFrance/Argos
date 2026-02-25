"use client";

import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import MapContainer from "@/components/map/MapContainer";
import StatsPanel from "@/components/dashboard/StatsPanel";
import AlertsPanel from "@/components/dashboard/AlertsPanel";
import AircraftDetail from "@/components/dashboard/AircraftDetail";
import { Aircraft, MapViewState, DashboardStats, Alert } from "@/types";

const REFRESH_INTERVAL = 15_000;

export default function ArgosPage() {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [activeLayers, setActiveLayers] = useState<string[]>(["air"]);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewState, setViewState] = useState<MapViewState>({
    mode: "2d",
    center: [46.6, 2.3],
    zoom: 6,
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/aircraft");
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();

      setAircraft(data.aircraft);
      setStats(data.stats);
      setAlerts(data.alerts.map((a: Alert) => ({ ...a, timestamp: new Date(a.timestamp) })));
      setLastUpdate(data.timestamp);
      setLoading(false);
    } catch (err) {
      console.error("Fetch failed:", err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleLayerToggle = (layerId: string) => {
    setActiveLayers((prev) =>
      prev.includes(layerId) ? prev.filter((l) => l !== layerId) : [...prev, layerId]
    );
  };

  const handleToggleView = () => {
    setViewState((prev) => ({
      ...prev,
      mode: prev.mode === "2d" ? "3d" : "2d",
    }));
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-argos-bg">
      <Sidebar onLayerToggle={handleLayerToggle} activeLayers={activeLayers} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          viewState={viewState}
          onToggleView={handleToggleView}
          aircraftCount={aircraft.length}
          lastUpdate={lastUpdate}
        />

        <div className="flex-1 flex min-h-0">
          {/* Map area */}
          <div className="flex-1 relative">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="w-16 h-16 border-2 border-argos-accent/20 rounded-full" />
                    <div className="absolute inset-0 w-16 h-16 border-2 border-argos-accent border-t-transparent rounded-full animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-mono text-argos-accent text-glow">ARGOS</p>
                    <p className="text-[10px] font-mono text-argos-text-dim mt-1">
                      Acquisition des donnees en cours...
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <MapContainer
                aircraft={aircraft}
                viewState={viewState}
                onSelectAircraft={setSelectedAircraft}
              />
            )}
          </div>

          {/* Right panel */}
          <div className="w-80 bg-argos-surface/50 border-l border-argos-border/50 overflow-y-auto p-3 space-y-4">
            <AircraftDetail
              aircraft={selectedAircraft}
              onClose={() => setSelectedAircraft(null)}
            />
            <StatsPanel stats={stats} />
            <AlertsPanel alerts={alerts} />
          </div>
        </div>
      </div>
    </div>
  );
}
