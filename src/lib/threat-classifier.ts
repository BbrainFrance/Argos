import type {
  ConflictEvent,
  IntelFeedItem,
  NaturalDisaster,
  CyberThreat,
  InternetOutage,
} from "@/types";

// ─── Types ─────────────────────────────────────────────────

export type ThreatLevel =
  | "NEGLIGEABLE"
  | "FAIBLE"
  | "MODERE"
  | "ELEVE"
  | "CRITIQUE";

export interface ClassifiedThreat {
  id: string;
  title: string;
  description: string;
  level: ThreatLevel;
  score: number; // 0-100
  category:
    | "military"
    | "terrorism"
    | "cyber"
    | "natural"
    | "political"
    | "economic"
    | "nuclear"
    | "infrastructure";
  sources: string[];
  countries: string[];
  lat: number | null;
  lng: number | null;
  timestamp: string;
  keywords: string[];
  entities: string[];
}

// ─── Keyword dictionaries ───────────────────────────────────

const THREAT_KEYWORDS: Record<
  string,
  { weight: number; category: ClassifiedThreat["category"] }
> = {
  // Militaire
  missile: { weight: 90, category: "military" },
  frappe: { weight: 85, category: "military" },
  strike: { weight: 85, category: "military" },
  invasion: { weight: 95, category: "military" },
  troops: { weight: 70, category: "military" },
  deployment: { weight: 65, category: "military" },
  nuclear: { weight: 95, category: "nuclear" },
  warhead: { weight: 98, category: "nuclear" },
  enrichment: { weight: 90, category: "nuclear" },
  icbm: { weight: 98, category: "military" },
  submarine: { weight: 60, category: "military" },
  "aircraft carrier": { weight: 65, category: "military" },
  mobilization: { weight: 80, category: "military" },
  escalation: { weight: 75, category: "military" },
  ceasefire: { weight: 40, category: "military" },
  arms: { weight: 60, category: "military" },
  // Terrorisme
  attack: { weight: 70, category: "terrorism" },
  bombing: { weight: 85, category: "terrorism" },
  explosion: { weight: 75, category: "terrorism" },
  hostage: { weight: 90, category: "terrorism" },
  kidnapping: { weight: 80, category: "terrorism" },
  assassination: { weight: 90, category: "terrorism" },
  extremist: { weight: 75, category: "terrorism" },
  jihad: { weight: 85, category: "terrorism" },
  insurgent: { weight: 70, category: "terrorism" },
  ied: { weight: 85, category: "terrorism" },
  // Cyber
  ransomware: { weight: 80, category: "cyber" },
  malware: { weight: 70, category: "cyber" },
  breach: { weight: 75, category: "cyber" },
  ddos: { weight: 65, category: "cyber" },
  "zero-day": { weight: 85, category: "cyber" },
  cyberattack: { weight: 80, category: "cyber" },
  hack: { weight: 65, category: "cyber" },
  phishing: { weight: 55, category: "cyber" },
  // Politique
  coup: { weight: 90, category: "political" },
  sanctions: { weight: 60, category: "economic" },
  embargo: { weight: 65, category: "economic" },
  protest: { weight: 40, category: "political" },
  revolution: { weight: 80, category: "political" },
  "martial law": { weight: 90, category: "political" },
  election: { weight: 30, category: "political" },
  // Infrastructure
  pipeline: { weight: 50, category: "infrastructure" },
  sabotage: { weight: 85, category: "infrastructure" },
  blackout: { weight: 70, category: "infrastructure" },
  outage: { weight: 55, category: "infrastructure" },
};

const EVENT_TYPE_BASE_SCORE: Record<ConflictEvent["eventType"], number> = {
  battles: 70,
  explosions: 80,
  violence_against_civilians: 85,
  riots: 50,
  protests: 35,
  strategic_developments: 45,
};

// ─── Keyword scoring ────────────────────────────────────────

function scoreByKeywords(text: string): {
  score: number;
  keywords: string[];
  category: ClassifiedThreat["category"];
} {
  const normalized = text.toLowerCase();
  let maxScore = 0;
  let maxCategory: ClassifiedThreat["category"] = "political";
  const foundKeywords: string[] = [];

  for (const [keyword, { weight, category }] of Object.entries(THREAT_KEYWORDS)) {
    if (normalized.includes(keyword)) {
      foundKeywords.push(keyword);
      if (weight > maxScore) {
        maxScore = weight;
        maxCategory = category;
      }
    }
  }

  return {
    score: foundKeywords.length > 0 ? maxScore : 10,
    keywords: foundKeywords,
    category: foundKeywords.length > 0 ? maxCategory : "political",
  };
}

function scoreToLevel(score: number): ThreatLevel {
  if (score >= 90) return "CRITIQUE";
  if (score >= 70) return "ELEVE";
  if (score >= 50) return "MODERE";
  if (score >= 30) return "FAIBLE";
  return "NEGLIGEABLE";
}

function extractEntities(text: string): string[] {
  // Extraction simple : actor1, actor2 ou entités dans notes
  const entities: string[] = [];
  const words = text.split(/\s+/).filter((w) => w.length > 2);
  for (const w of words) {
    if (/^[A-Z][a-z]+/.test(w) || /^[A-Z]{2,}$/.test(w)) {
      entities.push(w);
    }
  }
  return [...new Set(entities)].slice(0, 10);
}

// ─── Classifiers ────────────────────────────────────────────

export function classifyConflictEvents(
  events: ConflictEvent[]
): ClassifiedThreat[] {
  return events.map((ev) => {
    let baseScore = EVENT_TYPE_BASE_SCORE[ev.eventType] ?? 50;
    const fatalityBonus = Math.min(20, ev.fatalities * 2);
    baseScore += fatalityBonus;

    const kw = scoreByKeywords(ev.notes);
    const finalScore = Math.min(100, Math.max(baseScore, kw.score));

    return {
      id: ev.id,
      title: `${ev.eventType} - ${ev.country}`,
      description: ev.notes || `${ev.eventType} in ${ev.region}`,
      level: scoreToLevel(finalScore),
      score: finalScore,
      category: kw.category,
      sources: [ev.source],
      countries: [ev.country],
      lat: ev.lat,
      lng: ev.lng,
      timestamp: new Date(ev.eventDate).toISOString(),
      keywords: kw.keywords,
      entities: extractEntities(
        [ev.actor1, ev.actor2, ev.notes].filter(Boolean).join(" ")
      ),
    };
  });
}

export function classifyIntelItems(
  items: IntelFeedItem[]
): ClassifiedThreat[] {
  return items.map((item) => {
    const text = `${item.title} ${item.summary}`;
    const kw = scoreByKeywords(text);

    return {
      id: item.id,
      title: item.title,
      description: item.summary,
      level: scoreToLevel(kw.score),
      score: kw.score,
      category: kw.category,
      sources: [item.feedName],
      countries: item.country ? [item.country] : [],
      lat: item.lat,
      lng: item.lng,
      timestamp: item.pubDate,
      keywords: kw.keywords,
      entities: extractEntities(text),
    };
  });
}

export function classifyCyberThreats(threats: CyberThreat[]): ClassifiedThreat[] {
  const byCategory = new Map<string, CyberThreat[]>();
  for (const t of threats) {
    const key = t.threatCategory;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(t);
  }

  return Array.from(byCategory.entries()).map(([category, items]) => {
    const count = items.length;
    let score: number;
    if (count > 100) score = 90;
    else if (count > 50) score = 75;
    else if (count > 20) score = 60;
    else if (count > 5) score = 45;
    else score = 30;

    const first = items[0]!;
    const countries = [...new Set(items.map((t) => t.country).filter(Boolean))] as string[];

    return {
      id: `cyber-${category}`,
      title: `Cyber: ${category}`,
      description: `${count} threats in category ${category}`,
      level: scoreToLevel(score),
      score,
      category: "cyber",
      sources: [...new Set(items.map((t) => t.source))],
      countries,
      lat: first.lat,
      lng: first.lng,
      timestamp: first.lastSeen,
      keywords: [category],
      entities: [],
    };
  });
}

export function classifyDisasters(
  disasters: NaturalDisaster[]
): ClassifiedThreat[] {
  const severityScore: Record<NaturalDisaster["severity"], number> = {
    red: 85,
    orange: 60,
    green: 30,
  };

  return disasters.map((d) => {
    const score = severityScore[d.severity] ?? 30;
    return {
      id: d.id,
      title: d.title,
      description: d.description,
      level: scoreToLevel(score),
      score,
      category: "natural",
      sources: [d.source],
      countries: [d.country],
      lat: d.lat,
      lng: d.lng,
      timestamp: d.fromDate,
      keywords: [d.eventType],
      entities: extractEntities(d.title),
    };
  });
}

function classifyOutages(outages: InternetOutage[]): ClassifiedThreat[] {
  const severityScore: Record<InternetOutage["severity"], number> = {
    major: 70,
    moderate: 50,
    minor: 30,
  };

  return outages.map((o) => {
    const score = severityScore[o.severity] ?? 30;
    return {
      id: o.id,
      title: `Internet outage - ${o.country}`,
      description: `${o.severity} outage in ${o.region || o.country}`,
      level: scoreToLevel(score),
      score,
      category: "infrastructure",
      sources: [o.source],
      countries: [o.country],
      lat: o.lat,
      lng: o.lng,
      timestamp: o.startTime,
      keywords: ["outage"],
      entities: [],
    };
  });
}

// ─── Aggregate ──────────────────────────────────────────────

export function classifyAllThreats(data: {
  conflicts?: ConflictEvent[];
  intelItems?: IntelFeedItem[];
  cyberThreats?: CyberThreat[];
  disasters?: NaturalDisaster[];
  outages?: InternetOutage[];
}): ClassifiedThreat[] {
  const all: ClassifiedThreat[] = [];

  if (data.conflicts?.length) {
    all.push(...classifyConflictEvents(data.conflicts));
  }
  if (data.intelItems?.length) {
    all.push(...classifyIntelItems(data.intelItems));
  }
  if (data.cyberThreats?.length) {
    all.push(...classifyCyberThreats(data.cyberThreats));
  }
  if (data.disasters?.length) {
    all.push(...classifyDisasters(data.disasters));
  }
  if (data.outages?.length) {
    all.push(...classifyOutages(data.outages));
  }

  return all
    .sort((a, b) => b.score - a.score)
    .slice(0, 200);
}
