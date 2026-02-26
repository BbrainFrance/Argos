import { NextResponse } from "next/server";
import { fetchIntelFeeds } from "@/lib/intel-feeds";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const categoriesParam = searchParams.get("categories");
  const categories = categoriesParam ? categoriesParam.split(",") : undefined;

  try {
    const items = await fetchIntelFeeds(categories);
    return NextResponse.json({ items, count: items.length, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("Intel feeds API error:", err);
    return NextResponse.json({ items: [], error: "Failed to fetch intel feeds" }, { status: 500 });
  }
}
