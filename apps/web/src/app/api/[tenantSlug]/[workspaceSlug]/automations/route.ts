import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createWorkspaceAutomation, listWorkspaceAutomationRuns, listWorkspaceAutomations } from "@/modules/work/infrastructure/work-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const schema = z.object({
  name: z.string().min(1).max(160),
  triggerType: z.enum(["cron", "webhook", "event", "manual"]),
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  timezone: z.string().max(64).optional(),
  workItemTemplate: z.object({
    title: z.string().min(1).max(240),
    description: z.string().max(40_000).optional(),
    priority: z.enum(["none", "low", "medium", "high", "urgent"]).optional(),
    reviewPolicy: z.enum(["none", "optional", "required"]).optional(),
  }),
  assignee: z.object({
    type: z.enum(["user", "agent", "team"]),
    userId: z.string().uuid().nullable().optional(),
    agentId: z.string().uuid().nullable().optional(),
    teamId: z.string().uuid().nullable().optional(),
  }),
  projectId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
  dedupePolicy: z.record(z.string(), z.unknown()).optional(),
  concurrencyPolicy: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> }) {
  try {
    const { tenantSlug, workspaceSlug } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug);
    const [automations, history] = await Promise.all([
      listWorkspaceAutomations(context.workspaceId),
      listWorkspaceAutomationRuns(context.workspaceId),
    ]);
    return NextResponse.json({ automations, history });
  } catch (error) { return workErrorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> }) {
  try {
    const { tenantSlug, workspaceSlug } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug, "owner");
    const body = schema.parse(await readJson(request));
    let webhookSecret: string | undefined;
    const triggerConfig = { ...(body.triggerConfig ?? {}) };
    delete triggerConfig.webhookSecret;
    delete triggerConfig.webhookSecretHash;
    if (body.triggerType === "webhook") {
      webhookSecret = randomBytes(32).toString("base64url");
      triggerConfig.webhookSecretHash = createHash("sha256").update(webhookSecret).digest("hex");
    }
    const automation = await createWorkspaceAutomation({ context, ...body, triggerConfig });
    return NextResponse.json({ automation, ...(webhookSecret ? { webhookSecret } : {}) }, { status: 201 });
  } catch (error) { return workErrorResponse(error); }
}
