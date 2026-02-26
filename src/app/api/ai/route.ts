import { NextRequest, NextResponse } from "next/server";
import { queryMistral, buildSituationPrompt, buildEntityPrompt } from "@/lib/mistral";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { type } = body;

  let prompt: string;

  switch (type) {
    case "situation":
      prompt = buildSituationPrompt(body.stats, body.alerts ?? [], body.analyses ?? []);
      break;
    case "entity":
      prompt = buildEntityPrompt(body.entity);
      break;
    case "custom":
      prompt = body.prompt ?? "";
      break;
    default:
      return NextResponse.json({ error: "Type invalide" }, { status: 400 });
  }

  if (!prompt) {
    return NextResponse.json({ error: "Prompt vide" }, { status: 400 });
  }

  const response = await queryMistral(prompt);

  return NextResponse.json({
    response,
    timestamp: new Date().toISOString(),
    model: "mistral-large-latest",
  });
}
