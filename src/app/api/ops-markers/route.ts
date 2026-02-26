import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const markers = await prisma.operationalMarker.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ markers });
  } catch (e) {
    return NextResponse.json({ markers: [], error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const marker = await prisma.operationalMarker.create({
      data: {
        affiliation: body.affiliation,
        category: body.category,
        label: body.label,
        lat: body.lat,
        lng: body.lng,
        notes: body.notes ?? "",
        weaponRange: body.weaponRange ?? null,
        createdBy: body.createdBy ?? "operator",
      },
    });
    return NextResponse.json({ marker });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await prisma.operationalMarker.deleteMany();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
