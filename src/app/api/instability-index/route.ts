import { NextResponse } from "next/server";
import { computeInstabilityIndex } from "@/lib/country-instability";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const index = computeInstabilityIndex(data);
    return NextResponse.json({ index, count: index.length, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("Instability index error:", err);
    return NextResponse.json({ index: [], error: "Failed to compute index" }, { status: 500 });
  }
}
