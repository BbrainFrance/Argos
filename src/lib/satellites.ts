import * as satellite from "satellite.js";
import type { SatellitePosition, SatelliteGroup } from "@/types";

interface TLECacheEntry {
  records: satellite.SatRec[];
  names: string[];
  fetchedAt: number;
}

const TLE_CACHE = new Map<string, TLECacheEntry>();
const TLE_CACHE_TTL = 6 * 60 * 60 * 1000; // 6h

const CONSTELLATION_URLS: Record<SatelliteGroup, string> = {
  gps: "https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle",
  galileo: "https://celestrak.org/NORAD/elements/gp.php?GROUP=galileo&FORMAT=tle",
  glonass: "https://celestrak.org/NORAD/elements/gp.php?GROUP=glonass-operational&FORMAT=tle",
  iridium: "https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-NEXT&FORMAT=tle",
  starlink: "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle",
  military: "https://celestrak.org/NORAD/elements/gp.php?GROUP=military&FORMAT=tle",
  "french-mil": "https://celestrak.org/NORAD/elements/gp.php?GROUP=military&FORMAT=tle",
};

const FRENCH_SAT_KEYWORDS = ["SYRACUSE", "CSO", "HELIOS", "CERES", "PLEIADES", "ATHENA"];

function parseTLE(text: string): { names: string[]; records: satellite.SatRec[] } {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const names: string[] = [];
  const records: satellite.SatRec[] = [];

  for (let i = 0; i < lines.length - 2; i += 3) {
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];
    if (!line1?.startsWith("1 ") || !line2?.startsWith("2 ")) continue;

    try {
      const satrec = satellite.twoline2satrec(line1, line2);
      if (satrec.error === 0) {
        names.push(name);
        records.push(satrec);
      }
    } catch { /* skip bad TLEs */ }
  }

  return { names, records };
}

async function fetchTLEs(group: SatelliteGroup): Promise<TLECacheEntry> {
  const cached = TLE_CACHE.get(group);
  if (cached && Date.now() - cached.fetchedAt < TLE_CACHE_TTL) return cached;

  const url = CONSTELLATION_URLS[group];
  const res = await fetch(url, { next: { revalidate: 21600 } });
  if (!res.ok) throw new Error(`CelesTrak fetch failed: ${res.status}`);

  const text = await res.text();
  let { names, records } = parseTLE(text);

  if (group === "french-mil") {
    const filtered = names.reduce<{ n: string[]; r: satellite.SatRec[] }>((acc, name, i) => {
      if (FRENCH_SAT_KEYWORDS.some((kw) => name.toUpperCase().includes(kw))) {
        acc.n.push(name);
        acc.r.push(records[i]);
      }
      return acc;
    }, { n: [], r: [] });
    names = filtered.n;
    records = filtered.r;
  }

  if (group === "starlink") {
    const step = Math.max(1, Math.floor(records.length / 200));
    const sampledNames: string[] = [];
    const sampledRecords: satellite.SatRec[] = [];
    for (let i = 0; i < records.length; i += step) {
      sampledNames.push(names[i]);
      sampledRecords.push(records[i]);
    }
    names = sampledNames;
    records = sampledRecords;
  }

  const entry: TLECacheEntry = { records, names, fetchedAt: Date.now() };
  TLE_CACHE.set(group, entry);
  return entry;
}

export async function getSatellitePositions(groups: SatelliteGroup[]): Promise<SatellitePosition[]> {
  const now = new Date();
  const gmst = satellite.gstime(now);
  const results: SatellitePosition[] = [];

  for (const group of groups) {
    try {
      const { names, records } = await fetchTLEs(group);

      for (let i = 0; i < records.length; i++) {
        const positionAndVelocity = satellite.propagate(records[i], now);
        if (!positionAndVelocity) continue;
        const posEci = positionAndVelocity.position;
        if (!posEci || typeof posEci === "boolean") continue;

        const geodetic = satellite.eciToGeodetic(posEci, gmst);
        const lat = satellite.degreesLat(geodetic.latitude);
        const lng = satellite.degreesLong(geodetic.longitude);
        const alt = geodetic.height;

        const velEci = positionAndVelocity.velocity;
        let velocity = 0;
        if (velEci && typeof velEci !== "boolean") {
          velocity = Math.sqrt(velEci.x ** 2 + velEci.y ** 2 + velEci.z ** 2);
        }

        results.push({
          id: `sat-${group}-${i}`,
          name: names[i] || `${group.toUpperCase()}-${i}`,
          group,
          lat,
          lng,
          alt,
          velocity,
        });
      }
    } catch (err) {
      console.error(`Satellite fetch error for ${group}:`, err);
    }
  }

  return results;
}
