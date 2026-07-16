import { z } from "zod";
import { NextResponse } from "next/server";
import { resolveWorkspaceIntervention } from "@/modules/work/infrastructure/work-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const schema = z.object({ decision: z.enum(["approved", "rejected", "answered", "cancelled"]), answer: z.string().max(10_000).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; interventionId: string }> }) {
  try {
    const { tenantSlug, workspaceSlug, interventionId } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug, "member");
    const body = schema.parse(await readJson(request));
    return NextResponse.json({ intervention: await resolveWorkspaceIntervention({ context, interventionId, ...body }) });
  } catch (error) { return workErrorResponse(error); }
}
