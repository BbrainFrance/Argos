import { NextResponse } from "next/server";
import { fetchConflictEvents } from "@/lib/acled";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") || undefined;
  const limit = parseInt(searchParams.get("limit") || "200");
  const days = parseInt(searchParams.get("days") || "30");

  try {
    const events = await fetchConflictEvents({ country, limit, days });
    return NextResponse.json({ events, count: events.length, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Conflicts API error:", msg);
    return NextResponse.json({ events: [], error: msg }, { status: 500 });
  }
}
