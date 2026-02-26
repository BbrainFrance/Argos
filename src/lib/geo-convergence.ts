import type {
  ConflictEvent,
  FireHotspot,
  NaturalDisaster,
  InternetOutage,
  MilitaryBase,
  NuclearFacility,
} from "@/types";

export interface ConvergenceZone {
  id: string;
  lat: number;
  lng: number;
  radiusKm: number;
  score: number;
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  eventTypes: string[];
  eventCount: number;
  description: string;
  nearbyAssets: string[];
  timestamp: string;
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type GeoPoint = { lat: number; lng: number; type: string; label: string };

export function detectConvergence(data: {
  conflicts?: ConflictEvent[];
  fires?: FireHotspot[];
  disasters?: NaturalDisaster[];
  outages?: InternetOutage[];
  militaryBases?: MilitaryBase[];
  nuclearFacilities?: NuclearFacility[];
}): ConvergenceZone[] {
  const points: GeoPoint[] = [];

  for (const c of data.conflicts ?? []) {
    points.push({ lat: c.lat, lng: c.lng, type: "conflict", label: c.eventType });
  }
  for (const f of data.fires ?? []) {
    points.push({ lat: f.lat, lng: f.lng, type: "fire", label: "hotspot" });
  }
  for (const d of data.disasters ?? []) {
    points.push({ lat: d.lat, lng: d.lng, type: "disaster", label: d.eventType });
  }
  for (const o of data.outages ?? []) {
    points.push({ lat: o.lat, lng: o.lng, type: "outage", label: o.country });
  }

  if (points.length === 0) return [];

  const cellMap = new Map<string, GeoPoint[]>();

  for (const p of points) {
    const cellKey = `${Math.floor(p.lat)}_${Math.floor(p.lng)}`;
    const existing = cellMap.get(cellKey) ?? [];
    existing.push(p);
    cellMap.set(cellKey, existing);
  }

  const zones: ConvergenceZone[] = [];
  const RADIUS_KM = 100;

  for (const [, clusterPoints] of cellMap) {
    const uniqueTypes = new Set(clusterPoints.map((p) => p.type));
    const eventCount = clusterPoints.length;

    if (uniqueTypes.size < 2 || eventCount < 3) continue;

    const centerLat =
      clusterPoints.reduce((s, p) => s + p.lat, 0) / clusterPoints.length;
    const centerLng =
      clusterPoints.reduce((s, p) => s + p.lng, 0) / clusterPoints.length;

    const maxDist = Math.max(
      ...clusterPoints.map((p) =>
        haversineKm(centerLat, centerLng, p.lat, p.lng)
      )
    );
    const radiusKm = Math.max(50, maxDist);

    const score = Math.min(
      100,
      eventCount * 10 + uniqueTypes.size * 15
    );

    const nearbyAssets: string[] = [];
    for (const b of data.militaryBases ?? []) {
      if (haversineKm(centerLat, centerLng, b.lat, b.lng) <= RADIUS_KM) {
        nearbyAssets.push(b.name);
      }
    }
    for (const n of data.nuclearFacilities ?? []) {
      if (haversineKm(centerLat, centerLng, n.lat, n.lng) <= RADIUS_KM) {
        nearbyAssets.push(n.name);
      }
    }

    const counts = {
      conflict: clusterPoints.filter((p) => p.type === "conflict").length,
      fire: clusterPoints.filter((p) => p.type === "fire").length,
      disaster: clusterPoints.filter((p) => p.type === "disaster").length,
      outage: clusterPoints.filter((p) => p.type === "outage").length,
    };

    const parts: string[] = [];
    if (counts.conflict > 0) parts.push(`${counts.conflict} conflits`);
    if (counts.fire > 0) parts.push(`${counts.fire} feux`);
    if (counts.disaster > 0) parts.push(`${counts.disaster} catastrophes`);
    if (counts.outage > 0) parts.push(`${counts.outage} pannes internet`);
    const description = `Convergence: ${parts.join(", ")} dans un rayon de ${Math.round(radiusKm)}km`;

    let level: ConvergenceZone["level"];
    if (score >= 80) level = "CRITICAL";
    else if (score >= 60) level = "HIGH";
    else if (score >= 40) level = "MEDIUM";
    else level = "LOW";

    zones.push({
      id: `conv-${centerLat.toFixed(2)}-${centerLng.toFixed(2)}-${Date.now()}`,
      lat: centerLat,
      lng: centerLng,
      radiusKm,
      score,
      level,
      eventTypes: Array.from(uniqueTypes),
      eventCount,
      description,
      nearbyAssets,
      timestamp: new Date().toISOString(),
    });
  }

  zones.sort((a, b) => b.score - a.score);
  return zones.slice(0, 50);
}
