"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import MapContainer from "@/components/map/MapContainer";
import StatsPanel from "@/components/dashboard/StatsPanel";
import AlertsPanel from "@/components/dashboard/AlertsPanel";
import AnalysisPanel from "@/components/dashboard/AnalysisPanel";
import EntityDetail from "@/components/dashboard/EntityDetail";
import MapItemDetail from "@/components/dashboard/MapItemDetail";
import type { MapItem } from "@/components/dashboard/MapItemDetail";
import EntityList from "@/components/dashboard/EntityList";
import FilterBar from "@/components/dashboard/FilterBar";
import AIPanel from "@/components/dashboard/AIPanel";
import CommandCenter from "@/components/dashboard/CommandCenter";
import Timeline from "@/components/dashboard/Timeline";
import { Aircraft, Vessel, Entity, MapViewState, DashboardStats, Alert, FilterState, AnalysisResult, ZoneOfInterest, OperationalMarker, MarkerAffiliation, MarkerCategory, MissionRoute, EntityLink, RelationType, SatellitePosition, CellTower, ConflictEvent, FireHotspot, NaturalDisaster, CyberThreat, InternetOutage, SubmarineCable, Pipeline, MilitaryBase, NuclearFacility, IntelFeedItem } from "@/types";
import TacticalChat from "@/components/dashboard/TacticalChat";
import WorldMonitorPanel from "@/components/dashboard/WorldMonitorPanel";
import IntelFeedPanel from "@/components/dashboard/IntelFeedPanel";
import InstabilityPanel from "@/components/dashboard/InstabilityPanel";
import BriefingPanel from "@/components/dashboard/BriefingPanel";
import AuditPanel from "@/components/dashboard/AuditPanel";
import PhotoUploadPanel from "@/components/dashboard/PhotoUploadPanel";
import SIGINTPanel from "@/components/dashboard/SIGINTPanel";
import type { SIGINTTrace } from "@/components/dashboard/SIGINTPanel";
import ClassificationBanner, { ClassificationFooter } from "@/components/dashboard/ClassificationBanner";
import type { ClassificationLevel } from "@/lib/classification";
import type { CountryInstabilityScore } from "@/lib/country-instability";
import { mergeAircraftWithHistory } from "@/lib/opensky";
import { generateAlerts } from "@/lib/alerts";
import { runAnalysis } from "@/lib/analysis";
import { FRANCE_INFRASTRUCTURE } from "@/lib/infrastructure";
import { interpolateEntities } from "@/lib/interpolation";
import type { ParsedAction } from "@/lib/mistral-tools";
import { checkGeofencing } from "@/lib/geofencing";
import { generateReport } from "@/lib/pdf-export";

const REFRESH_INTERVAL = 15_000;
const INTERPOLATION_FPS = 2;

const FALLBACK_ZONES: ZoneOfInterest[] = [
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
  const vesselMapRef = useRef<Map<string, Vessel>>(new Map());
  const prevZoneMapRef = useRef<Map<string, string[]>>(new Map());
  const lastPollTimeRef = useRef(Date.now());
  const baseEntitiesRef = useRef<Entity[]>([]);
  const mapBoundsRef = useRef<{ latMin: number; latMax: number; lonMin: number; lonMax: number }>({
    latMin: 41, latMax: 52, lonMin: -6, lonMax: 10,
  });

  const [entities, setEntities] = useState<Entity[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [zones, setZones] = useState<ZoneOfInterest[]>(FALLBACK_ZONES);
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({});
  const [showTrails, setShowTrails] = useState(true);
  const [showInfra, setShowInfra] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [placeMarkerMode, setPlaceMarkerMode] = useState(false);
  const [operationalMarkers, setOperationalMarkers] = useState<OperationalMarker[]>([]);
  const [pendingMarkerPos, setPendingMarkerPos] = useState<{ lat: number; lng: number } | null>(null);
  const [newMarker, setNewMarker] = useState<{ label: string; affiliation: MarkerAffiliation; category: MarkerCategory; notes: string; weaponRange: string }>({
    label: "", affiliation: "hostile", category: "infantry", notes: "", weaponRange: "",
  });
  const [entityLinks, setEntityLinks] = useState<EntityLink[]>([]);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [pendingLinkTarget, setPendingLinkTarget] = useState<string | null>(null);
  const [newLinkType, setNewLinkType] = useState<RelationType>("unknown");
  const [missionRoutes, setMissionRoutes] = useState<MissionRoute[]>([]);
  const [missionPlanMode, setMissionPlanMode] = useState(false);
  const [activeMissionWaypoints, setActiveMissionWaypoints] = useState<MissionRoute["waypoints"]>([]);
  const [missionName, setMissionName] = useState("");
  const [timelineActive, setTimelineActive] = useState(false);
  const [timelineTime, setTimelineTime] = useState<number | null>(null);
  const [pendingPolygon, setPendingPolygon] = useState<[number, number][] | null>(null);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneType, setNewZoneType] = useState<"surveillance" | "exclusion" | "alert">("surveillance");
  const [rightPanel, setRightPanel] = useState<"dashboard" | "detail" | "sigint" | "geoint">("dashboard");
  const [rightPanelWidth, setRightPanelWidth] = useState(420);
  const [selectedMapItem, setSelectedMapItem] = useState<MapItem | null>(null);
  const [sigintTraces, setSigintTraces] = useState<SIGINTTrace[]>([]);
  const isResizingRef = useRef(false);

  const [satellitePositions, setSatellitePositions] = useState<SatellitePosition[]>([]);
  const [cellTowers, setCellTowers] = useState<CellTower[]>([]);
  const [gibsDate, setGibsDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [gibsProduct, setGibsProduct] = useState("MODIS_Terra_CorrectedReflectance_TrueColor");
  const [gibsDaysAgo, setGibsDaysAgo] = useState(3);
  const [viewState, setViewState] = useState<MapViewState>({ mode: "2d", center: [46.6, 2.3], zoom: 6 });

  // Phase 3 — World Monitor data
  const [conflictEvents, setConflictEvents] = useState<ConflictEvent[]>([]);
  const [fireHotspots, setFireHotspots] = useState<FireHotspot[]>([]);
  const [naturalDisasters, setNaturalDisasters] = useState<NaturalDisaster[]>([]);
  const [cyberThreats, setCyberThreats] = useState<CyberThreat[]>([]);
  const [internetOutages, setInternetOutages] = useState<InternetOutage[]>([]);
  const [submarineCables, setSubmarineCables] = useState<SubmarineCable[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [militaryBases, setMilitaryBases] = useState<MilitaryBase[]>([]);
  const [nuclearFacilities, setNuclearFacilities] = useState<NuclearFacility[]>([]);
  const [intelFeedItems, setIntelFeedItems] = useState<IntelFeedItem[]>([]);

  // Phase 4 — Intelligence IA
  const [instabilityScores, setInstabilityScores] = useState<CountryInstabilityScore[]>([]);
  const [briefingText, setBriefingText] = useState<string | null>(null);
  const [briefingProvider, setBriefingProvider] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  const [classificationLevel, setClassificationLevel] = useState<ClassificationLevel>("DR");
  const [showAuditPanel, setShowAuditPanel] = useState(false);

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

  const activeLayersRef = useRef(activeLayers);
  activeLayersRef.current = activeLayers;

  const fetchData = useCallback(async () => {
    const layers = activeLayersRef.current;
    if (!layers.air && !layers.maritime) { setRefreshing(false); return; }
    setRefreshing(true);
    try {
      const b = mapBoundsRef.current;
      const pad = 2;
      const qs = `latMin=${b.latMin - pad}&latMax=${b.latMax + pad}&lonMin=${b.lonMin - pad}&lonMax=${b.lonMax + pad}`;
      const [aircraftRes, vesselRes] = await Promise.allSettled([
        layers.air ? fetch(`/api/aircraft?${qs}`).then((r) => r.ok ? r.json() : null) : Promise.resolve(null),
        layers.maritime ? fetch(`/api/vessels?${qs}`).then((r) => r.ok ? r.json() : null) : Promise.resolve(null),
      ]);

      const aircraftData = aircraftRes.status === "fulfilled" ? aircraftRes.value : null;
      const vesselData = vesselRes.status === "fulfilled" ? vesselRes.value : null;

      if (aircraftData?.aircraft) {
        const merged = mergeAircraftWithHistory(aircraftData.aircraft, entityMapRef.current);
      entityMapRef.current = merged;
      }

      if (vesselData?.vessels) {
        for (const v of vesselData.vessels) {
          const prev = vesselMapRef.current.get(v.id);
          if (prev && v.position) {
            const trail = [...prev.trail];
            const last = trail[trail.length - 1];
            if (!last || last.lat !== v.position.lat || last.lng !== v.position.lng) {
              trail.push(v.position);
            }
            if (trail.length > 30) trail.splice(0, trail.length - 30);
            vesselMapRef.current.set(v.id, { ...v, trail, tracked: prev.tracked, flagged: prev.flagged });
          } else {
            vesselMapRef.current.set(v.id, { ...v, trail: v.position ? [v.position] : [] });
          }
        }
      }

      const aircraftList = Array.from(entityMapRef.current.values()) as Entity[];
      const vesselList = Array.from(vesselMapRef.current.values()) as Entity[];
      const allEntities = [...aircraftList, ...vesselList];
      baseEntitiesRef.current = allEntities;
      lastPollTimeRef.current = Date.now();
      setEntities(allEntities);

      const newAlerts = generateAlerts(allEntities, zones, prevZoneMapRef.current);
      const geoAlerts = checkGeofencing(allEntities, zones);
      const allNewAlerts = [...newAlerts, ...geoAlerts];
      setAlerts((prev) => {
        const existingIds = new Set(prev.map((a) => a.entityId + a.category + a.zoneId));
        const unique = allNewAlerts.filter((a) => !existingIds.has(a.entityId + a.category + (a.zoneId ?? "")));
        if (unique.length > 0) {
          fetch("/api/alerts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ alerts: unique }),
          }).catch(() => {});
        }
        return [...unique, ...prev].slice(0, 100);
      });

      const analysis = runAnalysis(allEntities, FRANCE_INFRASTRUCTURE);
      setAnalysisResults(analysis);

      setLastUpdate(aircraftData?.timestamp ?? new Date().toISOString());
      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setRefreshing(false);
    }
  }, [zones]);

  useEffect(() => {
    fetch("/api/zones")
      .then((r) => r.json())
      .then((data) => {
        if (data.zones?.length > 0) {
          setZones(data.zones.map((z: Record<string, unknown>) => ({
            ...z,
            createdAt: new Date(z.createdAt as string),
          })));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (timelineActive) return;
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData, timelineActive]);

  useEffect(() => {
    Promise.allSettled([
      fetch("/api/ops-markers").then((r) => r.ok ? r.json() : null),
      fetch("/api/missions").then((r) => r.ok ? r.json() : null),
      fetch("/api/entity-links").then((r) => r.ok ? r.json() : null),
    ]).then(([markersRes, missionsRes, linksRes]) => {
      if (markersRes.status === "fulfilled" && markersRes.value?.markers) {
        setOperationalMarkers(markersRes.value.markers.map((m: { id: string; affiliation: string; category: string; label: string; lat: number; lng: number; notes: string; weaponRange: number | null; createdBy: string; createdAt: string }) => ({
          id: m.id,
          affiliation: m.affiliation as MarkerAffiliation,
          category: m.category as MarkerCategory,
          label: m.label,
          position: { lat: m.lat, lng: m.lng, timestamp: new Date(m.createdAt).getTime() },
          notes: m.notes,
          weaponRange: m.weaponRange ?? undefined,
          createdBy: m.createdBy,
          createdAt: new Date(m.createdAt),
        })));
      }
      if (missionsRes.status === "fulfilled" && missionsRes.value?.missions) {
        setMissionRoutes(missionsRes.value.missions.map((m: { id: string; name: string; color: string; createdBy: string; createdAt: string; waypoints: { lat: number; lng: number; label: string; type: string }[] }) => ({
          id: m.id,
          name: m.name,
          waypoints: m.waypoints.map((wp) => ({
            position: { lat: wp.lat, lng: wp.lng, timestamp: Date.now() },
            label: wp.label,
            type: wp.type as "start" | "waypoint" | "objective" | "rally" | "extraction",
          })),
          color: m.color,
          createdBy: m.createdBy,
          createdAt: new Date(m.createdAt),
        })));
      }
      if (linksRes.status === "fulfilled" && linksRes.value?.links) {
        setEntityLinks(linksRes.value.links.map((l: { id: string; sourceId: string; targetId: string; relationType: string; label: string | null; createdBy: string; createdAt: string }) => ({
          id: l.id,
          sourceId: l.sourceId,
          targetId: l.targetId,
          type: l.relationType as RelationType,
          label: l.label ?? undefined,
          createdBy: l.createdBy,
          createdAt: new Date(l.createdAt),
        })));
      }
    });
  }, []);

  // Satellite constellation polling
  useEffect(() => {
    if (!activeLayers.satellites) { setSatellitePositions([]); return; }
    const fetchSats = () => {
      fetch("/api/satellites?groups=gps,galileo,iridium,starlink,french-mil")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data?.satellites) setSatellitePositions(data.satellites); })
        .catch(() => {});
    };
    fetchSats();
    const interval = setInterval(fetchSats, 30_000);
    return () => clearInterval(interval);
  }, [activeLayers.satellites]);

  // Cell tower fetch — reload on viewport change (debounced)
  const cellTowerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchCellTowersForBounds = useCallback((b: { latMin: number; latMax: number; lonMin: number; lonMax: number }) => {
    if (!activeLayers.cellTowers) return;
    const qs = `latMin=${b.latMin.toFixed(2)}&latMax=${b.latMax.toFixed(2)}&lonMin=${b.lonMin.toFixed(2)}&lonMax=${b.lonMax.toFixed(2)}&limit=500`;
    fetch(`/api/cell-towers?${qs}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.towers) setCellTowers(data.towers); })
      .catch(() => {});
  }, [activeLayers.cellTowers]);

  useEffect(() => {
    if (!activeLayers.cellTowers) { setCellTowers([]); return; }
    fetchCellTowersForBounds(mapBoundsRef.current);
  }, [activeLayers.cellTowers, fetchCellTowersForBounds]);

  // Phase 3 — World Monitor layer fetchers
  useEffect(() => {
    if (!activeLayers.conflicts) { setConflictEvents([]); return; }
    fetch("/api/conflicts?limit=500&days=30")
      .then(async (r) => { const d = await r.json(); if (!r.ok) { console.error("Conflits ACLED:", d.error); return; } if (d?.events) setConflictEvents(d.events); })
      .catch((e) => console.error("Conflits ACLED fetch:", e));
  }, [activeLayers.conflicts]);

  useEffect(() => {
    if (!activeLayers.fires) { setFireHotspots([]); return; }
    fetch("/api/fires?days=1")
      .then(async (r) => { const d = await r.json(); if (!r.ok) { console.error("Feux FIRMS:", d.error); return; } if (d?.fires) setFireHotspots(d.fires); })
      .catch((e) => console.error("Feux FIRMS fetch:", e));
  }, [activeLayers.fires]);

  useEffect(() => {
    if (!activeLayers.disasters) { setNaturalDisasters([]); return; }
    fetch("/api/disasters")
      .then(async (r) => { const d = await r.json(); if (!r.ok) { console.error("Catastrophes:", d.error); return; } if (d?.disasters) setNaturalDisasters(d.disasters); })
      .catch((e) => console.error("Catastrophes fetch:", e));
  }, [activeLayers.disasters]);

  useEffect(() => {
    if (!activeLayers.cyberThreats) { setCyberThreats([]); return; }
    fetch("/api/cyber-threats")
      .then(async (r) => { const d = await r.json(); if (!r.ok) { console.error("Cybermenaces:", d.error); return; } if (d?.threats) setCyberThreats(d.threats); })
      .catch((e) => console.error("Cybermenaces fetch:", e));
  }, [activeLayers.cyberThreats]);

  useEffect(() => {
    if (!activeLayers.internetOutages) { setInternetOutages([]); return; }
    fetch("/api/internet-outages")
      .then(async (r) => { const d = await r.json(); if (!r.ok) { console.error("Pannes internet:", d.error); return; } if (d?.outages) setInternetOutages(d.outages); })
      .catch((e) => console.error("Pannes internet fetch:", e));
  }, [activeLayers.internetOutages]);

  useEffect(() => {
    if (!activeLayers.submarineCables) { setSubmarineCables([]); return; }
    fetch("/api/submarine-cables")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.cables) setSubmarineCables(d.cables); })
      .catch(() => {});
  }, [activeLayers.submarineCables]);

  useEffect(() => {
    if (!activeLayers.pipelines) { setPipelines([]); return; }
    fetch("/api/pipelines")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.pipelines) setPipelines(d.pipelines); })
      .catch(() => {});
  }, [activeLayers.pipelines]);

  useEffect(() => {
    if (!activeLayers.militaryBases) { setMilitaryBases([]); return; }
    fetch("/api/military-bases")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.bases) setMilitaryBases(d.bases); })
      .catch(() => {});
  }, [activeLayers.militaryBases]);

  useEffect(() => {
    if (!activeLayers.nuclearFacilities) { setNuclearFacilities([]); return; }
    fetch("/api/nuclear-facilities")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.facilities) setNuclearFacilities(d.facilities); })
      .catch(() => {});
  }, [activeLayers.nuclearFacilities]);

  useEffect(() => {
    if (!activeLayers.intelFeeds) { setIntelFeedItems([]); return; }
    fetch("/api/intel-feeds")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.items) setIntelFeedItems(d.items); })
      .catch(() => {});
  }, [activeLayers.intelFeeds]);

  // Phase 4 — CII auto-compute when world monitor data changes
  useEffect(() => {
    if (conflictEvents.length === 0 && naturalDisasters.length === 0 && internetOutages.length === 0) {
      setInstabilityScores([]);
      return;
    }
    fetch("/api/instability-index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conflicts: conflictEvents, disasters: naturalDisasters, cyberThreats, outages: internetOutages }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.index) setInstabilityScores(d.index); })
      .catch(() => {});
  }, [conflictEvents, naturalDisasters, cyberThreats, internetOutages]);

  const handleRequestBriefing = useCallback(async () => {
    setBriefingLoading(true);
    try {
      const conflictSummary = Object.entries(
        conflictEvents.reduce<Record<string, { count: number; fatalities: number }>>((acc, e) => {
          if (!acc[e.country]) acc[e.country] = { count: 0, fatalities: 0 };
          acc[e.country].count++;
          acc[e.country].fatalities += e.fatalities;
          return acc;
        }, {})
      ).map(([country, v]) => ({ country, count: v.count, fatalities: v.fatalities }));

      const res = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conflicts: conflictSummary,
          disasters: naturalDisasters.map((d) => ({ title: d.title, severity: d.severity })),
          fires: fireHotspots.length,
          outages: internetOutages.map((o) => ({ country: o.country, severity: o.severity })),
          cyberThreats: cyberThreats.length,
          instabilityIndex: instabilityScores.slice(0, 10).map((s) => ({ country: s.country, score: s.score, level: s.level })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setBriefingText(data.briefing);
        setBriefingProvider(data.provider);
      }
    } catch {
      setBriefingText("[ERREUR] Impossible de generer le briefing.");
    } finally {
      setBriefingLoading(false);
    }
  }, [conflictEvents, naturalDisasters, fireHotspots, internetOutages, cyberThreats, instabilityScores]);

  useEffect(() => {
    if (timelineActive || loading) return;
    const interpInterval = setInterval(() => {
      const dtMs = Date.now() - lastPollTimeRef.current;
      const dtSec = dtMs / 1000;
      if (dtSec > 1 && dtSec < REFRESH_INTERVAL / 1000) {
        const interpolated = interpolateEntities(baseEntitiesRef.current, dtSec);
        setEntities(interpolated);
      }
    }, 1000 / INTERPOLATION_FPS);
    return () => clearInterval(interpInterval);
  }, [timelineActive, loading]);

  const fetchHistorical = useCallback(async (timestamp: number) => {
    try {
      const res = await fetch(`/api/positions/history?timestamp=${timestamp}&window=120000`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.entities) {
        setEntities(data.entities);
        setLastUpdate(data.timestamp);
      }
    } catch (err) {
      console.error("Historical fetch error:", err);
    }
  }, []);

  const handleTimelineChange = useCallback((ts: number | null) => {
    setTimelineTime(ts);
    if (ts !== null) {
      fetchHistorical(ts);
    }
  }, [fetchHistorical]);

  const filteredEntities = useMemo(() => {
    return entities.filter((e) => {
      if (e.type === "vessel") {
        if (!activeLayers.maritime) return false;
        const vs = e as Vessel;
        if (filters.search) {
          const q = filters.search.toLowerCase();
          const matchLabel = e.label.toLowerCase().includes(q);
          const matchMmsi = vs.metadata.mmsi.toLowerCase().includes(q);
          const matchDest = vs.metadata.destination?.toLowerCase().includes(q);
          if (!matchLabel && !matchMmsi && !matchDest) return false;
        }
        if (filters.showTrackedOnly && !vs.tracked) return false;
        if (filters.showFlaggedOnly && !vs.flagged) return false;
        return true;
      }

      if (e.type === "aircraft") {
        if (!activeLayers.air) return false;
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
      }

      return false;
    });
  }, [entities, filters, activeLayers]);

  const stats = useMemo((): DashboardStats => {
    const allAc = entities.filter((e): e is Aircraft => e.type === "aircraft");
    const active = allAc.filter((a) => !a.metadata.onGround && a.position);
    const alts = active.map((a) => a.metadata.baroAltitude ?? 0).filter((a) => a > 0);
    const speeds = active.map((a) => a.metadata.velocity ?? 0).filter((v) => v > 0);
    const countries = [...new Set(allAc.map((a) => a.metadata.originCountry))].sort();

    return {
      totalAircraft: allAc.length,
      activeFlights: active.length,
      totalVessels: entities.filter((e) => e.type === "vessel").length,
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

  const handleSelectEntity = useCallback(async (entity: Entity) => {
    if (linkMode) {
      if (!linkSource) {
        setLinkSource(entity.id);
        return;
      } else if (entity.id !== linkSource) {
        setPendingLinkTarget(entity.id);
        return;
      }
      return;
    }

    setSelectedEntityId(entity.id);
    setSelectedMapItem(null);
    setRightPanel("detail");

    if (entity.type === "aircraft" || entity.type === "vessel") {
      try {
        const res = await fetch(`/api/positions/history?entityId=${entity.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.positions?.length > 0) {
          const trail = data.positions.map((p: { lat: number; lng: number; alt: number | null; timestamp: string }) => ({
            lat: p.lat,
            lng: p.lng,
            alt: p.alt ?? undefined,
            timestamp: new Date(p.timestamp).getTime(),
          }));

          const ac = entityMapRef.current.get(entity.id);
          if (ac) {
            ac.trail = trail;
          } else {
            const vs = vesselMapRef.current.get(entity.id);
            if (vs) vs.trail = trail;
          }

          setEntities([
            ...Array.from(entityMapRef.current.values()),
            ...Array.from(vesselMapRef.current.values()),
          ]);
        }
      } catch { /* non-blocking */ }
    }
  }, [linkMode, linkSource]);

  const handleSelectMapItem = useCallback((item: MapItem) => {
    setSelectedMapItem(item);
    setSelectedEntityId(null);
    setRightPanel("detail");
  }, []);

  const handleTrack = useCallback((id: string) => {
    const ac = entityMapRef.current.get(id);
    let newVal = false;
    if (ac) {
      ac.tracked = !ac.tracked;
      newVal = ac.tracked;
    } else {
      const vs = vesselMapRef.current.get(id);
      if (vs) { vs.tracked = !vs.tracked; newVal = vs.tracked; }
    }
    fetch(`/api/entities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracked: newVal }),
    }).catch(() => {});
    setEntities([
      ...Array.from(entityMapRef.current.values()),
      ...Array.from(vesselMapRef.current.values()),
    ]);
  }, []);

  const handleFlag = useCallback((id: string) => {
    const ac = entityMapRef.current.get(id);
    let newVal = false;
    if (ac) {
      ac.flagged = !ac.flagged;
      newVal = ac.flagged;
    } else {
      const vs = vesselMapRef.current.get(id);
      if (vs) { vs.flagged = !vs.flagged; newVal = vs.flagged; }
    }
    fetch(`/api/entities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagged: newVal }),
    }).catch(() => {});
    setEntities([
      ...Array.from(entityMapRef.current.values()),
      ...Array.from(vesselMapRef.current.values()),
    ]);
  }, []);

  const handleAcknowledge = useCallback((alertId: string) => {
    setAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, acknowledged: true } : a));
  }, []);

  const handleFocusEntity = useCallback((entityId: string) => {
    setSelectedEntityId(entityId);
    setRightPanel("detail");
  }, []);

  const handlePanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    const startX = e.clientX;
    const startW = rightPanelWidth;
    const onMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = startX - ev.clientX;
      setRightPanelWidth(Math.max(320, Math.min(800, startW + delta)));
    };
    const onUp = () => {
      isResizingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [rightPanelWidth]);

  const handleZoneDrawn = useCallback((polygon: [number, number][]) => {
    setPendingPolygon(polygon);
    setDrawMode(false);
    setNewZoneName("");
    setNewZoneType("surveillance");
  }, []);

  const handleSaveZone = useCallback(async () => {
    if (!pendingPolygon || !newZoneName.trim()) return;
    const colorMap = { surveillance: "#8b5cf6", exclusion: "#ef4444", alert: "#f59e0b" };
    const zone: ZoneOfInterest = {
      id: `zone-${Date.now()}`,
      name: newZoneName.trim(),
      type: newZoneType,
      polygon: pendingPolygon,
      color: colorMap[newZoneType],
      active: true,
      alertOnEntry: newZoneType !== "surveillance",
      alertOnExit: newZoneType === "exclusion",
      createdAt: new Date(),
    };

    try {
      await fetch("/api/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(zone),
      });
    } catch { /* best-effort persistence */ }

    setZones((prev) => [...prev, zone]);
    setPendingPolygon(null);
  }, [pendingPolygon, newZoneName, newZoneType]);

  const handleAIActions = useCallback((actions: ParsedAction[]) => {
    for (const action of actions) {
      switch (action.type) {
        case "place_unit": {
          const d = action.data;
          const marker: OperationalMarker = {
            id: `ops-ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            affiliation: (d.affiliation as MarkerAffiliation) || "unknown",
            category: (d.category as MarkerCategory) || "infantry",
            label: d.label,
            position: { lat: d.lat, lng: d.lng, timestamp: Date.now() },
            notes: d.notes ?? "",
            weaponRange: d.weaponRange,
            createdBy: "ARGOS-IA",
            createdAt: new Date(),
          };
          setOperationalMarkers((p) => [...p, marker]);
          fetch("/api/ops-markers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ affiliation: marker.affiliation, category: marker.category, label: marker.label, lat: d.lat, lng: d.lng, notes: d.notes, weaponRange: d.weaponRange, createdBy: "ARGOS-IA" }) }).catch(() => {});
          break;
        }
        case "create_zone": {
          const d = action.data;
          const pts = 24;
          const polygon: [number, number][] = [];
          for (let i = 0; i < pts; i++) {
            const angle = (2 * Math.PI * i) / pts;
            const dlat = (d.radiusKm / 111.32) * Math.cos(angle);
            const dlng = (d.radiusKm / (111.32 * Math.cos(d.centerLat * Math.PI / 180))) * Math.sin(angle);
            polygon.push([d.centerLat + dlat, d.centerLng + dlng]);
          }
          const colorMap: Record<string, string> = { surveillance: "#8b5cf6", exclusion: "#ef4444", alert: "#f59e0b" };
          const zone: ZoneOfInterest = {
            id: `zone-ai-${Date.now()}`,
            name: d.name,
            type: d.type as ZoneOfInterest["type"],
            polygon,
            color: colorMap[d.type] ?? "#8b5cf6",
            active: true,
            alertOnEntry: d.type !== "surveillance",
            alertOnExit: d.type === "exclusion",
            createdAt: new Date(),
          };
          setZones((p) => [...p, zone]);
          break;
        }
        case "track_entity": {
          const id = action.data.identifier.toLowerCase();
          const entity = entities.find((e) => e.label.toLowerCase().includes(id) || e.id.toLowerCase().includes(id));
          if (entity) {
            handleTrack(entity.id);
          }
          break;
        }
        case "flag_entity": {
          const id = action.data.identifier.toLowerCase();
          const entity = entities.find((e) => e.label.toLowerCase().includes(id) || e.id.toLowerCase().includes(id));
          if (entity) {
            handleFlag(entity.id);
          }
          break;
        }
        case "link_entities": {
          const d = action.data;
          const src = entities.find((e) => e.label.toLowerCase().includes(d.sourceIdentifier.toLowerCase()));
          const tgt = entities.find((e) => e.label.toLowerCase().includes(d.targetIdentifier.toLowerCase()));
          if (src && tgt) {
            setEntityLinks((p) => [...p, {
              id: `link-ai-${Date.now()}`,
              sourceId: src.id,
              targetId: tgt.id,
              type: d.relationType as RelationType,
              createdBy: "ARGOS-IA",
              createdAt: new Date(),
            }]);
          }
          break;
        }
        case "plan_mission": {
          const d = action.data;
          setMissionRoutes((p) => [...p, {
            id: `mission-ai-${Date.now()}`,
            name: d.name,
            waypoints: d.waypoints.map((wp) => ({
              position: { lat: wp.lat, lng: wp.lng, timestamp: Date.now() },
              label: wp.label,
              type: wp.type as "start" | "waypoint" | "objective" | "rally" | "extraction",
            })),
            color: "#00ffaa",
            createdBy: "ARGOS-IA",
            createdAt: new Date(),
          }]);
          break;
        }
        case "clear_markers":
          setOperationalMarkers([]);
          break;
        case "generate_brief":
        case "analyze_entity":
        case "scan_threats":
          break;
      }
    }
  }, [entities, handleTrack, handleFlag]);

  const unackAlerts = alerts.filter((a) => !a.acknowledged);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-argos-bg">
      <ClassificationBanner
        level={classificationLevel}
        onLevelChange={(level) => {
          setClassificationLevel(level);
          fetch("/api/audit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "CHANGE_CLASSIFICATION", details: { from: classificationLevel, to: level } }),
          }).catch(() => {});
        }}
        editable
      />
      <div className="flex-1 flex overflow-hidden">
      <Sidebar
        activeLayers={activeLayers}
        onToggleLayer={(id) => setActiveLayers((p) => ({ ...p, [id]: !p[id] }))}
        showTrails={showTrails}
        onToggleTrails={() => setShowTrails((p) => !p)}
        showInfra={showInfra}
        onToggleInfra={() => setShowInfra((p) => !p)}
        drawMode={drawMode}
        onToggleDraw={() => { setDrawMode((p) => !p); setMeasureMode(false); }}
        measureMode={measureMode}
        onToggleMeasure={() => { setMeasureMode((p) => !p); setDrawMode(false); setPlaceMarkerMode(false); }}
        placeMarkerMode={placeMarkerMode}
        onTogglePlaceMarker={() => { setPlaceMarkerMode((p) => !p); setDrawMode(false); setMeasureMode(false); setMissionPlanMode(false); }}
        operationalMarkerCount={operationalMarkers.length}
        onClearMarkers={() => setOperationalMarkers([])}
        missionPlanMode={missionPlanMode}
        onToggleMissionPlan={() => { setMissionPlanMode((p) => !p); setDrawMode(false); setMeasureMode(false); setPlaceMarkerMode(false); }}
        missionRouteCount={missionRoutes.length}
        linkMode={linkMode}
        onToggleLinkMode={() => {
          setLinkMode((p) => !p);
          setLinkSource(null);
          setPendingLinkTarget(null);
          setDrawMode(false);
          setMeasureMode(false);
          setPlaceMarkerMode(false);
          setMissionPlanMode(false);
        }}
        entityLinkCount={entityLinks.length}
        gibsDate={gibsDate}
        gibsDaysAgo={gibsDaysAgo}
        gibsProduct={gibsProduct}
        onGibsDaysChange={(days) => {
          setGibsDaysAgo(days);
          const d = new Date();
          d.setDate(d.getDate() - days);
          setGibsDate(d.toISOString().slice(0, 10));
        }}
        onGibsProductChange={setGibsProduct}
        onExportPDF={() => {
          generateReport({
            stats,
            alerts,
            analyses: analysisResults,
            markers: operationalMarkers,
            entities,
            zones,
            aiBrief: briefingText ?? undefined,
            classification: classificationLevel,
          });
          fetch("/api/audit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "EXPORT_PDF", details: { classification: classificationLevel } }),
          }).catch(() => {});
        }}
        onToggleAudit={() => setShowAuditPanel((p) => !p)}
        onOpenSIGINT={() => setRightPanel((p) => p === "sigint" ? "dashboard" : "sigint")}
        onOpenGeoINT={() => setRightPanel((p) => p === "geoint" ? "dashboard" : "geoint")}
        sigintActive={rightPanel === "sigint"}
        geointActive={rightPanel === "geoint"}
        viewMode={viewState.mode}
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
              <>
              <MapContainer
                entities={filteredEntities}
                infrastructure={FRANCE_INFRASTRUCTURE}
                zones={zones}
                viewState={viewState}
                selectedEntityId={selectedEntityId}
                onSelectEntity={handleSelectEntity}
                showTrails={showTrails}
                showInfrastructure={showInfra}
                showSatellite={activeLayers.satellite}
                showSentinel={activeLayers.sentinel}
                gibsDate={gibsDate}
                gibsProduct={gibsProduct}
                drawMode={drawMode}
                measureMode={measureMode}
                operationalMarkers={operationalMarkers}
                entityLinks={entityLinks}
                satellites={satellitePositions}
                cellTowers={cellTowers}
                showSatellites={activeLayers.satellites}
                showCellTowers={activeLayers.cellTowers}
                placeMarkerMode={placeMarkerMode}
                missionPlanMode={missionPlanMode}
                missionRoutes={missionRoutes}
                activeMissionWaypoints={activeMissionWaypoints}
                onMapClick={(latlng) => {
                  if (placeMarkerMode) {
                    setPendingMarkerPos(latlng);
                    setPlaceMarkerMode(false);
                  }
                }}
                onMissionWaypointAdd={(latlng) => {
                  if (missionPlanMode) {
                    const wpType = activeMissionWaypoints.length === 0 ? "start" : "waypoint";
                    setActiveMissionWaypoints((p) => [...p, {
                      position: { lat: latlng.lat, lng: latlng.lng, timestamp: Date.now() },
                      label: `WP-${p.length + 1}`,
                      type: wpType,
                    }]);
                  }
                }}
                onZoneDrawn={handleZoneDrawn}
                onBoundsChange={(bounds) => {
                  mapBoundsRef.current = bounds;
                  if (activeLayers.cellTowers) {
                    if (cellTowerTimerRef.current) clearTimeout(cellTowerTimerRef.current);
                    cellTowerTimerRef.current = setTimeout(() => fetchCellTowersForBounds(bounds), 800);
                  }
                }}
                conflictEvents={conflictEvents}
                fireHotspots={fireHotspots}
                naturalDisasters={naturalDisasters}
                cyberThreats={cyberThreats}
                internetOutages={internetOutages}
                submarineCables={submarineCables}
                pipelines={pipelines}
                militaryBases={militaryBases}
                nuclearFacilities={nuclearFacilities}
                onSelectMapItem={handleSelectMapItem}
                sigintTraces={sigintTraces}
                />

                {drawMode && (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-argos-warning/10 border border-argos-warning/40 rounded-lg backdrop-blur-sm">
                    <p className="text-[10px] font-mono text-argos-warning tracking-wider">
                      MODE DESSIN — Cliquez pour placer des points, double-cliquez pour terminer
                    </p>
                  </div>
                )}

                {placeMarkerMode && (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-500/10 border border-red-500/40 rounded-lg backdrop-blur-sm">
                    <p className="text-[10px] font-mono text-red-400 tracking-wider">
                      MODE OPS — Cliquez sur la carte pour placer le marqueur
                    </p>
                  </div>
                )}

                {linkMode && (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-violet-500/10 border border-violet-500/40 rounded-lg backdrop-blur-sm">
                    <p className="text-[10px] font-mono text-violet-400 tracking-wider">
                      {!linkSource
                        ? "LIAISON — Selectionnez l'entite source"
                        : `LIAISON — Source: ${entities.find((e) => e.id === linkSource)?.label ?? linkSource}. Selectionnez la cible.`}
                    </p>
                  </div>
                )}

                {pendingLinkTarget && linkSource && (
                  <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="glass-panel p-5 w-80 space-y-4">
                      <div className="text-center pb-2 border-b border-violet-500/30">
                        <h3 className="text-xs font-mono text-violet-400 tracking-widest uppercase">Nouvelle Liaison</h3>
                        <p className="text-[9px] font-mono text-argos-text-dim mt-1">
                          {entities.find((e) => e.id === linkSource)?.label} → {entities.find((e) => e.id === pendingLinkTarget)?.label}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-mono text-argos-text-dim/60 uppercase tracking-widest">Type de relation</label>
                        <div className="flex gap-1 flex-wrap">
                          {([
                            { val: "escort" as const, label: "ESCORTE", color: "border-blue-500 text-blue-400" },
                            { val: "surveillance" as const, label: "SURVEIL.", color: "border-red-500 text-red-400" },
                            { val: "supply" as const, label: "RAVIT.", color: "border-yellow-500 text-yellow-400" },
                            { val: "command" as const, label: "CMD", color: "border-violet-500 text-violet-400" },
                            { val: "comms" as const, label: "COMMS", color: "border-cyan-500 text-cyan-400" },
                            { val: "threat" as const, label: "MENACE", color: "border-red-600 text-red-500" },
                          ]).map((t) => (
                            <button
                              key={t.val}
                              onClick={() => setNewLinkType(t.val)}
                              className={`px-2 py-1 text-[8px] font-mono uppercase rounded border transition-all ${
                                newLinkType === t.val ? t.color + " bg-white/5" : "border-argos-border/30 text-argos-text-dim/50"
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => { setPendingLinkTarget(null); setLinkSource(null); }}
                          className="flex-1 py-2 text-[9px] font-mono uppercase tracking-wider rounded border border-argos-border/30 text-argos-text-dim hover:text-argos-text transition-all"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={() => {
                            setEntityLinks((p) => [...p, {
                              id: `link-${Date.now()}`,
                              sourceId: linkSource!,
                              targetId: pendingLinkTarget!,
                              type: newLinkType,
                              createdBy: "operator",
                              createdAt: new Date(),
                            }]);
                            setPendingLinkTarget(null);
                            setLinkSource(null);
                            setNewLinkType("unknown");
                          }}
                          className="flex-1 py-2 text-[9px] font-mono uppercase tracking-wider rounded bg-violet-500/10 border border-violet-500/40 text-violet-400 hover:bg-violet-500/20 transition-all"
                        >
                          Lier
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {missionPlanMode && (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-emerald-500/10 border border-emerald-500/40 rounded-lg backdrop-blur-sm flex items-center gap-4">
                    <p className="text-[10px] font-mono text-emerald-400 tracking-wider">
                      PLANIFICATION — {activeMissionWaypoints.length} waypoint{activeMissionWaypoints.length > 1 ? "s" : ""}
                    </p>
                    {activeMissionWaypoints.length > 0 && (
                      <div className="flex gap-2">
                        <select
                          onChange={(e) => {
                            const val = e.target.value as "waypoint" | "objective" | "rally" | "extraction";
                            if (activeMissionWaypoints.length > 0) {
                              setActiveMissionWaypoints((p) => {
                                const copy = [...p];
                                copy[copy.length - 1] = { ...copy[copy.length - 1], type: val };
                                return copy;
                              });
                            }
                          }}
                          className="px-2 py-0.5 bg-argos-bg border border-argos-border/50 rounded text-[9px] font-mono text-argos-text"
                        >
                          <option value="waypoint">Waypoint</option>
                          <option value="objective">Objectif</option>
                          <option value="rally">Ralliement</option>
                          <option value="extraction">Extraction</option>
                        </select>
                        <button
                          onClick={() => {
                            const name = missionName.trim() || `Mission-${missionRoutes.length + 1}`;
                            setMissionRoutes((p) => [...p, {
                              id: `mission-${Date.now()}`,
                              name,
                              waypoints: activeMissionWaypoints,
                              color: "#00ffaa",
                              createdBy: "operator",
                              createdAt: new Date(),
                            }]);
                            setActiveMissionWaypoints([]);
                            setMissionPlanMode(false);
                            setMissionName("");
                          }}
                          className="px-3 py-0.5 text-[9px] font-mono uppercase rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30"
                        >
                          Valider
                        </button>
                        <button
                          onClick={() => { setActiveMissionWaypoints([]); setMissionPlanMode(false); setMissionName(""); }}
                          className="px-3 py-0.5 text-[9px] font-mono uppercase rounded border border-argos-border/30 text-argos-text-dim hover:text-argos-text"
                        >
                          Annuler
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {pendingPolygon && (
                  <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="glass-panel p-5 w-80 space-y-4">
                      <div className="text-center pb-2 border-b border-argos-border/30">
                        <h3 className="text-xs font-mono text-argos-accent tracking-widest uppercase">Nouvelle Zone</h3>
                        <p className="text-[9px] font-mono text-argos-text-dim mt-1">{pendingPolygon.length} points definis</p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-mono text-argos-text-dim/60 uppercase tracking-widest">Designation</label>
                        <input
                          type="text"
                          value={newZoneName}
                          onChange={(e) => setNewZoneName(e.target.value)}
                          placeholder="Ex: Zone Alpha-3"
                          autoFocus
                          className="w-full px-3 py-2 bg-argos-bg border border-argos-border/50 rounded text-sm font-mono text-argos-text placeholder:text-argos-text-dim/30 focus:outline-none focus:border-argos-accent/50"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-mono text-argos-text-dim/60 uppercase tracking-widest">Classification</label>
                        <div className="flex gap-2">
                          {(["surveillance", "exclusion", "alert"] as const).map((t) => {
                            const colors = { surveillance: "border-violet-500 text-violet-400", exclusion: "border-red-500 text-red-400", alert: "border-yellow-500 text-yellow-400" };
                            return (
                              <button
                                key={t}
                                onClick={() => setNewZoneType(t)}
                                className={`flex-1 py-1.5 text-[9px] font-mono uppercase rounded border transition-all ${
                                  newZoneType === t ? colors[t] + " bg-white/5" : "border-argos-border/30 text-argos-text-dim/50"
                                }`}
                              >
                                {t}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => setPendingPolygon(null)}
                          className="flex-1 py-2 text-[9px] font-mono uppercase tracking-wider rounded border border-argos-border/30 text-argos-text-dim hover:text-argos-text transition-all"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={handleSaveZone}
                          disabled={!newZoneName.trim()}
                          className="flex-1 py-2 text-[9px] font-mono uppercase tracking-wider rounded bg-argos-accent/10 border border-argos-accent/40 text-argos-accent hover:bg-argos-accent/20 transition-all disabled:opacity-30"
                        >
                          Creer Zone
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {activeLayers.sentinel && viewState.mode === "2d" && (
                  <div className="absolute bottom-4 left-4 z-40 gibs-timeline glass-panel p-3 space-y-2" style={{ width: 340 }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono text-cyan-400 tracking-widest uppercase">IMAGERIE NASA GIBS</span>
                      <span className="text-[10px] font-mono text-argos-text font-bold">{gibsDate}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-mono text-argos-text-dim w-6 text-right">J-30</span>
                      <input
                        type="range"
                        min={1}
                        max={30}
                        value={31 - gibsDaysAgo}
                        onChange={(e) => {
                          const days = 31 - parseInt(e.target.value);
                          setGibsDaysAgo(days);
                          const d = new Date();
                          d.setDate(d.getDate() - days);
                          setGibsDate(d.toISOString().slice(0, 10));
                        }}
                        className="flex-1 h-1 gibs-slider"
                      />
                      <span className="text-[8px] font-mono text-argos-text-dim w-6">J-1</span>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {([
                        { id: "MODIS_Terra_CorrectedReflectance_TrueColor", label: "VISIBLE" },
                        { id: "MODIS_Terra_CorrectedReflectance_Bands721", label: "IR" },
                        { id: "VIIRS_SNPP_CorrectedReflectance_TrueColor", label: "VIIRS HD" },
                        { id: "MODIS_Terra_NDVI_8Day", label: "NDVI" },
                      ] as const).map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setGibsProduct(p.id)}
                          className={`px-2 py-0.5 text-[7px] font-mono uppercase rounded border transition-all ${
                            gibsProduct === p.id
                              ? "border-cyan-500 text-cyan-400 bg-cyan-500/10"
                              : "border-argos-border/30 text-argos-text-dim/50 hover:text-argos-text-dim"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {pendingMarkerPos && (
                  <div className="absolute inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="glass-panel p-6 w-[480px] max-h-[90vh] overflow-y-auto space-y-5">
                      <div className="text-center pb-3 border-b border-red-500/30">
                        <h3 className="text-sm font-mono text-red-400 tracking-widest uppercase font-bold">Marqueur Operationnel</h3>
                        <p className="text-xs font-mono text-argos-text-dim mt-1">
                          {pendingMarkerPos.lat.toFixed(4)}N, {pendingMarkerPos.lng.toFixed(4)}E
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-argos-text-dim/70 uppercase tracking-widest">Designation</label>
                        <input
                          type="text"
                          value={newMarker.label}
                          onChange={(e) => setNewMarker((p) => ({ ...p, label: e.target.value }))}
                          placeholder="Ex: BTG Alpha-1"
                          autoFocus
                          className="w-full px-3 py-2.5 bg-argos-bg border border-argos-border/50 rounded text-sm font-mono text-argos-text placeholder:text-argos-text-dim/30 focus:outline-none focus:border-argos-accent/50"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-mono text-argos-text-dim/70 uppercase tracking-widest">Affiliation</label>
                        <div className="grid grid-cols-5 gap-2">
                          {([
                            { val: "friendly" as const, label: "AMI", color: "border-blue-500 text-blue-400" },
                            { val: "hostile" as const, label: "HOSTILE", color: "border-red-500 text-red-400" },
                            { val: "neutral" as const, label: "NEUTRE", color: "border-green-500 text-green-400" },
                            { val: "unknown" as const, label: "INCONNU", color: "border-yellow-500 text-yellow-400" },
                            { val: "suspect" as const, label: "SUSPECT", color: "border-orange-500 text-orange-400" },
                          ]).map((a) => (
                            <button
                              key={a.val}
                              onClick={() => setNewMarker((p) => ({ ...p, affiliation: a.val }))}
                              className={`px-2 py-2 text-[10px] font-mono uppercase rounded border transition-all text-center ${
                                newMarker.affiliation === a.val ? a.color + " bg-white/5 font-bold" : "border-argos-border/30 text-argos-text-dim/50"
                              }`}
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-mono text-argos-text-dim/70 uppercase tracking-widest">Type Unite</label>
                        <div className="grid grid-cols-5 gap-1.5">
                          {([
                            { val: "infantry" as const, label: "INF", desc: "Infanterie" },
                            { val: "armor" as const, label: "ARM", desc: "Blindes" },
                            { val: "artillery" as const, label: "ART", desc: "Artillerie" },
                            { val: "air_defense" as const, label: "AD", desc: "Defense AA" },
                            { val: "recon" as const, label: "RCN", desc: "Reco" },
                            { val: "special_ops" as const, label: "SOF", desc: "Ops Spe" },
                            { val: "logistics" as const, label: "LOG", desc: "Logistique" },
                            { val: "command" as const, label: "CMD", desc: "Commandement" },
                            { val: "hq" as const, label: "HQ", desc: "Etat-Major" },
                            { val: "medical" as const, label: "MED", desc: "Medical" },
                            { val: "engineering" as const, label: "ENG", desc: "Genie" },
                            { val: "threat" as const, label: "THR", desc: "Menace" },
                            { val: "ied" as const, label: "IED", desc: "Explosif" },
                            { val: "checkpoint" as const, label: "CP", desc: "Checkpoint" },
                            { val: "observation" as const, label: "OBS", desc: "Observation" },
                          ]).map((c) => (
                            <button
                              key={c.val}
                              onClick={() => setNewMarker((p) => ({ ...p, category: c.val }))}
                              title={c.desc}
                              className={`px-1.5 py-2 text-[10px] font-mono uppercase rounded border transition-all text-center ${
                                newMarker.category === c.val ? "border-argos-accent text-argos-accent bg-argos-accent/10 font-bold" : "border-argos-border/30 text-argos-text-dim/50"
                              }`}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-argos-text-dim/70 uppercase tracking-widest">Portee armes (km)</label>
                        <input
                          type="number"
                          value={newMarker.weaponRange}
                          onChange={(e) => setNewMarker((p) => ({ ...p, weaponRange: e.target.value }))}
                          placeholder="Ex: 30"
                          className="w-full px-3 py-2.5 bg-argos-bg border border-argos-border/50 rounded text-sm font-mono text-argos-text placeholder:text-argos-text-dim/30 focus:outline-none focus:border-argos-accent/50"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-argos-text-dim/70 uppercase tracking-widest">Notes</label>
                        <textarea
                          value={newMarker.notes}
                          onChange={(e) => setNewMarker((p) => ({ ...p, notes: e.target.value }))}
                          placeholder="Intelligence / observations..."
                          rows={3}
                          className="w-full px-3 py-2.5 bg-argos-bg border border-argos-border/50 rounded text-sm font-mono text-argos-text placeholder:text-argos-text-dim/30 focus:outline-none focus:border-argos-accent/50 resize-none"
                        />
                      </div>

                      <div className="flex gap-3 pt-3">
                        <button
                          onClick={() => { setPendingMarkerPos(null); setNewMarker({ label: "", affiliation: "hostile", category: "infantry", notes: "", weaponRange: "" }); }}
                          className="flex-1 py-2.5 text-xs font-mono uppercase tracking-wider rounded border border-argos-border/30 text-argos-text-dim hover:text-argos-text transition-all"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={() => {
                            if (!newMarker.label.trim() || !pendingMarkerPos) return;
                            const marker: OperationalMarker = {
                              id: `ops-${Date.now()}`,
                              affiliation: newMarker.affiliation,
                              category: newMarker.category,
                              label: newMarker.label,
                              position: { lat: pendingMarkerPos.lat, lng: pendingMarkerPos.lng, timestamp: Date.now() },
                              notes: newMarker.notes,
                              weaponRange: newMarker.weaponRange ? parseFloat(newMarker.weaponRange) : undefined,
                              createdBy: "operator",
                              createdAt: new Date(),
                            };
                            setOperationalMarkers((p) => [...p, marker]);
                            fetch("/api/ops-markers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ affiliation: marker.affiliation, category: marker.category, label: marker.label, lat: marker.position.lat, lng: marker.position.lng, notes: marker.notes, weaponRange: marker.weaponRange, createdBy: marker.createdBy }) }).catch(() => {});
                            setPendingMarkerPos(null);
                            setNewMarker({ label: "", affiliation: "hostile", category: "infantry", notes: "", weaponRange: "" });
                          }}
                          disabled={!newMarker.label.trim()}
                          className="flex-1 py-2.5 text-xs font-mono uppercase tracking-wider rounded bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-30 font-bold"
                        >
                          Deployer
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right panel */}
          <div className="flex-shrink-0 bg-argos-surface/30 border-l border-argos-border/30 flex flex-col min-h-0 relative" style={{ width: rightPanelWidth }}>
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-50 hover:bg-argos-accent/30 active:bg-argos-accent/50 transition-colors"
              onMouseDown={handlePanelResizeStart}
            />
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
                Dashboard
              </button>
              <button
                onClick={() => setRightPanel("detail")}
                className={`flex-1 py-2 text-[9px] font-mono uppercase tracking-widest transition-all ${
                  rightPanel === "detail"
                    ? "text-argos-accent border-b border-argos-accent"
                    : "text-argos-text-dim/50 hover:text-argos-text-dim"
                }`}
              >
                Detail {(selectedEntity || selectedMapItem) ? "●" : ""}
              </button>
              <button
                onClick={() => setRightPanel("sigint")}
                className={`flex-1 py-2 text-[9px] font-mono uppercase tracking-widest transition-all ${
                  rightPanel === "sigint"
                    ? "text-red-400 border-b border-red-400"
                    : "text-argos-text-dim/50 hover:text-argos-text-dim"
                }`}
              >
                SIGINT
              </button>
              <button
                onClick={() => setRightPanel("geoint")}
                className={`flex-1 py-2 text-[9px] font-mono uppercase tracking-widest transition-all ${
                  rightPanel === "geoint"
                    ? "text-purple-400 border-b border-purple-400"
                    : "text-argos-text-dim/50 hover:text-argos-text-dim"
                }`}
              >
                GeoINT
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {rightPanel === "dashboard" && (
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
                  <CommandCenter
                    stats={stats}
                    alerts={alerts}
                    analyses={analysisResults}
                    entities={entities}
                    selectedEntity={selectedEntity}
                    onAction={handleAIActions}
                  />
                  <AIPanel
                    stats={stats}
                    alerts={alerts}
                    analyses={analysisResults}
                    selectedEntity={selectedEntity}
                  />
                  <WorldMonitorPanel
                    conflicts={conflictEvents}
                    fires={fireHotspots}
                    disasters={naturalDisasters}
                    outages={internetOutages}
                  />
                  <InstabilityPanel scores={instabilityScores} />
                  <BriefingPanel
                    onRequestBriefing={handleRequestBriefing}
                    briefing={briefingText}
                    provider={briefingProvider}
                    loading={briefingLoading}
                  />
                  <IntelFeedPanel items={intelFeedItems} />
                  <TacticalChat operatorName="OPERATOR" />
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
              )}

              {rightPanel === "detail" && (
                <>
                  <EntityDetail
                    entity={selectedEntity}
                    onClose={() => { setSelectedEntityId(null); setRightPanel("dashboard"); }}
                    onTrack={handleTrack}
                    onFlag={handleFlag}
                  />
                  <MapItemDetail
                    item={selectedMapItem}
                    onClose={() => { setSelectedMapItem(null); setRightPanel("dashboard"); }}
                  />
                  {!selectedEntity && !selectedMapItem && (
                    <div className="text-center py-8">
                      <p className="text-[10px] font-mono text-argos-text-dim/50">
                        Selectionnez une entite sur la carte
                      </p>
                    </div>
                  )}
                </>
              )}

              {rightPanel === "sigint" && (
                <SIGINTPanel
                  traces={sigintTraces}
                  onAddTrace={(trace) => setSigintTraces((p) => [...p, trace])}
                  onRemoveTrace={(id) => {
                    setSigintTraces((p) => p.filter((t) => t.id !== id));
                    setOperationalMarkers((p) => p.filter((m) => !m.id.startsWith(`sigint-pos-${id}`)));
                  }}
                  onAddManualPosition={(traceId, pos) => {
                    setSigintTraces((prev) =>
                      prev.map((t) =>
                        t.id === traceId ? { ...t, positions: [...t.positions, pos] } : t
                      )
                    );
                    const trace = sigintTraces.find((t) => t.id === traceId);
                    const posIdx = trace ? trace.positions.length : 0;
                    const marker: OperationalMarker = {
                      id: `sigint-pos-${traceId}-${posIdx}`,
                      affiliation: "unknown" as MarkerAffiliation,
                      category: "observation" as MarkerCategory,
                      label: `📱 ${trace?.label ?? "SIGINT"} #${posIdx + 1}`,
                      position: { lat: pos.lat, lng: pos.lng, timestamp: pos.timestamp },
                      notes: [
                        pos.cellId ? `Cell: ${pos.cellId}` : "",
                        pos.operator ? `Op: ${pos.operator}` : "",
                        new Date(pos.timestamp).toLocaleString("fr-FR"),
                      ].filter(Boolean).join(" | "),
                      createdBy: "SIGINT",
                      createdAt: new Date(),
                    };
                    setOperationalMarkers((p) => [...p, marker]);
                  }}
                  onFocusTrace={(trace) => {
                    if (trace.positions.length > 0) {
                      const last = trace.positions[trace.positions.length - 1];
                      setViewState((v) => ({ ...v, latitude: last.lat, longitude: last.lng, zoom: 12 }));
                    }
                  }}
                />
              )}

              {rightPanel === "geoint" && (
                <PhotoUploadPanel
                  onGeolocated={(result) => {
                    const marker: OperationalMarker = {
                      id: `photo-${Date.now()}`,
                      affiliation: "unknown" as MarkerAffiliation,
                      category: "observation" as MarkerCategory,
                      label: `📸 ${result.fileName}`,
                      position: { lat: result.lat, lng: result.lng, timestamp: Date.now() },
                      notes: result.method === "exif"
                        ? `GPS EXIF — ${result.details.exifCamera ?? ""} ${result.details.exifDate ?? ""}`
                        : `IA Mistral Pixtral — ${result.details.aiDescription ?? ""}`,
                      createdBy: "GEOINT",
                      createdAt: new Date(),
                    };
                    setOperationalMarkers((p) => [...p, marker]);
                    fetch("/api/ops-markers", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        affiliation: marker.affiliation,
                        category: marker.category,
                        label: marker.label,
                        lat: result.lat,
                        lng: result.lng,
                        notes: marker.notes,
                        createdBy: "GEOINT",
                      }),
                    }).catch(() => {});
                  }}
                />
              )}
            </div>
          </div>
        </div>

        <Timeline
          onTimeChange={handleTimelineChange}
          isActive={timelineActive}
          onToggle={() => setTimelineActive((p) => !p)}
        />
      </div>
      </div>

      {showAuditPanel && (
        <div className="absolute bottom-8 right-4 w-[420px] h-[320px] bg-[#0d1117]/95 border border-white/10 rounded-lg shadow-2xl z-50 flex flex-col overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between px-2 py-1 border-b border-white/5">
            <span className="text-[8px] font-mono text-argos-accent tracking-widest">JOURNAL D&apos;AUDIT</span>
            <button onClick={() => setShowAuditPanel(false)} className="text-argos-text-dim/40 hover:text-white text-[10px]">X</button>
          </div>
          <div className="flex-1 overflow-hidden">
            <AuditPanel />
          </div>
        </div>
      )}

      <ClassificationFooter level={classificationLevel} />
    </div>
  );
}
