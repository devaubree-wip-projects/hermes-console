import "server-only";

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAtLeast, getTenantAccessBySlug } from "@/lib/workspace";
import { WorkDomainError } from "@/modules/work/domain/work";
import {
  WorkConflictError,
  WorkNotFoundError,
  type WorkContext,
} from "@/modules/work/infrastructure/work-service";
import type { MembershipRole } from "@/db/schema";

export class WorkHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function resolveWorkContext(
  tenantSlug: string,
  minimumRole: MembershipRole = "viewer",
): Promise<WorkContext> {
  const user = await getCurrentUser();
  if (!user) throw new WorkHttpError(401, "Non authentifié.");
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) throw new WorkHttpError(404, "Workspace introuvable.");
  if (!canAtLeast(access.role, minimumRole)) throw new WorkHttpError(403, "Accès en lecture seule.");
  return {
    tenantId: access.tenant.id,
    workspaceId: access.workspace.id,
    workspaceSlug: access.workspace.slug,
    userId: user.id,
    role: access.role,
  };
}

export function workErrorResponse(error: unknown) {
  if (error instanceof WorkHttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof WorkNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
  if (error instanceof WorkConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof WorkDomainError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  console.error("work request failed", error);
  return NextResponse.json({ error: "Opération Travail impossible." }, { status: 500 });
}

export async function readJson(request: Request, maxBytes = 64_000) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new WorkHttpError(413, "Requête trop volumineuse.");
  return request.json();
}
