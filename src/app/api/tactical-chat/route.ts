import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get("channel") || "general";
  const since = searchParams.get("since");
  const limit = parseInt(searchParams.get("limit") || "50");

  try {
    const where: Record<string, unknown> = { channel };
    if (since) {
      where.createdAt = { gt: new Date(since) };
    }

    const messages = await prisma.tacticalMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      messages: messages.reverse().map((m) => ({
        id: m.id,
        sender: m.sender,
        channel: m.channel,
        content: m.content,
        priority: m.priority,
        timestamp: m.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("Tactical chat GET error:", err);
    return NextResponse.json({ messages: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sender, content, channel = "general", priority = "routine" } = body;

    if (!sender || !content) {
      return NextResponse.json({ error: "sender and content required" }, { status: 400 });
    }

    const msg = await prisma.tacticalMessage.create({
      data: { sender, content, channel, priority },
    });

    return NextResponse.json({
      message: {
        id: msg.id,
        sender: msg.sender,
        channel: msg.channel,
        content: msg.content,
        priority: msg.priority,
        timestamp: msg.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("Tactical chat POST error:", err);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
