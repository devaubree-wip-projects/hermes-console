import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, tenantMemberships, type MembershipRole } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { TENANT_ROLES } from "@/lib/tenant-rbac";
import { canAtLeast, getTenantAccessBySlug } from "@/lib/workspace";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; memberUserId: string }> },
) {
  const { tenantSlug, memberUserId } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canAtLeast(access.role, "owner")) {
    return NextResponse.json({ error: "Seul un Owner peut gérer les membres." }, { status: 403 });
  }
  if (memberUserId === access.tenant.ownerUserId) {
    return NextResponse.json(
      { error: "Le rôle du propriétaire fondateur ne peut pas être modifié." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as { role?: unknown } | null;
  const role = body?.role as MembershipRole;
  if (!TENANT_ROLES.includes(role)) {
    return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });
  }

  const [membership] = await db
    .update(tenantMemberships)
    .set({ role })
    .where(
      and(eq(tenantMemberships.tenantId, access.tenant.id), eq(tenantMemberships.userId, memberUserId)),
    )
    .returning({ userId: tenantMemberships.userId });
  if (!membership) {
    return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
  }

  await db.insert(auditEvents).values({
    tenantId: access.tenant.id,
    workspaceId: access.workspace.id,
    actorUserId: user.id,
    action: "membership.role_changed",
    targetType: "membership",
    targetId: memberUserId,
    metadata: { role },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tenantSlug: string; memberUserId: string }> },
) {
  const { tenantSlug, memberUserId } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canAtLeast(access.role, "owner")) {
    return NextResponse.json({ error: "Seul un Owner peut gérer les membres." }, { status: 403 });
  }
  if (memberUserId === access.tenant.ownerUserId) {
    return NextResponse.json(
      { error: "Le propriétaire fondateur ne peut pas être retiré de l'organisation." },
      { status: 400 },
    );
  }

  const [membership] = await db
    .delete(tenantMemberships)
    .where(
      and(eq(tenantMemberships.tenantId, access.tenant.id), eq(tenantMemberships.userId, memberUserId)),
    )
    .returning({ userId: tenantMemberships.userId });
  if (!membership) {
    return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
  }

  await db.insert(auditEvents).values({
    tenantId: access.tenant.id,
    workspaceId: access.workspace.id,
    actorUserId: user.id,
    action: "membership.removed",
    targetType: "membership",
    targetId: memberUserId,
  });

  return NextResponse.json({ ok: true });
}
