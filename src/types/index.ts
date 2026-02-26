export type EntityType = "aircraft" | "vessel" | "infrastructure" | "zone" | "event";

export interface GeoPosition {
  lat: number;
  lng: number;
  alt?: number;
  timestamp: number;
}

export interface Entity {
  id: string;
  type: EntityType;
  label: string;
  position: GeoPosition | null;
  metadata: Record<string, string | number | boolean | null>;
  trail: GeoPosition[];
  tracked: boolean;
  flagged: boolean;
}

export interface Aircraft extends Entity {
  type: "aircraft";
  metadata: {
    icao24: string;
    callsign: string | null;
    originCountry: string;
    baroAltitude: number | null;
    geoAltitude: number | null;
    velocity: number | null;
    trueTrack: number | null;
    verticalRate: number | null;
    onGround: boolean;
    squawk: string | null;
    lastContact: number;
  };
}

export interface Vessel extends Entity {
  type: "vessel";
  metadata: {
    mmsi: string;
    name: string | null;
    shipType: string | null;
    flag: string | null;
    speed: number | null;
    course: number | null;
    heading: number | null;
    destination: string | null;
    draught: number | null;
    length: number | null;
  };
}

export interface Infrastructure extends Entity {
  type: "infrastructure";
  metadata: {
    category: "military_base" | "airport" | "nuclear_plant" | "port" | "government" | "energy" | "telecom";
    name: string;
    operator: string | null;
    status: string | null;
    importance: "critical" | "high" | "medium" | "low";
  };
}

export interface ZoneOfInterest {
  id: string;
  name: string;
  type: "surveillance" | "exclusion" | "alert";
  polygon: [number, number][];
  color: string;
  active: boolean;
  alertOnEntry: boolean;
  alertOnExit: boolean;
  createdAt: Date;
}

export interface Alert {
  id: string;
  type: "info" | "warning" | "danger" | "critical";
  category: "squawk" | "military" | "anomaly" | "geofence" | "pattern" | "proximity";
  title: string;
  message: string;
  entityId?: string;
  zoneId?: string;
  timestamp: Date;
  source: string;
  acknowledged: boolean;
}

export interface MapViewState {
  mode: "2d" | "3d";
  center: [number, number];
  zoom: number;
}

export interface DashboardStats {
  totalAircraft: number;
  activeFlights: number;
  totalVessels: number;
  avgAltitude: number;
  avgSpeed: number;
  countriesDetected: string[];
  infrastructureCount: number;
  activeAlerts: number;
  trackedEntities: number;
}

export interface FilterState {
  search: string;
  entityTypes: EntityType[];
  countries: string[];
  altitudeRange: [number, number];
  speedRange: [number, number];
  showOnGround: boolean;
  showTrackedOnly: boolean;
  showFlaggedOnly: boolean;
  infrastructureCategories: string[];
}

export interface TimelineState {
  playing: boolean;
  speed: number;
  currentTime: number;
  startTime: number;
  endTime: number;
  snapshots: DataSnapshot[];
}

export interface DataSnapshot {
  timestamp: number;
  entities: Entity[];
}

export type DataSource = "opensky" | "ais" | "osm" | "sentinel" | "manual";

// ─── OPERATIONAL MARKERS ─────────────────────────────────────

export type MarkerAffiliation = "friendly" | "hostile" | "neutral" | "unknown" | "suspect";
export type MarkerCategory = "infantry" | "armor" | "artillery" | "air_defense" | "logistics" |
  "command" | "recon" | "engineering" | "naval" | "special_ops" | "medical" | "observation" |
  "threat" | "ied" | "checkpoint" | "hq" | "custom";

export interface OperationalMarker {
  id: string;
  affiliation: MarkerAffiliation;
  category: MarkerCategory;
  label: string;
  position: GeoPosition;
  notes: string;
  weaponRange?: number;
  createdBy: string;
  createdAt: Date;
}

export type RelationType = "escort" | "surveillance" | "supply" | "command" | "comms" | "threat" | "unknown";

export interface EntityLink {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
  label?: string;
  createdBy: string;
  createdAt: Date;
}

export interface MissionRoute {
  id: string;
  name: string;
  waypoints: { position: GeoPosition; label: string; type: "start" | "waypoint" | "objective" | "rally" | "extraction" }[];
  color: string;
  createdBy: string;
  createdAt: Date;
}

export interface DataLayer {
  id: string;
  name: string;
  source: DataSource;
  enabled: boolean;
  color: string;
  icon: string;
  entityCount: number;
}

export interface AnalysisResult {
  id: string;
  type: "anomaly" | "pattern" | "correlation" | "prediction";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  entities: string[];
  confidence: number;
  timestamp: Date;
}
