/**
 * NASA FIRMS — Fire Information for Resource Management System
 * Récupération des hotspots de feux détectés par satellite.
 */

import type { FireHotspot } from "@/types";
import { withCircuitBreaker } from "./circuit-breaker";
import { getCached } from "./cache";

const SATELLITE_MAP: Record<string, FireHotspot["satellite"]> = {
  VIIRS_SNPP_NRT: "VIIRS_SNPP",
  VIIRS_SNPP: "VIIRS_SNPP",
  VIIRS_NOAA20_NRT: "VIIRS_NOAA20",
  VIIRS_NOAA20: "VIIRS_NOAA20",
  VIIRS_NOAA21_NRT: "VIIRS_NOAA21",
  VIIRS_NOAA21: "VIIRS_NOAA21",
  MODIS_NRT: "MODIS",
  MODIS: "MODIS",
};

const CONFIDENCE_MAP: Record<string, FireHotspot["confidence"]> = {
  n: "nominal",
  nominal: "nominal",
  l: "low",
  low: "low",
  h: "high",
  high: "high",
};

function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j]?.trim() ?? "";
    });
    rows.push(row);
  }
  return rows;
}

async function fetchFireHotspotsUpstream(params: {
  days?: number;
  source?: string;
}): Promise<FireHotspot[]> {
  const apiKey = process.env.NASA_FIRMS_API_KEY;
  if (!apiKey) return [];

  const source = params.source ?? "VIIRS_SNPP_NRT";
  const dayRange = Math.min(5, Math.max(1, params.days ?? 1));
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/${source}/world/${dayRange}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`NASA FIRMS API error: ${res.status}`);
  const text = await res.text();
  const rows = parseCSV(text);
  const limit = 1000;

  return rows.slice(0, limit).map((r, i) => {
    const sat = SATELLITE_MAP[r.satellite ?? source] ?? "VIIRS_SNPP";
    const confKey = (r.confidence ?? "n").toLowerCase();
    const confidence = CONFIDENCE_MAP[confKey] ?? "nominal";
    return {
      id: `firms-${i}`,
      lat: parseFloat(r.latitude) || 0,
      lng: parseFloat(r.longitude) || 0,
      brightness: parseFloat(r.bright_ti4) || 0,
      scan: parseFloat(r.scan) || 0,
      track: parseFloat(r.track) || 0,
      acqDate: r.acq_date ?? "",
      acqTime: r.acq_time ?? "",
      satellite: sat,
      confidence,
      frp: parseFloat(r.frp) || 0,
      country: null,
    };
  });
}

const DEMO_FIRES: FireHotspot[] = [
  { id: "demo-f1", lat: 36.2, lng: 28.9, brightness: 330, scan: 1.0, track: 1.0, acqDate: new Date().toISOString().slice(0, 10), acqTime: "1400", satellite: "VIIRS_SNPP", confidence: "high", frp: 45.3, country: "Greece" },
  { id: "demo-f2", lat: 40.6, lng: 23.1, brightness: 310, scan: 1.2, track: 1.0, acqDate: new Date().toISOString().slice(0, 10), acqTime: "1345", satellite: "VIIRS_SNPP", confidence: "nominal", frp: 28.7, country: "Greece" },
  { id: "demo-f3", lat: -33.8, lng: 150.9, brightness: 340, scan: 1.0, track: 1.1, acqDate: new Date().toISOString().slice(0, 10), acqTime: "0230", satellite: "MODIS", confidence: "high", frp: 67.2, country: "Australia" },
  { id: "demo-f4", lat: -8.5, lng: -63.1, brightness: 315, scan: 1.1, track: 1.0, acqDate: new Date().toISOString().slice(0, 10), acqTime: "1830", satellite: "VIIRS_SNPP", confidence: "nominal", frp: 22.5, country: "Brazil" },
  { id: "demo-f5", lat: 37.2, lng: -3.8, brightness: 305, scan: 1.0, track: 1.0, acqDate: new Date().toISOString().slice(0, 10), acqTime: "1230", satellite: "VIIRS_NOAA20", confidence: "nominal", frp: 15.8, country: "Spain" },
  { id: "demo-f6", lat: 43.8, lng: 6.9, brightness: 320, scan: 1.0, track: 1.0, acqDate: new Date().toISOString().slice(0, 10), acqTime: "1315", satellite: "VIIRS_SNPP", confidence: "high", frp: 38.4, country: "France" },
  { id: "demo-f7", lat: 34.1, lng: -118.2, brightness: 350, scan: 1.3, track: 1.2, acqDate: new Date().toISOString().slice(0, 10), acqTime: "2100", satellite: "VIIRS_SNPP", confidence: "high", frp: 89.1, country: "United States" },
  { id: "demo-f8", lat: 62.0, lng: 130.0, brightness: 300, scan: 1.0, track: 1.0, acqDate: new Date().toISOString().slice(0, 10), acqTime: "0600", satellite: "MODIS", confidence: "nominal", frp: 12.3, country: "Russia" },
];

export async function fetchFireHotspots(params?: {
  days?: number;
  source?: string;
}): Promise<FireHotspot[]> {
  const apiKey = process.env.NASA_FIRMS_API_KEY;
  if (!apiKey) {
    console.warn("FIRMS: NASA_FIRMS_API_KEY non configuré — données de démonstration utilisées. Obtenez une clé sur https://firms.modaps.eosdis.nasa.gov/api/area/");
    return DEMO_FIRES;
  }

  const cacheKey = `firms:${params?.days ?? 1}:${params?.source ?? "VIIRS_SNPP_NRT"}`;
  return getCached(
    cacheKey,
    () =>
      withCircuitBreaker("firms", () => fetchFireHotspotsUpstream(params ?? {})),
    { ttlSeconds: 600 }
  );
}
