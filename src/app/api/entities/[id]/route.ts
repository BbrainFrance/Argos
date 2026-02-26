import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, boolean> = {};
  if (typeof body.tracked === "boolean") data.tracked = body.tracked;
  if (typeof body.flagged === "boolean") data.flagged = body.flagged;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const entity = await prisma.trackedEntity.update({
      where: { id },
      data,
    });
    return NextResponse.json({ entity });
  } catch {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }
}
