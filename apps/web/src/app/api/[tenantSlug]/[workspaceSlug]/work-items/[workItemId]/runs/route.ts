import { z } from "zod";
import { NextResponse } from "next/server";
import { enqueueWorkRun } from "@/modules/work/infrastructure/work-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const schema = z.object({
  triggerType: z.enum(["assignment", "mention", "automation", "rerun", "api", "delegation"]).default("rerun"),
  idempotencyKey: z.string().min(8).max(200).optional(),
  parentRunId: z.string().uuid().nullable().optional(),
  agentId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; workItemId: string }> }) {
  try {
    const { tenantSlug, workspaceSlug, workItemId } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug, "member");
    const body = schema.parse(await readJson(request).catch(() => ({})));
    const result = await enqueueWorkRun({
      context,
      workItemId,
      triggerType: body.triggerType,
      idempotencyKey: body.idempotencyKey,
      parentRunId: body.parentRunId,
      forceAgentId: body.agentId,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return workErrorResponse(error);
  }
}
