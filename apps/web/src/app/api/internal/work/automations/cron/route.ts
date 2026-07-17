import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { workAutomations, workspaces } from "@/db/schema";
import { triggerWorkspaceAutomation } from "@/modules/work/infrastructure/work-service";
import { sweepExpiredLeases } from "@/modules/work/infrastructure/work-runtime-service";

function authorized(request: Request) {
  const expected = process.env.WORK_AUTOMATION_CRON_SECRET?.trim() ?? "";
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!expected || !token) return false;
  const left = createHash("sha256").update(expected).digest();
  const right = createHash("sha256").update(token).digest();
  return timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!process.env.WORK_AUTOMATION_CRON_SECRET) return Response.json({ error: "Scheduler Work non configuré." }, { status: 503 });
  if (!authorized(request)) return Response.json({ error: "Non autorisé." }, { status: 401 });
  const now = new Date();
  const due = await db.select({ automation: workAutomations, tenantId: workspaces.tenantId })
    .from(workAutomations)
    .innerJoin(workspaces, eq(workspaces.id, workAutomations.workspaceId))
    .where(and(eq(workAutomations.triggerType, "cron"), eq(workAutomations.status, "active"), lte(workAutomations.nextTriggerAt, now)))
    .limit(100);
  const results: Array<{ automationId: string; created: boolean; error?: string }> = [];
  for (const row of due) {
    const scheduledAt = row.automation.nextTriggerAt ?? now;
    const everyMinutes = Number((row.automation.triggerConfig as Record<string, unknown>).everyMinutes);
    try {
      const result = await triggerWorkspaceAutomation({
        context: {
          tenantId: row.tenantId,
          workspaceId: row.automation.workspaceId,
          workspaceSlug: "cron",
          userId: row.automation.createdByUserId,
          role: "owner",
        },
        automationId: row.automation.id,
        idempotencyKey: `cron:${row.automation.id}:${scheduledAt.toISOString()}`,
        safePayload: { scheduledAt: scheduledAt.toISOString() },
      });
      results.push({ automationId: row.automation.id, created: result.created });
    } catch (error) {
      results.push({ automationId: row.automation.id, created: false, error: error instanceof Error ? error.message : "Échec inconnu" });
    } finally {
      await db.update(workAutomations).set({
        nextTriggerAt: new Date(Math.max(now.getTime(), scheduledAt.getTime()) + everyMinutes * 60_000),
        updatedAt: new Date(),
      }).where(eq(workAutomations.id, row.automation.id));
    }
  }
  // Recover runs orphaned by an offline edge (no /claim call sweeps them otherwise).
  const leasesSwept = await sweepExpiredLeases();
  return Response.json({ processed: results.length, results, leasesSwept });
}
