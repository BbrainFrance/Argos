import { NextResponse } from "next/server";
import { detectConvergence } from "@/lib/geo-convergence";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const zones = detectConvergence(data);
    return NextResponse.json({ zones, count: zones.length, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("Convergence detection error:", err);
    return NextResponse.json({ zones: [], error: "Failed to detect convergence" }, { status: 500 });
  }
}
