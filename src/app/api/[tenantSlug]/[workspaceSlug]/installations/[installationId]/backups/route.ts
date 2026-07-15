import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditEvents, runtimeBackups, runtimeCapabilities, runtimeInstallations, runtimeOperations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { runtimeInstallationById } from "@/lib/hermes/installations";
import { runHermesBackupCommand } from "@/lib/hermes/server";
import { canConfigureRuntime, getWorkspaceAccessBySlugs } from "@/lib/workspace";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; installationId: string }> },
) {
  const { tenantSlug, workspaceSlug, installationId } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role)) return NextResponse.json({ error: "Seul un Owner peut gérer les sauvegardes." }, { status: 403 });
  const [[installation], [capability]] = await Promise.all([
    db.select().from(runtimeInstallations).where(and(eq(runtimeInstallations.id, installationId), eq(runtimeInstallations.tenantId, access.tenant.id))).limit(1),
    db.select().from(runtimeCapabilities).where(eq(runtimeCapabilities.installationId, installationId)).limit(1),
  ]);
  if (!installation) return NextResponse.json({ error: "Installation introuvable." }, { status: 404 });
  if (installation.managementLevel !== "managed") return NextResponse.json({ error: "Installation non managée." }, { status: 403 });
  const body = await request.json().catch(() => null) as { action?: unknown; profile?: unknown; backupId?: unknown; sourceInstallationId?: unknown; includeSecrets?: unknown; retentionDays?: unknown; confirmed?: unknown } | null;
  const action = body?.action;
  const profile = typeof body?.profile === "string" ? body.profile : capability?.profiles[0]?.name ?? "default";
  const backupId = typeof body?.backupId === "string" ? body.backupId : "";
  const sourceInstallationId = typeof body?.sourceInstallationId === "string" ? body.sourceInstallationId : installationId;
  const retentionDays = typeof body?.retentionDays === "number" && Number.isInteger(body.retentionDays) && body.retentionDays >= 1 && body.retentionDays <= 365 ? body.retentionDays : 30;
  const requiredFeature = action === "restore" ? "runtime.backup.restore" : action === "verify" ? "runtime.backup.verify" : "runtime.backup";
  if (!capability?.features.includes(requiredFeature) || (action !== "create" && action !== "verify" && action !== "restore")) {
    return NextResponse.json({ error: "Capacité de sauvegarde non annoncée par le Edge." }, { status: 403 });
  }
  if (action === "restore" && body?.confirmed !== true) {
    return NextResponse.json({ error: "Confirmation explicite requise avant restauration." }, { status: 400 });
  }
  if (!capability.profiles.some((candidate) => candidate.name === profile)) return NextResponse.json({ error: "Profil non découvert." }, { status: 400 });
  if (action !== "create" && !backupId) return NextResponse.json({ error: "Sauvegarde cible requise." }, { status: 400 });
  const resolved = await runtimeInstallationById(installationId);
  const [operation] = await db.insert(runtimeOperations).values({
    installationId, workspaceId: access.workspace.id, type: `backup_${action}`, status: "running",
    initiatedByUserId: user.id, startedAt: new Date(), steps: [{ name: "validation", status: "succeeded" }],
  }).returning();
  let affectedBackupId: string | null = null;
  let safetyBackupId: string | null = null;
  try {
    let targetBackupId = backupId;
    let backupRow: typeof runtimeBackups.$inferSelect | null = null;
    if (action === "create") {
      [backupRow] = await db.insert(runtimeBackups).values({
        installationId, profileName: profile, status: "running", encrypted: true,
        retentionUntil: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
        secretsPolicy: body?.includeSecrets === true ? "encrypted" : "excluded", createdByUserId: user.id,
      }).returning();
      targetBackupId = backupRow.id;
      affectedBackupId = backupRow.id;
    } else {
      [backupRow] = await db.select().from(runtimeBackups).where(and(
        eq(runtimeBackups.id, backupId), eq(runtimeBackups.installationId, sourceInstallationId),
      )).limit(1);
      if (!backupRow) throw new Error("Sauvegarde introuvable pour cette installation.");
      affectedBackupId = backupRow.id;
      const [sourceInstallation] = await db.select({ id: runtimeInstallations.id }).from(runtimeInstallations).where(and(
        eq(runtimeInstallations.id, sourceInstallationId), eq(runtimeInstallations.tenantId, access.tenant.id),
      )).limit(1);
      if (!sourceInstallation) throw new Error("Installation source inaccessible.");
    }

    const steps: Array<{ name: string; status: string; detail?: string }> = [{ name: "validation", status: "succeeded" }];
    if (action === "restore") {
      const [safety] = await db.insert(runtimeBackups).values({
        installationId, profileName: profile, status: "running", encrypted: true, retentionUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        secretsPolicy: "excluded", createdByUserId: user.id,
      }).returning();
      safetyBackupId = safety.id;
      const safetyResult = await runHermesBackupCommand(resolved, { action: "create", profile, backupId: safety.id });
      await db.update(runtimeBackups).set({
        status: "ready", storageRef: safetyResult.storageRef, checksumSha256: safetyResult.checksumSha256,
        sizeBytes: safetyResult.sizeBytes, verifiedAt: new Date(),
      }).where(eq(runtimeBackups.id, safety.id));
      steps.push({ name: "safety_backup", status: "succeeded", detail: safety.id });
    }
    const result = await runHermesBackupCommand(resolved, { action, profile, backupId: targetBackupId, includeSecrets: body?.includeSecrets === true });
    const now = new Date();
    if (action === "restore" && sourceInstallationId !== installationId) {
      await db.insert(runtimeBackups).values({
        installationId, profileName: profile, status: "ready", encrypted: true, storageRef: result.storageRef,
        checksumSha256: result.checksumSha256, sizeBytes: result.sizeBytes,
        secretsPolicy: backupRow.secretsPolicy, verifiedAt: result.verified ? now : null,
        restoredAt: now, retentionUntil: backupRow.retentionUntil, createdByUserId: user.id,
      });
    } else {
      await db.update(runtimeBackups).set({
        status: "ready", storageRef: result.storageRef, checksumSha256: result.checksumSha256,
        sizeBytes: result.sizeBytes, verifiedAt: result.verified ? now : null,
        restoredAt: action === "restore" ? now : backupRow.restoredAt,
      }).where(eq(runtimeBackups.id, targetBackupId));
    }
    steps.push({ name: action, status: "succeeded" });
    const [completed] = await db.update(runtimeOperations).set({
      status: "succeeded", completedAt: now, backupId: targetBackupId, steps,
    }).where(eq(runtimeOperations.id, operation.id)).returning();
    await db.insert(auditEvents).values({
      tenantId: access.tenant.id, workspaceId: access.workspace.id, actorUserId: user.id,
      action: `runtime_backup.${action}`, targetType: "runtime_installation", targetId: installationId,
      metadata: { backupId: targetBackupId, sourceInstallationId, safetyBackupId, profile, secretsPolicy: result.secretsPolicy },
    });
    return NextResponse.json({ operation: completed, backupId: targetBackupId, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Opération de sauvegarde impossible.";
    await db.update(runtimeOperations).set({ status: "failed", completedAt: new Date(), errorCode: "backup_failed", errorMessage: message }).where(eq(runtimeOperations.id, operation.id));
    if (affectedBackupId) {
      await db.update(runtimeBackups).set({ status: "failed" }).where(and(
        eq(runtimeBackups.id, affectedBackupId),
        eq(runtimeBackups.status, "running"),
      ));
    }
    if (safetyBackupId) {
      await db.update(runtimeBackups).set({ status: "failed" }).where(and(
        eq(runtimeBackups.id, safetyBackupId),
        eq(runtimeBackups.status, "running"),
      ));
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
