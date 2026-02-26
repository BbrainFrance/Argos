import { NextResponse } from "next/server";
import { generateAutoBriefing } from "@/lib/llm-chain";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const result = await generateAutoBriefing(data);
    return NextResponse.json({
      briefing: result.content,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Briefing generation error:", err);
    return NextResponse.json({ briefing: "", error: "Failed to generate briefing" }, { status: 500 });
  }
}
