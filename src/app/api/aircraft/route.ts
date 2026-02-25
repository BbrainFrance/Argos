import { NextResponse } from "next/server";
import { fetchAircraftFrance } from "@/lib/opensky";

export const revalidate = 10;
export const dynamic = "force-dynamic";

export async function GET() {
  const aircraft = await fetchAircraftFrance();

  return NextResponse.json({
    aircraft,
    timestamp: new Date().toISOString(),
    count: aircraft.length,
  });
}
