import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  agents,
  auditEvents,
  runtimeBackups,
  runtimeBudgets,
  runtimeCapabilities,
  runtimeEnrollmentTokens,
  runtimeIdentities,
  runtimeInstallations,
  runtimeOperations,
  runtimeUsageSamples,
  type RuntimeManagementLevel,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { probeGateway, testGatewayProfile } from "@/lib/hermes/gateway-preflight";
import { revokeEdgeTickets, revokeRelayFingerprints } from "@/lib/hermes/relay-admin";
import { capacityRecommendationFromUsage, capacitySample } from "@/lib/hermes/runtime-policy";
import { canConfigureRuntime, getWorkspaceAccessBySlugs } from "@/lib/workspace";

async function installationAccess(tenantSlug: string, workspaceSlug: string, installationId: string, userId: string) {
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, userId);
  if (!access) return null;
  const [installation] = await db.select().from(runtimeInstallations).where(and(
    eq(runtimeInstallations.id, installationId),
    eq(runtimeInstallations.tenantId, access.tenant.id),
  )).limit(1);
  return installation ? { access, installation } : null;
}

export async function getInstallationDetails(
  params: Promise<{ tenantSlug: string; workspaceSlug: string; installationId: string }>,
) {
  const { tenantSlug, workspaceSlug, installationId } = await params;
  const user = await requireUser();
  const context = await installationAccess(tenantSlug, workspaceSlug, installationId, user.id);
  if (!context) return NextResponse.json({ error: "Installation introuvable." }, { status: 404 });
  const [capability, assignedAgents, budget, latestUsage, operations, backups, identities] = await Promise.all([
    db.select().from(runtimeCapabilities).where(eq(runtimeCapabilities.installationId, installationId)).limit(1).then((rows) => rows[0] ?? null),
    db.select({ id: agents.id, name: agents.name, profileName: agents.hermesProfileName, state: agents.runtimeState })
      .from(agents)
      .where(and(eq(agents.workspaceId, context.access.workspace.id), eq(agents.runtimeInstallationId, installationId))),
    db.select().from(runtimeBudgets).where(eq(runtimeBudgets.installationId, installationId)).limit(1).then((rows) => rows[0] ?? null),
    db.select().from(runtimeUsageSamples).where(eq(runtimeUsageSamples.installationId, installationId))
      .orderBy(desc(runtimeUsageSamples.sampledAt)).limit(1).then((rows) => rows[0] ?? null),
    db.select().from(runtimeOperations).where(eq(runtimeOperations.installationId, installationId))
      .orderBy(desc(runtimeOperations.createdAt)).limit(20),
    db.select().from(runtimeBackups).where(eq(runtimeBackups.installationId, installationId))
      .orderBy(desc(runtimeBackups.createdAt)).limit(20),
    db.select({ fingerprint: runtimeIdentities.fingerprint, status: runtimeIdentities.status, expiresAt: runtimeIdentities.expiresAt })
      .from(runtimeIdentities).where(eq(runtimeIdentities.installationId, installationId)),
  ]);
  return NextResponse.json({
    installation: context.installation,
    capability,
    agents: assignedAgents,
    budget,
    latestUsage,
    operations,
    backups,
    identities,
  });
}

export async function updateInstallation(
  body: {
    name?: unknown;
    managementLevel?: unknown;
    archived?: unknown;
    agentId?: unknown;
    profileName?: unknown;
  } | null,
  params: Promise<{ tenantSlug: string; workspaceSlug: string; installationId: string }>,
) {
  const { tenantSlug, workspaceSlug, installationId } = await params;
  const user = await requireUser();
  const context = await installationAccess(tenantSlug, workspaceSlug, installationId, user.id);
  if (!context) return NextResponse.json({ error: "Installation introuvable." }, { status: 404 });
  if (!canConfigureRuntime(context.access.role)) {
    return NextResponse.json({ error: "Seul un Owner peut modifier une installation." }, { status: 403 });
  }
  if (!body) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  try {
    if (typeof body.archived === "boolean") {
      if (body.archived) {
        const assigned = await db.select({ id: agents.id }).from(agents)
          .where(eq(agents.runtimeInstallationId, installationId)).limit(1);
        if (assigned.length > 0) {
          return NextResponse.json({
            error: "Réassignez les agents avant de déconnecter cette installation.",
            code: "agents_still_assigned",
          }, { status: 409 });
        }
        const now = new Date();
        const activeIdentities = await db.select({ fingerprint: runtimeIdentities.fingerprint })
          .from(runtimeIdentities).where(and(
            eq(runtimeIdentities.installationId, installationId),
            inArray(runtimeIdentities.status, ["active", "rotating"]),
          ));
        const [installation] = await db.transaction(async (tx) => {
          const [updated] = await tx.update(runtimeInstallations).set({
            archivedAt: now,
            status: "revoked",
            statusReason: "owner_disconnected",
            statusDetail: "Installation déconnectée sans supprimer les données Hermes.",
            updatedAt: now,
          }).where(eq(runtimeInstallations.id, installationId)).returning();
          await tx.update(runtimeIdentities).set({ status: "revoked", revokedAt: now, updatedAt: now })
            .where(eq(runtimeIdentities.installationId, installationId));
          await tx.update(runtimeEnrollmentTokens).set({ revokedAt: now })
            .where(eq(runtimeEnrollmentTokens.installationId, installationId));
          await tx.insert(auditEvents).values({
            tenantId: context.access.tenant.id,
            workspaceId: context.access.workspace.id,
            actorUserId: user.id,
            action: "runtime_installation.disconnected",
            targetType: "runtime_installation",
            targetId: installationId,
            metadata: { dataDeleted: false },
          });
          return [updated];
        });
        const ticketsRevoked = await revokeEdgeTickets({
          gatewayUrl: installation.gatewayUrl,
          installationKey: installation.installationKey,
        });
        const relayRevocation = installation.transport === "relay"
          ? await revokeRelayFingerprints({
            gatewayUrl: installation.gatewayUrl,
            installationId: installation.id,
            installationKey: installation.installationKey,
            fingerprints: activeIdentities.map((identity) => identity.fingerprint),
          })
          : { propagated: true as const };
        if (!relayRevocation.propagated) {
          await db.insert(auditEvents).values({
            tenantId: context.access.tenant.id,
            workspaceId: context.access.workspace.id,
            actorUserId: user.id,
            action: "runtime_identity.revocation_propagation_failed",
            targetType: "runtime_installation",
            targetId: installationId,
          });
        }
        return NextResponse.json({ installation, relayRevocation, ticketsRevoked });
      }
      const probe = await probeGateway(context.installation.gatewayUrl, context.installation.installationKey);
      if (probe.status === "ready") {
        const validationProfile = probe.profiles[0]?.name;
        if (!validationProfile || !probe.features.includes("runtime.profile-test")) {
          probe.status = "degraded";
          probe.statusReason = "profile_validation_unavailable";
          probe.statusDetail = "Le Edge ne permet pas encore de valider un profil sans laisser de session résiduelle.";
        } else {
          await testGatewayProfile(context.installation.gatewayUrl, context.installation.installationKey, validationProfile);
        }
      }
      const [installation] = await db.update(runtimeInstallations).set({
        archivedAt: null,
        status: probe.status,
        statusDetail: probe.statusDetail,
        statusReason: probe.statusReason,
        gatewayProtocolVersion: probe.protocolVersion,
        hermesVersion: probe.hermesVersion,
        detectedRuntime: probe.runtimeKind,
        lastSeenAt: probe.lastSeenAt,
        updatedAt: new Date(),
      }).where(eq(runtimeInstallations.id, installationId)).returning();
      await db.insert(runtimeCapabilities).values({
        installationId,
        protocolVersion: probe.protocolVersion,
        features: probe.features,
        lifecycle: probe.lifecycle,
        profiles: probe.profiles,
        limits: {},
      }).onConflictDoUpdate({
        target: runtimeCapabilities.installationId,
        set: {
          protocolVersion: probe.protocolVersion,
          features: probe.features,
          lifecycle: probe.lifecycle,
          profiles: probe.profiles,
          negotiatedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await db.insert(runtimeUsageSamples).values({
        installationId,
        ...capacitySample(probe.system, probe.profiles.length),
      });
      await db.insert(auditEvents).values({
        tenantId: context.access.tenant.id,
        workspaceId: context.access.workspace.id,
        actorUserId: user.id,
        action: "runtime_installation.reconnected",
        targetType: "runtime_installation",
        targetId: installationId,
      });
      return NextResponse.json({ installation });
    }

    if (typeof body.agentId === "string" || typeof body.profileName === "string") {
      const agentId = typeof body.agentId === "string" ? body.agentId : "";
      const profileName = typeof body.profileName === "string" ? body.profileName.trim() : "";
      const [[agent], [capability], [latestUsage]] = await Promise.all([
        db.select({ id: agents.id }).from(agents).where(and(
          eq(agents.id, agentId),
          eq(agents.workspaceId, context.access.workspace.id),
        )).limit(1),
        db.select().from(runtimeCapabilities).where(eq(runtimeCapabilities.installationId, installationId)).limit(1),
        db.select().from(runtimeUsageSamples).where(eq(runtimeUsageSamples.installationId, installationId))
          .orderBy(desc(runtimeUsageSamples.sampledAt)).limit(1),
      ]);
      if (!agent) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });
      if (!capability?.profiles.some((profile) => profile.name === profileName)) {
        return NextResponse.json({ error: "Profil non découvert sur cette installation." }, { status: 400 });
      }
      const limits = capability.limits ?? {};
      if (latestUsage && limits.maxActiveSessions && (latestUsage.activeSessionCount ?? 0) >= limits.maxActiveSessions) {
        return NextResponse.json({ error: "Capacité de sessions actives atteinte. Redimensionnement ou arrêt de charge requis.", code: "active_session_capacity_reached" }, { status: 409 });
      }
      if (latestUsage && capacityRecommendationFromUsage(latestUsage, limits.headroomPercent ?? 20).saturated) {
        return NextResponse.json({ error: "Headroom CPU/RAM/disque insuffisant pour associer une nouvelle charge.", code: "capacity_headroom_exceeded" }, { status: 409 });
      }
      const [updated] = await db.update(agents).set({
        runtimeInstallationId: installationId,
        hermesProfileName: profileName,
        runtimeState: context.installation.status === "ready" ? "ready" : "setup_required",
        updatedAt: new Date(),
      }).where(eq(agents.id, agent.id)).returning();
      await db.insert(auditEvents).values({
        tenantId: context.access.tenant.id,
        workspaceId: context.access.workspace.id,
        actorUserId: user.id,
        action: "runtime_installation.agent_assigned",
        targetType: "agent",
        targetId: updated.id,
        metadata: { installationId, profileName },
      });
      return NextResponse.json({ agent: updated });
    }

    const updates: { name?: string; managementLevel?: RuntimeManagementLevel; updatedAt: Date } = { updatedAt: new Date() };
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name || name.length > 100) return NextResponse.json({ error: "Nom invalide." }, { status: 400 });
      updates.name = name;
    }
    if (typeof body.managementLevel === "string") {
      if (!(["external", "connected", "managed"] as const).includes(body.managementLevel as RuntimeManagementLevel)) {
        return NextResponse.json({ error: "Niveau de gestion invalide." }, { status: 400 });
      }
      const requested = body.managementLevel as RuntimeManagementLevel;
      if (requested === "managed" && context.installation.origin === "remote_existing") {
        return NextResponse.json({ error: "Une installation existante doit être enrôlée comme managée avant ce niveau." }, { status: 400 });
      }
      if (requested === "connected") {
        const [capability] = await db.select().from(runtimeCapabilities)
          .where(eq(runtimeCapabilities.installationId, installationId)).limit(1);
        if (!capability?.lifecycle.includes("restart")) {
          return NextResponse.json({ error: "Le Edge ne permet pas le redémarrage." }, { status: 400 });
        }
      }
      updates.managementLevel = requested;
    }
    const [installation] = await db.update(runtimeInstallations).set(updates)
      .where(eq(runtimeInstallations.id, installationId)).returning();
    await db.insert(auditEvents).values({
      tenantId: context.access.tenant.id,
      workspaceId: context.access.workspace.id,
      actorUserId: user.id,
      action: "runtime_installation.updated",
      targetType: "runtime_installation",
      targetId: installationId,
      metadata: { name: updates.name, managementLevel: updates.managementLevel },
    });
    return NextResponse.json({ installation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Modification impossible.";
    const duplicate = message.includes("agents_installation_profile_uidx");
    return NextResponse.json({
      error: duplicate ? "Ce profil est déjà associé à un autre agent sur cette installation." : message,
    }, { status: duplicate ? 409 : 400 });
  }
}
