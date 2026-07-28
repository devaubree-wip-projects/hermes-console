import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { files } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/workspace";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./data/uploads";
const MAX_SIZE_BYTES = 20 * 1024 * 1024;

/** Keeps only the basename, strips control characters and path separators, caps length. */
function sanitizeFileName(rawName: string): string {
  const base = path.basename(rawName);
  let cleaned = "";
  for (const char of base) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || char === "/" || char === "\\") continue;
    cleaned += char;
  }
  cleaned = cleaned.trim().slice(0, 120);
  return cleaned.length > 0 ? cleaned : "fichier";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const workspaceId = formData.get("workspaceId");
  const file = formData.get("file");

  if (typeof workspaceId !== "string" || !workspaceId) {
    return NextResponse.json({ error: "Workspace invalide." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }

  const workspace = await getWorkspaceForUser(workspaceId, user.id);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (max 20 Mo)." }, { status: 400 });
  }

  const safeName = sanitizeFileName(file.name);
  const dir = path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, workspaceId);
  await mkdir(dir, { recursive: true });
  const storedPath = path.join(/*turbopackIgnore: true*/ dir, `${randomUUID()}-${safeName}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(storedPath, buffer);

  const [row] = await db
    .insert(files)
    .values({
      workspaceId,
      name: safeName,
      storedPath,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
    })
    .returning();

  return NextResponse.json({ ok: true, fileId: row.id });
}
