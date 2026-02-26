import { NextResponse } from "next/server";
import { getPipelines } from "@/lib/pipelines";

export async function GET() {
  const pipelines = getPipelines();
  return NextResponse.json({ pipelines, count: pipelines.length });
}
