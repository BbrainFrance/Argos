import { NextResponse } from "next/server";
import { fetchAllCyberThreats } from "@/lib/cyber-threats";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const threats = await fetchAllCyberThreats();
    return NextResponse.json({ threats, count: threats.length, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Cyber threats API error:", msg);
    return NextResponse.json({ threats: [], error: msg }, { status: 500 });
  }
}
