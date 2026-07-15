import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  agents,
  auditEvents,
  runtimeCapabilities,
  runtimeInstallations,
  runtimeUsageSamples,
  type RuntimeManagementLevel,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { probeGateway, testGatewayProfile } from "@/lib/hermes/gateway-preflight";
import { validateGatewayUrl } from "@/lib/hermes/gateway-url";
import { capacityRecommendation, capacitySample } from "@/lib/hermes/runtime-policy";
import { canConfigureRuntime, getWorkspaceAccessBySlugs } from "@/lib/workspace";

const INSTALLATION_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> },
) {
  const { tenantSlug, workspaceSlug } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role)) {
    return NextResponse.json({ error: "Seul un Owner peut connecter une installation." }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as {
    name?: unknown;
    gatewayUrl?: unknown;
    installationKey?: unknown;
    agentId?: unknown;
    profileName?: unknown;
    managementLevel?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const installationKey = typeof body?.installationKey === "string" ? body.installationKey.trim() : "";
  const agentId = typeof body?.agentId === "string" ? body.agentId : "";
  const profileName = typeof body?.profileName === "string" ? body.profileName.trim() : "";
  const requestedManagement = typeof body?.managementLevel === "string" ? body.managementLevel : "external";
  const managementLevel: RuntimeManagementLevel = requestedManagement === "connected" ? "connected" : "external";
  if (!name || name.length > 100 || !INSTALLATION_KEY.test(installationKey)) {
    return NextResponse.json({ error: "Nom ou clé d’installation invalide." }, { status: 400 });
  }

  try {
    const gatewayUrl = validateGatewayUrl(typeof body?.gatewayUrl === "string" ? body.gatewayUrl.trim() : "");
    const probe = await probeGateway(gatewayUrl, installationKey);
    if (managementLevel === "connected" && !probe.lifecycle.includes("restart")) {
      return NextResponse.json({ error: "Ce Edge n’annonce pas la capacité de gestion demandée." }, { status: 400 });
    }
    if (agentId && !probe.profiles.some((profile) => profile.name === profileName)) {
      return NextResponse.json({ error: "Le profil choisi n’a pas été découvert sur cette installation." }, { status: 400 });
    }
    if (probe.status === "ready") {
      if (!probe.features.includes("runtime.profile-test")) {
        return NextResponse.json({
          error: "Ce Edge ne sait pas valider un profil avec une session éphémère nettoyée.",
        }, { status: 400 });
      }
      const validationProfile = profileName || probe.profiles[0]?.name;
      if (!validationProfile) {
        return NextResponse.json({ error: "Aucun profil Hermes ne peut être validé." }, { status: 400 });
      }
      await testGatewayProfile(gatewayUrl, installationKey, validationProfile);
    }
    const initialCapacity = capacitySample(probe.system, probe.profiles.length);
    if (agentId && capacityRecommendation(initialCapacity).saturated) {
      return NextResponse.json({
        error: "Headroom runtime insuffisant pour associer immédiatement une nouvelle charge.",
        code: "capacity_headroom_exceeded",
      }, { status: 409 });
    }
    const installation = await db.transaction(async (tx) => {
      let agent: { id: string } | undefined;
      if (agentId) {
        [agent] = await tx.select({ id: agents.id }).from(agents).where(and(
        eq(agents.id, agentId),
        eq(agents.workspaceId, access.workspace.id),
      )).limit(1);
        if (!agent) throw new Error("Agent introuvable dans ce workspace.");
      }
      const [created] = await tx.insert(runtimeInstallations).values({
        tenantId: access.tenant.id,
        name,
        installationKey,
        origin: "remote_existing",
        managementLevel: probe.status === "incompatible" ? "external" : managementLevel,
        transport: "direct",
        gatewayUrl,
        status: probe.status,
        statusDetail: probe.statusDetail,
        statusReason: probe.statusReason,
        gatewayProtocolVersion: probe.protocolVersion,
        hermesVersion: probe.hermesVersion,
        detectedRuntime: probe.runtimeKind,
        capabilities: {
          protocolVersion: probe.protocolVersion,
          features: probe.features,
          runtimeVersion: probe.hermesVersion ?? undefined,
        },
        lastSeenAt: probe.lastSeenAt,
        createdByUserId: user.id,
      }).returning();
      await tx.insert(runtimeCapabilities).values({
        installationId: created.id,
        protocolVersion: probe.protocolVersion,
        features: probe.features,
        lifecycle: probe.lifecycle,
        profiles: probe.profiles,
        limits: {},
      });
      await tx.insert(runtimeUsageSamples).values({
        installationId: created.id,
        ...initialCapacity,
      });
      if (agent) {
        await tx.update(agents).set({
          runtimeInstallationId: created.id,
          hermesProfileName: profileName,
          runtimeState: probe.status === "ready" ? "ready" : "setup_required",
          updatedAt: new Date(),
        }).where(eq(agents.id, agent.id));
      }
      await tx.insert(auditEvents).values({
        tenantId: access.tenant.id,
        workspaceId: access.workspace.id,
        actorUserId: user.id,
        action: "runtime_installation.connected",
        targetType: "runtime_installation",
        targetId: created.id,
        metadata: {
          origin: created.origin,
          transport: created.transport,
          managementLevel: created.managementLevel,
          agentId: agentId || null,
          profileName: profileName || null,
        },
      });
      return created;
    });
    return NextResponse.json({ installation }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connexion au gateway impossible.";
    const duplicate = message.includes("runtime_installations_tenant_key_uidx");
    return NextResponse.json(
      { error: duplicate ? "Cette clé d’installation existe déjà." : message },
      { status: duplicate ? 409 : 400 },
    );
  }
}
