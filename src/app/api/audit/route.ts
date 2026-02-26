import { NextRequest, NextResponse } from "next/server";
import { logAudit, queryAuditLog, type AuditAction, type AuditQuery } from "@/lib/audit-trail";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const query: AuditQuery = {};

  if (sp.get("userId")) query.userId = sp.get("userId")!;
  if (sp.get("action")) query.action = sp.get("action") as AuditAction;
  if (sp.get("severity")) query.severity = sp.get("severity") as AuditQuery["severity"];
  if (sp.get("from")) query.from = sp.get("from")!;
  if (sp.get("to")) query.to = sp.get("to")!;
  if (sp.get("limit")) query.limit = parseInt(sp.get("limit")!, 10);
  if (sp.get("offset")) query.offset = parseInt(sp.get("offset")!, 10);

  const result = await queryAuditLog(query);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const entry = await logAudit({
      userId: session.user.id ?? "unknown",
      userName: session.user.name ?? "unknown",
      userRole: (session.user as Record<string, unknown>).role as string ?? "ANALYST",
      action: body.action as AuditAction,
      details: body.details ?? {},
      ipAddress: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
      sessionId: null,
      success: body.success !== false,
      errorMessage: body.errorMessage,
    });

    return NextResponse.json(entry);
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
