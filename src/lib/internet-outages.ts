import { InternetOutage } from "@/types";
import { withCircuitBreaker } from "./circuit-breaker";
import { getCached } from "./cache";

const OUTAGES_URL = "https://api.cloudflare.com/client/v4/radar/annotations/outages?limit=100&dateRange=7d&format=json";

const COUNTRY_COORDS: Record<string, [number, number]> = {
  FR: [48.86, 2.35],
  US: [38.89, -77.04],
  GB: [51.51, -0.13],
  DE: [52.52, 13.41],
  RU: [55.75, 37.62],
  CN: [39.9, 116.4],
  JP: [35.68, 139.69],
  IN: [28.61, 77.21],
  BR: [-15.79, -47.88],
  AU: [-33.87, 151.21],
  ZA: [-33.93, 18.42],
  EG: [30.04, 31.24],
  NG: [9.06, 7.49],
  KE: [-1.29, 36.82],
  TR: [39.93, 32.87],
  SA: [24.71, 46.68],
  IR: [35.69, 51.39],
  PK: [33.69, 73.04],
  UA: [50.45, 30.52],
  PL: [52.23, 21.01],
  IT: [41.9, 12.5],
  ES: [40.42, -3.7],
  CA: [45.42, -75.7],
  MX: [19.43, -99.13],
  AR: [-34.6, -58.38],
  CL: [-33.45, -70.67],
  CO: [4.71, -74.07],
  VE: [10.49, -66.88],
  KR: [37.57, 126.98],
  TH: [13.76, 100.5],
  VN: [21.03, 105.85],
  MY: [3.14, 101.69],
  ID: [-6.21, 106.85],
  PH: [14.6, 120.98],
  BD: [23.81, 90.41],
  MM: [19.76, 96.07],
  IQ: [33.31, 44.37],
  SY: [33.51, 36.29],
  LY: [32.9, 13.18],
  SD: [15.59, 32.53],
  ET: [9.02, 38.75],
  SO: [2.05, 45.34],
  YE: [15.35, 44.21],
  AF: [34.53, 69.17],
  CU: [23.05, -82.35],
  AO: [-8.84, 13.23],
  TZ: [-6.17, 35.74],
  CD: [-4.32, 15.31],
  ML: [12.64, -8.0],
  NE: [13.51, 2.11],
  BF: [12.37, -1.52],
  TD: [12.1, 15.04],
  KH: [11.56, 104.92],
  LA: [17.97, 102.63],
  NP: [27.72, 85.32],
  LK: [6.93, 79.85],
};

interface CloudflareAnnotation {
  startDate?: string;
  endDate?: string | null;
  scope?: string;
  type?: string;
  locations?: string[];
  asns?: number[];
  description?: string | null;
  outage?: { outageType?: string; outageCause?: string };
  scoreDropPct?: number;
  asn?: number;
  asnName?: string;
  country?: string;
}

function getCoords(countryCode: string | undefined): [number, number] {
  if (!countryCode) return [0, 0];
  const c = COUNTRY_COORDS[countryCode.toUpperCase()];
  return c ?? [0, 0];
}

function severityFromScoreDrop(scoreDropPct: number): "minor" | "moderate" | "major" {
  if (scoreDropPct > 50) return "major";
  if (scoreDropPct > 20) return "moderate";
  return "minor";
}

function deriveScoreDrop(ann: CloudflareAnnotation): number {
  if (ann.scoreDropPct != null) return ann.scoreDropPct;
  const scope = (ann.scope || "").toLowerCase();
  const type = (ann.outage?.outageType || "").toUpperCase();
  if (type === "NATIONAL" || scope.includes("country") || scope.includes("national")) return 55;
  if (type === "REGIONAL" || scope.includes("region")) return 35;
  return 15;
}

function parseAnnotations(annotations: CloudflareAnnotation[]): InternetOutage[] {
  const now = new Date().toISOString();
  return annotations.map((ann, i) => {
    const country = ann.country ?? ann.locations?.[0] ?? "";
    const [lat, lng] = getCoords(country);
    const scoreDropPct = deriveScoreDrop(ann);
    const severity = severityFromScoreDrop(scoreDropPct);
    const asn = ann.asn ?? ann.asns?.[0] ?? null;

    let scopeType: "country" | "asn" | "region" = "region";
    if (ann.asns?.length || ann.asn) scopeType = "asn";
    else if (country && (ann.scope?.toLowerCase().includes("country") ?? false))
      scopeType = "country";

    return {
      id: `cf-outage-${i}-${country}-${asn ?? "x"}`,
      country: country || "Unknown",
      region: ann.scope ?? null,
      asn,
      asName: ann.asnName ?? null,
      lat,
      lng,
      type: scopeType,
      severity,
      startTime: ann.startDate ?? now,
      endTime: ann.endDate ?? null,
      scoreDropPct,
      source: "cloudflare_radar" as const,
    };
  });
}

export async function fetchInternetOutages(): Promise<InternetOutage[]> {
  const token = process.env.CLOUDFLARE_RADAR_TOKEN;
  if (!token) {
    throw new Error(
      "CLOUDFLARE_RADAR_TOKEN non configuré. " +
      "Créez un token gratuit sur https://dash.cloudflare.com/profile/api-tokens → Create Token → Custom Token → " +
      "Permissions: Account / Cloudflare Radar / Read. Puis ajoutez-le dans .env"
    );
  }

  return getCached(
    "internet-outages",
    async () => {
      return withCircuitBreaker("cloudflare-radar", async () => {
        const res = await fetch(OUTAGES_URL, {
          headers: {
            "Accept": "application/json",
            "Authorization": `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Cloudflare Radar erreur ${res.status}: ${text.slice(0, 300)}`);
        }
        const data = await res.json();
        const annotations: CloudflareAnnotation[] =
          data?.result?.annotations ?? data?.annotations ?? [];
        console.log(`Cloudflare Radar: ${annotations.length} pannes récupérées`);
        return parseAnnotations(annotations);
      });
    },
    { ttlSeconds: 600 }
  );
}
