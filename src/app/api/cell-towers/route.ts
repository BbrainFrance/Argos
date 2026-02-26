import { NextResponse } from "next/server";

const OPENCELLID_KEY = process.env.OPENCELLID_API_KEY;

interface CellRaw {
  cellid?: number;
  cell?: number;
  lat: number;
  lon: number;
  mcc: number;
  net?: number;
  mnc?: number;
  area?: number;
  lac?: number;
  radio?: string;
  range?: number;
  averageSignalStrength?: number;
}

export async function GET(request: Request) {
  if (!OPENCELLID_KEY) {
    console.warn("CellTower: OPENCELLID_API_KEY not set");
    return NextResponse.json({ towers: [], error: "OPENCELLID_API_KEY not configured" });
  }

  const { searchParams } = new URL(request.url);
  const latMin = searchParams.get("latMin") || "48.5";
  const latMax = searchParams.get("latMax") || "49.1";
  const lonMin = searchParams.get("lonMin") || "2.0";
  const lonMax = searchParams.get("lonMax") || "2.8";
  const limit = searchParams.get("limit") || "500";

  try {
    const url = `https://opencellid.org/cell/getInArea?key=${OPENCELLID_KEY}&BBOX=${latMin},${lonMin},${latMax},${lonMax}&format=json&limit=${limit}`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`CellTower: OpenCellID API error ${res.status}: ${text.slice(0, 200)}`);
      return NextResponse.json({ towers: [], error: `OpenCellID API error: ${res.status}` });
    }

    const data = await res.json();
    const cells: CellRaw[] = data.cells || data.cell || data.results || [];
    console.log(`CellTower: API returned ${cells.length} cells (keys: ${Object.keys(data).join(",")})`);

    const towers = cells.map((c) => ({
      id: `cell-${c.cellid ?? c.cell ?? Math.random().toString(36).slice(2)}`,
      lat: c.lat,
      lng: c.lon,
      mcc: c.mcc,
      mnc: c.net ?? c.mnc ?? 0,
      lac: c.area ?? c.lac ?? 0,
      cellId: c.cellid ?? c.cell ?? 0,
      radio: c.radio || "LTE",
      range: c.range || 1000,
    }));

    return NextResponse.json({ towers, count: towers.length });
  } catch (err) {
    console.error("CellTower: fetch error:", err);
    return NextResponse.json({ towers: [], error: "Failed to fetch cell towers" });
  }
}
