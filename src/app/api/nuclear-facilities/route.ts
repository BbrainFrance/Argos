import { NextResponse } from "next/server";
import { getNuclearFacilities } from "@/lib/nuclear-facilities";

export async function GET() {
  const facilities = getNuclearFacilities();
  return NextResponse.json({ facilities, count: facilities.length });
}
