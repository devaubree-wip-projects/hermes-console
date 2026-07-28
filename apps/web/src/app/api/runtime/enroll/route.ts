import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  auditEvents,
  runtimeEnrollmentTokens,
  runtimeIdentities,
  runtimeInstallationSecrets,
  runtimeInstallations,
} from "@/db/schema";
import {
  certificateIdentity,
  hashEnrollmentToken,
  signRelayIdentity,
} from "@/lib/hermes/relay-identity";
import { context, invalidateInstallationSecrets } from "@/lib/hermes/installation-secrets";
import { sealSecret } from "@/lib/hermes/secret-vault";
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

      // Secrets propres à cette installation, tirés au hasard plutôt que dérivés d'un
      // master : c'est ce qui permet de les révoquer un par un. L'Edge les reçoit une
      // seule fois, dans la réponse ci-dessous, et les garde sur disque.
      //
      // La génération précédente devient `superseded` au lieu d'être révoquée : un Edge
      // qui redémarre pendant la rotation présente encore l'ancien secret, et le
      // résolveur l'accepte le temps de la fenêtre de grâce.
      await tx.update(runtimeInstallationSecrets).set({
        status: "superseded",
        supersededAt: now,
      }).where(and(
        eq(runtimeInstallationSecrets.installationId, installation.id),
        eq(runtimeInstallationSecrets.status, "active"),
      ));
      const secrets = {
        service: randomBytes(32).toString("base64url"),
        ticket: randomBytes(32).toString("base64url"),
      };
      await tx.insert(runtimeInstallationSecrets).values({
        installationId: installation.id,
        serviceSecret: sealSecret(secrets.service, context(installation.id)),
        ticketSecret: sealSecret(secrets.ticket, context(installation.id)),
      });
      // En relay, l'URL du gateway EST celle du tunnel : la Console ne joint l'Edge
      // que par là, donc elle l'écrase. En direct, l'URL saisie à l'enrôlement est la
      // seule adresse joignable — l'écraser rendrait l'installation inatteignable.
      await tx.update(runtimeInstallations).set({
        ...(installation.transport === "relay"
          ? {
            gatewayUrl: `${(process.env.HERMES_RELAY_PUBLIC_URL ?? "https://127.0.0.1:8790").replace(/\/$/, "")}/v1/relay/installations/${installation.id}`,
            statusReason: "relay_connection_pending",
            statusDetail: "Identité créée ; attente du tunnel Relay mTLS.",
          }
          : {
            statusReason: "direct_probe_pending",
            statusDetail: "Identité créée ; attente du premier préflight signé.",
          }),
        status: "checking",
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
      return {
        installation,
        secrets,
        previousFingerprints: previousIdentities.map((entry) => entry.fingerprint),
      };
    });
    // Le résolveur garde les secrets en mémoire quelques secondes : sans cette purge,
    // la Console continuerait de signer avec la génération précédente juste après
    // l'enrôlement.
    invalidateInstallationSecrets(result.installation.installationKey);
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    // La révocation d'empreintes vise `/v1/relay/admin/revoke`, servi par le Relay
    // seul. Sur une installation directe, l'appel tomberait sur l'Edge lui-même, qui
    // ne sert pas cette route : l'installation serait marquée `degraded` pour une
    // propagation qui n'a aucun sens ici. L'ancienne identité est déjà révoquée en
    // base, et l'ancien secret déclassé — il n'y a rien à propager.
    const previousRevocation = result.installation.transport === "relay"
      && result.previousFingerprints.length
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
    // Le credential et l'URL de Relay ne concernent que le tunnel sortant. Les
    // renvoyer à un Edge direct le ferait composer un Relay inexistant ; l'Edge les
    // exige d'ailleurs ensemble ou pas du tout (apps/gateway/gateway/enroll.go).
    const relay = result.installation.transport === "relay"
      ? {
        credential: signRelayIdentity({
          tenantId: result.installation.tenantId,
          installationId: result.installation.id,
          installationKey: result.installation.installationKey,
          fingerprint: identity.fingerprint,
          expiresAt,
        }),
        credentialExpiresAt: expiresAt.toISOString(),
        relayUrl: process.env.HERMES_RELAY_URL ?? "wss://127.0.0.1:8790/v1/relay/connect",
      }
      : {};
    return NextResponse.json({
      installationId: result.installation.id,
      tenantId: result.installation.tenantId,
      installationKey: result.installation.installationKey,
      ...relay,
      controlPlaneUrl: new URL(request.url).origin,
      previousIdentityRevocationPropagated: previousRevocation.propagated,
      serviceSecret: result.secrets.service,
      ticketSecret: result.secrets.ticket,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "enrollment_failed";
    if (code === "invalid_or_consumed_token") {
      return NextResponse.json({ error: "Jeton expiré, révoqué ou déjà consommé." }, { status: 401 });
    }
    return NextResponse.json({ error: "Enrôlement impossible." }, { status: 400 });
  }
}
