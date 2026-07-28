import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, tenantInvitations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canAtLeast, getTenantAccessBySlug } from "@/lib/workspace";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tenantSlug: string; invitationId: string }> },
) {
  const { tenantSlug, invitationId } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canAtLeast(access.role, "owner")) {
    return NextResponse.json({ error: "Seul un Owner peut gérer les membres." }, { status: 403 });
  }

  const [invitation] = await db
    .delete(tenantInvitations)
    .where(and(eq(tenantInvitations.id, invitationId), eq(tenantInvitations.tenantId, access.tenant.id)))
    .returning({ id: tenantInvitations.id, email: tenantInvitations.email });
  if (!invitation) {
    return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });
  }

  await db.insert(auditEvents).values({
    tenantId: access.tenant.id,
    workspaceId: access.workspace.id,
    actorUserId: user.id,
    action: "invitation.revoked",
    targetType: "invitation",
    targetId: invitation.id,
    metadata: { email: invitation.email },
  });

  return NextResponse.json({ ok: true });
}
