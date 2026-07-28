import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  tenantInvitations,
  tenantMemberships,
  tenants,
  workspaces,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { invitationAcceptError } from "@/lib/membership-policy";
import { sha256Token } from "@/lib/token-hash";

export async function POST(request: Request) {
  const user = await requireUser();
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Cette invitation est invalide ou expirée." }, { status: 400 });
  }

  const [row] = await db
    .select({ invitation: tenantInvitations, tenant: tenants })
    .from(tenantInvitations)
    .innerJoin(tenants, eq(tenants.id, tenantInvitations.tenantId))
    .where(eq(tenantInvitations.tokenHash, sha256Token(token)))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Cette invitation est invalide ou expirée." }, { status: 400 });
  }

  const acceptError = invitationAcceptError(row.invitation, user.email);
  if (acceptError === "expired") {
    return NextResponse.json({ error: "Cette invitation est invalide ou expirée." }, { status: 400 });
  }
  if (acceptError === "email_mismatch") {
    return NextResponse.json(
      { error: "Cette invitation est destinée à une autre adresse email." },
      { status: 403 },
    );
  }

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.tenantId, row.tenant.id))
    .limit(1);

  await db.transaction(async (tx) => {
    await tx
      .insert(tenantMemberships)
      .values({ tenantId: row.tenant.id, userId: user.id, role: row.invitation.role })
      .onConflictDoNothing();
    await tx.delete(tenantInvitations).where(eq(tenantInvitations.id, row.invitation.id));
    await tx.insert(auditEvents).values({
      tenantId: row.tenant.id,
      workspaceId: workspace?.id ?? null,
      actorUserId: user.id,
      action: "invitation.accepted",
      targetType: "membership",
      targetId: user.id,
      metadata: { email: row.invitation.email, role: row.invitation.role },
    });
  });

  return NextResponse.json({ ok: true, redirectTo: `/${row.tenant.slug}/dashboard` });
}
