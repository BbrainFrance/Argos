import { NextResponse } from "next/server";
import { fetchFireHotspots } from "@/lib/firms";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "1");
  const source = searchParams.get("source") || "VIIRS_SNPP_NRT";

  try {
    const fires = await fetchFireHotspots({ days, source });
    return NextResponse.json({ fires, count: fires.length, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("FIRMS API error:", err);
    return NextResponse.json({ fires: [], error: "Failed to fetch fire data" }, { status: 500 });
  }
}
