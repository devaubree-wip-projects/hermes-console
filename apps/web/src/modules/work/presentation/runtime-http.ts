import "server-only";

import { NextResponse } from "next/server";
import { WorkDomainError } from "@/modules/work/domain/work";
import { RuntimeAuthError, verifyRuntimeWorkRequest } from "@/modules/work/infrastructure/runtime-auth";
import { WorkConflictError, WorkNotFoundError } from "@/modules/work/infrastructure/work-service";

export async function readRuntimeWorkRequest(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 512_000) throw new RuntimeAuthError(413, "Requête Edge trop volumineuse.");
  const raw = await request.text();
  let body: Record<string, unknown>;
  try {
    body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    throw new RuntimeAuthError(400, "Payload Edge invalide.");
  }
  const installationId = typeof body.installationId === "string" ? body.installationId : null;
  const auth = await verifyRuntimeWorkRequest(request, raw, installationId);
  return { body, auth };
}

export function runtimeWorkErrorResponse(error: unknown) {
  if (error instanceof RuntimeAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof WorkNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
  if (error instanceof WorkConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof WorkDomainError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  console.error("runtime work request failed", error);
  return NextResponse.json({ error: "Opération runtime Work impossible." }, { status: 500 });
}
