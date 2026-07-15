import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditEvents, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { publicEventMetadata } from "@/lib/events/presentation";
import { getWorkspaceAccessBySlugs } from "@/lib/workspace";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> },
) {
  const { tenantSlug, workspaceSlug } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });

  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? 8);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
    : 8;
  const rows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      targetType: auditEvents.targetType,
      targetId: auditEvents.targetId,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
      actorName: users.name,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(and(
      eq(auditEvents.tenantId, access.tenant.id),
      eq(auditEvents.workspaceId, access.workspace.id),
    ))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);

  return NextResponse.json({
    events: rows.map((event) => ({
      ...event,
      metadata: publicEventMetadata(event.metadata),
      createdAt: event.createdAt.toISOString(),
    })),
  });
}
