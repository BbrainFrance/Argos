import { NextResponse } from "next/server";
import { getMilitaryBases } from "@/lib/military-bases";

export async function GET() {
  const bases = getMilitaryBases();
  return NextResponse.json({ bases, count: bases.length });
}
