import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, auditEvents, runtimeCapabilities, runtimeInstallations, runtimeUsageSamples } from "@/db/schema";
import type { InstallationRepositoryPort } from "../application/ports";

export const drizzleInstallationRepository: InstallationRepositoryPort = {
  async connect(input) {
    return db.transaction(async (tx) => {
      let agent: { id: string } | undefined;
      if (input.agentId) {
        [agent] = await tx.select({ id: agents.id }).from(agents).where(and(
          eq(agents.id, input.agentId), eq(agents.workspaceId, input.context.workspaceId),
        )).limit(1);
        if (!agent) throw new Error("Agent introuvable dans ce workspace.");
      }
      const [created] = await tx.insert(runtimeInstallations).values({
        tenantId: input.context.tenantId,
        name: input.name,
        installationKey: input.installationKey,
        origin: "remote_existing",
        managementLevel: input.probe.status === "incompatible" ? "external" : input.managementLevel,
        transport: "direct",
        gatewayUrl: input.gatewayUrl,
        status: input.probe.status,
        statusDetail: input.probe.statusDetail,
        statusReason: input.probe.statusReason,
        gatewayProtocolVersion: input.probe.protocolVersion,
        hermesVersion: input.probe.hermesVersion,
        detectedRuntime: input.probe.runtimeKind,
        capabilities: {
          protocolVersion: input.probe.protocolVersion,
          features: input.probe.features,
          runtimeVersion: input.probe.hermesVersion ?? undefined,
        },
        lastSeenAt: input.probe.lastSeenAt,
        createdByUserId: input.context.userId,
      }).returning();
      await tx.insert(runtimeCapabilities).values({
        installationId: created.id,
        protocolVersion: input.probe.protocolVersion,
        features: input.probe.features,
        lifecycle: input.probe.lifecycle,
        profiles: input.probe.profiles,
        limits: {},
      });
      await tx.insert(runtimeUsageSamples).values({
        installationId: created.id,
        ...input.initialCapacity,
      });
      if (agent) {
        await tx.update(agents).set({
          runtimeInstallationId: created.id,
          hermesProfileName: input.profileName,
          runtimeState: input.probe.status === "ready" ? "ready" : "setup_required",
          updatedAt: new Date(),
        }).where(eq(agents.id, agent.id));
      }
      await tx.insert(auditEvents).values({
        tenantId: input.context.tenantId,
        workspaceId: input.context.workspaceId,
        actorUserId: input.context.userId,
        action: "runtime_installation.connected",
        targetType: "runtime_installation",
        targetId: created.id,
        metadata: {
          origin: created.origin,
          transport: created.transport,
          managementLevel: created.managementLevel,
          agentId: input.agentId || null,
          profileName: input.profileName || null,
        },
      });
      return created;
    });
  },
  classifyError(error) {
    const message = error instanceof Error ? error.message : "Connexion au gateway impossible.";
    const duplicate = message.includes("runtime_installations_tenant_key_uidx");
    return { message: duplicate ? "Cette clé d’installation existe déjà." : message, status: duplicate ? 409 : 400 };
  },
};
