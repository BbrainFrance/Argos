import { NextResponse } from "next/server";
import { getCached } from "@/lib/cache";

interface OverpassElement {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

const MAX_SPAN = 1.5;

const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

function clampBBox(latMin: number, latMax: number, lonMin: number, lonMax: number) {
  const clamp = (min: number, max: number) => {
    const span = max - min;
    if (span > MAX_SPAN) {
      const mid = (max + min) / 2;
      return [mid - MAX_SPAN / 2, mid + MAX_SPAN / 2];
    }
    return [min, max];
  };
  const [latMinC, latMaxC] = clamp(latMin, latMax);
  const [lonMinC, lonMaxC] = clamp(lonMin, lonMax);
  return { latMin: latMinC, latMax: latMaxC, lonMin: lonMinC, lonMax: lonMaxC };
}

async function queryOverpass(query: string): Promise<OverpassElement[]> {
  const body = `data=${encodeURIComponent(query)}`;
  for (const server of OVERPASS_SERVERS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(server, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        console.warn(`CellTower: ${server} returned ${res.status}, trying next...`);
        continue;
      }
      const data = await res.json();
      return data.elements || [];
    } catch (e) {
      console.warn(`CellTower: ${server} failed: ${(e as Error).message}, trying next...`);
    }
  }
  throw new Error("All Overpass servers failed");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawLatMin = parseFloat(searchParams.get("latMin") || "48.5");
  const rawLatMax = parseFloat(searchParams.get("latMax") || "49.1");
  const rawLonMin = parseFloat(searchParams.get("lonMin") || "2.0");
  const rawLonMax = parseFloat(searchParams.get("lonMax") || "2.8");
  const limit = parseInt(searchParams.get("limit") || "300");

  const { latMin, latMax, lonMin, lonMax } = clampBBox(rawLatMin, rawLatMax, rawLonMin, rawLonMax);
  const bboxKey = `${latMin.toFixed(2)},${lonMin.toFixed(2)},${latMax.toFixed(2)},${lonMax.toFixed(2)}`;

  try {
    const bbox = `${latMin.toFixed(4)},${lonMin.toFixed(4)},${latMax.toFixed(4)},${lonMax.toFixed(4)}`;
    const towers = await getCached(
      `cell-towers:${bboxKey}`,
      async () => {
        const query = [
          "[out:json][timeout:25];",
          "(",
          `  node["man_made"="mast"]["tower:type"="communication"](${bbox});`,
          `  node["man_made"="tower"]["tower:type"="communication"](${bbox});`,
          `  node["telecom"="antenna"](${bbox});`,
          ");",
          `out ${limit};`,
        ].join("\n");

        console.log(`CellTower: querying Overpass bbox=${bbox}`);
        const elements = await queryOverpass(query);
        console.log(`CellTower: Overpass returned ${elements.length} antennas`);

        return elements.map((el) => {
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
      },
      { ttlSeconds: 30 * 60, prefix: "argos" }
    );

    return NextResponse.json({ towers, count: towers.length, source: "overpass" });
  } catch (err) {
    console.error("CellTower: fetch error:", err);
    return NextResponse.json({ towers: [], error: (err as Error).message });
  }
}
