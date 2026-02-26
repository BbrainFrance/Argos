import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const missions = await prisma.mission.findMany({
      include: { waypoints: { orderBy: { sortOrder: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ missions });
  } catch (e) {
    return NextResponse.json({ missions: [], error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mission = await prisma.mission.create({
      data: {
        name: body.name,
        color: body.color ?? "#00ffaa",
        createdBy: body.createdBy ?? "operator",
        waypoints: {
          create: (body.waypoints ?? []).map((wp: { lat: number; lng: number; label: string; type: string }, i: number) => ({
            lat: wp.lat,
            lng: wp.lng,
            label: wp.label,
            type: wp.type,
            sortOrder: i,
          })),
        },
      },
      include: { waypoints: { orderBy: { sortOrder: "asc" } } },
    });
    return NextResponse.json({ mission });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
