import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  auditEvents,
  runtimeEnrollmentTokens,
  runtimeIdentities,
  runtimeInstallations,
} from "@/db/schema";
import {
  certificateIdentity,
  deriveInstallationSecret,
  hashEnrollmentToken,
  signRelayIdentity,
} from "@/lib/hermes/relay-identity";
import { revokeRelayFingerprints } from "@/lib/hermes/relay-admin";

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 32_768) {
    return NextResponse.json({ error: "Requête trop volumineuse." }, { status: 413 });
  }
  const body = await request.json().catch(() => null) as { token?: unknown; certificatePem?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const certificatePem = typeof body?.certificatePem === "string" ? body.certificatePem : "";
  if (token.length < 40 || certificatePem.length < 100 || certificatePem.length > 16_384) {
    return NextResponse.json({ error: "Jeton ou certificat invalide." }, { status: 400 });
  }
  let identity: ReturnType<typeof certificateIdentity>;
  try {
    identity = certificateIdentity(certificatePem);
  } catch {
    return NextResponse.json({ error: "Certificat Edge invalide ou expiré." }, { status: 400 });
  }
  const now = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      const [claimed] = await tx.update(runtimeEnrollmentTokens).set({ consumedAt: now }).where(and(
        eq(runtimeEnrollmentTokens.tokenHash, hashEnrollmentToken(token)),
        isNull(runtimeEnrollmentTokens.consumedAt),
        isNull(runtimeEnrollmentTokens.revokedAt),
        gt(runtimeEnrollmentTokens.expiresAt, now),
      )).returning({ installationId: runtimeEnrollmentTokens.installationId });
      if (!claimed) throw new Error("invalid_or_consumed_token");
      const [installation] = await tx.select().from(runtimeInstallations)
        .where(eq(runtimeInstallations.id, claimed.installationId)).limit(1);
      if (!installation || installation.archivedAt) throw new Error("installation_unavailable");

      const previousIdentities = await tx.select({ fingerprint: runtimeIdentities.fingerprint })
        .from(runtimeIdentities).where(and(
          eq(runtimeIdentities.installationId, installation.id),
          inArray(runtimeIdentities.status, ["active", "rotating"]),
        ));
      await tx.update(runtimeIdentities).set({
        status: "revoked",
        revokedAt: now,
        updatedAt: now,
      }).where(eq(runtimeIdentities.installationId, installation.id));
      await tx.insert(runtimeIdentities).values({
        installationId: installation.id,
        publicKey: identity.publicKey,
        fingerprint: identity.fingerprint,
        certificatePem: identity.certificatePem,
        status: "active",
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      });
      await tx.update(runtimeInstallations).set({
        gatewayUrl: `${(process.env.HERMES_RELAY_PUBLIC_URL ?? "https://127.0.0.1:8790").replace(/\/$/, "")}/v1/relay/installations/${installation.id}`,
        status: "checking",
        statusReason: "relay_connection_pending",
        statusDetail: "Identité créée ; attente du tunnel Relay mTLS.",
        updatedAt: now,
      }).where(eq(runtimeInstallations.id, installation.id));
      await tx.insert(auditEvents).values({
        tenantId: installation.tenantId,
        actorUserId: null,
        action: "runtime_installation.enrollment_consumed",
        targetType: "runtime_installation",
        targetId: installation.id,
        metadata: { fingerprint: identity.fingerprint },
      });
      return { installation, previousFingerprints: previousIdentities.map((entry) => entry.fingerprint) };
    });
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const previousRevocation = result.previousFingerprints.length
      ? await revokeRelayFingerprints({
        gatewayUrl: result.installation.gatewayUrl,
        installationId: result.installation.id,
        installationKey: result.installation.installationKey,
        fingerprints: result.previousFingerprints,
      })
      : { propagated: true as const };
    if (!previousRevocation.propagated) {
      await db.update(runtimeInstallations).set({
        status: "degraded",
        statusReason: "previous_identity_revocation_pending",
        statusDetail: "Nouvelle identité créée, mais la révocation Relay précédente doit être réessayée.",
        updatedAt: new Date(),
      }).where(eq(runtimeInstallations.id, result.installation.id));
    }
    return NextResponse.json({
      installationId: result.installation.id,
      tenantId: result.installation.tenantId,
      installationKey: result.installation.installationKey,
      credential: signRelayIdentity({
        tenantId: result.installation.tenantId,
        installationId: result.installation.id,
        installationKey: result.installation.installationKey,
        fingerprint: identity.fingerprint,
        expiresAt,
      }),
      credentialExpiresAt: expiresAt.toISOString(),
      relayUrl: process.env.HERMES_RELAY_URL ?? "wss://127.0.0.1:8790/v1/relay/connect",
      controlPlaneUrl: new URL(request.url).origin,
      previousIdentityRevocationPropagated: previousRevocation.propagated,
      serviceSecret: deriveInstallationSecret("service", result.installation.installationKey),
      ticketSecret: deriveInstallationSecret("ticket", result.installation.installationKey),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "enrollment_failed";
    if (code === "invalid_or_consumed_token") {
      return NextResponse.json({ error: "Jeton expiré, révoqué ou déjà consommé." }, { status: 401 });
    }
    return NextResponse.json({ error: "Enrôlement impossible." }, { status: 400 });
  }
}
