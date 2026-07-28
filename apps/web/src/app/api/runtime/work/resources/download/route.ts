import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { NextResponse } from "next/server";
import { resolveWorkFileResourceDownload } from "@/modules/work/infrastructure/work-runtime-service";
import {
  readRuntimeWorkRequest,
  runtimeWorkErrorResponse,
} from "@/modules/work/presentation/runtime-http";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const UPLOAD_ROOT = path.resolve(
  /* turbopackIgnore: true */ process.env.UPLOAD_DIR ?? "./data/uploads",
);

const schema = z.object({
  installationId: z.string().uuid(),
  runId: z.string().uuid(),
  resourceId: z.string().uuid(),
  leaseToken: z.string().min(32).max(256),
});

export async function POST(request: Request) {
  try {
    const { body, auth } = await readRuntimeWorkRequest(request);
    const input = schema.parse(body);
    const resource = await resolveWorkFileResourceDownload({
      installationId: auth.installation.id,
      runId: input.runId,
      resourceId: input.resourceId,
      leaseToken: input.leaseToken,
    });
    if (resource.size < 0 || resource.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Ressource trop volumineuse." },
        { status: 413 },
      );
    }
    const storedPath = path.resolve(resource.storedPath);
    if (
      storedPath !== UPLOAD_ROOT &&
      !storedPath.startsWith(`${UPLOAD_ROOT}${path.sep}`)
    ) {
      return NextResponse.json(
        { error: "Fichier source invalide." },
        { status: 409 },
      );
    }

    const handle = await open(
      storedPath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await handle.stat();
      if (
        !stat.isFile() ||
        stat.size !== resource.size ||
        stat.size > MAX_FILE_BYTES
      ) {
        return NextResponse.json(
          { error: "Fichier source invalide." },
          { status: 409 },
        );
      }
      const bytes = await handle.readFile();
      return new Response(bytes, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Length": String(bytes.byteLength),
          "Content-Type": resource.mimeType || "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } finally {
      await handle.close();
    }
  } catch (error) {
    return runtimeWorkErrorResponse(error);
  }
}
