import { NextResponse } from "next/server";

const OPENCELLID_KEY = process.env.OPENCELLID_API_KEY;

export async function GET(request: Request) {
  if (!OPENCELLID_KEY) {
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
    const res = await fetch(url, { next: { revalidate: 3600 } });

    if (!res.ok) {
      return NextResponse.json({ towers: [], error: `OpenCellID API error: ${res.status}` });
    }

    const data = await res.json();
    const cells = data.cells || [];

    const towers = cells.map((c: { cellid: number; lat: number; lon: number; mcc: number; net: number; area: number; radio: string; range: number; }) => ({
      id: `cell-${c.cellid}`,
      lat: c.lat,
      lng: c.lon,
      mcc: c.mcc,
      mnc: c.net,
      lac: c.area,
      cellId: c.cellid,
      radio: c.radio || "LTE",
      range: c.range || 1000,
    }));

    return NextResponse.json({ towers, count: towers.length });
  } catch (err) {
    console.error("Cell tower API error:", err);
    return NextResponse.json({ towers: [], error: "Failed to fetch cell towers" });
  }
}
