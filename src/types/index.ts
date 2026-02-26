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

export type DataSource = "opensky" | "ais" | "osm" | "sentinel" | "manual" | "acled" | "firms" | "gdacs" | "cloudflare" | "feodo" | "urlhaus" | "abuseipdb" | "rss";

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

// ─── SATELLITES ──────────────────────────────────────────────

export type SatelliteGroup = "gps" | "galileo" | "glonass" | "iridium" | "starlink" | "military" | "french-mil";

export interface SatellitePosition {
  id: string;
  name: string;
  group: SatelliteGroup;
  lat: number;
  lng: number;
  alt: number;
  velocity: number;
}

// ─── CELL TOWERS ────────────────────────────────────────────

export interface CellTower {
  id: string;
  lat: number;
  lng: number;
  mcc: number;
  mnc: number;
  lac: number;
  cellId: number;
  radio: string;
  range: number;
  operator?: string;
}

// ─── TACTICAL CHAT ──────────────────────────────────────────

export interface TacticalMessage {
  id: string;
  sender: string;
  channel: string;
  content: string;
  priority: "routine" | "priority" | "flash";
  timestamp: Date;
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

// ─── PHASE 3 — NOUVELLES COUCHES DE DONNÉES ────────────────

// ACLED — Conflits armés, protestations
export interface ConflictEvent {
  id: string;
  eventDate: string;
  eventType: "battles" | "explosions" | "protests" | "riots" | "violence_against_civilians" | "strategic_developments";
  subEventType: string;
  actor1: string;
  actor2: string | null;
  country: string;
  region: string;
  lat: number;
  lng: number;
  fatalities: number;
  notes: string;
  source: string;
  sourceScale: string;
  timestamp: number;
}

// Cyber menaces — IOCs
export type IOCType = "ip" | "domain" | "url" | "hash";
export type ThreatCategory = "botnet" | "malware" | "phishing" | "c2" | "ransomware" | "exploit" | "scanner";

export interface CyberThreat {
  id: string;
  iocType: IOCType;
  iocValue: string;
  threatCategory: ThreatCategory;
  confidence: number;
  source: "feodo_tracker" | "urlhaus" | "abuseipdb" | "manual";
  firstSeen: string;
  lastSeen: string;
  lat: number | null;
  lng: number | null;
  country: string | null;
  tags: string[];
  reportCount: number;
}

// Câbles sous-marins
export interface SubmarineCable {
  id: string;
  name: string;
  owners: string[];
  lengthKm: number;
  rfsDate: string | null;
  status: "active" | "planned" | "decommissioned" | "fault";
  coordinates: [number, number][];
  landingPoints: { name: string; country: string; lat: number; lng: number }[];
  capacityTbps: number | null;
}

// Pipelines pétrole/gaz
export interface Pipeline {
  id: string;
  name: string;
  type: "oil" | "gas" | "lng" | "products";
  operator: string | null;
  status: "active" | "planned" | "decommissioned";
  coordinates: [number, number][];
  capacityMbpd: number | null;
  countries: string[];
}

// Bases militaires
export interface MilitaryBase {
  id: string;
  name: string;
  country: string;
  operator: string;
  type: "air_base" | "naval_base" | "army_base" | "joint" | "missile" | "radar" | "logistics" | "training" | "intelligence";
  lat: number;
  lng: number;
  status: "active" | "standby" | "closed";
  branch: string | null;
  notes: string | null;
}

// Installations nucléaires
export interface NuclearFacility {
  id: string;
  name: string;
  country: string;
  type: "power_plant" | "research_reactor" | "enrichment" | "reprocessing" | "waste_storage" | "military";
  lat: number;
  lng: number;
  status: "operational" | "under_construction" | "decommissioning" | "shutdown";
  capacityMw: number | null;
  operator: string | null;
  reactorCount: number | null;
}

// NASA FIRMS — Feux par satellite
export interface FireHotspot {
  id: string;
  lat: number;
  lng: number;
  brightness: number;
  scan: number;
  track: number;
  acqDate: string;
  acqTime: string;
  satellite: "MODIS" | "VIIRS_SNPP" | "VIIRS_NOAA20" | "VIIRS_NOAA21";
  confidence: "low" | "nominal" | "high";
  frp: number;
  country: string | null;
}

// GDACS — Catastrophes naturelles
export interface NaturalDisaster {
  id: string;
  eventType: "earthquake" | "flood" | "cyclone" | "volcano" | "drought" | "wildfire" | "tsunami";
  title: string;
  description: string;
  lat: number;
  lng: number;
  severity: "green" | "orange" | "red";
  alertLevel: number;
  country: string;
  fromDate: string;
  toDate: string | null;
  population: number | null;
  source: string;
  url: string | null;
}

// Pannes internet
export interface InternetOutage {
  id: string;
  country: string;
  region: string | null;
  asn: number | null;
  asName: string | null;
  lat: number;
  lng: number;
  type: "country" | "asn" | "region";
  severity: "minor" | "moderate" | "major";
  startTime: string;
  endTime: string | null;
  scoreDropPct: number;
  source: "cloudflare_radar" | "ioda";
}

// RSS — Flux géopolitiques / défense / renseignement
export interface IntelFeedItem {
  id: string;
  feedId: string;
  feedName: string;
  title: string;
  link: string;
  pubDate: string;
  summary: string;
  categories: string[];
  country: string | null;
  lat: number | null;
  lng: number | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  relevanceScore: number;
}
