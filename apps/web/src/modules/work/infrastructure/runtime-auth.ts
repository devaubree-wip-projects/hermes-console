import "server-only";

import { timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lt, ne } from "drizzle-orm";
import { GATEWAY_SERVICE_HEADERS } from "@hermes-console/shared/gateway";
import { db } from "@/db";
import { runtimeInstallations, runtimeWorkNonces } from "@/db/schema";
import { resolveVerificationSecrets } from "@/lib/hermes/installation-secrets";
import { runtimeRequestSignature } from "@/modules/work/domain/runtime-signature";

export { runtimeRequestSignature } from "@/modules/work/domain/runtime-signature";

export class RuntimeAuthError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const INSTALLATION_ID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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
  // Obligatoire : la clé seule ne désigne pas une installation de façon fiable —
  // l'Edge doit nommer explicitement la ligne pour laquelle il travaille.
  if (!requestedInstallationId || !INSTALLATION_ID_PATTERN.test(requestedInstallationId)) {
    throw new RuntimeAuthError(401, "Identifiant d’installation Edge requis.");
  }
  // Résolution par clé primaire, et la clé du header doit correspondre à la ligne :
  // un Edge ne peut donc jamais être servi pour une installation qui n’est pas la
  // sienne, même si une clé venait à être partagée. Les prédicats d’activité sont
  // appliqués en SQL — filtrer après coup laisserait passer une ligne archivée.
  //
  // Cette résolution précède désormais la vérification de signature, parce que le
  // secret attendu dépend de la ligne. Les deux échecs partagent donc volontairement
  // le MÊME message : les distinguer permettrait de sonder l’existence d’une
  // installation sans détenir la moindre signature valide.
  const [installation] = await db.select().from(runtimeInstallations).where(and(
    eq(runtimeInstallations.id, requestedInstallationId),
    eq(runtimeInstallations.installationKey, installationKey),
    isNull(runtimeInstallations.archivedAt),
    ne(runtimeInstallations.status, "revoked"),
  )).limit(1);
  if (!installation) {
    throw new RuntimeAuthError(401, "Authentification Edge invalide.");
  }

  const requestUrl = new URL(request.url);
  // Plusieurs secrets peuvent être acceptables : la génération courante et, le temps
  // d’une rotation, la précédente. Toutes les comparaisons sont exécutées à temps
  // constant, sans court-circuit sur la première qui correspond.
  const secrets = await resolveVerificationSecrets("service", installationKey);
  const actualBytes = Buffer.from(provided);
  const matches = secrets.reduce((accepted, secret) => {
    const expectedBytes = Buffer.from(runtimeRequestSignature({
      secret,
      method: request.method,
      requestUri: `${requestUrl.pathname}${requestUrl.search}`,
      timestamp,
      nonce,
      profile,
      body: rawBody,
    }));
    const equal = actualBytes.length === expectedBytes.length
      && timingSafeEqual(actualBytes, expectedBytes);
    return accepted || equal;
  }, false);
  if (!matches) {
    throw new RuntimeAuthError(401, "Authentification Edge invalide.");
  }
  try {
    await db.transaction(async (tx) => {
      await tx.delete(runtimeWorkNonces).where(lt(runtimeWorkNonces.expiresAt, new Date()));
      await tx.insert(runtimeWorkNonces).values({
        installationId: installation.id,
        nonce,
        expiresAt: new Date(Date.now() + 60_000),
      });
    });
  } catch {
    throw new RuntimeAuthError(409, "Requête Edge rejouée.");
  }
  return { installation, profile };
}
