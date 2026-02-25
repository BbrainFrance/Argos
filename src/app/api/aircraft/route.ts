import { NextResponse } from "next/server";
import { fetchAircraftFrance, computeStats } from "@/lib/opensky";
import { generateAlerts } from "@/lib/alerts";

export const revalidate = 10;

export async function GET() {
  const aircraft = await fetchAircraftFrance();
  const stats = computeStats(aircraft);
  const alerts = generateAlerts(aircraft);

  return NextResponse.json({
    aircraft,
    stats,
    alerts,
    timestamp: new Date().toISOString(),
  });
}
