import { Aircraft, GeoPosition } from "@/types";
import { withCircuitBreaker } from "./circuit-breaker";

const OPENSKY_BASE = "https://opensky-network.org/api";
const TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

const OPS_BBOX = {
  lamin: parseFloat(process.env.OPERATION_BBOX_LAMIN || "41.3"),
  lamax: parseFloat(process.env.OPERATION_BBOX_LAMAX || "51.1"),
  lomin: parseFloat(process.env.OPERATION_BBOX_LOMIN || "-5.1"),
  lomax: parseFloat(process.env.OPERATION_BBOX_LOMAX || "9.6"),
};

interface TokenCache {
  token: string;
  expiresAt: number;
}

const g = globalThis as unknown as {
  __opensky?: {
    cachedAircraft: Aircraft[];
    lastSuccessfulFetch: number;
    rateLimitedUntil: number;
    tokenCache: TokenCache | null;
  };
};

function state() {
  if (!g.__opensky) {
    g.__opensky = {
      cachedAircraft: [],
      lastSuccessfulFetch: 0,
      rateLimitedUntil: 0,
      tokenCache: null,
    };
  }
  return g.__opensky;
}

const MIN_FETCH_INTERVAL_MS = 10_000;
const RATE_LIMIT_BACKOFF_MS = 60_000;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  const s = state();
  if (s.tokenCache && Date.now() < s.tokenCache.expiresAt) {
    return s.tokenCache.token;
  }

  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });

    const res = await withCircuitBreaker("opensky-token", () =>
      fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })
    );

    if (!res.ok) {
      console.error(`OpenSky token error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    const token = data.access_token as string;
    const expiresIn = (data.expires_in as number) ?? 300;

    s.tokenCache = {
      token,
      expiresAt: Date.now() + (expiresIn - 30) * 1000,
    };

    console.log(`OpenSky: Token obtained (expires in ${expiresIn}s)`);
    return token;
  } catch (err) {
    console.error("OpenSky token fetch failed:", err);
    return null;
  }
}

export async function fetchAircraftFrance(): Promise<Aircraft[]> {
  const s = state();
  const now = Date.now();

  if (now < s.rateLimitedUntil) {
    console.log(`OpenSky rate-limited, serving cache (${s.cachedAircraft.length} aircraft). Retry in ${Math.round((s.rateLimitedUntil - now) / 1000)}s`);
    return s.cachedAircraft;
  }

  if (now - s.lastSuccessfulFetch < MIN_FETCH_INTERVAL_MS && s.cachedAircraft.length > 0) {
    return s.cachedAircraft;
  }

  const { lamin, lamax, lomin, lomax } = OPS_BBOX;
  const url = `${OPENSKY_BASE}/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;

  try {
    const headers: Record<string, string> = {};
    const token = await getAccessToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await withCircuitBreaker("opensky-states", () =>
      fetch(url, { cache: "no-store", headers })
    );

    if (res.status === 429) {
      const backoff = token ? 15_000 : RATE_LIMIT_BACKOFF_MS;
      s.rateLimitedUntil = now + backoff;
      console.warn(`OpenSky 429 — backoff ${backoff / 1000}s. Serving cache (${s.cachedAircraft.length} aircraft)`);
      return s.cachedAircraft;
    }

    if (res.status === 401 || res.status === 403) {
      console.error(`OpenSky auth error: ${res.status}. Clearing token cache.`);
      s.tokenCache = null;
      return s.cachedAircraft;
    }

    if (!res.ok) {
      console.error(`OpenSky API error: ${res.status}`);
      return s.cachedAircraft;
    }

    const data = await res.json();
    if (!data.states) return s.cachedAircraft;

    const fetchTime = Date.now();

    const aircraft = data.states.map((sv: (string | number | boolean | null)[]): Aircraft => {
      const lat = sv[6] as number | null;
      const lng = sv[5] as number | null;
      const alt = sv[7] as number | null;
      const callsign = sv[1] ? (sv[1] as string).trim() : null;
      const icao24 = sv[0] as string;

      const position: GeoPosition | null =
        lat !== null && lng !== null
          ? { lat, lng, alt: alt ?? undefined, timestamp: fetchTime }
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
          originCountry: sv[2] as string,
          baroAltitude: sv[7] as number | null,
          geoAltitude: sv[13] as number | null,
          velocity: sv[9] as number | null,
          trueTrack: sv[10] as number | null,
          verticalRate: sv[11] as number | null,
          onGround: sv[8] as boolean,
          squawk: sv[14] as string | null,
          lastContact: sv[4] as number,
        },
      };
    });

    s.cachedAircraft = aircraft;
    s.lastSuccessfulFetch = fetchTime;
    console.log(`OpenSky OK — ${aircraft.length} aircraft (auth: ${token ? "yes" : "no"})`);
    return aircraft;
  } catch (err) {
    console.error("OpenSky fetch failed:", err);
    return s.cachedAircraft;
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
