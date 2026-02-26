import { NextRequest, NextResponse } from "next/server";
import { executeCommand } from "@/lib/mistral";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { command, conversationId, context } = body;

  if (!command || typeof command !== "string") {
    return NextResponse.json({ error: "Commande vide" }, { status: 400 });
  }

  const result = await executeCommand(
    command,
    conversationId ?? `conv-${Date.now()}`,
    context
  );

  return NextResponse.json(result);
}
