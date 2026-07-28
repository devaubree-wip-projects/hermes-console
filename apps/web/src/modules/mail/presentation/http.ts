import "server-only";

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAtLeast, getTenantAccessBySlug } from "@/lib/workspace";
import type { MembershipRole } from "@/db/schema";

export class MailHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type MailContext = {
  tenantId: string;
  workspaceId: string;
  userId: string;
  role: MembershipRole;
};

export async function resolveMailContext(
  tenantSlug: string,
  minimumRole: MembershipRole = "viewer",
): Promise<MailContext> {
  const user = await getCurrentUser();
  if (!user) throw new MailHttpError(401, "Non authentifié.");
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) throw new MailHttpError(404, "Workspace introuvable.");
  if (!canAtLeast(access.role, minimumRole)) throw new MailHttpError(403, "Droits insuffisants.");
  return {
    tenantId: access.tenant.id,
    workspaceId: access.workspace.id,
    userId: user.id,
    role: access.role,
  };
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => {
    throw new MailHttpError(400, "Corps de requête illisible.");
  });
}

export function mailErrorResponse(error: unknown) {
  if (error instanceof MailHttpError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  // Le message d'un relais peut contenir l'adresse du destinataire ou l'en-tête
  // renvoyé par le fournisseur : il reste dans les logs serveur, pas dans la réponse.
  console.error("mail request failed", error);
  return NextResponse.json({ error: "Envoi impossible." }, { status: 500 });
}
