import { NextResponse } from "next/server";
import { classifyAllThreats } from "@/lib/threat-classifier";
import { getCached } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const threats = await getCached(
      "threat-assessment",
      () => Promise.resolve(classifyAllThreats(data)),
      { ttlSeconds: 120 }
    );
    return NextResponse.json({ threats, count: threats.length, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("Threat assessment error:", err);
    return NextResponse.json({ threats: [], error: "Failed to assess threats" }, { status: 500 });
  }
}
