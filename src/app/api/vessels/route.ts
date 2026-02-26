import { NextResponse } from "next/server";
import { ensureAISConnection, getVessels, getVesselCount, isConnected } from "@/lib/ais";
import prisma from "@/lib/prisma";
import { Vessel, GeoPosition } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureAISConnection();

  const vessels = getVessels();

  if (vessels.length > 0) {
    persistInBackground(vessels);
    await restoreTrackedFlags(vessels);

    return NextResponse.json({
      vessels,
      timestamp: new Date().toISOString(),
      count: vessels.length,
      connected: isConnected(),
      source: "live",
    });
  }

  const cached = await loadFromDatabase();
  return NextResponse.json({
    vessels: cached,
    timestamp: new Date().toISOString(),
    count: cached.length,
    connected: isConnected(),
    source: cached.length > 0 ? "database" : "empty",
  });
}

async function restoreTrackedFlags(vessels: Vessel[]) {
  try {
    const flagged = await prisma.trackedEntity.findMany({
      where: {
        type: "VESSEL",
        OR: [{ tracked: true }, { flagged: true }],
      },
      select: { id: true, tracked: true, flagged: true },
    });
    const flagMap = new Map(flagged.map((f) => [f.id, f]));
    for (const v of vessels) {
      const f = flagMap.get(v.id);
      if (f) {
        v.tracked = f.tracked;
        v.flagged = f.flagged;
      }
    }
  } catch { /* non-blocking */ }
}

function persistInBackground(vessels: Vessel[]) {
  const withPosition = vessels.filter((v) => v.position);
  if (withPosition.length === 0) return;

  const batch = withPosition.slice(0, 100);

  const ops = batch.map((v) => {
    const position = v.position!;
    return prisma.trackedEntity.upsert({
      where: { id: v.id },
      create: {
        id: v.id,
        type: "VESSEL",
        label: v.label,
        metadata: v.metadata as Record<string, string | number | boolean | null>,
        positions: {
          create: {
            lat: position.lat,
            lng: position.lng,
            speed: v.metadata.speed,
            heading: v.metadata.heading,
            timestamp: new Date(position.timestamp),
          },
        },
      },
      update: {
        label: v.label,
        metadata: v.metadata as Record<string, string | number | boolean | null>,
        positions: {
          create: {
            lat: position.lat,
            lng: position.lng,
            speed: v.metadata.speed,
            heading: v.metadata.heading,
            timestamp: new Date(position.timestamp),
          },
        },
      },
    });
  });

  Promise.allSettled(ops).catch((err) => {
    console.error("AIS DB persistence error:", err);
  });
}

async function loadFromDatabase(): Promise<Vessel[]> {
  try {
    const entities = await prisma.trackedEntity.findMany({
      where: { type: "VESSEL" },
      include: {
        positions: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
      take: 500,
    });

    return entities
      .filter((e) => e.positions.length > 0)
      .map((e): Vessel => {
        const pos = e.positions[0];
        const meta = e.metadata as Record<string, string | number | boolean | null>;
        const position: GeoPosition = {
          lat: pos.lat,
          lng: pos.lng,
          timestamp: pos.timestamp.getTime(),
        };

        return {
          id: e.id,
          type: "vessel",
          label: e.label,
          position,
          trail: [position],
          tracked: e.tracked,
          flagged: e.flagged,
          metadata: {
            mmsi: (meta.mmsi as string) ?? "",
            name: (meta.name as string) ?? null,
            shipType: (meta.shipType as string) ?? null,
            flag: (meta.flag as string) ?? null,
            speed: (meta.speed as number) ?? null,
            course: (meta.course as number) ?? null,
            heading: (meta.heading as number) ?? null,
            destination: (meta.destination as string) ?? null,
            draught: (meta.draught as number) ?? null,
            length: (meta.length as number) ?? null,
          },
        };
      });
  } catch (err) {
    console.error("AIS DB fallback load failed:", err);
    return [];
  }
}
