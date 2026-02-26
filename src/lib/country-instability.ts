import type {
  ConflictEvent,
  NaturalDisaster,
  InternetOutage,
  CyberThreat,
} from "@/types";

// ─── Types ─────────────────────────────────────────────────

export interface CountryInstabilityScore {
  country: string;
  countryCode: string;
  score: number; // 0-100
  level: "STABLE" | "ATTENTION" | "INSTABLE" | "CRITIQUE" | "CHAOS";
  components: {
    conflictScore: number;
    disasterScore: number;
    cyberScore: number;
    connectivityScore: number;
  };
  recentEvents: number;
  fatalities: number;
  trend: "improving" | "stable" | "deteriorating";
  lastUpdated: string;
}

// ─── Lookup table ──────────────────────────────────────────

const COUNTRY_TO_CODE: Record<string, string> = {
  France: "FR",
  "United States": "US",
  "United Kingdom": "GB",
  Germany: "DE",
  Russia: "RU",
  China: "CN",
  Japan: "JP",
  India: "IN",
  Brazil: "BR",
  Ukraine: "UA",
  Israel: "IL",
  Palestine: "PS",
  Iran: "IR",
  Iraq: "IQ",
  Syria: "SY",
  Turkey: "TR",
  "Saudi Arabia": "SA",
  Egypt: "EG",
  Nigeria: "NG",
  "South Africa": "ZA",
  Kenya: "KE",
  Ethiopia: "ET",
  Somalia: "SO",
  Sudan: "SD",
  "South Sudan": "SS",
  Libya: "LY",
  Yemen: "YE",
  Afghanistan: "AF",
  Pakistan: "PK",
  Myanmar: "MM",
  Thailand: "TH",
  Philippines: "PH",
  Indonesia: "ID",
  Australia: "AU",
  Canada: "CA",
  Mexico: "MX",
  Colombia: "CO",
  Venezuela: "VE",
  Argentina: "AR",
  Chile: "CL",
  Poland: "PL",
  Italy: "IT",
  Spain: "ES",
  "North Korea": "KP",
  "South Korea": "KR",
  Taiwan: "TW",
  Vietnam: "VN",
  Bangladesh: "BD",
  Mali: "ML",
  "Burkina Faso": "BF",
  Niger: "NE",
  "Democratic Republic of Congo": "CD",
  Cameroon: "CM",
  Chad: "TD",
  "Central African Republic": "CF",
  Mozambique: "MZ",
};

function getCountryCode(country: string): string {
  return COUNTRY_TO_CODE[country] ?? "XX";
}

function scoreToLevel(score: number): CountryInstabilityScore["level"] {
  if (score >= 80) return "CHAOS";
  if (score >= 60) return "CRITIQUE";
  if (score >= 40) return "INSTABLE";
  if (score >= 20) return "ATTENTION";
  return "STABLE";
}

const DISASTER_SEVERITY_VALUE: Record<NaturalDisaster["severity"], number> = {
  red: 40,
  orange: 20,
  green: 5,
};

const OUTAGE_SEVERITY_VALUE: Record<InternetOutage["severity"], number> = {
  major: 50,
  moderate: 25,
  minor: 10,
};

// ─── Main function ─────────────────────────────────────────

export function computeInstabilityIndex(data: {
  conflicts?: ConflictEvent[];
  disasters?: NaturalDisaster[];
  cyberThreats?: CyberThreat[];
  outages?: InternetOutage[];
}): CountryInstabilityScore[] {
  const now = new Date().toISOString();
  const byCountry = new Map<
    string,
    {
      conflictScore: number;
      disasterScore: number;
      cyberScore: number;
      connectivityScore: number;
      eventCount: number;
      fatalities: number;
    }
  >();

  function getOrCreate(country: string) {
    if (!byCountry.has(country)) {
      byCountry.set(country, {
        conflictScore: 0,
        disasterScore: 0,
        cyberScore: 0,
        connectivityScore: 0,
        eventCount: 0,
        fatalities: 0,
      });
    }
    return byCountry.get(country)!;
  }

  // 1. Conflits par pays
  for (const ev of data.conflicts ?? []) {
    const c = getOrCreate(ev.country);
    c.eventCount += 1;
    c.fatalities += ev.fatalities;
  }
  for (const [country, c] of byCountry.entries()) {
    c.conflictScore = Math.min(
      100,
      c.eventCount * 3 + c.fatalities * 0.5
    );
  }

  // 2. Disasters par pays
  for (const d of data.disasters ?? []) {
    const c = getOrCreate(d.country);
    c.disasterScore += DISASTER_SEVERITY_VALUE[d.severity] ?? 5;
  }
  for (const [, c] of byCountry) {
    c.disasterScore = Math.min(100, c.disasterScore);
  }

  // 3. Cyber threats par pays (country non null)
  const cyberByCountry = new Map<string, number>();
  for (const t of data.cyberThreats ?? []) {
    if (t.country) {
      cyberByCountry.set(t.country, (cyberByCountry.get(t.country) ?? 0) + 1);
    }
  }
  for (const [country, count] of cyberByCountry) {
    const c = getOrCreate(country);
    c.cyberScore = Math.min(100, count * 5);
  }

  // 4. Outages par pays
  for (const o of data.outages ?? []) {
    const c = getOrCreate(o.country);
    c.connectivityScore += OUTAGE_SEVERITY_VALUE[o.severity] ?? 10;
  }
  for (const [, c] of byCountry) {
    c.connectivityScore = Math.min(100, c.connectivityScore);
  }

  // 5. Score global + level + trend
  const results: CountryInstabilityScore[] = [];

  for (const [country, c] of byCountry.entries()) {
    const globalScore =
      c.conflictScore * 0.45 +
      c.disasterScore * 0.2 +
      c.cyberScore * 0.15 +
      c.connectivityScore * 0.2;

    if (globalScore <= 5) continue;

    results.push({
      country,
      countryCode: getCountryCode(country),
      score: Math.round(globalScore * 100) / 100,
      level: scoreToLevel(globalScore),
      components: {
        conflictScore: Math.round(c.conflictScore * 100) / 100,
        disasterScore: Math.round(c.disasterScore * 100) / 100,
        cyberScore: Math.round(c.cyberScore * 100) / 100,
        connectivityScore: Math.round(c.connectivityScore * 100) / 100,
      },
      recentEvents: c.eventCount,
      fatalities: c.fatalities,
      trend: "stable",
      lastUpdated: now,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}
