import { NextResponse } from "next/server";

interface OverpassElement {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface TowerCache {
  data: unknown[];
  bbox: string;
  fetchedAt: number;
}

const g = globalThis as unknown as { __cellTowerCache?: TowerCache };
const CACHE_TTL = 30 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const latMin = searchParams.get("latMin") || "48.5";
  const latMax = searchParams.get("latMax") || "49.1";
  const lonMin = searchParams.get("lonMin") || "2.0";
  const lonMax = searchParams.get("lonMax") || "2.8";
  const limit = parseInt(searchParams.get("limit") || "500");

  const bboxKey = `${latMin},${lonMin},${latMax},${lonMax}`;

  if (g.__cellTowerCache && g.__cellTowerCache.bbox === bboxKey && Date.now() - g.__cellTowerCache.fetchedAt < CACHE_TTL) {
    return NextResponse.json({ towers: g.__cellTowerCache.data, count: g.__cellTowerCache.data.length, source: "cache" });
  }

  try {
    const query = `
[out:json][timeout:60];
(
  node["man_made"="mast"](${latMin},${lonMin},${latMax},${lonMax});
  node["man_made"="tower"]["tower:type"="communication"](${latMin},${lonMin},${latMax},${lonMax});
  node["telecom"~"."](${latMin},${lonMin},${latMax},${lonMax});
  node["communication:mobile_phone"="yes"](${latMin},${lonMin},${latMax},${lonMax});
);
out body ${limit};
`;

    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      cache: "no-store",
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`CellTower: Overpass API error ${res.status}: ${txt.slice(0, 300)}`);
      return NextResponse.json({ towers: [], error: `Overpass API error: ${res.status}` });
    }

    const data = await res.json();
    const elements: OverpassElement[] = data.elements || [];
    console.log(`CellTower: Overpass returned ${elements.length} antennas`);

    const towers = elements.map((el) => {
      const tags = el.tags || {};
      const operator = tags["operator"] || tags["communication:mobile_phone:operator"] || "";
      let radio = "LTE";
      if (tags["communication:gsm"] === "yes") radio = "GSM";
      if (tags["communication:umts"] === "yes") radio = "UMTS";
      if (tags["communication:lte"] === "yes") radio = "LTE";
      if (tags["communication:5g"] === "yes" || tags["communication:nr"] === "yes") radio = "5G";

      return {
        id: `cell-${el.id}`,
        lat: el.lat,
        lng: el.lon,
        mcc: 208,
        mnc: 0,
        lac: 0,
        cellId: el.id,
        radio,
        range: radio === "GSM" ? 2000 : radio === "UMTS" ? 1500 : radio === "5G" ? 500 : 1000,
        operator,
      };
    });

    g.__cellTowerCache = { data: towers, bbox: bboxKey, fetchedAt: Date.now() };
    return NextResponse.json({ towers, count: towers.length, source: "overpass" });
  } catch (err) {
    console.error("CellTower: fetch error:", err);
    return NextResponse.json({ towers: [], error: "Failed to fetch cell towers" });
  }
}
