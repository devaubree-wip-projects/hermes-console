import { readFile, unlink } from "node:fs/promises";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { files } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/workspace";

function asciiFallback(name: string): string {
  let out = "";
  for (const char of name) {
    const code = char.codePointAt(0) ?? 0;
    out += code >= 32 && code <= 126 && char !== '"' ? char : "_";
  }
  return out.length > 0 ? out : "fichier";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const [row] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!row) {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }

  const workspace = await getWorkspaceForUser(row.workspaceId, user.id);
  if (!workspace) {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(row.storedPath);
  } catch {
    return NextResponse.json({ error: "Fichier introuvable sur le serveur." }, { status: 404 });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Disposition": `attachment; filename="${asciiFallback(row.name)}"; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      "Content-Length": String(row.size),
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const [row] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!row) {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }

  const workspace = await getWorkspaceForUser(row.workspaceId, user.id);
  if (!workspace) {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }

  await db.delete(files).where(eq(files.id, fileId));
  try {
    await unlink(row.storedPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  return NextResponse.json({ ok: true });
}
