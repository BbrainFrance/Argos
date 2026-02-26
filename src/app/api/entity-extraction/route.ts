import { NextResponse } from "next/server";
import { extractEntities } from "@/lib/entity-extractor";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { texts } = await request.json();
    if (!Array.isArray(texts)) {
      return NextResponse.json({ error: "texts must be an array" }, { status: 400 });
    }
    const result = extractEntities(texts);
    return NextResponse.json({ ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("Entity extraction error:", err);
    return NextResponse.json({ entities: [], error: "Failed to extract entities" }, { status: 500 });
  }
}
