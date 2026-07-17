import { rm } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { canConfigureRuntime, getWorkspaceAccessForUserById } from "@/lib/workspace";
import { normalizePermissions } from "@/lib/permissions";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./data/uploads";

function isValidGatewayUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const access = await getWorkspaceAccessForUserById(workspaceId, user.id);
  if (!access) {
    return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  }
  if (!canConfigureRuntime(access.role)) return NextResponse.json({ error: "Seul un Owner peut modifier le workspace." }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const updates: Partial<typeof workspaces.$inferInsert> = {};

  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) {
      return NextResponse.json(
        { error: "Le nom du workspace est requis (100 caractères max)." },
        { status: 400 },
      );
    }
    updates.name = name;
  }

  if ("hermesBaseUrl" in body) {
    const value = typeof body.hermesBaseUrl === "string" ? body.hermesBaseUrl.trim() : "";
    if (!isValidGatewayUrl(value)) {
      return NextResponse.json({ error: "URL du gateway invalide." }, { status: 400 });
    }
    updates.hermesBaseUrl = value;
  }

  if ("permissions" in body) {
    updates.permissions = normalizePermissions(body.permissions);
  }

  if (Object.keys(updates).length > 0) {
    await db.update(workspaces).set(updates).where(eq(workspaces.id, workspaceId));
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const access = await getWorkspaceAccessForUserById(workspaceId, user.id);
  if (!access) {
    return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  }
  if (!canConfigureRuntime(access.role)) return NextResponse.json({ error: "Seul un Owner peut supprimer le workspace." }, { status: 403 });

  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await rm(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, workspaceId), {
    recursive: true,
    force: true,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
