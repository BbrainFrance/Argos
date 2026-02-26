import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ZoneType } from "@/generated/prisma/client";

const zoneTypeMap: Record<string, ZoneType> = {
  surveillance: "SURVEILLANCE",
  exclusion: "EXCLUSION",
  alert: "ALERT",
};

export async function GET() {
  const zones = await prisma.zone.findMany({
    orderBy: { createdAt: "desc" },
  });

  const mapped = zones.map((z) => ({
    id: z.id,
    name: z.name,
    type: z.type.toLowerCase(),
    polygon: z.polygon,
    color: z.color,
    active: z.active,
    alertOnEntry: z.alertOnEntry,
    alertOnExit: z.alertOnExit,
    createdAt: z.createdAt,
  }));

  return NextResponse.json({ zones: mapped });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const zone = await prisma.zone.create({
    data: {
      name: body.name,
      type: zoneTypeMap[body.type] ?? "SURVEILLANCE",
      polygon: body.polygon,
      color: body.color ?? "#8b5cf6",
      active: body.active ?? true,
      alertOnEntry: body.alertOnEntry ?? false,
      alertOnExit: body.alertOnExit ?? false,
    },
  });

  return NextResponse.json(zone, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...data } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (data.type) {
    data.type = zoneTypeMap[data.type] ?? data.type;
  }

  const updated = await prisma.zone.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await prisma.zone.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
