import { Aircraft } from "@/types";

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

    return data.states.map((s: (string | number | boolean | null)[]): Aircraft => ({
      icao24: s[0] as string,
      callsign: s[1] ? (s[1] as string).trim() : null,
      originCountry: s[2] as string,
      longitude: s[5] as number | null,
      latitude: s[6] as number | null,
      baroAltitude: s[7] as number | null,
      geoAltitude: s[13] as number | null,
      velocity: s[9] as number | null,
      trueTrack: s[10] as number | null,
      verticalRate: s[11] as number | null,
      onGround: s[8] as boolean,
      squawk: s[14] as string | null,
      lastContact: s[4] as number,
      timePosition: s[3] as number | null,
    }));
  } catch (err) {
    console.error("OpenSky fetch failed:", err);
    return [];
  }
}

export function computeStats(aircraft: Aircraft[]) {
  const active = aircraft.filter((a) => !a.onGround && a.latitude && a.longitude);
  const altitudes = active.map((a) => a.baroAltitude ?? 0).filter((a) => a > 0);
  const speeds = active.map((a) => a.velocity ?? 0).filter((v) => v > 0);
  const countries = [...new Set(aircraft.map((a) => a.originCountry))];

  return {
    totalAircraft: aircraft.length,
    activeFlights: active.length,
    avgAltitude: altitudes.length > 0
      ? Math.round(altitudes.reduce((a, b) => a + b, 0) / altitudes.length)
      : 0,
    avgSpeed: speeds.length > 0
      ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 3.6)
      : 0,
    countriesDetected: countries.sort(),
  };
}
