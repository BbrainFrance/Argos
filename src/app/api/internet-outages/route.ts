import { NextResponse } from "next/server";
import { fetchInternetOutages } from "@/lib/internet-outages";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const outages = await fetchInternetOutages();
    return NextResponse.json({ outages, count: outages.length, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Internet outages API error:", msg);
    return NextResponse.json({ outages: [], error: msg }, { status: 500 });
  }
}
