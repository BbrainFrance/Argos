import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AlertSeverity, AlertCategory } from "@/generated/prisma/client";

const severityMap: Record<string, AlertSeverity> = {
  info: "INFO",
  warning: "WARNING",
  danger: "DANGER",
  critical: "CRITICAL",
};

const categoryMap: Record<string, AlertCategory> = {
  squawk: "SQUAWK",
  military: "MILITARY",
  anomaly: "ANOMALY",
  geofence: "GEOFENCE",
  pattern: "PATTERN",
  proximity: "PROXIMITY",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "100");
  const acknowledged = searchParams.get("acknowledged");

  const where: Record<string, unknown> = {};
  if (acknowledged !== null) {
    where.acknowledged = acknowledged === "true";
  }

  const alerts = await prisma.alert.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: limit,
    include: { entity: true, zone: true },
  });

  return NextResponse.json({ alerts, count: alerts.length });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (Array.isArray(body.alerts)) {
    const created = await prisma.alert.createMany({
      data: body.alerts.map((a: Record<string, string>) => ({
        type: severityMap[a.type] ?? "INFO",
        category: categoryMap[a.category] ?? "ANOMALY",
        title: a.title,
        message: a.message,
        source: a.source,
        entityId: a.entityId ?? null,
        zoneId: a.zoneId ?? null,
      })),
      skipDuplicates: true,
    });
    return NextResponse.json({ created: created.count });
  }

  const alert = await prisma.alert.create({
    data: {
      type: severityMap[body.type] ?? "INFO",
      category: categoryMap[body.category] ?? "ANOMALY",
      title: body.title,
      message: body.message,
      source: body.source,
      entityId: body.entityId ?? null,
      zoneId: body.zoneId ?? null,
    },
  });

  return NextResponse.json(alert, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, acknowledged } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const updated = await prisma.alert.update({
    where: { id },
    data: { acknowledged },
  });

  return NextResponse.json(updated);
}
