import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const entityId = searchParams.get("entityId");
  const hours = parseInt(searchParams.get("hours") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "500");

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const where: Record<string, unknown> = {
    timestamp: { gte: since },
  };
  if (entityId) {
    where.entityId = entityId;
  }

  const positions = await prisma.position.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: limit,
    select: {
      id: true,
      entityId: true,
      lat: true,
      lng: true,
      alt: true,
      speed: true,
      heading: true,
      timestamp: true,
    },
  });

  return NextResponse.json({ positions, count: positions.length });
}
