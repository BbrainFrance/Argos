export interface ExtractedEntity {
  text: string;
  type:
    | "country"
    | "organization"
    | "person"
    | "military_unit"
    | "weapon_system"
    | "location";
  confidence: number;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  countries: string[];
  organizations: string[];
  persons: string[];
}

const COUNTRY_NAMES = [
  "France",
  "United States",
  "USA",
  "US",
  "Russia",
  "China",
  "United Kingdom",
  "UK",
  "Germany",
  "Japan",
  "India",
  "Brazil",
  "Ukraine",
  "Israel",
  "Palestine",
  "Iran",
  "Iraq",
  "Syria",
  "Turkey",
  "Saudi Arabia",
  "Egypt",
  "Nigeria",
  "South Africa",
  "Kenya",
  "Ethiopia",
  "Somalia",
  "Sudan",
  "South Sudan",
  "Libya",
  "Yemen",
  "Afghanistan",
  "Pakistan",
  "Myanmar",
  "Thailand",
  "Philippines",
  "Indonesia",
  "Australia",
  "Canada",
  "Mexico",
  "Colombia",
  "Venezuela",
  "Argentina",
  "Chile",
  "Poland",
  "Italy",
  "Spain",
  "North Korea",
  "South Korea",
  "Taiwan",
  "Vietnam",
  "Bangladesh",
  "Mali",
  "Burkina Faso",
  "Niger",
  "Congo",
  "Cameroon",
  "Chad",
  "Mozambique",
  "Algeria",
  "Morocco",
  "Tunisia",
  "Lebanon",
  "Jordan",
  "Qatar",
  "UAE",
  "Bahrain",
  "Kuwait",
  "Oman",
];

const ORGANIZATIONS = [
  "NATO",
  "OTAN",
  "ONU",
  "UN",
  "EU",
  "UE",
  "OSCE",
  "AIEA",
  "IAEA",
  "CIA",
  "NSA",
  "FBI",
  "MI6",
  "MI5",
  "DGSE",
  "DGSI",
  "BND",
  "Mossad",
  "FSB",
  "GRU",
  "SVR",
  "MSS",
  "Wagner",
  "Hezbollah",
  "Hamas",
  "ISIS",
  "ISIL",
  "Daesh",
  "Al-Qaeda",
  "Boko Haram",
  "Al-Shabaab",
  "Taliban",
  "Gazprom",
  "Rosatom",
  "CNNC",
  "KHNP",
  "EDF",
  "Areva",
  "Lockheed Martin",
  "Raytheon",
  "BAE Systems",
  "Thales",
  "Dassault",
  "MBDA",
  "Boeing",
  "Northrop Grumman",
  "General Dynamics",
  "SGDSN",
  "ANSSI",
  "COMCYBER",
];

const WEAPON_SYSTEMS = [
  "S-400",
  "S-300",
  "Patriot",
  "THAAD",
  "Iron Dome",
  "HIMARS",
  "Javelin",
  "Kalibr",
  "Iskander",
  "Kinzhal",
  "Zircon",
  "Tomahawk",
  "JASSM",
  "F-35",
  "F-16",
  "Su-35",
  "Su-57",
  "Rafale",
  "Eurofighter",
  "J-20",
  "M1 Abrams",
  "Leopard 2",
  "T-90",
  "Leclerc",
  "K2",
  "Virginia-class",
  "Yasen-class",
  "Suffren-class",
  "Astute-class",
  "Arleigh Burke",
  "Type 055",
  "FREMM",
  "Admiral Gorshkov",
  "B-2",
  "B-21",
  "Tu-160",
  "Tu-95",
];

const MILITARY_UNITS = [
  "CENTCOM",
  "EUCOM",
  "INDOPACOM",
  "AFRICOM",
  "82nd Airborne",
  "101st Airborne",
  "1st Armored",
  "3rd Infantry",
  "Marine Expeditionary",
  "SEAL Team",
  "Delta Force",
  "SAS",
  "SBS",
  "Foreign Legion",
  "Legion Etrangere",
  "COS",
  "1er RPIMa",
  "13e RDP",
  "Spetsnaz",
  "VDV",
];

const CONFIDENCE = {
  country: 0.95,
  organization: 0.9,
  weapon_system: 0.85,
  military_unit: 0.8,
} as const;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractFromText(text: string): ExtractedEntity[] {
  const seen = new Set<string>();
  const entities: ExtractedEntity[] = [];

  const add = (
    matches: RegExpMatchArray[],
    type: ExtractedEntity["type"],
    confidence: number
  ) => {
    for (const m of matches) {
      const key = `${m[0].toLowerCase()}_${type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entities.push({ text: m[0], type, confidence });
    }
  };

  for (const name of COUNTRY_NAMES) {
    const re = new RegExp(
      `\\b${escapeRegex(name)}\\b`,
      "gi"
    );
    const matches = [...text.matchAll(re)];
    add(matches, "country", CONFIDENCE.country);
  }

  for (const org of ORGANIZATIONS) {
    const re = new RegExp(`\\b${escapeRegex(org)}\\b`, "gi");
    const matches = [...text.matchAll(re)];
    add(matches, "organization", CONFIDENCE.organization);
  }

  for (const weapon of WEAPON_SYSTEMS) {
    const re = new RegExp(`\\b${escapeRegex(weapon)}\\b`, "gi");
    const matches = [...text.matchAll(re)];
    add(matches, "weapon_system", CONFIDENCE.weapon_system);
  }

  for (const unit of MILITARY_UNITS) {
    const re = new RegExp(`\\b${escapeRegex(unit)}\\b`, "gi");
    const matches = [...text.matchAll(re)];
    add(matches, "military_unit", CONFIDENCE.military_unit);
  }

  return entities;
}

export function extractEntities(texts: string[]): ExtractionResult {
  const allEntities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  for (const text of texts) {
    const extracted = extractFromText(text);
    for (const e of extracted) {
      const key = `${e.text.toLowerCase()}_${e.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allEntities.push(e);
    }
  }

  allEntities.sort((a, b) => b.confidence - a.confidence);

  return {
    entities: allEntities,
    countries: allEntities
      .filter((e) => e.type === "country")
      .map((e) => e.text)
      .filter((v, i, a) => a.indexOf(v) === i),
    organizations: allEntities
      .filter((e) => e.type === "organization")
      .map((e) => e.text)
      .filter((v, i, a) => a.indexOf(v) === i),
    persons: allEntities
      .filter((e) => e.type === "person")
      .map((e) => e.text)
      .filter((v, i, a) => a.indexOf(v) === i),
  };
}

export function extractFromIntelItems(
  items: { title: string; summary: string }[]
): ExtractionResult {
  const texts = items.map((item) => `${item.title} ${item.summary}`.trim());
  return extractEntities(texts);
}
