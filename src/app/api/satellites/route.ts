import { NextResponse } from "next/server";
import { getSatellitePositions } from "@/lib/satellites";
import type { SatelliteGroup } from "@/types";

const VALID_GROUPS: SatelliteGroup[] = ["gps", "galileo", "glonass", "iridium", "starlink", "military", "french-mil"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const groupsParam = searchParams.get("groups") || "gps,iridium,french-mil";
  const groups = groupsParam.split(",").filter((g): g is SatelliteGroup => VALID_GROUPS.includes(g as SatelliteGroup));

  if (groups.length === 0) {
    return NextResponse.json({ error: "No valid groups" }, { status: 400 });
  }

  try {
    const positions = await getSatellitePositions(groups);
    return NextResponse.json({ satellites: positions, count: positions.length, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("Satellite API error:", err);
    return NextResponse.json({ error: "Failed to fetch satellite data" }, { status: 500 });
  }
}
