import { CyberThreat } from "@/types";
import { withCircuitBreaker } from "./circuit-breaker";
import { getCached } from "./cache";

const FEODO_URL = "https://feodotracker.abuse.ch/downloads/ipblocklist.txt";
const URLHAUS_URL = "https://urlhaus.abuse.ch/downloads/csv_recent/";

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

function isValidIp(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return false;
  return IP_REGEX.test(trimmed);
}

export async function fetchFeodoTrackerIOCs(): Promise<CyberThreat[]> {
  return withCircuitBreaker("feodo-tracker", async () => {
    const res = await fetch(FEODO_URL);
    if (!res.ok) throw new Error(`Feodo fetch failed: ${res.status}`);
    const text = await res.text();
    const now = new Date().toISOString().split("T")[0];
    return text
      .split("\n")
      .filter(isValidIp)
      .map((line, i) => ({
        id: `feodo-${line.trim()}-${i}`,
        iocType: "ip" as const,
        iocValue: line.trim(),
        threatCategory: "botnet" as const,
        confidence: 90,
        source: "feodo_tracker" as const,
        firstSeen: now,
        lastSeen: now,
        lat: null,
        lng: null,
        country: null,
        tags: [],
        reportCount: 1,
      }));
  });
}

type ThreatMapping = Record<string, "botnet" | "malware" | "phishing" | "c2" | "ransomware" | "exploit" | "scanner">;
const THREAT_MAP: ThreatMapping = {
  malware_download: "malware",
  malware: "malware",
  phishing: "phishing",
  c2: "c2",
  ransomware: "ransomware",
  exploit: "exploit",
  scanner: "scanner",
  botnet: "botnet",
};

function mapThreatCategory(threat: string): "botnet" | "malware" | "phishing" | "c2" | "ransomware" | "exploit" | "scanner" {
  const key = (threat || "").toLowerCase().replace(/\s+/g, "_");
  return THREAT_MAP[key] ?? "malware";
}

export async function fetchURLhausIOCs(): Promise<CyberThreat[]> {
  return withCircuitBreaker("urlhaus", async () => {
    const res = await fetch(URLHAUS_URL);
    if (!res.ok) throw new Error(`URLhaus fetch failed: ${res.status}`);
    const text = await res.text();
    const now = new Date().toISOString().split("T")[0];
    const lines = text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    const csvParse = (line: string): string[] => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') inQuotes = !inQuotes;
        else if (c === "," && !inQuotes) {
          result.push(current);
          current = "";
        } else current += c;
      }
      result.push(current);
      return result;
    };

    const threats: CyberThreat[] = [];
    const urlIdx = 2;
    const threatIdx = 5;
    for (let i = 0; i < Math.min(lines.length, 500); i++) {
      const cols = csvParse(lines[i]);
      const url = cols[urlIdx]?.replace(/^"|"$/g, "").trim() || "";
      const threat = cols[threatIdx]?.replace(/^"|"$/g, "").trim() || "";
      if (!url) continue;
      threats.push({
        id: `urlhaus-${i}-${url.slice(0, 50).replace(/[^a-zA-Z0-9]/g, "_")}`,
        iocType: "url",
        iocValue: url,
        threatCategory: mapThreatCategory(threat),
        confidence: 80,
        source: "urlhaus",
        firstSeen: now,
        lastSeen: now,
        lat: null,
        lng: null,
        country: null,
        tags: [],
        reportCount: 1,
      });
    }
    return threats;
  });
}

const URL_IP_REGEX = /^https?:\/\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/;

function extractIPFromURL(url: string): string | null {
  const m = url.match(URL_IP_REGEX);
  return m ? m[1] : null;
}

async function geolocateIPs(threats: CyberThreat[]): Promise<CyberThreat[]> {
  const ipMap = new Map<string, number[]>();

  threats.forEach((t, i) => {
    if (t.lat != null) return;
    let ip: string | null = null;
    if (t.iocType === "ip") ip = t.iocValue;
    else if (t.iocType === "url") ip = extractIPFromURL(t.iocValue);
    if (ip) {
      if (!ipMap.has(ip)) ipMap.set(ip, []);
      ipMap.get(ip)!.push(i);
    }
  });

  const uniqueIPs = [...ipMap.keys()].slice(0, 100);
  if (uniqueIPs.length === 0) return threats;

  try {
    const res = await fetch("http://ip-api.com/batch?fields=query,lat,lon,countryCode,status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(uniqueIPs),
    });
    if (!res.ok) {
      console.warn(`GeoIP batch lookup failed: ${res.status}`);
      return threats;
    }
    const results: { query: string; lat: number; lon: number; countryCode: string; status: string }[] = await res.json();

    const geoResults = new Map<string, { lat: number; lon: number; countryCode: string }>();
    for (const r of results) {
      if (r.status === "success") {
        geoResults.set(r.query, r);
      }
    }

    const geolocated = [...threats];
    for (const [ip, indices] of ipMap) {
      const geo = geoResults.get(ip);
      if (!geo) continue;
      for (const idx of indices) {
        geolocated[idx] = { ...geolocated[idx], lat: geo.lat, lng: geo.lon, country: geo.countryCode };
      }
    }

    const count = geolocated.filter((t) => t.lat != null).length;
    console.log(`GeoIP: ${count}/${threats.length} menaces géolocalisées (${uniqueIPs.length} IPs uniques)`);
    return geolocated;
  } catch (err) {
    console.warn("GeoIP batch lookup error:", err);
    return threats;
  }
}

export async function fetchAllCyberThreats(): Promise<CyberThreat[]> {
  return getCached(
    "cyber-threats",
    async () => {
      const [feodo, urlhaus] = await Promise.allSettled([
        fetchFeodoTrackerIOCs(),
        fetchURLhausIOCs(),
      ]);
      const results: CyberThreat[] = [];
      if (feodo.status === "fulfilled") {
        results.push(...feodo.value);
        console.log(`Feodo Tracker: ${feodo.value.length} IOCs`);
      } else {
        console.error("Feodo Tracker error:", feodo.reason);
      }
      if (urlhaus.status === "fulfilled") {
        results.push(...urlhaus.value);
        console.log(`URLhaus: ${urlhaus.value.length} IOCs`);
      } else {
        console.error("URLhaus error:", urlhaus.reason);
      }

      if (results.length === 0) {
        throw new Error("Aucune donnée de cyber-menace récupérée (Feodo + URLhaus)");
      }

      return geolocateIPs(results);
    },
    { ttlSeconds: 1800 }
  );
}
