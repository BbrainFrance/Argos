import { NextResponse } from "next/server";
import { fetchNaturalDisasters } from "@/lib/gdacs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const disasters = await fetchNaturalDisasters();
    return NextResponse.json({ disasters, count: disasters.length, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("GDACS API error:", err);
    return NextResponse.json({ disasters: [], error: "Failed to fetch disaster data" }, { status: 500 });
  }
}
