import { NextRequest, NextResponse } from "next/server";
import { fetchAircraftFrance } from "@/lib/opensky";
import prisma from "@/lib/prisma";
import { Aircraft, GeoPosition } from "@/types";

export const revalidate = 10;
export const dynamic = "force-dynamic";

const MAX_RESPONSE = 500;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const latMin = parseFloat(searchParams.get("latMin") ?? "-90");
  const latMax = parseFloat(searchParams.get("latMax") ?? "90");
  const lonMin = parseFloat(searchParams.get("lonMin") ?? "-180");
  const lonMax = parseFloat(searchParams.get("lonMax") ?? "180");

  const all = await fetchAircraftFrance();

  if (all.length > 0) {
    persistInBackground(all);
    await restoreTrackedFlags(all);

    const aircraft = all
      .filter((ac) => {
        if (!ac.position) return false;
        return ac.position.lat >= latMin && ac.position.lat <= latMax &&
               ac.position.lng >= lonMin && ac.position.lng <= lonMax;
      })
      .slice(0, MAX_RESPONSE);

    return NextResponse.json({
      aircraft,
      timestamp: new Date().toISOString(),
      count: aircraft.length,
      total: all.length,
      source: "live",
    });
  }

  const cached = await loadFromDatabase();
  return NextResponse.json({
    aircraft: cached,
    timestamp: new Date().toISOString(),
    count: cached.length,
    source: cached.length > 0 ? "database" : "empty",
  });
}

async function restoreTrackedFlags(aircraft: Aircraft[]) {
  try {
    const flagged = await prisma.trackedEntity.findMany({
      where: {
        type: "AIRCRAFT",
        OR: [{ tracked: true }, { flagged: true }],
      },
      select: { id: true, tracked: true, flagged: true },
    });
    const flagMap = new Map(flagged.map((f) => [f.id, f]));
    for (const ac of aircraft) {
      const f = flagMap.get(ac.id);
      if (f) {
        ac.tracked = f.tracked;
        ac.flagged = f.flagged;
      }
    }
  } catch { /* non-blocking */ }
}

function persistInBackground(aircraft: Aircraft[]) {
  const ops = aircraft
    .filter((ac) => ac.position)
    .map((ac) => {
      const position = ac.position!;
      return prisma.trackedEntity.upsert({
        where: { id: ac.id },
        create: {
          id: ac.id,
          type: "AIRCRAFT",
          label: ac.label,
          metadata: ac.metadata as Record<string, string | number | boolean | null>,
          positions: {
            create: {
              lat: position.lat,
              lng: position.lng,
              alt: position.alt ?? null,
              speed: ac.metadata.velocity,
              heading: ac.metadata.trueTrack,
              timestamp: new Date(position.timestamp),
            },
          },
        },
        update: {
          label: ac.label,
          metadata: ac.metadata as Record<string, string | number | boolean | null>,
          positions: {
            create: {
              lat: position.lat,
              lng: position.lng,
              alt: position.alt ?? null,
              speed: ac.metadata.velocity,
              heading: ac.metadata.trueTrack,
              timestamp: new Date(position.timestamp),
            },
          },
        },
      });
    });

  Promise.allSettled(ops).catch((err) => {
    console.error("DB persistence error (non-blocking):", err);
  });
}

async function loadFromDatabase(): Promise<Aircraft[]> {
  try {
    const entities = await prisma.trackedEntity.findMany({
      where: { type: "AIRCRAFT" },
      include: {
        positions: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
      take: 600,
    });

    return entities
      .filter((e) => e.positions.length > 0)
      .map((e): Aircraft => {
        const pos = e.positions[0];
        const meta = e.metadata as Record<string, string | number | boolean | null>;
        const position: GeoPosition = {
          lat: pos.lat,
          lng: pos.lng,
          alt: pos.alt ?? undefined,
          timestamp: pos.timestamp.getTime(),
        };

        return {
          id: e.id,
          type: "aircraft",
          label: e.label,
          position,
          trail: [position],
          tracked: e.tracked,
          flagged: e.flagged,
          metadata: {
            icao24: meta.icao24 as string,
            callsign: (meta.callsign as string) ?? null,
            originCountry: meta.originCountry as string,
            baroAltitude: (meta.baroAltitude as number) ?? null,
            geoAltitude: (meta.geoAltitude as number) ?? null,
            velocity: (meta.velocity as number) ?? null,
            trueTrack: (meta.trueTrack as number) ?? null,
            verticalRate: (meta.verticalRate as number) ?? null,
            onGround: (meta.onGround as boolean) ?? false,
            squawk: (meta.squawk as string) ?? null,
            lastContact: (meta.lastContact as number) ?? 0,
          },
        };
      });
  } catch (err) {
    console.error("DB fallback load failed:", err);
    return [];
  }
}
