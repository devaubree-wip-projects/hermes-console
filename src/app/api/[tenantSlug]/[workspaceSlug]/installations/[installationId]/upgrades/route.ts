import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditEvents, runtimeBackups, runtimeCapabilities, runtimeInstallations, runtimeOperations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { probeGateway } from "@/lib/hermes/gateway-preflight";
import { runtimeInstallationById } from "@/lib/hermes/installations";
import { runHermesBackupCommand, runHermesUpgradeCommand } from "@/lib/hermes/server";
import { canConfigureRuntime, getWorkspaceAccessBySlugs } from "@/lib/workspace";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; installationId: string }> },
) {
  const { tenantSlug, workspaceSlug, installationId } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role)) return NextResponse.json({ error: "Confirmation Owner requise." }, { status: 403 });
  const [[installation], [capability]] = await Promise.all([
    db.select().from(runtimeInstallations).where(and(eq(runtimeInstallations.id, installationId), eq(runtimeInstallations.tenantId, access.tenant.id))).limit(1),
    db.select().from(runtimeCapabilities).where(eq(runtimeCapabilities.installationId, installationId)).limit(1),
  ]);
  if (!installation) return NextResponse.json({ error: "Installation introuvable." }, { status: 404 });
  if (installation.managementLevel !== "managed") return NextResponse.json({ error: "Installation non managée." }, { status: 403 });
  const body = await request.json().catch(() => null) as { action?: unknown; targetVersion?: unknown; profile?: unknown; operationId?: unknown; confirmed?: unknown } | null;
  const action = body?.action;
  const profile = typeof body?.profile === "string" ? body.profile : capability?.profiles[0]?.name ?? "default";
  if (action !== "upgrade" && action !== "rollback") return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  if (body?.confirmed !== true) return NextResponse.json({ error: "Confirmation explicite requise." }, { status: 400 });
  const feature = action === "upgrade" ? "runtime.upgrade" : "runtime.rollback";
  if (
    !capability?.features.includes(feature)
    || !capability.features.includes("runtime.backup.restore")
    || (action === "upgrade" && !capability.features.includes("runtime.backup"))
  ) return NextResponse.json({ error: "Upgrade, backup ou rollback non annoncé par le Edge." }, { status: 403 });
  const resolved = await runtimeInstallationById(installationId);

  let targetVersion = typeof body?.targetVersion === "string" ? body.targetVersion : "";
  let sourceOperation: typeof runtimeOperations.$inferSelect | null = null;
  if (action === "rollback") {
    const operationId = typeof body?.operationId === "string" ? body.operationId : "";
    [sourceOperation] = await db.select().from(runtimeOperations).where(and(
      eq(runtimeOperations.id, operationId), eq(runtimeOperations.installationId, installationId),
    )).limit(1);
    if (!sourceOperation?.sourceVersion || !sourceOperation.backupId) return NextResponse.json({ error: "Rollback ou sauvegarde source introuvable." }, { status: 400 });
    targetVersion = sourceOperation.sourceVersion;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,127}$/.test(targetVersion)) return NextResponse.json({ error: "Version cible invalide." }, { status: 400 });

  const [operation] = await db.insert(runtimeOperations).values({
    installationId, workspaceId: access.workspace.id, type: action,
    sourceVersion: installation.hermesVersion, targetVersion, status: "running", initiatedByUserId: user.id,
    startedAt: new Date(), steps: [{ name: "preflight", status: "running" }],
  }).returning();
  let mutationStarted = false;
  let createdBackupId: string | null = null;
  try {
    const preflight = await probeGateway(installation.gatewayUrl, installation.installationKey);
    if (preflight.status !== "ready") throw new Error("Préflight refusé : le runtime n’est pas prêt.");
    await runHermesUpgradeCommand(resolved, { action: "preflight", profile, targetVersion });
    const steps: Array<{ name: string; status: string; detail?: string }> = [{ name: "preflight", status: "succeeded" }];
    let backupId: string;
    if (action === "upgrade") {
      const [backup] = await db.insert(runtimeBackups).values({
        installationId, profileName: profile, status: "running", encrypted: true, secretsPolicy: "excluded", createdByUserId: user.id,
        retentionUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }).returning();
      backupId = backup.id;
      createdBackupId = backup.id;
      const backupResult = await runHermesBackupCommand(resolved, { action: "create", profile, backupId });
      await db.update(runtimeBackups).set({ status: "ready", storageRef: backupResult.storageRef, checksumSha256: backupResult.checksumSha256, sizeBytes: backupResult.sizeBytes, verifiedAt: new Date() }).where(eq(runtimeBackups.id, backupId));
      steps.push({ name: "backup", status: "succeeded", detail: backupId });
    } else {
      backupId = sourceOperation!.backupId!;
    }
    await db.update(runtimeInstallations).set({ status: "upgrading", statusReason: action, statusDetail: `${action} vers ${targetVersion}`, updatedAt: new Date() }).where(eq(runtimeInstallations.id, installationId));
    mutationStarted = true;
    await runHermesUpgradeCommand(resolved, { action, profile, targetVersion });
    steps.push({ name: action, status: "succeeded", detail: targetVersion });
    if (action === "rollback") {
      await runHermesBackupCommand(resolved, { action: "restore", profile, backupId });
      steps.push({ name: "data_restore", status: "succeeded", detail: backupId });
    }
    const after = await probeGateway(installation.gatewayUrl, installation.installationKey);
    if (after.status !== "ready" || after.hermesVersion !== targetVersion) throw new Error(`Validation post-opération échouée : version observée ${after.hermesVersion ?? "inconnue"}.`);
    const now = new Date();
    await db.update(runtimeInstallations).set({ status: "ready", statusReason: null, statusDetail: null, hermesVersion: after.hermesVersion, lastSeenAt: after.lastSeenAt, updatedAt: now }).where(eq(runtimeInstallations.id, installationId));
    const [completed] = await db.update(runtimeOperations).set({ status: "succeeded", backupId, completedAt: now, steps }).where(eq(runtimeOperations.id, operation.id)).returning();
    await db.insert(auditEvents).values({ tenantId: access.tenant.id, workspaceId: access.workspace.id, actorUserId: user.id, action: `runtime_upgrade.${action}`, targetType: "runtime_installation", targetId: installationId, metadata: { operationId: operation.id, backupId, sourceVersion: installation.hermesVersion, targetVersion } });
    return NextResponse.json({ operation: completed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upgrade impossible.";
    const [failed] = await db.update(runtimeOperations).set({ status: "failed", completedAt: new Date(), errorCode: "upgrade_failed", errorMessage: message }).where(eq(runtimeOperations.id, operation.id)).returning();
    if (createdBackupId) {
      await db.update(runtimeBackups).set({ status: "failed" }).where(and(
        eq(runtimeBackups.id, createdBackupId),
        eq(runtimeBackups.status, "running"),
      ));
    }
    if (mutationStarted) {
      await db.update(runtimeInstallations).set({ status: "rollback_required", statusReason: "upgrade_failed", statusDetail: message, updatedAt: new Date() }).where(eq(runtimeInstallations.id, installationId));
    }
    return NextResponse.json({ error: message, operation: failed }, { status: 502 });
  }
}
