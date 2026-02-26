import { SubmarineCable } from "@/types";
import { withCircuitBreaker } from "./circuit-breaker";
import { getCached } from "./cache";

interface TeleGeographyCable {
  id: string | number;
  name: string;
  owners?: string;
  length?: string;
  rfs?: string | null;
  is_planned?: boolean;
  coordinates?: [number, number][][];
  geometry?: { type: string; coordinates: [number, number][] | [number, number][][] };
  landing_points?: { name?: string; country?: string; lat?: number; lng?: number }[];
  lat?: number;
  lng?: number;
}

function parseLengthKm(lengthStr: string | undefined): number {
  if (!lengthStr || typeof lengthStr !== "string") return 0;
  const match = lengthStr.match(/([\d.]+)\s*km/i);
  return match ? parseFloat(match[1]) || 0 : 0;
}

function extractCoordinates(cable: TeleGeographyCable): [number, number][] {
  const coords: [number, number][] = [];
  if (cable.coordinates && Array.isArray(cable.coordinates)) {
    for (const seg of cable.coordinates) {
      if (Array.isArray(seg)) {
        for (const pt of seg) {
          if (Array.isArray(pt) && pt.length >= 2) {
            const [lng, lat] = pt;
            coords.push([lat, lng]);
          }
        }
      }
    }
  }
  if (cable.geometry?.coordinates) {
    const geom = cable.geometry.coordinates;
    if (Array.isArray(geom[0]) && typeof geom[0][0] === "number") {
      (geom as [number, number][]).forEach(([lng, lat]) => coords.push([lat, lng]));
    } else {
      (geom as [number, number][][]).forEach((seg) => {
        seg.forEach(([lng, lat]) => coords.push([lat, lng]));
      });
    }
  }
  return coords;
}

function extractLandingPoints(cable: TeleGeographyCable, coordinates: [number, number][]): { name: string; country: string; lat: number; lng: number }[] {
  if (cable.landing_points && Array.isArray(cable.landing_points) && cable.landing_points.length > 0) {
    return cable.landing_points
      .filter((lp) => lp.lat != null && lp.lng != null)
      .map((lp) => ({
        name: lp.name || "Unknown",
        country: lp.country || "",
        lat: lp.lat!,
        lng: lp.lng!,
      }));
  }
  const points: { name: string; country: string; lat: number; lng: number }[] = [];
  if (coordinates.length >= 2) {
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    points.push({ name: "Landing A", country: "", lat: first[0], lng: first[1] });
    if (first[0] !== last[0] || first[1] !== last[1]) {
      points.push({ name: "Landing B", country: "", lat: last[0], lng: last[1] });
    }
  }
  return points;
}

export async function fetchSubmarineCables(): Promise<SubmarineCable[]> {
  return getCached(
    "submarine-cables",
    () =>
      withCircuitBreaker("submarine-cables", async () => {
        const res = await fetch(
          "https://www.submarinecablemap.com/api/v3/cable/cable-geo.json"
        );
        if (!res.ok) throw new Error(`Submarine cables API: ${res.status}`);
        const geojson = await res.json();
        const features: Array<{
          properties: { id?: string; name?: string; color?: string };
          geometry: { type: string; coordinates: number[][][] };
        }> = geojson?.features ?? [];

        return features.slice(0, 500).map((f) => {
          const coords: [number, number][] = [];
          if (f.geometry?.coordinates) {
            for (const line of f.geometry.coordinates) {
              for (const pt of line) {
                if (Array.isArray(pt) && pt.length >= 2) {
                  coords.push([pt[1], pt[0]]);
                }
              }
            }
          }
          const landingPoints: { name: string; country: string; lat: number; lng: number }[] = [];
          if (coords.length >= 2) {
            landingPoints.push({ name: "Terminal A", country: "", lat: coords[0][0], lng: coords[0][1] });
            const last = coords[coords.length - 1];
            if (last[0] !== coords[0][0] || last[1] !== coords[0][1]) {
              landingPoints.push({ name: "Terminal B", country: "", lat: last[0], lng: last[1] });
            }
          }
          return {
            id: String(f.properties?.id ?? f.properties?.name ?? Math.random()),
            name: f.properties?.name || "Unknown",
            owners: [],
            lengthKm: 0,
            rfsDate: null,
            status: "active" as const,
            coordinates: coords,
            landingPoints,
            capacityTbps: null,
          } satisfies SubmarineCable;
        });
      }),
    { ttlSeconds: 86400 }
  );
}
