import "server-only";

import { timingSafeEqual } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { GATEWAY_SERVICE_HEADERS } from "@hermes-console/shared/gateway";
import { db } from "@/db";
import { runtimeInstallations, runtimeWorkNonces } from "@/db/schema";
import { deriveInstallationSecret } from "@/lib/hermes/relay-identity";
import { runtimeRequestSignature } from "@/modules/work/domain/runtime-signature";

export { runtimeRequestSignature } from "@/modules/work/domain/runtime-signature";

export class RuntimeAuthError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function verifyRuntimeWorkRequest(
  request: Request,
  rawBody: string,
  requestedInstallationId?: string | null,
) {
  const installationKey = request.headers.get(GATEWAY_SERVICE_HEADERS.installation)?.trim() ?? "";
  const profile = request.headers.get(GATEWAY_SERVICE_HEADERS.profile)?.trim() ?? "";
  const nonce = request.headers.get(GATEWAY_SERVICE_HEADERS.nonce)?.trim() ?? "";
  const provided = request.headers.get(GATEWAY_SERVICE_HEADERS.signature)?.trim() ?? "";
  const timestamp = Number(request.headers.get(GATEWAY_SERVICE_HEADERS.timestamp));
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(installationKey)
    || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(profile)
    || !/^[a-fA-F0-9]{32,128}$/.test(nonce)
    || !Number.isSafeInteger(timestamp)
    || Math.abs(Date.now() - timestamp) > 30_000
    || !provided
  ) {
    throw new RuntimeAuthError(401, "Authentification Edge invalide.");
  }
  const requestUrl = new URL(request.url);
  const expected = runtimeRequestSignature({
    secret: process.env.HERMES_GATEWAY_DERIVE_SECRETS !== "false"
      ? deriveInstallationSecret("service", installationKey)
      : process.env.HERMES_GATEWAY_SERVICE_SECRET ?? process.env.HERMES_GATEWAY_TICKET_SECRET ?? "hermes-console-local-development",
    method: request.method,
    requestUri: `${requestUrl.pathname}${requestUrl.search}`,
    timestamp,
    nonce,
    profile,
    body: rawBody,
  });
  const actualBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    throw new RuntimeAuthError(401, "Signature Edge invalide.");
  }

  const candidates = await db.select().from(runtimeInstallations).where(and(
    eq(runtimeInstallations.installationKey, installationKey),
    ...(requestedInstallationId ? [eq(runtimeInstallations.id, requestedInstallationId)] : []),
  )).limit(64);
  const validCandidates = candidates.filter((candidate) => !candidate.archivedAt && candidate.status !== "revoked");
  if (!validCandidates.length || (requestedInstallationId && validCandidates.length !== 1)) {
    throw new RuntimeAuthError(401, "Installation Edge inconnue ou ambiguë.");
  }
  const installation = validCandidates[0];
  try {
    await db.transaction(async (tx) => {
      await tx.delete(runtimeWorkNonces).where(lt(runtimeWorkNonces.expiresAt, new Date()));
      await tx.insert(runtimeWorkNonces).values(validCandidates.map((candidate) => ({
        installationId: candidate.id,
        nonce,
        expiresAt: new Date(Date.now() + 60_000),
      })));
    });
  } catch {
    throw new RuntimeAuthError(409, "Requête Edge rejouée.");
  }
  return { installation, installations: validCandidates, profile };
}
