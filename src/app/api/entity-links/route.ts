import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const links = await prisma.entityLink.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ links });
  } catch (e) {
    return NextResponse.json({ links: [], error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const link = await prisma.entityLink.create({
      data: {
        sourceId: body.sourceId,
        targetId: body.targetId,
        relationType: body.relationType,
        label: body.label ?? null,
        createdBy: body.createdBy ?? "operator",
      },
    });
    return NextResponse.json({ link });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
