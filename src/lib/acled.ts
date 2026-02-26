/**
 * Conflict Events — Source: GDELT (Global Database of Events, Language and Tone)
 * Données temps réel, mises à jour toutes les 15min, gratuites, sans auth.
 * Fallback ACLED si accès API disponible.
 * https://www.gdeltproject.org/
 */

import type { ConflictEvent } from "@/types";
import { withCircuitBreaker } from "./circuit-breaker";
import { getCached } from "./cache";
import { createGunzip } from "zlib";
import { Readable } from "stream";

const GDELT_LASTUPDATE = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt";

const CAMEO_ROOT_TO_TYPE: Record<string, ConflictEvent["eventType"]> = {
  "18": "violence_against_civilians",
  "19": "battles",
  "20": "battles",
  "17": "protests",
  "14": "protests",
  "15": "explosions",
  "16": "explosions",
  "13": "riots",
};

const CAMEO_TO_SUBTYPE: Record<string, string> = {
  "180": "Use unconventional violence",
  "181": "Abduction",
  "182": "Sexual assault",
  "183": "Torture",
  "184": "Kill",
  "185": "Mass killing",
  "190": "Use conventional military force",
  "191": "Impose blockade",
  "192": "Occupy territory",
  "193": "Fight with small arms",
  "194": "Fight with artillery",
  "195": "Employ aerial weapons",
  "196": "Violate ceasefire",
  "200": "Use unconventional mass violence",
  "201": "Engage in mass expulsion",
  "202": "Engage in ethnic cleansing",
  "203": "Use weapons of mass destruction",
  "170": "Coerce",
  "171": "Seize or damage property",
  "172": "Impose curfew",
  "173": "Arrest/detain",
  "174": "Use teargas",
  "175": "Shoot at",
  "140": "Protest violently",
  "141": "Demonstrate or rally",
  "145": "Protest with riot",
  "150": "Exhibit military posture",
  "152": "Threaten with military force",
  "153": "Mobilize armed forces",
  "160": "Reduce relations",
};

function toConflictEventType(rootCode: string): ConflictEvent["eventType"] {
  return CAMEO_ROOT_TO_TYPE[rootCode] ?? "strategic_developments";
}

async function decompressGzip(buffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const gunzip = createGunzip();
    const chunks: Buffer[] = [];
    gunzip.on("data", (chunk) => chunks.push(chunk));
    gunzip.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    gunzip.on("error", reject);
    Readable.from(Buffer.from(buffer)).pipe(gunzip);
  });
}

async function fetchGDELTEvents(params: {
  limit?: number;
}): Promise<ConflictEvent[]> {
  const updateRes = await fetch(GDELT_LASTUPDATE);
  if (!updateRes.ok) throw new Error(`GDELT lastupdate failed: ${updateRes.status}`);
  const updateText = await updateRes.text();

  const exportLine = updateText.split("\n").find((l) => l.includes(".export.CSV.zip"));
  if (!exportLine) throw new Error("GDELT: no export CSV URL found");

  const csvUrl = exportLine.trim().split(/\s+/).pop();
  if (!csvUrl) throw new Error("GDELT: cannot parse export URL");

  console.log(`GDELT: downloading ${csvUrl}`);
  const csvRes = await fetch(csvUrl);
  if (!csvRes.ok) throw new Error(`GDELT CSV fetch failed: ${csvRes.status}`);

  const zipBuffer = await csvRes.arrayBuffer();

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(zipBuffer);
  const csvFileName = Object.keys(zip.files)[0];
  if (!csvFileName) throw new Error("GDELT: empty zip");
  const csvText = await zip.files[csvFileName].async("string");

  const limit = params.limit ?? 300;
  const lines = csvText.split("\n").filter((l) => l.trim());
  const events: ConflictEvent[] = [];

  for (const line of lines) {
    if (events.length >= limit) break;

    const cols = line.split("\t");
    if (cols.length < 58) continue;

    const isRootEvent = cols[25]?.trim();
    if (isRootEvent !== "1") continue;

    const rootCode = cols[28];
    const quadClass = parseInt(cols[29], 10) || 0;
    const goldstein = parseFloat(cols[30]) || 0;
    const lat = parseFloat(cols[56]) || 0;
    const lng = parseFloat(cols[57]) || 0;

    if (lat === 0 || lng === 0) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    if (quadClass < 3 && goldstein >= -2) continue;

    const actor1CountryCode = (cols[7] || "").trim().toUpperCase();
    const actor2CountryCode = (cols[17] || "").trim().toUpperCase();
    const actionGeoCountry = (cols[53] || "").trim().toUpperCase();

    if (actionGeoCountry && actor1CountryCode && actor2CountryCode) {
      const actorCountries = new Set([actor1CountryCode, actor2CountryCode].filter(Boolean));
      if (
        actorCountries.size > 0 &&
        !actorCountries.has(actionGeoCountry) &&
        !actorCountries.has("")
      ) {
        continue;
      }
    }

    const eventCode = cols[26] || "";
    const eventBaseCode = cols[27] || "";
    const eventType = toConflictEventType(rootCode);
    const subType = CAMEO_TO_SUBTYPE[eventBaseCode] ?? CAMEO_TO_SUBTYPE[eventCode] ?? "";
    const actor1 = cols[6] || cols[5] || "Unknown";
    const actor2 = cols[16] || cols[15] || null;
    const country = actionGeoCountry || actor1CountryCode || "";
    const location = cols[52] || "";
    const numMentions = parseInt(cols[31], 10) || 1;
    const eventDate = cols[1] || "";
    const formatted = eventDate.length === 8
      ? `${eventDate.slice(0, 4)}-${eventDate.slice(4, 6)}-${eventDate.slice(6, 8)}`
      : new Date().toISOString().slice(0, 10);

    const fatalities = goldstein <= -8 ? Math.ceil(Math.abs(goldstein)) : 0;

    events.push({
      id: `gdelt-${cols[0]}`,
      eventDate: formatted,
      eventType,
      subEventType: subType,
      actor1,
      actor2,
      country,
      region: location,
      lat,
      lng,
      fatalities,
      notes: `${actor1}${actor2 ? ` vs ${actor2}` : ""} — ${subType || eventType} (Goldstein: ${goldstein.toFixed(1)})`,
      source: `GDELT (${numMentions} sources)`,
      sourceScale: "",
      timestamp: Date.now(),
    });
  }

  console.log(`GDELT: ${events.length} conflict events extracted`);
  return events;
}

/* ── Public export ── */

export async function fetchConflictEvents(params?: {
  country?: string;
  limit?: number;
  days?: number;
}): Promise<ConflictEvent[]> {
  const cacheKey = `conflicts:${params?.country ?? "all"}:${params?.limit ?? 300}`;
  return getCached(
    cacheKey,
    () =>
      withCircuitBreaker("gdelt", () =>
        fetchGDELTEvents({ limit: params?.limit ?? 300 })
      ),
    { ttlSeconds: 900 }
  );
}
