"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DeckGL, { ScatterplotLayer, PathLayer, SolidPolygonLayer, IconLayer } from "deck.gl";
import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { WebMercatorViewport, type Layer } from "@deck.gl/core";
import {
  Entity,
  Aircraft,
  Vessel,
  Infrastructure,
  ZoneOfInterest,
  OperationalMarker,
  MissionRoute,
  EntityLink,
  SatellitePosition,
  CellTower,
  ConflictEvent,
  FireHotspot,
  NaturalDisaster,
  CyberThreat,
  InternetOutage,
  SubmarineCable,
  Pipeline,
  MilitaryBase,
  NuclearFacility,
} from "@/types";
import { INFRA_ICONS } from "@/lib/infrastructure";
import {
  getAircraftAffiliation,
  getVesselAffiliation,
} from "@/lib/nato-symbols";
import { predictTrajectory } from "@/lib/interpolation";
import type { MapItem } from "@/components/dashboard/MapItemDetail";
import type { SIGINTTrace } from "@/components/dashboard/SIGINTPanel";

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const INITIAL_VIEW = { longitude: 2.3, latitude: 46.6, zoom: 6, maxZoom: 24, minZoom: 0, pitch: 0, bearing: 0 };

const AFFILIATION_COLORS: Record<string, [number, number, number]> = {
  friendly: [64, 128, 255],
  hostile: [255, 64, 64],
  neutral: [128, 224, 128],
  unknown: [255, 255, 128],
  suspect: [255, 176, 96],
};

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Aircraft — thin silhouette, small
const ICON_AIRCRAFT_CIVIL = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="translate(16,16)"><path d="M0,-10 L1.5,-3 L10,-1 L10,0.5 L1.5,4 L1,8 L3.5,9.5 L3.5,10.5 L0,9.5 L-3.5,10.5 L-3.5,9.5 L-1,8 L-1.5,4 L-10,0.5 L-10,-1 L-1.5,-3 Z" fill="#e0e0e0" stroke="#999" stroke-width="0.5"/></g></svg>`);
const ICON_AIRCRAFT_MILITARY = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="translate(16,16)"><path d="M0,-11 L2,-3 L11,-1 L11,1 L2,4.5 L1.5,9 L4,10 L4,11 L0,10 L-4,11 L-4,10 L-1.5,9 L-2,4.5 L-11,1 L-11,-1 L-2,-3 Z" fill="#5a8a44" stroke="#3a5a2a" stroke-width="0.7"/></g></svg>`);
const ICON_AIRCRAFT_HOSTILE = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="translate(16,16)"><path d="M0,-11 L2,-3 L11,-1 L11,1 L2,4.5 L1.5,9 L4,10 L4,11 L0,10 L-4,11 L-4,10 L-1.5,9 L-2,4.5 L-11,1 L-11,-1 L-2,-3 Z" fill="#ff3333" stroke="#aa0000" stroke-width="0.7"/></g></svg>`);
const ICON_AIRCRAFT_GROUND = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="translate(16,16)"><path d="M0,-7 L1,-2 L7,-0.5 L7,0.5 L1,3 L0.5,6 L2.5,7 L2.5,7.5 L0,7 L-2.5,7.5 L-2.5,7 L-0.5,6 L-1,3 L-7,0.5 L-7,-0.5 L-1,-2 Z" fill="#666" stroke="#444" stroke-width="0.5" opacity="0.5"/></g></svg>`);

// Vessel — emoji-based for clarity
const ICON_VESSEL_CIVIL = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><text x="20" y="28" text-anchor="middle" font-size="26">🚢</text></svg>`);
const ICON_VESSEL_MILITARY = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><text x="20" y="28" text-anchor="middle" font-size="26">⚓</text></svg>`);
const ICON_VESSEL_HOSTILE = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#ff000030" stroke="#ff0000" stroke-width="1.5"/><text x="20" y="28" text-anchor="middle" font-size="24">🚢</text></svg>`);

// Conflicts
const ICON_EXPLOSION = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="translate(24,24)"><polygon points="0,-16 4,-6 14,-10 8,-2 18,2 8,6 12,16 2,10 0,18 -2,10 -12,16 -8,6 -18,2 -8,-2 -14,-10 -4,-6" fill="#ff3300" stroke="#ff6600" stroke-width="1"/><circle cx="0" cy="0" r="5" fill="#ffcc00" opacity="0.9"/></g></svg>`);
const ICON_GUNFIRE = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="translate(24,24)"><circle cx="0" cy="0" r="6" fill="#ff4400" opacity="0.7"/><line x1="0" y1="-14" x2="0" y2="-6" stroke="#ffaa00" stroke-width="2" stroke-linecap="round"/><line x1="10" y1="-10" x2="5" y2="-5" stroke="#ffaa00" stroke-width="2" stroke-linecap="round"/><line x1="14" y1="0" x2="6" y2="0" stroke="#ffaa00" stroke-width="2" stroke-linecap="round"/><line x1="-14" y1="0" x2="-6" y2="0" stroke="#ffaa00" stroke-width="2" stroke-linecap="round"/><line x1="-10" y1="-10" x2="-5" y2="-5" stroke="#ffaa00" stroke-width="2" stroke-linecap="round"/></g></svg>`);
const ICON_PROTEST = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="translate(24,24)"><circle cx="0" cy="0" r="12" fill="#ffdd00" opacity="0.8" stroke="#cc9900" stroke-width="1"/><text x="0" y="6" text-anchor="middle" font-size="18" fill="#333" font-weight="bold">✊</text></g></svg>`);
const ICON_RIOT = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="translate(24,24)"><circle cx="0" cy="0" r="12" fill="#ff8800" opacity="0.8" stroke="#aa5500" stroke-width="1.5"/><path d="M-6,-6 L6,6 M6,-6 L-6,6" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g></svg>`);
const ICON_VIOLENCE = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="translate(24,24)"><circle cx="0" cy="0" r="12" fill="#cc0000" opacity="0.7" stroke="#880000" stroke-width="1"/><path d="M0,-8 L2,-2 L8,0 L2,2 L0,8 L-2,2 L-8,0 L-2,-2 Z" fill="#fff" opacity="0.9"/></g></svg>`);
const ICON_STRATEGIC = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="translate(24,24)"><rect x="-10" y="-10" width="20" height="20" rx="2" fill="#6644aa" opacity="0.8" stroke="#442288" stroke-width="1"/><circle cx="0" cy="0" r="4" fill="none" stroke="#fff" stroke-width="1.5"/><line x1="0" y1="-8" x2="0" y2="-4" stroke="#fff" stroke-width="1"/><line x1="0" y1="4" x2="0" y2="8" stroke="#fff" stroke-width="1"/><line x1="-8" y1="0" x2="-4" y2="0" stroke="#fff" stroke-width="1"/><line x1="4" y1="0" x2="8" y2="0" stroke="#fff" stroke-width="1"/></g></svg>`);

// Fires & disasters
const ICON_FIRE = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="translate(24,24)"><path d="M0,-16 C4,-10 10,-8 8,-2 C12,-6 14,0 10,6 C14,2 16,8 8,14 C4,16 -4,16 -8,14 C-16,8 -14,2 -10,6 C-14,0 -12,-6 -8,-2 C-10,-8 -4,-10 0,-16Z" fill="#ff6600" stroke="#ff3300" stroke-width="0.5"/><path d="M0,-8 C2,-4 6,-2 4,4 C2,0 -2,0 -4,4 C-6,-2 -2,-4 0,-8Z" fill="#ffcc00" opacity="0.9"/></g></svg>`);
const ICON_WAVE = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="translate(24,24)"><path d="M-16,0 C-12,-6 -8,-6 -4,0 C0,6 4,6 8,0 C12,-6 16,-6 18,0" fill="none" stroke="#0088ff" stroke-width="3" stroke-linecap="round"/><path d="M-16,8 C-12,2 -8,2 -4,8 C0,14 4,14 8,8 C12,2 16,2 18,8" fill="none" stroke="#0066cc" stroke-width="2.5" stroke-linecap="round"/></g></svg>`);
const ICON_EARTHQUAKE = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="translate(24,24)"><path d="M-14,0 L-8,-10 L-4,4 L0,-14 L4,6 L8,-8 L14,0" fill="none" stroke="#ff4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="0" cy="0" r="14" fill="none" stroke="#ff4444" stroke-width="1" opacity="0.4"/></g></svg>`);
const ICON_CYCLONE = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="translate(24,24)"><path d="M0,-14 A14,14 0 0,1 14,0" fill="none" stroke="#00ccff" stroke-width="3" stroke-linecap="round"/><path d="M14,0 A14,14 0 0,1 0,14" fill="none" stroke="#0099cc" stroke-width="2.5" stroke-linecap="round"/><path d="M0,14 A14,14 0 0,1 -14,0" fill="none" stroke="#0077aa" stroke-width="2" stroke-linecap="round"/><path d="M-14,0 A14,14 0 0,1 0,-14" fill="none" stroke="#005588" stroke-width="1.5" stroke-linecap="round"/><circle cx="0" cy="0" r="3" fill="#00ddff"/></g></svg>`);
const ICON_VOLCANO = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="translate(24,24)"><polygon points="0,-10 -12,12 12,12" fill="#8B4513" stroke="#654321" stroke-width="1.5"/><polygon points="0,-10 -4,-4 4,-4" fill="#ff4400"/><circle cx="-2" cy="-14" r="2" fill="#ff6600" opacity="0.8"/><circle cx="3" cy="-16" r="1.5" fill="#ffaa00" opacity="0.7"/></g></svg>`);

// Cyber threats by type
const ICON_CYBER_MALWARE = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="translate(16,16)"><circle cx="0" cy="0" r="10" fill="#7722cc" opacity="0.8" stroke="#5500aa" stroke-width="1"/><text x="0" y="5" text-anchor="middle" font-size="13" fill="#fff">🦠</text></g></svg>`);
const ICON_CYBER_BOTNET = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="translate(16,16)"><circle cx="0" cy="0" r="10" fill="#8833dd" opacity="0.8" stroke="#6611bb" stroke-width="1"/><text x="0" y="5" text-anchor="middle" font-size="13" fill="#fff">🤖</text></g></svg>`);
const ICON_CYBER_PHISHING = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="translate(16,16)"><circle cx="0" cy="0" r="10" fill="#9944ee" opacity="0.8" stroke="#7722cc" stroke-width="1"/><text x="0" y="5" text-anchor="middle" font-size="13" fill="#fff">🎣</text></g></svg>`);
const ICON_CYBER_C2 = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="translate(16,16)"><circle cx="0" cy="0" r="10" fill="#6600aa" opacity="0.8" stroke="#440088" stroke-width="1"/><text x="0" y="5" text-anchor="middle" font-size="13" fill="#fff">💀</text></g></svg>`);
const ICON_CYBER_RANSOM = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="translate(16,16)"><circle cx="0" cy="0" r="10" fill="#aa0055" opacity="0.8" stroke="#880044" stroke-width="1"/><text x="0" y="5" text-anchor="middle" font-size="13" fill="#fff">🔒</text></g></svg>`);
const ICON_CYBER_SCANNER = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="translate(16,16)"><circle cx="0" cy="0" r="10" fill="#5533aa" opacity="0.8" stroke="#3311aa" stroke-width="1"/><text x="0" y="5" text-anchor="middle" font-size="13" fill="#fff">🔍</text></g></svg>`);
const ICON_CYBER_EXPLOIT = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="translate(16,16)"><circle cx="0" cy="0" r="10" fill="#cc2266" opacity="0.8" stroke="#aa0044" stroke-width="1"/><text x="0" y="5" text-anchor="middle" font-size="13" fill="#fff">⚡</text></g></svg>`);

// Military bases by type
const ICON_BASE_AIR = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect x="2" y="2" width="36" height="36" rx="4" fill="#cc2222" opacity="0.85" stroke="#880000" stroke-width="1.5"/><text x="20" y="29" text-anchor="middle" font-size="24">✈️</text></svg>`);
const ICON_BASE_NAVAL = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect x="2" y="2" width="36" height="36" rx="4" fill="#224488" opacity="0.85" stroke="#112244" stroke-width="1.5"/><text x="20" y="29" text-anchor="middle" font-size="24">🚢</text></svg>`);
const ICON_BASE_ARMY = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect x="2" y="2" width="36" height="36" rx="4" fill="#556b2f" opacity="0.85" stroke="#333" stroke-width="1.5"/><text x="20" y="29" text-anchor="middle" font-size="24">🎖️</text></svg>`);
const ICON_BASE_JOINT = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect x="2" y="2" width="36" height="36" rx="4" fill="#884422" opacity="0.85" stroke="#553311" stroke-width="1.5"/><text x="20" y="28" text-anchor="middle" font-size="16" font-family="monospace" fill="#fff" font-weight="bold">QG</text></svg>`);

// Nuclear
const ICON_NUCLEAR = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#eab308" opacity="0.2" stroke="#eab308" stroke-width="1.5"/><text x="20" y="29" text-anchor="middle" font-size="26">☢️</text></svg>`);

// Satellite
const ICON_SATELLITE = svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><text x="18" y="26" text-anchor="middle" font-size="24">🛰️</text></svg>`);

// Cable company color map
const CABLE_COMPANY_COLORS: Record<string, [number, number, number, number]> = {};
let cableColorIdx = 0;
const CABLE_PALETTE: [number, number, number][] = [
  [14, 165, 233], [236, 72, 153], [34, 197, 94], [245, 158, 11], [168, 85, 247],
  [239, 68, 68], [6, 182, 212], [132, 204, 22], [251, 146, 60], [99, 102, 241],
  [244, 114, 182], [20, 184, 166], [234, 179, 8], [59, 130, 246], [192, 132, 252],
];
function getCableColor(owners: string[]): [number, number, number, number] {
  const key = owners.slice(0, 2).sort().join("|") || "unknown";
  if (!CABLE_COMPANY_COLORS[key]) {
    const c = CABLE_PALETTE[cableColorIdx % CABLE_PALETTE.length];
    CABLE_COMPANY_COLORS[key] = [c[0], c[1], c[2], 160];
    cableColorIdx++;
  }
  return CABLE_COMPANY_COLORS[key];
}

function isMilitaryCallsign(callsign: string | null): boolean {
  if (!callsign) return false;
  const cs = callsign.toUpperCase();
  const MIL_PREFIXES = [
    "CTM", "FAF", "FNY", "GAM", "COTAM", "RFR", "FAB", "RRR", "RAF",
    "MMF", "IAM", "GAF", "SAM", "BAF", "HAF", "PAF", "DAF", "NAF",
    "RSD", "SHF", "CNV", "RCH", "DUKE", "REACH", "EVAC", "JAKE",
    "TOPCAT", "LION", "VIPER", "SWORD", "HAWK", "COBRA", "WOLF",
  ];
  return MIL_PREFIXES.some(p => cs.startsWith(p));
}

function getEntityIcon(entity: Entity): string {
  if (entity.type === "aircraft") {
    const ac = entity as Aircraft;
    if (ac.metadata.onGround) return ICON_AIRCRAFT_GROUND;
    if (ac.metadata.squawk === "7700" || ac.metadata.squawk === "7600" || ac.metadata.squawk === "7500") return ICON_AIRCRAFT_HOSTILE;
    if (isMilitaryCallsign(ac.metadata.callsign)) return ICON_AIRCRAFT_MILITARY;
    const aff = getAircraftAffiliation(ac.metadata.originCountry, ac.metadata.squawk);
    if (aff === "hostile" || aff === "suspect") return ICON_AIRCRAFT_HOSTILE;
    return ICON_AIRCRAFT_CIVIL;
  }
  const v = entity as Vessel;
  const aff = getVesselAffiliation(v.metadata.flag, v.metadata.shipType);
  if (aff === "hostile" || aff === "suspect") return ICON_VESSEL_HOSTILE;
  const st = (v.metadata.shipType || "").toLowerCase();
  if (st.includes("military") || st.includes("navy") || st.includes("war") || st.includes("patrol") || st.includes("coast guard")) return ICON_VESSEL_MILITARY;
  return ICON_VESSEL_CIVIL;
}

function getConflictIcon(eventType: string): string {
  if (eventType === "explosions") return ICON_EXPLOSION;
  if (eventType === "battles") return ICON_GUNFIRE;
  if (eventType === "protests") return ICON_PROTEST;
  if (eventType === "riots") return ICON_RIOT;
  if (eventType === "violence_against_civilians") return ICON_VIOLENCE;
  if (eventType === "strategic_developments") return ICON_STRATEGIC;
  return ICON_EXPLOSION;
}

function getDisasterIcon(eventType: string): string {
  if (eventType === "earthquake") return ICON_EARTHQUAKE;
  if (eventType === "flood" || eventType === "tsunami") return ICON_WAVE;
  if (eventType === "cyclone") return ICON_CYCLONE;
  if (eventType === "volcano") return ICON_VOLCANO;
  if (eventType === "wildfire") return ICON_FIRE;
  return ICON_WAVE;
}

function getCyberIcon(cat: string): string {
  if (cat === "malware") return ICON_CYBER_MALWARE;
  if (cat === "botnet") return ICON_CYBER_BOTNET;
  if (cat === "phishing") return ICON_CYBER_PHISHING;
  if (cat === "c2") return ICON_CYBER_C2;
  if (cat === "ransomware") return ICON_CYBER_RANSOM;
  if (cat === "scanner") return ICON_CYBER_SCANNER;
  if (cat === "exploit") return ICON_CYBER_EXPLOIT;
  return ICON_CYBER_MALWARE;
}

function getBaseIcon(type: string): string {
  if (type === "air_base") return ICON_BASE_AIR;
  if (type === "naval_base") return ICON_BASE_NAVAL;
  if (type === "army_base" || type === "training") return ICON_BASE_ARMY;
  return ICON_BASE_JOINT;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [128, 128, 128];
}

function circlePolygon(lat: number, lng: number, radiusM: number, numPoints = 64): [number, number][] {
  const points: [number, number][] = [];
  const R = 6371000;
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    const dy = (radiusM / R) * Math.cos(angle);
    const dx = (radiusM / R) * Math.sin(angle) / Math.cos((lat * Math.PI) / 180);
    points.push([lat + (dy * 180) / Math.PI, lng + (dx * 180) / Math.PI]);
  }
  return points;
}

export interface DeckGLMapProps {
  entities: Entity[];
  infrastructure: Infrastructure[];
  zones: ZoneOfInterest[];
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
  conflictEvents?: ConflictEvent[];
  fireHotspots?: FireHotspot[];
  naturalDisasters?: NaturalDisaster[];
  cyberThreats?: CyberThreat[];
  internetOutages?: InternetOutage[];
  submarineCables?: SubmarineCable[];
  pipelines?: Pipeline[];
  militaryBases?: MilitaryBase[];
  nuclearFacilities?: NuclearFacility[];
  onMissionWaypointAdd?: (latlng: { lat: number; lng: number }) => void;
  onZoneDrawn?: (polygon: [number, number][]) => void;
  onBoundsChange?: (bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number }) => void;
  onSelectMapItem?: (item: MapItem) => void;
  sigintTraces?: SIGINTTrace[];
  userLocation?: { lat: number; lng: number } | null;
  geoRadius?: number;
  flyToTrigger?: { lat: number; lng: number; zoom: number; ts: number } | null;
}

export default function DeckGLMap({
  entities,
  infrastructure,
  zones,
  selectedEntityId,
  onSelectEntity,
  showTrails,
  showInfrastructure,
  drawMode = false,
  measureMode = false,
  operationalMarkers = [],
  placeMarkerMode = false,
  missionPlanMode = false,
  missionRoutes = [],
  activeMissionWaypoints = [],
  entityLinks = [],
  satellites = [],
  cellTowers = [],
  showSatellites = false,
  showCellTowers = false,
  conflictEvents = [],
  fireHotspots = [],
  naturalDisasters = [],
  cyberThreats = [],
  internetOutages = [],
  submarineCables = [],
  pipelines = [],
  militaryBases = [],
  nuclearFacilities = [],
  showSatellite = false,
  showSentinel = false,
  gibsDate,
  gibsProduct,
  onMapClick,
  onMissionWaypointAdd,
  onZoneDrawn,
  onBoundsChange,
  onSelectMapItem,
  sigintTraces = [],
  userLocation,
  geoRadius = 20,
  flyToTrigger,
}: DeckGLMapProps) {
  const [ivs, setIvs] = useState(INITIAL_VIEW);
  const vsRef = useRef(INITIAL_VIEW);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; object?: unknown } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);
  const [animPhase, setAnimPhase] = useState(0);

  useEffect(() => {
    let frame: number;
    const tick = () => {
      setAnimPhase(Date.now() % 3000 / 3000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (flyToTrigger) {
      setIvs(prev => ({ ...prev, longitude: flyToTrigger.lng, latitude: flyToTrigger.lat, zoom: flyToTrigger.zoom }));
    }
  }, [flyToTrigger]);

  const onViewStateChange = useCallback(
    (params: { viewState: Record<string, unknown> }) => {
      const vs = params.viewState;
      const lon = vs.longitude as number;
      const lat = vs.latitude as number;
      const zoom = vs.zoom as number;
      if (typeof lon === "number" && typeof lat === "number" && typeof zoom === "number") {
        vsRef.current = { longitude: lon, latitude: lat, zoom, maxZoom: 24, minZoom: 0, pitch: (vs.pitch as number) ?? 0, bearing: (vs.bearing as number) ?? 0 };
        const latDelta = 180 / Math.pow(2, zoom);
        const lonDelta = (360 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
        onBoundsChange?.({
          latMin: lat - latDelta / 2,
          latMax: lat + latDelta / 2,
          lonMin: lon - lonDelta / 2,
          lonMax: lon + lonDelta / 2,
        });
      }
    },
    [onBoundsChange]
  );

  useEffect(() => {
    if (!drawMode) setDrawPoints([]);
  }, [drawMode]);

  useEffect(() => {
    if (!measureMode) setMeasurePoints([]);
  }, [measureMode]);

  const unprojectClick = useCallback(
    (e: React.MouseEvent): { lat: number; lng: number } | null => {
      const container = containerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cur = vsRef.current;
      const vp = new WebMercatorViewport({
        width: rect.width,
        height: rect.height,
        longitude: cur.longitude,
        latitude: cur.latitude,
        zoom: cur.zoom,
      });
      const [lng, lat] = vp.unproject([x, y]);
      return { lat, lng };
    },
    []
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      const pt = unprojectClick(e);
      if (!pt) return;
      if (placeMarkerMode) {
        onMapClick?.(pt);
      } else if (missionPlanMode) {
        onMissionWaypointAdd?.(pt);
      } else if (drawMode) {
        setDrawPoints((prev) => {
          const next = [...prev, [pt.lat, pt.lng] as [number, number]];
          return next;
        });
      } else if (measureMode) {
        setMeasurePoints((prev) => {
          if (prev.length >= 2) return [[pt.lat, pt.lng]];
          return [...prev, [pt.lat, pt.lng] as [number, number]];
        });
      }
    },
    [unprojectClick, placeMarkerMode, missionPlanMode, drawMode, measureMode, onMapClick, onMissionWaypointAdd]
  );

  const handleOverlayDblClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (drawMode && drawPoints.length >= 3) {
        onZoneDrawn?.(drawPoints);
        setDrawPoints([]);
      }
    },
    [drawMode, drawPoints, onZoneDrawn]
  );

  const entityLayerData = useMemo(() => {
    return entities
      .filter((e) => e.position)
      .map((e) => {
        const isSelected = e.id === selectedEntityId;
        let affiliation: string;
        if (e.type === "aircraft") {
          affiliation = getAircraftAffiliation(
            (e as Aircraft).metadata.originCountry,
            (e as Aircraft).metadata.squawk
          );
        } else {
          affiliation = getVesselAffiliation(
            (e as Vessel).metadata.flag,
            (e as Vessel).metadata.shipType
          );
        }
        const color = AFFILIATION_COLORS[affiliation] ?? [128, 128, 128];
        const size = isSelected ? 32
          : e.type === "aircraft" && (e as Aircraft).metadata.onGround ? 14
          : e.type === "aircraft" ? 22
          : 30;
        const angle = e.type === "aircraft"
          ? -((e as Aircraft).metadata.trueTrack ?? 0)
          : e.type === "vessel"
            ? -((e as Vessel).metadata.heading ?? (e as Vessel).metadata.course ?? 0)
            : 0;
        return {
          id: e.id,
          position: [e.position!.lng, e.position!.lat],
          color: [...color, 255],
          size,
          angle,
          icon: getEntityIcon(e),
          entity: e,
        };
      });
  }, [entities, selectedEntityId]);

  const trailLayerData = useMemo(() => {
    if (!showTrails) return [];
    return entities
      .filter((e) => e.position && e.trail.length > 1 && (e.tracked || e.id === selectedEntityId))
      .map((e) => {
        const affiliation =
          e.type === "aircraft"
            ? getAircraftAffiliation((e as Aircraft).metadata.originCountry, (e as Aircraft).metadata.squawk)
            : getVesselAffiliation((e as Vessel).metadata.flag, (e as Vessel).metadata.shipType);
        const color = affiliation === "hostile" ? [255, 64, 64] : affiliation === "friendly" ? [64, 128, 255] : [128, 224, 128];
        return {
          path: e.trail.map((p) => [p.lng, p.lat]),
          color: [...color, (e.tracked || e.id === selectedEntityId) ? 180 : 90],
        };
      });
  }, [entities, selectedEntityId, showTrails]);

  const zoneLayerData = useMemo(() => {
    return zones
      .filter((z) => z.active && z.polygon.length >= 3)
      .map((z) => ({
        polygon: z.polygon.map(([lat, lng]) => [lng, lat] as [number, number]),
        color: hexToRgb(z.color),
      }));
  }, [zones]);

  const opsLayerData = useMemo(() => {
    return operationalMarkers.map((m) => {
      const color =
        m.affiliation === "hostile" || m.affiliation === "suspect"
          ? [255, 64, 64]
          : m.affiliation === "friendly"
            ? [64, 128, 255]
            : [128, 128, 128];
      return {
        position: [m.position.lng, m.position.lat],
        color: [...color, 255],
        radius: 10,
        label: m.label,
        marker: m,
      };
    });
  }, [operationalMarkers]);

  const opsRangeData = useMemo(() => {
    const polys: { polygon: [number, number][]; color: [number, number, number] }[] = [];
    operationalMarkers.forEach((m) => {
      if (!m.weaponRange) return;
      const color =
        m.affiliation === "hostile" || m.affiliation === "suspect"
          ? [255, 64, 64]
          : [64, 128, 255];
      const poly = circlePolygon(m.position.lat, m.position.lng, m.weaponRange * 1000);
      polys.push({
        polygon: poly.map(([lat, lng]) => [lng, lat] as [number, number]),
        color: color as [number, number, number],
      });
    });
    return polys;
  }, [operationalMarkers]);

  const linkLayerData = useMemo(() => {
    return entityLinks
      .map((link) => {
        const source = entities.find((e) => e.id === link.sourceId);
        const target = entities.find((e) => e.id === link.targetId);
        if (!source?.position || !target?.position) return null;
        const color =
          link.type === "escort"
            ? [64, 128, 255]
            : link.type === "threat" || link.type === "surveillance"
              ? [255, 64, 64]
              : [128, 128, 128];
        return { path: [source.position, target.position].map((p) => [p.lng, p.lat]), color: [...color, 153] };
      })
      .filter(Boolean) as { path: [number, number][]; color: [number, number, number] }[];
  }, [entityLinks, entities]);

  const missionLayerData = useMemo(() => {
    const routes = [...missionRoutes];
    if (activeMissionWaypoints.length > 0) {
      routes.push({
        id: "__active__",
        name: "En cours",
        waypoints: activeMissionWaypoints,
        color: "#00ffaa",
        createdBy: "operator",
        createdAt: new Date(),
      });
    }
    return routes.flatMap((r) => {
      if (r.waypoints.length < 2) return [];
      return [
        {
          path: r.waypoints.map((wp) => [wp.position.lng, wp.position.lat]),
          color: hexToRgb(r.color),
        },
      ];
    });
  }, [missionRoutes, activeMissionWaypoints]);

  const missionWaypointsData = useMemo(() => {
    const routes = [...missionRoutes];
    if (activeMissionWaypoints.length > 0) {
      routes.push({
        id: "__active__",
        waypoints: activeMissionWaypoints,
        color: "#00ffaa",
      } as MissionRoute & { waypoints: typeof activeMissionWaypoints });
    }
    const wpColors: Record<string, [number, number, number]> = {
      start: [0, 255, 0],
      waypoint: [255, 255, 255],
      objective: [255, 64, 64],
      rally: [245, 158, 11],
      extraction: [139, 92, 246],
    };
    return routes.flatMap((r) =>
      r.waypoints.map((wp, i) => ({
        position: [wp.position.lng, wp.position.lat] as [number, number],
        color: [...(wpColors[wp.type] ?? [255, 255, 255]), 200],
        radius: wp.type === "objective" ? 6 : 4,
        label: wp.label || `WP-${i + 1}`,
      }))
    );
  }, [missionRoutes, activeMissionWaypoints]);

  const satLayerData = useMemo(() => {
    if (!showSatellites) return [];
    const colors: Record<string, [number, number, number]> = {
      gps: [245, 158, 11],
      galileo: [59, 130, 246],
      starlink: [168, 85, 247],
      "french-mil": [37, 99, 235],
    };
    return satellites.map((s) => ({
      position: [s.lng, s.lat],
      color: [...(colors[s.group] ?? [245, 158, 11]), 200],
      radius: s.group === "starlink" ? 2 : 3,
    }));
  }, [satellites, showSatellites]);

  const cellLayerData = useMemo(() => {
    if (!showCellTowers) return [];
    const colors: Record<string, [number, number, number]> = {
      LTE: [239, 68, 68],
      UMTS: [245, 158, 11],
      GSM: [16, 185, 129],
      "5G": [59, 130, 246],
    };
    return cellTowers.map((t) => ({
      position: [t.lng, t.lat],
      color: [...(colors[t.radio] ?? [139, 92, 246]), 200],
      radius: 4,
      tower: t,
    }));
  }, [cellTowers, showCellTowers]);

  const cellRangeData = useMemo(() => {
    if (!showCellTowers) return [];
    return cellTowers.map((t) => {
      const color = t.radio === "LTE" ? [239, 68, 68] : t.radio === "5G" ? [59, 130, 246] : [139, 92, 246];
      const poly = circlePolygon(t.lat, t.lng, t.range, 32);
      return { polygon: poly.map(([lat, lng]) => [lng, lat]), color };
    });
  }, [cellTowers, showCellTowers]);

  const infraLayerData = useMemo(() => {
    if (!showInfrastructure) return [];
    return infrastructure
      .filter((i) => i.position)
      .map((i) => {
        const cfg = INFRA_ICONS[i.metadata.category] ?? { color: "#666" };
        const color = hexToRgb(cfg.color);
        return {
          position: [i.position!.lng, i.position!.lat],
          color: [...color, 255],
          radius: i.metadata.importance === "critical" ? 6 : 4,
          infra: i,
        };
      });
  }, [infrastructure, showInfrastructure]);

  const predictionLayerData = useMemo(() => {
    return entities
      .filter((e) => e.position && (e.tracked || e.id === selectedEntityId))
      .flatMap((e) => {
        const pred = predictTrajectory(e, 15, 8);
        if (pred.length < 2) return [];
        return [
          {
            path: [
              [e.position!.lng, e.position!.lat],
              ...pred.map((p) => [p.lng, p.lat] as [number, number]),
            ],
            color: e.type === "aircraft" ? [255, 255, 255, 128] : [0, 255, 170, 128],
          },
        ];
      });
  }, [entities, selectedEntityId]);

  const layers = useMemo(() => {
    const l: Layer[] = [];

    if (showSatellite) {
      l.push(
        new TileLayer({
          id: "esri-satellite",
          data: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          minZoom: 0,
          maxZoom: 19,
          tileSize: 256,
          opacity: 0.9,
          onTileError: () => {},
          renderSubLayers: (props) => {
            if (!props.data) return null;
            const { boundingBox } = props.tile;
            return new BitmapLayer(props as unknown as Record<string, unknown>, {
              data: undefined,
              image: props.data,
              bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
            });
          },
        }) as unknown as Layer,
      );
    }

    if (showSentinel && gibsDate && gibsProduct) {
      const gibsUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${gibsProduct}/default/${gibsDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
      l.push(
        new TileLayer({
          id: "nasa-gibs",
          data: gibsUrl,
          minZoom: 0,
          maxZoom: 9,
          tileSize: 256,
          opacity: 0.8,
          onTileError: () => {},
          renderSubLayers: (props) => {
            if (!props.data) return null;
            const { boundingBox } = props.tile;
            return new BitmapLayer(props as unknown as Record<string, unknown>, {
              data: undefined,
              image: props.data,
              bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
            });
          },
        }) as unknown as Layer,
      );
    }

    if (zoneLayerData.length > 0) {
      l.push(
        new SolidPolygonLayer({
          id: "zones",
          data: zoneLayerData,
          getPolygon: (d) => d.polygon,
          getFillColor: (d) => [...d.color, 25] as [number, number, number, number],
          getLineColor: (d) => d.color,
          lineWidthMinPixels: 2,
          pickable: false,
        })
      );
    }

    if (opsRangeData.length > 0) {
      l.push(
        new SolidPolygonLayer({
          id: "ops-ranges",
          data: opsRangeData,
          getPolygon: (d) => d.polygon,
          getFillColor: (d) => [...d.color, 40] as [number, number, number, number],
          getLineColor: (d) => [...d.color, 100] as [number, number, number, number],
          lineWidthMinPixels: 1,
          pickable: false,
        })
      );
    }

    if (cellRangeData.length > 0) {
      l.push(
        new SolidPolygonLayer({
          id: "cell-ranges",
          data: cellRangeData,
          getPolygon: (d) => d.polygon,
          getFillColor: (d) => [...d.color, 20] as [number, number, number, number],
          getLineColor: (d) => [...d.color, 80] as [number, number, number, number],
          lineWidthMinPixels: 1,
          pickable: false,
        })
      );
    }

    if (trailLayerData.length > 0) {
      l.push(
        new PathLayer({
          id: "trails",
          data: trailLayerData,
          getPath: (d) => d.path,
          getColor: (d) => d.color,
          getWidth: 2,
          widthMinPixels: 1.5,
          pickable: false,
        })
      );
    }

    if (linkLayerData.length > 0) {
      l.push(
        new PathLayer({
          id: "entity-links",
          data: linkLayerData,
          getPath: (d) => d.path,
          getColor: (d) => d.color,
          getWidth: 2,
          widthMinPixels: 1,
          pickable: false,
        })
      );
    }

    if (missionLayerData.length > 0) {
      l.push(
        new PathLayer({
          id: "mission-routes",
          data: missionLayerData,
          getPath: (d) => d.path,
          getColor: (d) => d.color,
          getWidth: 2.5,
          widthMinPixels: 2,
          pickable: false,
        })
      );
    }

    if (missionWaypointsData.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "mission-waypoints",
          data: missionWaypointsData,
          getPosition: (d) => d.position,
          getRadius: (d) => d.radius * 100,
          getFillColor: (d) => d.color,
          radiusMinPixels: 4,
          radiusMaxPixels: 12,
          pickable: false,
        })
      );
    }

    if (predictionLayerData.length > 0) {
      l.push(
        new PathLayer({
          id: "predictions",
          data: predictionLayerData,
          getPath: (d) => d.path,
          getColor: (d) => d.color,
          getWidth: 1.5,
          widthMinPixels: 1,
          pickable: false,
        })
      );
    }

    if (entityLayerData.length > 0) {
      l.push(
        new IconLayer({
          id: "entities",
          data: entityLayerData,
          getPosition: (d) => d.position,
          getIcon: (d) => {
            const e = d.entity as Entity;
            const w = e.type === "vessel" ? 40 : 32;
            return { url: d.icon, width: w, height: w, anchorY: w / 2 };
          },
          getSize: (d) => d.size,
          getAngle: (d) => d.angle,
          sizeScale: 1,
          sizeMinPixels: 10,
          sizeMaxPixels: 34,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 80],
          onClick: (info) => {
            if (!info.object) return;
            const obj = info.object as { entity?: Entity };
            if (obj?.entity) onSelectEntity(obj.entity);
          },
          onHover: (info) => setHoverInfo(info.picked ? { x: info.x!, y: info.y!, object: info.object } : null),
        }) as unknown as Layer
      );
    }

    if (opsLayerData.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "ops-markers",
          data: opsLayerData,
          getPosition: (d) => d.position,
          getRadius: (d) => d.radius * 100,
          getFillColor: (d) => d.color,
          radiusMinPixels: 6,
          radiusMaxPixels: 20,
          pickable: true,
          onHover: (info) => setHoverInfo(info.picked ? { x: info.x!, y: info.y!, object: info.object } : null),
        })
      );
    }

    if (infraLayerData.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "infrastructure",
          data: infraLayerData,
          getPosition: (d) => d.position,
          getRadius: (d) => d.radius * 100,
          getFillColor: (d) => d.color,
          radiusMinPixels: 4,
          radiusMaxPixels: 14,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 60],
          onClick: (info) => {
            if (!info.object) return;
            const obj = info.object as { infra?: Infrastructure };
            if (obj?.infra) onSelectEntity(obj.infra);
          },
          onHover: (info) => setHoverInfo(info.picked ? { x: info.x!, y: info.y!, object: info.object } : null),
        })
      );
    }

    if (satLayerData.length > 0) {
      l.push(
        new IconLayer({
          id: "satellites",
          data: satLayerData,
          getPosition: (d) => d.position,
          getIcon: () => ({ url: ICON_SATELLITE, width: 36, height: 36, anchorY: 18 }),
          getSize: 24,
          sizeMinPixels: 12,
          sizeMaxPixels: 28,
          pickable: true,
        }) as unknown as Layer
      );
    }

    if (cellLayerData.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "cell-towers",
          data: cellLayerData,
          getPosition: (d) => d.position,
          getRadius: (d) => d.radius * 100,
          getFillColor: (d) => d.color,
          radiusMinPixels: 4,
          radiusMaxPixels: 8,
          pickable: true,
          onClick: (info) => {
            if (!info.object) return;
            const obj = info.object as { tower?: CellTower };
            if (obj?.tower) onSelectMapItem?.({ type: "tower", data: obj.tower });
          },
          onHover: (info) => setHoverInfo(info.picked ? { x: info.x!, y: info.y!, object: info.object } : null),
        })
      );
    }

    // Phase 3 — World Monitor layers (animated)
    const pulse = 0.6 + 0.4 * Math.sin(animPhase * Math.PI * 2);
    const pulseInv = 1.4 - 0.4 * Math.sin(animPhase * Math.PI * 2);

    if (conflictEvents.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "conflicts-glow",
          data: conflictEvents,
          getPosition: (d: ConflictEvent) => [d.lng, d.lat] as [number, number],
          getRadius: (d: ConflictEvent) => Math.max(5, Math.min(d.fatalities * 3, 40)) * 300 * pulseInv,
          getFillColor: (d: ConflictEvent) => {
            const a = Math.round(60 * pulse);
            if (d.eventType === "battles" || d.eventType === "explosions") return [255, 40, 0, a] as [number, number, number, number];
            return [255, 160, 0, a] as [number, number, number, number];
          },
          radiusMinPixels: 8,
          radiusMaxPixels: 35,
          pickable: false,
          updateTriggers: { getRadius: [animPhase], getFillColor: [animPhase] },
        })
      );
      l.push(
        new IconLayer({
          id: "conflicts",
          data: conflictEvents,
          getPosition: (d: ConflictEvent) => [d.lng, d.lat] as [number, number],
          getIcon: (d: ConflictEvent) => ({ url: getConflictIcon(d.eventType), width: 48, height: 48, anchorY: 24 }),
          getSize: (d: ConflictEvent) => Math.max(32, Math.min(d.fatalities * 3 + 32, 64)),
          sizeScale: 1,
          sizeMinPixels: 28,
          sizeMaxPixels: 64,
          pickable: true,
          onClick: (info) => {
            if (info.object) onSelectMapItem?.({ type: "conflict", data: info.object as ConflictEvent });
          },
          onHover: (info) =>
            setHoverInfo(
              info.picked ? { x: info.x!, y: info.y!, object: { conflict: info.object } } : null
            ),
        }) as unknown as Layer
      );
    }

    if (fireHotspots.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "fires-glow",
          data: fireHotspots,
          getPosition: (d: FireHotspot) => [d.lng, d.lat] as [number, number],
          getRadius: (d: FireHotspot) => d.frp * 80 * pulseInv,
          getFillColor: [255, 80, 0, Math.round(50 * pulse)] as [number, number, number, number],
          radiusMinPixels: 6,
          radiusMaxPixels: 20,
          pickable: false,
          updateTriggers: { getRadius: [animPhase], getFillColor: [animPhase] },
        })
      );
      l.push(
        new IconLayer({
          id: "fires",
          data: fireHotspots,
          getPosition: (d: FireHotspot) => [d.lng, d.lat] as [number, number],
          getIcon: () => ({ url: ICON_FIRE, width: 48, height: 48, anchorY: 24 }),
          getSize: (d: FireHotspot) => Math.max(28, Math.min(d.frp * 3 + 28, 56)),
          sizeMinPixels: 24,
          sizeMaxPixels: 56,
          pickable: true,
          onClick: (info) => {
            if (info.object) onSelectMapItem?.({ type: "fire", data: info.object as FireHotspot });
          },
          onHover: (info) =>
            setHoverInfo(
              info.picked ? { x: info.x!, y: info.y!, object: { fire: info.object } } : null
            ),
        }) as unknown as Layer
      );
    }

    if (naturalDisasters.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "disasters-glow",
          data: naturalDisasters,
          getPosition: (d: NaturalDisaster) => [d.lng, d.lat] as [number, number],
          getRadius: 1200 * pulseInv,
          getFillColor: (d: NaturalDisaster) => {
            const a = Math.round(50 * pulse);
            if (d.severity === "red") return [255, 0, 0, a] as [number, number, number, number];
            if (d.severity === "orange") return [255, 160, 0, a] as [number, number, number, number];
            return [0, 200, 100, a] as [number, number, number, number];
          },
          radiusMinPixels: 10,
          radiusMaxPixels: 30,
          pickable: false,
          updateTriggers: { getRadius: [animPhase], getFillColor: [animPhase] },
        })
      );
      l.push(
        new IconLayer({
          id: "disasters",
          data: naturalDisasters,
          getPosition: (d: NaturalDisaster) => [d.lng, d.lat] as [number, number],
          getIcon: (d: NaturalDisaster) => ({ url: getDisasterIcon(d.eventType), width: 48, height: 48, anchorY: 24 }),
          getSize: (d: NaturalDisaster) => d.severity === "red" ? 52 : d.severity === "orange" ? 40 : 32,
          sizeMinPixels: 28,
          sizeMaxPixels: 60,
          pickable: true,
          onClick: (info) => {
            if (info.object) onSelectMapItem?.({ type: "disaster", data: info.object as NaturalDisaster });
          },
          onHover: (info) =>
            setHoverInfo(
              info.picked ? { x: info.x!, y: info.y!, object: { disaster: info.object } } : null
            ),
        }) as unknown as Layer
      );
    }

    if (cyberThreats.length > 0) {
      const geoThreats = cyberThreats.filter((t) => t.lat != null && t.lng != null);
      if (geoThreats.length > 0) {
        l.push(
          new ScatterplotLayer({
            id: "cyber-glow",
            data: geoThreats,
            getPosition: (d: CyberThreat) => [d.lng!, d.lat!] as [number, number],
            getRadius: 600 * pulseInv,
            getFillColor: [168, 85, 247, Math.round(40 * pulse)] as [number, number, number, number],
            radiusMinPixels: 6,
            radiusMaxPixels: 16,
            pickable: false,
            updateTriggers: { getRadius: [animPhase], getFillColor: [animPhase] },
          })
        );
        l.push(
          new IconLayer({
            id: "cyber-threats",
            data: geoThreats,
            getPosition: (d: CyberThreat) => [d.lng!, d.lat!] as [number, number],
            getIcon: (d: CyberThreat) => ({ url: getCyberIcon(d.threatCategory), width: 32, height: 32, anchorY: 16 }),
            getSize: 32,
            sizeMinPixels: 22,
            sizeMaxPixels: 44,
            pickable: true,
            onClick: (info) => {
              if (info.object) onSelectMapItem?.({ type: "cyber", data: info.object as CyberThreat });
            },
            onHover: (info) =>
              setHoverInfo(
                info.picked ? { x: info.x!, y: info.y!, object: { cyber: info.object } } : null
              ),
          }) as unknown as Layer
        );
      }
    }

    if (internetOutages.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "internet-outages",
          data: internetOutages,
          getPosition: (d: InternetOutage) => [d.lng, d.lat] as [number, number],
          getRadius: 600,
          getFillColor: (d: InternetOutage) => {
            if (d.severity === "major") return [244, 63, 94, 200] as [number, number, number, number];
            if (d.severity === "moderate") return [245, 158, 11, 180] as [number, number, number, number];
            return [100, 116, 139, 140] as [number, number, number, number];
          },
          radiusMinPixels: 5,
          radiusMaxPixels: 14,
          pickable: true,
          onClick: (info) => {
            if (info.object) onSelectMapItem?.({ type: "outage", data: info.object as InternetOutage });
          },
          onHover: (info) =>
            setHoverInfo(
              info.picked ? { x: info.x!, y: info.y!, object: { outage: info.object } } : null
            ),
        })
      );
    }

    if (submarineCables.length > 0) {
      l.push(
        new PathLayer({
          id: "submarine-cables",
          data: submarineCables,
          getPath: (d: SubmarineCable) => d.coordinates.map(([lat, lng]) => [lng, lat] as [number, number]),
          getColor: (d: SubmarineCable) => getCableColor(d.owners),
          getWidth: 2,
          widthMinPixels: 1,
          pickable: true,
          onClick: (info) => {
            if (info.object) onSelectMapItem?.({ type: "cable", data: info.object as SubmarineCable });
          },
          onHover: (info) =>
            setHoverInfo(
              info.picked ? { x: info.x!, y: info.y!, object: { cable: info.object } } : null
            ),
        })
      );
    }

    if (pipelines.length > 0) {
      l.push(
        new PathLayer({
          id: "pipelines",
          data: pipelines,
          getPath: (d: Pipeline) => d.coordinates.map(([lat, lng]) => [lng, lat] as [number, number]),
          getColor: (d: Pipeline) =>
            d.type === "oil"
              ? ([139, 92, 246, 160] as [number, number, number, number])
              : d.type === "gas"
                ? ([132, 204, 22, 160] as [number, number, number, number])
                : ([245, 158, 11, 160] as [number, number, number, number]),
          getWidth: 3,
          widthMinPixels: 1.5,
          pickable: true,
          onClick: (info) => {
            if (info.object) onSelectMapItem?.({ type: "pipeline", data: info.object as Pipeline });
          },
          onHover: (info) =>
            setHoverInfo(
              info.picked ? { x: info.x!, y: info.y!, object: { pipeline: info.object } } : null
            ),
        })
      );
    }

    if (militaryBases.length > 0) {
      l.push(
        new IconLayer({
          id: "military-bases",
          data: militaryBases,
          getPosition: (d: MilitaryBase) => [d.lng, d.lat] as [number, number],
          getIcon: (d: MilitaryBase) => ({ url: getBaseIcon(d.type), width: 40, height: 40, anchorY: 20 }),
          getSize: 32,
          sizeMinPixels: 20,
          sizeMaxPixels: 40,
          pickable: true,
          onClick: (info) => {
            if (info.object) onSelectMapItem?.({ type: "base", data: info.object as MilitaryBase });
          },
          onHover: (info) =>
            setHoverInfo(
              info.picked ? { x: info.x!, y: info.y!, object: { base: info.object } } : null
            ),
        }) as unknown as Layer
      );
    }

    if (nuclearFacilities.length > 0) {
      l.push(
        new IconLayer({
          id: "nuclear-facilities",
          data: nuclearFacilities,
          getPosition: (d: NuclearFacility) => [d.lng, d.lat] as [number, number],
          getIcon: () => ({ url: ICON_NUCLEAR, width: 40, height: 40, anchorY: 20 }),
          getSize: 32,
          sizeMinPixels: 20,
          sizeMaxPixels: 40,
          pickable: true,
          onClick: (info) => {
            if (info.object) onSelectMapItem?.({ type: "nuclear", data: info.object as NuclearFacility });
          },
          onHover: (info) =>
            setHoverInfo(
              info.picked ? { x: info.x!, y: info.y!, object: { nuclear: info.object } } : null
            ),
        }) as unknown as Layer
      );
    }

    for (const trace of sigintTraces) {
      if (trace.positions.length >= 2) {
        l.push(
          new PathLayer<{ path: [number, number][] }>({
            id: `sigint-path-${trace.id}`,
            data: [{ path: trace.positions.map((p) => [p.lng, p.lat] as [number, number]) }],
            getPath: (d) => d.path,
            getColor: [255, 50, 50, 200],
            getWidth: 3,
            widthMinPixels: 2,
            pickable: false,
          }) as unknown as Layer
        );
      }
      if (trace.positions.length > 0) {
        l.push(
          new ScatterplotLayer<{ position: [number, number]; idx: number; total: number }>({
            id: `sigint-points-${trace.id}`,
            data: trace.positions.map((p, i) => ({ position: [p.lng, p.lat] as [number, number], idx: i, total: trace.positions.length })),
            getPosition: (d) => d.position,
            getRadius: 300,
            getFillColor: (d) => d.idx === d.total - 1
              ? [255, 50, 50, 255] as [number, number, number, number]
              : [255, 100, 100, 150] as [number, number, number, number],
            getLineColor: [255, 255, 255, 200] as [number, number, number, number],
            lineWidthMinPixels: 1,
            stroked: true,
            radiusMinPixels: 4,
            radiusMaxPixels: 10,
            pickable: false,
          }) as unknown as Layer
        );
      }
    }

    if (drawPoints.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "draw-points",
          data: drawPoints.map((p, i) => ({ position: [p[1], p[0]] as [number, number], idx: i })),
          getPosition: (d) => d.position,
          getRadius: 200,
          getFillColor: [255, 170, 0, 200],
          getLineColor: [255, 255, 255, 255],
          lineWidthMinPixels: 2,
          stroked: true,
          radiusMinPixels: 5,
          radiusMaxPixels: 8,
          pickable: false,
        })
      );
      if (drawPoints.length >= 2) {
        l.push(
          new PathLayer({
            id: "draw-path",
            data: [{ path: [...drawPoints.map((p) => [p[1], p[0]] as [number, number]), drawPoints.length >= 3 ? [drawPoints[0][1], drawPoints[0][0]] as [number, number] : null].filter(Boolean) as [number, number][] }],
            getPath: (d) => d.path,
            getColor: [255, 170, 0, 180],
            getWidth: 2,
            widthMinPixels: 2,
            pickable: false,
          })
        );
      }
    }

    if (measurePoints.length > 0) {
      l.push(
        new ScatterplotLayer({
          id: "measure-points",
          data: measurePoints.map((p) => ({ position: [p[1], p[0]] as [number, number] })),
          getPosition: (d) => d.position,
          getRadius: 200,
          getFillColor: [0, 212, 255, 200],
          getLineColor: [255, 255, 255, 255],
          lineWidthMinPixels: 2,
          stroked: true,
          radiusMinPixels: 5,
          radiusMaxPixels: 8,
          pickable: false,
        })
      );
      if (measurePoints.length === 2) {
        l.push(
          new PathLayer({
            id: "measure-line",
            data: [{ path: measurePoints.map((p) => [p[1], p[0]] as [number, number]) }],
            getPath: (d) => d.path,
            getColor: [0, 212, 255, 200],
            getWidth: 2,
            widthMinPixels: 2,
            getDashArray: [8, 4],
            pickable: false,
          })
        );
      }
    }

    if (userLocation) {
      l.push(
        new ScatterplotLayer({
          id: "user-location-ring",
          data: [userLocation],
          getPosition: (d: { lat: number; lng: number }) => [d.lng, d.lat] as [number, number],
          getRadius: geoRadius * 1000,
          getFillColor: [0, 212, 255, 15] as [number, number, number, number],
          getLineColor: [0, 212, 255, 80] as [number, number, number, number],
          lineWidthMinPixels: 1,
          stroked: true,
          filled: true,
          pickable: false,
          updateTriggers: { getRadius: [geoRadius] },
        })
      );
      l.push(
        new ScatterplotLayer({
          id: "user-location-dot",
          data: [userLocation],
          getPosition: (d: { lat: number; lng: number }) => [d.lng, d.lat] as [number, number],
          getRadius: 200,
          getFillColor: [0, 212, 255, 220] as [number, number, number, number],
          getLineColor: [255, 255, 255, 200] as [number, number, number, number],
          lineWidthMinPixels: 2,
          stroked: true,
          radiusMinPixels: 6,
          radiusMaxPixels: 10,
          pickable: false,
        })
      );
      l.push(
        new ScatterplotLayer({
          id: "user-location-pulse",
          data: [userLocation],
          getPosition: (d: { lat: number; lng: number }) => [d.lng, d.lat] as [number, number],
          getRadius: 600 * pulseInv,
          getFillColor: [0, 212, 255, Math.round(40 * pulse)] as [number, number, number, number],
          radiusMinPixels: 10,
          radiusMaxPixels: 20,
          pickable: false,
          updateTriggers: { getRadius: [animPhase], getFillColor: [animPhase] },
        })
      );
    }

    return l;
  }, [
    showSatellite,
    showSentinel,
    gibsDate,
    gibsProduct,
    zoneLayerData,
    opsRangeData,
    cellRangeData,
    trailLayerData,
    linkLayerData,
    missionLayerData,
    missionWaypointsData,
    predictionLayerData,
    entityLayerData,
    opsLayerData,
    infraLayerData,
    satLayerData,
    cellLayerData,
    onSelectEntity,
    onSelectMapItem,
    sigintTraces,
    conflictEvents,
    fireHotspots,
    naturalDisasters,
    cyberThreats,
    internetOutages,
    submarineCables,
    pipelines,
    militaryBases,
    nuclearFacilities,
    drawPoints,
    measurePoints,
    animPhase,
    userLocation,
    geoRadius,
  ]);

  const interactionBlocked = placeMarkerMode || missionPlanMode || drawMode || measureMode;

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <DeckGL
        initialViewState={ivs}
        onViewStateChange={onViewStateChange as never}
        controller={!interactionBlocked}
        layers={layers}
        pickingRadius={8}
        getCursor={({ isHovering }) => interactionBlocked ? "crosshair" : isHovering ? "pointer" : "grab"}
      >
        <Map mapStyle={MAP_STYLE} attributionControl={false} maxZoom={24} />
      </DeckGL>

      {hoverInfo?.object != null && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: hoverInfo.x + 16, top: hoverInfo.y + 16 }}
        >
          {(() => {
            const o = hoverInfo.object as Record<string, unknown>;
            if (o.entity) {
              const e = o.entity as Entity;
              const isAircraft = e.type === "aircraft";
              const meta = e.metadata as Record<string, unknown>;
              return (
                <div className="bg-[#0d1520f0] border border-argos-border rounded-lg p-3 min-w-[200px] max-w-[280px] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{isAircraft ? "✈" : "🚢"}</span>
                    <div>
                      <p className="text-xs font-mono text-argos-accent font-bold">{e.label}</p>
                      <p className="text-[9px] font-mono text-argos-text-dim">{isAircraft ? (meta.originCountry as string) : (meta.shipType as string) || "N/A"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[8px] font-mono">
                    {e.position ? <><p className="text-argos-text-dim">POS</p><p className="text-argos-text">{e.position.lat.toFixed(3)}, {e.position.lng.toFixed(3)}</p></> : null}
                    {meta.velocity ? <><p className="text-argos-text-dim">VIT</p><p className="text-argos-text">{(meta.velocity as number).toFixed(0)} m/s</p></> : null}
                    {e.position?.alt ? <><p className="text-argos-text-dim">ALT</p><p className="text-argos-text">{e.position.alt.toFixed(0)} m</p></> : null}
                    {meta.callsign ? <><p className="text-argos-text-dim">CALL</p><p className="text-argos-text">{String(meta.callsign)}</p></> : null}
                  </div>
                </div>
              );
            }
            if (o.conflict) {
              const c = o.conflict as ConflictEvent;
              const typeLabel: Record<string, string> = { battles: "COMBAT", explosions: "EXPLOSION", protests: "MANIFESTATION", riots: "EMEUTE", violence_against_civilians: "VIOLENCE CIVILE", strategic_developments: "STRAT." };
              return (
                <div className="bg-[#1a0505f0] border border-red-800/60 rounded-lg p-3 min-w-[220px] max-w-[300px] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg event-explosion">💥</span>
                    <div>
                      <p className="text-xs font-mono text-red-400 font-bold">{typeLabel[c.eventType] || c.eventType.toUpperCase()}</p>
                      <p className="text-[9px] font-mono text-red-300/70">{c.country} — {c.region}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[8px] font-mono">
                    <p className="text-red-400/60">ACTEUR</p><p className="text-red-200">{c.actor1}</p>
                    {c.actor2 && <><p className="text-red-400/60">VS</p><p className="text-red-200">{c.actor2}</p></>}
                    <p className="text-red-400/60">DATE</p><p className="text-red-200">{c.eventDate}</p>
                    {c.fatalities > 0 && <><p className="text-red-400/60">VICTIMES</p><p className="text-red-100 font-bold">{c.fatalities}</p></>}
                    <p className="text-red-400/60">SOURCE</p><p className="text-red-200 truncate">{c.source}</p>
                  </div>
                  {c.notes && <p className="text-[7px] font-mono text-red-300/50 line-clamp-2">{c.notes}</p>}
                </div>
              );
            }
            if (o.fire) {
              const f = o.fire as FireHotspot;
              return (
                <div className="bg-[#1a0d05f0] border border-orange-800/60 rounded-lg p-3 min-w-[200px] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg event-fire">🔥</span>
                    <div>
                      <p className="text-xs font-mono text-orange-400 font-bold">FEU DETECTE</p>
                      <p className="text-[9px] font-mono text-orange-300/70">{f.country || "N/A"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[8px] font-mono">
                    <p className="text-orange-400/60">FRP</p><p className="text-orange-200">{f.frp.toFixed(1)} MW</p>
                    <p className="text-orange-400/60">SAT</p><p className="text-orange-200">{f.satellite}</p>
                    <p className="text-orange-400/60">CONF</p><p className="text-orange-200">{f.confidence}</p>
                    <p className="text-orange-400/60">POS</p><p className="text-orange-200">{f.lat.toFixed(3)}, {f.lng.toFixed(3)}</p>
                  </div>
                </div>
              );
            }
            if (o.disaster) {
              const d = o.disaster as NaturalDisaster;
              const icons: Record<string, string> = { earthquake: "🌍", flood: "🌊", cyclone: "🌀", volcano: "🌋", drought: "☀", wildfire: "🔥", tsunami: "🌊" };
              return (
                <div className="bg-[#0a1a10f0] border border-emerald-800/60 rounded-lg p-3 min-w-[220px] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg event-seismic">{icons[d.eventType] || "⚠"}</span>
                    <div>
                      <p className="text-xs font-mono text-emerald-400 font-bold">{d.title}</p>
                      <p className="text-[9px] font-mono text-emerald-300/70">{d.eventType.toUpperCase()}</p>
                    </div>
                  </div>
                  <p className="text-[8px] font-mono text-emerald-200/80 line-clamp-2">{d.description}</p>
                  <div className="flex gap-2 text-[8px] font-mono">
                    <span className={`px-1.5 py-0.5 rounded ${d.severity === "red" ? "bg-red-900/50 text-red-300" : d.severity === "orange" ? "bg-orange-900/50 text-orange-300" : "bg-green-900/50 text-green-300"}`}>
                      {d.severity.toUpperCase()}
                    </span>
                  </div>
                </div>
              );
            }
            if (o.cyber) {
              const c = o.cyber as CyberThreat;
              return (
                <div className="bg-[#0d0520f0] border border-purple-800/60 rounded-lg p-3 min-w-[200px] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg event-cyber">🛡</span>
                    <div>
                      <p className="text-xs font-mono text-purple-400 font-bold">{c.threatCategory.toUpperCase()}</p>
                      <p className="text-[9px] font-mono text-purple-300/70">{c.iocType} — {c.source}</p>
                    </div>
                  </div>
                  <p className="text-[8px] font-mono text-purple-200/80 break-all">{c.iocValue.slice(0, 50)}</p>
                </div>
              );
            }
            if (o.outage) {
              const ou = o.outage as InternetOutage;
              return (
                <div className="bg-[#1a0a0af0] border border-rose-800/60 rounded-lg p-3 min-w-[200px] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg event-outage">📵</span>
                    <div>
                      <p className="text-xs font-mono text-rose-400 font-bold">COUPURE INTERNET</p>
                      <p className="text-[9px] font-mono text-rose-300/70">{ou.country}</p>
                    </div>
                  </div>
                  <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${ou.severity === "major" ? "bg-red-900/50 text-red-300" : "bg-yellow-900/50 text-yellow-300"}`}>{ou.severity.toUpperCase()}</span>
                </div>
              );
            }
            if (o.marker) {
              const m = o.marker as OperationalMarker;
              return (
                <div className="bg-[#0d1520f0] border border-argos-border rounded-lg p-2 min-w-[160px]">
                  <p className="text-xs font-mono text-argos-accent font-bold">{m.label}</p>
                  <p className="text-[9px] font-mono text-argos-text-dim">{m.category} — {m.affiliation}</p>
                </div>
              );
            }
            if (o.infra) {
              const i = o.infra as Infrastructure;
              return (
                <div className="bg-[#0d1520f0] border border-argos-border rounded-lg p-2 min-w-[160px]">
                  <p className="text-xs font-mono text-argos-accent font-bold">{i.metadata.name}</p>
                  <p className="text-[9px] font-mono text-argos-text-dim">{i.type}</p>
                </div>
              );
            }
            if (o.tower) {
              const t = o.tower as CellTower;
              return (
                <div className="bg-[#0d1520f0] border border-argos-border rounded-lg p-2 min-w-[160px]">
                  <p className="text-xs font-mono text-argos-accent">{t.radio} — {t.operator || "N/A"}</p>
                </div>
              );
            }
            if (o.cable) {
              const c = o.cable as SubmarineCable;
              return (
                <div className="bg-[#0d1520f0] border border-argos-border rounded-lg p-2 min-w-[160px]">
                  <p className="text-xs font-mono text-blue-400">🔌 {c.name}</p>
                  <p className="text-[9px] font-mono text-argos-text-dim">{c.lengthKm?.toLocaleString()} km</p>
                </div>
              );
            }
            if (o.pipeline) {
              const p = o.pipeline as Pipeline;
              return (
                <div className="bg-[#0d1520f0] border border-argos-border rounded-lg p-2 min-w-[160px]">
                  <p className="text-xs font-mono text-yellow-400">🛢 {p.name}</p>
                  <p className="text-[9px] font-mono text-argos-text-dim">{p.type}</p>
                </div>
              );
            }
            if (o.base) {
              const b = o.base as MilitaryBase;
              return (
                <div className="bg-[#0d1520f0] border border-argos-border rounded-lg p-2 min-w-[160px]">
                  <p className="text-xs font-mono text-green-400">🎖 {b.name}</p>
                  <p className="text-[9px] font-mono text-argos-text-dim">{b.country}</p>
                </div>
              );
            }
            if (o.nuclear) {
              const n = o.nuclear as NuclearFacility;
              return (
                <div className="bg-[#1a1a05f0] border border-yellow-800/60 rounded-lg p-2 min-w-[160px]">
                  <p className="text-xs font-mono text-yellow-400">☢ {n.name}</p>
                  <p className="text-[9px] font-mono text-argos-text-dim">{n.type} — {n.status}</p>
                </div>
              );
            }
            return null;
          })()}
        </div>
      )}

      {interactionBlocked && (
        <div
          className="absolute inset-0 cursor-crosshair"
          style={{ zIndex: 9999 }}
          onClick={handleOverlayClick}
          onDoubleClick={handleOverlayDblClick}
        />
      )}

      {drawMode && drawPoints.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-argos-surface/90 border border-argos-warning/50 rounded-lg px-4 py-2 flex items-center gap-3 backdrop-blur-sm">
          <span className="text-[10px] font-mono text-argos-warning">{drawPoints.length} points</span>
          {drawPoints.length >= 3 && (
            <button
              onClick={() => { onZoneDrawn?.(drawPoints); setDrawPoints([]); }}
              className="text-[10px] font-mono bg-argos-warning/20 hover:bg-argos-warning/30 text-argos-warning border border-argos-warning/40 px-3 py-1 rounded transition-colors"
            >
              Valider la zone
            </button>
          )}
          <button
            onClick={() => setDrawPoints([])}
            className="text-[10px] font-mono text-argos-text-dim hover:text-red-400 px-2 py-1 transition-colors"
          >
            Annuler
          </button>
        </div>
      )}

      {measureMode && measurePoints.length === 2 && (() => {
        const [lat1, lon1] = measurePoints[0];
        const [lat2, lon2] = measurePoints[1];
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const nm = dist / 1.852;
        return (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-argos-surface/90 border border-argos-accent/50 rounded-lg px-4 py-2 flex items-center gap-4 backdrop-blur-sm">
            <span className="text-xs font-mono text-argos-accent font-bold">{dist.toFixed(1)} km</span>
            <span className="text-[10px] font-mono text-argos-text-dim">{nm.toFixed(1)} NM</span>
            <button
              onClick={() => setMeasurePoints([])}
              className="text-[10px] font-mono text-argos-text-dim hover:text-argos-accent px-2 py-1 transition-colors"
            >
              Reset
            </button>
          </div>
        );
      })()}

      {/* Zoom control placeholder - deck.gl controller handles zoom via scroll */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 rounded bg-argos-surface/80 border border-argos-border/50 p-1">
        <button
          onClick={() => { const c = vsRef.current; setIvs({ ...c, zoom: Math.min(24, c.zoom + 1) }); }}
          className="w-8 h-7 flex items-center justify-center text-argos-text hover:bg-argos-accent/20 rounded text-lg"
        >
          +
        </button>
        <button
          onClick={() => { const c = vsRef.current; setIvs({ ...c, zoom: Math.max(0, c.zoom - 1) }); }}
          className="w-8 h-7 flex items-center justify-center text-argos-text hover:bg-argos-accent/20 rounded text-lg"
        >
          −
        </button>
      </div>
    </div>
  );
}
