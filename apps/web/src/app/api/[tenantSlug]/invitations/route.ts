import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  tenantInvitations,
  tenantMemberships,
  users,
  type MembershipRole,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { consoleBaseUrl } from "@/lib/console-url";
import { sendMail } from "@/lib/mailer";
import { INVITATION_TTL_MS } from "@/lib/membership-policy";
import { TENANT_ROLES } from "@/lib/tenant-rbac";
import { sha256Token } from "@/lib/token-hash";
import { canAtLeast, getTenantAccessBySlug } from "@/lib/workspace";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canAtLeast(access.role, "owner")) {
    return NextResponse.json({ error: "Seul un Owner peut gérer les membres." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    role?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "L'adresse email n'est pas valide." }, { status: 400 });
  }
  const role = body?.role as MembershipRole;
  if (!TENANT_ROLES.includes(role)) {
    return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });
  }

  const [existingMember] = await db
    .select({ userId: tenantMemberships.userId })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .where(and(eq(tenantMemberships.tenantId, access.tenant.id), eq(users.email, email)))
    .limit(1);
  if (existingMember) {
    return NextResponse.json({ error: "Cette personne est déjà membre de l'organisation." }, { status: 409 });
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const invitationId = await db.transaction(async (tx) => {
    // Re-inviting the same address replaces the pending invitation.
    await tx
      .delete(tenantInvitations)
      .where(and(eq(tenantInvitations.tenantId, access.tenant.id), eq(tenantInvitations.email, email)));
    const [invitation] = await tx
      .insert(tenantInvitations)
      .values({
        tenantId: access.tenant.id,
        email,
        role,
        tokenHash: sha256Token(token),
        invitedByUserId: user.id,
        expiresAt,
      })
      .returning({ id: tenantInvitations.id });
    await tx.insert(auditEvents).values({
      tenantId: access.tenant.id,
      workspaceId: access.workspace.id,
      actorUserId: user.id,
      action: "invitation.created",
      targetType: "invitation",
      targetId: invitation.id,
      metadata: { email, role },
    });
    return invitation.id;
  });

  await sendMail({
    to: email,
    subject: `Invitation à rejoindre ${access.tenant.name} sur Hermes Console`,
    text: [
      "Bonjour,",
      "",
      `${user.name} vous invite à rejoindre l'organisation « ${access.tenant.name} » sur Hermes Console avec le rôle ${role}.`,
      "Pour accepter l'invitation, ouvrez ce lien (valide 7 jours) :",
      `${await consoleBaseUrl()}/invitations/accept?token=${token}`,
      "",
      "Si vous ne connaissez pas cette organisation, ignorez cet email.",
    ].join("\n"),
  });

  return NextResponse.json({ ok: true, invitationId }, { status: 201 });
}
