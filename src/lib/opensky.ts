import { Aircraft, GeoPosition } from "@/types";

const OPENSKY_BASE = "https://opensky-network.org/api";

const FRANCE_BBOX = {
  lamin: 41.3,
  lamax: 51.1,
  lomin: -5.1,
  lomax: 9.6,
};

export async function fetchAircraftFrance(): Promise<Aircraft[]> {
  const { lamin, lamax, lomin, lomax } = FRANCE_BBOX;
  const url = `${OPENSKY_BASE}/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;

  try {
    const res = await fetch(url, { next: { revalidate: 10 } });
    if (!res.ok) {
      console.error(`OpenSky API error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    if (!data.states) return [];
    const now = Date.now();

    return data.states.map((s: (string | number | boolean | null)[]): Aircraft => {
      const lat = s[6] as number | null;
      const lng = s[5] as number | null;
      const alt = s[7] as number | null;
      const callsign = s[1] ? (s[1] as string).trim() : null;
      const icao24 = s[0] as string;

      const position: GeoPosition | null =
        lat !== null && lng !== null
          ? { lat, lng, alt: alt ?? undefined, timestamp: now }
          : null;

      return {
        id: `ac-${icao24}`,
        type: "aircraft",
        label: callsign || icao24.toUpperCase(),
        position,
        trail: position ? [position] : [],
        tracked: false,
        flagged: false,
        metadata: {
          icao24,
          callsign,
          originCountry: s[2] as string,
          baroAltitude: s[7] as number | null,
          geoAltitude: s[13] as number | null,
          velocity: s[9] as number | null,
          trueTrack: s[10] as number | null,
          verticalRate: s[11] as number | null,
          onGround: s[8] as boolean,
          squawk: s[14] as string | null,
          lastContact: s[4] as number,
        },
      };
    });
  } catch (err) {
    console.error("OpenSky fetch failed:", err);
    return [];
  }
}

export function mergeAircraftWithHistory(
  incoming: Aircraft[],
  existing: Map<string, Aircraft>,
  maxTrailLength = 50
): Map<string, Aircraft> {
  const merged = new Map<string, Aircraft>();

  for (const ac of incoming) {
    const prev = existing.get(ac.id);
    if (prev && ac.position) {
      const trail = [...prev.trail];
      const lastPos = trail[trail.length - 1];
      if (!lastPos || lastPos.lat !== ac.position.lat || lastPos.lng !== ac.position.lng) {
        trail.push(ac.position);
      }
      if (trail.length > maxTrailLength) trail.splice(0, trail.length - maxTrailLength);

      merged.set(ac.id, {
        ...ac,
        trail,
        tracked: prev.tracked,
        flagged: prev.flagged,
      });
    } else {
      merged.set(ac.id, ac);
    }
  }

  return merged;
}
