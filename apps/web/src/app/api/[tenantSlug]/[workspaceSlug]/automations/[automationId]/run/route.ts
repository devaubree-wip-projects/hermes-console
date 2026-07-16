import { NextResponse } from "next/server";
import { z } from "zod";
import { triggerWorkspaceAutomation } from "@/modules/work/infrastructure/work-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const schema = z.object({
  idempotencyKey: z.string().min(1).max(240).optional(),
  safePayload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; automationId: string }> }) {
  try {
    const { tenantSlug, workspaceSlug, automationId } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug, "owner");
    const body = schema.parse(await readJson(request));
    const result = await triggerWorkspaceAutomation({ context, automationId, ...body });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) { return workErrorResponse(error); }
}
