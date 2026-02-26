import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const tsParam = searchParams.get("timestamp");
  const entityId = searchParams.get("entityId");
  const windowMs = Number(searchParams.get("window") || "60000");

  if (entityId) {
    const since = new Date(Date.now() - 3600_000);
    const positions = await prisma.position.findMany({
      where: {
        entityId,
        timestamp: { gte: since },
      },
      orderBy: { timestamp: "asc" },
      take: 500,
    });

    return NextResponse.json({ positions });
  }

  if (!tsParam) {
    return NextResponse.json({ error: "timestamp or entityId required" }, { status: 400 });
  }

  const targetTime = new Date(Number(tsParam));
  const windowStart = new Date(targetTime.getTime() - windowMs);
  const windowEnd = new Date(targetTime.getTime() + windowMs);

  const positions = await prisma.position.findMany({
    where: {
      timestamp: { gte: windowStart, lte: windowEnd },
    },
    include: {
      entity: true,
    },
    orderBy: { timestamp: "desc" },
  });

  const entityMap = new Map<string, {
    entity: typeof positions[0]["entity"];
    position: typeof positions[0];
  }>();

  for (const pos of positions) {
    if (!entityMap.has(pos.entityId)) {
      entityMap.set(pos.entityId, { entity: pos.entity, position: pos });
    }
  }

  const entities = Array.from(entityMap.values()).map(({ entity, position }) => {
    const meta = entity.metadata as Record<string, string | number | boolean | null>;
    return {
      id: entity.id,
      type: entity.type === "AIRCRAFT" ? "aircraft" : "vessel",
      label: entity.label,
      position: {
        lat: position.lat,
        lng: position.lng,
        alt: position.alt ?? undefined,
        timestamp: position.timestamp.getTime(),
      },
      trail: [],
      tracked: entity.tracked,
      flagged: entity.flagged,
      metadata: meta,
    };
  });

  return NextResponse.json({
    entities,
    timestamp: targetTime.toISOString(),
    count: entities.length,
  });
}
