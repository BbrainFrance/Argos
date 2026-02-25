"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import MapContainer from "@/components/map/MapContainer";
import StatsPanel from "@/components/dashboard/StatsPanel";
import AlertsPanel from "@/components/dashboard/AlertsPanel";
import AnalysisPanel from "@/components/dashboard/AnalysisPanel";
import EntityDetail from "@/components/dashboard/EntityDetail";
import EntityList from "@/components/dashboard/EntityList";
import FilterBar from "@/components/dashboard/FilterBar";
import { Aircraft, Entity, MapViewState, DashboardStats, Alert, FilterState, AnalysisResult, ZoneOfInterest } from "@/types";
import { mergeAircraftWithHistory } from "@/lib/opensky";
import { generateAlerts } from "@/lib/alerts";
import { runAnalysis } from "@/lib/analysis";
import { FRANCE_INFRASTRUCTURE } from "@/lib/infrastructure";

const REFRESH_INTERVAL = 12_000;

const DEFAULT_ZONES: ZoneOfInterest[] = [
  {
    id: "zone-paris",
    name: "Zone Paris Centre",
    type: "surveillance",
    polygon: [[49.05, 1.8], [49.05, 2.8], [48.6, 2.8], [48.6, 1.8]],
    color: "#8b5cf6",
    active: true,
    alertOnEntry: false,
    alertOnExit: false,
    createdAt: new Date(),
  },
  {
    id: "zone-ile-longue",
    name: "Ile Longue (SNLE)",
    type: "exclusion",
    polygon: [[48.35, -4.60], [48.35, -4.45], [48.28, -4.45], [48.28, -4.60]],
    color: "#ef4444",
    active: true,
    alertOnEntry: true,
    alertOnExit: true,
    createdAt: new Date(),
  },
  {
    id: "zone-gravelines",
    name: "Centrale Gravelines",
    type: "alert",
    polygon: [[51.07, 2.0], [51.07, 2.2], [50.96, 2.2], [50.96, 2.0]],
    color: "#f59e0b",
    active: true,
    alertOnEntry: true,
    alertOnExit: false,
    createdAt: new Date(),
  },
];

export default function ArgosPage() {
  const entityMapRef = useRef<Map<string, Aircraft>>(new Map());
  const prevZoneMapRef = useRef<Map<string, string[]>>(new Map());

  const [entities, setEntities] = useState<Entity[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [zones] = useState<ZoneOfInterest[]>(DEFAULT_ZONES);
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({ air: true });
  const [showTrails, setShowTrails] = useState(true);
  const [showInfra, setShowInfra] = useState(true);
  const [rightPanel, setRightPanel] = useState<"dashboard" | "detail">("dashboard");

  const [viewState, setViewState] = useState<MapViewState>({ mode: "2d", center: [46.6, 2.3], zoom: 6 });

  const [filters, setFilters] = useState<FilterState>({
    search: "",
    entityTypes: ["aircraft"],
    countries: [],
    altitudeRange: [0, 15000],
    speedRange: [0, 2000],
    showOnGround: true,
    showTrackedOnly: false,
    showFlaggedOnly: false,
    infrastructureCategories: [],
  });

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/aircraft");
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();

      const merged = mergeAircraftWithHistory(data.aircraft, entityMapRef.current);
      entityMapRef.current = merged;

      const entityList = Array.from(merged.values());
      setEntities(entityList);

      const newAlerts = generateAlerts(entityList, zones, prevZoneMapRef.current);
      setAlerts((prev) => {
        const existingIds = new Set(prev.map((a) => a.entityId + a.category));
        const unique = newAlerts.filter((a) => !existingIds.has(a.entityId + a.category));
        return [...unique, ...prev].slice(0, 100);
      });

      const analysis = runAnalysis(entityList, FRANCE_INFRASTRUCTURE);
      setAnalysisResults(analysis);

      setLastUpdate(data.timestamp);
      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setRefreshing(false);
    }
  }, [zones]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filteredEntities = useMemo(() => {
    return entities.filter((e) => {
      if (e.type !== "aircraft") return false;
      const ac = e as Aircraft;

      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matchLabel = e.label.toLowerCase().includes(q);
        const matchIcao = ac.metadata.icao24.toLowerCase().includes(q);
        const matchCountry = ac.metadata.originCountry.toLowerCase().includes(q);
        const matchCallsign = ac.metadata.callsign?.toLowerCase().includes(q);
        if (!matchLabel && !matchIcao && !matchCountry && !matchCallsign) return false;
      }

      if (!filters.showOnGround && ac.metadata.onGround) return false;
      if (filters.showTrackedOnly && !ac.tracked) return false;
      if (filters.showFlaggedOnly && !ac.flagged) return false;

      const alt = ac.metadata.baroAltitude ?? 0;
      if (!ac.metadata.onGround && (alt < filters.altitudeRange[0] || alt > filters.altitudeRange[1])) return false;

      const speed = ac.metadata.velocity ? ac.metadata.velocity * 3.6 : 0;
      if (speed > filters.speedRange[1]) return false;

      return true;
    });
  }, [entities, filters]);

  const stats = useMemo((): DashboardStats => {
    const allAc = entities.filter((e): e is Aircraft => e.type === "aircraft");
    const active = allAc.filter((a) => !a.metadata.onGround && a.position);
    const alts = active.map((a) => a.metadata.baroAltitude ?? 0).filter((a) => a > 0);
    const speeds = active.map((a) => a.metadata.velocity ?? 0).filter((v) => v > 0);
    const countries = [...new Set(allAc.map((a) => a.metadata.originCountry))].sort();

    return {
      totalAircraft: allAc.length,
      activeFlights: active.length,
      totalVessels: 0,
      avgAltitude: alts.length > 0 ? Math.round(alts.reduce((a, b) => a + b, 0) / alts.length) : 0,
      avgSpeed: speeds.length > 0 ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 3.6) : 0,
      countriesDetected: countries,
      infrastructureCount: FRANCE_INFRASTRUCTURE.length,
      activeAlerts: alerts.filter((a) => !a.acknowledged).length,
      trackedEntities: entities.filter((e) => e.tracked).length,
    };
  }, [entities, alerts]);

  const selectedEntity = useMemo(
    () => entities.find((e) => e.id === selectedEntityId) ?? FRANCE_INFRASTRUCTURE.find((i) => i.id === selectedEntityId) ?? null,
    [entities, selectedEntityId]
  );

  const handleSelectEntity = useCallback((entity: Entity) => {
    setSelectedEntityId(entity.id);
    setRightPanel("detail");
  }, []);

  const handleTrack = useCallback((id: string) => {
    const ac = entityMapRef.current.get(id);
    if (ac) {
      ac.tracked = !ac.tracked;
      setEntities(Array.from(entityMapRef.current.values()));
    }
  }, []);

  const handleFlag = useCallback((id: string) => {
    const ac = entityMapRef.current.get(id);
    if (ac) {
      ac.flagged = !ac.flagged;
      setEntities(Array.from(entityMapRef.current.values()));
    }
  }, []);

  const handleAcknowledge = useCallback((alertId: string) => {
    setAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, acknowledged: true } : a));
  }, []);

  const handleFocusEntity = useCallback((entityId: string) => {
    setSelectedEntityId(entityId);
    setRightPanel("detail");
  }, []);

  const unackAlerts = alerts.filter((a) => !a.acknowledged);

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-argos-bg">
      <Sidebar
        activeLayers={activeLayers}
        onToggleLayer={(id) => setActiveLayers((p) => ({ ...p, [id]: !p[id] }))}
        showTrails={showTrails}
        onToggleTrails={() => setShowTrails((p) => !p)}
        showInfra={showInfra}
        onToggleInfra={() => setShowInfra((p) => !p)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          viewState={viewState}
          onToggleView={() => setViewState((p) => ({ ...p, mode: p.mode === "2d" ? "3d" : "2d" }))}
          entityCount={filteredEntities.length}
          alertCount={unackAlerts.length}
          analysisCount={analysisResults.length}
          lastUpdate={lastUpdate}
          refreshing={refreshing}
          onRefresh={fetchData}
        />

        <div className="flex-1 flex min-h-0">
          {/* Map */}
          <div className="flex-1 relative">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-argos-bg">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="w-20 h-20 border border-argos-accent/20 rounded-full" />
                    <div className="absolute inset-0 w-20 h-20 border-2 border-argos-accent border-t-transparent rounded-full animate-spin" />
                    <div className="absolute inset-3 w-14 h-14 border border-argos-accent/10 rounded-full" />
                    <div className="absolute inset-3 w-14 h-14 border border-argos-accent/40 border-b-transparent rounded-full animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-mono text-argos-accent text-glow tracking-[0.3em]">ARGOS</p>
                    <p className="text-[9px] font-mono text-argos-text-dim mt-2 tracking-widest">
                      ACQUISITION DONNEES EN COURS
                    </p>
                    <div className="flex gap-1 justify-center mt-3">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="w-1 h-3 bg-argos-accent/30 rounded-full animate-pulse"
                          style={{ animationDelay: `${i * 200}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <MapContainer
                entities={filteredEntities}
                infrastructure={FRANCE_INFRASTRUCTURE}
                zones={zones}
                viewState={viewState}
                selectedEntityId={selectedEntityId}
                onSelectEntity={handleSelectEntity}
                showTrails={showTrails}
                showInfrastructure={showInfra}
              />
            )}
          </div>

          {/* Right panel */}
          <div className="w-80 bg-argos-surface/30 border-l border-argos-border/30 flex flex-col min-h-0">
            {/* Panel tabs */}
            <div className="flex border-b border-argos-border/30">
              <button
                onClick={() => setRightPanel("dashboard")}
                className={`flex-1 py-2 text-[9px] font-mono uppercase tracking-widest transition-all ${
                  rightPanel === "dashboard"
                    ? "text-argos-accent border-b border-argos-accent"
                    : "text-argos-text-dim/50 hover:text-argos-text-dim"
                }`}
              >
                Tableau de bord
              </button>
              <button
                onClick={() => setRightPanel("detail")}
                className={`flex-1 py-2 text-[9px] font-mono uppercase tracking-widest transition-all ${
                  rightPanel === "detail"
                    ? "text-argos-accent border-b border-argos-accent"
                    : "text-argos-text-dim/50 hover:text-argos-text-dim"
                }`}
              >
                Detail {selectedEntity ? "●" : ""}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {rightPanel === "dashboard" ? (
                <>
                  <StatsPanel stats={stats} />
                  <AlertsPanel
                    alerts={alerts}
                    onAcknowledge={handleAcknowledge}
                    onFocusEntity={handleFocusEntity}
                  />
                  <AnalysisPanel
                    results={analysisResults}
                    onFocusEntity={handleFocusEntity}
                  />
                  <FilterBar
                    filters={filters}
                    onUpdate={(f) => setFilters((p) => ({ ...p, ...f }))}
                    entityCount={entities.length}
                    filteredCount={filteredEntities.length}
                  />
                  <EntityList
                    entities={filteredEntities}
                    selectedId={selectedEntityId}
                    onSelect={handleSelectEntity}
                  />
                </>
              ) : (
                <>
                  <EntityDetail
                    entity={selectedEntity}
                    onClose={() => { setSelectedEntityId(null); setRightPanel("dashboard"); }}
                    onTrack={handleTrack}
                    onFlag={handleFlag}
                  />
                  {!selectedEntity && (
                    <div className="text-center py-8">
                      <p className="text-[10px] font-mono text-argos-text-dim/50">
                        Selectionnez une entite sur la carte
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
