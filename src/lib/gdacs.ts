/**
 * GDACS — Global Disaster Alert and Coordination System
 * Récupération des catastrophes naturelles via le flux RSS.
 */

import type { NaturalDisaster } from "@/types";
import { withCircuitBreaker } from "./circuit-breaker";
import { getCached } from "./cache";

const EVENT_TYPE_MAP: Record<string, NaturalDisaster["eventType"]> = {
  EQ: "earthquake",
  FL: "flood",
  TC: "cyclone",
  VO: "volcano",
  DR: "drought",
  WF: "wildfire",
  tsunami: "tsunami",
};

const SEVERITY_MAP: Record<string, NaturalDisaster["severity"]> = {
  Green: "green",
  green: "green",
  Orange: "orange",
  orange: "orange",
  Red: "red",
  red: "red",
};

function extractTag(xml: string, tag: string, ns?: string): string {
  const prefix = ns ? `${ns}:` : "";
  const fullTag = prefix + tag;
  const re = new RegExp(`<${fullTag}[^>]*>([^<]*)</${fullTag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function extractTagWithAttr(xml: string, tag: string, attr: string, ns?: string): string {
  const prefix = ns ? `${ns}:` : "";
  const fullTag = prefix + tag;
  const re = new RegExp(`<${fullTag}[^>]*${attr}=["']([^"']+)["'][^>]*>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function extractGeoPoint(xml: string): { lat: number; lng: number } {
  const latRe = /<geo:lat>([^<]+)<\/geo:lat>/i;
  const longRe = /<geo:long>([^<]+)<\/geo:long>/i;
  const lat = parseFloat(xml.match(latRe)?.[1] ?? "0") || 0;
  const lng = parseFloat(xml.match(longRe)?.[1] ?? "0") || 0;
  return { lat, lng };
}

function parseAlertLevel(s: string): number {
  const n = parseFloat(s);
  if (!Number.isNaN(n)) return n;
  if (/green/i.test(s)) return 1;
  if (/orange/i.test(s)) return 2;
  if (/red/i.test(s)) return 3;
  return 1;
}

function parsePopulation(s: string, valueAttr?: string): number | null {
  if (valueAttr) {
    const n = parseInt(valueAttr, 10);
    if (!Number.isNaN(n)) return n;
  }
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:million|thousand|people|affected)/i);
  if (m) {
    let n = parseFloat(m[1]);
    if (/million/i.test(s)) n *= 1_000_000;
    else if (/thousand/i.test(s)) n *= 1_000;
    return Math.round(n);
  }
  return null;
}

async function fetchNaturalDisastersUpstream(): Promise<NaturalDisaster[]> {
  const url = "https://www.gdacs.org/xml/rss.xml";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GDACS RSS error: ${res.status}`);
  const xml = await res.text();

  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  const items: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    items.push(m[1]);
  }

  return items.map((item, index) => {
    const title = extractTag(item, "title") || "Unknown";
    const description = extractTag(item, "description") || "";
    const severityStr = extractTag(item, "alertlevel", "gdacs") || "Green";
    const severity = SEVERITY_MAP[severityStr] ?? "green";
    const alertLevel = parseAlertLevel(severityStr);
    const country = extractTag(item, "country", "gdacs") || "";
    const fromDate = extractTag(item, "fromdate", "gdacs") || "";
    const toDate = extractTag(item, "todate", "gdacs") || "";
    const populationStr = extractTag(item, "population", "gdacs");
    const populationValue = extractTagWithAttr(item, "population", "value", "gdacs");
    const population = parsePopulation(populationStr, populationValue);
    const { lat, lng } = extractGeoPoint(item);
    const eventTypeStr = extractTag(item, "eventtype", "gdacs") || "";
    const eventType = EVENT_TYPE_MAP[eventTypeStr] ?? "earthquake";
    const link = extractTag(item, "link") || null;

    return {
      id: `gdacs-${index}`,
      eventType,
      title,
      description,
      lat,
      lng,
      severity,
      alertLevel,
      country,
      fromDate,
      toDate: toDate || null,
      population,
      source: "GDACS",
      url: link,
    };
  });
}

export async function fetchNaturalDisasters(): Promise<NaturalDisaster[]> {
  return getCached(
    "gdacs:natural-disasters",
    () => withCircuitBreaker("gdacs", fetchNaturalDisastersUpstream),
    { ttlSeconds: 600 }
  );
}
