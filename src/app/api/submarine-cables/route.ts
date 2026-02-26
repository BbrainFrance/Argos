import { NextResponse } from "next/server";
import { fetchSubmarineCables } from "@/lib/submarine-cables";

export async function GET() {
  try {
    const cables = await fetchSubmarineCables();
    return NextResponse.json({ cables, count: cables.length, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("Submarine cables API error:", err);
    return NextResponse.json({ cables: [], error: "Failed to fetch cable data" }, { status: 500 });
  }
}
