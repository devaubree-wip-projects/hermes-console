import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { workAutomations, workspaces } from "@/db/schema";
import { triggerWorkspaceAutomation, WorkConflictError, WorkNotFoundError } from "@/modules/work/infrastructure/work-service";
import { workErrorResponse, WorkHttpError } from "@/modules/work/presentation/http";

export async function POST(request: Request, { params }: { params: Promise<{ automationId: string }> }) {
  try {
    const { automationId } = await params;
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 64_000) throw new WorkHttpError(413, "Webhook trop volumineux.");
    const raw = await request.text();
    const token = (request.headers.get("x-work-hook-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "").trim();
    const [row] = await db.select({ automation: workAutomations, tenantId: workspaces.tenantId })
      .from(workAutomations)
      .innerJoin(workspaces, eq(workspaces.id, workAutomations.workspaceId))
      .where(and(eq(workAutomations.id, automationId), eq(workAutomations.triggerType, "webhook")))
      .limit(1);
    if (!row) throw new WorkNotFoundError("Webhook introuvable.");
    const config = row.automation.triggerConfig as Record<string, unknown>;
    const expected = String(config.webhookSecretHash ?? "");
    const actual = createHash("sha256").update(token).digest("hex");
    if (!token || expected.length !== actual.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
      throw new WorkHttpError(401, "Secret webhook invalide.");
    }
    if (row.automation.status !== "active") throw new WorkConflictError("Cette automatisation n’est pas active.");
    let eventId = request.headers.get("x-idempotency-key")?.trim();
    if (!eventId && raw) {
      try {
        const parsed = JSON.parse(raw) as { id?: unknown; eventId?: unknown };
        eventId = typeof parsed.eventId === "string" ? parsed.eventId : typeof parsed.id === "string" ? parsed.id : undefined;
      } catch { throw new WorkHttpError(400, "Payload webhook invalide."); }
    }
    const payloadHash = createHash("sha256").update(raw).digest("hex");
    const result = await triggerWorkspaceAutomation({
      context: {
        tenantId: row.tenantId,
        workspaceId: row.automation.workspaceId,
        workspaceSlug: "webhook",
        userId: row.automation.createdByUserId,
        role: "owner",
      },
      automationId: row.automation.id,
      idempotencyKey: `webhook:${String(eventId || payloadHash).slice(0, 180)}`,
      safePayload: { payloadSha256: payloadHash, eventId: eventId?.slice(0, 200) },
    });
    return Response.json({ created: result.created, workItemId: result.item?.id ?? null }, { status: result.created ? 201 : 200 });
  } catch (error) { return workErrorResponse(error); }
}
